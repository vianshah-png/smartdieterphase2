import fs from "fs";
import { google } from "googleapis";
import apiKeys from "./../../driveApiKey.json" with { type: "json" };
import path from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPE = ["https://www.googleapis.com/auth/drive"];
async function authorize() {
  const jwtClient = new google.auth.JWT(
    apiKeys.client_email,
    null,
    apiKeys.private_key,
    SCOPE
  );

  await jwtClient.authorize();
  console.log("Successfully authorized");
  return jwtClient;
}

async function getFileId(drive, fileName, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${fileName}'`,
    fields: "files(id, name)",
  });

  const files = res.data.files;
  if (files.length > 0) {
    return files[0].id;
  } else {
    return null;
  }
}

async function deleteFile(drive, fileId) {
  await drive.files.delete({ fileId });
  console.log(`Deleted file with ID: ${fileId}`);
}

async function uploadFile(authClient, folderId, filePath, fileName) {
  const drive = google.drive({ version: "v3", auth: authClient });

  // Upload the new file
  try {
    const response = await drive.files.create({
      resource: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: "text/plain",
        body: fs.createReadStream(filePath),
      },
      fields: "id",
    });

    console.log("File uploaded with ID:", response.data.id);
    return response.data.id;
  } catch (err) {
    console.error("Error uploading file:", err);
    throw err; // Propagate the error
  }
}
const newAuthClient = await authorize();
async function uploadFileToDrive({
  authClient = newAuthClient,
  folderId,
  filePath,
  fileName,
  fileType,
}) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const fileStream = Readable.from(filePath);
  // Upload the new file
  try {
    const response = await drive.files.create({
      resource: {
        name: `${fileName.split(".")[0]}.pdf`,
        parents: [folderId],
      },
      media: {
        mimeType: fileType,
        body: fileStream,
      },
      fields: "id",
    });

    console.log("File uploaded with ID:", response.data.id);
    return response.data.id;
  } catch (err) {
    console.error("Error uploading file:", err);
    throw err; // Propagate the error
  }
}

/**
 * Dual file upload strategy.
 */
async function executeDualFileUploadProcess() {
  try {
    // Authorize the client
    const authClient = await authorize();

    // Define Google Drive folder ID
    const folderId = "1L0wwAfkgoWEYRAx5DK9sHCEiMZ1Dlyn6";

    // Define local file path and possible file names on Google Drive
    const filePath = path.join(__dirname, "..", "..", "db_backup.sql");
    const fileName0 = "myDump0.sql";
    const fileName1 = "myDump1.sql";

    const drive = google.drive({ version: "v3", auth: authClient });

    // Check if `myDump0.sql` exists
    const file0Id = await getFileId(drive, fileName0, folderId);

    let fileNameToUpload;
    let fileToDelete;

    if (file0Id) {
      // `myDump0.sql` exists, upload as `myDump1.sql` and delete `myDump0.sql`
      fileNameToUpload = fileName1;
      fileToDelete = file0Id;
    } else {
      // `myDump0.sql` does not exist, upload as `myDump0.sql` and delete `myDump1.sql`
      const file1Id = await getFileId(drive, fileName1, folderId);
      fileNameToUpload = fileName0;
      fileToDelete = file1Id;
    }

    // Upload the new file
    const newFileId = await uploadFile(
      authClient,
      folderId,
      filePath,
      fileNameToUpload
    );

    // After successful upload, delete the old file (if it exists)
    if (fileToDelete) {
      await deleteFile(drive, fileToDelete);
    }

    console.log(
      `Successfully uploaded as ${fileNameToUpload}. New File ID: ${newFileId}`
    );
  } catch (err) {
    console.error("Error in dual file upload process:", err);
  }
}

// Run the dual file upload process
// executeDualFileUploadProcess();
export { executeDualFileUploadProcess, uploadFileToDrive };
