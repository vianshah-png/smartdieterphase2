import axios from 'axios';
import jwt from 'jsonwebtoken';
import  {getVendorToken} from '../utils/tokenManager.js';

const SHIPYAARI_SIGNIN_URL ='https://api-seller.shipyaari.com/api/v1/seller/signIn';
const SHIPYAARI_ORDER_API =process.env.SHIPYAAR_ORDER_API ||"https://api-seller.shipyaari.com/api/v1/order/placeDraftOrderApi";
const SHIPYAARI_EMAIL = process.env.SHIPYAARI_EMAIL;
const SHIPYAARI_PASSWORD = process.env.SHIPYAARI_PASSWORD;

export const getShipyaariAccessToken = async () =>
  getVendorToken({
    cacheKey: 'SHIPYAARI_ACCESS_TOKEN',
    lockKey: 'SHIPYAARI_TOKEN_LOCK',

    generateTokenFn: async () => {
      const res = await axios.post(
        SHIPYAARI_SIGNIN_URL,
        {
          email: SHIPYAARI_EMAIL,
          password: SHIPYAARI_PASSWORD
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const token = res?.data?.data?.[0]?.jwt;
      if (!token) throw new Error('Shipyaari JWT missing');

      const decoded = jwt.decode(token);
      const expiresInSeconds =
        decoded.exp - Math.floor(Date.now() / 1000);

      return { token, expiresInSeconds };
    }
  });

// Create Shipyaari Draft Order
export const createShipyaariDraftOrder = async (shipyaariPayload) => {
  const token = await getShipyaariAccessToken();

  if (!token) {
    throw new Error("Failed to fetch Shipyaari JWT token");
  }

  try {
    const response = await axios.post(
      SHIPYAARI_ORDER_API,
      shipyaariPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Shipyaari Order Creation Failed:",
      error?.response?.data || error.message
    );

    throw new Error("Shipyaari order creation failed", error?.response?.data?.message || error.message);
  }
};

export const fetchShipyaariOrderStatusAndUpdate = async (awbNumbers) => {
  try {
    const response = await axios.get(
      `https://api-seller.shipyaari.com/api/v1/tracking/getTracking?trackingNo=${awbNumbers}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SHIPYAARI_JWT_TOKEN}`,
        },
      }
    );

    const trackingArray = response?.data?.data?.[0]?.trackingInfo || [];

    console.log(trackingArray, response?.data, "RESPONSE");

    // Convert into a clean { awbNumber, status } array
    return trackingArray.map((item) => ({
      awbNumber: item.awb,
      status: item.currentStatus?.trim() || "",
      fullData: item, // keep complete record if needed
    }));
  } catch (error) {
    console.error("Shipyaari Error:", error);
    return [];
  }
};
