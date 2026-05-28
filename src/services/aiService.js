import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { aiResponseSchema, aiSuggestionsSchema } from '../validators/dietAuditValidator.js';

/**
 * Executes the AI Safety Audit
 * Grounded in BN Recipe Data to prevent hallucinations
 */
export const generateAuditInference = async ({ client, dishes, extractedNames, iclExclusions = [] }) => {
  // Prune dietary rules to only the client's relevant section — saves ~500 tokens per call
  const habit = (client.eating_habit || '').toLowerCase().trim();
  const dietaryRuleMap = {
    vegetarian: `<vegetarian>
        - STRICTLY FORBIDDEN: Meat, Poultry, Fish, Seafood, Egg.
        - ALLOWED: Dairy (Paneer, Curd, Ghee, Milk, Whey — each independent).
        - CRITICAL EXEMPTION — BRINJAL/BAINGAN/EGGPLANT: 100% vegetarian. NEVER flag as diet_type_violation.
      </vegetarian>`,
    'ovo vegetarian': `<ovo_vegetarian>
        - STRICTLY FORBIDDEN: Meat, Poultry, Fish, Seafood.
        - ALLOWED: Eggs, Dairy products.
      </ovo_vegetarian>`,
    vegan: `<vegan>
        - STRICTLY FORBIDDEN: Meat, Poultry, Fish, Seafood, Eggs, ALL Dairy products.
      </vegan>`,
    jain: `<jain>
        - STRICTLY FORBIDDEN: All items listed in "${client.avoided_jain_foods}".
        - Flag any dish containing these as "diet_type_violation".
      </jain>`,
    'non vegetarian': `<non_vegetarian>
        - ALLOWED: All foods EXCEPT stated allergies and aversions.
      </non_vegetarian>`,
    pescatarian: `<pescatarian>
        - ALLOWED: Fish, Seafood, Dairy, Eggs, all plant-based foods.
        - STRICTLY FORBIDDEN: Land animal meat (Beef, Pork, Lamb, Mutton).
      </pescatarian>`,
  };
  const activeDietRule = dietaryRuleMap[habit] || dietaryRuleMap['non vegetarian'];

  const { object } = await generateObject({
    model: google('gemini-2.5-flash'), // Efficient speed-to-reasoning ratio
    schema: aiResponseSchema,
    temperature: 0.0,
    top_p: 0.1, // Controls diversity of generated text
    top_k: 1, // Integer required; 1 = fully deterministic token selection
    seed: 140, // Ensures reproducibility
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 1024,
        },
      },
    }, // Step 6: Runtime validation

    system: `
 <system_instructions>
    <role>You are a Senior Diet Safety Auditor. Your task is to audit Dishes and Dish ingredients against a client profile to identify any conflicts with the client's Allergies, Aversions, Diet Type, and ICL Exclusions with 100% accuracy.</role>
    <client_profile>
              - Diet Type : ${client.eating_habit}
              - Allergies : ${client.food_allergies || 'None'}
              - Aversions : ${client.food_aversions || 'None'}
              - Jain Food Restrictions : ${client.avoided_jain_foods || 'None specified'}
    </client_profile>
    <audit_workflow>
      1. Initial Scan: Parse DB INGREDIENTS (Grounded) & Dishes from TEMPLATE. 
      2. De-duplication Check: If a Template dish name refers to the same dish as a Grounded Recipe (check for name overlap), PRIORITIZE the Grounded logic and IGNORE the Template entry to avoid duplicate results.
      3. Categorize Conflicts:
          - Allergy Match -> "allergy_conflict"
          - Aversion Match -> "aversion_conflict"
          - ICL Exclusion Match -> "icl_conflict"
          - Jain Food Restrictions Match -> "diet_type_violation"
      4. Consolidation: If a single dish has multiple conflicting ingredients, you MUST group them into one result for that dish. Combine the reasons into a single concise paragraph.
      5. Safety Verification Pass (Self-Correction): 
          - Re-evaluate all potential flags. 
          - If a conclusion is "Safe in moderation", "Not a conflict", or "Placeholder only" -> REMOVE from the list.
      6. Final JSON Generation: STRICTLY ONLY include verified, confirmed conflicts.
    </audit_workflow>
    <dietary_logic>   
Priority: Diet Type > Allergies > Aversions > ICL Exclusions

      ${activeDietRule}
      ${(client.food_allergies || '').toLowerCase().includes('lactose') ? `<lactose_intolerant_override>
        - EXEMPT [Curd, Yogurt, Raita, Ghee] from Lactose flags. Lactose converts to Lactic Acid in these.
      </lactose_intolerant_override>` : ''}
      </dietary_logic>
      <grounding_rules>
      - Scan through (DB INGREDIENTS {Grounded}) and (Dishes from TEMPLATE).
      - ONLY flag what is LITERALLY present in the data and dish name.
      - DO NOT infer hidden ingredients.
      - If your internal reasoning concludes "Safe" or "No Conflict", it is a CRITICAL ERROR to include it in the JSON.
      - Use canonical English names and common Indian names to spot ingredient conflicts.

      <inference_depth_rules>
        These rules govern HOW DEEPLY you may reason to reach a conflict conclusion. Apply them STRICTLY by conflict type.

        DEEP INFERENCE — Allergies (allergy_conflict) and Diet Type (diet_type_violation):
          - You MAY trace full ingredient chains and derivatives across multiple hops.
          - Example: "Besan → made from Chickpeas → Chickpeas are Pulses" is VALID if the client has a Pulse allergy or if Pulses violate their diet type (e.g., Vegan avoiding a Ghee-based dish).
          - Rationale: Allergies are a safety risk; diet type is a strict compliance requirement. Exhaustive tracing is warranted.

        SHALLOW INFERENCE — Aversions (aversion_conflict) and ICL Exclusions (icl_conflict):
          - You may ONLY flag if the conflicting item is DIRECTLY and LITERALLY named in the dish name or listed as a primary/direct ingredient — maximum ONE hop.
          - Example: If client has an aversion to "Pulses", you may flag a dish that lists "Chana" or "Rajma" as a direct ingredient. You may NOT flag "Besan" on the grounds that it is derived from Chickpeas which are Pulses — that is too many hops for an aversion.
          - Rationale: Aversions are preferences, not safety issues. Over-inference creates false positives for these lower-priority categories.
      </inference_depth_rules>
      </grounding_rules>
      <output_rules>
      - dish_name MUST be the EXACT dish name from the input list (GROUNDED RECIPES title or TEMPLATE DISH NAMES entry). DO NOT use generic labels like "ungrounded item", "template item", or any placeholder — always use the real dish name.
      - DO NOT include brackets, commas, or '/' in the dish_name output.
      - If 0 conflicts are found, return an empty conflicts array [].
      </output_rules>
      </system_instructions>`
    ,

    prompt: `Audit these dishes against the grounded database and client Profile:
         If and when Client's 'Allergy food', 'Aversion food', or 'ICL Exclusion' conflict is found in the Dish Name or its ingredients, flag it appropriately.

              GROUNDED RECIPES (Detailed ingredients from DB):
${dishes.map(d => `[${d.id}] ${d.title} | Ingredients: ${Array.isArray(d.ingredients) ? d.ingredients.join(', ') : d.ingredients}`).join('\n')}

              TEMPLATE DISH NAMES (Audit using general knowledge): ${extractedNames.join(' | ')}
              CLIENT ICL EXCLUSIONS: ${iclExclusions && iclExclusions.length ? iclExclusions.join(', ') : 'None'}`
  })
  console.log(object.conflicts);
  return object.conflicts; // Correlated results for Step 7
};

/**
 * Generates a comprehensive nutritional analysis from a scan (image or text)
 */
export const generateNutriScanAnalysis = async ({ imageBase64, textContent, client }) => {
  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: z.object({
      health_score: z.number().min(0).max(100),
      rating_label: z.string(), // e.g. "Excellent", "Good", "Needs Attention"
      motivational_text: z.string(),
      items: z.array(z.object({
        name: z.string(),
        calories: z.number(),
        tags: z.array(z.string()), // e.g. ["High Protein", "Vitamin C Rich"]
        rating: z.string() // e.g. "Excellent", "Good", "Avoid"
      })),
      pro_tip: z.string()
    }),
    system: `You are a professional Nutritionist and Health Auditor. 
      Analyze the provided scan (receipt or menu) against the client's profile.
      Client Profile:
      - Diet Type: ${client.eating_habit}
      - Allergies: ${client.food_allergies || 'None'}
      - Aversions: ${client.food_aversions || 'None'}
      
      
      Tasks:
      1. Extract all food and drink items.
      2. Estimate calories per item.
      3. Assign health tags based on nutritional profile.
      4. Calculate an overall Health Score (0-100) based on how well the items fit the client's diet and health goals.
      5. Provide a motivational "Pro Tip" for the client.`,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: textContent || "Analyze this scan for nutritional value." },
          ...(imageBase64 ? [{ type: 'image', image: imageBase64 }] : [])
        ]
      }
    ]
  });

  return object;
};

/**
 * Phase 3: Generates smart alternative suggestions for conflicting dishes
 * Uses a pre-filtered BN recipe pool (Structured RAG) to stay grounded
 * Optimised for minimal token consumption with self-correction
 */
export const generateAlternativeSuggestions = async ({
  conflicts,
  client,
  iclExclusions = [],
  bnRecipePool,
  isHeavyClient = false,
  clientEatingPatterns = {}
}) => {
  if (!conflicts || conflicts.length === 0) return [];

  // ─── Compact eating-pattern context (token-efficient) ────────────────
  const {
    recallDishes       = [],
    highFrequencyFoods = [],
    lowFrequencyFoods  = [],
    preferredCuisines  = [],
    foodPreferences    = []
  } = clientEatingPatterns;

  const hasPatterns = recallDishes.length || highFrequencyFoods.length || preferredCuisines.length;
  const patternsBlock = hasPatterns
    ? `<patterns>
      Prefer: ${[...highFrequencyFoods.slice(0, 6), ...foodPreferences.slice(0, 4)].join(', ') || '-'}
      Avoid: ${lowFrequencyFoods.slice(0, 5).join(', ') || '-'}
      Cuisines: ${preferredCuisines.slice(0, 3).join(', ') || '-'}
      Recall: ${recallDishes.slice(0, 5).join(', ') || '-'}
      RULE: Prefer pool recipes matching these patterns. Avoid low-frequency foods unless no alternative exists.
    </patterns>`
    : '';

  // ─── Weight context ──────────────────────────────────────────────────
  const cw = parseFloat(client.current_weight) || 0;
  const gw = parseFloat(client.goal_weight) || 0;
  let weightBlock = '';
  let weightDirection = 'MAINTAIN';
  if (cw && gw) {
    weightDirection = cw > gw ? 'LOSS' : cw < gw ? 'GAIN' : 'MAINTAIN';
    weightBlock = `<weight goal="${weightDirection}" current="${cw}kg" target="${gw}kg"/>`;
  }

  // ─── Heavy client rule (>100kg) ──────────────────────────────────────
  const heavyRule = isHeavyClient
    ? `<heavy_client_rule>
        Client weighs >100kg. For lunch/dinner conflicts: alternatives MUST follow the structure:
        Salad or Sabzi + 2 Roti or Rice + 50-100gms Protein.
        Protein source: ${(client.eating_habit || '').toLowerCase().includes('non') ? 'Chicken/Fish/Egg' : 'Paneer/Tofu/Dal/Soya'}.
      </heavy_client_rule>`
    : '';

  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: aiSuggestionsSchema,
    temperature: 0.15,
    top_p: 0.25,
    top_k: 3,
    seed: 141,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 800,
        },
      },
    },

    system: `<role>Senior Diet Recovery Specialist. Suggest safe alternatives for flagged conflicts. ONLY use the BN Recipe Pool provided — never invent dishes.</role>

<client diet="${client.eating_habit}" allergies="${client.food_allergies || 'None'}" aversions="${client.food_aversions || 'None'}" icl="${iclExclusions.length ? iclExclusions.join(', ') : 'None'}"/>
${weightBlock}
${patternsBlock}
${heavyRule}

<meal_rules>
  BREAKFAST conflicts:
    - Suggest 1 salt-free option + 2 regular options when possible
    - Salt-free = no added salt (e.g. fruit bowl, smoothie, overnight oats)
  LUNCH conflicts:
    - Alternatives should fit rice-based OR roti-based meal combos
    - Match the structure of the existing lunch combo (if Group context)
  DINNER conflicts:
    - Lean heavily on client's food recall and preferences
    - Dinner is flexible — prioritise familiarity over rigid structure
  WEIGHT ${weightDirection} RULE:
    - ${weightDirection === 'LOSS' ? 'Prefer lower-calorie, high-fibre, high-protein alternatives' : weightDirection === 'GAIN' ? 'Prefer calorie-dense, nutrient-rich alternatives' : 'Maintain balanced macro profile'}
</meal_rules>

<decision_rules>
  "ingredient_swap": ONE minor non-core ingredient conflict (garnish/topping). Provide swap instruction only.
  "full_replacement": Core ingredient conflict, diet_type_violation, allergy, or multiple conflicts. Select up to 3 alternatives from pool.
</decision_rules>

<food_type_matching>
  #1 PRIORITY: Alternative MUST match the same food type as the conflict dish.
  Liquid→Liquid | Rice→Rice | Bread→Bread | Salad→Salad | Dal→Dal | Sabzi→Sabzi | Snack→Snack | Full meal→Full meal
  
  Context rules (read "meal_context" on each conflict):
  - "[slot] Group": dish is part of a combo with companions. Replace with same food type that pairs with listed companions.
  - "[slot] Standalone": independent option. Match food type only.
</food_type_matching>

<grounding>
  - ONLY select from BN RECIPE POOL in prompt. Never invent IDs/titles/slugs.
  - Output recipe_id, title, slug, category_name must EXACTLY match a pool entry.
  - If <3 suitable recipes exist, return 1 or 2.
</grounding>

<self_correction>
  BEFORE finalising each suggestion, run this verification checklist:
  1. SAFE? Does the alternative contain ANY of the client's allergens, aversions, or ICL exclusions? If YES → DISCARD and pick another.
  2. TYPE MATCH? Is the alternative the same food type as the conflict dish? If NO → DISCARD and pick another.
  3. COMBO FIT? If "Group" context, does the alternative pair naturally with the listed companions? If NO → DISCARD.
  4. POOL VALID? Is the recipe_id/title/slug EXACTLY from the provided pool? If NO → DISCARD.
  5. DUPLICATE? Have you already suggested this dish for another conflict? If YES → pick a different one.
  If ALL 5 pass → include. If any fail → replace with the next best candidate from the pool.
</self_correction>`,

    prompt: `CONFLICTS:
${conflicts.map(c => `- "${c.dish_name}" | ${c.conflict_type} | ing: ${c.conflicting_ingredient || '-'} | ${c.meal_context}`).join('\n')}

POOL (id|title|cat|ingredients):
${bnRecipePool.map(r => `${r.id}|${r.title}|${r.category_name}|${Array.isArray(r.ingredients) ? r.ingredients.slice(0, 4).join(',') : String(r.ingredients).slice(0, 60)}`).join('\n')}

Classify each conflict and provide suggestions. Apply self-correction before output.`
  });

  console.log('📋 AI Suggestions:', JSON.stringify(object.suggestions, null, 2));
  return object.suggestions;
};
