import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { extractDishesFromHtml } from "../../helper/parser.js";
import { generateAuditInference, generateAlternativeSuggestions } from "../../services/aiService.js";
import dietDetails from "../../models/dietDetailsModel.js";

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
    const { user_id, diet_id, is_edit } = req.body;

    // STEP 1 & 2: Get Client Context (Eating Habit, Allergies)
    const { results: clientContext } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.country_id",
        "c.country_name",
        "ass_n_l.eating_habit",
        "ass_n_l.food_allergies",
        "ass_n_l.food_aversions",
        "ass_m_h.acidity",
        "ass_m_h.blood_pressure",
        "ass_m_h.cholesterol",
        "ass_m_h.diabetes",
        "ass_m_h.pcos",
        "ass_m_h.thyroid",
        "ass_m_h.fatty_liver",
        "ass_m_h.other_medical_issue",
        "ass_n_l.jain_food_restrictions",
        "ass_n_l.avoided_jain_foods"
      ],
      joins: [
        { type: "LEFT", table: `${tables.assessment_nutrition_and_lifestyle} ass_n_l`, on: "ass_n_l.user_id = ud.user_id" },
        { type: "LEFT", table: `${tables.assessment_medical_history} ass_m_h`, on: "ass_m_h.user_id = ud.user_id" },
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

    // STEP 2B: Consolidate Medical Issues
    const medData = clientContext[0];
    let medicalIssues = [];
    if (medData.acidity) medicalIssues.push("Acidity");
    if (medData.blood_pressure) medicalIssues.push("Blood Pressure");
    if (medData.cholesterol) medicalIssues.push("Cholesterol");
    if (medData.diabetes) medicalIssues.push("Diabetes");
    if (medData.pcos) medicalIssues.push("PCOS");
    if (medData.thyroid) medicalIssues.push("Thyroid");
    if (medData.fatty_liver) medicalIssues.push("Fatty Liver");

    if (medData.other_medical_issue) {
      try {
        const others = JSON.parse(medData.other_medical_issue);
        if (typeof others === 'object') {
          medicalIssues.push(...Object.values(others));
        }
      } catch (e) {
        console.error("Error parsing other_medical_issue:", e);
      }
    }
    const medicalIssuesStr = medicalIssues.join(", ") || "None";
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
      medicalIssues: medicalIssuesStr,
      iclExclusions
    });

    // STEP 6B: Phase 3 — Fetch BN Recipe Pool for alternatives (Structured RAG)
    let suggestions = [];
    if (auditResults && auditResults.length > 0) {
      try {
        const habit = (clientContext[0].eating_habit || '').toLowerCase().trim();
        const allowedTypeIds = RECIPE_TYPE_MAP[habit] || [1];

        // Collect ALL exclusion keywords: audit conflicts + ICL exclusions + aversion foods
        const conflictingIngredients = [...new Set(
          auditResults.map(c => c.conflicting_ingredient)
        )];

        // Parse aversion foods into individual keywords
        const aversionKeywords = (clientContext[0].food_aversions || '')
          .split(/[,;]/)
          .map(s => s.trim().toLowerCase())
          .filter(s => s.length > 2);

        // Merge all exclusion sources into one set
        const allExclusionKeywords = [...new Set([
          ...conflictingIngredients.map(ci => ci.toLowerCase().split(/[,\/]/)[0].trim()),
          ...iclExclusions.map(i => i.toLowerCase().trim()),
          ...aversionKeywords
        ])].filter(k => k.length > 2);

        console.log(`🚫 All exclusion keywords for pool filtering: ${allExclusionKeywords.join(', ')}`);

        // Fetch candidate BN recipes — diet-type filtered, excluding in-plan recipes
        // Increased limit for wider food-type diversity (juices, smoothies, etc.)
        const { results: bnRecipePool } = await readRecord({
          table: `${tables.recipe} r`,
          selectFields: [
            'r.id', 'r.title', 'r.slug',
            'r.ingredients', 'r.recipe_type_id',
            'r.category_id', 'r.health_tags', 'r.nutrition_tags',
            'c.category_name'
          ],
          joins: [
            { type: "LEFT", table: `${tables.category} c`, on: "r.category_id = c.category_id" }
          ],
          conditions: [
            { field: 'r.is_deleted', operator: '=', value: 0 },
            { field: 'r.status', operator: '=', value: 'active' },
            { field: 'r.recipe_type_id', operator: 'IN', value: allowedTypeIds },
            ...(recipeIds.length ? [{ field: 'r.id', operator: 'NOT IN', value: recipeIds }] : [])
          ],
          pagination: { limit: 150 },
          orderBy: ['r.view_count DESC']
        });

        console.log(`📦 BN Recipe Pool fetched: ${bnRecipePool.length} candidates`);

        // Post-filter: remove any recipe whose title OR ingredients contain ANY exclusion keyword
        const safePool = bnRecipePool.filter(recipe => {
          const titleStr = (recipe.title || '').toLowerCase();
          const ingredStr = String(recipe.ingredients || '').toLowerCase();
          const combined = `${titleStr} ${ingredStr}`;
          return !allExclusionKeywords.some(keyword => combined.includes(keyword));
        });

        console.log(`🛡️ Safe pool after exclusion filter: ${safePool.length} recipes`);

        // Trim to token-efficient format for AI
        const trimmedPool = safePool.slice(0, 60).map(r => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          category_name: r.category_name,
          category_id: r.category_id,
          ingredients: parseIngredientNames(r.ingredients)
        }));

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

        // STEP 6C: Call AI to generate smart suggestions
        const aiResponseSuggestions = await generateAlternativeSuggestions({
          conflicts: uniqueConflicts,
          client: clientContext[0],
          medicalIssues: medicalIssuesStr,
          iclExclusions,
          bnRecipePool: trimmedPool
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
          medical_issues: medicalIssuesStr,
          icl_exclusions: iclExclusions
        }
      }
    }));

  } catch (error) {
    console.error("❌ AI Audit Error:", error);
    return next(new ErrorHandler("Internal Audit Error", 500));
  }
};