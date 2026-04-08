import moment from "moment";
import { readRecord, updateRecord } from "../config/query.js";
import { safeJSONParse } from "../helper/commonHelper.js";
import {
  app_versions,
  genderCodeMapping,
  generalConstants,
  image_guide_base_url,
  tables,
} from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { CurrentScreenResponse } from "../utils/currentScreenResponse.js";
import { addAmountWallet } from "../helper/common.js";

export const getSplashScreenData = async (req, res) => {
  const user_id = req.params.user_id;

  try {
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({
        status: false,
        message: "Valid UserId is required",
      });
    }

    const selectColumns = [
      "ud.user_id",
      "ud.first_name",
      "ud.last_name",
      "ud.birth_date",
      "ud.latest_weight",
      "ud.email_id",
      "ud.phone_code",
      "ud.phone_number",
      "ud.mentor_assigned",
      "ud.counsellor_assigned",
      "ud.active_order_id",
      "ud.user_type",
      "ud.user_status",
      "ud.sub_user_status",
      "ud.current_screen",
      "ud.gender",
      "ud.last_screen_visited",
      "ud.new_app_login",
      "sop.sent_sessions",
      "sop.total_sessions",
      "sop.pending_session",
      "sop.sub_order_id",
      "dsl.diet_id",
      "dsl.diet_start_date",
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "dsl.end_session_inch",
      `(SELECT height FROM assessment_personal_details WHERE user_id = ${user_id} ORDER BY personal_details_id DESC LIMIT 1) as assessment_height`,
      `(SELECT ir.days FROM ${tables.inchRecords} ir WHERE ir.sub_order_id = sop.sub_order_id AND ir.session IN (0, sop.sent_sessions) ORDER BY ir.posted_date DESC LIMIT 1) as inch_day`,
      "dsl.session as diet_session",
      "pm.program_name",
      "ps.validity as program_duration",
      "ps.extra_validity",
      "ps.per_session_days",
      "ass.assessment_id",
      `(SELECT hs.id FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id AND hs.created >= DATE_SUB(NOW(), INTERVAL 15 DAY) ORDER BY hs.created DESC LIMIT 1) as is_hs_taken`,
      "ad.first_name as mentor_first_name",
      "ad.email_id as mentor_email_id",
      "ad.ethnicity as mentor_ethnicity",
      "ad.photo as mentor_photo",
      "ad.expertise as mentor_expertise",
      "ad.total_clients as mentor_total_clients",
      "ad.total_experience as mentor_total_experience",
      "ad.education as mentor_education",
      "ad.designation as mentor_designation",
      "ad.official_phone as mentor_official_phone",
      "cu.user_id as call_user_id",
      "ud.sdk",
      "ad2.first_name as counsellor_first_name",
      "ad2.email_id as counsellor_email_id",
      "ad2.ethnicity as counsellor_ethnicity",
      "ad2.photo as counsellor_photo",
      "ad2.expertise as counsellor_expertise",
      "ad2.total_clients as counsellor_total_clients",
      "ad2.total_experience as counsellor_total_experience",
      "ad2.education as counsellor_education",
      "ad2.designation as counsellor_designation",
      "ad2.official_phone as counsellor_whatsapp",
      `(SELECT hs.weight FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id ORDER BY hs.created DESC LIMIT 1) as hs_weight`,
      `(SELECT hs.height FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id ORDER BY hs.created DESC LIMIT 1) as hs_height`,
      `(SELECT hs.age FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id ORDER BY hs.created DESC LIMIT 1) as hs_age`,
    ];

    const whereCondition = [
      { field: "ud.user_id", operator: "=", value: user_id },
      // { field: "dsl2.diet_id", operator: "IS", value: "NULL", raw: true },
      // { field: "dsl.diet_status", operator: "=", value: 4 },
    ];

    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: selectColumns,
      conditions: whereCondition,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND ud.user_id = dsl.user_id and dsl.diet_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl2`,
          on: "dsl2.sub_order_id = dsl.sub_order_id AND dsl.diet_id > dsl2.diet_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.call_type = '30'",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad2`,
          on: "ud.counsellor_assigned = ad2.admin_user_id",
        },
      ],
      groupBy: ["ud.user_id"],
    });
    if (!userDetails || userDetails.length === 0) {
      return res.status(200).json({
        status: false,
        message: "User Not Found",
      });
    }
    // if (Number(userDetails[0].new_app_login) === 0) {
    //   return res.status(200).json({
    //     status: false,
    //     message: "User Not Found",
    //   });
    // }
    const user = userDetails[0];
    const userBirthDate = user.birth_date; 
    const userAge =  moment(userBirthDate) ? moment().diff(userBirthDate, "years") : null;
    if (!user?.sdk) {
      if (user.sdk != req.headers?.sdk) {
        await updateRecord(
          `${tables.userDetails}`,
          {
            sdk: req.headers?.sdk,
            os: req.headers?.os,
            model: req.headers?.model,
            device: req.headers?.device,
            app_version: req.headers?.app_version,
          },
          { user_id: parseInt(user_id) },
        );
      } else {
        await updateRecord(
          `${tables.userDetails}`,
          {
            device: req.headers?.device,
            app_version: req.headers?.app_version,
          },
          { user_id: parseInt(user_id) },
        );
      }
    }
    if (
      user?.sent_sessions >= 1 &&
      user?.last_screen_visited != "my_profile" &&
      user?.user_status == "Active"
    ) {
      await updateRecord(
        `${tables.userDetails}`,
        {
          last_screen_visited: "my_profile",
        },
        { user_id: parseInt(user_id) },
      );
    }
    console.log(user, 131);

    const { results: dietSessionList } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_id",
        "dsl.session",
        "dsl.diet_start_date",
        "dsl.end_session_weight",
        "dsl.start_session_weight",
        "dsl.mid_session_weight",
        "dsl.end_session_inch",
      ],
      conditions: [
        {
          field: "dsl.sub_order_id",
          operator: "=",
          value: user.active_order_id,
        },
        { field: "dsl.diet_status", operator: "=", value: "4" },
      ],
      orderBy: ["dsl.diet_id DESC"],
    });

    const dietStartMoment =
      dietSessionList.length > 0 && dietSessionList[0].diet_start_date
        ? moment(dietSessionList[0].diet_start_date)
        : null;

    const parseDuration = (str) => {
      const value = String(str || "0").trim();
      const match = value.match(/^(\d+)\s*(Days|Day)?$/i);
      return match ? Number(match[1]) || 0 : Number(value) || 0;
    };
    const program_duration = parseDuration(user.program_duration);
    const extra_validity = parseDuration(user.extra_validity);
    let mentorDetails;
    if (
      user.mentor_assigned === null ||
      user.mentor_assigned === 0 ||
      user.mentor_assigned === "0" ||
      user.mentor_assigned === ""
    ) {
      mentorDetails = {
        assigned_mentor_id: user.counsellor_assigned || null,
        assigned_mentor: user.counsellor_first_name || "",
        mentor_education: user.counsellor_education
          ? String(user.counsellor_education).split("<br>")
          : [],
        mentor_expertise: user.counsellor_expertise || "",
        mentor_designation: user.counsellor_designation || "",
        mentor_total_clients: Number(user.counsellor_total_clients) || 0,
        mentor_total_experience: user.counsellor_total_experience
          ? moment().diff(moment(user.counsellor_total_experience), "years") ||
            0
          : 0,
        mentor_photo: user.counsellor_photo
          ? JSON.parse(user.counsellor_photo)[0]?.file?.path || ""
          : "",
        official_phone: user.counsellor_official_phone || null,
      };
    } else {
      mentorDetails = {
        assigned_mentor_id: user.mentor_assigned || null,
        assigned_mentor: user.mentor_first_name || "",
        mentor_education: user.mentor_education
          ? String(user.mentor_education).split("<br>")
          : [],
        mentor_expertise: user.mentor_expertise || "",
        mentor_designation: user.mentor_designation || "",
        mentor_total_clients: Number(user.mentor_total_clients) || 0,
        mentor_total_experience: user.mentor_total_experience
          ? moment().diff(moment(user.mentor_total_experience), "years") || 0
          : 0,
        mentor_photo: user.mentor_photo
          ? JSON.parse(user.mentor_photo)[0]?.file?.path || ""
          : "",
        official_phone: user.mentor_official_phone || null,
      };
    }

    const show_goal =
      (user.total_sessions === 3 && user.pending_session === 1) ||
      ([6, 9, 12].includes(user.total_sessions) &&
        Number(user.pending_session) <= 3);
    console.log(show_goal, 166);
    const isCleanseProgram =
      Number(user.total_sessions) === 1 &&
      [1, 3, 10, 14].includes(program_duration);
    const cleanseEndDay = isCleanseProgram
      ? program_duration === 1
        ? 2
        : 4
      : 10;

    const weight_day = (() => {
      if (isCleanseProgram) {
        if (dietStartMoment && dietStartMoment.isValid()) {
          const daysSinceStart = moment().diff(dietStartMoment, "days");
          if (
            Number(dietSessionList[0].start_session_weight) !== 0 &&
            Number(dietSessionList[0].end_session_weight) === 0 &&
            daysSinceStart >= cleanseEndDay
          ) {
            return cleanseEndDay;
          }
        }
        return Number(dietSessionList[0]?.start_session_weight) === 0
          ? 0
          : cleanseEndDay;
      }

      if (dietStartMoment && dietStartMoment.isValid()) {
        const daysSinceStart = moment().diff(dietStartMoment, "days");
        if (
          dietSessionList.length > 0 &&
          Number(dietSessionList[0].mid_session_weight) === 0 &&
          daysSinceStart >= 5 &&
          daysSinceStart <= 7
        ) {
          return 5;
        }
        if (
          Number(dietSessionList[0].end_session_weight) === 0 &&
          daysSinceStart >= 10
        ) {
          return 10;
        }
        return 0;
      }

      if (
        Number(user.sent_sessions) === 1 &&
        Number(dietSessionList[0].start_session_weight) === 0
      ) {
        return 0;
      }

      return 0;
    })();

    const inch_day = (() => {
      if (Number(user.sent_sessions) === 1 && user.inch_day == null) {
        return 0;
      }

      if (isCleanseProgram && dietStartMoment && dietStartMoment.isValid()) {
        const daysSinceStart = moment().diff(dietStartMoment, "days");
        const hasStartInch = user.inch_day === 0;
        const hasEndInch = Number(dietSessionList[0].end_session_inch) !== 0;

        if (hasStartInch && !hasEndInch && daysSinceStart >= cleanseEndDay) {
          return cleanseEndDay;
        }
        return 0;
      }

      if (dietStartMoment && dietStartMoment.isValid()) {
        const daysSinceStart = moment().diff(dietStartMoment, "days");
        const hasEndInch = Number(dietSessionList[0].end_session_inch) !== 0;
        if (!hasEndInch && daysSinceStart >= 10) {
          return 10;
        }
      }

      return 0;
    })();
    
    const { results: weightScaleOrderData } = await readRecord({
      table: `${tables.productOrders}`,
      selectFields: ["status"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "brand", operator: "=", value: 'doctorstore' },
        { field: "status", operator: "=", value: 'Delivered'}

      ],
      orderBy: ["order_id DESC"],
    });
    let latestWeight = null;
    let latestHeight = null;
    let latestAge = null;
    if(user.user_type == 0){
      
      latestWeight = user.hs_weight;
       latestHeight = user.hs_height;
       latestAge = user.hs_age;
    }else{

      latestWeight = user.latest_weight;
      latestHeight = user.assessment_height;
      latestAge = user.userAge;
    }


  
    const responseData = {
      user_details: {
        user_id: user.user_id || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email_id: user.email_id || "",
        gender: genderCodeMapping[Number(user?.gender)], 
        phone_code: user.phone_code || "",
        phone_number: user.phone_number || "",
        sub_order_id: user.active_order_id || null,
        birth_date: user.birth_date || null,
        last_weight: latestWeight,
        height: latestHeight,
        age: latestAge,
      },
      products_purchased:{
        smart_scale:weightScaleOrderData.length > 0 ? true : false
      },
      active_order_id: user.active_order_id || null,
      assessment_id: user.assessment_id || "",
      mentor_details: mentorDetails,
      program_details: {
        program_name: user.program_name
          ? String(user.program_name)
              .replace(/client\s+exclusive\s+advanced/i, "")
              .replace(/\([^()]*\)/g, "")
              .trim()
          : "",
        program_duration,
        total_sessions: Number(user.total_sessions) || 0,
        sent_sessions: Number(user.sent_sessions) || 0,
        program_validity: extra_validity,
        total_validity: program_duration + extra_validity,
        session_days: Number(user.per_session_days) || 0,
      },
      cleanse_data: {
        is_cleanse: isCleanseProgram,
        is_hs_taken: !!user.is_hs_taken,
      },
      refer_data: {
        title:
          "On Referring, we will be adding **₹ 100** to your\nBN Wallet & once they join a program, we shall\nCredit **₹ 1000** additionally :)",
      },
      tracker_details: {
        diet_id:
          dietSessionList.length > 0
            ? dietSessionList[0].diet_id
            : null || null,
        session:
          dietSessionList.length > 0
            ? dietSessionList[0].session
            : null || null,
        weight_day,
        inch_day,
      },
      show_goal,
    };
    console.log(user.counsellor_whatsapp, 12121212121);
    return res.status(200).json({
      message: "Splash Screen Data Fetched Successfully",
      status: true,
      data: {
        ...responseData,
        force_update: generalConstants.isForceUpdate,
        redirect_screen_id: "1",
        weight_loss_type: "0",
        redirect_screen_name: user.current_screen || "",
        counsellor_whatsapp_number: user.counsellor_whatsapp
          ? String(user.counsellor_whatsapp).replace(" ", "")
          : "+917021960648",
        ios_version: app_versions.ios,
        android_version:
          Number(user.user_id) === 127178 ? "5.0.54" : app_versions.android,
        last_visited_screen: user.current_screen || "",
        user_type: user.user_type || "",
        user_status: user.user_status || "",
        is_consultation_done: user.call_user_id ? true : false,
        is_new: user.new_app_login == 1,
      },
    });
  } catch (error) {
    console.error("Error fetching splash screen data:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      data: [],
      force_update: generalConstants.isForceUpdate,
    });
  }
};

export const getNutritionistDetails = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;

  try {
    if (user_id == "" || user_id == 0 || user_id == undefined) {
      return res.status(201).json({
        status: false,
        message: "User Is Not Logged In",
        data: [],
        force_update: generalConstants.isForceUpdate,
      });
    } else {
      //Get User Details from User ID
      const selectColumns = [
        "first_name",
        "last_name",
        "email_id",
        "mentor_assigned",
        "active_order_id",
        "user_type",
        "user_status",
        "sub_user_status",
        "gender",
      ];
      const whereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails}`,
        selectFields: selectColumns,
        conditions: whereCondition,
      });

      //Get Assigned Mentor Details
      const selectMentorDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "ethnicity",
        "photo",
        "expertise",
        "total_clients",
        "total_experience",
        "education",
        "designation",
        "official_phone",
      ];
      const mentorDetailsWhereCondition = [
        {
          field: "admin_user_id",
          operator: "=",
          value: userDetails[0].mentor_assigned,
        },
      ];
      const { results: mentorDetails } = await readRecord({
        table: `${tables.adminUsers}`,
        selectFields: selectMentorDetailsColumns,
        conditions: mentorDetailsWhereCondition,
      });
      console.log(mentorDetails, 61);
      const mentorName =
        mentorDetails[0].first_name + " " + mentorDetails[0].last_name;
      const education = mentorDetails[0].education.split("<br>");
      console.log(education, 11212);
      education.push("PgD in Diabetes");
      const responseData = {
        assigned_mentor: mentorName,
        mentor_education: education,
        mentor_expertise: mentorDetails[0].expertise,
        mentor_designation: mentorDetails[0].designation,
        mentor_total_clients: mentorDetails[0].total_clients,
        mentor_total_experience: mentorDetails[0].total_experience,
        mentor_photo: safeJSONParse(mentorDetails[0].photo),
      };

      return res.status(200).json({
        message: "Nutritionists Data Fetched Successfully.",
        screen_name: "mentor intro",
        status: true,
        data: responseData,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(404).json({ status: false, message: error.message });
  }
};

export const getEkitList = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const active_order_id = newData.active_order_id;

  try {
    const ekitList = [
      {
        id: 1,
        title: "BN Restaurant Guide",
        description:
          "This guide enables you to eat out whether at a party, movie, wedding or a holiday.",
        backgroundColor: "bg-green-200",
        icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/restaurant_guide.png`,
        redirect_url: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
        redirect_screen: "inAppWebView",
      },
      {
        id: 2,
        title: "BN Daily Essentials",
        description:
          "This guide enables you to eat out whether at a party, movie, wedding or a holiday.",
        backgroundColor: "bg-yellow-400",
        icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/daily_essentials.png`,
        // redirect_url: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-daily-essentials`,
        redirect_screen: "inAppWebView",
        redirect_url:
          "https://balancenutrition.in/media/ekits/daily_essentials.pdf",
        screen_title: `BN Daily Essentials`,
      },
      {
        id: 3,
        title: "BN Eat In Portions",
        description:
          "The backbone of your program. It teaches you portions of food that you have to consume at a time.",
        backgroundColor: "bg-green-200",
        icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/eat_n_portions.png`,
        // redirect_url: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        redirect_screen: "inAppWebView",
        redirect_url: `https://balancenutrition.in/media/ekits/eat_in_portions.pdf`,
        screen_title: `BN Eat in Portions`,
      },
      {
        id: 4,
        title: "BN Alcohol Guide",
        description:
          "It allows you to enjoy your drinks, but in portion along with a detailed option for bitings too.",
        backgroundColor: "bg-yellow-400",
        icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/alcohol_guide.png`,
        redirect_url: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_id}`,
        redirect_screen: "inAppWebView",
      },
      {
        id: 5,
        title: "BN Frequently Asked Question",
        description:
          "This is a mini-mentor on your phone, with answers to most of your queries.",
        backgroundColor: "bg-green-200",
        icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/bn_faq.png`,
        redirect_screen: "inAppWebView",
        redirect_url:
          "https://balancenutrition.in/media/ekits/frequently_asked_questions.pdf",
        screen_title: `BN Frequently Asked Question`,
      },
    ];

    const { results: introCallDetails } = await readRecord({
      table: `${tables.callUpdates}`,
      selectFields: ["*"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "call_type", operator: "=", value: "66" },
        { field: "sub_order_id", operator: "=", value: active_order_id },
      ],
    });
    let intro_call_due = false;
    if (introCallDetails.length > 0) {
      intro_call_due = false;
    } else {
      intro_call_due = true;
    }

    const selectColumns = [
      "ud.user_id",
      "ud.first_name",
      "ud.last_name",
      "ud.email_id",
      "ud.phone_code",
      "ud.phone_number",
      "ud.mentor_assigned",
      "ud.counsellor_assigned",
      "ud.active_order_id",
      "ud.user_type",
      "ud.user_status",
      "ud.sub_user_status",
      "ud.current_screen",
      "ud.gender",
      "ud.new_app_login",
      "sop.sent_sessions",
      "sop.total_sessions",
      "sop.pending_session",
      "sop.sub_order_id",
      "dsl.diet_id",
      "dsl.diet_start_date",
      "dsl.start_session_weight",
      "dsl.mid_session_weight",
      "dsl.end_session_weight",
      "dsl.end_session_inch",
      `(SELECT ir.days FROM ${tables.inchRecords} ir WHERE ir.sub_order_id = sop.sub_order_id AND ir.session IN (0, sop.sent_sessions) ORDER BY ir.posted_date DESC LIMIT 1) as inch_day`,
      "dsl.session as diet_session",
      "pm.program_name",
      "ps.validity as program_duration",
      "ps.extra_validity",
      "ps.per_session_days",
      "ass.assessment_id",
      `(SELECT hs.id FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id AND hs.created >= DATE_SUB(NOW(), INTERVAL 15 DAY) ORDER BY hs.created DESC LIMIT 1) as is_hs_taken`,
      "ad.first_name as mentor_first_name",
      "ad.email_id as mentor_email_id",
      "ad.ethnicity as mentor_ethnicity",
      "ad.photo as mentor_photo",
      "ad.expertise as mentor_expertise",
      "ad.total_clients as mentor_total_clients",
      "ad.total_experience as mentor_total_experience",
      "ad.education as mentor_education",
      "ad.designation as mentor_designation",
      "ad.official_phone as mentor_official_phone",
      "cu.user_id as call_user_id",

      "ad2.first_name as counsellor_first_name",
      "ad2.email_id as counsellor_email_id",
      "ad2.ethnicity as counsellor_ethnicity",
      "ad2.photo as counsellor_photo",
      "ad2.expertise as counsellor_expertise",
      "ad2.total_clients as counsellor_total_clients",
      "ad2.total_experience as counsellor_total_experience",
      "ad2.education as counsellor_education",
      "ad2.designation as counsellor_designation",
      "ad2.official_phone as counsellor_whatsapp",
    ];

    const whereCondition = [
      { field: "ud.user_id", operator: "=", value: user_id },
      // { field: "dsl2.diet_id", operator: "IS", value: "NULL", raw: true },
      // { field: "dsl.diet_status", operator: "=", value: 4 },
    ];

    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: selectColumns,
      conditions: whereCondition,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND ud.user_id = dsl.user_id and dsl.diet_status = 4",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl2`,
          on: "dsl2.sub_order_id = dsl.sub_order_id AND dsl.diet_id > dsl2.diet_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "cu.user_id = ud.user_id AND cu.call_type = '30'",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad2`,
          on: "cu.added_by = ad2.admin_user_id",
        },
      ],
      groupBy: ["ud.user_id"],
    });
    if (!userDetails || userDetails.length === 0) {
      return res.status(200).json({
        status: false,
        message: "User Not Found",
      });
    }
    // if (Number(userDetails[0].new_app_login) === 0) {
    //   return res.status(200).json({
    //     status: false,
    //     message: "User Not Found",
    //   });
    // }
    const user = userDetails[0];
    const parseDuration = (str) => {
      const value = String(str || "0").trim();
      const match = value.match(/^(\d+)\s*(Days|Day)?$/i);
      return match ? Number(match[1]) || 0 : Number(value) || 0;
    };

    const program_duration = parseDuration(user.program_duration);
    const extra_validity = parseDuration(user.extra_validity);

    const isCleanseProgram =
      Number(user.total_sessions) === 1 && [1, 3].includes(program_duration);
    const cleanseEndDay = isCleanseProgram
      ? program_duration === 1
        ? 2
        : 4
      : 10;

    return res.status(200).json({
      message: "Ekit List Fetched Successfully.",
      screen_name: "ekit_list",
      status: true,
      data: ekitList,
      call_due: intro_call_due,
      cleanse_data: {
        is_cleanse: isCleanseProgram,
        is_hs_taken: !!user.is_hs_taken,
        is_diet_sent: user.sent_sessions == 0 ? false : true,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(404).json({ status: false, message: error.message });
  }
};

export const getGetCurrentScreen = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("UserId Not provided", 400));

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.last_screen_visited",
        "ass.completion_status as ass_completion_status",
        "icl.completion_status as icl_completion_status",
        "ud.user_status",
        "ud.sub_user_status",
        "ud.current_screen",
        `(SELECT cu.call_type FROM ${tables.callUpdates} cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_type`,
        `(SELECT cu.call_status FROM ${tables.callUpdates} cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_status`,
        "ps.program_duration",
        "sop.sent_sessions",
        "hs.user_id as health_score_user_id",
        "ud.new_app_login",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = ud.user_id AND ass.active_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.ingredientChecklistRecords} icl`,
          on: "icl.user_id = ud.user_id AND icl.active_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `(
        SELECT hs.*
        FROM ${tables.healthScoreClient} hs
        WHERE hs.user_id = ${user_id}
        ORDER BY hs.created DESC
        LIMIT 1
      ) hs`,
          on: "ud.user_id = hs.user_id ",
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });
    console.log(results[0], 543);
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "User Not Found",
        data: {
          screen_name: "",
          screen_params: {
            redirect_id: "",
          },
        },
      });
      return res.status(200).json(apiResponse);
    }
    if (Number(results[0].new_app_login) === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Not logged in new app",
        data: {
          screen_name: "",
          screen_params: {
            redirect_id: "",
          },
        },
      });
      return res.status(200).json(apiResponse);
    }
    const userDetails = results[0];
    console.log(userDetails, 476);
    const last_screen_visited = userDetails.last_screen_visited;
    const ass_completion_status =
      Number(userDetails.ass_completion_status) || 0;
    const icl_completion_status =
      Number(userDetails.icl_completion_status) || 0;
    const current_screen = String(
      userDetails.current_screen || "program_details_info",
    );
    const program_duration =
      parseInt(
        userDetails?.program_duration?.split(/Day[s]?/)[0]?.trim(),
        10,
      ) || 0;
    const call_type = userDetails.call_type
      ? Number(userDetails.call_type)
      : null;
    const sent_sessions = Number(userDetails.sent_sessions) || null;
    let response = new CurrentScreenResponse({
      redirect_id: "",
      screen_name: "my_profile",
    });

    const skipAssessmentAndICL =
      program_duration === 1 || program_duration === 3;

    if (
      userDetails.sub_user_status === "Inactive" &&
      !last_screen_visited &&
      !userDetails.health_score_user_id
    ) {
      response = new CurrentScreenResponse({
        redirect_id: "",
        screen_name: "take_health_score",
        show_wallet_popup: true,
        wallet_amount: 2000,
      });
    } else if (userDetails.user_status === "Active") {
      if (
        !last_screen_visited &&
        ass_completion_status === 0 &&
        icl_completion_status === 0
      ) {
        console.log("hello");
        // Program Intro
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: current_screen,
        });
      }
      // Program Validity
      else if (
        last_screen_visited === "program_validity" &&
        (ass_completion_status === 0 || !ass_completion_status) &&
        (!icl_completion_status || icl_completion_status === 0)
      ) {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: last_screen_visited,
        });
      }
      // Assessment (only if program_duration is NOT 1 or 3)
      else if (
        !skipAssessmentAndICL &&
        ((ass_completion_status !== 2 &&
          last_screen_visited === "message_from_khyati") ||
          last_screen_visited === "assessment")
      ) {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "assessment",
        });
      }
      // Ingredient Checklist (only if program_duration is NOT 1 or 3)
      else if (
        !skipAssessmentAndICL &&
        ((ass_completion_status === 2 &&
          icl_completion_status !== 2 &&
          last_screen_visited === "assessment") ||
          last_screen_visited === "assessment_all_details_received" ||
          last_screen_visited === "ingredient_checklist_details")
      ) {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "ingredient_checklist_details",
        });
      }
      // Meet Your Mentor
      else if (
        icl_completion_status === 2 &&
        last_screen_visited === "icl_all_details_received"
      ) {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "mentor_intro",
        });
      } else if (last_screen_visited === "mentor_intro") {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "mentor_intro",
        });
      }
      // Mentor Message
      else if (last_screen_visited === "message_from_mentor") {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "message_from_mentor",
        });
      }
      // What We Analyze
      else if (last_screen_visited === "what_we_analysed") {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "what_we_analysed",
        });
      }
      // BN Ekit
      else if (
        sent_sessions <= 1 &&
        (last_screen_visited === "what_we_analysed" ||
          last_screen_visited === "bn_ekit") &&
        call_type !== 0
      ) {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: "bn_ekit",
        });
      } else if (
        last_screen_visited === "program_details_info" &&
        ass_completion_status === 0 &&
        icl_completion_status === 0
      ) {
        response = new CurrentScreenResponse({
          redirect_id: "",
          screen_name: current_screen,
        });
      }
    }
    // Default case
    else {
      response = new CurrentScreenResponse({
        redirect_id: "",
        screen_name: "my_profile",
      });
    }
    console.log(response, 636);
    return res.status(200).json(
      new ApiResponse({
        message: "Current Screen Fetched Successfully",
        data: response,
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const updateCurrentScreen = async (req, res, next) => {
  try {
    const { user_id, screen_name } = req.query;
    if (!user_id && !screen_name) {
      return next(new ErrorHandler("User Id Not Provided", 400));
    }
    const updatedResult = await updateRecord(
      tables.userDetails,
      {
        last_screen_visited: screen_name,
      },
      { user_id },
    );
    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error Updating Last Screen", 400));
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Last Screenn Updated Successfully",
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getCleanseShoppingList = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const active_order_id = newData.active_order_id;

  try {
    let cleanse_image = "";
    let ingredient_array = [];

    const selectColumns = ["program_id"];
    const whereCondition = [
      { field: "sub_order_id", operator: "=", value: active_order_id },
    ];
    const { results: order_details } = await readRecord({
      table: tables.subOrderPrograms,
      selectFields: selectColumns,
      conditions: whereCondition,
    });

    if (order_details[0]["program_id"] == 112) {
      //weightloss cleanse
      cleanse_image = "Weightlosscleanse.jpeg";
      ingredient_array = [
        "Wheat grass juice / Unsweetened aloevera juice (60ml)",
        "Coconut water without malai (2 glasses)",
        "Tetrapack soy milk (1 no.)",
        "Green tea bag (1 no.)",
        "Garden cress seeds (1 tsp)",
        "Cinnamon powder (a pinch)",
        "Mint leaves few",
        "Fruits (as per diet)",
        "Vegetables (as per diet)",
        "Lime juice (as per diet)",
      ];
    } else if (order_details[0]["program_id"] == 113) {
      //sugardetox cleanse
      cleanse_image = "SugarCleanse.jpeg";
      ingredient_array = [
        "Wheat grass powder (1tsp) / Unsweetened aloe vera juice (30ml)",
        "Green tea bags (2 no.)",
        "Cinnamon powder (½ tsp)",
        "Isabgol (1 tsp)",
        "Triphala tablets (2 no.)",
        "Fruits (as per diet)",
        "Vegetables (as per diet)",
      ];
    } else if (order_details[0]["program_id"] == 114) {
      //flat stomach
      cleanse_image = "FlatStomachCleanse.jpeg";
      ingredient_array = [
        "Green tea bags",
        "Fruits (as per the diet)",
        "Vegetables (as per the diet)",
      ];
    } else if (order_details[0]["program_id"] == 115) {
      //acidity correction
      cleanse_image = "AcidityCleanse.jpeg";
      ingredient_array = [
        "Mint leaves (few)",
        "Cumin powder (½ tsp) / Green tea bag",
        "Flax seeds",
        "Spearmint tea bag (1 no.)",
        "Coconut water without malai (2 glasses)",
        "Fennel seeds roasted (1tsp)",
        "Chamomile tea bag (1no.)",
      ];
    } else if (order_details[0]["program_id"] == 116) {
      //immunity boosting
      cleanse_image = "ImmuneBoosting.jpeg";
      ingredient_array = [
        "Cinnamon powder (½ tsp)",
        "Wheat grass juice (60ml)",
        "Green tea bags (1 no.)",
        "Cold pressed coconut oil (1tsp)",
        "Fruits (as per diet plan)",
        "Vegetables (as per diet plan)",
      ];
    } else if (order_details[0]["program_id"] == 121) {
      //constipation
      cleanse_image = "ConstipationCleanse.jpeg";
      ingredient_array = [
        "Unsalted flaxseeds (1tsp) / Black raisins (3-4)",
        "Castor oil (1 tsp)",
        "Curry leaves (5 no.)",
        "Mint leaves (few)",
        "Hing (¼ th tsp)",
        "Fruits (as per diet)",
        "Vegetables (as per diet)",
      ];
    } else if (order_details[0]["program_id"] == 131) {
      //post festive
      cleanse_image = "FlatStomachCleanse.jpeg";
      ingredient_array = ["post festive"];
    }

    const ingredient_list = [
      {
        cleanse_image:
          `https://${image_guide_base_url}/bn-api-new/images/cleanse_shopping_list/` +
          cleanse_image,
        title: "Shopping List",
        shopping_list: ingredient_array,
      },
    ];
    return res.status(200).json({
      message: "Shopping List Fetched Successfully.",
      screen_name: "shopping_list",
      status: true,
      data: ingredient_list,
    });
  } catch (error) {
    console.log(error);
    return res.status(404).json({ status: false, message: error.message });
  }
};

export const getCleanseProgramBenefits = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      selectFields: [
        "pm.cleanse_flow_benefit",
        "sop.order_type",
        "sop.sub_order_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.active_order_id = sop.sub_order_id`,
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: `sop.program_id = pm.program_id`,
        },
      ],
      conditions: [
        { field: "cd.user_id", operator: "=", value: user_id },
        {
          orConditions: [
            { field: "pm.program_name", operator: "LIKE", value: "%10 Day%" },
            { field: "pm.program_name", operator: "LIKE", value: "%cleanse%" },
            { field: "pm.program_name", operator: "LIKE", value: "%14-Day%" },
          ],
        },
      ],
    });
    console.log(JSON.parse(results[0].cleanse_flow_benefit), 1201);
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Cleanse Program Benefits Found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    if (["New", "OCR"].includes(results[0].order_type)) {
      addAmountWallet({
        amount: 500,
        user_id,
        reason: "Cleanse Program Benefit",
        sub_order_id: results[0].sub_order_id,
      });
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cleanse Program Benefits Fetched Successfully",
      data: safeJSONParse(results[0].cleanse_flow_benefit, []),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getCleanseProgramBenefits:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getClenaseProgramIngredients = async (req, res, next) => {
  try {
    const { active_order_id } = req.body;
    console.log(active_order_id, 1218);
    const { results } = await readRecord({
      selectFields: ["pm.cleanse_ingredients"],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: `sop.program_id = pm.program_id`,
        },
      ],
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: active_order_id },
      ],
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Cleanse Program Ingredients Found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const { ingredients_list, image } = safeJSONParse(
      results[0].cleanse_ingredients,
      {
        ingredients_list: [],
        image: null,
      },
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cleanse Program Ingredients Fetched Successfully",
      data: {
        cleanse_image: image
          ? `https://${image_guide_base_url}/bn-api-new/images/cleanse_shopping_list/` +
            image
          : null,
        shopping_list: ingredients_list,
        title: "Shopping List",
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getClenaseProgramIngredients:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
