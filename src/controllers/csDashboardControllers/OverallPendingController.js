import moment from "moment";
import {
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { app_versions, redisKeys, tables } from "../../helper/constant.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { getWhatsappTextUtil } from "../../utils/getWhatsappTextUtil.js";
import razorPay from "../../config/razorpayConfig.js";

const AppNotUpdatedClientsCount = async (_, res, next,internal = false) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'android_not_updated' as type",
        ],
        condition: [
          {
            field: `COALESCE((
              SELECT LOWER(device)
              FROM bn_user_fcm_token
              WHERE user_id = ud.user_id
              ORDER BY id DESC
              LIMIT 1
            ), 'android')`,
            operator: "=",
            value: "android",
          },
          {
            field: "ud.app_version",
            operator: " NOT IN ",
            value: `('${app_versions.ios}','${app_versions.android}')`,
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
      },
      
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'ios_not_updated' as type",
        ],
        condition: [
          {
            field: `LOWER((
              SELECT device
              FROM bn_user_fcm_token
              WHERE user_id = ud.user_id
              ORDER BY id DESC
              LIMIT 1
            ))`,
            operator: "LIKE",
            value: "ios%",
          },
          {
            field: "ud.app_version",
            operator: " NOT IN ",
            value: `('${app_versions.ios}','${app_versions.android}')`,
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'ios_total' as type",
        ],
        condition: [
          {
            field: `LOWER((
              SELECT device
              FROM bn_user_fcm_token
              WHERE user_id = ud.user_id
              ORDER BY id DESC
              LIMIT 1
            ))`,
            operator: "LIKE",
            value: "ios%",
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'android_total' as type",
        ],
        condition: [
          {
            field: `COALESCE((
              SELECT LOWER(device)
              FROM bn_user_fcm_token
              WHERE user_id = ud.user_id
              ORDER BY id DESC
              LIMIT 1
            ), 'android')`,
            operator: "=",
            value: "android",
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
      },
    ]);
    if (internal) return {
        android_not_updated: results[0]?.count || 0,
        ios_not_updated: results[1]?.count || 0,
        android_total: results[3]?.count || 0,
        ios_total: results[2]?.count || 0
      }; 

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "App Not Updated Clients Count Fetched Successfully",
      data: {
        android_not_updated: results[0]?.count || 0,
        ios_not_updated: results[1]?.count || 0,
        android_total: results[3]?.count || 0,
        ios_total: results[2]?.count || 0
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appnotUpdatedClientUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const device_type = String(req.body.device_type).toLowerCase();

    const deviceCondition =
      device_type === "ios"
        ? {
            field: `LOWER((
              SELECT device
              FROM bn_user_fcm_token
              WHERE user_id = ud.user_id
              ORDER BY id DESC
              LIMIT 1
            ))`,
            operator: "LIKE",
            value: "ios%",
          }
        : {
            field: `COALESCE((
              SELECT LOWER(device)
              FROM bn_user_fcm_token
              WHERE user_id = ud.user_id
              ORDER BY id DESC
              LIMIT 1
            ), 'android')`,
            operator: "=",
            value: "android",
          };

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: [
        "ud.device as client_device",
        "ud.app_version as client_app_version",
      ],
      extraConditions: [
        deviceCondition,
        {
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${app_versions.ios}','${app_versions.android}')`,
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
      ],
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label:
              device_type === "android"
                ? "App Not updated (Android )"
                : "App Not updated ( IOS )",
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
            ],
            to: "client",
          });

        return {
          app_details: {
            client_device: i.client_device,
            client_app_version: i.client_app_version,
          },
          action_details: {
            client_whatsapp_text,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Not updated User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDormancyClientCount = async (_, res, next,internal = false) => {
  try {
    const common_conditions = [
      {
        orConditions: [
          {
            field: "dsl.end_session_weight",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          { field: "dsl.end_session_weight", operator: "=", value: 0 },
        ],
      },
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Active",
      },
      {
        field: "sop.program_status",
        operator: "=",
        value: "1",
      },
    ];
    const common_conditions_dormant = [
      {
        orConditions: [
          {
            field: "dsl.end_session_weight",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          { field: "dsl.end_session_weight", operator: "=", value: 0 },
        ],
      },
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Dormant",
      },
      {
        field: "sop.program_status",
        operator: "=",
        value: "1",
      },
    ];
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'10th Day Overdue' AS overdue_level",
        ],
        condition: [
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: ">=",
            value: 11,
          },
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: "<=",
            value: 12,
          },
          ...common_conditions,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Level 1 Overdue' AS overdue_level",
        ],
        condition: [
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: ">=",
            value: 13,
          },
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: "<=",
            value: 14,
          },
          ...common_conditions,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Level 2 Overdue' AS overdue_level",
        ],
        condition: [
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: ">=",
            value: 15,
          },
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: "<=",
            value: 16,
          },
          ...common_conditions,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Level 3 Overdue' AS overdue_level",
        ],
        condition: [
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: ">=",
            value: 17,
          },
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: "<=",  
            value: 18,
          },
          ...common_conditions,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Dormant' AS overdue_level",
        ],
        condition: [
          {
            field: "DATEDIFF(NOW(), dsl.diet_start_date)",
            operator: ">=",
            value: 19,
          },
          ...common_conditions_dormant,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
      },
    ]);

    const responseData = results.reduce((acc, result) => {
      acc[result.overdue_level] = result.count;
      return acc;
    }, {});

    if (internal) return responseData; 

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Dormancy Level Wise Client Fetched successfully",
      data: responseData,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDormancyClientUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const level = String(req.body.data).toLowerCase();
    const conditions = [];
    let label;

    if (level === "10th_day_overdue" || level === "0") {
      conditions.push(
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: ">=",
          value: 11,
        },
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: "<=",
          value: 12,
        },{ field: "ud.sub_user_status", operator: "=", value: "Active" },
      );
      label = `Dormancy ( 10 Day OD  (11th - 12th) )`;
    } else if (level === "level_1_overdue") {
      conditions.push(
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: ">=",
          value: 13,
        },
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: "<=",
          value: 14,
        },{ field: "ud.sub_user_status", operator: "=", value: "Active" },
      );
      label = `Dormancy  ( Level 1         (13th - 14th))`;
    } else if (level === "level_2_overdue") {
      conditions.push(
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: ">=",
          value: 15,
        },
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: "<=",
          value: 16,
        },{ field: "ud.sub_user_status", operator: "=", value: "Active" },
      );
      label = `Dormancy  (Level 2        (15th - 16th))`;
    } else if (level === "level_3_overdue") {
      conditions.push(
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: ">=",
          value: 17,
        },
        {
          field: "DATEDIFF(NOW(), dsl.diet_start_date)",
          operator: "<=",
          value: 18,
        },
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
      );
      label = `Dormancy   ( Level 3        (17th - 18th) )`;
    } else if (level === "dormant") {
      conditions.push({
        field: "DATEDIFF(NOW(), dsl.diet_start_date)",
        operator: ">=",
        value: 19,
      },{ field: "ud.sub_user_status", operator: "=", value: "Dormant" },);
      label = `Dormancy  ( 19th Days +  )`;
    }
    conditions.push(
      {
        orConditions: [
          {
            field: "dsl.end_session_weight",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          { field: "dsl.end_session_weight", operator: "=", value: 0 },
        ],
      },
      
      { field: "sop.program_status", operator: "=", value: "1" }
    );
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
        },
      ],
      extraSelectFields: [
        "CONCAT(ad.first_name, ' ', ad.last_name) as mentor_assigned",
        "ad.official_phone as mentor_phone",
        "ud.active_order_id as client_active_order_id",
        "sop.expiry_date as current_program_expiry_date",
        "sop.pending_session as current_pending_session",
      ],
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const program_validity = moment(
          i.current_program_expiry_date
        ).fromNow();
        const itemVariables = [
          { key: "name", value: i.client_name },
          { key: "current_program", value: i.program_name },
          { key: "program_validity", value: program_validity },
          { key: "pending_session", value: i.current_pending_sessions },
        ];

        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label,
            variables: itemVariables,
            to: "client",
          });

        return {
          mentor_assigned_details: {
            mentor_assigned_phone: i.mentor_phone,
            mentor_assigned: i.mentor_assigned,
          },
          remaining_session_details: {
            program_validity,
            current_program_pending_session: i.current_pending_session,
          },
          action_details: { client_whatsapp_text },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Not updated User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientNotStartedCount = async (_, res, next,internal = false) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Not Started Due Today' AS category",
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
          {
            field: "date(sop.start_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Not Started Due Tomorrow' AS category",
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
          {
            field: "date(sop.start_date)",
            operator: "=",
            value: "CURDATE() + INTERVAL 1 DAY",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Not Started Overdue' AS category",
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
          {
            field: "date(sop.start_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'Start Later' AS category",
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
          {
            field: "sop.start_date",
            operator: ">=",
            value: "CURDATE() + INTERVAL 5 DAY",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = cd.active_order_id",
          },
        ],
      },
    ]);

    const categorizedCounts = results.reduce((acc, result) => {
      acc[result.category] = result.count;
      return acc;
    }, {});

    if (internal) return categorizedCounts; 

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Not Started Clients Count fetched successfully",
      data: categorizedCounts,
    });

    await redis.setex(
      `${redisKeys.notStartedClients}`,
      25,
      JSON.stringify(categorizedCounts)
    );

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientNotStartedUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const filter = String(req.body.data).toLowerCase();
    const conditions = [];
    let label = `Not Started (Due)`;
    if (filter === "due_today") {
      conditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "notstarted",
        },
        {
          field: "sop.start_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        }
      );
    }
    if (filter === "due_tomorrow") {
      conditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "notstarted",
        },
        {
          field: "sop.start_date",
          operator: "=",
          value: "CURDATE() + INTERVAL 1 DAY",
          raw: true,
        }
      );
    }

    if (filter === "not_started_od") {
      conditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "notstarted",
        },
        {
          field: "sop.start_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        }
      );
    }
    if (filter === "start_later") {
      conditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "notstarted",
        },
        {
          field: "sop.start_date",
          operator: ">=",
          value: "CURDATE() + INTERVAL 5 DAY",
          raw: true,
        }
      );
      label = `Not Started (Start Later)`;
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
        },
      ],
      extraSelectFields: ["sop.start_date", "sop.start_date_added_by"],
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const current_program_start_date = `${moment(
          i.current_program_start_date
        ).format("DD-MM-YYYY")}`;

        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label,
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "start_date",
                value: current_program_start_date,
              },
              {
                key: "current_program",
                value: i.program_name,
              },
            ],
            to: "client",
          });

        return {
          mentor_assigned_details: {
            mentor_assigned_phone: i.mentor_assigned_phone,
            mentor_assigned: i.mentor_assigned,
          },
          program_start_date_details: {
            current_program_start_date,
            start_date_set_by:
              Number(i.start_date_added_by) === 0
                ? "Default"
                : Number(i.start_date_added_by) === 1
                ? "Mentor"
                : "Client",
          },
          action_details: {
            client_whatsapp_text,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Not Started Client User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error.stack || error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateOnholdEndDate = async (req, res, next) => {
  try {
    const { extended_date, break_id } = req.body;

    const updateResult = await updateRecord(
      `${tables.onholdClients}`,
      {
        end_date: extended_date,
      },
      {
        id: break_id,
      }
    );
    if (updateResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Error while updating Onhold End Date", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Onhold End Date Extended Successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientOnBreakCount = async (_, res, next, internal = false) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(), DATE(ohc.end_date)) = 0 
              THEN ud.user_id END) AS due_today`,
        `COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(), DATE(ohc.end_date)) >= 1 
              THEN ud.user_id END) AS overdue`
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins: [
        // {
        //   type: "INNER",
        //   table: `${tables.onholdClients} ohc`,
        //   on: "ud.user_id = ohc.user_id",
        // },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "INNER",
          table: `${tables.onholdClients} ohc`,
          on: `ud.user_id = ohc.user_id  and ohc.id=(select id from ${tables.onholdClients} where user_id=ud.user_id order by id desc limit 1)`,
        },

      ],
    });

    if (internal) return results;
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Distinct Clients On Break Count fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const getClientOnholdUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const filter = String(req.body.data).toLowerCase();

    //  conditions = [];
    const conditions = [
      { field: "ud.user_status", operator: "=", value: "Active" },
      { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    if (filter === "today") {
      conditions.push({
        field: "DATEDIFF(CURDATE(), date(ohc.end_date))",
        operator: "=",
        value: "0",
        raw: true,
      });
    }
    if (filter === "od") {
      conditions.push({
        field: "DATEDIFF(CURDATE(), date(ohc.end_date))",
        operator: ">=",
        value: "1",
        raw: true,
      });
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.onholdClients} ohc`,
          on: `ud.user_id = ohc.user_id  and ohc.id=(select id from ${tables.onholdClients} where user_id=ud.user_id order by id desc limit 1)`,
        },
      ],
      extraSelectFields: [
        "sop.start_date as current_program_start_date",
        "sop.expiry_date as current_program_expiry_date",
        "ohc.end_date as break_end_date",
        "ohc.start_date as break_start_date",
        "ohc.onhold_note as break_note",
        "ohc.id as break_id",
        "IF(ohc.end_date IS NOT NULL AND sop.start_date IS NOT NULL, DATEDIFF(ohc.end_date, sop.start_date), 0) AS lost_days",
      ],
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const current_program_start_date = `${moment(
          i.current_program_start_date
        ).format("DD-MM-YYYY")} ${moment(
          i.current_program_start_date
        ).fromNow()}`;

        const current_program_expiry_date = `${moment(
          i.current_program_expiry_date
        ).format("DD-MM-YYYY")} ${moment(
          i.current_program_expiry_date
        ).fromNow()}`;
        const break_start_date = `${moment(i.break_start_date).format(
          "DD-MM-YYYY"
        )} `;
        const break_end_date = `${moment(i.break_end_date).format(
          "DD-MM-YYYY"
        )} `;

        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label:
              filter === "today"
                ? `Break ( onhold (Due) )`
                : `Break ( onhold (OD) )`,
            // ["name","current_program","break_days_lost","current_program_expiry"]
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "current_program",
                value: i.program_name,
              },
              {
                key: "break_days_lost",
                value: i.lost_days,
              },
              {
                key: "current_program_expiry",
                value: current_program_expiry_date,
              },
            ],
            to: "client",
          });

        return {
          mentor_assigned_details: {
            mentor_assigned_phone: i.mentor_assigned_phone,
            mentor_assigned: i.mentor_assigned,
          },
          extra_program_details: {
            current_program_start_date,
            current_program_expiry_date,
            break_start_date,
            break_end_date,
            break_note: i.break_note,
            break_id: i.break_id,
          },
          action_details: {
            client_whatsapp_text,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Not Started Client User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error.stack || error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsWeightReceivedDietNotSentCount = async (_, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(distinct ud.user_id) AS wmr_received_but_diet_not_sent"],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id", 
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: `wr.sub_order_id = sop.sub_order_id AND sop.sent_sessions = wr.session AND wr.days = 10`,
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: `dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions + 1 = dsl.session`,
        },
      ],
      conditions: [
        {
          orConditions: [
            {
              field: "wr.weight",
              operator: "IS NOT",
              value: "NULL",
              raw: true,
            },
            {
              field: "wr.weight",
              operator: "<>",
              value: "0",
            },
          ],
        },
        {
          orConditions: [
            {
              field: "dsl.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "dsl.diet_status",
              operator: "<>",
              value: "4",
            },
          ],
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
      ],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message:
        "Clients Weight Received Diet Not Sent User IDs fetched successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsWeightReceivedDietNotSentUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: [
        "wr.posted_date as weight_posted_date",
        "sop.pending_session as current_pending_session",
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: `wr.sub_order_id = sop.sub_order_id AND sop.sent_sessions = wr.session AND wr.days = 10`,
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: `dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions + 1 = dsl.session`,
        },
      ],
      extraConditions: [
        {
          orConditions: [
            {
              field: "wr.weight",
              operator: "IS NOT",
              value: "NULL",
              raw: true,
            },
            {
              field: "wr.weight",
              operator: "<>",
              value: "0",
            },
          ],
        },
        {
          orConditions: [
            {
              field: "dsl.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "dsl.diet_status",
              operator: "<>",
              value: "4",
            },
          ],
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
      ],
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const { formattedText: mentor_whatsapp_text } =
          await getWhatsappTextUtil({
            label: `WMR Received ( WMR OD)`,
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "wmr_received_date",
                value: moment(
                  i.weight_posted_date < i.inch_posted_date
                    ? i.weight_posted_date
                    : i.inch_posted_date < i.photo_posted_date
                    ? i.inch_posted_date
                    : i.photo_posted_date
                ).format("DD-MM-YYYY"),
              },
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "email_id",
                value: i.email_id,
              },
              {
                key: "current_program",
                value: i.program_name,
              },
              {
                key: "pending_session",
                value: i.current_pending_session,
              },
            ],
            to: "admin",
          });
        return {
          action_details: { mentor_whatsapp_text },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "WMR Received Diet Not Sent User Data fetched Successfully",
      data: data,
      meta_data: {
        page, 
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientsServiceCallNotDone = async (_, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `
        COUNT(DISTINCT CASE 
          WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 12 
          THEN ud.user_id 
        END) AS service_call_due_today
        `,
        `
        COUNT(DISTINCT CASE 
          WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) > 12 
          THEN ud.user_id 
        END) AS service_call_overdue
        `,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.`session` = sop.sent_sessions",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `sop.sub_order_id = cu.sub_order_id 
               AND cu.user_id = ud.user_id 
               AND cu.call_type = '4'`,
        },
      ],
      conditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: ">=",
          value: 12,
        },
        {
          orConditions: [
            {
              field: "cu.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "cu.call_status",
              operator: "=",
              value: "0",
              raw: true,
            },
          ],
        },
      ],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Clients Service Call Due Today & Overdue fetched successfully",
      data: results[0],
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const getClientsServiceCallNotDoneUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,

      // ✅ Added safely (no structure change)
      extraSelectFields: [
        "DATEDIFF(CURDATE(), dsl.diet_start_date) AS service_call_days_diff",
      ],

      extraJoins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.`session` = sop.sent_sessions",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `sop.sub_order_id = cu.sub_order_id 
               AND cu.user_id = ud.user_id 
               AND cu.call_type = '4'`,
        },
      ],

      extraConditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: ">=",
          value: 12,
        },
        {
          orConditions: [
            {
              field: "cu.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "cu.call_status",
              operator: "=",
              value: "0",
              raw: true,
            },
          ],
        },
      ],

      extraGroupBy: ["ud.user_id"],
      extraOrderBy: ["dsl.diet_start_date DESC"],

      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: `Service call`,
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
            ],
            to: "client",
          });

        // ✅ Safe DB-calculated value
        const daysDiff = Number(i.service_call_days_diff);

        let timelineLabel = null;
        if (daysDiff === 12) {
          timelineLabel = "Today";
        } else if (daysDiff === 11) {
          timelineLabel = "Tomorrow";
        } else if (daysDiff > 12) {
          timelineLabel = `${daysDiff - 12} days ago`;
        }

        return {
          action_details: {
            client_whatsapp_text,
          },
          service_call_timeline: {
            label: timelineLabel,
            days_diff: daysDiff,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Service Call Not Done User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};



const getClientsAdvancedPurchase = async (_, res, next,internal = false) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(DISTINCT CASE WHEN sop_active.user_id IS NOT NULL THEN ud.user_id END) AS 'advance_program_od_with_active_program'",
        "COUNT(DISTINCT CASE WHEN sop_active.user_id IS NULL THEN ud.user_id END) AS 'advance_program_od_without_active_program'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_advance`,
          on: "sop_advance.user_id = ud.user_id AND sop_advance.program_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_active`,
          on: "sop_active.user_id = ud.user_id AND sop_active.program_status = 1 and sop_active.sub_order_id = ud.active_order_id",
        },
      ],
      conditions: [
        {
          field: "date(sop_advance.start_date)",
          operator: "<=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "sop_advance.sub_order_id IS NOT NULL and sop_advance.start_date_added_by=0 and sop_advance.program_id NOT IN (21,112,113,114,115,116,117,118,119,120,121,131,158,160,179)",
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    if (internal) return results; 
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Advance Purchase Clients fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsAdvancedPurchaseUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const type = String(req.body.data).toLowerCase();
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: [
        "DATEDIFF(sop_advance.start_date,NOW()) as start_date_overdue",
        "adv_pm.program_name",
        "adv_ps.program_sessions",
        "sop_advance.start_date",
        "sop_advance.sub_order_id as advance_sub_order_id",
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_advance`,
          on: "sop_advance.user_id = ud.user_id AND sop_advance.program_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} adv_pm`,
          on: "sop_advance.program_id = adv_pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} adv_ps`,
          on: "sop_advance.program_session_id = adv_ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_active`,
          on: "sop_active.user_id = ud.user_id AND sop_active.program_status = 1 and sop_active.sub_order_id = ud.active_order_id",
        },
      ],
      extraConditions: [
         {
          field: "date(sop_advance.start_date)",
          operator: "<=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "sop_advance.sub_order_id IS NOT NULL and sop_advance.start_date_added_by=0 and sop_advance.program_id NOT IN (21,112,113,114,115,116,117,118,119,120,121,131,158,160,179)",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "sop_active.user_id",
          operator: type === "active" ? "IS NOT" : "IS",
          value: "NULL",
          raw: true,
        },
      ],
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const { formattedText: mentor_whatsapp_text } =
          await getWhatsappTextUtil({
            label: `Adv. Purchase (Adv.Pur.OD
(No Active) )`,
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "email_id",
                value: i.email_id,
              },
              {
                key: "start_date_overdue",
                value: i.start_date_overdue,
              },
            ],
            to: "admin",
          });
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: `Adv. Purchase (Adv.Pur.OD
(No Active) )`,
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "email_id",
                value: i.email_id,
              },
              {
                key: "start_date_overdue",
                value: i.start_date_overdue,
              },
            ],
            to: "client",
          });
        return {
          advance_purchase_details: {
            advance_sub_order_id: i.advance_sub_order_id,
            program_name: i.program_name,
            program_sessions: i.program_sessions,
            start_date: i.start_date
              ? moment(i.start_date).format("DD-MM-YYYY")
              : "Not Yet Filled",
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },

          action_details: {
            client_whatsapp_text,
            mentor_whatsapp_text,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Clients With Advance Purchase OD User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsBalanceDue = async (req, res, next,internal = false) => {
  try {
    const { admin_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        `COUNT(DISTINCT CASE WHEN date(sop.due_date) = date(CURDATE()) THEN sop.user_id END) AS today_due`,

        String(req.headers.source) !== "cs"
          ? `COUNT(DISTINCT CASE WHEN date(sop.due_date) = '${moment()
              .add(1, "day")
              .format("YYYY-MM-DD")}' THEN sop.user_id END) AS tomorrow`
          : null,

        `COUNT(DISTINCT CASE WHEN date(sop.due_date) < date(CURDATE()) THEN sop.user_id END) AS overdue`,
      ].filter(Boolean),
      conditions: [
        { field: "sop.balance_amount", operator: "!=", value: 0 },
        { field: "sop.program_status", operator: "=", value: 1 },
        { field: "ud.user_status", operator: "=", value: "Active" },
        admin_id
          ? { field: "ud.mentor_assigned", operator: "=", value: admin_id }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = sop.user_id",
        },
      ],
    });
    if (internal) return results; 
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Balance Due Clients fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsBalanceDueUserData = async (req, res, next) => {
  try {
    const { search, page, limit, admin_id } = req.body;

    const type = String(req.body.data).toLowerCase();
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: ["sop.balance_amount as balance_amount"],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop_advance`,
          on: "sop_advance.user_id = ud.user_id ",
        },
      ],
      extraConditions: [
        { field: "sop.balance_amount", operator: "!=", value: 0 },
        { field: "sop.program_status", operator: "=", value: 1 },
        { field: "ud.user_status", operator: "=", value: "Active" },
      
        type === "tomorrow"
          ? {
              field: "date(sop.due_date)",
              operator: "=",
              value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
            }
          : null,
        type === "today"
          ? {
              field: "date(sop.due_date)",
              operator: "=",
              value: "date(CURDATE())",
              raw:true,
            }
          : null,
        type === "od"
          ? {
              field: "date(sop.due_date)",
              operator: "<",
              value: "date(CURDATE())",
              raw:true,
            }
          : null,
        admin_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: admin_id,
            }
          : null,
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: type === "today" ? `Balance (Due)` : "Balance (Over Due)",
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "current_program",
                value: i.program_name,
              },

              {
                key: "balance_amount",
                value: i.balance_amount,
              },
            ],
            to: "client",
          });
        return {
          action_details: { client_whatsapp_text },
          balance_details: {
            current_program_balance_amount: i.balance_amount,
            service_id: 1,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Clients With Advance Purchase OD User Data fetched Successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const UpdateBalanceDueDate = async (req, res, next) => {
  try {
    const { sub_order_id, date ,is_due_date=0 } = req.body;
    const newDate = new Date(date);
    if (isNaN(newDate.getTime())) {
      return next(
        new ErrorHandler("Invalid Date Format. Use YYYY-MM-DD.", 400)
      );
    }

    if(is_due_date){
      const updatedData = { due_date: newDate };
    const condition = { sub_order_id };
    const updatedResult = await updateRecord(
      `${tables.subOrderPrograms}`,
      updatedData,
      condition
    );
    if (updatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to update due date in database.", 500)
      );

    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Due date and payment link expiry updated successfully.",
    });
     return res.status(200).json(apiResponse);
    }

    const { results } = await readRecord({
      table: `${tables.paymentLinks} pl`,
      selectFields: ["pl.expiry_at", "pl.payment_link_id"],
      conditions: [
        { field: "pl.sub_order_id", operator: "=", value: sub_order_id },
      ],
    });

    if (!results || results.length === 0) {
      return next(new ErrorHandler("Payment link not found.", 404));
    }

    const currentExpiry = new Date(results[0].expiry_at);
    const paymentLinkId = results[0].payment_link_id;

    if (currentExpiry < new Date()) {
      return next(
        new ErrorHandler(
          "Payment link has already expired. Create a new one.",
          400
        )
      );
    }
    if (newDate <= currentExpiry) {
      return next(
        new ErrorHandler(
          "New due date must be later than the current payment link expiry.",
          400
        )
      );
    }

    const updatedPaymentLink = await razorPay.paymentLink.edit(paymentLinkId, {
      expire_by: Math.floor(newDate.getTime() / 1000), // Convert to epoch seconds
    });
    
    const updatedPaymentLinkDb = await updateRecord(
      `${tables.paymentLinks}`,
      { expiry_at: moment(newDate).format("YYYY-MM-DD HH:mm:ss") },
      condition
    );

    if (updatedPaymentLinkDb.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to update due date in database.", 500)
      );
    }

     const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Due date and payment link expiry updated successfully.",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error updating balance due date:", error);

    if (error.error && error.error.description) {
      return next(
        new ErrorHandler(`Razorpay Error: ${error.error.description}`, 400)
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  AppNotUpdatedClientsCount,
  UpdateBalanceDueDate,
  appnotUpdatedClientUserData,
  getClientNotStartedCount,
  getClientNotStartedUserData,
  getClientOnBreakCount,
  getClientOnholdUserData,
  getClientsAdvancedPurchase,
  getClientsAdvancedPurchaseUserData,
  getClientsBalanceDue,
  getClientsBalanceDueUserData,
  getClientsServiceCallNotDone,
  getClientsServiceCallNotDoneUserData,
  getClientsWeightReceivedDietNotSentCount,
  getClientsWeightReceivedDietNotSentUserData,
  getDormancyClientCount,
  getDormancyClientUserData,
  updateOnholdEndDate,
};
