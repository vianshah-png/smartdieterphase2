import jwt from 'jsonwebtoken';
import { redis } from '../middlewares/redisMiddleware.js';


const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export const getVendorToken = async ({
  cacheKey,
  lockKey,
  generateTokenFn,
  decodeJwt = true,
  bufferSeconds = 60,
  lockTTL = 10
}) => {

  const cached = await getCachedToken(cacheKey);
  if (cached) return cached;

  const lockAcquired = await redis.set(
    lockKey,
    '1',
    'NX',
    'EX',
    lockTTL
  );

  if (!lockAcquired) {
    await sleep(300);
    return getVendorToken({
      cacheKey,
      lockKey,
      generateTokenFn,
      decodeJwt,
      bufferSeconds,
      lockTTL
    });
  }

  try {

    const cachedAfterLock = await getCachedToken(cacheKey);
    if (cachedAfterLock) return cachedAfterLock;

    const { token, expiresInSeconds } = await generateTokenFn({ decodeJwt });

    await setCachedToken(
      cacheKey,
      token,
      expiresInSeconds,
      bufferSeconds
    );

    return token;

  } finally {
    await redis.del(lockKey);
  }
};

/* ------------------ Cache Helpers ------------------ */

const getCachedToken = async (cacheKey) => {
  try {
    const data = await redis.get(cacheKey);
    if (!data) return null;

    const { token, expiresAt } = JSON.parse(data);

    if (Date.now() >= expiresAt) {
      await redis.del(cacheKey);
      return null;
    }

    return token;
  } catch (err) {
    console.error('Token cache read error:', err);
    return null;
  }
};

const setCachedToken = async (
  cacheKey,
  token,
  expiresInSeconds,
  bufferSeconds
) => {
  const ttl = expiresInSeconds - bufferSeconds;
  if (ttl <= 0) return;

  const expiresAt = Date.now() + ttl * 1000;

  await redis.setex(
    cacheKey,
    ttl,
    JSON.stringify({ token, expiresAt })
  );
};
