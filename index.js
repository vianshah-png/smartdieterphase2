process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

// import * as Sentry from "@sentry/node";
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import moment from "moment";
import express from "express";
import morgan from "morgan";
import XLSX from "xlsx";
import "./src/config/instrument.js";
import axios from "axios";
import { errorMiddleware } from "./src/middlewares/ErrorMiddleware.js";
import cron, { schedule } from "node-cron";
dotenv.config();
// if (process.env.NODE_ENV == "production") {
//   console.log = () => {};
// }
//? Routes import
import accountsDashboardRoutes from "./src/routes/accountsDashboardRoutes/index.js";
import contentDashboardRoutes from "./src/routes/contentDashboardRoutes/index.js";
import csDashboardRoutes from "./src/routes/csDashboardRoutes/index.js";
import salesDashboardRoutes from "./src/routes/salesDashboardRoutes/index.js";
import leadAppRoutes from "./src/routes/leadAppRoutes.js";

import assessmentRoutes from "./src/routes/assessmentRoutes.js";
import callRoutes from "./src/routes/callRoutes/callRoutes.js";
import chatRoutes from "./src/routes/chatRoutes.js";
import checkoutPageRoutes from "./src/routes/checkoutPageRoutes.js";
import clientQueriesRoutes from "./src/routes/clientQueriesRoutes.js";
import commonRoutes from "./src/routes/common/index.js";
import sseRoutes from "./src/routes/dashboardNotificationRoutes.js";
import dietRoutes from "./src/routes/dietRoutes/dietRoutes.js";
import dubaiRoutes from "./src/routes/dubaiRoutes.js";
import dynamicFormRoutes from "./src/routes/dynamicFormRoutes.js";
import faqRoutes from "./src/routes/faqRoutes.js";
import claraQNARoutes from "./src/routes/claraQNARoutes.js";
import feedBackRoutes from "./src/routes/feedbackRoutes.js";
import goalRoutes from "./src/routes/goalRoutes.js";
import guideRoutes from "./src/routes/guideRoutes/guideRoutes.js";
import healthScoreRoutes from "./src/routes/healthScoreRoutes.js";
import homePageRoutes from "./src/routes/homePageRoutes.js";
import inBodyRoutes from "./src/routes/inBodyRoutes.js";
import inchRoutes from "./src/routes/inchRoutes.js";
import inductionScreenRoutes from "./src/routes/inductionScreenRoutes.js";
import ingredientChecklistRoutes from "./src/routes/ingredientChecklistRoutes.js";
import keyInsightRoutes from "./src/routes/keyInsightsRoutes/keyInsightRoutes.js";
import loginRegistrationRoutes from "./src/routes/loginRegistrationRoutes.js";
import mentorRoutes from "./src/routes/mentorDashboardRoutes/index.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import organizationManagementRoutes from "./src/routes/organizationManagementRoutes.js";
import paymentRoutes from "./src/routes/paymentRoutes/paymentRoutes.js";
import photoRoutes from "./src/routes/photoRecordRoutes.js";
import programDetailsRoutes from "./src/routes/programDetailsRoutes.js";
import recipeBookRoutes from "./src/routes/recipeBookRoutes.js";
import reviewsRoutes from "./src/routes/reviewRoutes/reviewRoutes.js";
import serviceRoutes from "./src/routes/serviceRoutes/serviceRoutes.js";
import splashScreenRoutes from "./src/routes/splashScreenDataRoutes.js";
import imageUploadRoutes from "./src/routes/uploadImageRoute.js";
import userActivityRoutes from "./src/routes/userActivityRoutes.js";
import walletRoutes from "./src/routes/walletRoutes/walletRoutes.js";
import websiteRoutes from "./src/routes/website/index.js";
import weightRoutes from "./src/routes/weightRoutes.js";
import misRoutes from "./src/routes/accountsDashboardRoutes/misRoutes.js";
import googleAnalyticsRoutes from "./src/routes/googleAnalyticsRoutes.js";
import path from "path";
import ejs from "ejs";
import ekitRoutes from "./src/routes/ekitDigitizationRoutes/ekitDigitizationRoutes.js";
import franchiseRoutes from "./src/routes/franchiseDashboardRoutes/index.js";
import productDashboardRoutes from "./src/routes/productDashboardRoutes/productDashboardRoutes.js";
import productRoutes from "./src/routes/productDashboardRoutes/productRoutes.js";
import smartScaleRoutes from "./src/routes/smartScale/smartScaleRoutes.js";
import tfacRoutes from "./src/routes/tfacRoutes/tfacRoutes.js";
import salesManagerDashboardRoutes from "./src/routes/salesManagerDashboardRoutes.js";

// import createSqlDump from "./src/utils/sqlDump.js";

// import cron from "./src/jobs/notificationQueue.js";
import { excelUpload } from "./src/config/multerConfig.js";
import { insertRecord, readRecord, updateRecord } from "./src/config/query.js";
import { app_versions, tables } from "./src/helper/constant.js";
import notificationCron from "./src/utils/notificationCron.js";
import { setupSSHAndCronJob } from "./src/utils/sqlDump.js";
import { ErrorHandler } from "./src/utils/ErrorClass.js";
import { updateMaintenanceStatus } from "./src/controllers/weightController.js";
import { ApiResponse } from "./src/utils/APiResponse.js";
import { client } from "./src/config/twilioConfig.js";
import { sendMailUtil } from "./src/utils/sendEmail.js";
import {
  handleDormantToDropoutById,
  handleDormantToDropoutByIds,
} from "./src/crons/cronFunctions.js";
import { Server } from "socket.io";
import http from "http";
import { perfLogger } from "./src/middlewares/perfLogger.js";
import "./src/crons/dbCleanup.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import session from "express-session";
import dietAuditRoutes from "./src/routes/mentorDashboardRoutes/dietAuditRoutes.js";
import nutriScanRoutes from "./src/routes/nutriScanRoutes.js";
// import { plivoClient } from "./src/config/plivoConfig.js";
// import { cleanProgramSessionsAndInsert } from "./src/migrations/index.js";

// import { reminderCron } from "./src/utils/ReminderCron.js";
// ! server instance createds
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Middleware setup
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100 mb", extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "mahi_it_secure_key", // Use a strong secret in .env
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true if using HTTPS/SSL
      maxAge: 24 * 60 * 60 * 1000, // Session expires in 24 hours
    },
  }),
);
app.use(
  compression({
    level: 9,
    filter: (req, res) => {
      if (req.path === "/start-event") return false;
      return compression.filter(req, res);
    },
  }),
);

// Use morgan for logging HTTP requests
app.use(morgan("dev"));

app.use(perfLogger(io));

const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
  res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bn 2.0 APIs</title>
    </head>
    <body style="font-family: 'Arial', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh;">
      <div style="text-align: center; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
        <h1 style="color: #333333;">Welcome to the  BN-2.0-API</h1>
        <p style="color: #666666;">This is the first Landing Page to BN Node Backend !</p>
        <p style="color: #666666;">Use Postman or any API client to interact with the endpoints.</p>
        <button style="margin-top: 20px; padding: 10px 20px; background-color: #007bff; color: #ffffff; border: none; border-radius: 4px; cursor: pointer;" onclick="window.location.href='/api/v1/admin/login'">Login to Control Panel</button>
      </div>
    </body>
  </html>`);
});

// app.use((req, res, next) => {
//     const targetHost = 'https://bn-api-test.balancenutrition.in';
//     const newUrl = `${targetHost}${req.originalUrl}`;
//     console.log(`Redirecting [${req.method}] ${req.originalUrl} -> ${newUrl}`);
//     return res.redirect(307, newUrl);
// });

app.use("/api/v1/admin", adminRoutes);

if (process.env.NODE_ENV === "production") {
  notificationCron();
}
app.use(async (req, res, next) => {
  if (!req.originalUrl.startsWith("/api/v1/diet")) {
    console.log("not a diet route");
    return next();
  }
  console.log("diet route");
  if (process.env.NODE_ENV !== "production") {
    // Skip logging in non-production environments
    return next();
  }

  const startTime = Date.now();
  const userId = req.user_id || null; // Assuming user_id is set somewhere (e.g., from JWT)

  // Capture request details
  const logRequest = {
    user_id: userId,
    method: req.method,
    url: req.originalUrl,
    query: JSON.stringify(req.query),
    params: JSON.stringify(req.params),
    headers: JSON.stringify(req.headers),
    request_body: JSON.stringify(req.body),
  };

  // Capture the original `send` method to log the response after it's sent
  const originalSend = res.send;

  res.send = async function (body) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const logResponse = {
      status_code: statusCode,
      response_body: body,
      duration: duration,
    };

    // Insert logs into DB (Prisma example)
    try {
      await insertRecord(
        "api_logs",
        [
          "user_id",
          "req_body",
          "req_query",
          "req_param",
          "method",
          "res_body",
          "error",
          "status_code",
        ],
        [
          logRequest.user_id,
          logRequest.request_body,
          logRequest.query,
          logRequest.params,
          logRequest.method,
          logResponse.response_body,
          null,
          logResponse.status_code,
        ],
      );
    } catch (err) {
      console.error("Error inserting log into DB:", err);
    }

    // Call the original send method
    originalSend.call(res, body);
  };

  next();
});

// ? Content Dashboard Routes
app.use("/api/v1/", contentDashboardRoutes);

//? Sales Dashboard routes
app.use("/api/v1/sales", salesDashboardRoutes);

//? Cs Dashboard Routes
app.use("/api/v1/cs", csDashboardRoutes);
app.use("/api/v1/accounts", accountsDashboardRoutes);

//? Reviews Routes
app.use("/api/v1/reviews", reviewsRoutes);
app.use("/api/v1/diet-audit", dietAuditRoutes);
app.use("/api/v1/nutriscan", nutriScanRoutes);

app.use("/api/v1/splash-screen", splashScreenRoutes);
app.use("/api/v1/assessment", assessmentRoutes);
app.use("/api/v1/induction-flow", inductionScreenRoutes);
app.use("/api/v1/program-details", programDetailsRoutes);
app.use("/api/v1/weight", weightRoutes);
app.use("/api/v1/inch", inchRoutes);
app.use("/api/v1/login-registration", loginRegistrationRoutes);

app.use("/api/v1/diet", dietRoutes);
app.use("/api/v1/call", callRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/utils", imageUploadRoutes);
app.use("/api/v1/common", commonRoutes);
app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/services", serviceRoutes);
app.use("/api/v1/guide", guideRoutes);
app.use("/api/v1/key-insights", keyInsightRoutes);
app.use("/api/v1/mentor", mentorRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/feedback", feedBackRoutes);
app.use("/api/v1/goal", goalRoutes);
app.use("/api/v1/dynamic-form", dynamicFormRoutes);
app.use("/api/v1/photo", photoRoutes);
app.use("/api/v1/client-queries", clientQueriesRoutes);
app.use("/api/v1/health-score", healthScoreRoutes);

app.use("/api/v1/event", sseRoutes);
app.use("/api/v1/ingredient-checklist", ingredientChecklistRoutes);
app.use("/api/v1/dubai", dubaiRoutes);

app.use("/api/v1/notifications", notificationRoutes);

app.use("/api/v1/recipe-book", recipeBookRoutes);
app.use("/api/v1/user-activity", userActivityRoutes);

app.use("/api/v1/inbody", inBodyRoutes);
app.use("/api/v1/homepage", homePageRoutes);
app.use("/api/v1/post-purchase-mis", misRoutes);

app.use("/api/v1/web", websiteRoutes);
app.use("/api/v1/faq", faqRoutes);
app.use("/api/v1/clara-qna", claraQNARoutes);
app.use("/api/v1/checkout", checkoutPageRoutes);

app.use("/api/v1/ekit", ekitRoutes);

app.use("/api/v1/lead-app", leadAppRoutes);

app.use("/api/v1/googleAnalytics", googleAnalyticsRoutes);

app.use("/api/v1/franchise", franchiseRoutes);

app.use("/api/v1/product-dashboard", productDashboardRoutes);
app.use("/api/v1/shop-product", productRoutes);
app.use("/api/v1/smart-scale", smartScaleRoutes);
app.use("/api/v1/tfac", tfacRoutes);
app.use("/api/v1/sales-manager", salesManagerDashboardRoutes);

app.get("/api/v1/test", (req, res) => {
  console.log("Test endpoint hit");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/v1/active-maintenance", async (req, res, next) => {
  const userId = req.query.user_id;

  if (!userId) {
    return next(new ErrorHandler("Missing user_id in query", 400));
  }

  try {
    const { success } = await updateMaintenanceStatus({ user_id: userId });
    console.log("success", success);
    if (!success) {
      return next(
        new ErrorHandler(
          "Error while activating maintenance. Maybe no assessment found.",
          400,
        ),
      );
    }

    res
      .status(200)
      .json(new ApiResponse({ message: "Maintenance activated successfully" }));
  } catch (err) {
    next(err);
  }
});
app.use("/api/v1/organization", organizationManagementRoutes);

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
app.get("/send-app-update-mail-oc-nri", async (req, res, next) => {
  try {
    const { user_status } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.plain_password",
        "ud.first_name",
        `(
          SELECT device 
          FROM bn_user_fcm_token 
          WHERE user_id = ud.user_id 
          ORDER BY id DESC 
          LIMIT 1
        ) AS device`,
      ],
      conditions: [
        {
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('1.1.14','5.2.58')`,
          raw: true,
        },
        {
          field: "ud.phone_code",
          operator: " NOT IN ",
          value: `('91','+91',null,'')`,
          raw: true,
        },
        {
          field: "ud.email_id",
          operator: " NOT LIKE ",
          value: `'%dummy%'`,
          raw: true,
        },
        {
          field: "DATE(ud.offer_mail)",
          operator: ">",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_status.toLowerCase() === "oc" ? "Completed" : "Active",
        },
        {
          field: "ud.mentor_assigned",
          operator: " != ",
          value: 196,
        },
      ],
      pagination: { page: 1, limit: 50 },
    });

    const batches = chunkArray(results, 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          let fromEmail = `khyati.rupani@balancenutrition.in`;
          let link = `https://www.balancenutrition.in/download-bn-app`;

          if (["iOS", "iPadOS", "ios"].includes(element.device)) {
            fromEmail = `khyati_rupani@balancenutrition.in`;
            link = `https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
          } else if (element.device === "android") {
            fromEmail = `khyati.rupani@balancenutrition.in`;
            link = `https://play.google.com/store/apps/details?id=in.clientexclusive.balance`;
          }

          const firstName = (element.first_name || "there").split(" ")[0];

          const html = `
            <p>Hi ${firstName},</p>

            <p>As a BN Client, you have many privileges that are lying <strong>UNUSED</strong> in your BN Account.</p>

            <p>The BN App has got an upgrade and has many new <strong>Trackers</strong> that are available to you for <strong>FREE</strong> &amp; impact your health positively.</p>

            <p><strong>How to Access the Updated App?</strong></p>
            <ol>
              <li>Please delete the current app and download the app from the link below once:<br>
                <a href="${link}" target="_blank">Click Here</a>
              </li>
            </ol>

            <p><strong>Your Login Details</strong></p>
            <ul>
              <li><strong>Email:</strong> ${element.email_id}</li>
              <li><strong>Password:</strong> ${element.plain_password}</li>
            </ul>

            <p><strong>P.S.</strong> Please connect with Client Services on <a href="tel:+918928001617">+91-8928001617</a> in case you have any queries or get stuck.</p>

            <p><strong>P.P.S.</strong> Book a call with your mentor to understand your free trackers: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45" target="_blank">Click Here</a></p>
          `;

          await sendMailUtil({
            from: fromEmail,
            to: element.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: ["testerteam@balancenutrition.in"],
            subject: "Your Program is Not Over Yet.",
            html: html,
          });

          await updateRecord(
            tables.userDetails,
            { offer_mail: `${moment().format("YYYY-MM-DD")}` },
            { user_id: element.user_id },
          );
        }),
      );

      // Optional delay between batches (e.g., 2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res
      .status(200)
      .json({ success: true, message: "All batches sent successfully" });
  } catch (error) {
    console.error("Send App Update Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});
app.get("/send-platinum-mail-oc-nri", async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.plain_password",
        "ud.first_name",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_email`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_wa`,
        `(SELECT ad.designation FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_designation`,
        `(SELECT ad.call_link FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS call_link`,
      ],
      conditions: [
        {
          field: "DATE(ud.offer_mail)",
          operator: "!=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "ud.email_id",
          operator: "IN",
          value:
            "('lavinagovind1@hotmail.com','natasha@nvkdesigns.com','naseemkazi@gmail.com','rodriguesdeepali@gmail.com','sonataylor@gmail.com','nnehaa4@gmail.com','dcgn2005@yahoo.com','priyamanishlalwani@yahoo.com','rashmijashnani@hotmail.com','stb@bhatiatraders.com','nicolette_26@hotmail.com','neetas1234@gmail.com','aishwarya.menon29@gmail.com','aditimaiti@gmail.com','pjbisht9@gmail.com','sangeetanirikhi@yahoo.co.in','rahukalwanidummy@gmail.com','rkginternational909@gmail.com','dipikasachanandani@gmail.com','rajneesh.rehncy@gmail.com','kirtziyer@gmail.com','Bren.sunshine@gmail.com','digeil@hotmail.com','gidwanigulshan@gmail.com','Urvashi@searchpoint.ae','Pooja.veragiwala@gmail.com','drsimymathew@gmail.com','Pinkichandhok@gmail.com','nasreen@polka.co.za','tarnimnensey@gmail.com','ashipreets@gmail.com','dhiraj.mishra@balancenutrition.in','vikram.gupta@balancenutrition.in')",
          raw: true,
        },
      ],
      pagination: { page: 1, limit: 50 },
    });

    const batches = chunkArray(results, 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          let fromEmail = `khyati.rupani@balancenutrition.in`;
          let link = `https://www.balancenutrition.in/download-bn-app`;

          const firstName = (element.first_name || "there").split(" ")[0];

          const html = `
           <p style="margin:0 0 15px 0;">Hi ${firstName},</p>

                <p style="margin:0 0 15px 0;">
                  As a valued Platinum client, you’re getting <strong>Exclusive access to the Black Friday Sale!</strong>
                </p>

                <p style="margin:0 0 15px 0;">
                  For the next 48 hours, get <strong>up to 70% off</strong> on all our Premium WhatsApp-based Diet Programs.
                </p>

                <p style="margin:0 0 10px 0; font-weight:bold;">
                  The Privy &amp; Platinum Program includes:
                </p>

                <ul style="margin:0 0 15px 20px; padding:0;">
                  <li style="margin-bottom:5px;">Unlimited WhatsApp access with Khyati or your Mentor</li>
                  <li style="margin-bottom:5px;">Weight tracking &amp; reminders on WhatsApp</li>
                  <li style="margin-bottom:5px;">Query replies on WhatsApp</li>
                </ul>

                <p style="margin:0 0 15px 0;">
                  This is the <strong>LOWEST RATE</strong> you will get on all Balance Nutrition programs.
                </p>

                <p style="margin:0 0 5px 0;">
                  WhatsApp ${element.mentor_designation}  on: <a href="tel:${element.mentor_wa}" style="color:#007bff; text-decoration:none;">${element.mentor_wa}</a>
                </p>
                <p style="margin:0 0 20px 0;">
                  To speak to her: <a href="${element.call_link}" style="color:#007bff; text-decoration:underline;">Click here</a>
                </p>

                <p style="margin:0; font-weight:bold;">
                  P.S. These prices are scarce. Don’t miss out.
                </p>

          `;

          await sendMailUtil({
            from: fromEmail,
            to: element.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: [element.mentor_email],
            subject: "Black Friday Deals for YOU!🎉",
            html: html,
          });

          await updateRecord(
            tables.userDetails,
            { offer_mail: `${moment().format("YYYY-MM-DD")}` },
            { user_id: element.user_id },
          );
        }),
      );

      // Optional delay between batches (e.g., 2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res
      .status(200)
      .json({ success: true, message: "All batches sent successfully" });
  } catch (error) {
    console.error("Send App Update Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});
app.get("/send-wallet-offer-update-mail-usa", async (req, res, next) => {
  try {
    const { user_status } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.plain_password",
        "ud.first_name",
        `(
          SELECT device 
          FROM bn_user_fcm_token 
          WHERE user_id = ud.user_id 
          ORDER BY id DESC 
          LIMIT 1
        ) AS device`,
        "ud.my_wallet",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_email`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_wa`,
        "(SELECT program_id FROM suggested_program WHERE user_id = ud.user_id ORDER BY suggested_program_id DESC LIMIT 1) AS sugg_program_id",
      ],
      conditions: [
        {
          field: "ud.email_id",
          operator: " NOT LIKE ",
          value: `'%dummy%'`,
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_status.toLowerCase() === "oc" ? "Completed" : "Active",
        },
        { field: "ud.my_wallet", operator: ">", value: 14000 },
        {
          field: "DATE(ud.offer_mail)",
          operator: "<>",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "ud.phone_code",
          operator: " IN ",
          value: `('1','+1')`,
          raw: true,
        },
        // { field: "ud.mentor_assigned", operator: "<>", value: 196 },
        // { field: "ud.user_id", operator: "=", value: 127054 }, // keep/remove as needed
      ],
    });

    const batches = chunkArray(results || [], 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          // Fixed FROM per your instruction
          const fromEmail = `Khyati Rupani <khyati.rupani@balancenutrition.in>`;

          // Platform-aware download link for P.S.
          let downloadLink = `https://www.balancenutrition.in/download-bn-app`;
          const dev = (element.device || "").toLowerCase();
          if (["ios", "ipados"].includes(dev)) {
            downloadLink = `https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
          } else if (dev === "android") {
            downloadLink = `https://play.google.com/store/apps/details?id=in.clientexclusive.balance`;
          }

          // Mentor contact bits (fallbacks to your given copy)
          const mentorName = element.mentor_name || "Your Mentor"; // use literal per brief
          const callLink =
            "https://www.balancenutrition.in/app_link/screen_id=29/call_type=45"; // scheduling link
          const waDigits = element.mentor_wa || "";
          const waLink = waDigits ? `https://wa.me/91${waDigits}` : "";

          const firstName = (element.first_name || "there").split(" ")[0];

          const wallet = element.my_wallet || 0;

          const html = `
            <p>Hi ${firstName},</p>

            <p>I wanted to share an important update that you have <strong>Rs.${wallet}</strong> in your BN Wallet expiring on <strong>Saturday</strong>. With this amount, your next program could be <strong>FREE</strong>.</p>

            <p>The BN App also has an upgrade with guides that have foods from brands readily available in the USA. This will make it a lot easier for you to follow the diets.</p>

            <p>To discuss this in detail, fix a call with your mentor, <strong>${mentorName}</strong>:
              <a href="${callLink}" target="_blank">Link</a>
            </p>

            <p>Feel free to WhatsApp her at: ${waLink
              ? `<a href="${waLink}" target="_blank">${element.mentor_wa}</a>`
              : ""
            }</p>

            <p><strong>P.S.</strong> Your BN App is not updated.
              <a href="${downloadLink}" target="_blank">Click here to download the app</a>.
            </p>
          `;

          await sendMailUtil({
            from: fromEmail,
            to: element.email_id,
            cc: [
              "clientservices@balancenutrition.in",
              element.mentor_email,
            ].filter(Boolean),
            bcc: ["testerteam@balancenutrition.in"],
            subject: `Rs.${wallet} Credited in your Account`,
            html,
          });

          // Mark as mailed today (keep your existing write)
          await updateRecord(
            tables.userDetails,
            { offer_mail: `${moment().format("YYYY-MM-DD")}` },
            { user_id: element.user_id },
          );
        }),
      );

      // small throttle between batches
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res
      .status(200)
      .json({ success: true, message: "All batches sent successfully" });
  } catch (error) {
    console.error("Send Offer Update Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});

app.get("/send-bn-product-mail", async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.first_name",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_email`,
      ],
      conditions: [
        {
          field: "DATE(ud.diwali_mail)",
          operator: "<>",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "ud.phone_code",
          operator: "IN",
          value: "('91','+91')",
          raw: true,
        },
        {
          field: "ud.user_id",
          operator: "IN",
          value:
            "(127054,5524,9323,10135,10808,13452,13887,15637,15647,15654,17925,18618,21323,22142,25836,26273,37412,47499,48545,51309,53326,56290,56472,59436,63125,67017,68538,70497,71235,73021,73316,73780,75326,75950,77209,77893,83326,85738,87220,89111,89998,90124,92418,94162,96174,96581,99231,101033,105194,105225,106716,107363,108086,108745,109327,110758,111582,112205,112753,114742,114935,116032,116064,117415,117888,118137,118258,118272,118674,118954,119122,119580,119904,120239,121107,121479,123156,123181,123356,123942,124253,125159,125390,125719,126891,126892,127254,127290,127328,127887,128279,128413,128530,129086,129219,129330,129565,129780,129836,129918,130122,130260,130532)",
          raw: true,
        },
      ],
    });

    const subjects = [
      "Healthy & Tasty Meals Delivered by BN",
      "Important Update",
      "Low Calorie Snacks & Meals",
      "BN Snacks & Munchies",
    ];

    const batches = chunkArray(results || [], 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          const fromEmail = `Khyati Rupani <khyati.rupani@balancenutrition.in>`;
          const firstName = (element.first_name || "there").split(" ")[0];

          // Random subject selection
          const subject = subjects[Math.floor(Math.random() * subjects.length)];

          const html = `
            <p>Dear ${firstName},</p>
            <p>I hope you enjoyed the <strong>Diwali Healthy Snack & Meal hamper</strong> we sent from Balance Nutrition. We are very thankful for the feedback that has poured in from all of you.</p>
            <p>All the food items are Low in Calories, High in Protein & are safe to consume by diabetics, Weight watchers, those having thyroid, peri-menopause & even fatty liver.</p>
            <p>Please feel free to visit the SHOP section on the website & place your orders: 
              <a href="https://www.balancenutrition.in/shop" target="_blank"><strong>LINK</strong></a>
            </p>
            <p>Here’s a quick reminder of what you tried:</p>
            <ul>
              <li><strong>Nippat</strong> – a light baked snack, under 150 calories, perfect with your evening chai.
                <a href="https://www.balancenutrition.in/shop/baked-nippat" target="_blank"><strong>Order here</strong></a>
              </li>
              <li><strong>Makhana Chips</strong> – a smart swap for your chaat cravings.
                <a href="https://www.balancenutrition.in/shop/makhana-chips" target="_blank"><strong>Order here</strong></a>
              </li>
              <li><strong>Chocolate Cookies</strong> – 0 sugar, made to satisfy your sweet tooth while on a diet.
                <a href="https://www.balancenutrition.in/shop/dessert-cookies-chocolate" target="_blank"><strong>Order here</strong></a>
              </li>
              <li><strong>Quicky</strong> – a high-protein mix, ideal for breakfast or as a quick filler when you’re on the go.
                <a href="https://www.balancenutrition.in/shop/quicky" target="_blank"><strong>Order here</strong></a>
              </li>
              <li><strong>Khatta Meetha</strong> – a wholesome and healthier take on upma, great for a mid-day meal.
                <a href="https://www.balancenutrition.in/shop/khatta-meetha-quicky" target="_blank"><strong>Order here</strong></a>
              </li>
            </ul>
            <p>I’d love to know which ones you enjoyed most. Your feedback means a lot as we shape the next range of Balance Nutrition snacks.</p>
            <p>For Bulk Orders, please reach out to Rahul: 
              <a href="https://wa.me/918928001611" target="_blank">8928001611</a>
            </p>
            <p>Warm regards,</p>
            <p><strong>Khyati Rupani</strong><br>Founder & Chief Nutritionist<br>Balance Nutrition</p>
          `;

          await sendMailUtil({
            from: fromEmail,
            to: element.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: [
              element.mentor_email,
              "anchalsingh@balancenutrition.in",
              "khushi.gupta@balancenutrition.in",
            ].filter(Boolean),
            subject,
            html,
          });

          await updateRecord(
            tables.userDetails,
            { diwali_mail: `${moment().format("YYYY-MM-DD")}` },
            { user_id: element.user_id },
          );
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res.status(200).json({
      success: true,
      message: "Diwali product mail sent successfully",
    });
  } catch (error) {
    console.error("Send Diwali Product Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});

app.get("/send-app-update-mail", async (req, res, next) => {
  try {
    const { user_status } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "ud.plain_password",
        "ud.first_name",
        `(
        SELECT device 
        FROM bn_user_fcm_token 
        WHERE user_id = ud.user_id 
        ORDER BY id DESC 
        LIMIT 1
      ) AS device`,
      ],
      conditions: [
        {
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('1.1.14','5.2.58')`,
          raw: true,
        },
        {
          field: "ud.email_id",
          operator: " NOT LIKE ",
          value: `'%dummy%'`,
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_status.toLowerCase() === "oc" ? "Completed" : "Active",
        },
        // {
        //   field: "ud.user_id",
        //   operator: " NOT IN ",
        //   value: `(123185,123186,123187,123189,123190,123193,123205,123211,123212,123215,123217,123218,123231,123239,123251,123252,123301,123346,125202,125398,125168,125397,125184,125390,125400,125214,125208,125427,125389,125198,125212,125228,125234,125238,125242,125254,125387,125469,125471,125516,125620,125659)`,
        //   raw: true,
        // },
        {
          field: "ud.mentor_assigned",
          operator: " != ",
          value: 196,
        },

        // {
        //   field: "ud.user_id",
        //   operator: "IN ",
        //   value: `(123185,123186,123187,123189,123190,123193,123205,123211,123212,123215,123217,123218,123231,123239,123251,123252,123301,123346)`,
        //   raw: true,
        // },
        // {
        //   field: "ud.user_id",
        //   operator: " NOT IN ",
        //   value: `(125202,125398,125168,125397,125184,125390,125400,125214,125208,125427,125389,125198,125212,125228,125234,125238,125242,125254,125387,125469,125471,125516,125620,125659)`,
        //   raw: true,
        // },
        // {
        //   field: "date(ud.added_date)",
        //   operator: " >= ",
        //   value: `'2025-01-01'`,
        //   raw: true,
        // },
      ],
    });

    const batches = chunkArray(results, 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          let fromEmail = `khyati.rupani@balancenutrition.in`;
          let link = `https://www.balancenutrition.in/download-bn-app`;
          if (["iOS", "iPadOS", "ios"].includes(element.device)) {
            fromEmail = `khyati@balancenutrition.in`;
            link = `https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
          } else if (element.device === "android") {
            fromEmail = `khyatirupani@balancenutrition.in`;
            link = `https://play.google.com/store/apps/details?id=in.clientexclusive.balance`;
          }
          // fromEmail = `khyati.rupani@balancenutrition.in`;
          const html = await ejs.renderFile("src/mails/appUpdateMail.ejs", {
            userName: element.first_name,
            appLink: link,
            userEmail: element.email_id,
            userPassword: element.plain_password,
          });

          await sendMailUtil({
            from: fromEmail,
            to: element.email_id,
            cc: ["clientservices@balancenutrition.in"],
            //  cc: ["clientservices@balancenutrition.in","vidhu.aug5@gmail.com"],
            // cc: ["clientservices@balancenutrition.in","Sujasavio@deloitte.com","pbirari@deloitte.com"],
            bcc: ["testerteam@balancenutrition.in"],
            subject: "Urgent Message from your Mentor",
            html: html,
          });
        }),
      );

      // Optional delay between batches (e.g., 2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res
      .status(200)
      .json({ success: true, message: "All batches sent successfully" });
  } catch (error) {
    console.error("Send App Update Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});
app.get("/send-guide-update-mail", async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "ud.plain_password",
        "ud.first_name",
        "ud.user_id",
        `(
        SELECT device 
        FROM bn_user_fcm_token 
        WHERE user_id = ud.user_id 
        ORDER BY id DESC 
        LIMIT 1
      ) AS device`,
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_email`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
      ],
      conditions: [
        // alchol no
        {
          field: "ud.user_id",
          operator: "IN",
          value: `(127054,128011,128071,123251,123185,123186,123187,123189,123190,123193,123205,123211,123212,123215,123217,123218,123231,123239,123252,123301,123346,125202,125398,125168,125397,125184,125390,125400,125214,125208,125427,125389,125198,125212,125228,125234,125238,125242,125254,125387,125469,125471,125516,125620,125659)`,
          raw: true,
        },
        // {
        //   field: "ud.user_id",
        //   operator: "IN",
        //   value: `(127054)`,
        //   raw: true,
        // },
      ],
    });

    const batches = chunkArray(results, 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          let fromEmail = `khyati.rupani@balancenutrition.in`;
          let link = `https://www.balancenutrition.in/download-bn-app`;
          if (["iOS", "iPadOS", "ios"].includes(element.device)) {
            fromEmail = `khyati@balancenutrition.in`;
            link = `https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
          } else if (element.device === "android") {
            fromEmail = `khyatirupani@balancenutrition.in`;
            link = `https://play.google.com/store/apps/details?id=in.clientexclusive.balance`;
          }
          fromEmail = `khyati.rupani@balancenutrition.in`;
          let html = "";

          if ([123251, 127054].includes(element.user_id)) {
            html = await ejs.renderFile(
              "src/mails/alcoholGuideUpdateMail.ejs",
              {
                name: element.first_name,
                restaurantGuideLink:
                  "https://balancenutrition.in/bn-restaurant-guide?client_id=" +
                  element.user_id,
                alcoholGuideLink:
                  "https://balancenutrition.in/bn-alcohol-guide?client_id=" +
                  element.user_id,
              },
            );
          } else {
            html = await ejs.renderFile(
              "src/mails/restaurantGuideUpdateMail.ejs",
              {
                name: element.first_name,
                restaurantGuideLink:
                  "https://balancenutrition.in/bn-restaurant-guide?client_id=" +
                  element.user_id,
              },
            );
          }

          if (
            [
              125202, 125398, 125168, 125397, 125184, 125390, 125400, 125214,
              125208, 125427, 125389, 125198, 125212, 125228, 125234, 125238,
              125242, 125254, 125387, 125469, 125471, 125516, 125620, 125659,
            ].includes(element.user_id)
          ) {
            await sendMailUtil({
              from: fromEmail,
              to: element.email_id,
              cc: ["clientservices@balancenutrition.in"],
              bcc: [
                "testerteam@balancenutrition.in",
                `"${element.mentor_email}"`,
              ],
              subject: "Important Updates for Deloitte Clients",
              html: html,
            });
          } else if (
            [
              123185, 123186, 123187, 123189, 123190, 123193, 123205, 123211,
              123212, 123215, 123217, 123218, 123231, 123239, 123251, 123252,
              123301, 123346,
            ].includes(element.user_id)
          ) {
            await sendMailUtil({
              from: fromEmail,
              to: element.email_id,
              cc: ["clientservices@balancenutrition.in"],
              bcc: [
                "testerteam@balancenutrition.in",
                `"${element.mentor_email}"`,
              ],
              subject: "Important Updates for Sabin Clients",
              html: html,
            });
          } else if ([128011, 128071].includes(element.user_id)) {
            await sendMailUtil({
              from: fromEmail,
              to: element.email_id,
              cc: ["clientservices@balancenutrition.in"],
              bcc: [
                "testerteam@balancenutrition.in",
                `"${element.mentor_email}"`,
              ],
              subject: "Important Updates for Forcepoint Clients",
              html: html,
            });
          } else {
            await sendMailUtil({
              from: fromEmail,
              to: element.email_id,
              cc: ["clientservices@balancenutrition.in"],
              bcc: [
                "testerteam@balancenutrition.in",
                `"${element.mentor_email}"`,
              ],
              subject: "Important Updates for BN Clients",
              html: html,
            });
          }
        }),
      );

      // Optional delay between batches (e.g., 2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res
      .status(200)
      .json({ success: true, message: "All batches sent successfully" });
  } catch (error) {
    console.error("Send App Update Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});

app.get("/send-diwali-surprise-mail", async (req, res, next) => {
  try {
    // Extract the user_ids array from the query parameter
    const userIds = req.query.user_ids ? req.query.user_ids.split(",") : [];

    // Check if user_ids are provided
    if (userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No user IDs provided" });
    }

    // Query to get users' email and names based on the provided user_ids
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "ud.first_name",
        "ud.user_id",
        "ud.phone_number", // Assuming phone number is stored here
        "ud.phone_code", // Assuming country code is stored here
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_wa`,
        "ud.user_id as client_id", // Assuming client ID is stored here
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "IN",
          value: `(${userIds.join(",")})`, // Dynamically add user_ids to the query
          raw: true,
        },
      ],
    });

    // Check if any users are found
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found for the provided IDs",
      });
    }

    // Loop through each user to send the email and WhatsApp message
    for (const element of results) {
      // Sending email logic (similar to what you already have)
      const htmlContent = `
        <p>Hi ${element.first_name},</p>
        <p>This Diwali marks a new beginning for us at Balance Nutrition (BN) as we launch our very own healthy snack, breakfast & sweet range.</p>
        <p>Each product has been personally curated by me, keeping health in mind. These are ideal for diabetics, weight watchers & even children. To celebrate, we’d love to send you a little Diwali surprise!</p>
        <p><strong>Could you share your full shipping address with the pin-code so we can ensure your gift reaches you on time?</strong></p>
        <p>Just reply to this email with your complete address.</p>
        <p>Your feedback, as always, will shape what comes next.</p>
        <p>Wishing you and your family a Diwali filled with good health, warmth, and happy memories.</p>
      `;

      await sendMailUtil({
        from: "khyati.rupani@balancenutrition.in",
        to: element.email_id,
        subject: "Urgent Communication",
        html: htmlContent,
        cc: ["accounts@balancenutrition.in", "anchalsingh@balancenutrition.in"],
        bcc: [],
      });

      // Now send the WATI WhatsApp message directly in this function
      const fullPhone = `${element.phone_code?.replace(
        /\D/g,
        "",
      )}${element.phone_number?.replace(/\D/g, "")}`;

      if (
        !element.first_name ||
        !element.mentor_name ||
        !element.mentor_wa ||
        !fullPhone
      ) {
        console.warn(
          `⏭ Skipping user ${element.client_id} due to missing fields`,
        );
        continue; // Skip if essential fields are missing
      }

      try {
        const response = await axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
          {
            template_name: "diwali_surprise_wati", // The template to be used
            broadcast_name: "diwali_surprise_wati", // Template broadcast name
            parameters: [
              { name: "name", value: element.first_name },
              { name: "mentor_name", value: element.mentor_name },
              { name: "client_id", value: element.client_id },
              { name: "email_id", value: element.email_id },
              { name: "mentor_wa", value: element.mentor_wa },
            ],
          },
        );
        console.log(
          `✅ WATI sent to ${element.client_id} (${element.first_name})`,
        );
      } catch (err) {
        console.error(
          `❌ Failed to send WATI to ${element.first_name}:`,
          err.response?.data || err.message,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Diwali surprise mail and WhatsApp message sent successfully",
    });
  } catch (error) {
    console.error("Error sending Diwali Surprise Mail and WATI:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});

app.get("/send-offer-update-mail", async (req, res, next) => {
  try {
    const { user_status } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.plain_password",
        "ud.first_name",
        `(
        SELECT device 
        FROM bn_user_fcm_token 
        WHERE user_id = ud.user_id 
        ORDER BY id DESC 
        LIMIT 1
      ) AS device`,
        "ud.my_wallet",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_email`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_wa`,
        "(SELECT program_id FROM suggested_program WHERE user_id = ud.user_id ORDER BY suggested_program_id desc LIMIT 1) as sugg_program_id",
      ],
      conditions: [
        {
          field: "ud.email_id",
          operator: " NOT LIKE ",
          value: `'%dummy%'`,
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_status.toLowerCase() === "oc" ? "Completed" : "Active",
        },
        {
          field: "ud.my_wallet",
          operator: ">",
          value: 9000,
        },
        {
          field: "DATE(ud.offer_mail)",
          operator: "<>",
          value: `${moment().format("YYYY-MM-DD")}`,
        },

        {
          field: "ud.mentor_assigned",
          operator: "<>",
          value: 196,
        },
        {
          field: "ud.user_id",
          operator: "=",
          value: 127749,
        },
      ],
    });

    const batches = chunkArray(results, 500);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (element) => {
          let fromEmail = `khyati.rupani@balancenutrition.in`;
          let link = `https://www.balancenutrition.in/download-bn-app`;
          if (["iOS", "iPadOS", "ios"].includes(element.device)) {
            fromEmail = `khyati@balancenutrition.in`;
            link = `https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
          } else if (element.device === "android") {
            fromEmail = `khyatirupani@balancenutrition.in`;
            link = `https://play.google.com/store/apps/details?id=in.clientexclusive.balance`;
          }
          let sugg_link =
            "https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134";
          if (element.sugg_program_id) {
            sugg_link =
              "https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=" +
              element.sugg_program_id;
          }
          const html = await ejs.renderFile("src/mails/offerUpdateMail1.ejs", {
            userName: element.first_name,
            appLink: link,
            suggLink: sugg_link,
            userEmail: element.email_id,
            userPassword: element.plain_password,
            userWallet: element.my_wallet,
            mentorName: element.mentor_name,
            mentorPhone: element.mentor_wa,
            year: 2025,
          });

          await sendMailUtil({
            from: `Khyati Rupani <${fromEmail}>`,
            to: element.email_id,
            cc: ["clientservices@balancenutrition.in", element.mentor_email],
            bcc: ["testerteam@balancenutrition.in"],
            subject: "YOUR NEXT DIET PROGRAM COULD BE FREE!",
            html: html,
          });
          await updateRecord(
            tables.userDetails,
            {
              offer_mail: `${moment().format("YYYY-MM-DD")}`,
            },
            {
              user_id: element.user_id,
            },
          );
        }),
      );

      // Optional delay between batches (e.g., 2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return res
      .status(200)
      .json({ success: true, message: "All batches sent successfully" });
  } catch (error) {
    console.error("Send App Update Mail Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
});
app.post("/dropout-users", async (req, res) => {
  try {
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res
        .status(400)
        .json({ error: "user_ids must be a non-empty array" });
    }

    await handleDormantToDropoutByIds(user_ids);

    res.json({ message: "Dropout process triggered successfully", user_ids });
  } catch (error) {
    console.error("Error in /dropout-users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/v1/dropout", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id in query params" });
    }

    await handleDormantToDropoutById(user_id);

    res
      .status(200)
      .json(
        new ApiResponse({ message: "Dropout process triggered successfully" }),
      );
  } catch (error) {
    console.error("Error in /dropout-users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

app.use((req, res) => {
  console.log(`404 Hit: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: "Route not found", route: req.originalUrl });
});

// Sentry.setupExpressErrorHandler(app);

// comment.js

app.use(errorMiddleware);
if (process.env.NODE_ENV === "production") {
  setupSSHAndCronJob();
}
// createSqlDump();
// ? server listening on port 3000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
