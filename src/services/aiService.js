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
 */
export const generateAlternativeSuggestions = async ({
  conflicts,
  client,
  iclExclusions = [],
  bnRecipePool,
  clientEatingPatterns = {}
}) => {
  // Skip if no conflicts detected
  if (!conflicts || conflicts.length === 0) return [];

  // Build eating-pattern context block for the AI prompt
  const {
    recallDishes       = [],
    highFrequencyFoods = [],
    lowFrequencyFoods  = [],
    preferredCuisines  = [],
    foodPreferences    = []
  } = clientEatingPatterns;

  const eatingPatternsBlock = (recallDishes.length || highFrequencyFoods.length || preferredCuisines.length || foodPreferences.length)
    ? `
    <eating_patterns>
      Use this data to steer alternative selections toward foods the client already accepts and enjoys.

      High-Frequency Foods (Daily / Multiple times a week — PREFER alternatives from these food families):
        ${highFrequencyFoods.length ? highFrequencyFoods.join(', ') : 'None recorded'}

      Low-Frequency / Rarely Eaten (DEPRIORITISE — client is unlikely to accept these):
        ${lowFrequencyFoods.length ? lowFrequencyFoods.join(', ') : 'None recorded'}

      Food Preferences (Client-stated favourite foods — use these as positive signals):
        ${foodPreferences.length ? foodPreferences.join(', ') : 'None recorded'}

      Preferred Cuisines (Select alternatives from these cuisine traditions when possible):
        ${preferredCuisines.length ? preferredCuisines.join(', ') : 'None recorded'}

      Recent 24H Recall (Actual foods eaten — prioritise alternatives in the same food families):
        ${recallDishes.length ? recallDishes.slice(0, 8).join(' | ') : 'None recorded'}

      PRIORITY RULE: Among valid options in the BN Recipe Pool, always prefer those whose
      category or ingredients align with the client's high-frequency foods and cuisine preferences.
      Avoid suggesting foods they "Rarely" eat unless no other suitable option exists in the pool.
    </eating_patterns>`
    : '';

  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: aiSuggestionsSchema,
    temperature: 0.2,
    top_p: 0.3,
    top_k: 5,
    seed: 141,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 1024, // Reduced: RAG provides targeted context, less reasoning needed
        },
      },
    },

    system: `
 <system_instructions>
    <role>You are a Senior Diet Recovery Specialist. Your task is to suggest safe alternatives for dishes that have been flagged as conflicting with a client's diet profile. You must ONLY suggest dishes from the PROVIDED BN Recipe Pool below — never invent or hallucinate dishes.</role>
    
    <client_profile>
      - Diet Type: ${client.eating_habit}
      - Allergies: ${client.food_allergies || 'None'}
      - Aversions: ${client.food_aversions || 'None'}
      - ICL Exclusions: ${iclExclusions.length ? iclExclusions.join(', ') : 'None'}
    </client_profile>
${eatingPatternsBlock}

    <decision_rules>
      CLASSIFY each conflict into ONE of two suggestion types:

      USE "ingredient_swap" WHEN:
        - The conflict involves exactly ONE minor/non-core ingredient
        - The ingredient is NOT the defining element of the dish (e.g., a garnish, topping, or secondary component)
        - Removing or swapping it would NOT change the dish's identity
        - The conflict_type is "aversion_conflict" or "icl_conflict" with a single item
        - Example: Milk in a dosa batter → "Use water or coconut milk instead of Milk"

      USE "full_replacement" WHEN:
        - The conflicting ingredient IS the core/hero ingredient of the dish (e.g., Chicken in Chicken Tikka)
        - The conflict_type is "diet_type_violation" — the entire dish category is wrong
        - The conflict_type is "allergy_conflict" — safety-first, always replace fully
        - There are MULTIPLE conflicting ingredients in the same dish
        - Example: Chicken Tikka for a Vegetarian → suggest Paneer Tikka, Soya Tikka, etc.
    </decision_rules>

    <suggestion_rules>
      For "ingredient_swap":
        - Provide a clear, specific swap instruction (e.g., "Replace Milk with Almond Milk or Coconut Milk")
        - Do NOT include alternative_dishes — leave it empty
      
      For "full_replacement":
        - Select exactly 3 alternative dishes from the BN RECIPE POOL below
        - Each alternative MUST be a recipe from the pool (use its exact id, title, slug, and category_name)
        - Each alternative must be safe and non repetitive for ALL of the client's constraints (diet type, allergies, aversions, medical, ICL)
        
        CRITICAL — Food Type Matching Rule:
        The alternative MUST be the SAME food type/category as the conflicting dish. This is the #1 priority.
        Food type taxonomy:
          - Liquid (soup, smoothie, juice, shake, buttermilk, lassi, coffee, tea) → replace with another Liquid
          - Rice (brown rice, white rice, jeera rice, pulao) → replace with another Rice dish (at least 2 of 3 alternatives MUST be rice-based)
          - Bread/Roti (roti, paratha, naan, thepla, puri) → replace with another Bread
          - Salad (green salad, raita, kachumber) → replace with another Salad/side
          - Dal/Lentil (dal, sambar, rasam) → replace with another Dal/Lentil
          - Sabzi/Curry (any cooked vegetable/paneer dish) → replace with another Sabzi/Curry
          - Snack (cookie, chips, makhana, namkeen) → replace with another Snack
          - Full meal (biryani, khichdi, frankie, wrap, sandwich) → replace with another Full meal

        Meal Context Rule (read the "meal_context" field on each conflict):
          - "Group Alternative": The conflicting dish is part of a combo with companion dishes listed. The alternative must:
              1. Be the same food type as the conflict dish (e.g. soup → soup/liquid, rice → rice)
              2. Pair naturally with the listed companion dishes
              Example: If soup is the conflict and sandwich is the companion → suggest another liquid (smoothie, buttermilk, another soup variety) — NOT a frankie or roti
          - "Standalone Alternative": The conflicting dish is an independent option. Only match food type.
        
        - Provide a 1-line reason for why each alternative is a safe swap and matches the food type
        - Do NOT include swap_instruction — leave it empty
    </suggestion_rules>

    <grounding_rules>
      - You may ONLY select alternatives from the BN RECIPE POOL provided in the prompt
      - NEVER invent recipe names, IDs, slugs, or category_names
      - If the pool has fewer than 3 suitable recipes, return as many as you can find (1 or 2)
      - The recipe_id, title, slug, and category_name in your output MUST exactly match an entry from the pool
    </grounding_rules>
 </system_instructions>`,

    prompt: `Generate smart alternative suggestions for these flagged conflicts.

    FLAGGED CONFLICTS:
${conflicts.map(c => `- dish: "${c.dish_name}" | type: ${c.conflict_type} | ingredient: ${c.conflicting_ingredient} | context: ${c.meal_context}`).join('\n')}

    BN RECIPE POOL (id|title|category|ingredients):
${bnRecipePool.map(r => `${r.id}|${r.title}|${r.category_name}|${Array.isArray(r.ingredients) ? r.ingredients.slice(0, 5).join(',') : String(r.ingredients).slice(0, 80)}`).join('\n')}
    
    For each conflict, classify it and provide the appropriate suggestion.`
  });

  console.log('📋 AI Suggestions:', JSON.stringify(object.suggestions, null, 2));
  return object.suggestions;
};
