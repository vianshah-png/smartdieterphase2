import axios from "axios";
import moment from "moment";
import XLSX from "xlsx";
import {
  bulkInsertRecords,
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../config/query.js";
import {
  appVersions,
  callTypes,
  PREGNANCY_NOTIFICATIONS,
  productLinkMap,
  tables,
} from "../helper/constant.js";
import { addStatusLogNew } from "../controllers/salesDashboardControllers/leadsController.js";
import dietDetails from "../models/dietDetailsModel.js";
import { updateMaintenanceStatus } from "../controllers/weightController.js";
import {
  extractVariables,
  fetchUserDetailsDynamic,
  fetchUsersDetailsNew,
  generateHorizontalUserTable,
  generateUserIdsAndOrderById,
  mapUserData,
  mapUserTableData,
  replacePlaceholders,
} from "../helper/common.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import { safeJSONParse } from "../helper/commonHelper.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { getFormattedUserData } from "../helper/mentordbHelpers.js";
import clientEnquiry from "../models/clientQueryModel.js";
import { raw } from "express";
import { getBufferDays } from "../controllers/common.js";
import { ApiResponse } from "../utils/APiResponse.js";
import ejs from "ejs";
import { createPaymentLink } from "../utils/createPaymentLink.js";
import pLimit from "p-limit";
import fs from "fs";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import { sendBirthDayHamperAddressNotification } from "./cronFunction2.js";
import userNotification from "../models/userNotificationModel.js";
import {
  getOneDayAfterEmailTemplate,
  getOneDayBeforeEmailTemplate,
} from "../helper/emailAutochatTemplateHelpers/getPregnancyOnHoldTemplate.js";
import {
  generateAutoCartCreationMessageTemplates,
  generateDietCartAutoChat,
  generateDietCartAutoChatFor45Min,
  generateDietShoppingEmail1hr,
  generateDietShoppingReminderEmail45min,
  get48HourEmailTemplate,
} from "../helper/emailAutochatTemplateHelpers/getAutoCartCreationMessageTemplates.js";
import { createCartFromDietSent } from "../controllers/shop/cartController.js";
import { sendPerformanceRoiReportMail } from "../services/performanceRoiReportService.js";

async function assessmentNotFilledNotification({
  window: [start, end],
  notification_id,
  period,
}) {
  try {
    const { results: userDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "sop.sub_order_id = ass.active_order_id AND ass.user_id = sop.user_id",
        },
      ],
      conditions: [
        { field: "sop.program_status", operator: "=", value: "1" },
        { field: "sop.program_type", operator: "=", value: 0 },
        {
          orConditions: [
            { field: "sop.order_type", operator: "=", value: "New" },
            { field: "sop.order_type", operator: "=", value: "OCR" },
          ],
        },
        {
          field: `TIMESTAMPDIFF(${period}, sop.created_at, NOW())`,
          operator: ">=",
          value: start,
        },
        {
          field: `TIMESTAMPDIFF(${period}, sop.created_at, NOW())`,
          operator: "<=",
          value: end,
        },
        {
          field: "ass.assessment_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });
    const user_ids = userDetails.map((user) => user.user_id);

    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log(
      "Error in assessment not filled notification",
      window,
      period,
      notification_id,
      ":",
      error
    );
  }
}

async function updateStatusToMaintenance() {
  try {
    const { results: users } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
        },
        {
          type: "LEFT",
          table: `(
            SELECT 
              od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM 
              order_details od2
            LEFT JOIN 
              sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE 
              sop2.program_type = 0
          ) sop_count`,
          on: "cd.user_id = sop_count.user_id",
        },
      ],
      conditions: [
        {
          field: `((sop.total_sessions=9 and sop.sent_sessions=9) OR (sop.total_sessions=6 and sop.sent_sessions=6) OR (sop.total_sessions=3 and sop.sent_sessions=3))`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        {
          field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
          operator: ">=",
          value: 13,
        },
        {
          orConditions: [
            {
              field: "dsl.end_session_weight",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "dsl.end_session_weight",
              operator: "=",
              value: 0,
            },
          ],
        },
      ],
      groupBy: ["cd.user_id"],
      having: [
        {
          field:
            "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END)",
          operator: "=",
          value: 0,
        },
      ],
    });
    console.log(users, 113);
    // return false;
    for (let i = 0; i < users.length; i++) {
      try {
        const updateProgramStatus = await updateRecord(
          tables.subOrderPrograms,
          { program_status: 3 },
          { sub_order_id: users[i].active_order_id }
        );

        console.log(updateProgramStatus, 157, users[i].user_id);
        await updateMaintenanceStatus({ user_id: users[i].user_id });
      } catch (error) {
        console.log(error);
      }
    }
  } catch (error) {
    console.log("Error in update status to maintenance", error);
  }
}
async function updateUserStatusAndLog({ userId, status, subStatus }) {
  await updateRecord(
    tables.userDetails,
    { user_status: status, sub_user_status: subStatus },
    { user_id: userId }
  );
  await addStatusLogNew({ status, sub_status: subStatus, id: userId });
}

async function updateStatusToNotStarted() {
  try {
    const { results: assessmentNotFilled } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: ` ${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "sop.sub_order_id = ass.active_order_id",
        },
      ],
      conditions: [
        { field: "sop.program_status", operator: "=", value: "1" },
        { field: "sop.program_type", operator: "=", value: 0 },
        { field: "sop.sent_sessions", operator: "=", value: 0 },
        {
          field: "cd.last_screen_visited",
          operator: "!=",
          value: "my_profile",
        },
        {
          orConditions: [
            { field: "sop.order_type", operator: "=", value: "New" },
            { field: "sop.order_type", operator: "=", value: "OCR" },
          ],
        },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        {
          field: "TIMESTAMPDIFF(HOUR,sop.created_at,NOW())",
          operator: ">=",
          value: 48,
        },
        {
          orConditions: [
            {
              field: "ass.assessment_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "ass.completion_status",
              operator: "!=",
              value: "2",
              raw: true,
            },
          ],
        },
      ],
    });

    // console.log(assessmentNotFilled, 119);

    // return false;
    const { results: withAdvancePurchase } = await readRecord({
      selectFields: [
        "cd.*",
        "sop.*",
        "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT 
              od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM 
              order_details od2
            LEFT JOIN 
              sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE 
              sop2.program_type = 0
          ) sop_count`,
          on: "cd.user_id = sop_count.user_id",
        },
      ],
      conditions: [
        {
          field: "sop.expiry_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "<",
          value: "sop.total_sessions",
          raw: true,
        },
      ],
      groupBy: ["cd.user_id"],
    });
    const users = [...withAdvancePurchase];
    const todayDate = moment().format("YYYY-MM-DD");
    console.log(users, 247);
    console.log(assessmentNotFilled.length, 248);
    // return false;
    for (let i = 0; i < users.length; i++) {
      try {
        const user = users[i];
        const pending_session = user.pending_session;
        const total_sessions = user.total_sessions;
        const sent_sessions = user.sent_sessions;
        const columns = [
          "user_id",
          "diet_details_id",
          "sub_order_id",
          "session",
          "diet_name",
          "diet_added_date",
          "diet_sent_date",
          "diet_sent_by",
          "diet_start_date",
          "start_session_weight",
          "mid_session_weight",
          "end_session_weight",
          "end_session_inch",
          "diet_status",
          "approved_by",
          "diet_type",
        ];
        const values = [
          user.user_id,
          "NULL",
          user.active_order_id,
          0,
          "Auto Closed By System",
          todayDate,
          todayDate,
          0,
          todayDate,
          0,
          0,
          0,
          0,
          4,
          0,
          2,
        ];
        for (let i = 0; i < pending_session.length; i++) {
          try {
            const insertInDietDetails = await dietDetails.create({
              name: "Auto Closed By System",
            });
            values[3] = sent_sessions + i + 1;
            values[1] = insertInDietDetails._id;
            const insertRemainingSession = await insertRecord(
              tables.dietSessionLog,
              columns,
              values
            );
            const updateDietDetails = await dietDetails.findByIdAndUpdate(
              insertInDietDetails._id,
              {
                diet_id: insertRemainingSession.insertId,
              }
            );
          } catch (error) {
            console.log(
              "Error while insert session",
              sent_sessions + i + 1,
              error
            );
          }
        }
        if (Number(users[i].advance_program_count) > 0) {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Active",
            subStatus: "notstarted",
          });
        } else {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Completed",
            subStatus: "Dropout",
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
    for (let i = 0; i < assessmentNotFilled.length; i++) {
      try {
        const user = assessmentNotFilled[i];
        updateUserStatusAndLog({
          userId: user.user_id,
          status: "Active",
          subStatus: "notstarted",
        });
      } catch (error) {
        console.log(error);
      }
    }
  } catch (error) {
    console.log("Error in update status to notstarted", error);
  }
}
// updateStatusToNotStarted();

async function handleDormantToDroupout() {
  try {
    const { results: withAdvancePurchase } = await readRecord({
      selectFields: [
        "cd.user_id,cd.user_status,cd.sub_user_status",
        "sop.*",
        "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT 
              od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM 
              order_details od2
            LEFT JOIN 
              sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE 
              sop2.program_type = 0
          ) sop_count`,
          on: "cd.user_id = sop_count.user_id",
        },
      ],
      conditions: [
        {
          field: "sop.expiry_date",
          operator: "<=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "<",
          value: "sop.total_sessions",
          raw: true,
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "cd.sub_user_status",
          operator: "=",
          value: "Dormant",
        },
      ],
      groupBy: ["cd.user_id"],
    });

    const users = [...withAdvancePurchase];
    const todayDate = moment().format("YYYY-MM-DD");
    // console.log(users);
    // return false;
    for (let i = 0; i < users.length; i++) {
      try {
        const user = users[i];
        const pending_session = user.pending_session;
        const total_sessions = user.total_sessions;
        const sent_sessions = user.sent_sessions;

        const columns = [
          "user_id",
          "diet_details_id",
          "sub_order_id",
          "session",
          "diet_name",
          "diet_added_date",
          "diet_sent_date",
          "diet_sent_by",
          "diet_start_date",
          "start_session_weight",
          "mid_session_weight",
          "end_session_weight",
          "end_session_inch",
          "diet_status",
          "approved_by",
          "diet_type",
        ];

        const values = [
          user.user_id,
          "NULL",
          user.sub_order_id,
          0,
          "Auto Closed By System",
          todayDate,
          todayDate,
          0,
          todayDate,
          0,
          0,
          0,
          0,
          4,
          0,
          2,
        ];

        for (let j = 0; j < pending_session; j++) {
          try {
            // console.log(condition)
            //   return false;
            const insertInDietDetails = await dietDetails.create({
              diet_name: "Auto Closed By System",
            });

            values[3] = sent_sessions + j + 1; // session number
            values[1] = insertInDietDetails._id?.toString("hex"); // diet_details_id

            const insertRemainingSession = await insertRecord(
              tables.dietSessionLog,
              columns,
              values
            );

            await dietDetails.findByIdAndUpdate(insertInDietDetails._id, {
              diet_id: insertRemainingSession.insertId,
            });
          } catch (error) {
            console.log(
              "Error while inserting session",
              sent_sessions + j + 1,
              error
            );
          }
        }

        // Update user status based on advance programs
        const updatedData = {
          program_status: "3",
          pending_session: "0",
          sent_sessions: user.total_sessions,
        };
        const condition = { sub_order_id: parseInt(user.sub_order_id) };
        const updatedOrderCompleted = await updateRecord(
          `${tables.subOrderPrograms}`,
          updatedData,
          condition
        );

        if (Number(user.advance_program_count) > 0) {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Active",
            subStatus: "notstarted",
          });
        } else {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Completed",
            subStatus: "Dropout",
          });
        }
      } catch (error) {
        console.log("Error processing user:", error);
      }
    }
  } catch (error) {
    console.log("Error in handleExpiredProgramsWithPendingSessions", error);
  }
}

async function handleDormantToDropoutByIds(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    console.log("No user IDs provided");
    return;
  }

  try {
    const { results: withAdvancePurchase } = await readRecord({
      selectFields: [
        "cd.user_id,cd.user_status,cd.sub_user_status",
        "sop.*",
        "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT 
              od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM 
              order_details od2
            LEFT JOIN 
              sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE 
              sop2.program_type = 0
          ) sop_count`,
          on: "cd.user_id = sop_count.user_id",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: `(${userIds.join(",")})`,
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "<",
          value: "sop.total_sessions",
          raw: true,
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
      ],
      groupBy: ["cd.user_id"],
    });

    const users = [...withAdvancePurchase];
    const todayDate = moment().format("YYYY-MM-DD");

    for (const user of users) {
      try {
        const { pending_session, total_sessions, sent_sessions } = user;

        const columns = [
          "user_id",
          "diet_details_id",
          "sub_order_id",
          "session",
          "diet_name",
          "diet_added_date",
          "diet_sent_date",
          "diet_sent_by",
          "diet_start_date",
          "start_session_weight",
          "mid_session_weight",
          "end_session_weight",
          "end_session_inch",
          "diet_status",
          "approved_by",
          "diet_type",
        ];

        const baseValues = [
          user.user_id,
          "NULL",
          user.sub_order_id,
          0,
          "Auto Closed By System",
          todayDate,
          todayDate,
          0,
          todayDate,
          0,
          0,
          0,
          0,
          4,
          0,
          2,
        ];

        for (let j = 0; j < pending_session; j++) {
          try {
            const insertInDietDetails = await dietDetails.create({
              diet_name: "Auto Closed By System",
            });

            const values = [...baseValues];
            values[1] = insertInDietDetails._id?.toString("hex");
            values[3] = sent_sessions + j + 1;

            const insertRemainingSession = await insertRecord(
              tables.dietSessionLog,
              columns,
              values
            );

            await dietDetails.findByIdAndUpdate(insertInDietDetails._id, {
              diet_id: insertRemainingSession.insertId,
            });
          } catch (error) {
            console.log(
              "Error while inserting session",
              sent_sessions + j + 1,
              error
            );
          }
        }

        await updateRecord(
          `${tables.subOrderPrograms}`,
          {
            program_status: "3",
            pending_session: "0",
            sent_sessions: total_sessions,
          },
          { sub_order_id: parseInt(user.sub_order_id) }
        );

        if (Number(user.advance_program_count) > 0) {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Active",
            subStatus: "notstarted",
          });
        } else {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Completed",
            subStatus: "Dropout",
          });
        }
      } catch (error) {
        console.log("Error processing user:", error);
      }
    }
  } catch (error) {
    console.log("Error in handleDormantToDropoutByIds", error);
  }
}

async function handleDormantToDropoutById(userIds) {
  if (!userIds) {
    console.log("No user IDs provided");
    return;
  }

  try {
    const { results: withAdvancePurchase } = await readRecord({
      selectFields: [
        "cd.user_id,cd.user_status,cd.sub_user_status",
        "cd.first_name as client_name",
        "cd.email_id as client_email",
        "pm.program_name",
        "ps.program_duration as program_day",
        "DATEDIFF(NOW(),sop.start_date) as given_validity",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cd.mentor_assigned) as mentor_email`,
        "sop.*",
        "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT 
              od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM 
              order_details od2
            LEFT JOIN 
              sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE 
              sop2.program_type = 0
          ) sop_count`,
          on: "cd.user_id = sop_count.user_id",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "=",
          value: userIds,
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "<",
          value: "sop.total_sessions",
          raw: true,
        },
      ],
      groupBy: ["cd.user_id"],
    });

    const users = [...withAdvancePurchase];
    const todayDate = moment().format("YYYY-MM-DD");

    for (const user of users) {
      try {
        const { pending_session, total_sessions, sent_sessions } = user;

        const columns = [
          "user_id",
          "diet_details_id",
          "sub_order_id",
          "session",
          "diet_name",
          "diet_added_date",
          "diet_sent_date",
          "diet_sent_by",
          "diet_start_date",
          "start_session_weight",
          "mid_session_weight",
          "end_session_weight",
          "end_session_inch",
          "diet_status",
          "approved_by",
          "diet_type",
        ];

        const baseValues = [
          user.user_id,
          "NULL",
          user.sub_order_id,
          0,
          "Auto Closed By System",
          todayDate,
          todayDate,
          0,
          todayDate,
          0,
          0,
          0,
          0,
          4,
          0,
          2,
        ];

        for (let j = 0; j < pending_session; j++) {
          try {
            const insertInDietDetails = await dietDetails.create({
              diet_name: "Auto Closed By System",
            });

            const values = [...baseValues];
            values[1] = insertInDietDetails._id?.toString("hex");
            values[3] = sent_sessions + j + 1;

            const insertRemainingSession = await insertRecord(
              tables.dietSessionLog,
              columns,
              values
            );

            await dietDetails.findByIdAndUpdate(insertInDietDetails._id, {
              diet_id: insertRemainingSession.insertId,
            });
          } catch (error) {
            console.log(
              "Error while inserting session",
              sent_sessions + j + 1,
              error
            );
          }
        }

        await updateRecord(
          `${tables.subOrderPrograms}`,
          {
            program_status: "3",
            pending_session: "0",
            sent_sessions: total_sessions,
          },
          { sub_order_id: parseInt(user.sub_order_id) }
        );

        if (Number(user.advance_program_count) > 0) {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Active",
            subStatus: "notstarted",
          });
        } else {
          updateUserStatusAndLog({
            userId: user.user_id,
            status: "Completed",
            subStatus: "Dropout",
          });
          // if (Number(user.advance_program_count) === 0) {
          const clientEmail = user?.client_email || null; // Fetch from user if available
          const clientName = user?.client_name || "there"; // Fallback
          const mentorEmail = user.mentor_email || "";

          const validityLine =
            user.given_validity && Number(user.given_validity) > 0
              ? `We have given you ${user.given_validity} days to complete your <b>${user.program_day} of ${user.program_name}</b> program. However, unfortunately, we haven't heard from you to date.<br><br>`
              : "";

          const message = `
  Hello ${clientName},<br><br>

  ${validityLine}
  Hence, your program has lapsed as per validity. We have activated your Maintenance guide that you can follow & you are also eligible for “client exclusive rates” always.<br><br>

  You can still view the E KIT, chat with your mentor, refer to recipes, and view old diets for the next 60 days & much more on the BN App.<br><br>

  Do write back to us anytime you wish to start your health journey again :)<br><br>

  Regards,<br>
  Team Balance Nutrition
`;

          if (clientEmail) {
            sendMailUtil({
              from: "info@balancenutrition.in",
              to: clientEmail,
              cc: "clientservices@balancenutrition.in",
              bcc: mentorEmail,
              subject: "Your Membership Has Expired!",
              html: message,
            });
          }
          // }
        }
      } catch (error) {
        console.log("Error processing user:", error);
      }
    }
  } catch (error) {
    console.log("Error in handleDormantToDropoutByIds", error);
  }
}

async function updateStatusToDormant() {
  try {
    let notification_id = 22;
    const { results: users } = await readRecord({
      selectFields: ["cd.user_id"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: "cd.user_id = wr.user_id and sop.sub_order_id = wr.sub_order_id and wr.session = sop.sent_sessions AND wr.days = '10'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        {
          field: "TIMESTAMPDIFF(DAY,dsl.diet_start_date,NOW())",
          operator: ">=",
          value: 19,
        },
        { field: "wr.wmr_id IS NULL ", operator: "", value: "", raw: true },
      ],
    });
    // console.log(users);
    // return false;
    const user_ids = users.map((user) => user.user_id);
    // console.log(user_ids, 395);
    // return false;
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
    for (let i = 0; i < users.length; i++) {
      try {
        updateUserStatusAndLog({
          userId: users[i].user_id,
          status: "Active",
          subStatus: "Dormant",
        });
      } catch (error) {
        console.log(error);
      }
    }
  } catch (error) {
    console.log("Error in update status to dormant", error);
  }
}

async function welcomeCallNotBookedNotification({
  window: [start, end],
  notification_id,
  period,
}) {
  try {
    const { results: welcomeCallNotBooked } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `( 
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id, sub_order_id ORDER BY call_id DESC) AS rn
          FROM ${tables.callUpdates}
          WHERE call_type = '0'
        ) ranked WHERE rn = 1
      ) cu`,
          on: "cd.user_id = cu.user_id AND cu.sub_order_id = sop.sub_order_id",
          raw: true,
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "cd.user_id = dsl.user_id AND sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status='4'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        { field: "sop.sent_sessions", operator: "=", value: 1 },
        { field: "sop.program_type", operator: "=", value: "0" },
        {
          orConditions: [
            {
              field: "sop.order_type",
              operator: "=",
              value: "New",
            },
            {
              field: "sop.order_type",
              operator: "=",
              value: "OCR",
            },
          ],
        },
        {
          orConditions: [
            {
              field: "cu.user_id",
              operator: "IS",
              value: null,
              raw: true,
            },
            {
              field:
                "(cu.user_id is not NULL and cu.call_status NOT IN ('0','1','3'))",
              operator: "",
              value: "",
              raw: true,
            },
          ],
        },

        {
          field: `TIMESTAMPDIFF(${period},dsl.diet_sent_date,NOW())`,
          operator: ">=",
          value: start,
        },
        {
          field: `TIMESTAMPDIFF(${period},dsl.diet_sent_date,NOW())`,
          operator: "<=",
          value: end,
        },
      ],
    });
    const user_ids = welcomeCallNotBooked.map((user) => user.user_id);
    console.log(user_ids, 395);
    // return false;
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log(
      "Error in welcome call not booked notification",
      window,
      period,
      notification_id,
      ":",
      error
    );
  }
}

async function dietSentNotification({ notification_id, auto_chat = false }) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "cd.active_order_id = dsl.sub_order_id and cd.user_id=dsl.user_id and dsl.diet_status=4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: "sop.sent_sessions", operator: ">", value: 0 },
        {
          field: "DATEDIFF(CURDATE(),DATE(dsl.diet_start_date))",
          operator: "=",
          value: 1,
        },
      ],
    });
    const user_ids = users.map((user) => {
      return user.user_id;
    });

    // console.log(user_ids,770);
    // return false;
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: notification_id,
        }
      );
    }
  } catch (error) {
    console.log("Error in diet sent notification", error);
  }
}

async function setSessionStartDateNotification({
  window: [start, end],
  notification_id,
}) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id and cd.user_id = dsl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl2`,
          on: "sop.sub_order_id = dsl2.sub_order_id AND dsl.diet_id < dsl2.diet_id",
        },
      ],
      conditions: [
        { field: "dsl2.diet_id", operator: "IS", value: "NULL", raw: true },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },

        {
          field: "dsl.diet_start_date_set_by",
          operator: "=",
          value: "Default",
        },
        {
          field: "dsl.diet_status",
          operator: "=",
          value: "4",
        },
        {
          field: `DATEDIFF(CURDATE(),DATE(dsl.diet_start_date))`,
          operator: ">=",
          value: start,
        },
        {
          field: `DATEDIFF(CURDATE(),DATE(dsl.diet_start_date))`,
          operator: "<",
          value: end,
        },
      ],
    });
    const user_ids = users.map((user) => user.user_id);
    // console.log(user_ids, 541);
    // return false;
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log(
      "Error in set session start date notification",
      window,
      notification_id,
      error
    );
  }
}

async function sendAdvanceProgramStartDateChats() {
  try {
    const daysAheadLabels = {
      3: "in 3 days",
      2: "in 2 days",
      1: "Tomorrow",
    };

    for (const daysAhead of [3, 2, 1]) {
      const dateCondition = `DATE(sop4.start_date) = CURDATE() + INTERVAL ${daysAhead} DAY`;
      const label = daysAheadLabels[daysAhead];

      const { results: users } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "cd.user_id",
          "cd.first_name",
          "cd.email_id",
          "mu.crm_user AS mentor_name",
          "mu.designation AS mentor_desc",
          "mu.call_link AS mentor_call_link",
          "cd.mentor_assigned AS mentor_assigned",
          "sop.sub_order_id AS active_sub_order_id",
          "p.program_name AS active_program_name",
          "sop.total_sessions",
          "sop.sent_sessions",
          "DATE_FORMAT(dsl.diet_start_date, '%Y-%m-%d') AS last_diet_start_date",
          "sop4.sub_order_id AS adv_sub_order_id",
          "p4.program_name AS adv_program_name",
          "ps.program_duration AS adv_program_session",
          "DATE_FORMAT(sop4.start_date, '%Y-%m-%d') AS adv_start_date",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id AND sop.program_status = '1' AND sop.total_sessions = sop.sent_sessions",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop4`,
            on: `cd.user_id = sop4.user_id AND sop4.program_status = '4' AND ${dateCondition} AND sop4.start_date_added_by = '0'`,
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} mu`,
            on: "cd.mentor_assigned = mu.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} p`,
            on: "sop.program_id = p.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} p4`,
            on: "sop4.program_id = p4.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "sop4.program_session_id = ps.program_session_id",
          },
        ],
        conditions: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cd.sub_user_status", operator: "=", value: "Active" },
          {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: ">",
            value: 10,
            raw: true,
          },
          {
            field: "sop4.sub_order_id",
            operator: "IS NOT",
            value: null,
          },
        ],
        orderBy: ["adv_start_date DESC"],
      });

      users.forEach((user) => {
        const chat = `
          <p>Hi ${user.first_name},</p>
          <p>FINAL REMINDER:</p>
          <p>Your new program <strong>${user.adv_program_name} (${
          user.adv_program_session
        })</strong> starts <strong>${label}</strong>.</p>
          <p>Before I plan your diet, please send me the answers to these queries :)</p>
          <p>1. Do send me any inputs you want me to keep in mind before planning your session.</p>
          <p>2. I also need your weight update. You can take it ${
            daysAhead === 1 ? "tomorrow morning" : "on the day of your program"
          } on an empty stomach &amp; send it to me in the chat section.</p>
          <p>3. I will need at least 48 hours after I get your revert to send you the diet session.</p>
          <p>Awaiting your revert :)</p>
          <p>Ignore if replied already.</p>
        `;

        clientEnquiry.create({
          mentor_id: user.mentor_assigned,
          type: "broadcast",
          sender: "mentor",
          query: chat,
          user_id: user.user_id,
          name: user.mentor_name,
        });
      });
    }
  } catch (error) {
    console.log("Error in sendAdvanceProgramStartDateChats:", error);
  }
}

async function welcomeCallReminderNotifications() {
  try {
    const { results: calls } = await readRecord({
      selectFields: [
        "cu.*",
        "s.minutes_to_start",
        "CONCAT(cd.first_name,' ',cd.last_name) as user_name",
        "CONCAT(ad.first_name,' ',ad.last_name) as added_by",
        "slot.appointment_slots",
        "cd.email_id",
        "ad.official_phone",
        "cd.user_id",
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "cu.slot_id = slot.id",
        },
        {
          type: "LEFT",
          table: `(SELECT 
    id,
    appointment_slots,
    TIMESTAMPDIFF(
        MINUTE, 
        NOW(), 
        STR_TO_DATE(
            CONCAT(CURDATE(), SUBSTRING_INDEX(appointment_slots, ' - ', 1)), 
            '%Y-%m-%d %h:%i %p'
        )
    ) AS minutes_to_start
FROM 
    bn_book_appointment_slots_mentor 
WHERE 
    STR_TO_DATE(
        CONCAT(CURDATE(), SUBSTRING_INDEX(appointment_slots, ' - ', 1)), 
        '%Y-%m-%d %h:%i %p'
    ) > NOW()
ORDER BY 
    minutes_to_start) as s`,
          on: "cu.slot_id = s.id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cu.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cu.added_by = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "cu.call_status", operator: "=", value: 0 },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cu.call_type", operator: "=", value: "0" },
        { field: "s.minutes_to_start", operator: ">=", value: 15 },
        { field: "s.minutes_to_start", operator: "<=", value: 30 },
      ],
    });
    const user_ids = calls.map((call) => call.user_id);
    console.log(user_ids.length, 609);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 2,
        }
      );
    }
  } catch (error) {
    console.log("Error in welcome call notification", error);
  }
}

async function calorieCountedNotification() {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: "sop.sent_sessions", operator: "=", value: 1 },
        {
          field: "TIMESTAMPDIFF(MINUTE, sop.last_session_sent_date, NOW())",
          operator: ">=",
          value: 1440,
        },
        {
          field: "TIMESTAMPDIFF(MINUTE, sop.last_session_sent_date, NOW())",
          operator: "<=",
          value: 1455,
        },
      ],
    });
    const user_ids = users.map((user) => user.user_id);
    console.log(user_ids.length, 541);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 135,
        }
      );
    }
  } catch (error) {
    console.log("Error in calorie counted notification", error);
  }
}

async function sessionBasedNotifications({
  session,
  days,
  notification_id,
  auto_chat = false,
  chat_id = null,
}) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: "sop.sent_sessions", operator: "=", value: session },
        {
          field: "DATEDIFF(CURDATE(),DATE(sop.last_session_sent_date))",
          operator: "=",
          value: days,
        },
      ],
    });

    const user_ids = users.map((user) => {
      return user.user_id;
    });
    console.log(user_ids.length, 541);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log(
      "Error in session based notifications",
      session,
      days,
      notification_id,
      ":",
      error
    );
  }
}

async function sundayNotification({ notification_id }) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          orConditions: [
            {
              field: "cd.sub_user_status",
              operator: "IN",
              value: ["Completed", "Dropout", "Maintenance", "Fs"],
            },
            { field: "cd.user_status", operator: "=", value: "Active" },
            { field: "cd.sub_user_status", operator: "=", value: "Active" },
            ,
            { field: "cd.user_status", operator: "=", value: "Dormant" },
            { field: "cd.user_status", operator: "=", value: "Cleanse active" },
          ],
        },
      ],
    });
    const user_ids = users.map((user) => {
      return user.user_id;
    });
    console.log(`Total users: ${user_ids.length}`);

    if (user_ids.length > 0) {
      const batchSize = 2000;
      for (let i = 0; i < user_ids.length; i += batchSize) {
        const batch = user_ids.slice(i, i + batchSize);
        try {
          const sendNotification = await axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: batch,
              notification_id,
            }
          );
          console.log(`Notification sent to batch ${i / batchSize + 1}`);
        } catch (batchError) {
          console.error(
            `Error sending notification to batch ${i / batchSize + 1}:`,
            batchError
          );
        }
      }
    }
  } catch (error) {
    console.log("Error in sunday notification:", error);
  }
}

async function balanceDueNotifications({
  notification_id,
  days_before,
  auto_chat = false,
  chat_id = null,
}) {
  try {
    const { results: users } = await readRecord({
      selectFields: [
        "cd.*",
        "sop.balance_amount",
        "DATE_FORMAT(sop.due_date,'%D %b %Y') as due_date",
        "DATE_DIFF(CURDATE(),DATE(sop.due_date)) as days_left",
        "CONCAT(ad.first_name,' ',ad.last_name) as mentor_name",
        "CONCAT(pm.program_name,'(',ps.validty,')') as program_name",
        "sop.paid_amount",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: "sop.balance_amount", operator: ">", value: 0 },
        {
          field: "DATEDIFF(CURDATE(),DATE(sop.due_date))",
          operator: "=",
          value: days_before,
        },
      ],
    });
    const user_ids = users.map((user) => {
      return user.user_id;
    });
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in balance due notification", error);
  }
}
async function birthDayNotifications() {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: "DATE_FORMAT(cd.birth_date,'%m-%d')",
          operator: "=",
          value: "DATE_FORMAT(NOW(),'%m-%d')",
          raw: true,
        },
      ],
    });
    // console.log(users[0].birth_date, 540);
    const user_ids = users.map((user) => user.user_id);
    // console.log(user_ids, 541);
    // return;
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 139,
        }
      );
    }
  } catch (error) {
    console.log("Error in birthday notification", error);
  }
}

// birthDayNotifications();
// async function tuesdayNotifications() {

// }
const reminderHTConditionsMap = {
  firstReminder: {
    condition: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =6
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =1
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =1
		)
	)`,
    notification_id: 140,
  },
  secondReminder: {
    condition: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =7 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =2
		)
	)`,
    notification_id: 142,
  },
  thirdReminder: {
    condition: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =8 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =3
		)
	)`,
    notification_id: 142,
  },
  fourthReminder: {
    condition: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =4
		)
	)`,
    notification_id: 143,
  },
  fifthReminder: {
    condition: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =10
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =5
		)
	)`,
    notification_id: 144,
  },
};

async function halfTimeFeedbackNotification({
  reminderDayCondition,
  notification_id,
}) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.halfTimeFeedback} hf`,
          on: "hf.user_id = cd.user_id AND hf.sub_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        {
          field: reminderDayCondition,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "hf.user_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    const user_ids = users.map((user) => user.user_id);

    // console.log(user_ids,1479);
    // return;

    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log(
      `Error in half time feedback notification reminder No:${reminderDay} notification id:${notification_id}`,
      error
    );
  }
}

// sendHalfTimeFeedbackNotification();
async function sendHalfTimeFeedbackNotification() {
  try {
    const reminderDays = Object.keys(reminderHTConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition =
          reminderHTConditionsMap[reminderDay].condition;
        const notification_id =
          reminderHTConditionsMap[reminderDay].notification_id;
        halfTimeFeedbackNotification({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(
          `Error in half time feedback notification reminder No:${reminderDay}`,
          error
        );
      }
    }
  } catch (error) {
    console.log("Error in sending half time feedback notifications", error);
  }
}

const reminderHalfTimeHSConditionsMap = {
  firstReminder: {
    condition: `(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =6
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =6
		)
	)`,
    notification_id: 145,
  },
  secondReminder: {
    condition: `(
          	
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =7
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =7
		)
	)`,
    notification_id: 146,
  },
  thirdReminder: {
    condition: `(
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =8
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =8
		)
	)`,
    notification_id: 147,
  },
  fourthReminder: {
    condition: `(
          	
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =9
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =9
		)
	)`,
    notification_id: 148,
  },
  fifthReminder: {
    condition: `(
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =10
		)
	)`,
    notification_id: 149,
  },
};

async function htHealthScore({ reminderDayCondition, notification_id }) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type = '1'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: reminderDayCondition, operator: "", value: "", raw: true },
        { field: "hs.user_id", operator: "IS", value: "NULL", raw: true },
      ],
    });

    const user_ids = users.map((user) => user.user_id);
    console.log(user_ids);

    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in health score reminder", error);
  }
}

async function sendHealthScoreNotification() {
  try {
    const reminderDays = Object.keys(reminderHalfTimeHSConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition =
          reminderHalfTimeHSConditionsMap[reminderDay].condition;
        const notification_id =
          reminderHalfTimeHSConditionsMap[reminderDay].notification_id;
        htHealthScore({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(
          `Error in health score notification reminder No:${reminderDay}`,
          error
        );
      }
    }
  } catch (error) {
    console.log("Error in sending health score notifications", error);
  }
}

const goalConditionsMap = {
  firstReminder: {
    condition: `(
       (
         -- Check if there's a program_status = '4' and apply modified condition for 9 sessions
         (EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 7
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 0) -- Decreased by 1
       )
       OR 
       (
         -- Original conditions for 9 sessions without program_status = '4'
         (NOT EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 6
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 5) -- Decreased by 1
       )
       OR 
       -- Unchanged conditions for 6 sessions and 3 sessions
       (sop.total_sessions = 6
        AND sop.sent_sessions = 4
        AND DATEDIFF(NOW(), sop.last_session_sent_date) = 6) -- Decreased by 1
  )`,
    notification_id: 155,
  },
  secondReminder: {
    condition: `(
       (
         -- Check if there's a program_status = '4' and apply modified condition for 9 sessions
         (EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 7
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 1) -- Decreased by 1
       )
       OR 
       (
         -- Original conditions for 9 sessions without program_status = '4'
         (NOT EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 6
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 6) -- Decreased by 1
       )
       OR 
       -- Unchanged conditions for 6 sessions and 3 sessions
       (sop.total_sessions = 6
        AND sop.sent_sessions = 4
        AND DATEDIFF(NOW(), sop.last_session_sent_date) = 7) -- Decreased by 1
  )`,
    notification_id: 156,
  },
  thirdReminder: {
    condition: `(
       (
         -- Check if there's a program_status = '4' and apply modified condition for 9 sessions
         (EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 7
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 2) -- Decreased by 1
       )
       OR 
       (
         -- Original conditions for 9 sessions without program_status = '4'
         (NOT EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 6
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 7) -- Decreased by 1
       )
       OR 
       -- Unchanged conditions for 6 sessions and 3 sessions
       (sop.total_sessions = 6
        AND sop.sent_sessions = 4
        AND DATEDIFF(NOW(), sop.last_session_sent_date) = 8) -- Decreased by 1
  )`,
    notification_id: 157,
  },
  fourthReminder: {
    condition: `(
       (
         -- Check if there's a program_status = '4' and apply modified condition for 9 sessions
         (EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 7
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 3) -- Decreased by 1
       )
       OR 
       (
         -- Original conditions for 9 sessions without program_status = '4'
         (NOT EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 6
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 8) -- Decreased by 1
       )
       OR 
       -- Unchanged conditions for 6 sessions and 3 sessions
       (sop.total_sessions = 6
        AND sop.sent_sessions = 4
        AND DATEDIFF(NOW(), sop.last_session_sent_date) = 9) -- Decreased by 1
  )`,
    notification_id: 158,
  },
  fifthReminder: {
    condition: `(
       (
         -- Check if there's a program_status = '4' and apply modified condition for 9 sessions
         (EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 7
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 4) -- Decreased by 1
       )
       OR 
       (
         -- Original conditions for 9 sessions without program_status = '4'
         (NOT EXISTS (
           SELECT 1 
           FROM sub_orders_programs sop2 
           WHERE sop2.user_id = cd.user_id 
             AND sop2.program_status = '4'
         ) 
         AND sop.total_sessions = 9
         AND sop.sent_sessions = 6
         AND DATEDIFF(NOW(), sop.last_session_sent_date) = 9) -- Decreased by 1
       )
  )`,
    notification_id: 159,
  },
};

async function htCallReminder({ reminderDayCondition, notification_id }) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },

        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "cu.user_id = cd.user_id AND sop.sub_order_id = cu.sub_order_id and cu.call_type ='1'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: reminderDayCondition, operator: "", value: "", raw: true },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    const user_ids = users.map((user) => user.user_id);

    // console.log(user_ids,2107);
    // return;
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in health score reminder", error);
  }
}

async function sendHTCallReminderNotification() {
  try {
    const reminderDays = Object.keys(reminderCallConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition =
          reminderCallConditionsMap[reminderDay].condition;
        const notification_id =
          reminderCallConditionsMap[reminderDay].notification_id;
        htCallReminder({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(
          `Error in health score notification reminder No:${reminderDay}`,
          error
        );
      }
    }
  } catch (error) {
    console.log("Error in sending health score notifications", error);
  }
}

const reminderCallConditionsMap = {
  firstReminder: {
    condition: `(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=1 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=1
		)
	)`,
    notification_id: 150,
  },
  secondReminder: {
    condition: `(
 (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=2
		)
)
`,
    notification_id: 151,
  },
  thirdReminder: {
    condition: `(
   (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=3
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=3
		)
)
`,
    notification_id: 152,
  },
  fourthReminder: {
    condition: `(
    (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=4
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=4
		)
    )
`,
    notification_id: 153,
  },
  fifthReminder: {
    condition: `(
   (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=5
		)
    )
`,
    notification_id: 154,
  },
};

// sendHTCallReminderNotification();

async function goalNotification({ reminderDayCondition, notification_id }) {
  try {
    const {} = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        ,
        { field: reminderDayCondition, operator: "", value: "", raw: true },
        {
          field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
          operator: "=",
          value: 0,
        },
      ],
    });
    const user_ids = users.map((user) => user.user_id);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in goal notification", error);
  }
}

async function sendGoalNotifications() {
  try {
    const reminderDays = Object.keys(goalConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition = goalConditionsMap[reminderDay].condition;
        const notification_id = goalConditionsMap[reminderDay].notification_id;
        goalNotification({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(
          `Error in goal notification reminder No:${reminderDay}`,
          error
        );
      }
    }
  } catch (error) {
    console.log("Error in sending goal notifications", error);
  }
}

const reminderTailendHSConditionsMap = {
  firstReminder: {
    condition: `
   (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =1
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =1
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =6
		)
	)
  
`,
    notification_id: 160,
  },
  secondReminder: {
    condition: `
     (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =7
		)
	)
    `,
    notification_id: 161,
  },
  thirdReminder: {
    condition: `
     (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =8
		)
	)

`,
    notification_id: 162,
  },
  fourthReminder: {
    condition: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =9
		)
	)
`,
    notification_id: 163,
  },
  fifthReminder: {
    condition: `
     (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =10
		)
	)
`,
    notification_id: 164,
  },
};

async function tailendHelthScore({ reminderDayCondition, notification_id }) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type = '2'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        { field: reminderDayCondition, operator: "", value: "", raw: true },
        { field: "hs.user_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    const user_ids = users.map((user) => user.user_id);
    // console.log(user_ids);

    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in health score reminder", error);
  }
}

async function sendTailendHealthScoreNotification() {
  try {
    const reminderDays = Object.keys(reminderTailendHSConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition =
          reminderTailendHSConditionsMap[reminderDay].condition;
        const notification_id =
          reminderTailendHSConditionsMap[reminderDay].notification_id;
        tailendHelthScore({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(
          `Error in health score notification reminder No:${reminderDay}`,
          error
        );
      }
    }
  } catch (error) {
    console.log("Error in sending health score notifications", error);
  }
}

const reminderTailendFeedbackConditionsMap = {
  firstReminder: {
    condition: `
    (
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date)=6
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=1
		)
	)
`,
    notification_id: 165,
  },
  secondReminder: {
    condition: `
    (
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date)=7
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=2
		)
	)
`,
    notification_id: 166,
  },
  thirdReminder: {
    condition: `
    (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date)=4
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date)=8
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=3
		)
	)
`,
    notification_id: 167,
  },
  fourthReminder: {
    condition: `
    (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date)=5
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date)=9
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=4
		)
	)
`,
    notification_id: 168,
  },
  fifthReminder: {
    condition: `
    (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date)=6
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date)=10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=5
		)
	)
`,
    notification_id: 169,
  },
};

async function tailendFeedbackReminder({
  reminderDayCondition,
  notification_id,
}) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.finalFeedback} ff`,
          on: "ff.user_id = cd.user_id AND ff.sub_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        { field: reminderDayCondition, operator: "", value: "", raw: true },
        { field: "ff.user_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    const user_ids = users.map((user) => user.user_id);
    // console.log(user_ids,2653);
    // return;

    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in feedback reminder", error);
  }
}

async function sendTailendFeedbackNotification() {
  try {
    const reminderDays = Object.keys(reminderTailendFeedbackConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition =
          reminderTailendFeedbackConditionsMap[reminderDay].condition;
        const notification_id =
          reminderTailendFeedbackConditionsMap[reminderDay].notification_id;
        tailendFeedbackReminder({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(
          `Error in feedback notification reminder No:${reminderDay}`,
          error
        );
      }
    }
  } catch (error) {
    console.log("Error in sending feedback notifications", error);
  }
}

const tailendFeedbackReminderCallConditionsMap = {
  firstReminder: {
    condition: `	(
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date)=1
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =6
		)
	)`,
    notification_id: 170,
  },
  secondReminder: {
    condition: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =7 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =7
		)
	)`,
    notification_id: 171,
  },
  thirdReminder: {
    condition: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =8 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =8
		)
	)`,
    notification_id: 172,
  },
  fourthReminder: {
    condition: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =9
		)
	)`,
    notification_id: 173,
  },
  fifthReminder: {
    condition: `	(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =10
		)
	)`,
    notification_id: 174,
  },
};

async function tailendFeedbackCallReminder({
  reminderDayCondition,
  notification_id,
}) {
  try {
    const { results: users } = await readRecord({
      selectFields: ["cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "cu.user_id = cd.user_id AND sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        { field: reminderDayCondition, operator: "", value: "", raw: true },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    const user_ids = users.map((user) => user.user_id);

    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in feedback call reminder", error);
  }
}

async function sendTailendFeedbackCallReminderNotification() {
  try {
    const reminderDays = Object.keys(tailendFeedbackReminderCallConditionsMap);
    for (const reminderDay of reminderDays) {
      try {
        const reminderDayCondition =
          tailendFeedbackReminderCallConditionsMap[reminderDay].condition;
        const notification_id =
          tailendFeedbackReminderCallConditionsMap[reminderDay].notification_id;
        tailendFeedbackCallReminder({
          reminderDayCondition,
          notification_id,
        });
      } catch (error) {
        console.log(`Error in feedback call reminder No:${reminderDay}`, error);
      }
    }
  } catch (error) {
    console.log("Error in sending feedback call reminder notifications", error);
  }
}

async function clientsDroppingOut() {
  try {
    const { results: users } = await readRecord({
      selectFields: [
        "cd.user_id",
        "ad.email_id as mentor_email",
        "ad.crm_user",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        {
          field: "sop.expiry_date",
          operator: "=",
          value: "DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
          raw: true,
        },
      ],
    });
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    // console.log(object);
    const finalData = users.map((user, index) => {
      const mappedData = {
        user_details: {
          user_name: details[0].client_name || null,
          email_id: details[0].client_email || null,
          phone_number: details[0].client_phone || null,
          program_number: details[0].client_program_count,
          wallet: details[0].client_wallet || null,
          user_status: details[0].sub_user_status || null,
        },
        program_details: {
          name:
            `${details[0].current_program_name} (${details[0].current_program_duration} Days)` ||
            null,
          mrp: details[0].current_program_mrp || null,
          paid: details[0].current_program_amount || null,
          Ssn: `(${details[0].current_program_sent_sessions}/${details[0].current_program_total_sessions})`,
          mentor: users[index].crm_user,
          advance_program_count: details[0].client_advance_program_count,
        },
      };
      return mappedData;
    });
    console.log(finalData, 2856);
    function generateHorizontalUserTable(users) {
      const flattenSection = (section, sectionName = "") => {
        return Object.entries(section)
          .map(([key, value]) => {
            let displayKey = key.replace(/_/g, " ");
            if (sectionName === "user_details") {
              if (key === "program_number") {
                return `<strong>${displayKey}:</strong> ${value ?? "-"} `;
              }
              if (key === "wallet") {
                return `<strong>${displayKey}:</strong> ${value ?? "-"} `;
              }
              return `${value ?? "-"}`; // Show only the value
            }
            if (key === "advance_program_count") {
              if (value > 0) {
                return `<strong style="color:green;">Client has ${value} adv purchase </strong>`;
              } else {
                return `<strong style="color:red;">Client has no advance purchase </strong>`;
              }
            } else {
              return `<strong>${displayKey}:</strong> ${value ?? "-"}`;
            }
          })
          .join("<br>");
      };

      let html = `
        <div style="overflow-x:auto;">
          <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; min-width: 600px;">
            <thead style="background-color:#f2f2f2;">
              <tr>
                <th>User Details</th>
                <th>Program Details</th>
              </tr>
            </thead>
            <tbody>`;

      users.forEach((user) => {
        html += `
              <tr>
                <td>${flattenSection(user.user_details, "user_details")}</td>
                <td>${flattenSection(user.program_details)}</td>
              </tr>`;
      });

      html += `
            </tbody>
          </table>
        </div>`;

      return html;
    }

    const mentorEmailSet = new Set(users.map((u) => u.mentor_email));
    const mailData = {
      from: "info@balancenutrition.in",
      to: Array.from(mentorEmailSet).join(","),
      // to: "ayush.dubey@balancenutrition.in",
      subject: "Clients Dropping Out Tomorrow",
      html: generateHorizontalUserTable(finalData),
    };
    console.log(generateHorizontalUserTable(finalData), 2916);
    sendMailUtil({
      from: mailData.from,
      to: mailData.to,
      subject: mailData.subject,
      html: mailData.html,
      bcc: "testerteam@balancenutrition.in",
    });
  } catch (error) {
    console.log(error);
  }
}
// async function uploadNotificationsUsingCSV() {
//   try {
//     const workbook = XLSX.readFile("./src/crons/notifications.xlsx");
//     const sheetName = workbook.SheetNames[0];
//     // console.log(sheetName[10]);
//     // return false;
//     const sheet = workbook.Sheets[sheetName];
//     const data = XLSX.utils.sheet_to_json(sheet);
//     console.log(data.length);
//     console.log(data[0]);
//     for (let i = 0; i < data.length; i++) {
//       const notification = data[i];
//       const label = [];
//       notification.Range.split(" ").map((word) => {
//         if (word !== "") {
//           label.push(word);
//         }
//       });
//       const descripton = notification.Title.split(" ");
//       descripton.map((word, index) => {
//         if (
//           index === descripton.length - 2 ||
//           index === descripton.length - 1
//         ) {
//           label.push(" ", word);
//         }
//       });
//       console.log(label.join(""), notification["New CS DB Whatsapp TEXT"]);
//       const insertResult = await insertRecord(
//         tables.whatsappText,
//         ["label", "whatsapp_text", "text_to", "variables", "source"],
//         [
//           label.join(""),
//           notification["New CS DB Whatsapp TEXT"],
//           "client",
//           `["name"]`,
//           "cd_db",
//         ]
//       );
//       console.log(insertResult, i);
//     }
//   } catch (error) {
//     console.log("Error in uploading notifications using CSV", error);
//   }
// }
// uploadNotificationsUsingCSV();

async function sendPageVisitMails({ status, page_type }) {
  try {
    const statusMap = {
      Active: ["Active"],
      OCR: ["Completed", "Dropout", "Maintenance", "Fs"],
    };
    const type = page_type === 1 ? "Program" : "Checkout";
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: ["pv.user_id"],
        table: `${tables.inAppPageVisitLog} pv`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "pv.user_id = cd.user_id",
          },
          {
            type: `LEFT`,
            table: `${tables.orderDetails} od`,
            on: "pv.user_id = od.user_id AND DATE(od.order_date)>= pv.visit_date",
          },
        ],
        conditions: [
          { field: "pv.page_type", operator: "=", value: page_type },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: statusMap[status],
          },
          { field: "od.order_id", operator: "IS", value: "NULL", raw: true },
          {
            field: "pv.visit_date",
            operator: ">=",
            value: `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
            raw: true,
          },
        ],
        groupBy: ["pv.user_id"],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
        });
        return mappedData;
      });
      const mailData = {
        from: "support@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `${status} ${type} Visit In App ${moment().format(
          "MMMM-DD"
        )} MTD (NOT PAID)`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { pv } =
        status === "Active"
          ? safeJSONParse(admin.active)
          : safeJSONParse(admin.oc);
      if (pv.cc) {
        mailData.cc = pv.cc;
        console.log(pv.cc, 3069);
      }
      if (pv.bcc) {
        mailData.bcc = pv.bcc;
        console.log(pv.bcc, 3071);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.admin_user_id);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        bcc: mailData.bcc,
        cc: mailData.cc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}
// sendPageVisitMails({ status: "Active", page_type: 1 });
// sendPageVisitMails({ status: "OCR", page_type: 2 });
// console.log(moment().format("dddd"), 3077);
async function sendPageVisit({ status, page_type }) {
  try {
    const statusMap = {
      Active: ["Active"],
      OCR: ["Completed", "Dropout", "Maintenance", "Fs"],
    };
    const type = page_type === 1 ? "Program" : "Checkout";
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: ["pv.user_id"],
        table: `${tables.inAppPageVisitLog} pv`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "pv.user_id = cd.user_id",
          },
        ],
        conditions: [
          { field: "pv.page_type", operator: "=", value: page_type },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: statusMap[status],
          },
          {
            field: "pv.visit_date",
            operator: "=",
            value: `CURDATE()`,
            raw: true,
          },
          {
            field: "STR_TO_DATE(pv.visit_time, '%H:%i:%s')",
            operator: ">=",
            value: `CURTIME() - INTERVAL 15 MINUTE`,
            raw: true,
          },

          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
            raw: true,
          },
        ],
        groupBy: ["pv.user_id"],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
        });
        return mappedData;
      });
      const mailData = {
        from: "support@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `${status} ${type} Visit Last 15 Minutes`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { pv } =
        status === "Active"
          ? safeJSONParse(admin.active)
          : safeJSONParse(admin.oc);
      if (pv.cc) {
        mailData.cc = pv.cc;
        console.log(pv.cc, 3069);
      }
      if (pv.bcc) {
        mailData.bcc = pv.bcc;
        console.log(pv.bcc, 3071);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.admin_user_id);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        bcc: mailData.bcc,
        cc: mailData.cc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}
async function yesterdayDroppedOutClients() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: ["cd.user_id"],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "INNER",
            table: `${tables.leadStatusLog} lsl`,
            on: "lsl.user_id = cd.user_id",
          },
        ],
        conditions: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dropout",
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
            raw: true,
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Dropout'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) = CURDATE() - INTERVAL 1 DAY",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
        });
        return mappedData;
      });
      const mailData = {
        from: "support@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `Client Dropped out yesterday`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { pv } = safeJSONParse(admin.active);
      if (pv.cc) {
        mailData.cc = pv.cc;
        console.log(pv.cc, 3069);
      }
      if (pv.bcc) {
        mailData.bcc = pv.bcc;
        console.log(pv.bcc, 3071);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.admin_user_id);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        cc: mailData.cc,
        bcc: mailData.bcc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}

async function onholdClientsExpiry({ overdue = false }) {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: ["COUNT(cd.user_id) as total_users"],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} od`,
            on: "cd.active_order_id = od.sub_order_id",
          },
        ],
        conditions: [
          { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "CURDATE()",
            operator: overdue ? ">=" : "=",
            value: "od.end_date",
            raw: true,
          },
        ],
      });
      console.log(users[0].total_users, 3351);
      if (users[0].total_users === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const data = {
        title: overdue ? "Onhold OverDue" : "Onhold Due Today",
        description: overdue
          ? "These clients Break is Overdue. Please Check!"
          : "These clients is Break Over Today.",
        priority: 1,
        redirect: overdue ? "/client/onholdOD" : "/client/onhold",
      };

      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}

async function dailyFuCheck() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
      const data = {
        title: "Daily Follow Up",
        description: "Have you done your Daily Follow with Clients?",
        priority: 1,
        redirect: "/daily-fu",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in dailyFuCheck", error);
  }
}

async function checkValidityAwarenessForMentors() {
  try {
    // Run ONE grouped query instead of looping mentors
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.mentor_assigned AS mentor_id",
        "COUNT(DISTINCT ud.user_id) AS count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.program_expiry_log} pel`,
          on: "pel.sub_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        {
          field: `
            (
              DATEDIFF(sop.expiry_date, CURDATE()) >= 0
              AND DATEDIFF(sop.expiry_date, CURDATE()) <= (sop.pending_session * 11)
              AND (sop.pending_session * 11 - DATEDIFF(sop.expiry_date, CURDATE())) >= 15
            )
          `,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ud.user_status", operator: "=", value: "Active" },
        {
          field: "sop.total_sessions <> sop.pending_session",
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ud.sub_user_status", operator: "!=", value: "Onhold" },
        { field: "pel.id", operator: "IS", value: "NULL", raw: true },
      ],
      groupBy: ["ud.mentor_assigned"], // important: group results per mentor
    });

    if (!results || results.length === 0) {
      console.log("No mentors found with validity awareness users.");
      return;
    }

    for (const row of results) {
      if (row.count > 0 && row.mentor_id) {
        const data = {
          // title: "Have You Checked the Validity Awareness Table?",
          title: "Validity Awareness Alert!",
          description: `You Need to Review ${row.count} Clients’ Program Validity`,
          priority: 1,
          redirect: "/?modal=validity_awareness_plus_increase&card=3", // adjust if your frontend path differs
        };
        // console.log(data);
        // Fire SSE popup to that mentor
        sendSSEEvent({ mentor_id: row.mentor_id, data });
      }
    }
  } catch (error) {
    console.error("Error in checkValidityAwarenessForMentors:", error);
  }
}

export async function checkProductPayment() {
  try {
    // Fetch orders from the last 5 minutes
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.mentor_assigned AS mentor_id",
        "ud.counsellor_assigned AS counsellor_id",
        "ud.user_id",
        "ud.user_status",
        "GROUP_CONCAT(po.product_name) AS product_name",
        "SUM(po.quantity) AS quantity",
        "SUM(po.total_price) AS total_price",
        "COUNT(po.order_id) AS count",
        "ud.first_name",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.productOrders} po`,
          on: "po.user_id = ud.user_id",
        },
      ],
      conditions: [
        // Only paid orders created in the last 5 minutes
        {
          field: "po.razorpay_payment_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "po.created_at",
          operator: ">=",
          value: "DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
          raw: true,
        },
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      groupBy: ["po.razorpay_payment_id"],
    });

    if (!results || results.length === 0) {
      console.log("No product orders in the last 5 minutes.");
      return;
    }

    for (const row of results) {
      if (row.count > 0) {
        const data = {
          title: `Product Purchase Alert (${row.user_status})`,
          description: `${row.first_name} has purchased a product on website`,
          priority: 1,
          redirect:
            row.user_status?.toLowerCase() !== "lead"
              ? `/profile/${row.user_id}?menu=order_history&type=product`
              : `/profile/${row.user_id}?menu=product_history`,
        };

        const targetId =
          row.user_status?.toLowerCase() === "lead"
            ? row.counsellor_id
            : row.mentor_id;

        if (targetId) {
          sendSSEEvent({ mentor_id: targetId, data });
          console.log(data);
        } else {
          console.warn(
            `No valid target (mentor/counsellor) for user_id ${row.user_id}`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error in checkProductPayment:", error);
  }
}

async function checkPendingDietsForMentors() {
  try {
    // Run a query to get the count of users with pending diets for all mentors
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(DISTINCT ud.user_id) AS count",
        "'diets_pending' as type",
        'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        "ud.mentor_assigned", // Add mentor_assigned here to group results by mentor
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} adv_sop`,
          on: "ud.user_id = adv_sop.user_id AND adv_sop.program_status = '4'",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: "wr.sub_order_id = sop.sub_order_id AND sop.sent_sessions = wr.session",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions + 1 = dsl.session",
        },
        {
          table: `${tables.ingredientChecklistRecords} iclr`,
          type: "LEFT",
          on: "iclr.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "date(sop.start_date)",
          operator: ">=",
          value: moment().format("YYYY-MM-DD"),
          raw: true,
        },
        {
          orConditions: [
            { field: "iclr.completion_status", operator: "=", value: "2" },
            {
              field: "ud.last_screen_visited",
              operator: "IN",
              value: ["e-kit", "my_profile", "bn_ekit"],
            },
          ],
        },
        {
          field: "sop.sent_sessions <> sop.total_sessions",
          operator: "",
          value: "",
          raw: true,
        },
        {
          orConditions: [
            {
              field:
                "(adv_sop.sub_order_id IS NULL AND sop.sent_sessions <> sop.total_sessions)",
              operator: "",
              value: "",
              raw: true,
            },
            {
              field: "adv_sop.sub_order_id",
              operator: "IS NOT",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          orConditions: [
            { field: "wr.days", operator: "=", value: 10 },
            {
              field: "sop.sent_sessions",
              operator: "=",
              value: "0",
              raw: true,
            },
          ],
        },
      ],
      groupBy: ["ud.mentor_assigned"], // Group the results by mentor
    });

    // Check if any mentors or users were found
    if (!results || results.length === 0) {
      console.log("No mentors found with pending diets.");
      return;
    }

    // Loop through each mentor in the results
    for (const row of results) {
      if (row.count > 0) {
        const data = {
          title: "Pending Diet Alert!",
          description: `You have ${row.count} clients with pending diets.`,
          priority: 1,
          redirect: "/?modal=diets_pending&card=1", // Adjust if necessary
        };

        // Log for debugging purposes
        console.log(`Sending alert to mentor ${row.mentor_assigned}:`, data);

        // Fire SSE popup to notify the mentor
        sendSSEEvent({ mentor_id: row.mentor_assigned, data });
      }
    }
  } catch (error) {
    console.error("Error in checkPendingDietsForMentors:", error);
  }
}

async function dailyLeadFuCheck() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
      const data = {
        title: "Follow-Up Reminder: Leads",
        description: "Have you added follow-up for your Leads?",
        priority: 1,
        redirect: "/?modal=followups_pending_lead&card=6",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in dailyLeadFuCheck", error);
  }
}

async function dailyClientFuCheck() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
      const data = {
        title: "Follow-Up Reminder: Clients",
        description: "Have you added follow-up for your Clients?",
        priority: 1,
        redirect: "/?modal=followups_pending&card=5",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in dailyClientFuCheck", error);
  }
}

async function dailyFirstPitch48HrCheck() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
      const data = {
        title: "Follow-Up Reminder: First Pitch",
        description:
          "First pitched 48 hours ago. Program not suggested even after initiating pitching.",
        priority: 1,
        redirect: "/?modal=first_pitched_no_fu&card=4",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in dailyFirstPitch48HrCheck", error);
  }
}

async function dailyPitched48HrNoActivityCheck() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
      const data = {
        title: "Follow-Up Reminder: Pitched 48 Hrs Ago",
        description:
          "Program pitched 2 days ago but no activity recorded in CRM.",
        priority: 1,
        redirect: "/?modal=pitched_no_fu&card=4",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in dailyPitched48HrNoActivityCheck", error);
  }
}

async function checkMissedCallsForMentors() {
  try {
    // Run a query to get missed calls grouped by mentor
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "COUNT(DISTINCT cu.user_id) AS count",
        "'calls_missed' as type",
        'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        "ud.mentor_assigned",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = cu.user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(cu.schedule_date)",
          operator: "<",
          value: moment().format("YYYY-MM-DD"),
        },
        { field: "cu.call_status", operator: "=", value: 0 }, // pending / not done
        { field: "cu.call_type", operator: "<>", value: "14" }, // exclude follow-up calls
        {
          field: `cu.user_id NOT IN (
            SELECT cu1.user_id
            FROM ${tables.callUpdates} cu1
            WHERE cu1.added_by = cu.added_by
              AND cu1.call_status = '1'
            GROUP BY cu1.user_id
          )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      groupBy: ["ud.mentor_assigned"], // group results per mentor
    });

    // No mentors/users found
    if (!results || results.length === 0) {
      console.log("No mentors found with missed calls.");
      return;
    }

    // Loop through each mentor in the results
    for (const row of results) {
      if (row.count > 0) {
        const data = {
          title: "Missed Call Alert!",
          description: `You have ${row.count} clients with missed calls.`,
          priority: 1,
          redirect: "/?modal=calls_missed&card=3", // adjust as needed
        };

        // Debug log
        console.log(
          `Sending missed-call alert to mentor ${row.mentor_assigned}:`,
          data
        );

        // Fire SSE popup
        sendSSEEvent({ mentor_id: row.mentor_assigned, data });
      }
    }
  } catch (error) {
    console.error("Error in checkMissedCallsForMentors:", error);
  }
}

async function checkDietOverdueForAllMentors() {
  try {
    // Run a query to get the count of users with overdue diets for all mentors
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(DISTINCT ud.user_id) as count",
        "'diet_od' as type",
        'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        "ud.mentor_assigned", // Add mentor_assigned here to group results by mentor
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "INNER",
          table: `${tables.weightRecords} wr`,
          on: "wr.sub_order_id = ud.active_order_id AND sop.sent_sessions = wr.session",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions + 1",
        },
      ],
      conditions: [
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.pending_session",
          operator: ">",
          value: "sop.sent_sessions",
          raw: true, // Ensures session is still pending
        },
        {
          field: "wr.session",
          operator: "=",
          value: "sop.sent_sessions",
          raw: true,
        },
        {
          field: "wr.posted_date",
          operator: "<=",
          value: "NOW() - INTERVAL 48 HOUR",
          raw: true, // At least 48 hours passed since last weight
        },
        {
          field: "wr.days",
          operator: ">=",
          value: 10,
          raw: true, // 10 days gap to qualify as diet overdue
        },
        {
          orConditions: [
            {
              field: "dsl.session",
              operator: "IS",
              value: null,
              raw: true,
            },
            {
              field: "dsl.diet_status",
              operator: "<>",
              value: 4, // Diet status is not completed (assuming '4' is the completed status)
            },
          ],
        },
      ],
      groupBy: ["ud.mentor_assigned"], // Group the results by mentor
    });

    // Check if any mentors or users were found
    if (!results || results.length === 0) {
      console.log("No mentors found with diet overdue users.");
      return;
    }

    // Loop through each mentor in the results
    for (const row of results) {
      if (row.count > 0) {
        const data = {
          title: "Overdue Diet Alert!",
          description: `You have ${row.count} clients with overdue diets.(48 hours++)`,
          priority: 1,
          redirect: "/?modal=diet_od&card=3", // Adjust if necessary
        };

        // Log for debugging purposes
        console.log(`Sending alert to mentor ${row.mentor_assigned}:`, data);

        // Fire SSE popup to notify the mentor
        sendSSEEvent({ mentor_id: row.mentor_assigned, data });
      }
    }
  } catch (error) {
    console.error("Error in checkDietOverdueForAllMentors:", error);
  }
}

async function validityAwarenessBufferedMail() {
  try {
    const SESSION_DAYS = 11; // as per your rule
    const SCHEDULE_LINK =
      "https://www.balancenutrition.in/app_link/screen_id=29/call_type=45";

    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) AS full_name",
      "ud.user_id",
      "ud.email_id",
      "ud.user_status",
      "sop.sub_order_id",
      "sop.pending_session",
      "sop.total_sessions",
      "sop.sent_sessions",
      "sop.expiry_date",
      "ps.validity",
      "pm.program_name",
      "ad.email_id AS mentor_email",
      "DATEDIFF(sop.expiry_date, CURDATE()) AS days_to_expiry",
      "pel.id AS past_extension_id", // To check if there's a previous extension
      "pel.days as extension_days", // The number of days added in the past extension
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.program_expiry_log} pel`,
        on: "pel.sub_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ud.mentor_assigned = ad.admin_user_id",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [
        {
          field: `DATEDIFF(sop.expiry_date, CURDATE()) >= 0 AND DATEDIFF(sop.expiry_date, CURDATE()) <= (sop.pending_session * 11) AND (sop.pending_session * 11 - DATEDIFF(sop.expiry_date, CURDATE())) >= 15`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.total_sessions <> sop.pending_session",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "ud.sub_user_status",
          operator: "!=",
          value: "Onhold",
        },
        {
          field: "pm.program_category",
          operator: "=",
          value: "Special Stack",
        },
        {
          field: "LCASE(pm.program_name)",
          operator: "NOT LIKE",
          value: "'%khyati%'",
          raw: true,
        },
        {
          field: "LCASE(pm.program_name)",
          operator: "NOT LIKE",
          value: "'%platinum%'",
          raw: true,
        },
        {
          field: "LCASE(pm.program_name)",
          operator: "NOT LIKE",
          value: "'%privy%'",
          raw: true,
        },
      ],
      groupBy: ["ud.user_id", "sop.sub_order_id"],
    });

    if (!results || results.length === 0) {
      return {
        status: false,
        message: "No active program found for this user.",
      };
    }

    // Loop through the results and send an email to each user
    const emailPromises = results.map(async (r) => {
      const fullName = r.full_name || "User";
      const programName = r.program_name || "Your Program";
      const programValidity = parseInt(r.validity ?? 0, 10);
      const pendingSessions = parseInt(r.pending_session ?? 0, 10);
      const validityRemain = Math.max(parseInt(r.days_to_expiry ?? 0, 10), 0);
      const extensionDays = parseInt(r.extension_days ?? 0, 10);

      const BUFFER_DAYS = getBufferDays(programValidity);
      const totalValidityWithBuffer = programValidity + BUFFER_DAYS;

      const timeNeededDays = pendingSessions * SESSION_DAYS;
      const shortfall = Math.max(timeNeededDays - validityRemain, 0);

      const greetingName = fullName.split(" ")[0] || "there";

      // Build the updated HTML message based on the extension and shortfall logic
      let htmlMessage = `
        <p>Hi <strong>${greetingName}</strong>,</p>
 
        <p>We hope everything is well with you. We had increased your program's validity a few weeks ago so you could complete all your sessions on time. We are in the same situation yet again.</p>

        <p><strong>Here are your program validity & past extension details:</strong></p>
        <p><strong>Program Enrolled:</strong> ${programName}</p>
        <p><strong>Total Validity (with ${BUFFER_DAYS}-day buffer):</strong> ${totalValidityWithBuffer} days</p>
        ${
          extensionDays > 0
            ? `<p><strong>Validity Extension Added in the Past:</strong> ${extensionDays} days</p>`
            : ""
        }
        <p><strong>Current Validity Remaining:</strong> ${validityRemain} days</p>
        <p><strong>Sessions Pending:</strong> ${pendingSessions}</p>
        <p><strong>Time Needed to Complete Sessions:</strong> ${timeNeededDays} days (${SESSION_DAYS} days per session)</p>
        <p style="color: red;"><strong>Shortfall:</strong> ${shortfall} days</p>
      `;

      if (shortfall > 0 && extensionDays > 0) {
        htmlMessage += `
          <p>Since we had already added the extra days as a one-time bonus from the mentor's end, there is no provision to extend this further. <strong>Please contact your mentor as soon as possible.</strong></p>
        `;
      } else if (shortfall > 0) {
        htmlMessage += `
          <p>Since this is the first time you’re falling short of validity days, I can add the extra days as a one-time bonus from my dashboard so that you can complete your sessions without disruption. <strong>I have just done that :)</strong></p>
        `;
      }

      htmlMessage += `
        <p>It is essential that you remain regular and focused going forward; irregularity not only affects your program's validity but also your overall health progress and results.</p>

        <p>Let’s make sure we get the most out of your upcoming sessions. Looking forward to your continued commitment.</p>

        <p><strong>P.S.</strong> Feel free to schedule a call with me in case you need any clarity. <a href="${SCHEDULE_LINK}" target="_blank">Click here</a></p>
      `;

      // Prepare email data
      const mailData = {
        from: "support@balancenutrition.in",
        to: r.email_id, // Replace with user's email if available
        subject: "Important: Your Program Validity & Next Steps",
        html: htmlMessage,
        cc: "clientservices@balancenutrition.in",
        bcc: [`${r.mentor_email}`], // Replace with mentor's email if available
      };

      // Send the email
      await sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        cc: mailData.cc,
        bcc: mailData.bcc,
      });
    });

    // Wait for all email promises to resolve
    await Promise.all(emailPromises);

    return { status: true, message: "Emails sent successfully." };
  } catch (error) {
    console.error(error);
    return { status: false, message: "Internal Server Error" };
  }
}

const sendTailendNoAdvacnePurchaseUserReport = async () => {
  try {
    const pendingStatuses = [0, 1, 2, 3];
    const { results: allMentors } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 }, // Assuming role_id 1 is for mentors
      ],
    });

    // Loop through each mentor
    for (const mentor of allMentors) {
      const allUsers = [];
      const mentorId = mentor.admin_user_id;

      // Fetch users for each pending status for the current mentor
      for (let pending of pendingStatuses) {
        const { results } = await readRecord({
          table: `${tables.userDetails} cd`,
          selectFields: [
            "cd.user_id",
            "cd.suggested_program_id",
            "sop.pending_session",
            "cd.sub_user_status",
          ],
          conditions: [
            {
              field: "cd.mentor_assigned",
              operator: "=",
              value: parseInt(mentorId),
            },
            { field: "sop.pending_session", operator: "=", value: pending },
            {
              field: `NOT EXISTS (
                SELECT 1 FROM ${tables.subOrderPrograms} sop2 
                WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
              )`,
              operator: "",
              value: "",
              raw: true,
            },
            {
              field: "cd.user_status",
              operator: "IN",
              value: ["Active"],
            },
            {
              field: "cd.sub_user_status",
              operator: "IN",
              value: [
                "Dormant",
                "Onhold",
                "Cleanse active",
                "Active",
                "notstarted",
              ],
            },
            {
              field: "sop.program_type",
              operator: "=",
              value: "0",
            },
            {
              field: "sop.program_id",
              operator: " NOT IN ",
              value: `(SELECT program_id FROM programs_master WHERE program_category = 'Basic Stack')`,
              raw: true,
            },
          ],
          joins: [
            {
              type: "LEFT",
              table: `${tables.subOrderPrograms} sop`,
              on: "cd.active_order_id = sop.sub_order_id",
            },
          ],
          groupBy: [
            "cd.user_id",
            "cd.suggested_program_id",
            "sop.pending_session",
            "cd.sub_user_status",
          ],
        });

        results.forEach((r) => (r.pending_session = pending));
        allUsers.push(...results);
      }

      if (allUsers.length === 0) {
        console.log(`No users found for mentor ${mentor.first_name}`);
        continue;
      }

      const userIds = allUsers.map((u) => u.user_id);
      const userDetails = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          goal_weight: true,
          health_score: true,
        },
        orderBy: `FIELD(cd.user_id, ${userIds.join(",")})`,
      });

      const pendingCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
      const rows = allUsers.map((u, idx) => {
        const d = userDetails[idx];
        pendingCounts[u.pending_session]++;

        let sugg =
          "<td><strong><span class='color:red;'>No Program Suggested</span></strong></td>";
        if (d.suggested_program_name) {
          sugg = `<td>
        <strong>Suggested Program:</strong> ${
          d.suggested_program_name || "-"
        }<br>          
        <strong>Suggested Duration:</strong> ${
          d.suggested_program_days || "-"
        }<br>
        <strong>Suggested Amount:</strong> ${d.suggested_amount || "-"}<br><br>
       
        </td>`;
        }
        return `
    <tr>
      <td>
        <strong>Session Pending:</strong> ${u.pending_session}<br>
      </td>
      <td>
        
        <strong>Name:</strong> <a href='https://mentor.balancenutrition.in/profile/${
          u.user_id
        }' target='_blank' >${d.client_name || "-"}</a><br>
        <strong>Phone:</strong> ${d.client_phone || "-"}<br>
        <strong>Email:</strong> ${d.client_email || "-"}<br>
        <strong>Wallet:</strong> ${d.client_wallet || "-"}<br>            
        <strong>Status:</strong> ${u.sub_user_status}<br><br>

        </td>
        <td>
        <strong>Program:</strong> ${d.current_program_name || "-"}<br>
        <strong>Amount Paid:</strong> ${d.current_program_amount || "-"}<br>
        <strong>Program No.:</strong> ${d.client_program_count || "-"}<br>
        <strong>Advance Program Count:</strong> ${
          d.client_advance_program_count || "-"
        }<br><br>

        </td>
        ${sugg}
        <td>
        <strong>Latest Weight:</strong> ${d.client_latest_weight || "-"}<br>
        <strong>Goal Weight:</strong> ${d.goal_weight || "-"}<br>
         </td>
         
    </tr>
  `;
      });

      const htmlSummary = `
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; margin-bottom: 10px;">
    <thead style="background-color: #f2f2f2;">
      <tr>
        <th colspan="2">Client Session Pending Summary</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>3 Pending</strong></td>
        <td>${pendingCounts[3]}</td>
      </tr>
      <tr>
        <td><strong>2 Pending</strong></td>
        <td>${pendingCounts[2]}</td>
      </tr>
      <tr>
        <td><strong>1 Pending</strong></td>
        <td>${pendingCounts[1]}</td>
      </tr>
      <tr>
        <td><strong>0 Pending</strong></td>
        <td>${pendingCounts[0]}</td>
      </tr>
      <tr>
        <td><strong>Total</strong></td>
        <td>${allUsers.length}</td>
      </tr>
    </tbody>
  </table>
  <p style="font-style: italic; font-size: 12px;">*Note: Basic Stack Not Included.</p>
`;

      const htmlTable = `
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px;">
    <thead style="background-color: #f2f2f2;">
      <tr>
        <th>Pending Sessions<br/>(0-3)</th>
        <th>Client Details</th>
        <th>Program Details</th>
        <th>Suggested Details</th>
        <th>Other Details</th>
        
      </tr>
    </thead>
    <tbody>
      ${rows.join("")}
    </tbody>
  </table>
`;

      const mailData = {
        from: "support@balancenutrition.in",
        to: mentor.email_id, // Send to the mentor's email
        // to:"vikram.gupta@balancenutrition.in",
        subject: `Tailend Client Status Report - ( ${mentor.crm_user})`,
        html: `
          <div style="font-family: Arial, sans-serif; font-size: 14px;">
            <p>Hello ${mentor.crm_user},</p>
            <p>Please find below the Tailend Client Summary and details.</p>
            <h3>Tailend Client Status Summary (Including Dormant)</h3>
            ${htmlSummary}
            <h3>Tailend Client Details</h3>
            ${htmlTable}
          </div>
        `,
        // cc: ["khyatirupani@balancenutrition.in"],
        bcc: ["testerteam@balancenutrition.in"], // Always CC testerteam
      };

      // Check if any specific CC/BCC needs to be added for the mentor
      const { pv } = safeJSONParse(mentor.active);
      if (pv.cc) {
        // mailData.cc = pv.cc;
        mailData.cc.push(...pv.cc);
      }
      if (pv.bcc) {
        mailData.bcc.push(...pv.bcc);
      }

      // Send email to the mentor
      await sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        cc: mailData.cc,
        bcc: mailData.bcc,
      });

      console.log(
        `✅ Email sent successfully to mentor: ${mentor.first_name} at ${mentor.email_id}`
      );
    }
  } catch (error) {
    console.error("❌ Error in sending report:", error);
  }
};
// sendTailendNoAdvacnePurchaseUserReport();

async function dietAsk() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
      const data = {
        title: "Any Diet Ask Pending?",
        description: "Do you have any diet ask pending with Maam",
        priority: 1,
        redirect: "/mentor-dashboard?modal=ask_diet",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in dietAsk", error);
  }
}

async function callsBookedMails() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [{ field: "is_active", operator: "=", value: 1 }],
    });
    for (const admin of admins) {
      const startDate = moment()
        .subtract(1, "day")
        .set({ hour: 19, minute: 0, second: 0 })
        .format("YYYY-MM-DD HH:mm:ss");
      const endDate = moment()
        .set({ hour: 9, minute: 0, second: 0 })
        .format("YYYY-MM-DD HH:mm:ss");

      const { results: users } = await readRecord({
        selectFields: [
          "cu.user_id",
          "GROUP_CONCAT(DISTINCT basm.appointment_slots ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', ') AS appointment_slots",
          "cu.call_type",
          "DATE_FORMAT(cu.schedule_date, '%a %b %d %Y') as schedule_date",
        ],
        table: `${tables.callUpdates} cu`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `${tables.numbers} n`,
            on: "n.n < 1 + LENGTH(cu.slot_id) - LENGTH(REPLACE(cu.slot_id, ',', ''))",
          },
          {
            type: "LEFT",
            table: `${tables.slots} basm`,
            on: "basm.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(cu.slot_id, ',', n.n + 1), ',', -1) AS UNSIGNED)",
          },
        ],
        conditions: [
          {
            field: "cu.added_by",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: 0,
          },
          {
            field: "cu.schedule_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["cu.user_id"],
        orderBy: ["CAST(cu.slot_id AS INT) "],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      console.log(users.length, admin.crm_user, 3422);
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
          extraMappings: {
            call_details: {
              appointment_slots: users[index].appointment_slots,
              call_type: callTypes[users[index].call_type],
              schedule_date: users[index].schedule_date,
            },
          },
        });
        return mappedData;
      });
      console.log(finalData, 3467);
      const mailData = {
        from: "info@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `Calls Scheduled For Today (From 7:00 PM IST Yesterday Until 9:00AM IST Today)`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { call } = safeJSONParse(admin.active);
      if (call?.cc) {
        mailData.cc = call.cc;
        console.log(call.cc, 3480);
      }
      if (call?.bcc) {
        mailData.bcc = call.bcc;
        console.log(call.bcc, 3482);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.crm_user, 3487);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        bcc: mailData.bcc,
        cc: mailData.cc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}
async function callsDoneMails() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [{ field: "is_active", operator: "=", value: 1 }],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: [
          "cu.user_id",
          "GROUP_CONCAT(DISTINCT basm.appointment_slots ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', ') AS appointment_slots",
          "cu.call_type",
          "DATE_FORMAT(cu.schedule_date, '%a %b %d %Y') as schedule_date",
        ],
        table: `${tables.callUpdates} cu`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `${tables.numbers} n`,
            on: "n.n < 1 + LENGTH(cu.slot_id) - LENGTH(REPLACE(cu.slot_id, ',', ''))",
          },
          {
            type: "LEFT",
            table: `${tables.slots} basm`,
            on: "basm.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(cu.slot_id, ',', n.n + 1), ',', -1) AS UNSIGNED)",
          },
        ],
        conditions: [
          {
            field: "cu.added_by",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: 1,
          },
          {
            field: "cu.schedule_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["cu.user_id"],
        orderBy: ["CAST(cu.slot_id AS INT) "],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      console.log(users.length, admin.crm_user, 3422);
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
          extraMappings: {
            call_details: {
              appointment_slots: users[index].appointment_slots,
              call_type: callTypes[users[index].call_type],
              schedule_date: users[index].schedule_date,
            },
          },
        });
        return mappedData;
      });
      console.log(finalData, 3467);
      const mailData = {
        from: "info@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `Calls Done For Today ( From 9:00 AM IST TO 7:00 PM IST )`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { call } = safeJSONParse(admin.active);
      if (call?.cc) {
        mailData.cc = call.cc;
        console.log(call.cc, 3480);
      }
      if (call?.bcc) {
        mailData.bcc = call.bcc;
        console.log(call.bcc, 3482);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.crm_user, 3487);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        bcc: mailData.bcc,
        cc: mailData.cc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}
async function callsPendingMails() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [{ field: "is_active", operator: "=", value: 1 }],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: [
          "cu.user_id",
          "GROUP_CONCAT(DISTINCT basm.appointment_slots ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', ') AS appointment_slots",
          "cu.call_type",
          "DATE_FORMAT(cu.schedule_date, '%a %b %d %Y') as schedule_date",
          "cu.call_id",
        ],
        table: `${tables.callUpdates} cu`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `${tables.numbers} n`,
            on: "n.n < 1 + LENGTH(cu.slot_id) - LENGTH(REPLACE(cu.slot_id, ',', ''))",
          },
          {
            type: "LEFT",
            table: `${tables.slots} basm`,
            on: "basm.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(cu.slot_id, ',', n.n + 1), ',', -1) AS UNSIGNED)",
          },
        ],
        conditions: [
          {
            field: "cu.added_by",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: 0,
          },
          {
            field: "cu.schedule_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["cu.user_id"],
        orderBy: ["CAST(cu.slot_id AS INT) "],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      console.log(users[0], admin.crm_user, 3422);
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
          extraMappings: {
            call_details: {
              appointment_slots: users[index].appointment_slots,
              call_type: callTypes[users[index].call_type],
              schedule_date: users[index].schedule_date,
            },
          },
        });
        return mappedData;
      });
      console.log(finalData, 3467);
      const mailData = {
        from: "info@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `Calls Pending For Today ( From 9:00 AM IST TO 7:00 PM IST )`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { call } = safeJSONParse(admin.active);
      if (call?.cc) {
        mailData.cc = call.cc;
        console.log(call.cc, 3480);
      }
      if (call?.bcc) {
        mailData.bcc = call.bcc;
        console.log(call.bcc, 3482);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.crm_user, 3487);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        bcc: mailData.bcc,
        cc: mailData.cc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}

async function callsUnansweredMails() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [{ field: "is_active", operator: "=", value: 1 }],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: [
          "cu.user_id",
          "GROUP_CONCAT(DISTINCT basm.appointment_slots ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', ') AS appointment_slots",
          "cu.call_type",
          "DATE_FORMAT(cu.schedule_date, '%a %b %d %Y') as schedule_date",
          "cu.call_id",
        ],
        table: `${tables.callUpdates} cu`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `${tables.numbers} n`,
            on: "n.n < 1 + LENGTH(cu.slot_id) - LENGTH(REPLACE(cu.slot_id, ',', ''))",
          },
          {
            type: "LEFT",
            table: `${tables.slots} basm`,
            on: "basm.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(cu.slot_id, ',', n.n + 1), ',', -1) AS UNSIGNED)",
          },
        ],
        conditions: [
          {
            field: "cu.added_by",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "cu.call_status",
            operator: "IN",
            value: ["2", "4"],
          },
          {
            field: "cu.schedule_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["cu.user_id"],
        orderBy: ["CAST(cu.slot_id AS INT) "],
      });

      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      console.log(users[0], admin.crm_user, 3422);
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
          extraMappings: {
            call_details: {
              appointment_slots: users[index].appointment_slots,
              call_type: callTypes[users[index].call_type],
              schedule_date: users[index].schedule_date,
            },
          },
        });
        return mappedData;
      });
      console.log(finalData, 4140);
      // return false;
      const mailData = {
        from: "info@balancenutrition.in",
        to: admin.email_id,
        // to: "ayush.dubey@balancenutrition.in",
        subject: `Calls Unanswered/Cancelled For Today ( From 9:00 AM IST TO 7:00 PM IST )`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { call } = safeJSONParse(admin.active);
      if (call?.cc) {
        mailData.cc = call.cc;
        console.log(call.cc, 3480);
      }
      if (call?.bcc) {
        mailData.bcc = call.bcc;
        console.log(call.bcc, 3482);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.crm_user, 3487);
      sendMailUtil({
        from: mailData.from,
        to: mailData.to,
        subject: mailData.subject,
        html: mailData.html,
        bcc: mailData.bcc,
        cc: mailData.cc,
      });
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}

async function iclPopUp() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'icl_od' as type",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: "ud.user_id = iclr.user_id AND iclr.active_order_id = ud.active_order_id",
          },
        ],
        conditions: [
          {
            field:
              "((iclr.completion_status = 0 OR iclr.user_id IS NULL) OR (iclr.completion_status = 1 AND iclr.user_id IS NOT NULL))",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.created_at",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "sop.program_type",
            operator: "=",
            value: 0,
          },
          {
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
        ],
      });
      console.log(users[0].count, admin.first_name, 3387);
      if (users[0].count === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const data = {
        title: "ICL Not Filled",
        description: "These clients ICL is not filled.",
        priority: 1,
        redirect: "/client/icl-not-filled",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in nafPopUp", error);
  }
}
// iclPopUp();
async function nafPopUp() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'assessment_od' as type",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: "ud.user_id = ass.user_id AND ass.active_order_id = ud.active_order_id",
          },
        ],
        conditions: [
          {
            field:
              "((ass.completion_status = 0 OR ass.user_id IS NULL) OR (ass.completion_status = 1 AND ass.user_id IS NOT NULL))",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.created_at",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "sop.program_type",
            operator: "=",
            value: 0,
          },
          {
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
        ],
      });
      console.log(users[0].count, admin.first_name, 3387);
      if (users[0].count === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const data = {
        title: "Assessment Not Filled",
        description: "These clients Assessment is not filled.",
        priority: 1,
        redirect: "/client/naf-not-filled",
      };
      sendSSEEvent({ mentor_id: admin.admin_user_id, data });
    }
  } catch (error) {
    console.log("Error in nafPopUp", error);
  }
}

async function paymentLinkExpiring({ day = "today" }) {
  try {
    let date = moment().format("YYYY-MM-DD");
    if (day === "tomorrow") {
      date = moment().add(1, "days").format("YYYY-MM-DD");
    } else if (day === "yesterday") {
      date = moment().subtract(1, "days").format("YYYY-MM-DD");
    }
    const templateMapping = {
      yesterday: {
        mail_subject: "Payment Link Expired",
        mail_body: (user) => `<p>Hi ${user.first_name},</p>
        <p>You wanted to register for the <b>${user.program_duration} ${user.program_name} program</b> & we shared a payment link with you as well but the link expired.</p>
        <p>However, the good news is that we have requested the team to extend the offer till tomorrow for you :)</p>
        <p>WhatsApp <b>${user.designation} ${user.crm_user}</b> on 
        <a href='https://wa.me/${user.mentor_phone}?text=My%20payment%20link%20expired.%20I%20want%20a%20new%20link.%20My%20email%20address%20is%20${user.email_id}'>+91-${user.mentor_phone}</a> 
        to get your new link</p>
        <p><b>P.S.</b><p><b>Women Aren&rsquo;t Failing at Health The System Is -&nbsp;</b>Khyati Rupani breaks down why women don&rsquo;t need extreme diets, supplements, or food fads.&nbsp;<a href="https://youtu.be/raenYacbx40?si=VO78qWPFOSfah8yn">Click Here</a> </p></p>
        <p>Regards,<br/>Team Balance Nutrition</p>`,
        wati_template_name: "payment_link_expired_yesterday__new",
        parameteres: (user) => [
          {
            name: "name",
            value: user.first_name,
          },
          {
            name: "phone",
            value: user.client_phone_number,
          },
          { name: "program_name", value: user.program_name },
          { name: "program_day", value: user.program_duration },
          { name: "program_amount", value: user.suggested_amount },
          { name: "counsellor_designation", value: user.designation },
          { name: "counsellor_name", value: user.crm_user },
          { name: "counsellor_wa", value: user.mentor_phone },
          {
            name: "razor_pay_link_id",
            value: user.payment_link.replace("https://rzp.io/rzp/", ""),
          },
          {
            name: "web_link",
            value: user.call_link.replace("https://bit.ly/", ""),
          },
          {
            name: "email_id_consellor_wa",
            value: `${user.mentor_email}/${user.mentor_phone}`,
          },
        ],
      },
      tomorrow: {
        mail_subject: "Your Payment Link Expiring Tomorrow",
        mail_body: (user) => `
    <p>Hi ${user.first_name},</p>
    <p>PFA your payment link for the <b>${user.program_duration} ${user.program_name}</b> program for the amount of Rs.${user.suggested_amount} that is expiring TOMORROW.</p>
    <p><a href="${user.payment_link}" target="_blank">Click Here</a> to Pay now before it Expires.</p>
    <p>You can WhatsApp <b>${user.designation} ${user.crm_user}</b> on <a href="https://wa.me/91${user.mentor_phone}?text=Hi">+91-${user.mentor_phone}</a>.</p>
    <p><b>P.S.</b><p><b>Women Aren&rsquo;t Failing at Health The System Is -&nbsp;</b>Khyati Rupani breaks down why women don&rsquo;t need extreme diets, supplements, or food fads.&nbsp;<a href="https://youtu.be/raenYacbx40?si=VO78qWPFOSfah8yn">Click Here</a> </p></p>
    <p>Regards,<br>Team Balance Nutrition</p>
  `,
        wati_template_name: "payment_link_expiry_tomorrow__new",
        parameteres: (user) => [
          {
            name: "name",
            value: user.first_name,
          },
          {
            name: "phone",
            value: user.client_phone_number,
          },
          { name: "program_name", value: user.program_name },
          { name: "program_day", value: user.program_duration },
          { name: "program_amount", value: user.suggested_amount },
          { name: "counsellor_designation", value: user.designation },
          { name: "counsellor_name", value: user.crm_user },
          { name: "counsellor_wa", value: user.mentor_phone },
          {
            name: "razor_pay_link_id",
            value: user.payment_link.replace("https://rzp.io/rzp/", ""),
          },
          {
            name: "web_link",
            value: user.call_link.replace("https://bit.ly/", ""),
          },
        ],
      },
      today: {
        mail_subject: "Your Payment Link Expiring Today",
        mail_body: (user) => `<p>Hi ${user.first_name},</p>
                <p>PFA your payment link for the <b>${user.program_duration} ${user.program_name}</b> program for the amount of Rs.${user.suggested_amount} that is expiring TODAY.</p>
                <p><a href="${user.payment_link}" target="_blank">Click Here</a> to Pay now before it Expires.</p>
                <p>You can WhatsApp <b>${user.designation} ${user.crm_user}</b> on <a href="https://wa.me/91${user.mentor_phone}?text=Hi">+91-${user.mentor_phone}</a> as well.</p>
              <p><b>P.S.</b><p><b>Women Aren&rsquo;t Failing at Health The System Is -&nbsp;</b>Khyati Rupani breaks down why women don&rsquo;t need extreme diets, supplements, or food fads.&nbsp;<a href="https://youtu.be/raenYacbx40?si=VO78qWPFOSfah8yn">Click Here</a> </p></p>
              <p>Regards,</p>
                <p>Team Balance Nutrition</p>`,
        wati_template_name: "payment_link_expiry_today__new",
        parameteres: (user) => [
          {
            name: "name",
            value: user.first_name,
          },
          {
            name: "phone",
            value: user.client_phone_number,
          },
          { name: "program_name", value: user.program_name },
          { name: "program_day", value: user.program_duration },
          { name: "program_amount", value: user.suggested_amount },
          { name: "counsellor_designation", value: user.designation },
          { name: "counsellor_name", value: user.crm_user },
          { name: "counsellor_wa", value: user.mentor_phone },
          {
            name: "razor_pay_link_id",
            value: user.payment_link.replace("https://rzp.io/rzp/", ""),
          },
          {
            name: "web_link",
            value: user.call_link.replace("https://bit.ly/", ""),
          },
        ],
      },
    };
    const { results: users } = await readRecord({
      selectFields: [
        "cd.first_name",
        "ad.designation",
        "ad.crm_user",
        "pm.program_name",
        "ps.program_duration",
        "cd.user_id",
        "pl.payment_link",
        "ad.official_phone as mentor_phone",
        "cd.email_id",
        "cd.phone_number",
        "ad.email_id as mentor_email",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
        "cd.user_type",
        "REGEXP_REPLACE(cd.phone_code, '[^0-9]', '') as client_phone_code",
        "REGEXP_REPLACE(cd.phone_number, '[^0-9]', '') as client_phone_number",
        "sp1.suggested_amount",
        "ad.call_link",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp1`,
          on: "cd.suggested_program_id = sp1.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sp1.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sp1.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `( 
            (cd.user_type = '1' AND cd.mentor_assigned = ad.admin_user_id) OR 
            (cd.user_type = '0' AND cd.counsellor_assigned = ad.admin_user_id)
          )`,
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "sp1.payment_link_id = pl.id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "cd.user_id = od.user_id AND DATE(od.order_date)>= sp1.added_date",
        },
      ],
      conditions: [
        {
          field: "od.order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "DATE(sp1.payment_expiry)",
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
        { field: "sp1.payment_status", operator: "=", value: 0 },
      ],
    });
    console.log(users, 3943);
    console.log(users.length, 3944);
    if (users.length === 0) {
      console.log("No users found for ", day);
      return false;
    }
    for (const user of users) {
      const mailData = {
        to: user.email_id,
        cc: user.mentor_email,
        bcc: ["testerteam@balancenutrition.in"],
        subject: templateMapping[day].mail_subject,
        html: templateMapping[day].mail_body(user),
      };
      console.log(mailData, user.user_id, 3990);
      sendMailUtil({
        to: mailData.to,
        cc: mailData.cc,
        bcc: mailData.bcc,
        subject: mailData.subject,
        html: mailData.html,
      });
      const watiResponse = await axios.post(
        `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${user.client_phone_code}${user.client_phone_number}`,
        {
          template_name: templateMapping[day].wati_template_name,
          broadcast_name: templateMapping[day].wati_template_name,
          parameters: templateMapping[day].parameteres(user),
        }
      );
      // const watiResponse = await axios.post(
      //   `http://localhost:3000/api/v1/wati/send-message-template?whatsappNumber=918291113480`,
      //   {
      //     template_name: templateMapping[day].wati_template_name,
      //     broadcast_name: templateMapping[day].wati_template_name,
      //     parameters: templateMapping[day].parameteres(user),
      //   }
      // );
    }
  } catch (error) {
    console.log("Error in paymentLinkExpiring", day, error);
  }
}

/**
 * Cron function to send automated Induction Call reminders
 * Intervals: 0 days (Initial), 1 day (Rem 1), 2 days (Rem 2), 3 days (Final)
 */
export const cronInductionCallReminders = async () => {
  try {
    console.log("--- Starting Induction Call Reminder Cron ---");

    // 1. Fetch clients where Induction Call (type 66) is not done
    const { results: clients } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.phone_code",
        "ud.phone_number",
        "sop.created_at",
        "cu.schedule_date",
        "ad.crm_user as mentor_name"
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id AND cu.call_type = '66'",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        }
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "sop.sent_sessions", operator: "=", value: 0 },
        { 
          orConditions: [
            { field: "cu.call_status", operator: "=", value: 0 },
            { field: "cu.user_id", operator: "IS", value: null, raw: true }
          ]
        }
      ]
    });

    if (!clients || clients.length === 0) {
      console.log("No pending induction calls found.");
      return;
    }

    const today = moment().startOf("day");

    for (const client of clients) {
      // Logic: Use schedule_date if exists, otherwise created_at
      const baseDate = moment(client.created_at).startOf("day");
      const diffDays = Math.abs(today.diff(baseDate, "days"));

      let templateName = "";

      // Condition Mapping
      switch (diffDays) {
        case 0:
          templateName = "induction_call_with_cs";
          break;
        case 1:
          templateName = "induction_call_with_cs_reminder_1";
          break;
        case 2:
          templateName = "induction_call_with_cs_reminder_2";
          break;
        case 3:
          templateName = "induction_call_with_cs_reminder_final";
          break;
        default:
          continue; // Skip if it's past 3 days or in the future
      }

      if (templateName) {
        // Format Phone (Remove non-numeric characters)
        const cleanCode = client.phone_code.replace(/\D/g, "");
        const cleanPhone = client.phone_number.replace(/\D/g, "");
        
        try {
          await axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${cleanCode}${cleanPhone}`,
          {
            template_name: templateName,
            broadcast_name: `Induction_Reminder_Day_${diffDays}`,
            parameters: [
              { name: "name", value: client.first_name },
              { name: "mentor_name", value: client.mentor_name || "Team Balance Nutrition" }
            ],
          }
        );
        console.log(`Reminder Sent: ${templateName} to ${client.user_id} (${cleanCode}${cleanPhone}) on Day ${diffDays}`);
        }
        catch (error) {
          console.error(`Failed to send reminder for ${client.user_id} on Day ${diffDays}:`, error.response ? error.response.data : error.message);
        }
        
      }
    }
  } catch (error) {
    console.error("Error in Induction Call Cron:", error);
  }
};
async function weightUpdateNotification({
  weight_day,
  notification_id,
  notification_day,
}) {
  try {
    const conditions = [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      { field: "sop.program_status", operator: "=", value: "1" },
      {
        field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
        operator: "=",
        value: notification_day,
      },
      { field: "wr.user_id is null", operator: "", value: "", raw: true },
    ];

    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id and sop.sent_sessions = dsl.session and dsl.diet_status='4'",
      },
    ];

    if (weight_day === 5) {
      joins.push({
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: "wr.sub_order_id = sop.sub_order_id and wr.session = sop.sent_sessions and wr.days='5'",
      });
    } else if (weight_day === 10) {
      joins.push({
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: "wr.sub_order_id = sop.sub_order_id and wr.session = sop.sent_sessions and wr.days='10'",
      });
    }

    const { results: users } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.mentor_assigned",
        "sop.sent_sessions",
        // "CONCAT(ad.first_name,' ',ad.last_name) as mentor_name",
        "DATEDIFF(CURDATE(),dsl.diet_start_date) as last_session_sent_days_ago",
        "dsl.diet_start_date",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id and sop.sent_sessions = dsl.session",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: "wr.sub_order_id = sop.sub_order_id and wr.session = sop.sent_sessions",
        },
      ],
      joins,
      conditions,
    });
    const user_ids = users.map((user) => user.user_id);
    console.log(user_ids, 4885);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in weightUpdateNotification", error);
  }
}

async function weightUpdateDormantNotification({
  weight_day,
  notification_id,
  notification_day,
}) {
  try {
    const conditions = [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
      { field: "sop.program_status", operator: "=", value: "1" },
      {
        field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
        operator: "=",
        value: notification_day,
      },
      { field: "wr.user_id is null", operator: "", value: "", raw: true },
    ];

    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id and sop.sent_sessions = dsl.session and dsl.diet_status='4'",
      },
    ];

    if (weight_day === 5) {
      joins.push({
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: "wr.sub_order_id = sop.sub_order_id and wr.session = sop.sent_sessions and wr.days='5'",
      });
    } else if (weight_day === 10) {
      joins.push({
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: "wr.sub_order_id = sop.sub_order_id and wr.session = sop.sent_sessions and wr.days='10'",
      });
    }

    const { results: users } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.mentor_assigned",
        "sop.sent_sessions",
        // "CONCAT(ad.first_name,' ',ad.last_name) as mentor_name",
        "DATEDIFF(CURDATE(),dsl.diet_start_date) as last_session_sent_days_ago",
        "dsl.diet_start_date",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id and sop.sent_sessions = dsl.session",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: "wr.sub_order_id = sop.sub_order_id and wr.session = sop.sent_sessions",
        },
      ],
      joins,
      conditions,
    });
    const user_ids = users.map((user) => user.user_id);
    console.log(user_ids, 4885);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in weightUpdateNotification", error);
  }
}

async function updateClientStatusToOnHold() {
  try {
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.onholdClients} oh`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "oh.user_id = cd.user_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: "oh.start_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
      orderBy: ["oh.id DESC"], // or "oh.created_at"
      groupBy: ["cd.user_id"],
    });

    // console.log(results, 4226);
    // return false;
    for (const user of results) {
      await updateUserStatusAndLog({
        userId: user.user_id,
        status: "Active",
        subStatus: "Onhold",
      });
      console.log("Updated user status to Onhold", user.user_id);
    }
  } catch (error) {
    console.log("Error in updateClientStatusToOnHold", error);
  }
}

async function getMatchingDraftMessage({ user_id }) {
  const draftChecks = [
    {
      name: "welcomeCall",
      draftId: 2935,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: "cu.user_id = ud.user_id AND cu.sub_order_id = sop.sub_order_id AND cu.call_type = '0'",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "sop.sent_sessions", operator: "=", value: 1 },
          {
            orConditions: [
              { field: "sop.order_type", operator: "=", value: "New" },
              { field: "sop.order_type", operator: "=", value: "OCR" },
            ],
          },
          {
            orConditions: [
              { field: "cu.user_id", operator: "IS", value: null, raw: true },
              { field: "cu.call_status", operator: "<>", value: 1 },
            ],
          },
        ],
      }),
    },
    {
      name: "halfTimeCall",
      draftId: 2934,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: "cu.user_id = ud.user_id AND cu.sub_order_id = sop.sub_order_id AND cu.call_type = '1'",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "cu.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      }),
    },
    {
      name: "tailendCall",
      draftId: 2933,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: "cu.user_id = ud.user_id AND cu.sub_order_id = sop.sub_order_id AND cu.call_type = '2'",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: `((sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 9 AND 10) OR (sop.total_sessions = 6 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "cu.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      }),
    },
    {
      name: "halfTimeFeedback",
      draftId: 2932,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.halfTimeFeedback} hf`,
            on: "hf.user_id = ud.user_id AND hf.sub_order_id = sop.sub_order_id",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: `((sop.total_sessions = 3 AND sop.sent_sessions = 2 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 9 AND 10) OR (sop.total_sessions = 6 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "hf.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      }),
    },
    {
      name: "programFeedback",
      draftId: 2931,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.finalFeedback} ff`,
            on: "ff.user_id = ud.user_id AND ff.sub_order_id = sop.sub_order_id",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: `((sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 7 AND 10) OR (sop.total_sessions = 6 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 2) OR (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "ff.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      }),
    },
    {
      name: "halfTimeHsDraft",
      draftId: 2929,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hf`,
            on: "hf.user_id = ud.user_id AND DATE(hf.created) > DATE(dsl.diet_sent_date) AND hf.type = 1",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5) OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5))`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "hf.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      }),
    },
    {
      name: "programHsDraft",
      draftId: 2928,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hf`,
            on: "hf.user_id = ud.user_id AND DATE(hf.created) > DATE(dsl.diet_sent_date) AND hf.type = 2",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: user_id },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: `((sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 5 AND 6) OR (sop.total_sessions = 6 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5))`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "hf.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      }),
    },
    {
      name: "fifthDayOd",
      draftId: 2923,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        conditions: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "ud.user_id", operator: "=", value: user_id },
          {
            field: `DATEDIFF(CURDATE(), dsl.diet_start_date) > 5 AND dsl.mid_session_weight = 0 AND dsl.end_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      }),
    },
    {
      name: "tenDayOd",
      draftId: 2922,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        conditions: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "ud.user_id", operator: "=", value: user_id },
          {
            field: `DATEDIFF(CURDATE(), DATE(dsl.diet_start_date)) > 10 AND dsl.end_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      }),
    },
    {
      name: "fifthDayToday",
      draftId: 2925,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        conditions: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "ud.user_id", operator: "=", value: user_id },
          {
            field: `DATEDIFF(CURDATE(), dsl.diet_start_date) = 5 AND dsl.mid_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      }),
    },
    {
      name: "tenDayToday",
      draftId: 2924,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        conditions: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "ud.user_id", operator: "=", value: user_id },
          {
            field: `DATEDIFF(CURDATE(), DATE(dsl.diet_start_date)) = 10 AND dsl.end_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      }),
    },
    {
      name: "fifthDayTomorrow",
      draftId: 2927,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        conditions: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "ud.user_id", operator: "=", value: user_id },
          {
            field: `DATEDIFF(CURDATE(), dsl.diet_start_date) = 4 AND dsl.mid_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      }),
    },
    {
      name: "tenDayTomorrow",
      draftId: 2926,
      conditions: async () => ({
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        conditions: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          { field: "ud.user_id", operator: "=", value: user_id },
          {
            field: `DATEDIFF(CURDATE(), DATE(dsl.diet_start_date)) = 9 AND dsl.end_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      }),
    },
    // {
    //   name: "defaultDraft",
    //   draftId: 2944,
    //   conditions: async () => ({
    //     joins: [
    //         { type: "INNER", table: `${tables.subOrderPrograms} sop`, on: "sop.sub_order_id = ud.active_order_id" },
    //       ],
    //     conditions: [
    //       { field: "ud.sub_user_status", operator: "=", value: "Active" },
    //       { field: "ud.user_id", operator: "=", value: user_id },
    //     ]
    //   })
    // }
  ];

  for (let draftCheck of draftChecks) {
    const { draftId, conditions, name } = draftCheck;

    const { results: draftResults } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: draftId }],
    });

    if (!draftResults.length) continue;

    const queryParams = await conditions();
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      joins: queryParams.joins,
      conditions: queryParams.conditions,
    });

    if (results.length > 0) {
      const draftString = draftResults[0].description;
      const extractedVariables = extractVariables(draftString);
      const userData = await fetchUserDetailsDynamic({
        ids: [user_id],
        fields: extractedVariables,
      });
      const message = replacePlaceholders(draftString, userData[0]);

      console.log(`Matched Draft: ${name}`);
      console.log("Draft Content:", message);

      return {
        status: true,
        type: name,
        draftId,
        message,
        rawDraft: draftString,
        dataUsed: userData[0],
      };
    }
  }

  console.log("No matching draft found.");
  return { status: false, message: "No Matching Draft Found" };
}

// (async () => {
//   const result = await getMatchingDraftMessage({ user_id: 11126 });
//   console.log(result);
// })();
async function sendAtRiskCron() {
  try {
    const query = await clientEnquiry.aggregate([
      {
        $match: {
          type: { $ne: "broadcast" },
        },
      },
      {
        $group: {
          _id: "$user_id",
          lastMessage: { $max: "$createdAt" },
        },
      },
      {
        $match: {
          lastMessage: {
            $lt: new Date(Date.now() - 48 * 60 * 60 * 1000),
          },
        },
      },
    ]);

    const user_ids = query.map((i) => i._id);

    const { results: data } = await readRecord({
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "LCASE(pms.program_name)",
          operator: "NOT LIKE",
          value: "'%khyati%'",
          raw: true,
        },
        {
          field: "LCASE(pms.program_name)",
          operator: "NOT LIKE",
          value: "'%platinum%'",
          raw: true,
        },
        {
          field: "LCASE(pms.program_name)",
          operator: "NOT LIKE",
          value: "'%privy%'",
          raw: true,
        },
        {
          field: "ud.user_id",
          operator: "IN",
          value: user_ids,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sops`,
          on: "ud.active_order_id = sops.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pms`,
          on: "pms.program_id = sops.program_id",
        },
      ],
      groupBy: ["ud.user_id"],
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.mentor_assigned",
        "ud.my_wallet",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
      ],
    });

    // return false;
    for (const user of data) {
      const result = await getMatchingDraftMessage({ user_id: user.user_id });
      if (result.status) {
        console.log(`User ID: ${user.user_id} => Draft Type: ${result.type}`);
        await clientEnquiry.updateMany(
          {
            user_id: user.user_id,
            mentor_id: user.mentor_assigned,
            type: "query",
          },
          { $set: { type: "replied" } }
        );
        await clientEnquiry.create({
          mentor_id: user.mentor_assigned,
          type: "reply",
          sender: "mentor",
          query: result.message,
          user_id: user.user_id,
          name: user.mentor_name,
        });
        // return false;
        await updateRecord(
          tables.userDetails,
          {
            at_risk_chat: 1,
          },
          {
            user_id: user.user_id,
          }
        );
        // return false;
      }
    }
  } catch (error) {
    console.error("Error fetching matching draft messages:", error);
  }
}

const sendHtjWatiMessage = async (user, templateName, broadcastName) => {
  const fullPhone = `${user?.phone_code?.replace(
    /\D/g,
    ""
  )}${user?.phone_number?.replace(/\D/g, "")}`;

  if (!user.Name || !user.mentor_name || !user.mentor_wa || !fullPhone) {
    console.warn(`⏭ Skipping user ${user.client_id} due to missing fields`);
    return;
  }

  try {
    let client_id_order = `user_id=${user?.client_id}&sub_order_id=${user?.sub_order_id}`;
    const response = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
      {
        template_name: templateName,
        broadcast_name: broadcastName,
        parameters: [
          { name: "name", value: user.Name },
          { name: "mentor_name", value: user.mentor_name },
          { name: "mentor_wa", value: user.mentor_wa },
          { name: "mentor_designation", value: user.mentor_designation },
          { name: "email_id", value: user.email_id },
          { name: "call_link", value: user.call_link },
          { name: "client_id_order", value: client_id_order },
        ],
      }
    );
    console.log(`✅ WATI sent to ${user.client_id} (${fullPhone})`);
  } catch (err) {
    console.error(
      `❌ Failed to send WATI to ${user.Name}:`,
      err.response?.data || err.message
    );
  }
};

const commonSelectFields = [
  `CONCAT(COALESCE(cd.first_name, ''), CASE WHEN cd.first_name IS NOT NULL AND cd.last_name IS NOT NULL THEN ' ' ELSE '' END, COALESCE(cd.last_name, '')) AS Name`,
  "cd.phone_code",
  "cd.phone_number",
  "cd.user_id AS client_id",
  "cd.email_id",
  "cd.sub_user_status AS user_status",
  "sop.sent_sessions AS current_session",
  "ad.official_phone AS mentor_wa",
  "sop.sub_order_id AS sub_order_id",
  "ad.crm_user AS mentor_name",
  "ad.designation AS mentor_designation",
  "ad.call_link AS call_link",
];

const processHtjWati = async ({ joins, conditions, template }) => {
  try {
    const { results: users } = await readRecord({
      selectFields: commonSelectFields,
      table: `${tables.userDetails} cd`,
      joins,
      conditions,
    });
    for (const user of users) {
      await sendHtjWatiMessage(user, template, template);
    }
  } catch (error) {
    console.error(`🔥 Error in ${template}:`, error);
  }
};

export async function sendHalfTimeFeedbackWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.halftimeFeedback} hf`,
        on: "hf.user_id = cd.user_id AND hf.sub_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 3 AND sop.sent_sessions = 2 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 6 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5) OR (sop.total_sessions = 9 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
        operator: "",
        value: "",
      },
      { field: "hf.user_id", operator: "IS", value: "NULL", raw: true },
    ],
    template: "mid_program_feedback_reminder",
  });
}

export async function sendFinalFeedbackWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.finalFeedback} hf`,
        on: "hf.user_id = cd.user_id AND hf.sub_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 5 AND 6) OR (sop.total_sessions = 6 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5))`,
        operator: "",
        value: "",
      },
      { field: "hf.user_id", operator: "IS", value: "NULL", raw: true },
    ],
    template: "final_program_feedback_reminder",
  });
}

export async function sendFinalHealthScoreWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.healthScoreClient} hs`,
        on: "sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id AND hs.type = '2'",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 3) OR (sop.total_sessions = 6 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5) OR (sop.total_sessions = 9 AND sop.sent_sessions = 7 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
        operator: "",
        value: "",
      },
      { field: "hs.id", operator: "IS", value: "NULL", raw: true },
    ],
    template: "program_progress_report_reminder",
  });
}

export async function sendHalfTimeHealthScoreWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.healthScoreClient} hs`,
        on: "sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id AND hs.type = '1'",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 6 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
        operator: "",
        value: "",
      },
      { field: "hs.id", operator: "IS", value: "NULL", raw: true },
    ],
    template: "mid_program_progress_tracker_reminder",
  });
}

export async function sendHTCallReminderWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.callUpdates} cu`,
        on: "cu.user_id = cd.user_id AND sop.sub_order_id = cu.sub_order_id AND cu.call_type = '1'",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5) OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5))`,
        operator: "",
        value: "",
      },
      { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
    ],
    template: "important_update_from_your_mentor_progress_call_",
  });
}

export async function sendTECallReminderWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.callUpdates} cu`,
        on: "cu.user_id = cd.user_id AND sop.sub_order_id = cu.sub_order_id AND cu.call_type = '2'",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 7 AND 9) OR (sop.total_sessions = 6 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5) OR (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
        operator: "",
        value: "",
      },
      { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
    ],
    template: "important_update_from_your_mentor_feedback_call",
  });
}

export async function sendGoalWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id AND cd.user_id = sop.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.bnMyGoalsNew} mg`,
        on: "sop.sub_order_id = mg.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10) OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10))`,
        operator: "",
        value: "",
      },
      {
        field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
        operator: "=",
        value: 0,
      },
    ],
    template: "update_goal_web",
  });
}

export async function sendWelcomeCallWati() {
  await processHtjWati({
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `(
          SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id, sub_order_id ORDER BY call_id DESC) AS rn
          FROM ${tables.callUpdates}
          WHERE call_type = '0'
        ) cu`,
        on: "cd.user_id = cu.user_id AND cu.sub_order_id = sop.sub_order_id AND cu.rn = 1",
        raw: true,
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "cd.user_id = dsl.user_id AND sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      { field: "sop.sent_sessions", operator: "=", value: 1 },
      { field: "sop.program_type", operator: "=", value: 0 },
      {
        orConditions: [
          { field: "sop.order_type", operator: "=", value: "New" },
          { field: "sop.order_type", operator: "=", value: "OCR" },
        ],
      },
      {
        orConditions: [
          { field: "cu.user_id", operator: "IS", value: "NULL", raw: true },
          {
            field:
              "(cu.user_id IS NOT NULL AND cu.call_status NOT IN ('0','1','3'))",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ],
    template: "important_update_from_your_mentor_welcome_call",
  });
}

const sendWeightWatiMessage = async (user, templateName) => {
  const fullPhone = `${user?.phone_code?.replace(
    /\D/g,
    ""
  )}${user?.phone_number?.replace(/\D/g, "")}`;
  if (!user.Name || !user.mentor_name || !user.mentor_wa || !fullPhone) {
    console.warn(`⏭ Skipping user ${user.client_id} due to missing fields`);
    return;
  }
  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
      {
        template_name: templateName,
        broadcast_name: templateName,
        parameters: [
          { name: "name", value: user.Name },
          { name: "mentor_name", value: user.mentor_name },
          { name: "current_session", value: user.current_session },
          { name: "client_id", value: user.client_id },
          { name: "email_id", value: user.email_id },
          { name: "mentor_wa", value: user.mentor_wa },
          {
            name: "weight_week_day",
            value: user?.weight_week_day ? user?.weight_week_day : "NA",
          },
          {
            name: "days_overdue",
            value: user?.days_overdue ? user?.days_overdue : "NA",
          },
        ],
      }
    );
    console.log(`✅ WATI sent to ${user.client_id} (${user.Name})`);
  } catch (err) {
    console.error(
      `❌ Failed to send WATI to ${user.Name}:`,
      err.response?.data || err.message
    );
  }
};

const commonFields = [
  `CONCAT(COALESCE(ud.first_name, ''), CASE WHEN ud.first_name IS NOT NULL AND ud.last_name IS NOT NULL THEN ' ' ELSE '' END, COALESCE(ud.last_name, '')) AS Name`,
  "ud.phone_code",
  "ud.phone_number",
  "ud.user_id AS client_id",
  "ud.email_id",
  "ud.sub_user_status AS user_status",
  "sop.sent_sessions AS current_session",
  "ad.official_phone AS mentor_wa",
  "ad.crm_user AS mentor_name",
];

export async function sendStartWeightReminderWati() {
  const { results: users } = await readRecord({
    selectFields: [
      ...commonFields,
      "ABS(DATEDIFF(CURDATE(), dsl.diet_start_date)) AS days_overdue",
      `(CASE
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 0 THEN 'Today'
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 1 THEN 'Yesterday'
        ELSE 'Few Days Ago'
      END) AS weight_week_day`,
    ],
    table: `${tables.userDetails} ud`,
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = ud.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od2`,
        on: "od2.order_id = sop.order_id",
      },
      {
        type: "INNER",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = '4'",
      },
    ],
    conditions: [
      { field: "ud.sub_user_status", operator: "=", value: "Active" },
      {
        raw: true,
        value: "",
        operator: "",
        field: `(
    (sop.program_type = 0 AND DATEDIFF(CURDATE(), dsl.diet_start_date) BETWEEN 1 AND 5)
    OR
    (sop.program_type != 0 AND DATEDIFF(CURDATE(), dsl.diet_start_date) = 0)
  )`,
      },
      {
        raw: true,
        operator: "",
        value: "",
        field: "(dsl.start_session_weight = 0 OR sop.start_program_weight =0 )",
      },
      { field: "dsl.mid_session_weight", operator: "=", value: 0 },
      { field: "sop.sent_sessions", operator: "=", value: 1 },
      { field: "sop.program_status", operator: "=", value: 1 },
    ],
    groupBy: ["ud.user_id"],
  });

  for (const user of users) {
    await sendWeightWatiMessage(user, "weight_reminder_start_reminder_inapp");
  }
}

export async function sendEndWeightReminderWati() {
  const { results: users } = await readRecord({
    selectFields: [
      ...commonFields,
      "ABS(DATEDIFF(CURDATE(), dsl.diet_start_date)) AS days_overdue",
      `(CASE
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 10 THEN 'Today'
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 11 THEN 'Yesterday'
        ELSE 'Few Days Ago'
      END) AS weight_week_day`,
    ],
    table: `${tables.userDetails} ud`,
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = ud.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od2`,
        on: "od2.order_id = sop.order_id",
      },
      {
        type: "INNER",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = '4'",
      },
      {
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: 'wr.sub_order_id = sop.sub_order_id AND wr.session = sop.sent_sessions AND wr.days = "10"',
      },
    ],
    conditions: [
      { field: "ud.sub_user_status", operator: "=", value: "Active" },
      {
        field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
        operator: "IN",
        value: "(10,11, 12, 13, 14, 15, 16)",
        raw: true,
      },
      {
        raw: true,
        operator: "",
        field: "(dsl.end_session_weight = 0 OR wr.user_id IS NULL)",
        value: "",
      },
      { field: "sop.program_status", operator: "=", value: "1" },
      { field: "ud.mentor_assigned", operator: "!=", value: 196 },
    ],
    groupBy: ["ud.user_id"],
  });

  for (const user of users) {
    await sendWeightWatiMessage(user, "weight_reminder_10th_reminder_inapp");
  }
}

export async function sendMidWeightReminderWati() {
  const { results: users } = await readRecord({
    selectFields: [
      ...commonFields,
      "ABS(DATEDIFF(CURDATE(), dsl.diet_start_date)) AS days_overdue",
      `(CASE
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 5 THEN 'Today'
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 6 THEN 'Yesterday'
        ELSE 'Few Days Ago'
      END) AS weight_week_day`,
    ],
    table: `${tables.userDetails} ud`,
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = ud.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od2`,
        on: "od2.order_id = sop.order_id",
      },
      {
        type: "INNER",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = '4'",
      },
      {
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: 'wr.sub_order_id = sop.sub_order_id AND wr.session = sop.sent_sessions AND wr.days = "5"',
      },
    ],
    conditions: [
      { field: "ud.sub_user_status", operator: "=", value: "Active" },
      {
        field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
        operator: "IN",
        value: "(5,6, 7)",
        raw: true,
      },
      {
        raw: true,
        operator: "",
        value: "",
        field: "(dsl.mid_session_weight = 0 OR wr.user_id IS NULL)",
      },
      { field: "dsl.end_session_weight", operator: "=", value: 0 },
      { field: "sop.program_status", operator: "=", value: "1" },
      { field: "ud.mentor_assigned", operator: "!=", value: 196 },
    ],
    groupBy: ["ud.user_id"],
  });

  for (const user of users) {
    await sendWeightWatiMessage(user, "weight_reminder_5th_reminder_inapp");
  }
}

export async function sendStartDateReminderWati() {
  const { results: users } = await readRecord({
    selectFields: [
      `CONCAT(COALESCE(cd.first_name, ''), CASE WHEN cd.first_name IS NOT NULL AND cd.last_name IS NOT NULL THEN ' ' ELSE '' END, COALESCE(cd.last_name, '')) AS Name`,
      "cd.phone_code",
      "cd.phone_number",
      "cd.user_id AS client_id",
      "cd.email_id",
      "cd.sub_user_status AS user_status",
      "sop.sent_sessions AS current_session",
      "ad.official_phone AS mentor_wa",
      "ad.crm_user AS mentor_name",
      "DATEDIFF(CURDATE(), DATE(dsl.diet_start_date)) as days_overdue",
      `(CASE
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 0 THEN 'Today'
        WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 1 THEN 'Yesterday'
        ELSE 'Few Days Ago'
      END) AS weight_week_day`,
    ],
    table: `${tables.userDetails} cd`,
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = '4'",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = cd.mentor_assigned",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      { field: "dsl.diet_start_date_set_by", operator: "=", value: "Default" },
      {
        raw: true,
        operator: "",
        value: "",
        field: "DATE(dsl.diet_start_date) < DATE(NOW())",
      },
      {
        raw: true,
        operator: "",
        value: "",
        field: "DATEDIFF(CURDATE(), DATE(dsl.diet_start_date)) BETWEEN 1 AND 4",
      },
    ],
    groupBy: ["cd.user_id"],
  });

  for (const user of users) {
    await sendWeightWatiMessage(
      user,
      "imporant_update_from_your_nutritionist_session_start_date"
    );
  }
}

const sendDormantWatiMessage = async (user) => {
  const fullPhone = `${user?.phone_code?.replace(
    /\D/g,
    ""
  )}${user?.phone_number?.replace(/\D/g, "")}`;
  if (!user.Name || !user.mentor_name || !user.mentor_wa || !fullPhone) {
    console.warn(`⏭ Skipping user ${user.client_id} due to missing fields`);
    return;
  }
  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
      {
        template_name: "domant_updated_wati_may_2025_",
        broadcast_name: "domant_updated_wati_may_2025_",
        parameters: [
          { name: "name", value: user.Name },
          { name: "mentor_name", value: user.mentor_name },
          { name: "client_id", value: user.client_id },
          { name: "program_day", value: user.program_day },
          { name: "program_name", value: user.program_name },
          { name: "current_session", value: user.current_session },
          { name: "validity_pending", value: user.validity_pending },
          { name: "pending_session", value: user.pending_session },
          { name: "user_status", value: user.user_status },
          { name: "mentor_wa", value: user.mentor_wa },
        ],
      }
    );
    console.log(
      `✅ Dormant WATI sent to ${user.client_id} ${user.program_name} ${user.program_day} ${user.validity_pending} ${user.current_session} (${fullPhone})`
    );
  } catch (err) {
    console.error(
      `❌ Failed to send Dormant WATI to ${user.Name}:`,
      err.response?.data || err.message
    );
  }
};

export async function sendDormantClientReminderWati() {
  const { results: users } = await readRecord({
    selectFields: [
      `CONCAT(COALESCE(cd.first_name, ''), CASE WHEN cd.first_name IS NOT NULL AND cd.last_name IS NOT NULL THEN ' ' ELSE '' END, COALESCE(cd.last_name, '')) AS Name`,
      "cd.phone_code",
      "cd.phone_number",
      "cd.user_id AS client_id",
      "cd.email_id",
      "cd.sub_user_status AS user_status",
      "pm.program_name",
      "ps.program_duration as program_day",
      "DATEDIFF(sop.expiry_date,NOW()) as validity_pending",
      "sop.sent_sessions AS current_session",
      "sop.pending_session AS pending_session",
      "ad.official_phone AS mentor_wa",
      "ad.crm_user AS mentor_name",
    ],
    table: `${tables.userDetails} cd`,
    joins: [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "pm.program_id = sop.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "ps.program_session_id = sop.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "cd.user_id = dsl.user_id AND sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = '4'",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
    ],
    conditions: [
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
      { field: "sop.program_type", operator: "=", value: 0 },
      {
        raw: true,
        field: "DATEDIFF(sop.expiry_date,NOW()) > 0",
        operator: "",
        value: "",
      },
    ],
  });

  for (const user of users) {
    await sendDormantWatiMessage(user);
  }
}

async function dietOverDue() {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });
    let count = 0;
    for (const admin of admins) {
      if (count === 2) break;
      const { results: users } = await readRecord({
        selectFields: ["DISTINCT ud.user_id"],
        table: `${tables.userDetails} ud`,
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.weightRecords} wr`,
            on: "wr.sub_order_id = ud.active_order_id AND sop.sent_sessions = wr.session",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions + 1",
          },
        ],
        conditions: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.pending_session",
            operator: "<>",
            value: "sop.sent_sessions",
            raw: true,
          },
          {
            field: "wr.session",
            operator: "=",
            value: "sop.sent_sessions",
            raw: true,
          },
          {
            field: "wr.posted_date",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "wr.days",
            operator: "=",
            value: 10,
            raw: true,
          },
          {
            orConditions: [
              {
                field: "dsl.session",
                operator: "IS",
                value: null,
                raw: true,
              },
              {
                field: "dsl.diet_status",
                operator: "<>",
                value: 4,
              },
            ],
          },
        ],
      });
      if (users.length === 0) {
        console.log("No users found for ", admin.first_name);
        continue;
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
        });
        return mappedData;
      });
      const mailData = {
        from: "support@balancenutrition.in",
        to: admin.email_id,
        to: "ayush.dubey@balancenutrition.in",
        subject: `WMR Received Diet Not Sent - ${admin.crm_user}`,
        html: generateHorizontalUserTable(finalData),
        cc: [],
        bcc: [],
      };
      const { pv } = safeJSONParse(admin.active);
      if (pv.cc) {
        mailData.cc = pv.cc;
        console.log(pv.cc, 3069);
      }
      if (pv.bcc) {
        mailData.bcc = pv.bcc;
        console.log(pv.bcc, 3071);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      console.log(mailData, admin.admin_user_id);
      sendMailUtil({
        from: mailData.from,
        to: "jitendra.desai@balancenutrition.in",
        subject: mailData.subject,
        html: mailData.html,
        // cc: mailData.cc,
        // bcc: mailData.bcc,
      });
      count++;
    }
  } catch (error) {
    console.log("Error in program page visit", error);
  }
}

async function sendAlcoholMenuNotReceivedNotifications() {
  try {
    const { results: users } = await readRecord({
      table: `${tables.userRestaurantMenu} urm`,
      selectFields: ["*"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = urm.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.userAlcoholMenu} uam`,
          on: "uam.user_id = urm.user_id AND uam.added_date < NOW() - INTERVAL 1 HOUR",
        },
      ],
      conditions: [
        {
          field: "urm.added_date",
          operator: "<",
          value: "NOW() - INTERVAL 1 HOUR",
        },
        {
          field: "uam.alcohol_menu_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });
    if (users.length === 0) {
      console.log("No users found for alcohol menu not received notifications");
      return;
    }
    const user_ids = users.map(async (user) => user.user_id);
    if (user_ids.length > 0) {
      const sendNotification = await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in sending menu not received notifications", error);
  }
}

async function sendRestaurantMenuNotReceivedNotifications() {
  try {
    const { results: users } = await readRecord({
      table: `${tables.userAlcoholMenu} uam`,
      selectFields: ["*"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = urm.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.userRestaurantMenu} urm`,
          on: "uam.user_id = urm.user_id AND urm.added_date < NOW() - INTERVAL 1 HOUR",
        },
      ],
      conditions: [
        {
          field: "uam.added_date",
          operator: "<",
          value: "NOW() - INTERVAL 1 HOUR",
        },
        { field: "urm.menu_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    if (users.length === 0) {
      console.log(
        "No users found for restaurant menu not received notifications"
      );
      return;
    }
    const user_ids = users.map((user) => user.user_id);
    if (user_ids.length > 0) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
    }
  } catch (error) {
    console.log("Error in sending menu not received notifications", error);
  }
}

// sendLeadMultipleCheckoutWatiNotification();
const sendLeadHSWatiMessage = async (user, templateName, broadcastName) => {
  const fullPhone = `${user?.phone_code?.replace(
    /\D/g,
    ""
  )}${user?.phone_number?.replace(/\D/g, "")}`;

  if (!user.name || !fullPhone) {
    console.warn(`⏭ Skipping user due to missing fields`);
    return;
  }

  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
      {
        template_name: templateName,
        broadcast_name: broadcastName,
        parameters: [{ name: "name", value: user.name }],
      }
    );
    console.log(`✅ WATI sent to (${fullPhone})`);
  } catch (err) {
    console.error(
      `❌ Failed to send WATI to ${user.Name}:`,
      err.response?.data || err.message
    );
  }
};

const sendLeadCheckoutWatiMessage = async (
  user,
  templateName,
  broadcastName
) => {
  const fullPhone = `${user?.phone_code?.replace(
    /\D/g,
    ""
  )}${user?.phone_number?.replace(/\D/g, "")}`;

  if (!user.name || !fullPhone) {
    console.warn(`⏭ Skipping user due to missing fields`);
    return;
  }

  try {
    const response = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
      {
        template_name: templateName,
        broadcast_name: broadcastName,
        parameters: [{ name: "name", value: user.name }],
      }
    );
    console.log(`✅ WATI sent to (${fullPhone})`);
  } catch (err) {
    console.error(
      `❌ Failed to send WATI to ${user.Name}:`,
      err.response?.data || err.message
    );
  }
};
// sendHSWatiNotification();

async function sendHSWatiNotification() {
  try {
    const { results: userDetails } = await readRecord({
      selectFields: [
        "ud.user_id",
        "first_name as name",
        "added_date",
        "phone_number",
        "phone_code",
        "TIMESTAMPDIFF(HOUR,ud.added_date,NOW()) as appLogin",
      ],
      table: `${tables.userDetails} ud`, // Assuming this is the table you are referring to as userDetails
      joins: [
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} bchs`, // Join with bn_client_hs table
          on: "ud.user_id = bchs.user_id",
        },
      ],
      conditions: [
        // Add condition to check if added_date is today
        {
          field: "DATE(ud.added_date)",
          operator: "=",
          value: "CURDATE()", // CURDATE() gives today's date in MySQL
          raw: true,
        },
        // Use NOT IN to filter out users who have entries in bn_client_hs table for the last 21 days
        {
          raw: true,
          field: "",
          operator: "",
          value: `ud.user_id NOT IN (
            SELECT bchs.user_id 
            FROM bn_client_hs bchs 
            WHERE bchs.created >= DATE_SUB(CURDATE(), INTERVAL 21 DAY)
          )`,
        },
      ],
    });

    console.log(userDetails, 111222333444);
    // return false;

    const user_ids = userDetails
      .map((user) => {
        // Get the added_date and current time
        // Only return user IDs where 4 hours have passed since added_date
        if (user.appLogin >= 4) {
          const sendNotification = axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [user.user_id],
              notification_id: 438,
              sent_via: "cron",
            }
          );
          return user; // Only add the user to the notification list if 4 hours have passed
        }

        return null; // If 4 hours haven't passed, return null
      })
      .filter((user_id) => user_id !== null); // Remove null values from the list

    if (user_ids.length > 0) {
      for (const userData of user_ids) {
        console.log(userData);
        await sendLeadHSWatiMessage(
          userData,
          "lead_hs_not_taken",
          "lead_hs_not_taken"
        );
      }
    }
  } catch (error) {
    console.log("Error in HS not filled notification", ":", error);
  }
}

async function sendLeadMultipleCheckoutWatiNotification() {
  try {
    const { results: userDetails } = await readRecord({
      selectFields: [
        "ud.user_id",
        "first_name as name",
        "added_date",
        "phone_number",
        "phone_code",
        "TIMESTAMPDIFF(HOUR, ud.added_date, NOW()) as appLogin",
      ],
      table: `${tables.userDetails} ud`,
      conditions: [
        // Check if added_date is today
        {
          field: "DATE(ud.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        // Subquery to check if the user has more than 3 entries for the checkout page with different program_id today
        {
          raw: true,
          field: "",
          operator: "",
          value: `ud.user_id IN (
            SELECT iapvl.user_id
            FROM in_app_page_visit_log iapvl
            WHERE iapvl.page_type = 2
            AND DATE(iapvl.visit_date) = CURDATE()
            GROUP BY iapvl.user_id
            HAVING COUNT(DISTINCT iapvl.program_id) > 3
          )`,
        },
      ],
    });

    // return false;

    const user_ids = userDetails
      .map((user) => {
        // Get the added_date and current time
        // Only return user IDs where 4 hours have passed since added_date
        // if (user.appLogin >= 4) {
        return user; // Only add the user to the notification list if 4 hours have passed
        // }

        // return null;
        // If 4 hours haven't passed, return null
      })
      .filter((user_id) => user_id !== null); // Remove null values from the list

    if (user_ids.length > 0) {
      for (const userData of user_ids) {
        console.log(userData);
        await sendLeadCheckoutWatiMessage(
          userData,
          "lead_multiple_checkout",
          "lead_multiple_checkout"
        );
      }
    }
  } catch (error) {
    console.log("Error in HS not filled notification", ":", error);
  }
}

// sendPerformanceSummary();

const restaurantGuideNotificationIds = [438, 439, 440, 441, 442];
const alcoholGuideNotificationIds = [443, 444, 445, 446, 447];
const restoFeedbackIDs = [448, 449, 450, 451];
const alcoholFeedbackIDs = [452, 453, 454];

function getRoundRobinIndex() {
  const now = new Date();
  // const testDate = new Date("2025-07-27");
  const weekNumber = getweekNumber(now);
  const day = now.getDay();
  // const weekNumber = getweekNumber(testDate);

  if (![5, 6, 0].includes(day)) return null;
  const validDays = [5, 6, 0];
  const dayIndex = validDays.indexOf(day);
  // console.log("Now:", testDate.toISOString());
  console.log("Day:", day);
  console.log("Week Number:", weekNumber);
  console.log("Day Index:", dayIndex);

  const totalIndex =
    (weekNumber * 3 + dayIndex) % restaurantGuideNotificationIds.length;
  console.log("Total Index:", totalIndex);
  return totalIndex;
}

function getweekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

async function sendRestaurantGuideNotification() {
  const index = getRoundRobinIndex();
  if (index === null) return;

  const notification_id = restaurantGuideNotificationIds[index];
  console.log(notification_id);

  try {
    const { results: users } = await readRecord({
      selectFields: ["user_id"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
      ],
    });


    const {results:filteredLeads} = await readRecord({
      selectFields: ["user_id"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Lead" },
        // { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestAndroidVersion}','${appVersions.latestIosVersion}')`,
          raw: true,
        },
      ],
    });

    const finalUsers = [...users, ...filteredLeads];
    const user_ids = finalUsers.map((user) => user.user_id);
    // const user_ids = [128492];
    console.log("user_ids", users.length, filteredLeads.length, user_ids);
    if (user_ids.length > 0) {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );
      console.log(
        `Sent restaurant guide notification ${notification_id} to ${user_ids.length} users`
      );
    }
  } catch (error) {
    console.log("Error sending restaurant guide notification", error);
  }
}

async function sendAlcoholGuideNotification() {
  const index = getRoundRobinIndex();
  if (index === null) return;

  const notification_id = alcoholGuideNotificationIds[index];
  console.log("Notification ID:", notification_id);

  try {
    const { results: users } = await readRecord({
      table: `${tables.assessment_nutrition_and_lifestyle} anl`,
      selectFields: ["anl.user_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "anl.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        { field: "anl.alcohol_consumption", operator: "IS NOT", value: null },
        {
          field: "anl.alcohol_consumption",
          operator: "NOT IN",
          value: ["", "Never"],
        },
      ],
    });

    const {results:filteredLeads} = await readRecord({
      selectFields: ["ud.user_id"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Lead" },
        // { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        { field: "hs.alcohol_frequency", operator: "IN", value: ['7', '4'] },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestAndroidVersion}','${appVersions.latestIosVersion}')`,
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs`,
          on: "hs.user_id = ud.user_id",
        },
      ],
    });

    const finalUsers = [...users, ...filteredLeads];
    const user_ids = finalUsers.map((user) => user.user_id);
    // const user_ids = [128492];
    console.log("User IDs:", user_ids.length, users.length, filteredLeads.length);

    if (user_ids.length > 0) {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id,
          sent_via: "cron",
        }
      );

      console.log(
        `Sent alcohol guide notification ${notification_id} to ${user_ids.length} users`
      );
    }
  } catch (error) {
    console.log("Error sending alcohol guide notification", error);
  }
}

async function sendRestaurantFeedbackReminder() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  if (day !== 1 || hour !== 9) {
    console.log("Not Monday 9 AM, skipping feedback reminder.");
    return;
  }

  const saturday = new Date(now);
  saturday.setDate(now.getDate() - 2);
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - 1);

  const saturdayStr = saturday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);

  const feedbackNotificationId =
    restoFeedbackIDs[getweekNumber(now) % restoFeedbackIDs.length];
  console.log(
    "Using Restaurant Feedback Notification ID:",
    feedbackNotificationId
  );
  console.log("Weekend Range:", saturdayStr, "to", sundayStr);

  try {
    const { results: usersWithNoWeekendLog } = await readRecord({
      selectFields: ["ud.user_id"],
      table: `${tables.userDetails} ud`,
      joins: [],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
      ],
      exclude: {
        table: `${tables.userRestaurantMenu}`,
        field: "user_id",
        isDistinct: true,
        subConditions: [
          {
            field: "DATE(added_date)",
            operator: ">=",
            value: saturdayStr,
            // isRaw: true,
          },
          {
            field: "DATE(added_date)",
            operator: "<=",
            value: sundayStr,
            // isRaw: true,
          },
        ],
      },
    });

    const {results:filteredLeads} = await readRecord({
      selectFields: ["user_id"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Lead" },
        // { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestAndroidVersion}','${appVersions.latestIosVersion}')`,
          raw: true,
        },
      ],
      exclude: {
        table: `${tables.userRestaurantMenu}`,
        field: "user_id",
        isDistinct: true,
        subConditions: [
          {
            field: "DATE(added_date)",
            operator: ">=",
            value: saturdayStr,
            // isRaw: true,
          },
          {
            field: "DATE(added_date)",
            operator: "<=",
            value: sundayStr,
            // isRaw: true,
          },
        ],
      },
    });

    const finalUsers = [...usersWithNoWeekendLog, ...filteredLeads];
    const user_ids = finalUsers.map((user) => user.user_id);
    // const user_ids = [128492]; // For testing purposes, replace with actual user IDs
    console.log("User IDs to notify:", user_ids.length, usersWithNoWeekendLog.length, filteredLeads.length);
    if (user_ids.length > 0) {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: feedbackNotificationId,
          sent_via: "cron",
        }
      );

      console.log(
        `Sent feedback reminder (ID ${feedbackNotificationId}) to ${user_ids.length} users.`
      );
    } else {
      console.log("No users missing restaurant logs for the weekend.");
    }
  } catch (err) {
    console.error("Error sending feedback reminder:", err);
  }
}

async function sendPerformanceSummary() {
  try {
    const isMonday = new Date().getDay() === 1; // Sunday=0, Monday=1
    const interval = isMonday ? 2 : 1;

    // --- Query Builders ------------------------------------------------------

    // Generic guide/form query (Alcohol/Restaurant style)
    const getQuery = (table, dateField) => ({
      selectFields: [
        `COUNT(DISTINCT CASE WHEN ${dateField} >= NOW() - INTERVAL ${interval} DAY THEN user_id END) AS accessed`,
        `COUNT(*) AS total_filled`,
        `SUM(CASE WHEN ${dateField} >= NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS filled_last_24h`,
      ],
      table,
      conditions: [
        {
          field: "user_id",
          operator: "NOT IN",
          value: `(SELECT user_id FROM users_details WHERE mentor_assigned = 196)`,
          raw: true,
        },
      ],
    });

    // Feedback (no 'accessed' concept)
    const getFeedbackQuery = () => ({
      selectFields: [
        `COUNT(*) AS total_filled`,
        `SUM(CASE WHEN created_at >= NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS filled_last_24h`,
      ],
      table: "diet_feedback",
      conditions: [
        {
          field: "user_id",
          operator: "NOT IN",
          value: `(SELECT user_id FROM users_details WHERE mentor_assigned = 196)`,
          raw: true,
        },
      ],
    });

    // Diet PDF (compute both 24h & 48h; show 48h only on Monday)
    const getDietPdfQuery = () => ({
      selectFields: [
        `SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS total_downloads`,
        `SUM(CASE WHEN type = 'download' AND downloaded_at >= NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS downloads_last_24h`,
        `SUM(CASE WHEN type = 'download' AND downloaded_at >= NOW() - INTERVAL 2 DAY THEN 1 ELSE 0 END) AS downloads_last_48h`,
        `SUM(CASE WHEN type = 'share' THEN 1 ELSE 0 END) AS total_shares`,
        `SUM(CASE WHEN type = 'share' AND downloaded_at >= NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS shares_last_24h`,
        `SUM(CASE WHEN type = 'share' AND downloaded_at >= NOW() - INTERVAL 2 DAY THEN 1 ELSE 0 END) AS shares_last_48h`,
      ],
      table: "diet_pdf_download_log",
      conditions: [
        {
          field: "user_id",
          operator: "NOT IN",
          value: `(SELECT user_id FROM users_details WHERE mentor_assigned = 196)`,
          raw: true,
        },
      ],
    });

    // Quick Filler (compute today, 24h, 48h, overall; show 48h only on Monday)
    const getQuickFillerQuery = () => ({
      selectFields: [
        `COUNT(DISTINCT CASE WHEN DATE(created_at) = CURDATE() THEN user_id END) AS free_filler_users_data_today`,
        `COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL 1 DAY THEN user_id END) AS free_filler_users_data_last_24h`,
        `COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL 2 DAY THEN user_id END) AS free_filler_users_data_last_48h`,
        `COUNT(DISTINCT user_id) AS overall_count`,
      ],
      table: "free_filler_users_data",
      conditions: [
        {
          field: "user_id",
          operator: "NOT IN",
          value: `(SELECT user_id FROM users_details WHERE mentor_assigned = 196)`,
          raw: true,
        },
      ],
    });

    // --- Fetch in Parallel ---------------------------------------------------

    const [alcohol, restaurant, feedback, dietPdf, quickFiller] =
      await Promise.all([
        readRecord(getQuery("user_alcohol_menu", "added_date")),
        readRecord(getQuery("user_restaurant_menu", "added_date")),
        readRecord(getFeedbackQuery()),
        readRecord(getDietPdfQuery()),
        readRecord(getQuickFillerQuery()),
      ]);

    // --- Safe Extraction / Defaults -----------------------------------------

    const alcoholData = alcohol?.results?.[0] || {
      accessed: 0,
      total_filled: 0,
      filled_last_24h: 0,
    };

    const restaurantData = restaurant?.results?.[0] || {
      accessed: 0,
      total_filled: 0,
      filled_last_24h: 0,
    };

    const feedbackData = feedback?.results?.[0] || {
      total_filled: 0,
      filled_last_24h: 0,
    };

    const dietPdfData = dietPdf?.results?.[0] || {
      total_downloads: 0,
      downloads_last_24h: 0,
      downloads_last_48h: 0,
      total_shares: 0,
      shares_last_24h: 0,
      shares_last_48h: 0,
    };

    const quickFillerData = quickFiller?.results?.[0] || {
      free_filler_users_data_today: 0,
      free_filler_users_data_last_24h: 0,
      free_filler_users_data_last_48h: 0,
      overall_count: 0,
    };

    // --- Build HTML ----------------------------------------------------------

    const html = `
      <p>Hello Ma'am,</p>
      <p>Here is the performance summary for the <b>Guide & Forms</b>:</p>

      <b style="color:#800080;">Alcohol Guide</b><br>
      ${
        isMonday
          ? `• Accessed by ${alcoholData.accessed} users (last 48hrs)<br>`
          : ""
      }
      • Total Clients Filled: ${alcoholData.total_filled}<br>
      • Filled in Last 24 Hours: ${alcoholData.filled_last_24h}<br><br>

      <b>Restaurant Guide</b><br>
      ${
        isMonday
          ? `• Accessed by ${restaurantData.accessed} users (last 48hrs)<br>`
          : ""
      }
      • Total Clients Filled: ${restaurantData.total_filled}<br>
      • Filled in Last 24 Hours: ${restaurantData.filled_last_24h}<br><br>

      <b>Quick Filler</b><br>
      • Distinct Users Today: ${
        quickFillerData.free_filler_users_data_today
      }<br>
      • Distinct Users (last 24hrs): ${
        quickFillerData.free_filler_users_data_last_24h
      }<br>
      ${
        isMonday
          ? `• Distinct Users (last 48hrs): ${quickFillerData.free_filler_users_data_last_48h}<br>`
          : ""
      }
      • Overall Distinct Users: ${quickFillerData.overall_count}<br><br>

      <b>Feedback Form</b><br>
      • Total Clients Filled: ${feedbackData.total_filled}<br>
      • Filled in Last 24 Hours: ${feedbackData.filled_last_24h}<br><br>

      <b>Diet PDF</b><br>
      • Total Downloads: ${dietPdfData.total_downloads}<br>
      ${
        isMonday
          ? `• Downloads in Last 48 Hours: ${dietPdfData.downloads_last_48h}<br>`
          : ""
      }
      • Downloads in Last 24 Hours: ${dietPdfData.downloads_last_24h}<br>
      • Total Shares: ${dietPdfData.total_shares}<br>
      ${
        isMonday
          ? `• Shares in Last 48 Hours: ${dietPdfData.shares_last_48h}<br>`
          : ""
      }
      • Shares in Last 24 Hours: ${dietPdfData.shares_last_24h}<br>
    `;

    // --- Mail Metadata -------------------------------------------------------

    const subjectDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }); // e.g., "27 Aug 2025"

    const mailData = {
      from: "Pravin Singh <pravin.singh@balancenutrition.in>",
      to: "pravin.singh@balancenutrition.in",
      subject: `Guide & Feedback Forms Performance Summary - ${subjectDate}`,
      html,
      // cc: ["vishalrupani@balancenutrition.in","vikram.gupta@balancenutrition.in","vaibhav.gonjari@balancenutrition.in","suraj.tiwari@balancenutrition.in"],
      bcc: ["testerteam@balancenutrition.in"],
    };

    // --- Send ----------------------------------------------------------------

    await sendMailUtil(mailData);
    console.log("Performance summary sent successfully.");
  } catch (err) {
    console.error("Error sending performance summary:", err);
  }
}

async function sendAlcoholFeedbackReminder() {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  if (now.getDay() !== 1 || hour !== 0 || minutes !== 45) {
    console.log("Not Monday. Skipping alcohol feedback reminder.");
    return null;
  }
  const saturday = new Date(now);
  saturday.setDate(now.getDate() - 2);
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - 1);

  const saturdayStr = saturday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);

  const feedbackNotificationId =
    alcoholFeedbackIDs[getweekNumber(now) % alcoholFeedbackIDs.length];
  console.log(
    "Using Alcohol Feedback Notification ID:",
    feedbackNotificationId
  );
  console.log("Weekend Range:", saturdayStr, "to", sundayStr);
  // const userToTest = 128492;
  const sql = `
  SELECT anl.user_id
  FROM assessment_nutrition_and_lifestyle anl
  INNER JOIN users_details ud ON anl.user_id = ud.user_id
  WHERE
    ud.user_status = 'Active'
    AND ud.sub_user_status = 'Active'
    AND anl.alcohol_consumption IS NOT NULL
    AND anl.alcohol_consumption NOT IN ('', 'Never')
    AND anl.user_id NOT IN (
      SELECT DISTINCT user_id
      FROM user_alcohol_menu
      WHERE DATE(added_date) BETWEEN ? AND ?
    );
`;

  // anl.user_id = ? // For testing purposes, replace with actual user ID to test
  const values = [saturdayStr, sundayStr];

  try {

    const {results:filteredLeads} = await readRecord({
      selectFields: ["ud.user_id"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Lead" },
        // { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        { field: "hs.alcohol_frequency", operator: "IN", value: ['7', '4'] },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestAndroidVersion}','${appVersions.latestIosVersion}')`,
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs`,
          on: "hs.user_id = ud.user_id",
        },
      ],
    });


    const [rows] = await readPool.query(sql, values);
    console.log("Raw query user count:", rows.length);

    const finalRows = [...rows, ...filteredLeads]; 
    if (finalRows.length > 0) {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: finalRows.map((row) => row.user_id),
          notification_id: feedbackNotificationId,
          sent_via: "cron",
        }
      );
      console.log(
        `Sent alcohol feedback reminder (ID ${feedbackNotificationId}) to ${finalRows.length} users.`
      );
    } else {
      console.log("No users missing alcohol logs for the weekend.");
    }
  } catch (err) {
    console.error("Error sending alcohol feedback reminder:", err);
  }
}

async function sendDietPdfNotification() {
  try {
    const { results: dietSentDetails } = await readRecord({
      selectFields: [
        "ud.first_name",
        "ud.mentor_assigned",
        "ad.crm_user as mentor_name",
        "dsl.diet_start_date_set_by",
        "dsl.user_id",
        "dsl.session",
        "dsl.sub_order_id",
        "dsl.diet_details_id",
      ],
      table: `${tables.dietSessionLog} dsl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "dsl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "dsl.diet_status", operator: "=", value: "4" },
        {
          field: "DATE(dsl.diet_sent_date)",
          operator: "=",
          value: "DATE(CURDATE() - INTERVAL 1 DAY)",
          raw: true,
        },
      ],
    });

    console.log(dietSentDetails, 11112222);

    dietSentDetails.forEach((user) => {
      console.log(user, 333111);
      let chat = "";

      if (user.session == "1") {
        // const { results: callDetails } = await readRecord({
        //   selectFields: ["*"],
        //   table: `${tables.callUpdates}`,
        //   conditions: [
        //     { field: "user_id", operator: "=", value: user.user_id },
        //     { field: "call_type", operator: "=", value: "0"},
        //     { field: "sub_order_id", operator: "=", value: user.sub_order_id},
        //   ],
        // });

        chat = `
        <p>Hi ${user.first_name},</p>
        <p>I hope you have seen the diet session 1 that I sent you yesterday.</p>
        <p>Given it is the 1st session, I have planned it as close to your current recall as possible.</p>
        <p>This will enable you to settle in very nicely.</p>
        <p>Please check special mentions in the brackets like (Twice this session) & follow them very well. </p>
        <p>In the chart, the symbol '/' means instead of.</p>
        <p>e.g. Roti/Rice - you can eat roti or rice - any one of the items.</p>
        <p>The PDF Version of the Diet session is also available. Please <strong><a href="https://balancenutrition.in/download-diet?user_id=${user.user_id}&order_id=${user.sub_order_id}&diet_details_id=${user.diet_details_id}">click here</a></strong> to download it.</p>
      `;

        // if(callDetails.length == 0){
        //   chat +=`I also want to connect with you over a call to explain the diet, weight tracking, recipe links & also resolve any queries you may have regarding the diet. Please schedule a call with me at your earliest convenience. <strong><a href="https://www.balancenutrition.in/app_link/screen_id=12">Click here.</a></strong>`;
        // }else if(callDetails[0].call_status == '0'){
        //   chat +=`I will connect with you shortly over our scheduled call on ${moment(callDetails[0].call_date).format("Do MMM YYYY")} to explain the diet session, weight tracking, recipe links & also resolve any queries you may have regarding the diet. Be ready with your questions :)`;
        // }else if (callDetails[0].call_status == '1'){
        //   chat +=`I have explained to you in detail about the diet session, weight tracking, the BN Ekit & also the recipe section. Wishing you all the best. Please stay in touch with me & update your meal images regularly.`;
        // }

        if (user.diet_start_date_set_by === "Default") {
          chat += `<strong>P.S.</strong> Don't forget to update the date you will start the session on: <strong><a href="https://www.balancenutrition.in/app_link/screen_id=12">Click here</a></strong> :) `;
        }
      } else {
        chat = `
        <p>Hi ${user.first_name},</p>
        <p>Hope you have gone through the diet session sent yesterday & it looks good to you.</p>
        <p>Don't deviate from the options; please read the <strong>special instructions</strong>, like (TWICE A SESSION), under the options as well.</p>
        <p>The PDF Version of the Diet session is also available. Please <strong><a href="https://balancenutrition.in/download-diet?user_id=${user.user_id}&order_id=${user.sub_order_id}&diet_details_id=${user.diet_details_id}">click here</a></strong> to download it.</p>
      `;
        if (user.diet_start_date_set_by === "Default") {
          chat += `While I answer your queries, if any, in a while, please update the DATE you will be starting this session. <strong><a href="https://www.balancenutrition.in/app_link/screen_id=12">Click here</a></strong> to set the date.`;
        }
        chat += `<p><strong>P.S.</strong>Stay regular, stay focused & send me your meal images as many times as possible in the chat. I will be happy to answer them. </p>`;
      }

      clientEnquiry.create({
        mentor_id: user.mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: chat,
        user_id: user.user_id,
        name: user.mentor_name,
      });
    });

    // const user_ids = dietSentDetails.map((user) => user.user_id);
    // console.log("user_ids", user_ids.length);

    // if (user_ids.length > 0) {
    //   await axios.post(
    //     `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
    //     {
    //       user_ids,
    //       notification_id:97,
    //       sent_via: "cron",
    //     }
    //   );
    //   console.log(
    //     `Sent diet notification ${notification_id} to ${user_ids.length} users`
    //   );
    // }
  } catch (error) {
    console.log("Error sending restaurant guide notification", error);
  }
}

async function sendDietPdfInChat() {
  try {
    // Query to fetch diets sent today and where notification hasn't been sent yet
    const query = `
      SELECT * FROM diet_session_log
      WHERE diet_status = 4  -- Sent to client
      AND pdf_notification_sent = 0  -- Notification not yet sent
      AND DATE(diet_sent_date) = CURDATE();  -- Check if the diet was sent today
    `;

    const { results: dietSentDetails } = await readRecord({
      selectFields: [
        "dsl.diet_id",
        "dsl.diet_pdf",
        "dsl.diet_sent_by",
        "dsl.user_id",
        "ud.first_name",
        "au.crm_user as mentor_name",
      ],
      table: `${tables.dietSessionLog} dsl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "dsl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "ud.mentor_assigned = au.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "dsl.diet_status",
          operator: "=",
          value: "4",
          raw: true,
        },
        {
          field: "dsl.pdf_notification_sent",
          operator: "=",
          value: "0",
          raw: true,
        },
        {
          field: "DATE(dsl.diet_sent_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });

    // Loop through each diet sent and send a notification if 30 minutes have passed
    dietSentDetails.forEach(async (user) => {
      // Convert UTC time to IST

      if (user.diet_pdf) {
        const sendNotification = await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id: "561",
            sent_via: "cron",
          }
        );
        // After sending the notification, update the flag to 1
        const updateQuery = `
            UPDATE diet_session_log
            SET pdf_notification_sent = 1
            WHERE diet_id = ?;
          `;
        const updateProgramStatus = updateRecord(
          tables.dietSessionLog,
          { pdf_notification_sent: "1" },
          { diet_id: user.diet_id }
        );
        // Update pdf_notification_sent to 1 for the current diet session

        clientEnquiry.create({
          mentor_id: user.diet_sent_by,
          type: "broadcast",
          sender: "mentor",
          query: "Please find the Diet PDF attached",
          attachment: [user.diet_pdf],
          user_id: user.user_id,
          name: user.mentor_name,
        });
      }

      //     user_id,
      // name,
      // mentor_id,
      // query,
      // is_response,
      // sender,
      // ...(files && { attachment: urls.map((item) => item.file.path) }),
      // type: type ? type : messageType,
    });
  } catch (error) {
    console.log("Error in cron job to send diet notifications", error);
  }
}

const notifyEndingTravelOnholdBreaks = async (req, res, next) => {
  try {
    const today = moment().startOf("day");

    // Notification IDs by days remaining
    const NOTI_BY_DIFF = { 3: 575, 2: 576, 1: 577 };

    // Query only the relevant window: end_date in [D+1 .. D+3]
    const rangeStart = today
      .clone()
      .add(1, "days")
      .startOf("day")
      .format("YYYY-MM-DD");
    const rangeEnd = today
      .clone()
      .add(3, "days")
      .endOf("day")
      .format("YYYY-MM-DD");

    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id", "ohc.end_date", "ohc.days"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: ">=", value: rangeStart },
        { field: "ohc.end_date", operator: "<=", value: rangeEnd },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.onhold_reason", operator: "=", value: "Travel" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    // Collect user IDs per notification
    const batches = { 575: new Set(), 576: new Set(), 577: new Set() };

    for (const br of breaks || []) {
      const endDateStartOfDay = moment(br.end_date).startOf("day");
      const diffDays = endDateStartOfDay.diff(today, "days"); // 1, 2, or 3
      if (!(diffDays in NOTI_BY_DIFF)) continue;

      const breakDays = Number(br.days) || 0;
      if (diffDays === 3 && breakDays < 10) continue; // skip 3-day ping for short breaks

      const notiId = NOTI_BY_DIFF[diffDays];
      batches[notiId].add(br.user_id);
    }

    // Send notifications (chunked)
    const url = `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`;
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    for (const [notiIdStr, userSet] of Object.entries(batches)) {
      const userIds = Array.from(userSet);
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        await axios.post(url, {
          user_ids: slice,
          notification_id: Number(notiIdStr),
          sent_via: "cron",
        });
        // console.log(`Sent notification ${notiIdStr} to ${slice.length} users`);
      }
      console.log(`Sent notification ${notiIdStr} to ${userIds} users`);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notifications sent successfully`,
    });
    return res.status(200).send(apiResponse);
  } catch (error) {
    console.error(error);
  }
};
const notifyEndingHealthIssuesOnholdBreaks = async (req, res, next) => {
  try {
    const today = moment().startOf("day");

    // Notification IDs by days remaining
    const NOTI_BY_DIFF = { 3: 669, 2: 670, 1: 671 };

    // Query only the relevant window: end_date in [D+1 .. D+3]
    const rangeStart = today
      .clone()
      .add(1, "days")
      .startOf("day")
      .format("YYYY-MM-DD");
    const rangeEnd = today
      .clone()
      .add(3, "days")
      .endOf("day")
      .format("YYYY-MM-DD");

    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id", "ohc.end_date", "ohc.days"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: ">=", value: rangeStart },
        { field: "ohc.end_date", operator: "<=", value: rangeEnd },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.onhold_reason", operator: "=", value: "Health Issues" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    // Collect user IDs per notification
    const batches = { 669: new Set(), 670: new Set(), 671: new Set() };

    for (const br of breaks || []) {
      const endDateStartOfDay = moment(br.end_date).startOf("day");
      const diffDays = endDateStartOfDay.diff(today, "days"); // 1, 2, or 3
      if (!(diffDays in NOTI_BY_DIFF)) continue;

      const breakDays = Number(br.days) || 0;
      if (diffDays === 3 && breakDays < 10) continue; // skip 3-day ping for short breaks

      const notiId = NOTI_BY_DIFF[diffDays];
      batches[notiId].add(br.user_id);
    }

    // Send notifications (chunked)
    const url = `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`;
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    for (const [notiIdStr, userSet] of Object.entries(batches)) {
      const userIds = Array.from(userSet);
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        await axios.post(url, {
          user_ids: slice,
          notification_id: Number(notiIdStr),
          sent_via: "cron",
        });
        // console.log(`Sent notification ${notiIdStr} to ${slice.length} users`);
      }
      console.log(`Sent notification ${notiIdStr} to ${userIds} users`);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notifications sent successfully`,
    });
    return res.status(200).send(apiResponse);
  } catch (error) {
    console.error(error);
  }
};
const notifyEndingWeddingsOnholdBreaks = async (req, res, next) => {
  try {
    const today = moment().startOf("day");

    // Notification IDs by days remaining
    const NOTI_BY_DIFF = { 3: 672, 2: 673, 1: 674 };

    // Query only the relevant window: end_date in [D+1 .. D+3]
    const rangeStart = today
      .clone()
      .add(1, "days")
      .startOf("day")
      .format("YYYY-MM-DD");
    const rangeEnd = today
      .clone()
      .add(3, "days")
      .endOf("day")
      .format("YYYY-MM-DD");

    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id", "ohc.end_date", "ohc.days"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: ">=", value: rangeStart },
        { field: "ohc.end_date", operator: "<=", value: rangeEnd },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.onhold_reason", operator: "=", value: "Weddings" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    // Collect user IDs per notification
    const batches = { 672: new Set(), 673: new Set(), 674: new Set() };

    for (const br of breaks || []) {
      const endDateStartOfDay = moment(br.end_date).startOf("day");
      const diffDays = endDateStartOfDay.diff(today, "days"); // 1, 2, or 3
      if (!(diffDays in NOTI_BY_DIFF)) continue;

      const breakDays = Number(br.days) || 0;
      if (diffDays === 3 && breakDays < 10) continue; // skip 3-day ping for short breaks

      const notiId = NOTI_BY_DIFF[diffDays];
      batches[notiId].add(br.user_id);
    }

    // Send notifications (chunked)
    const url = `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`;
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    for (const [notiIdStr, userSet] of Object.entries(batches)) {
      const userIds = Array.from(userSet);
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        await axios.post(url, {
          user_ids: slice,
          notification_id: Number(notiIdStr),
          sent_via: "cron",
        });
        // console.log(`Sent notification ${notiIdStr} to ${slice.length} users`);
      }
      console.log(`Sent notification ${notiIdStr} to ${userIds} users`);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notifications sent successfully`,
    });
    return res.status(200).send(apiResponse);
  } catch (error) {
    console.error(error);
  }
};

const sendWeddingsOnholdBreakScheduledNotifications = async (
  req,
  res,
  next
) => {
  try {
    const today = moment().startOf("day");
    const currentTime = moment(); // Get the current time

    // Notification IDs and their corresponding times
    const notifications = [
      { id: 699, time: today.clone().add(10, "hours") }, // 10 AM
      { id: 696, time: today.clone().add(14, "hours") }, // 2 PM
      { id: 697, time: today.clone().add(16, "hours") }, // 4 PM
      { id: 698, time: today.clone().add(22, "hours") }, // 10 PM
    ];

    // Loop through the notifications and check which one matches the current time
    const nextNotification = notifications.find((noti) =>
      currentTime.isBefore(noti.time)
    );

    if (!nextNotification) {
      // If no notifications are left for today, return
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No notifications scheduled for today.",
      });

      // Check if `res` is available before calling `res.status()`
      if (res) {
        return res.status(200).send(apiResponse);
      } else {
        console.log("No response object available");
        return;
      }
    }

    // Query the database to get all onhold clients with "Weddings" as the reason
    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id", "ohc.end_date"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.onhold_reason", operator: "=", value: "Weddings" }, // Reason is Weddings
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
      ],
    });

    // Collect user IDs per notification
    const batches = {
      699: new Set(),
      696: new Set(),
      697: new Set(),
      698: new Set(),
    };

    // Loop through all the breaks and assign them to the corresponding notification time
    for (const br of breaks || []) {
      const endDateStartOfDay = moment(br.end_date).startOf("day");
      const notiId = notifications.find((noti) =>
        noti.time.isSame(endDateStartOfDay, "day")
      )?.id;
      if (notiId) {
        batches[notiId].add(br.user_id); // Add user to the appropriate notification batch
      }
    }

    // Send notifications (chunked)
    const url = `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`;
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    // Iterate through each notification ID and send to the user IDs in batches
    for (const [notiIdStr, userSet] of Object.entries(batches)) {
      const userIds = Array.from(userSet);
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        // Handle axios errors with a .catch() to prevent unhandled promise rejections
        await axios
          .post(url, {
            user_ids: slice,
            notification_id: Number(notiIdStr),
            sent_via: "cron",
          })
          .catch((error) => {
            console.error(`Error sending notification ${notiIdStr}: `, error);
          });

        console.log(`Sent notification ${notiIdStr} to ${slice.length} users`);
      }
      console.log(`Sent notification ${notiIdStr} to ${userIds.length} users`);
    }

    // Send response after processing
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notifications sent successfully.`,
    });

    // Check if `res` is available before calling `res.status()`
    if (res) {
      return res.status(200).send(apiResponse);
    } else {
      console.log("No response object available");
      return;
    }
  } catch (error) {
    console.error(error);
    const apiResponse = new ApiResponse({
      statusCode: 500,
      message: "An error occurred while scheduling notifications.",
    });

    // Check if `res` is available before calling `res.status()`
    if (res) {
      return res.status(500).send(apiResponse);
    } else {
      console.log("No response object available");
      return;
    }
  }
};
const sendMedicalIssuesOnholdBreakScheduledNotifications = async (
  req,
  res,
  next
) => {
  try {
    const today = moment().startOf("day");
    const currentTime = moment(); // Get the current time

    // Notification IDs and their corresponding times
    const notifications = [
      { id: 703, time: today.clone().add(10, "hours") }, // 10 AM
      { id: 700, time: today.clone().add(14, "hours") }, // 2 PM
      { id: 701, time: today.clone().add(16, "hours") }, // 4 PM
      { id: 702, time: today.clone().add(22, "hours") }, // 10 PM
    ];

    // Loop through the notifications and check which one matches the current time
    const nextNotification = notifications.find((noti) =>
      currentTime.isBefore(noti.time)
    );

    if (!nextNotification) {
      // If no notifications are left for today, return
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No notifications scheduled for today.",
      });

      // Check if `res` is available before calling `res.status()`
      if (res) {
        return res.status(200).send(apiResponse);
      } else {
        console.log("No response object available");
        return;
      }
    }

    // Query the database to get all onhold clients with "Weddings" as the reason
    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id", "ohc.end_date"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.onhold_reason", operator: "=", value: "Health Issues" }, // Reason is Weddings
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
      ],
    });

    // Collect user IDs per notification
    const batches = {
      703: new Set(),
      700: new Set(),
      701: new Set(),
      702: new Set(),
    };

    // Loop through all the breaks and assign them to the corresponding notification time
    for (const br of breaks || []) {
      const endDateStartOfDay = moment(br.end_date).startOf("day");
      const notiId = notifications.find((noti) =>
        noti.time.isSame(endDateStartOfDay, "day")
      )?.id;
      if (notiId) {
        batches[notiId].add(br.user_id); // Add user to the appropriate notification batch
      }
    }

    // Send notifications (chunked)
    const url = `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`;
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    // Iterate through each notification ID and send to the user IDs in batches
    for (const [notiIdStr, userSet] of Object.entries(batches)) {
      const userIds = Array.from(userSet);
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        // Handle axios errors with a .catch() to prevent unhandled promise rejections
        await axios
          .post(url, {
            user_ids: slice,
            notification_id: Number(notiIdStr),
            sent_via: "cron",
          })
          .catch((error) => {
            console.error(`Error sending notification ${notiIdStr}: `, error);
          });

        console.log(`Sent notification ${notiIdStr} to ${slice.length} users`);
      }
      console.log(`Sent notification ${notiIdStr} to ${userIds.length} users`);
    }

    // Send response after processing
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notifications sent successfully.`,
    });

    // Check if `res` is available before calling `res.status()`
    if (res) {
      return res.status(200).send(apiResponse);
    } else {
      console.log("No response object available");
      return;
    }
  } catch (error) {
    console.error(error);
    const apiResponse = new ApiResponse({
      statusCode: 500,
      message: "An error occurred while scheduling notifications.",
    });

    // Check if `res` is available before calling `res.status()`
    if (res) {
      return res.status(500).send(apiResponse);
    } else {
      console.log("No response object available");
      return;
    }
  }
};

const activateTravelGuidesForRecentOnholdClients = async (req, res, next) => {
  try {
    const now = moment();
    const fortyMinsAgo = now
      .clone()
      .subtract(40, "minutes")
      .format("YYYY-MM-DD HH:mm:ss");

    const { results: recentOnholds } = await readRecord({
      selectFields: ["ohc.user_id"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.created_at", operator: ">=", value: fortyMinsAgo },
        { field: "ohc.onhold_reason", operator: "=", value: "Travel" },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },

        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!recentOnholds?.length) {
      console.log(
        "No recent travel onhold clients found in the last 40 minutes."
      );
      if (res)
        return res.status(200).send(
          new ApiResponse({
            statusCode: 200,
            message: "No recent travel onhold clients found.",
          })
        );
      return;
    }

    console.log(`Found ${recentOnholds.length} recent travel onhold clients`);

    for (const { user_id } of recentOnholds) {
      const { results: userDetailsResults } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
        selectFields: ["ud.guides"],
      });

      let userGuides = userDetailsResults?.[0]?.guides || "[]";
      try {
        userGuides = JSON.parse(userGuides);
      } catch {
        userGuides = [];
      }

      const guideIdsToActivate = ["43"];
      const missingGuides = guideIdsToActivate.filter(
        (gid) => !userGuides.includes(gid)
      );

      if (missingGuides.length === 0) {
        console.log(`User ${user_id}: already has guides 43 — skipping.`);
        continue;
      }

      userGuides.push(...missingGuides);

      await updateRecord(
        `${tables.userDetails}`,
        { guides: JSON.stringify(userGuides) },
        { user_id }
      );

      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: 664,
          sent_via: "cron",
          extraVariables: {
            guide: { guide_id: missingGuides.join(",") },
          },
        }
      );

      console.log(
        `User ${user_id}: activated guides ${missingGuides.join(",")}`
      );
    }

    const message =
      "Guides 43 activated for recent travel onhold clients (if missing).";
    console.log(message);
    if (res)
      return res
        .status(200)
        .send(new ApiResponse({ statusCode: 200, message }));
    return;
  } catch (error) {
    console.error(
      "Error in activateTravelGuidesForRecentOnholdClients:",
      error
    );
    // Don’t use next() in cron jobs
    if (res)
      return res
        .status(500)
        .send(
          new ApiResponse({ statusCode: 500, message: "Internal Server Error" })
        );
  }
};
const activateAirportGuidesForRecentOnholdClients = async (req, res, next) => {
  try {
    const now = moment();
    const fortyMinsAgo = now
      .clone()
      .subtract(60, "minutes")
      .format("YYYY-MM-DD HH:mm:ss");

    const { results: recentOnholds } = await readRecord({
      selectFields: ["ohc.user_id"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.created_at", operator: ">=", value: fortyMinsAgo },
        { field: "ohc.onhold_reason", operator: "=", value: "Travel" },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },

        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!recentOnholds?.length) {
      console.log(
        "No recent travel onhold clients found in the last 40 minutes."
      );
      if (res)
        return res.status(200).send(
          new ApiResponse({
            statusCode: 200,
            message: "No recent travel onhold clients found.",
          })
        );
      return;
    }

    console.log(`Found ${recentOnholds.length} recent travel onhold clients`);

    for (const { user_id } of recentOnholds) {
      const { results: userDetailsResults } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
        selectFields: ["ud.guides"],
      });

      let userGuides = userDetailsResults?.[0]?.guides || "[]";
      try {
        userGuides = JSON.parse(userGuides);
      } catch {
        userGuides = [];
      }

      const guideIdsToActivate = ["13"];
      const missingGuides = guideIdsToActivate.filter(
        (gid) => !userGuides.includes(gid)
      );

      if (missingGuides.length === 0) {
        console.log(`User ${user_id}: already has guides 13 — skipping.`);
        continue;
      }

      userGuides.push(...missingGuides);

      await updateRecord(
        `${tables.userDetails}`,
        { guides: JSON.stringify(userGuides) },
        { user_id }
      );

      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: 682,
          sent_via: "cron",
          extraVariables: {
            guide: { guide_id: missingGuides.join(",") },
          },
        }
      );

      console.log(
        `User ${user_id}: activated guides ${missingGuides.join(",")}`
      );
    }

    const message =
      "Guides 13 activated for recent travel onhold clients (if missing).";
    console.log(message);
    if (res)
      return res
        .status(200)
        .send(new ApiResponse({ statusCode: 200, message }));
    return;
  } catch (error) {
    console.error(
      "Error in activateAirportGuidesForRecentOnholdClients:",
      error
    );
    // Don’t use next() in cron jobs
    if (res)
      return res
        .status(500)
        .send(
          new ApiResponse({ statusCode: 500, message: "Internal Server Error" })
        );
  }
};
const activateWeddingGuidesForRecentOnholdClients = async (req, res, next) => {
  try {
    const now = moment();
    const fortyMinsAgo = now
      .clone()
      .subtract(40, "minutes")
      .format("YYYY-MM-DD HH:mm:ss");

    const { results: recentOnholds } = await readRecord({
      selectFields: ["ohc.user_id"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.created_at", operator: ">=", value: fortyMinsAgo },
        { field: "ohc.onhold_reason", operator: "=", value: "Weddings" },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },

        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!recentOnholds?.length) {
      console.log(
        "No recent travel onhold clients found in the last 40 minutes."
      );
      if (res)
        return res.status(200).send(
          new ApiResponse({
            statusCode: 200,
            message: "No recent travel onhold clients found.",
          })
        );
      return;
    }

    console.log(`Found ${recentOnholds.length} recent travel onhold clients`);

    for (const { user_id } of recentOnholds) {
      const { results: userDetailsResults } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
        selectFields: ["ud.guides"],
      });

      let userGuides = userDetailsResults?.[0]?.guides || "[]";
      try {
        userGuides = JSON.parse(userGuides);
      } catch {
        userGuides = [];
      }

      const guideIdsToActivate = ["73"];
      const missingGuides = guideIdsToActivate.filter(
        (gid) => !userGuides.includes(gid)
      );

      if (missingGuides.length === 0) {
        console.log(`User ${user_id}: already has guides 73 — skipping.`);
        continue;
      }

      userGuides.push(...missingGuides);

      await updateRecord(
        `${tables.userDetails}`,
        { guides: JSON.stringify(userGuides) },
        { user_id }
      );

      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: 681,
          sent_via: "cron",
          extraVariables: {
            guide: { guide_id: missingGuides.join(",") },
          },
        }
      );

      console.log(
        `User ${user_id}: activated guides ${missingGuides.join(",")}`
      );
    }

    const message =
      "Guides activated for recent Weddings onhold clients (if missing).";
    console.log(message);
    if (res)
      return res
        .status(200)
        .send(new ApiResponse({ statusCode: 200, message }));
    return;
  } catch (error) {
    console.error(
      "Error in activateWeddingsGuidesForRecentOnholdClients:",
      error
    );
    // Don’t use next() in cron jobs
    if (res)
      return res
        .status(500)
        .send(
          new ApiResponse({ statusCode: 500, message: "Internal Server Error" })
        );
  }
};

const notifyOnholdResumesToday = async (req, res, next) => {
  try {
    const today = moment().startOf("day").format("YYYY-MM-DD");

    // Notification ID for "resume today"
    var NOTIFICATION_ID = 578;

    // 1. Query users whose onhold break ends today
    const { results: breaks } = await readRecord({
      selectFields: [
        "ohc.user_id",
        "ohc.start_date",
        "ohc.end_date",
        "ohc.days",
        "ud.first_name as name",
        "ud.email_id as email",
        "ud.mentor_assigned",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_email`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        "sop.pending_session",
        "sop.expiry_date",
        "ohc.onhold_reason", // Added this field to handle reasons like Wedding or Health Issues
      ],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: "=", value: today },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
        // Filter by mentor ID (can be dynamic as needed)
      ],
    });

    console.log("Breaks today: ", breaks);

    if (!breaks?.length) {
      console.log("No users resuming today");
      return;
    }

    // 2. Loop through each user and prepare communications
    for (const br of breaks) {
      const {
        user_id,
        start_date,
        end_date,
        days,
        name,
        email,
        mentor_assigned,
        mentor_name,
        mentor_email,
        pending_session,
        expiry_date,
        onhold_reason, // Reason for the onhold (Wedding, Health Issues, Travel, etc.)
      } = br;

      // Format values
      const breakStart = moment(start_date).format("DD MMM YYYY");
      const breakEnd = moment(end_date).format("DD MMM YYYY");
      const validityRemaining = expiry_date
        ? moment(expiry_date).diff(moment(today), "days")
        : days || 0;

      // Define customized messages for each reason
      let mailHtml = "";
      let chatHtml = "";
      console.log(br, "br test");

      // Logic for specific reasons (Wedding, Health Issues, Travel)
      if (onhold_reason === "Weddings") {
        mailHtml = `
          <p>Dear ${name},</p>
          <p>Welcome back! We hope you had a wonderful wedding celebration and are ready to focus on your health again.</p>
          <p>Here’s a quick overview of your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Remaining: ${validityRemaining} days</li>
          </ul>

          <p>To restart smoothly, please update your current weight today. This helps us customize your next plan and schedule your diet session right away.</p>
          <p>You can update your weight directly here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Once updated, your mentor will reach out to you and help you ease into the next phase of your journey.</p>
        `;

        chatHtml = `
          <p>Hi ${name},</p>
          <p>Welcome back! Hope you had an amazing wedding celebration!</p>
          <p>Here’s a quick recap of your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Pending: ${validityRemaining} days</li>
          </ul>
          <p>Before we begin your next phase, please update your current weight here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Once done, we’ll get your new plan ready. Looking forward to helping you get back to your healthy routine!</p>
        `;
      }

      if (onhold_reason === "Health Issues") {
        mailHtml = `
          <p>Dear ${name},</p>
          <p>Welcome back! We hope you’re feeling better and ready to focus on your health again.</p>
          <p>Here’s a quick overview of your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Remaining: ${validityRemaining} days</li>
          </ul>

          <p>To restart smoothly, please update your current weight today. This helps us customize your next plan and schedule your diet session right away.</p>
          <p>You can update your weight directly here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Once updated, your mentor will reach out to you and help you ease into the next phase of your journey.</p>
          <p>Take care, and let’s work together towards full wellness!</p>
        `;

        chatHtml = `
          <p>Hi ${name},</p>
          <p>Welcome back! Hope you’re feeling better and ready to get back to your healthy routine.</p>
          <p>Here’s a quick recap of your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Pending: ${validityRemaining} days</li>
          </ul>
          <p>Before we begin your next phase, please update your current weight here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Looking forward to helping you get back to your healthy routine.</p>
        `;
      }

      if (onhold_reason === "Travel") {
        // Assuming the travel logic is the same as before
        mailHtml = `
          <p>Hi ${name},</p>
          <p>This email confirms the approval of your break during your current program. Please verify these details at your end too.</p>
          <ul>
            <li><b>Break Reason:</b> ${onhold_reason}</li>
            <li><b>Break Duration:</b> ${days} days</li>
            <li><b>Original Program Validity End Date:</b> ${oldEndDateFmt}</li>
            <li><b>New Validity End Date (after extension):</b> ${newEndDateFmt}</li>
          </ul>
          <p>Your break has been approved, and your program validity has now been extended by ${days} days.</p>
          <p>Once you resume, we request that you stay consistent so that you continue progressing towards your health goals without further delays.</p>
          <p><b>P.S.</b> Please watch out for the notifications you receive during your break & update your mentor with your meals regularly.</p>
        `;

        chatHtml = `
          <p>Hi ${name},</p>
          <p>I’m happy to let you know that your break request during the ongoing program has been approved. Please verify these details at your end too:</p>
          <ul style="padding-left: 18px; margin: 0 0 16px;">
            <li><strong>Break Reason:</strong> ${onhold_reason}</li>
            <li><strong>Break Duration:</strong> ${days} days</li>
            <li><strong>Original Program Validity End Date:</strong> ${oldEndDateFmt}</li>
            <li><strong>New Validity End Date (after extension):</strong> ${newEndDateFmt}</li>
          </ul>
          <p>Once your break is over, you will be notified to update your weight and resume the program.</p>
          <p>Have a great time &amp; enjoy yourself! ✨</p>
        `;
      }

      if (onhold_reason == "Pregnancy") {
        NOTIFICATION_ID = process.env?.NODE_ENV === "production" ? 578 : 659;
        mailHtml = `
          <p>Hi ${name},</p>
          <p>A warm welcome back from all of us at Team Balance Nutrition.<br>We hope you and your little one are doing well as you settle into this new chapter.</p>
          <p>Your program, which was on freeze during your pregnancy, is now resuming. <br>
           Here’s a quick overview of your program details:</p>
          <ul>
            <li><b>Break (Freeze) Started:</b> ${breakStart}</li>
            <li><b>Break Ended:</b> ${breakEnd}</li>
            <li><b>Sessions Pending:</b> ${pending_session || 0}</li>
            <li><b>Validtity Remaining:</b> ${validityRemaining}</li>
          </ul>
          <p>To restart smoothly, please update your current (post-pregnancy) weight today. <br>This will allow your mentor to prepare your next plan and schedule your postpartum diet session with care.</p>
          <p>You can update your weight directly here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Once it’s updated, your mentor will connect with you and take you through your next steps gently. <br>We’re looking forward to supporting you through this new phase, one small, steady step at a time.</p> 
          <p>Warm Regards, <br/><b>Team Balance Nutrition</b></p>
        `;

        chatHtml = `
          <p>Hi ${name},</p>
          <p>Welcome back! Hope you and your little one are doing well.</p>
          <p>Here’s a quick overview of your program details:</p>
          <ul> 
            <li><b>Break (Freeze) Started:</b> ${breakStart}</li>
            <li><b>Break Ended:</b> ${breakEnd}</li>
            <li><b>Sessions Pending:</b> ${pending_session || 0}</li>
            <li><b>Validtity Remaining:</b> ${validityRemaining}</li>
          </ul>
          <p>To get started again, please <b>update your current (after-pregnancy) weight</b> in the BN App today.</p>
          <p>This will help your mentor prepare your next diet plan and smoothly restart your sessions.</p>
          <p>We’re so happy to have you back. Let’s begin this new phase with care and balance! </p>
        `;
      }

      // Send Mail
      if (mailHtml) {
        await sendMailUtil({
          from: "support@balancenutrition.in",
          to: email,
          subject:
            onhold_reason === "Pregnancy"
              ? `Your Post-Pregnancy Program Restarts Today`
              : `Your Program Resumes Today. Let’s Begin Again!`,
          html: mailHtml,
          bcc: ["testerteam@balancenutrition.in", mentor_email],
        });

        // Save Chat (HTML message)
        await clientEnquiry.create({
          mentor_id: mentor_assigned || 0,
          type: "broadcast",
          sender: "mentor",
          query: chatHtml,
          user_id,
          name: mentor_name || "",
        });

        // Send Notification
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user_id],
            notification_id: NOTIFICATION_ID,
            sent_via: "cron",
          }
        );
      }
    }

    console.log("Onhold users notified");

    // return res.status(200).send(
    //   new ApiResponse({
    //     statusCode: 200,
    //     message: "Resumption notifications sent",
    //   })
    // );
  } catch (error) {
    console.error("Error in notifyOnholdResumesToday:", error);
    // return res
    //   .status(500)
    //   .send(
    //     new ApiResponse({ statusCode: 500, message: "Internal server error" })
    //   );
  }
};

const notifyOnholdOverdue = async (req, res, next) => {
  try {
    const today = moment().startOf("day").format("YYYY-MM-DD");

    // Pool of random notification IDs
    const NOTIFICATION_POOL = [579, 580, 581];

    // 1. Query users whose onhold break has already ended (overdue)
    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: "<", value: today },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        { field: "ohc.onhold_reason", operator: "=", value: "Travel" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!breaks?.length) {
      return res.status(200).send(
        new ApiResponse({
          statusCode: 200,
          message: "No overdue onhold users",
        })
      );
    }

    // 2. Loop through each overdue user
    for (const br of breaks) {
      const { user_id } = br;

      // Pick a random notification from the pool
      const randomNoti =
        NOTIFICATION_POOL[Math.floor(Math.random() * NOTIFICATION_POOL.length)];

      // Send Notification
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: randomNoti,
          sent_via: "cron",
        }
      );

      console.log(`Sent random notification ${randomNoti} to user ${user_id}`);
    }

    return res.status(200).send(
      new ApiResponse({
        statusCode: 200,
        message: "Overdue notifications sent",
      })
    );
  } catch (error) {
    console.error("Error in notifyOnholdOverdue:", error);
    return res
      .status(500)
      .send(
        new ApiResponse({ statusCode: 500, message: "Internal server error" })
      );
  }
};
const notifyOnholdOverdueHealthIssues = async (req, res, next) => {
  try {
    const today = moment().startOf("day").format("YYYY-MM-DD");

    // Pool of random notification IDs
    const NOTIFICATION_POOL = [675, 676, 677];

    // 1. Query users whose onhold break has already ended (overdue)
    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: "<", value: today },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        { field: "ohc.onhold_reason", operator: "=", value: "Health Issues" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!breaks?.length) {
      return res.status(200).send(
        new ApiResponse({
          statusCode: 200,
          message: "No overdue onhold users",
        })
      );
    }

    // 2. Loop through each overdue user
    for (const br of breaks) {
      const { user_id } = br;

      // Pick a random notification from the pool
      const randomNoti =
        NOTIFICATION_POOL[Math.floor(Math.random() * NOTIFICATION_POOL.length)];

      // Send Notification
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: randomNoti,
          sent_via: "cron",
        }
      );

      console.log(`Sent random notification ${randomNoti} to user ${user_id}`);
    }

    return res.status(200).send(
      new ApiResponse({
        statusCode: 200,
        message: "Overdue notifications sent",
      })
    );
  } catch (error) {
    console.error("Error in notifyOnholdOverdue:", error);
    return res
      .status(500)
      .send(
        new ApiResponse({ statusCode: 500, message: "Internal server error" })
      );
  }
};
const notifyOnholdOverdueWeddings = async (req, res, next) => {
  try {
    const today = moment().startOf("day").format("YYYY-MM-DD");

    // Pool of random notification IDs
    const NOTIFICATION_POOL = [678, 679, 680];

    // 1. Query users whose onhold break has already ended (overdue)
    const { results: breaks } = await readRecord({
      selectFields: ["ohc.user_id"],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: "<", value: today },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        { field: "ohc.onhold_reason", operator: "=", value: "Weddings" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!breaks?.length) {
      return res.status(200).send(
        new ApiResponse({
          statusCode: 200,
          message: "No overdue onhold users",
        })
      );
    }

    // 2. Loop through each overdue user
    for (const br of breaks) {
      const { user_id } = br;

      // Pick a random notification from the pool
      const randomNoti =
        NOTIFICATION_POOL[Math.floor(Math.random() * NOTIFICATION_POOL.length)];

      // Send Notification
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: randomNoti,
          sent_via: "cron",
        }
      );

      console.log(`Sent random notification ${randomNoti} to user ${user_id}`);
    }

    return res.status(200).send(
      new ApiResponse({
        statusCode: 200,
        message: "Overdue notifications sent",
      })
    );
  } catch (error) {
    console.error("Error in notifyOnholdOverdue:", error);
    return res
      .status(500)
      .send(
        new ApiResponse({ statusCode: 500, message: "Internal server error" })
      );
  }
};

const sendOnholdOverdueMail = async () => {
  try {
    const today = moment().startOf("day");
    const cutoffDate = today.clone().subtract(2, "days").format("YYYY-MM-DD"); // 48 hours ago

    // 1. Query users whose break ended 48+ hours ago and still Onhold
    const { results: breaks } = await readRecord({
      selectFields: [
        "ohc.user_id",
        "ohc.start_date",
        "ohc.end_date",
        "ud.first_name as name",
        "ud.email_id as email",
        "sop.pending_session",
        "sop.expiry_date",
        "ohc.onhold_reason", // Reason for break (Travel, Wedding, Health Issues)
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_email`,
      ],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "ohc.end_date", operator: "<=", value: cutoffDate },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
        // Filter by mentor ID (can be dynamic as needed)
      ],
    });

    if (!breaks?.length) {
      console.log("No overdue users for OD mail");
      return;
    }

    // 2. Loop through users and send mail
    for (const br of breaks) {
      const {
        user_id,
        start_date,
        end_date,
        name,
        email,
        mentor_email,
        pending_session,
        expiry_date,
        onhold_reason, // Reason for break (Wedding, Health Issues, Travel)
      } = br;

      const breakStart = moment(start_date).format("DD MMM YYYY");
      const breakEnd = moment(end_date).format("DD MMM YYYY");
      const overdueDays = today.diff(moment(end_date).startOf("day"), "days");
      const validityRemaining = expiry_date
        ? moment(expiry_date).diff(today, "days")
        : 0;

      let mailHtml = "";
      let chatHtml = "";

      // Handle different reasons (Wedding, Health Issues, Travel)
      if (onhold_reason === "Weddings") {
        mailHtml = `
          <p>Hi ${name},</p>
          <p>Your wedding break has ended, but you haven’t restarted yet. Don’t lose valuable days or sessions.</p>
          <p>Here’s a quick update on your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Break Overdue By: ${overdueDays} days</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Remaining: ${
              validityRemaining > 0 ? validityRemaining : 0
            } days</li>
          </ul>
          <p>To resume your program smoothly, please update your current weight today. This will help us customize your next plan, keeping your celebration recovery and current condition in mind.</p>
          <p><a href="https://www.balancenutrition.in/app_link/screen_id=2">Update your weight now using the BN App</a></p>
          <p>The sooner you update, the more time you’ll have to make progress toward your goals, don’t let your validity slip away.</p>
          <p>Wishing you a happy and healthy journey as you get back on track with your wellness goals!</p>
        `;

        chatHtml = `
          <p>Hi ${name},</p>
          <p>Welcome back! Hope you had an amazing wedding celebration!</p>
          <p>Here’s a quick recap of your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Pending: ${validityRemaining} days</li>
          </ul>
          <p>Before we begin your next phase, please update your current weight here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Once done, we’ll get your new plan ready. Looking forward to helping you get back to your healthy routine!</p>
        `;
      }

      if (onhold_reason === "Health Issues") {
        mailHtml = `
          <p>Dear ${name},</p>
          <p>I hope you’re feeling much better now. We noticed that your medical break has ended, but your program hasn’t restarted yet. We want to make sure you don’t lose valuable days or sessions from your plan.</p>
          <p>Here’s a quick update on your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Break Overdue By: ${overdueDays} days</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Remaining: ${
              validityRemaining > 0 ? validityRemaining : 0
            } days</li>
          </ul>
          <p>To resume your program smoothly, please update your current weight today. This will help us customize your next plan, keeping your recovery and present condition in mind.</p>
          <p><a href="https://www.balancenutrition.in/app_link/screen_id=2">Update your weight now using the BN App</a></p>
          <p>The sooner you update, the sooner you can continue working on your health goals, don’t let your validity slip away!</p>
          <p>We’re excited to have you back and support you through this next phase of your journey.</p>
          <p>Wishing you continued recovery and good health.</p>
        `;

        chatHtml = `
          <p>Dear ${name},</p>
          <p>I hope you're feeling much better now!</p>
          <p>Here’s a quick recap of your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Pending: ${validityRemaining} days</li>
          </ul>
          <p>Before we begin your next phase, please update your current weight here: <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>
          <p>Looking forward to helping you get back to your healthy routine!</p>
        `;
      }

      if (onhold_reason === "Travel") {
        mailHtml = `
          <p>Hi ${name},</p>
          <p>We noticed that your program break has ended, but you haven’t restarted yet. We want to make sure you don’t lose valuable days or sessions from your plan.</p>
          <p>Here’s a quick update on your program details:</p>
          <ul>
            <li>Break Started: ${breakStart}</li>
            <li>Break Ended: ${breakEnd}</li>
            <li>Break Overdue By: ${overdueDays} days</li>
            <li>Sessions Pending: ${pending_session || 0}</li>
            <li>Validity Remaining: ${
              validityRemaining > 0 ? validityRemaining : 0
            } days</li>
          </ul>
          <p>To resume your program smoothly, please update your current weight today. This will help us customize your next plan and schedule your diet session right away.</p>
          
          <p><a href="https://www.balancenutrition.in/app_link/screen_id=2">Update your weight now using the BN App</a></p>
          
          <p>The sooner you update, the more time you’ll have to make progress toward your goals — don’t let your validity slip away!</p>
          
          <p>We’re excited to have you back and support you through this next phase of your journey.</p>
        `;

        chatHtml = `
          <p>Hi ${name},</p>
          <p>I’m happy to let you know that your break request during the ongoing program has been approved. Please verify these details at your end too:</p>
          <ul style="padding-left: 18px; margin: 0 0 16px;">
            <li><strong>Break Reason:</strong> ${onhold_reason}</li>
            <li><strong>Break Duration:</strong> ${days} days</li>
            <li><strong>Original Program Validity End Date:</strong> ${oldEndDateFmt}</li>
            <li><strong>New Validity End Date (after extension):</strong> ${newEndDateFmt}</li>
          </ul>
          <p>Once your break is over, you will be notified to update your weight and resume the program.</p>
          <p>Have a great time &amp; enjoy yourself! ✨</p>
        `;
      }

      if (onhold_reason === "Pregnancy") {
        console.log("HElloooo");
        mailHtml = `<p>Hi <b>${name}</b>,</p>

<p>We hope you and your baby are doing well as you settle into this new phase.<br>
Your pregnancy freeze has ended, but we haven’t received your updated weight yet. We want to make sure you don’t lose valuable days or sessions from your plan.</p>

<p><b>Here’s a quick update on your program details:</b><br>
<b>Freeze Started:</b> ${breakStart}<br>
<b>Freeze Ended:</b> ${breakEnd}<br>
<b>Overdue By:</b> ${overdueDays} days<br>
<b>Sessions Pending:</b> ${pending_session || 0}</p>

<p>Please update your current (post-pregnancy) weight in the BN App so we can restart your plan and prepare your next session.</p>

<p><b>Update your weight now using the BN App:</b> <a href="https://www.balancenutrition.in/app_link/screen_id=2">BN App Link</a></p>

<p>Updating your weight will help us prepare your next steps and make sure you get the full benefit of your remaining sessions.</p>

<p>We’re here to support you gently as you settle into this new phase with your little one.<br>
We’re really looking forward to being a part of this next chapter with you.</p>

<p>Warmly,<br>
<b>The Balance Nutrition Team</b></p>
`;
      }

      // Send Mail
      if (mailHtml) {
        await sendMailUtil({
          from: "support@balancenutrition.in",
          to: email,
          subject: "Don’t Miss Out on Your Pending Sessions!",
          html: mailHtml,
          bcc: [mentor_email],
        });
      }
      if (chatHtml) {
        await clientEnquiry.create({
          mentor_id: mentor_assigned || 0,
          type: "broadcast",
          sender: "mentor",
          query: chatHtml,
          user_id,
          name: mentor_name || "",
        });
      }
    }
  } catch (error) {
    console.error("Error in sendOnholdOverdueMail:", error);
  }
};

const addTrimesterGuide = async (user_id, trimester, existingGuides = []) => {
  try {
    const guideMap = { 1: 51, 2: 52, 3: 53 };
    const guideId = guideMap[trimester];

    let userGuides = [];
    if (Array.isArray(existingGuides)) {
      userGuides = existingGuides;
    } else if (typeof existingGuides === "string") {
      try {
        userGuides = JSON.parse(existingGuides || "[]");
      } catch {
        userGuides = [];
      }
    }

    // Add guide only if not already present
    if (!userGuides.includes(guideId)) {
      userGuides.push(guideId);
      await updateRecord(
        `${tables.userDetails}`,
        { guides: JSON.stringify(userGuides) },
        { user_id }
      );
      console.log(`Added trimester guide ${guideId} for user ${user_id}`);
    }
  } catch (err) {
    console.error(`Error adding trimester guide for user ${user_id}:`, err);
  }
};

const notifyPregnancyTrimesterTips = async () => {
  try {
    if (!isTuesdayThursday()) return;

    const { results: users } = await readRecord({
      selectFields: [
        "ohc.user_id",
        "ohc.start_date",
        "ohc.due_date",
        "ohcps.days",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS name",
        "ud.mentor_assigned AS mentor_id",
        "ud.guides",
        "ad.crm_user AS mentor_name",
      ],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.onHoldClientPaidService} ohcps`,
          on: "ohcps.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        { field: "ohc.onhold_reason", operator: "=", value: "Pregnancy" },
        { field: "ud.notification_consent", operator: "=", value: 1 },
        {
          field: `ohc.id = (SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!users.length) return;

    // GROUP BY notification → Set(userIds)
    const notificationBatches = {};

    for (const user of users) {
      const { user_id: userId, due_date } = user;
      if (!due_date) continue;

      const { trimester, currentWeek, trimesterList } =
        getCurrentWeekTrimesterAndNotificationList(due_date);
      if (!trimesterList.length) continue;

      // Extract all notification ids
      const trimesterIds = trimesterList.map((n) => n.id);

      // Determine cycle
      const trimesterStart = getTrimesterStartWeek(trimester);
      const cycleIndex = Math.floor(
        (currentWeek - trimesterStart) / trimesterList.length
      );

      const cycleStartWeek = trimesterStart + cycleIndex * trimesterList.length;
      const cycleEndWeek = cycleStartWeek + trimesterList.length - 1;

      const cycleStartDate = moment(due_date)
        .subtract(40 - cycleStartWeek, "weeks")
        .startOf("day");
      const cycleEndDate = moment(due_date)
        .subtract(40 - cycleEndWeek, "weeks")
        .endOf("day");

      // Already sent?
      const sentThisCycle = await userNotification
        .find({
          user_id: userId,
          notification_id: { $in: trimesterIds },
          added_date: {
            $gte: cycleStartDate.toDate(),
            $lte: cycleEndDate.toDate(),
          },
        })
        .select("notification_id");

      const sentIds = sentThisCycle.map((s) => s.notification_id);

      // Remaining notifications in this cycle
      let remaining = trimesterList.filter((n) => !sentIds.includes(n.id));
      if (!remaining.length) remaining = [...trimesterList]; // repeat full cycle

      const selected = remaining[Math.floor(Math.random() * remaining.length)];

      // Guide activation
      if (selected.isGuideActivation) {
        await addTrimesterGuide(user.user_id, trimester, user.guides);
      }

      // Add user to notification batch
      if (!notificationBatches[selected.id]) {
        notificationBatches[selected.id] = new Set();
      }
      notificationBatches[selected.id].add(userId);
    }

    // SEND IN BATCHES (same structure as example)
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    const url = `${process.env.BACKEND_URL}/api/v1/notifications/send-notification-separately`;

    for (const [notiId, userSet] of Object.entries(notificationBatches)) {
      const userIds = [...userSet];
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        try {
          await axios.post(url, {
            user_ids: slice,
            notification_id: Number(notiId),
            sent_via: "cron",
          });

          console.log(`Sent notification ${notiId} to:`, slice);
        } catch (err) {
          console.log(`Error sending ${notiId} to`, slice, err.message);
        }
      }

      console.log(
        `Completed notification ${notiId}, total users: ${userIds.length}`
      );
    }

    // ---------------- Utilities ----------------
    function isTuesdayThursday() {
      const day = moment().format("dddd");
      return day === "Tuesday" || day === "Thursday";
    }

    function getCurrentWeekTrimesterAndNotificationList(due_date) {
      const due = moment(due_date);
      const pregStart = due.clone().subtract(40, "weeks");
      const currentWeek = moment().diff(pregStart, "weeks") + 1;

      let trimester = 1;
      if (currentWeek >= 14 && currentWeek <= 27) trimester = 2;
      if (currentWeek >= 28) trimester = 3;

      return {
        currentWeek,
        trimester,
        trimesterList: PREGNANCY_NOTIFICATIONS[trimester] || [],
      };
    }

    function getTrimesterStartWeek(trimester) {
      if (trimester === 1) return 1;
      if (trimester === 2) return 14;
      if (trimester === 3) return 28;
      return 1;
    }
  } catch (error) {
    console.error("Pregnancy Trimester Cron Error:", error);
  }
};

const notifyEndingPregnancyDueDate = async (req, res, next) => {
  try {
    const today = moment().startOf("day");

    // Notification IDs for D-1 and D+1
    // const NOTI_BY_DIFF =
    //   process.env.NODE_ENV === "production"
    //     ? { 1: 796, "-1": 797 }
    //     : { 1: 658, "-1": 657 };

    const NOTI_BY_DIFF = { 1: 796, "-1": 797}


    // Build target dates
    const oneDayBefore = today.clone().subtract(1, "days").format("YYYY-MM-DD");
    const oneDayAfter = today.clone().add(1, "days").format("YYYY-MM-DD");

    // --- Helper to fetch users for a specific due_date ---
    async function fetchUsersForDueDate(targetDate) {
      console.log(targetDate, "TARGET DATE");
      const { results } = await readRecord({
        selectFields: [
          "ohc.user_id",
          "ohc.start_date",
          "ud.email_id",
          "ohc.due_date",
          "CONCAT(ud.first_name, ' ', ud.last_name) AS name",
          "ud.mentor_assigned AS mentor_id",
          "ud.guides",
          "ud.phone_number",
          "ad.crm_user AS mentor_name",
          "ad.email_id AS mentor_email",
        ],
        table: `${tables.onHoldClientPaidService} ohc`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
        ],
        conditions: [
          { field: "ohc.due_date", operator: "=", value: targetDate },
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ohc.reason", operator: "=", value: "Pregnancy" },
          { field: "ohc.status", operator: "=", value: "Success" },
          { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
          { field: "ud.notification_consent", operator: "=", value: 1 },
          {
            field: `ohc.id`,
            operator: "=",
            value: `(SELECT MAX(id) FROM onhold_clients_paid_service WHERE user_id = ohc.user_id)`,
            raw: true,
          },
        ],
      });

      console.log(results, "RESULTS");
      return results;
    }

    // Fetch both
    const oneDayBeforeUsers = await fetchUsersForDueDate(oneDayBefore);
    const oneDayAfterUsers = await fetchUsersForDueDate(oneDayAfter);

    const users = [...oneDayBeforeUsers, ...oneDayAfterUsers];

    console.log(`Found ${users.length} users near due date.`);

    if (!users.length) {
      console.log("No users found. Exiting.");
      return;
    }

    // Notification batch groups (notiId => Set(userIds))
    const notificationBatches = {};

    for (const user of users) {
      const dueDate = moment(user.due_date).startOf("day");
      const diffDays = dueDate.diff(today, "days"); // +1 before, -1 after

      // Skip if not exactly -1 or +1
      if (!NOTI_BY_DIFF[diffDays]) continue;

      const notiId = NOTI_BY_DIFF[diffDays];
      if (!notificationBatches[notiId]) {
        notificationBatches[notiId] = new Set();
      }

      notificationBatches[notiId].add(user.user_id);

      // Email
      const emailTemplate =
        diffDays === 1
          ? getOneDayBeforeEmailTemplate(user.name)
          : getOneDayAfterEmailTemplate(user.name);

      await sendMailUtil({
        from: "support@balancenutrition.in",
        to: user.email_id,
        cc: ["clientservices@balancenutrition.in"],
        bcc: ["testerteam@balancenutrition.in", `"${user.mentor_email}"`],
        subject: emailTemplate?.subject,
        html: emailTemplate?.body,
      });

      try {
        const fullPhone = `${user.phone_number?.replace(/\D/g, "")}`;
        if (fullPhone) {
          await axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
            {
              template_name:
                diffDays === 1
                  ? "pregnancy_onhold_due_day_before"
                  : "pregnancy_onhold_due_day_after",
              broadcast_name:
                diffDays === 1
                  ? "pregnancy_onhold_due_day_before"
                  : "pregnancy_onhold_due_day_after",
              parameters: [{ name: "name", value: user.name || "User" }],
            }
          );
        }
      } catch (watiErr) {
        console.error("WATI error:", watiErr.message);
      }
    }

    // SEND NOTIFICATIONS (IN CHUNKS)
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    const url = `${process.env.BACKEND_URL}/api/v1/notifications/send-notification-separately`;
    // const url = `https://localhost:3000/api/v1/notifications/send-notification-separately`;


    for (const [notiId, userSet] of Object.entries(notificationBatches)) {
      const userIds = [...userSet];
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        try {
          await axios.post(url, {
            user_ids: slice,
            notification_id: Number(notiId),
            sent_via: "cron",
          });
        } catch (error) {
          console.log(
            `Error in sending notfication to ${slice}`,
            error.message
          );
        }
      }

      console.log(`Sent notification ${notiId} to ${userIds.length} users`);
    }

    console.log("✅ Sent near-due-date notifications + auto chats.");
  } catch (error) {
    console.error("❌ Error in notifyEndingPregnancyDueDate:", error);
  }
};

const notifyPregnancyPostDueDate = async (req, res, next) => {
  try {
    const today = moment().startOf("day");

    // Notification IDs for week 1 to week 5 AFTER due date
    const NOTIFICATION_BY_WEEK = {
      1: 923, // example
      2: 924,
      3: 925,
      4: 926,
      5: 927,
    };

    // --- Fetch users whose due_date is between (today - 5 weeks) and (today - 1 day) ---
    const startDate = today.clone().subtract(5, "weeks").format("YYYY-MM-DD");
    const endDate = today.clone().subtract(3, "days").format("YYYY-MM-DD");

    const { results: users } = await readRecord({
      selectFields: [
        "ohc.user_id",
        "ohc.due_date",
        "ud.user_status",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number",
        "ud.sub_user_status",
      ],
      table: `${tables.onHoldClientPaidService} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ohc.due_date", operator: ">=", value: startDate },
        { field: "ohc.due_date", operator: "<=", value: endDate },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.reason", operator: "=", value: "Pregnancy" },
        { field: "ohc.status", operator: "=", value: "Success" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id`,
          operator: "=",
          value: `(SELECT MAX(id) FROM onhold_clients_paid_service WHERE user_id = ohc.user_id)`,
          raw: true,
        },
      ],
    });

    if (!users.length) {
      console.log("No post-due-date users found. Exiting.");
      return;
    }

    console.log(`Found ${users.length} users up to 5 weeks past due date.`);

    // Group by notification → Set(userIds)
    const notificationBatches = {};

    for (const user of users) {
      const dueDate = moment(user.due_date);
      const daysDiff = today.diff(dueDate, "days");
      console.log(dueDate, "dueDate") ; 

      const diffWeeks = Math.floor(daysDiff / 7) + 1;

      // Only accept between 1–5 weeks past due
      if (daysDiff < 3) continue;

      if (![4,11,18,25,32].includes(daysDiff)) continue;

      const notiId = NOTIFICATION_BY_WEEK[diffWeeks];
      console.log(notiId, "notId"); 
      if (!notiId) continue;

      if (!notificationBatches[notiId]) {
        notificationBatches[notiId] = new Set();
      }

      notificationBatches[notiId].add(user.user_id);
    }

    console.log(notificationBatches, 'Notification Batches') ; 

    // --- Send notifications in batches ---
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    const url = `${process.env.BACKEND_URL}/api/v1/notifications/send-notification-separately`;

    for (const [notiId, userSet] of Object.entries(notificationBatches)) {
      const userIds = [...userSet];
      console.log(userIds, "USERIDs") ; 
      if (!userIds.length) continue;

      for (const slice of chunk(userIds)) {
        try {
          await axios.post(url, {
            user_ids: slice,
            notification_id: Number(notiId),
            sent_via: "cron",
          });
          console.log("notification sent to ", slice, notiId);
        } catch (error) {
          console.log(
            `Error sending notification ${notiId} to users`,
            slice,
            error.message
          );
        }
      }

      console.log(`Sent notification ${notiId} to ${userIds.length} users`);
    }

    console.log("✅ Sent all post-due-date notifications.");
  } catch (error) {
    console.error("❌ Error in notifyPregnancyPostDueDate:", error);
  }
};

const notifyPregnancyOverdueEndDate = async () => {
  try {
    const today = moment().startOf("day");
    const fourDaysAgo = today.clone().subtract(4, "days").toDate();

    // All possible notifications
    const notificationArr = [933, 934, 935, 936];

    // Fetch all users whose end_date < today
    const { results: users } = await readRecord({
      selectFields: [
        "ohc.user_id",
        "ohc.due_date",
        "ohc.end_date",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number",
        "ud.user_status",
        "ud.sub_user_status",
      ],
      table: `${tables.onHoldClientPaidService} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
      ],
      conditions: [
        {
          field: "ohc.end_date",
          operator: "<",
          value: today.format("YYYY-MM-DD"),
        },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ohc.reason", operator: "=", value: "Pregnancy" },
        { field: "ohc.status", operator: "=", value: "Success" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        { field: "ud.notification_consent", operator: "=", value: 1 },
        {
          field: `ohc.id`,
          operator: "=",
          value: `(SELECT MAX(id) FROM onhold_clients_paid_service WHERE user_id = ohc.user_id)`,
          raw: true,
        },
      ],
    });

    if (!users.length) {
      console.log("No post-end-date users found.");
      return;
    }

    // Batch structure: notiId => Set(userIds)
    const notificationBatches = {};

    for (const user of users) {
      const userId = user.user_id;

      // Fetch notifications sent to this user in last 4 days
      const recentlySent = await userNotification
        .find({
          user_id: userId,
          notification_id: { $in: notificationArr },
          added_date: { $gte: fourDaysAgo },
        })
        .select("notification_id");

      const sentIds = recentlySent.map((n) => n.notification_id);

      // Determine available notifications
      let available = notificationArr.filter((id) => !sentIds.includes(id));
      console.log(available, sentIds, 'available', 10677)

      // IF NONE AVAILABLE → Reset cycle
      if (available.length === 0) {
        available = [...notificationArr];
      }

      // Pick random ID
      const selectedNoti =
        available[Math.floor(Math.random() * available.length)];

      // Collect user for batching
      if (!notificationBatches[selectedNoti]) {
        notificationBatches[selectedNoti] = new Set();
      }
      notificationBatches[selectedNoti].add(userId);

      console.log(
        `User ${userId}: Selected Overdue Notification ${selectedNoti}`
      );
    }

    // Send notifications in batches of 100
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
      }
      return out;
    };

    const SEND_URL = `${process.env.BACKEND_URL}/api/v1/notifications/send-notification-separately`;

    for (const [notiId, userSet] of Object.entries(notificationBatches)) {
      const userIds = [...userSet];
      for (const slice of chunk(userIds)) {
        try {
          await axios.post(SEND_URL, {
            user_ids: slice,
            notification_id: Number(notiId),
            sent_via: "cron",
          });
        } catch (err) {
          console.log("Error sending batch:", slice, err.message);
        }
      }
    }

    console.log("Overdue pregnancy notifications sent successfully.");
  } catch (error) {
    console.error("Error in notifyPregnancyOverdueEndDate:", error);
  }
};

const moveOnholdToDormant = async (req, res, next) => {
  try {
    const today = moment().startOf("day");

    // 1. Get all users who are Onhold
    const { results: users } = await readRecord({
      selectFields: [
        "ud.user_id",
        "ud.user_status",
        "ud.sub_user_status",
        "ds.diet_start_date",
        "ohc.days as total_days_onhold",
      ],
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} ds`,
          on: "ud.user_id = ds.user_id ",
        },
        {
          type: "LEFT",
          table: `${tables.onholdClients} ohc`,
          on: "ud.user_id = ohc.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: "ohc.end_date",
          operator: "<",
          value: today.format("YYYY-MM-DD"),
        },
        {
          field: `ds.diet_id = (SELECT MAX(diet_id) FROM ${tables.dietSessionLog} WHERE user_id = ud.user_id and sub_order_id=ud.active_order_id  and diet_status=4)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `ohc.id = (SELECT MAX(id) FROM onhold_clients WHERE user_id = ud.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(ds.end_session_weight = "0.00" or ds.end_session_weight = 0 or ds.end_session_weight IS NULL)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    if (!users?.length) {
      return res
        .status(200)
        .send(
          new ApiResponse({ statusCode: 200, message: "No onhold users found" })
        );
    }

    let updatedCount = 0;

    // 2. Loop through users
    for (const user of users) {
      const { user_id, diet_start_date, total_days_onhold } = user;

      if (!diet_start_date) continue;
      // console.log(diet_start_date);
      const cutoffDate = moment(diet_start_date)
        .add(21, "days")
        .add(Number(total_days_onhold || 0), "days");

      if (today.isAfter(cutoffDate)) {
        await updateUserStatusAndLog({
          userId: user_id,
          status: "Active",
          subStatus: "Dormant",
        });
        updatedCount++;
        console.log(
          `User ${user_id} moved to Dormant (cutoff: ${cutoffDate.format(
            "YYYY-MM-DD"
          )})`
        );
      }
    }

    return res.status(200).send(
      new ApiResponse({
        statusCode: 200,
        message: `${updatedCount} users moved to Dormant`,
      })
    );
  } catch (error) {
    console.error("Error in moveOnholdToDormant:", error);
    return res
      .status(500)
      .send(
        new ApiResponse({ statusCode: 500, message: "Internal server error" })
      );
  }
};

async function cartAddedNotification() {
  try {
    const { results } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.mentor_assigned",
        "CASE WHEN cd.user_status = 'Active' THEN 'Active' WHEN cd.user_status = 'Completed' THEN 'OC' WHEN cd.user_type = '0' THEN 'Lead' ELSE cd.sub_user_status END AS status",
        "cd.user_type",
        "cd.counsellor_assigned",
        "JSON_LENGTH(ct.cart_items) as item_count",
        "ct.updated_date",
      ],
      table: `${tables.cart} ct`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "ct.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(updated_date) AS latest_date FROM ${tables.cart} GROUP BY user_id) latest`,
          on: "ct.user_id = latest.user_id AND ct.updated_date = latest.latest_date",
        },
      ],
      conditions: [
        {
          field: "ct.updated_date",
          operator: ">=",
          value: "CURRENT_TIMESTAMP - INTERVAL 10 MINUTE",
          raw: true,
        },
        {
          field: "JSON_LENGTH(ct.cart_items)",
          operator: ">",
          value: 0,
        },
        {
          field: "ct.cart_code",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });
    console.log(results.length);
    for (const user of results) {
      const { mentor_assigned, user_type, counsellor_assigned, item_count } =
        user;
      const data = {
        title: `BN Shop Cart Unpaid!`,
        description: `Your ${
          user_type == 0 ? "Lead" : "Client"
        } has added ${item_count} items to cart but not paid`,
        priority: 1,
        redirect:
          user_type == 0
            ? "?type=Lead&modal=cart_not_paid"
            : "?card=4&modal=cart_added_today",
      };
      sendSSEEvent({
        mentor_id:
          Number(user_type) === 0 ? counsellor_assigned : mentor_assigned,
        data,
      });
    }
  } catch (error) {
    console.error("Error in cartAddedNotification:", error);
  }
} 

export const cartPaymentReminder = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: tables.cart,
      selectFields: [
        "cart.user_id as user_id",
        "cart.cart_id as cart_id", 
        "CONCAT(ud.first_name, ' ', ud.last_name) AS user_name",
        "ad.admin_user_id as admin_id",
        "ad.email_id as mentor_email",
        "ad.crm_user as mentor_name",
        "ad.official_phone as mentor_wa",
        "ud.email_id",
        "ud.user_status as user_status",
        "cart.cart_items",
        "MAX(cart.updated_date) AS latest_added_date",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number as phone_number",
      ],
      conditions: [
        { field: "JSON_LENGTH(cart.cart_items)", operator: ">", value: 0 },
        {
          field: "cart.updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 10 MINUTE)",
          raw: true,
        },
        {
          field: "cart.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online')",
          raw: true,
        },
        { field: "cart.cart_code IS NULL", operator: "", value: "", raw: true },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: `ud.user_id = cart.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = (CASE WHEN ud.user_status='Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
        },
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(updated_date) AS latest_date FROM ${tables.cart} GROUP BY user_id) latest`,
          on: "cart.user_id = latest.user_id AND cart.updated_date = latest.latest_date",
        },
      ],
      groupBy: ["cart.user_id"],
    });

    if (!cartDetails.length) {
      console.log("No new cart data found.");
      return;
    }

    const user_ids = cartDetails.map((cart) => cart.user_id);

    // send BN notification
    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 778,
          sent_via: "cron",
        }
      );
    } catch (err) {
      console.error("Notification send failed:", err.message);
    }

    const getHtmlTemplate = (html) => {
      return `<!DOCTYPE html>
      <html><head><meta charset="UTF-8"/></head>
      <body style="background:#f4f4f4;margin:0;padding:40px 10px;">
      <div style="max-width:600px;margin:auto;background:#fff;padding:25px;border-radius:10px;">
      ${html}
      <p style="font-size:12px;color:#777;text-align:center;margin-top:30px;">
      © ${moment().format("YYYY")} Balance Nutrition
      </p></div></body></html>`;
    };

    const limit = pLimit(5);

    await Promise.all(
      cartDetails.map((cartDetail) =>
        limit(async () => {
          const cartItems = JSON.parse(cartDetail.cart_items || "[]");
          const cartTotal = cartItems.reduce(
            (t, c) => t + (c.price_per_unit * c.quantity || 0),
            0
          );

          const shopLink = `https://balancenutrition.in/shop?share=cc-${cartDetail?.cart_id}`

          const cartSummary = cartItems
            .map(
              (c) =>
                `${c.product_name} - Pack: ${c.pack_size} | Qty: ${c.quantity} | ₹${c.price_per_unit}`
            )
            .join(", ");

          // =====================================
          // AUTO CHAT MESSAGE (USE SHOP LINK)
          // =====================================
          if (cartDetail.user_status !== "Lead") {
            const chatMessage = `
              Hi ${cartDetail.user_name},
              <br><br>
              You added some <b>BN-Approved Healthy Snacks</b> to your cart.<br>
              <br><b>Cart Summary:</b><br>
              ${cartItems
                .map(
                  (c) =>
                    `<p><b>${c.product_name}</b> - Pack: ${c.pack_size} | Qty: ${c.quantity} | ₹${c.price_per_unit}</p>`
                )
                .join("")}
              <b>Total:</b> ₹${cartTotal}<br><br>
              Complete your purchase here:<br>
              <a href="${shopLink}">${shopLink}</a><br><br>
              If you need help, WhatsApp me on <b>${
                cartDetail.mentor_wa || "9619845139"
              }</b>.
            `;

            await clientEnquiry.create({
              mentor_id: cartDetail.admin_id,
              type: "broadcast",
              sender: "mentor",
              query: chatMessage,
              user_id: cartDetail.user_id,
              name: cartDetail.mentor_name,
            });
          }

          // =====================================
          // EMAIL TEMPLATE (USE SHOP LINK)
          // =====================================
          const emailHtml = `
            <p>Hi <strong>${cartDetail.user_name}</strong>,</p>
            <p>You added some <b>BN-Approved Healthy Snacks Products</b> but haven't completed your order.</p>
            <h3>Your Cart:</h3>
            ${cartItems
              .map(
                (cart) => `
              <p>${cart.product_name} - Pack: ${cart.pack_size} | Qty: ${cart.quantity} | ₹${cart.price_per_unit}</p>
            `
              )
              .join("")}
            <p><b>Total:</b> ₹${cartTotal}</p>

            <p>Complete your purchase here:<br>
            <a href="${shopLink}">${shopLink}</a></p>

            <p>If you need help, your mentor <b>${
              cartDetail.mentor_name || "Mansi"
            }</b> is available on <b>${
            cartDetail.mentor_wa || "9619845139"
          }</b>.</p>
          `;

          await sendMailUtil({
            from: "support@balancenutrition.in",
            to: cartDetail.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: [cartDetail.mentor_email, "anchalsingh@balancenutrition.in"],
            subject: "Complete Your Order Today!",
            html: getHtmlTemplate(emailHtml),
          });

          // =====================================
          // WATI MESSAGE (USE SHOP LINK)
          // =====================================
          try {
            const fullPhone = `${cartDetail.phone_number?.replace(/\D/g, "")}`;
            if (fullPhone) {
              await axios.post(
                `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
                {
                  template_name: "cart_reminder_shop_final",
                  broadcast_name: "cart_reminder_shop_final",
                  parameters: [
                    { name: "name", value: cartDetail.user_name || "User" },
                    {
                      name: "mentor_wa",
                      value: cartDetail.mentor_wa || "9619845139",
                    },
                    {
                      name: "mentor",
                      value: cartDetail.mentor_name || "Mansi",
                    },
                    { name: "cart_summary", value: cartSummary },
                    { name: "total_amount", value: cartTotal },
                    { name: "razorpay_link", value: shopLink },
                    { name: "razorpayId", value: "shop" },
                    {name: 'cartId', value: cartDetail?.cart_id }
                  ],
                }
              );
            }
          } catch (watiErr) {
            console.error("WATI error:", watiErr.message);
          }
        })
      )
    );

    console.log(`Processed ${cartDetails.length} cart reminders.`);
  } catch (error) {
    console.error("Error in cart payment reminder cron:", error);
  }
};

export const shareCartLinkReminder24Hours = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: `${tables.cart}`,
      selectFields: ["cart_items", "user_id", "cart_code"],
      conditions: [
        { field: "cart_code", operator: "IS NOT", value: "NULL", raw: true },
        { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
        { field: "cart_code", operator: "!=", value: "''", raw: true },
        {
          field: "updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 24 HOUR)",
          raw: true,
        },
      ],
    });

    console.log(cartDetails, "CART DETAILS");

    if (!cartDetails?.length) {
      console.log("NO CART WITH SUCH CONDITIONS FOUND");
      return;
    }

    const usersIds = cartDetails.map((cartDetail) => cartDetail.user_id);
    console.log(usersIds, "USER IDS");
    const notificationId = 957;

    // send notification here:
    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: usersIds,
          notification_id: notificationId,
          sent_via: "",
        }
      );
    } catch (err) {
      console.log("SENDING NOTIFICATION error 5549", err?.message || err);
    }

    cartDetails.forEach(async (cartDetail) => {
      const cartItems = JSON.parse(cartDetail.cart_items);
      const user_id = cartDetail.user_id;
      const cart_code = cartDetail.cart_code;
      console.log(cartItems, "cartItems");
      const cartLink = `https://balancenutrition.in/shop?share=${cart_code}`;

      // get user details for email auto chat and notification
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.user_id",
          "ud.email_id",
          "ud.phone_number",
          "ud.first_name",
          "ud.last_name",
          "ad.admin_user_id",
          "ad.crm_user as mentor_name",
          "ad.email_id as mentor_email",
          "ud.user_status",
          "ud.device",
          "ad.official_phone",
          "ad.designation",
        ],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: `ad.admin_user_id = (CASE WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
          },
        ],
      });

      const user = results[0];
      console.log(
        user?.user_status,
        "",
        user?.device,
        "device",
        user?.phone_number,
        "phone_number",
        ["Lead", "Completed"].includes(user?.user_status) &&
          !user?.device &&
          user?.phone_number,
        "condition"
      );
      if (user?.device) {
        console.log(user?.device, "device is there");
        let autoChatMessage = generateAutoCartCreationMessageTemplates(
          user?.first_name,
          cartItems,
          cartLink,
          user?.mentor_wa
        );

        // send autochat
        try {
          await clientEnquiry.create({
            mentor_id: user.admin_user_id,
            type: "broadcast",
            sender: "mentor",
            query: autoChatMessage?.reminder,
            user_id: user.user_id,
            name: user.mentor_name,
          });
        } catch (err) {
          console.log("SENDING AUTOCHAT error 6116", err?.message || err);
        }
      }

      if (
        ["Lead", "Completed"].includes(user?.user_status) &&
        user?.phone_number
      ) {
        const fullPhone = `${user?.phone_number?.replace(/\D/g, "")}`;
        const cartSummary = `${cartItems
          .map(
            (item) =>
              `${item?.product_name} x ${item?.quantity} = ${
                Number(item?.price_per_unit) * Number(item?.quantity)
              } `
          )
          .join(" || ")}`;
        const total = `${cartItems.reduce(
          (total, item) =>
            total + Number(item?.price_per_unit) * Number(item?.quantity),
          0
        )}`;
        console.log(
          fullPhone,
          cartSummary,
          total,
          cart_code,
          "HERE IS THE FLOW"
        );

        try {
          await axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
            {
              template_name: "share_cart_link_cron_notfication_final",
              broadcast_name: "share_cart_link_cron_notfication_final",
              parameters: [
                {
                  name: "name",
                  value: user?.first_name,
                },
                {
                  name: "total",
                  value: total,
                },
                {
                  name: "shareCode",
                  value: cart_code,
                },
                {
                  name: "cart_summary",
                  value: cartSummary,
                },
                {
                  name: "mentor_name",
                  value: user?.mentor_name || "Mansi",
                },
                {
                  name: "mentor_wa",
                  value: user?.mentor_wa || "9619845139",
                },
                {
                  name: "designation",
                  value: user?.designation || "Sr. Nutritionist",
                },
              ],
            }
          );
        } catch (error) {
          console.log("SENDING WATI error 6147", error?.message || error);
        }
      }

      const emailHtml = get48HourEmailTemplate({
        name: user.first_name,
        cartLink: cartLink,
        cartItems: cartItems,
        designation: user.designation || "Sr. Nutritionist",
        mentor_wa: user.mentor_wa || "9619845139",
        mentor_name: user.mentor_name || "Mansi",
      });

      await sendMailUtil({
        from: "support@balancenutrition.in",
        to: user.email_id,
        cc: ["clientservices@balancenutrition.in"],
        bcc: ["testerteam@balancenutrition.in", `${user.mentor_email}`],
        subject: emailHtml.subject,
        html: emailHtml.body,
      });
    });
  } catch (error) {
    console.log(error);
  }
};

export const shareCartLinkReminder48Hours = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: `${tables.cart}`,
      selectFields: ["cart_items", "user_id", "cart_code"],
      conditions: [
        { field: "cart_code", operator: "IS NOT", value: "NULL", raw: true },
        { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
        { field: "cart_code", operator: "!=", value: "''", raw: true },
        {
          field: "updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 48 HOUR)",
          raw: true,
        },
        {
          field: "updated_date",
          operator: "<",
          value: "(NOW() - INTERVAL 24 HOUR)",
          raw: true,
        },
      ],
    });

    console.log(cartDetails, "CART DETAILS");

    if (!cartDetails?.length) {
      console.log("NO CART WITH SUCH CONDITIONS FOUND");
      return;
    }

    const usersIds = cartDetails.map((cartDetail) => cartDetail.user_id);
    console.log(usersIds, "USER IDS");
    const notificationId = 957;

    // send notification here:
    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: usersIds,
          notification_id: notificationId,
          sent_via: "",
        }
      );
    } catch (err) {
      console.log("SENDING NOTIFICATION error 5549", err?.message || err);
    }

    cartDetails.forEach(async (cartDetail) => {
      const cartItems = JSON.parse(cartDetail.cart_items);
      const user_id = cartDetail.user_id;
      const cart_code = cartDetail.cart_code;
      console.log(cartItems, "cartItems");
      const cartLink = `https://balancenutrition.in/shop?share=${cart_code}`;

      // get user details for email auto chat and notification
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.user_id",
          "ud.email_id",
          "ud.phone_number",
          "ud.first_name",
          "ud.last_name",
          "ad.admin_user_id",
          "ad.crm_user as mentor_name",
          "ad.email_id as mentor_email",
          "ud.user_status",
          "ud.device",
          "ad.official_phone",
          "ad.designation",
        ],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: `ad.admin_user_id = (CASE WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
          },
        ],
      });

      const user = results[0];
      console.log(
        user?.user_status,
        "",
        user?.device,
        "device",
        user?.phone_number,
        "phone_number",
        ["Lead", "Completed"].includes(user?.user_status) &&
          !user?.device &&
          user?.phone_number,
        "condition"
      );
      if (user?.device) {
        console.log(user?.device, "device is there");
        let autoChatMessage = generateAutoCartCreationMessageTemplates(
          user?.first_name,
          cartItems,
          cartLink
        );

        // send autochat
        try {
          await clientEnquiry.create({
            mentor_id: user.admin_user_id,
            type: "broadcast",
            sender: "mentor",
            query: autoChatMessage?.reminder,
            user_id: user.user_id,
            name: user.mentor_name,
          });
        } catch (err) {
          console.log("SENDING AUTOCHAT error 6116", err?.message || err);
        }
      }

      if (
        ["Lead", "Completed"].includes(user?.user_status) &&
        user?.phone_number
      ) {
        const fullPhone = `${user?.phone_number?.replace(/\D/g, "")}`;
        const cartSummary = `${cartItems
          .map(
            (item) =>
              `${item?.product_name} x ${item?.quantity} = ${
                Number(item?.price_per_unit) * Number(item?.quantity)
              } `
          )
          .join(" || ")}`;
        const total = `${cartItems.reduce(
          (total, item) =>
            total + Number(item?.price_per_unit) * Number(item?.quantity),
          0
        )}`;
        console.log(
          fullPhone,
          cartSummary,
          total,
          cart_code,
          "HERE IS THE FLOW"
        );

        try {
          await axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
            {
              template_name: "share_cart_link_cron_notfication_final",
              broadcast_name: "share_cart_link_cron_notfication_final",
              parameters: [
                {
                  name: "name",
                  value: user?.first_name,
                },
                {
                  name: "total",
                  value: total,
                },
                {
                  name: "shareCode",
                  value: cart_code,
                },
                {
                  name: "cart_summary",
                  value: cartSummary,
                },
                {
                  name: "mentor_name",
                  value: user?.mentor_name || "Mansi",
                },
                {
                  name: "mentor_wa",
                  value: user?.mentor_wa || "9619845139",
                },
                {
                  name: "designation",
                  value: user?.designation || "Sr. Nutritionist",
                },
              ],
            }
          );
        } catch (error) {
          console.log("SENDING WATI error 6147", error?.message || error);
        }
      }

      const emailHtml = get48HourEmailTemplate({
        name: user.first_name,
        cartLink: cartLink,
        cartItems: cartItems,
        designation: user.designation || "Sr. Nutritionist",
        mentor_wa: user.mentor_wa || "9619845139",
        mentor_name: user.mentor_name || "Mansi",
      });

      await sendMailUtil({
        from: "support@balancenutrition.in",
        to: user.email_id,
        cc: ["clientservices@balancenutrition.in"],
        bcc: ["testerteam@balancenutrition.in", `${user.mentor_email}`],
        subject: emailHtml.subject,
        html: emailHtml.body,
      });
    });
  } catch (error) {
    console.log(error);
  }
};

export const cartPaymentReminder30Min = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: tables.cart,
      selectFields: [
        "cart.user_id as user_id",
        'cart.cart_id as cart_id', 
        "CONCAT(ud.first_name, ' ', ud.last_name) AS user_name",
        "ad.admin_user_id as admin_id",
        "ad.email_id as mentor_email",
        "ad.crm_user as mentor_name",
        "ad.designation as mentor_designation",
        "ad.official_phone as mentor_wa",
        "ud.email_id",
        "ud.user_status",
        "cart.cart_items",
        "MAX(cart.updated_date) AS latest_added_date",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number as phone_number",
      ],
      conditions: [
        { field: "JSON_LENGTH(cart.cart_items)", operator: ">", value: 0 },
        {
          field: "cart.updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 30 MINUTE)",
          raw: true,
        },
        {
          field: "cart.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online')",
          raw: true,
        },
        { field: "ud.user_type", operator: "=", value: "1" },
        // { field: "ud.mentor_assigned", operator: "=", value: 196 },
        {
          field: "cart.cart_code IS NULL",
          operator: "",
          value: "",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: `ud.user_id = cart.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = (CASE WHEN ud.user_status='Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
        },
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(updated_date) AS latest_date FROM ${tables.cart} GROUP BY user_id) latest`,
          on: "cart.user_id = latest.user_id AND cart.updated_date = latest.latest_date",
        },
      ],
      groupBy: ["cart.user_id"],
    });

    if (!cartDetails.length) {
      console.log("No new cart data found (30-min cron).");
      return;
    }

    const user_ids = cartDetails.map((c) => c.user_id);

    // Send notification 857
    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 857,
          sent_via: "cron",
        }
      );
    } catch (err) {
      console.error("Notification 857 failed:", err.message);
    }

    const limit = pLimit(5);

    await Promise.all(
      cartDetails.map((cartDetail) =>
        limit(async () => {
          const cartItems = JSON.parse(cartDetail?.cart_items || "[]");

          const cartTotal = cartItems.reduce(
            (sum, item) => sum + (item.price_per_unit * item.quantity || 0),
            0
          );

          const shopLink = `https://balancenutrition.in/shop?share=cc-${cartDetail?.cart_id}`

          // Mentor fallback
          const mentorName = cartDetail?.mentor_name || "Mansi";
          const mentorContact = cartDetail?.mentor_wa || "9619845139";
          const mentorDesignation = cartDetail?.mentor_designation || "";
          const mentorFullTitle = `${mentorDesignation} ${mentorName}`;

          const productExamples = cartItems
            .slice(0, 3)
            .map((i) => i.product_name)
            .join(", ");

          const cart_list_html = cartItems
            .map(
              (item) => `
              <p style="margin:6px 0;font-size:14px;color:#444;">
                • ${item.product_name} – Pack: ${item.pack_size} | Qty: ${item.quantity} | ₹${item.price_per_unit}
              </p>`
            )
            .join("");


          // Auto chat
          const chatMessage = `
            Hi ${cartDetail?.user_name},
            <br><br>
            Looks like you added some of our <b>BN-Approved Healthy Snacks and Meals</b> to your cart but didn’t complete the checkout.
            Here’s what you selected:
            <br><br>
            <b>Cart Summary:</b><br>
            ${cart_list_html}
            <br><br>
            <b>Total:</b> ₹${cartTotal}
            <br><br>
            Please complete your purchase here:<br>
            <a href="${shopLink}">${shopLink}</a>
            <br><br>
            If you need help, please connect with <b>${mentorName}</b> on <b>${mentorContact}</b>.
          `;

          await clientEnquiry.create({
            mentor_id: cartDetail?.admin_id,
            type: "broadcast",
            sender: "mentor",
            query: chatMessage,
            user_id: cartDetail?.user_id,
            name: mentorName,
          });

          // Email
          const emailHtml = `
            <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f9f9f9;padding:30px 10px;text-align:center;">
              <div style="background:#fff;border-radius:10px;max-width:600px;margin:0 auto;padding:25px 30px;box-shadow:0 2px 8px rgba(0,0,0,0.05);text-align:left;">
                <p style="font-size:16px;color:#333;">Hi <strong>${cartDetail?.user_name}</strong>,</p>

                <p style="font-size:15px;color:#555;line-height:1.6;">
                  We noticed that you added <strong>BN-Approved Healthy Snacks & Meals</strong> such as 
                  <strong>${productExamples}</strong> to your cart but haven't checked out.
                </p>

                <h3 style="font-size:17px;color:#333;font-weight:600;">Your Cart:</h3>

                <div style="background:#fdfdfd;padding:15px 20px;border-radius:8px;border:1px solid #eee;margin-bottom:15px;">
                  ${cart_list_html}
                  <p style="font-size:15px;font-weight:600;color:#333;margin-top:12px;">
                    Cart Total: ₹${cartTotal}
                  </p>
                </div>

                <p style="font-size:15px;color:#555;">
                  Need help? Contact <strong>${mentorFullTitle}</strong> at:<br>
                  <strong>${mentorContact}</strong>
                </p>

                <p style="font-size:15px;color:#555;">
                  To complete your purchase, click here:<br>
                  <a href="${shopLink}" style="color:#007bff;">${shopLink}</a>
                </p>

                <p style="font-size:14px;color:#444;margin-top:25px;border-top:1px solid #eee;padding-top:15px;">
                  Warm regards,<br>
                  <strong>Team Balance Nutrition</strong>
                </p>
              </div>
            </div>
          `;

          await sendMailUtil({
            from: "support@balancenutrition.in",
            to: cartDetail?.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: [cartDetail?.mentor_email, "anchalsingh@balancenutrition.in"],
            subject: "Complete Your Order Today!",
            html: emailHtml,
          });

          // WATI WhatsApp Template
          try {
            const fullPhone = `${cartDetail?.phone_number?.replace(/\D/g, "")}`;

            await axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
              {
                template_name: "cart_reminder_30min_shop_final",
                broadcast_name: "cart_reminder_30min_shop_final",
                parameters: [
                  { name: "name", value: cartDetail.user_name },
                  {
                    name: "cart_summary",
                    value: cartItems
                      .map(
                        (i) =>
                          `${i.product_name} | Qty: ${i.quantity} | ₹${i.price_per_unit}`
                      )
                      .join(", "),
                  },
                  { name: "total_amount", value: cartTotal },
                  { name: "razorpay_link", value: shopLink },
                  { name: "razorpayId", value: "shop" },
                  { name: "mentor_name", value: mentorName },
                  { name: "mentor_wa", value: mentorContact },
                  {name: 'cartId', value: cartDetail?.cart_id }
                ],
              }
            );
          } catch (watiErr) {
            console.error("WATI error:", watiErr.message);
          }

          console.log(`30-min reminder sent to ${cartDetail.user_name}`);
        })
      )
    );

    console.log(`Processed ${cartDetails.length} (30-min) reminders.`);
  } catch (error) {
    console.error("Error in 30-min cart reminder cron:", error);
  }
};

export const cartPaymentReminder4Hour = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: tables.cart,
      selectFields: [
        "cart.user_id as user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS user_name",
        "ad.admin_user_id as admin_id",
        "ad.email_id as mentor_email",
        "ad.crm_user as mentor_name",
        "ad.official_phone as mentor_wa",
        "ud.email_id",
        "ud.user_status",
        "cart.cart_items",
        "MAX(cart.updated_date) AS latest_added_date",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number as phone_number",
      ],
      conditions: [
        { field: "JSON_LENGTH(cart.cart_items)", operator: ">", value: 0 },
        {
          field: "cart.updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 4 HOUR)",
          raw: true,
        },
        {
          field: "cart.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online')",
          raw: true,
        },
        {
          field: "ud.user_type",
          operator: "=",
          value: "1",
        },
        // {
        //   field: "ud.mentor_assigned",
        //   operator: "=",
        //   value: 196,
        // },
        {
          field: "cart.cart_code IS NULL",
          operator: "",
          value: "",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: `ud.user_id = cart.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = (CASE WHEN ud.user_status='Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
        },
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(updated_date) AS latest_date FROM ${tables.cart} GROUP BY user_id) latest`,
          on: "cart.user_id = latest.user_id AND cart.updated_date = latest.latest_date",
        },
      ],
      groupBy: ["cart.user_id"],
    });

    const limit = pLimit(5);
    await Promise.all(
      cartDetails.map((cartDetail) =>
        limit(async () => {
          const cartItems = JSON.parse(cartDetail?.cart_items || "[]");

          const cartTotal = cartItems.reduce(
            (sum, item) => sum + (item.price_per_unit * item.quantity || 0),
            0
          );

          const shopLink = `https://balancenutrition.in/shop?share=cc-${cartDetail?.cart_id}`

          // Mentor fallback
          const mentorName = cartDetail?.mentor_name || "Mansi";
          const mentorContact = cartDetail?.mentor_wa || "9619845139";
          const mentorDesignation = cartDetail?.mentor_designation || "";
          const mentorFullTitle = `${mentorDesignation} ${mentorName}`;

          const productExamples = cartItems
            .slice(0, 3)
            .map((i) => i.product_name)
            .join(", ");

          const cart_list_html = cartItems
            .map(
              (item) => `
              <p style="margin:6px 0;font-size:14px;color:#444;">
                • ${item.product_name} – Pack: ${item.pack_size} | Qty: ${item.quantity} | ₹${item.price_per_unit}
              </p>`
            )
            .join("");


          // Auto chat
          const chatMessage = `
            Hi ${cartDetail?.user_name},
            <br><br>
            Looks like you added some of our <b>BN-Approved Healthy Snacks and Meals</b> to your cart but didn’t complete the checkout.
            Here’s what you selected:
            <br><br>
            <b>Cart Summary:</b><br>
            ${cart_list_html}
            <br><br>
            <b>Total:</b> ₹${cartTotal}
            <br><br>
            Please complete your purchase here:<br>
            <a href="${shopLink}">${shopLink}</a>
            <br><br>
            If you need help, please connect with <b>${mentorName}</b> on <b>${mentorContact}</b>.
          `;

          await clientEnquiry.create({
            mentor_id: cartDetail?.admin_id,
            type: "broadcast",
            sender: "mentor",
            query: chatMessage,
            user_id: cartDetail?.user_id,
            name: mentorName,
          });


          console.log(`30-min reminder sent to ${cartDetail.user_name}`);
        })
      )
    );




    if (!cartDetails.length) {
      console.log("No cart data found (4-hour cron).");
      return;
    }

    const user_ids = cartDetails.map((c) => c.user_id);

    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 858,
          sent_via: "cron",
        }
      );
      console.log(
        `Processed ${cartDetails.length} (4-hour) notifications with ID 858.`
      );
    } catch (err) {
      console.error("Notification 858 failed:", err.message);
    }
  } catch (error) {
    console.error("Error in 4-hour cart reminder cron:", error);
  }
};

export const cartPaymentReminder24Hour = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: tables.cart,
      selectFields: [
        "cart.user_id as user_id",
        'cart.cart_id as cart_id', 
        "CONCAT(ud.first_name, ' ', ud.last_name) AS user_name",
        "ad.admin_user_id as admin_id",
        "ad.email_id as mentor_email",
        "ad.crm_user as mentor_name",
        "ad.official_phone as mentor_wa",
        "ud.email_id",
        "ud.user_status",
        "cart.cart_items",
        "MAX(cart.updated_date) AS latest_added_date",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number as phone_number",
      ],
      conditions: [
        { field: "JSON_LENGTH(cart.cart_items)", operator: ">", value: 0 },
        {
          field: "cart.updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 24 HOUR)",
          raw: true,
        },
        {
          field: "cart.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online')",
          raw: true,
        },
        { field: "ud.user_type", operator: "=", value: "1" },
        // { field: "ud.mentor_assigned", operator: "=", value: 196 },
        { field: "cart.cart_code IS NULL", operator: "", value: "", raw: true },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: `ud.user_id = cart.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = (CASE WHEN ud.user_status='Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
        },
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(updated_date) AS latest_date FROM ${tables.cart} GROUP BY user_id) latest`,
          on: "cart.user_id = latest.user_id AND cart.updated_date = latest.latest_date",
        },
      ],
      groupBy: ["cart.user_id"],
    });

    if (!cartDetails.length) {
      console.log("No new cart data found (24-hour cron).");
      return;
    }

    const user_ids = cartDetails.map((c) => c.user_id);

    // ============================
    // SEND NOTIFICATION 859
    // ============================
    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 859,
          sent_via: "cron",
        }
      );
    } catch (err) {
      console.error("Notification 859 failed:", err.message);
    }

    const limit = pLimit(5);

    await Promise.all(
      cartDetails.map((cartDetail) =>
        limit(async () => {
          const cartItems = JSON.parse(cartDetail?.cart_items || "[]");

          const cartTotal = cartItems.reduce(
            (sum, item) => sum + (item.price_per_unit * item.quantity || 0),
            0
          );

          // ==========================
          // MENTOR DETAILS
          // ==========================
          const mentorName = cartDetail?.mentor_name || "Mansi";
          const mentorContact = cartDetail?.mentor_wa || "9619845139";
          const mentorFullTitle = `Sr. Nutritionist ${mentorName}`;

          // ==========================
          // CART SUMMARY (Plain Text)
          // ==========================
          const cart_list_html = cartItems
            .map(
              (item) =>
                `• ${item.product_name} – Pack: ${item.pack_size} | Qty: ${item.quantity} | ₹${item.price_per_unit}`
            )
            .join("\n");

          // ===================================================
          // 🔥 NO PAYMENT LINK — USE STATIC SHOP LINK INSTEAD
          // ===================================================
          const shopLink = `https://balancenutrition.in/shop?share=cc-${cartDetail?.cart_id}`
          // ==========================
          // SEND WATI TEMPLATE
          // ==========================
          try {
            const fullPhone = `${cartDetail?.phone_number?.replace(/\D/g, "")}`;

            await axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
              {
                template_name: "cart_reminder_24hour_shop_final",
                broadcast_name: "cart_reminder_24hour_shop_final",
                parameters: [
                  { name: "name", value: cartDetail.user_name },
                  {
                    name: "cart_summary",
                    value: cartItems
                      .map(
                        (i) =>
                          `${i.product_name} | Qty: ${i.quantity} | ₹${i.price_per_unit}`
                      )
                      .join(", "),
                  },
                  { name: "total_amount", value: cartTotal },

                  // 🔥 REPLACED payment link with static shop URL
                  { name: "razorpay_link", value: shopLink },
                  { name: "razorpayId", value: "shop" },
                  {name: 'cartId', value: cartDetail?.cart_id },
                  { name: "mentor_name", value: mentorFullTitle },
                  { name: "mentor_wa", value: mentorContact },
                ],
              }
            );
          } catch (watiErr) {
            console.error("WATI error (24hr):", watiErr.message);
          }

          console.log(`24-hour reminder sent to ${cartDetail.user_name}`);
        })
      )
    );

    console.log(`Processed ${cartDetails.length} (24-hour) reminders.`);
  } catch (error) {
    console.error("Error in 24-hour cart reminder cron:", error);
  }
};

export const cartPaymentReminder72Hour = async () => {
  try {
    const { results: cartDetails } = await readRecord({
      table: tables.cart,
      selectFields: [
        "cart.user_id as user_id",
        'cart.cart_id as cart_id', 
        "CONCAT(ud.first_name, ' ', ud.last_name) AS user_name",
        "ad.admin_user_id as admin_id",
        "ad.email_id as mentor_email",
        "ad.crm_user as mentor_name",
        "ad.designation as mentor_designation",
        "ad.official_phone as mentor_wa",
        "ud.email_id",
        "ud.user_status",
        "cart.cart_items",
        "MAX(cart.updated_date) AS latest_added_date",
        "ud.first_name",
        "ud.last_name",
        "ud.phone_number as phone_number",
      ],
      conditions: [
        { field: "JSON_LENGTH(cart.cart_items)", operator: ">", value: 0 },
        {
          field: "cart.updated_date",
          operator: ">=",
          value: "(NOW() - INTERVAL 72 HOUR)",
          raw: true,
        },
        {
          field: "cart.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online')",
          raw: true,
        },
        { field: "ud.user_type", operator: "=", value: "1" },
        // { field: "ud.mentor_assigned", operator: "=", value: 196 },
        { field: "cart.cart_code IS NULL", operator: "", value: "", raw: true },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: `ud.user_id = cart.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = (CASE WHEN ud.user_status='Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
        },
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(updated_date) AS latest_date FROM ${tables.cart} GROUP BY user_id) latest`,
          on: "cart.user_id = latest.user_id AND cart.updated_date = latest.latest_date",
        },
      ],
      groupBy: ["cart.user_id"],
    });

    if (!cartDetails.length) {
      console.log("No new cart data found (72-hour cron).");
      return;
    }

    const user_ids = cartDetails.map((c) => c.user_id);

    // 🔔 Notification 860
    try {
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids,
          notification_id: 860,
          sent_via: "cron",
        }
      );
    } catch (err) {
      console.error("Notification 860 failed:", err.message);
    }

    const limit = pLimit(5);

    await Promise.all(
      cartDetails.map((cartDetail) =>
        limit(async () => {
          const cartItems = JSON.parse(cartDetail?.cart_items || "[]");

          const cartTotal = cartItems.reduce(
            (sum, item) => sum + (item.price_per_unit * item.quantity || 0),
            0
          );

          // MENTOR DETAILS
          const mentorName = cartDetail?.mentor_name || "Mansi";
          const mentorContact = cartDetail?.mentor_wa || "9619845139";
          const mentorDes =
            cartDetail?.mentor_designation || "Sr. Nutritionist";
          const mentorFullTitle = `${mentorDes} ${mentorName}`;

          // Product examples
          const productExamples = cartItems
            .slice(0, 3)
            .map((i) => i.product_name)
            .join(", ");

          const cart_list_html = cartItems
            .map(
              (item) => `
                <p style="margin:6px 0;font-size:14px;color:#444;">
                  • ${item.product_name} – Pack: ${item.pack_size} | Qty: ${item.quantity} | ₹${item.price_per_unit}
                </p>
              `
            )
            .join("");

          // 🔥 STATIC LINK — NO PAYMENT LINK
          const shopLink = `https://balancenutrition.in/shop?share=cc-${cartDetail?.cart_id}`

          // ===============================
          // AUTO CHAT MESSAGE
          // ===============================
          const chatMessage = ` 
            <p>Hi <strong>${cartDetail?.user_name}</strong>,</p><br>
            <p>Your selected <strong>BN-Approved Healthy Snacks and Meals</strong> are still saved in your cart.</p><br>
            <p>You can complete your purchase directly using this link:<br>
              <a href="${shopLink}">${shopLink}</a>
            </p><br>

            <p><strong>Cart Summary:</strong></p>
            ${cartItems
              .map(
                (item) => `
                  <p style="margin:6px 0;font-size:14px;color:#444;">
                    • ${item.product_name} – ${item.pack_size} | Qty: ${item.quantity} | ₹${item.price_per_unit}
                  </p>
                `
              )
              .join("")}

            <p><strong>Total:</strong> ₹${cartTotal}</p><br>

            <p>If you need help, please connect with <strong>${mentorFullTitle}</strong> on:<br>
            <strong>${mentorContact}</strong></p>
          `;

          await clientEnquiry.create({
            mentor_id: cartDetail?.admin_id,
            type: "broadcast",
            sender: "mentor",
            query: chatMessage,
            user_id: cartDetail?.user_id,
            name: mentorName,
          });

          // ===============================
          // EMAIL TEMPLATE
          // ===============================
          const emailHtml = `
            <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f9f9f9;padding:30px 10px;">
              <div style="max-width:600px;background:#fff;margin:0 auto;padding:25px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                
                <p style="font-size:16px;color:#333;">Hi <strong>${cartDetail?.user_name}</strong>,</p>

                <p style="font-size:15px;color:#555;">
                  You had added some <strong>BN-Approved Healthy Snacks and Meals</strong> including 
                  <strong>${productExamples}</strong>, but the checkout wasn’t completed.
                </p>

                <h3 style="font-size:17px;color:#333;font-weight:600;">Your Cart:</h3>

                <div style="background:#fdfdfd;padding:15px 20px;border-radius:8px;border:1px solid #eee;">
                  ${cart_list_html}

                  <p style="font-size:15px;font-weight:600;color:#333;margin-top:12px;">
                    Cart Total: ₹${cartTotal}
                  </p>
                </div>

                <p style="font-size:15px;color:#555;">
                  If you need any help, please reach out to 
                  <strong>${mentorFullTitle}</strong> at:<br>
                  <strong>${mentorContact}</strong>
                </p>

                <p style="font-size:15px;color:#555;">
                  To complete your purchase, please click here:<br>
                  <a href="${shopLink}" style="color:#007bff;">${shopLink}</a>
                </p>

                <p style="font-size:14px;color:#444;margin-top:25px;border-top:1px solid #eee;padding-top:15px;">
                  Warm regards,<br>
                  <strong>Team Balance Nutrition</strong>
                </p>
              </div>
            </div>
          `;

          await sendMailUtil({
            from: "support@balancenutrition.in",
            to: cartDetail?.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: [cartDetail?.mentor_email, "anchalsingh@balancenutrition.in"],
            subject: "Your BN Cart Is Waiting! Complete Your Order Today",
            html: emailHtml,
          });

          // ===============================
          // WATI TEMPLATE MESSAGE
          // ===============================
          try {
            const fullPhone = `${cartDetail?.phone_number?.replace(/\D/g, "")}`;

            await axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
              {
                template_name: "cart_reminder_72hour_final",
                broadcast_name: "cart_reminder_72hour_final",
                parameters: [
                  { name: "name", value: cartDetail.user_name },
                  {
                    name: "cart_summary",
                    value: cartItems
                      .map(
                        (i) =>
                          `${i.product_name} | Qty: ${i.quantity} | ₹${i.price_per_unit}`
                      )
                      .join(", "),
                  },
                  { name: "total_amount", value: cartTotal },

                  // 🔥 STATIC SHOP LINK
                  { name: "razorpay_link", value: shopLink },
                  { name: "razorpayId", value: "shop" },

                  { name: "mentor_name", value: mentorName },
                  { name: "mentor_wa", value: mentorContact },
                  {name: 'cartId', value: cartDetail?.cart_id }
                ],
              }
            );
          } catch (watiErr) {
            console.error("WATI error:", watiErr.message);
          }

          console.log(`72-hour reminder sent to ${cartDetail.user_name}`);
        })
      )
    );

    console.log(`Processed ${cartDetails.length} (72-hour) reminders.`);
  } catch (error) {
    console.error("Error in 72-hour cart reminder cron:", error);
  }
};

const sendWeeklyWedFriReferNotifications = async (req, res, next) => {
  try {
    const now = moment();
    const today = now.day(); // 3 = Wednesday, 5 = Friday

    // Only run on Wednesday or Friday
    const allowedDays = [3, 5];
    if (!allowedDays.includes(today)) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Not a scheduled day. No weekly notifications sent.",
      });

      return res
        ? res.status(200).send(apiResponse)
        : console.log(apiResponse.message);
    }

    // Fetch Active + Completed users with app version condition
    const { results: users } = await readRecord({
      selectFields: ["ud.user_id"],
      table: `${tables.userDetails} ud`,
      conditions: [
        {
          orConditions: [
            { field: "ud.user_status", operator: "=", value: "Active" },
            { field: "ud.user_status", operator: "=", value: "Completed" },
          ],
        },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        },
        { field: "ud.pro_notification", operator: "=", value: "0" },
      ],
    });

    if (!users.length) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No matching users found with correct status and app version.",
      });
      return res
        ? res.status(200).send(apiResponse)
        : console.log(apiResponse.message);
    }

    // -----------------------------------
    //     ALTERNATE NOTIFICATION IDs
    // -----------------------------------
    const weekNumber = now.isoWeek();
    const notificationId = (weekNumber + today) % 2 === 0 ? 845 : 846;
    // -----------------------------------

    const url = `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`;

    // Utility: chunking
    const chunk = (arr, size = 100) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    const allUserIds = users.map((u) => u.user_id);

    for (const slice of chunk(allUserIds)) {
      await axios
        .post(url, {
          user_ids: slice,
          notification_id: notificationId,
          sent_via: "cron",
        })
        .catch((err) => {
          console.error(
            `Error sending weekly alternating notification:`,
            err.message
          );
        });

      console.log(
        `Sent notification ${notificationId} to ${slice.length} users`
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Weekly alternating notification (${notificationId}) sent successfully to ${allUserIds.length} users.`,
    });

    return res
      ? res.status(200).send(apiResponse)
      : console.log(apiResponse.message);
  } catch (error) {
    console.error(error);
    const apiResponse = new ApiResponse({
      statusCode: 500,
      message: "Error while sending weekly wed/fri alternating notifications.",
    });

    return res
      ? res.status(500).send(apiResponse)
      : console.log(apiResponse.message);
  }
};

async function cartAddedNotPaidMails({ status }) {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
        { field: "admin_user_id", operator: "!=", value: 196 },
      ],
    });
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: [
          "ct.user_id",
          "ct.cart_items",
          "ct.updated_date as last_added_date",
        ],
        table: `${tables.cart} ct`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `ct.user_id = cd.user_id`,
          },
          {
            type: "LEFT",
            table: `${tables.productOrders} po`,
            on: `ct.user_id = po.user_id AND po.updated_at >= ct.updated_date`,
          },
          {
            type: "INNER",
            table: `(SELECT user_id, MAX(updated_date) as latest_date FROM ${tables.cart} GROUP BY user_id) latest_cart`,
            on: "ct.user_id = latest_cart.user_id AND ct.updated_date = latest_cart.latest_date",
          },
        ],
        conditions: [
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
          },
          { field: "JSON_LENGTH(ct.cart_items)", operator: ">", value: 0 },
          { field: "cd.user_status", operator: "=", value: status },
          {
            field: "DATE(ct.updated_date)",
            operator: ">=",
            value: `${moment().subtract(30, "days").format("YYYY-MM-DD")}`,
          },
          { field: "po.order_id", operator: "IS", value: "NULL", raw: true },
          { field: 'ct.cart_code', 
          operator: 'IS', 
          value: 'NULL', raw:true
          },
        ],
        groupBy: ["ct.user_id"],
        orderBy: ["ct.updated_date DESC"],
      });

      console.log(`Admin: ${admin.email_id}, Users Found: ${users.length}`);
      if (users.length == 0) {
        continue;
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
          extraMappings: {
            cart_details: {
              cart_items: user.cart_items,
              last_added_date: user.last_added_date,
            },
          },
        });
        return mappedData;
      });
      console.log(finalData, admin.email_id);
      const mailData = {
        from: "support@balancenutrition.in",
        to: admin.email_id,
        // to: "testerteam@balancenutrition.in",
        // to: "jitendra.desai@balancenutrition.in",
        subject: `Cart Added Not Paid - ${status} (Last 30 days) (COUNT: ${finalData.length})`,
        html: generateHorizontalUserTable(finalData),
        cc: [
          "khyatirupani@balancenutrition.in",
          "clientservices@balancenutrition.in",
          "anchalsingh@balancenutrition.in",
        ],
        bcc: ["testerteam@balancenutrition.in"],
      };
      await sendMailUtil(mailData);
      // break;
      console.log(mailData, admin.email_id);
    }
  } catch (error) {
    console.log("Error in cartAddedNotPaidMails:", error);
  }
}
// hamperDeliveredMails({ status: "Active" });
// hamperDeliveredMails({ status: "Completed" });
async function hamperDeliveredMails({ status }) {
  try {
    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
        // { field: "admin_user_id", operator: "=", value: 196 },
      ],
    });
    const statusConditions = [];
    if (status === "Active") {
      statusConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
    } else if (status === "Completed") {
      statusConditions.push({
        field: "cd.user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
    }
    for (const admin of admins) {
      const { results: users } = await readRecord({
        selectFields: [
          "po.user_id",
          "po.product_name",
          "po.pack_size",
          "po.delivery_date",
          "po.status",
        ],
        table: `${tables.productOrders} po`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `po.user_id = cd.user_id`,
          },
        ],
        conditions: [
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin.admin_user_id,
          },
          ...statusConditions,
          {
            field: "DATE(po.delivery_date)",
            operator: ">=",
            value: `${moment().subtract(30, "days").format("YYYY-MM-DD")}`,
          },
          {
            field: "po.status",
            operator: "=",
            value: "Delivered",
          },
          { field: "po.hamper_type", operator: "=", value: "birthday" },
        ],
        groupBy: ["po.user_id"],
        orderBy: ["po.delivery_date DESC"],
      });

      console.log(`Admin: ${admin.email_id}, Users Found: ${users.length}`);
      if (users.length == 0) {
        continue;
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserTableData({
          user,
          details: details[index],
          extraMappings: {
            hamper_details: {
              product_name: user.product_name,
              pack_size: user.pack_size,
              delivery_date: moment(user.delivery_date).format(
                "ddd MMM DD YYYY HH:mm:ss"
              ),
              status: user.status,
            },
          },
        });
        return mappedData;
      });
      console.log(finalData, admin.email_id);
      const mailData = {
        from: "support@balancenutrition.in",
        to: admin.email_id,
        // to: "testerteam@balancenutrition.in",
        // to: "jitendra.desai@balancenutrition.in",
        subject: `Birthday Hamper Delivered (Last 30 Days) - ${moment().format(
          "MMM-YY"
        )} - All ${status}`,
        html: generateHorizontalUserTable(finalData),
        cc: [
          "khyatirupani@balancenutrition.in",
          "clientservices@balancenutrition.in",
          "accounts@balancenutrition.in",
        ],
        bcc: ["testerteam@balancenutrition.in"],
      };
      await sendMailUtil(mailData);
      // break;
      console.log(mailData, admin.email_id);
    }
  } catch (error) {
    console.log("Error in cartAddedNotPaidMails:", error);
  }
}

// send pregnancy onhold payment reminders
export const sendPregnancyOnHoldPaymentReminder = async () => {
  try {
    const { results: expiringTodayUsers } = await readRecord({
      table: `${tables.onHoldClientPaidService} osp`,
      selectFields: [
        "osp.end_date as end_date",
        "ud.mentor_assigned as mentor_assigned",
        "ud.reminder_email as reminder_email", 
        "ad.crm_user as mentor_name",
        "ad.email_id as mentor_email",
        "ud.email_id as email_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "osp.payment_expiry as payment_expiry",
        "osp.days",
        "osp.note",
        "osp.reason",
        "osp.start_date as start_date",
        "CONCAT(osp.reason, ' - ', COALESCE(osp.note, '')) as break_reason",
        "ud.user_id",
        "ud.mentor_assigned",
        "osp.service_id",
        "osp.due_date as due_date",
        "pl.payment_link as short_url",
      ],
      conditions: [
        {
          field: "osp.reason",
          operator: "=",
          value: "Pregnancy",
        },
        {
          field: "ud.sub_user_status",
          operator: "!=",
          value: "Onhold",
        },
        {
          field: "osp.status",
          operator: "=",
          value: "Pending",
        },
        { field: "ud.notification_consent", operator: "=", value: 1 },
        {
          field: "osp.payment_expiry",
          operator: "=",
          value: moment().format("YYYY-MM-DD"), // today
        },
      ].filter(Boolean),

      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "osp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.payment_link_id=osp.payment_link_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
    });

    const { results: expiringTomorrowUsers } = await readRecord({
      table: `${tables.onHoldClientPaidService} osp`,
      selectFields: [
        "osp.end_date as end_date",
        "ud.mentor_assigned as mentor_assigned",
        "ud.reminder_email as reminder_email", 
        "ad.crm_user as mentor_name",
        "ad.email_id as mentor_email",
        "ud.email_id as email_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "osp.payment_expiry as payment_expiry",
        "osp.days",
        "osp.note",
        "osp.reason",
        "osp.start_date as start_date",
        "CONCAT(osp.reason, ' - ', COALESCE(osp.note, '')) as break_reason",
        "ud.user_id",
        "ud.mentor_assigned",
        "osp.service_id",
        "osp.due_date as due_date",
        "pl.payment_link as short_url",
      ],
      conditions: [
        {
          field: "osp.reason",
          operator: "=",
          value: "Pregnancy",
        },
        {
          field: "ud.sub_user_status",
          operator: "!=",
          value: "Onhold",
        },
        {
          field: "osp.status",
          operator: "=",
          value: "Pending",
        },
        {
          field: "osp.payment_expiry",
          operator: "=",
          value: moment().add(1, "days").format("YYYY-MM-DD"), // tomorrow
        },
      ].filter(Boolean),

      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "osp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.payment_link_id=osp.payment_link_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
    });

    const { results: expiringDayAfterTomorrowUsers } = await readRecord({
      table: `${tables.onHoldClientPaidService} osp`,
      selectFields: [
        "osp.end_date as end_date",
        "ud.mentor_assigned as mentor_assigned",
        "ad.crm_user as mentor_name",
        "ud.reminder_email as reminder_email", 
        "ad.email_id as mentor_email",
        "ud.email_id as email_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "osp.payment_expiry as payment_expiry",
        "osp.days",
        "osp.note",
        "osp.reason",
        "osp.start_date as start_date",
        "CONCAT(osp.reason, ' - ', COALESCE(osp.note, '')) as break_reason",
        "ud.user_id",
        "ud.mentor_assigned",
        "osp.service_id",
        "osp.due_date as due_date",
        "pl.payment_link as short_url",
      ],
      conditions: [
        {
          field: "osp.reason",
          operator: "=",
          value: "Pregnancy",
        },
        {
          field: "ud.sub_user_status",
          operator: "!=",
          value: "Onhold",
        },
        {
          field: "osp.status",
          operator: "=",
          value: "Pending",
        },
        {
          field: "osp.payment_expiry",
          operator: "=",
          value: moment().add(2, "days").format("YYYY-MM-DD"), // day after tomorrow
        },
      ].filter(Boolean),

      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "osp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.payment_link_id=osp.payment_link_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
    });

    const { results: expiringInThreeDaysUsers } = await readRecord({
      table: `${tables.onHoldClientPaidService} osp`,
      selectFields: [
        "osp.end_date as end_date",
        "ud.mentor_assigned as mentor_assigned",
        "ad.crm_user as mentor_name",
        "ud.reminder_email as reminder_email", 
        "ad.email_id as mentor_email",
        "ud.email_id as email_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "osp.payment_expiry as payment_expiry",
        "osp.days",
        "osp.note",
        "osp.reason",
        "osp.start_date as start_date",
        "CONCAT(osp.reason, ' - ', COALESCE(osp.note, '')) as break_reason",
        "ud.user_id",
        "ud.mentor_assigned",
        "osp.service_id",
        "osp.due_date as due_date",
        "pl.payment_link as short_url",
      ],
      conditions: [
        {
          field: "osp.reason",
          operator: "=",
          value: "Pregnancy",
        },
        {
          field: "ud.sub_user_status",
          operator: "!=",
          value: "Onhold",
        },
        {
          field: "osp.status",
          operator: "=",
          value: "Pending",
        },
        {
          field: "osp.payment_expiry",
          operator: "=",
          value: moment().add(3, "days").format("YYYY-MM-DD"), // today + 3
        },
      ].filter(Boolean),

      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "osp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.payment_link_id=osp.payment_link_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
    });

    const { results: expiringInFourDaysUsers } = await readRecord({
      table: `${tables.onHoldClientPaidService} osp`,
      selectFields: [
        "osp.end_date as end_date",
        "ud.reminder_email as reminder_email", 
        "ud.mentor_assigned as mentor_assigned",
        "ad.crm_user as mentor_name",
        "ad.email_id as mentor_email",
        "ud.email_id as email_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "osp.payment_expiry as payment_expiry",
        "osp.days",
        "osp.note",
        "osp.reason",
        "osp.start_date as start_date",
        "CONCAT(osp.reason, ' - ', COALESCE(osp.note, '')) as break_reason",
        "ud.user_id",
        "ud.mentor_assigned",
        "osp.service_id",
        "osp.due_date as due_date",
        "pl.payment_link as short_url",
      ],
      conditions: [
        {
          field: "osp.reason",
          operator: "=",
          value: "Pregnancy",
        },
        {
          field: "ud.sub_user_status",
          operator: "!=",
          value: "Onhold",
        },
        {
          field: "osp.status",
          operator: "=",
          value: "Pending",
        },
        {
          field: "osp.payment_expiry",
          operator: ">=",
          value: moment().add(4, "days").format("YYYY-MM-DD"), // today
        },
      ].filter(Boolean),

      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "osp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.payment_link_id=osp.payment_link_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
    });

    console.log(expiringTodayUsers?.length, "Expiring Today");
    console.log(expiringTomorrowUsers?.length, "Expiring Tomorrow");
    console.log(
      expiringDayAfterTomorrowUsers?.length,
      "Expiring Day After Tomorrow"
    );
    console.log(expiringInThreeDaysUsers?.length, "Expiring In Three Days");
    console.log(expiringInFourDaysUsers?.length, "Expiring In Four Days");

    let notificationTypeArr = [];

    notificationTypeArr.push({
      userIds: expiringTodayUsers.map((user) => user.user_id),
      notificationId: 899,
    });
    notificationTypeArr.push({
      userIds: expiringTomorrowUsers.map((user) => user.user_id),
      notificationId: 898,
    });
    notificationTypeArr.push({
      userIds: expiringDayAfterTomorrowUsers.map((user) => user.user_id),
      notificationId: 897,
    });
    notificationTypeArr.push({
      userIds: expiringInThreeDaysUsers.map((user) => user.user_id),
      notificationId: 896,
    });
    notificationTypeArr.push({
      userIds: expiringInFourDaysUsers.map((user) => user.user_id),
      notificationId: 895,
    });

    console.log(notificationTypeArr, "notificationTypeArr");

    // send reminder notifications
    notificationTypeArr.forEach(async (notification) => {
      try {
        if (notification.userIds.length > 0) {
          await axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: notification.userIds,
              notification_id: notification.notificationId,
              sent_via: "cron",
            }
          );
        }
      } catch (error) {
        console.log(
          `ERROR in SENDING NOTIFICATION: ${notification.notificationId} `,
          error
        );
      }
    });

    // auto chat
    expiringInFourDaysUsers.forEach(async (user) => {
      const chatMessage = `<p>Hi ${user.client_name || "User"},</p> 
        <p>Hope you’re feeling okay today. Just sending a soft reminder about the pending pregnancy freeze payment.<br>
        Once it’s completed, we’ll activate your pregnancy freeze and begin sharing trimester-wise updates and tips to support you gently through this phase.</p>
        
        <p><b>Mode of Payment:</b> ${
          user?.short_url ? "Payment Link" : "Bank Transfer"
        }
           ${
             user?.short_url
               ? `<b>Payment Link:</b> <a href="${
                   user.short_url
                 }" target="_blank">${user.short_url}</a> (Valid till: ${moment(
                   user.payment_expiry
                 ).format("DD-MM-YYYY")})`
               : ""
           }
        </p>

        <p> ${user?.short_url ? "Or you may pay via Bank Transfer:" : ""} <br> 
        <b>Bank Name:</b> Kotak Mahindra Bank <br>
        <b>Account Type:</b> Current Account <br>
        <b>Account Holder Name:</b> Balance Nutrition <br>
        <b>Account Number:</b> 1611692202 <br>
        <b>IFSC Code:</b> KKBK0000667 <br>
        <b>Branch:</b> Dr. Ambedkar Road, Khar West, Mumbai
        </p>
        <p>For any doubts, please call or WhatsApp us.</p>
        `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned || 0,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name || "Mentor",
      });
    });

    expiringInThreeDaysUsers.forEach(async (user) => {
      const chatMessage = `<p>Hi ${user.client_name || "User"},</p> 
        <p>Hope you're doing fine. Just sending a reminder about the pregnancy freeze payment.<br>
        As soon as it’s confirmed, we’ll freeze your plan and begin sending simple guidance and helpful notes for this stage.</p>
        
        <p><b>Mode of Payment:</b> ${
          user?.short_url ? "Payment Link" : "Bank Transfer"
        }
           ${
             user?.short_url
               ? `<b>Payment Link:</b> <a href="${
                   user.short_url
                 }" target="_blank">${user.short_url}</a> (Valid till: ${moment(
                   user.payment_expiry
                 ).format("DD-MM-YYYY")})`
               : ""
           }
        </p>

        <p> ${user?.short_url ? "Or you may pay via Bank Transfer:" : ""} <br> 
        <b>Bank Name:</b> Kotak Mahindra Bank <br>
        <b>Account Type:</b> Current Account <br>
        <b>Account Holder Name:</b> Balance Nutrition <br>
        <b>Account Number:</b> 1611692202 <br>
        <b>IFSC Code:</b> KKBK0000667 <br>
        <b>Branch:</b> Dr. Ambedkar Road, Khar West, Mumbai
        </p>
        <p>For any doubts, please call or WhatsApp us.</p>
        `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned || 0,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name || "Mentor",
      });
    });

    expiringDayAfterTomorrowUsers.forEach(async (user) => {
      const chatMessage = `<p>Hi ${user.client_name || "User"},</p> 
        <p>Hope you're taking good care of yourself.<br>
        Your pregnancy freeze is still pending activation. Once the payment is done, we’ll start sending trimester updates,  nutrition tips to support you through this crucial phase.</p>
        
        <p><b>Mode of Payment:</b> ${
          user?.short_url ? "Payment Link" : "Bank Transfer"
        }
           ${
             user?.short_url
               ? `<b>Payment Link:</b> <a href="${
                   user.short_url
                 }" target="_blank">${user.short_url}</a> (Valid till: ${moment(
                   user.payment_expiry
                 ).format("DD-MM-YYYY")})`
               : ""
           }
        </p>

        <p> ${user?.short_url ? "Or you may pay via Bank Transfer:" : ""} <br> 
        <b>Bank Name:</b> Kotak Mahindra Bank <br>
        <b>Account Type:</b> Current Account <br>
        <b>Account Holder Name:</b> Balance Nutrition <br>
        <b>Account Number:</b> 1611692202 <br>
        <b>IFSC Code:</b> KKBK0000667 <br>
        <b>Branch:</b> Dr. Ambedkar Road, Khar West, Mumbai
        </p>
        <p>For any doubts, please call or WhatsApp us.</p>
        `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned || 0,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name || "Mentor",
      });
    });

    expiringTomorrowUsers.forEach(async (user) => {
      const chatMessage = `<p>Hi ${user.client_name || "User"},</p> 
        <p>Hope you’re feeling alright today.<br>
        Just sending a small reminder about your pregnancy freeze payment. Once completed, we’ll take care of everything on your behalf and begin your pregnancy support updates. <br>
        Just keeping you updated with love.
        </p>
        
        <p><b>Mode of Payment:</b> ${
          user?.short_url ? "Payment Link" : "Bank Transfer"
        }
           ${
             user?.short_url
               ? `<b>Payment Link:</b> <a href="${
                   user.short_url
                 }" target="_blank">${user.short_url}</a> (Valid till: ${moment(
                   user.payment_expiry
                 ).format("DD-MM-YYYY")})`
               : ""
           }
        </p>

        <p> ${user?.short_url ? "Or you may pay via Bank Transfer:" : ""} <br> 
        <b>Bank Name:</b> Kotak Mahindra Bank <br>
        <b>Account Type:</b> Current Account <br>
        <b>Account Holder Name:</b> Balance Nutrition <br>
        <b>Account Number:</b> 1611692202 <br>
        <b>IFSC Code:</b> KKBK0000667 <br>
        <b>Branch:</b> Dr. Ambedkar Road, Khar West, Mumbai
        </p>
        <p>For any doubts, please call or WhatsApp us.</p>
        `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned || 0,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name || "Mentor",
      });
    });

    expiringTodayUsers.forEach(async (user) => {
      const chatMessage = `<p>Hi ${user.client_name || "User"},</p> 
        <p>I hope you’re feeling okay today and taking care of yourself. <br>
        Just a small reminder from my side, your pregnancy freeze payment is still pending. <br>
        Once it’s completed, you’ll start receiving gentle trimester tips and small supportive messages just to keep you motivated and connected through this precious phase.</p>
        
        <p><b>Mode of Payment:</b> ${
          user?.short_url ? "Payment Link" : "Bank Transfer"
        }
           ${
             user?.short_url
               ? `<b>Payment Link:</b> <a href="${
                   user.short_url
                 }" target="_blank">${user.short_url}</a> (Valid till: ${moment(
                   user.payment_expiry
                 ).format("DD-MM-YYYY")})`
               : ""
           }
        </p>

        <p> ${user?.short_url ? "Or you may pay via Bank Transfer:" : ""} <br> 
        <b>Bank Name:</b> Kotak Mahindra Bank <br>
        <b>Account Type:</b> Current Account <br>
        <b>Account Holder Name:</b> Balance Nutrition <br>
        <b>Account Number:</b> 1611692202 <br>
        <b>IFSC Code:</b> KKBK0000667 <br>
        <b>Branch:</b> Dr. Ambedkar Road, Khar West, Mumbai
        </p>
        <p>For any doubts, please call or WhatsApp us.</p>
        `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned || 0,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name || "Mentor",
      });
    });
  } catch (error) {
    console.log("ERROR IN sending pregnancy onhold payment reminders", error);
  }
};


export const sendPostpartumRestartAssessmentReminder = async () => {
  try {
    // Helper function to generate auto chat message
    const generateRestartAutoChat = (user, daysRemaining, hasPostPregnancyData) => {
      const callLink = "https://www.balancenutrition.in/app_link/screen_id=29/call_type=45";
      const formLink = "https://www.balancenutrition.in/app_link/screen_id=212";
    
      if (hasPostPregnancyData) {
        return `<p>Hi ${user.client_name || "User"},</p> 
          <p>${getGreetingMessage(daysRemaining, user)}</p>
          <p>Schedule a call with your mentor before starting again: <a href="${callLink}" target="_blank"><u>${callLink}</u></a></p>`;
      }
    
      return `<p>Hi ${user.client_name || "User"},</p> 
        <p>${getAssessmentMessage(daysRemaining, user)}</p>
        <p><a href="${formLink}" target="_blank"><u>Click here to fill the assessment form</u></a></p>
        <p>OR</p>
        <p>Schedule a call with your mentor before starting again: <a href="${callLink}" target="_blank"><u>${callLink}</u></a></p>`;
    };
    
    // Helper function to get greeting message based on days remaining
    const getGreetingMessage = (days, user) => {
      switch (days) {
        case 7:
        case 6:
          return "Hope you and your little one are doing well.";
        case 5:
          return "Hope you're doing well today.";
        case 4:
          return "Hope you and your little one are doing okay.";
        case 3:
          return "How are you feeling today?";
        case 2:
          return "Hope you and your little one are doing well today.";
        case 1:
          return "Hope you and the baby are doing well today.";
        default:
          return "Hope you're doing well.";
      }
    };
    
    // Helper function to get assessment message based on days remaining
    const getAssessmentMessage = (days, user) => {
      switch (days) {
        case 7:
        case 6:
          return "Hope you and your little one are doing well. Before we restart your plan, we've shared a few questions in your BN App. These will help us prepare your postpartum plan correctly.";
        case 5:
          return "Hope you're doing well today. Your restart is just a few days away, and we've shared some questions in your BN App. Filling them in will help us understand and prepare your next plan accordingly.";
        case 4:
          return "Hope you and your little one are doing okay. Just a quick reminder, we've shared a few assessment questions in your BN App that we need before to start your plan again. These details help us understand your routine before restarting, so please check and update them when possible.";
        case 3:
          return "How are you feeling today? A short reminder to fill the assessment form in your BN App. These inputs on your recovery and feeding pattern help us prepare your upcoming plan smoothly. Please check and fill them.";
        case 2:
          return "Hope you and your little one are doing well today.<br>We're getting closer to your restart, and your mentor needs a few updated details before we begin again. You'll find a short set of assessment questions in your BN App. These help us understand your recovery, feeding pattern, and current routine.";
        case 1:
          return "Hope you and the baby are doing well today.<br>Your restart begins tomorrow, and before we get started, we need a quick update from you. Please fill in the questions we've shared in your BN App. Your responses help your mentor prepare your plan accurately and ensure a smooth restart.";
        default:
          return "Please check the assessment questions in your BN App.";
      }
    };
    
    // Helper function to fetch users by days remaining
    const fetchUsersByDays = async (daysToAdd) => {
      return await readRecord({
        table: `${tables.onHoldClientPaidService} osp`,
        selectFields: [
          "osp.end_date",
          "ud.user_id",
          "ud.mentor_assigned",
          "ad.crm_user as mentor_name",
          "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
          "osp.sub_order_id",
          "ppd.id",
        ],
        conditions: [
          {
            field: "ud.mentor_assigned", 
            operator: "=", 
            value: 196
          },
          {
            field: "osp.reason",
            operator: "=",
            value: "Pregnancy",
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "osp.status",
            operator: "=",
            value: "Success",
          },
          {
            field: "osp.end_date",
            operator: "=",
            value: moment().add(daysToAdd, "days").format("YYYY-MM-DD"),
          },
        ].filter(Boolean),
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "osp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ud.mentor_assigned = ad.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.postPregnancyData} ppd`,
            on: "osp.user_id = ppd.user_id AND osp.sub_order_id = ppd.sub_order_id",
          },
        ],
      });
    };
    
    // Helper function to send auto chat
    const sendAutoChat = async (users, daysRemaining) => {
      users.forEach(async (user) => {
        const hasPostPregnancyData = !!user.post_pregnancy_data_id;
        const chatMessage = generateRestartAutoChat(user, daysRemaining, hasPostPregnancyData);
    
        await clientEnquiry.create({
          mentor_id: user.mentor_assigned || 0,
          type: "broadcast",
          sender: "mentor",
          query: chatMessage,
          user_id: user.user_id,
          name: user.mentor_name || "Mentor",
        });
      });
    };

    // Configuration for each day
    const daysConfig = [
      { days: 7, notificationId: 1018, label: "Seven Days" },
      { days: 6, notificationId: 1019, label: "Six Days" },
      { days: 5, notificationId: 1020, label: "Five Days" },
      { days: 4, notificationId: 1022, label: "Four Days" },
      { days: 3, notificationId: 1024, label: "Three Days" },
      { days: 2, notificationId: 1026, label: "Two Days" },
      { days: 1, notificationId: 1027, label: "Tomorrow" },
    ];

    // Fetch all users for different days
    const usersData = await Promise.all(
      daysConfig.map(async (config) => {
        const { results } = await fetchUsersByDays(config.days);
        console.log(results[0], 'First Data', config);  
        console.log(results?.length, `Expiring In ${config.label}`);
        return { ...config, users: results || [] };
      })
    );

    // Prepare notification array
    const notificationTypeArr = usersData.map((data) => ({
      userIds: data.users.map((user) => user.user_id),
      notificationId: data.notificationId,
    }));

    console.log(notificationTypeArr, "notificationTypeArr");

    // Send reminder notifications
    await Promise.all(
      notificationTypeArr.map(async (notification) => {
        try {
          if (notification.userIds.length > 0) {
            await axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: notification.userIds,
                notification_id: notification.notificationId,
                sent_via: "cron",
              }
            );
          }
        } catch (error) {
          console.log(
            `ERROR in SENDING NOTIFICATION: ${notification.notificationId}`,
            error
          );
        }
      })
    );

    // Send auto chats for all days
    await Promise.all(
      usersData.map(async (data) => {
        if (data.users.length > 0) {
          await sendAutoChat(data.users, data.days);
        }
      })
    );

  } catch (error) {
    console.log(
      "ERROR IN sending postpartum restart assessment reminders",
      error
    );
  }
};

export const sendBNSnackNotificationNewJoinees = async()=> {
  try {
    
    const {results} = await readRecord({
      table: `${tables.userDetails} ud`, 
      selectFields: [
        'ud.user_id', 
      ], 
      joins: [
        {
          type: 'LEFT', 
          table: `${tables.adminUsers} au`,
          on: 'ud.mentor_assigned = au.admin_user_id'
        },
        {
          type: 'LEFT', 
          table: `${tables.subOrderPrograms} sop`,
          on: 'sop.sub_order_id = ud.active_order_id'
        },
        {
          type: 'LEFT', 
          table: `${tables.dietSessionLog} dsl`,
          on: 'dsl.sub_order_id = sop.sub_order_id'
        },

      ],
      conditions: [
        {field: "ud.sub_user_status", operator:'=', value: 'Active'},
        {field: "ud.pro_notification", operator:'=', value: 0},
        {field: "ud.country_id", operator:'=', value: 101},
        {field: "sop.program_status", operator:'=', value: '1'},
        {field: "sop.order_type", operator:'IN', value: ['New', 'OCR']},
        {field: 'sop.program_type', operator: "=", value: '0'},
        {field: "sop.sent_sessions", operator:'IN', value: "(1, 2)" ,raw: true},
        {field: "dsl.diet_start_date", operator:'=', value: 'CASE WHEN dsl.session=1 THEN CURDATE() - iNTERVAL 3 DAY WHEN dsl.session=2 THEN CURDATE() - iNTERVAL 7 DAY END', raw:true},
      ]

    })

    if (results.length<0) {
      console.log('No users with this condition found'); 
      return ; 
    }
    
    const userIds = results.map((result)=> result.user_id); 

    await axios.post(
      `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
      {
        user_ids: userIds,
        notification_id: 1072,
        sent_via: "cron",
      }
    )
    
  } catch (error) {
    console.log("Error in sendBNSnackAutoChatNewJoinees:", error);
  }

}

export const dietShoppingListNotification1hr = async()=> {
  try {   
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        'dsl.diet_details_id',
        'ud.first_name',
        'dsl.session', 
        'ud.pro_notification', 
        'au.admin_user_id as mentor_assigned', 
        'au.crm_user as mentor_name', 
        'ud.user_id',
        'ud.email_id',
        'au.email_id as mentor_email',
      ],
      joins: [
        {
          type: 'LEFT',
          table: `${tables.adminUsers} au`,
          on: 'ud.mentor_assigned = au.admin_user_id'
        },
        {
          type: 'LEFT',
          table: `${tables.subOrderPrograms} sop`,
          on: 'sop.sub_order_id = ud.active_order_id'
        },
        {
          type: 'LEFT',
          table: `${tables.dietSessionLog} dsl`,
          on: 'dsl.sub_order_id = sop.sub_order_id and dsl.session = sop.sent_sessions'
        },
      ],

      conditions: [
        { field: "ud.sub_user_status", operator: '=', value: 'Active' },
        { field: "ud.pro_notification", operator: '=', value: 0 },
        { field: "ud.country_id", operator: '=', value: 101 },
        { field: "sop.program_status", operator: '=', value: '1' },
        { field: 'sop.program_type', operator: "=", value: '0' },
        {field: " dsl.diet_status", operator: "=", value: 4},
        { field: 'dsl.diet_sent_date', operator: '>=', value: 'NOW() - INTERVAL 1 HOUR', raw: true },
        { field: 'dsl.diet_sent_date', operator: '<', value: 'NOW()', raw: true}
      ]
    });

    if (results.length===0) {
      console.log('No users with this condition found', results.length);
      return;
    }

    console.log(`Found ${results.length} users to process`);

    // const filteredResults = [{
    //   diet_details_id: '69574d81ccf5a1868368fb42',
		// 	first_name: "Bhaskar",
		// 	session: 4,
		// 	pro_notification: 0,
		// 	mentor_assigned: 196,
		// 	mentor_name: "NikitaK",
    //   mentor_email: "mentor.nikita@balancenutrition.in",
    //   email_id: 'bhaskar.gautam@balancenutrition.in',
		// 	user_id: 127054
    // }]

    // console.log(filteredResults, 'filteredResults') ;
    
    // const cartItemsList = await createCartFromDietSent(filteredResults); 
    const cartItemsList = await createCartFromDietSent(results); 


    // Prepare notification data
    let autoChats = [];
    let notiIds = [];
    let emailPromises = [];
    
    for (let user of results) {
      if (user.pro_notification === 0) notiIds.push(user.user_id);
      
      const cartLink = `https://balancenutrition.in/shop?share=${cartItemsList[user.user_id]?.cart_code}`; 
      const dietRedirectLink = `https://www.balancenutrition.in/app_link/screen_id=13/redirect_id=${user.diet_details_id}`;

      // Generate autochat
      const autochat = generateDietCartAutoChat({
        clientName: user.first_name, 
        dietSessionName: user.session, 
        dietSessionLink: dietRedirectLink, 
        orderLink: cartLink,  
        cartItems: cartItemsList[user.user_id].cart_items 
      }); 
      
      autoChats.push({
        mentor_id: user.mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: autochat,
        user_id: user.user_id,
        name: user.mentor_name,
      });

      // Generate email HTML
      const emailHTML = generateDietShoppingEmail1hr({
        clientName: user.first_name,
        sessionNumber: user.session,
        sessionLink: dietRedirectLink,
        products: cartItemsList[user.user_id].cart_items,
        orderLink: cartLink,
      });

      // Create email promise
      emailPromises.push(
        sendMailUtil({
          from: "support@balancenutrition.in",
          to: user.email_id,
          cc: ["clientservices@balancenutrition.in"],
          bcc: [user.mentor_email],
          subject: "Your Diet Shopping List Is Ready",
          html: emailHTML,
        })
      );
    } 
  

    // Send all emails in parallel
    if (emailPromises.length > 0) {
      try {
        await Promise.all(emailPromises);
        console.log(`Successfully sent ${emailPromises.length} emails`);
      } catch (error) {
        console.log("Error sending emails:", error);
      }
    }

    // Insert auto chats
    if (autoChats.length > 0) {
      await clientEnquiry.insertMany(autoChats); 
    }
    
    // Send notifications
    if (notiIds.length > 0) {
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: notiIds,
            notification_id: 1104,
            sent_via: "cron",
          }
        );
      } catch (e) {
        console.log("Notification send failed:", e);
      }
    }
    
  } catch (error) {
    console.log("dietShoppingListNotification1hr", error);
  }
}

export const dietShoppingList45MinStartDate = async()=> {
  try {   
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        'dsl.diet_details_id',
        'ud.first_name',
        'dsl.session', 
        'ud.pro_notification', 
        'au.admin_user_id as mentor_assigned', 
        'au.crm_user as mentor_name', 
        'ct.cart_code', 
        'ud.user_id',
        'ud.email_id',
        'au.email_id as mentor_email',
      ],
      joins: [
        {
          type: 'LEFT',
          table: `${tables.adminUsers} au`,
          on: 'ud.mentor_assigned = au.admin_user_id'
        },
        {
          type: 'LEFT',
          table: `${tables.subOrderPrograms} sop`,
          on: 'sop.sub_order_id = ud.active_order_id'
        },
        {
          type: 'LEFT',
          table: `${tables.dietSessionLog} dsl`,
          on: 'dsl.sub_order_id = sop.sub_order_id and dsl.session = sop.sent_sessions'
        },
        {
          type: 'LEFT',
          table: `${tables.cart} ct`,
          on: 'ct.user_id = ud.user_id'
        },
      ],
      conditions: [
        { field: "ud.sub_user_status", operator: '=', value: 'Active' },
        { field: "ud.pro_notification", operator: '=', value: 0 },
        { field: "ud.country_id", operator: '=', value: 101 },
        { field: "sop.program_status", operator: '=', value: '1' },
        // { field: "ud.mentor_assigned", operator: "=", value: 196},
        {field: 'sop.program_type', operator: "=", value: '0' },
        {field: "dsl.diet_status", operator: "=", value: 4},
        {field: 'dsl.update_date', operator: '>=', value: 'NOW() - INTERVAL 1 HOUR', raw: true },
        {field: 'ct.cart_code', operator: 'IS NOT', value: 'NULL', raw:true},
        {field: 'ct.cart_code', operator: 'LIKE', value: "'%dd-%'", raw:true},
        {field: 'DATE(dsl.update_date)', operator: '<', value: 'dsl.diet_start_date', raw: true}
      ]
    });

    if (results.length === 0) {
      console.log('No users with this condition found');
      return;
    }
    console.log(`Found ${results.length} users to process`);

    // Prepare notification data
    let autoChats = [];
    let notiIds = [];
    let emailPromises = [];
	
	  // const filteredResults =  [
		//   {
		//   	diet_details_id: "69574d81ccf5a1868368fb42",
		//   	first_name: "Bhaskar",
		//   	session: 4,
		//   	pro_notification: 0,
		//   	mentor_assigned: 196,
		//   	mentor_name: "NikitaK",
		//   	cart_code: "dd-jrkc1m6h",
		//   	user_id: 127054,
		//   	email_id: "bhaskar.gautam@balancenutrition.in",
		//   	mentor_email: "mentor.nikitak@balancenutrition.in"
		//   }
	  // ]

    
    for (let user of results) {
      if (user.pro_notification === 0) notiIds.push(user.user_id);
      
      const cartLink = `https://balancenutrition.in/shop?share=${user.cart_code}`; 
      
      // Generate autochat
      const autochat = generateDietCartAutoChatFor45Min({
        clientName: user.first_name, 
        orderLink: cartLink,  
      }); 
      
      autoChats.push({
        mentor_id: user.mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: autochat,
        user_id: user.user_id,
        name: user.mentor_name,
      });

      // Generate reminder email HTML
      const emailHTML = generateDietShoppingReminderEmail45min({
        clientName: user.first_name,
        sessionNumber: user.session,
        orderLink: cartLink,
      });

      // Create email promise
      emailPromises.push(
        sendMailUtil({
          from: "support@balancenutrition.in",
          to: user.email_id,
          cc: ["clientservices@balancenutrition.in"],
          bcc: [user.mentor_email],
          subject: "Reminder: Your Diet Shopping List",
          html: emailHTML,
        })
      );
    } 
    
    console.log(autoChats.length, notiIds, 'auto chat'); 

    // Send all emails in parallel
    if (emailPromises.length > 0) {
      try {
        await Promise.all(emailPromises);
        console.log(`Successfully sent ${emailPromises.length} reminder emails`);
      } catch (error) {
        console.log("Error sending reminder emails:", error);
      }
    }

    // Insert auto chats
    if (autoChats.length > 0) {
      await clientEnquiry.insertMany(autoChats); 
    }
    
    // Send notifications
    if (notiIds.length > 0) {
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: notiIds,
            notification_id: 1105,
            sent_via: "cron",
          }
        );
      } catch (error) {
        console.log("Notification send failed:", error);
      }
    }
    
  } catch (error) {
    console.log("dietShoppingList45MinStartDate", error);
  }
}

export const setHotLeadFollowUps = async () => {
  try {
    const today = moment().format("YYYY-MM-DD");
    const tomorrow = moment().add(1, "days").format("YYYY-MM-DD");

    const { results: hotLeads } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id", "ud.counsellor_assigned"],
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} lfu`,
          on: "ud.user_id = lfu.user_id",
        },
      ],
      conditions: [
        { field: "ud.sales_status", operator: "=", value: 2 },
        { field: "ud.user_status", operator: "=", value: "Lead" },
        { field: "ud.counsellor_assigned", operator: "!=", value: 196 },
        {
          field: "ud.counsellor_assigned",
          operator: "IN",
          value: [274, 315, 316],
        },
        {
          orConditions: [
            { field: "lfu.follow_up_status", operator: "=", value: 0 },
            { field: "lfu.follow_up_status", operator: "IS", value: null },
          ],
        },
        {
          orConditions: [
            { field: "lfu.follow_up_date", operator: "<=", value: today },
            { field: "lfu.follow_up_date", operator: "IS", value: null },
          ],
        },
      ],
      groupBy: ["ud.user_id"],
    });

    if (!hotLeads.length) return;

    // 2️⃣ Remove users who already have future follow-ups
    const userIds = hotLeads.map((u) => u.user_id);
    const { results: existingFutureFU } = await readRecord({
      table: tables.leadFollowUpLogs,
      selectFields: ["user_id"],
      conditions: [
        { field: "user_id", operator: "IN", value: userIds },
        { field: "follow_up_status", operator: "=", value: 0 },
        { field: "follow_up_date", operator: ">=", value: tomorrow },
      ],
      groupBy: ["user_id"],
    });

    const blockedUserIds = new Set(
      existingFutureFU.map((r) => r.user_id),
    );

    const rows = [];
    for (const lead of hotLeads) {
      if (blockedUserIds.has(lead.user_id)) continue;

      const mentorId = lead.counsellor_assigned;
      rows.push([
        lead.user_id,
        0,           
        1,           
        tomorrow,    
        mentorId,    
        mentorId,    
        "CRON",      
      ]);
    }

    if (!rows.length) return;

    console.log(rows, 'rows'); 

    // Insert into leadFollowUpLogs 
    await bulkInsertRecords(
      tables.leadFollowUpLogs,
      [
        "user_id",
        "slot_id",
        "type",
        "follow_up_date",
        "added_by",
        "assigned_to",
        "source",
      ],
      rows,
    );

    // Insert into call_updates table
    const callUpdateRows = rows.map(row => [
      row[0],
      "14",
      "Lead",
      "",
      0,
      row[4],
      "CRON",
      0,
      row[3]
    ]);

    await bulkInsertRecords(
      tables.callUpdates,
      [
        "user_id",
        "call_type", 
        "user_type",
        "comment",
        "call_status",
        "added_by",
        "source",
        "slot_id",
        "schedule_date",
      ],
      callUpdateRows,
    );

  } catch (error) {
    console.error("setHotLeadFollowUps error:", error);
  }
};
 
export const setWarmLeadFollowUps = async () => {
  try {
    const today = moment().format("YYYY-MM-DD");
    const tomorrow = moment().add(1, "days").format("YYYY-MM-DD");

    const { results: hotLeads } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id", "ud.counsellor_assigned"],
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} lfu`,
          on: "ud.user_id = lfu.user_id",
        },
      ],
      conditions: [
        { field: "ud.sales_status", operator: "=", value: 3 },
        { field: "ud.user_status", operator: "=", value: "Lead" },
        { field: "ud.counsellor_assigned", operator: "!=", value: 196 },
        {
          field: "ud.counsellor_assigned",
          operator: "IN",
          value: [274, 315, 316],
        },
        {
          orConditions: [
            { field: "lfu.follow_up_status", operator: "=", value: 0 },
            { field: "lfu.follow_up_status", operator: "IS", value: null },
          ],
        },
        {
          orConditions: [
            { field: "lfu.follow_up_date", operator: "<=", value: today },
            { field: "lfu.follow_up_date", operator: "IS", value: null },
          ],
        },
      ],
      groupBy: ["ud.user_id"],
    });

    if (!hotLeads.length) return;

    // 2️⃣ Remove users who already have future follow-ups
    const userIds = hotLeads.map((u) => u.user_id);
    const { results: existingFutureFU } = await readRecord({
      table: tables.leadFollowUpLogs,
      selectFields: ["user_id"],
      conditions: [
        { field: "user_id", operator: "IN", value: userIds },
        { field: "follow_up_status", operator: "=", value: 0 },
        { field: "follow_up_date", operator: ">=", value: tomorrow },
      ],
      groupBy: ["user_id"],
    });

    const blockedUserIds = new Set(
      existingFutureFU.map((r) => r.user_id),
    );

    const rows = [];
    for (const lead of hotLeads) {
      if (blockedUserIds.has(lead.user_id)) continue;

      const mentorId = lead.counsellor_assigned;
      rows.push([
        lead.user_id,
        0,           
        1,           
        tomorrow,    
        mentorId,    
        mentorId,    
        "CRON",      
      ]);
    }

    if (!rows.length) return;

    console.log(rows, 'rows'); 

    // Insert into leadFollowUpLogs 
    await bulkInsertRecords(
      tables.leadFollowUpLogs,
      [
        "user_id",
        "slot_id",
        "type",
        "follow_up_date",
        "added_by",
        "assigned_to",
        "source",
      ],
      rows,
    );

    // Insert into call_updates table
    const callUpdateRows = rows.map(row => [
      row[0],
      "14",
      "Lead",
      "",
      0,
      row[4],
      "CRON",
      0,
      row[3]
    ]);

    await bulkInsertRecords(
      tables.callUpdates,
      [
        "user_id",
        "call_type", 
        "user_type",
        "comment",
        "call_status",
        "added_by",
        "source",
        "slot_id",
        "schedule_date",
      ],
      callUpdateRows,
    );

  } catch (error) {
    console.error("setHotLeadFollowUps error:", error);
  }
};

// await setHotLeadFollowUps();
const getTodaysPendingFollowCountReminder = async(req,res,next)=> {
  try {


    const { results: admins } = await readRecord({
      selectFields: ["*"],
      table: `${tables.adminUsers}`,
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "role_id", operator: "=", value: 1 },
      ],
    });

    for (const admin of admins) {
    
      const {results} = await readRecord({
        table: `${tables.leadFollowUpLogs} lfl`, 
        selectFields: ['lfl.user_id'], 
        conditions: [
          {field: 'lfl.follow_up_status', operator: '=', value: 0},
          {field: 'lfl.follow_up_date', operator: '=', value: moment().format('YYYY-MM-DD')},
          {field: 'lfl.assigned_to', operator: "=", value: admin.admin_user_id}
        ],
        groupBy: ['lfl.user_id']
      });

      if (results.length>0 && admin.admin_user_id==152) {
        console.log(results.length, 'RESULTS'); 
        const data = {
          title: `Today's Follow-up's Pending ${results.length}`,
          description: `Please complete your Follow-ups for today!`,
          priority: 1,
          redirect: "/follow-up?duration=today", // adjust if your frontend path differs
        };
        sendSSEEvent({ mentor_id: admin.admin_user_id, data });
      }
    }


  }
  catch(error) {
    console.log(error, 'ERROR sending: getTodaysPendingFollowCountReminder')
  }
   
}


export {
  sendWeeklyWedFriReferNotifications,
  assessmentNotFilledNotification,
  callsUnansweredMails,
  updateStatusToMaintenance,
  updateStatusToNotStarted,
  updateStatusToDormant,
  welcomeCallNotBookedNotification,
  dietSentNotification,
  setSessionStartDateNotification,
  welcomeCallReminderNotifications,
  calorieCountedNotification,
  sessionBasedNotifications,
  sundayNotification,
  balanceDueNotifications,
  birthDayNotifications,
  updateUserStatusAndLog,
  sendHalfTimeFeedbackNotification,
  sendHealthScoreNotification,
  sendHTCallReminderNotification,
  getMatchingDraftMessage,
  sendGoalNotifications,
  sendTailendHealthScoreNotification,
  sendTailendFeedbackNotification,
  sendTailendFeedbackCallReminderNotification,
  clientsDroppingOut,
  sendPageVisitMails,
  sendPageVisit,
  yesterdayDroppedOutClients,
  onholdClientsExpiry,
  callsBookedMails,
  callsDoneMails,
  callsPendingMails,
  iclPopUp,
  nafPopUp,
  paymentLinkExpiring,
  weightUpdateNotification,
  weightUpdateDormantNotification,
  sendAtRiskCron,
  updateClientStatusToOnHold,
  handleDormantToDroupout,
  sendAdvanceProgramStartDateChats,
  dietAsk,
  dailyFuCheck,
  sendTailendNoAdvacnePurchaseUserReport,
  handleDormantToDropoutByIds,
  handleDormantToDropoutById,
  sendAlcoholFeedbackReminder,
  sendRestaurantFeedbackReminder,
  sendRestaurantGuideNotification,
  sendAlcoholGuideNotification,
  sendDietPdfNotification,
  sendHSWatiNotification,
  sendLeadMultipleCheckoutWatiNotification,
  sendPerformanceSummary,
  checkValidityAwarenessForMentors,
  validityAwarenessBufferedMail,
  checkPendingDietsForMentors,
  checkDietOverdueForAllMentors,
  checkMissedCallsForMentors,
  sendDietPdfInChat,
  dailyLeadFuCheck,
  dailyClientFuCheck,
  dailyFirstPitch48HrCheck,
  dailyPitched48HrNoActivityCheck,
  notifyEndingTravelOnholdBreaks,
  moveOnholdToDormant,
  sendOnholdOverdueMail,
  notifyOnholdOverdue,
  notifyOnholdResumesToday,
  activateTravelGuidesForRecentOnholdClients,
  activateAirportGuidesForRecentOnholdClients,
  activateWeddingGuidesForRecentOnholdClients,
  notifyEndingHealthIssuesOnholdBreaks,
  notifyEndingWeddingsOnholdBreaks,
  notifyOnholdOverdueHealthIssues,
  notifyOnholdOverdueWeddings,
  sendWeddingsOnholdBreakScheduledNotifications,
  sendMedicalIssuesOnholdBreakScheduledNotifications,
  cartAddedNotification,
  notifyEndingPregnancyDueDate,
  notifyPregnancyPostDueDate,
  notifyPregnancyOverdueEndDate,
  notifyPregnancyTrimesterTips,
  // notifyPregnancyPreBreakEnd,
  cartAddedNotPaidMails,
  hamperDeliveredMails,
  getTodaysPendingFollowCountReminder
};
