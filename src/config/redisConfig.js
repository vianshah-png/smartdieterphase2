// redisConfig.js
import Redis from "ioredis";

let redis = null;

export const connectRedis = () => {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    });

    redis.on("connect", () => {
      console.log("Connected to Redis");
    });

    redis.on("error", (error) => {
      console.error("Error connecting to Redis", error);
    });
  }

  return redis;
};
