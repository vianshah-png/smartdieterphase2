import { GoogleSpreadsheet } from "google-spreadsheet";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentialsPath = path.resolve(__dirname, "../../service.json");
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
  console.log("✅ Credentials loaded successfully");
} catch (error) {
  console.error("❌ Error loading credentials:", error);
  throw error;
}

function getAuth(
  scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ]
) {
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    scopes
  );
  console.log("✅ Auth created");
  return auth;
}
async function createNewGoogleSheet(sheetName) {
  try {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.create({
      requestBody: {
        name: sheetName,
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
      fields: "id",
    });

    const sheetId = response.data.id;
    console.log(`✅ New Google Sheet Created: ${sheetId}`);
    return sheetId;
  } catch (error) {
    console.error("❌ Error creating new sheet:", error);
    throw error;
  }
}

async function shareSheet(sheetId, email = "vikram.gupta@balancenutrition.in") {
  if (!email) return; 
  try {
    const auth = getAuth(["https://www.googleapis.com/auth/drive"]);
    const drive = google.drive({ version: "v3", auth });

    await drive.permissions.create({
      fileId: sheetId,
      requestBody: {
        role: "writer",
        type: "user",
        emailAddress: email,
      },
    });
    console.log(`🔑 Editor access granted to ${email}`);
  } catch (error) {
    console.error(`❌ Error sharing sheet with ${email}:`, error);
    throw error;
  }
}
async function generateDailyReport({
  data,
  sheetName = "Daily Report",
  senderEmail,
}) {
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error("Invalid or empty data provided");
    }
    if (!sheetName) {
      throw new Error("Sheet name is required");
    }
    const sheetId = await createNewGoogleSheet(sheetName);
    if (!sheetId) throw new Error("Failed to create new sheet");
    const doc = new GoogleSpreadsheet(sheetId);
    const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
    doc.auth = auth;

    await doc.loadInfo();
    console.log("✅ Spreadsheet info loaded");
    const firstSheet = doc.sheetsByIndex[0];
    const headers = Object.keys(data[0]);
    await firstSheet.setHeaderRow(headers);
    await firstSheet.addRows(data);
    console.log(`✅ All data added to first sheet: "${firstSheet.title}"`);

    if (headers.includes("mentor")) {
      // Group data by mentor
      const mentorData = {};
      data.forEach((row) => {
        const mentor = row.mentor || "Unassigned";
        if (!mentorData[mentor]) {
          mentorData[mentor] = [];
        }
        mentorData[mentor].push(row);
      });

      for (const mentor in mentorData) {
        try {
          const sheetTitle =
            mentor.length > 30 ? mentor.substring(0, 30) : mentor;
          const sheet = await doc.addSheet({ title: sheetTitle });
          console.log(`✅ New sub-sheet "${sheetTitle}" created`);

          const mentorRows = mentorData[mentor];
          if (mentorRows.length === 0) continue;

          await sheet.setHeaderRow(headers);
          await sheet.addRows(mentorRows);
          console.log(`✅ Data added to "${sheetTitle}" sheet`);
        } catch (error) {
          console.error(`❌ Error processing sheet for ${mentor}:`, error);
        }
      }
    } else {
      console.log(
        "ℹ️ No 'mentor' key found in data; skipping sub-sheet creation"
      );
    }

    await shareSheet(sheetId, senderEmail);

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    console.log(`🔗 Google Sheet is ready: ${sheetUrl}`);
    return sheetUrl;
  } catch (error) {
    console.error("❌ Error generating daily report:", error);
    throw error;
  }
}

async function generateDailyReport1({
  data,
  sheetName = "Daily Report",
  senderEmail,
}) {
  try {
    console.log("Data passed to generateDailyReport:", data); // Log data to ensure it’s valid

    // Check if the data is valid
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error("Invalid or empty data provided");
    }

    if (!sheetName) {
      throw new Error("Sheet name is required");
    }

    // Create a new Google Sheet
    const sheetId = await createNewGoogleSheet(sheetName);
    if (!sheetId) throw new Error("Failed to create new sheet");

    const doc = new GoogleSpreadsheet(sheetId);
    const auth = getAuth(["https://www.googleapis.com/auth/spreadsheets"]);
    doc.auth = auth;

    await doc.loadInfo();
    console.log("✅ Spreadsheet info loaded");

    const firstSheet = doc.sheetsByIndex[0];
    const headers = Object.keys(data[0]);
    await firstSheet.setHeaderRow(headers);
    await firstSheet.addRows(data);
    console.log(`✅ All data added to first sheet: "${firstSheet.title}"`);

    // Group data by mentor if mentor data exists
    if (headers.includes("mentor")) {
      const mentorData = {};

      // Grouping by mentor
      data.forEach((row) => {
        const mentor = row.mentor || "Unassigned";
        if (!mentorData[mentor]) {
          mentorData[mentor] = [];
        }
        mentorData[mentor].push(row);
      });

      // Create a sub-sheet for each mentor
      for (const mentor in mentorData) {
        try {
          const sheetTitle =
            mentor.length > 30 ? mentor.substring(0, 30) : mentor;
          const sheet = await doc.addSheet({ title: sheetTitle });
          console.log(`✅ New sub-sheet "${sheetTitle}" created`);

          const mentorRows = mentorData[mentor];
          if (mentorRows.length === 0) continue;

          await sheet.setHeaderRow(headers);
          await sheet.addRows(mentorRows);
          console.log(`✅ Data added to "${sheetTitle}" sheet`);
        } catch (error) {
          console.error(`❌ Error processing sheet for ${mentor}:`, error);
        }
      }
    } else {
      console.log(
        "ℹ️ No 'mentor' key found in data; skipping sub-sheet creation"
      );
    }

    // Share the generated sheet with the sender email
    await shareSheet(sheetId, senderEmail);

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    console.log(`🔗 Google Sheet is ready: ${sheetUrl}`);
    return sheetUrl;
  } catch (error) {
    console.error("❌ Error generating daily report:", error);
    throw error;
  }
}

export { generateDailyReport, generateDailyReport1 };
