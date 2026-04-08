import moment from "moment";
import { db, readPool } from "../../config/dbConnection.js";
import {
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import {
  extractVariables,
  fetchUserDetailsDynamic,
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonSelectFields,
  getPageVisitHistory,
  getQueryTimeRange,
  joinsMap,
  mapLeadData,
  mapLeadDataNew,
  mapOCData,
  mapUserData,
  readRecordNewForLead,
  replacePlaceholders,
  selectMap,
  withMap,
} from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
// import { readPool } from "../../config/dbConnection.js";
import {
  getSourceNameLabel,
  mapCallType,
  safeJSONParse,
} from "../../helper/commonHelper.js";
import {
  activeMaintanenceBifurcationData,
  activeSalesBifurcationData,
  getFormattedLeadData,
  getFormattedUserData,
  howsMyDayActiveFilterData,
  howsMyTommorowActiveFilterData,
  howzmyDayActiveFilterData,
  howzmyDayLeadFilterData,
  howzmyDayOCFilterData,
  mtdFollowUpsRisksClientData,
  mtdFollowUpsRisksLeadData,
  ocBucketData,
  overdueAndMissesActiveFilterData,
  overdueAndMissesCommonData,
  salesFollowupAndRiskActiveFilterData,
  salesOpportunitysActiveFilterData,
  salesOpportunitysClientFilterData,
  startLaterData,
  todaysRiskAndMissesClientData,
  todaysRiskAndMissesData,
  todaysRiskAndMissesMentorData,
} from "../../helper/mentordbHelpers.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import SmartScaleData from '../../models/smartScaleModel.js'; 
import { buildCartWhatsappMessages } from "../../helper/emailAutochatTemplateHelpers/getAutoCartCreationMessageTemplates.js";

const howzMyDay = async (req, res, next) => {
  try {
    const { user_type = "Active" } = req.query;
    const mentor_id = Number(req.query.mentor_id);
    let active_client_assigned,
      not_started,
      NAF,
      ICL,
      drafted_diet,
      pending_diet,
      today_fu,
      pre_attempted_diet,
      action_assigned,
      OCL,
      call_booked,
      leads_to_capture,
      unanswered_queries,
      leads_assigned,
      drafted_queries,
      com_clients,
      engagement_today;

    // Common queries for all user types
    const common = await readRecordUnion([
      {
        table: `${tables.leadFollowUpLogs} fu`,
        selectField: [
          "COUNT(DISTINCT fu.user_id) as count",
          "'today_fu' as type",
        ],
        condition: [
          {
            field: "fu.follow_up_date",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
          {
            field: "fu.follow_up_status",
            operator: "=",
            value: "0",
            raw: true,
          },

          { field: "fu.assigned_to", operator: "=", value: mentor_id },
          ...(user_type === "Lead"
            ? [{ field: "ud.user_type", operator: "=", value: "0" }]
            : user_type === "Active"
              ? [{ field: "ud.user_status", operator: "=", value: "Active" }]
              : user_type
                ? [
                    {
                      field: "ud.sub_user_status",
                      operator: "IN",
                      value: ["Completed", "Dropout", "Maintenance", "Fs"],
                    },
                  ]
                : []),
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = fu.user_id",
          },
        ],
      },
      {
        table: `${tables.leadActionAssignedLog} laal`,
        selectField: [
          "COUNT(DISTINCT laal.user_id) as count",
          "'action_assigned' as type",
        ],
        condition: [
          {
            field: "DATE(laal.action_assign_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
          {
            field: "laal.action_assigned_to",
            operator: "=",
            value: Number(mentor_id),
          },
        ],
      },
      {
        table: `${tables.changeOfMentor} com`,
        selectField: [
          "COUNT(DISTINCT com.user_id) as count",
          "'com_clients' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = com.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: "ud.user_id = cu.user_id AND cu.call_type not in ('0','1','2','3') AND DATE(cu.schedule_date) >= com.added_date AND cu.call_status = 1",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "com.old_mentor", operator: "<>", value: "com.new_mentor" },
          { field: "com.old_mentor", operator: "<>", value: "0", raw: true },
          { field: "com.new_mentor", operator: "=", value: Number(mentor_id) },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          {
            field: "com.added_date",
            operator: ">=",
            value: moment().startOf("month").format("YYYY-MM-DD"),
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: Number(mentor_id),
          },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'call_booked' as type",
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "<>", value: "14" },
          {
            field: "ud.user_status",
            operator: "=",
            value:
              user_type === "Active"
                ? "Active"
                : user_type === "OC"
                  ? "Completed"
                  : "Lead",
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
      },
    ]);

    today_fu = common[0].count;
    action_assigned = common[1].count;
    com_clients = common[2].count;
    call_booked = common[3].count;

    if (user_type === "Active" || user_type === "OC") {
      const userIdDocs = await clientEnquiry.aggregate([
        {
          $match: {
            type: "query",
            mentor_id: mentor_id,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
        {
          $group: {
            _id: "$user_id",
            latestDoc: { $first: "$$ROOT" },
          },
        },
        {
          $match: {
            "latestDoc.type": "query",
          },
        },
        {
          $project: {
            _id: 1,
          },
        },
      ]);
      const userIds = userIdDocs.map((doc) => doc._id.toString());
      if (userIds.length > 0) {
        const { results: filteredUsers } = await readRecord({
          table: `${tables.userDetails} ud`,
          conditions: [
            {
              field: "ud.user_status",
              operator: "=",
              value: user_type === "Active" ? "Active" : "Completed",
            },
            { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
            { field: "ud.user_id", operator: "IN", value: userIds },
          ],
        });

        unanswered_queries = filteredUsers.length;
      } else {
        unanswered_queries = 0;
      }
    }

    // User-type-specific logic
    if (user_type === "Active") {
      const data = await howzmyDayActiveFilterData({ mentor_id });
      active_client_assigned = data[0].count;
      not_started = data[1].count;
      NAF = data[2].count;
      ICL = data[3].count;
      pending_diet = data[4].count;
      drafted_diet = data[5].count;
      pre_attempted_diet = data[6].count;
      drafted_queries = data[7].count;
    }

    if (user_type === "OC") {
      const data = await howzmyDayOCFilterData({ mentor_id });
      OCL = data[0].count;
    }

    if (String(user_type).toLowerCase() === "lead") {
      const data = await howzmyDayLeadFilterData({ mentor_id });
      leads_to_capture = data[0].count;
      leads_assigned = data[1].count;
      engagement_today = data[2].count;
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Hows My Day fetched Successfully",
      data: {
        ...(user_type === "Active" && { new_assigned: active_client_assigned }),
        ...(user_type === "Active" && { not_started: not_started }),
        ...(user_type === "OC" && { ocl: OCL }),
        ...(user_type === "Active" && { naf: NAF }),
        ...(user_type === "Active" && { icl: ICL }),
        ...((user_type === "Active" || user_type === "OC") && {
          unanswered_queries: unanswered_queries,
        }),
        ...(user_type === "Active" && { drafted_queries }),
        ...(user_type === "Active" && { pending_diet }),
        ...(user_type === "Active" && { drafted_diet }),
        ...(user_type === "Active" && { pre_attempted_diet }),
        call_booked: call_booked,
        ...(String(user_type).toLowerCase() === "lead" && { leads_to_capture }),
        ...(String(user_type).toLowerCase() === "lead" && { leads_assigned }),
        today_fu,
        action_assigned,
        ...(String(user_type).toLowerCase() !== "lead" && { com_clients }),
        ...(String(user_type).toLowerCase() === "lead" && {
          engagement_today,
        }),
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//salesOpportunity

const salesOpportunitys = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await salesOpportunitysActiveFilterData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const leads_to_capture = getCountByKey("leads_to_capture");
    const ocl = getCountByKey("ocl");
    const unconverted_referrals = getCountByKey("unconverted_referrals");
    const unconverted_referrals_month = getCountByKey(
      "unconverted_referrals_month",
    );
    const good_weight_loss = getCountByKey("good_weight_loss");
    const clients_giving_multiple_referrals = getCountByKey(
      "clients_giving_multiple_referrals",
    );
    const tailend_clients_no_adv_purchase = getCountByKey(
      "tailend_clients_no_adv_purchase",
    );
    const clients_expired_in_last_30_days = getCountByKey(
      "clients_expired_in_last_30_days",
    );
    const active_no_adv_purchase = getCountByKey("active_no_adv_purchase");
    const spin_to_win = getCountByKey("spin_to_win");
    const diet_feedback = getCountByKey("diet_feedback");
    const healthscore_ht = getCountByKey("healthscore_ht");
    const healthscore_te = getCountByKey("healthscore_te");
    const healthscore_ht_te = healthscore_ht + healthscore_te;

    const feedback_ht = getCountByKey("feedback_ht");
    const feedback_te = getCountByKey("feedback_te");
    const feedback_ht_te = feedback_ht + feedback_te;

    const link_expiring_today_sp = getCountByKey("link_expiring_today_sp");
    const link_expiring_today_service = getCountByKey(
      "link_expiring_today_service",
    );

    const goal = getCountByKey("goal");

    const activeResponse = [
      {
        key: "leads_to_capture",
        count: leads_to_capture,
        user_ids: safeJSONParse(getUserIdsByKey("leads_to_capture")),
      },
      {
        key: "ocl",
        count: ocl,
        user_ids: safeJSONParse(getUserIdsByKey("ocl")),
      },
      {
        key: "unconverted_referrals",
        count: unconverted_referrals,
        user_ids: safeJSONParse(getUserIdsByKey("unconverted_referrals")),
      },
      {
        key: "good_weight_loss",
        count: good_weight_loss,
        user_ids: safeJSONParse(getUserIdsByKey("good_weight_loss")),
      },
      {
        key: "clients_giving_multiple_referrals",
        count: clients_giving_multiple_referrals,
        user_ids: safeJSONParse(
          getUserIdsByKey("clients_giving_multiple_referrals"),
        ),
      },
      {
        key: "tailend_clients_no_adv_purchase",
        count: tailend_clients_no_adv_purchase,
        user_ids: safeJSONParse(
          getUserIdsByKey("tailend_clients_no_adv_purchase"),
        ),
      },
      {
        key: "clients_expired_in_last_30_days",
        count: clients_expired_in_last_30_days,
        user_ids: safeJSONParse(
          getUserIdsByKey("clients_expired_in_last_30_days"),
        ),
      },
      {
        key: "active_no_adv_purchase",
        count: active_no_adv_purchase,
        user_ids: safeJSONParse(getUserIdsByKey("active_no_adv_purchase")),
      },
      {
        key: "spin_to_win",
        count: spin_to_win,
        user_ids: safeJSONParse(getUserIdsByKey("spin_to_win")),
      },

      {
        key: "goal",
        count: goal,
        user_ids: safeJSONParse(getUserIdsByKey("goal")),
      },
      {
        key: "link_expiring_today",
        count:
          Number(link_expiring_today_service) +
            Number(link_expiring_today_sp) || 0,
        user_ids: [
          ...safeJSONParse(getUserIdsByKey("link_expiring_today_sp")),
          ...safeJSONParse(getUserIdsByKey("link_expiring_today_service")),
        ],
      },
      {
        key: "healthscore_ht_te",
        count: healthscore_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("healthscore_ht")),
            ...safeJSONParse(getUserIdsByKey("healthscore_te")),
          ]),
        ],
      },
      {
        key: "feedback_ht_te",
        count: feedback_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("feedback_ht")),
            ...safeJSONParse(getUserIdsByKey("feedback_te")),
          ]),
        ],
      },
      {
        key: "diet_feedback",
        count: diet_feedback,
        user_ids: safeJSONParse(getUserIdsByKey("diet_feedback")),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "salesOpportunitys fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
/**
 * @function ocBucket
 * @description Fetches ocr buckets based on given mentor id
 * @param {Object} req - request object
 * @param {Object} res - response object
 * @param {Function} next - next middleware
 * @returns {Promise} - promise resolving to an ApiResponse
 */

export const ocBucket = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await ocBucketData({ mentor_id });
    console.log(data, 495);

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    // Generic helper to merge multiple buckets

    //  Individual OCR Buckets
    const first_pitched = {
      key: "first_pitched",
      count: getCountByKey("first_pitched"),
      user_ids: safeJSONParse(getUserIdsByKey("first_pitched")),
    };

    const rate_shared = {
      key: "rate_shared",
      count: getCountByKey("rate_shared"),
      user_ids: safeJSONParse(getUserIdsByKey("rate_shared")), //safeArray("rate_shared"),
    };

    const not_pitched = {
      key: "not_pitched",
      count: getCountByKey("not_pitched"),
      user_ids: safeJSONParse(getUserIdsByKey("not_pitched")), //safeArray("not_pitched"),
    };

    const ocr_with_70kg_plus = {
      key: "ocr_with_70kg_plus",
      count: getCountByKey("ocr_with_70kg_plus"),
      user_ids: safeJSONParse(getUserIdsByKey("ocr_with_70kg_plus")), //safeArray("ocr_with_70kg_plus"),
    };

    const ocr_with_3_plus_program = {
      key: "ocr_with_3_plus_program",
      count: getCountByKey("ocr_with_3_plus_program"),
      user_ids: safeJSONParse(getUserIdsByKey("ocr_with_3_plus_program")), //safeArray("ocr_with_3_plus_program"),
    };
    const ocr_with_good_feedback = {
      key: "ocr_with_good_feedback",
      count:
        getCountByKey("ocr_with_good_feedback_ht") +
        getCountByKey("ocr_with_good_feedback_ff"),
      user_ids: [
        ...new Set([
          ...safeJSONParse(getUserIdsByKey("ocr_with_good_feedback_ht")),
          ...safeJSONParse(getUserIdsByKey("ocr_with_good_feedback_ff")),
        ]),
      ],
    };

    const activeResponse = [
      // OCR Buckets
      first_pitched,
      rate_shared,
      not_pitched,
      ocr_with_70kg_plus,
      ocr_with_3_plus_program,
      ocr_with_good_feedback,
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "salesOpportunitys fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getReferralsByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("UserId is Required", 400));

    const selectFields = [
      "ud.user_id",
      "ud.first_name",
      "ud.email_id",
      "ud.phone",
      "ud.user_status",
      "ud.added_date",
    ];

    const conditions = [
      { field: "ud.referred_by", operator: "=", value: user_id },
    ];

    const { results: rows } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions,
      orderBy: ["ud.added_date DESC"],
    });

    const data = rows.map((user) => ({
      id: user.user_id,
      name: user.first_name,
      email: user.email_id,
      phone: user.phone,
      status: user.user_status,
      referred_on: user.added_date,
    }));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Referrals fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

export const getActiveAdminUsersBasicList = async (req, res, next) => {
  try {
    const { role_id } = req.query;
    const selectFields = [
      "admin_user_id",
      "crm_user as mentor_name",
      "official_phone",
    ];

    const conditions = [
      { field: "is_active", operator: "=", value: 1 },
      { field: "admin_user_id", operator: "!=", value: 196 },
    ];
    if (role_id) {
      conditions.push({ field: "role_id", operator: "=", value: role_id });
    }

    const { results: rows } = await readRecord({
      table: "admin_users",
      selectFields,
      conditions,
      orderBy: ["total_experience ASC"],
    });

    const data = rows.map((user) => ({
      admin_id: user.admin_user_id,
      mentor_name: user.mentor_name,
      phone: user.official_phone,
    }));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Active admin users fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

export const activeSalesBifurcation = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await activeSalesBifurcationData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const clients_giving_multiple_referrals = getCountByKey(
      "clients_giving_multiple_referrals",
    );
    const clients_giving_multiple_referrals_oc = getCountByKey(
      "clients_giving_multiple_referrals_oc",
    );

    const tailend_clients_no_adv_purchase = getCountByKey(
      "tailend_clients_no_adv_purchase",
    );

    const active_no_adv_purchase = getCountByKey("active_no_adv_purchase");
    const active_adv_purchase = getCountByKey("active_adv_purchase");

    const activeResponse = [
      {
        key: "tailend_clients_no_adv_purchase",
        count: tailend_clients_no_adv_purchase,
        user_ids: safeJSONParse(
          getUserIdsByKey("tailend_clients_no_adv_purchase"),
        ),
      },
      {
        key: "active_no_adv_purchase",
        count: active_no_adv_purchase,
        user_ids: safeJSONParse(getUserIdsByKey("active_no_adv_purchase")),
      },
      {
        key: "active_adv_purchase",
        count: active_adv_purchase,
        user_ids: safeJSONParse(getUserIdsByKey("active_adv_purchase")),
      },
      {
        key: "clients_giving_multiple_referrals",
        count: clients_giving_multiple_referrals,
        user_ids: safeJSONParse(
          getUserIdsByKey("clients_giving_multiple_referrals"),
        ),
      },
      {
        key: "clients_giving_multiple_referrals_oc",
        count: clients_giving_multiple_referrals_oc,
        user_ids: safeJSONParse(
          getUserIdsByKey("clients_giving_multiple_referrals_oc"),
        ),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "activeSalesBifurcationData fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const activeMaintanenceBifurcation = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await activeMaintanenceBifurcationData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const clients_expired_in_last_30_days = getCountByKey(
      "clients_expired_in_last_30_days",
    );
    const maintanence_active = getCountByKey("maintanence_active");
    const maintanence_active_with_adv = getCountByKey(
      "maintanence_active_with_adv",
    );

    const activeResponse = [
      {
        key: "maintanence_active",
        count: maintanence_active,
        user_ids: safeJSONParse(getUserIdsByKey("maintanence_active")),
      },
      {
        key: "maintanence_active_with_adv",
        count: maintanence_active_with_adv,
        user_ids: safeJSONParse(getUserIdsByKey("maintanence_active_with_adv")),
      },
      {
        key: "clients_expired_in_last_30_days",
        count: clients_expired_in_last_30_days,
        user_ids: safeJSONParse(
          getUserIdsByKey("clients_expired_in_last_30_days"),
        ),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "activeMaintanenceBifurcationData fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const salesOpportunitysClient = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await salesOpportunitysClientFilterData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    // const spin_to_win = getCountByKey("spin_to_win");
    const diet_feedback = getCountByKey("diet_feedback");
    const healthscore_oc = getCountByKey("healthscore_oc");
    const weight_tracker_oc = getCountByKey("weight_tracker_oc");
    const healthscore_ht_te = getCountByKey("improved_health_score");
    // const healthscore_ht = getCountByKey("healthscore_ht");
    // const healthscore_te = getCountByKey("healthscore_te");
    // const healthscore_ht_te = healthscore_ht + healthscore_te;

    const feedback_ht = getCountByKey("feedback_ht");
    const feedback_te = getCountByKey("feedback_te");
    const feedback_ht_te = feedback_ht + feedback_te;

    const link_expiring_today_sp = getCountByKey("link_expiring_today_sp");
    const link_expiring_today_service = getCountByKey(
      "link_expiring_today_service",
    );

    // console.log(data?.link_expiring_today_sp,data?.link_expiring_today_service, 'hello');

    const goal = getCountByKey("goals_filled");
    const good_weight_loss_5th = getCountByKey("good_weight_loss_5th");
    const good_weight_loss_active = getCountByKey("good_weight_loss_active");
    const good_weight_loss_oc = getCountByKey("good_weight_loss_oc");

    const good_weight_loss_10th = getCountByKey("good_weight_loss_10th");
    const calls_5_rating = getCountByKey("calls_5_rating");
    const sales_followups = getCountByKey("sales_follow_ups");
    const first_pitched_48Hrs_ago = getCountByKey("first_pitched_48Hrs_ago");
    const pitched_48Hrs_ago = getCountByKey("pitched_48Hrs_ago");
    const milestone = getCountByKey("milestone");
    
    const cart_added = getCountByKey("cart_added");
    const cart_added_today = getCountByKey("cart_added_today");
    const cart_added_oc = getCountByKey("cart_added_oc");
    const cart_added_oc_today = getCountByKey("cart_added_oc_today");
    const cart_added_lead = getCountByKey("cart_added_lead");
    const cart_added_lead_today = getCountByKey("cart_added_lead_today");

    const share_cart_link_added = getCountByKey("share_cart_link_added");
    const share_cart_link_added_today = getCountByKey(
      "share_cart_link_added_today",
    );
    const share_cart_link_added_oc = getCountByKey("share_cart_link_added_oc");
    const share_cart_link_added_oc_today = getCountByKey(
      "share_cart_link_added_oc_today",
    );
    const share_cart_link_added_lead = getCountByKey(
      "share_cart_link_added_lead",
    );
    const share_cart_link_added_lead_today = getCountByKey(
      "share_cart_link_added_lead_today",
    );

  
    const activeResponse = [

      {
        key: "oc_weight_tracker",
        count: weight_tracker_oc,
        user_ids: safeJSONParse(getUserIdsByKey("weight_tracker_oc")),
      },

      {
        key: "oc_healthscore",
        count: healthscore_oc,
        user_ids: safeJSONParse(getUserIdsByKey("healthscore_oc")),
      },
      
      {
        key: "cart_added_mtd",
        count: cart_added + cart_added_oc + cart_added_lead,
        user_ids: safeJSONParse(getUserIdsByKey("cart_added")),
      },
      {
        key: "share_cart_link_added_mtd",
        count:
          share_cart_link_added +
          share_cart_link_added_oc +
          share_cart_link_added_lead,
        user_ids: safeJSONParse(getUserIdsByKey("share_cart_link_added")),
      },
      {
        key: "share_cart_link_added_today",
        count:
          share_cart_link_added_today +
          share_cart_link_added_oc_today +
          share_cart_link_added_lead_today,
        user_ids: safeJSONParse(getUserIdsByKey("share_cart_link_added_today")),
      },
      {
        key: "cart_added_today",
        count: cart_added_today + cart_added_oc_today + cart_added_lead_today,
        user_ids: safeJSONParse(getUserIdsByKey("cart_added_today")),
      },
      {
        key: "sales_followups",
        count: sales_followups,
        user_ids: safeJSONParse(getUserIdsByKey("sales_follow_ups")),
      },

      {
        key: "good_tracker_(5th)",
        count: good_weight_loss_5th,
        user_ids: safeJSONParse(getUserIdsByKey("good_weight_loss_5th")),
      },
      {
        key: "good_tracker_(10th)",
        count: good_weight_loss_10th,
        user_ids: safeJSONParse(getUserIdsByKey("good_weight_loss_10th")),
      },
      {
        key: "Good_Wt_Loss_(Active)",
        count: good_weight_loss_active,
        user_ids: safeJSONParse(getUserIdsByKey("good_weight_loss_active")),
      },
      {
        key: "Good_Wt_Loss_(OC)",
        count: good_weight_loss_oc,
        user_ids: safeJSONParse(getUserIdsByKey("good_weight_loss_oc")),
      },
      {
        key: "good_feedback_(ht_&_te)",
        count: feedback_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("feedback_ht")),
            ...safeJSONParse(getUserIdsByKey("feedback_te")),
          ]),
        ],
      },
      {
        key: "good_diet_feedback",
        count: diet_feedback,
        user_ids: safeJSONParse(getUserIdsByKey("diet_feedback")),
      },
      {
        key: "improved_health_score_(ht_&_te)",
        count: healthscore_ht_te,
        user_ids: safeJSONParse(getUserIdsByKey("improved_health_score")),
        // user_ids: [
        //   ...new Set([
        //     ...safeJSONParse(getUserIdsByKey("healthscore_ht")),
        //     ...safeJSONParse(getUserIdsByKey("healthscore_te")),
        //   ]),
        // ],
      },
      
      {
        key: "milestone",
        count: milestone,
        user_ids: safeJSONParse(getUserIdsByKey("milestone")),
      },
      {
        key: "goal_filled",
        count: goal,
        user_ids: safeJSONParse(getUserIdsByKey("goals_filled")),
      },
      {
        key: "calls_(5_rating)",
        count: calls_5_rating,
        user_ids: safeJSONParse(getUserIdsByKey("calls_5_rating")),
      },
      {
        key: "first_pitched_no_fu",
        count: first_pitched_48Hrs_ago,
        user_ids: safeJSONParse(getUserIdsByKey("first_pitched_48Hrs_ago")),
      },
      {
        key: "pitched_no_fu",
        count: pitched_48Hrs_ago,
        user_ids: safeJSONParse(getUserIdsByKey("pitched_48Hrs_ago")),
      },
      {
        key: "link_expiring_today",
        count:
          Number(link_expiring_today_service) +
            Number(link_expiring_today_sp) || 0,
        user_ids: [
          ...safeJSONParse(getUserIdsByKey("link_expiring_today_sp")),
          ...safeJSONParse(getUserIdsByKey("link_expiring_today_service")),
        ],
      },
      // {
      //   key: "spin_taken",
      //   count: spin_to_win,
      //   user_ids: safeJSONParse(getUserIdsByKey("spin_to_win")),
      // },
      // {
      //   key: "wallet_activity",
      //   count: wallet_activity,
      //   user_ids: safeJSONParse(getUserIdsByKey("wallet_activity")),
      // },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "salesOpportunitys Clients fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const leadToCaptureData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const oclData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const unconvertedReferralsData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;
    const { results: referralData } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd2.first_name, ''), ' ', COALESCE(cd2.last_name, '')) AS referred_by",
        "cd2.email_id",
        "cd2.phone",
        "cd.referred_by referred_by_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd2`,
          on: "cd.referred_by = cd2.user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "IN", value: ids }],
    });
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
            referred_by: referralData[index]?.referred_by,
            referred_by_id: referralData[index]?.referred_by_id,
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const goodWeightLossData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    // 👇 already includes client_weight_difference when active_program: true
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    let bucket_5_10 = [];
    let bucket_10_plus = [];
    let all_users = [];
    let weightDiff = 0;
    details.forEach((detail, index) => {
      const user_id = ids[index];

      if (detail?.client_user_status === "Active") {
        weightDiff =
          (detail?.sop_end_weight - detail?.sop_start_weight) * -1 || 0;
      } else {
        weightDiff =
          (detail?.overall_end_weight - detail?.overall_start_weight) * -1 || 0;
      }

      // console.log(weightDiff,1127);
      const mapped = mapUserData({
        details: detail,
        user: user_id,
        addExtraKeyTo: {
          user_details: {
            user_id,
            whatsapp_text: "",
            weight_diff: weightDiff,
          },
        },
        addFields: {
          follow_up: true,
        },
      });

      all_users.push(mapped);

      if (weightDiff >= 5 && weightDiff < 10) {
        bucket_5_10.push(mapped);
      } else if (weightDiff >= 10) {
        bucket_10_plus.push(mapped);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        all: all_users,
        range_5_10: bucket_5_10,
        range_10_plus: bucket_10_plus,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const activeMaintanenceData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    // Fetching user details using the function defined elsewhere
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
        maintenance_details: true, // Add maintenance details flag to include it in the select
      },
      ...(search && searchObj),
    });

    // Mapping the user data and adding extra fields such as maintenance start date and end date
    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
          // Adding the maintenance details
        },
        addFields: {
          follow_up: true,
        },
        extraMappings: {
          maintenance_details: {
            maintenance_start_date: details[index]?.maintenance_start_date
              ? moment(details[index].maintenance_start_date).format(
                  "DD/MM/YYYY",
                )
              : null,

            maintenance_end_date: details[index]?.maintenance_end_date
              ? moment(details[index].maintenance_end_date).format("DD/MM/YYYY")
              : null,
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const clientsGivingMultipleReferralsData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const tailendClientsNoAdvPurchaseData = async (req, res, next) => {
  const { user_ids: ids = [], search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    // 1. Fetch full user data
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal: true,
        goal_weight: true,
        final_feedback: true,
        halftime_feedback: true,
        is_active: true,
      },
      ...(search ? searchObj : {}),
    });

    // 2. Define all filters
    const filterGroups = [
      {
        key: "away_goal_weight",
        filterFn: (d) =>
          d.client_latest_weight &&
          d.goal_weight &&
          parseFloat(d.client_latest_weight) > parseFloat(d.goal_weight),
      },
      {
        key: "new_goal_positive_feedback",
        filterFn: (d) =>
          d.comment &&
          d.client_final_mentor_rating &&
          parseInt(d.client_final_mentor_rating) >= 4,
      },
      {
        key: "goal_and_halftime_feedback",
        filterFn: (d) =>
          d.comment &&
          d.client_halftime_mentor_rating &&
          parseInt(d.client_halftime_mentor_rating) >= 4,
      },
    ];

    // 3. Apply filters and track matched user_ids
    const results = [];
    const matchedUserIds = new Set();

    for (const { key, filterFn } of filterGroups) {
      const matched = details.filter(filterFn);
      matched.forEach((u) => matchedUserIds.add(u.client_user_id));
      results.push({
        key,
        count: matched.length,
        users: matched.map((d) =>
          mapUserData({
            details: d,
            user: d.client_user_id,
            addExtraKeyTo: {
              user_details: {
                user_id: d.client_user_id,
                whatsapp_text: "",
              },
            },
          }),
        ),
      });
    }

    // 4. Others = not matched by any above filter
    const others = details.filter((d) => !matchedUserIds.has(d.client_user_id));

    results.push({
      key: "others",
      count: others.length,
      users: others.map((d) =>
        mapUserData({
          details: d,
          user: d.client_user_id,
          addExtraKeyTo: {
            user_details: {
              user_id: d.client_user_id,
              whatsapp_text: "",
            },
          },
        }),
      ),
    });

    // 5. All = full data
    results.push({
      key: "all",
      count: details.length,
      users: details.map((d) =>
        mapUserData({
          details: d,
          user: d.client_user_id,
          addExtraKeyTo: {
            user_details: {
              user_id: d.client_user_id,
              whatsapp_text: "",
            },
          },
        }),
      ),
    });

    // 6. Return response
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "All groups fetched successfully",
        data: results,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const clientsExpiredInLast30DaysData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const activeNoAdvPurchaseData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const ocRatesharedData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.mentor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["latest_health.created DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const ocNotPitchedData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.mentor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const ocFirstPitchedData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.mentor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const ocMultipleProgramData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.mentor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const ocGoodFeedbackData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.mentor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const oc70PlusData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.mentor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const activeWithAdvPurchaseData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const spinToWinData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        spin_to_win: true,
      },
      ...(search && searchObj),
    });

    const groupedData = {
      Active: [],
      Completed: [],
      Lead: [],
      All: [],
    };

    for (const item of details) {
      const enrichedData = mapUserData({
        details: item,
        user: item.client_user_id,
        addExtraKeyTo: {
          user_details: {
            user_id: item.client_user_id,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          prize_details: {
            comment: item?.comment || "",
            prize: item?.prize || "",
            added_date: item?.added_date
              ? moment(item.added_date).format("DD MMM YYYY")
              : null,
          },
        },
      });

      groupedData.All.push(enrichedData);

      const status = item?.client_user_status;
      if (status === "Active") {
        groupedData.Active.push(enrichedData);
      } else if (status === "Completed") {
        groupedData.Completed.push(enrichedData);
      } else if (status === "Lead") {
        groupedData.Lead.push(enrichedData);
      }
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: groupedData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const fitnessChallengeData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const walletOfferData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    const all = [];
    const active = [];
    const completed = [];

    for (let i = 0; i < ids.length; i++) {
      const detail = details[i];
      const mappedUser = mapUserData({
        details: detail,
        user: ids[i],

        addExtraKeyTo: {
          user_details: {
            user_id: ids[i],
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });

      all.push(mappedUser);

      const status = detail?.client_user_status;
      if (status === "Active") active.push(mappedUser);
      else if (status === "Completed") completed.push(mappedUser);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched and grouped successfully",
      data: {
        all,
        active,
        completed,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const watiData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    const all = [];
    const active = [];
    const completed = [];

    for (let i = 0; i < ids.length; i++) {
      const detail = details[i];
      const mappedUser = mapUserData({
        details: detail,
        user: ids[i],

        addExtraKeyTo: {
          user_details: {
            user_id: ids[i],
            whatsapp_text: "",
            wati_added_date: detail?.wati_added_date,
          },
        },
        addFields: {
          follow_up: true,
        },
      });

      all.push(mappedUser);

      const status = detail?.client_user_status;
      if (status === "Active") active.push(mappedUser);
      else if (status === "Completed") completed.push(mappedUser);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched and grouped successfully",
      data: {
        all: all.sort(
          (a, b) =>
            new Date(b.user_details.wati_added_date) -
            new Date(a.user_details.wati_added_date),
        ),
        active: active.sort(
          (a, b) =>
            new Date(b.user_details.wati_added_date) -
            new Date(a.user_details.wati_added_date),
        ),
        completed: completed.sort(
          (a, b) =>
            new Date(b.user_details.wati_added_date) -
            new Date(a.user_details.wati_added_date),
        ),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getSmartScaleData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  try {
    let doc_ids = [];
    let user_ids = [];

    ids.forEach((id_data) => {
      doc_ids.push(id_data._id);
      user_ids.push(id_data.user_id);
    });

    const weightData = await SmartScaleData.find({
      _id: { $in: doc_ids },
    })
      .sort({ createdAt: -1 })
      .lean();

    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    const details = await fetchUsersDetailsNew({
      ids: user_ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    const groupedResult = {
      "5th day": { active: [], completed: [], all: [] },
      "10th day": { active: [], completed: [], all: [] },
      other: { active: [], completed: [], all: [] },
    };

    user_ids.forEach((user, index) => {
      const detail = details[index];
      const scaleWeightData = weightData.find((c) => c.user_id === user);

      const mapped = mapUserData({
        details: detail,
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          query_details: scaleWeightData || {
            user_id: "NA",
            weight_day: "NA",
            weight_value: "NA",
            createdAt: "NA",
            updatedAt: "NA",
          },
        },
      });

      let bucketKey = "other";
      const weightDay = scaleWeightData?.weight_day;

      if (weightDay === 5) bucketKey = "5th day";
      else if (weightDay === 10) bucketKey = "10th day";

      const status = detail?.client_user_status?.toLowerCase();

      if (status === "active") groupedResult[bucketKey].active.push(mapped);
      else if (status === "completed")
        groupedResult[bucketKey].completed.push(mapped);

      groupedResult[bucketKey].all.push(mapped);
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: groupedResult,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const milestoneClientData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          milestone_filled: safeJSONParse(details[index].comment)
            ?.milestone_achieved,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//salesOpportunity

//salesFollowupAndRisk
const salesFollowupAndRisk = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await salesFollowupAndRiskActiveFilterData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const first_pitched = getCountByKey("first_pitched");
    const pitched_but_no_fu = getCountByKey("pitched_but_no_fu");
    const sales_follow_ups = getCountByKey("sales_follow_ups");
    const payment_details_shared = getCountByKey("payment_details_shared");
    const payment_details_expired = getCountByKey("payment_details_expired");

    const goal = getCountByKey("goal");
    const payment_details_shared_month = getCountByKey(
      "payment_details_shared_month",
    );
    const payment_details_expired_month = getCountByKey(
      "payment_details_expired_month",
    );

    const activeResponse = [
      {
        key: "first_pitched",
        count: first_pitched,
        user_ids: safeJSONParse(getUserIdsByKey("first_pitched")),
      },
      {
        key: "pitched_but_no_fu",
        count: pitched_but_no_fu,
        user_ids: safeJSONParse(getUserIdsByKey("pitched_but_no_fu")),
      },
      {
        key: "sales_follow_ups",
        count: sales_follow_ups,
        user_ids: safeJSONParse(getUserIdsByKey("sales_follow_ups")),
      },
      {
        key: "payment_details_shared",
        count: payment_details_shared,
        user_ids: safeJSONParse(getUserIdsByKey("payment_details_shared")),
      },
      {
        key: "payment_details_expired",
        count: payment_details_expired,
        user_ids: safeJSONParse(getUserIdsByKey("payment_details_expired")),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "salesFollowupAndRisk fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const mtdFollowUpsRisksLead = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await mtdFollowUpsRisksLeadData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const lead_to_capture = getCountByKey("lead_to_capture");
    const rate_shared = getCountByKey("rate_shared");
    const first_pitched = getCountByKey("first_pitched");
    const payment_details_shared = getCountByKey("payment_details_shared");
    const payment_details_expired = getCountByKey("payment_details_expired");
    const assigned_lead_and_refs = getCountByKey("assigned_lead_and_refs");
    const followups_pending = getCountByKey("followups_pending");

    const activeResponse = [
      {
        key: "lead_to_capture",
        count: lead_to_capture,
        user_ids: safeJSONParse(getUserIdsByKey("lead_to_capture")),
      },
      {
        key: "rate_shared",
        count: rate_shared,
        user_ids: safeJSONParse(getUserIdsByKey("rate_shared")),
      },
      {
        key: "1st_pitched",
        count: first_pitched,
        user_ids: safeJSONParse(getUserIdsByKey("first_pitched")),
      },
      {
        key: "payment_details_shared",
        count: payment_details_shared,
        user_ids: safeJSONParse(getUserIdsByKey("payment_details_shared")),
      },
      {
        key: "payment_details_expired",
        count: payment_details_expired,
        user_ids: safeJSONParse(getUserIdsByKey("payment_details_expired")),
      },
      {
        key: "assigned_lead_and_refs",
        count: assigned_lead_and_refs,
        user_ids: safeJSONParse(getUserIdsByKey("assigned_lead_and_refs")),
      },
      {
        key: "followups_pending",
        count: followups_pending,
        user_ids: safeJSONParse(getUserIdsByKey("followups_pending")),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "salesFollowupAndRisk fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const mtdFollowUpsRisksClient = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);
    const data = await mtdFollowUpsRisksClientData({ mentor_id });

    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const rate_shared = getCountByKey("rate_shared");
    const first_pitched = getCountByKey("first_pitched");
    const payment_details_shared = getCountByKey("payment_details_shared");
    const payment_details_expired = getCountByKey("payment_details_expired");
    const followups_pending = getCountByKey("followups_pending");

    const activeResponse = [
      {
        key: "rate_shared",
        count: rate_shared,
        user_ids: safeJSONParse(getUserIdsByKey("rate_shared")),
      },
      {
        key: "1st_pitched",
        count: first_pitched,
        user_ids: safeJSONParse(getUserIdsByKey("first_pitched")),
      },
      {
        key: "payment_details_shared",
        count: payment_details_shared,
        user_ids: safeJSONParse(getUserIdsByKey("payment_details_shared")),
      },
      {
        key: "payment_details_expired",
        count: payment_details_expired,
        user_ids: safeJSONParse(getUserIdsByKey("payment_details_expired")),
      },
      {
        key: "followups_pending",
        count: followups_pending,
        user_ids: safeJSONParse(getUserIdsByKey("followups_pending")),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "salesFollowupAndRisk fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const firstPitchedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    const all = [];
    const active = [];
    const completed = [];

    for (let i = 0; i < ids.length; i++) {
      const detail = details[i];
      const mappedUser = mapUserData({
        details: detail,
        user: ids[i],

        addExtraKeyTo: {
          user_details: {
            user_id: ids[i],
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });

      all.push(mappedUser);

      const status = detail?.client_user_status;
      if (status === "Active") active.push(mappedUser);
      else if (status === "Completed") completed.push(mappedUser);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched and grouped successfully",
      data: {
        all,
        active,
        completed,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const ackEkitTracker = async (req, res, next) => {
  try {
    const { menu_id, table_name, mentor_id } = req.body;

    // Validate required fields
    if (!menu_id && !table_name) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    if (table_name == "user_restaurant_menu") {
      const ekitTrackerUpdate = await updateRecord(
        table_name,
        {
          ack: 1,
          ack_by: mentor_id,
          ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        {
          menu_id: menu_id,
        },
      );

      if (!ekitTrackerUpdate || ekitTrackerUpdate.affectedRows === 0) {
        return next(
          new ErrorHandler("goal record not found or not updated", 404),
        );
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Ekit Tracker Acknowledge Successfully",
        }),
      );
    } else {
      const ekitTrackerUpdate = await updateRecord(
        table_name,
        {
          ack: 1,
          ack_by: mentor_id,
          ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        {
          alcohol_menu_id: menu_id,
        },
      );

      if (!ekitTrackerUpdate || ekitTrackerUpdate.affectedRows === 0) {
        return next(
          new ErrorHandler("goal record not found or not updated", 404),
        );
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Ekit Tracker Acknowledge Successfully",
        }),
      );
    }
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const ekitTrackerData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
        restaurant_menu: true, // Include restaurant menu
        alcohol_menu: true, // Include alcohol menu
      },
      ...(search && searchObj),
    });

    const alcoholFilled = []; // To store users with alcohol menu data
    const restaurantFilled = []; // To store users with restaurant menu data

    // Process each user and categorize based on available menu
    for (let i = 0; i < ids.length; i++) {
      const detail = details[i];
      const mappedUser = mapUserData({
        details: detail,
        user: ids[i],

        addExtraKeyTo: {
          user_details: {
            user_id: ids[i],
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
          restaurant_menu: true, // Add restaurant menu to user data
          alcohol_menu: true, // Add alcohol menu to user data
        },
      });

      const userData = {
        user_details: mappedUser.user_details,
        program_details: mappedUser.program_details,
        suggested_program_details: mappedUser.suggested_program_details,
      };

      // Check if alcohol menu exists and has data
      if (
        mappedUser.alcohol_menu &&
        Object.keys(mappedUser.alcohol_menu).length > 0 &&
        mappedUser.alcohol_menu.menu_id
      ) {
        console.log(
          `Alcohol menu found for user ${ids[i]} ${mappedUser.alcohol_menu}`,
        );
        alcoholFilled.push({
          ...userData,
          alcohol_menu: mappedUser.alcohol_menu, // Keep as an object
        });
      }
      // Check if restaurant menu exists and has data
      if (
        mappedUser.restaurant_menu &&
        Object.keys(mappedUser.restaurant_menu).length > 0 &&
        mappedUser.restaurant_menu.menu_id
      ) {
        console.log(`Restaurant menu found for user ${ids[i]}`);
        restaurantFilled.push({
          ...userData,
          restaurant_menu: mappedUser.restaurant_menu, // Keep as an object
        });
      }
    }

    // Final API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        user_alcohol_menu: alcoholFilled, // Data for users with alcohol menu
        user_restaurant_menu: restaurantFilled, // Data for users with restaurant menu
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in fetching or processing data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const pitchedButNoFuData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

/**
 * @api {post} /mentor-dashboard/rateshared-data-lead
 * @apiName Get Rate Shared data for Lead
 * @apiGroup Mentor Dashboard
 * @apiDescription Get Rate Shared data for Lead
 * @apiHeader {String} authorization Bearer token
 * @apiParam {Number[]} user_ids Array of user ids
 * @apiParam {String} search Search query
 * @apiParam {Number} page Page number
 * @apiParam {Number} limit Number of records per page
 * @apiSuccess {Object[]} data Data of users
 * @apiSuccess {Number} totalCount Total number of records
 * @apiError {Object} 400 Invalid request
 * @apiError {Object} 500 Internal server error
 * @apiSampleRequest off
 */
export const ratesharedDataLead = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
        ...selectMap.get("consultation_new"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
        ...joinsMap.get("consultation_new"),
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};
export const firstPitchedDataLead = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};
/**
 * @api {post} /mentor-dashboard/leads-ref-data
 * @apiName Get leads ref data
 * @apiGroup Mentor Dashboard
 * @apiDescription Get leads ref data
 * @apiHeader {String} authorization Bearer token
 * @apiParam {Number[]} user_ids Array of user ids
 * @apiParam {String} search Search query
 * @apiParam {Number} page Page number
 * @apiParam {Number} limit Number of records per page
 * @apiSuccess {Object[]} data Data of users
 * @apiSuccess {Number} totalCount Total number of records
 * @apiError {Object} 400 Invalid request
 * @apiError {Object} 500 Internal server error
 * @apiSampleRequest off
 */
export const leadsRefsData = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

/**
 * @description API to fetch lead to capture data for sales follow up
 * @param {object} req - request object
 * @param {object} res - response object
 * @param {function} next - next function
 * @returns {object} - API response object
 * @throws {Error} - if there is an error
 */
export const salesFollowUpsDataLead = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

/**
 * @api {post} /mentor-dashboard/payment-details-shared-data-lead
 * @apiName Get Payment Details Shared Data for Lead
 * @apiGroup Mentor Dashboard
 * @apiDescription Retrieve payment details shared data for leads based on user IDs.
 * @apiHeader {String} authorization Bearer token
 * @apiParam {Number[]} user_ids Array of user IDs
 * @apiParam {String} search Search query
 * @apiParam {Number} page Page number
 * @apiParam {Number} limit Number of records per page
 * @apiSuccess {Object[]} data Data of users with payment details shared
 * @apiSuccess {Number} totalCount Total number of records
 * @apiError {Object} 400 Invalid request
 * @apiError {Object} 500 Internal server error
 * @apiSampleRequest off
 */

export const paymentDetailsSharedDataLead = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

/**
 * @api {post} /mentor-dashboard/payment-details-expired-data-lead
 * @apiName paymentDetailsExpiredDataLead
 * @apiGroup Mentor Dashboard
 * @apiDescription Get payment details expired data lead
 *
 * @apiBody {Array} user_ids Array of user ids
 * @apiBody {String} [search] Search text
 * @apiBody {Number} [page=1] Page number
 * @apiBody {Number} [limit=10] Limit per page
 *
 * @apiSuccess {Object[]} data List of lead data
 * @apiSuccess {Number} totalCount Total count of records
 *
 * @apiError {Object} 400 Invalid request
 * @apiError {Object} 500 Internal server error
 */
export const paymentDetailsExpiredDataLead = async (req, res, next) => {
  try {
    const { user_ids: ids, search, page, limit } = req.body;

    if (!ids.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("health_score"),
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.user_id",
          operator: "IN",
          value: ids,
        },
      ],
      orderBy: ["cd.added_date DESC"],
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead to capture data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

/**
 * @api {post} /mentor-dashboard/rateshared-data
 * @apiName Get Rate Shared data
 * @apiGroup Mentor Dashboard
 * @apiDescription Get Rate Shared data
 * @apiHeader {String} authorization Bearer token
 * @apiParam {Number[]} user_ids Array of user ids
 * @apiParam {String} [search] Search query
 * @apiSuccess {Object[]} data Data of users
 * @apiError {Object} 400 Invalid request
 * @apiError {Object} 500 Internal server error
 * @apiSampleRequest off
 */
export const ratesharedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids?.length) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    // Map and bifurcate the data
    const allData = [];
    const active = [];
    const completed = [];
    console.log(ids,12121212);
    for (let i = 0; i < ids.length; i++) {
      const detail = details[i];
      const mappedUser = mapUserData({
        details: detail,
        user: ids[i],
        addExtraKeyTo: {
          user_details: {
            user_id: detail.client_user_id,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      });

      allData.push(mappedUser);

      const status = detail?.client_user_status;
      if (status === "Active") active.push(mappedUser);
      else if (status === "Completed") completed.push(mappedUser);
    }
    console.log(allData,111111);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched and grouped successfully",
      data: {
        all: allData,
        active,
        completed,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const ocWeightFilledOdData = async (req, res, next) => {
  try {
    const { user_ids, search } = req.body;
    const { page, limit } = req.query;

    if (!user_ids || !user_ids.length) {
      return next(new ErrorHandler("User IDs are required", 400));
    }

    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    const conditions = [
      {
        field: "wrl.user_id",
        operator: "IN",
        value: user_ids,
      },
    ];

    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      // FIX: Explicitly list fields instead of getCommonSelectFields()
      selectFields: [
        ...getCommonSelectFields(),
        "cd.user_id", // Pick ONE user_id source
        "cd.first_name",
        "cd.last_name",
        "cd.email_id",
        "cd.phone",
        "wrl.id as weight_record_id", // Alias ID to avoid confusion
        "wrl.weight",
        "wrl.added_date",
        "wrl.weight_acknowledge",
      ],
      table: `${tables.weightRecordsLead} wrl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "wrl.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions,
      ...(search && searchObj),
      orderBy: ["wrl.added_date DESC"],
      // pagination: {
      //   page: page || 1,
      //   limit: limit || 10,
      // },
    });

    console.log("Fetched weight records data:", data);

    const finalData = data.map((item) => {
      return mapOCData({
        details: item,
        extraMappings: {
          weight_details: {
            weight_id: item.weight_record_id, // Use the alias here
            weight: item.weight || "N/A",
            is_acknowledged: !!item.weight_acknowledge,
            added_date: item.added_date
              ? moment(item.added_date).format("YYYY-MM-DD")
              : "N/A",
          },
        },
      });
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User weight history fetched successfully",
        data: finalData,
        totalCount,
      })
    );
  } catch (error) {
    console.error("Error in ocWeightFilledOdData:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

/**
 * @function dietDueTomorrowData
 * @description API to fetch diet plan details which are due tomorrow for the given user ids.
 * @param {Object} req - request object
 * @param {string[]} req.body.user_ids - array of user ids
 * @param {string} [req.body.search] - search query
 * @param {Object} res - response object
 * @param {Function} next - next middleware function
 * @returns {Promise<Object>} - Api response object with status, message and data.
 * @throws {Error} - Internal Server Error
 */
export const dietDueTomorrowData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        diet_status: true,
      },
      ...(search && searchObj),
    });

    const drafted = [];
    const not_drafted = [];
    const all = [];

    ids.forEach((userId, index) => {
      const userDetails = details[index] || {};

      const mappedUser = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
          },
        },
      });

      const dietStatus = userDetails?.diet_plan_status;

      if (dietStatus === "Drafted") {
        drafted.push(mappedUser);
      } else {
        not_drafted.push(mappedUser);
      }

      all.push(mappedUser);
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        drafted,
        not_drafted,
        all,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

/**
 * @function progressTrackerDataTomorrow
 * @description Fetches progress tracker data for users whose diet sessions are scheduled to reach mid or end tomorrow.
 * @param {Object} req - Request object containing user IDs and an optional search query.
 * @param {string[]} req.body.user_ids - Array of user IDs to fetch the data for.
 * @param {string} [req.body.search] - Optional search query to filter user data.
 * @param {Object} res - Response object for sending the API response.
 * @param {Function} next - Next middleware function for error handling.
 * @returns {Promise<Object>} - API response object containing users with mid or end sessions tomorrow and all users.
 * @throws {Error} - Returns a 400 error for invalid requests and a 500 error for server issues.
 */

export const progressTrackerDataTomorrow = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        diet_start_date: true,
      },
      ...(search && searchObj),
    });

    const tomorrow = moment().add(1, "days").format("YYYY-MM-DD");

    const mid_session_tomorrow = [];
    const end_session_tomorrow = [];
    const all = [];

    ids.forEach((userId, index) => {
      const userDetails = details[index] || {};
      const dietSentDate = userDetails?.diet_sent_date;

      const mappedUser = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
          },
        },
      });

      const dietStart = dietSentDate ? moment(dietSentDate) : null;

      if (dietStart?.isValid()) {
        const midDate = dietStart.clone().add(5, "days").format("YYYY-MM-DD");
        const endDate = dietStart.clone().add(10, "days").format("YYYY-MM-DD");

        // Debug log (remove in production)
        console.log(
          `User ${userId}: dietStart = ${dietStart.format(
            "YYYY-MM-DD",
          )}, midDate = ${midDate}, endDate = ${endDate}, tomorrow = ${tomorrow}`,
        );

        if (midDate === tomorrow) {
          mid_session_tomorrow.push(mappedUser);
        }
        if (endDate === tomorrow) {
          end_session_tomorrow.push(mappedUser);
        }
      } else {
        // Optional: log invalid diet date
        console.log(
          `User ${userId} has invalid or missing diet_sent_date:`,
          dietSentDate,
        );
      }

      all.push(mappedUser);
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        mid_session_tomorrow,
        end_session_tomorrow,
        all,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

/**
 * Retrieves sales follow-up data for specified user IDs.
 *
 * @param {Object} req - The request object containing the body with user_ids and search parameters.
 * @param {Object} res - The response object used to send back data.
 * @param {Function} next - The next middleware function for error handling.
 *
 * @throws {ErrorHandler} If user_ids is not provided or empty, returns a 400 error.
 *
 * @description This function fetches follow-up data for users by their IDs.
 * It performs a search on user details and retrieves follow-up logs and appointment slots
 * from the database. The function then maps the data into a structured format and returns it
 * in the response. If any errors occur during execution, an internal server error is returned.
 */

export const salesFollowUpsData = async (req, res, next) => {
  const { user_ids: ids, search, source_type } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    const mapped = [] ; 
    details.forEach((detail, i) =>
       {
          if (source_type == 'mentor' && (detail?.next_source==null)) {
               mapped.push(mapUserData({
                details: detail,
                user: ids[i],
                addExtraKeyTo: {
                  user_details: {
                    user_id: ids[i],
                    whatsapp_text: "",
                  },
                },
                addFields: {
                  follow_up: true,
                },
              }));
            }
            else if (source_type == 'auto' && (detail?.next_source)) {
              mapped.push(mapUserData({
                details: detail,
                user: ids[i],
                addExtraKeyTo: {
                  user_details: {
                    user_id: ids[i],
                    whatsapp_text: "",
                  },
                },
                addFields: {
                  follow_up: true,
                },
              }));
            }
       }
    );

    const activeStatuses = [
      "Active",
      "Onhold",
      "Dormant",
      "notstarted",
      "cleanseactive",
      "Cleanse active",
    ];
    const completedStatuses = ["Completed", "Dropout", "Fs", "Maintenance"];

    const active = mapped.filter((user) =>
      activeStatuses.includes(user?.user_details?.status),
    );

    const completed = mapped.filter((user) =>
      completedStatuses.includes(user?.user_details?.status),
    );

    const result = {
      all: mapped,
      active,
      completed,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User data fetched and categorized by program status",
      data: result,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function bifurcateByStatus(mappedList = [], details = []) {
  const active = [];
  const completed = [];

  mappedList.forEach((item, i) => {
    const status = details[i]?.client_user_status?.trim()?.toLowerCase();
    if (status === "active") active.push(item);
    else if (status === "completed") completed.push(item);
  });

  return {
    all: mappedList,
    active,
    completed,
  };
}

export const paymentDetailsSharedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    // No expiry filter applied — include all users
    const mapped = details.map((detail, i) =>
      mapUserData({
        details: detail,
        user: ids[i],
        addExtraKeyTo: {
          user_details: {
            user_id: ids[i],
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      }),
    );

    const result = bifurcateByStatus(mapped, details);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment data fetched successfully",
      data: result,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const paymentDetailsExpiredData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    // Filter only expired payment links
    const filtered = details
      .map((d, i) => ({ detail: d, id: ids[i] }))
      .filter(({ detail }) => {
        const expiry = detail?.suggested_payment_expiry;
        return expiry && new Date(expiry) < new Date();
      });

    const mapped = filtered.map(({ detail, id }) =>
      mapUserData({
        details: detail,
        user: id,
        addExtraKeyTo: {
          user_details: {
            user_id: id,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      }),
    );

    const result = bifurcateByStatus(
      mapped,
      filtered.map((f) => f.detail),
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Expired payment links fetched successfully",
      data: result,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//salesFollowupAndRisk

//howsMyDay
const howsMyDay = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);

    // calculate the date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Get latest "query"-type enquiries for each user under this mentor in last 3 days
    const userIdDocs = await clientEnquiry.aggregate([
      {
        $match: {
          type: "query",
          mentor_id: mentor_id,
          createdAt: { $gte: threeDaysAgo }, // only last 3 days
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $group: {
          _id: "$user_id",
          latestDoc: { $first: "$$ROOT" },
        },
      },
      {
        $project: {
          _id: 1, // _id is user_id
        },
      },
    ]);

    const userIds = userIdDocs.map((doc) => doc._id.toString());

    let unanswered_queries_data;

    if (userIds.length > 0) {
      const { results: filteredUsers } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.user_id",
            operator: "IN",
            value: userIds,
          },
        ],
      });

      unanswered_queries_data = {
        length: filteredUsers.length,
        user_ids: filteredUsers.map((user) => user.user_id),
      };
    } else {
      unanswered_queries_data = {
        length: 0,
        user_ids: [],
      };
    }

    // Example usage:
    const { start_time, end_time } = getQueryTimeRange();
    console.log("start_time (UTC):", start_time.toISOString());
    console.log("end_time (UTC):", end_time.toISOString());

    const claraUserIdDocs = await clientEnquiry.aggregate([
      {
        $match: {
          type: "clara",
          mentor_id: mentor_id,
          createdAt: { $gte: start_time, $lte: end_time },
          sender: "client",
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $group: {
          _id: "$user_id",
          latestDoc: { $first: "$$ROOT" },
        },
      },
      {
        $project: {
          _id: 1, // _id is user_id
        },
      },
    ]);
    const claraUserIds = claraUserIdDocs.map((doc) => doc._id.toString());
    console.log(claraUserIds, 4228);

    let clara_queries_data;

    if (claraUserIds.length > 0) {
      const { results: filteredUsers } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.user_id",
            operator: "IN",
            value: claraUserIds,
          },
        ],
      });

      clara_queries_data = {
        length: filteredUsers.length,
        user_ids: filteredUsers.map((user) => user.user_id),
      };
    } else {
      clara_queries_data = {
        length: 0,
        user_ids: [],
      };
    }
    // Get data for various user categories
    const data = await howsMyDayActiveFilterData({ mentor_id });
    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;

    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const new_assigned_clients = getCountByKey("new_assigned_clients");

    // const progress_tracker_user_ids = [
    //   ...new Set([
    //     ...safeJSONParse(getUserIdsByKey("weight_day_0")),
    //     ...safeJSONParse(getUserIdsByKey("weight_day_5")),
    //     ...safeJSONParse(getUserIdsByKey("weight_day_10")),
    //   ]),
    // ];

    const progress_tracker_user_ids_10 = safeJSONParse(
      getUserIdsByKey("weight_day_10"),
    );
    // const inch_records_user_ids = safeJSONParse(
    //   getUserIdsByKey("inch_records")
    // );
    // const photo_records_user_ids = safeJSONParse(
    //   getUserIdsByKey("photo_records")
    // );

    const tracker_user_ids = [
      ...new Set([
        ...progress_tracker_user_ids_10,
        // ...inch_records_user_ids,
        // ...photo_records_user_ids,
      ]),
    ];

    const progress_tracker = tracker_user_ids.length;
    const unanswered_queries = unanswered_queries_data.length;
    const drafted_query = getCountByKey("drafted_query");
    const weight_day_5 = getCountByKey("weight_day_5");
    const weight_day_0 = getCountByKey("weight_day_0");
    const weight_day_other = getCountByKey("weight_day_other");
    const calls = getCountByKey("calls");
    const diets_pending = getCountByKey("diets_pending");
    const breakover_today = getCountByKey("breakover_today");
    const program_starting_today = getCountByKey("program_starting_today");
    const client_expiring_today = getCountByKey("client_expiring_today");

    // const healthscore_ht = getCountByKey("healthscore_ht");
    // const healthscore_te = getCountByKey("healthscore_te");
    // const healthscore_ht_te = healthscore_ht + healthscore_te;

    const healthscore_ht_te = getCountByKey("not_improved_health_score");

    const feedback_ht = getCountByKey("feedback_ht");
    const feedback_te = getCountByKey("feedback_te");
    const feedback_ht_te = feedback_ht + feedback_te;

    const com_clients = getCountByKey("com_clients");

    const diet_feedback = getCountByKey("diet_feedback");
    const alcohol_menu = getCountByKey("alcohol_menu");
    const restaurant_menu = getCountByKey("restaurant_menu");
    const ekit_tracker = alcohol_menu + restaurant_menu;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    
    const smart_scale_weight_data = await SmartScaleData.aggregate([
      {
        $match: {
          mentor_id: mentor_id,
          createdAt: { $gte: start },
          is_acknowledged: false
        }
      },
      {
        $sort: { user_id: 1, createdAt: -1 }
      },
      {
        $group: {
          _id: "$user_id",
          latestEntry: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$latestEntry" }
      },
      {
        $project: {
          _id: 1,
          user_id: 1
        }
      }
    ]);

    const activeResponse = [
      {
        key: "new_assigned_clients",
        count: new_assigned_clients,
        user_ids: safeJSONParse(getUserIdsByKey("new_assigned_clients")),
      },
      {
        key: "progress_tracker_(St.wt.)",
        count: weight_day_0,
        user_ids: safeJSONParse(getUserIdsByKey("weight_day_0")),
      },
      {
        key: "progress_tracker_(5th)",
        count: weight_day_5,
        user_ids: safeJSONParse(getUserIdsByKey("weight_day_5")),
      },
      {
        key: "progress_tracker_(10th)",
        count: progress_tracker,
        user_ids: tracker_user_ids,
      }, 
      {
        key: "progress_tracker_(Ot.Wt)",
        count: weight_day_other,
        user_ids: safeJSONParse(getUserIdsByKey("weight_day_other")),
      },
      {
        key: "smart_scale_scan_data",
        count: smart_scale_weight_data.length,
        user_ids: smart_scale_weight_data, 
      },
      {
        key: "unanswered_queries",
        count: unanswered_queries,
        user_ids: unanswered_queries_data.user_ids,
      },
      {
        key: "clara_activity",
        count: clara_queries_data.length,
        user_ids: clara_queries_data.user_ids,
      },
      {
        key: "drafted_query",
        count: drafted_query,
        user_ids: safeJSONParse(getUserIdsByKey("drafted_query")),
      },
      {
        key: "calls",
        count: calls,
        user_ids: safeJSONParse(getUserIdsByKey("calls")),
      },
      {
        key: "diets_pending",
        count: diets_pending,
        user_ids: safeJSONParse(getUserIdsByKey("diets_pending")),
      },
      {
        key: "breakover_today",
        count: breakover_today,
        user_ids: safeJSONParse(getUserIdsByKey("breakover_today")),
      },
      {
        key: "program_starting_today",
        count: program_starting_today,
        user_ids: safeJSONParse(getUserIdsByKey("program_starting_today")),
      },
      {
        key: "client_expiring_today",
        count: client_expiring_today,
        user_ids: safeJSONParse(getUserIdsByKey("client_expiring_today")),
      },
      {
        key: "healthscore_(Ht_&_Te)",
        // count: healthscore_ht_te,
        // user_ids: [
        //   ...new Set([
        //     ...safeJSONParse(getUserIdsByKey("healthscore_ht")),
        //     ...safeJSONParse(getUserIdsByKey("healthscore_te")),
        //   ]),
        // ],
        count: healthscore_ht_te,
        user_ids: safeJSONParse(getUserIdsByKey("not_improved_health_score")),
      },
      {
        key: "feedback_(Ht_&_Te)",
        count: feedback_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("feedback_ht")),
            ...safeJSONParse(getUserIdsByKey("feedback_te")),
          ]),
        ],
      },
      {
        key: "diet_feedback",
        count: diet_feedback,
        user_ids: safeJSONParse(getUserIdsByKey("diet_feedback")),
      },
      {
        key: "ekit_tracker",
        count: ekit_tracker,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("alcohol_menu")),
            ...safeJSONParse(getUserIdsByKey("restaurant_menu")),
          ]),
        ],
      },
      {
        key: "com_clients",
        count: com_clients,
        user_ids: safeJSONParse(getUserIdsByKey("com_clients")),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Hows My Day fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const howsMyTommorow = async (req, res, next) => {
  try {
    const mentor_id = Number(req.query.mentor_id);

    // Get data for various user categories
    const data = await howsMyTommorowActiveFilterData({ mentor_id });
    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;

    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    const tracker_due_tomorrow = getCountByKey("tracker_due_tomorrow");
    const diet_due_tomorrow = getCountByKey("diet_due_tomorrow");
    const calls_tomorrow = getCountByKey("calls_tomorrow");
    const breakover_tomorrow = getCountByKey("breakover_tomorrow");
    const program_starting_tomorrow = getCountByKey(
      "program_starting_tomorrow",
    );
    const client_expiring_tomorrow = getCountByKey("client_expiring_tomorrow");
    const link_expiring_tomorrow_sp = getCountByKey(
      "link_expiring_tomorrow_sp",
    );
    const link_expiring_tomorrow_service = getCountByKey(
      "link_expiring_tomorrow_service",
    );
    const followups_tomorrow = getCountByKey("followups_tomorrow");
    const sixPM = new Date();
    sixPM.setHours(18, 0, 0, 0);
    console.log("sixPM:", sixPM);
    const userIdDocs = await clientEnquiry
      .find({
        mentor_id: mentor_id,
        type: "query",
        createdAt: { $gte: sixPM },
      })
      .select("user_id createdAt")
      .lean();
    const userIds = userIdDocs.map((doc) => doc.user_id.toString());
    let unanswered_queries_data = { length: 0, user_ids: [] };
    if (userIds.length > 0) {
      const { results: filteredUsers } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.user_id",
            operator: "IN",
            value: userIds,
          },
        ],
      });
      unanswered_queries_data = {
        length: filteredUsers.length,
        user_ids: filteredUsers.map((user) => user.user_id),
      };
    }
    const activeResponse = [
      {
        key: "tracker_due_tomorrow",
        count: tracker_due_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("tracker_due_tomorrow")),
      },
      {
        key: "diet_due_tomorrow",
        count: diet_due_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("diet_due_tomorrow")),
      },
      {
        key: "break_over_tomorrow",
        count: breakover_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("breakover_tomorrow")),
      },
      {
        key: "program_starting_tomorrow",
        count: program_starting_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("program_starting_tomorrow")),
      },
      {
        key: "client_expiring_tomorrow",
        count: client_expiring_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("client_expiring_tomorrow")),
      },
      {
        key: "followups_tomorrow",
        count: followups_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("followups_tomorrow")),
      },
      {
        key: "calls_tomorrow",
        count: calls_tomorrow,
        user_ids: safeJSONParse(getUserIdsByKey("calls_tomorrow")),
      },
      {
        key: "link_expiring_tomorrow",
        count:
          Number(link_expiring_tomorrow_sp) +
            Number(link_expiring_tomorrow_service) || 0,
        user_ids: [
          ...safeJSONParse(getUserIdsByKey("link_expiring_tomorrow_sp")),
          ...safeJSONParse(getUserIdsByKey("link_expiring_tomorrow_service")),
        ],
      },
      {
        key: "unanswered_queries_tomorrow",
        count: unanswered_queries_data.length,
        user_ids: unanswered_queries_data.user_ids,
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Hows My Tomorrow fetched Successfully",
      data: activeResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//mentor kpi

export const getMentorKpis = async (req, res, next) => {
  try {
    const mentorIdRaw = req.query.mentor_id;
    const mentor_id = parseInt(mentorIdRaw, 10);
    if (Number.isNaN(mentor_id)) {
      return next(new ErrorHandler("mentor_id is required (number)", 400));
    }

    // Optional: increase group_concat_max_len if needed
    // await readPool.query("SET SESSION group_concat_max_len = 1000000");

    const sql = `
      SELECT 
          au.crm_user AS mentor_name,

          /* 1. Total Active Clients (Active only) */
          COUNT(DISTINCT CASE WHEN ud.user_status = 'Active' THEN ud.user_id END) AS total_clients,
          GROUP_CONCAT(DISTINCT CASE WHEN ud.user_status = 'Active' THEN ud.user_id END) AS total_clients_ids,

          /* 2. Welcome Call Done (call_type = '0') */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM call_updates cu0
              WHERE cu0.user_id = ud.user_id
                AND cu0.sub_order_id = sop.sub_order_id
                AND cu0.call_type = '0' AND cu0.call_status = '1'
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS welcome_call_done,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM call_updates cu0
              WHERE cu0.user_id = ud.user_id
                AND cu0.sub_order_id = sop.sub_order_id
                AND cu0.call_type = '0' AND cu0.call_status = '1'
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS welcome_call_done_ids,

          /* 3. Halftime Call Done (call_type = '1') */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM call_updates cu1
              WHERE cu1.user_id = ud.user_id
                AND cu1.sub_order_id = sop.sub_order_id
                AND cu1.call_type = '1' AND cu1.call_status = '1'
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS halftime_call_done,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM call_updates cu1
              WHERE cu1.user_id = ud.user_id
                AND cu1.sub_order_id = sop.sub_order_id
                AND cu1.call_type = '1' AND cu1.call_status = '1'
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS halftime_call_done_ids,

          /* 4. Final Call Done (call_type = '2') */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM call_updates cu2
              WHERE cu2.user_id = ud.user_id
                AND cu2.sub_order_id = sop.sub_order_id
                AND cu2.call_type = '2' AND cu2.call_status = '1'
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS final_call_done,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM call_updates cu2
              WHERE cu2.user_id = ud.user_id
                AND cu2.sub_order_id = sop.sub_order_id
                AND cu2.call_type = '2' AND cu2.call_status = '1'
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS final_call_done_ids,

          /* 5. Halftime HS Received (type = '1') */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM bn_client_hs hs1
              WHERE hs1.user_id = ud.user_id
                AND hs1.sub_order_id = sop.sub_order_id
                AND hs1.type = '1'
                AND hs1.overall_health_score IS NOT NULL
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS halftime_hs_received,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM bn_client_hs hs1
              WHERE hs1.user_id = ud.user_id
                AND hs1.sub_order_id = sop.sub_order_id
                AND hs1.type = '1'
                AND hs1.overall_health_score IS NOT NULL
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS halftime_hs_received_ids,

          /* 5. Tailend HS Received (type = '2') */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM bn_client_hs hs2
              WHERE hs2.user_id = ud.user_id
                AND hs2.sub_order_id = sop.sub_order_id
                AND hs2.type = '2'
                AND hs2.overall_health_score IS NOT NULL
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS tailend_hs_received,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM bn_client_hs hs2
              WHERE hs2.user_id = ud.user_id
                AND hs2.sub_order_id = sop.sub_order_id
                AND hs2.type = '2'
                AND hs2.overall_health_score IS NOT NULL
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS tailend_hs_received_ids,

          /* 6. Halftime Feedback Received */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM bn_halftime_feedback ffh
              WHERE ffh.user_id = ud.user_id
                AND ffh.sub_order_id = sop.sub_order_id
                AND ffh.mentor_star_rating IS NOT NULL
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS halftime_feedback_received,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM bn_halftime_feedback ffh
              WHERE ffh.user_id = ud.user_id
                AND ffh.sub_order_id = sop.sub_order_id
                AND ffh.mentor_star_rating IS NOT NULL
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS halftime_feedback_received_ids,

          /* 6. Final Feedback Received */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM bn_final_feedback fff
              WHERE fff.user_id = ud.user_id
                AND fff.sub_order_id = sop.sub_order_id
                AND fff.rate_mentor IS NOT NULL
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS final_feedback_received,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM bn_final_feedback fff
              WHERE fff.user_id = ud.user_id
                AND fff.sub_order_id = sop.sub_order_id
                AND fff.rate_mentor IS NOT NULL
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS final_feedback_received_ids,

          /* 7. Suggested Program Present (This Month) */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM suggested_program sp
              WHERE sp.user_id = ud.user_id
                AND MONTH(sp.updated_date) = MONTH(NOW())
                AND YEAR(sp.updated_date)  = YEAR(NOW())
                AND sp.program_id IS NOT NULL
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS suggested_program_present,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM suggested_program sp
              WHERE sp.user_id = ud.user_id
                AND MONTH(sp.updated_date) = MONTH(NOW())
                AND YEAR(sp.updated_date)  = YEAR(NOW())
                AND sp.program_id IS NOT NULL
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS suggested_program_present_ids,

          /* 8. Diet Feedback Given (Active + Completed) */
          COUNT(DISTINCT CASE 
            WHEN EXISTS (SELECT 1 FROM diet_feedback df WHERE df.user_id = ud.user_id)
            THEN ud.user_id END
          ) AS diet_feedback_given,
          GROUP_CONCAT(DISTINCT CASE 
            WHEN EXISTS (SELECT 1 FROM diet_feedback df WHERE df.user_id = ud.user_id)
            THEN ud.user_id END
          ) AS diet_feedback_given_ids,

          /* 9. Used Restaurant Guide (Active + Completed) */
          COUNT(DISTINCT CASE 
            WHEN EXISTS (SELECT 1 FROM user_restaurant_menu rm WHERE rm.user_id = ud.user_id)
            THEN ud.user_id END
          ) AS used_restaurant_guide,
          GROUP_CONCAT(DISTINCT CASE 
            WHEN EXISTS (SELECT 1 FROM user_restaurant_menu rm WHERE rm.user_id = ud.user_id)
            THEN ud.user_id END
          ) AS used_restaurant_guide_ids,

          /* 10. Used Alcohol Guide (Active + Completed) */
          COUNT(DISTINCT CASE 
            WHEN EXISTS (SELECT 1 FROM user_alcohol_menu am WHERE am.user_id = ud.user_id)
            THEN ud.user_id END
          ) AS used_alcohol_guide,
          GROUP_CONCAT(DISTINCT CASE 
            WHEN EXISTS (SELECT 1 FROM user_alcohol_menu am WHERE am.user_id = ud.user_id)
            THEN ud.user_id END
          ) AS used_alcohol_guide_ids,

          /* 11. Advance Purchase Clients (Active) */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM sub_orders_programs sop4c
              WHERE sop4c.user_id = ud.user_id
                AND sop4c.program_status = '4'
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS advance_clients,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM sub_orders_programs sop4c
              WHERE sop4c.user_id = ud.user_id
                AND sop4c.program_status = '4'
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS advance_clients_ids,

          /* No Advance Clients (Active) = total_active - advance_clients */
          (
            COUNT(DISTINCT CASE WHEN ud.user_status = 'Active' THEN ud.user_id END)
            -
            SUM(
              CASE WHEN EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4c
                WHERE sop4c.user_id = ud.user_id
                  AND sop4c.program_status = '4'
                  AND ud.user_status = 'Active'
              ) THEN 1 ELSE 0 END
            )
          ) AS no_advance_clients,
          GROUP_CONCAT(DISTINCT CASE WHEN 
              ud.user_status = 'Active'
              AND NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4c
                WHERE sop4c.user_id = ud.user_id
                  AND sop4c.program_status = '4'
                  AND ud.user_status = 'Active'
              )
          THEN ud.user_id END) AS no_advance_clients_ids,

          /* 12. No Advance + Suggested Program (this month) */
          SUM(
            CASE WHEN
              NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4f
                WHERE sop4f.user_id = ud.user_id
                  AND sop4f.program_status = '4'
                  AND ud.user_status = 'Active'
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp5
                WHERE sp5.user_id = ud.user_id
                  AND MONTH(sp5.updated_date) = MONTH(NOW())
                  AND YEAR(sp5.updated_date)  = YEAR(NOW())
                  AND sp5.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
            THEN 1 ELSE 0 END
          ) AS no_advance_with_suggested_program,
          GROUP_CONCAT(DISTINCT CASE WHEN
              NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4f
                WHERE sop4f.user_id = ud.user_id
                  AND sop4f.program_status = '4'
                  AND ud.user_status = 'Active'
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp5
                WHERE sp5.user_id = ud.user_id
                  AND MONTH(sp5.updated_date) = MONTH(NOW())
                  AND YEAR(sp5.updated_date)  = YEAR(NOW())
                  AND sp5.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
          THEN ud.user_id END) AS no_advance_with_suggested_program_ids,

          /* 12. Advance + Suggested Program (this month) */
          SUM(
            CASE WHEN
               EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4f
                WHERE sop4f.user_id = ud.user_id
                  AND sop4f.program_status = '4'
                  AND ud.user_status = 'Active'
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp5
                WHERE sp5.user_id = ud.user_id
                  AND MONTH(sp5.updated_date) = MONTH(NOW())
                  AND YEAR(sp5.updated_date)  = YEAR(NOW())
                  AND sp5.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
            THEN 1 ELSE 0 END
          ) AS advance_with_suggested_program,
          GROUP_CONCAT(DISTINCT CASE WHEN
               EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4f
                WHERE sop4f.user_id = ud.user_id
                  AND sop4f.program_status = '4'
                  AND ud.user_status = 'Active'
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp5
                WHERE sp5.user_id = ud.user_id
                  AND MONTH(sp5.updated_date) = MONTH(NOW())
                  AND YEAR(sp5.updated_date)  = YEAR(NOW())
                  AND sp5.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
          THEN ud.user_id END) AS advance_with_suggested_program_ids,

          /* 13. Tailend Clients (Active, pending_session <= 3, and NOT advance) */
          SUM(
            CASE WHEN
              sop.pending_session <= 3 AND ud.user_status = 'Active'
              AND NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4
                WHERE sop4.user_id = ud.user_id
                  AND sop4.program_status = '4'
                  AND ud.user_status = 'Active'
              )
            THEN 1 ELSE 0 END
          ) AS tailend_clients,
          GROUP_CONCAT(DISTINCT CASE WHEN
              sop.pending_session <= 3 AND ud.user_status = 'Active'
              AND NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4
                WHERE sop4.user_id = ud.user_id
                  AND sop4.program_status = '4'
                  AND ud.user_status = 'Active'
              )
          THEN ud.user_id END) AS tailend_clients_ids,

          /* 14. Tailend + Suggested Program (this month) */
          SUM(
            CASE WHEN
              sop.pending_session <= 3
              AND NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4a
                WHERE sop4a.user_id = ud.user_id
                  AND sop4a.program_status = '4'
                  AND ud.user_status = 'Active'
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp2
                WHERE sp2.user_id = ud.user_id
                  AND MONTH(sp2.updated_date) = MONTH(NOW())
                  AND YEAR(sp2.updated_date)  = YEAR(NOW())
                  AND sp2.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
            THEN 1 ELSE 0 END
          ) AS tailend_with_suggested_program,
          GROUP_CONCAT(DISTINCT CASE WHEN
              sop.pending_session <= 3
              AND NOT EXISTS (
                SELECT 1
                FROM sub_orders_programs sop4a
                WHERE sop4a.user_id = ud.user_id
                  AND sop4a.program_status = '4'
                  AND ud.user_status = 'Active'
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp2
                WHERE sp2.user_id = ud.user_id
                  AND MONTH(sp2.updated_date) = MONTH(NOW())
                  AND YEAR(sp2.updated_date)  = YEAR(NOW())
                  AND sp2.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
          THEN ud.user_id END) AS tailend_with_suggested_program_ids,

          /* 15. Not Tailend + Suggested Program (this month) */
          SUM(
            CASE WHEN
              NOT (
                sop.pending_session <= 3
                AND NOT EXISTS (
                  SELECT 1
                  FROM sub_orders_programs sop4b
                  WHERE sop4b.user_id = ud.user_id
                    AND sop4b.program_status = '4'
                    AND ud.user_status = 'Active'
                )
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp3
                WHERE sp3.user_id = ud.user_id
                  AND MONTH(sp3.updated_date) = MONTH(NOW())
                  AND YEAR(sp3.updated_date)  = YEAR(NOW())
                  AND sp3.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
            THEN 1 ELSE 0 END
          ) AS not_tailend_with_suggested_program,
          GROUP_CONCAT(DISTINCT CASE WHEN
              NOT (
                sop.pending_session <= 3
                AND NOT EXISTS (
                  SELECT 1
                  FROM sub_orders_programs sop4b
                  WHERE sop4b.user_id = ud.user_id
                    AND sop4b.program_status = '4'
                    AND ud.user_status = 'Active'
                )
              )
              AND EXISTS (
                SELECT 1
                FROM suggested_program sp3
                WHERE sp3.user_id = ud.user_id
                  AND MONTH(sp3.updated_date) = MONTH(NOW())
                  AND YEAR(sp3.updated_date)  = YEAR(NOW())
                  AND sp3.program_id IS NOT NULL
                  AND ud.user_status = 'Active'
              )
          THEN ud.user_id END) AS not_tailend_with_suggested_program_ids,

          /* OC HS Received (type = '3') */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM bn_client_hs hs3
              WHERE hs3.user_id = ud.user_id
                AND hs3.type = '3'
                AND hs3.overall_health_score IS NOT NULL
            ) THEN 1 ELSE 0 END
          ) AS oc_hs_received,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM bn_client_hs hs3
              WHERE hs3.user_id = ud.user_id
                AND hs3.type = '3'
                AND hs3.overall_health_score IS NOT NULL
          ) THEN ud.user_id END) AS oc_hs_received_ids,

          /* New Goal Received (Active) */
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM my_goals_1 mg
              WHERE mg.user_id = ud.user_id
                AND mg.sub_order_id = sop.sub_order_id
                AND JSON_EXTRACT(mg.comment, '$.new_goals') IS NOT NULL
                AND ud.user_status = 'Active'
            ) THEN 1 ELSE 0 END
          ) AS new_goal_received,
          GROUP_CONCAT(DISTINCT CASE WHEN EXISTS (
              SELECT 1
              FROM my_goals_1 mg
              WHERE mg.user_id = ud.user_id
                AND mg.sub_order_id = sop.sub_order_id
                AND JSON_EXTRACT(mg.comment, '$.new_goals') IS NOT NULL
                AND ud.user_status = 'Active'
          ) THEN ud.user_id END) AS new_goal_received_ids,

          /* 16. Total Completed Clients (OC) */
          COUNT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END) AS all_oc_clients,
          GROUP_CONCAT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END) AS all_oc_clients_ids,

          /* 17. Pitched OC Clients (CURRENT MONTH) */
          COUNT(DISTINCT CASE 
            WHEN ud.user_status = 'Completed'
             AND EXISTS (
               SELECT 1
               FROM suggested_program sp_oc
               WHERE sp_oc.user_id = ud.user_id
                 AND sp_oc.program_id IS NOT NULL
                 AND DATE(sp_oc.updated_date) >= DATE_FORMAT(NOW(), '%Y-%m-01')
             )
            THEN ud.user_id END
          ) AS pitched_oc_clients,
          GROUP_CONCAT(DISTINCT CASE 
            WHEN ud.user_status = 'Completed'
             AND EXISTS (
               SELECT 1
               FROM suggested_program sp_oc
               WHERE sp_oc.user_id = ud.user_id
                 AND sp_oc.program_id IS NOT NULL
                 AND DATE(sp_oc.updated_date) >= DATE_FORMAT(NOW(), '%Y-%m-01')
             )
            THEN ud.user_id END
          ) AS pitched_oc_clients_ids,

          /* 18. Not Pitched OC Clients (CURRENT MONTH) */
          (
            COUNT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END)
            -
            COUNT(DISTINCT CASE 
              WHEN ud.user_status = 'Completed'
               AND EXISTS (
                 SELECT 1
                 FROM suggested_program sp_np
                 WHERE sp_np.user_id = ud.user_id
                   AND sp_np.program_id IS NOT NULL
                   AND DATE(sp_np.updated_date) >= DATE_FORMAT(NOW(), '%Y-%m-01')
               )
              THEN ud.user_id END
            )
          ) AS not_pitched_oc_clients,
          GROUP_CONCAT(DISTINCT CASE WHEN
              ud.user_status = 'Completed'
              AND NOT EXISTS (
                 SELECT 1
                 FROM suggested_program sp_np
                 WHERE sp_np.user_id = ud.user_id
                   AND sp_np.program_id IS NOT NULL
                   AND DATE(sp_np.updated_date) >= DATE_FORMAT(NOW(), '%Y-%m-01')
              )
          THEN ud.user_id END) AS not_pitched_oc_clients_ids

      FROM users_details ud
      INNER JOIN sub_orders_programs sop 
        ON ud.active_order_id = sop.sub_order_id
      LEFT JOIN admin_users au 
        ON ud.mentor_assigned = au.admin_user_id

      WHERE 
          /* Include Active and Completed */
          (
            (ud.user_status = 'Active'    AND sop.program_status IN (1, 2, 4))
            OR
            (ud.user_status = 'Completed')
          )
          AND ud.mentor_assigned = ?

      GROUP BY au.crm_user
      ORDER BY total_clients DESC
    `;

    const [rows] = await readPool.query(sql, [mentor_id]);

    // Convert all *_ids fields from CSV → array<number>
    const formatted = rows.map((r) => {
      const obj = { ...r };
      for (const key of Object.keys(obj)) {
        if (key.endsWith("_ids")) {
          obj[key] = obj[key]
            ? obj[key]
                .split(",")
                .filter(Boolean)
                .map((x) => parseInt(x, 10))
            : [];
        }
      }
      return obj;
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Mentor KPIs fetched successfully",
        data: formatted,
      }),
    );
  } catch (err) {
    console.error("getMentorKpis error:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//mentor kpi

//rate-shared

export const getRateShared = async (req, res, next) => {
  try {
    const mentorIdRaw = req.query.mentor_id ?? req.body?.mentor_id;
    const mentor_id = parseInt(mentorIdRaw, 10);
    if (Number.isNaN(mentor_id)) {
      return next(new ErrorHandler("mentor_id is required (number)", 400));
    }

    // Optional month/year (defaults to current)
    const now = new Date();
    const month = req.query.month
      ? parseInt(req.query.month, 10)
      : req.body?.month
        ? parseInt(req.body.month, 10)
        : now.getMonth() + 1; // 1-12
    const year = req.query.year
      ? parseInt(req.query.year, 10)
      : req.body?.year
        ? parseInt(req.body.year, 10)
        : now.getFullYear();

    if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
      return next(new ErrorHandler("Invalid month/year", 400));
    }

    // SQL with user_ids array
    const sql = `
      SELECT 
        au.crm_user AS mentor,
        ud.user_status,
        COUNT(DISTINCT ud.user_id)                AS total_suggested_users,
        COALESCE(SUM(sp.suggested_amount), 0)     AS total_suggested_amount,
        GROUP_CONCAT(DISTINCT ud.user_id)         AS user_ids
      FROM users_details ud
      INNER JOIN suggested_program sp
        ON sp.user_id = ud.user_id
      LEFT JOIN admin_users au
        ON au.admin_user_id = CASE 
          WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned
          ELSE ud.mentor_assigned
        END
      WHERE 
        MONTH(sp.updated_date) = ?
        AND YEAR(sp.updated_date)  = ?
        AND sp.payment_status = 0
        /* Exclude users who have placed an order this same month/year */
        AND NOT EXISTS (
          SELECT 1 
          FROM order_details od
          WHERE od.user_id = sp.user_id
            AND MONTH(od.order_date) = ?
            AND YEAR(od.order_date)  = ?
        )
        /* Mentor filter */
        AND (
          (ud.user_status = 'Lead'  AND ud.counsellor_assigned = ?)
          OR
          (ud.user_status <> 'Lead' AND ud.mentor_assigned     = ?)
        ) AND ud.suggested_program_id IS NOT NULL AND ud.suggested_program_id !=0
      GROUP BY au.crm_user, ud.user_status
      ORDER BY au.crm_user, ud.user_status
    `;

    const params = [month, year, month, year, mentor_id, mentor_id];
    const [rows] = await readPool.query(sql, params);

    // Convert user_ids from comma string → array
    const formatted = rows.map((r) => ({
      ...r,
      user_ids: r.user_ids
        ? r.user_ids.split(",").map((id) => parseInt(id, 10))
        : [],
    }));

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Rate-shared metrics fetched successfully",
        data: formatted,
      }),
    );
  } catch (err) {
    console.error("getRateShared error:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//rate-shared
//howsMyDay

export const newAssignedClientsData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;
    const { results: assesmentDetails } = await readRecord({
      selectFields: [
        "cd.user_id",
        "ass.completion_status as ass_completion_status",
        "ass.nutrition_lifestyle as nutrition_lifestyle",
        "naf.added_date as naf_added_date",
        "iclr.completion_status",
        "iclr.updated_date as icl_completion_date",
        "dsl.diet_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
        FROM ${tables.assessment}
      ) asp1 WHERE asp1.rn = 1
    ) ass`,
          on: "ass.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
        FROM ${tables.assessment_nutrition_and_lifestyle}
      ) naf1 WHERE naf1.rn = 1
    ) naf`,
          on: "naf.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY active_order_id ORDER BY updated_date DESC) as rn
        FROM ${tables.ingredientChecklistRecords}
      ) iclr1 WHERE iclr1.rn = 1
    ) iclr`,
          on: "iclr.active_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "cd.user_id = dsl.user_id AND cd.active_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session AND dsl.diet_status != 4",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: [...ids],
        },
      ],
    });
    const details = await fetchUsersDetailsNew({
      ids: ids.sort((a, b) => a - b),
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });
    const new_users = [];
    const ocr_users = [];

    finalData = ids.map((user, index) => {
      const data = mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          assessment_status: {
            naf_status:
              assesmentDetails[index]?.nutrition_lifestyle == 2 &&
              assesmentDetails[index]?.ass_completion_status == 0
                ? 1
                : assesmentDetails[index]?.ass_completion_status,
            naf_added_date: assesmentDetails[index]?.naf_added_date,
            icl_status: assesmentDetails[index]?.completion_status,
            icl_completion_date: assesmentDetails[index]?.icl_completion_date,
          },
        },
        addFields: {
          program_start_date: true,
        },
        removeFields: ["suggested_program_details"],
      });
      if (details[index].current_program_order_type.toLowerCase() === "new") {
        new_users.push(data);
      } else if (
        details[index].current_program_order_type.toLowerCase() === "ocr"
      ) {
        ocr_users.push(data);
      }
      return data;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        new_users,
        ocr_users,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const progressTrackerDataAll = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids: ids.sort((a, b) => a - b),
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        inch_details: true,
        diet_feedback: true, // ✅ Include diet_feedback
      },
      ...(search && searchObj),
    });

    const finalData = ids.map((user, index) => {
      const userDetails = details[index];

      return mapUserData({
        details: userDetails,
        user,
        addFields: {
          latest_weight_data: true,
          inch_data: true,
          photo_data: true,
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMapping: {
          diet_feedback: {
            result: userDetails?.diet_feedback_result ?? null,
            diet_id: userDetails?.diet_feedback_diet_id ?? null,
            session: userDetails?.diet_feedback_session ?? null,
            created_at: userDetails?.diet_feedback_created_at ?? null,
          },
        },
      });
    });

    const start_weight_data = [];
    const mid_weight_data = [];
    const end_weight_data = [];

    finalData.forEach((data) => {
      if (data.weight_details.weight_day === 10) {
        end_weight_data.push(JSON.parse(JSON.stringify(data)));
      }

      delete data.inch_details;
      delete data.photo_details;

      if (data.weight_details.weight_day === 5) {
        mid_weight_data.push(data);
      }

      if (data.weight_details.weight_day === 0) {
        start_weight_data.push(data);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        start_weight_data,
        mid_weight_data,
        end_weight_data,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const progressTrackerData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids: ids.sort((a, b) => a - b),
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        inch_details: true,
        photo_details: true,
        diet_feedback: true,
        latest_weight_data: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      if (user == 128577) {
        console.log(details[index], 128577);
      }
      return mapUserData({
        details: details[index],
        user,
        addFields: {
          latest_weight_data: true,
          inch_data: true,
          photo_data: true,
          diet_feedback_details: true,
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });
    const start_weight_data = [];
    const all = [];
    const mid_weight_data = [];
    const end_weight_data = [];
    finalData.forEach((data) => {
      // console.log(data, 1672);

      if (data.weight_details.weight_day == 10) {
        // Deep clone to prevent reference issues
        all.push(JSON.parse(JSON.stringify(data)));
      }

      const copyData = JSON.parse(JSON.stringify(data));

      if (data.weight_details.weight_day == 5) {
        delete copyData.inch_details;
        delete copyData.photo_details;
        delete copyData.diet_feedback;

        all.push(copyData);
      }

      if (data.weight_details.weight_day == 0) {
        delete copyData.diet_feedback;

        all.push(copyData);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        all,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const otherTrackerData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids: ids.sort((a, b) => a - b),
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        latest_weight_data: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      if (user == 128577) {
        console.log(details[index], 128577);
      }
      return mapUserData({
        details: details[index],
        user,
        addFields: {
          latest_weight_data: true,
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const all = [];
    finalData.forEach((data) => {
      // console.log(data, 1672);

      // Deep clone to prevent reference issues
      all.push(JSON.parse(JSON.stringify(data)));
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        all,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const unansweredQueriesData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  try {
    // Step 1: Fetch latest unanswered query per user
    const chatDocs = await clientEnquiry.aggregate([
      {
        $match: {
          user_id: { $in: ids },
          type: "query",
        },
      },
      {
        $sort: { createdAt: 1 },
      },
      {
        $group: {
          _id: "$user_id",
          latestDoc: { $first: "$$ROOT" },
        },
      },
      {
        $project: {
          _id: "$latestDoc._id",
          user_id: "$latestDoc.user_id",
          mentor_id: "$latestDoc.mentor_id",
          query: "$latestDoc.query",
          type: "$latestDoc.type",
          createdAt: "$latestDoc.createdAt",
        },
      },
    ]);

    // Sort chronologically
    chatDocs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Step 2: Order and extract userIds
    const { userIds, orderById } = generateUserIdsAndOrderById(chatDocs);

    // Step 3: Prepare search config
    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    // Step 4: Fetch user details (ensure user_status is included in selectData)
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
      ...(search && searchObj),
    });

    // Step 5: Prepare grouped result
    const activeUsers = [];
    const completedUsers = [];
    const allUsers = [];

    userIds.forEach((user, index) => {
      const detail = details[index];
      const chat = chatDocs.find((c) => String(c.user_id) === String(user));

      const mapped = mapUserData({
        details: detail,
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          query_details: chat
            ? {
                query_id: chat._id || "N/A",
                query: chat.query || "No query text available",
                query_time: chat.createdAt
                  ? `${moment(chat.createdAt).format("DD-MM-YYYY")} (${moment(
                      chat.createdAt,
                    ).format("hh:mm A")})`
                  : "N/A",
              }
            : {},
        },
      });

      const status = detail?.client_user_status?.toLowerCase();
      if (status === "active") activeUsers.push(mapped);
      else if (status === "completed") completedUsers.push(mapped);

      allUsers.push(mapped); // Include in 'all' regardless
    });

    // Step 6: Return grouped response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        active: activeUsers,
        completed: completedUsers,
        all: allUsers,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const claraQueriesData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  try {
    // Step 1: Fetch latest unanswered query per user
    const chatDocs = await clientEnquiry.aggregate([
      {
        $match: {
          user_id: { $in: ids },
          type: "clara",
          sender: "client",
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: "$user_id",
          latestDoc: { $first: "$$ROOT" },
        },
      },
      {
        $project: {
          _id: "$latestDoc._id",
          user_id: "$latestDoc.user_id",
          mentor_id: "$latestDoc.mentor_id",
          query: "$latestDoc.query",
          type: "$latestDoc.type",
          createdAt: "$latestDoc.createdAt",
        },
      },
    ]);

    // Sort chronologically
    chatDocs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Step 2: Order and extract userIds
    const { userIds, orderById } = generateUserIdsAndOrderById(chatDocs);

    // Step 3: Prepare search config
    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    // Step 4: Fetch user details (ensure user_status is included in selectData)
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      orderBy: orderById,
      ...(search && searchObj),
    });

    // Step 5: Prepare grouped result
    const activeUsers = [];
    const completedUsers = [];
    const allUsers = [];

    userIds.forEach((user, index) => {
      const detail = details[index];
      const chat = chatDocs.find((c) => String(c.user_id) === String(user));

      const mapped = mapUserData({
        details: detail,
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          query_details: chat
            ? {
                query_id: chat._id || "N/A",
                query: chat.query || "No query text available",
                query_time: chat.createdAt
                  ? `${moment(chat.createdAt).format("DD-MM-YYYY")} (${moment(
                      chat.createdAt,
                    ).format("hh:mm A")})`
                  : "N/A",
              }
            : {},
        },
        addFields: {
          follow_up: true,
        },
      });

      const status = detail?.client_user_status?.toLowerCase();
      if (status === "active") activeUsers.push(mapped);
      else if (status === "completed") completedUsers.push(mapped);

      allUsers.push(mapped); // Include in 'all' regardless
    });

    // Step 6: Return grouped response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        active: activeUsers,
        completed: completedUsers,
        all: allUsers,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const draftedQueriesData = async (req, res, next) => {
  const { user_ids: ids, search, mentor_id } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };
  try {
    ids.sort((a, b) => a - b);
    const { results: draftedQueriesData } = await readRecord({
      selectFields: ["dq.draft_text", "dq.user_id", "dq.id", "dq.created_at"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.draftedQueries} dq`,
          on: "dq.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "dq.user_id",
          operator: "IN",
          value: [...ids],
        },
        {
          field: "dq.draft_text",
          operator: "NOT IN",
          value: '("")',
          raw: true,
        },
        {
          field: "dq.mentor_id",
          operator: "=",
          value: mentor_id,
        },
      ],
    });
    console.log(ids.length, 1854);
    console.log(draftedQueriesData.length, 1857);
    const details = await fetchUsersDetailsNew({
      ids: ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });
    console.log(details[0], 1866);
    const finalData = [];
    draftedQueriesData.forEach((query, index) => {
      const data = mapUserData({
        details: details.find(
          (detail) => detail.client_user_id === query.user_id,
        ),
        user: query.user_id,
        extraMappings: {
          drafted_query_details: {
            draft_id: query.id,
            draft_text: query.draft_text || "No draft text available",
            created_at: `${moment(query.created_at).format(
              "DD-MM-YYYY",
            )} (${moment(query.created_at).fromNow()})`,
          },
        },
        addExtraKeyTo: {
          user_details: {
            user_id: query.user_id,
            whatsapp_text: "",
          },
        },
      });
      finalData.push(data);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const callsData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };
  const { results: callsData } = await readRecord({
    selectFields: [
      "cu.call_id",
      "cu.call_type",
      "cu.call_status",
      `GROUP_CONCAT(
        DISTINCT basm.appointment_slots
        ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', '
    ) AS appointment_slots`,
      "cu.slot_id",
      "cu.user_id",
    ],
    table: `${tables.callUpdates} cu`,
    conditions: [
      {
        field: "cu.user_id",
        operator: "IN",
        value: [...ids],
      },
      { field: "cu.call_status", operator: "=", value: 0 },
      { field: "cu.call_type", operator: "<>", value: "14" },
      {
        field: "DATE(cu.schedule_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      },
      {
        field: "cu.slot_id",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
    ],
    joins: [
      {
        type: "INNER",
        table: `${tables.numbers} n`,
        on: "n.n < 1 + LENGTH(cu.slot_id) - LENGTH(REPLACE(cu.slot_id, ',', ''))",
      },
      {
        type: "LEFT",
        table: `${tables.slots} basm`,
        on: `basm.id = CAST(
        TRIM(
            SUBSTRING_INDEX(SUBSTRING_INDEX(cu.slot_id, ',', n.n + 1), ',', -1)
        ) AS UNSIGNED
    )`,
      },
    ],
    groupBy: ["cu.call_id", "cu.user_id"],
  });
  try {
    let finalData;
    console.log(callsData, 1899);
    const { userIds, orderById } = generateUserIdsAndOrderById(callsData);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
      ...(search && searchObj),
    });

    const today = [];
    const tomorrow = [];
    const future = [];
    finalData = userIds.map((user, index) => {
      const call_status = Number(callsData[index]?.call_status);
      return mapUserData({
        details: details[index],
        user,
        extraMappings: {
          call_details: {
            call_id: callsData[index]?.call_id || null,
            call_type: callsData[index]?.call_type || "N/A",
            call_status:
              call_status === 0
                ? "Pending"
                : call_status === 1
                  ? "Done"
                  : call_status === 2
                    ? "Cancelled"
                    : call_status === 3
                      ? "Rescheduled"
                      : "Unanswered",
            appointment_slots: callsData[index]?.appointment_slots || "N/A",
          },
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });
    // finalData.forEach((data)=>{

    // })
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const callsDataTomorrow = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };
  const { results: callsData } = await readRecord({
    selectFields: [
      "cu.call_id",
      "cu.call_type",
      "cu.call_status",
      `GROUP_CONCAT(
        DISTINCT basm.appointment_slots
        ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', '
    ) AS appointment_slots`,
      "cu.slot_id",
      "cu.user_id",
    ],
    table: `${tables.callUpdates} cu`,
    conditions: [
      {
        field: "cu.user_id",
        operator: "IN",
        value: [...ids],
      },
      { field: "cu.call_status", operator: "=", value: 0 },
      { field: "cu.call_type", operator: "<>", value: "14" },
      {
        field: "DATE(cu.schedule_date)",
        operator: "=",
        value: moment().add(1, "day").format("YYYY-MM-DD"),
      },
      {
        field: "cu.slot_id",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
    ],
    joins: [
      {
        type: "INNER",
        table: `${tables.numbers} n`,
        on: "n.n < 1 + LENGTH(cu.slot_id) - LENGTH(REPLACE(cu.slot_id, ',', ''))",
      },
      {
        type: "LEFT",
        table: `${tables.slots} basm`,
        on: `basm.id = CAST(
        TRIM(
            SUBSTRING_INDEX(SUBSTRING_INDEX(cu.slot_id, ',', n.n + 1), ',', -1)
        ) AS UNSIGNED
    )`,
      },
    ],
    groupBy: ["cu.call_id", "cu.user_id"],
  });
  try {
    let finalData;
    console.log(callsData, 1899);
    const { userIds, orderById } = generateUserIdsAndOrderById(callsData);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
      ...(search && searchObj),
    });

    const today = [];
    const tomorrow = [];
    const future = [];
    finalData = userIds.map((user, index) => {
      const call_status = Number(callsData[index]?.call_status);
      return mapUserData({
        details: details[index],
        user,
        extraMappings: {
          call_details: {
            call_id: callsData[index]?.call_id || null,
            call_type: callsData[index]?.call_type || "N/A",
            call_status:
              call_status === 0
                ? "Pending"
                : call_status === 1
                  ? "Done"
                  : call_status === 2
                    ? "Cancelled"
                    : call_status === 3
                      ? "Rescheduled"
                      : "Unanswered",
            appointment_slots: callsData[index]?.appointment_slots || "N/A",
          },
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });
    // finalData.forEach((data)=>{

    // })
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const dietsPendingData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;
    const { results: assesmentDetails } = await readRecord({
      selectFields: [
        "cd.user_id",
        "ass.completion_status as ass_completion_status",
        "ass.nutrition_lifestyle",
        "naf.added_date as naf_added_date",
        "iclr.completion_status",
        "iclr.updated_date as icl_completion_date",
        "dsl.diet_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
        FROM ${tables.assessment}
      ) asp1 WHERE asp1.rn = 1
    ) ass`,
          on: "ass.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
        FROM ${tables.assessment_nutrition_and_lifestyle}
      ) naf1 WHERE naf1.rn = 1
    ) naf`,
          on: "naf.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY active_order_id ORDER BY updated_date DESC) as rn
        FROM ${tables.ingredientChecklistRecords}
      ) iclr1 WHERE iclr1.rn = 1
    ) iclr`,
          on: "iclr.active_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "cd.user_id = dsl.user_id AND cd.active_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session AND dsl.diet_status != 4",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: [...ids],
        },
      ],
    });

    console.log(assesmentDetails, 1192);
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        latest_weight_data: true,
      },
      orderBy: `FIELD(cd.user_id,${ids.join(",")})`,
      ...(search && searchObj),
    });

    const first_session = [];
    const other_sessions = [];

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addFields: {
          latest_weight_data: true,
        },
        extraMappings: {
          assessment_status: {
            naf_status:
              assesmentDetails[index]?.nutrition_lifestyle == 2 &&
              assesmentDetails[index]?.ass_completion_status == 0
                ? 1
                : assesmentDetails[index]?.ass_completion_status,
            naf_added_date: assesmentDetails[index]?.naf_added_date,
            icl_status: assesmentDetails[index]?.completion_status,
            icl_completion_date: assesmentDetails[index]?.icl_completion_date,
          },
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
            diet_id: assesmentDetails[index]?.diet_id || null,
          },
        },
      });
    });
    finalData.forEach((data) => {
      const program_session = data.program_details.current_program_session
        .split("/")[0]
        .split("")
        .slice(1);
      if (Number(program_session) === 0) {
        // delete data.weight_details;
        first_session.push(data);
      } else {
        // delete data.assessment_status;
        // delete data.weight_details;
        other_sessions.push(data);
      }
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        first_session,
        other_sessions,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const breakoverTodayData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    // Fetch user data with on-hold info
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        on_hold_od: true,
      },
      ...(search && searchObj),
    });

    // Prepare response per user
    const finalData = ids.map((user, index) => {
      const detail = details[index];

      return mapUserData({
        details: detail,
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          onhold_details: {
            start_date: detail?.on_hold_start_date
              ? moment(detail.on_hold_start_date).format("DD-MM-YYYY")
              : "N/A",
            end_date: detail?.on_hold_end_date
              ? moment(detail.on_hold_end_date).format("DD-MM-YYYY")
              : "N/A",
            onhold_note: detail?.on_hold_note || "N/A",
          },
        },
      });
    });

    // Final API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const programStartingTodayData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    // Fetch assessment details
    const { results: assesmentDetails } = await readRecord({
      selectFields: [
        "cd.user_id",
        "ass.completion_status as ass_completion_status",
        "ass.nutrition_lifestyle as nutrition_lifestyle",
        "naf.added_date as naf_added_date",
        "iclr.completion_status",
        "iclr.updated_date as icl_completion_date",
        "dsl.diet_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
        FROM ${tables.assessment}
      ) asp1 WHERE asp1.rn = 1
    ) ass`,
          on: "ass.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
        FROM ${tables.assessment_nutrition_and_lifestyle}
      ) naf1 WHERE naf1.rn = 1
    ) naf`,
          on: "naf.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY active_order_id ORDER BY updated_date DESC) as rn
        FROM ${tables.ingredientChecklistRecords}
      ) iclr1 WHERE iclr1.rn = 1
    ) iclr`,
          on: "iclr.active_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "cd.user_id = dsl.user_id AND cd.active_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session AND dsl.diet_status != 4",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: [...ids],
        },
      ],
    });

    // Fetch user details with program info
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    // Bifurcate data based on `order_type`
    const programStartingToday = {
      all: [],
      new: [],
      ocr: [],
      renewal: [],
    };

    finalData = ids.map((user, index) => {
      const userDetail = details[index];
      const orderType = userDetail?.current_program_order_type; // Assuming `current_program_order_type` exists in user details

      // Categorize based on `order_type`
      if (orderType === "New") {
        programStartingToday.new.push(
          mapUserData({
            details: userDetail,
            user,
            extraMappings: {
              assessment_status: {
                naf_status:
                  assesmentDetails[index]?.nutrition_lifestyle == 2 &&
                  assesmentDetails[index]?.ass_completion_status == 0
                    ? 1
                    : assesmentDetails[index]?.ass_completion_status,
                naf_added_date: assesmentDetails[index]?.naf_added_date,
                icl_status: assesmentDetails[index]?.completion_status,
                icl_completion_date:
                  assesmentDetails[index]?.icl_completion_date,
              },
            },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: "",
              },
            },
          }),
        );
      } else if (orderType === "OCR") {
        programStartingToday.ocr.push(
          mapUserData({
            details: userDetail,
            user,
            extraMappings: {
              assessment_status: {
                naf_status:
                  assesmentDetails[index]?.nutrition_lifestyle == 2 &&
                  assesmentDetails[index]?.ass_completion_status == 0
                    ? 1
                    : assesmentDetails[index]?.ass_completion_status,
                naf_added_date: assesmentDetails[index]?.naf_added_date,
                icl_status: assesmentDetails[index]?.completion_status,
                icl_completion_date:
                  assesmentDetails[index]?.icl_completion_date,
              },
            },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: "",
              },
            },
          }),
        );
      } else if (orderType === "Renewal") {
        programStartingToday.renewal.push(
          mapUserData({
            details: userDetail,
            user,
            extraMappings: {
              assessment_status: {
                naf_status:
                  assesmentDetails[index]?.nutrition_lifestyle == 2 &&
                  assesmentDetails[index]?.ass_completion_status == 0
                    ? 1
                    : assesmentDetails[index]?.ass_completion_status,
                naf_added_date: assesmentDetails[index]?.naf_added_date,
                icl_status: assesmentDetails[index]?.completion_status,
                icl_completion_date:
                  assesmentDetails[index]?.icl_completion_date,
              },
            },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: "",
              },
            },
          }),
        );
      }

      // Add all users to the "all" category
      programStartingToday.all.push(
        mapUserData({
          details: userDetail,
          user,
          extraMappings: {
            assessment_status: {
              naf_status:
                assesmentDetails[index]?.nutrition_lifestyle == 2 &&
                assesmentDetails[index]?.ass_completion_status == 0
                  ? 1
                  : assesmentDetails[index]?.ass_completion_status,
              naf_added_date: assesmentDetails[index]?.naf_added_date,
              icl_status: assesmentDetails[index]?.completion_status,
              icl_completion_date: assesmentDetails[index]?.icl_completion_date,
            },
          },
          addExtraKeyTo: {
            user_details: {
              user_id: user,
              whatsapp_text: "",
            },
          },
        }),
      );
    });

    // Prepare response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: programStartingToday, // Return data with bifurcation
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const programExpiringData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,

        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const healthscoreReceivedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        health_score: true,
      },
      orderBy: `FIELD(cd.user_id,${ids.join(",")})`,
      ...(search && searchObj),
    });

    const halftime_hs = [];
    const tailend_hs = [];

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addFields: { health_score: true },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    finalData.forEach((data) => {
      console.log(data, 2236);
      if (Number(data.health_score_details.type) === 1) {
        halftime_hs.push(data);
      } else if (Number(data.health_score_details.type) === 2) {
        tailend_hs.push(data);
      }
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        halftime_hs,
        tailend_hs,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const feedbackReceivedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        halftime_feedback: true,
        final_feedback: true,
        is_active: true,
      },
      orderBy: `ff.added_date DESC, hf1.added_date DESC`,
      ...(search && searchObj),
    });
    const halftime_feedback = [];
    const tailend_feedback = [];
    console.log(details, 2532);
    finalData = ids.map((user, index) => {
      const data = mapUserData({
        details: details[index],
        user,
        extraMappings: {
          halftime_feedback: {
            mentor_star_rating: details[index].client_halftime_mentor_rating,
            added_date: details[index].client_halftime_feedback_date,
            improvement_needed: details[index].client_halftime_improvement,
          },
          final_feedback: {
            mentor_rating: details[index].client_final_mentor_rating,
            improvement_needed: details[index].client_final_improvement,
            added_date: details[index].client_final_feedback_date,
          },
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
      if (details[index].client_final_feedback_date != null) {
        delete data.halftime_feedback;
        tailend_feedback.push(data);
      } else if (details[index].client_halftime_feedback_date != null) {
        delete data.final_feedback;
        halftime_feedback.push(data);
      }
      return data;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        halftime_feedback,
        tailend_feedback,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const goalReceivedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal: true,
      },
      orderBy: `FIELD(cd.user_id,${ids.join(",")})`,
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        extraMappings: {
          goal_comment: safeJSONParse(details[index].comment),
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const comCallData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;
    const { results: changeOfMentorData } = await readRecord({
      selectFields: ["ad.crm_user", "com.user_id", "com.added_date"],
      table: `${tables.changeOfMentor} com`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "com.old_mentor = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "com.user_id", operator: "IN", value: ids },
        { field: "com.old_mentor", operator: "<>", value: "0" },
      ],
      orderBy: [`FIELD(com.user_id, ${ids.join(",")})`],
    });
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: `FIELD(cd.user_id,${ids.join(",")})`,
      ...(search && searchObj),
    });
    console.log(changeOfMentorData, 2500);
    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        extraMappings: {
          com_details: {
            old_mentor: changeOfMentorData[index]?.crm_user || "N/A",
            com_date: changeOfMentorData[index]?.added_date || "N/A",
          },
        },
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
//howsMyDay

//todayRiskAndMisses
const todayRiskAndMisses = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const [data, atRiskCount] = await Promise.all([
      // 1. Get today's risk and misses categorized data
      todaysRiskAndMissesData({ mentor_id }),

      // 2. Get users who haven't messaged in last 48 hours and are still active
      clientEnquiry
        .aggregate([
          {
            $match: {
              mentor_id: Number(mentor_id),
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
                $lt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
              },
            },
          },
        ])
        .then(async (queries) => {
          const userIds = queries.map((query) => query._id);

          if (userIds.length === 0) {
            return { length: 0, user_ids: "[]" };
          }

          const { results: activeUsers } = await readRecord({
            table: `${tables.userDetails} ud`,
            joins: [
              {
                type: "LEFT",
                table: `${tables.subOrderPrograms} sop`,
                on: "ud.active_order_id = sop.sub_order_id",
              },
              {
                type: "LEFT",
                table: `${tables.programsMaster} pm`,
                on: "pm.program_id = sop.program_id",
              },
            ],
            conditions: [
              { field: "ud.sub_user_status", operator: "=", value: "Active" },
              { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
              { field: "ud.user_id", operator: "IN", value: userIds },
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
          });

          return {
            length: activeUsers.length,
            user_ids: activeUsers.map((user) => user.user_id),
          };
        }),
    ]);

    // Helpers
    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    // Individual counts
    const weight_od = getCountByKey("weight_od");
    const diet_od = getCountByKey("diet_od");
    const not_started_od = getCountByKey("not_started_od");
    const calls_missed = getCountByKey("calls_missed");
    const on_hold_od = getCountByKey("onhold_od");
    const call_od_ht = getCountByKey("ht_call_od");
    const call_od_te = getCountByKey("te_call_od");
    const welcome_call_od = getCountByKey("welcome_call_od");
    const call_od = call_od_ht + call_od_te + welcome_call_od;
    const validity_awareness_plus_increase = getCountByKey(
      "validity_awareness_plus_increase",
    );
    const goal_od = getCountByKey("goal_od");
    const feedback_od_ht = getCountByKey("feedback_od_ht");
    const feedback_od_te = getCountByKey("feedback_od_te");
    const feedback_od_ht_te = feedback_od_ht + feedback_od_te;
    const health_score_od_ht = getCountByKey("health_score_od_ht");
    const health_score_od_te = getCountByKey("health_score_od_te");
    const health_score_od_ht_te = health_score_od_ht + health_score_od_te;

    const ActiveResponse = [
      {
        key: "weight_od",
        count: weight_od,
        user_ids: safeJSONParse(getUserIdsByKey("weight_od")),
      },
      {
        key: "diet_od",
        count: diet_od,
        user_ids: safeJSONParse(getUserIdsByKey("diet_od")),
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
        key: "validity_awareness_plus_increase",
        count: validity_awareness_plus_increase,
        user_ids: safeJSONParse(
          getUserIdsByKey("validity_awareness_plus_increase"),
        ),
      },
      {
        key: "calls_missed",
        count: calls_missed,
        user_ids: safeJSONParse(getUserIdsByKey("calls_missed")),
      },
      {
        key: "goal_od",
        count: goal_od,
        user_ids: safeJSONParse(getUserIdsByKey("goal_od")),
      },
      {
        key: "feedback_od_ht_te",
        count: feedback_od_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("feedback_od_ht")),
            ...safeJSONParse(getUserIdsByKey("feedback_od_te")),
          ]),
        ],
      },
      {
        key: "health_score_od_ht_te",
        count: health_score_od_ht_te,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("health_score_od_ht")),
            ...safeJSONParse(getUserIdsByKey("health_score_od_te")),
          ]),
        ],
      },

      {
        key: "at_risk",
        count: atRiskCount.length,
        user_ids: atRiskCount.user_ids,
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Risk And Misses fetched Successfully",
      data: ActiveResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const todayRiskAndMissesMentor = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    // const [data, atRiskCount] = await Promise.all([
    //   // 1. Get today's risk and misses categorized data
    //   todaysRiskAndMissesMentorData({ mentor_id }),

    //   // 2. Get users who haven't messaged in last 48 hours and are still active
    //   clientEnquiry
    //     .aggregate([
    //       {
    //         $match: {
    //           mentor_id: Number(mentor_id),
    //           type: { $ne: "broadcast" },
    //         },
    //       },
    //       {
    //         $group: {
    //           _id: "$user_id",
    //           lastMessage: { $max: "$createdAt" },
    //         },
    //       },
    //       {
    //         $match: {
    //           lastMessage: {
    //             $lt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
    //           },
    //         },
    //       },
    //     ])
    //     .then(async (queries) => {
    //       const userIds = queries.map((query) => query._id);

    //       if (userIds.length === 0) {
    //         return { length: 0, user_ids: "[]" };
    //       }

    //       const { results: activeUsers } = await readRecord({
    //         table: `${tables.userDetails} ud`,
    //         joins: [
    //           {
    //             type: "LEFT",
    //             table: `${tables.subOrderPrograms} sop`,
    //             on: "ud.active_order_id = sop.sub_order_id",
    //           },
    //           {
    //             type: "LEFT",
    //             table: `${tables.programsMaster} pm`,
    //             on: "pm.program_id = sop.program_id",
    //           },
    //         ],
    //         conditions: [
    //           { field: "ud.sub_user_status", operator: "=", value: "Active" },
    //           { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
    //           { field: "ud.user_id", operator: "IN", value: userIds },
    //           {
    //             field: "LCASE(pm.program_name)",
    //             operator: "NOT LIKE",
    //             value: "'%khyati%'",
    //             raw: true,
    //           },
    //           {
    //             field: "LCASE(pm.program_name)",
    //             operator: "NOT LIKE",
    //             value: "'%platinum%'",
    //             raw: true,
    //           },
    //           {
    //             field: "LCASE(pm.program_name)",
    //             operator: "NOT LIKE",
    //             value: "'%privy%'",
    //             raw: true,
    //           },
    //         ],
    //       });

    //       return {
    //         length: activeUsers.length,
    //         user_ids: activeUsers.map((user) => user.user_id),
    //       };
    //     }),
    // ]);

    // Helpers
    const data = await todaysRiskAndMissesMentorData({ mentor_id });
    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    // Individual counts
    const diet_od = getCountByKey("diet_od");
    const calls_missed = getCountByKey("calls_missed");
    const validity_awareness_plus_increase = getCountByKey(
      "validity_awareness_plus_increase",
    );
    const health_score_od = getCountByKey("health_score");
    const feedback_od = getCountByKey("feedback_te") + getCountByKey("feedback_ht");
    const goal_od = getCountByKey("goal");
    const milestone_od = getCountByKey("milestone");
    const healthscore_oc_od = getCountByKey("healthscore_oc");
    const weight_tracker_oc = getCountByKey("weight_tracker_oc");
    // 1. Get the start of TODAY (00:00:00.000)
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0); 

const smart_scale_weight_data = await SmartScaleData.aggregate([
  {
    $match: {
      mentor_id: Number(mentor_id),
      // 2. This selects everything strictly BEFORE today's midnight
      createdAt: { $lt: todayStart }, 
      is_acknowledged: false
    }
  },
  {
    $sort: { user_id: 1, createdAt: -1 }
  },
  {
    $group: {
      _id: "$user_id",
      latestEntryBeforeToday: { $first: "$$ROOT" }
    }
  },
  {
    $replaceRoot: { newRoot: "$latestEntryBeforeToday" }
  },
  {
    $project: {
      _id: 1,
      user_id: 1,
      createdAt: 1 // Adding this helps you verify the date in your results
    }
  }
]);
    const ActiveResponse = [
      {
        key: "smart_scale_scan_filled_od",
        count: smart_scale_weight_data.length,
        user_ids: smart_scale_weight_data, 
      },
      {
        key: "milestone_filled_od",
        count: milestone_od,
        user_ids: safeJSONParse(getUserIdsByKey("milestone")),
      },
      { 
        key: "goal_filled_od",
        count: goal_od,
        user_ids: safeJSONParse(getUserIdsByKey("goal")),
       },
       {
        key: "health_score_(ht_&_te)_od",
        count: health_score_od,
        user_ids: safeJSONParse(getUserIdsByKey("health_score")),
       },
        {
        key: "feedback_(ht_&_te)_od",
        count: feedback_od,
        user_ids: [
          ...new Set([
            ...safeJSONParse(getUserIdsByKey("feedback_te")),
            ...safeJSONParse(getUserIdsByKey("feedback_ht")),
          ]),
        ],
      },
      {
        key: "oc_weight_tracker_filled_od",
        count: weight_tracker_oc,
        user_ids: safeJSONParse(getUserIdsByKey("weight_tracker_oc")),
      },
      {
        key: "oc_health_score_filled_od",
        count: healthscore_oc_od,
        user_ids: safeJSONParse(getUserIdsByKey("healthscore_oc")),
      },        
      {
        key: "diet_od",
        count: diet_od,
        user_ids: safeJSONParse(getUserIdsByKey("diet_od")),
      },
      {
        key: "calls_missed",
        count: calls_missed,
        user_ids: safeJSONParse(getUserIdsByKey("calls_missed")),
      },
      {
        key: "validity_awareness_plus_increase",
        count: validity_awareness_plus_increase,
        user_ids: safeJSONParse(
          getUserIdsByKey("validity_awareness_plus_increase"),
        ),
      },
      // {
      //   key: "at_risk",
      //   count: atRiskCount.length,
      //   user_ids: atRiskCount.user_ids,
      // },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Risk And Misses fetched Successfully",
      data: ActiveResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const todayRiskAndMissesClient = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const data = await todaysRiskAndMissesClientData({ mentor_id });
    // Helpers
    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    // Individual counts
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

    const ActiveResponse = [
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

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Risk And Misses fetched Successfully",
      data: ActiveResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const startLater = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const data = await startLaterData({ mentor_id });
    // Helpers
    const getCountByKey = (key) => data.find((r) => r.type === key)?.count || 0;
    const getUserIdsByKey = (key) =>
      data.find((r) => r.type === key)?.user_ids || "[]";

    // Individual counts
    const start_later_clients = getCountByKey("start_later_clients");

    const ActiveResponse = [
      {
        key: "start_later_clients",
        count: start_later_clients,
        user_ids: safeJSONParse(getUserIdsByKey("start_later_clients")),
      },
    ];

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Start Later fetched Successfully",
      data: ActiveResponse,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const weightOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  // Group display ranges
  const dormancyLevels = {
    "10th Day OD (11th - 12th)": [11, 12],
    "Level 1 (13th - 14th)": [13, 14],
    "Level 2 (15th - 16th)": [15, 16],
    "Level 3 (17th - 18th)": [17, 18],
    "Start Weight OD": [1, 2, 3],
    "Mid Weight OD": [6, 7, 8],
  };

  // Exact notification_id mapping
  const notificationMap = {
    6: 297,
    7: 297,
    11: 9,
    12: 296,
    13: 18,
    14: 18,
    15: 19,
    16: 20,
    17: 21,
    18: 22,
    19: 23, // Dormant
    1: 99,
    2: 99,
    3: 99,
    6: 101,
    7: 101,
    8: 101,
  };

  // Initialize output structure
  const dormancyData = {};
  Object.keys(dormancyLevels).forEach((label) => {
    dormancyData[label] = {
      data: [],
      count: 0,
    };
  });

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        diet_start_date: true,
      },
      ...(search && searchObj),
    });

    ids.forEach((user, index) => {
      const userDetails = details[index];
      const daysInProgram = parseInt(userDetails.dormancy_level);

      if (!isNaN(daysInProgram)) {
        for (const [label, days] of Object.entries(dormancyLevels)) {
          if (days.includes(daysInProgram)) {
            const mappedUser = mapUserData({
              details: userDetails,
              user,
              addExtraKeyTo: {
                user_details: {
                  user_id: user,
                  whatsapp_text: "",
                  dormancy_level: label,
                  notification_id: notificationMap[daysInProgram] || null,
                },
              },
            });

            dormancyData[label].data.push(mappedUser);
            dormancyData[label].count += 1;
            break;
          }
        }
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: dormancyData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const dietOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        diet_status: true,
        diet_start_date: true,
      },
      ...(search && searchObj),
    });

    const nafDrafted = [];
    const nafNotDrafted = [];
    const nafAll = [];

    const wmrDrafted = [];
    const wmrNotDrafted = [];
    const wmrAll = [];

    details.forEach((userDetails, index) => {
      const userId = userDetails?.client_user_id || ids[index];
      const dietStatus = userDetails?.diet_plan_status || "Not Available";
      const sentSessions = Number(
        userDetails?.current_program_sent_sessions || 0,
      );
      const orderType = userDetails?.order_type;
      const odType =
        sentSessions === 0 && orderType == "New" && orderType == "OCR"
          ? "NAF OD"
          : "WMR OD";

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            diet_plan_status: dietStatus,
            od_type: odType,
          },
        },
        extraMappings: {
          last_diet_details: {
            last_diet_name: userDetails?.last_diet_name || "",
            last_diet_sent_date: userDetails?.diet_sent_date || "",
          },
        },
      });

      if (odType === "NAF OD") {
        nafAll.push(mapped);
        if (dietStatus === "Drafted") nafDrafted.push(mapped);
        else if (dietStatus === "Not Drafted") nafNotDrafted.push(mapped);
      } else {
        wmrAll.push(mapped);
        if (dietStatus === "Drafted") wmrDrafted.push(mapped);
        else if (dietStatus === "Not Drafted") wmrNotDrafted.push(mapped);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        naf_od: {
          data: {
            drafted: nafDrafted,
            not_drafted: nafNotDrafted,
            all: nafAll,
          },
          count: {
            drafted: nafDrafted.length,
            not_drafted: nafNotDrafted.length,
            total: nafAll.length,
          },
        },
        wmr_od: {
          data: {
            drafted: wmrDrafted,
            not_drafted: wmrNotDrafted,
            all: wmrAll,
          },
          count: {
            drafted: wmrDrafted.length,
            not_drafted: wmrNotDrafted.length,
            total: wmrAll.length,
          },
        },
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const onholdOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        on_hold_od: true,
      },
      ...(search && searchObj),
    });

    const onHoldToday = [];
    const onHoldOlder = [];
    const allData = [];

    details.forEach((userDetails, index) => {
      const userId = userDetails?.client_user_id || ids[index];
      const onHoldGroup = userDetails?.on_hold_status_group || "older";
      const endDate = userDetails?.on_hold_end_date || null;

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            on_hold_status_group: onHoldGroup,
          },
        },
        extraMappings: {
          onhold_details: {
            start_date: userDetails?.on_hold_start_date
              ? moment(userDetails.on_hold_start_date).format("DD-MM-YYYY")
              : "N/A",
            end_date: userDetails?.on_hold_end_date
              ? moment(userDetails.on_hold_end_date).format("DD-MM-YYYY")
              : "N/A",
            onhold_note: userDetails?.on_hold_note || "N/A",
          },
        },
      });

      allData.push(mapped);

      if (onHoldGroup === "today") {
        onHoldToday.push(mapped);
      } else {
        onHoldOlder.push(mapped);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        today: onHoldToday,
        older: onHoldOlder,
        all: allData,
      },
      count: {
        today: onHoldToday.length,
        older: onHoldOlder.length,
        total: allData.length,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const notstartedOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    const allData = {
      new: [],
      ocr: [],
      renewal: [],
    };
    const notStartedToday = {
      new: [],
      ocr: [],
      renewal: [],
    };
    const notStartedOlder = {
      new: [],
      ocr: [],
      renewal: [],
    };

    const { results: assesmentDetails } = await readRecord({
      selectFields: [
        "cd.user_id",
        "ass.completion_status as ass_completion_status",
        "ass.nutrition_lifestyle",
        "naf.added_date as naf_added_date",
        "iclr.completion_status",
        "iclr.updated_date as icl_completion_date",
        "dsl.diet_id",
        "sop.order_type", // Add the order_type field
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
            SELECT * FROM (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
              FROM ${tables.assessment}
            ) asp1 WHERE asp1.rn = 1
          ) ass`,
          on: "ass.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT * FROM (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY update_date DESC) as rn
              FROM ${tables.assessment_nutrition_and_lifestyle}
            ) naf1 WHERE naf1.rn = 1
          ) naf`,
          on: "naf.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT * FROM (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY active_order_id ORDER BY updated_date DESC) as rn
              FROM ${tables.ingredientChecklistRecords}
            ) iclr1 WHERE iclr1.rn = 1
          ) iclr`,
          on: "iclr.active_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "cd.user_id = dsl.user_id AND cd.active_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session AND dsl.diet_status != 4",
        },
      ],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: [...ids],
        },
      ],
    });

    details.forEach((userDetails, index) => {
      // console.log(userDetails);
      const userId = userDetails?.client_user_id || ids[index];
      const sentSessions = Number(
        userDetails?.current_program_sent_sessions || 0,
      );

      // if (sentSessions !== 0) return; // Only include Not Started

      const startGroup = userDetails?.program_start_group || "older";
      const startDate = userDetails?.program_start_date || null;
      const addedBy = userDetails?.start_date_added_by_label || "Default";
      const orderType = userDetails?.current_program_order_type || "New"; // Default to "new"
      console.log(startGroup, "User ID:", userId, "Order Type:", orderType); // Log the order_type

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            od_status: "Not Started OD",
            program_start_date: startDate,
            program_start_group: startGroup,
            start_date_added_by: addedBy,
          },
        },
        extraMappings: {
          assessment_status: {
            naf_status:
              assesmentDetails[index]?.nutrition_lifestyle == 2 &&
              assesmentDetails[index]?.ass_completion_status == 0
                ? 1
                : assesmentDetails[index]?.ass_completion_status,
            naf_added_date: assesmentDetails[index]?.naf_added_date,
            icl_status: assesmentDetails[index]?.completion_status,
            icl_completion_date: assesmentDetails[index]?.icl_completion_date,
          },
        },
      });

      // Categorize into New, OCR, Renewal based on order type
      if (orderType === "New") {
        allData.new.push(mapped);
        if (startGroup === "today") {
          notStartedToday.new.push(mapped);
        } else {
          notStartedOlder.new.push(mapped);
        }
      } else if (orderType === "OCR") {
        allData.ocr.push(mapped);
        if (startGroup === "today") {
          notStartedToday.ocr.push(mapped);
        } else {
          notStartedOlder.ocr.push(mapped);
        }
      } else if (orderType === "Renewal") {
        allData.renewal.push(mapped);
        if (startGroup === "today") {
          notStartedToday.renewal.push(mapped);
        } else {
          notStartedOlder.renewal.push(mapped);
        }
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        today: notStartedToday,
        older: notStartedOlder,
        all: allData,
      },
      totalCount: {
        today: {
          new: notStartedToday.new.length,
          ocr: notStartedToday.ocr.length,
          renewal: notStartedToday.renewal.length,
        },
        older: {
          new: notStartedOlder.new.length,
          ocr: notStartedOlder.ocr.length,
          renewal: notStartedOlder.renewal.length,
        },
        total: {
          new: allData.new.length,
          ocr: allData.ocr.length,
          renewal: allData.renewal.length,
        },
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const callOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        order_summary: true,
        suggested_program: true,
        call_od: true,
      },
      ...(search && searchObj),
    });

    const allData = [];
    const halfTimeCall = [];
    const tailEndCall = [];
    const welcomeCall = [];
    // console.log(details,2588);

    details.forEach((userDetails, index) => {
      const userId = userDetails?.client_user_id || ids[index];
      const callType = userDetails?.call_type_group;

      if (!callType) return; // skip if no call needed

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            call_type_group: callType,
          },
        },
      });

      allData.push(mapped);

      if (callType === "half_time_call") {
        halfTimeCall.push(mapped);
      } else if (callType === "tail_end_call") {
        tailEndCall.push(mapped);
      } else if (callType === "welcome_call") {
        welcomeCall.push(mapped);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Call OD data fetched successfully",
      data: {
        welcome_call: welcomeCall,
        half_time_call: halfTimeCall,
        tail_end_call: tailEndCall,
        all: allData,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const validityAwarnessIncreaseData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        validity_extensions: true,
      },
      ...(search && searchObj),
    });

    const finalData = ids.map((user, index) => {
      const extensionCount = details[index]?.validity_extension_count || 0;

      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            validity_extension_count: extensionCount,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const goalOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const callsMissedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        call_logs: true,
      },
      ...(search && searchObj),
    });

    // console.log(details);

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          call_details: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const feedbackOdData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        order_summary: true,
        suggested_program: true,
        feedback_od: true,
      },
      ...(search && searchObj),
    });

    const allData = [];
    const halfTimeFeedback = [];
    const finalFeedback = [];

    details.forEach((userDetails, index) => {
      const userId = userDetails?.client_user_id || ids[index];
      const type = userDetails?.feedback_type_group;

      if (!type) return;

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            feedback_type_group: type,
          },
        },
      });

      allData.push(mapped);

      if (type === "half_time_feedback") {
        halfTimeFeedback.push(mapped);
      } else if (type === "final_feedback") {
        finalFeedback.push(mapped);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Feedback OD data fetched successfully",
      data: {
        half_time_feedback: halfTimeFeedback,
        final_feedback: finalFeedback,
        all: allData,
      },
      count: {
        half_time_feedback: halfTimeFeedback.length,
        final_feedback: finalFeedback.length,
        total: allData.length,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const healthscoreData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        order_summary: true,
        suggested_program: true,
        healthscore_od: true,
      },
      ...(search && searchObj),
    });

    const allData = [];
    const halfTimeHS = [];
    const programHS = [];

    details.forEach((userDetails, index) => {
      const userId = userDetails?.client_user_id || ids[index];
      const hsType = userDetails?.healthscore_type_group;

      if (!hsType) return;

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            healthscore_type_group: hsType,
          },
        },
      });

      allData.push(mapped);

      if (hsType === "half_time_healthscore") {
        halfTimeHS.push(mapped);
      } else if (hsType === "program_healthscore") {
        programHS.push(mapped);
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Health Score OD data fetched successfully",
      data: {
        half_time_healthscore: halfTimeHS,
        program_healthscore: programHS,
        all: allData,
      },
      count: {
        half_time_healthscore: halfTimeHS.length,
        program_healthscore: programHS.length,
        total: allData.length,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const lessLossData = async (req, res, next) => {
  try {
    const { id, days } = req.body;
    if (!id) {
      return next(new ErrorHandler("id is required", 400));
    }
    if (days && days != 30 && days != 60 && days != 90) {
      return next(new ErrorHandler("Invalid days", 400));
    }

    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
    ];
    const other_conditions = [
      { field: "uki.id", operator: "IS", value: "NULL", raw: true },
      {
        orConditions: [
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          {
            field: "cu.call_status",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          { field: "cu.call_status", operator: "=", value: 0 },
        ],
      },
    ];
    if (days == 30) {
      conditions.push(
        {
          field:
            "(sop.total_sessions = 3 AND sop.sent_sessions>= 2 AND  sop.start_program_weight - cd.latest_weight < 1.5)",
          operator: "",
          value: "",
          raw: true,
        },
        ...other_conditions,
      );
    } else if (days == 60) {
      conditions.push(
        {
          field:
            "(sop.total_sessions = 6 AND sop.sent_sessions>= 3 AND sop.start_program_weight - cd.latest_weight < 3)",
          operator: "",
          value: "",
          raw: true,
        },
        ...other_conditions,
      );
    } else if (days == 90) {
      conditions.push(
        {
          field:
            "(sop.total_sessions = 9 AND sop.sent_sessions>= 5 AND sop.start_program_weight - cd.latest_weight <3)",
          operator: "",
          value: "",
          raw: true,
        },
        ...other_conditions,
      );
    } else {
      conditions.push({
        orConditions: [
          {
            field:
              "(sop.total_sessions = 3 AND sop.sent_sessions>= 2 AND  sop.start_program_weight - cd.latest_weight < 1.5)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "(sop.total_sessions = 6 AND sop.sent_sessions>= 3 AND sop.start_program_weight - cd.latest_weight < 3)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "(sop.total_sessions = 9 AND sop.sent_sessions>= 5 AND sop.start_program_weight - cd.latest_weight <3)",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });
    }
    console.log(conditions, 6866);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "DATE_FORMAT(cu.schedule_date, '%Y-%m-%d') as schedule_date",
        "s.appointment_slots",
        "cu.call_id",
        "ad.designation",
        "ad.crm_user",
        "uki.key_insight",
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
          table: `${tables.callUpdates} cu`,
          on: "cd.user_id = cu.user_id AND sop.sub_order_id = cu.sub_order_id AND cu.call_type = '31'",
        },
        {
          type: "LEFT",
          table: `${tables.userKeyInsight} uki`,
          on: "cd.user_id = uki.user_id and sop.sub_order_id = uki.sub_order_id and uki.source = 'less-loss'",
        },
        {
          type: "LEFT",
          table: `${tables.slots} s`,
          on: "cu.slot_id = s.id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        ...conditions,
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "dsl.end_session_weight",
          operator: "!=",
          value: 0,
        },
      ],
      countTotal: true,
      groupBy: ["cd.user_id"],
    });
    console.log(users);
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.tableText} tt`,
      conditions: [
        { field: "tt.table_name", operator: "=", value: "Less Loss" },
      ],
    });
    const whatsappVariables = extractVariables(results[0].whatsapp_text);
    const mailVariables = extractVariables(results[0].mail_text);
    // return false;
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No less loss data found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    const whatsTextDetails = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...whatsappVariables, ...mailVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    console.log(whatsTextDetails.length, 6953);
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
      const mappedData = mapUserData({
        user,
        details: details[index],
        addFields: { weight_details: true },
        extraMappings: {
          "call_&_key_insight_details": {
            schedule_date: user.schedule_date,
            appointment_slots: user.appointment_slots,
            key_insight: user.key_insight,
          },
        },
        addExtraKeyTo: {
          user_details: {
            whatsapp_text: details[index]?.call_id
              ? `Hi {name},
 Your call with ${details[index].designation} ${details[index].crm_user} (myself) is scheduled for ${details[index].appointment_slots} IST Today. 
 I will call you on your registered mobile number. 
 Looking forward to connecting with you. In the meantime, 
 Click here & download the BN App: https://bit.ly/3vSD9vA

 In case you have the app already, click here to check if it is updated : 
 https://bit.ly/3vSD9vA
 Regards, Team Balance Nutrition`
              : replacePlaceholders(
                  results[0].whatsapp_text,
                  whatsTextDetails[index],
                ),
            mail_text: replacePlaceholders(
              results[0].mail_text,
              whatsTextDetails[index],
            ),
            mail_subject: "I am Worried - message from Khyati Rupani ",
            notification_id: results[0].notification_id,
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Less loss data fetched successfully",
      data: finalData,
      totalCount,
    });
    res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// Formatter
function formatVisitData(rows) {
  return rows.map((row, index) => {
    const typeLabel = row.page_type === 1 ? "Page Visit" : "Checkout";
    const visitDate = row.latest_visit;
    const visitText =
      `${row.program_name} (${visitDate})` +
      (row.visit_count > 1 ? ` (${row.visit_count} times)` : "") +
      ` (${typeLabel})`;
    return visitText;
  });
}

export const getClientVisitSummary = async (req, res, next) => {
  try {
    const user_id = req.query.user_id;
    if (!user_id)
      return res.status(400).json({ message: "user_id is required" });

    const data = await getPageVisitHistory(user_id);
    const formatted = formatVisitData(data);

    res.status(200).json({
      success: true,
      message: "Client Visit History (Last 30 Days)",
      data: formatted,
    });
  } catch (err) {
    console.error("Error in getClientVisitSummary:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const atriskData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        weight_details: true,
        call_logs: true,
        diet_start_date: true,
      },
      ...(search && searchObj),
    });

    const chatQueries = await clientEnquiry.aggregate([
      {
        $match: {
          user_id: { $in: ids },
          type: { $ne: "broadcast" },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$user_id",
          lastMessageDate: { $first: "$createdAt" },
          lastQuery: { $first: "$query" },
          lastSender: { $first: "$sender" },
        },
      },
    ]);

    const chatMap = Object.fromEntries(
      chatQueries.map((q) => [
        q._id,
        {
          last_query: q.lastQuery,
          last_sender_by: q.lastSender,
          last_chat_date: q.lastMessageDate,
        },
      ]),
    );

    const finalData = ids.map((user, index) => {
      const detail = details[index] || {};
      const chat = chatMap[user] || {};

      return mapUserData({
        details: detail,
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          last_interaction: {
            call_type: detail.call_type_label || "",
            call_status: detail.call_status_label || "",
            schedule_date: detail.schedule_date || "",
            call_insights: detail.call_insights || "",
            diet_start_date: detail.diet_start_date || "",
            latest_weight: detail.client_latest_weight || "",
            latest_weight_date: detail.client_latest_weight_date || "",
            last_query: chat.last_query || "",
            last_sender_by: chat.last_sender_by || "",
            last_message_date: chat.last_chat_date || "",
          },
        },
      });
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Data fetched successfully",
        data: finalData,
      }),
    );
  } catch (error) {
    console.error("Error in atriskData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const linkExpiringTodayData = async (req, res, next) => {
  const { user_ids: ids = [], search, dateFilter } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    function getExpiryText(dateStr) {
      const today = moment().startOf("day");
      const expiry = moment(dateStr, "YYYY-MM-DD").startOf("day");

      const diffDays = expiry.diff(today, "days");

      if (diffDays > 0)
        return `Expires in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
      if (diffDays === 0) return "Expires today";
      return `Expired on ${expiry.format("YYYY-MM-DD")}`;
    }

    const serviceLinkExpiry = {
      search,
      extraSelectFields: [
        "pl.payment_link as oh_payment_link",
        "ohcps.reason as oh_reason",
        "ohcps.status as oh_payment_mode",
        "ohcps.amount as oh_amount",
        "ohcps.payment_expiry as oh_expiry_at",
        "ohcps.created_at as oh_created_at",
        "ohcps.days as oh_days",
      ],
      extraConditions: [
        { field: "pl.payment_status", operator: "=", value: "pending" },
        { field: "ohcps.status", operator: "=", value: "Pending" },
        {
          field: "DATE(pl.expiry_at)",
          operator: "=",
          value:
            dateFilter == "today"
              ? "CURDATE()"
              : "DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
          raw: true,
        },
        {
          field: "pl.payment_link_id",
          operator: "IS NOT",
          value: null,
          raw: true,
        },
        {
          field: "pl.user_id",
          operator: "IN",
          value: `(${ids.join(",")})`,
          raw: true,
        },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.onHoldClientPaidService} ohcps`,
          on: "pl.payment_link_id = ohcps.payment_link_id",
        },
      ],
      extraObjects: (i) => {
        return {
          onhold_request_details: {
            payment_link: i.oh_payment_link,
            reason: i.oh_reason,
            payment_mode: i.oh_payment_mode,
            amount: i.oh_amount,
            expiry_at: moment(i.oh_expiry_at).format("YYYY-MM-DD"),
            expiry_in: getExpiryText(i.oh_expiry_at),
            created_at: moment(i.oh_created_at).format("Do MMM YYYY"),
            whatsapp_text: `PFA payment link for onhold - ${i.oh_reason} of amount Rs.${i.oh_amount} is ${i.oh_payment_link}`,
            days: i.oh_days,
          },
        };
      },
    };

    const { data: data2 } = await getFormattedUserData(serviceLinkExpiry);

    // Step 1: Fetch all user data
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    console.log(data2, details, "helloooos");

    const mappedData = [];
    details.forEach((user) => {
      if (
        user.suggested_payment_expiry &&
        ((moment(user?.suggested_payment_expiry).isSame(moment(), "day") &&
          dateFilter === "today") ||
          (moment(user?.suggested_payment_expiry).isSame(
            moment().add(1, "day"),
            "day",
          ) &&
            dateFilter === "tomorrow"))
      ) {
        mappedData.push(
          mapUserData({
            details: user,
            user: user.client_user_id || user.user_id,
            addExtraKeyTo: {
              user_details: {
                user_id: user.client_user_id || user.user_id,
                whatsapp_text: "",
              },
            },
            addFields: {
              follow_up: true,
            },
          }),
        );
      }
    });

    // Step 3: Build structured response for each group
    const result = {
      count: mappedData.length,
      data: mappedData,
    };

    const resultService = {
      count: data2?.length,
      data: data2,
    };

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Expiry data grouped successfully",
        data: {
          suggest_program: result,
          service_link: resultService,
        },
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function formatCartItems(cart_items) {
  let totalAmount = 0;

  const itemsString = cart_items
    .map((item) => {
      const lineTotal = item.price_per_unit * item.quantity;
      totalAmount += lineTotal;

      return `${item.product_name} | Qty: ${item.quantity} | ₹${lineTotal}`;
    })
    .join("   |   ");

  return {
    itemsString,
    totalAmount,
  };
}

export const cartAddedUserData = async (req, res, next) => {
  try {
    const { user_ids: ids = [], search } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }

    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    const { results } = await readRecord({
      table: `${tables.cart} ct`,
      selectFields: [
        "CONCAT('[',GROUP_CONCAT(ct.cart_items),']') as cart_info",
        "ct.cart_id",
        "cd.user_id",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `cd.user_id = ct.user_id`,
        },
      ],
      conditions: [
        {
          field: "ct.user_id",
          operator: "IN",
          value: ids,
        },
        {
          field: "MONTH(ct.updated_date)",
          operator: "=",
          value: "MONTH(CURRENT_DATE())",
          raw: true,
        },
        {
          field: "ct.cart_code",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "YEAR(ct.updated_date)",
          operator: "=",
          value: "YEAR(CURRENT_DATE())",
          raw: true,
        },
        {
          field: "JSON_LENGTH(ct.cart_items)",
          operator: ">",
          value: 0,
        },
      ],
      groupBy: ["ct.user_id"],
    });
    const { userIds, orderById } = generateUserIdsAndOrderById(results);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
      orderBy: orderById,
    });

    const finalData = results.map((cartData, index) => {
      const userDetail = details[index] || {};
      const { abandonedCartMessage } = buildCartWhatsappMessages(
        safeJSONParse(cartData.cart_info).flat(),
        userDetail,
        cartData,
      );
      return mapUserData({
        details: userDetail,
        user: cartData.user_id,
        addExtraKeyTo: {
          user_details: {
            whatsapp_text: abandonedCartMessage,
          },
        },
        extraMappings: {
          cart_info: cartData.cart_info
            ? safeJSONParse(cartData.cart_info).flat()
            : {},
        },
      });
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Expiry data grouped successfully",
        data: finalData,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const cartShareLinkUserData = async (req, res, next) => {
  try {
    const { user_ids: ids = [], search } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }

    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    const { results } = await readRecord({
      table: `${tables.cart} ct`,
      selectFields: [
        "CONCAT('[',GROUP_CONCAT(ct.cart_items),']') as cart_info",
        "cd.user_id",
        "ct.cart_code",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `cd.user_id = ct.user_id`,
        },
      ],
      conditions: [
        {
          field: "ct.user_id",
          operator: "IN",
          value: ids,
        },
        {
          field: "MONTH(ct.updated_date)",
          operator: "=",
          value: "MONTH(CURRENT_DATE())",
          raw: true,
        },
        { field: "ct.cart_code", operator: "IS NOT", value: "NULL", raw: true },
        { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
        { field: "ct.cart_code", operator: "!=", value: "''", raw: true },
        {
          field: "YEAR(ct.updated_date)",
          operator: "=",
          value: "YEAR(CURRENT_DATE())",
          raw: true,
        },
        {
          field: "JSON_LENGTH(ct.cart_items)",
          operator: ">",
          value: 0,
        },
      ],
      groupBy: ["ct.user_id"],
    });
    const { userIds, orderById } = generateUserIdsAndOrderById(results);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
      orderBy: orderById,
    });

    const finalData = results.map((cartData, index) => {
      const userDetail = details[index] || {};
      const { shareCartLinkMessage } = buildCartWhatsappMessages(
        safeJSONParse(cartData.cart_info).flat(),
        userDetail,
        cartData,
      );
      return mapUserData({
        details: userDetail,
        addExtraKeyTo: {
          user_details: {
            whatsapp_text: shareCartLinkMessage,
          },
        },
        // user: cartData.user_id,
        extraMappings: {
          cart_info: cartData.cart_info
            ? safeJSONParse(cartData.cart_info).flat()
            : {},
          cart_code: cartData.cart_code,
        },
      });
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Expiry data grouped successfully",
        data: finalData,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

/**
 * @function linkExpiringTodayData
 * @description API to fetch and group user data based on payment link expiry.
 *              It processes user IDs from the request body and responds with
 *              structured data of users whose payment links are expiring today,
 *              tomorrow, or in the future.
 * @param {Object} req - The request object containing user IDs and optional search criteria.
 * @param {string[]} req.body.user_ids - Array of user IDs to fetch data for.
 * @param {string} [req.body.search] - Optional search query for filtering users.
 * @param {Object} res - The response object to send the API response.
 * @param {Function} next - The next middleware function in the stack.
 * @returns {Promise<Object>} - API response with user data grouped by expiry status.
 * @throws {Error} - Throws an error if the request is invalid or an internal error occurs.
 */

export const linkExpiringTomorrowData = async (req, res, next) => {
  const { user_ids: ids = [], search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    // Step 1: Fetch all user data
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    // Step 2: Map user data directly (no grouping)
    const mappedUsers = details.map((user) =>
      mapUserData({
        details: user,
        user: user.client_user_id || user.user_id,
        addExtraKeyTo: {
          user_details: {
            user_id: user.client_user_id || user.user_id,
            whatsapp_text: "",
          },
        },
        addFields: {
          follow_up: true,
        },
      }),
    );

    // Step 3: Return the full list
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User data fetched successfully",
        data: mappedUsers,
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//todayRiskAndMisses

//getBirthdayUserIdsTodayAndTomorrow
export const getBirthdayUserIdsTodayAndTomorrow = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const today = moment();
    const todayStr = today.format("DD-MM");
    const tomorrowStr = today.clone().add(1, "days").format("DD-MM");
    console.log(tomorrowStr, 4234);
    const yesterdayStr = today.clone().subtract(1, "days").format("DD-MM");

    // Range strings in DD-MM format
    const next7Start = today.clone().add(1, "days").format("DD-MM");
    const next7End = today.clone().add(8, "days").format("DD-MM");

    const last7Start = today.clone().subtract(8, "days").format("DD-MM");
    const last7End = today.clone().subtract(1, "days").format("DD-MM");

    // Helper for single date
    const getBirthdayData = async (dateStr) => {
      const { results } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "CONCAT('[', GROUP_CONCAT(DISTINCT cd.user_id), ']') AS user_ids",
        ],
        conditions: [
          {
            field: "DATE_FORMAT(cd.birth_date, '%d-%m')",
            operator: "=",
            value: dateStr,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin_id,
          },
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "cd.birthday_ack",
            operator: "=",
            value: 0,
          },
        ],
      });

      const row = results?.[0] || {};
      return {
        count: Number(row.count || 0),
        user_ids: row.user_ids ? JSON.parse(row.user_ids) : [],
      };
    };

    // Helper for date ranges
    const getBirthdayRange = async (start, end) => {
      // Handles wrap-around (e.g., Dec → Jan)
      const operator = moment(start, "DD-MM").isBefore(moment(end, "DD-MM"))
        ? "BETWEEN"
        : "NOT BETWEEN"; // month/year rollover handling

      const { results } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "CONCAT('[', GROUP_CONCAT(DISTINCT cd.user_id), ']') AS user_ids",
        ],
        conditions: [
          {
            field: "DATE_FORMAT(cd.birth_date, '%d-%m')",
            operator,
            value: `${start}' AND '${end}`,
            raw: true, // allow BETWEEN manually formed
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: admin_id,
          },
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "cd.birthday_ack",
            operator: "=",
            value: 0,
          },
        ],
      });

      const row = results?.[0] || {};
      return {
        count: Number(row.count || 0),
        user_ids: row.user_ids ? JSON.parse(row.user_ids) : [],
      };
    };

    const [yesterday, todayData, tomorrow, next7days, last7days] =
      await Promise.all([
        getBirthdayData(yesterdayStr),
        getBirthdayData(todayStr),
        getBirthdayData(tomorrowStr),
        getBirthdayRange(next7Start, next7End),
        getBirthdayRange(last7Start, last7End),
      ]);

    const response = {
      statusCode: 200,
      message: "Birthday User IDs fetched successfully",
      data: {
        yesterday,
        today: todayData,
        tomorrow,
        next7days,
        last7days,
      },
    };

    return res.status(200).json(new ApiResponse(response));
  } catch (error) {
    console.error("Error in getBirthdayUserIdsTodayAndTomorrow:", error);
    return next(new ErrorHandler("Failed to fetch birthday user IDs", 500));
  }
};
export const getCsBirthdayUserIdsTodayYesterday = async (
  req,
  res,
  next,
  internal = false,
) => {
  try {
    const today = moment();
    const todayStr = today.format("DD-MM");
    const yesterday = today.clone().subtract(1, "days").format("DD-MM");
    const dayBeforeYesterDay = today
      .clone()
      .subtract(2, "days")
      .format("DD-MM");

    // Helper for single date
    const getBirthdayData = async (dateStr) => {
      const { results } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "CONCAT('[', GROUP_CONCAT(DISTINCT cd.user_id), ']') AS user_ids",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.productOrders} po`,
            on: "po.user_id=cd.user_id and po.hamper_type='birthday'",
          },
        ],
        conditions: [
          {
            field: "DATE_FORMAT(cd.birth_date, '%d-%m')",
            operator: "=",
            value: dateStr,
          },
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "cd.country_id",
            operator: "=",
            value: 101,
          },
          {
            field: "po.user_id IS Null",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });

      const row = results?.[0] || {};
      return {
        count: Number(row.count || 0),
        user_ids: row.user_ids ? JSON.parse(row.user_ids) : [],
      };
    };

    const [todayData, yesterDay, dayBefore] = await Promise.all([
      getBirthdayData(todayStr),
      getBirthdayData(yesterday),
      getBirthdayData(dayBeforeYesterDay),
    ]);

    if (internal) {
      return {
        pending_day_before_yesterday: dayBefore.count,
        pending_yesterday: yesterDay.count,
        pending_today: todayData.count,
      };
    } else {
      const response = {
        statusCode: 200,
        message: "Birthday User IDs fetched successfully",
        data: {
          today: todayData,
          yesterday: yesterDay,
          dayBefore,
        },
      };
      return res.status(200).json(new ApiResponse(response));
    }
  } catch (error) {
    console.error("Error in getBirthdayUserIdsTodayAndTomorrow:", error);
    if (!internal) {
      return next(new ErrorHandler("Failed to fetch birthday user IDs", 500));
    }
  }
};

export const getCampaignTypeCounts = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const { results } = await readRecord({
      table: `${tables.camp72Details} cm`,
      selectFields: [
        "cm.lead_type",
        "COUNT(DISTINCT cm.user_id) AS count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cm.user_id), "]") AS user_ids',
      ],
      conditions: [
        {
          field: `CASE 
            WHEN ud.user_status = 'Lead' 
              THEN ud.counsellor_assigned = '${admin_id}'
            ELSE 
              ud.mentor_assigned = '${admin_id}' 
          END`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = cm.user_id",
        },
      ],
      groupBy: ["cm.lead_type"],
    });

    // Ensure all lead types show even if 0
    const responseCounts = {
      Active: { count: 0, user_ids: [] },
      Completed: { count: 0, user_ids: [] },
      FL: { count: 0, user_ids: [] },
      OL: { count: 0, user_ids: [] },
    };

    results.forEach((row) => {
      const type = row.lead_type;

      if (responseCounts.hasOwnProperty(type)) {
        responseCounts[type] = {
          count: Number(row.count) || 0,
          user_ids: JSON.parse(row.user_ids || "[]"),
        };
      }
    });

    const response = {
      statusCode: 200,
      message: "Lead type counts fetched successfully",
      data: responseCounts,
    };

    return res.status(200).json(new ApiResponse(response));
  } catch (error) {
    console.error("Error in getLeadTypeCounts:", error);
    return next(new ErrorHandler("Failed to fetch lead type counts", 500));
  }
};

export const getGutCounts = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(DISTINCT ud.user_id) AS count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
      ],
      conditions: [
        {
          field: `ud.current_lead_source`,
          operator: "=",
          value: "78",
        },
        {
          field: `ud.counsellor_assigned`,  
          operator: "=",
          value: admin_id,
        },
      ],
    });

// Ensure all lead types show even if 0 
const responseCounts = { 
  count: results?.[0]?.count ? Number(results[0].count) : 0, 
  user_ids: results?.[0]?.user_ids ? JSON.parse(results[0].user_ids) : [],
 }; 
    const response = {
      statusCode: 200,
      message: "Lead type counts fetched successfully",
      data: responseCounts,
    };

    return res.status(200).json(new ApiResponse(response));
  } catch (error) {
    console.error("Error in getLeadTypeCounts:", error);
    return next(new ErrorHandler("Failed to fetch lead type counts", 500));
  }
};

export const birthdayData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        birthday_hamper: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          birthday_hamper: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getBirthdayHamperDeliveredData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    let finalData;

    const details = await fetchUsersDetailsNew({
      ids,
      orderBy: "pod.delivery_date",
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
        birthday_hamper: true,
      },
      ...(search && searchObj),
    });

    finalData = ids.map((user, index) => {
      return mapUserData({
        details: details[index],
        user,
        addExtraKeyTo: {
          user_details: {
            user_id: user,
            whatsapp_text: "",
          },
        },
        addFields: {
          birthday_hamper: true,
          follow_up: true,
        },
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const dietFeedbackReceivedData = async (req, res, next) => {
  const { user_ids: ids, search } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorHandler("Invalid request: user_ids required", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        diet_feedback: true,
      },
      ...(search && searchObj),
    });
    let data = [];
    let imf_feedback = [];
    let diet_feedback = [];
    const finalData = ids.map((user_id, index) => {
      const userDetails = details[index];
      console.log(userDetails, 4608);
      // Safe parse diet feedback JSON if it exists
      let parsedFeedback = null;
      try {
        parsedFeedback =
          typeof userDetails?.diet_feedback_result === "string"
            ? JSON.parse(userDetails.diet_feedback_result)
            : userDetails?.diet_feedback_result || null;
      } catch (e) {
        parsedFeedback = null;
      }
      let rating = parsedFeedback?.[0]?.answer;
      data = mapUserData({
        details: userDetails,
        user: user_id,
        addExtraKeyTo: {
          user_details: {
            user_id,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          diet_feedback: {
            diet_name: userDetails?.diet_name || null,
            rating: rating,
            imf_concern: userDetails?.imf_concern || null,
            diet_id: userDetails?.diet_feedback_diet_id || null,
            session: userDetails?.diet_feedback_session || null,
            submitted_at: userDetails?.diet_feedback_created_at || null,
            feedback: parsedFeedback,
            assessmentId: userDetails?.assessmentId || null,
          },
        },
      });

      if (details[index].is_imf == "1") {
        imf_feedback.push(data);
      } else {
        diet_feedback.push(data);
      }
      return data;
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Data fetched successfully",
        data: {
          diet_feedback,
          imf_feedback,
        },
      }),
    );
  } catch (error) {
    console.error("Error in dietFeedbackReceivedData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const ackBirthdayData = async (req, res, next) => {
  try {
    const { user_id, mentor_id } = req.body;

    // Validate required fields
    if (!user_id && !mentor_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const UpdatedResult = await updateRecord(
      tables.userDetails,
      {
        birthday_ack: 1,
        birthday_ack_by: mentor_id,
        birthday_ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      {
        user_id: user_id,
      },
    );

    if (!UpdatedResult || UpdatedResult.affectedRows === 0) {
      return next(new ErrorHandler("hs record not found or not updated", 404));
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Birthday Acknowledge Successfully",
      }),
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
//getBirthdayUserIdsTodayAndTomorrow

//get follow up count
export const getFollowUpData = async (req, res, next) => {
  const { user_ids: ids, search, source_type:filter } = req.body;
  if (!ids.length > 0) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };

  try {

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        follow_up: true,
      },
      ...(search && searchObj),
    });

    const statusKeyMap = {
      Active: "active",
      Lead: "lead",
      Completed: "oc",
    };

    const filteredData = {
      active: [], 
      lead: [], 
      oc: []
    };

    console.log(ids.length, "IDS length");
     
    ids.forEach((user, index) => {
       if (index==1) console.log(details[index], 'users'); 
       const key = statusKeyMap[details[index].client_user_status];
       if (!key) return;
       if (!filteredData[key]) {
         filteredData[key] = [];
       }

       if (!filter) {
          filteredData[key].push(
             mapUserData({
               details: details[index],
               user,
               addExtraKeyTo: {
                 user_details: {
                   user_id: user,
                   whatsapp_text: "",
                 },
               },
               addFields: {
                 follow_up: true,
               },
             })
          );
       }
       else if(details[index]?.next_source && filter=='auto') {
          filteredData[key].push(
           mapUserData({
             details: details[index],
             user,
             addExtraKeyTo: {
               user_details: {
                 user_id: user,
                 whatsapp_text: "",
               },
             },
             addFields: {
               follow_up: true,
             },
           })
          );
       }
       else if (filter=='mentor' && !details[index]?.next_source) {
          filteredData[key].push(
           mapUserData({
             details: details[index],
             user,
             addExtraKeyTo: {
               user_details: {
                 user_id: user,
                 whatsapp_text: "",
               },
             },
             addFields: {
               follow_up: true,
             },
           })
         );
       }

     });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: filteredData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getFollowUpCounts = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();

    const yesterdayStart = moment().subtract(1, "days").startOf("day").toDate();
    const yesterdayEnd = moment().subtract(1, "days").endOf("day").toDate();

    const tomorrowStart = moment().add(1, "days").startOf("day").toDate();
    const tomorrowEnd = moment().add(1, "days").endOf("day").toDate();

    // Get all eligible user IDs for Daily FU
    const { results: userResults } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      conditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: admin_id,
        },
        {
          field: "ud.daily_fu",
          operator: "=",
          value: "1",
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
      ],
    });

    const allUserIds = userResults.map((u) => u.user_id.toString());

    // FU Sent Today
    const enquiriesToday = await clientEnquiry.find({
      user_id: { $in: allUserIds },
      createdAt: { $gte: todayStart, $lte: todayEnd },
      sender: "mentor",
      type: { $ne: "broadcast" },
    });

    // FU Sent Yesterday
    const enquiriesYesterday = await clientEnquiry.find({
      user_id: { $in: allUserIds },
      createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
      sender: "mentor",
      type: { $ne: "broadcast" },
    });

    // FU Scheduled for Tomorrow
    const enquiriesTomorrow = await clientEnquiry.find({
      user_id: { $in: allUserIds },
      createdAt: { $gte: tomorrowStart, $lte: tomorrowEnd },
      sender: "mentor",
      type: { $ne: "broadcast" },
    });

    const sentTodayIds = new Set(
      enquiriesToday.map((e) => e.user_id.toString()),
    );
    const sentYesterdayIds = new Set(
      enquiriesYesterday.map((e) => e.user_id.toString()),
    );
    const sentTomorrowIds = new Set(
      enquiriesTomorrow.map((e) => e.user_id.toString()),
    );

    const pendingToday = allUserIds.filter((id) => !sentTodayIds.has(id));
    const missedYesterday = allUserIds.filter(
      (id) => !sentYesterdayIds.has(id),
    );
    const scheduledTomorrow = allUserIds.filter((id) =>
      sentTomorrowIds.has(id),
    );

    const response = {
      statusCode: 200,
      message: "Daily FU counts fetched successfully",
      data: {
        pending_today: {
          count: pendingToday.length,
          user_ids: pendingToday,
        },
        missed_yesterday: {
          count: missedYesterday.length,
          user_ids: missedYesterday,
        },
        scheduled_tomorrow: {
          count: scheduledTomorrow.length,
          user_ids: scheduledTomorrow,
        },
      },
    };

    return res.status(200).json(new ApiResponse(response));
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Failed to fetch FU counts", 500));
  }
};

export const getSalesFollowUpStats = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id || isNaN(parseInt(admin_id))) {
      return next(
        new ErrorHandler("Admin ID is required and must be a number", 400),
      );
    }

    const results = await readRecordUnion([
      // 🔴 Missed follow-ups (before today)
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'sales_follow_ups_missed' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed", "Lead"],
          },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "lfl.follow_up_status", operator: "=", value: 0 },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "lfl.added_by", operator: "=", value: parseInt(admin_id) },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },

      // 🟡 Today’s follow-ups
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'sales_follow_ups_today' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "lfl.follow_up_status", operator: "=", value: 0 },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "lfl.added_by", operator: "=", value: parseInt(admin_id) },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },

      // 🟠 Tomorrow’s follow-ups
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'sales_follow_ups_tomorrow' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: "=",
            value: "CURRENT_DATE() + INTERVAL 1 DAY",
            raw: true,
          },
          { field: "lfl.follow_up_status", operator: "=", value: 0 },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "lfl.added_by", operator: "=", value: parseInt(admin_id) },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },

      // 🔵 Future follow-ups (after tomorrow)
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'sales_follow_ups_future' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: ">",
            value: "CURRENT_DATE() + INTERVAL 1 DAY",
            raw: true,
          },
          { field: "lfl.follow_up_status", operator: "=", value: 0 },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "lfl.added_by", operator: "=", value: parseInt(admin_id) },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },
    ]);

    // 🧾 Parse results into an object
    const data = {};
    results.forEach((row) => {
      data[row.type] = {
        count: parseInt(row.count || 0),
        user_ids: row.user_ids ? JSON.parse(row.user_ids) : [],
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Sales follow-up stats fetched successfully",
        data,
      }),
    );
  } catch (error) {
    console.error("Error in getSalesFollowUpStats:", error);
    return next(new ErrorHandler("Failed to fetch sales follow-up stats", 500));
  }
};
//get follow up count
const overDueMisses = async (req, res, next) => {
  try {
    const { mentor_id, user_type = "Active" } = req.query;
    let weight_overdue_fifth,
      weight_overdue_tenth,
      diet_overdue,
      not_started_od,
      call_missed,
      fu_missed,
      pitched_but_no_fu,
      update_lead_details,
      at_risk,
      break_over_today,
      onhold_od,
      assessment_od,
      icl_od;

    const common = await overdueAndMissesCommonData({ mentor_id, user_type });
    call_missed = common[0].count;
    fu_missed = common[1].count;
    pitched_but_no_fu = common[2].count;

    if (user_type === "Active") {
      const [data, atRiskCount] = await Promise.all([
        overdueAndMissesActiveFilterData({ mentor_id }),
        clientEnquiry
          .aggregate([
            {
              $match: {
                mentor_id: Number(mentor_id),
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
          ])
          .then(async (queries) => {
            const userIds = queries.map((query) => query._id);

            if (userIds.length === 0) return 0;

            const { results: activeUsers } = await readRecord({
              table: `${tables.userDetails} ud`,
              joins: [
                {
                  type: "LEFT",
                  table: `${tables.subOrderPrograms} sop`,
                  on: "ud.active_order_id = sop.sub_order_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.programsMaster} pm`,
                  on: "pm.program_id = sop.program_id",
                },
              ],
              conditions: [
                { field: "ud.sub_user_status", operator: "=", value: "Active" },
                {
                  field: "ud.mentor_assigned",
                  operator: "=",
                  value: mentor_id,
                },
                { field: "ud.user_id", operator: "IN", value: userIds },
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
            });
            return activeUsers.length;
          }),
      ]);

      weight_overdue_fifth = data[0].count;
      weight_overdue_tenth = data[1].count;
      diet_overdue = data[2].count;
      not_started_od = data[3].count;
      at_risk = atRiskCount;
      break_over_today = data[4].count;
      onhold_od = data[5].count;
      assessment_od = data[6].count;
      icl_od = data[7].count;
    }

    if (String(user_type).toLowerCase() === "lead") {
      const { results: data } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "COUNT(ud.user_id) as count",
          "'update_lead_details' as type",
        ],
        joins: [
          {
            type: "INNER",
            table: `${tables.consultationLogs} cl`,
            on: "cl.user_id = ud.user_id",
          },
        ],
        conditions: [
          {
            field: "cl.user_id",
            operator: "IS NOT",
            value: null,
            raw: true,
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
            raw: true,
          },
          {
            field: "ud.added_date",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            orConditions: [
              {
                field: "ud.birth_date",
                operator: "IS",
                value: null,
                raw: true,
              },
              {
                field: "ud.birth_date",
                operator: "=",
                value: 0,
                raw: true,
              },
              {
                field: "ud.gender",
                operator: "=",
                value: 0,
                raw: true,
              },
              {
                field: "ud.start_weight",
                operator: "=",
                value: 0,
                raw: true,
              },
              {
                field: "ud.height",
                operator: "IS",
                value: null,
                raw: true,
              },
            ],
          },
        ],
      });
      update_lead_details = data[0].count;
    }

    const ActiveResponse = {
      "5th_day_weight_od": weight_overdue_fifth,
      "10th_day_weight_od": weight_overdue_tenth,
      diet_overdue,
      not_started_overdue: not_started_od,
      call_missed: call_missed,
      fu_missed: fu_missed,
      pitched_but_no_fu: pitched_but_no_fu,
      at_risk,
      break_over_today,
      onhold_od,
      assessment_od,
      icl_od,
    };
    const OcResponse = {
      call_missed: call_missed,
      fu_missed: fu_missed,
      pitched_but_no_fu: pitched_but_no_fu,
    };
    const leadResponse = {
      call_missed: call_missed,
      fu_missed: fu_missed,
      update_lead_details: update_lead_details,
      pitched_but_no_fu: pitched_but_no_fu,
    };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Overdue And Misses fetched Successully",
      data:
        user_type === "Active"
          ? ActiveResponse
          : user_type === "OC"
            ? OcResponse
            : leadResponse,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const trackerAndFeedback = async (req, res, next) => {
  try {
    const { user_type, id } = req.query;
    if (!user_type || !id) {
      return next(new ErrorHandler("User Type and ID are required", 400));
    }
    const userTypesSchema = ["Active", "Lead", "OC"];
    if (!userTypesSchema.includes(user_type)) {
      return next(new ErrorHandler("Invalid User Type", 400));
    }
    let weightRecordConditions = [
      {
        field:
          user_type === "Lead"
            ? "cd.counsellor_assigned"
            : "cd.mentor_assigned",
        operator: "=",
        value: parseInt(id),
      },
      {
        field: "wr.weight_acknowledge",
        operator: "=",
        value: 0,
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
    ];
    let inchRecordConditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },

      {
        field: "ir.inch_acknowledge",
        operator: "=",
        value: 0,
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
    ];
    let photoRecordConditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },

      {
        field: "pr.photo_acknowledge",
        operator: "=",
        value: 0,
      },
      { field: "pr.days", operator: "=", value: 10 },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
    ];

    let milestoneRecordConditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: "JSON_LENGTH(mg.comment,'$.milestone_achieved')",
        operator: ">",
        value: 0,
      },
    ];
    let goalRecordConditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
        operator: ">",
        value: 0,
      },
    ];
    let hfRecordConditions = [
      ...(user_type === "OC"
        ? [
            {
              field: "hf2.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ]
        : []),
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
    ];
    console.log(user_type, 510);
    let ffRecordConditions = [
      ...(user_type === "OC"
        ? [
            {
              field: "ff2.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ]
        : []),
      {
        field: "cd.mentor_assigned",
        operator: "=",
        value: id ? parseInt(id) : null, // Ensure id is not undefined or null before parsing
      },
    ];
    const dietFeedbackConditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
      { field: "df.is_ack", operator: "=", value: 0 },
    ];
    if (user_type == "Lead") {
      weightRecordConditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      milestoneRecordConditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      hfRecordConditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      ffRecordConditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
    } else if (user_type == "OC") {
      weightRecordConditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
      milestoneRecordConditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
      hfRecordConditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
      ffRecordConditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
    } else if (user_type == "Active") {
      weightRecordConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      milestoneRecordConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      hfRecordConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      ffRecordConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      goalRecordConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
    }
    const { results: weightRecordsTodayStart } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${
            user_type === "Lead" ? "weight_records_lead" : tables.weightRecords
          } wr`,
          on: "cd.user_id = wr.user_id",
          type: "LEFT",
        },
      ],
      conditions: [
        ...weightRecordConditions,
        ...(user_type === "Active"
          ? [
              {
                field: "wr.days",
                operator: "=",
                value: 0,
              },
            ]
          : []),
      ],
    });

    const { results: weightRecordsTodayFifthDay } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${
            user_type === "Lead" ? "weight_records_lead" : tables.weightRecords
          } wr`,
          on: "cd.user_id = wr.user_id",
          type: "LEFT",
        },
      ],
      conditions: [
        ...weightRecordConditions,
        ...(user_type !== "Lead"
          ? [
              {
                field: "wr.days",
                operator: "=",
                value: 5,
              },
            ]
          : []),
      ],
    });
    const { results: weightRecordsTodayTenthDay } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${
            user_type === "Lead" ? "weight_records_lead" : tables.weightRecords
          } wr`,
          on: "cd.user_id = wr.user_id",
          type: "LEFT",
        },
      ],
      conditions: [
        ...weightRecordConditions,
        ...(user_type !== "Lead"
          ? [
              {
                field: "wr.days",
                operator: "=",
                value: 10,
              },
            ]
          : []),
      ],
    });

    // 2. Inch Records Today
    const { results: inchRecordsToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${tables.inchRecords} ir`,
          on: "cd.user_id = ir.user_id",
          type: "LEFT",
        },
      ],
      // groupBy: ["ir.user_id"],
      conditions: inchRecordConditions,
    });

    // 3. Photo Records Today
    const { results: photoRecordsToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${tables.photoRecords} pr`,
          on: "cd.user_id = pr.user_id",
          type: "LEFT",
        },
      ],
      // groupBy: ["pr.user_id"],
      conditions: photoRecordConditions,
    });

    // 4. My Goals Records
    const { results: milestoneRecordToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${tables.bnMyGoalsNew} mg`,
          on: "cd.active_order_id = mg.sub_order_id and cd.user_id = mg.user_id",
          type: "LEFT",
        },
      ],
      conditions: milestoneRecordConditions,
    });
    const { results: goalsRecordToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${tables.bnMyGoalsNew} mg`,
          on: "cd.active_order_id = mg.sub_order_id and cd.user_id = mg.user_id",
          type: "LEFT",
        },
      ],
      conditions: goalRecordConditions,
    });

    // 5. Halftime Feedback
    const { results: halftimeFeedback } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${tables.halfTimeFeedback} hf`,
          on:
            user_type === "Active"
              ? "cd.active_order_id = hf.sub_order_id"
              : "cd.user_id = hf.user_id",
          type: "INNER",
        },
        ...(user_type == "OC"
          ? [
              {
                type: "LEFT",
                table: `${tables.halfTimeFeedback} hf2`,
                on: "hf.user_id = hf2.user_id AND hf.id<hf2.id",
              },
            ]
          : []),
      ],
      // groupBy: ["cd.user_id"],
      conditions: hfRecordConditions,
    });
    console.log(halftimeFeedback, 718);
    // 6. Final Feedback
    const { results: finalFeedback } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      joins: [
        {
          table: `${tables.finalFeedback} ff`,
          on:
            user_type === "Active"
              ? "cd.active_order_id = ff.sub_order_id"
              : "cd.user_id = ff.user_id",
          type: "INNER",
        },
        ...(user_type == "OC"
          ? [
              {
                type: "LEFT",
                table: `${tables.finalFeedback} ff2`,
                on: "ff.user_id = ff2.user_id AND ff.id<ff2.id",
              },
            ]
          : []),
      ],
      conditions: ffRecordConditions,
    });
    console.log(finalFeedback, 747);
    const { results: hsRecords } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
      ],
      conditions: [
        { field: "hs2.id", operator: "IS", value: "NULL", raw: true },
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: "DATE(hs1.created) = CURDATE()",
          operator: "",
          value: "",
          raw: true,
        },
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop `,
          on: "cd.active_order_id = sop.sub_order_id",
          type: "LEFT",
        },
        {
          table: `${tables.healthScoreClient} hs1`,
          type: "LEFT",
          on: `sop.sub_order_id = hs1.sub_order_id`,
        },
        {
          table: `${tables.healthScoreClient} hs2`,
          type: "LEFT",
          on: ` (hs1.user_id = hs2.user_id AND hs1.id<hs2.id)`,
        },
      ],
    });
    const { results: lessLossRecords } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as count",
        'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
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
          table: `${tables.callUpdates} cu`,
          on: "cd.user_id = cu.user_id AND sop.sub_order_id = cu.sub_order_id AND cu.call_type = '31'",
        },
        {
          type: "LEFT",
          table: `${tables.userKeyInsight} uki`,
          on: "cd.user_id = uki.user_id and sop.sub_order_id = uki.sub_order_id and uki.source = 'less-loss'",
        },
      ],
      conditions: [
        {
          orConditions: [
            {
              field:
                "(sop.total_sessions = 3 AND sop.sent_sessions>= 2 AND  sop.start_program_weight - cd.latest_weight < 1.5)",
              operator: "",
              value: "",
              raw: true,
            },
            {
              field:
                "(sop.total_sessions = 6 AND sop.sent_sessions>= 3 AND sop.start_program_weight - cd.latest_weight < 3)",
              operator: "",
              value: "",
              raw: true,
            },
            {
              field:
                "(sop.total_sessions = 9 AND sop.sent_sessions>= 5 AND sop.start_program_weight - cd.latest_weight <3)",
              operator: "",
              value: "",
              raw: true,
            },
          ],
        },
        // { field: "uki.id", operator: "IS", value: "NULL", raw: true },
        // {
        //   orConditions: [
        //     { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        //     {
        //       field: "cu.call_status",
        //       operator: "IS",
        //       value: "NULL",
        //       raw: true,
        //     },
        //     { field: "cu.call_status", operator: "=", value: 0 },
        //   ],
        // },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(id),
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "dsl.end_session_weight",
          operator: "!=",
          value: 0,
        },
      ],
    });
    console.log(lessLossRecords, 972);
    const { results: dietFeedbackRecords } = await readRecord({
      selectFields: [
        " COUNT(DISTINCT cd.user_id) as count",
        `CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids`,
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.dietFeedback} df`,
          on: "cd.user_id = df.user_id",
        },
      ],
      conditions: dietFeedbackConditions,
    });
    console.log(halftimeFeedback[0].count, 1055);
    console.log(finalFeedback[0].count, 1056);
    console.log(dietFeedbackRecords[0].count, 1057);
    if (user_type === "Lead") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "data fetched for leads successfully",
        data: {
          weight: weightRecordsTodayStart[0].count ?? 0,
          milestone: milestoneRecordToday[0].count ?? 0,
          feedback: halftimeFeedback[0].count + finalFeedback[0].count ?? 0,
        },
      });
      return res.status(200).json([apiResponse]);
    } else if (user_type == "OC") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "data fetched for OCs successfully",
        data: {
          weight: weightRecordsTodayStart[0].count ?? 0,
          milestone: milestoneRecordToday[0].count ?? 0,
          feedback: halftimeFeedback[0].count + finalFeedback[0].count ?? 0,
        },
      });
      return res.status(200).json([apiResponse]);
    } else {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "data fetched for active users successfully",
        data: {
          start_weight: weightRecordsTodayStart[0].count ?? 0,
          "5th_day_weight": weightRecordsTodayFifthDay[0].count ?? 0,
          "10th_day_weight": weightRecordsTodayTenthDay[0].count ?? 0,
          milestone: milestoneRecordToday[0].count ?? 0,
          feedback:
            (halftimeFeedback?.[0]?.count ?? 0) +
            (finalFeedback?.[0]?.count ?? 0) +
            (dietFeedbackRecords?.[0]?.count ?? 0),
          inch: inchRecordsToday[0].count ?? 0,
          photo: photoRecordsToday[0].count ?? 0,
          goal: goalsRecordToday[0].count ?? 0,
          hs: hsRecords[0].count ?? 0,
          less_loss: lessLossRecords[0]?.count ?? 0,
        },
      });
      return res.status(200).json([apiResponse]);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesOpportunity = async (req, res, next) => {
  const { user_type, id } = req.query;

  // Validate input
  if (!user_type || !id) {
    return next(new ErrorHandler("User Type and ID are required", 400));
  }

  const userTypesSchema = ["Active", "Lead", "OC"];
  if (!userTypesSchema.includes(user_type)) {
    return next(new ErrorHandler("Invalid User Type", 400));
  }

  try {
    // Define condition arrays
    let rateSharedConditionToday = [
      { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
      {
        field: "sp.suggested_amount",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "sp.added_date",
        operator: ">=",
        value: "CURRENT_DATE()",
        raw: true,
      },
    ];
    let rateSharedConditionMonth = [
      { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
      {
        field: "sp.suggested_amount",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "MONTH(sp.added_date)",
        operator: "=",
        value: " MONTH(CURRENT_DATE()) ",
        raw: true,
      },
      {
        field: "YEAR(sp.added_date)",
        operator: "=",
        value: "YEAR(CURRENT_DATE()) ",
        raw: true,
      },
    ];
    let paymentLinkSharedConditionToday = [
      { field: "sp.suggested_by", operator: "=", value: id },
      {
        field: "sp.payment_link_id",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "sp.added_date",
        operator: ">=",
        value: "CURRENT_DATE()",
        raw: true,
      },
    ];
    let paymentLinkSharedConditionMonth = [
      { field: "sp.suggested_by", operator: "=", value: id },
      {
        field: "sp.payment_link_id",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "MONTH(sp.added_date)",
        operator: "=",
        value: " MONTH(CURRENT_DATE()) ",
        raw: true,
      },
      {
        field: "YEAR(sp.added_date)",
        operator: "=",
        value: "YEAR(CURRENT_DATE()) ",
        raw: true,
      },
    ];
    let clientWithSeventyConditions = [
      { field: "cd.latest_weight", operator: ">=", value: 70 },
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
    ];

    let stageWiseConditionsTodays = [
      { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.stage", operator: "IN", value: "(3,4)", raw: true },
      {
        field: "DATE(cd.added_date)",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    let stageWiseConditionsMonth = [
      { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.stage", operator: "IN", value: "(3,4)", raw: true },
      {
        field: "MONTH(cd.added_date)",
        operator: "=",
        value: " MONTH(CURDATE()) ",
        raw: true,
      },
      {
        field: "YEAR(cd.added_date)",
        operator: "=",
        value: "YEAR(CURDATE()) ",
        raw: true,
      },
    ];

    let referralsConditionsToday = [
      { field: "cd.current_lead_source", operator: "=", value: 5 },
      { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
      {
        field: "cd.added_date",
        operator: ">=",
        value: "CURRENT_DATE()",
        raw: true,
      },
    ];
    let referralsConditionsMonth = [
      { field: "cd.current_lead_source", operator: "=", value: 5 },
      { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
      {
        field: "MONTH(cd.added_date)",
        operator: "=",
        value: " MONTH(CURRENT_DATE()) ",
        raw: true,
      },
      {
        field: "YEAR(cd.added_date)",
        operator: "=",
        value: "YEAR(CURRENT_DATE()) ",
        raw: true,
      },
    ];
    // Modify conditions based on user_type
    if (user_type === "Lead") {
      rateSharedConditionToday.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      rateSharedConditionMonth.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      paymentLinkSharedConditionToday.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      paymentLinkSharedConditionMonth.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      referralsConditionsToday.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      referralsConditionsMonth.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      stageWiseConditionsTodays.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      stageWiseConditionsMonth.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
      clientWithSeventyConditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
    } else if (user_type === "OC") {
      const ocStatusValues = ["Completed", "Dropout", "Maintenance", "Fs"];
      rateSharedConditionToday.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      rateSharedConditionMonth.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      paymentLinkSharedConditionToday.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      paymentLinkSharedConditionMonth.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });

      referralsConditionsToday.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      referralsConditionsMonth.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      stageWiseConditionsTodays.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      stageWiseConditionsMonth.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
      clientWithSeventyConditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ocStatusValues,
      });
    } else if (user_type === "Active") {
      rateSharedConditionToday.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      rateSharedConditionMonth.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      paymentLinkSharedConditionToday.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      paymentLinkSharedConditionMonth.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      referralsConditionsToday.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      referralsConditionsMonth.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      clientWithSeventyConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
    }

    const rateSharedData = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'today' as period",
        ],
        condition: rateSharedConditionToday,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'this _month' as period",
        ],
        condition: rateSharedConditionMonth,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
    ]);
    console.log(rateSharedData, 1382);
    const paymentLinkSharedData = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'today' as period",
        ],
        condition: paymentLinkSharedConditionToday,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'this _month' as period",
        ],
        condition: paymentLinkSharedConditionMonth,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
    ]);
    console.log(paymentLinkSharedData, 1447);
    const stageWiseData = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'today' as period",
        ],
        condition: stageWiseConditionsTodays,
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'this month' as period",
        ],
        condition: stageWiseConditionsMonth,
      },
    ]);

    console.log(stageWiseData, 1458);
    const referralData = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'today' as period",
        ],
        condition: referralsConditionsToday,
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'this month' as period",
        ],
        condition: referralsConditionsMonth,
      },
    ]);
    console.log(referralData, 1509);

    const { results: clientWithSeventyWeight } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["COUNT(DISTINCT cd.user_id) as count"],
      conditions: clientWithSeventyConditions,
    });
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    // Build the user status condition based on the user_type
    let userStatusCondition;
    if (user_type === "Active") {
      userStatusCondition = "cd.user_status = 'Active'";
    } else if (user_type === "OC") {
      userStatusCondition = "cd.user_status = 'Completed'";
    } else if (user_type === "Lead") {
      userStatusCondition = "cd.user_type = '0'";
    } else {
      throw new Error("Invalid user type");
    }
    const goodLossDataMonth = await db
      .with("RankedRecords", (qb) => {
        qb.select(
          "cd.user_id",
          "cd.latest_weight",
          "sop.start_program_weight",
          db.raw(
            "ROUND(cd.latest_weight - sop.start_program_weight, 2) AS weight_difference",
          ),
          db.raw(
            "ROW_NUMBER() OVER (PARTITION BY sop.sub_order_id ORDER BY wr.posted_date DESC) AS rn",
          ),
          "cd.mentor_assigned",
        )
          .from("users_details as cd")
          .leftJoin(
            "sub_orders_programs as sop",
            "cd.active_order_id",
            "sop.sub_order_id",
          )
          .leftJoin(
            "weight_records as wr",
            "sop.sub_order_id",
            "wr.sub_order_id",
          )
          .whereRaw(userStatusCondition) // Assuming userStatusCondition is defined
          .andWhereRaw("(cd.latest_weight - sop.start_program_weight) < -4.99")
          .andWhereRaw("DATE(wr.posted_date) BETWEEN ? AND ?", [
            startOfMonth, // 'startOfMonth' is assumed to be a Moment date
            today, // 'today' is assumed to be a Moment date
          ])
          .andWhere("cd.mentor_assigned", parseInt(id)); // Assuming 'id' is provided as a parameter
      })
      .select(db.raw("COUNT(*) AS count"))
      .from("RankedRecords")
      .where("rn", 1);

    console.log(clientWithSeventyWeight, 1520);
    const goodLossDataToday = await db
      .with("RankedRecords", (qb) => {
        qb.select(
          "cd.user_id",
          "cd.latest_weight",
          "sop.start_program_weight",
          db.raw(
            "ROUND(cd.latest_weight - sop.start_program_weight, 2) AS weight_difference",
          ),
          db.raw(
            "ROW_NUMBER() OVER (PARTITION BY sop.sub_order_id ORDER BY wr.posted_date DESC) AS rn",
          ),
          "cd.mentor_assigned",
        )
          .from("users_details as cd")
          .leftJoin(
            "sub_orders_programs as sop",
            "cd.active_order_id",
            "sop.sub_order_id",
          )
          .leftJoin(
            "weight_records as wr",
            "sop.sub_order_id",
            "wr.sub_order_id",
          )
          .whereRaw(userStatusCondition) // Assuming userStatusCondition is defined
          .andWhereRaw("(cd.latest_weight - sop.start_program_weight) < -4.99")
          .andWhereRaw("DATE(wr.posted_date) = CURDATE()")
          .andWhere("cd.mentor_assigned", parseInt(id)); // Assuming 'id' is provided as a parameter
      })
      .select(db.raw("COUNT(*) AS count"))
      .from("RankedRecords")
      .where("rn", 1);

    console.log(goodLossDataMonth, goodLossDataToday);
    let apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched for leads successfully",
      data: {
        rate_shared: {
          today: rateSharedData[0].count,
          month: rateSharedData[1].count,
        },
        payment_details_shared: {
          today: paymentLinkSharedData[0].count,
          month: paymentLinkSharedData[1].count,
        },
        stage: {
          today: stageWiseData[0].count,
          month: stageWiseData[1].count,
        },
        referral: {
          today: referralData[0].count,
          month: referralData[1].count,
        },
        ...(user_type !== "Lead" && {
          "Clients_(70+Kg)": clientWithSeventyWeight[0].count,
          good_weight_loss: {
            today: goodLossDataToday[0].count,
            month: goodLossDataMonth[0].count,
          },
        }),
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.error("Error in salesOpportunity:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const newAssignedUserData = async (req, res, next) => {
  try {
    const { mentor_id, order_type, page, limit, search } = req.body;
    const stack_type = req.body.stack_type ? String(req.body.stack_type) : null;
    const conditions = [
      {
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      },
      {
        field: "ud.user_status",
        operator: "=",
        value: `Active`,
      },
      {
        field: "sop.sent_sessions",
        operator: "=",
        value: 0,
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
    ];

    if (stack_type) {
      conditions.push({
        field: "pm.program_category",
        operator: "=",
        value: stack_type,
      });
    }

    if (!order_type) {
      conditions.push({
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
      });
    }
    if (order_type) {
      conditions.push({
        field: "sop.order_type",
        operator: "=",
        value: order_type,
      });
    }

    const { data, total_page } = await getFormattedUserData({
      base_table: `${tables.userDetails} ud`,
      page,
      limit,
      search,
      extraSelectFields: [
        "sop.start_date as current_program_start_date",
        "sop.start_date_added_by as current_program_start_date_set_by",
        "od2.order_date as purchase_date",
        "pm.program_category",
        "ud.device",
      ],
      extraConditions: conditions,
      extraObjects: (i) => {
        return {
          stack_type: i.program_category,
          purchase_details: {
            program_start_date: `${moment(i.current_program_start_date).format(
              "DD-MM-YYYY",
            )}`,
            program_start_date_set_by:
              Number(i.current_program_start_date_set_by) === 0
                ? "Default"
                : Number(i.current_program_start_date_set_by) === 1
                  ? "By Mentor"
                  : "By Client",
            purchase_date: `${moment(i.purchase_date).format("DD-MM-YYYY")}`,
            is_app_downloaded: !i.device || i.device === "null" ? false : true,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
      showWeightDetails: false,
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "New Assigned User Data",
      data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
      hide_columns: ["weight_details"],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in fetching new assigned user data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const notStarted = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, filter_data, search } = req.body;
    const conditions = [
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "notstarted",
      },
      {
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      },

      {
        field: "sop.start_date_added_by",
        operator: "<>",
        value: `0`,
        raw: true,
      },
    ];
    if (filter_data === "tomorrow") {
      conditions.push({
        field: "sop.start_date",
        operator: "=",
        value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
      });
    } else if (filter_data === "future") {
      conditions.push({
        field: "sop.start_date",
        operator: ">",
        value: `${moment().add(1, "day").format("YYYY-MM-DD")}`,
      });
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: [
        "sop.start_date as current_program_start_date",
        "sop.start_date_added_by as current_program_start_date_set_by",
        "od2.order_date as purchase_date",
      ],
      extraConditions: conditions,
      extraObjects: (i) => {
        return {
          stack_type: i.program_category,
          purchase_details: {
            program_start_date: `${moment(i.current_program_start_date).format(
              "DD-MM-YYYY",
            )}`,
            program_start_date_set_by:
              Number(i.current_program_start_date_set_by) === 0
                ? "Default"
                : Number(i.current_program_start_date_set_by) === 1
                  ? "By Mentor"
                  : "By Client",
            purchase_date: `${moment(i.purchase_date).format("DD-MM-YYYY")}`,
            is_app_downloaded: !i.device || i.device === "null" ? false : true,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "New Assigned User Data",
      data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
      hide_columns: ["weight_details"],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in fetching new assigned user data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const NAFICLReceivedUserData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      page,
      limit,
      search,
      filter_data,
      received_within_hours,
    } = req.body;

    let assessmentCondition = "(ass.completion_status = 2)";
    let iclCondition = "(iclr.completion_status = 2)";

    // Time filter condition
    if (
      received_within_hours &&
      [6, 12, 18, 24, 48].includes(received_within_hours)
    ) {
      // const timeFilter = `NOW() - INTERVAL ${received_within_hours} HOUR`;
      const timeFilter = `NOW() - INTERVAL 1440 HOUR`;

      assessmentCondition += ` AND ass.added_date >= ${timeFilter}`;
      iclCondition += ` AND iclr.added_date >= ${timeFilter}`;
    } else {
      // Default filter for data received today
      assessmentCondition += " AND DATE(ass.added_date) = CURDATE()";
      iclCondition += " AND DATE(iclr.added_date) = CURDATE()";
    }

    let filterCondition = "";
    if (filter_data === "assessment") {
      filterCondition = assessmentCondition;
    } else if (filter_data === "icl") {
      filterCondition = iclCondition;
    } else {
      filterCondition = `(${assessmentCondition} OR ${iclCondition})`;
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.ingredientChecklistRecords} iclr`,
          on: "iclr.user_id = ud.user_id",
        },
      ],
      extraConditions: [
        {
          field: filterCondition,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: "0",
        },
      ],
      extraSelectFields: [
        "ass.added_date AS assessment_received_date",
        "iclr.added_date AS icl_received_date",
      ],
      extraObjects: (i) => {
        return {
          assessment_details: {
            received_at: i.assessment_received_date
              ? `${moment(i.assessment_received_date).format(
                  "DD-MM-YYYY",
                )} (${moment(i.assessment_received_date).fromNow()})`
              : "Not Received",
          },
          icl_details: {
            received_at: i.icl_received_date
              ? `${moment(i.icl_received_date).format("DD-MM-YYYY")} (${moment(
                  i.icl_received_date,
                ).fromNow()})`
              : "Not Received",
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "NAF/ICL Received User Data fetched Successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
      hide_columns: ["weight_details"],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in NAFICLReceivedUserData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const CallsBookedUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, user_type } = req.body;
    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "cu.slot_id = slot.id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} cad`,
          on: "cad.admin_user_id = cu.added_by",
        },
      ],
      extraConditions: [
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
        {
          field: "cu.added_by",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "ud.user_status",
          operator: "=",
          value:
            user_type === "Active"
              ? "Active"
              : user_type === "OC"
                ? "Completed"
                : "Lead",
        },
        {
          field: "cu.call_status",
          operator: "=",
          value: 0,
        },
        {
          field: "cu.call_status",
          operator: "<>",
          value: 10,
        },
      ],
      extraSelectFields: [
        "cu.call_type",
        "cu.call_id",
        "cu.schedule_date",
        "slot.appointment_slots",
        "CONCAT(cad.first_name,' ',cad.last_name) as call_added_by",
      ],
      extraObjects: (i) => {
        return {
          call_details: {
            call_id: i.call_id,
            call_type_id: i.call_type,
            call_type: mapCallType(i.call_type),
            time_slot: i.appointment_slots,
            schedule_date: moment(i.schedule_date).fromNow(),
            call_status:
              i.call_status === 0
                ? "Pending"
                : i.call_status === 1
                  ? "Completed"
                  : i.call_status === 2
                    ? "Cancelled"
                    : i.call_status === 3
                      ? "Rescheduled"
                      : i.call_status === 4
                        ? "Unanswered"
                        : null,
            whatsapp_text: `Hi ${i.client_name}, Your call with  ${
              i.call_added_by
            } (myself) is scheduled for ${moment(i.schedule_date).format(
              "DD-MMM-YYYY",
            )} IST Today. I will call you on your registered mobile number. Looking forward to connecting with you.`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Call Booked User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "call_type_id",
        "whatsapp_text",
        "call_id",
        "suggested_program_id",
        "suggested_program_session_id",
        "client_id",
        "client_active_order_id",
      ],
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const FuUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, user_type } = req.body;
    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} fu`,
          on: "fu.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "fu.slot_id = slot.id and fu.type IN (0, '0)",
        },
        {
          type: "LEFT",
          table: `${tables.whatsappAppSlots} wap_slot`,
          on: "fu.slot_id = wap_slot.id and fu.type IN (1,2, '1','2')",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} aad`,
          on: "aad.admin_user_id = fu.added_by",
        },
      ],
      extraConditions: [
        {
          field: "fu.follow_up_date",
          operator: "=",
          value: moment().format("YYYY-MM-DD"),
        },
        {
          field: "fu.follow_up_status",
          operator: "=",
          value: "0",
          raw: true,
        },
        {
          field: "fu.assigned_to",
          operator: "=",
          value: parseInt(mentor_id),
        },
        ...(user_type === "Active"
          ? [
              {
                field: "ud.user_status",
                operator: "=",
                value: "Active",
              },
            ]
          : user_type === "Lead"
            ? [
                {
                  field: "ud.user_type",
                  operator: "=",
                  value: "0",
                },
              ]
            : []),
      ],
      extraSelectFields: [
        "fu.follow_up_id",
        "fu.follow_up_date",
        "(CASE WHEN fu.type IN (0,'0') THEN slot.appointment_slots WHEN fu.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END) as follow_up_time",
        "fu.follow_up_note",
        "fu.type",
        "fu.source",
        "fu.campaign",
        "CONCAT(aad.first_name,' ',aad.last_name) as action_assigned_by",
      ],
      extraObjects: (i) => {
        return {
          follow_up_details: {
            follow_up_id: i.follow_up_id,
            follow_up_date: i?.follow_up_date
              ? `${moment(i.follow_up_date).format("DD-MM-YYYY")}`
              : null,
            follow_type:
              Number(i?.type) === 0
                ? "Call"
                : Number(i?.type) === 1
                  ? "Whatsapp"
                  : "App",
            follow_up_type_enum: i.type,
            source: i.source,
            campaign: i.campaign,
            follow_up_time: i?.follow_up_time || null,

            follow_up_note: i?.follow_up_note || null,
            assigned_by: i?.action_assigned_by || null,
            next_fu: "",
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Follow-up User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "follow_up_type_enum",
        "follow_up_id",
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const spinToWinDataList = async (req, res, next) => {
  try {
    const { mentor_id, search } = req.query;

    if (!mentor_id) {
      return next(new ErrorHandler("Invalid request", 400));
    }

    // Step 1: Get users assigned to the mentor (admin)
    const { results: activeUsers } = await readRecord({
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.prizeDetails} pd`,
          on: "ud.user_id = pd.user_id",
        },
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Active", "Completed"],
        },
        { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
      ],
    });

    const ids = activeUsers.map((user) => user.user_id);

    if (!ids.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No users found",
          data: [],
        }),
      );
    }

    // Step 2: Optional search
    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    // Step 3: Fetch user detail data
    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      ...(search ? searchObj : {}),
    });

    // Step 4: Format and group users
    const active = [];
    const oc = [];
    const all = [];

    for (let i = 0; i < details.length; i++) {
      const userDetails = details[i];
      const userId = userDetails?.client_user_id || ids[i];

      const prizeRow = activeUsers.find((u) => u.user_id === userId);
      const prizeEarned = prizeRow?.prize || null;
      const prizeComment = prizeRow?.comment || null;
      const prizeDate = prizeRow?.added_date
        ? moment(prizeRow.added_date).format("DD-MM-YYYY")
        : null;

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
          },
        },
        extraMappings: {
          prize_details: {
            prize_earned: prizeEarned,
            prize_earned_date: prizeDate,
            prize_earned_comment: prizeComment,
          },
        },
      });

      all.push(mapped);
      if (prizeRow?.user_status === "Active") {
        active.push(mapped);
      } else if (prizeRow?.user_status === "Completed") {
        oc.push(mapped);
      }
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Spin to Win user data fetched successfully",
      data: {
        active,
        oc,
        all,
      },
      count: {
        active: active.length,
        oc: oc.length,
        total: all.length,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("spinToWinDataList error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const spinToWinLeadDataList = async (req, res, next) => {
  try {
    const { mentor_id, search } = req.query;

    if (!mentor_id) {
      return next(new ErrorHandler("Invalid request", 400));
    }

    const { results: activeUsers } = await readRecord({
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.prizeDetails} pd`,
          on: "ud.user_id = pd.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "IN", value: ["Lead"] },
        { field: "ud.counsellor_assigned", operator: "=", value: mentor_id },
      ],
    });

    const ids = activeUsers.map((user) => user.user_id);

    if (!ids.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No users found",
          data: {},
        }),
      );
    }

    const searchObj = {
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    };

    const details = await fetchUsersDetailsNew({
      ids,
      selectData: {
        active_program: true,
        suggested_program: true,
      },
      ...(search ? searchObj : {}),
    });

    const groupedData = {
      "To Engage": [],
      HOT: [],
      WARM: [],
      COLD: [],
    };

    const salesStatusMap = {
      0: "To Engage",
      2: "HOT",
      3: "WARM",
      4: "COLD",
    };

    for (let i = 0; i < details.length; i++) {
      const userDetails = details[i];
      const userId = userDetails?.client_user_id || ids[i];

      const prizeRow = activeUsers.find((u) => u.user_id === userId);
      const prizeEarned = prizeRow?.prize || null;
      const prizeComment = prizeRow?.comment || null;
      const prizeDate = prizeRow?.added_date
        ? moment(prizeRow.added_date).format("DD-MM-YYYY")
        : null;

      const salesStatusLabel =
        salesStatusMap[prizeRow?.sales_status] || "To Engage";

      const mapped = mapUserData({
        details: userDetails,
        user: userId,
        addExtraKeyTo: {
          user_details: {
            user_id: userId,
            whatsapp_text: "",
            sales_status_label: salesStatusLabel,
          },
        },

        extraMappings: {
          prize_details: {
            prize: prizeEarned,
            added_date: prizeDate,
            comment: prizeComment,
          },
        },
      });

      groupedData[salesStatusLabel].push(mapped);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Spin to Win user data fetched successfully",
      data: groupedData,
      count: {
        "To Engage": groupedData["To Engage"].length,
        HOT: groupedData.HOT.length,
        WARM: groupedData.WARM.length,
        COLD: groupedData.COLD.length,
        total: Object.values(groupedData).reduce(
          (sum, list) => sum + list.length,
          0,
        ),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("spinToWinLeadDataList error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updatePrizeComment = async (req, res, next) => {
  try {
    const { user_id, comment } = req.body;

    if (!user_id || typeof comment !== "string") {
      return next(new ErrorHandler("user_id and comment are required", 400));
    }

    const { affectedRows } = await updateRecord(
      tables.prizeDetails,
      {
        comment: comment,
      },
      {
        user_id: user_id,
      },
    );

    if (affectedRows === 0) {
      return next(new ErrorHandler("No record found to update", 404));
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Comment updated successfully",
        data: { user_id, comment },
      }),
    );
  } catch (error) {
    console.error("Error in updatePrizeComment:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const assessmentOdUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, status } = req.body;

    const conditions = [
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
        value: mentor_id,
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
      {
        field: "sop.sent_sessions",
        operator: "=",
        value: 0,
      },
    ];
    if (status && status === "not_filled") {
      conditions.push({
        field: "(ass.completion_status = 0 OR ass.user_id IS NULL)",
        operator: "",
        value: "",
        raw: true,
      });
    } else if (status && status === "partial_filled") {
      conditions.push({
        field: "(ass.completion_status = 1 AND ass.user_id IS NOT NULL)",
        operator: "",
        value: "",
        raw: true,
      });
    } else {
      conditions.push({
        field:
          "((ass.completion_status = 0 OR ass.user_id IS NULL) OR (ass.completion_status = 1 AND ass.user_id IS NOT NULL))",
        operator: "",
        value: "",
        raw: true,
      });
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ud.user_id = ass.user_id AND ass.active_order_id = ud.active_order_id",
        },
      ],
      extraConditions: conditions,

      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Assessment Od User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const iclOdUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, status } = req.body;

    const conditions = [
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
        value: mentor_id,
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
      {
        field: "sop.sent_sessions",
        operator: "=",
        value: 0,
      },
    ];
    if (status && status === "not_filled") {
      conditions.push({
        field: "(iclr.completion_status = 0 OR iclr.user_id IS NULL)",
        operator: "",
        value: "",
        raw: true,
      });
    } else if (status && status === "partial_filled") {
      conditions.push({
        field: "(iclr.completion_status = 1 AND iclr.user_id IS NOT NULL)",
        operator: "",
        value: "",
        raw: true,
      });
    } else {
      conditions.push({
        field:
          "((iclr.completion_status = 0 OR iclr.user_id IS NULL) OR (iclr.completion_status = 1 AND iclr.user_id IS NOT NULL))",
        operator: "",
        value: "",
        raw: true,
      });
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.ingredientChecklistRecords} iclr`,
          on: "ud.user_id = iclr.user_id AND iclr.active_order_id = ud.active_order_id",
        },
      ],
      extraConditions: conditions,

      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Assessment Od User Data fetched Successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const actionAssignedUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, user_type } = req.body;
    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadActionAssignedLog} laal`,
          on: "laal.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ac_ad`,
          on: "ac_ad.admin_user_id = laal.action_assigned_by",
        },
      ],
      extraConditions: [
        {
          field: "DATE(laal.action_assign_date)",
          operator: "=",
          value: moment().format("YYYY-MM-DD"),
        },
        {
          field: "laal.action_assigned_to",
          operator: "=",
          value: Number(mentor_id),
        },
      ],
      extraSelectFields: [
        "laal.user_id",
        "laal.action_assign_date",
        "laal.action_key_insight",
        "CONCAT(ac_ad.first_name,' ',ac_ad.last_name) as action_assigned_by_name",
      ],
      extraObjects: (i) => {
        return {
          action_assigned_details: {
            action_assign_date: `${moment(i.action_assign_date).format(
              "Do MMM YYYY",
            )}  (${moment(i.action_assign_date).fromNow()})`,
            action_key_insight: i.action_key_insight,
            assigned_by: i.action_assigned_by_name,
          },
        };
      },

      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Action Assigned User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_id",
        "client_active_order_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const OCLUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.leadSourceLog} lsl`,
          on: `ud.user_id = lsl.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: `ls.source_id = lsl.source_id`,
        },
      ],
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "lsl.added_date",
          operator: "BETWEEN",
          value: [
            `${moment().format("YYYY-MM-DD")}`,
            `${moment().format("YYYY-MM-DD")}`,
          ],
        },
      ],
      extraSelectFields: [
        "ls.source_group",
        "ls.source_name",
        "lsl.added_date as returning_date",
      ],
      extraObjects: (i) => {
        return {
          source_details: {
            source_group: getSourceNameLabel({
              source_group: i.source_group,
            }),
            source_name: i.source_name,
            date: `${moment(i.returning_date).format("DD-MM-YYYY")} ${moment(
              i.returning_date,
            ).fromNow()}`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "OCL User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
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

const leadsToCaptureUserData = async (req, res, next) => {
  try {
    const { page, limit, search } = req.body;

    const { data, total_page } = await getFormattedLeadData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadSourceLog} lsl`,
          on: `ud.user_id = lsl.user_id`,
        },
      ],
      extraConditions: [
        {
          field: "ud.counsellor_assigned",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "ud.added_date",
          operator: "BETWEEN",
          value: [
            moment()
              .subtract(7, "days")
              .startOf("day")
              .format("YYYY-MM-DD HH:mm:ss"),
            moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"),
          ],
        },
      ],
      extraSelectFields: ["lsl.added_date", "lsl.source_log"],
      extraObjects: (i) => {
        const source_log = i.source_log ? JSON.parse(i.source_log)[0] : null;
        return {
          source_details: { ...source_log },
        };
      },
      extraGroupBy: ["ud.user_id"],
      extraOrderBy: ["ud.added_date DESC"],
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Leads To Capture User Data fetched successfully",
        data: data,
        totalCount: total_page,
        meta_data: [
          "client_id",
          "client_active_order_id",
          "suggested_program_id",
          "suggested_program_session_id",
        ],
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadsAssignedUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedLeadData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: `ud.user_id = lal.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} old_counsellor`,
          on: "lal.assigned_by = old_counsellor.admin_user_id",
        },
      ],
      extraConditions: [
        {
          field: "lal.counsellor_id",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "lal.assign_date",
          operator: ">=",
          value: moment().startOf("month").format("YYYY-MM-DD"),
        },
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        },
      ],
      extraSelectFields: [
        "lal.assign_date",
        "CONCAT(old_counsellor.first_name, ' ', old_counsellor.last_name) old_counsellor",
      ],
      extraOrderBy: ["lal.assign_date DESC"],
      extraObjects: (i) => {
        return {
          assign_details: {
            old_counsellor: i.old_counsellor || "N/A",
            assign_date: i.assign_date
              ? `${moment(i.assign_date).format("DD-MM-YYYY")} ${moment(
                  i.assign_date,
                ).fromNow()}`
              : "N/A",
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    // Send response
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Leads Assigned User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadsEngagementTodayUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedLeadData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadEngagementLogs} lel`,
          on: `ud.user_id = lel.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.slots} les`,
          on: "lel.slot_id = les.id",
        },
      ],
      extraConditions: [
        {
          field: "lel.engagement_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "lel.status", operator: "=", value: 0 },
        { field: "lel.added_by", operator: "=", value: parseInt(mentor_id) },
        { field: "ud.user_type", operator: "=", value: "0" },
      ],
      extraSelectFields: [
        "lel.engagement_note",
        "lel.type",
        "lel.id as engagement_id",
        "les.appointment_slots as engagement_time",
      ],
      extraOrderBy: ["lel.slot_id"],
      extraObjects: (item) => {
        let type = "N/A";
        switch (Number(item.type)) {
          case 0:
            type = "Call";
            break;
          case 1:
            type = "Whatsapp";
            break;
          case 2:
            type = "App";
            break;
          default:
            type = "N/A";
            break;
        }
        return {
          engagement_details: {
            engagement_id: item.engagement_id,
            engagement_note: item.engagement_note || "N/A",
            type,
            engagement_time: item.engagement_time,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    // Send response
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Leads Assigned User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const weightOverdueUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, day, filter_data } = req.body;

    if (!mentor_id) {
      return res.status(400).json({
        statusCode: 400,
        message: "Mentor ID is required",
      });
    }

    if (day && ![5, 10].includes(Number(day))) {
      return res.status(400).json({
        statusCode: 400,
        message: "Day must be 5 or 10",
      });
    }

    const conditions = [
      { field: "ud.sub_user_status", operator: "=", value: "Active" },
      { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
    ];

    const daysSinceDietStarted = "DATEDIFF(CURDATE(), dsl.diet_start_date)";

    if (day && !filter_data) {
      if (day == 5) {
        conditions.push({
          orConditions: [
            {
              field: `${daysSinceDietStarted} >= 6 AND ${daysSinceDietStarted} <= 8 AND dsl.mid_session_weight = 0`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        });
      } else if (day == 10) {
        conditions.push({
          field: `${daysSinceDietStarted} > 10 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        });
      }
    } else if (!day && filter_data) {
      if (filter_data === "today") {
        conditions.push({
          orConditions: [
            {
              field: `${daysSinceDietStarted} = 6 AND dsl.mid_session_weight = 0`,
              operator: "",
              value: "",
              raw: true,
            },
            {
              field: `${daysSinceDietStarted} = 11 AND dsl.end_session_weight = 0`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        });
      } else if (filter_data === "older") {
        conditions.push({
          orConditions: [
            {
              field: `${daysSinceDietStarted} > 6 AND ${daysSinceDietStarted} <= 8 AND dsl.mid_session_weight = 0`,
              operator: "",
              value: "",
              raw: true,
            },
            {
              field: `${daysSinceDietStarted} > 10 AND dsl.end_session_weight = 0`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        });
      }
    } else if (day && filter_data) {
      if (filter_data === "today") {
        conditions.push({
          field:
            day == 5
              ? `${daysSinceDietStarted} = 6 AND dsl.mid_session_weight = 0`
              : `${daysSinceDietStarted} = 11 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        });
      } else if (filter_data === "older") {
        conditions.push({
          field:
            day == 5
              ? `${daysSinceDietStarted} > 6 AND ${daysSinceDietStarted} <= 8 AND dsl.mid_session_weight = 0`
              : `${daysSinceDietStarted} > 11 AND dsl.end_session_weight = 0`,
          operator: "",
          value: "",
          raw: true,
        });
      }
    } else {
      conditions.push({
        orConditions: [
          {
            field: `${daysSinceDietStarted} >= 6 AND ${daysSinceDietStarted} <= 8 AND dsl.mid_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `${daysSinceDietStarted} > 11 AND dsl.end_session_weight = 0`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
        },
      ],
      extraConditions: conditions,
      extraSelectFields: [
        "dsl.diet_start_date",
        "ABS(DATEDIFF(CURDATE(), dsl.diet_start_date)) as days_overdue",
        "DATEDIFF(CURDATE(), dsl.diet_start_date) - 5 AS mid_overdue_days",
        "DATEDIFF(CURDATE(), dsl.diet_start_date) - 10 AS end_overdue_days",
        "dsl.mid_session_weight",
        "dsl.end_session_weight",
      ],
      extraObjects: (item) => {
        const days = Number(item.days_overdue);
        const midOverdue = Number(item.mid_overdue_days);
        const endOverdue = Number(item.end_overdue_days);

        let weightOverdueLabel = null;
        let daysOverdueAfter = null;

        if (days >= 6 && days <= 10 && Number(item.mid_session_weight) === 0) {
          weightOverdueLabel = "Mid Session Weight Overdue";
          daysOverdueAfter =
            midOverdue > 0 ? `${midOverdue} days after expected date` : null;
        } else if (days > 10 && Number(item.end_session_weight) === 0) {
          weightOverdueLabel = "End Session Weight Overdue";
          daysOverdueAfter =
            endOverdue > 0 ? `${endOverdue} days after expected date` : null;
        }

        return {
          overdue_details: {
            diet_start_date: `${moment(item.diet_start_date).format(
              "DD-MM-YYYY",
            )} (${moment(item.diet_start_date).fromNow()})`,
            weight_overdue: weightOverdueLabel,
            // days_overdue: `${days} ${days > 1 ? "Days" : "Day"}`,
            days_overdue_after_expected: daysOverdueAfter,
          },
        };
      },
      extraOrderBy: ["dsl.diet_start_date DESC"],
      extraGroupBy: ["ud.user_id"],
    });

    const response = new ApiResponse({
      statusCode: 200,
      message: "Weight Overdue User Data fetched successfully",
      data: data || [],
      totalCount: total_page || 0,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in weightOverdueUserData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const dietOverdueUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
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
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
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
      extraSelectFields: [
        "wr.posted_date as last_weight_posted_date",
        "ABS(DATEDIFF(wr.posted_date, CURDATE())) as diet_overdue_time",
      ],
      extraObjects: (i) => {
        return {
          diet_details: {
            weight_posted_date: `${moment(i.last_weight_posted_date).format(
              "DD-MM-YYYY",
            )} ${moment(i.last_weight_posted_date).fromNow()}`,
            diet_overdue_days: `${i.diet_overdue_time} ${
              Number(i.diet_overdue_time) > 1 ? "Days" : "Day"
            }`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet Overdue User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const notStartedOverdueUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "sop.start_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "notstarted",
        },
      ],
      extraSelectFields: [
        "sop.start_date as current_program_start_date",
        "ABS(DATEDIFF(sop.start_date, CURDATE())) as not_started_overdue_time",
        "sop.start_date_added_by",
      ],
      extraObjects: (i) => {
        return {
          overdue_details: {
            start_date: `${moment(i.current_program_start_date).format(
              "DD-MM-YYYY",
            )} ${moment(i.current_program_start_date).fromNow()} `,
            start_date_set_by:
              Number(i.start_date_added_by) === 0
                ? "Default"
                : Number(i.start_date_added_by) === 1
                  ? "Mentor"
                  : "Client",
            not_started_overdue_in: `${i.not_started_overdue_time} ${
              Number(i.not_started_overdue_time) > 1 ? "Days" : "Day"
            }`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Not Started Overdue User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const callMissedUserData = async (req, res, next) => {
  try {
    const { mentor_id, user_type, page, limit, search } = req.body;

    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id",
        },
      ],
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value:
            user_type === "Active"
              ? "Active"
              : user_type === "OC"
                ? "Completed"
                : "Lead",
        },
        {
          field: "cu.added_by",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cu.call_status", operator: "=", value: "0", raw: true },
        {
          field: "cu.schedule_date",
          operator: "<",
          value: `CURDATE()`,
          raw: true,
        },
      ],
      extraSelectFields: [
        "cu.call_id",
        "cu.call_type",
        "cu.schedule_date",
        "cu.call_insights",
      ],
      extraObjects: (i) => {
        return {
          call_details: {
            call_id: i.call_id,
            call_type: mapCallType(i.call_type),
            schedule_date: `${moment(i.schedule_date).format(
              "DD-MM-YYYY",
            )} ${moment(i.schedule_date).fromNow()}`,

            call_insights: i.call_insights,
          },
        };
      },
      extraGroupBy: ["cu.call_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Call Missed User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
        "call_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const fuMissedUserData = async (req, res, next) => {
  try {
    const { mentor_id, user_type, page, limit, search } = req.body;
    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.leadFollowUpLogs} fu`,
          on: "fu.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} aad`,
          on: "aad.admin_user_id = fu.added_by",
        },
      ],
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value:
            user_type === "Active"
              ? "Active"
              : user_type === "OC"
                ? "Completed"
                : "Lead",
        },
        {
          field: "fu.assigned_to",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: `fu.follow_up_date = (
        SELECT MAX(follow_up_date)  -- Get the latest follow-up for each user
        FROM lead_follow_up_logs
        WHERE user_id = fu.user_id
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "fu.follow_up_status",
          operator: "=",
          value: 0,
        },
        {
          field: "fu.follow_up_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
      ],
      extraSelectFields: [
        "fu.follow_up_id",
        "fu.follow_up_date",
        "fu.follow_up_time",
        "fu.follow_up_note",
        "fu.source", 
        "fu.campaign", 
        "fu.type",
        "CONCAT(aad.first_name,' ',aad.last_name) as action_assigned_by",
      ],
      extraGroupBy: ["fu.user_id"],
      extraObjects: (i) => {
        return {
          follow_up_details: {
            follow_up_id: i.follow_up_id,
            follow_up_date: i?.follow_up_date
              ? `${moment(i.follow_up_date).format("DD-MM-YYYY")}`
              : null,
            follow_type:
              Number(i?.type) === 0
                ? "Call"
                : Number(i?.type) === 1
                  ? "Whatsapp"
                  : "App",
            follow_up_type_enum: i.type,
            source: i.source, 
            campaign: i.campaign, 
            follow_up_time: i?.follow_up_time
              ? moment(i.follow_up_time, "HH:mm:ss").format("hh:mm A")
              : null,

            follow_up_note: i?.follow_up_note || null,
            assigned_by: i?.action_assigned_by || null,
            next_fu: "",
          },
        };
      },
    });

    // Send the response
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Fu Missed User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
        "call_id",
        "follow_up_type_enum",
        "follow_up_id",
      ],
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const pendingDietUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.weightRecords} wr`,
          on: "wr.sub_order_id = sop.sub_order_id AND sop.sent_sessions = wr.session",
        },
        {
          type: "LEFT ",
          table: `${tables.subOrderPrograms} adv_sop`,
          on: "adv_sop.user_id = ud.user_id AND adv_sop.program_status ='4'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions + 1",
        },
        {
          type: "LEFT",
          table: `${tables.ingredientChecklistRecords} iclr`,
          on: "iclr.user_id = ud.user_id",
        },
      ],
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.sent_sessions",
          operator: "<>",
          value: "sop.total_sessions",
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
            {
              field: "wr.days",
              operator: "=",
              value: 10,
            },
            {
              field: "sop.sent_sessions",
              operator: "=",
              value: 0,
            },
          ],
        },
      ],
      extraSelectFields: ["wr.posted_date"],
      extraObjects: (i) => {
        return {
          pending_in: {
            weight_received_at: `${moment(i.posted_date).format(
              "DD-MM-YYYY",
            )} (${moment(i.posted_date).fromNow()})`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
      extraOrderBy: ["wr.posted_date DESC"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Pending Diet User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const draftedDietUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, filter_data } = req.body;

    const joins = [
      {
        type: "INNER",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session",
      },
    ];

    const conditions = [
      {
        field: "sop.total_sessions",
        operator: "<>",
        value: "sop.sent_sessions",
        raw: true,
      },
      {
        field: "dsl.diet_status",
        operator: "=",
        value: "1",
        raw: true,
      },
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "Active",
      },
      {
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      },
    ];
    if (filter_data === "wmr_today") {
      joins.push({
        type: "INNER",
        table: `${tables.dietSessionLog} dsl_current`,
        on: "sop.sub_order_id = dsl_current.sub_order_id AND sop.sent_sessions = dsl_current.session",
      });
      conditions.push({
        field: "DATEDIFF(CURDATE(), dsl_current.diet_start_date)",
        operator: "=",
        value: "11",
        raw: true,
      });
    }
    if (filter_data === "wmr_overdue") {
      joins.push({
        type: "INNER",
        table: `${tables.dietSessionLog} dsl_current`,
        on: "sop.sub_order_id = dsl_current.sub_order_id AND sop.sent_sessions = dsl_current.session",
      });
      conditions.push(
        {
          field: "DATEDIFF(CURDATE(), dsl_current.diet_start_date)",
          operator: ">",
          value: "11",
          raw: true,
        },
        {
          field: "dsl_current.end_session_weight",
          operator: "=",
          value: "0",
          raw: true,
        },
      );
    }

    if (filter_data === "naf_received") {
      joins.push({
        type: "INNER",
        table: `${tables.ingredientChecklistRecords} icl`,
        on: "icl.user_id = ud.user_id AND icl.active_order_id = ud.active_order_id",
      });
      conditions.push(
        {
          field: "icl.completion_status",
          operator: "=",
          value: 2,
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: "0",
          raw: true,
        },
      );
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: joins,
      extraConditions: conditions,
      extraSelectFields: [
        "dsl.diet_id",
        "dsl.diet_name",
        "dsl.diet_details_id",
      ],
      extraObjects: (i) => {
        return {
          diet_details: {
            diet_id: i.diet_id,
            diet_name: i.diet_name,
            diet_details_id: i.diet_details_id,
          },
        };
      },
      extraGroupBy: ["dsl.diet_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Drafted Diet User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "suggested_program_session_id",
        "suggested_program_id",
        "client_active_order_id",
        "client_id",
        "diet_details_id",
        "diet_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const preAttemptedDietUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl_next`,
          on: "dsl.sub_order_id = dsl_next.sub_order_id AND dsl_next.session = sop.sent_sessions + 1",
        },
      ],
      extraConditions: [
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: "dsl.session",
          raw: true,
        },
        {
          field: "sop.sent_sessions",
          operator: "!=",
          value: "sop.total_sessions",
          raw: true,
        },
        {
          field: "dsl.end_session_weight",
          operator: "=",
          value: "0",
          raw: true,
        },
        {
          field:
            "((dsl_next.diet_status = 2 AND dsl_next.diet_id IS NOT NULL) OR (dsl.session = 1 AND dsl.diet_status != 4))",
          operator: "",
          value: "",
          raw: true,
        },
      ],
      extraSelectFields: [
        "COALESCE(dsl_next.diet_id, dsl.diet_id) AS diet_id",
        "COALESCE(dsl_next.diet_name, dsl.diet_name) AS diet_name",
        "COALESCE(dsl_next.diet_details_id, dsl.diet_details_id) AS diet_details_id",
      ],
      extraObjects: (i) => {
        return {
          diet_details: {
            diet_id: i.diet_id,
            diet_name: i.diet_name,
            diet_details_id: i.diet_details_id,
          },
        };
      },
      extraGroupBy: ["diet_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Pre Attempted Diet User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "diet_id",
        "suggested_program_session_id",
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
      ],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const unansweredQueriesUserData = async (req, res, next) => {
  try {
    const { mentor_id, user_type, filter_data, page, limit, search } = req.body;

    if (!mentor_id || !user_type) {
      return next(
        new ErrorHandler(
          "Invalid input: mentor_id and user_type are required",
          400,
        ),
      );
    }

    const chatDocs = await clientEnquiry.aggregate([
      {
        $match: {
          type: "query",
          mentor_id: mentor_id,
        },
      },
      {
        $sort: { createdAt: 1 },
      },
      {
        $group: {
          _id: "$user_id",
          latestDoc: { $first: "$$ROOT" },
        },
      },

      {
        $project: {
          _id: "$latestDoc._id",
          user_id: "$latestDoc.user_id",
          mentor_id: "$latestDoc.mentor_id",
          query: "$latestDoc.query",
          type: "$latestDoc.type",
          createdAt: "$latestDoc.createdAt",
        },
      },
    ]);

    if (!chatDocs.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No users found with queries",
          data: [],
          meta_data: [],
        }),
      );
    }
    chatDocs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const { userIds, orderById } = generateUserIdsAndOrderById(chatDocs);
    const conditions = [
      { field: "ud.user_id", operator: "IN", value: userIds },
      {
        field: "ud.user_status",
        operator: "=",
        value: user_type === "Active" ? "Active" : "Completed",
      },
      { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
    ];

    if (filter_data === "1/2_session") {
      conditions.push({
        orConditions: [
          { field: "sop.sent_sessions", operator: "=", value: 1 },
          { field: "sop.sent_sessions", operator: "=", value: 2 },
        ],
      });
    }

    if (filter_data === "expiring_this_month") {
      conditions.push({
        field: "sop.expiry_date",
        operator: "BETWEEN",
        value: [
          moment().startOf("month").format("YYYY-MM-DD"),
          moment().endOf("month").format("YYYY-MM-DD"),
        ],
      });
    }

    if (filter_data === "tailend") {
      conditions.push({
        field: "sop.pending_session",
        operator: "=",
        value: 3,
      });
    }
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: conditions,
      extraObjects: (user) => {
        const chat = chatDocs.find(
          (chat) => String(chat.user_id) === String(user.user_id),
        );

        return {
          query_details: chat
            ? {
                query_id: chat._id || "N/A",
                query: chat.query || "No query text available",
                query_time: chat.createdAt
                  ? `${moment(chat.createdAt).format("DD-MM-YYYY")} (${moment(
                      chat.createdAt,
                    ).format("hh:mm A")})`
                  : "N/A",
              }
            : {},
        };
      },
      extraGroupBy: ["ud.user_id"],
      extraOrderBy: [`FIELD(ud.user_id,${userIds.join(",")})`],
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User Data with Oldest Unanswered Query fetched successfully",
        data,
        totalCount: total_page,
        meta_data: [
          "client_id",
          "client_active_order_id",
          "suggested_program_id",
          "suggested_program_session_id",
          "diet_id",
          "diet_details_id",
        ],
      }),
    );
  } catch (error) {
    console.error("Error in unansweredQueriesUserData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const pitchedButNoFuUserData = async (req, res, next) => {
  try {
    const { mentor_id, user_type, page, limit, search } = req.body;
    const dataFunction =
      String(user_type).toLowerCase() === "lead"
        ? getFormattedLeadData
        : getFormattedUserData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} lfl`,
          on: "ud.user_id = lfl.user_id",
        },
      ],
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value:
            user_type === "Active"
              ? " Active"
              : user_type === "OC "
                ? "Completed"
                : "Lead",
        },
        {
          field:
            user_type === "Active" || user_type === "OC"
              ? "ud.mentor_assigned"
              : "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "sp.added_date",
          operator: ">=",
          value: "NOW() - INTERVAL 48 HOUR",
          raw: true,
        },
        {
          field: "lfl.user_id",
          operator: "IS",
          value: null,
          raw: true,
        },
      ],
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "pitched But No FU User Data fetched successfully",
      data: data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
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

const atRiskUserData = async (req, res, next) => {
  try {
    const { mentor_id } = req.body;

    const query = await clientEnquiry.aggregate([
      {
        $match: {
          mentor_id: Number(mentor_id),
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

    const { data } = await getFormattedUserData({
      extraConditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
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
      extraJoins: [
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
      extraObjects: (i) => {
        const queries = query.find(
          (q) => q._id.toString() === i.user_id.toString(),
        );

        return {
          last_interaction_details: {
            last_query: queries.message,
            sent_at: `${moment(queries.lastMessage).format(
              "DD-MM-YYYY",
            )} ${moment(queries.lastMessage).fromNow()}`,
          },
        };
      },
      extraGroupBy: ["ud.user_id"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "At Risk User Data fetched successfully",
      data: data,
      meta_data: [
        "client_id",
        "client_active_order_id",
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
const draftedQueryUserData = async (req, res, next) => {
  try {
    const { mentor_id, search, user_id } = req.body;
    const conditions = [
      {
        field: "dq.mentor_id",
        operator: "=",
        value: mentor_id,
      },
      {
        field: "ud.user_status",
        operator: "=",
        value: "Active",
      },
    ];
    if (user_id) {
      conditions.push({ field: "ud.user_id", operator: "=", value: user_id });
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.draftedQueries} dq`,
          on: "dq.user_id = ud.user_id",
        },
      ],

      conditions: conditions,
      selectFields: [
        " ud.user_id",
        `CONCAT(COALESCE(ud.first_name, ''), 
       CASE WHEN ud.first_name IS NOT NULL AND ud.last_name IS NOT NULL THEN ' ' ELSE '' END, 
       COALESCE(ud.last_name, '')) as client_name`,
        "ud.email_id",
        "CASE WHEN ud.phone_code NOT IN ('0','') THEN CONCAT(RTRIM(ud.phone_code), ' ', ud.phone_number) ELSE ud.phone END AS phone",
        "ud.sub_user_status",
        "ud.active_order_id as current_program_sub_order_id",
        "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
        "dq.id",
        "dq.draft_text",
        "dq.created_at",
      ],
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "ud.user_id",
            "CONCAT(ud.first_name,' ',ud.last_name)",
            "ud.email_id",
            "ud.phone",
            "",
          ],
        },
      }),
    });

    const data = results.map((i) => {
      return {
        client_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          order_type: i.order_type,
          client_sub_user_status: i.sub_user_status,
          client_sub_order_id: i.current_program_sub_order_id,
        },
        drafted_query_details: {
          draft_id: i.id,
          draft_text: i.draft_text,
          created_at: `${moment(i.created_at).format("DD-MM-YYYY")} ${moment(
            i.created_at,
          ).fromNow()}`,
        },
      };
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Drafted Query User Data fetched successfully",
      data,
      meta_data: ["client_id", "client_active_order_id", "draft_id"],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in draftedQueryUserData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const rateSharedDataLead = async (req, res, next) => {
  const { id, period, user_type, sales_status, search, page, limit } = req.body;
  try {
    const { results: data, totalCount } = await readRecordNewForLead({
      table: `${tables.suggestedProgram} spr`,
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("health_score"),
        ...selectMap.get("goal_weight"),
        ...selectMap.get("goal"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),

        ...selectMap.get("consultation"),
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "spr.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs").slice(1),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("goal_weight"),
        ...joinsMap.get("goal"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),

        ...joinsMap.get("consultation"),
      ],
      conditions: [
        { field: "spr.suggested_by", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.user_id", operator: "IS NOT", value: "NULL", raw: true },
      ],
      withQueries: [...withMap.get("goals")],
      groupBy: ["cd.user_id"],
      countTotal: true,
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      pagination: {
        page,
        limit,
      },
    });
    if (data.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No rate shared data found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const finalData = data.map((user) => {
      const mappedData = mapLeadData({ details: user });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Rate shared data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const rateSharedData = async (req, res, next) => {
  const { id, period, sales_status, user_type, page, limit, search } = req.body;
  if (!period && !id) {
    return next(new ErrorHandler("period and id are required", 400));
  }
  const date = moment(period, "MM-YYYY");

  const startDate = date.clone().startOf("month").format("YYYY-MM-DD"); // e.g., "2024-10-01"

  const endDate = date.clone().endOf("month").format("YYYY-MM-DD");

  try {
    const selectFields = [
      "cd.user_id",
      `CONCAT('[', GROUP_CONCAT(JSON_OBJECT('follow_up_date', fu.follow_up_date,'follow_up_note', fu.follow_up_note)), ']') AS follow_ups`,
    ];
    let conditions = [
      { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
      {
        field: "date(sp.updated_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      },
      { field: "cd.user_id", operator: "IS NOT", value: "NULL", raw: true },
    ];
    const leadConditions = [
      { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.user_id", operator: "IS NOT", value: "NULL", raw: true },
    ];
    if (period) {
      leadConditions.push({
        field: "date(sp.updated_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }
    console.log(user_type, 111111);
    if (user_type) {
      if (user_type === "Active") {
        conditions.push({
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        });
      } else if (user_type === "OC") {
        conditions.push({
          field: "cd.sub_user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        });
      } else if (user_type === "Lead") {
        conditions.push({
          field: "cd.user_status",
          operator: "=",
          value: ["Lead"],
        });
      } else {
      }
    }
    if (sales_status !== "" && sales_status !== undefined) {
      conditions.push({
        field: "sp.status",
        operator: "=",
        value: sales_status,
      });
      leadConditions.push({
        field: "sp.status",
        operator: "=",
        value: sales_status,
      });
    }
    const groupBy = ["cd.user_id"];
    const joins = [
      {
        type: "LEFT",
        table: "users_details cd",
        on: "sp.user_id = cd.user_id",
      },
      {
        type: "LEFT",
        table: "lead_follow_up_logs fu",
        on: "cd.user_id = fu.user_id",
      },
    ];
    let finalData = [];
    let count = 0;
    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.suggestedProgram} sp`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "INNER",
            table: `(
    SELECT 
        user_id, 
        MAX(added_date) AS earliest_added_date
    FROM 
        suggested_program
    WHERE 
        added_date BETWEEN '2025-05-01' AND '2025-05-31'
    GROUP BY 
        user_id
) as sp_min`,
            on: "sp.user_id = sp_min.user_id AND sp.added_date = sp_min.earliest_added_date",
          },
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs").slice(1),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [...leadConditions],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
        orderBy: ["sp.suggested_program_id DESC"],
      });
      console.log(data.length, 1010101010);
      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => {
          const mappedData = mapLeadData({ details: user });
          return mappedData;
        });
      }
    } else {
      const { results: users, totalCount } = await readRecord({
        table: `${tables.suggestedProgram} sp`,
        selectFields,
        conditions,
        joins,
        groupBy,
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });

      console.log(users[0], 3936);
      if (users.length === 0) {
        finalData = [];
        count = 0;
      } else {
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
        count = totalCount;
        finalData = users.map((user, index) => {
          const mappedData = mapUserData({ user, details: details[index] });
          return mappedData;
        });
      }
    }

    let dataConditions = [
      { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
      {
        field: "sp.added_date",
        operator: "BETWEEN",
        value: [startDate, endDate],
      },
    ];

    if (user_type === "Active") {
      dataConditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
    } else if (user_type === "OC") {
      dataConditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
    } else if (user_type === "Lead") {
      dataConditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
    }
    const data = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "'mtd' AS type",
          "SUM(sp.suggested_amount) AS total_amount",
        ],
        condition: [...dataConditions],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "'1st' AS type",
          "SUM(sp.suggested_amount) AS total_amount",
        ],
        condition: [
          ...dataConditions,
          { field: "sp.status", operator: "=", value: "0" },
          { field: "cd.user_id", operator: "IS NOT", value: "NULL", raw: true },
        ],
        join: [
          {
            type: "LEFT",
            table: "users_details cd",
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "'hot' AS type",
          "SUM(sp.suggested_amount) AS total_amount",
        ],
        condition: [
          ...dataConditions,
          { field: "sp.status", operator: "=", value: "2" },
        ],
        join: [
          {
            type: "LEFT",
            table: "users_details cd",
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "'warm' AS type",
          "SUM(sp.suggested_amount) AS total_amount",
        ],
        condition: [
          ...dataConditions,
          { field: "sp.status", operator: "=", value: "3" },
        ],
        join: [
          {
            type: "LEFT",
            table: "users_details cd",
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "'cold' AS type",
          "SUM(sp.suggested_amount) AS total_amount",
        ],
        condition: [
          ...dataConditions,
          { field: "sp.status", operator: "=", value: "4" },
        ],
        join: [
          {
            type: "LEFT",
            table: "users_details cd",
            on: "sp.user_id = cd.user_id",
          },
        ],
      },
    ]);
    console.log(data, 1730);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Rate Shared Data fetched successfully",
      data: {
        finalData,
        data: [
          {
            mtd: data[0].total_amount ?? 0,
            first_contact: data[1].total_amount ?? 0,
            hot: data[2].total_amount ?? 0,
            warm: data[3].total_amount ?? 0,
            cold: data[4].total_amount ?? 0,
          },
        ],
      },
      totalCount: count,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const paymentLinkData = async (req, res, next) => {
  const { id, type } = req.query;
  try {
    const { results: users } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["cd.user_id"],
      conditions: [
        { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    console.log(users, 3643);
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
      },
      orderBy: orderById,
    });
    const finalData = userIds.map((user, index) => {
      return {
        userDetails: {
          user_id: details[index].client_user_id || null,
          name: details[index].client_name || null,
          email_id: details[index].client_email_id || null,
          phone: details[index].client_phone || null,
          gender: details[index].client_gender || null,
          program_count: details[index].client_program_count || null,
          user_status: details[index].sub_user_status || null,
        },
        programDetails: {
          program_name: details[index].current_program_name || null,
          program_session:
            details[index].current_program_total_sessions || null,
          program_sent_session:
            details[index].current_program_sent_sessions || null,
          program_duration: details[index].current_program_duration || null,
          program_mrp: details[index].current_program_mrp || null,
          program_paid: details[index].current_program_amount || null,
          validity: details[index].current_program_validity || null,
          program_expiry:
            moment(details[index].current_program_expiry_date).format(
              "Do MMM YYYY",
            ) || null,
        },
        suggestedProgramDetails: {
          suggested_program: details[index].suggested_program_name || null,
          suggested_amount: details[index].suggested_amount || null,
          suggested_date: moment(details[index].suggested_at).format(
            "Do MMM YYYY",
          ),
          suggested_by: details[index].suggested_by || null,
        },
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const paymentDetailsData = async (req, res, next) => {
  const { type, id, page, limit, search, user_type } = req.body;
  const todayDate = moment().format("YYYY-MM-DD");
  const startOfMonth = moment(todayDate).startOf("month").format("YYYY-MM-DD");
  const endOfMonth = moment(todayDate).endOf("month").format("YYYY-MM-DD");
  const pagination = { limit: limit, page: page };
  let conditions = [
    {
      field: "sp.added_date",
      operator: "BETWEEN",
      value: [startOfMonth, endOfMonth],
    },
    {
      field: "sp.suggested_by",
      operator: "=",
      value: parseInt(id),
    },
  ];
  if (user_type === "Active") {
    conditions.push({
      field: "cd.user_status",
      operator: "=",
      value: "Active",
    });
  } else if (user_type === "OC") {
    conditions.push({
      field: "cd.sub_user_status",
      operator: "IN",
      value: ["Completed", "Dropout", "Maintenance", "Fs"],
    });
  } else if (user_type === "Lead") {
    conditions.push({ field: "cd.user_type", operator: "=", value: "0" });
  }
  let selectFields = ["cd.user_id"];

  switch (type) {
    case "PLS":
      conditions.push(
        {
          field: "sp.payment_link_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "sp.payment_link_id",
          operator: "NOT IN",
          value: "(0)",
          raw: true,
        },
      );
      break;

    case "BDS":
      conditions.push({ field: "sp.payment_mode_id", operator: "=", value: 3 });
      break;

    case "UPIDS":
      conditions.push({ field: "sp.payment_mode_id", operator: "=", value: 2 });
      break;

    case "CC":
      conditions.push({ field: "sp.payment_mode_id", operator: "=", value: 4 });
      break;

    case "SPDE":
      conditions.push(
        {
          field: "sp.payment_mode_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.payment_status", operator: "=", value: "0" },
        {
          field: "sp.payment_expiry",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
      );
      break;

    case "SPDET":
      conditions.push(
        {
          field: "sp.payment_mode_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.payment_status", operator: "=", value: "0" },
        {
          field: "DATE(sp.payment_expiry)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      );
      break;

    case "SPDETO":
      conditions.push(
        {
          field: "sp.payment_mode_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.payment_status", operator: "=", value: "0" },
        {
          field: "DATE(sp.payment_expiry)",
          operator: "=",
          value: "DATE_ADD(CURDATE(), INTERVAL 1 DAY)", // Check for tomorrow's date
          raw: true,
        },
      );
      break;

    case "SPDEY":
      conditions.push(
        {
          field: "sp.payment_mode_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.payment_status", operator: "=", value: "0" },
        {
          field: "DATE(sp.payment_expiry)",
          operator: "=",
          value: "DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
          raw: true,
        },
      );
      break;

    case "PLR":
      conditions.push(
        {
          field: "sp.payment_mode_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.payment_status", operator: "=", value: "0" },
        {
          field: "DATE(sp.payment_expiry)",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        { field: "sp.payment_link_requested", operator: "=", value: 1 },
      );
      break;

    default:
      break;
  }

  try {
    let finalData = [];
    let count = 0;
    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.suggestedProgram} sp`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs").slice(1),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [...conditions],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });
      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => {
          const mappedData = mapLeadData({ details: user });
          return mappedData;
        });
      }
    } else {
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields,
        conditions,
        pagination,
        ...(search && {
          search: {
            searchQuery: decodeURIComponent(search),
            searchFields: [
              "cd.user_id",
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        joins: [
          {
            table: `${tables.suggestedProgram} sp`,
            type: "LEFT",
            on: "cd.suggested_program_id = sp.suggested_program_id AND MONTH(sp.added_date)= MONTH(NOW()) AND YEAR(sp.added_date)= YEAR(NOW())",
          },
        ],
        countTotal: true,
      });

      console.log(users[0], 3936);
      if (users.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No data found",
          data: [],
          totalCount: 0,
        });
        return res.status(200).json(apiResponse);
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
      count = totalCount;
      finalData = users.map((user, index) => {
        const mappedData = mapUserData({ user, details: details[index] });
        return mappedData;
      });
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      totalCount: count,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const stageWiseData = async (req, res, next) => {
  const {
    id,
    user_type,
    stage,
    period = "mtd",
    page,
    limit,
    search,
  } = req.body;
  if (!id) {
    return next(new ErrorHandler(" ID is required", 400));
  }
  try {
    const selectFields = ["cd.user_id"];
    let conditions = [
      {
        field:
          user_type === "Lead"
            ? "cd.counsellor_assigned"
            : "cd.mentor_assigned",
        operator: "=",
        value: parseInt(id),
      },
    ];
    if (user_type === "Lead") {
      conditions.push({ field: "cd.user_type", operator: "=", value: "0" });
    } else if (user_type === "`Active`") {
      conditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
    } else if (user_type === "OC") {
      conditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
    }
    if (stage) {
      conditions.push({
        field: "cd.stage",
        operator: "=",
        value: parseInt(stage),
      });
    }
    if (period === "mtd") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          moment().startOf("month").format("YYYY-MM-DD"),
          moment().endOf("month").format("YYYY-MM-DD"),
        ],
      });
    }
    console.log(conditions, 3924);
    let finalData = [];
    let count = 0;
    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [...conditions],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });
      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => {
          const mappedData = mapLeadData({ details: user });
          return mappedData;
        });
      }
    } else {
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields,
        conditions,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
        countTotal: true,
      });
      if (users.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No data found",
          data: [],
          totalCount: 0,
        });
        return res.status(200).json(apiResponse);
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
      count = totalCount;
      finalData = users.map((user, index) => {
        const mappedData = mapUserData({ user, details: details[index] });
        return mappedData;
      });
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Stage Wise Data fetched successfully",
      data: finalData,
      totalCount: count,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const referralData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    // If user_type is "Lead", use the alternative approach
    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.current_lead_source", operator: "=", value: 5 },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });

      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => mapLeadData({ details: user }));
      }
    } else {
      // Existing logic for other user types
      const selectFields = ["cd.user_id"];
      let conditions = [
        { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.current_lead_source", operator: "=", value: 5 },
        ...(user_type === "Active"
          ? [{ field: "cd.user_status", operator: "=", value: "Active" }]
          : []),
        ...(user_type === "OC"
          ? [
              {
                field: "cd.sub_user_status",
                operator: "IN",
                value: ["Completed", "Dropout", "Maintenance", "Fs"],
              },
            ]
          : []),
      ];

      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields,
        conditions,
        countTotal: true,
        pagination: {
          page,
          limit,
        },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
      });

      if (users.length === 0) {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: "No referral data found",
            data: [],
            totalCount: 0,
          }),
        );
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

      count = totalCount;
      finalData = users.map((user, index) =>
        mapUserData({ user, details: details[index] }),
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Referral Data fetched successfully",
      data: finalData,
      totalCount: count,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const clientWeightSeventyData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      // Handle Leads using readRecordNewForLead
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.latest_weight", operator: ">=", value: 70 },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });

      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => mapLeadData({ details: user }));
      }
    } else {
      // Existing Logic for Other User Types
      const selectFields = ["cd.user_id"];
      let conditions = [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.latest_weight", operator: ">=", value: 70 },
        ...(user_type === "Active"
          ? [{ field: "cd.user_status", operator: "=", value: "Active" }]
          : []),
        ...(user_type === "OC"
          ? [
              {
                field: "cd.sub_user_status",
                operator: "IN",
                value: ["Completed", "Dropout", "Maintenance", "Fs"],
              },
            ]
          : []),
      ];

      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields,
        conditions,
        countTotal: true,
        pagination: {
          page,
          limit,
        },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
      });

      if (users.length === 0) {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: `No user found with the provided mentor`,
            data: [],
            totalCount: 0,
          }),
        );
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

      count = totalCount;
      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          addFields: { weight_details: true },
        }),
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client with weight 70+ fetched successfully",
      data: finalData,
      totalCount: count,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const weightData = async (req, res, next) => {
  const { id, user_type, page, limit, search, day } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;
    let conditions = [
      {
        field: "cd.counsellor_assigned",
        operator: "=",
        value: parseInt(id),
      },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "wr.added_date",
        operator: ">=",
        value: `${moment()
          .subtract(48, "hours")
          .format("YYYY-MM-DD HH:mm:ss")}`,
        // raw: true,
      },
      {
        field: "wr.added_date",
        operator: "<=",
        value: `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
      },
    ];
    if (day == "start") {
      conditions.push({ field: "wrl.days", operator: "=", value: 0 });
    } else if (day == "end") {
      conditions.push({ field: "wrl.days", operator: "=", value: 10 });
    } else if (day == "mid") {
      conditions.push({ field: "wrl.days", operator: "=", value: 5 });
    } else if (day == "other") {
      conditions.push({
        field: "wrl.days",
        operator: "NOT IN",
        value: `(0,5,10)`,
      });
    }
    if (user_type === "Lead") {
      // Handle Leads using readRecordNewForLead
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),
          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
          {
            table: `${tables.weightRecordsLead} wr`,
            type: "LEFT",
            on: `cd.user_id = wr.user_id`,
          },
          // {
          //   table: `${tables.weightRecords} wrl`,
          //   type: "LEFT",
          //   on: `wr.user_id = wrl.user_id AND wr.wmr_id < wrl.wmr_id`,
          // },
        ],
        conditions: conditions,
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });

      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => mapLeadData({ details: user }));
      }
    } else {
      // Existing Logic for Other User Types
      let conditions = [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: "wr.weight_acknowledge",
          operator: "=",
          value: 0,
        },
        ...(user_type === "Active"
          ? [{ field: "cd.user_status", operator: "=", value: "Active" }]
          : []),
        ...(user_type === "OC"
          ? [
              {
                field: "cd.sub_user_status",
                operator: "IN",
                value: ["Completed", "Dropout", "Maintenance", "Fs"],
              },
            ]
          : []),
      ];
      if (day == "start") {
        conditions.push({ field: "wr.days", operator: "=", value: 0 });
      } else if (day == "end") {
        conditions.push({ field: "wr.days", operator: "=", value: 10 });
      } else if (day == "mid") {
        conditions.push({ field: "wr.days", operator: "=", value: 5 });
      } else if (day == "other") {
        conditions.push({
          field: "wr.days",
          operator: "NOT IN",
          value: `(0,5,10)`,
        });
      }
      console.time("Fetch users_details");
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "cd.user_id",
          "wr.wmr_id",
          "wr.posted_date",
          "wr.days",
          "(wr.weight - prev_wr.weight) AS weight_difference",
          "wr.weight_acknowledge",
        ],
        conditions,
        joins: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.weightRecords} wr`,
            type: "LEFT",
            on: "cd.user_id = wr.user_id",
            // on: `sop.sub_order_id = wr.sub_order_id AND cd.user_id = wr.user_id`,
          },
          // {
          //   table: `${tables.weightRecords} wrl`,
          //   type: "LEFT",
          //   on: `wr.user_id = wrl.user_id AND wr.wmr_id < wrl.wmr_id`,
          // },
          {
            type: "LEFT",
            table: `${tables.weightRecords} prev_wr`,
            on: `prev_wr.user_id = wr.user_id
    AND prev_wr.wmr_id = (
        SELECT MAX(wr2.wmr_id)
        FROM weight_records wr2
        WHERE wr2.user_id = wr.user_id
          AND wr2.wmr_id < wr.wmr_id
    )`,
          },
        ],
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
        groupBy: ["cd.user_id"],
        countTotal: true,
        orderBy: ["wr.wmr_id DESC"],
      });
      console.log(users, 5000);
      console.timeEnd("Fetch users_details");

      if (users.length === 0) {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: `No users found`,
            data: [],
            totalCount: 0,
          }),
        );
      }

      console.time("Aggregate userIds");
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      console.timeEnd("Aggregate userIds");

      console.time("Fetch user details from fetchUsersDetails");
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      console.log(details.length, 5028);
      console.timeEnd("Fetch user details from fetchUsersDetails");

      console.time("Prepare final data");
      count = totalCount;
      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          addFields: { weight_details: true },
          extraMappings: {
            weight_difference: user.weight_difference || 0,
            weight_acknowledge: user.weight_acknowledge,
            wmr_id: user.wmr_id,
          },
        }),
      );
      console.timeEnd("Prepare final data");
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Weight Data fetched successfully",
      data: finalData,
      totalCount: count,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching weight data:", error);
    return next(new ErrorHandler("Failed to fetch weight data", 500));
  }
};

const inchData = async (req, res, next) => {
  const { user_type, id, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        withQueries: [...withMap.get("goals")],
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          {
            table: `${tables.inchRecords} ir`,
            type: "LEFT",
            on: `cd.user_id = ir.user_id`,
          },
          {
            table: `${tables.inchRecords} irl`,
            type: "LEFT",
            on: `ir.user_id = irl.user_id AND ir.inch_id < irl.inch_id`,
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        groupBy: ["ir.user_id"],
        countTotal: true,
        pagination: {
          page,
          limit,
        },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: ["cd.first_name", "cd.email_id", "cd.phone"],
          },
        }),
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    } else {
      const conditions = [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "ir.inch_acknowledge", operator: "=", value: 0 },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
        // ...(user_type === "Active"
        //   ? [{ field: "cd.user_status", operator: "=", value: "Active" }]
        //   : []),
        // ...(user_type === "OC"
        //   ? [
        //       {
        //         field: "cd.sub_user_status",
        //         operator: "IN",
        //         value: ["Completed", "Dropout", "Maintenance", "Fs"],
        //       },
        //     ]
        //   : []),
      ];

      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "cd.user_id",
          "ir.inch_id",
          "ir.session",
          "ir.days",
          "ir.posted_date",
          "ir.inch_acknowledge",
          "ir.chest",
          "ir.waist",
          "ir.hips",
        ],
        conditions,
        joins: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.inchRecords} ir`,
            type: "LEFT",
            on: `cd.user_id = ir.user_id`,
          },
          // {
          //   table: `${tables.inchRecords} irl`,
          //   type: "LEFT",
          //   on: `ir.user_id = irl.user_id AND ir.inch_id < irl.inch_id`,
          // },
        ],
        groupBy: ["ir.user_id"],
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
        countTotal: true,
      });
      if (users.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `No users found`,
          data: [],
          totalCount: 0,
        });
        return res.status(200).json(apiResponse);
      }
      console.log(totalCount, 5200);
      count = totalCount;
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

      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          extraMappings: {
            inch_details: {
              session: user.session,
              days: user.days,
              posted_date: moment(user.posted_date).format("Do MMM YYYY"),
              chest: user.chest,
              waist: user.waist,
              hips: user.hips,
              inch_id: user.inch_id,
              inch_acknowledge: user.inch_acknowledge,
            },
          },
        }),
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Inch Data fetched successfully",
      data: finalData,
      totalCount: count,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in inchData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const photoData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          {
            table: `${tables.photoRecords} pr`,
            type: "LEFT",
            on: "cd.user_id = pr.user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        withQueries: [...withMap.get("goals")],
        conditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "pr.days", operator: "=", value: 10 },
        ],
        groupBy: ["pr.user_id"],
        countTotal: true,
        pagination: {
          page,
          limit,
        },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: ["cd.first_name", "cd.email_id", "cd.phone"],
          },
        }),
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    } else {
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "cd.user_id",
          "cd.first_name",
          "cd.user_status",
          "cd.email_id",
          "pr.photo_id",
          // "pr.photo_url",
        ],
        joins: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.photoRecords} pr`,
            type: "LEFT",
            on: "(sop.sub_order_id = pr.sub_order_id AND cd.user_id = pr.user_id)",
          },
        ],
        conditions: [
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
          { field: "pr.days", operator: "=", value: 10 },
          { field: "pr.photo_acknowledge", operator: "=", value: 0 },
          {
            field: "cd.user_status",
            operator: "=",
            value: "Active",
          },
        ],
        pagination: { page, limit },
        groupBy: ["pr.user_id"],
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        countTotal: true,
      });

      count = totalCount;
      finalData = users.map((user) => ({
        ...user,
        posted_date: moment(user.posted_date).format("Do MMM YYYY"),
      }));
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Photo Data fetched successfully",
        data: finalData,
        totalCount: count,
      }),
    );
  } catch (error) {
    console.error("Error in photoData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const milestoneData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      // Handle Leads using readRecordNewForLead
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.bnMyGoals} mg1`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            table: `${tables.bnMyGoals} mg2`,
            type: "LEFT",
            on: `(mg1.user_id = mg2.user_id AND mg1.id < mg2.id)`,
          },
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "mg1.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          { field: "mg2.id", operator: "IS ", value: "NULL", raw: true },
          { field: "mg1.goal_type", operator: "=", value: 1 },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["mg1.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });

      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => mapLeadData({ details: user }));
      }
    } else {
      // Existing Logic for Other User Types
      console.time("Fetch users_details");
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id", "mg.added_date"],
        joins: [
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: `cd.active_order_id = mg.sub_order_id and cd.user_id = mg.user_id`,
          },
        ],
        conditions: [
          {
            field: "JSON_LENGTH(mg.comment,'$.milestone_achieved')",
            operator: ">",
            value: 0,
          },
          ...(user_type === "Active"
            ? [{ field: "cd.user_status", operator: "=", value: "Active" }]
            : []),
          ...(user_type === "OC"
            ? [
                {
                  field: "cd.sub_user_status",
                  operator: "IN",
                  value: ["Completed", "Dropout", "Maintenance", "Fs"],
                },
              ]
            : []),
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        ],
        pagination: {
          page,
          limit,
        },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        countTotal: true,
        groupBy: ["mg.user_id"],
      });
      console.timeEnd("Fetch users_details");

      if (users.length === 0) {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: `No milestone data found`,
            data: [],
            totalCount: 0,
          }),
        );
      }

      console.time("Aggregate userIds");
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      console.timeEnd("Aggregate userIds");

      console.time("Fetch user details from fetchUsersDetails");
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          goal: true,
        },
        orderBy: orderById,
      });
      console.timeEnd("Fetch user details from fetchUsersDetails");

      console.time("Prepare final data");
      count = totalCount;
      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          addFields: { weight_details: true },
          extraMappings: {
            milestone: safeJSONParse(details[index].comment, {
              new_goals: [],
              goals_achieved: [],
              milestone_achieved: [],
            }).milestone_achieved,
          },
        }),
      );
      console.timeEnd("Prepare final data");
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Milestone Data fetched successfully",
      data: finalData,
      totalCount: count,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in milestoneData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const goalData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      // Handle Leads using readRecordNewForLead
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.bnMyGoals} mg1`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            table: `${tables.bnMyGoals} mg2`,
            type: "LEFT",
            on: `(mg1.user_id = mg2.user_id AND mg1.id < mg2.id)`,
          },
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "mg1.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          { field: "mg2.id", operator: "IS ", value: "NULL", raw: true },
          { field: "mg1.goal_type", operator: "=", value: 2 },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["mg1.user_id"],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });

      if (data.length === 0) {
        finalData = [];
      } else {
        count = totalCount;
        finalData = data.map((user) => mapLeadData({ details: user }));
      }
    } else {
      // Existing Logic for Other User Types
      console.time("Fetch users_details");
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id", "mg.added_date"],
        joins: [
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: `cd.active_order_id = mg.sub_order_id and cd.user_id = mg.user_id`,
          },
        ],
        conditions: [
          {
            field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
            operator: ">",
            value: 0,
          },
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
          ...(user_type === "Active"
            ? [{ field: "cd.user_status", operator: "=", value: "Active" }]
            : []),
          ...(user_type === "OC"
            ? [
                {
                  field: "cd.sub_user_status",
                  operator: "IN",
                  value: ["Completed", "Dropout", "Maintenance", "Fs"],
                },
              ]
            : []),
        ],
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
        countTotal: true,
        groupBy: ["mg.user_id"],
      });
      console.log(users.length, 5587);
      console.timeEnd("Fetch users_details");

      if (users.length === 0) {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: `No goal data found`,
            data: [],
            totalCount: 0,
          }),
        );
      }

      console.time("Aggregate userIds");
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      console.timeEnd("Aggregate userIds");

      console.time("Fetch user details from fetchUsersDetails");
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          goal: true,
        },
        orderBy: orderById,
      });
      console.timeEnd("Fetch user details from fetchUsersDetails");

      console.time("Prepare final data");
      count = totalCount;
      console.log(details[0]);
      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          addFields: { weight_details: true },
          extraMappings: {
            goals: safeJSONParse(details[index].comment, {
              new_goals: [],
              goals_achieved: [],
              milestone_achieved: [],
            }).goals_achieved,
          },
        }),
      );
      console.timeEnd("Prepare final data");
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Goal Data fetched successfully",
      data: finalData,
      totalCount: count,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in goalData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const halftimeFeedbackData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.halfTimeFeedback} hf1`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            table: `${tables.halfTimeFeedback} hf2`,
            type: "LEFT",
            on: `(hf1.user_id = hf2.user_id AND hf1.id < hf2.id)`,
          },
          {
            table: `${tables.userDetails} cd`,
            type: "LEFT",
            on: "hf1.user_id = cd.user_id",
          },
          {
            table: `${tables.adminUsers} ma`,
            type: "LEFT",
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          { field: "hf2.id", operator: "IS ", value: "NULL", raw: true },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        countTotal: true,
        groupBy: ["hf1.user_id"],
        withQueries: [...withMap.get("goals")],
        pagination: { page, limit },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: ["cd.first_name", "cd.email_id", "cd.phone"],
          },
        }),
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    } else {
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "cd.user_id",
          "hf1.mentor_star_rating",
          "hf1.improvement_needed",
        ],
        joins: [
          ...(user_type === "Active"
            ? [
                {
                  table: `${tables.halfTimeFeedback} hf1`,
                  type: "INNER",
                  on: `cd.active_order_id = hf1.sub_order_id `,
                },
              ]
            : [
                {
                  table: `${tables.halfTimeFeedback} hf1`,
                  type: "INNER",
                  on: `hf1.user_id = cd.user_id `,
                },
                {
                  table: `${tables.halfTimeFeedback} hf2`,
                  type: "LEFT",
                  on: `hf1.user_id = hf2.user_id AND hf1.id < hf2.id`,
                },
              ]),
        ],
        conditions: [
          ...(user_type === "OC"
            ? [{ field: "hf2.id", operator: "IS ", value: "NULL", raw: true }]
            : []),
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
          user_type === "Active"
            ? { field: "cd.user_status", operator: "=", value: "Active" }
            : {
                field: "cd.sub_user_status",
                operator: "IN",
                value: `("Completed", "Dropout", "Maintenance", "Fs")`,
                raw: true,
              },
        ],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        groupBy: ["cd.user_id"],
        pagination: {
          page,
          limit,
        },
      });
      console.log(totalCount, 5794);
      count = totalCount;
      if (users.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `No users found`,
          data: [],
          totalCount: 0,
        });
        return res.status(200).json(apiResponse);
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        orderBy: orderById,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          halftime_feedback: true,
          is_active: user_type === "Active",
        },
      });
      console.log(details, 5871);
      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          extraMappings: {
            halftime_feedback: {
              mentor_star_rating: details[index].client_halftime_mentor_rating,
              added_date: details[index].client_halftime_feedback_date,
              improvement_needed: details[index].client_halftime_improvement,
            },
          },
        }),
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Feedback data fetched successfully",
        data: finalData,
        totalCount: count,
      }),
    );
  } catch (error) {
    console.error("Error in halftimeFeedbackData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const finalFeedbackData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    let finalData = [];
    let count = 0;

    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.finalFeedback} ff1`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            table: `${tables.finalFeedback} ff2`,
            type: "LEFT",
            on: `(ff1.user_id = ff2.user_id AND ff1.id < ff2.id)`,
          },
          {
            table: `${tables.userDetails} cd`,
            type: "LEFT",
            on: "ff1.user_id = cd.user_id",
          },
          {
            table: `${tables.adminUsers} ma`,
            type: "LEFT",
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions: [
          { field: "ff2.id", operator: "IS ", value: "NULL", raw: true },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        countTotal: true,
        groupBy: ["ff1.user_id"],
        pagination: { page, limit },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: ["cd.first_name", "cd.email_id", "cd.phone"],
          },
        }),
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    } else {
      // Existing logic for other user types
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: [
          "cd.user_id",
          "ff1.mentor_feedback",
          "ff1.improvement_needed",
        ],
        joins: [
          {
            table: `${tables.finalFeedback} ff1`,
            type: "INNER",
            on: `ff1.user_id = cd.user_id`,
          },
          {
            table: `${tables.finalFeedback} ff2`,
            type: "LEFT",
            on: `ff1.user_id = ff2.user_id AND ff1.id < ff2.id`,
          },
        ],
        conditions: [
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
          { field: "ff2.id", operator: "IS ", value: "NULL", raw: true },
          user_type === "Active"
            ? { field: "cd.user_status", operator: "=", value: "Active" }
            : {
                field: "cd.sub_user_status",
                operator: "IN",
                value: `("Completed", "Dropout", "Maintenance", "Fs")`,
                raw: true,
              },
        ],
        countTotal: true,
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: [
              "CONCAT(cd.first_name, ' ', cd.last_name)",
              "cd.email_id",
              "cd.phone",
            ],
          },
        }),
        pagination: {
          page,
          limit,
        },
      });
      if (users.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `No users found`,
          data: [],
          totalCount: 0,
        });
        return res.status(200).json(apiResponse);
      }
      console.log(totalCount, 5964);
      count = totalCount;
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        orderBy: orderById,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          final_feedback: true,
        },
      });
      console.log(details[0], 5964);
      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          extraMappings: {
            final_feedback: {
              mentor_rating: details[index].client_final_mentor_rating,
              improvement_needed: details[index].client_final_improvement,
              added_date: details[index].client_final_feedback_date,
            },
          },
        }),
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Feedback data fetched successfully",
        data: finalData,
        totalCount: count,
      }),
    );
  } catch (error) {
    console.error("Error in finalFeedbackData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const dietFeedbackData = async (req, res, next) => {
  const { id, user_type, page, limit, search } = req.body;

  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }

  try {
    const { results: dietFeedback, totalCount } = await readRecord({
      selectFields: [
        "df.result",
        "df.session",
        "df.diet_id",
        "df.created_at",
        "dsl.diet_name",
        "cd.user_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
  SELECT * FROM ${tables.dietFeedback} df1
  WHERE df1.created_at = (
    SELECT MAX(df2.created_at)
    FROM ${tables.dietFeedback} df2
    WHERE df1.user_id = df2.user_id
      AND df2.is_ack = 0
  )
) df`,
          on: "cd.user_id = df.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "df.diet_id = dsl.diet_id",
        },
      ],
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
        { field: "df.is_ack", operator: "=", value: 0 },
      ],
      pagination: {
        page,
        limit,
      },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      countTotal: true,
    });
    const { userIds, orderById } = generateUserIdsAndOrderById(dietFeedback);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal: true,
      },
      orderBy: orderById,
    });
    const ratingIndex = safeJSONParse(dietFeedback[0].result, []).findIndex(
      (item) =>
        item.question ===
        "On a scale of 1 to 5, how would you rate your overall experience with the diet plan?",
    );
    const finalData = dietFeedback.map((feedback, index) => {
      return mapUserData({
        user: feedback,
        details: details[index],
        extraMappings: {
          diet_feedback: {
            diet_id: feedback.diet_id,
            diet_session: feedback.session,
            diet_name: feedback.diet_name,
            diet_rating:
              ratingIndex !== -1
                ? safeJSONParse(feedback.result, [])[ratingIndex]?.answer ||
                  null
                : null,
            diet_feedback_date: moment(feedback.created_at).format(
              "Do MMM YYYY",
            ),
          },
        },
      });
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Feedback data fetched successfully",
        data: finalData,
        totalCount,
      }),
    );
  } catch (error) {
    console.error("Error in finalFeedbackData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const healthScoreData = async (req, res, next) => {
  const { id, user_type, days, page, limit, search } = req.body;

  if (!id || !days) {
    return next(new ErrorHandler("id and days are required", 400));
  }

  try {
    let finalData = [];
    let count = 0;
    let conditions = [
      { field: "hs2.id", operator: "IS ", value: "NULL", raw: true },
    ];

    if (user_type === "Lead") {
      conditions.push(
        { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "0" },
      );
    } else {
      conditions.push({
        field: "cd.mentor_assigned",
        operator: "=",
        value: parseInt(id),
      });
    }

    if (user_type === "Active") {
      conditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
    } else if (user_type === "OC") {
      conditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: `("Completed", "Dropout", "Maintenance", "Fs")`,
        raw: true,
      });
    }

    if (days === "today") {
      conditions.push({
        field: "hs1.created",
        operator: ">=",
        value: "CURRENT_DATE()",
        raw: true,
      });
    } else if (days === "mtd") {
      conditions.push({
        field: "hs1.created",
        operator: "BETWEEN",
        value: [
          `${moment().startOf("month").format("YYYY-MM-DD")}`,
          `${moment().format("YYYY-MM-DD")}`,
        ],
      });
    } else if (days === "last_30") {
      conditions.push({
        field: "hs1.created",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(30, "days").format("YYYY-MM-DD")}`,
          `${moment().format("YYYY-MM-DD")}`,
        ],
      });
    }

    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.healthScoreClient} hs1`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),

          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            table: `${tables.healthScoreClient} hs2`,
            type: "LEFT",
            on: `(hs1.user_id = hs2.user_id AND hs1.id<hs2.id)`,
          },
          {
            table: `${tables.userDetails} cd`,
            type: "LEFT",
            on: "hs1.user_id = cd.user_id",
          },
          {
            table: `${tables.adminUsers} ma`,
            type: "LEFT",
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),

          ...joinsMap.get("consultation"),
        ],
        conditions,
        countTotal: true,
        groupBy: ["hs1.user_id"],
        pagination: { page, limit },
        withQueries: [...withMap.get("goals")],
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: ["cd.first_name", "cd.email_id", "cd.phone"],
          },
        }),
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    } else {
      const { results: users, totalCount } = await readRecord({
        table: `${tables.healthScoreClient} hs1`,
        selectFields: [
          "cd.user_id",
          "hs1.ideal_bmi",
          "hs1.ideal_weight",
          "hs1.body_mass_index",
          "hs1.weight",
          "hs1.height",
          "hs1.overall_health_score",
          "hs1.healthscore_status",
          "hs1.created",
        ],
        joins: [
          {
            table: `${tables.healthScoreClient} hs2`,
            type: "LEFT",
            on: `(hs1.user_id = hs2.user_id AND hs1.id<hs2.id)`,
          },
          {
            table: `${tables.userDetails} cd`,
            type: "LEFT",
            on: "hs1.user_id = cd.user_id",
          },
        ],
        conditions,
        countTotal: true,
        groupBy: ["hs1.user_id"],
        pagination: { page, limit },
        ...(search && {
          search: {
            searchQuery: search,
            searchFields: ["cd.first_name", "cd.email_id", "cd.phone"],
          },
        }),
      });

      count = totalCount;
      if (users.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `No users found`,
          data: [],
          totalCount: 0,
        });
        return res.status(200).json(apiResponse);
      }
      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        orderBy: orderById,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
      });

      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          addFields: { health_score: true },
        }),
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User data fetched successfully",
        data: finalData,
        totalCount: count,
      }),
    );
  } catch (error) {
    console.error("Error in healthScoreData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const goodLossData = async (req, res, next) => {
  const { id, user_type } = req.query;
  try {
    // Define the start of the current month and today's date using moment
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    // Build the user status condition based on the user_type
    let userStatusCondition;
    if (user_type === "Active") {
      userStatusCondition = "cd.user_status = 'Active'";
    } else if (user_type === "OC") {
      userStatusCondition = "cd.user_status = 'Completed'";
    } else if (user_type === "Lead") {
      userStatusCondition = "cd.user_type = '0'";
    } else {
      throw new Error("Invalid user type");
    }

    // Build the query
    const users = await db
      .with("RankedRecords", (qb) => {
        qb.select(
          "cd.user_id",
          "cd.latest_weight",
          "sop.start_program_weight",
          db.raw(
            "ROUND(cd.latest_weight - sop.start_program_weight, 2) AS weight_difference",
          ),
          db.raw(
            "ROW_NUMBER() OVER (PARTITION BY sop.sub_order_id ORDER BY wr.posted_date DESC) AS rn",
          ),
          "cd.mentor_assigned",
        )
          .from("users_details as cd")
          .leftJoin(
            "sub_orders_programs as sop",
            "cd.active_order_id",
            "sop.sub_order_id",
          )
          .leftJoin(
            "weight_records as wr",
            "sop.sub_order_id",
            "wr.sub_order_id",
          )
          .whereRaw(userStatusCondition) // Assuming userStatusCondition is defined
          .andWhereRaw("(cd.latest_weight - sop.start_program_weight) < -4.99")
          .andWhereRaw("DATE(wr.posted_date) BETWEEN ? AND ?", [
            startOfMonth, // 'startOfMonth' is assumed to be a Moment date
            today, // 'today' is assumed to be a Moment date
          ])
          .andWhere("cd.mentor_assigned", parseInt(id)); // Assuming 'id' is provided as a parameter
      })
      .select(
        "user_id",
        "latest_weight",
        "start_program_weight",
        db.raw(
          "ROUND(latest_weight - start_program_weight, 2) AS weight_difference",
        ),
        "mentor_assigned",
      )
      .from("RankedRecords")
      .where("rn", 1);

    if (users.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: `No user found with the provided mentor `,
        data: [],
      });
      return res.status(200).json(apiresponse);
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
      const mappedData = mapUserData({
        user,
        details: details[index],
        addFields: { weight_details: true },
      });
      return mappedData;
    });
    // Send the result as a JSON response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Good loss data fetched successfully",
      data: finalData,
    });
    res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getComUserData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.changeOfMentor} com`,
          on: "ud.user_id = com.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "ud.user_id = cu.user_id AND cu.call_type not in ('0','1','2','3') AND DATE(cu.schedule_date) >= com.added_date AND cu.call_status = 1",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "cu.slot_id = slot.id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} cad`,
          on: "cad.admin_user_id = com.old_mentor",
        },
      ],
      extraConditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "com.old_mentor", operator: "<>", value: "com.new_mentor" },
        { field: "com.old_mentor", operator: "<>", value: "0", raw: true },
        { field: "com.new_mentor", operator: "=", value: Number(mentor_id) },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        {
          field: "com.added_date",
          operator: ">=",
          value: moment().startOf("month").format("YYYY-MM-DD"),
        },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: Number(mentor_id),
        },
      ],
      extraSelectFields: [
        "cad.crm_user as old_mentor",
        "com.added_date",
        "cu.schedule_date as com_call_schedule_date",
        "slot.appointment_slots com_call_slot",
      ],
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {
        return {
          old_mentor: i.old_mentor,
          com_date: `${moment(i?.added_date).format("DD-MMM-YY")} ${moment(
            i.added_date,
          ).fromNow()}`,

          schedule_date: i?.com_call_schedule_date
            ? moment(i?.com_call_schedule_date).format("Do MMM YYYY")
            : "N/A",
          slot: i?.com_call_slot || "N/A",
        };
      },
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Change Of mentor Fetched Successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "client_id",
        "client_active_order_id",
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

const UpdateLeadDetailsUsers = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search, user_type } = req.body;

    const { data, total_page } = await getFormattedLeadData({
      page,
      limit,
      search,
      extraConditions: [
        {
          field: "cl.user_id",
          operator: "IS NOT",
          value: null,
          raw: true,
        },
        {
          field: "ud.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "ud.added_date",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          orConditions: [
            {
              field: "ud.birth_date",
              operator: "IS",
              value: null,
              raw: true,
            },
            {
              field: "ud.birth_date",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "ud.gender",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "ud.start_weight",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "ud.height",
              operator: "IS",
              value: null,
              raw: true,
            },
          ],
        },
      ],
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Lead Details Updated Successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "country_id",
        "client_id",
        "client_active_order_id",
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

const pitchedNotPitchedController = async (req, res, next) => {
  try {
    const { admin_id, start_date, end_date } = req.query;
    const formattedStartDate = moment(start_date).format("YYYY-MM-DD");
    const formattedEndDate = moment(end_date).format("YYYY-MM-DD");
    const [results] = await readPool.query(`
        SELECT 'pitched_active' AS category, COUNT(ud.user_id) AS count
FROM users_details ud
LEFT JOIN suggested_program sp ON ud.suggested_program_id = sp.suggested_program_id
WHERE ud.mentor_assigned = ${admin_id}
  AND ud.suggested_program_id IS NOT NULL
  AND ud.user_status = 'Active'
  AND DATE(sp.added_date) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'

UNION ALL

SELECT 'not_pitched_active' AS category, COUNT(ud.user_id) AS count
FROM users_details ud
LEFT JOIN suggested_program sp ON ud.suggested_program_id = sp.suggested_program_id
WHERE ud.mentor_assigned = ${admin_id}
  AND (ud.suggested_program_id IS NULL OR ud.suggested_program_id = 0)
  AND ud.user_status = 'Active'
  AND DATE(sp.added_date) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'

UNION ALL

SELECT 'pitched_oc' AS category, COUNT(ud.user_id) AS count
FROM users_details ud
LEFT JOIN suggested_program sp ON ud.suggested_program_id = sp.suggested_program_id
WHERE ud.mentor_assigned = ${admin_id}
  AND ud.suggested_program_id IS NOT NULL
  AND ud.user_status = 'Completed'
  AND DATE(sp.added_date) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'

UNION ALL

SELECT 'not_pitched_oc' AS category, COUNT(ud.user_id) AS count
FROM users_details ud
LEFT JOIN suggested_program sp ON ud.suggested_program_id = sp.suggested_program_id
WHERE ud.mentor_assigned = ${admin_id}
  AND (ud.suggested_program_id IS NULL OR ud.suggested_program_id = 0)
  AND ud.user_status = 'Completed'
  AND DATE(sp.added_date) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'

UNION ALL

SELECT 'pitched_lead' AS category, COUNT(ud.user_id) AS count
FROM users_details ud
LEFT JOIN suggested_program sp ON ud.suggested_program_id = sp.suggested_program_id
WHERE ud.counsellor_assigned = ${admin_id}
  AND ud.suggested_program_id IS NOT NULL
  AND ud.user_type = 0
  AND DATE(sp.added_date) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'

UNION ALL

SELECT 'not_pitched_lead' AS category, COUNT(ud.user_id) AS count
FROM users_details ud
LEFT JOIN suggested_program sp ON ud.suggested_program_id = sp.suggested_program_id
WHERE ud.counsellor_assigned = ${admin_id}
  AND (ud.suggested_program_id IS NULL OR ud.suggested_program_id = 0)
  AND ud.user_type = 0
  AND DATE(sp.added_date) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}';

      `);
    const transformedResults = results.reduce(
      (acc, { category, count }) => {
        const [type, status] = category.split("_");
        if (acc[type] && acc[type][`${status}_count`] !== undefined) {
          acc[type][`${status}_count`] = count;
        }

        return acc;
      },
      {
        pitched: {
          active_count: 0,
          oc_count: 0,
          lead_count: 0,
        },
        not_pitched: {
          active_count: 0,
          oc_count: 0,
          lead_count: 0,
        },
      },
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: transformedResults,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const linkSharedUserData = async (req, res, next) => {
  try {
    const { mentor_id, user_type, search, filter_data } = req.body;

    const conditions = [
      { field: "sp.payment_mode_id", operator: "=", value: 1 },
      {
        field: "sp.payment_link_id",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field:
          "(CASE WHEN ud.user_type = '0' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)",
        operator: "=",
        value: mentor_id,
      },
    ];
    if (filter_data) {
      conditions.push({
        field: "DATE(sp_pl.expiry_at)",
        operator: filter_data === "active" ? ">=" : "<",
        value: "CURDATE()",
        raw: true,
      });
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        `CONCAT(COALESCE(ud.first_name, ''), 
       CASE WHEN ud.first_name IS NOT NULL AND ud.last_name IS NOT NULL THEN ' ' ELSE '' END, 
       COALESCE(ud.last_name, '')) as client_name`,
        "ud.email_id",
        "CASE WHEN ud.phone_code NOT IN ('0','') THEN CONCAT(RTRIM(ud.phone_code), ' ', ud.phone_number) ELSE ud.phone END AS phone",
        "ud.sub_user_status",
        "ud.active_order_id as current_program_sub_order_id",
        "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
        "sp.suggested_program_id as suggested_id",
        "sp.program_id as suggested_program_id ",
        "sp.program_session_id as suggested_program_session_id",
        "sp.suggested_amount as suggested_amount",
        "spm.program_name as suggested_program_name",
        "sp.program_days",
        "sp.payment_link_id",
        "sp.added_date as suggested_at",
        "sps.mrp as suggested_program_mrp",
        "sps.program_id as program_session_program_id",
        "sps.program_duration as suggested_program_days",
        "sp.program_id",
        "sp.payment_mode_id as suggested_payment_mode_id",
        "sp_paym.payment_mode_name as suggested_payment_mode_name",
        "sp_paym.payment_mode_details as suggested_payment_mode_details",
        "sp.payment_expiry as suggested_payment_expiry",
        "sp_pl.payment_link as suggested_payment_link",
        "sp.mentor_note as suggested_mentor_note",
        "sp.motivation_level as suggested_motivation_level",
        "sp.status as suggested_sale_status",
        "sp.free_hamper as free_hamper",
      ],
      joins: [
        {
          type: "LEFT",
          table: `(SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC, suggested_program_id DESC) AS rn FROM ${tables.suggestedProgram}) AS sp_inner WHERE rn = 1) AS sp`,

          on: "ud.user_id = sp.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} sps`,
          on: "sp.program_session_id =  sps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} spm`,
          on: "sp.program_id = spm.program_id",
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
      conditions,
      orderBy: ["sp.updated_date DESC"],
    });
    const data = results.map((i) => {
      let message = "";
      const daysLeft = moment(i.suggested_payment_expiry).diff(
        moment(),
        "days",
      );

      let displayDays;
      if (daysLeft > 0) {
        displayDays = `in the next ${daysLeft} Days`;
      } else if (daysLeft === 0) {
        displayDays = "Today";
      } else {
        displayDays = ""; // or "Expired" if you want to show past due
      }
      if (Number(i.suggested_payment_mode_id) === 1) {
        message = `<span>Hi ${
          i.client_name
        },<br><br> PFA your payment link for <b>${i.suggested_program_name} (${
          i.suggested_program_days
        }) program</b> for Amount <b>Rs.${
          i.suggested_amount
        }</b> <br> Click here: <a href="${i.suggested_payment_link}">${
          i.suggested_payment_link
        }</a> <br><br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
          i.suggested_payment_expiry,
        ).format(
          "Do MMMM YYYY",
        )} which is ${displayDays}. Please ensure you use it before that. ${
          i?.free_hamper && i?.free_hamper !== "No"
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        }  <br><br> P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
          i.suggested_amount
        }">Click here</a></span>`;
      } else if (Number(i.suggested_payment_mode_id) === 3) {
        // Handle Bank Account Payment Mode
        message = `<span>PFA the Bank Account Details for the payment of Rs.${
          i.suggested_amount
        } for ${i.suggested_program_name} (${
          i.suggested_program_days
        }) program.<br> ${i.suggested_payment_mode_details} ${
          i?.free_hamper && i?.free_hamper !== "No"
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
      } else if (Number(i.suggested_payment_mode_id) === 2) {
        // Handle UPI Payment Mode
        message = `<span>Hi ${
          i.client_name
        }, <br> PFA the UPI details for the Amount of Rs.${
          i.suggested_amount
        } for ${i.suggested_program_name} (${
          i.suggested_program_days
        }) program. <br> ${i.suggested_payment_mode_details} ${
          i?.free_hamper && i?.free_hamper !== "No"
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
      } else if (Number(i.suggested_payment_mode_id) === 4) {
        // Handle Cash Collection Payment Mode
        message = `<span>Hi ${
          i.client_name
        },<br> Cash Collection for the amount of Rs.${i.suggested_amount} for ${
          i.suggested_program_name
        } (${i.suggested_program_days}). <br> Date: ${moment(
          i.suggested_payment_expiry,
        ).format(
          "Do MMMM YYYY",
        )} <br> Contact Person: Abdul Shaikh (919158267868) ${
          i?.free_hamper && i?.free_hamper !== "No"
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
      }

      return {
        client_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          order_type: i.order_type,
          client_sub_user_status: i.sub_user_status,
          client_sub_order_id: i.current_program_sub_order_id,
        },

        suggested_details: {
          suggested_id: i.suggested_id,
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_program_duration: `(${i.suggested_program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.suggested_payment_mode_id
            ? true
            : false,
          suggested_payment_link_expiry: i.suggested_payment_mode_id
            ? moment(i.suggested_payment_expiry)
                .add(5, "hours")
                .add(30, "minutes")
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level: i.suggested_motivation_level,
          suggested_sale_status: i.suggested_sale_status,
          free_hamper: i?.free_hamper,
          message,
        },
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Link Shared User Data fetched successfully",
        data,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const onholdToday = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: "DATE(ohc.end_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
        { field: "ohc1.user_id", operator: "IS", value: "NULL", raw: true },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.onholdClients} ohc`,
          on: `ud.user_id = ohc.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.onholdClients} ohc1`,
          on: `ohc.user_id = ohc1.user_id AND ohc.id < ohc1.id`,
        },
      ],
      extraSelectFields: [
        "ohc.start_date as break_start_date",
        "ohc.end_date as break_end_date",
      ],
      extraGroupBy: ["ud.user_id"],
      extraOrderBy: ["ohc.end_date DESC"],
      extraObjects: (i) => {
        const formatted_start_date = moment(i.break_start_date).format(
          "DD-MMM-YYYY",
        );
        const formatted_end_date = moment(i.break_end_date).format(
          "DD-MMM-YYYY",
        );
        return {
          break_details: {
            start_date: formatted_start_date,
            end_date: formatted_end_date,
          },
        };
      },
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Onhold Today Fetched Successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "country_id",
        "client_id",
        "client_active_order_id",
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
const onholdOd = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: "DATE(ohc.end_date)",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
        { field: "ohc1.user_id", operator: "IS", value: "NULL", raw: true },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.onholdClients} ohc`,
          on: `ud.user_id = ohc.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.onholdClients} ohc1`,
          on: `ohc.user_id = ohc1.user_id AND ohc.id < ohc1.id`,
        },
      ],
      extraSelectFields: [
        "ohc.start_date as break_start_date",
        "ohc.end_date as break_end_date",
      ],
      extraGroupBy: ["ud.user_id"],
      extraOrderBy: ["ohc.end_date DESC"],
      extraObjects: (i) => {
        const formatted_start_date = moment(i.break_start_date).format(
          "DD-MMM-YYYY",
        );
        const formatted_end_date = moment(i.break_end_date).format(
          "DD-MMM-YYYY",
        );
        return {
          break_details: {
            start_date: formatted_start_date,
            end_date: formatted_end_date,
          },
        };
      },
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Onhold OD Fetched Successfully",
      data,
      totalCount: total_page,
      meta_data: [
        "country_id",
        "client_id",
        "client_active_order_id",
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

const getNumberOfFormsFilled = async (req, res, next) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ message: "mentor_id is required" });
    }

    const { results: users } = await readRecord({
      table: tables.userDetails,
      selectFields: ["user_id"],
      conditions: [{ field: "mentor_assigned", operator: "=", value: id }],
    });

    const userIds = users.map((u) => u.user_id);

    if (userIds.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No users found under this mentor",
        data: { totalCount: 0 },
      });
      return res.status(200).json(apiResponse);
    }

    const todayMidnight = moment().startOf("day");

    const yesterday7pm = moment(todayMidnight)
      .subtract(1, "day")
      .add(19, "hours");

    const today10am = moment(todayMidnight).add(10, "hours");

    const dateRangeCondition = {
      field: "created_at",
      operator: "BETWEEN",
      value: [
        yesterday7pm.format("YYYY-MM-DD HH:mm:ss"),
        today10am.format("YYYY-MM-DD HH:mm:ss"),
      ],
    };

    const { results: feedbacks } = await readRecord({
      table: tables.dietFeedback,
      selectFields: ["user_id", "created_at"],
      conditions: [
        { field: "user_id", operator: "IN", value: userIds },
        dateRangeCondition,
      ],
    });

    // Get unique user_ids only
    const uniqueUserIds = [...new Set(feedbacks.map((f) => f.user_id))];

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Users who filled form between yesterday 7 PM and today 10 AM",
      data: { totalCount: uniqueUserIds.length },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const getFollowUpsByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    const { results} = await readRecord({
      table: `${tables.leadFollowUpLogs} lfl`,
      selectFields: [
        "lfl.follow_up_date",
         "lfl.type",
        "(CASE WHEN lfl.type IN (0,'0') THEN slot.appointment_slots WHEN lfl.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END) as follow_up_time",
        "lfl.follow_up_note", 
        "lfl.source",
        "lfl.campaign",
        "au.crm_user as 'added_by'",
        "ro.name as 'role'", 
        "lfl.follow_up_status",],
      conditions: [
        { field: "lfl.user_id", operator: "=", value: user_id },
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        { field: "lfl.follow_up_date", operator: ">=", value: 'CURDATE() - INTERVAL 30 DAY', raw:true }
      ],

      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "au.admin_user_id = lfl.added_by",
        },

        {
          type: "LEFT",
          table: `${tables.roles} ro`,
          on: "ro.role_id = au.role_id",
        },

        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "lfl.slot_id = slot.id and lfl.type IN (0, '0')",
        },
        {
          type: "LEFT",
          table: `${tables.whatsappAppSlots} wap_slot`,
          on: "lfl.slot_id = wap_slot.id and lfl.type IN ('1', '2',1,2)",
        },
      ],
      orderBy: ['lfl.follow_up_date DESC']
    })


    const countData = await readRecordUnion([
      {
        table:`${tables.leadFollowUpLogs} lfl`,
        selectField: [
          "COUNT(lfl.source) as count",
          "'email' as type",
        ],
        condition: [
        { field: "lfl.user_id", operator: "=", value: user_id },
        { field: "lfl.source", operator: "=", value: 'EMAIL' },
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        { field: "lfl.follow_up_date", operator: ">=", value: 'CURDATE() - INTERVAL 30 DAY', raw:true }
        ],
      },
      {
        table:`${tables.leadFollowUpLogs} lfl`,
        selectField: [
          "COUNT(lfl.source) as count",
          "'wati' as type",
        ],
        condition: [
        { field: "lfl.user_id", operator: "=", value: user_id },
        { field: "lfl.source", operator: "=", value: 'WATI'},
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        { field: "lfl.follow_up_date", operator: ">=", value: 'CURDATE() - INTERVAL 30 DAY', raw:true }
        ],
      },
      {
        table:`${tables.leadFollowUpLogs} lfl`,
        selectField: [
          "COUNT(lfl.source) as count",
          "'pv' as type",
        ],
        condition: [
        { field: "lfl.user_id", operator: "=", value: user_id },
        { field: "lfl.source", operator: "=", value: 'PV'},
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        { field: "lfl.follow_up_date", operator: ">=", value: 'CURDATE() - INTERVAL 30 DAY', raw:true }
        ],
      },
      {
        table:`${tables.leadFollowUpLogs} lfl`,
        selectField: [
          "COUNT(lfl.source) as count",
          "'cv' as type",
        ],
        condition: [
        { field: "lfl.user_id", operator: "=", value: user_id },
        { field: "lfl.source", operator: "=", value: 'CV'},
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        { field: "lfl.follow_up_date", operator: ">=", value: 'CURDATE() - INTERVAL 30 DAY', raw:true }
        ],
      },
      {
        table:`${tables.leadFollowUpLogs} lfl`,
        selectField: [
          "COUNT(*) as count",
          "'mentor' as type",
        ],
        condition: [
        { field: "lfl.user_id", operator: "=", value: user_id },
        {
          orConditions: [
           { field: "lfl.source", operator: "IS", value: 'NULL', raw:true},
             {field: "lfl.source", operator: "NOT IN", value: "('WATI', 'EMAIL', 'PV', 'CV')", raw:true},
          ],
        },
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        { field: "lfl.follow_up_date", operator: ">=", value: 'CURDATE() - INTERVAL 30 DAY', raw:true }
        ],
      }
    ]);

    console.log(countData, 'count Data'); 

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Follow up fetched for the user",
      data: results || [],
      meta_data: countData
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  CallsBookedUserData,
  FuUserData,
  NAFICLReceivedUserData,
  OCLUserData,
  UpdateLeadDetailsUsers,
  actionAssignedUserData,
  atRiskUserData,
  callMissedUserData,
  clientWeightSeventyData,
  dietOverdueUserData,
  draftedDietUserData,
  draftedQueryUserData,
  finalFeedbackData,
  fuMissedUserData,
  getComUserData,
  goalData,
  goodLossData,
  halftimeFeedbackData,
  healthScoreData,
  howzMyDay,
  inchData,
  leadsAssignedUserData,
  leadsToCaptureUserData,
  lessLossData,
  linkSharedUserData,
  milestoneData,
  newAssignedUserData,
  notStarted,
  notStartedOverdueUserData,
  onholdOd,
  onholdToday,
  overDueMisses,
  paymentDetailsData,
  paymentLinkData,
  pendingDietUserData,
  photoData,
  pitchedButNoFuUserData,
  pitchedNotPitchedController,
  preAttemptedDietUserData,
  rateSharedData,
  rateSharedDataLead,
  referralData,
  salesOpportunity,
  stageWiseData,
  trackerAndFeedback,
  unansweredQueriesUserData,
  weightData,
  weightOverdueUserData,
  assessmentOdUserData,
  iclOdUserData,
  spinToWinDataList,
  updatePrizeComment,
  spinToWinLeadDataList,
  todayRiskAndMisses,
  howsMyDay,
  salesFollowupAndRisk,
  salesOpportunitys,
  dietFeedbackData,
  getNumberOfFormsFilled,
  leadsEngagementTodayUserData,
};
