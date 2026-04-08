import moment from "moment";
import { readPool, writePool } from "../config/dbConnection.js";
import { sendMailUtil } from "../utils/sendEmail.js";

const STATIC_REPORT_TO = "vishalrupani@balancenutrition.in";
const STATIC_REPORT_CC = [
  "teamcounsellor@balancenutrition.in",
  "teammentor@balancenutrition.in",
  "khyatirupani@balancenutrition.in",
  "vaibhav.gonjari@balancenutrition.in",
  "vikram.gupta@balancenutrition.in",
  "accounts@balancenutrition.in",
  "shruti.sambherao@balancenutrition.in",
].join(",");

const safeNum = (value) => Number(value || 0);

const formatNum = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    safeNum(value),
  );

const percent = (num, den) => {
  const n = safeNum(num);
  const d = safeNum(den);
  if (!d) return "0.00";
  return ((n / d) * 100).toFixed(2);
};

const PREFER_WRITE_DB = process.env.PERFORMANCE_ROI_USE_WRITE_DB === "true";
const PERFORMANCE_ROI_QUERY_TIMEOUT_MS = Number(
  process.env.PERFORMANCE_ROI_QUERY_TIMEOUT_MS || 120000,
);

const queryWithDbFallback = async (query, params = [], context = "query") => {
  const primaryPool = PREFER_WRITE_DB ? writePool : readPool;
  const fallbackPool = PREFER_WRITE_DB ? readPool : writePool;
  const primaryName = PREFER_WRITE_DB ? "write" : "read";
  const fallbackName = PREFER_WRITE_DB ? "read" : "write";
  const timedQuery = (pool) =>
    pool.query(
      {
        sql: query,
        timeout: PERFORMANCE_ROI_QUERY_TIMEOUT_MS,
      },
      params,
    );

  try {
    const [rows] = await timedQuery(primaryPool);
    return rows;
  } catch (error) {
    logReportStep("db:primaryFailed", {
      context,
      primary: primaryName,
      fallback: fallbackName,
      code: error?.code,
      message: error?.message,
      timeoutMs: PERFORMANCE_ROI_QUERY_TIMEOUT_MS,
    });
    try {
      const [rows] = await timedQuery(fallbackPool);
      logReportStep("db:fallbackSuccess", {
        context,
        using: fallbackName,
        rowCount: Array.isArray(rows) ? rows.length : undefined,
      });
      return rows;
    } catch (fallbackError) {
      logReportStep("db:fallbackFailed", {
        context,
        using: fallbackName,
        code: fallbackError?.code,
        message: fallbackError?.message,
        timeoutMs: PERFORMANCE_ROI_QUERY_TIMEOUT_MS,
      });
      throw fallbackError;
    }
  }
};

const single = async (query, params = [], context = "single") => {
  const rows = await queryWithDbFallback(query, params, context);
  return rows?.[0] || {};
};

const logReportStep = (step, payload = {}) => {
  console.log(`[PerformanceROI] ${step}`, payload);
};

function getDateContext(inputDate) {
  const parsed = moment(inputDate, "YYYY-MM-DD", true);
  const baseDate = parsed.isValid() ? parsed.clone() : moment().subtract(1, "day");
  const firstDayAdjusted = baseDate.date() === 1;
  const effectiveDate = firstDayAdjusted
    ? baseDate.clone().subtract(1, "day")
    : baseDate;

  const reportDate = effectiveDate.format("YYYY-MM-DD");
  const monthStart = effectiveDate.clone().startOf("month").format("YYYY-MM-DD");
  const monthName = effectiveDate.format("MMMM");
  const year = effectiveDate.format("YYYY");

  return { reportDate, monthStart, monthName, year, firstDayAdjusted };
}

async function getRoleSummary({ roleId, reportDate, monthStart }) {
  const reportDateNextDay = moment(reportDate)
    .add(1, "day")
    .format("YYYY-MM-DD");
  const leadOwnerField = "lal.counsellor_id";
  logReportStep("getRoleSummary:start", {
    roleId,
    reportDate,
    monthStart,
    reportDateNextDay,
    leadOwnerField,
  });

  const leads = await single(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) = ? THEN cd.user_id END) AS daily_leads,
        COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) BETWEEN ? AND ? THEN cd.user_id END) AS mtd_leads,
        COUNT(DISTINCT CASE
          WHEN DATE(JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', JSON_LENGTH(lssl.sales_status_log) - 1, '].timestamp')))) = ?
            AND JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', JSON_LENGTH(lssl.sales_status_log) - 1, '].sales_status'))) = '2'
            AND cd.user_id NOT IN (
              SELECT odh.user_id
              FROM order_details odh
              WHERE odh.user_id = cd.user_id
                AND DATE(odh.order_date) >= DATE(JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', JSON_LENGTH(lssl.sales_status_log) - 1, '].timestamp'))))
            )
          THEN cd.user_id
        END) AS daily_hot_leads,
        COUNT(DISTINCT CASE
          WHEN DATE(JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', JSON_LENGTH(lssl.sales_status_log) - 1, '].timestamp')))) BETWEEN ? AND ?
            AND JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', JSON_LENGTH(lssl.sales_status_log) - 1, '].sales_status'))) = '2'
            AND cd.user_id NOT IN (
              SELECT odh.user_id
              FROM order_details odh
              WHERE odh.user_id = cd.user_id
                AND DATE(odh.order_date) >= DATE(JSON_UNQUOTE(JSON_EXTRACT(lssl.sales_status_log, CONCAT('$[', JSON_LENGTH(lssl.sales_status_log) - 1, '].timestamp'))))
            )
          THEN cd.user_id
        END) AS mtd_hot_leads
      FROM users_details cd
      INNER JOIN lead_assigned_log lal ON lal.user_id = cd.user_id
      LEFT JOIN lead_sale_status_log lssl ON lssl.user_id = cd.user_id
      INNER JOIN admin_users ad ON lal.counsellor_id = ad.admin_user_id
      WHERE ad.is_active = 1
        and ad.admin_user_id !=196  
        AND ad.role_id = ?
        

    `,
    [
      reportDate,
      monthStart,
      reportDate,
      reportDate,
      monthStart,
      reportDate,
      roleId,
    ],
    `getRoleSummary:leads:role-${roleId}`,
  );
  logReportStep("getRoleSummary:leads", { roleId, leads });

  const consults = await single(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = ? THEN csl.user_id END) AS daily_consults,
        COUNT(DISTINCT CASE WHEN DATE(csl.added_date) BETWEEN ? AND ? THEN csl.user_id END) AS mtd_consults
      FROM consultation_log csl
      INNER JOIN admin_users ad ON csl.consultation_by = ad.admin_user_id
      WHERE ad.is_active = 1
        and ad.admin_user_id !=196
        AND ad.role_id = ?
    `,
    [reportDate, monthStart, reportDate, roleId],
    `getRoleSummary:consults:role-${roleId}`,
  );
  logReportStep("getRoleSummary:consults", { roleId, consults });

  const sales = await single(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN DATE(od.order_date) = ? AND IFNULL(od.order_type, 'New') = 'New' THEN od.user_id END) AS daily_sales,
        COUNT(DISTINCT CASE WHEN DATE(od.order_date) BETWEEN ? AND ? AND IFNULL(od.order_type, 'New') = 'New' THEN od.user_id END) AS mtd_sales,
        COALESCE(SUM(CASE WHEN DATE(od.order_date) = ? AND IFNULL(od.order_type, 'New') = 'New' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END),0) AS daily_revenue,
        COALESCE(SUM(CASE WHEN DATE(od.order_date) BETWEEN ? AND ? AND IFNULL(od.order_type, 'New') = 'New' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END),0) AS mtd_revenue,
        COALESCE(SUM(CASE WHEN DATE(od.order_date) = ? AND IFNULL(od.order_type, '') = 'OCR' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END),0) AS daily_ocr_revenue,
        COUNT(DISTINCT CASE WHEN DATE(od.order_date) = ? AND IFNULL(od.order_type, '') = 'OCR' THEN od.user_id END) AS daily_ocr_users,
        COUNT(DISTINCT CASE WHEN DATE(od.order_date) BETWEEN ? AND ? AND IFNULL(od.order_type, '') = 'OCR' THEN od.user_id END) AS mtd_ocr_users,
        COALESCE(SUM(CASE WHEN DATE(od.order_date) BETWEEN ? AND ? AND IFNULL(od.order_type, '') = 'OCR' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END),0) AS mtd_ocr_revenue
      FROM order_details od
      INNER JOIN admin_users ad ON od.sale_by = ad.admin_user_id
      WHERE ad.is_active = 1
        and ad.admin_user_id !=196
        AND ad.role_id = ?
    `,
    [
      reportDate,
      monthStart,
      reportDate,
      reportDate,
      monthStart,
      reportDate,
      reportDate,
      reportDate,
      monthStart,
      reportDate,
      monthStart,
      reportDate,
      roleId,
    ],
    `getRoleSummary:sales:role-${roleId}`,
  );
  logReportStep("getRoleSummary:sales", { roleId, sales });

  const ocrCalls = await single(
    `
      SELECT
        COUNT(CASE WHEN DATE(cu.schedule_date) = ? THEN cu.call_id END) AS daily_due,
        COUNT(CASE WHEN DATE(cu.schedule_date) = ? AND cu.call_status != 0 THEN cu.call_id END) AS daily_done,
        COUNT(CASE WHEN DATE(cu.schedule_date) BETWEEN ? AND ? THEN cu.call_id END) AS mtd_due,
        COUNT(CASE WHEN DATE(cu.schedule_date) BETWEEN ? AND ? AND cu.call_status != 0 THEN cu.call_id END) AS mtd_done
      FROM call_updates cu
      INNER JOIN admin_users ad ON cu.added_by = ad.admin_user_id
      WHERE ad.is_active = 1
        and ad.admin_user_id !=196
        AND ad.role_id = ?
        AND cu.user_type="Completed"
    `,
    [
      reportDate,
      reportDate,
      monthStart,
      reportDate,
      monthStart,
      reportDate,
      roleId,
    ],
    `getRoleSummary:ocrCalls:role-${roleId}`,
  );
  logReportStep("getRoleSummary:ocrCalls", { roleId, ocrCalls });

  logReportStep("getRoleSummary:ocrHot:start", {
    roleId,
    reportDate,
    monthStart,
  });
  const ocrHot = await single(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN sp.updated_date >= ? AND sp.updated_date < ? THEN sp.user_id END) AS daily_ocr_hot,
        COUNT(DISTINCT sp.user_id) AS mtd_ocr_hot
      FROM suggested_program sp
      INNER JOIN admin_users ad ON sp.suggested_by = ad.admin_user_id

      WHERE ad.is_active = 1
        and ad.admin_user_id !=196
        AND ad.role_id = ?
        AND sp.status = 2
        AND sp.updated_date >= ?
        AND sp.updated_date < ?
        AND NOT EXISTS (
          SELECT 1
          FROM order_details od
          WHERE od.user_id = sp.user_id
            AND od.order_date >= sp.updated_date
        )
        AND sp.payment_status = 0
        AND sp.payment_link_id IS NOT NULL
    `,
    [
      reportDate,
      reportDateNextDay,
      roleId,
      monthStart,
      reportDateNextDay,
    ],
    `getRoleSummary:ocrHot:role-${roleId}`,
  );
  logReportStep("getRoleSummary:ocrHot", { roleId, ocrHot });

  const dailyHots =
    safeNum(leads.daily_hot_leads) + safeNum(ocrHot.daily_ocr_hot);
  const mtdHots = safeNum(leads.mtd_hot_leads) + safeNum(ocrHot.mtd_ocr_hot);

  const summary = {
    dailyLeads: safeNum(leads.daily_leads),
    mtdLeads: safeNum(leads.mtd_leads),
    dailyConsults: safeNum(consults.daily_consults),
    mtdConsults: safeNum(consults.mtd_consults),
    dailySales: safeNum(sales.daily_sales),
    mtdSales: safeNum(sales.mtd_sales),
    dailyRevenue: safeNum(sales.daily_revenue),
    mtdRevenue: safeNum(sales.mtd_revenue),
    dailyOcrRevenue: safeNum(sales.daily_ocr_revenue),
    mtdOcrRevenue: safeNum(sales.mtd_ocr_revenue),
    dailyOcrUsers: safeNum(sales.daily_ocr_users),
    mtdOcrUsers: safeNum(sales.mtd_ocr_users),
    dailyOcrPct: percent(ocrCalls.daily_done, ocrCalls.daily_due),
    mtdOcrPct: percent(ocrCalls.mtd_done, ocrCalls.mtd_due),
    dailyOcrDue: safeNum(ocrCalls.daily_due),
    dailyOcrDone: safeNum(ocrCalls.daily_done),
    mtdOcrDue: safeNum(ocrCalls.mtd_due),
    mtdOcrDone: safeNum(ocrCalls.mtd_done),
    dailyHots,
    mtdHots,
  };

  logReportStep("getRoleSummary:done", { roleId, summary });
  return summary;
}

async function getMentorSourceTable({ reportDate, monthStart }) {
  logReportStep("getMentorSourceTable:start", { reportDate, monthStart });

  const sourceRows = await Promise.all(
    [
      { label: "Referrals", condition: "cd.current_lead_source IN (22,23)" },
      {
        label: "Non-Referrals",
        condition:
          "(cd.current_lead_source NOT IN (22,23) OR cd.current_lead_source IS NULL)",
      },
    ].map(async ({ label, condition }) => {
      logReportStep("getMentorSourceTable:source:start", { label, condition });

      const leads = await single(
        `
          SELECT
            COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) = ? THEN cd.user_id END) AS daily_l,
            COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) BETWEEN ? AND ? THEN cd.user_id END) AS mtd_l
          FROM users_details cd
          INNER JOIN lead_assigned_log lal ON lal.user_id = cd.user_id
          INNER JOIN admin_users ad ON lal.counsellor_id = ad.admin_user_id
          WHERE ad.is_active = 1
            and ad.admin_user_id !=196
            AND ad.role_id = 1
            AND ${condition}
        `,
        [reportDate, monthStart, reportDate],
        `getMentorSourceTable:leads:${label}`,
      );
      logReportStep("getMentorSourceTable:source:leads", { label, leads });

      const consults = await single(
        `
          SELECT
            COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = ? THEN csl.user_id END) AS daily_c,
            COUNT(DISTINCT CASE WHEN DATE(csl.added_date) BETWEEN ? AND ? THEN csl.user_id END) AS mtd_c
          FROM consultation_log csl
          INNER JOIN admin_users ad ON csl.consultation_by = ad.admin_user_id
          INNER JOIN users_details cd ON cd.user_id = csl.user_id
          WHERE ad.is_active = 1
            and ad.admin_user_id !=196
            AND ad.role_id = 1
            AND ${condition}
        `,
        [reportDate, monthStart, reportDate],
        `getMentorSourceTable:consults:${label}`,
      );
      logReportStep("getMentorSourceTable:source:consults", {
        label,
        consults,
      });

      const sales = await single(
        `
          SELECT
            COUNT(DISTINCT CASE WHEN DATE(od.order_date) = ? AND IFNULL(od.order_type, 'New') = 'New' THEN od.user_id END) AS daily_s,
            COUNT(DISTINCT CASE WHEN DATE(od.order_date) BETWEEN ? AND ? AND IFNULL(od.order_type, 'New') = 'New' THEN od.user_id END) AS mtd_s
          FROM order_details od
          INNER JOIN admin_users ad ON od.sale_by = ad.admin_user_id
          INNER JOIN users_details cd ON cd.user_id = od.user_id
          WHERE ad.is_active = 1
            AND ad.role_id = 1
            AND ad.admin_user_id !=196
            AND ${condition}
        `,
        [reportDate, monthStart, reportDate],
        `getMentorSourceTable:sales:${label}`,
      );
      logReportStep("getMentorSourceTable:source:sales", { label, sales });

      const mtdC = safeNum(consults.mtd_c);
      const mtdL = safeNum(leads.mtd_l);
      const mtdS = safeNum(sales.mtd_s);

      const sourceSummary = {
        label,
        dailyL: safeNum(leads.daily_l),
        dailyC: safeNum(consults.daily_c),
        dailyS: safeNum(sales.daily_s),
        mtdL,
        mtdC,
        mtdS,
        cs: percent(mtdS, mtdC),
        ls: percent(mtdS, mtdL),
      };

      logReportStep("getMentorSourceTable:source:done", {
        label,
        sourceSummary,
      });
      return sourceSummary;
    }),
  );

  const total = sourceRows.reduce(
    (acc, row) => {
      acc.dailyL += row.dailyL;
      acc.dailyC += row.dailyC;
      acc.dailyS += row.dailyS;
      acc.mtdL += row.mtdL;
      acc.mtdC += row.mtdC;
      acc.mtdS += row.mtdS;
      return acc;
    },
    { dailyL: 0, dailyC: 0, dailyS: 0, mtdL: 0, mtdC: 0, mtdS: 0 },
  );

  const sourceTable = {
    rows: sourceRows,
    total: {
      ...total,
      cs: percent(total.mtdS, total.mtdC),
      ls: percent(total.mtdS, total.mtdL),
    },
  };

  logReportStep("getMentorSourceTable:done", sourceTable);
  return sourceTable;
}

async function getCounselorTable({ reportDate, monthStart }) {
  logReportStep("getCounselorTable:start", { reportDate, monthStart });

  const rows = await queryWithDbFallback(
    `
      SELECT
        ad.admin_user_id,
        COALESCE(ad.crm_user, CONCAT('Counselor ', ad.admin_user_id)) AS counselor_name,
        COALESCE(l.daily_l, 0) AS daily_l,
        COALESCE(l.mtd_l, 0) AS mtd_l,
        COALESCE(c.daily_c, 0) AS daily_c,
        COALESCE(c.mtd_c, 0) AS mtd_c,
        COALESCE(s.daily_s, 0) AS daily_s,
        COALESCE(s.mtd_s, 0) AS mtd_s
      FROM admin_users ad
      LEFT JOIN (
        SELECT
          lal.counsellor_id AS admin_user_id,
          COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) = ? THEN cd.user_id END) AS daily_l,
          COUNT(DISTINCT CASE WHEN DATE(lal.assign_date) BETWEEN ? AND ? THEN cd.user_id END) AS mtd_l
        FROM users_details cd
        INNER JOIN lead_assigned_log lal ON lal.user_id = cd.user_id
        WHERE  lal.counsellor_id IS NOT NULL
        GROUP BY lal.counsellor_id
      ) l ON l.admin_user_id = ad.admin_user_id
      LEFT JOIN (
        SELECT
          csl.consultation_by AS admin_user_id,
          COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = ? THEN csl.user_id END) AS daily_c,
          COUNT(DISTINCT CASE WHEN DATE(csl.added_date) BETWEEN ? AND ? THEN csl.user_id END) AS mtd_c
        FROM consultation_log csl
        GROUP BY csl.consultation_by
      ) c ON c.admin_user_id = ad.admin_user_id
      LEFT JOIN (
        SELECT
          od.sale_by AS admin_user_id,
          COUNT(DISTINCT CASE WHEN DATE(od.order_date) = ? AND IFNULL(od.order_type, 'New') = 'New' THEN od.user_id END) AS daily_s,
          COUNT(DISTINCT CASE WHEN DATE(od.order_date) BETWEEN ? AND ? AND IFNULL(od.order_type, 'New') = 'New' THEN od.user_id END) AS mtd_s
        FROM order_details od
        GROUP BY od.sale_by
      ) s ON s.admin_user_id = ad.admin_user_id
      WHERE ad.is_active = 1
        and ad.admin_user_id !=196
        AND ad.role_id = 2
      HAVING daily_l > 0 OR mtd_l > 0 OR daily_c > 0 OR mtd_c > 0 OR daily_s > 0 OR mtd_s > 0
      ORDER BY mtd_s DESC, mtd_c DESC, mtd_l DESC
    `,
    [
      reportDate,
      monthStart,
      reportDate,
      reportDate,
      monthStart,
      reportDate,
      reportDate,
      monthStart,
      reportDate,
    ],
    "getCounselorTable",
  );
  logReportStep("getCounselorTable:rawRows", { count: rows.length, rows });

  const mapped = rows.map((row) => ({
    counselorName: row.counselor_name,
    dailyL: safeNum(row.daily_l),
    dailyC: safeNum(row.daily_c),
    dailyS: safeNum(row.daily_s),
    mtdL: safeNum(row.mtd_l),
    mtdC: safeNum(row.mtd_c),
    mtdS: safeNum(row.mtd_s),
    cs: percent(row.mtd_s, row.mtd_c),
    ls: percent(row.mtd_s, row.mtd_l),
  }));

  const total = mapped.reduce(
    (acc, row) => {
      acc.dailyL += row.dailyL;
      acc.dailyC += row.dailyC;
      acc.dailyS += row.dailyS;
      acc.mtdL += row.mtdL;
      acc.mtdC += row.mtdC;
      acc.mtdS += row.mtdS;
      return acc;
    },
    { dailyL: 0, dailyC: 0, dailyS: 0, mtdL: 0, mtdC: 0, mtdS: 0 },
  );

  const counselorTable = {
    rows: mapped,
    total: {
      ...total,
      cs: percent(total.mtdS, total.mtdC),
      ls: percent(total.mtdS, total.mtdL),
    },
  };

  logReportStep("getCounselorTable:done", counselorTable);
  return counselorTable;
}

async function getRecipientsFromAdminUsers() {
  const rows = await queryWithDbFallback(
    `
      SELECT DISTINCT ad.email_id
      FROM admin_users ad
      WHERE ad.is_active = 1
        AND ad.role_id IN (1,2)
        AND ad.admin_user_id != 196
        AND ad.email_id IS NOT NULL
        AND ad.email_id != ''
    `,
    [],
    "getRecipientsFromAdminUsers",
  );

  return rows.map((row) => row.email_id).filter(Boolean);
}

async function getPerformanceRoiReportData({ date }) {
  logReportStep("getPerformanceRoiReportData:start", { date });
  logReportStep("getPerformanceRoiReportData:dbMode", {
    preferWrite: PREFER_WRITE_DB,
    primaryPool: PREFER_WRITE_DB ? "write" : "read",
    fallbackPool: PREFER_WRITE_DB ? "read" : "write",
  });

  const { reportDate, monthStart, monthName, year, firstDayAdjusted } =
    getDateContext(date);
  logReportStep("getPerformanceRoiReportData:dateContext", {
    reportDate,
    monthStart,
    monthName,
    year,
    firstDayAdjusted,
  });

  const [mentorSummary, counselorSummary, mentorSourceTable, counselorTable] =
    await Promise.all([
      getRoleSummary({ roleId: 1, reportDate, monthStart }),
      getRoleSummary({ roleId: 2, reportDate, monthStart }),
      getMentorSourceTable({ reportDate, monthStart }),
      getCounselorTable({ reportDate, monthStart }),
    ]);

  const overall = {
    dailyLeads: mentorSummary.dailyLeads + counselorSummary.dailyLeads,
    mtdLeads: mentorSummary.mtdLeads + counselorSummary.mtdLeads,
    dailyCons: mentorSummary.dailyConsults + counselorSummary.dailyConsults,
    mtdCons: mentorSummary.mtdConsults + counselorSummary.mtdConsults,
    dailySales: mentorSummary.dailySales + counselorSummary.dailySales,
    mtdSales: mentorSummary.mtdSales + counselorSummary.mtdSales,
    dailyRevenue: mentorSummary.dailyRevenue + counselorSummary.dailyRevenue,
    mtdRevenue: mentorSummary.mtdRevenue + counselorSummary.mtdRevenue,
    dailyOcrRevenue:
      mentorSummary.dailyOcrRevenue + counselorSummary.dailyOcrRevenue,
    mtdOcrRevenue: mentorSummary.mtdOcrRevenue + counselorSummary.mtdOcrRevenue,
    dailyOcrDue: mentorSummary.dailyOcrDue + counselorSummary.dailyOcrDue,
    dailyOcrDone: mentorSummary.dailyOcrDone + counselorSummary.dailyOcrDone,
    mtdOcrDue: mentorSummary.mtdOcrDue + counselorSummary.mtdOcrDue,
    mtdOcrDone: mentorSummary.mtdOcrDone + counselorSummary.mtdOcrDone,
    dailyOcrUsers: mentorSummary.dailyOcrUsers + counselorSummary.dailyOcrUsers,
    mtdOcrUsers: mentorSummary.mtdOcrUsers + counselorSummary.mtdOcrUsers,
    dailyHots: mentorSummary.dailyHots + counselorSummary.dailyHots,
    mtdHots: mentorSummary.mtdHots + counselorSummary.mtdHots,
  };

  overall.dailyOcrPct = percent(
    mentorSummary.dailyOcrDone + counselorSummary.dailyOcrDone,
    mentorSummary.dailyOcrDue + counselorSummary.dailyOcrDue,
  );
  overall.mtdOcrPct = percent(
    mentorSummary.mtdOcrDone + counselorSummary.mtdOcrDone,
    mentorSummary.mtdOcrDue + counselorSummary.mtdOcrDue,
  );

  const report = {
    meta: { reportDate, monthStart, monthName, year, firstDayAdjusted },
    overall,
    mentorSummary,
    counselorSummary,
    mentorSourceTable,
    counselorTable,
  };

  logReportStep("getPerformanceRoiReportData:done", {
    reportDate,
    overall,
  });
  return report;
}

function buildPerformanceRoiReportHtml(report) {
  const {
    meta,
    overall,
    mentorSummary,
    counselorSummary,
    mentorSourceTable,
    counselorTable,
  } = report;

  const readableReportDate = moment(
    meta.reportDate,
    "YYYY-MM-DD",
    true,
  ).isValid()
    ? moment(meta.reportDate, "YYYY-MM-DD").format("DD MMM YYYY")
    : meta.reportDate;
  const isLastMonthReport = Boolean(meta.firstDayAdjusted);

  const mentorRows = mentorSourceTable.rows
    .map(
      (row) => `
                    <tr>
                        <td style="text-align:left;"><strong>${row.label}</strong></td>
                        ${
                          isLastMonthReport
                            ? ""
                            : `<td>${formatNum(row.dailyL)}</td><td>${formatNum(row.dailyC)}</td><td>${formatNum(row.dailyS)}</td>`
                        }
                        <td>${formatNum(row.mtdL)}</td><td>${formatNum(row.mtdC)}</td><td>${formatNum(row.mtdS)}</td>
                        <td class="met">${row.cs}%</td><td class="met">${row.ls}%</td>
                    </tr>
      `,
    )
    .join("");

  const counselorRows = counselorTable.rows.length
    ? counselorTable.rows
        .map(
          (row) => `
                    <tr>
                        <td style="text-align:left;">${row.counselorName}</td>
                        ${
                          isLastMonthReport
                            ? ""
                            : `<td>${formatNum(row.dailyL)}</td><td>${formatNum(row.dailyC)}</td><td>${formatNum(row.dailyS)}</td>`
                        }
                        <td>${formatNum(row.mtdL)}</td><td>${formatNum(row.mtdC)}</td><td>${formatNum(row.mtdS)}</td>
                        <td class="met">${row.cs}%</td><td class="met">${row.ls}%</td>
                    </tr>
          `,
        )
        .join("")
    : `
                    <tr>
                        <td colspan="${isLastMonthReport ? 6 : 9}" style="text-align:left;">No active counselor data found.</td>
                    </tr>
      `;

  const renderKpiCards = (cards) => {
    const rows = [];
    for (let index = 0; index < cards.length; index += 2) {
      const left = cards[index];
      const right = cards[index + 1];

      const cell = (card) => {
        if (!card)
          return '<td class="kpi-cell" style="width:50%; padding:4px;"></td>';

        return `
          <td class="kpi-cell" style="width:50%; padding:4px; vertical-align:top;">
            <table class="kpi-card" border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #ddd; border-radius:8px; background:#fff;">
              <tr>
                <td class="kpi-inner" style="padding:10px; text-align:center;">
                  <div class="kpi-label" style="font-size:10px; text-transform:uppercase; color:#666; font-weight:bold; margin-bottom:5px;">${card.label}</div>
                  <div class="kpi-value" style="font-size:16px; font-weight:bold; color:#333;">${card.value}</div>
                  ${
                    isLastMonthReport
                      ? ""
                      : `<div class="kpi-sub" style="font-size:11px; color:#1a237e; font-weight:600; margin-top:6px; border-top:1px solid #eee; padding-top:6px;">Yesterday: ${card.yesterday}</div>`
                  }
                </td>
              </tr>
            </table>
          </td>
        `;
      };

      rows.push(`<tr>${cell(left)}${cell(right)}</tr>`);
    }

    return `
      <table class="kpi-table" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;">
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    `;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta charset="UTF-8">
    <title>Performance & ROI Dashboard (MTD)</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.4; margin: 0; padding: 0; background-color: #f4f7f6; }
      .wrapper { width: 100%; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 0; box-sizing: border-box; }
        .header { background: #1a237e; color: white; padding: 14px 10px; text-align: center; border-radius: 0; margin: -12px -12px 12px -12px; }
        .overall-summary { background: #fff; border: 2px solid #1a237e; border-radius: 8px; padding: 12px; margin-bottom: 20px; }
        .overall-title { color: #1a237e; font-size: 15px; font-weight: bold; margin-bottom: 12px; text-transform: uppercase; text-align: center; }
        .nav-buttons { display: flex; gap: 10px; margin: 20px 0; }
        .nav-btn { flex: 1; padding: 12px; text-align: center; font-weight: bold; text-transform: uppercase; border-radius: 6px; border: 2px solid #ccc; background: #f8f9fa; color: #666; }
        .section-container { margin-bottom: 20px; padding: 12px; border-radius: 8px; }
        .mentor-bg { background-color: #f9fff9; border: 1px solid #c8e6c9; }
        .counselor-bg { background-color: #f9faff; border: 1px solid #c5cae9; }
        .section-title { font-size: 15px; font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .mentor-title { color: #2e7d32; border-bottom: 3px solid #2e7d32; }
        .counselor-title { color: #1a237e; border-bottom: 3px solid #1a237e; }
      .grid { text-align: left; margin-bottom: 25px; font-size: 0; }
      .card { display: inline-block; width: calc(50% - 10px); min-width: 0; margin: 0 5px 10px; padding: 10px; background: #fff; border-radius: 8px; text-align: center; border: 1px solid #ddd; vertical-align: top; box-sizing: border-box; font-size: 12px; }
        .lab { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; display: block; margin-bottom: 5px; }
        .val { font-size: 18px; font-weight: bold; color: #333; display: block; }
        .mtd-val { font-size: 11px; color: #1a237e; font-weight: 600; margin-top: 6px; border-top: 1px solid #eee; padding-top: 6px; }
        .kpi-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0 0 20px 0; }
        .kpi-card { border-collapse: separate; border-spacing: 0; }
        .table-wrap { width: 100%; overflow-x: visible; margin-bottom: 15px; }
        table.data-table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; background: #fff; font-size: 9px; margin-bottom: 0; }
        table.data-table th { background: #f1f3f4; color: #444; padding: 5px 3px; border: 1px solid #ccc; text-transform: uppercase; font-size: 9px; line-height: 1.25; white-space: normal; word-break: break-word; }
        table.data-table td { padding: 5px 3px; border: 1px solid #ddd; text-align: center; line-height: 1.25; white-space: normal; word-break: break-word; }
        .bg-total { background-color: #fcfcfc; font-weight: bold; }
        .met { color: #2e7d32; font-weight: bold; }
        .footer-note { font-size: 11px; color: #777; text-align: center; margin-top: 30px; font-style: italic; border-top: 1px solid #ddd; padding-top: 10px; }
        .hots-text { color: #d32f2f; }
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f6;">
      <tr>
        <td align="center" style="padding: 0;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%; max-width: 600px; background-color: #ffffff;">
            <tr>
              <td>
                <div class="wrapper">
        <div class="header">
            <h2 style="margin:0;">Performance & ROI Report</h2>
            <p style="margin:5px 0 0 0; opacity: 0.8;">Date: 
          ${readableReportDate} | ${meta.monthName} ${meta.year}${isLastMonthReport ? " (Last Month Report)" : ""}</p>
        </div>

        <div class="overall-summary">
            <div class="overall-title">Overall BN (Lead & OCR) Summary (MTD)</div>
          ${renderKpiCards([
            {
              label: "Total Leads",
              value: formatNum(overall.mtdLeads),
              yesterday: formatNum(overall.dailyLeads),
            },
            {
              label: "Total Consults",
              value: formatNum(overall.mtdCons),
              yesterday: formatNum(overall.dailyCons),
            },
            {
              label: "Total Sales Units",
              value: formatNum(overall.mtdSales),
              yesterday: formatNum(overall.dailySales),
            },
            {
              label: "Total Leads Revenue",
              value: `₹${formatNum(overall.mtdRevenue)}`,
              yesterday: `₹${formatNum(overall.dailyRevenue)}`,
            },
            {
              label: "OCR Calls",
              value: overall.mtdOcrDone,
              yesterday: overall.dailyOcrDone,
            },
            {
              label: "OCR Revenue",
              value: `₹${formatNum(overall.mtdOcrRevenue)} <span style="font-size:10px; font-weight:600; color:#666;">(${formatNum(overall.mtdOcrUsers)} Unit)</span>`,
              yesterday: `₹${formatNum(overall.dailyOcrRevenue)} <span style="font-size:8px; font-weight:600; color:#666;">(${formatNum(overall.dailyOcrUsers)} Unit)</span>`,
            },
            {
              label: "Total HOTS",
              value: `<span style="color:#d32f2f;">${formatNum(overall.mtdHots)}</span>`,
              yesterday: formatNum(overall.dailyHots),
            },
          ])}
        </div>

        <div class="section-container mentor-bg">
            <div class="section-title mentor-title">Mentor Summary</div>
            ${renderKpiCards([
              {
                label: "Leads",
                value: formatNum(mentorSummary.mtdLeads),
                yesterday: formatNum(mentorSummary.dailyLeads),
              },
              {
                label: "Consults",
                value: formatNum(mentorSummary.mtdConsults),
                yesterday: formatNum(mentorSummary.dailyConsults),
              },
              {
                label: "Sales Units",
                value: formatNum(mentorSummary.mtdSales),
                yesterday: formatNum(mentorSummary.dailySales),
              },
              {
                label: "Leads Revenue",
                value: `₹${formatNum(mentorSummary.mtdRevenue)}`,
                yesterday: `₹${formatNum(mentorSummary.dailyRevenue)}`,
              },
              {
                label: "OCR Calls",
                value: mentorSummary.mtdOcrDone,
                yesterday: mentorSummary.dailyOcrDone,
              },
              {
                label: "OCR Revenue",
                value: `₹${formatNum(mentorSummary.mtdOcrRevenue)} <span style="font-size:10px; font-weight:600; color:#666;">(${formatNum(mentorSummary.mtdOcrUsers)} Unit)</span>`,
                yesterday: `₹${formatNum(mentorSummary.dailyOcrRevenue)} <span style="font-size:8px; font-weight:600; color:#666;">(${formatNum(mentorSummary.dailyOcrUsers)} Unit)</span>`,
              },
              {
                label: "HOTS",
                value: `<span style="color:#d32f2f;">${formatNum(mentorSummary.mtdHots)}</span>`,
                yesterday: formatNum(mentorSummary.dailyHots),
              },
            ])}

            <div class="table-wrap">
            <table class="data-table">
                <thead>
                ${
                  isLastMonthReport
                  ? `<tr>
                  <th>Source Type</th>
                  <th>L</th><th>C</th><th>S</th>
                  <th>C:S%</th><th>L:S%</th>
                </tr>`
                  : `<tr>
                  <th rowspan="2">Source Type</th>
                  <th colspan="3">Yesterday</th>
                  <th colspan="3">MTD Totals</th>
                  <th colspan="2">Ratios (MTD)</th>
                </tr>
                <tr>
                  <th>L</th><th>C</th><th>S</th>
                  <th>L</th><th>C</th><th>S</th>
                  <th>C:S%</th><th>L:S%</th>
                </tr>`
                }
                </thead>
                <tbody>
                    ${mentorRows}
                    <tr class="bg-total">
                        <td style="text-align:left;">TOTAL</td>
                  ${
                    isLastMonthReport
                    ? ""
                    : `<td>${formatNum(mentorSourceTable.total.dailyL)}</td><td>${formatNum(mentorSourceTable.total.dailyC)}</td><td>${formatNum(mentorSourceTable.total.dailyS)}</td>`
                  }
                        <td>${formatNum(mentorSourceTable.total.mtdL)}</td><td>${formatNum(mentorSourceTable.total.mtdC)}</td><td>${formatNum(mentorSourceTable.total.mtdS)}</td>
                        <td>${mentorSourceTable.total.cs}%</td><td>${mentorSourceTable.total.ls}%</td>
                    </tr>
                </tbody>
            </table>
            </div>
        </div>

        <div class="section-container counselor-bg">
            <div class="section-title counselor-title">Counselor Summary</div>
            ${renderKpiCards([
              {
                label: "Leads",
                value: formatNum(counselorSummary.mtdLeads),
                yesterday: formatNum(counselorSummary.dailyLeads),
              },
              {
                label: "Consults",
                value: formatNum(counselorSummary.mtdConsults),
                yesterday: formatNum(counselorSummary.dailyConsults),
              },
              {
                label: "Sales Units",
                value: formatNum(counselorSummary.mtdSales),
                yesterday: formatNum(counselorSummary.dailySales),
              },
              {
                label: "Leads Revenue",
                value: `₹${formatNum(counselorSummary.mtdRevenue)}`,
                yesterday: `₹${formatNum(counselorSummary.dailyRevenue)}`,
              },
              {
                label: "OCR Calls",
                value: counselorSummary.mtdOcrDone,
                yesterday: counselorSummary.dailyOcrDone,
              },
              {
                label: "OCR Revenue",
                value: `₹${formatNum(counselorSummary.mtdOcrRevenue)} <span style="font-size:10px; font-weight:600; color:#666;">(${formatNum(counselorSummary.mtdOcrUsers)} Unit)</span>`,
                yesterday: `₹${formatNum(counselorSummary.dailyOcrRevenue)} <span style="font-size:8px; font-weight:600; color:#666;">(${formatNum(counselorSummary.dailyOcrUsers)} Unit)</span>`,
              },
              {
                label: "HOTS",
                value: `<span style="color:#d32f2f;">${formatNum(counselorSummary.mtdHots)}</span>`,
                yesterday: formatNum(counselorSummary.dailyHots),
              },
            ])}

            <div class="table-wrap">
            <table class="data-table">
                <thead>
                ${
                  isLastMonthReport
                  ? `<tr>
                  <th>Counselor</th>
                  <th>L</th><th>C</th><th>S</th>
                  <th>C:S%</th><th>L:S%</th>
                </tr>`
                  : `<tr>
                  <th rowspan="2">Counselor</th>
                  <th colspan="3">Yesterday</th>
                  <th colspan="3">MTD Totals</th>
                  <th colspan="2">Ratios (MTD)</th>
                </tr>
                <tr>
                  <th>L</th><th>C</th><th>S</th>
                  <th>L</th><th>C</th><th>S</th>
                  <th>C:S%</th><th>L:S%</th>
                </tr>`
                }
                </thead>
                <tbody>
                    ${counselorRows}
                    <tr class="bg-total">
                        <td style="text-align:left;">TEAM TOTAL</td>
                  ${
                    isLastMonthReport
                    ? ""
                    : `<td>${formatNum(counselorTable.total.dailyL)}</td><td>${formatNum(counselorTable.total.dailyC)}</td><td>${formatNum(counselorTable.total.dailyS)}</td>`
                  }
                        <td>${formatNum(counselorTable.total.mtdL)}</td><td>${formatNum(counselorTable.total.mtdC)}</td><td>${formatNum(counselorTable.total.mtdS)}</td>
                        <td>${counselorTable.total.cs}%</td><td>${counselorTable.total.ls}%</td>
                    </tr>
                </tbody>
            </table>
            </div>
        </div>

        <div class="footer-note">
            MTD: Month-to-Date | L: Leads | C: Consults | S: Sales Units | Rev: Revenue
        </div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
</body>
</html>`;
}

async function sendPerformanceRoiReportMail({ date }) {
  try {
    logReportStep("sendMail:start", { date });

    logReportStep("sendMail:dataGeneration:start");
    const report = await getPerformanceRoiReportData({ date });
    logReportStep("sendMail:dataGeneration:done", {
      reportDate: report.meta.reportDate,
    });

    logReportStep("sendMail:htmlBuild:start");
    const html = buildPerformanceRoiReportHtml(report);
    logReportStep("sendMail:htmlBuild:done", { htmlLength: html.length });

    const subjectDate = moment(report.meta.reportDate, "YYYY-MM-DD", true).isValid()
      ? moment(report.meta.reportDate, "YYYY-MM-DD").format("DD MMM YYYY")
      : report.meta.reportDate;

    logReportStep("sendMail:payload:start");
    const mailPayload = {
      to: STATIC_REPORT_TO,
      cc: STATIC_REPORT_CC,
      bcc: ["vikram.gupta@balancenutrition.in"],
      //subject contains date time
      subject: `Performance & ROI Report (${subjectDate})`,
      html,
    };
    logReportStep("sendMail:payload:ready", {
      to: mailPayload.to,
      cc: mailPayload.cc,
      bcc: mailPayload.bcc,
      subject: mailPayload.subject,
    });

    logReportStep("sendMail:dispatch:start");
    const mailResult = await sendMailUtil(mailPayload);
    logReportStep("sendMail:dispatch:done", { mailResult });

    const result = {
      reportDate: report.meta.reportDate,
      monthStart: report.meta.monthStart,
      recipients: {
        to: STATIC_REPORT_TO,
        cc: STATIC_REPORT_CC,
      },
      report,
      mailResult,
    };

    logReportStep("sendMail:completed", {
      reportDate: result.reportDate,
      monthStart: result.monthStart,
    });
    return result;
  } catch (error) {
    logReportStep("sendMail:error", {
      message: error.message,
      stack: error.stack,
      date,
    });
    throw error;
  }
}

export {
  buildPerformanceRoiReportHtml,
  getDateContext,
  getPerformanceRoiReportData,
  getRecipientsFromAdminUsers,
  sendPerformanceRoiReportMail,
};
