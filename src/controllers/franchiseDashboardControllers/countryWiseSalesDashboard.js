import moment from "moment";
import ExcelJS from "exceljs";
import { readRecord, readRecordUnion } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import {
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonSelectFields,
  mapLeadDataNew,
  mapUserData,
  readRecordNewForLead,
  withMap,
} from "../../helper/common.js";

const quickSalesSnapshot = async (req, res, next) => {
  try {
    const {
      country_id,
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.query;

    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT sop.sub_order_id) AS total_orders",
          "SUM(sop.paid_amount) AS total_sales",
          "SUM(sop.balance_amount) AS total_balance",
          `COUNT(DISTINCT CASE WHEN DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN sop.sub_order_id END) AS monthly_orders`,
          `SUM(CASE WHEN DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN (sop.paid_amount) END) AS monthly_sales`,
          `SUM(CASE WHEN DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN (sop.balance_amount) END) AS monthly_balance`,
          `SUM(CASE WHEN DATE(sop.due_date) < CURDATE() AND DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN (sop.balance_amount) END) AS monthly_balance_od`,
          `SUM(sop.paid_amount) / COUNT(DISTINCT sop.sub_order_id) AS avg_order_value`,
          `SUM(CASE WHEN DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN (sop.paid_amount) END) / 
            COUNT(DISTINCT CASE WHEN DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN sop.sub_order_id END) AS monthly_avg_order_value`,
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: `od.order_id = sop.order_id`,
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          {
            orConditions: [
              {
                field: "cd.country_id",
                operator: "=",
                value: parseInt(country_id),
              },
              {
                field: `EXISTS (SELECT 1 FROM ${
                  tables.assessment_personal_details
                } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
                  country_id
                )})`,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
          {
            field: "sop.order_type",
            operator: "NOT IN",
            value: ["Free", "Upgrade"],
          },
          { field: "od.sale_by", operator: "NOT IN", value: [196] },
          {
            field: "sop.order_type",
            operator: "NOT IN",
            value: ["Free", "Upgrade"],
          },
          { field: "DATE(od.order_date)", operator: ">=", value: "2025-10-01" },
        ],
      },
    ]);

    const usersCounts = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'total_old_leads' AS type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(cd.added_date)",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [196],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'total_oc' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: `cd.user_id = sop.user_id AND sop.expiry_date = (SELECT MAX(sop2.expiry_date) FROM ${tables.subOrderPrograms} sop2 WHERE sop.user_id = sop2.user_id)`,
          },
          {
            type: "INNER",
            table: `${tables.assessment_personal_details} apd`,
            on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )}`,
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(sop.expiry_date)",
            operator: "<=",
            value: `${moment().format("YYYY-MM-DD")}`,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'total_clients' AS type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.assessment_personal_details} apd`,
            on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )}`,
          },
        ],
        condition: [{ field: "cd.user_type", operator: "=", value: "1" }],
      },
    ]);

    // Format and sanitize the data
    const result = data[0] || {};
    const formattedData = {
      total_orders: result.total_orders ? Number(result.total_orders) : 0,
      total_sales: result.total_sales
        ? Number(Number(result.total_sales).toFixed(2))
        : 0,
      total_balance: result.total_balance
        ? Number(Number(result.total_balance).toFixed(2))
        : 0,
      monthly_orders: result.monthly_orders ? Number(result.monthly_orders) : 0,
      monthly_sales: result.monthly_sales
        ? Number(Number(result.monthly_sales).toFixed(2))
        : 0,
      monthly_balance: result.monthly_balance
        ? Number(Number(result.monthly_balance))
        : 0,
      monthly_balance_od: result.monthly_balance
        ? Number(Number(result.monthly_balance_od))
        : 0,
      avg_order_value: result.avg_order_value
        ? Number(Number(result.avg_order_value).toFixed(2))
        : 0,
      monthly_avg_order_value: result.monthly_avg_order_value
        ? Number(Number(result.monthly_avg_order_value).toFixed(2))
        : 0,
      total_old_leads: usersCounts[0]?.count ? Number(usersCounts[0].count) : 0,
      total_oc: usersCounts[1]?.count ? Number(usersCounts[1].count) : 0,
      total_clients: usersCounts[2]?.count ? Number(usersCounts[2].count) : 0,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Quick sales snapshot fetched successfully",
      data: formattedData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error at quickSalesSnapshot in countryWiseSalesDashboard.js",
      error
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getSafeValue = (obj, key, isMonetary = false) => {
  const val = obj?.[key];
  if (val === null || val === undefined) return 0;
  return isMonetary ? Number(Number(val).toFixed(2)) : Number(val);
};

const leadManagement = async (req, res, next) => {
  try {
    const { country_id, start_date, end_date } = req.query;

    const commonConditions = [
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];

    const totalLeadsSelectFields = [
      "COUNT(DISTINCT cd.user_id) AS total_leads",
    ];
    const totalLeadsConditions = [
      ...commonConditions,
      {
        orConditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [196],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
    ];
    if (start_date && end_date) {
      totalLeadsConditions.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }

    const { results: totalLeadCounts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: totalLeadsSelectFields,
      conditions: totalLeadsConditions,
    });

    const unAssignedLeadsSelectFields = [
      `COUNT(DISTINCT CASE 
    WHEN 
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) >= 35
      OR (cd.country_id != 101 AND cd.country_id IS NOT NULL AND cd.country_id != 0)
      OR ls.source_group IN (3, 5)
    THEN cd.user_id 
  END) AS total_target_market_unassigned_leads`,
      `COUNT(DISTINCT CASE 
    WHEN 
      (TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) < 35 OR cd.birth_date IS NULL)
      AND (cd.country_id = 101 OR cd.country_id IS NULL)
      AND cd.country_id != 0
      AND ls.source_group NOT IN (3, 5)
    THEN cd.user_id 
  END) AS total_non_target_market_unassigned_leads`,
      "COUNT(DISTINCT cd.user_id) AS total_unassigned_leads",
    ];

    const unAssignedLeadsConditions = [
      ...commonConditions,
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.counsellor_assigned",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
    ];

    if (start_date && end_date) {
      unAssignedLeadsConditions.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }

    const { results: unAssignedLeadCounts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: unAssignedLeadsSelectFields,
      conditions: unAssignedLeadsConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
    });

    const assignedLeadsSelectFields = [
      "COUNT(DISTINCT CASE WHEN ad.role_id IN (1,2) THEN cd.user_id END) AS  total_assigned_leads",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 THEN cd.user_id END) AS total_assigned_to_mentors",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 2 THEN cd.user_id END) AS total_assigned_to_counsellors",
    ];

    const assignedLeadsConditions = [
      ...commonConditions,
      // {
      //   field: "cd.counsellor_assigned",
      //   operator: "NOT IN",
      //   value: [196],
      // },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "cd.counsellor_assigned",
        operator: "!=",
        value: "196",
        raw: true,
      },
    ];

    if (start_date && end_date) {
      assignedLeadsConditions.push({
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }

    const { results: assignedLeadCounts } = await readRecord({
      selectFields: assignedLeadsSelectFields,
      table: `${tables.userDetails} cd`,
      conditions: assignedLeadsConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });

    const consultationLeadsSelectFields = [
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 THEN csl.user_id END) AS total_mentor_consultations",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 2 THEN csl.user_id END) AS total_counsellor_consultations",
      "COUNT(DISTINCT csl.user_id) AS total_consultations",
    ];

    const consultationLeadsConditions = [
      ...commonConditions.slice(1),
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [196],
      },
      {
        orConditions: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];

    if (start_date && end_date) {
      consultationLeadsConditions.push({
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }

    const { results: consultationLeadCounts } = await readRecord({
      selectFields: consultationLeadsSelectFields,
      table: `${tables.consultationLogs} csl`,
      conditions: consultationLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    const salesLeadsSelectFields = [
      "SUM(sop.paid_amount) AS total_sales",
      "COUNT(DISTINCT sop.sub_order_id) AS total_units",
    ];
    const salesLeadsConditions = [
      { field: "od.sale_by", operator: "NOT IN", value: [196] },
      { field: "sop.order_type", operator: "=", value: "New" },
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
      { field: "od.order_type", operator: "=", value: "New" },
      {
        orConditions: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];
    if (start_date && end_date) {
      salesLeadsConditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: salesLeadCounts } = await readRecord({
      selectFields: salesLeadsSelectFields,
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: salesLeadsConditions,
    });

    const total = totalLeadCounts[0] || {};
    const unassigned = unAssignedLeadCounts[0] || {};
    const assigned = assignedLeadCounts[0] || {};
    const consulted = consultationLeadCounts[0] || {};
    const sales = salesLeadCounts[0] || {};

    const data = {
      total_leads: getSafeValue(total, "total_leads"),
      unassigned: {
        total_unassigned_leads: getSafeValue(
          unassigned,
          "total_unassigned_leads"
        ),
        total_target_market_unassigned_leads: getSafeValue(
          unassigned,
          "total_target_market_unassigned_leads"
        ),
        total_non_target_market_unassigned_leads: getSafeValue(
          unassigned,
          "total_non_target_market_unassigned_leads"
        ),
      },
      assigned: {
        total_assigned_leads: getSafeValue(assigned, "total_assigned_leads"),
        total_assigned_to_mentors: getSafeValue(
          assigned,
          "total_assigned_to_mentors"
        ),
        total_assigned_to_counsellors: getSafeValue(
          assigned,
          "total_assigned_to_counsellors"
        ),
      },
      consultation_done: {
        mentor_consultations: getSafeValue(
          consulted,
          "total_mentor_consultations"
        ),
        counsellor_consultations: getSafeValue(
          consulted,
          "total_counsellor_consultations"
        ),
        total_consultations: getSafeValue(consulted, "total_consultations"),
      },
      sales: `${getSafeValue(sales, "total_units")} | ${getSafeValue(
        sales,
        "total_sales",
        true
      )}`,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead management data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(
      "Error at leadManagement in countryWiseSalesDashboard.js",
      error
    );
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const ocManagement = async (req, res, next) => {
  try {
    const { country_id, start_date, end_date } = req.query;
    const totalOCConditions = [
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];
    if (start_date && end_date) {
      totalOCConditions.push({
        field: "DATE(sop.expiry_date)",
        operator: "NOT IN",
        value: [start_date, end_date],
      });
    }
    const { results: totalOCResults } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS total_oc_users"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.user_id = sop.user_id AND sop.expiry_date = (SELECT MAX(sop2.expiry_date) FROM ${tables.subOrderPrograms} sop2 WHERE sop.user_id = sop2.user_id)`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
      ],
      conditions: totalOCConditions,
    });
    const callsDoneSelectFields = [
      "COUNT(DISTINCT cu.user_id) AS total_calls_done",
    ];
    const callsDoneConditions = [
      { field: "cd.user_status", operator: "=", value: "Completed" },
      { field: "cu.call_status", operator: "=", value: 1 },
      { field: "cu.added_by", operator: "NOT IN", value: [196] },
    ];
    if (start_date && end_date) {
      callsDoneConditions.push({
        field: "DATE(cu.schedule_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: callsDoneResults } = await readRecord({
      selectFields: callsDoneSelectFields,
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `cu.user_id = cd.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
      ],
      conditions: callsDoneConditions,
    });

    const suggestedProgramsSelectFields = [
      "COUNT(DISTINCT sp.user_id) AS total_suggested_programs",
    ];
    const suggestedProgramsConditions = [
      { field: "cd.user_status", operator: "=", value: "Completed" },
      { field: "sp.suggested_by", operator: "NOT IN", value: [196] },
    ];
    if (start_date && end_date) {
      suggestedProgramsConditions.push({
        field: "DATE(sp.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: suggestedProgramsResults } = await readRecord({
      selectFields: suggestedProgramsSelectFields,
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `sp.user_id = cd.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
      ],
      conditions: suggestedProgramsConditions,
    });

    const salesSelectFields = [
      "SUM(sop.paid_amount) AS total_sales",
      "COUNT(DISTINCT sop.sub_order_id) AS total_units",
    ];
    const salesConditions = [
      { field: "od.sale_by", operator: "NOT IN", value: [196] },
      { field: "sop.order_type", operator: "=", value: "OCR" },
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];
    if (start_date && end_date) {
      salesConditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: salesResults } = await readRecord({
      selectFields: salesSelectFields,
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: salesConditions,
    });

    const totalOC = totalOCResults[0] || {};
    const callsDone = callsDoneResults[0] || {};
    const suggestedPrograms = suggestedProgramsResults[0] || {};
    const sales = salesResults[0] || {};
    const data = {
      total_oc_users: getSafeValue(totalOC, "total_oc_users"),
      calls_done: getSafeValue(callsDone, "total_calls_done"),
      suggested_programs: getSafeValue(
        suggestedPrograms,
        "total_suggested_programs"
      ),
      sales: `${getSafeValue(sales, "total_units")} | ${getSafeValue(
        sales,
        "total_sales",
        true
      )}`,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OC management data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching OC management data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const activeManagement = async (req, res, next) => {
  try {
    const { country_id, start_date, end_date } = req.query;
    const { results: activeUsers } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS total_active_users"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
      ],
      conditions: [{ field: "cd.user_status", operator: "=", value: "Active" }],
    });
    const suggestedSelectField = [];
    if (start_date && end_date) {
      suggestedSelectField.push(
        `COUNT(DISTINCT CASE 
    WHEN (
        (DATE(sp.added_date) BETWEEN '${start_date}' AND '${end_date}'
         OR DATE(sp.updated_date) BETWEEN '${start_date}' AND '${end_date}')
        AND cd.suggested_program_id IS NOT NULL
        AND sp.suggested_program_id NOT IN (0)
    )
    THEN sp.user_id 
END) AS total_suggested_programs`,
        `COUNT(DISTINCT CASE 
    WHEN (
        (cd.suggested_program_id IS NULL
         OR sp.suggested_program_id IN (0))
        AND (
            DATE(sp.added_date) NOT BETWEEN '${start_date}' AND '${end_date}'
            OR DATE(sp.updated_date) NOT BETWEEN '${start_date}' AND '${end_date}'
        )
    )
    THEN sp.user_id 
END) AS total_not_suggested_programs`
      );
    } else {
      suggestedSelectField.push(
        `COUNT(DISTINCT CASE 
    WHEN sp.suggested_program_id IS NOT NULL 
    THEN cd.user_id 
  END) AS total_suggested_programs`,

        `COUNT(DISTINCT CASE
    WHEN cd.suggested_program_id IS NULL
      OR sp.suggested_program_id = 0 
      OR sp.suggested_program_id IS NULL
    THEN cd.user_id
  END) AS total_not_suggested_programs`
      );
    }
    const { results: suggestedPrograms } = await readRecord({
      selectFields: suggestedSelectField,
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: `cd.suggested_program_id = sp.suggested_program_id`,
        },
      ],
      conditions: [{ field: "cd.user_status", operator: "=", value: "Active" }],
    });
    const salesConditions = [
      { field: "sop.order_type", operator: "=", value: "Renewal" },
      { field: "od.sale_by", operator: "!=", value: "196" },
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];
    if (start_date && end_date) {
      salesConditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: salesResults } = await readRecord({
      selectFields: [
        "SUM(sop.paid_amount) AS total_sales",
        "COUNT(DISTINCT sop.sub_order_id) AS total_units",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: salesConditions,
    });
    const active = activeUsers[0] || {};
    const suggested = suggestedPrograms[0] || {};
    const sales = salesResults[0] || {};
    const data = {
      total_active_users: getSafeValue(active, "total_active_users"),
      total_pitched_programs: getSafeValue(
        suggested,
        "total_suggested_programs"
      ),
      total_not_pitched_programs: getSafeValue(
        suggested,
        "total_not_suggested_programs"
      ),
      sales: `${getSafeValue(sales, "total_units")} | ${getSafeValue(
        sales,
        "total_sales",
        true
      )}`,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Active management data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching active management data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesBreakDown = async (req, res, next) => {
  try {
    const { country_id, start_date, end_date } = req.query;
    const leadSalesSelectFields = [
      "SUM(sop.paid_amount) AS total_lead_sales",
      "COUNT(DISTINCT sop.sub_order_id) AS total_lead_units",
    ];
    const leadSalesConditions = [
      { field: "od.sale_by", operator: "NOT IN", value: [196] },
      { field: "sop.order_type", operator: "=", value: "New" },
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];
    if (start_date && end_date) {
      leadSalesConditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: leadSalesResults } = await readRecord({
      selectFields: leadSalesSelectFields,
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: leadSalesConditions,
    });

    const ocSalesSelectFields = [
      "SUM(sop.paid_amount) AS total_oc_sales",
      "COUNT(DISTINCT sop.sub_order_id) AS total_oc_units",
    ];
    const ocSalesConditions = [
      { field: "od.sale_by", operator: "NOT IN", value: [196] },
      { field: "sop.order_type", operator: "=", value: "OCR" },
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];
    if (start_date && end_date) {
      ocSalesConditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }
    const { results: ocSalesResults } = await readRecord({
      selectFields: ocSalesSelectFields,
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: ocSalesConditions,
    });

    const activeSalesConditions = [
      { field: "od.sale_by", operator: "NOT IN", value: [196] },
      { field: "sop.order_type", operator: "=", value: "Renewal" },
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];
    if (start_date && end_date) {
      activeSalesConditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }

    const { results: activeSalesResults } = await readRecord({
      selectFields: [
        "SUM(sop.paid_amount) AS total_active_sales",
        "COUNT(DISTINCT sop.sub_order_id) AS total_active_units",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: activeSalesConditions,
    });

    const leadSales = leadSalesResults[0] || {};
    const ocSales = ocSalesResults[0] || {};
    const activeSales = activeSalesResults[0] || {};
    const data = {
      lead: {
        total_lead_units: getSafeValue(leadSales, "total_lead_units"),
        total_lead_sales: getSafeValue(leadSales, "total_lead_sales", true),
        commission: Number(
          (
            getSafeValue(leadSales, "total_lead_sales", true) *
            0.95 *
            0.075
          ).toFixed(2)
        ),
      },
      oc: {
        total_oc_units: getSafeValue(ocSales, "total_oc_units"),
        total_oc_sales: getSafeValue(ocSales, "total_oc_sales", true),
        commission: Number(
          (
            getSafeValue(ocSales, "total_oc_sales", true) *
            0.95 *
            0.075
          ).toFixed(2)
        ),
      },
      active: {
        total_active_units: getSafeValue(activeSales, "total_active_units"),
        total_active_sales: getSafeValue(
          activeSales,
          "total_active_sales",
          true
        ),
        commission: Number(
          (
            getSafeValue(activeSales, "total_active_sales", true) *
            0.95 *
            0.075
          ).toFixed(2)
        ),
      },
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales breakdown data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching sales breakdown data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesOpportunities = async (req, res, next) => {
  try {
    const {
      country_id,
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("month").format("YYYY-MM-DD"),
    } = req.query;
    const suggestedProgramConditions = [
      {
        field: "cd.mentor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
      {
        orConditions: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];
    if (start_date && end_date) {
      suggestedProgramConditions.push({
        field: "DATE(sp.updated_date)",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    }
    const { results: suggestedData } = await readRecord({
      selectFields: [
        "SUM(sp.suggested_amount) as total_amount",
        "COUNT(sp.suggested_program_id) as total_suggested",
        "COUNT(CASE WHEN cd.payment_date = CURDATE() AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay_today",
        "SUM(CASE WHEN cd.payment_date = CURDATE() AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as to_pay_today_amount",
        "COUNT(CASE WHEN cd.payment_date = CURDATE() + INTERVAL 1 DAY AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as to_pay_tomorrow",
        "SUM(CASE WHEN cd.payment_date = CURDATE() + INTERVAL 1 DAY AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as to_pay_tomorrow_amount",
        "COUNT(CASE WHEN cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay",
        "SUM(CASE WHEN cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as total_to_pay_amount",
        "COUNT(CASE WHEN cd.sub_sales_status = 'Pay Later' THEN sp.suggested_program_id END) as total_pay_later",
        "SUM(CASE WHEN cd.sub_sales_status = 'Pay Later' THEN sp.suggested_amount ELSE 0 END) as pay_later_amount",
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
          on: "sp.suggested_program_id = cd.suggested_program_id",
        },
      ],
      conditions: suggestedProgramConditions,
    });

    const pageVisitConditions = [
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
      {
        field: "cd.mentor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
      {
        orConditions: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];
    if (start_date && end_date) {
      pageVisitConditions.push({
        field: "iapv.visit_date",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    }
    const { results: pageVisitData } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN iapv.page_type = 1 THEN iapv.page_visit_id END) AS page_visits",
        "COUNT(DISTINCT CASE WHEN iapv.page_type = 2 THEN iapv.page_visit_id END) AS checkout_visits",
        "SUM(CASE WHEN iapv.page_type = 2 THEN iapv.amount ELSE 0 END) AS checkout_visit_amount",
      ],
      table: `${tables.inAppPageVisitLog} iapv`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "iapv.user_id = cd.user_id",
        },
      ],
      conditions: pageVisitConditions,
    });
    const suggested = suggestedData[0] || {};
    const data = {
      total_pitched: {
        units: suggested.total_suggested || 0,
        amount: Number(suggested.total_amount || 0),
      },
      rate_shared: {
        units: suggested.rate_shared || 0,
        amount: Number(suggested.rate_shared_amount || 0),
      },
      link_shared: {
        units: suggested.link_shared || 0,
        amount: Number(suggested.link_shared_amount || 0),
      },
      total_to_pay: {
        units: suggested.total_to_pay || 0,
        amount: Number(suggested.total_to_pay_amount || 0),
      },
      pay_later: {
        units: suggested.total_pay_later || 0,
        amount: Number(suggested.pay_later_amount || 0),
      },
      today_to_pay: {
        units: suggested.total_to_pay_today || 0,
        amount: Number(suggested.to_pay_today_amount || 0),
      },
      tomorrow_to_pay: {
        units: suggested.to_pay_tomorrow || 0,
        amount: Number(suggested.to_pay_tomorrow_amount || 0),
      },
      page_visits: {
        total_page_visits: pageVisitData[0]?.page_visits || 0,
        total_checkout_visits: pageVisitData[0]?.checkout_visits || 0,
        total_checkout_amount:
          Number(pageVisitData[0]?.checkout_visit_amount) || 0,
      },
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales opportunities data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching sales opportunities data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesRiskAndMisses = async (req, res, next) => {
  try {
    const { country_id, start_date, end_date } = req.query;
    const commonConditions = [
      {
        orConditions: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];
    const balanceODConditions = [
      ...commonConditions,
      { field: "od.order_balance_amount", operator: ">", value: 0 },
    ];
    if (start_date && end_date) {
      balanceODConditions.push({
        field: "od.due_date",
        operator: "<",
        value: `${start_date}`,
      });
    } else {
      balanceODConditions.push({
        field: "od.due_date",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      });
    }
    const missedCallConditions = [
      ...commonConditions,
      { field: "cu.call_status", operator: "=", value: "0" },
    ];
    if (start_date && end_date) {
      missedCallConditions.push({
        field: "cu.schedule_date",
        operator: "<",
        value: `${start_date}`,
      });
    } else {
      missedCallConditions.push({
        field: "cu.schedule_date",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      });
    }
    const engagementMissedConditions = [
      { field: "lel.status", operator: "=", value: 0 },
      {
        field: "lel.added_by",
        operator: "NOT IN",
        value: [196],
      },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.country_id",
        operator: "=",
        value: parseInt(country_id),
      },
    ];
    if (start_date && end_date) {
      engagementMissedConditions.push({
        field: "DATE(lel.engagement_date)",
        operator: "<",
        value: `${start_date}`,
      });
    } else {
      engagementMissedConditions.push({
        field: "lel.engagement_date",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      });
    }

    const missedFollowUpConditions = [
      {
        field: "fu.follow_up_status",
        operator: "=",
        value: "0",
        raw: true,
      },
      {
        field: "fu.assigned_to",
        operator: "NOT IN",
        value: [196],
      },
      ...commonConditions,
    ];
    if (start_date && end_date) {
      missedFollowUpConditions.push({
        field: "DATE(fu.follow_up_date)",
        operator: "<",
        value: `${start_date}`,
      });
    } else {
      missedFollowUpConditions.push({
        field: "fu.follow_up_date",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      });
    }

    const crossCallODConditions = [
      { field: "cu.added_by", operator: "NOT IN", value: [196] },
      { field: "cu.call_type", operator: "=", value: "50" },
      { field: "cu.call_status", operator: "=", value: 0 },
      ...commonConditions,
    ];
    if (start_date && end_date) {
      crossCallODConditions.push({
        field: "DATE(cu.schedule_date)",
        operator: "<",
        value: `${start_date}`,
      });
    } else {
      crossCallODConditions.push({
        field: "DATE(cu.schedule_date)",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      });
    }
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT od.user_id) AS total",
          "'balance_od' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "od.user_id = cd.user_id",
          },
        ],
        condition: balanceODConditions,
      },
      {
        selectField: [
          "COUNT(DISTINCT cu.user_id) AS total",
          "'missed_calls' as type",
        ],
        table: `${tables.callUpdates} cu`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
        ],
        condition: missedCallConditions,
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.user_id) as total",
          "'engagement_missed' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lel.user_id",
          },
        ],
        condition: engagementMissedConditions,
      },
      {
        table: `${tables.leadFollowUpLogs} fu`,
        selectField: [
          "COUNT(DISTINCT fu.user_id) as total",
          "'follow_up_missed' as type",
        ],
        condition: missedFollowUpConditions,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = fu.user_id",
          },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) as total",
          "'cross_call_OD' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cu.user_id = cd.user_id",
          },
        ],
        condition: crossCallODConditions,
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales risk and misses data fetched successfully",
      data: data.reduce((acc, item) => {
        acc[item.type] = parseInt(item.total);
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching sales risk and misses data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesAlert = async (req, res, next) => {
  try {
    const { country_id = false, start_date, end_date } = req.query;
    const leadsWithGoProConditions = [
      { field: "sop.type", operator: "=", value: 1 },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [196],
      },
      {
        field: "cd.user_type",
        operator: "=",
        value: "0",
      },
      country_id
        ? { field: "cd.country_id", operator: "=", value: parseInt(country_id) }
        : null,
    ].filter(Boolean);
    if (start_date) {
      leadsWithGoProConditions.push({
        field: "sop.expiry_date",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    } else {
      leadsWithGoProConditions.push({
        field: "sop.expiry_date",
        operator: ">=",
        value: "CURDATE()",
        raw: true,
      });
    }

    const leadsWithNegativeFeedbackConditions = [
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [196],
      },
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.sales_status", operator: "=", value: 2 },
      {
        field: "LCASE(JSON_UNQUOTE(JSON_EXTRACT(lfb.feedback,'$.rating')))",
        operator: "=",
        value: "sad",
      },
      country_id
        ? { field: "cd.country_id", operator: "=", value: parseInt(country_id) }
        : null,
    ].filter(Boolean);
    if (start_date && end_date) {
      leadsWithNegativeFeedbackConditions.push({
        field: "DATE(lfb.added_date)",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    }
    const followUpConditions = [
      {
        field: "lfl.follow_up_id",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [196],
      },
      { field: "cd.sales_status", operator: "=", value: 2 },
      country_id
        ? {
            orConditions: [
              {
                field: `cd.user_type = '0' AND cd.country_id = ${country_id} AND cd.sales_status = 2`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `cd.user_status = 'Completed' AND EXISTS (SELECT 1 FROM ${tables.assessment_personal_details} apd INNER JOIN ${tables.suggestedProgram} sp ON sp.suggested_program_id = cd.suggested_program_id WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${country_id} AND sp.status = '2') `,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          }
        : null,
    ].filter(Boolean);
    if (start_date && end_date) {
      followUpConditions.push({
        field: "lfl.follow_up_date",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    }

    const data = await readRecordUnion([
      {
        table: `${tables.subOrderPrograms} sop`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'leads_with_go_pro' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "sop.user_id = cd.user_id",
          },
        ],
        condition: leadsWithGoProConditions,
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'wallet_expiring_tomorrow' as type",
        ],
        condition: [
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [196],
          },
          {
            field: "cd.wallet_cycle_end_date",
            operator: "=",
            value: "CURDATE() + INTERVAL 1 DAY",
            raw: true,
          },
          {
            orConditions: [
              {
                field: `cd.user_type = '0' AND cd.country_id = ${country_id}`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `cd.user_status = 'Completed' AND EXISTS (SELECT 1 FROM ${tables.assessment_personal_details} apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${country_id}) `,
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
          "COUNT(DISTINCT cd.user_id) AS count",
          "'hot_lead_with_negative_feedback' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFeedback} lfb`,
            on: "cd.user_id = lfb.user_id AND lfb.type = 'Consultation'",
          },
        ],
        condition: leadsWithNegativeFeedbackConditions,
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'hot_followups_pending' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: `cd.user_id = lfl.user_id`,
          },
        ],
        condition: followUpConditions,
      },
    ]);

    const { results: goodWeightLossLeadAndOC } = await readRecord({
      selectFields: [
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
              ${
                start_date && end_date
                  ? `WHERE added_date BETWEEN '${start_date}' AND '${end_date}'`
                  : ""
              } 
          ) ranked_weights
          WHERE rn = 1
      ) msw`,
          on: "msw.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [196],
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
        country_id
          ? {
              orConditions: [
                {
                  field: `cd.user_type = '0' AND cd.country_id = ${country_id}`,
                  operator: "",
                  value: "",
                  raw: true,
                },
                {
                  field: `cd.user_status = 'Completed' AND EXISTS (SELECT 1 FROM ${tables.assessment_personal_details} apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${country_id}) `,
                  operator: "",
                  value: "",
                  raw: true,
                },
              ],
            }
          : null,
      ].filter(Boolean),
    });
    const { results: goodWeightLossActive } = await readRecord({
      table: `${tables.weightRecords} wr1`,
      selectFields: [
        "COUNT(DISTINCT wr1.user_id) AS count",
        "'good_weight_loss' AS type",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = wr1.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = cd.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr2`,
          on: `wr1.user_id = wr2.user_id 
           AND cd.active_order_id = wr2.sub_order_id 
           AND wr2.wmr_id = (
             SELECT MIN(wmr_id) 
             FROM ${tables.weightRecords} 
             WHERE user_id = wr1.user_id 
               AND sub_order_id = cd.active_order_id
           )`,
        },
      ],
      conditions: [
        {
          field: "cd.mentor_assigned",
          operator: "NOT IN",
          value: [196],
        },
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: "wr1.wmr_id",
          operator: "=",
          value: `(SELECT MAX(wmr_id) FROM ${tables.weightRecords} WHERE user_id = wr1.user_id AND sub_order_id = cd.active_order_id)`,
          raw: true,
        },
        {
          field: "wr2.weight - wr1.weight",
          operator: ">=",
          value: 5,
          raw: true,
        },
        country_id
          ? {
              field: `EXISTS (SELECT 1 FROM ${
                tables.assessment_personal_details
              } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
                country_id
              )})`,
              operator: "",
              value: "",
              raw: true,
            }
          : null,
      ].filter(Boolean),
    });

    const milestoneConditions = [
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [196],
      },
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "um.added_by", operator: "=", value: "User" },
      { field: "um.is_ack", operator: "=", value: 0 },
      country_id
        ? { field: "cd.country_id", operator: "=", value: parseInt(country_id) }
        : null,
    ].filter(Boolean);
    if (start_date && end_date) {
      milestoneConditions.push({
        field: "DATE(um.added_date)",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    }

    const { results: milestoneResultsLead } = await readRecord({
      table: `${tables.userMilestones} um`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as count",
        "'milestone' as type",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "um.user_id = cd.user_id",
        },
      ],
      conditions: milestoneConditions,
    });

    const milestoneActiveConditions = [
      { field: "cd.user_status", operator: "=", value: "Active" },
      {
        field: "JSON_LENGTH(mg.comment,'$.milestone_achieved')",
        operator: ">",
        value: 0,
      },
      { field: "mg.m_ack", operator: "=", value: "0" },
      {
        field: "cd.mentor_assigned",
        operator: "NOT IN",
        value: [196],
      },
      country_id
        ? {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          }
        : null,
    ].filter(Boolean);

    if (start_date && end_date) {
      milestoneActiveConditions.push({
        field: "DATE(mg.updated_date)",
        operator: "BETWEEN",
        value: [`${start_date}`, `${end_date}`],
      });
    }
    const { results: milestoneResultsActive } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) AS count",
        "'milestone' AS type",
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
        },
      ],
      conditions: milestoneActiveConditions,
    });
    const finalData = {
      leads_with_e_kit_pro: data.find(
        (item) => item.type === "leads_with_go_pro"
      )
        ? parseInt(data.find((item) => item.type === "leads_with_go_pro").count)
        : 0,
      wallet_expiring_tomorrow: data.find(
        (item) => item.type === "wallet_expiring_tomorrow"
      )
        ? parseInt(
            data.find((item) => item.type === "wallet_expiring_tomorrow").count
          )
        : 0,
      HOT_lead_with_negative_feedback: data.find(
        (item) => item.type === "hot_lead_with_negative_feedback"
      )
        ? parseInt(
            data.find((item) => item.type === "hot_lead_with_negative_feedback")
              .count
          )
        : 0,
      HOT_followups_pending: data.find(
        (item) => item.type === "hot_followups_pending"
      )
        ? parseInt(
            data.find((item) => item.type === "hot_followups_pending").count
          )
        : 0,
      good_weight_loss:
        (goodWeightLossLeadAndOC[0]
          ? parseInt(goodWeightLossLeadAndOC[0].count)
          : 0) +
        (goodWeightLossActive[0] ? parseInt(goodWeightLossActive[0].count) : 0),
      milestone:
        (milestoneResultsLead[0]
          ? parseInt(milestoneResultsLead[0].count)
          : 0) +
        (milestoneResultsActive[0]
          ? parseInt(milestoneResultsActive[0].count)
          : 0),
    };
    const apiResponse = new ApiResponse({
      status: "success",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in salesAlert:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const totalOldLeads = async (req, res, next) => {
  try {
    const { country_id } = req.query;
    const { results } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: "cd.country_id",
          operator: "=",
          value: parseInt(country_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "DATE(cd.added_date)",
          operator: "<",
          value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
        },
        {
          orConditions: [
            {
              field: "cd.counsellor_assigned",
              operator: "NOT IN",
              value: [196],
            },
            {
              field: "cd.counsellor_assigned",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
      ],
      joins: [...getCommonJoins()],
      groupBy: ["cd.user_id"],
    });
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Total old leads fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in totalOldLeads controllers", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const totalOC = async (req, res, next) => {
  try {
    const { country_id } = req.query;
    const { results } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.user_id = sop.user_id AND sop.expiry_date = (SELECT MAX(sop2.expiry_date) FROM ${tables.subOrderPrograms} sop2 WHERE sop.user_id = sop2.user_id)`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
        ...getCommonJoins(),
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Completed" },
        {
          field: "DATE(sop.expiry_date)",
          operator: "<=",
          value: `${moment().format("YYYY-MM-DD")}`,
        },
      ],
      groupBy: ["cd.user_id"],
    });
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Total OC fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in totalOC controllers", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const leadsData = async (req, res, next) => {
  try {
    const {
      country_id,
      start_date,
      end_date,
      filter,
      page = 1,
      limit = 10,
      search,
    } = req.body;
    let table = "";
    const conditions = [
      { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
    ];
    const joins = [];
    if (filter === "total_leads") {
      table = `${tables.userDetails} cd`;
      conditions.push({
        orConditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [196],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      });
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(cd.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(...getCommonJoins());
    } else if (filter === "assigned") {
      table = `${tables.userDetails} cd`;
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "cd.counsellor_assigned",
          operator: "!=",
          value: "196",
          raw: true,
        },
        {
          field: "ma.role_id",
          operator: "IN",
          value: [1, 2],
        }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(cd.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(...getCommonJoins());
    } else if (filter === "unassigned") {
      table = `${tables.userDetails} cd`;
      conditions.push(
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.counsellor_assigned",
          operator: "IS",
          value: "NULL",
          raw: true,
        }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(cd.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(...getCommonJoins());
    } else if (filter === "consultations") {
      table = `(
  SELECT cl.*
  FROM consultation_log cl
  JOIN (
    SELECT user_id, MAX(added_date) AS latest_date
    FROM consultation_log
    GROUP BY user_id
  ) latest_cl ON cl.user_id = latest_cl.user_id AND cl.added_date = latest_cl.latest_date
) csln`;
      conditions.pop();
      conditions.push(
        {
          field: "csln_ad.is_active",
          operator: "=",
          value: 1,
        },
        {
          field: "csln.consultation_by",
          operator: "NOT IN",
          value: [196],
        },
        {
          orConditions: [
            {
              field: "cd.country_id",
              operator: "=",
              value: parseInt(country_id),
            },
            {
              field: `EXISTS (SELECT 1 FROM ${
                tables.assessment_personal_details
              } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
                country_id
              )})`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(csln.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.adminUsers} csln_ad`,
          on: `csln.consultation_by = csln_ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csln.user_id = cd.user_id`,
        },
        ...getCommonJoins().slice(0, -1)
      );
    } else if (filter === "sales_done") {
      table = `${tables.orderDetails} od`;
      conditions.pop();
      conditions.push(
        { field: "od.sale_by", operator: "NOT IN", value: [196] },
        { field: "sop.order_type", operator: "=", value: "New" },
        { field: "cd.country_id", operator: "=", value: parseInt(country_id) },
        { field: "od.order_type", operator: "=", value: "New" },
        {
          orConditions: [
            {
              field: "cd.country_id",
              operator: "=",
              value: parseInt(country_id),
            },
            {
              field: `EXISTS (SELECT 1 FROM ${
                tables.assessment_personal_details
              } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
                country_id
              )})`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        ...getCommonJoins()
      );
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: table,
      joins: joins,
      conditions: conditions,
      groupBy: ["cd.user_id"],
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
        page: parseInt(page),
        limit: parseInt(limit),
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
      message: "Leads data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leaddData Controller", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const oldClientData = async (req, res, next) => {
  try {
    const {
      country_id,
      start_date,
      end_date,
      page = 1,
      limit = 10,
      search,
      filter,
    } = req.body;
    let table = "";
    const conditions = [
      { field: "cd.user_status", operator: "=", value: "Completed" },
    ];
    const joins = [];
    if (filter === "total_oc") {
      table = `${tables.userDetails} cd`;
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(sop.expiry_date)",
          operator: "NOT IN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.user_id = sop.user_id AND sop.expiry_date = (SELECT MAX(sop2.expiry_date) FROM ${tables.subOrderPrograms} sop2 WHERE sop.user_id = sop2.user_id)`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
        ...getCommonJoins()
      );
    } else if (filter === "calls_done") {
      table = `${tables.callUpdates} cu`;
      conditions.push(
        { field: "cu.call_status", operator: "=", value: 1 },
        { field: "cu.added_by", operator: "NOT IN", value: [196] }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `cu.user_id = cd.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
        ...getCommonJoins()
      );
    } else if (filter === "pitched_ocs") {
      table = `${tables.suggestedProgram} sp`;
      conditions.push({
        field: "sp.suggested_by",
        operator: "NOT IN",
        value: [196],
      });
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(sp.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `sp.user_id = cd.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} apd`,
          on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
            country_id
          )}`,
        },
        ...getCommonJoins().slice(0, 1),
        ...getCommonJoins().slice(2)
      );
    } else if (filter === "sales_done") {
      table = `${tables.orderDetails} od`;
      conditions.pop();
      conditions.push(
        { field: "od.sale_by", operator: "NOT IN", value: [196] },
        { field: "sop.order_type", operator: "=", value: "OCR" },
        { field: "cd.country_id", operator: "=", value: parseInt(country_id) }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        ...getCommonJoins()
      );
    }
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: table,
      joins: joins,
      conditions: conditions,
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
        page: parseInt(page),
        limit: parseInt(limit),
      },
      countTotal: true,
      groupBy: ["cd.user_id"],
    });
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Old Client data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error on oldClientData", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const activeClientData = async (req, res, next) => {
  try {
    const {
      country_id,
      start_date,
      end_date,
      page = 1,
      limit = 10,
      search,
      filter,
    } = req.body;
    let table = "";
    const conditions = [
      { field: "cd.user_status", operator: "=", value: "Active" },
    ];
    const joins = [];
    const groupBy = ["cd.user_id"];
    if (filter === "total_active") {
      table = `${tables.userDetails} cd`;
      joins.push({
        type: "INNER",
        table: `${tables.assessment_personal_details} apd`,
        on: `cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
          country_id
        )}`,
      });
    } else if (filter === "pitched") {
      table = `${tables.userDetails} cd`;

      joins.push({
        type: "INNER",
        table: `${tables.assessment_personal_details} apd`,
        on: `cd.user_id = apd.user_id 
     AND apd.country_of_residence = ${parseInt(country_id)}`,
      });

      if (start_date && end_date) {
        conditions.push({
          field: `EXISTS (
        SELECT 1 
        FROM ${tables.suggestedProgram} sp
        WHERE sp.suggested_program_id = cd.suggested_program_id
        AND DATE(sp.added_date) BETWEEN '${start_date}' AND '${end_date}'
      )`,
          operator: "",
          value: "",
          raw: true,
        });
      } else {
        conditions.push({
          field: `EXISTS (
        SELECT 1 
        FROM ${tables.suggestedProgram} sp
        WHERE sp.suggested_program_id = cd.suggested_program_id
      )`,
          operator: "",
          value: "",
          raw: true,
        });
      }
    } else if (filter === "not_pitched") {
      table = `${tables.userDetails} cd`;

      joins.push({
        type: "INNER",
        table: `${tables.assessment_personal_details} apd`,
        on: `cd.user_id = apd.user_id 
     AND apd.country_of_residence = ${parseInt(country_id)}`,
      });

      if (start_date && end_date) {
        conditions.push({
          field: `NOT EXISTS (
        SELECT 1 
        FROM ${tables.suggestedProgram} sp 
        WHERE sp.suggested_program_id = cd.suggested_program_id
        AND DATE(sp.added_date) BETWEEN '${start_date}' AND '${end_date}'
      )`,
          operator: "",
          value: "",
          raw: true,
        });
      } else {
        conditions.push({
          field: `NOT EXISTS (
        SELECT 1 
        FROM ${tables.suggestedProgram} sp 
        WHERE sp.suggested_program_id = cd.suggested_program_id
      )`,
          operator: "",
          value: "",
          raw: true,
        });
      }
    } else if (filter === "sales_done") {
      table = `${tables.orderDetails} od`;
      conditions.pop();
      conditions.push(
        { field: "sop.order_type", operator: "=", value: "Renewal" },
        { field: "od.sale_by", operator: "!=", value: "196" },
        { field: "cd.country_id", operator: "=", value: parseInt(country_id) }
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        }
      );
      groupBy.pop();
      groupBy.push("od.user_id");
    }
    const { results, totalCount } = await readRecord({
      selectFields: ["cd.user_id"],
      table: table,
      joins: joins,
      conditions: conditions,
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
        page: parseInt(page),
        limit: parseInt(limit),
      },
      countTotal: true,
      groupBy,
    });
    const { userIds, orderById } = generateUserIdsAndOrderById(results);
    if (userIds.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Active Client data fetched successfully",
        data: [],
        totalCount,
      });
      return res.status(200).json(apiResponse);
    }
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        latest_weight_data: true,
      },
      orderBy: orderById,
    });
    const finalData = userIds.map((user_id, index) => {
      const userDetails = details[index];
      const mappedData = mapUserData({
        details: userDetails,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Active Client data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error on activeClientData", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const orderDataDownload = async (req, res, next) => {
  try {
    const { country_id, start_date, end_date } = req.body;
    if (!country_id || !start_date || !end_date) {
      return next(
        new ErrorHandler(
          "country_id, start_date and end_date are required fields",
          400
        )
      );
    }
    const { results } = await readRecord({
      selectFields: [
        "od.order_date AS 'Date'",
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) AS Name",
        "cd.email_id AS Email",
        "CONCAT(cd.phone_code,cd.phone_number) AS Phone",
        "pm.program_name AS Program",
        "sop.total_sessions AS Session",
        "ps.mrp AS Amount",
        "od.order_paid_amount AS 'Paid Amount'",
        "apm.name AS 'Payment Method'",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "INNER",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "INNER",
          table: `${tables.accountPaymentModes} apm`,
          on: "od.payment_mode = apm.id",
        },
      ],
      conditions: [
        {
          orConditions: [
            {
              field: "cd.country_id",
              operator: "=",
              value: parseInt(country_id),
            },
            {
              field: `EXISTS (SELECT 1 FROM ${
                tables.assessment_personal_details
              } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
                country_id
              )})`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        },
        {
          field: "sop.order_type",
          operator: "NOT IN",
          value: ["Free", "Upgrade"],
        },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        },
      ],
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Order Data");
    worksheet.columns = [
      { header: "Date", key: "Date", width: 15 },
      { header: "Name", key: "Name", width: 25 },
      { header: "Email", key: "Email", width: 30 },
      { header: "Phone", key: "Phone", width: 15 },
      { header: "Program", key: "Program", width: 25 },
      { header: "Session", key: "Session", width: 10 },
      { header: "Amount", key: "Amount", width: 15 },
      { header: "Paid Amount", key: "Paid Amount", width: 15 },
      { header: "Payment Method", key: "Payment Method", width: 20 },
    ];
    results.forEach((data) => {
      worksheet.addRow(data);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="order_data.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Error in orderDataDownload:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesOpportunitiesData = async (req, res, next) => {
  try {
    const {
      country_id,
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("month").format("YYYY-MM-DD"),
      filter,
    } = req.body;
    let table = "";
    const conditions = [
      {
        field: "cd.mentor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
      {
        orConditions: [
          {
            field: "cd.country_id",
            operator: "=",
            value: parseInt(country_id),
          },
          {
            field: `EXISTS (SELECT 1 FROM ${
              tables.assessment_personal_details
            } apd WHERE cd.user_id = apd.user_id AND apd.country_of_residence = ${parseInt(
              country_id
            )})`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];
    const joins = [];
    if (filter === "link_shared") {
      table = `${tables.suggestedProgram} sp`;
      conditions.push(
        {
          field: "sp.suggested_amount",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.suggested_amount", operator: ">", value: 0 },
        {
          field: "sp.payment_link_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        }
      );
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `sp.suggested_program_id = cd.suggested_program_id`,
        },
        ...getCommonJoins().slice(0, 1),
        ...getCommonJoins().slice(2)
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
    } else if (filter === "rate_shared") {
      table = `${tables.suggestedProgram} sp`;
      conditions.push(
        {
          field: "sp.suggested_amount",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.suggested_amount", operator: ">", value: 0 },
        {
          field: "sp.payment_link_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        }
      );
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `sp.suggested_program_id = cd.suggested_program_id`,
        },
        ...getCommonJoins().slice(0, 1),
        ...getCommonJoins().slice(2)
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
    } else if (filter === "to_pay") {
      table = `${tables.suggestedProgram} sp`;
      conditions.push({
        field: "cd.sub_sales_status",
        operator: "=",
        value: "To Pay",
      });
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `sp.suggested_program_id = cd.suggested_program_id`,
        },
        ...getCommonJoins().slice(0, 1),
        ...getCommonJoins().slice(2)
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        });
      }
    } else if (filter === "pay_later") {
      table = `${tables.suggestedProgram} sp`;
      conditions.push({
        field: "cd.sub_sales_status",
        operator: "=",
        value: "Pay Later",
      });
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `sp.user_id = cd.user_id`,
        },
        ...getCommonJoins().slice(0, 1),
        ...getCommonJoins().slice(2)
      );
      if (start_date && end_date) {
        conditions.push({
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        });
      }
    } else if (filter === "page_visit") {
      table = `${tables.inAppPageVisitLog} iapv`;
      conditions.push({ field: "iapv.page_type", operator: "=", value: 1 });
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `iapv.user_id = cd.user_id`,
        },
        ...getCommonJoins()
      );
      if (start_date && end_date) {
        conditions.push({
          field: "iapv.visit_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        });
      }
    } else if (filter === "checkout_visit") {
      table = `${tables.inAppPageVisitLog} iapv`;
      conditions.push({ field: "iapv.page_type", operator: "=", value: 2 });
      joins.push(
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `iapv.user_id = cd.user_id`,
        },
        ...getCommonJoins()
      );
      if (start_date && end_date) {
        conditions.push({
          field: "iapv.visit_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        });
      }
    }
    const { results } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...getCommonSelectFields()],
      table: table,
      joins: joins,
      conditions: conditions,
      groupBy: ["cd.user_id"],
    });
    const finalData = results.map((item, index) => {
      const mappedData = mapLeadDataNew({
        details: item,
      });
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Opportunities data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in salesOpportunitiesData:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  activeClientData,
  activeManagement,
  quickSalesSnapshot,
  leadManagement,
  leadsData,
  ocManagement,
  orderDataDownload,
  oldClientData,
  salesBreakDown,
  salesOpportunities,
  salesOpportunitiesData,
  salesRiskAndMisses,
  salesAlert,
  totalOldLeads,
  totalOC,
};
