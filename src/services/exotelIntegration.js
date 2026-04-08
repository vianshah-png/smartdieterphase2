import axios from "axios";
import {EXOTEL} from '../config/exotelConfig.js' ; 
import { getVendorToken } from "../utils/tokenManager.js";



const EXOTEL_ACCOUNT_SID = process.env.EXOTEL_ACCOUNT_SID || 'balancenutrition1m'; 
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY || 'a892d6ea804d14d89c37306f3f19ccef8c5652341a844dcb'; 
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN || 'b162c387e2b1e557c27c1e9a674f7c37caebd6a39af87b86';
const EXOTEL_SUBDOMAIN = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com' ; 
const EXOTEL_CALLER_ID = process.env.EXOTEL_CALLER_ID ||  '02247790126';

const EXOTEL_CACHE_KEY = "exotel:token";
const EXOTEL_LOCK_KEY  = "lock:exotel:token"; 

const EXOTEL_APP_CACHE_KEY = 'exotel:app:token';
const EXOTEL_APP_LOCK_KEY  = 'lock:exotel:app:token';

// console.log(EXOTEL, 'EXOTEL');

export async function getExotelAuthToken(type) {
  try {
    const token = await getVendorToken({
        cacheKey: type === 'app' ? EXOTEL_APP_CACHE_KEY : EXOTEL_CACHE_KEY,
        lockKey: type === 'app' ? EXOTEL_APP_LOCK_KEY : EXOTEL_LOCK_KEY,
        generateTokenFn: async ()=> {
          try {
            const res = await axios.post(
              `${EXOTEL.BASE_URL}/token`,
              {
                Id: type === 'app' ? EXOTEL.APP_ID : EXOTEL.CUSTOMER_ID,
                Secret: type === 'app' ? EXOTEL.APP_SECRET : EXOTEL.CUSTOMER_SECRET,
                Entity: type === 'app' ? "app" : "customer"
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  "Accept": "application/json"
                }
              }
            );
        
            const token = res.data.Data;
            const expiresInSeconds = 90 * 24 * 60 * 60; // 7776000
        
            return { token, expiresInSeconds };
        
          } catch (error) {
            console.error("generateExotelToken error:", error.response?.data || error);
            throw error;
          }
        },
        decodeJwt: false,    // not a JWT with exp claim
        bufferSeconds: 60,   // refresh 60 seconds before expiry
        lockTTL: 10          // for avoiding thundering herd
    }  );

    return token;
  }
  catch (error) {
    console.error("getExotelAuthToken error:", error.response?.data || error);
    throw error;
  }
}

export async function getAppConfig(){
  try {
    const token = await getExotelAuthToken('app');
    
    const response = await axios.get(
      `${EXOTEL.BASE_URL}/app_setting`,
      {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );
    return response.data?.Data;
  } catch (error) {
    console.error(
      "Get App Config Failed:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to fetch Exotel app config");
  }
}

export async function addAppSetting(key, value){
  try {
    const token = await getExotelAuthToken('app');
    
    const response = await axios.post(
      `${EXOTEL.BASE_URL}/app_setting`,
      {
        Key: key,
        Value: value
      },
      {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data?.Data;
  } catch (error) {
    console.error(
      "Add App Setting Failed:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to add Exotel app setting");
  }
}

export async function registerUsers(users){
  try {
    const token = await getExotelAuthToken('app');

    console.log(users, 'users') ; 
    
    const response = await axios.post(
      `${EXOTEL.BASE_URL}/usermapping`,
      users,
      {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data?.Data;
  } catch (error) {
    console.error(
      "Register Users Failed:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to register Exotel users");
  }
}


const exotelClient = axios.create({
  baseURL: `https://${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_ACCOUNT_SID}`,
  auth: {
    username: EXOTEL_API_KEY,
    password: EXOTEL_API_TOKEN,
  },
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  timeout: 15000, 
})

export const makeExotelCall = async ({
  from, // counsellor number
  to,   // customer number
  callContext = {}, // any metadata you want back in webhook
  statusCallbackUrl='',
}) => {
  if (!from || !to) {
    throw new Error("Both 'from' and 'to' numbers are required");
  }

  const payload = new URLSearchParams({
    From: from,
    To: to,
    CallerId: EXOTEL_CALLER_ID,
    Record: "true",
    RecordingFormat: "mp3",
    // StatusCallback: statusCallbackUrl,
    // StatusCallbackContentType: "application/json",
    // StatusCallbackEvents: "answered,terminal",
    ...callContext, // custom fields returned in callbacks
  });

  try {
    const response = await exotelClient.post(
      "/Calls/connect.json",
      payload
    );

    return response.data;
  } catch (error) {
    console.error(
      "Exotel Call Failed:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to initiate Exotel call");
  }
};

export const getExotelCallDetails = async (callSid) => {
  if (!callSid) {
    throw new Error("callSid is required");
  }

  try {
    const response = await exotelClient.get(
      `/Calls/${callSid}.json`
    );
    return response.data;
  } catch (error) {
    console.error(
      "Fetch Call Details Failed:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to fetch Exotel call details");
  }
};

export const listExotelCalls = async ({
  from,
  to,
  startDate,
  endDate,
  limit = 20,
}) => {
  const params = {
    From: from,
    To: to,
    DateCreated__gte: startDate,
    DateCreated__lte: endDate,
    PageSize: limit,
  };

  try {
    const response = await exotelClient.get("/Calls.json", {
      params,
    });
    return response.data;
  } catch (error) {
    console.error(
      "List Calls Failed:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to list Exotel calls");
  }
};
