import moment from "moment";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import axios from "axios";
import { callTypes, redisKeys, tables } from "../../helper/constant.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { getWhatsappTextUtil, getWhatsappTextUtilOnce } from "../../utils/getWhatsappTextUtil.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import { addDraftedQuery } from "../chatController/chatController.js";
import { readPool } from "../../config/dbConnection.js";
import { raw } from "express";

const getClientSubStatusCount = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    const { source } = req.headers;

    const conditions = [{ field: "sop.program_status", operator: "=", value: '1' }];
    if (admin_id) {
      conditions.push({
            field: "ud.mentor_assigned",
            operator: "=",
            value: admin_id,
          },);
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        String(source).toLowerCase() !== "mentor_db"
          ? "COUNT(CASE WHEN ud.user_status = 'Active' THEN ud.user_id END) as all_active"
          : "NULL",
        "COUNT(CASE WHEN ud.sub_user_status = 'Active' THEN ud.user_id END) as active",
        "COUNT(CASE WHEN ud.sub_user_status = 'notstarted' THEN ud.user_id END) as not_started",
        "COUNT(CASE WHEN ud.sub_user_status = 'Cleanse active' THEN ud.user_id END) as cleanse_active",
        "COUNT(CASE WHEN ud.sub_user_status = 'Onhold' THEN ud.user_id END) as onhold",
        "COUNT(CASE WHEN ud.sub_user_status = 'Dormant' THEN ud.user_id END) as dormant",
        "COUNT(CASE WHEN ud.sub_user_status = 'Freezed' THEN ud.user_id END) as freezed",
      ].filter(Boolean),
       joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
      conditions:conditions,
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Count based on user Status fetched Successfully",
      data: results[0],
    });
    await redis.setex(
      `${redisKeys.subStatusUserCount}`,
      30,
      JSON.stringify(results[0])
    );
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientSubStatusUserData = async (req, res, next) => {
  try {
    const { search, page, limit, admin_id } = req.body;
    let { user_status } = req.body;
    if (
      user_status == "Not%20Started" ||
      user_status == "Not Started" ||
      user_status == "Not+Started"
    ) {
      user_status = "notstarted";
    }
    const selectFields = [];
    if (user_status === "Onhold") {
      selectFields.push("sop.break_start_date", "sop.break_end_date");
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        {
          field:
            user_status === "all_active"
              ? "ud.user_status"
              : "ud.sub_user_status",
          operator: "=",
          value: user_status === "all_active" ? "Active" : user_status,
        },
        admin_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: admin_id,
            }
          : null,
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
      extraSelectFields: selectFields,
      extraObjects: (i) => {
        return {
          action_details: {
            client_whatsapp_text: `Hi ${i.client_name},`,
          },
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          ...(user_status === "Onhold" && {
            onhold_details: {
              break_start_date: i.break_start_date
                ? moment(i.break_start_date).format("DD-MM-YYYY")
                : "NA",
              break_end_date: i.break_end_date
                ? moment(i.break_end_date).format("DD-MM-YYYY")
                : "NA",
            },
          }),
        };
      },
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client Sub Status User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientProgramStatusCount = async (_, res, next) => {
  try {
    const fourtyEightHours = moment()
      .subtract(48, "hours")
      .format("YYYY-MM-DD HH:mm:ss");
    const programCategories = ["Basic Stack", "Special Stack", "Privy Stack"];

    const queries = programCategories.map((programCategory) => ({
      table: `${tables.orderDetails} od`,
      selectField: [
        `COUNT(DISTINCT od.user_id) as total_count`,
        `COUNT(DISTINCT CASE WHEN sop.order_type = 'New' THEN od.user_id END) as new_count`,
        `COUNT(DISTINCT CASE WHEN sop.order_type = 'Renewal' THEN od.user_id END) as renewal_count`,
        `COUNT(DISTINCT CASE WHEN sop.order_type = 'OCR' THEN od.user_id END) as ocr_count`,
      ],
      join: [
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
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
      ],
      condition: [
        { field: "pm.program_category", operator: "=", value: programCategory },
        { field: "od.order_date", operator: ">=", value: fourtyEightHours },
      ],
    }));

    const results = await readRecordUnion(queries);
    const data = {
      basic_stack: results[0] || {
        total_count: 0,
        new_count: 0,
        renewal_count: 0,
        ocr_count: 0,
      },
      special_stack: results[1] || {
        total_count: 0,
        new_count: 0,
        renewal_count: 0,
        ocr_count: 0,
      },
      privy_stack: results[2] || {
        total_count: 0,
        new_count: 0,
        renewal_count: 0,
        ocr_count: 0,
      },
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Program Status Count (Users) fetched successfully",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error fetching client program status counts:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientProgramUserData = async (req, res, next) => {
  try {
    const { stack, search, page = 1, limit = 10, data: order_type } = req.body;
    const fourtyEightHours = moment()
      .subtract(48, "hours")
      .format("YYYY-MM-DD HH:mm:ss");

    const normalizedOrderType = String(order_type || "").toLowerCase();
    if (
      order_type &&
      !["new", "renewal", "ocr"].includes(normalizedOrderType)
    ) {
      return next(new ErrorHandler("Invalid order_type", 400));
    }

    const conditions = [
      { field: "od.order_date", operator: ">=", value: fourtyEightHours },
    ];
    if (stack) {
      conditions.push({
        field: "pm2.program_category",
        operator: "=",
        value: stack,
      });
    }
    if (normalizedOrderType) {
      conditions.push({
        field: "sop2.order_type",
        operator: "=",
        value:
          normalizedOrderType.charAt(0).toUpperCase() +
          normalizedOrderType.slice(1),
      });
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      base_table: `${tables.orderDetails} od`,
      extraConditions: conditions,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = od.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop2`,
          on: "sop2.order_id = od.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm2`,
          on: "pm2.program_id = sop2.program_id",
        },
      ],
      extraObjects: async (i) => {
        const { formattedText } = await getWhatsappTextUtil({
          label: "New Enrolled Clients ( Basic Stack ) - NEW",
          variables: [
            { key: "name", value: i.client_name || "N/A" },
            { key: "current_program", value: i.program_name || "N/A" },
            {
              key: "program_duration",
              value: i.current_program_duration || "N/A",
            },
            {
              key: "current_program_expiry",
              value: i.current_expiry_date
                ? `${moment(i.current_expiry_date).format(
                    "DD-MM-YYYY"
                  )} (${moment(i.current_expiry_date).fromNow()})`
                : "N/A",
            },
          ],
        });
        return {
          action_details: { client_whatsapp_text: formattedText },
          mentor_details: {
            mentor_assigned: i.mentor_assigned || null,
            mentor_assigned_phone: i.mentor_assigned_phone || null,
          },
          order_details: {
            order_id: i.order_id,
            order_date: i.order_date,
            order_type: i.order_type,
          },
        };
      },
      extraGroupBy: ["od.user_id"],
      extraSelectFields: [
        "od.order_id",
        "od.order_date",
        "sop.order_type",
        "pm.program_category",
      ],
      extraOrderBy: ["sop2.created_at DESC"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client Program Status User Data fetched successfully",
      data,
      totalCount: total_page,
      meta_data: { page, limit },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getClientProgramUserData:", {
      error: error.message,
      requestBody: req.body,
    });
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientsInductionCardsCount = async (_, res, next) => {
  try {
    const result = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(ud.user_id) as count",
          "'mentor_not_assigned_clients' as type",
        ],
        condition: [
          {
            orConditions: [
              {
                field: "ud.mentor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
              {
                field: "ud.mentor_assigned",
                operator: "=",
                value: 0,
              },
            ],
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
          "COUNT(ud.user_id) as count",
          "'app_not_installed_clients' as type",
        ],
        condition: [
          {
            field: "ud.device",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned", 
            operator: "!=", 
            value: 196, 
          }
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(ud.user_id) as count",
          "'naf_icl_received_diet_not_sent' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.assessment} ass`,
            on: "ass.user_id = ud.user_id and ass.active_order_id = sop.sub_order_id",
          },
          {
            type: "INNER",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: "iclr.user_id = ud.user_id and iclr.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ass.completion_status",
            operator: "=",
            value: 2,
          },
          {
            field: "iclr.completion_status",
            operator: "=",
            value: 2,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: "0",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'induction_call_not_done' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.orderDetails} od`,
            on: "sop.order_id = od.order_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: "cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id AND cu.call_type = '3' AND cu.call_status = 1",
          },
          
        ],
        condition: [
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
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "od.order_date",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },

          {
            field: "cu.user_id",
            operator: "IS",
            value: null,
            raw: true,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
        ],
      },
      {
  table: `${tables.userDetails} ud`,
  selectField: [
    "COUNT(DISTINCT ud.user_id) as count",
    "'introduction_call_not_done_today' as type",
  ],
  join: [
    {
      type: "INNER",
      table: `${tables.subOrderPrograms} sop`,
      on: "sop.sub_order_id = ud.active_order_id",
    },
    {
      type: "LEFT",
      table: `${tables.orderDetails} od`,
      on: "sop.order_id = od.order_id",
    },
    {
      type: "LEFT",
      table: `${tables.callUpdates} cu`,
      on: "cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id AND cu.call_type = '66' AND cu.call_status = 1",
    },
  ],
  condition: [
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
      field: "ud.user_status",
      operator: "=",
      value: "Active",
    },
    {
      field: "cu.user_id",
      operator: "IS",
      value: null,
      raw: true,
    },
    {
      field: "sop.sent_sessions",
      operator: "=",
      value: 0,
    },
    {
      field: "DATE(od.order_date)",
      operator: "=",
      value: "CURDATE()",
      raw: true,
    },
  ],
},
{
  table: `${tables.userDetails} ud`,
  selectField: [
    "COUNT(DISTINCT ud.user_id) as count",
    "'introduction_call_not_done_overdue' as type",
  ],
  join: [
    {
      type: "INNER",
      table: `${tables.subOrderPrograms} sop`,
      on: "sop.sub_order_id = ud.active_order_id",
    },
    {
      type: "LEFT",
      table: `${tables.orderDetails} od`,
      on: "sop.order_id = od.order_id",
    },
    {
      type: "LEFT",
      table: `${tables.callUpdates} cu`,
      on: "cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id AND cu.call_type = '66' AND cu.call_status = 1",
    },
  ],
  condition: [
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
      field: "ud.user_status",
      operator: "=",
      value: "Active",
    },
    {
      field: "cu.user_id",
      operator: "IS",
      value: null,
      raw: true,
    },
    {
      field: "sop.sent_sessions",
      operator: "=",
      value: 0,
    },
    {
      field: "DATE(od.order_date)",
      operator: "<=",
      value: "CURDATE()",
      raw: true,
    },
  ],
},
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'welcome_call_not_done' as type",
        ],
        join: [
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
        condition: [
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
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'session_start_date_not_set' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id And dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
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
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
      },
    ]);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Clients Induction Cards Count fetched Successfully",
      data: {
        mentor_not_assigned_client: result[0].count,
        app_not_installed_clients: result[1].count,
        naf_icl_received_diet_not_sent: result[2].count,
        induction_call_not_done: result[3].count,
        introduction_call_not_done_today: result[4].count,
        introduction_call_not_done_overdue: result[5].count,
        welcome_call_not_done: result[6].count,
        session_start_date_not_set: result[7].count,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const getMentorNotAssignedData = async (req, res, next) => {
  try {
    const { page, limit, search } = req.body;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        {
          orConditions: [
            {
              field: "ud.mentor_assigned",
              operator: "IS",
              value: null,
              raw: true,
            },
            {
              field: "ud.mentor_assigned",
              operator: "=",
              value: 0,
            },
          ],
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
      ],
      extraObjects: (i) => {
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client Program Status User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appNotInstalledClientsData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        {
          field: "ud.device",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
            field: "ud.mentor_assigned", 
            operator: "!=", 
            value: 196, 
        }
      ],
      extraObjects: async (i) => {
        const { formattedText } = await getWhatsappTextUtil({
          label: "App not Installed",
          variables: [
            {
              key: "name",
              value: i.client_name,
            },
          ],
        });
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_text_details: {
            client_whatsapp_text: formattedText,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "App Not Installed Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const NAFICLReceivedDietNotSentUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: ["iclr.added_date as icl_received_at"],
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ass.completion_status",
          operator: "=",
          value: 2,
        },
        {
          field: "iclr.completion_status",
          operator: "=",
          value: 2,
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 0,
        },
      ],
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = ud.user_id and ass.active_order_id = sop.sub_order_id",
        },
        {
          type: "INNER",
          table: `${tables.ingredientChecklistRecords} iclr`,
          on: "iclr.user_id = ud.user_id and iclr.active_order_id = sop.sub_order_id",
        },
      ],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "NAF (NAF OD)",
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "naf_fill_date",
                value: `${moment(i.icl_received_at).fromNow()}`,
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
            ],
            to: "client",
          });
        const { formattedText: admin_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "NAF (NAF OD)",
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "naf_fill_date",
                value: `${moment(i.icl_received_at).fromNow()}`,
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
            ],
            to: "admin",
          });

        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_text_details: {
            client_whatsapp_text: client_whatsapp_text,
            admin_whatsapp_text,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message:
        "NAFICL Received Diet Not Sent Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientsInductionCallNotDone = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
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
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "od2.order_date",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },

        {
          field: "cu.user_id",
          operator: "IS",
          value: null,
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 0,
        },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id AND cu.call_type = '3' AND cu.call_status = 1",
        },
      ],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "Induction Call",
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
            ],
          });
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_details: { client_whatsapp_text },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Induction Call Not Done Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientsIntroductionCallNotDone = async (req, res, next) => {
  try {
    const {
      search,
      page,
      limit,
      order_type = "All", // 👈 NEW FILTER
    } = req.body;

    const { clientWhatsappText: unformatedClientWhatsappText } =
      await getWhatsappTextUtilOnce({
        label: "Induction Call",
      });

    let clientWhatsappText = unformatedClientWhatsappText;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        // ✅ Order Type Filter (All / New / OCR)
        ...(order_type === "All"
          ? [
              {
                orConditions: [
                  { field: "sop.order_type", operator: "=", value: "New" },
                  { field: "sop.order_type", operator: "=", value: "OCR" },
                ],
              },
            ]
          : [
              {
                field: "sop.order_type",
                operator: "=",
                value: order_type, // New or OCR
              },
            ]),

        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          orConditions: [
            { field: "cu.call_status", operator: "=", value: 0 }, // pending
            { field: "cu.user_id", operator: "IS", value: null, raw: true }, // no entry
          ],
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 0,
        },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `
            cu.user_id = ud.user_id
            AND cu.sub_order_id = ud.active_order_id
            AND cu.call_type = '66'
          `,
        },
      ],
      extraObjects: async (i) => {
        // Replace WhatsApp variables
        [{ key: "name", value: i.client_name }].forEach((variable) => {
          const key = new RegExp(`{{${variable.key}}}`, "g");
          clientWhatsappText = clientWhatsappText.replace(
            key,
            variable.value
          );
        });

        // ✅ Date label logic (schedule_date > created_at)
        const baseDate = i?.created_at;
        let created_at_label = "";

        if (baseDate) {
          const date = moment(baseDate).startOf("day");
          const today = moment().startOf("day");
          const diffDays = date.diff(today, "days");

          if (diffDays === 0) {
            created_at_label = "Today";
          } else if (diffDays === 1) {
            created_at_label = "Tomorrow";
          } else if (diffDays > 1) {
            created_at_label = `In ${diffDays} days`;
          } else {
            created_at_label = `${Math.abs(diffDays)} days ago`;
          }
        }

        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_details: {
            client_whatsapp_text: clientWhatsappText,
          },
          date_details: {
            base_date: baseDate,
            created_at_label,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const userIds = data.map((u) => u.client_details.client_id);

    let callDetails = [];
    if (userIds.length > 0) {
      callDetails = await readRecord({
        table: `${tables.callUpdates} cu
                LEFT JOIN ${tables.slots} slots
                ON cu.slot_id = slots.id`,
        selectFields: [
          "cu.call_id",
          "cu.user_id",
          "cu.sub_order_id",
          "cu.call_type",
          "cu.call_status",
          "cu.schedule_date",
          "cu.slot_id",
          "cu.reschedule_date",
          "slots.appointment_slots AS appointment_time",
        ],
        conditions: [
          { field: "cu.user_id", operator: "IN", value: userIds },
          { field: "cu.call_type", operator: "=", value: "66" },
          { field: "cu.call_status", operator: "=", value: "0" },
        ],
      });
    }

    const callMap = callDetails?.results?.reduce((acc, c) => {
      if (!acc[c.user_id]) acc[c.user_id] = [];
      acc[c.user_id].push(c);
      return acc;
    }, {});

    const enrichedData = data.map((u) => ({
      ...u,
      call_details: callMap[u.client_details.client_id] || [],
    }));

    // ✅ Descending sort (latest / most urgent first)
    enrichedData.sort((a, b) => {
      const dateA = a.date_details?.base_date
        ? moment(a.date_details.base_date)
        : moment(0);
      const dateB = b.date_details?.base_date
        ? moment(b.date_details.base_date)
        : moment(0);
      return dateB.diff(dateA);
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message:
        "Introduction Call Not Done Clients User Data fetched Successfully",
      data: enrichedData,
      totalCount: total_page,
      meta_data: { page },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};



const getClientsWelcomeCallNotDone = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
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
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.sub_order_id = sop.sub_order_id AND cu.call_type = '0'",
        },
      ],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "Welcome Call",
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "name",
                value: i.client_name,
              },
            ],
            to: "client",
          });
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_text_details: {
            client_whatsapp_text,
          },
        };
      },
      extraOrderBy: ["ud.added_date DESC"],
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Welcome Call Not Done Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsStartDateNotSentUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
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
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
      ],
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND sop.sent_sessions = dsl.session",
        },
      ],
      extraSelectFields: [
        "sop.last_session_sent_date as diet_sent_dat",
        "dsl.diet_id",
      ],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "Session Start date",
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
            ],
            to: "client",
          });
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          diet_details: {
            diet_id: i.diet_id,
            diet_sent_date: i.diet_sent_date
              ? `${moment(i.diet_sent_date).format("YYYY-MM-DD")} ${moment(
                  i.diet_sent_date
                ).fromNow()}`
              : "N/A",
            sent_sessions: i.current_sent_session,
          },
          action_text_details: {
            client_whatsapp_text,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Start Date Not Sent Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAssessmentAndICLNotFilledCount = async (req, res, next) => {
  try {
    const startofMonth = moment().startOf("month").format();

    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: ["COUNT(distinct ud.user_id) as count", "'ass_not_filled' as type"],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: "ud.user_id = ass.user_id AND ass.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            orConditions: [
              {
                field: "ass.completion_status",
                operator: "=",
                value: 0,
              },
              {
                field: "ass.user_id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
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
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.created_at",
            operator: ">=",
            value: startofMonth,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(distinct ud.user_id) as count",
          "'ass_partial_filled' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: "ud.user_id = ass.user_id AND ass.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          { field: "ass.completion_status", operator: "=", value: 1 },
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
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.created_at",
            operator: ">=",
            value: startofMonth,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: ["COUNT(distinct ud.user_id) as count", "'icl_not_filled' as type"],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: "ud.user_id = iclr.user_id AND iclr.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            orConditions: [
              {
                field: "iclr.completion_status",
                operator: "=",
                value: 0,
              },
              {
                field: "iclr.user_id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
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
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.created_at",
            operator: ">=",
            value: startofMonth,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(distinct ud.user_id) as count",
          "'icl_partial_filled' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: "ud.user_id = iclr.user_id and iclr.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          { field: "iclr.completion_status", operator: "=", value: 1 },
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
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.created_at",
            operator: ">=",
            value: startofMonth,
          },
        ],
      },
    ]);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message:
        "Assessment and ICL Partial And Full Filled  fetched Successfully",
      data: {
        assessment_not_filled_count: results[0].count,
        assessment_partial_filled_count: results[1].count,
        icl_not_filled_count: results[2].count,
        icl_not_partial_count: results[3].count,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsAssessmentNotFilledUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const status = String(req.body.status).toLowerCase();
    const startofMonth = moment().startOf("month").format();

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = ud.user_id and ass.active_order_id = sop.sub_order_id",
        },
      ],
      extraConditions: [
        status === "not_filled"
          ? {
              orConditions: [
                {
                  field: "ass.completion_status",
                  operator: "=",
                  value: 0,
                },
                {
                  field: "ass.user_id",
                  operator: "IS",
                  value: "NULL",
                  raw: true,
                },
              ],
            }
          : { field: "ass.completion_status", operator: "=", value: 1 },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.order_type",
          operator: "IN",
          value: ["New", "OCR"],
        },
        {
          field: "sop.created_at",
          operator: ">=",
          value: `${startofMonth}`,
        },
      ],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "Assessment",
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
            ],
            to: "client",
          });
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_text_details: {
            client_whatsapp_text,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Assessment Not Filled Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientsICLNotFilledUserData = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;
    const status = String(req.body.status).toLowerCase();
    const startofMonth = moment().startOf("month").format();

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        status === "not_filled"
          ? {
              orConditions: [
                {
                  field: "iclr.completion_status",
                  operator: "=",
                  value: 0,
                },
                {
                  field: "iclr.user_id",
                  operator: "IS",
                  value: "NULL",
                  raw: true,
                },
              ],
            }
          : { field: "iclr.completion_status", operator: "=", value: 1 },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.order_type",
          operator: "IN",
          value: ["New", "OCR"],
        },
        {
          field: "sop.created_at",
          operator: ">=",
          value: startofMonth,
        },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.ingredientChecklistRecords} iclr`,
          on: "ud.user_id = iclr.user_id AND iclr.active_order_id = sop.sub_order_id",
        },
      ],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label: "Assessment",
            variables: [
              {
                key: "name",
                value: i.client_name,
              },
            ],
            to: "client",
          });
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
          action_text_details: {
            client_whatsapp_text,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "ICL Not Filled Clients User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getSessionWeightAndInchNotUpdatedCount = async (_, res, next) => {
  try {
    const result = await readRecordUnion([
      // Start weight not updated
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'start_weight_not_updated' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
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
            field:"sop.sent_sessions",
            operator:"=",
            value:1
          },
          {
            field: "date(dsl.diet_start_date)",
            operator: ">",
            value: "2025-04-12",
          },
           {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: "IN",
            value: [1,2,3],
          }, 
          {
            orConditions: [
              {
                field: "dsl.start_session_weight",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
              {
                field: "dsl.start_session_weight",
                operator: "=",
                value: "0",
                raw: true,
              },
            ],
          },
        ],
      },
      // Start inch not updated
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'start_inch_not_updated' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.inchRecords} ir`,
            on: "ir.sub_order_id = sop.sub_order_id AND ir.session = sop.sent_sessions and ir.days = 0",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
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
            field:"sop.sent_sessions",
            operator:"=",
            value:1
          },
          {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: "IN",
            value: [1,2,3],
          },
          { field: "ir.inch_id", operator: "IS", value: "NULL", raw: true },
         
        ],
      },
      // Mid-session weight not updated
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'mid_session_weight_not_updated' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
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
            orConditions: [
              {
                field: "dsl.mid_session_weight",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
              { field: "dsl.mid_session_weight", operator: "=", value: 0 },
            ],
          },
          {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: "IN",
            value: [5,6,7],
          },
          {
            field: "date(dsl.diet_start_date)",
            operator: ">",
            value: "2025-04-12",
          },
        ],
      },
      // End weight not updated
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'end_weight_not_updated' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: "date(dsl.diet_start_date)",
            operator: ">",
            value: "2025-04-12",
          },
          {
            orConditions: [
              { field: "dsl.end_session_weight", operator: "=", value: 0 },
              {
                field: "dsl.end_session_weight",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: "=",
            value: 10,
          },
        ],
      },
      // End inch not updated
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'end_inch_not_updated' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ud.sub_user_status", operator: "=", value: "Active" },
          {
            field: "date(dsl.diet_start_date)",
            operator: ">",
            value: "2025-04-12",
          },
          {
            orConditions: [
              {
                field: "dsl.end_session_inch",
                operator: "=",
                value: 0,
                raw: true,
              },
              {
                field: "dsl.end_session_inch",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },        
          {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: "=",
            value: 10,
          },
        ],
      },
      // End photo not updated
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'end_photo_not_updated' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
          },
        ],
        condition: [
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
            field: "date(dsl.diet_start_date)",
            operator: ">",
            value: "2025-04-12",
          },
          {
            orConditions: [
              {
                field: "dsl.end_session_photo",
                operator: "=",
                value: 0,
                raw: true,
              },
              {
                field: "dsl.end_session_photo",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
            operator: "=",
            value: 10,
          },
        ],
      },
    ]);

    const data = result.reduce((acc, item) => {
      acc[item.type] = item.count || 0;
      return acc;
    }, {});

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "WMR Not Updated Users Data fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching WMR not updated data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getWMRNotUpdatedUserData = async (req, res, next) => {
  try {
    const { search, page, limit, data = "Start Weight" } = req.body;
    const conditions = [];
    const joins = [];

    if (data === "Start Weight") {
      conditions.push(
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
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [1, 2, 3],
        },
        {
          orConditions: [
            {
              field: "dsl.start_session_weight",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "dsl.start_session_weight",
              operator: "=",
              value: "0",
              raw: true,
            },
          ],
        }
      );
      joins.push({
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id  = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
      });
    }
    if (data === "Start Inch") {
      conditions.push(
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
          field: "ir.inch_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [1, 2, 3],
        }
      );
      joins.push(
        {
          type: "LEFT",
          table: `${tables.inchRecords} ir`,
          on: "ir.sub_order_id = sop.sub_order_id AND ir.`session` = sop.sent_sessions AND ir.days = 0",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
        }
      );
    }
    if (data === "Mid Weight") {
      conditions.push(
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
          orConditions: [
            {
              field: "dsl.mid_session_weight",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "dsl.mid_session_weight",
              operator: "=",
              value: "0",
              raw: true,
            },
          ],
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [5, 6, 7],
        }
      );
      joins.push({
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id  = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
      });
    }
    if (data === "End Weight") {
      conditions.push(
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
          field: "dsl.end_session_weight",
          operator: "=",
          value: 0,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "=",
          value: 10,
        }
      );
      joins.push({
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id  = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
      });
    }
    if (data === "End Inch") {
      conditions.push(
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
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "=",
          value: 10,
        },
        {
          orConditions: [
            {
              field: "dsl.end_session_inch",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "dsl.end_session_inch",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        }
      );
      joins.push({
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
      });
    }
    if (data === "End Photo") {
      conditions.push(
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
          orConditions: [
            {
              field: "dsl.end_session_photo",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "dsl.end_session_photo",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "=",
          value: 10,
        }
      );
      joins.push({
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
      });
    }

    const { data: results, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: conditions,
      extraJoins: joins,
      extraObjects: (i) => {
        return {
          action_text_details: {
            client_whatsapp_text:
              data === "Start Weight"
                ? `Hey ${i.client_name},

Here is a Reminder that your Start Weight updates are due.

Update your weight tracker on an empty stomach after using the washroom.

Click here : https://bit.ly/FillTracker

Warm regards,
Client Services Team
Balance Nutrition`
                : `Hii ${i.client_name} , PLEASE UPDATE YOUR ${data} IN THE APP!`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "WMR Not Updated Clients User Data fetched Successfully",
      data: results,
      totalCount: total_page,
      meta_data: {
        page,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateCallDetails = async (req, res, next) => {
  try {
    let {
      call_id,
      user_id,
      call_note,
      schedule_date,
      active_order_id,
      slot_id,
      admin_id,
      call_status = 0,
      call_type,
    } = req.body;
    console.log(req.body, 2012);

    if(call_id == 14 || call_id == 45){
      call_id = '';
    }
    // Scenario 1: When call_id is not provided, and call_type is 3 (Induction Call)
    if (!call_id && (Number(call_type) === 3||Number(call_type) === 4)) {
      const newCallData = {
        user_id,
        sub_order_id: active_order_id,
        call_type: call_type,
        user_type: "Active",
        added_by: admin_id,
        source: "DB",
        call_status: 1, // Call completed (can be adjusted based on actual use case)
        ...(call_note ? { call_insights: call_note } : {}),
      };

      // Insert a new call entry into the `callUpdates` table (induction call completed)
      const newInductionCallInserted = await insertRecord(
        `${tables.callUpdates}`,
        Object.keys(newCallData),
        Object.values(newCallData)
      );

      if (newInductionCallInserted.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While inserting Induction Call Details", 400)
        );
      }

      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Induction Call Details Inserted Successfully",
      });
      return res.status(200).json(apiresponse);
    }

    if(!call_id){
      const { results = [] } = await readRecord({
        table: `${tables.callUpdates} cu`,
        selectFields: [
          "cu.call_id"
        ],
        conditions: [
          {
            field: "cu.user_id",
            operator: "=",
            value: user_id,
          },
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw:true
          }
        ],
        orderBy: ["cu.schedule_date DESC"],
      pagination: { limit: 1 },
      });
      
      call_id = results?.[0]?.call_id || null;



      
    }

    // Scenario 2: For all other call types, `call_id` is provided, update the existing entry
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "cu.follow_up_id",
        "cu.call_status",
        "cd.first_name",
        "cd.email_id",
        "cd.user_type",
        "CONCAT(ad.designation,ad.first_name)as mentor_name",
        "CASE WHEN cd.user_type = '0' THEN 'Lead' WHEN cd.user_status = 'Active' THEN 'Active' ELSE 'OC' END AS status",
        "ad.active",
        "ad.oc",
        "ad.lead",
        "s.appointment_slots",
        "ad.first_name as mentor",
        "ad.official_phone as mentor_phone",
        "cu.user_id",
        "cu.call_type",
        "ad.email_id as mentor_email",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id=cu.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cu.added_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.slots} s`,
          on: "s.id = cu.slot_id",
        },
      ],
      conditions: [
        { field: "cu.call_id", operator: "=", value: Number(call_id) },
      ],
    });

    if (!call_type) {
      call_type = results && results.length > 0 ? results[0].call_type : 0;
    }
    if (results && results.length > 0) {
      // Check if the current call status is not `0` (pending). If it isn't, don't allow status update.
      if (results[0].call_status !== 0) {
        return next(
          new ErrorHandler(
            "Cannot change the status of a non-pending call",
            400
          )
        );
      }

      // If the call is a follow-up call (call_type = 18), update the follow-up log entry
      if (Number(call_type) === 18 && Number(call_status) === 1 && results[0]?.follow_up_id) {
        const followUpData = {
          follow_up_status: call_status,
          follow_up_note: call_note,
        };
        const followupUpdatedData = await updateRecord(
          `${tables.leadFollowUpLogs}`,
          followUpData,
          { follow_up_id: results[0].follow_up_id }
        );
        if (followupUpdatedData.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While updating Follow Up Log", 400)
          );
        }
      }else if(!results[0]?.follow_up_id && results[0]?.user_type == '0'){
        
            const engageFollowUpData = {
              status: '1',
              engagement_note: call_note,
            };
            
            const todayDate = new Date().toISOString().split("T")[0];
            const engageFollowupUpdatedData = await updateRecord(
              `${tables.leadEngagementLogs}`,
              engageFollowUpData,
              { engagement_date: todayDate, user_id: user_id }
            );
            // if (engageFollowupUpdatedData.affectedRows === 0) {
            //   return next(
            //     new ErrorHandler("Error While updating Follow Up Log", 400)
            //   );
            // }
      }else if(results[0]?.follow_up_id){
        const followUpData = {
          follow_up_status: '1',
          follow_up_note: call_note,
        };
        const followupUpdatedData = await updateRecord(
          `${tables.leadFollowUpLogs}`,
          followUpData,
          { follow_up_id: results[0].follow_up_id }
        );
        if (followupUpdatedData.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While updating Follow Up Log", 400)
          );
        }
      }

      // Update the existing call entry with the provided data
      const updatedData = {
        call_status,
        ...(call_status === 3 // If the call is rescheduled
          ? {
              slot_id,
              reschedule_date: schedule_date,
              call_insights: call_note,
            }
          : { call_insights: call_note }),
      };

      const condition = {
        call_id,
      };

      const updatedResult = await updateRecord(
        `${tables.callUpdates}`,
        updatedData,
        condition
      );
      if (
        updatedResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1" &&
        Number(call_status) === 1 && // When call is marked as completed
        results[0].user_id
      ) {
        const callTypes = {
          0: "welcome-call",
          1: "progress-call",
          2: "feedback-call",
          66:"induction-call",
        };

        const callLabel = callTypes[call_type] || "call-note";

        const addUserKeyInsights = await insertRecord(
          tables.userKeyInsight,
          ["user_id", "sub_order_id", "source", "key_insight", "added_by"],
          [results[0].user_id, active_order_id, callLabel, call_note, admin_id]
        );
        // console.log(addUserKeyInsights, 2170);
        if(call_type==66 || call_type==3) {
          
          const sendNotification = await axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [results[0]?.user_id],
              notification_id: 921,
              sent_via: "server",
              extraVariables: {
                call_type: {
                  call_id: call_id,
                },  
              },
            }
          );
        }else{

          const sendNotification = await axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [results[0]?.user_id],
              notification_id: 262,
              sent_via: "server",
              extraVariables: {
                call_type: {
                  call_id: call_id,
                },
              },
            }
          );
        }
        let query = "";
        if (Number(call_type) === 1) {
          query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi ${results[0].first_name},</p>

  <p>
    I am glad we connected & discussed our progress so far. Sending you a quick recap of the points we discussed & what we need to now keep in mind for our pending sessions:
  </p>

  <ol>
    <li>You must ensure that you regularly fill out your end session inch & photo trackers along with your weight updates. Also,</li>
    <li>Your sessions now must include foods/meals that....</li>
    <li>Send me your meal pictures on a regular basis. We must get to know the science of plating food for all meals</li>
    <li>ADD YOUR OWN</li>
  </ol>

  <p>
    Very soon, you will be seeing a very important & interesting section opening up in the app just for you. It will be asking you about your goals, progress & all else. Stay tuned & do read the notifications daily!
  </p>

  <p>
    <strong>P.S.</strong> Your app may not be updated to the latest version. <a href="https://www.balancenutrition.in/download-bn-app">Please click here</a> & get the latest version to avoid crashes. Ignore if already updated.
  </p>
  </div>
`;
        } else if (Number(call_type) === 2) {
          query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi ${results[0].first_name},</p>

  <p>It was great connecting with you over a call. Here is a quick summary of our call:</p>

  <p><strong>MENTOR PLEASE MENTION POINTS COVERED</strong></p>

  <p>Take a look at the <strong>60-day Reform Intermittent Program</strong></p>

  <ul>
    <li><strong>REFERENCE:</strong> [Add reference details here]</li>
    <li><strong>START DATE:</strong> [Add start date or any other important info here]</li>
  </ul>
</div>
`;
        }
      } else if (
        updatedResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1" &&
        Number(call_status) === 4 && // When call is marked as unanswered
        results[0].user_id
      ) {
        const sendNotification = await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [results[0]?.user_id],
            notification_id: 260,
            sent_via: "server",
            extraVariables: {
              call_type: {
                call_id: call_id,
              },
            },
          }
        );
      } else if (
        updatedResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1" &&
        Number(call_status) === 2 && // When call is marked as cancelled
        results[0].user_id
      ) {
        const sendNotification = await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [results[0]?.user_id],
            notification_id: 261,
            sent_via: "server",
            extraVariables: {
              call_type: {
                call_id: call_id,
              },
            },
          }
        );
      } else if (
        updatedResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1" &&
        Number(call_status) === 3 && // When call is marked as rescheduled
        results[0].user_id
      ) {
        // Scenario 3: If `call_status = 3` (Rescheduled Call)
        const newCallData = {
          user_id,
          sub_order_id: active_order_id,
          call_type,
          user_type: "Active",
          added_by: admin_id,
          source: "DB",
          call_status: 0, // Pending status for rescheduled call
          schedule_date,
          slot_id,
          ...(call_note ? { call_insights: call_note } : {}),
        };

        // Insert a new record with "pending" status for rescheduled call
        const newRescheduledCallInserted = await insertRecord(
          `${tables.callUpdates}`,
          Object.keys(newCallData),
          Object.values(newCallData)
        );

        if (newRescheduledCallInserted.affectedRows === 0) {
          return next(
            new ErrorHandler(
              "Error While inserting Rescheduled Call Details",
              400
            )
          );
        }

        // Send notification for rescheduled call

        const sendNotification = await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [results[0]?.user_id],
            notification_id: 263,
            sent_via: "server",
            extraVariables: {
              call_type: {
                call_id: call_id,
              },
            },
          }
        );
      }
      if (Number(call_status) === 1 && Number(call_type) === 30) {
        const mailData = {
          to: results[0].email_id,
          subject: "Consultation Call Completed",
          body: `<p>Hi ${results[0].first_name},</p>
         <p>We hope you had a fruitful conversation with our <b>${results[0].mentor_name}</b>. She will connect with you over WhatsApp shortly & send you the details of the program best suited for you.</p>
         <p>Feel free to connect with her for any doubts or queries you may have.</p>
         <p><b>P.S.</b> Stay rest assured, your success is our responsibility & we shall ensure it happens.</p>
         <p><strong>P.P.S.</strong> <p><b>Women Aren&rsquo;t Failing at Health The System Is -&nbsp;</b>Khyati Rupani breaks down why women don&rsquo;t need extreme diets, supplements, or food fads.&nbsp;<a href="https://youtu.be/raenYacbx40?si=VO78qWPFOSfah8yn">Click Here</a> </p></p>

         `,
        };
        if (results[0].status === "Lead") {
          const { call } = safeJSONParse(results[0].lead);
          mailData.body += call.ps_line.length > 0 ? `${call.ps_line[0]}` : "";
          mailData.cc = call.cc;
          mailData.cc.push(results[0].mentor_email);
          mailData.bcc = call.bcc;
        } else if (results[0].status === "Active") {
          const { call } = safeJSONParse(results[0].active);
          mailData.body += call.ps_line.length > 0 ? `${call.ps_line[0]}` : "";
          mailData.cc = call.cc;
          mailData.cc.push(results[0].mentor_email);
          mailData.bcc = call.bcc;
        } else {
          const { call } = safeJSONParse(results[0].oc);
          mailData.body += call.ps_line.length > 0 ? `${call.ps_line[0]}` : "";
          mailData.cc = call.cc;
          mailData.cc.push(results[0].mentor_email);
          mailData.bcc = call.bcc;
        }
        const mail = sendMailUtil({
          from: "No Reply - Balance Nutrition <support@balancenutrition.in>",
          to: mailData.to,
          subject: mailData.subject,
          html: mailData.body,
          cc: mailData.cc,
          bcc: mailData.bcc,
        });
      }
      if (Number(call_status) === 2 && Number(call_type) === 30) {
        const mailData = {
          to: results[0].email_id,
          subject: "Consultation call cancelled",
          body: `<p>Hi ${results[0].first_name},</p>
         <p>You had a consultation call that was scheduled with <b>${results[0].mentor_name}</b> for today at ${results[0].appointment_slots} IST</p>
         <p>Unfortunately, the call was Cancelled.</p>
         <p>You can book your consultation again: <a href="${results[0].call_link}">click here</a></p>
         <p>Alternatively, you can also <a>WhatsApp ${results[0].mentor}</a> at: <a target='_blank' href='https://wa.me/91${results[0].mentor_phone}/?text=Hi'>+91-${results[0].mentor_phone}</a></p>
         <p><strong>P.S.</strong> <p><b>Women Aren&rsquo;t Failing at Health The System Is -&nbsp;</b>Khyati Rupani breaks down why women don&rsquo;t need extreme diets, supplements, or food fads.&nbsp;<a href="https://youtu.be/raenYacbx40?si=VO78qWPFOSfah8yn">Click Here</a> </p></p>

         `,
        };
        if (results[0].status === "Lead") {
          const { call } = safeJSONParse(results[0].lead);
          mailData.body += `${call.ps_line[0]}`;
          mailData.cc = call.cc;
          mailData.bcc = call.bcc;
        } else if (results[0].status === "Active") {
          const { call } = safeJSONParse(results[0].active);
          mailData.body += `${call.ps_line[0]}`;
          mailData.cc = call.cc;
          mailData.bcc = call.bcc;
        } else {
          const { call } = safeJSONParse(results[0].oc);
          mailData.body += `${call.ps_line[0]}`;
          mailData.cc = call.cc;
          mailData.bcc = call.bcc;
        }
        const mail = sendMailUtil({
          from: "No Reply - Balance Nutrition <support@balancenutrition.in>",
          to: mailData.to,
          subject: mailData.subject,
          html: mailData.body,
          cc: mailData.cc,
          bcc: mailData.bcc,
        });
      }

      if (updatedResult.affectedRows === 0) {
        return next(new ErrorHandler("Error While updating Call Details", 400));
      }

      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Call Details Updated Successfully",
      });
      return res.status(200).json(apiresponse);
    }

    return next(new ErrorHandler("Call Details Not Found", 404));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addCsNotes = async (req, res, next) => {
  try {
    const { user_id, noteObj } = req.body;

    console.log(user_id, noteObj);

    const { results: getUserData } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["user_id", "cs_notes"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    if (getUserData.length === 0) {
      return next(new ErrorHandler("User Not Found", 404));
    }

    console.log(getUserData[0]?.cs_notes, "CS Notes");
    //
    let parsedCsNotes = [];

    if (getUserData[0]?.cs_notes) {
      if (typeof getUserData[0].cs_notes === "string") {
        // JSON string in DB
        parsedCsNotes = safeJSONParse(getUserData[0].cs_notes) || [];
      } else if (Array.isArray(getUserData[0].cs_notes)) {
        // Already an array (like your console shows)
        parsedCsNotes = getUserData[0].cs_notes;
      }
    }
    parsedCsNotes.push(noteObj);

    console.log(JSON.stringify(parsedCsNotes), noteObj, "Note Obj 1108");

    const updatedResult = await updateRecord(
      tables.userDetails,
      { cs_notes: JSON.stringify(parsedCsNotes) },
      { user_id: user_id }
    );

    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error While updating CS Notes", 400));
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "CS Notes Added Successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  NAFICLReceivedDietNotSentUserData,
  appNotInstalledClientsData,
  getAssessmentAndICLNotFilledCount,
  getClientProgramStatusCount,
  getClientProgramUserData,
  getClientSubStatusCount,
  getClientSubStatusUserData,
  getClientsAssessmentNotFilledUserData,
  getClientsICLNotFilledUserData,
  getClientsInductionCallNotDone,
  getClientsInductionCardsCount,
  getClientsStartDateNotSentUserData,
  getClientsWelcomeCallNotDone,
  getMentorNotAssignedData,
  getSessionWeightAndInchNotUpdatedCount,
  getWMRNotUpdatedUserData,
  updateCallDetails,
  getClientsIntroductionCallNotDone,
};