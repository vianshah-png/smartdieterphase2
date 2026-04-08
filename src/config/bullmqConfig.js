import IORedis from "ioredis";
import { configDotenv } from "dotenv";

configDotenv();
export const redisConnection = new IORedis.default({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,

  maxLoadingRetryTime: null,
  maxRetriesPerRequest: null,
});
export const defaultQueueConfig = {
  removeOnComplete: true,
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
};
