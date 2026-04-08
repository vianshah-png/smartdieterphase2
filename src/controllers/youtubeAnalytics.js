import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';

// Path where the tokens will be stored
const TOKEN_PATH = 'token.json';  // Path to save tokens
const YT_TOKEN_PATH = 'yttoken.json';  // Path to save tokens

// Function to get the OAuth2 client and authenticate
async function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_ANALYTICS_CLIENT_ID,  // Your Client ID
    process.env.GOOGLE_ANALYTICS_CLIENT_SECRET,  // Your Client Secret
    "https://www.balancenutrition.in"  // Your Redirect URI
  );

  // Check if we have stored tokens
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Generate the authorization URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh token
    scope: ['https://www.googleapis.com/auth/analytics'], // Scope for Analytics API
    prompt: 'consent', // This forces Google to return a refresh token even if the user has already authorized
  });

  console.log('Authorize this app by visiting this URL:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the authorization code: ', async (code) => {
      try {
        // Decode and exchange the code for tokens
        const decodedCode = decodeURIComponent(code); // Decode if URL-encoded
        const { tokens } = await oAuth2Client.getToken(decodedCode);
        oAuth2Client.setCredentials(tokens);

        // Save tokens for future use
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

        console.log('Access Token:', tokens.access_token);
        console.log('Refresh Token:', tokens.refresh_token); // Should now be available

        resolve(oAuth2Client); // Return the authenticated client
      } catch (error) {
        console.error('Error getting tokens:', error);
        reject(error); // Reject the promise if there was an error
      } finally {
        rl.close();
      }
    });
  });
}

async function getYoutubeAuth() {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_ANALYTICS_CLIENT_ID,  // Your Client ID
      process.env.GOOGLE_ANALYTICS_CLIENT_SECRET,  // Your Client Secret
      "https://www.balancenutrition.in"  // Your Redirect URI
    );
  
    // Check if we have stored tokens
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(YT_TOKEN_PATH));
      oAuth2Client.setCredentials(token);
      return oAuth2Client;
    }
  
    // Generate the authorization URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline', // Required to get a refresh token
      scope: ['https://www.googleapis.com/auth/youtube.readonly'], // Scope for Analytics API
      prompt: 'consent', // This forces Google to return a refresh token even if the user has already authorized
    });
  
    console.log('Authorize this app by visiting this URL:', authUrl);
  
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    return new Promise((resolve, reject) => {
      rl.question('Enter the authorization code: ', async (code) => {
        try {
          // Decode and exchange the code for tokens
          const decodedCode = decodeURIComponent(code); // Decode if URL-encoded
          const { tokens } = await oAuth2Client.getToken(decodedCode);
          oAuth2Client.setCredentials(tokens);
  
          // Save tokens for future use
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  
          console.log('Access Token:', tokens.access_token);
          console.log('Refresh Token:', tokens.refresh_token); // Should now be available
  
          resolve(oAuth2Client); // Return the authenticated client
        } catch (error) {
          console.error('Error getting tokens:', error);
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
  
  if (credentials.expiry_date < now) {
    console.log('Access token expired. Refreshing token...');
    const { tokens } = await oAuth2Client.refreshAccessToken();
    oAuth2Client.setCredentials(tokens);

    // Save the refreshed token to the file
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  }
}

// Function to get Google Analytics data
export const getAnalytics = async (req, res) => {
  try {
    // Initialize the analytics API
    const analyticsData = google.analyticsdata('v1beta');

    // Get the OAuth2 client
    const auth = await getAuth();  // This will wait until the user enters the authorization code

    // Refresh the token if it's expired
    await refreshAuthIfNeeded(auth,TOKEN_PATH);

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];  // Format as YYYY-MM-DD
    const startDate = '2025-08-01';  // Start date: August 1, 2025

    // Directly passing auth in the API request
    const propertyId = 'properties/240132448'; // Your GA4 Property ID (not Measurement ID)

    // Requesting data using the Property ID for GA4
    const response = await analyticsData.properties.runReport({
      property: propertyId,  // GA4 Property ID
      requestBody: {
        dateRanges: [
          {
            startDate: startDate,  // From August 1, 2025
            endDate: endDate,      // Until today's date
          },
        ],
        metrics: [
          { name: 'sessions' },      // Total visitors (sessions)
          { name: 'newUsers' },      // Total new users
          { name: 'bounceRate' },    // Bounce rate
        ],
        dimensions: [
          { name: 'date' },  // Date dimension (optional, or remove if you want the total for the whole period)
        ],
      },
      auth: auth, // Pass in the auth object
    });

    // Parse the response data
    const rows = response.data.rows;

    let totalVisitors = 0;
    let totalNewUsers = 0;
    let totalBounceRate = 0;

    // Iterate through the rows and sum the values
    rows.forEach(row => {
      totalVisitors += parseInt(row.metricValues[0].value);  // sessions
      totalNewUsers += parseInt(row.metricValues[1].value);  // newUsers
      totalBounceRate += parseFloat(row.metricValues[2].value);  // bounceRate
    });

    // Return the aggregated data as the response
    const result = {
      totalVisitors,
      totalNewUsers,
      totalBounceRate,
      startDate,   // Start date (2025-08-01)
      endDate,     // Today's date
    };

    console.log('Analytics Data:', result);
    return res.status(200).json(result);  // Return the aggregated analytics data as the response

  } catch (error) {
    console.error("Error in getAnalytics:", error);
    return res.status(500).send("Error fetching analytics data");
  }
};


export const getYTAnalytics = async (req, res) => {
    try {
      // Initialize the analytics API
      const analyticsData = google.youtubeAnalytics('v2');
  
      // Get the OAuth2 client
      const auth = await getYoutubeAuth();  // This will wait until the user enters the authorization code
  
      // Refresh the token if it's expired
      await refreshAuthIfNeeded(auth,YT_TOKEN_PATH);
  
     // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];  // Format as YYYY-MM-DD (current date)
    const startDate = '2025-08-01';  // Start date: August 1, 2025

    // Requesting YouTube Analytics data using the `youtubeAnalytics.reports.query` method
    const response = await youtubeAnalytics.reports.query({
      auth: auth,
      ids: 'channel==MINE', // Use 'MINE' to get the authenticated user's channel data
      startDate: startDate,
      endDate: endDate,
      metrics: 'views,uniqueViews,subscribersGained,subscribersLost', // Metrics to fetch
      dimensions: 'day',  // Daily data
    });

    // Parse the response data
    const rows = response.data.rows;

    let totalSubscribers = 0;
    let subscriberChange = 0;
    let totalVisitors = 0;
    let totalUniqueUsers = 0;

    // Iterate through the rows and compute the totals
    rows.forEach(row => {
      totalVisitors += parseInt(row.metricValues[0].value);  // views (total visitors)
      totalUniqueUsers += parseInt(row.metricValues[1].value);  // uniqueViews (unique users)
      totalSubscribers += parseInt(row.metricValues[2].value);  // subscribersGained
      subscriberChange += parseInt(row.metricValues[2].value) - parseInt(row.metricValues[3].value); // subscribersGained - subscribersLost
    });

    // Return the aggregated data as the response
    const result = {
      totalSubscribers,  // Total subscribers (sum of gained)
      subscriberChange,  // Difference in subscribers (gained - lost)
      totalVisitors,     // Total visitors (views)
      totalUniqueUsers,  // Total unique users (uniqueViews)
      startDate,         // Start date (2025-08-01)
      endDate,           // Today's date
    };

    console.log('YouTube Analytics Data:', result);
    return res.status(200).json(result);  // Return the aggregated analytics data as the response

  } catch (error) {
    console.error("Error in getYTAnalytics:", error);
    return res.status(500).send("Error fetching YouTube Analytics data");
  }
  };
