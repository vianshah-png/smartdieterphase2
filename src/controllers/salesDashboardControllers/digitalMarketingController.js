import moment from "moment";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { fixedDecimal, readRecordNewForLead } from "../../helper/common.js";
import * as XLSX from "xlsx";
import path from "path";
import { getAnalytics } from "../googleAnalytics.js";

const overAllLeadGenderWise = async (req, res, next) => {
  try {
    const { filter = "today" } = req.body;
    const condition = [{ field: "cd.user_type", operator: "=", value: "0" }];
    console.log(filter, 11);
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
      console.log(start, filter);
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
        selectField: ["COUNT(*) AS count", "'overall_male_leads' AS type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.gender", operator: "=", value: "1" },
          ...condition,
        ],
      },
      {
        selectField: ["COUNT(*) AS count", "'overall_female_leads' AS type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.gender", operator: "=", value: "2" },
          ...condition,
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Overall Lead Gender Wise Count",
      data: data.reduce((acc, curr) => {
        acc[curr.type] = curr.count;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in overAllLeadGenderWise:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const clinicalConditionsWiseLeads = async (req, res, next) => {
  try {
    const leadConditions = [
      [
        "pcos",
        [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(cd.added_date)",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            orConditions: [
              { field: "hs.health_issue", operator: "LIKE", value: "pcos" },
              { field: "hs.health_issue", operator: "LIKE", value: "PCOS" },
              {
                field: `JSON_VALID(hs.health_issue) AND (
              JSON_CONTAINS(hs.health_issue, '"pcos"') OR
              JSON_CONTAINS(hs.health_issue, '"PCOS"')
            )`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `JSON_VALID(cd.health_conditions) AND (
              JSON_CONTAINS(cd.health_conditions, '"pcos"') OR
              JSON_CONTAINS(cd.health_conditions, '"PCOS"')
            )`,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      ],
      [
        "menopause_(peri_&_post)",
        [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(cd.added_date)",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            orConditions: [
              {
                field: `JSON_VALID(hs.health_issue) AND (
              JSON_CONTAINS(hs.health_issue, '"Peri menopause"') OR
              JSON_CONTAINS(hs.health_issue, '"peri menopause"') OR
              JSON_CONTAINS(hs.health_issue, '"Post menopause"') OR
              JSON_CONTAINS(hs.health_issue, '"post menopause"')
            )`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `JSON_VALID(cd.health_conditions) AND JSON_CONTAINS(cd.health_conditions, '"Menopause"')`,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      ],
      [
        "diabetes",
        [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(cd.added_date)",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            orConditions: [
              { field: "hs.health_issue", operator: "LIKE", value: "diabetes" },
              { field: "hs.health_issue", operator: "LIKE", value: "Diabetes" },
              {
                field: "hs.health_issue",
                operator: "LIKE",
                value: "Pre Diabetic",
              },
              {
                field: `JSON_VALID(hs.health_issue) AND (
              JSON_CONTAINS(hs.health_issue, '"diabetes"') OR
              JSON_CONTAINS(hs.health_issue, '"Diabetes"') OR
              JSON_CONTAINS(hs.health_issue, '"Pre Diabetic"') OR
              JSON_CONTAINS(hs.health_issue, '"Pre-Diabetes"') OR
              JSON_CONTAINS(hs.health_issue, '"Type 1 Diabetes"') OR
              JSON_CONTAINS(hs.health_issue, '"Type 2 Diabetes"')
            )`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `JSON_VALID(cd.health_conditions) AND JSON_CONTAINS(cd.health_conditions, '"Diabletes"')`,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      ],
      [
        "thyroid",
        [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(cd.added_date)",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            orConditions: [
              { field: "hs.health_issue", operator: "LIKE", value: "thyroid" },
              { field: "hs.health_issue", operator: "LIKE", value: "Thyroid" },
              {
                field: `JSON_VALID(hs.health_issue) AND (
              JSON_CONTAINS(hs.health_issue, '"thyroid"') OR
              JSON_CONTAINS(hs.health_issue, '"Thyroid"') OR
              JSON_CONTAINS(hs.health_issue, '"Hyperthyroid"') OR
              JSON_CONTAINS(hs.health_issue, '"Hypothyroid"')
            )`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `JSON_VALID(cd.health_conditions) AND JSON_CONTAINS(cd.health_conditions, '"Thyroid"')`,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      ],
      [
        "cholesterol",
        [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "DATE(cd.added_date)",
            operator: "<",
            value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
          },
          {
            orConditions: [
              {
                field: "hs.health_issue",
                operator: "LIKE",
                value: "cholesterol",
              },
              {
                field: "hs.health_issue",
                operator: "LIKE",
                value: "Cholesterol",
              },
              {
                field: `JSON_VALID(hs.health_issue) AND (
              JSON_CONTAINS(hs.health_issue, '"cholesterol"') OR
              JSON_CONTAINS(hs.health_issue, '"Cholesterol"')
            )`,
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: `JSON_VALID(cd.health_conditions) AND JSON_CONTAINS(cd.health_conditions, '"Cholesterol"')`,
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      ],
    ];

    // Clinical condition rules for OC leads
    const ocConditions = [
      [
        "pcos",
        [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "asmh.pcos", operator: "=", value: "yes" },
        ],
      ],
      [
        "menopause_(peri_&_post)",
        [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "asmh.other_medical_issue",
            operator: "LIKE",
            value: "meno",
          },
        ],
      ],
      [
        "diabetes",
        [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "asmh.diabetes",
            operator: "IN",
            value: [
              "Type 2",
              "Type 1",
              "Diabetes type1",
              "Diabetes type2",
              "Diabetes Mild",
              "Pre Diabetes",
              "Diabetes Severe",
              "Gestational Diabetes",
            ],
          },
        ],
      ],
      [
        "thyroid",
        [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            field: "asmh.thyroid",
            operator: "IN",
            value: ["Hypothyroid", "Hyperthyroid", "Yes"],
          },
        ],
      ],
      [
        "cholesterol",
        [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          {
            orConditions: [
              { field: "asmh.cholesterol", operator: "=", value: "High" },
              {
                field: "asmh.other_medical_issue",
                operator: "LIKE",
                value: "cholesterol",
              },
            ],
          },
        ],
      ],
    ];

    // Build SQL-like query definitions for leads
    const leadCountsQueries = leadConditions.map(
      ([conditionName, conditions]) => ({
        withQueries: [
          {
            name: "latest_health",
            query: `
            SELECT hs.*
            FROM ${tables.healthScoreClient} hs
            JOIN (
              SELECT user_id, MAX(created) AS max_created
              FROM ${tables.healthScoreClient}
              GROUP BY user_id
            ) latest ON hs.user_id = latest.user_id AND hs.created = latest.max_created`,
          },
        ],
        selectFields: [`COUNT(*) AS count`, `'${conditionName}_leads' AS type`],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `latest_health hs`,
            on: "cd.user_id = hs.user_id",
          },
        ],
        conditions: conditions,
      })
    );

    // Execute lead queries
    const leadData = await Promise.all(
      leadCountsQueries.map((query) => readRecordNewForLead(query))
    );

    // Build SQL-like query definitions for OC leads
    const ocCountsQueries = ocConditions.map(([conditionName, conditions]) => ({
      withQueries: [
        {
          name: "assessment_medical_history",
          query: `
            SELECT asmh.*
            FROM ${tables.assessment_medical_history} asmh
            JOIN (
              SELECT user_id, MAX(added_date) AS max_created
              FROM ${tables.assessment_medical_history}
              GROUP BY user_id
            ) latest ON asmh.user_id = latest.user_id AND asmh.added_date = latest.max_created`,
        },
      ],
      selectFields: [`COUNT(*) AS count`, `'${conditionName}_ocl' AS type`],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `assessment_medical_history asmh`,
          on: "cd.user_id = asmh.user_id",
        },
      ],
      conditions: conditions,
    }));

    // Execute OC queries
    const ocData = await Promise.all(
      ocCountsQueries.map((query) => readRecordNewForLead(query))
    );

    // Combine results into a final map
    const result = {};
    console.log("Lead Data:", leadData);
    console.log("OC Data:", ocData);
    // Populate lead data
    leadData.forEach((entry) => {
      const item = entry?.results?.[0];
      if (!item || !item.type) return;

      const key = item.type.replace("_leads", "");
      if (!result[key]) result[key] = {};
      result[key].leads = item.count || 0;
    });

    // Populate OC lead data
    ocData.forEach((entry) => {
      const item = entry?.results?.[0];
      if (!item || !item.type) return;

      const key = item.type.replace("_ocl", "");
      if (!result[key]) result[key] = {};
      result[key].ocl = item.count || 0;
    });

    // Send API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Clinical Conditions-wise Leads Fetched Successfully",
      data: result,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in clinicalConditionsWiseLeads:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadMISForRetargeting = async (req, res, next) => {
  try {
    const {
      genders = [],
      age_groups = [],
      health_conditions = [],
      regions = [],
      countries = [],
      states = [],
      cities = [],
      statuses = [],
      stages = [],
      page = 1,
      limit = 10,
      is_export = false,
    } = req.body;
    let { user_types = [] } = req.body;
    user_types = Array.isArray(user_types)
      ? user_types.map(String)
      : [String(user_types)];
    const conditions = [{ field: "cd.phone_code", operator: "!=", value: "" }];
    const orConditions = [];
    const joins = [];
    const filterBogusLeadsConditions = [
      {
        field:
          "cd.user_type = '0' AND cd.counsellor_assigned NOT IN (0,10,196) ",
        operator: "",
        value: "",
        raw: true,
      },
    ];
    const filterBogusOcConditions = [
      {
        field:
          "cd.user_type = '1' AND cd.mentor_assigned NOT IN (0,10,196) AND cd.mentor_assigned IS NOT NULL",
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (user_types.includes("lead")) {
      orConditions.push(...filterBogusLeadsConditions);
    }
    if (user_types.includes("oc")) {
      orConditions.push(...filterBogusOcConditions);
    }
    if (orConditions.length === 0) {
      conditions.push({
        orConditions: [
          ...filterBogusLeadsConditions,
          ...filterBogusOcConditions,
        ],
      });
    } else {
      conditions.push({
        orConditions: [...orConditions],
      });
    }
    if (genders.length > 0) {
      conditions.push({
        orConditions: [{ field: "cd.gender", operator: "IN", value: genders }],
      });
    }
    if (age_groups.length > 0) {
      const groupOrConditions = [];

      age_groups.forEach((group) => {
        if (group === "55+") {
          groupOrConditions.push({
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: ">=",
            value: 55,
          });
        } else {
          const [min, max] = group.split("-").map(Number);
          groupOrConditions.push({
            field: "TIMESTAMPDIFF(YEAR,cd.birth_date,CURDATE())",
            operator: "BETWEEN",
            value: [min, max],
          });
        }
      });

      conditions.push({
        orConditions: groupOrConditions,
      });
    }

    if (health_conditions.length > 0) {
      conditions.push({
        orConditions: [
          {
            field: `JSON_VALID(cd.health_conditions) AND (
                    ${health_conditions
                      .map(
                        (hc) => `JSON_CONTAINS(cd.health_conditions, '"${hc}"')`
                      )
                      .join(" OR ")}
                    )`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });
    }
    if (regions.length > 0) {
      conditions.push({
        orConditions: [
          { field: "r.region_id", operator: "IN", value: regions },
        ],
      });
    }
    if (countries.length > 0) {
      conditions.push({
        orConditions: [
          { field: "cd.country_id", operator: "IN", value: countries },
        ],
      });
    }
    if (states.length > 0) {
      conditions.push({
        orConditions: [{ field: "cd.state_id", operator: "IN", value: states }],
      });
    }
    if (cities.length > 0) {
      conditions.push({
        orConditions: [{ field: "cd.city_id", operator: "IN", value: cities }],
      });
    }
    if (statuses.length > 0) {
      if (user_types.includes("lead")) {
        conditions.push({
          orConditions: [
            {
              field: "cd.sales_status",
              operator: "IN",
              value: statuses.map((s) => String(s)),
            },
          ],
        });
      }
      if (user_types.includes("oc")) {
        conditions.push({
          orConditions: [
            {
              field: "sp.status",
              operator: "IN",
              value: statuses,
            },
          ],
        });
      }
    }
    if (stages.length > 0) {
      conditions.push({
        orConditions: [{ field: "cd.stage", operator: "IN", value: stages }],
      });
    }
    const { results, totalCount } = await readRecordNewForLead({
      selectFields: [
        "COALESCE(NULLIF(cd.first_name, ''), cd.last_name, '') AS Name",
        `CASE 
        WHEN cd.gender = '0' THEN 'N/A' 
        WHEN cd.gender = '1' THEN 'Male' 
        WHEN cd.gender = '2' THEN 'Female' 
      END AS Gender`,
        `CASE WHEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) < 18 THEN '0-17'
        WHEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) BETWEEN 18 AND 24 THEN '18-24'
        WHEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) BETWEEN 25 AND 34 THEN '25-34'
        WHEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) BETWEEN 35 AND 44 THEN '35-44'
        WHEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) BETWEEN 45 AND 54 THEN '45-54'
        WHEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) >= 55 THEN '55+'
      END AS 'Age Group'`,
        `REPLACE(REPLACE(REPLACE(cd.health_conditions, '["', ''), '"]', ''), '","', ',') AS 'Clinical Conditions'`,
        "CONCAT_WS(', ', NULLIF(ci.city_name, ''), NULLIF(s.state_name, ''), NULLIF(c.country_name, '')) AS 'Region'",
        "CASE WHEN cd.user_type = '0' THEN CASE WHEN cd.sales_status = '0' THEN 'To Pitch' WHEN cd.sales_status = '1' THEN 'First Pitch' WHEN cd.sales_status = '2' THEN 'Hot' WHEN cd.sales_status = '3' THEN 'Warm' WHEN cd.sales_status = '4' THEN 'Cold' WHEN cd.sales_status = '6' THEN 'Connected' WHEN cd.sales_status = '7' THEN 'Consultation Booked' ELSE 'Other' END WHEN cd.user_type = '1' THEN CASE WHEN sp.status = 0 THEN 'To Pitch' WHEN sp.status = 1 THEN 'First Pitch' WHEN sp.status = 2 THEN 'Hot' WHEN sp.status = 3 THEN 'Warm' WHEN sp.status = 4 THEN 'Cold' WHEN sp.status = 6 THEN 'Connected' WHEN sp.status = 7 THEN 'Consultation Booked' ELSE 'Other' END ELSE 'Other' END AS 'Sales Status'",
        "IF(cd.stage IS NULL, 'N/A', CONCAT('Stage', cd.stage)) AS `Stage`",
        "cd.email_id AS `Email`",
        "CASE WHEN cd.user_type = '0' THEN 'Lead' WHEN cd.user_type = '1' THEN 'OC' END AS `User Type`",
        "cd.phone_code AS 'Phone Code'",
        "cd.phone_number AS 'Phone Number'",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.countries} c`,
          on: "cd.country_id = c.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} s`,
          on: "cd.state_id = s.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} ci`,
          on: "cd.city_id = ci.city_id",
        },
        {
          type: "LEFT",
          table: `region_members rm`,
          on: "cd.country_id = rm.country_id",
        },
        {
          type: "LEFT",
          table: `regions r`,
          on: `r.region_id = rm.region_id`,
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
      conditions,
      ...(!is_export && {
        pagination: {
          page,
          limit,
        },
      }),
      countTotal: true,
      groupBy: ["cd.user_id"],
      orderBy: ["cd.added_date DESC"],
    });
    if (is_export) {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(results);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Lead MIS");

      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=lead_mis.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      return res.send(buffer);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead MIS for Retargeting",
      data: results,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadMISForRetargeting:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const addCampaign = async (req, res, next) => {
  try {
    const {
      name,
      type,
      status,
      start_date,
      end_date,
      ad_spend,
      target_users,
      digital_marketing,
      added_by,
    } = req.body;
    const columns = [
      "name",
      "type",
      "status",
      "start_date",
      "end_date",
      "ad_spend",
      "target_users",
      "digital_marketing",
      "added_by",
    ];
    const values = [
      name,
      type,
      status,
      start_date,
      end_date,
      ad_spend,
      JSON.stringify(target_users),
      JSON.stringify(digital_marketing),
      added_by,
    ];
    console.log(columns, 8);
    console.log(values, 9);
    const insertResult = await insertRecord(tables.campaigns, columns, values);
    console.log(insertResult, 10);
    if (insertResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Campaign added successfully",
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add campaign", 400));
    }
  } catch (error) {
    console.log("Error in addCampaign controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDetailsOfCampaigns = async (req, res, next) => {
  try {
    const { results: campaignDetails } = await readRecord({
      table: `${tables.campaigns} c`,
      selectFields: [
        "c.id",
        "c.name",
        "c.type",
        "c.status",
        "COUNT(DISTINCT cd.user_id) AS lead_generated",
        `CAST( COALESCE(SUM(od.order_paid_amount + od.order_balance_amount), 0) AS DOUBLE ) AS revenue_generated`,
        "ls.source_name as type_name",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.primary_lead_source = c.type",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "cd.user_id = od.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "c.type = ls.source_id",
        },
      ],
      groupBy: ["c.id", "c.name", "c.type", "c.status"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched Successfully",
      data: campaignDetails || [],
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in fetching campaign data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCampaigsDetailsById = async (req, res, next) => {
  const { campaign_id } = req.body;
  try {
    const { results } = await readRecord({
      table: tables.campaigns,
      selectFields: [
        "name",
        "type",
        "status",
        "start_date",
        "end_date",
        "ad_spend",
        "target_users",
        "digital_marketing",
        "ls.source_name as type_name",
        "COUNT(DISTINCT cd.user_id) AS lead_generated",
        `CAST( COALESCE(SUM(od.order_paid_amount + od.order_balance_amount), 0) AS DOUBLE ) AS revenue_generated`,
        "added_by",
      ],
      conditions: [{ field: "id", operator: "=", value: campaign_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "type = ls.source_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cd.primary_lead_source = type",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "cd.user_id = od.user_id",
        },
      ],
    });

    if (!results || results.length === 0) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const campaign = results[0];

    // helper function for date formatting
    const formatDate = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // parse JSON fields
    let targetUsers = null;
    let digitalMarketing = null;

    try {
      targetUsers = campaign.target_users
        ? JSON.parse(campaign.target_users)
        : null;
    } catch (e) {
      targetUsers = campaign.target_users; // fallback if already object
    }

    try {
      digitalMarketing = campaign.digital_marketing
        ? JSON.parse(campaign.digital_marketing)
        : null;
    } catch (e) {
      digitalMarketing = campaign.digital_marketing; // fallback
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "The data fetched successfully",
      data: {
        campaignName: campaign.name,
        campaignType: campaign.type,
        campaignTypeName: campaign.type_name,
        campaignStatus: campaign.status,
        campaignStartDate: formatDate(campaign.start_date),
        campaignEndDate: formatDate(campaign.end_date),
        campaignAdSpend: campaign.ad_spend,
        targetUsers: targetUsers,
        digitalMarketing: digitalMarketing,
        leadsGenerated: campaign.lead_generated,
        revenueGenerated: campaign.revenue_generated,
        addedBy: campaign.added_by,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in fetching campaign data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateCampaignDetails = async (req, res, next) => {
  const {
    id,
    name,
    type,
    status,
    start_date,
    end_date,
    ad_spend,
    target_users,
    digital_marketing,
    added_by,
  } = req.body;

  try {
    // Ensure objects are stringified
    const safeStringify = (data) =>
      typeof data === "string" ? data : JSON.stringify(data);

    // Build update data as object (as expected by updateRecord)
    const updateData = {
      name,
      type,
      status,
      start_date,
      end_date,
      ad_spend,
      target_users: safeStringify(target_users),
      digital_marketing: safeStringify(digital_marketing),
      added_by,
    };

    // Condition
    const whereCondition = { id };

    // Call your generic update function
    const updateResult = await updateRecord(
      tables.campaigns,
      updateData,
      whereCondition
    );

    console.log("Update Result:", updateResult);

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Campaign updated successfully",
      })
    );
  } catch (error) {
    console.error("Error in updateCampaignDetails controller:", error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500)
    );
  }
};

const userBifurcationCount = async (req, res, next) => {
  try {
    // 🔹 Overall lead vs OC distribution
    const overallDistributionQueries = [
      {
        selectField: ["COUNT(*) AS count", "'lead' as type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
        ],
      },
      {
        selectField: ["COUNT(*) AS count", "'oc' as type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          {
            orConditions: [
              {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.mentor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
        ],
      },
    ];
    // 🔹 Indian vs Abroad distribution
    const locationQueries = [
      {
        selectField: ["COUNT(*) AS count", "'lead_indian' as type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "cd.phone_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          { field: "cd.country_id", operator: "=", value: 101 },
        ],
      },
      {
        selectField: ["COUNT(*) AS count", "'oc_indian' as type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          {
            orConditions: [
              {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.mentor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "cd.phone_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          { field: "cd.country_id", operator: "=", value: 101 },
        ],
      },
      {
        selectField: ["COUNT(*) AS count", "'lead_abroad' as type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "cd.phone_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "(cd.country_id != 101 OR cd.country_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: ["COUNT(*) AS count", "'oc_abroad' as type"],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          {
            orConditions: [
              {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.mentor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "cd.phone_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "(cd.country_id != 101 OR cd.country_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ];

    // 🔹 Stage Distribution
    const stages = [
      {
        condition: {
          field: "(cd.stage IS NULL OR cd.stage = 0)",
          operator: "",
          value: "",
          raw: true,
        },
        name: "0",
      },
      { condition: { field: "cd.stage", operator: "=", value: 1 }, name: "1" },
      { condition: { field: "cd.stage", operator: "=", value: 2 }, name: "2" },
      { condition: { field: "cd.stage", operator: "=", value: 3 }, name: "3" },
      { condition: { field: "cd.stage", operator: "=", value: 4 }, name: "4" },
    ];
    const userCategories = [
      {
        id: "0",
        label: "Lead",
        baseConditions: [
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
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
        id: "1",
        label: "OC",
        baseConditions: [
          { field: "cd.user_type", operator: "=", value: "1" },
          {
            orConditions: [
              {
                field: "cd.mentor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.mentor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
        ],
      },
    ];

    const stageQueries = [];
    userCategories.forEach((category) => {
      stages.forEach((stage) => {
        stageQueries.push({
          selectField: [
            "COUNT(*) AS count",
            `'${category.label}_stage_${stage.name}' as type`,
          ],
          table: `${tables.userDetails} cd`,
          condition: [
            stage.condition,
            { field: "cd.phone_code", operator: "!=", value: "" },
            ...category.baseConditions,
          ],
        });
      });
    });

    // 🔹 Gender Distribution
    const genders = [
      { id: "1", label: "Male" },
      { id: "2", label: "Female" },
      { id: "0", label: "No_Gender" },
    ];

    const genderQueries = [];
    genders.forEach((gender) => {
      userCategories.forEach((category) => {
        genderQueries.push({
          selectField: [
            "COUNT(*) AS count",
            `'${category.label}_gender_${gender.label}' as type`,
          ],
          table: `${tables.userDetails} cd`,
          condition: [
            { field: "cd.gender", operator: "=", value: gender.id },
            { field: "cd.phone_code", operator: "!=", value: "" },
            ...category.baseConditions,
          ],
        });
      });
    });

    // 🔹 Age Group Distribution
    const ageGroups = [
      {
        label: "no_age_group",
        conditions: [
          {
            orConditions: [
              {
                field: "cd.birth_date",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
              { field: "cd.birth_date", operator: "=", value: "0000-00-00" },
            ],
          },
        ],
      },
      {
        label: "below_20",
        conditions: [
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: "<=",
            value: 20,
          },
        ],
      },
      {
        label: "21_to_30",
        conditions: [
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: ">=",
            value: 21,
          },
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: "<",
            value: 31,
          },
        ],
      },
      {
        label: "31_to_40",
        conditions: [
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: ">=",
            value: 31,
          },
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: "<",
            value: 41,
          },
        ],
      },
      {
        label: "41_to_50",
        conditions: [
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: ">=",
            value: 41,
          },
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: "<",
            value: 51,
          },
        ],
      },
      {
        label: "above_50",
        conditions: [
          {
            field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
            operator: ">=",
            value: 51,
          },
        ],
      },
    ];

    const ageGroupQueries = [];
    userCategories.forEach((category) => {
      ageGroups.forEach((group) => {
        ageGroupQueries.push({
          selectField: [
            "COUNT(*) AS count",
            `'${category.label}_age_group_${group.label}' as type`,
          ],
          table: `${tables.userDetails} cd`,
          condition: [
            { field: "cd.phone_code", operator: "!=", value: "" },
            ...category.baseConditions,
            ...group.conditions,
          ],
        });
      });
    });
    const [
      stageDistribution,
      genderDistribution,
      ageGroupDistribution,
      locationDistribution,
      overallDistribution,
    ] = await Promise.all([
      readRecordUnion(stageQueries),
      readRecordUnion(genderQueries),
      readRecordUnion(ageGroupQueries),
      readRecordUnion(locationQueries),
      readRecordUnion(overallDistributionQueries),
    ]);
    // 🔹 Final Response
    const formatNested = (data, patterns) => {
      const formatted = { lead: {}, oc: {} };
      data.forEach((item) => {
        const key = item.type.toLowerCase(); // e.g. "lead_stage_1"
        for (const pattern of patterns) {
          if (key.startsWith(`lead_${pattern}`)) {
            formatted.lead[key.replace(`lead_`, "")] = item.count;
          }
          if (key.startsWith(`oc_${pattern}`)) {
            formatted.oc[key.replace(`oc_`, "")] = item.count;
          }
        }
      });
      return formatted;
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User bifurcation count fetched successfully",
      data: {
        overall_distribution: overallDistribution.reduce((acc, curr) => {
          acc[curr.type] = curr.count;
          return acc;
        }, {}),
        location_distribution: formatNested(locationDistribution, [
          "indian",
          "abroad",
        ]),
        stage_distribution: formatNested(stageDistribution, [
          "stage_0",
          "stage_1",
          "stage_2",
          "stage_3",
          "stage_4",
        ]),
        gender_distribution: formatNested(genderDistribution, [
          "gender_male",
          "gender_female",
          "gender_no_gender",
        ]),
        age_group_distribution: formatNested(ageGroupDistribution, [
          "age_group_no_age_group",
          "age_group_below_20",
          "age_group_21_to_30",
          "age_group_31_to_40",
          "age_group_41_to_50",
          "age_group_above_50",
        ]),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in userBifurcationCount controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const campaignOverview = async (req, res, next) => {
  try {
    const { filter = "" } = req.body;
    const sourceFilter = [];
    if (filter) {
      if (filter.startsWith("meta")) {
        sourceFilter.push(51, 57, 58, 62);
      } else {
        sourceFilter.push(49, 50);
      }
    }
    const { results } = await readRecord({
      table: `${tables.campaigns} c`,
      selectFields: [
        "COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS active_count",
        "COUNT(CASE WHEN c.status = 'inactive' THEN 1 END) AS inactive_count",
        "COUNT(*) AS total_count",
        "COALESCE(CAST(SUM(c.ad_spend) AS DOUBLE), 0) AS total_ad_spend",
        "COALESCE(SUM(JSON_EXTRACT(c.digital_marketing, '$.impressions')), 0) AS total_impressions",
        "COALESCE(SUM(JSON_EXTRACT(c.digital_marketing, '$.reach')), 0) AS total_reach",
        "COALESCE(SUM(JSON_EXTRACT(c.digital_marketing, '$.ctr')), 0) AS total_ctr",
      ],
      conditions: [
        ...(filter
          ? [
              {
                field: "c.type",
                operator: "IN",
                value: sourceFilter,
              },
            ]
          : []),
      ],
    });
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'all_clients' as type",
        ],
        table: `${tables.campaigns} c`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "c.type = cd.primary_lead_source",
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          ...(filter
            ? [
                {
                  field: "c.type",
                  operator: "IN",
                  value: sourceFilter,
                },
              ]
            : []),
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'all_leads' as type",
        ],
        table: `${tables.campaigns} c`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "c.type = cd.primary_lead_source",
          },
        ],
        condition: [
          ...(filter
            ? [
                {
                  field: "c.type",
                  operator: "IN",
                  value: sourceFilter,
                },
              ]
            : []),
        ],
      },
      {
        selectField: [
          "COALESCE(CAST(SUM(od.order_paid_amount ) AS DOUBLE), 0) as count",
          "'revenue' as type",
        ],
        table: `${tables.campaigns} c`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "c.type = cd.primary_lead_source",
          },
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
        ],
        condition: [
          { field: "cd.user_type", operator: "=", value: "1" },
          ...(filter
            ? [
                {
                  field: "c.type",
                  operator: "IN",
                  value: sourceFilter,
                },
              ]
            : []),
        ],
      },
    ]);
    console.log(data, "data");
    console.log(results[0].total_ad_spend / data[0].count, 1371);
    results[0]["total_cac"] =
      results[0].total_ad_spend / data[0].count == Infinity
        ? 0
        : parseFloat((results[0].total_ad_spend / data[0].count).toFixed(2)) ||
          0;
    results[0]["leads_generated"] = data[1].count || 0;
    results[0]["revenue_generated"] = data[2].count || 0;
    results[0]["cpl"] =
      results[0].total_ad_spend / results[0].leads_generated == Infinity
        ? 0
        : parseFloat(
            (results[0].total_ad_spend / results[0].leads_generated).toFixed(2)
          ) || 0;
    results[0]["total_conversion"] = data[0].count || 0;
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Campaign overview fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in campaignOverview controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const websitePerformance = async (req, res, next) => {
  try {
    const { todayData, monthToDate } = await getAnalytics();
    const { results: leadsGenerated } = await readRecord({
      selectFields: [
        "COUNT(CASE WHEN DATE(cd.added_date) = CURDATE() THEN 1 END) AS today_website_leads",
        "COUNT(CASE WHEN MONTH(cd.added_date) = MONTH(CURDATE()) AND YEAR(cd.added_date) = YEAR(CURDATE()) THEN 1 END) AS month_to_date_website_leads",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions: [{ field: "ls.source_group", operator: "=", value: 2 }],
    });
    const { results: convertedLeads } = await readRecord({
      selectFields: [
        `COUNT(DISTINCT CASE 
      WHEN od.order_date >= CURDATE() 
        AND od.order_date < CURDATE() + INTERVAL 1 DAY 
      THEN od.user_id  
  END) AS today_converted_leads`,
        "COUNT(DISTINCT od.user_id) AS month_to_date_converted_leads",
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
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions: [
        { field: "ls.source_group", operator: "=", value: 2 },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    console.log(todayData.avgSessionDuration, 1418);
    console.log(
      moment.duration(todayData.avgSessionDuration, "seconds").minutes(),
      1419
    );
    function formatSecondsToTime(seconds) {
      const duration = moment.duration(seconds, "seconds");
      const minutes = String(duration.minutes()).padStart(2, "0");
      const secs = String(duration.seconds()).padStart(2, "0");
      const millis = String(Math.floor(duration.milliseconds() / 10)).padStart(
        2,
        "0"
      ); // hundredths of a second

      return `${minutes}:${secs}:${millis}`;
    }
    const finalData = {
      active_users: `${fixedDecimal(
        todayData.activeUsers,
        2,
        0
      )} | ${fixedDecimal(monthToDate.activeUsers, 2, 0)}`,
      new_users: `${fixedDecimal(todayData.newUsers, 2, 0)} | ${fixedDecimal(
        monthToDate.newUsers,
        2,
        0
      )}`,
      avg_session_duration: `${formatSecondsToTime(
        todayData.avgSessionDuration
      )} | ${formatSecondsToTime(monthToDate.avgSessionDuration)}`,
      bounce_rate: `${fixedDecimal(
        todayData.bounceRate,
        2,
        0
      )}% | ${fixedDecimal(monthToDate.bounceRate, 2, 0)}%`,
      leads_from_website: `${leadsGenerated[0]?.today_website_leads || 0} | ${
        leadsGenerated[0]?.month_to_date_website_leads || 0
      }`,
      impressions: `${fixedDecimal(
        todayData.impressions,
        2,
        0
      )} | ${fixedDecimal(monthToDate.impressions, 2, 0)}`,
      lead_conversion: `${convertedLeads[0]?.today_converted_leads || 0} | ${
        convertedLeads[0]?.month_to_date_converted_leads || 0
      }`,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Website performance fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in websitePerformance controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const counsellorCampaignPerformance = async (req, res, next) => {
  try {
    const { filter = "mtd" } = req.body;
    const condition = [{ field: "s.source_group", operator: "=", value: 6 }];
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
      message: "Counsellor Campaign Performance Data Fetched Successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in counsellorCampaignPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const createAdPerformanceReport = async (req, res, next) => {
  try {
    const {
      reporting_start,
      reporting_end,
      ad_name,
      status,
      funnel,
      objective,
      results,
      sales,
      revenue,
      cpa,
      aov,
      reach,
      frequency,
      cost_per_result,
      amount_spent,
      impressions,
      cpm,
      link_clicks,
      cpc,
      ctr,
    } = req.body;
    const columns = [
      "reporting_start",
      "reporting_end",
      "ad_name",
      "status",
      "funnel",
      "objective",
      "results",
      "sales",
      "revenue",
      "cpa",
      "aov",
      "reach",
      "frequency",
      "cost_per_result",
      "amount_spent",
      "impressions",
      "cpm",
      "link_clicks",
      "cpc",
      "ctr",
    ];
    const values = [
      reporting_start,
      reporting_end,
      ad_name,
      status,
      funnel,
      objective,
      results,
      sales,
      revenue,
      cpa,
      aov,
      reach,
      frequency,
      cost_per_result,
      amount_spent,
      impressions,
      cpm,
      link_clicks,
      cpc,
      ctr,
    ];
    const insertResult = await insertRecord(
      tables.adPerformanceReports,
      columns,
      values
    );
    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add Ad Performance Report", 500));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Ad Performance Report added successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in addAdPerformanceReport controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateAdPerformanceReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updateResult = await updateRecord(
      tables.adPerformanceReports,
      updateData,
      { id }
    );
    if (updateResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to update Ad Performance Report", 500)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Ad Performance Report updated successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in updateAdPerformanceReport controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const uploadAdPerformanceReport = async (req, res, next) => {
  try {
    const file = req.file;

    if (!file) {
      return next(new ErrorHandler("No file uploaded", 400));
    }

    // Allowed extensions
    const allowedExtensions = [".xlsx", ".xls", ".xlsm", ".csv"];

    // Allowed MIME types
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "application/vnd.ms-excel.sheet.macroEnabled.12", // xlsm
      "text/csv", // csv
    ];

    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (
      !allowedExtensions.includes(fileExtension) ||
      !allowedMimeTypes.includes(file.mimetype)
    ) {
      return next(
        new ErrorHandler(
          "Invalid file type. Please upload a valid Excel file (.xlsx, .xls, .xlsm, .csv)",
          400
        )
      );
    }

    console.log(file, 1935);

    const workbook = XLSX.read(file.buffer, {
      type: "buffer",
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
    console.log(headers, 1942);
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
    });
    console.log(jsonData);
    const firstRow = jsonData[0];
    const validHeaders = {
      reporting_start: true,
      reporting_end: true,
      ad_name: true,
      funnel: true,
      objective: true,
      results: true,
      sales: true,
      revenue: true,
      cpa: true,
      aov: true,
      reach: true,
      frequency: true,
      cost_per_result: true,
      amount_spent: true,
      impressions: true,
      cpm: true,
      link_clicks: true,
      cpc: true,
      ctr: true,
    };
    for (const key of headers) {
      console.log(key.trim().replace(/\s+/g, "_").toLowerCase());
      if (!validHeaders[key.trim().replace(/\s+/g, "_").toLowerCase()]) {
        return next(new ErrorHandler(`Invalid header found: ${key}`, 400));
      }
    }
    // console.log(jsonData);
    const tasks = [];
    for (const row of jsonData) {
      const rowData = {};
      for (const [key, value] of Object.entries(row)) {
        const formattedKey = key.trim().replace(/\s+/g, "_").toLowerCase();
        if (
          formattedKey === "reporting_start" ||
          formattedKey === "reporting_end"
        ) {
          const match = /^\d{2}[-/]\d{2}[-/]\d{2}$/;

          if (!match.test(value)) {
            return next(
              new ErrorHandler(
                `Invalid date format for ${formattedKey}. Expected format: DD-MM-YYYY OR DD/MM/YYYY`,
                400
              )
            );
          }
          rowData[formattedKey] = moment(value, [
            "DD-MM-YY",
            "DD/MM/YY",
          ]).format("YYYY-MM-DD");
        } else {
          rowData[formattedKey] = value;
        }
      }
      tasks.push(
        await insertRecord(
          tables.adPerformanceReports,
          Object.keys(rowData),
          Object.values(rowData)
        )
      );
    }
    await Promise.all(tasks);
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "File processed successfully",
        data: [],
      })
    );
  } catch (error) {
    console.log("Error in uploadAdPerformanceReportInBulk controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const adPerformanceReport = async (req, res, next) => {
  try {
    const { start_date, end_date, funnel, objective, ad_name } = req.body;
    const conditions = [];
    if (start_date && end_date) {
      conditions.push({
        field: "reporting_start",
        operator: ">=",
        value: start_date,
      });
      conditions.push({
        field: "reporting_end",
        operator: "<=",
        value: end_date,
      });
    }
    if (funnel) {
      conditions.push({
        field: "funnel",
        operator: "=",
        value: funnel,
      });
    }
    if (objective) {
      conditions.push({
        field: "objective",
        operator: "=",
        value: objective,
      });
    }
    if (ad_name) {
      conditions.push({
        field: "ad_name",
        operator: "LIKE",
        value: `%${ad_name}%`,
      });
    }
    const { results, totalCount } = await readRecord({
      table: tables.adPerformanceReports,
      selectFields: ["*"],
      conditions,
      orderBy: ["reporting_start DESC"],
      countTotal: true,
    });
    const { results: funnelResults } = await readRecord({
      table: tables.adPerformanceReports,
      selectFields: ["DISTINCT funnel"],
      conditions: [
        { field: "funnel", operator: "IS NOT", value: "NULL", raw: true },
        { field: "funnel", operator: "!=", value: "" },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Ad Performance Report Data Fetched Successfully",
      data: results,
      totalCount,
      meta_data: {
        funnels: funnelResults.map((item) => item.funnel),
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in adPerformanceReport controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const adPerformanceOverview = async (req, res, next) => {
  try {
    const { start_date, end_date, funnel, objective, ad_name } = req.body;
    const conditions = [];
    if (start_date && end_date) {
      conditions.push({
        field: "reporting_start",
        operator: ">=",
        value: start_date,
      });
      conditions.push({
        field: "reporting_end",
        operator: "<=",
        value: end_date,
      });
    }
    if (funnel) {
      conditions.push({
        field: "funnel",
        operator: "=",
        value: funnel,
      });
    }
    if (objective) {
      conditions.push({
        field: "objective",
        operator: "=",
        value: objective,
      });
    }
    if (ad_name) {
      conditions.push({
        field: "ad_name",
        operator: "LIKE",
        value: `%${ad_name}%`,
      });
    }
    const { results } = await readRecord({
      selectFields: [
        "COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_count",
        "COUNT(CASE WHEN status = 'inactive' THEN 1 END) AS inactive_count",
        "COUNT(*) AS total_count",
        "COALESCE(CAST(SUM(amount_spent) AS DOUBLE), 0) AS total_amount_spent",
        "COALESCE(SUM(impressions), 0) AS total_impressions",
        "COALESCE(SUM(reach), 0) AS total_reach",
        "COALESCE(SUM(ctr), 0) AS total_ctr",
      ],
      table: `${tables.adPerformanceReports} apr`,
      conditions,
    });
    const { results: funnelResults } = await readRecord({
      table: tables.adPerformanceReports,
      selectFields: ["DISTINCT funnel"],
      conditions: [
        { field: "funnel", operator: "IS NOT", value: "NULL", raw: true },
        { field: "funnel", operator: "!=", value: "" },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Ad Performance Overview fetched successfully",
      data: results,
      meta_data: {
        funnels: funnelResults.map((item) => item.funnel),
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in adPerformanceOverview controller:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  adPerformanceReport,
  adPerformanceOverview,
  createAdPerformanceReport,
  clinicalConditionsWiseLeads,
  campaignOverview,
  overAllLeadGenderWise,
  leadMISForRetargeting,
  addCampaign,
  getDetailsOfCampaigns,
  getCampaigsDetailsById,
  updateCampaignDetails,
  userBifurcationCount,
  websitePerformance,
  counsellorCampaignPerformance,
  uploadAdPerformanceReport,
  updateAdPerformanceReport,
};
