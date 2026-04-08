import moment from "moment";
import {
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonSelectFields,
  mapLeadDataNew,
  mapOCData,
  mapUserData,
  readRecordNewForLead,
  withMap,
} from "../../helper/common.js";
import { app_versions, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import {
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import userNotification from "../../models/userNotificationModel.js";

const appDownloadCounts = async (req, res, next) => {
  try {
    const { filter = "" } = req.body;

    const userTypes = [
      [
        "lead",
        [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
          ...(filter
            ? [
                {
                  field: "cd.device",
                  operator: "=",
                  value: filter.toLowerCase(),
                },
              ]
            : []),
        ],
      ],
      [
        "oc",
        [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          ...(filter
            ? [
                {
                  field: "cd.device",
                  operator: "=",
                  value: filter.toLowerCase(),
                },
              ]
            : []),
        ],
      ],
    ];

    const data = await Promise.all(
      userTypes.map(async ([userType, conditions]) => {
        const { results } = await readRecordNewForLead({
          selectFields: [
            // === 24-hour comparisons ===
            "COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) <= 24 THEN fcm.user_id END) AS last_24_hours_count",
            "COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) > 24 AND TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) <= 48 THEN fcm.user_id END) AS last_24_to_48_hours_count",

            // === 48-hour comparisons ===
            "COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) <= 48 THEN fcm.user_id END) AS last_48_hours_count",
            "COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) > 48 AND TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) <= 96 THEN fcm.user_id END) AS last_48_to_96_hours_count",

            // === 72-hour comparisons ===
            "COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) <= 72 THEN fcm.user_id END) AS last_72_hours_count",
            "COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) > 72 AND TIMESTAMPDIFF(HOUR, fcm.added_date, NOW()) <= 144 THEN fcm.user_id END) AS last_72_to_144_hours_count",

            // === Weekly comparisons ===
            "COUNT(DISTINCT CASE WHEN DATE(fcm.added_date) >= CURDATE() - INTERVAL 7 DAY THEN fcm.user_id END) AS last_7_days_count",
            "COUNT(DISTINCT CASE WHEN DATE(fcm.added_date) < CURDATE() - INTERVAL 7 DAY AND DATE(fcm.added_date) >= CURDATE() - INTERVAL 14 DAY THEN fcm.user_id END) AS last_7_to_14_days_count",

            // === Monthly comparisons ===
            "COUNT(DISTINCT CASE WHEN MONTH(fcm.added_date) = MONTH(CURDATE()) AND YEAR(fcm.added_date) = YEAR(CURDATE()) THEN fcm.user_id END) AS this_month_count",
            "COUNT(DISTINCT CASE WHEN MONTH(fcm.added_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(fcm.added_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN fcm.user_id END) AS last_month_count",
          ],
          table: `${tables.fcm_registry} fcm`,
          joins: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "fcm.user_id = cd.user_id",
            },
          ],
          conditions: [
            {
              field: "DATE(fcm.added_date)",
              operator: ">=",
              value: `${moment()
                .subtract(1, "month")
                .startOf("month")
                .format("YYYY-MM-DD")}`,
            },
            ...conditions,
          ],
        });
        return results;
      }),
    );

    // Merge results per user type
    const finalData = {};
    userTypes.forEach(([type], index) => {
      const counts = data[index][0];
      for (const key in counts) {
        if (!finalData[key]) finalData[key] = {};
        finalData[key][type] = counts[key];
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "App Download Counts (with trend comparison) fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in appDownloadCounts:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appDownloadData = async (req, res, next) => {
  try {
    const { filter = "", user_type = "", device = "" } = req.body;
    const condition = [];
    switch (filter) {
      case "last_24":
        condition.push({
          field: "TIMESTAMPDIFF(HOUR, fcm.added_date, NOW())",
          operator: "<=",
          value: 24,
        });
        break;
      case "last_48":
        condition.push({
          field: "TIMESTAMPDIFF(HOUR, fcm.added_date, NOW())",
          operator: "<=",
          value: 48,
        });
        break;
      case "last_72":
        condition.push({
          field: "TIMESTAMPDIFF(HOUR, fcm.added_date, NOW())",
          operator: "<=",
          value: 72,
        });
        break;
      case "last_7_days":
        condition.push({
          field: "DATE(fcm.added_date)",
          operator: ">=",
          value: "CURDATE() - INTERVAL 7 DAY",
          raw: true,
        });
        break;
      default:
        condition.push({
          field: "DATE(fcm.added_date)",
          operator: ">=",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        });
        break;
    }
    if (user_type.toLowerCase() === "lead") {
      condition.push(
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      );
    } else if (user_type.toLowerCase() === "oc") {
      condition.push(
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "cd.user_type", operator: "=", value: "1" },
      );
    } else {
      condition.push({
        field:
          "((cd.user_type='0' AND cd.phone_code != '' and cd.counsellor_assigned NOT IN (10, 0, 196)) OR (cd.user_type='1' AND cd.user_status='Completed'))",
        operator: "",
        value: "",
        raw: true,
      });
    }

    if (device.toLowerCase() === "android") {
      condition.push({ field: "cd.device", operator: "=", value: "android" });
    } else if (device.toLowerCase() === "ios") {
      condition.push({
        field: "cd.device",
        operator: "IN",
        value: ["ios", "iPadOS"],
      });
    }
    const { results } = await readRecordNewForLead({
      withQueries: [
        ...withMap.get("latest_health"),
        {
          name: "latest_fcm",
          query: `SELECT *
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC) AS rn
        FROM ${tables.fcm_registry}
      ) ranked
      WHERE rn = 1`,
        },
      ],
      selectFields: [
        ...getCommonSelectFields(),
        "fcm.added_date AS app_install_date",
      ],
      table: `latest_fcm  fcm`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "fcm.user_id = cd.user_id",
        },
        ...getCommonJoins(),
      ],
      conditions: [...condition],
      groupBy: ["fcm.user_id"],
      orderBy: ["fcm.added_date DESC"],
    });
    const formatFunction = user_type === "lead" ? mapLeadDataNew : mapOCData;
    const finalData = results.map((item, index) => {
      const mappedData = formatFunction({
        details: item,
        extraMappings: {
          app_details: {
            device: item.user_device,
            app_version: item.user_app_version,
            last_app_install_date: item.app_install_date,
          },
        },
        removeFields: ["health_details", "next_follow_up"],
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Download Usage Data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appDownloadUsageData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appUsageOverview = async (req, res, next) => {
  try {
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
    ];
    const dataPartOne = await readRecordUnion([
      {
        selectField: [
          "COUNT(CASE WHEN DATE(fcm.added_date) = CURDATE() THEN 1 END) AS today_count",
          "COUNT(CASE WHEN MONTH(fcm.added_date) = MONTH(CURDATE()) AND YEAR(fcm.added_date) = YEAR(CURDATE()) THEN 1 END) AS this_month_count",
          "'total_downloads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `(
        SELECT user_id, MIN(added_date) as added_date
        FROM ${tables.fcm_registry}
        GROUP BY user_id
      ) fcm`,
            on: "cd.user_id = fcm.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "DATE(fcm.added_date)",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
        ],
      },
      {
        selectField: [
          "COUNT(CASE WHEN DATE(fcm.added_date) = CURDATE() THEN 1 END) AS today_count",
          "COUNT(CASE WHEN MONTH(fcm.added_date) = MONTH(CURDATE()) AND YEAR(fcm.added_date) = YEAR(CURDATE()) THEN 1 END) AS this_month_count",
          "'lead_with_app' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `(
        SELECT user_id, MIN(added_date) as added_date
        FROM ${tables.fcm_registry}
        GROUP BY user_id
      ) fcm`,
            on: "cd.user_id = fcm.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "DATE(fcm.added_date)",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
        ],
      },
      {
        selectField: [
          "COUNT(CASE WHEN DATE(cd.added_date) = CURDATE() THEN 1 END) AS today_count",
          "COUNT(CASE WHEN MONTH(cd.added_date) = MONTH(CURDATE()) AND YEAR(cd.added_date) = YEAR(CURDATE()) THEN 1 END) AS this_month_count",
          "'leads_without_app' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "DATE(cd.added_date)",
            operator: ">=",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          { field: "cd.device", operator: "IS", value: "NULL", raw: true },
          { field: "cd.app_version", operator: "IS", value: "NULL", raw: true },
        ],
      },
    ]);

    const dataPartTwo = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'leads_with_inactivity' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
          {
            field: "cd.app_version",
            operator: "IS",
            value: "NOT NULL",
            raw: true,
          },
          {
            field: `NOT EXISTS (
    SELECT 1
    FROM login_logs ll
    WHERE ll.user_id = cd.user_id
      AND ll.added_date >= CURDATE() - INTERVAL 5 DAY
)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'app_conversion' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          {
            field: "cd.primary_lead_source",
            operator: "=",
            value: "32",
          },
          { field: "cd.user_type", operator: "=", value: "1" },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_from_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          {
            field: "cd.primary_lead_source",
            operator: "=",
            value: "32",
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
      },
    ]);
    const finalData = [...dataPartOne];
    finalData.push(dataPartTwo[0]);
    finalData.push({
      count: `${((dataPartTwo[1].count / dataPartTwo[2].count) * 100).toFixed(
        2,
      )}%`,
      type: "app_conversion",
    });
    console.log("App Usage Overview Data:", finalData);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Usage Overview fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appUsageOverview:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function getLatest3Semver(data) {
  return (
    data
      // Filter out entries that are not valid semantic versions (e.g., missing parts or non-numeric)
      .filter((item) => {
        const version = item.app_version;
        return (
          typeof version === "string" &&
          version.split(".").length === 3 &&
          version.split(".").every((part) => !isNaN(part))
        );
      })
      // Map to a simplified object with only version and count
      .map((item) => ({ version: item.app_version, count: item.count }))
      // Sort in descending order by semantic version
      .sort((a, b) => {
        const pa = a.version.split(".").map(Number);
        const pb = b.version.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) > (pb[i] || 0)) return -1;
          if ((pa[i] || 0) < (pb[i] || 0)) return 1;
        }
        return 0;
      })
      // Take the top 3 latest versions
      .slice(0, 3)
  );
}
// helper to compare version strings like "5.1.3"
function versionCompare(v1, v2) {
  const a = v1.split(".").map(Number);
  const b = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const appAnalyticsOverviewActive = async (req, res, next) => {
  try {
    const { filter = "mtd" } = req.body;
    const conditions = [
      {
        field: "cd.user_type",
        operator: "=",
        value: "1",
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
    ];
    const joins = [
      {
        type: "INNER",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
    ];
    if (filter === "mtd") {
      conditions.push({
        field: "sop.created_at",
        operator: "BETWEEN",
        value: [
          `${moment().startOf("month").format("YYYY-MM-DD")}`,
          `${moment().endOf("day").format("YYYY-MM-DD")}`,
        ],
      });
    } else if (filter === "last_24_hours") {
      conditions.push({
        field: "sop.created_at",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(24, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    } else if (filter === "last_48_hours") {
      conditions.push({
        field: "sop.created_at",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(48, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    }
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [...joins],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app_active_user' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          ...joins,
          {
            type: "INNER",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: ">=",
            value: "NOW() - INTERVAL 5 DAY",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app_inactive_user' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          ...joins,
          {
            type: "LEFT",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id AND ll.added_date >= NOW() - INTERVAL 5 DAY",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'without_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [...joins],
        condition: [
          ...conditions,
          {
            field: "(cd.device IS NULL OR cd.device = '')",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'not_updated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [...joins],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.app_version",
            operator: "NOT IN",
            value: [app_versions.android, app_versions.ios],
          },
          {
            field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    const { results: notUpdatedCountsAndroid } = await readRecord({
      selectFields: ["cd.app_version", "COUNT(DISTINCT cd.user_id) as count"],
      table: `${tables.userDetails} cd`,
      joins: [...joins],
      conditions: [
        ...conditions,
        {
          field: "cd.device IS NOT NULL AND cd.device != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version",
          operator: "NOT IN",
          value: [app_versions.android],
        },
        {
          field: "cd.device",
          operator: "=",
          value: "android",
        },
      ],
      groupBy: ["cd.app_version"],
    });
    const { results: notUpdatedCountsIos } = await readRecord({
      selectFields: ["cd.app_version", "COUNT(DISTINCT cd.user_id) as count"],
      table: `${tables.userDetails} cd`,
      joins: [...joins],
      conditions: [
        ...conditions,
        {
          field: "cd.user_type",
          operator: "=",
          value: "1",
        },
        {
          field: "cd.device IS NOT NULL AND cd.device != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version",
          operator: "NOT IN",
          value: [app_versions.ios],
        },
        {
          field: "cd.device",
          operator: "IN",
          value: ["ios", "iPadOS"],
        },
        // {
        //   field: "cd.app_version",
        //   operator: "NOT LIKE '%5.%'",
        //   value: "",
        //   raw: true,
        // },
      ],
      groupBy: ["cd.app_version"],
    });
    const notUpdatedCounts = {
      old_app_not_updated: 0,
      new_app_not_updated: 0,
    };

    // Android
    notUpdatedCountsAndroid.forEach(({ app_version, count }) => {
      if (versionCompare(app_version, "5.0.54") < 0) {
        // still on pre-2.0 version
        notUpdatedCounts.old_app_not_updated += count;
      } else {
        // on 2.0 or higher but not updated
        notUpdatedCounts.new_app_not_updated += count;
      }
    });

    // iOS
    notUpdatedCountsIos.forEach(({ app_version, count }) => {
      if (versionCompare(app_version, "1.1.09") < 0) {
        notUpdatedCounts.old_app_not_updated += count;
      } else {
        notUpdatedCounts.new_app_not_updated += count;
      }
    });

    console.log(notUpdatedCounts);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Analytics Overview Active fetched successfully",
      data: {
        ...data.reduce((acc, item) => {
          acc[item.type] = item.count;
          return acc;
        }, {}),
        on_old_app_not_updated: notUpdatedCounts.old_app_not_updated,
        on_new_app_not_updated: notUpdatedCounts.new_app_not_updated,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appAnalyticsOverviewActive:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appAnalyticsOverviewOC = async (req, res, next) => {
  try {
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app_active_user' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.loginLogs} ll`,
            on: "ll.user_id = cd.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: ">=",
            value: "NOW() - INTERVAL 5 DAY",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app_inactive_user' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id AND ll.added_date >= NOW() - INTERVAL 5 DAY",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'without_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "(cd.device IS NULL OR cd.device = '')",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'not_updated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "cd.user_type",
            operator: "=",
            value: "1",
          },
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.app_version",
            operator: "NOT IN",
            value: [app_versions.android, app_versions.ios],
          },
          {
            field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    console.log(data, 713);
    const { results: notUpdatedCountsAndroid } = await readRecord({
      selectFields: ["cd.app_version", "COUNT(DISTINCT cd.user_id) as count"],
      table: `${tables.userDetails} cd`,
      conditions: [
        ...conditions,
        {
          field: "cd.device IS NOT NULL AND cd.device != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.device",
          operator: "=",
          value: "android",
        },
        {
          field: "cd.app_version",
          operator: "!=",
          value: `${app_versions.android}`,
        },
      ],
      groupBy: ["cd.app_version"],
    });
    const { results: notUpdatedCountsIos } = await readRecord({
      selectFields: ["cd.app_version", "COUNT(DISTINCT cd.user_id) as count"],
      table: `${tables.userDetails} cd`,
      conditions: [
        ...conditions,
        {
          field: "cd.device IS NOT NULL AND cd.device != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version",
          operator: "!=",
          value: `${app_versions.ios}`,
        },
        {
          field: "(cd.device = 'ios' OR cd.device = 'iPadOS')",
          operator: "",
          value: "",
          raw: true,
        },
        // {
        //   field: "cd.app_version",
        //   operator: "NOT LIKE '%5.%'",
        //   value: "",
        //   raw: true,
        // },
      ],
      groupBy: ["cd.app_version"],
    });
    console.log(
      notUpdatedCountsAndroid.reduce((acc, { count }) => acc + count, 0),
      540,
    );
    console.log(
      notUpdatedCountsIos.reduce((acc, { count }) => acc + count, 0),
      540,
    );
    console.log(notUpdatedCountsIos);
    const notUpdatedCounts = {
      old_app_not_updated: 0,
      new_app_not_updated: 0,
    };

    // Android
    notUpdatedCountsAndroid.forEach(({ app_version, count }) => {
      if (versionCompare(app_version, "5.0.54") < 0) {
        // still on pre-2.0 version
        notUpdatedCounts.old_app_not_updated += count;
      } else {
        // on 2.0 or higher but not updated
        notUpdatedCounts.new_app_not_updated += count;
      }
    });

    // iOS
    notUpdatedCountsIos.forEach(({ app_version, count }) => {
      if (versionCompare(app_version, "1.1.09") < 0) {
        notUpdatedCounts.old_app_not_updated += count;
      } else {
        notUpdatedCounts.new_app_not_updated += count;
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Analytics Overview OC fetched successfully",
      data: {
        ...data.reduce((acc, item) => {
          acc[item.type] = item.count;
          return acc;
        }, {}),
        on_old_app_not_updated: notUpdatedCounts.old_app_not_updated,
        on_new_app_not_updated: notUpdatedCounts.new_app_not_updated,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appAnalyticsOverviewOC:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const appAnalyticsOverviewLead = async (req, res, next) => {
  try {
    const { filter = "mtd" } = req.body;
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
    ];
    if (filter === "mtd") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          `${moment().startOf("month").format("YYYY-MM-DD")}`,
          `${moment().endOf("day").format("YYYY-MM-DD")}`,
        ],
      });
    } else if (filter === "last_24_hours") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(24, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    } else if (filter === "last_48_hours") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(48, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    }
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app_active_user' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.loginLogs} ll`,
            on: "ll.user_id = cd.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: ">=",
            value: "NOW() - INTERVAL 5 DAY",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'with_app_inactive_user' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id AND ll.added_date >= NOW() - INTERVAL 5 DAY",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'without_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "cd.device",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'not_updated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...conditions,
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.app_version",
            operator: "NOT IN",
            value: [app_versions.android, app_versions.ios],
          },
          {
            field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    const { results: notUpdatedCountsAndroid } = await readRecord({
      selectFields: ["cd.app_version", "COUNT(DISTINCT cd.user_id) as count"],
      table: `${tables.userDetails} cd`,
      conditions: [
        ...conditions,
        {
          field: "cd.device IS NOT NULL AND cd.device != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version",
          operator: "NOT IN",
          value: [app_versions.android],
        },
        {
          field: "cd.device",
          operator: "=",
          value: "android",
        },
      ],
      groupBy: ["cd.app_version"],
    });
    const { results: notUpdatedCountsIos } = await readRecord({
      selectFields: ["cd.app_version", "COUNT(DISTINCT cd.user_id) as count"],
      table: `${tables.userDetails} cd`,
      conditions: [
        ...conditions,
        {
          field: "cd.device IS NOT NULL AND cd.device != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.app_version",
          operator: "NOT IN",
          value: [app_versions.ios],
        },
        {
          field: "cd.device",
          operator: "=",
          value: "ios",
        },
        {
          field: "cd.app_version",
          operator: "NOT LIKE '%5.%'",
          value: "",
          raw: true,
        },
      ],
      groupBy: ["cd.app_version"],
    });
    console.log(notUpdatedCountsAndroid, 540);
    console.log(notUpdatedCountsIos, 540);

    const notUpdatedCounts = {
      old_app_not_updated: 0,
      new_app_not_updated: 0,
    };

    // Android
    notUpdatedCountsAndroid.forEach(({ app_version, count }) => {
      if (versionCompare(app_version, "5.0.54") < 0) {
        // still on pre-2.0 version
        notUpdatedCounts.old_app_not_updated += count;
      } else {
        // on 2.0 or higher but not updated
        notUpdatedCounts.new_app_not_updated += count;
      }
    });

    // iOS
    notUpdatedCountsIos.forEach(({ app_version, count }) => {
      if (versionCompare(app_version, "1.1.09") < 0) {
        notUpdatedCounts.old_app_not_updated += count;
      } else {
        notUpdatedCounts.new_app_not_updated += count;
      }
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Analytics Overview Lead fetched successfully",
      data: {
        ...data.reduce((acc, item) => {
          acc[item.type] = item.count;
          return acc;
        }, {}),
        on_old_app_not_updated: notUpdatedCounts.old_app_not_updated,
        on_new_app_not_updated: notUpdatedCounts.new_app_not_updated,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appAnalyticsOverviewLead:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function normalizeDevice(device) {
  return (device || "").toLowerCase();
}

function isUserOnOldApp(user) {
  const device = normalizeDevice(user.device);
  if (!user.app_version) return false;

  if (device === "android")
    return versionCompare(user.app_version, "5.0.54") < 0;
  if (device === "ios" || device === "ipados")
    return versionCompare(user.app_version, "1.1.09") < 0;
  return false;
}

function isUserOnNewApp(user) {
  const device = normalizeDevice(user.device);
  if (!user.app_version) return false;

  if (device === "android")
    return versionCompare(user.app_version, "5.0.54") >= 0;
  if (device === "ios" || device === "ipados")
    return versionCompare(user.app_version, "1.1.09") >= 0;
  return false;
}

// Main filter logic
function filterUsersByType(results, type) {
  const validTypes = ["on_old_app_not_updated", "on_new_app_not_updated"];

  if (!validTypes.includes(type)) return results;

  return results.filter((user) => {
    if (type === "on_old_app_not_updated") {
      return isUserOnOldApp(user);
    } else if (type === "on_new_app_not_updated") {
      return isUserOnNewApp(user);
    }
    return true;
  });
}
const appAnalyticsOverviewActiveData = async (req, res, next) => {
  try {
    const { filter = "mtd", type, search } = req.body;
    const conditions = [
      {
        field: "cd.user_type",
        operator: "=",
        value: "1",
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
    ];
    const joins = [
      {
        type: "INNER",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
    ];
    const notUpdatedConditions = [
      {
        field: "cd.device IS NOT NULL AND cd.device != ''",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: `( (cd.device = 'android' AND cd.app_version NOT IN  ('${app_versions.android}')) OR ( (cd.device IN ('ios', 'iPadOS')) AND cd.app_version NOT IN  ('${app_versions.ios}') ) )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    const typeConditionMap = {
      with_app: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      with_app_active_user: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: ">=",
            value: "NOW() - INTERVAL 5 DAY",
            raw: true,
          },
        ],
        joins: [
          {
            type: "INNER",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id",
          },
        ],
      },
      with_app_inactive_user: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id AND ll.added_date >= NOW() - INTERVAL 5 DAY",
          },
        ],
      },
      without_app: {
        conditions: [
          {
            field: "(cd.device IS NULL OR cd.device = '')",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      not_updated: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.app_version",
            operator: "NOT IN",
            value: [app_versions.android, app_versions.ios],
          },
          {
            field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      on_old_app_not_updated: {
        conditions: [...notUpdatedConditions],
      },
      on_new_app_not_updated: {
        conditions: [...notUpdatedConditions],
      },
    };
    if (filter === "mtd") {
      conditions.push({
        field: "sop.created_at",
        operator: "BETWEEN",
        value: [
          `${moment().startOf("month").format("YYYY-MM-DD")}`,
          `${moment().endOf("day").format("YYYY-MM-DD")}`,
        ],
      });
    } else if (filter === "last_24_hours") {
      conditions.push({
        field: "sop.created_at",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(24, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    } else if (filter === "last_48_hours") {
      conditions.push({
        field: "sop.created_at",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(48, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    }
    const { results } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        "latest_fcm.added_date as fcm_added_date",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        ...joins,
        ...(typeConditionMap[type]?.joins || []),
        {
          type: "LEFT",
          table: `${tables.fcm_registry} latest_fcm`,
          on: `cd.user_id = latest_fcm.user_id AND latest_fcm.added_date = (SELECT MAX(added_date) FROM ${tables.fcm_registry} WHERE user_id = cd.user_id)`,
        },
      ],
      conditions: [
        ...conditions,
        ...(typeConditionMap[type]?.conditions || []),
      ],
      groupBy: ["cd.user_id"],
    });
    console.log(results.length, 1513);

    const users = filterUsersByType(results, type);
    console.log(users.length, 1513);
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
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
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
      },
      orderBy: orderById,
      ...(search && searchObj),
    });
    const mappedUsers = users.map((user, index) =>
      mapUserData({
        details: details[index],
        user: user.user_id,
        extraMappings: {
          app_details: {
            device: user.device,
            app_version: user.app_version,
            last_app_install_date: user.fcm_added_date,
          },
        },
      }),
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Analytics Overview Active Data fetched successfully",
      data: mappedUsers,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appAnalyticsOverviewActiveData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appAnalyticsOverviewOCData = async (req, res, next) => {
  try {
    const { type, search, page = 1, limit = 1000 } = req.body;

    const conditions = [
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];

    const notUpdatedConditions = [
      {
        field: "cd.device IS NOT NULL AND cd.device != ''",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: `( (cd.device = 'android' AND cd.app_version NOT IN ('${app_versions.android}')) 
                  OR ((cd.device IN ('ios', 'iPadOS')) AND cd.app_version NOT IN ('${app_versions.ios}')) )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const typeConditionMap = {
      with_app: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') 
                      OR ((cd.device = 'ios' OR cd.device = 'iPadOS') 
                      AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      with_app_active_user: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') 
                      OR ((cd.device = 'ios' OR cd.device = 'iPadOS') 
                      AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: ">=",
            value: "NOW() - INTERVAL 5 DAY",
            raw: true,
          },
        ],
        joins: [
          {
            type: "INNER",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id",
          },
        ],
      },
      with_app_inactive_user: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') 
                      OR ((cd.device = 'ios' OR cd.device = 'iPadOS') 
                      AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id AND ll.added_date >= NOW() - INTERVAL 5 DAY",
          },
        ],
      },
      without_app: {
        conditions: [
          {
            field: "(cd.device IS NULL OR cd.device = '')",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      not_updated: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.app_version",
            operator: "NOT IN",
            value: [app_versions.android, app_versions.ios],
          },
          {
            field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      on_old_app_not_updated: { conditions: [...notUpdatedConditions] },
      on_new_app_not_updated: { conditions: [...notUpdatedConditions] },
    };

    // Read records (DB pagination applied for all types except the special two)
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "cd.app_version",
        "cd.device",
        " latest_fcm.added_date as fcm_added_date",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        ...(typeConditionMap[type]?.joins || []),
        {
          type: "LEFT",
          table: `${tables.fcm_registry} latest_fcm`,
          on: `cd.user_id = latest_fcm.user_id AND latest_fcm.added_date = (SELECT MAX(added_date) FROM ${tables.fcm_registry} WHERE user_id = cd.user_id)`,
        },
      ],
      conditions: [
        ...conditions,
        ...(typeConditionMap[type]?.conditions || []),
      ],
      groupBy: ["cd.user_id"],
      ...(!["on_old_app_not_updated", "on_new_app_not_updated"].includes(
        type,
      ) && {
        pagination: { page: page || 1, limit: limit || 1000 },
      }),
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
    });

    console.log("Fetched:", results.length);

    // Filter users after fetching
    const filteredData = filterUsersByType(results, type);
    console.log("Filtered:", filteredData.length);

    // 🧩 Apply manual pagination for the two special types
    let paginatedData = filteredData;
    if (["on_old_app_not_updated", "on_new_app_not_updated"].includes(type)) {
      const startIndex = (page || 1 - 1) * (limit || 1000);
      const endIndex = startIndex + (limit || 1000);
      paginatedData = filteredData.slice(startIndex, endIndex);
    }

    // Map final data
    const finalData = paginatedData.map((item) =>
      mapOCData({
        details: item,
        extraMappings: {
          app_details: {
            device: item.device,
            app_version: item.app_version,
            last_app_install_date: item.fcm_added_date,
          },
        },
        removeFields: ["health_details", "next_follow_up"],
      }),
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Analytics Overview OC Data fetched successfully",
      data: finalData,
      totalCount: ["on_old_app_not_updated", "on_new_app_not_updated"].includes(
        type,
      )
        ? filteredData.length // use full filtered count for pagination info
        : totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appAnalyticsOverviewOCData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const appAnalyticsOverviewLeadData = async (req, res, next) => {
  try {
    const { filter = "mtd", type, search, page, limit } = req.body;
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
    ];
    const notUpdatedConditions = [
      {
        field: "cd.device IS NOT NULL AND cd.device != ''",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: `( (cd.device = 'android' AND cd.app_version NOT IN  ('${app_versions.android}')) OR ( (cd.device IN ('ios', 'iPadOS')) AND cd.app_version NOT IN  ('${app_versions.ios}') ) )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    const typeConditionMap = {
      with_app: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      with_app_active_user: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: ">=",
            value: "NOW() - INTERVAL 5 DAY",
            raw: true,
          },
        ],
        joins: [
          {
            type: "INNER",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id",
          },
        ],
      },
      with_app_inactive_user: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `((cd.device = 'android' AND cd.app_version = '${app_versions.android}') OR ((cd.device = 'ios' OR cd.device = 'iPadOS') AND cd.app_version = '${app_versions.ios}'))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ll.added_date",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.loginLogs} ll`,
            on: "cd.user_id = ll.user_id AND ll.added_date >= NOW() - INTERVAL 5 DAY",
          },
        ],
      },
      without_app: {
        conditions: [
          {
            field: "(cd.device IS NULL OR cd.device = '')",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      not_updated: {
        conditions: [
          {
            field: "cd.device IS NOT NULL AND cd.device != ''",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.app_version",
            operator: "NOT IN",
            value: [app_versions.android, app_versions.ios],
          },
          {
            field: "cd.app_version IS NOT NULL AND cd.app_version != ''",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      on_old_app_not_updated: {
        conditions: [...notUpdatedConditions],
      },
      on_new_app_not_updated: {
        conditions: [...notUpdatedConditions],
      },
    };
    if (filter === "mtd") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          `${moment().startOf("month").format("YYYY-MM-DD")}`,
          `${moment().endOf("day").format("YYYY-MM-DD")}`,
        ],
      });
    } else if (filter === "last_24_hours") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(24, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    } else if (filter === "last_48_hours") {
      conditions.push({
        field: "cd.added_date",
        operator: "BETWEEN",
        value: [
          `${moment().subtract(48, "hours").format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      });
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...getCommonSelectFields(),
        "cd.app_version",
        "cd.device",
        " latest_fcm.added_date as fcm_added_date",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        ...getCommonJoins(),
        ...(typeConditionMap[type]?.joins || []),
        {
          type: "LEFT",
          table: `${tables.fcm_registry} latest_fcm`,
          on: `cd.user_id = latest_fcm.user_id AND latest_fcm.added_date = (SELECT MAX(added_date) FROM ${tables.fcm_registry} WHERE user_id = cd.user_id)`,
        },
      ],
      conditions: [
        ...conditions,
        ...(typeConditionMap[type]?.conditions || []),
      ],
      groupBy: ["cd.user_id"],
      ...(!["on_old_app_not_updated", "on_new_app_not_updated"].includes(
        type,
      ) && {
        pagination: { page: page || 1, limit: limit || 1000 },
      }),
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
    });

    const filteredData = filterUsersByType(results, type);
    console.log("Filtered:", filteredData.length);

    // 🧩 Apply manual pagination for the two special types
    let paginatedData = filteredData;
    if (["on_old_app_not_updated", "on_new_app_not_updated"].includes(type)) {
      const startIndex = (page || 1 - 1) * (limit || 1000);
      const endIndex = startIndex + (limit || 1000);
      paginatedData = filteredData.slice(startIndex, endIndex);
    }

    // Map final data
    const finalData = paginatedData.map((item) =>
      mapLeadDataNew({
        details: item,
        extraMappings: {
          app_details: {
            device: item.device,
            app_version: item.app_version,
            last_app_install_date: item.fcm_added_date,
          },
        },
        removeFields: ["health_details", "next_follow_up"],
      }),
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "App Analytics Overview Lead Data fetched successfully",
      data: finalData,
      totalCount: ["on_old_app_not_updated", "on_new_app_not_updated"].includes(
        type,
      )
        ? filteredData.length // use full filtered count for pagination info
        : totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in appAnalyticsOverviewLeadData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const keyEngagementMetrics = async (req, res, next) => {
  try {
    const todayData = await readRecordUnion([
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'hs_taken' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.healthScoreClient} hs`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "hs.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "DATE(hs.created)",
            operator: "=",
            value: `CURDATE()`,
            raw: true,
          },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'consultations' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.callUpdates} cu`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: `CURDATE()`,
            raw: true,
          },
          { field: "cu.call_type", operator: "=", value: "30" },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'program_page_visits' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.inAppPageVisitLog} iapv`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "iapv.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "iapv.page_type", operator: "=", value: 1 },
          {
            field: "DATE(iapv.visit_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'checkout_page_visits' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.inAppPageVisitLog} iapv`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "iapv.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "iapv.page_type", operator: "=", value: 2 },
          {
            field: "DATE(iapv.visit_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    const monthlyData = await readRecordUnion([
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'hs_taken' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.healthScoreClient} hs`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "hs.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "DATE(hs.created)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'consultations' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.callUpdates} cu`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
          { field: "cu.call_type", operator: "=", value: "30" },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'program_page_visits' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.inAppPageVisitLog} iapv`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "iapv.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "iapv.page_type", operator: "=", value: 1 },
          {
            field: "DATE(iapv.visit_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) AS count",
          "'checkout_page_visits' AS type",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) AS active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) AS oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS lead_count",
        ],
        table: `${tables.inAppPageVisitLog} iapv`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "iapv.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "iapv.page_type", operator: "=", value: 2 },
          {
            field: "DATE(iapv.visit_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);
    const finalData = {};
    todayData.forEach((item) => {
      finalData[item.type] = {
        today_count: {
          active: item.active_count,
          oc: item.oc_count,
          lead: item.lead_count,
          total: item.active_count + item.oc_count + item.lead_count,
        },
        monthly_count: { active: 0, oc: 0, lead: 0, total: 0 },
      };
    });
    monthlyData.forEach((item) => {
      if (finalData[item.type]) {
        finalData[item.type].monthly_count = {
          active: item.active_count,
          oc: item.oc_count,
          lead: item.lead_count,
          total: item.active_count + item.oc_count + item.lead_count,
        };
      }
    });
    const chatUserIds = await clientEnquiry.aggregate([
      {
        $match: {
          createdAt: { $gte: moment().startOf("month").toDate() },
          type: { $in: ["query", "replied"] },
        },
      },
      {
        $group: {
          _id: "$user_id",
          latestCreatedAt: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          user_id: "$_id",
          latestCreatedAt: 1,
        },
      },
    ]);
    const todayChatUserIds = chatUserIds.filter((item) =>
      moment(item.latestCreatedAt).isSame(moment().subtract(1, "day"), "day"),
    );
    finalData["chats"] = {
      today_count: { active: 0, oc: 0, lead: 0, total: 0 },
      monthly_count: { active: 0, oc: 0, lead: 0, total: 0 },
    };
    if (todayChatUserIds.length > 0) {
      const {
        results: [todayChatMetrics],
      } = await readRecord({
        selectFields: [
          "COUNT(DISTINCT CASE WHEN cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS today_active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS today_oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS today_lead_count",
        ],
        table: `${tables.userDetails} cd`,
        conditions: [
          {
            field: "cd.user_id",
            operator: "IN",
            value: todayChatUserIds.map((item) => item.user_id),
          },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [196],
          },
        ],
      });
      finalData["chats"] = {
        today_count: {
          active: todayChatMetrics.today_active_count,
          oc: todayChatMetrics.today_oc_count,
          lead: todayChatMetrics.today_lead_count,
          total:
            todayChatMetrics.today_active_count +
            todayChatMetrics.today_oc_count +
            todayChatMetrics.today_lead_count,
        },
      };
    }
    if (chatUserIds.length > 0) {
      const {
        results: [monthlyChatMetrics],
      } = await readRecord({
        selectFields: [
          "COUNT(DISTINCT CASE WHEN cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS month_active_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS month_oc_count",
          "COUNT(DISTINCT CASE WHEN cd.user_type = '0' THEN cd.user_id END) AS month_lead_count",
        ],
        table: `${tables.userDetails} cd`,
        conditions: [
          {
            field: "cd.user_id",
            operator: "IN",
            value: chatUserIds.map((item) => item.user_id),
          },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [196],
          },
        ],
      });

      finalData["chats"]["monthly_count"] = {
        active: monthlyChatMetrics.month_active_count,
        oc: monthlyChatMetrics.month_oc_count,
        lead: monthlyChatMetrics.month_lead_count,
        total:
          monthlyChatMetrics.month_active_count +
          monthlyChatMetrics.month_oc_count +
          monthlyChatMetrics.month_lead_count,
      };
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Key Engagement Metrics fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in keyEngagementMetrics:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const activatedFeatures = async (req, res, next) => {
  try {
    const { results: leadsWithFreeCourse } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "laf.guides",
        "laf.user_id",
        "cd.user_type",
        "cd.user_status",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadsActivatedFeatures} laf`,
          on: "laf.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.user_id = cd.user_id AND sop.type = 1",
        },
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "sop.sub_order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        { field: "JSON_LENGTH(laf.guides)", operator: ">", value: 0 },
      ],
    });
    const usersWithActiveGuidesToday = {
      active_count: new Set(),
      oc_count: new Set(),
      lead_count: new Set(),
    };
    const usersWithActiveGuidesThisMonth = {
      active_count: new Set(),
      oc_count: new Set(),
      lead_count: new Set(),
    };

    leadsWithFreeCourse.forEach((item) => {
      const guides = safeJSONParse(item.guides, []);

      guides.forEach((guide) => {
        const endDate = guide?.guide_end_date;
        const addedDate = guide?.guide_added_date;

        const isActive =
          endDate &&
          moment(endDate, "YYYY-MM-DD", true).isAfter(moment(), "day");

        if (!isActive || !addedDate) return;

        const guideAdded = moment(addedDate, "YYYY-MM-DD", true);

        if (guideAdded.isSame(moment(), "day")) {
          // usersWithActiveGuidesToday.add(item.user_id);
          if (item.user_status === "Active" && item.user_type === "1") {
            usersWithActiveGuidesToday.active_count.add(item.user_id);
          } else if (
            item.user_status === "Completed" &&
            item.user_type === "1"
          ) {
            usersWithActiveGuidesToday.oc_count.add(item.user_id);
          } else if (item.user_type === "0") {
            usersWithActiveGuidesToday.lead_count.add(item.user_id);
          }
        } else if (guideAdded.isSame(moment(), "month")) {
          if (item.user_status === "Active" && item.user_type === "1") {
            usersWithActiveGuidesThisMonth.active_count.add(item.user_id);
          } else if (
            item.user_status === "Completed" &&
            item.user_type === "1"
          ) {
            usersWithActiveGuidesThisMonth.oc_count.add(item.user_id);
          } else if (item.user_type === "0") {
            usersWithActiveGuidesThisMonth.lead_count.add(item.user_id);
          }
        }
      });
    });
    const data = await readRecordUnion([
      {
        selectField: [
          "'coupon_code_activated' AS type",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.coupon) AND DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = CURDATE() AND cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS today_active_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.coupon) AND DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = CURDATE() AND cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS today_oc_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.coupon) AND DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = CURDATE() AND cd.user_type = '0' THEN cd.user_id END) AS today_lead_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.coupon) AND MONTH(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = MONTH(CURDATE()) AND YEAR(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = YEAR(CURDATE()) AND cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS this_month_active_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.coupon) AND MONTH(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = MONTH(CURDATE()) AND YEAR(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = YEAR(CURDATE()) AND cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS this_month_oc_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.coupon) AND MONTH(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = MONTH(CURDATE()) AND YEAR(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.start_date'))) = YEAR(CURDATE()) AND cd.user_type = '0' THEN cd.user_id END) AS this_month_lead_count",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadsActivatedFeatures} laf`,
            on: "cd.user_id = laf.user_id",
          },
        ],
        condition: [
          {
            field: "JSON_VALID(laf.coupon)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.coupon,'$.end_date')))",
            operator: ">=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "'spin_to_win_activated' AS type",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.spin_to_win) AND DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = CURDATE() AND cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS today_active_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.spin_to_win) AND DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = CURDATE() AND cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS today_oc_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.spin_to_win) AND DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = CURDATE() AND cd.user_type = '0' THEN cd.user_id END) AS today_lead_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.spin_to_win) AND MONTH(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = MONTH(CURDATE()) AND YEAR(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = YEAR(CURDATE()) AND cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS this_month_active_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.spin_to_win) AND MONTH(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = MONTH(CURDATE()) AND YEAR(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = YEAR(CURDATE()) AND cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS this_month_oc_count",
          "COUNT(DISTINCT CASE WHEN JSON_VALID(laf.spin_to_win) AND MONTH(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = MONTH(CURDATE()) AND YEAR(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.start_date'))) = YEAR(CURDATE()) AND cd.user_type = '0' THEN cd.user_id END) AS this_month_lead_count",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.leadsActivatedFeatures} laf`,
            on: "cd.user_id = laf.user_id",
          },
        ],
        condition: [
          {
            field: "JSON_VALID(laf.spin_to_win)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "DATE(JSON_UNQUOTE(JSON_EXTRACT(laf.spin_to_win,'$.end_date')))",
            operator: ">=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          // "COUNT(DISTINCT cd.user_id) as count",
          "'leads_with_GO_pro' as type",
          "COUNT(DISTINCT CASE WHEN DATE(sop.created_at) = CURDATE() AND cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS today_active_count",
          "COUNT(DISTINCT CASE WHEN DATE(sop.created_at) = CURDATE() AND cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS today_oc_count",
          "COUNT(DISTINCT CASE WHEN DATE(sop.created_at) = CURDATE() AND cd.user_type = '0' THEN cd.user_id END) AS today_lead_count",
          "COUNT(DISTINCT CASE WHEN MONTH(sop.created_at) = MONTH(CURDATE()) AND YEAR(sop.created_at) = YEAR(CURDATE()) AND cd.user_type = '1' and cd.user_status = 'Active' THEN cd.user_id END) AS this_month_active_count",
          "COUNT(DISTINCT CASE WHEN MONTH(sop.created_at) = MONTH(CURDATE()) AND YEAR(sop.created_at) = YEAR(CURDATE()) AND cd.user_type = '1' and cd.user_status = 'Completed' THEN cd.user_id END) AS this_month_oc_count",
          "COUNT(DISTINCT CASE WHEN MONTH(sop.created_at) = MONTH(CURDATE()) AND YEAR(sop.created_at) = YEAR(CURDATE()) AND cd.user_type = '0' THEN cd.user_id END) AS this_month_lead_count",
        ],
        table: `${tables.subOrderPrograms} sop`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "sop.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "sop.type", operator: "=", value: 1 },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
          {
            field: "sop.expiry_date",
            operator: ">=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    const finalData = {};
    console.log("Activated Features Data:", data);
    data.forEach((item) => {
      const type = item.type;
      finalData[type] = {
        today_count: {
          active: item.today_active_count,
          oc: item.today_oc_count,
          lead: item.today_lead_count,
          total:
            item.today_active_count +
            item.today_oc_count +
            item.today_lead_count,
        },
        monthly_count: {
          active: item.this_month_active_count,
          oc: item.this_month_oc_count,
          lead: item.this_month_lead_count,
          total:
            item.this_month_active_count +
            item.this_month_oc_count +
            item.this_month_lead_count,
        },
      };
    });
    finalData["leads_with_active_guides"] = {
      today_count: {
        active: usersWithActiveGuidesToday.active_count.size,
        oc: usersWithActiveGuidesToday.oc_count.size,
        lead: usersWithActiveGuidesToday.lead_count.size,
        total:
          usersWithActiveGuidesToday.active_count.size +
          usersWithActiveGuidesToday.oc_count.size +
          usersWithActiveGuidesToday.lead_count.size,
      },
      monthly_count: {
        active: usersWithActiveGuidesThisMonth.active_count.size,
        oc: usersWithActiveGuidesThisMonth.oc_count.size,
        lead: usersWithActiveGuidesThisMonth.lead_count.size,
        total:
          usersWithActiveGuidesThisMonth.active_count.size +
          usersWithActiveGuidesThisMonth.oc_count.size +
          usersWithActiveGuidesThisMonth.lead_count.size,
      },
    };
    console.log("Activated Features Data:", finalData);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Activated Features fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in activatedFeatures:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allLeadsWithAppCount = async (req, res, next) => {
  try {
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'all_leads_with_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
          {
            field: "cd.app_version",
            operator: "IS",
            value: "NOT NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'leads_with_inactivity' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
          {
            field: "cd.app_version",
            operator: "IS",
            value: "NOT NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
          {
            field: `NOT EXISTS (
        SELECT 1
        FROM login_logs ll
        WHERE ll.user_id = cd.user_id
          AND ll.added_date >= CURDATE() - INTERVAL 5 DAY
      )`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    console.log(data, 679);
    const finalData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count;
      return acc;
    }, {});
    finalData["leads_with_activity"] =
      finalData["all_leads_with_app"] - finalData["leads_with_inactivity"];
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All leads with app data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching all leads with app data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allActiveAppActivityCount = async (req, res, next) => {
  try {
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'all_active_with_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
          {
            field: "cd.app_version",
            operator: "IS",
            value: "NOT NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.mentor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'active_clients_with_inactivity' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
          {
            field: "cd.app_version",
            operator: "IS",
            value: "NOT NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.mentor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
          {
            field: `NOT EXISTS (
        SELECT 1
        FROM login_logs ll
        WHERE ll.user_id = cd.user_id
          AND ll.added_date >= CURDATE() - INTERVAL 5 DAY
      )`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    console.log(data, 679);
    const finalData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count;
      return acc;
    }, {});
    finalData["active_clients_with_activity"] =
      finalData["all_active_with_app"] -
      finalData["active_clients_with_inactivity"];
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All active clients with app data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching all active clients with app data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const allOCAppActivityCount = async (req, res, next) => {
  try {
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'all_oc_with_app' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "cd.mentor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.fcm_registry} fcm`,
            on: "cd.user_id = fcm.user_id",
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'oc_with_inactivity' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "cd.mentor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
          {
            field: `NOT EXISTS (
        SELECT 1
        FROM login_logs ll
        WHERE ll.user_id = cd.user_id
          AND ll.added_date >= CURDATE() - INTERVAL 5 DAY
      )`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.fcm_registry} fcm`,
            on: "cd.user_id = fcm.user_id",
          },
        ],
      },
    ]);
    console.log(data, 679);
    const finalData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count;
      return acc;
    }, {});
    finalData["oc_with_activity"] =
      finalData["all_oc_with_app"] - finalData["oc_with_inactivity"];
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All active clients with app data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching all active clients with app data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const notificationEngagement = async (req, res, next) => {
  try {
    const { period = "this_month", type, filter = "" } = req.body;

    let start_date;
    let end_date = moment().endOf("day").toDate();

    // -------- PERIOD FILTER (FIXED & COMPLETE) --------
    switch (period) {
      case "today":
        start_date = moment().startOf("day").toDate();
        end_date = moment().endOf("day").toDate();
        break;

      case "yesterday":
        start_date = moment().subtract(1, "day").startOf("day").toDate();
        end_date = moment().subtract(1, "day").endOf("day").toDate();
        break;

      case "this_week":
        start_date = moment().startOf("week").toDate();
        end_date = moment().endOf("week").toDate();
        break;

      case "this_month":
      default:
        start_date = moment().startOf("month").toDate();
        break;
    }

    // -------- TYPE FILTER --------
    let typeFilter = {};
    if (type === "promotional") {
      typeFilter.redirect_page = {
        $in: ["program", "cleanse_program", "bn_wallet_statement", "wallet"],
      };
    } else if (type === "engagement") {
      typeFilter.redirect_page = {
        $in: [
          "recipe_details",
          "quick_filler_guide",
          "tip_of_the_day",
          "restaurant_guide",
          "alcohol_guide",
          "health_reads",
          "bn_tips",
          "webview",
          "peer_group",
          "take_health_score",
          "success_stories",
          "mentor_clara",
        ],
      };
    } else if (type === "transactional") {
      typeFilter.redirect_page = {
        $nin: [
          "program",
          "cleanse_program",
          "bn_wallet_statement",
          "wallet",
          "recipe_details",
          "quick_filler_guide",
          "tip_of_the_day",
          "restaurant_guide",
          "alcohol_guide",
          "health_reads",
          "bn_tips",
          "webview",
          "peer_group",
          "take_health_score",
          "success_stories",
          "mentor_clara",
        ],
      };
    }

    const userIdFilter = {};
    if (filter !== "") {
      switch (filter) {
        case "active":
          const { results } = await readRecord({
            table: `${tables.userDetails} ud`,
            selectFields: ["ud.user_id"],
            conditions: [
              { field: "ud.user_type", operator: "=", value: "1" },
              { field: "ud.user_status", operator: "=", value: "Active" },
              {
                field: "ud.counsellor_assigned",
                operator: "NOT IN",
                value: [10, 0, 196],
              },
              {
                field: "ud.mentor_assigned",
                operator: "NOT IN",
                value: [10, 0, 196],
              },
            ],
          });
          const activeUserIds = results.map((r) => r.user_id);
          userIdFilter.user_id = { $in: activeUserIds };
          break;
        case "lead":
          const { results: leadResults } = await readRecord({
            table: `${tables.userDetails} ud`,
            selectFields: ["ud.user_id"],
            conditions: [
              { field: "ud.user_type", operator: "=", value: "0" },
              { field: "ud.phone_code", operator: "!=", value: "" },
              {
                orConditions: [
                  {
                    field: "ud.counsellor_assigned",
                    operator: "NOT IN",
                    value: [0, 10, 196],
                  },
                  {
                    field: "ud.counsellor_assigned",
                    operator: "IS",
                    value: "NULL",
                    raw: true,
                  },
                ],
              },
            ],
          });
          const leadUserIds = leadResults.map((r) => r.user_id);
          userIdFilter.user_id = { $in: leadUserIds };
          break;
        case "oc":
          const { results: ocResults } = await readRecord({
            table: `${tables.userDetails} ud`,
            selectFields: ["ud.user_id"],
            conditions: [
              { field: "ud.user_type", operator: "=", value: "1" },
              { field: "ud.user_status", operator: "=", value: "Completed" },
              {
                field: "ud.counsellor_assigned",
                operator: "NOT IN",
                value: [10, 0, 196],
              },
              {
                field: "ud.mentor_assigned",
                operator: "NOT IN",
                value: [10, 0, 196],
              },
            ],
          });
          const ocUserIds = ocResults.map((r) => r.user_id);
          userIdFilter.user_id = { $in: ocUserIds };
          break;
        default:
          return res.status(400).json({
            statusCode: 400,
            message: "Invalid filter value",
          });
      }
    }

    // -------- FAST AGGREGATION --------
    const data = await userNotification.aggregate(
      [
        {
          $match: {
            added_date: { $gte: start_date, $lte: end_date },
            ...(type ? typeFilter : {}),
            ...userIdFilter,
          },
        },
        {
          $project: {
            title: 1,
            read_status: 1,
          },
        },
        {
          $group: {
            _id: "$title",
            total_notifications: { $sum: 1 },
            seen_notifications: { $sum: { $toInt: "$read_status" } },
          },
        },
      ],
      { allowDiskUse: true },
    );

    // -------- RESPONSE --------
    let totalSent = 0;
    let totalSeen = 0;

    const formatted = data.map((d) => {
      totalSent += d.total_notifications;
      totalSeen += d.seen_notifications;

      return {
        title: d._id,
        total_count: d.total_notifications,
        seen_count: d.seen_notifications,
        open_trend:
          d.total_notifications > 0
            ? `${((d.seen_notifications / d.total_notifications) * 100).toFixed(
                2,
              )}%`
            : "0%",
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Notification engagement data fetched successfully",
        data: {
          total_notifications: {
            total_sent: totalSent,
            total_seen: totalSeen,
            open_trend:
              totalSent > 0
                ? `${((totalSeen / totalSent) * 100).toFixed(2)}%`
                : "0%",
          },
          top_notifications: [...formatted]
            .sort((a, b) => b.seen_count - a.seen_count)
            .slice(0, 5),
          less_performing_notifications: [...formatted]
            .sort((a, b) => a.seen_count - b.seen_count)
            .slice(0, 5),
        },
      }),
    );
  } catch (error) {
    console.error("Notification engagement error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const notificationEngagementSummary = async (req, res, next) => {
  try {
    const typeFilters = {
      promotional: {
        redirect_page: {
          $in: ["program", "cleanse_program", "bn_wallet_statement", "wallet"],
        },
      },
      engagement: {
        redirect_page: {
          $in: [
            "recipe_details",
            "quick_filler_guide",
            "tip_of_the_day",
            "restaurant_guide",
            "alcohol_guide",
            "health_reads",
            "bn_tips",
            "webview",
            "peer_group",
            "take_health_score",
            "success_stories",
            "mentor_clara",
          ],
        },
      },
      transactional: {
        redirect_page: {
          $nin: [
            "program",
            "cleanse_program",
            "bn_wallet_statement",
            "wallet",
            "recipe_details",
            "quick_filler_guide",
            "tip_of_the_day",
            "restaurant_guide",
            "alcohol_guide",
            "health_reads",
            "bn_tips",
            "webview",
            "peer_group",
            "take_health_score",
            "success_stories",
            "mentor_clara",
          ],
        },
      },
    };

    const periods = {
      today: {
        start: moment().startOf("day").toDate(),
        end: moment().endOf("day").toDate(),
      },
      yesterday: {
        start: moment().subtract(1, "day").startOf("day").toDate(),
        end: moment().subtract(1, "day").endOf("day").toDate(),
      },
    };

    const result = {};

    for (const [periodName, { start, end }] of Object.entries(periods)) {
      result[periodName] = {};

      for (const [typeName, typeFilter] of Object.entries(typeFilters)) {
        const notifications = await userNotification.aggregate([
          {
            $match: {
              added_date: { $gte: start, $lte: end },
              ...typeFilter,
            },
          },
          {
            $group: {
              _id: null,
              total_sent: { $sum: 1 },
              total_seen: { $sum: { $toInt: "$read_status" } },
            },
          },
        ]);

        const data = notifications[0] || { total_sent: 0, total_seen: 0 };
        const openTrend =
          data.total_sent > 0
            ? `${((data.total_seen / data.total_sent) * 100).toFixed(2)}%`
            : "0%";

        result[periodName][typeName] = {
          total_sent: data.total_sent,
          total_seen: data.total_seen,
          open_trend: openTrend,
        };
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Notification engagement summary fetched successfully",
        data: result,
      }),
    );
  } catch (error) {
    console.error("Error fetching notification engagement summary:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCrashlyticsData = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.crashAnalytics} ca`,
      selectFields: ["*"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Crashlytics data fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getCrashlyticsData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateCrashlyticsData = async (req, res, next) => {
  try {
    const {
      crash_free_users,
      crash_free_sessions,
      yesterday,
      last_seven_days,
      mtd,
      id,
    } = req.body;
    const updateData = {};
    if (crash_free_users !== undefined)
      updateData.crash_free_users = crash_free_users;
    if (crash_free_sessions !== undefined)
      updateData.crash_free_sessions = crash_free_sessions;
    if (yesterday !== undefined) updateData.yesterday = yesterday;
    if (last_seven_days !== undefined)
      updateData.last_seven_days = last_seven_days;
    if (mtd !== undefined) updateData.mtd = mtd;
    const updateResult = await updateRecord(tables.crashAnalytics, updateData, {
      id: id,
    });
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("No record found to update", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Crashlytics data updated successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in updateCrashlyticsData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  activatedFeatures,
  appAnalyticsOverviewActive,
  appAnalyticsOverviewActiveData,
  appAnalyticsOverviewOC,
  appAnalyticsOverviewOCData,
  appAnalyticsOverviewLead,
  appAnalyticsOverviewLeadData,
  appDownloadCounts,
  appDownloadData,
  appUsageOverview,
  allLeadsWithAppCount,
  allOCAppActivityCount,
  allActiveAppActivityCount,
  getCrashlyticsData,
  keyEngagementMetrics,
  notificationEngagement,
  notificationEngagementSummary,
  updateCrashlyticsData,
};
