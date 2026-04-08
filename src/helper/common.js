import moment from "moment";
import { readPool } from "../config/dbConnection.js";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { app_versions, reasonNotificationMap, tables } from "./constant.js";
import { safeJSONParse } from "./commonHelper.js";
import { addAutoDraftedQuery } from "../controllers/common.js";
import clientEnquiry from "../models/clientQueryModel.js";
import UserVisitLog from "../models/userVisitLogModel.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import ContentUsageLog from "../models/contentUsageLogModel.js";
import axios from "axios";

function calculateAge(dateString) {
  // Parse the date string to create a Date object
  const birthDate = new Date(dateString);
  // Get the current date
  const today = new Date();

  // Calculate the difference in years
  let age = today.getFullYear() - birthDate.getFullYear();

  // Adjust if the birthday hasn't occurred yet this year
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

// Helper function to get previous inch tracker data
const getPreviousInchTracker = async (sub_order_id, prev_session) => {
  const { results } = await readRecord({
    table: `${tables.inchRecords}`,
    selectFields: ["hips", "waist", "chest"],
    conditions: [
      { field: "sub_order_id", operator: "=", value: sub_order_id },
      { field: "session", operator: "!=", value: prev_session },
    ],
    orderBy: ["session desc"],
    pagination: { limit: 1 },
  });

  return results[0] || {}; // Return empty object if there are less than 2 records
};

// Helper function to get current inch tracker data
const getInchTracker = async (sub_order_id, session_number) => {
  const { results } = await readRecord({
    table: `${tables.inchRecords}`,
    selectFields: ["hips", "waist", "chest"],
    conditions: [
      { field: "sub_order_id", operator: "=", value: sub_order_id },
      { field: "session", operator: "=", value: session_number },
    ],
  });

  return results[0] || {}; // Return the current inch tracker data or empty object if not found
};

// Helper function to get photo tracker data
const getPhotoTracker = async (order_id, actual_session) => {
  const { results } = await readRecord({
    table: `${tables.photoRecords}`,
    selectFields: ["photo_url"],
    conditions: [
      { field: "sub_order_id", operator: "=", value: order_id },
      { field: "session", operator: "=", value: actual_session },
    ],
  });

  return results[0] || {}; // Return the photo tracker data or empty object if not found
};

// Helper function to get goal data (new, achieved, milestones)
const getGoalData = async (user_id, sub_order_id) => {
  try {
    const { results } = await readRecord({
      table: `${tables.bnMyGoalsNew} gm`,
      selectFields: ["gm.comment"],
      conditions: [
        { field: "gm.user_id", operator: "=", value: user_id },
        { field: "gm.sub_order_id", operator: "=", value: sub_order_id },
      ],
    });

    if (!results || results.length === 0) {
      return {}; // No goals found
    }

    const { new_goals, goals_achieved, milestone_achieved } = safeJSONParse(
      results[0].comment,
      {},
    );
    return { new_goals, goals_achieved, milestone_achieved };
  } catch (error) {
    console.error("Error fetching goal data:", error);
    return {}; // Return empty object on error
  }
};

const processWeight = (weight) => {
  if (typeof weight === "number" || typeof weight === "string") {
    return weight;
  }
  const weightMatch = weight.match(/^(\d+(\.\d+)?)\s*(kg|lbs)$/i); // Matches weight followed by kg/lbs
  if (weightMatch) {
    const value = parseFloat(weightMatch[1]);
    const unit = weightMatch[3].toLowerCase();

    // Convert weight to kg if it's in lbs
    if (unit === "lbs") {
      return value * 0.453592;
    }
    return value; // If already in kg, return the same value
  }
  return null;
};

const processHeight = (height) => {
  // console.log(height, 48);
  // console.log(typeof height, 49);
  console.log("Yesss");
  // If height is a number (like 5.9, 5.10, or 5.11)
  if (typeof height === "number" || typeof height === "string") {
    const [feetStr, inchStr] = height.toString().split(".");
    const feet = parseInt(feetStr, 10);
    const inches = inchStr ? parseInt(inchStr, 10) : 0;
    // Convert feet and inches to meters
    return feet * 0.3048 + inches * 0.0254;
  }

  // If height is a string (like "5 ft 6 in" or "1.75 m")
  const heightMatch = height.match(
    /^(\d+(\.\d+)?)\s*(ft|m)(\s*(\d+(\.\d+)?))?\s*(in)?$/i,
  );

  if (heightMatch) {
    const value = parseFloat(heightMatch[1]);
    const unit = heightMatch[3].toLowerCase();

    if (unit === "ft") {
      const inches = heightMatch[5] ? parseFloat(heightMatch[5]) : 0;
      // Convert height to meters if in feet and inches
      return value * 0.3048 + inches * 0.0254;
    } else if (unit === "m") {
      return value; // height is already in meters
    }
  }

  return null; // Invalid input
};

const calculateBMI = (weight, height) => {
  const processedWeight = processWeight(weight);
  const processedHeight = processHeight(height);
  // console.log(processedHeight, 88);
  // console.log(weight, 89998);
  // Validate input values
  if (processedHeight <= 0 || processedWeight <= 0) {
    return "Height and weight must be positive numbers.";
  }

  // Calculating BMI
  const bmi = processedWeight / Math.pow(processedHeight, 2);

  // Round BMI value to two decimal places for consistency
  return Math.round(bmi * 100) / 100;
};
// console.log(processHeight(5.9), 95);
const calculateIdealWeight = (height, gender) => {
  const processedHeight = processHeight(height);
  // console.log(processedHeight, 100);
  const heightInInches = processedHeight / 0.0254;
  // console.log(heightInInches, 94);
  const inchesOver5Feet = heightInInches - 60;
  // console.log(inchesOver5Feet, 101);
  let idealWeight;
  console.log(gender, 102102102);
  if (gender.toLowerCase() === "male") {
    idealWeight = 52 + 1.9 * inchesOver5Feet;
  } else if (
    gender.toLowerCase() === "female" ||
    gender.toLowerCase() === "other"
  ) {
    idealWeight = 49 + 1.7 * inchesOver5Feet;
  } else {
    return NaN;
  }

  return Math.round(idealWeight);
};
const calculateTotalHealthScore = ({
  sleep_duration,
  smoking_frequency,
  alcohol_frequency,
  water_frequency,
  veg_fruits_frequency,
  activity_level,
  health_issues,
}) => {
  let totalScore = 0;

  totalScore += Number(sleep_duration);
  totalScore += Number(smoking_frequency);
  totalScore += Number(alcohol_frequency);
  totalScore += Number(water_frequency);
  totalScore += Number(veg_fruits_frequency);
  totalScore += Number(activity_level);

  totalScore += health_issues.length * -2;

  const maxScore = 100;
  const finalScore = Math.max(0, Math.min(maxScore, totalScore));

  return { score: finalScore };
};

function rangeFormatter(range) {
  const first_index = range[0];
  const second_index = range[1];
  return `${first_index}-${second_index}`;
}

const getUsersForNotification = async (notification) => {
  try {
    const conditions = [];

    if (notification.wallet_range) {
      const [minWallet, maxWallet] = JSON.parse(notification.wallet_range)
        .split("-")
        .map(Number);
      conditions.push({
        field: "cd.my_wallet",
        operator: "BETWEEN",
        value: [minWallet, maxWallet],
      });
    }

    if (
      notification.user_status &&
      JSON.parse(notification.user_status).length > 0
    ) {
      conditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: JSON.parse(notification.user_status),
      });
    }
    console.log(notification, 159);
    if (notification.user_id && JSON.parse(notification.user_id).length > 0) {
      conditions.push({
        field: "cd.user_id",
        operator: "IN",
        value: JSON.parse(notification.user_id),
      });
    }

    if (
      notification.not_include_user &&
      JSON.parse(notification.not_include_user).length > 0
    ) {
      conditions.push({
        field: "cd.user_id",
        operator: "NOT IN",
        value: JSON.parse(notification.not_include_user),
      });
    }

    if (notification.gender && JSON.parse(notification.gender).length > 0) {
      conditions.push({
        field: "cd.gender",
        operator: "IN",
        value: JSON.parse(notification.gender),
      });
    }

    if (
      notification.countries &&
      JSON.parse(notification.countries).length > 0
    ) {
      conditions.push({
        field: "cd.country_id",
        operator: "IN",
        value: JSON.parse(notification.countries),
      });
    }

    if (notification.cities && JSON.parse(notification.cities).length > 0) {
      conditions.push({
        field: "cd.city_id",
        operator: "IN",
        value: JSON.parse(notification.cities),
      });
    }

    if (notification.states && JSON.parse(notification.states).length > 0) {
      conditions.push({
        field: "cd.state_id",
        operator: "IN",
        value: JSON.parse(notification.states),
      });
    }

    if (notification.weight_range) {
      const [minWeight, maxWeight] = notification.weight_range
        .split("-")
        .map(Number);
      conditions.push({
        field: "cd.latest_weight",
        operator: "BETWEEN",
        value: [minWeight, maxWeight],
      });
    }

    if (notification.age_range) {
      const [minAge, maxAge] = notification.age_range.split("-").map(Number);
      conditions.push({
        field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
        operator: "BETWEEN",
        value: [minAge, maxAge],
        raw: true,
      });
    }

    if (
      notification.ethnicity &&
      JSON.parse(notification.ethnicity).length > 0
    ) {
      conditions.push({
        field: "cd.ethnicity",
        operator: "IN",
        value: JSON.parse(notification.ethnicity),
      });
    }

    let joins = [];

    if (notification.programs && JSON.parse(notification.programs).length > 0) {
      joins.push({
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      });
      joins.push({
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      });
    }
    if (notification.programs && JSON.parse(notification.programs).length > 0) {
      conditions.push({
        field: "ps.program_id",
        operator: "IN",
        value: JSON.parse(notification.programs),
      });
    }
    const { results: users } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["cd.user_id", "cd.fcm_token"],
      conditions,
      joins,
    });

    return users;
  } catch (error) {
    console.error("Error fetching users for notification:", error);
    return [];
  }
};

const fetchScheduledNotifications = async () => {
  const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const next15Minutes = moment()
    .add(15, "minutes")
    .format("YYYY-MM-DD HH:mm:ss");
  return await readRecord({
    table: `${tables.notifications}`,
    selectFields: [
      "id",
      "title",
      "description",
      "notification_banner",
      "schedule_date",
      "schedule_time",
      "wallet_range",
      "user_status",
      "user_id",
      "not_include_user",
      "gender",
      "countries",
      "cities",
      "states",
      "programs",
      "weight_range",
      "age_range",
      "ethnicity",
      "suggested_programs",
      "notification_status",
      "notification_time",
    ],
    conditions: [
      {
        field: "notification_status",
        operator: "=",
        value: "pending",
      },
      {
        field: "notification_time",
        operator: "BETWEEN",
        value: [`${currentTime}`, `${next15Minutes}`],
      },
    ],
  });
};

async function fetchUsersDetails({ ids, selectData }) {
  try {
    let selectFields = [
      "cd.user_id",
      "CONCAT(cd.first_name, ' ', cd.last_name) AS name",
      "cd.email_id",
      "CASE WHEN cd.phone_code NOT IN ('0') THEN CONCAT(cd.phone_code, ' ', cd.phone_number) ELSE cd.phone END AS phone",
      "CASE WHEN cd.gender = '0' THEN 'Others' WHEN cd.gender = '1' THEN 'Male' WHEN cd.gender = '2' THEN 'Female' END AS gender",
      "CASE WHEN cd.user_type = '0' THEN 'Lead' WHEN cd.user_status = 'Active' THEN 'Active' WHEN cd.user_status IN ('Completed') THEN 'OC' ELSE 'Unknown' END AS user_status",
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
    ];
    if (selectData.includes("active_program")) {
      selectFields.push(
        "ap.program_id",
        "ap.program_name",
        "sop.total_sessions  AS active_program_sessions",
        "(sop.total_sessions * 10) AS active_program_duration",
        "sop.mrp AS active_program_mrp",
        "sop.paid_amount AS active_program_amount",
        "sop.created_at AS program_date",
      );
      joins.push({
        type: "LEFT",
        table: `${tables.programsMaster} ap`,
        on: "sop.program_id = ap.program_id",
      });
    }
    if (selectData.includes("suggested_program")) {
      selectFields.push(
        "sp.program_name AS suggested_program_name",
        "spr.suggested_amount ",
        "spr.added_date AS suggested_program_date",
        "CONCAT(ad.first_name,' ',cd.last_name) AS suggested_by",
      );
      joins.push(
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} spr`,
          on: "cd.suggested_program_id = spr.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} sp`,
          on: "spr.program_id = sp.old_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "spr.suggested_by = ad.admin_user_id",
        },
      );
    }
    if (selectData.includes("weight_data")) {
      selectFields.push(
        "wr.wmr_id",
        "CASE WHEN wr.session = 1 AND wr.days = 0 THEN wr.weight ELSE cd.start_weight END AS start_weight",
        "CASE WHEN wr.session = 1 AND wr.days = 0 THEN ROUND(cd.latest_weight - wr.weight,2) ELSE ROUND(cd.latest_weight - cd.start_weight,2) END AS weight_difference",
        "cd.latest_weight",
      );
      joins.push({
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: "sop.sub_order_id = wr.sub_order_id",
      });
    }
    if (selectData.includes("program_number")) {
      selectFields.push(
        "(SELECT COUNT(sop2.order_id) FROM order_details od2 LEFT JOIN sub_orders_programs sop2 ON sop2.order_id = od2.order_id WHERE od2.user_id = cd.user_id) AS program_count",
      );
    }
    if (selectData.includes("advance_purchase")) {
      selectFields.push(
        `(SELECT COUNT(sop2.order_id) FROM order_details od2 LEFT JOIN sub_orders_programs sop2 ON sop2.order_id = od2.order_id WHERE od2.user_id = cd.user_id AND sop2.program_status = '4') AS advance_program_count`,
      );
    }
    if (selectData.includes("health_score")) {
      selectFields.push(
        "hs_latest.overall_health_score AS latest_health_score",
        "hs_latest.created AS latest_health_score_date",
        "hs_earliest.overall_health_score AS earliest_health_score",
        "hs_earliest.created AS earliest_health_score_date",
      );
      joins.push(
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs_latest`,
          on: `sop.sub_order_id = hs_latest.sub_order_id
    AND hs_latest.created = (
        SELECT MAX(hs_inner.created)
        FROM bn_client_hs hs_inner
        WHERE hs_inner.sub_order_id = sop.sub_order_id
    )`,
        },
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs_earliest`,
          on: `sop.sub_order_id = hs_earliest.sub_order_id
    AND hs_earliest.created = (
        SELECT MIN(hs_inner.created)
        FROM bn_client_hs hs_inner
        WHERE hs_inner.sub_order_id = sop.sub_order_id
    )`,
        },
      );
    }

    const { results: users_details } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      joins,
      conditions: [{ field: "cd.user_id", operator: "IN", value: ids }],
      groupBy: ["cd.user_id"],
    });
    return users_details;
  } catch (error) {
    console.log(error);
    throw new Error("Error fetching user details");
  }
}
async function fetchUsersDetailsNew({ ids, selectData, orderBy, search = {} }) {
  try {
    let selectFields = [
      "cd.user_id AS client_user_id",
      "CONCAT(cd.first_name, ' ', cd.last_name) AS client_name",
      "cd.email_id as client_email",
      "cd.cs_notes as cs_notes",
      "CASE WHEN cd.phone_code NOT IN ('0','') THEN CONCAT(cd.phone_code, ' ', cd.phone_number) ELSE cd.phone END AS client_phone",
      "CASE WHEN cd.gender = '0' THEN 'Others' WHEN cd.gender = '1' THEN 'Male' WHEN cd.gender = '2' THEN 'Female' END AS client_gender",
      "cd.sub_user_status",
      "cd.user_status AS client_user_status",
      "cd.my_wallet AS client_wallet",
      "cd.old_wallet AS old_wallet",
      `(
  SELECT 
    CASE 
      WHEN created_at IS NOT NULL THEN CONCAT(
        CASE 
          WHEN hamper_type = 'general' THEN 'FREE HAMPER ('
          WHEN hamper_type = 'birthday' THEN 'BIRTHDAY HAMPER ('
          WHEN hamper_type = 'pregnancy' THEN 'PREGNANCY HAMPER ('
          ELSE 'HAMPER '
        END,po.status ,") ",
        DATE_FORMAT(created_at, '%b-%Y')
      )
      ELSE NULL
    END
  FROM ${tables.productOrders} po
  WHERE po.payment_method = 'free'
    AND po.sub_order_id = cd.active_order_id
    AND po.brand = 'kilobeaters'
    AND po.user_id = cd.user_id
  ORDER BY po.order_id DESC
  LIMIT 1
) AS hamper_status`,
 `COALESCE(
  (
    SELECT 
      concat("BN-Smart Scale (Purchased) - ",upper(po.payment_method))
    FROM ${tables.productOrders} po
    WHERE po.payment_status = 'Success'
      AND po.user_id = cd.user_id
      AND po.product_id = 'bn-bodyscan-smart-scale'
    ORDER BY po.order_id DESC
    LIMIT 1
  ),
  "Not Purchased BN-Smart Scale"
) AS scale_status`,
      "ma.call_link as call_link",
      "ma.official_phone as mentor_wa",
      "cd.active_order_id AS client_active_order_id",
      `(CASE WHEN cd.app_version IN ("${app_versions.ios}","${app_versions.android}") then "(App Updated)" ELSE "(App Not Updated)" END) AS app_updated`,
      "cd.device AS user_device",
      "cd.app_version AS user_app_version",
      "cd.wati_added_date",
      "cd.medical_issue",
      "cd.birth_date",
      "cd.cs_notes",
      "(SELECT (weight_difference*-1) FROM `bn_client_hs` WHERE `user_id` = cd.user_id ORDER BY id DESC LIMIT 1) as lead_latest_weight_difference",
      "(SELECT overall_health_score FROM `bn_client_hs` WHERE `user_id` = cd.user_id ORDER BY id DESC LIMIT 1) as lead_latest_health_score",
      "(SELECT health_category FROM `bn_client_hs` WHERE `user_id` = cd.user_id ORDER BY id DESC LIMIT 1) as lead_latest_health_category",
    ];
    let joins = [];
    let withQuery = [];
    let values = []; // Added: To store parameterized query values

    if (selectData.active_program) {
      selectFields.push(
        "ap.program_id AS current_program_id",
        "ap.program_name AS current_program_name",
        "sop.total_sessions * 10 AS current_program_duration",
        `CONCAT(ap.program_name, 
    CASE WHEN ps.program_duration IS NOT NULL 
         THEN CONCAT(' (', ps.program_duration, ')') 
         ELSE '' 
    END
) AS current_program_name_days`,
        "sop.mrp AS current_program_mrp",
        "sop.paid_amount AS current_program_amount",
        "sop.program_combo",
        "pm.name as current_program_payment_mode",
        "sop.total_sessions AS current_program_total_sessions",
        "sop.sent_sessions AS current_program_sent_sessions",
        "ma.crm_user AS mentor_assigned",
        "ad.crm_user as crm_user",
        "(SELECT COUNT(diet_id) FROM `diet_session_log` WHERE diet_name LIKE '%Auto Closed By System%' and sub_order_id=cd.active_order_id) as dropout_count",
        "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
        "TIMESTAMPDIFF(DAY, sop.start_date, CURDATE()) AS current_program_validity_used",
        "DATE_FORMAT(sop.expiry_date,'%d %b %Y') AS current_program_expiry_date",
        "COALESCE(sop.start_program_weight, cd.start_weight) AS program_start_weight",
        "cd.latest_weight AS client_latest_weight",
        "ROUND(cd.latest_weight - COALESCE(sop.start_program_weight, cd.start_weight), 2) AS client_weight_difference",
        "(SELECT weight FROM weight_records wr WHERE wr.user_id = cd.user_id and wr.sub_order_id=sop.sub_order_id ORDER BY wr.wmr_id ASC limit 1) as sop_start_weight",
        "(SELECT weight FROM weight_records wr WHERE wr.user_id = cd.user_id and wr.sub_order_id=sop.sub_order_id ORDER BY wr.wmr_id DESC limit 1) as sop_end_weight",
        "(SELECT weight FROM weight_records wr WHERE wr.user_id = cd.user_id ORDER BY wr.wmr_id ASC limit 1) as overall_start_weight",
        "(SELECT weight FROM weight_records wr WHERE wr.user_id = cd.user_id ORDER BY wr.wmr_id DESC limit 1) as overall_end_weight",
        "cd.height AS client_height",
        "sop.start_date AS current_program_start_date",
        "ads.crm_user AS current_program_sale_by",
        "sop.start_date AS program_start_date",
        `CASE 
          WHEN DATE(sop.start_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'today'
          ELSE 'older'
        END AS program_start_group`,
        `CASE 
          WHEN sop.start_date_added_by = 0 THEN 'Default'
          WHEN sop.start_date_added_by = 1 THEN 'Mentor'
          WHEN sop.start_date_added_by = 2 THEN 'Client'
          ELSE 'Unknown'
        END AS start_date_added_by_label`,
        "sop.order_type as current_program_order_type",
        "sop.start_date_added_by",
      );
      joins.push(
        "LEFT JOIN sub_orders_programs sop ON cd.active_order_id = sop.sub_order_id",
        "LEFT JOIN programs_master ap ON sop.program_id = ap.program_id ",
        "LEFT JOIN admin_users ma ON cd.mentor_assigned = ma.admin_user_id ",
        "LEFT JOIN order_details od ON sop.order_id = od.order_id ",
        "LEFT JOIN accounts_payment_modes pm ON od.payment_mode = pm.id ",
        "LEFT JOIN order_details od2 ON sop.order_id = od2.order_id",
        "LEFT JOIN admin_users ads ON od2.sale_by = ads.admin_user_id",
        "LEFT JOIN program_session ps ON sop.program_session_id = ps.program_session_id ",
      );
    }
    if (selectData.suggested_program) {
      selectFields.push(
        "spr.program_id as suggested_program_id",
        "spr.suggested_program_id as suggested_id",
        "spr.program_session_id as suggested_program_session_id",
        "sp.program_name AS suggested_program_name",
        "spr.suggested_amount",
        "sps.program_duration as suggested_program_days",
        "sps.mrp AS suggested_program_mrp",
        "DATE_FORMAT(spr.updated_date,'%d %b %Y') AS suggested_at",
        "DATEDIFF(CURDATE(),spr.updated_date) as suggested_days_ago",
        "CONCAT(ad.first_name, ' ', ad.last_name) AS suggested_by",
        "spr.payment_link_id",
        "spr.payment_mode_id as suggested_payment_mode_id",
        "sppm.payment_mode_name suggested_payment_mode",
        "sppm.payment_mode_details suggested_payment_mode_details",
        "spr.payment_expiry suggested_payment_expiry",
        "spr.payment_link_id suggested_payment_link_id",
        "spr.mentor_note sggested_mentor_note",
        "spr.motivation_level AS suggested_motivation_level",
        "spr.status AS suggested_sale_status",
        "spl.payment_link AS suggested_payment_link",
        "wr.posted_date as client_latest_weight_date",
        "wr.wmr_id AS client_latest_weight_id",
        `op.old_pitched_details`,
        "wr.days AS client_latest_weight_day",
        "spr.free_hamper",
      );
      joins.push(
        `LEFT JOIN suggested_program spr ON cd.suggested_program_id = spr.suggested_program_id AND DATE(spr.updated_date) BETWEEN '${moment()
          .startOf("month")
          .format("YYYY-MM-DD")}' AND '${moment().format("YYYY-MM-DD")}' `,
        "LEFT JOIN programs_master sp ON spr.program_id = sp.program_id ",
        "LEFT JOIN program_session sps ON spr.program_session_id = sps.program_session_id ",
        "LEFT JOIN admin_users ad ON spr.suggested_by = ad.admin_user_id ",
        "LEFT JOIN payment_mode sppm ON spr.payment_mode_id = sppm.payment_mode_id ",
        "LEFT JOIN payment_links spl ON spr.payment_link_id = spl.id ",
        `LEFT JOIN (
  SELECT w1.user_id, w1.weight, w1.posted_date,w1.wmr_id,w1.days
  FROM weight_records w1
  INNER JOIN (
    SELECT user_id, MAX(posted_date) AS max_posted_date
    FROM weight_records
    GROUP BY user_id
  ) w2 ON w1.user_id = w2.user_id AND w1.posted_date = w2.max_posted_date
) wr ON wr.user_id = cd.user_id`,
        `LEFT JOIN old_pitch op ON op.user_id = cd.user_id 
    AND op.row_num = CASE WHEN spr.suggested_program_id IS NULL THEN 1 ELSE 2 END`,
      );
      withQuery.push(`old_pitch AS (
    SELECT 
        spo.user_id,
        CONCAT(
            COALESCE(spm.program_name, 'N/A'), ' (',
            COALESCE(sps.program_duration, '0'), 's)<br> Sugg. Amt.: Rs.',
            COALESCE(spo.suggested_amount, '0')
        ) AS old_pitched_details,
        ROW_NUMBER() OVER (PARTITION BY spo.user_id ORDER BY spo.added_date DESC) AS row_num
    FROM suggested_program spo
    LEFT JOIN programs_master spm ON spo.program_id = spm.program_id
    LEFT JOIN program_session sps ON spo.program_session_id = sps.program_session_id
)`);
    }

    if (selectData.latest_weight_data) {
      withQuery.push(`
      weight_ranks AS (
        SELECT 
          user_id,
          sub_order_id,
          weight,
          posted_date,
          wmr_id,
          days,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY posted_date DESC) AS weight_rank
        FROM weight_records
      )
    `);

      // Add joins for latest and previous weight
      joins.push(
        `LEFT JOIN weight_ranks wr1 ON wr1.user_id = cd.user_id AND wr1.weight_rank = 1 AND wr1.sub_order_id = cd.active_order_id`,
        `LEFT JOIN weight_ranks wr2 ON wr2.user_id = cd.user_id AND wr2.weight_rank = 2 AND wr2.sub_order_id = cd.active_order_id`,
      );

      // Add weight fields
      selectFields.push(
        "wr1.weight AS client_latest_weight",
        "wr1.posted_date AS client_latest_weight_date",
        "wr1.days AS client_latest_weight_day",
        "wr2.weight AS client_previous_weight",
        "wr2.posted_date AS client_previous_weight_date",
      );
    }

    if (selectData.maintenance_details) {
      selectFields.push(
        "maintenance.added_date AS maintenance_start_date", // Assuming `maintenance` is a table or alias for your maintenance data
        "DATE_ADD(maintenance.added_date, INTERVAL 30 DAY) AS maintenance_end_date", // Calculating `end_date` as `start_date + 30 days`
      );
      joins.push(
        "LEFT JOIN maintenance_order_details maintenance ON maintenance.user_id = cd.user_id", // Replace `maintenance_table` with your actual maintenance table name
      );
    }
    if (selectData.birthday_hamper) {
      selectFields.push(
        "pod.product_name as hamper_product_name",
        "pod.pack_size as hamper_pack_size",
        "pod.status as delivery_status",
        "pod.created_at as hamper_claimed_date",
        "pod.delivery_date as hamper_delivered_date ",
      );
      joins.push(
        "LEFT JOIN product_orders pod ON pod.user_id = cd.user_id and pod.hamper_type='birthday'", // Replace `maintenance_table` with your actual maintenance table name
      );
    }

    // Add joins for restaurant and alcohol menu
    if (selectData.alcohol_menu) {
      selectFields.push(
        "uam.alcohol_menu_id AS alcohol_menu_id",
        "uam.alcohol_menu AS alcohol_menu_food_menu",
        "uam.total_calories AS alcohol_menu_total_calories",
        "uam.alcohol_calories AS alcohol_menu_alcohol_calories",
        "uam.mixers_calories AS alcohol_menu_mixers_calories",
        "uam.excess_calories AS alcohol_menu_excess_calories",
        "uam.added_date AS alcohol_menu_added_date",
        "uam.ack AS alcohol_menu_ack",
      );
      joins.push(
        `LEFT JOIN user_alcohol_menu uam 
        ON cd.user_id = uam.user_id
        AND uam.added_date = (
          SELECT MAX(added_date) FROM user_alcohol_menu WHERE user_id = cd.user_id
        )`,
      );
    }

    // Ensure restaurant menu is selected (fetching latest restaurant menu item per user)
    if (selectData.restaurant_menu) {
      selectFields.push(
        "urm.menu_id AS restaurant_menu_id",
        "urm.food_menu AS restaurant_menu_food_menu",
        "urm.total_calories AS restaurant_menu_total_calories",
        "urm.excess_calories AS restaurant_menu_excess_calories",
        "urm.total_protein AS restaurant_menu_total_protein",
        "urm.total_carbs AS restaurant_menu_total_carbs",
        "urm.total_fat AS restaurant_menu_total_fat",
        "urm.added_date AS restaurant_menu_added_date",
        "urm.ack AS restaurant_menu_ack",
      );
      joins.push(
        `LEFT JOIN user_restaurant_menu urm 
        ON cd.user_id = urm.user_id
        AND urm.added_date = (
          SELECT MAX(added_date) FROM user_restaurant_menu WHERE user_id = cd.user_id
        )`,
      );
    }

    if (selectData.diet_feedback) {
      selectFields.push(
        "df.result AS diet_feedback_result",
        "df.diet_id AS diet_feedback_diet_id",
        "df.session AS diet_feedback_session",
        "df.created_at AS diet_feedback_created_at",
        "df.imf_concern AS imf_concern",
        "df.is_imf as is_imf",
        "dsl.diet_name as diet_name",
        "(SELECT assessment_id FROM assessment WHERE user_id = df.user_id AND completion_status = '2' ORDER BY assessment_id DESC LIMIT 1) as assessmentId",
      );

      joins.push(
        `
    LEFT JOIN diet_feedback df ON df.user_id = cd.user_id and df.session = sop.sent_sessions
  `,
        `LEFT JOIN diet_session_log dsl ON dsl.diet_id = df.diet_id`,
      );
    }

    if (selectData.spin_to_win) {
      selectFields.push(
        "stwl.comment AS comment",
        "stwl.prize AS prize",
        "DATE_FORMAT(stwl.added_date, '%Y-%m-%d') AS added_date",
      );

      joins.push("LEFT JOIN prize_details stwl ON stwl.user_id = cd.user_id");
    }

    if (selectData.follow_up) {
      selectFields.push(
        "prev_fu.follow_up_date AS prev_follow_up_date",
        "prev_fu.follow_up_id AS prev_follow_up_id",
        "prev_fu.type AS prev_follow_up_type",
        "prev_fu.source as prev_source",
        "prev_fu.campaign as prev_campaign",
        "prev_fu.assigned_by AS prev_follow_up_assigned_by",
        "prev_fu.appointment_slots AS prev_appointment_slots",
        "prev_fu.follow_up_note AS prev_follow_up_note",

        "next_fu.follow_up_date AS next_follow_up_date",
        "next_fu.follow_up_id AS next_follow_up_id",
        "next_fu.type AS next_follow_up_type",
        "next_fu.source as next_source",
        "next_fu.campaign as next_campaign",
        "next_fu.assigned_by AS next_follow_up_assigned_by",
        "next_fu.appointment_slots AS next_appointment_slots",
        "next_fu.follow_up_note AS next_follow_up_note",
      );

      withQuery.push(`
        past_follow_up AS (
          SELECT
            fu.user_id,
            fu.follow_up_id,
            fu.follow_up_date,
            fu.type,
            fu.follow_up_note,
            ab.crm_user AS assigned_by,
            fu.source as source, 
            fu.campaign as campaign, 
            CASE 
              WHEN fu.type IN ('0', 0) THEN slot.appointment_slots
              WHEN fu.type IN ('1','2',1,2) THEN wap_slot.appointment_slots
              ELSE NULL
            END AS appointment_slots,
            ROW_NUMBER() OVER (
              PARTITION BY fu.user_id
              ORDER BY fu.follow_up_date DESC
            ) AS rn
          FROM ${tables.leadFollowUpLogs} fu
          LEFT JOIN ${tables.adminUsers} ab
            ON fu.added_by = ab.admin_user_id
          LEFT JOIN ${tables.slots} slot
            ON fu.slot_id = slot.id AND fu.type IN ('0', 0)
          LEFT JOIN ${tables.whatsappAppSlots} wap_slot
            ON fu.slot_id = wap_slot.id AND fu.type IN ('1','2', 1,2)
          WHERE fu.follow_up_date < CURDATE() 
        ),
        future_follow_up AS (
          SELECT
            fu.user_id,
            fu.follow_up_id,
            fu.follow_up_date,
            fu.type,
            fu.source as source, 
            fu.campaign as campaign, 
            fu.follow_up_note,
            ab.crm_user AS assigned_by,
            CASE 
              WHEN fu.type IN ('0', 0) THEN slot.appointment_slots
              WHEN fu.type IN ('1','2', 1,2) THEN wap_slot.appointment_slots
              ELSE NULL
            END AS appointment_slots,
            ROW_NUMBER() OVER (
              PARTITION BY fu.user_id
              ORDER BY fu.follow_up_date ASC
            ) AS rn
          FROM ${tables.leadFollowUpLogs} fu
          LEFT JOIN ${tables.adminUsers} ab
            ON fu.added_by = ab.admin_user_id
          LEFT JOIN ${tables.slots} slot
            ON fu.slot_id = slot.id AND fu.type IN ('0',0)
          LEFT JOIN ${tables.whatsappAppSlots} wap_slot
            ON fu.slot_id = wap_slot.id AND fu.type IN ('1','2', 1, 2)
          WHERE fu.follow_up_date >= CURDATE() 
        )
      `);

      joins.push(
        `LEFT JOIN past_follow_up prev_fu
           ON prev_fu.user_id = cd.user_id
          AND prev_fu.rn = 1`,

        `LEFT JOIN future_follow_up next_fu
           ON next_fu.user_id = cd.user_id
          AND next_fu.rn = 1`,
      );
    }

    if (selectData.order_summary) {
      withQuery.push(`sop_count AS (
        SELECT
            od2.user_id,
            sop2.order_id,
            SUM(CASE WHEN sop2.program_type = 0 AND sop2.program_status IN ('1', '3') THEN 1 ELSE 0 END) AS client_program_count,
            SUM(CASE WHEN sop2.program_status = '4' THEN 1 ELSE 0 END) AS client_advance_program_count
        FROM order_details od2
        LEFT JOIN sub_orders_programs sop2 ON sop2.order_id = od2.order_id
        WHERE sop2.program_type = 0
        GROUP BY od2.user_id
    )`);
      selectFields.push(
        "sop_count.client_program_count",
        "sop_count.client_advance_program_count",
      );
      joins.push("LEFT JOIN sop_count ON sop_count.user_id = cd.user_id ");
    }

    if (selectData.diet_status) {
      selectFields.push(`
    CASE 
      WHEN latest_dsl.diet_status = '2' THEN 'Drafted' 
      ELSE 'Not Drafted' 
    END AS diet_plan_status
  `);

      joins.push(`
    LEFT JOIN (
      SELECT dsl1.*
      FROM ${tables.dietSessionLog} dsl1
      INNER JOIN (
        SELECT user_id, sub_order_id, MAX(diet_added_date) AS max_updated
        FROM ${tables.dietSessionLog}
        GROUP BY user_id, sub_order_id
      ) dsl2
      ON dsl1.user_id = dsl2.user_id 
      AND dsl1.sub_order_id = dsl2.sub_order_id 
      AND dsl1.diet_added_date = dsl2.max_updated
    ) latest_dsl ON latest_dsl.user_id = cd.user_id AND latest_dsl.sub_order_id = sop.sub_order_id
  `);
    }

    if (selectData.on_hold_od) {
      selectFields.push(
        "oh.start_date AS on_hold_start_date",
        "oh.end_date AS on_hold_end_date",
        "oh.on_hold_note AS on_hold_note",
        `CASE 
          WHEN DATE(oh.end_date) = CURDATE() THEN 'today'
          ELSE 'older'
        END AS on_hold_status_group`,
      );

      joins.push(`
        LEFT JOIN (
          SELECT user_id, sub_order_id, MAX(start_date) AS start_date,MAX(end_date) AS end_date, MAX(onhold_note) AS on_hold_note
          FROM onhold_clients
          GROUP BY user_id, sub_order_id
        ) oh ON oh.user_id = cd.user_id AND oh.sub_order_id = sop.sub_order_id
      `);
    }

    if (selectData.call_od) {
      selectFields.push(
        `
        CASE
      WHEN (
         sop.sent_sessions = 1 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5
      )
      AND cu3.user_id IS NULL
      THEN 'welcome_call'
        
      WHEN (
        (sop.total_sessions = 6 AND sop.sent_sessions = 4 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
        OR
        (sop.total_sessions = 9 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
      )
      AND cu1.user_id IS NULL
      THEN 'half_time_call'
      WHEN (
        (sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 7 AND 9)
        OR
        (sop.total_sessions = 6 AND sop.sent_sessions = 6 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
        OR
        (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10)
      )
      AND cu2.user_id IS NULL
      THEN 'tail_end_call'
      ELSE NULL
    END AS call_type_group`,
      );

      joins.push(
        `LEFT JOIN ${tables.dietSessionLog} dsl 
    ON sop.sub_order_id = dsl.sub_order_id 
    AND dsl.session = sop.sent_sessions 
    AND dsl.diet_status = 4`,

        `LEFT JOIN ${tables.callUpdates} cu1 
    ON sop.sub_order_id = cu1.sub_order_id 
    AND cu1.call_type = '1'`,

        `LEFT JOIN ${tables.callUpdates} cu2 
    ON sop.sub_order_id = cu2.sub_order_id 
    AND cu2.call_type = '2'`,

        `LEFT JOIN ${tables.callUpdates} cu3 
    ON sop.sub_order_id = cu3.sub_order_id 
    AND cu3.call_type = '0'`,
      );
    }

    if (selectData.feedback_od) {
      selectFields.push(
        `CASE
      WHEN (
        (
          (sop.total_sessions = 3 AND sop.sent_sessions = 2 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10)
          OR (sop.total_sessions = 6 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
        )
        AND hf.user_id IS NULL
      ) THEN 'half_time_feedback'

      WHEN (
        (
          (sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 4 AND 6)
          OR (sop.total_sessions = 6 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10)
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 8 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
        )
        AND ff.user_id IS NULL
      ) THEN 'final_feedback'

      ELSE NULL
    END AS feedback_type_group`,
      );

      joins.push(
        `LEFT JOIN ${tables.dietSessionLog} dsl 
      ON sop.sub_order_id = dsl.sub_order_id 
      AND dsl.session = sop.sent_sessions 
      AND dsl.diet_status = 4`,

        `LEFT JOIN ${tables.halfTimeFeedback} hf 
      ON hf.user_id = cd.user_id 
      AND hf.sub_order_id = sop.sub_order_id`,

        `LEFT JOIN ${tables.finalFeedback} ff 
      ON ff.user_id = cd.user_id 
      AND ff.sub_order_id = sop.sub_order_id`,
      );
    }

    if (selectData.healthscore_od) {
      selectFields.push(
        `CASE 
      WHEN (
        (
          (sop.total_sessions = 6 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10)
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10)
        )
        AND hs1.user_id IS NULL
      ) THEN 'half_time_healthscore'

      WHEN (
        (
          (sop.total_sessions = 3 AND sop.sent_sessions = 3 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 3)
          OR (sop.total_sessions = 6 AND sop.sent_sessions = 5 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 1 AND 5)
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 7 AND DATEDIFF(NOW(), dsl.diet_start_date) BETWEEN 6 AND 10)
        )
        AND hs2.user_id IS NULL
      ) THEN 'program_healthscore'

      ELSE NULL
    END AS healthscore_type_group`,
      );

      joins.push(
        `LEFT JOIN ${tables.dietSessionLog} dsl 
      ON sop.sub_order_id = dsl.sub_order_id 
      AND dsl.session = sop.sent_sessions 
      AND dsl.diet_status = 4`,

        `LEFT JOIN ${tables.healthScoreClient} hs1 
      ON hs1.user_id = cd.user_id 
      AND hs1.type = 1 
      AND DATE(hs1.created) > DATE(dsl.diet_sent_date)`,

        `LEFT JOIN ${tables.healthScoreClient} hs2 
      ON hs2.user_id = cd.user_id 
      AND hs2.type = 2 
      AND DATE(hs2.created) > DATE(dsl.diet_sent_date)`,
      );
    }

    if (selectData.validity_extensions) {
      withQuery.push(`
    program_expiry_count AS (
      SELECT
        user_id,
        sub_order_id,
        COUNT(*) AS validity_extension_count
      FROM program_expiry_log
      GROUP BY user_id, sub_order_id
    )
  `);

      selectFields.push(
        "COALESCE(pec.validity_extension_count, 0) AS validity_extension_count",
      );

      joins.push(`
    LEFT JOIN program_expiry_count pec 
      ON pec.user_id = cd.user_id 
      AND pec.sub_order_id = sop.sub_order_id
  `);
    }

    if (selectData.call_logs) {
      withQuery.push(`
    latest_call_update AS (
      SELECT cu1.*
      FROM call_updates cu1
      INNER JOIN (
        SELECT user_id, MAX(schedule_date) AS max_scheduled
        FROM call_updates
        WHERE schedule_date IS NOT NULL
        GROUP BY user_id
      ) cu2 ON cu1.user_id = cu2.user_id AND cu1.schedule_date = cu2.max_scheduled
    )
  `);

      selectFields.push(
        "cu.call_id",
        `CASE cu.call_type
      WHEN '0' THEN 'Welcome Call'
    WHEN '1' THEN 'Progress Call'
    WHEN '2' THEN 'Feedback Call'
    WHEN '3' THEN 'Induction Call'
    WHEN '66' THEN 'App Introduction Call'
    WHEN '4' THEN 'Service Call'
    WHEN '6' THEN 'Book by Mentor Call'
    WHEN '10' THEN 'Change of Mentor Call'
    WHEN '11' THEN 'Extra (Engagement) Call'
    WHEN '12' THEN 'Pitching Call'
    WHEN '13' THEN 'Bad Feedback Call'
    WHEN '14' THEN 'Follow up Call'
    WHEN '15' THEN 'Overdue (Weight / any other) Call'
    WHEN '16' THEN 'Dormant Call'
    WHEN '17' THEN 'On hold OD Call'
    WHEN '18' THEN 'Follow up for Renewal Call'
    WHEN '19' THEN 'Any other Call'
    WHEN '20' THEN 'Concern Call'
    WHEN '21' THEN 'Head Nutritionist Concern Call'
    WHEN '23' THEN 'Poor Rating Call'
    WHEN '24' THEN 'Poor Weight Loss Call'
    WHEN '25' THEN 'Nutrition Manager Less Loss Call'
    WHEN '26' THEN 'Nutrition Manager Poor Rating Call'
    WHEN '30' THEN 'Consultation Call'
    WHEN '31' THEN 'Less Loss Call'
    WHEN '45' THEN 'Extra Call' 
      
      ELSE 'Unknown'
     END AS call_type_label`,
        "cu.call_status",
        `CASE cu.call_status
      WHEN 0 THEN 'Pending'
      WHEN 1 THEN 'Done'
      WHEN 2 THEN 'Cancelled'
      WHEN 3 THEN 'Rescheduled'
      WHEN 4 THEN 'Unanswered'
      ELSE 'Unknown'
     END AS call_status_label`,
        "cu.schedule_date",
        "cu.call_insights",
        "caller.crm_user AS mentor_name",
      );

      joins.push(
        `LEFT JOIN latest_call_update cu ON cu.user_id = cd.user_id`,
        `LEFT JOIN admin_users caller ON cu.added_by = caller.admin_user_id`,
      );
    }

    if (selectData.health_score) {
      withQuery.push(
        `hs_data AS (
    SELECT
        sub_order_id,
        overall_health_score,
        created,
        ideal_weight,
        body_mass_index,
        health_category,
        weight_difference,
        type,
        ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created DESC) AS rn_latest,
        ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created ASC) AS rn_earliest
    FROM bn_client_hs
)`,
        `latest_health AS (
          SELECT
              sub_order_id,
              overall_health_score AS client_latest_health_score,
              created AS client_latest_health_score_date,
              ideal_weight AS client_latest_ibw,
              body_mass_index AS client_latest_bmi,
              health_category AS client_latest_health_category,
              weight_difference as client_latest_weight_difference,
              type AS client_latest_health_score_type
          FROM hs_data
          WHERE rn_latest = 1
      )`,
        `earliest_health AS (
          SELECT
              sub_order_id,
              overall_health_score AS client_starting_health_score,
              created AS client_starting_health_score_date
          FROM hs_data
          WHERE rn_earliest = 1
      )`,
      );
      selectFields.push(
        "latest_health.client_latest_health_score",
        "latest_health.client_latest_health_score_date",
        "earliest_health.client_starting_health_score",
        "earliest_health.client_starting_health_score_date",
        "latest_health.client_latest_ibw",
        "latest_health.client_latest_bmi",
        "latest_health.client_latest_health_category",
        "latest_health.client_latest_weight_difference",
        "latest_health.client_latest_health_score_type",
      );
      joins.push(
        `LEFT JOIN latest_health ON sop.sub_order_id = latest_health.sub_order_id`,
        `LEFT JOIN earliest_health ON sop.sub_order_id = earliest_health.sub_order_id`,
      );
    }

    if (selectData.halftime_feedback) {
      selectFields.push(
        "hf1.mentor_star_rating AS client_halftime_mentor_rating",
        "hf1.added_date AS client_halftime_feedback_date",
        "hf1.improvement_needed AS client_halftime_improvement",
      );
      if (selectData.is_active) {
        joins.push(
          `LEFT JOIN bn_halftime_feedback hf1 ON cd.active_order_id = hf1.sub_order_id and cd.user_id = hf1.user_id`,
        );
      } else {
        joins.push(
          `INNER JOIN bn_halftime_feedback hf1 ON cd.user_id = hf1.user_id`,
          `LEFT JOIN bn_halftime_feedback hf2 ON hf1.user_id = hf2.user_id AND hf1.id < hf2.id`,
        );
      }
    }
    if (selectData.final_feedback) {
      selectFields.push(
        "ff.mentor_feedback AS client_final_mentor_rating",
        "ff.improvement_needed AS client_final_improvement",
        "ff.added_date AS client_final_feedback_date",
      );
      if (selectData.is_active) {
        joins.push(
          `LEFT JOIN bn_final_feedback ff ON cd.active_order_id = sop.sub_order_id AND cd.user_id = ff.user_id`,
        );
      } else {
        joins.push(
          `LEFT JOIN bn_final_feedback ff ON cd.user_id = ff.user_id`,
          `LEFT JOIN bn_final_feedback ff2 ON ff.user_id = ff2.user_id AND ff.id < ff2.id`,
        );
      }
    }
    if (selectData.goal_weight) {
      selectFields.push("aspd.goal_weight");
      joins.push(`
    LEFT JOIN (
      SELECT *
      FROM assessment_personal_details ap1
      WHERE ap1.updated_date = (
        SELECT MAX(ap2.updated_date)
        FROM assessment_personal_details ap2
        WHERE ap2.user_id = ap1.user_id
      )
    ) aspd ON cd.user_id = aspd.user_id
  `);
    }
    if (selectData.goal) {
      selectFields.push("mg.comment");
      joins.push(
        `LEFT JOIN ${tables.bnMyGoalsNew} mg ON cd.active_order_id = mg.sub_order_id and cd.user_id = mg.user_id`,
      );
    }
    if (selectData.diet_start_date) {
      selectFields.push(
        "dsl.diet_start_date AS diet_sent_date",
        "dsl.diet_name AS last_diet_name",
        "dsl.diet_start_date",
        "DATEDIFF(NOW(),dsl.diet_start_date) as dormancy_level",
      );
      joins.push(
        `LEFT JOIN ${tables.dietSessionLog} dsl on dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions = dsl.session AND dsl.diet_status = '4'`,
      );
    }
    if (selectData.inch_details) {
      selectFields.push(
        "ir.inch_id AS inch_id",
        "ir.chest AS chest_inch",
        "ir.waist AS waist_inch",
        "ir.hips AS hips_inch",
      );
      joins.push(
        `LEFT JOIN ${tables.inchRecords} ir ON cd.user_id = ir.user_id AND ir.sub_order_id = sop.sub_order_id AND ir.session = sop.sent_sessions`,
      );
    }
    if (selectData.photo_details) {
      selectFields.push("pr.photo_url AS photo_url, pr.photo_id AS photo_id");
      joins.push(
        `LEFT JOIN ${tables.photoRecords} pr ON cd.user_id = pr.user_id AND pr.sub_order_id = sop.sub_order_id AND pr.session = sop.sent_sessions`,
      );
    }
    // Added: Handle search functionality
    const { searchQuery, searchFields = [] } = search;
    let conditionQueryParts = [
      `cd.user_id IN (${ids.map(() => "?").join(",")})`,
    ];
    values.push(...ids);

    if (searchQuery) {
      const trimmedSearchQuery = searchQuery.trim();
      const fieldsToSearch =
        searchFields.length > 0
          ? searchFields
          : selectFields.map((field) => field.split(/\s+AS\s+|\s+as\s+/i)[0]); // Strip aliases

      const searchConditionParts = fieldsToSearch.map((field) => {
        values.push(`%${trimmedSearchQuery.toLowerCase()}%`);
        return `LOWER(TRIM(${field})) LIKE ?`;
      });

      conditionQueryParts.push(`(${searchConditionParts.join(" OR ")})`);
    }

    // Added: Combine conditions for halftime and final feedback
    if (selectData.halftime_feedback && !selectData.is_active) {
      conditionQueryParts.push("hf2.id IS NULL");
    }
    if (selectData.final_feedback && !selectData.is_active) {
      conditionQueryParts.push("ff2.id IS NULL");
    }

    let query = "";
    if (withQuery.length > 0) {
      query += "WITH " + withQuery.join(",\n") + "\n";
    }
    query += `
      SELECT ${selectFields.join(",\n")}
      FROM users_details cd
      ${joins.join("\n")}
      WHERE ${conditionQueryParts.join(" AND ")}
      GROUP BY cd.user_id
    `;

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    console.log(query, values);
    const [results] = await readPool.query(query, values);
    return results;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to fetch advance purchase data.");
  }
}

async function getPageVisitHistory(user_id) {
  try {
    const table = "in_app_page_visit_log pv";
    const selectFields = [
      "pv.page_type",
      "pm.program_name",
      "MAX(CONCAT(pv.visit_date, ' ', pv.visit_time)) AS latest_visit",
      "COUNT(*) AS visit_count",
    ];

    const joins = [
      {
        type: "LEFT",
        table: "programs_master pm",
        on: "pv.program_id = pm.program_id",
      },
    ];

    const conditions = [
      {
        field: "pv.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "pv.page_type",
        operator: "IN",
        value: [1, 2],
      },
      {
        field: "pv.visit_date",
        operator: ">=",
        value: "CURDATE() - INTERVAL 30 DAY",
        raw: true,
      },
    ];

    const groupBy = ["pv.program_id", "pv.page_type"];
    const orderBy = ["latest_visit DESC"];

    const { results } = await readRecord({
      table,
      selectFields,
      joins,
      conditions,
      groupBy,
      orderBy,
    });

    return results;
  } catch (error) {
    console.error("Error in getPageVisitHistory:", error);
    return [];
  }
}

async function fetchUserDetailsDynamic({
  ids,
  fields,
  extraVariables,
  groupBy = "",
}) {
  console.log(ids, fields, extraVariables, 1073);
  //test deployment again
  // ? ids : ids of the users for which data is to be fetched
  // ? fields : fields to be fetched for the users
  try {
    // ? joinMap : map of joins to be used in the query for fetching the data and avoiding manually writing the joins in each fieldMapping
    const joinsMap = {
      sub_orders_programs:
        "LEFT JOIN sub_orders_programs sop ON cd.active_order_id = sop.sub_order_id",
      countries: "LEFT JOIN countries c ON cd.country_id = c.country_id",
      inch1:
        "LEFT JOIN inch_records ir ON sop.sub_order_id = ir.sub_order_id AND cd.user_id = ir.user_id",
      inch2:
        "LEFT JOIN inch_records irl ON ir.user_id = irl.user_id AND ir.inch_id < irl.inch_id",
      latest_health:
        "LEFT JOIN latest_health ON cd.active_order_id = latest_health.latest_sub_order_id",
      latest_lead_hs:
        "LEFT JOIN latest_lead_hs ON cd.user_id = latest_lead_hs.user_id",
      assement_personal_details:
        "LEFT JOIN assessment_personal_details aspd ON cd.user_id = aspd.user_id",
      assement_nutrition_details:
        "LEFT JOIN assessment_nutrition_and_lifestyle anal ON cd.user_id = anal.user_id",
      assement_medical_history:
        "LEFT JOIN assessment_medical_history amh ON cd.user_id = amh.user_id",
      goal_weight: "LEFT JOIN goals ON sop.sub_order_id = goals.sub_order_id",
      sop_count: "LEFT JOIN sop_count ON sop_count.user_id = cd.user_id",
      active_program:
        "LEFT JOIN programs_master ap ON sop.program_id = ap.program_id",
      suggested_program:
        "LEFT JOIN suggested_program spr ON cd.suggested_program_id = spr.suggested_program_id",
      payment_link:
        "LEFT JOIN payment_links pay_link ON spr.payment_link_id = pay_link.id",
      bank_details:
        "LEFT JOIN payment_mode pay_m ON spr.payment_mode_id = pay_m.payment_mode_id",
      suggested_program_master:
        "LEFT JOIN programs_master sp ON spr.program_id = sp.program_id",
      mentor_admin:
        "LEFT JOIN admin_users ma ON cd.mentor_assigned = ma.admin_user_id",
      old_mentor_admin:
        "LEFT JOIN admin_users oma ON com.old_mentor = oma.admin_user_id",
      counsellor_admin:
        "LEFT JOIN admin_users ca ON cd.counsellor_assigned = ca.admin_user_id",
      old_counsellor_admin:
        "LEFT JOIN admin_users oca ON oca.admin_user_id = (SELECT counsellor_id FROM lead_assigned_log WHERE user_id = cd.user_id ORDER BY assign_date DESC LIMIT 1 OFFSET 1)",
      change_of_mentor:
        "LEFT JOIN change_of_mentor com ON cd.user_id = com.user_id",
      weight1:
        "LEFT JOIN weight_records wr ON sop.sub_order_id = wr.sub_order_id",
      weight2:
        "LEFT JOIN weight_records wr2 ON wr.user_id = wr2.user_id AND wr2.wmr_id < wr.wmr_id AND wr2.session < wr.session",
      diet_session_log:
        "LEFT JOIN diet_session_log dsl ON sop.sub_order_id = dsl.sub_order_id AND dsl.`session` = sop.sent_sessions",
      program_session:
        "LEFT JOIN program_session sps ON spr.program_session_id = sps.program_session_id",
      checkout_visit: `
        LEFT JOIN (
          SELECT *
          FROM (
            SELECT *,
              ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date DESC, visit_time DESC) AS rn
            FROM in_app_page_visit_log
            WHERE page_type = 2
          ) AS ranked
          WHERE rn = 1
        ) AS latest_checkout_visit ON cd.user_id = latest_checkout_visit.user_id
      `,

      checkout_program: `
        LEFT JOIN programs_master checkout_program 
          ON latest_checkout_visit.program_id = checkout_program.program_id
      `,

      checkout_program_session: `
        LEFT JOIN program_session checkout_program_session 
          ON latest_checkout_visit.program_id = checkout_program_session.program_id 
          AND latest_checkout_visit.sessions = checkout_program_session.program_sessions
      `,
      program_page_visit: `LEFT JOIN (
    SELECT *
    FROM (
        SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date DESC, visit_time DESC) AS rn
        FROM in_app_page_visit_log
        WHERE page_type = 1
    ) AS latest_page_visit
    WHERE rn = 1
) AS latest_page_visit ON cd.user_id = latest_page_visit.user_id
`,
      page_visit_program:
        "LEFT JOIN programs_master program_visit ON latest_page_visit.program_id = program_visit.program_id",
      onhold_clients: `
  LEFT JOIN (
    SELECT *
    FROM onhold_clients
    WHERE user_id IN (${ids.join(",")})
    ORDER BY id DESC
    LIMIT 1
  ) AS ohc ON cd.user_id = ohc.user_id`,
    };
    // ? withQueryMap : map of with queries to be used in the query for fetching the data and avoiding manually writing the with queries in each fieldMapping
    const withQueryMap = {
      hs_data: `hs_data AS (
    SELECT
        sub_order_id, 
        overall_health_score,
        created,
        ideal_weight,
        weight,
        body_mass_index,
        health_category,
        ideal_bmi,
        body_shape,
        healthscore_status,
        ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created DESC) AS rn_latest,
        ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created ASC) AS rn_earliest
    FROM bn_client_hs
)`,
      hs_lead_data: `hs_lead_data AS (
  SELECT
      user_id,  
      overall_health_score AS lead_latest_health_score,
      created AS lead_latest_health_score_date,
      ideal_weight AS lead_latest_ibw,
      weight as lead_latest_wt,
      body_mass_index AS lead_latest_bmi,
      health_category AS lead_latest_health_category,
      ideal_bmi AS lead_latest_ideal_bmi,
      body_shape AS lead_latest_body_shape,
      healthscore_status AS lead_latest_health_score_status,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created DESC) AS rn_latest_lead
  FROM bn_client_hs
)`,
 latest_lead_hs: `latest_lead_hs AS (
  SELECT
      user_id,  
      lead_latest_health_score AS lead_latest_health_score,
      lead_latest_health_score_date AS lead_latest_health_score_date,
      lead_latest_ibw AS lead_latest_ibw,
      lead_latest_wt as lead_latest_wt,
      lead_latest_bmi AS lead_latest_bmi,
      lead_latest_health_category AS lead_latest_health_category, 
      lead_latest_ideal_bmi AS lead_latest_ideal_bmi,
      lead_latest_body_shape AS lead_latest_body_shape,
      lead_latest_health_score_status AS lead_latest_health_score_status
  FROM hs_lead_data
  WHERE rn_latest_lead = 1
)`,
      latest_health: `latest_health AS (
    SELECT
        sub_order_id as latest_sub_order_id,
        overall_health_score AS client_latest_health_score,
        created AS client_latest_health_score_date,
        ideal_weight AS client_latest_ibw,
        weight as client_latest_wt,
        created as client_days_ago,
        body_mass_index AS client_latest_bmi,
        health_category AS client_latest_health_category,
        ideal_bmi AS client_latest_ideal_bmi,
        body_shape AS client_latest_body_shape,
        healthscore_status AS client_latest_health_score_status
    FROM hs_data
    WHERE rn_latest = 1
)`,
     
      goal_data: `goals AS (
    SELECT
        sub_order_id,
        MAX(CASE WHEN goal_type = 1 THEN comment END) AS milestone_comment,
        MAX(CASE WHEN goal_type = 1 THEN goal_type END) AS milestone,
        MAX(CASE WHEN goal_type = 1 THEN is_achieved END) AS milestone_achieved,
        MAX(CASE WHEN goal_type = 2 THEN comment END) AS new_goal_comment,
        MAX(CASE WHEN goal_type = 2 THEN goal_type END) AS new_goal,
        MAX(CASE WHEN goal_type = 2 THEN is_achieved END) AS new_goal_achieved,
        MAX(CASE WHEN goal_type = 3 THEN comment END) AS goal_comment,
        MAX(CASE WHEN goal_type = 3 THEN goal_type END) AS goal,
        MAX(CASE WHEN goal_type = 3 THEN is_achieved END) AS goal_achieved
    FROM bn_my_goals
    GROUP BY sub_order_id
)`,
      sop_count: `sop_count AS (
    SELECT
        od2.user_id,
        SUM(CASE WHEN sop2.program_type = 0 AND sop2.program_status IN ('1', '3') THEN 1 ELSE 0 END) AS client_program_count,
        SUM(CASE WHEN sop2.program_status = '4' THEN 1 ELSE 0 END) AS client_advance_program_count
    FROM order_details od2
    LEFT JOIN sub_orders_programs sop2 ON sop2.order_id = od2.order_id
    WHERE sop2.program_type = 0
    GROUP BY od2.user_id
)`,
    };

    // ? fieldMappings : map of fields to be fetched and their corresponding select and join queries
    // ? first level key is the field to be fetched and the value is an object with select and join keys
    const fieldMappings = {
      "{{name}}": {
        select: "IFNULL(cd.first_name, 'User') AS name",
        join: [],
      },
      "{{phone}}": {
        select: `
     CASE 
  WHEN cd.phone_code NOT IN ('0', '', 'NULL') AND cd.phone_code IS NOT NULL THEN 
    CONCAT(
      REPLACE(REPLACE(cd.phone_code, '+', ''), ' ', ''), 
      REPLACE(cd.phone_number, ' ', '')
    )
  ELSE 
    REPLACE(REPLACE(cd.phone, '+', ''), ' ', '')
END AS phone

    `,
        join: [],
      },
      "{{birth_date}}": {
        select: "cd.birth_date",
        join: [],
      },
      "{{email_id}}": {
        select: "cd.email_id AS email",
        join: [],
      },
      "{{country_of_origin}}": {
        select: "c.country_name AS country_of_origin",
        join: [joinsMap.countries],
      },
      "{{height}}": {
        select: "cd.height AS client_height",
        join: "",
      },
      "{{inch}}": {
        select: "ir.waist AS inch",
        join: [joinsMap.sub_orders_programs, joinsMap.inch1, joinsMap.inch2],
      },
      "{{latest_weight}}": {
        select: "cd.latest_weight",
        join: [],
      },
      "{{start_weight}}": {
        select: "sop.start_program_weight AS start_weight",
        join: [joinsMap.sub_orders_programs],
      },
      "{{expiry_date}}": {
        select: "YEAR(sop.expiry_date) AS expiry_date",
        join: [joinsMap.sub_orders_programs],
      },
      "{{client_days_ago}}": {
        select:
          "DATEDIFF(CURRENT_DATE, latest_health.client_days_ago) AS client_days_ago",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{last_hs_weight}}": {
        select: "latest_health.client_latest_wt AS last_hs_weight",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{ideal_weight}}": {
        select: "latest_health.client_latest_ibw AS ideal_weight",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{goal_weight}}": {
        select: "aspd.goal_weight",
        join: [joinsMap.assement_personal_details],
      },
      "{{bmi}}": {
        select: "latest_health.client_latest_bmi AS bmi",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{lead_bmi}}": {
        select: "latest_lead_hs.lead_latest_bmi AS lead_bmi",
        join: [joinsMap.latest_lead_hs],
        withQuery: [withQueryMap.hs_lead_data, withQueryMap.latest_lead_hs],
      },
      "{{ideal_bmi}}": {
        select: "latest_health.client_latest_ideal_bmi AS ideal_bmi",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{lead_ideal_bmi}}": {
        select: "latest_lead_hs.lead_latest_ideal_bmi AS lead_ideal_bmi",
        join: [joinsMap.latest_lead_hs],
        withQuery: [withQueryMap.hs_lead_data, withQueryMap.latest_lead_hs],
      },      
      "{{body_shape}}": {
        select: "latest_health.client_latest_body_shape AS body_shape",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{lead_body_shape}}": {
        select: "latest_lead_hs.lead_latest_body_shape AS lead_body_shape",
        join: [joinsMap.latest_lead_hs],
        withQuery: [withQueryMap.hs_lead_data, withQueryMap.latest_lead_hs],
      },
      
      "{{health_category}}": {
        select:
          "latest_health.client_latest_health_category AS health_category",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      
      "{{lead_health_category}}": {
        select: "latest_lead_hs.lead_latest_health_category AS lead_health_category",
        join: [joinsMap.latest_lead_hs],
        withQuery: [withQueryMap.hs_lead_data, withQueryMap.latest_lead_hs],
      },
      
      "{{overall_health_score}}": {
        select:
          "latest_health.client_latest_health_score AS overall_health_score",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{lead_overall_health_score}}": {
        select: "latest_lead_hs.lead_latest_health_score AS lead_overall_health_score",
        join: [joinsMap.latest_lead_hs],
        withQuery: [withQueryMap.hs_lead_data, withQueryMap.latest_lead_hs],
      },
      "{{health_score_status}}": {
        select:
          "latest_health.client_latest_health_score_status AS health_score_status",
        join: [joinsMap.latest_health],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },      
      "{{lead_health_score_status}}": {
        select: "latest_lead_hs.lead_latest_health_score_status AS lead_health_score_status",
        join: [joinsMap.latest_lead_hs],
        withQuery: [withQueryMap.hs_lead_data, withQueryMap.latest_lead_hs],
      },
      
      "{{stress_feel}}": {
        select: "aspd.stress_feel",
        join: [joinsMap.assement_personal_details],
      },
      "{{sleep_time}}": {
        select: "anal.sleep_time",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{sleep_duration}}": {
        select: "anal.sleep_duration",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{wakeup_time}}": {
        select: "anal.wakeup_time",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{work_status}}": {
        select: "anal.work_status",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{designation}}": {
        select: "anal.designation",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{eating_habit}}": {
        select: "anal.eating_habit",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{food_allergies}}": {
        select: "anal.food_allergies",
        join: [joinsMap.assement_nutrition_details],
      },
      "{{is_fasting}}": {
        select: "anal.is_fasting",
        join: [joinsMap.assement_medical_history],
      },
      "{{blood_pressure}}": {
        select: "amh.blood_pressure",
        join: [joinsMap.assement_medical_history],
      },
      "{{blood_pressure_readings}}": {
        select: "amh.blood_pressure_readings",
        join: [joinsMap.assement_medical_history],
      },
      "{{acidity}}": {
        select: "amh.acidity",
        join: [joinsMap.assement_medical_history],
      },
      "{{diabetes}}": {
        select: "amh.diabetes",
        join: [joinsMap.assement_medical_history],
      },
      "{{diabetes_readings}}": {
        select: "amh.diabetes_readings",
        join: [joinsMap.assement_medical_history],
      },
      "{{cholesterol}}": {
        select: "amh.cholesterol",
        join: [joinsMap.assement_medical_history],
      },
      "{{cholesterol_readings}}": {
        select: "amh.cholesterol_readings",
        join: [joinsMap.assement_medical_history],
      },
      "{{thyroid}}": {
        select: "amh.thyroid",
        join: [joinsMap.assement_medical_history],
      },
      "{{thyroid_readings}}": {
        select: "amh.thyroid_readings",
        join: [joinsMap.assement_medical_history],
      },
      "{{milestone}}": {
        select: "goals.milestone",
        join: [joinsMap.goal_weight, joinsMap.sub_orders_programs],
        withQuery: [withQueryMap.goal_data],
      },
      "{{milestone_record}}": {
        select: "goals.milestone_comment",
        join: [joinsMap.goal_weight, joinsMap.sub_orders_programs],
        withQuery: [withQueryMap.goal_data],
      },
      "{{start_date}}": {
        select: "sop.start_date",
        join: [joinsMap.sub_orders_programs],
      },
      "{{program_weight_loss}}": {
        select:
          "cd.latest_weight - sop.start_program_weight AS program_weight_loss",
        join: [joinsMap.sub_orders_programs],
      },
      "{{away_from_goal_weight}}": {
        select: "cd.latest_weight - aspd.goal_weight AS away_from_goal_weight",
        join: [joinsMap.assement_personal_details],
      },
      "{{total_programs}}": {
        select: "sop_count.client_program_count AS total_programs",
        join: [joinsMap.sop_count],
        withQuery: [withQueryMap.sop_count],
      },
      "{{overall_weight_loss}}": {
        select: "cd.latest_weight - cd.start_weight AS overall_weight_loss",
        join: [],
      },
      "{{set_goal}}": {
        select: "goals.goal_comment",
        join: [joinsMap.goal_weight, joinsMap.sub_orders_programs],
        withQuery: [withQueryMap.hs_data, withQueryMap.latest_health],
      },
      "{{my_wallet}}": {
        select: "COALESCE(cd.my_wallet, 0) AS my_wallet",
        join: [],
      },
      "{{current_program}}": {
        select: "ap.program_name AS current_program",
        join: [joinsMap.sub_orders_programs, joinsMap.active_program],
      },
      "{{suggested_program}}": {
        select: "sp.program_name AS suggested_program",
        join: [joinsMap.suggested_program, joinsMap.suggested_program_master],
      },
      "{{payment_link}}": {
        select: "pay_link.payment_link AS payment_link",
        join: [joinsMap.suggested_program, joinsMap.payment_link],
      },
      "{{bank_details}}": {
        select: "pay_m.payment_mode_details AS bank_details",
        join: [joinsMap.suggested_program, joinsMap.bank_details],
      },
      "{{upi_details}}": {
        select: "pay_m.payment_mode_details AS upi_details",
        join: [joinsMap.suggested_program, joinsMap.bank_details],
      },
      "{{current_program_id}}": {
        select: "ap.program_id AS current_program_id",
        join: [joinsMap.sub_orders_programs, joinsMap.active_program],
      },
      "{{suggested_program_id}}": {
        select: "sp.program_id AS suggested_program_id",
        join: [joinsMap.suggested_program, joinsMap.suggested_program_master],
      },
      "{{suggested_program_amount}}": {
        select: "spr.suggested_amount AS suggested_program_amount",
        join: [joinsMap.suggested_program],
      },
      "{{suggested_program_mrp}}": {
        select: "sps.mrp AS suggested_program_mrp",
        join: [joinsMap.suggested_program, joinsMap.program_session],
      },
      "{{program_validity}}": {
        select:
          "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS program_validity",
        join: [joinsMap.sub_orders_programs],
      },
      "{{program_pending_validity}}": {
        select:
          "TIMESTAMPDIFF(DAY, CURDATE(), sop.expiry_date) AS program_pending_validity",
        join: [joinsMap.sub_orders_programs],
      },
      "{{pending_session}}": {
        select: "sop.pending_session",
        join: [joinsMap.sub_orders_programs],
      },
      "{{sent_session}}": {
        select: "sop.sent_sessions AS sent_session",
        join: [joinsMap.sub_orders_programs],
      },
      "{{total_session}}": {
        select: "sop.total_sessions",
        join: [joinsMap.sub_orders_programs],
      },
      "{{order_id}}": {
        select: "sop.order_id",
        join: [joinsMap.sub_orders_programs],
      },
      "{{mentor_assigned}}": {
        select: "CONCAT(ma.first_name, ' ', ma.last_name) AS mentor_assigned",
        join: [joinsMap.mentor_admin],
      },
      "{{client_id}}": {
        select: "cd.user_id as  client_id",
        join: [],
      },
      "{{mentor_name}}": {
        select: "ma.crm_user AS mentor_name",
        join: [joinsMap.mentor_admin],
      },
      "{{old_mentor_assigned}}": {
        select:
          "CONCAT(oma.first_name, ' ', oma.last_name) AS old_mentor_assigned",
        join: [joinsMap.change_of_mentor, joinsMap.old_mentor_admin],
      },
      "{{mentor_designation}}": {
        select: `TRIM(SUBSTRING_INDEX(ma.designation, '(', 1))  AS mentor_designation`,
        join: [joinsMap.mentor_admin],
      },
      "{{mentor_phone}}": {
        select: "ma.official_phone AS mentor_phone",
        join: [joinsMap.mentor_admin],
      },
      "{{mentor_wa}}": {
        select: "ma.official_phone AS mentor_wa",
        join: [joinsMap.mentor_admin],
      },
      // "{{mentor_id}}": {
      //   select: "ma.admin_user_id AS mentor_id",
      //   join: [joinsMap.mentor_admin],
      // },
      "{{counsellor_assigned}}": {
        select:
          "CONCAT(ca.first_name, ' ', ca.last_name) AS counsellor_assigned",
        join: [joinsMap.counsellor_admin],
      },
      "{{old_counsellor_assigned}}": {
        select:
          "CONCAT(oca.first_name, ' ', oca.last_name) AS old_counsellor_assigned",
        join: [joinsMap.old_counsellor_admin],
      },
      "{{counsellor_designation}}": {
        select: "ca.designation AS counsellor_designation",
        join: [joinsMap.counsellor_admin],
      },
      "{{counsellor_phone}}": {
        select: "ca.official_phone AS counsellor_phone",
        join: [joinsMap.counsellor_admin],
      },
      "{{counsellor_wa}}": {
        select: "ca.official_phone AS counsellor_wa",
        join: [joinsMap.counsellor_admin],
      },
      "{{gender}}": {
        select: `
      CASE 
        WHEN cd.gender = '0' THEN 'Others' 
        WHEN cd.gender = '1' THEN 'Male' 
        WHEN cd.gender = '2' THEN 'Female' 
      END AS gender
    `,
        join: [],
      },
      "{{marital_status}}": {
        select: "aspd.marital_status",
        join: [joinsMap.assement_personal_details],
      },
      "{{anniversary_date}}": {
        select: "aspd.anniversary_date",
        join: [joinsMap.assement_personal_details],
      },
      "{{family_type}}": {
        select: "aspd.family_type",
        join: [joinsMap.assement_personal_details],
      },
      "{{number_of_children}}": {
        select: "aspd.number_of_children",
        join: [joinsMap.assement_personal_details],
      },
      "{{current_session_weight_loss}}": {
        select: "cd.latest_weight - wr2.weight AS current_session_weight_loss",
        join: [joinsMap.suggested_program, joinsMap.weight1, joinsMap.weight2],
      },
      "{{current_diet_id}}": {
        select: "dsl.diet_id AS current_diet_id",
        join: [joinsMap.sub_orders_programs, joinsMap.diet_session_log],
      },
      "{{weight_days_ago}}": {
        select:
          "DATEDIFF(CURDATE(),DATE_ADD(dsl.diet_start_date,INTERVAL 10 DAY)) as weight_days_ago",
        join: [joinsMap.sub_orders_programs, joinsMap.diet_session_log],
      },
      "{{ten_day_weight_update_date}}": {
        select:
          "DATE_ADD(dsl.diet_start_date,INTERVAL 10 DAY) as ten_day_weight_update_date",
        join: [joinsMap.sub_orders_programs, joinsMap.diet_session_log],
      },
      "{{balance_amount}}": {
        select: "sop.balance_amount",
        join: [joinsMap.sub_orders_programs],
      },
      "{{due_date}}": {
        select: "DATE_FORMAT(sop.due_date,'%D %b %Y') as due_date",
        join: [joinsMap.sub_orders_programs],
      },
      "{{balance_due_remaining_days}}": {
        select:
          "DATEDIFF(CURDATE(),sop.due_date) AS balance_due_remaining_days",
        join: [joinsMap.sub_orders_programs],
      },
      "{{current_program_paid_amount}}": {
        select: "sop.paid_amount AS current_program_paid_amount",
        join: [joinsMap.sub_orders_programs],
      },
      "{{old_wallet}}": {
        select: "(cd.old_wallet - 1000) as old_wallet",
        join: [],
      },
      "{{recredit_wallet}}": {
        select: "(cd.my_wallet-1000) as recredit_wallet",
        join: [],
      },
      "{{call_scheduled_date_latest}}": {
        select: `(
    SELECT 
      DATE_FORMAT(cu.schedule_date, '%d-%m-%Y')
    FROM 
      call_updates cu
    LEFT JOIN 
      bn_book_appointment_slots_mentor slot 
      ON cu.slot_id = slot.id
    WHERE 
      cu.user_id = cd.user_id
    ORDER BY 
      cu.added_date DESC
    LIMIT 1
  ) as call_scheduled_date_latest`,
        join: [],
      },
      "{{call_scheduled_time_latest}}": {
        select: `(
    SELECT 
     TRIM(SUBSTRING_INDEX(slot.appointment_slots, '-', 1)) 
    FROM 
      call_updates cu
    LEFT JOIN 
      bn_book_appointment_slots_mentor slot 
      ON cu.slot_id = slot.id
    WHERE 
      cu.user_id = cd.user_id
    ORDER BY 
      cu.added_date DESC
    LIMIT 1
  ) AS call_scheduled_time_latest`,
        join: [],
      },
      "{{user_assigned_to}}": {
        select: `(CASE WHEN cd.user_type = '1' THEN ma.crm_user ELSE ca.crm_user END) AS user_assigned_to`,
        join: [joinsMap.mentor_admin, joinsMap.counsellor_admin],
      },
      "{{user_assigned_to_wa}}": {
        select: `(CASE WHEN cd.user_type = '1' THEN ma.official_phone ELSE ca.official_phone END) AS user_assigned_to_wa`,
        join: [joinsMap.mentor_admin, joinsMap.counsellor_admin],
      },
      "{{user_assigned_to_designation}}": {
        select: `(CASE WHEN cd.user_type = '1' THEN ma.designation ELSE ca.designation END) AS user_assigned_to_designation`,
        join: [joinsMap.mentor_admin, joinsMap.counsellor_admin],
      },
      "{{user_handled_by}}": {
        select: `(CASE WHEN cd.user_type = '1' THEN 'Mentor' ELSE 'Counsellor' END) AS user_handled_by`,
      },
      "{{call_link}}": {
        select: `ma.call_link AS call_link`,
        join: [joinsMap.mentor_admin],
      },
      "{{last_wmr}}": {
        select: `(select weight from weight_records where user_id = cd.user_id order by wmr_id desc limit 1) AS last_wmr`,
      },
      "{{checkout_program_name}}": {
        select: `checkout_program.program_name as checkout_program_name`,
        join: [joinsMap.checkout_visit, joinsMap.checkout_program],
      },
      "{{checkout_program_duration}}": {
        select: `checkout_program_session.program_duration as checkout_program_duration`,
        join: [
          joinsMap.checkout_visit,
          joinsMap.checkout_program,
          joinsMap.checkout_program_session,
        ],
      },
      "{{page_visit_program_name}}": {
        select: `program_visit.program_name as page_visit_program_name`,
        join: [joinsMap.program_page_visit, joinsMap.page_visit_program],
      },
      "{{current_program_weight_loss}}": {
        select: `ROUND(sop.start_program_weight - cd.latest_weight, 2) AS current_program_weight_loss`,
        join: [joinsMap.sub_orders_programs],
      },
      "{{old_wallet}}": {
        select: `(cd.old_wallet) as old_wallet`,
        join: [],
      },
      "{{recredit_wallet}}": {
        select: "(cd.my_wallet-1000) as recredit_wallet",
        join: [],
      },
      "{{onhold_remaining_days}}": {
        select: `CASE
    WHEN ohc.end_date IS NULL THEN 0
    WHEN CURDATE() <= ohc.end_date THEN DATEDIFF(ohc.end_date, CURDATE())
    ELSE 0
  END AS onhold_remaining_days`,
        join: [joinsMap.onhold_clients],
      },
      "{{onhold_start_date}}": {
        select: "DATE_FORMAT(ohc.start_date,'%d-%m-%Y') AS onhold_start_date",
        join: [joinsMap.onhold_clients],
      },
      "{{onhold_end_date}}": {
        select: "DATE_FORMAT(ohc.end_date,'%d-%m-%Y') AS onhold_end_date",
        join: [joinsMap.onhold_clients],
      },
      "{{onhold_note}}": {
        select: "ohc.onhold_note AS onhold_note",
        join: [joinsMap.onhold_clients],
      },
      "{{start_date_after_onhold}}": {
        select:
          "DATE_FORMAT(ohc.end_date + INTERVAL 1 DAY, '%d-%m-%Y') AS start_date_after_onhold",
        join: [joinsMap.onhold_clients],
      },
    };
    if (extraVariables?.call_type) {
      fieldMappings["{{call_type}}"] = {
        select: `CASE 
    WHEN ct.call_type = '0' THEN 'Welcome Call'
    WHEN ct.call_type = '1' THEN 'Progress Call'
    WHEN ct.call_type = '2' THEN 'Feedback Call'
    WHEN ct.call_type = '3' THEN 'Induction Call'
    WHEN ct.call_type = '4' THEN 'Service Call'
    WHEN ct.call_type = '6' THEN 'Book by Mentor Call'
    WHEN ct.call_type = '66' THEN 'App Introduction Call'
    WHEN ct.call_type = '10' THEN 'Change of Mentor Call'
    WHEN ct.call_type = '11' THEN 'Extra (Engagement) Call'
    WHEN ct.call_type = '12' THEN 'Pitching Call'
    WHEN ct.call_type = '13' THEN 'Bad Feedback Call'
    WHEN ct.call_type = '14' THEN 'Follow up Call'
    WHEN ct.call_type = '15' THEN 'Overdue (Weight / any other) Call'
    WHEN ct.call_type = '16' THEN 'Dormant Call'
    WHEN ct.call_type = '17' THEN 'On hold OD Call'
    WHEN ct.call_type = '18' THEN 'Follow up for Renewal Call'
    WHEN ct.call_type = '19' THEN 'Any other Call'
    WHEN ct.call_type = '20' THEN 'Concern'
    WHEN ct.call_type = '21' THEN 'Head Nutritionist Concern'
    WHEN ct.call_type = '23' THEN 'Poor Rating'
    WHEN ct.call_type = '24' THEN 'Poor Weight Loss'
    WHEN ct.call_type = '25' THEN 'Nutrition Manager Less Loss'
    WHEN ct.call_type = '26' THEN 'Nutrition Manager Poor Rating'
    WHEN ct.call_type = '30' THEN 'Consultation'
    WHEN ct.call_type = '31' THEN 'Less Loss Call'
    WHEN ct.call_type = '45' THEN 'Extra Call'
    ELSE 'Default'
  END AS call_type`,
        join: [
          `LEFT JOIN call_updates ct ON ct.call_id = ${extraVariables?.call_type?.call_id}`,
        ],
      };
      fieldMappings["{{call_date_by_id}}"] = {
        select: `DATE_FORMAT(ct.schedule_date, '%d-%m-%Y') AS call_date_by_id`,
        join: [
          `LEFT JOIN call_updates ct ON ct.call_id = ${extraVariables?.call_type?.call_id}`,
        ],
      };
      fieldMappings["{{call_time_by_id}}"] = {
        select: `slot_1.appointment_slots AS call_time_by_id`,
        join: [
          `LEFT JOIN call_updates ct ON ct.call_id = ${extraVariables?.call_type?.call_id}`,
          `LEFT JOIN bn_book_appointment_slots_mentor slot_1 ON ct.slot_id = slot_1.id`,
        ],
      };
    }
    if (extraVariables?.guide) {
      fieldMappings["{{guide_name}}"] = {
        select: "g.guide AS guide_name",
        join: [
          `LEFT JOIN ${tables.guides} g ON g.guide_id = ${extraVariables.guide.guide_id}`,
        ],
      };
      fieldMappings["{{guide_file_path}}"] = {
        select: "g.file_path AS guide_file_path",
        join: [
          `LEFT JOIN ${tables.guides} g ON g.guide_id = ${extraVariables.guide.guide_id}`,
        ],
      };
    }
    // ? joins : Set of joins to be used in the query to avoid duplicate joins
    const joins = new Set();
    // ? withQuery : Set of with queries to be used in the query to avoid duplicate with queries
    const withQuery = new Set();
    const selectFields = [
      "fcm.fcm_token",
      "cd.user_id",
      "fcm.id as fcm_id",
      "COALESCE(NULLIF(cd.first_name, ''), cd.last_name, 'User') AS name",
      // "cd.mentor_assigned as mentor_id",
      "(CASE WHEN cd.user_type = '1' THEN cd.mentor_assigned ELSE cd.counsellor_assigned END) as mentor_id",
    ];

    // ? Process fields to be fetched for each fields received
    fields.forEach((field) => {
      if (fieldMappings[field]) {
        selectFields.push(fieldMappings[field].select); // ? pushing the select query for the field
        if (fieldMappings[field].join) {
          for (const join of fieldMappings[field].join) {
            // ? mapping over the joins for the field because there can be multiple joins for a field
            joins.add(join);
          }
        }
        if (fieldMappings[field].withQuery) {
          for (const wq of fieldMappings[field].withQuery) {
            // ? mapping over the with queries for the field because there can be multiple with queries for a field
            withQuery.add(wq);
          }
        }
      }
    });
    console.log(joins);
    // Base query construction
    // ? building the query with the joins and select fields
    let query = `${
      withQuery.size > 0 ? `WITH ${Array.from(withQuery).join(",\n")}` : ""
    }
    SELECT
      ${selectFields.join(",\n")}
    FROM users_details cd
    ${Array.from(joins).join("\n")}
    LEFT JOIN ${tables.fcm_registry} fcm ON cd.user_id = fcm.user_id
    WHERE cd.user_id IN (${ids.join(",")})
    ${groupBy.length !== "" ? groupBy : ""}
  `;
    console.log(query);

    // Execute query
    const [results] = await readPool.query(query);
    // console.log(results, 1267);
    return results;
  } catch (error) {
    console.error("Error fetching user details:", error);
    throw new Error("Failed to fetch user details.");
  }
}

const advancePurchaseUtils = async (userId) => {
  const { results: advancePurchases } = await readRecord({
    table: `${tables.subOrderPrograms} sop`,
    selectFields: [
      "sop.paid_amount as amount_paid",
      "pm.program_name",
      "sop.total_sessions",
      "ps.program_duration",
    ],
    joins: [
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
    ],
    conditions: [
      { field: "sop.user_id", operator: "=", value: userId },
      { field: "sop.program_status", operator: "=", value: 4 },
    ],
  });
  return advancePurchases;
};
const PrevPurchaseUtils = async (userId) => {
  const { results: advancePurchases } = await readRecord({
    table: `${tables.subOrderPrograms} sop`,
    selectFields: [
      "sop.paid_amount as amount_paid",
      "pm.program_name",
      "sop.total_sessions",
      "ps.program_duration",
    ],
    joins: [
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
    ],
    conditions: [
      { field: "sop.user_id", operator: "=", value: userId },
      { field: "sop.program_status", operator: "=", value: 3 },
    ],
  });
  return advancePurchases;
};

const getClientData = async (req, res, next) => {
  try {
    const { user_ids, search, page = 1, limit = 10 } = req.body;
    if (!user_ids || user_ids.length === 0) {
      return next(new ErrorHandler("UserIds Not Provided"));
    }
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "CONCAT(ud.phone_code,'-',ud.phone_number) as phone_number",
      "ud.sub_user_status",
      "ud.device",
      "ud.app_version",
      "pm.program_name",
      "sop.paid_amount",
      "sop.mrp",
      "sop.start_date as program_start_date",
      "CONCAT(ad.first_name,' ',ad.last_name) as mentor_assigned",
      "ad.official_phone as mentor_phone",
      "paym.payment_mode_name",
      "spm.program_name as suggested_program_name",
      "sp.program_days as suggested_program_days",
      "sp.suggested_amount",
      "sp.added_date as suggested_at",
      "CONCAT(sba.first_name,' ',sba.last_name) as suggested_by",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id =pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: "sop.order_id = od.order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = ud.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "ud.suggested_program_id = sp.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} spm`,
        on: "sp.program_id = spm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} sba`,
        on: "sp.suggested_by  = sba.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode = paym.payment_mode_id",
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [
        {
          field: "ud.user_id",
          operator: "IN",
          value: user_ids,
        },
      ],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "ud.user_id",
            "ud.first_name",
            "ud.last_name",
            "ud.email_id",
            "ud.phone_number",
            "pm.program_name",
            "ad.first_name",
            "ad.last_name",
          ],
        },
      }),
      pagination: { limit, page },
      countTotal: true,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Clients For CS DB Fetched Successfully`,
      data: results,
      meta_data: {
        page,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllClients = async (req, res, next) => {
  try {
    const { user_id, search, page = 1, limit = 10 } = req.query;
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "CONCAT(ud.phone_code,'-',ud.phone_number) as client_phone",
      "ud.sub_user_status",
      "pm.program_name",
      "sop.mrp",
      "sop.paid_amount",
      "sop.balance_amount",
      "CONCAT(ad.first_name,' ',ad.last_name) as mentor_assigned",
      "sop.start_date",
      "ud.mentor_assigned as mentor_assigned_id",
    ];
    const conditions = [
      {
        field: "ud.user_status",
        operator: "IN",
        value: ["Active", "Completed"],
      },
    ];
    if (user_id) {
      conditions.push({
        field: "ud.user_id",
        operator: "=",
        value: user_id,
      });
    }
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "ud.user_id",
            "ud.first_name",
            "ud.last_name",
            "ud.email_id",
            "ud.phone_number",
          ],
        },
      }),
      pagination: { limit, page },
      countTotal: true,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Clients For Accounts DB Fetched Successfully`,
      data: results,
      meta_data: {
        page,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function compareVersions(currentVersion, newVersion) {
  // console.log(currentVersion, newVersion, 1976);
  if (newVersion === null) {
    return false;
  }
  // Split the version strings into arrays of integers
  const currentParts = currentVersion
    .split(".")
    .map((num) => parseInt(num, 10));
  const newParts = newVersion.split(".").map((num) => parseInt(num, 10));

  // Compare each part of the version (major, minor, patch)
  for (let i = 0; i < 3; i++) {
    if (newParts[i] > currentParts[i]) {
      return true; // New version is greater (updated)
    } else if (newParts[i] < currentParts[i]) {
      return false; // New version is lower (not updated)
    }
  }

  return false; // Versions are the same
}

// ? Maps user and program data into a structured format, including optional additional fields and dynamic extra mappings.
const mapUserData = ({
  user,
  details,
  addFields = {},
  extraMappings = {},
  addExtraKeyTo = {},
  removeFields = [],
}) => {
  let message = "";
  const daysLeft = moment(details?.suggested_payment_expiry).diff(
    moment(),
    "days",
  );

  let displayDays;
  if (daysLeft > 0) {
    displayDays = `in the next ${daysLeft} Days`;
  } else if (daysLeft === 0) {
    displayDays = "Today";
  } else {
    displayDays = ""; // or "Expired" if you want to show past due
  }
  if (details?.suggested_payment_mode_id == 1) {
    message = `<span>Hi ${
      details?.client_name
    },<br> PFA your payment link for <b>${
      details.suggested_program_name
    } program</b> for Amount <b>Rs.${
      details.suggested_amount
    }</b> <br> Click here: <a href="${details.suggested_payment_link}">${
      details.suggested_payment_link
    }</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
      details?.suggested_payment_expiry,
    ).format(
      "Do MMMM YYYY",
    )} which is ${displayDays}. Please ensure you use it before that. ${
      details?.free_hamper && details?.free_hamper !== "No"
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } </span>`;
  } else if (details?.suggested_payment_mode_id == 3) {
    message = `<span>PFA the Bank Account Details for the payment of ${
      details.suggested_amount
    } for ${details.suggested_program_name} program.<br> ${
      details.suggested_payment_mode_details
    } ${
      details?.free_hamper && details?.free_hamper !== "No"
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
  } else if (details?.suggested_payment_mode_id == 2) {
    message = `<span>Hi ${
      details.client_name
    }, <br> PFA the UPI details for the Amount of ${
      details.suggested_amount
    } for ${details.suggested_program_name} program. <br> ${
      details.suggested_payment_mode_details
    } ${
      details?.free_hamper && details?.free_hamper !== "No"
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
  } else if (details?.suggested_payment_mode_id == 4) {
    message = `<span>Hi ${
      details.client_name
    },<br> Cash Collection for the amount of Rs. ${
      details.suggested_amount
    } for ${details.suggested_program_name}. <br> Date: ${moment(
      details.suggested_payment_expiry,
    ).format(
      "Do MMMM YYYY",
    )} <br> Contact Person: Abdul Shaikh (919158267868) ${
      details?.free_hamper && details?.free_hamper !== "No"
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
  }

  const mappedData = {
    user_details: {
      user_id: details?.client_user_id,
      user_name: details?.client_name || null,
      email_id: details?.client_email || null,
      phone_number: details?.client_phone || null,
      program_number: details.client_program_count,
      wallet: details.client_wallet || null,
      old_wallet: details.old_wallet || null,
      call_link: details.call_link || null,
      status: details.sub_user_status || null,
      active_order_id: details.client_active_order_id || null,
      app_updated: details.app_updated || null,
      mentor_assigned: details.mentor_assigned || null,
      free_hamper: details.free_hamper || null,
      hamper_status: details.hamper_status || null,
      scale_status: details.scale_status || null,
      medical_issue: safeJSONParse(details.medical_issue, []) || null,
      birth_date: details.birth_date || null,
      client_cs_notes: details.cs_notes || null,
    },
    program_details: {
      current_program_name: details.current_program_name || null,
      current_program_combo: details.program_combo || null,
      current_program_duration: `(${details.current_program_duration} Days)`,
      current_program_mrp: details.current_program_mrp || null,
      current_program_amount_paid: details.current_program_amount || null,
      current_program_payment_mode:
        details.current_program_payment_mode || null,
      current_program_session: `(${details.current_program_sent_sessions}/${details.current_program_total_sessions})`,
      current_program_mentor_assigned: details.crm_user,
      current_program_validity: details.current_program_validity,
      current_program_validity_used: Math.abs(
        details.current_program_validity_used,
      ),
      current_program_expiry_date: details.current_program_expiry_date,
      advance_program_count: details.client_advance_program_count,
      current_program_sale_by: details.current_program_sale_by || null,
      dropout_count: details?.dropout_count || 0,
    },
    suggested_program_details: {
      suggested_id: details.suggested_id || null,
      suggested_program_id: details.suggested_program_id || null,
      suggested_program_session_id: details.suggested_program_session_id,
      suggested_program_name: details.suggested_program_name || null,
      suggested_program_duration: `(${details.suggested_program_days})`,
      suggested_program_mrp: details.suggested_program_mrp || null,
      suggested_program_qtd: details.suggested_amount || null,
      free_hamper: details?.free_hamper,
      suggested_date: details.suggested_at,
      suggested_days_ago: `(${details.suggested_days_ago} Days ago)`,
      suggested_by: details.suggested_by || null,
      suggested_payment_mode: details.suggested_payment_mode || null,
      suggested_payment_details: details.suggested_payment_mode_details || null,
      suggested_payment_link_shared: !!details.suggested_payment_link_id,
      suggested_payment_link_expiry: details.suggested_payment_mode
        ? moment(details.suggested_payment_expiry)
            .add(5, "hours")
            .add(30, "minutes")
        : false,
      suggested_payment_link: details.suggested_payment_link,
      suggested_mentor_note: details.suggested_mentor_note,
      suggested_motivation_level: details.suggested_motivation_level,
      suggested_sale_status: details.suggested_sale_status,
      message,
      old_pitched_details: details.old_pitched_details || null,
    },
  };

  const weight_details_object = {
    weight: `${details.client_latest_weight} kg` || null,
    "date_&_time": moment(details.client_latest_weight_date).fromNow() || null,
    // "date_&_time":
    //   moment(details.client_latest_weight_date).format(
    //     "MMMM D, YYYY [at] hh:mm A"
    //   ) || null,
  };

  const health_score_details_objects = {
    health_score: details.client_latest_health_score || null,
    ibw: details.client_latest_ibw || null,
    bmi: details.client_latest_bmi || null,
    health_category: details.client_latest_health_category || null,
    type: details.client_latest_health_score_type || null,
  };

  if (addFields.weight_details) {
    for (const key in weight_details_object) {
      mappedData[key] = weight_details_object[key];
    }
  }

  if (addFields.weight_data) {
    mappedData.weight_data = {
      start_program_weight: details.program_start_weight || null,
      latest_weight: details.client_latest_weight || null,
      ...(details.program_start_weight - details.client_latest_weight > 0 && {
        lost_weight:
          details.program_start_weight - details.client_latest_weight,
      }),
      ...(details.program_start_weight - details.client_latest_weight < 0 && {
        gained_weight:
          details.client_latest_weight - details.program_start_weight,
      }),
      goal_weight: details.goal_weight || null,
      height: details.client_height || null,
    };
  }

  if (addFields.latest_weight_data) {
    mappedData.weight_details = {
      weight_id: details.client_latest_weight_id || null,
      weight: `${details.client_latest_weight} kg` || null,
      difference:
        `${Number(
          details.client_latest_weight -
            (details.client_previous_weight ?? details.client_latest_weight),
        ).toFixed(2)} kg` || null,
      date:
        `${moment(details.client_latest_weight_date).format(
          "MMMM D, YYYY [at] hh:mm A",
        )} (${moment(details.client_latest_weight_date).fromNow()})` || null,
      weight_day: String(details.client_latest_weight_day) || null,
    };
  }

  if (addFields.inch_data) {
    mappedData.inch_details = {
      inch_id: details.inch_id || null,
      chest: details.chest_inch || null,
      waist: details.waist_inch || null,
      hips: details.hips_inch || null,
    };
  }
  if (addFields.birthday_hamper) {
    mappedData.birthday_hamper_details = {
      hamper_product_name: details.hamper_product_name || null,
      hamper_pack_size: details.hamper_pack_size || null,
      delivery_status: details.delivery_status || null,
      hamper_claimed_date: details?.hamper_claimed_date
        ? moment(details?.hamper_claimed_date).format("DD-MM-YYYY")
        : null,
      hamper_delivered_date: details?.hamper_delivered_date
        ? moment(details?.hamper_delivered_date).format("DD-MM-YYYY")
        : null,
    };
  }

  if (addFields.photo_data) {
    mappedData.photo_details = {
      photo_id: details.photo_id || null,
      photo_url: details.photo_url || null,
    };
  }

  if (addFields.follow_up) {
    // Follow-up details
    mappedData.follow_up_details = {
      prev_follow_up_date: details.prev_follow_up_date || null,
      prev_follow_up_id: details.prev_follow_up_id || null,
      prev_follow_up_type: details.prev_follow_up_type || null,
      prev_source: details.prev_source || null,
      prev_campaign: details.prev_campaign || null,

      prev_follow_up_assigned_by: details.prev_follow_up_assigned_by || null,
      prev_appointment_slots: details.prev_appointment_slots || null,
      prev_follow_up_note: details.prev_follow_up_note || null,
      next_follow_up_date: details.next_follow_up_date || null,
      next_follow_up_id: details.next_follow_up_id || null,
      next_follow_up_type: details.next_follow_up_type || null,
      next_source: details.next_source || null,
      next_campaign: details.next_campaign || null,
      next_follow_up_assigned_by: details.next_follow_up_assigned_by || null,
      next_appointment_slots: details.next_appointment_slots || null,
      next_follow_up_note: details.next_follow_up_note || null,
    };
  }

  if (addFields.health_score) {
    mappedData.health_score_details = health_score_details_objects;
  }

  if (addFields.diet_feedback_details) {
    mappedData.diet_feedback = {
      feedback: safeJSONParse(details.diet_feedback_result) || null,
      diet_id: details.diet_feedback_diet_id || null,
      session: details.diet_feedback_session || null,
      submitted_at: details.diet_feedback_created_at || null,
    };
  }

  if (addFields.alcohol_menu) {
    mappedData.alcohol_menu = {
      food_menu: safeJSONParse(details.alcohol_menu_food_menu) || null,
      total_calories: details.alcohol_menu_total_calories || null,
      alcohol_calories: details.alcohol_menu_alcohol_calories || null,
      mixers_calories: details.alcohol_menu_mixers_calories || null,
      excess_calories: details.alcohol_menu_excess_calories || null,
      added_date: details.alcohol_menu_added_date || null,
      menu_id: details.alcohol_menu_id || null,
      acknowledged: details.alcohol_menu_acknowledged || null,
    };
  }

  if (addFields.restaurant_menu) {
    mappedData.restaurant_menu = {
      food_menu: safeJSONParse(details.restaurant_menu_food_menu) || null,
      total_calories: details.restaurant_menu_total_calories || null,
      excess_calories: details.restaurant_menu_excess_calories || null,
      total_protein: details.restaurant_menu_total_protein || null,
      total_carbs: details.restaurant_menu_total_carbs || null,
      total_fat: details.restaurant_menu_total_fat || null,
      added_date: details.restaurant_menu_added_date || null,
      menu_id: details.restaurant_menu_id || null,
      acknowledged: details.restaurant_menu_ack || null,
    };
  }

  if (addFields.call_details) {
    mappedData.call_details = {
      call_id: details.call_id,
      call_type: details.call_type_label,
      call_status: details.call_status_label,
      schedule_date: `${moment(details.schedule_date).format("DD/MM/YYYY")}`,
    };
  }

  if (addFields.program_start_date) {
    const addedByMap = {
      0: "Default",
      1: "Mentor",
      2: "Client",
    };
    const start_date_added_by =
      addedByMap[Number(details.start_date_added_by)] || null;
    mappedData.start_date =
      `${moment(details.current_program_start_date).format(
        "DD MMM YYYY",
      )} (${start_date_added_by})` || null;
  }

  if (Object.keys(addExtraKeyTo).length > 0) {
    for (const [key, value] of Object.entries(addExtraKeyTo)) {
      for (const k in value) {
        mappedData[key][k] = value[k];
      }
    }
  }

  let hs = mappedData.health_score_details;

  if (addFields.hs_back) {
    delete mappedData.health_score_details;
  }

  // Dynamically add extra mappings
  Object.assign(mappedData, extraMappings);
  if (addFields.health_score && addFields.hs_back) {
    mappedData.health_score_details = hs;
  }

  if (removeFields && removeFields.length > 0) {
    // Remove specified fields from the mappedData object
    removeFields.forEach((field) => {
      delete mappedData[field];
    });
  }

  return mappedData;
};

// ? generateUserIdsAndOrderById function takes the users array and returns the array of userIds and orderById string which can used to maintain the order of the users as recived in the users array
function generateUserIdsAndOrderById(users) {
  let userIds = [];
  let orderById = "FIELD(cd.user_id,";

  // Iterate through the users array to generate userIds and orderById
  for (let i = 0; i < users.length; i++) {
    userIds.push(users[i].user_id); // Push user_id into the userIds array

    // Append the user_id to the orderById string
    if (i === users.length - 1) {
      orderById += `${users[i].user_id}`;
    } else {
      orderById += `${users[i].user_id},`;
    }
  }

  // Close the FIELD function
  orderById += ")";

  // Return both the userIds array and the orderById string
  return { userIds, orderById };
}
const appConstants = {
  APP_HALFTIME_FEEDBACK_DEEPLINK:
    "https://www.balancenutrition.in/app_link/screen_id=27",
  CLIENT_HEALTH_SCORE_DEEPLINK:
    "https://www.balancenutrition.in/app_link/screen_id=213",
  CLIENT_TE_HEALTH_SCORE_DEEPLINK:
    "https://www.balancenutrition.in/app_link/screen_id=214",
  HALTIME_FEEDBACK_CALL_BOOKING_DEEPLINK:
    "https://www.balancenutrition.in/app_link/screen_id=31/call_type=1",
  CLIENT_GOAL_DEEPLINK: "https://www.balancenutrition.in/app_link/screen_id=3",
  APP_FINAL_FEEDBACK_DEEPLINK:
    "https://www.balancenutrition.in/app_link/screen_id=35",
  FINAL_FEEDBACK_CALL_BOOKING_DEEPLINK:
    "https://www.balancenutrition.in/app_link/screen_id=32/call_type=2",
};
function replacePlaceholders(inputString, data) {
  // Regular expression to match placeholders like {{name}}, {{phone}}, etc.
  const pattern = /\{\{(.*?)\}\}/g;

  // Function to replace each match with the corresponding value from the data object
  return inputString.replace(pattern, (match, p1) => {
    // p1 contains the placeholder name without the curly braces
    return data[p1] !== undefined
      ? data[p1]
      : appConstants[p1] !== undefined
        ? appConstants[p1]
        : match; // If the placeholder is not found in data, keep it as is
  });
}
function containsNull(inputString) {
  // Check if the input string contains the word "null"
  if (inputString.includes("null")) {
    return true;
  } else {
    return false;
  }
}
function extractVariables(inputString) {
  // Define the regular expression to match words inside {{}} (e.g., {{name}})
  const regex = /{{(.*?)}}/g;
  let matches;
  const result = [];

  // Use regex.exec() to find all matches in the input string
  while ((matches = regex.exec(inputString)) !== null) {
    // Push the matched string (including the braces) into the result array
    result.push(matches[0]);
  }

  return result;
}
const readRecordNewForLead = async ({
  table,
  selectFields,
  joins = [],
  conditions = [],
  groupBy = [],
  having = [],
  orderBy = [],
  pagination = {},
  search = {},
  countTotal = false,
  isLive = false,
  withQueries = [], // New parameter for CTEs
}) => {
  console.log(conditions, 1542);
  const { limit, page } = pagination;
  let { searchQuery, searchFields = [] } = search;

  // If searchFields is ["*"], fetch all columns from the table
  if (searchFields.length === 1 && searchFields[0] === "*") {
    const [columns] = await readPool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME= '${table}' AND TABLE_SCHEMA = '${database}';`,
    );
    searchFields = columns.map((column) => column.COLUMN_NAME);
  }

  // Construct the WITH clause for CTEs
  const withQuery =
    withQueries.length > 0
      ? `WITH ${withQueries
          .map((cte) => `${cte.name} AS (${cte.query})`)
          .join(", ")}`
      : "";

  // Construct the SELECT part of the query
  const selectQuery = `SELECT ${
    selectFields && selectFields.length > 0 ? selectFields.join(", ") : "*"
  } FROM ${table}`;

  // Construct the JOIN part of the query
  const joinQuery =
    joins &&
    joins
      .map((join) => `${join.type || "INNER"} JOIN ${join.table} ON ${join.on}`)
      .join(" ");

  // Prepare the values array and condition queries
  let values = [];
  const conditionQueryParts = [];
  const jsonContainsConditions = {}; // To handle multiple JSON_CONTAINS conditions

  // Handle conditions and logic operators, now supporting subqueries
  const handleCondition = (condition, index) => {
    const logic = index === 0 ? "" : condition.logic || "AND";

    if (condition.subquery) {
      // Subquery handling
      const { query, operator, logic: subqueryLogic } = condition.subquery;
      return `${logic} ${operator} (${query})`;
    }

    if (condition.orConditions && condition.orConditions.length > 0) {
      // Handle OR conditions
      const orConditionParts = condition.orConditions.map((orCondition) => {
        if (orCondition.raw) {
          // Handle raw conditions
          return `${orCondition.field} ${orCondition.operator} ${orCondition.value}`;
        }

        const { field, operator, value } = orCondition;
        if (operator?.toUpperCase() === "BETWEEN" && Array.isArray(value)) {
          values.push(value[0], value[1]);
          return `${field} BETWEEN ? AND ?`;
        } else if (["IN", "NOT IN"].includes(operator?.toUpperCase())) {
          if (Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            values = values.concat(value);
            return `${field} ${operator.toUpperCase()} (${placeholders})`;
          }
        } else if (operator?.toUpperCase() === "JSON_CONTAINS") {
          const searchInPath = orCondition.searchIn
            ? `$.${orCondition.searchIn}`
            : "$";
          const jsonParts = [];

          if (Array.isArray(value)) {
            value.forEach((val) => {
              values.push(val);
              jsonParts.push(`JSON_CONTAINS(${field}, ?, '${searchInPath}')`);
            });
          } else {
            values.push(value);
            jsonParts.push(`JSON_CONTAINS(${field}, ?, '${searchInPath}')`);
          }

          return `(${jsonParts.join(" OR ")})`;
        } else {
          values.push(value);
          return `${field} ${operator?.toUpperCase()} ?`;
        }
      });
      return `${logic} (${orConditionParts.join(" OR ")})`;
    }

    const field = condition.field;
    const operator = condition.operator?.toUpperCase();
    const value = condition.value;

    if (condition.raw) {
      // Handle raw value for normal conditions
      if (operator === "BETWEEN") {
        return `${logic} ${field} BETWEEN ${value[0]} AND ${value[1]}`;
      }
      return `${logic} ${field} ${operator} ${value}`;
    } else if (operator === "IN" || operator === "NOT IN") {
      if (Array.isArray(value)) {
        const placeholders = value.map(() => "?").join(", ");
        values = values.concat(value);
        return `${logic} ${field} ${operator} (${placeholders})`;
      }
    } else if (operator === "BETWEEN") {
      if (Array.isArray(value) && value.length === 2) {
        values.push(value[0], value[1]);
        return `${logic} ${field} BETWEEN ? AND ?`;
      }
    } else if (operator === "LIKE") {
      if (Array.isArray(value)) {
        const likeParts = value.map((val) => {
          values.push(`%${val}%`);
          return `${field} LIKE ?`;
        });
        return `${logic} (${likeParts.join(" OR ")})`;
      } else {
        values.push(`%${value}%`);
        return `${logic} ${field} LIKE ?`;
      }
    } else if (operator === "JSON_CONTAINS") {
      const searchInPath = condition.searchIn ? `$.${condition.searchIn}` : "$";
      if (Array.isArray(value)) {
        if (!jsonContainsConditions[field]) {
          jsonContainsConditions[field] = [];
        }
        jsonContainsConditions[field].push(
          ...value.map((val) => ({ value: val, path: searchInPath })),
        );
      } else if (typeof value === "string") {
        if (!jsonContainsConditions[field]) {
          jsonContainsConditions[field] = [];
        }
        jsonContainsConditions[field].push({ value, path: searchInPath });
      }
    } else {
      values.push(value);
      return `${logic} ${field} ${operator} ?`;
    }
  };

  // Apply condition handling, now with subquery support
  conditions.forEach((condition, index) => {
    const conditionQueryPart = handleCondition(condition, index);
    if (conditionQueryPart) {
      conditionQueryParts.push(conditionQueryPart);
    }
  });

  // Combine JSON_CONTAINS conditions with optional searchIn
  Object.keys(jsonContainsConditions).forEach((field, index) => {
    const logic = conditionQueryParts.length === 0 && index === 0 ? "" : "AND"; // Always ensure proper "AND"
    const jsonContainsParts = jsonContainsConditions[field].map(
      ({ value, path }) => `JSON_CONTAINS(${field}, ?, '${path}')`,
    );
    conditionQueryParts.push(`${logic} (${jsonContainsParts.join(" OR ")})`);
    values = values.concat(
      jsonContainsConditions[field].map((item) => item.value),
    );
  });

  // Add search conditions if search query is provided
  if (searchQuery) {
    // Use provided searchFields or default to stripped selectFields
    const fieldsToSearch =
      searchFields?.length > 0
        ? searchFields
        : selectFields.map((field) => field.split(/\s+AS\s+|\s+as\s+/)[0]);

    // Remove leading/trailing spaces from the search query
    const trimmedSearchQuery = searchQuery.trim();

    // Prepare LIKE conditions for each field
    const searchConditionParts = fieldsToSearch.map((field) => {
      // Apply TRIM and LOWER to the database field
      const condition = `LOWER(TRIM(${field})) LIKE ?`;
      values.push(`%${trimmedSearchQuery.toLowerCase()}%`); // Add wildcard (%) for partial matching
      return condition;
    });

    values.push(`%${trimmedSearchQuery.toLowerCase()}%`);

    // Join all search conditions with OR logic
    const searchConditionQuery = searchConditionParts.join(" OR ");

    // Add to the condition query, using AND if there are other conditions
    conditionQueryParts.push(
      conditionQueryParts.length > 0
        ? `AND (${searchConditionQuery})`
        : `(${searchConditionQuery})`,
    );
  }

  // Construct the condition query
  const conditionQuery =
    conditionQueryParts.length > 0
      ? `WHERE ${conditionQueryParts.join(" ")}`
      : "";

  // Construct the group by part of the query
  const groupByQuery =
    groupBy.length > 0 ? `GROUP BY ${groupBy.join(", ")}` : "";

  // Prepare the having query
  const havingQueryParts = having.map((condition, index) => {
    const logic = index === 0 ? "" : condition.logic || "AND";
    if (condition.raw) {
      return `${logic} ${condition.field} ${condition.operator} ${condition.value}`;
    }
    values.push(condition.value);
    return `${logic} ${condition.field} ${condition.operator} ?`;
  });

  const havingQuery =
    havingQueryParts.length > 0 ? `HAVING ${havingQueryParts.join(" ")}` : "";

  // Construct the order by part of the query
  const orderByQuery =
    orderBy.length > 0 ? `ORDER BY ${orderBy.join(", ")}` : "";

  // Calculate the offset for pagination if limit and page are provided
  const limitQuery = limit ? `LIMIT ${parseInt(limit)}` : "";
  const offsetQuery =
    limit && page ? `OFFSET ${(parseInt(page) - 1) * parseInt(limit)}` : "";

  // Combine all parts to form the final query
  const query = `${withQuery} ${selectQuery} ${joinQuery} ${conditionQuery} ${groupByQuery} ${havingQuery} ${orderByQuery} ${limitQuery} ${offsetQuery}`;
  console.log(values, 1754);
  try {
    console.log(query, 2097, values, 1756);
    const pool = isLive ? livePool : readPool;
    const [results] = await pool.query(query, values);
    let connection = await pool.getConnection();
    connection.release();
    let totalCount = 0;

    if (countTotal) {
      // Construct the count query with CTEs
      const countSelect = groupBy.length
        ? `SELECT ${groupBy.join(
            ", ",
          )} FROM ${table} ${joinQuery} ${conditionQuery} ${groupByQuery}`
        : `SELECT * FROM ${table} ${joinQuery} ${conditionQuery}`;

      const countQuery = `
        ${withQuery} 
        SELECT COUNT(*) as count 
        FROM (${countSelect}) AS grouped
      `;

      const [[countResult]] = await readPool.query(countQuery, values);
      totalCount = countResult.count;
    }

    return { results, totalCount };
  } catch (error) {
    console.error("Error reading data:", error);
    throw error;
  }
};

const selectMap = new Map();
selectMap.set("user_details", [
  "cd.user_id AS user_id",
  "CONCAT(COALESCE(cd.first_name, ''), ' ', COALESCE(cd.last_name, '')) AS user_name",
  "cd.email_id AS user_email",
  `CASE WHEN cd.phone_code NOT IN ('0') THEN CONCAT(cd.phone_code, ' ', cd.phone_number) ELSE cd.phone END AS user_phone`,
  `CASE WHEN cd.gender = '0' THEN 'Others' WHEN cd.gender = '1' THEN 'Male' WHEN cd.gender = '2' THEN 'Female' END AS gender`,
  `CASE WHEN cd.user_status = 'Active' THEN 'Active' WHEN cd.user_status = 'Completed' THEN 'OC' WHEN cd.user_type = '0' THEN 'Lead' ELSE cd.sub_user_status END AS sub_user_status`,
  `CASE WHEN cd.user_status = 'Active' THEN 'Active' WHEN cd.user_status = 'Completed' THEN 'Completed' WHEN cd.user_type = '0' THEN 'Lead' ELSE cd.sub_user_status END AS user_status`,
  "ma.crm_user AS counsellor_assigned",
  "cd.latest_weight AS user_latest_weight",
  "cd.height AS user_height",
  "cd.lead_type",
  "csource.source_name AS current_source_name",
  "psource.source_name AS primary_source_name",
  "cd.added_date AS user_added_date",
  "cd.birth_date AS user_birth_date",
  "CASE WHEN cd.birth_date != '0000-00-00' THEN TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) ELSE NULL END AS user_age",
  "cd.health_conditions AS user_health_conditions",
  "cd.my_wallet",
  "cd.old_wallet",
  "cd.device as user_device",
  "cd.app_version as user_app_version",
  "cd.sub_sales_status AS user_sub_sales_status",
  "cd.sales_status AS sales_status",
  "cd.medical_issue",
  "cd.birth_date",
  `(CASE WHEN cd.app_version IN ("${app_versions.ios}","${app_versions.android}") then "(App Updated)" ELSE "(App Not Updated)" END) AS app_updated`,
]);

selectMap.set("suggested_programs", [
  "sp.suggested_program_id as suggested_id",
  "sp.program_id AS suggested_program_id",
  "sp.program_session_id AS suggested_program_session_id",
  "spr.program_name AS suggested_program_name",
  "sp.suggested_amount",
  "sps.program_duration AS suggested_program_days",
  "sps.mrp AS suggested_program_mrp",
  "DATE_FORMAT(sp.added_date, '%d %b %Y') AS suggested_at",
  "DATEDIFF(CURDATE(), sp.added_date) AS suggested_days_ago",
  "CONCAT(ad.first_name, ' ', ad.last_name) AS suggested_by",
  "sp.payment_link_id",
  "sppm.payment_mode_name AS suggested_payment_mode",
  "sppm.payment_mode_details AS suggested_payment_mode_details",
  "sp.payment_expiry AS suggested_payment_expiry",
  "spl.payment_link_id AS suggested_payment_link_id",
  "sp.mentor_note AS suggested_mentor_note",
  "sp.motivation_level AS suggested_motivation_level",
  "sp.status AS suggested_sale_status",
  "spl.payment_link AS suggested_payment_link",
  "sp.payment_mode_id AS suggested_payment_mode_id",
  "sp.free_hamper as free_hamper",
]);

selectMap.set("previous_program", [
  "ap.program_id AS previous_program_id",
  "ap.program_name AS previous_program_name",
  "sop.total_sessions * 10 AS previous_program_duration",
  "sop.mrp AS previous_program_mrp",
  "sop.paid_amount AS previous_program_amount",
  "apm.name as previous_program_payment_mode",
  "sop.total_sessions AS previous_program_total_sessions",
  "sop.sent_sessions AS previous_program_sent_sessions",
  "ama.crm_user as mentor_assigned",
  "DATE_FORMAT(sop.expiry_date,'%d %b %Y') AS previous_program_expiry_date",
  "ads.crm_user AS previous_program_sale_by",
]);

selectMap.set("health_score", [
  "latest_health.overall_health_score",
  "latest_health.created AS health_score_taken_date",
  "latest_health.ideal_weight",
  "latest_health.weight AS hs_weight",
  "latest_health.ideal_bmi",
  "latest_health.health_category",
  "latest_health.height",
  "latest_health.sleep_duration",
  "latest_health.activity_level",
  "latest_health.smoke_frequency",
  "latest_health.periods",
  "latest_health.alcohol_frequency",
  "latest_health.water_frequency",
  "latest_health.veg_fruits_frequency",
  "latest_health.goals as health_goals",
]);

selectMap.set("goal_weight", ["aspd.goal_weight"]);

selectMap.set("goal", [
  "goals.milestone_comment",
  "goals.milestone",
  "goals.milestone_achieved",
  "goals.new_goal_comment",
  "goals.new_goal",
  "goals.new_goal_achieved",
  "goals.goal_comment",
  "goals.goal",
  "goals.goal_achieved",
]);

selectMap.set("follow_up", [
  /* Past Follow-up */
  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_follow_up_date"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_id END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_follow_up_id"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.type END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_follow_up_type"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.source END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_source"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.campaign END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_campaign"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN CONCAT(ab.first_name,' ',ab.last_name) END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_follow_up_assigned_by"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN 
          CASE WHEN fu1.type IN ('0', 0) THEN slot.appointment_slots WHEN fu1.type IN (1,2, '1', '2') THEN wap_slot.appointment_slots END
      END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_appointment_slots"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note END
      ORDER BY fu1.follow_up_date DESC
  ), ',', 1) AS "prev_follow_up_note"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_follow_up_date"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_id END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_follow_up_id"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN fu1.type END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_follow_up_type"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN fu1.source END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_source"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN fu1.campaign END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_campaign"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN CONCAT(ab.first_name,' ',ab.last_name) END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_follow_up_assigned_by"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN 
          CASE WHEN fu1.type IN (0, '0') THEN slot.appointment_slots WHEN fu1.type IN (1,2, '1', '2') THEN wap_slot.appointment_slots END
      END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_appointment_slots"`,

  `SUBSTRING_INDEX(GROUP_CONCAT(
      CASE WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_note END
      ORDER BY fu1.follow_up_date ASC
  ), ',', 1) AS "next_follow_up_note"`,
]);

selectMap.set("follow_up_new", [
  "last_fu.follow_up_date AS prev_follow_up_date",
  "last_fu.follow_up_id AS prev_follow_up_id",
  "last_fu.type AS prev_follow_up_type",
  "last_fu.source AS prev_source",
  "last_fu.campaign AS prev_campaign",
  "CONCAT(last_fu_admin.first_name, ' ', last_fu_admin.last_name) AS prev_follow_up_assigned_by",
  "last_slot.appointment_slots AS prev_appointment_slots",
  "last_fu.follow_up_note AS prev_follow_up_note",
  "last_fu.follow_up_status AS prev_follow_up_status",
  "next_fu.follow_up_date AS next_follow_up_date",
  "next_fu.follow_up_id AS next_follow_up_id",
  "next_fu.type AS next_follow_up_type",
  "next_fu.source AS next_source",
  "next_fu.campaign AS next_campaign",
  "CONCAT(next_fu_admin.first_name, ' ', next_fu_admin.last_name) AS next_follow_up_assigned_by",
  "next_slot.appointment_slots AS next_appointment_slots",
  "next_fu.follow_up_note AS next_follow_up_note",
  "next_fu.follow_up_status AS next_follow_up_status",
]);

selectMap.set("consultation", ["csl.key_insights"]);
selectMap.set("consultation_new", ["csln.key_insights"]);
selectMap.set("source", [
  "csource.source_name AS current_source_name",
  "psource.source_name AS primary_source_name",
]);

const joinsMap = new Map();
joinsMap.set("suggested_programs", [
  {
    type: "LEFT",
    table: `${tables.suggestedProgram} sp`,
    on: "cd.suggested_program_id = sp.suggested_program_id",
  },
  {
    type: "LEFT",
    table: `${tables.programsMaster} spr`,
    on: "sp.program_id = spr.program_id",
  },
  {
    type: "LEFT",
    table: `${tables.programSession} sps`,
    on: "sp.program_session_id = sps.program_session_id",
  },
  {
    type: "LEFT",
    table: `${tables.adminUsers} ad`,
    on: "sp.suggested_by = ad.admin_user_id",
  },
  {
    type: "LEFT",
    table: `${tables.paymentModes} sppm`,
    on: "sp.payment_mode_id = sppm.payment_mode_id",
  },
  {
    type: "LEFT",
    table: `${tables.paymentLinks} spl`,
    on: "sp.payment_link_id = spl.id",
  },
]);

joinsMap.set("previous_program", [
  {
    type: "LEFT",
    table: `${tables.subOrderPrograms} sop`,
    on: "cd.active_order_id = sop.sub_order_id",
  },
  {
    type: "LEFT",
    table: `${tables.programsMaster} ap`,
    on: "sop.program_id = ap.program_id",
  },
  {
    type: "LEFT",
    table: `${tables.adminUsers} ama`,
    on: "cd.mentor_assigned = ama.admin_user_id",
  },
  {
    type: "LEFT",
    table: `${tables.orderDetails} od`,
    on: "sop.order_id = od.order_id",
  },
  {
    type: "LEFT",
    table: `${tables.accountPaymentModes} apm`,
    on: "od.payment_mode = apm.id",
  },
  {
    type: "LEFT",
    table: `${tables.adminUsers} ads`,
    on: "od.sale_by = ads.admin_user_id",
  },
]);

joinsMap.set("health_score", [
  {
    type: "LEFT",
    table: `latest_health`,
    on: "cd.user_id = latest_health.user_id",
  },
]);

joinsMap.set("goal_weight", [
  {
    type: "LEFT",
    table: `${tables.assessment_personal_details} aspd`,
    on: "cd.user_id = aspd.user_id",
  },
]);

joinsMap.set("goal", [
  {
    type: "LEFT",
    table: `goals`,
    on: "cd.user_id = goals.user_id",
  },
]);

joinsMap.set("follow_up", [
  {
    type: "LEFT",
    table: `${tables.leadFollowUpLogs} fu1`,
    on: "cd.user_id = fu1.user_id",
  },
  {
    type: "LEFT",
    table: `${tables.slots} slot`,
    on: "fu1.slot_id = slot.id and fu1.type IN ('0', 0)",
  },
  {
    type: "LEFT",
    table: `${tables.whatsappAppSlots} wap_slot`,
    on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1', '2', 1, 2)",
  },
  {
    type: "LEFT",
    table: `${tables.adminUsers} ab`,
    on: "fu1.added_by = ab.admin_user_id",
  },
]);

joinsMap.set("follow_up_new", [
  {
    type: "LEFT",
    table: `${tables.leadFollowUpLogs} last_fu`,
    on: `last_fu.user_id = cd.user_id
  AND last_fu.follow_up_date = (
    SELECT MAX(f1.follow_up_date)
    FROM lead_follow_up_logs f1
    WHERE f1.user_id = cd.user_id
      AND f1.follow_up_date < CURDATE()
  )`,
  },
  {
    type: "LEFT",
    table: `${tables.adminUsers} last_fu_admin`,
    on: `last_fu.added_by = last_fu_admin.admin_user_id`,
  },
  {
    type: "LEFT",
    table: `${tables.slots} last_slot`,
    on: `last_fu.slot_id = last_slot.id`,
  },
  {
    type: "LEFT",
    table: `${tables.leadFollowUpLogs} next_fu`,
    on: `next_fu.user_id = cd.user_id
  AND next_fu.follow_up_date = (
    SELECT MIN(f2.follow_up_date)
    FROM lead_follow_up_logs f2
    WHERE f2.user_id = cd.user_id
      AND f2.follow_up_date >= CURDATE()
  )`,
  },
  {
    type: "LEFT",
    table: `${tables.adminUsers} next_fu_admin`,
    on: `next_fu.added_by = next_fu_admin.admin_user_id`,
  },
  {
    type: "LEFT",
    table: `${tables.slots} next_slot`,
    on: `next_fu.slot_id = next_slot.id`,
  },
]);

joinsMap.set("consultation", [
  {
    type: "LEFT",
    table: `${tables.consultationLogs} csl`,
    on: "cd.user_id = csl.user_id",
  },
]);

joinsMap.set("consultation_new", [
  {
    type: "LEFT",
    table: `(
  SELECT cl.*
  FROM consultation_log cl
  JOIN (
    SELECT user_id, MAX(added_date) AS latest_date
    FROM consultation_log
    GROUP BY user_id
  ) latest_cl ON cl.user_id = latest_cl.user_id AND cl.added_date = latest_cl.latest_date
) csln`,
    on: "cd.user_id = csln.user_id",
  },
]);

joinsMap.set("source", [
  {
    type: "LEFT",
    table: `${tables.leadSource} csource`,
    on: "cd.current_lead_source = csource.source_id",
  },
  {
    type: "LEFT",
    table: `${tables.leadSource} psource`,
    on: "cd.primary_lead_source = psource.source_id",
  },
]);

const withMap = new Map();
withMap.set("goals", [
  {
    name: "goals",
    query: `SELECT user_id,
        MAX(CASE WHEN goal_type = 1 THEN comment END) AS milestone_comment,
        MAX(CASE WHEN goal_type = 1 THEN goal_type END) AS milestone,
        MAX(CASE WHEN goal_type = 1 THEN is_achieved END) AS milestone_achieved,
        MAX(CASE WHEN goal_type = 2 THEN comment END) AS new_goal_comment,
        MAX(CASE WHEN goal_type = 2 THEN goal_type END) AS new_goal,
        MAX(CASE WHEN goal_type = 2 THEN is_achieved END) AS new_goal_achieved,
        MAX(CASE WHEN goal_type = 3 THEN comment END) AS goal_comment,
        MAX(CASE WHEN goal_type = 3 THEN goal_type END) AS goal,
        MAX(CASE WHEN goal_type = 3 THEN is_achieved END) AS goal_achieved
    FROM bn_my_goals
    GROUP BY sub_order_id`,
  },
]);

withMap.set("latest_health", [
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
]);
const getCommonSelectFields = () => [
  ...selectMap.get("user_details"),
  ...selectMap.get("suggested_programs"),
  ...selectMap.get("follow_up_new"),
  ...selectMap.get("source"),
  ...selectMap.get("health_score"),
  ...selectMap.get("consultation_new"),
];
const getCommonSelectFieldsOC = () => [
  ...selectMap.get("user_details"),
  ...selectMap.get("suggested_programs"),
  ...selectMap.get("follow_up_new"),
  ...selectMap.get("source"),
  ...selectMap.get("health_score"),
  ...selectMap.get("consultation_new"),
  ...selectMap.get("previous_program"),
];

const getCommonJoins = () => [
  {
    type: "LEFT",
    table: `${tables.adminUsers} ma`,
    on: "cd.counsellor_assigned = ma.admin_user_id",
  },
  ...joinsMap.get("suggested_programs"),
  ...joinsMap.get("health_score"),
  ...joinsMap.get("follow_up_new"),
  ...joinsMap.get("source"),
  ...joinsMap.get("consultation_new"),
];
const getCommonJoinsOC = () => [
  {
    type: "LEFT",
    table: `${tables.adminUsers} ma`,
    on: "cd.counsellor_assigned = ma.admin_user_id",
  },
  ...joinsMap.get("suggested_programs"),
  ...joinsMap.get("health_score"),
  ...joinsMap.get("follow_up_new"),
  ...joinsMap.get("source"),
  ...joinsMap.get("consultation_new"),
  ...joinsMap.get("previous_program"),
];
const mapLeadData = ({ user, details, addFields = {}, extraMappings = {} }) => {
  const mappedData = {
    lead_details: {
      lead_id: details.user_id,
      lead_name: details.user_name || null,
      email_id: details.user_email || null,
      phone_number: details.user_phone || null,
      status: details.sub_user_status || null,
      sub_sales_status: details.user_sub_sales_status || null,
      user_current_source: details.current_source_name || null,
      wallet: details.my_wallet || null,
      user_created_at: details.user_added_date || null,
      app_version: details.app_updated || null,
      birth_date: details.birth_date || null,
    },
    pitched_program_details: {
      pitched_id: details.suggested_id || null,
      pitched_program_id: details.suggested_program_id,
      pitched_program_session_id: details.suggested_program_session_id,
      pitched_program_name: details.suggested_program_name || null,
      pitched_program_duration: `(${details.suggested_program_days})`,
      pitched_program_mrp: details.suggested_program_mrp || null,
      pitched_program_qtd: details.suggested_amount || null,
      pitched_date: details.suggested_at,
      free_hamper: details.free_hamper,
      pitched_days_ago: `(${details.suggested_days_ago} Days ago)`,
      pitched_by: details.suggested_by || null,
      pitched_payment_mode: details.suggested_payment_mode || null,
      pitched_payment_details: details.suggested_payment_mode_details || null,
      pitched_payment_link_shared: !!details.suggested_payment_link_id,
      pitched_payment_link_expiry: details.suggested_payment_mode
        ? details.suggested_payment_expiry
        : false,
      pitched_payment_link: details.suggested_payment_link,
      pitched_mentor_note: details.suggested_mentor_note,
      pitched_motivation_level: details.suggested_motivation_level,
      pitched_sale_status: details.suggested_sale_status,
    },
    health_score_details: {
      overall_health_score: details.overall_helath_score,
      health_score_taken_date: details.health_score_taken_date,
      ideal_weight: details.ideal_weight,
      hs_height: details.hs_height,
      sleep_duration: details.sleep_duration,
      health_category: details.health_category,
      ideal_bmi: details.ideal_bmi,
      activity_level: details.activity_level,
      smoke_frequency: details.smoke_frequency,
      periods: details.periods,
      alcohol_frequency: details.alcohol_frequency,
      water_frequency: details.water_frequency,
      veg_fruit_frequency: details.veg_fruit_frequency,
    },
    key_insights: details.key_insights ? JSON.parse(details.key_insights) : {},
    follow_up_details: {
      prev_follow_up_id: details.prev_follow_up_id,
      prev_follow_up_date: details.prev_follow_up_date,
      prev_follow_up_type: details.prev_follow_up_type,
      prev_follow_up_assigned_by: details.prev_follow_up_assigned_by,
      prev_appointment_slots: details.prev_appointment_slots,
      prev_follow_up_note: details.prev_follow_up_note,
      next_follow_up_id: details.next_follow_up_id,
      next_follow_up_date: details.next_follow_up_date,
      next_follow_up_type: details.next_follow_up_type,
      next_follow_up_assigned_by: details.next_follow_up_assigned_by,
      next_appointment_slots: details.next_appointment_slots,
      next_follow_up_note: details.next_follow_up_note,
    },
    source_and_status_details: {
      current_source_name: details.current_source_name,
      primary_source_name: details.primary_source_name,
      lead_status: details.sales_status,
      lead_type: details.lead_type,
    },
  };

  // Dynamically add extra mappings
  Object.assign(mappedData, extraMappings);

  return mappedData;
};

function generatePaymentMessage({
  client_name,
  suggested_payment_mode_id,
  suggested_program_name,
  suggested_amount,
  suggested_payment_link,
  suggested_payment_expiry,
  suggested_payment_mode_details,
  free_hamper = "No",
}) {
  switch (suggested_payment_mode_id) {
    case 1: // Online Link
      const daysLeft = moment(suggested_payment_expiry).diff(moment(), "days");

      let displayDays;
      if (daysLeft > 0) {
        displayDays = `in the next ${daysLeft} Days`;
      } else if (daysLeft === 0) {
        displayDays = "Today";
      } else {
        displayDays = ""; // or "Expired" if you want to show past due
      }
      return `<span>Hi ${client_name},<br> PFA your payment link for <b>${suggested_program_name} program</b> for Amount <b>Rs.${suggested_amount}</b> <br> Click here: <a href="${suggested_payment_link}">${suggested_payment_link}</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
        suggested_payment_expiry,
      ).format(
        "Do MMMM YYYY",
      )} which is ${displayDays}. Please ensure you use it before that. ${
        free_hamper != "No"
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      }</span>`;

    case 2: // UPI
      return `<span>Hi ${client_name}, <br> PFA the UPI details for the Amount of ${suggested_amount} for ${suggested_program_name} program. ${suggested_payment_mode_details} ${
        free_hamper != "No"
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;

    case 3: // Bank Transfer
      return `<span>PFA the Bank Account Details for the payment of ${suggested_amount} for ${suggested_program_name} program. ${suggested_payment_mode_details} ${
        free_hamper != "No"
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;

    case 4: // Cash
      return `<span>Hi ${client_name},<br> Cash Collection for the amount of Rs. ${suggested_amount} for ${suggested_program_name}. <br> Date: ${moment(
        suggested_payment_expiry,
      ).format(
        "Do MMMM YYYY",
      )} <br> Contact Person: Abdul Shaikh (919158267868) ${
        free_hamper != "No"
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      }  <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;

    default:
      return `<span>No valid payment mode selected.</span>`;
  }
}

const mapLeadDataNew = ({
  user,
  details,
  addFields = {},
  extraMappings = {},
  addExtraKeyTo = {},
  removeFields = [],
}) => {
  const mappedData = {
    user_details: {
      user_id: details.user_id,
      user_name: details.user_name || null,
      email_id: details.user_email || null,
      phone_number: details.user_phone || null,
      user_current_source: details.current_source_name || null,
      // device: details.user_device || null,
      wallet: details.my_wallet || 0,
      sub_sales_status: details.user_sub_sales_status || null,
      status: details.user_status || null,
      ...(details.user_status === "Lead" && {
        user_created_at: details.user_added_date || null,
      }),
      // app_version: details.user_app_version || null,
      app_updated: details.app_updated || null,
      medical_issue: safeJSONParse(details.medical_issue, []) || null,
      birth_date: details.birth_date || null,
    },
    health_details: {
      weight: details.user_latest_weight || details.hs_weight || null,
      age: details.user_age || null,
      ibw: details.ideal_weight || null,
      health_score: details.overall_health_score || null,
      medical_issue: safeJSONParse(details.user_health_conditions, []) || null,
      goal: safeJSONParse(details.health_goals, []) || null,
      health_score_taken_date: details.health_score_taken_date || null,
    },
    suggested_program_details: {
      suggested_id: details.suggested_id || null,
      suggested_program_id: details.suggested_program_id || null,
      suggested_program_session_id: details.suggested_program_session_id,
      suggested_program_name: details.suggested_program_name || null,
      suggested_program_duration: `(${details.suggested_program_days})`,
      suggested_program_mrp: details.suggested_program_mrp || null,
      suggested_program_qtd: details.suggested_amount || null,
      suggested_date: details.suggested_at,
      free_hamper: details?.free_hamper,
      suggested_days_ago: `(${details.suggested_days_ago} Days ago)`,
      suggested_by: details.suggested_by || null,
      suggested_payment_mode: details.suggested_payment_mode || null,
      suggested_payment_details: details.suggested_payment_mode_details || null,
      suggested_payment_link_shared: !!details.suggested_payment_link_id,
      suggested_payment_link_expiry: details.suggested_payment_mode
        ? details.suggested_payment_expiry
        : false,
      suggested_payment_link: details.suggested_payment_link,
      suggested_mentor_note: details.suggested_mentor_note,
      suggested_motivation_level: details.suggested_motivation_level,
      message: generatePaymentMessage({
        client_name: details.user_name,
        suggested_amount: details.suggested_amount,
        suggested_payment_expiry: details.suggested_payment_expiry,
        suggested_payment_link: details.suggested_payment_link,
        suggested_payment_mode_details: details.suggested_payment_mode_details,
        suggested_payment_mode_id: details.suggested_payment_mode_id,
        suggested_program_name: details.suggested_program_name,
        free_hamper: details?.free_hamper,
      }),
    },
    next_follow_up: {
      prev_follow_up_id: details.prev_follow_up_id,
      prev_follow_up_date: details.prev_follow_up_date,
      prev_follow_up_type: details.prev_follow_up_type,
      // prev_follow_up_assigned_by: details.prev_follow_up_assigned_by,
      prev_appointment_slots: details.prev_appointment_slots,
      prev_follow_up_note: details.prev_follow_up_note,
      next_follow_up_id: details.next_follow_up_id,
      next_follow_up_date: details.next_follow_up_date,
      next_follow_up_type: details.next_follow_up_type,
      // next_follow_up_assigned_by: details.next_follow_up_assigned_by,
      next_appointment_slots: details.next_appointment_slots,
      next_follow_up_note: details.next_follow_up_note,
      key_insights: details.key_insights
        ? JSON.parse(details.key_insights)
        : {},
      prev_source: details.prev_source,
      prev_campaign: details.prev_campaign,
      next_source: details.next_source,
      next_campaign: details.next_campaign,
    },
  };
  if (Object.keys(addExtraKeyTo).length > 0) {
    for (const [key, value] of Object.entries(addExtraKeyTo)) {
      for (const k in value) {
        mappedData[key][k] = value[k];
      }
    }
  }
  Object.assign(mappedData, extraMappings);
  if (removeFields && removeFields.length > 0) {
    // Remove specified fields from the mappedData object
    removeFields.forEach((field) => {
      delete mappedData[field];
    });
  }
  return mappedData;
};

const mapOCData = ({
  user,
  details,
  addFields = {},
  extraMappings = {},
  addExtraKeyTo = {},
  removeFields = [],
}) => {
  const mappedData = {
    user_details: {
      user_id: details.user_id,
      user_name: details.user_name || null,
      email_id: details.user_email || null,
      phone_number: details.user_phone || null,
      user_current_source: details.current_source_name || null,
      device: details.user_device || null,
      wallet: details.my_wallet || 0,
      status: details.user_status || null,
      user_created_at: details.user_added_date || null,
      app_version: details.user_app_version || null,
    },
    suggested_program_details: {
      suggested_id: details.suggested_id || null,
      suggested_program_id: details.suggested_program_id || null,
      suggested_program_session_id: details.suggested_program_session_id,
      suggested_program_name: details.suggested_program_name || null,
      suggested_program_duration: `(${details.suggested_program_days})`,
      suggested_program_mrp: details.suggested_program_mrp || null,
      suggested_program_qtd: details.suggested_amount || null,
      suggested_date: details.suggested_at,
      suggested_days_ago: `(${details.suggested_days_ago} Days ago)`,
      suggested_by: details.suggested_by || null,
      suggested_payment_mode: details.suggested_payment_mode || null,
      suggested_payment_details: details.suggested_payment_mode_details || null,
      suggested_payment_link_shared: !!details.suggested_payment_link_id,
      suggested_payment_link_expiry: details.suggested_payment_mode
        ? details.suggested_payment_expiry
        : false,
      suggested_payment_link: details.suggested_payment_link,
      suggested_mentor_note: details.suggested_mentor_note,
      suggested_motivation_level: details.suggested_motivation_level,
      free_hamper: details?.free_hamper,
      message: generatePaymentMessage({
        client_name: details.user_name,
        suggested_amount: details.suggested_amount,
        suggested_payment_expiry: details.suggested_payment_expiry,
        suggested_payment_link: details.suggested_payment_link,
        suggested_payment_mode_details: details.suggested_payment_mode_details,
        suggested_payment_mode_id: details.suggested_payment_mode_id,
        suggested_program_name: details.suggested_program_name,
        free_hamper: details?.free_hamper,
      }),
    },
    health_details: {
      weight: details.user_latest_weight || details.hs_weight || null,
      age: details.user_age || null,
      ibw: details.ideal_weight || null,
      health_score: details.overall_health_score || null,
      medical_issue: safeJSONParse(details.user_health_conditions, []) || null,
      goal: safeJSONParse(details.health_goals, []) || null,
      health_score_taken_date: details.health_score_taken_date || null,
    },
    next_follow_up: {
      prev_follow_up_id: details.prev_follow_up_id,
      prev_follow_up_date: details.prev_follow_up_date,
      prev_follow_up_type: details.prev_follow_up_type,
      prev_follow_up_assigned_by: details.prev_follow_up_assigned_by,
      prev_appointment_slots: details.prev_appointment_slots,
      prev_follow_up_note: details.prev_follow_up_note,
      next_follow_up_id: details.next_follow_up_id,
      next_follow_up_date: details.next_follow_up_date,
      next_follow_up_type: details.next_follow_up_type,
      next_follow_up_assigned_by: details.next_follow_up_assigned_by,
      next_appointment_slots: details.next_appointment_slots,
      next_follow_up_note: details.next_follow_up_note,
      key_insights: details.key_insights
        ? JSON.parse(details.key_insights)
        : {},
    },
  };
  if (Object.keys(addExtraKeyTo).length > 0) {
    for (const [key, value] of Object.entries(addExtraKeyTo)) {
      for (const k in value) {
        mappedData[key][k] = value[k];
      }
    }
  }
  Object.assign(mappedData, extraMappings);
  if (removeFields && removeFields.length > 0) {
    // Remove specified fields from the mappedData object
    removeFields.forEach((field) => {
      delete mappedData[field];
    });
  }
  return mappedData;
};

const addAmountWallet = async ({
  user_id,
  amount,
  reason,
  sub_order_id = 0,
}) => {
  try {
    const { results: walletLog } = await readRecord({
      table: `${tables.walletLog} wl`,
      selectFields: ["*"],
      conditions: [
        { field: "wl.user_id", operator: "=", value: user_id },
        { field: "wl.action", operator: "=", value: reason },
        {
          field: "DATE(wl.date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    console.log(walletLog, 2220);
    const skipReasonCheck = [
      "Start Weight Updated",
      "End Session Weight Updated",
      "Mid Session Weight Updated",
      "Inch Added",
      "End Session Inch Updated",
      "Photo Added",
      "Alcohol Guide Log In",
      "Quick Filler Guide Log In",
      "Restaurant Guide Log In",
    ];
    if (walletLog.length > 0 && !skipReasonCheck.includes(reason)) {
      return { wallet_updated: false, message: "Wallet already updated" };
    }

    const { results: usersDetails } = await readRecord({
      table: tables.userDetails,
      selectFields: ["my_wallet", "mentor_assigned", "counsellor_assigned"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    console.log(usersDetails, 1976);
    // return false;
    const updateResult = await updateRecord(
      tables.userDetails,
      {
        my_wallet: Number(amount) + Number(usersDetails[0].my_wallet),
      },
      {
        user_id,
      },
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return { wallet_updated: false, message: "User not found" };
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      return { wallet_updated: false, message: "No changes made" };
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const columns = [
        "user_id",
        "amount",
        "action",
        "sub_order_id",
        "trans_type",
        "balance_amount",
      ];
      const values = [
        user_id,
        amount,
        reason,
        sub_order_id,
        "C",
        Number(amount) + Number(usersDetails[0].my_wallet),
      ];
      const addWalletLog = await insertRecord(
        tables.walletLog,
        columns,
        values,
      );
      if (addWalletLog.affectedRows === 1) {
        const notification_id = reasonNotificationMap[reason];
        if (notification_id) {
          try {
            await axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user_id],
                notification_id,
                sent_via: "cron",
              },
            );
            console.log(`Notification ${notification_id} sent for ${reason}`);
          } catch (e) {
            console.log("Notification send failed:", e.message);
          }
        }

        return {
          wallet_updated: true,
          wallet_log_updated: true,
          message: "Wallet updated successfully",
        };
      } else {
        return {
          wallet_updated: true,
          wallet_log_updated: false,
          message: "Error updating wallet",
        };
      }
    } else {
      return { wallet_updated: false, message: "Error updating wallet" };
    }
  } catch (error) {
    console.log(error);
    return { wallet_updated: false, message: "Error updating wallet", error };
  }
};

async function addAutoDraftForWeightUpdate({
  user_id,
  weight_day,
  weight,
  session,
  mentor_id,
}) {
  try {
    console.log(user_id, weight_day, weight, session, mentor_id, 2220);
    const { results } = await readRecord({
      selectFields: [
        "cd.first_name",
        "dsl.start_session_weight",
        "dsl.mid_session_weight",
        "sop.start_program_weight",
        "aspd.goal_weight",
        "sop.pending_session",
        "sop.sent_sessions",
        "pm.program_name",
        "ps.validity + ps.extra_validity AS program_validity",
        "DATEDIFF(CURDATE(),sop.start_date) AS total_days_taken",
        "ps.program_duration as program_duration",
        "hs1.body_mass_index as latest_bmi",
        "hs1.ideal_weight latest_ideal_weight",
        "hs1.overall_health_score as latest_hs",
        "hs2.body_mass_index as second_last_bmi",
        "hs2.ideal_weight as second_last_ideal_weight",
        "hs2.overall_health_score as second_last_hs",
        "pr.photo_id as photo_id",
        "ir.inch_id as inch_id",
        "ir.chest as latest_chest_inch",
        "ir.waist as latest_waist_inch",
        "ir.hips as latest_hips_inch",
        "ir2.chest as start_chest_inch",
        "ir2.waist as start_waist_inch",
        "ir2.hips as start_hips_inch",
        "ir3.chest as initial_chest_inch",
        "ir3.waist as initial_waist_inch",
        "ir3.hips as initial_hips_inch",
        "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
        "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1','3') THEN 1 ELSE 0 END ) AS program_number",
        "mg.comment as goal_comment",
        "apm.program_name as advance_program_name",
        "aps.program_duration as advance_program_duration",
        "DATEDIFF(CURDATE(),cd.added_date) as days_since_joining",
        "cd.start_weight - cd.latest_weight as weight_loss",
        `completed_programs_json.completed_programs AS completed_programs`,
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        // ... (joins remain unchanged)
      ],
      groupBy: ["cd.user_id"],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    console.log(results[0], 2443);

    // Default values for variables
    const user_name = results[0]?.first_name || "User";
    const days_since_joining = results[0]?.days_since_joining || 0;
    const program_name = results[0]?.program_name || "Unknown Program";
    const program_validity = results[0]?.program_validity || 0;
    const program_duration = results[0]?.program_duration || 0;
    const total_days_taken = results[0]?.total_days_taken || 0;
    const start_session_weight = Number(
      results[0]?.start_session_weight || 0,
    ).toFixed(3);
    const mid_session_weight = Number(
      results[0]?.mid_session_weight || 0,
    ).toFixed(3);
    const program_start_weight = Number(
      results[0]?.start_program_weight || 0,
    ).toFixed(3);
    const pending_session = results[0]?.pending_session || 0;
    const sent_sessions = results[0]?.sent_sessions || 0;
    const goal_weight = Number(results[0]?.goal_weight || 0).toFixed(3);
    const bmi = results[0]?.latest_bmi || 0;
    const ideal_weight = Number(results[0]?.latest_ideal_weight || 0).toFixed(
      3,
    );
    const latest_health_score = results[0]?.latest_hs || 0;
    const earliest_health_score = results[0]?.second_last_hs || 0;
    const earliest_bmi = results[0]?.second_last_bmi || 0;
    const photo_tracker_updated = !!results[0]?.photo_id;
    const inch_tracker_updated = !!results[0]?.inch_id;
    const latest_chest_inch = Number(results[0]?.latest_chest_inch || 0);
    const latest_waist_inch = Number(results[0]?.latest_waist_inch || 0);
    const latest_hips_inch = Number(results[0]?.latest_hips_inch || 0);
    const start_chest_inch = Number(results[0]?.start_chest_inch || 0);
    const start_waist_inch = Number(results[0]?.start_waist_inch || 0);
    const start_hips_inch = Number(results[0]?.start_hips_inch || 0);
    const initial_chest_inch = Number(results[0]?.initial_chest_inch || 0);
    const initial_waist_inch = Number(results[0]?.initial_waist_inch || 0);
    const initial_hips_inch = Number(results[0]?.initial_hips_inch || 0);

    // Calculate weight difference safely
    const weight_diff = Number(
      results[0]?.mid_session_weight && mid_session_weight != 0
        ? mid_session_weight - weight
        : start_session_weight - weight,
    ).toFixed(3);
    console.log(weight_diff, 2584);
    const weight_diff_days =
      results[0]?.mid_session_weight && mid_session_weight !== 0 ? 5 : 10;

    const no_advance_purchase =
      (results[0]?.advance_program_count || 0) > 0 ? false : true;
    const goal_comment = results[0]?.goal_comment
      ? safeJSONParse(results[0].goal_comment)
      : { milestone_achieved: [], new_goals: [], goals_achieved: [] };
    console.log(goal_comment, 2596);

    // Inch loss calculations with null checks
    const inch_loss = inch_tracker_updated
      ? Math.max(
          latest_chest_inch - start_chest_inch || 0,
          latest_waist_inch - start_waist_inch || 0,
          latest_hips_inch - start_hips_inch || 0,
        )
      : 0;
    const chest_overall_inch_loss = inch_tracker_updated
      ? latest_chest_inch - initial_chest_inch || 0
      : 0;
    const waist_overall_inch_loss = inch_tracker_updated
      ? latest_waist_inch - initial_waist_inch || 0
      : 0;
    const hip_overall_inch_loss = inch_tracker_updated
      ? latest_hips_inch - initial_hips_inch || 0
      : 0;
    const chest_inch_loss_in_session = inch_tracker_updated
      ? latest_chest_inch - start_chest_inch || 0
      : 0;
    const waist_inch_loss_in_session = inch_tracker_updated
      ? latest_waist_inch - start_waist_inch || 0
      : 0;
    const hip_inch_loss_in_session = inch_tracker_updated
      ? latest_hips_inch - start_hips_inch || 0
      : 0;
    const lostOrGainedOnChestInSession =
      chest_inch_loss_in_session > 0 ? "lost" : "gained";
    const lostOrGainedOnWaistInSession =
      waist_inch_loss_in_session > 0 ? "lost" : "gained";
    const lostOrGainedOnHipsInSession =
      hip_inch_loss_in_session > 0 ? "lost" : "gained";
    const lostOrGainedOnChestOverall =
      chest_overall_inch_loss > 0 ? "lost" : "gained";
    const lostOrGainedOnWaistOverall =
      waist_overall_inch_loss > 0 ? "lost" : "gained";
    const lostOrGainedOnHipsOverall =
      hip_overall_inch_loss > 0 ? "lost" : "gained";
    const overall_loss = inch_tracker_updated
      ? Math.max(
          latest_chest_inch - initial_chest_inch || 0,
          latest_waist_inch - initial_waist_inch || 0,
          latest_hips_inch - initial_hips_inch || 0,
        )
      : 0;

    // Handle older programs
    const older_programs =
      safeJSONParse(results[0]?.completed_programs, []) || [];
    let old_program_data = "";
    older_programs.forEach((program, index) => {
      old_program_data += `${index + 1}. ${
        program.program_name || "Unknown"
      } where you lost ${program.weight_loss_in_program || 0} kg[${
        program.end_program_weight || 0
      } - ${program.start_program_weight || 0}], `;
    });
    if (old_program_data) {
      old_program_data += `& in current one, you have lost ${weight_diff} in a total of ${sent_sessions} sessions.`;
    }

    console
      .log
      // ... (logging remains the same for debugging)
      ();

    let query = "";
    if (weight_diff >= 0.1 && weight_diff <= 0.499 && weight_day == 10) {
      query = `<p>Just saw your <b>weight tracker updates</b>. ${
        mid_session_weight !== "0.000"
          ? `You have lost <b>${weight_diff} kg</b> in the last 5 days & <b>${Number(
              start_session_weight - weight,
            ).toFixed(3)} kg</b> overall in session ${sent_sessions}`
          : `You have lost <b>${weight_diff} kg</b> in this session`
      }.</p>
      <p>In <b>${sent_sessions} sessions</b> so far, you have lost <b>${Number(
        program_start_weight - weight,
      ).toFixed(3)} kg</b>. ${
        pending_session > 0
          ? `We have <b>${pending_session} more sessions</b> pending.`
          : "We have <b>no more sessions</b> of this program pending."
      }</p>`;

      if (weight > 70) {
        query += `<p>I was hoping to see more loss in the current session as per the diet I sent you.</p>`;
      } else {
        query += `<p>I was hoping we'd lose a little more weight but never mind, we'll do better in the next session in terms of the scale :)</p>`;
      }
      query += `<p>Given you are close to your <b>goal weight</b>, this is not as bad as it looks :) We'll do better.</p>
      <p>You now weigh <b>${weight} kg</b> & if we now see your goal, you still have <b>${Number(
        goal_weight - weight,
      ).toFixed(3)} kg</b> to lose. ${
        bmi && earliest_bmi
          ? `Your <b>BMI</b> is <b>${bmi}</b> as against <b>${earliest_bmi}</b> when you started with us. The ideal BMI range is <b>21 to 24.99 kg/m²</b>.</p>`
          : ``
      } `;

      if (!photo_tracker_updated && !inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch & photo trackers</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!photo_tracker_updated) {
        query += `<p>You haven't updated your <b>photo tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker.</p>`;
      }

      if (inch_tracker_updated && !photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip. ${
            session > 1 && overall_loss
              ? `Overall, we see a <b>${lostOrGainedOnChestOverall} of ${chest_overall_inch_loss} inches</b> on the chest & <b>${lostOrGainedOnWaistOverall} of ${waist_overall_inch_loss} inches</b> on the waist so far.`
              : ""
          }</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. ${
            overall_loss > 0
              ? `Overall, you have <b>${lostOrGainedOnWaistOverall} ${waist_overall_inch_loss} inches</b> on the waist & <b>${hip_overall_inch_loss} inches</b> on the hips so far.`
              : ""
          }</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign. ${
            overall_loss > 0
              ? `Overall, you have <b>${lostOrGainedOnWaistOverall} ${waist_overall_inch_loss} inches</b> on the waist & <b>${lostOrGainedOnHipsOverall} ${hip_overall_inch_loss} inches</b> on the hips so far.`
              : "."
          } Are you experiencing feeling lighter? Clothes fitting better?</p>`;
        }
        query += `<p>Can you also update the <b>photo tracker</b> with your recent photo, preferably taken today? <a href="#">Click here</a> to do so. (You will get complete privacy & they won't be shared without your permission)</p>`;
      } else if (inch_tracker_updated && photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip. ${
            session > 1 && overall_loss
              ? `Overall, we see a <b>${lostOrGainedOnChestOverall} of ${chest_overall_inch_loss} inches</b> on the chest & <b>${lostOrGainedOnWaistOverall} of ${waist_overall_inch_loss} inches</b> on the waist so far.`
              : ""
          }</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. ${
            overall_loss > 0
              ? `Overall, you have <b>${lostOrGainedOnWaistOverall} ${waist_overall_inch_loss} inches</b> on the waist & <b>${lostOrGainedOnHipsOverall} ${hip_overall_inch_loss} inches</b> on the hips so far.`
              : "."
          } Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign. ${
            overall_loss > 0
              ? `Overall, you have <b>${lostOrGainedOnWaistOverall} ${waist_overall_inch_loss} inches</b> on the waist & <b>${lostOrGainedOnHipsOverall} ${hip_overall_inch_loss} inches</b> on the hips so far.`
              : "."
          }</p>`;
        }
        query += `<p>I have also seen your <b>photo tracker</b>. If an incorrect one was uploaded, please upload a better one.</p>`;
      }
      query += `
      <p>Were you able to follow all options correctly? What about supplements?</p>
      <p>Did you have any late nights? Any outside meals?</p>
      <p>Any bloating or constipation?</p>
      <p>Have you had a restful sleep most nights for at least 7 hours?</p>
      <p>Did you miss any meal options from the diet & ate other options that you thought were healthy?</p>
      <p>Any grain or cereal you replaced?</p>
      <p>Did you follow the options that were the low carb ones?</p>
      <p>Please help me understand what's not working here. Just answer these questions in detail & I'll see what best can be done in the remaining days we have at hand to get a good result.</p>`;

      if (pending_session <= 3 && no_advance_purchase) {
        const { milestone_achieved, new_goals } = goal_comment;
        if (milestone_achieved?.length > 0) {
          query += `<p>You also achieved a few milestones in this program:</p><ul>`;
          milestone_achieved.forEach((item, index) => {
            query += `<li>${index + 1}. ${
              item.milestone_comment || "Unknown milestone"
            }</li>`;
          });
          query += `</ul>`;
        }
        if (new_goals?.length > 0) {
          query += `<p>Keeping your other goals in mind:</p><ul>`;
          new_goals.forEach((item, index) => {
            query += `<li>${index + 1}. ${
              item.milestone_comment || "Unknown goal"
            }</li>`;
          });
          query += `</ul>`;
        }
      }
      query += `<p>I want you to take a look at <b>60 days / 90 days</b> of our programs. We now have <b>5 calls</b> for every program instead of 3 & also a <b>new e-kit</b> in addition to the existing one.</p>
      <p><a href="#">Take a look</a> at the pitched e-kit or all programs.</p>`;
    } else if (weight_diff >= 0.5 && weight_diff <= 0.999 && weight_day == 10) {
      query += `<p>Hi <b>${user_name}</b>,</p>
      <p>I was just taking a look at your <b>tracker updates</b>. ${
        weight_diff_days === 5
          ? `In the last <b>${weight_diff_days} days</b>, we see you have lost <b>${weight_diff} kg</b>. You have lost <b>${Number(
              start_session_weight - weight,
            ).toFixed(
              3,
            )} kg</b> in this entire session ${sent_sessions}. So this makes it a loss of <b>${Number(
              program_start_weight - weight,
            ).toFixed(3)} kg</b> in this program so far.`
          : ``
      }</p>`;

      if (!photo_tracker_updated && !inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch & photo trackers</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!photo_tracker_updated) {
        query += `<p>You haven't updated your <b>photo tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker.</p>`;
      }

      if (inch_tracker_updated && !photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on

 your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip.</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign.</p>`;
        }
        query += `<p>Can you also update the <b>photo tracker</b> with your recent photo, preferably taken today? <a href="#">Click here</a> to do so. (You will get complete privacy & they won't be shared without your permission)</p>`;
      } else if (inch_tracker_updated && photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip.</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign.</p>`;
        }
        query += `<p>I have also seen your <b>photo tracker</b>. If an incorrect one was uploaded, please upload a better one.</p>`;
      }
      query += `
      <p>While I wait for these updates at your end, why don't you also let me know the following:</p>
      <ul>
        <li>Were you able to follow all options correctly? What about supplements?</li>
        <li>Did you have any late nights? Any outside meals?</li>
        <li>Any bloating or constipation?</li>
        <li>Are you going to be on any travel in the next 10 days? If yes, send me the location & number of days.</li>
        <li>Any meal outings that I must factor in?</li>
        <li>I wanted to send you a diet that is going to need a little pre-prep at your end but at this point in time, we need to... can I?</li>
        <li>Any cravings? I don't promise but can try to add them to the session.</li>
        <li>I wanted you to follow a <b>gluten-free diet</b> for the next 10 days. This is the right time for a break in the monotony :)</li>
        <li>I am planning to send you a diet that will be <b>alkalizing in nature</b>. It is a vegetarian diet free of acidic foods. At this point, it is the ideal fit to give us results.</li>
        <li>I am planning to give you a diet in which you get to have salt only in your main meals (lunch & dinner). You will love the options & at this point in the program, we should be doing so to get results.</li>
        <li>At this point, we need a diet that will give effective results. This diet has <b>2 quick small easy meals (semi-liquids)</b> & <b>1 proper meal</b> option. I am planning on these lines for you.</li>
      </ul>`;
    } else if (weight_diff >= 1 && weight_day == 10) {
      query += `<p>Hi <b>${user_name}</b>,</p>
      <p>I was just taking a look at your <b>tracker updates</b>. In the last <b>${weight_diff_days} days</b>, we see you have lost <b>${weight_diff} kg</b>. You have lost <b>${Number(
        start_session_weight - weight,
      ).toFixed(
        3,
      )} kg</b> in this entire session ${sent_sessions}. So this makes it a loss of <b>${Number(
        program_start_weight - weight,
      ).toFixed(3)} kg</b> in this program so far.</p>`;

      if (!photo_tracker_updated && !inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch & photo trackers</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!photo_tracker_updated) {
        query += `<p>You haven't updated your <b>photo tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker.</p>`;
      }

      if (inch_tracker_updated && !photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip.</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign.</p>`;
        }
        query += `<p>Can you also update the <b>photo tracker</b> with your recent photo, preferably taken today? <a href="#">Click here</a> to do so. (You will get complete privacy & they won't be shared without your permission)</p>`;
      } else if (inch_tracker_updated && photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip.</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign.</p>`;
        }
        query += `<p>I have also seen your <b>photo tracker</b>. If an incorrect one was uploaded, please upload a better one.</p>`;
      }
      query += `<p>While I wait for these updates at your end, why don't you also let me know the following:</p>
      <ul>
        <li>Are you going to be on any travel? If yes, send me the location & number of days.</li>
        <li>Any meal outings that I must factor in?</li>
        <li>I wanted to send you a diet that is going to need a little pre-prep at your end but at this point in time, we need to... can I?</li>
        <li>Any cravings? I don't promise but can try to add them to the session.</li>
        <li>I wanted you to follow a <b>gluten-free diet</b> for the next 10 days. This is the right time for a break in the monotony :)</li>
        <li>I am planning to send you a diet that will be <b>alkalizing in nature</b>. It is a vegetarian diet free of acidic foods. At this point, it is the ideal fit to give us results.</li>
        <li>I am planning to give you a diet in which you get to have salt only in your main meals (lunch & dinner). You will love the options & at this point in the program, we should be doing so to get results.</li>
        <li>At this point, we need a diet that will give effective results. This diet has <b>2 quick small easy meals (semi-liquids)</b> & <b>1 proper meal</b> option. I am going to plan this one for you.</li>
      </ul>`;
    } else if (weight_diff === 0 && weight_day == 10) {
      query += `<p>As per your update, we have lost <b>no weight</b> in the current session ${sent_sessions}. In <b>${
        sent_sessions - 1
      } sessions</b> so far, you have lost <b>${Number(
        program_start_weight - weight,
      ).toFixed(3)} kg</b>. ${
        pending_session > 0
          ? `We have <b>${pending_session} more sessions</b> pending.`
          : "We have <b>no more sessions</b> of this program pending."
      }</p>
      <p>You now weigh <b>${weight} kg</b> & if we now see your goal, you still have <b>${Number(
        goal_weight - weight,
      ).toFixed(3)} kg</b> to lose. ${
        bmi && earliest_bmi
          ? `Your <b>BMI</b> is <b>${bmi}</b> as against <b>${earliest_bmi}</b> when you started with us. The ideal BMI range is <b>21 to 24.99 kg/m²</b>.</p>`
          : ``
      }`;

      if (!photo_tracker_updated && !inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch & photo trackers</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!photo_tracker_updated) {
        query += `<p>You haven't updated your <b>photo tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=47">Click here</a> to update your photo tracker.</p>`;
      } else if (!inch_tracker_updated) {
        query += `<p>You haven't updated your <b>inch tracker</b>. You'll earn a lot of BN Wallet money & it will help me understand the impact of the last session irrespective of the weight. Your diet plan will be more effective as well. <a href="https://www.balancenutrition.in/app_link/screen_id=46">Click here</a> to update your inch tracker.</p>`;
      }

      if (inch_tracker_updated && !photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip.</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign.</p>`;
        }
        query += `<p>Can you also update the <b>photo tracker</b> with your recent photo, preferably taken today? <a href="#">Click here</a> to do so. (You will get complete privacy & they won't be shared without your permission)</p>`;
      } else if (inch_tracker_updated && photo_tracker_updated) {
        if (inch_loss > 0) {
          query += `<p>You also have a good <b>inch loss</b> on your waist & hips. You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inch</b> on the chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inches</b> on the hip.</p>`;
        } else if (inch_loss === 0) {
          query += `<p>You have not lost much on inches in this session. Are your clothes fitting better?</p>`;
        } else if (inch_loss < 0) {
          query += `<p>You have <b>${lostOrGainedOnChestInSession} ${chest_inch_loss_in_session} inches</b> on your chest, <b>${lostOrGainedOnWaistInSession} ${waist_inch_loss_in_session} inch</b> on the waist & <b>${lostOrGainedOnHipsInSession} ${hip_inch_loss_in_session} inch</b> on your hips. This is not a good sign.</p>`;
        }
        query += `<p>I have also seen your <b>photo tracker</b>. If an incorrect one was uploaded, please upload a better one.</p>`;
      }
      query += `<p>While I wait for these updates at your end, why don't you also let me know the following:</p>
      <ul>
        <li>Were you able to follow all options correctly? What about supplements?</li>
        <li>Did you have any late nights? Any outside meals?</li>
        <li>Any bloating or constipation?</li>
        <li>Have you had a restful sleep most nights for at least 7 hours?</li>
      </ul>
      <p>Please help me understand what's not working here. Just answer these questions in detail & I'll see what best can be done in the remaining days we have at hand to get a good result.</p>`;

      if (pending_session <= 3 && no_advance_purchase) {
        const { milestone_achieved, new_goals } = goal_comment;
        if (milestone_achieved?.length > 0) {
          query += `<p>You also achieved a few milestones in this program:</p><ul>`;
          milestone_achieved.forEach((item, index) => {
            query += `<li>${index + 1}. ${
              item.milestone_comment || "Unknown milestone"
            }</li>`;
          });
          query += `</ul>`;
        }
        if (new_goals?.length > 0) {
          query += `<p>Keeping your other goals in mind:</p><ul>`;
          new_goals.forEach((item, index) => {
            query += `<li>${index + 1}. ${
              item.milestone_comment || "Unknown goal"
            }</li>`;
          });
          query += `</ul>`;
        }
      }
      query += `<p>I want you to take a look at <b>60 days / 90 days</b> of our programs. We now have <b>5 calls</b> for every program instead of 3 & also a <b>new e-kit</b> in addition to the existing one.</p>
      <p><a href="#">Take a look</a> at the pitched e-kit or all programs.</p>`;
    } else if (weight_diff < 0) {
      query += `<p>Hi <b>${user_name}</b>,</p>
      <p>As per your last weight update, you have <b>gained ${Math.abs(
        weight_diff,
      )} kg</b> in this session ${sent_sessions} & overall <b>${
        program_start_weight - weight > 0 ? "lost" : "gained"
      } ${Number(Math.abs(program_start_weight - weight)).toFixed(
        3,
      )} kg</b> so far in this program. We now have <b>${pending_session} sessions</b> pending. I was expecting a higher loss given the last diet plan & its effectiveness.</p>`;

      if (Math.abs(weight_diff) <= 0.499) {
        query += `<p>Though the gain is not high, if the diet was followed really well, we could have seen a good loss on the scale.</p>`;
      }
      query += `<p>While I wait for these updates, let me understand if there was anything we could have done better or any other reason:</p>
      <ul>
        <li>Have you followed the diet 100%? If not, what part of the diet was most compromised? Lunch?</li>
        <li>Were there any misses? Mid meals? Supplements?</li>
        <li>How was your sleep the last few days? Slept well for 7-8 hours? Any late nights?</li>
        <li>Was water intake good? Or compromised?</li>
        <li>Are you suffering from constipation or bowels not clear? Feeling bloated? Gassy?</li>
        <li>Any parties you attended or at home where you ate out of the restaurant guide? Alcohol consumption if any?</li>
        <li>If woman: Are you having any PMS symptoms? What about periods?</li>
        <li>If any sessions there: Help me with how the next 10 days are planned out. Can we do a very good session that will get you to lose well on the scale? May need a little effort at your end but worth it :)</li>
      </ul>
      <p>P.S. I would also like to connect with you over a call to understand the reasons for the gain.</p>`;
    }

    if (!no_advance_purchase && pending_session === 0) {
      const { milestone_achieved, new_goals } = goal_comment;
      query += `<p><b>Awesome job ${user_name}!</b></p>
      <p>You have lost <b>${weight_diff} kg</b> in your current session ${sent_sessions} and overall lost <b>${Number(
        program_start_weight - weight,
      ).toFixed(
        3,
      )} kg</b> in this program so far. With this, we have come to an end of this program :)</p>
      <p>Here are a few important updates I want you to take a look at:</p>
      <ul>
        <li>You are still <b>${Number(ideal_weight - weight).toFixed(
          3,
        )} kg</b> away from your ideal weight.</li>
        ${
          bmi
            ? `<li>You need to get your <b>BMI</b> from <b>${bmi} kg/m²</b> to under <b>24 kg/m²</b>.</li>`
            : ""
        }
        ${
          new_goals?.length > 0
            ? `<li>Your goals that we have yet to achieve are: <b>${new_goals
                .map((item) => item.milestone_comment || "Unknown")
                .join(", ")}</b>.</li>`
            : ""
        }
      </ul>
      <p>Keeping these in mind, it's time to now start your next program <b>'ReForm - Intermittent' 90 days</b>. All the features of this program will get you closer to the goals we have planned! To start the program, you will need to select the date. <a href="#">Click here</a> & do so ASAP!</p>`;
    } else if (
      weight_diff === 0 &&
      !no_advance_purchase &&
      pending_session === 0
    ) {
      query += `<p>As per your weight update, we have lost <b>no weight</b> in current session ${sent_sessions}. In <b>${
        session - 1
      } sessions</b> so far, you have lost <b>${Number(
        program_start_weight - weight,
      ).toFixed(
        3,
      )} kg</b> in this program so far. We have <b>no more sessions</b> pending in this program.</p>
      <p>Please help me understand what's not worked here. Just answer these questions in detail & I'll see what best can be done in the remaining days we have at hand to get a good result:</p>
      <ul>
        <li>How was your sleep the last few days? Slept well for 7-8 hours? Any late nights?</li>
        <li>Also, update your <b>inch tracker</b> & <b>photo tracker</b> so I get a sensory evaluation & can visualize the fat loss. (Only if not filled)</li>
      </ul>
      <p>You now weigh <b>${weight} kg</b> & if we now see your goal, you still have <b>${Number(
        goal_weight - weight,
      ).toFixed(3)} kg</b> to lose. ${
        bmi && earliest_bmi
          ? `Your <b>BMI</b> is <b>${bmi}</b> as against <b>${earliest_bmi}</b> when you started with us. The ideal BMI range is <b>21 to 24.99 kg/m²</b>.</p>`
          : ``
      }`;

      const { milestone_achieved, new_goals } = goal_comment;
      if (milestone_achieved?.length > 0) {
        query += `<p>You also achieved a few milestones: <b>${milestone_achieved
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</b> in this program :)</p>`;
      }
      if (new_goals?.length > 0) {
        query += `<p>Our other goals are: <b>${new_goals
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</b>.</p>`;
      }
      query += `<p>Keeping these in mind, it's time to now start your next program <b>'ReForm - Intermittent' 90 days</b>. All the features of this program will get you closer to the goals we have planned! To start the program, you will need to select the date. <a href="#">Click here</a> & do so ASAP!</p>`;
    } else if (
      weight_diff < 0 &&
      !no_advance_purchase &&
      pending_session === 0
    ) {
      query += `<p>As per your weight update, we have <b>gained ${Math.abs(
        weight_diff,
      )} kg</b> in current session ${sent_sessions}. Looks like you are bored of being on a program. This should not be the case. Now you must in fact be extremely charged up & motivated to start your new program!</p>
      <p>We have <b>no more sessions</b> pending in this program.</p>
      <p>Please help me understand what's not worked here. Just answer these questions in detail & I'll see what best can be done in the remaining days we have at hand to get a good result:</p>
      <ul>
        <li>How was your sleep the last few days? Slept well for 7-8 hours? Any late nights?</li>
        <li>Also, update your <b>inch tracker</b> & <b>photo tracker</b> so I get a sensory evaluation & can visualize the fat loss. (Only if not filled)</li>
      </ul>
      <p>You now weigh <b>${weight} kg</b> & if we now see your goal, you still have <b>${Number(
        goal_weight - weight,
      ).toFixed(3)} kg</b> to lose. ${
        bmi && earliest_bmi
          ? `Your <b>BMI</b> is <b>${bmi}</b> as against <b>${earliest_bmi}</b> when you started with us. The ideal BMI range is <b>21 to 24.99 kg/m²</b>.</p>`
          : ``
      }`;

      const { milestone_achieved, new_goals } = goal_comment;
      if (milestone_achieved?.length > 0) {
        query += `<p>You also achieved a few milestones: <b>${milestone_achieved
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</b> in this program :)</p>`;
      }
      if (new_goals?.length > 0) {
        query += `<p>Our other goals are: <b>${new_goals
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</b>.</p>`;
      }
      query += `<p>Keeping these in mind, it's time to now start your next program <b>'${
        results[0]?.advance_program_name || "ReForm - Intermittent"
      }' ${
        results[0]?.advance_program_duration || 90
      }</b>. All the features of this program will get you closer to the goals we have planned! To start the program, you will need to select the date. <a href="#">Click here</a> & do so ASAP!</p>`;
    } else if (pending_session === 0 && no_advance_purchase) {
      query += `<p>Hello <b>${user_name}</b>,</p>`;
      if (weight_diff >= 0.1 && weight_diff <= 0.899) {
        query += `<p>You have lost <b>${weight_diff} kg</b> in this session. You now have <b>0 sessions</b> pending.</p>`;
      } else if (weight_diff > 1) {
        query += `<p>You have lost <b>${weight_diff} kg</b> in this session! That's great :)</p>`;
      } else if (weight_diff === 0) {
        query += `<p>Oh, we haven't lost any weight in this session. Were you not following the diet of this session? Getting bored as they were the last few days? This leaves us with <b>no pending sessions</b> for this program.</p>`;
      } else if (weight_diff < 0) {
        query += `<p>Oh, there is a <b>gain of ${Math.abs(
          weight_diff,
        )} kg</b> in this session. Were you not able to follow the diet? Not lost despite following well? Are you getting bored the last few days of diet?</p>`;
      }
      query += `
      <p><b>HERE IS YOUR PROGRAM PROGRESS REPORT: NO ADVANCE PURCHASE</b></p>
      <p><b>PROGRAM:</b> ${program_name} ${program_duration}</p>
      <p><b>DAYS TAKEN:</b> ${
        total_days_taken > program_validity
          ? `<span style="color:red;">${total_days_taken}</span>`
          : `${total_days_taken}`
      }</p>
      <p><b>WEIGHT LOST:</b> ${Number(program_start_weight - weight).toFixed(
        3,
      )} kg</p>`;

      const { milestone_achieved, new_goals, goals_achieved } = goal_comment;
      if (milestone_achieved?.length > 0) {
        query += `<p><b>MILESTONES ACHIEVED:</b> ${milestone_achieved
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</p>`;
      }
      if (goals_achieved?.length > 0) {
        query += `<p><b>GOALS ACHIEVED:</b> ${goals_achieved
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</p>`;
      }
      if (
        earliest_health_score < latest_health_score &&
        earliest_health_score &&
        latest_health_score
      ) {
        query += `<p><b>HEALTH SCORE IMPROVEMENT:</b> from ${earliest_health_score} to ${latest_health_score}</p>`;
      }
      query += `<p>Your mentor will provide feedback on how you did in this program.</p>
      <p>You now weigh <b>${weight} kg</b> & if we now see your goal, you still have <b>${Number(
        goal_weight - weight,
      ).toFixed(3)} kg</b> to lose. ${
        bmi && earliest_bmi
          ? `Your <b>BMI</b> is <b>${bmi}</b> as against <b>${earliest_bmi}</b> when you started with us. However, the normal BMI is under <b>24.5 kg/m²</b>.</p>`
          : ``
      }`;

      if (new_goals?.length > 0) {
        query += `<p>Your new goals being <b>${new_goals
          .map((item) => item.milestone_comment || "Unknown")
          .join(", ")}</b> are still to be worked on as well.</p>`;
      }
      query += `< over a call to understand the reasons for the gain.</p>`;
    } else if (pending_session === 1 && no_advance_purchase) {
      query += `<p>Hello <b>${user_name}</b>,</p>`;
      if (weight_diff >= 0.1 && weight_diff <= 0.899) {
        query += `<p>You have lost <b>${weight_diff} kg</b> in this session. You now have <b>${pending_session} session</b> pending.</p>`;
      } else if (weight_diff > 1) {
        query += `<p>You have lost <b>${weight_diff} kg</b> in this session! That's great :)</p>`;
      } else if (weight_diff === 0) {
        query += `<p>Oh, we haven't lost any weight in this session. Were you not following the diet of this session? Getting bored as they were the last few days? This leaves us with <b>${pending_session} session</b> pending.</p>`;
      } else if (weight_diff < 0) {
        query += `<p>Oh, there is a <b>gain of ${Math.abs(
          weight_diff,
        )} kg</b> in this session. Were you not able to follow the diet? Not lost despite following well? Are you getting bored the last few days of diet?</p>`;
      }
      if ((results[0]?.program_number || 0) > 2 && older_programs.length > 0) {
        query += `<p>You started your journey with Balance Nutrition <b>${days_since_joining} days ago</b> & ${old_program_data}.</p>`;
      }
      query += `<p><b>${user_name}</b>, losing <b>${Number(
        results[0]?.weight_loss || 0,
      ).toFixed(
        3,
      )} kg</b> (total weight loss), irrespective of whatever time has taken, is something you have to be very proud about!</p>
      <p><span style="color:red;">Weight loss is hard to maintain, see our lives, see what all we have to go through day after day. We need to remain focused, motivated & ensure we stick to a routine that helps us. We can't be perfect each time with each diet. When we let loose, that is when we don't see the scale moving.</span></p>
      <p><b>9 sessions</b> of <a href="#">Intermittent Fasting</a>, <a href="#">Plateau Breaker</a>, <a href="#">ReNeU</a>, <a href="#">Body Transformation</a>, <a href="#">Weight Loss Pro</a>, will work fantastic for you. I had told you when you began the program that this can be your permanent friend. This is also easier to maintain & you won't come to us again after you see <b>ideal weight</b> as we will stabilize your metabolism.</p>
      <p>Click on the program links above & you can see the <b>Client Exclusive Offer</b> also currently going on. Do write back to me & we shall discuss more on this.</p>`;
    }
    console.log(query, 3288);
    const addAutoDraftResponse = await addAutoDraftedQuery({
      query,
      mentor_id: mentor_id,
      user_id: user_id,
    });
  } catch (error) {
    console.log(error);
  }
}
async function addAutoDraftForWeightUpdateFifthDay({
  user_id,
  weight_day,
  weight,
  session,
  mentor_id,
}) {
  console.log(user_id, weight_day, weight, session, mentor_id, 3304);
  try {
    let query = "";
    const { results } = await readRecord({
      selectFields: [
        "dsl.start_session_weight",
        "dsl.mid_session_weight",
        "cd.first_name",
        "wr.posted_date",
        "dsl.diet_start_date + INTERVAL 10 DAY AS end_session_date",
        "dsl.diet_start_date",
        "sop.start_program_weight",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
            SELECT wr1.*
            FROM ${tables.weightRecords} wr1
            INNER JOIN (
              SELECT user_id, MAX(posted_date) AS max_posted_date
              FROM ${tables.weightRecords}
              GROUP BY user_id
            ) latest ON wr1.user_id = latest.user_id AND wr1.posted_date = latest.max_posted_date
          ) wr`,
          on: `cd.user_id = wr.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "wr.diet_id = dsl.diet_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });

    const data = results[0];
    const weight_diff = data.start_session_weight - weight;
    const abs_loss = Math.abs(weight_diff);
    const endDateFormatted = moment(data.end_session_date).format(
      "Do MMM YYYY",
    );
    console.log(data, 3345);
    console.log(abs_loss, weight_diff, endDateFormatted, 3346);
    if (weight_day == 5 && abs_loss <= 0.399 && weight_diff > 0) {
      query += `<p>Hi ${data.first_name}, </p>
        <p>While I address your queries if any in a while, let me first address your weight update.</p>
        <p>In 5 days of session ${session}, you have lost only ${abs_loss.toFixed(
          2,
        )} kg.</p>
        <p>I was expecting a higher loss given the diet plan I made & its effectiveness.</p>
        <p>There is little reason to not see a loss.</p>
        <p>Were there any deviations in following this?</p>
        <p>Also, how well have you been sleeping this week? Any changes in that?</p>
        <p>Also, did you visit the loo & then weigh in?</p>
        <p>Are you feeling lighter?</p>
        <p>Are your clothes fitting a little better?</p>
        <p>I wanted to know if you are bloated.</p>
        <p>I also want to know how are the next 5 days going to be.</p>
        <p>Will you be following the session well?</p>
        <p>If you have any planned outings, dinners, or other plans, do update me. I can send you some tips too.</p>
        <p>Please do write back to me if there is anything I need to be aware of as well with regard to your meals last 5 days.</p>
        <p><b>P.S. Sending me regular images of your meals, even your on-rising & bedtime supplements helps me identify minor errors you may be making in plating or portioning. So do send them.</b></p>
        <p><b>P.P.S Your end session weight is due on: ${endDateFormatted}, you shall get a notification for the same too.</b></p>`;
    } else if (
      weight_day == 5 &&
      abs_loss > 0.399 &&
      abs_loss <= 1.99 &&
      weight_diff > 0
    ) {
      if (abs_loss <= 1.0) {
        query += `<p>Hi ${data.first_name},</p>
          <p>While I address your queries if any in a while, let me address your weight tracker update. You have lost ${abs_loss.toFixed(
            2,
          )} kg in 5 days in your current session ${session}. This is good progress (MENTOR TO DECIDE IF GOOD OR NOT AND EDIT AND ADD TEXTS). So our total loss so far is ${Number(
            data.start_program_weight - weight,
          ).toFixed(2)} kg.</p>
          <p>IF NOT GOOD LOSS BASED ON WEIGHT, THEN USE THESE. EDIT SMARTLY </p>
          <p>Were there any deviations from the diet we planned? Have you tried the low-carb / salt-free healthy lunch/dinner options we have added to this session? If yes, for how many days did you try them. I would also be happy to receive images of your meals, it allows us to correct even the minor mistakes which you may not be noticing. </p>
          <p>If there are any deviations going to happen that you have not mentioned to me yet, or any outside meals in the rest half of the session, do let me know what are those going to be. We can then plan them smartly. </p>
          <p>Lastly, for the next 5 days, please follow the low-carb/salt-free option for dinner.</p>
          <p>The option is mentioned under the 1st/2nd/3rd Lunch/ dinner that has MENTION THE MENU PL </p>
          <p><b>P.S. Your End Session Weight Update is due on: ${endDateFormatted}</b></p>`;
      } else {
        query += `<p>Hi ${data.first_name},</p>
          <p>While I address your queries if any in a while, let me address your weight tracker update.</p>
          <p>Congratulations! You have lost ${abs_loss.toFixed(
            2,
          )} kg in 5 days in your current session ${session}. This is good progress. So our total loss so far is ${Number(
            data.start_program_weight - weight,
          ).toFixed(2)} kg.</p>
          <p>We still have 5 days more of this diet to be followed. In case you have any queries, do not hesitate to contact me :)</p>
          <p>If there are any deviations going to happen that you have not mentioned to me yet, or any outside meals in the rest half of the session, do let me know what are those going to be. We can then plan those meals accordingly.</p>
          <p><b>P.S. Your End Session Weight Update is due on: ${endDateFormatted}</b></p>`;
      }
    }
    console.log(query, 3394);
    const addAutoDraftResponse = await addAutoDraftedQuery({
      mentor_id,
      query,
      user_id,
    });
  } catch (error) {
    console.log(error);
  }
}
async function addWeightAutoChat({
  weight_day,
  user_id,
  weight,
  session,
  mentor_id,
  diet_id,
  type = weight_day === 5 ? "mid" : "end",
}) {
  try {
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.dietSessionLog} dsl`,
      conditions: [{ field: "dsl.diet_id", operator: "=", value: diet_id }],
    });
    const dietData = results[0];
    const { results: clientData } = await readRecord({
      selectFields: ["cd.first_name", "ad.first_name as mentor_name"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    const clientDetails = clientData[0];
    const prevWeight =
      weight_day === 5
        ? dietData?.start_session_weight
        : dietData?.mid_session_weight != 0
          ? dietData?.mid_session_weight
          : dietData?.start_session_weight;
    const difference = dietData?.start_session_weight - weight;
    const daysAgo =
      weight_day === 5
        ? 5
        : weight_day === 10 && dietData?.mid_session_weight != 0
          ? 5
          : 10;
    console.log(difference, prevWeight, weight, daysAgo, clientData, 3448);
    let weightLossLine = "";
    if (difference >= 5) {
      return;
    }
    if (difference > 0) {
      weightLossLine =
        type === "end"
          ? `As per that you have lost ${Math.abs(difference).toFixed(
              2,
            )} kg in this session.`
          : `You have lost ${Math.abs(difference).toFixed(2)} kg in 5 days.`;
    } else if (difference < 0) {
      weightLossLine =
        type === "end"
          ? `As per that you have gained ${Math.abs(difference).toFixed(
              2,
            )} kg in this session.`
          : `You have gained ${Math.abs(difference).toFixed(2)} kg in 5 days.`;
    } else {
      weightLossLine =
        type === "end"
          ? "As per that you haven't lost any weight in this."
          : "You haven't lost any weight in 5 days.";
    }

    const suffixes = ["th", "st", "nd", "rd"];
    const suffix =
      session % 10 <= 3 &&
      session % 10 !== 0 &&
      !(session >= 11 && session <= 13)
        ? suffixes[session % 10]
        : "th";

    let messageBody = "";
    if (type === "end") {
      messageBody = `
            <p>Hi ${clientDetails.first_name},</p>
            <p>I have received your end-session weight update for the ${session}${suffix} session.</p>
            <p>Your last weight recorded with us was ${prevWeight} kg (${daysAgo} days ago).</p>
            <p>${weightLossLine}</p>
            <p>While I check all other details & get back to you, please share any of your concerns, queries, or considerations for the next session.</p>
            <p><b>P.S.</b> Please share any leftover super foods, teas & supplements you have from your previous sessions. I shall try & add them to your next diet plan :)</p>
            <p>In case you have not filled your Inch loss tracker, please <a href='https://www.balancenutrition.in/app_link/screen_id=46'>click here</a> to fill it.</p>
            <p>The same about the photo tracker, please <a href='https://www.balancenutrition.in/app_link/screen_id=47'>click here</a> to fill it.</p>
        `;
    } else {
      messageBody = `
            <p>Hi ${clientDetails.first_name},</p>
            <p>We have received your Mid-Session weight update.</p>
            <p>${weightLossLine}</p>
            <p>While I take a look at all other parameters, let me know which options you chose from the diet shared?</p>
            <p>If you have any considerations, queries, or remarks, please send them to me. I shall be happy to add them to my detailed revert.</p>
        `;
    }
    console.log(messageBody, 3498);
    const insertChat = await clientEnquiry.create({
      user_id: user_id,
      name: clientDetails.first_name,
      query: messageBody,
      mentor_id: mentor_id,
      sender: "mentor",
      type: "broadcast",
    });
    if (insertChat) {
      return { status: true, message: "Auto chat added successfully" };
    }
  } catch (error) {
    console.log(error);
    return { status: false, message: "Error in adding auto chat" };
  }
}

const mapUserTableData = ({
  user,
  details,
  addFields = {},
  extraMappings = {},
}) => {
  console.log(details, 3301);
  const mappedData = {
    user_details: {
      user_name: details.client_name || null,
      email_id: details.client_email || null,
      phone_number: details.client_phone || null,
      program_number: details.client_program_count,
      wallet: details.client_wallet || null,
      user_status: details.sub_user_status || null,
    },
    program_details: {
      name:
        `${details.current_program_name} (${details.current_program_duration})` ||
        null,
      mrp: details.current_program_mrp || null,
      paid: details.current_program_amount || null,
      Ssn: `(${details.current_program_sent_sessions}/${details.current_program_total_sessions})`,
      crm_user: details.mentor_assigned,
      advance_program_count: details.client_advance_program_count,
      current_program_name_days: details.current_program_name_days || null,
    },
    suggested_program_details: {
      suggested_program_id: details.suggested_program_id || null,
      name:
        `${details.suggested_program_name} (${details.suggested_program_days})` ||
        null,
      mrp: details.suggested_program_mrp || null,
      "Sugg. Amt.": details.suggested_amount || null,
      suggested_date: details.suggested_at,
      suggested_days_ago: `(${details.suggested_days_ago} Days ago)`,
    },
  };
  const weight_details_object = {
    // start_program_weight: details.program_start_weight || null,
    // latest_weight: details.client_latest_weight || null,
    // goal_weight: details.goal_weight || null,
    // height: details.client_height || null,
    weight: `${details.client_latest_weight} kg` || null,
    // days_ago: moment(details.client_latest_weight_date).fromNow() || null,
    "date_&_time":
      moment(details.client_latest_weight_date).format(
        "MMMM D, YYYY [at] hh:mm A",
      ) || null,
    // ...(details.client_weight_difference > 0
    //   ? { gained_weight: details.client_weight_difference }
    //   : { lost_weight: details.client_weight_difference }),
  };
  const health_score_details_objects = {
    health_score: details.client_latest_health_score || null,
    ibw: details.client_latest_ibw || null,
    bmi: details.client_latest_bmi || null,
    health_category: details.client_latest_health_category || null,
  };
  if (addFields.weight_details) {
    console.log(addFields.weight_details, 1543);
    for (const key in weight_details_object) {
      mappedData[key] = weight_details_object[key];
    }
  }
  if (addFields.health_score) {
    mappedData.health_score_details = health_score_details_objects;
  }
  // Dynamically add extra mappings
  Object.assign(mappedData, extraMappings);

  return mappedData;
};

function generateCartTable(cartItems = [], updatedDate = "") {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return `<td><strong style="color:red;">No items in cart</strong></td>`;
  }

  let rows = "";

  cartItems.forEach((item) => {
    rows += `
      <tr>
        <td style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">
          <img src="${item.image}" width="50">
        </td>

        <td style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">
          ${item.product_name}<br>
          <small style="color:#555;">Code: ${item.product_code}</small>
        </td>

        <td style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">
          ${item.quantity}
        </td>

        <td style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">
          ₹${item.total_price}
        </td>
      </tr>
    `;
  });

  return `
    <td>
      <table style="width:100%; border:1px solid #ccc; border-collapse:collapse;">
        <tr style="background:#f9f9f9;">
          <th style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">Image</th>
          <th style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">Product</th>
          <th style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">Qty</th>
          <th style="border:1px solid #ddd; padding:6px; text-align:center; vertical-align:middle;">Price</th>
        </tr>

        ${rows}
      </table>

      <div style="margin-top:8px; text-align:center;">
        <strong>Last Added Date:</strong> ${updatedDate}
      </div>
    </td>
  `;
}

function generateHorizontalUserTable(users) {
  const flattenSection = (section, sectionName = "") => {
    const suggested_date = moment(section?.suggested_date);
    const startOfMonth = moment().startOf("month");

    if (
      sectionName === "suggested_program_details" &&
      (section?.suggested_program_id == null ||
        suggested_date.isBefore(startOfMonth))
    ) {
      return `<strong style="color:red;">No programs suggested</strong>`;
    }
    if (sectionName === "program_details") {
      section.mrp = `${section.mrp}, <strong>Paid:</strong> ${
        section.paid ? section.paid : "0"
      }`;
      section.name = section.current_program_name_days;
      section.mentor = section.crm_user;
      delete section.crm_user;
      delete section.current_program_name_days;
      delete section.paid;
    }
    return Object.entries(section || {})
      .map(([key, value]) => {
        let displayKey = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        if (sectionName === "user_details") {
          if (key === "program_number" || key === "wallet") {
            return `<strong>${
              key === "program_number" ? "Pgr. No." : "Wallet"
            }:</strong> ${value ?? "-"}`;
          }
          return `${value ?? "-"}`;
        }
        if (sectionName === "call_details") {
          if (key === "appointment_slots") {
            return `<strong>Time Slot:</strong> ${value ?? "-"}`;
          }
        }
        if (key === "advance_program_count") {
          return value > 0
            ? `<strong style="color:green;">Client has ${value} adv purchase </strong>`
            : `<strong style="color:red;">Client has no advance purchase </strong>`;
        }

        return `<strong>${displayKey}:</strong> ${value ?? "-"}`;
      })
      .join("<br>");
  };

  // Get dynamic extra field names
  const extraFieldNames = new Set();

  users.forEach((user) => {
    Object.keys(user).forEach((key) => {
      if (
        ![
          "user_details",
          "program_details",
          "suggested_program_details",
        ].includes(key)
      ) {
        extraFieldNames.add(key);
      }
    });
  });

  let html = `
    <div style="overflow-x:auto;">
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; min-width: 600px;">
        <thead style="background-color:#f2f2f2;">
          <tr>
            <th>User Details</th>
            <th>Program Details</th>
            <th>Suggested Program Details</th>`;

  // Add dynamic headers
  extraFieldNames.forEach((fieldName) => {
    if (fieldName === "cart_details") {
      html += `<th>Cart Details</th>`;
    } else if (fieldName === "hamper_details") {
      html += `<th>Hamper Details</th>`;
    } else {
      html += `<th>${fieldName.replace(/_/g, " ")}</th>`;
    }
  });

  html += `
          </tr>
        </thead>
        <tbody>`;

  users.forEach((user) => {
    let highlightRow = "";
    if (user.cart_details) {
      const isToday = moment(user.cart_details.last_added_date).isSame(
        moment(),
        "day",
      );
      if (isToday) {
        highlightRow = 'style="background:#e6f4ff;"'; // Light green background for today's cart updates
      }
    }
    if (user.hamper_details) {
      // let highlightRow = false;
      const isToday = moment(user.hamper_details.delivery_date).isSame(
        moment(),
        "day",
      );
      if (isToday) {
        highlightRow = 'style="background:#e6f4ff;"'; // Light green background for today's hamper delivery
      }
    }
    html += `<tr ${highlightRow}>
      <td>${flattenSection(user.user_details, "user_details")}</td>
      <td>${flattenSection(user.program_details, "program_details")}</td>
      <td>${flattenSection(
        user.suggested_program_details,
        "suggested_program_details",
      )}</td>`;

    // Add dynamic fields content
    extraFieldNames.forEach((fieldName) => {
      const value = user[fieldName];

      // ⭐ SPECIAL CASE: cart_details — use the custom cart table
      if (fieldName === "cart_details") {
        console.log(value, 3922);
        const cartItems = safeJSONParse(value?.cart_items) || [];
        const lastAddedDate = value?.last_added_date || "-";
        const formattedDate = lastAddedDate
          ? `${moment(lastAddedDate).format(
              "ddd MMM DD YYYY HH:mm:ss",
            )} (${moment(lastAddedDate).fromNow()})`
          : "-";
        html += generateCartTable(cartItems, formattedDate);
        return;
      }

      // Default handling
      if (typeof value === "object" && value !== null) {
        html += `<td>${flattenSection(value, fieldName)}</td>`;
      } else {
        html += `<td>${value ?? "-"}</td>`;
      }
    });

    html += `</tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>`;

  return html;
}

async function insertOrderLog({ user_id, order_id, amount, src, payment_for }) {
  try {
    const columns = ["user_id", "order_id", "amount", "payment_for", "src"];
    const values = [user_id, order_id, amount, payment_for, src];
    const insertResult = await insertRecord(tables.orderLogs, columns, values);
    if (insertResult.insertId) {
      return { status: true, message: "Order log added successfully" };
    }
    return { status: false, message: "Failed to add order log" };
  } catch (error) {
    console.log("Error in addOrderLog:", 3804, error);
    return { status: false, message: "Error in adding order log" };
  }
}

async function acknowledgeLeadFeedback({ id, mentor_id }) {
  try {
    const updateResult = await updateRecord(
      tables.leadFeedback,
      {
        is_ack: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { id: id },
    );
    if (updateResult.affectedRows > 0) {
      return { status: true, message: "Feedback acknowledged successfully" };
    }
    return { status: false, message: "Failed to acknowledge feedback" };
  } catch (error) {
    console.log("Error in acknowledgeFeedback:", error);
    return { status: false, message: "Internal server error" };
  }
}

async function acknowledgeLeadWeight({ id, mentor_id }) {
  try {
    const updateResult = await updateRecord(
      tables.weightRecordsLead,
      {
        weight_acknowledge: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { id: id },
    );
    if (updateResult.affectedRows > 0) {
      return { status: true, message: "Weight acknowledged successfully" };
    }
    return { status: false, message: "Failed to acknowledge weight" };
  } catch (error) {
    console.log("Error in acknowledgeLeadWeight:", error);
    return { status: false, message: "Internal server error" };
  }
}

async function acknowledgeLeadMilestone({ id, mentor_id }) {
  try {
    const updateResult = await updateRecord(
      tables.userMilestones,
      {
        is_ack: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { milestone_id: id },
    );
    if (updateResult.affectedRows > 0) {
      return { status: true, message: "Milestone acknowledged successfully" };
    }
    return { status: false, message: "Failed to acknowledge milestone" };
  } catch (error) {
    console.log("Error in acknowledgeMilestone:", error);
    return { status: false, message: "Internal server error" };
  }
}

async function acknowledgeAdditionalQuestions({ id, mentor_id }) {
  try {
    const updateResult = await updateRecord(
      tables.additionalQuestions,
      {
        is_ack: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      {
        id: id,
      },
    );
    if (updateResult.affectedRows > 0) {
      return {
        status: true,
        message: "Additional questions acknowledged successfully",
      };
    }
    return {
      status: false,
      message: "Failed to acknowledge additional questions",
    };
  } catch (error) {
    console.log("Error in acknowledgeAdditionalQuestions:", error);
    return { status: false, message: "Internal server error" };
  }
}

async function acknowledgeLeadPhotoTracker({ id, mentor_id }) {
  try {
    const updateResult = await updateRecord(
      tables.leadPhotoRecords,
      {
        photo_acknowledge: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      {
        photo_id: id,
      },
    );
    if (updateResult.affectedRows > 0) {
      return {
        status: true,
        message: "Lead photo acknowledged successfully",
      };
    }
    return {
      status: false,
      message: "Failed to acknowledge lead photo",
    };
  } catch (error) {
    console.log("Error in acknowledgeLeadPhotoTracker:", error);
    return { status: false, message: "Internal server error" };
  }
}

async function insertUserVisitLog({ user_id, page, meta_data }) {
  try {
    const isDevOrTest =
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

    const userVisitLog = new UserVisitLog({
      user_id,
      page,
      meta_data,
      ...(isDevOrTest && {
        expireAt: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10 hours from now
      }),
    });

    await userVisitLog.save();
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.counsellor_assigned",
        "cd.mentor_assigned",
        "CONCAT(COALESCE(cd.first_name, ''), ' ', COALESCE(cd.last_name, '')) AS name",
        "cd.user_type",
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    // console.log(userDetails);
    if (userDetails.length > 0) {
      let mentor_id;
      if (Number(userDetails[0].user_type) === 0) {
        mentor_id = userDetails[0].counsellor_assigned;
      } else if (Number(userDetails[0].user_type) === 1) {
        mentor_id = userDetails[0].mentor_assigned;
      }
      if (mentor_id) {
        sendSSEEvent({
          mentor_id,
          data: {
            title: `${userDetails[0].name} is on ${page}`,
            priority: 3,
          },
        });
      }
      // console.log(userDetails[0].name,5402);
    }
    return { status: true, message: "User visit log added successfully" };
  } catch (error) {
    console.error("Error in insertUserVisitLog:", error);
    return { status: false, message: "Internal server error" };
  }
}

function fixedDecimal(num, decimalPlaces = 0, fallback = 0) {
  if (isNaN(num)) {
    return fallback;
  }
  return Number.parseFloat(num).toFixed(decimalPlaces);
}

async function insertContentUsageLog({ id, platform, content_type }) {
  try {
    const usageLog = new ContentUsageLog({
      content_id: id,
      platform,
      content_type,
    });
    await usageLog.save();
    return { status: true, message: "Content usage log inserted successfully" };
  } catch (error) {
    console.log("Error in insertContentUsageLog:", error);
    return { status: false, message: "Internal server error" };
  }
}

function getQueryTimeRange() {
  const IST_OFFSET = 5 * 60 + 30; // IST = UTC + 5:30

  // Convert IST components directly to UTC Date
  function ISTtoUTC(year, month, day, hour, minute, second = 0, ms = 0) {
    // month is 0-indexed
    const utcTime = Date.UTC(
      year,
      month,
      day,
      hour - 5,
      minute - 30,
      second,
      ms,
    );
    return new Date(utcTime);
  }

  // Get current IST
  const nowUTC = new Date();
  const nowIST = new Date(nowUTC.getTime() + IST_OFFSET * 60000);

  const year = nowIST.getUTCFullYear();
  const month = nowIST.getUTCMonth();
  const day = nowIST.getUTCDate();
  const dayOfWeek = nowIST.getUTCDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

  // START TIME
  let start_time;
  if (dayOfWeek === 1) {
    // Monday → Saturday 7 PM IST
    const startDate = new Date(nowIST);
    startDate.setUTCDate(startDate.getUTCDate() - 2); // Saturday
    start_time = ISTtoUTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
      19, // 7 PM IST
      0,
    );
  } else {
    // Other days → Yesterday 7 PM IST
    const startDate = new Date(nowIST);
    startDate.setUTCDate(startDate.getUTCDate() - 1); // Yesterday
    start_time = ISTtoUTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
      19, // 7 PM IST
      0,
    );
  }

  // END TIME → Today 10 AM IST
  let end_time = ISTtoUTC(year, month, day, 10, 0);

  // If now IST < 10 AM, set end_time = nowIST in UTC
  if (nowIST < end_time) {
    end_time = new Date(nowUTC.getTime()); // now in UTC
  }

  return { start_time, end_time };
}
export {
  acknowledgeLeadFeedback,
  acknowledgeLeadWeight,
  acknowledgeLeadMilestone,
  acknowledgeLeadPhotoTracker,
  acknowledgeAdditionalQuestions,
  advancePurchaseUtils,
  calculateAge,
  calculateBMI,
  calculateIdealWeight,
  calculateTotalHealthScore,
  compareVersions,
  containsNull,
  extractVariables,
  fetchScheduledNotifications,
  fetchUserDetailsDynamic,
  fetchUsersDetails,
  fetchUsersDetailsNew,
  getPageVisitHistory,
  generateUserIdsAndOrderById,
  getAllClients,
  getClientData,
  getQueryTimeRange,
  getUsersForNotification,
  mapUserData,
  processHeight,
  processWeight,
  rangeFormatter,
  replacePlaceholders,
  readRecordNewForLead,
  selectMap,
  joinsMap,
  withMap,
  mapLeadData,
  addAmountWallet,
  addAutoDraftForWeightUpdate,
  addAutoDraftForWeightUpdateFifthDay,
  mapUserTableData,
  generateHorizontalUserTable,
  PrevPurchaseUtils,
  addWeightAutoChat,
  getPreviousInchTracker,
  getInchTracker,
  getPhotoTracker,
  getCommonSelectFields,
  getCommonJoins,
  getGoalData,
  insertOrderLog,
  mapLeadDataNew,
  mapOCData,
  getCommonSelectFieldsOC,
  getCommonJoinsOC,
  insertUserVisitLog,
  fixedDecimal,
  insertContentUsageLog,
};
