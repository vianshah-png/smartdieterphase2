import axios from "axios";
import moment from "moment";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../config/query.js";
import {
  calculateBMI,
  extractVariables,
  fetchUserDetailsDynamic,
  fetchUsersDetailsNew,
  getGoalData,
  getInchTracker,
  getPhotoTracker,
  getPreviousInchTracker,
  replacePlaceholders,
} from "../helper/common.js";
import { app_versions, cloudinaryFolders, tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { uploadArrayOfFilesToCloudinary } from "../helper/uploadToCloudinary.js";
import {
  getFormattedLeadData,
  getFormattedUserData,
} from "../helper/mentordbHelpers.js";
import { calculateAge, safeJSONParse } from "../helper/commonHelper.js";
import { createPaymentLink } from "../utils/createPaymentLink.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import dietDetails from "../models/dietDetailsModel.js";
import clientEnquiry from "../models/clientQueryModel.js";
import md5 from "md5";
import { addFollowUpWatiWebhook, addSourceLogNew } from "./salesDashboardControllers/leadsController.js";
import WatiActivity from "../models/watiActivityModel.js";
import { writePool } from "../config/dbConnection.js";

const updateClientStartDate = async (req, res, next) => {
  try {
    const { id, date, source } = req.body;
    if (!id || !date)
      return next(new ErrorHandler("id or date is not Provided", 500));

    const updatedData = {
      start_date: date,
      start_date_added_by: source === "mentor_db" ? 1 : 2,
    };
    const condition = { sub_order_id: parseInt(id) };

    // 1) Update start date
    const updatedClientStartDate = await updateRecord(
      `${tables.subOrderPrograms}`,
      updatedData,
      condition
    );
    if (updatedClientStartDate.affectedRows === 0) {
      return next(new ErrorHandler("Error While Updating Start Date", 400));
    }

    //tetsing
    //   const apiresponsetest = new ApiResponse({
    //   statusCode: 200,
    //   message: "Start Date Updated Successfully",
    // });
    // return res.status(200).json(apiresponsetest);
    //testing

    // 2) Fetch client + mentor + program dates needed for comms
    let clientDetails = [];
    try {
      const { results } = await readRecord({
        selectFields: [
          "ud.first_name",
          "ud.email_id",
          "ud.user_id",
          "ud.mentor_assigned",
          "ad.email_id as mentor_email",
          "ad.crm_user as mentor_name",
          "pm.program_name",
          "sop.expiry_date",
          "sop.start_date",
        ],
        table: `${tables.subOrderPrograms} sop`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = sop.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
        ],
        conditions: [
          { field: "sop.sub_order_id", operator: "=", value: parseInt(id) },
          { field: "sop.order_type", operator: "=", value: "Renewal" },
          {
            field: "sop.program_id",
            operator: "NOT IN",
            value: [
              21, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 131, 158,
              160, 179,
            ],
          },
          { field: "ud.mentor_assigned", operator: "=", value: 196 },
        ],
      });
      clientDetails = results || [];
    } catch (e) {
      console.log("Details fetch failed:", e);
    }

    if (clientDetails.length) {
      const user = clientDetails[0];

      // Format fields
      const start = moment(user.start_date);
      const end = moment(user.expiry_date);
      const startDateFmt = start.format("Do MMM YYYY");
      const endDateFmt = end.format("Do MMM YYYY");
      const programName = user.program_name;

      // Program Validity: [Number of Days / Weeks]
      let validityDays = end.diff(start, "days");
      if (isNaN(validityDays) || validityDays < 0) validityDays = 0;
      const validityWeeks = Math.round(validityDays / 7);
      const validityStr = `${validityDays} days / ${validityWeeks} weeks`;

      // PS text based on start date vs current prg end session
      const diffFromEnd = start.diff(end, "days"); // positive if start after end
      let psHtml = "";
      if (start.isBefore(end, "day")) {
        // If the date has come before the current prg end session -
        psHtml = `<p><b>P.S.</b> I will send you the diet session 1 for our new program after I get your end-of-session weight update for the ongoing program. You will be notified for the same via notification.</p>`;
      } else if (diffFromEnd >= 0 && diffFromEnd <= 3) {
        // If the date is on the day, up to 3 days after the end session weight
        psHtml = `<p><b>P.S.</b> I will send you the diet session 1 for our new program session soon. You will be notified of the same via notification.</p>`;
      } else if (diffFromEnd >= 4) {
        // If the date comes after 4 days of receiving the end-of-session weight
        psHtml = `<p><b>P.S.</b> I will send you the diet session 1 for our new program session soon. You will be notified of the same via notification. Meanwhile, do send me your weight tomorrow morning on an empty stomach. Add your weight here - <a href=https://www.balancenutrition.in/app_link/screen_id=2 >click here</a></p>`;
      }

      // --- 3) Build Autochat Message in HTML (content unchanged) ---
      const autoChatHtml = `
  <p>Hi ${user.first_name},</p>
  <br/>      
  <p>Your <b>${programName}</b> program is now all set to start! Here are the details:</p>
  <br/>

  <p><b>Start Date:</b> ${startDateFmt}</p>

  <p><b>Program Validity:</b> ${validityStr}</p>

  <p><b>End Date:</b> ${endDateFmt}</p>
  <br/>

  <p>This program comes with new features to help you achieve your next set of goals. I will explain these to you in detail over a call soon, meanwhile, do take a look at them here :)</p>

  <p><a href=https://www.balancenutrition.in/media/guides/pdf/Exercises.pdf target=_blank >Exercise Guide</a></p>
  <br/>    
  ${psHtml}

  <p><small>(This message was pre-scheduled by your mentor)</small></p>

      `;

      // --- 4) Send chat ---
      try {
        await clientEnquiry.create({
          mentor_id: user.mentor_assigned,
          type: "broadcast",
          sender: "mentor",
          query: autoChatHtml,
          user_id: user.user_id,
          name: user.mentor_name,
        });
      } catch (e) {
        console.log("Autochat send failed:", e);
      }

      // --- 5) Send mail (subject and body exactly as provided; placeholders filled) ---
      const mailSubject = `New Program Details!`;
      const mailHtml = `
<p>Hi ${user.first_name},</p>

<p>Your ${programName} program start date has been successfully scheduled! </p>

<p>Here are your program details:</p>

<p>Start Date: ${startDateFmt}</p>

<p>Program Validity: ${validityStr}</p>

<p>End Date: ${endDateFmt}</p>

<p>Please connect with your mentor & get started with the program!</p>

<p>All the best </p>
      `;

      try {
        await sendMailUtil({
          from: "support@balancenutrition.in",
          to: user.email_id,
          cc: ["clientservices@balancenutrition.in"],
          bcc: [user.mentor_email],
          subject: mailSubject,
          html: mailHtml,
        });
      } catch (e) {
        console.log("Mail send failed:", e);
      }

      // --- 6) Send notification (ID 593) ---
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id: 593,
            sent_via: "cron",
          }
        );
      } catch (e) {
        console.log("Notification send failed:", e);
      }
    } else {
      console.log(
        "Client details not found for comms; start date updated only."
      );
    }

    // 7) Original API response (unchanged)
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Start Date Updated Successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllSources = async (_, res, next) => {
  try {
    const selectFields = ["ls.source_id", "ls.source_name"];
    const { results: sources } = await readRecord({
      table: `${tables.leadSources} ls`,
      selectFields,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sources Fetched Successfully",
      data: sources,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getSources = async (req, res, next) => {
  try {
    const { source_id } = req.query;
    const { results: sources } = await readRecord({
      table: `${tables.leadSource}`,
      selectFields: ["source_id", "source_name", "source_group"],
      conditions: [
        { field: "is_deleted", operator: "=", value: 0 },
        source_id
          ? { field: "source_group", operator: "=", value: source_id }
          : null,
      ].filter(Boolean),
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sources Fetched Successfully",
      data: sources,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addSource = async (req, res, next) => {
  const { source_name, source_group } = req.body;
  try {
    const columns = ["source_name", "source_group"];
    const values = [source_name, source_group];
    const insertedRecord = await insertRecord(
      tables.leadSource,
      columns,
      values
    );
    if (insertedRecord.affectedRows === 0) {
      return next(new ErrorHandler("Error While Inserting Source", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Source Added Successfully",
      data: { source_id: insertedRecord.insertId },
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getHealthIssues = async (req, res, next) => {
  try {
    const { results: issues } = await readRecord({
      table: `${tables.healthIssues}`,
      selectFields: ["id", "name"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Health Issues Fetched Successfully",
      data: issues,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProgramPageVisitDetails = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id, filter_data } = req.query;
    const user_type = String(req.query.user_type).toLowerCase();
    if (user_type) {
      const validUserTypes = ["lead", "active", "oc"];
      if (!validUserTypes.includes(user_type)) {
        return next(
          new ErrorHandler(
            "Invalid user_type. Must be 'lead', 'active', or 'oc'",
            400
          )
        );
      }
    }
    const validFilterData = [1, 2, 3, 4, 5];
    const numericFilterData = filter_data ? Number(filter_data) : null;
    if (filter_data && !validFilterData.includes(numericFilterData)) {
      return next(
        new ErrorHandler("Invalid filter_data. Must be 1, 2, 3, 4, 5", 400)
      );
    }

    const dataFunction =
      user_type === "lead" ? getFormattedLeadData : getFormattedUserData;

    const conditions = [
      {
        field: "iapvl.page_type",
        operator: "=",
        value: 1,
      },
    ];

    if (user_type === "lead") {
      conditions.push(
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        }
      );
    } else if (user_type === "active" || user_type === "oc") {
      conditions.push(
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "active" ? "Active" : "Completed",
        }
      );
    } else {
      conditions.push({
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      });
    }

    if (numericFilterData) {
      if ([1, 3].includes(numericFilterData)) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: "=",
          value: moment().format("YYYY-MM-DD"),
        });
        if (numericFilterData === 1) {
          conditions.push({
            field: "iapvl.visit_time",
            operator: "BETWEEN",
            value: ["10:00:00", "19:00:00"],
          });
        }
      } else if (numericFilterData === 2) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: "BETWEEN",
          value: [moment().subtract(1, 'days').format("YYYY-MM-DD"),moment().format("YYYY-MM-DD")],
        });

        conditions.push({
          field: '', 
          operator:'', 
          raw: true,
          value: `(
            (DATE(iapvl.visit_date) = CURDATE() AND iapvl.visit_time BETWEEN '00:00:00' AND '09:59:59')
            OR
            (DATE(iapvl.visit_date) = CURDATE() - INTERVAL 1 DAY AND iapvl.visit_time BETWEEN '19:00:01' AND '23:59:59')
          )`,
        });
      } else if (numericFilterData === 4) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: ">=",
          value: moment().subtract(8, "days").format("YYYY-MM-DD"),
        });
      } else if (numericFilterData === 5) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: ">=",
          value: moment().startOf("month").format("YYYY-MM-DD"),
        });
      }
    }
    

    console.log(conditions, 'conditions', numericFilterData ); 
    const { data, total_page } = await dataFunction({
      search,
      page,
      limit,
      base_table: `${tables.inAppPageVisitLog} iapvl`,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = iapvl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pvpm`,
          on: "pvpm.program_id = iapvl.program_id",
        },
      ],
      extraSelectFields: [
        "iapvl.visit_date",
        'iapvl.acknowledgement',
        "iapvl.visit_time",
        "pvpm.program_name as program_page_visited",
        `REPLACE(
  REPLACE(
    'Hello {{name}}, I noticed you were viewing the {{page_visit_program_name}} program. Let me know in case you need any assistance or have any queries regarding the program. You can write back to me here. Will be happy to help :)',
    '{{name}}', ud.first_name
  ),
  '{{page_visit_program_name}}', pvpm.program_name
) AS whatsapp_text
`,
      ],
      extraConditions: conditions,
      extraOrderBy: ["iapvl.page_visit_id DESC"],
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => ({
        page_visited: {
          acknowledgement: i.acknowledgement, 
          program_visited: i.program_page_visited || "N/A",
          visit_date: i.visit_date
            ? moment(i.visit_date).format("DD MM YYYY")
            : "N/A",
          visit_time: i.visit_time || "N/A",
        },
      }),
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Program Page Visit Details Fetched Successfully",
        data,
        totalCount: total_page,
        meta_data: [
          "chat_text",
          "client_id",
          "suggested_program_id",
          "suggested_program_session_id",
        ],
      })
    );
  } catch (error) {
    console.error("Error in getProgramPageVisitDetails:", error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500)
    );
  }
};

export const getTodayVisitCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    if (!mentor_id) {
      return next(new ErrorHandler("mentor_id is required", 400));
    }

    const today = moment().format("YYYY-MM-DD");

    const rawCondition = `(ud.mentor_assigned = ${mentor_id} OR ud.counsellor_assigned = ${mentor_id})`;

    const sharedConditions = [
      { field: "iapvl.visit_date", operator: "=", value: today },
      {
        field: "iapvl.visit_time",
        operator: "BETWEEN",
        value: ["10:00:00", "19:00:00"],
      },
      {
        field: rawCondition,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    const unionQueries = [
      {
        table: `${tables.inAppPageVisitLog} iapvl`,
        selectField: [
          "COUNT(DISTINCT iapvl.user_id) AS count",
          "'program_page_visit' AS type",
        ],
        condition: [
          { field: "iapvl.page_type", operator: "=", value: 1 },
          ...sharedConditions,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = iapvl.user_id",
          },
        ],
        // rawWhere: rawCondition,
      },
      {
        table: `${tables.inAppPageVisitLog} iapvl`,
        selectField: [
          "COUNT(DISTINCT iapvl.user_id) AS count",
          "'checkout_visit' AS type",
        ],
        condition: [
          { field: "iapvl.page_type", operator: "=", value: 2 },
          ...sharedConditions,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = iapvl.user_id",
          },
        ],
        // rawWhere: rawCondition,
      },
    ];

    const results = await readRecordUnion(unionQueries);

    const output = {};
    results.forEach((row) => {
      output[row.type] = parseInt(row.count || 0);
    });

    return res.status(200).json(output);
  } catch (error) {
    console.error("Error in getTodayVisitCounts:", error);
    return next(new ErrorHandler("Failed to fetch today's visit counts", 500));
  }
};

const getCheckoutPageVisitDetails = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id, filter_data } = req.query;
    const user_type = String(req.query.user_type || "active").toLowerCase();

    if (user_type) {
      const validUserTypes = ["lead", "active", "oc"];
      if (!validUserTypes.includes(user_type)) {
        return next(
          new ErrorHandler(
            "Invalid user_type. Must be 'lead', 'active', or 'oc'",
            400
          )
        );
      }
    }

    const validFilterData = [1, 2, 3, 4, 5];
    const numericFilterData = filter_data ? Number(filter_data) : null;
    if (filter_data && !validFilterData.includes(numericFilterData)) {
      return next(
        new ErrorHandler("Invalid filter_data. Must be 1, 2, 3, 4 or 5", 400)
      );
    }

    const dataFunction =
      user_type === "lead" ? getFormattedLeadData : getFormattedUserData;

    const conditions = [
      {
        field: "iapvl.page_type",
        operator: "=",
        value: 2,
      },
    ];

    if (user_type === "lead") {
      conditions.push(
        { field: "ud.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "ud.user_status", operator: "=", value: "Lead" }
      );
    } else if (["active", "oc"].includes(user_type)) {
      conditions.push(
        { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "active" ? "Active" : "Completed",
        }
      );
    } else {
      conditions.push({
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      });
    }

    if (numericFilterData) {
      if ([1, 3].includes(numericFilterData)) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: "=",
          value: moment().format("YYYY-MM-DD"),
        });
        if (numericFilterData === 1) {
          conditions.push({
            field: "iapvl.visit_time",
            operator: "BETWEEN",
            value: ["10:00:00", "19:00:00"],
          });
        }
      } else if (numericFilterData === 2) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: "BETWEEN",
          value: [moment().subtract(1, 'days').format("YYYY-MM-DD"), moment().format("YYYY-MM-DD") ],
        });
        
        conditions.push({
          field: '', 
          operator:'', 
          raw: true,
          value: `(
            (DATE(iapvl.visit_date) = CURDATE() AND iapvl.visit_time BETWEEN '00:00:00' AND '09:59:59')
            OR
            (DATE(iapvl.visit_date) = CURDATE() - INTERVAL 1 DAY AND iapvl.visit_time BETWEEN '19:00:01' AND '23:59:59')
          )`,
        });
      } else if (numericFilterData === 4) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: ">=",
          value: moment().subtract(8, "days").format("YYYY-MM-DD"),
        });
      } else if (numericFilterData === 5) {
        conditions.push({
          field: "iapvl.visit_date",
          operator: ">=",
          value: moment().startOf("month").format("YYYY-MM-DD"),
        });
      }
    }


    // ✅ Dynamic admin alias to avoid duplicate table/alias error
    const adminAlias = user_type === "lead" ? "counsellor_ad" : "mentor_ad";
    const adminJoinCondition =
      user_type === "lead"
        ? `${adminAlias}.admin_user_id = ${mentor_id}`
        : `${adminAlias}.admin_user_id = ${mentor_id}`;

    const { data, total_page } = await dataFunction({
      search,
      page,
      limit,
      base_table: `${tables.inAppPageVisitLog} iapvl`,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = iapvl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pvpm`,
          on: "pvpm.program_id = iapvl.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} pvps`,
          on: "pvps.program_id = iapvl.program_id AND pvps.program_sessions = iapvl.sessions",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ${adminAlias}`,
          on: adminJoinCondition,
        },
      ],
      extraSelectFields: [
        "iapvl.visit_date",
        "iapvl.visit_time",
        "iapvl.acknowledgement", 
        "pvpm.program_name AS program_page_visited",
        `REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                'Hello {{name}}, We noticed you were trying to purchase the {{page_visit_program_duration}} {{page_visit_program_name}} program, However, you were not able to complete the registration, Let me know in case you need any assistance with the link or an alternate payment method or have any queries regarding the program, You can contact me here or Whatsapp me on {{mentor_wa}}',
                '{{name}}', COALESCE(ud.first_name, 'there')
              ),
              '{{page_visit_program_duration}}', COALESCE(pvps.program_duration, 'our')
            ),
            '{{page_visit_program_name}}', COALESCE(pvpm.program_name, 'program')
          ),
          '{{mentor_wa}}', COALESCE(${adminAlias}.official_phone, 'contact support')
        ) AS whatsapp_text`,
      ],
      extraConditions: [...conditions],
      extraOrderBy: ["iapvl.page_visit_id DESC"],
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => ({
        page_visited: {
          acknowledgement: i.acknowledgement, 
          program_visited: i.program_page_visited || "N/A",
          visit_date: i.visit_date
            ? moment(i.visit_date).format("DD MM YYYY")
            : "N/A",
          visit_time: i.visit_time || "N/A",
        },
      }),
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Program Page Visit Details Fetched Successfully",
        data,
        totalCount: total_page,
        meta_data: [
          "chat_text",
          "client_id",
          "suggested_program_id",
          "suggested_program_session_id",
        ],
      })
    );
  } catch (error) {
    console.error("Error in getCheckoutPageVisitDetails:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const getDailyFuDetails = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.query;
    const { data, total_page } = await getFormattedUserData({
      search,
      page,
      limit,
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.daily_fu",
          operator: "=",
          value: "1",
          raw: true,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
      ].filter(Boolean),

      extraGroupBy: ["ud.user_id"],
    });
    const user_ids = data.map((i) => i.client_details.client_id);

    const enquiries = await clientEnquiry.find({
      user_id: { $in: user_ids },
      createdAt: {
        $gte: moment().startOf("day").toDate(),
        $lte: moment().endOf("day").toDate(),
      },
      sender: "mentor",
      type: { $ne: "broadcast" },
    });

    const sentUserIds = new Set(enquiries.map((e) => e.user_id.toString()));
    data.forEach((item) => {
      if (sentUserIds.has(item.client_details.client_id.toString())) {
        item.client_details.is_sent = true;
      } else {
        item.client_details.is_sent = false;
      }
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Daily Fu fetched successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "chat_text",
        "client_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getVipDetails = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.query;
    const { data, total_page } = await getFormattedUserData({
      search,
      page,
      limit,
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.vip",
          operator: "=",
          value: "1",
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
      ].filter(Boolean),

      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Daily Vip fetched successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "chat_text",
        "client_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllOC = async (req, res, next) => {
  const { page, limit, search, mentor_id } = req.query;
  try {
    const { data, total_page } = await getFormattedUserData({
      search,
      page,
      limit,
      extraConditions: [
        { field: "ud.user_status", operator: "=", value: "Completed" },
        mentor_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
      ].filter(Boolean),
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All OC Fetched Successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_id",
        "client_active_order_id",
      ],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error occurred while fetching users and details:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const addProgramVisit = async (req, res, next) => {
  try {
    const { user_id, program_id } = req.body;
    const columns = [
      "user_id",
      "page_type",
      "program_id",
      "amount",
      "visit_date",
      "visit_time",
      "acknowledgement",
      "acknowledge_date",
    ];

    const values = [
      user_id,
      1,
      program_id,
      null,
      moment().format("YYYY-MM-DD"),
      moment().format("HH:mm:ss"),
      0,
      null,
    ];
    const insertedRecord = await insertRecord(
      `${tables.inAppPageVisitLog}`,
      columns,
      values
    );
    if (insertedRecord.affectedRows === 0) {
      return next(
        new ErrorHandler("Error While Inserting Program Page Visit Log", 400)
      );
    }
    const { results } = await readRecord({
      table: `${tables.inAppPageVisitLog} pv`,
      selectFields: ["pv.user_id"],
      conditions: [
        { field: "pv.user_id", operator: "=", value: user_id },
        { field: "pv.page_type", operator: "=", value: 1 },
        {
          field: "pv.visit_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    console.log(results, 594);
    if (results.length !== 0) {
      console.log(596);
      const [{ results: userDetails }, { results: programDetails }] =
        await Promise.all([
          readRecord({
            table: `(
  SELECT *, 
    CASE 
      WHEN user_type = '1' THEN mentor_assigned 
      ELSE counsellor_assigned 
    END AS assigned_admin_id
  FROM ${tables.userDetails}
) ud`,
            selectFields: [
              "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
              "ad.admin_user_id as mentor_assigned",
              "ad.email_id as admin_email",
              "ad.active",
              "ad.oc",
              "ad.lead",
              "CASE WHEN ud.user_type = '0' THEN 'Lead' WHEN ud.user_status = 'Active' THEN 'Active' ELSE 'OC' END AS status",
              "ud.sub_user_status",
              "ad.first_name as mentor_name",
              "ud.email_id as client_email",
              "REGEXP_REPLACE(ud.phone, '[^0-9]', '') AS client_phone",
              "ad.call_link",
              `CONCAT(
  ud.app_version,
  ' (',
  CASE 
    WHEN ud.app_version IS NULL 
      OR (ud.device = 'android' AND ud.app_version < '${app_versions.android}') 
      OR (ud.device = 'ios' AND ud.app_version < '${app_versions.ios}') 
    THEN 'not updated' 
    ELSE 'updated' 
  END,
  ')'
) AS app_version
`,
            ],
            conditions: [
              { field: "ud.user_id", operator: "=", value: user_id },
            ],
            joins: [
              {
                type: "LEFT",
                table: `${tables.adminUsers} ad`,
                on: "ad.admin_user_id = ud.assigned_admin_id",
              },
            ],
          }),
          readRecord({
            table: `${tables.programsMaster} pm`,
            selectFields: ["pm.program_name"],
            conditions: [
              { field: "pm.program_id", operator: "=", value: program_id },
            ],
          }),
        ]);

      const data = {
        title: "Program Page Visit",
        description: `${userDetails[0].client_name} Visited ${
          programDetails[0].program_name
        } ${moment().fromNow()}`,
        priority: 1,
        redirect: "/page-visit",
      };

      console.log(userDetails[0], 626);
      const pvMailData = {};
      const activeBody = `<p>Hello {{mentor_name}},</p><p>Below client has visited program page:-</p><p><b>Name: </b>{{client_name}}</p><p><b>Email:- </b>{{client_email}}</p><p><b>Phone: </b><a href='tel:{{client_phone}}'>{{client_name}}</a> &nbsp; <a href='https://wa.me/{{client_phone}}/?text=Hi {{client_name}}, I noticed you were viewing the *{{program_name}}* program. Are you looking to restart your journey with us? We can also connect on call to discuss this further :) You can use this link to book {{call_link}}'><img src='https://bncleanse.com/images/whatsapp.png' height='20px' width='20px' /></a></p><p><b>Program Page Visited: </b>{{program_name}}</p><p><b>User Status: </b>{{sub_user_status}}</p><p><b>App Status: </b>{{app_version}}</p> <br/>`;
      const ocBody = `<p>Hello {{mentor_name}},</p><p>Below client has visited program page:-</p><p><b>Name: </b>{{client_name}}</p><p><b>Email:- </b>{{client_email}}</p><p><b>Phone: </b><a href='tel:{{client_phone}}'>{{client_phone}}</a> &nbsp; <a href='https://wa.me/{{client_phone}}/?text=Hi {{client_name}}, I noticed you were viewing the *{{program_name}}* program. Are you looking to restart your journey with us? We can also connect on call to discuss this further :) You can use this link to book {{call_link}}'><img src='https://bncleanse.com/images/whatsapp.png' height='20px' width='20px' /></a></p><p><b>Program Page Visited: </b>{{program_name}}</p><p><b>User Status: </b>{{sub_user_status}}</p><p><b>App Status: </b>{{app_version}}</p> <br/>`;
      const leadBody = `<p>Hello {{mentor_name}},</p><p>Below client has visited program page:-</p><p><b>Name: </b>{{client_name}}</p><p><b>Email:- </b>{{client_email}}</p><p><b>Phone: </b><a href='tel:{{client_phone}}'>{{client_name}}</a> &nbsp; <a href='https://wa.me/{{client_phone}}/?text=Hi {{client_name}}, I noticed you were viewing the *{{program_name}}* program. Are you looking to restart your journey with us? We can also connect on call to discuss this further :) You can use this link to book {{call_link}}'><img src='https://bncleanse.com/images/whatsapp.png' height='20px' width='20px' /></a></p><p><b>Program Page Visited: </b>{{program_name}}</p><p><b>User Status: </b>{{sub_user_status}}</p><p><b>App Status: </b>{{app_version}}</p> <br/>`;
      const subject = `In App Program Page Visit Alert ({{user_status}})`;
      if (userDetails[0].status === "Lead" && userDetails[0].mentor_assigned) {
        const { pv } = safeJSONParse(userDetails[0].lead);
        pvMailData.to = userDetails[0].admin_email;
        pvMailData.cc = pv.cc;
        pvMailData.bcc = pv.bcc;
        pvMailData.subject = replacePlaceholders(
          // safeJSONParse(userDetails[0].lead).pv.mail_template.subject,
          subject,
          {
            user_status:
              userDetails[0].status === "Lead"
                ? userDetails[0].status
                : userDetails[0].sub_user_status,
          }
        );
        pvMailData.body = replacePlaceholders(
          // safeJSONParse(userDetails[0].lead).pv.mail_template.body,
          leadBody,

          {
            client_name: userDetails[0].client_name,
            program_name: programDetails[0].program_name,
            mentor_name: userDetails[0].mentor_name,
            client_email: userDetails[0].client_email,
            client_phone: userDetails[0].client_phone,
            sub_user_status: userDetails[0].sub_user_status,
            app_version: userDetails[0].app_version || "Not updated",
            call_link: userDetails[0].call_link,
          }
        );
      } else if (
        userDetails[0].status === "Active" &&
        userDetails[0].mentor_assigned
      ) {
        const { pv } = safeJSONParse(userDetails[0].active);
        pvMailData.to = userDetails[0].admin_email;
        pvMailData.cc = pv.cc;
        pvMailData.bcc = pv.bcc;
        pvMailData.subject = replacePlaceholders(
          // safeJSONParse(userDetails[0].active).pv.mail_template.subject,
          subject,

          {
            user_status:
              userDetails[0].status === "Lead"
                ? userDetails[0].status
                : userDetails[0].sub_user_status,
          }
        );
        pvMailData.body = replacePlaceholders(
          // safeJSONParse(userDetails[0].lead).pv.mail_template.body,
          activeBody,

          {
            client_name: userDetails[0].client_name,
            program_name: programDetails[0].program_name,
            mentor_name: userDetails[0].mentor_name,
            client_email: userDetails[0].client_email,
            client_phone: userDetails[0].client_phone,
            sub_user_status: userDetails[0].sub_user_status,
            app_version: userDetails[0].app_version || "Not updated",
            call_link: userDetails[0].call_link,
          }
        );
      } else if (
        userDetails[0].status === "OC" &&
        userDetails[0].mentor_assigned
      ) {
        const { pv } = safeJSONParse(userDetails[0].oc);
        pvMailData.to = userDetails[0].admin_email;
        pvMailData.cc = pv.cc;
        pvMailData.bcc = pv.bcc;
        pvMailData.subject = replacePlaceholders(
          // safeJSONParse(userDetails[0].oc).pv.mail_template.subject,
          subject,
          {
            user_status:
              userDetails[0].status === "Lead"
                ? userDetails[0].status
                : userDetails[0].sub_user_status,
          }
        );
        pvMailData.body = replacePlaceholders(
          // safeJSONParse(userDetails[0].lead).pv.mail_template.body,
          ocBody,
          {
            client_name: userDetails[0].client_name,
            program_name: programDetails[0].program_name,
            mentor_name: userDetails[0].mentor_name,
            client_email: userDetails[0].client_email,
            client_phone: userDetails[0].client_phone,
            sub_user_status: userDetails[0].sub_user_status,
            app_version: userDetails[0].app_version || "Not updated",
            call_link: userDetails[0].call_link,
          }
        );
      }
      console.log(pvMailData, 640);
      if (userDetails[0].mentor_assigned) {
        const mail = await sendMailUtil({
          from: "No Reply - Balance Nutrition <support@balancenutrition.in>",
          to: pvMailData.to,
          cc: pvMailData.cc,
          bcc: pvMailData.bcc,
          subject: pvMailData.subject,
          html: pvMailData.body,
        });
        console.log(mail, 739);
      }
      const { results: mentorNotifications } = await readRecord({
        selectFields: ["*"],
        table: `${tables.mentorNotifications}`,
        conditions: [
          { field: "user_id", operator: "=", value: user_id },
          {
            field: "admin_id",
            operator: "=",
            value: userDetails[0].mentor_assigned,
          },
          { field: "redirect", operator: "=", value: "/program-page-visit" },
          {
            field: "TIMESTAMPDIFF(MINUTE,added_date,NOW())",
            operator: "<=",
            value: 15,
            raw: true,
          },
        ],
      });
      if (mentorNotifications.length === 0) {
        const insertedResult = await insertRecord(
          tables.mentorNotifications,
          ["user_id", "admin_id", "content", "redirect"],
          [
            user_id,
            userDetails[0].mentor_assigned,
            data.title,
            "/program-page-visit",
          ]
        );
        sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
        if (insertedResult.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While Inserting Mentor Notifications", 400)
          );
        }
      }
       
      await addFollowUpWatiWebhook( {}, {}, null, { internal: true, userId:user_id, source: 'PV', campaign:`Visited ${programDetails[0].program_name}` });
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Program Page Visit Log added successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const addCheckoutVisit = async (req, res, next) => {
  try {
    const { user_id, program_id, program_session_id, amount, source } =
      req.body;

    const { results } = await readRecord({
      table: `${tables.programSession} ps`,
      selectFields: ["ps.program_sessions", "ps.program_duration"],
      conditions: [
        {
          field: "ps.program_session_id",
          operator: "=",
          value: program_session_id,
        },
      ],
    });

    const columns = [
      "user_id",
      "source",
      "page_type",
      "program_id",
      "sessions",
      "amount",
      "visit_date",
      "visit_time",
      "acknowledgement",
      "acknowledge_date",
    ];

    const values = [
      user_id,
      source || 1,
      2,
      program_id,
      results[0].program_sessions,
      amount,
      moment().format("YYYY-MM-DD"),
      moment().format("HH:mm:ss"),
      0,
      null,
    ];

    const insertedRecord = await insertRecord(
      `${tables.inAppPageVisitLog}`,
      columns,
      values
    );
    if (insertedRecord.affectedRows === 0) {
      return next(
        new ErrorHandler("Error While Inserting Checkout Page Visit Log", 400)
      );
    }
    if (source && source == 2) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Checkout Page Visit Log added successfully",
      });
      return res.status(200).json(apiResponse);
    }
    const { results: checkOutVisitLog } = await readRecord({
      table: `${tables.inAppPageVisitLog} pv`,
      selectFields: ["pv.user_id"],
      conditions: [
        { field: "pv.user_id", operator: "=", value: user_id },
        { field: "pv.page_type", operator: "=", value: 2 },
        {
          field: "pv.visit_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const [{ results: userDetails }, { results: programDetails }] =
      await Promise.all([
        readRecord({
          table: `(
  SELECT *, 
    CASE 
      WHEN user_type = '1' THEN mentor_assigned 
      ELSE counsellor_assigned 
    END AS assigned_admin_id
  FROM ${tables.userDetails}
) ud`,
          selectFields: [
            "COALESCE(NULLIF(ud.first_name, ''), ud.last_name, '') AS client_name",
            "ad.admin_user_id as mentor_assigned",
            "ad.email_id as admin_email",
            "ad.active",
            "ad.oc",
            "ad.lead",
            "CASE WHEN ud.user_type = '0' THEN 'Lead' WHEN ud.user_status = 'Active' THEN 'Active' ELSE 'OC' END AS status",
            "ud.sub_user_status",
            "ad.first_name as mentor_name",
            "ud.email_id as client_email",
            "REGEXP_REPLACE(ud.phone, '[^0-9]', '') AS client_phone",
            "ad.call_link",
            "ud.app_version",
          ],
          joins: [
            {
              type: "LEFT",
              table: `${tables.adminUsers} ad`,
              on: "ad.admin_user_id = ud.assigned_admin_id",
            },
          ],
          conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
        }),
        readRecord({
          table: `${tables.programsMaster} pm`,
          selectFields: ["pm.program_name", "pm.program_category"],
          conditions: [
            { field: "pm.program_id", operator: "=", value: program_id },
          ],
        }),
      ]);

    if (userDetails.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }
    const payment_link = await createPaymentLink({
      amount,
      expire_by: moment().add(2, "days").endOf("day").unix(),
      description: `Payment Link For ${userDetails[0].client_name} For Program ${programDetails[0].program_name}`,
      source: "app",
    });
    console.log(payment_link, 919);
    const newPaymentLinkColumns = [
      "payment_link_id",
      "email",
      "phone_number",
      "program_id",
      "program_session_id",
      "amount",
      "expiry_at",
      "payment_link",
      "user_id",
      "admin_user_id",
    ];
    const newPaymentLinkValues = [
      payment_link.id,
      userDetails[0].client_email,
      userDetails[0].phone,
      program_id,
      program_session_id,
      amount,
      moment().add(2, "days").endOf("day").format("YYYY-MM-DD HH:mm:ss"),
      payment_link.short_url,
      user_id,
      userDetails[0].mentor_assigned,
    ];
    console.log(newPaymentLinkColumns, 945);
    console.log(newPaymentLinkValues, 946);
    const newPaymentLinkEntry = await insertRecord(
      `${tables.paymentLinks}`,
      newPaymentLinkColumns,
      newPaymentLinkValues
    );
    console.log(newPaymentLinkEntry, 948);
    const updateResult = await updateRecord(
      tables.inAppPageVisitLog,
      {
        payment_link_id: newPaymentLinkEntry.insertId,
        payment_link: payment_link.short_url,
      },
      {
        page_visit_id: insertedRecord.insertId,
      }
    );
    if (checkOutVisitLog.length > 0 && userDetails[0].admin_email) {
      const cvMailData = {};
      const activeBody = `<p>Hello {{mentor_name}},</p><p>Below client has visited checkout page:-</p><p><b>Name: </b>{{client_name}}</p><p><b>Email:- </b>{{client_email}}</p><p><b>Phone: </b><a href='tel:{{client_phone}}'>{{client_phone}}</a> &nbsp; <a href='https://wa.me/{{client_phone}}/?text=Hi {{client_name}}, The app has just notified me that you were trying to make a payment of Rs.{{amount}} for the *{{program_name}}* program. This payment unfortunately could not go through. Here is an easy payment link that your can use: {{payment_link}} *Other Alternate Ways to Pay:* 1. UPI: khyatirupani123@okhdfcbank 2. Bank Account Details: Please ask me for these & I shall provide them to you 3. Cash Collection: We shall be happy to also arrange for a cash collection within Mumbai Incase you need assistance with regard to the BN App, please connect with our client services on: 7506644555'><img src='https://bncleanse.com/images/whatsapp.png' height='20px' width='20px' /></a></p><p><b>Program Page Visited: </b>{{program_name}}</p><p><b>Session: </b>{{session_days}}</p> <p><b>Amount: </b>Rs. {{amount}}</p> <b>User Status: </b>{{sub_user_status}}</p> <br/>`;
      if (userDetails[0].status === "Lead") {
        const { cv } = safeJSONParse(userDetails[0].lead);
        cvMailData.to = userDetails[0].admin_email;
        cvMailData.cc = cv.cc;
        cvMailData.bcc = cv.bcc;
        cvMailData.subject = replacePlaceholders(
          safeJSONParse(userDetails[0].lead).cv.mail_template.subject ||
            "In App {{program_stack}} CHECKOUT PAGE VISIT ALERT ({{user_status}})",
          {
            user_status:
              userDetails[0].status === "Lead"
                ? userDetails[0].status
                : userDetails[0].sub_user_status,
            program_stack: programDetails[0].program_category,
          }
        );
        cvMailData.body = replacePlaceholders(activeBody, {
          client_name: userDetails[0].client_name,
          program_name: programDetails[0].program_name,
          mentor_name: userDetails[0].mentor_name,
          client_email: userDetails[0].client_email,
          client_phone: userDetails[0].client_phone,
          sub_user_status: userDetails[0].sub_user_status,
          payment_link: payment_link.short_url,
          amount: amount,
          session_days: results[0].program_duration,
        });
      } else if (userDetails[0].status === "Active") {
        const { cv } = safeJSONParse(userDetails[0].active);
        cvMailData.to = userDetails[0].admin_email;
        cvMailData.cc = cv.cc;
        cvMailData.bcc = cv.bcc;
        cvMailData.subject = replacePlaceholders(
          safeJSONParse(userDetails[0].active).cv.mail_template.subject ||
            "In App {{program_stack}} CHECKOUT PAGE VISIT ALERT ({{user_status}})",
          {
            user_status:
              userDetails[0].status === "Lead"
                ? userDetails[0].status
                : userDetails[0].sub_user_status,
            program_stack: programDetails[0].program_category,
          }
        );
        cvMailData.body = replacePlaceholders(activeBody, {
          client_name: userDetails[0].client_name,
          program_name: programDetails[0].program_name,
          mentor_name: userDetails[0].mentor_name,
          client_email: userDetails[0].client_email,
          client_phone: userDetails[0].client_phone,
          sub_user_status: userDetails[0].sub_user_status,
          payment_link: payment_link.short_url,
          amount: amount,
          session_days: results[0].program_duration,
        });
      } else {
        const { cv } = safeJSONParse(userDetails[0].oc);
        cvMailData.to = userDetails[0].admin_email;
        cvMailData.cc = cv.cc;
        cvMailData.bcc = cv.bcc;
        cvMailData.subject = replacePlaceholders(
          safeJSONParse(userDetails[0].oc).cv.mail_template.subject ||
            "In App {{program_stack}} CHECKOUT PAGE VISIT ALERT ({{user_status}})",
          {
            user_status:
              userDetails[0].status === "Lead"
                ? userDetails[0].status
                : userDetails[0].sub_user_status,
            program_stack: programDetails[0].program_category,
          }
        );
        cvMailData.body = replacePlaceholders(activeBody, {
          client_name: userDetails[0].client_name,
          program_name: programDetails[0].program_name,
          mentor_name: userDetails[0].mentor_name,
          client_email: userDetails[0].client_email,
          client_phone: userDetails[0].client_phone,
          sub_user_status: userDetails[0].sub_user_status,
          payment_link: payment_link.short_url,
          amount: amount,
          session_days: results[0].program_duration,
        });
      }
      console.log(cvMailData);
      const mail = await sendMailUtil({
        to: cvMailData.to,
        cc: cvMailData.cc,
        bcc: cvMailData.bcc,
        subject: cvMailData.subject,
        html: cvMailData.body,
        from: "No Reply - Balance Nutrition <support@balancenutrition.in>",
      });
      const data = {
        title: "Checkout Page Visit",
        description: `${userDetails[0].client_name} Tried Payment For Program ${
          programDetails[0].program_name
        } of Rs.${amount} ${moment().fromNow()}`,
        priority: 1,
        redirect: "/checkout-visit",
      };

      const insertedResult = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [
          user_id,
          userDetails[0].mentor_assigned,
          data.title,
          "/checkout-page-visit",
        ]
      );
      if (insertedResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
    }

    await addFollowUpWatiWebhook( {}, {}, null, { internal: true, userId:user_id, source: 'CV', campaign:`Tried Payment for ${programDetails[0].program_name}` });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Checkout Page Visit Log added successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// const getUser = async (req, res, next) => {
//   try {
//     const { name, phone_number, phone_code, email, source_utm } = req.body;

//     // 1. Check if user exists by phone number
//     const { results: existingUsers } = await readRecord({
//       table: tables.userDetails,
//       selectFields: ["user_id"],
//       conditions: [
//         { field: "phone_number", operator: "=", value: phone_number },
//       ],
//       pagination: { page: 1, limit: 1 },
//     });

//     if (existingUsers.length > 0) {
//       const userId = existingUsers[0].user_id;

//       const apiresponse = new ApiResponse({
//         statusCode: 200,
//         message: "User exists and data fetched successfully",
//         data: {
//           userId: userId,
//         },
//       });

//       return res.status(200).json(apiresponse);
//     }

//     // 2. Determine resolved lead source
//     let resolvedSource = 48; // default

//     if (source_utm) {
//       const { results: existingSource } = await readRecord({
//         table: tables.leadSource,
//         selectFields: ["source_id"],
//         conditions: [
//           { field: "source_name", operator: "=", value: source_utm },
//           { field: "is_deleted", operator: "=", value: 0 },
//         ],
//         pagination: { page: 1, limit: 1 },
//       });

//       if (existingSource.length > 0) {
//         resolvedSource = existingSource[0].source_id;
//       }
//     }

//     // 3. Create new user
//     const phoneFull = `${phone_code} ${phone_number}`;

//     const insertUser = await insertRecord(
//       tables.userDetails,
//       [
//         "user_type",
//         "phone",
//         "primary_lead_source",
//         "current_lead_source",
//         "first_name",
//         "phone_code",
//         "phone_number",
//         "email_id",
//         "enc_password",
//         "plain_password",
//         "goal_weight",
//         "old_wallet",
//         "gender",
//         "referred_by",
//       ],
//       [
//         "0",
//         phoneFull,
//         resolvedSource,
//         resolvedSource,
//         name,
//         phone_code,
//         phone_number,
//         email,
//         md5("123456"),
//         "123456",
//         "0",
//         0,
//         "0",
//         0,
//       ]
//     );

//     const newUserId = insertUser?.insertId;

//     await addSourceLogNew({ source: "Website checkout", id: newUserId });

//     const apiresponse = new ApiResponse({
//       statusCode: 200,
//       message: "User created and added to the data",
//       data: {
//         userId: newUserId,
//       },
//     });

//     return res.status(200).json(apiresponse);
//   } catch (error) {
//     console.error("Error in fetching data:", error);
//     return next(new ErrorHandler("Internal server error", 500));
//   }
// };

const getReportsByUser = async (req, res, next) => {
  try {
    const { user_id, type } = req.query;
    const { results } = await readRecord({
      table: `${tables.reports} r`,
      orderBy: ["r.id desc"],
      conditions: [
        {
          field: "r.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "r.report_type",
          operator: "=",
          value: type ? type : "0",
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = r.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id  = sop.program_id",
        },
      ],
      selectFields: [
        "CASE WHEN r.report_type = 0 THEN 'Medical Report' ELSE 'BCA Report' END AS report_type",
        "r.report_url",
        "r.added_date",
        "CASE WHEN r.added_by = 0 THEN 'Client' WHEN r.added_by = 1 THEN 'Mentor' ELSE 'CS' END AS added_by",
        "pm.program_name",
        "r.note",
      ],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "User Reports fetched Successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const uploadReport = async (req, res, next) => {
  try {
    const { user_id, report_type, added_by, sub_order_id, note } = req.body;
    const files = req?.files;
    let urls = [];
    const folder = cloudinaryFolders.reports;
    urls = await uploadArrayOfFilesToCloudinary(files, folder);
    const columns = ["user_id", "report_type", "report_url", "added_by"];

    const values = [
      user_id,
      report_type,
      urls.map((i) => i.file.path),
      added_by,
    ];
    if (sub_order_id) {
      columns.push("sub_order_id");
      values.push(sub_order_id);
    }
    if (note) {
      columns.push("note");
      values.push(note);
    }
    const insertedReportResults = await insertRecord(
      `${tables.reports}`,
      columns,
      values
    );
    if (insertedReportResults.affectedRows === 0) {
      return next(new ErrorHandler("Error While Inserting Report", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Report uploaded successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAdminNotifications = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    const { results: notifications } = await readRecord({
      table: `${tables.mentorNotifications} mn`,
      selectFields: [
        "mn.id",
        "mn.user_id",
        "content",
        "redirect",
        "is_acknowledged",
        "added_date",
      ],
      conditions: [
        {
          field: "mn.admin_id",
          operator: "=",
          value: parseInt(admin_id),
        },
        {
          field: "date(mn.added_date)",
          operator: "=",
          value: `date(now())`,
          raw: true,
        },
      ],
      orderBy: ["added_date DESC"],
    });
    const data = notifications.map((i) => {
      return {
        notification_id: i.id,
        user_id: i.user_id,
        notification_content: i.content,
        redirect: i.redirect,
        is_read: parseInt(i.is_acknowledged) === 0 ? false : true,
        received_at: `${moment(i.received_at).format("DD-MM-YY")} ${moment(
          i.received_at
        ).fromNow()}`,
      };
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Admin Notifications fetched successfully",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAdminNotificationsCount = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    const { results: notifications } = await readRecord({
      table: `${tables.mentorNotifications} mn`,
      selectFields: ["COUNT(mn.id) as not_acknowledged_notifications"],
      conditions: [
        {
          field: "mn.admin_id",
          operator: "=",
          value: parseInt(admin_id),
        },
        {
          field: "date(mn.added_date)",
          operator: "=",
          value: `date(now())`,
          raw: true,
        },
        {
          field: "mn.is_acknowledged",
          operator: "=",
          value: `0`,
        },
      ],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Admin Notifications fetched successfully",
      data: {
        notification_count:
          notifications[0].not_acknowledged_notifications || 0,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateAcknowledgeStatus = async (req, res, next) => {
  try {
    const { notification_ids } = req.body;
    const updatedResult = await updateRecord(
      tables.mentorNotifications,
      {
        is_acknowledged: 1,
      },
      {
        id: [...notification_ids],
      }
    );
    if (updatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Error While Updating Notification Status", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notification Status updated successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const acknowledgePageVisit = async (req, res, next) => {
  try {
    const { page_type, user_id, date } = req.body;

    if (!page_type || !user_id || !date) {
      return next(new ErrorHandler("page_type, user_id, and date are required", 400));
    }

    const parsedDate = moment(date, 'YYYY-MM-DD', true);
    if (!parsedDate.isValid()) {
      return next(new ErrorHandler("Invalid date format. Use YYYY-MM-DD", 400));
    }

    const updatedResult = await updateRecord(
      tables.inAppPageVisitLog,
      {
        acknowledgement: 1,
      },
      {
        user_id: user_id,
        visit_date: parsedDate.format('YYYY-MM-DD'),
        page_type: page_type,
      }
    );

    if (updatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("No page visit found to acknowledge or already acknowledged", 404)
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Page visit acknowledged successfully",
      data: {
        acknowledged_records: updatedResult.affectedRows,
        page_type,
        user_id,
        date: parsedDate.format('YYYY-MM-DD'),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in acknowledgePageVisit:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function fetchWeightNotifications({ user_id }) {
  try {
    const { results } = await readRecord({
      selectFields: [
        "sop.last_session_sent_date",
        "sop.sent_sessions",
        "CASE WHEN MAX(CASE WHEN dsl.mid_session_weight != 0.00 THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS mid_received",
        "CASE WHEN MAX(CASE WHEN dsl.end_session_weight != 0.00 THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS end_received",
        "CONCAT(ad.first_name,' ',ad.last_name) as mentor_name",
        "DATEDIFF(CURDATE(),dsl.diet_start_date) as last_session_sent_days_ago",
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
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id and sop.sent_sessions = dsl.session",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
      ],
      // groupBy: ["cd.user_id", "sop.sub_order_id", "sop.sent_sessions"],
    });
    console.log(results, 875);
    const date = moment().format("YYYY-MM-DD");
    const sent_sessions = results[0]?.sent_sessions;
    const mentor = results[0]?.mentor_name;
    const lastSessionSentDaysAgo = results[0]?.last_session_sent_days_ago;
    let notifications = [
      {
        type: "notification_5th_pre",
        notification_date: date,
        notification_time: "11:10",
        title: "Mid-Session Weight Update!",
        description: `Your mid-session weight update for session ${sent_sessions} is due tomorrow. All the best :)`,
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_10th_pre",
        notification_date: date,
        notification_time: "11:10",
        title: "End-Session Weight Update!",
        description: `Your end-session weight update for session ${sent_sessions} is due tomorrow. All the best!`,
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_10th_post",
        notification_date: date,
        notification_time: "6:15",
        title: "End Session Updates Overdue!",
        description: `We haven't received your end-session weight update for session ${sent_sessions}. Your next diet is on hold until then. Click here to fill them in.`,
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_12th_day",
        notification_date: date,
        notification_time: "06:15",
        title: "Your Next Diet is on Hold.",
        description: `Please fill out the end session trackers for session ${sent_sessions}. Diet session ${
          sent_sessions + 1
        } is on hold until then. Click here to update.`,
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_13th_day",
        notification_date: date,
        notification_time: "06:15",
        title: `Urgent message from ${mentor}`,
        description: `You have not updated your end session weight for session ${sent_sessions}. Click here to update now.`,
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_14th_day",
        notification_date: date,
        notification_time: "06:15",
        title: "Important Update Regarding Your Program",
        description:
          "Your end-session tracker update is overdue. Your membership will become dormant soon. Click here to update now.",
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_16th_day",
        notification_date: date,
        notification_time: "06:15",
        title: "Important Update Regarding Your Program",
        description:
          "Your end-session tracker update is overdue. Your membership will become dormant soon. Click here to update now.",
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_17th_day",
        notification_date: date,
        notification_time: "06:15",
        title: "Your membership will become Dormant.",
        description:
          "You have not updated your trackers & they are overdue by almost 1 week. Click here to update them now.",
        redirect: "weight_tracker",
        send_notification: false,
      },
      {
        type: "notification_19th_day",
        notification_date: date,
        notification_time: "06:15",
        title: "Your Membership is Dormant!",
        description:
          "You have not updated your trackers & they are overdue by almost 1 week. Click here to update them now.",
        redirect: "weight_tracker",
        send_notification: false,
      },
    ];

    if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 19) {
      notifications[8].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 17) {
      notifications[7].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 16) {
      notifications[6].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 14) {
      notifications[5].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 13) {
      notifications[4].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 12) {
      notifications[3].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 11) {
      notifications[2].send_notification = true;
    } else if (results[0]?.end_received == 0 && lastSessionSentDaysAgo == 9) {
      notifications[1].send_notification = true;
    } else if (results[0]?.mid_received == 0 && lastSessionSentDaysAgo == 4) {
      notifications[0].send_notification = true;
    }
    return notifications;
  } catch (error) {
    console.log(error);
    return [];
  }
}
async function fetchNotification({ user_id }) {
  try {
    const notifications = [];
    const weightNotifications = await fetchWeightNotifications({ user_id });
    notifications.push(...weightNotifications);

    return notifications;
  } catch (error) {
    return [];
  }
}

const addAutoDraftedQuery = async ({ query, user_id, mentor_id }) => {
  try {
    const columns = ["user_id", "draft_text"];
    const values = [user_id, query];
    if (mentor_id) {
      columns.push("mentor_id");
      values.push(mentor_id);
    }
    const insertResult = await insertRecord(
      tables.draftedQueries,
      columns,
      values
    );
    if (insertResult.affectedRows === 0) {
      return { status: false, message: "Error While Inserting Drafted Query" };
    }
    return { status: true, message: "Drafted Query Inserted Successfully" };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
};

async function pageVisitDraft({ user_id }) {
  try {
    const { results: pageVisitDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2891 }],
    });
    if (pageVisitDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const draftString = pageVisitDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (userData[0].page_visit_program_name == null) {
      return { status: false, message: "No Page Visit Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function checkoutVisitDraft({ user_id }) {
  try {
    const { results: checkoutVisitDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2892 }],
    });
    if (checkoutVisitDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const draftString = checkoutVisitDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (userData[0].checkout_program_name == null) {
      return { status: false, message: "No checkout Visit Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function welcomeCallDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2907 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },

        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },

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
              field: "cu.call_status",
              operator: "<>",
              value: 1,
            },
          ],
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function welcomeCallDoneDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2939 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Call Done Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id and sop.program_status='1' ",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.call_type = '0' AND cu.call_status = '1' ",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },

        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "date(cu.schedule_date)",
          operator: "=",
          value: "date(now())",
          raw: true,
        },

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
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function fifthDayRecievedDraft({ user_id }) {
  try {
    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.user_id",
      "ud.start_weight",
      "ud.gender",
      "ud.phone",
      "ud.latest_weight",
      "CONCAT(ud.device,' ',ud.app_version) as app_installed",
      `(SELECT weight FROM ${tables.assessment_personal_details} WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight",
      "pm.program_name",
      "ps.program_duration",
      "sop.mrp",
      "sop.paid_amount",
      "sop.sent_sessions",
      "sop.pending_session",
      `(SELECT end_session_weight FROM ${tables.dietSessionLog} WHERE user_id = ${user_id} and diet_status='4' and sub_order_id=sop.sub_order_id and session=sop.sent_sessions-1 limit 1) as previous_end_weight`,
      `(SELECT weight FROM ${tables.weightRecords} WHERE user_id = ${user_id} and session=sop.sent_sessions and sub_order_id=sop.sub_order_id ORDER BY wmr_id DESC limit 1) as wmr_end`,
      `(SELECT weight FROM ${tables.weightRecords} WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id ORDER BY wmr_id Desc limit 1) as wmr_start`,
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "dsl.diet_start_date",
      "ud.ethnicity",
      `(SELECT COUNT(po.order_id)>0 FROM ${tables.productOrders} po WHERE po.user_id=${user_id} AND po.product_id='bn-bodyscan-smart-scale') as scale_purchased`, 
      "wr.weight as fifth_day_weight",
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('1','2','3') AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as program_no`,
      `(Select Group_Concat(po.product_name) FROM ${tables.productOrders} po WHERE po.user_id=${user_id} and po.payment_status="Success" and po.status="Delivered" and po.brand!='doctorstore' and po.updated_at > DATE_SUB(NOW(), INTERVAL 15 DAY)) as product_purchased`,
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sent_sessions = dsl.session and dsl.sub_order_id=sop.sub_order_id",
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
        table: `${tables.weightRecords} wr`,
        on: "wr.user_id = ud.user_id and wr.sub_order_id=sop.sub_order_id and wr.weight_type='0' and wr.days=5 and wr.session=sop.sent_sessions and wr.weight_acknowledge=0",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      groupBy: ["ud.user_id"],
    });

    const client = results[0];
    if (results.length === 0 || !client.fifth_day_weight) {
      return { status: false, message: "No Day 5 weight found" };
    }

    const {
      full_name,
      fifth_day_weight,
      start_program_weight,
      sent_sessions,
      pending_session,
      program_name,
      previous_end_weight,
      wmr_start,
      diet_start_date,
      scale_purchased, 
      phone,
      product_purchased,
    } = client;

    const userName = full_name || "User";
    const currentSession = sent_sessions || 1;
    const sessionToCheck = pending_session || 1;

    const prevWeight = parseFloat(previous_end_weight || wmr_start);
    const day5Weight = parseFloat(fifth_day_weight);
    console.log(prevWeight, day5Weight, 1859);
    const midSessionLoss = parseFloat((prevWeight - day5Weight).toFixed(2));
    const endWeightDate = moment(diet_start_date)
      .add(10, "days")
      .format("DD-MM-YYYY");
    const overallLoss = start_program_weight
      ? parseFloat(start_program_weight) - parseFloat(fifth_day_weight)
      : 0;
    const isIndiaNumber = /^(?:\+)?91/.test(phone || "");
    let htmlMessage = `<p><b>5th Day Auto Draft</b></p>`;

    // Add logic-based message
    if (midSessionLoss > 0.499) {
      htmlMessage += `
        <p>Hi <strong>${userName}</strong>,</p>
        <p>You have lost <strong>${midSessionLoss.toFixed(
          1
        )} kg</strong> in 5 days of session ${currentSession}. Great progress :)</p>
        <p>You've shown amazing consistency over the last 5 days, truly well done 👏</p>
        <p>We still have 5 days more of this diet to be followed. In case you have any queries, do not hesitate to contact me :)</p>
        <p>How is this session coming along?</p>
        <p>If any deviations are going to happen that you have not mentioned to me yet, or any outside meals in the rest half of the session, do let me know what those are going to be.</p>
        <p>We can then plan those meals accordingly.</p>
        <p>Do let me know if you are facing any difficulties. Keep it up!</p>
        <p><strong>P.S.</strong> Your End Session Weight Update is due on: ${endWeightDate}</p>
      `;
    } else if (midSessionLoss > 0 && midSessionLoss <= 0.499) {
      htmlMessage += `
        <p>Hi <strong>${userName}</strong>,</p>
        <p>While I address your queries if any in a while, let me first address your weight update.</p>
        <p>In 5 days of session ${currentSession}, you have lost only <strong>${midSessionLoss.toFixed(
        1
      )} kg</strong>.</p>
        <p>I was expecting a higher loss given the diet plan I made & its effectiveness. There is little reason to not see a loss.</p>
        <p>Were there any deviations in following this?</p>
        <p>Also, how well have you been sleeping this week? Any changes in that?</p>
        <p>Did you visit the loo & then weigh in?</p>
        <p>Are you feeling lighter? Are your clothes fitting a little better?</p>
        <p>I wanted to know if you are bloated.</p>
        <p>I also want to know how are the next 5 days going to be. Will you be following the session well? If you have any planned outings, dinners, or other plans, do update me. I can send you some tips too.</p>
        <p>Please do write back to me if there is anything I need to be aware of as well with regard to your meals last 5 days.</p>
        <p><strong>P.S.</strong> Sending me regular images of your meals, even your on-rising & bedtime supplements helps me identify minor errors you may be making in plating or portioning. So do send them.</p>
        <p><strong>P.P.S</strong> Your end session weight is due on: ${endWeightDate}</p>
      `;
    } else {
      htmlMessage += `
        <p>Hi <strong>${userName}</strong>.</p>
        <p>As per your update, you have <strong>${
          midSessionLoss === 0
            ? "not lost any weight"
            : `gained ${Math.abs(midSessionLoss).toFixed(1)} kg`
        }</strong> in the mid-session of the current session ${currentSession}. We still have 5 more days of this session pending.</p>
        <p>I'll want to know & understand what's not worked here, please. I have a few quick questions:</p>
        <p>- How many days out of these 6 did you follow the diet religiously?</p>
<p>- Did you skip any mid-meals such as supplements, green tea, etc.?</p>
<p>- Is there something in the diet that you disliked or were not able to cope with?</p>
<p>- Did you have any cheat meals during this time (out of the diet &amp; the E-kit)? If yes, then what and how much / many?</p>
<p>- Do you feel lighter? Clothes fitting a little better? Any inch loss?</p>
<p>- Are you feeling bloated or constipated?</p>
<p>- Are your periods due? <b>[for female clients]</b></p>
<p><span class="im">If you answer these questions soon, I can also see if the diet plan needs any tweaks or changes to make it better.</span></p>
<p>Please do write back to me if there is anything I need to be aware of as well with regard to your meals last 5 days.</p>
<p><strong>P.S.</strong> Sending me regular images of your meals, even your on-rising &amp; bedtime supplements helps me identify minor errors you may be making in plating or portioning. So do send them.</p>
<p>Waiting for your revert to act on &amp; ensure you lose some weight in the next few days!</p>
        `;
    }

    console.log(scale_purchased, 'hello'); 
    if (!Boolean(scale_purchased) && isIndiaNumber) {
      htmlMessage+=`<p>I also wanted you to check the BN BodyScan Smart Scale. This will give us your body fat%, muscle mass, BMR, Metabolic age, and many other parameters to help us track your progress more effectively.</p>
<p>The best part?</p>
<p>These readings and your weight get automatically updated in the BN App 😊. You do not have to do any manual entries.</p>
<p>We can also compare this session with the previous session and have program-wise progress tracked.</p>
<p><a href="https://balancenutrition.in/shop/bn-bodyscan-smart-scale">Click here</a> to check it out</p>`
    }
    if(product_purchased){
      htmlMessage+=`<p>Also, could you let me know which of these items you still have with you? I’ll make sure they’re included in your session. As per our records, you had purchased ${product_purchased} </p>`
    }

    return { status: true, message: htmlMessage };
  } catch (error) {
    console.error(error);
    return { status: false, message: "Internal Server Error" };
  }
}

export function getBufferDays(validity) {
  if (validity === 30) return 15;
  if (validity === 60) return 20;
  if (validity === 90) return 25;
  if (validity === 120) return 30;
  if (validity === 150) return 35;
  if (validity === 180) return 40;
  return 25; // fallback default
}

async function validityAwarenessBufferedDraft({ user_id }) {
  try {
    const SESSION_DAYS = 11; // as per your rule
    const SCHEDULE_LINK =
      "https://www.balancenutrition.in/app_link/screen_id=29/call_type=45";

    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) AS full_name",
      "ud.user_id",
      "ud.user_status",
      "sop.sub_order_id",
      "sop.pending_session",
      "sop.sent_sessions",
      "sop.expiry_date",
      "ps.validity",
      "pm.program_name",
      "DATEDIFF(sop.expiry_date, CURDATE()) AS days_to_expiry",
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
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
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
          field: "pel.id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
      groupBy: ["ud.user_id", "sop.sub_order_id"],
      limit: 1,
    });

    if (!results || results.length === 0) {
      return {
        status: false,
        message: "No active program found for this user.",
      };
    }

    const r = results[0];

    const fullName = r.full_name || "User";
    const programName = r.program_name || "Your Program";
    const programValidity = parseInt(r.validity ?? 0, 10);
    const pendingSessions = parseInt(r.pending_session ?? 0, 10);
    const validityRemain = Math.max(parseInt(r.days_to_expiry ?? 0, 10), 0);

    // ✅ use dynamic buffer logic
    const BUFFER_DAYS = getBufferDays(programValidity);
    const totalValidityWithBuffer = programValidity + BUFFER_DAYS;

    const timeNeededDays = pendingSessions * SESSION_DAYS;
    const shortfall = Math.max(timeNeededDays - validityRemain, 0);

    const greetingName = fullName.split(" ")[0] || "there";

    // Build HTML draft
    let htmlMessage = `
      <p><strong>Validity Awareness Draft</strong>,</p>
      <p>Hi <strong>${greetingName}</strong>,</p>

      <p>I wanted to share an important update regarding your program's validity and sessions:</p>

      <p><strong>Program Enrolled:</strong> ${programName}</p>
      <p><strong>Total Validity (with ${BUFFER_DAYS}-day buffer):</strong> ${totalValidityWithBuffer} days</p>
      <p><strong>Validity Remaining:</strong> ${validityRemain} days</p>
      <p><strong>Sessions Pending:</strong> ${pendingSessions}</p>
      <p><strong>Time Needed to Complete Sessions:</strong> ${timeNeededDays} days (${SESSION_DAYS} days per session)</p>
      <p><strong>Shortfall:</strong> ${shortfall} days</p>
    `;

    if (shortfall > 0) {
      htmlMessage += `
        <p>Since this is the first time you’re falling short of validity days, I can add the extra days as a one-time bonus from my dashboard so that you can complete your sessions without disruption. <strong>I have just done that :)</strong></p>
      `;
    }

    htmlMessage += `
      <p>It is important that you remain regular and focused going forward; irregularity not only affects your program's validity but also your overall health progress and results.</p>

      <p>Let’s make sure we get the most out of your upcoming sessions. Looking forward to your continued commitment.</p>

      <p><strong>P.S.</strong> Feel free to schedule a call with me in case you need any clarity. <a href="${SCHEDULE_LINK}" target="_blank">Click here</a></p>
    `;
    // console.log(htmlMessage);
    return { status: true, message: htmlMessage };
  } catch (error) {
    console.error(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function startDayRecievedDraft({ user_id }) {
  try {
    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.user_id",
      // "COALESCE(apd.date_of_birth,ud.birth_date) as birth_date",
      "ud.start_weight",
      "ud.gender",
      "ud.phone",
      // "COALESCE(apd.height, ud.height) AS height",
      "ud.latest_weight",
      "CONCAT(ud.device,' ',ud.app_version) as app_installed",
      // "apd.goal_weight",
      // "apd.other_goals",
      `(SELECT weight FROM assessment_personal_details WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight",
      "pm.program_name",
      "ps.program_duration",
      "sop.mrp",
      "sop.paid_amount",
      "sop.sent_sessions",
      "sop.pending_session",
      "ud.ethnicity",
      `(SELECT inch_id FROM inch_records WHERE user_id = ${user_id} and session=1 and days=0 and sub_order_id=sop.sub_order_id  ORDER BY inch_id DESC limit 1) as inch_records`,
      `(SELECT COUNT(po.order_id)>0 FROM ${tables.productOrders} po WHERE po.user_id=${user_id} AND po.product_id='bn-bodyscan-smart-scale') as scale_purchased`,
      "wr.weight as start_day_weight",
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('1','2','3') AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as program_no`,
    ];
    const joins = [
      {
        type: "LEFT",
        table: ` ${tables.subOrderPrograms} sop`,
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
        table: `${tables.weightRecords} wr`,
        on: "wr.user_id = ud.user_id and wr.sub_order_id=sop.sub_order_id and wr.weight_type='0' and wr.days=0 and wr.session=0 and wr.weight_acknowledge=0 ",
      },
    ];
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      groupBy: ["ud.user_id"],
    });

    const client = results[0];
    // const age = calculateAge(client.birth_date);
    // console.log(client, 1878);

    if (results.length === 0 || !client.start_day_weight) {
      return { status: false, message: "No Day 5 weight found" };
    }

    const {
      full_name,
      program_name,
      start_day_weight,
      program_duration,
      inch_records,
      scale_purchased,
      phone,
    } = client;

    const userName = full_name || "User";
    const isIndiaNumber = /^(?:\+)?91/.test(phone || "");
    let htmlMessage = `<p><b>Start Weight Auto Draft</b></p>`;

    const basePS = `P.S. We will be asking you to update your weight twice every diet session - i.e., mid-session (day 5) & at the end of the session (day 10). Inches & photo tracker updates will be requested only at the end of every session. Stay alert towards the notifications!`;

    if (!inch_records) {
      htmlMessage += `
    <p>Hi ${userName},</p>

    <p>Thanks for updating your start weight. <strong>${start_day_weight} kg</strong> will be considered as the weight we started the <strong>${program_name} (${program_duration})</strong> with. All the best & stay very regular with updating your trackers when you get notified :)</p>

    <p>I haven't received your inch measurements though. If you fill it out, it helps us track your progress in this program better. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to fill now.</p>

    <p>Your photo was received in the assessment itself. Please do send me a better picture - full length and facing the camera. <strong>CHECK</strong></p>

    <p><em>${basePS}</em></p>
  `;
    } else {
      htmlMessage += `
    <p>Hi ${userName},</p>

    <p>Thanks for updating your start weight. <strong>${start_day_weight} kg</strong> will be considered as the weight we started the current program - <strong>${program_name} (${program_duration})</strong> with. All the best & stay very regular with updates for trackers when you get notified. :)</p>

    <p>I have received your inch measurements as well. Your photo was received in the assessment itself. However, if you can send me a better one - head to toe - that would be great.</p>

    <p>All the best!</p>

    <p><em>${basePS}</em></p>
  `;
    }

    console.log(scale_purchased, 'hello'); 

    if (!Boolean(scale_purchased) && isIndiaNumber) {
      htmlMessage+=`<p>What weighing scale are you using at the moment? Is it a smart scale that can tell us the fat percentage, muscle mass, et cetera?</p>`
    }

    // console.log(htmlMessage, 2083);

    return { status: true, message: htmlMessage };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
// startDayRecievedDraft({ user_id:116934 }) ;

async function tenthDayRecievedDraft({ user_id }) {
  console.log(2147, "tenthDayRecievedDraft called");
  try {
    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.user_id",
      "ud.start_weight",
      "ud.gender",
      "ud.latest_weight",
      "ud.height",
      "ud.phone",
      "CONCAT(ud.device,' ',ud.app_version) as app_installed",
      `(SELECT weight FROM assessment_personal_details WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight",
      "pm.program_name",
      "ps.program_duration",
      "sop.mrp",
      "sop.paid_amount",
      "sop.sub_order_id",
      "sop.sent_sessions",
      "sop.pending_session",
      `(SELECT DATEDIFF(CURDATE(), DATE(posted_date)) FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as previous_end_weight_days_ago`,
      `(SELECT end_session_weight  FROM diet_session_log WHERE user_id =  ${user_id}  and diet_status='4' and sub_order_id=sop.sub_order_id and session=sop.sent_sessions-1 limit 1) as previous_end_weight`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as wmr_start`,
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "ud.ethnicity",
      `(SELECT COUNT(po.order_id)>0 FROM ${tables.productOrders} po WHERE po.user_id=${user_id} AND po.product_id='bn-bodyscan-smart-scale') as scale_purchased`,
      "wr.weight as tenth_day_weight",
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('1','2','3') AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as program_no`,
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status = '4' AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as adv_program_count`,
      `(SELECT hs.body_mass_index from ${tables.healthScoreClient} hs WHERE hs.user_id = ${user_id} ORDER BY hs.created ASC LIMIT 1) as starting_bmi`,
      `mg.comment`,
      `(Select Group_Concat(po.product_name) FROM ${tables.productOrders} po WHERE po.user_id=${user_id} and po.payment_status="Success" and po.status="Delivered" and po.brand!='doctorstore' and po.updated_at > DATE_SUB(NOW(), INTERVAL 15 DAY)) as product_purchased`,
  
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sent_sessions = dsl.session and dsl.sub_order_id=sop.sub_order_id",
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
        table: `${tables.weightRecords} wr`,
        on: "wr.user_id = ud.user_id and wr.sub_order_id=sop.sub_order_id and wr.weight_type='0' and wr.days=10 and wr.session=sop.sent_sessions and wr.weight_acknowledge=0 ",
      },
      {
        type: "LEFT",
        table: `${tables.bnMyGoalsNew} mg`,
        on: "mg.sub_order_id = sop.sub_order_id ",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      groupBy: ["ud.user_id"],
    });

    const client = results[0];

    if (results.length === 0 || !client.tenth_day_weight) {
      return { status: false, message: "No Day 10 weight found" };
    }

    const {
      full_name,
      tenth_day_weight,
      scale_purchased, 
      start_session_weight,
      previous_end_weight_days_ago,
      end_session_weight,
      start_program_weight,
      sent_sessions,
      pending_session,
      program_name,
      previous_end_weight,
      assessment_start_weight,
      mid_session_weight,
      wmr_start,
      sub_order_id,
      adv_program_count,
      height,
      starting_bmi,
      comment,
      phone,
      product_purchased,
    } = client;

    // Calculate weight loss for the session
    let endSessionLoss;

    if (sent_sessions == 1) {
      endSessionLoss = (
        parseFloat(Number(previous_end_weight) || wmr_start) -
        parseFloat(tenth_day_weight)
      ).toFixed(2);
    } else if (pending_session == 0) {
      endSessionLoss = (
        parseFloat(start_program_weight || wmr_start) -
        parseFloat(tenth_day_weight)
      ).toFixed(2);
    } else {
      if (previous_end_weight == 0) {
        endSessionLoss = (
          parseFloat(wmr_start) - parseFloat(tenth_day_weight)
        ).toFixed(2);
      } else {
        endSessionLoss = (
          parseFloat(Number(previous_end_weight) || wmr_start) -
          parseFloat(tenth_day_weight)
        ).toFixed(2);
      }
    }
    console.log(client, 2176);
    console.log(endSessionLoss, 2177);
    // Calculate overall weight loss (from start_program_weight)
    const overallWeightLoss = start_program_weight
      ? (
          parseFloat(start_program_weight) - parseFloat(tenth_day_weight)
        ).toFixed(3)
      : 0;
    // if (endSessionLoss <= 0.1) {
    //   return {
    //     status: false,
    //     message: "Weight loss is too low to send auto draft",
    //   };
    // }
    // Calculate last 5 days weight loss (assuming tenth_day_weight is recent)
    let lastFiveDaysLoss = null;

    if (mid_session_weight && start_session_weight) {
      lastFiveDaysLoss = parseFloat(
        start_session_weight - mid_session_weight
      ).toFixed(2);
    }

    const userName = full_name || "User";
    const currentSession = sent_sessions || 1;
    const goal_comment = safeJSONParse(comment, {
      new_goals: [],
      goals_achieved: [],
      milestone_achieved: [],
      pending_goals: [],
    });
    const curr_weight_status =
      endSessionLoss > 0
        ? "loss"
        : endSessionLoss < 0
        ? "gain"
        : "no gain or loss";
    const overall_weight_status =
      overallWeightLoss > 0
        ? "loss"
        : overallWeightLoss < 0
        ? "gain"
        : "no gain or loss";
    const curr_bmi = calculateBMI(tenth_day_weight, height);
    let startingBmi =
      starting_bmi ||
      calculateBMI(assessment_start_weight || start_program_weight, height);
    const isIndiaNumber = /^(?:\+)?91/.test(phone || "");
    // Determine weight-based message
    let weightMessage = "";
    const goalWeight = client.goal_weight || 0; // Assume goal_weight is fetched or provided
    const currentWeight = parseFloat(tenth_day_weight);
    const weightDifference = Math.abs(currentWeight - goalWeight);
    if (endSessionLoss >= 1) {
      weightMessage = `Kudos for losing 1kg in this session!  In ${sent_sessions} sessions so far, you have lost ${endSessionLoss} kg. We have ${pending_session} more sessions pending.`;
    } else if (currentWeight > 70) {
      weightMessage = `<p>I was hoping to see more loss in the current session as per the diet I sent you.</p>`;
    } else if (weightDifference <= 2) {
      weightMessage = `<p>Given you are close to your goal weight, this is not as bad as it looks :) We'll do better.</p>`;
    } else {
      weightMessage = `<p>I was hoping we'd lose a little more weight, but never mind, we'll do better in the next session in terms of the scale :)</p>`;
    }

    // Generate the auto-draft message for inch and photo trackers
    const inchCommonText = await generateAutoDraftMessage({
      user_id,
      sub_order_id: sub_order_id,
      session_number: sent_sessions,
      actual_session: sent_sessions,
      pending_session,
      previous_end_weight,
      end_sessions_loss: endSessionLoss,
    });

    // Construct the main message
    let weight_loss_message = `<p>Hi ${userName},</p>
    <p>Just saw your weight tracker updates. ${
      lastFiveDaysLoss > 0
        ? `You have lost ${lastFiveDaysLoss} kg in the last 5 days &`
        : ""
    } ${endSessionLoss} kg overall in this session.</p>
    <p>In ${currentSession} sessions so far, you have lost ${overallWeightLoss} kg. We have ${pending_session} more sessions pending.</p>
    ${weightMessage}`;
    let pending_session_text =
      pending_session > 0
        ? `We have ${pending_session} more sessions pending.`
        : "we have no more sessions of this program pending.";

    let goal_text = "";
    if (goal_comment.milestone_achieved.length > 0) {
      goal_text +=
        "<p>You also achieved a few milestones in this program :)</p><ol>";
      goal_comment.milestone_achieved.forEach((goal) => {
        goal_text += `<li>${goal}</li>`;
      });
      goal_text += "</ol>";
      if (goal_comment.new_goals.length > 0) {
        goal_text += `<p>Keeping your other goals in mind:  </p><ol>`;
        goal_comment.new_goals.forEach((goal) => {
          goal_text += `<li>${goal}</li>`;
        });
        goal_text += "</ol>";
      }
      if (endSessionLoss != 0) {
        goal_text += `<p>I want you to take a look at 60 days / 90 days of (prog pitched deep link or keep all ). We now have 5 calls for every program instead of 3 & also a new e kit in addition to the existing one :)
  Take a look: add pitched e kit or all</p>`;
      }
    }

    let no_gain_no_loss_message = `<p>As per your update, we have lost no weight in the current session ${currentSession}.  In ${
      currentSession - 1
    } sessions so far, you have ${overall_weight_status} ${overallWeightLoss} kg. ${pending_session_text} </p>`;

    let gain_weight_message = no_gain_no_loss_message;
    gain_weight_message += `<p>I was expecting a higher loss given the last diet plan & its effectiveness.
</p>`;
    if (endSessionLoss < 0 && endSessionLoss > -0.5) {
      // ? gain b/w 0.1 to 0.5 kg
      gain_weight_message += `<p>Though the gain is not high, if the diet was followed really well, we could have seen a good loss on the scale.</p>
      <p>While I wait for these updates, let me understand if there was anything we could have done better or any other reason: <b>CHOOSE AS APPLICABLE MENTOR</b></p> <p>Have you followed the diet 100%? If not, what part of the diet was most compromised? lunch?</p> <p>Were there in misses? mid meals? supplements?</p> <p>How was your sleep the last few days? slept good 7-8 hours? Any late nights?</p> <p>Water intake was good? Or compromised?</p> <p>Are you suffering from constipation or bowels not clear? Feeling bloated? Gassy?</p> <p>Any parties you attended or at home where you ate out of the restaurant guide? Alcohol consumption if any?</p> <p>Do you feel lighter? Any visible loss?</p> <p><b>IF WOMAN</b> Are you having any PMS symptoms? What about periods?</p> <p><b>IF ANY SESSIONS THERE </b>- Help me with how are the next 10 days planned out. Can we do a very good session that will get you to lose well on the scale? May need a little effort at your end but worth it :)</p> <p><b>P.S.</b> I would also like to connect with you over a call to understand the reasons for the gain / ANY OTHER ...... <a href=https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 >Click here</a></p>
      `;
    }

    if (pending_session <= 3 && adv_program_count == 0) {
      no_gain_no_loss_message += `<p>You now weigh ${tenth_day_weight} kg & if we now see your goal, you still have ${weightDifference} kg to lose. Your BMI is ${curr_bmi} as against ${startingBmi} when you started with us. The ideal BMI range is 21 to 24.99 kg/m2</p>`;
    }

    let htmlMessage = `<p><strong>10th Day Weight Update Auto Draft</strong></p>
    ${
      endSessionLoss > 0
        ? weight_loss_message
        : endSessionLoss == 0
        ? no_gain_no_loss_message
        : gain_weight_message
    }
    ${inchCommonText}`;
    if (pending_session <= 3 && adv_program_count == 0 && endSessionLoss <= 0) {
      htmlMessage += goal_text;
    }

    console.log(scale_purchased, 'hello'); 

    console.log(htmlMessage, 2293);
    if (!Boolean(scale_purchased) && isIndiaNumber) {
      htmlMessage+=`<p>What weighing scale are you using at the moment? Is it a smart scale that can tell us the fat percentage, muscle mass, et cetera?</p>`
    }
    if(product_purchased){
      htmlMessage+=`<p>Also, could you let me know which of these items you still have with you? I’ll make sure they’re included in your session. As per our records, you had purchased ${product_purchased} </p>`
    }
    
    return { status: true, message: htmlMessage };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function generateAutoDraftMessage({
  user_id,
  sub_order_id,
  session_number,
  actual_session,
  pending_session,
  end_sessions_loss,
}) {
  let text = "";
  let inch_common_text = "";

  // Fetch previous inch tracker
  const prev_inch_tracker = await getPreviousInchTracker(
    sub_order_id,
    session_number
  );
  console.log(prev_inch_tracker, 2118);

  // Fetch current inch tracker
  const inch_tracker = await getInchTracker(sub_order_id, session_number);
  console.log(inch_tracker, 2122);

  // Fetch photo tracker
  const photo_tracker = await getPhotoTracker(sub_order_id, actual_session);

  // Calculate inch losses
  const hips_loss = Number(
    inch_tracker.hips - prev_inch_tracker.hips || 0
  ).toFixed(2);
  const waist_loss = Number(
    inch_tracker.waist - prev_inch_tracker.waist || 0
  ).toFixed(2);
  const chest_loss = Number(
    inch_tracker.chest - prev_inch_tracker.chest || 0
  ).toFixed(2);

  // Calculate overall inch losses (sum only losses, exclude gains, skip for first session)
  let overall_waist_loss = 0;
  let overall_hips_loss = 0;
  let overall_chest_loss = 0;
  if (session_number > 1) {
    const all_inch_trackers = await getAllInchTrackers(sub_order_id); // Assume this fetches all inch trackers for the program
    all_inch_trackers.forEach((tracker) => {
      if (tracker.waist_loss > 0) overall_waist_loss += tracker.waist_loss;
      if (tracker.hips_loss > 0) overall_hips_loss += tracker.hips_loss;
      if (tracker.chest_loss > 0) overall_chest_loss += tracker.chest_loss;
    });
  }

  // Check if inch and photo trackers are updated
  const inchTrackerUpdated = Object.keys(inch_tracker).length > 0;
  const photoTrackerUpdated = Object.keys(photo_tracker).length > 0;

  if (!inchTrackerUpdated && !photoTrackerUpdated) {
    inch_common_text = `<p>You haven't updated your inch & photo trackers.</p>
    <p>You'll not just earn BN Wallet money, but it will also help me understand the impact of the last session, irrespective of the weight.</p>
    <p>Helps me make a more accurate diet plan for you as well.</p>
    <p><a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here to update your inch tracker.</a></p>
    <p><a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here to update your photo tracker.</a></p>`;
  } else if (inchTrackerUpdated && !photoTrackerUpdated) {
    let inchMessage = "";
    if (chest_loss > 0 || waist_loss > 0 || hips_loss > 0) {
      let lossDetails = [];
      if (chest_loss > 0)
        lossDetails.push(
          `lost ${chest_loss} inch${chest_loss == 1 ? "" : "es"} on the chest`
        );
      if (waist_loss > 0)
        lossDetails.push(
          `lost ${waist_loss} inch${waist_loss == 1 ? "" : "es"} on the waist`
        );
      if (hips_loss > 0)
        lossDetails.push(
          `lost ${hips_loss} inch${hips_loss == 1 ? "" : "es"} on the hip`
        );
      if (chest_loss < 0)
        lossDetails.push(
          `gained ${Math.abs(chest_loss)} inch${
            Math.abs(chest_loss) == 1 ? "" : "es"
          } on the chest`
        );
      if (waist_loss < 0)
        lossDetails.push(
          `gained ${Math.abs(waist_loss)} inch${
            Math.abs(waist_loss) == 1 ? "" : "es"
          } on the waist`
        );
      if (hips_loss < 0)
        lossDetails.push(
          `gained ${Math.abs(hips_loss)} inch${
            Math.abs(hips_loss) == 1 ? "" : "es"
          } on the hip`
        );
      inchMessage = `<p>You also have a good inch loss on your ${
        lossDetails.length > 1
          ? lossDetails.slice(0, -1).join(", ") + " & " + lossDetails.slice(-1)
          : lossDetails[0]
      }.</p>`;
      if (session_number > 1) {
        inchMessage += `<p>Overall, you have lost ${overall_chest_loss.toFixed(
          2
        )} inch${
          overall_chest_loss == 1 ? "" : "es"
        } on the chest & ${overall_waist_loss.toFixed(2)} inch${
          overall_waist_loss == 1 ? "" : "es"
        } on the waist so far.</p>`;
      }
    } else if (chest_loss == 0 && waist_loss == 0 && hips_loss == 0) {
      inchMessage = `<p>You have not lost much in inches in this session.</p>`;
      if (
        session_number > 1 &&
        (overall_waist_loss > 0 || overall_hips_loss > 0)
      ) {
        inchMessage += `<p>Overall, you have lost ${overall_waist_loss.toFixed(
          2
        )} inch${
          overall_waist_loss == 1 ? "" : "es"
        } on the waist & ${overall_hips_loss.toFixed(2)} inch${
          overall_hips_loss == 1 ? "" : "es"
        } on the hips so far.</p>`;
      }
    } else {
      let gainDetails = [];
      if (chest_loss < 0)
        gainDetails.push(
          `${Math.abs(chest_loss)} inch${
            Math.abs(chest_loss) == 1 ? "" : "es"
          } on your chest`
        );
      if (waist_loss < 0)
        gainDetails.push(
          `${Math.abs(waist_loss)} inch${
            Math.abs(waist_loss) == 1 ? "" : "es"
          } on your waist`
        );
      if (hips_loss < 0)
        gainDetails.push(
          `${Math.abs(hips_loss)} inch${
            Math.abs(hips_loss) == 1 ? "" : "es"
          } on your hips`
        );
      inchMessage = `<p>You have gained ${
        gainDetails.length > 1
          ? gainDetails.slice(0, -1).join(", ") + " & " + gainDetails.slice(-1)
          : gainDetails[0]
      }. This is not a good sign.</p>`;
      if (session_number > 1) {
        inchMessage += `<p>Overall, you have lost ${overall_waist_loss.toFixed(
          2
        )} inch${
          overall_waist_loss == 1 ? "" : "es"
        } on the waist & ${overall_hips_loss.toFixed(2)} inch${
          overall_hips_loss == 1 ? "" : "es"
        } on the hips so far.</p>`;
      }
    }
    inch_common_text = `${inchMessage}
    <p>Could you also update the photo tracker with your recent full-length photo, preferably taken today? <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here to do so.</a> (You will get complete privacy & they won't be shared without your permission.)</p>`;
  } else if (inchTrackerUpdated && photoTrackerUpdated) {
    let inchMessage = "";
    if (chest_loss > 0 || waist_loss > 0 || hips_loss > 0) {
      let lossDetails = [];
      if (chest_loss > 0)
        lossDetails.push(
          `lost ${chest_loss} inch${chest_loss == 1 ? "" : "es"} on the chest`
        );
      if (waist_loss > 0)
        lossDetails.push(
          `lost ${waist_loss} inch${waist_loss == 1 ? "" : "es"} on the waist`
        );
      if (hips_loss > 0)
        lossDetails.push(
          `lost ${hips_loss} inch${hips_loss == 1 ? "" : "es"} on the hip`
        );
      if (chest_loss < 0)
        lossDetails.push(
          `gained ${Math.abs(chest_loss)} inch${
            Math.abs(chest_loss) == 1 ? "" : "es"
          } on the chest`
        );
      if (waist_loss < 0)
        lossDetails.push(
          `gained ${Math.abs(waist_loss)} inch${
            Math.abs(waist_loss) == 1 ? "" : "es"
          } on the waist`
        );
      if (hips_loss < 0)
        lossDetails.push(
          `gained ${Math.abs(hips_loss)} inch${
            Math.abs(hips_loss) == 1 ? "" : "es"
          } on the hip`
        );
      inchMessage = `<p>You also have a good inch loss on your ${
        lossDetails.length > 1
          ? lossDetails.slice(0, -1).join(", ") + " & " + lossDetails.slice(-1)
          : lossDetails[0]
      }.</p>`;
      if (session_number > 1) {
        inchMessage += `<p>Overall, you have lost ${overall_chest_loss.toFixed(
          1
        )} inch${
          overall_chest_loss == 1 ? "" : "es"
        } on the chest & ${overall_waist_loss.toFixed(1)} inch${
          overall_waist_loss == 1 ? "" : "es"
        } on the waist so far.</p>`;
      }
    } else if (chest_loss == 0 && waist_loss == 0 && hips_loss == 0) {
      inchMessage = `<p>You have not lost much in inches in this session. Are your clothes fitting better?</p>`;
      if (
        session_number > 1 &&
        (overall_waist_loss > 0 || overall_hips_loss > 0)
      ) {
        inchMessage += `<p>Overall, you have lost ${overall_waist_loss.toFixed(
          1
        )} inch${
          overall_waist_loss == 1 ? "" : "es"
        } on the waist & ${overall_hips_loss.toFixed(1)} inch${
          overall_hips_loss == 1 ? "" : "es"
        } on the hips so far.</p>`;
      }
    } else {
      let gainDetails = [];
      if (chest_loss < 0)
        gainDetails.push(
          `${Math.abs(chest_loss)} inch${
            Math.abs(chest_loss) == 1 ? "" : "es"
          } on your chest`
        );
      if (waist_loss < 0)
        gainDetails.push(
          `${Math.abs(waist_loss)} inch${
            Math.abs(waist_loss) == 1 ? "" : "es"
          } on your waist`
        );
      if (hips_loss < 0)
        gainDetails.push(
          `${Math.abs(hips_loss)} inch${
            Math.abs(hips_loss) == 1 ? "" : "es"
          } on your hips`
        );
      inchMessage = `<p>You have gained ${
        gainDetails.length > 1
          ? gainDetails.slice(0, -1).join(", ") + " & " + gainDetails.slice(-1)
          : gainDetails[0]
      }. This is not a good sign.</p>`;
      if (session_number > 1) {
        inchMessage += `<p>Overall, you have lost ${overall_waist_loss.toFixed(
          1
        )} inch${
          overall_waist_loss == 1 ? "" : "es"
        } on the waist & ${overall_hips_loss.toFixed(1)} inch${
          overall_hips_loss == 1 ? "" : "es"
        } on the hips so far.</p>`;
      }
    }
    // Check photo tracker validity (assume a function to validate photo)
    // const isPhotoValid = await validatePhotoTracker(photo_tracker); // Placeholder function;
    console.log(photo_tracker, 2569);
    console.log(photoTrackerUpdated, 2575);
    if (photoTrackerUpdated) {
      inch_common_text = `${inchMessage}
      <p>I have also seen your photo tracker. Could you please upload a clearer full-length photo taken today? <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here to do so.</a> (You will get complete privacy & they won't be shared without your permission.)</p>`;
    } else {
      inch_common_text = `${inchMessage}
      <p>I have also seen your photo tracker. It looks great, keep up the good work!</p>`;
    }
  }

  // Common questions
  let commonQuestions = `<p>While I wait for these updates at your end, why don't you also let me know the following:</p>
  <ol>
    <li>Were you able to follow all options correctly? What about supplements?</li>
    <li>Did you have any of these: late nights? Bloating or constipation?</li>
    <li>Have you had a restful sleep most nights for at least 7 hours?</li>
    <li>Did you miss any meal options from the diet & eat other options that you thought were healthy?</li>
    <li>For the next session, is there anything you need me to keep in mind before planning it? Please do write back to me in detail.</li>
    <li>Are your clothes fitting better?</li>
    <li>Were there any meals you consumed outside? Please update them in the restaurant guide if you haven't. <a href="https://www.balancenutrition.in/app_link/screen_id=restaurant_guide">Click here.</a></li>
  </ol>
  <p>Let me also know what supplements you have lying unused at home from the previous sessions. I will use them in the next diet too.</p>`;
  if (end_sessions_loss > 0.499) {
    commonQuestions = `<p>While I wait for these updates at your end, why don't you also let me know the following:</p>

<p>Were you able to follow all options correctly? What about supplements?</p>

<ol>
  <li>Are you going to be on any travel in the next 10 days? If yes, send me the location & number of days.</li>
  <li>Any meal outings that I must factor in?</li>
  <li>I wanted to send you a diet that is going to need a little pre-prep at your end, but at this point in time, we need to... can I?</li>
  <li>Any cravings :) I don't promise, but I can tryyyy to add them to the session.</li>
  <li>I wanted you to follow a gluten-free / vegan / dairy free diet for the next 10 days. This is the right time for a break in the monotony :)</li>
  <li>I am planning to send you a diet that will be alkalizing in nature. It is a vegetarian diet free of acidic foods. At this point, it is the ideal fit to give us results.</li>
  <li>I am planning to give you a diet in which you get to have salt only in your main meals. Lunch & dinner. You will love the options & at this point in the program, we should be doing so to get results.</li>
  <li>At this point, we need a diet that will give effective results. This diet has 2 options that are quick, small, easy meals (semi-liquids) & 1 proper meal option. I am planning on these lines for you.</li>
</ol>

<p>Let me also know what supplements you have lying unused at home from the previous sessions. I will use them in the next diet too.</p>

<p>CHECK IF ANY GUIDE NEEDS TO BE ACTIVATED & DO SO</p>

<p>These above questions: See the older chats and ask - if good inch loss then explain how it is nice to see fat loss.</p>
`;
  } else if (end_sessions_loss === 0) {
    commonQuestions = `<p>While I wait for these updates at your end, why don't you also let me know the following:</p>
  <ol>
    <li>Were you able to follow all options correctly? What about supplements?</li>
    <li>Did you have any late nights? Any outside meals?</li>
    <li>Any bloating or constipation?</li>
    <li>Have you had a restful sleep most nights for at least 7 hours?</li>
    <li>How are your next 10-15 days planned?</li>
    <li>Will you be able to follow the diet well?</li>
  </ol>
  <p>Please help me understand what's not working here. Just answer these questions in detail & I'll see what best can be done in the remaining days we have at hand to get a good result.</p>`;
  } else if (end_sessions_loss < 0) {
    commonQuestions = `<p>While I wait for these updates, let me understand if there was anything we could have done better or any other reason (choose as applicable):</p>
  <ol>
    <li>Have you followed the diet 100%? If not, what part of the diet was most compromised? Lunch?</li>
    <li>Were there any misses? Mid meals? Supplements?</li>
    <li>How was your sleep the last few days? Slept a good 7-8 hours? Any late nights?</li>
    <li>Was your water intake good or compromised?</li>
    <li>Are you suffering from constipation or bowels not clear? Feeling bloated or gassy?</li>
    <li>Any parties you attended or meals at home where you ate out of the restaurant guide? Alcohol consumption?</li>
    <li><strong>For women:</strong> Are you experiencing any PMS symptoms? What about your periods?</li>
    ${
      pending_session > 0
        ? "<li> How are the next 10 days planned out? Can we aim for a strong finish to this session? May need a little effort at your end but it'll be worth it :)</li>"
        : ""
    }
  </ol>`;
    commonQuestions += `<p>P.S. I would also like to connect with you over a call to understand the reasons for the gain / ANY OTHER ...... </p>`;
  }
  text += inch_common_text + commonQuestions;

  return text;
}

async function getAllInchTrackers(sub_order_id) {
  try {
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.inchRecords}`,
      conditions: [
        { field: "sub_order_id", operator: "=", value: sub_order_id },
      ],
    });
    return results;
  } catch (error) {
    console.error("Error fetching all inch trackers:", error);
    return [];
  }
}
async function validatePhotoTracker({ user_id }) {
  try {
    const { results } = await readRecord({
      selectFields: ["pr.photo_id"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.photoRecords} pr`,
          on: "cd.user_id = pr.user_id AND pr.sub_order_id = cd.active_order_id AND pr.session=sop.sent_sessions",
        },
      ],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      limit: 1,
    });
    if (results.length === 0) {
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error validating photo tracker:", error);
    return false;
  }
}
async function fifthDayRecievedChat({ user_id }) {
  try {
    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.user_id",
      "ud.first_name",
      // "COALESCE(apd.date_of_birth,ud.birth_date) as birth_date",
      "ud.start_weight",
      "ud.gender",
      // "COALESCE(apd.height, ud.height) AS height",
      "ud.latest_weight",
      "CONCAT(ud.device,' ',ud.app_version) as app_installed",
      // "apd.goal_weight",
      // "apd.other_goals",
      `(SELECT weight FROM assessment_personal_details WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight",
      "pm.program_name",
      "ps.program_duration",
      "sop.mrp",
      "sop.paid_amount",
      "sop.sent_sessions",
      "sop.pending_session",
      `(SELECT end_session_weight  FROM diet_session_log WHERE user_id =  ${user_id}  and diet_status='4' and sub_order_id=sop.sub_order_id and session=sop.sent_sessions-1 limit 1) as previous_end_weight`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as wmr_start`,
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "ud.ethnicity",
      "ud.mentor_assigned",
      "wr.weight as fifth_day_weight",
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('1','2','3') AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as program_no`,
    ];
    const joins = [
      {
        type: "LEFT",
        table: ` ${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sent_sessions = dsl.session and dsl.sub_order_id=sop.sub_order_id",
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
        table: `${tables.weightRecords} wr`,
        on: "wr.user_id = ud.user_id and wr.sub_order_id=sop.sub_order_id and wr.weight_type='0' and wr.days=5 and wr.session=sop.sent_sessions and wr.weight_acknowledge=0  ",
      },
    ];
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      groupBy: ["ud.user_id"],
    });

    const client = results[0];
    // const age = calculateAge(client.birth_date);
    console.log(client, 1878);

    // if (results.length === 0 || !client.fifth_day_weight) {
    //   return { status: false, message: "No Day 5 weight found" };
    // }

    const {
      full_name,
      fifth_day_weight,
      start_session_weight,
      end_session_weight,
      start_program_weight,
      sent_sessions,
      pending_session,
      program_name,
      previous_end_weight,
      assessment_start_weight,
      wmr_start,
    } = client;
    console.log(
      full_name,
      fifth_day_weight,
      start_session_weight,
      end_session_weight,
      start_program_weight,
      sent_sessions,
      pending_session,
      program_name,
      previous_end_weight,
      assessment_start_weight,
      wmr_start
    );

    const midSessionLoss = (
      parseFloat(
        Number(previous_end_weight) || wmr_start || start_session_weight
      ) - parseFloat(fifth_day_weight)
    )?.toFixed(2);
    // console.log(midSessionLoss);

    // return;
    const overallLoss = start_program_weight
      ? parseFloat(start_program_weight) - parseFloat(fifth_day_weight)
      : 0;
    const userName = full_name || "User";
    const currentSession = sent_sessions || 1;

    let htmlMessage = `<p>Hi ${userName},</p>
<p>I have received your mid-session weight update for the ${currentSession}<sup>${
      currentSession === 1
        ? "st"
        : currentSession === 2
        ? "nd"
        : currentSession === 3
        ? "rd"
        : "th"
    }</sup> session.</p>
`;

    if (midSessionLoss > 0) {
      htmlMessage += `<p>You have <strong>lost ${midSessionLoss} kg</strong> in 5 days.</p>`;
    } else if (midSessionLoss < 0) {
      htmlMessage += `<p>You have <strong>gained ${Math.abs(
        midSessionLoss
      ).toFixed(2)} kg</strong> in 5 days.</p>`;
    } else {
      htmlMessage += `<p>You haven't lost any weight in 5 days.</p>`;
    }

    htmlMessage += `
  <p>While I take a look at all other parameters, let me know which options you chose from the diet shared?</p>
  <p>If you have had any meals outside & not updated them in the Restaurant Guide, <b><a href="https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}">Update Here</a></b></p>
  <p>Getting back to you shortly :)</p>
`;
    console.log(htmlMessage, 2284);

    const insertChat = await clientEnquiry.create({
      user_id: client.user_id,
      name: client.first_name,
      query: htmlMessage,
      mentor_id: client.mentor_assigned,
      sender: "mentor",
      type: "broadcast",
    });
    if (insertChat) {
      console.log(insertChat, 2294);
      return { status: true, message: "Auto chat added successfully" };
    }

    return { status: true, message: htmlMessage };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

// fifthDayRecievedChat({user_id:84140})

// tenthDayRecievedChat({user_id:127441})

async function tenthDayRecievedChat({ user_id }) {
  try {
    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.user_id",
      "ud.first_name",
      "ud.start_weight",
      "ud.gender",
      "ud.latest_weight",
      "CONCAT(ud.device,' ',ud.app_version) as app_installed",

      `(SELECT weight FROM assessment_personal_details WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight",
      "pm.program_name",
      "pm.program_id",
      "ps.program_duration",
      "sop.mrp",
      "sop.paid_amount",
      "sop.sent_sessions",
      "sop.pending_session",
      "ud.mentor_assigned",
      `(SELECT DATEDIFF(CURDATE(), DATE(posted_date)) FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as previous_end_weight_days_ago`,
      `(SELECT end_session_weight  FROM diet_session_log WHERE user_id =  ${user_id}  and diet_status='4' and sub_order_id=sop.sub_order_id and session=sop.sent_sessions-1 limit 1) as previous_end_weight`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as wmr_start`,
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "dsl.diet_id",
      "ud.ethnicity",
      "wr.weight as tenth_day_weight",
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('1','2','3') AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as program_no`,
    ];
    const joins = [
      {
        type: "LEFT",
        table: ` ${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sent_sessions = dsl.session and dsl.sub_order_id=sop.sub_order_id",
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
        table: `${tables.weightRecords} wr`,
        on: "wr.user_id = ud.user_id and wr.sub_order_id=sop.sub_order_id and wr.weight_type='0' and wr.days=10 and wr.session=sop.sent_sessions and wr.weight_acknowledge=0 ",
      },
    ];
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      groupBy: ["ud.user_id"],
    });

    const client = results[0];
    // const age = calculateAge(client.birth_date);
    console.log(client, 1878);

    // if (results.length === 0 || !client.tenth_day_weight) {
    //   return { status: false, message: "No Day 10 weight found" };
    // }

    const {
      full_name,
      tenth_day_weight,
      start_session_weight,
      previous_end_weight_days_ago,
      end_session_weight,
      start_program_weight,
      sent_sessions,
      pending_session,
      program_name,
      previous_end_weight,
      assessment_start_weight,
      wmr_start,
      program_id,
    } = client;
    let imfIds = [
      91, 92, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 118, 123, 151,
      152, 167, 168, 8, 50, 51,
    ];
    let endSessionLoss;
    if (sent_sessions == 1) {
      endSessionLoss = (
        parseFloat(Number(previous_end_weight) || wmr_start) -
        parseFloat(tenth_day_weight)
      )?.toFixed(2);
    } else if (pending_session == 0) {
      endSessionLoss = (
        parseFloat(wmr_start) - parseFloat(tenth_day_weight)
      )?.toFixed(2);
    } else {
      if (previous_end_weight == 0) {
        endSessionLoss = (
          parseFloat(wmr_start) - parseFloat(tenth_day_weight)
        )?.toFixed(2);
      } else {
        endSessionLoss = (
          parseFloat(Number(previous_end_weight) || wmr_start) -
          parseFloat(tenth_day_weight)
        )?.toFixed(2);
      }
    }
    // console.log(previous_end_weight,2113);

    // console.log(endSessionLoss,2115);
    const overallLoss = start_program_weight
      ? parseFloat(start_program_weight) - parseFloat(tenth_day_weight)
      : 0;
    const userName = full_name || "User";
    const currentSession = sent_sessions || 1;

    let htmlMessage = `<p>Hi ${userName},</p>
<p>I have received your end-session weight update for the ${currentSession}<sup>${
      currentSession === 1
        ? "st"
        : currentSession === 2
        ? "nd"
        : currentSession === 3
        ? "rd"
        : "th"
    }</sup> session.</p>
`;
    if (currentSession != 1 && previous_end_weight != 0) {
      htmlMessage += `<p>Your last weight recorded with us was <strong>${previous_end_weight} kg</strong> (${previous_end_weight_days_ago} days ago).</p>`;
    }
    if (endSessionLoss > 0) {
      htmlMessage += `<p>So we have <strong>lost ${endSessionLoss} kg</strong> in this session overall.</p>`;
    } else if (endSessionLoss < 0) {
      htmlMessage += `<p>So we have <strong>gained ${Math.abs(
        endSessionLoss
      ).toFixed(2)} kg</strong> in this session.</p>`;
    } else {
      htmlMessage += `<p>So we <strong>haven't lost any weight</strong> in this session.</p>`;
    }
    if (imfIds.includes(program_id)) {
      htmlMessage += `
<p>While I check all other details & get back to you, please answer these IMPORTANT questions for me: <b><a href="https://balancenutrition.in/imf-feedback?diet_id=${client.diet_id}">Click here</a></b></p>
<p><strong>P.S.</strong> Please share any leftover superfoods, teas & supplements you have from your previous sessions. I shall try & add them to your next diet plan :)</p>
<p><strong>PPS:</strong> If you have had any meals outside & not updated them in the Restaurant Guide, <b><a href="https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}">Update Here</a></b></p>
`;
    } else {
      htmlMessage += `
<p>While I check all other details & get back to you, please answer these IMPORTANT questions for me: <b><a href="https://balancenutrition.in/diet-feedback?diet_id=${client.diet_id}">Click here</a></b></p>
<p><strong>P.S.</strong> Please share any leftover superfoods, teas & supplements you have from your previous sessions. I shall try & add them to your next diet plan :)</p>
<p><strong>PPS:</strong> If you have had any meals outside & not updated them in the Restaurant Guide, <b><a href="https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}">Update Here</a></b></p>
`;
    }

    console.log(htmlMessage, 2432);

    const insertChat = await clientEnquiry.create({
      user_id: client.user_id,
      name: client.first_name,
      query: htmlMessage,
      mentor_id: client.mentor_assigned,
      sender: "mentor",
      type: "broadcast",
    });
    if (insertChat) {
      const sendNotification = axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [client.user_id],
          notification_id: "437",
          sent_via: "cron",
        }
      );
      console.log(insertChat, 2443);
      return { status: true, message: "Auto chat added successfully" };
    }

    return { status: true, message: htmlMessage };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function halfTimeCallDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2908 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: `	(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function tailendCallDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2909 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 9 AND 10 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function halfTimeFeedbackDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2910 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 9 AND 10 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hf.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function programFeedbackDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2911 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 7 AND 10 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "ff.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function halfTimeHsDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2913 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          on: "hf.user_id = ud.user_id AND DATE(hf.created) > DATE(dsl.diet_sent_date) AND  hf.type = 1",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: `	(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hf.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function programHsDraft({ user_id }) {
  try {
    const { results: welcomeCallDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2914 }],
    });
    if (welcomeCallDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          on: "hf.user_id = ud.user_id AND DATE(hf.created) > DATE(dsl.diet_sent_date) AND  hf.type = 2",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: `	(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 5 AND 6
			)
		
		OR  
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hf.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const draftString = welcomeCallDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "Welcome Call Not Done" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function tenDayOd({ user_id }) {
  try {
    const { results: tenDayOdDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2920 }],
    });
    if (tenDayOdDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const daysSinceDietStarted =
      "DATEDIFF(CURDATE(), DATE(dsl.diet_start_date))";
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          field: `${daysSinceDietStarted} > 10 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    const draftString = tenDayOdDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "10th Day Od Not Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function fifthDayOd({ user_id }) {
  try {
    const { results: fifthDayOdDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2919 }],
    });
    if (fifthDayOdDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const daysSinceDietStarted = "DATEDIFF(CURDATE(), dsl.diet_start_date)";
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          field: `${daysSinceDietStarted} > 5 AND dsl.mid_session_weight = 0 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        },
        ,
      ],
    });

    const draftString = fifthDayOdDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "5th Day Od Not Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function tenDayToday({ user_id }) {
  try {
    const { results: tenDayOdDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2918 }],
    });
    if (tenDayOdDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const daysSinceDietStarted =
      "DATEDIFF(CURDATE(), DATE(dsl.diet_start_date))";
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          field: `${daysSinceDietStarted} = 10 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    const draftString = tenDayOdDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "10th Day Od Not Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function fifthDayToday({ user_id }) {
  try {
    const { results: fifthDayOdDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2917 }],
    });
    if (fifthDayOdDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const daysSinceDietStarted = "DATEDIFF(CURDATE(), dsl.diet_start_date)";
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          field: `${daysSinceDietStarted} = 5 AND dsl.mid_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        },
        ,
      ],
    });

    const draftString = fifthDayOdDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "5th Day Od Not Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}
async function tenDayTomorrow({ user_id }) {
  try {
    const { results: tenDayOdDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2916 }],
    });
    if (tenDayOdDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const daysSinceDietStarted =
      "DATEDIFF(CURDATE(), DATE(dsl.diet_start_date))";
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          field: `${daysSinceDietStarted} = 9 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    const draftString = tenDayOdDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "10th Day Od Not Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function fifthDayTomorrow({ user_id }) {
  try {
    const { results: fifthDayOdDrafts } = await readRecord({
      selectFields: ["*"],
      table: `${tables.drafts}`,
      conditions: [{ field: "drafts_id", operator: "=", value: 2915 }],
    });
    if (fifthDayOdDrafts.length === 0) {
      return { status: false, message: "No Page Visit Found" };
    }
    const daysSinceDietStarted = "DATEDIFF(CURDATE(), dsl.diet_start_date)";
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
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
          field: `${daysSinceDietStarted} =4 AND dsl.mid_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        },
        ,
      ],
    });

    const draftString = fifthDayOdDrafts[0].description;
    const extractedVariables = extractVariables(draftString);
    console.log(extractedVariables, 1500);
    const userData = await fetchUserDetailsDynamic({
      ids: [user_id],
      fields: extractedVariables,
    });
    // console.log(userData, 1505);
    if (results.length === 0) {
      return { status: false, message: "5th Day Od Not Found" };
    }
    const message = replacePlaceholders(draftString, userData[0]);
    console.log(message, 1511);
    return { status: true, message: message };
  } catch (error) {
    console.log(error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function alcoholGuideAutoDraft({ user_id }) {
  try {
    console.log(user_id, 3880);
    const { results: users } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name, ''), ' ', COALESCE(cd.last_name, '')) AS name",
        "uam.*",
      ],
      table: `${tables.userAlcoholMenu} uam`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = uam.user_id",
        },
      ],
      conditions: [{ field: "uam.user_id", operator: "=", value: user_id }],
      orderBy: ["uam.added_date DESC"],
      pagination: {
        page: 1,
        limit: 1,
      },
    });

    if (users.length === 0) {
      return { status: false, message: "No Alcohol Menu Found For This User" };
    }

    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userRestaurantMenu} urm`,
      conditions: [{ field: "urm.user_id", operator: "=", value: user_id }],
    });

    const is_user_filled_res_menu = results.length > 0;

    const {
      name,
      // user_id,
      alcohol_menu,
      total_calories,
      alcohol_calories,
      mixers_calories,
      excess_calories,
      added_date,
    } = users[0];
    console.log(users[0], 3923);
    let restaurantNote = ``;
    if (!is_user_filled_res_menu) {
      restaurantNote = `
<p>Did you also have any meals outside?<br>
Please add the details to the restaurant guide so I can keep a tab on that too. <a href="https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}">Click here to update it.</a></p>
`;
    }

    let message = `<p> <strong>Alcohol Guide Draft</strong> </p>`;

    if (excess_calories > 100) {
      message += `
<p>Hi ${name},</p>

<p>I am glad you filled out the <strong>BN Alcohol Guide</strong>. I can now track the liquid calories that go in unnoticed.</p>

<p><strong>Your alcohol + mixer intake has crossed the 300-calorie limit by ${excess_calories} extra calories. 😕</strong></p>

<p>Alcohol acts as a neurotoxin — it stresses your organs and puts fat burning on pause. That's why it's so important to stick to the allowed portions.</p>

<p><strong>Let's get back on track tomorrow with a few key steps:</strong></p>

<ul>
  <li><strong>Prioritize hydration:</strong> Sip on 1 litre of infused water throughout the day to help your system detox.</li>
  <li><strong>Follow your diet strictly</strong> — no compromises.</li>
  <li><strong>Focus on getting deep, restful sleep tonight</strong> — it's essential for recovery and fat metabolism.</li>
</ul>

<p>You're human — one off day doesn't ruin the journey. Let's get back on track :)</p>
${restaurantNote}
<p>Can we do a <strong>gut detox / flat stomach cleanse / no sugar cleanse</strong> in the coming days?</p>
      `;
    } else if (excess_calories > 0 && excess_calories <= 100) {
      message += `
<p>Hi ${name},</p>

<p>I am glad you filled out the <strong>BN Alcohol Guide</strong>. Your alcohol + mixer intake has crossed the calorie limit by <strong>${excess_calories} calories</strong>.</p>

<p>Alcohol acts as a neurotoxin — it stresses your organs and puts fat burning on pause. That's why it's so important to stick to the allowed portions.</p>

<p><strong>What you must focus on next few days to get your system cleaned up:</strong></p>

<ul>
  <li>Add these cooked vegetables to your menu (lauki, palak, methi, drumstick)</li>
  <li>1 bowl of mixed veg khichadi + dahi</li>
  <li>1 bowl of Moong dal or dal soup in dinner</li>
  <li>Add Turmeric, ginger, and coriander to your meals whenever possible</li>
  <li><strong>Skip Caffeine (if possible)</strong></li>
  <li>Try <strong>herbal teas</strong> instead: fennel, mint, or chamomile are great options.</li>
</ul>
${restaurantNote}
      `;
    } else {
      message += `
<p>Hi ${name},</p>

<p>I am glad you filled out the <strong>BN Alcohol Guide</strong>. <strong>Great Job</strong>, you have drunk within your calorie limit!</p>

<p>It is important to keep an eye on staying within your calorie target. Alcohol is a neurotoxin; it slows down fat burning and stresses your liver. The less it is consumed, the better.</p>
${restaurantNote}
      `;
    }

    return { status: true, message };
  } catch (error) {
    console.log(error, 3989);
    return { status: false, message: "Internal Server Error" };
  }
}

async function spinToWinAutoDraft({ user_id }) {
  try {
    const { results: prizeDetails } = await readRecord({
      selectFields: ["ud.device", "ud.app_version", "ud.my_wallet"],
      table: `${tables.prizeDetails} pd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = pd.user_id",
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      orderBy: ["pd.added_date DESC"],
      pagination: {
        page: 1,
        limit: 1,
      },
    });

    // Case: User has not spun the wheel yet
    if (prizeDetails.length === 0) {
      const message = `
      <p><strong>Spin Not Taken</strong> </p>
        <p><strong>BN Spin-to-Win Annual Celebration Ends Tonight!</strong></p>
        <p>Like every year we have, we have a gift for You!</p>
        <p>To get your gift this year, just follow these steps:</p>
        <p>Play the Spin-to-Win: <a href="https://balancenutrition.in/spintowin/${user_id}" target="_blank">Click here</a></p>
        <p>Quickly claim your reward and connect with me to take it forward!</p>
        <p>Valid until Saturday</p>
      `;
      return { status: true, message };
    }

    // Final message with dynamic app link section
    const message = `<p><strong>Spin Taken Draft</strong></p>

<p>🎉 <strong>Congratulations!</strong> You have won <strong>Rs.10,000</strong> in your BN Wallet :)</p>
<p>Your total wallet balance is <strong>Rs. ${prizeDetails[0]?.my_wallet}</strong></p>

<p><strong>Here is a quick way you can earn more money!</strong></p>

<ol>
  <li>Subscribe to our YouTube channel: <a href="https://youtu.be/r7LEZfMsNT8">Click Here</a></li>
  <li>Use the BN Restaurant guide & tell us all about your outside meals: <a href="https://www.balancenutrition.in/app_link/screen_id=restaurant_guide">Click here</a></li>
  <li>Refer a friend: <a href="https://www.balancenutrition.in/app_link/screen_id=74">Click here</a></li>
</ol>

<p>You can easily earn up to <strong>Rs.3,000</strong> with these activities!</p>

<p><strong>Let me know once you do these activities!</strong></p>
`;

    return { status: true, message };
  } catch (error) {
    console.error("Error in spinToWinAutoDraft:", error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function spinToWinWhatsappDraft(user_id) {
  try {
    const { results: prizeDetails } = await readRecord({
      selectFields: ["ud.device", "ud.app_version", "ud.first_name", "pd.id"],
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.prizeDetails} pd`,
          on: "ud.user_id = pd.user_id",
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      orderBy: ["pd.added_date DESC"],
      pagination: {
        page: 1,
        limit: 1,
      },
    });

    const spinLink = `https://balancenutrition.in/spintowin/${user_id}`;
    const walletScreenLink = `https://www.balancenutrition.in/app_link/screen_id=11`;
    const scheduleCallLink = `https://www.balancenutrition.in/app_link/screen_id=29/call_type=45`;
    console.log(prizeDetails[0], user_id, 4163);
    // Case: User has not spun the wheel yet
    if (!prizeDetails[0]?.id) {
      const message = `

Hi ${prizeDetails[0].first_name || "there"}, 

our BN Spin-to-Win Annual Celebration ends soon and just like every year, we have a gift for you.

Click the link below to claim your gift:
${spinLink}

This is valid until Saturday.

Let me know once done so I can help you use it.`;
      return { status: true, message };
    }

    // Extract device info
    const userDevice = String(prizeDetails[0].device || "").toLowerCase();
    const userAppVersion = String(prizeDetails[0].app_version || "");

    let appSection = "";

    if (!userDevice) {
      appSection = `Please download the BN App to check your wallet balance:
- Android: https://bit.ly/BNANDROIDAPP
- iOS: https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
    } else {
      if (
        (userDevice === "android" && userAppVersion === app_versions.android) ||
        (userDevice === "ios" && userAppVersion === app_versions.ios)
      ) {
        appSection = `Check your wallet balance: ${walletScreenLink}`;
      } else if (userDevice === "android") {
        appSection = `Update or download the Android App: https://bit.ly/BNANDROIDAPP`;
      } else if (userDevice === "ios") {
        appSection = `Update or download the iOS App: https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
      }
    }

    const message = `Hi ${prizeDetails[0].first_name || "there"}, 

Congratulations! You have won ₹10,000 in your BN Wallet. Use it before it expires.

${appSection}

You can use this bonus to purchase your next program.

Let me know when I can call you to suggest the next step.

Or schedule a call at your convenience: ${scheduleCallLink}`;

    return { status: true, message };
  } catch (error) {
    console.error("Error in spinToWinWhatsappDraft:", error);
    return { status: false, message: "Internal Server Error" };
  }
}

async function sendDietInMail({ user_id, diet_details_id, session }) {
  try {
    // Fetch user email
    const { results: userDetails } = await readRecord({
      selectFields: [
        "cd.email_id",
        "cd.first_name",
        "ad.email_id as mentor_email",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = cd.mentor_assigned",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });

    if (userDetails.length === 0) {
      return { status: false, message: "User Not Found" };
    }
    if (!userDetails[0].email_id) {
      return { status: false, message: "Email Not Found" };
    }

    // Fetch diet details (excluding unnecessary fields)
    const diet = await dietDetails.findById(diet_details_id).select({
      attachments: 0,
      _id: 0,
      createdAt: 0,
      updatedAt: 0,
      __v: 0,
      diet_id: 0,
      diet_name: 0,
    });
    console.log(diet, 1572);
    if (!diet) {
      return { status: false, message: "Diet Not Found" };
    }

    // Generate HTML table for diet fields
    let mailBody = `
      <p>Dear ${userDetails[0].first_name},</p>
      <p>Your diet details for session ${session} are as follows:</p>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
        <thead>
          <tr>
            <th style="background-color: #f2f2f2;">Field</th>
            <th style="background-color: #f2f2f2;">Value</th>
          </tr>
        </thead>
        <tbody>
    `;
    function convertToTitle(text) {
      const withSpaces = text.replace(/_/g, " ");
      return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
    }

    for (const [key, value] of Object.entries(diet.toObject())) {
      if (value != "<p>null</p>")
        mailBody += `
        <tr>
          <td>${convertToTitle(key)}</td>
          <td>${value ?? ""}</td>
        </tr>
      `;
    }

    mailBody += `
        </tbody>
      </table>
      <p>Regards,<br/>Balance Nutrition Team</p>
    `;

    // Email structure
    const mailData = {
      from: "support@balancenutrition.in",
      to: userDetails[0].email_id,
      subject: "Diet Sent Successfully",
      html: mailBody,
      cc: userDetails[0].mentor_email,
    };
    console.log(mailData, 1615);
    // Send mail function here (assuming sendMail is available)
    await sendMailUtil({
      from: mailData.from,
      to: mailData.to,
      subject: mailData.subject,
      html: mailData.html,
      cc: mailData.cc,
    });

    return { status: true, message: "Mail Sent Successfully" };
  } catch (error) {
    console.error(error);
    return { status: false, message: "Internal Server Error" };
  }
}

const sendMail = async (req, res, next) => {
  const { from, to, subject, html, cc, bcc } = req.body;
  try {
    const mail = await sendMailUtil({
      from: from,
      to: to,
      subject: subject,
      html: html,
      cc: cc,
      bcc: bcc,
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Mail Sent Successfully",
      data: mail,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// sendDietInMail({
//   user_id: 127077,
//   diet_details_id: "680b6c32a92cabed1f5c97a5",
//   session: 3,
// });

const getUser = async (req, res, next) => {
  try {
    const { name, phone_number, phone_code, email, source_utm } = req.body;

    // 1. Check if user exists by phone number
    const { results: existingUsers } = await readRecord({
      table: tables.userDetails,
      selectFields: ["user_id"],
      conditions: [
        { field: "phone_number", operator: "=", value: phone_number },
      ],
      pagination: { page: 1, limit: 1 },
    });

    if (existingUsers.length > 0) {
      const userId = existingUsers[0].user_id;

      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "User exists and data fetched successfully",
        data: {
          userId: userId,
        },
      });

      return res.status(200).json(apiresponse);
    }

    // 2. Determine resolved lead source
    let resolvedSource = 48; // default
    let sourceName = "Website checkout";
    if (source_utm) {
      const { results: existingSource } = await readRecord({
        table: tables.leadSource,
        selectFields: ["source_id", "source_name"],
        conditions: [
          { field: "source_name", operator: "=", value: source_utm },
          { field: "is_deleted", operator: "=", value: 0 },
        ],
        pagination: { page: 1, limit: 1 },
      });

      if (existingSource.length > 0) {
        resolvedSource = existingSource[0].source_id;
        sourceName = existingSource[0].source_name;
      }
    }

    // 3. Create new user
    const phoneFull = `${phone_code} ${phone_number}`;

    const insertUser = await insertRecord(
      tables.userDetails,
      [
        "user_type",
        "phone",
        "primary_lead_source",
        "current_lead_source",
        "first_name",
        "phone_code",
        "phone_number",
        "email_id",
        "enc_password",
        "plain_password",
        "goal_weight",
        "old_wallet",
        "gender",
        "referred_by",
      ],
      [
        "0",
        phoneFull,
        resolvedSource,
        resolvedSource,
        name,
        phone_code,
        phone_number,
        email,
        md5("123456"),
        "123456",
        "0",
        0,
        "0",
        0,
      ]
    );

    const newUserId = insertUser?.insertId;
    console.log(sourceName, 4707);
    await addSourceLogNew({ source: sourceName, id: newUserId });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "User created and added to the data",
      data: {
        userId: newUserId,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in fetching data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const reminderTemplates = [
  {
    condition: "On 7th Day Of Last Session",
    notificationId: 595,
    emailSubject: "Preparing for Your Next Program – [Advance Program]",
    autochat: `
<p>Hi [Client Name],</p>

<p>As you know, we are about to complete the last session of the [Current Program] program.</p>

<p>I’ll connect with you soon to review your progress and share what I have in mind for our next steps toward your goals.</p>

<p>Meanwhile, your next program, [Advance Program], is ready to go. Would you like to start immediately or take a short break? I recommend starting as soon as possible.</p>

<p>👉 Set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’d like to discuss anything before deciding, you can also schedule a call with me here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Once all your programs are completed, you’ll go through a dedicated 30-day maintenance phase—the best way to sustain your results long-term.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>As you know, your [Current Program] program is about to conclude with the final session.</p>

<p>Your mentor will be connecting with you soon to review your progress and share the next steps to help you achieve your goals.</p>

<p>Meanwhile, your next program, [Advance Program], is lined up and ready to begin. Please let us know whether you’d like to start immediately or take a short break before continuing. We recommend starting as soon as possible to maintain momentum.</p>

<p>You can set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’d like to discuss anything before making a decision, you can schedule a call with your mentor here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Once all your programs are completed, we’ll guide you through a dedicated 30-day maintenance phase, the best way to sustain your results long-term.</p>
    `,
  },
  {
    condition: "Day 8 – 2 Days Before Program Ends",
    notificationId: 596,
    emailSubject: "Important Update Regarding Your Program",
    autochat: `
<p>Hi [Client Name],</p>

<p>We’re just 2 days away from completing your [Current Program] program!</p>

<p>Your next program, [Advance Program], is ready to go. Starting right after this program will help you stay on track and see even better results.</p>

<p>You can set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’d like to discuss anything before deciding, schedule a quick call with me here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Once all your programs are completed, we’ll guide you through a 30-day maintenance phase to help you sustain your results long-term.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>Your [Current Program] program is wrapping up in just 2 days.</p>

<p>To ensure a smooth transition and continued progress, we recommend starting your next program, [Advance Program], right away.</p>

<p>You can set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>Need to discuss it first? Schedule a call with your mentor here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. After completing all your programs, we’ll guide you through a 30-day maintenance phase to help you maintain your results in the long run.</p>
    `,
  },
  {
    condition: "Day 9 – 1 Day Before Program Ends",
    notificationId: 597,
    emailSubject: "Your Next Program Starts Soon – Don’t Delay!",
    autochat: `
<p>Hi [Client Name],</p>

<p>An urgent reminder that your [Current Program] program wraps up tomorrow!</p>

<p>Your next program, [Advance Program], is ready to begin. Starting immediately will help you avoid losing momentum and keep progressing toward your goals.</p>

<p>Set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>Need clarity before deciding? Book a quick call here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Once all programs are completed, we’ll guide you through a 30-day maintenance phase to lock in your results.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>Your [Current Program] program concludes tomorrow.</p>

<p>Your next step, [Advance Program], is ready to start, and beginning right away is the best way to keep up your momentum and continue seeing results.</p>

<p>You can set your start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’d like to discuss anything before finalizing, you can book a call here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>
    `,
  },
  {
    condition: "Day 10- Final Day",
    notificationId: 598,
    emailSubject: "Final Reminder",
    autochat: `
<p>Hi [Client Name],</p>

<p>Today marks the last session of your [Current Program] program!</p>

<p>Your next program, [Advance Program], is lined up and ready. Let’s start right away to keep your progress strong and reach your next set of goals.</p>

<p>Set your preferred start date now: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’d like to talk before starting, schedule a quick call here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. After completing all your programs, you’ll go through a 30-day maintenance phase—the key to sustaining your hard-earned results.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>Today is the final session of your [Current Program] program.</p>

<p>Your next program, [Advance Program], is ready to begin, and starting immediately will help you maintain momentum and keep progressing toward your health goals.</p>

<p>You can set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you need to discuss anything before deciding, book a call here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>
    `,
  },
  {
    condition: "Day 11 – 1 Day Overdue",
    notificationId: 599,
    emailSubject: "Your Next Program Awaits – Set Your Start Date Today",
    autochat: `
<p>Hi [Client Name],</p>

<p>Your [Current Program] program has now ended, and your next program, [Advance Program], is ready to begin.</p>

<p>Starting soon will help you maintain the results you’ve achieved and continue progressing toward your health goals.</p>

<p>Please set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you have any questions or need clarity before starting, you can schedule a call with me here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Meanwhile, the maintenance guide for the [Current Program] Program has been activated. Once you add your start date for the [Advance Program] program, we will do a comprehensive 30-day maintenance after all your programs are over.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>Your [Current Program] program has now concluded.</p>

<p>To keep up the momentum and continue progressing, we recommend starting your [Advance Program] program without delay.</p>

<p>You can set your start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’d like to discuss anything before finalizing, book a call here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Meanwhile, the maintenance guide for the [Current Program] has been activated. Once you add your start date for the [Advance Program] program, we will do a comprehensive 30-day maintenance after all your programs are over.</p>
    `,
  },
  {
    condition: "Day 12 – 2 Days Overdue",
    notificationId: 600,
    emailSubject: "Let’s Get You Back on Track – Start Today",
    autochat: `
<p>Hi [Client Name],</p>

<p>It’s been 2 days since your [Current Program] program ended, and your [Advance Program] program is waiting to start.</p>

<p>A quick start will prevent losing progress and help you stay on track toward your goals.</p>

<p>Please set your start date now: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you’re unsure or have questions, book a call with me here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>We’re here to support you every step of the way.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>Your [Current Program] program wrapped up 2 days ago, and now it’s time to take the next step with your [Advance Program] program.</p>

<p>Starting soon will help you protect the progress you’ve made and move forward with confidence.</p>

<p>You can set your preferred start date here: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>Need to discuss before deciding? Book a call with your mentor here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>P.S. Meanwhile, the maintenance guide for the [Current Program] Program has been activated. Once you add your start date for the [Advance Program] program, we will do a comprehensive 30-day maintenance after all your programs are over.</p>
    `,
  },
  {
    condition: "Day 13 – 3 Days Overdue (Final Reminder)",
    notificationId: 601,
    emailSubject: "Final Reminder – Don’t Lose Your Progress",
    autochat: `
<p>Hi [Client Name],</p>

<p>This is a final reminder to set the start date for your [Advance Program] program.</p>

<p>It’s been 3 days since your last program ended, and starting soon will keep your results intact and help you continue moving toward your goals.</p>

<p>Set your start date now: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If anything is holding you back, please book a call with me here so we can discuss it: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>Let’s keep your journey going strong!</p>

<p>P.S. Meanwhile, the maintenance guide for the [Current Program] Program has been activated. Once you add your start date for the [Advance Program] program, we will do a comprehensive 30-day maintenance after all your programs are over.</p>

<p><em>(This message was pre-scheduled by your mentor)</em></p>
    `,
    emailBody: `
<p>Hi [Client Name],</p>

<p>It’s been 3 days since your [Current Program] program ended, and we haven’t yet received your start date for the [Advance Program] program.</p>

<p>Taking the next step now will protect your progress and help you stay on track toward your health goals.</p>

<p>Please set your start date today: <a href="https://www.balancenutrition.in/app_link/screen_id=34/redirect_id=[Advance Program Order ID]">Start Date Link</a></p>

<p>If you have questions or concerns, schedule a call here: <a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Schedule a Call</a></p>

<p>Let’s keep your results moving forward.</p>

<p>P.S. Meanwhile, the maintenance guide for the [Current Program] Program has been activated. Once you add your start date for the [Advance Program] program, we will do a comprehensive 30-day maintenance after all your programs are over.</p>
    `,
  },
];

//------------------------------------
// 2. Helpers
//------------------------------------
function personalize(template, user) {
  return template
    .replace(/\[Client Name\]/g, user.first_name)
    .replace(
      /\[Current Program\]/g,
      user.current_program_name || "Current Program"
    )
    .replace(
      /\[Advance Program\]/g,
      user.advance_program_name || "Advance Program"
    )
    .replace(/\[Advance Program Order ID\]/g, user.advance_sub_order_id);
}

function checkCondition(user, condition) {
  switch (condition) {
    case "On 7th Day Of Last Session":
      return user.daysSinceLastSession === 7;
    case "Day 8 – 2 Days Before Program Ends":
      return user.daysSinceLastSession === 8;
    case "Day 9 – 1 Day Before Program Ends":
      return user.daysSinceLastSession === 9;
    case "Day 10- Final Day":
      return user.daysSinceLastSession === 10;
    case "Day 11 – 1 Day Overdue":
      return user.daysSinceLastSession === 11;
    case "Day 12 – 2 Days Overdue":
      return user.daysSinceLastSession === 12;
    case "Day 13 – 3 Days Overdue (Final Reminder)":
      return user.daysSinceLastSession === 13;
    default:
      return false;
  }
}

//------------------------------------
// 3. Fetch Users (with oldest Renewal program_status=4)
//------------------------------------
async function fetchAdvanceUsersForReminders() {
  const { results } = await readRecord({
    table: `${tables.userDetails} ud`,
    selectFields: [
      "ud.user_id",
      "ud.first_name",
      "ud.email_id",
      "ud.mentor_assigned",
      "mu.crm_user AS mentor_name",
      "mu.email_id AS mentor_email",
      "pm.program_name AS current_program_name",
      "pma.program_name AS advance_program_name",
      "ap.sub_order_id AS advance_sub_order_id",
      "ap.start_date AS advance_start_date",
      "ap.start_date_added_by AS advance_start_date_added_by",
      "DATEDIFF(CURDATE(), lastSession.diet_start_date) AS daysSinceLastSession",
      "DATEDIFF(cp.expiry_date, CURDATE()) AS daysToProgramEnd",
      "DATEDIFF(CURDATE(), cp.expiry_date) AS daysOverdue",
    ],
    joins: [
      {
        type: "LEFT",
        table: "admin_users mu",
        on: "ud.mentor_assigned = mu.admin_user_id",
      },
      {
        type: "LEFT",
        table: "sub_orders_programs cp",
        on: "ud.active_order_id = cp.sub_order_id",
      },
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "cp.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `(SELECT sop.sub_order_id, sop.user_id, sop.program_id, sop.start_date, sop.updated_at ,sop.start_date_added_by
                 FROM sub_orders_programs sop
                 INNER JOIN (
                    SELECT user_id, MIN(updated_at) AS first_update
                    FROM sub_orders_programs
                    WHERE program_status = '4'
                      AND order_type = 'Renewal'
                      AND program_id NOT IN (21,112,113,114,115,116,117,118,119,120,121,131,158,160,179)
                    GROUP BY user_id
                 ) x ON sop.user_id = x.user_id AND sop.updated_at = x.first_update  AND sop.program_id NOT IN (21,112,113,114,115,116,117,118,119,120,121,131,158,160,179)
                ) ap`,
        on: "ud.user_id = ap.user_id",
      },
      {
        type: "LEFT",
        table: "programs_master pma",
        on: "ap.program_id = pma.program_id",
      },
      {
        type: "LEFT",
        table: "diet_session_log lastSession",
        on: "cp.sub_order_id = lastSession.sub_order_id AND cp.sent_sessions = lastSession.session and lastSession.diet_status=4",
      },
    ],
    conditions: [
      {
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      },
      {
        field: "ud.sub_user_status",
        operator: "IN",
        value: ["Active", "Maintenance"],
      },
      { field: "ud.mentor_assigned", operator: "=", value: 196 },
      {
        field:
          "ap.sub_order_id IS NOT NULL and ap.start_date_added_by=0 and cp.total_sessions=cp.sent_sessions",
        operator: "",
        value: "",
        raw: true,
      },
    ],
  });

  return results || [];
}

//------------------------------------
// 4. Send Reminders
//------------------------------------
async function sendAdvanceReminders(users) {
  // console.log("Sending Reminders to", users.length, "users");
  // return;
  for (const template of reminderTemplates) {
    for (const user of users) {
      if (checkCondition(user, template.condition)) {
        const chatMessage = personalize(template.autochat, user);
        const emailBody = personalize(template.emailBody, user);
        const emailSubject = personalize(template.emailSubject, user);

        try {
          // Send AutoChat
          await clientEnquiry.create({
            mentor_id: user.mentor_assigned,
            type: "broadcast",
            sender: "mentor",
            query: chatMessage,
            user_id: user.user_id,
            name: user.mentor_name,
          });

          // Send Email
          await sendMailUtil({
            from: "support@balancenutrition.in",
            to: user.email_id,
            cc: ["clientservices@balancenutrition.in"],
            bcc: [user.mentor_email],
            subject: emailSubject,
            html: emailBody,
          });

          // Send Notification
          await axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [user.user_id],
              notification_id: template.notificationId,
              sent_via: "cron",
            }
          );

          console.log(
            `✅ Reminder sent to ${user.user_id}  (${template.condition})`
          );
        } catch (err) {
          console.error(
            `❌ Failed to send reminder for ${user.first_name}:`,
            err
          );
        }
      }
    }
  }
}

const subscribeToWati = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const updateUser = await updateRecord(
      tables.userDetails,
      {
        wati: 1,
      },
      {
        user_id,
      }
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Subscribed to Wati Successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in subscribeToWati", error);
    return next(new ErrorHandler("Failed to subscribe user to Wati", 500));
  }
};

const unsubscribeToWati = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const updateUser = await updateRecord(
      tables.userDetails,
      {
        wati: 0,
      },
      {
        user_id,
      }
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Unsubscribed from Wati Successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in unsubscribeToWati", error);
    return next(new ErrorHandler("Failed to unsubscribe user from Wati", 500));
  }
};

const watiActivity = async (req, res, next) => {
  try {
    const { user_id, message, button, campaign } = req.query;
    const updateUser = await updateRecord(
      tables.userDetails,
      {
        wati_activity: 1,
        wati_added_date: new Date(),
      },
      {
        user_id,
      }
    );

    await WatiActivity.create({
      user_id: user_id,
      message: message || "",
      button: button || "",
      campaign: campaign || "",
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wati Activity Logged Successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in watiActivity", error);
    return next(new ErrorHandler("Failed to log Wati activity", 500));
  }
};

export const fetchWatiActivities = async ({
  userId,
  campaign,
  button,
  page = 1,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  const query = {};

  if (userId) query.user_id = userId;
  if (campaign) query.campaign = campaign;
  if (button) query.button = button;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    WatiActivity.find(query)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    WatiActivity.countDocuments(query),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const deleteDuplicateLead = async (req, res, next) => {
  let connection;

  try {
    const { user_id, password } = req.params;
    if (password !== "Bn@2025") {
      return next(new ErrorHandler("Unauthorized", 401));
    }
    const { results: userDetails } = await readRecord({
      selectFields: ["*"],
      table: tables.userDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    if (userDetails.length === 0) {
      return next(new ErrorHandler("User Not Found", 404));
    }

    const user = userDetails[0];

    if (
      user.user_type === "1" ||
      user.user_status !== "Lead" ||
      user.sub_user_status !== "Inactive"
    ) {
      return next(
        new ErrorHandler("Cannot delete user, might be a client", 400)
      );
    }

    // 🔐 Get connection for transaction
    connection = await writePool.getConnection();
    await connection.beginTransaction();

    // 1️⃣ Delete child records first
    await connection.query(
      `DELETE FROM ${tables.leadSourceLog} WHERE user_id = ?`,
      [user_id]
    );

    // 2️⃣ Delete parent record
    await connection.query(
      `DELETE FROM ${tables.userDetails} WHERE user_id = ?`,
      [user_id]
    );

    // ✅ Commit if everything succeeds
    await connection.commit();

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User Deleted Successfully",
      })
    );
  } catch (error) {
    // ❌ Rollback on ANY failure
    if (connection) {
      await connection.rollback();
    }

    console.error("Error while deleting user", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const acknowledgeMilestoneNotification = async ({ user_id }) => {
  try {
    const { results } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.email_id",
        "cd.phone_number",
        "cd.mentor_assigned",
        "cd.phone_code",
      ],
      table: `${tables.userDetails} cd`,
      conditions: [
        { field: "cd.user_id", operator: "=", value: user_id },
        { field: "cd.mentor_assigned", operator: "=", value: 196 },
      ],
    });
    const user = results[0];
    const mailData = {
      from: "Support <support@balancenutrition.in>",
      to: user.email_id,
      subject: "Thank You for Sharing Your Transformation",
      html: `<p>Hi <strong>${user.name}</strong>,</p>

    <p>Thank you for submitting your permission form and sharing your transformation photos/videos with us. We really appreciate your effort and trust.</p>

    <p>We've received your submission, and your mentor will review it shortly.</p>

    <p>Your story is an inspiration to many.</p>

    <p>Warm regards,<br>
    <strong>Team Balance Nutrition</strong></p>`,
    };
    const watiTemplateData = {
      template_name: "milestone_acknowledge",
      broadcast_name: "milestone_acknowledge",
      parameters: [{ name: "name", value: user.name }],
    };
    const tasks = [];
    tasks.push(
      axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: 1028,
          sent_via: "action_trigger",
        }
      )
    );
    if (user.email_id) {
      tasks.push(sendMailUtil(mailData));
    }
    if (user.phone_number && user.phone_code) {
      const phone = `${user.phone_code}${user.phone_number}`.replace(/\D/g, "");
      axios.post(
        `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${phone}`,
        {
          template_name: watiTemplateData.template_name,
          broadcast_name: watiTemplateData.broadcast_name,
          parameters: watiTemplateData.parameters,
        }
      );
    }
    await Promise.all(tasks);
    if (user.mentor_assigned) {
      const data = {
        title: `${user.name} Submitted Success Story Form`,
        priority: 1,
        redirect: `/profile/${user.user_id}`,
      };
      sendSSEEvent({ data, mentor_id: user.mentor_assigned });
    }
  } catch (error) {
    console.log("Error in acknowledgeMilestoneNotification", error);
  }
};

const submitMilestoneDataForm = async (req, res, next) => {
  try {
    const {
      user_id,
      milestone_kg: milestone_weight_kg,
      is_story_permitted: story_permission,
      feedback: user_feedback,
    } = req.body;
    if (!user_id || !milestone_weight_kg) {
      return next(
        new ErrorHandler("user_id and milestone_weight_kg are required", 400)
      );
    }
    const files = req.files;
    if (story_permission && (!files || files.length === 0)) {
      return next(
        new ErrorHandler(
          "At least one file is required when story_permission is true",
          400
        )
      );
    }
    const { results: existingRecords } = await readRecord({
      table: tables.milestoneFormData,
      selectFields: ["id"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        {
          field: "milestone_weight_kg",
          operator: "=",
          value: milestone_weight_kg,
        },
      ],
    });
    if (existingRecords.length > 0) {
      return next(
        new ErrorHandler(
          "Milestone data for this weight already submitted",
          409
        )
      );
    }
    let photo_before = null;
    let photo_after = null;
    let progress_video = null;
    if (files.photo_before) {
      photo_before = await uploadArrayOfFilesToCloudinary(
        files.photo_before,
        "milestone/photos"
      );
    }
    if (files.photo_after) {
      photo_after = await uploadArrayOfFilesToCloudinary(
        files.photo_after,
        "milestone/photos"
      );
    }
    if (files.progress_video) {
      progress_video = await uploadArrayOfFilesToCloudinary(
        files.progress_video,
        "milestone/videos"
      );
    }
    const columns = ["user_id", "milestone_weight_kg", "story_permission"];
    const values = [user_id, milestone_weight_kg, story_permission];
    if (photo_before) {
      columns.push("photo_before");
      values.push(JSON.stringify(photo_before));
    }
    if (photo_after) {
      columns.push("photo_after");
      values.push(JSON.stringify(photo_after));
    }
    if (progress_video) {
      columns.push("progress_video");
      values.push(JSON.stringify(progress_video));
    }
    if (user_feedback) {
      columns.push("user_feedback");
      values.push(user_feedback);
    }
    const insertResult = await insertRecord(
      tables.milestoneFormData,
      columns,
      values
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Milestone Data Submitted Successfully",
    });
    await acknowledgeMilestoneNotification({ user_id });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while submitting the milestone form", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const checkMilestoneDataSubmitted = async (req, res, next) => {
  try {
    const { user_id, milestone_kg } = req.params;
    const { results } = await readRecord({
      table: tables.milestoneFormData,
      selectFields: ["id"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "milestone_weight_kg", operator: "=", value: milestone_kg },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Milestone Data Check Successful",
      data: {
        is_submitted: results.length > 0,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in checkMilestoneDataSubmitted", error);
  }
};

export {
  fetchAdvanceUsersForReminders,
  sendAdvanceReminders,
  alcoholGuideAutoDraft,
  getAllOC,
  getAllSources,
  getCheckoutPageVisitDetails,
  getDailyFuDetails,
  getVipDetails,
  getHealthIssues,
  getProgramPageVisitDetails,
  getSources,
  addSource,
  updateClientStartDate,
  addProgramVisit,
  getReportsByUser,
  addCheckoutVisit,
  uploadReport,
  getAdminNotifications,
  getAdminNotificationsCount,
  updateAcknowledgeStatus,
  acknowledgePageVisit,
  fetchNotification,
  addAutoDraftedQuery,
  pageVisitDraft,
  checkoutVisitDraft,
  sendDietInMail,
  sendMail,
  welcomeCallDraft,
  validityAwarenessBufferedDraft,
  tenDayOd,
  fifthDayOd,
  fifthDayToday,
  tenDayToday,
  fifthDayTomorrow,
  tenDayTomorrow,
  halfTimeCallDraft,
  tailendCallDraft,
  halfTimeFeedbackDraft,
  programFeedbackDraft,
  halfTimeHsDraft,
  programHsDraft,
  welcomeCallDoneDraft,
  fifthDayRecievedDraft,
  fifthDayRecievedChat,
  tenthDayRecievedDraft,
  tenthDayRecievedChat,
  startDayRecievedDraft,
  spinToWinAutoDraft,
  spinToWinWhatsappDraft,
  getUser,
  subscribeToWati,
  unsubscribeToWati,
  watiActivity,
  deleteDuplicateLead,
  submitMilestoneDataForm,
  checkMilestoneDataSubmitted,
};
