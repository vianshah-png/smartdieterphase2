import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { readRecord } from '../config/query.js';
import { tables } from '../helper/constant.js';
import {
  BN_RECIPES_COLLECTION,
  ensureCollection,
  searchEmbedding,
  deletePoint,
  upsertBatch,
  storeEmbedding
} from '../config/qDrantConfig.js';

/**
 * Gemini embedding model instance
 * gemini-embedding-001: 768 dimensions, $0.15/1M tokens
 */
const embeddingModel = google.embeddingModel('gemini-embedding-001');

// ─── Meal Time Suitability Derivation ────────────────────────────────────────
/**
 * Derives suitable meal slots for a recipe based on its category + macros.
 * Since meal slots (on_rising, breakfast, etc.) exist on the diet template,
 * not the recipe, we infer suitability and embed it as semantic text.
 *
 * @param {Object} recipe - Recipe with category_name, calories, protein, carbs, etc.
 * @returns {string[]} Array of suitable meal slot labels
 */
function deriveMealTimeSuitability(recipe) {
  const cal = parseFloat(recipe.calories) || 0;
  const protein = parseFloat(recipe.protein) || 0;
  const categoryName = (recipe.category_name || '').toLowerCase();

  const slots = [];

  // On Rising / Bed Time: low-cal beverages, detox, water-based
  if (
    (categoryName.includes('beverage') || categoryName.includes('drink') ||
      categoryName.includes('juice') || categoryName.includes('smoothie') ||
      categoryName.includes('tea') || categoryName.includes('coffee')) &&
    cal < 150
  ) {
    slots.push('On Rising', 'Bed Time');
  }

  // Breakfast: moderate-cal balanced items (200-500 cal)
  if (
    categoryName.includes('breakfast') ||
    (cal >= 150 && cal <= 500 && !categoryName.includes('dessert'))
  ) {
    slots.push('Breakfast');
  }

  // Mid Morning / Tea Eve: light snacks, smoothies (<300 cal)
  if (
    categoryName.includes('snack') || categoryName.includes('chaat') ||
    categoryName.includes('smoothie') ||
    (cal > 0 && cal < 300)
  ) {
    slots.push('Mid Morning', 'Tea Evening');
  }

  // Lunch / Dinner: full meals, main course, high protein
  if (
    categoryName.includes('main course') || categoryName.includes('rice') ||
    categoryName.includes('dal') || categoryName.includes('curry') ||
    categoryName.includes('sabzi') || categoryName.includes('roti') ||
    categoryName.includes('bread') || categoryName.includes('khichdi') ||
    categoryName.includes('biryani') || categoryName.includes('salad') ||
    cal >= 300
  ) {
    slots.push('Lunch', 'Dinner');
  }

  // Pre/Post Workout: high protein items
  if (protein >= 10) {
    slots.push('Pre Workout', 'Post Workout');
  }

  // Post Lunch / Pre Dinner: light sides, soups, salads
  if (
    categoryName.includes('soup') || categoryName.includes('salad') ||
    categoryName.includes('raita') ||
    (cal > 0 && cal < 200)
  ) {
    slots.push('Post Lunch', 'Pre Dinner');
  }

  // Deduplicate and return
  return [...new Set(slots)];
}

// ─── Ingredient Name Parsing ─────────────────────────────────────────────────
/**
 * Strips quantities from ingredient strings for clean embedding text.
 * e.g., "Egg white - 3 nos" → "Egg white"
 */
function parseIngredientNames(ingredientsRaw) {
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
}

// ─── Rich Text Builder ───────────────────────────────────────────────────────
/**
 * Builds a rich, semantic text representation of a recipe for embedding.
 * Includes title, category, type, ingredients, macros, tags, and meal suitability.
 *
 * @param {Object} recipe - Full recipe object from DB
 * @returns {string} Semantic text for embedding
 */
function buildRecipeEmbeddingText(recipe) {
  const ingredientNames = parseIngredientNames(recipe.ingredients);
  const mealSlots = deriveMealTimeSuitability(recipe);

  // Parse JSON tag fields safely
  const healthTags = safeParseArray(recipe.health_tags);
  const nutritionTags = safeParseArray(recipe.nutrition_tags);
  const allergyTags = safeParseArray(recipe.allergy_tags);

  const parts = [
    `Title: ${recipe.title}.`,
    recipe.category_name ? `Category: ${recipe.category_name}.` : '',
    recipe.recipe_type_title ? `Type: ${recipe.recipe_type_title}.` : '',
    ingredientNames.length ? `Ingredients: ${ingredientNames.join(', ')}.` : '',
    `Macros: ${recipe.calories || 0} cal, ${recipe.protein || 0}g protein, ${recipe.fat || 0}g fat, ${recipe.carbs || 0}g carbs, ${recipe.fiber || 0}g fiber.`,
    healthTags.length ? `Health Tags: ${healthTags.join(', ')}.` : '',
    nutritionTags.length ? `Nutrition Tags: ${nutritionTags.join(', ')}.` : '',
    allergyTags.length ? `Allergy Tags: ${allergyTags.join(', ')}.` : '',
    mealSlots.length ? `Suitable for: ${mealSlots.join(', ')}.` : ''
  ];

  return parts.filter(Boolean).join(' ');
}

function safeParseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Generates an embedding for a single recipe and upserts it to Qdrant.
 * Called from recipeController on add/update.
 *
 * @param {Object} recipe - Must include: id, title, ingredients, category_name,
 *   recipe_type_id, calories, protein, fat, carbs, fiber, health_tags, etc.
 */
export async function upsertRecipeEmbedding(recipe) {
  try {
    // Ensure collection exists on first call
    await ensureCollection({ name: BN_RECIPES_COLLECTION });

    const text = buildRecipeEmbeddingText(recipe);
    console.log(`📐 Embedding text for "${recipe.title}" (${text.length} chars)`);

    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
    });

    // Use recipe.id (integer) as the Qdrant point ID for easy lookup
    await storeEmbedding({
      id: recipe.id,
      embedding,
      metadata: {
        recipe_id: recipe.id,
        title: recipe.title,
        slug: recipe.slug || '',
        category_id: recipe.category_id || null,
        category_name: recipe.category_name || '',
        recipe_type_id: recipe.recipe_type_id || null,
        calories: parseFloat(recipe.calories) || 0,
        protein: parseFloat(recipe.protein) || 0,
        ingredients_text: parseIngredientNames(recipe.ingredients).join(', '),
      },
      collection: BN_RECIPES_COLLECTION,
    });

    console.log(`✅ Upserted recipe embedding: ${recipe.title} (ID: ${recipe.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to upsert recipe embedding for "${recipe.title}":`, error.message);
    return false;
  }
}

/**
 * Removes a recipe's embedding from Qdrant (called on delete).
 * @param {number} recipeId
 */
export async function removeRecipeEmbedding(recipeId) {
  try {
    await deletePoint({ collection: BN_RECIPES_COLLECTION, id: recipeId });
    console.log(`🗑️ Removed recipe embedding for ID: ${recipeId}`);
  } catch (error) {
    console.error(`Error removing recipe embedding ${recipeId}:`, error.message);
  }
}

/**
 * Semantic search for alternative recipes using Qdrant vector search.
 * This is the core RAG retrieval function used by the diet audit.
 *
 * @param {Object} params
 * @param {string} params.queryText - Search query (e.g., "vegetarian soup alternative")
 * @param {number[]} [params.allowedTypeIds] - Allowed recipe_type_id values for diet type filtering
 * @param {number[]} [params.excludeIds] - Recipe IDs to exclude (in-plan recipes)
 * @param {number} [params.limit=8] - Max results
 * @returns {Promise<Array>} Array of { id, title, slug, category_name, category_id, ingredients, score }
 */
export async function searchSimilarRecipes({ queryText, allowedTypeIds, excludeIds = [], limit = 8 }) {
  try {
    // Generate embedding for the search query
    const { embedding: queryVector } = await embed({
      model: embeddingModel,
      value: queryText,
    });

    // Build Qdrant filter
    const mustConditions = [];
    const mustNotConditions = [];

    // Filter by diet type
    if (allowedTypeIds && allowedTypeIds.length > 0) {
      mustConditions.push({
        key: 'recipe_type_id',
        match: { any: allowedTypeIds },
      });
    }

    // Exclude in-plan recipes
    if (excludeIds.length > 0) {
      // Use must_not with individual match conditions for each ID
      excludeIds.forEach(id => {
        mustNotConditions.push({
          key: 'recipe_id',
          match: { value: id },
        });
      });
    }

    const filter = {};
    if (mustConditions.length > 0) filter.must = mustConditions;
    if (mustNotConditions.length > 0) filter.must_not = mustNotConditions;

    const results = await searchEmbedding({
      collection: BN_RECIPES_COLLECTION,
      vector: queryVector,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      limit,
    });

    // Map to a clean output format
    return results.map(hit => ({
      id: hit.payload.recipe_id,
      title: hit.payload.title,
      slug: hit.payload.slug,
      category_name: hit.payload.category_name,
      category_id: hit.payload.category_id,
      ingredients: hit.payload.ingredients_text,
      score: hit.score,
    }));
  } catch (error) {
    console.error('❌ Recipe vector search failed:', error.message);
    return [];
  }
}

/**
 * One-time bulk ingestion: Embeds all active recipes and upserts to Qdrant.
 * Call this via an API endpoint or script to bootstrap the vector index.
 *
 * @returns {Object} { total, success, failed }
 */
export async function ingestAllRecipes() {
  console.log('🚀 Starting full recipe ingestion into Qdrant...');

  // Ensure the collection exists
  await ensureCollection({ name: BN_RECIPES_COLLECTION });

  // Fetch all active recipes with category and type info
  const { results: recipes } = await readRecord({
    table: `${tables.recipe} r`,
    selectFields: [
      'r.id', 'r.title', 'r.slug', 'r.ingredients',
      'r.recipe_type_id', 'r.category_id',
      'r.calories', 'r.protein', 'r.fat', 'r.carbs', 'r.fiber',
      'r.energy', 'r.health_tags', 'r.nutrition_tags', 'r.allergy_tags',
      'c.category_name', 'rt.title as recipe_type_title'
    ],
    joins: [
      { type: 'LEFT', table: `${tables.category} c`, on: 'r.category_id = c.category_id' },
      { type: 'LEFT', table: `${tables.recipe_type} rt`, on: 'r.recipe_type_id = rt.id' },
    ],
    conditions: [
      { field: 'r.is_deleted', operator: '=', value: 0 },
      { field: 'r.status', operator: '=', value: 'active' },
    ],
    pagination: { limit: 5000 }, // Get all recipes
  });

  console.log(`📊 Found ${recipes.length} active recipes to ingest`);

  let success = 0;
  let failed = 0;

  // Process in batches of 20 to avoid rate limits on embedding API
  const BATCH_SIZE = 20;
  for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
    const batch = recipes.slice(i, i + BATCH_SIZE);
    const texts = batch.map(r => buildRecipeEmbeddingText(r));

    try {
      // Generate embeddings in batch
      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: texts,
      });

      // Build Qdrant points
      const points = batch.map((recipe, idx) => ({
        id: recipe.id,
        vector: embeddings[idx],
        payload: {
          recipe_id: recipe.id,
          title: recipe.title,
          slug: recipe.slug || '',
          category_id: recipe.category_id || null,
          category_name: recipe.category_name || '',
          recipe_type_id: recipe.recipe_type_id || null,
          calories: parseFloat(recipe.calories) || 0,
          protein: parseFloat(recipe.protein) || 0,
          ingredients_text: parseIngredientNames(recipe.ingredients).join(', '),
        },
      }));

      await upsertBatch({ collection: BN_RECIPES_COLLECTION, points });
      success += batch.length;
      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} recipes ingested (${success}/${recipes.length})`);
    } catch (error) {
      failed += batch.length;
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < recipes.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n🏁 Ingestion complete: ${success} success, ${failed} failed, ${recipes.length} total`);
  return { total: recipes.length, success, failed };
}
