import moment from "moment";
import ExcelJS from "exceljs";
import { readRecord, readRecordUnion } from "../../config/query.js";
import { appVersions, app_versions, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { generateDailyReport } from "../../utils/GoogleSheetUtils.js";
import { writePool } from "../../config/dbConnection.js";
import { readPool } from "../../config/dbConnection.js";
import { db } from "../../config/dbConnection.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import clientEnquiry from "../../models/clientQueryModel.js";

export const readRawQuery = async (query) => {
  const [rows] = await readPool.query(query);
  return rows;
};

const getWalletReportByAdminId = async (req, res, next) => {
  try {
    const { id } = req.query;
    const selectFields = [
      "cd.user_id",
      "CONCAT(cd.first_name,' ',cd.last_name) as full_name",
      "CONCAT(cd.phone_code, ' ', cd.phone_number) as client_phone",
      `CONCAT("'",cd.phone) as full_number`,
      "cd.email_id",
      "cd.my_wallet",
      "cd.sub_user_status",
      "ad.crm_user AS mentor",
    ];
    const conditions = [];
    if (id) {
      conditions.push({
        field: "cd.mentor_assigned",
        operator: "=",
        value: id,
      });
    }
    const joins = [
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned  = ad.admin_user_id",
      },
    ];
    const { results } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wallet report fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getWalletSummaryReport = async (req, res, next) => {
  try {
    const { client_status } = req.body;

    // Define wallet ranges (last bucket is open-ended)
    const walletRanges = [
      { min: 0, max: 999 },
      { min: 1000, max: 1999 },
      { min: 2000, max: 2999 },
      { min: 3000, max: 3999 },
      { min: 4000, max: 4999 },
      { min: 5000, max: 5999 },
      { min: 6000, max: 6999 },
      { min: 7000, max: 7999 },
      { min: 8000, max: 8999 },
      { min: 9000, max: 9999 },
      { min: 10000, max: 10999 },
      { min: 11000, max: 11999 },
      { min: 12000, max: 12999 },
      { min: 13000, max: 13999 },
      { min: 14000, max: 14999 },
      { min: 15000, max: 15999 },
      { min: 16000, max: 16999 },
      { min: 17000, max: 17999 },
      { min: 18000, max: Infinity },
    ];

    // Build SELECT parts for each bucket using SUM(CASE ...) for clarity
    const rangeSelects = walletRanges.map((range) => {
      const label = `${range.min}-${range.max === Infinity ? "Above" : range.max}`;
      if (range.max === Infinity) {
        return `SUM(CASE WHEN COALESCE(ud.my_wallet, 0) >= ${range.min} THEN 1 ELSE 0 END) AS '${label}'`;
      }
      return `SUM(CASE WHEN COALESCE(ud.my_wallet, 0) BETWEEN ${range.min} AND ${range.max} THEN 1 ELSE 0 END) AS '${label}'`;
    });

    // Final SELECT fields
    const selectFields = [
      ...rangeSelects,
      `COUNT(*) AS total`, // includes NULL my_wallet rows
    ];

    // Normalize status input
    const statusMap = {
      Active: "Active",
      OC: "Completed",
      Lead: "Lead",
    };
    const statusValue = statusMap[client_status] || "Lead";

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: statusValue,
        },
        {
          orConditions: [
            {
              field: "ud.mentor_assigned",
              operator: "NOT IN",
              value: [196, 10],
            },
            {
              field: "ud.counsellor_assigned",
              operator: "NOT IN",
              value: [196, 10],
            },
          ],
        },
      ],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Wallet summary report fetched successfully for ${client_status}`,
      data: results,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentorUserStatusCountReport = async (req, res, next) => {
  try {
    const { user_status } = req.body;
    let data = [];
    if (user_status === "Active") {
      const active_statuses = [
        "Active",
        "Active",
        "Cleanse active",
        "Dormant",
        "Onhold",
        "notstarted",
      ];
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ad.crm_user as mentor",
          ...active_statuses.map((status, idx) =>
            idx === 0
              ? `COUNT(DISTINCT CASE WHEN ud.user_status = '${status}' THEN ud.user_id END) as all_active`
              : `COUNT(DISTINCT CASE WHEN ud.sub_user_status = '${status}' THEN ud.user_id END) as '${status}'`,
          ),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
        ],
        conditions: [
          {
            field: "ud.mentor_assigned",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "!=",
            value: "196",
          },
          {
            field: "ad.is_active",
            operator: "=",
            value: 1,
          },
        ],
        groupBy: ["ad.admin_user_id"],
      });
      data = results;
    }
    if (user_status === "OC") {
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ad.crm_user as mentor",
          `COUNT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END) as all_oc`,
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
        ],
        conditions: [
          {
            field: "ud.mentor_assigned",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "!=",
            value: "196",
          },
          {
            field: "ad.is_active",
            operator: "=",
            value: 1,
          },
        ],
        groupBy: ["ad.admin_user_id"],
      });
      data = results;
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Mentor user status count report fetched successfully",
        data: data,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentorUserCountByProgramStatusReport = async (req, res, next) => {
  try {
    // const program_category = [""]
    const selectFields = [
      "ad.admin_user_id AS admin_user_id",
      "ad.crm_user AS mentor_name",
      "pm.program_category AS program_category",
      "COUNT(cd.user_id) AS client_count",
    ];

    // Define the necessary joins
    const joins = [
      {
        type: "LEFT",
        table: `${tables.userDetails} cd`,
        on: "ad.admin_user_id = cd.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
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
    ];

    const { results } = await readRecord({
      table: `${tables.adminUsers} ad`,
      joins,
      selectFields,
      groupBy: ["ad.admin_user_id", "pm.program_category"],
      condition: [
        { field: "cd.user_type", operator: "=", value: "1" },
        {
          field: "cd.mentor_assigned",
          operator: "!=",
          value: "196",
        },
        {
          field: "ad.is_active",
          operator: "=",
          value: 1,
        },
      ], // Ensure only clients are counted
    });

    const formattedResults = results.reduce((acc, row) => {
      const { mentor_name, program_category, client_count } = row;

      // If the mentor is not already in the result, initialize their data
      if (!acc[mentor_name]) {
        acc[mentor_name] = {};
      }

      // Assign the count for the program category
      acc[mentor_name][program_category] = client_count;

      return acc;
    }, {});

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Mentor program category report fetched successfully",
      data: formattedResults,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAppNotUpdatedClientsByUserStatusReport = async (req, res, next) => {
  try {
    const { user_status } = req.body;
    let data = [];

    const androidVersion = appVersions.latestAndroidVersion;
    const iosVersion = appVersions.latestIosVersion;

    if (user_status === "Active") {
      const active_status = [
        "Active",
        "Active",
        "Cleanse active",
        "Dormant",
        "Onhold",
        "notstarted",
      ];

      const { results: android_data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          ...active_status.map((status, idx) =>
            idx === 0
              ? `COUNT(DISTINCT CASE WHEN ud.app_version < '${androidVersion}' AND ud.device = 'Android' AND ud.user_status = '${status}' THEN ud.user_id END) AS total_not_updated`
              : `COUNT(DISTINCT CASE WHEN ud.app_version < '${androidVersion}' AND ud.device = 'Android' AND ud.sub_user_status = '${status}' THEN ud.user_id END) AS '${status}'`,
          ),
          `COUNT(DISTINCT CASE WHEN ud.app_version >= '${androidVersion}' AND ud.device = 'Android' THEN ud.user_id END) AS total_updated`,
        ],
      });

      const { results: ios_data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          ...active_status.map((status, idx) =>
            idx === 0
              ? `COUNT(DISTINCT CASE WHEN ud.app_version < '${iosVersion}' AND ud.device = 'IOS' AND ud.user_status = '${status}' THEN ud.user_id END) AS total_not_updated`
              : `COUNT(DISTINCT CASE WHEN ud.app_version < '${iosVersion}' AND ud.device = 'IOS' AND ud.sub_user_status = '${status}' THEN ud.user_id END) AS '${status}'`,
          ),
          `COUNT(DISTINCT CASE WHEN ud.app_version >= '${iosVersion}' AND ud.device = 'IOS' THEN ud.user_id END) AS total_updated`,
        ],
      });

      data = {
        android: android_data,
        ios: ios_data,
      };
    } else if (user_status === "OC") {
      const oc_statuses = [
        "Completed",
        "Completed",
        "Dropout",
        "Maintenance",
        "Fs",
      ];

      const { results: android_data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          ...oc_statuses.map((status, idx) =>
            idx === 0
              ? `COUNT(DISTINCT CASE WHEN ud.app_version < '${androidVersion}' AND ud.device = 'Android' AND ud.user_status = '${status}' THEN ud.user_id END) AS app_not_updated_total`
              : `COUNT(DISTINCT CASE WHEN ud.app_version < '${androidVersion}' AND ud.device = 'Android' AND ud.sub_user_status = '${status}' THEN ud.user_id END) AS '${status}'`,
          ),
          `COUNT(DISTINCT CASE WHEN ud.app_version >= '${androidVersion}' AND ud.device = 'Android' THEN ud.user_id END) AS app_updated`,
        ],
      });

      const { results: ios_data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          ...oc_statuses.map((status, idx) =>
            idx === 0
              ? `COUNT(DISTINCT CASE WHEN ud.app_version < '${iosVersion}' AND ud.device = 'IOS' AND ud.user_status = '${status}' THEN ud.user_id END) AS app_not_updated_total`
              : `COUNT(DISTINCT CASE WHEN ud.app_version < '${iosVersion}' AND ud.device = 'IOS' AND ud.sub_user_status = '${status}' THEN ud.user_id END) AS '${status}'`,
          ),
          `COUNT(DISTINCT CASE WHEN ud.app_version >= '${iosVersion}' AND ud.device = 'IOS' THEN ud.user_id END) AS updated`,
        ],
      });

      data = {
        android: android_data,
        ios: ios_data,
      };
    } else if (user_status === "Lead") {
      const { results: android_data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          `COUNT(DISTINCT CASE WHEN ud.app_version < '${androidVersion}' AND ud.device = 'Android' AND ud.user_status = 'Lead' THEN ud.user_id END) AS total`,
          `COUNT(DISTINCT CASE WHEN ud.app_version >= '${androidVersion}' AND ud.device = 'Android' AND ud.user_status = 'Lead' THEN ud.user_id END) AS updated`,
        ],
      });

      const { results: ios_data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          `COUNT(DISTINCT CASE WHEN ud.app_version < '${iosVersion}' AND ud.device = 'IOS' AND ud.user_status = 'Lead' THEN ud.user_id END) AS total`,
          `COUNT(DISTINCT CASE WHEN ud.app_version >= '${iosVersion}' AND ud.device = 'IOS' AND ud.user_status = 'Lead' THEN ud.user_id END) AS updated`,
        ],
      });

      data = {
        android: android_data,
        ios: ios_data,
      };
    } else {
      const conditions = [
        {
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${app_versions.ios}','${app_versions.android}')`,
          raw: true,
        },
      ];
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "CONCAT('+',ud.phone_code,'',ud.phone_number) as phone",
          `(
        SELECT device 
        FROM bn_user_fcm_token 
        WHERE user_id = ud.user_id 
        ORDER BY id DESC 
        LIMIT 1
    ) AS device`,
        ],
        conditions: conditions,
      });
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "App not updated clients by user status fetched successfully",
      data: data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const walletUsedSummaryReportByMentorId = async (req, res, next) => {
  try {
    const { mentor_id, date } = req.body;

    // Convert the month name to the start and end of the month (assuming current year)
    const [month, year] = date.split("-").map(Number); // Convert both to numbers

    // Convert the month and year to the start and end of the month
    const startOfMonth = moment(`${year}-${month}-01`)
      .startOf("month")
      .format("YYYY-MM-DD HH:mm:ss");
    const endOfMonth = moment(`${year}-${month}-01`)
      .endOf("month")
      .format("YYYY-MM-DD HH:mm:ss");

    const selectFields = [
      // Count of Active users with specified sub_user_statuses
      `COUNT(
        CASE
          WHEN cd.user_status = "Active"
          AND cd.sub_user_status IN ("Active", "Dormant", "Onhold", "notstarted", "Cleanse active")
          AND cd.mentor_assigned = ${mentor_id}
          THEN 1
          ELSE NULL
        END
      ) AS 'All_Active'`,

      // Count of users with sub_user_status "Active"
      `COUNT(DISTINCT
        CASE
          WHEN cd.sub_user_status = "Active"
          AND cd.mentor_assigned = ${mentor_id}
          THEN 1
          ELSE NULL
        END
      ) AS 'Active'`,

      // Count of Active users who used wallet this month
      `COUNT(DISTINCT
        CASE
          WHEN cd.sub_user_status = "Active"
          AND cd.mentor_assigned = ${mentor_id}
          AND bd.wallet_discount > 0
          AND bd.added_date BETWEEN '${startOfMonth}' AND '${endOfMonth}'
          THEN 1
          ELSE NULL
        END
      ) AS 'Active_Wallet_Used'`,

      // Count of users who don't have advance purchase
      `COUNT(DISTINCT
        CASE
          WHEN cd.mentor_assigned = ${mentor_id}
          AND cd.user_id NOT IN (
            SELECT od.user_id 
            FROM ${tables.orderDetails} od
            JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
            WHERE sop.program_status = 4
          )
          THEN 1
          ELSE NULL
        END
      ) AS 'No_Advance_Purchase'`,

      // Count of advance purchase users
      `COUNT(DISTINCT
        CASE
          WHEN cd.mentor_assigned = ${mentor_id}
          AND cd.user_id IN (
            SELECT od.user_id 
            FROM ${tables.orderDetails} od
            JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
            WHERE sop.program_status = 4
          )
          THEN 1
          ELSE NULL
        END
      ) AS 'Advance_Purchase'`,

      // Count of OCR users (Active users with more than one order)
      `COUNT(DISTINCT
        CASE
          WHEN cd.sub_user_status = "Active"
          AND cd.mentor_assigned = ${mentor_id}
          AND (
            SELECT COUNT(*) 
            FROM ${tables.orderDetails} od 
            WHERE od.user_id = cd.user_id
          ) > 1 
          THEN 1
          ELSE NULL
        END
      ) AS 'Total_OCR'`,

      // Count of OCR users who used wallet
      `COUNT(DISTINCT
        CASE
          WHEN cd.sub_user_status = "Active"
          AND cd.mentor_assigned = ${mentor_id}
          AND bd.wallet_discount > 0
          AND (
            SELECT COUNT(*) 
            FROM ${tables.orderDetails} od 
            WHERE od.user_id = cd.user_id
          ) > 1 
          THEN 1
          ELSE NULL
        END
      ) AS 'Total_OCR_Wallet_Used'`,

      // Mentor name
      'CONCAT(ad.first_name, " ", ad.last_name) AS mentor_name',
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.billingDetails} bd`,
        on: "cd.user_id = bd.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: `${mentor_id} = ad.admin_user_id`,
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      joins,
    });

    const response = {
      mentor_name: results.length ? results[0].mentor_name : null,
      All_Active: results[0]?.All_Active || 0,
      Active: results[0]?.Active || 0,
      Active_Wallet_Used: results[0]?.Active_Wallet_Used || 0,
      No_Advance_Purchase: results[0]?.No_Advance_Purchase || 0,
      Advance_Purchase: results[0]?.Advance_Purchase || 0,
      Total_OCR: results[0]?.Total_OCR || 0,
      Total_OCR_Wallet_Used: results[0]?.Total_OCR_Wallet_Used || 0,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wallet user summary report fetched successfully",
      data: response,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCleansePaidReportByMentorId = async (req, res, next) => {
  try {
    // Step 1: Get all active mentors
    const { results: mentors } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.admin_user_id", "ad.crm_user AS mentor_name"],
      conditions: [
        {
          field: "ad.is_active",
          operator: "=",
          value: 1,
        },
      ],
    });

    const mentorReports = await Promise.all(
      mentors.map(async (mentor) => {
        const mentorId = mentor.admin_user_id;

        // Select fields for the report specific to this mentor
        const selectFields = [
          // Count of all active clients with specified conditions (Cleanse active or Active + Basic Stack)
          `COUNT(DISTINCT
            CASE
              WHEN cd.mentor_assigned = ${mentorId}
              AND cd.sub_user_status IN ("Cleanse active", "Active")
              AND EXISTS (
                SELECT 1
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                JOIN ${tables.programSession} ps ON sop.program_session_id = ps.program_session_id
                JOIN ${tables.programsMaster} pm ON ps.program_id = pm.program_id
                WHERE od.user_id = cd.user_id
                AND pm.program_category = "Basic Stack"
              )
              THEN 1
              ELSE NULL
            END
          ) AS 'Cleanse_Active'`,

          // Count of all active clients with paid_amount = mrp condition
          `COUNT(DISTINCT
            CASE
              WHEN cd.mentor_assigned = ${mentorId}
              AND cd.sub_user_status IN ("Cleanse active", "Active")
              AND EXISTS (
                SELECT 1
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                JOIN ${tables.programSession} ps ON sop.program_session_id = ps.program_session_id
                JOIN ${tables.programsMaster} pm ON ps.program_id = pm.program_id
                WHERE od.user_id = cd.user_id
                AND pm.program_category = "Basic Stack"
                AND sop.paid_amount = sop.mrp
              )
              THEN 1
              ELSE NULL
            END
          ) AS 'Cleanse_Active_Paid'`,

          // Count of All OCR clients (clients with "Active" status, Basic Stack program, and more than one order)
          `COUNT(DISTINCT
            CASE
              WHEN cd.mentor_assigned = ${mentorId}
              AND cd.user_status = "Active"
              AND (
                SELECT COUNT(*)
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                JOIN ${tables.programSession} ps ON sop.program_session_id = ps.program_session_id
                JOIN ${tables.programsMaster} pm ON ps.program_id = pm.program_id
                WHERE od.user_id = cd.user_id
                AND pm.program_category = "Basic Stack"
                GROUP BY od.user_id
                HAVING COUNT(od.order_id) > 1
              )
              THEN 1
              ELSE NULL
            END
          ) AS 'All_OCR_Clients'`,

          // Count of OCR clients with paid_amount = mrp condition (Basic Stack program)
          `COUNT(DISTINCT
            CASE
              WHEN cd.mentor_assigned = ${mentorId}
              AND cd.user_status = "Active"
              AND (
                SELECT COUNT(*)
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                JOIN ${tables.programSession} ps ON sop.program_session_id = ps.program_session_id
                JOIN ${tables.programsMaster} pm ON ps.program_id = pm.program_id
                WHERE od.user_id = cd.user_id
                AND pm.program_category = "Basic Stack"
                GROUP BY od.user_id
                HAVING COUNT(od.order_id) > 1
              )
              AND EXISTS (
                SELECT 1
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                WHERE od.user_id = cd.user_id
                AND sop.paid_amount = sop.mrp
              )
              THEN 1
              ELSE NULL
            END
          ) AS 'OCR_Paid_Clients'`,
        ];

        // Fetch the report data for this mentor
        const { results: report } = await readRecord({
          table: `${tables.userDetails} cd`,
          selectFields,
        });

        return {
          mentor_name: mentor.mentor_name,
          Cleanse_Active: report[0].Cleanse_Active || 0,
          Cleanse_Active_Paid: report[0].Cleanse_Active_Paid || 0,
          All_OCR_Clients: report[0].All_OCR_Clients || 0,
          OCR_Paid_Clients: report[0].OCR_Paid_Clients || 0,
        };
      }),
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cleanse Paid Report fetched successfully",
      data: mentorReports,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllActiveClientsByProgramCategoryReport = async (req, res, next) => {
  try {
    const { date } = req.body;

    // Step 1: Parse the date to get start and end of the month
    const startDate = moment(date, "MM-YYYY")
      .startOf("month")
      .format("YYYY-MM-DD");
    const endDate = moment(date, "MM-YYYY").endOf("month").format("YYYY-MM-DD");

    // Step 2: Get all active mentors
    const { results: mentors } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.admin_user_id", "ad.crm_user AS mentor_name"],
      conditions: [
        {
          field: "ad.is_active",
          operator: "=",
          value: 1,
        },
      ],
    });

    let totalActiveClients = 0;
    let totalActiveSubClients = 0;
    let totalPlatinumStackClients = 0;
    let totalPregnancyStackClients = 0;

    const mentorReports = await Promise.all(
      mentors.map(async (mentor) => {
        const mentorId = mentor.admin_user_id;

        // Select fields for the report
        const selectFields = [
          // Total active clients
          `COUNT(
            CASE 
              WHEN cd.user_status = 'Active' 
              AND cd.mentor_assigned = ${mentorId}
              THEN 1 
              ELSE NULL 
            END
          ) AS 'Total_Active_Clients'`,

          // Clients with sub_user_status as "Active"
          `COUNT(
            CASE 
              WHEN cd.user_status = 'Active'
              AND cd.sub_user_status = 'Active'
              AND cd.mentor_assigned = ${mentorId}
              THEN 1 
              ELSE NULL 
            END
          ) AS 'Active_Sub_Clients'`,

          // Clients enrolled in "Platinum Stack" programs within the specified date range
          `COUNT(
            CASE 
              WHEN cd.user_status = 'Active'
              AND EXISTS (
                SELECT 1
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                JOIN ${tables.programSession} ps ON sop.program_session_id = ps.program_session_id
                JOIN ${tables.programsMaster} pm ON ps.program_id = pm.program_id
                WHERE od.user_id = cd.user_id
                AND pm.program_category = 'Platinum Stack'
                AND od.order_date BETWEEN '${startDate}' AND '${endDate}' -- Filter by date range
              )
              AND cd.mentor_assigned = ${mentorId}
              THEN 1 
              ELSE NULL 
            END
          ) AS 'Platinum_Stack_Clients'`,

          // Clients enrolled in "Pregnancy Stack" programs within the specified date range
          `COUNT(
            CASE 
              WHEN cd.user_status = 'Active'
              AND EXISTS (
                SELECT 1
                FROM ${tables.orderDetails} od
                JOIN ${tables.subOrderPrograms} sop ON od.order_id = sop.order_id
                JOIN ${tables.programSession} ps ON sop.program_session_id = ps.program_session_id
                JOIN ${tables.programsMaster} pm ON ps.program_id = pm.program_id
                WHERE od.user_id = cd.user_id
                AND pm.program_category = 'Pregnancy Stack'
                AND od.order_date BETWEEN '${startDate}' AND '${endDate}' -- Filter by date range
              )
              AND cd.mentor_assigned = ${mentorId}
              THEN 1 
              ELSE NULL 
            END
          ) AS 'Pregnancy_Stack_Clients'`,
        ];

        // Fetch the report data for this mentor
        const { results: report } = await readRecord({
          table: `${tables.userDetails} cd`,
          selectFields,
        });

        // Ensure all values are explicitly set to 0 if null or undefined
        const totalActive = report[0].Total_Active_Clients || 0;
        const activeSubClients = report[0].Active_Sub_Clients || 0;
        const platinumStackClients = report[0].Platinum_Stack_Clients || 0;
        const pregnancyStackClients = report[0].Pregnancy_Stack_Clients || 0;

        // Accumulate totals
        totalActiveClients += totalActive;
        totalActiveSubClients += activeSubClients;
        totalPlatinumStackClients += platinumStackClients;
        totalPregnancyStackClients += pregnancyStackClients;

        // Return the formatted report for the mentor
        return {
          mentor_name: mentor.mentor_name,
          Total_Active_Clients: totalActive,
          Active_Sub_Clients: activeSubClients,
          Platinum_Stack_Clients: platinumStackClients,
          Pregnancy_Stack_Clients: pregnancyStackClients,
        };
      }),
    );

    mentorReports.push({
      mentor_name: "Total",
      Total_Active_Clients: totalActiveClients,
      Active_Sub_Clients: totalActiveSubClients,
      Platinum_Stack_Clients: totalPlatinumStackClients,
      Pregnancy_Stack_Clients: totalPregnancyStackClients,
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Active Clients by Program Category Report fetched successfully",
      data: mentorReports,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAppCheckoutPageVisitReport = async (req, res, next) => {
  try {
    const { user_type, start_date, end_date } = req.body;

    const selectFields = [
      "CONCAT(cd.first_name,' ',cd.last_name) as user_name",
      "cd.email_id",
      "CONCAT(cd.phone_code,'',cd.phone_number) as phone",
      `CONCAT("'",cd.phone) as full_number`,
      "apv.page_type",
      "cd.sub_user_status",
      "pm.program_name",
      "apv.visit_date",
      "apv.visit_time",
      "ad.crm_user as mentor",
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = apv.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "apv.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: "od.user_id = cd.user_id AND od.order_date > apv.visit_date",
      },
      {
        type: "LEFT",
        table: `${tables.inAppPageVisitLog} apv2`,
        on: "apv.user_id = apv2.user_id AND apv.visit_date < apv2.visit_date",
      },
    ];

    const conditions = [
      {
        field: "apv.page_type",
        operator: "=",
        value: 2,
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: user_type.toLowerCase() === "active" ? "Active" : "Completed",
      },
      {
        field: "DATE(apv.visit_date)",
        operator: "BETWEEN",
        value: [
          `${moment(start_date).format("YYYY-MM-DD")}`,
          `${moment(end_date).format("YYYY-MM-DD")}`,
        ],
      },
      {
        field: "od.order_id",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: "apv2.user_id",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: "cd.mentor_assigned",
        operator: "NOT IN",
        value: "(0, 196)",
        raw: true,
      },
    ];

    const { results: report } = await readRecord({
      table: `${tables.inAppPageVisitLog} apv`,
      selectFields,
      joins,
      conditions,
      groupBy: ["cd.user_id"],
    });

    const data = report.map((i) => ({
      name: i.user_name,
      email: i.email_id,
      phone: i.phone,
      full_number: i.full_number,
      user_status: i.sub_user_status,
      program_name: i.program_name,
      visit_date: moment(i.visit_date).format("Do MMM YYYY"),
      visit_time: i.visit_time,
      mentor: i.mentor,
    }));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Checkout Page Visit Report fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAppProgramPageVisitReport = async (req, res, next) => {
  try {
    const { user_type, start_date, end_date } = req.body;

    const selectFields = [
      "CONCAT(cd.first_name,' ',cd.last_name) as user_name",
      "cd.email_id",
      "CONCAT(cd.phone_code,'',cd.phone_number) as phone",
      `CONCAT("'",cd.phone) as full_number`,
      "apv.page_type",
      "cd.sub_user_status",
      "pm.program_name",
      "apv.visit_date",
      "apv.visit_time",
      "ad.crm_user as mentor",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = apv.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "apv.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: "od.user_id = cd.user_id AND od.order_date > apv.visit_date",
      },
      {
        type: "LEFT",
        table: `${tables.inAppPageVisitLog} apv2`,
        on: "apv.user_id = apv2.user_id AND apv.visit_date < apv2.visit_date",
      },
    ];

    const conditions = [
      {
        field: "apv.page_type",
        operator: "=",
        value: 1,
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: user_type.toLowerCase() === "active" ? "Active" : "Completed",
      },
      {
        field: "DATE(apv.visit_date)",
        operator: "BETWEEN",
        value: [
          `${moment(start_date).format("YYYY-MM-DD")}`,
          `${moment(end_date).format("YYYY-MM-DD")}`,
        ],
      },
      {
        field: "od.order_id",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: "apv2.user_id",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: "cd.mentor_assigned",
        operator: "NOT IN",
        value: "(0, 196)",
        raw: true,
      },
    ];

    const { results: report } = await readRecord({
      table: `${tables.inAppPageVisitLog} apv`,
      selectFields,
      joins,
      conditions,
      groupBy: ["cd.user_id"],
    });

    const data = report.map((i) => ({
      name: i.user_name,
      email: i.email_id,
      phone: i.phone,
      full_number: i.full_number,
      user_status: i.sub_user_status,
      program_name: i.program_name,
      visit_date: moment(i.visit_date).format("Do MMM YYYY"),
      visit_time: i.visit_time,
      mentor: i.mentor,
    }));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Program Page Visit Report fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const mentorWiseRateSharedUnpaidReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS 'name'",
        "CONCAT(ud.phone_code, ud.phone_number) AS 'phone'",
        "ud.email_id AS 'email'",
        "ud.my_wallet AS 'wallet'",
        "pm.program_name AS 'suggested program'",
        "ps.program_sessions AS 'days'",
        "sp.suggested_amount",
        "DATE_FORMAT(sp.updated_date, '%d-%m-%Y') AS 'pitched date'",
        "ad.crm_user AS 'mentor'",
        "ud.user_status",
        "paym.payment_mode_name",
        "pl.payment_link",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id ",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sp.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id  = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} paym`,
          on: "paym.payment_mode_id = sp.payment_mode_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "sp.payment_link_id = pl.id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.user_id = ud.user_id AND od.order_date > sp.updated_date",
        },
      ],
      conditions: [
        {
          orConditions: [
            {
              field: "sp.suggested_amount",
              operator: "IS NOT",
              value: "NULL",
              raw: true,
            },
            {
              field: "sp.suggested_amount",
              operator: ">",
              value: "0",
              raw: true,
            },
          ],
        },
        {
          field: "od.order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
        {
          field: "sp.updated_date",
          operator: "BETWEEN",
          value: [
            `${moment(start_date).format("YYYY-MM-DD")}`,
            `${moment(end_date).format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Mentor Wise Rate Shared Unpaid Report fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getBasicStackNotUpgradedToFullStackReport = async (req, res, next) => {
  try {
    // const { date, user_type } = req.body;
    const { start_date, end_date, user_type } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "CONCAT(ud.phone_code, ' ', ud.phone_number) AS phone_number",
        "ud.my_wallet",
        "pm.program_name",
        "ud.user_status",
        "ad.crm_user AS mentor",
        "ud.latest_weight AS last_weight",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },

        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_adv`,
          on: "sop_adv.user_id = ud.user_id AND sop_adv.program_type = 0 ",
        },
      ],
      conditions: [
        {
          field: "sop.created_at",
          operator: "BETWEEN",
          value: [
            `${moment(start_date).format("YYYY-MM-DD")}`,
            `${moment(end_date).format("YYYY-MM-DD")}`,
          ],
        },
        user_type === "OC"
          ? {
              field: "sop.order_type",
              operator: "=",
              value: "OCR",
            }
          : {
              field: "sop.order_type",
              operator: "=",
              value: "New",
            },
        {
          field: "sop.program_type",
          operator: "=",
          value: 1,
        },
        {
          field: "sop_adv.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    // Return the final report
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message:
        "Basic Stack to Full Stack Not Updated Report fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getBasicStackNotUpgradedToFullStackSummaryReport = async (
  req,
  res,
  next,
) => {
  try {
    const { start_date, end_date, user_type } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ad.crm_user as mentor",
        "COUNT(DISTINCT ud.user_id) as 'not_upgraded'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_adv`,
          on: "sop_adv.user_id = ud.user_id AND sop_adv.program_type = 0",
        },
      ],
      conditions: [
        {
          field: "sop.created_at",
          operator: "BETWEEN",
          value: [
            `${moment(start_date).format("YYYY-MM-DD")}`,
            `${moment(end_date).format("YYYY-MM-DD")}`,
          ],
        },
        user_type === "OC"
          ? {
              field: "sop.order_type",
              operator: "=",
              value: "OCR",
            }
          : {
              field: "sop.order_type",
              operator: "=",
              value: "New",
            },
        {
          field: "sop.program_type",
          operator: "=",
          value: 1,
        },
        {
          field: "sop_adv.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
      groupBy: ["ad.admin_user_id"],
    });

    // Return the final report
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message:
        "Basic Stack to Full Stack Not Updated Summary Report fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getHfFeedbackReport = async (req, res, next) => {
  try {
    const { date } = req.query;
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "ad.crm_user AS mentor",
          ...Array(5)
            .fill()
            .map(
              (_, index) => ` 
           COUNT(DISTINCT CASE WHEN hf.mentor_star_rating = ${
             5 - index
           } AND hf.added_date BETWEEN '${moment(date)
             .startOf("month")
             .format("YYYY-MM-DD")}' AND '${moment(date)
             .endOf("month")
             .format("YYYY-MM-DD")}' THEN ud.user_id END) AS '${
             5 - index
           } rating'`,
            ),
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.halfTimeFeedback} hf`,
            on: "hf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ad.is_active", operator: "=", value: 1 },

          { field: "ad.role_id", operator: "=", value: 1 },
          {
            field: "ud.mentor_assigned",
            operator: "!=",
            value: "196",
          },
        ],
        groupBy: ["ad.admin_user_id"],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "'Total' AS crm_user",
          ...Array(5)
            .fill()
            .map(
              (_, index) => ` 
           COUNT(DISTINCT CASE WHEN hf.mentor_star_rating = ${
             5 - index
           } AND hf.added_date BETWEEN '${moment(date)
             .startOf("month")
             .format("YYYY-MM-DD")}' AND '${moment(date)
             .endOf("month")
             .format("YYYY-MM-DD")}' THEN ud.user_id END) AS '${
             5 - index
           } rating'`,
            ),
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.halfTimeFeedback} hf`,
            on: "hf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ad.is_active", operator: "=", value: 1 },

          { field: "ad.role_id", operator: "=", value: 1 },
          {
            field: "ud.mentor_assigned",
            operator: "!=",
            value: "196",
          },
          {
            field: "hf.added_date",
            operator: "BETWEEN",
            value: [
              `${moment(date).startOf("month").format("YYYY-MM-DD")}`,
              `${moment(date).endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);
    return res.status(200).json(
      new ApiResponse({
        message: "HF Feedback Report fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getNoAdvancePurchaseReport = async (req, res, next) => {
  try {
    const { client_status, date } = req.body;

    const parsedDate = moment(date, "MM-YYYY");

    // Extract the month and year for the query
    const startOfMonth = parsedDate.startOf("month").format("YYYY-MM-DD");
    const endOfMonth = parsedDate.endOf("month").format("YYYY-MM-DD");

    const { results: mentors } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.admin_user_id", "ad.crm_user AS mentor_name"],
      conditions: [
        {
          field: "ad.is_active",
          operator: "=",
          value: 1,
        },
      ],
    });

    const mentorReports = await Promise.all(
      mentors.map(async (mentor) => {
        const { results: noAdClients } = await readRecord({
          table: `${tables.userDetails} cd`,
          selectFields: [
            `COUNT(DISTINCT CASE 
                WHEN cd.sub_user_status IN ("Active", "Dormant", "notstarted", "Completed", "Onhold")
                AND cd.mentor_assigned = ${mentor.admin_user_id}
                AND cd.added_date BETWEEN '${startOfMonth}' AND '${endOfMonth}' 
                AND EXISTS (
                    SELECT 1
                    FROM ${tables.orderDetails} od
                    JOIN ${
                      tables.subOrderPrograms
                    } sop ON od.order_id = sop.order_id
                    WHERE od.user_id = cd.user_id
                    AND sop.program_status <> 4
                    ${
                      client_status === "Tailend"
                        ? "AND sop.total_sessions - sop.sent_sessions = 3"
                        : ""
                    }
                )
                THEN 1 ELSE NULL END) AS ${
                  client_status === "All_active"
                    ? "Total_All_Active"
                    : "Total_All_Tailend"
                }`,
            `COUNT(DISTINCT CASE 
                WHEN cd.sub_user_status IN ("Active", "Dormant", "notstarted", "Completed", "Onhold")
                AND cd.mentor_assigned = ${mentor.admin_user_id}
                AND cd.added_date BETWEEN '${startOfMonth}' AND '${endOfMonth}' 
                AND EXISTS (
                    SELECT 1
                    FROM ${tables.orderDetails} od
                    JOIN ${
                      tables.subOrderPrograms
                    } sop ON od.order_id = sop.order_id
                    WHERE od.user_id = cd.user_id
                    AND sop.program_status <> 4
                    ${
                      client_status === "Tailend"
                        ? "AND sop.total_sessions - sop.sent_sessions = 3"
                        : ""
                    }
                    AND cd.suggested_program_id IS NOT NULL
                )
                THEN 1 ELSE NULL END) AS ${
                  client_status === "All_active"
                    ? "Active_Pitched"
                    : "Tailend_Pitched"
                }`,
            `COUNT(DISTINCT CASE 
                WHEN cd.sub_user_status IN ("Active", "Dormant", "notstarted", "Completed", "Onhold")
                AND cd.mentor_assigned = ${mentor.admin_user_id}
                AND cd.added_date BETWEEN '${startOfMonth}' AND '${endOfMonth}' 
                AND EXISTS (
                    SELECT 1
                    FROM ${tables.orderDetails} od
                    JOIN ${
                      tables.subOrderPrograms
                    } sop ON od.order_id = sop.order_id
                    WHERE od.user_id = cd.user_id
                    AND sop.program_status <> 4
                    ${
                      client_status === "Tailend"
                        ? "AND sop.total_sessions - sop.sent_sessions = 3"
                        : ""
                    }
                    AND cd.suggested_program_id IS NULL
                )
                THEN 1 ELSE NULL END) AS ${
                  client_status === "All_active"
                    ? "Active_Not_Pitched"
                    : "Tailend_Not_Pitched"
                }`,
          ],
        });

        const counts = noAdClients[0];
        return {
          [mentor.mentor_name]: {
            ...counts,
          },
        };
      }),
    );

    // Calculate totals
    const total = mentorReports.reduce(
      (acc, report) => {
        const mentorCounts = Object.values(report)[0];
        // Check which status is being reported
        if (client_status === "All_active") {
          acc.total += mentorCounts.Total_All_Active || 0;
          acc.Pitched += mentorCounts.Active_Pitched || 0;
          acc.Not_Pitched += mentorCounts.Active_Not_Pitched || 0;
        } else if (client_status === "Tailend") {
          acc.total += mentorCounts.Total_All_Tailend || 0;
          acc.Pitched += mentorCounts.Tailend_Pitched || 0;
          acc.Not_Pitched += mentorCounts.Tailend_Not_Pitched || 0;
        }
        return acc;
      },
      { total: 0, Pitched: 0, Not_Pitched: 0 },
    );

    return res.json({
      data: {
        client_status,
        mentors: Object.assign({}, ...mentorReports),
        total,
      },
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProjectedExpiryReport = async (req, res, next) => {
  try {
    const { mentor_id } = req.body;

    // Calculate the date for 5 days before today
    const expiryDate = moment().subtract(5, "days").format("YYYY-MM-DD");

    const selectFields = [
      "cd.user_id",
      "CONCAT(cd.first_name, ' ', cd.last_name) as client_name",
      "CONCAT(cd.phone_code, ' ', cd.phone_number) as client_phone",
      "cd.email_id",
      "cd.my_wallet",
      "cd.sub_user_status",
      "cd.latest_weight",
      "ad.crm_user as mentor_name",
      "pm.program_name as suggested_program",
      "sp.suggested_amount",
      "ps.program_duration",
    ];

    const conditions = [
      {
        field: "cd.mentor_assigned",
        operator: "=",
        value: mentor_id,
      },
      {
        field: "cd.latest_weight",
        operator: ">",
        value: "70",
      },
      {
        field: "sop.expiry_date",
        operator: "=",
        value: expiryDate, // Use the calculated expiry date here
      },
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.sub_order_id = cd.active_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = cd.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id  = cd.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sp.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "pm.program_id = ps.program_id",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
    });

    const data = results.map((i) => ({
      client_id: i.user_id,
      client_name: i.client_name,
      client_phone: i.client_phone,
      client_email: i.email_id,
      client_my_wallet: i.my_wallet,
      client_status: i.sub_user_status,
      mentor_assigned: i.mentor_name,
      client_latest_weight: i.latest_weight,
      suggested_program: i.suggested_program,
      suggested_amount: i.suggested_amount,
      suggested_program_duration: i.program_duration,
    }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Projected expiry report fetched successfully`,
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendNoAdvUnPitched = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "CONCAT(ud.phone_code, ' ', ud.phone_number) AS phone_number",
        `CONCAT("'",ud.phone) as full_number`,
        "ud.my_wallet",
        "pm.program_name",
        "ud.user_status",
        "ud.latest_weight AS last_weight",
        "ad.crm_user AS mentor",
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.pending_session",
          operator: "<",
          value: 3,
        },
        {
          field: "adv_sop.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
        {
          field: "sp.suggested_program_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: `sp.suggested_program_id  = ud.suggested_program_id AND sp.updated_date  >= '${moment()
            .startOf("month")
            .format("YYYY-MM-DD")}'`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id ",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} adv_sop`,
          on: "adv_sop.user_id = ud.user_id AND adv_sop.program_status = '4'",
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Tailend No Advance Purchase Not Pitched Report",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProgramFeedbackReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "	CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone",
        "pf.rate_mentor",
        "pf.improvement_needed",
        "pf.added_date",
        "ad.crm_user AS mentor",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.finalFeedback} pf`,
          on: "pf.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
      ],
      conditions: [
        {
          field: "pf.added_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Program Feedback Report Fetched Successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUnconvertedReferral = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "    CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone",
        `CASE 
        WHEN ud.gender = 1 THEN 'Male'
        WHEN ud.gender = 2 THEN 'Female'
        ELSE 'Other'  
    END AS gender`,
        `CASE 
        WHEN ud.sales_status = 0 THEN 'To Engage'
        WHEN ud.sales_status = 1 THEN '1st Pitch'
        WHEN ud.sales_status = 2 THEN 'HOT'
                WHEN ud.sales_status = 3 THEN 'WARM'
                                WHEN ud.sales_status = 4 THEN 'COLD'
        ELSE 'Other'  
    END AS lead_status`,
        `pm.program_name`,
        `sp.suggested_amount AS qtd_amount`,
        "JSON_KEYS(cl.key_insights) AS key_insights",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.consultationLogs} cl`,
          on: "cl.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.primary_lead_source", operator: "IN", value: [22, 23] },
        { field: "od.order_id", operator: "IS", value: "NULL", raw: true },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Unconverted Referral Fetched Successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUnpaidPaymentDetailsShared = async (req, res, next) => {
  try {
    const { date } = req.body;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone_number",
        "ud.user_status",
        "pm.program_name",
        "sp.suggested_amount",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "sp.suggested_amount", operator: ">", value: 0 },
        {
          orConditions: [
            { field: "sp.suggested_amount", operator: ">", value: 0 },
            {
              field: "od.order_date",
              operator: "<=",
              value: "sp.updated_date",
            },
            {
              field: "ud.mentor_assigned",
              operator: "!=",
              value: "196",
            },
          ],
        },
        {
          field: "sp.updated_date",
          operator: "BETWEEN",
          value: [
            `${moment(date).startOf("month").format("YYYY-MM-DD")}`,
            `${moment(date).endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Unpaid Rate Shared Report Fetched Successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getExpiringClientsWith70Kg = async (req, res, next) => {
  try {
    const { date } = req.body;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone_number",
        "ud.user_status",
        "pm.program_name",
        "ud.latest_weight",
        "ad.crm_user AS mentor",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} adv_sop`,
          on: "adv_sop.user_id = ud.user_id AND adv_sop.program_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
      ],
      conditions: [
        {
          field: "sop.expiry_date",
          operator: "BETWEEN",
          value: [
            `${moment(date).startOf("month").format("YYYY-MM-DD")}`,
            `${moment(date).endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: "adv_sop.sub_order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.latest_weight",
          operator: ">",
          value: 70,
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Expiring Clients With 70 Kg Report Fetched Successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getExpiredLink = async (req, res, next) => {
  try {
    const { date } = req.body;
    const { results } = await readRecord({
      table: `${tables.paymentLinks} pl`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone_number",
        "ud.user_status",
        "pm.program_name",
        "ad.crm_user AS mentor",
        "CONCAT(cl_ad.first_name, ' ', cl_ad.last_name) AS counsellor",
        "pl.payment_link",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = pl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = pl.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} cl_ad`,
          on: "cl_ad.admin_user_id = ud.counsellor_assigned",
        },
      ],
      conditions: [
        { field: "pl.expiry_at", operator: "<", value: "CURDATE()", raw: true },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
        {
          field: "pl.expiry_at",
          operator: "BETWEEN",
          value: [
            `${moment(date).startOf("month").format("YYYY-MM-DD")}`,
            `${moment(date).endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
        { field: "pl.payment_status", operator: "=", value: "pending" },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Expired Payment Link",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const goodWeightLoss = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone_number",
        "ud.user_status",
        "ud.start_weight",
        "ud.latest_weight",
        "ud.goal_weight",
        "pm.program_name",
        "ad.crm_user AS mentor",
        "ud.start_weight - ud.latest_weight AS loss",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
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
        {
          field: "ud.start_weight - ud.latest_weight",
          operator: ">",
          value: 5,
        },
        {
          field: "sop.program_status",
          operator: "=",
          value: 1,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Good Weight Loss",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendNoAdvUnPitchedSumamry = async (req, res, next) => {
  try {
    const { date = moment().format("YYYY-MM-DD") } = req.body;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ad.crm_user AS mentor",
        `COUNT(DISTINCT ud.user_id) AS total`,
        `COUNT(
		DISTINCT CASE WHEN ud.suggested_program_id IS NOT NULL THEN ud.user_id END
	) AS pitched`,
        `COUNT(
		DISTINCT CASE WHEN ud.suggested_program_id IS NOT NULL
		AND sp.suggested_amount IS NULL THEN ud.user_id END
	) AS '1st_pitched'`,
        `COUNT(
		DISTINCT CASE WHEN ud.suggested_program_id IS NULL THEN ud.user_id END
	) AS 'not_pitched'`,
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} adv_sop`,
          on: "adv_sop.user_id = ud.user_id AND adv_sop.program_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "sop.pending_session", operator: "<=", value: 3 },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
        {
          field: "sp.updated_date",
          operator: "BETWEEN",
          value: [
            `${moment(date).startOf("month").format("YYYY-MM-DD")}`,
            `${moment(date).endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: "adv_sop.sub_order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
      groupBy: ["ad.admin_user_id"],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Tailend No Advance Purchase Summary",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const totalPitchedNotPaid = async (req, res, next) => {
  try {
    const { client_status, date } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "	ad.crm_user AS mentor",
        "COUNT(DISTINCT ud.user_id) AS total_ocr",
        `COUNT(
		DISTINCT CASE WHEN od.order_id IS NULL THEN ud.user_id END
	) AS pitched_unpaid`,
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.user_id = ud.user_id 	AND od.order_date > sp.updated_date",
        },
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: client_status === "Active" ? "Active" : "Completed",
        },
        {
          field: "ud.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
        {
          field: "sp.updated_date",
          operator: "BETWEEN",
          value: [
            moment(date).startOf("month").format("YYYY-MM-DD"),
            moment(date).endOf("month").format("YYYY-MM-DD"),
          ],
        },
      ],
      groupBy: ["ad.admin_user_id"],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Total Pitched Not Paid Report Fetched Successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProgramFeedbackSummaryReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "ad.crm_user AS mentor",
          ...Array(5)
            .fill()
            .map(
              (_, index) => ` 
           COUNT(DISTINCT CASE WHEN pf.rate_mentor = ${
             5 - index
           } AND pf.added_date BETWEEN '${start_date}' AND '${end_date}' THEN ud.user_id END) AS '${
             5 - index
           } rating'`,
            ),
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.finalFeedback} pf`,
            on: "pf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ad.is_active", operator: "=", value: 1 },

          { field: "ad.role_id", operator: "=", value: 1 },
          {
            field: "ud.mentor_assigned",
            operator: "!=",
            value: "196",
          },
        ],
        groupBy: ["ad.admin_user_id"],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "'Total' AS crm_user",
          ...Array(5)
            .fill()
            .map(
              (_, index) => ` 
           COUNT(DISTINCT CASE WHEN pf.rate_mentor = ${
             5 - index
           } AND pf.added_date BETWEEN '${start_date}' AND '${end_date}' THEN ud.user_id END) AS '${
             5 - index
           } rating'`,
            ),
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.finalFeedback} pf`,
            on: "pf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ad.is_active", operator: "=", value: 1 },

          { field: "ad.role_id", operator: "=", value: 1 },
          {
            field: "pf.added_date",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: "ud.mentor_assigned",
            operator: "!=",
            value: "196",
          },
        ],
      },
    ]);
    return res.status(200).json(
      new ApiResponse({
        message: "Program Feedback Report fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const InductionCallSummaryReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const { results } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(DISTINCT ud.user_id) AS 'total new & OCR Purchase'",
        "COUNT(DISTINCT CASE WHEN cu.user_id IS NULL THEN ud.user_id END) AS 'call not booked'",
        "COUNT(DISTINCT CASE WHEN cu.call_type = 3 AND cu.call_status = 1 THEN ud.user_id END) AS 'call done'",
        "COUNT(DISTINCT CASE WHEN cu.call_type = 3 AND cu.call_status <> 1 THEN ud.user_id END) AS 'call not done'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = od.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.order_id = od.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND  cu.sub_order_id = ud.active_order_id AND cu.call_type = 3",
        },
      ],
      conditions: [
        {
          field: "od.order_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        { field: "sop.order_type", operator: "IN", value: ["New", "OCR"] },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Induction Call Summary Report fetched successfully",
        data: results[0],
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const InductionCallDataReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS `name`",
        "ud.email_id AS email",
        "CONCAT(ud.phone_code, ud.phone_number) AS phone",
        "ud.my_wallet AS wallet",
        "IFNULL(DATE_FORMAT(cu.schedule_date, '%d-%m-%Y'), '') AS `call scheduled date`",
        "ad.crm_user AS mentor",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = od.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.order_id = od.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id AND cu.call_type = 3",
        },
      ],
      conditions: [
        {
          field: "od.order_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          orConditions: [
            {
              field: "cu.user_id",
              operator: "IS",
              value: `NULL`,
              raw: true,
            },
            {
              field: "cu.call_status",
              operator: "<>",
              value: 1,
            },
          ],
        },
        {
          field: "sop.order_type",
          operator: "IN",
          value: ["New", "OCR"],
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Induction Call Data Report fetched successfully",
        data: results[0],
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allNutritionistAssignedUnpaidLeads = async (req, res, next) => {
  try {
    const { start_date, end_date, wallet } = req.query;

    const minWallet = Number(wallet);
    const hasMinWallet = Number.isFinite(minWallet);

    const conditions = [
      { field: "ad.is_active", operator: "=", value: 1 },
      {
        field: "lal.assign_date",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      },
      // unpaid (no order)
      { field: "od.order_id", operator: "IS", value: "NULL", raw: true },
      // only leads
      { field: "ud.user_status", operator: "=", value: "Lead" },
      {
        field: "ud.counsellor_assigned",
        operator: "NOT IN",
        value: ["196", "10", "0"],
      },
    ];

    if (hasMinWallet) {
      conditions.push({
        field: "COALESCE(ud.my_wallet, 0)",
        operator: ">=",
        value: minWallet,
        raw: true, // use raw so the COALESCE(...) expression is kept as-is
      });
    }

    const { results } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS name",
        "ud.email_id AS email",
        "CONCAT(ud.phone_code, ud.phone_number) AS phone",
        `CONCAT("'",ud.phone) as full_number`,
        "ls.source_name AS source",
        "ud.added_date AS user_added_date",
        "ud.my_wallet as wallet",
        `CONCAT(
        'key_insight: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.key_insight')), ', ',
        'Lifestyle: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Lifestyle')), ', ',
        'Diet_History: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Diet_History')), ', ',
        'Target_Oriented: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Target_Oriented')), ', ',
        'Motivation_Level: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Motivation_Level')), ', ',
        'Awareness_Level: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Awareness_Level')), ', ',
        'Language: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Language')), ', ',
        'Communication: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Communication')), ', ',
        'Meal_Management: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Meal_Management')), ', ',
        'Suggested_Program: ', JSON_UNQUOTE(JSON_EXTRACT(cl.key_insights, '$.Suggested_Program'))
    ) AS key_insights`,
        "pm.program_name AS suggested_program",
        "sp.suggested_amount",
        `IFNULL(
        CASE 
            WHEN cu.call_type = 14 THEN 'Follow-up Call'
            WHEN cu.call_type = 30 THEN 'Consultation Call'
            ELSE 'Other'
        END,
        'Not Booked'
    ) AS call_type`,
        "cu.schedule_date",
        "lfl.follow_up_note",
        "ad.crm_user AS mentor",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: "lal.counsellor_id = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = lal.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "ls.source_id = ud.primary_lead_source",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.consultationLogs} cl`,
          on: "cl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sp.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} lfl`,
          on: "lfl.user_id = ud.user_id",
        },
      ],
      conditions,
      groupBy: ["ud.user_id"],
    });
    return res.status(200).json(
      new ApiResponse({
        message:
          "All Nutritionist Assigned Unpaid Leads Report fetched successfully",
        data: results.map((i) => {
          return {
            ...i,
            wallet: i.wallet ? i.wallet : 0,
            follow_up_note: i.follow_up_note ? i.follow_up_note : "N/A",
            user_added_date: moment(i.user_added_date).format("DD-MM-YYYY"),
            schedule_date: i.schedule_date
              ? moment(i.schedule_date).format("DD-MM-YYYY")
              : "N/A",
          };
        }),
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const mentorWiseAllActiveNoAdvUnPitched = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "CONCAT(ud.first_name, ' ', ud.last_name) AS 'name'",
        "ud.user_id",
        "CONCAT(ud.phone_code, ud.phone_number) AS 'phone'",
        "ud.email_id AS 'email'",
        "ud.my_wallet AS 'wallet'",
        "ud.sub_user_status",
        "ad.crm_user AS 'mentor'",
        "ud.latest_weight AS 'last weight'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: `sp.user_id = ud.user_id AND sp.updated_date BETWEEN '${start_date}' AND '${end_date}' 	AND sop.program_status = 4`,
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "sop.user_id", operator: "IS", value: "NULL", raw: true },
        { field: "ud.latest_weight", operator: ">", value: 70 },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        message:
          "Mentor Wise All Active No Advance Un Pitched Report fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const mentorWiseAllData = async (req, res, next) => {
  try {
    const { user_status } = req.query;

    // Define filters dynamically
    let conditions = [];
    if (user_status === "Active") {
      conditions = [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "sop.program_status", operator: "IN", value: [1, 2, 4] },
      ];
    } else if (user_status === "OC") {
      conditions = [
        { field: "ud.user_status", operator: "=", value: "Completed" },
        {
          field: "ud.sub_user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        { field: "sop.program_status", operator: "IN", value: [3] },
      ];
    } else if (user_status === "Dormant") {
      conditions = [
        { field: "ud.user_status", operator: "=", value: "Active" },
        {
          field: "ud.sub_user_status",
          operator: "IN",
          value: ["Dormant"],
        },
      ];
    } else {
      return res
        .status(400)
        .json(
          new ApiResponse({ message: "Invalid user_status value", data: [] }),
        );
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS name",
        "ud.email_id",
        'CONCAT("\'", ud.phone) AS phone',
        "ud.phone_code",
        "ud.phone_number",
        "ud.my_wallet",
        "ud.user_status",
        "ud.sub_user_status",
        "sop.start_program_weight",
        "ud.latest_weight",
        `(SELECT program_name FROM programs_master WHERE program_id = sop.program_id) AS program_name`,
        "sop.total_sessions",
        "sop.sent_sessions",
        "sop.pending_session",
        `CASE WHEN ud.app_version IN ('1.1.09', '5.0.54') THEN "Updated" ELSE "Not Updated" END AS app_version`,
        `(SELECT COUNT(sub_order_id) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = '4') AS Adv_Count`,
        `(SELECT COUNT(sub_order_id) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status IN (1,2,3)) AS Program_number`,
        `(CASE WHEN (
          SELECT program_id FROM suggested_program 
          WHERE user_id = ud.user_id 
            AND MONTH(added_date) = MONTH(NOW()) 
            AND YEAR(added_date) = YEAR(NOW()) 
          ORDER BY suggested_program_id DESC 
          LIMIT 1
        ) THEN (
          SELECT program_name FROM programs_master 
          WHERE program_id = (
            SELECT program_id FROM suggested_program 
            WHERE user_id = ud.user_id 
              AND MONTH(added_date) = MONTH(NOW()) 
              AND YEAR(added_date) = YEAR(NOW()) 
            ORDER BY suggested_program_id DESC 
            LIMIT 1
          )
        ) ELSE "NA" END) AS suggested_program`,
        `CASE WHEN (sop.pending_session <= 3 AND 
          (SELECT COUNT(sub_order_id) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = '4') = 0
        ) THEN "Tailend" ELSE "NA" END AS Tailend_status`,
        `(SELECT mg.schedule_date FROM call_updates mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id AND mg.call_type = '0' LIMIT 1) AS welcome_call`,
        `(SELECT hf.overall_health_score FROM bn_client_hs hf WHERE hf.user_id = ud.user_id AND hf.sub_order_id = sop.sub_order_id AND hf.type = '1' LIMIT 1) AS Half_time_hs`,
        `(SELECT mg.schedule_date FROM call_updates mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id AND mg.call_type = '1' LIMIT 1) AS halftime_call`,
        `(SELECT mg.call_insights FROM call_updates mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id AND mg.call_type = '1' LIMIT 1) AS halftime_call_comment`,
        `(SELECT hf.mentor_star_rating FROM bn_halftime_feedback hf WHERE hf.user_id = ud.user_id AND hf.sub_order_id = sop.sub_order_id LIMIT 1) AS Half_time_feedback`,
        `(SELECT JSON_EXTRACT(mg.comment, '$.new_goals') FROM my_goals_1 mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id LIMIT 1) AS New_Goal`,
        `(SELECT JSON_EXTRACT(mg.comment, '$.goals_achieved') FROM my_goals_1 mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id LIMIT 1) AS goals_achieved`,
        `(SELECT JSON_EXTRACT(mg.comment, '$.pending_goals') FROM my_goals_1 mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id LIMIT 1) AS pending_goals`,
        `(SELECT hf.overall_health_score FROM bn_client_hs hf WHERE hf.user_id = ud.user_id AND hf.sub_order_id = sop.sub_order_id AND hf.type = '2' LIMIT 1) AS Tailend_hs`,
        `(SELECT mg.schedule_date FROM call_updates mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id AND mg.call_type = '2' LIMIT 1) AS final_feedback_call`,
        `(SELECT mg.call_insights FROM call_updates mg WHERE mg.user_id = ud.user_id AND mg.sub_order_id = sop.sub_order_id AND mg.call_type = '2' LIMIT 1) AS final_feedback_call_comment`,
        `(SELECT ff.rate_mentor FROM bn_final_feedback ff WHERE ff.user_id = ud.user_id AND ff.sub_order_id = sop.sub_order_id LIMIT 1) AS Final_feedback`,
        `(SELECT crm_user FROM admin_users WHERE admin_user_id = ud.mentor_assigned) AS mentor`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
      ],
      conditions,
      groupBy: ["ud.user_id"],
    });

    return res.status(200).json(
      new ApiResponse({
        message: "Mentor Wise All Data Report fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.error("mentorWiseAllData error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getHfFeedDatabackReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "	CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
        "ud.email_id",
        "ud.phone",
        "hf.mentor_star_rating",
        "hf.improvement_needed",
        "hf.added_date",
        "ad.crm_user AS mentor",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.halfTimeFeedback} hf`,
          on: "hf.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
      ],
      conditions: [
        {
          field: "hf.added_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "ud.mentor_assigned",
          operator: "!=",
          value: "196",
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Hf Feedback Report Fetched Successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const HsReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    const { results } = await readRecord({
      table: `${tables.healthScoreClient} hs`,
      selectFields: [
        "COUNT(DISTINCT hs.user_id) AS 'total hs'",
        "COUNT(DISTINCT CASE WHEN ud.counsellor_assigned IS NULL THEN hs.user_id END) AS 'unassigned'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = hs.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Lead" },
        {
          field: "DATE(hs.created)",
          operator: !start_date ? "=" : "BETWEEN",
          value: !start_date ? "DATE(NOW())" : [`${start_date}`, `${end_date}`],
          ...(!start_date ? { raw: true } : {}),
        },
      ],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Health Score Report fetched successfully",
        data: results[0],
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const morningLeadConsultationReport = async (req, res, next) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "'consultation_call' AS metric",
          "COUNT(DISTINCT cu.user_id) AS value",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
        condition: [
          { field: "cu.call_type", operator: "=", value: "30" },
          { field: "cu.source", operator: "IN", value: ["WEB"] },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          {
            field: "date(cu.added_date)",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "date(cu.added_date)",
            operator: "<>",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "cu.added_by",
            operator: "!=",
            value: "196",
          },
          {
            field: "cu.slot_id",
            operator: "!=",
            value: "0",
          },
        ],
      },
      {
        table: `${tables.healthScoreClient} hs`,
        selectField: [
          "'hs_yesterday_excluding_insta_leads' AS metric",
          "COUNT(DISTINCT hs.user_id) AS value",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = hs.user_id",
          },
        ],
        condition: [
          {
            field: "ud.primary_lead_source",
            operator: "NOT IN",
            value: "(6,7,8,9,10,11,12,13,14,15)",
            raw: true,
          },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          {
            field: "date(hs.created)",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "date(hs.created)",
            operator: "<>",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.healthScoreClient} hs`,
        selectField: [
          "'hs_yesterday_insta_leads' AS metric",
          "COUNT(DISTINCT hs.user_id) AS value",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = hs.user_id",
          },
        ],
        condition: [
          {
            field: "ud.primary_lead_source",
            operator: "IN",
            value: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          {
            field: "date(hs.created)",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "date(hs.created)",
            operator: "<>",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.healthScoreClient} hs`,
        selectField: [
          "'unassigned_hs_(3/4)' AS metric",
          "COUNT(DISTINCT hs.user_id) AS value",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = hs.user_id",
          },
        ],
        condition: [
          {
            field: "ud.primary_lead_source",
            operator: "IN",
            value: [1, 2],
          },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          {
            field: "hs.created",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "DATE(hs.created)",
            operator: "<>",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          " 'total_unassigned_registration' AS metric",
          "COUNT(DISTINCT ud.user_id) AS value",
        ],
        condition: [
          {
            field: "ud.primary_lead_source",
            operator: "=",
            value: 5,
          },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          {
            field: "ud.added_date",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "DATE(ud.added_date)",
            operator: "<>",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "'total_calls_booked_by_counsellor' AS metric",
          "COUNT(cu.call_id) AS value",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = cu.added_by",
          },
        ],
        condition: [
          {
            field: "date(cu.added_date)",
            operator: "=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "DATE(cu.schedule_date)",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "cu.source",
            operator: "IN",
            value: ["dashboard", "sales dash", "DB", " "],
          },
          {
            field: "ad.role_id",
            operator: "IN",
            value: [2, 6],
          },
          {
            field: "ad.is_active",
            operator: "=",
            value: 1,
          },
          {
            field: "cu.slot_id",
            operator: "!=",
            value: "0",
          },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: ["ad.crm_user AS metric", "COUNT(cu.call_id) AS value"],
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = cu.added_by",
          },
        ],
        condition: [
          {
            field: "date(cu.added_date)",
            operator: "=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "DATE(cu.schedule_date)",
            operator: ">=",
            value:
              "CASE WHEN DAYOFWEEK(NOW()) = 2 THEN DATE(NOW() - INTERVAL 2 DAY) ELSE DATE(NOW() - INTERVAL 1 DAY) END",
            raw: true,
          },
          {
            field: "cu.source",
            operator: "IN",
            value: ["dashboard", "sales dash", "DB", " "],
          },
          {
            field: "ad.role_id",
            operator: "IN",
            value: [2, 6],
          },
          {
            field: "ad.is_active",
            operator: "=",
            value: 1,
          },
          {
            field: "cu.slot_id",
            operator: "!=",
            value: "0",
          },
        ],
        groupBy: ["ad.admin_user_id"],
      },
    ]);
    return res.status(200).json(
      new ApiResponse({
        message: "Morning Lead Consultation Report fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const comCallNotDoneSummary = async (req, res, next) => {
  try {
    const { start_date } = req.query;

    // Default to current month start if not provided
    const callDate = start_date
      ? moment(start_date).format("YYYY-MM-DD")
      : moment().startOf("month").format("YYYY-MM-DD");

    const filteredUserIds = [
      8075, 9772, 11559, 48669, 58609, 59678, 64341, 66091, 66525, 66553, 67454,
      70914, 72502, 73780, 75623, 76293, 77306, 85068, 86423, 87513, 90733,
      90938, 91851, 96506, 97101, 97942, 103600, 105460, 105633, 107854, 109445,
      109954, 110671, 114953, 115008, 117669, 117714, 118669, 120251, 120840,
      121093, 121354, 122004, 122129, 122229, 122343, 122706, 122708, 122811,
      122923, 122936, 123251, 123411, 123555, 123666, 123706, 123995, 124099,
      124167, 125150, 125214, 125262, 125387, 125389, 125513, 125514, 125627,
      126424, 126553, 127065, 127119, 127122, 127125, 127187, 127260, 127302,
      127391, 127490, 127543, 127562, 127850,
    ];

    const formattedUserIdList = `(${filteredUserIds.join(",")})`;

    const sql = `
      SELECT 
          ad.crm_user AS mentor,
          COUNT(DISTINCT ud.user_id) AS total,
          COUNT(DISTINCT CASE WHEN cu.call_id IS NOT NULL THEN ud.user_id END) AS scheduled,
          COUNT(DISTINCT CASE WHEN cu.call_id IS NULL THEN ud.user_id END) AS not_scheduled
      FROM users_details ud
      INNER JOIN admin_users ad ON ad.admin_user_id = ud.mentor_assigned
      LEFT JOIN (
          SELECT DISTINCT user_id, call_id 
          FROM call_updates 
          WHERE call_type NOT IN ('0','1','2','3') 
          AND DATE(schedule_date) >= '${callDate}'
      ) cu ON cu.user_id = ud.user_id
      WHERE 
          ud.user_id IN ${formattedUserIdList}
          AND ud.mentor_assigned != 266
      GROUP BY ad.crm_user

      UNION ALL

      SELECT 
          'Total' AS mentor,
          COUNT(DISTINCT ud.user_id) AS total,
          COUNT(DISTINCT CASE WHEN cu.call_id IS NOT NULL THEN ud.user_id END) AS scheduled,
          COUNT(DISTINCT CASE WHEN cu.call_id IS NULL THEN ud.user_id END) AS not_scheduled
      FROM users_details ud
      LEFT JOIN (
          SELECT DISTINCT user_id, call_id 
          FROM call_updates 
          WHERE call_type NOT IN ('0','1','2','3') 
          AND DATE(schedule_date) >= '${callDate}'
      ) cu ON cu.user_id = ud.user_id
      WHERE 
          ud.user_id IN ${formattedUserIdList}
          AND ud.mentor_assigned != 266;
    `;

    const results = await readRawQuery(sql);

    return res.status(200).json(
      new ApiResponse({
        message: "Com Call Not Done Summary Report",
        data: {
          data: results,
        },
      }),
    );
  } catch (error) {
    console.error("Error in comCallNotDoneSummary:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const comCallNotDoneData = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.changeOfMentor} com`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.email_id",
        "ud.user_status",
        "ud.sub_user_status",
        "ad.crm_user AS 'mentor'",
        `(SELECT crm_user FROM ${tables.adminUsers} WHERE admin_user_id = com.old_mentor) AS 'Old Mentor'`,
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `cu.user_id = com.user_id AND cu.call_type not in ('0','1','2','3') AND date(cu.schedule_date) >='${moment()
            .startOf("month")
            .format("YYYY-MM-DD")} AND cu.call_status <> 1'`,
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "com.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = com.new_mentor",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "com.old_mentor", operator: "<>", value: "com.new_mentor" },
        { field: "com.old_mentor", operator: "<>", value: 0 },
        {
          field: "com.added_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
      ],
      groupBy: ["ud.user_id"],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Com Call Not Done Data fetched Successfully",
        data: results.map((i) => {
          return {
            ...i,
            schedule_date: moment(i.schedule_date).format("DD-MM-YYYY"),
          };
        }),
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const rateSharedAbdulReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(DISTINCT ud.user_id) AS units",
        "SUM(sp.suggested_amount) AS amounts",
        "ad.crm_user AS mentor",
        "ud.user_status",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = (CASE WHEN ud.user_type= '1' THEN ud.mentor_assigned ELSE ud.counsellor_assigned END)",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.user_id = ud.user_id AND od.order_date > sp.updated_date",
        },
      ],
      conditions: [
        {
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "ud.sales_status",
          operator: "!=",
          value: 1,
        },
        {
          field: "sp.suggested_amount",
          operator: ">",
          value: 0,
        },
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Active", "Lead", "Completed"],
        },
        {
          field: "ad.crm_user",
          operator: "!=",
          value: "196",
        },
        {
          field: "od.order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
      groupBy: ["ad.crm_user", "ud.user_status"],
    });
    return res
      .status(200)
      .json(
        new ApiResponse({ message: "Rate Shared Abdul Report", data: results }),
      );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const khyatiSmLeadDayEnd = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ message: "Missing start_date or end_date" });
    }

    const query = `
      SELECT 
        ud.user_id, ud.first_name, ud.email_id, ud.phone, ud.phone_code, ud.phone_number, 
        ud.stage, ud.sales_status, ud.lead_type, ad.crm_user, 
        (SELECT source_name FROM lead_source WHERE source_id = ud.primary_lead_source) AS primary_lead_source,
        (CASE WHEN od.user_id IS NOT NULL THEN ud.user_id END) AS paid
      FROM lead_assigned_log lal
      LEFT JOIN users_details ud ON ud.user_id = lal.user_id
      LEFT JOIN admin_users ad ON ad.admin_user_id = lal.counsellor_id
      LEFT JOIN order_details od ON od.user_id = ud.user_id AND od.order_type = 'New'
      WHERE DATE(lal.assign_date) BETWEEN ? AND ?
        AND lal.counsellor_id <> 196
        AND ud.primary_lead_source IN (6, 7, 8, 9, 10, 11, 12, 13, 14, 15)
      GROUP BY ud.user_id
    `;

    const [results] = await db.raw(query, [start_date, end_date]);

    return res.status(200).json(
      new ApiResponse({
        message: "Khyati SM New Leads Summary Report",
        data: {
          data: results,
        },
      }),
    );
  } catch (error) {
    console.error("Error fetching report:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const shareReportSheet = async (req, res, next) => {
  try {
    const { data, email_id, sheet_name } = req.body;
    const sheetUrl = await generateDailyReport({
      data,
      senderEmail: email_id,
      sheetName: sheet_name,
    });

    await sendMailUtil({
      to: email_id,
      subject: `Your Report Sheet ${sheet_name} is Ready`,
      html: `<p>Hello,</p>
        <p>Your requested report sheet <strong>${sheet_name}</strong> is ready.</p>
        <p>
          <a href="${sheetUrl}" target="_blank" style="color: #4f46e5; text-decoration: underline;">
            Click here to view the sheet
          </a>
        </p>
        <br/>
        <p>Regards,<br/>Balance Nutrition Tech Team</p>`,
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Report Sheet Link Created And Shared Successfully",
        data: {
          sheet_url: sheetUrl,
        },
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAppStatusummary = async (req, res, next) => {
  const appVersions = {
    ios: "1.1.09",
    android: "5.0.54",
  };
  try {
    const getQuery = (userStatus) => {
      const iosLike = `'1.%'`;
      const androidLike = `'5.%'`;
      const androidVersion = appVersions.android;
      const iosVersion = appVersions.ios;

      const baseCondition =
        userStatus === "active"
          ? "ud.user_status = 'Active' AND sop.program_status IN (1, 2, 4)"
          : "ud.user_status = 'Completed' AND sop.program_status IN (3) AND sop.program_status NOT IN (1, 2, 4)";

      return `
        SELECT 'iOS Users (Total)' AS label, COUNT(*) AS App_Status
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version LIKE ${iosLike}

        UNION ALL

        SELECT 'iOS Users - Updated', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version = '${iosVersion}'

        UNION ALL

        SELECT 'iOS Users - Not Updated', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version LIKE ${iosLike} AND ud.app_version != '${iosVersion}'

        UNION ALL

        SELECT 'Android Users (Total)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND (ud.app_version LIKE ${androidLike} OR ud.app_version IS NULL OR ud.app_version NOT LIKE ${iosLike})

        UNION ALL

        SELECT 'Android Users - Updated', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version = '${androidVersion}'

        UNION ALL

        SELECT 'Android Users - Not Updated', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND (ud.app_version IS NULL OR (ud.app_version NOT LIKE ${iosLike} AND ud.app_version != '${androidVersion}'))
      `;
    };

    const [activeRows] = await writePool.query(getQuery("active"));
    const [ocrRows] = await writePool.query(getQuery("ocr"));

    const formatRows = (rows) => {
      const result = {};
      for (const row of rows) {
        result[row.label] = row.App_Status;
      }
      return result;
    };

    return res.status(200).json(
      new ApiResponse({
        message: "App Status Summary Report fetched Successfully",
        data: {
          active: formatRows(activeRows),
          ocr: formatRows(ocrRows),
        },
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAppStatusForMail = async (req, res, next) => {
  try {
    const getQuery = (userStatus) => {
      const baseCondition =
        userStatus === "active"
          ? "ud.user_status = 'Active' AND sop.program_status IN (1, 2, 4)"
          : "ud.user_status = 'Completed' AND sop.program_status = 3";

      return `
        -- iOS Users (Total)
        SELECT 'iOS Users (Total)' AS label, COUNT(*) AS App_Status
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version LIKE '1.%'

        UNION ALL

        -- iOS Users - Updated (Latest)
        SELECT 'iOS Users - Updated (Latest)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version = '1.1.09'

        UNION ALL

        -- iOS Users - Not Updated (New)
        SELECT 'iOS Users - Not Updated (New)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version = '1.1.06'

        UNION ALL

        -- iOS Users - Not Updated (OLD)
        SELECT 'iOS Users - Not Updated (OLD)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition}
          AND ud.app_version LIKE '1.%'
          AND ud.app_version NOT IN ('1.1.06', '1.1.09')

        UNION ALL

        -- Android Users (Total)
        SELECT 'Android Users (Total)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition}
          AND (ud.app_version LIKE '5.%' OR ud.app_version IS NULL OR ud.app_version NOT LIKE '1.%')

        UNION ALL

        -- Android Users - Updated (Latest)
        SELECT 'Android Users - Updated (Latest)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version = '5.0.54'

        UNION ALL

        -- Android Users - Not Updated (New)
        SELECT 'Android Users - Not Updated (New)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition} AND ud.app_version IN ('5.0.53', '5.0.52', '5.0.51')

        UNION ALL

        -- Android Users - Not Updated (OLD)
        SELECT 'Android Users - Not Updated (OLD)', COUNT(*)
        FROM users_details ud
        INNER JOIN sub_orders_programs sop ON ud.active_order_id = sop.sub_order_id
        WHERE ${baseCondition}
          AND ud.app_version NOT IN ('5.0.53', '5.0.52', '5.0.51', '5.0.54')
          AND (ud.app_version LIKE '5.%' OR ud.app_version IS NULL OR ud.app_version NOT LIKE '1.%')
      `;
    };

    const [activeRows] = await writePool.query(getQuery("active"));
    const [ocrRows] = await writePool.query(getQuery("ocr"));

    const formatRows = (rows) => {
      const result = {};
      for (const row of rows) {
        result[row.label] = row.App_Status;
      }
      return result;
    };

    return res.status(200).json(
      new ApiResponse({
        message: "App Status Summary Report fetched successfully",
        data: {
          active: formatRows(activeRows),
          ocr: formatRows(ocrRows),
        },
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const forcepointSummaryReport = async (req, res, next) => {
  try {
    const sqlQuery = `
      SELECT 
        COALESCE(au.crm_user, 'NOT ASSIGNED') AS Mentor,
        COUNT(DISTINCT ud.email_id) AS Lead_Count,
        (
          SELECT COUNT(DISTINCT od.user_id)
          FROM order_details od
          JOIN users_details u2 ON od.user_id = u2.user_id
          WHERE od.sale_by = ud.counsellor_assigned
            AND u2.primary_lead_source = '43'
            AND DATE(u2.added_date) >= '2025-06-04'
            AND u2.counsellor_assigned = ud.counsellor_assigned
        ) AS Sales
      FROM users_details ud
      LEFT JOIN admin_users au ON au.admin_user_id = ud.counsellor_assigned
      WHERE ud.primary_lead_source = '43'
        AND DATE(ud.added_date) >= '2025-06-04'
      GROUP BY ud.counsellor_assigned

      UNION ALL

      SELECT 
        'TOTAL' AS Mentor,
        COUNT(DISTINCT ud.email_id) AS Lead_Count,
        (
          SELECT COUNT(DISTINCT od.user_id)
          FROM order_details od
          JOIN users_details u2 ON od.user_id = u2.user_id
          WHERE u2.primary_lead_source = '43'
            AND DATE(u2.added_date) >= '2025-06-04'
        ) AS Sales
      FROM users_details ud
      WHERE ud.primary_lead_source = '43'
        AND DATE(ud.added_date) >= '2025-06-04';
    `;
    const [rows] = await writePool.query(sqlQuery);
    return res.status(200).json(
      new ApiResponse({
        message: "Forcepoint Summary Report fetched successfully",
        data: {
          data: rows,
        },
      }),
    );
  } catch (error) {
    console.log("Forcepoint error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const forcepointLeadWiseReport = async (req, res, next) => {
  try {
    const sqlQuery = `
      SELECT
        ud.user_id,
        ud.first_name,
        ud.email_id,
        ud.phone,
        ud.phone_code,
        ud.phone_number,
        ud.stage,
        CASE ud.sales_status
          WHEN 0 THEN 'To Engage'
          WHEN 1 THEN '1st Pitch'
          WHEN 2 THEN 'HOT'
          WHEN 3 THEN 'WARM'
          WHEN 4 THEN 'COLD'
          WHEN 5 THEN 'Converted'
          WHEN 6 THEN 'Connected'
          WHEN 7 THEN 'Consultation Booked'
          ELSE 'Unknown'
        END AS sales_status,
        ud.lead_type,  
        (
          CASE 
            WHEN (
              SELECT program_id 
              FROM suggested_program 
              WHERE user_id = ud.user_id 
                AND MONTH(added_date) = MONTH(NOW()) 
                AND YEAR(added_date) = YEAR(NOW()) 
              ORDER BY suggested_program_id DESC 
              LIMIT 1
            )
            THEN (
              SELECT program_name 
              FROM programs_master 
              WHERE program_id = (
                SELECT program_id 
                FROM suggested_program 
                WHERE user_id = ud.user_id 
                  AND MONTH(added_date) = MONTH(NOW()) 
                  AND YEAR(added_date) = YEAR(NOW()) 
                ORDER BY suggested_program_id DESC 
                LIMIT 1
              )
              LIMIT 1
            )
            ELSE 'NA'
          END
        ) AS suggested_program,
        ad.crm_user AS mentor,
        (
          SELECT source_name
          FROM lead_source
          WHERE source_id = ud.primary_lead_source
        ) AS primary_lead_source,
        (
          CASE 
            WHEN od.user_id IS NOT NULL THEN 'PAID'
            ELSE 'NOT PAID'
          END
        ) AS paid,
        ud.user_status
      FROM lead_assigned_log lal
      LEFT JOIN users_details ud ON ud.user_id = lal.user_id
      LEFT JOIN admin_users ad ON ad.admin_user_id = lal.counsellor_id
      LEFT JOIN order_details od ON od.user_id = ud.user_id AND od.order_type = 'New'
      WHERE ud.primary_lead_source = '43'
        AND DATE(ud.added_date) >= '2025-06-04'
      GROUP BY ud.phone
    `;

    const [rows] = await writePool.query(sqlQuery);

    return res.status(200).json(
      new ApiResponse({
        message: "ForcePoint Lead Details fetched successfully",
        data: {
          data: rows,
        },
      }),
    );
  } catch (error) {
    console.error("ForcePoint Leads Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentorStatisticsUnion = async (req, res, next) => {
  try {
    const tableList = [
      {
        selectField: [
          "au.crm_user AS mentor_name",
          "COUNT(DISTINCT ud.user_id) AS total_clients",
          'SUM(CASE WHEN (SELECT 1 FROM call_updates WHERE user_id = ud.user_id AND sub_order_id = sop.sub_order_id AND call_type = "0" LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS welcome_call_done',
          'SUM(CASE WHEN (SELECT 1 FROM call_updates WHERE user_id = ud.user_id AND sub_order_id = sop.sub_order_id AND call_type = "1" LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS halftime_call_done',
          'SUM(CASE WHEN (SELECT 1 FROM call_updates WHERE user_id = ud.user_id AND sub_order_id = sop.sub_order_id AND call_type = "2" LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS final_call_done',
          'SUM(CASE WHEN (SELECT overall_health_score FROM bn_client_hs WHERE user_id = ud.user_id AND sub_order_id = sop.sub_order_id AND type = "2" LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS tailend_hs_received',
          "SUM(CASE WHEN (SELECT rate_mentor FROM bn_final_feedback WHERE user_id = ud.user_id AND sub_order_id = sop.sub_order_id LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS final_feedback_received",
          "SUM(CASE WHEN (SELECT program_id FROM suggested_program WHERE user_id = ud.user_id AND MONTH(added_date) = MONTH(NOW()) AND YEAR(added_date) = YEAR(NOW()) LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS suggested_program_present",
          'SUM(CASE WHEN sop.pending_session <= 3 AND (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") = 0 THEN 1 ELSE 0 END) AS tailend_clients',
          'SUM(CASE WHEN sop.pending_session <= 3 AND (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") = 0 AND (SELECT program_id FROM suggested_program WHERE user_id = ud.user_id AND MONTH(added_date) = MONTH(NOW()) AND YEAR(added_date) = YEAR(NOW()) LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS tailend_with_suggested_program',
          'SUM(CASE WHEN NOT (sop.pending_session <= 3 AND (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") = 0) AND (SELECT program_id FROM suggested_program WHERE user_id = ud.user_id AND MONTH(added_date) = MONTH(NOW()) AND YEAR(added_date) = YEAR(NOW()) LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS not_tailend_with_suggested_program',
          'SUM(CASE WHEN (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") > 0 THEN 1 ELSE 0 END) AS advance_clients',
          'SUM(CASE WHEN (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") > 0 AND (SELECT program_id FROM suggested_program WHERE user_id = ud.user_id AND MONTH(added_date) = MONTH(NOW()) AND YEAR(added_date) = YEAR(NOW()) LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS advance_with_suggested_program',
          'SUM(CASE WHEN (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") = 0 THEN 1 ELSE 0 END) AS no_advance_clients',
          'SUM(CASE WHEN (SELECT COUNT(*) FROM sub_orders_programs WHERE user_id = ud.user_id AND program_status = "4") = 0 AND (SELECT program_id FROM suggested_program WHERE user_id = ud.user_id AND MONTH(added_date) = MONTH(NOW()) AND YEAR(added_date) = YEAR(NOW()) LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS no_advance_with_suggested_program',
          'SUM(CASE WHEN (SELECT JSON_EXTRACT(comment, "$.new_goals") FROM my_goals_1 WHERE user_id = ud.user_id AND sub_order_id = sop.sub_order_id LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END) AS new_goal_received',
        ],
        table: "users_details ud",
        join: [
          {
            type: "INNER",
            table: "sub_orders_programs sop",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: "admin_users au",
            on: "ud.mentor_assigned = au.admin_user_id",
          },
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.program_status",
            operator: "IN",
            value: [1, 2, 4],
          },
        ],
        groupBy: ["au.crm_user"],
        orderBy: ["total_clients DESC"],
      },
    ];

    const results = await readRecordUnion(tableList);

    // Send the results as a response
    res.status(200).json(results);
  } catch (error) {
    console.error("Error fetching mentor statistics with union:", error);
    next(error); // Forward the error to the next middleware
  }
};

const getMentorSuggestedStats = async (req, res) => {
  try {
    const tableList = [
      {
        table: "users_details ud",
        selectField: `
          (CASE 
            WHEN ud.user_status = 'Lead' 
            THEN (SELECT crm_user FROM admin_users WHERE admin_users.admin_user_id = ud.counsellor_assigned) 
            ELSE (SELECT crm_user FROM admin_users WHERE admin_users.admin_user_id = ud.mentor_assigned) 
          END) AS mentor,
          ud.user_status,
          COUNT(DISTINCT ud.user_id) AS total_suggested_users,
          SUM(sp.suggested_amount) AS total_suggested_amount
        `,
        join: [
          {
            type: "LEFT",
            table: "suggested_program sp",
            on: "sp.user_id = ud.user_id",
          },
        ],
        condition: [
          {
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: new Date().getMonth() + 1, // JS months are 0-indexed
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: new Date().getFullYear(),
          },
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "NOT IN",
            subquery: {
              query: `
                SELECT user_id FROM order_details 
                WHERE MONTH(order_date) = ${new Date().getMonth() + 1} 
                  AND YEAR(order_date) = ${new Date().getFullYear()}
              `,
              operator: "",
            },
          },
        ],
        groupBy: ["mentor", "ud.user_status"],
        orderBy: ["mentor", "ud.user_status"],
      },
    ];

    const result = await readRecordUnion(tableList);
    res.status(200).json({
      status: "success",
      message: "Mentor Suggested Stats Report fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error in getMentorSuggestedStats:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch mentor suggested stats report",
      error: error.message,
    });
  }
};

const chatFromLeadsReport = async (req, res, next) => {
  try {
    const { start_date, end_date, ids = [] } = req.query;

    // Default date range: current month start → now
    const startDate = start_date
      ? new Date(start_date)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const endDate = end_date ? new Date(end_date) : new Date();

    const { results } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "IN", value: [2] },
      ],
    });

    let mentorIds = Array.isArray(ids) ? [...ids] : [];

    if (mentorIds.length === 0) {
      mentorIds = results.map((i) => i.admin_user_id);
    }

    if (!mentorIds.length) {
      return res.status(200).json(
        new ApiResponse({
          message: "Chat From Leads Report fetched successfully",
          data: { data: [] },
        }),
      );
    }

    const chatCount = await clientEnquiry.aggregate([
      {
        $match: {
          mentor_id: { $in: mentorIds },
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
          type: { $ne: "clara" },
          sender: "client",
        },
      },
      {
        $group: {
          _id: {
            mentor_id: "$mentor_id",
            user_id: "$user_id",
          },
          entryCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.mentor_id",
          users: {
            $push: {
              user_id: "$_id.user_id",
              count: "$entryCount",
            },
          },
        },
      },
      {
        $project: {
          mentor_id: "$_id",
          count_one: {
            $map: {
              input: {
                $filter: {
                  input: "$users",
                  as: "u",
                  cond: { $eq: ["$$u.count", 1] },
                },
              },
              as: "u",
              in: "$$u.user_id",
            },
          },
          count_more_than_one: {
            $map: {
              input: {
                $filter: {
                  input: "$users",
                  as: "u",
                  cond: { $gt: ["$$u.count", 1] },
                },
              },
              as: "u",
              in: "$$u.user_id",
            },
          },
          _id: 0,
        },
      },
    ]);
    console.log(chatCount, 4207);
    await Promise.all(
      chatCount.map(async (item) => {
        if (item.count_more_than_one.length > 0) {
          const { results: countMoreThanOneIds } = await readRecord({
            table: `${tables.userDetails} cd`,
            selectFields: ["cd.user_id"],
            conditions: [
              {
                field: "cd.user_id",
                operator: "IN",
                value: item.count_more_than_one,
              },
              { field: "cd.user_type", operator: "=", value: "0" },
            ],
          });
          item.count_more_than_one = countMoreThanOneIds.map((i) => i.user_id);
        }

        if (item.count_one.length > 0) {
          const { results: countOneIds } = await readRecord({
            table: `${tables.userDetails} cd`,
            selectFields: ["cd.user_id"],
            conditions: [
              { field: "cd.user_id", operator: "IN", value: item.count_one },
              { field: "cd.user_type", operator: "=", value: "0" },
            ],
          });
          item.count_one = countOneIds.map((i) => i.user_id);
        }
      }),
    );

    const data = [];
    for (const mentor of results) {
      const chatData = chatCount.find(
        (c) => c.mentor_id === mentor.admin_user_id,
      );

      data.push({
        mentor: mentor.crm_user,
        one_chat_count: chatData ? chatData.count_one.length : 0,
        more_than_one_chat_count: chatData
          ? chatData.count_more_than_one.length
          : 0,
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Chat From Leads Report");

    // Column widths
    worksheet.columns = [
      { key: "sr_no", width: 5 },
      { key: "mentor", width: 30 },
      { key: "single", width: 18 },
      { key: "multiple", width: 20 },
      { key: "total", width: 15 },
    ];

    // Title
    worksheet.mergeCells("B2:E2");
    const titleCell = worksheet.getCell("B2");
    titleCell.value = "Chat From Leads Report";
    titleCell.alignment = { horizontal: "center" };
    titleCell.font = { size: 16, bold: true };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE99998" },
    };
    // Header row
    const headerRow = worksheet.addRow([
      "",
      "Counsellor",
      "Single Chat",
      "Multiple Chat",
      "Total",
    ]);

    headerRow.font = { size: 16, bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;

    headerRow.eachCell((cell, index) => {
      if (index !== 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8CB9A" },
        };
      }
    });

    // Data rows
    data.forEach((item) => {
      worksheet.addRow([
        "",
        item.mentor,
        item.one_chat_count,
        item.more_than_one_chat_count,
        item.one_chat_count + item.more_than_one_chat_count,
      ]);
    });

    // Grand total
    const totalRow = worksheet.addRow([
      "",
      "Grand Total",
      data.reduce((s, i) => s + i.one_chat_count, 0),
      data.reduce((s, i) => s + i.more_than_one_chat_count, 0),
      data.reduce(
        (s, i) => s + i.one_chat_count + i.more_than_one_chat_count,
        0,
      ),
    ]);

    totalRow.font = { bold: true };
    totalRow.eachCell((cell, index) => {
      if (index !== 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8CB9A" },
        };
      }
    });

    // Apply table borders (header → grand total)
    const startRow = headerRow.number;
    const endRow = worksheet.lastRow.number;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = 1; col <= 4; col++) {
        worksheet.getCell(row, col + 1).border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }
    }

    // Center numeric columns
    worksheet.getColumn(2).alignment = { horizontal: "left" };
    worksheet.getColumn(3).alignment = { horizontal: "center" };
    worksheet.getColumn(4).alignment = { horizontal: "center" };
    worksheet.getColumn(5).alignment = { horizontal: "center" };
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = {
          ...cell.font,
          size: 16,
        };
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=chat_from_leads_report_${Date.now()}.xlsx`,
    );

    const buffer = await workbook.xlsx.writeBuffer();
    return res.send(buffer);
  } catch (error) {
    console.error("Error in chatFromLeadsReport:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  chatFromLeadsReport,
  HsReport,
  forcepointSummaryReport,
  forcepointLeadWiseReport,
  getAppStatusummary,
  getAppStatusForMail,
  getMentorStatisticsUnion,
  getMentorSuggestedStats,
  shareReportSheet,
  khyatiSmLeadDayEnd,
  rateSharedAbdulReport,
  comCallNotDoneData,
  InductionCallDataReport,
  InductionCallSummaryReport,
  allNutritionistAssignedUnpaidLeads,
  comCallNotDoneSummary,
  getAllActiveClientsByProgramCategoryReport,
  getAppCheckoutPageVisitReport,
  getAppNotUpdatedClientsByUserStatusReport,
  getAppProgramPageVisitReport,
  getBasicStackNotUpgradedToFullStackReport,
  getBasicStackNotUpgradedToFullStackSummaryReport,
  getCleansePaidReportByMentorId,
  getExpiredLink,
  getExpiringClientsWith70Kg,
  getHfFeedDatabackReport,
  getHfFeedbackReport,
  getMentorUserCountByProgramStatusReport,
  getMentorUserStatusCountReport,
  getNoAdvancePurchaseReport,
  getProgramFeedbackReport,
  getProgramFeedbackSummaryReport,
  getProjectedExpiryReport,
  getUnconvertedReferral,
  getUnpaidPaymentDetailsShared,
  getWalletReportByAdminId,
  getWalletSummaryReport,
  goodWeightLoss,
  mentorWiseAllActiveNoAdvUnPitched,
  mentorWiseAllData,
  mentorWiseRateSharedUnpaidReport,
  morningLeadConsultationReport,
  tailendNoAdvUnPitched,
  tailendNoAdvUnPitchedSumamry,
  totalPitchedNotPaid,
  walletUsedSummaryReportByMentorId,
};
