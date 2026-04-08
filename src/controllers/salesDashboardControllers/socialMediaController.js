import moment from "moment";
import {
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import UserVisitLog from "../../models/userVisitLogModel.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

const overallSocialMediaLeads = async (req, res, next) => {
  try {
    const { filter = "today" } = req.body;
    const condition = [
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "s.source_group", operator: "=", value: 3 },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");

      // condition.push({
      //   raw: true,
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp')))) BETWEEN '${start}' AND '${end}'`,
      //   operator: "",
      //   value: "",
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");

      // condition.push({
      //   raw: true,
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp')))) BETWEEN '${start}' AND '${end}'`,
      //   operator: "",
      //   value: "",
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");

      // condition.push({
      //   raw: true,
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp')))) BETWEEN '${start}' AND '${end}'`,
      //   operator: "",
      //   value: "",
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      // condition.push({
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp'))))`,
      //   operator: "=",
      //   value: moment().format("YYYY-MM-DD"),
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }

    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'total_leads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.leadSource} s`,
            on: "cd.primary_lead_source = s.source_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadSourceLog} lsl`,
            on: "cd.user_id = lsl.user_id",
          },
        ],
        condition,
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'unassigned_leads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.leadSource} s`,
            on: "cd.primary_lead_source = s.source_id",
          },
          // {
          //   type: "LEFT",
          //   table: `${tables.leadSourceLog} lsl`,
          //   on: "cd.user_id = lsl.user_id",
          // },
        ],
        condition: [
          ...condition,
          {
            field: "cd.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'assigned_leads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.leadSource} s`,
            on: "cd.primary_lead_source = s.source_id",
          },
          // {
          //   type: "LEFT",
          //   table: `${tables.leadSourceLog} lsl`,
          //   on: "cd.user_id = lsl.user_id",
          // },
        ],
        condition: [
          ...condition,
          {
            field: "cd.counsellor_assigned",
            operator: "IS",
            value: "NOT NULL",
            raw: true,
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Overall Social Media Leads Data Fetched Successfully",
      data: data.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in overallSocialMediaLeads:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const assignedSMLeadsByCounsellors = async (req, res, next) => {
  try {
    const { filter = "today" } = req.body;
    const condition = [
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "s.source_group", operator: "=", value: 3 },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");

      // condition.push({
      //   raw: true,
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp')))) BETWEEN '${start}' AND '${end}'`,
      //   operator: "",
      //   value: "",
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");

      // condition.push({
      //   raw: true,
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp')))) BETWEEN '${start}' AND '${end}'`,
      //   operator: "",
      //   value: "",
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");

      // condition.push({
      //   raw: true,
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp')))) BETWEEN '${start}' AND '${end}'`,
      //   operator: "",
      //   value: "",
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      // condition.push({
      //   field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(lsl.source_log, CONCAT('$[', JSON_LENGTH(lsl.source_log) - 1, '].timestamp'))))`,
      //   operator: "=",
      //   value: moment().format("YYYY-MM-DD"),
      // });
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.is_currently_working", operator: "=", value: 1 },
      ],
    });
    const countUnions = [];
    counsellors.forEach((counsellor) => {
      countUnions.push({
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          `'${counsellor.crm_user}' AS type`,
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.leadSource} s`,
            on: "cd.primary_lead_source = s.source_id",
          },
          // {
          //   type: "LEFT",
          //   table: `${tables.leadSourceLog} lsl`,
          //   on: "cd.user_id = lsl.user_id",
          // },
        ],
        condition: [
          ...condition,
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: counsellor.admin_user_id,
          },
        ],
      });
    });
    const data = await readRecordUnion(countUnions);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Overall Social Media Leads Data Fetched Successfully",
      data: data.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in assignedSMLeadsByCounsellors:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadStatusOverview = async (req, res, next) => {
  try {
    const { filter = "today" } = req.body;
    const condition = [];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const statusConditions = [
      ["all_leads", [...condition]],
      [
        "hot_leads",
        [{ field: "cd.sales_status", operator: "=", value: 2 }, ...condition],
      ],
      [
        "warm_leads",
        [{ field: "cd.sales_status", operator: "=", value: 3 }, ...condition],
      ],
      [
        "cold_leads",
        [{ field: "cd.sales_status", operator: "=", value: 4 }, ...condition],
      ],
    ];
    const countUnions = [];
    statusConditions.forEach(([status, conditions]) => {
      countUnions.push({
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          `'${status}' AS type`,
        ],
        table: `${tables.userDetails} cd`,
        condition: [...conditions],
      });
    });
    const data = await readRecordUnion(countUnions);
    console.log("Lead Status Overview Data:", data);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead Status Overview Data Fetched Successfully",
      data: data.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadStatusOverview:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sourceWiseLeadPerformance = async (req, res, next) => {
  try {
    const { filter = "today" } = req.body;
    const sourceGroups = [
      { id: 2, name: "Website" },
      { id: 3, name: "Social Media" },
      { id: 5, name: "Referral" },
      { id: 6, name: "Campaign" },
    ];
    const result = [];
    const condition = [];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const data = await Promise.all(
      sourceGroups.map(
        async (sourceGroup) =>
          await readRecordUnion([
            {
              selectField: [
                "COUNT(DISTINCT cd.user_id) AS count",
                "'total_leads' AS type",
              ],
              table: `${tables.userDetails} cd`,
              join: [
                {
                  type: "LEFT",
                  table: `${tables.leadSource} s`,
                  on: "cd.primary_lead_source = s.source_id",
                },
              ],
              condition: [
                ...condition,
                {
                  field: "s.source_group",
                  operator: "=",
                  value: sourceGroup.id,
                },
              ],
            },
            {
              selectField: [
                "COUNT(DISTINCT sop.user_id) AS count",
                "'converted_leads' AS type",
              ],
              table: `${tables.userDetails} cd`,
              join: [
                {
                  type: "LEFT",
                  table: `${tables.leadSource} s`,
                  on: "cd.primary_lead_source = s.source_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.leadSourceLog} lsl`,
                  on: "cd.user_id = lsl.user_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.orderDetails} od`,
                  on: "cd.user_id = od.user_id",
                },
                {
                  type: "INNER",
                  table: `${tables.subOrderPrograms} sop`,
                  on: "od.order_id = sop.order_id AND sop.type = 0",
                },
              ],
              condition: [
                ...condition,
                {
                  field: "s.source_group",
                  operator: "=",
                  value: sourceGroup.id,
                },
              ],
            },
            {
              selectField: [
                "COUNT(sop.sub_order_id) AS count",
                "'units_sold' AS type",
              ],
              table: `${tables.userDetails} cd`,
              join: [
                {
                  type: "LEFT",
                  table: `${tables.leadSource} s`,
                  on: "cd.primary_lead_source = s.source_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.leadSourceLog} lsl`,
                  on: "cd.user_id = lsl.user_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.orderDetails} od`,
                  on: "cd.user_id = od.user_id",
                },
                {
                  type: "INNER",
                  table: `${tables.subOrderPrograms} sop`,
                  on: "od.order_id = sop.order_id AND sop.type = 0",
                },
              ],
              condition: [
                ...condition,
                {
                  field: "s.source_group",
                  operator: "=",
                  value: sourceGroup.id,
                },
              ],
            },
            {
              selectField: [
                "SUM(od.order_paid_amount) AS count",
                "'revenue' AS type",
              ],
              table: `${tables.userDetails} cd`,
              join: [
                {
                  type: "LEFT",
                  table: `${tables.leadSource} s`,
                  on: "cd.primary_lead_source = s.source_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.leadSourceLog} lsl`,
                  on: "cd.user_id = lsl.user_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.orderDetails} od`,
                  on: "cd.user_id = od.user_id",
                },
                {
                  type: "INNER",
                  table: `${tables.subOrderPrograms} sop`,
                  on: "od.order_id = sop.order_id AND sop.type = 0",
                },
              ],
              condition: [
                ...condition,
                {
                  field: "s.source_group",
                  operator: "=",
                  value: sourceGroup.id,
                },
              ],
            },
          ])
      )
    );
    const finalData = {};
    sourceGroups.forEach((sourceGroups, index) => {
      finalData[sourceGroups.name] = data[index].reduce((acc, curr) => {
        acc[curr.type] = curr.count ?? 0;
        return acc;
      }, {});
      console.log(data[index][1]?.count, data[index][0]?.count);
      finalData[sourceGroups.name].conversion_rate =
        ((data[index][1]?.count / data[index][0]?.count) * 100).toFixed(1) || 0;
    });
    const response = new ApiResponse({
      statusCode: 200,
      message: "Source Wise Lead Performance Data Fetched Successfully",
      data: finalData,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.log("Error in sourceWiseLeadPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadDownGradeAnalysis = async (req, res, next) => {
  try {
    const { filter = "today" } = req.body;
    const condition = [];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const { results } = await readRecord({
      table: `${tables.leadSaleStatusLog} lssl`,
      selectFields: ["lssl.sales_status_log", "lssl.user_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "lssl.user_id = cd.user_id",
        },
      ],
      conditions: [
        ...condition,
        { field: "cd.user_type", operator: "=", value: "0" },
      ],
    });

    const downgradeCounts = {
      hot_to_warm: 0,
      hot_to_cold: 0,
      warm_to_cold: 0,
    };
    results.forEach((result) => {
      const salesLog = JSON.parse(result.sales_status_log);
      if (salesLog.length > 1) {
        salesLog.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const secondLast = salesLog[salesLog.length - 2];
        const last = salesLog[salesLog.length - 1];
        if (
          Number(secondLast.sales_status) === 2 &&
          Number(last.sales_status) === 3
        ) {
          downgradeCounts.hot_to_warm++;
        } else if (
          Number(secondLast.sales_status) === 2 &&
          Number(last.sales_status) === 4
        ) {
          downgradeCounts.hot_to_cold++;
        } else if (
          Number(secondLast.sales_status) === 3 &&
          Number(last.sales_status) === 4
        ) {
          downgradeCounts.warm_to_cold++;
        }
      }
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead Downgrade Analysis Data Fetched Successfully",
      data: downgradeCounts,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadDownGradeAnalysis:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesTriggerCounts = async (req, res, next) => {
  try {
    const data = await readRecordUnion([
      {
        selectField: ["COUNT(cd.user_id) AS count", "'hot_trigger' AS type"],
        join: [
          {
            table: "lead_assigned_log lal1",
            on: "cd.user_id = lal1.user_id",
            type: "INNER",
          },
          {
            table: "lead_assigned_log lal2",
            on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
            type: "LEFT",
          },
        ],
        condition: [
          { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
          {
            field: "DATEDIFF(CURDATE(), lal1.assign_date)",
            operator: ">",
            value: "7",
            raw: true,
          },
          { field: "cd.sales_status", operator: "=", value: "2" },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'warm_trigger' AS type",
        ],
        join: [
          {
            table: "lead_assigned_log lal1",
            on: "cd.user_id = lal1.user_id",
            type: "INNER",
          },
          {
            table: "lead_assigned_log lal2",
            on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
            type: "LEFT",
          },
        ],
        condition: [
          { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
          {
            field: "DATEDIFF(CURDATE(), lal1.assign_date)",
            operator: ">",
            value: "15",
            raw: true,
          },
          { field: "cd.sales_status", operator: "=", value: "4" },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Trigger Counts Fetched Successfully",
      data: data.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in salesTriggerCounts:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const counsellorSMPerformance = async (req, res, next) => {
  try {
    const { filter = "mtd" } = req.body;
    const condition = [{ field: "s.source_group", operator: "=", value: 3 }];
    let start = null;
    let end = null;
    if (filter === "mtd") {
      start = moment().startOf("month").format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      start = moment().startOf("week").format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      start = moment().startOf("quarter").format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      start = moment().format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.is_currently_working", operator: "=", value: 1 },
      ],
    });
    const countUnions = [];
    counsellors.forEach((counsellor) => {
      countUnions.push([
        {
          selectField: [
            "COUNT(DISTINCT cd.user_id) AS count",
            `'social_leads_assigned' AS type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "LEFT",
              table: `${tables.leadSource} s`,
              on: "cd.primary_lead_source = s.source_id",
            },
            {
              type: "INNER",
              table: `${tables.leadAssignedLog} lal`,
              on: `cd.user_id = lal.user_id and cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${start}' AND '${end}'`,
            },
          ],
          condition: [
            ...condition,
            {
              field: "cd.counsellor_assigned",
              operator: "=",
              value: counsellor.admin_user_id,
            },
          ],
        },
        {
          selectField: [
            "COUNT(DISTINCT cd.user_id) AS count",
            `'social_consultations' AS type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "LEFT",
              table: `${tables.leadSource} s`,
              on: "cd.primary_lead_source = s.source_id",
            },
            {
              type: "INNER",
              table: `${tables.consultationLogs} csl`,
              on: "cd.user_id = csl.user_id",
            },
          ],
          condition: [
            ...condition,
            {
              field: "csl.consultation_by",
              operator: "=",
              value: counsellor.admin_user_id,
            },
          ],
        },
        {
          selectField: [
            "COUNT(DISTINCT od.user_id) AS count",
            `'social_sales' AS type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "LEFT",
              table: `${tables.leadSource} s`,
              on: "cd.primary_lead_source = s.source_id",
            },
            {
              type: "INNER",
              table: `${tables.orderDetails} od`,
              on: "cd.user_id = od.user_id",
            },
          ],
          condition: [
            ...condition,
            {
              field: "od.sale_by",
              operator: "=",
              value: counsellor.admin_user_id,
            },
          ],
        },
      ]);
    });
    const data = await Promise.all(
      countUnions.map((union) => readRecordUnion(union))
    );
    const finalData = {};
    data.forEach((counsellorData, index) => {
      const counsellor = counsellors[index].crm_user;
      finalData[counsellor] = counsellorData.reduce((acc, curr) => {
        acc[curr.type] = curr.count ?? 0;
        return acc;
      }, {});
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Counsellor Social Media Performance Data Fetched Successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in counsellorSMPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const consolidatedTeamPerformance = async (req, res, next) => {
  try {
    const { filter = "mtd" } = req.body;
    const condition = [{ field: "s.source_group", operator: "=", value: 3 }];
    let start = null;
    let end = null;
    if (filter === "mtd") {
      start = moment().startOf("month").format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      start = moment().startOf("week").format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      start = moment().startOf("quarter").format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      start = moment().format("YYYY-MM-DD");
      end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.is_currently_working", operator: "=", value: 1 },
      ],
    });
    const { results: mentors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "ad.is_active", operator: "=", value: 1 },
      ],
    });
    const counsellorIds = counsellors.map((c) => c.admin_user_id);
    const mentorIds = mentors.map((m) => m.admin_user_id);
    const teams = [
      ["team_counsellors", counsellorIds],
      ["team_mentors", mentorIds],
    ];
    const countUnions = [];
    teams.forEach(([teamName, teamIds]) => {
      countUnions.push([
        {
          selectField: [
            "COUNT(DISTINCT cd.user_id) AS count",
            `'social_leads_assigned' AS type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "LEFT",
              table: `${tables.leadSource} s`,
              on: "cd.primary_lead_source = s.source_id",
            },
            {
              type: "INNER",
              table: `${tables.leadAssignedLog} lal`,
              on: `cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${start}' AND '${end}'`,
            },
          ],
          condition: [
            ...condition,
            {
              field: "cd.counsellor_assigned",
              operator: "IN",
              value: [...teamIds],
            },
          ],
        },
        {
          selectField: [
            "COUNT(DISTINCT cd.user_id) AS count",
            `'social_consultations' AS type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "LEFT",
              table: `${tables.leadSource} s`,
              on: "cd.primary_lead_source = s.source_id",
            },
            {
              type: "INNER",
              table: `${tables.consultationLogs} csl`,
              on: "cd.user_id = csl.user_id",
            },
          ],
          condition: [
            ...condition,
            {
              field: "csl.consultation_by",
              operator: "IN",
              value: [...teamIds],
            },
          ],
        },
        {
          selectField: [
            "COUNT(DISTINCT od.user_id) AS count",
            `'social_sales' AS type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "LEFT",
              table: `${tables.leadSource} s`,
              on: "cd.primary_lead_source = s.source_id",
            },
            {
              type: "INNER",
              table: `${tables.orderDetails} od`,
              on: "cd.user_id = od.user_id",
            },
          ],
          condition: [
            ...condition,
            {
              field: "od.sale_by",
              operator: "IN",
              value: [...teamIds],
            },
            {
              field: "DATE(od.order_date)",
              operator: "BETWEEN",
              value: [
                `${moment().startOf("month").format("YYYY-MM-DD")}`,
                `${moment().endOf("day").format("YYYY-MM-DD")}`,
              ],
            },
          ],
        },
      ]);
    });
    const data = await Promise.all(
      countUnions.map((union) => readRecordUnion(union))
    );
    const finalData = {};
    data.forEach((teamData, index) => {
      const teamName = teams[index][0];
      finalData[teamName] = teamData.reduce((acc, curr) => {
        acc[curr.type] = curr.count ?? 0;
        return acc;
      }, {});
    });
    console.log("Final Data:", finalData);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Consolidated Team Performance Data Fetched Successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in consolidatedTeamPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const contentVisits = async (req, res, next) => {
  try {
    const countsToday = {
      tip_visit: 0,
      video_visit: 0,
      recipe_visit: 0,
      success_story: 0,
      wallet_visit: 0,
    };
    const countsThisMonth = {
      tip_visit: 0,
      video_visit: 0,
      recipe_visit: 0,
      success_story: 0,
      wallet_visit: 0,
    };
    const startOfDate = new Date();
    startOfDate.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(
      moment().startOf("month").format("YYYY-MM-DD")
    );
    startOfMonth.setHours(0, 0, 0, 0);
    const startDates = [
      ["countsToday", startOfDate],
      ["countsThisMonth", startOfMonth],
    ];
    const endOfDate = new Date(startOfDate);
    endOfDate.setHours(23, 59, 59, 999);
    const userVisitData = {
      countsToday: {
        recipe_visit: [],
        tip_visit: [],
        video_visit: [],
        success_story: [],
        wallet_visit: [],
      },
      countsThisMonth: {
        recipe_visit: [],
        tip_visit: [],
        video_visit: [],
        success_story: [],
        wallet_visit: [],
      },
    };
    for (const [countType, startDate] of startDates) {
      const data = await UserVisitLog.aggregate([
        {
          $facet: {
            tip_visit: [
              {
                $match: {
                  page: "tips",
                  createdAt: { $gte: startDate, $lte: endOfDate },
                },
              },
              {
                $group: {
                  _id: null,
                  user_ids: { $addToSet: "$user_id" },
                },
              },
              {
                $project: {
                  _id: 0,
                  type: "tip_visit",
                  user_ids: 1,
                },
              },
            ],
            video_visit: [
              {
                $match: {
                  page: "reel",
                  createdAt: { $gte: startDate, $lte: endOfDate },
                },
              },
              {
                $group: {
                  _id: null,
                  user_ids: { $addToSet: "$user_id" },
                },
              },
              {
                $project: {
                  _id: 0,
                  type: "video_visit",
                  user_ids: 1,
                },
              },
            ],
            recipe_visit: [
              {
                $match: {
                  page: "recipe",
                  createdAt: { $gte: startDate, $lte: endOfDate },
                },
              },
              {
                $group: {
                  _id: null,
                  user_ids: { $addToSet: "$user_id" },
                },
              },
              {
                $project: {
                  _id: 0,
                  type: "recipe_visit",
                  user_ids: 1,
                },
              },
            ],
            success_story: [
              {
                $match: {
                  page: "success_story",
                  createdAt: { $gte: startDate, $lte: endOfDate },
                },
              },
              {
                $group: {
                  _id: null,
                  user_ids: { $addToSet: "$user_id" },
                },
              },
              {
                $project: {
                  _id: 0,
                  type: "success_story",
                  user_ids: 1,
                },
              },
            ],
            wallet_visit: [
              {
                $match: {
                  page: "wallet",
                  createdAt: { $gte: startDate, $lte: endOfDate },
                },
              },
              {
                $group: {
                  _id: null,
                  user_ids: { $addToSet: "$user_id" },
                },
              },
              {
                $project: {
                  _id: 0,
                  type: "wallet_visit",
                  user_ids: 1,
                },
              },
            ],
          },
        },
        {
          $project: {
            all: {
              $concatArrays: [
                "$tip_visit",
                "$video_visit",
                "$recipe_visit",
                "$success_story",
                "$wallet_visit",
              ],
            },
          },
        },
        { $unwind: "$all" },
        { $replaceRoot: { newRoot: "$all" } },
      ]);
      console.log(data, 1223);
      const targetCount =
        countType === "countsToday" ? countsToday : countsThisMonth;
      data.forEach((item) => {
        targetCount[item.type] = item.user_ids.length;
        userVisitData[`${countType}`][item.type] = item.user_ids;
      });
    }
    console.log(userVisitData, 1232);
    const visitBifurcation = {
      tip_visit: {},
      video_visit: {},
      recipe_visit: {},
      success_story: {},
      wallet_visit: {},
    };
    for (const [countType, visitData] of Object.entries(userVisitData)) {
      for (const [visitType, userIds] of Object.entries(visitData)) {
        if (!userIds || userIds.length === 0) {
          visitBifurcation[visitType][countType] = {
            lead_count: 0,
            oc_count: 0,
            active_count: 0,
          };
          continue;
        }
        const { results: counts } = await readRecord({
          selectFields: [
            "COUNT(CASE WHEN cd.user_type = '0' THEN cd.user_id END) as lead_count",
            "COUNT(CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) as oc_count",
            "COUNT(CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) as active_count",
          ],
          table: `${tables.userDetails} cd`,
          conditions: [{ field: "cd.user_id", operator: "IN", value: userIds }],
        });
        visitBifurcation[visitType][countType] = {
          lead_count: counts[0].lead_count,
          oc_count: counts[0].oc_count,
          active_count: counts[0].active_count,
        };
      }
    }
    console.log(visitBifurcation, 1261);
    for (const [visitType, data] of Object.entries(visitBifurcation)) {
      visitBifurcation[visitType]["data"] = `${
        visitBifurcation[visitType]["countsToday"].lead_count +
        visitBifurcation[visitType]["countsToday"].oc_count +
        visitBifurcation[visitType]["countsToday"].active_count
      } | ${
        visitBifurcation[visitType]["countsThisMonth"].lead_count +
        visitBifurcation[visitType]["countsThisMonth"].oc_count +
        visitBifurcation[visitType]["countsThisMonth"].active_count
      }`;
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Content Visits Data Fetched Successfully",
      data: visitBifurcation,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in contentVisits:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const guideAndBookInteractions = async (req, res, next) => {
  try {
    // Initialize counters for today and this month
    const countsToday = {
      alcohol_guide_filled: 0,
      restaurant_guide_filled: 0,
      recipe_book_created: 0,
      peer_group_visit: 0,
      additional_questions_filled: 0,
      quick_filler_filled: 0,
      app_feedback_filled: 0,
    };
    const countsThisMonth = { ...countsToday };

    // Define time ranges
    const startOfDate = new Date();
    startOfDate.setHours(0, 0, 0, 0);
    const endOfDate = new Date(startOfDate);
    endOfDate.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(
      moment().startOf("month").format("YYYY-MM-DD")
    );
    startOfMonth.setHours(0, 0, 0, 0);

    // Setup conditions for today and this month
    const dateRanges = [
      [
        "countsToday",
        {
          alcohol_conditions: [
            {
              field: "DATE(uam.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
          ],
          restaurant_conditions: [
            {
              field: "DATE(urm.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
          ],
          recipe_conditions: [
            {
              field: "DATE(rc.created_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
          ],
          additional_questions_conditions: [
            {
              field: "DATE(aq.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
          ],
          quick_filler_conditions: [
            {
              field: "DATE(qf.created_at)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
          ],
          app_feedback_conditions: [
            { field: "lf.type", operator: "=", value: "App" },
            {
              field: "DATE(lf.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
          ],
          startDate: startOfDate,
          endDate: endOfDate,
        },
      ],
      [
        "countsThisMonth",
        {
          alcohol_conditions: [
            {
              field: "DATE(uam.added_date)",
              operator: "BETWEEN",
              value: [
                moment().startOf("month").format("YYYY-MM-DD"),
                moment().endOf("day").format("YYYY-MM-DD"),
              ],
            },
          ],
          restaurant_conditions: [
            {
              field: "DATE(urm.added_date)",
              operator: "BETWEEN",
              value: [
                moment().startOf("month").format("YYYY-MM-DD"),
                moment().endOf("day").format("YYYY-MM-DD"),
              ],
            },
          ],
          recipe_conditions: [
            {
              field: "DATE(rc.created_date)",
              operator: "BETWEEN",
              value: [
                moment().startOf("month").format("YYYY-MM-DD"),
                moment().endOf("day").format("YYYY-MM-DD"),
              ],
            },
          ],
          additional_questions_conditions: [
            {
              field: "DATE(aq.added_date)",
              operator: "BETWEEN",
              value: [
                moment().startOf("month").format("YYYY-MM-DD"),
                moment().endOf("day").format("YYYY-MM-DD"),
              ],
            },
          ],
          quick_filler_conditions: [
            {
              field: "DATE(qf.created_at)",
              operator: "BETWEEN",
              value: [
                moment().startOf("month").format("YYYY-MM-DD"),
                moment().endOf("day").format("YYYY-MM-DD"),
              ],
            },
          ],
          app_feedback_conditions: [
            { field: "lf.type", operator: "=", value: "App" },
            {
              field: "DATE(lf.added_date)",
              operator: "BETWEEN",
              value: [
                moment().startOf("month").format("YYYY-MM-DD"),
                moment().endOf("day").format("YYYY-MM-DD"),
              ],
            },
          ],
          startDate: startOfMonth,
          endDate: endOfDate,
        },
      ],
    ];
    const userVisitData = {
      countsToday: {},
      countsThisMonth: {},
    };
    for (const [countKey, range] of dateRanges) {
      const targetCount =
        countKey === "countsToday" ? countsToday : countsThisMonth;

      // Fetch guide and book interaction counts from SQL
      const dataCount = await readRecordUnion([
        {
          table: `${tables.userAlcoholMenu} uam`,
          selectField: [
            "COUNT(DISTINCT uam.user_id) AS count",
            "CONCAT('[', GROUP_CONCAT(DISTINCT uam.user_id), ']') AS user_ids",
            "'alcohol_guide_filled' AS type",
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "cd.user_id = uam.user_id",
            },
          ],
          condition: range.alcohol_conditions,
        },
        {
          table: `${tables.userRestaurantMenu} urm`,
          selectField: [
            "COUNT(DISTINCT urm.user_id) AS count",
            "CONCAT('[', GROUP_CONCAT(DISTINCT urm.user_id), ']') AS user_ids",
            "'restaurant_guide_filled' AS type",
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "cd.user_id = urm.user_id",
            },
          ],
          condition: range.restaurant_conditions,
        },
        {
          table: `${tables.recipeChapters} rc`,
          selectField: [
            "COUNT(DISTINCT rc.user_id) AS count",
            "CONCAT('[', GROUP_CONCAT(DISTINCT rc.user_id), ']') AS user_ids",
            "'recipe_book_created' AS type",
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "cd.user_id = rc.user_id",
            },
          ],
          condition: range.recipe_conditions,
        },
        {
          table: `${tables.additionalQuestions} aq`,
          selectField: [
            "COUNT(DISTINCT aq.user_id) AS count",
            "CONCAT('[', GROUP_CONCAT(DISTINCT aq.user_id), ']') AS user_ids",
            "'additional_questions_filled' AS type",
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "cd.user_id = aq.user_id",
            },
          ],
          condition: range.additional_questions_conditions,
        },
        {
          table: `${tables.freeFillerUsersData} qf`,
          selectField: [
            "COUNT(DISTINCT qf.user_id) AS count",
            "CONCAT('[', GROUP_CONCAT(DISTINCT qf.user_id), ']') AS user_ids",
            "'quick_filler_filled' AS type",
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "cd.user_id = qf.user_id",
            },
          ],
          condition: range.quick_filler_conditions,
        },
        {
          table: `${tables.leadFeedback} lf`,
          selectField: [
            "COUNT(DISTINCT lf.user_id) AS count",
            "CONCAT('[', GROUP_CONCAT(DISTINCT lf.user_id), ']') AS user_ids",
            "'app_feedback_filled' AS type",
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.userDetails} cd`,
              on: "cd.user_id = lf.user_id",
            },
          ],
          condition: range.app_feedback_conditions,
        },
      ]);

      // Update SQL counts
      dataCount.forEach((item) => {
        console.log(item, 1441);
        targetCount[item.type] = item.count;
        userVisitData[`${countKey}`][item.type] = safeJSONParse(item.user_ids);
      });

      // Fetch peer group visits from MongoDB
      const peerGroupData = await UserVisitLog.aggregate([
        {
          $match: {
            page: "peer_group",
            createdAt: { $gte: range.startDate, $lte: range.endDate },
          },
        },
        {
          $group: {
            _id: null,
            user_ids: { $addToSet: "$user_id" },
          },
        },
        {
          $project: {
            _id: 0,
            user_ids: 1,
          },
        },
      ]);

      targetCount.peer_group_visit = peerGroupData[0]?.user_ids?.length || 0;
      userVisitData[`${countKey}`].peer_group_visit =
        peerGroupData[0]?.user_ids || [];
    }
    console.log(userVisitData, 1471);
    // Combine today and month counts for final response
    const visitBifurcation = {
      alcohol_guide_filled: {},
      restaurant_guide_filled: {},
      recipe_book_created: {},
      peer_group_visit: {},
      additional_questions_filled: {},
      quick_filler_filled: {},
      app_feedback_filled: {},
    };

    for (const [countType, visitData] of Object.entries(userVisitData)) {
      for (const [visitType, userIds] of Object.entries(visitData)) {
        if (!userIds || userIds.length === 0) {
          console.log(visitType, countType);
          visitBifurcation[visitType][countType] = {
            lead_count: 0,
            oc_count: 0,
            active_count: 0,
          };
          continue;
        }
        const { results: counts } = await readRecord({
          selectFields: [
            "COUNT(CASE WHEN cd.user_type = '0' THEN cd.user_id END) as lead_count",
            "COUNT(CASE WHEN cd.user_status = 'Completed' THEN cd.user_id END) as oc_count",
            "COUNT(CASE WHEN cd.user_status = 'Active' THEN cd.user_id END) as active_count",
          ],
          table: `${tables.userDetails} cd`,
          conditions: [{ field: "cd.user_id", operator: "IN", value: userIds }],
        });
        console.log(counts, countType, visitType, 1492);
        visitBifurcation[visitType][countType] = {
          lead_count: counts[0].lead_count,
          oc_count: counts[0].oc_count,
          active_count: 0,
        };
      }
    }
    for (const [visitType, data] of Object.entries(visitBifurcation)) {
      visitBifurcation[visitType]["data"] = `${
        visitBifurcation[visitType]["countsToday"].lead_count +
        visitBifurcation[visitType]["countsToday"].oc_count +
        visitBifurcation[visitType]["countsToday"].active_count
      } | ${
        visitBifurcation[visitType]["countsThisMonth"].lead_count +
        visitBifurcation[visitType]["countsThisMonth"].oc_count +
        visitBifurcation[visitType]["countsThisMonth"].active_count
      }`;
    }
    // Send response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Guide and Book Interactions Data Fetched Successfully",
      data: visitBifurcation,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in guideAndBookInteractions:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getSocialMediaAnalysis = async ({ socialType, account }) => {
  try {
    const { results: existingAnalysis } = await readRecord({
      table: tables.socialMediaAnalysis,
      selectFields: [
        `CONCAT('[', GROUP_CONCAT(IFNULL(${socialType}, 'null')), ']') as ${socialType}`,
      ],
      ...(account
        ? {
            conditions: [{ field: "account", operator: "=", value: account }],
          }
        : {}),
    });

    let analysisResult = {};

    if (existingAnalysis.length > 0 && existingAnalysis[0][socialType]) {
      let rawData = existingAnalysis[0][socialType];

      // Ensure it's a valid JSON array string
      try {
        rawData = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      } catch (e) {
        console.error(`Failed to parse JSON for ${socialType}:`, rawData);
        return {};
      }

      // Parse each item if needed
      rawData = rawData.map((item) =>
        typeof item === "string" ? JSON.parse(item) : item
      );

      if (Array.isArray(rawData)) {
        // Aggregate all numeric fields
        analysisResult = rawData.reduce((acc, curr) => {
          for (const key in curr) {
            const value = curr[key];
            if (typeof value === "number") {
              acc[key] = (acc[key] || 0) + value;
            } else if (typeof value === "string" && !acc[key]) {
              acc[key] = value;
            }
          }
          return acc;
        }, {});

        // Recalculate engagement rate (if applicable)
        const { unique_engagement = 0, total_reach = 0 } = analysisResult;
        analysisResult.engagement_rate =
          total_reach > 0
            ? ((unique_engagement / total_reach) * 100).toFixed(2) + "%"
            : "0.00%";
      }
    }

    return analysisResult;
  } catch (err) {
    console.error(`Error in getSocialMediaAnalysis for ${socialType}:`, err);
    return {}; // return empty result on error
  }
};

const getAllSocialMediaPerformance = async (req, res, next) => {
  try {
    const { filter } = req.body;
    const condition = [];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const socialMedia = [
      [
        "instagram",
        [6, 11, 56, 61], // Instagram lead source IDs
      ],
      [
        "facebook",
        [7, 12, 57, 62], // Facebook lead source IDs
      ],
      [
        "youtube",
        [8, 13, 58, 63], // YouTube lead source IDs
      ],
      [
        "linkedin",
        [9, 14, 59, 64], // LinkedIn lead source IDs
      ],
      [
        "twitter",
        [10, 15, 60, 65], // Twitter lead source IDs
      ],
    ];
    const allSocialMediaUnion = [];
    socialMedia.forEach(([socialType, sourceIds]) => {
      allSocialMediaUnion.push(
        {
          selectField: [
            "COUNT(DISTINCT cd.user_id) as count",
            `'${socialType}_lead_generated' as type`,
          ],
          table: `${tables.userDetails} cd`,
          condition: [
            ...condition,
            {
              field: "cd.primary_lead_source",
              operator: "IN",
              value: sourceIds,
            },
          ],
        },
        {
          selectField: [
            "SUM(od.order_paid_amount + od.order_balance_amount) as count",
            `'${socialType}_revenue_generated' as type`,
          ],
          table: `${tables.userDetails} cd`,
          join: [
            {
              type: "INNER",
              table: `${tables.orderDetails} od`,
              on: "cd.user_id = od.user_id",
            },
          ],
          condition: [
            ...condition,
            {
              field: "cd.primary_lead_source",
              operator: "IN",
              value: sourceIds,
            },
          ],
        }
      );
    });
    const data = await readRecordUnion(allSocialMediaUnion);
    const finalData = {
      youtube: {},
      instagram: {},
      facebook: {},
      twitter: {},
      linkedin: {},
    };
    data.forEach((item) => {
      const { type, count } = item;
      finalData[type.split("_")[0]][type.split("_").slice(1).join("_")] = count
        ? Number(count)
        : 0;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All social media performance data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in allSocialMediaPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const instagramPerformance = async (req, res, next) => {
  try {
    const { filter = "today", account } = req.body;
    const condition = [
      {
        field: "cd.primary_lead_source",
        operator: "IN",
        value: [6, 11, 56, 61],
      },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }

    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [...condition],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_converted' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...condition,
          { field: "cd.user_type", operator: "=", value: "1" },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [...condition],
      },
    ]);

    const performanceData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count ? Number(curr.count) : 0;
      return acc;
    }, {});
    const instagramAnalysis = await getSocialMediaAnalysis({
      socialType: "instagram",
      account,
    });
    const mergedData = {
      ...instagramAnalysis,
      ...performanceData,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Instagram performance data fetched successfully",
      data: mergedData,
    });

    return res.status(200).json(apiResponse);
  } catch (ERROR) {
    console.error("Error fetching Instagram performance data:", ERROR);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const youtubePerformance = async (req, res, next) => {
  try {
    const { filter = "today", account } = req.body;
    const condition = [
      {
        field: "cd.primary_lead_source",
        operator: "IN",
        value: [8, 13, 58, 63],
      },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }

    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [...condition],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_converted' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...condition,
          { field: "cd.user_type", operator: "=", value: "1" },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [...condition],
      },
    ]);
    console.log("YouTube performance data:", data);

    const youtubeData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count ? Number(curr.count) : 0;
      return acc;
    }, {});

    const youtubeAnalysis = await getSocialMediaAnalysis({
      socialType: "youtube",
      account,
    });

    const mergedData = {
      ...youtubeAnalysis,
      ...youtubeData,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "YouTube performance data fetched successfully",
      data: mergedData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching YouTube performance data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const facebookPerformance = async (req, res, next) => {
  try {
    const { filter = "today", account } = req.body;
    const condition = [
      {
        field: "cd.primary_lead_source",
        operator: "IN",
        value: [7, 12, 57, 62],
      },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [...condition],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_converted' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...condition,
          { field: "cd.user_type", operator: "=", value: "1" },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [...condition],
      },
    ]);
    console.log("Facebook performance data:", data);

    const facebookData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count ? Number(curr.count) : 0;
      return acc;
    }, {});
    const facebookAnalysis = await getSocialMediaAnalysis({
      socialType: "facebook",
      account,
    });
    const mergedData = {
      ...facebookAnalysis,
      ...facebookData,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Facebook performance data fetched successfully",
      data: mergedData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching Facebook performance data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const linkedINPerformance = async (req, res, next) => {
  try {
    const { filter = "today", account } = req.body;
    const condition = [
      {
        field: "cd.primary_lead_source",
        operator: "IN",
        value: [9, 14, 59, 64],
      },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }

    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [...condition],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_converted' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...condition,
          { field: "cd.user_type", operator: "=", value: "1" },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [...condition],
      },
    ]);
    console.log("LinkedIn performance data:", data);

    const linkedInData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count ? Number(curr.count) : 0;
      return acc;
    }, {});

    const linkedInAnalysis = await getSocialMediaAnalysis({
      socialType: "linkedin",
      account,
    });

    const mergedData = {
      ...linkedInAnalysis,
      ...linkedInData,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "LinkedIn performance data fetched successfully",
      data: mergedData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching LinkedIn performance data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const twitterPerformance = async (req, res, next) => {
  try {
    const { filter = "today", account } = req.body;
    const condition = [
      {
        field: "cd.primary_lead_source",
        operator: "IN",
        value: [10, 15, 60, 65],
      },
    ];
    if (filter === "mtd") {
      const start = moment().startOf("month").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_week") {
      const start = moment().startOf("week").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "this_quarter") {
      const start = moment().startOf("quarter").format("YYYY-MM-DD");
      const end = moment().format("YYYY-MM-DD");
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [`${start}`, `${end}`],
      });
    } else if (filter === "today") {
      condition.push({
        field: "DATE(cd.added_date)",
        operator: "=",
        value: moment().format("YYYY-MM-DD"),
      });
    }

    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [...condition],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_converted' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          ...condition,
          { field: "cd.user_type", operator: "=", value: "1" },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [...condition],
      },
    ]);
    console.log("Twitter performance data:", data);

    const twitterData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count ? Number(curr.count) : 0;
      return acc;
    }, {});

    const twitterAnalysis = await getSocialMediaAnalysis({
      socialType: "twitter",
      account,
    });

    const mergedData = {
      ...twitterAnalysis,
      ...twitterData,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Twitter performance data fetched successfully",
      data: mergedData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching Twitter performance data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getSocialMediaAggregatedData = (rawPlatformData) => {
  if (!rawPlatformData) return {};

  let parsedData =
    typeof rawPlatformData === "string"
      ? JSON.parse(rawPlatformData)
      : rawPlatformData;

  parsedData = parsedData.map((item) =>
    typeof item === "string" ? JSON.parse(item) : item
  );

  const reduced = parsedData.reduce((acc, curr) => {
    for (const key in curr) {
      const value = curr[key];
      if (typeof value === "number") {
        acc[key] = (acc[key] || 0) + value;
      } else if (typeof value === "string" && !acc[key]) {
        acc[key] = value;
      }
    }
    return acc;
  }, {});

  // Recalculate engagement_rate
  const { unique_engagement = 0, total_reach = 0 } = reduced;
  reduced.engagement_rate =
    total_reach > 0
      ? ((unique_engagement / total_reach) * 100).toFixed(2) + "%"
      : "0.00%";

  return reduced;
};

const socialMediaPerformance = async (req, res, next) => {
  try {
    const { account } = req.body;

    const condition = [
      // {
      //   field: "cd.primary_lead_source",
      //   operator: "IN",
      //   value: [
      //     6, 11, 56, 61, 8, 13, 58, 63, 7, 12, 57, 62, 9, 14, 59, 64, 10, 15,
      //     60, 65,
      //   ],
      // },
      {
        field: "ls.source_group",
        operator: "=",
        value: 3,
      },
    ];

    const platforms = [
      "youtube",
      "instagram",
      "facebook",
      "linkedin",
      "twitter",
    ];

    const { results: existingAnalysis } = await readRecord({
      table: tables.socialMediaAnalysis,
      selectFields: platforms.map(
        (p) => `CONCAT('[', GROUP_CONCAT(IFNULL(${p}, '0')), ']') as ${p}`
      ),
      ...(account
        ? {
            conditions: [
              { field: "cd.account", operator: "=", value: account },
            ],
          }
        : {}),
    });

    let digitalMarketingAnalysis = {};

    if (existingAnalysis.length > 0) {
      const platformData = existingAnalysis[0];

      platforms.forEach((platform) => {
        if (platformData[platform]) {
          const aggregated = getSocialMediaAggregatedData(
            platformData[platform]
          );

          // Sum all numeric fields across platforms into one object
          Object.entries(aggregated).forEach(([key, value]) => {
            if (key === "engagement_rate") {
              const numericValue =
                typeof value === "string" && value.endsWith("%")
                  ? parseFloat(value.replace("%", "")) || 0
                  : Number(value || 0);
              digitalMarketingAnalysis[key] =
                (digitalMarketingAnalysis[key] || 0) + numericValue;
            } else {
              digitalMarketingAnalysis[key] =
                (digitalMarketingAnalysis[key] || 0) + Number(value || 0);
            }
          });
        }
      });

      // Recalculate combined engagement rate after all platforms
      const { unique_engagement = 0, total_reach = 0 } =
        digitalMarketingAnalysis;
      digitalMarketingAnalysis.engagement_rate =
        total_reach > 0
          ? ((unique_engagement / total_reach) * 100).toFixed(2) + "%"
          : "0.00%";
    }

    // Get leads and revenue data
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.leadSource} ls`,
            on: "cd.primary_lead_source = ls.source_id",
          },
        ],
        condition: [
          ...condition,
          {
            field: "DATE(cd.added_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'lead_converted' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadSource} ls`,
            on: "cd.primary_lead_source = ls.source_id",
          },
        ],
        condition: [
          ...condition,
          { field: "cd.user_type", operator: "=", value: "1" },
          { field: "od.order_type", operator: "=", value: "New" },
          { field: "od.sale_by", operator: "!=", value: 196 },
          {
            field: "DATE(od.created_at)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_generated' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadSource} ls`,
            on: "cd.primary_lead_source = ls.source_id",
          },
        ],
        condition: [
          ...condition,
          { field: "od.order_type", operator: "=", value: "New" },
          { field: "od.sale_by", operator: "!=", value: 196 },
          {
            field: "DATE(od.created_at)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);

    const digitalMarketingData = data.reduce((acc, curr) => {
      acc[curr.type] = curr.count ? Number(curr.count) : 0;
      return acc;
    }, {});

    // Merge analytics with lead/revenue data
    const mergedData = {
      ...digitalMarketingAnalysis,
      ...digitalMarketingData,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Social media performance data fetched successfully",
      data: mergedData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching social media performance data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateSocialMediaAnalysis = async (req, res, next) => {
  const { data, type, account } = req.body;
  try {
    if (!account) {
      return next(new ErrorHandler("Account is required", 400));
    }
    const typeMap = {
      youtube: "youtube",
      instagram: "instagram",
      facebook: "facebook",
      linkedin: "linkedin",
      twitter: "twitter",
      "digital marketing": "digital_marketing",
    };

    const column = typeMap[type.toLowerCase()];

    const updateData = {
      [column]: JSON.stringify(data),
    };

    await updateRecord(tables.socialMediaAnalysis, updateData, {
      account: account,
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `${type} data updated successfully`,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in updating social media analysis:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  assignedSMLeadsByCounsellors,
  overallSocialMediaLeads,
  sourceWiseLeadPerformance,
  leadStatusOverview,
  leadDownGradeAnalysis,
  salesTriggerCounts,
  counsellorSMPerformance,
  consolidatedTeamPerformance,
  contentVisits,
  guideAndBookInteractions,
  instagramPerformance,
  youtubePerformance,
  facebookPerformance,
  twitterPerformance,
  linkedINPerformance,
  socialMediaPerformance,
  updateSocialMediaAnalysis,
  getAllSocialMediaPerformance,
};
