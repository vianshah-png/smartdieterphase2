import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { aiResponseSchema, aiSuggestionsSchema } from '../validators/dietAuditValidator.js';

/**
 * Executes the AI Safety Audit
 * Grounded in BN Recipe Data to prevent hallucinations
 */
export const generateAuditInference = async ({ client, dishes, extractedNames, medicalIssues, iclExclusions = [] }) => {
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
          thinkingBudget: 2048, // Increased budget for nuanced medical verification
        },
      },
    }, // Step 6: Runtime validation

    system: `
 <system_instructions>
    <role>You are a Senior Diet Safety Auditor. Your task is to audit Dishes and Dish ingredients against a client profile to avoid missing any conflicts with their Allergies, Aversions, medical issues and Diet Type with 100% accuracy .</role>
    <client_profile>
              - Diet Type : ${client.eating_habit}
              - Allergies : ${client.food_allergies || 'None'}
              - Aversions : ${client.food_aversions || 'None'}
              - Medical Issues : ${medicalIssues || 'None'}
    </client_profile>
    <audit_workflow>
      1. Initial Scan: Parse DB INGREDIENTS (Grounded) & Dishes from TEMPLATE. 
      2. De-duplication Check: If a Template dish name refers to the same dish as a Grounded Recipe (check for name overlap), PRIORITIZE the Grounded logic and IGNORE the Template entry to avoid duplicate results.
      3. Categorize Conflicts:
          - Allergy Match -> "allergy_conflict"
          - Aversion Match -> "aversion_conflict"
          - Medical Risk -> "medical_violation"
          - ICL Exclusion Match -> "icl_conflict"
      4. Consolidation: If a single dish has multiple conflicting ingredients, you MUST group them into one result for that dish. Combine the reasons into a single concise paragraph.
      5. Medical Sensitivity Check: Apply "Moderation Aware" reasoning for natural sugars and dairy. 
      6. Safety Verification Pass (Self-Correction): 
          - Re-evaluate all potential flags. 
          - If a conclusion is "Safe in moderation", "Not a conflict", or "Placeholder only" -> REMOVE from the list.
      7. Final JSON Generation: STRICTLY ONLY include verified, confirmed conflicts.
    </audit_workflow>

    <medical_sensitivity_logic>
      - Minor Ingredient Exemption: DO NOT flag small ingredients, spices, garnishes, or trace condiments as medical conflicts.
      - Main Component Rule: An ingredient MUST constitute the primary/main component of the dish (or be served in significant quantity) to trigger a medical conflict.
      - Quantity Rule: Small quantities (e.g., <= 1 tsp) of natural sweeteners like Jaggery or Honey, or pinch of salt/spices are SAFE and should NOT be flagged unless they occur frequently (>3 times) in the menu.
      - Form Matters: Jaggery and Honey are natural alternatives. Avoid flagging them for PCOS/Diabetes if used in minimal quantities (1 tsp). 
      - Profile Specificity: 
          - Non-Vegetarian: "Chicken", "Fish", "Egg" are SAFE. DO NOT flag unless a specific allergy to these proteins is listed.
          - PCOS: Focus on excessive dairy (Large portions of Milk/Cheese) and high-GI refined items (White Bread, Sugar). 
          - Diabetes: Focus on Refined Sugar (Chini) and Refined Flour (Maida). 
    </medical_sensitivity_logic>

    <dietary_logic>   
Priority: Medical Issues > Diet Type > Allergies > Aversions 

      <medical_guidelines>
        - Diabetes: Flag refined sugar, refined flour (Maida), and high-Glycemic simple carbs. Allow natural sweeteners in moderation (1 tsp).
        - Hypertension/BP: Flag high sodium/salt ingredients, processed meats, and canned foods with preservatives.
        - PCOS/PCOD: Flag hormonal disruptors, excessive high-fat dairy, and high-sugar processed foods. 
        - Thyroid: Flag RAW cruciferous vegetables (Cabbage, Broccoli, Cauliflower) if the client has Hypothyroidism.
        - Gastric/Acidity: Flag highly acidic, deep-fried, and spicy/chili-heavy foods.
        - Cholesterol/Heart: Flag trans fats, excessive saturated fats (red meat, palm oil), and deep-fried items.
      </medical_guidelines>

      <vegetarian>
        - STRICTLY FORBIDDEN: Meat, Poultry, Fish, Seafood, Egg.
        - ALLOWED: Dairy consist of Paneer, Curd, Ghee, Milk, Whey {Each are independent of each other} milk is not equal to curd or paneer. 
        - CRITICAL EXEMPTION — BRINJAL/BAINGAN/EGGPLANT: These are ALL the same vegetable. It is a 100% vegetarian ingredient. NEVER flag it as a diet_type_violation under ANY circumstance, even if listed as an ingredient in a dish. Flagging Brinjal for a Vegetarian is a CRITICAL ERROR.
      </vegetarian>
      <Ovo Vegetarian>
        - STRICTLY FORBIDDEN: Meat, Poultry, Fish, Seafood.
        - ALLOWED: Eggs, Dairy products.
      </Ovo Vegetarian>
      <vegan>
        - STRICTLY FORBIDDEN: Meat, Poultry, Fish, Seafood, Eggs, ALL Dairy products.
      </vegan>
      <non_vegetarian>
        - ALLOWED: All foods EXCEPT stated allergies and aversions.
      </non_vegetarian>
      <pescatarian>
        - ALLOWED: Fish and Seafood, Dairy products, Eggs, All plant-based foods.
        - STRICTLY FORBIDDEN: Meat from land animals (Beef, Pork, Lamb, Mutton, etc.)
      </pescatarian>
      <lactose_intolerant_override>
        - IF "Lactose Intolerant" is detected: 
    - ACTION: EXEMPT [Curd, Yogurt, Raita, Ghee] from being flagged as "Lactose" violations. 
    - REASON: Lactose has converted to Lactic Acid or fats. 
      </lactose_intolerant_override>
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

        SHALLOW INFERENCE — Aversions (aversion_conflict) and Medical Issues (medical_violation):
          - You may ONLY flag if the conflicting item is DIRECTLY and LITERALLY named in the dish name or listed as a primary/direct ingredient — maximum ONE hop.
          - Example: If client has an aversion to "Pulses", you may flag a dish that lists "Chana" or "Rajma" as a direct ingredient. You may NOT flag "Besan" on the grounds that it is derived from Chickpeas which are Pulses — that is too many hops for an aversion.
          - Example: If client has a medical issue with "Sugar", flag a dish listing "Sugar" or "Chini" directly — do not flag "Dates" because dates are sweet. One hop only.
          - Rationale: Aversions are preferences, not safety issues. Medical sensitivity is already handled by the moderation-aware logic above. Over-inference creates false positives for these lower-priority categories.
      </inference_depth_rules>
      </grounding_rules>
      <output_rules>
      - dish_name MUST be the EXACT dish name from the input list (GROUNDED RECIPES title or TEMPLATE DISH NAMES entry). DO NOT use generic labels like "ungrounded item", "template item", or any placeholder — always use the real dish name.
      - DO NOT include brackets, commas, or '/' in the dish_name output.
      - If 0 conflicts are found, return an empty conflicts array [].
      </output_rules>
      </system_instructions>`
    ,

    prompt: `Audit these dishes against the grounded database, medical conditions, and client Profile:
         If and when Client's 'Allergy food', 'Aversion food' or 'Medical Issue' conflict is found in the Dish Name or its ingredients, flag it appropriately. Apply the nuance of "Moderation-Aware" logic before concluding.

              GROUNDED RECIPES (Detailed ingredients from DB): ${JSON.stringify(dishes)}
              TEMPLATE DISH NAMES (Audit using general knowledge of their ingredients): ${JSON.stringify(extractedNames)}
              CLIENT MEDICAL HISTORY: ${medicalIssues}
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
  medicalIssues,
  iclExclusions = [],
  bnRecipePool
}) => {
  // Skip if no conflicts detected
  if (!conflicts || conflicts.length === 0) return [];

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
          thinkingBudget: 2048,
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
      - Medical Issues: ${medicalIssues || 'None'}
      - ICL Exclusions: ${iclExclusions.length ? iclExclusions.join(', ') : 'None'}
    </client_profile>

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
        - Each alternative must be safe for ALL of the client's constraints (diet type, allergies, aversions, medical, ICL)
        - Provide a 1-line reason for why each alternative is a safe swap
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
    ${JSON.stringify(conflicts, null, 2)}

    BN RECIPE POOL (ONLY suggest from this list):
    ${JSON.stringify(bnRecipePool)}
    
    For each conflict, classify it and provide the appropriate suggestion.`
  });

  console.log('📋 AI Suggestions:', JSON.stringify(object.suggestions, null, 2));
  return object.suggestions;
};
