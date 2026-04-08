import ejs from "ejs";
import md5 from "md5";
import moment from "moment";
import path, { join } from "path";
import axios from "axios";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import {
  checkActionTakenAndLogoff,
  compareDataObjects,
  mapCallType,
  safeJSONParse,
} from "../../helper/commonHelper.js";
import {
  appVersions,
  callTypes,
  leadSources,
  sources,
  tables,
} from "../../helper/constant.js";
import {
  getFormattedLeadData,
  getFormattedUserData,
  getTodayDueWeightManagementDataCs,
  todaysRiskAndMissesClientDataCs,
} from "../../helper/mentordbHelpers.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import dietDetails from "../../models/dietDetailsModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { createPaymentLink } from "../../utils/createPaymentLink.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import {
  addFollowUpUtil,
  addLeadAssignLog,
  addSourceLogNew,
} from "./leadsController.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { sendSSEEvent } from "../dashboardNotificationController.js";
import {
  AppNotUpdatedClientsCount,
  getClientNotStartedCount,
  getClientOnBreakCount,
  getClientsAdvancedPurchase,
  getClientsBalanceDue,
  getDormancyClientCount,
} from "../csDashboardControllers/OverallPendingController.js";
import { getClientsExpiring } from "../csDashboardControllers/ExpiryClientsController.js";
import { dataForPlanner, app_versions } from "../../helper/constant.js";
import { getCsBirthdayUserIdsTodayYesterday } from "../mentorDashboardControllers/dashboardController.js";

function formatCounsellorPost(post) {
  const match = post.match(/^(.+?)\s*\((.*?)\)$/);
  if (match && match.length === 3) {
    return `${match[1]}<br><small>(${match[2]})</small>`;
  } else {
    return post;
  }
}

const getCounsellors = async (req, res, next) => {
  const { user_id } = req.query;

  try {
    const selectFields = [
      "admin_user_id as id",
      "email_id as counsellor_email",
      "CONCAT(first_name, ' ', last_name) as counsellor_name",
      "designation as counsellor_post",
      "official_phone as counsellor_mobile",
      "education as qualification",
      "expertise as counsellor_speciality",
      "total_clients",
      "TIMESTAMPDIFF(YEAR, total_experience, CURDATE()) as experience",
      "photo as image",
    ];
    const conditions = [
      { field: "role_id", operator: "=", value: "2" },
      {
        field: "is_active",
        operator: "=",
        value: "1",
      },
    ];

    if (user_id) {
      const { results: userDetails } = await readRecord({
        selectFields: ["*"],
        table: `${tables.userDetails}`,
        conditions: [
          {
            field: "user_id",
            operator: "=",
            value: user_id,
          },
        ],
      });
      if (Number(userDetails[0].user_type) === 0) {
        const { results: callBooked } = await readRecord({
          selectFields: ["*"],
          table: `${tables.callUpdates}`,
          conditions: [
            {
              field: "user_id",
              operator: "=",
              value: user_id,
            },
          ],
        });
        console.log(callBooked, 77);
        if (callBooked.length > 0) {
          conditions.push({
            field: "admin_user_id",
            operator: "=",
            value: callBooked[0].added_by,
          });
        }
      }
    }

    const { results: counsellors } = await readRecord({
      table: tables.adminUsers,
      selectFields,
      conditions,
    });
    if (counsellors.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No records found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const finalData = counsellors.map((item) => {
      return {
        ...item,
        image: JSON.parse(item.image || "[]"),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All counsellors fetched successfully",
      data: finalData,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getCounsellorsForConsultation = async (req, res, next) => {
  try {
    const selectFields = [
      "admin_user_id as id",
      "email_id as counsellor_email",
      "CONCAT(first_name, ' ', last_name) as counsellor_name",
      "designation as counsellor_post",
      "official_phone as counsellor_mobile",
      "education as qualification",
      "expertise as counsellor_speciality",
      "total_clients",
      "TIMESTAMPDIFF(YEAR, total_experience, CURDATE()) as experience",
      "photo as image",
    ];
    const conditions = [
      {
        field: "is_active",
        operator: "=",
        value: "1",
      },
      { field: "available_for_consultation", operator: "=", value: 1 },
    ];
    const { results: counsellors } = await readRecord({
      table: tables.adminUsers,
      selectFields,
      conditions,
      orderBy: ["sequence "],
    });
    if (counsellors.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No records found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const finalData = counsellors.map((item) => {
      return {
        ...item,
        image: JSON.parse(item.image || "[]"),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All counsellors fetched successfully",
      data: finalData,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentors = async (req, res, next) => {
  try {
    const selectFields = [
      "admin_user_id as id",
      "email_id as mentor_email",
      "CONCAT(first_name, ' ', last_name) as mentor_name",
      "crm_user",
      "designation as mentor_post",
      "official_phone as mentor_mobile",
      "education as qualification",
      "expertise as mentor_speciality",
      "total_clients ",
      "TIMESTAMPDIFF(YEAR, total_experience, CURDATE()) as experience",
      "photo as image",
    ];
    const conditions = [
      { field: "role_id", operator: "=", value: "1" },
      { field: "is_active", operator: "=", value: "1" },
    ];
    const { results: mentors } = await readRecord({
      table: tables.adminUsers,
      selectFields,
      conditions,
    });
    if (mentors.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No records found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All mentors fetched successfully",
      data: mentors,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllAdmins = async (req, res, next) => {
  try {
    const { role, active, page, limit, search } = req.query;

    const joins = [
      {
        type: "LEFT",
        table: `${tables.roles} r`,
        on: "r.role_id = ad.role_id",
      },
    ];

    const conditions = [];

    if (role === "mentor") {
      conditions.push({
        field: "ad.email_id",
        operator: "LIKE",
        value: "mentor.",
      });
    }

    if (active === "true") {
      conditions.push({
        field: "ad.is_active",
        operator: "=",
        value: 1,
      });
    }
    if (active === "false") {
      conditions.push({
        field: "ad.is_active",
        operator: "=",
        value: "0",
        raw: true,
      });
    }

    const { results: admins, totalCount } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: [
        "ad.admin_user_id",
        "CONCAT(ad.first_name, ' ', ad.last_name) AS admin_name",
        "ad.crm_user",
        "ad.signature_name",
        "ad.gender",
        "ad.email_id AS official_email",
        "ad.p_email_id AS personal_email",
        "ad.password AS plain_password",
        "ad.official_phone",
        "r.name AS role",
        "ad.personal_phone",
        "ad.total_clients",
        "ad.designation",
        "ad.education",
        "ad.call_link",
        "ad.joining_date",
        "ad.photo",
        "ad.is_active",
        ...(req.headers.source === "update_panel"
          ? ["ad.active", "ad.oc", "ad.lead"]
          : []),
      ],
      conditions,
      joins,
      ...(page && limit && { pagination: { limit, page } }),
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ad.first_name,' ',ad.last_name)",
            "ad.email_id",
            "ad.official_phone",
            "ad.personal_phone",
          ],
        },
      }),
    });

    if (admins.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No records found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }

    const totalPages = Math.ceil(totalCount / limit);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All admins fetched successfully",
      data: admins,
      totalCount: totalPages,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const searchAdmin = async (req, res, next) => {
  const { name } = req.params;
  try {
    const conditions = [{ field: "is_active", operator: "=", value: 1 }];
    if (isNaN(parseInt(name))) {
      conditions.push({
        field: "crm_user",
        operator: "=",
        value: `${name}`,
      });
    } else {
      conditions.push({
        field: "admin_user_id",
        operator: "=",
        value: name,
      });
    }
    const { results: admins } = await readRecord({
      selectFields: [
        "admin_user_id as id",
        "email_id as counsellor_email",
        "CONCAT(first_name, ' ', last_name) as counsellor_name",
        "designation as counsellor_post",
        "official_phone as counsellor_mobile",
        "education as qualification",
        "expertise as counsellor_speciality",
        "total_clients",
        "TIMESTAMPDIFF(YEAR, total_experience, CURDATE()) as experience",
        "photo as image",
      ],
      table: `${tables.adminUsers}`,
      conditions,
    });
    if (admins.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No records found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const finalData = admins.map((item) => {
      return {
        ...item,
        counsellor_post: formatCounsellorPost(item.counsellor_post),
        image: JSON.parse(item.image || "[]"),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All admins fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCallsCount = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    const todayDate = moment().format("YYYY-MM-DD");
    const tommorrowDate = moment().add(1, "day").format("YYYY-MM-DD");
    const futureDate = moment().add(2, "day").format("YYYY-MM-DD");

    const result = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: ["cu.call_id", "'Missed' AS `grouping`"],
        condition: [
          {
            field: "date(cu.schedule_date)",
            operator: "<",
            value: `${todayDate}`,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: "0",
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: Number(admin_id),
          },
          {
            field: `cu.user_id NOT IN (SELECT cu1.user_id FROM ${tables.callUpdates} cu1 WHERE cu1.added_by = ${admin_id} AND cu1.call_status = '1' GROUP BY cu1.user_id)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
        groupBy: ["cu.slot_id"],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: ["cu.call_id", "'Today' AS `grouping`"],
        condition: [
          {
            field: "date(cu.schedule_date)",
            operator: "=",
            value: `${todayDate}`,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: "0",
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: Number(admin_id),
          },
        ],
        groupBy: ["cu.slot_id"],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: ["cu.call_id", "'Tomorrow' AS `grouping`"],
        condition: [
          {
            field: "date(cu.schedule_date)",
            operator: "=",
            value: `${tommorrowDate}`,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: "0",
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: Number(admin_id),
          },
        ],
        groupBy: ["cu.slot_id"],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: ["cu.call_id", "'Future' AS `grouping`"],
        condition: [
          {
            field: "date(cu.schedule_date)",
            operator: ">=",
            value: `${futureDate}`,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: "0",
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: Number(admin_id),
          },
        ],
        groupBy: ["cu.slot_id"],
      },
    ]);

    const groupedData = {
      missed: [],
      today: [],
      tomorrow: [],
      future: [],
    };

    result.forEach((row) => {
      if (row.grouping === "Missed") {
        groupedData.missed.push(row.call_id);
      } else if (row.grouping === "Today") {
        groupedData.today.push(row.call_id);
      } else if (row.grouping === "Tomorrow") {
        groupedData.tomorrow.push(row.call_id);
      } else if (row.grouping === "Future") {
        groupedData.future.push(row.call_id);
      }
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Call Count By Admin Id fetched successfully",
      data: groupedData,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCallByCallId = async (req, res, next) => {
  const { call_ids, filter } = req.body;

  if (!call_ids || call_ids.length === 0) {
    return next(new ErrorHandler("Call ids Are required", 400));
  }
  try {
    const { data, total_page } = await getFormattedUserData({
      extraSelectFields: [
        "cu.call_id",
        "cu.call_type",
        "cu.call_status",
        "GROUP_CONCAT(DISTINCT basm.appointment_slots ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', ') AS appointment_slots",
        "cu.schedule_date",
        "cu.slot_id",
      ],
      extraGroupBy: ["cu.call_id"],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = cu.user_id",
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
      extraOrderBy: ["CAST(SUBSTRING_INDEX(cu.slot_id, ',', 1) AS UNSIGNED)"],
      extraConditions: [
        {
          field: "cu.call_id",
          operator: "IN",
          value: call_ids,
        },
        {
          field: "cu.call_status",
          operator: "=",
          value: 0,
        },
        ...(filter
          ? [
              filter === "Lead"
                ? { field: "ud.user_type", operator: "=", value: "0" }
                : filter === "Active"
                  ? { field: "ud.user_status", operator: "=", value: "Active" }
                  : {
                      field: "ud.user_status",
                      operator: "=",
                      value: "Completed",
                    },
            ]
          : []),
      ],
      extraObjects: (i) => {
        return {
          call_details: {
            call_id: i.call_id,
            call_type: mapCallType(i.call_type),
            call_status:
              Number(i.call_status) === 0
                ? "Pending"
                : Number(i.call_status) === 1
                  ? "Done"
                  : Number(i.call_status) === 2
                    ? "Cancelled"
                    : Number(i.call_status) === 3
                      ? "Rescheduled"
                      : "Unanswered",
            appointment_slots: i.appointment_slots,
            schedule_date: `${moment(i.schedule_date).format("DD/MM/YYYY")} `,
          },
        };
      },
      base_table: `${tables.callUpdates} cu`,
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Call details fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "user_id",
        "call_id",
        "suggested_program_id",
        "suggested_program_session_id",
        "sub_order_id",
      ],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const bookCall = async (req, res, next) => {
  const newData = req.body;
  let { utm_source } = req.body;
  const source = req.headers["source"];

  if (
    source == "app" &&
    newData.added_by == "0" &&
    (newData.call_type == "0" ||
      newData.call_type == "1" ||
      newData.call_type == "2" ||
      newData.call_type == "45")
  ) {
    const { results: userDetails } = await readRecord({
      selectFields: ["ud.mentor_assigned"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_id", operator: "=", value: newData.user_id },
      ],
    });
    if (userDetails.length > 0) {
      newData.added_by = userDetails[0].mentor_assigned;
    }
  }

  if (source == "app" && newData.call_type == "66") {
    newData.added_by = 215;
  }

  // Validate the necessary fields
  if (
    (!newData.call_type && !newData.reason) ||
    (!newData.slot_id && !newData.reason === "Leave") ||
    !newData.added_by ||
    !newData.schedule_date
  ) {
    return next(new ErrorHandler("All fields are required", 400));
  }

  // Reason validation for specific call types
  const reason =
    newData.reason !== undefined ? newData.reason.trim().toLowerCase() : "";
  if (["half day", "training/meet", "other"].includes(reason)) {
    const columns = [
      "call_type",
      "slot_id",
      "added_by",
      "schedule_date",
      "comment",
      "source",
      newData.sub_order_id ? "sub_order_id" : null,
      "call_status",
    ].filter(Boolean);
    const values = [
      "22",
      newData.slot_id,
      newData.added_by,
      newData.schedule_date,
      newData.comment,
      source.toLowerCase().includes("db")
        ? "DB"
        : source.toLowerCase() === "app"
          ? "APP"
          : "WEB",
      newData.sub_order_id ? newData.sub_order_id : null,
      "0",
    ].filter(Boolean);
    console.log(columns, values, 645);
    const insertResult = await insertRecord(
      tables.callUpdates,
      columns,
      values,
    );
    if (insertResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: `Call Blocked for ${newData?.reason} successfully`,
        data: insertResult.insertId,
      });
      return res.status(201).json(apiResponse);
    }
  } else if (reason === "leave") {
    const columns = [
      "call_type",
      "slot_id",
      "added_by",
      "schedule_date",
      "comment",
      "call_status",
      "source",
    ];
    const values = [
      "22",
      "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,66",
      newData.added_by,
      newData.schedule_date,
      newData.comment,
      0,
      source.toLowerCase().includes("db")
        ? "DB"
        : source.toLowerCase() === "app"
          ? "APP"
          : "WEB",
    ];
    const insertResult = await insertRecord(
      tables.callUpdates,
      columns,
      values,
    );
    if (insertResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: `Call Blocked for ${newData?.reason} successfully`,
        data: insertResult.insertId,
      });
      return res.status(201).json(apiResponse);
    }
  }

  try {
    const { results: callDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.callUpdates} cu`,
      conditions: [
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: newData.schedule_date,
        },
        { field: "cu.slot_id", operator: "=", value: newData.slot_id },
        { field: "cu.call_status", operator: "=", value: 0 },
        { field: "cu.added_by", operator: "=", value: newData.added_by },
        {
          field: "cu.call_type",
          operator: "=",
          value: newData.call_type,
        },
      ],
    });
    console.log(callDetails, 716);
    if (callDetails.length > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Call already booked for this slot`,
        // data: callDetails[0].call_id,
      });
      return res.status(200).json(apiResponse);
    }
    if (newData.user_id) {
      const { results: callDetails } = await readRecord({
        selectFields: ["*"],
        table: `${tables.callUpdates} cu`,
        conditions: [
          { field: "cu.user_id", operator: "=", value: newData.user_id },
          {
            field: "DATE(cu.schedule_date)",
            operator: ">=",
            value: newData.schedule_date,
          },
          ,
          {
            field: "cu.call_status",
            operator: "=",
            value: 0,
          },
          {
            field: "cu.call_type",
            operator: "=",
            value: newData.call_type,
          },
        ],
      });
      if (callDetails.length > 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `Call already booked for this user`,
        });
        return res.status(200).json(apiResponse);
      }
    }
    // Fetch user details
    const { results: users } = await readRecord({
      table: tables.userDetails,
      selectFields: [
        "user_id",
        "email_id",
        "CASE WHEN phone_code NOT IN ('0') THEN CONCAT(phone_code, ' ', phone_number) ELSE phone END AS phone_number",
        "CONCAT(first_name,' ',last_name) as full_name",
        "phone_code",
        "phone_number",
        "CASE WHEN user_type = '0' THEN 'Lead' WHEN user_status = 'Active' THEN 'Active' ELSE 'OC' END AS status",
        "mentor_assigned",
        "counsellor_assigned",
      ],
      conditions: [
        ...(newData?.user_id
          ? [{ field: "user_id", operator: "=", value: newData.user_id }]
          : [
              // { field: "phone_code", operator: "=", value: newData.phone_code },
              {
                field: "phone_number",
                operator: "like",
                value: newData.phone_number,
              },
            ]),
      ],
    });

    let newLeadUserId = null;
    if (
      String(newData.user_type).toLowerCase() === "new lead" &&
      users.length > 0
    ) {
      newData.user_id = users[0].user_id;
      if (req.headers["source"] === "web") {
        if (
          users[0].status === "Lead" &&
          (users[0].counsellor_assigned == null ||
            newData.counsellor_assigned != newData.added_by)
        ) {
          const updateResult = await updateRecord(
            tables.userDetails,
            {
              counsellor_assigned: newData.added_by,
            },
            {
              user_id: users[0].user_id,
            },
          );

          if (updateResult.affectedRows > 0) {
            const assignLog = await addLeadAssignLog({
              user_id: users[0].user_id,
              counsellor_id: newData.added_by,
              counsellor_id: newData.added_by,
              assigned_by: newData.added_by,
            });
            console.log("Counsellor assigned successfully");
          }
        } else if (users[0].status === "Active") {
          newData.added_by = users[0].mentor_assigned;
        }
      }
    } else if (
      String(newData.user_type).toLowerCase() !== "new lead" &&
      users.length > 0
    ) {
      newData.user_id = users[0].user_id;
    } else if (
      users.length === 0 &&
      (String(newData.user_type).toLowerCase() === "new lead" ||
        String(newData.user_type).toLowerCase() === "reference")
    ) {
      const { results: country } = await readRecord({
        selectFields: ["*"],
        table: `${tables.countries}`,
        conditions: [
          {
            field: "phonecode",
            operator: "=",
            value: newData.phone_code.replace("+", ""),
          },
        ],
      });

      let source_utm = null;
      if (utm_source) {
        const { results: lead_source } = await readRecord({
          table: `${tables.leadSource}`,
          selectFields: ["*"],
          conditions: [
            { field: "source_name", operator: "=", value: utm_source },
          ],
        });
        source_utm = lead_source[0].source_id;
      }
      console.log(source_utm, 888);

      const columns = [
        "phone_code",
        "phone_number",
        "phone",
        "user_type",
        "primary_lead_source",
        "current_lead_source",
        "first_name",
        "last_name",
        "email_id",
        "counsellor_assigned",
      ];
      const cleanedPhoneCode =
        newData.phone_code?.toString().replace(/\D/g, "") || "";
      const cleanedPhoneNumber =
        newData.phone_number?.toString().replace(/\D/g, "") || "";

      const values = [
        cleanedPhoneCode,
        cleanedPhoneNumber,
        `${cleanedPhoneCode} ${cleanedPhoneNumber}`,
        "0",
        String(newData.user_type).toLowerCase() === "reference"
          ? 23
          : source_utm || newData.source_id || newData.source,
        String(newData.user_type).toLowerCase() === "reference"
          ? 23
          : newData.source_id || newData.source,
        newData.full_name?.split(" ")[0] || "",
        newData.full_name?.split(" ")?.slice(1).join(" ") || "",
        newData.email_id ? newData.email_id : `${cleanedPhoneNumber}@bn.com`,
        newData.added_by,
      ];

      console.log(values, 928);

      if (country.length > 0) {
        columns.push("country_id");
        values.push(country[0].country_id);
      }
      const insertResult = await insertRecord(
        tables.userDetails,
        columns,
        values,
      );
      if (insertResult.affectedRows > 0) {
        newLeadUserId = insertResult.insertId;
      }
      await addSourceLogNew({
        source:
          sources[
            String(newData.user_type).toLocaleLowerCase() === "reference"
              ? 23
              : source_utm || newData.source_id || newData.source
          ],
        id: insertResult.insertId,
      });
      const assignLog = await addLeadAssignLog({
        user_id: insertResult.insertId,
        counsellor_id: newData.added_by,
        assigned_by: newData.added_by,
      });
      console.log(assignLog, 956);
      newData.user_id = insertResult.insertId;
    }

    if (
      req.headers["source"] === "app" &&
      (users[0].counsellor_assigned == null ||
        users[0].counsellor_assigned == "")
    ) {
      const updateResult = await updateRecord(
        tables.userDetails,
        {
          counsellor_assigned: newData.added_by,
        },
        {
          user_id: users[0].user_id,
        },
      );

      if (updateResult.affectedRows > 0) {
        const assignLog = await addLeadAssignLog({
          user_id: users[0].user_id,
          counsellor_id: newData.added_by,
          assigned_by: newData.added_by,
        });
        console.log("Counsellor assigned successfully");
      }
    }

    const columns = [
      "user_id",
      newData.sub_order_id ? "sub_order_id" : null,
      "call_type",
      "slot_id",
      "added_by",
      "schedule_date",
      "user_type",
      "source",
    ].filter(Boolean);
    const values = [
      newData.user_id,
      newData.sub_order_id || null,
      String(newData.call_type),
      newData.slot_id,
      newData.added_by,
      newData.schedule_date,
      users[0]?.status === "Lead"
        ? "Lead"
        : users[0]?.status === "Active"
          ? "Active"
          : users[0]?.status === "OC"
            ? "Completed"
            : String(newData.user_type).toLowerCase() === "reference" ||
                String(newData.user_type).toLowerCase() === "new lead"
              ? "Lead"
              : "Other",
      source?.toLowerCase().includes("db")
        ? "DB"
        : source?.toLowerCase() === "app"
          ? "APP"
          : "WEB",
    ].filter(Boolean);

    const insertResult = await insertRecord(
      tables.callUpdates,
      columns,
      values,
    );
    const { results: slotTimeRange } = await readRecord({
      selectFields: ["*"],
      table: `${tables.slots}`,
      conditions: [{ field: "id", operator: "=", value: newData.slot_id }],
    });
    console.log(slotTimeRange, 796);
    const startTime = slotTimeRange[0]?.appointment_slots?.split("-")[0];
    const endTime = slotTimeRange[0]?.appointment_slots?.split("-")[1];
    const appointmentType = callTypes[parseInt(newData.call_type)];

    const { results: adminDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: [
        "ad.email_id",
        "CONCAT(ad.first_name,' ',ad.last_name) as full_name",
        "designation",
        "official_phone",
        "ad.active",
        "ad.oc",
        "ad.lead",
      ],
      conditions: [
        {
          field: "ad.admin_user_id",
          operator: "=",
          value: newData.added_by,
        },
      ],
    });
    console.log(adminDetails, 820);
    console.log(users[0], 655);
    const mailBody = {
      callType: appointmentType,
      scheduledDate: moment(newData.schedule_date).format("DD/MM/YYYY"),
      consultTime: startTime,
      counsellorName: `${adminDetails[0].designation} ${adminDetails[0].full_name}`,
      counsellorPhone: adminDetails[0].official_phone,
      userName: newData.full_name || users[0]?.full_name, // Add the userName here
      userTel: newData.phone_number || users[0]?.phone_number, // Add the userTel here,
      year: moment(newData.schedule_date).format("YYYY"),
    };

    let emailRecipient = newData.email_id || users[0]?.email_id;
    // console.log(__dirname, 666);
    // Send email to
    // return false;
    const mailData = {
      from: `No Reply - Balance Nutrition <support@balancenutrition.in>`,
      to: emailRecipient,
      subject: "Consultation Call Successfully Scheduled",
      html: await ejs.renderFile(
        path.join(__dirname, "../../../../../src/mails/callBook.ejs"),
        {
          ...mailBody,
        },
      ),
      cc: [],
    };
    console.log(adminDetails[0], 839);
    if (newData.call_type == "30") {
      if (
        String(newData.user_type).toLowerCase() === "new lead" ||
        users[0]?.status === "Lead" ||
        String(newData.user_type).toLowerCase() === "reference"
      ) {
        const { call } = await safeJSONParse(adminDetails[0].lead);
        mailData.cc = call.cc;
        mailData.bcc = call.bcc;
      } else if (users[0]?.status === "Active") {
        const { call } = await safeJSONParse(adminDetails[0].active);
        mailData.cc = call.cc;
        mailData.bcc = call.bcc;
      } else {
        const { call } = await safeJSONParse(adminDetails[0].oc);
        mailData.cc = call.cc;
        mailData.bcc = call.bcc;
      }
    }
    console.log(mailData, 970);
    mailData.cc.push(adminDetails[0].email_id);
    console.log(mailData, 841);
    console.log(mailBody, 857);
    if (mailBody.userName && mailBody.userTel && newData.call_type == "30") {
      console.log(mailBody, 857);
      const mail = await sendMailUtil(mailData);
      console.log(mail);
      // const watiResponse = await axios.post(
      //   `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${users[0].phone_code.replace(
      //     /^\+/,
      //     ""
      //   )}${users[0].phone_number}`,
      //   {
      //     template_name: "consultation_call_booked_successfully",
      //     broadcast_name: "consultation_call_booked_successfully",
      //     parameters: [
      //       {
      //         name: "name",
      //         value: mailBody.userName,
      //       },
      //       {
      //         name: "cons_date",
      //         value: moment(newData.schedule_date).format("Do MMMM YYYY"),
      //       },
      //       {
      //         name: "cons_time",
      //         value: `${startTime} - ${endTime}`,
      //       },
      //       {
      //         name: "cons_designation",
      //         value: `${adminDetails[0].designation}`,
      //       },
      //       {
      //         name: "cons_name",
      //         value: `${adminDetails[0].full_name}`,
      //       },
      //       {
      //         name: "cons_number",
      //         value: `${adminDetails[0].official_phone}`,
      //       },
      //     ],
      //   }
      // );
      // console.log(watiResponse, 721);
    }
    if ([0, 1, 2, 3, 45, 66].includes(Number(newData.call_type))) {
      if (Number(newData.call_type) === 3 || Number(newData.call_type) === 66) {
        const notification_id = 656;
        let results = await readRecord({
          table: `${tables.adminUsers} ad`,
          selectFields: [
            "ad.email_id",
            "ad.admin_user_id",
            "CONCAT(ad.first_name,' ',ad.last_name) as full_name",
            "designation",
            "official_phone",
          ],
          conditions: [
            {
              field: "ad.admin_user_id",
              operator: "=",
              value: newData.added_by,
            },
          ],
        });

        const adminDetails = results.results[0];

        const extraVariables = null;
        console.log(
          notification_id,
          adminDetails,
          adminDetails.admin_user_id,
          adminDetails?.full_name,
          users[0].user_id,
          newData?.full_name,
          users[0]?.full_name,
          startTime,
          1108,
        );
        const sendNotification = await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [newLeadUserId || users[0].user_id],
            notification_id: notification_id,
            sent_via: "server",
            ...(extraVariables && { extraVariables }),
          },
        );
        await clientEnquiry.create({
          mentor_id: users[0]?.mentor_assigned || adminDetails.admin_user_id,
          type: "broadcast",
          sender: "mentor",
          query: `
<p>Hi ${newData?.full_name || users[0]?.full_name},</p>
<br>
<p>Your call with <strong>Client Service</strong> is successfully scheduled</p>
<br>
<p><strong>Here are the details:</strong></p>

<p>Date: ${moment(newData?.schedule_date).format("DD/MM/YYYY")}<br>
Time: ${startTime}</p>
<br>
<p>She will call you on your registered mobile number at the above-mentioned date & time.</p>
`,
          user_id: users[0].user_id,
          name: adminDetails.full_name,
        });

        const data = {
          title: `${
            newData?.full_name || users[0]?.full_name
          } has Booked Introduction Call`,
          description: `Date: ${moment(newData?.schedule_date).format(
            "DD/MM/YYYY",
          )} Time: ${startTime}`,
          priority: 1,
        };

        sendSSEEvent({ mentor_id: adminDetails.admin_user_id, data });
      } else if (req.headers.source !== "app") {
        const sendNotification = axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [newLeadUserId || users[0].user_id],
            notification_id: 254,
            sent_via: "server",
          },
        );
      } else {
        let notification_id = null;
        let extraVariables = null;
        if (Number(newData.call_type) === 0) {
          notification_id = 255;
        } else if (Number(newData.call_type) === 1) {
          notification_id = 256;
        } else if (Number(newData.call_type) === 2) {
          notification_id = 257;
        } else if (Number(newData.call_type) === 45) {
          notification_id = 258;
        } else if (Number(newData.call_type) === 19) {
          notification_id = 269;
          extraVariables = {
            call_type: {
              call_id: insertResult.insertId,
            },
          };
        }
        const sendNotification = axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [newData?.user_id],
            notification_id: notification_id,
            sent_via: "server",
            ...(extraVariables && { extraVariables }),
          },
        );
      }
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "call booked successfully",
      data: insertResult.insertId,
      meta_data: {
        start_time: startTime,
        end_time: endTime,
        appointment_type: appointmentType,
      },
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const suggestProgramToUser = async (req, res, next) => {
  const newData = req.body;
  const source = req.headers["source"];
  try {
    // Extract and remove follow-up-specific fields
    const followUpData = {
      user_id: newData.user_id,
      slot_id: newData.slot_id,
      type: newData.type,
      follow_up_date: newData.follow_up_date,
      added_by: newData.suggested_by,
      assigned_to: newData.suggested_by,
    };

    const isFollowUpRequired =
      followUpData.slot_id && followUpData.type && followUpData.follow_up_date;

    delete newData.slot_id;
    delete newData.type;
    delete newData.follow_up_date;
    let message = "";
    if (newData.payment_mode_id && Number(newData.payment_mode_id) === 1) {
      const [
        { results: userDetails },
        { results: programDetails },
        { results: programsSessionDetails },
        { results: adminDetails },
      ] = await Promise.all([
        readRecord({
          table: `${tables.userDetails} ud`,
          selectFields: [
            "ud.email_id",
            "ud.phone_number",
            "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
          ],
          conditions: [
            {
              field: "ud.user_id",
              operator: "=",
              value: newData.user_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.programsMaster} pm`,
          selectFields: ["pm.program_name"],
          conditions: [
            {
              field: "pm.program_id",
              operator: "=",
              value: newData.program_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.programSession} pm`,
          selectFields: ["pm.program_duration"],
          conditions: [
            {
              field: "pm.program_session_id",
              operator: "=",
              value: newData.program_session_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.adminUsers} ad`,
          selectFields: [
            "ad.first_name as admin_first_name",
            "ad.last_name as admin_last_name",
          ],
          conditions: [
            {
              field: "ad.admin_user_id",
              operator: "=",
              value: newData.suggested_by,
            },
          ],
        }),
      ]);
      const expiryMoment = moment(newData.payment_expiry)
        .utcOffset("+05:30") // shift to IST
        .set({ hour: 23, minute: 55, second: 0, millisecond: 0 });
      const expiryUnix = expiryMoment.unix(); // Unix seconds

      const expiryDateTime = expiryMoment.format("YYYY-MM-DD HH:mm:ss"); // DB-friendly datetime

      const payment_link = await createPaymentLink({
        amount: newData.suggested_amount,
        expire_by: expiryUnix,
        customerDetails: {
          email: userDetails[0].email_id,
          phone: `${userDetails[0].phone_number}`,
        },
        description: `Payment Link For ${userDetails[0].full_name} For ${programDetails[0].program_name} (${programsSessionDetails[0].program_duration}) Program`,
        source: source ? source : "Mentor DB",
        user: userDetails[0].full_name,
        email: userDetails[0].email_id,
        phone: userDetails[0].phone_number,
        created_by: `${adminDetails[0].admin_first_name} ${adminDetails[0].admin_last_name}`,
      });

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
        userDetails[0].email_id,
        userDetails[0].phone_number,
        newData.program_id,
        newData.program_session_id,
        newData.suggested_amount,
        expiryDateTime,
        payment_link.short_url,
        newData.user_id,
        newData.suggested_by,
      ];
      const newPaymentLinkEntry = await insertRecord(
        `${tables.paymentLinks}`,
        newPaymentLinkColumns,
        newPaymentLinkValues,
      );
      newData.payment_link_id = newPaymentLinkEntry.insertId;
      newData.payment_expiry = expiryDateTime;
      const daysLeft = moment(newData.payment_expiry).diff(moment(), "days");

      let displayDays;
      if (daysLeft > 0) {
        displayDays = `in the next ${daysLeft} Days`;
      } else if (daysLeft === 0) {
        displayDays = "Today";
      } else {
        displayDays = ""; // or "Expired" if you want to show past due
      }
      message = `<span>Hi ${
        userDetails[0].full_name
      },<br> PFA your payment link for <b>${programDetails[0].program_name} (${
        programsSessionDetails[0].program_duration
      }) program</b> for Amount <b>Rs.${
        newData.suggested_amount
      }</b> <br> Click here: <a href="${payment_link.short_url}">${
        payment_link.short_url
      }</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
        newData.payment_expiry,
      ).format(
        "Do MMMM YYYY",
      )} which ${displayDays}. Please ensure you use it before that. <br/>${
        newData?.free_hamper != "No"
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br><br> P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
        newData.suggested_amount
      }">Click here</a></span>`;
    }
    const { results: paymentModeDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.paymentModes} pm`,
      conditions: [
        {
          field: "pm.payment_mode_id",
          operator: "=",
          value: newData.payment_mode_id,
        },
      ],
    });
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "ud.phone_number",
        "CONCAT(COALESCE(ud.first_name, ''), ' ', COALESCE(ud.last_name, '')) as full_name",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: newData.user_id,
        },
      ],
    });
    const { results: programDetails } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: ["pm.program_name"],
      conditions: [
        {
          field: "pm.program_id",
          operator: "=",
          value: newData.program_id,
        },
      ],
    });
    const { results: programsSessionDetails } = await readRecord({
      table: `${tables.programSession} ps`,
      selectFields: ["ps.program_duration"],
      conditions: [
        {
          field: "ps.program_session_id",
          operator: "=",
          value: newData.program_session_id,
        },
      ],
    });
    if (Number(newData.payment_mode_id) == 3) {
      message = `<span>PFA the Bank Account Details for the payment of ${
        newData.suggested_amount
      } for ${programDetails[0].program_name} (${
        programsSessionDetails[0].program_duration
      }) program.<br> ${paymentModeDetails[0].payment_mode_details} <br/>${
        newData?.free_hamper !== "No" && newData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
    } else if (Number(newData.payment_mode_id) == 2) {
      message = `<span>Hi ${
        userDetails[0].full_name
      }, <br> PFA the UPI details for the Amount of ${
        newData.suggested_amount
      } for ${programDetails[0].program_name} (${
        programsSessionDetails[0].program_duration
      }) program. <br> ${paymentModeDetails[0].payment_mode_details} <br/>${
        newData?.free_hamper !== "No" && newData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once the transfer is done and share a screenshot of the transaction details.</span>`;
    } else if (Number(newData.payment_mode_id) == 4) {
      message = `<span>Hi ${
        userDetails[0].full_name
      },<br> Cash Collection for the amount of Rs. ${
        newData.suggested_amount
      } for ${programDetails[0].program_name} (${
        programsSessionDetails[0].program_duration
      }). <br> Date: ${moment(newData.payment_expiry).format(
        "Do MMMM YYYY",
      )} <br> Contact Person: Abdul Shaikh (919158267868) <br/>${
        newData?.free_hamper !== "No" && newData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
    }

    if (newData.payment_mode_id) {
      const chat = await clientEnquiry.create({
        user_id: newData.user_id,
        name: userDetails[0].full_name,
        query: message,
        mentor_id: newData.suggested_by,
        sender: "mentor",
        type: "reminder",
      });
      console.log(chat, 799);
    }

    const columns = Object.keys(newData);
    const values = Object.values(newData);
    console.log(columns, values, 804);
    // Insert suggested program
    const insertResult = await insertRecord(
      tables.suggestedProgram,
      columns,
      values,
    );

    if (insertResult.affectedRows === 1) {
      // Update user details
      const updatedData = { suggested_program_id: insertResult.insertId };
      const updateResult = await updateRecord(tables.userDetails, updatedData, {
        user_id: newData.user_id,
      });

      console.log(updateResult, "user details updated result");

      // Initialize response object
      const response = {
        suggestedProgram: {
          success: true,
          programId: insertResult.insertId,
        },
      };

      // Add follow-up only if required fields are present
      if (isFollowUpRequired) {
        const followUpResult = await addFollowUpUtil(followUpData);
        console.log(followUpResult, "add follow-up result");
        response.followUp = followUpResult
          ? {
              success: followUpResult.followUpAdded,
              followUpId: followUpResult.followUpId || null,
              callBooked: followUpResult.callBooked || false,
              callId: followUpResult.callId || null,
              error: followUpResult.error || null,
            }
          : {
              success: false,
              error: "Unexpected error while adding follow-up",
            };
      }

      // Add user details update result to response
      if (!updateResult || !updateResult.info) {
        response.userDetailsUpdate =
          "Unexpected error during user details update";
      } else if (updateResult.info.includes("Rows matched: 0")) {
        response.userDetailsUpdate = "No user found with the given user_id";
      } else if (updateResult.info.includes("Rows matched: 1  Changed: 0")) {
        response.userDetailsUpdate =
          "Program suggested to user, but no changes were made";
      } else if (updateResult.info.includes("Rows matched: 1  Changed: 1")) {
        response.userDetailsUpdate =
          "Program suggested to user and user details updated";
      } else {
        response.userDetailsUpdate = "Error updating user details";
      }

      // Send consolidated response
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Program suggested to user with additional follow-up details",
        data: response,
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error while suggesting program", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateCallDetails = async (req, res, next) => {
  const callId = req.params.callId;
  if (!callId) {
    return next(new ErrorHandler("Call ID is required", 400));
  }
  const updatedData = req.body;
  if (Object.keys(updatedData).length === 0) {
    return next(new ErrorHandler("No data to update", 400));
  }
  if (updatedData.call_insights) {
    updatedData.call_insights = JSON.stringify(updatedData.call_insights);
  }
  try {
    const updateResult = await updateRecord(tables.callUpdates, updatedData, {
      call_id: parseInt(callId),
    });
    if (updateResult.info.substr(0, 15) === "Rows matched: 0") {
      return next(new ErrorHandler("No call found with the given id", 400));
    }
    if (updateResult.info.substr(0, 27) === "Rows matched: 1  Changed: 0") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Nothing to update",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "call details updated successfully",
    });

    // return false;
    if (updatedData.call_type == "30") {
      const newConsultaionData = await insertRecord(
        tables.consultationLogs,
        ["user_id", "key_insights", "consultation_by"],
        [updatedData.user_id, updatedData.call_insights, updatedData.added_by],
      );
      console.log(newConsultaionData, 161);
    }
    const userKeyInsight = await insertRecord(
      tables.userKeyInsight,
      ["user_id", "key_insight", "added_by", "call_id"],
      [
        updatedData.user_id,
        updatedData.call_insights,
        updatedData.added_by,
        callId,
      ],
    );
    console.log(userKeyInsight, 167);
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const myFollowUpsToday = async (req, res, next) => {
  const id = req.params.id;
  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    const conditions = [
      { field: "assigned_to", operator: "=", value: parseInt(id) },
      {
        field: "follow_up_date",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      },
    ];

    const fetchLeadToCapture = readRecord({
      table: tables.userDetails,
      selectFields: [
        "COUNT(*) as lead_to_capture_today",
        "CONCAT('[', GROUP_CONCAT(DISTINCT user_id), ']') as lead_to_capture_ids",
      ],
      conditions: [
        { field: "user_type", operator: "=", value: "0" },
        {
          field: "counsellor_assigned",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
      ],
    });

    const fetchFollowUpsToday = readRecord({
      table: tables.leadFollowUpLogs,
      selectFields: [
        "COUNT(*) as fu_count_today",
        "CONCAT('[', GROUP_CONCAT(DISTINCT user_id), ']') as my_follow_ids",
      ],
      conditions,
    });

    const fetchTodaysCallBooking = readRecord({
      table: tables.callUpdates,
      selectFields: [
        "COUNT(*) as call_booking_today",
        "CONCAT('[', GROUP_CONCAT(DISTINCT user_id), ']') as call_booking_today_ids",
      ],
      conditions: [
        { field: "added_by", operator: "=", value: parseInt(id) },
        {
          field: "schedule_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });

    const fetchLeadAssignedToday = readRecord({
      table: tables.leadAssignedLog,
      selectFields: [
        "COUNT(*) as lead_assigned_today",
        "CONCAT('[', GROUP_CONCAT(DISTINCT user_id), ']') as lead_assigned_today_ids",
      ],
      conditions: [
        { field: "new_counsellor_id", operator: "=", value: parseInt(id) },
        {
          field: "assign_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });

    const [
      { results: leadToCapture },
      { results: myFollowUpsToday },
      { results: todaysCallBooking },
      { results: leadAssignedToday },
    ] = await Promise.all([
      fetchLeadToCapture,
      fetchFollowUpsToday,
      fetchTodaysCallBooking,
      fetchLeadAssignedToday,
    ]);

    const result = {
      lead_to_capture_today: {
        count: leadToCapture[0].lead_to_capture_today,
        ids: JSON.parse(leadToCapture[0].lead_to_capture_ids) ?? [],
      },
      fu_count_today: {
        count: myFollowUpsToday[0].fu_count_today,
        ids: JSON.parse(myFollowUpsToday[0].my_follow_ids) ?? [],
      },
      call_booking_today: {
        count: todaysCallBooking[0].call_booking_today,
        ids: JSON.parse(todaysCallBooking[0].call_booking_today_ids) ?? [],
      },
      lead_assigned_today: {
        count: leadAssignedToday[0].lead_assigned_today,
        ids: JSON.parse(leadAssignedToday[0].lead_assigned_today_ids) ?? [],
      },
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Follow ups fetched successfully",
      data: result,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const overdueAndMisses = async (req, res, next) => {
  const id = parseInt(req.params.id);

  try {
    // Parallel execution of database queries using Promise.all
    const [
      { results: callsMissed },
      { results: followMissed },
      { results: noFollowUp },
    ] = await Promise.all([
      readRecord({
        table: tables.callUpdates,
        selectFields: [
          "COUNT(*) as calls_missed",
          "CONCAT('[', GROUP_CONCAT(DISTINCT user_id), ']') as all_call_update_ids",
        ],
        conditions: [
          { field: "added_by", operator: "=", value: id },
          {
            field: "schedule_date",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "call_status", operator: "=", value: "0" },
        ],
      }),

      readRecord({
        table: tables.leadFollowUpLogs,
        selectFields: [
          "COUNT(*) as follow_missed",
          "CONCAT('[', GROUP_CONCAT(DISTINCT user_id), ']') as all_follow_up_missed",
        ],
        conditions: [
          { field: "assigned_to", operator: "=", value: id },
          {
            field: "CONCAT(follow_up_date, ' ', follow_up_time)",
            operator: "<",
            value: "NOW() + INTERVAL 5 HOUR + INTERVAL 30 MINUTE",
            raw: true,
          },
          { field: "follow_up_status", operator: "=", value: "0" },
        ],
      }),

      readRecord({
        table: `${tables.userDetails} u`,
        selectFields: [
          "COUNT(*) AS program_suggested_no_fu_set",
          "CONCAT('[', GROUP_CONCAT(DISTINCT u.user_id), ']') as no_follow_up_set",
        ],
        conditions: [
          { field: "user_type", operator: "=", value: "0" },
          {
            field: "suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "f.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} f`,
            on: "u.user_id=f.user_id",
          },
        ],
      }),
    ]);

    // Constructing the result object
    const result = {
      calls_missed: {
        count: callsMissed[0].calls_missed,
        ids: JSON.parse(callsMissed[0].all_call_update_ids) ?? [],
      },
      follow_missed: {
        count: followMissed[0].follow_missed,
        ids: JSON.parse(followMissed[0].all_follow_up_missed) ?? [],
      },
      program_suggested_no_fu_set: {
        count: noFollowUp[0].program_suggested_no_fu_set,
        ids: JSON.parse(noFollowUp[0].no_follow_up_set) ?? [],
      },
    };

    // API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Counts fetched successfully",
      data: result,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const totalsSalesOpportunity = async (req, res, next) => {
  try {
    // Define the array of promises
    const promises = [
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["COUNT(*) as rate_shared"],
        conditions: [
          { field: "ud.user_type", operator: "=", value: "0" },
          {
            field: "sp.suggested_amount",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "ud.suggested_program_id=sp.suggested_program_id",
          },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["COUNT(*) as payment_details_shared"],
        conditions: [
          { field: "ud.user_type", operator: "=", value: "0" },
          {
            field: "sp.payment_link",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "ud.suggested_program_id=sp.suggested_program_id",
          },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["COUNT(*) as stage3_lead"],
        conditions: [
          { field: "ud.stage", operator: "=", value: "3" },
          { field: "ud.user_type", operator: "=", value: "0" },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["COUNT(*) as stage4_lead"],
        conditions: [
          { field: "ud.stage", operator: "=", value: "4" },
          { field: "ud.user_type", operator: "=", value: "0" },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["COUNT(*) as client_weighth_seventy_plus"],
        conditions: [
          { field: "ud.user_type", operator: "=", value: "1" },
          { field: "latest_weight", operator: ">", value: "70" },
        ],
      }),
      dietDetails
        .find({
          sub_order_id: { $in: [2, 5] },
        })
        .sort({ diet_start_date: 1 }),
    ];

    // Execute all promises in parallel
    const [
      { results: rateShared },
      { results: paymentDetailsShared },
      { results: stage3Lead },
      { results: stage4Lead },
      { results: clientWeighthSeventyPlus },
      { results: dummy },
    ] = await Promise.all(promises);

    // Log the dummy data if needed
    console.log(dummy, 411);

    // Prepare the result
    const result = {
      rate_shared: rateShared[0].rate_shared,
      payment_details_shared: paymentDetailsShared[0].payment_details_shared,
      stage3_lead: stage3Lead[0].stage3_lead,
      stage4_lead: stage4Lead[0].stage4_lead,
      client_weighth_seventy_plus:
        clientWeighthSeventyPlus[0].client_weighth_seventy_plus,
    };

    // Send the API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "successfully fetched",
      data: result,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const activitesDone = async (req, res, next) => {
  try {
    const selectFields = [
      "COUNT (CASE WHEN stage = 1 THEN 1 END ) as stage_1_count",
      "COUNT (CASE WHEN stage = 2 THEN 1 END ) as stage_2_count",
      "COUNT (CASE WHEN stage = 3 THEN 1 END ) as stage_3_count",
      "COUNT (CASE WHEN stage = 4 THEN 1 END ) as stage_4_count",
      "COUNT (CASE WHEN current_phase = 1 THEN 1 END ) as phase_1_count",
      "COUNT (CASE WHEN current_phase = 2 THEN 1 END ) as phase_2_count",
      "COUNT (CASE WHEN current_phase = 3 THEN 1 END ) as phase_3_count",
      "COUNT (CASE WHEN current_phase = 4 THEN 1 END ) as phase_4_count",
      "COUNT (CASE WHEN sales_status ='0' THEN 1 END ) as to_engage_count",
      "COUNT (CASE WHEN sales_status ='1' THEN 1 END ) as hot_count",
      "COUNT (CASE WHEN sales_status ='2' THEN 1 END ) as warm_count",
      "COUNT (CASE WHEN sales_status ='3' THEN 1 END ) as cold_count",
    ];
    const { results: allCounts } = await readRecord({
      table: tables.userDetails,
      selectFields,
      conditions: [{ field: "user_type", operator: "=", value: "0" }],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Activities Done fetched successfully",
      data: allCounts[0],
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const assignMentor = async (req, res, next) => {
  try {
    const { mentor_id, user_id, is_com, old_mentor_id } = req.body;
    const condition = { user_id: parseInt(user_id) };
    const rows = await updateRecord(
      `${tables.userDetails}`,
      {
        mentor_assigned: mentor_id,
      },
      condition,
    );

    if (rows.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No user or membor found with the given id", 400),
      );
    } else if (rows.info.substring(0, 27) == "Rows matched: 1  Changed: 0") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Same Mentor is Already Assigned",
      });
      return res.status(200).json(apiResponse);
    }
    const insertedResult = await insertRecord(
      tables.changeOfMentor,
      ["user_id", "old_mentor", "new_mentor"],
      [user_id, old_mentor_id ? old_mentor_id : "0", mentor_id],
    );
    if (is_com) {
      const sendNotification = await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: 6,
          sent_via: req.headers["source"],
        },
      );
      // console.log(sendNotification, 1501);
    }
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.first_name", "ud.last_name"],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: Number(user_id),
        },
      ],
    });
    const data = {
      title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Been Assigned`,
      priority: 1,
      redirect: "?modal=new-assigned",
    };
    const insertedResultNotification = await insertRecord(
      tables.mentorNotifications,
      ["user_id", "admin_id", "content", "redirect"],
      [user_id, mentor_id, data.title, "/new-assigned"],
    );
    if (insertedResultNotification.affectedRows === 0) {
      return next(
        new ErrorHandler("Error While Inserting Mentor Notifications", 400),
      );
    }
    sendSSEEvent({ mentor_id: mentor_id, data });

    return res.status(200).json({
      success: true,
      message: "Mentor assigned successfully",
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentor = async (req, res, next) => {
  const { id } = req.query;
  try {
    const conditions = [
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
    ];
    if (id) {
      conditions.push({
        field: "ad.admin_user_id",
        operator: "=",
        value: id,
      });
    }
    const { results, totalCount } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: [
        "ad.crm_user as crm_user",
        "CONCAT(ad.first_name,' ',ad.last_name) as full_name",
        "CONCAT('+91',' ',ad.official_phone) as official_phone",
        "ad.total_clients	",
        "ad.total_experience",
        "ad.expertise",
        "ad.education",
        "ad.designation",
        "ad.photo",
      ],
      conditions,
      countTotal: true,
      groupBy: ["ad.crm_user"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Mentors fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addNewAdminUser = async (req, res, next) => {
  try {
    const {
      first_name,
      last_name,
      gender,
      email_id,
      personal_email,
      password,
      official_phone,
      personal_phone,
      emergency_phone,
      team_id,
      department_id,
      organization_id,
      role_id,
      expertise,
      total_experience,
      address,
      country,
      state,
      city,
      ethnicity,
      education,
      languages_known,
      designation,
      joining_date,
      signature,
      available_for_consultation,
      sequence,
      is_active,
      is_currently_working,
      total_clients,
    } = req.body;

    const photo = req.file;
    let url;
    if (photo) {
      url = await uploadArrayOfFilesToCloudinary([photo]);
    }
    console.log(url[0].file.path);

    const columns = [
      "first_name",
      "last_name",
      "gender",
      "email_id",
      personal_email ? "p_email_id" : null,
      "enc_password",
      "official_phone",
      personal_phone ? "personal_phone" : null,
      emergency_phone ? "emergency_phone" : null,
      team_id ? "team_id" : null,
      "role_id",
      "expertise",
      "department_id",
      "organization_id",
      total_experience ? "total_experience" : null,
      address ? "address" : null,
      "country",
      "state",
      "city",
      ethnicity ? "ethnicity" : null,
      education ? "education" : null,
      "languages_known",
      "designation",
      "joining_date",
      photo ? "photo" : null,
      signature ? "signature_name" : null,
      "available_for_consultation",
      "sequence",
      "is_active",
      "is_currently_working",
      "total_clients",
    ].filter(Boolean);
    const values = [
      first_name,
      last_name,
      gender,
      email_id,
      personal_email ? personal_email : null,
      md5(password),
      official_phone,
      personal_phone ? personal_phone : null,
      emergency_phone ? emergency_phone : null,
      team_id ? team_id : null,
      role_id,
      expertise ? expertise : null,
      department_id,
      organization_id,
      total_experience ? moment(total_experience).format("YYYY-MM-DD") : null,
      address ? address : null,
      country,
      state,
      city,
      ethnicity ? ethnicity : null,
      education ? education : null,
      languages_known ? languages_known : null,
      designation,
      moment(joining_date).format("YYYY-MM-DD"),
      photo ? JSON.stringify(url) : null,
      signature,
      available_for_consultation,
      sequence,
      is_active,
      is_currently_working,
      total_clients,
    ].filter(Boolean);
    const results = await insertRecord(`${tables.adminUsers}`, columns, values);
    if (results.affectedRows === 0) {
      return next(new ErrorHandler("Error While adding new admin user", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "New admin user added successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
//edit admin user
const editAdminUser = async (req, res, next) => {
  try {
    const {
      admin_user_id, // required to identify the user
      first_name,
      last_name,
      gender,
      email_id,
      personal_email,
      password,
      official_phone,
      personal_phone,
      emergency_phone,
      team_id,
      role_id,
      expertise,
      department_id,
      organization_id,
      total_experience,
      address,
      country,
      state,
      city,
      ethnicity,
      education,
      languages_known,
      designation,
      joining_date,
      available_for_consultation,
      sequence,
      is_active,
      is_currently_working,
      signature,
      total_clients,
    } = req.body;

    if (!admin_user_id) {
      return next(new ErrorHandler("admin_user_id is required", 400));
    }

    const photo = req.file;
    let url;
    if (photo) {
      url = await uploadArrayOfFilesToCloudinary([photo]);
    }
    console.log(url, 2158);
    // return;
    const updateObj = {};
    if (first_name) updateObj.first_name = first_name;
    if (last_name) updateObj.last_name = last_name;
    if (gender) updateObj.gender = gender;
    if (email_id) updateObj.email_id = email_id;
    if (personal_email) updateObj.p_email_id = personal_email;
    if (password) updateObj.enc_password = md5(password);
    if (official_phone) updateObj.official_phone = official_phone;
    if (personal_phone) updateObj.personal_phone = personal_phone;
    if (emergency_phone) updateObj.emergency_phone = emergency_phone;
    if (team_id) updateObj.team_id = team_id;
    if (organization_id) updateObj.organization_id = organization_id;
    if (department_id) updateObj.department_id = department_id;
    if (role_id) updateObj.role_id = role_id;
    if (total_experience)
      updateObj.total_experience =
        moment(total_experience).format("YYYY-MM-DD");
    if (address) updateObj.address = address;
    if (country) updateObj.country = country;
    if (expertise) updateObj.expertise = expertise;
    if (state) updateObj.state = state;
    if (city) updateObj.city = city;
    if (total_clients) updateObj.total_clients = total_clients;
    if (ethnicity) updateObj.ethnicity = ethnicity;
    if (education) updateObj.education = education;
    if (languages_known) updateObj.languages_known = languages_known;
    if (designation) updateObj.designation = designation;
    if (joining_date)
      updateObj.joining_date = moment(joining_date).format("YYYY-MM-DD");
    if (signature) updateObj.signature_name = signature;
    if (photo) updateObj.photo = JSON.stringify(url);
    if (available_for_consultation)
      updateObj.available_for_consultation = available_for_consultation;
    if (sequence) updateObj.sequence = sequence;
    if (is_active) updateObj.is_active = is_active;
    if (is_currently_working)
      updateObj.is_currently_working = is_currently_working;

    const results = await updateRecord(`${tables.adminUsers}`, updateObj, {
      admin_user_id,
    });

    if (results.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating admin user", 400));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Admin user updated successfully",
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllRoles = async (req, res, next) => {
  try {
    const selectFields = ["r.role_id", "r.name"];
    const { results } = await readRecord({
      table: `${tables.roles} r`,
      selectFields,
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Roles fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeAdminStatus = async (req, res, next) => {
  try {
    const { admin_id, status } = req.body;
    const updatedStatus = await updateRecord(
      `${tables.adminUsers}`,
      { is_active: status },
      { admin_user_id: Number(admin_id) },
    );
    if (updatedStatus.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update admin status", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Admin status updated successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getBirthdayClients = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    // Ensure admin_id is provided
    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "ud.birth_date",
      "ud.my_wallet",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id",
      "sp.program_session_id as suggested_program_session_id",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions: [
        {
          field: "DATE_FORMAT(ud.birth_date, '%d-%m')", // Format to match only day and month
          operator: "=",
          value: moment().format("DD-MM"), // Get today's date (day and month)
        },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: admin_id,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id  = sop.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sp.program_session_id =  ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} spm`,
          on: "sp.program_id = spm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: "aspd.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.order_id  = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} paym`,
          on: "od.payment_mode  = paym.payment_mode_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} sp_paym`,
          on: "sp.payment_mode_id  = sp_paym.payment_mode_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} sp_pl`,
          on: "sp.payment_link_id= sp_pl.id",
        },
      ],
    });

    // Map results to structured data
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight),
      ).toFixed(2);
      return {
        user_details: {
          user_id: i.user_id,
          user_name: i.client_name,
          user_email: i.email_id,
          user_phone: i.phone,
          program_number: i.program_count,
          user_sub_user_status: i.sub_user_status,
          client_whatsapp_text: `Hi ${i.client_name}

Here is to wishing our star client a very happy birthday not just from me but the entire BN Team :)

What about the diet today? You cannot have cake without sending me some! 
P.S. Dont forget the 2-BITE rule pleaseee!!! 
Have 2 bites of any 2 favorite cheat bits that are not there in the Restaurant guide :)

I am also sharing a link with you which is an offer applicable to all our clients & their friends for the next 48 hours. 
Feel free to ping me in case you wish to use it. Take a look: www.balancenutrition.in/birthday-offer

Regards,
Team`,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used,
          ),

          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_program_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD MMM YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
                ? "Medium"
                : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
                ? "HOT"
                : Number(i.suggested_sale_status) === 2
                  ? "WARM"
                  : "COLD",
        },
        weight_details: {
          start_program_weight: Number(i.start_program_weight),
          latest_weight: Number(i.latest_weight),

          ...(Number(weightDifference) > 0
            ? {
                lost_weight: Number(weightDifference),
              }
            : { gained_weight: Number(weightDifference) }),
          goal_weight: Number(i.goal_weight),
          height: i.client_height,
        },
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Birthday Clients Fetched Successfully",
      data,
      meta_data: [
        "client_whatsapp_text",
        "user_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);

    return next(new ErrorHandler("Failed to fetch birthday clients", 500));
  }
};

const bulkAssignOC = async (req, res, next) => {
  try {
    const { sub_user_status, assign_from, assign_to } = req.body;
    const { results: user_ids } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      conditions: [
        {
          field: "ud.sub_user_status",
          operator: sub_user_status.length > 1 ? "IN" : "=",
          value:
            sub_user_status.length > 1 ? sub_user_status : sub_user_status[0],
        },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: assign_from,
        },
      ],
    });
    if (user_ids.length === 0) {
      return next(new ErrorHandler("No Users Found", 404));
    }
    user_ids.forEach(async (i) => {
      const updateRecordResult = await updateRecord(
        `${tables.userDetails}`,
        {
          mentor_assigned: assign_to,
        },
        {
          user_id: i.user_id,
        },
      );
      if (updateRecordResult.affectedRows === 0) {
        return next(new ErrorHandler("Error While Updating Record", 400));
      }
      const columns = ["user_id", "old_mentor", "new_mentor", "added_date"];
      const values = [
        i.user_id,
        assign_from,
        assign_to,
        moment().format("YYYY-MM-DD HH:mm:ss"),
      ];
      const insertedResult = await insertRecord(
        `${tables.changeOfMentor}`,
        columns,
        values,
      );
      if (insertedResult.affectedRows === 0) {
        return next(
          new ErrorHandler(
            "Error While Inserting Change Of Mentor Record",
            400,
          ),
        );
      }
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Oc Assigned Successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to bulk assign OC", 500));
  }
};

const bulkAssignLead = async (req, res, next) => {
  try {
    const { sales_status, assign_from, assign_to, from_date, to_date } =
      req.body;
    const { results: user_ids } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      conditions: [
        {
          field: "ud.sales_status",
          operator: sales_status.length > 1 ? "IN" : "=",
          value: sales_status.length > 1 ? sales_status : sales_status[0],
        },
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: parseInt(assign_from),
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        },
        {
          field: "ud.added_date",
          operator: "BETWEEN",
          value: [
            moment(from_date).format("YYYY-MM-DD"),
            moment(to_date).format("YYYY-MM-DD"),
          ],
        },
      ],
    });
    if (user_ids.length === 0) {
      return next(new ErrorHandler("No Users Found", 404));
    }
    user_ids.forEach(async (i) => {
      const updateRecordResult = await updateRecord(
        `${tables.userDetails}`,
        {
          counsellor_assigned: assign_to,
        },
        {
          user_id: i.user_id,
        },
      );
      if (updateRecordResult.affectedRows === 0) {
        return next(new ErrorHandler("Error While Updating Record", 400));
      }
      const columns = [
        "user_id",
        "counsellor_id",
        "assigned_by",
        "assign_date",
      ];
      const values = [
        i.user_id,
        assign_to,
        assign_from,
        moment().format("YYYY-MM-DD HH:mm:ss"),
      ];
      const insertedResult = await insertRecord(
        `${tables.leadAssignedLog}`,
        columns,
        values,
      );
      if (insertedResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Lead Assign Log", 400),
        );
      }
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Lead  Assigned Successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to bulk assign lead", 500));
  }
};

const getFollowUps = async (req, res, next) => {
  try {
    const {
      user_type,
      admin_id,
      filter_data,
      source_type,
      page,
      limit,
      search,
    } = req.query;

    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;

    const conditions = [
      {
        field: "lfl.assigned_to",
        operator: "=",
        value: admin_id,
      },
      {
        field: "lfl.follow_up_status",
        operator: "=",
        value: "0",
        raw: true,
      },

      !filter_data
        ? {
            field: "lfl.follow_up_date",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          }
        : null,
    ].filter(Boolean);

    if (String(source_type).toLowerCase() === "auto") {
      conditions.push({
        field: "lfl.source",
        operator: "IS NOT",
        value: `NULL`,
        raw: true,
      });
    }

    if (String(source_type).toLowerCase() === "mentor") {
      conditions.push({
        field: "lfl.source",
        operator: "IS",
        value: `NULL`,
        raw: true,
      });
    }

    if (String(filter_data).toLowerCase() === "today") {
      conditions.push({
        field: "lfl.follow_up_date",
        operator: "=",
        value: `${moment().format("YYYY-MM-DD")}`,
      });
    }
    if (String(filter_data).toLowerCase() === "tomorrow") {
      conditions.push({
        field: "lfl.follow_up_date",
        operator: "=",
        value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
      });
    }
    if (String(filter_data).toLowerCase() === "future") {
      conditions.push({
        field: "lfl.follow_up_date",
        operator: ">",
        value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
      });
    }
    if (String(filter_data).toLowerCase() === "missed") {
      conditions.push(
        {
          field: "lfl.follow_up_date",
          operator: "<",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "lfl.follow_up_date",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
      );
    }
    if (String(user_type).toLowerCase() === "lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      });
    }
    if (String(user_type).toLowerCase() === "active") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Active",
      });
    }
    if (String(user_type).toLowerCase() === "oc") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
    }
    const { data, total_page } = await dataFunction({
      search,
      page,
      limit,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} lfl`,
          on: "ud.user_id = lfl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "lfl.slot_id = slot.id and lfl.type in (0, '0')",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ab`,
          on: "lfl.added_by = ab.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.whatsappAppSlots} wap_slot`,
          on: "lfl.slot_id = wap_slot.id and lfl.type in ('1','2', 1,2)",
        },
      ],

      extraSelectFields: [
        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN lfl.follow_up_date END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_follow_up_date`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN lfl.follow_up_id END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_follow_up_id`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN lfl.type END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_follow_up_type`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN lfl.source END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_source`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN lfl.campaign END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_campaign`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN ab.crm_user END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_follow_up_assigned_by`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN 
                (CASE WHEN lfl.type IN (0, '0') THEN slot.appointment_slots WHEN lfl.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END)
            END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_appointment_slots`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date < CURDATE() THEN lfl.follow_up_note END
            ORDER BY lfl.follow_up_date DESC
        ), ',', 1) AS prev_follow_up_note`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN lfl.follow_up_date END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_follow_up_date`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN lfl.follow_up_id END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_follow_up_id`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN lfl.type END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_follow_up_type`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN lfl.source END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_source`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN lfl.campaign END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_campaign`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN ab.crm_user END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_follow_up_assigned_by`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN 
                (CASE WHEN lfl.type IN (0, '0') THEN slot.appointment_slots WHEN lfl.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END)
            END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_appointment_slots`,

        `SUBSTRING_INDEX(GROUP_CONCAT(
            CASE WHEN lfl.follow_up_date >= CURDATE() THEN lfl.follow_up_note END
            ORDER BY lfl.follow_up_date ASC
        ), ',', 1) AS next_follow_up_note`,
      ],

      extraObjects: (i) => {
        return {
          follow_up_details: {
            prev_follow_up_date: i.prev_follow_up_date,
            prev_follow_up_id: i.prev_follow_up_id,
            prev_follow_up_type: i.prev_follow_up_type,
            prev_source: i.prev_source,
            prev_campaign: i.prev_campaign,
            prev_follow_up_assigned_by: i.prev_follow_up_assigned_by,
            prev_appointment_slots: i.prev_appointment_slots,
            prev_follow_up_note: i.prev_follow_up_note,
            next_follow_up_date: i.next_follow_up_date,
            next_follow_up_id: i.next_follow_up_id,
            next_follow_up_type: i.next_follow_up_type,
            next_source: i.next_source,
            next_campaign: i.next_campaign,
            next_follow_up_assigned_by: i.next_follow_up_assigned_by,
            next_appointment_slots: i.next_appointment_slots,
            next_follow_up_note: i.next_follow_up_note,
          },
        };
      },
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Follow ups Fetched Successfully",
        data,
        totalCount: total_page,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFollowUpsCountFilterWise = async (req, res, next) => {
  try {
    const { user_type, admin_id, source_type } = req.query;

    const followUpJoins = [
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} lfl`,
        on: "ud.user_id = lfl.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "lfl.slot_id = slot.id and lfl.type in (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ab`,
        on: "lfl.added_by = ab.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "lfl.slot_id = wap_slot.id and lfl.type in ('1','2', 1,2)",
      },
    ];

    const userTypeMap = {
      lead: "Lead",
      active: "Active",
      oc: "Completed",
    };
    const filterConditions = [
      userTypeMap[user_type]
        ? {
            field: "ud.user_status",
            operator: "=",
            value: userTypeMap[user_type],
          }
        : null,
      admin_id
        ? { field: "lfl.assigned_to", operator: "=", value: admin_id }
        : null,
      source_type === "mentor"
        ? { field: "lfl.source", operator: "IS", value: "NULL", raw: true }
        : { field: "lfl.source", operator: "IS NOT", value: "NULL", raw: true },
      // {
      //   field: "lfl.follow_up_date",
      //   operator: "=",
      //   value: `(SELECT MIN(lfl2.follow_up_date)
      //           FROM ${tables.leadFollowUpLogs} lfl2
      //           WHERE lfl2.user_id = ud.user_id
      //             AND lfl2.follow_up_status = 0)`,
      //   raw: true,
      // },

      {
        field: "lfl.follow_up_status",
        operator: "=",
        value: "0",
        raw: true,
      },
    ].filter(Boolean);

    console.log("filterconditions", filterConditions);

    const result = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'all_followups' as type",
        ],
        join: followUpJoins,
        condition: [
          {
            field: "lfl.follow_up_date",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          ...filterConditions,
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'followup_today' as type",
        ],
        join: followUpJoins,
        condition: [
          {
            field: "lfl.follow_up_date",
            operator: "=",
            value: `${moment().format("YYYY-MM-DD")}`,
          },
          ...filterConditions,
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'followup_tomorrow' as type",
        ],
        join: followUpJoins,
        condition: [
          {
            field: "lfl.follow_up_date",
            operator: "=",
            value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
          },
          ...filterConditions,
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'followup_future' as type",
        ],
        join: followUpJoins,
        condition: [
          {
            field: "lfl.follow_up_date",
            operator: ">",
            value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
          },
          ...filterConditions,
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'followup_missed' as type",
        ],
        join: followUpJoins,
        condition: [
          {
            field: "lfl.follow_up_date",
            operator: "<",
            value: `${moment().format("YYYY-MM-DD")}`,
          },
          {
            field: "lfl.follow_up_date",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          ...filterConditions,
        ],
      },
    ]);

    console.log(result, "result");

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Follow ups count Fetched Successfully",
        data: result,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAdminCalls = async (req, res, next) => {
  try {
    const {
      user_status = "Active",
      call_filter,
      page,
      limit,
      search,
      admin_id,
    } = req.query;

    const conditions = [
      {
        field: "cu.call_status",
        operator: "=",
        value: "0",
        raw: true,
      },
    ];
    if (String(user_status).toLowerCase() === "active") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Active",
      });
    }
    if (String(user_status).toLowerCase() === "oc") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
    }
    if (String(user_status).toLowerCase() === "lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      });
    }
    if (String(call_filter).toLowerCase() === "today") {
      conditions.push({
        field: "cu.schedule_date",
        operator: "=",
        value: `${moment().format("YYYY-MM-DD")}`,
      });
    }
    if (String(call_filter).toLowerCase() === "tomorrow") {
      conditions.push({
        field: "cu.schedule_date",
        operator: "=",
        value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
      });
    }
    if (String(call_filter).toLowerCase() === "future") {
      conditions.push({
        field: "cu.schedule_date",
        operator: ">",
        value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
      });
    }
    if (String(call_filter).toLowerCase() === "missed") {
      conditions.push(
        {
          field: "cu.schedule_date",
          operator: "<",
          value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
        },
        {
          field: "cu.schedule_date",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
      );
    }

    if (admin_id) {
      conditions.push({
        field:
          String(user_status).toLowerCase() === "lead"
            ? "ud.counsellor_assigned"
            : "ud.mentor_assigned",
        operator: "=",
        value: admin_id,
      });
    }
    const { data, total_page } = await getFormattedUserData({
      search,
      limit,
      page,
      extraSelectFields: [
        "cu.call_id",
        "cu.call_type",
        "cu.call_status",
        "slot.appointment_slots",
        "cu.schedule_date",
      ],
      extraGroupBy: ["cu.call_id"],
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.callUpdates} cu`,
          on: "ud.user_id = cu.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "cu.slot_id = slot.id",
        },
      ],
      extraConditions: conditions,
      extraObjects: (i) => {
        return {
          call_details: {
            call_id: i.call_id,
            call_type: mapCallType(i.call_type),
            call_status:
              Number(i.call_status) === 0
                ? "Pending"
                : Number(i.call_status) === 1
                  ? "Done"
                  : Number(i.call_status) === 2
                    ? "Cancelled"
                    : Number(i.call_status) === 3
                      ? "Rescheduled"
                      : "Unanswered",
            appointment_slots: i.appointment_slots,
            schedule_date: `${moment(i.schedule_date).format(
              "DD/MM/YYYY",
            )} ${moment(i.schedule_date).fromNow()}`,
          },
        };
      },
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Call details fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "user_id",
        "call_id",
        "suggested_program_id",
        "suggested_program_session_id",
        "sub_order_id",
      ],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDayReviewData = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: leadsAssignedToday } = await readRecord({
      selectFields: [
        "COUNT(*) as leads_assigned_today",
        "COUNT(CASE WHEN cd.current_lead_source IN (6,7,8,9,10,11,12,13,14,15) THEN 1 END ) as social_media",
        "COUNT(CASE WHEN cd.current_lead_source IN (6,11) THEN 1 END ) as instagram",
        "COUNT(CASE WHEN cd.current_lead_source IN (16,17,18,19,20,21) THEN 1  END ) as direct",
        "COUNT(CASE WHEN cd.current_lead_source = 20 THEN 1  END ) as whatsapp",
        "COUNT(CASE WHEN cd.current_lead_source = 16 THEN 1  END ) as phone_enquiry",
        "COUNT(CASE WHEN cd.sales_status = '2' THEN 1  END ) as hot",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: "cd.user_id = lal.user_id",
        },
      ],
      conditions: [
        { field: "lal.counsellor_id", operator: "=", value: id },
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const { results: consultatonDone } = await readRecord({
      selectFields: ["COUNT(*) as consultation_done_today"],
      table: `${tables.consultationLogs} csl`,
      conditions: [
        { field: "csl.consultation_by", operator: "=", value: id },
        {
          field: "DATE(csl.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const { results: followUpDoneToday } = await readRecord({
      selectFields: ["COUNT(DISTINCT(lfl.user_id)) as follow_up_done_today"],
      table: `${tables.leadFollowUpLogs} lfl`,
      conditions: [
        { field: "lfl.assigned_to", operator: "=", value: id },
        {
          field:
            "((DATE(lfl.follow_up_date) = CURDATE() AND lfl.follow_up_status = 1) OR (DATE(lfl.added_date) = CURDATE() AND lfl.follow_up_note != '' AND lfl.follow_up_note IS NOT NULL))",
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    const { results: saleToday } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "       COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: id },
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const { results: balanceToday } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_balance_amount), 0) as balance_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: id },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const { results: fuMissed } = await readRecord({
      table: `${tables.leadFollowUpLogs} lfl`,
      selectFields: ["COUNT(lfl.follow_up_id) as fu_missed"],
      conditions: [
        { field: "lfl.assigned_to", operator: "=", value: id },
        {
          field: "lfl.follow_up_date",
          operator: "=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "lfl.follow_up_time",
          operator: "<=",
          value: `${moment().format("HH:mm:ss")}`,
        },
        {
          field: "lfl.follow_up_status",
          operator: "=",
          value: 0,
        },
      ],
    });

    const { results: consultationMissed } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: ["COUNT(cu.call_id) as consultation_missed"],
      conditions: [
        { field: "cu.call_type", operator: "=", value: "30" },
        {
          field: "cu.schedule_date",
          operator: "=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "cu.slot_id",
          operator: "IN",
          value: Array(14)
            .fill()
            .map((_, i) => i + 1),
        },
        {
          field: "cu.added_by",
          operator: "=",
          value: id,
        },
        {
          field: "cu.call_status",
          operator: "=",
          value: 0,
        },
      ],
    });
    console.log(leadsAssignedToday, 2871);
    const { results: engagementToday } = await readRecord({
      selectFields: ["COUNT(*) as engagement_today"],
      table: `${tables.leadEngagementLogs} lel`,
      conditions: [
        { field: "lel.added_by", operator: "=", value: id },
        {
          field: "lel.engagement_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "lel.engagement_note",
          operator: "NOT IN",
          value: "('')",
          raw: true,
        },
      ],
    });

    const { results: ocSuggestedCount } = await readRecord({
      selectFields: ["COUNT(DISTINCT sp.user_id) as today_oc_suggested"],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = sp.user_id",
        },
      ],
      conditions: [
        { field: "sp.suggested_by", operator: "=", value: id },
        {
          field: "DATE(sp.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "ud.user_status", operator: "=", value: "Completed" },
      ],
    });

    const data = {
      leadsAssignedToday: leadsAssignedToday[0].leads_assigned_today,
      socialMedia: leadsAssignedToday[0].social_media,
      instagram: leadsAssignedToday[0].instagram,
      direct: leadsAssignedToday[0].direct,
      whatsapp: leadsAssignedToday[0].whatsapp,
      phoneEnquiry: leadsAssignedToday[0].phone_enquiry,
      consultationDone: consultatonDone[0].consultation_done_today,
      followUpDone: followUpDoneToday[0].follow_up_done_today,
      hot: leadsAssignedToday[0].hot,
      followUpMissed: 0,
      consultationMissed: consultationMissed[0].consultation_missed,
      engagementDone: engagementToday[0].engagement_today,
      oc_suggested_today: ocSuggestedCount[0].today_oc_suggested || 0,
      sale_today: {
        unit: saleToday[0].count,
        amount: Number(saleToday[0].paid_amount),
      },
      balance_today: {
        unit: balanceToday[0].count,
        amount: Number(balanceToday[0].balance_amount),
      },
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Day Review Data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitDayReview = async (req, res, next) => {
  const { note, other_data, slot, name, mentor_id } = req.body;
  try {
    const columns = [
      "note",
      "other_data",
      "slot",
      "name",
      "added_date",
      "added_time",
      "mentor_id",
    ];
    const values = [
      note,
      other_data,
      slot,
      name,
      moment().format("YYYY-MM-DD"),
      moment().format("YYYY-MM-DD HH:mm:ss"),
      mentor_id,
    ];
    const insertedResult = await insertRecord(
      tables.salesReviewNotes,
      columns,
      values,
    );

    if (insertedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error While Inserting Day Review", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Day Review Added Successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const sendDayPlanner = async (req, res, next) => {
  try {
    const { planner_html, mentor_id, note, email_id } = req.body;

    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        `COUNT(CASE WHEN DATE(cu.added_date) = '${moment()
          .subtract(1, "day")
          .format(
            "YYYY-MM-DD",
          )}' AND cu.call_status != 2  THEN cu.call_id END) as yesterday_calls`,
        `COUNT(CASE WHEN DATE(cu.schedule_date) = '${moment().format(
          "YYYY-MM-DD",
        )}' AND call_status != 2 THEN cu.call_id END) as today_calls`,
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
      ],
    });
    const yesterdayCalls = results[0].yesterday_calls;
    const todayCalls = results[0].today_calls;

    const { results: dueResults } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        `GROUP_CONCAT(CASE WHEN DATE(od.due_date) = '${moment()
          .add(1, "day")
          .format("YYYY-MM-DD")}' 
          THEN CONCAT(ud.email_id, ' (', od.order_balance_amount, ')') 
          END) as tomorrow_due_details`,
        `GROUP_CONCAT(CASE WHEN DATE(od.due_date) = '${moment().format(
          "YYYY-MM-DD",
        )}' 
          THEN CONCAT(ud.email_id, ' (', od.order_balance_amount, ')') 
          END) as today_due_details`,
        `GROUP_CONCAT(CASE WHEN DATE(od.due_date) < '${moment().format(
          "YYYY-MM-DD",
        )}' 
          THEN CONCAT(ud.email_id, ' (', od.order_balance_amount, ')') 
          END) as over_due_details`,
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
        { field: "ud.user_status", operator: "=", value: "Active" },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: `od.user_id = ud.user_id`,
        },
      ],
    });

    const tomorrowDueDetails = dueResults[0].tomorrow_due_details || "";
    const todayDueDetails = dueResults[0].today_due_details || "";
    const overDueDetails = dueResults[0].over_due_details || "";
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/dayplanner.ejs"),
      {
        yesterday_calls: yesterdayCalls,
        today_calls: todayCalls,
        table: planner_html,
        year: moment().format("YYYY"),
        tomorrow_due: tomorrowDueDetails || 0,
        today_due: todayDueDetails || 0,
        over_due: overDueDetails || 0,
        note,
      },
    );

    const { results: mentorDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.cc", "ad.crm_user"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: mentor_id },
      ],
    });
    const mentorCC = safeJSONParse(mentorDetails[0].cc, []);
    await sendMailUtil({
      subject: `Day Planner - ${moment().format("Do MMM, YYYY")}`,
      to:
        process.env.NODE_ENV === "production"
          ? `vishalrupani@balancenutrition.in`
          : `kundan.chaudhary@balancenutrition.in`,
      from:
        process.env.NODE_ENV === "production"
          ? `${mentorDetails[0].crm_user} <${email_id}>`
          : `vikram.gupta@balancenutrition.in`,
      ...(process.env.NODE_ENV === "production" && { cc: mentorCC }),
      bcc: ["testerteam@balancenutrition.in"],
      html: html,
    });
    return res
      .status(200)
      .json(new ApiResponse({ message: "Day Planner Sent Successfully" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendDayPlannerCS = async (req, res, next) => {
  try {
    const { planner_html, admin_user_id, note, email_id } = req.body;

    console.log(
      planner_html,
      admin_user_id,
      note,
      email_id,
      "send-day-planner-0",
    );

    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/dayplannercs.ejs"),
      {
        table: planner_html,
        year: moment().format("YYYY"),
        note,
      },
    );

    const { results: mentorDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.cc", "ad.crm_user"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: admin_user_id },
      ],
    });

    const mentorCC = safeJSONParse(mentorDetails[0].cc, []);
    await sendMailUtil({
      subject: `Day Planner - ${moment().format("Do MMM, YYYY")}`,
      to:
        process.env.NODE_ENV === "production"
          ? `vishalrupani@balancenutrition.in`
          : `kundan.chaudhary@balancenutrition.in`,
      from:
        process.env.NODE_ENV === "production"
          ? `${mentorDetails[0].crm_user} <${email_id}>`
          : `vikram.gupta@balancenutrition.in`,
      ...(process.env.NODE_ENV === "production" && { cc: mentorCC }),
      bcc: ["testerteam@balancenutrition.in"],
      html: html,
      encoding: "utf-8",
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
    // await sendMailUtil({
    //   subject: `Day Planner - ${moment().format("Do MMM, YYYY")}`,
    //   to:"testerteam@balancenutrition.in",
    //   from:["testerteam@balancenutrition.in"],
    //   bcc: ["testerteam@balancenutrition.in"],
    //   html: html,
    // });
    return res
      .status(200)
      .json(new ApiResponse({ message: "Day Planner Sent Successfully" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendDayReviewCS = async (req, res, next) => {
  try {
    const { review_html, admin_user_id, email_id, review_type } = req.body;

    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/firstHalfReview.ejs"),
      {
        review_html,
        year: moment().format("YYYY"),
      },
    );

    const { results: mentorDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.cc", "ad.crm_user"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: admin_user_id },
      ],
    });

    const mentorCC = safeJSONParse(mentorDetails[0].cc, []);
    await sendMailUtil({
      subject: `${review_type} - ${moment().format("Do MMM, YYYY")}`,
      to:
        process.env.NODE_ENV === "production"
          ? `vishalrupani@balancenutrition.in`
          : `kundan.chaudhary@balancenutrition.in`,
      from:
        process.env.NODE_ENV === "production"
          ? `${mentorDetails[0].crm_user} <${email_id}>`
          : `sumedh.pawar@balancenutrition.in`,
      ...(process.env.NODE_ENV === "production" && { cc: mentorCC }),
      bcc: ["testerteam@balancenutrition.in"],
      html: html,
      encoding: "utf-8",
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
    // await sendMailUtil({
    //   subject: `${review_type} - ${moment().format("Do MMM, YYYY")}`,
    //   to:"testerteam@balancenutrition.in",
    //   from:["testerteam@balancenutrition.in"],
    //   bcc: ["testerteam@balancenutrition.in"],
    //   html: html,
    // });
    return res.status(200).json(
      new ApiResponse({
        message: "First Half Review Mail Sent Successfully",
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDayReviewNotesCS = async (req, res, next) => {
  try {
    const { admin_id, slots = [1], date } = req.body;

    console.log(admin_id, slots, date, "get-day-review-notes-cs");

    const formattedDate = moment(date).format("YYYY-MM-DD");

    const { results: dayReviewData } = await readRecord({
      table: `${tables.salesReviewNotes} srn`,
      selectFields: ["srn.slot", "srn.added_date", "srn.note"],
      conditions: [
        { field: "srn.mentor_id", operator: "=", value: admin_id },
        { field: "DATE(srn.added_date)", operator: "=", value: formattedDate },
        { field: "srn.slot", operator: "IN", value: slots },
      ],
    });

    const status = dayReviewData.length > 0 ? "Sent" : "Not Sent";

    const slotsToKeep = [1, 2];
    const resultUnique = slotsToKeep.map((slot) =>
      dayReviewData.find((item) => item.slot === slot),
    );

    console.log(resultUnique, "resultUnique");

    return res
      .status(200)
      .json(new ApiResponse({ data: resultUnique, status }));
  } catch (error) {
    console.error("Internal Server Error", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDayReviewDataCs = async (req, res, next) => {
  try {
    const { admin_id } = req.body;

    const today = moment().format("YYYY-MM-DD");

    const { results: dayReviewData } = await readRecord({
      table: `${tables.salesReviewNotes} srn`,
      selectFields: ["srn.other_data"],
      conditions: [
        { field: "srn.mentor_id", operator: "=", value: admin_id },
        { field: "DATE(srn.added_date)", operator: "=", value: today },
        { field: "srn.slot", operator: "<=", value: 3 },
      ],
      orderBy: ["srn.slot DESC"],
    });

    const comparisonData = dayReviewData?.map((item) => {
      const parsedData = safeJSONParse(item?.other_data);
      const { additionalTask, ...rest } = parsedData;
      return rest;
    });

    console.log(comparisonData, "comparisonData");

    if (dayReviewData.length < 2) {
      return res.status(200).json(new ApiResponse({ data: null }));
    }

    const lastEntry = comparisonData[dayReviewData?.length - 1];
    const firstEntry = comparisonData[0];

    const comparisonResult = compareDataObjects(lastEntry, firstEntry);
    console.log(comparisonResult, "comparisonResult");

    return res.status(200).json(new ApiResponse({ data: comparisonResult }));
  } catch (error) {
    console.error("Internal Server Error", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendReview = async (req, res, next) => {
  try {
    const { review_html, mentor_id, email_id, review_type } = req.body;

    const { results: mentorDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.cc", "ad.crm_user"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: mentor_id },
      ],
    });
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/firstHalfReview.ejs"),
      {
        review_html,
        year: moment().format("YYYY"),
      },
    );
    const mentorCC = safeJSONParse(mentorDetails[0].cc, []);
    await sendMailUtil({
      subject: `${review_type} - ${moment().format("Do MMM, YYYY")}`,
      to:
        process.env.NODE_ENV === "production"
          ? `vishalrupani@balancenutrition.in`
          : `kundan.chaudhary@balancenutrition.in`,
      from:
        process.env.NODE_ENV === "production"
          ? `${mentorDetails[0].crm_user} <${email_id}>`
          : `sumedh.pawar@balancenutrition.in`,
      ...(process.env.NODE_ENV === "production" && { cc: mentorCC }),
      bcc: ["testerteam@balancenutrition.in"],
      html: html,
    });
    return res.status(200).json(
      new ApiResponse({
        message: "First Half Review Mail Sent Successfully",
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAdminDayReviewStatus = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.salesReviewNotes} srn`,
      selectFields: ["srn.slot"],
      conditions: [
        { field: "srn.mentor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(srn.added_date)",
          operator: "=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
      ],
    });

    const slots = results.map((r) => Number(r.slot));

    const data = {
      first_half: slots.includes(1),
      second_half: slots.includes(2),
      day_end: slots.includes(3),
    };

    return res.status(200).json(
      new ApiResponse({
        message: "Day Review Status Fetched Successfully",
        data,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDayEndReviewData = async (req, res, next) => {
  try {
    console.log("Yessss");
    const { mentor_id } = req.query;
    const { results: leadsAssignedToday } = await readRecord({
      selectFields: [
        `COUNT(DISTINCT lal.user_id) AS leads_assigned_today`,
        `COUNT(CASE WHEN cd.current_lead_source IN (6, 11) THEN 1 END) AS instagram`,
        `COUNT(CASE WHEN cd.sales_status = 2 THEN 1 END) AS hot`,
        `COUNT(CASE WHEN cd.sales_status = 0 THEN 1 END) AS to_engage`,
      ],
      table: `${tables.leadAssignedLog} lal`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lal.user_id",
        },
      ],
      conditions: [
        { field: "lal.counsellor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });

    const { results: followUpDoneToday } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN lfl.user_id ELSE NULL END) as leads_fu",
        "COUNT(DISTINCT CASE WHEN cd.user_type = '1' THEN lfl.user_id ELSE NULL END) as oc_fu",
      ],
      table: `${tables.leadFollowUpLogs} lfl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lfl.user_id",
        },
      ],
      conditions: [
        { field: "lfl.assigned_to", operator: "=", value: mentor_id },
        {
          field:
            "((DATE(lfl.follow_up_date) = CURDATE() AND lfl.follow_up_status = 1) OR (DATE(lfl.added_date) = CURDATE() AND lfl.follow_up_note != '' AND lfl.follow_up_note IS NOT NULL))",
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });

    const { results: fuMissedToday } = await readRecord({
      table: `${tables.leadFollowUpLogs} lfl`,
      selectFields: ["COUNT(DISTINCT(lfl.user_id)) as fu_missed"],
      conditions: [
        { field: "lfl.assigned_to", operator: "=", value: mentor_id },
        {
          field: "lfl.follow_up_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "lfl.follow_up_status",
          operator: "=",
          value: 0,
        },
        {
          field: "lfl.user_id",
          operator: "NOT IN",
          value: `(SELECT user_id FROM order_details WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()))`,
          raw: true,
        },
      ],
    });

    const { results: followUpCallsDoneToday } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT(lfl.user_id)) as follow_up_calls_done_today",
      ],
      table: `${tables.leadFollowUpLogs} lfl`,
      conditions: [
        { field: "lfl.assigned_to", operator: "=", value: mentor_id },
        {
          field:
            "((DATE(lfl.follow_up_date) = CURDATE() AND lfl.follow_up_status = 1) OR (DATE(lfl.added_date) = CURDATE() AND lfl.follow_up_note != '' AND lfl.follow_up_note IS NOT NULL))",
          operator: "",
          value: "",
          raw: true,
        },
        { field: "lfl.type", operator: "=", value: "1" },
      ],
    });

    const { results: consultatonDone } = await readRecord({
      selectFields: ["COUNT(*) as consultation_done_today"],
      table: `${tables.consultationLogs} csl`,
      conditions: [
        { field: "csl.consultation_by", operator: "=", value: mentor_id },
        {
          field: "DATE(csl.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const { results: consultationMissed } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: ["COUNT(cu.call_id) as consultation_missed"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id=cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.call_type", operator: "=", value: "30" },
        {
          field: "cu.schedule_date",
          operator: "=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "cu.added_by",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "cu.call_status",
          operator: "=",
          value: 0,
        },
        {
          field: "cd.user_status",
          operator: "!=",
          value: "Active",
        },
      ],
    });
    const { results: saleToday } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const { results: freshLeadSaleToday } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id=od.user_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "DATE(ud.added_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    const { results: ocSaleToday } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "od.order_type", operator: "=", value: "OCR" },
      ],
    });
    console.log(saleToday[0].paid_amount, "today sale");
    console.log(freshLeadSaleToday[0].paid_amount, "fresh lead sale today");
    console.log(ocSaleToday[0].paid_amount, "oc sale today");
    const oldLeadSaleToday = {
      count:
        Number(saleToday[0].count) -
        Number(freshLeadSaleToday[0].count + Number(ocSaleToday[0].count)),
      paid_amount:
        Number(saleToday[0].paid_amount) -
        Number(
          Number(freshLeadSaleToday[0].paid_amount) +
            Number(ocSaleToday[0].paid_amount),
        ),
    };
    console.log(saleToday, 4017);
    console.log(freshLeadSaleToday, 4018);
    console.log(ocSaleToday, 4019);
    console.log(oldLeadSaleToday, 4020);
    const { results: balanceToday } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_balance_amount), 0) as balance_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });

    const { results: totalLeads } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(ud.user_id) as total_leads"],
      conditions: [
        {
          field: "ud.added_date",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: `Lead`,
        },
      ],
    });

    const { results: leadsAssignedMonthly } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT lal.user_id) as leads_assigned_monthly",
        "COUNT(DISTINCT  CASE WHEN cd.current_lead_source IN (6,11) THEN lal.user_id ELSE 0 END ) as instagram",
        "COUNT(DISTINCT CASE WHEN cd.current_lead_source = 20 THEN lal.user_id ELSE 0 END ) as whatsapp",
        "COUNT(DISTINCT CASE WHEN cd.current_lead_source = 16 THEN lal.user_id ELSE 0 END ) as phone_enquiry",
        "COUNT(DISTINCT CASE WHEN cd.current_lead_source = 18 THEN lal.user_id ELSE 0 END ) as consultation",
        "COUNT(DISTINCT CASE WHEN cd.current_lead_source = 2 THEN lal.user_id ELSE 0 END ) as hs_3_4",
        "COUNT(DISTINCT CASE WHEN cd.sales_status = '2' THEN lal.user_id ELSE 0 END ) as hot",
      ],
      table: `${tables.leadAssignedLog} lal`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lal.user_id",
        },
      ],
      conditions: [
        { field: "lal.counsellor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(lal.assign_date)",
          operator: ">",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
      ],
    });

    const { results: consultatonDoneMonthly } = await readRecord({
      selectFields: ["COUNT(*) as consultation_done_monthly"],
      table: `${tables.consultationLogs} csl`,
      conditions: [
        { field: "csl.consultation_by", operator: "=", value: mentor_id },
        {
          field: "DATE(csl.added_date)",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          // raw: true,
        },
      ],
    });
    console.log(consultatonDoneMonthly, 4052);
    const { results: saleMonthly } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
      ],
    });
    const { results: freshLeadSaleMonthly } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id=od.user_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
        {
          field: "DATE(ud.added_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });

    const { results: ocSaleMonthly } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_paid_amount), 0) AS paid_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
        { field: "od.order_type", operator: "=", value: "OCR" },
      ],
    });
    // console.log(saleMonthly[0], "monthly sale");
    // console.log(freshLeadSaleMonthly[0], "monthly fresh lead sale");
    // console.log(ocSaleMonthly[0], "monthly oc sale");
    const oldLeadSaleMonthly = {
      count:
        Number(saleMonthly[0].count) -
        Number(freshLeadSaleMonthly[0].count + Number(ocSaleMonthly[0].count)),
      paid_amount:
        Number(saleMonthly[0].paid_amount) -
        Number(
          Number(freshLeadSaleMonthly[0].paid_amount) +
            Number(ocSaleMonthly[0].paid_amount),
        ),
    };

    const { results: balanceMonthly } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(od.order_id) as count",
        "COALESCE(SUM(od.order_balance_amount), 0) as balance_amount",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
        {
          field: "DATE(od.order_date)",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
      ],
    });
    const { results: totalSales } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.ocr_target", "ad.lead_target", "ad.active_target"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: mentor_id },
      ],
    });
    const totalTarget =
      Number(totalSales[0].ocr_target) +
      Number(totalSales[0].lead_target) +
      Number(totalSales[0].active_target);
    const pending_sales_amount =
      totalTarget - Number(saleMonthly[0].paid_amount);
    const per_unit_amount =
      Number(saleMonthly[0].paid_amount) / Number(saleMonthly[0].count);
    const pending_sales_unit =
      Number(pending_sales_amount) / Number(per_unit_amount);

    const { results: reviewNotes } = await readRecord({
      table: `${tables.salesReviewNotes}`,
      selectFields: ["note", "slot"],
      conditions: [
        { field: "mentor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(added_date)",
          operator: "=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "slot",
          operator: "IN",
          value: [1, 2],
        },
      ],
      orderBy: ["slot ASC"],
    });

    const { results: engagementToday } = await readRecord({
      selectFields: ["COUNT(*) as engagement_today"],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = lel.user_id",
        },
      ],
      conditions: [
        { field: "lel.added_by", operator: "=", value: mentor_id },
        {
          field: "lel.engagement_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "lel.engagement_note",
          operator: "NOT IN",
          value: "('')",
          raw: true,
        },
        { field: "ud.user_type", operator: "=", value: "0" },
      ],
    });
    const { results: engagementMonthly } = await readRecord({
      selectFields: ["COUNT(*) as engagement"],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = lel.user_id",
        },
      ],
      conditions: [
        { field: "lel.added_by", operator: "=", value: mentor_id },
        {
          field: "lel.engagement_date",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("month").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
        {
          field: "lel.engagement_note",
          operator: "NOT IN",
          value: "('')",
          raw: true,
        },
        { field: "ud.user_type", operator: "=", value: "0" },
      ],
    });
    const { results: todayEvents } = await readRecord({
      table: `${tables.mentorEvents} me`,
      selectFields: [
        "me.id as event_id",
        "me.title as event_title",
        "me.description as event_description",
        "me.event_start_at as event_start_date",
        "me.event_end_at as event_end_date",
        "me.added_date as event_added_date",
        "me.is_additional as event_is_additional",
        "me.status as event_status",
      ],
      conditions: [
        {
          field: "me.admin_id",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "DATE(me.event_start_at)",
          operator: "<=",
          value: moment().format("YYYY-MM-DD"),
        },
        {
          field: "DATE(me.event_end_at)",
          operator: ">=",
          value: moment().format("YYYY-MM-DD"),
        },
      ],
      orderBy: ["me.event_start_at ASC"],
    });
    const eventData = todayEvents.map((i) => {
      return {
        event_id: i.event_id,
        event_title: i.event_title,
        event_description: i.event_description,
        event_start_date: i.event_start_date,
        event_end_date: i.event_end_date,
        event_added_date: i.event_added_date,
        event_is_additional: i.event_is_additional,
        event_status: i.event_status,
      };
    });

    const { results: prevDayEndReviews } = await readRecord({
      table: `${tables.salesReviewNotes} sr`,
      conditions: [
        {
          field: "DATE(sr.added_date)",
          operator: "BETWEEN",
          value: [
            moment().subtract(4, "day").startOf("day").format("YYYY-MM-DD"),
            moment().endOf("day").format("YYYY-MM-DD"),
          ],
        },
        { field: "sr.slot", operator: "=", value: 3 },
      ],
    });

    const { results: ocSuggestedCount } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN DATE(sp.added_date) = CURDATE() THEN sp.user_id END) as today_oc_suggested",
        "COUNT(DISTINCT sp.user_id) as month_oc_suggested",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = sp.user_id",
        },
      ],
      conditions: [
        { field: "sp.suggested_by", operator: "=", value: mentor_id },
        { field: "ud.user_status", operator: "=", value: "Completed" },
        {
          field: "DATE(sp.added_date)",
          operator: "BETWEEN",
          value: [
            moment().startOf("day").format("YYYY-MM-DD"),
            moment().endOf("day").format("YYYY-MM-DD"),
          ],
        },
      ],
    });

    const { results: ocEngagements } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN DATE(lel.engagement_date) = CURDATE() THEN lel.user_id END) as today_oc_engagements",
        "COUNT(DISTINCT lel.user_id) as monthly_oc_engagements",
      ],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = lel.user_id",
        },
      ],
      conditions: [
        { field: "lel.added_by", operator: "=", value: mentor_id },
        { field: "ud.user_status", operator: "=", value: "Completed" },
        {
          field: "DATE(lel.engagement_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("month").format("YYYY-MM-DD")}'`,
          ],
        },
      ],
    });

    const todayOCEngagement = ocEngagements[0].today_oc_engagements;
    const monthlyOCEngagement = ocEngagements[0].monthly_oc_engagements;

    let mpc_status = false;
    let mtd_sales = false;
    let last_three_yellow_zone = true;
    if (
      consultatonDone[0]?.consultation_done_today > 4 ||
      followUpDoneToday[0].leads_fu +
        followUpDoneToday[0].oc_fu +
        engagementToday[0]?.engagement_today >
        29 ||
      saleToday[0]?.count > 1
    ) {
      mpc_status = true;
    }

    if (saleToday[0]?.paid_amount >= totalTarget / 26) {
      mtd_sales = true;
    }
    if (prevDayEndReviews.length < 3) {
      last_three_yellow_zone = false;
    } else {
      for (const review of prevDayEndReviews.slice(-3)) {
        const yellow_zone = safeJSONParse(review.other_data, {}).yellow_zone;
        if (!yellow_zone) {
          last_three_yellow_zone = false;
          break;
        }
      }
    }

    const { results: leadsAssignedSourceGroupWise } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT lal.user_id ) as count_total",
        "COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) = CURDATE() THEN lal.user_id END) as count_today",
        "ls.source_group",
      ],
      table: `${tables.leadAssignedLog} lal`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lal.user_id",
        },
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
      ],
      conditions: [
        { field: "lal.counsellor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(lal.assign_date)",
          operator: ">",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
      ],
      groupBy: ["ls.source_group"],
    });
    console.log(leadsAssignedSourceGroupWise, 3947);
    const leads_assigned_today_source_group_wise = {};
    const leads_assigned_monthly_source_group_wise = {};
    leadsAssignedSourceGroupWise.map((item) => {
      leads_assigned_today_source_group_wise[leadSources[item.source_group]] =
        item.count_today;
      leads_assigned_monthly_source_group_wise[leadSources[item.source_group]] =
        item.count_total;
    });

    const { results: followUpDoneMonthly } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN lfl.user_id ELSE NULL END) as monthly_leads_fu",
        "COUNT(DISTINCT CASE WHEN cd.user_type = '1' THEN lfl.user_id ELSE NULL END) as monthly_oc_fu",
      ],
      table: `${tables.leadFollowUpLogs} lfl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lfl.user_id",
        },
      ],
      conditions: [
        { field: "lfl.assigned_to", operator: "=", value: mentor_id },
        {
          field: `((DATE(lfl.follow_up_date) BETWEEN '${moment()
            .startOf("month")
            .format("YYYY-MM-DD")}' AND '${moment()
            .endOf("day")
            .format(
              "YYYY-MM-DD",
            )}') AND lfl.follow_up_status = 1) OR (DATE(lfl.added_date) BETWEEN '${moment()
            .startOf("month")
            .format("YYYY-MM-DD")}' AND '${moment()
            .endOf("day")
            .format(
              "YYYY-MM-DD",
            )}' AND lfl.follow_up_note != '' AND lfl.follow_up_note IS NOT NULL)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    console.log(
      leads_assigned_today_source_group_wise,
      leads_assigned_monthly_source_group_wise,
      3953,
    );

    const { results: rateSharedData } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT sp.user_id) as total_count",
        "SUM(sp.suggested_amount) as total_amount",
        "COUNT(DISTINCT CASE WHEN DATE(sp.added_date) = CURDATE() THEN sp.user_id END) as today_count",
        "SUM(CASE WHEN DATE(sp.added_date) = CURDATE() THEN sp.suggested_amount END) as today_amount",
      ],
      table: `${tables.suggestedProgram} sp`,
      conditions: [
        { field: "sp.suggested_by", operator: "=", value: mentor_id },
        {
          field: "DATE(sp.added_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("month").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
        {
          field: "sp.payment_link_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "sp.payment_status",
          operator: "=",
          value: 0,
        },
      ],
    });

    const data = {
      today: {
        lead_assigned: leadsAssignedToday[0].leads_assigned_today || 0,
        instagram: leadsAssignedToday[0].instagram || 0,
        follow_up_done_today:
          followUpDoneToday[0].leads_fu || 0 + followUpDoneToday[0].oc_fu || 0,
        follow_up_done_lead: followUpDoneToday[0].leads_fu || 0,
        follow_up_done_oc: followUpDoneToday[0].oc_fu || 0,
        follow_up_missed_today: fuMissedToday[0].fu_missed || 0,
        follow_up_calls_done_today:
          followUpCallsDoneToday[0].follow_up_calls_done_today || 0,
        to_engage: leadsAssignedToday[0].to_engage || 0,
        hot: mentor_id == "274" ? 1 : leadsAssignedToday[0].hot || 0,
        consultation_done: consultatonDone[0].consultation_done_today,
        consultation_missed: consultationMissed[0].consultation_missed,
        engagement_today: engagementToday[0].engagement_today || 0,
        today_oc_engagements: todayOCEngagement || 0,
        oc_suggested_today: ocSuggestedCount[0].today_oc_suggested || 0,
        sale_today: {
          unit: saleToday[0].count,
          amount: Number(saleToday[0].paid_amount),
        },
        sale_today_bifurcation: {
          fresh_lead: {
            unit: freshLeadSaleToday[0].count,
            amount: Number(freshLeadSaleToday[0].paid_amount),
          },
          old_lead: {
            unit: oldLeadSaleToday.count < 0 ? 0 : oldLeadSaleToday.count,
            amount: Number(oldLeadSaleToday.paid_amount),
          },
          oc: {
            unit: ocSaleToday[0].count,
            amount: Number(ocSaleToday[0].paid_amount),
          },
        },
        balance_today: {
          unit: balanceToday[0].count,
          amount: Number(balanceToday[0].balance_amount),
        },
        leads_assigned_today_source_group_wise,
        rate_shared_today: `${rateSharedData[0].today_count || 0} Units | Rs. ${
          rateSharedData[0].today_amount || 0
        }`,
      },
      monthly: {
        total_leads: totalLeads[0].total_leads || 0,
        total_assigned: leadsAssignedMonthly[0].leads_assigned_monthly || 0,
        instagram: leadsAssignedMonthly[0].instagram || 0,
        follow_done_monthly_leads: followUpDoneMonthly[0].monthly_leads_fu || 0,
        follow_done_monthly_oc: followUpDoneMonthly[0].monthly_oc_fu || 0,
        phone_enquiry: leadsAssignedMonthly[0].phone_enquiry || 0,
        whatsapp: leadsAssignedMonthly[0].whatsapp || 0,
        consultation: leadsAssignedMonthly[0].consultation || 0,
        oc_suggested_monthly: ocSuggestedCount[0].month_oc_suggested || 0,
        engagement: engagementMonthly[0].engagement || 0,
        monthly_oc_engagements: monthlyOCEngagement || 0,
        oc_suggested_monthly: ocSuggestedCount[0].month_oc_suggested || 0,
        hs_3_4: leadsAssignedMonthly[0].hs_3_4 || 0,
        hot: leadsAssignedMonthly[0].hot || 0,
        consultaton_done_monthly:
          consultatonDoneMonthly[0].consultation_done_monthly,
        sale_monthly: {
          unit: saleMonthly[0].count,
          amount: Number(saleMonthly[0].paid_amount),
        },
        sale_monthly_bifurcation: {
          fresh_lead: {
            unit: freshLeadSaleMonthly[0].count,
            amount: Number(freshLeadSaleMonthly[0].paid_amount),
          },
          old_lead: {
            unit: oldLeadSaleMonthly.count < 0 ? 0 : oldLeadSaleMonthly.count,
            amount: Number(oldLeadSaleMonthly.paid_amount),
          },
          oc: {
            unit: ocSaleMonthly[0].count,
            amount: Number(ocSaleMonthly[0].paid_amount),
          },
        },
        balance_monthly: {
          unit: balanceMonthly[0].count,
          amount: Number(balanceMonthly[0].balance_amount),
        },
        pending_sales_monthly: {
          unit: pending_sales_unit < 0 ? 0 : Math.ceil(pending_sales_unit),
          amount: pending_sales_amount < 0 ? 0 : pending_sales_amount,
        },
        leads_assigned_monthly_source_group_wise,
        rate_shared_monthly: `${
          rateSharedData[0].total_count || 0
        } Units | Rs. ${rateSharedData[0].total_amount || 0}`,
      },
      // mis_unconverted: {
      //   total_consultation_unconverted: misUnconverted[0].total_unconverted,
      //   phase_1_2: misUnconverted[0]["1_2_phase"],
      //   phase_3_4: misUnconverted[0]["3_4_phase"],
      //   no_phase: misUnconverted[0]["no_phase"],
      //   stage_1_2: misUnconverted[0]["1_2_stage"],
      //   stage_3_4: misUnconverted[0]["3_4_stage"],
      //   male: misUnconverted[0]["male"],
      //   female: misUnconverted[0]["female"],
      // },
      review_notes: {
        first_half_review: reviewNotes[0]?.note || null,
        second_half_review: reviewNotes[1]?.note || null,
      },
      event_data: eventData,
      zone_data: {
        mpc_status: mpc_status,
        mtd_sales: mtd_sales,
        last_three_yellow_zone: last_three_yellow_zone,
      },
    };
    return res.status(200).json(
      new ApiResponse({
        message: "Day End Review Data Fetched Successfully",
        data,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendDayEnd = async (req, res, next) => {
  try {
    const { day_end_html, mentor_id, email_id } = req.body;

    const { results: mentorDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.cc", "ad.crm_user"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: mentor_id },
      ],
    });
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/dayEnd.ejs"),
      {
        day_end_html,
        year: moment().format("YYYY"),
      },
    );
    const mentorCC = safeJSONParse(mentorDetails[0].cc, []);
    await sendMailUtil({
      subject: `Day End Review - ${moment().format("Do MMM, YYYY")}`,
      to:
        process.env.NODE_ENV === "production"
          ? `vishalrupani@balancenutrition.in`
          : `kundan.chaudhary@balancenutrition.in`,
      from:
        process.env.NODE_ENV === "production"
          ? `${mentorDetails[0].crm_user} <${email_id}>`
          : `sumedh.pawar@balancenutrition.in`,
      ...(process.env.NODE_ENV === "production" && { cc: mentorCC }),
      bcc: ["testerteam@balancenutrition.in"],
      html: html,
    });
    return res
      .status(200)
      .json(
        new ApiResponse({ message: "Day End Review Mail Sent Successfully" }),
      );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getMonthlyGoal = async (req, res, next) => {
  try {
    const { id } = req.query;
    const [{ results: currentGoals }] = await Promise.all([
      readRecord({
        table: `${tables.mentorGoals} mg`,
        selectFields: ["mg.*"],
        conditions: [
          { field: "mg.mentor_id", operator: "=", value: id },
          {
            field: "DATE(mg.added_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      }),
    ]);
    const prevData = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT lal.user_id) AS count",
          "'lead_asigned_last_month' AS type",
        ],
        table: `${tables.leadAssignedLog} lal`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "lal.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "lal.counsellor_id",
            operator: "=",
            value: parseInt(id),
          },
          {
            field: "DATE(lal.assign_date)",
            operator: "BETWEEN",
            value: [
              `${moment()
                .subtract(1, "months")
                .startOf("month")
                .format("YYYY-MM-DD")}`,
              `${moment()
                .subtract(1, "months")
                .endOf("month")
                .format("YYYY-MM-DD")}`,
            ],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT csl.id) AS count",
          "'consultation_done_last_month' AS type",
        ],
        table: `${tables.consultationLogs} csl`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "csl.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "csl.consultation_by",
            operator: "=",
            value: parseInt(id),
          },
          {
            field: "DATE(csl.added_date)",
            operator: "BETWEEN",
            value: [
              `${moment()
                .subtract(1, "months")
                .startOf("month")
                .format("YYYY-MM-DD")}`,
              `${moment()
                .subtract(1, "months")
                .endOf("month")
                .format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: [
          "COUNT( od.order_id) AS count",
          "'sales_unit_last_month' AS type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
        ],
        condition: [
          {
            field: "od.sale_by",
            operator: "=",
            value: parseInt(id),
          },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment()
                .subtract(1, "months")
                .startOf("month")
                .format("YYYY-MM-DD")}`,
              `${moment()
                .subtract(1, "months")
                .endOf("month")
                .format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: [
          "SUM( od.order_paid_amount) AS count",
          "'sales_last_month' AS type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
        ],
        condition: [
          {
            field: "od.sale_by",
            operator: "=",
            value: parseInt(id),
          },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment()
                .subtract(1, "months")
                .startOf("month")
                .format("YYYY-MM-DD")}`,
              `${moment()
                .subtract(1, "months")
                .endOf("month")
                .format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);
    console.log(prevData, 4028);
    const currentGoal = currentGoals[0] || {};

    // Current month calculations (same logic applied)
    const current_consultation_unit = Math.ceil(
      currentGoal.leads_goal * (currentGoal.lead_ratio / 100) || 0,
    );
    const current_sales_units = Math.ceil(
      current_consultation_unit * (currentGoal.consultation_ratio / 100),
    );
    const current_sales_ratio = Math.ceil(
      (current_sales_units * 100) / (currentGoal.leads_goal || 1),
    );
    const current_sales_amount_units = Math.ceil(
      current_sales_units * currentGoal.sales_goal,
    );

    // Final response object
    const responseData = {
      last_month: {
        leads_goal: {
          type: prevData[0].type,
          unit: Number(prevData[0].count || 0),
        },
        consultation_goals: {
          type: prevData[1].type,
          unit: Number(prevData[1].count || 0),
        },
        sales_goal: {
          type: prevData[2].type,
          unit: Number(prevData[2].count || 0),
        },
        sales_amount: {
          type: prevData[3].type,
          unit: Number(prevData[3].count || 0),
        },
      },
      current_month: {
        leads_goal: {
          unit: Number(currentGoal.leads_goal || 0),
          ratio: Number(currentGoal.lead_ratio || 0),
        },
        consultation_goals: {
          unit: current_consultation_unit,
          ratio: Number(currentGoal.consultation_ratio || 0),
        },
        sales_goal: {
          unit: current_sales_units,
          ratio: current_sales_ratio,
        },
        sales_amount: {
          unit: current_sales_amount_units,
          ratio: currentGoal.sales_goal,
        },
      },
    };

    return res.status(200).json(
      new ApiResponse({
        data: responseData,
        message: "Monthly Goal Fetched Successfully",
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendGoalMail = async (req, res, next) => {
  try {
    const { goal_html, mentor_id, email_id } = req.body;
    const { results: mentorDetails } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: ["ad.cc", "ad.crm_user"],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: mentor_id },
      ],
    });
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/goalMail.ejs"),
      {
        goal_html,
        year: moment().format("YYYY"),
      },
    );
    const mentorCC = safeJSONParse(mentorDetails[0].cc, []);
    await sendMailUtil({
      subject: `Goal Set for ${moment().format("MMM")} - ${
        mentorDetails[0].crm_user
      }`,
      to:
        process.env.NODE_ENV === "production"
          ? `vishalrupani@balancenutrition.in`
          : `kundan.chaudhary@balancenutrition.in`,
      from:
        process.env.NODE_ENV === "production"
          ? `${mentorDetails[0].crm_user} <${email_id}>`
          : `${mentorDetails[0].crm_user} <mentor.barkha@balancenutrition.in>`,
      ...(process.env.NODE_ENV === "production" && { cc: mentorCC }),
      bcc: ["testerteam@balancenutrition.in"],
      html: html,
    });
    return res
      .status(200)
      .json(new ApiResponse({ message: "Goal Mail Sent Successfully" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const insertMonthlyGoal = async (req, res, next) => {
  try {
    const {
      leads_goal,
      lead_ratio,
      lead_target,
      consultation_ratio,
      sales_goal,
      mentor_id,
      notes,
    } = req.body;
    const columns = [
      "leads_goal",
      "lead_ratio",
      "consultation_ratio",
      "sales_goal",
      "mentor_id",
      "notes",
    ];
    const values = [
      leads_goal,
      lead_ratio,
      consultation_ratio,
      sales_goal,
      mentor_id,
      notes,
    ];
    const insertedResult = await insertRecord(
      tables.mentorGoals,
      columns,
      values,
    );
    if (insertedResult.affectedRows === 0) {
      return next(new ErrorHandler("Internal Server Error", 500));
    }

    const qualified_leads = leads_goal * (lead_ratio / 100);
    const consultations = qualified_leads * (consultation_ratio / 100);
    const sales_unit = Math.floor(consultations);
    const sales_amount = sales_unit * sales_goal;

    const updatedResult = await updateRecord(
      tables.adminUsers,
      {
        lead_units: sales_unit,
        lead_target: sales_amount,
      },
      { admin_user_id: mentor_id },
    );

    return res.status(201).json(
      new ApiResponse({
        message: `Goal For ${moment().format(
          "Do MMM YY",
        )} Updated Successfully`,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllCallSummary = async (req, res, next, internal = false) => {
  try {
    const { admin_id = 215 } = req.query;
    const today = moment().format("YYYY-MM-DD");

    const { results: introductionCallPending } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(DISTINCT ud.user_id) AS count",
        "'introduction_call_not_done' AS type",
      ],
      joins: [
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
      conditions: [
        {
          raw: true,
          field: "(sop.order_type IN ('New', 'OCR'))",
          operator: "",
          value: "",
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "cu.user_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 0,
        },
      ],
    });

    const { results: serviceCallPending } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(DISTINCT ud.user_id) AS service_call_not_done"],
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
          on: `sop.sub_order_id = cu.sub_order_id AND cu.user_id = ud.user_id AND cu.call_type = '4'`,
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

    const { results: introductionCallSummary } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        // Missed = pending but scheduled before now

        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) = '${today}' THEN 1 ELSE 0 END), 0) AS scheduled`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 1 AND DATE(cu.schedule_date) = '${today}' THEN 1 ELSE 0 END), 0) AS done`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) < '${today}' THEN 1 ELSE 0 END), 0) AS missed`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) = DATE_ADD('${today}', INTERVAL 1 DAY) THEN 1 ELSE 0 END), 0) AS tomorrow_scheduled`,
      ],
      conditions: [
        { field: "cu.call_type", operator: "=", value: "66" },
        admin_id
          ? { field: "cu.added_by", operator: "=", value: Number(admin_id) }
          : null,
      ].filter(Boolean),
    });

    const { results: serviceCallSummary } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        // Missed = pending but scheduled before now

        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) = '${today}' THEN 1 ELSE 0 END), 0) AS scheduled`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 1 AND DATE(cu.schedule_date) = '${today}' THEN 1 ELSE 0 END), 0) AS done`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) < '${today}' THEN 1 ELSE 0 END), 0) AS missed`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) = DATE_ADD('${today}', INTERVAL 1 DAY) THEN 1 ELSE 0 END), 0) AS tomorrow_scheduled`,
      ],
      conditions: [
        { field: "cu.call_type", operator: "=", value: "4" },
        admin_id
          ? { field: "cu.added_by", operator: "=", value: Number(admin_id) }
          : null,
      ].filter(Boolean),
    });

    const { results: OtherCallSummary } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        // Missed = pending but scheduled before now

        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) = '${today}' THEN 1 ELSE 0 END), 0) AS scheduled`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 1 AND DATE(cu.schedule_date) = '${today}' THEN 1 ELSE 0 END), 0) AS done`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) < '${today}' THEN 1 ELSE 0 END), 0) AS missed`,
        `COALESCE(SUM(CASE WHEN cu.call_status = 0 AND DATE(cu.schedule_date) = DATE_ADD('${today}', INTERVAL 1 DAY) THEN 1 ELSE 0 END), 0) AS tomorrow_scheduled`,
      ],
      conditions: [
        { field: "cu.call_type", operator: "NOT IN", value: ["66", "4"] },
        admin_id
          ? { field: "cu.added_by", operator: "=", value: Number(admin_id) }
          : null,
      ].filter(Boolean),
    });

    const introCallPendingCount = introductionCallPending[0]?.count || 0;

    const serviceCallPendingCount =
      serviceCallPending[0]?.service_call_not_done || 0;

    const data = {
      app_induction_call: {
        due: introCallPendingCount,
        ...introductionCallSummary[0],
      },
      service_call_summary: {
        due: serviceCallPendingCount,
        ...serviceCallSummary[0],
      },
      other_call_summary: OtherCallSummary?.length > 0 && OtherCallSummary[0],
    };

    if (internal) return data;

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Call outcome summary fetched successfully",
        data,
      }),
    );
  } catch (error) {
    console.error(error);
    if (internal) throw error;
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadsAndSalesStats = async (req, res, next, internal = false) => {
  try {
    const { admin_id = 215 } = req.query;

    const [leads, sales] = await Promise.all([
      readRecord({
        table: `${tables.leadAssignedLog} lal`,
        selectFields: [
          "SUM(CASE WHEN DATE(lal.assign_date) = CURDATE() THEN 1 ELSE 0 END) AS leads_today",
          "SUM(CASE WHEN MONTH(lal.assign_date) = MONTH(CURDATE()) and YEAR(lal.assign_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS leads_mtd",
        ],
        conditions: admin_id
          ? [{ field: "lal.counsellor_id", operator: "=", value: admin_id }]
          : [],
      }),
      readRecord({
        table: `${tables.orderDetails} od`,
        selectFields: [
          "SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN 1 ELSE 0 END) AS sales_today",
          "SUM(CASE WHEN MONTH(od.order_date) = MONTH(CURDATE()) and YEAR(od.order_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS sales_mtd",
          "SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN od.order_paid_amount ELSE 0 END) AS sales_today_amount",
          "SUM(CASE WHEN MONTH(od.order_date) = MONTH(CURDATE()) and YEAR(od.order_date) = YEAR(CURDATE()) THEN od.order_paid_amount ELSE 0 END) AS sales_mtd_amount",
        ],
        conditions: admin_id
          ? [{ field: "od.sale_by", operator: "=", value: admin_id }]
          : [],
      }),
    ]);

    const data = {
      leads: {
        today: leads.results[0]?.leads_today || 0,
        mtd: leads.results[0]?.leads_mtd || 0,
      },
      sales: {
        today: {
          unit: sales.results[0]?.sales_today || 0,
          amount: Number(sales.results[0]?.sales_today_amount || 0),
        },
        mtd: {
          unit: sales.results[0]?.sales_mtd || 0,
          amount: Number(sales.results[0]?.sales_mtd_amount || 0),
        },
      },
    };

    if (internal) return data;

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Leads & Sales stats fetched successfully",
        data,
      }),
    );
  } catch (error) {
    if (internal) throw error;
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const readTodayNotes = async () => {
  const { results } = await readRecord({
    table: "users_details",
    selectFields: ["user_id", "cs_notes"],
    conditions: [
      { field: "cs_notes", operator: "IS", value: "NOT NULL", raw: true },
    ],
  });

  const today = new Date().toISOString().slice(0, 10);

  const allTodayNotes = results.flatMap((user) => {
    if (!user.cs_notes) return [];

    try {
      const notesArray = JSON.parse(user.cs_notes)
        .map((noteStr) => JSON.parse(noteStr))
        .filter(Boolean);

      console.log(notesArray, "notesArray - 111080");

      // Filter today's notes
      const todayNotes = notesArray.filter(
        (note) => note.date?.slice(0, 10) === today,
      );

      // Deduplicate notes by `table` for this user
      const uniqueNotesByTable = Object.values(
        todayNotes.reduce((acc, note) => {
          if (!acc[note.table]) acc[note.table] = note; // keep only first note per table
          return acc;
        }, {}),
      );

      // Attach user_id to each note
      return uniqueNotesByTable.map((note) => ({
        ...note,
        user_id: user.user_id,
      }));
    } catch (err) {
      return [];
    }
  });

  return allTodayNotes;
};

const getClientServiceDashboard = async (req, res, next) => {
  try {
    const { isDayPlanner } = req.query;

    console.log(isDayPlanner, "isDayPlanner");

    // fetch all dashboard data in parallel
    const [
      appNotUpdated,
      notStarted,
      balance,
      dormancy,
      advance,
      expiring,
      calls,
      onhold,
      leadsSales,
      odData,
      wmrData,
      csNotesData,
      leadOcIntroCallCount,
      appNotInstalledClientCount,
      birthdayHamperNotClaimedCount,
    ] = await Promise.all([
      AppNotUpdatedClientsCount(req, res, next, true),
      getClientNotStartedCount(req, res, next, true),
      getClientsBalanceDue(req, res, next, true),
      getDormancyClientCount(req, res, next, true),
      getClientsAdvancedPurchase(req, res, next, true),
      getClientsExpiring(req, res, next, true),
      getAllCallSummary(req, res, next, true),
      getClientOnBreakCount(req, res, next, true),
      getLeadsAndSalesStats(req, res, next, true),
      todaysRiskAndMissesClientDataCs(),
      getTodayDueWeightManagementDataCs(),
      readTodayNotes(), // your function that returns array of { user_id, today_cs_notes: [...] }
      getClientLeadAppCountData(req, res, next, true),
      getAppNotInstalledClientCountData(),
      getCsBirthdayUserIdsTodayYesterday(req, res, next, true),
    ]);

    // existing dashboard processing
    const getCountByKey = (key) =>
      odData.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      odData.find((r) => r.type === key)?.user_ids || "[]";

    const weight_od = getCountByKey("weight_od");
    const not_started_od = getCountByKey("not_started_od");
    const on_hold_od = getCountByKey("onhold_od");
    const call_od_ht = getCountByKey("ht_call_od");
    const call_od_te = getCountByKey("te_call_od");
    const welcome_call_od = getCountByKey("welcome_call_od");
    const call_od = call_od_ht + call_od_te + welcome_call_od;

    const goal_od = getCountByKey("goal_od");
    const feedback_od_ht = getCountByKey("feedback_od_ht");
    const feedback_od_te = getCountByKey("feedback_od_te");
    const feedback_od_ht_te = feedback_od_ht + feedback_od_te;
    const health_score_od_ht = getCountByKey("health_score_od_ht");
    const health_score_od_te = getCountByKey("health_score_od_te");
    const health_score_od_ht_te = health_score_od_ht + health_score_od_te;
    const assessment_not_filled_od = getCountByKey("assessment_not_filled");

    const ActiveResponse = [
      {
        key: "assessment_not_filled",
        count: assessment_not_filled_od,
        user_ids: safeJSONParse(getUserIdsByKey("assessment_not_filled")),
      },
      {
        key: "weight_od",
        count: weight_od,
        user_ids: safeJSONParse(getUserIdsByKey("weight_od")),
      },
      {
        key: "not_started_od",
        count: not_started_od,
        user_ids: safeJSONParse(getUserIdsByKey("not_started_od")),
      },
      {
        key: "on_hold_od",
        count: on_hold_od,
        user_ids: safeJSONParse(getUserIdsByKey("onhold_od")),
      },
      {
        key: "call_od",
        count: call_od,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("ht_call_od")),
            ...safeJSONParse(getUserIdsByKey("te_call_od")),
            ...safeJSONParse(getUserIdsByKey("welcome_call_od")),
          ]),
        ],
      },
      {
        key: "goal_od",
        count: goal_od,
        user_ids: safeJSONParse(getUserIdsByKey("goal_od")),
      },
      {
        key: "feedback_od_(Ht_&_Te)",
        count: feedback_od_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("feedback_od_ht")),
            ...safeJSONParse(getUserIdsByKey("feedback_od_te")),
          ]),
        ],
      },
      {
        key: "health_score_od_(Ht_&_Te)",
        count: health_score_od_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("health_score_od_ht")),
            ...safeJSONParse(getUserIdsByKey("health_score_od_te")),
          ]),
        ],
      },
    ];

    const overdueObj = ActiveResponse.reduce((acc, item) => {
      acc[item.key] = item.count;
      return acc;
    }, {});

    const wmrObj = wmrData.reduce((acc, item) => {
      acc[item.type] = item.count;
      return acc;
    }, {});

    console.log("dormancy", dormancy);

    // format dashboard object
    const dashboard = {
      app_not_update_status: {
        android: appNotUpdated.android_not_updated || 0,
        ios: appNotUpdated.ios_not_updated || 0,
        total:
          (appNotUpdated.android_not_updated || 0) +
          (appNotUpdated.ios_not_updated || 0),
      },
      app_not_installed_clients: {
        total: appNotInstalledClientCount?.count || 0,
      },

      "Lead, OC - App Induction Calls": {
        lead_app: {
          today: leadOcIntroCallCount?.lead_app?.today,
          overall_pending: leadOcIntroCallCount?.lead_app?.overall,
        },
        oc_app: {
          today: leadOcIntroCallCount?.oc_app?.today,
          overall_pending: leadOcIntroCallCount?.oc_app?.overall,
        },
      },
      birthday_hamper_not_claimed: birthdayHamperNotClaimedCount,
      all_calls: calls,
      due_today: {
        ...wmrObj,
        not_started: notStarted?.["Not Started Due Today"] || 0,
        balance: balance?.today_due || 0,
        onhold: onhold[0]?.due_today || 0,
        program_expiry: expiring?.["Expiring Today"] || 0,
      },
      overdue: {
        ...overdueObj,
        dormancy_19th_day_plus: dormancy["Dormant"],
        balance_od: balance?.over_due || 0,
        "advance_purchase_od (active)":
          advance[0]?.advance_program_od_with_active_program,
        "advance_purchase_od (not active)":
          advance[0]?.advance_program_od_without_active_program,
      },
      leads_assigned: leadsSales.leads,
      sales: leadsSales.sales,
    };

    const addNotesCount = (dashboardSection, plannerSection) => {
      Object.keys(plannerSection).forEach((subKey) => {
        const tables = plannerSection[subKey].filter(Boolean);
        const lowerCaseTable = tables?.map((table) => table?.toLowerCase()); // get all tables for that subkey
        const notesCount = csNotesData?.filter((note) =>
          lowerCaseTable.includes(note?.table?.toLowerCase()),
        ).length;
        dashboardSection[subKey] =
          dashboardSection[subKey] + "   " + `(Action Taken: ${notesCount})`;
      });
    };

    // Add counts to due_today and overdue subkeys

    if (isDayPlanner == 0) {
      addNotesCount(dashboard.due_today, dataForPlanner.due_today);
      addNotesCount(dashboard.overdue, dataForPlanner.overdue);
      addNotesCount(
        dashboard["Lead, OC - App Induction Calls"].lead_app,
        dataForPlanner.lead_app,
      );
      addNotesCount(
        dashboard["Lead, OC - App Induction Calls"].oc_app,
        dataForPlanner.oc_app,
      );
      addNotesCount(
        dashboard.birthday_hamper_not_claimed,
        dataForPlanner.birthday_hamper_not_claimed,
      );
    }

    const isAllowedToLogOff = checkActionTakenAndLogoff(dashboard);
    dashboard.isAllowedToLogOff = isAllowedToLogOff;

    const {
      overdue,
      sales,
      leads_assigned,
      all_calls,
      app_not_update_status,
      ["Lead, OC - App Induction Calls"]: leadOcAppInductionCalls,
      ...rest
    } = dashboard?.isAllowedToLogOff || {};

    if (leadOcAppInductionCalls) {
      leadOcAppInductionCalls.lead_app =
        leadOcAppInductionCalls?.lead_app?.today === true;

      leadOcAppInductionCalls.oc_app =
        leadOcAppInductionCalls?.oc_app?.today === true;
    }

    dashboard.isAllowedToLogOff = {
      ...rest,
      "Lead, OC - App Induction Calls": leadOcAppInductionCalls,
    };

    console.log(dashboard.isAllowedToLogOff, "isAllowedToLogOff");

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Client Service Dashboard fetched successfully",
        data: dashboard,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOCAppCountData = async (req, res, next) => {
  try {
    const { search, page, limit, today } = req.body;

    const oneMonthBackDate = moment().subtract(1, "month").format("YYYY-MM-DD");
    console.log(
      "One month back date",
      `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
      oneMonthBackDate,
    );

    const paramsClient = {
      page: page,
      limit: limit,
      search: search,
      extraConditions: [
        { field: "ud.user_status", operator: "=", value: "Completed" },
        { field: "ud.sub_user_status", operator: "!=", value: "Maintenance" },
        { field: "ud.app_count", operator: "=", value: 0 },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        },
        {
          field: "sop.expiry_date",
          operator: "<",
          value: oneMonthBackDate,
        },
        { field: "ud.mentor_assigned", operator: "!=", value: 196 },
        // { field: "fcm.user_id", operator: "IS NOT", value: "NULL", raw:true },
        today
          ? {
              field: "DATE(fcm.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            }
          : null,
      ].filter(Boolean),
      extraJoins: [
        {
          table: `${tables.fcm_registry} fcm`,
          type: "LEFT",
          on: "ud.user_id = fcm.user_id",
        },
      ],
      extraGroupBy: ["ud.user_id"],
    };

    const { data, total_page } = await getFormattedUserData(paramsClient);
    // const {data: leadData, total_page: leadTotalPage}  = await getFormattedLeadData(paramsLead);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User App Count Data fetched successfully",
      data,
      totalCount: total_page,
      meta_data: { page },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadAppCountData = async (req, res, next) => {
  try {
    const { search, page, limit, today } = req.body;

    const paramsLead = {
      page: page,
      limit: limit,
      search: search,
      extraConditions: [
        { field: "ud.user_status", operator: "=", value: "Lead" },
        { field: "ud.app_count", operator: "=", value: 0 },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        },
        { field: "ud.counsellor_assigned", operator: "!=", value: 196 },
        {
          field: "ud.counsellor_assigned",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "fcm.user_id", operator: "IS NOT", value: "NULL", raw: true },
        today
          ? {
              field: "DATE(fcm.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            }
          : null,
      ].filter(Boolean),
      extraJoins: [
        {
          table: `${tables.fcm_registry} fcm`,
          type: "LEFT",
          on: "ud.user_id = fcm.user_id",
        },
      ],
      extraGroupBy: ["ud.user_id"],
    };

    const { data: leadData, total_page: leadTotalPage } =
      await getFormattedUserData(paramsLead);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User App Count Data fetched successfully",
      data: leadData,
      totalCount: leadTotalPage,
      meta_data: { page },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientLeadAppCountData = async (req, res, next, internal = false) => {
  try {
    const result = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(ud.user_id) as count",
          "'client_app_count' as type",
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          { field: "ud.sub_user_status", operator: "!=", value: "Maintenance" },
          { field: "ud.app_count", operator: "=", value: 0 },
          {
            field: "ud.app_version",
            operator: " IN ",
            value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
            raw: true,
          },
          {
            field: "sop.expiry_date",
            operator: "<",
            value: moment().subtract(1, "month").format("YYYY-MM-DD"),
          },
          { field: "ud.mentor_assigned", operator: "!=", value: 196 },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: ` sop.sub_order_id=ud.active_order_id`,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(ud.user_id) as count",
          "'client_app_count_today' as type",
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          { field: "ud.sub_user_status", operator: "!=", value: "Maintenance" },
          { field: "ud.app_count", operator: "=", value: 0 },
          {
            field: "ud.app_version",
            operator: " IN ",
            value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
            raw: true,
          },
          {
            field: "sop.expiry_date",
            operator: "<",
            value: moment().subtract(1, "month").format("YYYY-MM-DD"),
          },
          { field: "ud.mentor_assigned", operator: "!=", value: 196 },
          {
            field: "fcm.user_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "fcm.app_version",
            operator: "IN",
            value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
            raw: true,
          },
          {
            field: "DATE(fcm.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: ` sop.sub_order_id=ud.active_order_id`,
          },

          {
            type: "LEFT",
            table: `${tables.fcm_registry} fcm`,
            on: "fcm.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: ["COUNT(ud.user_id) as count", "'lead_app_count' as type"],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Lead" },
          { field: "ud.app_count", operator: "=", value: 0 },
          { field: "ud.counsellor_assigned", operator: "!=", value: 196 },
          {
            field: "ud.counsellor_assigned",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.app_version",
            operator: " IN ",
            value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'lead_app_count_today' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.fcm_registry} fcm`,
            on: "fcm.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Lead" },
          { field: "ud.app_count", operator: "=", value: 0 },
          { field: "ud.counsellor_assigned", operator: "!=", value: 196 },
          {
            field: "ud.counsellor_assigned",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.app_version",
            operator: " IN ",
            value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
            raw: true,
          },
          {
            field: "DATE(fcm.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);

    console.log(result, "result1108");

    const cleanedData = {
      oc_app: {
        overall: result?.[0]?.count || 0,
        today: result?.[1]?.count || 0,
      },
      lead_app: {
        overall: result?.[2]?.count || 0,
        today: result?.[3]?.count || 0,
      },
    };

    if (internal === true) {
      return cleanedData;
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User App Count Data fetched successfully",
      data: result ? cleanedData : {},
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateOCLeadAppCount = async (req, res, next) => {
  try {
    const { user_id } = req.body;

    // Validate required fields
    if (!user_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const ocLeadAppCountUpdateResult = await updateRecord(
      tables.userDetails,
      {
        app_count: 1,
      },
      {
        user_id: user_id,
      },
    );

    if (
      !ocLeadAppCountUpdateResult ||
      ocLeadAppCountUpdateResult.affectedRows === 0
    ) {
      return next(
        new ErrorHandler("goal record not found or not updated", 404),
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "OC/Lead App Count update Acknowledge Successfully",
      }),
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAdminSalesCalculation = async (req, res, next) => {
  try {
    const { commission_wants, admin_id } = req.query;
    const { results: adminCommissionData } = await readRecord({
      table: `${tables.adminCommission} ac`,
      selectFields: ["*"],
      conditions: [
        { field: "ac.admin_id", operator: "=", value: admin_id },
        {
          field: "MONTH(ac.added_date)",
          operator: "=",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: "YEAR(ac.added_date)",
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
      ],
    });
    if (adminCommissionData.length > 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Commission already set for this month",
        }),
      );
    }
    // Parse and validate commission_wants
    const commission = parseFloat(commission_wants);
    if (isNaN(commission) || commission <= 0) {
      return next(new ErrorHandler("Invalid 'commission_wants' value", 400));
    }

    // Calculate last month date range
    const startDate = moment()
      .startOf("month")
      .subtract(1, "months")
      .format("YYYY-MM-DD");
    const endDate = moment()
      .endOf("month")
      .subtract(1, "months")
      .format("YYYY-MM-DD");

    // Fetch average new sale amount per unit
    const { results: avgNewSalesAmountPerUnits } = await readRecord({
      selectFields: [
        `CASE 
     WHEN COUNT(DISTINCT sop.sub_order_id) > 0 
     THEN SUM(sop.paid_amount + sop.balance_amount) / COUNT(DISTINCT sop.sub_order_id)
     ELSE 0 
   END AS avg_sale_amount`,
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "NOT IN", value: [196] },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [startDate, endDate],
        },
        { field: "od.order_type", operator: "=", value: "New" },
        { field: "sop.order_type", operator: "=", value: "New" },
      ],
    });

    const avgSaleAmount = parseFloat(
      avgNewSalesAmountPerUnits[0]?.avg_sale_amount,
    );
    console.log(avgSaleAmount, 4794);

    // Core calculations
    const saleToDoForCommission = commission * (100 / 7.5); // Assuming 7.5% commission rate
    const unitsToDoForCommission = Math.ceil(
      saleToDoForCommission / avgSaleAmount,
    );
    const consultationToDo = Math.ceil(unitsToDoForCommission * (100 / 20)); // 20% consultation-to-sale
    const leadsRequired = Math.ceil(consultationToDo * 2); // 50% lead-to-consultation

    const setTarget = {
      lead_target:
        saleToDoForCommission == Infinity
          ? 0
          : Math.round(saleToDoForCommission),
      lead_units:
        unitsToDoForCommission == Infinity
          ? 0
          : Math.round(unitsToDoForCommission),
      lead_required: leadsRequired == Infinity ? 0 : Math.round(leadsRequired),
    };
    const updateAdminLeadTarget = await updateRecord(
      tables.adminUsers,
      setTarget,
      { admin_user_id: admin_id },
    );
    const insertCommissionRecord = await insertRecord(
      tables.adminCommission,
      ["admin_id", "commission"],
      [admin_id, commission_wants],
    );
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Admin Sales Calculation fetched successfully",
        data: {
          avg_sale_amount: avgSaleAmount.toFixed(2),
          sales_to_do: saleToDoForCommission.toFixed(2),
          units_to_sale: unitsToDoForCommission.toFixed(0),
          consultation_to_do: consultationToDo.toFixed(0),
          leads_required: leadsRequired.toFixed(0),
        },
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAppNotInstalledClientCountData = async () => {
  try {
    const { results: appNotInstalledCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(ud.user_id) as count",
        "'app_not_installed_clients' as type",
      ],
      conditions: [
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
        },
      ],
    });

    return appNotInstalledCount[0];
  } catch (error) {
    console.error(error);
    return new ErrorHandler("Internal Server Error", 500);
  }
};

export {
  getClientServiceDashboard,
  getOCAppCountData,
  getLeadAppCountData,
  updateOCLeadAppCount,
  getClientLeadAppCountData,
  getMonthlyGoal,
  sendReview,
  sendDayReviewCS,
  getDayReviewNotesCS,
  getDayReviewDataCs,
  sendDayEnd,
  activitesDone,
  addNewAdminUser,
  getAdminDayReviewStatus,
  getDayEndReviewData,
  assignMentor,
  bookCall,
  bulkAssignLead,
  bulkAssignOC,
  changeAdminStatus,
  getAllAdmins,
  getAllRoles,
  getBirthdayClients,
  getCallByCallId,
  getCallsCount,
  getCounsellors,
  getCounsellorsForConsultation,
  getFollowUps,
  getMentor,
  getMentors,
  myFollowUpsToday,
  overdueAndMisses,
  suggestProgramToUser,
  totalsSalesOpportunity,
  updateCallDetails,
  getAdminCalls,
  getDayReviewData,
  submitDayReview,
  searchAdmin,
  sendDayPlanner,
  sendDayPlannerCS,
  sendGoalMail,
  insertMonthlyGoal,
  editAdminUser,
  getAdminSalesCalculation,
  getFollowUpsCountFilterWise,
};
