import moment from "moment";
import { readRecord, readRecordUnion } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import {
  acknowledgeAdditionalQuestions,
  acknowledgeLeadFeedback,
  acknowledgeLeadMilestone,
  acknowledgeLeadWeight,
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonJoinsOC,
  getCommonSelectFields,
  getCommonSelectFieldsOC,
  joinsMap,
  mapLeadDataNew,
  mapOCData,
  mapUserData,
  readRecordNewForLead,
  selectMap,
  withMap,
} from "../../helper/common.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { buildCartWhatsappMessages } from "../../helper/emailAutochatTemplateHelpers/getAutoCartCreationMessageTemplates.js";
const howsMyDay = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    let unanswered_queries = 0;
    let clara_queries = 0;
    const data = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: ["COUNT(DISTINCT cu.call_id) AS count", "'calls' as type"],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "<>", value: "14" },
          { field: "ud.user_status", operator: "=", value: "Completed" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
      },
      {
        table: `${tables.leadFollowUpLogs} fu`,
        selectField: [
          "COUNT(DISTINCT fu.user_id) as count",
          "'follow_ups' as type",
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
          { field: "ud.user_status", operator: "=", value: "Completed" },
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
        table: `${tables.draftedQueries} dq`,
        selectField: [
          "COUNT( dq.user_id) as count",
          "'drafted_queries' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = dq.user_id",
          },
        ],
        condition: [
          {
            field: "dq.mentor_id",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
        ],
      },
      {
        table: `${tables.weightRecordsLead} wrl`,
        selectField: [
          "COUNT(DISTINCT wrl.user_id) as count",
          "'weight_tracker' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wrl.user_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "wrl.weight_acknowledge",
            operator: "=",
            value: 0,
          },
          {
            field: "DATE(wrl.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.leadFeedback} lf`,
        selectField: [
          "COUNT(DISTINCT lf.user_id) as count",
          "'consultation_feedback' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = lf.user_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "lf.type", operator: "=", value: "Consultation" },
          { field: "lf.is_ack", operator: "=", value: 0 },
          {
            field: "DATE(lf.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.leadFeedback} lf`,
        selectField: [
          "COUNT(DISTINCT lf.user_id) as count",
          "'app_feedback' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = lf.user_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "lf.type", operator: "=", value: "app" },
          { field: "lf.is_ack", operator: "=", value: 0 },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) as count",
          "'cross_calls' as type",
        ],
        condition: [
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_type", operator: "=", value: "50" },
          { field: "cu.call_status", operator: "=", value: 0 },
          {
            field: "DATE(cu.schedule_date)",
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
          "'oc_app_downloaded' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `(
        SELECT user_id, MIN(added_date) as added_date
        FROM ${tables.fcm_registry}
        GROUP BY user_id
      ) fcm`,
            on: "ud.user_id = fcm.user_id",
          },
        ],
        condition: [
          {
            field: "DATE(fcm.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT sp.user_id) as count",
          "'oc_suggested' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = sp.user_id",
          },
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
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
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.user_id) as count",
          "'oc_engagements' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = lel.user_id",
          },
        ],
        condition: [
          { field: "lel.status", operator: "=", value: 0 },
          {
            field: "lel.added_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(lel.engagement_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    console.log("Data fetched successfully:", data);
    const userIds = await clientEnquiry.distinct("user_id", {
      mentor_id: parseInt(mentor_id),
      sender: "client",
      type: "query",
    });

    const claraUserIds = await clientEnquiry.distinct("user_id", {
      mentor_id: parseInt(mentor_id),
      type: "clara",
      sender: "client",
    });

    if (userIds.length > 0) {
      const { results: filteredUsers } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_id", operator: "IN", value: userIds },
        ],
      });

      unanswered_queries = filteredUsers.length;
    } else {
      unanswered_queries = 0;
    }
    if (claraUserIds.length > 0) {
      const { results: filteredClaraUsers } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_id", operator: "IN", value: claraUserIds },
        ],
      });

      clara_queries = filteredClaraUsers.length;
    } else {
      clara_queries = 0;
    }
    console.log(unanswered_queries, clara_queries);
    const finalData = {};
    data.forEach((item, index) => {
      if (index == 4) {
        finalData["unanswered_queries"] = unanswered_queries;
        finalData["clara_activity"] = clara_queries;
      }
      finalData[item.type] = parseInt(item.count);
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Hows My Day data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in howsMyDay controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const callsOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const conditions = [
      { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
      { field: "cu.call_type", operator: "<>", value: "14" },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Completed",
      },
      { field: "cu.call_status", operator: "=", value: 0 },
    ];
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "tomorrow",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "missed",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "future",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: ">",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
    ]);
    conditions.push(...filterMap.get(filter));
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "cu.call_id",
        "cu.call_type",
        "cu.call_status",
        `GROUP_CONCAT(
        DISTINCT basm.appointment_slots
        ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', '
    ) AS appointment_slots`,
        "cu.slot_id",
        "(SELECT COUNT(*) FROM call_updates cu WHERE cu.user_id = cd.user_id AND DATE(cu.schedule_date) < CURDATE()) AS call_attempts",
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cu.user_id = cd.user_id",
        },
        ...getCommonJoins(),
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
      conditions,
      orderBy: ["CAST(SUBSTRING_INDEX(cu.slot_id, ',', 1) AS UNSIGNED)"],
      groupBy: ["cu.call_id", "cu.user_id"],
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
      const call_status = item.call_status;
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          call_details: {
            call_id: item.call_id || null,
            call_type: item.call_type || "N/A",
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
            appointment_slots: item.appointment_slots || "N/A",
            call_attempts: item.call_attempts || 0,
          },
        },
      });
      return mappedData;
    });
    const countsUnion = [];
    const baseConditions = conditions.filter(
      (cond) => !cond.field?.startsWith("DATE(cu.schedule_date)"),
    );

    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          `'${key}' as type`,
        ],
        condition: [...baseConditions, ...filterCondition],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = cu.user_id",
          },
        ],
      });
    }

    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Calls OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in callsOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const followUpsOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;

    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }

    // Common base conditions
    const conditions = [
      {
        field: "fu1.follow_up_status",
        operator: "=",
        value: "0",
        raw: true,
      },
      { field: "fu1.assigned_to", operator: "=", value: mentor_id },
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];

    // Filter conditions mapped by type
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "fu1.follow_up_date",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "tomorrow",
        [
          {
            field: "fu1.follow_up_date",
            operator: "=",
            value: moment().add(1, "days").format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "missed",
        [
          {
            field: "fu1.follow_up_date",
            operator: "<",
            value: moment().format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "future",
        [
          {
            field: "fu1.follow_up_date",
            operator: ">",
            value: moment().format("YYYY-MM-DD"),
          },
        ],
      ],
    ]);

    // Apply selected filter
    conditions.push(...filterMap.get(filter));

    // Main query to fetch paginated data
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields(), "fu1.follow_up_id"],
      table: `${tables.leadFollowUpLogs} fu1`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "fu1.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions,
      orderBy: ["fu1.slot_id "],
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

    // Map final response data
    const finalData = data.map((item) => {
      return mapOCData({
        details: item,
        addExtraKeyTo: {
          next_follow_up: {
            follow_up_id: item.follow_up_id || null,
          },
        },
      });
    });

    // Prepare union query for all counts
    const baseConditions = conditions.filter(
      (cond) => !cond.field?.startsWith("fu1.follow_up_date"),
    );

    const countsUnion = [];
    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.leadFollowUpLogs} fu1`,
        selectField: [
          "COUNT(DISTINCT fu1.user_id) as count",
          `'${key}' as type`,
        ],
        condition: [...baseConditions, ...filterCondition],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = fu1.user_id",
          },
        ],
      });
    }

    // Fetch counts per filter type
    const countData = await readRecordUnion(countsUnion);

    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });

    // Construct response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Follow Ups OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in followUpsOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const unansweredQueriesOCDashboard = async (req, res, next) => {
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
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
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
      return mapOCData({
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
      message: "Unanswered Queries OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in unansweredQueriesOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const claraQueriesOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.body;

    // Step 1: Efficient MongoDB Aggregation with mentor_id filter
    const chatDocsRaw = await clientEnquiry.aggregate([
      {
        $match: {
          type: "clara",
          mentor_id: parseInt(mentor_id),
          sender: "client",
        },
      },
      {
        $sort: { createdAt: -1 }, // oldest query first
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
          message: "No clara queries found",
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
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
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
      return mapOCData({
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
      message: "Clara Queries OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in claraQueriesOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const draftedQueriesOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields(), "dq.id", "dq.draft_text"],
      table: `${tables.draftedQueries} dq`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "dq.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "dq.mentor_id",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
      ],
      orderBy: ["dq.created_at DESC"],
      groupBy: ["dq.id"],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          drafted_query: {
            id: item.id || null,
            query: item.draft_text || "N/A",
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Drafted Queries OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in draftedQueriesOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const weightTrackerOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "DATE(wrl.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "yesterday",
        [
          {
            field: "DATE(wrl.added_date)",
            operator: "=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      ],
      [
        "mtd",
        [
          {
            field: "DATE(wrl.added_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      ],
    ]);
    const baseConditions = [
      {
        field: "cd.mentor_assigned",
        operator: "=",
        value: parseInt(mentor_id),
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Completed",
      },
      { 
        field: "wrl.weight_acknowledge",
        operator: "=",
        value: 0,
      },
    ];
    const conditions = [...baseConditions];

    conditions.push(...filterMap.get(filter));
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "wrl.id", 
        "wrl.weight",
        "wrl.added_date",
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
      orderBy: ["wrl.added_date DESC"],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          weight_details: {
            weight_id: item.id, 
            weight: item.weight || "N/A",
            added_date: item.added_date
              ? moment(item.added_date).format("YYYY-MM-DD")
              : "N/A",
          },
        },
      });
      return mappedData;
    });
    const countsUnion = [];
    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.weightRecordsLead} wrl`,
        selectField: [
          "COUNT(DISTINCT wrl.user_id) as count",
          `'${key}' as type`,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = wrl.user_id",
          },
        ],
        condition: [...baseConditions, ...filterCondition],
      });
    }
    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Weight Tracker OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in weightTrackerOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const consultationFeedbackOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const conditions = [
      {
        field: "cd.mentor_assigned",
        operator: "=",
        value: parseInt(mentor_id),
      },
      { field: "lf.type", operator: "=", value: "Consultation" },
      { field: "lf.is_ack", operator: "=", value: 0 },
    ];
    if (filter === "today") {
      conditions.push({
        field: "DATE(lf.added_date)",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      });
    } else if (filter === "missed") {
      conditions.push({
        field: "DATE(lf.added_date)",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      });
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "lf.feedback",
        "lf.added_date",
      ],
      table: `${tables.leadFeedback} lf`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "lf.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions,
      orderBy: ["lf.added_date DESC"],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          consultation_feedback: {
            feedback: item.feedback || "N/A",
            added_date: item.added_date
              ? moment(item.added_date).format("YYYY-MM-DD")
              : "N/A",
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Consultation Feedback OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in consultationFeedbackOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const appFeedbackOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "lf.feedback",
        "lf.added_date",
      ],
      table: `${tables.leadFeedback} lf`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "lf.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "lf.type", operator: "=", value: "app" },
        { field: "lf.is_ack", operator: "=", value: 0 },
      ],
      orderBy: ["lf.added_date DESC"],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          app_feedback: {
            feedback: item.feedback || "N/A",
            added_date: item.added_date
              ? moment(item.added_date).format("YYYY-MM-DD")
              : "N/A",
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Feedback OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appFeedbackOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const crossCallsOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }

    const conditions = [
      { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
      { field: "cu.call_type", operator: "=", value: "50" },
      { field: "cu.call_status", operator: "=", value: 0 },
    ];

    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "tomorrow",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "missed",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "future",
        [
          {
            field: "DATE(cu.schedule_date)",
            operator: ">",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
    ]);

    conditions.push(...filterMap.get(filter));

    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "cu.call_id",
        "cu.call_type",
        "cu.call_status",
        `GROUP_CONCAT(
          DISTINCT basm.appointment_slots
          ORDER BY STR_TO_DATE(basm.appointment_slots, '%h:%i %p') SEPARATOR ', '
        ) AS appointment_slots`,
        "cu.slot_id",
        `(SELECT COUNT(*) FROM call_updates cu WHERE cu.user_id = cd.user_id AND DATE(cu.schedule_date) < CURDATE()) AS call_attempts`,
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cu.user_id = cd.user_id",
        },
        ...getCommonJoins(),
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
      conditions,
      orderBy: ["CAST(SUBSTRING_INDEX(cu.slot_id, ',', 1) AS UNSIGNED)"],
      groupBy: ["cu.call_id", "cu.user_id"],
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
      const call_status = item.call_status;
      return mapOCData({
        details: item,
        extraMappings: {
          call_details: {
            call_id: item.call_id || null,
            call_type: item.call_type || "N/A",
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
            appointment_slots: item.appointment_slots || "N/A",
            call_attempts: item.call_attempts || 0,
          },
        },
      });
    });

    // Count data for each filter
    const countsUnion = [];
    const baseConditions = conditions.filter(
      (cond) => !cond.field?.startsWith("DATE(cu.schedule_date)"),
    );

    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          `'${key}' as type`,
        ],
        condition: [...baseConditions, ...filterCondition],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = cu.user_id",
          },
        ],
      });
    }

    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cross call OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in crossCallsOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ocAppDownloaded = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields(), "cd.device", "cd.app_version"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
        SELECT user_id, MIN(added_date) as added_date
        FROM ${tables.fcm_registry}
        GROUP BY user_id
      ) fcm`,
          on: "cd.user_id = fcm.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "DATE(fcm.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
      ],
      groupBy: ["cd.user_id"],
      orderBy: ["fcm.added_date DESC"],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          app_details: {
            device: item.device || "N/A",
            app_version: item.app_version || "N/A",
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OC App Downloaded data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in ocAppDownloaded controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ocSuggestedOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const conditions = [
      mentor_id
        ? { field: "sp.suggested_by", operator: "=", value: mentor_id }
        : null,
      { field: "cd.user_status", operator: "=", value: "Completed" },
      {
        field: "DATE(sp.added_date)",
        operator: "BETWEEN",
        value: [
          moment().startOf("day").format("YYYY-MM-DD"),
          moment().endOf("day").format("YYYY-MM-DD"),
        ],
      },
    ].filter(Boolean);
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions,
      orderBy: ["sp.added_date DESC"],
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OC Suggested data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in ocSuggestedLeadsDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const engagementTodayOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;
    // if (!mentor_id) {
    //   return next(new ErrorHandler("Mentor ID is required", 400));
    // }
    const conditions = [
      { field: "lel.status", operator: "=", value: 0 },
      mentor_id
        ? {
            field: "lel.added_by",
            operator: "=",
            value: parseInt(mentor_id),
          }
        : {
            field: "lel.added_by",
            operator: "NOT IN",
            value: [0, 10, 196],
          },
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "lel.engagement_date",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "tomorrow",
        [
          {
            field: "lel.engagement_date",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"),
          },
        ],
      ],
      [
        "missed",
        [
          {
            field: "lel.engagement_date",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "future",
        [
          {
            field: "lel.engagement_date",
            operator: ">",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
    ]);
    conditions.push(...filterMap.get(filter));
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "lel.engagement_note",
        "lel.type",
        "lel.id as engagement_id",
        "les.appointment_slots as engagement_time",
      ],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.slots} les`,
          on: "lel.slot_id = les.id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "lel.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions,
      orderBy: ["lel.slot_id "],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          engagement_details: {
            engagement_id: item.engagement_id,
            engagement_note: item.engagement_note || "N/A",
            type: item.type || "N/A",
            engagement_time: item.engagement_time,
          },
        },
      });
      return mappedData;
    });
    const countsUnion = [];
    const baseConditions = conditions.filter(
      (cond) => !cond.field?.startsWith("lel.engagement_date"),
    );
    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.user_id) as count",
          `'${key}' as type`,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
        condition: [...baseConditions, ...filterCondition],
      });
    }

    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Engagement Today OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in engagementTodayOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const riskAndMisses = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const data = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'calls_missed' as type",
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          mentor_id
            ? {
                field: "cu.added_by",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : { field: "cu.added_by", operator: "NOT IN", value: [0, 10, 196] },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "<>", value: "14" },
          { field: "ud.user_status", operator: "=", value: "Completed" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
      },
      {
        table: `${tables.leadFollowUpLogs} fu`,
        selectField: [
          "COUNT(DISTINCT fu.user_id) as count",
          "'follow_up_missed' as type",
        ],
        condition: [
          {
            field: "fu.follow_up_date",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "fu.follow_up_status",
            operator: "=",
            value: "0",
            raw: true,
          },
          mentor_id
            ? { field: "fu.assigned_to", operator: "=", value: mentor_id }
            : {
                field: "fu.assigned_to",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "ud.user_status", operator: "=", value: "Completed" },
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
        table: `${tables.leadFeedback} lf`,
        selectField: [
          "COUNT(DISTINCT lf.user_id) as count",
          "'consultation_feedback_missed' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = lf.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "ud.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "ud.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "lf.type", operator: "=", value: "Consultation" },
          { field: "lf.is_ack", operator: "=", value: 0 },
          {
            field: "DATE(lf.added_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) as count",
          "'cross_call_OD' as type",
        ],
        condition: [
          mentor_id
            ? {
                field: "cu.added_by",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : { field: "cu.added_by", operator: "NOT IN", value: [0, 10, 196] },
          { field: "cu.call_type", operator: "=", value: "50" },
          { field: "cu.call_status", operator: "=", value: 0 },
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'oc_without_app' as type",
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          mentor_id
            ? {
                field: "ud.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "ud.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "ud.device", operator: "IS", value: "NULL", raw: true },
        ],
      },
    ]);
    console.log(data);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Risk and Misses data fetched successfully",
      data: data.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in riskAndMisses controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ocWithoutApp = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
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
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
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
      const mappedData = mapOCData({ details: item });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OC without App data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in ocWithoutApp controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const solidSalesOpportunities = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'challenge_activity' as type",
        ],
        table: `${tables.walletLog} wl`,
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field:
              "wl.admin_user!=0 and wl.trans_type='C' and wl.date >='2026-01-05' and (wl.action like '%quiz%' or wl.action like '%challenge%')",
            operator: "",
            value: "",
            raw: true,
          },
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : null,
        ].filter(Boolean),
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = wl.user_id",
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT ct.user_id) as count",
          "'cart_added_today' as type",
        ],
        table: `${tables.cart} ct`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "ct.user_id = cd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
        ].filter(Boolean),
      },
      {
        selectField: [
          "COUNT(DISTINCT ct.user_id) as count",
          "'share_link_cart_added_today' as type",
        ],
        table: `${tables.cart} ct`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "ct.user_id = cd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
          {
            field: "ct.cart_code",
            operator: "!=",
            value: "''",
            raw: true,
          },

          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
        ].filter(Boolean),
      },
      {
        selectField: [
          "COUNT(DISTINCT ct.user_id) as count",
          "'cart_added' as type",
        ],
        table: `${tables.cart} ct`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "ct.user_id = cd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
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
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
        ].filter(Boolean),
      },
      {
        selectField: [
          "COUNT(DISTINCT ct.user_id) as count",
          "'share_link_cart_added' as type",
        ],
        table: `${tables.cart} ct`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "ct.user_id = cd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
          {
            field: "ct.cart_code",
            operator: "!=",
            value: "''",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
        ].filter(Boolean),
      },
      {
        table: `${tables.inAppPageVisitLog} iapv`,
        selectField: [
          "COUNT(DISTINCT iapv.user_id) as count",
          "'checkout_visit' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = iapv.user_id",
          },
        ],
        condition: [
          { field: "iapv.page_type", operator: "=", value: 2 },
          {
            field: "iapv.visit_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          mentor_id
            ? {
                field: "ud.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "ud.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "ud.user_status", operator: "=", value: "Completed" },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared' as type",
        ],
        condition: [
          mentor_id
            ? {
                field: "sp.suggested_by",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "sp.suggested_by",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            field: "sp.suggested_amount",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.suggested_amount",
            operator: "!=",
            value: 0,
          },
          {
            field: "DATE(sp.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.leadsActivatedFeatures} la`,
        selectField: [
          "COUNT(DISTINCT la.user_id) as count",
          "'oc_with_double_discount' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "la.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.prizeDetails} pd`,
            on: "la.user_id = pd.user_id",
          },
        ],
        condition: [
          {
            field: "JSON_VALID(la.coupon)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "DATE(JSON_UNQUOTE(JSON_EXTRACT(la.coupon,'$.end_date')))",
            operator: ">=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "DATE(pd.added_date) + INTERVAL 3 DAY",
            operator: ">=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          mentor_id
            ? {
                field: "ud.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "ud.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'oc_health_score' as type",
        ],
        table: `${tables.userDetails} ud`,
        join: [
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "ud.user_id = hs.user_id AND hs.type = '3'",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(hs.created)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hs.ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'referrals' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} rud`,
            on: "ud.referred_by = rud.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "rud.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "rud.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "ud.current_lead_source", operator: "=", value: 22 },
          { field: "rud.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(ud.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT wrl.user_id) as count",
          "'good_weight_loss' as type",
        ],
        table: `(
    SELECT *
    FROM (
        SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC) AS rn
        FROM ${tables.weightRecordsLead}
    ) sub
    WHERE rn = 1
) wrl`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "wrl.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `(
    SELECT *
    FROM (
        SELECT *,
               ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY added_date) AS rn
        FROM ${tables.weightRecordsLead}
        WHERE added_date BETWEEN '${moment()
          .startOf("month")
          .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("day")
          .format("YYYY-MM-DD")}'
    ) ranked_weights
    WHERE rn = 1
) msw`,
            on: "msw.user_id = cd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            field: "cd.user_status",
            operator: "=",
            value: "Completed",
          },
          { field: "msw.weight", operator: "IS NOT", value: "NULL", raw: true },
          {
            field: "cd.latest_weight",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.latest_weight", operator: "!=", value: 0 },
          { field: "msw.weight - cd.latest_weight", operator: ">=", value: 2 },
          { field: "wrl.weight_acknowledge", operator: "=", value: 0 },
        ],
      },
      {
        table: `${tables.leadFeedback} lfb`,
        selectField: [
          "COUNT(DISTINCT lfb.user_id) as count",
          "'good_consultation_feedback' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "lfb.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "lfb.type", operator: "=", value: "Consultation" },
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "JSON_VALID(lfb.feedback)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "LCASE(JSON_UNQUOTE(JSON_EXTRACT(lfb.feedback, '$.rating'))) = 'happy'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "DATE(lfb.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'1st_pitched' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "cd.suggested_program_id = sp.suggested_program_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "sp.status", operator: "=", value: "1" },
        ],
      },
      {
        table: `${tables.leadPhotoRecords} lpr`,
        selectField: [
          "COUNT(DISTINCT lpr.user_id) as count",
          "'photo_tracker' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "lpr.user_id = cd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(lpr.posted_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
          {
            field: "lpr.photo_acknowledge",
            operator: "=",
            value: 0,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'snack_purchase' as type",
        ],
        table: `${tables.product_orders} po`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "po.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "DATE(po.created_at)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "po.payment_status",
            operator: "NOT IN",
            value: "('Failed', 'Pending')",
            raw: true,
          },
        ].filter(Boolean),
      },
    ]);

    const remainingData = data.slice(2).reduce((acc, item) => {
      acc[item.type] = parseInt(item.count);
      return acc;
    }, {});
    const finalData = {
      abandoned_cart_unpaid: `${data[0]?.count || 0} | ${data[2]?.count || 0}`,
      cart_link_not_paid: `${data[1]?.count || 0} | ${data[3]?.count || 0}`,
      ...remainingData,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Solid Sales Opportunities data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in solidSalesOpportunities controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const checkoutVisitOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter = "today" } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const conditions = [
      { field: "rn", operator: "=", value: 1 },
      {
        field: "cd.mentor_assigned",
        operator: "=",
        value: parseInt(mentor_id),
      },
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "iapv.visit_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "yesterday",
        [
          {
            field: "iapv.visit_date",
            operator: "=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      ],
      [
        "day_before_yesterday",
        [
          {
            field: "iapv.visit_date",
            operator: "=",
            value: "CURDATE() - INTERVAL 2 DAY",
            raw: true,
          },
        ],
      ],
      [
        "mtd",
        [
          {
            field: "iapv.visit_date",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      ],
    ]);
    let date_filter = "= CURDATE()";
    if (filter === "yesterday") {
      date_filter = "= CURDATE() - INTERVAL 1 DAY";
    } else if (filter === "day_before_yesterday") {
      date_filter = "= CURDATE() - INTERVAL 2 DAY";
    } else if (filter === "mtd") {
      date_filter = `BETWEEN '${moment()
        .startOf("month")
        .format("YYYY-MM-DD")}' AND '${moment()
        .endOf("day")
        .format("YYYY-MM-DD")}'`;
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [
        {
          name: "page_visit_latest",
          query: `SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY visit_date DESC, visit_time DESC
         ) AS rn
  FROM in_app_page_visit_log 
  WHERE visit_date ${date_filter} AND page_type = 2`,
        },
        ...withMap.get("latest_health"),
      ],
      selectFields: [
        ...getCommonSelectFields(),
        "pvl.visit_date",
        "pvl.visit_time",
        "pvl.user_id",
        "pvpm.program_name as visit_program_name",
        "pvps.program_duration as visit_program_duration",
      ],
      table: `page_visit_latest pvl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "pvl.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pvpm`,
          on: "pvl.program_id = pvpm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} pvps`,
          on: "pvl.sessions = pvps.program_sessions AND pvl.program_id = pvps.program_id",
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
    const finalData = data.map((item, index) => {
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          checkout_visit_details: {
            visit_program_name: `${item.visit_program_name} (${item.visit_program_duration})`,
            visit_date: moment(item.visit_date).format("Do MMM YYYY"),
            visit_time: item.visit_time,
          },
        },
      });
      return mappedData;
    });
    const countsUnion = [];
    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.inAppPageVisitLog} iapv`,
        selectField: [
          "COUNT(DISTINCT iapv.user_id) AS count",
          `'${key}' as type`,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "iapv.user_id = cd.user_id",
          },
        ],
        condition: [
          ...conditions.slice(1),
          ...filterCondition,
          { field: "iapv.page_type", operator: "=", value: 2 },
        ],
      });
    }
    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Checkout Visit OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in checkoutVisitOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const paymentDetailsSharedOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const baseConditions = [
      {
        field: "sp.suggested_by",
        operator: "=",
        value: parseInt(mentor_id),
      },
      {
        field: "sp.suggested_amount",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "sp.suggested_amount",
        operator: "!=",
        value: 0,
      },
      {
        field: "cd.suggested_program_id",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "DATE(sp.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "yesterday",
        [
          {
            field: "DATE(sp.added_date)",
            operator: "=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      ],
      [
        "day_before_yesterday",
        [
          {
            field: "DATE(sp.added_date)",
            operator: "=",
            value: "CURDATE() - INTERVAL 2 DAY",
            raw: true,
          },
        ],
      ],
      [
        "mtd",
        [
          {
            field: "DATE(sp.added_date)",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD"),
              moment().endOf("month").format("YYYY-MM-DD"),
            ],
          },
        ],
      ],
    ]);
    const conditions = [...baseConditions];
    conditions.push(...(filterMap.get(filter) || []));
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.suggestedProgram} sp`,
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
        ...joinsMap.get("follow_up_new"),
        ...joinsMap.get("source"),
        ...joinsMap.get("consultation_new"),
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
    const finalData = data.map((item, index) => {
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const countsUnion = [];
    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          `'${key}' as type`,
        ],
        condition: [...baseConditions, ...filterCondition],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "sp.user_id = cd.user_id",
          },
        ],
      });
    }
    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Details Shared OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in paymentDetailsSharedOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ocWithDoubleDiscount = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.leadsActivatedFeatures} la`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "la.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.prizeDetails} pd`,
          on: "la.user_id = pd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "JSON_VALID(la.coupon)",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "DATE(JSON_UNQUOTE(JSON_EXTRACT(la.coupon,'$.end_date')))",
          operator: ">=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "DATE(pd.added_date) + INTERVAL 3 DAY",
          operator: ">=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OC with Double Discount data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in ocWithDoubleDiscount controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const referralDataOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit, filter } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const baseConditions = [
      {
        field: "rb.mentor_assigned",
        operator: "=",
        value: parseInt(mentor_id),
      },
      { field: "cd.current_lead_source", operator: "=", value: 22 },
      { field: "rb.user_status", operator: "=", value: "Completed" },
    ];
    const filterMap = new Map([
      [
        "today",
        [
          {
            field: "DATE(cd.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      ],
      [
        "yesterday",
        [
          {
            field: "DATE(cd.added_date)",
            operator: "=",
            value: "CURDATE() - INTERVAL 1 DAY",
            raw: true,
          },
        ],
      ],
      [
        "day_before_yesterday",
        [
          {
            field: "DATE(cd.added_date)",
            operator: "=",
            value: "CURDATE() - INTERVAL 2 DAY",
            raw: true,
          },
        ],
      ],
      [
        "mtd",
        [
          {
            field: "DATE(cd.added_date)",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD"),
              moment().endOf("month").format("YYYY-MM-DD"),
            ],
          },
        ],
      ],
    ]);
    const conditions = [...baseConditions];
    conditions.push(...(filterMap.get(filter) || []));
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "rb.first_name as user_referred_by",
        "cd.referred_by",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} rb`,
          on: "cd.referred_by = rb.user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("follow_up_new"),
        ...joinsMap.get("source"),
        ...joinsMap.get("consultation_new"),
      ],
      conditions,
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
      groupBy: ["cd.user_id"],
      countTotal: true,
    });
    const finalData = data.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
        addExtraKeyTo: {
          user_details: {
            referred_by: item.referred_by || null,
            user_referred_by: item.user_referred_by || "N/A",
          },
        },
      });
      return mappedData;
    });
    const countsUnion = [];
    for (const [key, filterCondition] of filterMap.entries()) {
      countsUnion.push({
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          `'${key}' as type`,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} rb`,
            on: "cd.referred_by = rb.user_id",
          },
        ],
        condition: [...baseConditions, ...filterCondition],
      });
    }
    const countData = await readRecordUnion(countsUnion);
    const counts = {};
    countData.forEach((item) => {
      counts[item.type] = parseInt(item.count);
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Referral Data OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
      meta_data: {
        counts,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in referralDataOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const goodWeightLossOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "wrl.added_date as weight_added_date",
        "wrl.weight as today_weight",
        "msw.weight as previous_weight",
        "msw.added_date as previous_weight_date",
        "msw.weight - wrl.weight AS weight_difference",
      ],
      table: `(
    SELECT *
    FROM (
        SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC) AS rn
        FROM ${tables.weightRecordsLead}
    ) sub
    WHERE rn = 1
) wrl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "wrl.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `(
    SELECT *
    FROM (
        SELECT *,
               ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY added_date) AS rn
        FROM ${tables.weightRecordsLead}
        WHERE added_date BETWEEN '${moment()
          .startOf("month")
          .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("day")
          .format("YYYY-MM-DD")}'
    ) ranked_weights
    WHERE rn = 1
) msw`,
          on: "msw.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        { field: "msw.weight", operator: "IS NOT", value: "NULL", raw: true },
        {
          field: "cd.latest_weight",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "cd.latest_weight", operator: "!=", value: 0 },
        { field: "msw.weight - cd.latest_weight", operator: ">=", value: 2 },
        { field: "wrl.weight_acknowledge", operator: "=", value: 0 },
      ],
      orderBy: ["wrl.added_date DESC"],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          weight_details: {
            latest_weight: item.today_weight,
            // previous_weight: item.previous_weight,
            weight_difference: item.weight_difference,
            added_date: item.weight_added_date
              ? moment(item.weight_added_date).format("Do MMM YYYY")
              : null,
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Good Weight Loss OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in goodWeightLossOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const goodConsultationFeedbackOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields(), "lfb.feedback", "lfb.type"],
      table: `${tables.leadFeedback} lfb`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "lfb.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "lfb.type", operator: "=", value: "Consultation" },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          field: "JSON_VALID(lfb.feedback)",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field:
            "LCASE(JSON_UNQUOTE(JSON_EXTRACT(lfb.feedback, '$.rating'))) = 'happy'",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "DATE(lfb.added_date)",
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          feedback: item.feedback ? item.feedback : {},
          type: item.type,
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Good Feedback OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error in goodConsultationFeedbackOCDashboard controller:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const firstPitchedOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadSaleStatusLog} lssl`,
          on: "cd.user_id = lssl.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "sp.status", operator: "=", value: "1" },
        {
          field: `DATE(CONVERT_TZ(
            STR_TO_DATE(LEFT(JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, '$[0].timestamp')), 23), 
            '%Y-%m-%dT%H:%i:%s.%f'), 
            '+00:00', '+05:30'))`,
          operator: "BETWEEN",
          value: [
            `"${moment().startOf("month").format("YYYY-MM-DD")}"`,
            `"${moment().endOf("day").format("YYYY-MM-DD")}"`,
          ],
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "First Pitched OC this month Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in firstPitchedOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const photoTrackerOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFieldsOC(),
        "lpr.photo_url",
        "lpr.posted_date",
        "lpr.photo_id",
      ],
      table: `${tables.leadPhotoRecords} lpr`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "lpr.user_id = cd.user_id",
        },
        ...getCommonJoinsOC(),
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          field: "DATE(lpr.posted_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: "lpr.photo_acknowledge",
          operator: "=",
          value: 0,
        },
      ],
    });
    const finalData = data.map((item, index) => {
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          photo_tracker_details: {
            id: item.photo_id,
            photo_url: item.photo_url,
            posted_date: item.posted_date
              ? moment(item.posted_date).format("Do MMM YYYY")
              : null,
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Photo Tracker OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in photoTrackerOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const snackPurchaseOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFieldsOC(),
        "CONCAT('[',GROUP_CONCAT(JSON_OBJECT('product_id', po.product_id,'product_name',po.product_name,'product_code',po.product_code, 'quantity', po.quantity, 'pack_size', po.pack_size,'price_per_unit', po.price_per_unit, 'total_price', po.total_price,'purchase_date', po.created_at)),']') as purchase_info",
      ],
      table: `${tables.product_orders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
        ...getCommonJoinsOC(),
      ],
      conditions: [
        mentor_id
          ? {
              field: "cd.mentor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : {
              field: "cd.mentor_assigned",
              operator: "NOT IN",
              value: [0, 10, 196],
            },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
        {
          field: "DATE(po.created_at)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
      ],
      groupBy: ["cd.user_id"],
      countTotal: true,
    });
    const finalData = data.map((item, index) => {
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          purchase_info: item.purchase_info
            ? safeJSONParse(item.purchase_info)
            : {},
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Snack Purchase OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in snackPurchaseOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const cartAddedOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, filter = "today" } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFieldsOC(),
        "CONCAT('[',GROUP_CONCAT(ct.cart_items),']') as cart_info",
        "ct.cart_id",
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
        ...getCommonJoinsOC(),
      ],
      conditions: [
        mentor_id
          ? {
              field: "cd.mentor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : {
              field: "cd.mentor_assigned",
              operator: "NOT IN",
              value: [0, 10, 196],
            },
        { field: "cd.user_status", operator: "=", value: "Completed" },

        ...(filter === "mtd"
          ? [
              {
                field: "MONTH(ct.updated_date)",
                operator: "=",
                value: "MONTH(CURRENT_DATE())",
                raw: true,
              },
              {
                field: "YEAR(ct.updated_date)",
                operator: "=",
                value: "YEAR(CURRENT_DATE())",
                raw: true,
              },
            ]
          : [
              {
                field: "DATE(ct.updated_date)",
                operator: "=",
                value: "CURDATE()",
                raw: true,
              },
            ]),
        {
          field: "ct.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
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
      groupBy: ["cd.user_id"],
      countTotal: true,
    });
    const finalData = data.map((item, index) => {
      console.log(data[index], "DATA");
      const userDetail = { client_name: data[index].user_name };
      const cartData = item;
      console.log(userDetail, "userDetail");
      const { abandonedCartMessage } = buildCartWhatsappMessages(
        safeJSONParse(cartData.cart_info).flat(),
        userDetail,
        cartData,
      );
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          cart_info: item.cart_info ? safeJSONParse(item.cart_info).flat() : {},
        },
        addExtraKeyTo: {
          user_details: {
            whatsapp_text: abandonedCartMessage,
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cart Added OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in cartAddedOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const shareCartLinkAddedOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, filter = "today" } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFieldsOC(),
        "CONCAT('[',GROUP_CONCAT(ct.cart_items),']') as cart_info",
        "ct.cart_code",
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
        ...getCommonJoinsOC(),
      ],
      conditions: [
        mentor_id
          ? {
              field: "cd.mentor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : {
              field: "cd.mentor_assigned",
              operator: "NOT IN",
              value: [0, 10, 196],
            },
        { field: "cd.user_status", operator: "=", value: "Completed" },

        ...(filter === "mtd"
          ? [
              {
                field: "MONTH(ct.updated_date)",
                operator: "=",
                value: "MONTH(CURRENT_DATE())",
                raw: true,
              },
              {
                field: "YEAR(ct.updated_date)",
                operator: "=",
                value: "YEAR(CURRENT_DATE())",
                raw: true,
              },
            ]
          : [
              {
                field: "DATE(ct.updated_date)",
                operator: "=",
                value: "CURDATE()",
                raw: true,
              },
            ]),
        {
          field: "ct.user_id",
          operator: "NOT IN",
          value:
            "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
          raw: true,
        },
        {
          field: "JSON_LENGTH(ct.cart_items)",
          operator: ">",
          value: 0,
        },
        {
          field: "ct.cart_code",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
        {
          field: "ct.cart_code",
          operator: "!=",
          value: "''",
          raw: true,
        },
      ],
      groupBy: ["cd.user_id"],
      countTotal: true,
    });
    const finalData = data.map((item, index) => {
      const userDetail = { client_name: data[index].user_name };
      const cartData = item;
      console.log(userDetail, "userDetail");
      const { shareCartLinkMessage } = buildCartWhatsappMessages(
        safeJSONParse(cartData.cart_info).flat(),
        userDetail,
        cartData,
      );
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          cart_info: item.cart_info ? safeJSONParse(item.cart_info).flat() : {},
        },
        addExtraKeyTo: {
          user_details: {
            whatsapp_text: shareCartLinkMessage,
          },
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cart Added OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in cartAddedOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const challengeActivityOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields(), "wl.*"],
      table: `${tables.walletLog} wl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "wl.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          field:
            "wl.admin_user!=0 and wl.trans_type='C' and wl.date >='2026-01-05' and (wl.action like '%quiz%' or wl.action like '%challenge%')",
          operator: "",
          value: "",
          raw: true,
        },
        mentor_id
          ? {
              field: "cd.mentor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : {
              field: "cd.mentor_assigned",
              operator: "NOT IN",
              value: [0, 10, 196],
            },
      ],
      orderBy: ["wl.date DESC"],
      groupBy: ["cd.user_id", "wl.id"],
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wallet Activity OC Dashboard data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in walletActivityOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const ocHealhScoreData = async (req, res, next) => {
  try {
    const { search, page, limit, mentor_id } = req.body;

    const { results: ocHealthscoreData } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT ud.user_id) AS count",
        "'oc_healthscore' as type",
        'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
      ],
      table: `${tables.userDetails} ud`,
      joins: [
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "ud.user_id = hs.user_id AND hs.type = '3'",
        },
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Completed" },
        {
          field: "DATE(hs.created)",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "hs.ack",
          operator: "=",
          value: "0",
        },
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
      ],
    });

    console.log("IDS", ocHealthscoreData);

    let ids = safeJSONParse(ocHealthscoreData[0]?.user_ids) || [];

    if (!ids?.length > 0) {
      return next(new ErrorHandler("Invalid request", 400));
    }

    ids = ids?.join(",");

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
          value: `(${ids})`,
          raw: true,
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

const mtdSalesRisks = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const data = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'HOT_followups_pending' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: `cd.user_id = lfl.user_id AND lfl.follow_up_date BETWEEN '${moment()
              .startOf("month")
              .format("YYYY-MM-DD")}' AND '${moment()
              .endOf("day")
              .format("YYYY-MM-DD")}'`,
          },
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "cd.suggested_program_id = sp.suggested_program_id",
          },
        ],
        condition: [
          {
            field: "lfl.follow_up_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "sp.status", operator: "=", value: "2" },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'hot_payment_od' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "cd.suggested_program_id = sp.suggested_program_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "sp.status", operator: "=", value: "2" },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'wallet_expiring_tomorrow' as type",
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "cd.wallet_cycle_end_date",
            operator: "=",
            value: "CURDATE() + INTERVAL 1 DAY",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'extra_discount_expiring_tomorrow' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadsActivatedFeatures} laf`,
            on: "cd.user_id = laf.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.prizeDetails} pd`,
            on: "cd.user_id = pd.user_id",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            orConditions: [
              {
                field: "cd.wallet_cycle_end_date",
                operator: "=",
                value: "CURDATE() + INTERVAL 1 DAY",
                raw: true,
              },
              {
                field: "JSON_UNQUOTE(JSON_EXTRACT(laf.coupon, '$.end_date'))",
                operator: "=",
                value: "CURDATE() + INTERVAL 1 DAY",
                raw: true,
              },
              {
                field: "pd.added_date",
                operator: "=",
                value: "CURDATE() - INTERVAL 1 DAY",
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'HOT_oc_with_negative_feedback' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "cd.suggested_program_id = sp.suggested_program_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadFeedback} lfb`,
            on: "cd.user_id = lfb.user_id AND lfb.type = 'Consultation'",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "sp.status", operator: "=", value: "2" },
          {
            field: "LCASE(JSON_UNQUOTE(JSON_EXTRACT(lfb.feedback,'$.rating')))",
            operator: "=",
            value: "sad",
          },
          {
            field: "DATE(lfb.added_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "MTD Sales Risks data fetched successfully",
      data: data.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in mtdSalesRisks controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const hotFollowUpsPendingOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} lfl`,
          on: `cd.user_id = lfl.user_id AND lfl.follow_up_date BETWEEN '${moment()
            .startOf("month")
            .format("YYYY-MM-DD")}' AND '${moment()
            .endOf("day")
            .format("YYYY-MM-DD")}'`,
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "lfl.follow_up_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "sp.status", operator: "=", value: "2" },
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
      message: "Hot Follow Ups Pending OC data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in hotFollowUpsPendingOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const hotPaymentOverdueOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
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
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "sp.status", operator: "=", value: "2" },
        {
          field: "DATE(sp.payment_expiry)",
          operator: "<",
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "To Pay Overdue OC data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in toPayOverdueOCDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const walletExpiringTomorrowOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [...getCommonJoins()],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          field: "cd.wallet_cycle_end_date",
          operator: "=",
          value: "CURDATE() + INTERVAL 1 DAY",
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wallet expiring tomorrow OC data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error in walletExpiringTomorrowOCDashboard controller:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const extraDiscountExpiringTomorrowOCDashboard = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadsActivatedFeatures} laf`,
          on: "cd.user_id = laf.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.prizeDetails} pd`,
          on: "cd.user_id = pd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          orConditions: [
            {
              field: "cd.wallet_cycle_end_date",
              operator: "=",
              value: "CURDATE() + INTERVAL 1 DAY",
              raw: true,
            },
            {
              field: "JSON_UNQUOTE(JSON_EXTRACT(laf.coupon, '$.end_date'))",
              operator: "=",
              value: "CURDATE() + INTERVAL 1 DAY",
              raw: true,
            },
            {
              field: "pd.added_date",
              operator: "=",
              value: "CURDATE() - INTERVAL 1 DAY",
              raw: true,
            },
          ],
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
      const mappedData = mapOCData({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Extra discount expiring tomorrow OC data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error in extraDiscountExpiringTomorrorwLeadDB controller:",
      error,
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const hotOCWithNegativeFeedback = async (req, res, next) => {
  try {
    const { mentor_id, search, page, limit } = req.body;
    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields(), "lfb.feedback"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadFeedback} lfb`,
          on: "cd.user_id = lfb.user_id AND lfb.type = 'Consultation'",
        },
        ...getCommonJoins(),
      ],
      conditions: [
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "sp.status", operator: "=", value: "2" },
        ,
        {
          field: "LCASE(JSON_UNQUOTE(JSON_EXTRACT(lfb.feedback,'$.rating')))",
          operator: "=",
          value: "sad",
        },
        {
          field: "DATE(lfb.added_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
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
      const mappedData = mapOCData({
        details: item,
        extraMappings: {
          feedback: item.feedback ? item.feedback : {},
        },
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Hot OCs with negative feedback fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in hotOCWithNegativeFeedback controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const acknowledgeEntriesLeadsDashboard = async (req, res, next) => {
  try {
    const { type, id, mentor_id } = req.body;
    if (!mentor_id || !id || !type) {
      return next(new ErrorHandler("Mentor ID, ID and Type are required", 400));
    }
    const typeMap = new Map([
      ["feedback", acknowledgeLeadFeedback],
      ["weight", acknowledgeLeadWeight],
      ["milestone", acknowledgeLeadMilestone],
      ["additional_question", acknowledgeAdditionalQuestions],
    ]);
    if (!typeMap.has(type)) {
      return next(new ErrorHandler("Invalid type provided", 400));
    }
    const acknowledgeFunction = typeMap.get(type);
    const { message, status } = await acknowledgeFunction(id, mentor_id);
    if (status) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: message,
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler(message, 400));
  } catch (error) {
    console.log("Error in acknowledgeEntriesLeadsDashboard controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  acknowledgeEntriesLeadsDashboard,
  appFeedbackOCDashboard,
  callsOCDashboard,
  cartAddedOCDashboard,
  consultationFeedbackOCDashboard,
  challengeActivityOCDashboard,
  checkoutVisitOCDashboard,
  claraQueriesOCDashboard,
  crossCallsOCDashboard,
  draftedQueriesOCDashboard,
  engagementTodayOCDashboard,
  extraDiscountExpiringTomorrowOCDashboard,
  firstPitchedOCDashboard,
  followUpsOCDashboard,
  goodConsultationFeedbackOCDashboard,
  goodWeightLossOCDashboard,
  hotFollowUpsPendingOCDashboard,
  hotOCWithNegativeFeedback,
  hotPaymentOverdueOCDashboard,
  howsMyDay,
  ocAppDownloaded,
  ocSuggestedOCDashboard,
  ocWithDoubleDiscount,
  ocWithoutApp,
  mtdSalesRisks,
  paymentDetailsSharedOCDashboard,
  photoTrackerOCDashboard,
  referralDataOCDashboard,
  riskAndMisses,
  solidSalesOpportunities,
  snackPurchaseOCDashboard,
  unansweredQueriesOCDashboard,
  walletExpiringTomorrowOCDashboard,
  weightTrackerOCDashboard,
};
