import { Queue, Worker } from "bullmq";
import { defaultQueueConfig, redisConnection } from "../config/bullmqConfig.js";
import { storeEmbedding } from "../config/qDrantConfig.js";
import { getImageEmbeddingCloudinary } from "../controllers/contentDashboardControllers/imageSearchController.js";

// Create BullMQ notification queue
export const ImageEmbeddingQueueName = "imageEmbeddingQueue";

export const ImageEmbeddingQueue = new Queue(ImageEmbeddingQueueName, {
  connection: redisConnection,
  defaultJobOptions: defaultQueueConfig,
});

// Function to add notifications to BullMQ queue with a delay
const addImageEmbeddingToQueue = async (buffer, url) => {
  console.log(buffer, url, 16);
  await ImageEmbeddingQueue.add(
    "createAndStoreImageEmbedding",
    { buffer, url },
    {
      attempts: 3,
      delay: 0,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
};

// Worker to send notifications
const worker = new Worker(
  ImageEmbeddingQueueName,
  async (job) => {
    const { buffer, url } = job.data;
    console.log(buffer, url, 17);
    const { embeddings, metadata } = await getImageEmbeddingCloudinary(
      buffer,
      url
    );
    console.log("Image Embedding:", embeddings, metadata, 23);
    const id = uuidv4();

    // Store the embedding and Cloudinary URL in Qdrant
    await storeEmbedding({
      id,
      embedding: embeddings,
      metadata,
      collection: "content",
    });
  },
  {
    connection: redisConnection,
  }
);

// Cron job running every 15 minutes to schedule notifications
export { addImageEmbeddingToQueue };
