import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { extractDishesFromHtml } from "../../helper/parser.js";
import { generateAuditInference, generateAlternativeSuggestions } from "../../services/aiService.js";
import { searchSimilarRecipes } from "../../services/embeddingService.js";
import dietDetails from "../../models/dietDetailsModel.js";

// ─────────────────────────────────────────────────────────────────────────────
// BN Assessment API helpers — called in parallel, all non-blocking
// assessment_id is supplied by the caller (from the assessment-list API response)
// ─────────────────────────────────────────────────────────────────────────────
const BN_API_BASE = 'https://bn-new-api.balancenutritiononline.com/api/v1/assessment';

/**
 * Fetches the client's 24-Hour Diet Recall and returns a flat list of
 * all dishes/foods they mentioned across every meal slot.
 */
const fetchDietRecall = async (user_id, assessment_id) => {
  try {
    const res = await fetch(`${BN_API_BASE}/get-diet-recall-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(user_id), assessment_id })
    });
    const json = await res.json();
    if (!json?.data) return [];

    const slotKeys = [
      'breakfast_details', 'mid_morning_details', 'lunch_details',
      'late_evening_details', 'dinner_details', 'pre_or_post_workout_meal'
    ];
    const dishes = [];
    for (const key of slotKeys) {
      const raw = json.data[key];
      if (!raw) continue;
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const menuOptions = parsed?.menu_options || {};
        Object.values(menuOptions).forEach(opt => {
          if (typeof opt === 'string' && opt.trim()) dishes.push(opt.trim());
        });
      } catch { /* ignore malformed slots */ }
    }
    console.log(`🍽️  Diet Recall: ${dishes.length} menu entries fetched`);
    return dishes;
  } catch (e) {
    console.error('⚠️ fetchDietRecall failed (non-blocking):', e.message);
    return [];
  }
};

/**
 * Fetches Food Frequency data and splits it into high-frequency
 * (Daily / Multiple times a week) and low-frequency (Rarely / Once in 15 days) lists.
 */
const fetchFoodFrequency = async (user_id, assessment_id) => {
  try {
    const res = await fetch(`${BN_API_BASE}/get-food-frequency-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(user_id), assessment_id })
    });
    const json = await res.json();
    const items = Array.isArray(json?.data) ? json.data : [];

    const HIGH_FREQ_LABELS = ['daily', 'twice a week', 'thrice a week', 'multiple times', 'every day'];
    const LOW_FREQ_LABELS  = ['rarely', 'once in 15 days', 'once a month', 'never'];

    const high = [], low = [];
    items.forEach(({ food_name, value }) => {
      const v = (value || '').toLowerCase();
      if (HIGH_FREQ_LABELS.some(l => v.includes(l))) high.push(food_name);
      else if (LOW_FREQ_LABELS.some(l => v.includes(l))) low.push(food_name);
    });
    console.log(`📊 Food Frequency: ${high.length} high-freq, ${low.length} low-freq items`);
    return { high, low };
  } catch (e) {
    console.error('⚠️ fetchFoodFrequency failed (non-blocking):', e.message);
    return { high: [], low: [] };
  }
};

/**
 * Fetches Nutrition & Lifestyle details and extracts preferred cuisines
 * and food preferences — used to steer alternatives toward familiar territory.
 */
const fetchNutritionLifestyle = async (user_id, assessment_id) => {
  try {
    const res = await fetch(`${BN_API_BASE}/get-nutrition-and-lifestyle-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(user_id), assessment_id })
    });
    const json = await res.json();
    const data = json?.data || {};

    // food_preference may already be a parsed array from the API
    const foodPreferences = Array.isArray(data.food_preference)
      ? data.food_preference
      : [];

    // preferred_cuisine is a JSON-encoded object: {cuisine:{cuisine_1:"Indian",...},other_cuisine:{...}}
    let preferredCuisines = [];
    try {
      const raw = data.preferred_cuisine;
      const cuisineObj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const main   = Object.values(cuisineObj?.cuisine       || {});
      const others = Object.values(cuisineObj?.other_cuisine || {});
      preferredCuisines = [...main, ...others].filter(Boolean);
    } catch { /* ignore */ }

    console.log(`🌏 Nutrition & Lifestyle: ${preferredCuisines.length} cuisines, ${foodPreferences.length} food preferences`);
    return { foodPreferences, preferredCuisines };
  } catch (e) {
    console.error('⚠️ fetchNutritionLifestyle failed (non-blocking):', e.message);
    return { foodPreferences: [], preferredCuisines: [] };
  }
};

/**
 * Maps client eating_habit → allowed bn_recipe.recipe_type_id values
 */
const RECIPE_TYPE_MAP = {
  'vegetarian': [1, 4],          // Veg + Vegan
  'veg': [1, 4],
  'vegan': [4],                  // Vegan only
  'non vegetarian': [1, 2, 3],   // Veg + Non-Veg + Ovo-Veg
  'non veg': [1, 2, 3],
  'ovo vegetarian': [1, 3],      // Veg + Ovo-Veg
  'ovo veg': [1, 3],
  'pescatarian': [1, 4, 5],      // Veg + Vegan + Pescatarian
};

/**
 * Strips quantities from ingredient strings for token-efficient AI payloads
 * e.g., "Egg white - 3 nos" → "Egg white"
 */
const parseIngredientNames = (ingredientsRaw) => {
  try {
    const arr = typeof ingredientsRaw === 'string' ? JSON.parse(ingredientsRaw) : ingredientsRaw;
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
      const cleaned = String(item).split(' - ')[0].trim();
      return cleaned;
    }).filter(Boolean);
  } catch {
    return [];
  }
};

export const runDietComplianceAudit = async (req, res, next) => {
  try {
    const { user_id, diet_id, is_edit, generate_alternatives = true, assessment_id } = req.body;

    // STEP 1 & 2: Get Client Context (Eating Habit, Allergies)
    const { results: clientContext } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.country_id",
        "c.country_name",
        "ass_n_l.eating_habit",
        "ass_n_l.food_allergies",
        "ass_n_l.food_aversions",
        "ass_n_l.jain_food_restrictions",
        "ass_n_l.avoided_jain_foods"
      ],
      joins: [
        { type: "LEFT", table: `${tables.assessment_nutrition_and_lifestyle} ass_n_l`, on: "ass_n_l.user_id = ud.user_id" },
        { type: "LEFT", table: `countries c`, on: "c.country_id = ud.country_id" }
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        { field: "ass_n_l.eating_habit", operator: "!=", value: "" }
      ],
      orderBy: ["ass_n_l.nutrition_and_lifestyle_id DESC"],
      pagination: { limit: 1 }
    });

    if (!clientContext.length) return next(new ErrorHandler("Client profile not found", 404));

    // STEP 2B: Fetch BN Assessment data in parallel (non-blocking)
    // assessment_id is provided in the request body by the caller
    // (the caller gets it from the assessment-list API response)
    let recallDishes = [];
    let highFrequencyFoods = [];
    let lowFrequencyFoods = [];
    let preferredCuisines = [];
    let foodPreferences = [];

    if (assessment_id) {
      const [recallResult, freqResult, nlResult] = await Promise.allSettled([
        fetchDietRecall(user_id, assessment_id),
        fetchFoodFrequency(user_id, assessment_id),
        fetchNutritionLifestyle(user_id, assessment_id)
      ]);
      recallDishes        = recallResult.status === 'fulfilled'  ? recallResult.value         : [];
      const freq          = freqResult.status   === 'fulfilled'  ? freqResult.value           : { high: [], low: [] };
      highFrequencyFoods  = freq.high;
      lowFrequencyFoods   = freq.low;
      const nl            = nlResult.status     === 'fulfilled'  ? nlResult.value             : { foodPreferences: [], preferredCuisines: [] };
      foodPreferences     = nl.foodPreferences;
      preferredCuisines   = nl.preferredCuisines;
    } else {
      console.warn('⚠️ assessment_id not provided — skipping BN assessment enrichment');
    }

    // (Medical issue conflict detection removed — not used in audit)
    let dietData;
    // STEP 3: Retrieve full diet template metadata
    if (is_edit) {
      const { results: dietResults } = await readRecord({
        table: `${tables.dietSessionLog} dp`,
        selectFields: ["*"],
        conditions: [{ field: "diet_id", operator: "=", value: diet_id }]
      });
      if (!dietResults.length) return next(new ErrorHandler("Diet not found", 404));
      const diet = await dietDetails.findById(dietResults[0].diet_details_id);
      dietData = diet;
    } else {
      const { results: dietResults } = await readRecord({
        table: `${tables.specialDietPlan} dp`,
        selectFields: ["*"],
        conditions: [{ field: "diet_id", operator: "=", value: diet_id }]
      });
      if (!dietResults.length) return next(new ErrorHandler("Diet not found", 404));
      dietData = dietResults[0];
    }

    // STEP 3B: Filter BN Shop Products for Non-India Clients
    if (
      clientContext[0] &&
      clientContext[0].country_id !== 101 &&
      clientContext[0].country_name?.toLowerCase() !== 'india'
    ) {
      const slotsToClean = [
        'on_rising', 'breakfast', 'mid_morning', 'lunch', 'post_lunch',
        'tea_eve', 'pre_workout', 'post_workout', 'dinner', 'pre_dinner',
        'post_dinner', 'bed_time'
      ];
      slotsToClean.forEach(slot => {
        if (dietData[slot] && typeof dietData[slot] === 'string') {
          // Detect any BN shop product: any chunk containing 'BN' + a shop CTA ('Order Now'/'Buy Here') regardless of hyphen/space variations
          const isBnShopChunk = (c) => {
            const lowerC = c.toLowerCase();
            const hasBN = /\bbn\b|bn[-\s]/i.test(c);
            const hasCta = lowerC.includes('order now') || lowerC.includes('buy here') || lowerC.includes('buy now');
            return lowerC.includes('shop.balancenutrition.in') || (hasBN && hasCta);
          };

          const hasAnyShopContent = isBnShopChunk(dietData[slot]);
          if (hasAnyShopContent) {
            const chunks = dietData[slot].split(/(?:(?:<br\s*\/?>|\n)\s*)*\bOR\b(?:\s*(?:<br\s*\/?>|\n)\s*)*/g);
            const safeChunks = chunks.filter(c => !isBnShopChunk(c));
            dietData[slot] = safeChunks.join('<br>OR<br>');
          }
        }
      });
    }

    // STEP 4: Direct ID Extraction from 11 Meal Slots
    const mealContent = [
      dietData.on_rising, dietData.breakfast, dietData.mid_morning,
      dietData.lunch, dietData.post_lunch, dietData.tea_eve,
      dietData.pre_workout, dietData.post_workout, dietData.dinner,
      dietData.pre_dinner,
      dietData.post_dinner, dietData.bed_time
    ].filter(Boolean).join(" ");

    // Extract Recipe IDs from the HTML links
    const idMatches = mealContent.match(/recipe-details\/(\d+)/g) || mealContent.match(/redirect_id=(\d+)/g) || []; const recipeIds = [...new Set(idMatches.map(match => {
      const id = match.match(/\d+/);
      return id ? parseInt(id[0]) : null;
    }).filter(Boolean))];

    // Also get clean dish names for mapping AI results to the UI
    const dishNames = extractDishesFromHtml(mealContent);
    console.log("Extracted Recipe IDs:", recipeIds);
    console.log("Extracted Dish Names:", dishNames);

    // STEP 5: Data Grounding (Fetching Ingredients by Recipe IDs)
    const { results: groundedDishes } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: ["r.title", "r.ingredients"],
      conditions: [
        {
          field: "r.id",
          operator: "IN",
          value: recipeIds.length ? recipeIds : [0]
        }
      ]
    });
    console.log("Grounded Dishes from DB:", groundedDishes);

    // return;
    // STEP 5B: Fetch Ingredient Checklist Exclusions
    let iclExclusions = [];
    try {
      const { results: iclRecords } = await readRecord({
        table: tables.ingredientChecklistRecords,
        selectFields: ["cant_buy_ingredients"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
        orderBy: ["ingredient_checklist_id DESC"],
        pagination: { limit: 1 }
      });

      if (iclRecords.length && iclRecords[0].cant_buy_ingredients) {
        const cantBuyObj = JSON.parse(iclRecords[0].cant_buy_ingredients);
        for (const category in cantBuyObj) {
          const items = cantBuyObj[category] || [];
          items.forEach(item => {
            const name = item.ingredient_name || item.name;
            if (name) iclExclusions.push(name);
          });
        }
      }
    } catch (e) {
      console.error("Error fetching ICL exclusions:", e);
    }

    // STEP 6: AI-Powered Safety Audit (Final Deduction Pass)
    const groundedTitles = groundedDishes.map(d => d.title.toLowerCase().trim());
    const filteredTemplateNames = dishNames.filter(name => {
      if (!name) return false;
      const normalizedName = name.toLowerCase().trim();

      // Check for exact and partial matches
      const isGrounded = groundedTitles.some(title =>
        normalizedName === title ||
        normalizedName.includes(title) ||
        title.includes(normalizedName)
      );
      return !isGrounded;
    });

    console.log("📝 GROUNDED TITLES:", groundedTitles);
    console.log("📝 FILTERED TEMPLATE NAMES:", filteredTemplateNames);

    const auditResults = await generateAuditInference({
      client: clientContext[0],
      dishes: groundedDishes,
      extractedNames: filteredTemplateNames,
      iclExclusions
    });

    // STEP 6B: Phase 3 — True RAG: Vector search for alternatives
    let suggestions = [];
    if (generate_alternatives && auditResults && auditResults.length > 0) {
      try {
        const habit = (clientContext[0].eating_habit || '').toLowerCase().trim();
        const allowedTypeIds = RECIPE_TYPE_MAP[habit] || [1];

        // Deduplicate auditResults to reduce token usage and duplicate generations
        const dedupedConflictsMap = new Map();

        // Build per-slot meal lines for accurate combo detection
        const mealSlots = [
          dietData.on_rising, dietData.breakfast, dietData.mid_morning,
          dietData.lunch, dietData.post_lunch, dietData.tea_eve,
          dietData.pre_workout, dietData.post_workout, dietData.dinner,
          dietData.pre_dinner, dietData.post_dinner, dietData.bed_time
        ].filter(Boolean);

        // Split each slot by OR boundaries to get individual option lines
        const mealLines = [];
        mealSlots.forEach(slot => {
          const options = slot.split(/(?:(?:<br\s*\/?>|\n)\s*)*\bOR\b(?:\s*(?:<br\s*\/?>|\n)\s*)*/gi);
          options.forEach(opt => {
            const cleaned = opt.replace(/<[^>]+>/g, ' ').trim();
            if (cleaned) mealLines.push(cleaned);
          });
        });

        /**
         * Detects if a line is a combo (has '+' OUTSIDE brackets/parentheses)
         * e.g. "1 bowl soup + 1 sandwich" → true (combo)
         * e.g. "1 bowl shaak [makai + bateta]" → false ('+' is inside brackets, not a combo separator)
         */
        const hasComboPlus = (line) => {
          // Strip bracket and parenthesis content first
          const stripped = line.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
          return /\s\+\s/.test(stripped);
        };

        /**
         * Extracts clean companion dish names from a combo line
         * e.g. "1 bowl soup + 1 sandwich + 1 bowl dal" with conflict "soup"
         *    → companions: ["sandwich", "dal"]
         */
        const getCompanionDishes = (line, conflictDishName) => {
          const stripped = line.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
          // Split the combo by '/' first to get alternatives, then by '+' to get items
          const segments = stripped.split(/\s\/\s/).flatMap(seg => seg.split(/\s\+\s/));
          return segments
            .map(s => s.replace(/\d+\s*(bowl|cup|tsp|tbsp|gms?|serving|piece|slice|nos?)\s*/gi, '').trim())
            .filter(s => s.length > 1 && !s.toLowerCase().includes(conflictDishName.toLowerCase()));
        };

        auditResults.forEach(c => {
          // Group by conflict_type and reason (or conflicting_ingredient). This acts as a unique signature.
          const sig = c.conflicting_ingredient
            ? `${c.conflict_type}_${c.conflicting_ingredient.toLowerCase().trim()}`
            : c.dish_name.toLowerCase().trim();

          if (!dedupedConflictsMap.has(sig)) {
            const dishNameLower = c.dish_name.toLowerCase().trim();

            // Find the meal line that contains this dish
            const matchingLine = mealLines.find(line => line.toLowerCase().includes(dishNameLower));

            let contextStr;
            if (matchingLine && hasComboPlus(matchingLine)) {
              const companions = getCompanionDishes(matchingLine, c.dish_name);
              contextStr = `Group Alternative: "${c.dish_name}" is paired in a combo with: [${companions.join(', ')}]. The alternative MUST be the same food type/category as "${c.dish_name}" (e.g. liquid→liquid, rice→rice, bread→bread) and pair well with [${companions.join(', ')}].`;
            } else {
              contextStr = `Standalone Alternative: "${c.dish_name}" appears as a standalone option (separated by '/' or 'OR'). Suggest alternatives that match the same food type/category as "${c.dish_name}".`;
            }

            dedupedConflictsMap.set(sig, { ...c, meal_context: contextStr });
          }
        });
        const uniqueConflicts = Array.from(dedupedConflictsMap.values());
        console.log(`🧩 Original conflicts: ${auditResults.length}, Unique conflicts to process: ${uniqueConflicts.length}`);

        // RAG RETRIEVAL: Semantic vector search per conflict instead of SQL dump
        // Build a combined pool from targeted searches per conflict dish
        // RAG queries are enriched with the client's real eating patterns for better vector alignment
        const ragPoolMap = new Map(); // dedup by recipe ID

        // Build enrichment suffix once (shared across all conflict queries)
        const recallContext   = recallDishes.length
          ? `, familiar to someone who eats: ${recallDishes.slice(0, 5).join(', ')}`
          : '';
        const cuisineContext  = preferredCuisines.length
          ? `, preferred cuisines: ${preferredCuisines.slice(0, 3).join(', ')}`
          : '';

        for (const conflict of uniqueConflicts) {
          const searchQuery = `Safe ${habit} alternative for ${conflict.dish_name}, same food category and type${recallContext}${cuisineContext}`;
          console.log(`🔍 RAG search: "${searchQuery}"`);

          const results = await searchSimilarRecipes({
            queryText: searchQuery,
            allowedTypeIds,
            excludeIds: recipeIds,
            limit: 8,
          });

          console.log(`   ↳ Found ${results.length} candidates: ${results.map(r => r.title).join(' | ')}`);

          results.forEach(r => {
            if (!ragPoolMap.has(r.id)) {
              ragPoolMap.set(r.id, r);
            }
          });
        }

        const trimmedPool = Array.from(ragPoolMap.values()).map(r => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          category_name: r.category_name,
          category_id: r.category_id,
          ingredients: r.ingredients ? r.ingredients.split(', ') : []
        }));

        console.log(`📦 RAG pool: ${trimmedPool.length} targeted recipes (was 60 with SQL dump)`);

        // STEP 6C: Call AI to generate smart suggestions (enriched with eating patterns)
        const aiResponseSuggestions = await generateAlternativeSuggestions({
          conflicts: uniqueConflicts,
          client: clientContext[0],
          iclExclusions,
          bnRecipePool: trimmedPool,
          clientEatingPatterns: {
            recallDishes,
            highFrequencyFoods,
            lowFrequencyFoods,
            preferredCuisines,
            foodPreferences
          }
        });

        // Link the generated suggestions back to the unique signatures
        const suggestionsMapBySig = new Map();
        aiResponseSuggestions.forEach(sugg => {
          const srcConflict = uniqueConflicts.find(uc => {
            const sn = sugg.conflict_dish_name?.toLowerCase().trim() || "";
            const un = uc.dish_name.toLowerCase().trim();
            return sn === un || sn.includes(un) || un.includes(sn);
          });
          if (srcConflict) {
            const sig = srcConflict.conflicting_ingredient
              ? `${srcConflict.conflict_type}_${srcConflict.conflicting_ingredient.toLowerCase().trim()}`
              : srcConflict.dish_name.toLowerCase().trim();
            suggestionsMapBySig.set(sig, sugg);
          }
        });

        // Expand the suggestions back out to exactly mirror the original audit array
        suggestions = auditResults.map(c => {
          const sig = c.conflicting_ingredient
            ? `${c.conflict_type}_${c.conflicting_ingredient.toLowerCase().trim()}`
            : c.dish_name.toLowerCase().trim();
          const matchedSugg = suggestionsMapBySig.get(sig);
          if (matchedSugg) {
            return {
              ...matchedSugg,
              // Crucial: Remap back to exact target name so the Step 7 matcher natively links them
              conflict_dish_name: c.dish_name
            };
          }
          return null;
        }).filter(Boolean);
      } catch (sugError) {
        console.error('⚠️ Suggestion generation failed (non-blocking):', sugError.message);
        // Non-blocking: audit still returns even if suggestions fail
      }
    }

    // STEP 7 & 8: Merge suggestions into audit results and return
    console.log('🔗 MERGE: audit dish names:', auditResults.map(c => c.dish_name));
    console.log('🔗 MERGE: suggestion dish names:', suggestions.map(s => s.conflict_dish_name));

    const enrichedResults = auditResults.map(conflict => {
      const conflictName = conflict.dish_name.toLowerCase().trim();
      const match = suggestions.find(s => {
        const sugName = s.conflict_dish_name.toLowerCase().trim();
        return sugName === conflictName ||
          sugName.includes(conflictName) ||
          conflictName.includes(sugName);
      });
      if (match) console.log(`  ✅ Matched: "${conflict.dish_name}" → "${match.conflict_dish_name}" (${match.suggestion_type})`);
      else console.log(`  ❌ No match for: "${conflict.dish_name}"`);
      return {
        ...conflict,
        suggestion: match ? {
          type: match.suggestion_type,
          swap_instruction: match.swap_instruction || null,
          alternative_dishes: match.alternative_dishes || []
        } : null
      };
    });

    return res.status(200).json(new ApiResponse({
      statusCode: 200,
      message: "Safety audit completed with smart alternatives",
      data: {
        audit_results: enrichedResults,
        diet_template: dietData,
        client_context: {
          ...clientContext[0],
          icl_exclusions: iclExclusions
        },
        _rag_diagnostics: {
          alternatives_enabled: generate_alternatives,
          conflicts_found: auditResults.length,
          suggestions_generated: suggestions.length,
        }
      }
    }));

  } catch (error) {
    console.error("❌ AI Audit Error:", error);
    return next(new ErrorHandler("Internal Audit Error", 500));
  }
};