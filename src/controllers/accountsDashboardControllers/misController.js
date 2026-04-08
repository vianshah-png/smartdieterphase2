import moment from "moment";
import ExcelJS from "exceljs";
import { readRecord } from "../../config/query.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { generateDailyReport1 } from "../../utils/GoogleSheetUtils.js";
import { tables, appVersions } from "../../helper/constant.js";
import { readRecordNewForLead } from "../../helper/common.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import userNotification from "../../models/userNotificationModel.js";

const getAllUsersCountries = async (req, res, next) => {
  const { page, limit, search, id } = req.query;
  try {
    // Fetch countries that have at least one user in the users_details table
    const { results: allCountries, totalCount } = await readRecord({
      table: tables.countries,
      selectFields: [
        "countries.country_name",
        "countries.country_id",
        "countries.phonecode",
        "countries.flag",
        "countries.zone_name",
      ],
      pagination: { limit, page },
      search: { searchQuery: search },
      joins: [
        {
          type: "INNER", // Join with users_details table to check for country existence
          table: tables.userDetails,
          on: "countries.country_id = users_details.country_id",
        },
      ],
      conditions: [
        { field: "users_details.country_id", operator: "!=", value: "0" },
        ...(id
          ? [{ field: "users_details.country_id", operator: "=", value: id }]
          : []),
      ],
      groupBy: ["countries.country_id"],
      countTotal: true,
    });

    if (!allCountries)
      return next(new ErrorHandler("Error while fetching countries"));

    if (allCountries.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No countries found with users.",
        data: [],
      });

      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Countries fetched successfully",
      data: allCountries,
      totalCount,
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProgramByStack = async (req, res, next) => {
  let { stack } = req.body;

  try {
    // If no stack is provided or it's empty, use default stack values
    if (!Array.isArray(stack) || stack.length === 0) {
      stack = [
        "Special Stack",
        "Basic Stack",
        "Premium Stack",
        "Platinum Stack",
        "Privy Stack",
        "Pregnancy",
      ];
    }

    const { results: existingProgram } = await readRecord({
      table: tables.all_programs_grouped,
      selectFields: ["program_ids", "program_name"],
      conditions: [{ field: "program_stack", operator: "IN", value: stack }],
      orderBy: ["id asc"], // Optional: reintroduce ordering if needed
    });

    // Programs that should be moved to the end
    const lastPrograms = [
      "Weaning (4 - 6 Months)",
      "Weaning (7 - 9 Months)",
      "Weaning (10 - 14 Months)",
      "Nourish",
      "Satvaa",
      "Sphoorti",
      "POSHAN",
    ];

    // Split programs into two arrays: first, and last
    const firstPrograms = existingProgram.filter(
      (program) => !lastPrograms.includes(program.program_name)
    );
    const lastProgramsList = existingProgram.filter((program) =>
      lastPrograms.includes(program.program_name)
    );

    // Concatenate first programs with last programs at the end
    const sortedPrograms = [...firstPrograms, ...lastProgramsList];

    if (sortedPrograms.length === 0) {
      return res.status(200).json({
        statusCode: 200,
        message: "No programs found for the given stack(s).",
        data: [],
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Data fetched successfully",
      data: sortedPrograms,
    });
  } catch (error) {
    console.error("Error in getProgramByStack:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCountryOnregion = async (req, res, next) => {
  let { region_id } = req.query;

  try {
    // Parse region_id if it's a JSON array string
    if (typeof region_id === "string") {
      try {
        region_id = JSON.parse(region_id);
      } catch (err) {
        // If parsing fails, fallback to array with single item
        region_id = [region_id];
      }
    }

    if (!Array.isArray(region_id)) {
      // Make sure it's an array
      region_id = [region_id];
    }

    // Now use region_id array in your query
    const { results: existingCountryId } = await readRecord({
      table: tables.regionsMembers,
      selectFields: ["country_id"],
      conditions: [{ field: "region_id", operator: "IN", value: region_id }],
    });

    const countryIds = existingCountryId.map((row) => row.country_id);

    if (countryIds.length === 0) {
      return res.status(200).json({
        statusCode: 200,
        message: "No country found for the given region(s)",
        data: [],
      });
    }

    const { results: existingCountries } = await readRecord({
      table: tables.countries,
      selectFields: ["countries.country_id", "countries.country_name"],
      conditions: [
        { field: "countries.country_id", operator: "IN", value: countryIds },
      ],
      joins: [
        {
          type: "INNER", // Join with users_details table to check for country existence
          table: tables.userDetails,
          on: "countries.country_id = users_details.country_id",
        },
      ],
      groupBy: ["countries.country_id"],
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Data fetched successfully",
      data: existingCountries,
    });
  } catch (error) {
    console.error("Error in getCountryOnregion:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
// --- Filtered Data ---
const getFilteredData = async (req, res, next) => {
  const {
    countries,
    states,
    cities,
    regions,
    user_status,
    app_versions,
    age_range,
    gender,
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    time_range,
    payment_mode,
    orderBy = ["ud.user_id DESC"], // Default sorting
    exportData, // Flag for export
    mailSheet, // for mail export
    email_id = "vikram.gupta@balancenutrition.in", // mail to export
  } = req.body;

  try {
    // --- 0) LATEST ORDER per user (prevents row inflation & random program fields) ---
    // Uses MAX(order_date) per user; returns the latest order + program/session fields.
    const LATEST_ORDER = `
      (
        SELECT
          sop.user_id,
          so.order_id,
          so.order_date,
          so.sale_by,
          sop.program_id,
          sop.program_session_id,
          sop.paid_amount,
          sop.start_date,
          sop.expiry_date,
          sop.order_type,
          so.payment_mode
        FROM sub_orders_programs sop
        INNER JOIN order_details so ON so.order_id = sop.order_id
        INNER JOIN (
          SELECT
            sop2.user_id,
            MAX(so2.order_date) AS max_order_date
          FROM sub_orders_programs sop2
          INNER JOIN order_details so2 ON so2.order_id = sop2.order_id
          GROUP BY sop2.user_id
        ) m ON m.user_id = sop.user_id AND so.order_date = m.max_order_date
      ) lo
    `;

    // --- 1) JOINS (users base -> latest order -> dims) ---
    const joins = [
      { type: "LEFT", table: LATEST_ORDER, on: "ud.user_id = lo.user_id" },
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "lo.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: "program_session ps",
        on: "lo.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
      {
        type: "LEFT",
        table: "admin_users au",
        on: "ud.mentor_assigned = au.admin_user_id",
      },
      {
        type: "LEFT",
        table: "admin_users sale_by",
        on: "lo.sale_by = sale_by.admin_user_id",
      },
    ];

    if (Array.isArray(regions) && regions.length > 0) {
      joins.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
    }

    // --- 2) FILTERS (apply to correct aliases) ---
    const conditions = [{ field: "1", operator: "=", value: "1", raw: true }];

    if (Array.isArray(countries) && countries.length > 0)
      conditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });

    if (Array.isArray(states) && states.length > 0)
      conditions.push({ field: "s.state_id", operator: "IN", value: states });

    if (Array.isArray(cities) && cities.length > 0)
      conditions.push({ field: "ci.city_id", operator: "IN", value: cities });

    if (Array.isArray(regions) && regions.length > 0)
      conditions.push({ field: "c.region_id", operator: "IN", value: regions });

    if (Array.isArray(user_status) && user_status.length > 0) {
      conditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: user_status,
      });
    } else {
      conditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (payment_mode && payment_mode.length > 0) {
      conditions.push({
        field: "lo.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        conditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        conditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge, 10);
      const maxYear = (currentYear = currentYear - parseInt(minAge, 10));
      conditions.push({
        field: "DATE(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (Array.isArray(gender) && gender.length > 0)
      conditions.push({ field: "ud.gender", operator: "IN", value: gender });

    if (Array.isArray(program_stack) && program_stack.length > 0) {
      conditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: program_stack,
      });
    } else {
      conditions.push({
        field:
          "(pm.program_category != 'Service' OR pm.program_category IS NULL )",
        operator: "",
        value: "",
        raw: true,
      });
    }

    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      conditions.push({
        field: "DATE(lo.order_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    // IMPORTANT: program/order filters should hit the latest order (lo.*)
    if (Array.isArray(program_id) && program_id.length > 0)
      conditions.push({
        field: "lo.program_id",
        operator: "IN",
        value: program_id,
      });

    if (Array.isArray(sub_user_status) && sub_user_status.length > 0)
      conditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });

    if (Array.isArray(order_type) && order_type.length > 0)
      conditions.push({
        field: "lo.order_type",
        operator: "IN",
        value: order_type,
      });

    if (Array.isArray(sub_order_type) && sub_order_type.length > 0)
      conditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });

    // --- 3) SELECT FIELDS (one row per user) ---
    const selectFields = [
      "ud.user_id AS user_id",
      "ud.first_name AS Name",
      "ud.email_id AS email_id",
      "ud.phone_code AS CountryCode",
      "ud.phone_number AS Phone",
      `CASE ud.gender
           WHEN '1' THEN 'Male'
           WHEN '2' THEN 'Female'
           WHEN '0' THEN 'Other'
           ELSE 'NA'
         END AS gender`,
      "ud.birth_date AS DOB",
      "(SELECT cid.country_name FROM countries cid WHERE cid.country_id = ud.country_id) as country_name",
      "(SELECT sid.state_name FROM states sid WHERE sid.state_id = ud.state_id) as state_name",
      "(SELECT cid.city_name FROM cities cid WHERE cid.city_id = ud.city_id) as city_name",
      "(SELECT source_name FROM `lead_source` WHERE `source_id` = ud.current_lead_source) AS current_lead_source",
      "(SELECT source_name FROM `lead_source` WHERE `source_id` = ud.primary_lead_source) AS primary_lead_source",
      "ud.my_wallet",
      "ud.sub_user_status AS user_status",
      "au.crm_user AS mentor",
      "sale_by.crm_user AS sale_by_name",
      "pm.program_name AS program_name",
      "ps.program_duration AS program_session",
      "ps.mrp AS program_mrp",
      "lo.paid_amount AS program_amount",
      "lo.order_date AS order_date",
      "lo.start_date AS start_date",
      "lo.expiry_date AS exp_date",
    ];

    // --- 4) RUN (no GROUP BY needed; 1:1 after latest-order join) ---
    const { results: rows } = await readRecord({
      table: "users_details ud",
      selectFields,
      joins,
      conditions,
      orderBy,
    });

    // --- 5) Export to Excel (optional) ---
    if (exportData === "true") {
      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("MIS Data");

      worksheet.columns = [
        { header: "ID", key: "user_id" },
        { header: "Name", key: "Name" },
        { header: "Email", key: "email_id" },
        { header: "Gender", key: "gender" },
        { header: "DOB", key: "DOB" },
        { header: "Country Code", key: "CountryCode" },
        { header: "Phone", key: "Phone" },
        { header: "Country", key: "country_name" },
        { header: "State", key: "state_name" },
        { header: "City", key: "city_name" },
        { header: "Primary Lead Source", key: "primary_lead_source" },
        { header: "Current Lead Source", key: "current_lead_source" },
        { header: "My Wallet", key: "my_wallet" },
        { header: "User Status", key: "user_status" },
        { header: "Program Name", key: "program_name" },
        { header: "Program Session", key: "program_session" },
        { header: "Program MRP", key: "program_mrp" },
        { header: "Program Amount", key: "program_amount" },
        { header: "Order Date", key: "order_date" },
        { header: "Start Date", key: "start_date" },
        { header: "Expiration Date", key: "exp_date" },
        { header: "Mentor", key: "mentor" },
        { header: "Sale By", key: "sale_by_name" },
      ];

      rows.forEach((r) => worksheet.addRow(r));
      worksheet.getRow(1).font = { bold: true };

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=BN_Mis_Data_${Date.now()}.xlsx`
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }

    // --- 6) Optional mail export ---
    let sheetUrl = "";
    if (mailSheet === "true") {
      sheetUrl = await generateDailyReport1({
        data: rows,
        senderEmail: email_id,
        sheetName: `BN_Mis_Data_${Date.now()}`,
      });
    }

    // --- 7) JSON ---
    return res.status(200).json({
      message: "Filtered data fetched successfully",
      // data: rows, // uncomment if you also want to return the rows
      sheetUrl,
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// --- Get Executive Summary ---
const getExecutiveSummary = async (req, res, next) => {
  const {
    countries,
    states,
    cities,
    regions,
    user_status,
    app_versions,
    age_range,
    gender,
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    payment_mode,
    time_range,
    export: exportData,
  } = req.body;

  try {
    // ---------- 0) DEDUPED ORDER BASE ----------
    // One row per sub_order_id, linked to order details (amount/date)
    const ORDERS_BASE = `
      (
        SELECT DISTINCT
          sop.sub_order_id,
          sop.user_id,
          sop.program_id,
          sop.order_type,
          DATE(sop.expiry_date) AS expiry_date,       -- kept in case you extend later
          so.order_id,
          (sop.paid_amount + sop.balance_amount) as order_paid_amount,
          DATE(so.order_date) AS order_date,
          so.payment_mode
        FROM sub_orders_programs sop
        INNER JOIN order_details so ON so.order_id = sop.order_id
      ) ob
    `;

    // ---------- 1) JOINS ----------
    // Use orders base as the fact table, then attach users & dimensions
    const baseJoins = [
      { type: "INNER", table: ORDERS_BASE, on: "ud.user_id = ob.user_id" },
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "ob.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
    ];

    if (Array.isArray(regions) && regions.length > 0) {
      baseJoins.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
    }

    // ---------- 2) FILTERS ----------
    const baseConditions = [
      { field: "1", operator: "=", value: "1", raw: true },
    ];

    if (Array.isArray(countries) && countries.length > 0)
      baseConditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });

    if (Array.isArray(states) && states.length > 0)
      baseConditions.push({
        field: "s.state_id",
        operator: "IN",
        value: states,
      });

    if (Array.isArray(cities) && cities.length > 0)
      baseConditions.push({
        field: "ci.city_id",
        operator: "IN",
        value: cities,
      });

    if (Array.isArray(regions) && regions.length > 0)
      baseConditions.push({
        field: "c.region_id",
        operator: "IN",
        value: regions,
      });
    if (payment_mode && payment_mode.length > 0) {
      baseConditions.push({
        field: "ob.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }
    if (Array.isArray(user_status) && user_status.length > 0) {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: user_status,
      });
    } else {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge, 10);
      const maxYear = currentYear - parseInt(minAge, 10);
      baseConditions.push({
        field: "DATE(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (Array.isArray(gender) && gender.length > 0)
      baseConditions.push({
        field: "ud.gender",
        operator: "IN",
        value: gender,
      });

    if (Array.isArray(program_stack) && program_stack.length > 0) {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: program_stack,
      });
    } else {
      baseConditions.push({
        field:
          "(pm.program_category != 'Service' OR pm.program_category IS NULL )",
        operator: "",
        value: "",
        raw: true,
      });
    }

    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      baseConditions.push({
        field: "date(ob.order_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (Array.isArray(program_id) && program_id.length > 0)
      baseConditions.push({
        field: "ob.program_id",
        operator: "IN",
        value: program_id,
      });

    if (Array.isArray(sub_user_status) && sub_user_status.length > 0)
      baseConditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });

    if (Array.isArray(order_type) && order_type.length > 0)
      baseConditions.push({
        field: "ob.order_type",
        operator: "IN",
        value: order_type,
      });

    if (Array.isArray(sub_order_type) && sub_order_type.length > 0)
      baseConditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });

    // ---------- 3) QUERIES (built on the same deduped cohort) ----------

    // 3.1 Total clients (distinct users in the filtered cohort)
    const clientCountResult = await readRecord({
      table: "users_details ud",
      selectFields: ["COUNT(DISTINCT ud.user_id) AS total_clients"],
      joins: baseJoins,
      conditions: baseConditions,
    });
    const totalClients = Number(
      clientCountResult.results?.[0]?.total_clients || 0
    );

    // 3.2 Gender counts (same cohort)
    const genderCountResult = await readRecord({
      table: "users_details ud",
      selectFields: [
        "COUNT(DISTINCT CASE WHEN ud.gender = '1' THEN ud.user_id END) AS male_count",
        "COUNT(DISTINCT CASE WHEN ud.gender IN ('0','2','') THEN ud.user_id END) AS female_count",
      ],
      joins: baseJoins,
      conditions: baseConditions,
    });
    const maleCount = Number(genderCountResult.results?.[0]?.male_count || 0);
    const femaleCount = Number(
      genderCountResult.results?.[0]?.female_count || 0
    );

    // 3.3 Total revenue (sum over deduped orders)
    const revenueResult = await readRecord({
      table: "users_details ud",
      selectFields: ["SUM(ob.order_paid_amount) AS total_revenue"],
      joins: baseJoins, // ob already joined here
      conditions: baseConditions,
    });
    const totalRevenue = Number(revenueResult.results?.[0]?.total_revenue || 0);

    // ---------- 4) Percentages + payload ----------
    const malePercentage =
      totalClients > 0 ? ((maleCount / totalClients) * 100).toFixed(0) : "0";
    const femalePercentage =
      totalClients > 0 ? ((femaleCount / totalClients) * 100).toFixed(0) : "0";

    const executiveSummary = {
      summary: {
        totalClients,
        maleClients: `${maleCount} (${malePercentage}%)`,
        femaleClients: `${femaleCount} (${femalePercentage}%)`,
        totalRevenue,
      },
    };

    // ---------- 5) Export (optional) ----------
    if (exportData === "true") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Executive Summary");

      worksheet.columns = [
        { header: "Total Clients", key: "totalClients" },
        { header: "Male Clients", key: "maleClients" },
        { header: "Female Clients", key: "femaleClients" },
        { header: "Total Revenue", key: "totalRevenue" },
      ];

      worksheet.addRow({
        totalClients,
        maleClients: `${maleCount} (${malePercentage}%)`,
        femaleClients: `${femaleCount} (${femalePercentage}%)`,
        totalRevenue,
      });

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=executive_summary.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ---------- 6) JSON ----------
    return res.status(200).json(
      new ApiResponse({
        message: "Executive summary data fetched successfully with all filters",
        data: executiveSummary,
      })
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// --- Geography Counts API ---
const getGeographyCounts = async (req, res, next) => {
  const {
    countries,
    states,
    cities,
    regions, // New filter for regions
    user_status,
    app_versions,
    age_range,
    gender,
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    time_range,
    payment_mode,
    export: exportData, // Added export flag
  } = req.body;

  try {
    // 1. Initialize joins and conditions
    let allJoins = [
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      {
        type: "LEFT",
        table: "sub_orders_programs sop",
        on: "ud.user_id = sop.user_id",
      },
      {
        type: "INNER",
        table: "order_details ob",
        on: "sop.order_id = ob.order_id",
      },
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "sop.program_id = pm.program_id",
      },
    ];

    const baseConditions = [
      { field: "1", operator: "=", value: "1", raw: true },
    ];

    // 2. Conditionally add region-related joins and conditions
    if (regions && regions.length > 0) {
      allJoins.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
      baseConditions.push({
        field: "c.region_id",
        operator: "IN",
        value: regions,
      });
    }

    // 3. Apply all other filters
    if (countries && countries.length > 0) {
      baseConditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });
    }

    if (payment_mode && payment_mode.length > 0) {
      baseConditions.push({
        field: "ob.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }

    if (states && states.length > 0) {
      baseConditions.push({
        field: "s.state_id",
        operator: "IN",
        value: states,
      });
    }

    if (cities && cities.length > 0) {
      baseConditions.push({
        field: "ci.city_id",
        operator: "IN",
        value: cities,
      });
    }

    if (user_status && user_status.length > 0) {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: Array.isArray(user_status) ? user_status : [user_status],
      });
    } else {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge);
      const maxYear = currentYear - parseInt(minAge);
      baseConditions.push({
        field: "Date(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (gender && gender.length > 0) {
      baseConditions.push({
        field: "ud.gender",
        operator: "IN",
        value: Array.isArray(gender) ? gender : [gender],
      });
    }

    if (program_stack && program_stack.length > 0) {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: Array.isArray(program_stack) ? program_stack : [program_stack],
      });
    } else {
      // Default stacks if program_stack is not provided or is empty
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: [
          "Special Stack",
          "Basic Stack",
          "Premium Stack",
          "Platinum Stack",
          "Privy Stack",
          "Pregnancy",
        ],
      });
    }

    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      baseConditions.push({
        field: "DATE(sop.created_at)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (Array.isArray(program_id) && program_id.length > 0) {
      baseConditions.push({
        field: "sop.program_id",
        operator: "IN",
        value: program_id,
      });
    }
    if (Array.isArray(sub_user_status) && sub_user_status.length > 0) {
      baseConditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });
    }
    if (Array.isArray(order_type) && order_type.length > 0) {
      baseConditions.push({
        field: "sop.order_type",
        operator: "IN",
        value: order_type,
      });
    }
    if (Array.isArray(sub_order_type) && sub_order_type.length > 0) {
      baseConditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });
    }

    // 4. Define the queries with the dynamic joins and conditions
    const genderQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        `CASE ud.gender
           WHEN '1' THEN 'Male'
           ELSE 'Female'
         END AS gender`,
        "COUNT(DISTINCT ud.user_id) AS user_count",
      ],
      conditions: baseConditions,
      joins: allJoins,
      groupBy: ["gender"],
    });

    const ageGroupQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        `CASE WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 0 AND 17 THEN '0-17'
          WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 18 AND 25 THEN '18-25'
          WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 26 AND 35 THEN '26-35'
          WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 36 AND 45 THEN '36-45'
          WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 46 AND 55 THEN '46-55'
          ELSE '56+' END AS age_group`,
        "COUNT(DISTINCT ud.user_id) AS user_count",
      ],
      conditions: baseConditions,
      joins: allJoins,
      groupBy: ["age_group"],
    });

    const programStackQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        "pm.program_category",
        "COUNT(DISTINCT ud.user_id) AS user_count",
      ],
      conditions: baseConditions,
      joins: allJoins,
      groupBy: ["pm.program_category"],
    });

    const [genderResults, ageGroupResults, programStackResults] =
      await Promise.all([genderQuery, ageGroupQuery, programStackQuery]);

    const dashboardData = {
      genderDistribution: genderResults.results,
      ageGroupDistribution: ageGroupResults.results,
      programStackDistribution: programStackResults.results,
    };

    // Export to Excel if exportData is true
    if (exportData === "true") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Geography Data");

      // Set column headers for Excel file
      worksheet.columns = [
        { header: "Gender", key: "gender" },
        { header: "User Count", key: "user_count" },
        { header: "Age Group", key: "age_group" },
        { header: "Program Category", key: "program_category" },
        { header: "User Count", key: "user_count" },
      ];

      // Add rows to Excel sheet
      genderResults.results.forEach((row) => worksheet.addRow(row));
      ageGroupResults.results.forEach((row) => worksheet.addRow(row));
      programStackResults.results.forEach((row) => worksheet.addRow(row));

      // Set response headers to force download
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=geography_data.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      // Write the Excel file to response
      await workbook.xlsx.write(res);
      return res.end();
    }

    // Return the data as JSON if not exporting
    return res.status(200).json(
      new ApiResponse({
        message: "Geography data fetched successfully with filters",
        data: dashboardData,
      })
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
// --- Client Performance Counts API ---
const getClientPerformanceCounts = async (req, res, next) => {
  const {
    countries,
    states,
    cities,
    regions,
    user_status,
    app_versions,
    age_range,
    gender,
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    time_range,
    payment_mode,
    exportData, // flag to export data to Excel
  } = req.body;

  try {
    // ---------- 0) DEDUPED SOPS ----------
    const SOPS_DISTINCT = `
      (
        SELECT DISTINCT
          sop.user_id,
          sop.program_id,
          sop.order_type,
          so.payment_mode
        FROM sub_orders_programs sop
        INNER JOIN order_details so ON sop.order_id = so.order_id
      ) sd
    `;

    // ---------- 1) JOINS ----------
    let allJoins = [
      { type: "LEFT", table: SOPS_DISTINCT, on: "ud.user_id = sd.user_id" },
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "sd.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
    ];

    if (regions && regions.length > 0) {
      allJoins.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
    }

    // ---------- 2) FILTERS ----------
    const baseConditions = [
      { field: "1", operator: "=", value: "1", raw: true },
    ];

    if (countries && countries.length > 0)
      baseConditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });

    if (states && states.length > 0)
      baseConditions.push({
        field: "s.state_id",
        operator: "IN",
        value: states,
      });

    if (cities && cities.length > 0)
      baseConditions.push({
        field: "ci.city_id",
        operator: "IN",
        value: cities,
      });

    if (regions && regions.length > 0)
      baseConditions.push({
        field: "c.region_id",
        operator: "IN",
        value: regions,
      });
    if (payment_mode && payment_mode.length > 0) {
      baseConditions.push({
        field: "sd.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }
    if (user_status && user_status.length > 0) {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: Array.isArray(user_status) ? user_status : [user_status],
      });
    } else {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge, 10);
      const maxYear = currentYear - parseInt(minAge, 10);
      baseConditions.push({
        field: "DATE(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (gender && gender.length > 0)
      baseConditions.push({
        field: "ud.gender",
        operator: "IN",
        value: Array.isArray(gender) ? gender : [gender],
      });

    if (program_stack && program_stack.length > 0) {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: Array.isArray(program_stack) ? program_stack : [program_stack],
      });
    } else {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: [
          "Special Stack",
          "Basic Stack",
          "Premium Stack",
          "Platinum Stack",
          "Privy Stack",
          "Pregnancy",
        ],
      });
    }

    // NOTE: cohort by ud.added_date as in your original
    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      baseConditions.push({
        field: "DATE(ud.added_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (Array.isArray(program_id) && program_id.length > 0)
      baseConditions.push({
        field: "sd.program_id",
        operator: "IN",
        value: program_id,
      });

    if (Array.isArray(sub_user_status) && sub_user_status.length > 0)
      baseConditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });

    if (Array.isArray(order_type) && order_type.length > 0)
      baseConditions.push({
        field: "sd.order_type",
        operator: "IN",
        value: order_type,
      });

    if (Array.isArray(sub_order_type) && sub_order_type.length > 0)
      baseConditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });

    // ---------- PREP: Get list of filtered user_ids via SQL (preserve all SQL joins/filters) ----------
    // We query users_details ud with the same allJoins (but WITHOUT joining to user_notifications).
    // This returns the user set that all notification queries should be scoped to (preserves SQL filters).
    const userFilterQuery = await readRecord({
      table: "users_details ud",
      selectFields: ["ud.user_id", "pm.program_category"], // keep program_category for program-stack mapping
      joins: allJoins, // allJoins does not include user_notifications (we didn't add it here)
      conditions: baseConditions,
      // no groupBy - we want raw user rows (may contain duplicates if joins produce them)
    });

    const userRows = userFilterQuery.results || [];
    // dedupe user_ids
    const userIdSet = new Set(
      userRows.map((r) => Number(r.user_id)).filter(Boolean)
    );
    const filteredUserIds = Array.from(userIdSet);

    // Quick guard: if no users matched, short-circuit with zeros (preserve response shapes)
    if (filteredUserIds.length === 0) {
      const clientEngagementMetricsEmpty = {
        notificationSeenInApp: {
          seenPercentage: "0.00",
          totalNotifications: 0,
          seenNotifications: 0,
          trend: "0.00",
        },
        weeklyEngagementTrend: [],
        engagementByProgramStack: [],
        topNotifications: [],
        appVersionStats: {
          updated: 0,
          notUpdated: 0,
          updatedPercentage: "0.00",
          notUpdatedPercentage: "0.00",
        },
      };

      // If export requested, still produce empty sheets
      if (exportData === "true") {
        const workbook = new ExcelJS.Workbook();
        const addSheet = (name, rows, columnsMap) => {
          const ws = workbook.addWorksheet(name);
          if (!rows || rows.length === 0) return;
          ws.columns = columnsMap.map(([header, key]) => ({ header, key }));
          rows.forEach((r) => ws.addRow(r));
        };

        addSheet(
          "By Program Stack",
          [],
          [
            ["Program Category", "program_category"],
            ["Total Notifications", "total_notifications"],
            ["Seen Notifications", "seen_notifications"],
            ["Engagement %", "engagement_percentage"],
          ]
        );

        addSheet(
          "Weekly Trend",
          [],
          [
            ["Week", "week_key"],
            ["Week Start", "week_start"],
            ["Total Notifications", "total_notifications"],
            ["Seen Notifications", "seen_notifications"],
            ["Engagement %", "engagement_percentage"],
          ]
        );

        addSheet(
          "Top Notifications",
          [],
          [
            ["Title", "title"],
            ["Seen Count", "seen_count"],
          ]
        );

        addSheet(
          "App Version",
          [
            {
              updated: 0,
              notUpdated: 0,
              updatedPercentage: "0.00",
              notUpdatedPercentage: "0.00",
            },
          ],
          [
            ["Updated", "updated"],
            ["Not Updated", "notUpdated"],
            ["Updated %", "updatedPercentage"],
            ["Not Updated %", "notUpdatedPercentage"],
          ]
        );

        res.setHeader(
          "Content-Disposition",
          "attachment; filename=client_engagement_metrics.xlsx"
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await workbook.xlsx.write(res);
        return res.end();
      }

      return res.status(200).json(
        new ApiResponse({
          message: "Client engagement metrics fetched successfully",
          data: clientEngagementMetricsEmpty,
        })
      );
    }

    // ---------- 3.1 Overall notifications seen (MONGO) ----------
    const totalNotifications = await userNotification.countDocuments({
      user_id: { $in: filteredUserIds.map((id) => Number(id)) },
    });

    const seenNotifications = await userNotification.countDocuments({
      user_id: { $in: filteredUserIds.map((id) => Number(id)) },
      read_status: true,
    });

    const seenPercentage =
      totalNotifications > 0
        ? (seenNotifications / totalNotifications) * 100
        : 0;

    // ---------- 3.2 Weekly trend (last 4 weeks) — MONGO ----------
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    // Aggregate: group by ISO year & week to mimic YEARWEEK(...,3)
    const weeklyAgg = await userNotification.aggregate([
      {
        $match: {
          user_id: { $in: filteredUserIds.map((id) => Number(id)) },
          added_date: { $gte: fourWeeksAgo },
        },
      },
      {
        $addFields: {
          isoWeek: { $isoWeek: "$added_date" },
          isoWeekYear: { $isoWeekYear: "$added_date" },
          added_date_only: {
            $dateToString: { format: "%Y-%m-%d", date: "$added_date" },
          },
        },
      },
      {
        $group: {
          _id: { year: "$isoWeekYear", week: "$isoWeek" },
          week_key: {
            $first: {
              $add: [{ $multiply: ["$isoWeekYear", 100] }, "$isoWeek"],
            },
          },
          week_start: { $min: "$added_date_only" },
          total_notifications: { $sum: 1 },
          seen_notifications: {
            $sum: { $cond: [{ $eq: ["$read_status", true] }, 1, 0] },
          },
        },
      },
      { $sort: { week_key: 1 } },
    ]);

    const weeklyData = weeklyAgg.map((r) => {
      const total = Number(r.total_notifications || 0);
      const seen = Number(r.seen_notifications || 0);
      const weekKeyStr = r.week_key ? r.week_key : null;
      return {
        week_number: weekKeyStr
          ? parseInt(weekKeyStr.toString().slice(-2))
          : null,
        week_key: weekKeyStr,
        week_start: r.week_start,
        total_notifications: total,
        seen_notifications: seen.toString(),
        engagement_percentage:
          total > 0 ? ((seen / total) * 100).toFixed(2) : "0.00",
      };
    });

    // ---------- compute trend ----------
    let trend = 0;
    if (weeklyData.length >= 2) {
      const last = parseFloat(
        weeklyData[weeklyData.length - 1].engagement_percentage
      );
      const prev = parseFloat(
        weeklyData[weeklyData.length - 2].engagement_percentage
      );
      trend = last - prev;
    }

    // ---------- 3.3 Engagement by program stack — we need mapping user_id -> program_category (SQL) then MONGO counts ----------
    // Build mapping from userRows (which included pm.program_category for each user row)
    const programMap = {}; // program_category => Set(user_id)
    userRows.forEach((r) => {
      const pcat = r.program_category || null;
      if (pcat) {
        if (!programMap[pcat]) programMap[pcat] = new Set();
        programMap[pcat].add(Number(r.user_id));
      }
    });

    const programStackData = [];
    const programCategories = Object.keys(programMap);
    // For each program_category, count notifications and seen notifications in Mongo for that program's user set
    for (const cat of programCategories) {
      const uids = Array.from(programMap[cat]);
      if (uids.length === 0) continue;
      const total = await userNotification.countDocuments({
        user_id: { $in: uids },
      });
      const seen = await userNotification.countDocuments({
        user_id: { $in: uids },
        read_status: true,
      });
      programStackData.push({
        program_category: cat,
        total_notifications: total,
        seen_notifications: seen,
        engagement_percentage:
          total > 0 ? ((seen / total) * 100).toFixed(2) : "0.00",
      });
    }

    // If program_stack default set (when program_stack not provided) expected categories may not all exist in programMap.
    // To preserve identical behaviour to SQL, ensure categories present in original default list show up with zeros if absent:
    if (
      (!program_stack || program_stack.length === 0) &&
      programStackData.length === 0
    ) {
      // produce empty or default categories as in original? Keep empty array (SQL would've returned only present categories).
    }

    // ---------- 3.4 Top 5 most-seen notifications — MONGO ----------
    const topAgg = await userNotification.aggregate([
      {
        $match: {
          user_id: { $in: filteredUserIds.map((id) => Number(id)) },
          read_status: true,
        },
      },
      {
        $group: {
          _id: "$title",
          title: { $first: "$title" },
          seen_count: { $sum: 1 },
        },
      },
      { $sort: { seen_count: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          title: 1,
          seen_count: 1,
        },
      },
    ]);

    const topNotificationResults = { results: topAgg };

    // ---------- 3.5 App version stats on the same cohort (SQL) ----------
    const appVersionStatsQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        `SUM(CASE WHEN ud.app_version IN ('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}') THEN 1 ELSE 0 END) AS updated_count`,
        `SUM(CASE WHEN ud.app_version NOT IN ('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}') OR ud.app_version IS NULL THEN 1 ELSE 0 END) AS not_updated_count`,
      ],
      joins: allJoins,
      conditions: baseConditions,
    });

    // ---------- 4) RUN (we already executed individual pieces above) ----------
    // notificationResults equivalent
    const notificationResults = {
      results: [
        {
          total_notifications: totalNotifications,
          seen_notifications: seenNotifications,
        },
      ],
    };

    const weeklyTrendResults = {
      results: weeklyData.map((d) => ({
        week_key: d.week_key,
        week_start: d.week_start,
        total_notifications: d.total_notifications,
        seen_notifications: Number(d.seen_notifications),
      })),
    };

    // programStackResults mimic
    const programStackResults = {
      results: programStackData.map((p) => ({
        program_category: p.program_category,
        total_notifications: p.total_notifications,
        seen_notifications: p.seen_notifications,
      })),
    };

    const appVersionStatsResults = await appVersionStatsQuery;

    // ---------- 5) SHAPE ----------
    const notificationData = notificationResults.results[0] || {
      total_notifications: 0,
      seen_notifications: 0,
    };

    const totalNotificationsNum =
      Number(notificationData.total_notifications) || 0;
    const seenNotificationsNum =
      Number(notificationData.seen_notifications) || 0;
    const seenPercentageNum =
      totalNotificationsNum > 0
        ? (seenNotificationsNum / totalNotificationsNum) * 100
        : 0;

    const weeklyDataForResponse = weeklyTrendResults.results.map((r) => {
      const total = Number(r.total_notifications) || 0;
      const seen = Number(r.seen_notifications) || 0;
      return {
        week_number: r.week_key
          ? parseInt(r.week_key.toString().slice(-2))
          : null,
        total_notifications: total,
        seen_notifications: seen.toString(),
        engagement_percentage:
          total > 0 ? ((seen / total) * 100).toFixed(2) : "0.00",
      };
    });

    let computedTrend = 0;
    if (weeklyDataForResponse.length >= 2) {
      const last = parseFloat(
        weeklyDataForResponse[weeklyDataForResponse.length - 1]
          .engagement_percentage
      );
      const prev = parseFloat(
        weeklyDataForResponse[weeklyDataForResponse.length - 2]
          .engagement_percentage
      );
      computedTrend = last - prev;
    }

    const programStackDataForResponse = programStackResults.results.map((r) => {
      const total = Number(r.total_notifications) || 0;
      const seen = Number(r.seen_notifications) || 0;
      return {
        program_category: r.program_category,
        total_notifications: total,
        seen_notifications: seen,
        engagement_percentage:
          total > 0 ? ((seen / total) * 100).toFixed(2) : "0.00",
      };
    });

    const appVersionStats = appVersionStatsResults.results[0] || {
      updated_count: 0,
      not_updated_count: 0,
    };
    const totalUsers =
      Number(appVersionStats.updated_count || 0) +
      Number(appVersionStats.not_updated_count || 0);

    const clientEngagementMetrics = {
      notificationSeenInApp: {
        seenPercentage: seenPercentageNum.toFixed(2),
        totalNotifications: totalNotificationsNum,
        seenNotifications: seenNotificationsNum,
        trend: computedTrend.toFixed(2),
      },
      weeklyEngagementTrend: weeklyDataForResponse,
      engagementByProgramStack: programStackDataForResponse,
      topNotifications: topNotificationResults.results,
      appVersionStats: {
        updated: Number(appVersionStats.updated_count || 0),
        notUpdated: Number(appVersionStats.not_updated_count || 0),
        updatedPercentage:
          totalUsers > 0
            ? ((appVersionStats.updated_count / totalUsers) * 100).toFixed(2)
            : "0.00",
        notUpdatedPercentage:
          totalUsers > 0
            ? ((appVersionStats.not_updated_count / totalUsers) * 100).toFixed(
                2
              )
            : "0.00",
      },
    };

    // ---------- 6) EXPORT ----------
    if (exportData === "true") {
      const workbook = new ExcelJS.Workbook();

      const addSheet = (name, rows, columnsMap) => {
        const ws = workbook.addWorksheet(name);
        if (!rows || rows.length === 0) return;
        ws.columns = columnsMap.map(([header, key]) => ({ header, key }));
        rows.forEach((r) => ws.addRow(r));
      };

      addSheet(
        "By Program Stack",
        clientEngagementMetrics.engagementByProgramStack,
        [
          ["Program Category", "program_category"],
          ["Total Notifications", "total_notifications"],
          ["Seen Notifications", "seen_notifications"],
          ["Engagement %", "engagement_percentage"],
        ]
      );

      addSheet(
        "Weekly Trend",
        clientEngagementMetrics.weeklyEngagementTrend.map((d) => ({
          week_key: d.week_number,
          week_start: d.week_start || "",
          total_notifications: d.total_notifications,
          seen_notifications: d.seen_notifications,
          engagement_percentage: d.engagement_percentage,
        })),
        [
          ["Week", "week_key"],
          ["Week Start", "week_start"],
          ["Total Notifications", "total_notifications"],
          ["Seen Notifications", "seen_notifications"],
          ["Engagement %", "engagement_percentage"],
        ]
      );

      addSheet("Top Notifications", topNotificationResults.results, [
        ["Title", "title"],
        ["Seen Count", "seen_count"],
      ]);

      addSheet(
        "App Version",
        [
          {
            updated: clientEngagementMetrics.appVersionStats.updated,
            notUpdated: clientEngagementMetrics.appVersionStats.notUpdated,
            updatedPercentage:
              clientEngagementMetrics.appVersionStats.updatedPercentage,
            notUpdatedPercentage:
              clientEngagementMetrics.appVersionStats.notUpdatedPercentage,
          },
        ],
        [
          ["Updated", "updated"],
          ["Not Updated", "notUpdated"],
          ["Updated %", "updatedPercentage"],
          ["Not Updated %", "notUpdatedPercentage"],
        ]
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=client_engagement_metrics.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ---------- 7) JSON ----------
    return res.status(200).json(
      new ApiResponse({
        message: "Client engagement metrics fetched successfully",
        data: clientEngagementMetrics,
      })
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// --- Renewal Analysis Counts API ---
const getRenewalAnalysisCounts = async (req, res, next) => {
  const {
    program_status,
    countries,
    states,
    cities,
    regions,
    user_status,
    app_versions,
    age_range,
    gender,
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    time_range,
    payment_mode,
    exportData,
  } = req.body;

  try {
    // ---------------- 0) DEDUPED SUBQUERIES ----------------
    // One row per sub_order_id for expiries/renewals cohort
    const EXPIRIES_BASE = `
      (
        SELECT DISTINCT
          sop.sub_order_id,
          sop.user_id,
          sop.program_id,
          sop.program_status,
          sop.order_type,
          DATE(sop.expiry_date) AS expiry_date,
          so.payment_mode
        FROM sub_orders_programs sop
        INNER JOIN order_details so ON sop.order_id = so.order_id
      ) eb
    `;

    // Per-user renewal counts (deduped)
    const RENEWALS_PER_USER = `
      (
        SELECT
          x.user_id,
          COUNT(*) AS renewal_count
        FROM (
          SELECT DISTINCT user_id, sub_order_id
          FROM sub_orders_programs
          WHERE order_type = 'Renewal'
        ) x
        GROUP BY x.user_id
      ) rup
    `;

    // ---------------- 1) JOINS (against the deduped base) ----------------
    // NOTE: we will use EXPIRIES_BASE as the "table" for all queries,
    // and join programs_master pm exactly once (no alias conflicts).
    const joinsDims = [
      {
        type: "LEFT",
        table: "users_details ud",
        on: "eb.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
    ];

    if (Array.isArray(regions) && regions.length > 0) {
      joinsDims.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
    }

    const joinsWithPM = [
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "eb.program_id = pm.program_id",
      },
      ...joinsDims,
    ];

    // ---------------- 2) FILTERS (point to eb/ud/pm etc.) ----------------
    const baseConditions = [
      { field: "1", operator: "=", value: "1", raw: true },
    ];

    if (program_status)
      baseConditions.push({
        field: "eb.program_status",
        operator: "=",
        value: program_status,
      });

    if (Array.isArray(countries) && countries.length > 0)
      baseConditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });

    if (Array.isArray(states) && states.length > 0)
      baseConditions.push({
        field: "s.state_id",
        operator: "IN",
        value: states,
      });

    if (payment_mode && payment_mode.length > 0) {
      baseConditions.push({
        field: "eb.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }

    if (Array.isArray(cities) && cities.length > 0)
      baseConditions.push({
        field: "ci.city_id",
        operator: "IN",
        value: cities,
      });

    if (Array.isArray(regions) && regions.length > 0)
      baseConditions.push({
        field: "c.region_id",
        operator: "IN",
        value: regions,
      });

    if (Array.isArray(user_status) && user_status.length > 0) {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: user_status,
      });
    } else {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge, 10);
      const maxYear = currentYear - parseInt(minAge, 10);
      baseConditions.push({
        field: "DATE(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (Array.isArray(gender) && gender.length > 0)
      baseConditions.push({
        field: "ud.gender",
        operator: "IN",
        value: gender,
      });

    if (Array.isArray(program_stack) && program_stack.length > 0) {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: program_stack,
      });
    } else {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: [
          "Special Stack",
          "Basic Stack",
          "Premium Stack",
          "Platinum Stack",
          "Privy Stack",
          "Pregnancy",
        ],
      });
    }

    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      baseConditions.push({
        field: "eb.expiry_date",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (Array.isArray(program_id) && program_id.length > 0)
      baseConditions.push({
        field: "eb.program_id",
        operator: "IN",
        value: program_id,
      });

    if (Array.isArray(sub_user_status) && sub_user_status.length > 0)
      baseConditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });

    if (Array.isArray(order_type) && order_type.length > 0)
      baseConditions.push({
        field: "eb.order_type",
        operator: "IN",
        value: order_type,
      });

    if (Array.isArray(sub_order_type) && sub_order_type.length > 0)
      baseConditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });

    // ---------------- 3) QUERIES (no row inflation) ----------------

    // 3.1 Summary
    const summary = await readRecord({
      table: EXPIRIES_BASE,
      selectFields: [
        "COUNT(DISTINCT eb.sub_order_id) AS total_expiry",
        "SUM(CASE WHEN eb.order_type = 'Renewal' THEN 1 ELSE 0 END) AS total_renewals",
        "SUM(CASE WHEN eb.order_type <> 'Renewal' THEN 1 ELSE 0 END) AS not_renewed",
      ],
      joins: joinsWithPM,
      conditions: baseConditions,
    });

    // 3.2 Program Type Performance (Stack)
    const programTypePerformance = await readRecord({
      table: EXPIRIES_BASE,
      selectFields: [
        "pm.program_category AS program_stack",
        "SUM(CASE WHEN eb.order_type = 'Renewal' THEN 1 ELSE 0 END) AS renewals",
        "SUM(CASE WHEN eb.order_type <> 'Renewal' THEN 1 ELSE 0 END) AS not_renewed",
      ],
      joins: joinsWithPM,
      conditions: baseConditions,
      groupBy: ["pm.program_category"],
    });

    // 3.3 Renewal Frequency (per-user categories) — filtered cohort
    const renewalFrequency = await readRecord({
      table: EXPIRIES_BASE,
      selectFields: [
        `CASE 
           WHEN rup.renewal_count IS NULL OR rup.renewal_count = 0 THEN '0'
           WHEN rup.renewal_count = 1 THEN '1'
           WHEN rup.renewal_count = 2 THEN '2'
           ELSE '3+' 
         END AS renewal_category`,
        "COUNT(DISTINCT ud.user_id) AS user_count",
      ],
      joins: [
        ...joinsWithPM,
        {
          type: "LEFT",
          table: RENEWALS_PER_USER,
          on: "ud.user_id = rup.user_id",
        },
      ],
      conditions: baseConditions,
      groupBy: ["renewal_category"],
      orderBy: ["renewal_category"],
    });

    // ---------------- 4) Assemble response ----------------
    const resultData = {
      summary: (() => {
        const row = summary.results?.[0] || {
          total_expiry: 0,
          total_renewals: 0,
          not_renewed: 0,
        };
        const renewal_rate = row.total_expiry
          ? ((row.total_renewals / row.total_expiry) * 100).toFixed(1)
          : "0.0";
        return { ...row, renewal_rate };
      })(),
      programTypePerformance: programTypePerformance.results,
      renewalFrequency: renewalFrequency.results,
    };

    // ---------------- 5) Optional export ----------------
    if (exportData === "true") {
      const workbook = new ExcelJS.Workbook();

      const addSheet = (name, rows) => {
        const ws = workbook.addWorksheet(name);
        if (rows && rows.length > 0) {
          ws.columns = Object.keys(rows[0]).map((key) => ({
            header: key,
            key,
          }));
          rows.forEach((r) => ws.addRow(r));
        }
      };

      addSheet("Summary", [resultData.summary]);
      addSheet("Program Type Performance", resultData.programTypePerformance);
      addSheet("Renewal Frequency", resultData.renewalFrequency);

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=renewal_analysis.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ---------------- 6) Return JSON ----------------
    return res.status(200).json(
      new ApiResponse({
        message: "Renewal analysis data fetched successfully",
        data: resultData,
      })
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// --- Demographics Counts API ---
const getDemographicsCounts = async (req, res, next) => {
  const {
    countries,
    states,
    cities,
    regions,
    user_status,
    app_versions,
    age_range,
    gender,
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    time_range,
    payment_mode,
    exportData,
  } = req.body;

  try {
    // ---------- 0) DEDUPED SOPS ----------
    // Prevent row inflation: distinct user-program-order_type combos only.
    const SOPS_DISTINCT = `
      (
        SELECT DISTINCT
          sop.user_id,
          sop.program_id,
          sop.order_type,
          so.payment_mode
        FROM sub_orders_programs sop
        INNER JOIN order_details so ON sop.order_id = so.order_id
      ) sd
    `;

    // ---------- 1) JOINS ----------
    // Join users to the deduped sops, then to programs & geo.
    let allJoins = [
      { type: "LEFT", table: SOPS_DISTINCT, on: "ud.user_id = sd.user_id" },
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "sd.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
    ];

    if (regions && regions.length > 0) {
      allJoins.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
    }

    // ---------- 2) FILTERS ----------
    const baseConditions = [
      { field: "1", operator: "=", value: "1", raw: true },
    ];

    if (countries && countries.length > 0)
      baseConditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });

    if (states && states.length > 0)
      baseConditions.push({
        field: "s.state_id",
        operator: "IN",
        value: states,
      });

    if (cities && cities.length > 0)
      baseConditions.push({
        field: "ci.city_id",
        operator: "IN",
        value: cities,
      });

    if (regions && regions.length > 0)
      baseConditions.push({
        field: "c.region_id",
        operator: "IN",
        value: regions,
      });
    if (payment_mode && payment_mode.length > 0) {
      baseConditions.push({
        field: "sd.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }
    if (user_status && user_status.length > 0) {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: Array.isArray(user_status) ? user_status : [user_status],
      });
    } else {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge, 10);
      const maxYear = currentYear - parseInt(minAge, 10);
      baseConditions.push({
        field: "DATE(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (gender && gender.length > 0)
      baseConditions.push({
        field: "ud.gender",
        operator: "IN",
        value: Array.isArray(gender) ? gender : [gender],
      });

    if (program_stack && program_stack.length > 0) {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: Array.isArray(program_stack) ? program_stack : [program_stack],
      });
    } else {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: [
          "Special Stack",
          "Basic Stack",
          "Premium Stack",
          "Platinum Stack",
          "Privy Stack",
          "Pregnancy",
        ],
      });
    }

    // NOTE: you filter by ud.added_date (user cohort time). Keeping that behavior.
    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      baseConditions.push({
        field: "DATE(ud.added_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (Array.isArray(program_id) && program_id.length > 0)
      baseConditions.push({
        field: "sd.program_id",
        operator: "IN",
        value: program_id,
      });

    if (Array.isArray(sub_user_status) && sub_user_status.length > 0)
      baseConditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });

    if (Array.isArray(order_type) && order_type.length > 0)
      baseConditions.push({
        field: "sd.order_type",
        operator: "IN",
        value: order_type,
      });

    if (Array.isArray(sub_order_type) && sub_order_type.length > 0)
      baseConditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });

    // ---------- 3) QUERIES (use DISTINCT users) ----------

    // Countries
    const countryQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        "co.country_name",
        "COUNT(DISTINCT ud.user_id) AS client_count",
      ],
      conditions: [
        ...baseConditions,
        {
          field: "co.country_id",
          operator: "IS NOT NULL",
          value: "",
          raw: true,
        },
      ],
      joins: allJoins,
      groupBy: ["co.country_id"],
      orderBy: ["client_count DESC"],
      pagination: { limit: 6 },
    });

    // States
    const statesQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        "s.state_name",
        "COUNT(DISTINCT ud.user_id) AS client_count",
      ],
      conditions: [
        ...baseConditions,
        { field: "s.state_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      joins: allJoins,
      groupBy: ["s.state_id"],
      orderBy: ["client_count DESC"],
      pagination: { limit: 10 },
    });

    // Cities
    const citiesQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        "ci.city_name",
        "COUNT(DISTINCT ud.user_id) AS client_count",
      ],
      conditions: [
        ...baseConditions,
        { field: "ci.city_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      joins: allJoins,
      groupBy: ["ci.city_id"],
      orderBy: ["client_count DESC"],
      pagination: { limit: 10 },
    });

    // Program stack by geography (distinct users per city per stack)
    const programStackByGeographyQuery = readRecord({
      table: "users_details ud",
      selectFields: [
        "ci.city_name",
        "pm.program_category",
        "COUNT(DISTINCT ud.user_id) AS client_count",
      ],
      conditions: [
        ...baseConditions,
        { field: "ci.city_id", operator: "IS NOT NULL", value: "", raw: true },
        {
          field: "pm.program_category",
          operator: "IS NOT NULL",
          value: "",
          raw: true,
        },
      ],
      joins: allJoins,
      groupBy: ["ci.city_id", "pm.program_category"],
      orderBy: ["client_count DESC"],
      pagination: { limit: 10 },
    });

    // ---------- 4) RUN ----------
    const [
      countryResults,
      statesResults,
      citiesResults,
      programStackByGeographyResults,
    ] = await Promise.all([
      countryQuery,
      statesQuery,
      citiesQuery,
      programStackByGeographyQuery,
    ]);

    // ---------- 5) RESPONSE ----------
    const demographicsData = {
      countryDistribution: countryResults.results,
      statesDistribution: statesResults.results,
      topCities: citiesResults.results,
      programStackByGeography: programStackByGeographyResults.results,
    };

    // ---------- 6) EXPORT ----------
    if (exportData === "true") {
      const workbook = new ExcelJS.Workbook();

      const addSheet = (name, rows) => {
        const ws = workbook.addWorksheet(name);
        if (rows && rows.length > 0) {
          ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k }));
          rows.forEach((r) => ws.addRow(r));
        }
      };

      addSheet("By Country", demographicsData.countryDistribution);
      addSheet("By State", demographicsData.statesDistribution);
      addSheet("By City", demographicsData.topCities);
      addSheet("Stack by City", demographicsData.programStackByGeography);

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=demographics_data.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }

    return res.status(200).json({
      message: "Demographics data fetched successfully with filters",
      data: demographicsData,
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// --- Program Performance Counts API ---

const getProgramPerformanceCounts = async (req, res, next) => {
  const {
    program_stack,
    program_id,
    order_type,
    sub_user_status,
    sub_order_type,
    mentor_assigned,
    countries,
    states,
    cities,
    regions,
    user_status,
    app_versions,
    age_range,
    gender,
    time_range,
    payment_mode,
    export: exportData,
  } = req.body;

  try {
    // ---------- 0) Fetch notification aggregation from MongoDB ----------
    const notifAgg = await userNotification.aggregate([
      {
        $group: {
          _id: "$user_id",
          read_count: {
            $sum: { $cond: [{ $eq: ["$read_status", 1] }, 1, 0] },
          },
          notif_count: { $sum: 1 },
        },
      },
    ]);

    const notifMap = {};
    notifAgg.forEach((n) => {
      notifMap[n._id.toString()] = {
        read_count: n.read_count,
        notif_count: n.notif_count,
      };
    });

    const engagementMap = new Map();
    notifAgg.forEach((item) => {
      const engagement =
        item.notif_count === 0 ? 0 : (item.read_count * 100) / item.notif_count;
      engagementMap.set(String(item._id), engagement);
    });
    // ---------- 1) Base SQL subqueries ----------
    const ORDERS_BASE = `
      (
        SELECT DISTINCT
          sop.sub_order_id,
          sop.program_id,
          sop.user_id,
          sop.order_type,
          so.order_id,
          sop.paid_amount AS order_paid_amount,
          so.payment_mode,
          DATE(so.order_date) AS order_date,
          so.sale_by
        FROM sub_orders_programs sop
        INNER JOIN order_details so ON sop.order_id = so.order_id
      ) ob
    `;

    const allJoins = [
      {
        type: "INNER",
        table: ORDERS_BASE,
        on: "pm.program_id = ob.program_id",
      },
      {
        type: "INNER",
        table: "users_details ud",
        on: "ob.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: "countries co",
        on: "ud.country_id = co.country_id",
      },
      { type: "LEFT", table: "states s", on: "ud.state_id = s.state_id" },
      { type: "LEFT", table: "cities ci", on: "ud.city_id = ci.city_id" },
      {
        type: "LEFT",
        table: "admin_users au",
        on: "ob.sale_by = au.admin_user_id",
      },
    ];

    const baseConditions = [
      { field: "1", operator: "=", value: "1", raw: true },
    ];

    // ---------- 2) Dynamic filters ----------
    if (regions && regions.length > 0) {
      allJoins.push(
        {
          type: "LEFT",
          table: "region_members rm",
          on: "ud.country_id = rm.country_id",
        },
        { type: "LEFT", table: "regions c", on: "rm.region_id = c.region_id" }
      );
      baseConditions.push({
        field: "c.region_id",
        operator: "IN",
        value: regions,
      });
    }

    if (program_stack && program_stack.length > 0) {
      baseConditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: Array.isArray(program_stack) ? program_stack : [program_stack],
      });
    } else {
      baseConditions.push({
        field:
          "(pm.program_category != 'Service' OR pm.program_category IS NULL)",
        operator: "",
        value: "",
        raw: true,
      });
    }

    if (mentor_assigned && mentor_assigned.length > 0) {
      baseConditions.push({
        field: "ob.order_type",
        operator: "IN",
        value: Array.isArray(mentor_assigned)
          ? mentor_assigned
          : [mentor_assigned],
      });
    }

    if (countries && countries.length > 0)
      baseConditions.push({
        field: "co.country_id",
        operator: "IN",
        value: countries,
      });

    if (states && states.length > 0)
      baseConditions.push({
        field: "s.state_id",
        operator: "IN",
        value: states,
      });

    if (cities && cities.length > 0)
      baseConditions.push({
        field: "ci.city_id",
        operator: "IN",
        value: cities,
      });

    if (payment_mode && payment_mode.length > 0) {
      baseConditions.push({
        field: "ob.payment_mode",
        operator: "IN",
        value: Array.isArray(payment_mode) ? payment_mode : [payment_mode],
      });
    }

    if (user_status && user_status.length > 0) {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: Array.isArray(user_status) ? user_status : [user_status],
      });
    } else {
      baseConditions.push({
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      });
    }

    if (app_versions) {
      if (app_versions === "Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      } else if (app_versions === "Not Updated") {
        baseConditions.push({
          field: "ud.app_version",
          operator: " NOT IN ",
          value: `('${appVersions.latestIosVersion}','${appVersions.latestAndroidVersion}')`,
          raw: true,
        });
      }
    }

    if (age_range) {
      const [minAge, maxAge] = age_range.split("-");
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - parseInt(maxAge, 10);
      const maxYear = currentYear - parseInt(minAge, 10);
      baseConditions.push({
        field: "DATE(ud.birth_date)",
        operator: "BETWEEN",
        value: [`${minYear}-01-01`, `${maxYear}-12-31`],
      });
    }

    if (gender && gender.length > 0)
      baseConditions.push({
        field: "ud.gender",
        operator: "IN",
        value: Array.isArray(gender) ? gender : [gender],
      });

    if (time_range) {
      const [startDate, endDate] = time_range.split(",");
      baseConditions.push({
        field: "ob.order_date",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (Array.isArray(program_id) && program_id.length > 0)
      baseConditions.push({
        field: "ob.program_id",
        operator: "IN",
        value: program_id,
      });

    if (Array.isArray(sub_user_status) && sub_user_status.length > 0)
      baseConditions.push({
        field: "ud.sub_user_status",
        operator: "IN",
        value: sub_user_status,
      });

    if (Array.isArray(order_type) && order_type.length > 0)
      baseConditions.push({
        field: "ob.order_type",
        operator: "IN",
        value: order_type,
      });

    if (Array.isArray(sub_order_type) && sub_order_type.length > 0) {
      baseConditions.push({
        field: "ud.current_lead_source",
        operator: "IN",
        value: ["22", "23"],
      });
    }

    // ---------- 3) SQL Queries ----------
    const [
      topPrograms,
      revenueByProgram,
      stackPerformance,
      revenueByStack,
      mentorCounselorSales,
    ] = await Promise.all([
      readRecord({
        table: "programs_master pm",
        selectFields: [
          "pm.program_name",
          "COUNT(DISTINCT ob.sub_order_id) AS program_count",
        ],
        joins: allJoins,
        conditions: baseConditions,
        groupBy: ["pm.program_name"],
        orderBy: ["program_count DESC"],
        pagination: { limit: 6 },
      }),
      readRecord({
        table: "programs_master pm",
        selectFields: [
          "pm.program_name",
          "SUM(ob.order_paid_amount) AS revenue",
        ],
        joins: allJoins,
        conditions: baseConditions,
        groupBy: ["pm.program_name"],
        orderBy: ["revenue DESC"],
        pagination: { limit: 6 },
      }),
      readRecord({
        table: "programs_master pm",
        selectFields: [
          "pm.program_category",
          "COUNT(DISTINCT ud.user_id) AS client_count",
          "SUM(ob.order_paid_amount) AS revenue",
          "100.0 * SUM(CASE WHEN ob.order_type = 'Renewal' THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT ob.sub_order_id),0) AS renewal_rate_percentage",
        ],
        joins: allJoins,
        conditions: baseConditions,
        groupBy: ["pm.program_category"],
      }),
      readRecord({
        table: "programs_master pm",
        selectFields: [
          "pm.program_category",
          "SUM(ob.order_paid_amount) AS total_revenue",
        ],
        joins: allJoins,
        conditions: baseConditions,
        groupBy: ["pm.program_category"],
      }),
      readRecord({
        table: "programs_master pm",
        selectFields: [
          "au.role_id",
          `CASE 
               WHEN au.role_id = 1 THEN 'Mentor'
               WHEN au.role_id = 2 THEN 'Counselor'
               ELSE 'Other'
             END AS mentor_counselor`,
          "COUNT(DISTINCT ob.sub_order_id) AS program_count",
          "SUM(ob.order_paid_amount) AS revenue",
        ],
        joins: allJoins,
        conditions: baseConditions,
        groupBy: ["au.role_id"],
        orderBy: ["program_count DESC"],
      }),
    ]);

    // ---------- 4) Merge notification data ----------
    const totalReads = notifAgg.reduce((sum, n) => sum + n.read_count, 0);
    const totalNotifs = notifAgg.reduce((sum, n) => sum + n.notif_count, 0);
    const globalEngagement =
      totalNotifs === 0 ? 0 : (totalReads * 100) / totalNotifs;

    const stackPerformanceResults = stackPerformance.results.map((row) => ({
      ...row,
      engagement_percentage: globalEngagement.toFixed(5),
    }));

    const programPerformanceMetrics = {
      topProgramPurchases: topPrograms.results,
      revenueByProgram: revenueByProgram.results,
      programStackPerformance: stackPerformanceResults,
      revenueByStackType: revenueByStack.results,
      mentorCounselorSales: mentorCounselorSales.results,
    };

    // ---------- 5) Optional Excel export ----------
    if (exportData === "true") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Program Performance Data");

      worksheet.columns = [
        { header: "Program Name", key: "program_name" },
        { header: "Program Count", key: "program_count" },
        { header: "Revenue", key: "revenue" },
        { header: "Program Category", key: "program_category" },
        { header: "Client Count", key: "client_count" },
        { header: "Engagement Percentage", key: "engagement_percentage" },
        { header: "Renewal Rate Percentage", key: "renewal_rate_percentage" },
      ];

      topPrograms.results.forEach((row) => worksheet.addRow(row));
      revenueByProgram.results.forEach((row) => worksheet.addRow(row));
      stackPerformanceResults.forEach((row) => worksheet.addRow(row));
      revenueByStack.results.forEach((row) => worksheet.addRow(row));

      const sheet2 = workbook.addWorksheet("Mentor-Counselor Sales");
      sheet2.columns = [
        { header: "Role", key: "role" },
        { header: "Program Count", key: "program_count" },
        { header: "Revenue", key: "revenue" },
      ];

      mentorCounselorSales.results.forEach((row) =>
        sheet2.addRow({
          role:
            row.role_id === 1
              ? "Mentor"
              : row.role_id === 2
              ? "Counselor"
              : "Other",
          program_count: row.program_count,
          revenue: row.revenue,
        })
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=program_performance_data.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ---------- 6) Send response ----------
    return res.status(200).json(
      new ApiResponse({
        message: "Program performance metrics fetched successfully",
        data: programPerformanceMetrics,
      })
    );
  } catch (error) {
    console.error("❌ getProgramPerformanceCounts Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFinancialYearlySalesBreakdown = async (req, res, next) => {
  try {
    let { start_date, end_date, is_export } = req.query;

    let startDate = start_date;
    let endDate = end_date;
    const { results: specialStackSales } = await readRecordNewForLead({
      withQueries: [
        {
          name: "advance_stack_all_orders",
          query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od 
  JOIN sub_orders_programs sop ON od.order_id = sop.order_id
  WHERE sop.program_type = 0
  AND sop.order_type IN ('New','Renewal')
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
        {
          name: "advance_stack_all_units",
          query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON od.order_id = sop.order_id
  WHERE sop.program_type = 0
  AND sop.order_type IN ('New','Renewal')
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
      ],
      selectFields: [
        ` units.total_units AS total_units_sold`,
        `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
        `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
      ],
      table: `advance_stack_all_orders orders, advance_stack_all_units units`,
    });
    const orderTypes = [
      {
        name: "Renewal",
        type: "Renewal",
      },
      {
        name: "New Sale (Lead & Ref)",
        type: "New",
      },
    ];
    const specialStackByOrderType = await Promise.all(
      orderTypes.map(async (ot) => {
        const { results } = await readRecordNewForLead({
          withQueries: [
            {
              name: `advance_stack_orders_${ot.type}`,
              query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON od.order_id = sop.order_id
  WHERE sop.program_type = 0
    AND sop.order_type = '${ot.type}'
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
            },
            {
              name: `advance_stack_units_${ot.type}`,
              query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON od.order_id = sop.order_id
  WHERE sop.program_type = 0
    AND sop.order_type = '${ot.type}'
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
            },
          ],
          selectFields: [
            ` units.total_units AS total_units_sold`,
            `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
            `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
          ],
          table: `advance_stack_orders_${ot.type} orders, advance_stack_units_${ot.type} units`,
        });
        return { order_type: ot.type, ...results[0] };
      })
    );

    const { results: basicStackSales } = await readRecordNewForLead({
      withQueries: [
        {
          name: "basic_stack_all_orders",
          query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON od.order_id = sop.order_id
  WHERE sop.program_type = 1
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
        {
          name: "basic_stack_all_units",
          query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON od.order_id = sop.order_id
  WHERE sop.program_type = 1
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
      ],
      selectFields: [
        ` units.total_units AS total_units_sold`,
        `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
        `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
      ],
      table: `basic_stack_all_orders orders, basic_stack_all_units units`,
    });
    const { results: privyStackSales } = await readRecordNewForLead({
      withQueries: [
        {
          name: "privy_stack_orders",
          query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON sop.order_id = od.order_id
  JOIN programs_master pm ON pm.program_id = sop.program_id
  WHERE pm.program_category IN ('Privy Stack','Platinum Stack','Premium Stack')
  AND sop.order_type IN ('New','Renewal')
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
        {
          name: "privy_stack_units",
          query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON sop.order_id = od.order_id
  JOIN programs_master pm ON pm.program_id = sop.program_id
  WHERE pm.program_category IN ('Privy Stack','Platinum Stack','Premium Stack')
  AND sop.order_type IN ('New','Renewal')
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
      ],
      selectFields: [
        ` units.total_units AS total_units_sold`,
        `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
        `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
      ],
      table: `privy_stack_orders orders, privy_stack_units units`,
    });

    const privyStackByOrderType = await Promise.all(
      orderTypes.map(async (ot) => {
        const { results } = await readRecordNewForLead({
          withQueries: [
            {
              name: `privy_stack_orders_${ot.type}`,
              query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON sop.order_id = od.order_id
  JOIN programs_master pm ON pm.program_id = sop.program_id
  WHERE pm.program_category IN ('Privy Stack','Platinum Stack','Premium Stack')
    AND sop.order_type = '${ot.type}'
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
            },
            {
              name: `privy_stack_units_${ot.type}`,
              query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON sop.order_id = od.order_id
  JOIN programs_master pm ON pm.program_id = sop.program_id
  WHERE pm.program_category IN ('Privy Stack','Platinum Stack','Premium Stack')
    AND sop.order_type = '${ot.type}'
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
            },
          ],
          selectFields: [
            ` units.total_units AS total_units_sold`,
            `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
            `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
          ],
          table: `privy_stack_orders_${ot.type} orders, privy_stack_units_${ot.type} units`,
        });
        return { order_type: ot.type, ...results[0] };
      })
    );

    const { results: leadSales } = await readRecordNewForLead({
      withQueries: [
        {
          name: "filtered_orders",
          query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON od.order_id = sop.order_id
  JOIN users_details ud ON ud.user_id = od.user_id
  JOIN lead_source ls ON ls.source_id = ud.primary_lead_source
  WHERE sop.order_type = 'New'
    AND ls.source_group != 5  -- Exclude Referral
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
        {
          name: "unit_count",
          query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON sop.order_id = od.order_id
  JOIN users_details ud ON ud.user_id = od.user_id
  JOIN lead_source ls ON ls.source_id = ud.primary_lead_source
  WHERE sop.order_type = 'New'
    AND ls.source_group != 5
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
      ],
      selectFields: [
        ` units.total_units AS total_units_sold`,
        `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
        `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
      ],
      table: `filtered_orders orders, unit_count units`,
    });

    const { results: referralSales } = await readRecordNewForLead({
      withQueries: [
        {
          name: "filtered_orders",
          query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON od.order_id = sop.order_id
  JOIN users_details ud ON ud.user_id = od.user_id
  JOIN lead_source ls ON ls.source_id = ud.primary_lead_source
  WHERE sop.order_type = 'New'
    AND ls.source_group = 5  -- Include Only Referral
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
        {
          name: "unit_count",
          query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON sop.order_id = od.order_id
  JOIN users_details ud ON ud.user_id = od.user_id
  JOIN lead_source ls ON ls.source_id = ud.primary_lead_source
  WHERE sop.order_type = 'New'
    AND ls.source_group = 5
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
        },
      ],
      selectFields: [
        ` units.total_units AS total_units_sold`,
        `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
        `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
      ],
      table: `filtered_orders orders, unit_count units`,
    });

    const orderTypeMapping = [
      { name: "ocr", type: "OCR" },
      { name: "renewal", type: "Renewal" },
      { name: "upgrade", type: "Upgrade" },
    ];
    const salesByOrderType = await Promise.all(
      orderTypeMapping.map(async (ot) => {
        const { results } = await readRecordNewForLead({
          withQueries: [
            {
              name: `${ot.name}_filtered_orders`,
              query: `SELECT DISTINCT od.order_id, (sop.paid_amount + sop.balance_amount) as order_paid_amount
  FROM order_details od
  JOIN sub_orders_programs sop ON od.order_id = sop.order_id
  WHERE sop.order_type = '${ot.type}'
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
            },
            {
              name: `${ot.name}_unit_count`,
              query: `SELECT COUNT(*) AS total_units
  FROM sub_orders_programs sop
  JOIN order_details od ON sop.order_id = od.order_id
  WHERE sop.order_type = '${ot.type}'
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
            },
          ],
          selectFields: [
            ` units.total_units AS total_units_sold`,
            `CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) AS total_revenue`,
            `ROUND(CAST(SUM(orders.order_paid_amount) AS DECIMAL(18,2)) / units.total_units, 2) AS avg_revenue_per_unit`,
          ],
          table: `${ot.name}_filtered_orders orders, ${ot.name}_unit_count units`,
        });
        return { order_type: ot.type, ...results[0] };
      })
    );
    // Calculate ocr, renewal, and upgrade first
    const ocrSale =
      salesByOrderType.find((ot) => ot.order_type === "OCR") || {};
    const renewalSale =
      salesByOrderType.find((ot) => ot.order_type === "Renewal") || {};
    const upgradeSale =
      salesByOrderType.find((ot) => ot.order_type === "Upgrade") || {};

    const totalUnitsSold =
      Number(leadSales[0]?.total_units_sold || 0) +
      Number(referralSales[0]?.total_units_sold || 0) +
      Number(ocrSale.total_units_sold || 0) +
      Number(renewalSale.total_units_sold || 0) +
      Number(upgradeSale.total_units_sold || 0);

    const totalRevenue =
      Number(leadSales[0]?.total_revenue || 0) +
      Number(referralSales[0]?.total_revenue || 0) +
      Number(ocrSale.total_revenue || 0) +
      Number(renewalSale.total_revenue || 0) +
      Number(upgradeSale.total_revenue || 0);

    const avgRevenuePerUnit =
      totalUnitsSold > 0 ? (totalRevenue / totalUnitsSold).toFixed(2) : "0.00";

    const data = {
      special_stack_sale: {
        total: {
          total_units_sold: specialStackSales[0]?.total_units_sold || 0,
          total_revenue: specialStackSales[0]?.total_revenue || 0,
          avg_revenue_per_unit: specialStackSales[0]?.avg_revenue_per_unit || 0,
        },
        renewal: {
          ...specialStackByOrderType.find((ot) => ot.order_type === "Renewal"),
        },
        new_sale: {
          ...specialStackByOrderType.find((ot) => ot.order_type === "New"),
        },
      },
      basis_stack_sale: {
        total: {
          total_units_sold: basicStackSales[0]?.total_units_sold || 0,
          total_revenue: basicStackSales[0]?.total_revenue || 0,
          avg_revenue_per_unit: basicStackSales[0]?.avg_revenue_per_unit || 0,
        },
      },
      privy_stack_sale: {
        total: {
          total_units_sold: privyStackSales[0]?.total_units_sold || 0,
          total_revenue: privyStackSales[0]?.total_revenue || 0,
          avg_revenue_per_unit: privyStackSales[0]?.avg_revenue_per_unit || 0,
        },
        renewal: {
          ...privyStackByOrderType.find((ot) => ot.order_type === "Renewal"),
        },
        new_sale: {
          ...privyStackByOrderType.find((ot) => ot.order_type === "New"),
        },
      },
      lead_sale: {
        ...leadSales[0],
      },
      referral_sale: {
        ...referralSales[0],
      },
      ocr_sale: ocrSale,
      renewal_sale: renewalSale,
      upgrade_sale: upgradeSale,
      total: {
        total_units_sold: totalUnitsSold,
        total_revenue: totalRevenue.toFixed(2),
        avg_revenue_per_unit: avgRevenuePerUnit,
      },
    };

    if (is_export && is_export === "true") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Financial Yearly Sales Breakdown");

      // Helper for styling rows
      const boldCenter = { bold: true, size: 12 };
      const centerAlign = { vertical: "middle", horizontal: "center" };

      // Add Title Row
      sheet.addRow([]);
      sheet.addRow([
        "Particular",
        `Total Revenue Sale (FY: ${moment(startDate).format("YY")}-${moment(
          endDate
        ).format("YY")})`,
        "",
        "",
      ]);
      sheet.mergeCells("B2:D2");
      sheet.getRow(2).font = boldCenter;
      sheet.getRow(2).alignment = centerAlign;

      // Subheader row
      sheet.addRow(["", "Unit", "Amount", "Average"]).font = { bold: true };

      // === Total SS Sale ===
      sheet.addRow([
        "Total SS Sale",
        data.special_stack_sale.total.total_units_sold,
        data.special_stack_sale.total.total_revenue,
        data.special_stack_sale.total.avg_revenue_per_unit,
      ]).font = { bold: true };

      sheet.addRow([
        "Renewal",
        data.special_stack_sale.renewal.total_units_sold || 0,
        data.special_stack_sale.renewal.total_revenue || 0,
        data.special_stack_sale.renewal.avg_revenue_per_unit || 0,
      ]);

      sheet.addRow([
        "New Sale (Lead & Ref)",
        data.special_stack_sale.new_sale.total_units_sold || 0,
        data.special_stack_sale.new_sale.total_revenue || 0,
        data.special_stack_sale.new_sale.avg_revenue_per_unit || 0,
      ]);

      sheet.addRow([]);

      // === Total BS Sale ===
      sheet.addRow([
        "Total BS Sale",
        data.basis_stack_sale.total.total_units_sold,
        data.basis_stack_sale.total.total_revenue,
        data.basis_stack_sale.total.avg_revenue_per_unit,
      ]).font = { bold: true };

      sheet.addRow([]);

      // === Total Privy Stack Sale ===
      sheet.addRow([
        "Total Privy Stack Sale",
        data.privy_stack_sale.total.total_units_sold,
        data.privy_stack_sale.total.total_revenue,
        data.privy_stack_sale.total.avg_revenue_per_unit,
      ]).font = { bold: true };

      sheet.addRow([
        "Renewal",
        data.privy_stack_sale.renewal.total_units_sold || 0,
        data.privy_stack_sale.renewal.total_revenue || 0,
        data.privy_stack_sale.renewal.avg_revenue_per_unit || 0,
      ]);

      sheet.addRow([
        "New Sale (Lead & Ref)",
        data.privy_stack_sale.new_sale.total_units_sold || 0,
        data.privy_stack_sale.new_sale.total_revenue || 0,
        data.privy_stack_sale.new_sale.avg_revenue_per_unit || 0,
      ]);

      // === Part 2 Section ===
      sheet.addRow([]);
      sheet.addRow(["Part 2"]).font = boldCenter;
      sheet.addRow([]);

      sheet.addRow([
        "",
        `Total Revenue Sale (FY: ${moment(startDate).format("YY")}-${moment(
          endDate
        ).format("YY")})`,
        "",
        "",
      ]);
      sheet.mergeCells(`B${sheet.lastRow.number}:D${sheet.lastRow.number}`);
      sheet.getRow(sheet.lastRow.number).font = boldCenter;
      sheet.getRow(sheet.lastRow.number).alignment = centerAlign;

      sheet.addRow(["", "Unit", "Amount", "Average"]).font = { bold: true };

      sheet.addRow([
        "LEAD Sale",
        data.lead_sale.total_units_sold,
        data.lead_sale.total_revenue,
        data.lead_sale.avg_revenue_per_unit,
      ]);

      sheet.addRow([
        "Referral Sale",
        data.referral_sale.total_units_sold,
        data.referral_sale.total_revenue,
        data.referral_sale.avg_revenue_per_unit,
      ]);

      sheet.addRow([
        "OCR Sale",
        data.ocr_sale.total_units_sold || 0,
        data.ocr_sale.total_revenue || 0,
        data.ocr_sale.avg_revenue_per_unit || 0,
      ]);

      sheet.addRow([
        "Renewal Sale",
        data.renewal_sale.total_units_sold || 0,
        data.renewal_sale.total_revenue || 0,
        data.renewal_sale.avg_revenue_per_unit || 0,
      ]);

      sheet.addRow([
        "Upgrade Sale",
        data.upgrade_sale.total_units_sold || 0,
        data.upgrade_sale.total_revenue || 0,
        data.upgrade_sale.avg_revenue_per_unit || 0,
      ]);

      sheet.addRow([]);

      // === Total Sales (Part 2) ===
      const totalUnits =
        (data.lead_sale.total_units_sold || 0) +
        (data.referral_sale.total_units_sold || 0) +
        (data.ocr_sale.total_units_sold || 0) +
        (data.renewal_sale.total_units_sold || 0) +
        (data.upgrade_sale.total_units_sold || 0);

      let totalRevenue = 0;
      totalRevenue += Number(data.lead_sale.total_revenue || 0);
      totalRevenue += Number(data.referral_sale.total_revenue || 0);
      totalRevenue += Number(data.ocr_sale.total_revenue || 0);
      totalRevenue += Number(data.renewal_sale.total_revenue || 0);
      totalRevenue += Number(data.upgrade_sale.total_revenue || 0);

      const avgRevenuePerUnit =
        totalUnits > 0 ? (totalRevenue / totalUnits).toFixed(2) : 0;

      sheet.addRow([
        "Total Sale",
        totalUnits,
        totalRevenue,
        avgRevenuePerUnit,
      ]).font = { bold: true };

      // Auto-fit columns
      sheet.columns.forEach((col) => {
        let max = 0;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const val = cell.value ? cell.value.toString() : "";
          max = Math.max(max, val.length);
        });
        col.width = max < 12 ? 12 : max + 2;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=financial_yearly_sales_breakdown.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      return res.send(buffer);
    }

    const apiResponse = new ApiResponse({
      message: "Financial yearly sales breakdown fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getFinancialYearlySalesBreakdown:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentorRevenueBreakup = async (req, res, next) => {
  try {
    let { start_date: startDate, end_date: endDate, is_export } = req.query;
    const today = moment();
    if (!startDate && !endDate) {
      if (today.month() >= 3 && !startDate) {
        // April (3) or later
        startDate = moment({ year: today.year(), month: 3, day: 1 }); // April 1 of current year
      } else {
        startDate = moment({ year: today.year() - 1, month: 3, day: 1 }); // April 1 of previous year
      }
      if (!endDate) {
        endDate = startDate.clone().add(1, "year").subtract(1, "day");
      }
      startDate = startDate.format("YYYY-MM-DD");
      endDate = endDate.format("YYYY-MM-DD");
    }
    const { results: totalMentorSales } = await readRecord({
      selectFields: [
        "DATE_FORMAT(od.order_date, '%Y-%m') AS order_month",
        "COUNT(DISTINCT CASE WHEN od.order_type IN ('New','OCR','Renewal','Upgrade') THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END) AS total_units",
        "SUM( CASE WHEN od.order_paid_amount THEN od.order_paid_amount ELSE 0 END) AS total_revenue",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} au`,
          on: `od.sale_by = au.admin_user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: `od.order_id = sop.order_id`,
        },
      ],
      conditions: [
        { field: "au.role_id", operator: "=", value: 1 },
        {
          field: "od.order_date",
          operator: "BETWEEN",
          value: [startDate, endDate],
        },
      ],
      groupBy: ["DATE_FORMAT(od.order_date, '%Y-%m')"],
      orderBy: ["order_month ASC"],
    });
    const { results: totalMentorSalesCategoryWise } =
      await readRecordNewForLead({
        withQueries: [
          {
            name: "order_data",
            query: `SELECT
    od.order_id,
    DATE_FORMAT(od.order_date, '%Y-%m') AS order_month,
    od.order_paid_amount,
    od.order_type,
    au.admin_user_id,
    au.role_id,
    ud.primary_lead_source,
    ls.source_group,
    sop.sub_order_id
  FROM order_details od
  JOIN admin_users au ON au.admin_user_id = od.sale_by
  LEFT JOIN users_details ud ON ud.user_id = od.user_id
  LEFT JOIN lead_source ls ON ls.source_id = ud.primary_lead_source
  LEFT JOIN sub_orders_programs sop ON sop.order_id = od.order_id
  WHERE au.role_id = 1
    AND od.order_date BETWEEN '${startDate}' AND '${endDate}'`,
          },
        ],
        selectFields: [
          `order_month`,

          //  -- Lead Orders (non-referral)
          `COUNT(DISTINCT CASE 
    WHEN order_type = 'New' AND (source_group IS NULL OR source_group != 5)
    THEN CONCAT(order_id, '-', sub_order_id)
  END) AS lead_units`,

          `SUM(CASE 
    WHEN order_type = 'New' AND (source_group IS NULL OR source_group != 5)
    THEN IFNULL(order_paid_amount, 0)
    ELSE 0
  END) AS leads_revenue`,

          //  -- Referral Orders
          `COUNT(DISTINCT CASE 
    WHEN order_type = 'New' AND source_group = 5
    THEN CONCAT(order_id, '-', sub_order_id)
  END) AS referral_units`,

          `SUM(CASE 
    WHEN order_type = 'New' AND source_group = 5
    THEN IFNULL(order_paid_amount, 0)
    ELSE 0
  END) AS referral_revenue`,

          //  -- OCR Orders
          `COUNT(DISTINCT CASE 
    WHEN order_type = 'OCR'
    THEN CONCAT(order_id, '-', sub_order_id)
  END) AS ocr_units`,

          `SUM(CASE 
    WHEN order_type = 'OCR'
    THEN IFNULL(order_paid_amount, 0)
    ELSE 0
  END) AS ocr_revenue`,

          //  -- Renewal and Upgrade Orders
          `COUNT(DISTINCT CASE 
    WHEN order_type IN ('Renewal', 'Upgrade')
    THEN CONCAT(order_id, '-', sub_order_id)
  END) AS renewal_upgrade_units`,

          `SUM(CASE 
    WHEN order_type IN ('Renewal', 'Upgrade')
    THEN IFNULL(order_paid_amount, 0)
    ELSE 0
  END) AS renewal_upgrade_revenue`,
        ],
        table: `order_data`,
        groupBy: ["order_month"],
        orderBy: ["order_month ASC"],
      });
    const data = {};
    totalMentorSales.map((item) => {
      data[item.order_month] = {
        total_sales: {
          units: item.total_units,
          revenue: item.total_revenue,
        },
      };
    });
    totalMentorSalesCategoryWise.map((item) => {
      data[item.order_month] = {
        ...data[item.order_month],
        lead_sales: {
          units: item.lead_units || 0,
          revenue: item.leads_revenue || 0,
        },
        referral_sales: {
          units: item.referral_units || 0,
          revenue: item.referral_revenue || 0,
        },
        ocr_sales: {
          units: item.ocr_units || 0,

          revenue: item.ocr_revenue || 0,
        },
        renewal_upgrade_sales: {
          units: item.renewal_upgrade_units || 0,
          revenue: item.renewal_upgrade_revenue || 0,
        },
      };
    });
    if (is_export && is_export === "true") {
      async function generateMentorSalesReport(data) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Mentor Sales Report");

        // Add padding rows
        sheet.addRow([]);
        sheet.addRow([]);

        // Top Header Row
        const headerRow = sheet.addRow([
          "Sr. no",
          "Month",
          "Sales Figure Units",
          "Sales Figure Amounts",
          "Lead Units",
          "Lead Amounts",
          "Referral Units",
          "Referral Amounts",
          "OCR Units",
          "OCR Amounts",
          "Renewal+Upgrade Units",
          "Renewal+Upgrade Amounts",
        ]);

        // Merge for Mentor Sales + Category Wise
        sheet.mergeCells("C3:D3"); // Sales Figure
        sheet.mergeCells("E3:F3"); // Lead
        sheet.mergeCells("G3:H3"); // Referral
        sheet.mergeCells("I3:J3"); // OCR
        sheet.mergeCells("K3:L3"); // Renewal + Upgrade

        // Apply style
        headerRow.font = { bold: true, size: 12 };
        headerRow.alignment = { vertical: "middle", horizontal: "center" };

        // Subheaders
        sheet.addRow([
          "",
          "",
          "Units",
          "Amounts",
          "Units",
          "Amounts",
          "Units",
          "Amounts",
          "Units",
          "Amounts",
          "Units",
          "Amounts",
        ]).font = { bold: true };

        // Fill Data
        let i = 1;
        Object.entries(data).forEach(([month, d]) => {
          sheet.addRow([
            i,
            month,
            d.total_sales.units,
            d.total_sales.revenue,
            d.lead_sales.units,
            d.lead_sales.revenue,
            d.referral_sales.units,
            d.referral_sales.revenue,
            d.ocr_sales.units,
            d.ocr_sales.revenue,
            d.renewal_upgrade_sales.units,
            d.renewal_upgrade_sales.revenue,
          ]);
          i++;
        });

        // Autofit columns
        sheet.columns.forEach((col) => {
          let maxLength = 0;
          col.eachCell({ includeEmpty: true }, (cell) => {
            const val = cell.value ? cell.value.toString() : "";
            maxLength = Math.max(maxLength, val.length);
          });
          col.width = maxLength < 12 ? 12 : maxLength + 2;
        });

        return workbook;
      }

      const workbook = await generateMentorSalesReport(data);
      const buffer = await workbook.xlsx.writeBuffer();

      return res
        .status(200)
        .header(
          "Content-Disposition",
          'attachment; filename="MentorSalesReport.xlsx"'
        )
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .send(buffer);
    }

    const apiResponse = new ApiResponse({
      message: "Mentor Financial yearly sales summary fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getMentorFinancialYearSalesSummary:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function formatMonthYear(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 1 → 01
  const year = String(date.getFullYear()).slice(-2); // 2025 → 25
  return `${month}-${year}`;
}

function getMonthsArray(start_date, end_date) {
  const start = new Date(start_date);
  const end = new Date(end_date);
  const result = [];

  const current = new Date(start);

  while (current <= end) {
    result.push(formatMonthYear(current));
    current.setMonth(current.getMonth() + 1);
  }

  return result;
}

const getSalesDataReport = async (req, res, next) => {
  try {
    let { start_date, end_date, is_export } = req.query;

    const conditions = [
      { field: "adr.report_name", operator: "=", value: "sales data report" },
    ];

    let period = [];
    const start = new Date(start_date);
    const end = new Date(end_date);

    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = start.getMonth();
    const endMonth = end.getMonth();

    // Financial Year (Apr 1 – Mar 31)
    if (
      startMonth === 3 &&
      start.getDate() === 1 &&
      endMonth === 2 &&
      end.getDate() === 31 &&
      endYear - startYear === 1
    ) {
      // return { type: "Financial Year", months:
      period = getMonthsArray(start, end);
    }

    // This Year (Jan 1 – Dec 31 same year)
    if (
      startMonth === 0 &&
      start.getDate() === 1 &&
      endMonth === 11 &&
      end.getDate() === 31 &&
      startYear === endYear
    ) {
      // return { type: "This Year", months:
      period = getMonthsArray(start, end);
    }

    // This Quarter
    const diffInMonths =
      (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    if (diffInMonths === 3 && start.getDate() === 1) {
      // return { type: "This Quarter", months:
      period = getMonthsArray(start, end);
    }

    // This Month
    if (diffInMonths === 1 && start.getDate() === 1) {
      // return { type: "This Month", months:
      period = getMonthsArray(start, end);
    }
    console.log(period);

    if (!start_date || !end_date) {
    } else {
      conditions.push({ field: "adr.month", operator: "IN", value: period });
    }

    const { results } = await readRecord({
      selectFields: [
        "*",
        "DATE_FORMAT(STR_TO_DATE(adr.month, '%m-%y'), '%b %Y') AS month",
      ],
      table: `${tables.accountsDashboardReports} adr`,
      conditions,
      orderBy: ["STR_TO_DATE(adr.month, '%m-%y') ASC"],
    });
    const finalData = results.map((item) => {
      return { ...item, report_data: safeJSONParse(item.report_data) };
    });
    if (is_export && is_export === "true") {
      async function generateSalesReport(dataArray) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Sales Data Report");

        // --- Header Rows ---
        worksheet.mergeCells("A1:A2");
        worksheet.getCell("A1").value = "Year";
        worksheet.mergeCells("B1:B2");
        worksheet.getCell("B1").value = "Month";
        worksheet.mergeCells("C1:C2");
        worksheet.getCell("C1").value = "Overall Leads";
        worksheet.mergeCells("D1:D2");
        worksheet.getCell("D1").value = "Relavent Leads";

        worksheet.mergeCells("E1:H1");
        worksheet.getCell("E1").value = "Total New / Upgrade Sale (lead)";
        worksheet.getRow(2).values = [
          "",
          "",
          "OL",
          "RL",
          "Units",
          "OL %age",
          "RL %age",
          "Amount",
        ];

        worksheet.mergeCells("I1:K1");
        worksheet.getCell("I1").value = "REFERRALS";
        worksheet.getCell("I2").value = "Units";
        worksheet.getCell("J2").value = "%age of Cl. Base";
        worksheet.getCell("K2").value = "Amount";

        worksheet.mergeCells("L1:Q1");
        worksheet.getCell("L1").value = "Renewals (Overall)";
        worksheet.getRow(2).getCell("L").value = "Overall expiries";
        worksheet.getRow(2).getCell("M").value = "Advance Purchase";
        worksheet.getRow(2).getCell("N").value = "Actual Expiry";
        worksheet.getRow(2).getCell("O").value = "Units";
        worksheet.getRow(2).getCell("P").value = "%age";
        worksheet.getRow(2).getCell("Q").value = "Amount";

        worksheet.mergeCells("S1:U1");
        worksheet.getCell("S1").value = "OCR (OMR)";
        worksheet.getRow(2).getCell("R").value = "OC total base";
        worksheet.getRow(2).getCell("S").value = "Units";
        worksheet.getRow(2).getCell("T").value = "%age of CL.base";
        worksheet.getRow(2).getCell("U").value = "Amount";

        worksheet.mergeCells("V1:V2");
        worksheet.getCell("V1").value = "Act. Cl. base";

        worksheet.mergeCells("W1:X1");
        worksheet.getCell("W1").value = "Upgrade";
        worksheet.getCell("W2").value = "Units";
        worksheet.getCell("X2").value = "Amount";

        worksheet.mergeCells("Y1:Z1");
        worksheet.getCell("Y1").value = "Total sales (ALL)";
        worksheet.getCell("Y2").value = "Units";
        worksheet.getCell("Z2").value = "Amount";

        worksheet.mergeCells("AA1:AA2");
        worksheet.getCell("AA1").value = "Total of new+ Ref+OCR";

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(2).font = { bold: true };

        // --- Data Rows ---
        dataArray.forEach((i) => {
          const d = i.report_data;

          worksheet.addRow([
            d.year,
            i.month,
            d.overall_leads,
            d.relevant_leads,
            d.total_new_upgrade_sale.ol_units,
            d.total_new_upgrade_sale.ol_percentage + "%",
            d.total_new_upgrade_sale.rl_percentage + "%",
            d.total_new_upgrade_sale.amount,
            d.referrals.units,
            d.referrals.percentage_of_client_base + "%",
            d.referrals.amount,
            d.renewals.overall_expiries,
            d.renewals.advance_purchase,
            d.renewals.actual_expiry,
            d.renewals.units,
            d.renewals.percentage + "%",
            d.renewals.amount,
            d.ocr.oc_total_base,
            d.ocr.units,
            d.ocr.percentage_of_client_base + "%",
            d.ocr.amount,
            d.actual_client_base,
            d.upgrade.units,
            d.upgrade.amount,
            d.total_sales.units,
            d.total_sales.amount,
            d.total_new_ref_ocr,
          ]);
        });

        return workbook;
      }
      const workbook = await generateSalesReport(finalData);
      const buffer = await workbook.xlsx.writeBuffer();
      return res
        .status(200)
        .header(
          "Content-Disposition",
          'attachment; filename="SalesDataReport.xlsx"'
        )
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .send(buffer);
    }
    const apiResponse = new ApiResponse({
      message: "Sales Data Report fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getSalesDataReport:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getSalesDataComparison = async (req, res, next) => {
  try {
    let { start_date, end_date, is_export } = req.query;

    // -- 1. New vs Inside Sales (Renewal, OCR, Upgrade)
    const { results: newAndInsideSalesData } = await readRecord({
      selectFields: [
        `DATE_FORMAT(od.order_date, '%Y-%m') AS order_month`,

        // -- Units & Revenue for New orders only
        `COUNT(DISTINCT CASE 
                   WHEN sop.order_type = 'New' 
                   THEN CONCAT(sop.order_id, '-', sop.sub_order_id)
                 END) AS new_units`,
        `SUM(CASE 
        WHEN od.order_type = 'New' 
        THEN sop.paid_amount + sop.balance_amount
        ELSE 0 
      END) AS new_revenue`,

        // -- Units & Revenue for Accumulated orders (Renewal, OCR, Upgrade)
        `COUNT(DISTINCT CASE 
                   WHEN sop.order_type IN ('Renewal', 'OCR', 'Upgrade') 
                   THEN CONCAT(sop.order_id, '-', sop.sub_order_id)
                 END) AS inside_units`,
        `SUM(CASE 
        WHEN sop.order_type IN ('Renewal', 'OCR', 'Upgrade') 
        THEN sop.paid_amount + sop.balance_amount 
        ELSE 0 
      END) AS inside_revenue`,
      ],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "INNER",
          table: `${tables.orderDetails} od`,
          on: `od.order_id = sop.order_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} au`,
          on: `od.sale_by = au.admin_user_id`,
        },
      ],
      conditions: [
        {
          field: "date(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        },
      ],
      groupBy: ["DATE_FORMAT(od.order_date, '%Y-%m')"],
      orderBy: ["order_month ASC"],
    });
    const { results: teamWiseData } = await readRecord({
      selectFields: [
        `DATE_FORMAT(od.order_date, '%Y-%m') AS order_month`,

        //  -- Mentor team (role_id = 1)
        `COUNT(DISTINCT CASE WHEN au.role_id = 1 
                       THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END)
    AS mentor_units`,
        `SUM(CASE WHEN au.role_id = 1 THEN sop.paid_amount + sop.balance_amount ELSE 0 END)
    AS mentor_revenue`,

        //  -- Counsellor team (role_id = 2)
        `COUNT(DISTINCT CASE WHEN au.role_id = 2 
                       THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END)
    AS counsellor_units`,
        `SUM(CASE WHEN au.role_id = 2 THEN sop.paid_amount + sop.balance_amount ELSE 0 END)
    AS counsellor_revenue`,

        //  -- Other team (role_id NOT 1 AND NOT 2)
        `COUNT(DISTINCT CASE WHEN au.role_id NOT IN (1,2) 
                       THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END)
    AS other_units`,
        `  SUM(CASE WHEN au.role_id NOT IN (1,2) THEN sop.paid_amount + sop.balance_amount ELSE 0 END)
    AS other_revenue`,

        //  -- Total units + total revenue
        `COUNT(DISTINCT CONCAT(sop.order_id, '-', sop.sub_order_id)) AS total_units`,
        `SUM(sop.paid_amount + sop.balance_amount) AS total_revenue`,
      ],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "INNER",
          table: `${tables.orderDetails} od`,
          on: `od.order_id = sop.order_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} au`,
          on: `od.sale_by = au.admin_user_id`,
        },
      ],
      conditions: [
        {
          field: "date(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        },
      ],
      groupBy: ["DATE_FORMAT(od.order_date, '%Y-%m')"],
      orderBy: ["order_month ASC"],
    });
    const { results: categoryWiseData } = await readRecord({
      selectFields: [
        `DATE_FORMAT(od.order_date, '%Y-%m') AS order_month`,

        // -- 1. New (Non-referral)
        `COUNT(DISTINCT CASE
    WHEN sop.order_type = 'New' 
    THEN CONCAT(sop.order_id, '-', sop.sub_order_id) 
         AND (ls.source_group IS NULL OR ls.source_group != 5)
  END) AS lead_units`,

        `SUM(CASE
    WHEN sop.order_type = 'New' 
         AND (ls.source_group IS NULL OR ls.source_group != 5)
    THEN sop.paid_amount + sop.balance_amount
    ELSE 0
  END) AS lead_revenue`,

        //  -- 2. New (Referral)
        `COUNT(DISTINCT CASE
    WHEN sop.order_type = 'New' 
         AND ls.source_group = 5
    THEN CONCAT(sop.order_id, '-', sop.sub_order_id)
  END) AS referral_units`,

        `SUM(CASE
    WHEN sop.order_type = 'New' 
         AND ls.source_group = 5
    THEN sop.paid_amount + sop.balance_amount
    ELSE 0
  END) AS referral_revenue`,

        // -- 3. Renewal
        `COUNT(DISTINCT CASE
    WHEN sop.order_type = 'Renewal'
    THEN CONCAT(sop.order_id, '-', sop.sub_order_id)
  END) AS renewal_units`,

        `SUM(CASE
    WHEN sop.order_type = 'Renewal'
    THEN sop.paid_amount + sop.balance_amount
    ELSE 0
  END) AS renewal_revenue`,

        //  -- 4. OCR
        `COUNT(DISTINCT CASE
    WHEN sop.order_type = 'OCR'
    THEN CONCAT(sop.order_id, '-', sop.sub_order_id)
  END) AS ocr_units`,

        `SUM(CASE
    WHEN sop.order_type = 'OCR'
    THEN sop.paid_amount + sop.balance_amount
    ELSE 0
  END) AS ocr_revenue`,

        //  -- 5. Upgrade
        `COUNT(DISTINCT CASE
    WHEN sop.order_type = 'Upgrade'
    THEN CONCAT(sop.order_id, '-', sop.sub_order_id)
  END) AS upgrade_units`,

        `SUM(CASE
    WHEN sop.order_type = 'Upgrade'
    THEN sop.paid_amount + sop.balance_amount
    ELSE 0
  END) AS upgrade_revenue`,

        //  -- 6. Total (All units and revenue)
        `COUNT(DISTINCT CONCAT(sop.order_id, '-', sop.sub_order_id)) AS total_units`,
        `SUM(sop.paid_amount + sop.balance_amount) AS total_revenue`,
      ],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "INNER",
          table: `${tables.orderDetails} od`,
          on: `od.order_id = sop.order_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: `od.user_id = ud.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: `ls.source_id = ud.primary_lead_source`,
        },
      ],
      conditions: [
        {
          field: "date(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        },
      ],
      groupBy: ["DATE_FORMAT(od.order_date, '%Y-%m')"],
      orderBy: ["order_month ASC"],
    });
    const data = {};
    newAndInsideSalesData.map((item) => {
      const month = moment(item.order_month, "YYYY-MM").format("MMMM YYYY");
      data[month] = {
        new_sales: {
          units: item.new_units,
          revenue: item.new_revenue,
        },
        inside_sales: {
          units: item.inside_units,
          revenue: item.inside_revenue,
        },
      };
    });
    teamWiseData.map((item) => {
      const month = moment(item.order_month, "YYYY-MM").format("MMMM YYYY");
      data[month] = {
        ...data[month],
        counsellor_team_sale: {
          units: item.counsellor_units,
          revenue: item.counsellor_revenue,
        },
        mentor_team_sale: {
          units: item.mentor_units,
          revenue: item.mentor_revenue,
        },
        other_team_sale: {
          units: item.other_units,
          revenue: item.other_revenue,
        },
      };
    });
    categoryWiseData.map((item) => {
      const month = moment(item.order_month, "YYYY-MM").format("MMMM YYYY");
      data[month] = {
        ...data[month],
        lead_sale: {
          units: item.lead_units,
          revenue: item.lead_revenue,
        },
        referral_sale: {
          units: item.referral_units,
          revenue: item.referral_revenue,
        },
        renewal_sale: {
          units: item.renewal_units,
          revenue: item.renewal_revenue,
        },
        ocr_sale: {
          units: item.ocr_units,
          revenue: item.ocr_revenue,
        },
        upgrade_sale: {
          units: item.upgrade_units,
          revenue: item.upgrade_revenue,
        },
        total: {
          units: item.total_units,
          revenue: item.total_revenue,
        },
      };
    });
    if (is_export && is_export === "true") {
      async function generateReport(data) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Sales Data Comparison");

        // Padding
        sheet.addRow([]);
        sheet.addRow([]);

        // Top Header Row
        const headerRow = sheet.addRow([
          "Title",
          "New Sales vs Inside Sales",
          "",
          "",
          "",
          "Counsellor & Mentor Sale & Other",
          "",
          "",
          "",
          "",
          "",
          "Total Overall Sale",
          "",
          "Title",
          "Category Wise Sale",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "Total Overall Sale",
        ]);

        // Merge header groups
        sheet.mergeCells("B3:E3"); // New vs Inside Sales
        sheet.mergeCells("F3:K3"); // Counsellor & Mentor Sale & Other
        sheet.mergeCells("L3:M3"); // Total Overall Sale
        sheet.mergeCells("O3:X3"); // Category Wise Sale
        sheet.mergeCells("Y3:Z3"); // Total Overall Sale

        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: "middle", horizontal: "center" };

        // Second row with Units/Amounts labels
        sheet.addRow([
          "Month",
          "New Sales Units",
          "New Sales Amount",
          "Inside Sales Units",
          "Inside Sales Amount",
          "Counsellor Units",
          "Counsellor Amount",
          "Mentor Units",
          "Mentor Amount",
          "Other Units",
          "Other Amount",
          "Total Units",
          "Total Amount",
          "Month",
          "Lead Units",
          "Lead Amount",
          "Referral Units",
          "Referral Amount",
          "Renewal Units",
          "Renewal Amount",
          "OCR Units",
          "OCR Amount",
          "Upgrade Units",
          "Upgrade Amount",
          "Total Units",
          "Total Amount",
        ]).font = { bold: true };

        // Insert Data
        Object.entries(data).forEach(([month, d]) => {
          sheet.addRow([
            month,
            d.new_sales.units,
            d.new_sales.revenue,
            d.inside_sales.units,
            d.inside_sales.revenue,
            d.counsellor_team_sale.units,
            d.counsellor_team_sale.revenue,
            d.mentor_team_sale.units,
            d.mentor_team_sale.revenue,
            d.other_team_sale.units,
            d.other_team_sale.revenue,
            d.total.units,
            d.total.revenue,
            month,
            d.lead_sale.units,
            d.lead_sale.revenue,
            d.referral_sale.units,
            d.referral_sale.revenue,
            d.renewal_sale.units,
            d.renewal_sale.revenue,
            d.ocr_sale.units,
            d.ocr_sale.revenue,
            d.upgrade_sale.units,
            d.upgrade_sale.revenue,
            d.total.units,
            d.total.revenue,
          ]);
        });

        // Autofit columns
        sheet.columns.forEach((col) => {
          let maxLength = 0;
          col.eachCell({ includeEmpty: true }, (cell) => {
            const val = cell.value ? cell.value.toString() : "";
            maxLength = Math.max(maxLength, val.length);
          });
          col.width = maxLength < 15 ? 15 : maxLength + 2;
        });

        return workbook;
      }

      const workbook = await generateReport(data);
      const buffer = await workbook.xlsx.writeBuffer();

      return res
        .status(200)
        .header(
          "Content-Disposition",
          'attachment; filename="SalesComparison.xlsx"'
        )
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .send(buffer);
    }

    const apiResponse = new ApiResponse({
      message: "Sales data comparison fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in salesDataComparison:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProgramWiseSalesData = async (req, res, next) => {
  try {
    let {
      start_date: startDate,
      end_date: endDate,
      is_export = false,
    } = req.query;
    const today = moment();
    if (!startDate && !endDate) {
      if (today.month() >= 3 && !startDate) {
        // April (3) or later
        startDate = moment({ year: today.year(), month: 3, day: 1 }); // April 1 of current year
      } else {
        startDate = moment({ year: today.year() - 1, month: 3, day: 1 }); // April 1 of previous year
      }
      endDate = startDate.clone().add(1, "year").subtract(1, "day");
      startDate = startDate.format("YYYY-MM-DD");
      endDate = endDate.format("YYYY-MM-DD");
    }
    const selectFields = [
      "ag.program_name",

      // -- New Orders
      `COUNT(DISTINCT CASE WHEN od.order_type = 'New' THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END) AS new_units`,
      `SUM(CASE WHEN od.order_type = 'New' THEN od.order_paid_amount ELSE 0 END) AS new_revenue`,

      // -- Renewal Orders
      `COUNT(DISTINCT CASE WHEN od.order_type = 'Renewal' THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END) AS renewal_units`,
      `SUM(CASE WHEN od.order_type = 'Renewal' THEN od.order_paid_amount ELSE 0 END) AS renewal_revenue`,

      // -- OCR Orders
      `COUNT(DISTINCT CASE WHEN od.order_type = 'OCR' THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END) AS ocr_units`,
      `SUM(CASE WHEN od.order_type = 'OCR' THEN od.order_paid_amount ELSE 0 END) AS ocr_revenue`,

      // -- Upgrade Orders
      `COUNT(DISTINCT CASE WHEN od.order_type = 'Upgrade' THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END) AS upgrade_units`,
      `SUM(CASE WHEN od.order_type = 'Upgrade' THEN od.order_paid_amount ELSE 0 END) AS upgrade_revenue`,

      // -- Totals
      `COUNT(DISTINCT CASE WHEN od.order_type IN ('New','Renewal','OCR','Upgrade') THEN CONCAT(sop.order_id, '-', sop.sub_order_id) END) AS total_units`,
      `SUM(CASE WHEN od.order_type IN ('New','Renewal','OCR','Upgrade') THEN od.order_paid_amount ELSE 0 END) AS total_revenue`,
    ];

    const joins = [
      {
        type: "INNER",
        table: `${tables.orderDetails} od`,
        on: `sop.order_id = od.order_id`,
      },
      {
        type: "INNER",
        table: `${tables.all_programs_grouped} ag`,
        on: `FIND_IN_SET(sop.program_id, ag.program_ids) > 0`,
      },
    ];
    const conditions = [
      {
        field: "od.order_date",
        operator: "BETWEEN",
        value: [startDate, endDate],
      },
    ];
    const { results: allProgramWiseSalesData } = await readRecord({
      selectFields,
      table: `${tables.subOrderPrograms} sop`,
      joins,
      conditions,
      groupBy: ["ag.program_name"],
      orderBy: ["ag.program_name ASC"],
    });
    const { results: cleanseProgramWiseSalesData } = await readRecord({
      selectFields,
      table: `${tables.subOrderPrograms} sop`,
      joins,
      conditions: [
        ...conditions,
        {
          field: "ag.program_name",
          operator: "IN",
          value: [
            "FLAT STOMACH CLEANSE",
            "WEIGHT LOSS CLEANSE",
            "POST FESTIVE DETOX CLEANSE",
            "SUGAR DETOX CLEANSE",
            "ACIDITY CORRECTION CLEANSE",
            "CONSTIPATION CORRECTION CLEANSE",
            "IMMUNE BOOSTING CLEANSE",
            "GUT RESET DETOX CLEANSE",
          ],
        },
      ],
      groupBy: ["ag.program_name"],
      orderBy: ["ag.program_name ASC"],
    });

    const { results: specialProgramWiseSalesData } = await readRecord({
      selectFields,
      table: `${tables.subOrderPrograms} sop`,
      joins,
      conditions: [
        ...conditions,
        {
          field: "ag.program_name",
          operator: "NOT IN",
          value: [
            "FLAT STOMACH CLEANSE",
            "WEIGHT LOSS CLEANSE",
            "POST FESTIVE DETOX CLEANSE",
            "SUGAR DETOX CLEANSE",
            "ACIDITY CORRECTION CLEANSE",
            "CONSTIPATION CORRECTION CLEANSE",
            "IMMUNE BOOSTING CLEANSE",
            "GUT RESET DETOX CLEANSE",
          ],
        },
      ],
      groupBy: ["ag.program_name"],
      orderBy: ["ag.program_name ASC"],
    });
    const fields = [
      "new_units",
      "new_revenue",
      "renewal_units",
      "renewal_revenue",
      "ocr_units",
      "ocr_revenue",
      "upgrade_units",
      "upgrade_revenue",
      "total_units",
      "total_revenue",
    ];

    // Helper to sum values from an array of objects for the specified fields
    function getTotals(array) {
      return fields.reduce((totals, field) => {
        totals[field] = array.reduce((sum, item) => {
          const val = parseFloat(item[field]) || 0;
          return sum + val;
        }, 0);
        return totals;
      }, {});
    }

    // 1. All Programs Total
    const allProgramsTotal = {
      program_name: "Total",
      ...getTotals(allProgramWiseSalesData),
    };

    const allProgramsWithTotal = [...allProgramWiseSalesData, allProgramsTotal];

    // 2. Cleanse Programs Total
    const cleanseProgramsTotal = {
      program_name: "Total Cleanse Programs Sales",
      ...getTotals(cleanseProgramWiseSalesData),
    };

    const cleanseProgramsWithTotal = [
      ...cleanseProgramWiseSalesData,
      cleanseProgramsTotal,
    ];

    const specialProgramsTotal = {
      program_name: "Total Special Programs Sales",
      ...getTotals(specialProgramWiseSalesData),
    };

    const specialProgramsWithTotal = [
      ...specialProgramWiseSalesData,
      specialProgramsTotal,
    ];

    // fields.forEach((field) => {
    //   specialProgramsTotal[field] =
    //     allProgramsTotal[field] - cleanseProgramsTotal[field];
    // });

    const data = {
      all_programs: allProgramsWithTotal,
      cleanse_programs: cleanseProgramsWithTotal,
      special_programs: specialProgramsWithTotal,
    };

    console.log(is_export, 3830);
    // console.log(Boolean(is_export), 3831);
    if (is_export === "true") {
      async function generateReport(data) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Program Wise Data");

        // Small padding row
        sheet.addRow([]);
        sheet.addRow([]);

        // Section Heading
        const titleRow = sheet.addRow([
          "",
          "Program Wise Data",
          `Total Revenue Sale (${startDate} - ${endDate})`,
        ]);
        titleRow.font = { bold: true, size: 14 };

        sheet.addRow([]);

        // Table Header
        const headerRow = sheet.addRow([
          "",
          "Program Name",
          "Total Unit",
          "Total Amount",
          "Renewal Unit",
          "Renewal Amount",
          "Lead & Ref Unit",
          "Lead & Ref Amount",
          "OCR Unit",
          "OCR Amount",
          "Upgrade Unit",
          "Upgrade Amount",
        ]);
        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: "middle", horizontal: "center" };

        // ===== ALL PROGRAMS =====
        data.all_programs.forEach((p) => {
          if (p.program_name.toLowerCase() === "total") return; // Skip total row, will add separately
          sheet.addRow([
            "",
            p.program_name,
            p.total_units,
            p.total_revenue,
            p.renewal_units,
            p.renewal_revenue,
            p.new_units,
            p.new_revenue,
            p.ocr_units,
            p.ocr_revenue,
            p.upgrade_units,
            p.upgrade_revenue,
          ]);
        });
        // Add Totals Row for All Programs
        const allProgramsTotal = data.all_programs.find(
          (p) => p.program_name.toLowerCase() === "total"
        );
        if (allProgramsTotal) {
          sheet.addRow([]);
          const totalRow = sheet.addRow([
            "",
            allProgramsTotal.program_name,
            allProgramsTotal.total_units,
            allProgramsTotal.total_revenue,
            allProgramsTotal.renewal_units,
            allProgramsTotal.renewal_revenue,
            allProgramsTotal.new_units,
            allProgramsTotal.new_revenue,
            allProgramsTotal.ocr_units,
            allProgramsTotal.ocr_revenue,
            allProgramsTotal.upgrade_units,
            allProgramsTotal.upgrade_revenue,
          ]);
          totalRow.font = { bold: true };
        }
        sheet.addRow([]);
        sheet.addRow([]);

        // ===== CLEANSE PROGRAMS =====
        const cleanseHeader = sheet.addRow(["", "Cleanse Programs"]);
        cleanseHeader.font = { bold: true, size: 13 };
        sheet.addRow([]);

        data.cleanse_programs.forEach((p, index) => {
          if (index === data.cleanse_programs.length - 1) return; // Skip last total row, will add separately
          sheet.addRow([
            "",
            p.program_name,
            p.total_units,
            p.total_revenue,
            p.renewal_units,
            p.renewal_revenue,
            p.new_units,
            p.new_revenue,
            p.ocr_units,
            p.ocr_revenue,
            p.upgrade_units,
            p.upgrade_revenue,
          ]);
        });

        // Add Totals Row for Cleanse
        const cleanseTotal = data.cleanse_programs.find((p) =>
          p.program_name.toLowerCase().includes("total cleanse")
        );
        if (cleanseTotal) {
          sheet.addRow([]);
          const totalRow = sheet.addRow([
            "",
            cleanseTotal.program_name,
            cleanseTotal.total_units,
            cleanseTotal.total_revenue,
            cleanseTotal.renewal_units,
            cleanseTotal.renewal_revenue,
            cleanseTotal.new_units,
            cleanseTotal.new_revenue,
            cleanseTotal.ocr_units,
            cleanseTotal.ocr_revenue,
            cleanseTotal.upgrade_units,
            cleanseTotal.upgrade_revenue,
          ]);
          totalRow.font = { bold: true };
        }

        sheet.addRow([]);
        sheet.addRow([]);

        // ===== SPECIAL PROGRAMS =====
        const ssHeader = sheet.addRow(["", "Special Programs"]);
        ssHeader.font = { bold: true, size: 13 };
        sheet.addRow([]);

        data.special_programs.forEach((p, index) => {
          if (index === data.special_programs.length - 1) return; // skip last row (total), handle separately
          sheet.addRow([
            "",
            p.program_name,
            p.total_units,
            p.total_revenue,
            p.renewal_units,
            p.renewal_revenue,
            p.new_units,
            p.new_revenue,
            p.ocr_units,
            p.ocr_revenue,
            p.upgrade_units,
            p.upgrade_revenue,
          ]);
        });

        // Add Total Row
        const ssTotal = data.special_programs.find((p) =>
          p.program_name.toLowerCase().includes("total special")
        );
        if (ssTotal) {
          sheet.addRow([]);
          const totalRow = sheet.addRow([
            "",
            ssTotal.program_name,
            ssTotal.total_units,
            ssTotal.total_revenue,
            ssTotal.renewal_units,
            ssTotal.renewal_revenue,
            ssTotal.new_units,
            ssTotal.new_revenue,
            ssTotal.ocr_units,
            ssTotal.ocr_revenue,
            ssTotal.upgrade_units,
            ssTotal.upgrade_revenue,
          ]);
          totalRow.font = { bold: true };
        }

        // Auto column width
        sheet.columns.forEach((col) => {
          let maxLength = 0;
          col.eachCell({ includeEmpty: true }, (cell) => {
            const val = cell.value ? cell.value.toString() : "";
            maxLength = Math.max(maxLength, val.length);
          });
          col.width = maxLength < 15 ? 15 : maxLength + 2;
        });

        return workbook;
      }

      // ✅ export
      const workbook = await generateReport(data);
      const buffer = await workbook.xlsx.writeBuffer();

      return res
        .status(200)
        .header(
          "Content-Disposition",
          'attachment; filename="ProgramWiseReport.xlsx"'
        )
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .send(buffer);
    }

    const apiResponse = new ApiResponse({
      message: "Program wise sales data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getProgramWiseSalesData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function getOrderTransitionCount({
  startDate,
  endDate,
  isCurrentSpecial,
  currentOrderType,
  previousOrderType,
  isPreviousSpecial,
  checkPreviousCleanse = false,
  checkCurrentCleanse = false,
  prevCleanseFilterType = "", // NEW
  currCleanseFilterType = "", // NEW
}) {
  try {
    const cleansePrograms = [
      "FLAT STOMACH CLEANSE",
      "WEIGHT LOSS CLEANSE",
      "POST FESTIVE DETOX CLEANSE",
      "SUGAR DETOX CLEANSE",
      "ACIDITY CORRECTION CLEANSE",
      "CONSTIPATION CORRECTION CLEANSE",
      "IMMUNE BOOSTING CLEANSE",
      "GUT RESET DETOX CLEANSE",
    ];

    const cleanseIds = [117, 118, 161, 125, 126, 127, 128, 129, 130, 157];

    // 🔧 Dynamic cleanse condition generator
    const getCleanseCondition = (filterType) => {
      if (filterType === "name") {
        return `(pm.program_name IN ('${cleansePrograms.join("','")}'))`;
      } else if (filterType === "id") {
        return `(sop.program_id IN (${cleanseIds.join(",")}))`;
      } else {
        return `(pm.program_name IN ('${cleansePrograms.join(
          "','"
        )}') OR sop.program_id IN (${cleanseIds.join(",")}))`;
      }
    };

    // 🔄 Subquery generator
    const orderSubQuery = (alias, cleanseFilterType) => {
      const cleanseCondition = getCleanseCondition(cleanseFilterType);
      return `(
        SELECT
            od.order_id,
            od.user_id,
            od.order_date,
            MAX(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) AS is_special,
            MAX(CASE WHEN sop.program_type = 1 THEN 1 ELSE 0 END) AS has_basic,
            MIN(CASE WHEN ${cleanseCondition} THEN 1 ELSE 0 END) AS has_cleanse,
            ROW_NUMBER() OVER (PARTITION BY od.user_id ORDER BY od.order_date) AS rn,
            od.order_type
        FROM
            order_details od
            JOIN sub_orders_programs sop ON od.order_id = sop.order_id
            JOIN programs_master pm ON sop.program_id = pm.program_id
        GROUP BY
            od.order_id, od.user_id, od.order_date, od.order_type
      ) ${alias}`;
    };

    const data = await readRecord({
      selectFields: ["COUNT(DISTINCT curr.order_id) as count"],
      table: orderSubQuery("curr", currCleanseFilterType),
      joins: [
        {
          type: "INNER",
          table: orderSubQuery("prev", prevCleanseFilterType),
          on: `curr.user_id = prev.user_id AND curr.rn = prev.rn + 1`,
        },
      ],
      conditions: [
        {
          field: "DATE(prev.order_date)",
          operator: "BETWEEN",
          value: [startDate, endDate],
        },
        {
          field: "curr.is_special",
          operator: "=",
          value: isCurrentSpecial ? 1 : 0,
        },
        {
          field: "prev.order_type",
          operator: "=",
          value: previousOrderType,
        },
        // Optional current order type check
        // { field: "curr.order_type", operator: "=", value: currentOrderType },
        {
          field: "prev.is_special",
          operator: "=",
          value: isPreviousSpecial ? 1 : 0,
        },
        ...(checkPreviousCleanse
          ? [
              {
                field: "prev.has_cleanse",
                operator: "=",
                value: 1,
              },
            ]
          : []),
        ...(checkCurrentCleanse
          ? [
              {
                field: "curr.has_cleanse",
                operator: "=",
                value: 1,
              },
            ]
          : []),
      ],
    });

    return {
      success: true,
      data: data.results[0]?.count || 0,
    };
  } catch (error) {
    console.log("Error in getOrderTransitionCount: ", error);
    return { success: false, message: "Internal Server Error" };
  }
}

async function getCleanseUnitsCount({
  year = null,
  month = null,
  startDate = null,
  endDate = null,
  orderType = null,
  cleanseFilterType = "", // NEW PARAMETER
}) {
  try {
    const cleansePrograms = [
      "FLAT STOMACH CLEANSE",
      "WEIGHT LOSS CLEANSE",
      "POST FESTIVE DETOX CLEANSE",
      "SUGAR DETOX CLEANSE",
      "ACIDITY CORRECTION CLEANSE",
      "CONSTIPATION CORRECTION CLEANSE",
      "IMMUNE BOOSTING CLEANSE",
      "GUT RESET DETOX CLEANSE",
    ];

    const cleanseIds = [117, 118, 161, 125, 126, 127, 128, 129, 130, 157];

    // Dynamic cleanse filter condition
    let cleanseCondition = "";
    if (cleanseFilterType === "name") {
      cleanseCondition = `(pm.program_name IN ('${cleansePrograms.join(
        "','"
      )}'))`;
    } else if (cleanseFilterType === "id") {
      cleanseCondition = `(sop.program_id IN (${cleanseIds.join(",")}))`;
    } else {
      cleanseCondition = `(pm.program_name IN ('${cleansePrograms.join(
        "','"
      )}') OR sop.program_id IN (${cleanseIds.join(",")}))`;
    }

    // Start building conditions
    let conditions = [
      {
        field: cleanseCondition,
        operator: "=",
        value: 1, // This ensures condition structure remains consistent
      },
    ];

    // Date filtering logic
    if (startDate && endDate) {
      conditions.push({
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    } else {
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetMonth = month || currentDate.getMonth() + 1;

      conditions.push(
        {
          field: "MONTH(od.order_date)",
          operator: "=",
          value: targetMonth,
        },
        {
          field: "YEAR(od.order_date)",
          operator: "=",
          value: targetYear,
        }
      );
    }

    if (orderType) {
      conditions.push({
        field: "od.order_type",
        operator: "=",
        value: orderType,
      });
    }

    const data = await readRecord({
      selectFields: ["COUNT(DISTINCT sop.sub_order_id) as count"],
      table: "order_details od",
      joins: [
        {
          type: "INNER",
          table: "sub_orders_programs sop",
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: "programs_master pm",
          on: "sop.program_id = pm.program_id",
        },
      ],
      conditions: conditions,
    });

    return {
      success: true,
      count: data.results[0]?.count || 0,
    };
  } catch (error) {
    console.log("Error in getCleanseUnitsCount: ", error);
    return { success: false, message: "Internal Server Error" };
  }
}

const getOverallSummaryReport = async (req, res, next) => {
  try {
    let { start_date: startDate, end_date: endDate, is_export } = req.query;
    const today = moment();
    if (!startDate && !endDate) {
      if (today.month() >= 3 && !startDate) {
        // April (3) or later
        startDate = moment({ year: today.year(), month: 3, day: 1 }); // April 1 of current year
      } else {
        startDate = moment({ year: today.year() - 1, month: 3, day: 1 }); // April 1 of previous year
      }
      endDate = startDate.clone().add(1, "year").subtract(1, "day");
      startDate = startDate.format("YYYY-MM-DD");
      endDate = endDate.format("YYYY-MM-DD");
    }

    const leadCleanseCounts = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "New",
    });
    const ocrCleanseCounts = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "OCR",
    });
    const activeCleanseCounts = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "Renewal",
    });
    //
    const { data: new_cleanse_to_special } = await getOrderTransitionCount({
      startDate,
      endDate,
      isCurrentSpecial: true,
      isPreviousSpecial: false,
      checkPreviousCleanse: true,
      previousOrderType: "New",
    });
    const { data: ocr_cleanse_to_special } = await getOrderTransitionCount({
      startDate,
      endDate,
      isCurrentSpecial: true,
      isPreviousSpecial: false,
      checkPreviousCleanse: true,
      previousOrderType: "OCR",
    });
    const { data: active_cleanse_to_special } = await getOrderTransitionCount({
      startDate,
      endDate,
      isCurrentSpecial: true,
      isPreviousSpecial: false,
      checkPreviousCleanse: true,
      previousOrderType: "Renewal",
    });
    console.log(new_cleanse_to_special, 3972);
    console.log(ocr_cleanse_to_special, 3972);
    console.log(active_cleanse_to_special, 3972);
    const { data: new_cleanse_to_cleanse } = await getOrderTransitionCount({
      startDate,
      endDate,
      isCurrentSpecial: false,
      isPreviousSpecial: false,
      checkPreviousCleanse: true,
      previousOrderType: "New",
      checkCurrentCleanse: true,
    });

    const { data: ocr_cleanse_to_cleanse } = await getOrderTransitionCount({
      startDate,
      endDate,
      isCurrentSpecial: false,
      isPreviousSpecial: false,
      checkPreviousCleanse: true,
      previousOrderType: "OCR",
      checkCurrentCleanse: true,
    });

    const { data: active_cleanse_to_cleanse } = await getOrderTransitionCount({
      startDate,
      endDate,
      isCurrentSpecial: false,
      isPreviousSpecial: false,
      checkPreviousCleanse: true,
      previousOrderType: "Renewal",
      checkCurrentCleanse: true,
    });

    const new_cleanse_to_special_percentage = leadCleanseCounts.count
      ? ((new_cleanse_to_special / leadCleanseCounts.count) * 100).toFixed(2)
      : 0;
    const ocr_cleanse_to_special_percentage = ocrCleanseCounts.count
      ? ((ocr_cleanse_to_special / ocrCleanseCounts.count) * 100).toFixed(2)
      : 0;
    const active_cleanse_to_special_percentage = activeCleanseCounts.count
      ? ((active_cleanse_to_special / activeCleanseCounts.count) * 100).toFixed(
          2
        )
      : 0;

    const new_cleanse_to_cleanse_percentage = leadCleanseCounts.count
      ? ((new_cleanse_to_cleanse / leadCleanseCounts.count) * 100).toFixed(2)
      : 0;
    const ocr_cleanse_to_cleanse_percentage = ocrCleanseCounts.count
      ? ((ocr_cleanse_to_cleanse / ocrCleanseCounts.count) * 100).toFixed(2)
      : 0;
    const active_cleanse_to_cleanse_percentage = activeCleanseCounts.count
      ? ((active_cleanse_to_cleanse / activeCleanseCounts.count) * 100).toFixed(
          2
        )
      : 0;

    const new_1_3_days_cleanse = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "New",
      cleanseFilterType: "name",
    });

    const ocr_1_3_days_cleanse = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "OCR",
      cleanseFilterType: "name",
    });
    const active_1_3_days_cleanse = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "Renewal",
      cleanseFilterType: "name",
    });

    const { data: new_1_3_days_cleanse_to_1_3_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "New",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "name",
        currCleanseFilterType: "name",
      });

    const { data: new_1_3_days_cleanse_to_10_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "New",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "name",
        currCleanseFilterType: "id",
      });

    const { data: ocr_1_3_days_cleanse_to_1_3_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "OCR",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "name",
        currCleanseFilterType: "name",
      });
    const { data: ocr_1_3_days_cleanse_to_10_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "OCR",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "name",
        currCleanseFilterType: "id",
      });
    const { data: active_1_3_days_cleanse_to_1_3_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "Renewal",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "name",
        currCleanseFilterType: "name",
      });

    const { data: active_1_3_days_cleanse_to_10_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "Renewal",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "name",
        currCleanseFilterType: "id",
      });

    const new_10_days_cleanse = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "New",
      cleanseFilterType: "id",
    });

    const { data: new_10_days_cleanse_to_1_3_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "New",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "id",
        currCleanseFilterType: "name",
      });

    const { data: new_10_days_cleanse_to_10_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "New",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "id",
        currCleanseFilterType: "id",
      });

    const ocr_10_days_cleanse = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "OCR",
      cleanseFilterType: "id",
    });

    const { data: ocr_10_days_cleanse_to_10_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "OCR",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "id",
        currCleanseFilterType: "id",
      });

    const { data: ocr_10_days_cleanse_to_1_3_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "OCR",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "id",
        currCleanseFilterType: "name",
      });

    const active_10_days_cleanse = await getCleanseUnitsCount({
      startDate,
      endDate,
      orderType: "Renewal",
      cleanseFilterType: "id",
    });

    const { data: active_10_days_cleanse_to_1_3_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "Renewal",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "id",
        currCleanseFilterType: "name",
      });

    const { data: active_10_days_cleanse_to_10_days_cleanse } =
      await getOrderTransitionCount({
        startDate,
        endDate,
        isCurrentSpecial: false,
        isPreviousSpecial: false,
        checkPreviousCleanse: true,
        previousOrderType: "Renewal",
        checkCurrentCleanse: true,
        prevCleanseFilterType: "id",
        currCleanseFilterType: "id",
      });
    const total = {
      cleanse_units:
        leadCleanseCounts.count +
        ocrCleanseCounts.count +
        activeCleanseCounts.count,
      to_special_units:
        new_cleanse_to_special +
        ocr_cleanse_to_special +
        active_cleanse_to_special,
      to_cleanse_units:
        new_cleanse_to_cleanse +
        ocr_cleanse_to_cleanse +
        active_cleanse_to_cleanse,
      to_special_percentage:
        leadCleanseCounts.count +
        ocrCleanseCounts.count +
        activeCleanseCounts.count
          ? (
              ((new_cleanse_to_special +
                ocr_cleanse_to_special +
                active_cleanse_to_special) /
                (leadCleanseCounts.count +
                  ocrCleanseCounts.count +
                  activeCleanseCounts.count)) *
              100
            ).toFixed(2)
          : 0,
      to_cleanse_percentage:
        leadCleanseCounts.count +
        ocrCleanseCounts.count +
        activeCleanseCounts.count
          ? (
              ((new_cleanse_to_cleanse +
                ocr_cleanse_to_cleanse +
                active_cleanse_to_cleanse) /
                (leadCleanseCounts.count +
                  ocrCleanseCounts.count +
                  activeCleanseCounts.count)) *
              100
            ).toFixed(2)
          : 0,
      unconverted_units:
        leadCleanseCounts.count +
        ocrCleanseCounts.count +
        activeCleanseCounts.count -
        (new_cleanse_to_special +
          ocr_cleanse_to_special +
          active_cleanse_to_special) -
        (new_cleanse_to_cleanse +
          ocr_cleanse_to_cleanse +
          active_cleanse_to_cleanse),
    };
    const basic_to_basic = {
      new: {
        "1_3_days_cleanse": new_1_3_days_cleanse.count,
        "1_3_days_cleanse_to_1_3_days_cleanse":
          new_1_3_days_cleanse_to_1_3_days_cleanse,
        "1_3_days_cleanse_to_1_3_days_cleanse_percentage":
          new_1_3_days_cleanse.count
            ? (
                (new_1_3_days_cleanse_to_1_3_days_cleanse /
                  new_1_3_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "1_3_days_cleanse_to_10_days_cleanse":
          new_1_3_days_cleanse_to_10_days_cleanse,

        "1_3_days_cleanse_to_10_days_cleanse_percentage":
          new_1_3_days_cleanse.count
            ? (
                (new_1_3_days_cleanse_to_10_days_cleanse /
                  new_1_3_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "10_days_cleanse": new_10_days_cleanse.count,
        "10_days_cleanse_to_1_3_days_cleanse":
          new_10_days_cleanse_to_1_3_days_cleanse,
        "10_days_cleanse_to_1_3_days_cleanse_percentage":
          new_10_days_cleanse.count
            ? (
                (new_10_days_cleanse_to_1_3_days_cleanse /
                  new_10_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "10_days_cleanse_to_10_days_cleanse":
          new_10_days_cleanse_to_10_days_cleanse,

        "10_days_cleanse_to_10_days_cleanse_percentage":
          new_10_days_cleanse.count
            ? (
                (new_10_days_cleanse_to_10_days_cleanse /
                  new_10_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
      },
      ocr: {
        "1_3_days_cleanse": ocr_1_3_days_cleanse.count,
        "1_3_days_cleanse_to_1_3_days_cleanse":
          ocr_1_3_days_cleanse_to_1_3_days_cleanse,
        "1_3_days_cleanse_to_1_3_days_cleanse_percentage":
          ocr_1_3_days_cleanse.count
            ? (
                (ocr_1_3_days_cleanse_to_1_3_days_cleanse /
                  ocr_1_3_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "1_3_days_cleanse_to_10_days_cleanse":
          ocr_1_3_days_cleanse_to_10_days_cleanse,
        "1_3_days_cleanse_to_10_days_cleanse_percentage":
          ocr_1_3_days_cleanse.count
            ? (
                (ocr_1_3_days_cleanse_to_10_days_cleanse /
                  ocr_1_3_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "10_days_cleanse": ocr_10_days_cleanse.count,
        "10_days_cleanse_to_1_3_days_cleanse":
          ocr_10_days_cleanse_to_1_3_days_cleanse,
        "10_days_cleanse_to_1_3_days_cleanse_percentage":
          ocr_10_days_cleanse.count
            ? (
                (ocr_10_days_cleanse_to_1_3_days_cleanse /
                  ocr_10_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "10_days_cleanse_to_10_days_cleanse":
          ocr_10_days_cleanse_to_10_days_cleanse,
        "10_days_cleanse_to_10_days_cleanse_percentage":
          ocr_10_days_cleanse.count
            ? (
                (ocr_10_days_cleanse_to_10_days_cleanse /
                  ocr_10_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
      },
      active: {
        "1_3_days_cleanse": active_1_3_days_cleanse.count,
        "1_3_days_cleanse_to_1_3_days_cleanse":
          active_1_3_days_cleanse_to_1_3_days_cleanse,
        "1_3_days_cleanse_to_1_3_days_cleanse_percentage":
          active_1_3_days_cleanse.count
            ? (
                (active_1_3_days_cleanse_to_1_3_days_cleanse /
                  active_1_3_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "1_3_days_cleanse_to_10_days_cleanse":
          active_1_3_days_cleanse_to_10_days_cleanse,
        "1_3_days_cleanse_to_10_days_cleanse_percentage":
          active_1_3_days_cleanse.count
            ? (
                (active_1_3_days_cleanse_to_10_days_cleanse /
                  active_1_3_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "10_days_cleanse": active_10_days_cleanse.count,
        "10_days_cleanse_to_1_3_days_cleanse":
          active_10_days_cleanse_to_1_3_days_cleanse,
        "10_days_cleanse_to_1_3_days_cleanse_percentage":
          active_10_days_cleanse.count
            ? (
                (active_10_days_cleanse_to_1_3_days_cleanse /
                  active_10_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
        "10_days_cleanse_to_10_days_cleanse":
          active_10_days_cleanse_to_10_days_cleanse,
        "10_days_cleanse_to_10_days_cleanse_percentage":
          active_10_days_cleanse.count
            ? (
                (active_10_days_cleanse_to_10_days_cleanse /
                  active_10_days_cleanse.count) *
                100
              ).toFixed(2)
            : 0,
      },
    };
    const data = {
      basic_to_special: {
        new: {
          cleanse_units: leadCleanseCounts.count,
          to_special_units: new_cleanse_to_special,
          to_special_percentage: new_cleanse_to_special_percentage,
          to_cleanse_units: new_cleanse_to_cleanse,
          to_cleanse_percentage: new_cleanse_to_cleanse_percentage,
          unconverted_units:
            leadCleanseCounts.count -
            new_cleanse_to_special -
            new_cleanse_to_cleanse,
        },
        ocr: {
          cleanse_units: ocrCleanseCounts.count,
          to_special_units: ocr_cleanse_to_special,
          to_special_percentage: ocr_cleanse_to_special_percentage,
          to_cleanse_units: ocr_cleanse_to_cleanse,
          to_cleanse_percentage: ocr_cleanse_to_cleanse_percentage,
          unconverted_units:
            ocrCleanseCounts.count -
            ocr_cleanse_to_special -
            ocr_cleanse_to_cleanse,
        },
        active: {
          cleanse_units: activeCleanseCounts.count,
          to_special_units: active_cleanse_to_special,
          to_special_percentage: active_cleanse_to_special_percentage,
          to_cleanse_units: active_cleanse_to_cleanse,
          to_cleanse_percentage: active_cleanse_to_cleanse_percentage,
          unconverted_units:
            activeCleanseCounts.count -
            active_cleanse_to_special -
            active_cleanse_to_cleanse,
        },
        total,
      },
      basic_to_basic,
    };
    if (is_export && is_export === "true") {
      // Handle export logic here
      async function generateReport() {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Short Program Analysis Report");

        sheet.addRow([]);
        sheet.addRow([]);

        const firstHeader = sheet.addRow([
          `From ${startDate} to ${endDate}`,
          "",
          "",
          "",
          "",
          "",
        ]);
        firstHeader.font = { bold: true, size: 16 };
        sheet.mergeCells(`A${firstHeader.number}:B${firstHeader.number}`);
        firstHeader.alignment = { vertical: "middle", horizontal: "center" };
        sheet.addRow([]);

        const secondHeader = sheet.addRow([
          "Basic to Special Analysis",
          "",
          "",
          "",
          "",
          "",
        ]);
        secondHeader.font = { bold: true, size: 14 };
        // sheet.mergeCells(`A${secondHeader.number}:F${secondHeader.number}`);
        secondHeader.alignment = { vertical: "middle", horizontal: "center" };
        sheet.addRow([]);

        sheet.addRow([
          "particular",
          "TOTAL BSP SOLD",
          "Renewed To SSP",
          "% Of Upgrade",
          "Renewed To BSP",
          "% Of Upgrade",
          "potential (unconverted)",
        ]);
        sheet.addRow([
          "Lead",
          leadCleanseCounts.count,
          new_cleanse_to_special,
          new_cleanse_to_special_percentage,
          new_cleanse_to_cleanse,
          new_cleanse_to_cleanse_percentage,
          leadCleanseCounts.count -
            new_cleanse_to_special -
            new_cleanse_to_cleanse,
        ]);
        sheet.addRow([
          "OCR",
          ocrCleanseCounts.count,
          ocr_cleanse_to_special,
          ocr_cleanse_to_special_percentage,
          ocr_cleanse_to_cleanse,
          ocr_cleanse_to_cleanse_percentage,
          ocrCleanseCounts.count -
            ocr_cleanse_to_special -
            ocr_cleanse_to_cleanse,
        ]);
        sheet.addRow([
          "Active",
          activeCleanseCounts.count,
          active_cleanse_to_special,
          active_cleanse_to_special_percentage,
          active_cleanse_to_cleanse,
          active_cleanse_to_cleanse_percentage,
          activeCleanseCounts.count -
            active_cleanse_to_special -
            active_cleanse_to_cleanse,
        ]);

        sheet.addRow([]);

        const thirdHeader = sheet.addRow([
          "FROM BASIC TO BASIC",
          "",
          "",
          "",
          "",
        ]);
        thirdHeader.font = { bold: true, size: 14 };
        // sheet.mergeCells(`A${thirdHeader.number}:E${thirdHeader.number}`);
        thirdHeader.alignment = { vertical: "middle", horizontal: "center" };
        sheet.addRow([]);

        sheet.addRow([
          "1/3 Days Program",
          "",
          "",
          "",
          "",
          "",
          "10 Days Program",
          "",
          "",
          "",
        ]);
        // Merge A:F
        sheet.mergeCells(`A${sheet.lastRow.number}:F${sheet.lastRow.number}`);
        const leftMergedCell = sheet.getCell(`A${sheet.lastRow.number}`);
        leftMergedCell.alignment = { vertical: "middle", horizontal: "center" };
        leftMergedCell.font = { bold: true, size: 14 };

        // Merge G:K
        sheet.mergeCells(`G${sheet.lastRow.number}:K${sheet.lastRow.number}`);
        const rightMergedCell = sheet.getCell(`G${sheet.lastRow.number}`);
        rightMergedCell.alignment = {
          vertical: "middle",
          horizontal: "center",
        };
        rightMergedCell.font = { bold: true, size: 14 };

        sheet.addRow([
          "",
          "Bought 1/3 Day Program",
          "Renewed 1/3 Day Program",
          "",
          "Renewed 10 Day Program",
          "",
          "Brought 10 Day Program Directly",
          "Renewed 1/3 Day Program",
          "",
          "Renewed 10 Day Program",
          "",
        ]);
        sheet.mergeCells(`C${sheet.lastRow.number}:D${sheet.lastRow.number}`);
        sheet.mergeCells(`E${sheet.lastRow.number}:F${sheet.lastRow.number}`);
        sheet.mergeCells(`H${sheet.lastRow.number}:I${sheet.lastRow.number}`);
        sheet.addRow([
          "",
          "Unit",
          "Unit",
          "%",
          "Unit",
          "%",
          "Unit",
          "Unit",
          "%",
          "Unit",
          "%",
        ]);
        sheet.addRow([
          "Lead",
          new_1_3_days_cleanse.count,
          basic_to_basic.new["1_3_days_cleanse_to_1_3_days_cleanse"],
          basic_to_basic.new["1_3_days_cleanse_to_1_3_days_cleanse_percentage"],
          basic_to_basic.new["1_3_days_cleanse_to_10_days_cleanse"],
          basic_to_basic.new["1_3_days_cleanse_to_10_days_cleanse_percentage"],
          basic_to_basic.new["10_days_cleanse"],
          basic_to_basic.new["10_days_cleanse_to_1_3_days_cleanse"],
          basic_to_basic.new["10_days_cleanse_to_1_3_days_cleanse_percentage"],
          basic_to_basic.new["10_days_cleanse_to_10_days_cleanse"],
          basic_to_basic.new["10_days_cleanse_to_10_days_cleanse_percentage"],
        ]);
        sheet.addRow([
          "OCR",
          ocr_1_3_days_cleanse.count,
          basic_to_basic.ocr["1_3_days_cleanse_to_1_3_days_cleanse"],
          basic_to_basic.ocr["1_3_days_cleanse_to_1_3_days_cleanse_percentage"],
          basic_to_basic.ocr["1_3_days_cleanse_to_10_days_cleanse"],
          basic_to_basic.ocr["1_3_days_cleanse_to_10_days_cleanse_percentage"],
          basic_to_basic.ocr["10_days_cleanse"],
          basic_to_basic.ocr["10_days_cleanse_to_1_3_days_cleanse"],
          basic_to_basic.ocr["10_days_cleanse_to_1_3_days_cleanse_percentage"],
          basic_to_basic.ocr["10_days_cleanse_to_10_days_cleanse"],
          basic_to_basic.ocr["10_days_cleanse_to_10_days_cleanse_percentage"],
        ]);
        sheet.addRow([
          "Active",
          active_1_3_days_cleanse.count,
          basic_to_basic.active["1_3_days_cleanse_to_1_3_days_cleanse"],
          basic_to_basic.active[
            "1_3_days_cleanse_to_1_3_days_cleanse_percentage"
          ],
          basic_to_basic.active["1_3_days_cleanse_to_10_days_cleanse"],
          basic_to_basic.active[
            "1_3_days_cleanse_to_10_days_cleanse_percentage"
          ],
          basic_to_basic.active["10_days_cleanse"],
          basic_to_basic.active["10_days_cleanse_to_1_3_days_cleanse"],
          basic_to_basic.active[
            "10_days_cleanse_to_1_3_days_cleanse_percentage"
          ],
          basic_to_basic.active["10_days_cleanse_to_10_days_cleanse"],
          basic_to_basic.active[
            "10_days_cleanse_to_10_days_cleanse_percentage"
          ],
        ]);
        sheet.addRow([
          "Total",
          new_1_3_days_cleanse.count +
            ocr_1_3_days_cleanse.count +
            active_1_3_days_cleanse.count,
          basic_to_basic.new["1_3_days_cleanse_to_1_3_days_cleanse"] +
            basic_to_basic.ocr["1_3_days_cleanse_to_1_3_days_cleanse"] +
            basic_to_basic.active["1_3_days_cleanse_to_1_3_days_cleanse"],
          (
            ((basic_to_basic.new["1_3_days_cleanse_to_1_3_days_cleanse"] +
              basic_to_basic.ocr["1_3_days_cleanse_to_1_3_days_cleanse"] +
              basic_to_basic.active["1_3_days_cleanse_to_1_3_days_cleanse"]) /
              (new_1_3_days_cleanse.count +
                ocr_1_3_days_cleanse.count +
                active_1_3_days_cleanse.count)) *
            100
          ).toFixed(2),
          basic_to_basic.new["1_3_days_cleanse_to_10_days_cleanse"] +
            basic_to_basic.ocr["1_3_days_cleanse_to_10_days_cleanse"] +
            basic_to_basic.active["1_3_days_cleanse_to_10_days_cleanse"],
          (
            ((basic_to_basic.new["1_3_days_cleanse_to_10_days_cleanse"] +
              basic_to_basic.ocr["1_3_days_cleanse_to_10_days_cleanse"] +
              basic_to_basic.active["1_3_days_cleanse_to_10_days_cleanse"]) /
              (new_1_3_days_cleanse.count +
                ocr_1_3_days_cleanse.count +
                active_1_3_days_cleanse.count)) *
            100
          ).toFixed(2),
          basic_to_basic.new["10_days_cleanse"] +
            basic_to_basic.ocr["10_days_cleanse"] +
            basic_to_basic.active["10_days_cleanse"],
          basic_to_basic.new["10_days_cleanse_to_1_3_days_cleanse"] +
            basic_to_basic.ocr["10_days_cleanse_to_1_3_days_cleanse"] +
            basic_to_basic.active["10_days_cleanse_to_1_3_days_cleanse"],
          (
            ((basic_to_basic.new["10_days_cleanse_to_1_3_days_cleanse"] +
              basic_to_basic.ocr["10_days_cleanse_to_1_3_days_cleanse"] +
              basic_to_basic.active["10_days_cleanse_to_1_3_days_cleanse"]) /
              (new_10_days_cleanse.count +
                ocr_10_days_cleanse.count +
                active_10_days_cleanse.count)) *
            100
          ).toFixed(2),
          basic_to_basic.new["10_days_cleanse_to_10_days_cleanse"] +
            basic_to_basic.ocr["10_days_cleanse_to_10_days_cleanse"] +
            basic_to_basic.active["10_days_cleanse_to_10_days_cleanse"],
          (
            ((basic_to_basic.new["10_days_cleanse_to_10_days_cleanse"] +
              basic_to_basic.ocr["10_days_cleanse_to_10_days_cleanse"] +
              basic_to_basic.active["10_days_cleanse_to_10_days_cleanse"]) /
              (new_10_days_cleanse.count +
                ocr_10_days_cleanse.count +
                active_10_days_cleanse.count)) *
            100
          ).toFixed(2),
        ]);
        sheet.columns.forEach((column) => {
          let maxLength = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            maxLength = Math.max(
              maxLength,
              cell.value ? cell.value.toString().length : 0
            );
          });
          column.width = maxLength + 2; // Add some padding
        });
        return workbook;
      }
      const workbook = await generateReport(data);
      const buffer = await workbook.xlsx.writeBuffer();
      return res
        .status(200)
        .setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .setHeader(
          "Content-Disposition",
          "attachment; filename=overall_summary_report.xlsx"
        )
        .send(buffer);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Overall summary report fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in overallSummaryReport:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function getCleanseRenewedCount({
  startDate,
  endDate,
  orderType,
  programCondition,
}) {
  try {
    const { results } = await readRecord({
      selectFields: [
        `au.crm_user AS salesperson_name`,
        `COUNT(DISTINCT prev.user_id) AS bought_cleanse`,
        `COUNT(DISTINCT CASE WHEN curr.is_special = 1 THEN prev.user_id END) AS renewed_to_big_program`,
      ],
      table: `(SELECT
        od.order_id,
        od.user_id,
        od.order_date,
        od.sale_by,
        MAX(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) AS is_special,
        MIN(
            CASE
                WHEN ${programCondition}
                THEN 1 ELSE 0
            END
        ) AS has_cleanse,
        ROW_NUMBER() OVER (PARTITION BY od.user_id ORDER BY od.order_date) AS rn,
        od.order_type
    FROM
        order_details od
        JOIN sub_orders_programs sop ON od.order_id = sop.order_id
        JOIN programs_master pm ON sop.program_id = pm.program_id
    WHERE
        DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY
        od.order_id, od.user_id, od.order_date, od.order_type, od.sale_by) as prev`,
      joins: [
        {
          type: "LEFT",
          table: `(
    SELECT
        od.order_id,
        od.user_id,
        od.order_date,
        MAX(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) AS is_special,
        ROW_NUMBER() OVER (PARTITION BY od.user_id ORDER BY od.order_date) AS rn,
        od.order_type
    FROM
        order_details od
        JOIN sub_orders_programs sop ON od.order_id = sop.order_id
        JOIN programs_master pm ON sop.program_id = pm.program_id
    GROUP BY
        od.order_id, od.user_id, od.order_date, od.order_type
) curr`,
          on: "prev.user_id = curr.user_id AND curr.rn = prev.rn + 1",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "prev.sale_by = au.admin_user_id",
        },
      ],
      conditions: [
        { field: "prev.order_type", operator: "=", value: orderType },
        { field: "prev.has_cleanse", operator: "=", value: 1 },
        { field: "prev.is_special", operator: "=", value: 0 },
        { field: "au.role_id", operator: "=", value: 1 },
        { field: "au.admin_user_id", operator: "!=", value: 196 },
        { field: "prev.sale_by", operator: "IS NOT", value: "NULL", raw: true },
      ],
      groupBy: ["au.crm_user"],
      orderBy: ["bought_cleanse DESC"],
    });
    return { success: true, data: results };
  } catch (error) {
    console.log("Error in getCleanseRenewedCount: ", error);
    return { success: false, data: [], message: "Internal Server Error" };
  }
}

const getKhyatiMaamReport = async (req, res, next) => {
  try {
    let { start_date: startDate, end_date: endDate, is_export } = req.query;
    const today = moment();
    if (!startDate && !endDate) {
      if (today.month() >= 3 && !startDate) {
        // April (3) or later
        startDate = moment({ year: today.year(), month: 3, day: 1 }); // April 1 of current year
      } else {
        startDate = moment({ year: today.year() - 1, month: 3, day: 1 }); // April 1 of previous year
      }
      endDate = startDate.clone().add(1, "year").subtract(1, "day");
      startDate = startDate.format("YYYY-MM-DD");
      endDate = endDate.format("YYYY-MM-DD");
    }
    const activeCleanse = await getCleanseRenewedCount({
      startDate,
      endDate,
      programCondition: `pm.program_name IN ('FLAT STOMACH CLEANSE','WEIGHT LOSS CLEANSE','POST FESTIVE DETOX CLEANSE','SUGAR DETOX CLEANSE','ACIDITY CORRECTION CLEANSE','CONSTIPATION CORRECTION CLEANSE','IMMUNE BOOSTING CLEANSE','GUT RESET DETOX CLEANSE')`,
      orderType: "Renewal",
    });

    const ocrCleanse = await getCleanseRenewedCount({
      startDate,
      endDate,
      programCondition: `pm.program_name IN ('FLAT STOMACH CLEANSE','WEIGHT LOSS CLEANSE','POST FESTIVE DETOX CLEANSE','SUGAR DETOX CLEANSE','ACIDITY CORRECTION CLEANSE','CONSTIPATION CORRECTION CLEANSE','IMMUNE BOOSTING CLEANSE','GUT RESET DETOX CLEANSE')`,
      orderType: "OCR",
    });

    const activeTenDayProgram = await getCleanseRenewedCount({
      startDate,
      endDate,
      programCondition: `pm.program_id IN (117, 118, 161,125,126,127,128,129,130,157)`,
      orderType: "Renewal",
    });

    const ocrTenDayProgram = await getCleanseRenewedCount({
      startDate,
      endDate,
      programCondition: `pm.program_id IN (117, 118, 161,125,126,127,128,129,130,157)`,
      orderType: "OCR",
    });

    const [active14DayProgram, ocr14DayProgram] = await Promise.all(
      ["Renewal", "OCR"].map(async (orderType) => {
        const { results } = await readRecord({
          selectFields: [
            `au.crm_user AS salesperson_name`,
            `COUNT(DISTINCT prev.user_id) AS bought_cleanse`,
            `COUNT(DISTINCT CASE WHEN curr.is_special = 1 THEN prev.user_id END) AS renewed_to_big_program`,
          ],
          table: `(
    SELECT
        od.order_id,
        od.user_id,
        od.order_date,
        od.sale_by,
        MAX(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) AS is_special,
        (CASE
            WHEN COUNT(CASE WHEN sop.program_type = 1 THEN 1 END) = 3
                 AND COUNT(DISTINCT sop.program_type) = 1
                 AND DATE(od.order_date) = DATE(od.created_at)
            THEN 1 ELSE 0
        END) AS has_cleanse,
        ROW_NUMBER() OVER (PARTITION BY od.user_id ORDER BY od.order_date) AS rn,
        od.order_type
    FROM
        order_details od
        JOIN sub_orders_programs sop ON od.order_id = sop.order_id
        JOIN programs_master pm ON sop.program_id = pm.program_id
    WHERE
        DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY
        od.order_id, od.user_id, od.order_date, od.order_type, od.sale_by, DATE(od.created_at)
) prev`,
          joins: [
            {
              type: "LEFT",
              table: `(
    SELECT
        od.order_id,
        od.user_id,
        od.order_date,
        MAX(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) AS is_special,
        ROW_NUMBER() OVER (PARTITION BY od.user_id ORDER BY od.order_date) AS rn,
        od.order_type
    FROM
        order_details od
        JOIN sub_orders_programs sop ON od.order_id = sop.order_id
        JOIN programs_master pm ON sop.program_id = pm.program_id
    WHERE
        od.order_type = 'Renewal'
    GROUP BY
        od.order_id, od.user_id, od.order_date, od.order_type
    HAVING
        MAX(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) = 1
) curr`,
              on: "prev.user_id = curr.user_id AND curr.rn = prev.rn + 1",
            },
            {
              type: "LEFT",
              table: `${tables.adminUsers} au`,
              on: "prev.sale_by = au.admin_user_id",
            },
          ],
          conditions: [
            { field: "prev.order_type", operator: "=", value: orderType },
            { field: "prev.has_cleanse", operator: "=", value: 1 },
            { field: "prev.is_special", operator: "=", value: 0 },
            { field: "au.role_id", operator: "=", value: 1 },
            { field: "au.admin_user_id", operator: "!=", value: 196 },
            {
              field: "prev.sale_by",
              operator: "IS NOT",
              value: "NULL",
              raw: true,
            },
          ],
          groupBy: ["au.crm_user"],
          orderBy: ["bought_cleanse DESC"],
        });
        return results;
      })
    );
    if (is_export && is_export === "true") {
      async function generateKhyatiReport(data) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Khyati Report");

        // Helper to add program blocks (like in screenshot)
        function addProgramBlock(title, dataset, startCol) {
          // Header Row
          sheet.mergeCells(5, startCol, 5, startCol + 2);
          const headerCell = sheet.getCell(5, startCol);
          headerCell.value = title;
          headerCell.alignment = { horizontal: "center", vertical: "middle" };
          headerCell.font = { bold: true };

          // Sub-headers
          sheet.getCell(6, startCol).value = "Salesperson";
          sheet.getCell(6, startCol + 1).value = "Bought Cleanse";
          sheet.getCell(6, startCol + 2).value = "Renewed to Big Program";

          // Add rows from dataset
          let rowIdx = 7;
          dataset.forEach((entry) => {
            sheet.getCell(rowIdx, startCol).value = entry.salesperson_name;
            sheet.getCell(rowIdx, startCol + 1).value = entry.bought_cleanse;
            sheet.getCell(rowIdx, startCol + 2).value =
              entry.renewed_to_big_program;
            rowIdx++;
          });

          // Add totals
          const totalBought = dataset.reduce(
            (sum, e) => sum + (e.bought_cleanse || 0),
            0
          );
          const totalRenewed = dataset.reduce(
            (sum, e) => sum + (e.renewed_to_big_program || 0),
            0
          );

          sheet.getCell(rowIdx, startCol).value = "TOTAL";
          sheet.getCell(rowIdx, startCol + 1).value = totalBought;
          sheet.getCell(rowIdx, startCol + 2).value = totalRenewed;

          sheet.getRow(6).font = { bold: true };
          sheet.getRow(rowIdx).font = { bold: true };

          // Formatting columns
          sheet.getColumn(startCol).width = 20;
          sheet.getColumn(startCol + 1).width = 18;
          sheet.getColumn(startCol + 2).width = 25;
        }

        // Add program blocks horizontally like in screenshot
        let col = 2; // start a little right for padding

        addProgramBlock("Cleanses (Active)", data.activeCleanse, col);
        col += 4;

        addProgramBlock("Cleanses (OCR)", data.ocrCleanse, col);
        col += 4;

        addProgramBlock(
          "10 Days Short Program (Active)",
          data.activeTenDayProgram,
          col
        );
        col += 4;

        addProgramBlock(
          "10 Days Short Program (OCR)",
          data.ocrTenDayProgram,
          col
        );
        col += 4;

        addProgramBlock(
          "14 Days Program (Active)",
          data.active14DayProgram,
          col
        );
        col += 4;

        addProgramBlock("14 Days Program (OCR)", data.ocr14DayProgram, col);

        return workbook;
      }
      const workbook = await generateKhyatiReport({
        activeCleanse: activeCleanse.success ? activeCleanse.data : [],
        ocrCleanse: ocrCleanse.success ? ocrCleanse.data : [],
        activeTenDayProgram: activeTenDayProgram.success
          ? activeTenDayProgram.data
          : [],
        ocrTenDayProgram: ocrTenDayProgram.success ? ocrTenDayProgram.data : [],
        active14DayProgram,
        ocr14DayProgram,
      });
      const buffer = await workbook.xlsx.writeBuffer();
      return res
        .status(200)
        .header(
          "Content-Disposition",
          'attachment; filename="KhyatiMaamReport.xlsx"'
        )
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .send(buffer);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Khyati Maam report fetched successfully",
      data: {
        active_cleanse: activeCleanse.success ? activeCleanse.data : [],
        OCR_cleanse: ocrCleanse.success ? ocrCleanse.data : [],
        active_10_day_program: activeTenDayProgram.success
          ? activeTenDayProgram.data
          : [],
        OCR_10_day_program: ocrTenDayProgram.success
          ? ocrTenDayProgram.data
          : [],
        active_14_day_program: active14DayProgram,
        OCR_14_day_program: ocr14DayProgram,
      },
    });
    res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getKhyatiMaamReport:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getProgramByStack,
  getCountryOnregion,
  getAllUsersCountries,
  getFilteredData,
  getExecutiveSummary,
  getGeographyCounts,
  getClientPerformanceCounts,
  getRenewalAnalysisCounts,
  getDemographicsCounts,
  getProgramPerformanceCounts,
  getFinancialYearlySalesBreakdown,
  getMentorRevenueBreakup,
  getSalesDataComparison,
  getProgramWiseSalesData,
  getOverallSummaryReport,
  getKhyatiMaamReport,
  getSalesDataReport,
};
