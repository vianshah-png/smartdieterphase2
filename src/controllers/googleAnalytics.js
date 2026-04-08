import { google } from "googleapis";
import readline from "readline";
import fs from "fs";
import moment from "moment";

// Path where the tokens will be stored
const TOKEN_PATH = "./token.json"; // Path to save tokens
const YT_TOKEN_PATH = "yttoken.json"; // Path to save tokens

// Function to get the OAuth2 client and authenticate
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const CLIENT_ID = process.env.GOOGLE_ANALYTICS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ANALYTICS_CLIENT_SECRET;

export async function getAnalytics() {
  try {
    const auth = await getAuth();
    const analyticsData = google.analyticsdata("v1beta");

    const propertyId = "properties/240132448";
    const today = moment().format("YYYY-MM-DD");
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");

    async function getReport(startDate, endDate) {
      const response = await analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: "activeUsers" },
            { name: "newUsers" },
            { name: "averageSessionDuration" },
            { name: "bounceRate" },
            { name: "screenPageViews" },
          ],
        },
        auth,
      });

      const metrics = response.data.rows?.[0]?.metricValues || [];
      return {
        activeUsers: parseInt(metrics[0]?.value || "0"),
        newUsers: parseInt(metrics[1]?.value || "0"),
        avgSessionDuration: parseFloat(metrics[2]?.value || "0"),
        bounceRate: parseFloat(metrics[3]?.value || "0"),
        impressions: parseInt(metrics[4]?.value || "0"),
      };
    }

    const todayData = await getReport(today, today);
    const monthToDateData = await getReport(startOfMonth, today);
    console.log({ todayData, monthToDateData });
    return {
      today,
      todayData,
      monthToDate: monthToDateData,
      startOfMonth,
    };
  } catch (error) {
    console.error("Error in getAnalytics:", error);
    return { error: "Error fetching analytics data" };
  }
}
async function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("Authorize this app by visiting this URL:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question("Enter the authorization code: ", async (code) => {
      rl.close();

      try {
        const decodedCode = decodeURIComponent(code);
        const { tokens } = await oAuth2Client.getToken(decodedCode);
        oAuth2Client.setCredentials(tokens);

        // ⚠️ Avoid writing token file during runtime to prevent nodemon restarts
        // fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens)); // COMMENTED OUT

        console.log("Access Token:", tokens.access_token);
        console.log("Refresh Token:", tokens.refresh_token);

        resolve(oAuth2Client);
      } catch (err) {
        console.error("Error getting tokens:", err);
        reject(err);
      }
    });
  });
}

async function getYoutubeAuth() {
  const oAuth2Client = new google.auth.OAuth2();

  // Check if we have stored tokens
  if (fs.existsSync(YT_TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(YT_TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Generate the authorization URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline", // Required to get a refresh token
    scope: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ], // Scope for Analytics API
    prompt: "consent", // This forces Google to return a refresh token even if the user has already authorized
  });

  console.log("Authorize this app by visiting this URL:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question("Enter the authorization code: ", async (code) => {
      try {
        // Decode and exchange the code for tokens
        const decodedCode = decodeURIComponent(code); // Decode if URL-encoded
        const { tokens } = await oAuth2Client.getToken(decodedCode);
        oAuth2Client.setCredentials(tokens);

        // Save tokens for future use
        fs.writeFileSync(YT_TOKEN_PATH, JSON.stringify(tokens));

        console.log("Access Token:", tokens.access_token);
        console.log("Refresh Token:", tokens.refresh_token); // Should now be available

        resolve(oAuth2Client); // Return the authenticated client
      } catch (error) {
        console.error("Error getting tokens:", error);
        reject(error); // Reject the promise if there was an error
      } finally {
        rl.close();
      }
    });
  });
}

// Function to refresh the access token if needed
async function refreshAuthIfNeeded(oAuth2Client, tokenPath) {
  const credentials = oAuth2Client.credentials;
  const now = Date.now();

  if (
    !credentials ||
    !credentials.expiry_date ||
    credentials.expiry_date < now
  ) {
    console.log("Access token expired or missing. Refreshing token...");

    // Get a new access token
    const accessToken = await oAuth2Client.getAccessToken();

    // accessToken can be a string or object; set it accordingly
    if (accessToken.token) {
      oAuth2Client.setCredentials({
        ...credentials,
        access_token: accessToken.token,
      });
      fs.writeFileSync(tokenPath, JSON.stringify(oAuth2Client.credentials));
    } else if (typeof accessToken === "string") {
      oAuth2Client.setCredentials({
        ...credentials,
        access_token: accessToken,
      });
      fs.writeFileSync(tokenPath, JSON.stringify(oAuth2Client.credentials));
    } else {
      throw new Error("Failed to refresh tokens");
    }
  }
}

export const getYTAnalytics = async (req, res) => {
  try {
    // Initialize the analytics API
    const youtubeAnalytics = google.youtubeAnalytics("v3");

    // Get the OAuth2 client
    const auth = await getYoutubeAuth(); // This will wait until the user enters the authorization code

    // Refresh the token if it's expired
    await refreshAuthIfNeeded(auth, YT_TOKEN_PATH);

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const endDate = today.toISOString().split("T")[0]; // Format as YYYY-MM-DD (current date)
    const startDate = "2024-08-01"; // Start date: August 1, 2024

    // Requesting YouTube Analytics data
    const response = await youtubeAnalytics.reports.query({
      auth: auth,
      ids: "channel==UCRBg_eWt2yJreg8AZXPGvKA", // Use 'MINE' to get the authenticated user's channel data
      startDate: startDate,
      endDate: endDate,
      metrics: "views,subscribersGained,subscribersLost",
      dimensions: "day", // Daily data
    });

    console.log(response.data); // Log the full response to inspect

    // Parse the response data
    const rows = response.data.rows;

    let totalViews = 0;
    let totalSubscribers = 0;
    let subscriberChange = 0;

    // Iterate through the rows and compute the totals
    rows.forEach((row) => {
      totalViews += parseInt(row[1]); // Accessing the second value in the row (views)
      totalSubscribers += parseInt(row[2]); // Accessing the third value in the row (subscribersGained)
      subscriberChange += parseInt(row[2]) - parseInt(row[3]); // subscribersGained - subscribersLost (third - fourth value)
    });

    // Return the aggregated data as the response
    const result = {
      totalViews, // Total views (total visitors)
      totalSubscribers, // Total subscribers gained
      subscriberChange, // Difference in subscribers (gained - lost)
      startDate, // Start date (2024-08-01)
      endDate, // Today's date
    };

    console.log("YouTube Analytics Data:", result);
    return res.status(200).json(result); // Return the aggregated analytics data as the response
  } catch (error) {
    console.error("Error in getYTAnalytics:", error);
    return res.status(500).send("Error fetching YouTube Analytics data");
  }
};
