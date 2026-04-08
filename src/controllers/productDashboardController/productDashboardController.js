import { ApiResponse } from "../../utils/APiResponse.js";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { genderCodeMapping, SMART_SCALE_PRICE_TO_BN, tables } from "../../helper/constant.js";
import { startLaterData } from "../../helper/mentordbHelpers.js";
import moment from "moment";
import { formatString, isFinalStatus, safeJSONParse } from "../../helper/commonHelper.js";
import axios from "axios";
import { sendMailUtil } from "../../utils/sendEmail.js";
import { generateInvoicePDF } from "../paymentControllers/productPaymentUtil/productPaymentUtil.js";
import { fetchShipyaariOrderStatusAndUpdate } from "../../services/shipyaariIntegration.js";

const getDateRange = (type, customStart = null, customEnd = null) => {
  let startDate, endDate;

  switch (type) {
    case "current": {
      // Current month
      startDate = moment().startOf("month");
      endDate = moment().endOf("month");
      break;
    }

    case "last": {
      // Last month
      startDate = moment().subtract(1, "month").startOf("month");
      endDate = moment().subtract(1, "month").endOf("month");
      break;
    }

    case "quarter": {
      // Current quarter
      startDate = moment().startOf("quarter");
      endDate = moment().endOf("quarter");
      break;
    }

    case "year": {
      // Current calendar year
      startDate = moment().startOf("year");
      endDate = moment().endOf("year");
      break;
    }

    case "financial_year": {
      // Indian financial year (April → March)
      const now = moment();
      const startYear = now.month() + 1 >= 4 ? now.year() : now.year() - 1;
      const endYear = startYear + 1;

      startDate = moment(`${startYear}-04-01 00:00:00`, "YYYY-MM-DD HH:mm:ss");
      endDate = moment(`${endYear}-03-31 23:59:59`, "YYYY-MM-DD HH:mm:ss");
      break;
    }

    case "custom": {
      // Custom date range
      startDate = moment(customStart, "YYYY-MM-DD HH:mm:ss").startOf("day");
      endDate = moment(customEnd, "YYYY-MM-DD HH:mm:ss").endOf("day");
      break;
    }

    case "all":
    default: {
      // All time
      startDate = moment("2025-10-01 00:00:00", "YYYY-MM-DD HH:mm:ss");
      endDate = moment();
      break;
    }
  }

  return {
    startDate: startDate.format("YYYY-MM-DD HH:mm:ss"),
    endDate: endDate.format("YYYY-MM-DD HH:mm:ss"),
  };
};

function getFinancialYearRangeFromDate(dateString) {
  const d = new Date(dateString.replace(" ", "T")); // Convert to valid ISO format

  const fyStartYear =
    d.getMonth() + 1 < 4 ? d.getFullYear() - 1 : d.getFullYear();
  const fyEndYear = fyStartYear + 1;

  // Format as "YYYY-MM-DD HH:mm:ss"
  const formatDate = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}`;
  };

  const startDate = new Date(`${fyStartYear}-04-01T00:00:00`);
  const endDate = new Date(`${fyEndYear}-03-31T23:59:59`);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    financialYear: `${fyStartYear}-${fyEndYear.toString().slice(-2)}`,
  };
}

// Helper for ₹ formatting (Indian numbering system)
const formatCurrency = (num) =>
  `₹${Number(num || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getCommissionGstNet = (totalRevenue) => {
  const bnCommission = totalRevenue * 0.25;
  const teamCommission = totalRevenue * 0.0375;
  const gst = (bnCommission + teamCommission) * 0.18;
  const netSettlement = totalRevenue - (bnCommission + gst + teamCommission);
  return { bnCommission, gst, teamCommission, netSettlement };
};

const getSalesDistributionByGender = async (startDate, endDate, brand) => {
  try {
    const { results } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.quantity) AS total_sales_units",
        "SUM(po.total_price) as total_revenue",
        "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
        "CASE WHEN ud.gender IS NULL THEN 'Other' ELSE ud.gender END AS gender",
      ],
      conditions: [
        { field: "po.created_at", operator: ">=", value: startDate },
        { field: "po.created_at", operator: "<=", value: endDate },
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
        {field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
      ],
      groupBy: ["ud.gender"],
    });

    return results.map((item) => {
      return {
        gender: genderCodeMapping[item.gender],
        total_orders: Number(item.total_orders) || 0,
        total_sales_units: Number(item.total_sales_units) || 0,
        total_revenue: formatCurrency(item.total_revenue),
        avg_order_value: formatCurrency(item.avg_order_value),
      };
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getSalesDistributionByRegion = async (
  startDate,
  endDate,
  totalRevenue,
  page,
  limit,
  search,
  brand
) => {
  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "r.region_name AS region",
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.quantity) AS total_sales_units",
        "SUM(po.total_price) as total_revenue",
        "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        { field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
        ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.regionsMembers} rm`,
          on: "ud.country_id = rm.country_id OR po.customer_country=(SELECT country_name FROM countries WHERE country_id=rm.country_id)",
        },
        {
          type: "LEFT",
          table: `${tables.regions} r`,
          on: "rm.region_id = r.region_id",
        },
      ],
      groupBy: ["r.region_name"],
      orderBy: ["r.region_name"],
      pagination: {
        limit: limit,
        page: page,
      },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "ud.user_id",
            "CONCAT(ud.first_name,' ',ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
      // groupBy: ["ud.gender"],
    });

    if (results.length === 0) {
      return [];
    }

    const tableData = results.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item.total_revenue);
      return {
        region: item.region,
        total_orders: Number(item.total_orders) || 0,
        total_sales_units: Number(item.total_sales_units) || 0,
        total_revenue: formatCurrency(item.total_revenue),
        avg_order_value: formatCurrency(item.avg_order_value),
        bnCommission: formatCurrency(bnCommission),
        teamCommission: formatCurrency(teamCommission),
        gst: formatCurrency(gst),
        netSettlement: formatCurrency(netSettlement),
        marketShare: Number((item.total_revenue / totalRevenue) * 100).toFixed(
          2
        ),
      };
    });

    return {
      data: tableData,
      totalPages: Math.ceil(totalCount / limit),
      page: page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getSalesDistributionByCountry = async (
  startDate,
  endDate,
  totalRevenue,
  page = 1,
  limit = 10,
  search
) => {
  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "cs.country_name AS country",
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.quantity) AS total_sales_units",
        "SUM(po.total_price) as total_revenue",
        "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.countries} cs`,
          on: "ud.country_id = cs.country_id OR po.customer_country = cs.country_name",
        },
      ],
      groupBy: ["cs.country_name"],
      orderBy: ["cs.country_name"],
      pagination: {
        limit: limit,
        page: page,
      },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: ["cs.country_name"],
        },
      }),
      // groupBy: ["ud.gender"],
    });

    if (results.length === 0) {
      return [];
    }

    const tableData = results.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item.total_revenue);
      return {
        country: item.country,
        total_orders: Number(item.total_orders) || 0,
        total_sales_units: Number(item.total_sales_units) || 0,
        total_revenue: formatCurrency(item.total_revenue),
        avg_order_value: formatCurrency(item.avg_order_value),
        bnCommission: formatCurrency(bnCommission),
        gst: formatCurrency(gst),
        teamCommission: formatCurrency(teamCommission),
        netSettlement: formatCurrency(netSettlement),
        marketShare: Number((item.total_revenue / totalRevenue) * 100).toFixed(
          2
        ),
      };
    });

    return {
      data: tableData,
      totalPages: Math.ceil(totalCount / limit),
      page: page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getSalesFinancialYearData = async (startDate,brand) => {
  const { startDate: startDateFin, endDate: endDateFin } =
    getFinancialYearRangeFromDate(startDate);
  console.log(startDateFin, endDateFin, brand, "start date, end date");

  const { results: monthlyData } = await readRecord({
    table: tables.product_orders,
    selectFields: [
      "DATE_FORMAT(created_at, '%Y-%m') AS month",
      "COUNT(DISTINCT razorpay_payment_id) AS total_orders",
      "SUM(quantity) AS total_sales_units",
      "SUM(total_price) as total_revenue",
      "(SUM(total_price)/COUNT(DISTINCT razorpay_payment_id)) as avg_order_value",
      "AVG(net_settled) as avg_net_settled",
      "settled_date",
    ],
    conditions: [
      { field: "created_at", operator: ">=", value: startDateFin },
      { field: "created_at", operator: "<=", value: endDateFin },
      { field: "payment_method", operator: "=", value: "online" },
      ...(brand != 'all' ? [{ field: "brand", operator: "=", value: brand || 'kilobeaters' }] : []),
      {field: "IFNULL(hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
      { field: "staff_order", operator: "=", value: 0 },
      {
        field: "payment_status",
        operator: "NOT IN",
        value: "('Failed', 'Pending')",
        raw: true,
      },
    ].filter(Boolean),
    groupBy: ["month"],
    orderBy: ["month ASC"],
  });

  console.log(monthlyData, "monthlyData");

  if (monthlyData.length === 0) {
    return [];
  }

  const tableData = monthlyData.map((item) => {
    if (brand==='kilobeaters') {
      const { bnCommission, gst, teamCommission, netSettlement } =
      getCommissionGstNet(item.total_revenue);
    return {
      month: item.month,
      total_orders: Number(item.total_orders) || 0,
      total_sales_units: Number(item.total_sales_units) || 0,
      total_revenue: formatCurrency(item.total_revenue),
      avg_order_value: formatCurrency(item.avg_order_value),
      bnCommission: formatCurrency(bnCommission),
      gst: formatCurrency(gst),
      teamCommission: formatCurrency(teamCommission),
      netSettlement: formatCurrency(netSettlement),
      net_settled: Number(item.avg_net_settled) === 1 ? 1 : 0,
      settled_date: item?.settled_date
        ? moment(item.settled_date, "YYYY-DD-MM").format("DD-MM-YYYY")
        : null,
    };
    }
    else {
      return {
      month: item.month,
      total_orders: Number(item.total_orders) || 0,
      total_revenue: formatCurrency(item.total_revenue),
      total_profit: formatCurrency(Number(Number(item.total_revenue || 0) - (Number(item.total_orders || 0)* SMART_SCALE_PRICE_TO_BN)).toFixed(2)),
    };

    }
  });

  console.log(tableData, 'tableData');

  return tableData;
};

const getTopThreeProducts = async (startDate, endDate, totalRevenue,brand) => {
  try {
    const { results } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.product_name as product_name",
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.quantity) AS total_sales_units",
        "SUM(po.total_price) as total_revenue",
        "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
        {field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      groupBy: ["po.product_name"],
      orderBy: ["total_sales_units DESC"],
      pagination: {
        limit: 3,
        page: 1,
      },
    });

    if (results.length === 0) {
      return [];
    }

    return results.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item.total_revenue);
      return {
        product_name: item.product_name,
        total_orders: Number(item.total_orders) || 0,
        total_sales_units: Number(item.total_sales_units) || 0,
        total_revenue: formatCurrency(item.total_revenue),
        avg_order_value: formatCurrency(item.avg_order_value),
        bnCommission: formatCurrency(bnCommission),
        gst: formatCurrency(gst),
        teamCommission: formatCurrency(teamCommission),
        netSettlement: formatCurrency(netSettlement),
        marketShare: Number((item.total_revenue / totalRevenue) * 100).toFixed(
          2
        ),
      };
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getDeliveryStatusWiseData = async ({
  startDate,
  endDate,
  totalRevenue,
  isStaff,
}) => {
  try {
    const { results } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.quantity) AS total_sales_units",
        "SUM(po.total_price) as total_revenue",
        "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
        "COUNT(po.status) as status_count",
        "po.status",
      ],
      conditions: [
        { field: "po.created_at", operator: ">=", value: startDate },
        { field: "po.created_at", operator: "<=", value: endDate },
        {field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
      ],
      groupBy: ["po.status"],
    });

    return results.map((item) => {
      return {
        status: item?.status,
        total_orders: Number(item.total_orders) || 0,
        total_sales_units: Number(item.total_sales_units) || 0,
        total_revenue: formatCurrency(item.total_revenue),
        avg_order_value: formatCurrency(item.avg_order_value),
      };
    });
  } catch (error) {
    console.log("ERROR IN GETTING DELVIERY STATUS", error);
  }
};

const getCustomerProductPurchaseDetails = async ({
  startDate,
  endDate,
  totalRevenue,
  type,
  page = 1,
  limit = 10,
  orderType,
  search,
  brand
}) => {
  try {
    console.log(limit, "LIMMITTTTTT");
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.razorpay_payment_id",
        "po.product_order_id",
        "po.product_name",
        "po.awb_number",
        "CASE WHEN ud.first_name IS NULL THEN po.customer_name ELSE CONCAT(ud.first_name, ' ', ud.last_name) END AS customer_name",
        "ud.email_id AS email",
        "CASE WHEN ud.phone IS NULL THEN po.customer_phone ELSE ud.phone END AS user_phone",
        "po.customer_phone as customer_phone ",
        "ud.user_status AS user_status",
        "ud.sub_user_status AS sub_user_status",
        "ud.user_id AS user_id",
        "SUM(po.quantity) as total_units",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_name`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) AS counsellor_name`,
        "po.customer_city as customer_city",
        "po.customer_state as customer_state",
        "po.customer_country as customer_country",
        "po.customer_pincode as customer_pincode",
        "po.customer_address as customer_address",
        "po.customer_landmark as customer_landmark",
        "po.price_per_unit_to_bn as price_per_unit_to_bn",
        "po.pack_size as pack_size",
        "po.razorpay_payment_id as payment_id",
        "CONCAT('[', GROUP_CONCAT(JSON_OBJECT(" +
          "'order_id', COALESCE(po.product_order_id, 'N/A'), " +
          "'pack_size', po.pack_size, " +
          "'product_name', po.product_name, " +
          "'quantity', po.quantity, " +
          "'total_price', po.total_price, " +
          "'order_date', po.created_at" +
          ")), ']') AS order_items",
        "SUM(po.total_price) AS total_amount",
        "MIN(po.created_at) AS order_date",
        "po.awb_number AS awb_number",
        "po.status AS status",
        "po.staff_order AS staff_order",
        "po.payment_method AS payment_method",
        "po.brand"
      ],

      groupBy: ["po.razorpay_payment_id"],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
        {
          field: "po.payment_method",
          operator: "=",
          value: orderType ? orderType : "online",
        },
        { field: "po.staff_order", operator: "=", value: type ? type : 0 },
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
        {
          field: "po.customer_pincode",
          operator: "IS ",
          value: "NOT NULL",
          raw: true,
        },
        ...(limit !== 0
          ? [{ field: "po.customer_pincode", operator: "!=", value: "0" }]
          : []),
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
      ],
      orderBy: ["po.created_at DESC"],
      ...(limit !== 0
        ? {
            pagination: {
              limit: limit ? limit : 10,
              page: page ? page : 1,
            },
          }
        : {}),
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "po.customer_name",
            "ud.email_id",
            "po.customer_phone",
          ],
        },
      }),
    });

    // console.log(results, "Customer product purchase details");

    if (results.length === 0) {
      return [];
    }

    const tableData = results.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item.total_amount);
      return {
        order_id: item.product_order_id,
        customer_name: item.customer_name,
        total_units: item.total_units,
        email: item.email,
        payment_details: {
          payment_id: item.payment_id,
          payment_date: item.order_date,
          payment_amount: formatCurrency(item.total_amount),
          payment_method: item.payment_method,
        },
        staff_order: item.staff_order,
        mentor_name: item.mentor_name,
        counsellor_name: item.counsellor_name,
        customer_phone: item.customer_phone,
        user_phone: item.user_phone,
        awb_number: item.awb_number,
        price_per_unit_to_bn: item.price_per_unit_to_bn,
        pack_size: item.pack_size,
        status: item.status,
        amount: formatCurrency(item.total_amount),
        bn_commission: formatCurrency(bnCommission),
        gst: formatCurrency(gst),
        team_commission: formatCurrency(teamCommission),
        order_items: item.order_items,
        net_to_kilometer: formatCurrency(netSettlement),
        order_date: item.order_date,
        user_status: item.user_status,
        sub_user_status: item.sub_user_status,
        user_id: item.user_id,
        customer_city: item.customer_city,
        customer_state: item.customer_state,
        customer_country: item.customer_country,
        customer_pincode: item.customer_pincode,
        customer_address: item.customer_address,
        customer_landmark: item.customer_landmark,
        brand: item.brand
      };
    });

    return {
      data: tableData,
      totalPages: Math.ceil(totalCount / limit),
      page: page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getAllProductPurchaseDetails = async ({
  startDate,
  endDate,
  orderType,
  totalRevenue,
  deliveryStatus,
  page = 1,
  limit = 10,
  search,
  brand,
}) => {
  try {
    console.log("orderType", orderType);
    console.log("search", search);
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.razorpay_payment_id",
        "po.product_order_id",
        "po.customer_name as order_customer_name",
        "CASE WHEN ud.first_name IS NULL THEN po.customer_name ELSE CONCAT(TRIM(ud.first_name), ' ', TRIM(ud.last_name)) END AS po_customer_name",
        "ud.email_id AS email",
        "CASE WHEN ud.phone IS NULL THEN po.customer_phone ELSE ud.phone END AS user_phone",
        "po.customer_phone as customer_phone ",
        "ud.user_status AS user_status",
        "ud.sub_user_status AS sub_user_status",
        "ud.user_id AS user_id",
        "SUM(po.quantity) as total_units",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_name`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) AS counsellor_name`,
        "po.customer_city as customer_city",
        "po.customer_state as customer_state",
        "po.hamper_type as hamper_type",
        "po.customer_country as customer_country",
        "po.customer_pincode as customer_pincode",
        "po.customer_address as customer_address",
        "po.price_per_unit_to_bn as price_per_unit_to_bn",
        "po.pack_size as pack_size",
        "po.customer_landmark as customer_landmark",
        "po.razorpay_payment_id as payment_id",
        "CONCAT('[', GROUP_CONCAT(JSON_OBJECT(" +
          "'order_id', COALESCE(po.product_order_id, 'N/A'), " +
          "'pack_size', po.pack_size, " +
          "'product_name', po.product_name, " +
          "'quantity', po.quantity, " +
          "'total_price', po.total_price, " +
          "'order_date', po.created_at" +
          ")), ']') AS order_items",
        "SUM(po.total_price) AS total_amount",
        "MIN(po.created_at) AS order_date",
        "po.awb_number AS awb_number",
        "po.status AS status",
        "po.staff_order AS staff_order",
        "po.payment_method AS payment_method",
        "po.brand"
      ],

      groupBy: ["po.product_order_id"],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        ...brand!='all'? [{field: "brand", operator: "=", value: brand|| "kilobeaters"}]: [], 
        orderType != "all"
          ? {
              field: "po.payment_method",
              operator: "=",
              value: orderType ? orderType : "online",
            }
          : null,
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
        {
          field: "po.customer_pincode",
          operator: "IS ",
          value: "NOT NULL",
          raw: true,
        },
        deliveryStatus && deliveryStatus.toLowerCase() != "all"
          ? { field: "po.status", operator: "=", value: deliveryStatus }
          : null,
        ...(limit !== 0
          ? [{ field: "po.customer_pincode", operator: "!=", value: "0" }]
          : []),
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
      ],
      orderBy: ["po.created_at DESC"],
      ...(limit !== 0
        ? {
            pagination: {
              limit: limit ? limit : 10,
              page: page ? page : 1,
            },
          }
        : {}),
      // ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            `CASE WHEN ud.first_name IS NULL THEN po.customer_name ELSE CONCAT(TRIM(ud.first_name), ' ', TRIM(ud.last_name)) END`,
            "po.customer_name",
            "ud.first_name",
            "ud.last_name",
            "ud.email_id",
            "po.customer_phone",
            "po.product_order_id",
            "po.awb_number",
          ],
        },
      }),
      countTotal: true,
    });

    if (results.length === 0) {
      return [];
    }

    const tableData = results.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item.total_amount);
      return {
        order_id: item.product_order_id,
        brand: item.brand, 
        customer_name: item?.order_customer_name
          ? item.order_customer_name
          : item.po_customer_name,
        total_units: item.total_units,
        email: item.email,
        payment_details: {
          payment_id: item.payment_id,
          payment_date: item.order_date,
          payment_amount: formatCurrency(item.total_amount),
          payment_method: item.payment_method,
        },
        hamper_type:
          (item.hamper_type && item.hamper_type.toUpperCase() + " HAMPER") ||
          "ONLINE PAYMENT",
        staff_order: item.staff_order,
        mentor_name: item.mentor_name,
        counsellor_name: item.counsellor_name,
        customer_phone: item.customer_phone,
        user_phone: item.user_phone,
        awb_number: item.awb_number,
        price_per_unit_to_bn: item.price_per_unit_to_bn,
        pack_size: item.pack_size,
        status: item.status,
        amount: formatCurrency(item.total_amount),
        bn_commission: formatCurrency(bnCommission),
        gst: formatCurrency(gst),
        team_commission: formatCurrency(teamCommission),
        order_items: item.order_items,
        net_to_kilometer: formatCurrency(netSettlement),
        order_date: item.order_date,
        user_status: item.user_status,
        sub_user_status: item.sub_user_status,
        user_id: item.user_id,
        customer_city: item.customer_city,
        customer_state: item.customer_state,
        customer_country: item.customer_country,
        customer_pincode: item.customer_pincode,
        customer_address: item.customer_address,
        customer_landmark: item.customer_landmark,
        awb_number: item.awb_number,
      };
    });

    return {
      data: tableData,
      totalPages: Math.ceil(totalCount / limit),
      page: page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getProductOrdersDataForGst = async ({
  startDate,
  endDate,
  orderType,
  totalRevenue,
  deliveryStatus = "all",
  page = 1,
  limit = 10,
  search,
  gstExport = false,
}) => {
  try {
    console.log("search", search);
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.razorpay_payment_id",
        "po.product_order_id",
        "po.customer_name as order_customer_name",
        "CASE WHEN ud.first_name IS NULL THEN po.customer_name ELSE CONCAT(TRIM(ud.first_name), ' ', TRIM(ud.last_name)) END AS po_customer_name",
        "ud.email_id AS email",
        "CASE WHEN ud.phone IS NULL THEN po.customer_phone ELSE ud.phone END AS user_phone",
        "po.customer_phone as customer_phone ",
        "ud.user_status AS user_status",
        "ud.sub_user_status AS sub_user_status",
        "ud.user_id AS user_id",
        "po.quantity as total_units",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) AS mentor_name`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) AS counsellor_name`,
        "po.customer_city as customer_city",
        "po.customer_state as customer_state",
        "po.hamper_type as hamper_type",
        "po.customer_country as customer_country",
        "po.customer_pincode as customer_pincode",
        "po.customer_address as customer_address",
        "po.price_per_unit_to_bn as price_per_unit_to_bn",
        "po.pack_size as pack_size",
        "po.customer_landmark as customer_landmark",
        "po.razorpay_payment_id as payment_id",
        "JSON_OBJECT(" +
          "'order_id', COALESCE(po.product_order_id, 'N/A'), " +
          "'pack_size', po.pack_size, " +
          "'product_name', po.product_name, " +
          "'quantity', po.quantity, " +
          "'total_price', po.total_price, " +
          "'order_date', po.created_at" +
          ") AS order_items",
        "po.total_price AS total_amount",
        "po.created_at AS order_date",
        "po.awb_number AS awb_number",
        "po.status AS status",
        "po.staff_order AS staff_order",
        "po.payment_method AS payment_method",
        "po.brand"
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        {field: "brand", operator: "=", value: 'kilobeaters'},
        orderType != "all"
          ? {
              field: "po.payment_method",
              operator: "=",
              value: orderType ? orderType : "online",
            }
          : null,
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
        // {
        //   field: "po.customer_pincode",
        //   operator: "IS ",
        //   value: "NOT NULL",
        //   raw: true,
        // },
        // deliveryStatus && deliveryStatus.toLowerCase() != "all"
        //   ? { field: "po.status", operator: "=", value: deliveryStatus }
        //   : null,
        // { field: "po.customer_pincode", operator: "!=", value: "0" },
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
      ],
      orderBy: ["po.created_at DESC"],
      ...(limit !== 0
        ? {
            pagination: {
              limit: limit ? limit : 10,
              page: page ? page : 1,
            },
          }
        : {}),
      // ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            `CASE WHEN ud.first_name IS NULL THEN po.customer_name ELSE CONCAT(TRIM(ud.first_name), ' ', TRIM(ud.last_name)) END`,
            "po.customer_name",
            "ud.first_name",
            "ud.last_name",
            "ud.email_id",
            "po.customer_phone",
            "po.product_order_id",
            "po.awb_number",
          ],
        },
      }),
      countTotal: true,
    });

    if (results.length === 0) {
      return [];
    }

    const tableData = results.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item.total_amount);
      return {
        order_id: item.product_order_id,
        customer_name: item?.order_customer_name
          ? item.order_customer_name
          : item.po_customer_name,
        total_units: item.total_units,
        email: item.email,
        payment_details: {
          payment_id: item.payment_id,
          payment_date: item.order_date,
          payment_amount: formatCurrency(item.total_amount),
          payment_method: item.payment_method,
        },
        hamper_type:
          (item.hamper_type && item.hamper_type.toUpperCase() + " HAMPER") ||
          "ONLINE PAYMENT",
        staff_order: item.staff_order,
        brand: item?.brand,
        mentor_name: item.mentor_name,
        counsellor_name: item.counsellor_name,
        customer_phone: item.customer_phone,
        user_phone: item.user_phone,
        awb_number: item.awb_number,
        price_per_unit_to_bn: item.price_per_unit_to_bn,
        pack_size: item.pack_size,
        status: item.status,
        amount: formatCurrency(item.total_amount),
        bn_commission: formatCurrency(bnCommission),
        gst: formatCurrency(gst),
        team_commission: formatCurrency(teamCommission),
        order_items: item.order_items,
        net_to_kilometer: formatCurrency(netSettlement),
        order_date: item.order_date,
        user_status: item.user_status,
        sub_user_status: item.sub_user_status,
        user_id: item.user_id,
        customer_city: item.customer_city,
        customer_state: item.customer_state,
        customer_country: item.customer_country,
        customer_pincode: item.customer_pincode,
        customer_address: item.customer_address,
        customer_landmark: item.customer_landmark,
        awb_number: item.awb_number,
      };
    });

    return {
      data: tableData,
      totalPages: Math.ceil(totalCount / limit),
      page: page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getUserStateWiseDistributedData = async (
  startDate,
  endDate,
  brand
) => {
  try {
    // 🔹 Fetch bifurcated overview by user status
    const bifurcatedOverviewData = await readRecordUnion([
      {
        table: `${tables.product_orders} po`,
        selectField: [
          "'Lead' AS user_type",
          "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
          "SUM(po.quantity) AS total_sales_units",
          "SUM(po.total_price) as total_revenue",
          "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
        ],
        condition: [
          { field: "po.created_at", operator: ">=", value: startDate },
          { field: "po.created_at", operator: "<=", value: endDate },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          { field: "po.payment_method", operator: "=", value: "online" },
          ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
          {field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
          { field: "po.staff_order", operator: "=", value: 0 },
          {
            field: "po.payment_status",
            operator: "NOT IN",
            value: "('Failed', 'Pending')",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "po.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.product_orders} po`,
        selectField: [
          "'OC' AS user_type",
          "COUNT(DISTINCT po.razorpay_payment_id) as total_orders",
          "SUM(po.quantity) AS total_sales_units",
          "SUM(po.total_price) as total_revenue",
          "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
        ],
        condition: [
          { field: "po.created_at", operator: ">=", value: startDate },
          { field: "po.created_at", operator: "<=", value: endDate },
          { field: "ud.user_status", operator: "=", value: "Completed" },
           ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
           {field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
          { field: "po.payment_method", operator: "=", value: "online" },
          { field: "po.staff_order", operator: "=", value: 0 },
          {
            field: "po.payment_status",
            operator: "NOT IN",
            value: "('Failed', 'Pending')",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "po.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.product_orders} po`,
        selectField: [
          "'Active' AS user_type",
          "COUNT(DISTINCT po.razorpay_payment_id) as total_orders",
          "SUM(po.quantity) AS total_sales_units",
          "SUM(po.total_price) as total_revenue",
          "(SUM(po.total_price)/COUNT(DISTINCT po.razorpay_payment_id)) as avg_order_value",
        ],
        condition: [
          { field: "po.created_at", operator: ">=", value: startDate },
          { field: "po.created_at", operator: "<=", value: endDate },
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "po.payment_method", operator: "=", value: "online" },
          ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
          {field: "IFNULL(po.hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
          { field: "po.staff_order", operator: "=", value: 0 },
          {
            field: "po.payment_status",
            operator: "NOT IN",
            value: "('Failed', 'Pending')",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "po.user_id = ud.user_id",
          },
        ],
      },
    ]);

    return bifurcatedOverviewData.map((item) => {
      const { bnCommission, gst, teamCommission, netSettlement } =
        getCommissionGstNet(item?.total_revenue);
      return {
        user_type: item.user_type,
        total_orders: Number(item.total_orders) || 0,
        total_sales_units: Number(item.total_sales_units) || 0,
        total_revenue: formatCurrency(item.total_revenue),
        avg_order_value: formatCurrency(item.avg_order_value),
        bnCommission: formatCurrency(bnCommission),
        gst: formatCurrency(gst),
        teamCommission: formatCurrency(teamCommission),
        netSettlement: formatCurrency(netSettlement),
      };
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getCartByUserStatus = async (startDate, endDate, brand) => {
  try {
    // 🔹 Fetch bifurcated overview by user status
    const bifurcatedOverviewData = await readRecordUnion([
      {
        table: `${tables.cart} cart`,
        selectField: [
          "'Lead' AS user_type",
          "COUNT(DISTINCT(cart.user_id)) as carts_added",
        ],
        condition: [
          { field: "cart.updated_date", operator: ">=", value: startDate },
          { field: "cart.updated_date", operator: "<=", value: endDate },
          { field: "ud.user_status", operator: "=", value: "Lead" },
          { field: "cart.cart_items", operator: "!=", value: "[]" },
          // { field: "cart.brand", operator:"=", value: brand || 'kilobeaters' },
          {
            field: "cart.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online' and staff_order=0)",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "cart.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} cart`,
        selectField: [
          "'Active' AS user_type",
          "COUNT(DISTINCT(cart.user_id)) as carts_added",
        ],
        condition: [
          { field: "cart.updated_date", operator: ">=", value: startDate },
          { field: "cart.updated_date", operator: "<=", value: endDate },
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "cart.cart_items", operator: "!=", value: "[]" },
          {
            field: "cart.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online' and staff_order=0)",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "cart.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} cart`,
        selectField: [
          "'OC' AS user_type",
          "COUNT(DISTINCT(cart.user_id)) as carts_added",
        ],
        condition: [
          { field: "cart.updated_date", operator: ">=", value: startDate },
          { field: "cart.updated_date", operator: "<=", value: endDate },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          { field: "cart.cart_items", operator: "!=", value: "[]" },
          {
            field: "cart.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = cart.user_id AND created_at >= cart.updated_date AND payment_method='online' and staff_order=0)",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "cart.user_id = ud.user_id",
          },
        ],
      },
    ]);

    return bifurcatedOverviewData.map((item) => {
      return {
        user_type: item.user_type,
        carts_added: Number(item.carts_added) || 0,
      };
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getCartUserTableData = async (
  startDate,
  endDate,
  page = 1,
  limit,
  search
) => {
  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.cart} ct`,
      selectFields: [
        '(SELECT COUNT(cart_id) FROM cart WHERE user_id = ct.user_id AND cart_items!="[]" GROUP BY DATE(added_date) ORDER BY COUNT(cart_id) DESC LIMIT 1) as cart_count',
        "CONCAT(cd.first_name, ' ', cd.last_name) as customer_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id =cd.mentor_assigned) AS mentor_name`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cd.counsellor_assigned) AS counsellor_name`,
        "cd.email_id",
        "cd.phone_number",
        "ct.cart_items as cart_info",
        "cd.user_id",
        "cd.cs_notes",
        "cd.user_status",
        "ct.added_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `cd.user_id = ct.user_id`,
        },
      ],
      conditions: [
        { field: "ct.added_date", operator: ">=", value: startDate },
        { field: "ct.added_date", operator: "<=", value: endDate },
        { field: "ct.cart_items", operator: "!=", value: "[]" },
        {
          field: "",
          operator: "",
          value: `NOT EXISTS ( SELECT 1 FROM ${tables.product_orders} po WHERE po.user_id = ct.user_id AND po.created_at >= ct.added_date AND po.payment_method = 'online' AND po.staff_order = 0 AND po.payment_status NOT IN ('Failed', 'Pending'))`,
          raw: true,
        },
        {
          field: "ct.cart_id",
          operator: "=",
          value:
            "(SELECT cart_id FROM cart WHERE user_id = ct.user_id ORDER BY cart_id DESC LIMIT 1)",
          raw: true,
        },
      ],
      groupBy: ["ct.user_id"],
      ...(limit !== 0
        ? {
            pagination: {
              limit: limit ? limit : 10,
              page: page ? page : 1,
            },
          }
        : {}),
      orderBy: ["ct.added_date DESC"],
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "JSON_UNQUOTE(JSON_SEARCH(ct.cart_items, 'all', CONCAT('%', ?, '%')))",
            "cd.email_id",
            "cd.phone_number",
            "cd.first_name",
            "cd.last_name",
          ],
        },
      }),
    });

    const parsedData = results.map((row) => {
      let cartInfo = [];

      console.log(row?.cs_notes, "CS_NOTES");

      try {
        // Parse JSON safely
        const parsed = safeJSONParse(row.cart_info);

        // Keep only relevant fields
        cartInfo = parsed.map(
          ({
            product_name,
            quantity,
            pack_size,
            original_price,
            total_price,
            product_img,
            image,
          }) => ({
            product_name,
            quantity,
            pack_size,
            original_price,
            total_price,
            product_image: product_img || image || null,
          })
        );
      } catch (err) {
        console.error("Error parsing cart_info for user", row.user_id, err);
        throw new Error("Error parsing cart_info for user");
      }

      return {
        user_id: row.user_id,
        customer_name: row.customer_name,
        cs_notes: row.cs_notes,
        email_id: row.email_id,
        phone_number: row.phone_number,
        user_status: row.user_status,
        added_cart: cartInfo,
        added_date: moment(row.added_date).format("DD-MM-YYYY HH:mm"),
        cart_count: row.cart_count,
        mentor_name: row.mentor_name,
        counsellor_name: row.counsellor_name,
      };
    });

    return {
      data: parsedData,
      totalCount: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page: page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getMentorWiseSalesData = async (
  startDate,
  endDate,
  totalRevenue,
  page = 1,
  limit = 10,
  search,
  brand
) => {
  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "au.admin_user_id as mentor_id",
        `au.crm_user AS mentor_name`,
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.total_price) AS total_revenue",
        "(SUM(po.total_price)*0.0375) AS teamCommission",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Lead' THEN ud.user_id END) AS orders_from_leads",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Active' THEN ud.user_id END) AS orders_from_active",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END) AS orders_from_completed",
        "MIN(po.created_at) AS first_order_date",
        "MAX(po.created_at) AS last_order_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "po.sold_by = au.admin_user_id",
          //on: `CASE WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END = au.admin_user_id`,
        },
      ],
      conditions: [
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        { field: "po.created_at", operator: ">=", value: startDate },
        { field: "po.created_at", operator: "<=", value: endDate },
        ...brand!='all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : [],
        { field: "au.is_active", operator: "=", value: 1 },
        { field: "au.role_id", operator: "=", value: 1 },
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      groupBy: ["au.admin_user_id"],
      orderBy: ["total_revenue DESC"],
      pagination: { limit: limit || 10, page: page || 1 },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "au.first_name",
            "au.last_name",
            "au.admin_email",
            "au.admin_phone",
          ],
        },
      }),
    });

    return {
      data: results,
      totalPages: Math.ceil(totalCount / limit),
      page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

const getCounsellorWiseSalesData = async (
  startDate,
  endDate,
  totalRevenue,
  page = 1,
  limit = 10,
  search,
  brand
) => {
  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "au.admin_user_id as counsellor_id",
        `au.crm_user AS counsellor_name`,
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.total_price) AS total_revenue",
        "(SUM(po.total_price)*0.0375) AS teamCommission",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Lead' THEN ud.user_id END) AS orders_from_leads",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END) AS orders_from_completed",
        "MIN(po.created_at) AS first_order_date",
        "MAX(po.created_at) AS last_order_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "po.sold_by = au.admin_user_id",
          // on: `CASE WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END = au.admin_user_id`,
        },
      ],
      conditions: [
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        { field: "po.created_at", operator: ">=", value: startDate },
        { field: "po.created_at", operator: "<=", value: endDate },
        { field: "au.is_active", operator: "=", value: 1 },
        { field: "au.role_id", operator: "=", value: 2 },
        ...brand!='all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : [],
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      groupBy: ["au.admin_user_id"],
      orderBy: ["total_revenue DESC"],
      pagination: { limit: limit || 10, page: page || 1 },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "au.first_name",
            "au.last_name",
            "au.admin_email",
            "au.admin_phone",
          ],
        },
      }),
    });

    return {
      data: results,
      totalPages: Math.ceil(totalCount / limit),
      page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};
const getOtherSalesData = async (
  startDate,
  endDate,
  totalRevenue,
  page = 1,
  limit = 10,
  search,
  brand
) => {
  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "au.admin_user_id as counsellor_id",
        `au.crm_user AS counsellor_name`,
        "COUNT(DISTINCT po.razorpay_payment_id) AS total_orders",
        "SUM(po.total_price) AS total_revenue",
        "(SUM(po.total_price)*0.0375) AS teamCommission",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Lead' THEN ud.user_id END) AS orders_from_leads",
        "COUNT(DISTINCT CASE WHEN ud.user_status = 'Completed' THEN ud.user_id END) AS orders_from_completed",
        "MIN(po.created_at) AS first_order_date",
        "MAX(po.created_at) AS last_order_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "po.sold_by = au.admin_user_id",
          // on: `CASE WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END = au.admin_user_id`,
        },
      ],
      conditions: [
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        { field: "po.created_at", operator: ">=", value: startDate },
        { field: "po.created_at", operator: "<=", value: endDate },
        { field: "au.is_active", operator: "=", value: 1 },
        { field: "au.role_id", operator: "NOT IN", value: [1, 2] },
        ...brand!='all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : [],
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      groupBy: ["au.admin_user_id"],
      orderBy: ["total_revenue DESC"],
      pagination: { limit: limit || 10, page: page || 1 },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "au.first_name",
            "au.last_name",
            "au.admin_email",
            "au.admin_phone",
          ],
        },
      }),
    });

    return {
      data: results,
      totalPages: Math.ceil(totalCount / limit),
      page,
    };
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const getProductDashboardOverview = async (req, res, next) => {
  try {
    const { dateFilter, customStart, customEnd, isStaff, brand } = req.body;

    if (!dateFilter) {
      return next(new ErrorHandler("Missing dateFilter in request body", 400));
    }

    const { startDate, endDate } = getDateRange(
      dateFilter,
      customStart,
      customEnd
    );

    const baseConditions =  [
      { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "payment_method", operator: "=", value: "online" },
         {field: "IFNULL(hamper_type, '')", operator:"!=", value: "'zero-order'", raw:true},
        {
          field: "payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
    ]

    const { results } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT product_order_id) AS total_orders",
        "SUM(quantity) AS total_sales_units",
        "SUM(total_price) as total_revenue",
      ],
      conditions: [
        ...baseConditions,
        { field: "staff_order", operator: "=", value: 0 },
        ...brand!='all' ? [{ field: "brand", operator: "=", value: brand || 'kilobeaters' }] : [],
      ],
    });

    const totalRevenue = results[0]?.total_revenue || 0;
    let kbData ; 
    let drData ;

    if (['all', 'kilobeaters'].includes(brand)) {
      const { results } = await readRecord({
        table: tables.product_orders,
          selectFields: [
            "COUNT(DISTINCT product_order_id) AS total_orders",
            "SUM(quantity) AS total_sales_units",
            "SUM(total_price) as total_revenue",
          ],
          conditions: [
            ...baseConditions,
            { field: "staff_order", operator: "=", value: 0 },
            { field: "brand", operator: "=", value:'kilobeaters' },
          ],
        });
      kbData = results;
    }

    if (['all', 'doctorstore'].includes(brand)) {
      const { results} = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT product_order_id) AS total_orders",
        "SUM(quantity) AS total_sales_units",
        "SUM(total_price) as total_revenue",
      ],
      conditions: [
        ...baseConditions,
        { field: "staff_order", operator: "=", value: 0 },
        { field: "brand", operator: "=", value: 'doctorstore' },
      ],
    });
      drData = results
    }
    
    const { results:totalUsers } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT user_id) AS total_users",
      ],
      conditions: [
        ...baseConditions,
        { field: "staff_order", operator: "=", value: 0 },
        { field: "brand", operator: "=", value:'kilobeaters' },
      ],
    });

    const {results:repeatCustomers} = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "user_id",
      ],
      conditions: [
        ...baseConditions,
        { field: "brand", operator: "=", value: 'kilobeaters' },
        { field: "staff_order", operator: "=", value: 0 },
      ],
      groupBy: ["user_id"],
      having: [{field: "COUNT(DISTINCT product_order_id)", operator: ">", value: 1, raw:true}], 
    });

    // kb Data
    console.log(totalUsers, repeatCustomers, 'HELLO');
    const totalUsersCount = Number(totalUsers?.[0]?.total_users) || 0;
    const repeatCount = Number(repeatCustomers?.length) || 0;
    const repeatPercentage = totalUsersCount > 0 ? ((repeatCount / totalUsersCount) * 100).toFixed(2) : "0.00";
    // kb totalSalesUnits and totalRevenue
    const totalKbOrder = kbData?.[0]?.total_orders || 0;
    const totalKbSalesUnits = kbData?.[0]?.total_sales_units || 0;
    const totalKbRevenue = kbData?.[0]?.total_revenue || 0;

    const totalScaleSalesUnits = drData?.[0]?.total_sales_units || 0;
    const totalScaleRevenue = drData?.[0]?.total_revenue || 0;

    console.log(totalKbRevenue, 'revenue'); 
    const { bnCommission, gst, teamCommission, netSettlement } =
      getCommissionGstNet(totalKbRevenue);

    const { results: staffOrder } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT razorpay_payment_id) AS total_orders",
        "SUM(quantity) AS total_sales_units",
        "SUM(total_price) as total_revenue",
      ],
      conditions: [
        ...baseConditions,
        { field: "staff_order", operator: "=", value: 1 },
        ...(brand != 'all' ? [{ field: "brand", operator: "=", value: brand || 'kilobeaters' }] : []),
      ],
    });

    const staffOrderTotalSalesUnits = staffOrder[0].total_sales_units || 0;
    const staffOrderTotalRevenue = staffOrder[0].total_revenue || 0;
    const staffOrders = staffOrder[0].total_orders || 0;

    const { results: birthdayOrder } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT razorpay_payment_id) AS total_orders",
        "SUM(quantity) AS total_sales_units",
        "SUM(price_per_unit_to_bn) as total_revenue",
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "payment_method", operator: "=", value: "free" },
        { field: "hamper_type", operator: "=", value: "birthday" },
        { field: "staff_order", operator: "=", value: 0 },
        { field: "brand", operator: "=", value: 'kilobeaters' },
        {
          field: "payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
    });

    const birthdayOrderTotalSalesUnits =
      birthdayOrder[0].total_sales_units || 0;
    const birthdayOrderTotalRevenue = birthdayOrder[0].total_revenue || 0;
    const birthdayOrders = birthdayOrder[0].total_orders || 0;

    const { results: generalOrder } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT razorpay_payment_id) AS total_orders",
        "SUM(quantity) AS total_sales_units",
        "SUM(price_per_unit_to_bn) as total_revenue",
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "payment_method", operator: "=", value: "free" },
        { field: "hamper_type", operator: "=", value: "general" },
        { field: "staff_order", operator: "=", value: 0 },
        { field: "brand", operator: "=", value: 'kilobeaters' },
        {
          field: "payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
    });

    const { results: freeScaleOrders } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "COUNT(DISTINCT razorpay_payment_id) AS total_orders",
        "SUM(quantity) AS total_sales_units",
        "SUM(price_per_unit_to_bn) as total_revenue",
      ],
      conditions: [
        { field: "created_at", operator: ">=", value: startDate },
        { field: "created_at", operator: "<=", value: endDate },
        { field: "payment_method", operator: "=", value: "free" },
        { field: "staff_order", operator: "=", value: 0 },
        { field: "brand", operator: "=", value: 'doctorstore' },
        {field: "status", operator: "!=", value: "Pending"}, 
        {
          field: "payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
    });

    const generalOrderTotalSalesUnits = generalOrder[0].total_sales_units || 0;
    const generalOrderTotalRevenue = generalOrder[0].total_revenue || 0;
    const generalOrders = generalOrder[0].total_orders || 0;

    const totalFreeScaleUnits = freeScaleOrders[0].total_sales_units || 0;
    const totalFreeScaleSettlement = freeScaleOrders[0].total_revenue || 0;


    // 🔹 Format the overview data
    const userStatusWiseData = await getUserStateWiseDistributedData(
      startDate,
      endDate,
      brand
    );

    let financialYearData;
    let financialYearDataScale;
    let financialYearDataSnacks;
    if (brand=='all') {
      
      financialYearDataScale = await getSalesFinancialYearData(
        startDate,
        'doctorstore'
      );
  
      financialYearDataSnacks = await getSalesFinancialYearData(
        startDate,
        'kilobeaters'
      );
    }
    else {
      financialYearData = await getSalesFinancialYearData(
        startDate,
        brand
      );
    }


    const genderWiseDistributedData = await getSalesDistributionByGender(
      startDate,
      endDate,
      brand
    );

    const topThreeProducts = await getTopThreeProducts(
      startDate,
      endDate,
      totalRevenue,
      brand
    );

    const regionWiseDistributedData = await getSalesDistributionByRegion(
      startDate,
      endDate,
      totalRevenue,
      brand
    );

    const deliveryWiseData = await getDeliveryStatusWiseData({
      startDate,
      endDate,
      totalRevenue,
      isStaff,
    });

    const cartByUserStatus = await getCartByUserStatus(startDate, endDate, brand);

    console.log(repeatPercentage, 'repeatPercentage'); 
    // response
    const formattedResponse = {
      totalUsers: totalUsers[0].total_users || 0,
      repeatPercentage: `${repeatPercentage || 0}%` ,
      totalOrders: totalKbOrder || 0,
      totalSalesUnits: Number(totalKbSalesUnits) || 0,
      totalRevenue: formatCurrency(totalKbRevenue),
      totalRevenueScale: formatCurrency(totalScaleRevenue),
      totalScaleSalesUnits: Number(totalScaleSalesUnits) || 0,
      totalProfitScale: formatCurrency(Number(Number(totalScaleRevenue) - (Number(totalScaleSalesUnits)* SMART_SCALE_PRICE_TO_BN)).toFixed(2)),
      bnCommission: formatCurrency(bnCommission),
      gst: formatCurrency(gst),
      teamCommission: formatCurrency(teamCommission),
      netSettlement: formatCurrency(netSettlement),
      staffOrders: staffOrders,
      staffOrderTotalSalesUnits: staffOrderTotalSalesUnits,
      staffOrderTotalRevenue: formatCurrency(staffOrderTotalRevenue),
      birthdayOrders: birthdayOrders,
      birthdayOrderTotalUnits: birthdayOrderTotalSalesUnits,
      birthdayOrderTotalNetSettlement: formatCurrency(
        birthdayOrderTotalRevenue
      ),
      generalOrders: generalOrders,
      generalOrderTotalUnits: generalOrderTotalSalesUnits,
      generalOrderTotalNetSettlement: formatCurrency(generalOrderTotalRevenue),
      totalFreeOrders: Number(birthdayOrders + generalOrders).toLocaleString(),
      totalFreeUnits: Number(birthdayOrders + generalOrders).toLocaleString(),
      totalFreeNetSettlement: formatCurrency(
        Number(birthdayOrderTotalRevenue) + Number(generalOrderTotalRevenue)
      ),
      totalFreeScaleSettlement: formatCurrency(
        Number(totalFreeScaleSettlement)
      ),
      totalFreeScaleUnits: Number(totalFreeScaleUnits),
      userStatusWiseData,
      financialYearData,
      financialYearDataScale,
      financialYearDataSnacks,
      genderWiseDistributedData,
      regionWiseDistributedData,
      topThreeProducts,
      cartByUserStatus,
      deliveryWiseData,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User App Count Data fetched successfully",
      data: formattedResponse,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getProductDashboardData = async (req, res, next) => {
  try {
    const {
      dateFilter,
      customStart,
      customEnd,
      page,
      type,
      limit,
      search,
      table,
      orderType,
      deliveryStatus = "All",
      brand = 'all'
    } = req.body;

    if (!dateFilter || !table) {
      return next(
        new ErrorHandler("Missing dateFilter or table in request body", 400)
      );
    }
    const { startDate, endDate } = getDateRange(
      dateFilter,
      customStart,
      customEnd
    );

    const { results } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: ["SUM(po.total_price) as total_revenue"],
      conditions: [
        { field: "po.created_at", operator: ">=", value: startDate },
        { field: "po.created_at", operator: "<=", value: endDate },
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        ...(brand != 'all' ? [{ field: "po.brand", operator: "=", value: brand || 'kilobeaters' }] : []),
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
    });

    const totalRevenue = results[0].total_revenue || 0;
    var responsePayload = {};
    switch (table) {
      case "gender":
        responsePayload = await getSalesDistributionByGender(
          startDate,
          endDate
        );
        break;
      case "country":
        responsePayload = await getSalesDistributionByCountry(
          startDate,
          endDate,
          totalRevenue,
          page,
          limit,
          search
        );
        break;
      case "customer":
        responsePayload = await getCustomerProductPurchaseDetails({
          startDate,
          endDate,
          totalRevenue,
          orderType,
          type,
          deliveryStatus,
          page,
          limit,
          search,
          brand
        });
        break;
      case "all":
        responsePayload = await getAllProductPurchaseDetails({
          startDate,
          endDate,
          totalRevenue,
          orderType,
          deliveryStatus,
          page,
          limit,
          search,
          brand,
        });
        break;
      case "cart":
        responsePayload = await getCartUserTableData(
          startDate,
          endDate,
          page,
          limit,
          search
        );
        break;

      case "mentor":
        responsePayload = await getMentorWiseSalesData(
          startDate,
          endDate,
          totalRevenue,
          page,
          limit,
          search,
          brand
        );
        break;

      case "counsellor":
        responsePayload = await getCounsellorWiseSalesData(
          startDate,
          endDate,
          totalRevenue,
          page,
          limit,
          search,
          brand
        );
        break;
      case "other_sales":
        responsePayload = await getOtherSalesData(
          startDate,
          endDate,
          totalRevenue,
          page,
          limit,
          search,
          brand
        );
        break;

      default:
        break;
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Product Dashboard - ${table} Data fetched successfully`,
      data:
        Object.keys(responsePayload).length === 0
          ? { data: [] }
          : responsePayload,
      totalPages: responsePayload.totalPages || 1,
      page: responsePayload.page ? responsePayload?.page : 1,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getExportExcelProductDashboardData = async (req, res, next) => {
  try {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      "Customer Product Purchase Details"
    );
    const { dateFilter, customStart, customEnd, type, orderType, gstExport } = req.query;

    if (!dateFilter) {
      return next(
        new ErrorHandler("Missing dateFilter or table in request body", 400)
      );
    }

    console.log(req.query, "HELLOOO");

    const { startDate, endDate } = getDateRange(dateFilter, customStart, customEnd);

    var purchaseData = [];
    if (orderType && !type) {
      if (gstExport == "true") {
        console.log("HELLOOOO", gstExport);
        purchaseData = await getProductOrdersDataForGst({
          startDate,
          endDate,
          page: 1,
          limit: 0,
          orderType,
        });
      } else {
        purchaseData = await getAllProductPurchaseDetails({
          startDate,
          endDate,
          page: 1,
          limit: 0,
          orderType,
        });
      }
    } else {
      purchaseData = await getCustomerProductPurchaseDetails({
        startDate,
        endDate,
        page: 1,
        limit: 0,
        type,
        orderType,
        brand
      });
    }

    worksheet.columns = [
      { header: "Order ID", key: "order_id" },
      { header: "Customer Name", key: "customer_name" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "customer_phone" },
      { header: "Product Name", key: "product_name" },
      { header: "Units", key: "total_units" },
      { header: "Amount", key: "amount" },
      { header: "Commission", key: "bn_commission" },
      { header: "Team Commission", key: "team_commission" },
      { header: "GST", key: "gst" },
      { header: "Order Details", key: "order_items" },
      { header: "Net To Kilometer", key: "net_to_kilometer" },
      { header: "Order Date", key: "order_date" },
      { header: "Price_to_bn", key: "price_per_unit_to_bn" },
      { header: "Pack Size", key: "pack_size" },
      { header: "Status", key: "user_status" },
      { header: "Mentor Name", key: "mentor_name" },
      { header: "Counsellor Name", key: "counsellor_name" },
      { header: "Customer City", key: "customer_city" },
      { header: "Customer State", key: "customer_state" },
      { header: "Customer Country", key: "customer_country" },
      { header: "Customer Pincode", key: "customer_pincode" },
      { header: "Customer Address", key: "customer_address" },
      { header: "Customer Landmark", key: "customer_landmark" },
      { header: "AWB Number", key: "awb_number" },
      { header: "Status", key: "status" },
    ];

    // Fill missing values with "N/A"
    purchaseData?.data?.forEach((rowData) => {
      const sanitizedRow = {};

      worksheet.columns.forEach((col) => {
        let value = rowData[col.key];

        // Parse order_items only once
        let items = [];
        if (rowData.order_items) {
          try {
            let data = rowData.order_items;

            // If it's a string, parse it
            if (typeof data === "string") {
              data = JSON.parse(data);
            }

            // If it's an object, wrap it as an array
            if (Array.isArray(data)) {
              items = data;
            } else if (data && typeof data === "object") {
              items = [data];
            }
          } catch (err) {
            console.log("order_items parse error:", err);
            items = [];
          }
        }

        // Product Name column: list of product names
        if (col.key === "product_name") {
          value = items.length
            ? items.map((i) => i.product_name).join(", ")
            : "N/A";
        }

        // Order Details column: readable breakdown instead of JSON
        if (col.key === "order_items") {
          value = items.length
            ? items
                .map(
                  (i) =>
                    `${i.product_name} (Qty: ${i.quantity}, Price: ₹${i.total_price})`
                )
                .join(" | ")
            : "N/A";
        }

        sanitizedRow[col.key] =
          value === undefined || value === null || value === "" ? "N/A" : value;
      });

      worksheet.addRow(sanitizedRow);
    });

    // Bold header row
    worksheet.getRow(1).font = { bold: true };

    // Set headers for Excel download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=BN_Shop_Customer_Purchase_Details_${startDate}_${endDate}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getExportExcelCartDashboardData = async (req, res, next) => {
  try {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer Cart Added Details");
    const { dateFilter, customStart, customEnd } = req.query;

    if (!dateFilter) {
      return next(
        new ErrorHandler("Missing dateFilter or table in request body", 400)
      );
    }

    const { startDate, endDate } = getDateRange(dateFilter, customStart, customEnd);
    const cartData = await getCartUserTableData(startDate, endDate, 1, 0);

    worksheet.columns = [
      { header: "User ID", key: "user_id" },
      { header: "Customer Name", key: "customer_name" },
      { header: "Email", key: "email_id" },
      { header: "Phone Number", key: "phone_number" },
      { header: "Status", key: "user_status" },
      { header: "Cart Data", key: "added_cart" },
      { header: "Added Date", key: "added_date" },
      { header: "Cart Count", key: "cart_count" },
      { header: "Mentor Name", key: "mentor_name" },
      { header: "Counsellor Name", key: "counsellor_name" },
    ];

    cartData?.data.forEach((r) => {
      const addedCart = Array.isArray(r.added_cart)
        ? r.added_cart
            .map(
              (item, i) =>
                `${i + 1}. ${item.product_name || "N/A"} (${
                  item.pack_size || "N/A"
                }) x${item.quantity || 0} | ₹${item.total_price || "N/A"}`
            )
            .join("\n")
        : "N/A";

      const cleanRow = {};
      worksheet.columns.forEach((col) => {
        const key = col.key;
        let value = r[key];
        if (value === null || value === undefined || value === "") {
          value = "N/A";
        }
        cleanRow[key] = key === "added_cart" ? addedCart : value;
      });

      worksheet.addRow(cleanRow);
    });

    worksheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=BN_Shop_Cart_Added_User_Details_${startDate}_${endDate}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const markNetSettledForFinancialYear = async (req, res, next) => {
  try {
    const { date } = req.body;

    const currentTimestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const updatedResult = await updateRecord(
      `${tables.product_orders}`,
      {
        net_settled: 1,
        settled_date: currentTimestamp,
      },
      {
        "DATE_FORMAT(created_at, '%Y-%m')": date,
        payment_method: "online",
        staff_order: 0,
      },
      {
        field: "payment_status",
        operator: "NOT IN",
        value: "('Failed', 'Pending')",
        raw: true,
      }
    );

    const affected =
      updatedResult?.affectedRows ??
      updatedResult?.rowCount ??
      updatedResult ??
      0;

    if (affected === 0) {
      throw new ErrorHandler(
        "No records were updated — check your date or filters.",
        400
      );
    }

    return res.status(200).json({
      status: "success",
      message: `Net Settled marked successfully for ${affected} records.`,
    });
  } catch (error) {
    console.error(error);
    return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler("Internal Server Error", 500)
    );
  }
};

export const updateAwbNumberByRazporpayId = async (req, res, next) => {
  try {
    const { razorpayId, awbNumber } = req.body;

    if (!razorpayId || !awbNumber) {
      throw new ErrorHandler(
        "Missing razorpayId or awbNumber in request body",
        400
      );
    }

    const updatedResult = await updateRecord(
      `${tables.product_orders}`,
      {
        awb_number: awbNumber,
      },
      {
        razorpay_payment_id: razorpayId,
      }
    );

    const affected =
      updatedResult?.affectedRows ??
      updatedResult?.rowCount ??
      updatedResult ??
      0;

    if (affected === 0) {
      throw new ErrorHandler(
        "No records were updated — check your date or filters.",
        400
      );
    }

    // fetch awb status ->

    return res.status(200).json({
      status: "success",
      data: {},
      message: `Awb Number updated successfully for ${affected} records.`,
    });
  } catch (error) {
    console.error(error);
    return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler("Internal Server Error", 500)
    );
  }
};

export const updateProductDeliveryStatus = async (
  req,
  res,
  next,
  internal = false
) => {
  try {

    const { results: shipyaariOrders } = await readRecord({
      table: `${tables.product_orders}`,
      selectFields: ["awb_number"],
      conditions: [
        {
          field: "payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
        {
          field: "status",
          operator: "!=",
          value: "Delivered",
        },
        {
          field: "awb_number",
          operator: "!=",
          value: "0",
        },

        {
          field: "awb_number",
          operator: "!=",
          value: "",
        },

        {
          field: "awb_number",
          operator: "IS NOT",
          value: "NULL",
          raw: true
        },
        {
          field: "brand",
          operator: "=",
          value: "kilobeaters",
        }
      ],
      groupBy: ["awb_number"],
    });

    if (!shipyaariOrders?.length) {
      if (internal) {
        console.log("No Records found");
        return;
      }
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No records found",
          data: [],
        })
      );
    }

    const shipyaariAwbNumbers = shipyaariOrders
      ?.map((r) => r.awb_number)
      .join(",");

    let orderStatusArrShip = [];
    if (shipyaariAwbNumbers.length > 0) {
      orderStatusArrShip = await fetchShipyaariOrderStatusAndUpdate(
        shipyaariAwbNumbers
      );
    }

    if (!orderStatusArrShip?.length) {
      if (internal)
        return console.log("No Records found or Error from providers");
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No records found or Error from providers",
          data: [],
        })
      );
    }

    const finalOrdersToProcess = orderStatusArrShip?.filter((item) =>
      isFinalStatus(item.status)
    );

    await Promise.all(
      finalOrdersToProcess?.map(async ({ awbNumber, status }) => {
        const mappedStatus =
          status === "FAILED"
            ? ""
            : formatString(status);

        if (!mappedStatus) return;

        const { results: existingStatuses } = await readRecord({
          table: tables.product_orders,
          selectFields: ["status"],
          conditions: [
            { field: "awb_number", operator: "=", value: awbNumber },
          ],
        });

        const existingStatus = existingStatuses[0]?.status;
        if (existingStatus === mappedStatus) return;
        const updateResult = await updateRecord(
          `${tables.product_orders}`,
          {
            status: mappedStatus,
            ...(mappedStatus.toLowerCase().includes("delivered")
              ? { delivery_date: new Date() }
              : {}),
          },
          { awb_number: awbNumber }
        );

        if (updateResult.affectedRows > 0) {
          await sendOrderStatusUpdateNotification({
            status: mappedStatus,
            awbNumber,
          });
        }
      })
    );

    if (internal) return console.log("Successfully Updated Order Status");

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Successfully Updated Order Status",
        data: [],
      })
    );
  } catch (error) {
    console.error(error);
    if (internal!==true) {
      return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler("Internal Server Error", 500)
      );
    }
  }
};

export async function sendOrderStatusUpdateNotification({
  status,
  awbNumber,
  userId,
}) {
  try {
    const { results } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.user_id",
        "cd.user_status",
        "ad.crm_user AS mentor_name",
        "ad.official_phone AS mentor_phone",
        "ad.email_id AS mentor_email",
        "cd.mentor_assigned",
        "cd.email_id",
        "CASE WHEN cd.phone IS NULL THEN po.customer_phone ELSE cd.phone END AS customer_phone",
        "COALESCE(cd.first_name,cd.last_name) AS name",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = po.user_id",
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = cd.mentor_assigned",
        },
      ],
      conditions: [{ field: "awb_number", operator: "=", value: awbNumber }],
      limit: 1,
    });
    const user_id = userId || results[0]?.user_id;
    console.log(user_id);
    console.log(results[0], 2435);
    console.log(status, 2433);
    if (status === "Delivered" && results[0]?.user_status === "Completed") {
      status = status + "-" + results[0]?.user_status;
    } else if (status === "Delivered") {
      status = status + "-Active";
    }
    console.log(status, 2443);
    const orderStatusNotificationMap = {
      // when order is insert in shypbuddy
      "Added in Shipyaari": {
        notificationId: 928,
      },
      Booked: {
        notificationId: 928,
      },
      // order picked up for delivery
      "Picked Up": {
        notificationId: 929,
      },
      // when oredr is in transit to delivery
      "In Transit": {
        notificationId: 930,
      },

      "Out For Delivery": {
        notificationId: 971,
      },

      "Delivered-Active": {
        notificationId: 931,
      },

      "Delivered-Completed": {
        notificationId: 987,
        mailData: ({ user }) => ({
          from: "Support <support@balancenutrition.in>",
          to: user.email_id,
          subject: "Hope You Enjoyed Your BN Hamper!",
          html: `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">

    <p>Hi ${user.name},</p>

    <p>Your BN hamper has been delivered successfully! 🎉</p>

    <p>
      I hope you enjoy the healthy cookies, chips, and our super favourite Nippat.
    </p>

    <p>
      Get in touch with your Mentor, <strong>${user.mentor_name}</strong>, and she will guide you on how to add these products to your diet.
    </p>

    <p>
      <strong>WhatsApp her:</strong><br>
      <a href="https://wa.me/${user.mentor_phone}" style="color: #1a73e8;">Chat on WhatsApp</a>
    </p>

    <p>
      <strong>Talk to her:</strong><br>
      <a href="tel:${user.mentor_phone}" style="color: #1a73e8;">Call ${user.mentor_name}</a>
    </p>

    <p>
      Check out the entire range of BN healthy snacks, desserts & ready-to-eat foods here:<br>
      <a href="https://balancenutrition.in/shop" style="color: #1a73e8;">Browse Healthy Foods</a>
    </p>

    <p>
      <strong>P.S.</strong> You haven't downloaded the BN App — a lot of freebies & offers await you!<br>
      You can download the BN App here:<br>
      <a href="https://www.balancenutrition.in/download-bn-app" style="color: #1a73e8;">BN App Download</a>
    </p>

	<br>
    <br>
    <br>
    <p>Warm Regards,<br>
    <strong>Team Balance Nutrition</strong></p>

  </body>
</html>`,
          bcc: [user.mentor_email],
        }),
        wati_template_data: ({ user }) => ({
          template_name: "oc_hamper_delivered",
          broadcast_name: "oc_hamper_delivered",
          parameters: [
            { name: "name", value: user.name },
            { name: "mentor_name", value: user.mentor_name },
            { name: "mentor_phone", value: user.mentor_phone },
            { name: "mentor_wa", value: user.mentor_phone },
          ],
        }),
      },

      Return: {
        notificationId: 932,
      },

      // failed delivery attempt
      "Rto Delivered": {
        notificationId: 932,
      },
    };
    const notificationData = orderStatusNotificationMap[status];
    const mailData = orderStatusNotificationMap[status]?.mailData
      ? orderStatusNotificationMap[status]?.mailData({ user: results[0] })
      : null;
    const wati_template_data = orderStatusNotificationMap[status]
      ?.wati_template_data
      ? orderStatusNotificationMap[status]?.wati_template_data({
          user: results[0],
        })
      : null;
    console.log(wati_template_data, 2254);
    const tasks = [];
    const notificationId = notificationData?.notificationId;
    if (notificationId) {
      tasks.push(
        axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user_id],
            notification_id: notificationData.notificationId,
            sent_via: "cron",
          }
        )
      );
    }
    if (mailData && results[0]?.email_id) {
      tasks.push(sendMailUtil(mailData));
    }
    if (wati_template_data && results[0]?.customer_phone) {
      tasks.push(
        axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${results[0]?.customer_phone.replace(
            /\D/g,
            ""
          )}`,
          {
            template_name: wati_template_data.template_name,
            broadcast_name: wati_template_data.broadcast_name,
            parameters: wati_template_data.parameters,
          }
        )
      );
    }
    const sendNotification = await Promise.all(tasks);
    return { success: true };
  } catch (error) {
    console.error("Error in sending order status update notification:", error);
    return { success: false, error };
  }
}

export const updateProductOrderDetails = async (req, res, next) => {
  try {
    const { phone_number, status, razorpay_payment_id, awb_number } = req.body;

    if (!razorpay_payment_id) {
      return next(
        new ErrorHandler(
          "Invalid Input: 'razorpay_payment_id' is required",
          400
        )
      );
    }
    if (!phone_number && !status && !awb_number) {
      return next(
        new ErrorHandler(
          "Invalid Input: provide at least one field to update (phone_number, status, or awb_number)",
          400
        )
      );
    }
    if (phone_number && !/^\d{10,12}$/.test(phone_number)) {
      return next(
        new ErrorHandler("Invalid phone number: must be 10 to 12 digits", 400)
      );
    }

    const updateData = {};
    if (phone_number) updateData.customer_phone = phone_number;
    if (status) updateData.status = status;
    if (awb_number) updateData.awb_number = awb_number;
    if (status && status.toLowerCase().includes("delivered")) {
      updateData.delivery_date = new Date();
    }

    let updatedRecord = null;
    if (Object.keys(updateData).length > 0) {
      updatedRecord = await updateRecord(tables.productOrders, updateData, {
        razorpay_payment_id,
      });
    }

    // --- Check if update affected any rows ---
    const message =
      updatedRecord?.affectedRows > 0
        ? "Product order details updated successfully"
        : "No changes were made to the product order";

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message,
        data: [],
      })
    );
  } catch (error) {
    console.error("Error updating product order details:", error);
    return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler("Internal Server Error", 500)
    );
  }
};

export const addZeroInvoiceOrder = async (req, res, next) => {
  try {
    const { productOrderId, items, hamper_type } = req.body;

    if (!productOrderId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(new ApiResponse(400, "Invalid payload"));
    }

    const { results: baseList } = await readRecord({
      table: tables.productOrders,
      selectFields: ["*"],
      conditions: [
        { field: "product_order_id", operator: "=", value: productOrderId },
      ],
      pagination: { page: 1, limit: 1 }
    });

    if (!baseList.length) {
      return res.status(400).json(new ApiResponse(400, "Invalid Product Order ID"));
    }

    const base = baseList[0];
    const columns = [
      "user_id",
      "customer_name",
      "customer_phone",
      "master_order_id",
      "product_order_id",
      "product_id",
      "product_code",
      "product_name",
      "razorpay_payment_id",
      "quantity",
      "pack_size",
      "sub_order_id",
      "price_per_unit",
      "total_price",
      "payment_method",
      "order_total",
      "net_settled",
      "created_at",
      "updated_at",
      "sold_by",
      "customer_address",
      "customer_pincode",
      "customer_city",
      "customer_state",
      "customer_country",
      "hamper_type",
      "payment_status",
      "price_per_unit_to_bn",
      "status",
      "staff_order",
      "awb_number",
      "brand",
      "invoice",
      "razorpay_order_id"
    ];


    const itemsObj = items.map(item=> {
      return {
        ...item, 
        price_per_unit: 0, 
        total_price: 0, 
      }
    })
    
    const orderData = {
       customer_name: base.customer_name,
       customer_address: base.customer_address,
       customer_city: base.customer_city,
       customer_state: base.customer_state,
       customer_country: base.customer_country,
       customer_pincode: base.customer_pincode,
       customer_landmark: base.customer_landmark,
       customer_phone: base.customer_phone,
       product_order_id: base.product_order_id,
       payment_method: base.payment_method,
    }
    // generate an invoice 
    const { invoiceLink } = await generateInvoicePDF(orderData,itemsObj,`${base.master_order_id || base.product_order_id}-R`, 'kb');

    // 3️⃣ Loop and Insert Every Product Item
    for (const item of items) {
      const values = [
        base.user_id,
        base.customer_name,
        base.customer_phone,
        `${base.master_order_id || base.product_order_id}-R`,
        `${base.product_order_id}-R`,
        item.product_id ?? null,
        item.product_code ?? null,
        item.product_name ?? null,
        base.razorpay_payment_id, 
        item.quantity ?? 1,
        item.pack_size ?? "",
        base.sub_order_id ?? 0,
        0,                
        0,       
        base.payment_method,                   // payment_method marker for reporting
        base.order_total ?? 0,   // retain original order_total
        base.net_settled,                          // net_settled
        new Date(),
        new Date(),
        base.sold_by ?? null,
        base.customer_address,
        base.customer_pincode,
        base.customer_city,
        base.customer_state,
        base.customer_country,
        "zero-order",
        "Success",
        base.price_per_unit_to_bn ?? 0,
        base.status,
        base.staff_order ?? 0,
        base.awb_number ?? "",
        base.brand ?? null,
        invoiceLink,               // invoice = 0 because no billing
        base.razorpay_order_id ?? null
      ]


      const ins = await insertRecord(tables.productOrders, columns, values);
      if (ins.affectedRows === 0) {
        throw new ErrorHandler(`Failed inserting manual order line`, 500);
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Manual order inserted successfully",
      })
    );
  } catch (error) {
    console.error("Error in addManualOrder:", error);
    return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler("Internal Server Error", 500)
    );
  }
};


