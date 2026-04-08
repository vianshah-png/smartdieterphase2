import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import md5 from "md5";
import moment from "moment";
import { sendSSEEvent } from "./dashboardNotificationController.js";
import { addAutoDraftedQuery } from "../controllers/common.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import { addSourceLogNew } from "./salesDashboardControllers/leadsController.js";

const insertInTable = async (req, res, next) => {
  try {
    const {
      name,
      phone_code,
      phone,
      utm_source,
      utm_campaign,
      utm_medium,
      questions,
    } = req.body;

    const email = `${phone}@bn.in`;
    const fullPhone = `${phone_code} ${phone}`;
    let source_utm = 6;

    console.log(utm_source, 1212121212);

    // Handle lead_source (get or use default)
    if (utm_source) {
      const { results: leadSourceResults } = await readRecord({
        table: tables.leadSource,
        selectFields: ["source_id"],
        conditions: [
          { field: "source_name", operator: "=", value: utm_source },
          { field: "is_deleted", operator: "=", value: 0 },
        ],
      });

      if (leadSourceResults.length > 0) {
        source_utm = leadSourceResults[0].source_id;
      }
    }

    console.log(source_utm, "source_utm");

    // Check if user exists by last 8 digits of phone
    const { results: users } = await readRecord({
      selectFields: ["user_id", "user_status"],
      table: tables.userDetails,
      conditions: [
        {
          field: "RIGHT(phone, 8)",
          operator: "=",
          value: phone.slice(-8),
        },
      ],
      pagination: { page: 1, limit: 1 },
    });

    let userId;
    let leadTypeForCampaign = "FL"; // default lead type for new users

    if (users.length > 0) {
      userId = users[0].user_id;

      // Make sure user_status is a string & lowercased for safe comparison
      const userStatus =
        typeof users[0].user_status === "string"
          ? users[0].user_status.toLowerCase()
          : "";

      if (userStatus === "lead") {
        leadTypeForCampaign = "OL"; // override if lead
      } else if (userStatus) {
        leadTypeForCampaign = users[0].user_status; // use original case as is
      }
    } else {
      // New user insert
      const insertResult = await insertRecord(
        tables.userDetails,
        [
          "first_name",
          "phone_code",
          "phone_number",
          "phone",
          "email_id",
          "enc_password",
          "plain_password",
          "goal_weight",
          "old_wallet",
          "gender",
          "referred_by",
          "lead_type",
          "primary_lead_source",
          "current_lead_source",
        ],
        [
          name,
          phone_code,
          phone,
          fullPhone,
          email,
          md5("123456"),
          "123456",
          "0",
          0,
          "0",
          0,
          "FL",
          source_utm,
          source_utm,
        ]
      );

      if (!insertResult?.insertId) {
        return next(new ErrorHandler("Failed to insert user details", 500));
      }

      userId = insertResult.insertId;
      leadTypeForCampaign = "FL"; // new user default
    }

    // Insert campaign details
    await insertRecord(
      tables.campDetails,
      ["user_id", "campaign", "result", "lead_type"],
      [
        userId,
        utm_campaign || "unknown",
        JSON.stringify(questions),
        leadTypeForCampaign,
      ]
    );

    // Respond success
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User processed successfully",
      data: {
        success: true,
        user_id: userId,
        source_id: source_utm,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (err) {
    console.error("Error in storing the details:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const insertNewCampaignLead = async (req, res, next) => {
  try {
    const {
      name,
      phone_number,
      phone_code,
      email,
      birthDate,
      weight,
      medicalIssue,
    } = req.body;

    const source_id = 72; // fixed

    // Clean and normalize phone number BEFORE searching
    let normalizedPhone = phone_number.replace(/\s+/g, "");

    // Apply country logic
    const isIndia = phone_code?.replace(/\D/g, "") === "91";
    normalizedPhone = isIndia
      ? normalizedPhone.slice(-10)
      : normalizedPhone.slice(-8);

    // 1️⃣ Check if user already exists
    const { results: users } = await readRecord({
      table: tables.userDetails,
      selectFields: [
        "user_id",
        "first_name",
        "user_status",
        "phone_number",
        "mentor_assigned",
        "counsellor_assigned",
      ],
      conditions: [
        {
          field: "phone_number",
          operator: "=",
          value: normalizedPhone,
        },
      ],
      pagination: { page: 1, limit: 1 },
    });

    const countryResult = await readRecord({
      table: tables.countries,
      selectFields: ["country_id", "country_name"],
      conditions: [
        {
          field: "phonecode",
          operator: "=",
          value: phone_code?.replace(/\D/g, ""),
        },
      ],
    });

    let userId;
    let leadType = "FL";
    let assignedPerson = 0;

    // 2️⃣ If user exists
    if (users.length > 0) {
      userId = users[0].user_id;

      const status =
        typeof users[0].user_status === "string"
          ? users[0].user_status.toLowerCase()
          : "";

      leadType = status === "lead" ? "OL" : users[0].user_status || "FL";
      assignedPerson =
        users[0].user_status?.toLowerCase() === "lead"
          ? users[0].counsellor_assigned
          : users[0].mentor_assigned;
    }

    // 3️⃣ New user (medicalIssue NOT stored here)
    else {
      const insertUser = await insertRecord(
        tables.userDetails,
        [
          "first_name",
          "phone_code",
          "phone_number",
          "phone",
          "email_id",
          "birth_date",
          "country_id",
          "enc_password",
          "plain_password",
          "lead_type",
          "latest_weight",
          "primary_lead_source",
          "current_lead_source",
        ],
        [
          name,
          phone_code,
          normalizedPhone,
          `${phone_code}-${normalizedPhone}`,
          email,
          birthDate,
          countryResult.results[0].country_id,
          md5("123456"),
          "123456",
          "FL",
          weight,
          source_id,
          source_id,
        ]
      );

      if (!insertUser?.insertId) {
        return next(new ErrorHandler("Failed to insert user", 500));
      }

      userId = insertUser.insertId;
      leadType = "FL";
    }

    const { results: lead_source } = await readRecord({
      table: `${tables.leadSource}`,
      selectFields: ["*"],
      conditions: [{ field: "source_id", operator: "=", value: source_id }],
    });
    let source_utm = lead_source[0].source_name;
    addSourceLogNew({
      source: source_utm,
      id: userId,
    }),
      // 4️⃣ Insert into NEW campaign table (NO JSON)
      await insertRecord(
        tables.camp72Details, // 👈 new table
        [
          "user_id",
          "name",
          "phone_code",
          "phone_number",
          "country_name",
          "email",
          "birth_date",
          "weight",
          "medical_issue",
          "lead_type",
          "source_id",
          "source_name",
          "assigned_person",
        ],
        [
          userId,
          name,
          phone_code,
          phone_number,
          countryResult.results[0].country_name,
          email,
          birthDate,
          weight,
          JSON.stringify(medicalIssue),
          leadType,
          source_id,
          source_utm,
          assignedPerson,
        ]
      );

    // 5️⃣ Success
    // SlimSmart campaign only (source_id = 72)
    if (users.length > 0) {
      const isLead = users[0].user_status?.toLowerCase() === "lead";

      if (isLead) {
        await insertRecord(
          tables.leadAssignedLog,
          ["counsellor_id", "assigned_by", "user_id"],
          [users[0].counsellor_assigned, users[0].counsellor_assigned, userId]
        );
        await updateRecord(
          tables.userDetails,
          {
            current_lead_source: source_id,
            lead_type: leadType,
            birth_date: birthDate,
          },
          { user_id: userId }
        );
      } else if (users[0].user_status?.toLowerCase() === "completed") {
        await updateRecord(
          tables.userDetails,
          { birth_date: birthDate },
          { user_id: userId }
        );
      }

      // Assign to counsellor (lead) or mentor (client)

      // Text changes based on lead or client
      const title = isLead
        ? "New SlimSmart Lead Submission!"
        : "New SlimSmart Client Submission!";

      const description = isLead
        ? `${users[0].first_name} filled the form on Social Media for the SlimSmart Campaign. Please review lead submission.`
        : `${users[0].first_name} filled the form on Social Media for the SlimSmart Campaign. Please review client submission.`;

      // SSE payload
      const data = {
        title,
        description,
        priority: 1,
        redirect: `/profile/${users[0].user_id}`,
      };

      console.log(data);

      // Send SSE
      sendSSEEvent({ mentor_id: assignedPerson, data });
    }

    await updateRecord(
      tables.userDetails,
      { medical_issue: JSON.stringify(medicalIssue) },
      { user_id: userId }
    );

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Campaign stored successfully",
        data: {
          success: true,
          user_id: userId,
          source_id: source_id,
        },
      })
    );
  } catch (err) {
    console.error("Error:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const getLatestUserCampaignData = async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({
        status: false,
        message: "user_id is required",
      });
    }

    // Fetch the latest entry for this user_id
    const { results: latestResult } = await readRecord({
      table: tables.campDetails,
      selectFields: ["result", "added_date"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["added_date DESC"],
      limit: 1,
    });

    if (!latestResult.length) {
      return res.status(200).json({
        status: true,
        message: "No result found for this user",
        screen_name: "Latest User Result",
        data: { result: null },
      });
    }

    let parsedResult = null;
    try {
      parsedResult = JSON.parse(latestResult[0].result);
    } catch (parseError) {
      console.error("Error parsing result JSON:", parseError);
      parsedResult = latestResult[0].result; // return raw if JSON parsing fails
    }

    return res.status(200).json({
      status: true,
      message: "Latest Result Fetched Successfully",
      screen_name: "Latest User Result",
      data: {
        user_id,
        added_date: latestResult[0].added_date,
        result: parsedResult,
      },
    });
  } catch (error) {
    console.error("Error in getLatestUserResult:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const dietFeedback = async (req, res, next) => {
  try {
    const { session, diet_id } = req.body;
    let questions = req.body.questions;
    const { results: existingId } = await readRecord({
      table: tables.dietSessionLog,
      selectFields: ["user_id"],
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      pagination: { page: 1, limit: 1 },
    });

    const userId = existingId[0].user_id;
    const rating = questions[0].answer;

    let imf_concern = "";
    let is_imf = false;
    let fasting_window = "";
    if (req.body.isImf) {
      is_imf = req.body.isImf;
    }
    let out = "";
    if (req.body.imf) {
      const imf = req.body.imf;
      out = imf.reduce((acc, { question, answer }) => {
        if (
          question === "Are you comfortable with your current fasting hours?"
        ) {
          acc.comfortableAnswer = answer;
        }
        if (question === "What would be your preferred new fasting schedule?") {
          acc.preferredNewSchedule = answer;
        }

        if (question === "Would you like to change your fasting hours?") {
          acc.isChangeWindow = answer;
        }
        return acc;
      }, {});

      questions = [...questions, ...imf];
      if (out.comfortableAnswer === "No" && out.isChangeWindow == "No") {
        imf_concern = "Not Comfortable";
      } else {
        console.log(out.preferredNewSchedule);
        if (out.preferredNewSchedule == "Move to 12-hour fasting") {
          imf_concern = "Change Fasting Window to 12:12 Fasting";
          fasting_window = "12:12";
        } else if (out.preferredNewSchedule == "Move to 14-hour fasting") {
          imf_concern = "Change Fasting Window to 14:10 Fasting";
          fasting_window = "14:10";
        } else if (out.preferredNewSchedule == "Move to 16-hour fasting") {
          imf_concern = "Change Fasting Window to 16:8 Fasting";
          fasting_window = "16:8";
        } else if (
          out.preferredNewSchedule == "Discuss Fasting Window With Mentor"
        ) {
          imf_concern = "Discuss Fasting Window With Mentor";
        } else {
          imf_concern = "";
        }
      }
    }
    // return false;

    if (is_imf == true) {
      await insertRecord(
        tables.dietFeedback,
        ["session", "result", "diet_id", "user_id", "imf_concern", "is_imf"],
        [session, JSON.stringify(questions), diet_id, userId, imf_concern, "1"]
      );
    } else {
      await insertRecord(
        tables.dietFeedback,
        ["session", "result", "diet_id", "user_id"],
        [session, JSON.stringify(questions), diet_id, userId]
      );
    }

    const { results: userDetails } = await readRecord({
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.mentor_assigned",
        "ud.phone_code",
        "ud.phone_number",
        "ud.active_order_id",
        "dsl.session",
        "dsl.diet_name",
        "dsl.sub_order_id",
        "dsl.start_session_weight",
        "dsl.end_session_weight",
        "pm.program_name",
        "ps.program_duration",
        "ad.crm_user as mentor_name",
        "ad.email_id as mentor_email",
        "sop.sent_sessions",
        "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1','3') THEN 1 ELSE 0 END ) AS program_number",
        "ad.active",
        "ud.start_weight",
        "ud.latest_weight",
        "COALESCE(ud.my_wallet, 0) as my_wallet",
      ],
      table: `${tables.dietSessionLog} dsl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "dsl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.mentor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "dsl.sub_order_id = sop.sub_order_id",
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
            SELECT od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM order_details od2
            LEFT JOIN sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE sop2.program_type = 0
          ) sop_count`,
          on: "ud.user_id = sop_count.user_id",
        },
      ],
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
    });

    const details = userDetails[0];

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data saved successfully",
      data: {
        isSubmitted: true,
        userId: details.user_id,
        addedBy: details.mentor_assigned,
        phoneCode: details.phone_code,
        phoneNumber: details.phone_number,
        subOrderId: details.active_order_id,
        callType: 32,
      },
    });

    const data = {
      title: "New Diet Feedback Received!",
      description: `${details.first_name} has submitted their diet feedback for Session ${details.session}. Please review.`,
      priority: 1,
      redirect: `/profile/${details.user_id}?menu=diet_feedback`,
    };

    sendSSEEvent({ mentor_id: details.mentor_assigned, data });

    const data1 = {
      title: `${details.first_name} has Filled Diet Feedback!`,
      priority: 3,
      redirect: `/profile/${details.user_id}?menu=diet_feedback`,
    };

    sendSSEEvent({ mentor_id: details.mentor_assigned, data1 });

    let draftQuery = "";
    if (rating < 5) {
      draftQuery = `<p>Hi ${details.first_name},</p>
        <p><b>PLEASE EDIT AND SEND</b></p>
        <p>A rating of ${rating} is not considered good for us at all.</p>
        <p>I would be happy to schedule a call with you to understand your concerns before I plan the next session.</p>
        <p>Let me know if 11.11 am IST today works for you.</p>
        <p><b>(OFFER A TIME / REACH OUT ON WA & ENSURE YOU SEND THE DIET SOON.)</b></p>`;
    } else {
      draftQuery = `<p>Hi ${details.first_name},</p>
        <p><b>PLEASE EDIT AND SEND</b></p>
        <p>I am glad you liked the previous session & have rated it 5 :)</p>
        <p><b>PLEASE READ THE OTHER FEEDBACK & ADD YOUR TAKE HERE ON THOSE. DON'T IGNORE ANY POINT.</b></p>`;
    }

    if (is_imf == true) {
      if (
        rating > 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule != "" &&
        out.preferredNewSchedule != "Discuss Fasting Window With Mentor"
      ) {
        //Good Feedback + Not Comfortable with IMF + Change IMF hours

        draftQuery = `<p>Hi ${details.first_name}</p>
<p>I was just checking your feedback for session ${details.session}. </p>
<p>I'm so glad to hear that you enjoyed the plan and found it helpful. </p>
<p>I understand you're not comfortable with your current fasting hours.</p>  The ${fasting_window} fasting window can definitely be applied to the next few sessions. Let's make this work better for you. </p><p>Please book a call with me so we can discuss and adjust your fasting window together. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
<p>If you don't need a call, just let me know what 'eating window' you would prefer? Shall we keep it 9 am onwards?</p>
<p>Once you send me the confirmation, I will make the changes & send you the next session. </p>
<p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.</p>`;
      }

      if (
        rating <= 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule != "" &&
        out.preferredNewSchedule != "Discuss Fasting Window With Mentor"
      ) {
        //Bad Feedback + Not Comfortable with IMF + Dont Change IMF hours

        draftQuery = `<p>Hi ${details.first_name}</p>
      <p>I was just checking your feedback for session ${details.session}. </p>
      <p>Thank you for being honest with your feedback. I really appreciate it.</p>
      <p>I understand the current fasting hours & the diet aren't working well for you</p>  <p>Let's have a call so we can discuss this and make changes that suit you better.</p><p>Please schedule it with me as per your convenience. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
      <p>If you don't need a call, just let me know what 'eating window' you would prefer? Shall we keep it 9 am onwards?</p>
      <p>It is my topmost priority to ensure you are comfortable with your diet sessions & the program.</p>
      <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.</p>`;
      }

      if (
        rating > 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule == ""
      ) {
        draftQuery = `<p>Hi ${details.first_name}</p>
                <p>I was just checking your feedback for session ${details.session}. </p>
                <p>I'm happy to know you liked the plan overall.</p>
                <p>I see you're not very comfortable with the fasting hours, but don't want to change them right now. Let's discuss your discomfort over a call.</p> <p>Please schedule it with me as per your convenience. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
                <p>If you don't need a call, just let me know what 'eating window' you would prefer? Shall we keep it 9 am onwards?</p>
                <p>Once you send me the confirmation, I will make the changes & send you the next session. </p>
                <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.</p>`;
      }

      if (
        rating <= 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule == ""
      ) {
        draftQuery = `<p>Hi ${details.first_name}</p>
                <p>I was just checking your feedback for session ${details.session}. </p>
                <p>I'm sorry to hear you haven't had the best experience with the plan so far. It is my topmost priority to ensure you are comfortable with your diet sessions & the program.</p>
                <p>Let's discuss your discomfort over a call. Please schedule it with me as per your convenience.</p> <p>Please schedule it with me as per your convenience. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
                <p>In case you are too busy for a call in the next few days, please write your concerns to me here in detail. I will ensure we resolve them & make a good diet for you next session. EDIT & WRITE ON THE OTHER ASPECTS OF THE FEEDBACK </p>
                <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.  </p>`;
      }

      if (
        rating > 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule == ""
      ) {
        draftQuery = `<p>Hi ${details.first_name}</p>
                <p>I was just checking your feedback for session ${details.session}. </p>
                <p>I'm happy to know you liked the plan overall.</p>
                <p>I see you're not very comfortable with the fasting hours, but don't want to change them right now. Let's discuss your discomfort over a call.</p> <p>Please schedule it with me as per your convenience. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
                <p>If you don't need a call, just let me know what 'eating window' you would prefer? Shall we keep it 9 am onwards?</p>
                <p>Once you send me the confirmation, I will make the changes & send you the next session. </p>
                <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.</p>`;
      }

      if (
        rating > 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule == "Discuss Fasting Window With Mentor"
      ) {
        draftQuery = `<p>Hi ${details.first_name}</p>
                <p>I was just checking your feedback for session ${details.session}. </p>
                <p> Thank you for sharing your feedback! </p>
                <p>Since you're not feeling fully comfortable with the fasting hours, let's talk about it in detail. </p> <p>Please book a call, and we'll find a way to make your fasting routine more comfortable and effective for you. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
                <p>You can also write your concerns or changes in the fasting hours to me here if you are too busy for a call.  I'll keep an eye on your progress, and we can revisit this later if needed.</p>
                <p>Will send you the next session based on your concerns :)</p>
                <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.</p>`;
      }

      if (
        rating <= 4 &&
        out.comfortableAnswer == "No" &&
        out.preferredNewSchedule == "Discuss Fasting Window With Mentor"
      ) {
        draftQuery = `<p>Hi ${details.first_name}</p>
                <p>I was just checking your feedback for session ${details.session}. </p>
                <p>I'm sorry to hear you haven't had the best experience with the plan so far. It is my topmost priority to ensure you are comfortable with your diet sessions & the program</p>
                <p>Let's discuss your discomfort over a call & also discuss if we should change our current fasting window to any other.</p> <p>Please book a call. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a> </p>
                <p>In case you are too busy for a call in the next few days, please write your concerns to me here in detail. I will ensure we resolve them & make a good diet for you next session. EDIT & WRITE ON THE OTHER ASPECTS OF THE FEEDBACK </p>
                <p>Will send you the next session based on your concerns :)</p>
                <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet.</p>`;
      }

      if (
        rating > 4 &&
        out.comfortableAnswer == "Yes" &&
        out.preferredNewSchedule == "Discuss Fasting Window With Mentor"
      ) {
        draftQuery = `<p>Hi ${details.first_name},</p>

    <p>I was just checking your feedback for session ${details.session}. </p>
    <p>I'm thrilled to hear that you liked the plan and are comfortable with your fasting hours. WRITE ABOUT THE OTHER POINTERS THE CLIENT HAS MENTIONED IN THE FORM </p>
<p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet</p>`;
      }

      if (
        rating <= 4 &&
        out.comfortableAnswer == "Yes" &&
        out.preferredNewSchedule == "Discuss Fasting Window With Mentor"
      ) {
        draftQuery = `<p>Hi ${details.first_name},</p>

    <p>I was just checking your feedback for session ${details.session}. </p>
    <p>I'm sorry to hear you haven't had the best experience with the plan so far. It is my topmost priority to ensure you are comfortable with your diet sessions & the program.</p>
  <p>Let's discuss your discomfort over a call & also discuss if we should change our current fasting window to any other.</p> <p>Please book a call. <a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=111">Click here</a></p>
  <p>In case you are too busy for a call in the next few days, please write your concerns to me here in detail. I will ensure we resolve them & make a good diet for you next session. EDIT & WRITE ON THE OTHER ASPECTS OF THE FEEDBACK</p>  
  <p>Do let me know what supplements & ingredients you have pending from your previous sessions, will add them to your next diet</p>`;
      }
    }

    if (draftQuery) {
      await addAutoDraftedQuery({
        mentor_id: details.mentor_assigned,
        user_id: details.user_id,
        query: draftQuery,
      });
    }

    res.status(200).json(apiResponse);

    // 🟡 Weight Change Logic
    let weightChangeInSession = "No data";
    if (
      details.start_session_weight != null &&
      details.end_session_weight != null &&
      details.start_session_weight > 0
    ) {
      const change = (
        Number(details.start_session_weight) -
        Number(details.end_session_weight)
      ).toFixed(2);

      weightChangeInSession =
        change < 0 ? `${Math.abs(change)} kg gained` : `${change} kg`;
    } else {
      weightChangeInSession = "No Loss No Gain";
    }

    let overallWeightChange = "No data";
    if (details.start_weight != null && details.latest_weight != null) {
      const change = (
        Number(details.start_weight) - Number(details.latest_weight)
      ).toFixed(2);

      overallWeightChange =
        change < 0 ? `${Math.abs(change)} kg gained` : `${change} kg`;
    } else {
      const { results: weights } = await readRecord({
        table: tables.weightRecords,
        selectFields: ["weight"],
        conditions: [
          { field: "user_id", operator: "=", value: details.user_id },
        ],
        order: [{ field: "posted_date", direction: "ASC" }],
        pagination: { page: 1, limit: 1 },
      });

      const earliest = weights[0]?.weight ?? details.latest_weight;
      const change = (earliest - details.latest_weight).toFixed(2);
      if (earliest) {
        overallWeightChange = `No Loss No Gain`;
      } else {
        overallWeightChange =
          change < 0 ? `${Math.abs(change)} kg gained` : `${change} kg`;
      }
    }

    // 🟡 Email Template
    const mailBody = `
<html><head><meta charset="UTF-8"><title>Balance Nutrition</title></head><body style="font-size:12px;font-family:Arial;color:#000;">
  <table width="100%"><tr><td align="center">
  <table style="width:650px;border:1px solid #081d5f;background:#fff;padding-bottom:30px" cellspacing="0" cellpadding="0">
    <tr><td style="background:#3FBDC9">
      <a href="https://www.balancenutrition.in">
        <img src="https://bncleanse.com/images/balance-nutrition-logo.png?cache=4" style="border:none;width:300px;padding:10px 0 10px 20px"/>
      </a>
    </td></tr><tr><td>
    <table width="100%"><tr>
      <td align="center"><span style="font-weight:700;padding:10px 50px 10px 20px">
        <a href="tel:918928001617" style="text-decoration:none;color:#000">
          <img src="https://bncleanse.com/images/emails/phone_icon.jpg?cache=4" style="width:14px;vertical-align:middle"/>&nbsp;+91 89280 01617
        </a></span>
      </td>
      <td align="center"><span style="font-weight:700;padding:10px 50px 10px 0">
        <a href="mailto:info@balancenutrition.in" style="text-decoration:none;color:#000">
          <img src="https://bncleanse.com/images/emails/email_icon.jpg?cache=4" style="width:14px;vertical-align:middle"/>&nbsp;info@balancenutrition.in
        </a></span>
      </td>
    </tr></table></td></tr><tr><td>
    <table style="width:570px;background:#fff;padding:20px;margin-top:30px" cellspacing="0" cellpadding="0">
      <tr><td>
        Hello Team,<br/><br/>
        Diet Feedback Recorded For Below Client:<br/><br/>
        <strong>Name:</strong> ${details.first_name} ${details.last_name}<br/>
        <strong>Weight Change in this Session:</strong> ${weightChangeInSession}<br/>
        <strong>Overall Weight Change:</strong> ${overallWeightChange}<br/>
        <strong>Program Name:</strong> ${details.program_name} (${
      details.program_duration
    }) <br/>
        <strong>Program Number:</strong> ${details.program_number}<br/>
        <strong>Email ID:</strong> ${details.email_id}<br/>
        <strong>Mentor Name:</strong> ${details.mentor_name}<br/>
        <strong>Phone Number:</strong> ${details.phone_number}<br/>
        <strong>Session:</strong> ${session}<br/><br/>
        <strong>Diet Name:</strong> ${details.diet_name}<br/><br/>
        <div style="color:#3FBDC9;font-size:14px;font-weight:bold">Feedback Details:</div>
        <div style="line-height:1.5;margin:0;padding:0">
          ${questions
            .map(
              (q, i) =>
                `<div style="margin:4px 0"><strong>Q${i + 1}: ${
                  q.question
                }</strong><br/>${q.answer}</div>`
            )
            .join("")}
        </div><br/>Thanks & Regards
      </td></tr>
    </table></td></tr>
  </table>
  </td></tr></table></body></html>`;

    let subject = "";
    if (is_imf == true) {
      subject = `New IMF Diet Feedback${
        rating < 5 ? ` (Rating ${rating})` : ""
      }`;
    } else {
      subject = `New Diet Feedback${rating < 5 ? ` (Rating ${rating})` : ""}`;
    }

    let cc_array = [
      "khyati@balancenutrition.in",
      "clientservices@balancenutrition.in",
    ];
    if (userDetails[0].mentor_email == "mentor.kajal@balancenutrition.in") {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.palaks@balancenutrition.in",
        "mentor.saba@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.prajakta@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.epshita@balancenutrition.in",
        "mentor.saba@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.shraddha@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.vrutika@balancenutrition.in",
        "mentor.sadaf@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.arpita@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.rashmi@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.urmila@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.ayushi@balancenutrition.in",
        "mentor.batul@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.charu@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.nandini@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.urmilar@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.veeral@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.kajals@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.shirin@balancenutrition.in",
        "mentor.miloni@balancenutrition.in",
        "mentor.juweriya@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.omanshi@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.batul@balancenutrition.in",
      ];
    } else if (
      userDetails[0].mentor_email == "mentor.hardi@balancenutrition.in"
    ) {
      cc_array = [
        "khyati@balancenutrition.in",
        "clientservices@balancenutrition.in",
        "mentor.mariya@balancenutrition.in",
        "mentor.shifa@balancenutrition.in",
      ];
    }

    await sendMailUtil({
      from: "Support <support@balancenutrition.in>",
      to: [userDetails[0].mentor_email],
      cc: cc_array,
      //cc: ["vaibhav.gonjari@balancenutrition.in","clientservices@balancenutrition.in"],
      // to: ["shridhar.patil@balancenutrition.in"],
      subject,
      html: mailBody,
    });
    return res.status(200).json(apiResponse);
  } catch (err) {
    console.error("Error in submitting form:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getDietname = async (req, res, next) => {
  try {
    const { diet_id } = req.query;

    // Step 1: Check if the user has already submitted feedback for this diet_id
    const { results: existingFeedback } = await readRecord({
      table: tables.dietFeedback,
      selectFields: ["diet_id"],
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      pagination: { page: 1, limit: 1 },
    });

    if (existingFeedback.length > 0) {
      console.log(
        `Feedback found for diet_id=${diet_id}, returning 200 with canSubmit:false`
      );
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Feedback already submitted",
        data: {
          canSubmit: false,
          dietId: diet_id,
        },
      });

      return res.status(200).json(apiResponse);
    }

    const { results: existingDiet } = await readRecord({
      table: tables.dietSessionLog,
      selectFields: ["session"],
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      pagination: { page: 1, limit: 1 },
    });

    const session = existingDiet[0].session;

    console.log(
      `No feedback found, returning 200 with canSubmit:true and session=${session}`
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Diet name returned successfully",
      data: {
        canSubmit: true,
        session: session,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in fetching diet name:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getSessionFeedbackByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return next(new ErrorHandler("Missing user_id", 400));
    }

    // Fetch feedback entries ordered by latest program (sop.sub_order_id DESC)
    const { results: feedbackEntries } = await readRecord({
      selectFields: [
        "df.session",
        "df.result",
        "pm.program_name",
        "sop.sub_order_id",
      ],
      table: `${tables.dietFeedback} df`,
      joins: [
        {
          type: "INNER",
          table: `${tables.dietSessionLog} dsl`,
          on: "df.diet_id = dsl.diet_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "dsl.sub_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
      ],
      conditions: [
        {
          field: "dsl.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      orderBy: ["sop.sub_order_id DESC", "df.session ASC"],
    });

    const responseData = {};

    for (const row of feedbackEntries) {
      console.log("Row:", row);

      const programName = row.program_name || "Unknown Program";
      const sessionKey = `session_${row.session}`;

      let sessionData = {};
      try {
        sessionData = JSON.parse(row.result);
      } catch (err) {
        console.warn(
          `Invalid JSON in result for session ${row.session}:`,
          row.result
        );
        continue;
      }

      if (!responseData[programName]) {
        responseData[programName] = {};
      }
      responseData[programName][sessionKey] = sessionData;
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Feedback fetched successfully",
      data: responseData,
    });

    return res.status(200).json(apiResponse);
  } catch (err) {
    console.error("Error in getSessionFeedbackByUserId:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFeedbackAck = async (req, res, next) => {
  try {
    const { diet_id } = req.body;

    // if (!diet_id) {
    //   return res.status(400).json(
    //     new ApiResponse({
    //       statusCode: 400,
    //       message: "diet_id is required",
    //       data: {},
    //     })
    //   );
    // }

    const { results: feedbackRows } = await readRecord({
      selectFields: ["diet_id"],
      table: tables.dietFeedback,
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      pagination: { page: 1, limit: 1 },
    });

    if (!feedbackRows.length) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No diet_feedback found with the provided diet_id",
        data: {},
      });
      return res.status(200).json(apiResponse);
    }

    const updateResult = await updateRecord(
      tables.dietFeedback,
      {
        is_ack: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { diet_id }
    );

    // if (updateResult.affectedRows === 0) {
    //   return res.status(500).json(
    //     new ApiResponse({
    //       statusCode: 500,
    //       message: "Failed to update feedback",
    //       data: {},
    //     })
    //   );
    // }

    const { results: updatedRows } = await readRecord({
      selectFields: ["diet_id", "is_ack"],
      table: tables.dietFeedback,
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      pagination: { page: 1, limit: 1 },
    });

    const updated = updatedRows[0];

    // return res.status(200).json(
    //   new ApiResponse({
    //     statusCode: 200,
    //     message: "Feedback acknowledged successfully",
    //     data: {
    //       diet_id: updated.diet_id,
    //       session: updated.session,
    //       is_ack: updated.is_ack,
    //     },
    //   })
    // );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Updated the feedback successfully",
      data: {
        diet_id: updated.diet_id,
        is_ack: updated.is_ack,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (err) {
    console.error("Error in storing the details:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getResult = async (req, res, next) => {
  try {
    const { diet_id } = req.query;

    const { results: existingFeedback } = await readRecord({
      table: tables.dietFeedback,
      selectFields: ["result", "created_at"],
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      pagination: { page: 1, limit: 1 },
    });

    if (existingFeedback.length > 0) {
      const createdAtRaw = existingFeedback[0].created_at;
      const createdAt = moment(createdAtRaw).format("DD MMMM YYYY");
      let feedbackResult = existingFeedback[0].result;

      try {
        feedbackResult = JSON.parse(feedbackResult);
      } catch (parseError) {
        console.error("Error parsing feedback result:", parseError);
        return next(new ErrorHandler("Invalid result format", 500));
      }

      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Fetched the results",
        data: { data: feedbackResult, date: createdAt },
      });

      return res.status(200).json(apiResponse);
    } else {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No data found",
      });
      return res.status(200).json(apiResponse);
    }
  } catch (error) {
    console.error("Error in fetching data:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  insertInTable,
  dietFeedback,
  getDietname,
  getSessionFeedbackByUserId,
  getFeedbackAck,
  getResult,
};
