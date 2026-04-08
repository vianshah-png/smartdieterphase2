import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";
dotenv.configDotenv();
const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

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
export { client, storeEmbedding };
