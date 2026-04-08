import moment from "moment";
import axios from "axios";
import { readPool, writePool } from "../../config/dbConnection.js";
import { FCM } from "../../config/firebaseConfig.js";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import {
  PrevPurchaseUtils,
  advancePurchaseUtils,
  calculateAge,
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  mapUserData,
} from "../../helper/common.js";
import { app_versions, tables } from "../../helper/constant.js";
import dietDetails from "../../models/dietDetailsModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { addStatusLogNew } from "../salesDashboardControllers/leadsController.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { spinToWinWhatsappDraft } from "../common.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { sendSSEEvent } from "../dashboardNotificationController.js";
import {
  createPaymentLink,
  verifyRazorpaySignature,
} from "../../utils/createPaymentLink.js";
import userNotification from "../../models/userNotificationModel.js";
import ejs from "ejs";
import path from "path";
import { request } from "http";
import { uploadArrayOfFilesToCloudinary } from "../uploadSingleImage.js";

const fcm = new FCM();
const searchClients = async (req, res, next) => {
  const { search } = req.query;
  if (!search) {
    return next(new ErrorHandler("No search query provided", 400));
  }
  const selectFields = [
    "cd.email_id",
    "cd.user_id",
    "CONCAT(cd.first_name,' ', cd.last_name) as full_name",
    "CASE WHEN cd.phone_code NOT IN ('0') THEN CONCAT(cd.phone_code, ' ', cd.phone_number) ELSE cd.phone END AS client_phone",
  ];
  try {
    const { results: clients } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: selectFields,
      search: {
        searchQuery: search,
        searchFields: [
          "cd.user_id",
          "CONCAT(cd.first_name,' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
    });
    if (!clients) {
      return next(new ErrorHandler("No clients found", 404));
    }
    if (clients.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Client fetched successfully",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client fetched successfully",
      data: clients,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getSingleClientByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("user_id Not provided", 400));

    const { results: assessmentLatest } = await readRecord({
      selectFields: ["*"],
      table: `${tables.assessment} ass`,
      conditions: [
        { field: "ass.user_id", operator: "=", value: user_id },
        { field: "ass.completion_status", operator: "=", value: 2 },
      ],
      orderBy: ["ass.added_date DESC"],
      pagination: {
        limit: 1,
        page: 1,
      },
    });

    let has_pregnancy_post_data = false;

    const userAssessmentDetails = assessmentLatest[0];
    const selectFields = [
      "ud.user_id",
      "ud.old_user_id",
      "CONCAT(ud.first_name, ' ', ud.last_name) AS full_name",
      "ud.first_name",
      "ud.last_name",
      "ud.phone",
      "ud.email_id",
      "ud.phone_number",
      "ud.phone_code",
      "ud.ethnicity",
      "ud.plain_password",
      "ud.country_id",
      "ud.state_id",
      "ud.city_id",
      "ud.gender",
      "ud.device",
      "ud.os",
      "ud.model",
      "ud.vip",
      "ud.app_version",
      "ud.user_status",
      "ud.sub_user_status",
      "ud.otp",
      "ud.wati",
      "ud.latest_weight",
      "ud.old_wallet",
      "ad.call_link",
      "ud.pro_notification",
      "ud.ask_diet",
      "ud.daily_fu",
      "ud.last_screen_visited",
      "ud.current_screen",
      // "ud.free_hamper",
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
    AND po.sub_order_id = ud.active_order_id
    AND po.brand = 'kilobeaters'
    AND po.user_id = ud.user_id
  ORDER BY po.order_id DESC
  LIMIT 1
) AS hamper_status`,
 `COALESCE(
  (
    SELECT 
      concat("BN-Smart Scale (Purchased) - ",upper(po.payment_method))
    FROM ${tables.productOrders} po
    WHERE po.payment_status = 'Success'
      AND po.user_id = ud.user_id
      AND po.product_id = 'bn-bodyscan-smart-scale'
    ORDER BY po.order_id DESC
    LIMIT 1
  ),
  "Not Purchased BN-Smart Scale"
) AS scale_status`,
      "COALESCE(countries.country_name, apd_countries.country_name) AS country_name",
      "COALESCE(states.state_name, apd_states.state_name) AS state_name",
      "COALESCE(city.city_name, apd_cities.city_name) AS city_name",
      `(SELECT ad1.crm_user FROM ${tables.adminUsers} ad1 WHERE ad1.admin_user_id = ud.old_mentor_assigned) AS old_mentor_name`,
      "(SELECT COUNT(diet_id) FROM `diet_session_log` WHERE diet_name LIKE '%Auto Closed By System%' and sub_order_id=ud.active_order_id) as dropout_count",
      "ud.active_order_id",
      "pm.program_id",
      "pm.program_name",
      "pm.program_category",
      "ps.ask_imf_window",
      "ps.validity",
      "sop.mrp",
      "ad.crm_user AS mentor_assigned_name",
      "ad.admin_user_id AS mentor_assigned_id",
      "ad.official_phone",
      "sop.balance_amount",
      "sop.due_date",
      "sop.total_sessions",
      "sop.sent_sessions",
      "sop.pending_session",
      "sop.program_combo",
      "sop.paid_amount",
      "sop.program_status",
      "sop.break_start_date",
      "sop.break_end_date",
      "sop.break_note",
      "paym.payment_mode_name",
      "sop.expiry_date",
      "sop.start_date",
      "sp.suggested_program_id as suggested_id",
      "sp.program_id as suggested_program_id",
      "sp.program_session_id as suggested_program_session_id",
      "spm.program_name AS suggested_program_name",
      "sp.suggested_amount",
      "sps.mrp as suggested_program_mrp",
      "sps.program_duration as suggested_program_duration",
      "sp.updated_date AS suggested_at",
      "paym.payment_mode_name",
      "sp.payment_mode_id",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_status",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.free_hamper as free_hamper",
      "CONCAT(sba.first_name, ' ', sba.last_name) AS suggested_by_name",
      "apd.goal_weight",
      `(SELECT weight FROM assessment_personal_details WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight as program_end_weight",
      "sop.balance_amount as balance_amount",
      "sop.due_date as balance_due_date",
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('4') ) as is_advance`,
      `(SELECT end_session_weight  FROM diet_session_log WHERE user_id =  ${user_id}  and diet_status='4' and sub_order_id=sop.sub_order_id and session=sop.sent_sessions-1 limit 1) as previous_end_weight`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as wmr_start`,
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "ud.start_weight",
      "ud.my_wallet",
      "apd.assessment_id",
      "ass_n_l.eating_habit",
      "ass_n_l.food_preference",
      "ass_n_l.food_allergies",
      "ass_n_l.food_aversions",
      "ass_n_l.nutrition_and_lifestyle_id as nutrition_and_lifestyle_id ",
      "COALESCE(apd.date_of_birth,ud.birth_date) as birth_date",
      `(SELECT mentor_star_rating FROM bn_halftime_feedback WHERE user_id=${user_id} and sub_order_id=ud.active_order_id ORDER BY id DESC LIMIT 1) as ht_rating`,
      `(SELECT rate_mentor FROM bn_final_feedback WHERE user_id=${user_id} and sub_order_id=ud.active_order_id ORDER BY id DESC LIMIT 1) as te_rating`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and days='5' and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_fifth`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and days='10' and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_tenth`,
      `(
  SELECT CONCAT(
    COALESCE(spm.program_name, 'N/A'), 
    '(', 
    COALESCE(spo.program_days, '0'), 
    'Days)', 
    '<br> Sugg. Amt.: Rs.', 
    COALESCE(spo.suggested_amount, '0')
  )
  FROM suggested_program spo
  LEFT JOIN programs_master spm ON spo.program_id = spm.program_id
  WHERE spo.user_id = ud.user_id
  ORDER BY spo.added_date DESC
  LIMIT 2,1
) AS old_pitched_details`,
      `(SELECT
    (
        CASE WHEN wr.days = '10' AND (
            (
            SELECT
                id
            FROM
                ${tables.dietFeedback} df
            WHERE
                df.diet_id = wr.diet_id limit 1
        ) IS NULL
        ) THEN wr.diet_id ELSE NULL
    END
) AS diet_id_feedback
FROM
    ${tables.weightRecords} wr
WHERE
    wr.user_id = ${user_id}
ORDER BY
    wmr_id
DESC
LIMIT 1) as diet_id_feedback`,
      `(
    select wr.weight from ${tables.weightRecords} wr WHERE wr.sub_order_id = (
      SELECT dsl.sub_order_id from ${tables.dietSessionLog} dsl WHERE dsl.user_id = ${user_id} AND dsl.sub_order_id != ud.active_order_id AND dsl.diet_status = '4' ORDER BY dsl.diet_start_date DESC LIMIT 1
    ) AND wr.user_id = ${user_id} ORDER BY wr.posted_date DESC LIMIT 1
    ) as last_program_end_weight`,
      `(
    select wr.weight from ${tables.weightRecords} wr WHERE wr.sub_order_id = (
      SELECT dsl.sub_order_id from ${tables.dietSessionLog} dsl WHERE dsl.user_id = ${user_id} AND dsl.sub_order_id != ud.active_order_id AND dsl.diet_status = '4' ORDER BY dsl.diet_start_date DESC LIMIT 1
    ) AND wr.user_id = ${user_id} ORDER BY wr.posted_date ASC LIMIT 1
    ) as last_program_start_weight`,
      `(SELECT key_insight FROM ${tables.userKeyInsight} ki WHERE ki.key_insight is not null and ki.user_id=${user_id} order by ki.id DESC limit 1) as key_insight`,
      `(SELECT sub_order_id FROM ${tables.dietSessionLog} WHERE user_id = ud.user_id AND sub_order_id != ud.active_order_id ORDER BY diet_id DESC LIMIT 1) as last_program_id`,
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.countries} countries`,
        on: "ud.country_id = countries.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} states`,
        on: "ud.state_id = states.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} city`,
        on: "ud.city_id = city.city_id",
      },
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
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ud.mentor_assigned = ad.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: "sop.order_id = od.order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode = paym.payment_mode_id",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "ud.suggested_program_id = sp.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} spm`,
        on: "spm.program_id  = sp.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} sps`,
        on: "sps.program_session_id  = sp.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} sba`,
        on: "sp.suggested_by = sba.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.assessment_personal_details} apd`,
        on: userAssessmentDetails?.assessment_id
          ? `${userAssessmentDetails.assessment_id} = apd.assessment_id`
          : "apd.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "dsl.session = sop.sent_sessions AND dsl.sub_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} sp_paym`,
        on: "sp.payment_mode_id  = sp_paym.payment_mode_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentLinks} sp_pl`,
        on: "sp.payment_link_id= sp_pl.id",
      },
      {
        type: "LEFT",
        table: `${tables.assessment_nutrition_and_lifestyle} ass_n_l`,
        on: userAssessmentDetails?.assessment_id
          ? `${userAssessmentDetails.assessment_id}= ass_n_l.assessment_id`
          : "ass_n_l.user_id= ud.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.countries} apd_countries`,
        on: "apd.country_of_residence = apd_countries.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} apd_states`,
        on: "apd.state = apd_states.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} apd_cities`,
        on: "apd.city = apd_cities.city_id",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins,
      orderBy: ["apd.added_date DESC limit 1"],
      groupBy: ["ud.user_id"],
    });
    const data = results[0];

    console.log(data, "dataaaaaaaaaa");

    const { results: pregnancyOnhold } = await readRecord({
      table: `${tables.postPregnancyData} ohc`,
      selectFields: ["ohc.user_id"],
      conditions: [
        { field: "ohc.user_id", operator: "=", value: user_id },
        {
          field: "ohc.sub_order_id",
          operator: "=",
          value: data.active_order_id,
        },
      ],
    });

    if (pregnancyOnhold.length > 0) {
      has_pregnancy_post_data = true;
    }

    const { results: assessmentDetails } = await readRecord({
      table: `${tables.assessment} ass`,
      selectFields: ["ass.assessment_id"],
      conditions: [{ field: "ass.user_id", operator: "=", value: user_id }],
      orderBy: ["ass.assessment_id DESC"],
    });
    let current_session_loss;

    let previous_end_weight = data.previous_end_weight;
    if (data.start_session_weight == 0) {
      data.start_session_weight = previous_end_weight;
    }
    if (data.start_session_weight == 0) {
      data.start_session_weight = data.wmr_start;
    }
    if (data.end_session_weight == 0) {
      data.end_session_weight = data.wmr_end;
    }

    if (!data.start_session_weight) {
      current_session_loss = 0;
    } else if (
      data.end_session_weight &&
      Number(data.end_session_weight) !== 0
    ) {
      current_session_loss =
        Number(data.start_session_weight) - Number(data.end_session_weight);
    } else if (
      data.mid_session_weight &&
      Number(data.mid_session_weight) !== 0
    ) {
      current_session_loss =
        Number(data.start_session_weight) - Number(data.mid_session_weight);
    } else {
      current_session_loss = 0;
    }

    const total_change_current_program =
      Number(data.start_program_weight) < 1
        ? "0.00"
        : (Number(data.start_program_weight) || 0) -
          (Number(data.latest_weight || data.wmr_end) || 0);
    console.log(data.start_program_weight, 337);
    console.log(data.program_end_weight, 337);
    const total_change_with_us = Number(data.latest_weight || data.wmr_end)
      ? (Number(
          data.assessment_start_weight
            ? data.assessment_start_weight
            : data.start_weight,
        ) || 0) - (Number(data.latest_weight || data.wmr_end) || 0)
      : 0;

    const formatWeightChange = (value) => {
      const formatted = Number(value).toFixed(2);
      return value < 0
        ? `+${
            formatted ? (formatted < 0 ? formatted * -1 : formatted) : formatted
          }`
        : `-${formatted}`;
    };

    let message = "";
    const daysLeft = moment(data.suggested_payment_expiry).diff(
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
    if (Number(data.payment_mode_id) === 1) {
      message = `<span>Hi ${
        data.full_name
      },<br><br> PFA your payment link for <b>${data.suggested_program_name}(${
        data?.suggested_program_duration
      }) program</b> for Amount <b>Rs.${
        data.suggested_amount
      }</b> <br> Click here: <a href="${data.suggested_payment_link}">${
        data.suggested_payment_link
      }</a> <br><br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
        data.suggested_payment_expiry,
      ).format(
        "Do MMMM YYYY",
      )} which is ${displayDays}. Please ensure you use it before that. <br/> ${
        data?.free_hamper !== "No" && data?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      }<br/><br/>P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
        data.suggested_amount
      }">Click here</a></span>`;
    } else if (Number(data.payment_mode_id) === 3) {
      // Handle Bank Account Payment Mode
      message = `<span>PFA the Bank Account Details for the payment of Rs.${
        data.suggested_amount
      } for ${data.suggested_program_name}(${
        data?.suggested_program_duration
      }) program.<br> ${data.suggested_payment_mode_details} <br/> ${
        data?.free_hamper !== "No" && data?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
    } else if (Number(data.payment_mode_id) === 2) {
      // Handle UPI Payment Mode
      message = `<span>Hi ${
        data.full_name
      }, <br> PFA the UPI details for the Amount of Rs.${
        data.suggested_amount
      } for ${data.suggested_program_name}(${
        data?.suggested_program_duration
      }) program. <br> ${data.suggested_payment_mode_details} <br/> ${
        data?.free_hamper !== "No" && data?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once the transfer is done and share a screenshot of the transaction details.</span>`;
    } else if (Number(data.payment_mode_id) === 4) {
      // Handle Cash Collection Payment Mode
      message = `<span>Hi ${
        data.lead_name
      },<br> Cash Collection for the amount of Rs.${
        data.suggested_amount
      } for ${data.suggested_program_name}(${
        data?.suggested_program_duration
      }). <br> Date: ${moment(data.suggested_payment_expiry).format(
        "Do MMMM YYYY",
      )} <br> Contact Person: Abdul Shaikh (919158267868) <br/> ${
        data?.free_hamper !== "No" && data?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br>  P.S. Please connect with us incase you have any query & type it in here.</span>`;
    }

    let whatsapp_txt = "";

    const validAdvanceProgramIds = [
      162, 163, 166, 167, 168, 169, 170, 171, 172, 173, 176,
    ];
    const validPhase2ProgramIds = [4, 34, 74, 75, 92, 91, 108, 6, 5, 38];
    const validPhasesp = [132, 134];
    let bigProgramPrice180 = 40299;
    let bigProgramPrice90 = 27999;
    let smallProgramPrice180 = 40299;
    let smallProgramPrice90 = 23999;
    if (data.user_status == "Active") {
      if (data.suggested_program_id) {
        if (validPhase2ProgramIds.includes(data.suggested_program_id)) {
          whatsapp_txt = `Hi ${data.full_name},

We just ended our *Founder's Birthday Month* offer. It would have been the best option for you. 

We still have a chance to get the program at 60% off on all the programs until tonight. The cost of the 90-day ${data.suggested_program_name} Program that I had recommended to you will be Rs.11500 instead of Rs.27999 

Let me know if you need a link or bank details. Will be happy to share!`;
        } else if (validAdvanceProgramIds.includes(data.suggested_program_id)) {
          whatsapp_txt = `Hi ${data.full_name},

We just ended our *Founder's Birthday Month* offer. It would have been the best option for you. 

We still have a chance to get the program upto 60% off on all the programs until tonight. The cost of the 180-day ${data.suggested_program_name} Program that I had recommended to you will be Rs.28999 instead of Rs.64999 

Let me know if you need a link or bank details. Will be happy to share!`;
        } else if (validPhasesp.includes(data.suggested_program_id)) {
          whatsapp_txt = `Hi ${data.full_name},

We just ended our *Founder's Birthday Month* offer. It would have been the best option for you. 

We still have a chance to get the program at 70% off on all the programs until tonight. The cost of the 60-day ${data.suggested_program_name} Program that I had recommended to you will be Rs.7999 instead of Rs.26999 

Let me know if you need a link or bank details. Will be happy to share!`;
        } else {
          whatsapp_txt = `Hi ${data.full_name},

You just missed out on an excellent offer on the 60-day *Slim Possible* program that would have come at a very, very good rate.

The MRP of the program is Rs.26999 & you would have got it at Rs.7999/-

Until tomorrow, I can request the accounts to make this offer applicable to you.

Do let me know, & I shall have to share an external payment link for this as the offers in the app are over.

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=29/call_type=45 to book a call with me to understand more!`;
        }
      } else {
        whatsapp_txt = `Hi ${data.full_name},

You just missed out on an excellent offer on the 60-day *Slim Possible* program that would have come at a very, very good rate.

The MRP of the program is Rs.26999 & you would have got it at Rs.7999/-

Until tomorrow, I can request the accounts to make this offer applicable to you.

Do let me know, & I shall have to share an external payment link for this as the offers in the app are over.

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=29/call_type=45 to book a call with me to understand more!`;
      }
    } else {
      whatsapp_txt = `Hi ${data.full_name},

How are you?

Your weight back was ${data.latest_weight} kg when you left us last. 

How about now, are you maintaining the same or have you gained? 

The Founder's day offers are now live, and until 7th July 2025, all our programs are available at flat 60% off - which is the lowest price ever!

Do ping me back if you wish to know more and restart your health journey with us!`;
    }

    // const { status: spinToWinStatus, message: spinToWinMessage } =
    //   await spinToWinWhatsappDraft(data.user_id);
    // if (spinToWinStatus) {
    //   whatsapp_txt = spinToWinMessage;
    // }
    console.log(data);
    // whatsapp_txt = generateWhatsappTextByStatus(data);
    if (data.user_status == "Active") {
      whatsapp_txt = `Hi ${data.full_name},

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
        data.suggested_program_name || "Slim Possible"
      } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
        data.suggested_program_id || 134
      } to check the final price.`;
    } else {
      whatsapp_txt = `Hi ${data.full_name},

You have Rs.${data?.my_wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://bit.ly/3PRsquW to book a call with me and know more`;
    }

    if (data.suggested_program_id) {
      whatsapp_txt = `Hi ${data.full_name},

Mentor ${data?.mentor_assigned_name} here 

We have *Rs.${data?.my_wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${data?.suggested_program_name} program that I have recommended to you* - Click here https://bit.ly/3PRsquW
`;
    } else {
      whatsapp_txt = `Hi ${data.full_name},

Mentor ${data?.mentor_assigned_name} here 

We have *Rs.${data?.my_wallet}* in your BN Wallet that becomes Rs.0 tonight.

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://bit.ly/3PRsquW
`;
    }

    // Add P.S. line only if phone matches allowed codes
    if (/^(?:\+)?(91)/.test(data.phone.replace(/\s/g, ""))) {
      whatsapp_txt += `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks along with your program purchase

Check the products here: https://www.balancenutrition.in/shop`;
    }

   

    console.log(data.user_status, "===================");
    const phone = data.phone?.replace(/\s/g, "") || "";
    const isIndia = /^(?:\+)?91/.test(phone);
    if (
      [
        "active",
        "onhold",
        "cleanse active",
        "dormant",
        "freezed",
        "notstarted",
      ].includes(data.user_status?.toLowerCase())
    ) {
      whatsapp_txt = `Hi ${data.full_name},
Mentor ${data?.mentor_assigned_name} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon. 
Before this happens. Let's get your next program registered for.

${
  isIndia
    ? "\n\nP.S. Also going to send you an exclusive BN Healthy Snack Hamper :)"
    : "\n\nP.S.You'll receive a FREE 3-Day Gut Reset Detox to welcome you back!"
}
  `;
    } else {
      whatsapp_txt = `Hi ${data.full_name},

Mentor ${data?.mentor_assigned_name} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon.
What is your weight currently?`;
    }

    if (
      data.user_status == "Completed" ||
      data.user_status == "Dropout" ||
      data.user_status == "Fs"
    ) {
      // 🔹 New unified WhatsApp message logic

      const dropoutCount = Number(data.dropout_count) || 0;
      const programName = data.program_name || "Intermittent Fasting Program";
      const programDuration = data.program_duration
        ? `${data.program_duration} Days`
        : "90 Days";

      if (dropoutCount > 1 && dropoutCount <= 8) {
        whatsapp_txt = `Hi ${data.full_name},

Just wanted to update that you have Rs.${data?.my_wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App?

You also have ${dropoutCount} pending sessions from the previous ${programDuration} ${programName} program that we can re open :)

Let's talk: https://www.balancenutrition.in/app_link/screen_id=294/call_type=45`;
      } else {
        whatsapp_txt = `Hi ${data.full_name},

Just wanted to update that you have Rs.${data?.my_wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? `;
      }
    }

   
    if (isIndia && [
        "active",
        "onhold",
        "cleanse active",
        "dormant",
        "freezed",
        "notstarted",
      ].includes(data.user_status?.toLowerCase()))
       {
      whatsapp_txt= `Hi ${data?.full_name} 
In our team meeting today, all of us mentors, along with Khyati maam were discussing weighing scales and the common errors we see in them.
I want to understand what you are currently using.
Please send me a photo of your weighing scale, and I will decode it for you.`
    }
    else if ((!isIndia) && [
        "active",
        "onhold",
        "cleanse active",
        "dormant",
        "freezed",
        "notstarted",
      ].includes(data.user_status?.toLowerCase())) {
      whatsapp_txt = `Hi ${data?.full_name}
There is one person in our homes, a friend, a relative who needs to work on their health but refuses to take the 1st step!
We have an option for them; they can start our 14-day program absolutely free. 
Click here https://www.balancenutrition.in/app_link/screen_id=4 to fill out their details & let me know when we can connect to discuss this further.`
}

    if(data.old_wallet > 7999 && ![
        "active",
        "onhold",
        "cleanse active",
        "dormant",
        "freezed",
        "notstarted",
      ].includes(data.user_status?.toLowerCase())){

whatsapp_txt=`Hi ${data.full_name || "User"},

Sadly, last night your BN wallet balance of Rs.${data.old_wallet} expired leaving Rs.00 as your current balance.

We had a great chance to save up to Rs.18000 on your next program purchase with discount offers that come rarely. 

Let me know if I should talk to the management & see if we can avail this offer until tonight.`;
    }
   
    function extractClientFoodData(data) {
      const parseJSON = (input, fallback = {}) => {
        try {
          return typeof input === "string"
            ? JSON.parse(input)
            : input || fallback;
        } catch (e) {
          return fallback;
        }
      };

      const extractFoodPreferences = (raw) => {
        const parsed = parseJSON(raw, {});
        if (parsed.preference) {
          // Format 1: { "preference": { food_1: ..., food_2: ... } }
          return Object.values(parsed.preference || {})
            .map((f) => f?.trim())
            .filter(Boolean);
        } else {
          // Format 2: { food_1: ..., food_2: ... }
          return Object.values(parsed || {})
            .map((f) => f?.trim())
            .filter(Boolean);
        }
      };

      const extractAversions = (raw) => {
        const parsed = parseJSON(raw, {});
        const aversionObj = parsed.aversion || parsed;
        return Object.values(aversionObj || {})
          .map((f) => f?.trim())
          .filter(Boolean);
      };

      const extractAllergies = (raw) => {
        const parsed = parseJSON(raw, {});
        const structured = Object.values(parsed?.allergies || {})
          .map((a) => a?.food?.trim())
          .filter(Boolean);

        const unstructured = Object.values(parsed?.other_allergies || {})
          .map((a) => (typeof a === "string" ? a.trim() : null))
          .filter(Boolean);

        return [...structured, ...unstructured];
      };

      return {
        food_preferences: extractFoodPreferences(data?.food_preference),
        allergies: extractAllergies(data?.food_allergies),
        aversions: extractAversions(data?.food_aversions),
      };
    }
    const foodData = extractClientFoodData(data);
    const { results: onholdDetails } = await readRecord({
      table: `${tables.onholdClients} ohc`,
      selectFields: ["ohc.id"],
      conditions: [{ field: "ohc.user_id", operator: "=", value: user_id }],
      orderBy: ["ohc.id DESC"],
      pagination: { limit: 1 },
    });
    const { results: prizeDetails } = await readRecord({
      table: `${tables.prizeDetails} pd`,
      selectFields: ["*"],
      conditions: [{ field: "pd.user_id", operator: "=", value: user_id }],
      orderBy: ["pd.id DESC"],
    });
    
    if (data.program_combo?.toLowerCase().includes('imf')) {
      data.ask_imf_window  = 1 ;
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Data For ${user_id} Fetched successfully`,
      data: {
        client_details: {
          user_id: data.user_id,
          old_user_id: data.old_user_id,
          full_name: data.full_name,
          first_name: data.first_name,
          last_name: data.last_name,
          plain_password: data.plain_password,
          phone: data.phone,
          phone_number: data.phone_number,
          phone_code: data.phone_code,
          balance_amount: data.balance_amount,
          balance_due_date: data.due_date,
          email_id: data.email_id,
          old_mentor_name: data.old_mentor_name,
          whatsapp_txt: whatsapp_txt,
          age: calculateAge(data.birth_date),
          wallet: data.my_wallet,
          ethnicity: data.ethnicity,
          wmr_fifth: data.wmr_fifth,
          wmr_tenth: data.wmr_tenth,
          // free_hamper: data.free_hamper,
          hamper_status: data.hamper_status,
          scale_status: data.scale_status,
          has_pregnancy_post_data: has_pregnancy_post_data,
          vip: data.vip,
          os: data.os,
          model: data.model,
          gender:
            Number(data.gender) === 1
              ? "Male"
              : Number(data.gender) === 2
                ? "Female"
                : null,
          user_status: data.user_status,
          sub_user_status: data.sub_user_status,
          food_preferences: foodData.food_preferences,
          allergies: foodData.allergies,
          aversions: foodData.aversions,
          key_insight: data?.key_insight || "No Key Insight",
          country: {
            country_name: data.country_name,
            country_id: data.country_id,
          },
          state: { state_name: data.state_name, state_id: data.state_id },
          city: { city_name: data.city_name, city_id: data.city_id },
          onhold_id: onholdDetails[0]?.id || null,
          assessment_id:
            assessmentDetails.length > 0
              ? assessmentDetails[0].assessment_id
              : null,
          otp: data.otp,
          wati:
            Number(data.wati) === 0
              ? false
              : Number(data.wati) === 1
                ? true
                : null,
          pro_notification:
            Number(data.pro_notification) === 0
              ? false
              : Number(data.pro_notification) === 1
                ? true
                : null,
          daily_fu:
            Number(data.daily_fu) === 0
              ? false
              : Number(data.daily_fu) === 1
                ? true
                : null,
          ask_diet:
            Number(data.ask_diet) === 0
              ? false
              : Number(data.ask_diet) === 1
                ? true
                : null,
          eating_habit: data.eating_habit,
          device: data.device,
          app_version: data.app_version,
          ask_update: ![app_versions.android, app_versions.ios].includes(
            data.app_version,
          ),
          Program_combo: data.program_combo,
          nutrition_and_lifestyle_id: data.nutrition_and_lifestyle_id,
          current_screen: data.current_screen,
          last_screen_visited: data.last_screen_visited,
          prize_details: prizeDetails.length > 0 ? prizeDetails[0].prize : null,
          diet_id_feedback: data.diet_id_feedback,
          last_assessment_date: userAssessmentDetails
            ? userAssessmentDetails.update_date
            : null,
        },
        program_details: {
          sub_order_id: data.active_order_id,
          program_id: data.program_id,
          program_name: (data.program_name ? String(data.program_name) : "")
            // .replace(/client\s+exclusive\s+advanced/i, "")
            // .replace(/\([^()]*\)/g, "")
            .trim(),
          program_category: data.program_category,
          is_advance: data?.is_advance ? true : false,
          ht_rating: data?.ht_rating,
          te_rating: data?.te_rating,
          mrp: data.mrp,
          total_sessions: data.total_sessions,
          sent_sessions: data.sent_sessions,
          pending_session: data.pending_session,
          Program_combo: data.program_combo,
          paid_amount: data.paid_amount,
          program_status:
            Number(data.program_status) === 1
              ? "Active"
              : Number(data.program_status) === 2
                ? "Pause"
                : Number(data.program_status) === 3
                  ? "Completed"
                  : Number(data.program_status) === 4
                    ? "Advance Purchase"
                    : null,
          payment_mode_name: data.payment_mode_name,
          program_start: data.start_date
            ? moment(data.start_date).format("DD-MM-YYYY")
            : null,
          program_expiry: data.expiry_date,
          mentor: {
            mentor_assigned_name: data.mentor_assigned_name,
            mentor_assigned_id: data.mentor_assigned_id,
            mentor_phone: data.official_phone,
          },
          program_duration: data.expiry_date
            ? moment(data.expiry_date).diff(moment(), "days")
            : null,
          is_fasting_cycle: Number(data.ask_imf_window) === 0 ? false : true,
          is_cleanse:
            Number(data.validity) === 3 || Number(data.validity) === 1,
          cleanse_days:
            Number(data.validity) === 3 || Number(data.validity) === 1
              ? data.validity
              : null,
          old_program_id: data.last_program_id,
        },
        pitched_program: {
          suggested_id: data.suggested_id,
          suggested_program_id: data.suggested_program_id,
          suggested_program_session_id: data.suggested_program_session_id,
          program_name: `${data.suggested_program_name} (${data.suggested_program_duration})`,
          suggested_mrp: data.suggested_program_mrp,
          suggested_amount: data.suggested_amount,
          suggested_payment_mode: data.suggested_payment_mode_name,
          suggested_payment_mode_details: data.suggested_payment_mode_details,
          suggested_payment_link: data.suggested_payment_link,
          suggested_mentor_note: data.suggested_mentor_note,
          suggested_motivation_level: data?.suggested_program_name
            ? Number(data.suggested_motivation_level) === 0
              ? "low"
              : Number(data.suggested_motivation_level) === 1
                ? "medium"
                : "high"
            : null,
          suggested_payment_expiry: moment(data.suggested_payment_expiry)
            .add(5, "hours")
            .add(30, "minutes"),
          suggested_sale_status: data.suggested_status,
          suggested_by: data.suggested_by_name,
          pitched_at: data.suggested_at
            ? moment(data.suggested_at).fromNow()
            : null,
          message,
          old_pitched_details: data.old_pitched_details,
          free_hamper: data.free_hamper,
        },
        weight: {
          weight_goal: Number(data.goal_weight).toFixed(2),
          assessment_start_weight: Number(data.assessment_start_weight).toFixed(
            2,
          ),
          program_start_weight: Number(data.start_program_weight).toFixed(2),
          current_program_latest_weight: Number(
            data.latest_weight || data.wmr_end,
          ).toFixed(2),
          total_loss_current_session: formatWeightChange(current_session_loss),
          total_loss_in_current_program: formatWeightChange(
            total_change_current_program,
          ),
          total_loss_with_us: formatWeightChange(total_change_with_us),
          last_program_start_weight: data?.last_program_start_weight
            ? Number(data?.last_program_start_weight).toFixed(2)
            : null,
          last_program_end_weight: data?.last_program_end_weight
            ? Number(data?.last_program_end_weight).toFixed(2)
            : null,
          last_program_weight_loss:
            data?.last_program_start_weight && data?.last_program_end_weight
              ? data?.last_program_end_weight - data?.last_program_start_weight
              : null,
        },
        break_details: {
          break_start_date: data.break_start_date
            ? moment(data.break_start_date).format("DD-MM-YYYY")
            : null,
          break_end_date: data.break_end_date
            ? moment(data.break_end_date).format("DD-MM-YYYY")
            : null,
          break_note: data?.break_note,
        },
        balance_details: {
          balance_amount: data.balance_amount,
          balance_due_date: data.balance_due_date
            ? moment(data.balance_due_date).format("DD-MM-YYYY")
            : null,
          balance_od:
            moment()
              .startOf("day")
              .isAfter(moment(data.balance_due_date).startOf("day")) &&
            data.balance_amount > 0,
        },
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function generateWhatsappTextByStatus(mappedData) {
  console.log(mappedData);
  const name = mappedData?.first_name || "there";
  const mentor = mappedData?.mentor_assigned_name || "your mentor";
  const wallet = mappedData?.my_wallet || "0";
  const old_wallet = mappedData?.old_wallet || "0";
  const programName =
    mappedData?.suggested_program_name || "60 Day Slim Possible";
  const programId = mappedData?.suggested_program_id || "134";
  const status = mappedData?.user_status || "Active";

  if (status == "Completed" || status == "Dropout") {
    return `Hi ${name},

Mentor ${mentor} here 

I have an urgent update for you — *Rs.${wallet}* in your BN Wallet is expiring soon.

Check the final pricing of one of our favourite and short programs, *“Slim Possible”*.

Click here to discuss further: https://bit.ly/3PRsquW

Let’s connect soon and use your wallet balance before it expires!`;
  } else {
    return `Hi ${name}, 

Mentor ${mentor} here 

I have an urgent update for you — *Rs.${wallet}* in your BN Wallet is expiring soon.

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${programId} to check the total discount on the ${programName} program  that I recommended to you :)`;
  }
}

const clientProfile = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    const selectFields = [
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.user_id",
      "COALESCE(apd.date_of_birth,ud.birth_date) as birth_date",
      "ud.start_weight",
      "ud.gender",
      "ud.wati",
      "COALESCE(apd.height, ud.height) AS height",
      "ud.latest_weight",
      "CONCAT(ud.device,' ',ud.app_version) as app_installed",
      "ud.app_version as app_version",
      "apd.goal_weight",
      "apd.other_goals",
      `(SELECT weight FROM assessment_personal_details WHERE user_id = ${user_id} and weight!='' ORDER by personal_details_id asc limit 1) as assessment_start_weight`,
      "sop.start_program_weight",
      "sop.end_program_weight",
      "pm.program_name",
      "ps.program_duration",
      "sop.mrp",
      "sop.paid_amount",
      "sop.sent_sessions",
      "sop.pending_session",
      `(SELECT end_session_weight  FROM diet_session_log WHERE user_id =  ${user_id}  and diet_status='4' and sub_order_id=sop.sub_order_id and session=sop.sent_sessions-1 limit 1) as previous_end_weight`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions and sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
      `(SELECT weight FROM weight_records WHERE user_id = ${user_id} and session=sop.sent_sessions-1 and sub_order_id=sop.sub_order_id  ORDER BY wmr_id Desc limit 1) as wmr_start`,
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "bng.comment",
      "COALESCE(country.country_name, apd_countries.country_name) AS country_name",
      "COALESCE(state.state_name, apd_states.state_name) AS state_name",
      "COALESCE(city.city_name, apd_cities.city_name) AS city_name",
      "ud.ethnicity",
      "anal.work_status",
      "anal.eating_habit",
      "anal.who_cooks",
      "anal.preferred_cuisine",
      "anal.food_aversions",
      "anal.food_allergies",
      "apd.is_pregnant",
      "anal.fasting_window_details",
      "amh.acidity",
      "amh.is_medical_issue",
      "apd.is_breast_feed",
      "apd.is_exclusive_breast_feed",
      "apd.child_details",
      "apd.has_children",
      "apd.number_of_children",
      "apd.note_to_mentor_and_khyati",
      "apd.tried_diets_in_past",
      "apd.what_did_not_worked",
      "apd.dietery_challenge",
      "apd.stress_feel",
      "anal.junk_food_you_order",
      "anal.junk_food_you_consume",
      "anal.supplements_taken",
      `(SELECT mentor_star_rating FROM bn_halftime_feedback WHERE user_id=${user_id} and sub_order_id=ud.active_order_id ORDER BY id DESC LIMIT 1) as ht_rating`,
      `(SELECT rate_mentor FROM bn_final_feedback WHERE user_id=${user_id} and sub_order_id=ud.active_order_id ORDER BY id DESC LIMIT 1) as te_rating`,
      `(SELECT COUNT(sop.sub_order_id) FROM ${tables.subOrderPrograms} sop WHERE sop.user_id = ${user_id} AND sop.program_status IN ('1','2','3') AND sop.program_type = 0 AND sop.program_id IS NOT NULL) as program_no`,
      `(
    select wr.weight from ${tables.weightRecords} wr WHERE wr.sub_order_id = (
      SELECT dsl.sub_order_id from ${tables.dietSessionLog} dsl WHERE dsl.user_id = ${user_id} AND dsl.sub_order_id != ud.active_order_id AND dsl.diet_status = '4' ORDER BY dsl.diet_start_date DESC LIMIT 1
    ) AND wr.user_id = ${user_id} ORDER BY wr.posted_date DESC LIMIT 1
    ) as last_program_end_weight`,
      `(
    select wr.weight from ${tables.weightRecords} wr WHERE wr.sub_order_id = (
      SELECT dsl.sub_order_id from ${tables.dietSessionLog} dsl WHERE dsl.user_id = ${user_id} AND dsl.sub_order_id != ud.active_order_id AND dsl.diet_status = '4' ORDER BY dsl.diet_start_date DESC LIMIT 1
    ) AND wr.user_id = ${user_id} ORDER BY wr.posted_date ASC LIMIT 1
    ) as last_program_start_weight`,
      "sop.order_type",
      `(SELECT ad1.crm_user FROM ${tables.adminUsers} ad1 WHERE ad1.admin_user_id = ud.old_mentor_assigned) AS old_mentor_name`,
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.assessment} ass`,
        on: `ud.user_id = ass.user_id AND ass.assessment_id=(SELECT assessment_id FROM assessment WHERE user_id = ${user_id} and completion_status=2 ORDER by assessment_id DESC LIMIT 1)`,
      },
      {
        type: "LEFT",
        table: `${tables.assessment_personal_details} apd`,
        on: "ass.assessment_id = apd.assessment_id",
      },
      {
        type: "LEFT",
        table: ` ${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sent_sessions = dsl.session and dsl.sub_order_id=sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.bnMyGoals} bng`,
        on: "sop.sub_order_id = bng.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.countries} country`,
        on: "apd.country_of_residence = country.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} state`,
        on: "apd.state = state.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} city`,
        on: "apd.city = city.city_id",
      },
      {
        type: "LEFT",
        table: `${tables.assessment_nutrition_and_lifestyle} anal`,
        on: "ud.user_id = anal.user_id and anal.assessment_id=ass.assessment_id",
      },
      {
        type: "LEFT",
        table: `${tables.assessment_medical_history} amh`,
        on: "ud.user_id = amh.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.countries} apd_countries`,
        on: "apd.country_of_residence = apd_countries.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} apd_states`,
        on: "apd.state = apd_states.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} apd_cities`,
        on: "apd.city = apd_cities.city_id",
      },
    ];
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      groupBy: ["ud.user_id"],
    });

    const client = results[0];
    const age = calculateAge(client.birth_date);

    const { results: oldDietIds } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["dsl.diet_details_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.user_id = ud.user_id and dsl.sub_order_id != ud.active_order_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        {
          field: "dsl.diet_details_id",
          operator: "NOT IN ('')",
          value: "",
          raw: true,
        },
      ],
    });
    const oldDiet = await Promise.all(
      oldDietIds.map(async (row) => {
        const diet = await dietDetails
          .findById(row.diet_details_id)
          .select("diet_name");
        return diet.diet_name;
      }),
    );
    const { results: currentDietIds } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["dsl.diet_details_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.user_id = ud.user_id and dsl.sub_order_id = ud.active_order_id",
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });

    const safeNumber = (val, fallback = 0, precision = 2) => {
      const num = Number(val);
      return isNaN(num)
        ? `${fallback.toFixed(precision)}`
        : `${num.toFixed(precision)}`;
    };

    const formatWeightChange = (value, precision = 2) => {
      const num = Number(value);
      const formatted = num.toFixed(precision);
      return num < 0
        ? `+${
            formatted ? (formatted < 0 ? formatted * -1 : formatted) : formatted
          }`
        : `-${formatted}`;
    };

    const currentDiet = await Promise.all(
      currentDietIds.map(async (row) => {
        const diet = await dietDetails
          .findById(row.diet_details_id)
          .select("diet_name");
        return diet?.diet_name;
      }),
    );

    const advancepurchase = await advancePurchaseUtils(user_id);
    const prevPurchase = await PrevPurchaseUtils(user_id);

    // const total_change_current_session =
    //   (Number(client.start_session_weight) || 0) -
    //   (Number(client.end_session_weight) || 0);
    // const total_change_current_program =
    //   (Number(client.start_program_weight) || 0) -
    //   (Number(client.end_program_weight) || 0);
    // const total_change_with_us =
    //   Number(client.latest_weight)?(Number(client.assessment_start_weight?client.assessment_start_weight:client.start_weight) || 0) - (Number(client.latest_weight) || 0):0;

    let total_change_current_session;

    let previous_end_weight = client.previous_end_weight;
    if (client.start_session_weight == 0) {
      client.start_session_weight = previous_end_weight;
    }
    if (client.start_session_weight == 0) {
      client.start_session_weight = client.wmr_start;
    }
    if (client.end_session_weight == 0) {
      client.end_session_weight = client.wmr_end;
    }

    if (!client.start_session_weight) {
      total_change_current_session = 0;
    } else if (
      client.end_session_weight &&
      Number(client.end_session_weight) !== 0
    ) {
      total_change_current_session =
        Number(client.start_session_weight) - Number(client.end_session_weight);
    } else if (
      client.mid_session_weight &&
      Number(client.mid_session_weight) !== 0
    ) {
      total_change_current_session =
        Number(client.start_session_weight) - Number(client.mid_session_weight);
    } else {
      total_change_current_session = 0;
    }

    const total_change_current_program =
      Number(client.start_program_weight) < 1
        ? "0.00"
        : (Number(client.start_program_weight) || 0) -
          (Number(client.latest_weight || client.wmr_end) || 0);

    const total_change_with_us = Number(client.latest_weight || client.wmr_end)
      ? (Number(
          client.assessment_start_weight
            ? client.assessment_start_weight
            : client.start_weight,
        ) || 0) - (Number(client.latest_weight || client.wmr_end) || 0)
      : 0;

    const { results: medicationDetails } = await readRecord({
      table: `(
    SELECT 
        user_id,
        medication_details,
        JSON_UNQUOTE(JSON_EXTRACT(other_medical_issue, '$.other_medical_issue_1')) AS omi1,
        JSON_UNQUOTE(JSON_EXTRACT(other_medical_issue, '$.other_medical_issue_2')) AS omi2,
        JSON_UNQUOTE(JSON_EXTRACT(other_medical_issue, '$.other_medical_issue_3')) AS omi3,
        JSON_UNQUOTE(JSON_EXTRACT(other_medical_issue, '$.other_medical_issue_4')) AS omi4,
        JSON_UNQUOTE(JSON_EXTRACT(other_medical_issue, '$.other_medical_issue_5')) AS omi5,
        acidity, blood_pressure, cholesterol, diabetes, pcos, thyroid, fatty_liver
    FROM assessment_medical_history
    WHERE is_medical_issue = 1 AND user_id = ${user_id}
    ORDER BY updated_date DESC
    LIMIT 1
) ah`,
      selectFields: [
        ` user_id`,
        `GROUP_CONCAT(DISTINCT issue ORDER BY FIELD(issue,
        'Acidity', 'Blood Pressure Issues', 'Cholesterol', 'Diabetes', 'PCOS', 'Thyroid', 'Fatty Liver',
        'Other Medical Issue: Uric', 'Other Medical Issue: Ibs') SEPARATOR ', ') AS Medical_Conditions`,
        `CONCAT_WS('\n\n',
        -- medication_1
        CONCAT(JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_1.health_issue')), 
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_1.medicine_name')), ' | ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_1.dosage')), ', ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_1.frequency')))`,
        `CONCAT(JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_2.health_issue')), 
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_2.medicine_name')), ' | ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_2.dosage')), ', ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_2.frequency')))`,
        ` CONCAT(JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_3.health_issue')), 
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_3.medicine_name')), ' | ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_3.dosage')), ', ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_3.frequency')))`,
        `CONCAT(JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_4.health_issue')), 
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_4.medicine_name')), ' | ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_4.dosage')), ', ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_4.frequency')))`,
        ` CONCAT(JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_5.health_issue')), 
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_5.medicine_name')), ' | ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_5.dosage')), ', ',
               JSON_UNQUOTE(JSON_EXTRACT(medication_details, '$.medication_5.frequency')))
    ) AS Medication_Details`,
      ],
      joins: [
        {
          type: "INNER",
          table: `(
    SELECT 'Acidity' AS issue UNION
    SELECT 'Blood Pressure Issues' UNION
    SELECT 'Cholesterol' UNION
    SELECT 'Diabetes' UNION
    SELECT 'PCOS' UNION
    SELECT 'Thyroid' UNION
    SELECT 'Fatty Liver' UNION
    SELECT CONCAT('Other Medical Issue: ', 'Uric') UNION
    SELECT CONCAT('Other Medical Issue: ', 'Ibs')
) issues`,
          on: `(
    (issue = 'Acidity' AND ah.acidity IS NOT NULL AND ah.acidity <> '') OR
    (issue = 'Blood Pressure Issues' AND ah.blood_pressure IS NOT NULL AND ah.blood_pressure <> '') OR
    (issue = 'Cholesterol' AND ah.cholesterol IS NOT NULL AND ah.cholesterol <> '') OR
    (issue = 'Diabetes' AND ah.diabetes IS NOT NULL AND ah.diabetes <> '') OR
    (issue = 'PCOS' AND ah.pcos IS NOT NULL AND ah.pcos <> '') OR
    (issue = 'Thyroid' AND ah.thyroid IS NOT NULL AND ah.thyroid <> '') OR
    (issue = 'Fatty Liver' AND ah.fatty_liver IS NOT NULL AND ah.fatty_liver <> '') OR
    (issue = CONCAT('Other Medical Issue: ', ah.omi1) AND ah.omi1 <> '') OR
    (issue = CONCAT(' ', ah.omi2) AND ah.omi2 <> '') OR
    (issue = CONCAT(' ', ah.omi3) AND ah.omi3 <> '') OR
    (issue = CONCAT(' ', ah.omi4) AND ah.omi4 <> '') OR
    (issue = CONCAT(' ', ah.omi5) AND ah.omi5 <> '')
)`,
        },
      ],
      groupBy: ["user_id"],
    });

    function extractClientFoodData(data) {
      const parseJSON = (input, fallback = {}) => {
        try {
          return typeof input === "string"
            ? JSON.parse(input)
            : input || fallback;
        } catch (e) {
          return fallback;
        }
      };

      const extractFoodPreferences = (raw) => {
        const parsed = parseJSON(raw, {});
        const preferenceObj = parsed.preference || parsed;
        return Object.values(preferenceObj || {})
          .map((f) => f?.trim())
          .filter(Boolean);
      };

      const extractAversions = (raw) => {
        const parsed = parseJSON(raw, {});
        const aversionObj = parsed.aversion || parsed;
        return Object.values(aversionObj || {})
          .map((f) => f?.trim())
          .filter(Boolean);
      };

      const extractAllergies = (raw) => {
        const parsed = parseJSON(raw, {});
        const allergyBlock = parsed?.allergies || parsed;
        let allAllergies = [];

        // ✅ Case 1: Structured allergy object (with food/sub_food/any_other_sub_food)
        if (typeof allergyBlock === "object") {
          for (const allergy of Object.values(allergyBlock)) {
            if (typeof allergy === "object") {
              const main = allergy.food?.trim();
              const subFoods = Array.isArray(allergy.sub_food)
                ? allergy.sub_food.map((s) => s?.trim()).filter(Boolean)
                : [];
              const others = Array.isArray(allergy.any_other_sub_food)
                ? allergy.any_other_sub_food
                    .map((s) => s?.trim())
                    .filter(Boolean)
                : [];
              if (main) allAllergies.push(main);
              allAllergies.push(...subFoods, ...others);
            } else if (typeof allergy === "string") {
              // ✅ Case 2: Flat format like { allergy_1: "Gluten" }
              allAllergies.push(allergy.trim());
            }
          }
        }

        // ✅ Case 3: Fallback to other_allergies
        const otherAllergies = parsed.other_allergies || {};
        for (const val of Object.values(otherAllergies)) {
          if (typeof val === "string") {
            const parts = val
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            allAllergies.push(...parts);
          }
        }

        // ✅ Remove duplicates
        return [...new Set(allAllergies)];
      };
      const getPreferredCuisine = (input) => {
        try {
          const values = [];
          const raw = input?.preferred_cuisine;
          const parseData = safeJSONParse(raw);
          // console.log(typeof parseData, 1221);
          if (typeof parseData == "object") {
            // console.log(parseData, 1223);
            // console.log(1224);
            // console.log( )
            if (parseData?.cuisine && typeof parseData.cuisine == "object") {
              values.push(...Object.values(parseData.cuisine));
            }
            if (
              parseData?.other_cuisine &&
              typeof parseData.other_cuisine == "object"
            ) {
              values.push(...Object.values(parseData.other_cuisine));
            } else if (
              parseData?.other_cuisine &&
              Array.isArray(parseData.other_cuisine)
            ) {
              values.push(...parseData.other_cuisine);
            }
          }
          return values;
        } catch (e) {
          // fail silently
        }

        return null;
      };
      return {
        food_preferences: extractFoodPreferences(data?.food_preference),
        allergies: extractAllergies(data?.food_allergies),
        aversions: extractAversions(data?.food_aversions),
        preferred_cuisine: getPreferredCuisine(data),
      };
    }
    const { results: dietRecallDetails } = await readRecord({
      table: `${tables.assessment_24_hour_diet_recall}`,
      selectFields: [
        `    CONCAT_WS('\n\n',
        CONCAT('Breakfast: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(breakfast_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(breakfast_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(breakfast_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(breakfast_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(breakfast_details, '$.menu_options.menu_4'))
                )
            )
        ),
        CONCAT('Mid Morning: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(mid_morning_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(mid_morning_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(mid_morning_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(mid_morning_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(mid_morning_details, '$.menu_options.menu_4'))
                )
            )
        ),
        CONCAT('Lunch: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(lunch_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(lunch_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(lunch_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(lunch_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(lunch_details, '$.menu_options.menu_4'))
                )
            )
        ),
        CONCAT('Late Evening: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(late_evening_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(late_evening_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(late_evening_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(late_evening_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(late_evening_details, '$.menu_options.menu_4'))
                )
            )
        ),
        CONCAT('Dinner: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(dinner_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(dinner_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(dinner_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(dinner_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(dinner_details, '$.menu_options.menu_4'))
                )
            )
        ),
        CONCAT('Pre Workout: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(pre_workout_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(pre_workout_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(pre_workout_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(pre_workout_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(pre_workout_details, '$.menu_options.menu_4'))
                )
            )
        ),
        CONCAT('Post Workout: ',
            CONCAT_WS(' - ',
                JSON_UNQUOTE(JSON_EXTRACT(post_workout_details, '$.time')),
                CONCAT_WS(', ',
                    JSON_UNQUOTE(JSON_EXTRACT(post_workout_details, '$.menu_options.menu_1')),
                    JSON_UNQUOTE(JSON_EXTRACT(post_workout_details, '$.menu_options.menu_2')),
                    JSON_UNQUOTE(JSON_EXTRACT(post_workout_details, '$.menu_options.menu_3')),
                    JSON_UNQUOTE(JSON_EXTRACT(post_workout_details, '$.menu_options.menu_4'))
                )
            )
        )
    ) AS 24_hr_diet_recall
`,
      ],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["updated_date DESC"],
      pagination: { limit: 1 },
    });
    const foodData = extractClientFoodData(client);

    let safeString = "";
    try {
      safeString = decodeURIComponent(client?.note_to_mentor_and_khyati);
    } catch (err) {
      console.error(
        "Decode error for input:",
        client?.note_to_mentor_and_khyati,
      );
      safeString = client?.note_to_mentor_and_khyati; // fallback
    }
    console.log(client, 1323);
    const response = {
      client_name: client.full_name,
      app_installed: client.app_installed,
      ask_update: ![app_versions.android, app_versions.ios].includes(
        client.app_version,
      ),
      height: client.height,
      age,
      temp: "",
      goal_weight: client.goal_weight,
      wati: client.wati,
      old_mentor_name: client.old_mentor_name,
      assessment_goals: client.other_goals
        ? Object.values(JSON.parse(client.other_goals)).join(", ")
        : null,
      assessment_start_weight: client.assessment_start_weight,
      program_start_weight: safeNumber(client.start_program_weight),
      current_program_weight: safeNumber(client.latest_weight),
      total_loss_in_current_session: formatWeightChange(
        total_change_current_session,
      ),
      total_loss_in_current_program: formatWeightChange(
        total_change_current_program,
      ),
      ht_rating: client?.ht_rating,
      te_rating: client?.te_rating,
      last_program_end_weight: client?.last_program_end_weight
        ? Number(client?.last_program_end_weight).toFixed(2)
        : null,
      last_program_weight_loss:
        client?.last_program_start_weight && client?.last_program_end_weight
          ? client.last_program_end_weight - client.last_program_start_weight
          : null,
      total_loss_with_us: formatWeightChange(total_change_with_us),
      program_no: client.program_no,
      current_program: `${client.program_name} (${client.program_duration})`,
      mrp: client.mrp,
      amount_paid: client.paid_amount,
      pending_session: client.pending_session,
      sent_sessions: client?.sent_sessions,
      advance_purchase: advancepurchase
        .map((ap) => `${ap.program_name} (${ap.program_duration})`)
        .join(","),
      prev_purchase: prevPurchase
        .map((ap) => `${ap.program_name} (${ap.program_duration})`)
        .join(","),
      milestone: client.comment,
      goal: client.comment,
      health_score: "N/A",
      city: client.city_name,
      state: client.state_name,
      country: client.country_name,
      ethnicity: client.ethnicity,
      working: client.work_status,
      "Have you tried any diet programs in the past?":
        client?.tried_diets_in_past,
      "What didn't work for you in your previous diet program?":
        client?.what_did_not_worked,
      "What worries you the most about following diets?":
        client?.dietery_challenge,
      "How often do you feel stressed?": client?.stress_feel,
      "Which of the following food items do you order-in or takeout once a week or more?":
        client?.junk_food_you_order,
      "Which of the following foods do you consume once a week or more?":
        client?.junk_food_you_consume,
      "Which supplements do you take?": client?.supplements_taken,
      who_cooks: client.who_cooks,
      "veg/non-veg": client.eating_habit,
      preferred_cuisine: foodData.preferred_cuisine,
      meals_to_office: client.is_carry_meals,
      food_aversions: foodData.aversions,
      allergies: foodData.allergies,
      ...(Number(client.gender) === 2 && {
        pregnant: client.is_pregnant ? true : false,
      }),
      intermittent_cycle: JSON.parse(client.fasting_window_details),
      constipation: client.acidity,
      ...(medicationDetails[0]?.Medical_Conditions && {
        health_issues: medicationDetails[0]?.Medical_Conditions
          ? String(medicationDetails[0]?.Medical_Conditions)?.trim().split(",")
          : "NO",
      }),
      ...(medicationDetails[0]?.Medication_Details && {
        medical_details: medicationDetails[0]?.Medication_Details
          ? medicationDetails[0]?.Medication_Details?.trim()?.split(",")
          : "NO",
      }),

      ...(Number(client?.is_breast_feed) === 1 && {
        breastfeed: client?.is_breast_feed,
        exclusive_breastfeed: client?.is_exclusive_breast_feed,
      }),

      child_details:
        Number(client?.has_children) === 1
          ? client?.child_details.split(",").slice(0, client.number_of_children)
          : "NO",
      diet_recall: dietRecallDetails[0]?.["24_hr_diet_recall"] || {},
      old_diet_sent: oldDiet,
      current_program_diet_sent: currentDiet,
      note_to_khyati: safeString,
      order_type: client.order_type,
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Client Profile fetched Successfully`,
      data: response,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateClientScreen = async (req, res, next) => {
  try {
    const { user_id, screen } = req.query;
    const updatedData = {
      last_screen_visited: screen,
    };

    const results = await updateRecord(`${tables.userDetails}`, updatedData, {
      user_id: user_id,
    });
    if (results.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating Current Screen", 400));
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Current Screen Updated Successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateClientStatus = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    let { status } = req.query;
    if (
      status == "Not%20Started" ||
      status == "Not Started" ||
      status == "Not+Started"
    ) {
      status = "notstarted";
    }
    const updatedData = {
      sub_user_status: status,
      user_status: [
        "Active",
        "Cleanse active",
        "Dormant",
        "Onhold",
        "notstarted",
        "Freezed",
      ].includes(status)
        ? "Active"
        : "Completed",
    };

    const results = await updateRecord(`${tables.userDetails}`, updatedData, {
      user_id: user_id,
    });
    addStatusLogNew({
      status: updatedData.user_status,
      sub_status: updatedData.sub_user_status,
      id: user_id,
    });
    if (results.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating Status", 400));
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Status Updated Successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// helper: dynamic buffer
function getBufferDays(validity) {
  if (validity === 30) return 15;
  if (validity === 60) return 20;
  if (validity === 90) return 25;
  if (validity === 120) return 30;
  if (validity === 150) return 35;
  if (validity === 180) return 40;
  return 25; // sensible default
}

// helper: email HTML
function buildValidityEmailHTML({
  fullName,
  programName,
  bufferDays,
  totalValidityWithBuffer,
  validityRemain,
  pendingSessions,
  sessionDays,
  timeNeededDays,
  shortfall,
}) {
  const firstName = (fullName || "there").split(" ")[0];
  return `
    <p>Hi ${firstName},</p>
    <p>I wanted to share an important update regarding your program's validity and sessions:</p>

    <p><strong>Program Enrolled:</strong> ${programName}</p>
    <p><strong>Total Validity (with ${bufferDays}-day buffer):</strong> ${totalValidityWithBuffer} days</p>
    <p><strong>Validity Remaining:</strong> ${validityRemain} days</p>
    <p><strong>Sessions Pending:</strong> ${pendingSessions}</p>
    <p><strong>Time Needed to Complete Sessions:</strong> ${timeNeededDays} days (${sessionDays} days per session)</p>
    <p><strong>Shortfall:</strong> ${shortfall} days</p>

    <p>Since this is the first time you’re falling short of validity days, we are happy to add the extra days as a one-time bonus from my dashboard so that you can complete your sessions without disruption. Your mentor has just done that.</p>

    <p>It is important that you remain regular and focused going forward; irregularity not only affects your program's validity but also your overall health progress and results.</p>

    <p>Let’s make sure we get the most out of your upcoming sessions. Looking forward to your continued commitment.</p>
  `;
}

const updateClientExpiryDate = async (req, res, next) => {
  const {
    sub_order_id,
    days_extended,
    extended_date,
    wallet_deducted,
    notify,
    mentor_id,
    user_id,
  } = req.body;

  // 👇 now source comes from header
  const source = req.headers["source"];

  const SESSION_DAYS = 11;

  try {
    // ---- Fetch user/program context ----
    const { results: userRows } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.my_wallet",
        "sop.pending_session",
        "sop.sent_sessions",
        "sop.expiry_date",
        "ps.validity",
        "pm.program_name",
        "DATEDIFF(sop.expiry_date, CURDATE()) AS days_to_expiry",
        "au.first_name as mentor_name",
        "au.email_id as mentor_email",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "ps.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "ud.mentor_assigned = au.admin_user_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        { field: "sop.sub_order_id", operator: "=", value: sub_order_id },
      ],
      limit: 1,
    });

    if (!userRows || userRows.length === 0) {
      return next(new ErrorHandler("User/program not found", 404));
    }

    const u = userRows[0];
    const fullName =
      `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "User";
    const programName = u.program_name || "Your Program";
    const programValidity = parseInt(u.validity ?? 0, 10) || 0;
    const pendingSessions = parseInt(u.pending_session ?? 0, 10) || 0;
    const validityRemain = Math.max(
      parseInt(u.days_to_expiry ?? 0, 10) || 0,
      0,
    );
    const bufferDays = getBufferDays(programValidity);
    const totalValidityWithBuffer = programValidity + bufferDays;
    const timeNeededDays = pendingSessions * SESSION_DAYS;
    const shortfall = Math.max(timeNeededDays - validityRemain, 0);

    // ---- FIRST-TIME check via program_expiry_log ----
    const { results: priorLogs } = await readRecord({
      table: `${tables.programExpiryLog}`,
      selectFields: ["id"],
      conditions: [
        { field: "sub_order_id", operator: "=", value: sub_order_id },
      ],
      limit: 1,
    });
    const isFirstTime = !priorLogs || priorLogs.length === 0;

    // ---- Update expiry ----
    const expiryUpdated = await updateRecord(
      `${tables.subOrderPrograms}`,
      { expiry_date: extended_date, expiry_extended_by: mentor_id },
      { sub_order_id, user_id },
    );

    if (expiryUpdated.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating Expiry Date", 400));
    }

    // ---- Insert expiry log ----
    const updatedProgramExpiryLog = await insertRecord(
      `${tables.programExpiryLog}`,
      ["user_id", "sub_order_id", "days", "admin_user", "updated_at"],
      [
        user_id,
        sub_order_id,
        days_extended,
        mentor_id,
        moment().format("YYYY-MM-DD HH:mm:ss"),
      ],
    );

    if (updatedProgramExpiryLog.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating log", 400));
    }

    // ---- Wallet deduction (if any) ----
    let currentWallet = Number(u.my_wallet ?? 0);
    if (Number(wallet_deducted)) {
      const balanceWallet = currentWallet - Number(wallet_deducted);

      const updatedWallet = await insertRecord(
        `${tables.walletLog}`,
        [
          "user_id",
          "sub_order_id",
          "admin_user",
          "action",
          "amount",
          "balance_amount",
          "trans_type",
          "expiry",
        ],
        [
          user_id,
          sub_order_id,
          mentor_id,
          "Extended Expiry Date",
          wallet_deducted,
          balanceWallet,
          "D",
          moment().add(7, "days").format("YYYY-MM-DD HH:mm:ss"),
        ],
      );
      if (updatedWallet.affectedRows === 0) {
        return next(new ErrorHandler("Error while updating Wallet", 400));
      }

      const updateWalletInUserDetails = await updateRecord(
        `${tables.userDetails}`,
        { my_wallet: balanceWallet },
        { user_id },
      );
      if (updateWalletInUserDetails.affectedRows === 0) {
        return next(
          new ErrorHandler("Error while updating Wallet in User Details", 400),
        );
      }
      currentWallet = balanceWallet;
    }

    // ---- Email (only when source=mentor_db AND first-time shortfall) ----
    console.log(
      "source:",
      source,
      "isFirstTime:",
      isFirstTime,
      "shortfall:",
      shortfall,
    );
    if (source === "mentor_db" && isFirstTime && shortfall >= 15) {
      const html = buildValidityEmailHTML({
        fullName,
        programName,
        bufferDays,
        totalValidityWithBuffer,
        validityRemain,
        pendingSessions,
        sessionDays: SESSION_DAYS,
        timeNeededDays,
        shortfall,
      });

      try {
        await sendMailUtil({
          from: "support@balancenutrition.in",
          to: u.email_id,
          cc: ["clientservices@balancenutrition.in"],
          bcc: [u.mentor_email],
          subject: "Urgent Message from your Mentor",
          html: html,
        });
      } catch (err) {
        console.error("Email send error:", err);
      }
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Expiry Date Updated Successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const insertComProcessLog = async (req, res, next) => {
  try {
    const {
      user_id,
      call_done_by_old_mentor = "no",
      change_requested_by,
      completed_sessions = 0,
      pending_sessions = 0,
      is_advanced_purchase = null,
      old_mentor_id = null,
      new_mentor_id = null,
      program_id = null,
      reason = "",
      reason_for_change = "",
      remark_from_old_mentor = "",
      approval_status = "pending",
      approval_by = null,
    } = req.body;

    // Safety validations (optional)
    if (!user_id || !change_requested_by || !approval_status) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const fields = [
      "user_id",
      "call_done_by_old_mentor",
      "change_requested_by",
      "completed_sessions",
      "pending_sessions",
      "is_advanced_purchase",
      "old_mentor_id",
      "new_mentor_id",
      "program_id",
      "reason",
      "reason_for_change",
      "remark_from_old_mentor",
      "approval_status",
      "approval_by",
    ];

    const values = [
      user_id,
      call_done_by_old_mentor,
      change_requested_by,
      completed_sessions,
      pending_sessions,
      is_advanced_purchase,
      old_mentor_id,
      new_mentor_id,
      program_id,
      reason,
      reason_for_change,
      remark_from_old_mentor,
      approval_status,
      approval_by,
    ];

    const result = await insertRecord("com_process_log", fields, values);

    if (result.affectedRows === 0) {
      return next(new ErrorHandler("Insert failed", 400));
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Log inserted successfully",
      data: { id: result.insertId },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Insert error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const listComProcessLogs = async (req, res, next) => {
  try {
    const {
      old_mentor_id,
      approval_status,
      search = "",
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.min(Number(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE conditions
    const whereClauses = [];
    if (old_mentor_id)
      whereClauses.push(`cpl.old_mentor_id = ${Number(old_mentor_id)}`);
    if (approval_status)
      whereClauses.push(`cpl.approval_status = '${approval_status}'`);

    // Optional search (applies on user details)
    const searchClause = search
      ? `(
          ud.first_name LIKE '%${search}%'
          OR ud.last_name LIKE '%${search}%'
          OR CONCAT(ud.first_name, ' ', ud.last_name) LIKE '%${search}%'
          OR ud.email_id LIKE '%${search}%'
          OR ud.phone LIKE '%${search}%'
        )`
      : "";

    if (searchClause) whereClauses.push(searchClause);

    const whereSQL = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // Main query for paginated results
    const { results, totalCount } = await readRecord({
      table: `(SELECT cpl.*
               FROM com_process_log cpl
               INNER JOIN (
                 SELECT user_id, MAX(created_at) AS latest_created_at
                 FROM com_process_log
                 GROUP BY user_id
               ) latest
                 ON latest.user_id = cpl.user_id
                 AND latest.latest_created_at = cpl.created_at
               ${whereSQL}) cpl`,
      selectFields: [
        "cpl.id",
        "cpl.user_id",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cpl.old_mentor_id) AS old_mentor`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cpl.new_mentor_id) AS new_mentor`,
        "cpl.old_mentor_id",
        "cpl.new_mentor_id",
        "cpl.change_requested_by",
        "cpl.reason",
        "cpl.reason_for_change",
        "cpl.call_done_by_old_mentor",
        "cpl.remark_from_old_mentor",
        "cpl.approval_status",
        "cpl.approval_by AS approval_by_id",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cpl.approval_by) AS approval_by`,
        "cpl.created_at",
        "ud.first_name",
        "ud.email_id",
        "ud.phone",
        "ud.sub_user_status",
      ],
      joins: [
        {
          type: "LEFT",
          table: "users_details ud",
          on: "ud.user_id = cpl.user_id",
        },
      ],
      orderBy: ["cpl.created_at DESC"],
      pagination: {
        page: pageNum,
        limit: limitNum,
      },
      countTotal: true,
    });

    // Map final response
    const data = results.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      first_name: r.first_name,
      email_id: r.email_id,
      phone: r.phone,
      user_status: r.sub_user_status,
      old_mentor: r.old_mentor,
      new_mentor: r.new_mentor,
      old_mentor_id: r.old_mentor_id,
      new_mentor_id: r.new_mentor_id,
      change_requested_by: r.change_requested_by,
      reason: r.reason,
      reason_for_change: r.reason_for_change,
      call_done_by_old_mentor: r.call_done_by_old_mentor,
      remark_from_old_mentor: r.remark_from_old_mentor,
      approval_status: r.approval_status,
      approval_by: r.approval_by,
      approval_by_id: r.approval_by_id,
      created_at: moment(r.created_at).format("YYYY-MM-DD HH:mm:ss"),
    }));

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Latest process logs per user fetched successfully",
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount: totalCount || data.length,
          totalPages: Math.ceil((totalCount || 0) / limitNum),
        },
      }),
    );
  } catch (error) {
    console.error("List Logs Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateComProcessApprovalStatus = async (req, res, next) => {
  try {
    const {
      id,
      user_id,
      approval_status,
      old_mentor_id,
      new_mentor_id,
      approval_by = null,
    } = req.query;

    if (!id || !approval_status) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    // === 1. Update approval status in com_process_log ===
    const result = await updateRecord(
      "com_process_log",
      {
        approval_status,
        approval_by,
        updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { id },
    );

    // === 2. Only proceed if approved ===
    if (approval_status === "approved") {
      // === Update user mentor assignment ===
      const condition = { user_id: parseInt(user_id) };
      const rows = await updateRecord(
        `${tables.userDetails}`,
        {
          mentor_assigned: new_mentor_id,
          old_mentor_assigned: old_mentor_id,
        },
        condition,
      );

      if (rows.info.substring(0, 15) == "Rows matched: 0") {
        return next(
          new ErrorHandler("No user or member found with given id", 400),
        );
      } else if (rows.info.substring(0, 27) == "Rows matched: 1  Changed: 0") {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: "Same Mentor Already Assigned",
          }),
        );
      }

      // === 3. Insert record in change_of_mentor table ===
      await insertRecord(
        tables.changeOfMentor,
        ["user_id", "old_mentor", "new_mentor"],
        [user_id, old_mentor_id || "0", new_mentor_id],
      );

      // === 4. Fetch user & mentor details ===
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "ud.last_name",
          "ud.email_id",
          "ud.mentor_assigned",
          "ad1.crm_user AS old_mentor_name",
          "ad1.email_id AS old_mentor_email",
          "ad2.crm_user AS new_mentor_name",
          "ad2.email_id AS new_mentor_email",
          "cpl.change_requested_by",
          "cpl.call_done_by_old_mentor",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad1`,
            on: "ad1.admin_user_id = ud.old_mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad2`,
            on: "ad2.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: "com_process_log cpl",
            on: "cpl.user_id = ud.user_id",
          },
        ],
        conditions: [
          { field: "ud.user_id", operator: "=", value: Number(user_id) },
          { field: "cpl.id", operator: "=", value: Number(id) },
        ],
      });

      if (!userDetails.length) {
        return next(new ErrorHandler("User details not found", 404));
      }

      const u = userDetails[0];
      const clientName = `${u.first_name} ${u.last_name}`;
      const oldMentor = u.old_mentor_name || "Previous Mentor";
      const newMentor = u.new_mentor_name || "New Mentor";
      const changeBy = u.change_requested_by || "mentor";
      const callDone = u.call_done_by_old_mentor === "yes";
      const newMentorEmail = u.new_mentor_email;
      const oldMentorEmail = u.old_mentor_email;
      const clientEmail = u.email_id;

      // === 5. Send Notification ===
      const notification_id = changeBy === "mentor" ? 651 : 652;
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id,
          sent_via: req.headers["source"],
        },
      );

      // === 6. Send Chat if requested by Mentor ===
      if (changeBy === "mentor") {
        const chatHtml = callDone
          ? `
<p>Hello <b>${u.first_name}</b>,</p>

<p>I hope you're doing well. As we discussed on the call & you know, I have been battling some ongoing health concerns, which have become chronic & need my attention.</p>

<p>Hence, I will be needing to take a sabbatical from work for some time.</p>

<p>I have personally picked your new mentor, who will be taking care of your program hereafter. I have given her all your profile details as well as other important pointers.</p>

<p>Rest assured, she is qualified, has worked with me & knows your case well.</p>

<p>You will be getting an intimation on your app & by mail from <b>Khyati ma'am</b> as well. She will be introducing herself & getting on a call with you as well.</p>

<p>Please ensure your app is updated & check your emails regularly :)</p>

<p>I plan to join BN again soon. Until then, please take care of your health & make me proud!</p>

<p><b>Warm regards,</b><br>${oldMentor}</p>
`
          : `
<p>Hello <b>${u.first_name}</b>,</p>

<p>I hope you're doing well. I tried to connect with you over a call, but it did not go through.</p>

<p>I wanted to share an important update with you personally. I have been battling some ongoing health concerns, which have become chronic & need my attention. I will be needing to take a sabbatical from work for some time.</p>

<p>I have personally picked your new mentor, <b>${newMentor}</b>, who will be taking care of your program hereafter. I have given her all your profile details as well as other important pointers.</p>

<p>Rest assured, she is qualified, has worked with me & knows your case well.</p>

<p>You will be getting an intimation on your app & by mail from <b>Khyati ma'am</b> as well. ${newMentor} will be introducing herself in the app shortly.</p>

<p>Please ensure your app is updated & be sure to check your emails & notifications :)</p>

<p>I hope to join BN again soon. Until then, please take care of your health & make me proud!</p>

<p><b>Warm regards,</b><br>${oldMentor}</p>
`;

        await clientEnquiry.create({
          mentor_id: old_mentor_id,
          type: "broadcast",
          sender: "mentor",
          query: chatHtml, // HTML chat
          user_id: user_id,
          name: oldMentor,
        });
      }

      // === 7. Send Mail (from Khyati) ===
      const html =
        changeBy === "mentor"
          ? `
<p>Hi ${u.first_name},</p>

<p>I hope you both are happy with your program so far at Balance Nutrition.</p>
<p>Our aim is always to ensure we give you more than what you expect :)</p>

<p>Your mentor ${oldMentor} has to take a break from working due to an ongoing health concern, which has become chronic.</p>

<p>So, ${newMentor} [Nutritionist] will be taking care of your program. She has been well versed in your case as she was working closely with ${oldMentor} & her clients.</p>

<p>A new mentor also brings in a newer approach, more robust follow-ups & a different style toward your diet plans.</p>

<p>She is well-trained and experienced & I have also attached her ID Card in the mail.</p>

<p>You can now chat with her in the app & book your call with her too.</p>

<p>In case you need any assistance with the BN App, feel free to WhatsApp client services at +918928001617</p>

<p><a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Click here to schedule a call with her</a></p>

<p>P.S. Your progress is our utmost priority and I will make sure we succeed :)</p>
`
          : `
<p>Hi ${u.first_name},</p>

<p>I hope you both are happy with your program so far at Balance Nutrition.</p>
<p>Our aim is always to ensure we give you more than what you expect :)</p>

<p>As per your request, ${newMentor} [Nutritionist] will be taking care of your program. She has been well versed in your case as she was working closely with ${oldMentor} & her clients.</p>

<p>A new mentor also brings in a newer approach, more robust follow-ups & a different style toward your diet plans.</p>

<p>She is well-trained and experienced & I have also attached her ID Card in the mail.</p>

<p>You can now chat with her in the app & book your call with her too.</p>

<p>In case you need any assistance with the BN App, feel free to WhatsApp client services at +918928001617</p>

<p><a href="https://www.balancenutrition.in/app_link/screen_id=294/call_type=45">Click here to schedule a call with her</a></p>

<p>P.S. Your progress is our utmost priority and I will make sure we succeed :)</p>
`;

      await sendMailUtil({
        from: "khyati@balancenutrition.in",
        to: clientEmail,
        cc: [newMentorEmail, oldMentorEmail],
        bcc: ["testerteam@balancenutrition.in"],
        subject: "Important : Your Mentor Has Been Changed",
        html,
      });

      // === 8. Mentor Portal Notification + SSE ===
      const data = {
        title: `${clientName} has Been Assigned`,
        priority: 1,
        redirect: "?modal=new-assigned",
      };

      await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, new_mentor_id, data.title, "/new-assigned"],
      );

      sendSSEEvent({ mentor_id: new_mentor_id, data });
    }

    if (result.affectedRows === 0) {
      return next(new ErrorHandler("No record updated", 404));
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Approval status updated successfully",
      }),
    );
  } catch (error) {
    console.error("Update Approval Status Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendCloseDbMail = async (req, res) => {
  try {
    const { mentor_name, mentor_email, oc_mail_content, lead_mail_content } =
      req.body;

    // ✅ Validate input
    if (
      !mentor_name ||
      !mentor_email ||
      !oc_mail_content ||
      !lead_mail_content
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields (mentor_name, mentor_email, oc_mail_content, lead_mail_content) are required.",
      });
    }

    // === Recipients ===
    const to = [
      "vikram.gupta@balancenutrition.in",
      "jitendra.desai@balancenutrition.in",
    ];
    const cc = ["khyati.rupani@balancenutrition.in", mentor_email];
    const bcc = ["teamtech@balancenutrition.in"]; // optional — can add audit or dev team if needed

    // === Subject ===
    const subject = `Mentor DB Close Mail from ${mentor_name} - (${moment().format(
      "DD-MM-YYYY",
    )})`;

    // === Combined Email Body ===
    const html = `
      <div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
        <h2 style="color:#2d8cff;">Mentor DB Close Mail</h2>
        <p><strong>Mentor:</strong> ${mentor_name}</p>
        <hr style="border:none; border-top:1px solid #ddd; margin:15px 0;" />
        <h3>OC Transfer Details</h3>
        <div>${oc_mail_content}</div>
        <hr style="border:none; border-top:1px dashed #bbb; margin:25px 0;" />
        <h3>Lead Transfer Details</h3>
        <div>${lead_mail_content}</div>
        <hr style="border:none; border-top:1px solid #ddd; margin:15px 0;" />
        <p style="font-size:12px; color:#777;">This email was sent automatically by the BN internal system.</p>
      </div>
    `;

    // === Send the email ===
    await sendMailUtil({
      from: "support@balancenutrition.in",
      to,
      cc,
      bcc,
      subject,
      html,
    });

    // ✅ Success response
    return res.status(200).json({
      success: true,
      message:
        "Email sent successfully to Vikram, Jitendra (cc: Khyati, TeamTech, and Mentor).",
    });
  } catch (error) {
    console.error("Error in sendMentorAndLeadMail:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

const lastDevice = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.fcm_registry}`,
      selectFields: ["device", "app_version", "added_date"],
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
      orderBy: ["added_date DESC"],
    });
    const data = results.map((i) => ({
      device: i.device,
      app_version: i.app_version,
      added_date: moment(i.added_date).format("YYYY-MM-DD HH:mm:ss"),
    }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Last Device Details",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const goalsByUserIdOld = async (req, res, next) => {
  try {
    const { user_id, sub_order_id } = req.query;

    const { results: goalResults } = await readRecord({
      table: `${tables.bnMyGoals}`,
      selectFields: ["comment", "goal_type", "added_date"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "sub_order_id", operator: "=", value: sub_order_id },
      ],
      groupBy: ["goal_type"],
    });

    const goalTypes = {
      milestone_goal: {
        type: "milestone_goal",
        comment: "N/A",
        added_date: "N/A",
      },
      achieved_goal: {
        type: "achieved_goal",
        comment: "N/A",
        added_date: "N/A",
      },
      new_goal: { type: "new_goal", comment: "N/A", added_date: "N/A" },
      assessment_goal: { type: "assessment_goal", comment: "N/A" },
    };

    goalResults.forEach((goal) => {
      const goalTypeKey =
        goal.goal_type === 1
          ? "milestone_goal"
          : goal.goal_type === 2
            ? "achieved_goal"
            : goal.goal_type === 3
              ? "new_goal"
              : null;

      if (goalTypeKey) {
        goalTypes[goalTypeKey] = {
          type: goalTypeKey,
          comment: goal.comment,
          added_date: moment(goal.added_date).format("YYYY-MM-DD HH:mm:ss"),
        };
      }
    });

    const { results: assessmentResults } = await readRecord({
      table: `${tables.assessment_personal_details}`,
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
      selectFields: ["other_goals"],
    });

    if (assessmentResults.length && assessmentResults[0].other_goals) {
      goalTypes.assessment_goal = {
        type: "assessment_goal",
        comment: assessmentResults[0].other_goals,
      };
    }
    const allGoals = Object.values(goalTypes);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Goals fetched successfully",
      data: allGoals,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const goalsByUserId = async (req, res, next) => {
  try {
    const { user_id, sub_order_id } = req.query;

    const { results: goalResults } = await readRecord({
      table: `${tables.bnMyGoalsNew}`,
      selectFields: ["comment", "added_date"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "sub_order_id", operator: "=", value: sub_order_id },
      ],
    });

    const goalTypes = {
      milestone_goal: {
        type: "milestone_goal",
        comment: "N/A",
        added_date: "N/A",
      },
      achieved_goal: {
        type: "achieved_goal",
        comment: "N/A",
        added_date: "N/A",
      },
      new_goal: { type: "new_goal", comment: "N/A", added_date: "N/A" },
      pending_goals: {
        type: "pending_goal",
        comment: "N/A",
        added_date: "N/A",
      },
      assessment_goal: { type: "assessment_goal", comment: "N/A" },
    };

    if (!goalResults.length) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "No goals found for this user",
        data: Object.values(goalTypes),
      });
      return res.status(200).json(apiresponse);
    }

    // Safe parsing of comment field
    const parsedComment = safeJSONParse(goalResults[0]?.comment || "{}", {
      new_goals: [],
      goals_achieved: [],
      milestone_achieved: [],
      pending_goals: [],
    });

    const {
      new_goals = [],
      goals_achieved = [],
      milestone_achieved = [],
      pending_goals = [],
    } = parsedComment;

    goalTypes.new_goal.comment = Array.isArray(new_goals)
      ? new_goals.join(", ")
      : "N/A";
    goalTypes.achieved_goal.comment = Array.isArray(goals_achieved)
      ? goals_achieved.join(", ")
      : "N/A";
    goalTypes.milestone_goal.comment = Array.isArray(milestone_achieved)
      ? milestone_achieved.join(", ")
      : "N/A";
    goalTypes.pending_goals.comment = Array.isArray(pending_goals)
      ? pending_goals.join(", ")
      : "N/A";

    for (const goal of Object.keys(goalTypes)) {
      goalTypes[goal].added_date = moment(goalResults[0]?.added_date).isValid()
        ? moment(goalResults[0].added_date).format("YYYY-MM-DD HH:mm:ss")
        : "N/A";
    }

    const { results: assessmentResults } = await readRecord({
      table: `${tables.assessment_personal_details}`,
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
      selectFields: ["other_goals"],
      orderBy: ["added_date DESC"],
      pagination: { limit: 1, page: 1 },
    });

    if (assessmentResults.length && assessmentResults[0].other_goals) {
      try {
        const parsedAssessment = JSON.parse(assessmentResults[0].other_goals);
        goalTypes.assessment_goal.comment =
          Object.values(parsedAssessment).join(", ");
      } catch (e) {
        goalTypes.assessment_goal.comment =
          assessmentResults[0].other_goals || "N/A";
      }
    }

    const allGoals = Object.values(goalTypes);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Goals fetched successfully",
      data: allGoals,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error occurred in goalsByUserId:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const overallPending = async (req, res, next) => {
  try {
    const { user_id, sub_order_id } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `CASE 
          WHEN dsl.diet_start_date IS NOT NULL 
               AND DATEDIFF(CURDATE(), dsl.diet_start_date) > 5 
               AND DATEDIFF(CURDATE(), dsl.diet_start_date) < 10
               AND dsl.mid_session_weight = 0 
          THEN DATE_ADD(dsl.diet_start_date, INTERVAL 5 DAY)
          WHEN dsl.diet_start_date IS NOT NULL 
               AND DATEDIFF(CURDATE(), dsl.diet_start_date) > 10 
               AND dsl.end_session_weight = 0 
          THEN DATE_ADD(dsl.diet_start_date, INTERVAL 10 DAY)
          ELSE NULL
        END AS weight_overdue`,

        `CASE 
          WHEN dsl.diet_start_date IS NOT NULL 
               AND DATEDIFF(CURDATE(), dsl.diet_start_date) > 10 
               AND dsl.end_session_weight <> 0 
               AND (dsl.user_id IS NULL OR dsl.diet_status <> 4)
          THEN DATE_ADD(dsl.diet_start_date, INTERVAL 11 DAY)
          ELSE NULL
        END AS diet_overdue`,

        `CASE 
          WHEN DATE(sop.start_date) < CURDATE() 
               AND ud.sub_user_status = 'notstarted' 
          THEN sop.start_date 
          ELSE NULL 
        END AS not_started_overdue`,

        `CASE 
          WHEN DATE(latest_cu.schedule_date) < CURDATE() 
               AND latest_cu.call_status = 0 
          THEN latest_cu.schedule_date 
          ELSE NULL 
        END AS call_missed`,

        `CASE 
          WHEN sp.added_date IS NOT NULL 
               AND DATE(sp.added_date) < COALESCE((
                   SELECT lfl.added_date 
                   FROM ${tables.leadFollowUpLogs} lfl 
                   WHERE lfl.user_id = ud.user_id 
                   ORDER BY lfl.added_date DESC 
                   LIMIT 1
               ), DATE_SUB(CURDATE(), INTERVAL 1 DAY))
          THEN NULL
          ELSE sp.added_date
        END AS pitched_but_no_fu`,
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions = dsl.session",
        },
        {
          type: "LEFT",
          table: `(
            SELECT cu.user_id, cu.schedule_date, cu.call_status
            FROM ${tables.callUpdates} cu
            WHERE cu.user_id = ${user_id}  -- Parameterized safely in actual DB call
            ORDER BY cu.schedule_date DESC
            LIMIT 1
          ) latest_cu`,
          on: "latest_cu.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        { field: "ud.active_order_id", operator: "=", value: sub_order_id },
      ],
    });

    const row = results[0] || {};

    const formatDate = (date) =>
      date
        ? `${moment(date).format("DD-MM-YYYY")} ${moment(date).fromNow()}`
        : null;

    const pendingTasks = {
      weight_overdue: formatDate(row.weight_overdue),
      diet_overdue: formatDate(row.diet_overdue),
      not_started_overdue: formatDate(row.not_started_overdue),
      call_missed: formatDate(row.call_missed),
      pitched_but_no_follow_up: formatDate(row.pitched_but_no_fu),
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Overall pending tasks fetched successfully",
      data: pendingTasks,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in overallPending:", error);
    return next(new ErrorHandler("Internal Server Error", 500, error.message));
  }
};

const receivedNotification = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const notification = await userNotification
      .find({ user_id })
      .select("title description added_date notification_id -_id")
      .sort({ added_date: -1 });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Received notifications fetched successfully",
      data: notification,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendNotification = async (req, res, next) => {
  try {
    const { user_id, content_id } = req.body;

    const [{ results: userDetails }, { results: content }] = await Promise.all([
      readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: user_id,
          },
        ],
        selectFields: [
          "ud.fcm_token",
          "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
        ],
      }),
      readRecord({
        table: `${tables.bnAppReminderContent} rac`,
        conditions: [
          {
            field: "rac.id",
            operator: "=",
            value: content_id,
          },
        ],
        selectFields: ["rac.subject", "rac.content", "rac.redirect_page"],
      }),
    ]);

    const payload = {
      notification: {
        title: content[0].subject,
        body: content[0].content.replace(
          /\[\[name\]\]/g,
          userDetails[0].full_name,
        ),
      },
      data: {
        redirect_page: content[0].redirect_page,
      },
    };
    try {
      await fcm.sendToDevice(userDetails[0].fcm_token, payload);
    } catch (error) {
      console.log(error);
      return next(new ErrorHandler("Error sending notification", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Notification sent successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const notifications = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.notifications}`,
      selectFields: ["title", "description", "id"],
      conditions: [
        {
          field: "id",
          operator: "!=",
          value: 0,
        },
      ],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Notifications fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const toggleWati = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["wati"],
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });
    console.log(typeof results[0].wati, 1146);
    let updatedData;
    const condition = {
      user_id: user_id,
    };
    if (results[0].wati === 0) {
      updatedData = { wati: 1 };
    }
    if (results[0].wati === 1) {
      updatedData = { wati: 0 };
    }
    const updatedWatiStatus = await updateRecord(
      `${tables.userDetails}`,
      updatedData,
      condition,
    );

    if (updatedWatiStatus.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update Wati status", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Wati status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const toggleProNotification = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["pro_notification"],
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });

    let updatedData;
    const condition = {
      user_id: user_id,
    };
    if (results[0].pro_notification === 0) {
      updatedData = { pro_notification: 1 };
    }
    if (results[0].pro_notification === 1) {
      updatedData = { pro_notification: 0 };
    }
    const updatedWatiStatus = await updateRecord(
      `${tables.userDetails}`,
      updatedData,
      condition,
    );

    if (updatedWatiStatus.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to update pro_notification status", 400),
      );
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Pro notification status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function emergencyOnHoldNotification(data) {
  try {
    const {
      user_id,
      username,
      mentor_assigned,
      duration,
      crm_user,
      user_email_id,
      originalValidityEndDate,
      newValidityEndDate,
      mentor_email_id,
    } = data;
    console.log(data, "emergencyOnHoldNotification data");
    const tasks = [];
    tasks.push(
      axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: 972,
          sent_via: "action_trigger",
        },
      ),
    );
    tasks.push(
      clientEnquiry.create({
        mentor_id: mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: `<p>Hi <strong>${username}</strong>,</p>

<p>I am happy to let you know that we have received approval for your break request during the ongoing program.</p>

<p>Please verify these details at your end too:</p>

<ul>
  <li><strong>Break Reason:</strong> Personal emergency</li>
  <li><strong>Break Duration:</strong> ${duration} Days</li>
  <li><strong>Original Program Validity End Date:</strong> ${originalValidityEndDate}</li>
  <li><strong>New Validity End Date (after extension):</strong> ${newValidityEndDate}</li>
</ul>

<p>Please take this time to focus on what you need.</p>

<p>You'll be notified once your break is over, to update your weight and resume your program.</p>

<p>Take care &amp; please reach out if you need any support.</p>`,
        user_id: user_id,
        name: crm_user,
      }),
    );
    const mailData = {
      from: "Support <support@balancenutrition.in>",
      to: user_email_id,
      subject: "Break Approval & Validity Extension Confirmation",
      cc: [mentor_email_id],
      html: `<html>
  <body style="font-family: Arial, sans-serif; font-size: 15px; color: #333; line-height: 1.6;">

    <p>Hi <strong>${username}</strong>,</p>

    <p>This email confirms the approval of your break during your current program.</p>

    <p>Please verify these details at your end too:</p>

    <ul>
      <li><strong>Break Reason:</strong> Personal emergency</li>
      <li><strong>Break Duration:</strong> ${duration} days</li>
      <li><strong>Original Program Validity End Date:</strong> ${originalValidityEndDate}</li>
      <li><strong>New Validity End Date (after extension):</strong> ${newValidityEndDate}</li>
    </ul>

    <p>Your break has been approved, and your program validity has now been extended by <strong>${duration} days</strong>.</p>

    <p>Once this period is over and you're ready, we request that you stay consistent so you continue progressing toward your health goals.</p>

    <p><strong>P.S.</strong> Please watch out for the notifications you receive during your break &amp; keep in touch with your mentor as required.</p>

    <p><strong>P.P.S.</strong> Please check the new BN guides that have been activated for you in the BN App, too.</p>

    <p>Wishing you strength and ease during this time.</p>
    
  </body>
</html>`,
    };
    tasks.push(sendMailUtil(mailData));
    await Promise.all(tasks);
  } catch (error) {
    console.log("Emergency OnHold Notification Error:", error);
  }
}

const toggleClientOnhold = async (req, res, next) => {
  try {
    const {
      user_id,
      sub_order_id,
      session,
      days,
      start_date,
      end_date,
      note,
      reason: onhold_reason = "",
    } = req.body;
    const userCondition = { user_id };
    let notification_id = 574; // Default notification ID (used for "Travel")

    // === 1. Update sub_user_status if break starts today ===
    let updatedOnHoldClient = null;
    if (
      moment().format("YYYY-MM-DD") === moment(start_date).format("YYYY-MM-DD")
    ) {
      updatedOnHoldClient = await updateRecord(
        `${tables.userDetails}`,
        { sub_user_status: "Onhold" },
        userCondition,
      );
    }

    if (
      updatedOnHoldClient !== null &&
      updatedOnHoldClient.affectedRows === 0
    ) {
      return next(
        new ErrorHandler("Failed to update client onhold status", 400),
      );
    }

    // === 2. Update break details in sub_order_programs ===
    const updateSubOrderPrograms = await updateRecord(
      `${tables.subOrderPrograms}`,
      {
        break_start_date: moment(start_date).format("YYYY-MM-DD HH:mm:ss"),
        break_end_date: moment(end_date).format("YYYY-MM-DD HH:mm:ss"),
        break_note: note,
      },
      { sub_order_id },
    );

    if (updateSubOrderPrograms.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to update client onhold status", 400),
      );
    }

    // === 3. Insert Onhold Record ===
    const columns = [
      "user_id",
      "sub_order_id",
      "session",
      "start_date",
      "end_date",
      "days",
      "onhold_note",
      "onhold_reason",
    ];
    const values = [
      user_id,
      sub_order_id,
      session,
      moment(start_date).format("YYYY-MM-DD HH:mm:ss"),
      moment(end_date).format("YYYY-MM-DD HH:mm:ss"),
      days,
      note,
      onhold_reason,
    ];

    const createdClientOnhold = await insertRecord(
      `${tables.onholdClients}`,
      columns,
      values,
    );

    if (createdClientOnhold.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to create client onhold record", 400),
      );
    }

    // === 4. Fetch Client + Mentor Details with expiry_date ===
    const { results: clientDetails } = await readRecord({
      selectFields: [
        "ud.first_name",
        "ud.email_id",
        "ud.user_id",
        "ud.mentor_assigned",
        "sop.expiry_date",
        "ad.email_id as mentor_email",
        "ad.crm_user as mentor_name",
      ],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
      ],
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: sub_order_id },
      ],
    });

    if (!clientDetails.length) {
      return next(new ErrorHandler("Client details not found", 404));
    }

    const user = clientDetails[0];
    const clientName = user.first_name;
    const oldEndDate = user.expiry_date;
    const oldEndDateFmt = moment(oldEndDate).format("Do MMM YYYY");

    // === 5. Extend expiry_date by break days ===
    const newEndDate = moment(oldEndDate)
      .add(days, "days")
      .format("YYYY-MM-DD HH:mm:ss");
    const newEndDateFmt = moment(newEndDate).format("Do MMM YYYY");

    await updateRecord(
      `${tables.subOrderPrograms}`,
      { expiry_date: newEndDate },
      { sub_order_id },
    );

    // === 6. Check if client consumes alcohol ===
    const { results: alcoholData } = await readRecord({
      selectFields: ["alcohol_consumption"],
      table: "assessment_nutrition_and_lifestyle",
      conditions: [
        { field: "user_id", operator: "=", value: user.user_id },
        {
          field: "alcohol_consumption",
          operator: "NOT IN",
          value: ["", "Never"],
        },
      ],
    });

    const includeAlcoholGuide = alcoholData.length > 0;

    // === 7. If Travel, Send Mail + Chat + Notification ===
    if (onhold_reason === "Travel") {
      // --- Mail ---
      const html = `
        <p>Hi ${clientName},</p>
        <p>This email confirms the approval of your break during your current program. Please verify these details at your end too.</p>
        <ul>
            <li><b>Break Reason:</b> ${onhold_reason}</li>
            <li><b>Break Duration:</b> ${days} days</li>
            <li><b>Original Program Validity End Date:</b> ${oldEndDateFmt}</li>
            <li><b>New Validity End Date (after extension):</b> ${newEndDateFmt}</li>
        </ul>
        <p>Your break has been approved, and your program validity has now been extended by ${days} days.</p>
        <p>Once you resume, we request that you stay consistent so that you continue progressing towards your health goals without further delays.</p>
        <p><b>P.S.</b> Please watch out for the notifications you receive during your break & update your mentor with your meals regularly.</p>
        <p><b>P.P.S.</b> Please use your new guides:</p>
        <ul>
          <li>🍽️ <a href="https://balancenutrition.in/bn-restaurant-guide?client_id=${
            user.user_id
          }">Restaurant Guide</a></li>
          ${
            includeAlcoholGuide
              ? `<li>🥂 <a href="https://balancenutrition.in/bn-alcohol-guide?client_id=${user.user_id}">QuickFillers Guide</a></li>`
              : ""
          }
        </ul>
        <p>We wish you safe travels :)</p>
      `;

      await sendMailUtil({
        from: "support@balancenutrition.in",
        to: user.email_id,
        cc: ["clientservices@balancenutrition.in"],
        bcc: [user.mentor_email],
        subject: "Break Approval & Validity Extension Confirmation",
        html,
      });

      // --- Chat with mentor ---
      const chatMessage = `
          <p>Hi ${clientName},</p>
          <p>I’m happy to let you know that your break request during the ongoing program has been approved. Please verify these details at your end too:</p>
          <ul>
            <li><strong>Break Reason:</strong> ${onhold_reason}</li>
            <li><strong>Break Duration:</strong> ${days} days</li>
            <li><strong>Original Program Validity End Date:</strong> ${oldEndDateFmt}</li>
            <li><strong>New Validity End Date (after extension):</strong> ${newEndDateFmt}</li>
          </ul>
          <p>Once your break is over, you will be notified to update your weight and resume the program.</p>
          <p>Have a great time &amp; enjoy yourself! ✨</p>
       
      `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name,
      });

      // --- Notification ---
      if (notification_id) {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id,
            sent_via: "cron",
          },
        );
      }
    }

    // === 8. If Health Issues, Send Mail + Chat + Notification ===
    if (onhold_reason === "Health Issues") {
      // --- Mail ---
      const html = `
        <p>Hi ${clientName},</p>
        <p>This email confirms the approval of your break during your current program. Please verify these details at your end too.</p>
        <ul>
            <li><b>Break Reason:</b> ${onhold_reason}</li>
            <li><b>Break Duration:</b> ${days} days</li>
            <li><b>Original Program Validity End Date:</b> ${oldEndDateFmt}</li>
            <li><b>New Validity End Date (after extension):</b> ${newEndDateFmt}</li>
        </ul>
        <p>Your medical break has been approved, and your program validity has now been extended by ${days} days.</p>
        <p>Once you recover and are ready to resume, we request that you stay consistent so that you continue progressing towards your health goals without further delays.</p>
        <p><b>P.S.</b> Please watch out for the notifications you receive during your break & update your mentor with your meals regularly.</p>
        <p>Wishing you a gentle, speedy recovery.</p>
      `;

      await sendMailUtil({
        from: "support@balancenutrition.in",
        to: user.email_id,
        cc: ["clientservices@balancenutrition.in"],
        bcc: [user.mentor_email],
        subject: "Medical Break Approval & Validity Extension Confirmation",
        html,
        template_id: "YourStandardTemplateID", // Use a standard template ID for email tracking
      });

      // --- Chat with mentor ---
      const chatMessage = `
          <p>Hi ${clientName},</p>

          <p>Your request for a medical break during your ongoing program has been approved. Please verify these details at your end too:</p>

          <ul>
            <li><strong>Break Reason:</strong> ${onhold_reason}</li>
            <li><strong>Break Duration:</strong> ${days} days</li>
            <li><strong>Original Program Validity End Date:</strong> ${oldEndDateFmt}</li>
            <li><strong>New Validity End Date (after extension):</strong> ${newEndDateFmt}</li>
          </ul>

          <p>Please focus on your recovery and take adequate rest. Once you are medically fit and ready to restart, we’ll resume your plan.</p>

          <p>You will be notified once your break is over to update your weight & resume the program.</p>
          <p>Take care and get well soon.</p>
       
      `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name,
      });

      // --- Notification ---
      notification_id = 667; // For Health Issues reason
      if (notification_id) {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id,
            sent_via: "cron",
          },
        );
      }
    }

    // === 9. If Wedding, Send Mail + Chat + Notification ===
    if (onhold_reason === "Weddings") {
      // --- Mail ---
      const html = `
        <p>Hi ${clientName},</p>
        <p>This email confirms the approval of your wedding break during your current program. Please verify these details at your end too.</p>
        <ul>
            <li><b>Break Reason:</b> Wedding preparation/celebrations</li>
            <li><b>Break Duration:</b> ${days} days</li>
            <li><b>Original Program Validity End Date:</b> ${oldEndDateFmt}</li>
            <li><b>New Validity End Date (after extension):</b> ${newEndDateFmt}</li>
        </ul>
        <p>Your wedding break has been approved, and your program validity has now been extended by ${days} days.</p>
        <p>Once your celebrations are over and you're ready, we request that you stay consistent to continue progressing toward your health goals.</p>
        <p><b>P.S.</b> Please watch out for the notifications you receive during your break & update your mentor with your meals regularly.</p>
        <p><b>P.P.S.</b> Please check the new BN guides that have been activated for you in the BN App, too.</p>
        <p>We wish you a joyous and beautiful wedding celebration!</p>
      `;

      await sendMailUtil({
        from: "support@balancenutrition.in",
        to: user.email_id,
        cc: ["clientservices@balancenutrition.in"],
        bcc: [user.mentor_email],
        subject: "Wedding Break Approval & Validity Extension Confirmation",
        html,
        template_id: "YourStandardTemplateID", // Use a standard template ID for email tracking
      });

      // --- Chat with mentor ---
      const chatMessage = `
          <p>Hi ${clientName},</p>
          <p>I am happy to let you know that we have received approval for your wedding break request during the ongoing program. Please verify these details at your end too:</p>
          <ul>
            <li><strong>Break Reason:</strong> Wedding preparation/celebrations</li>
            <li><strong>Break Duration:</strong> ${days} days</li>
            <li><strong>Original Program Validity End Date:</strong> ${oldEndDateFmt}</li>
            <li><strong>New Validity End Date (after extension):</strong> ${newEndDateFmt}</li>
          </ul>
          <p>Enjoy your wedding celebrations. In the meantime, check out the BN Wedding Guide for tips on staying on track during the celebrations.</p>
          <p>You’ll be notified once your break is over to update your weight and resume your program.</p>
          <p>Have a wonderful time celebrating!</p>
       
      `;

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: chatMessage,
        user_id: user.user_id,
        name: user.mentor_name,
      });

      // --- Notification ---
      notification_id = 668; // For Wedding reason
      if (notification_id) {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id,
            sent_via: "cron",
          },
        );
      }
    }

    if (onhold_reason === "Personal Emergency") {
      const data = {
        user_id: user.user_id,
        username: user.first_name,
        mentor_assigned: user.mentor_assigned,
        duration: days,
        crm_user: user.mentor_name,
        user_email_id: user.email_id,
        originalValidityEndDate: oldEndDateFmt,
        newValidityEndDate: newEndDateFmt,
        mentor_email_id: user.mentor_email,
      };
      await emergencyOnHoldNotification(data);
    }

    // === 10. Final API Response ===
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client onhold status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const paidOnHoldRequest = async (req, res, next) => {
  try {
    const {
      user_id,
      sub_order_id,
      session,
      days,
      start_date,
      end_date,
      note,
      reason = "",
      payment_mode,
      payment_mode_id,
      payment_expiry,
      amount,
      service_id,
      weeks,
      due_date,
    } = req.body;

    if (Number(amount) < 3000 && reason === "Pregnancy") {
      return res.status(400).json({
        statusCode: 400,
        message: "Amount cannot be less than 3000",
      });
    }

    // reading user record
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.phone",
        "pm.program_name",
        "pm.program_id",
        "sop.program_session_id",
        "ud.mentor_assigned",
        "au.email_id as mentor_email",
        "CONCAT(au.first_name, ' ', au.last_name) as mentor_name",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ud.active_order_id",
          operator: "=",
          value: sub_order_id,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop `,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au `,
          on: "au.admin_user_id =ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm `,
          on: "pm.program_id = sop.program_id",
        },
      ],
    });

    if (!userDetails[0]) {
      return next(new ErrorHandler("User not found", 404));
    }

    var paymentLink = null;
    if (payment_mode_id == 1) {
      // creating payment link
      paymentLink = await createPaymentLink({
        amount,
        currency: "INR",
        payment_expiry,
        no_callback_url: true,
        // callback_url:
        //   "https://urogenous-uninfused-janis.ngrok-free.dev/api/v1/client-details/paid-onhold-confirmation",
        description: `Payment Link For ${userDetails[0].first_name} ${userDetails[0].last_name} For onhold - ${reason} - Program - ${userDetails[0].program_name}`,
        source: "Mentor DB",
        notes: note
          ? {
              note: note,
              type: "onhold",
              user_id: user_id,
              sub_order_id: sub_order_id,
            }
          : { type: "onhold", user_id: user_id, sub_order_id: sub_order_id },
        customerDetails: {
          name: `${userDetails[0].first_name} ${userDetails[0].last_name}`,
          email: userDetails[0].email_id || "",
          phone: userDetails[0].phone_number || "",
        },
      });
      console.log(userDetails, paymentLink, "results");
      const newPaymentLinkColumns = [
        "payment_link_id",
        "email",
        "phone_number",
        "program_id",
        "program_session_id",
        "amount",
        "expiry_at",
        "source",
        "payment_link",
        "user_id",
        "admin_user_id",
      ];

      const source = "Mentor DB";
      const newPaymentLinkValues = [
        paymentLink.id,
        userDetails[0].email_id,
        userDetails[0].phone_number,
        userDetails[0].program_id,
        userDetails[0].program_session_id,
        amount,
        payment_expiry,
        source,
        paymentLink.short_url,
        user_id,
        userDetails[0].mentor_assigned,
      ];
      const newPaymentLinkEntry = await insertRecord(
        `${tables.paymentLinks}`,
        newPaymentLinkColumns,
        newPaymentLinkValues,
      );

      if (newPaymentLinkEntry.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While adding new payment link", 400),
        );
      }
    }

    console.log("payment_link", paymentLink?.id);

    var paymentLinkId = null;
    if (paymentLink?.id) {
      paymentLinkId = paymentLink.id;
    }

    let calculatedWeeks;
    let endDate;
    if (reason === "Pregnancy") {
      endDate = moment(due_date).add(40, "days").format("YYYY-MM-DD");
      calculatedWeeks = 40 - moment(due_date).diff(moment(), "weeks");
      console.log(endDate, calculatedWeeks, "END DATE", "WEEKS");
    }

    // inserting into onhold_client_paid_service
    const insertResult = await insertRecord(
      tables.onHoldClientPaidService,
      [
        "user_id",
        "sub_order_id",
        "session",
        "days",
        "start_date",
        "end_date",
        "note",
        "reason",
        "payment_mode",
        "payment_mode_id",
        "payment_expiry",
        "amount",
        "service_id",
        "payment_link_id",
        "weeks",
        "due_date",
      ],
      [
        user_id,
        sub_order_id,
        session,
        days,
        reason !== "Pregnancy" ? start_date : null,
        endDate ? endDate : end_date,
        note ? note : "",
        reason,
        payment_mode,
        payment_mode_id,
        payment_expiry,
        amount,
        service_id,
        paymentLinkId,
        calculatedWeeks ? calculatedWeeks : weeks,
        due_date ? due_date : null,
      ],
    );

    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Error While adding new payment link", 400));
    }

    // email and autochat for confirming request for freezing, and also send email auto chat for payment links and bank details
    console.log(userDetails[0], paymentLink?.short_url, payment_expiry, amount);

    const html = `
        <p>Hi ${userDetails?.[0]?.first_name || ""} ${
          userDetails?.[0]?.last_name || ""
        },</p>
      
        ${
          reason == "Pregnancy"
            ? `  <p>A warm and heartfelt congratulations on your pregnancy from Khyati Ma’am and the entire Team Balance Nutrition. <br> This is such a special moment in your life, and we’re truly happy for you.</p>
                 <p>We completely understand your decision to pause your program during this beautiful phase. To make things easier and comfortable for you, we will be placing your current program on freeze throughout your pregnancy period.</p>
                 <p>To confirm your program freeze, please complete the payment below:</p>
               `
            : `
                 <p>As per BN policy, if you wish to keep your program on hold for more than 30 days, 
                 a nominal fee of ₹50 per day applies beyond the 30-day period.</p>
                 <p>Since you’ve requested to keep your program on hold for ${
                   days || "X"
                 } days, 
                 the applicable charge is ₹${amount || ""} for the additional ${
                   days > 30 ? days - 30 : "X"
                 } days.</p>
                 <p>To continue your on-hold program, please complete your payment ${
                   payment_mode_id === 1 ? "using the link or" : ""
                 } bank details below.</p>
               `
        }

        <p><b>Freezing Amount:</b> ₹${amount || ""}<br>
        <b>Mode of Payment:</b> ${
          payment_mode_id === 1 ? "Payment Link" : "Bank Transfer"
        }</p>
      
        ${
          payment_mode_id === 1
            ? `<p><b>Payment Link:</b> <a href="${
                paymentLink?.short_url || "#"
              }" style="color:#0078d7; text-decoration:none;">${
                paymentLink?.short_url || ""
              }
              </a>
              <span>(valid till: ${moment(payment_expiry).format(
                "DD-MM-YYYY",
              )}) </span>
              </p>`
            : ``
        }
         
        ${
          payment_mode_id === 1
            ? `You can also make the payment directly via bank transfer`
            : `You can make the payment directly via bank transfer`
        }

        <p><b>Account Type</b> – Current Account<br>
        <b>Bank Name</b> – Kotak Mahindra Bank<br>
        <b>Account Holder Name</b> – Balance Nutrition<br>
        <b>Account Number</b> – 1611692202<br>
        <b>IFSC Code</b> – KKBK0000667<br>
        <b>Branch</b> – Dr Ambedkar Road, Khar West, Mumbai</p>

        ${
          reason == "Pregnancy"
            ? `<p>Once your payment is completed, please share a screenshot so we can activate your pregnancy freeze immediately.</p>
        <p>After your freeze is confirmed, we’ll stay gently connected with trimester-wise notes, small reminders, and supportive messages created especially for this phase.</p>
        <p><b>P.S.</b> You will also receive trimester-wise guides in your BN App during the freeze period, feel free to explore them anytime.</p>
        <p><b>P.P.S.</b> If you ever need any quick support or have questions during this phase, you can always reach out to us.</p>
        <p>Wishing you a calm, healthy, and beautifully blessed pregnancy ahead.</p>`
            : `<p>Once your payment is completed, please share a screenshot or transaction confirmation so we can update your program immediately.</p>
        <p>If you have any questions or need help, your mentor will be happy to assist you.</p>`
        }
      
        <p style="margin:0; font-size:14px; color:#555555;">
          Warm regards,<br>
          <strong>Team Balance Nutrition</strong>
        </p>
      `;

    const chatMessagePayment = `<div style="font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6;">
          <p>Hi <b>${userDetails[0]?.first_name} ${
            userDetails[0]?.last_name
          }</b>,</p>
           ${
             reason == "Pregnancy"
               ? `<p>A big congratulations on your pregnancy!</p> <br>
                 <p>Khyati Ma’am and the entire Balance Nutrition team are sending you lots of love and blessings for this beautiful phase.</p> <br>
                 <p>We completely understand your decision to pause your program during this special phase. To make things comfortable for you, we’re keeping your current program on hold and freezing it throughout your pregnancy phase.</p>`
               : `<p>As per BN policy, if your program is on hold for more than <b>30 days</b>, a <b>₹50/day</b> charge applies beyond that period.</p><p>Since your hold duration is <b>${days} days</b>, the total charge is <b>₹${amount}</b> for the extra <b>${
                   days - 30
                 } days</b>.</p><br>`
           }
                ${
                  reason == "Pregnancy"
                    ? "<p>To confirm your freeze, please complete the payment below:</p>"
                    : `<p>Please complete the payment of <b>₹${amount}</b> using the details below so we can confirm your freeze:</p>`
                }
                 
                ${
                  reason == "Pregnancy"
                    ? `<p><b>Freezing Amount:</b> ₹${amount || ""}<br>
                <b>Mode of Payment:</b> ${
                  payment_mode_id === 1 ? "Payment Link" : "Bank Transfer"
                }</p>`
                    : ""
                }
                
                ${
                  payment_mode_id === 1
                    ? `<p><b>Payment Link:</b> <a href="${
                        paymentLink?.short_url || "#"
                      }" style="text-decoration:underline;">${
                        paymentLink?.short_url || ""
                      }
                    </a>
                    <span>(valid till: ${moment(payment_expiry).format(
                      "DD-MM-YYYY",
                    )}) </span>
                    </p>`
                    : ``
                }
              ${
                payment_mode_id == 1
                  ? `<br>You can also make the payment directly via bank transfer:`
                  : "<br>You can make the payment directly via bank transfer"
              }
              <p><b>Bank Details</b></p>
              <p><b>Account Type:</b> Current Account<br>
              <b>Bank Name:</b> Kotak Mahindra Bank<br>
              <b>Account Holder Name:</b> Balance Nutrition<br>
              <b>Account Number:</b> 1611692202<br>
              <b>IFSC Code:</b> KKBK0000667<br>
              <b>Branch:</b> Dr Ambedkar Road, Khar West, Mumbai</p><br/>
              ${
                reason == "Pregnancy"
                  ? `<p>Once the payment is done, please share a screenshot so we can we can register your program freeze immediately. <br> Once your payment is completed, your <b>program freeze will be confirmed</b>.</p>
                  <p>Once again, congratulations from all of us. Wishing you a healthy, safe, and joyful pregnancy ahead. </p>`
                  : "<p>Once your payment is completed, please share a screenshot or transaction confirmation so we can update your program immediately.</p><p>If you have any questions or need help, your mentor will be happy to assist you.</p>"
              }
            </div>`;

    const htmlPaymentLink = await ejs.renderFile(
      path.join(
        __dirname,
        "../../../../../src/mails/onHoldPregnancyTemplate.ejs",
      ),
      {
        html: html,
        year: moment().format("YYYY"),
      },
    );

    console.log(htmlPaymentLink, "htmlPaymentLink");

    await sendMailUtil({
      from: "support@balancenutrition.in",
      to: userDetails[0]?.email_id,
      cc: [
        "clientservices@balancenutrition.in",
        `${userDetails[0]?.mentor_email ? userDetails[0]?.mentor_email : ""}`,
      ],
      bcc: ["testerteam@balancenutrition.in"],
      subject:
        reason === "Pregnancy"
          ? "Sending Love & Support for Your Pregnancy Journey"
          : "Important message from your mentor!",
      html: htmlPaymentLink,
      template_id: "YourStandardTemplateID", // Use a standard template ID for email tracking
    });

    await clientEnquiry.create({
      mentor_id: userDetails[0]?.mentor_assigned,
      type: "broadcast",
      sender: "mentor",
      query: chatMessagePayment,
      user_id: userDetails[0]?.user_id,
      name: userDetails[0]?.mentor_name,
    });

    if (reason === "Pregnancy") {
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [userDetails[0]?.user_id],
            notification_id: 892,
            sent_via: "cron",
          },
        );
      } catch (e) {
        console.log("Notification send failed:", e);
      }
    }

    try {
      let linkCode;
      if (paymentLink) {
        linkCode = paymentLink?.short_url.trim().split("/").pop();
      }
      const watiTemplate =
        reason == "Pregnancy"
          ? payment_mode_id === 1
            ? "pregnancy_freeze_payment_link"
            : "pregnancy_freeze_payment_details"
          : "onhold_other_payment";
      const watiParams =
        reason == "Pregnancy"
          ? payment_mode_id === 1
            ? [
                {
                  name: "name",
                  value:
                    userDetails[0]?.first_name || userDetails[0]?.last_name
                      ? userDetails[0]?.first_name?.trim() +
                        " " +
                        userDetails[0]?.last_name?.trim()
                      : "User",
                },
                { name: "amount", value: amount },
                {
                  name: "razorpayId",
                  value: linkCode,
                },
              ]
            : [
                {
                  name: "name",
                  value:
                    userDetails[0]?.first_name || userDetails[0]?.last_name
                      ? userDetails[0]?.first_name?.trim() +
                        " " +
                        userDetails[0]?.last_name?.trim()
                      : "User",
                },
                { name: "amount", value: amount },
              ]
          : [
              {
                name: "name",
                value:
                  userDetails[0]?.first_name || userDetails[0]?.last_name
                    ? userDetails[0]?.first_name?.trim() +
                      " " +
                      userDetails[0]?.last_name?.trim()
                    : "User",
              },
              { name: "amount", value: amount },
              {
                name: "paymentLink",
                value: `Payment link: ${paymentLink?.short_url.trim()}`,
              },
              { name: "days", value: days },
              { name: "addiontal_days", value: Number(days) - 30 },
            ];
      const fullPhone = `${userDetails[0]?.phone?.replace(/\D/g, "")}`;
      if (!fullPhone) {
        console.warn(
          `⏭ Skipping WATI for user ${cartDetail.user_id} due to missing fields`,
        );
      } else {
        await axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
          {
            template_name: watiTemplate,
            broadcast_name: watiTemplate,
            parameters: watiParams,
          },
        );
        console.log(
          `✅ WATI message sent to ${userDetails[0]?.first_name} (${fullPhone})`,
        );
      }
    } catch (watiErr) {
      console.error(
        `⚠️ Failed to send WATI message for ${userDetails[0]?.first_name}:`,
        watiErr.response?.data || watiErr.message,
      );
    }

    res.status(200).json({
      success: true,
      message: "Successfully onhold request submitted",
      data: [],
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const paidOnHoldConfirmation = async (
  req,
  res,
  next,
  webhookPayload = {},
) => {
  try {
    const { razorpay_payment_link_id, razorpay_payment_link_status } =
      webhookPayload;
    const { user_id, request_id } = req.body;

    var paymentLinkDetails = null;

    if (razorpay_payment_link_id) {
      const payment_status = razorpay_payment_link_status;
      const isverified = verifyRazorpaySignature(req);
      if (!isverified) {
        return next(new ErrorHandler("Invalid signature", 400));
      }
      if (payment_status === "failed") {
        const data = { payment_status: "failed" };
        const condition = { payment_link_id: razorpay_payment_link_id };
        await updateRecord(`${tables.paymentLinks}`, data, condition);

        const apiresponse = new ApiResponse({
          statusCode: 400,
          message: `Payment Failed`,
        });
        return res.status(400).json(apiresponse);
      }

      const { results } = await readRecord({
        table: `${tables.paymentLinks} pl`,
        selectFields: [
          "pl.sub_order_id",
          "pl.program_id",
          "pl.program_session_id",
          "pl.phone_number",
          "pl.service_id",
          "pl.guide_id",
          "pl.amount",
          "pl.user_id",
          "pl.admin_user_id",
        ],
        conditions: [
          {
            field: "pl.payment_link_id",
            operator: "=",
            value: razorpay_payment_link_id,
          },
          {
            field: "pl.payment_status",
            operator: "=",
            value: "pending",
          },
        ],
      });

      paymentLinkDetails = results[0];
      if (!paymentLinkDetails) {
        return next(new ErrorHandler("Payment Link Not Found", 404));
      }
    }

    console.log(req.body, "request body");

    const { results: onHoldClientPaidServiceData } = await readRecord({
      table: `${tables.onHoldClientPaidService} osp`,
      selectFields: [
        "osp.end_date as end_date",
        "ad.crm_user as mentor_name",
        "ad.email_id as mentor_email",
        "ud.phone_number as phone_number",
        "osp.payment_mode as payment_mode",
        "osp.payment_mode_id as payment_mode_id",
        "ud.email_id as email_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "osp.sub_order_id as sub_order_id",
        "osp.session",
        "osp.days",
        "osp.note",
        "osp.reason",
        "osp.start_date as start_date",
        "CONCAT(osp.reason, ' - ', COALESCE(osp.note, '')) as break_reason",
        "sop.expiry_date as expiry_date",
        "ud.user_id",
        "ud.guides",
        "ud.mentor_assigned",
        "osp.service_id",
        "osp.due_date as due_date",
        "osp.amount",
      ],
      conditions: [
        {
          field: "osp.user_id",
          operator: "=",
          value: user_id ? user_id : paymentLinkDetails?.user_id,
        },

        razorpay_payment_link_id
          ? {
              field: "osp.payment_link_id",
              operator: "=",
              value: razorpay_payment_link_id,
            }
          : null,

        request_id
          ? {
              field: "osp.id",
              operator: "=",
              value: request_id,
            }
          : null,
      ].filter(Boolean),

      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "osp.sub_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "osp.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
    });

    if (onHoldClientPaidServiceData.length === 0) {
      return next(new ErrorHandler("No record found", 400));
    }

    console.log(
      onHoldClientPaidServiceData,
      paymentLinkDetails,
      "combined data - 1234",
    );

    let pregnancyHoldDays;
    if (onHoldClientPaidServiceData[0].reason === "Pregnancy") {
      pregnancyHoldDays = moment(onHoldClientPaidServiceData[0].end_date).diff(
        moment(),
        "days",
      );
    }
    // console.log("Expiry Date", onHoldClientPaidServiceData[0].end_date);
    const updateSubOrderProgramsRow = await updateRecord(
      tables.subOrderPrograms,
      {
        expiry_date: pregnancyHoldDays
          ? moment(onHoldClientPaidServiceData[0].expiry_date)
              .add(pregnancyHoldDays, "days")
              .format("YYYY-MM-DD")
          : moment(onHoldClientPaidServiceData[0]?.expiry_date)
              .add(onHoldClientPaidServiceData[0]?.days, "days")
              .format("YYYY-MM-DD"),
        expiry_extended_by: onHoldClientPaidServiceData[0]?.mentor_assigned,
        break_start_date:
          onHoldClientPaidServiceData[0]?.reason === "Pregnancy"
            ? moment().format("YYYY-MM-DD")
            : moment(onHoldClientPaidServiceData[0].start_date).format(
                "YYYY-MM-DD",
              ),
        break_end_date: moment(onHoldClientPaidServiceData[0].end_date).format(
          "YYYY-MM-DD",
        ),
        break_note: onHoldClientPaidServiceData[0]?.break_reason,
      },
      { sub_order_id: onHoldClientPaidServiceData[0]?.sub_order_id },
    );

    const columns = [
      "user_id",
      "sub_order_id",
      "session",
      "start_date",
      "end_date",
      "days",
      "onhold_note",
      "onhold_reason",
      "due_date",
    ];
    const values = [
      onHoldClientPaidServiceData[0]?.user_id,
      onHoldClientPaidServiceData[0]?.sub_order_id,
      onHoldClientPaidServiceData[0]?.session,
      onHoldClientPaidServiceData[0]?.reason == "Pregnancy"
        ? moment().format("YYYY-MM-DD HH:mm:ss")
        : moment(onHoldClientPaidServiceData[0]?.start_date).format(
            "YYYY-MM-DD HH:mm:ss",
          ),
      moment(onHoldClientPaidServiceData[0]?.end_date).format(
        "YYYY-MM-DD HH:mm:ss",
      ),
      onHoldClientPaidServiceData[0]?.reason == "Pregnancy"
        ? pregnancyHoldDays
        : onHoldClientPaidServiceData[0]?.days,
      onHoldClientPaidServiceData[0]?.note,
      onHoldClientPaidServiceData[0]?.reason,
      onHoldClientPaidServiceData[0]?.due_date
        ? onHoldClientPaidServiceData[0]?.due_date
        : null,
    ];

    const createdClientOnhold = await insertRecord(
      `${tables.onholdClients}`,
      columns,
      values,
    );

    if (createdClientOnhold.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to create client onhold record", 400),
      );
    }

    const { results: subOrderEntry } = await readRecord({
      table: tables?.subOrderPrograms,
      conditions: [
        { field: "program_id", operator: "=", value: 158 },
        { field: "program_session_id", operator: "=", value: 395 },
        {
          field: "DATE(created_at)",
          operator: "=",
          value: `'${moment().format("YYYY-MM-DD")}'`,
          raw: true,
        },
      ],
    });

    if (!subOrderEntry?.length > 0) {
      console.log("IN THIS LOOP");

      const columnsOrderDetails = [
        "user_id",
        "phone_number",
        "order_mrp",
        "order_paid_amount",
        "due_date",
        "payment_mode",
        "payment_mode_type",
        "order_date",
        "order_status",
        "sale_by",
        "mentor_assigned",
      ];

      const orderDetailsValues = [
        onHoldClientPaidServiceData[0]?.user_id,
        onHoldClientPaidServiceData[0]?.phone_number,
        onHoldClientPaidServiceData[0]?.amount,
        onHoldClientPaidServiceData[0]?.amount,
        onHoldClientPaidServiceData[0]?.end_date,
        onHoldClientPaidServiceData[0]?.amount,
        onHoldClientPaidServiceData[0]?.payment_mode,
        onHoldClientPaidServiceData[0]?.payment_mode_id,
        moment().format("YYYY-MM-DD HH:mm:ss"),
        1,
        onHoldClientPaidServiceData[0]?.mentor_assigned,
        onHoldClientPaidServiceData[0]?.mentor_assigned,
      ];
      const insertedRecord = await insertRecord(
        `${tables.orderDetails}`,
        columnsOrderDetails,
        orderDetailsValues,
      );
      const orderId = insertedRecord.insertId;
      const sopCols = [
        "order_id",
        "user_id",
        "program_id",
        "program_session_id",
        "mrp",
        "paid_amount",
        "program_status", // 3,
        "start_date", // Today
        "expiry_date",
        "order_type", // Renewal
      ];
      const sopVals = [
        orderId,
        onHoldClientPaidServiceData[0]?.user_id,
        158,
        395,
        onHoldClientPaidServiceData[0]?.amount,
        onHoldClientPaidServiceData[0]?.amount,
        3,
        moment().format("YYYY-MM-DD"),
        onHoldClientPaidServiceData[0]?.end_date,
        "Renewal",
      ];
      await insertRecord(`${tables.subOrderPrograms}`, sopCols, sopVals);
    }

    addStatusLogNew({
      status: "Active",
      sub_status: "Onhold",
      id: onHoldClientPaidServiceData[0]?.user_id,
    });

    const userDetailsUpdateObj = { sub_user_status: "Onhold" };

    if (onHoldClientPaidServiceData[0]?.reason === "Pregnancy") {
      const existingGuides =
        safeJSONParse(onHoldClientPaidServiceData[0].guides) || [];
      if (!existingGuides?.includes("51")) {
        existingGuides.push("51");
        userDetailsUpdateObj.guides = JSON.stringify(existingGuides);
      }
    }

    const updatedResult = await updateRecord(
      tables.userDetails,
      userDetailsUpdateObj,
      { user_id: onHoldClientPaidServiceData[0]?.user_id },
    );

    var updatePaymentLinkRow;
    if (razorpay_payment_link_id) {
      updatePaymentLinkRow = await updateRecord(
        tables.paymentLinks,
        { payment_status: "paid" },
        {
          payment_link_id: razorpay_payment_link_id
            ? razorpay_payment_link_id
            : null,
          user_id: onHoldClientPaidServiceData[0]?.user_id,
        },
      );
    }

    const onHoldClientPaidServiceCondition = razorpay_payment_link_id
      ? {
          payment_link_id: razorpay_payment_link_id,
          user_id: onHoldClientPaidServiceData[0]?.user_id,
        }
      : { user_id: onHoldClientPaidServiceData[0]?.user_id, id: request_id };

    const onHoldClientPaidServiceValues =
      onHoldClientPaidServiceData[0]?.reason === "Pregnancy"
        ? {
            status: "Success",
            start_date: moment().format("YYYY-MM-DD HH:mm:ss"),
            days: pregnancyHoldDays,
          }
        : { status: "Success" };

    const updateOnHoldClientPaidServiceRow = await updateRecord(
      tables.onHoldClientPaidService,
      onHoldClientPaidServiceValues,
      onHoldClientPaidServiceCondition,
    );

    console.log(updatedResult, "updatedResult");

    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Invalid User", 404));
    }
    if (razorpay_payment_link_id && updatePaymentLinkRow.affectedRows === 0) {
      return next(new ErrorHandler("Invalid Payment Link", 404));
    }
    if (updateOnHoldClientPaidServiceRow.affectedRows === 0) {
      return next(new ErrorHandler("Invalid Onhold Client Paid Service", 404));
    }

    var html =
      onHoldClientPaidServiceData[0]?.reason === "Pregnancy"
        ? `
         <p style="margin:0 0 15px 0;">Hi ${
           onHoldClientPaidServiceData[0]?.client_name
         } ,</p>

         <p style="margin:0 0 15px 0;">Thank you for completing your payment of ₹${
           onHoldClientPaidServiceData[0]?.amount
         }. Your program has been gently placed on hold for your pregnancy, just as requested.</p>
     
         <p style="margin:0 0 15px 0;">
            Please verify these details at your end too
         </p>

         <p><b>Freeze Reason:</b> Pregnancy <br>
            <b>Freeze  Duration</b>: ${moment(
              onHoldClientPaidServiceData[0]?.end_date,
            ).diff(moment(), "days")} days <br>
            <b>Original Program Validity End Date</b>:  ${moment(
              onHoldClientPaidServiceData[0]?.expiry_date,
            ).format("DD-MM-YYYY")}  <br>
            <b>New Validity End Date (after extension)</b>: ${moment(
              onHoldClientPaidServiceData[0].expiry_date,
            )
              .add(pregnancyHoldDays, "days")
              .format("DD-MM-YYYY")}  
            </p>
         
         <p>Your pregnancy freeze is now active, and your program validity has now been extended by ${pregnancyHoldDays} days. So you can continue your journey with us once you’re ready after delivery</p>
         
         <p style="margin:0 0 15px 0;">
          Your program will remain on hold throughout this phase so you can focus on your health and your baby. <br> Once your freeze ends, we will help you restart with a gentle postpartum plan.
         </p>
         
         <p style="margin:0 0 15px 0;">
           <b>P.S</b> You will continue receiving trimester-wise notifications and well-being notes during your freeze. These are meant to support you softly through this journey.
         </p>
        <p style="margin:0 0 15px 0;">
           <b>P.P.S</b> Please explore the BN App. Your trimester guide has been activated for you with tips, reminders, and easy reads.
         </p>

         <p>Wishing you a healthy, safe, and comforting pregnancy ahead. </p>
         
         <p style="margin:0; font-size:14px; color:#555555;">
           <b>Warm regards,</b><br>
           <strong>Team Balance Nutrition</strong>
         </p>`
        : ` <p style="margin:0 0 15px 0;">Hi ${
            onHoldClientPaidServiceData[0]?.client_name
          } ,</p>

         <p style="margin:0 0 15px 0;">We’ve received your payment for the <strong>Program Freeze</strong>.</p>
     
         <p style="margin:0 0 15px 0;">
           Your program has been placed <strong>on hold</strong> till ${moment(
             onHoldClientPaidServiceData[0]?.end_date,
           ).format("DD-MM-YYYY")} for ${
             onHoldClientPaidServiceData[0]?.days
           } days and the freeze is now confirmed.
         </p>
         
         <p style="margin:0 0 15px 0;">
           During this period, your sessions will be paused and preserved. You can resume your program anytime after ${moment(
             onHoldClientPaidServiceData[0]?.end_date,
           ).format("DD-MM-YYYY")} by informing your mentor.
         </p>
         
         <p>
           Take care and stay healthy — we’re always here for you! 
         </p>
         
         <p style="margin:0; font-size:14px; color:#555555;">
           Warm regards,<br>
           <strong>Team Balance Nutrition</strong>
    </p>`;

    const chatMessage =
      onHoldClientPaidServiceData[0]?.reason === "Pregnancy"
        ? `Hi ${onHoldClientPaidServiceData[0]?.client_name} 
        <p>Thank you for completing your payment of ₹${
          onHoldClientPaidServiceData[0]?.amount
        }. Your <b>pregnancy freeze is now active</b>, and we’ve updated your program details below. <br> Please verify these details at your end too. </p><br/>
        
        <p> <b>Freeze Reason:</b> Pregnancy <br>
            <b>Freeze  Duration</b>: ${moment(
              onHoldClientPaidServiceData[0]?.end_date,
            ).diff(moment(), "days")} days <br>
            <b>Original Program Validity End Date</b>:  ${moment(
              onHoldClientPaidServiceData[0]?.expiry_date,
            ).format("DD-MM-YYYY")}  <br>
            <b>New Validity End Date (after extension)</b>: ${moment(
              onHoldClientPaidServiceData[0].expiry_date,
            )
              .add(pregnancyHoldDays, "days")
              .format("DD-MM-YYYY")}  
        </p><br>

        <p>We’ll stay gently connected with trimester updates, nutrition guidance throughout this special journey.  If you need anything at all, your mentor is right here for you.</p>
        <p>Wishing you strength, comfort, and a beautiful pregnancy ahead.</p>`
        : `Hi ${onHoldClientPaidServiceData[0]?.client_name} 
        <p>We’ve received your payment for the <b>Program Freeze</b>.</p>
        
        <p>Your program is now <b>successfully frozen</b>. </p>

        <p>You can rejoin your program once your ${onHoldClientPaidServiceData[0]?.reason} period is over..</p>
        
        <p>Wishing you a healthy and happy break!  </p>`;

    const htmlOnHoldConfirmation = await ejs.renderFile(
      path.join(
        __dirname,
        "../../../../../src/mails/onHoldPregnancyTemplate.ejs",
      ),
      {
        html: html,
        year: moment().format("YYYY"),
      },
    );

    await sendMailUtil({
      from: "support@balancenutrition.in",
      to: onHoldClientPaidServiceData[0]?.email_id,
      cc: [
        "clientservices@balancenutrition.in",
        `${onHoldClientPaidServiceData[0]?.mentor_email ? onHoldClientPaidServiceData[0]?.mentor_email : ""}`,
      ],
      bcc: ["testerteam@balancenutrition.in"],
      subject:
        onHoldClientPaidServiceData[0]?.reason === "Pregnancy"
          ? "Your Pregnancy Freeze Is Now Active"
          : "Payment Received -Your Program Freeze Is Confirmed",
      html: htmlOnHoldConfirmation,
      template_id: "YourStandardTemplateID", // Use a standard template ID for email tracking
    });

    await clientEnquiry.create({
      mentor_id: onHoldClientPaidServiceData[0]?.mentor_assigned,
      type: "broadcast",
      sender: "mentor",
      query: chatMessage,
      user_id: onHoldClientPaidServiceData[0]?.user_id,
      name: onHoldClientPaidServiceData[0]?.mentor_name,
    });

    if (onHoldClientPaidServiceData[0]?.reason === "Pregnancy") {
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [onHoldClientPaidServiceData[0]?.user_id],
            notification_id: 893,
            sent_via: "cron",
          },
        );
      } catch (e) {
        console.log("Notification send failed:", e);
      }
    }

    if (webhookPayload != {}) {
      return res.status(200).json({
        success: true,
        message: "Successfully request approved",
        data: [],
      });
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const postPregnancyData = async (req, res, next) => {
  try {
    console.log(req.body, "REQ BODY");
    const data = safeJSONParse(req.body?.data);
    const { user_id, sub_order_id } = data;
    let pdfUrl = null;

    if (!user_id || !sub_order_id) {
      return res.status(400).json({
        success: false,
        message: "user_id and sub_order_id are required",
      });
    }

    if (req.file) {
      console.log(req.file, "REQ.FILE---->");
      const uploaded = await uploadArrayOfFilesToCloudinary(
        [req.file],
        `post-pregnancy-reports/${user_id}-${sub_order_id} || "default"}`,
      );
      console.log(uploaded, "UPLOADED");
      pdfUrl = uploaded[0]?.path;
    }

    const currentDate = new Date();

    /* -------------------- CHECK EXISTING -------------------- */
    const existing = await readRecord({
      table: tables.postPregnancyData || "post_pregnancy_formdata",
      selectFields: ["id"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "sub_order_id", operator: "=", value: sub_order_id },
      ],
      limit: 1,
    });

    /* -------------------- PAYLOAD MAPPING -------------------- */
    const payload = {
      // compulsory
      user_id,
      sub_order_id,
      ...(pdfUrl != null && { report_pdf: pdfUrl }),
      ...(data?.child_name != null && { child_name: data.child_name }),
      ...(data?.baby_age != null && { baby_age: data.baby_age }),
      ...(data?.baby_gender != null && { baby_gender: data.baby_gender }),
      ...(data?.baby_current_height != null && {
        baby_current_height: data.baby_current_height,
      }),
      ...(data?.baby_current_weight != null && {
        baby_current_weight: data.baby_current_weight,
      }),
      ...(data?.baby_care_help != null && {
        baby_care_help: data.baby_care_help,
      }),

      ...(data?.breastfeeding != null && { breastfeeding: data.breastfeeding }),
      ...(data?.exclusively_breastfeed != null && {
        exclusively_breastfeed: data.exclusively_breastfeed,
      }),
      ...(data?.breastfeeding_frequency != null && {
        breastfeeding_frequency: data.breastfeeding_frequency,
      }),
      ...(data?.breastfeeding_method != null && {
        breastfeeding_method: data.breastfeeding_method,
      }),
      ...(data?.feeding_challenge != null && {
        feeding_challenge: JSON.stringify(data?.feeding_challenge),
      }),

      ...(data?.delivery_date != null && { delivery_date: data.delivery_date }),
      ...(data?.delivery_type != null && { delivery_type: data.delivery_type }),
      ...(data?.delivery_complication != null && {
        delivery_complication: data.delivery_complication,
      }),
      ...(data?.delivery_complication_details != null && {
        delivery_complication_details: data.delivery_complication_details,
      }),

      ...(data?.living_situation != null && {
        living_situation: data.living_situation,
      }),
      ...(data?.who_cooks != null && { who_cooks: data.who_cooks }),
      ...(data?.number_of_children != null && {
        number_of_children: data.number_of_children,
      }),

      ...(data?.has_pregnancy_health_issues != null && {
        has_pregnancy_health_issues: data.has_pregnancy_health_issues,
      }),
      ...(data?.pregnancy_health_issues != null && {
        pregnancy_health_issues: JSON.stringify(data?.pregnancy_health_issues),
      }),
      ...(data?.current_medicals_issue != null && {
        current_medicals_issue: JSON.stringify(data?.current_medicals_issue),
      }),
      ...(data?.has_high_bp != null && { has_high_bp: data.has_high_bp }),
      ...(data?.has_swelling != null && { has_swelling: data.has_swelling }),
      ...(data?.swelling_body_part != null && {
        swelling_body_part: data.swelling_body_part,
      }),

      ...(data?.is_prescribed_bp_medication != null && {
        is_prescribed_bp_medication: data.is_prescribed_bp_medication,
      }),
      ...(data?.bp_medication_details != null && {
        bp_medication_details: data.bp_medication_details,
      }),
      ...(data?.bp_ingredients_avoid != null && {
        bp_ingredients_avoid: data.bp_ingredients_avoid,
      }),
      ...(data?.controlling_salt_intake != null && {
        controlling_salt_intake: data.controlling_salt_intake,
      }),

      ...(data?.gdm_diagnosed != null && { gdm_diagnosed: data.gdm_diagnosed }),
      ...(data?.gdm_checking_frequency != null && {
        gdm_checking_frequency: data.gdm_checking_frequency,
      }),
      ...(data?.gdm_medications != null && {
        gdm_medications: data.gdm_medications,
      }),
      ...(data?.gdm_recent_readings != null && {
        gdm_recent_readings: data.gdm_recent_readings,
      }),

      ...(data?.is_taking_thyroid_medication != null && {
        is_taking_thyroid_medication: data.is_taking_thyroid_medication,
      }),
      ...(data?.thyroid_type != null && { thyroid_type: data.thyroid_type }),
      ...(data?.thyroid_tsh_value != null && {
        thyroid_tsh_value: data.thyroid_tsh_value,
      }),
      ...(data?.thyroid_last_test_date != null && {
        thyroid_last_test_date: data.thyroid_last_test_date,
      }),
      ...(data?.thyroid_medication_details != null && {
        thyroid_medication_details: data.thyroid_medication_details,
      }),
      ...(data?.thyroid_ingredients_avoided != null && {
        thyroid_ingredients_avoided: data.thyroid_ingredients_avoided,
      }),
      ...(data?.thyroid_symptoms != null && {
        thyroid_symptoms: JSON.stringify(data?.thyroid_symptoms),
      }),

      ...(data?.dr_diet_instructions != null && {
        dr_diet_instructions: data.dr_diet_instructions,
      }),
      ...(data?.dr_diet_instructions_details != null && {
        dr_diet_instructions_details: data.dr_diet_instructions_details,
      }),
      ...(data?.food_preferences != null && {
        food_preferences: JSON.stringify(data?.food_preferences),
      }),
      ...(data?.food_aversions != null && {
        food_aversions: JSON.stringify(data?.food_aversions),
      }),
      ...(data?.cultural_food_restrictions != null && {
        cultural_food_restrictions: JSON.stringify(
          data?.cultural_food_restrictions,
        ),
      }),
      ...(data?.follows_traditional_recipes != null && {
        follows_traditional_recipes: data.follows_traditional_recipes,
      }),
      ...(data?.traditional_recipes_list != null && {
        traditional_recipes_list: JSON.stringify(
          data?.traditional_recipes_list,
        ),
      }),

      ...(data?.consuming_lactation_foods != null && {
        consuming_lactation_foods: data.consuming_lactation_foods,
      }),
      ...(data?.lactation_foods_details != null && {
        lactation_foods_details: data.lactation_foods_details,
      }),

      ...(data?.taking_medications != null && {
        taking_medications: data.taking_medications,
      }),
      ...(data?.medications_info != null && {
        medications_info: data.medications_info,
      }),

      ...(data?.postpartum_goals != null && {
        postpartum_goals: JSON.stringify(data?.postpartum_goals),
      }),
    };

    /* -------------------- CREATE -------------------- */
    if (!existing?.results?.length) {
      const insertResult = await insertRecord(
        tables.postPregnancyData || "post_pregnancy_formdata",
        [...Object.keys(payload)],
        [...Object.values(payload)],
      );

      return res.status(201).json({
        success: true,
        message: "Postpartum intake created successfully",
        data: insertResult,
      });
    }

    /* -------------------- UPDATE -------------------- */
    const updateResult = await updateRecord(
      tables.postPregnancyData || "post_pregnancy_formdata",
      payload,
      { user_id, sub_order_id },
    );

    return res.status(200).json({
      success: true,
      message: "Postpartum intake updated successfully",
      data: payload,
    });
  } catch (error) {
    console.error("Postpartum Intake Error:", error);
    next(error);
  }
};

export const getPostPregnancyFormDataById = async (req, res, next) => {
  try {
    const { sub_order_id } = req.query;

    if (!sub_order_id) {
      return res.status(400).json({
        success: false,
        message: "sub_order_id is required",
      });
    }

    const { results } = await readRecord({
      table: tables.postPregnancyData || "post_pregnancy_formdata",
      selectFields: ["*"],
      conditions: [
        { field: "sub_order_id", operator: "=", value: sub_order_id },
      ],
      limit: 1,
    });

    if (!results?.length) {
      return res.status(404).json({
        success: false,
        message: "Postpartum intake data not found",
      });
    }

    const data = results[0];

    console.log(typeof data?.feeding_challenge);

    /* -------------------- PARSE JSON FIELDS -------------------- */
    const JSON_FIELDS = new Set([
      "feeding_challenge",
      "pregnancy_health_issues",
      "current_medicals_issue",
      "thyroid_symptoms",
      "food_preferences",
      "food_aversions",
      "cultural_food_restrictions",
      "traditional_recipes_list",
      "postpartum_goals",
    ]);

    const parsedData = Object.fromEntries(
      Object.entries(data || {}).map(([key, value]) => {
        if (JSON_FIELDS.has(key) && typeof value === "string") {
          try {
            return [key, JSON.parse(value)];
          } catch {
            return [key, value]; // fallback if JSON is invalid
          }
        }
        return [key, value];
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Postpartum intake data retrieved successfully",
      data: parsedData,
    });
  } catch (error) {
    console.error("Get Postpartum Intake Error:", error);
    next(error);
  }
};

export const getPaidOnHoldRequest = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    const { results = [], totalCount } = await readRecord({
      table: `${tables.onHoldClientPaidService} ohps`,
      selectFields: [
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "ud.phone",
        "ohps.payment_expiry",
        "ohps.due_date",
        "ud.email_id",
        "ud.user_id",
        "ohps.reason as onhold_reason",
        "ohps.note as note",
        "ohps.days",
        "ohps.start_date",
        "ohps.end_date",
        "ohps.payment_mode_id",
        "ohps.session",
        "ohps.amount",
        "ohps.status",
        "ohps.payment_mode",
        "ohps.payment_link_id",
        "ohps.service_id",
        "ohps.sub_order_id",
        "ohps.id as request_id",
        "ohps.created_at",
        "ohps.updated_at",
        "pml.payment_link",
      ],
      joins: [
        {
          table: `${tables.userDetails} ud`,
          type: "LEFT",
          on: "ohps.user_id = ud.user_id",
        },
        {
          table: `${tables.paymentLinks} pml`,
          type: "LEFT",
          on: "pml.payment_link_id = ohps.payment_link_id",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "ohps.status",
          operator: "=",
          value: "Pending",
        },
      ],
      pagination: {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
      },
      orderBy: ["ohps.id desc"],
    });

    var responseData = results;

    if (results?.length > 0) {
      var responseData = results.map((userDetails) => {
        const chatPayment = `Hi ${userDetails?.client_name}, 
${
  userDetails?.onhold_reason == "Pregnancy"
    ? "Your program freeze request for your pregnancy period is ready."
    : "Your program freeze request for your desired time period is ready."
}
Please complete the payment of ₹${
          userDetails?.amount
        } using the details below so we can confirm your freeze: 
${
  userDetails?.payment_mode_id == 1
    ? `Payment Link: ${userDetails?.payment_link}
Link valid till <b>${moment(userDetails?.payment_expiry).format(
        "DD-MM-YYYY",
      )} (in ${moment(userDetails?.payment_expiry).diff(
        moment(),
        "days",
      )} days).
Once you make the payment, please share a screenshot so we can register the program freeze. The link expires on ${moment(
        userDetails?.payment_expiry,
      ).format("DD-MM-YYYY")} (${moment(userDetails?.payment_expiry).diff(
        moment(),
        "days",
      )} days). 
Please ensure you use it before that.`
    : `Bank Details: PFA the Bank Account Details for the payment of ₹${userDetails?.amount} for ${userDetails[0]?.program_name}. 
Account Type: Current Account 
Bank Name: Kotak Mahindra Bank 
Account Holder Name: Balance Nutrition
Account Number: 1611692202 IFSC Code: KKBK0000667 Branch: Dr Ambedkar Road, Khar West, Mumbai P.S.
Please let us know once you are done with the transfer & attach a screenshot of the transaction details.`
} `;

        userDetails.chatPayment = chatPayment;

        userDetails.bankDetails = `Account Type: Current Account 
Bank Name: Kotak Mahindra Bank 
Account Holder Name: Balance Nutrition
Account Number: 1611692202 IFSC Code: KKBK0000667 Branch: Dr Ambedkar Road, Khar West, Mumbai P.S.`;

        userDetails.phone = userDetails?.phone.replace(/\D/g, "");

        return userDetails;
      });
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "All app links fetched successfully",
      data: responseData,
      totalPages: Math.ceil(totalCount / (req.query.limit || 10)),
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllApplinks = async (req, res, next) => {
  try {
    const { results = [] } = await readRecord({
      table: `${tables.bnAppLinks}`,
      selectFields: ["name", "link"],
      conditions: [
        {
          field: "status",
          operator: "=",
          value: 1,
        },
      ],
      orderBy: ["sequence asc"],
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "All app links fetched successfully",
      data: results.map((i) => ({
        name: i.name ? i.name.replace(/[_-]/g, " ") : "",
        link: i.link ? i.link.trim() : "",
      })),
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error fetching app links:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const toggleAskDiet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["ask_diet"],
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });

    let updatedData;
    const condition = {
      user_id: user_id,
    };
    if (results[0].ask_diet === 0) {
      updatedData = { ask_diet: 1 };
    }
    if (results[0].ask_diet === 1) {
      updatedData = { ask_diet: 0 };
    }
    const updatedWatiStatus = await updateRecord(
      `${tables.userDetails}`,
      updatedData,
      condition,
    );

    if (updatedWatiStatus.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update ask_diet status", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "ask_diet status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const toggleDailyFu = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["daily_fu"],
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });

    let updatedData;
    const condition = {
      user_id: user_id,
    };
    if (results[0].daily_fu === 0) {
      updatedData = { daily_fu: 1 };
    }
    if (results[0].daily_fu === 1) {
      updatedData = { daily_fu: 0 };
    }
    const updatedWatiStatus = await updateRecord(
      `${tables.userDetails}`,
      updatedData,
      condition,
    );

    if (updatedWatiStatus.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update daily_fu status", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "daily_fu status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const toggleVip = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["vip"],
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });

    let updatedData;
    const condition = {
      user_id: user_id,
    };
    if (results[0].vip === 0) {
      updatedData = { vip: 1 };
    }
    if (results[0].vip === 1) {
      updatedData = { vip: 0 };
    }
    const updatedWatiStatus = await updateRecord(
      `${tables.userDetails}`,
      updatedData,
      condition,
    );

    if (updatedWatiStatus.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update daily_fu status", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "daily_fu status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const offOnholdClient = async (req, res, next) => {
  try {
    const { user_id, sub_order_id, session, weight } = req.body;
    const updatedClientStatus = await updateRecord(
      `${tables.userDetails}`,
      { sub_user_status: "Active" },
      { user_id },
    );
    if (updatedClientStatus.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update client status", 400));
    }
    const otherWeight = await insertRecord(
      `${tables.weightRecords}`,
      [
        "user_id",
        "sub_order_id",
        "session",
        "weight",
        "days",
        "day_status",
        "weight_type",
      ],
      [user_id, sub_order_id, session, weight, 3, 2, 0],
    );
    const updatedResult = await updateRecord(
      tables.userDetails,
      {
        latest_weight: weight,
      },
      {
        user_id,
      },
    );
    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed To Update Weight", 400));
    }
    if (otherWeight.affectedRows === 0) {
      return next(
        new ErrorHandler("Failed to create other weight record", 400),
      );
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateClientWeight = async (req, res, next) => {
  try {
    const { user_id, weight_type, weight, sub_order_id } = req.body;

    const updateWeight = async (
      table,
      fields,
      conditions,
      successMessage,
      errorMessage,
    ) => {
      const updatedRecord = await updateRecord(table, fields, conditions);
      if (updatedRecord.affectedRows === 0) {
        return next(new ErrorHandler(errorMessage, 400));
      }
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: successMessage,
      });
      return res.status(200).json(apiresponse);
    };

    switch (weight_type) {
      case "goal_weight":
        return await updateWeight(
          `${tables.assessment_personal_details}`,
          { goal_weight: weight },
          { user_id },
          "Goal weight updated successfully",
          "Failed to update goal weight",
        );

      case "assessment_start_weight":
        return await updateWeight(
          `${tables.assessment_personal_details}`,
          { weight: weight },
          { user_id },
          "Assessment Start Weight updated successfully",
          "Failed to update Assessment Start Weight",
        );

      case "program_start_weight":
        return await updateWeight(
          `${tables.subOrderPrograms}`,
          { start_program_weight: weight },
          { sub_order_id },
          "Program Start Weight updated successfully",
          "Failed to update Program Start Weight",
        );

        return await updateWeight(
          `${tables.weightRecords}`,
          { weight: weight },
          { wmr_id: weight_id },
          "Weight updated successfully",
          "Failed to update  Weight",
        );

      default:
        return next(new ErrorHandler("Invalid weight type", 400));
    }
  } catch (error) {
    console.error("Error updating client weight:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCurrentSessionTrackersByUserId = async (req, res, next) => {
  try {
    const { user_id, session, sub_order_id } = req.query;
    const sessionNum = Number(session);

    // Condition for fetching weight, inch, photo records based on session logic
    // session = 1 → fetch all with session <= 1; else exact session
    const sessionConditionForTracker =
      sessionNum === 1
        ? { field: "session", operator: "<=", value: sessionNum }
        : { field: "session", operator: "=", value: sessionNum };

    // Because your tables use aliases (wr, ir, pr), we must adapt field names per table
    // So define separate conditions arrays for each table

    const weightConditions = [
      { field: "wr.user_id", operator: "=", value: user_id },
      { field: "wr.sub_order_id", operator: "=", value: sub_order_id },
      sessionNum === 1
        ? { field: "wr.session", operator: "<=", value: sessionNum }
        : { field: "wr.session", operator: "=", value: sessionNum },
    ];

    const inchConditions = [
      { field: "ir.user_id", operator: "=", value: user_id },
      { field: "ir.sub_order_id", operator: "=", value: sub_order_id },
      sessionNum === 1
        ? { field: "ir.session", operator: "<=", value: sessionNum }
        : { field: "ir.session", operator: "=", value: sessionNum },
    ];

    const photoConditions = [
      { field: "pr.user_id", operator: "=", value: user_id },
      { field: "pr.sub_order_id", operator: "=", value: sub_order_id },
      sessionNum === 1
        ? { field: "pr.session", operator: "<=", value: sessionNum }
        : { field: "pr.session", operator: "=", value: sessionNum },
    ];

    // Fetch trackers in parallel
    const [
      { results: weightDetails },
      { results: inchDetails },
      { results: photoDetails },
    ] = await Promise.all([
      readRecord({
        selectFields: [
          "wr.wmr_id as weight_id",
          "wr.session",
          "wr.weight",
          "wr.days",
          "wr.sub_order_id",
          "wr.posted_date as weight_posted_date",
          "wr.weight_acknowledge",
        ],
        table: `${tables.weightRecords} wr`,
        conditions: weightConditions,
        orderBy: ["wr.posted_date ASC", "wr.wmr_id ASC"],
      }),
      readRecord({
        selectFields: [
          "ir.inch_id",
          "ir.sub_order_id",
          "ir.chest",
          "ir.session",
          "ir.days",
          "ir.waist",
          "ir.hips",
          "ir.inch_acknowledge",
          "ir.posted_date as inch_posted_date",
        ],
        table: `${tables.inchRecords} ir`,
        conditions: inchConditions,
        orderBy: ["ir.posted_date ASC", "ir.inch_id ASC"],
      }),
      readRecord({
        selectFields: [
          "pr.photo_id",
          "pr.user_id",
          "pr.sub_order_id",
          "pr.session",
          "pr.days",
          "pr.photo_url",
          "pr.photo_acknowledge",
          "pr.posted_date as photo_posted_date",
        ],
        table: `${tables.photoRecords} pr`,
        conditions: photoConditions,
        orderBy: ["pr.posted_date ASC", "pr.photo_id ASC"],
      }),
    ]);

    // Determine previous session for fetching last weight
    const previousSession = sessionNum > 1 ? sessionNum - 1 : 0;

    // Fetch last weight from previous session only (exact session)
    const { results: [previousWeightRecord] = [] } = await readRecord({
      selectFields: ["wr.weight", "wr.posted_date", "wr.wmr_id"],
      table: `${tables.weightRecords} wr`,
      conditions: [
        { field: "wr.user_id", operator: "=", value: user_id },
        { field: "wr.sub_order_id", operator: "=", value: sub_order_id },
        { field: "wr.session", operator: "=", value: previousSession },
      ],
      orderBy: ["wr.posted_date DESC", "wr.wmr_id DESC"],
      limit: 1,
    });

    const lastSessionWeight = previousWeightRecord
      ? Number(previousWeightRecord.weight)
      : null;

    // Get first weight in current session (lowest posted_date, wmr_id)
    const firstWeightEntry = weightDetails.length
      ? weightDetails.reduce((min, curr) => {
          const currDate = new Date(curr.weight_posted_date);
          const minDate = new Date(min.weight_posted_date);
          if (currDate < minDate) return curr;
          if (currDate.getTime() === minDate.getTime()) {
            return curr.weight_id < min.weight_id ? curr : min;
          }
          return min;
        })
      : null;

    const firstWeight = firstWeightEntry
      ? Number(firstWeightEntry.weight)
      : null;

    // Transform weights with difference and change type
    const transformedWeights = weightDetails.map((item, index) => {
      console.log(index, item.weight);
      const currentWeight = Number(item.weight);
      let lastWeight = 0;
      if (index && weightDetails[index - 1]) {
        lastWeight = Number(weightDetails[index - 1].weight);
      }
      let weightDifference = null;
      let weightChangeType = null;

      if (index === 0) {
        if (lastSessionWeight !== null) {
          weightDifference = (currentWeight - lastSessionWeight).toFixed(2);
          const diffVal = parseFloat(weightDifference);
          weightChangeType =
            diffVal < 0 ? "lossed" : diffVal > 0 ? "gained" : null;
        }
      } else {
        if (firstWeight !== null) {
          weightDifference = (currentWeight - lastWeight).toFixed(2);
          const diffVal = parseFloat(weightDifference);
          console.log(diffVal, index);
          weightChangeType =
            diffVal < 0 ? "lossed" : diffVal > 0 ? "gained" : null;
        }
      }

      return {
        weight_id: item.weight_id,
        session: item.session,
        weight: currentWeight.toFixed(2),
        days: item.days,
        sub_order_id: item.sub_order_id,
        weight_posted_date: item.weight_posted_date,
        weight_acknowledge: item.weight_acknowledge,
        weight_difference:
          weightDifference !== null ? weightDifference : "0.00",
        weight_change_type: weightChangeType,
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client trackers fetched successfully",
      data: {
        weightDetails: transformedWeights,
        inchDetails,
        photoDetails,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in getCurrentSessionTrackersByUserId:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getWeightDetails = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("Missing user_id", 400));

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.active_order_id",
        "pm.program_name",
        "sop.sub_order_id",
        "sop.created_at",
        "sop.sent_sessions",
        "wr.wmr_id",
        "wr.weight",
        "wr.session",
        "wr.posted_date",
        "wr.day_status",
        "wr.weight_acknowledge",
        "wr.days",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: "wr.user_id = ud.user_id AND wr.sub_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        { field: "sop.sub_order_id", operator: "IS NOT", value: null },
      ],
      orderBy: [
        "sop.sub_order_id",
        "wr.session ASC",
        "wr.days ASC",
        "wr.posted_date DESC",
      ],
    });

    if (!results?.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No weight details found",
          data: { current_session: [] },
        }),
      );
    }

    const currentSession = [];
    const groupedBySubOrder = {};
    const lastWeightBySubOrder = {};
    const subOrderMeta = {};
    const activeOrderId = Number(results[0].active_order_id);

    results.forEach((item) => {
      const {
        program_name: programName,
        sub_order_id: subOrderId,
        sent_sessions,
        session,
        weight,
        posted_date,
        created_at,
      } = item;

      if (!subOrderId || !programName) return;

      const weightNum = Number(weight) || 0;
      // Fix here: allow session = 0 (don't exclude falsy 0)
      if (!weightNum || session == null || !posted_date) return;

      // Store metadata with createdAt formatted and raw
      if (!subOrderMeta[subOrderId]) {
        const isActive = activeOrderId === subOrderId;

        const createdAtFormatted = created_at
          ? new Date(created_at).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Unknown Date";

        subOrderMeta[subOrderId] = {
          programName,
          isActive,
          createdAtFormatted,
          createdAtRaw: created_at ? new Date(created_at) : new Date(0),
        };
      }

      const previousWeight = lastWeightBySubOrder[subOrderId] ?? null;
      const weightDifference =
        previousWeight !== null
          ? Number((weightNum - previousWeight).toFixed(2))
          : null;
      lastWeightBySubOrder[subOrderId] = weightNum;

      const transformedItem = {
        user_id: item.user_id,
        wmr_id: item.wmr_id,
        weight: weightNum.toFixed(2),
        program_name: programName,
        sub_order_id: subOrderId,
        session: item.session,
        posted_date: item.posted_date,
        day_status: item.day_status,
        days:
          Number(item.days) === 0
            ? "Start wt"
            : [5, 10].includes(Number(item.days))
              ? Number(item.days)
              : "Ot.Wt",
        sent_sessions: sent_sessions,
        weight_difference: weightDifference,
        weight_acknowledge: item.weight_acknowledge,
        weight_change_type:
          weightDifference === null
            ? null
            : weightDifference < 0
              ? "lost"
              : weightDifference > 0
                ? "gained"
                : "no change",
      };

      if (!groupedBySubOrder[subOrderId]) {
        groupedBySubOrder[subOrderId] = [];
      }

      groupedBySubOrder[subOrderId].push(transformedItem);

      // If it's the current session
      const isCurrentSession =
        activeOrderId === subOrderId && sent_sessions === session;
      if (isCurrentSession) currentSession.push(transformedItem);
    });

    const response = {
      current_session: currentSession,
    };

    // Sort and structure final output
    const sortedEntries = Object.entries(groupedBySubOrder)
      .map(([subOrderId, records]) => {
        const meta = subOrderMeta[subOrderId];
        return {
          createdAt: meta.createdAtRaw,
          key: meta.isActive
            ? `${meta.programName} (${meta.createdAtFormatted}) (Active Program)`
            : `${meta.programName} (${meta.createdAtFormatted})`,
          records,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // DESC by createdAt

    sortedEntries.forEach((entry) => {
      response[entry.key] = entry.records;
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Client weight details fetched successfully",
        data: response,
      }),
    );
  } catch (error) {
    console.error("Error in getWeightDetails:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getInchDetails = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ir.inch_id",
        "ir.chest",
        "ir.waist",
        "ir.hips",
        "ir.session",
        "ir.posted_date",
        "ir.inch_acknowledge",
        "ir.days",
        "pm.program_name",
        "sop.sent_sessions",
        "sop.sub_order_id",
        `CASE
                 WHEN sop.sent_sessions = ir.session
                      AND sop.program_status = 1 THEN 'Yes'
                 ELSE 'No'
             END AS current_session`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.user_id = sop.user_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "INNER",
          table: `${tables.inchRecords} ir`,
          on: "sop.sub_order_id = ir.sub_order_id",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      orderBy: ["sop.sub_order_id Desc", "ir.posted_date DESC"],
    });

    const response = {
      current_session: [],
    };
    results.forEach((item) => {
      if (item.current_session === "Yes") {
        response.current_session.push({
          ...item,
          days:
            Number(item.days) === 0 && Number(item.session) === 0
              ? "Start Inch"
              : item.days,
        });
      } else {
        if (!response[item.program_name]) {
          response[item.program_name] = [];
        }
        response[item.program_name].push({
          ...item,
          days:
            Number(item.days) === 0 && Number(item.session) === 0
              ? "Start Inch"
              : item.days,
        });
      }
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Inch details fetched successfully",
      data: response,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getPhotoDetails = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.user_id = sop.user_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "INNER",
          table: `${tables.photoRecords} pr`,
          on: "sop.sub_order_id = pr.sub_order_id",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      selectFields: [
        "ud.user_id",
        "pr.photo_id",
        "pr.photo_url",
        "pr.posted_date",
        "pr.days",
        "pr.session",
        "pr.photo_acknowledge",
        "pm.program_name",
        "sop.sent_sessions",
        `CASE
                 WHEN sop.sent_sessions = pr.session
                      AND sop.program_status = 1 THEN 'Yes'
                 ELSE 'No'
             END AS current_session`,
      ],
      orderBy: ["sop.sub_order_id Desc", "pr.posted_date DESC"],
    });

    const response = {
      current_session: [],
    };
    results.forEach((item) => {
      if (item.current_session === "Yes") {
        response.current_session.push(item);
      } else {
        if (!response[item.program_name]) {
          response[item.program_name] = [];
        }
        response[item.program_name].push(item);
      }
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Photo  details fetched successfully",
      data: response,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMilestoneDetails = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "bmg.comment",
        "bmg.added_date",
        `CASE 
        WHEN bmg.is_achieved = 1 THEN 'achieved' 
        ELSE 'not_achieved' 
    END AS goal_status`,
        `CASE 
        WHEN sop.sub_order_id = bmg.sub_order_id AND sop.program_status = 1 THEN 'yes' 
        ELSE 'no' 
    END AS program_status`,
        "pm.program_name",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "bmg.goal_type",
          operator: "=",
          value: 1,
        },
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.user_id = ud.user_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "INNER",
          table: `${tables.bnMyGoals} bmg`,
          on: "bmg.sub_order_id = sop.sub_order_id",
        },
      ],
    });

    const response = {
      current_program: [],
    };
    results.forEach((item) => {
      if (item.program_status === "yes") {
        response.current_program.push(item);
      } else {
        if (!response[item.program_name]) {
          response[item.program_name] = [];
        }
        response[item.program_name].push(item);
      }
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client MileStone  details fetched successfully",
      data: response,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientStatus = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_status"],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });

    if (!results.length) {
      return next(new ErrorHandler("User not found", 404));
    }
    const userStatus = String(results[0].user_status).toLowerCase();
    const statusLabel =
      userStatus === "active"
        ? "client"
        : userStatus === "completed"
          ? "ocr"
          : userStatus === "lead"
            ? "lead"
            : "maintenance";

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client status fetched successfully",
      data: { status: statusLabel },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserData = async (req, res, next) => {
  try {
    const { id } = req.query;
    if (!id) return next(new ErrorHandler("Internal Server Error", 400));

    const selectFields = [
      "ud.user_id",
      "ud.email_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "ud.gender",
      "ud.birth_date",
      "sop.start_program_weight",
      `(SELECT wr.weight FROM ${tables.weightRecords} wr WHERE wr.sub_order_id = sop.sub_order_id AND wr.session = sop.total_sessions) as end_weight`,
      "CONCAT(ad.first_name,' ',ad.last_name) as admin_name",
      "country.country_name",
      "state.state_name",
      "city.city_name",
      "pm.program_name",
      "ps.program_sessions",
      "ud.health_conditions",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ud.mentor_assigned = ad.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.countries} country`,
        on: "ud.country_id = country.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} state`,
        on: "ud.state_id = state.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} city`,
        on: "ud.city_id = city.city_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "pm.program_id = sop.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "ps.program_session_id  = sop.program_session_id",
      },
    ];
    const conditions = [
      {
        field: "ud.user_id",
        operator: "=",
        value: parseInt(id),
      },
    ];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
    });
    const userData = results[0];
    const data = {
      user_id: userData.user_id,
      email_id: userData.email_id,
      full_name: userData.full_name,
      gender:
        Number(userData.gender) === 0
          ? "Other"
          : Number(userData.gender) === 1
            ? "Male"
            : "Female",
      age: calculateAge(userData.birth_date),
      start_program_weight: userData.start_program_weight,
      end_weight: userData.end_weight,
      mentor_name: userData.admin_name,
      country_name: userData.country_name,
      state_name: userData.state_name,
      city_name: userData.city_name,
      program_name: userData.program_name,
      program_sessions: userData.program_sessions,
      health_conditions:
        userData.health_conditions && userData.health_conditions.length > 0
          ? JSON.parse(userData.health_conditions)
          : null,

      total_weight_loss: (
        parseFloat(userData.start_program_weight) -
        parseFloat(userData.end_weight)
      ).toFixed(2),
    };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client data fetched successfully",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClientHealthScoreData = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return next(new ErrorHandler("userId Not provided", 400));
    }

    const { results } = await readRecord({
      table: `${tables.healthScoreClient} hs`,
      selectFields: [
        "hs.created as posted_date",
        "hs.height",
        "hs.weight",
        "hs.ideal_weight",
        "hs.weight_difference",
        "hs.body_mass_index as bmi",
        "hs.ideal_bmi",
        "hs.body_shape",
        "hs.health_category",
        "hs.overall_health_score",
        "hs.sleep_duration",
        "hs.activity_level",
        "hs.water_frequency",
        "hs.alcohol_frequency",
        "hs.smoke_frequency",
        "hs.veg_fruits_frequency",
        "hs.type",
      ],
      conditions: [{ field: "hs.user_id", operator: "=", value: user_id }],
      orderBy: ["hs.created DESC"],
    });

    if (!results || results.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No Health Score Data Found",
          data: [],
        }),
      );
    }

    const formattedPostedDate = moment(results[0].posted_date).format(
      "YYYY-MM-DD HH:mm:ss",
    );
    const stageQuery = `
      SELECT JSON_EXTRACT(stage_logs, CONCAT(JSON_UNQUOTE(JSON_SEARCH(stage_logs, 'one', ?, NULL, '$[*].timestamp')), '.stage')) AS stage
      FROM ${tables.leadStageLog}
      WHERE user_id = ?
      AND JSON_SEARCH(stage_logs, 'one', ?, NULL, '$[*].timestamp') IS NOT NULL
    `;
    const [stageResults] = await readPool.query(stageQuery, [
      formattedPostedDate,
      user_id,
      formattedPostedDate,
    ]);

    const mapActivityLevel = {
      12: "Moderately active",
      7: "Lightly active",
      16: "Very active",
      4: "Sedentary",
    };

    const mapAlcoholConsumption = {
      14: "Never",
      12: "Quit Since 1 year",
      7: "Occasionally",
      0: "Daily",
      4: "Daily",
    };

    const mapSleepDuration = {
      7: "Less than 6 hrs (disturbed)",
      12: "Less than 6 hrs (Peaceful)",
      14: "6 to 9 hrs",
      4: "10 >hrs",
    };

    const mapSmokeFrequency = {
      14: "Never",
      12: "Quit now",
      7: "A few Times a week",
      4: "Daily",
      0: "Daily",
    };

    const mapWaterIntake = {
      4: "Less than 4 glasses",
      7: "4-6 glasses",
      12: "6-12 glasses",
      14: "12 > glasses",
    };

    const mapVegFruitsConsumption = {
      4: "Rarely",
      7: "Sometimes",
      12: "Daily",
      14: "Twice a day",
    };
    const stage =
      stageResults && stageResults.length > 0 && stageResults[0].stage !== null
        ? stageResults[0].stage
        : null;

    const formattedResults = results.map((record) => {
      const activityLevel = mapActivityLevel[record.activity_level] || 0;
      const alcoholFrequency =
        mapAlcoholConsumption[record.alcohol_frequency] || 0;
      const sleepDuration = mapSleepDuration[record.sleep_duration] || 0;
      const smokeFrequency = mapSmokeFrequency[record.smoke_frequency] || 0;
      const waterFrequency = mapWaterIntake[record.water_frequency] || 0;
      const vegFruitsFrequency =
        mapVegFruitsConsumption[record.veg_fruits_frequency] || 0;
      const hsType = {
        0: "New (HS)",
        1: "Mid Progress (HS)",
        2: "End Progress (HS)",
        3: "OC (HS)",
      };
      return {
        ...record,
        stage: stage,
        sleep_duration: sleepDuration,
        activity_level: activityLevel,
        water_frequency: waterFrequency,
        alcohol_frequency: alcoholFrequency,
        smoke_frequency: smokeFrequency,
        veg_fruits_frequency: vegFruitsFrequency,
        posted_date: `${moment(record.posted_date).format("Do MMM YYYY")}`,
        type: hsType[record.type],
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Health Score Data Fetched Successfully",
        data: formattedResults,
      }),
    );
  } catch (error) {
    console.log("Error:", error.message);
    return next(
      new ErrorHandler(`Internal Server Error: ${error.message}`, 500),
    );
  }
};

const askDiet = async (req, res, next) => {
  const { id, page, limit, search } = req.body;
  if (!id) {
    return next(new ErrorHandler("userId Not provided", 400));
  }
  try {
    const { results: users, totalCount } = await readRecord({
      selectFields: ["cd.user_id"],
      table: `${tables.userDetails} cd`,
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: id },
        { field: "cd.ask_diet", operator: "=", value: 1 },
        { field: "cd.user_status", operator: "=", value: "Active" },
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        },
      ],
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
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      },
    });
    if (users.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No users found",
          data: [],
          totalCount: 0,
        }),
      );
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.time("Fetch user details from fetchUsersDetails");
    console.time("Fetch user details from fetchUsersDetails");
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const finalData = users.map((user, index) =>
      mapUserData({
        user,
        details: details[index],
        // addFields: { weight_details: true },
      }),
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client data fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {}
};

const askDietCount = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { totalCount } = await readRecord({
      selectFields: ["cd.user_id"],
      table: `${tables.userDetails} cd`,
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: id },
        { field: "cd.ask_diet", operator: "=", value: 1 },
        { field: "cd.user_status", operator: "=", value: "Active" },
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        },
      ],
      countTotal: true,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client data fetched successfully",
      totalCount,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getDraftedQuerybyUserId = async (req, res, next) => {
  const { user_id, mentor_id } = req.query;
  const { results } = await readRecord({
    table: `${tables.draftedQueries} dq`,
    selectFields: [
      "dq.id as drafted_query_id",
      "dq.draft_text",
      "dq.attachment",
    ],
    conditions: [
      { field: "dq.user_id", operator: "=", value: user_id },
      { field: "dq.mentor_id", operator: "=", value: mentor_id },
    ],
    orderBy: ["dq.created_at ASC"],
  });
  return res.status(200).json(
    new ApiResponse({
      message: "Drafted Query Fetched Successfully",
      data: results,
    }),
  );
};

const onholdHistoryByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.onholdClients} ohc`,
      selectFields: [
        "ohc.id ",
        "ohc.start_date",
        "ohc.end_date",
        "ohc.days",
        "ohc.onhold_note",
        "ohc.onhold_reason",
        "ohc.is_extended",
        "ohc.extend_reason",
        "pm.program_name",
        "sop.program_status",
        "ps.validity",
        "ps.extra_validity",
      ],
      conditions: [{ field: "ohc.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ohc.sub_order_id",
        },
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
    });
    const grouped = {};
    for (const item of results) {
      const key = `${item.program_name} (${
        item.validity + item.extra_validity
      } Days) ${Number(item.program_status) === 1 ? " (Active)" : ""}`;
      if (!grouped[key]) {
        grouped[key] = { [key]: [] };
      }
      grouped[key][key].push({
        id: item.id,
        start_date: item.start_date,
        end_date: item.end_date,
        days: item.days,
        onhold_note: item.onhold_note,
        onhold_reason: item.onhold_reason ? item.onhold_reason : "Other",
        is_extended: Number(item.is_extended) === 0 ? "No" : "Yes",
        extend_reason: item?.extend_reason ? item?.extend_reason : "NA",
      });
    }

    const data = Object.values(grouped);
    return res.status(200).json(
      new ApiResponse({
        message: "Onhold History Fetched Successfully",
        data: data,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const extendOnholdDate = async (req, res, next) => {
  try {
    const { onhold_id, end_date, extend_reason, sub_order_id } = req.body;
    if (!onhold_id || !end_date || !extend_reason || !sub_order_id) {
      return next(new ErrorHandler("All Fields Are Required", 400));
    }
    const { results } = await readRecord({
      table: `${tables.onholdClients}`,
      selectFields: ["start_date"],
      conditions: [{ field: "id", operator: "=", value: onhold_id }],
    });
    const onholdDetails = results[0];
    const updatedResult = await updateRecord(
      tables.onholdClients,
      {
        end_date,
        extend_reason,
        is_extended: 1,
        days: moment(onholdDetails.start_date).diff(moment(), "days"),
      },
      {
        id: onhold_id,
      },
    );
    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error Extending Onhold", 400));
    }
    const updatedSubProgramResult = await updateRecord(
      tables.subOrderPrograms,
      {
        break_end_date: end_date,
      },
      {
        sub_order_id,
      },
    );
    if (updatedSubProgramResult.affectedRows === 0) {
      return next(new ErrorHandler("Error Extending Onhold", 400));
    }
    return res
      .status(200)
      .json(new ApiResponse({ message: "Onhold Extended Successfully" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

/**
 * Edit client food aversions, allergies, and medical issues.
 *
 * @param {object} req - Request object containing query parameters and body.
 * @param {object} res - Response object to send back data.
 *
 * @returns {Promise<object>} - Promise resolving to an object with status, message, and data.
 *
 * @throws {ErrorHandler} - If there is an error, it throws an ErrorHandler.
 */

const editClientFoodAversions = async (req, res) => {
  try {
    const user_id = req.query.user_id;
    const {
      food_preferences,
      food_aversions,
      allergies = {},
      medical_issues = {},
      assessment_id,
    } = req.body;

    if (!user_id || !assessment_id) {
      return res.status(400).json({
        status: "error",
        message: "User ID and Assessment ID are required",
      });
    }

    // --- Update assessment_nutrition_and_lifestyle ---
    const lifestyleFields = [];
    const lifestyleValues = [];

    if (food_preferences !== undefined) {
      lifestyleFields.push("food_preference = ?");

      const preferenceList = Array.isArray(food_preferences)
        ? food_preferences
        : food_preferences.split(",").map((p) => p.trim());

      const prefobj = { preference: {} };

      preferenceList.forEach((item, index) => {
        prefobj.preference[`food_${index + 1}`] = item;
      });

      lifestyleValues.push(JSON.stringify(prefobj));
    }

    if (food_aversions !== undefined) {
      lifestyleFields.push("food_aversions = ?");

      const aversionList = Array.isArray(food_aversions)
        ? food_aversions
        : food_aversions.split(",").map((a) => a.trim());

      const aversionObj = { aversion: {} };

      aversionList.forEach((item, index) => {
        aversionObj.aversion[`food_${index + 1}`] = item;
      });

      lifestyleValues.push(JSON.stringify(aversionObj));
    }

    let finalAllergyObj;
    let updateAllergy = false;

    if (Array.isArray(allergies) && allergies.length > 0) {
      const structured = {};
      const unstructured = [];

      allergies.forEach((item) => {
        if (typeof item === "string" && item.trim()) {
          unstructured.push(item.trim());
        } else if (typeof item === "object" && item?.food?.trim()) {
          const key = `allergy_${Object.keys(structured).length}`;
          structured[key] = {
            food: item.food.trim(),
            sub_food: Array.isArray(item.sub_food)
              ? item.sub_food.filter((f) => f && typeof f === "string")
              : [],
          };
        }
      });

      if (Object.keys(structured).length > 0 || unstructured.length > 0) {
        const other_allergies = {};
        unstructured.forEach((item, idx) => {
          other_allergies[`other_allergy_${idx + 1}`] = item;
        });

        finalAllergyObj = {
          allergies: structured,
          other_allergies,
        };

        updateAllergy = true;
      }
    }

    if (updateAllergy) {
      lifestyleFields.push("food_allergies = ?");
      lifestyleValues.push(JSON.stringify(finalAllergyObj));
    }

    if (lifestyleFields.length) {
      lifestyleValues.push(user_id);
      const updateLifestyleQuery = `
        UPDATE assessment_nutrition_and_lifestyle
        SET ${lifestyleFields.join(", ")}
        WHERE user_id = ?
      `;
      await writePool.query(updateLifestyleQuery, lifestyleValues);
    }

    if (lifestyleFields.length) {
      lifestyleValues.push(user_id);
      const updateLifestyleQuery = `
        UPDATE assessment_nutrition_and_lifestyle
        SET ${lifestyleFields.join(", ")}
        WHERE user_id = ?
      `;
      await writePool.query(updateLifestyleQuery, lifestyleValues);
    }

    const hasValidMedicalIssues = () => {
      if (!medical_issues) return false;
      if (Array.isArray(medical_issues)) return medical_issues.length > 0;
      if (typeof medical_issues === "object")
        return Object.keys(medical_issues).length > 0;
      return false;
    };

    // --- Update assessment_medical_history ---
    if (hasValidMedicalIssues) {
      const [medicalRows] = await writePool.query(
        `SELECT medical_history_id 
         FROM assessment_medical_history 
         WHERE assessment_id = ? 
         LIMIT 1`,
        [assessment_id],
      );

      if (medicalRows.length > 0) {
        const medical_history_id = medicalRows[0].medical_history_id;

        const validMedicalFields = [
          "acidity",
          "blood_pressure",
          "blood_pressure_readings",
          "cholesterol",
          "cholesterol_readings",
          "diabetes",
          "diabetes_readings",
          "pcos",
          "thyroid",
          "thyroid_readings",
          "fatty_liver",
          "other_medical_issue",
          "report_attachment_details",
          "medication_details",
        ];

        const fields = [];
        const values = [];

        for (const key of validMedicalFields) {
          if (medical_issues[key] !== undefined) {
            let value = medical_issues[key];

            if (key === "other_medical_issue") {
              let issues = [];

              if (Array.isArray(value)) {
                issues = value;
              } else if (typeof value === "string") {
                issues = value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean);
              } else if (typeof value === "object" && value !== null) {
                issues = Object.values(value);
              }

              const formatted = {};
              issues.forEach((issue, idx) => {
                formatted[`other_medical_issue_${idx + 1}`] = issue;
              });

              value = JSON.stringify(formatted);
            }

            // Special handling for other JSON fields
            if (
              key === "report_attachment_details" ||
              key === "medication_details"
            ) {
              if (typeof value === "object") {
                value = JSON.stringify(value);
              }
            }

            fields.push(`${key} = ?`);
            values.push(value);
          }
        }

        if (fields.length) {
          values.push(medical_history_id);
          const updateQuery = `
            UPDATE assessment_medical_history
            SET ${fields.join(", ")}
            WHERE medical_history_id = ?
          `;
          await writePool.query(updateQuery, values);
        }
      }
    }

    // --- Fetch Updated Data ---
    const [[lifestyle]] = await writePool.query(
      `SELECT food_preference, food_aversions, food_allergies 
       FROM assessment_nutrition_and_lifestyle 
       WHERE user_id = ? 
       ORDER BY nutrition_and_lifestyle_id DESC 
       LIMIT 1`,
      [user_id],
    );

    const [[medical]] = await writePool.query(
      `SELECT 
         acidity,
         blood_pressure,
         blood_pressure_readings,
         cholesterol,
         cholesterol_readings,
         diabetes,
         diabetes_readings,
         pcos,
         thyroid,
         thyroid_readings,
         fatty_liver,
         other_medical_issue,
         report_attachment_details,
         medication_details
       FROM assessment_medical_history 
       WHERE assessment_id = ? 
       LIMIT 1`,
      [assessment_id],
    );

    // Parse JSON strings back into arrays (if they exist)
    if (medical) {
      if (typeof medical.report_attachment_details === "string") {
        try {
          medical.report_attachment_details = JSON.parse(
            medical.report_attachment_details,
          );
        } catch {
          medical.report_attachment_details = {};
        }
      }

      if (typeof medical.medication_details === "string") {
        try {
          const parsed = JSON.parse(medical.medication_details);
          medical.medication_details = parsed;
        } catch {
          medical.medication_details = {};
        }
      }
    }

    return res.json({
      status: "success",
      message: "Client details updated successfully",
      data: {
        food_preferences: (() => {
          try {
            const parsed = JSON.parse(lifestyle?.food_preference);
            return Object.values(parsed.preference || {});
          } catch {
            return [];
          }
        })(),

        // lifestyle?.food_preference?.split(",").map((s) => s.trim()) || [],
        food_aversions: (() => {
          try {
            const parsed = JSON.parse(lifestyle?.food_aversions);
            return Object.values(parsed.aversion || {});
          } catch {
            return [];
          }
        })(),

        allergies: (() => {
          try {
            const parsed = JSON.parse(lifestyle?.food_allergies);
            return [
              ...Object.values(parsed.allergies || {}),
              ...Object.values(parsed.other_allergies || {}),
            ];
          } catch {
            return [];
          }
        })(),

        medical_issues: {
          ...medical,
          other_medical_issue: (() => {
            try {
              const parsed = JSON.parse(medical.other_medical_issue);
              return Object.values(parsed || {});
            } catch {
              return [];
            }
          })(),
        },
      },
    });
  } catch (error) {
    console.error("Failed to update client:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
};

const getFreeFillerDataOnUserId = async (req, res, next) => {
  const { user_id } = req.query;

  try {
    const { results: rows } = await readRecord({
      table: tables.freeFillerUsersData,
      selectFields: ["client_free_filler_data", "created_at"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["created_at ASC"],
    });

    if (!rows.length) {
      return res.status(404).json({ message: "No data found" });
    }

    const rawItems = rows.flatMap((row) => {
      const parsedData =
        typeof row.client_free_filler_data === "string"
          ? JSON.parse(row.client_free_filler_data)
          : row.client_free_filler_data;

      const itemsArray = Array.isArray(parsedData) ? parsedData : [parsedData];

      return itemsArray.map((item) => ({
        ...item,
        created_at: row.created_at,
      }));
    });

    const groupedByDate = {};
    rawItems.forEach((item) => {
      const dateKey = new Date(item.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = {
          date: dateKey,
          food_selected: [],
          overall_macro_nutrients: {
            total_calories: 0,
            total_protein: 0,
            total_carbs: 0,
            total_fat: 0,
          },
        };
      }

      const timeLabel = new Date(item.created_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      let timeEntry = groupedByDate[dateKey].food_selected.find(
        (obj) => obj[timeLabel],
      );

      if (!timeEntry) {
        timeEntry = { [timeLabel]: [] };
        groupedByDate[dateKey].food_selected.push(timeEntry);
      }

      timeEntry[timeLabel].push({
        item: item.food_name,
        quantity: item.quantity || "",
        calories: item.calories,
        protein: item.protein ?? item.protien ?? 0,
        carbs: item.carbs,
        fat: item.fat,
      });

      groupedByDate[dateKey].overall_macro_nutrients.total_calories +=
        item.calories || 0;
      groupedByDate[dateKey].overall_macro_nutrients.total_protein +=
        item.protein ?? item.protien ?? 0;
      groupedByDate[dateKey].overall_macro_nutrients.total_carbs +=
        item.carbs || 0;
      groupedByDate[dateKey].overall_macro_nutrients.total_fat += item.fat || 0;
    });

    const finalData = Object.values(groupedByDate);

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Data fetched successfully",
        data: finalData,
      }),
    );
  } catch (error) {
    console.error("Error occurred while retrieving the data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  editClientFoodAversions,
  onholdHistoryByUserId,
  extendOnholdDate,
  askDiet,
  askDietCount,
  clientProfile,
  getAllApplinks,
  getClientHealthScoreData,
  getClientStatus,
  getCurrentSessionTrackersByUserId,
  getDraftedQuerybyUserId,
  getInchDetails,
  getMilestoneDetails,
  getPhotoDetails,
  getSingleClientByUserId,
  getUserData,
  getWeightDetails,
  goalsByUserId,
  lastDevice,
  notifications,
  offOnholdClient,
  overallPending,
  receivedNotification,
  searchClients,
  sendNotification,
  toggleAskDiet,
  toggleClientOnhold,
  toggleDailyFu,
  toggleVip,
  toggleProNotification,
  toggleWati,
  updateClientExpiryDate,
  updateClientScreen,
  updateClientStatus,
  updateClientWeight,
  getFreeFillerDataOnUserId,
  insertComProcessLog,
  listComProcessLogs,
  updateComProcessApprovalStatus,
  sendCloseDbMail,
};
