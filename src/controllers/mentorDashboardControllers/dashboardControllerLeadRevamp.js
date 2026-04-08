import moment from "moment";
import { readRecord, readRecordUnion } from "../../config/query.js";
import {
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonSelectFields,
  mapLeadDataNew,
  readRecordNewForLead,
  withMap,
} from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { getCounsellorPerformance } from "../salesDashboardControllers/overviewController.js";

const leadsCount = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const counts = await readRecordUnion([
      // Target market leads assigned today
      // {
      //   selectField: [
      //     "COUNT(DISTINCT cd.user_id) AS count",
      //     "'target_market' AS type",
      //   ],
      //   table: `${tables.userDetails} cd`,
      //   join: [
      //     {
      //       type: "INNER",
      //       table: `${tables.leadAssignedLog} lal`,
      //       on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
      //     },
      //   ],
      //   condition: [
      //     { field: "cd.user_type", operator: "=", value: "0" },
      //     { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      //     {
      //       field: "lal.assign_date",
      //       operator: "=",
      //       value: "CURDATE()",
      //       raw: true,
      //     },
      //     {
      //       orConditions: [
      //         { field: "cd.current_phase", operator: "=", value: 4 },
      //         {
      //           field: "JSON_LENGTH(cd.health_conditions)",
      //           operator: ">",
      //           value: 0,
      //         },
      //         {
      //           field: "cd.country_id IS NOT NULL AND cd.country_id != 101",
      //           operator: "",
      //           value: "",
      //           raw: true,
      //         },
      //       ],
      //     },
      //   ],
      // },

      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'target_market' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
      
          // Latest health score
          {
            type: "LEFT",
            table: `(SELECT user_id, MAX(created) as latest_created
                     FROM bn_client_hs
                     WHERE is_deleted = 0
                     GROUP BY user_id) latest_hs`,
            on: "latest_hs.user_id = cd.user_id",
            raw: true,
          },
          {
            type: "LEFT",
            table: `bn_client_hs hs`,
            on: "hs.user_id = latest_hs.user_id AND hs.created = latest_hs.latest_created",
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
      
          {
            orConditions: [

              // Stage 4 (>7 kg difference)
              {
                field: "ABS(hs.weight_difference) >= 7",
                operator: "",
                value: "",
                raw: true,
              },
              { 
                field: "JSON_LENGTH(cd.health_conditions) > 0",
                operator: "",
                value: "",
                raw: true,
              },

              { 
                field: "JSON_LENGTH(hs.health_issue) > 0",
                operator: "",
                value: "",
                raw: true,
              },
              // NRI
              {
                field: "cd.country_id != 101",
                operator: "",
                value: "",
                raw: true,
              }
      
            ],
          },
        ],
      },

      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'non_target_market' AS type",
        ],
      
        table: `${tables.userDetails} cd`,
      
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
      
          // ✅ LEFT JOIN latest HS (important)
          {
            type: "LEFT",
            table: `(SELECT user_id, MAX(id) as latest_id
                     FROM bn_client_hs
                     WHERE is_deleted = 0
                     GROUP BY user_id) latest_hs`,
            on: "latest_hs.user_id = cd.user_id",
            raw: true,
          },
          {
            type: "LEFT",
            table: `bn_client_hs hs`,
            on: "hs.id = latest_hs.latest_id",
          },
        ],
      
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
      
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
      
          // ✅ NON TARGET MARKET LOGIC (exact inverse of TM)
          {
            field: `
            (
                (
                  hs.user_id IS NULL
                  AND JSON_LENGTH(IFNULL(cd.health_conditions, JSON_ARRAY())) = 0
                  AND (cd.country_id IS NULL OR cd.country_id = 101)
                )
                OR
                (
                  hs.user_id IS NOT NULL
                  AND ABS(hs.weight_difference) < 7
                  AND JSON_LENGTH(IFNULL(hs.health_issue, JSON_ARRAY())) = 0
                  AND JSON_LENGTH(IFNULL(cd.health_conditions, JSON_ARRAY())) = 0
                  AND (cd.country_id IS NULL OR cd.country_id = 101)
                )
              )
            `,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
               
      // Referral leads added today
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'referrals' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} rud`,
            on: "cd.referred_by = rud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.current_lead_source", operator: "IN", value: [22,23] },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },

      // Direct leads assigned today
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'direct_leads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadSource} ls`,
            on: "cd.current_lead_source = ls.source_id",
          },
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "ls.source_group", operator: "=", value: "4" },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },

      // Social media leads assigned today
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'social_media' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadSource} ls`,
            on: "cd.current_lead_source = ls.source_id",
          },
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "ls.source_group", operator: "=", value: "3" },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },
      // old hot lead reassigned today
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'hot_OL' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.sales_status", operator: "=", value: "2" },
          {
            field: "YEAR(cd.added_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "MONTH(cd.added_date)",
            operator: "<",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "lal.assign_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      // old warm lead reassigned today
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'warm_OL' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.sales_status", operator: "=", value: "3" },
          {
            field: "YEAR(cd.added_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "MONTH(cd.added_date)",
            operator: "<",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "lal.assign_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },

      // OCR leads reassigned today
      {
        selectField: ["COUNT(DISTINCT cd.user_id) AS count", "'ocr' AS type"],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.changeOfMentor} com`,
            on: `cd.user_id = com.user_id AND com.new_mentor = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(com.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Leads count fetched successfully",
      data: counts.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching count in leadCount", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ongoingChallengeCount = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const counts = await readRecordUnion([

      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'total_participants' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
          { field: "cd.current_lead_source", operator: "=", value: "78" },
      
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'active_participants' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
          
          { field: "cd.current_lead_source", operator: "=", value: "78" },
          {field:"DATE(cd.app_last_visit_date)",operator:"=",value:"CURDATE()",raw:true}
      
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'inactive_participants' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
          
          { field: "cd.current_lead_source", operator: "=", value: "78" },
          {
            field: "DATE(cd.app_last_visit_date)",
            operator: "<=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true
          }
      
        ],
      },
    ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Leads count fetched successfully",
      data: counts.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching count in ongoing challenge", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const followUpsAndCallsCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const counts = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'consultation' as type",
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "=", value: "30" },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = cu.user_id",
          },
        ],
      },
      {
        table: `${tables.leadFollowUpLogs} fu`,
        selectField: [
          "COUNT(DISTINCT fu.user_id) as count",
          "'followup_calls' as type",
        ],
        condition: [
          {
            field: "DATE(fu.follow_up_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "fu.follow_up_status",
            operator: "=",
            value: "0",
            raw: true,
          },
          { field: "fu.assigned_to", operator: "=", value: mentor_id },
          { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
          { field: "fu.type", operator: "=", value: "0" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = fu.user_id",
          },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.user_id) as count",
          "'engagement_calls' as type",
        ],
        condition: [
          {
            field: "lel.engagement_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "lel.status",
            operator: "=",
            value: "0",
            raw: true,
          },
          { field: "lel.assigned_to", operator: "=", value: mentor_id },
          { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
          { field: "lel.type", operator: "=", value: "0" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
      },
      {
        table: `${tables.leadFollowUpLogs} fu`,
        selectField: [
          "COUNT(DISTINCT fu.user_id) as count",
          "'WA_followup' as type",
        ],
        condition: [
          {
            field: "fu.follow_up_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "fu.follow_up_status",
            operator: "=",
            value: "0",
            raw: true,
          },
          { field: "fu.assigned_to", operator: "=", value: mentor_id },
          { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
          { field: "fu.type", operator: "=", value: "1" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = fu.user_id",
          },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.user_id) as count",
          "'WA_engagement' as type",
        ],
        condition: [
          {
            field: "lel.engagement_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "lel.status",
            operator: "=",
            value: "0",
            raw: true,
          },
          { field: "lel.assigned_to", operator: "=", value: mentor_id },
          { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
          { field: "lel.type", operator: "=", value: "1" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Follow ups and calls counts fetched successfully",
      data: counts.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching counts in followUpsAndCallsCounts",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const criticalResponsesCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const userIds = await clientEnquiry.distinct("user_id", {
      mentor_id: parseInt(mentor_id),
      sender: "client",
      type: "query",
    });
    let unanswered_queries = 0;
    if (userIds.length > 0) {
      const { results: filteredUsers } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          { field: "ud.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_id", operator: "IN", value: userIds },
        ],
      });

      unanswered_queries = filteredUsers.length;
    }
    const counts = await readRecordUnion([
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(DISTINCT od.user_id) as count",
          "'balance_due_today' as type",
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: parseInt(mentor_id) },
          {
            field: "od.due_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "od.order_balance_amount", operator: ">", value: 0 },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'payment_due_today' as type",
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "cd.payment_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },
    ]);
    const finatData = {};
    counts.forEach((item, index) => {
      if (index === 0) {
        finatData["unanswered_queries"] = unanswered_queries;
      }
      finatData[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Critical responses counts fetched successfully",
      data: finatData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching counts in criticalResponses:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const riskAndMissesLeadsCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const counts = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'TM_missed' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cd.user_id = cu.user_id`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.sales_status", operator: "=", value: '0' },
          {
            orConditions: [
              { field: "cd.current_phase", operator: "=", value: 4 },
              {
                field: "JSON_LENGTH(cd.health_conditions)",
                operator: ">",
                value: 0,
              },
              {
                field: "cd.country_id IS NOT NULL AND cd.country_id != 101",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
          { field: " cu.call_id", operator: "IS", value: "NULL", raw: true },
          {
            field: "MONTH(cd.added_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(cd.added_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "DATE(cd.added_date)",
            operator: "<=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'direct_missed' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadSource} ls`,
            on: "cd.current_lead_source = ls.source_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cd.user_id = cu.user_id`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "ls.source_group", operator: "=", value: "4" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          { field: "cd.sales_status", operator: "=", value: '0' },
          {
            field: "MONTH(cd.added_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(cd.added_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "DATE(cd.added_date)",
            operator: "<=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'SM_missed' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadSource} ls`,
            on: "cd.current_lead_source = ls.source_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cd.user_id = cu.user_id`,
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "ls.source_group", operator: "=", value: "3" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: " cu.call_id", operator: "IS", value: "NULL", raw: true },
          { field: "cd.sales_status", operator: "=", value: '0' },
          {
            field: "MONTH(cd.added_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(cd.added_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "DATE(cd.added_date)",
            operator: "<=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Risk and missed leads counts fetched successfully",
      data: counts.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching counts in riskAndMissesLeadsCounts:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const riskAndMissesCriticalFollowUps = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const counts = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'consultation_missed' as type",
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "=", value: "30" },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
          {
            field: "MONTH(cu.schedule_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(cu.schedule_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = cu.user_id",
          },
        ],
      },
    
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(DISTINCT od.user_id) as count",
          "'balance_overdue' as type",
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: parseInt(mentor_id) },
          {
            field: "od.due_date",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          { field: "od.order_balance_amount", operator: ">", value: 0 },
          {
            field: "MONTH(od.due_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(od.due_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'payment_overdue' as type",
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "cd.payment_date",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },

          {
            field: "MONTH(cd.payment_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(cd.payment_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Risk and misses critical follow ups counts fetched successfully",
      data: counts.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching count in riskAndMissesCriticalFollowUps:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const riskAndMissesToNurtureCount = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const counts = await readRecordUnion([
      // non target market leads
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'non_target_market_lead' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.current_phase", operator: "!=", value: 4 },
          {
            field: "JSON_LENGTH(cd.health_conditions)",
            operator: "=",
            value: 0,
          },
          {
            field: "cd.country_id",
            operator: "=",
            value: "101",
          },
        ],
      },
      // build faith leads
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'build_faith' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "cd.sub_sales_status",
            operator: "IN",
            value: ["Build faith/trust", "Build Trust/Faith"],
          },
        ],
      },
      // just for knowledge leads
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'just_for_knowledge' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "cd.sub_sales_status",
            operator: "=",
            value: "Just for knowledge",
          },
        ],
      },
      // basic stack leads
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'basic_stack' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "cd.sub_sales_status",
            operator: "IN",
            value: ["for basic stack", "Not for Special Stac"],
          },
        ],
      },
      // wallet above 3000 leads
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'wallet_above_3000' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.my_wallet", operator: ">", value: 3000 },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "To Nurture Counts fetched successfully",
      data: counts.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching To Nurture Counts:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};



const challengeParticipantsLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
          { field: "cd.current_lead_source", operator: "=", value: "78" },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Direct Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Direct Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const challengeActiveParticipantsLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
          
          { field: "cd.current_lead_source", operator: "=", value: "78" },
          {field:"DATE(cd.app_last_visit_date)",operator:"=",value:"CURDATE()",raw:true}
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Direct Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Direct Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const challengeInactiveParticipantsLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
          
          { field: "cd.current_lead_source", operator: "=", value: "78" },
          {
            field: "DATE(cd.app_last_visit_date)",
            operator: "<=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true
          }
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Direct Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Direct Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const targetMarketLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;

    const { results: data, totalCount } = await readRecordNewForLead({

      selectFields: [...getCommonSelectFields()],

      table: `${tables.userDetails} cd`,

      joins: [
        ...getCommonJoins(),

        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },

        // 🔥 Latest Health Score (safe MAX(id) version)
        {
          type: "LEFT",
          table: `(SELECT user_id, MAX(id) as latest_id
                   FROM bn_client_hs
                   WHERE is_deleted = 0
                   GROUP BY user_id) latest_hs`,
          on: "latest_hs.user_id = cd.user_id",
          raw: true,
        },
        {
          type: "LEFT",
          table: `bn_client_hs hs`,
          on: "hs.id = latest_hs.latest_id",
        },
      ],

      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },

        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },

        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },

        // 🔥 TARGET MARKET LOGIC
        {
          field: `
            (
              ABS(IFNULL(hs.weight_difference,0)) > 15
              OR JSON_LENGTH(cd.health_conditions) > 0
              OR cd.country_id != 101
              OR (
                  hs.gender = 'female'
                  AND hs.age BETWEEN 21 AND 30
                  AND ABS(IFNULL(hs.weight_difference,0)) <= 7
              )
            )
          `,
          operator: "",
          value: "",
          raw: true,
        },
      ],

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

    const finalData = data.map((item) => {
      return mapLeadDataNew({
        details: item,
      });
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Target Market data fetched successfully",
      data: finalData,
      totalCount,
    });

    return res.status(200).json(apiResponse);

  } catch (error) {
    console.log("Error while fetching Target Market data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};


const referralLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "LEFT",
          table: `${tables.userDetails} rud`,
          on: "cd.referred_by = rud.user_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        {
          field: "rud.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.current_lead_source", operator: "=", value: 22 },
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "lal.assign_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Referral Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Referral Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const directLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "ls.source_group", operator: "=", value: "4" },
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Direct Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Direct Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const socialMediaLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "ls.source_group", operator: "=", value: "3" },
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Social Media Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Social Media Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const hSLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "ls.source_group", operator: "=", value: "1" },
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "HS Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Social Media Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const hotOldLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cd.sales_status", operator: "=", value: "2" },
        {
          field: "YEAR(cd.added_date)",
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
        {
          field: "MONTH(cd.added_date)",
          operator: "<",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: "lal.assign_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Hot Old Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Hot Old Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const warmOldLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cd.sales_status", operator: "=", value: "3" },
        {
          field: "YEAR(cd.added_date)",
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
        {
          field: "MONTH(cd.added_date)",
          operator: "<",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: "lal.assign_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Warm Old Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Warm Old Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ocrData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.changeOfMentor} com`,
          on: `cd.user_id = com.user_id AND com.new_mentor = ${mentor_id}`,
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
        {
          field: "DATE(com.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OCR Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching OCR Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const consultationLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
        { field: "cu.call_status", operator: "=", value: 0 },
        { field: "cu.call_type", operator: "=", value: "30" },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Consultation Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Consultation Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const followUpCallsLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.leadFollowUpLogs} fu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = fu.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "fu.follow_up_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "fu.follow_up_status",
          operator: "=",
          value: "0",
          raw: true,
        },
        { field: "fu.assigned_to", operator: "=", value: mentor_id },
        { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
        { field: "fu.type", operator: "=", value: "0" },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Follow Up Calls Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Follow Up Calls Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const engagementCallsLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lel.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "lel.engagement_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "lel.status",
          operator: "=",
          value: "0",
          raw: true,
        },
        { field: "lel.assigned_to", operator: "=", value: mentor_id },
        { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
        { field: "lel.type", operator: "=", value: "0" },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Engagement Calls Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Engagement Calls Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const whatsappFollowUpLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.leadFollowUpLogs} fu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = fu.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "fu.follow_up_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "fu.follow_up_status",
          operator: "=",
          value: "0",
          raw: true,
        },
        { field: "fu.assigned_to", operator: "=", value: mentor_id },
        { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
        { field: "fu.type", operator: "=", value: "1" },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "WhatsApp Follow-Up Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching WhatsApp Follow-Up Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const whatsappEngagementLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lel.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "lel.engagement_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "lel.status",
          operator: "=",
          value: "0",
          raw: true,
        },
        { field: "lel.assigned_to", operator: "=", value: mentor_id },
        { field: "cd.user_status", operator: "IN", value: ['Lead','Completed','Active'] },
        { field: "lel.type", operator: "=", value: "1" },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "WhatsApp Engagement Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching WhatsApp Engagement Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const unansweredQueriesLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;

    // Step 1: Efficient MongoDB Aggregation with mentor_id filter
    const chatDocsRaw = await clientEnquiry.aggregate([
      {
        $match: {
          type: "query",
          mentor_id: parseInt(mentor_id),
        },
      },
      {
        $sort: { createdAt: 1 }, // oldest query first
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
          createdAt: "$latestDoc.createdAt",
        },
      },
    ]);

    if (!chatDocsRaw.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No unanswered queries found",
          data: [],
          meta_data: [],
        }),
      );
    }

    // Step 2: Map for O(1) lookups later
    const chatMap = new Map();
    const userIds = [];
    chatDocsRaw.sort((a, b) => a.createdAt - b.createdAt);
    chatDocsRaw.forEach((doc) => {
      const userIdStr = String(doc.user_id);
      chatMap.set(userIdStr, doc);
      userIds.push(doc.user_id);
    });

    // Step 3: Query from userDetails using userIds
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "cd.user_id",
          operator: "IN",
          value: userIds,
        },
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
      ],
      orderBy: [`FIELD(cd.user_id, ${userIds.join(", ")})`],
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

    // Step 4: Map result data with query details
    const finalData = data.map((item) => {
      const chat = chatMap.get(String(item.user_id));
      return mapLeadDataNew({
        details: item,
        extraMappings: {
          query_details: {
            query_id: chat?._id || "N/A",
            query: chat?.query || "No query available",
            query_time: chat?.createdAt
              ? `${moment(chat.createdAt).format("DD-MM-YYYY")} (${moment(
                  chat.createdAt,
                ).format("hh:mm A")})`
              : "N/A",
          },
        },
      });
    });

    // Step 5: Send response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Unanswered Queries Leads data fetched successfully",
      data: finalData,
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in unansweredQueriesLeadsData controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const balanceDueData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = od.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: parseInt(mentor_id) },
        {
          field: "od.due_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Balance Due data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Balance Due data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const paymentDueData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.payment_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Due data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Payment Due data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// leads 1st call not done yet
// targetMarketMissedLeadsData
const targetMarketMissedLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `cd.user_id = cu.user_id`,
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cd.sales_status", operator: "=", value: '0' },
        {
          field: "MONTH(cd.added_date)",
          operator: "=",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: "YEAR(cd.added_date)",
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
        {
          orConditions: [
            { field: "cd.current_phase", operator: "=", value: 4 },
            {
              field: "JSON_LENGTH(cd.health_conditions)",
              operator: ">",
              value: 0,
            },
            {
              field: "cd.country_id IS NOT NULL AND cd.country_id != 101",
              operator: "",
              value: "",
              raw: true,
            },
          ],
        },
        { field: " cu.call_id", operator: "IS", value: "NULL", raw: true },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Target Market Missed data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Target Market Missed data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// directMissedLeadsData
const directMissedLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `cd.user_id = cu.user_id`,
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "ls.source_group", operator: "=", value: "4" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Direct Missed data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Direct Missed data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// socialMediaMissedLeadsData
const socialMediaMissedLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.current_lead_source = ls.source_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: `cd.user_id = cu.user_id`,
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "ls.source_group", operator: "=", value: "3" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Social Media Missed data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Social Media Missed data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// critical follow-ups and risks data api
// Consultation Missed
const consultationMissedLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "DATE(cu.schedule_date)",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
        { field: "cu.call_status", operator: "=", value: 0 },
        { field: "cu.call_type", operator: "=", value: "30" },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Consultation Missed data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Consultation Missed data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// hot follow up missed
const hotFUMissedLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "next_fu.follow_up_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "next_fu.follow_up_status",
          operator: "=",
          value: "0",
          raw: true,
        },
        { field: "next_fu.assigned_to", operator: "=", value: mentor_id },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "next_fu.type", operator: "=", value: "0" },
        { field: "cd.sales_status", operator: "=", value: "2" },
      ],
    });
    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Hot Follow-Up Missed data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Hot Follow-Up Missed data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// warm follow up missed
const warmFUMissedLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "next_fu.follow_up_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "next_fu.follow_up_status",
          operator: "=",
          value: "0",
          raw: true,
        },
        { field: "next_fu.assigned_to", operator: "=", value: mentor_id },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "next_fu.type", operator: "=", value: "0" },
        { field: "cd.sales_status", operator: "=", value: "3" },
      ],
    });
    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Warm Follow-Up Missed data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Warm Follow-Up Missed data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// balance overdue data
const balanceOverdueData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = od.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: parseInt(mentor_id) },
        {
          field: "od.due_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Balance Overdue data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Balance Overdue data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const paymentOverdueData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.payment_date",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
            field: "MONTH(cd.payment_date)",
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: "YEAR(cd.payment_date)",
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Overdue data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Payment Overdue data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// nonTargetMarketLeadsData
const nonTargetMarketLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: `
          (
            -- Case 1: No Health Score
            hs.user_id IS NULL
    
            OR
    
            -- Case 2: Has HS but does NOT match TM
            (
              ABS(IFNULL(hs.weight_difference,0)) < 7
              AND JSON_LENGTH(IFNULL(cd.health_conditions, JSON_ARRAY())) = 0
              AND (cd.country_id IS NULL OR cd.country_id = 101)
            )
          )
          `,
          operator: "",
          value: "",
          raw: true,
        }
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Non Target Market data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Non Target Market data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// build faith leads data
const buildFaithLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: "cd.sub_sales_status",
          operator: "IN",
          value: ["Build faith/trust", "Build Trust/Faith"],
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Build Faith Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Build Faith Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// just for knowledge leads data
const justForKnowledgeLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: "cd.sub_sales_status",
          operator: "=",
          value: "Just for knowledge",
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Just for Knowledge Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Just for Knowledge Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// Basic stack leads data
const basicStackLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: "cd.sub_sales_status",
          operator: "IN",
          value: ["for basic stack", "Not for Special Stac"],
        },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Basic Stack Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Basic Stack Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// Basic stack leads data
const walletAbove3000LeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cd.my_wallet", operator: ">", value: 3000 },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wallet Above 3000 Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Wallet Above 3000 Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// build your bucket section
// build your bucket count
const buildYourBucketCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const counts = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'target_market_leads' AS type",
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            orConditions: [
              { field: "cd.current_phase", operator: "=", value: 4 },
              {
                field: "JSON_LENGTH(cd.health_conditions)",
                operator: ">",
                value: 0,
              },
              {
                field: "cd.country_id IS NOT NULL AND cd.country_id != 101",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'leads_without_app' as type",
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.device", operator: "IS", value: "NULL", raw: true },
          { field: "cd.app_version", operator: "IS", value: "NULL", raw: true },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'phase_3/4_leads' as type",
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "cd.current_phase",
            operator: "IN",
            value: [3, 4],
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'previously_hot_leads' as type",
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "cd.sales_status",
            operator: "=",
            value: "2",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'previously_warm_leads' as type",
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "cd.sales_status",
            operator: "=",
            value: "3",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'old_campaign_lead' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.campaigns} cam`,
            on: "cd.primary_lead_source = cam.type AND cam.end_date < CURDATE()",
          },
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Build Your Bucket counts fetched successfully",
      data: counts.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Build Your Bucket counts:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const targetMarketBucketLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;

    const { results, totalCount } = await readRecordNewForLead({
      // ✅ keeps latest_health CTE
      withQueries: [...withMap.get("latest_health")],

      selectFields: [...getCommonSelectFields()],

      table: `${tables.userDetails} cd`,

      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],

      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },

        // ✅ assigned today
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },

        // ✅ Target Market logic (uses latest_health CTE fields)
        {
          field: `
            (
              ABS(IFNULL(latest_health.weight_difference,0)) >= 7
              OR JSON_LENGTH(cd.health_conditions) > 0
              OR cd.country_id != 101
              OR JSON_LENGTH(latest_health.health_issue) > 0
            )
          `,
          operator: "",
          value: "",
          raw: true,
        },
      ],

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

    const finalData = results.map((item) =>
      mapLeadDataNew({
        details: item,
      })
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Target Market Bucket Leads data fetched successfully",
      data: finalData,
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Target Market Bucket Leads data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};


const nonTargetMarketBucketLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;

    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],

      selectFields: [...getCommonSelectFields()],

      table: `${tables.userDetails} cd`,

      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND lal.counsellor_id = ${mentor_id}`,
        },
      ],

      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },

        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },

        // ✅ CLEAN NON-TM LOGIC
        {
          field: `
          (
                (
                  latest_health.user_id IS NULL
                  AND JSON_LENGTH(IFNULL(cd.health_conditions, JSON_ARRAY())) = 0
                  AND (cd.country_id IS NULL OR cd.country_id = 101)
                )
                OR
                (
                  latest_health.user_id IS NOT NULL
                  AND ABS(latest_health.weight_difference) < 7
                  AND JSON_LENGTH(IFNULL(latest_health.health_issue, JSON_ARRAY())) = 0
                  AND JSON_LENGTH(IFNULL(cd.health_conditions, JSON_ARRAY())) = 0
                  AND (cd.country_id IS NULL OR cd.country_id = 101)
                )
              )
          `,
          operator: "",
          value: "",
          raw: true,
        },
      ],

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

    const finalData = results.map((item) =>
      mapLeadDataNew({ details: item })
    );

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Non Target Market & No Health Score Leads fetched successfully",
        data: finalData,
        totalCount,
      })
    );

  } catch (error) {
    console.log("Error while fetching Non Target Market Leads:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};




const leadsWithoutAppBucketData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.device", operator: "IS", value: "NULL", raw: true },
        { field: "cd.app_version", operator: "IS", value: "NULL", raw: true },
      ],
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
      message: "Lead without App Bucket data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadWithoutAppBucket controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const phaseBucketLeadsData = async (req, res, next) => {
  try {
    const { mentor_id, phase, search, page = 1, limit = 50 } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],

      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        phase
          ? {
              field: "cd.current_phase",
              operator: "=",
              value: phase,
            }
          : {
              field: "cd.current_phase",
              operator: "IN",
              value: [3, 4],
            },
      ],
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
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Phase ${phase || "3 and 4"} Bucket Leads data fetched successfully`,
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in phaseBucketLeadsData controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const previouslyHotLeadBucketData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.sales_status",
          operator: "=",
          value: "2",
        },
      ],
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Previously Hot Lead Bucket Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching Previously Hot Lead Bucket Leads data:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const previouslyWarmLeadsBucketData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.sales_status",
          operator: "=",
          value: "3",
        },
      ],
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Previously Warm Lead Bucket Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching Previously Warm Lead Bucket Leads data:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const oldCampaignLeadsBucketData = async (req, res, next) => {
  try {
    const { mentor_id, search, page = 1, limit = 50 } = req.body;
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.campaigns} cam`,
          on: "cd.primary_lead_source = cam.type AND cam.end_date < CURDATE()",
        },
      ],
      conditions: [
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" },
      ],
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: " Old Campaign Leads Bucket data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Old Campaign Leads Bucket data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

// activities done section api's
// captured leads count
const activitiesCapturedLeadsCount = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT CASE WHEN ls.source_group = 4 AND DATE(lal.assign_date) = CURDATE() THEN cd.user_id END) AS direct_leads_today",
        "COUNT(DISTINCT CASE WHEN ls.source_group = 4 THEN cd.user_id END) AS direct_leads_month",

        "COUNT(DISTINCT CASE WHEN ls.source_group = 3 AND DATE(lal.assign_date) = CURDATE() THEN cd.user_id END) AS social_media_leads_today",
        "COUNT(DISTINCT CASE WHEN ls.source_group = 3 THEN cd.user_id END) AS social_media_leads_month",

        "COUNT(DISTINCT CASE WHEN ls.source_id = 32 AND DATE(lal.assign_date) = CURDATE() THEN cd.user_id END) AS app_leads_today",
        "COUNT(DISTINCT CASE WHEN ls.source_id = 32 THEN cd.user_id END) AS app_leads_month",

        "COUNT(DISTINCT CASE WHEN ls.source_group = 1 AND DATE(lal.assign_date) = CURDATE() THEN cd.user_id END) AS hs_leads_today",
        "COUNT(DISTINCT CASE WHEN ls.source_group = 1 THEN cd.user_id END) AS hs_leads_month",

        "COUNT(DISTINCT CASE WHEN ls.source_group = 5 AND DATE(lal.assign_date) = CURDATE() THEN cd.user_id END) AS referral_leads_today",
        "COUNT(DISTINCT CASE WHEN ls.source_group = 5 THEN cd.user_id END) AS referral_leads_month",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.counsellor_assigned = lal.counsellor_id and cd.user_id = lal.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: "DATE(lal.assign_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Captured Leads Count fetched successfully",
      data: results[0],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Captured Leads Count:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const activitiesCallsAndFollowUpsCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "COUNT(DISTINCT CASE WHEN cu.call_type = '14' AND DATE(cu.schedule_date) = CURDATE() AND cu.call_status = 1 THEN cu.call_id END) AS follow_up_calls_today",
        "COUNT(DISTINCT CASE WHEN cu.call_type = '14' AND cu.call_status = 1 THEN cu.call_id END) AS follow_up_calls_month",
        "COUNT(DISTINCT CASE WHEN cu.call_type = '45' AND DATE(cu.schedule_date) = CURDATE() AND cu.call_status = 1 THEN cu.call_id END) AS engagment_calls_today",
        "COUNT(DISTINCT CASE WHEN cu.call_type = '45' AND cu.call_status = 1 THEN cu.call_id END) AS engagment_calls_month",
        "COUNT(DISTINCT CASE WHEN cu.call_status = 1 AND cu.call_type IN ('14','45') AND DATE(cu.schedule_date) = CURDATE() THEN cu.call_id END) AS completed_calls_today",
        "COUNT(DISTINCT CASE WHEN cu.call_status = 1 AND cu.call_type IN ('14','45') THEN cu.call_id END) AS completed_calls_month",
        "COUNT(DISTINCT CASE WHEN cu.call_status NOT IN (0,1) AND cu.call_type IN ('14','45') AND DATE(cu.schedule_date) = CURDATE() THEN cu.call_id END) AS attempted_calls_today",
        "COUNT(DISTINCT CASE WHEN cu.call_status NOT IN (0,1) AND cu.call_type IN ('14','45') THEN cu.call_id END) AS attempted_calls_month",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        { field: "cd.user_status", operator: "!=", value: 'Active'},
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Activities Calls and Follow-Ups Counts fetched successfully",
      data: results[0],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching Activities Calls and Follow-Ups Counts:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const activitiesConsultationCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "COUNT(DISTINCT cu.call_id) AS consultation_calls_month",
        "COUNT(DISTINCT CASE WHEN DATE(cu.schedule_date) = CURDATE() THEN cu.call_id END) AS consultation_calls_today",
        "COUNT(DISTINCT CASE WHEN LOWER(cu.source) = 'db' AND DATE(cu.schedule_date) = CURDATE() THEN cu.call_id END) AS booked_by_counsellor_today",
        "COUNT(DISTINCT CASE WHEN LOWER(cu.source) = 'db' THEN cu.call_id END) AS booked_by_counsellor_month",
        "COUNT(DISTINCT CASE WHEN LOWER(cu.source) != 'db' AND DATE(cu.schedule_date) = CURDATE() THEN cu.call_id END) AS booked_by_user_today",
        "COUNT(DISTINCT CASE WHEN LOWER(cu.source) != 'db' THEN cu.call_id END) AS booked_by_user_month",
        "COUNT(DISTINCT CASE WHEN cu.call_status = 1 AND DATE(cu.schedule_date) = CURDATE() THEN cu.call_id END) AS consultation_done_today",
        "COUNT(DISTINCT CASE WHEN cu.call_status = 1 THEN cu.call_id END) AS consultation_done_month",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
        { field: "cu.call_type", operator: "=", value: "30" },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Activities Consultation Counts fetched successfully",
      data: results[0],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Activities Consultation Counts:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const activitiesConversationCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const endOfMonth = moment().endOf("day").format("YYYY-MM-DD");
    const counts = await readRecordUnion([
      {
        table: `${tables.leadFollowUpLogs} lfu`,
        selectField: [
          "COUNT(DISTINCT lfu.follow_up_id) AS month_count",
          "COUNT(DISTINCT CASE WHEN DATE(lfu.follow_up_date) = CURDATE() THEN lfu.follow_up_id END) AS today_count",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lfu.user_id",
          },
        ],
        condition: [
          { field: "lfu.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lfu.follow_up_date",
            operator: "BETWEEN",
            value: [`'${startOfMonth}'`, `'${endOfMonth}'`],
            raw: true,
          },
          { field: "lfu.type", operator: "=", value: "1" },
          { field: "lfu.follow_up_status", operator: "=", value: 1 },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.id) AS month_count",
          "COUNT(DISTINCT CASE WHEN DATE(lel.engagement_date) = CURDATE() THEN lel.id END) AS today_count",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
        condition: [
          { field: "lel.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lel.engagement_date",
            operator: "BETWEEN",
            value: [`'${startOfMonth}'`, `'${endOfMonth}'`],
            raw: true,
          },
          { field: "lel.type", operator: "=", value: "1" },
          { field: "lel.status", operator: "=", value: 1 },
        ],
      },
    ]);
    console.log(counts, 2345);
    const startDate = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const chatCounts = await clientEnquiry.aggregate([
      {
        $match: {
          mentor_id: parseInt(mentor_id),
          createdAt: { $gte: startDate, $lte: new Date() },
          type: { $ne: "clara" },
          sender: "client",
        },
      },
      {
        $group: {
          _id: null,

          monthly_count: {
            $sum: 1,
          },

          today_count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$createdAt", todayStart] },
                    { $lte: ["$createdAt", todayEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          monthly_count: 1,
          today_count: 1,
        },
      },
    ]);
    console.log(chatCounts, 3457);
    const chatData = chatCounts[0] || { monthly_count: 0, today_count: 0 };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Activities Conversion Counts fetched successfully",
      data: {
        whatsapp_follow_ups_month: counts[0].month_count,
        whatsapp_follow_ups_today: counts[0].today_count,
        whatsapp_engagement_month: counts[1].month_count,
        whatsapp_engagement_today: counts[1].today_count,
        client_enquiries_month: chatData.monthly_count,
        client_enquiries_today: chatData.today_count,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Activities Conversion Counts:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};


const dailyRunRateStats = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const stats = await readRecordUnion([

      // 1️⃣ Avg Daily Leads (Current Month)
      {
        selectField: [
          "ROUND(COUNT(DISTINCT cd.user_id) / DAY(CURDATE())) AS count",
          "'avg_daily_leads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "cd.added_date",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
        ],
      },

      // 2️⃣ Daily Consultations (Avg This Month)
      {
        selectField: [
          "ROUND(COUNT(*) / DAY(CURDATE())) AS count",
          "'daily_consultations' AS type",
        ],
        table: `${tables.callUpdates} cu`,
        condition: [
          { field: "cu.call_type", operator: "=", value: "30" },
          { field: "cu.call_status", operator: "=", value: "1" },
          { field: "cu.added_by", operator: "=", value: mentor_id },
          {
            field: "cu.schedule_date",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
        ],
      },

      // 3️⃣ Daily Followup Calls (Avg This Month)
      {
        selectField: [
          "ROUND(COUNT(*) / DAY(CURDATE())) AS count",
          "'daily_followups' AS type",
        ],
        table: `${tables.leadFollowUpLogs} lf`,
        condition: [
          { field: "lf.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lf.follow_up_date",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
        ],
      },

      // 4️⃣ Daily WA / Chat (Avg This Month)
      {
        selectField: [
          "ROUND(COUNT(*) / DAY(CURDATE())) AS count",
          "'daily_wa_chat' AS type",
        ],
        table: `${tables.callUpdates} cu`,
        condition: [
          { field: "cu.call_type", operator: "=", value: "40" }, // adjust if WA type different
          { field: "cu.added_by", operator: "=", value: mentor_id },
          {
            field: "cu.schedule_date",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
        ],
      },

      // 5️⃣ Daily Avg Sales (This Month)
      {
        selectField: [
          "ROUND(COUNT(*) / DAY(CURDATE())) AS count",
          "'daily_avg_sales' AS type",
        ],
        table: `${tables.orderDetails} od`,
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "od.created_at",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
        ],
      },

      // 6️⃣ Avg Sale Value (This Month)
      {
        selectField: [
          "ROUND(AVG(od.order_paid_amount),2) AS count",
          "'avg_sale_value' AS type",
        ],
        table: `${tables.orderDetails} od`,
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "od.created_at",
            operator: ">=",
            value: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            raw: true,
          },
        ],
      },

    ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Mentor dashboard stats fetched successfully",
      data: stats.reduce((acc, item) => {
        acc[item.type] = parseFloat(item.count || 0);
        return acc;
      }, {}),
    });

    return res.status(200).json(apiResponse);

  } catch (error) {
    console.log("Error while fetching dashboard stats", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};


const salesPerformanceStats = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const stats = await readRecordUnion([

      // 1️⃣ Avg Calls Per Sale
      {
        selectField: [
          `
          ROUND(AVG(total_calls),2) AS count
          `,
          "'avg_calls_per_sale' AS type",
        ],
        table: `
          (
            SELECT 
              cd.user_id,
              COUNT(DISTINCT cu.id) AS total_calls
            FROM ${tables.userDetails} cd
            INNER JOIN ${tables.orderDetails} od 
              ON od.user_id = cd.user_id
              AND od.sale_by = ${mentor_id}
            LEFT JOIN ${tables.callUpdates} cu 
              ON cu.user_id = cd.user_id
              AND cu.call_type = '30'
              AND cu.call_status = '1'
              AND cu.schedule_date <= od.created_at
            WHERE cd.counsellor_assigned = ${mentor_id}
            GROUP BY cd.user_id
          ) t
        `,
        raw: true,
      },

      // 2️⃣ Avg Days For A Sale
      {
        selectField: [
          `
          ROUND(AVG(DATEDIFF(od.created_at, cd.added_date)),2) AS count
          `,
          "'avg_days_for_sale' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: `od.user_id = cd.user_id AND od.sale_by = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },

      // 3️⃣ Avg Engagement Per Sale (Calls as engagement)
      {
        selectField: [
          `
          ROUND(AVG(total_engagement),2) AS count
          `,
          "'avg_engagement_per_sale' AS type",
        ],
        table: `
          (
            SELECT 
              cd.user_id,
              COUNT(DISTINCT cu.id) AS total_engagement
            FROM ${tables.userDetails} cd
            INNER JOIN ${tables.orderDetails} od 
              ON od.user_id = cd.user_id
              AND od.sale_by = ${mentor_id}
            LEFT JOIN ${tables.callUpdates} cu 
              ON cu.user_id = cd.user_id
              AND cu.schedule_date <= od.created_at
            WHERE cd.counsellor_assigned = ${mentor_id}
            GROUP BY cd.user_id
          ) e
        `,
        raw: true,
      },

      // 4️⃣ Avg Days To Close Consultation
      {
        selectField: [
          `
          ROUND(
            AVG(DATEDIFF(od.created_at, first_consult.first_date))
          ,2) AS count
          `,
          "'avg_days_to_close_consultation' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: `od.user_id = cd.user_id AND od.sale_by = ${mentor_id}`,
          },
          {
            type: "INNER",
            table: `
              (
                SELECT user_id, MIN(schedule_date) AS first_date
                FROM ${tables.callUpdates}
                WHERE call_type = '30'
                AND call_status = '1'
                GROUP BY user_id
              ) first_consult
            `,
            on: `first_consult.user_id = cd.user_id`,
            raw: true,
          },
        ],
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },

      // 5️⃣ L : C Ratio
      {
        selectField: [
          `
          ROUND(
            (
              COUNT(DISTINCT CASE WHEN cu.call_type = '30' AND cu.call_status = '1' THEN cd.user_id END)
              / COUNT(DISTINCT cd.user_id)
            ) * 100
          ,2) AS count
          `,
          "'lead_to_consult_ratio' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },

      // 6️⃣ L : S Ratio
      {
        selectField: [
          `
          ROUND(
            (
              COUNT(DISTINCT od.user_id)
              / COUNT(DISTINCT cd.user_id)
            ) * 100
          ,2) AS count
          `,
          "'lead_to_sale_ratio' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.orderDetails} od`,
            on: `od.user_id = cd.user_id AND od.sale_by = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },

    ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales performance stats fetched successfully",
      data: stats.reduce((acc, item) => {
        acc[item.type] = parseFloat(item.count || 0);
        return acc;
      }, {}),
    });

    return res.status(200).json(apiResponse);

  } catch (error) {
    console.log("Error while fetching sales performance stats", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};


const efficiencyMetricsData = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const { results } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        // total sales
        "COUNT(DISTINCT od.order_id) AS total_sales",

        // total calls
        "COUNT(DISTINCT cu.call_id) AS total_calls",

        // avg calls per sale
        `ROUND(
          COUNT(DISTINCT cu.call_id) / NULLIF(COUNT(DISTINCT od.order_id), 0),
          2
        ) AS avg_calls_per_sale`,

        // total engagements
        "COUNT(DISTINCT el.id) AS total_engagements",

        // avg engagements per sale
        `ROUND(
          COUNT(DISTINCT el.id) / NULLIF(COUNT(DISTINCT od.order_id), 0),
          2
        ) AS avg_engagements_per_sale`,

        // avg days to sale (first call → order date)
        `ROUND(
          AVG(
            DATEDIFF(
              od.order_date,
              first_call.first_call_date
            )
          ),
          2
        ) AS avg_days_to_sale`,

        // avg days to close consultation (first consultation → order date)
        `ROUND(
          AVG(
            DATEDIFF(
              od.order_date,
              first_consultation.first_consultation_date
            )
          ),
          2
        ) AS avg_days_to_close_consultation`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = od.user_id",
        },

        // calls
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cd.user_id = cu.user_id AND cu.added_by = od.sale_by",
        },

        // engagements
        {
          type: "LEFT",
          table: `${tables.leadEngagementLogs} el`,
          on: "cd.user_id = el.user_id AND el.added_by = od.sale_by",
        },

        // first call subquery
        {
          type: "LEFT",
          table: `(
            SELECT 
              user_id,
              MIN(schedule_date) AS first_call_date
            FROM ${tables.callUpdates}
            WHERE added_by = ${mentor_id}
            GROUP BY user_id
          ) first_call`,
          on: "first_call.user_id = od.user_id",
          raw: true,
        },

        // first consultation subquery
        {
          type: "LEFT",
          table: `(
            SELECT 
              user_id,
              MIN(added_date) AS first_consultation_date
            FROM ${tables.consultationLogs}
            GROUP BY user_id
          ) first_consultation`,
          on: "first_consultation.user_id = od.user_id",
          raw: true,
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: mentor_id },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });
    const performance = await getCounsellorPerformance({
      id: mentor_id,
      startDate: moment().startOf("month").format("YYYY-MM-DD"),
      endDate: moment().endOf("day").format("YYYY-MM-DD"),
    });
    return res.status(200).json({
      statusCode: 200,
      message: "Efficiency metrics fetched successfully",
      data: {
        ...results[0],
        "l:c": performance["l:c"],
        "l:s": performance["l:s"],
      },
    });
  } catch (error) {
    console.log("Error while fetching Efficiency Metrics Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const productivityMetricsData = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const daysElapsed = moment().diff(moment().startOf("month"), "days") + 1;

    const { results: callResults } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        `ROUND(COUNT(DISTINCT cu.call_id) / ${daysElapsed}, 2) AS calls_per_day`,
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      ],
    });

    const { results: engagementResults } = await readRecord({
      table: `${tables.leadEngagementLogs} el`,
      selectFields: [
        `ROUND(COUNT(DISTINCT el.id) / ${daysElapsed}, 2) AS engagements_per_day`,
      ],
      conditions: [
        { field: "el.added_by", operator: "=", value: mentor_id },
        {
          field: "DATE(el.added_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      ],
    });

    const { results: consultationResults } = await readRecord({
      table: `${tables.consultationLogs} cl`,
      selectFields: [
        `ROUND(COUNT(DISTINCT cl.id) / ${daysElapsed}, 2) AS consultations_per_day`,
      ],
      conditions: [
        { field: "cl.consultation_by", operator: "=", value: mentor_id },
        {
          field: "DATE(cl.added_date)",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      ],
    });
    const activityCount = await readRecordUnion([
      {
        table: `${tables.leadFollowUpLogs} lfu`,
        selectField: [`COUNT(*) AS count_today`],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lfu.user_id",
          },
        ],
        condition: [
          { field: "lfu.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lfu.follow_up_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          // { field: "lfu.type", operator: "=", value: "1" },
          { field: "lfu.follow_up_status", operator: "=", value: 1 },
        ],
      },
      {
        table: `${tables.consultationLogs} cl`,
        selectField: [`COUNT(*) AS count_today`],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = cl.user_id",
          },
        ],
        condition: [
          { field: "cl.consultation_by", operator: "=", value: mentor_id },
          {
            field: "DATE(cl.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    function formatTime(minutes = 0) {
      if (minutes < 60) {
        return `${minutes} min`;
      }

      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;

      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    const fuMinutes = (activityCount[0]?.count_today || 0) * 15;
    const consultationMinutes = (activityCount[1]?.count_today || 0) * 30;

    return res.status(200).json({
      statusCode: 200,
      message: "Productivity metrics fetched successfully",
      data: {
        calls_per_day: callResults[0]?.calls_per_day || 0,
        engagements_per_day: engagementResults[0]?.engagements_per_day || 0,
        consultations_per_day:
          consultationResults[0]?.consultations_per_day || 0,

        fu_time: formatTime(fuMinutes),
        consultation_time: formatTime(consultationMinutes),
      },
    });
  } catch (error) {
    console.log("Error while fetching Productivity Metrics Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const capturedLeadsActivitiesData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      search,
      page = 1,
      limit = 50,
      filter = "direct_leads_today",
    } = req.body;
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
      {
        field: "DATE(lal.assign_date)",
        operator: "BETWEEN",
        value: [
          `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
          `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
        ],
        raw: true,
      },
    ];
    switch (filter.toLowerCase()) {
      case "direct_leads_today":
        conditions.push(
          { field: "ls.source_group", operator: "=", value: 4 },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        );
        break;
      case "social_media_leads_today":
        conditions.push(
          { field: "ls.source_group", operator: "=", value: 3 },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        );
        break;
      case "app_leads_today":
        conditions.push(
          { field: "ls.source_id", operator: "=", value: 32 },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        );
        break;
      case "hs_leads_today":
        conditions.push(
          { field: "ls.source_group", operator: "=", value: 1 },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        );
        break;
      case "referral_leads_today":
        conditions.push(
          { field: "ls.source_group", operator: "=", value: 5 },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        );
        break;
      case "direct_leads_month":
        conditions.push({ field: "ls.source_group", operator: "=", value: 4 });
        break;
      case "social_media_leads_month":
        conditions.push({ field: "ls.source_group", operator: "=", value: 3 });
        break;
      case "app_leads_month":
        conditions.push({ field: "ls.source_id", operator: "=", value: 32 });
        break;
      case "hs_leads_month":
        conditions.push({ field: "ls.source_group", operator: "=", value: 1 });
        break;
      case "referral_leads_month":
        conditions.push({ field: "ls.source_group", operator: "=", value: 5 });
        break;
      default:
        break;
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.counsellor_assigned = lal.counsellor_id and cd.user_id = lal.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions,
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Captured Leads Activities Data fetched successfully",
      data: finalData,

      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Captured Leads Activities Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const callsAndFollowUpsActivitiesData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      search,
      page = 1,
      limit = 50,
      filter = "follow_up_calls_today",
    } = req.body;
    const conditions = [
      { field: "cu.added_by", operator: "=", value: mentor_id },
      { field: "cd.user_status", operator: "!=", value: 'Active'},
      {
        field: "DATE(cu.schedule_date)",
        operator: "BETWEEN",
        value: [
          `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
          `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
        ],
        raw: true,
      },
    ];
    switch (filter.toLowerCase()) {
      case "follow_up_calls_today":
        conditions.push(
          { field: "cu.call_type", operator: "=", value: "14" },
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.call_status", operator: "=", value: 1 },
        );
        break;
      case "follow_up_calls_month":
        conditions.push(
          { field: "cu.call_type", operator: "=", value: "14" },
          { field: "cu.call_status", operator: "=", value: 1 },
        );
        break;
      case "engagment_calls_today":
        conditions.push(
          { field: "cu.call_type", operator: "=", value: "45" },
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.call_status", operator: "=", value: 1 },
        );
        break;
      case "engagment_calls_month":
        conditions.push(
          { field: "cu.call_type", operator: "=", value: "45" },
          { field: "cu.call_status", operator: "=", value: 1 },
        );
        break;
      case "completed_calls_today":
        conditions.push(
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.call_status", operator: "=", value: 1 },
        );
        break;
      case "completed_calls_month":
        conditions.push({ field: "cu.call_status", operator: "=", value: '1' });
        break;
      case "attempted_calls_today":
        conditions.push(
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.call_status", operator: "!=", value: '0' },
        );
        break;
      case "attempted_calls_month":
        conditions.push({ field: "cu.call_status", operator: "!=", value: '0' });
        break;
      default:
        break;
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions,
      groupBy: ["cu.call_id"],
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Calls and Follow-Ups Activity Data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error while fetching Calls and Follow-Ups Activity Data:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const consultationActivitiesData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      search,
      page = 1,
      limit = 50,
      filter = "consultation_calls_month",
    } = req.body;
    const conditions = [
      { field: "cu.added_by", operator: "=", value: mentor_id },
      { field: "cu.call_type", operator: "=", value: "30" },
      {
        field: "DATE(cu.schedule_date)",
        operator: "BETWEEN",
        value: [
          `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
          `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
        ],
        raw: true,
      },
    ];
    switch (filter.toLowerCase()) {
      case "consultation_calls_today":
        conditions.push({
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        });
        break;
      case "booked  by_counsellor_today":
        conditions.push(
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "LOWER(cu.source)", operator: "=", value: "db" },
        );
        break;
      case "booked_by_counsellor_month":
        conditions.push({
          field: "LOWER(cu.source)",
          operator: "=",
          value: "db",
        });
        break;
      case "booked_by_user_today":
        conditions.push(
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "LOWER(cu.source)", operator: "!=", value: "db" },
        );
        break;
      case "booked_by_user_month":
        conditions.push({
          field: "LOWER(cu.source)",
          operator: "!=",
          value: "db",
        });
        break;
      case "consultation_done_today":
        conditions.push(
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "cu.call_status", operator: "=", value: 1 },
        );
        break;
      case "consultation_done_month":
        conditions.push({ field: "cu.call_status", operator: "=", value: 1 });
        break;
      default:
        break;
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions,
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Consultation Activities Data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching consultation activities data:", error);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal Server Error",
    });
  }
};

const conversationActivitiesData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      search,
      page = 1,
      limit = 50,
      filter = "whatsapp_follow_ups_month",
    } = req.body;
    const conditions = [];
    let table = "";
    const joins = [];
    const orderBy = [];
    let chatsData = [];
    if (filter.startsWith("whatsapp_follow_ups")) {
      table = `${tables.leadFollowUpLogs} lfu`;
      conditions.push(
        { field: "lfu.assigned_to", operator: "=", value: mentor_id },
        { field: "lfu.type", operator: "=", value: "1" },
        { field: "lfu.follow_up_status", operator: "=", value: 1 },
        {
          field: "lfu.follow_up_date",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      );
      joins.push({
        type: "INNER",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = lfu.user_id",
      });
      if (filter.endsWith("today")) {
        conditions.push({
          field: "DATE(lfu.follow_up_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        });
      }
    } else if (filter.startsWith("whatsapp_engagement")) {
      table = `${tables.leadEngagementLogs} lel`;
      conditions.push(
        { field: "lel.assigned_to", operator: "=", value: mentor_id },
        { field: "lel.type", operator: "=", value: "1" },
        { field: "lel.status", operator: "=", value: 1 },
        {
          field: "lel.engagement_date",
          operator: "BETWEEN",
          value: [
            `'${moment().startOf("month").format("YYYY-MM-DD")}'`,
            `'${moment().endOf("day").format("YYYY-MM-DD")}'`,
          ],
          raw: true,
        },
      );
      joins.push({
        type: "INNER",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = lel.user_id",
      });
      if (filter.endsWith("today")) {
        conditions.push({
          field: "DATE(lel.engagement_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        });
      }
    } else if (filter.startsWith("client_enquiries")) {
      const startDate = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      );

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      chatsData = await clientEnquiry
        .find({
          mentor_id: parseInt(mentor_id),
          createdAt: { $gte: startDate, $lte: new Date() },
          type: { $ne: "clara" },
          sender: "client",
        })
        .sort({ createdAt: -1 });
      table = `${tables.userDetails} cd`;
      console.log(chatsData, 4266);
      const { userIds, orderById } = generateUserIdsAndOrderById(chatsData);
      conditions.push({ field: "cd.user_id", operator: "IN", value: userIds });
      console.log(orderById, 4268);
      orderBy.push(orderById);
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table,
      joins: [...joins, ...getCommonJoins()],
      conditions,
      orderBy,
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
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Conversation Activities Data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Conversation Activities Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const adminDayPlannerData = async (req, res, next) => {
  try {
    const { mentor_id, date = moment().format("YYYY-MM-DD") } = req.query;
    const { results: todayCallsData } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "COALESCE(NULLIF(cd.first_name, ''), cd.last_name, 'User') AS name",
        "cu.schedule_date",
        "cu.call_type",
        `GROUP_CONCAT(
        DISTINCT basm.appointment_slots
        ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', '
    ) AS appointment_slots`,
        "cd.sales_status",
        "cd.phone",
        "cd.email_id",
        "cu.source",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
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
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
      ],
      orderBy: ["CAST(SUBSTRING_INDEX(cu.slot_id, ',', 1) AS UNSIGNED)"],
      groupBy: ["cu.call_id", "cu.user_id"],
    });
    const consultationCalls = todayCallsData.filter(
      (item) => item.call_type === "30",
    );
    const followUpCalls = todayCallsData.filter(
      (item) => item.call_type === "14",
    );
    const engagementCalls = todayCallsData.filter(
      (item) => item.call_type === "45",
    );
    const whatsappFollowUpAndEngagments = await readRecordUnion([
      {
        table: `${tables.leadFollowUpLogs} lfu`,
        selectField: ["COUNT(*) AS count"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lfu.user_id",
          },
        ],
        condition: [
          { field: "lfu.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lfu.follow_up_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "lfu.type", operator: "=", value: "1" },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: ["COUNT(*) AS count"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
        condition: [
          { field: "lel.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lel.engagement_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "lel.type", operator: "=", value: "1" },
        ],
      },
    ]);
    const { results: paymentDueCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["COUNT(*) AS count"],
      conditions: [
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: "cd.payment_date",
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
      ],
    });

    const { results: balancePaymentDueCount } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: ["COUNT(DISTINCT od.order_id) AS count"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = od.user_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "NOT IN", value: [0, 10, 196] },
        { field: "od.order_balance_amount", operator: ">", value: 0 },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "od.due_date",
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
      ],
    });
    const { results: additionalTasks } = await readRecord({
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
          value: `${date}`,
        },
        {
          field: "DATE(me.event_end_at)",
          operator: ">=",
          value: `${date}`,
        },
        { field: "me.is_additional", operator: "=", value: 1 },
      ],
      orderBy: ["me.event_start_at ASC"],
    });
    const data = {
      hows_my_day: {
        consultation_calls: consultationCalls.length,
        follow_up_and_engagements_calls:
          followUpCalls.length + engagementCalls.length,
        whatsapp_engagement_and_follow_ups:
          (whatsappFollowUpAndEngagments[0]?.count || 0) +
          (whatsappFollowUpAndEngagments[1]?.count || 0),
        payment_due: paymentDueCount[0]?.count || 0,
        balance_payment_due: balancePaymentDueCount[0]?.count || 0,
      },
      follow_up_calls: {
        hot_follow_ups: {
          scheduled_by_counsellor: followUpCalls.filter(
            (item) => item.sales_status === "2",
          ).length,
          scheduled_by_system: 0,
        },
        warm_follow_ups: {
          scheduled_by_counsellor: followUpCalls.filter(
            (item) => item.sales_status === "3",
          ).length,
          scheduled_by_system: 0,
        },
      },
      consultation_calls: consultationCalls.map((item) => {
        return {
          name: item.name,
          phone: item.phone,
          time: item.appointment_slots,
          email: item.email_id,
          booked_by: item.source
            ? item.source.toLowerCase() === "db"
              ? "Booked by Counsellor"
              : "Booked by User"
            : "N/A",
        };
      }),
      follow_up_and_engagements_calls: followUpCalls.concat(engagementCalls),
      additional_tasks: additionalTasks,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Day Planner Data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Day Planner Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

async function activitiesSummaryAndPendingCount({
  mentor_id,
  date = moment().format("YYYY-MM-DD"),
}) {
  try {
    const { results = [] } = await readRecord({
      table: `${tables.leadSaleStatusLog} lssl`,
      selectFields: [
        "u.user_id",
    
        // Extract numeric status
        `CAST(
          JSON_UNQUOTE(
            JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', n.n, '].sales_status'))
          ) AS UNSIGNED
        ) AS sales_status`,
    
        // Extract raw timestamp string
        `JSON_UNQUOTE(
          JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', n.n, '].timestamp'))
        ) AS ts`
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} u`,
          on: "u.user_id = lssl.user_id",
        },
        {
          type: "INNER",
          table: `${tables.numbers} n`,
          on: `n.n < JSON_LENGTH(lssl.sales_status_log)`,
          raw: true,
        },
      ],
      conditions: [
        {
          field: "u.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
    
        // Compare only date portion (timezone safe)
        {
          field: `LEFT(
            JSON_UNQUOTE(
              JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', n.n, '].timestamp'))
            ),
            10
          )`,
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
    
        {
          field: `CAST(
            JSON_UNQUOTE(
              JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', n.n, '].sales_status'))
            ) AS UNSIGNED
          )`,
          operator: "IN",
          value: "(2,3)",
          raw: true,
        },
      ],
    });

   // Determine latest status per user
const latestByUser = {};

results.forEach((row) => {
  const userId = row.user_id;
  const status = row.sales_status;
  const ts = new Date(row.ts);

  if (!latestByUser[userId] || ts > latestByUser[userId].ts) {
    latestByUser[userId] = { status, ts };
  }
});

// Final counts
let hotLeads = 0;
let warmLeads = 0;

Object.values(latestByUser).forEach((entry) => {
  if (entry.status === 2) hotLeads++;
  if (entry.status === 3) warmLeads++;
});

console.log("Hot Leads:", hotLeads);
console.log("Warm Leads:", warmLeads);

// Optional: log user IDs
console.log(
  "Hot User IDs:",
  Object.entries(latestByUser)
    .filter(([_, v]) => v.status === 2)
    .map(([k]) => k)
);

console.log(
  "Warm User IDs:",
  Object.entries(latestByUser)
    .filter(([_, v]) => v.status === 3)
    .map(([k]) => k)
);


const { results:result } = await readRecord({
  table: `${tables.leadAssignedLog} lal`,
  selectFields: [
    "COUNT(DISTINCT lal.user_id) AS count"
  ],
  joins: [
    {
      type: "INNER",
      table: `${tables.userDetails} cd`,
      on: "cd.user_id = lal.user_id",
    },
  ],
  conditions: [
    {
      field: "lal.counsellor_id",
      operator: "=",
      value: mentor_id,
    },
    {
      field: "DATE(lal.assign_date)",
      operator: "=",
      value: "CURDATE()",
      raw: true,
    },
    // optional: only leads (not clients)
    {
      field: "cd.user_type",
      operator: "=",
      value: "0",
    },
  ],
});


const assignedLeadsCount = result[0]?.count || 0;

console.log(assignedLeadsCount,11111111);
    const { results: callUpdates = [] } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: ["cd.user_id", "cu.call_type", "cu.call_status"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        { field: "DATE(cu.schedule_date)", operator: "=", value: `${date}` },
      ],
    });

    const countBy = (type, status) =>
      callUpdates.filter(
        (i) => i.call_type === type && i.call_status === status,
      ).length;

    const whatsappFollowUpAndEngagments = await readRecordUnion([
      {
        table: `${tables.leadFollowUpLogs} lfu`,
        selectField: ["COUNT(*) AS count"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lfu.user_id",
          },
        ],
        condition: [
          { field: "lfu.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lfu.follow_up_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "lfu.type", operator: "=", value: "1" },
          { field: "lfu.follow_up_status", operator: "=", value: 1 },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: ["COUNT(*) AS count"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
        condition: [
          { field: "lel.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lel.engagement_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "lel.type", operator: "=", value: "1" },
          { field: "lel.status", operator: "=", value: 1 },
        ],
      },
    ]);

    const { results:consultations } = await readRecord({
      table: `${tables.consultationLogs} cl`,
      selectFields: [
        "COUNT(cl.id) AS count"
      ],
      conditions: [
        {
          field: "cl.consultation_by",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "DATE(cl.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    const consultationsToday = consultations[0]?.count || 0;
console.log(consultationsToday,11111111);

const { results: salesData } = await readRecord({
  table: `${tables.orderDetails} od`,
  selectFields: [
    "COUNT(DISTINCT sop.sub_order_id) AS total"
  ],
  joins: [
    {
      type: "INNER",
      table: `${tables.userDetails} cd`,
      on: "cd.user_id = od.user_id",
    },
    {
      type: "INNER",
      table: `${tables.subOrderPrograms} sop`,
      on: "sop.order_id = od.order_id",
    },
  ],
  conditions: [
    {
      field: "od.sale_by",
      operator: "=",
      value: mentor_id,
    },
    {
      field: "DATE(od.order_date)",
      operator: "=",
      value: `'${date}'`,
      raw: true,
    },
  ],
});

    return {
      activities_summary: {
        total_leads_assigned: assignedLeadsCount,
        successful_calls: countBy("14", 1) + countBy("45", 1),
        attempted_but_not_successful_calls:
          countBy("14", 4) + countBy("45", 4),
        consultation_calls_done: consultationsToday,
        whatsapp_engagement_and_follow_ups_done:
          (whatsappFollowUpAndEngagments[0]?.count || 0) +
          (whatsappFollowUpAndEngagments[1]?.count || 0),
        hot_leads: hotLeads,
        warm_leads: warmLeads,
        sales_units:salesData[0].total
      },
      pending_activities: {
        consultation_calls_pending: countBy("30", 0),
        follow_up_calls_pending: countBy("14", 0),
        engagement_calls_pending: countBy("45", 0),
      },
    };
  } catch (error) {
    console.error("Error in activitiesSummaryAndPendingCount:", {
      mentor_id,
      date,
      error,
    });

    return {
      activities_summary: {},
      pending_activities: {},
    };
  }
}

async function riskAndMissesCounts({ mentor_id, date }) {
  try {
    const criticalAndOLCallsNotDoneCount = await readRecordUnion([
      {
        table: `${tables.leadAssignedLog} lal`,
        selectField: [`COUNT(DISTINCT lal.user_id) AS count`],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lal.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = cd.user_id AND DATE(cu.schedule_date) = '${date}' AND cu.added_by = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "lal.counsellor_id", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: `${date}`,
            raw: true,
          },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        ],
      },
      {
        table: `${tables.leadAssignedLog} lal`,
        selectField: [`COUNT(DISTINCT lal.user_id) AS count`],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lal.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = cd.user_id AND DATE(cu.schedule_date) = '${date}' AND cu.added_by = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "lal.counsellor_id", operator: "=", value: mentor_id },
          {
            field: "DATE(lal.assign_date)",
            operator: "=",
            value: `${date}`,
            raw: true,
          },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          {
            field: "cd.added_date",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
        ],
      },
    ]);
    const appQueries = await clientEnquiry.aggregate([
      {
        $match: {
          mentor_id: parseInt(mentor_id),
          type: "query",
          createdAt: {
            $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            $lt: new Date(new Date(date).setHours(23, 59, 59, 999)),
          },
        },
      },
      {
        $group: {
          _id: "$user_id",
        },
      },
      {
        $count: "count",
      },
    ]);
    const appQueriesCount = appQueries[0]?.count || 0;
    const { results: consultationCallsNotDone } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "cu.call_id",
        "cu.call_type",
        "cu.call_status",
        `GROUP_CONCAT(
          DISTINCT basm.appointment_slots
          ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', '
        ) AS appointment_slots`,
        "cu.slot_id",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
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
      conditions: [
        {
          field: "cu.added_by",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: `${date}`,
          raw: true,
        },
        { field: "cu.call_type", operator: "=", value: "30" },
        { field: "cu.call_status", operator: "=", value: 0 },
      ],
    });
    console.log(consultationCallsNotDone, 4859);
    const missedConsultationCallsCount = consultationCallsNotDone.filter(
      (item) => {
        const appointmentSlots = item.appointment_slots
          ? item.appointment_slots.split(",")
          : [];
        const slotTime =
          appointmentSlots.length > 0
            ? appointmentSlots.split(",")[0].split(" - ")[0].trim()
            : null;
        if (!slotTime) return false;
        return moment().isSameOrAfter(moment(slotTime, "hh:mm a"));
      },
    );
    const paymentAndBalanceDueCallPendingCount = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [`COUNT(*) AS count`],
        join: [
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = cd.user_id AND DATE(cu.schedule_date) = '${date}' AND cu.added_by = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.user_status", operator: "=", value: '0' },
          {
            field: "cd.payment_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [`COUNT(DISTINCT od.order_id) AS count`],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = cd.user_id AND DATE(cu.schedule_date) = '${date}' AND cu.added_by = ${mentor_id}`,
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "NOT IN", value: [0, 10, 196] },
          { field: "od.order_balance_amount", operator: ">", value: 0 },
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: "od.due_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        ],
      },
    ]);
    return {
      critical_calls_not_done: 0,
      ol_calls_not_done: 0,
      app_queries_not_addressed: appQueriesCount,
      missed_consultation_calls: missedConsultationCallsCount.length,
      payment_due_calls_pending: paymentAndBalanceDueCallPendingCount[0]?.count,
      balance_payment_due_calls_pending:
        paymentAndBalanceDueCallPendingCount[1]?.count,
    };
  } catch (error) {
    console.log("Error while getting risk and misses count");
    return {
      critical_calls_not_done: 0,
      ol_calls_not_done: 0,
      app_queries_not_addressed: 0,
      missed_consultation_calls: 0,
      payment_due_calls_pending: 0,
      balance_payment_due_calls_pending: 0,
    };
  }
}

async function leadsBifurcationCount({ mentor_id, date }) {
  try {
    const { results: counts } = await readRecord({
      table: `${tables.leadAssignedLog} lal`,
      selectFields: [
        `COUNT(DISTINCT CASE WHEN ls.source_group = 3 AND DATE(cd.added_date) = '${date}' THEN 1 END) AS social_media_leads_count`,
        `COUNT(DISTINCT CASE WHEN ls.source_group = 4 AND DATE(cd.added_date) = '${date}' THEN 1 END) AS direct_leads_count`,
        `COUNT(DISTINCT CASE WHEN ls.source_id = 32 AND DATE(cd.added_date) = '${date}' THEN 1 END) AS app_leads_count`,
        `COUNT(DISTINCT CASE WHEN ls.source_group = 1 AND DATE(cd.added_date) = '${date}' THEN 1 END) AS hs_leads_count`,
        `COUNT(DISTINCT CASE WHEN ls.source_group = 5 AND DATE(cd.added_date) = '${date}' THEN 1 END) AS referral_leads_count`,
        `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) < '${moment().startOf("month").format("YYYY-MM-DD")}' THEN 1 END) AS old_leads_count`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lal.user_id",
        },
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions: [
        { field: "lal.counsellor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(lal.assign_date)",
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
      ],
    });
    console.log(counts, 4573);
    return counts[0];
  } catch (error) {
    console.log("Error while fetching leads bifurcation count:", error);
    return {
      social_media_leads_count: 0,
      direct_leads_count: 0,
      app_leads_count: 0,
      hs_leads_count: 0,
      referral_leads_count: 0,
      old_leads_count: 0,
    };
  }
}

async function salesStatusDowngradeData({ mentor_id, date }) {
  try {
    const { results: salesStatusUpdateData } = await readRecord({
      table: `${tables.consultationLogs} csl`,
      selectFields: [
        "lssl.sales_status_log",
        "COALESCE(NULLIF(cd.first_name, ''), cd.last_name, 'User') AS name",
        "cd.email_id",
        "csl.key_insights",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.leadSaleStatusLog} lssl`,
          on: "lssl.user_id = csl.user_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lssl.user_id",
        },
      ],
      conditions: [
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        {
          field: "DATE(csl.added_date)",
          operator: "=",
          value: `${date}`,
          raw: true,
        },
      ],
    });
    const hotToWarmData = [];
    const hotToColdData = [];
    const warmToColdData = [];
    salesStatusUpdateData.forEach((item) => {
      const salesLog = JSON.parse(item.sales_status_log || "[]");
      if (salesLog.length > 1) {
        salesLog.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const secondLast = salesLog[salesLog.length - 2];
        const last = salesLog[salesLog.length - 1];
        if (moment(last.timestamp).isAfter(moment().subtract(3, "days"))) {
          if (
            Number(secondLast.sales_status) === 2 &&
            Number(last.sales_status) === 3
          ) {
            hotToWarmData.push({
              ...item,
              note:
                JSON.parse(item.key_insights || "{}").consultation_notes || "",
              status_change: `${secondLast.sales_status} to ${last.sales_status}`,
            });
          } else if (
            Number(secondLast.sales_status) === 2 &&
            Number(last.sales_status) === 4
          ) {
            hotToColdData.push({
              ...item,
              note:
                JSON.parse(item.key_insights || "{}").consultation_notes || "",
              status_change: `${secondLast.sales_status} to ${last.sales_status}`,
            });
          } else if (
            Number(secondLast.sales_status) === 3 &&
            Number(last.sales_status) === 4
          ) {
            warmToColdData.push({
              ...item,
              note:
                JSON.parse(item.key_insights || "{}").consultation_notes || "",
              status_change: `${secondLast.sales_status} to ${last.sales_status}`,
            });
          }
        }
      }
    });
    return [...hotToWarmData, ...hotToColdData, ...warmToColdData];
  } catch (error) {
    console.log("Error while fetching sales status downgrade data:", error);
    return [];
  }
}

async function salesBreakDownData({ mentor_id, date }) {
  try {
    const count = await readRecordUnion([
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) AS total",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "od.order_type", operator: "=", value: "New" },
          {
            field: "cd.added_date",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: ["COUNT(DISTINCT sop.sub_order_id) AS total"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.order_id = od.order_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "od.order_type", operator: "=", value: "New" },
          {
            field: "cd.added_date",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) AS total",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "od.order_type", operator: "=", value: "New" },
          {
            field: "cd.added_date",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: ["COUNT(DISTINCT sop.sub_order_id) AS total"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.order_id = od.order_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "od.order_type", operator: "=", value: "New" },
          {
            field: "cd.added_date",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) AS total",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "od.order_type", operator: "=", value: "OCR" },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: ["COUNT(DISTINCT sop.sub_order_id) AS total"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.order_id = od.order_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "od.order_type", operator: "=", value: "OCR" },
        ],
      },
    ]);
    const oldLeadsAmount = count[0]?.total || 0;
    const oldLeadsUnits = count[1]?.total || 0;
    const freshLeadsAmount = count[2]?.total || 0;
    const freshLeadsUnits = count[3]?.total || 0;
    const ocrAmount = count[4]?.total || 0;
    const ocrUnits = count[5]?.total || 0;

    const sales_breakdown = {
      fresh_leads: `${freshLeadsUnits} units | Rs.${freshLeadsAmount}`,
      old_leads: `${oldLeadsUnits} units | Rs.${oldLeadsAmount}`,
      ocr_leads: `${ocrUnits} units | Rs.${ocrAmount}`,
    };
    return sales_breakdown;
  } catch (error) {
    console.log("Error while fetching sales breakdown data", error);
    return {
      fresh_leads: `0 units | Rs.0`,
      old_leads: `0 units | Rs.0`,
      ocr_leads: `0 units | Rs.0`,
    };
  }
}

async function tommorrowActivities({
  mentor_id,
  date = moment().add(1, "day").format("YYYY-MM-DD"),
}) {
  try {
    const { results } = await readRecord({
      selectFields: [
        // follow up calls
        `COUNT(DISTINCT CASE WHEN cu.call_type = '14' AND cu.call_status = 0 THEN cu.call_id END) AS follow_up_calls`,
        // engagement calls
        `COUNT(DISTINCT CASE WHEN cu.call_type = '45' AND cu.call_status = 0 THEN cu.call_id END) AS engagement_calls`,
        // consultation calls
        `COUNT(DISTINCT CASE WHEN cu.call_type = '30' AND cu.call_status = 0 THEN cu.call_id END) AS consultation_calls`,
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: `'${date}'`,
          raw: true,
        },
      ],
    });
    // whatsapp follow up and engagements
    const whatsappFollowUpAndEngagments = await readRecordUnion([
      {
        table: `${tables.leadFollowUpLogs} lfu`,
        selectField: ["COUNT(*) AS count"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lfu.user_id",
          },
        ],
        condition: [
          { field: "lfu.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lfu.follow_up_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "lfu.type", operator: "=", value: "1" },
          { field: "lfu.follow_up_status", operator: "=", value: 0 },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: ["COUNT(*) AS count"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
        condition: [
          { field: "lel.assigned_to", operator: "=", value: mentor_id },
          {
            field: "lel.engagement_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
          { field: "lel.type", operator: "=", value: "1" },
          { field: "lel.status", operator: "=", value: 0 },
        ],
      },
    ]);
    // payment due and balance payment due tommorrow
    const paymentAndBalanceData = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [`COUNT(*) AS count`],
        condition: [
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          {
            field: "cd.payment_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [`COUNT(DISTINCT od.order_id) AS count`],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          { field: "od.order_balance_amount", operator: ">", value: 0 },
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: "od.due_date",
            operator: "=",
            value: `'${date}'`,
            raw: true,
          },
        ],
      },
    ]);
    return {
      consultation_tomorrow: results[0]?.consultation_calls || 0,
      follow_up_tomorrow: results[0]?.follow_up_calls || 0,
      engagement_tomorrow: results[0]?.engagement_calls || 0,
      whatsapp_follow_up_and_engagement_tomorrow:
        (whatsappFollowUpAndEngagments[0]?.count || 0) +
        (whatsappFollowUpAndEngagments[1]?.count || 0),
      payment_due_tomorrow: paymentAndBalanceData[0]?.count || 0,
      balance_payment_due_tomorrow: paymentAndBalanceData[1]?.count || 0,
    };
  } catch (error) {
    console.log("Error while fetching tomorrow's activities data:", error);
    return {
      consultation_tomorrow: 0,
      follow_up_tomorrow: 0,
      engagement_tomorrow: 0,
      whatsapp_follow_up_and_engagement_tomorrow: 0,
      payment_due_tomorrow: 0,
      balance_payment_due_tomorrow: 0,
    };
  }
}

async function monthSnapshotData({ mentor_id }) {
  try {
    const { results: freshAndOldLeadsCount } = await readRecord({
      table: `${tables.leadAssignedLog} lal`,
      selectFields: [
        `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) BETWEEN '${moment().startOf("month").format("YYYY-MM-DD")}' AND '${moment().endOf("month").format("YYYY-MM-DD")}' THEN lal.user_id END) AS fresh_leads_count`,
        `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) < '${moment().startOf("month").format("YYYY-MM-DD")}' THEN lal.user_id END) AS old_leads_count`,
         `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) < '${moment().startOf("month").format("YYYY-MM-DD")}' AND cd.sales_status = '2' THEN lal.user_id END) AS hot_leads_count`,
         `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) < '${moment().startOf("month").format("YYYY-MM-DD")}' AND cd.sales_status = '3' THEN lal.user_id END) AS warm_leads_count`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lal.user_id",
        },
      ],
      conditions: [
        { field: "lal.counsellor_id", operator: "=", value: mentor_id },
        {
          field: "DATE(lal.assign_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    const { results: totalOCR } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) as total_ocr"],
      table: `${tables.changeOfMentor} com`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = com.user_id",
        },
      ],
      conditions: [
        { field: "com.new_mentor", operator: "=", value: mentor_id },
        { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
        {
          field: "DATE(com.added_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    const leads = {
      fresh_leads: freshAndOldLeadsCount[0]?.fresh_leads_count || 0,
      old_leads: freshAndOldLeadsCount[0]?.old_leads_count || 0,
      ocr: totalOCR[0]?.total_ocr || 0,
    };
    // consultation booked and done in the month
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "COUNT(*) AS consultation_booked",
        `COUNT(CASE WHEN cu.call_status = 1 THEN 1 END) AS consultation_done`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        { field: "cu.call_type", operator: "=", value: "30" },
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });


    const { results:consultationsDone } = await readRecord({
      table: `${tables.consultationLogs} cl`,
      selectFields: [
        "COUNT(cl.id) AS count"
      ],
      conditions: [
        {
          field: "cl.consultation_by",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "MONTH(cl.added_date)",
          operator: "=",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: "YEAR(cl.added_date)",
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
      ],
    });
    const consultationsToday = consultationsDone[0]?.count || 0;

    const consultations = {
      done: consultationsToday || 0,
    };

    // follow up and engagement calls attempted and done in the month
    const { results: followUpAndEngagementCalls } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        `COUNT(DISTINCT CASE WHEN cu.call_type = '14' AND cu.call_status = 4 THEN cu.call_id END) AS follow_up_calls_attempted`,
        `COUNT(DISTINCT CASE WHEN cu.call_type = '14' AND cu.call_status = 1 THEN cu.call_id END) AS follow_up_calls_done`,
        `COUNT(DISTINCT CASE WHEN cu.call_type = '45' AND cu.call_status = 4 THEN cu.call_id END) AS engagement_calls_attempted`,
        `COUNT(DISTINCT CASE WHEN cu.call_type = '45' AND cu.call_status = 1 THEN cu.call_id END) AS engagement_calls_done`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = cu.user_id",
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: mentor_id },
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });

    const follow_up_and_engagement_calls = {
      follow_up_calls_attempted:
        followUpAndEngagementCalls[0]?.follow_up_calls_attempted || 0,
      follow_up_calls_done:
        followUpAndEngagementCalls[0]?.follow_up_calls_done || 0,
      engagement_calls_attempted:
        followUpAndEngagementCalls[0]?.engagement_calls_attempted || 0,
      engagement_calls_done:
        followUpAndEngagementCalls[0]?.engagement_calls_done || 0,
    };
    const status = {
      hot_leads: freshAndOldLeadsCount[0]?.hot_leads_count || 0,
      warm_leads: freshAndOldLeadsCount[0]?.warm_leads_count || 0,
    };
    const { results: suggestedData } = await readRecord({
      selectFields: [
        "COUNT(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NULL THEN 1 END) as rate_shared",
        "SUM(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NULL THEN sp.suggested_amount ELSE 0 END) as rate_shared_amount",
        "COUNT(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NOT NULL THEN 1 END) as link_shared",
        "SUM(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NOT NULL THEN sp.suggested_amount ELSE 0 END) as link_shared_amount",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "sp.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: "sp.suggested_by",
          operator: "=",
          value: mentor_id,
        },
      ].filter(Boolean),
    });
    const suggested_data = {
      rate_shared: `${suggestedData[0]?.rate_shared || 0} Units | Rs.${suggestedData[0]?.rate_shared_amount || 0}`,
      link_shared: `${suggestedData[0]?.link_shared || 0} Units | Rs.${suggestedData[0]?.link_shared_amount || 0}`,
    };
    const salesData = await readRecordUnion([
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) AS total",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: ["COUNT(DISTINCT sop.sub_order_id) AS total"],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.order_id = od.order_id",
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "=", value: mentor_id },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);
    const sales_data = `${salesData[1]?.total || 0} Units | Rs.${salesData[0]?.total || 0}`;
    return {
      leads,
      consultations,
      follow_up_and_engagement_calls,
      status,
      suggested_data,
      sales_data,
    };
  } catch (error) {
    console.log("Error while fetching monthSnapShotData", error);
    return {
      leads: {
        fresh_leads: 0,
        old_leads: 0,
        ocr: 0,
      },
      consultations: {
        booked: 0,
        done: 0,
      },
      follow_up_and_engagement_calls: {
        follow_up_calls_attempted: 0,
        follow_up_calls_done: 0,
        engagement_calls_attempted: 0,
        engagement_calls_done: 0,
      },
      status: {
        hot_leads: 0,
        warm_leads: 0,
      },
      suggested_data: {
        rate_shared: `0 Units | Rs.0`,
        link_shared: `0 Units | Rs.0`,
      },
      sales_data: `0 Units | Rs.0`,
    };
  }
}

const adminDayReviewData = async (req, res, next) => {
  try {
    const { mentor_id, date = moment().format("YYYY-MM-DD") } = req.query;
    const { activities_summary, pending_activities } =
      await activitiesSummaryAndPendingCount({ mentor_id, date });
    console.log(activities_summary, 5025);
    console.log(pending_activities, 5026);
    const risk_and_misses = await riskAndMissesCounts({ mentor_id, date });
    const bifurcation_counts = await leadsBifurcationCount({ mentor_id, date });
    const downgraded_leads = await salesStatusDowngradeData({
      mentor_id,
      date,
    });
    const data = {
      activities_summary,
      pending_activities,
      risk_and_misses,
      bifurcation_counts,
      downgraded_leads,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Day Review Data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Day Review Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const adminDayEndData = async (req, res, next) => {
  try {
    const { mentor_id, date = moment().format("YYYY-MM-DD") } = req.query;
    const { activities_summary, pending_activities } =
      await activitiesSummaryAndPendingCount({ mentor_id, date });
    const risk_and_misses = await riskAndMissesCounts({ mentor_id, date });
    const bifurcation_counts = await leadsBifurcationCount({ mentor_id, date });
    const downgraded_leads = await salesStatusDowngradeData({
      mentor_id,
      date,
    });
    const sales_breakdown = await salesBreakDownData({ mentor_id, date });
    const tommorrow_activities = await tommorrowActivities({
      mentor_id,
      date: moment().add(1, "day").format("YYYY-MM-DD"),
    });
    console.log(tommorrow_activities, 5671);
    const month_snapshot = await monthSnapshotData({ mentor_id });
    console.log(activities_summary);
    const data = {
      activities_summary,
      pending_activities,
      risk_and_misses,
      bifurcation_counts,
      downgraded_leads,
      sales_breakdown,
      tommorrow_activities,
      month_snapshot,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Day End Data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error while fetching Day End Data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  activitiesCallsAndFollowUpsCounts,
  activitiesCapturedLeadsCount,
  activitiesConsultationCounts,
  activitiesConversationCounts,
  adminDayPlannerData,
  adminDayReviewData,
  adminDayEndData,
  balanceDueData,
  balanceOverdueData,
  basicStackLeadsData,
  buildFaithLeadsData,
  buildYourBucketCounts,
  callsAndFollowUpsActivitiesData,
  capturedLeadsActivitiesData,
  consultationActivitiesData,
  consultationLeadsData,
  consultationMissedLeadsData,
  conversationActivitiesData,
  criticalResponsesCounts,
  directLeadsData,
  directMissedLeadsData,
  efficiencyMetricsData,
  engagementCallsLeadsData,
  followUpsAndCallsCounts,
  followUpCallsLeadsData,
  hotFUMissedLeadsData,
  hotOldLeadsData,
  justForKnowledgeLeadsData,
  leadsCount,
  leadsWithoutAppBucketData,
  nonTargetMarketLeadsData,
  ocrData,
  oldCampaignLeadsBucketData,
  paymentDueData,
  paymentOverdueData,
  phaseBucketLeadsData,
  previouslyHotLeadBucketData,
  previouslyWarmLeadsBucketData,
  productivityMetricsData,
  referralLeadsData,
  riskAndMissesCriticalFollowUps,
  riskAndMissesLeadsCounts,
  riskAndMissesToNurtureCount,
  socialMediaLeadsData,
  socialMediaMissedLeadsData,
  targetMarketBucketLeadsData,
  targetMarketLeadsData,
  targetMarketMissedLeadsData,
  unansweredQueriesLeadsData,
  walletAbove3000LeadsData,
  warmFUMissedLeadsData,
  warmOldLeadsData,
  whatsappEngagementLeadsData,
  whatsappFollowUpLeadsData,
  hSLeadsData,
  nonTargetMarketBucketLeadsData,
  ongoingChallengeCount,
  challengeParticipantsLeadsData,
  challengeActiveParticipantsLeadsData,
  challengeInactiveParticipantsLeadsData,
  dailyRunRateStats
};
