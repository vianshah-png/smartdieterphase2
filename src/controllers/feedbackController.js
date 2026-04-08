import moment from "moment";
import { insertRecord, readRecord } from "../config/query.js";
import { app_versions, tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { addAmountWallet } from "../helper/common.js";
import { safeJSONParse } from "../helper/commonHelper.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import { addAutoDraftedQuery } from "./common.js";

const getFeedbackbyMentorId = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return next(new ErrorHandler("Missing user_id", 400));
    }

    // Define mappings for both feedback types
    const ratingMap = {
      5: "Excellent",
      4: "Very Good",
      3: "Good",
      2: "Fair",
      1: "Can Do Better",
    };

    const yesNoMap = {
      0: "No",
      1: "Yes",
    };

    const socialMediaMap = {
      0: "Not Much",
      1: "Very Much",
    };

    // Half-time Feedback
    const { results: halfTimeFeedback } = await readRecord({
      selectFields: [
        "CONCAT(cd.first_name,' ',cd.last_name) as client_name",
        "cd.active_order_id",
        "hf.sub_order_id",
        "hf.diet_feedback",
        "hf.tracker_feedback",
        "hf.mentor_chat_feedback",
        "hf.refer_bn_restaurant_guide",
        "hf.refer_bn_eat_in_portion",
        "hf.refer_bn_faq",
        "hf.refer_bn_daily_essentials",
        "hf.follow_social_media",
        "hf.mentor_star_rating",
        "hf.improvement_needed",
        "hf.milestone",
        "hf.added_date",
        "hf.source",
        "hf.poorfeedback",
        "hf.halftime_ack",
        "hf.poor_rating_mail",
        "CONCAT(ad.first_name,' ',ad.last_name) as ack_by",
        "pm.program_name",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.halfTimeFeedback} hf`,
          on: "cd.user_id = hf.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = hf.ack_by",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "hf.sub_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
      ],
      conditions: [
        {
          field: "hf.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      orderBy: ["hf.added_date DESC"],
    });

    // Final Feedback
    const { results: finalFeedback } = await readRecord({
      selectFields: [
        "CONCAT(cd.first_name,' ',cd.last_name) as client_name",
        "cd.active_order_id",
        "ff.sub_order_id",
        "ff.online_health_program",
        "ff.ekit_feedback",
        "ff.follow_up",
        "ff.mentor_feedback",
        "ff.favourite_recipe",
        "ff.superfood",
        "ff.unhealthy_food",
        "ff.restaurant_guide_usage",
        "ff.recipe_and_blog_usage",
        "ff.most_used_myaccount_section",
        "ff.friend_recommendation",
        "ff.rate_mentor",
        "ff.improvement_needed",
        "ff.new_goal",
        "ff.goals_achieved",
        "ff.source",
        "ff.poorfeedback",
        "ff.added_date",
        "ff.final_feedback_ack",
        "ff.poor_rating_mail",
        "CONCAT(ad.first_name,' ',ad.last_name) as ack_by",
        "pm.program_name",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.finalFeedback} ff`,
          on: "cd.user_id = ff.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ff.ack_by",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ff.sub_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
      ],
      conditions: [
        {
          field: "ff.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      orderBy: ["ff.added_date DESC"],
    });

    // Organize feedback by program
    const feedbackByProgram = {};

    // Process half-time feedback with value transformation
    halfTimeFeedback.forEach((feedback) => {
      const programName = feedback.program_name || "Unknown Program";
      if (!feedbackByProgram[programName]) {
        feedbackByProgram[programName] = {
          halfTimeFeedback: null,
          finalFeedback: null,
          isCurrentProgram:
            Number(feedback.active_order_id) === Number(feedback.sub_order_id),
        };
      }
      if (!feedbackByProgram[programName].halfTimeFeedback) {
        feedbackByProgram[programName].halfTimeFeedback = {
          ...feedback,
          type: "halftime",
          diet_feedback:
            ratingMap[feedback.diet_feedback] || feedback.diet_feedback,
          tracker_feedback:
            ratingMap[feedback.tracker_feedback] || feedback.tracker_feedback,
          mentor_chat_feedback:
            ratingMap[feedback.mentor_chat_feedback] ||
            feedback.mentor_chat_feedback,
          refer_bn_restaurant_guide:
            yesNoMap[feedback.refer_bn_restaurant_guide] ||
            feedback.refer_bn_restaurant_guide,
          refer_bn_eat_in_portion:
            yesNoMap[feedback.refer_bn_eat_in_portion] ||
            feedback.refer_bn_eat_in_portion,
          refer_bn_faq:
            yesNoMap[feedback.refer_bn_faq] || feedback.refer_bn_faq,
          refer_bn_daily_essentials:
            yesNoMap[feedback.refer_bn_daily_essentials] ||
            feedback.refer_bn_daily_essentials,
          follow_social_media:
            socialMediaMap[feedback.follow_social_media] ||
            feedback.follow_social_media,
          mentor_star_rating:
            ratingMap[feedback.mentor_star_rating] ||
            feedback.mentor_star_rating,
        };
      }
    });

    // Process final feedback with value transformation
    finalFeedback.forEach((feedback) => {
      const programName = feedback.program_name || "Unknown Program";
      if (!feedbackByProgram[programName]) {
        feedbackByProgram[programName] = {
          halfTimeFeedback: null,
          finalFeedback: null,
          isCurrentProgram:
            Number(feedback.active_order_id) === Number(feedback.sub_order_id),
        };
      }
      if (!feedbackByProgram[programName].finalFeedback) {
        feedbackByProgram[programName].finalFeedback = {
          ...feedback,
          type: "final",
          friend_recommendation:
            yesNoMap[feedback.friend_recommendation] ||
            feedback.friend_recommendation,
          online_health_program:
            ratingMap[feedback.online_health_program] ||
            feedback.online_health_program,
          ekit_feedback:
            ratingMap[feedback.ekit_feedback] || feedback.ekit_feedback,
          follow_up: ratingMap[feedback.follow_up] || feedback.follow_up,
          mentor_feedback:
            ratingMap[feedback.mentor_feedback] || feedback.mentor_feedback,
          rate_mentor: feedback.rate_mentor,
          new_goal: safeJSONParse(feedback.new_goal),
          goals_achieved: safeJSONParse(feedback.goals_achieved),
        };
      }
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Feedback fetched successfully",
      data: feedbackByProgram,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const fetchHalfTimeFeedbackAndUploadtoNewFeedbackTable = async (
  _,
  res,
  next
) => {
  try {
    const { results } = await readRecord({
      table: `${tables.halfTimeFeedback} hf`,
    });
    for (let i = 0; i < results.length; i++) {
      const feedback = results[i];
      const columns = [
        "description",
        "feedback_type",
        "sub_order_id",
        "user_id",
        "mentor_id",
        "rating",
      ];
      const values = [
        JSON.stringify({
          diet_feedback: feedback.diet_feedback,
          tracker_feedback: feedback.tracker_feedback,
          mentor_feedback: feedback.mentor_feedback,
          refer_bn_restaurant_guide: feedback.refer_bn_restaurant_guide,
          refer_bn_eat_in_portion: feedback.refer_bn_eat_in_portion,
          refer_bn_faq: feedback.refer_bn_faq,
          refer_bn_daily_essentials: feedback.refer_bn_daily_essentials,
          follow_social_media: feedback.follow_social_media,
          milestone: feedback.milestone,
          mentor_chat_feedback: feedback.mentor_chat_feedback,
          improvement_needed: feedback.improvement_needed,
        }),
        "halftime",
        feedback.order_id,
        feedback.user_id,
        1,
        feedback.mentor_star_rating,
      ];

      const insert = await insertRecord(`${tables.feedback}`, columns, values);
      console.log(insert.id, 48);
    }

    return res.status(201).json({ message: "Feedback added successfully" });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const fetchProgramFeedbackAndUploadtoNewFeedbackTable = async (
  _,
  res,
  next
) => {
  try {
    const { results } = await readRecord({
      table: `${tables.finalFeedback} ff`,
    });

    for (let i = 0; i < results.length; i++) {
      const feedback = results[i];
      const columns = [
        "description",
        "feedback_type",
        "sub_order_id",
        "user_id",
        "mentor_id",
        "rating",
      ];

      const values = [
        JSON.stringify({
          online_health_program: feedback.online_health_program,
          ekit_feedback: feedback.ekit_feedback,
          follow_up: feedback.follow_up,
          mentor_feedback: feedback.mentor_feedback,
          favourite_recipe: feedback.favourite_recipe,
          superfood: feedback.superfood,
          unhealthy_food: feedback.unhealthy_food,
          restaurant_guide_usage: feedback.restaurant_guide_usage,
          recipe_and_blog_usage: feedback.recipe_and_blog_usage,
          most_used_myaccount_section: feedback.most_used_myaccount_section,
          friend_recommendation: feedback.friend_recommendation,
          improvement_needed: feedback.improvement_needed,
          goals_achieved: feedback.goals_achieved,
          poorfeedback: feedback.poorfeedback,
          source: feedback.source,
        }),
        "program",
        feedback.order_id,
        feedback.user_id,
        1,
        feedback.rate_mentor,
      ];
      const insert = await insertRecord(`${tables.feedback}`, columns, values);
      console.log(insert.id, 48);
    }

    return res.status(201).json({ message: "Feedback added successfully" });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFeedbackCounts = async (_, res, next) => {
  try {
    const [{ results: halftimeFeedback }, { results: programFeedback }] =
      await Promise.all([
        readRecord({
          table: `${tables.halfTimeFeedback} htf`,
          selectFields: [
            "COUNT(CASE WHEN htf.mentor_star_rating = 5 THEN 1 ELSE NULL END) as five_halftime_feedback",
            "COUNT(CASE WHEN htf.mentor_star_rating = 4 THEN 1 ELSE NULL END) as four_halftime_feedback",
            "COUNT(CASE WHEN htf.mentor_star_rating = 3 THEN 1 ELSE NULL END) as three_halftime_feedback",
            "COUNT(CASE WHEN htf.mentor_star_rating = 2 THEN 1 ELSE NULL END) as two_halftime_feedback",
            "COUNT(CASE WHEN htf.mentor_star_rating = 1 THEN 1 ELSE NULL END) as one_halftime_feedback",
          ],
        }),
        readRecord({
          table: `${tables.finalFeedback} ff`,
          selectFields: [
            "COUNT(CASE WHEN ff.rate_mentor = 5 THEN 1 ELSE NULL END) as five_program_feedback",
            "COUNT(CASE WHEN ff.rate_mentor = 4 THEN 1 ELSE NULL END) as four_program_feedback",
            "COUNT(CASE WHEN ff.rate_mentor = 3 THEN 1 ELSE NULL END) as three_program_feedback",
            "COUNT(CASE WHEN ff.rate_mentor = 2 THEN 1 ELSE NULL END) as two_program_feedback",
            "COUNT(CASE WHEN ff.rate_mentor = 1 THEN 1 ELSE NULL END) as one_program_feedback",
          ],
        }),
      ]);
    const data = {
      halftimeFeedback: {
        five: halftimeFeedback[0].five_halftime_feedback,
        four: halftimeFeedback[0].four_halftime_feedback,
        three: halftimeFeedback[0].three_halftime_feedback,
        two: halftimeFeedback[0].two_halftime_feedback,
        one: halftimeFeedback[0].one_halftime_feedback,
      },
      programFeedback: {
        five: programFeedback[0].five_program_feedback,
        four: programFeedback[0].four_program_feedback,
        three: programFeedback[0].three_program_feedback,
        two: programFeedback[0].two_program_feedback,
        one: programFeedback[0].one_program_feedback,
      },
    };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Feedback counts fetched successfully",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFeedbackDetails = async (req, res, next) => {
  try {
    const {
      filter_query,
      feedback_star,
      page = 1,
      limit = 10,
      search,
    } = req.body;
    let data = [],
      totalCount = 0;
    if (filter_query === "halftime") {
      const { results: response, totalCount: responseCount } = await readRecord(
        {
          table: `${tables.halfTimeFeedback} htf`,
          selectFields: [
            "ud.user_id",
            "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
            "ud.email_id",
            "ud.phone",
            "ud.sub_user_status",
            "ud.active_order_id",
            "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
            "pm.program_name",
            "sop.mrp",
            "sop.sent_sessions as current_sent_session",
            "sop.total_sessions as total_sent_session",
            "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
            "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
            "(sop.total_sessions * 10) AS current_program_duration",
            "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
            "sop.paid_amount",
            "sop.start_program_weight",
            "ud.latest_weight",
            "sp.program_id as suggested_program_id ",
            "sp.program_session_id as suggested_program_session_id ",
            "sp.suggested_amount as suggested_amount",
            "spm.program_name as suggested_program_name",
            "sp.program_days",
            "sp.payment_link_id",
            "sp.added_date as suggested_at",
            "aspd.goal_weight as goal_weight",
            "ud.height as client_height",
            "ad.official_phone as admin_phone",
            "ps.mrp as suggested_program_mrp",
            "ps.program_id as program_session_program_id",
            "sp.program_id",
            "paym.payment_mode_name",
            "sp_paym.payment_mode_name as suggested_payment_mode_name",
            "sp_paym.payment_mode_details as suggested_payment_mode_details",
            "sp.payment_expiry as suggested_payment_expiry",
            "sp_pl.payment_link as suggested_payment_link",
            "sp.mentor_note as suggested_mentor_note",
            "sp.motivation_level as suggested_motivation_level",
            "sp.status as suggested_sale_status",
            "htf.diet_feedback",
            "htf.tracker_feedback",
            "htf.mentor_chat_feedback",
            "htf.refer_bn_restaurant_guide",
            "htf.refer_bn_eat_in_portion",
            "htf.refer_bn_faq",
            "htf.refer_bn_daily_essentials",
            "htf.follow_social_media",
            "htf.mentor_star_rating",
            "htf.improvement_needed",
            "htf.milestone",
            "htf.added_date",
            "htf.source",
            "htf.poorfeedback",
          ],
          joins: [
            {
              type: "INNER",
              table: `${tables.userDetails} ud`,
              on: "ud.user_id = htf.user_id",
            },
            {
              type: "INNER",
              table: `${tables.subOrderPrograms} sop`,
              on: "ud.active_order_id = sop.sub_order_id",
            },
            {
              type: "INNER",
              table: `${tables.programsMaster} pm`,
              on: "pm.program_id  = sop.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.suggestedProgram} sp`,
              on: "sp.suggested_program_id = ud.suggested_program_id",
            },
            {
              type: "LEFT",
              table: `${tables.programSession} ps`,
              on: "sp.program_session_id =  ps.program_session_id",
            },
            {
              type: "LEFT",
              table: `${tables.programsMaster} spm`,
              on: "sp.program_id = spm.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.assessment_personal_details} aspd`,
              on: "aspd.user_id = ud.user_id",
            },
            {
              type: "INNER",
              table: `${tables.adminUsers} ad`,
              on: "ad.admin_user_id = ud.mentor_assigned",
            },
            {
              type: "INNER",
              table: `${tables.orderDetails} od`,
              on: "od.order_id  = sop.sub_order_id",
            },
            {
              type: "LEFT",
              table: `${tables.paymentModes} paym`,
              on: "od.payment_mode  = paym.payment_mode_id",
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
          ],
          conditions: [
            {
              field: "htf.mentor_star_rating",
              operator: "=",
              value: feedback_star,
            },
          ],
          pagination: { limit, page },
          countTotal: true,
          groupBy: ["ud.user_id"],
          search: {
            searchQuery: search,
            searchFields: [
              "ud.first_name",
              "ud,last_name",
              "ud.email_id",
              "ud.user_id",
              "ud.phone",
            ],
          },
        }
      );

      const formattedData = response.map((i) => {
        const weightDifference = Math.abs(
          Number(i.start_program_weight) - Number(i.latest_weight)
        ).toFixed(2);
        return {
          client_details: {
            client_id: i.user_id,
            client_name: i.client_name,
            client_email: i.email_id,
            client_phone: i.phone,
            program_number: i.program_count,
            client_sub_user_status: i.sub_user_status,
          },
          program_details: {
            current_program_name: i.program_name,
            current_program_duration: i.current_program_duration,
            current_program_mrp: i.mrp,
            current_program_amount_paid: i.paid_amount,
            current_program_payment_mode: i.payment_mode_name,
            current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
            current_program_validity: i.current_program_validity,
            current_program_validity_used: Math.abs(
              i.current_program_validity_used
            ),

            advance_program_count:
              Number(i.advance_purchase_count) > 0
                ? Number(i.advance_purchase_count)
                : 0,
          },
          suggested_details: {
            suggested_program_id: i.suggested_program_id,
            suggested_program_session_id: i.suggested_program_session_id,
            suggested_program_name: i.suggested_program_name,
            suggested_program_duration: `(${i.program_days})`,
            suggested_program_mrp: i.suggested_program_mrp,
            suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
            suggested_payment_mode: i.suggested_payment_mode_name,
            suggested_payment_mode_details: i.suggested_payment_mode_details,
            suggested_payment_link_shared: i.payment_link_id ? true : false,
            suggested_payment_link_expiry: i.payment_link_id
              ? moment(i.suggested_payment_expiry).fromNow()
              : false,
            suggested_payment_link: i.suggested_payment_link,
            suggested_mentor_note: i.suggested_mentor_note,
            suggested_date: i.suggested_at
              ? moment(i.suggested_at).format("DD-MMM-YYYY")
              : false,
            suggested_days_ago: i.suggested_at
              ? `(${moment(i.suggested_at).fromNow()})`
              : false,
            suggested_motivation_level:
              Number(i.suggested_motivation_level) === 0
                ? "Low"
                : Number(i.suggested_motivation_level) === 1
                ? "Medium"
                : "High",
            suggested_sale_status:
              Number(i.suggested_sale_status) === 0
                ? "Pitch"
                : Number(i.suggested_sale_status) === 1
                ? "HOT"
                : Number(i.suggested_sale_status) === 2
                ? "WARM"
                : "COLD",
          },
          weight_details: {
            start_program_weight: Number(i.start_program_weight),
            latest_weight: Number(i.latest_weight),

            ...(Number(weightDifference) > 0
              ? {
                  lost_weight: Number(weightDifference),
                }
              : { gained_weight: Number(weightDifference) }),
            goal_weight: Number(i.goal_weight),
            height: i.client_height,
          },
          half_time_feedback_details: {
            diet_feedback:
              Number(i.diet_feedback) === 1
                ? "Can Do Better"
                : Number(i.diet_feedback) === 2
                ? "Fair"
                : Number(i.diet_feedback) === 3
                ? "Good"
                : Number(i.diet_feedback) === 4
                ? "Very Good"
                : "Excellent",
            tracker_feedback:
              Number(i.tracker_feedback) === 1
                ? "Can Do Better"
                : Number(i.tracker_feedback) === 2
                ? "Fair"
                : Number(i.tracker_feedback) === 3
                ? "Good"
                : Number(i.tracker_feedback) === 4
                ? "Very Good"
                : "Excellent",

            mentor_chat_feedback:
              Number(i.mentor_chat_feedback) === 1
                ? "Can Do Better"
                : Number(i.mentor_chat_feedback) === 2
                ? "Fair"
                : Number(i.mentor_chat_feedback) === 3
                ? "Good"
                : Number(i.mentor_chat_feedback) === 4
                ? "Very Good"
                : "Excellent",
            refer_bn_restaurant_guide:
              Number(i.refer_bn_restaurant_guide) === 0 ? "No" : "Yes",
            refer_bn_eat_in_portion:
              Number(i.refer_bn_eat_in_portion) === 0 ? "No" : "Yes",
            refer_bn_faq: Number(i.refer_bn_faq) === 0 ? "No" : "Yes",

            refer_bn_daily_essentials:
              Number(i.refer_bn_daily_essentials) === 0 ? "No" : "Yes",
            follow_social_media:
              Number(i.follow_social_media) === 0 ? "Not Much" : "Very Much",
            mentor_star_rating: i.mentor_star_rating,
            improvement_needed: i.improvement_needed,
            milestone: i.milestone,
            feedback_received_at: `${moment(i.added_date).format(
              "DD-MM-YYYY"
            )} ${moment(i.added_date).fromNow()}}`,
            source: i.source,
            poorfeedback: i.poorfeedback,
          },
        };
      });
      data = formattedData;
      totalCount = responseCount;
    }
    if (filter_query === "program") {
      const { results: response, totalCount: responseCount } = await readRecord(
        {
          table: `${tables.finalFeedback} ff`,
          selectFields: [
            "ud.user_id",
            "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
            "ud.email_id",
            "ud.phone",
            "ud.sub_user_status",
            "ud.active_order_id",
            "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
            "pm.program_name",
            "sop.mrp",
            "sop.sent_sessions as current_sent_session",
            "sop.total_sessions as total_sent_session",
            "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
            "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
            "(sop.total_sessions * 10) AS current_program_duration",
            "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
            "sop.paid_amount",
            "sop.start_program_weight",
            "ud.latest_weight",
            "sp.program_id as suggested_program_id ",
            "sp.program_session_id as suggested_program_session_id ",
            "sp.suggested_amount as suggested_amount",
            "spm.program_name as suggested_program_name",
            "sp.program_days",
            "sp.payment_link_id",
            "sp.added_date as suggested_at",
            "aspd.goal_weight as goal_weight",
            "ud.height as client_height",
            "ad.official_phone as admin_phone",
            "ps.mrp as suggested_program_mrp",
            "ps.program_id as program_session_program_id",
            "sp.program_id",
            "paym.payment_mode_name",
            "sp_paym.payment_mode_name as suggested_payment_mode_name",
            "sp_paym.payment_mode_details as suggested_payment_mode_details",
            "sp.payment_expiry as suggested_payment_expiry",
            "sp_pl.payment_link as suggested_payment_link",
            "sp.mentor_note as suggested_mentor_note",
            "sp.motivation_level as suggested_motivation_level",
            "sp.status as suggested_sale_status",
            "ff.online_health_program",
            "ff.ekit_feedback",
            "ff.follow_up",
            "ff.mentor_feedback",
            "ff.favourite_recipe",
            "ff.superfood",
            "ff.unhealthy_food",
            "ff.restaurant_guide_usage",
            "ff.recipe_and_blog_usage",
            "ff.most_used_myaccount_section",
            "ff.friend_recommendation",
            "ff.rate_mentor",
            "ff.improvement_needed",
            "ff.added_date",
            "ff.new_goal",
            "ff.goals_achieved",
            "ff.source",
            "ff.poorfeedback",
          ],
          joins: [
            {
              type: "INNER",
              table: `${tables.userDetails} ud`,
              on: "ud.user_id = ff.user_id",
            },
            {
              type: "INNER",
              table: `${tables.subOrderPrograms} sop`,
              on: "ud.active_order_id = sop.sub_order_id",
            },
            {
              type: "INNER",
              table: `${tables.programsMaster} pm`,
              on: "pm.program_id  = sop.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.suggestedProgram} sp`,
              on: "sp.suggested_program_id = ud.suggested_program_id",
            },
            {
              type: "LEFT",
              table: `${tables.programSession} ps`,
              on: "sp.program_session_id =  ps.program_session_id",
            },
            {
              type: "LEFT",
              table: `${tables.programsMaster} spm`,
              on: "sp.program_id = spm.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.assessment_personal_details} aspd`,
              on: "aspd.user_id = ud.user_id",
            },
            {
              type: "INNER",
              table: `${tables.adminUsers} ad`,
              on: "ad.admin_user_id = ud.mentor_assigned",
            },
            {
              type: "INNER",
              table: `${tables.orderDetails} od`,
              on: "od.order_id  = sop.sub_order_id",
            },
            {
              type: "LEFT",
              table: `${tables.paymentModes} paym`,
              on: "od.payment_mode  = paym.payment_mode_id",
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
          ],
          conditions: [
            {
              field: "ff.rate_mentor",
              operator: "=",
              value: feedback_star,
            },
          ],
          countTotal: true,
          groupBy: ["ud.user_id"],
          search: {
            searchQuery: search,
            searchFields: [
              "ud.first_name",
              "ud,last_name",
              "ud.email_id",
              "ud.user_id",
              "ud.phone",
            ],
          },
          pagination: { limit, page },
        }
      );

      const formattedData = response.map((i) => {
        const weightDifference = Math.abs(
          Number(i.start_program_weight) - Number(i.latest_weight)
        ).toFixed(2);
        return {
          client_details: {
            client_id: i.user_id,
            client_name: i.client_name,
            client_email: i.email_id,
            client_phone: i.phone,
            program_number: i.program_count,
            client_sub_user_status: i.sub_user_status,
          },
          program_details: {
            current_program_name: i.program_name,
            current_program_duration: i.current_program_duration,
            current_program_mrp: i.mrp,
            current_program_amount_paid: i.paid_amount,
            current_program_payment_mode: i.payment_mode_name,
            current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
            current_program_validity: i.current_program_validity,
            current_program_validity_used: Math.abs(
              i.current_program_validity_used
            ),

            advance_program_count:
              Number(i.advance_purchase_count) > 0
                ? Number(i.advance_purchase_count)
                : 0,
          },
          suggested_details: {
            suggested_program_id: i.suggested_program_id,
            suggested_program_session_id: i.suggested_program_session_id,
            suggested_program_name: i.suggested_program_name,
            suggested_program_duration: `(${i.program_days})`,
            suggested_program_mrp: i.suggested_program_mrp,
            suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
            suggested_payment_mode: i.suggested_payment_mode_name,
            suggested_payment_mode_details: i.suggested_payment_mode_details,
            suggested_payment_link_shared: i.payment_link_id ? true : false,
            suggested_payment_link_expiry: i.payment_link_id
              ? moment(i.suggested_payment_expiry).fromNow()
              : false,
            suggested_payment_link: i.suggested_payment_link,
            suggested_mentor_note: i.suggested_mentor_note,
            suggested_date: i.suggested_at
              ? moment(i.suggested_at).format("DD-MMM-YYYY")
              : false,
            suggested_days_ago: i.suggested_at
              ? `(${moment(i.suggested_at).fromNow()})`
              : false,
            suggested_motivation_level:
              Number(i.suggested_motivation_level) === 0
                ? "Low"
                : Number(i.suggested_motivation_level) === 1
                ? "Medium"
                : "High",
            suggested_sale_status:
              Number(i.suggested_sale_status) === 0
                ? "Pitch"
                : Number(i.suggested_sale_status) === 1
                ? "HOT"
                : Number(i.suggested_sale_status) === 2
                ? "WARM"
                : "COLD",
          },
          weight_details: {
            start_program_weight: Number(i.start_program_weight),
            latest_weight: Number(i.latest_weight),

            ...(Number(weightDifference) > 0
              ? {
                  lost_weight: Number(weightDifference),
                }
              : { gained_weight: Number(weightDifference) }),
            goal_weight: Number(i.goal_weight),
            height: i.client_height,
          },
          program_feedback_details: {
            online_health_program:
              Number(i.online_health_program) === 1
                ? "Can Do Better"
                : Number(i.online_health_program) === 2
                ? "Fair"
                : Number(i.online_health_program) === 3
                ? "Good"
                : Number(i.online_health_program) === 4
                ? "Very Good"
                : "Excellent",
            ekit_feedback:
              Number(i.ekit_feedback) === 1
                ? "Can Do Better"
                : Number(i.ekit_feedback) === 2
                ? "Fair"
                : Number(i.ekit_feedback) === 3
                ? "Good"
                : Number(i.ekit_feedback) === 4
                ? "Very Good"
                : "Excellent",

            follow_up:
              Number(i.follow_up) === 1
                ? "Can Do Better"
                : Number(i.follow_up) === 2
                ? "Fair"
                : Number(i.follow_up) === 3
                ? "Good"
                : Number(i.follow_up) === 4
                ? "Very Good"
                : "Excellent",
            mentor_feedback:
              Number(i.mentor_feedback) === 1
                ? "Can Do Better"
                : Number(i.mentor_feedback) === 2
                ? "Fair"
                : Number(i.mentor_feedback) === 3
                ? "Good"
                : Number(i.mentor_feedback) === 4
                ? "Very Good"
                : "Excellent",
            favourite_recipe: i.favourite_recipe,
            superfood: i.superfood,
            unhealthy_food: i.unhealthy_food,
            restaurant_guide_usage: i.restaurant_guide_usage,
            recipe_and_blog_usage: i.recipe_and_blog_usage,
            most_used_myaccount_section: i.most_used_myaccount_section,
            friend_recommendation:
              Number(i.friend_recommendation) === 0 ? "No" : "Yes",
            rate_mentor: i.rate_mentor,
            improvement_needed: i.improvement_needed,
            feedback_received_at: `${moment(i.added_date).format(
              "DD-MM-YYYY"
            )} ${moment(i.added_date).fromNow()}`,
            new_goal: i.new_goal,
            goals_achieved: i.goals_achieved,
            source: i.source,
            poorfeedback: i.poorfeedback,
          },
        };
      });
      data = formattedData;
      totalCount = responseCount;
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Feedback Details Fetched Successfully",
      data,
      totalCount,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const submitFinalFeedback = async (req, res, next) => {
  const feedback = req.body;
  const {
    user_id,
    online_health_program,
    ekit_feedback,
    follow_up,
    mentor_feedback,
    favourite_recipe,
    superfood,
    unhealthy_food,
    restaurant_guide_usage,
    recipe_and_blog_usage,
    most_used_myaccount_section,
    friend_recommendation,
    rate_mentor,
    improvement_needed,
    new_goal,
    goals_achieved,
    source,
    poorfeedback,
    sub_order_id,
  } = feedback;
  try {
    const columns = [
      "user_id",
      "online_health_program",
      "ekit_feedback",
      "follow_up",
      "mentor_feedback",
      "favourite_recipe",
      "superfood",
      "unhealthy_food",
      "restaurant_guide_usage",
      "recipe_and_blog_usage",
      "most_used_myaccount_section",
      "friend_recommendation",
      "rate_mentor",
      "improvement_needed",
      "new_goal",
      "goals_achieved",
      "source",
      "sub_order_id",
    ];
    const values = [
      user_id,
      online_health_program,
      ekit_feedback,
      follow_up,
      mentor_feedback,
      favourite_recipe,
      superfood,
      unhealthy_food,
      restaurant_guide_usage,
      recipe_and_blog_usage,
      most_used_myaccount_section,
      friend_recommendation,
      rate_mentor,
      improvement_needed,
      JSON.stringify(new_goal),
      JSON.stringify(goals_achieved),
      source,
      sub_order_id,
    ];
    if (poorfeedback) {
      columns.push("poorfeedback");
      values.push(poorfeedback);
    }
    const insertResult = await insertRecord(
      tables.finalFeedback,
      columns,
      values
    );

    if (insertResult.affectedRows === 1) {
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "ud.last_name",
          "ud.mentor_assigned",
          "ud.email_id",
          "ad.crm_user as mentor_name",
          "ud.device",
          "ud.app_version",
          "ud.latest_weight",
          "sop.sent_sessions",
          "sop.start_program_weight",
          "sop.end_program_weight",
          "pm.program_name",
          "ps.program_duration",
          "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
          "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1','3') THEN 1 ELSE 0 END ) AS program_number",
          "ad.active",
            `(SELECT weight FROM weight_records WHERE user_id = ud.user_id and  sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
       `(SELECT weight FROM weight_records WHERE user_id = ud.user_id  and sub_order_id=sop.sub_order_id  ORDER BY wmr_id ASC limit 1) as wmr_start`,      
          "COALESCE(ud.my_wallet, 0) as my_wallet",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id = sop.program_session_id", 
          },
          {
            type: "LEFT",
            table: `(
              SELECT 
                od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
              FROM 
                order_details od2
              LEFT JOIN 
                sub_orders_programs sop2 ON sop2.order_id = od2.order_id
              WHERE 
                sop2.program_type = 0
            ) sop_count`,
            on: "ud.user_id = sop_count.user_id",
          },
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: Number(user_id),
          },
        ],
      });
      await addAmountWallet({
        user_id,
        sub_order_id,
        amount: 1000,
        reason: "Program Feedback",
      });
      const data = {
        title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Submitted Program Feedback`,
        priority: 1,
        redirect: "/feedback",
      };
      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, userDetails[0].mentor_assigned, data.title, "/feedback"]
      );
      if (insertedResultNotification.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });

      const appVersion = userDetails[0].app_version;
const isUpdated = appVersion === app_versions.ios || appVersion === app_versions.android;

const resultApp = `<span style="color: ${isUpdated ? 'green' : 'red'};">
  ${appVersion} (${isUpdated ? 'Updated' : 'Not Updated'})
</span>`;
      const mailData = {
        to: "Client Services <clientservices@balancenutrition.in>",
        subject: `Program Feedback Report ${
          rate_mentor < 5 ? `(Rating ${rate_mentor})` : ""
        }`,
        body: `<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Balance Nutrition</title>
  </head>
  <body style="font-size: 12px;">
    <table width="100%">
      <tr>
        <td align="center" style="font-family: 'Arial'; color: #707070; font-size: 12px;">
          <table style="width:650px; border:1px solid #081d5f; padding-bottom: 30px; background-color: rgba(247, 245, 238, 0);" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background-color: #3FBDC9;">
                <a href="https://www.balancenutrition.in">
                  <img src="https://bncleanse.com/images/balance-nutrition-logo.png?cache=4" style="border:none; width:300px; padding: 10px 0 10px 20px;" />
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <table width="100%">
                  <tr>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 20px; border-color: #3FBDC9;">
                        <a href="tel:918928001617}" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/phone_icon.jpg?cache=4" style="width:14px" />
                          +91 89280 01617
                        </a>
                      </span>
                    </td>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 0; border-color: #3FBDC9;">
                        <a href="mailto:info@balancenutrition.in" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/email_icon.jpg?cache=4" />
                          info@balancenutrition.in
                        </a>
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table style="width:570px; border:0px solid #081d5f; background-color: #fff; padding: 10px; margin-top: 30px;" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      Hello Team,<br/><br/>
                      Program Feedback Recorded For Below Client:<br/><br/>
                      <strong>Name: </strong> ${userDetails[0].first_name}<br/>
                      <strong>Email: </strong> ${userDetails[0].email_id}<br/>
                      <strong>Mentor Name: </strong> ${
                        userDetails[0].mentor_name
                      }<br/>
                      <strong>App Device: </strong> ${
                        userDetails[0].device
                      }<br/>
                      <strong>App Version: </strong> ${
                        resultApp
                      }<br/>
                      <strong>Weight Loss: </strong> ${
                       Number(userDetails[0].wmr_end -
                        userDetails[0].wmr_start).toFixed(2)
                      } kg in ${
          userDetails[0].sent_sessions
        } sessions (<b>Curr. Wt: </b>${userDetails[0].wmr_end} kg)<br/>
                      <strong>Program Name: </strong> ${
                        userDetails[0].program_name
                      } (${userDetails[0].program_duration})<br/>
                      <strong>Program Number: </strong> ${
                        userDetails[0].program_number
                      }<br/>
                      <strong>Advance Purchase: </strong> ${
                        userDetails[0].advance_program_count
                      }<br/>
                      <h3>Form Report:-</h3>
                      <strong>The concept of online weight loss & health program: </strong> ${online_health_program}<br/>
                      <strong>E-kit and its relevance to the program: </strong> ${ekit_feedback}<br/>
                      <strong>Constant touch, follow up pace & motivation during your journey: </strong> ${follow_up}<br/>
                      <strong>Personal touch & mentor feedback: </strong> ${mentor_feedback}<br/>
                      <strong>Your Most Favourite Recipes/Items From The Diet Charts Sent To You?: </strong> ${decodeURIComponent(
                        favourite_recipe
                      )}<br/>
                      <strong>One Superfood/Supplement You Learned About Or Helped You The Most: </strong> ${decodeURIComponent(
                        superfood
                      )}<br/>
                      <strong>One Junk / Unhealthy Food Item You Never Gave Up!: </strong> ${decodeURIComponent(
                        unhealthy_food
                      )}<br/>
                      <strong>How Often Did You Use The Restaurant Guide?: </strong> ${restaurant_guide_usage}<br/>
                      <strong>Did You Follow The Recipes & Blogs?: </strong> ${recipe_and_blog_usage}<br/>
                      <strong>Most Used Section Of The BN APP: </strong> ${most_used_myaccount_section}<br/>
                      <strong>Would You Recommend BN?: </strong> ${
                        friend_recommendation ? "Yes, I have." : "Not yet."
                      }<br/>
                      <strong>Rate Your Mentor: </strong> ${rate_mentor}<br/>
                      <strong>Any Improvement Needed: </strong> ${decodeURIComponent(
                        improvement_needed
                      )}<br/>
                      ${
                        goals_achieved && goals_achieved !== "NA"
                          ? `<strong>Goals Achieved: </strong> ${decodeURIComponent(
                              goals_achieved
                            )}<br/>`
                          : ""
                      }
                      ${
                        new_goal && new_goal !== "NA"
                          ? `<strong>New Goal: </strong> ${decodeURIComponent(
                              new_goal
                            )}<br/>`
                          : ""
                      }
                      <br/>Thanks & Regards
                    </td>
                  </tr>
                </table>
              </td>
            </tr>                  
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      };
      const { final_feedback } = safeJSONParse(userDetails[0].active);
      mailData.cc = final_feedback.cc;
      mailData.bcc = final_feedback.bcc;
      // mailData.to = "ayush.dubey@balancenutrition.in";
      // mailData.cc = ["ayush.dubey@balancenutrition.in"];
      console.log("mailData", mailData);
      const mail = await sendMailUtil({
        from: "Support <support@balancenutrition.in>",
        to: mailData.to,
        cc: mailData.cc,
        bcc: mailData.bcc,
        html: mailData.body,
        subject: mailData.subject,
      });
      if (Number(rate_mentor) >= 4) {
        const addAutoDraftResponse = await addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hi ${userDetails[0].first_name},</p>
          <p>
            I received a copy of your program feedback as well. Both ma’am & I are happy to read all about your favourite recipes & also meals that you didn't stop!!
          </p>
          <p>
            I am also glad to know you will refer us to your friends & family. This is a very important parameter for us and it means there is something we are doing right :)
          </p>
          <p>
            <strong>POINTS TO IMPROVE: ${improvement_needed}</strong> If every diet can have a recipe link that will be great
          </p>
          <p><strong>P.S.</strong></p>
          <p>
            If you have a friend or a family member in mind, please <a href="https://www.balancenutrition.in/app_link/screen_id=4">click here</a> to refer them
          </p>
          <p>
            We would also be delighted to see your feedback on Google: <a href="https://www.google.com/search?q=balance+nutrition&rlz=1C1RXQR_enIN1016IN1016&oq=balance+nutrition&gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyEAgBEC4YrwEYxwEYgAQYjgUyBwgCEAAYgAQyBwgDEAAYgAQyBwgEEAAYgAQyBggFEEUYPDIGCAYQRRg9MgYIBxBFGDzSAQkxNDY0MGowajeoAgCwAgA&sourceid=chrome&ie=UTF-8#lrd=0x3be7c90af50710b1:0xa64c32ccd5f5c492,3,,,,">click here</a>
          </p>
        </div>
        `,
        });
      } else if (Number(rate_mentor) < 4 && Number(rate_mentor) >= 2) {
        const addAutoDraftResponse = await addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hi ${userDetails[0].first_name},</p>
          <p>
            Khyati ma'am & I have read your program feedback.
          </p>
          <p>
            A rating of ${rate_mentor} is not considered good at all for us mentors & I will be happy to get on a call with you to understand your concerns & help you better.
          </p>
          <p>
            You will be getting notified to schedule a feedback call with me soon.
          </p>
          <p>
            If you are ok, we can also have a senior head nutritionist / senior nutrition manager <strong>(ADD NAME MENTOR)</strong> join us for this con call.
          </p>
          <p>
            Please do let me know in case you need any help in scheduling your call. I shall ask our client services team to help you out.
          </p>
          <p>
            We also read your points on how we can improve, <strong>Improvement Needed:</strong> ${improvement_needed}<br />
            <em>(MENTOR PLEASE READ AND ADDRESS THIS WELL)</em>
          </p>
          <p>
            <strong>P.S.</strong> Your app may not be updated to the latest version. <a href="https://www.balancenutrition.in/download-bn-app">Please click here</a> & get the latest version to avoid crashes. Ignore if already updated.
          </p>
          <p>
            <strong>P.S.</strong> You have <strong>Rs.${userDetails[0].my_wallet}</strong> in your BN Wallet that expires on <strong>25th May</strong>! Please get in touch with me before that to use it.
          </p>
        </div>
        `,
        });
      }
      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Feedback submitted successfully",
        data: {
          wallet_added: 1000,
          show_button: {
            primary: {
              text: "Thank You",
              redirect_screen: "home_screen",
              screen_params: {},
            },
          },
        },
      });
      return res.status(201).json(apiresponse);
    } else {
      return next(new ErrorHandler("Error while submitting feedback", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitNewFinalFeedback = async (req, res, next) => {
  const feedback = req.body;
  const {
    user_id,
    online_health_program,
    ekit_feedback,
    follow_up,
    mentor_feedback,
    favourite_recipe,
    superfood,
    unhealthy_food,
    restaurant_guide_usage,
    quickFiller_guide_usage,
    alcohol_guide_usage,
    recipe_and_blog_usage,
    most_used_myaccount_section,
    friend_recommendation,
    rate_mentor,
    improvement_needed,
    new_goal,
    goals_achieved,
    source,
    poorfeedback,
    sub_order_id,
  } = feedback;
  try {
    const columns = [
      "user_id",
      "online_health_program",
      "ekit_feedback",
      "follow_up",
      "mentor_feedback",
      "favourite_recipe",
      "superfood",
      "unhealthy_food",
      "restaurant_guide_usage",
      "quickFiller_guide_usage",
      "alcohol_guide_usage",
      "recipe_and_blog_usage",
      "most_used_myaccount_section",
      "friend_recommendation",
      "rate_mentor",
      "improvement_needed",
      "new_goal",
      "goals_achieved",
      "source",
      "sub_order_id",
    ];
    const values = [
      user_id,
      online_health_program,
      ekit_feedback,
      follow_up,
      mentor_feedback,
      favourite_recipe,
      superfood,
      unhealthy_food,
      restaurant_guide_usage,
      quickFiller_guide_usage,
      alcohol_guide_usage,
      recipe_and_blog_usage,
      most_used_myaccount_section,
      friend_recommendation,
      rate_mentor,
      improvement_needed,
      JSON.stringify(new_goal),
      JSON.stringify(goals_achieved),
      source,
      sub_order_id,
    ];
    if (poorfeedback) {
      columns.push("poorfeedback");
      values.push(poorfeedback);
    }
    const insertResult = await insertRecord(
      tables.finalFeedback,
      columns,
      values
    );

    if (insertResult.affectedRows === 1) {
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "ud.last_name",
          "ud.mentor_assigned",
          "ud.email_id",
          "ad.crm_user as mentor_name",
          "ud.device",
          "ud.app_version",
          "ud.latest_weight",
          "sop.sent_sessions",
          "sop.start_program_weight",
          "sop.end_program_weight",
          "pm.program_name",
          "ps.program_duration",
          "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
          "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1','3') THEN 1 ELSE 0 END ) AS program_number",
          "ad.active",
            `(SELECT weight FROM weight_records WHERE user_id = ud.user_id and  sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
       `(SELECT weight FROM weight_records WHERE user_id = ud.user_id  and sub_order_id=sop.sub_order_id  ORDER BY wmr_id ASC limit 1) as wmr_start`,      
          "COALESCE(ud.my_wallet, 0) as my_wallet",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id = sop.program_session_id", 
          },
          {
            type: "LEFT",
            table: `(
              SELECT 
                od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
              FROM 
                order_details od2
              LEFT JOIN 
                sub_orders_programs sop2 ON sop2.order_id = od2.order_id
              WHERE 
                sop2.program_type = 0
            ) sop_count`,
            on: "ud.user_id = sop_count.user_id",
          },
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: Number(user_id),
          },
        ],
      });
      await addAmountWallet({
        user_id,
        sub_order_id,
        amount: 1000,
        reason: "Program Feedback",
      });
      const data = {
        title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Submitted Program Feedback`,
        priority: 1,
        redirect: "/feedback",
      };
      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, userDetails[0].mentor_assigned, data.title, "/feedback"]
      );
      if (insertedResultNotification.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });

      const appVersion = userDetails[0].app_version;
const isUpdated = appVersion === app_versions.ios || appVersion === app_versions.android;

const resultApp = `<span style="color: ${isUpdated ? 'green' : 'red'};">
  ${appVersion} (${isUpdated ? 'Updated' : 'Not Updated'})
</span>`;
      const mailData = {
        to: "Client Services <clientservices@balancenutrition.in>",
        subject: `Program Feedback Report ${
          rate_mentor < 5 ? `(Rating ${rate_mentor})` : ""
        }`,
        body: `<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Balance Nutrition</title>
  </head>
  <body style="font-size: 12px;">
    <table width="100%">
      <tr>
        <td align="center" style="font-family: 'Arial'; color: #707070; font-size: 12px;">
          <table style="width:650px; border:1px solid #081d5f; padding-bottom: 30px; background-color: rgba(247, 245, 238, 0);" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background-color: #3FBDC9;">
                <a href="https://www.balancenutrition.in">
                  <img src="https://bncleanse.com/images/balance-nutrition-logo.png?cache=4" style="border:none; width:300px; padding: 10px 0 10px 20px;" />
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <table width="100%">
                  <tr>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 20px; border-color: #3FBDC9;">
                        <a href="tel:918928001617}" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/phone_icon.jpg?cache=4" style="width:14px" />
                          +91 89280 01617
                        </a>
                      </span>
                    </td>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 0; border-color: #3FBDC9;">
                        <a href="mailto:info@balancenutrition.in" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/email_icon.jpg?cache=4" />
                          info@balancenutrition.in
                        </a>
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table style="width:570px; border:0px solid #081d5f; background-color: #fff; padding: 10px; margin-top: 30px;" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      Hello Team,<br/><br/>
                      Program Feedback Recorded For Below Client:<br/><br/>
                      <strong>Name: </strong> ${userDetails[0].first_name}<br/>
                      <strong>Email: </strong> ${userDetails[0].email_id}<br/>
                      <strong>Mentor Name: </strong> ${
                        userDetails[0].mentor_name
                      }<br/>
                      <strong>App Device: </strong> ${
                        userDetails[0].device
                      }<br/>
                      <strong>App Version: </strong> ${
                        resultApp
                      }<br/>
                      <strong>Weight Loss: </strong> ${
                       Number(userDetails[0].wmr_end -
                        userDetails[0].wmr_start).toFixed(2)
                      } kg in ${
          userDetails[0].sent_sessions
        } sessions (<b>Curr. Wt: </b>${userDetails[0].wmr_end} kg)<br/>
                      <strong>Program Name: </strong> ${
                        userDetails[0].program_name
                      } (${userDetails[0].program_duration})<br/>
                      <strong>Program Number: </strong> ${
                        userDetails[0].program_number
                      }<br/>
                      <strong>Advance Purchase: </strong> ${
                        userDetails[0].advance_program_count
                      }<br/>
                      <h3>Form Report:-</h3>
                      <strong>The concept of online weight loss & health program: </strong> ${online_health_program}<br/>
                      <strong>E-kit and its relevance to the program: </strong> ${ekit_feedback}<br/>
                      <strong>Constant touch, follow up pace & motivation during your journey: </strong> ${follow_up}<br/>
                      <strong>Personal touch & mentor feedback: </strong> ${mentor_feedback}<br/>
                      <strong>Your Most Favourite Recipes/Items From The Diet Charts Sent To You?: </strong> ${decodeURIComponent(
                        favourite_recipe
                      )}<br/>
                      <strong>One Superfood/Supplement You Learned About Or Helped You The Most: </strong> ${decodeURIComponent(
                        superfood
                      )}<br/>
                      <strong>One Junk / Unhealthy Food Item You Never Gave Up!: </strong> ${decodeURIComponent(
                        unhealthy_food
                      )}<br/>
                      <strong>How Often Did You Use The Restaurant Guide?: </strong> ${restaurant_guide_usage}<br/>
                      <strong>How Often Did You Use The Quick Filler Guide?: </strong> ${quickFiller_guide_usage}<br/>
                      <strong>How Often Did You Use The Alcohol Guide?: </strong> ${alcohol_guide_usage}<br/>
                      <strong>Did You Follow The Recipes & Blogs?: </strong> ${recipe_and_blog_usage}<br/>
                      <strong>Most Used Section Of The BN APP: </strong> ${most_used_myaccount_section}<br/>
                      <strong>Would You Recommend BN?: </strong> ${
                        friend_recommendation ? "Yes, I have." : "Not yet."
                      }<br/>
                      <strong>Rate Your Mentor: </strong> ${rate_mentor}<br/>
                      <strong>Any Improvement Needed: </strong> ${decodeURIComponent(
                        improvement_needed
                      )}<br/>
                      ${
                        goals_achieved && goals_achieved !== "NA"
                          ? `<strong>Goals Achieved: </strong> ${decodeURIComponent(
                              goals_achieved
                            )}<br/>`
                          : ""
                      }
                      ${
                        new_goal && new_goal !== "NA"
                          ? `<strong>New Goal: </strong> ${decodeURIComponent(
                              new_goal
                            )}<br/>`
                          : ""
                      }
                      <br/>Thanks & Regards
                    </td>
                  </tr>
                </table>
              </td>
            </tr>                  
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      };
      const { final_feedback } = safeJSONParse(userDetails[0].active);
      mailData.cc = final_feedback.cc;
      mailData.bcc = final_feedback.bcc;
      // mailData.to = "ayush.dubey@balancenutrition.in";
      // mailData.cc = ["ayush.dubey@balancenutrition.in"];
      console.log("mailData", mailData);
      const mail = await sendMailUtil({
        from: "Support <support@balancenutrition.in>",
        to: mailData.to,
        cc: mailData.cc,
        bcc: mailData.bcc,
        html: mailData.body,
        subject: mailData.subject,
      });
      if (Number(rate_mentor) >= 4) {
        const addAutoDraftResponse = await addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hi ${userDetails[0].first_name},</p>
          <p>
            I received a copy of your program feedback as well. Both ma’am & I are happy to read all about your favourite recipes & also meals that you didn't stop!!
          </p>
          <p>
            I am also glad to know you will refer us to your friends & family. This is a very important parameter for us and it means there is something we are doing right :)
          </p>
          <p>
            <strong>POINTS TO IMPROVE: ${improvement_needed}</strong> If every diet can have a recipe link that will be great
          </p>
          <p><strong>P.S.</strong></p>
          <p>
            If you have a friend or a family member in mind, please <a href="https://www.balancenutrition.in/app_link/screen_id=4">click here</a> to refer them
          </p>
          <p>
            We would also be delighted to see your feedback on Google: <a href="https://www.google.com/search?q=balance+nutrition&rlz=1C1RXQR_enIN1016IN1016&oq=balance+nutrition&gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyEAgBEC4YrwEYxwEYgAQYjgUyBwgCEAAYgAQyBwgDEAAYgAQyBwgEEAAYgAQyBggFEEUYPDIGCAYQRRg9MgYIBxBFGDzSAQkxNDY0MGowajeoAgCwAgA&sourceid=chrome&ie=UTF-8#lrd=0x3be7c90af50710b1:0xa64c32ccd5f5c492,3,,,,">click here</a>
          </p>
        </div>
        `,
        });
      } else if (Number(rate_mentor) < 4 && Number(rate_mentor) >= 2) {
        const addAutoDraftResponse = await addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hi ${userDetails[0].first_name},</p>
          <p>
            Khyati ma'am & I have read your program feedback.
          </p>
          <p>
            A rating of ${rate_mentor} is not considered good at all for us mentors & I will be happy to get on a call with you to understand your concerns & help you better.
          </p>
          <p>
            You will be getting notified to schedule a feedback call with me soon.
          </p>
          <p>
            If you are ok, we can also have a senior head nutritionist / senior nutrition manager <strong>(ADD NAME MENTOR)</strong> join us for this con call.
          </p>
          <p>
            Please do let me know in case you need any help in scheduling your call. I shall ask our client services team to help you out.
          </p>
          <p>
            We also read your points on how we can improve, <strong>Improvement Needed:</strong> ${improvement_needed}<br />
            <em>(MENTOR PLEASE READ AND ADDRESS THIS WELL)</em>
          </p>
          <p>
            <strong>P.S.</strong> Your app may not be updated to the latest version. <a href="https://www.balancenutrition.in/download-bn-app">Please click here</a> & get the latest version to avoid crashes. Ignore if already updated.
          </p>
          <p>
            <strong>P.S.</strong> You have <strong>Rs.${userDetails[0].my_wallet}</strong> in your BN Wallet that expires on <strong>25th May</strong>! Please get in touch with me before that to use it.
          </p>
        </div>
        `,
        });
      }
      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Feedback submitted successfully",
        data: {
          wallet_added: 1000,
          show_button: {
            primary: {
              text: "Thank You",
              redirect_screen: "home_screen",
              screen_params: {},
            },
          },
        },
      });
      return res.status(201).json(apiresponse);
    } else {
      return next(new ErrorHandler("Error while submitting feedback", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitHalfTimeFeedback = async (req, res, next) => {
  const feedback = req.body;
  const {
    user_id,
    diet_feedback,
    tracker_feedback,
    mentor_chat_feedback,
    refer_bn_restaurant_guide,
    refer_bn_eat_in_portion,
    refer_bn_faq,
    refer_bn_daily_essentials,
    follow_social_media,
    mentor_star_rating,
    improvement_needed,
    milestone,
    source,
    poorfeedback,
    sub_order_id,
  } = feedback;
  try {
    const columns = [
      "user_id",
      "sub_order_id",
      "diet_feedback",
      "tracker_feedback",
      "mentor_chat_feedback",
      "refer_bn_restaurant_guide",
      "refer_bn_eat_in_portion",
      "refer_bn_faq",
      "refer_bn_daily_essentials",
      "follow_social_media",
      "mentor_star_rating",
      "improvement_needed",
      "milestone",
      "source",
    ];
    const values = [
      user_id,
      sub_order_id,
      diet_feedback,
      tracker_feedback,
      mentor_chat_feedback,
      refer_bn_restaurant_guide,
      refer_bn_eat_in_portion,
      refer_bn_faq,
      refer_bn_daily_essentials,
      follow_social_media,
      mentor_star_rating,
      improvement_needed,
      JSON.stringify(milestone),
      source,
    ];
    if (poorfeedback) {
      columns.push("poorfeedback");
      values.push(poorfeedback);
    }
    const insertResult = await insertRecord(
      tables.halfTimeFeedback,
      columns,
      values
    );
    await addAmountWallet({
      user_id,
      sub_order_id,
      amount: 500,
      reason: "Half Time Feedback",
    });
    if (insertResult.affectedRows === 1) {
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "ud.last_name",
          "ud.mentor_assigned",
          "ud.email_id",
          "ad.crm_user as mentor_name",
          "ud.device",
          "ud.app_version",
          "ud.latest_weight",
          "sop.sent_sessions as current_session",
          "sop.start_program_weight",
          "sop.end_program_weight",
          "pm.program_name" ,
          "ps.program_duration",
      `(SELECT weight FROM weight_records WHERE user_id = ud.user_id and  sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
       `(SELECT weight FROM weight_records WHERE user_id = ud.user_id  and sub_order_id=sop.sub_order_id  ORDER BY wmr_id ASC limit 1) as wmr_start`,
          "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
          "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1','3') THEN 1 ELSE 0 END ) AS program_number",
          "ad.active",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id = sop.program_session_id",
          },
          {
            type: "LEFT",
            table: `(
              SELECT 
                od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
              FROM 
                order_details od2
              LEFT JOIN 
                sub_orders_programs sop2 ON sop2.order_id = od2.order_id
              WHERE 
                sop2.program_type = 0
            ) sop_count`,
            on: "ud.user_id = sop_count.user_id",
          },
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: Number(user_id),
          },
        ],
      });
      console.log(userDetails[0], 1507);
      const data = {
        title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Submitted Half time Feedback`,
        priority: 1,
        redirect: "/feedback",
      };
      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, userDetails[0].mentor_assigned, data.title, "/feedback"]
      );
      if (insertedResultNotification.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
      const appVersion = userDetails[0].app_version;
const isUpdated = appVersion === app_versions.ios || appVersion === app_versions.android;

const resultApp = `<span style="color: ${isUpdated ? 'green' : 'red'};">
  ${appVersion} (${isUpdated ? 'Updated' : 'Not Updated'})
</span>`;
      const mailData = {
        to: "Client Services <clientservices@balancenutrition.in>",
        subject: `Halftime Feedback Report ${
          mentor_star_rating < 5 ? `(Rating ${mentor_star_rating})` : ""
        }`,
        body: `<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Balance Nutrition</title>
  </head>
  <body style="font-size: 12px;">
    <table width="100%">
      <tr>
        <td align="center" style="font-family: 'Arial'; color: #707070; font-size: 12px;">
          <table style="width:650px; border:1px solid #081d5f; padding-bottom: 30px; background-color: rgba(247, 245, 238, 0);" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background-color: #3FBDC9;">
                <a href="https://www.balancenutrition.in">
                  <img src="https://bncleanse.com/images/balance-nutrition-logo.png?cache=4" style="border:none; width:300px; padding: 10px 0 10px 20px;" />
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <table width="100%">
                  <tr>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 20px; border-color: #3FBDC9;">
                        <a href="tel:918928001617}" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/phone_icon.jpg?cache=4" style="width:14px" />
                          +91 89280 01617
                        </a>
                      </span>
                    </td>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 0; border-color: #3FBDC9;">
                        <a href="mailto:info@balancenutrition.in" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/email_icon.jpg?cache=4" />
                          info@balancenutrition.in
                        </a>
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table style="width:570px; border:0px solid #081d5f; background-color: #fff; padding: 10px; margin-top: 30px;" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      Hello Team,<br/><br/>
                      Halftime Feedback Recorded For Below Client:<br/><br/>
                      <strong>Name: </strong> ${userDetails[0].first_name}<br/>
                      <strong>Email: </strong> ${userDetails[0].email_id}<br/>
                      <strong>Mentor Name: </strong> ${
                        userDetails[0].mentor_name
                      }<br/>
                      <strong>App Device: </strong> ${
                        userDetails[0].device
                      }<br/>
                      <strong>App Version: </strong> ${
                        resultApp
                      }<br/>
                      <strong>Weight Loss: </strong> ${
                        Number(userDetails[0].wmr_end -
                        userDetails[0].wmr_start).toFixed(2)
                      } kg in ${
          userDetails[0].current_session
        } sessions (<b>Curr. Wt: </b>${userDetails[0].wmr_end} kg)<br/>
                      <strong>Program Name: </strong> ${
                        userDetails[0].program_name
                      } (${userDetails[0].program_duration})<br/>
                      <strong>Program Number: </strong> ${
                        userDetails[0].program_number
                      }<br/>
                      <strong>Advance Purchase: </strong> ${
                        userDetails[0].advance_program_count
                      }<br/>
                      <h3>Form Report:-</h3>
                      <strong>Diets [quality / simplicity / effectiveness]: </strong> ${diet_feedback}<br/>
                      <strong>Trackers [ease / convenience]: </strong> ${tracker_feedback}<br/>
                      <strong>Mentor chat section [ease / convenience]: </strong> ${mentor_chat_feedback}<br/>
                      <strong>Have you started referring to the BN Restaurant Guide?: </strong> ${refer_bn_restaurant_guide}<br/>
                      <strong>Have you started referring the BN Eat-In Portions?: </strong> ${refer_bn_eat_in_portion}<br/>
                      <strong>Have you started referring the BN FAQ's (Frequently Asked Questions)?: </strong> ${refer_bn_faq}<br/>
                      <strong>Have you started referring the BN Daily Essentials?: </strong> ${refer_bn_daily_essentials}<br/>
                      <strong>Do You Follow Us On A Social Media: </strong> ${follow_social_media}<br/>
                      <strong>Rate Your Mentor: </strong> ${mentor_star_rating}<br/>
                      <strong>Any Improvement Needed: </strong> ${decodeURIComponent(
                        improvement_needed
                      )}<br/>
                      ${
                        milestone && milestone !== "NA"
                          ? `<strong>Milestones Achieved: </strong> ${decodeURIComponent(
                              milestone
                            )}<br/>`
                          : ""
                      }
                      <br/>Thanks & Regards
                    </td>
                  </tr>
                </table>
              </td>
            </tr>                  
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      };
      const { ht_feedback } = safeJSONParse(userDetails[0].active);
      console.log(ht_feedback, 1638);
      mailData.cc = ht_feedback.cc;
      mailData.bcc = ht_feedback.bcc;
      // mailData.cc = ["ayush.dubey@balancenutrition.in"];
      // mailData.to = "ayush.dubey@balancenutrition.in";
      console.log(mailData, 1640);
      const mail = await sendMailUtil({
        from: "Support <support@balancenutrition.in>",
        to: mailData.to,
        cc: mailData.cc,
        bcc: mailData.bcc,
        html: mailData.body,
        subject: mailData.subject,
      });
      console.log(mail, 1646);
      if (Number(mentor_star_rating) >= 4) {
        // mentor rating 4 and above
        const addAutoDraftResponse = await addAutoDraftedQuery({
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hello ${userDetails[0].first_name},</p>
          <p>
            Khyati ma'am & I have read your mid-program feedback.
          </p>
          <p>
            I am glad to know that you are using the E kit well. However, you must also ensure you are using the FAQs, Eat-in-Portion Guide as well.
            These are going to help us in the next half of the program & even after your program.
          </p>
          <p>
            I am happy to read your milestones too. Here they are: <strong>${milestone.join(
              ","
            )}</strong>.<br />
            <em>(Mentor Acknowledge Them Well in this Message.)</em>
          </p>
          <p>
            I have also read your points for us to improve. Here we go: <strong>${improvement_needed}</strong>.<br />
            <em>(MENTOR, PLEASE READ THESE & REPLY WELL in the draft. whether it is diet, or app related n cs will help etc.)</em>
          </p>
          <p>
            You will also get notified to take your mid-program health score & book your mid-program feedback call as well with me. Stay tuned & don't miss out on those.
          </p>
          <p>
            You are doing good. Keep up the spirit.
          </p>
          <p>
            <strong>P.S.</strong> Your app may not be updated to the latest version. Please <a href="https://www.balancenutrition.in/app_link/screen_id=4">click here</a> & get the latest version to avoid crashes. Ignore if already updated.
          </p>
          <p>Good luck :)</p>
        </div>
        `,
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
        });
        console.log(addAutoDraftResponse, 1335);
      } else if (
        Number(mentor_star_rating) < 4 &&
        Number(mentor_star_rating) >= 2
      ) {
        // mentor rating 2 or 3
        const addAutoDraftResponse = await addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hello ${userDetails[0].first_name},</p>
          <p>
            Khyati ma'am & I have read your mid-program feedback.
          </p>
          <p>
            A rating of 3 is not considered good at all for us mentors & I will be happy to get on a call with you to understand your concerns & help you better. You will be getting notified to schedule a progress call with me soon. If you are ok, we can also have a senior head nutritionist/ senior nutrition manager <strong>(ADD NAME MENTOR)</strong> to join us for this con call.
          </p>
          <p>
            Let me know if <strong>11.11 am IST tomorrow</strong> works for you.<br />
            <em>(30 DAYS WILL NOT BE ABLE TO SCHEDULE CALL - SO BOOK MANUALLY MENTOR)</em>
          </p>
          <p>
            I am also glad to know that you are using the E kit well. However, you must also ensure you are using the FAQs, Eat-in-Portion Guide as well. These are going to help us in the next half of the program & even after your program.
          </p>
          <p>
            I am happy to read your milestones too. Here they are: <strong>${milestone.join(
              ","
            )}</strong>.<br />
            <em>mentor acknowledge them well in this message.</em>
          </p>
          <p>
            I have also read your points for us to improve. Here we go: <strong>${improvement_needed}</strong>.<br />
            <em>MENTOR, PLEASE READ THESE & REPLY WELL in the draft. whether it is diet, or app related n cs will help etc</em>
          </p>
          <p>
            You are doing good. Keep up the spirit.
          </p>
          <p>
            <strong>P.S.</strong> Your app may not be updated to the latest version. Please <a href="https://www.balancenutrition.in/app_link/screen_id=4">click here</a> & get the latest version to avoid crashes. Ignore if already updated.
          </p>
        </div>
        `,
        });
        console.log(addAutoDraftResponse, 1386);
      }
      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Feedback submitted successfully",
        data: { wallet_added: 500 },
      });
      return res.status(201).json(apiresponse);
    } else {
      return next(new ErrorHandler("Error while submitting feedback", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitNewHalfTimeFeedback = async (req, res, next) => {
  const feedback = req.body;
  const {
    user_id,
    diet_feedback,
    tracker_feedback,
    mentor_chat_feedback,
    restaurant_guide_feedback,
    alcohol_guide_feedback,
    quickFiller_feedback,
    refer_bn_eat_in_portion,
    refer_bn_faq,
    refer_bn_daily_essentials,
    follow_social_media,
    mentor_star_rating,
    improvement_needed,
    milestone,
    source,
    poorfeedback,
    sub_order_id,
  } = feedback;
  try {
    const columns = [
      "user_id",
      "sub_order_id",
      "diet_feedback",
      "tracker_feedback",
      "mentor_chat_feedback",
      "restaurant_guide_feedback",
      "alcohol_guide_feedback",
      "quickFiller_feedback",
      "refer_bn_eat_in_portion",
      "refer_bn_faq",
      "refer_bn_daily_essentials",
      "follow_social_media",
      "mentor_star_rating",
      "improvement_needed",
      "milestone",
      "source",
    ];
    const values = [
      user_id,
      sub_order_id,
      diet_feedback,
      tracker_feedback,
      mentor_chat_feedback,
      restaurant_guide_feedback,
      alcohol_guide_feedback,
      quickFiller_feedback,
      refer_bn_eat_in_portion,
      refer_bn_faq,
      refer_bn_daily_essentials,
      follow_social_media,
      mentor_star_rating,
      improvement_needed,
      JSON.stringify(milestone),
      source,
    ];
    if (poorfeedback) {
      columns.push("poorfeedback");
      values.push(poorfeedback);
    }
    const insertResult = await insertRecord(
      tables.halfTimeFeedback,
      columns,
      values
    );
    await addAmountWallet({
      user_id,
      sub_order_id,
      amount: 500,
      reason: "Half Time Feedback",
    });
    if (insertResult.affectedRows === 1) {
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "ud.last_name",
          "ud.mentor_assigned",
          "ud.email_id",
          "ad.crm_user as mentor_name",
          "ud.device",
          "ud.app_version",
          "ud.latest_weight",
          "sop.sent_sessions as current_session",
          "sop.start_program_weight",
          "sop.end_program_weight",
          "pm.program_name" ,
          "ps.program_duration",
      `(SELECT weight FROM weight_records WHERE user_id = ud.user_id and  sub_order_id=sop.sub_order_id  ORDER BY wmr_id DESC limit 1) as wmr_end`,
       `(SELECT weight FROM weight_records WHERE user_id = ud.user_id  and sub_order_id=sop.sub_order_id  ORDER BY wmr_id ASC limit 1) as wmr_start`,
          "SUM(CASE WHEN sop_count.program_status = '4' THEN 1 ELSE 0 END) as advance_program_count",
          "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1','3') THEN 1 ELSE 0 END ) AS program_number",
          "ad.active",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.mentor_assigned",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = sop.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id = sop.program_session_id",
          },
          {
            type: "LEFT",
            table: `(
              SELECT 
                od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
              FROM 
                order_details od2
              LEFT JOIN 
                sub_orders_programs sop2 ON sop2.order_id = od2.order_id
              WHERE 
                sop2.program_type = 0
            ) sop_count`,
            on: "ud.user_id = sop_count.user_id",
          },
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: Number(user_id),
          },
        ],
      });
      console.log(userDetails[0], 1507);
      const data = {
        title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Submitted Half time Feedback`,
        priority: 1,
        redirect: "/feedback",
      };
      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, userDetails[0].mentor_assigned, data.title, "/feedback"]
      );
      if (insertedResultNotification.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
      const appVersion = userDetails[0].app_version;
const isUpdated = appVersion === app_versions.ios || appVersion === app_versions.android;

const resultApp = `<span style="color: ${isUpdated ? 'green' : 'red'};">
  ${appVersion} (${isUpdated ? 'Updated' : 'Not Updated'})
</span>`;
      const mailData = {
        to: "Client Services <clientservices@balancenutrition.in>",
        subject: `Halftime Feedback Report ${
          mentor_star_rating < 5 ? `(Rating ${mentor_star_rating})` : ""
        }`,
        body: `<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Balance Nutrition</title>
  </head>
  <body style="font-size: 12px;">
    <table width="100%">
      <tr>
        <td align="center" style="font-family: 'Arial'; color: #707070; font-size: 12px;">
          <table style="width:650px; border:1px solid #081d5f; padding-bottom: 30px; background-color: rgba(247, 245, 238, 0);" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background-color: #3FBDC9;">
                <a href="https://www.balancenutrition.in">
                  <img src="https://bncleanse.com/images/balance-nutrition-logo.png?cache=4" style="border:none; width:300px; padding: 10px 0 10px 20px;" />
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <table width="100%">
                  <tr>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 20px; border-color: #3FBDC9;">
                        <a href="tel:918928001617}" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/phone_icon.jpg?cache=4" style="width:14px" />
                          +91 89280 01617
                        </a>
                      </span>
                    </td>
                    <td align="center">
                      <span style="display: inline-block; font-weight: 700; padding: 10px 50px 10px 0; border-color: #3FBDC9;">
                        <a href="mailto:info@balancenutrition.in" style="text-decoration: none;">
                          <img src="https://bncleanse.com/images/emails/email_icon.jpg?cache=4" />
                          info@balancenutrition.in
                        </a>
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table style="width:570px; border:0px solid #081d5f; background-color: #fff; padding: 10px; margin-top: 30px;" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      Hello Team,<br/><br/>
                      Halftime Feedback Recorded For Below Client:<br/><br/>
                      <strong>Name: </strong> ${userDetails[0].first_name}<br/>
                      <strong>Email: </strong> ${userDetails[0].email_id}<br/>
                      <strong>Mentor Name: </strong> ${
                        userDetails[0].mentor_name
                      }<br/>
                      <strong>App Device: </strong> ${
                        userDetails[0].device
                      }<br/>
                      <strong>App Version: </strong> ${
                        resultApp
                      }<br/>
                      <strong>Weight Loss: </strong> ${
                        Number(userDetails[0].wmr_end -
                        userDetails[0].wmr_start).toFixed(2)
                      } kg in ${
          userDetails[0].current_session
        } sessions (<b>Curr. Wt: </b>${userDetails[0].wmr_end} kg)<br/>
                      <strong>Program Name: </strong> ${
                        userDetails[0].program_name
                      } (${userDetails[0].program_duration})<br/>
                      <strong>Program Number: </strong> ${
                        userDetails[0].program_number
                      }<br/>
                      <strong>Advance Purchase: </strong> ${
                        userDetails[0].advance_program_count
                      }<br/>
                      <h3>Form Report:-</h3>
                      <strong>Diets [quality / simplicity / effectiveness]: </strong> ${diet_feedback}<br/>
                      <strong>Trackers [ease / convenience]: </strong> ${tracker_feedback}<br/>
                      <strong>Mentor chat section [ease / convenience]: </strong> ${mentor_chat_feedback}<br/>
                      <strong>How Impactful is The BN Restaurant Guide?: </strong> ${restaurant_guide_feedback}<br/>
                      <strong>>How Impactful is The BN Alcohol Guide?: </strong> ${alcohol_guide_feedback}<br/>
                      <strong>How useful is The BN Quick Filler Guide?: </strong> ${quickFiller_feedback}<br/>
                      <strong>Have you started referring the BN Eat-In Portions?: </strong> ${refer_bn_eat_in_portion}<br/>
                      <strong>Have you started referring the BN FAQ's (Frequently Asked Questions)?: </strong> ${refer_bn_faq}<br/>
                      <strong>Have you started referring the BN Daily Essentials?: </strong> ${refer_bn_daily_essentials}<br/>
                      <strong>Do You Follow Us On A Social Media: </strong> ${follow_social_media}<br/>
                      <strong>Rate Your Mentor: </strong> ${mentor_star_rating}<br/>
                      <strong>Any Improvement Needed: </strong> ${decodeURIComponent(
                        improvement_needed
                      )}<br/>
                      ${
                        milestone && milestone !== "NA"
                          ? `<strong>Milestones Achieved: </strong> ${decodeURIComponent(
                              milestone
                            )}<br/>`
                          : ""
                      }
                      <br/>Thanks & Regards
                    </td>
                  </tr>
                </table>
              </td>
            </tr>                  
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      };
      const { ht_feedback } = safeJSONParse(userDetails[0].active);
      console.log(ht_feedback, 1638);
      mailData.cc = ht_feedback.cc;
      mailData.bcc = ht_feedback.bcc;
      // mailData.cc = ["ayush.dubey@balancenutrition.in"];
      // mailData.to = "ayush.dubey@balancenutrition.in";
      console.log(mailData, 1640);
      const mail = await sendMailUtil({
        from: "Support <support@balancenutrition.in>",
        to: mailData.to,
        cc: mailData.cc,
        bcc: mailData.bcc,
        html: mailData.body,
        subject: mailData.subject,
      });
      console.log(mail, 1646);
      if (Number(mentor_star_rating) >= 4) {
        // mentor rating 4 and above
        const addAutoDraftResponse = await addAutoDraftedQuery({
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hello ${userDetails[0].first_name},</p>
          <p>
            Khyati ma'am & I have read your mid-program feedback.
          </p>
          <p>
            I am glad to know that you are using the E kit well. However, you must also ensure you are using the FAQs, Eat-in-Portion Guide as well.
            These are going to help us in the next half of the program & even after your program.
          </p>
          <p>
            I am happy to read your milestones too. Here they are: <strong>${milestone.join(
              ","
            )}</strong>.<br />
            <em>(Mentor Acknowledge Them Well in this Message.)</em>
          </p>
          <p>
            I have also read your points for us to improve. Here we go: <strong>${improvement_needed}</strong>.<br />
            <em>(MENTOR, PLEASE READ THESE & REPLY WELL in the draft. whether it is diet, or app related n cs will help etc.)</em>
          </p>
          <p>
            You will also get notified to take your mid-program health score & book your mid-program feedback call as well with me. Stay tuned & don't miss out on those.
          </p>
          <p>
            You are doing good. Keep up the spirit.
          </p>
          <p>
            <strong>P.S.</strong> Your app may not be updated to the latest version. Please <a href="https://www.balancenutrition.in/app_link/screen_id=4">click here</a> & get the latest version to avoid crashes. Ignore if already updated.
          </p>
          <p>Good luck :)</p>
        </div>
        `,
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
        });
        console.log(addAutoDraftResponse, 1335);
      } else if (
        Number(mentor_star_rating) < 4 &&
        Number(mentor_star_rating) >= 2
      ) {
        // mentor rating 2 or 3
        const addAutoDraftResponse = await addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>Hello ${userDetails[0].first_name},</p>
          <p>
            Khyati ma'am & I have read your mid-program feedback.
          </p>
          <p>
            A rating of 3 is not considered good at all for us mentors & I will be happy to get on a call with you to understand your concerns & help you better. You will be getting notified to schedule a progress call with me soon. If you are ok, we can also have a senior head nutritionist/ senior nutrition manager <strong>(ADD NAME MENTOR)</strong> to join us for this con call.
          </p>
          <p>
            Let me know if <strong>11.11 am IST tomorrow</strong> works for you.<br />
            <em>(30 DAYS WILL NOT BE ABLE TO SCHEDULE CALL - SO BOOK MANUALLY MENTOR)</em>
          </p>
          <p>
            I am also glad to know that you are using the E kit well. However, you must also ensure you are using the FAQs, Eat-in-Portion Guide as well. These are going to help us in the next half of the program & even after your program.
          </p>
          <p>
            I am happy to read your milestones too. Here they are: <strong>${milestone.join(
              ","
            )}</strong>.<br />
            <em>mentor acknowledge them well in this message.</em>
          </p>
          <p>
            I have also read your points for us to improve. Here we go: <strong>${improvement_needed}</strong>.<br />
            <em>MENTOR, PLEASE READ THESE & REPLY WELL in the draft. whether it is diet, or app related n cs will help etc</em>
          </p>
          <p>
            You are doing good. Keep up the spirit.
          </p>
          <p>
            <strong>P.S.</strong> Your app may not be updated to the latest version. Please <a href="https://www.balancenutrition.in/app_link/screen_id=4">click here</a> & get the latest version to avoid crashes. Ignore if already updated.
          </p>
        </div>
        `,
        });
        console.log(addAutoDraftResponse, 1386);
      }
      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Feedback submitted successfully",
        data: { wallet_added: 500 },
      });
      return res.status(201).json(apiresponse);
    } else {
      return next(new ErrorHandler("Error while submitting feedback", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitLeadFeedback = async (req, res, next) => {
  const { user_id, feedback } = req.body;
  if (!user_id || !feedback) {
    return next(new ErrorHandler("Invalid Request", 400));
  }
  try {
      // Wrap the plain text in a JSON object
      const jsonFeedback = {
        "feedback": feedback
      };
    const insertResult = await insertRecord(
      tables.leadFeedback,
      ["user_id", "feedback"],
      [user_id, JSON.stringify(jsonFeedback)]
    );
    console.log(insertResult, 886);
    if (insertResult.affectedRows === 1) {
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.first_name",
          "ud.last_name",
          "ud.counsellor_assigned",
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: Number(user_id),
          },
        ],
      });
      if (userDetails[0].counsellor_assigned != null) {
        const data = {
          title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Submitted Lead Feedback`,
          priority: 1,
          redirect: "/feedback",
        };
        const insertedResultNotification = await insertRecord(
          tables.mentorNotifications,
          ["user_id", "admin_id", "content", "redirect"],
          [user_id, userDetails[0].counsellor_assigned, data.title, "/feedback"]
        );
        if (insertedResultNotification.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While Inserting Mentor Notifications", 400)
          );
        }
        sendSSEEvent({ mentor_id: userDetails[0].counsellor_assigned, data });
      }
      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Feedback submitted successfully",
        data: insertResult.insertId,
      });
      return res.status(201).json(apiresponse);
    } else {
      return next(new ErrorHandler("Error while submitting feedback", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadFeedback = async (req, res, next) => {
  const { user_id } = req.query;
  if (!user_id) {
    return next(new ErrorHandler("Invalid Request", 400));
  }
  try {
    const { results } = await readRecord({
      selectFields: ["*", "DATE_FORMAT(added_date,'%D %b %Y') as added_date"],
      table: tables.leadFeedback,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("No Feedback Found", 404));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Feedback fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  getFeedbackbyMentorId,
  fetchHalfTimeFeedbackAndUploadtoNewFeedbackTable,
  fetchProgramFeedbackAndUploadtoNewFeedbackTable,
  getFeedbackCounts,
  getFeedbackDetails,
  submitFinalFeedback,
  submitHalfTimeFeedback,
  submitLeadFeedback,
  getLeadFeedback,
  submitNewHalfTimeFeedback,
  submitNewFinalFeedback
};
