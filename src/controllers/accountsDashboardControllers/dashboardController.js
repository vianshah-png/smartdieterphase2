import moment from "moment";
import { readRecord, readRecordUnion } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { raw } from "express";

const SalesUnits = async (_, res, next) => {
  try {
    const now = moment();

    // ===== Dates =====
    const today = now.format("YYYY-MM-DD");
    const yesterday = now.clone().subtract(1, "days").format("YYYY-MM-DD");

    const startOfMonth = now.clone().startOf("month").format("YYYY-MM-DD");
    const endOfMonth = now.clone().endOf("month").format("YYYY-MM-DD");

    // ===== Financial Year (April 1 → Today) =====
    const startOfYear =
      now.month() < 3
        ? now.clone().subtract(1, "year").month(3).date(1)
        : now.clone().month(3).date(1);

    const endOfYear = now;

    const fyStart = startOfYear.format("YYYY-MM-DD");
    const fyEnd = endOfYear.format("YYYY-MM-DD");

    // ===== SQL Select Fields =====
    const selectFields = [
      // ---------- TODAY ----------
      `COUNT(DISTINCT CASE 
        WHEN DATE(od.order_date) = '${today}' 
        AND od.user_id <> 0 
        THEN od.order_id 
      END) AS today_units_saled`,

      `SUM(CASE 
        WHEN DATE(od.order_date) = '${today}' 
        AND od.order_type IS NOT NULL 
        AND od.order_type != 'free' 
        THEN (od.order_paid_amount + od.order_balance_amount) 
        ELSE 0 
      END) AS today_sales_amount`,

      // ---------- YESTERDAY ----------
      `COUNT(DISTINCT CASE 
        WHEN DATE(od.order_date) = '${yesterday}' 
        AND od.user_id <> 0 
        THEN od.order_id 
      END) AS yesterday_units_saled`,

      `SUM(CASE 
        WHEN DATE(od.order_date) = '${yesterday}' 
        AND od.order_type IS NOT NULL 
        AND od.order_type != 'free' 
        THEN (od.order_paid_amount + od.order_balance_amount) 
        ELSE 0 
      END) AS yesterday_sales_amount`,

      // ---------- MONTH ----------
      `COUNT(DISTINCT CASE 
        WHEN DATE(od.order_date) BETWEEN '${startOfMonth}' AND '${endOfMonth}' 
        AND od.user_id <> 0 
        THEN od.order_id 
      END) AS month_units_saled`,

      `SUM(CASE 
        WHEN DATE(od.order_date) BETWEEN '${startOfMonth}' AND '${endOfMonth}' 
        AND od.order_type IS NOT NULL 
        AND od.order_type != 'free' 
        THEN (od.order_paid_amount + od.order_balance_amount) 
        ELSE 0 
      END) AS month_sales_amount`,

      // ---------- YEAR (FINANCIAL YEAR) ----------
      `COUNT(DISTINCT CASE 
        WHEN DATE(od.order_date) BETWEEN '${fyStart}' AND '${fyEnd}' 
        AND od.user_id <> 0 
        THEN od.order_id 
      END) AS year_units_saled`,

      `SUM(CASE 
        WHEN DATE(od.order_date) BETWEEN '${fyStart}' AND '${fyEnd}' 
        AND od.order_type IS NOT NULL 
        AND od.order_type != 'free' 
        THEN (od.order_paid_amount + od.order_balance_amount) 
        ELSE 0 
      END) AS year_sales_amount`,
    ];

    // ===== Execute Query =====
    const { results } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields,
    });

    // ===== API Response =====
    const Apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Units fetched successfully",
      data: results[0],
    });

    return res.status(200).json(Apiresponse);
  } catch (error) {
    console.error("SalesUnits Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const salesOverview = async (req, res, next) => {
  try {
    const { year } = req.query;

    const queryYear =
      year && !isNaN(year) ? moment(`${year}-01-01`) : moment();

    if (!queryYear.isValid()) {
      return next(new ErrorHandler("Invalid year parameter", 400));
    }

    const selectedYear = queryYear.year();

    // ================= CURRENT PERIOD DATES =================
    const todayMoment = moment().year(selectedYear);
    const todayDate = todayMoment.format("YYYY-MM-DD");

    const currentStartMonth = todayMoment
      .clone()
      .startOf("month")
      .format("YYYY-MM-DD");

    const currentEndMonth = todayMoment
      .clone()
      .endOf("month")
      .format("YYYY-MM-DD");

    const lastStartMonth = todayMoment
      .clone()
      .subtract(1, "month")
      .startOf("month")
      .format("YYYY-MM-DD");

    const lastEndMonth = todayMoment
      .clone()
      .subtract(1, "month")
      .endOf("month")
      .format("YYYY-MM-DD");

    // ================= FINANCIAL YEAR =================
    let yearStart;
    const baseDate = moment().year(selectedYear);

    if (baseDate.month() < 3) {
      yearStart = baseDate
        .clone()
        .subtract(1, "year")
        .month(3)
        .startOf("month");
    } else {
      yearStart = baseDate.clone().month(3).startOf("month");
    }

    const yearEnd = yearStart.clone().add(1, "year").subtract(1, "day");

    // ================= LAST YEAR =================
    const lastYearStart = moment(`${selectedYear - 2}-04-01`).format(
      "YYYY-MM-DD"
    );
    const lastYearEnd = moment(`${selectedYear - 1}-03-31`).format(
      "YYYY-MM-DD"
    );

    const today = moment();
    const lastYearToday = today.clone().subtract(1, "year").format("YYYY-MM-DD");

    // ===== LAST YEAR PREVIOUS MONTH (JAN FIX) =====
    const currentMonth = today.month() + 1;
    const currentYear = today.year();

    let lastYearPrevMonth;
    let lastYearPrevMonthYear;

    if (currentMonth === 1) {
      lastYearPrevMonth = 12;
      lastYearPrevMonthYear = currentYear - 2;
    } else {
      lastYearPrevMonth = currentMonth - 1;
      lastYearPrevMonthYear = currentYear - 1;
    }

    // ================= PERIODS =================
    const periods = [
      {
        name: "today",
        condition: {
          field: "DATE(od.order_date)",
          operator: "=",
          value: todayDate,
        },
      },
      {
        name: "month",
        condition: {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [currentStartMonth, currentEndMonth],
        },
      },
      {
        name: "previous_month",
        condition: {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [lastStartMonth, lastEndMonth],
        },
      },
      {
        name: "year",
        condition: {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [
            yearStart.format("YYYY-MM-DD"),
            yearEnd.format("YYYY-MM-DD"),
          ],
        },
      },
    ];

    // ================= QUERY TEMPLATES =================
    const baseSelect = [
      `COUNT(DISTINCT od.order_id) AS unit`,
      `SUM(
        CASE 
          WHEN od.order_type IS NULL OR od.order_type = 'Free' THEN 0
          ELSE od.order_paid_amount + od.order_balance_amount
        END
      ) AS amount`,
    ];

    const queryTemplates = [
      { category: "new", type: "New" },
      { category: "renewal", type: "Renewal" },
      { category: "ocr", type: "OCR" },
      { category: "upgrade", type: "Upgrade" },
      { category: "total" },
      { category: "last_year_total", lastYear: true },
    ].map((item) => ({
      category: item.category,
      table: `${tables.orderDetails} od`,
      selectField: baseSelect,
      condition: item.lastYear
        ? [{ field: "od.order_status", operator: "=", value: "2" }]
        : item.type
        ? [
            { field: "od.order_type", operator: "=", value: item.type },
            { field: "od.order_status", operator: "=", value: "2" },
          ]
        : [],
    }));

    // ================= BUILD QUERIES =================
    const queries = [];

    periods.forEach((period) => {
      queryTemplates.forEach((template) => {
        const query = { ...template };

        if (template.category === "last_year_total") {
          if (period.name === "today") {
            query.condition = [
              {
                field: "DATE(od.order_date)",
                operator: "=",
                value: lastYearToday,
              },
            ];
          } else if (period.name === "month") {
            query.condition = [
              { field: "MONTH(od.order_date)", operator: "=", value: currentMonth },
              { field: "YEAR(od.order_date)", operator: "=", value: currentYear - 1 },
            ];
          } else if (period.name === "previous_month") {
            query.condition = [
              {
                field: "MONTH(od.order_date)",
                operator: "=",
                value: lastYearPrevMonth,
              },
              {
                field: "YEAR(od.order_date)",
                operator: "=",
                value: lastYearPrevMonthYear,
              },
            ];
          } else {
            query.condition = [
              {
                field: "DATE(od.order_date)",
                operator: "BETWEEN",
                value: [lastYearStart, lastYearEnd],
              },
            ];
          }
        } else {
          query.condition = [...template.condition, period.condition];
        }

        queries.push(query);
      });
    });

    // ================= EXECUTE =================
    const results = await readRecordUnion(queries);

    // ================= MAP RESULTS =================
    const result = {};
    const categories = [
      "new",
      "renewal",
      "ocr",
      "upgrade",
      "total",
      "last_year_total",
    ];

    periods.forEach((period, pIdx) => {
      categories.forEach((cat, cIdx) => {
        const idx = pIdx * categories.length + cIdx;
        result[`${period.name}_${cat}_units`] =
          Number(results[idx]?.unit) || 0;
        result[`${period.name}_${cat}_amount`] =
          Number(results[idx]?.amount) || 0;
      });
    });

    // ================= FINAL RESPONSE (UI FORMAT) =================
    const data = {};
    categories.forEach((cat) => {
      data[cat] = {};
      periods.forEach((p) => {
        data[cat][p.name] = {
          units: result[`${p.name}_${cat}_units`] || 0,
          amount: result[`${p.name}_${cat}_amount`] || 0,
        };
      });
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Sales Overview fetched successfully",
        data,
      })
    );
  } catch (error) {
    console.error("Error in salesOverview:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};



const totalCollections = async (req, res, next) => {
  try {
    const { year } = req.query;
    const queryYear = year && !isNaN(year) ? moment(`${year}-01-01`) : moment();

    if (!queryYear.isValid()) {
      return next(new ErrorHandler("Invalid year parameter", 400));
    }

    const selectedYear = queryYear.year();
    const todayInSelectedYear = moment()
      .year(selectedYear)
      .format("YYYY-MM-DD");
    const todayMoment = moment(todayInSelectedYear);

    const todayDate = todayMoment.format("YYYY-MM-DD");
    const currentStartMonth = todayMoment
      .clone()
      .startOf("month")
      .format("YYYY-MM-DD");
    const currentEndMonth = todayMoment
      .clone()
      .endOf("month")
      .format("YYYY-MM-DD");
    const lastStartMonth = todayMoment
      .clone()
      .subtract(1, "month")
      .startOf("month")
      .format("YYYY-MM-DD");
    const lastEndMonth = todayMoment
      .clone()
      .subtract(1, "month")
      .endOf("month")
      .format("YYYY-MM-DD");

    let financialYearStart, financialYearEnd;
    if (todayMoment.month() < 3) {
      financialYearStart = todayMoment
        .clone()
        .subtract(1, "year")
        .month(3)
        .startOf("month");
    } else {
      financialYearStart = todayMoment.clone().month(3).startOf("month");
    }
    financialYearEnd = financialYearStart
      .clone()
      .add(1, "year")
      .subtract(1, "day");

    const financialYearStartStr = financialYearStart.format("YYYY-MM-DD");
    const financialYearEndStr = financialYearEnd.format("YYYY-MM-DD");

    console.log(financialYearStartStr, 454);
    console.log(financialYearEndStr, 455);
    console.log(currentStartMonth, 458);
    console.log(currentEndMonth, 459);

    const results = await readRecordUnion([
      // SALES
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) as unit",
          "SUM(od.order_paid_amount) as amount",
        ],
        condition: [
          { field: "DATE(od.order_date)", operator: "=", value: todayDate },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) as unit",
          "SUM(od.order_paid_amount) as amount",
        ],
        condition: [
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [currentStartMonth, currentEndMonth],
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) as unit",
          "SUM(od.order_paid_amount) as amount",
        ],
        condition: [
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [lastStartMonth, lastEndMonth],
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(DISTINCT od.order_id) as unit",
          "SUM(od.order_paid_amount) as amount",
        ],
        condition: [
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [financialYearStartStr, financialYearEndStr],
          },
        ],
      },

      // BALANCE
      // BALANCE COLLECTION (Corrected)
      {
        table: `${tables.balanceLogs} bod`,
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bod.sub_order_id = sop.sub_order_id",
          },
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "sop.order_id = od.order_id",
          },
        ],
        selectField: [
          "COUNT(bod.id) as unit",
          "SUM(bod.paid_amount) as amount",
        ],
        condition: [
          { field: "DATE(bod.added_date)", operator: "=", value: todayDate },
          { field: "bod.paid_amount", operator: ">", value: 0 },
          { field: "od.user_id", operator: "<>", value: 0 },
        ],
      },
      {
        table: `${tables.balanceLogs} bod`,
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bod.sub_order_id = sop.sub_order_id",
          },
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "sop.order_id = od.order_id",
          },
        ],
        selectField: [
          "COUNT(bod.id) as unit",
          "SUM(bod.paid_amount) as amount",
        ],
        condition: [
          {
            field: "DATE(bod.added_date)",
            operator: "BETWEEN",
            value: [currentStartMonth, currentEndMonth],
          },
          { field: "bod.paid_amount", operator: ">", value: 0 },
          { field: "od.user_id", operator: "<>", value: 0 },
        ],
      },
      {
        table: `${tables.balanceLogs} bod`,
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bod.sub_order_id = sop.sub_order_id",
          },
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "sop.order_id = od.order_id",
          },
        ],
        selectField: [
          "COUNT(bod.id) as unit",
          "SUM(bod.paid_amount) as amount",
        ],
        condition: [
          {
            field: "DATE(bod.added_date)",
            operator: "BETWEEN",
            value: [lastStartMonth, lastEndMonth],
          },
          { field: "bod.paid_amount", operator: ">", value: 0 },
          { field: "od.user_id", operator: "<>", value: 0 },
        ],
      },
      {
        table: `${tables.balanceLogs} bod`,
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bod.sub_order_id = sop.sub_order_id",
          },
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "sop.order_id = od.order_id",
          },
        ],
        selectField: [
          "COUNT(bod.id) as unit",
          "SUM(bod.paid_amount) as amount",
        ],
        condition: [
          {
            field: "DATE(bod.added_date)",
            operator: "BETWEEN",
            value: [financialYearStartStr, financialYearEndStr],
          },
          { field: "bod.paid_amount", operator: ">", value: 0 },
          { field: "od.user_id", operator: "<>", value: 0 },
        ],
      },
    ]);

    console.log("Raw Results:", results);
    const parseResult = (result) => ({
      unit: parseInt(result?.unit ?? 0),
      amount: parseFloat(result?.amount ?? 0),
    });

    const data = {
      sales: {
        today: parseResult(results[0]),
        currentMonth: parseResult(results[1]),
        lastMonth: parseResult(results[2]),
        year: parseResult(results[3]),
      },
      balance: {
        today: parseResult(results[4]),
        currentMonth: parseResult(results[5]),
        lastMonth: parseResult(results[6]),
        year: parseResult(results[7]),
      },
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Total Collections fetched successfully",
      data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in totalCollections:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesSource = async (req, res, next) => {
  try {
    const { year } = req.query;

    const selectFields = [
      `COUNT(CASE WHEN od.payment_mode = '1' THEN 1 END) AS cash_cps`,
      `COUNT(CASE WHEN od.payment_mode = '2' THEN 1 END) AS Cheque`,
      `COUNT(CASE WHEN od.payment_mode = '3' THEN 1 END) AS NEFT`,
      `COUNT(CASE WHEN od.payment_mode = '4' THEN 1 END) AS GooglePay`,
      `COUNT(CASE WHEN od.payment_mode = '5' THEN 1 END) AS PhonePe`,
      `COUNT(CASE WHEN od.payment_mode = '6' THEN 1 END) AS Razorpay`,
      `COUNT(CASE WHEN od.payment_mode = '7' THEN 1 END) AS PayPal`,
      `COUNT(CASE WHEN od.payment_mode = '8' THEN 1 END) AS WesternUnion`,
      `COUNT(CASE WHEN od.payment_mode = '0' THEN 1 END) AS other`,
      `COUNT(*) AS total_count`,
    ];

    const conditions = [];
    if (year) {
      conditions.push({
        field: `YEAR(od.created_at)`,
        operator: "=",
        value: year,
      });
    }

    const { results } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields,
      conditions,
    });

    const percentages = results.map((row) => {
      const total = row.total_count || 1;
      return {
        "CPS (Cash)": `${((row.cash_cps / total) * 100).toFixed(2)}%`,
        Cheque: `${((row.Cheque / total) * 100).toFixed(2)}%`,
        NEFT: `${((row.NEFT / total) * 100).toFixed(2)}%`,
        GooglePay: `${((row.GooglePay / total) * 100).toFixed(2)}%`,
        PhonePe: `${((row.PhonePe / total) * 100).toFixed(2)}%`,
        Razorpay: `${((row.Razorpay / total) * 100).toFixed(2)}%`,
        PayPal: `${((row.PayPal / total) * 100).toFixed(2)}%`,
        WesternUnion: `${((row.WesternUnion / total) * 100).toFixed(2)}%`,
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Source fetched successfully",
      data: percentages,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error fetching sales source:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const customerGenders = async (req, res, next) => {
  try {
    const selectFields = [
      `COUNT(CASE WHEN ud.gender = "1" AND user_type = "1" THEN 1 END) AS male_count`,
      `COUNT(CASE WHEN ud.gender = "2" AND user_type = "1" THEN 1 END) AS female_count`,
    ];

    // Fetch current year data
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
    });

    const lastYearSelectFields = [
      `COUNT(CASE WHEN ud.gender = "1" AND user_type = "1" AND YEAR(ud.added_date) < YEAR(CURDATE()) THEN 1 END) AS last_year_male_count`,
      `COUNT(CASE WHEN ud.gender = "2" AND user_type = "1" AND YEAR(ud.added_date) < YEAR(CURDATE()) THEN 1 END) AS last_year_female_count`,
    ];

    // Fetch last year data
    const { results: lastYearResults } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: lastYearSelectFields,
    });

    const currentMaleCount = results[0]?.male_count || 0;
    const currentFemaleCount = results[0]?.female_count || 0;

    const lastYearMaleCount = lastYearResults[0]?.last_year_male_count || 0;
    const lastYearFemaleCount = lastYearResults[0]?.last_year_female_count || 0;
    const maleRisingPercentage =
      lastYearMaleCount > 0
        ? Math.floor(
            ((currentMaleCount - lastYearMaleCount) / lastYearMaleCount) * 100
          )
        : "N/A";

    const femaleRisingPercentage =
      lastYearFemaleCount > 0
        ? Math.floor(
            ((currentFemaleCount - lastYearFemaleCount) / lastYearFemaleCount) *
              100
          )
        : "N/A";
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Customer Genders fetched successfully",
      data: {
        male: {
          count: currentMaleCount,
          isRising: currentMaleCount > lastYearMaleCount,
          risingPercentage: maleRisingPercentage,
        },
        female: {
          count: currentFemaleCount,
          isRising: currentFemaleCount > lastYearFemaleCount,
          risingPercentage: femaleRisingPercentage,
        },
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesTypes = async (req, res, next) => {
  try {
    const { year } = req.query;

    const selectFields = [
      "COUNT(CASE WHEN pm.program_category = 'Basic Stack' THEN 1 END) AS basic_stack",
      "COUNT(CASE WHEN pm.program_category = 'Special Stack' THEN 1 END) AS special_stack",
      "COUNT(CASE WHEN pm.program_category = 'Premium Stack' THEN 1 END) AS premium_stack",
      "COUNT(CASE WHEN pm.program_category = 'Privy Stack' THEN 1 END) AS privy_stack",
      "COUNT(CASE WHEN pm.program_category = 'Platinum Stack' THEN 1 END) AS platinum_stack",
      "COUNT(CASE WHEN pm.program_category = 'Pregnancy' THEN 1 END) AS pregnancy",
      "COUNT(*) AS total_count",
    ];

    const joins = [
      {
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
        type: "LEFT",
      },
    ];

    const conditions = [];
    if (year) {
      conditions.push({
        field: `YEAR(sop.created_at)`,
        operator: "=",
        value: year,
      });
    }

    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields,
      joins,
      conditions,
    });

    const percentages = results.map((row) => {
      const total = Number(row.total_count) || 1;
      return {
        basic_stack: `${((row.basic_stack / total) * 100).toFixed(2)}%`,
        special_stack: `${((row.special_stack / total) * 100).toFixed(2)}%`,
        premium_stack: `${((row.premium_stack / total) * 100).toFixed(2)}%`,
        privy_stack: `${((row.privy_stack / total) * 100).toFixed(2)}%`,
        platinum_stack: `${((row.platinum_stack / total) * 100).toFixed(2)}%`,
        pregnancy: `${((row.pregnancy / total) * 100).toFixed(2)}%`,
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Types fetched successfully",
      data: percentages,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("salesTypes error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const globalClients = async (req, res, next) => {
  try {
    const year = req.query.year; // optional filter
    const yearCondition = year ? `AND YEAR(sop.created_at) = ${year}` : "";

    // 1. Total Clients in India and Abroad
    const clientFields = [
      "SUM(CASE WHEN c.country_name = 'India' AND ud.user_type = '1' THEN 1 ELSE 0 END) AS totalIndiaClients",
      "SUM(CASE WHEN c.country_name != 'India' AND ud.user_type = '1' THEN 1 ELSE 0 END) AS totalAbroadClients",
    ];

    const clientJoins = [
      {
        table: `${tables.countries} c`,
        on: "ud.country_id = c.country_id",
        type: "LEFT",
      },
    ];

    const { results: clientCounts } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: clientFields,
      joins: clientJoins,
    });

    // 2. Stack Distribution
    const stackFields = [
      "SUM(CASE WHEN sop.program_type = 1 THEN 1 ELSE 0 END) AS basicStackCount",
      "SUM(CASE WHEN sop.program_type = 0 THEN 1 ELSE 0 END) AS specialStackCount",
      "SUM(CASE WHEN LOWER(pm.program_name) LIKE '%platinum%' OR LOWER(pm.program_name) LIKE '%premium%' OR LOWER(pm.program_name) LIKE '%khyati%' THEN 1 ELSE 0 END) AS privyPlatinumStackCount",
    ];

    const stackJoins = [
      {
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.user_id = sop.user_id",
        type: "INNER",
      },
      {
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
        type: "LEFT",
      },
    ];

    const { results: stackCounts } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: stackFields,
      joins: stackJoins,
      whereRaw: yearCondition,
    });

    // 3. User Status Summary
    const statusFields = [
      "SUM(CASE WHEN ud.user_status = 'Active' THEN 1 ELSE 0 END) AS activeUsers",
      "SUM(CASE WHEN ud.user_status = 'Completed' THEN 1 ELSE 0 END) AS ocUsers",
      "SUM(CASE WHEN ud.user_type = '0' THEN 1 ELSE 0 END) AS leadCount",
    ];

    const { results: userStatuses } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: statusFields,
    });

    // 4. Order Types
    const orderTypeFields = [
      "SUM(CASE WHEN sop.order_type = 'NEW' THEN 1 ELSE 0 END) AS newOrders",
      "SUM(CASE WHEN sop.order_type = 'OCR' THEN 1 ELSE 0 END) AS ocOrders",
      "SUM(CASE WHEN sop.order_type = 'Renewal' THEN 1 ELSE 0 END) AS renewalOrders",
    ];

    const { results: orderCounts } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: orderTypeFields,
      whereRaw: yearCondition,
    });

    // 5. Top 10 Programs by Revenue
    const programFields = [
      `CASE
        WHEN LOWER(pm.program_name) LIKE '%reform%' OR LOWER(pm.program_name) LIKE '%intermittent fasting%' THEN 'Reform Intermittent'
        WHEN LOWER(pm.program_name) LIKE '%plateau breaker%' THEN 'Plateau Breaker'
        WHEN LOWER(pm.program_name) LIKE '%platinum%' THEN 'Platinum'
        WHEN LOWER(pm.program_name) LIKE '%premium%' THEN 'Premium'
        WHEN LOWER(pm.program_name) LIKE '%with khyati ma' THEN 'Khyati Ma''am Program'
        WHEN LOWER(pm.program_name) LIKE '%body transformation%' THEN 'Body Transformation'
        ELSE TRIM(REPLACE(REPLACE(pm.program_name, ' (Client Exclusive)', ''), ' (Client Exclusive Advanced)', ''))
      END AS program`,
      "COUNT(sop.sub_order_id) AS count",
      "SUM(sop.paid_amount) AS revenue",
    ];

    const programJoins = [
      {
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
        type: "LEFT",
      },
    ];

    const { results: rawProgramStats } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: programFields,
      joins: programJoins,
      groupBy: ["program"],
      whereRaw: yearCondition,
    });

    const totalRevenue = rawProgramStats.reduce(
      (sum, p) => sum + parseFloat(p.revenue),
      0
    );

    const topPrograms = rawProgramStats
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((program) => ({
        ...program,
        revenue: parseFloat(program.revenue),
        contribution: totalRevenue
          ? parseFloat(((program.revenue / totalRevenue) * 100).toFixed(2))
          : 0,
      }));

    // 6. Age Group Distribution (Clients only)
    const ageGroupFields = [
      "SUM(CASE WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) < 20 AND ud.user_type = '1' THEN 1 ELSE 0 END) AS below20",
      "SUM(CASE WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 20 AND 30 AND ud.user_type = '1' THEN 1 ELSE 0 END) AS age20to30",
      "SUM(CASE WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 31 AND 40 AND ud.user_type = '1' THEN 1 ELSE 0 END) AS age31to40",
      "SUM(CASE WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN 41 AND 50 AND ud.user_type = '1' THEN 1 ELSE 0 END) AS age41to50",
      "SUM(CASE WHEN TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) > 50 AND ud.user_type = '1' THEN 1 ELSE 0 END) AS above50",
    ];

    const { results: ageGroupCounts } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ageGroupFields,
    });

    // Final API Response
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Global dashboard metrics fetched successfully",
      data: {
        year: year || "All",
        indiaClients: parseInt(clientCounts[0].totalIndiaClients),
        abroadClients: parseInt(clientCounts[0].totalAbroadClients),
        basicStackCount: parseInt(stackCounts[0].basicStackCount),
        specialStackCount: parseInt(stackCounts[0].specialStackCount),
        privyPlatinumStackCount: parseInt(
          stackCounts[0].privyPlatinumStackCount
        ),
        activeUsers: parseInt(userStatuses[0].activeUsers),
        ocUsers: parseInt(userStatuses[0].ocUsers),
        leadCount: parseInt(userStatuses[0].leadCount),
        newOrders: parseInt(orderCounts[0].newOrders),
        ocOrders: parseInt(orderCounts[0].ocOrders),
        renewalOrders: parseInt(orderCounts[0].renewalOrders),
        topPrograms,
        ageGroups: {
          below20: parseInt(ageGroupCounts[0].below20),
          age20to30: parseInt(ageGroupCounts[0].age20to30),
          age31to40: parseInt(ageGroupCounts[0].age31to40),
          age41to50: parseInt(ageGroupCounts[0].age41to50),
          above50: parseInt(ageGroupCounts[0].above50),
        },
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in globalClients:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const clientBase = async (req, res, next) => {
  try {
    const selectFields = [
      "COUNT(DISTINCT CASE WHEN ud.user_type = '1' THEN ud.user_id END) AS client_count",

      "COUNT(DISTINCT CASE WHEN ud.user_type = '1' AND ud.user_status IN ('Active') and sop.program_status IN ('1','2') THEN ud.user_id END) AS active_client_count",

      "ROUND(SUM(od.order_paid_amount)/COUNT(DISTINCT CASE WHEN ud.user_type = '1' THEN ud.user_id END),2) AS amount_paid",

      "COUNT(sop.sub_order_id) AS total_orders",
    ];

    const joins = [
      {
        table: `${tables.orderDetails} od`,
        on: "ud.user_id = od.user_id",
        type: "LEFT",
      },
      {
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.order_id = od.order_id",
        type: "LEFT",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
    });

    const totalClients = Number(results[0].client_count);
    const totalOrders = Number(results[0].total_orders);

    const avgOrdersPerClient = totalOrders / totalClients;

    const data = {
      ...results[0],
      avg_orders_per_client: (avgOrdersPerClient).toFixed(2),
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Base fetched successfully",
      data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const growthChart = async (req, res, next) => {
  try {
    const { year } = req.query;
    const currentYear = year ? year : moment().year();
    const previousYear = currentYear - 1;

    const selectFieldsCurrentYear = Array.from({ length: 12 }, (_, i) => {
      const startDate = moment()
        .year(currentYear)
        .month(i)
        .startOf("month")
        .format("YYYY-MM-DD");
      const endDate = moment()
        .year(currentYear)
        .month(i)
        .endOf("month")
        .format("YYYY-MM-DD");

      return `SUM(CASE WHEN date(od.order_date) BETWEEN '${startDate}' AND '${endDate}' THEN od.order_paid_amount ELSE 0 END) AS month_${
        i + 1
      }`;
    });

    const selectFieldsPreviousYear = Array.from({ length: 12 }, (_, i) => {
      const startDate = moment()
        .year(previousYear)
        .month(i)
        .startOf("month")
        .format("YYYY-MM-DD");
      const endDate = moment()
        .year(previousYear)
        .month(i)
        .endOf("month")
        .format("YYYY-MM-DD");

      return `SUM(CASE WHEN date(od.order_date) BETWEEN '${startDate}' AND '${endDate}' THEN od.order_paid_amount ELSE 0 END) AS month_${
        i + 1
      }`;
    });

    const { results: currentYearResults } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: selectFieldsCurrentYear,
    });

    const { results: previousYearResults } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: selectFieldsPreviousYear,
    });

    const currentMonthlyTotals = currentYearResults[0] || {};
    const previousMonthlyTotals = previousYearResults[0] || {};

    const monthNames = [
      "Jan",
      "Feb",
      "March",
      "April",
      "May",
      "June",
      "July",
      "Aug",
      "Sept",
      "Oct",
      "Nov",
      "Dec",
    ];

    const data = monthNames.map((month, i) => ({
      month,
      currentYearTotal: Number(currentMonthlyTotals[`month_${i + 1}`] || 0),
      previousYearTotal: Number(previousMonthlyTotals[`month_${i + 1}`] || 0),
    }));

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Growth chart fetched successfully for years ${currentYear} and ${previousYear}`,
      data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const averageProgramPrice = async (req, res, next) => {
  const { order_type = "new", year } = req.query;

  const queryYear = year ? moment(`${year}-01-01`) : moment().startOf("year");

  try {
    const selectFields = [
      "pm.program_name",
      "pm.program_id",
      `MAX(sop.paid_amount + COALESCE(sop.balance_amount,0)) AS highest_price`,
      `MIN(sop.paid_amount + COALESCE(sop.balance_amount,0)) AS lowest_price`,
    ];

    const conditions = [
      {
        field: "pm.program_category",
        operator: "IN",
        value: [
          "Special Stack",
          "Premium Stack",
          "Privy Stack",
          "Platinum Stack",
        ],
      },
      {
        field: "lower(sop.order_type)",
        operator: "=",
        value: order_type.toLowerCase(),
      },
      {
        field: `DATE(od.order_date)`,
        operator: ">=",
        value: queryYear.format("YYYY-MM-DD"),
      },
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "pm.program_id = sop.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: "sop.sub_order_id = od.order_id",
      },
    ];

    const groupBy = ["pm.program_id"];

    const { results } = await readRecord({
      table: `${tables.programsMaster} pm`,
      conditions,
      selectFields,
      joins,
      groupBy,
    });

    if (!results || results.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: `${order_type} Program prices fetched successfully`,
        data: [],
      });
      return res.status(200).json(apiresponse);
    }
    const data = results.map((program) => ({
      program_name: program.program_name,
      program_short: program.program_short_name,
      program_id: program.program_id,
      highest_price: Number(program.highest_price).toFixed(2),
      lowest_price: Number(program.lowest_price).toFixed(2),
    }));

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `${order_type} Program prices fetched successfully`,
      data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const clientsWithHealthConditions = async (req, res, next) => {
  try {
    const selectFields = ["ud.health_conditions", "COUNT(*) AS count"];
    const conditions = [
      {
        field: "ud.user_type",
        operator: "=",
        value: "1",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions,
      groupBy: ["ud.health_conditions"],
    });

    const conditionCount = {};

    results.forEach((item) => {
      console.log(item.health_conditions, "Processing health_conditions");

      const conditionString = item.health_conditions
        ? item.health_conditions.replace(/'/g, '"')
        : null;

      let conditionsArray;
      try {
        conditionsArray = conditionString ? JSON.parse(conditionString) : [];
      } catch (error) {
        console.warn(
          `Failed to parse health_conditions for a record: ${error.message}`
        );
        return;
      }

      const uniqueConditions = new Set(
        conditionsArray.map((cond) => cond.trim()).filter(Boolean)
      );

      // Aggregate counts for each condition
      uniqueConditions.forEach((condition) => {
        conditionCount[condition] =
          (conditionCount[condition] || 0) + parseInt(item.count, 10);
      });
    });

    // Sort conditions by count and take the top 6
    const sortedConditions = Object.entries(conditionCount)
      .sort(([, countA], [, countB]) => countB - countA)
      .slice(0, 6);

    const response = Object.fromEntries(sortedConditions);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Top 6 health conditions fetched successfully",
      data: response,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in clientsWithHealthConditions:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const balanceWalletAnalysis = async (req, res, next) => {
  try {
    const startOfYear = moment().startOf("year").format("YYYY-MM-DD");

    const data = await readRecordUnion([
      // 1. Total at Start of Year
      {
        table: `${tables.walletLog} wl`,
        selectField: [
          "SUM(wl.balance_amount) AS total",
          "'total_at_start_of_year' AS type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "wl.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `(SELECT user_id, MIN(date) AS first_date FROM wallet_log WHERE date >= '${startOfYear}' GROUP BY user_id) as first_entry`,
            on: "wl.user_id = first_entry.user_id AND wl.date = first_entry.first_date",
          },
        ],
        condition: [
          { field: "wl.trans_type", operator: "=", value: "C" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 2. Wallet Added This Year
      {
        table: `${tables.walletLog} wl`,
        selectField: [
          "SUM(wl.amount) AS total",
          "'wallet_added_this_year' AS type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "wl.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "wl.date", operator: ">=", value: `${startOfYear}` },
          { field: "wl.trans_type", operator: "=", value: "C" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 3. Wallet Used for Program Purchase
      {
        table: `${tables.walletLog} wl`,
        selectField: [
          "SUM(wl.amount) AS total",
          "'total_wallet_used_for_program_purchase' AS type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "wl.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "wl.date", operator: ">=", value: `${startOfYear}` },
          { field: "wl.trans_type", operator: "=", value: "D" },
          { field: "wl.action", operator: "=", value: "Program Purchased" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 4. Wallet Lapsed
      {
        table: `${tables.walletLog} wl`,
        selectField: [
          "SUM(wl.amount) AS total",
          "'total_wallet_lapsed' AS type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "wl.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "wl.date", operator: ">=", value: `${startOfYear}` },
          { field: "wl.trans_type", operator: "=", value: "D" },
          { field: "wl.action", operator: "LIKE", value: "policy" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 5. Net Wallet Money
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "SUM(ud.my_wallet) AS total",
          "'net_wallet_money' AS type",
        ],
        condition: [{ field: "ud.user_type", operator: "=", value: "1" }],
      },
      // wallet lapsed this month
      {
        table: `${tables.walletLog} wl`,
        selectField: [
          "SUM(wl.amount) AS total",
          "'wallet_lapsed_this_month' AS type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "wl.user_id = ud.user_id",
          },
        ],
        condition: [
          {
            field: "wl.date",
            operator: "BETWEEN",
            value: [
              `"${moment().startOf("month").format("YYYY-MM-DD")}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
          { field: "wl.trans_type", operator: "=", value: "D" },
          { field: "wl.action", operator: "LIKE", value: "policy" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },
    ]);
    console.log(data, 1304);
    const walletAddedThisYear = data[1].total;
    const walletUsedForProgramPurchase = data[2].total;
    const percentage =
      walletAddedThisYear > 0
        ? ((walletUsedForProgramPurchase / walletAddedThisYear) * 100).toFixed(
            2
          )
        : 0;
    console.log(percentage, 1373);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Wallet analysis fetched successfully`,
      data: {
        start_of_year_wallet: data[0].total ?? 0,
        current_year_wallet: data[1].total ?? 0,
        lapsed_wallet: data[3].total ?? 0,
        net_wallet: data[4].total ?? 0,
        this_month_lapsed_wallet: data[5].total ?? 0,
        wallet_used_for_program: data[2].total ?? 0,
        wallet_used_program: `${percentage} %`,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const balanceWalletAnalysisMonthYear = async (req, res, next) => {
  try {
    const qYear = Number(req.query.year);
    const qMonth = Number(req.query.month);
    const now = moment();

    const targetYear = Number.isInteger(qYear) ? qYear : now.year();

    const hasMonth = Number.isInteger(qMonth) && qMonth >= 1 && qMonth <= 12;

    const startDate = hasMonth
      ? moment({ year: targetYear, month: qMonth - 1 }).startOf("month").format("YYYY-MM-DD")
      : moment({ year: targetYear, month: 0 }).startOf("year").format("YYYY-MM-DD");

    const endDate = hasMonth
      ? moment({ year: targetYear, month: qMonth - 1 }).endOf("month").format("YYYY-MM-DD")
      : moment({ year: targetYear, month: 11 }).endOf("year").format("YYYY-MM-DD");

    const data = await readRecordUnion([
      // 1. Wallet at Start of Period
      {
        table: `${tables.walletLog} wl`,
        selectField: [
          "SUM(wl.balance_amount) AS total",
          "'total_at_start_of_period' AS type",
        ],
        join: [
          { type: "LEFT", table: `${tables.userDetails} ud`, on: "wl.user_id = ud.user_id" },
          {
            type: "INNER",
            table: `(SELECT user_id, MIN(date) AS first_date 
                     FROM wallet_log 
                     WHERE date >= '${startDate}' AND date <= '${endDate}'
                     GROUP BY user_id) as first_entry`,
            on: "wl.user_id = first_entry.user_id AND wl.date = first_entry.first_date",
          },
        ],
        condition: [
          { field: "wl.trans_type", operator: "=", value: "C" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 2. Wallet Added in Period
      {
        table: `${tables.walletLog} wl`,
        selectField: ["SUM(wl.amount) AS total", "'wallet_added_in_period' AS type"],
        join: [{ type: "LEFT", table: `${tables.userDetails} ud`, on: "wl.user_id = ud.user_id" }],
        condition: [
          { field: "wl.date", operator: "BETWEEN", value: [`"${startDate}"`, `"${endDate}"`], raw: true },
          { field: "wl.trans_type", operator: "=", value: "C" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 3. Wallet Used for Program Purchase
      {
        table: `${tables.walletLog} wl`,
        selectField: ["SUM(wl.amount) AS total", "'total_wallet_used_for_program_purchase' AS type"],
        join: [{ type: "LEFT", table: `${tables.userDetails} ud`, on: "wl.user_id = ud.user_id" }],
        condition: [
          { field: "wl.date", operator: "BETWEEN", value: [`"${startDate}"`, `"${endDate}"`], raw: true },
          { field: "wl.trans_type", operator: "=", value: "D" },
          { field: "wl.action", operator: "LIKE", value: "Program Purchased" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 4. Wallet Lapsed
      {
        table: `${tables.walletLog} wl`,
        selectField: ["SUM(wl.amount) AS total", "'total_wallet_lapsed' AS type"],
        join: [{ type: "LEFT", table: `${tables.userDetails} ud`, on: "wl.user_id = ud.user_id" }],
        condition: [
          { field: "wl.date", operator: "BETWEEN", value: [`"${startDate}"`, `"${endDate}"`], raw: true },
          { field: "wl.trans_type", operator: "=", value: "D" },
          { field: "wl.action", operator: "LIKE", value: "policy" },
          { field: "ud.user_type", operator: "=", value: "1" },
        ],
      },

      // 5. Net Wallet (current snapshot)
      {
        table: `${tables.userDetails} ud`,
        selectField: ["SUM(ud.my_wallet) AS total", "'net_wallet_money' AS type"],
        condition: [{ field: "ud.user_type", operator: "=", value: "1" }],
      },
    ]);

    const walletAdded = Number(data[1].total) || 0;
    const walletUsedForProgram = Number(data[2].total) || 0;

    const percentage =
      walletAdded > 0 ? ((walletUsedForProgram / walletAdded) * 100).toFixed(2) : "0.00";

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Wallet analysis fetched successfully`,
      data: {
        year: targetYear,
        month: hasMonth ? qMonth : null,

        start_of_period_wallet: data[0].total ?? 0,
        wallet_added_in_period: data[1].total ?? 0,
        wallet_used_for_program: data[2].total ?? 0,
        wallet_lapsed: data[3].total ?? 0,
        net_wallet: data[4].total ?? 0,
        wallet_used_program: `${percentage} %`,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
}; 


const collectionData = async (req, res, next) => {
  try {
    const today = moment().format("YYYY-MM-DD");
    const monthStart = moment().startOf("month").format("YYYY-MM-DD");
    const yearStart = moment()
      .month(3)
      .date(1)
      .year(moment().year())
      .format("YYYY-MM-DD");

    const baseConditions = (extra = []) => [
      ...extra,
      { field: "user_id", operator: "<>", value: 0 },
    ];

    const result = await readRecordUnion([
      // PG
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'PG' AS type`,
          `'today' AS period`,
          `COUNT(DISTINCT order_id) AS count`,
          `SUM(order_paid_amount) AS amount`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "payment_mode", operator: "IN", value: "(6,7)", raw: true },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'PG'`,
          `'month'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${monthStart}"`, `"${today}"`],
            raw: true,
          },
          { field: "payment_mode", operator: "IN", value: "(6,7)", raw: true },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'PG'`,
          `'year'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN order_paid_amount ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${yearStart}"`, `"${today}"`],
            raw: true,
          },
          { field: "payment_mode", operator: "IN", value: "(6,7)", raw: true },
        ]),
      },

      // Bank/Cheque
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Bank/Cheque'`,
          `'today'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "payment_mode", operator: "=", value: 3 },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Bank/Cheque'`,
          `'month'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${monthStart}"`, `"${today}"`],
            raw: true,
          },
          { field: "payment_mode", operator: "=", value: 3 },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Bank/Cheque'`,
          `'year'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN order_paid_amount ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${yearStart}"`, `"${today}"`],
            raw: true,
          },
          { field: "payment_mode", operator: "=", value: 3 },
        ]),
      },

      // CPS
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'CPS'`,
          `'today'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "payment_mode", operator: "=", value: 1 },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'CPS'`,
          `'month'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${monthStart}"`, `"${today}"`],
            raw: true,
          },
          { field: "payment_mode", operator: "=", value: 1 },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'CPS'`,
          `'year'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN order_paid_amount ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${yearStart}"`, `"${today}"`],
            raw: true,
          },
          { field: "payment_mode", operator: "=", value: 1 },
        ]),
      },

      // Other
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Other'`,
          `'today'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "",
            operator: "",
            value:
              "(DATE(order_date) = CURRENT_DATE() AND (payment_mode NOT IN (1, 3, 6, 7) OR payment_mode IS NULL))",
            raw: true,
          },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Other'`,
          `'month'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(order_paid_amount)`,
        ],
        condition: baseConditions([
          {
            field: "",
            operator: "",
            value: `(DATE(order_date) BETWEEN "${monthStart}" AND "${today}" AND (payment_mode NOT IN (1, 3, 6, 7) OR payment_mode IS NULL))`,
            raw: true,
          },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Other'`,
          `'year'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN order_paid_amount ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "",
            operator: "",
            value: `(DATE(order_date) BETWEEN "${yearStart}" AND "${today}" AND (payment_mode NOT IN (1, 3, 6, 7) OR payment_mode IS NULL))`,
            raw: true,
          },
        ]),
      },

      // Total
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Total'`,
          `'today'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN (order_paid_amount + order_balance_amount) ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Total'`,
          `'month'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN (order_paid_amount + order_balance_amount) ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${monthStart}"`, `"${today}"`],
            raw: true,
          },
        ]),
      },
      {
        table: `${tables.orderDetails}`,
        selectField: [
          `'Total'`,
          `'year'`,
          `COUNT(DISTINCT order_id)`,
          `SUM(CASE WHEN order_type IS NULL OR order_type != 'free' THEN (order_paid_amount + order_balance_amount) ELSE 0 END)`,
        ],
        condition: baseConditions([
          {
            field: "DATE(order_date)",
            operator: "BETWEEN",
            value: [`"${yearStart}"`, `"${today}"`],
            raw: true,
          },
        ]),
      },
    ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Collection Data fetched successfully",
      data: result,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in collectionData:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const balanceData = async (req, res, next) => {
  const firstDateOfMonth = moment().startOf("month").format("YYYY-MM-DD");
  const firstDateOfYear = moment()
    .month(0)
    .date(1)
    .startOf("day")
    .format("YYYY-MM-DD");

  try {
    const creditSales = await readRecordUnion([
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'today' AS period",
        ],
        condition: [
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'monthly' AS period",
        ],
        condition: [
          {
            field: `DATE(od.order_date)`,
            operator: "BETWEEN",
            value: [
              `"${firstDateOfMonth}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'yearly' AS period",
        ],
        condition: [
          {
            field: `DATE(od.order_date)`,
            operator: "BETWEEN",
            value: [
              `"${firstDateOfYear}"`,
              `"${moment()
                .month(3)
                .date(1)
                .year(moment().year())
                .format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
        ],
      },
    ]);
    console.log(creditSales, 1549);
    const balanceAmountCollection = await readRecordUnion([
      {
        selectField: [
          "SUM(bl.paid_amount) AS amount",
          "COUNT(DISTINCT bl.sub_order_id) AS count",
          "'today' AS period",
        ],
        table: `${tables.balanceLogs} bl`,
        condition: [
          {
            field: "DATE(bl.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bl.sub_order_id = sop.sub_order_id",
          },
        ],
      },
      {
        selectField: [
          "SUM(bl.paid_amount) AS amount",
          "COUNT(DISTINCT bl.sub_order_id) AS count",
          "'monthly' AS period",
        ],
        table: `${tables.balanceLogs} bl`,
        condition: [
          {
            field: "DATE(bl.added_date)",
            operator: "BETWEEN",
            value: [
              `"${firstDateOfMonth}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bl.sub_order_id = sop.sub_order_id",
          },
        ],
      },
      {
        selectField: [
          "SUM(bl.paid_amount) AS amount",
          "COUNT(DISTINCT bl.sub_order_id) AS count",
          "'yearly' AS period",
        ],
        table: `${tables.balanceLogs} bl`,
        condition: [
          {
            field: "DATE(bl.added_date)",
            operator: "BETWEEN",
            value: [
              `"${firstDateOfYear}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "bl.sub_order_id = sop.sub_order_id",
          },
        ],
      },
    ]);
    console.log(balanceAmountCollection, 1615);
    const programShut = await readRecordUnion([
      {
        selectField: [
          "SUM(od.order_balance_amount) AS balance_amount",
          "COUNT(od.order_id) AS count",
          "'today' AS period",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "od.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadStatusLog} lsl`,
            on: "cd.user_id = lsl.user_id",
          },
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) = CURDATE()",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "SUM(od.order_balance_amount) AS balance_amount",
          "COUNT(od.order_id) AS count",
          "'monthly' AS period",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "od.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadStatusLog} lsl`,
            on: "cd.user_id = lsl.user_id",
          },
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) BETWEEN '${firstDateOfMonth}' AND '${moment().format(
              "YYYY-MM-DD"
            )}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "SUM(od.order_balance_amount) AS balance_amount",
          "COUNT(od.order_id) AS count",
          "'yearly' AS period",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "od.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadStatusLog} lsl`,
            on: "cd.user_id = lsl.user_id",
          },
        ],
        condition: [
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) BETWEEN '${firstDateOfYear}' AND '${moment().format(
              "YYYY-MM-DD"
            )}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    console.log(programShut, 1751);
    const netDue = await readRecordUnion([
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'today' AS period",
        ],
        condition: [
          {
            field: "od.due_date",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          },
                    {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed", "Active"],
          },
          {
            field: "ud.sub_user_status",
            operator: "NOT IN",
            value: ["Fs", "Dropout"],
          },
          {
            field: "sp.program_status",
            operator: "IN",
            value: [1, 2, 4],
          }

        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sp`,
            on: "od.order_id = sp.order_id",
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'monthly' AS period",
        ],
        condition: [
          {
            field: `od.due_date `,
            operator: "BETWEEN",
            value: [
              `"${firstDateOfMonth}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          },
                    {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed", "Active"],
          },
          {
            field: "ud.sub_user_status",
            operator: "NOT IN",
            value: ["Fs", "Dropout"],
          },
          {
            field: "sp.program_status",
            operator: "IN",
            value: [1, 2, 4],
          }

        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sp`,
            on: "od.order_id = sp.order_id",
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'yearly' AS period",
        ],
        condition: [
          {
            field: `od.due_date`,
            operator: "BETWEEN",
            value: [
              `"${firstDateOfYear}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          },
                    {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed", "Active"],
          },
          {
            field: "ud.sub_user_status",
            operator: "NOT IN",
            value: ["Fs", "Dropout"],
          },
          {
            field: "sp.program_status",
            operator: "IN",
            value: [1, 2, 4],
          }

        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sp`,
            on: "od.order_id = sp.order_id",
          },
        ],
      },
    ]);
    const overDue = await readRecordUnion([
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'today' AS period",
        ],
        condition: [
          {
            field: "od.due_date",
            operator: "=",
            value: "CURRENT_DATE() - INTERVAL 1 DAY",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
            raw: true,
          },
                    {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed", "Active"],
          },
          {
            field: "ud.sub_user_status",
            operator: "NOT IN",
            value: ["Fs", "Dropout"],
          },
          {
            field: "sp.program_status",
            operator: "IN",
            value: [1, 2, 4],
          }

        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sp`,
            on: "od.order_id = sp.order_id",
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'monthly' AS period",
        ],
        condition: [
          {
            field: `MONTH(od.due_date)`,
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: `YEAR(od.due_date)`,
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "od.due_date",
            operator: "<=",
            value: "CURRENT_DATE() - INTERVAL 1 DAY",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
            raw: true,
          },
                    {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed", "Active"],
          },
          {
            field: "ud.sub_user_status",
            operator: "NOT IN",
            value: ["Fs", "Dropout"],
          },
          {
            field: "sp.program_status",
            operator: "IN",
            value: [1, 2, 4],
          }

        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sp`,
            on: "od.order_id = sp.order_id",
          },
        ],
      },
      {
        table: `${tables.orderDetails} od`,
        selectField: [
          "COUNT(od.order_id) AS count",
          "SUM(od.order_balance_amount) AS balance_amount",
          "'yearly' AS period",
        ],
        condition: [
          {
            field: `od.due_date`,
            operator: "BETWEEN",
            value: [
              `"${firstDateOfYear}"`,
              `"${moment().format("YYYY-MM-DD")}"`,
            ],
            raw: true,
          },
          {
            field: "od.due_date",
            operator: "<=",
            value: "CURRENT_DATE() - INTERVAL 1 DAY",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed", "Active"],
          },
          {
            field: "ud.sub_user_status",
            operator: "NOT IN",
            value: ["Fs", "Dropout"],
          },
          {
            field: "sp.program_status",
            operator: "IN",
            value: [1, 2, 4],
          }
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "od.user_id = ud.user_id",
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sp`,
            on: "od.order_id = sp.order_id",
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Balance data fetched successfully",
      data: {
        credit_sales_today: {
          count: creditSales[0].count,
          balance_amount: creditSales[0].balance_amount ?? 0,
        },
        credit_sales_monthly: {
          count: creditSales[1].count,
          balance_amount: creditSales[1].balance_amount ?? 0,
        },
        credit_sales_yearly: {
          count: creditSales[2].count,
          balance_amount: creditSales[2].balance_amount ?? 0,
        },
        balance_collection_today: {
          count: balanceAmountCollection[0].count,
          balance_amount: balanceAmountCollection[0].amount ?? 0,
        },
        balance_collection_monthly: {
          count: balanceAmountCollection[1].count,
          balance_amount: balanceAmountCollection[1].amount ?? 0,
        },
        balance_collection_yearly: {
          count: balanceAmountCollection[2].count,
          balance_amount: balanceAmountCollection[2].amount ?? 0,
        },
        program_shutdown_today: {
          count: programShut[0].count,
          balance_amount: programShut[0].balance_amount ?? 0,
        },
        program_shutdown_monthly: {
          count: programShut[1].count,
          balance_amount: programShut[1].balance_amount ?? 0,
        },
        program_shutdown_yearly: {
          count: programShut[2].count,
          balance_amount: programShut[2].balance_amount ?? 0,
        },
        net_due_today: {
          count: netDue[0].count,
          balance_amount: netDue[0].balance_amount ?? 0,
        },
        net_due_monthly: {
          count: netDue[1].count,
          balance_amount: netDue[1].balance_amount ?? 0,
        },
        net_due_yearly: {
          count: netDue[2].count,
          balance_amount: netDue[2].balance_amount ?? 0,
        },
        overdue_today: {
          count: overDue[0].count,
          balance_amount: overDue[0].balance_amount ?? 0,
        },
        overdue_monthly: {
          count: overDue[1].count,
          balance_amount: overDue[1].balance_amount ?? 0,
        },
        overdue_yearly: {
          count: overDue[2].count,
          balance_amount: overDue[2].balance_amount ?? 0,
        },
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const countryWiseClients = async (req, res, next) => {
  try {
    const { year, minAge, maxAge, country } = req.query;

    const filters = [`ud.user_type = '1'`];
    if (year) filters.push(`YEAR(sop.created_at) = ${year}`);
    if (minAge && maxAge)
      filters.push(
        `TIMESTAMPDIFF(YEAR, ud.birth_date, CURDATE()) BETWEEN ${minAge} AND ${maxAge}`
      );
    if (country?.toLowerCase() === "nri") {
      filters.push(
        `ud.country_id NOT IN (SELECT country_id FROM countries WHERE country_name = 'India')`
      );
    } else if (country) {
      filters.push(
        `ud.country_id IN (SELECT country_id FROM countries WHERE country_name = '${country}')`
      );
    }

    const globalWhere = `AND ${filters.join(" AND ")}`;

    const { results: countryStats } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "IFNULL(c.country_name, 'Unknown') AS country",
        "COUNT(DISTINCT ud.user_id) AS totalClients",
        "SUM(sop.program_type = 1) AS basicStack",
        "SUM(sop.program_type = 0) AS specialStack",
        "SUM(LOWER(pm.program_name) LIKE '%platinum%' OR LOWER(pm.program_name) LIKE '%khyati%') AS privyPlatinumStack",
        "SUM(ud.user_status = 'Active') AS activeClients",
        "SUM(ud.user_status = 'Completed') AS completedClients",
        "SUM(ud.gender = '1') AS maleCount",
        "SUM(ud.gender = '2') AS femaleCount",
        "SUM(sop.paid_amount) AS totalRevenue",
      ],
      joins: [
        {
          table: `${tables.countries} c`,
          on: "ud.country_id = c.country_id",
          type: "LEFT",
        },
        {
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.user_id = sop.user_id",
          type: "LEFT",
        },
        {
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
          type: "LEFT",
        },
      ],
      groupBy: ["country"],
      whereRaw: globalWhere,
    });

    const { results: cityStats } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "IFNULL(c.country_name, 'Unknown') AS country",
        "IFNULL(ct.city_name, 'Unknown') AS city",
        "COUNT(DISTINCT ud.user_id) AS clientCount",
        "SUM(sop.paid_amount) AS cityRevenue",
      ],
      joins: [
        {
          table: `${tables.countries} c`,
          on: "ud.country_id = c.country_id",
          type: "LEFT",
        },
        {
          table: `${tables.cities} ct`,
          on: "ud.city_id = ct.city_id",
          type: "LEFT",
        },
        {
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.user_id = sop.user_id",
          type: "LEFT",
        },
      ],
      groupBy: ["country", "ct.city_name"],
      whereRaw: globalWhere,
    });

    const citiesByCountry = cityStats.reduce((acc, curr) => {
      const countryKey = curr.country || "Unknown";
      acc[countryKey] = acc[countryKey] || [];
      acc[countryKey].push({
        city: curr.city,
        count: +curr.clientCount,
        revenue: +curr.cityRevenue || 0,
      });
      return acc;
    }, {});
    Object.values(citiesByCountry).forEach((list) =>
      list.sort((a, b) => b.revenue - a.revenue)
    );

    const { results: programStats } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "IFNULL(c.country_name, 'Unknown') AS country",
        `TRIM(REPLACE(REPLACE(REPLACE(pm.program_name, ' (Client Exclusive)', ''), ' (Client Exclusive Advanced)', ''), ' Premium', '')) AS program`,
        "COUNT(sop.sub_order_id) AS count",
        "SUM(sop.paid_amount) AS revenue",
      ],
      joins: [
        {
          table: `${tables.userDetails} ud`,
          on: "sop.user_id = ud.user_id",
          type: "INNER",
        },
        {
          table: `${tables.countries} c`,
          on: "ud.country_id = c.country_id",
          type: "LEFT",
        },
        {
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
          type: "LEFT",
        },
      ],
      groupBy: ["country", "program"],
      whereRaw: globalWhere,
    });

    const topProgramsByCountry = programStats.reduce((acc, curr) => {
      const countryKey = curr.country || "Unknown";
      acc[countryKey] = acc[countryKey] || [];
      acc[countryKey].push({
        program: curr.program,
        count: +curr.count,
        revenue: +curr.revenue || 0,
      });
      return acc;
    }, {});

    for (const [country, programs] of Object.entries(topProgramsByCountry)) {
      const totalRevenue =
        countryStats.find((c) => c.country === country)?.totalRevenue || 0;
      programs.forEach(
        (p) =>
          (p.contribution = totalRevenue
            ? +((p.revenue / totalRevenue) * 100).toFixed(2)
            : 0)
      );
      programs.sort((a, b) => b.revenue - a.revenue);
      topProgramsByCountry[country] = programs.slice(0, 5);
    }

    const finalData = countryStats.map((c) => {
      const male = +c.maleCount;
      const female = +c.femaleCount;
      const total = male + female || 1;
      const countryKey = c.country || "Unknown";
      return {
        country: countryKey,
        totalClients: +c.totalClients,
        basicStack: +c.basicStack,
        specialStack: +c.specialStack,
        privyPlatinumStack: +c.privyPlatinumStack,
        activeClients: +c.activeClients,
        completedClients: +c.completedClients,
        maleClients: male,
        femaleClients: female,
        percentMale: +((male / total) * 100).toFixed(2),
        percentFemale: +((female / total) * 100).toFixed(2),
        totalRevenue: +c.totalRevenue || 0,
        cities: citiesByCountry[countryKey] || [],
        topPrograms: topProgramsByCountry[countryKey] || [],
      };
    });

    let filteredData = finalData;
    if (country?.toLowerCase() === "nri") {
      filteredData = finalData.filter(
        (d) => d.country.toLowerCase() !== "india"
      );
    } else if (country) {
      filteredData = finalData.filter(
        (d) => d.country.toLowerCase() === country.toLowerCase()
      );
    }

    const summary = filteredData.reduce(
      (acc, item) => {
        acc.totalClients += item.totalClients;
        acc.totalRevenue += item.totalRevenue;
        acc.activeClients += item.activeClients;
        acc.completedClients += item.completedClients;
        acc.maleClients += item.maleClients;
        acc.femaleClients += item.femaleClients;
        return acc;
      },
      {
        totalClients: 0,
        totalRevenue: 0,
        activeClients: 0,
        completedClients: 0,
        maleClients: 0,
        femaleClients: 0,
      }
    );

    const safeDivide = (num, denom) => (denom ? +(num / denom).toFixed(2) : 0);
    summary.averageRevenuePerClient = safeDivide(
      summary.totalRevenue,
      summary.totalClients
    );
    summary.percentActiveClients =
      safeDivide(summary.activeClients, summary.totalClients) * 100;
    summary.percentMaleClients =
      safeDivide(summary.maleClients, summary.totalClients) * 100;
    summary.percentFemaleClients =
      safeDivide(summary.femaleClients, summary.totalClients) * 100;

    const newClientWhere = `AND ${[
      ...filters,
      `MONTH(ud.created_at) = MONTH(CURDATE())`,
      `YEAR(ud.created_at) = YEAR(CURDATE())`,
    ].join(" AND ")}`;
    const { results: newClients } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(DISTINCT ud.user_id) AS newClientsThisMonth"],
      whereRaw: newClientWhere,
    });

    summary.newClientsThisMonth = +newClients[0].newClientsThisMonth || 0;

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Country-wise client data fetched successfully",
        summary,
        data: filteredData,
      })
    );
  } catch (error) {
    console.error("Error in countryWiseClients:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getExecutiveSummary = async (req, res, next) => {
  const {
    timeRange,
    startDate,
    endDate,
    programStack,
    regionId,
    countryId,
    stateId,
    cityId,
    age,
    gender,
    clientType,
  } = req.body;

  try {
    const tableList = [
      {
        selectField: `
          COUNT(DISTINCT o.user_id) AS total_clients,
          COUNT(DISTINCT CASE WHEN u.gender = "1" THEN o.user_id END) AS male_count,
          COUNT(DISTINCT CASE WHEN u.gender = "2" THEN o.user_id END) AS female_count,
          SUM(o.order_paid_amount) AS total_revenue,
          ROUND(
            (COUNT(DISTINCT CASE WHEN u.gender = "1" THEN o.user_id END) * 100.0)
              / NULLIF(COUNT(DISTINCT o.user_id), 0), 1
          ) AS male_percentage,
          ROUND(
            (COUNT(DISTINCT CASE WHEN u.gender = "2" THEN o.user_id END) * 100.0)
              / NULLIF(COUNT(DISTINCT o.user_id), 0), 1
          ) AS female_percentage,
          SUM(CASE WHEN pm.program_category = 'Basic Stack' THEN 1 ELSE 0 END) AS basic_stack_count,
          SUM(CASE WHEN pm.program_category = 'Special Stack' THEN 1 ELSE 0 END) AS special_stack_count,
          SUM(CASE WHEN pm.program_category = 'Privy Stack' THEN 1 ELSE 0 END) AS privy_stack_count,
          SUM(CASE WHEN pm.program_category = 'Platinum Stack' THEN 1 ELSE 0 END) AS platinum_stack_count,
          SUM(CASE WHEN FLOOR(DATEDIFF(CURDATE(), u.birth_date) / 365) BETWEEN 18 AND 25 THEN 1 ELSE 0 END) AS age_18_25,
          SUM(CASE WHEN FLOOR(DATEDIFF(CURDATE(), u.birth_date) / 365) BETWEEN 26 AND 35 THEN 1 ELSE 0 END) AS age_26_35,
          SUM(CASE WHEN FLOOR(DATEDIFF(CURDATE(), u.birth_date) / 365) BETWEEN 36 AND 45 THEN 1 ELSE 0 END) AS age_36_45,
          SUM(CASE WHEN FLOOR(DATEDIFF(CURDATE(), u.birth_date) / 365) BETWEEN 46 AND 55 THEN 1 ELSE 0 END) AS age_46_55,
          SUM(CASE WHEN u.gender = "1" AND h.weight_difference BETWEEN 0 AND 2 THEN 1 ELSE 0 END) AS male_stage_1,
          SUM(CASE WHEN u.gender = "1" AND h.weight_difference BETWEEN 3 AND 5 THEN 1 ELSE 0 END) AS male_stage_2,
          SUM(CASE WHEN u.gender = "1" AND h.weight_difference BETWEEN 6 AND 7 THEN 1 ELSE 0 END) AS male_stage_3,
          SUM(CASE WHEN u.gender = "1" AND h.weight_difference >= 8 THEN 1 ELSE 0 END) AS male_stage_4,
          SUM(CASE WHEN u.gender = "2" AND h.weight_difference BETWEEN 0 AND 2 THEN 1 ELSE 0 END) AS female_stage_1,
          SUM(CASE WHEN u.gender = "2" AND h.weight_difference BETWEEN 3 AND 5 THEN 1 ELSE 0 END) AS female_stage_2,
          SUM(CASE WHEN u.gender = "2" AND h.weight_difference BETWEEN 6 AND 7 THEN 1 ELSE 0 END) AS female_stage_3,
          SUM(CASE WHEN u.gender = "2" AND h.weight_difference >= 8 THEN 1 ELSE 0 END) AS female_stage_4
        `,
        table: "order_details o",
        join: [
          {
            type: "LEFT",
            table: "users_details u",
            on: "o.user_id = u.user_id",
          },
          {
            type: "LEFT",
            table: "sub_orders_programs sop",
            on: "sop.order_id = o.order_id",
          },
          {
            type: "LEFT",
            table: "programs_master pm",
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: "bn_client_hs h",
            on: "h.user_id = o.user_id",
          },
        ],
        condition: [],
        groupBy: [],
      },
    ];

    const conditions = [];

    // ——— Time range filters ———
    if (timeRange === "today") {
      conditions.push({
        field: "DATE(o.order_date)",
        operator: "=",
        value: new Date().toISOString().split("T")[0],
      });
    } else if (timeRange === "this_week") {
      conditions.push({
        field: "YEARWEEK(o.order_date,1)",
        operator: "=",
        value: moment().format("YYYYWW"),
      });
    } else if (timeRange === "this_month") {
      conditions.push({
        field: "MONTH(o.order_date)",
        operator: "=",
        value: moment().month() + 1,
      });
      conditions.push({
        field: "YEAR(o.order_date)",
        operator: "=",
        value: moment().year(),
      });
    } else if (timeRange === "this_quarter") {
      conditions.push({
        field: "QUARTER(o.order_date)",
        operator: "=",
        value: moment().quarter(),
      });
      conditions.push({
        field: "YEAR(o.order_date)",
        operator: "=",
        value: moment().year(),
      });
    } else if (timeRange === "this_year") {
      conditions.push({
        field: "YEAR(o.order_date)",
        operator: "=",
        value: moment().year(),
      });
    } else if (timeRange === "custom" && startDate && endDate) {
      conditions.push({
        field: "DATE(o.order_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    // ——— Gender filter ———
    if (gender && gender !== "All") {
      const genderArray = Array.isArray(gender) ? gender : [gender];
      const numericGenders = genderArray
        .map((g) => Number(g))
        .filter((g) => !isNaN(g));
      if (numericGenders.length > 0) {
        conditions.push({
          field: "u.gender",
          operator: "IN",
          value: numericGenders,
        });
      }
    }

    // ——— Age filter ———
    if (age && age.trim !== "" && !age.includes("All")) {
      const [min, max] = age.split("-");
      conditions.push({
        field: "TIMESTAMPDIFF(YEAR,u.birth_date,CURDATE())",
        operator: "BETWEEN",
        value: [parseInt(min), parseInt(max)],
      });
    }

    // ——— Client Type filter ———
    if (clientType && clientType !== "All") {
      conditions.push({
        field: "u.user_status",
        operator: "IN",
        value: Array.isArray(clientType) ? clientType : [clientType],
      });
    }

    // ——— Program Stack filter ———
    if (programStack && programStack.length && !programStack.includes("All")) {
      conditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: programStack,
      });
    }

    // ——— Country / Region filter logic ———
    if (countryId && countryId.length && !countryId.includes("All")) {
      const countryIds = Array.isArray(countryId) ? countryId : [countryId];
      conditions.push({
        field: "u.country_id",
        operator: "IN",
        value: countryIds,
      });
    } else if (regionId && regionId.length && !regionId.includes("All")) {
      const { results: existingCountryId } = await readRecord({
        table: tables.regionsMembers,
        selectFields: ["country_id"],
        conditions: [{ field: "region_id", operator: "IN", value: regionId }],
      });
      const countryIds = existingCountryId.map((row) => row.country_id);
      if (countryIds.length > 0) {
        conditions.push({
          field: "u.country_id",
          operator: "IN",
          value: countryIds,
        });
      } else {
        return res.status(200).json({
          status: "success",
          data: {
            executive_summary: {},
            demographics: {},
          },
        });
      }
    }

    // ——— State filter ———
    if (stateId && stateId.length && !stateId.includes("All")) {
      const stateIds = Array.isArray(stateId) ? stateId : [stateId];
      conditions.push({
        field: "u.state_id",
        operator: "IN",
        value: stateIds,
      });
    }

    // ——— City filter ———
    if (cityId && cityId.length && !cityId.includes("All")) {
      const cityIds = Array.isArray(cityId) ? cityId : [cityId];
      conditions.push({
        field: "u.city_id",
        operator: "IN",
        value: cityIds,
      });
    }

    // Apply conditions to query
    if (conditions.length) {
      tableList[0].condition = conditions;
    }

    // Execute final query
    const [result] = await readRecordUnion(tableList);

    const executiveSummary = {
      total_clients: result.total_clients || 0,
      male_count: result.male_count || 0,
      female_count: result.female_count || 0,
      male_percentage: result.male_percentage || 0,
      female_percentage: result.female_percentage || 0,
      total_revenue: result.total_revenue || 0,
    };

    const demographics = {
      basic_stack_count: result.basic_stack_count || 0,
      special_stack_count: result.special_stack_count || 0,
      privy_stack_count: result.privy_stack_count || 0,
      platinum_stack_count: result.platinum_stack_count || 0,
      age_18_25: result.age_18_25 || 0,
      age_26_35: result.age_26_35 || 0,
      age_36_45: result.age_36_45 || 0,
      age_46_55: result.age_46_55 || 0,
      male_stage_1: result.male_stage_1 || 0,
      male_stage_2: result.male_stage_2 || 0,
      male_stage_3: result.male_stage_3 || 0,
      male_stage_4: result.male_stage_4 || 0,
      female_stage_1: result.female_stage_1 || 0,
      female_stage_2: result.female_stage_2 || 0,
      female_stage_3: result.female_stage_3 || 0,
      female_stage_4: result.female_stage_4 || 0,
    };

    return res.status(200).json({
      status: "success",
      data: {
        executive_summary: executiveSummary,
        demographics,
      },
    });
  } catch (err) {
    console.error("Error in fetching data", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getGeographySummary = async (req, res, next) => {
  const {
    timeRange,
    startDate,
    endDate,
    programStack,
    regionId,
    countryId,
    stateId,
    cityId,
    age,
    gender,
    clientType,
  } = req.body;
  try {
    const tableList = [
      {
        selectField: `
          COUNT(DISTINCT o.user_id) AS total_clients,
          u.country_id,
          c.country_name,
          u.state_id,
          s.state_name,
          u.city_id,
          ct.city_name,
          pm.program_category
        `,
        table: "order_details o",
        join: [
          {
            type: "LEFT",
            table: "users_details u",
            on: "o.user_id = u.user_id",
          },
          {
            type: "LEFT",
            table: "sub_orders_programs sop",
            on: "sop.order_id = o.order_id",
          },
          {
            type: "LEFT",
            table: "programs_master pm",
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: "countries c",
            on: "u.country_id = c.country_id",
          },
          {
            type: "LEFT",
            table: "states s",
            on: "u.state_id = s.state_id",
          },
          {
            type: "LEFT",
            table: "cities ct",
            on: "u.city_id = ct.city_id",
          },
        ],
        condition: [],
        groupBy: [
          "u.country_id",
          "c.country_name",
          "u.state_id",
          "s.state_name",
          "u.city_id",
          "ct.city_name",
          "pm.program_category",
        ],
      },
    ];

    const conditions = [];

    if (timeRange === "today") {
      conditions.push({
        field: "DATE(o.order_date)",
        operator: "=",
        value: new Date().toISOString().split("T")[0],
      });
    } else if (timeRange === "this_week") {
      conditions.push({
        field: "YEARWEEK(o.order_date,1)",
        operator: "=",
        value: moment().format("YYYYWW"),
      });
    } else if (timeRange === "this_month") {
      conditions.push({
        field: "MONTH(o.order_date)",
        operator: "=",
        value: moment().month() + 1,
      });
      conditions.push({
        field: "YEAR(o.order_date)",
        operator: "=",
        value: moment().year(),
      });
    } else if (timeRange === "this_quarter") {
      conditions.push({
        field: "QUARTER(o.order_date)",
        operator: "=",
        value: moment().quarter(),
      });
      conditions.push({
        field: "YEAR(o.order_date)",
        operator: "=",
        value: moment().year(),
      });
    } else if (timeRange === "this_year") {
      conditions.push({
        field: "YEAR(o.order_date)",
        operator: "=",
        value: moment().year(),
      });
    } else if (timeRange === "custom" && startDate && endDate) {
      conditions.push({
        field: "DATE(o.order_date)",
        operator: "BETWEEN",
        value: [startDate, endDate],
      });
    }

    if (gender && gender !== "All") {
      const genderArray = Array.isArray(gender) ? gender : [gender];
      const numericGenders = genderArray
        .map((g) => Number(g))
        .filter((g) => !isNaN(g));
      if (numericGenders.length > 0) {
        conditions.push({
          field: "u.gender",
          operator: "IN",
          value: numericGenders,
        });
      }
    }

    if (age && age.trim !== "" && !age.includes("All")) {
      const [min, max] = age.split("-");
      conditions.push({
        field: "TIMESTAMPDIFF(YEAR,u.birth_date,CURDATE())",
        operator: "BETWEEN",
        value: [parseInt(min), parseInt(max)],
      });
    }

    if (clientType && clientType !== "All") {
      conditions.push({
        field: "u.user_status",
        operator: "IN",
        value: Array.isArray(clientType) ? clientType : [clientType],
      });
    }

    if (programStack && programStack.length && !programStack.includes("All")) {
      conditions.push({
        field: "pm.program_category",
        operator: "IN",
        value: programStack,
      });
    }

    if (countryId && countryId.length && !countryId.includes("All")) {
      const countryIds = Array.isArray(countryId) ? countryId : [countryId];
      conditions.push({
        field: "u.country_id",
        operator: "IN",
        value: countryIds,
      });
    } else if (regionId && regionId.length && !regionId.includes("All")) {
      const { results: existingCountryId } = await readRecord({
        table: tables.regionsMembers,
        selectFields: ["country_id"],
        conditions: [{ field: "region_id", operator: "IN", value: regionId }],
      });
      const countryIds = existingCountryId.map((row) => row.country_id);
      if (countryIds.length > 0) {
        conditions.push({
          field: "u.country_id",
          operator: "IN",
          value: countryIds,
        });
      } else {
        return res.status(200).json({
          status: "success",
          data: {
            geography: {
              countries: {},
              states: {},
              topCities: {},
              programStackByCity: {},
            },
          },
        });
      }
    }

    if (stateId && stateId.length && !stateId.includes("All")) {
      const stateIds = Array.isArray(stateId) ? stateId : [stateId];
      conditions.push({
        field: "u.state_id",
        operator: "IN",
        value: stateIds,
      });
    }

    if (cityId && cityId.length && !cityId.includes("All")) {
      const cityIds = Array.isArray(cityId) ? cityId : [cityId];
      conditions.push({
        field: "u.city_id",
        operator: "IN",
        value: cityIds,
      });
    }

    if (conditions.length) {
      tableList[0].condition = conditions;
    }

    const results = await readRecordUnion(tableList);

    // Process results with deduplication for geographic and program counts
    const uniqueUsersByGeo = new Map();
    const programStackByCityUsers = new Map(); // Track unique user_id per city and program category
    const programStackByCity = {};

    results.forEach((row) => {
      const countryKey = `${row.country_id || "unknown"}_${
        row.country_name || "Unknown"
      }`;
      const stateKey = row.state_name
        ? `${row.state_id || "unknown"}_${row.state_name}`
        : null;
      const cityKey = row.city_name
        ? `${row.city_id || "unknown"}_${row.city_name}`
        : null;

      // Deduplicate geographic counts
      const userGeoKey = `${row.user_id}_${countryKey}_${
        stateKey || "no_state"
      }_${cityKey || "no_city"}`;
      if (!uniqueUsersByGeo.has(userGeoKey)) {
        uniqueUsersByGeo.set(userGeoKey, {
          country_id: row.country_id || null,
          country_name: row.country_name || "Unknown",
          state_id: row.state_id || null,
          state_name: row.state_name || null,
          city_id: row.city_id || null,
          city_name: row.city_name || null,
          total_clients: Number(row.total_clients) || 0,
        });
      }

      // Deduplicate program stack counts per city and program category
      const cityProgramKey = `${row.city_id || "unknown"}_${
        row.city_name || "Unknown"
      }`;
      if (!programStackByCity[cityProgramKey]) {
        programStackByCity[cityProgramKey] = {
          city_id: row.city_id || null,
          city_name: row.city_name || "Unknown",
          basic_stack_count: 0,
          special_stack_count: 0,
          privy_stack_count: 0,
          platinum_stack_count: 0,
        };
      }
      if (row.program_category) {
        const categoryKey = `${row.program_category
          .toLowerCase()
          .replace(/\s+/g, "_")}_count`;
        const userProgramKey = `${row.user_id}_${cityProgramKey}_${row.program_category}`;
        if (!programStackByCityUsers.has(userProgramKey)) {
          programStackByCityUsers.set(userProgramKey, true);
          programStackByCity[cityProgramKey][categoryKey] =
            (programStackByCity[cityProgramKey][categoryKey] || 0) + 1; // Count each user once per category
        }
      }
    });

    // Aggregate geographic counts
    const countries = {};
    const states = {};
    const topCities = {};

    uniqueUsersByGeo.forEach((entry) => {
      countries[entry.country_name] =
        (countries[entry.country_name] || 0) + entry.total_clients;
      if (entry.state_name) {
        states[entry.state_name] =
          (states[entry.state_name] || 0) + entry.total_clients;
      }
      if (entry.city_name) {
        topCities[entry.city_name] =
          (topCities[entry.city_name] || 0) + entry.total_clients;
      }
    });

    // Sort countries by total_clients in descending order and take top 5
    const sortedCountries = Object.fromEntries(
      Object.entries(countries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    );

    // Sort states and topCities by total_clients in descending order and take top 10
    const sortedStates = Object.fromEntries(
      Object.entries(states)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );
    const sortedTopCities = Object.fromEntries(
      Object.entries(topCities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );


    // Sort programStackByCity by total program counts and take top 10
    const programStackByCityArray = Object.values(programStackByCity).map(
      (entry) => ({
        ...entry,
        total_program_count:
          entry.basic_stack_count +
          entry.special_stack_count +
          entry.privy_stack_count +
          entry.platinum_stack_count,
      })
    );
    const sortedProgramStackByCity = programStackByCityArray
      .sort((a, b) => b.total_program_count - a.total_program_count)
      .slice(0, 10);
    const programStackByCityFormatted = Object.fromEntries(
      sortedProgramStackByCity.map(
        ({
          city_name,
          basic_stack_count,
          special_stack_count,
          privy_stack_count,
          platinum_stack_count,
        }) => [
          city_name,
          {
            basic_stack_count,
            special_stack_count,
            privy_stack_count,
            platinum_stack_count,
          },
        ]
      )
    );

    return res.status(200).json({
      status: "success",
      data: {
        geography: {
          countries: sortedCountries,
          states: sortedStates,
          topCities: sortedTopCities,
          programStackByCity: programStackByCityFormatted,
        },
      },
      message:"Hello"
    });
  } catch (error) {
    console.error("Error in fetching geography summary", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  SalesUnits,
  averageProgramPrice,
  balanceData,
  balanceWalletAnalysis,
  clientBase,
  clientsWithHealthConditions,
  collectionData,
  customerGenders,
  globalClients,
  growthChart,
  salesOverview,
  salesSource,
  salesTypes,
  totalCollections,
  countryWiseClients,
  getExecutiveSummary,
  getGeographySummary,
};
// ? Credit sale
// SELECT COUNT(od.order_id),SUM(od.order_mrp-od.order_paid_amount) as balance_amount from order_details od WHERE od.created_at >= CURRENT_DATE()

// ? Balance collection
// SELECT
//     SUM(od.order_mrp - od.order_paid_amount) AS balance_amount,
//     COUNT(od.order_id) as count
// FROM
//     order_details od
// WHERE
//     (od.order_mrp - od.order_paid_amount) > 0
// AND od.due_date = CURRENT_DATE()

// ! find today Fs client
// SELECT *
// FROM lead_status_log
// WHERE JSON_CONTAINS(status_log, '{"updated_status": "Completed", "updated_sub_status": "Fs"}') AND added_date > CURRENT_DATE()
