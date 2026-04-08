import { config } from "dotenv";
import { Client } from "ssh2";
import fs from "fs"; // Required to write the file locally
import path from "path";
import cron from "node-cron";
import { fileURLToPath } from "url";
import { executeDualFileUploadProcess } from "./uploadDumpToDrive.js";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

// Define SSH and database connection details
const host = process.env.SERVER_HOST;
const port = process.env.SERVER_PORT;
const user = process.env.SERVER_USER;
const password = process.env.SERVER_PASSWORD;
const dbUser = process.env.MYSQL_READ_DATABASE_USER;
const dbPassword = process.env.MYSQL_READ_DATABASE_PASSWORD;
const dbName = process.env.MYSQL_READ_DATABASE_NAME;

// Remote paths for the dump files
const remoteDumpPath0 = "db_backup0.sql";
const remoteDumpPath1 = "db_backup1.sql";
let activeDumpPath; // This will be set dynamically based on the existing file
const localDumpPath = path.join(__dirname, "..", "..", "db_backup.sql");

// Function to check which dump file exists on the remote server
function checkExistingDump(sshClient, callback) {
  sshClient.exec(
    `if [ -f ${remoteDumpPath0} ]; then echo "0"; elif [ -f ${remoteDumpPath1} ]; then echo "1"; else echo "none"; fi`,
    (err, stream) => {
      if (err) {
        console.error("Error checking existing dump files:", err);
        sshClient.end();
        return;
      }

      let output = "";
      stream.on("data", (data) => {
        output += data.toString();
      });

      stream.on("close", () => {
        if (output.trim() === "0") {
          activeDumpPath = remoteDumpPath1;
          callback(remoteDumpPath1, remoteDumpPath0); // Create db_backup1, delete db_backup0
        } else if (output.trim() === "1") {
          activeDumpPath = remoteDumpPath0;
          callback(remoteDumpPath0, remoteDumpPath1); // Create db_backup0, delete db_backup1
        } else {
          activeDumpPath = remoteDumpPath0;
          callback(remoteDumpPath0, null); // Create db_backup0, no file to delete
        }
      });
    }
  );
}

// Function to retrieve the dump file using SCP
function retrieveDumpFromRemote(sshClient) {
  sshClient.sftp((err, sftp) => {
    if (err) {
      console.error("Error initiating SFTP:", err);
      sshClient.end();
      return;
    }

    // Stream the remote dump file and save it locally
    const remoteFileStream = sftp.createReadStream(activeDumpPath);
    const localFileStream = fs.createWriteStream(localDumpPath);

    remoteFileStream.pipe(localFileStream);

    localFileStream.on("close", () => {
      console.log(
        "Database dump successfully copied to local machine:",
        localDumpPath
      );
      // Execute the file upload process after retrieval
      executeDualFileUploadProcess();
      sshClient.end();
    });

    localFileStream.on("error", (err) => {
      console.error("Error saving dump file locally:", err);
      sshClient.end();
    });
  });
}

// Function to perform the MySQL dump
function performMySQLDump(sshClient, dumpToCreate, dumpToDelete) {
  // Step 1: Remove the old dump file if it exists
  const deleteCommand = dumpToDelete ? `rm ${dumpToDelete}` : "";
  sshClient.exec(deleteCommand, (err, stream) => {
    if (err && dumpToDelete) {
      console.error(`Error removing ${dumpToDelete}:`, err);
      sshClient.end();
      return;
    }

    stream.on("exit", (code) => {
      if (code === 0 || !dumpToDelete) {
        console.log(`Old dump file ${dumpToDelete || "none"} removed.`);

        // Step 2: Create a fresh dump
        const dumpCommand = `mysqldump -u ${dbUser} -p${dbPassword} ${dbName} > ${dumpToCreate}`;
        sshClient.exec(dumpCommand, (err, stream) => {
          if (err) {
            console.error("Error executing mysqldump:", err);
            sshClient.end();
            return;
          }

          stream.on("exit", (code) => {
            if (code === 0) {
              console.log(`MySQL dump created successfully at ${dumpToCreate}`);

              // Step 3: Retrieve the dump file using SCP
              retrieveDumpFromRemote();
            } else {
              console.error(`mysqldump failed with code ${code}`);
              sshClient.end();
            }
          });
        });
      } else {
        console.error(`Failed to remove old dump file with code ${code}`);
        sshClient.end();
      }
    });
  });
}

// Function to create the cron job and set up SSH commands
export function setupSSHAndCronJob() {
  cron.schedule("30 22 * * *", () => {
    console.log("Cron job started, creating SSH client...");

    const sshClient = new Client();

    sshClient.on("ready", () => {
      console.log("SSH Client::ready");

      checkExistingDump(sshClient, (dumpToCreate, dumpToDelete) => {
        performMySQLDump(sshClient, dumpToCreate, dumpToDelete);
      });
    });

    sshClient.on("error", (err) => {
      console.error("SSH ERROR:", err.message);
    });

    sshClient.on("close", () => {
      console.log("SSH connection closed");
    });

    sshClient.connect({
      host,
      port,
      username: user,
      password,
      readyTimeout: 20000,
      keepaliveInterval: 10000,
    });
  });
}
