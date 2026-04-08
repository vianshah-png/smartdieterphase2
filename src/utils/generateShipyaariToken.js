import axios from 'axios';
import jwt from 'jsonwebtoken';
import { redis } from '../middlewares/redisMiddleware.js';

const SHIPYAARI_SIGNIN_URL =
  'https://api-seller.shipyaari.com/api/v1/seller/signIn';

const SHIPYAARI_EMAIL = process.env.SHIPYAARI_EMAIL;
const SHIPYAARI_PASSWORD = process.env.SHIPYAARI_PASSWORD;

const SHIPYAARI_CACHE_KEY = 'SHIPYAARI_ACCESS_TOKEN';
const SHIPYAARI_TOKEN_LOCK = 'SHIPYAARI_TOKEN_LOCK';


const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


export const getShipyaariAccessToken = async () => {
  // Try cache first
  console.log('// Try cache first')
  const cachedToken = await getCachedShipyaariToken();
  console.log('//Shipyaari token', cachedToken ) ;
  if (cachedToken) return cachedToken;

  //Try acquiring Redis lock (10s)
  const lockAcquired = await redis.set(
    SHIPYAARI_TOKEN_LOCK,
    '1',
    'NX',
    'EX',
    10
  );

  // If lock NOT acquired → wait & retry
  if (!lockAcquired) {
    await sleep(300);
    return getShipyaariAccessToken();
  }

  try {
    //Double-check cache after lock
    const cachedAfterLock = await getCachedShipyaariToken();
    if (cachedAfterLock) return cachedAfterLock;

    console.log('generate fresh token'); 
    //Generate fresh token
    return await generateShipyaariTokenFromAPI();

  } finally {
    await redis.del(SHIPYAARI_TOKEN_LOCK);
  }
};

const generateShipyaariTokenFromAPI = async () => {
  const response = await axios.post(
    SHIPYAARI_SIGNIN_URL,
    {
      email: SHIPYAARI_EMAIL,
      password: SHIPYAARI_PASSWORD
    },
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const token = response?.data?.data?.[0]?.jwt;
  // const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InN1eWFzaEBraWxvYmVhdGVycy5jb20iLCJzZWxsZXJJZCI6MTQwNDc5LCJjb21wYW55SWQiOiIwMGE4ZGQ2Zi05YTcwLTQ5N2UtYjdiZC0yYzE0OTUyMWZkYWQiLCJwcml2YXRlQ29tcGFueUlkIjoxMzg5MzQsImlhdCI6MTc2NjAzNzEzMCwiZXhwIjoxNzY2NjQxOTMwfQ.Ptf5vBxKSarkS_kfWQqilGaFVZtvQSo5IHojWObZ2PQ'

  if (!token) throw new Error('Shipyaari JWT missing');

  // Decode JWT expiry
  const decoded = jwt.decode(token);
  console.log(decoded.exp, 'decoded expiry'); 
  const expiresInSeconds =
    decoded.exp - Math.floor(Date.now() / 1000);

  console.log(expiresInSeconds, 'expiresInSeconds'); 

  // const expInSec = 650 ;
 
  // Cache token with buffer
  await setCachedShipyaariToken(token, expiresInSeconds);

  return token;
};

const getCachedShipyaariToken = async () => {
  try {
    const cachedData = await redis.get(SHIPYAARI_CACHE_KEY);
    if (!cachedData) return null;

    const { token, expiresAt } = JSON.parse(cachedData);

    console.log(token, expiresAt, 'getCachedShipyaariToken'); 

    if (Date.now() >= expiresAt) {
      console.log('Greater than expiry') ;
      await redis.del(SHIPYAARI_CACHE_KEY);
      return null;
    }

    return token;
  } catch (error) {
    console.error('Shipyaari cache read error:', error);
    return null;
  }
};

const setCachedShipyaariToken = async (token, expiresInSeconds) => {
  const bufferSeconds = 60;
  const ttl = expiresInSeconds - bufferSeconds;

  const expiresAt = Date.now() + ttl * 1000;

  console.log(expiresAt, 'expiresAt'); 

  await redis.setex(
    SHIPYAARI_CACHE_KEY,
    ttl,
    JSON.stringify({ token, expiresAt })
  );
};
