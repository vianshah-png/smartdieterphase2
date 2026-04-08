import { insertRecord, readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addUserKeyInsight = async (req, res, next) => {
  const { user_id, sub_order_id, key_insight, source, added_by } = req.body;
  if (!user_id || !sub_order_id || !key_insight || !source || !added_by) {
    return next(new ErrorHandler("All fields are required", 400));
  }
  try {
    const columns = [
      "user_id",
      "sub_order_id",
      "key_insight",
      "source",
      "added_by",
    ];
    const values = [user_id, sub_order_id, key_insight, source, added_by];
    const insertResult = await insertRecord(
      tables.userKeyInsight,
      columns,
      values
    );
    if (insertResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Key Insight Added Successfully",
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to add Key Insight", 500));
  } catch (error) {
    console.log(error, 27);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getKeyInsights = async (req, res, next) => {
  const { user_id, sub_order_id } = req.query;
  try {
    const { results } = await readRecord({
      selectFields: [
        "uki.id",
        "uki.user_id",
        "uki.sub_order_id",
        "uki.source",
        "uki.key_insight",
        "uki.added_date",
        "ad.crm_user as added_by",
        "pm.program_name",
        "sop.created_at as created_at",
      ],
      table: `${tables.userKeyInsight} uki`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "uki.added_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "uki.sub_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
      ],
      conditions: [
        {
          field: "uki.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: `(uki.key_insight IS NOT NULL AND uki.key_insight != "" AND TRIM(uki.key_insight) != "")`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      orderBy: ["uki.added_date DESC"],
    });

    const currentProgramKeyInsight = [];
    const oldProgramMap = new Map();

    // Split into current vs older
    results.forEach((result) => {
      if (Number(result.sub_order_id) === Number(sub_order_id)) {
        currentProgramKeyInsight.push(result);
      } else {
        if (!oldProgramMap.has(result.sub_order_id)) {
          oldProgramMap.set(result.sub_order_id, []);
        }
        oldProgramMap.get(result.sub_order_id).push(result);
      }
    });

    // Format "DD MMM YYYY"
    const formatDate = (dateStr) => {
      if (!dateStr) return "";
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    };

    // Build object { "ProgramName (Date)": [insights] }
    const olderProgramKeyInsight = {};
    const keyCounts = {}; // to handle duplicates cleanly

    oldProgramMap.forEach((insights) => {
      const programName = insights[0].program_name || "Unknown Program";
      const createdAt =
        formatDate(insights[0].created_at) || formatDate(insights[0].added_date);

      let programKey = `${programName} (${createdAt})`;

      // If the same key already exists, append counter to make it unique
      if (olderProgramKeyInsight[programKey]) {
        if (!keyCounts[programKey]) keyCounts[programKey] = 1;
        keyCounts[programKey]++;
        programKey = `${programKey} (${keyCounts[programKey]})`;
      }

      const sortedInsights = insights.sort(
        (a, b) => new Date(b.added_date) - new Date(a.added_date)
      );

      olderProgramKeyInsight[programKey] = sortedInsights;
    });

    // Current program with programName(date)
    const currentProgramKeyed = {};
    if (currentProgramKeyInsight.length > 0) {
      const programName =
        currentProgramKeyInsight[0].program_name || "Unknown Program";
      const createdAt =
        formatDate(currentProgramKeyInsight[0].created_at) ||
        formatDate(currentProgramKeyInsight[0].added_date);

      const programKey = `${programName} (${createdAt})`;
      currentProgramKeyed[programKey] = currentProgramKeyInsight.sort(
        (a, b) => new Date(b.added_date) - new Date(a.added_date)
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Key Insight Fetched Successfully",
      data: {
        currentProgramKeyInsight: currentProgramKeyInsight,
        olderProgramKeyInsight,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error, 59);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const addKeyInsightUtil = async ({
  user_id,
  sub_order_id,
  key_insight,
  source,
  added_by,
}) => {
  try {
    const columns = [
      "user_id",
      "sub_order_id",
      "key_insight",
      "source",
      "added_by",
    ];
    const values = [user_id, sub_order_id, key_insight, source, added_by];
    const insertResult = await insertRecord(
      tables.userKeyInsight,
      columns,
      values
    );
    if (insertResult.affectedRows === 1) {
      return true;
    }
    return false;
  } catch (error) {
    console.log(error, 27);
    return false;
  }
};

export { addUserKeyInsight, getKeyInsights, addKeyInsightUtil };
