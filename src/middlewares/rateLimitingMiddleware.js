import { redis } from "./redisMiddleware.js";

const rateLimiting = async (req, res, next) => {
  try {
    const clientIP = req.socket.remoteAddress || req.headers["x-forwarded-for"];
    const key = `${clientIP}:request_count`;
    const limit = 3;
    const expiration = 1;
    const penaltyExpiration = 5;

    const requestCount = await redis.incr(key);

    if (requestCount === 1) {
      await redis.expire(key, expiration);
    }

    const timeRemaining = await redis.ttl(key);

    if (requestCount > limit) {
      await redis.expire(key, penaltyExpiration);
      return res.status(429).json({
        status: "Too Many Requests",
        message: `Please wait ${penaltyExpiration} seconds`,
      });
    }

    next();
  } catch (error) {
    console.error("Rate limiting error:", error);
    res.status(500).json({
      status: "Internal Server Error",
      message: "An error occurred while processing your request",
    });
  }
};
export { rateLimiting };
