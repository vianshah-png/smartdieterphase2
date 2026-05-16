import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";
dotenv.configDotenv();

const qdrantConfig = { url: process.env.QDRANT_URL };
if (process.env.QDRANT_API_KEY) {
  qdrantConfig.apiKey = process.env.QDRANT_API_KEY;
}
const client = new QdrantClient(qdrantConfig);

const NEW_COLLECTION = process.env.QDRANT_COLLECTION;

async function checkCollection() {
  try {
    // await client.createCollection("photo_records", {
    //   vectors: { size: 1024, distance: "Cosine" },
    // });
    const result = await client.getCollections();
    console.log("Collection details:", result);
  } catch (error) {
    console.error("Error fetching collection details:", error);
  }
}

// checkCollection();

async function storeEmbedding({ id, embedding, metadata, collection }) {
  console.log(id, embedding, metadata, 24);
  try {
    const result = await client.upsert(collection, {
      wait: true,
      points: [
        {
          id,
          vector: embedding,
          payload: metadata, // Add metadata here
        },
      ],
    });
    console.log(`Stored embedding for ID: ${id}`, result);
  } catch (error) {
    console.error("Error storing embedding:", error);
  }
}
/**
 * Collection name for recipe text embeddings (RAG system)
 * Separate from the existing 'content' collection used for image embeddings
 */
const BN_RECIPES_COLLECTION = 'bn_recipes';

/**
 * Ensures a Qdrant collection exists, creates it if missing
 * @param {string} name - Collection name
 * @param {number} size - Vector dimension size (3072 for gemini-embedding-001)
 * @param {string} distance - Distance metric ('Cosine', 'Euclid', 'Dot')
 */
async function ensureCollection({ name, size = 3072, distance = 'Cosine' }) {
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === name);
    if (!exists) {
      await client.createCollection(name, {
        vectors: { size, distance },
      });
      console.log(`✅ Created Qdrant collection: ${name} (dim=${size}, dist=${distance})`);
    } else {
      console.log(`ℹ️ Qdrant collection '${name}' already exists`);
    }
  } catch (error) {
    console.error(`Error ensuring collection '${name}':`, error);
    throw error;
  }
}

/**
 * Semantic vector search with optional payload filtering
 * @param {Object} params
 * @param {string} params.collection - Collection name
 * @param {number[]} params.vector - Query embedding vector
 * @param {Object} [params.filter] - Qdrant filter object for payload fields
 * @param {number} [params.limit=10] - Max results to return
 * @returns {Promise<Array>} Scored search results with payloads
 */
async function searchEmbedding({ collection, vector, filter, limit = 10 }) {
  try {
    const searchParams = {
      vector,
      limit,
      with_payload: true,
    };
    if (filter) {
      searchParams.filter = filter;
    }
    const results = await client.search(collection, searchParams);
    return results;
  } catch (error) {
    console.error(`Error searching collection '${collection}':`, error);
    throw error;
  }
}

/**
 * Delete a single point from a collection by ID
 * @param {Object} params
 * @param {string} params.collection - Collection name
 * @param {string|number} params.id - Point ID to delete
 */
async function deletePoint({ collection, id }) {
  try {
    await client.delete(collection, {
      wait: true,
      points: [id],
    });
    console.log(`🗑️ Deleted point ${id} from '${collection}'`);
  } catch (error) {
    console.error(`Error deleting point ${id} from '${collection}':`, error);
  }
}

/**
 * Batch upsert multiple points into a collection
 * @param {Object} params
 * @param {string} params.collection - Collection name
 * @param {Array<{id, vector, payload}>} params.points - Array of points to upsert
 */
async function upsertBatch({ collection, points }) {
  try {
    const result = await client.upsert(collection, {
      wait: true,
      points,
    });
    console.log(`📦 Upserted ${points.length} points to '${collection}'`);
    return result;
  } catch (error) {
    console.error(`Error batch upserting to '${collection}':`, error);
    throw error;
  }
}

export { client, storeEmbedding, BN_RECIPES_COLLECTION, ensureCollection, searchEmbedding, deletePoint, upsertBatch };
