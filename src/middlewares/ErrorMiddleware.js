import fs from "fs";
import path from "path";
import * as Sentry from "@sentry/node";
import { insertRecord } from "../config/query.js";

const __dirname = path.resolve();

const errorMiddleware = async (err, req, res, next) => {
  console.log("Error Middleware Triggered:", err);
  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(err);
  }

  err.message ||= "Internal Server Error";
  err.statusCode ||= 500;

  const userId = req.user?.id || null;

  const logRequest = {
    user_id: userId,
    method: req.method,
    url: req.originalUrl,
    query: JSON.stringify(req.query),
    params: JSON.stringify(req.params),
    headers: JSON.stringify(req.headers),
    request_body: JSON.stringify(req.body),
  };

  const errorLog = {
    stack: err.stack,
    message: err.message,
  };

  console.error("Error occurred:", errorLog);
  const fileMapping = {
    mentor_db: "mentor_db_error_logs.txt",
    cs_db: "cs_db_error_logs.txt",
    app: "android_error_logs.txt",
    ios: "ios_error_logs.txt",
    web: "web_error_logs.txt",
  };
  // 📝 Write error to local file (logs every error)
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "test"
  ) {
    try {
      const logDir = path.join(__dirname, "../../error_log"); // Navigate from src/middlewares to backend/error_log
      const logFilePath = path.join(
        logDir,
        fileMapping[req.headers.source] || "general_error_logs.txt"
      );

      // Ensure the directory exists
      fs.mkdirSync(logDir, { recursive: true });
      console.log("Log directory created or already exists:", logDir);
      // Build log content
      const logContent = `
[${new Date().toISOString()}] ERROR
Route: ${req.method} ${req.originalUrl}
User ID: ${userId || "N/A"}
Message: ${err.message}
Request Body: ${logRequest.request_body}
Query: ${logRequest.query}
Params: ${logRequest.params}
Headers: ${logRequest.headers}
Stack: ${err.stack}

`;
      console.log(logContent, 53);
      const result = fs.appendFileSync(logFilePath, logContent, "utf8");
      console.log(
        "Error logged to mentor_db_error_log.txt successfully:",
        result
      );
    } catch (fileErr) {
      console.error("Failed to write to mentor_db_error_log.txt:", fileErr);
    }
  }

  // Optional: Log to DB in production
  if (process.env.NODE_ENV === "production") {
    try {
      await insertRecord(
        "api_logs",
        [
          "user_id",
          "req_body",
          "req_query",
          "req_param",
          "method",
          "error",
          "status_code",
        ],
        [
          logRequest.user_id,
          logRequest.request_body,
          logRequest.query,
          logRequest.params,
          logRequest.method,
          JSON.stringify(errorLog),
          err.statusCode,
        ]
      );
    } catch (dbError) {
      console.error("Error logging to database:", dbError);
    }
  }

  return res.status(err.statusCode).json({
    status: "failure",
    message: err.message,
  });
};

export { errorMiddleware };
