import {redis} from '../../middlewares/redisMiddleware.js' ; 
const CACHE_KEY = 'instamojo:access_token';

export const getCachedToken = async () => {
  try {
    const cachedData = await redis.get(CACHE_KEY);

    if (!cachedData) return null;

    const { token, expiresAt } = JSON.parse(cachedData);

    if (Date.now() >= expiresAt) {
      await redis.del(CACHE_KEY);
      return null;
    }

    return token;
  } catch (error) {
    console.error('Error getting cached token:', error);
    return null;
  }
};

export const setCachedToken = async (token, expiresInSeconds) => {
  try {
    const expiresAt = Date.now() + (expiresInSeconds - 60) * 1000;

    const cacheData = JSON.stringify({
      token,
      expiresAt
    });

    await redis.setex(
      CACHE_KEY,
      expiresInSeconds - 60,
      cacheData
    );

  } catch (error) {
    console.error('Error caching token:', error);
  }
};

