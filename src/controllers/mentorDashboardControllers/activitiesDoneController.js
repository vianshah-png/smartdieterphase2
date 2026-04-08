import moment from "moment";
import { readRecord, readRecordUnion } from "../../config/query.js";
import {
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  mapUserData,
} from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import {
  getFormattedLeadData,
  getFormattedUserData,
} from "../../helper/mentordbHelpers.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getOcStatusCount = async ({ mentor_id }) => {
  try {
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `COUNT(CASE WHEN sp.status = 1 AND sp.added_date >= '${this_month}' THEN 1 END) AS monthly_1st_pitch`,
        `COUNT(CASE WHEN sp.status = 2 AND sp.added_date >= '${this_month}' THEN 1 END) AS monthly_hot`,
        `COUNT(CASE WHEN sp.status = 3 AND sp.added_date >='${this_month}' THEN 1 END) AS monthly_warm`,
        `COUNT(CASE WHEN sp.status = 4 AND sp.added_date >= '${this_month}' THEN 1 END) AS monthly_cold`,
        `COUNT(CASE WHEN sp.status = 1 AND sp.added_date = '${today}' THEN 1 END) AS today_1st_pitch`,
        `COUNT(CASE WHEN sp.status = 2 AND sp.added_date = '${today}' THEN 1 END) AS today_hot`,
        `COUNT(CASE WHEN sp.status = 3 AND sp.added_date = '${today}' THEN 1 END) AS today_warm`,
        `COUNT(CASE WHEN sp.status = 4 AND sp.added_date = '${today}' THEN 1 END) AS today_cold`,
      ],
      conditions: [
        mentor_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
      ].filter(Boolean),
      joins: [
        {
          type: "INNER",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
      ],
    });
    return { results };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const getLeadStatusCount = async ({ mentor_id }) => {
  try {
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    console.log(this_month, 66);
    console.log(today, 67);

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `SUM(CASE WHEN ud.sales_status = '0' AND DATE(ud.added_date) >= '${this_month}' THEN 1 ELSE 0 END) AS monthly_to_engage`,
        `SUM(CASE WHEN ud.sales_status = '2' AND DATE(ud.added_date) >= '${this_month}' THEN 1 ELSE 0 END) AS monthly_hot`,
        `SUM(CASE WHEN ud.sales_status = '3' AND DATE(ud.added_date) >= '${this_month}' THEN 1 ELSE 0 END) AS monthly_warm`,
        `SUM(CASE WHEN ud.sales_status = '4' AND DATE(ud.added_date) >= '${this_month}' THEN 1 ELSE 0 END) AS monthly_cold`,
        `SUM(CASE WHEN ud.sales_status = '0' AND DATE(ud.added_date) = '${today}' THEN 1 ELSE 0 END) AS today_to_engage`,
        `SUM(CASE WHEN ud.sales_status = '2' AND DATE(ud.added_date) = '${today}' THEN 1 ELSE 0 END) AS today_hot`,
        `SUM(CASE WHEN ud.sales_status = '3' AND DATE(ud.added_date) = '${today}' THEN 1 ELSE 0 END) AS today_warm`,
        `SUM(CASE WHEN ud.sales_status = '4' AND DATE(ud.added_date) = '${today}' THEN 1 ELSE 0 END) AS today_cold`,
      ],
      conditions: [
        mentor_id
          ? {
              field: "ud.counsellor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        },
      ].filter(Boolean),
    });
    return { results };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const getActionsCount = async (req, res, next) => {
  try {
    const mentor_id = parseInt(req.query.mentor_id);
    const { user_type } = req.query;
    if (!user_type || !["OC", "Lead"].includes(user_type)) {
      return next(new ErrorHandler("Invalid user type", 400));
    }
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT lfl.follow_up_id) AS count`,
          `'today_follow_up_count' as type`,
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: `lfl.user_id = ud.user_id`,
          },
        ],
        condition: [
          { field: "lfl.follow_up_status", operator: "=", value: 1 },
          { field: "lfl.assigned_to", operator: "=", value: mentor_id },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: "=",
            value: `${today}`,
          },
        ].filter(Boolean),
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT lfl.follow_up_id) AS count`,
          `'month_follow_up_count' as type`,
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: `lfl.user_id = ud.user_id`,
          },
        ],
        condition: [
          { field: "lfl.follow_up_status", operator: "=", value: 1 },
          { field: "lfl.assigned_to", operator: "=", value: mentor_id },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: ">=",
            value: `${this_month}`,
          },
        ].filter(Boolean),
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT ud.user_id) AS count`,
          `'todays_consultation_call' as type`,
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = ud.user_id`,
          },
        ],
        condition: [
          { field: "cu.call_type", operator: "=", value: "30" },
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: `${today}`,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: 1,
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: mentor_id,
          },
        ].filter(Boolean),
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT ud.user_id) AS count`,
          `'month_consultation_call' as type`,
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.callUpdates} cu`,
            on: `cu.user_id = ud.user_id`,
          },
        ],
        condition: [
          { field: "cu.call_type", operator: "=", value: "30" },
          {
            field: "DATE(cu.schedule_date)",
            operator: ">=",
            value: `${this_month}`,
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: 1,
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: mentor_id,
          },
        ].filter(Boolean),
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT ud.user_id) AS count`,
          `'todays_action_assigned' as type`,
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.leadActionAssignedLog} laal`,
            on: `laal.user_id = ud.user_id`,
          },
        ],
        condition: [
          {
            field: "laal.action_assigned_to",
            operator: "=",
            value: mentor_id,
          },

          {
            field: "DATE(laal.action_assign_date)",
            operator: "=",
            value: `${today}`,
          },
        ].filter(Boolean),
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT ud.user_id) AS count`,
          `'monthly_action_assigned' as type`,
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.leadActionAssignedLog} laal`,
            on: `laal.user_id = ud.user_id`,
          },
        ],
        condition: [
          {
            field: "laal.action_assigned_to",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(laal.action_assign_date)",
            operator: ">=",
            value: `${this_month}`,
          },
        ].filter(Boolean),
      },
    ]);
    const data = {
      today_follow_up_count: results[0].count,
      monthly_follow_up_count: results[1].count,
      todays_consultation_call: results[2].count,
      monthly_consultation_call: results[3].count,
      todays_action_assigned: results[4].count,
      monthly_action_assigned: results[5].count,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Actions Count fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const statusBasedCount = async (req, res, next) => {
  try {
    const { user_type, mentor_id } = req.query;
    if (!user_type || !["OC", "Lead"].includes(user_type)) {
      return next(new ErrorHandler("Invalid user type", 400));
    }
    let data;
    if (user_type === "OC") {
      const { results } = await getOcStatusCount({ mentor_id });
      data = results[0];
    }
    if (user_type === "Lead") {
      const { results } = await getLeadStatusCount({ mentor_id });
      data = results[0];
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Status based Count fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCaptured = async (req, res, next) => {
  try {
    const { mentor_id, user_type } = req.query;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const selectFields = [];
    const joins = [];
    const conditions = [].filter(Boolean);

    console.log(this_month, 332);
    console.log(today, 333);

    if (String(user_type).toLowerCase() === "oc") {
      selectFields.push(
        `COUNT(DISTINCT CASE WHEN sp.added_date >= '${this_month}' AND com.new_mentor = ${mentor_id} AND com.old_mentor = 0 THEN 1 END) as self_monthly_oc_captured`,
        `COUNT(DISTINCT CASE WHEN sp.added_date = '${today}' AND com.new_mentor = ${mentor_id} AND com.old_mentor = 0 THEN 1 END) as self_today_oc_captured`,
        `COUNT(DISTINCT CASE WHEN sp.added_date >= '${this_month}' AND com.new_mentor = ${mentor_id} AND com.old_mentor <> 0 THEN 1 END) as reassigned_monthly_oc_captured`,
        `COUNT(DISTINCT CASE WHEN sp.added_date = '${today}' AND com.new_mentor = ${mentor_id} AND com.old_mentor <> 0 THEN 1 END) as reassigned_today_oc_captured`
      );
      joins.push(
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.changeOfMentor} com`,
          on: "com.user_id = ud.user_id",
        },
        {
        type: "LEFT",
        table: `${tables.userDetails} ud`,
        on: "ud.user_id = com.user_id",
      }
      );
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
    }

    if (String(user_type).toLowerCase() === "lead") {
      selectFields.push(
        `SUM(CASE WHEN DATE(lal.assign_date) >= '${this_month}' AND lal.counsellor_id = '${mentor_id}' AND lal.assigned_by = ${mentor_id} THEN 1 ELSE 0 END) as self_monthly_lead_captured`,
        `SUM(CASE WHEN DATE(lal.assign_date) = '${today}' AND lal.counsellor_id = '${mentor_id}' AND lal.assigned_by = ${mentor_id} THEN 1 ELSE 0 END) as self_today_lead_captured`,
        `SUM(CASE WHEN DATE(lal.assign_date) >= '${today}' AND lal.counsellor_id = '${mentor_id}' AND lal.assigned_by <> ${mentor_id} THEN 1 ELSE 0 END) as reassigned_today_lead_captured`,
        `SUM(CASE WHEN DATE(lal.assign_date) >= '${this_month}' AND lal.counsellor_id = '${mentor_id}' AND lal.assigned_by <> ${mentor_id} THEN 1 ELSE 0 END) as reassigned_monthly_lead_captured`
      );

      joins.push({
        type: "LEFT",
        table: `${tables.userDetails} ud`,
        on: "ud.user_id = lal.user_id",
      });
      conditions.push();
    }

    const { results } = await readRecord({
      table: `${tables.leadAssignedLog} lal`,
      selectFields,
      conditions,
      joins,
    });

    console.log(results, 317);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Captured fetched successfully",
      data: results[0],
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getHsStage = async (req, res, next) => {
  try {
    const { mentor_id, user_type } = req.query;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `SUM(
		CASE WHEN DATE(hs.created)  >= '${this_month}'
		AND ud.stage = '1' THEN 1 ELSE 0 END) AS 'first_stage_monthly_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  >= '${this_month}'
		AND ud.stage = '2' THEN 1 ELSE 0 END) AS 'second_stage_monthly_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  >= '${this_month}'
		AND ud.stage = '3' THEN 1 ELSE 0 END) AS 'third_stage_monthly_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  >= '${this_month}'
		AND ud.stage = '4' THEN 1 ELSE 0 END) AS 'fourth_stage_monthly_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  = '${today}'
		AND ud.stage = '1' THEN 1 ELSE 0 END) AS 'first_stage_today_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  = '${today}'
		AND ud.stage = '2' THEN 1 ELSE 0 END) AS 'second_stage_today_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  = '${today}'
		AND ud.stage = '3' THEN 1 ELSE 0 END) AS 'third_stage_today_count'`,
        `SUM(
		CASE WHEN DATE(hs.created)  = '${today}'
		AND ud.stage = '4' THEN 1 ELSE 0 END) AS 'fourth_stage_today_count'`,
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs`,
          on: "ud.user_id = hs.user_id",
        },
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value:
            String(user_type).toLowerCase() === "oc" ? "Completed" : "Lead",
        },
        mentor_id
          ? {
              field:
                String(user_type).toLowerCase() === "oc"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
      ].filter(Boolean),
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "HS Stage fetched successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getUnconvertedCounts = async (req, res, next) => {
  const { user_type, id } = req.body;
  if (!id && req.headers.source === "mentor_db") {
    return next(new ErrorHandler("ID is required", 400));
  }
  try {
    const primeSegmentConditions = [
      {
        field: `( (
        cd.country_id = 101 
        AND TIMESTAMPDIFF(YEAR, cd.birth_date, NOW()) >= 35 
        AND cd.birth_date != '0000-00-00'
    ) 
    OR (
        cd.country_id != 101 
        AND cd.country_id IS NOT NULL 
        AND cd.country_id != 0
    ))`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    const highSegmentConditions = [
      { field: "ls.source_group", operator: "IN", value: [3, 5] },
    ];
    const totalConditions = [];
    if (user_type === "OC") {
      primeSegmentConditions.push(
        { field: "cd.user_status", operator: "=", value: "Maintenance" },
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) }
      );
      highSegmentConditions.push(
        { field: "cd.user_status", operator: "=", value: "Maintenance" },
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) }
      );
      totalConditions.push(
        { field: "cd.user_status", operator: "=", value: "Maintenance" },
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) }
      );
    } else {
      primeSegmentConditions.push(
        { field: "cd.user_type", operator: "=", value: 0 },
        { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) }
      );
      highSegmentConditions.push(
        { field: "cd.user_type", operator: "=", value: 0 },
        { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) }
      );
      totalConditions.push(
        { field: "cd.user_type", operator: "=", value: 0 },
        { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) }
      );
    }
    const counts = await readRecordUnion([
      {
        selectField: [`COUNT(cd.user_id) AS COUNT`, "'prime_segment' AS type"],
        table: `${tables.userDetails} cd`,
        condition: primeSegmentConditions,
      },
      {
        selectField: [`COUNT(cd.user_id) AS COUNT`, "'high_potential' AS type"],
        table: `${tables.userDetails} cd`,
        condition: highSegmentConditions,
        join: [
          {
            type: "LEFT",
            table: `${tables.leadSource} ls`,
            on: "cd.current_lead_source = ls.source_id",
          },
        ],
      },
      {
        selectField: [`COUNT(cd.user_id) AS COUNT`, "'total' AS type"],
        table: `${tables.userDetails} cd`,
        condition: totalConditions,
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "",
    });
  } catch (error) {}
};

const getCapturedUserData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      prev_mentor_id,
      user_type,
      status,
      filter,
      page,
      limit,
      search,
    } = req.body;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const conditions = [];
    const joins = [];

    if (String(user_type).toLowerCase() === "oc") {
      if (String(status).toLowerCase() === "self") {
        joins.push({
          type: "LEFT",
          table: `${tables.changeOfMentor} com`,
          on: "com.user_id = ud.user_id",
        });
        conditions.push(
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "com.new_mentor",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "com.old_mentor",
            operator: "=",
            value: "0",
            raw: true,
          },
          {
            field: "sp.added_date",
            operator: String(filter).toLowerCase() === "mtd" ? ">=" : "=",
            value:
              String(filter).toLowerCase() === "mtd"
                ? `${this_month}`
                : `${today}`,
          }
        );
      } else {
        joins.push({
          type: "LEFT",
          table: `${tables.changeOfMentor} com`,
          on: "com.user_id = ud.user_id",
        });
        conditions.push(
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "com.new_mentor",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "com.old_mentor",
            operator: "<>",
            value: "0",
            raw: true,
          },
          {
            field: "sp.added_date",
            operator: String(filter).toLowerCase() === "mtd" ? ">=" : "=",
            value:
              String(filter).toLowerCase() === "mtd"
                ? `${this_month}`
                : `${today}`,
          }
        );
      }
    } else {
      if (String(user_type).toLowerCase() === "lead") {
        if (String(status).toLowerCase() === "self") {
          joins.push({
            type: "LEFT",
            table: `${tables.leadAssignedLog} lal`,
            on: "ud.user_id = lal.user_id",
          });
          conditions.push(
            {
              field: "lal.counsellor_id",
              operator: "=",
              value: mentor_id,
            },
            {
              field: "lal.assigned_by",
              operator: "=",
              value: mentor_id,
            },
            {
              field: "DATE(lal.assign_date)",
              operator: String(filter).toLowerCase() === "mtd" ? ">=" : "=",
              value:
                String(filter).toLowerCase() === "mtd"
                  ? `${this_month}`
                  : `${today}`,
            }
          );
        } else {
          joins.push(
            {
              type: "LEFT",
              table: `${tables.leadAssignedLog} lal`,
              on: "ud.user_id = lal.user_id",
            },
            {
              type: "LEFT",
              table: `${tables.adminUsers} ad2`,
              on: "lal.assigned_by = ad2.admin_user_id",
            }
          );
          conditions.push(
            {
              field: "lal.counsellor_id",
              operator: "=",
              value: mentor_id,
            },
            {
              field: "lal.assigned_by",
              operator: "<>",
              value: mentor_id,
            },
            {
              field: "DATE(lal.assign_date)",
              operator: String(filter).toLowerCase() === "mtd" ? ">=" : "=",
              value:
                String(filter).toLowerCase() === "mtd"
                  ? `${this_month}`
                  : `${today}`,
            }
          );
          if (prev_mentor_id) {
            conditions.push({
              field: "lal.assigned_by",
              operator: "=",
              value: prev_mentor_id,
            });
          }
        }
      }
    }
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;

    const { data, total_page } = await dataFunction({
      ...(status != "self"
        ? {
            extraSelectFields: ["ad2.crm_user as assigned_by"],
            extraObjects: (i) => ({ assigned_by: i.assigned_by }),
          }
        : {}),
      search,
      extraConditions: conditions,
      ...(joins.length > 0 && { extraJoins: joins }),
      limit,
      page,
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Captured User Data fetched successfully",
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFollowupUserData = async (req, res, next) => {
  try {
    const { page, limit, search, filter, mentor_id, user_type } = req.body;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    const dataFunction =
      String(user_type.toLowerCase()) === "oc"
        ? getFormattedUserData
        : getFormattedLeadData;

    const { data, totalCount } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.leadFollowUpLogs} lfl`,
          on: `lfl.user_id = ud.user_id`,
        },
      ],
      extraConditions: [
        { field: "lfl.assigned_to", operator: "=", value: mentor_id },
        { field: "lfl.follow_up_status", operator: "=", value: 1 },
        {
          field: "DATE(lfl.follow_up_date)",
          operator: String(filter) === "mtd" ? ">=" : "=",
          value: String(filter) === "mtd" ? `${this_month}` : `${today}`,
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Follow up User Data fetched successfully",
      data,
      totalCount,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getConsultationUserData = async (req, res, next) => {
  try {
    const { page, limit, search, filter, mentor_id, user_type } = req.body;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    const dataFunction =
      String(user_type.toLowerCase()) === "oc"
        ? getFormattedUserData
        : getFormattedLeadData;
    const { data, totalCount } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.callUpdates} cu`,
          on: `cu.user_id = ud.user_id`,
        },
      ],
      extraConditions: [
        user_type === "OC"
          ? {
              field: "ud.user_type",
              operator: "!=",
              value: "0",
            }
          : {
              field: "ud.user_type",
              operator: "=",
              value: "0",
            },
        mentor_id
          ? {
              field: "cu.added_by",
              operator: "=",
              value: mentor_id,
            }
          : null,
        { field: "cu.call_status", operator: "=", value: 1 },
        { field: "cu.call_type", operator: "=", value: "30" },
        {
          field: "DATE(cu.schedule_date)",
          operator: String(filter) === "mtd" ? ">=" : "=",
          value: String(filter) === "mtd" ? `${this_month}` : `${today}`,
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Consultation User Data fetched successfully",
      data,
      totalCount,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getActionAssignedUserData = async (req, res, next) => {
  try {
    const { page, limit, search, filter, mentor_id, user_type } = req.body;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "INNER",
          table: `${tables.leadActionAssignedLog} laal`,
          on: `laal.user_id = ud.user_id`,
        },
      ],
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "OC" ? "Completed" : "Lead",
        },
        mentor_id
          ? {
              field:
                user_type === "OC"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
        {
          field: "DATE(laal.action_assign_date)",
          operator: String(filter) === "mtd" ? ">=" : "=",
          value: String(filter) === "mtd" ? `${this_month}` : `${today}`,
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Action Assigned User Data fetched successfully",
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getStageWiseUserData = async (req, res, next) => {
  try {
    const { page, limit, search, filter, mentor_id, user_type, stage } =
      req.body;
    const this_month = moment().startOf("month").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        String(user_type) === "oc"
          ? {
              type: "INNER",
              table: `${tables.healthScoreClient} hs`,
              on: `ud.user_id = hs.user_id`,
            }
          : null,
      ].filter(Boolean),
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value:
            String(user_type).toLowerCase() === "oc" ? "Completed" : "Lead",
        },
        {
          field: "hs.created",
          operator: String(filter).toLowerCase() === "mtd" ? ">=" : "=",
          value:
            String(filter).toLowerCase() === "mtd"
              ? `${this_month}`
              : `${today}`,
        },
        mentor_id
          ? {
              field:
                String(user_type).toLowerCase() === "oc"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
        {
          field: "ud.stage",
          operator: "=",
          value: parseInt(stage),
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Stage wise User Data fetched successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getStatusData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      user_type,
      status,
      page,
      limit,
      search,
      period = "mtd",
    } = req.body;
    const pagination = { page, limit };
    const conditions = [];
    const joins = [];
    const today = moment().format("YYYY-MM-DD");
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "sp.status",
          operator: "=",
          value: String(status),
        },
        {
          field: "sp.added_date",
          operator: period === "mtd" ? "BETWEEN" : "=",
          value: period === "mtd" ? [startOfMonth, today] : today,
        }
      );
      joins.push({
        type: "INNER",
        table: `${tables.suggestedProgram} sp`,
        on: "cd.suggested_program_id = sp.suggested_program_id",
      });
    } else if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "cd.sales_status",
          operator: "=",
          value: status,
        },
        {
          field: "cd.added_date",
          operator: period === "mtd" ? "BETWEEN" : "=",
          value: period === "mtd" ? [startOfMonth, today] : today,
        }
      );
    }
    const { results: users, totalCount } = await readRecord({
      selectFields: ["cd.user_id"],
      table: `${tables.userDetails} cd`,
      conditions,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      joins,
      countTotal: true,
    });
    console.log(users.length, 713);
    if (users.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Status Data fetched successfully",
        data: [],
        totalCount,
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
      const mappedData = mapUserData({ user, details: details[index] });
      return mappedData;
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Status Data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  getActionAssignedUserData,
  getActionsCount,
  getCaptured,
  getCapturedUserData,
  getConsultationUserData,
  getFollowupUserData,
  getHsStage,
  getStageWiseUserData,
  getStatusData,
  getUnconvertedCounts,
  statusBasedCount,
};
