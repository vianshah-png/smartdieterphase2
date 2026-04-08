import { connectRedis } from "../config/redisConfig.js";
import { ApiResponse } from "../utils/APiResponse.js";

export const redis = connectRedis();

const redisMiddleware = (key) => async (req, res, next) => {
  if (!redis) {
    return next();
  }
  try {
    let cacheKey;
    // Determine the cache key based on query parameters using a switch statement
    switch (true) {
      case !!req.query.page || !!req.query.limit || !!req.query.search:
        cacheKey = `${key}:${req.query.page}:${req.query.limit}:${req.query.search}`;
        break;
      case !!req.query.client_sub_status:
        cacheKey = `${key} : ${req.query.client_sub_status}`;
        break;
      case !!req.query.program_category && !!req.query.client_status:
        cacheKey = `${key} : ${req.query.program_category} : ${req.query.client_status}`;
        break;
      case !!req.body.page ||
        !!req.body.limit ||
        !!req.body.search ||
        !!req.body.order_type:
        cacheKey = `${key}:${req.body.page}:${req.body.limit}:${req.body.search}:${req.body.order_type}`;
        break;
      case !!req.body.page ||
        !!req.body.limit ||
        !!req.body.search ||
        !!req.body.status:
        cacheKey = `${key}:${req.body.page}:${req.body.limit}:${req.body.search}:${req.body.status}`;
        break;
      case !!req.params:
        cacheKey = `${key}:${req.params.teamId}`;
        break;
      default:
        cacheKey = key;
        break;
    }
    // Fetch data from Redis
    let cacheData = await redis.get(cacheKey);
    if (cacheData) {
      const data = JSON.parse(cacheData);
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `${key} fetched successfully`,
        data: data.data || data,
        ...(data.totalCount && { totalCount: data.totalCount }),
      });
      console.log("Given From Cache", 50);
      if (req.headers.source === "content-db")
        return res.status(200).json([apiResponse]);
      return res.status(200).json(apiResponse);
    }

    next();
  } catch (error) {
    console.error("Error fetching data from Redis:", error);
    next(error);
  }
};


export { redisMiddleware };
