import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import {
  addAmountWallet,
  calculateBMI,
  calculateIdealWeight,
  calculateTotalHealthScore,
  processHeight,
  processWeight,
} from "../helper/common.js";
import ejs from "ejs";
import path from "path";
import { image_guide_base_url, sources, tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import generateEmailContent from "./healthScoreTemplate.js";
import {
  addSaleStatusLogNew,
  addSourceLogNew,
  addStageLogNew,
  addStatusLogNew,
} from "./salesDashboardControllers/leadsController.js";
import { addAutoDraftedQuery } from "./common.js";
import { safeJSONParse } from "../helper/commonHelper.js";
import axios from "axios";

const addHealthScore = async (req, res, next) => {
  try {
    let {
      user_id,
      sub_order_id,
      type,
      phone_code,
      phone_number,

      last_name,
      age,
      gender,
      body_shape,
      goal_weight: goalWeightInput,
      health_issues,
      sleep_duration,
      activity_level,
      alcohol_frequency,
      smoking_frequency,
      food_preferences,
      water_frequency,
      veg_fruits_frequency,
      goals,
      source,
      periods_frequency,
      weight: weightInput,
      height: heightInput,
      utm_source,
    } = req.body;

    let { first_name } = req.body;

    let { email_id } = req.body;

    if (!user_id && !email_id) {
      return next(new ErrorHandler("user_id or email_id is required", 400));
    }
    if (!type || !weightInput || !heightInput) {
      return next(
        new ErrorHandler("type, weight, and height are required", 400)
      );
    }
    const cleanedNumber = phone_number?.replace(/\D/g, "");
    if (!email_id) {
      email_id = `${cleanedNumber}@bn.com`;
    }
    if (!first_name) {
      first_name = "No Name";
    }
    const parseNumericValue = (input) => {
      if (!input || (typeof input !== "string" && typeof input !== "number")) {
        return null;
      }
      const cleanedInput = input.toString().replace(/[^0-9.]/g, "");

      const num = Number(cleanedInput);
      return isNaN(num) ? null : num;
    };

    const weight = parseNumericValue(weightInput);
    // const height = parseNumericValue(heightInput);
    const height = heightInput;
    const goal_weight = parseNumericValue(goalWeightInput);
    console.log(weight, height, 68);

    if (weight === null || height === null) {
      return next(new ErrorHandler("Invalid weight or height", 400));
    }
    const bmi = calculateBMI(weight, height);

    const ideal_weight = calculateIdealWeight(height, gender);
    const idealBMI = Number(
      (ideal_weight / Math.pow(processHeight(height), 2)).toFixed(2)
    );
    console.log(ideal_weight, Math.pow(processHeight(height), 2), height, 97);
    const { score } = calculateTotalHealthScore({
      activity_level,
      alcohol_frequency,
      health_issues,
      sleep_duration,
      smoking_frequency,
      veg_fruits_frequency,
      water_frequency,
    });
    // console.log(score, 68);
    // console.log(idealBMI, 97);
    // console.log(ideal_weight, 98);
    // return false;
    let db_user_id = user_id;
    let user_status = null;
    const weightDiff = Number(weight) - Number(ideal_weight);
    let userDetails = [];
    if (email_id || user_id) {
      const conditionsOther = user_id
        ? [{ field: "ud.user_id", operator: "=", value: user_id }]
        : [
            {
              orConditions: [
                { field: "ud.email_id", operator: "=", value: email_id },
                {
                  field: "ud.phone_number",
                  operator: "=",
                  value: phone_number,
                },
              ],
            },
          ];
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.user_id",
          "ud.user_status",
          "sop.order_type",
          "ad.official_phone as mentor_phone",
          "ad.active",
          "ad.email_id as mentor_email",
          "ad2.official_phone as counsellor_phone",
          "ud.first_name",
          "ad2.email_id as counsellor_email",
          "ud.mentor_assigned",
          "sop.sent_sessions",
          "DATEDIFF(NOW(), sop.start_date) as days_passed",
          "hs.overall_health_score",
          `(SELECT goal_weight from ${tables.assessment_personal_details} aspd WHERE aspd.user_id = ud.user_id ORDER BY aspd.added_date DESC LIMIT 1) as goal_weight`,
          "sop.start_program_weight",
          "ud.my_wallet",
          "hs.body_mass_index as last_bmi",
          "hs.ideal_weight",
          "mg.comment as goal_comment",
          "apm.program_name as advance_program_name",
          "aps.program_duration as advance_program_duration",
          "ud.suggested_program_id",
          "spm.program_name as suggested_program_name",
          "sps.program_duration as suggested_program_duration",
          "pr.photo_id",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ud.mentor_assigned = ad.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad2`,
            on: "ud.counsellor_assigned = ad2.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hs`,
            on: `sop.sub_order_id = hs.sub_order_id ${
              Number(type) === 1
                ? "AND hs.type = 0"
                : Number(type) === 2
                ? " AND hs.type= 1"
                : ""
            }`,
          },
          {
            type: "LEFT",
            table: `${tables.bnMyGoalsNew} mg`,
            on: "ud.user_id = mg.user_id AND ud.active_order_id = mg.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop2`,
            on: `ud.user_id = sop2.user_id AND sop2.sub_order_id != ud.active_order_id AND sop2.program_status = '4'`,
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} apm`,
            on: `sop2.program_id = apm.program_id`,
          },
          {
            type: "LEFT",
            table: `${tables.programSession} aps`,
            on: "sop2.program_session_id = aps.program_session_id",
          },
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: `ud.suggested_program_id = sp.suggested_program_id`,
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} spm`,
            on: `sp.program_id = spm.program_id`,
          },
          {
            type: "LEFT",
            table: `${tables.programSession} sps`,
            on: `sp.program_session_id = sps.program_session_id`,
          },
          {
            type: "LEFT",
            table: `${tables.photoRecords} pr`,
            on: "ud.user_id = pr.user_id AND sop.sub_order_id = pr.sub_order_id AND pr.session = sop.sent_sessions AND pr.days=10",
          },
        ],
        conditions: conditionsOther,
        orderBy: ["ud.added_date DESC"], // <-- or created_at, whichever exists
        pagination: { limit: 1 },
      });
      userDetails = [...results];
      if (
        type == "0" &&
        results.length > 0 &&
        userDetails[0]?.user_status === "Completed"
      ) {
        type = "3";
      }
      // console.log(userDetails);
      // return;
      const { results: countryResults } = await readRecord({
        table: `${tables.countries} c`,
        selectFields: ["c.country_id"],
        conditions: [
          { field: "c.phonecode", operator: "=", value: phone_code },
        ],
      });

      let source_utm = null;
      if (results.length === 0) {
        if (!phone_code || !phone_number || !first_name || !last_name) {
          return next(
            new ErrorHandler("Required fields missing for new user", 400)
          );
        }
        if (utm_source) {
          const { results: lead_source } = await readRecord({
            table: `${tables.leadSource}`,
            selectFields: ["*"],
            conditions: [
              { field: "source_name", operator: "=", value: utm_source },
            ],
          });
          source_utm = lead_source[0].source_id;
        }
        const country_id = countryResults.length
          ? countryResults[0].country_id
          : null;
        const columns = [
          "first_name",
          "last_name",
          "gender",
          "email_id",
          phone_code ? "phone_code" : null,
          phone_number ? "phone_number" : null,
          phone_number ? "phone" : null,
          "country_id",
          "health_conditions",
          "primary_lead_source",
          "current_lead_source",
          "sales_status",
          "height",
          goal_weight ? "goal_weight" : null,
          "stage",
          "current_primary_lead_source",
          "user_status",
          "start_weight",
          "latest_weight",
        ].filter(Boolean);

        const values = [
          first_name,
          last_name,
          String(gender).toLowerCase() === "male"
            ? "1"
            : String(gender).toLowerCase() === "female"
            ? "2"
            : "0",
          email_id || `${cleanedNumber}@bn.com`,
          phone_code ? phone_code : null,
          phone_number ? phone_number : null,
          phone_number ? `${phone_code} ${phone_number}` : null,
          country_id,
          health_issues?.length
            ? JSON.stringify(
                Array.isArray(health_issues)
                  ? health_issues
                  : health_issues.split(",")
              )
            : null,
          source_utm ? source_utm : weightDiff > 15 ? 2 : 1,
          source_utm ? source_utm : weightDiff > 15 ? 2 : 1,
          weightDiff > 15 || (weightDiff >= 7 && weightDiff <= 15) ? "2" : "0",
          height,
          goal_weight,
          weightDiff > 15
            ? 4
            : weightDiff >= 7
            ? 3
            : weightDiff <= 7
            ? 2
            : weightDiff >= 0
            ? 1
            : 0,
          weightDiff > 15 ? 2 : 1,
          "Lead",
          weightInput,
          weightInput,
        ].filter(Boolean);

        const insertResult = await insertRecord(
          tables.userDetails,
          columns,
          values
        );

        console.log(insertResult, 462);
        //  console.log(insertResult,462);
        // return;
        if (!insertResult || insertResult.affectedRows === 0) {
          return next(new ErrorHandler("Error inserting new lead", 500));
        }

        await Promise.all([
          addSaleStatusLogNew({ sales_status: "0", id: insertResult.insertId }),
          addStatusLogNew({
            status: "Lead",
            sub_status: "Inactive",
            id: insertResult.insertId,
          }),
          addSourceLogNew({
            source: sources[weightDiff > 7 ? 2 : 1],
            id: insertResult.insertId,
          }),
          addStageLogNew({
            stage:
              weightDiff > 15
                ? 4
                : weightDiff >= 7
                ? 3
                : weightDiff <= 7
                ? 2
                : weightDiff >= 0
                ? 1
                : 0,
            id: insertResult.insertId,
          }),
          insertRecord(
            tables.weightRecordsLead,
            ["user_id", "weight"],
            [insertResult.insertId, weightInput]
          ),
        ]);

        db_user_id = insertResult.insertId;
        user_status = "Lead";
      } else {
        db_user_id = results[0].user_id;
        user_status = results[0].user_status;
        addSourceLogNew({
          source: sources[weightDiff > 7 ? 2 : 1],
          id: db_user_id,
        });
        addStageLogNew({
          stage:
            weightDiff > 15
              ? 4
              : weightDiff >= 7
              ? 3
              : weightDiff <= 7
              ? 2
              : weightDiff >= 0
              ? 1
              : 0,
          id: db_user_id,
        });
        insertRecord(
          tables.weightRecordsLead,
          ["user_id", "weight"],
          [db_user_id, weightInput]
        );
      }
      if (
        userDetails.length > 0 &&
        userDetails[0].user_status === "Lead" &&
        email_id
      ) {
        const updateData = {
          current_lead_source: source_utm || weightDiff > 15 ? 2 : 1,
        };
        if (email_id) updateData.email_id = email_id;
        if (gender) {
          updateData.gender =
            String(gender).toLowerCase() === "male"
              ? "1"
              : String(gender).toLowerCase() === "female"
              ? "2"
              : "0";
        }
        if (height) updateData.height = height;
        if (weightInput) updateData.latest_weight = weightInput;
        if (goal_weight) updateData.goal_weight = goal_weight;
        if (Object.keys(updateData).length > 0) {
          await updateRecord(tables.userDetails, updateData, {
            user_id: userDetails[0].user_id,
          });
        }
      }
    }

    // Calculate health category and score adjustments
    let category, pointAdjustment, percentage;
    if (bmi <= 18.49) {
      category = "underweight";
      pointAdjustment = 2;
    } else if (bmi >= 18.5 && bmi <= 24.99) {
      category = "normal weight";
      pointAdjustment = 2;
    } else if (bmi >= 25.0 && bmi <= 29.99) {
      category = "overweight";
      pointAdjustment = 5;
    } else {
      category = "obese";
      pointAdjustment = 7;
    }

    if (["obese", "overweight"].includes(category)) {
      percentage = score > 60 ? score - 20 : score > 25 ? score - 10 : score;
    } else {
      percentage = score;
    }
    percentage =
      bmi >= 18.5 && bmi <= 24.99
        ? percentage + pointAdjustment
        : percentage - pointAdjustment;
    console.log(percentage, 254);
    // Insert health score

    const columns = [
      "user_id",
      sub_order_id ? "sub_order_id" : null,
      "type",
      gender ? "gender" : null,
      age ? "age" : null,
      "height",
      "weight",
      goal_weight ? "goal_weight" : null,
      health_issues?.length ? "health_issue" : null,
      body_shape ? "body_shape" : null,
      "sleep_duration",
      "activity_level",
      "smoke_frequency",
      "alcohol_frequency",
      food_preferences ? "food_preferences" : null,
      "water_frequency",
      "veg_fruits_frequency",
      goals?.length ? "goals" : null,
      "email",
      "source",
      "body_mass_index",
      "ideal_weight",
      "weight_difference",
      "overall_health_score",
      "health_category",
      "ideal_bmi",
      periods_frequency ? "periods" : null,
    ].filter(Boolean);

    const values = [
      db_user_id,
      sub_order_id || null,
      type,
      gender || null,
      age || null,
      height,
      weight,
      goal_weight || null,
      health_issues?.length
        ? JSON.stringify(
            Array.isArray(health_issues)
              ? health_issues
              : health_issues.split(",")
          )
        : null,
      body_shape || null,
      sleep_duration,
      activity_level,
      smoking_frequency,
      alcohol_frequency,
      food_preferences || null,
      water_frequency,
      veg_fruits_frequency,
      goals?.length
        ? JSON.stringify(Array.isArray(goals) ? goals : goals.split(","))
        : null,
      email_id || `${cleanedNumber}@bn.com`,
      source,
      bmi,
      ideal_weight,
      ideal_weight - weight === 0 ? "0" : ideal_weight - weight,
      percentage,
      category,
      idealBMI,
      periods_frequency || null,
    ].filter(Boolean);

    const insertedResult = await insertRecord(
      tables.healthScoreClient,
      columns,
      values
    );
    if (!insertedResult || insertedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while inserting health score", 500));
    }
    addStageLogNew({
      stage:
        weightDiff > 15
          ? 4
          : weightDiff >= 7
          ? 3
          : weightDiff <= 7
          ? 2
          : weightDiff >= 0
          ? 1
          : 0,
      id: db_user_id,
    });
    // Wallet logic
    let wallet_amount = 0;
    let wallet_reason = "";

    const typeNum = Number(type);
    if (typeNum === 1) {
      wallet_amount = 500;
      wallet_reason = "Half Time HS";
    } else if (typeNum === 2) {
      wallet_amount = 500;
      wallet_reason = "Program HS";
    } else if (typeNum === 0 && user_status === "Lead") {
      wallet_amount = 600;
      wallet_reason = "Health Score";
    }
    if (wallet_amount > 0) {
      await addAmountWallet({
        user_id: db_user_id,
        amount: wallet_amount,
        reason: wallet_reason,
      });
    }
    let motivation_text = "";
    let old_motivation_text = "";
    let hs_color = "";
    if (percentage >= 90) {
      hs_color = "#216F35";
      motivation_text = "Excellent";
    } else if (percentage >= 71 && percentage <= 89) {
      hs_color = "#AAD53A";
      motivation_text = "Very Good";
    } else if (percentage >= 51 && percentage <= 70) {
      hs_color = "#F4AF2D";
      motivation_text = "Can Do Better";
    } else if (percentage >= 31 && percentage <= 50) {
      hs_color = "#9F6B09";
      motivation_text = "Needs Attention";
    } else if (percentage <= 30) {
      hs_color = "#E72A21";
      motivation_text = "Act NOW!";
    }

    if (userDetails[0]?.overall_health_score >= 90) {
      old_motivation_text = "Excellent";
    } else if (
      userDetails[0]?.overall_health_score >= 71 &&
      userDetails[0]?.overall_health_score <= 89
    ) {
      old_motivation_text = "Very Good";
    } else if (
      userDetails[0]?.overall_health_score >= 51 &&
      userDetails[0]?.overall_health_score <= 70
    ) {
      old_motivation_text = "Can Do Better";
    } else if (
      userDetails[0]?.overall_health_score >= 31 &&
      userDetails[0]?.overall_health_score <= 50
    ) {
      old_motivation_text = "Needs Attention";
    } else if (userDetails[0]?.overall_health_score <= 30) {
      old_motivation_text = "Act NOW!";
    }
    console.log(motivation_text, 431);

    const mailData = {};
    mailData.to = `${first_name} <${email_id || userDetails[0].email_id}>`;
    (mailData.bcc = [
      "krishna.sidhpura@balancenutrition.in",
      "info@balancenutrition.in",
      "testerteam@balancenutrition.in",
    ]),
      (mailData.cc = []),
      (mailData.subject = `Your BN Health Score Result ${
        Number(type) === 1
          ? "(Mid Progress Report)"
          : Number(type) === 2
          ? "(Program Progress Report)"
          : Number(type) === 3
          ? "(Completed)"
          : ""
      }`);
    mailData.body = generateEmailContent({
      weight_color: weightDiff <= 0 ? "#f2000d" : "#38a169",
      weight_difference: Math.abs(weightDiff.toFixed(2)),
      health_category: category,
      current_weight: weightInput,
      ideal_weight: ideal_weight,
      bmi,
      health_score: percentage,
      health_score_category: motivation_text,
      calculated_top: percentage,
      hs_color: hs_color,
      counsellor_phone:
        userDetails[0]?.user_status === "Lead"
          ? userDetails[0].counsellor_phone || 7021960648
          : null,
      user_name:
        userDetails[0]?.user_status === "Lead"
          ? `${userDetails[0].first_name}`
          : null,
    });
    if (userDetails.length === 0) {
      const { results } = await readRecord({
        selectFields: ["*"],
        table: `${tables.adminUsers} ad`,
        conditions: [
          { field: "ad.role_id", operator: "=", value: "2" },
          { field: "ad.is_active", operator: "=", value: "1" },
        ],
      });
      const counsellor_emails = results.map((user) => user.email_id);
      mailData.bcc.push(...counsellor_emails);
    } else {
      if (userDetails[0].user_status === "Lead") {
        mailData.bcc.push(
          userDetails[0]?.counsellor_email ||
            "krishna.sidhpura@balancenutrition.in,mansi.babhulgaonkar@balancenutrition.in,	sanjana.dhakad@balancenutrition.in"
        );
      } else if (userDetails[0]?.user_status !== "Lead") {
        const { hs } = safeJSONParse(userDetails[0]?.active);

        if (Number(type) === 1 || Number(type) === 2) {
          mailData.cc.push(userDetails[0]?.mentor_email);
          mailData.bcc = hs.cc;
          mailData.bcc.push("khyati.rupani@balancenutrition.in");
        } else {
          mailData.cc = userDetails[0]?.mentor_email;
          mailData.bcc = hs.bcc;
          if (Number(type) === 3) {
            mailData.bcc.push("khyati.rupani@balancenutrition.in");
          }
        }
      }
    }
    console.log(source, 13131313);
    if (
      req.headers.source === "web" ||
      req.headers.source === "app" ||
      source === "ios"
    ) {
      const mail = await sendMailUtil({
        to: mailData.to,
        from: "Balance Nutrition <info@balancenutrition.in>",
        cc: mailData.cc,
        bcc: mailData.bcc,
        subject: mailData.subject,
        html: mailData.body,
      });
      console.log(mail, 443);
    }
    const goal_comment = safeJSONParse(userDetails[0]?.goal_comment, {
      goals_achieved: [],
      milestone_achieved: [],
      new_goals: [],
      pending_goals: [],
    }).new_goals;
    let goal_text = "";
    if (goal_comment.length > 0) {
      goal_text += `<p>You have also set new goals, which we spoke about. I am enlisting them here.`;
      goal_text += `<ol>`;
      goal_comment.forEach((goal) => {
        goal_text += `<li>${goal}</li>`;
      });
      goal_text += `</ol>`;
      goal_text += `</p>`;
    }
    let program_text = "";
    if (userDetails[0]?.advance_program_name) {
      program_text = `<p>We Have A ${userDetails[0]?.advance_program_duration} ${userDetails[0]?.advance_program_name} Program To Go After You Complete The Sessions Of This Program. We Will Continue To Work On Your Goals & Ideal Weight :)
</p>`;
    } else if (userDetails[0]?.suggested_program_name) {
      program_text = `<p> For further progress & to get to our goals, I have already recommended the ${userDetails[0]?.suggested_program_duration} ${userDetails[0]?.suggested_program_name} Program to you.Check the current offers on the same here <a href=""></a><p>`;
    }
    let photo_text = "";
    if (!userDetails[0]?.photo_id) {
      photo_text =
        "P.S. If you send me your recent photo, I can make more out of our overall progress & plan your next sessions with a lot more precision.";
    }
    let hs_text = "";
    if (percentage < userDetails[0]?.overall_health_score) {
      hs_text = `<p>Your health score has not improved too & it remains at ${percentage} & in the ${motivation_text} Category</p>`;
    } else if (percentage > userDetails[0]?.overall_health_score) {
      hs_text = `<p>Your health score has improved by ${
        percentage - userDetails[0]?.overall_health_score
      } points but there is no category progress & we are still at ${motivation_text} category</p>`;
    }
    if (Number(type) === 1) {
      let query = ``;
      if (weightInput - userDetails[0]?.start_program_weight > 0) {
        query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi ${userDetails[0]?.first_name},</p>

  <p>
    Great to see you filled out the <strong>mid-program health score</strong> questions & got your report in the app.
  </p>

  <p>
    In ${userDetails[0]?.sent_sessions} sessions (${
          userDetails[0]?.days_passed
        } days), you have lost ${
          weightInput - userDetails[0]?.start_program_weight
        } kg which is very good given all our efforts & priorities.
  </p>
  <p>
    Your health score has improved by ${
      percentage - userDetails[0]?.overall_health_score
    } points
  </p>
  <p>
    Let's connect on a quick call to discuss this progress report & how to ensure the rest of our sessions are more aligned towards achieving the best results!
  </p>

  <p>
    Book your Mid-Program Progress Call :  https://www.balancenutrition.in/app_link/screen_id=29/call_type=1
  </p>

 
</div>
`;
      } else {
        query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi ${userDetails[0]?.first_name},</p>

  <p>
    Yes, I have seen your comparative health score report for this program. In ${
      userDetails[0]?.sent_sessions
    } sessions (${
          userDetails[0]?.days_passed
        } days), we have not lost weight & nor do we see any positive changes in your B.M.I and other parameters.
  </p>

  <p>
    I am always worried about your progress & also keep trying to do all I can in my capacity to ensure we see good results.
  </p>

  <p>
    We still have half of this program pending. We can still see great results.
  </p>

  <p>
    If you remember, you had set your Goal Weight in the Assessment as ${
      userDetails[0]?.goal_weight - weightInput
    } kg. We have ${userDetails[0]?.pending_session} sessions pending & ${
          goal_weight - weightInput
        } kg more to lose to get here.
  </p>

  <p>
    I want to discuss this at length with you. Please book a call with me at your earliest convenience: https://www.balancenutrition.in/app_link/screen_id=29/call_type=1
  </p>

  <p>
    Let's make the rest of the program better!
  </p>
</div>
`;
      }
      const addAutoDraftResponse = addAutoDraftedQuery({
        user_id: user_id,
        mentor_id: userDetails[0].mentor_assigned,
        query: query,
      });
    } else if (Number(type) === 2) {
      let query = ``;
      console.log(weightInput, userDetails[0]?.start_program_weight, 777);
      if (weightInput - userDetails[0]?.start_program_weight > 0) {
        query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">

  <p>Hi ${userDetails[0]?.first_name},</p>

  <p>It is time for a progress check once again :) I have got your health score report.</p>

  <p>
    For This Program So Far, In ${userDetails[0]?.sent_sessions} Sessions 
    (${userDetails[0]?.days_passed} Days), You Have Lost {weight_loss} Kg & 
    Your B.M.I Also Has Improved From ${userDetails[0]?.last_bmi} kg/M2 
    To ${bmi} Kg/M2
  </p>

  <p>
    Your Health Score Also Has Improved By 
    ${percentage - userDetails[0]?.overall_health_score} Points & Is Now In The 
    <strong>${motivation_text}</strong> Category from the older 
    <strong>${old_motivation_text}</strong> Category
  </p>

  ${goal_comment.length > 0 ? goal_text : ""}

  <p>
    If We Have To Take Stock Of Your Overall Progress &amp; Health, We Have Done 
    Well So Far & If Compared To Ideal Weight, There Is Still 
    ${ideal_weight - weightInput} Kg That We Have To Lose. BMI Also Must Be 
    Below 25kg/M2
  </p>

  ${health_issues.length > 0 ? health_issue_text : ""}

  ${program_text}

  <p>
    In the coming few days, you will get a notification to rate the program. 
    Do leave your feedback.
  </p>

  <p>
    Though you will get a notification to schedule a call with me to discuss your 
    progress as well, feel free to click here &amp; schedule it at your convenience
  </p>

  ${photo_text}

  <p>Talk to you soon :)</p>

</div>`;
      } else {
        query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi ${userDetails[0]?.first_name},</p>

  <p> I, too, received a copy of your health score report.  In this program so far, in ${
    userDetails[0]?.sent_sessions
  } sessions (${
          userDetails[0]?.days_passed
        } days),we haven't seen any weight loss, unfortunately. 
</p>

  <p>${hs_text}</p>

	
	${goal_text}

  If We Have To Take Stock Of Your Overall Progress &amp Health, We Have Done Well So Far &amp If Compared To Ideal Weight, There Is Still ${
    ideal_weight - weightInput
  } Kg That We Have To Lose. BMI Also Must Be Below 25kg/M2

  

  <p>
    In the coming few days, you will get a notification to rate the program. 
    Do leave your feedback.
  </p>

  <p>
    Though you will get a notification to schedule a call with me to discuss your 
    progress as well, feel free to click here &amp; schedule it at your convenience
  </p>

  ${photo_text}

  <p>Talk to you soon :)</p>
</div>`;
      }
      console.log(query, 864);
      const addAutoDraftResponse = addAutoDraftedQuery({
        user_id: user_id,
        mentor_id: userDetails[0].mentor_assigned,
        query: query,
      });
      console.log(addAutoDraftResponse, 653);
    }
    const apiresponse = new ApiResponse({
      statusCode: 201,
      message: "Health Score added successfully",
      data: {
        ideal_weight,
        bmi,
        health_score: percentage,
        current_weight: weightInput,
        health_category: category,
        weight_difference: Math.abs(weightDiff.toFixed(2)),
      },
      meta_data: {
        wallet_amount: wallet_amount > 0 ? wallet_amount : null,
      },
    });
    return res.status(201).json(apiresponse);
  } catch (error) {
    console.error("Error in addHealthScore:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getHealthScoreReport = async (req, res, next) => {
  try {
    const { user_id, email_id } = req.query;

    // Fetch health score data
    const { results } = await readRecord({
      table: `${tables.healthScoreClient} hs`,
      selectFields: [
        "hs.weight",
        "hs.ideal_weight",
        "hs.body_mass_index",
        "hs.overall_health_score",
        "hs.health_category",
        "hs.goal_weight",
      ],
      conditions: [
        {
          orConditions: [
            { field: "hs.user_id", operator: "=", value: parseInt(user_id) },
            { field: "hs.email", operator: "=", value: email_id },
          ],
        },
        {
          field: "hs.created",
          operator: "IN",
          value: `(SELECT MAX(created) FROM ${
            tables.healthScoreClient
          } WHERE user_id = ${parseInt(user_id)})`,
          raw: true,
        },
      ],
    });

    const { results: users } = await readRecord({
      selectFields: [
        "CONCAT(ad.first_name,' ',ad.last_name) as mentor_name",
        "ad.photo as mentor_photo",
        "ad.designation as mentor_designation",
        "ad.official_phone as mentor_phone",
        "ud.user_status",
        "ud.user_type",
      ],
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });

    const userDetails = users[0];

    if (results.length === 0) {
      return next(new ErrorHandler("No Health Score found for this user", 404));
    }

    let hs_color;
    let motivation_text;
    const hs = Number(results[0].overall_health_score);
    if (hs >= 90) {
      hs_color = "#216F35";
      motivation_text = "Excellent";
    } else if (hs >= 71 && hs <= 89) {
      hs_color = "#AAD53A";
      motivation_text = "Very Good";
    } else if (hs >= 51 && hs <= 70) {
      hs_color = "#F4AF2D";
      motivation_text = "Can Do Better";
    } else if (hs >= 31 && hs <= 50) {
      hs_color = "#9F6B09";
      motivation_text = "Needs Attention";
    } else if (hs <= 30) {
      hs_color = "#E72A21";
      motivation_text = "Act NOW!";
    }

    const data = {
      health_score_id: results[0].health_score_id,
      current_weight: Number(Number(results[0].weight).toFixed(2)),
      ideal_weight: Number(Number(results[0].ideal_weight).toFixed(2)),
      health_category: results[0].health_category,
      bmi: Number(Number(results[0].body_mass_index).toFixed(2)),
      extra_weight: Number(
        (Number(results[0].weight) - Number(results[0].ideal_weight)).toFixed(2)
      ),
      bmi_category:
        Number(results[0].body_mass_index) < 18.4
          ? "UnderWeight"
          : Number(results[0].body_mass_index) > 18.5 &&
            Number(results[0].body_mass_index) < 24.99
          ? "Normal"
          : Number(results[0].body_mass_index) > 25.0 &&
            Number(results[0].body_mass_index) < 29.0
          ? "OverWeight"
          : "Obese",
      overall_health_score: Number(
        Number(results[0].overall_health_score).toFixed(2)
      ),
      overall_health_score_color: hs_color,
      mentor_name: userDetails.mentor_name,
      mentor_photo: `https://${image_guide_base_url}/crm_ui/images/${userDetails.mentor_photo}`,
      bmi_color: "#ffa500",
      weight_color: "#ff554f",
      ideal_weight_color: "#e87845",
      goal_weight: results[0].goal_weight
        ? Number(Number(results[0].goal_weight).toFixed(2))
        : null,
      motivation_text: motivation_text,
      interpretation_text: [
        {
          interpretation_content:
            "You are at a stage where your weight & health are calling out for some care & attention.",
        },
        {
          interpretation_content:
            "Your weight especially needs attention & even if you reduce it by 10%, you will see a big difference in your health parameters.",
        },
      ],
      what_should_text: [
        {
          what_should_val:
            '<span style="font-size:19px; font-family: Roboto-Regular;">Start focussing on you program & follow your diet 100%. Be regular!</span>',
        },
        {
          what_should_val:
            '<span style="font-size:19px; font-family: Roboto-Regular;">Drink <b>12 glasses</b> of water, have only 1 tsp. <b>visible sugar</b> each day, 1 fruit & 1 raw vegetable a day.</span>',
        },
        {
          what_should_val: `<span style="font-size:19px; font-family: Roboto-Regular;">Speak to your mentor <b>(${userDetails.mentor_designation} ${userDetails.mentor_name}) @: ${userDetails.mentor_phone}</b> to discuss your score & any steps needed to be taken.</span>`,
        },
      ],
    };
    if (Number(userDetails.user_type) == 0) {
      const { results: callDetails } = await readRecord({
        selectFields: ["*"],
        table: `${tables.callUpdates} cu`,
        conditions: [{ field: "cu.user_id", operator: "=", value: user_id }],
      });
      if (callDetails.length > 0) {
        data.call_button_status = false;
      } else {
        data.call_button_status = true;
      }
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Health Score Report",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in getHealthScoreReport:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getHealthScoreReportByAssessment = async (req, res, next) => {
  const { user_id, assessment_id } = req.body;

  try {
    const { results: assessmentDetails } = await readRecord({
      selectFields: [
        "aspd.gender",
        "aspd.weight",
        "aspd.height",
        "aspd.goal_weight",
        "anal.sleep_duration",
        "anal.activity_level",
        "anal.alcohol_consumption",
        "anal.smoke_frequency",
        "anal.per_day_water_intake",
        "anal.daily_vegetable_consumption",
        "anal.daily_fruits_consumption",
        "JSON_LENGTH(JSON_KEYS(asmh.other_medical_issue)) AS health_issues",
        "asmh.blood_pressure",
        "asmh.cholesterol",
        "asmh.diabetes",
        "asmh.thyroid",
        "asmh.pcos",
        "asmh.fatty_liver",
        "asmh.acidity",
      ],
      table: `${tables.assessment} asm`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: "asm.assessment_id = aspd.assessment_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_nutrition_and_lifestyle} anal`,
          on: "asm.assessment_id = anal.assessment_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_medical_history} asmh`,
          on: "asm.assessment_id = asmh.assessment_id",
        },
      ],
      conditions: [
        { field: "asm.user_id", operator: "=", value: user_id },
        { field: "asm.completion_status", operator: "=", value: "2" },
      ],
      orderBy: ["asm.assessment_id DESC"],
      pagination: { page: 1, limit: 1 },
    });
    const { results: users } = await readRecord({
      selectFields: [
        "cd.gender",
        "cd.latest_weight",
        "cd.height",
        "CONCAT(ad.first_name,' ',ad.last_name) as mentor_name",
        "ad.photo as mentor_photo",
        "ad.designation as mentor_designation",
        "ad.official_phone as mentor_phone",
      ],
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
    if (assessmentDetails.length === 0) {
      return next(new ErrorHandler("No Health Score found for this user", 404));
    }
    const details = assessmentDetails[0];

    const userDetails = users[0];

    // Mapping functions
    const mapActivityLevel = {
      "Moderately active": 12,
      "Lightly active": 7,
      "Very active": 16,
      Sedentary: 4,
    };

    const mapAlcoholConsumption = {
      Never: 14,
      "Quit Since 1 year": 12,
      Occasionally: 7,
      Daily: 0,
    };

    const mapSleepDuration = {
      "Less than 6 hrs (disturbed)": 7,
      "Less than 6 hrs (Peaceful)": 12,
      "6 to 9 hrs": 14,
      "10 >hrs": 4,
    };

    const mapSmokeFrequency = {
      Never: 14,
      "Quit now": 12,
      "A few Times a week": 7,
    };

    const mapWaterIntake = {
      "Less than 4 glasses": 4,
      "Loss than 4 glasses": 4,
      "4-6 glasses": 7,
      "6-12 glasses": 12,
      "12 > glasses": 14,
    };

    const mapVegFruitsConsumption = {
      Rarely: 4,
      Sometimes: 7,
      Daily: 12,
      "Twice a day": 14,
    };

    // Extract values using mappings
    const activityLevel = mapActivityLevel[details.activity_level] || 0;
    const alcoholFrequency =
      mapAlcoholConsumption[details.alcohol_consumption] || 0;
    const sleepDuration = mapSleepDuration[details.sleep_duration] || 0;
    const smokeFrequency = mapSmokeFrequency[details.smoke_frequency] || 0;
    const waterFrequency = mapWaterIntake[details.per_day_water_intake] || 0;
    let vegFruitsFrequency =
      mapVegFruitsConsumption[details.daily_vegetable_consumption] || 0;
    vegFruitsFrequency = Math.max(
      vegFruitsFrequency,
      mapVegFruitsConsumption[details.daily_fruits_consumption] || 0
    );

    // Count health issues
    let healthIssues = details.health_issues || 0;
    const medicalConditions = [
      "blood_pressure",
      "cholesterol",
      "diabetes",
      "thyroid",
      "pcos",
      "fatty_liver",
      "acidity",
    ];

    medicalConditions.forEach((condition) => {
      if (details[condition]) healthIssues++;
    });

    console.log(activityLevel, 2121212121221);
    console.log(alcoholFrequency, 2121212121221);
    console.log(sleepDuration, 2121212121221);
    console.log(smokeFrequency, 2121212121221);
    console.log(waterFrequency, 2121212121221);
    console.log(vegFruitsFrequency, 2121212121221);
    console.log(Array.from({ length: healthIssues }), 2121212121221);

    // Calculate total health score
    const { score } = calculateTotalHealthScore({
      activity_level: activityLevel,
      alcohol_frequency: alcoholFrequency,
      sleep_duration: sleepDuration,
      smoking_frequency: smokeFrequency,
      water_frequency: waterFrequency,
      veg_fruits_frequency: vegFruitsFrequency,
      health_issues: Array.from({ length: healthIssues }),
    });

    console.log(score, 290909090);
    let gender;
    if (userDetails.gender == "1") {
      gender = "male";
    } else {
      gender = "female";
    }
    let bmi = 0;
    let latest_weight = userDetails.latest_weight || details.weight;
    let latest_height = details.height || userDetails.height;
    if (latest_weight && latest_height) {
      bmi = calculateBMI(latest_weight, latest_height);
    }
    let ideal_weight = 0;
    if (latest_height) {
      ideal_weight = calculateIdealWeight(latest_height, gender);
    }
    let idealBMI = 0;
    if (ideal_weight) {
      idealBMI = (
        ideal_weight / Math.pow(processHeight(latest_height), 2)
      ).toFixed(2);
    }
    let category = "";
    let pointAdjustment = 0;
    let percentage = 0;
    if (bmi <= 18.49) {
      category = "underweight";
      pointAdjustment = 2;
    } else if (bmi >= 18.5 && bmi <= 24.99) {
      category = "normal weight";
      pointAdjustment = 2;
    } else if (bmi >= 25.0 && bmi <= 29.99) {
      category = "overweight";
      pointAdjustment = 5;
    } else {
      pointAdjustment = 7;
      category = "obese";
    }

    if (["obese", "overweight"].includes(category) && score > 60) {
      percentage = score - 20;
    } else if (
      ["obese", "overweight"].includes(category) &&
      score > 25 &&
      score < 60
    ) {
      percentage = score - 10;
    } else {
      percentage = score;
    }

    if (bmi >= 18.5 && bmi <= 24.99) {
      percentage = percentage + pointAdjustment;
    } else {
      percentage = percentage - pointAdjustment;
    }
    let bmi_category;
    if (bmi < 18.4) {
      bmi_category = "Underweight";
    } else if (bmi >= 18.5 && bmi <= 24.99) {
      bmi_category = "Normal";
    } else if (bmi >= 25.0 && bmi <= 29.99) {
      bmi_category = "Overweight";
    } else {
      bmi_category = "Obese";
    }
    let hs_color;
    let motivation_text;
    if (percentage >= 90) {
      hs_color = "#216F35";
      motivation_text = "Let’s get fitter & healthier";
    } else if (percentage >= 71 && percentage <= 89) {
      hs_color = "#AAD53A";
      motivation_text = "We’ll work towards getting to excellent";
    } else if (percentage >= 51 && percentage <= 70) {
      hs_color = "#F4AF2D";
      motivation_text = "That’s what we’ll be doing for you";
    } else if (percentage >= 31 && percentage <= 50) {
      hs_color = "#9F6B09";
      motivation_text = "Yes, we will be working it :)";
    } else if (percentage <= 30) {
      hs_color = "#E72A21";
      motivation_text = "Action taken already :)";
    }
    const data = {
      current_weight: parseFloat(userDetails.latest_weight || details.weight),
      ideal_weight: ideal_weight,
      health_category: category,
      bmi: bmi,
      extra_weight: parseFloat(
        (Number(latest_weight) - Number(ideal_weight)).toFixed(2)
      ),
      bmi_category: bmi_category,
      overall_health_score: percentage,
      overall_health_score_color: hs_color,
      mentor_name: userDetails.mentor_name,
      mentor_photo: `https://${image_guide_base_url}/crm_ui/images/${userDetails.mentor_photo}`,
      bmi_color: "#ffa500",
      weight_color: "#ff554f",
      ideal_weight_color: "#e87845",
      goal_weight: details.goal_weight,
      motivation_text: motivation_text,
      interpretation_text: [
        {
          interpretation_content:
            "You are at a stage where your weight & health are calling out for some care & attention.",
        },
        {
          interpretation_content:
            "Your weight especially needs attention & even if you reduce it by 10%, you will see a big difference in your health parameters.",
        },
      ],
      what_should_text: [
        {
          what_should_val:
            '<span style="font-size:19px; font-family: Roboto-Regular;">Start focussing on you program & follow your diet 100%. Be regular!</span>',
        },
        {
          what_should_val:
            '<span style="font-size:19px; font-family: Roboto-Regular;">Drink <b>12 glasses</b> of water, have only 1 tsp. <b>visible sugar</b> each day, 1 fruit & 1 raw vegetable a day.</span>',
        },
        {
          what_should_val: `<span style=\"font-size:19px; font-family: Roboto-Regular;\">Speak to your mentor <b>(${userDetails.mentor_designation} ${userDetails.mentor_name}) @: ${userDetails.mentor_phone}</b> to discuss your score & any steps needed to be taken.</span>`,
        },
      ],
    };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Health Score Report",
      data: data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const compareMidAndEndHS = async (req, res, next) => {
  const { user_id, email_id } = req.query;
  try {
    const { results: users } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr1`,
          on: "wr1.user_id = cd.user_id and cd.active_order_id = wr1.sub_order_id AND wr1.session = sop.sent_sessions - 1",
        },
      ],
      conditions: [
        { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
        { field: "wr1.days", operator: "=", value: 10 },
      ],
    });
    console.log(users[0], 1301);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No User found",
        data: {},
      });
      return res.status(200).json(apiResponse);
    }

    // Get the latest health score type
    const { results: latestHS } = await readRecord({
      table: `${tables.healthScoreClient} hs`,
      selectFields: [
        "hs.type",
        "hs.weight",
        "hs.ideal_weight",
        "hs.body_mass_index",
        "hs.overall_health_score",
        "hs.health_category",
        "hs.id",
        "hs.goal_weight",
      ],
      conditions: [
        { field: "hs.user_id", operator: "=", value: parseInt(user_id) },
        {
          field: "hs.sub_order_id",
          operator: "=",
          value: users[0].active_order_id,
        },
      ],
      orderBy: ["hs.created DESC"],
      pagination: { limit: 1 },
    });

    let hsStarting, hsLatest;

    if (latestHS.length === 0) {
      // No health scores yet, use assessment as starting
      const { results: assessmentDetails } = await readRecord({
        selectFields: [
          "aspd.gender",
          "aspd.weight",
          "aspd.height",
          "aspd.goal_weight",
          "anal.sleep_duration",
          "anal.activity_level",
          "anal.alcohol_consumption",
          "anal.smoke_frequency",
          "anal.per_day_water_intake",
          "anal.daily_vegetable_consumption",
          "anal.daily_fruits_consumption",
          "JSON_LENGTH(JSON_KEYS(asmh.other_medical_issue)) AS health_issues",
          "asmh.blood_pressure",
          "asmh.cholesterol",
          "asmh.diabetes",
          "asmh.thyroid",
          "asmh.pcos",
          "asmh.fatty_liver",
          "asmh.acidity",
        ],
        table: `${tables.assessment} asm`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.assessment_personal_details} aspd`,
            on: "asm.assessment_id = aspd.assessment_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment_nutrition_and_lifestyle} anal`,
            on: "asm.assessment_id = anal.assessment_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment_medical_history} asmh`,
            on: "asm.assessment_id = asmh.assessment_id",
          },
        ],
        conditions: [
          { field: "asm.user_id", operator: "=", value: user_id },
          {
            field: "asm.assessment_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        orderBy: ["asm.added_date DESC"],
        pagination: { limit: 1 },
      });

      if (assessmentDetails.length === 0) {
        const apiresponse = new ApiResponse({
          statusCode: 200,
          message: "No Assessment or Health Score found for this user",
          data: {},
        });
        return res.status(200).json(apiresponse);
      }

      const details = assessmentDetails[0];
      const mapActivityLevel = {
        "Moderately active": 12,
        "Lightly active": 7,
        "Very active": 16,
        Sedentary: 4,
      };
      const mapAlcoholConsumption = {
        Never: 14,
        "Quit Since 1 year": 12,
        Occasionally: 7,
        Daily: 0,
      };
      const mapSleepDuration = {
        "Less than 6 hrs (disturbed)": 7,
        "Less than 6 hrs (Peaceful)": 12,
        "6 to 9 hrs": 14,
        "10 >hrs": 4,
      };
      const mapSmokeFrequency = {
        Never: 14,
        "Quit now": 12,
        "A few Times a week": 7,
      };
      const mapWaterIntake = {
        "Less than 4 glasses": 4,
        "4-6 glasses": 7,
        "6-12 glasses": 12,
        "12 > glasses": 14,
      };
      const mapVegFruitsConsumption = {
        Rarely: 4,
        Sometimes: 7,
        Daily: 12,
        "Twice a day": 14,
      };

      const activityLevel = mapActivityLevel[details.activity_level] || 0;
      const alcoholFrequency =
        mapAlcoholConsumption[details.alcohol_consumption] || 0;
      const sleepDuration = mapSleepDuration[details.sleep_duration] || 0;
      const smokeFrequency = mapSmokeFrequency[details.smoke_frequency] || 0;
      const waterFrequency = mapWaterIntake[details.per_day_water_intake] || 0;
      let vegFruitsFrequency =
        mapVegFruitsConsumption[details.daily_vegetable_consumption] || 0;
      vegFruitsFrequency = Math.max(
        vegFruitsFrequency,
        mapVegFruitsConsumption[details.daily_fruits_consumption] || 0
      );

      let healthIssues = details.health_issues || 0;
      const medicalConditions = [
        "blood_pressure",
        "cholesterol",
        "diabetes",
        "thyroid",
        "pcos",
        "fatty_liver",
        "acidity",
      ];
      medicalConditions.forEach((condition) => {
        if (details[condition]) healthIssues++;
      });

      const { score } = calculateTotalHealthScore({
        activity_level: activityLevel,
        alcohol_frequency: alcoholFrequency,
        sleep_duration: sleepDuration,
        smoking_frequency: smokeFrequency,
        water_frequency: waterFrequency,
        veg_fruits_frequency: Math.floor(vegFruitsFrequency / 2),
        health_issues: Array.from({ length: healthIssues }),
      });

      const gender = details.gender === "1" ? "male" : "female";
      let bmi = calculateBMI(details.weight, details.height);
      let ideal_weight = calculateIdealWeight(details.height, gender);
      let idealBMI = ideal_weight
        ? (ideal_weight / Math.pow(processHeight(details.height), 2)).toFixed(2)
        : 0;

      let category, pointAdjustment;
      if (bmi <= 18.49) {
        category = "underweight";
        pointAdjustment = 2;
      } else if (bmi >= 18.5 && bmi <= 24.99) {
        category = "normal weight";
        pointAdjustment = 2;
      } else if (bmi >= 25.0 && bmi <= 29.99) {
        category = "overweight";
        pointAdjustment = 5;
      } else {
        category = "obese";
        pointAdjustment = 7;
      }

      let percentage =
        ["obese", "overweight"].includes(category) && score > 60
          ? score - 20
          : ["obese", "overweight"].includes(category) &&
            score > 25 &&
            score < 60
          ? score - 10
          : score;
      percentage =
        bmi >= 18.5 && bmi <= 24.99
          ? percentage + pointAdjustment
          : percentage - pointAdjustment;

      hsStarting = [
        {
          weight: parseFloat(details.weight).toFixed(2),
          ideal_weight: parseFloat(ideal_weight).toFixed(2),
          body_mass_index: parseFloat(bmi).toFixed(2),
          overall_health_score: percentage,
          health_category: category,
          id: "assessment_" + assessmentDetails[0].assessment_id,
          goal_weight: details.goal_weight,
        },
      ];
      hsLatest = [];
    } else if (latestHS[0].type === 1) {
      // Latest is mid-program, compare with assessment
      const { results: assessmentDetails } = await readRecord({
        selectFields: [
          "aspd.gender",
          "aspd.weight",
          "aspd.height",
          "aspd.goal_weight",
          "anal.sleep_duration",
          "anal.activity_level",
          "anal.alcohol_consumption",
          "anal.smoke_frequency",
          "anal.per_day_water_intake",
          "anal.daily_vegetable_consumption",
          "anal.daily_fruits_consumption",
          "JSON_LENGTH(JSON_KEYS(asmh.other_medical_issue)) AS health_issues",
          "asmh.blood_pressure",
          "asmh.cholesterol",
          "asmh.diabetes",
          "asmh.thyroid",
          "asmh.pcos",
          "asmh.fatty_liver",
          "asmh.acidity",
        ],
        table: `${tables.assessment} asm`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.assessment_personal_details} aspd`,
            on: "asm.assessment_id = aspd.assessment_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment_nutrition_and_lifestyle} anal`,
            on: "asm.assessment_id = anal.assessment_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment_medical_history} asmh`,
            on: "asm.assessment_id = asmh.assessment_id",
          },
        ],
        conditions: [
          { field: "asm.user_id", operator: "=", value: user_id },
          {
            field: "asm.assessment_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
      });

      if (assessmentDetails.length === 0) {
        const apiresponse = new ApiResponse({
          statusCode: 200,
          message: "No Assessment found for this user",
          data: {},
        });
        return res.status(200).json(apiresponse);
      }

      const details = assessmentDetails[0];
      const mapActivityLevel = {
        "Moderately active": 12,
        "Lightly active": 7,
        "Very active": 16,
        Sedentary: 4,
      };
      const mapAlcoholConsumption = {
        Never: 14,
        "Quit Since 1 year": 12,
        Occasionally: 7,
        Daily: 0,
      };
      const mapSleepDuration = {
        "Less than 6 hrs (disturbed)": 7,
        "Less than 6 hrs (Peaceful)": 12,
        "6 to 9 hrs": 14,
        "10 >hrs": 4,
      };
      const mapSmokeFrequency = {
        Never: 14,
        "Quit now": 12,
        "A few Times a week": 7,
      };
      const mapWaterIntake = {
        "Less than 4 glasses": 4,
        "4-6 glasses": 7,
        "6-12 glasses": 12,
        "12 > glasses": 14,
      };
      const mapVegFruitsConsumption = {
        Rarely: 4,
        Sometimes: 7,
        Daily: 12,
        "Twice a day": 14,
      };

      const activityLevel = mapActivityLevel[details.activity_level] || 0;
      const alcoholFrequency =
        mapAlcoholConsumption[details.alcohol_consumption] || 0;
      const sleepDuration = mapSleepDuration[details.sleep_duration] || 0;
      const smokeFrequency = mapSmokeFrequency[details.smoke_frequency] || 0;
      const waterFrequency = mapWaterIntake[details.per_day_water_intake] || 0;
      let vegFruitsFrequency =
        mapVegFruitsConsumption[details.daily_vegetable_consumption] || 0;
      vegFruitsFrequency = Math.max(
        vegFruitsFrequency,
        mapVegFruitsConsumption[details.daily_fruits_consumption] || 0
      );

      let healthIssues = details.health_issues || 0;
      const medicalConditions = [
        "blood_pressure",
        "cholesterol",
        "diabetes",
        "thyroid",
        "pcos",
        "fatty_liver",
        "acidity",
      ];
      medicalConditions.forEach((condition) => {
        if (details[condition]) healthIssues++;
      });

      const { score } = calculateTotalHealthScore({
        activity_level: activityLevel,
        alcohol_frequency: alcoholFrequency,
        sleep_duration: sleepDuration,
        smoking_frequency: smokeFrequency,
        water_frequency: waterFrequency,
        veg_fruits_frequency: Math.floor(vegFruitsFrequency / 2),
        health_issues: Array.from({ length: healthIssues }),
      });

      const gender = details.gender === "1" ? "male" : "female";
      let bmi = calculateBMI(details.weight, details.height);
      let ideal_weight = calculateIdealWeight(details.height, gender);
      let idealBMI = ideal_weight
        ? (ideal_weight / Math.pow(processHeight(details.height), 2)).toFixed(2)
        : 0;

      let category, pointAdjustment;
      if (bmi <= 18.49) {
        category = "underweight";
        pointAdjustment = 2;
      } else if (bmi >= 18.5 && bmi <= 24.99) {
        category = "normal weight";
        pointAdjustment = 2;
      } else if (bmi >= 25.0 && bmi <= 29.99) {
        category = "overweight";
        pointAdjustment = 5;
      } else {
        category = "obese";
        pointAdjustment = 7;
      }

      let percentage =
        ["obese", "overweight"].includes(category) && score > 60
          ? score - 20
          : ["obese", "overweight"].includes(category) &&
            score > 25 &&
            score < 60
          ? score - 10
          : score;
      percentage =
        bmi >= 18.5 && bmi <= 24.99
          ? percentage + pointAdjustment
          : percentage - pointAdjustment;

      hsStarting = [
        {
          weight: parseFloat(details.weight).toFixed(2),
          ideal_weight: parseFloat(ideal_weight).toFixed(2),
          body_mass_index: parseFloat(bmi).toFixed(2),
          overall_health_score: percentage,
          health_category: category,
          id: "assessment_" + assessmentDetails[0].assessment_id,
          goal_weight: details.goal_weight,
        },
      ];
      hsLatest = latestHS;
    } else if (latestHS[0].type === 2) {
      // Latest is end-program, compare with mid-program
      const { results: midSession } = await readRecord({
        table: `${tables.healthScoreClient} hs`,
        selectFields: [
          "hs.weight",
          "hs.ideal_weight",
          "hs.body_mass_index",
          "hs.overall_health_score",
          "hs.health_category",
          "hs.id",
          "hs.goal_weight",
        ],
        conditions: [
          { field: "hs.user_id", operator: "=", value: parseInt(user_id) },
          { field: "hs.type", operator: "=", value: 1 },
          {
            field: "hs.sub_order_id",
            operator: "=",
            value: users[0].active_order_id,
          },
        ],
        orderBy: ["hs.created DESC"],
        pagination: { limit: 1 },
      });

      if (midSession.length === 0) {
        const apiresponse = new ApiResponse({
          statusCode: 200,
          message: "No Mid-Program Health Score found for comparison",
          data: {},
        });
        return res.status(200).json(apiresponse);
      }

      hsStarting = midSession;
      hsLatest = latestHS;
    }

    if (
      hsStarting.length === 0 ||
      (hsLatest.length !== 0 && hsLatest[0].id === hsStarting[0].id)
    ) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "No distinct Health Scores found for comparison",
        data: {},
      });
      return res.status(200).json(apiresponse);
    }

    const { results: wr2 } = await readRecord({
      selectFields: ["*"],
      table: `${tables.weightRecords} wr`,
      conditions: [
        { field: "wr.user_id", operator: "=", value: parseInt(user_id) },
        {
          field: "wr.sub_order_id",
          operator: "=",
          value: users[0].active_order_id,
        },
        {
          field: "wr.session",
          operator: "=",
          value: users[0].sent_sessions - 1,
        },
        { field: "wr.days", operator: "=", value: 10 },
      ],
    });

    let message = "";
    const isAssessmentComparison =
      latestHS.length > 0 && latestHS[0].type === 1;
    if (hsLatest.length === 0) {
      message = `<span>This is your initial assessment health score: <b>${hsStarting[0].overall_health_score}</b>. Please take your mid-program health score to track progress.</span>`;
    } else if (
      hsStarting[0].overall_health_score > hsLatest[0].overall_health_score
    ) {
      message = `<span>Your health score has dropped by <b style="color: red;">${
        hsStarting[0].overall_health_score - hsLatest[0].overall_health_score
      } points</b> ${
        isAssessmentComparison
          ? "since your assessment"
          : "since your mid-program health score"
      } & is worrying us. Let's get more serious!</span>`;
    } else {
      message = `<span>Your health score has gained by <b style="color: green;">${
        hsLatest[0].overall_health_score - hsStarting[0].overall_health_score
      } points</b> ${
        isAssessmentComparison
          ? "since your assessment"
          : "since your mid-program health score"
      }.</span>`;
    }

    let start_hs_color,
      today_hs_color,
      start_motivation_text = "",
      today_motivation_text = "";
    const startHS = Number(hsStarting[0].overall_health_score);
    const hs =
      hsLatest.length > 0 ? Number(hsLatest[0].overall_health_score) : null;

    if (startHS >= 90) {
      start_hs_color = "#216F35";
      start_motivation_text = "Excellent";
    } else if (startHS >= 71 && startHS <= 89) {
      start_hs_color = "#AAD53A";
      start_motivation_text = "Very Good";
    } else if (startHS >= 51 && startHS <= 70) {
      start_hs_color = "#F4AF2D";
      start_motivation_text = "Can Do Better";
    } else if (startHS >= 31 && startHS <= 50) {
      start_hs_color = "#9F6B09";
      start_motivation_text = "Needs Attention";
    } else if (startHS <= 30) {
      start_hs_color = "#E72A21";
      start_motivation_text = "Act NOW!";
    }

    if (hs !== null) {
      if (hs >= 90) {
        today_hs_color = "#216F35";
        today_motivation_text = "Excellent";
      } else if (hs >= 71 && hs <= 89) {
        today_hs_color = "#AAD53A";
        today_motivation_text = "Very Good";
      } else if (hs >= 51 && hs <= 70) {
        today_hs_color = "#F4AF2D";
        today_motivation_text = "Can Do Better";
      } else if (hs >= 31 && hs <= 50) {
        today_hs_color = "#9F6B09";
        today_motivation_text = "Needs Attention";
      } else if (hs <= 30) {
        today_hs_color = "#E72A21";
        today_motivation_text = "Act NOW!";
      }
    }

    let bmi_message = "";
    if (hsLatest.length > 0) {
      bmi_message =
        hsStarting[0].body_mass_index < hsLatest[0].body_mass_index
          ? `<span>Your B.M.I has shot up by <b style="color: red;">${(
              hsLatest[0].body_mass_index - hsStarting[0].body_mass_index
            ).toFixed(2)}</b> kg/m² ${
              isAssessmentComparison
                ? "since your assessment"
                : "since your mid-program health score"
            }. I am worried.</span>`
          : `<span>Your B.M.I has dropped by <b style="color: green;">${Math.abs(
              (
                hsLatest[0].body_mass_index - hsStarting[0].body_mass_index
              ).toFixed(2)
            )}</b> kg/m² ${
              isAssessmentComparison
                ? "since your assessment"
                : "since your mid-program health score"
            }</span>`;
    } else {
      bmi_message = `<span>Your initial B.M.I from assessment is <b>${hsStarting[0].body_mass_index.toFixed(
        2
      )}</b> kg/m².</span>`;
    }

    const bmi_category =
      hsLatest.length > 0
        ? Number(hsLatest[0].body_mass_index) < 18.4
          ? "UnderWeight"
          : Number(hsLatest[0].body_mass_index) >= 18.5 &&
            Number(hsLatest[0].body_mass_index) <= 24.99
          ? "Normal"
          : Number(hsLatest[0].body_mass_index) >= 25.0 &&
            Number(hsLatest[0].body_mass_index) <= 29.0
          ? "OverWeight"
          : "Obese"
        : hsStarting[0].health_category.charAt(0).toUpperCase() +
          hsStarting[0].health_category.slice(1);

    let weight_message = "";
    console.log(users[0].weight, wr2[0].weight, 1885);
    if (users.length > 0 && wr2 && wr2.length > 0) {
      weight_message =
        latestHS[0].weight < wr2[0]?.weight
          ? `<span>You have lost <b>${(
              wr2[0]?.weight - latestHS[0].weight
            ).toFixed(2)}</b> kg in session ${
              users[0].sent_sessions - 1
            } <b>(10 days)</b>. Let's aim to get to our target weight soon!</span>`
          : `<span>You have gained <b>${(
              latestHS[0].weight - wr2[0]?.weight
            ).toFixed(2)}</b> kg in session ${
              users[0].sent_sessions - 1
            } <b>(10 days)</b>. Let's aim to get to our target weight soon!</span>.`;
    }

    let bmi_color =
      hsLatest.length > 0 &&
      hsStarting[0].body_mass_index < hsLatest[0].body_mass_index
        ? "#FF0000"
        : "#00FF00";

    const data = {
      hs_details: {
        start_score: hsStarting[0].overall_health_score,
        today_score:
          hsLatest.length > 0 ? hsLatest[0].overall_health_score : null,
        message,
        start_motivation_text,
        today_motivation_text,
        start_hs_color,
        today_hs_color,
      },
      bmi_details: {
        start_bmi: parseFloat(hsStarting[0].body_mass_index).toFixed(2),
        today_bmi:
          hsLatest.length > 0
            ? parseFloat(hsLatest[0].body_mass_index).toFixed(2)
            : null,
        bmi_message,
        points: [
          `<span>Your B.M.I is in the <b>${bmi_category}</b> Category.</span>`,
          `<span>Your Ideal B.M.I should be below <b>25.0 kg/m².</b></span>`,
        ],
        bmi_color,
      },
      weight_details: {
        start_weight: parseFloat(users[0].start_weight).toFixed(2),
        today_weight: parseFloat(hsLatest[0].weight).toFixed(2),
        ideal_weight:
          hsLatest.length > 0
            ? parseFloat(hsLatest[0].ideal_weight).toFixed(2)
            : parseFloat(hsStarting[0].ideal_weight).toFixed(2),
        message: weight_message,
        points: [
          `<span>As per your inputs, you are still ${(
            hsLatest[0]?.weight -
            (hsLatest.length > 0
              ? hsLatest[0]?.ideal_weight
              : hsStarting[0]?.ideal_weight)
          ).toFixed(2)} kg <b>${bmi_category}</b></span>`,
          `<span>Your Ideal Body Weight is: ${
            hsLatest.length > 0
              ? hsLatest[0]?.ideal_weight
              : hsStarting[0]?.ideal_weight
          } kg.</span>`,
        ],
        goal_weight: `Your Goal Weight is: ${parseFloat(
          hsStarting[0].goal_weight
        ).toFixed(2)} kg.`,
      },
      show_button: 0,
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Health Score Report",
      data: data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addLeadHealthScore = async (req, res, next) => {
  try {
    const {
      ideal_weight,
      bmi,
      health_score,
      current_weight,
      health_category,
      weight_difference,
      wallet_amount,
      markerWiseHealthScore,
    } = await submitHealthScore(req.body, true);

    const apiresponse = new ApiResponse({
      statusCode: 201,
      message: "Health Score added successfully",
      data: {
        ideal_weight,
        bmi,
        health_score,
        current_weight,
        health_category,
        weight_difference: Math.abs(weight_difference.toFixed(2)),
        markerWiseHealthScore,
      },
      meta_data: {
        wallet_amount: wallet_amount > 0 ? wallet_amount : null,
      },
    });
    return res.status(201).json(apiresponse);
  } catch (error) {
    console.error("Error in addHealthScore:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function submitHealthScore(healthScoreParameters, isnewHS) {
  const {
    user_id,
    sub_order_id,
    type,
    phone_code,
    phone_number,
    first_name,
    last_name,
    age,
    date_of_birth,
    gender,
    body_shape,
    goal_weight: goalWeightInput,
    health_issues,
    sleep_duration,
    activity_level,
    alcohol_frequency,
    smoking_frequency,
    food_preferences,
    water_frequency,
    veg_fruits_frequency,
    goals,
    source,
    periods_frequency,
    weight: weightInput,
    height: heightInput,
    utm_source,
    junk_food_consumption,
    oldHealthScore,
  } = healthScoreParameters;

  try {
    let { email_id } = healthScoreParameters.email_id;
    let { first_name } = healthScoreParameters.first_name;

    if (!user_id && !email_id) {
      return next(new ErrorHandler("user_id or email_id is required", 400));
    }
    // if (!type || !weightInput || !heightInput) {
    //   return next(
    //     new ErrorHandler("type, weight, and height are required", 400)
    //   );
    // }
    const cleanedNumber = phone_number?.replace(/\D/g, "");
    if (!email_id) {
      email_id = `${cleanedNumber}@bn.com`;
    }
    if (!first_name) {
      first_name = "No Name";
    }
    //Calculate Ideal Weight and BMI for Lead
    const parseNumericValue = (input) => {
      if (!input || (typeof input !== "string" && typeof input !== "number")) {
        return null;
      }
      const cleanedInput = input.toString().replace(/[^0-9.]/g, "");

      const num = Number(cleanedInput);
      return isNaN(num) ? null : num;
    };

    const weight = parseNumericValue(weightInput);
    const height = parseNumericValue(heightInput);
    const goal_weight = parseNumericValue(goalWeightInput);
    console.log(weight, height, 68);

    if (weight === null || height === null) {
      return next(new ErrorHandler("Invalid weight or height", 400));
    }
    const bmi = calculateBMI(weight, height);

    const ideal_weight = calculateIdealWeight(height, gender);
    console.log(ideal_weight, 111111);
    const idealBMI = Number(
      (ideal_weight / Math.pow(processHeight(height), 2)).toFixed(2)
    );
    const weightDiff = Number(weight) - Number(ideal_weight);

    const healthScore = calculateHealthScore({
      weightDiff,
      health_issues,
      activity_level,
      alcohol_frequency,
      sleep_duration,
      smoking_frequency,
      water_frequency,
      veg_fruits_frequency,
      junk_food_consumption,
    });

    let db_user_id = user_id;
    let user_status = null;
    let userDetails = [];
    if (email_id || user_id) {
      const conditionsOther = user_id
        ? [{ field: "ud.user_id", operator: "=", value: user_id }]
        : [
            {
              orConditions: [
                { field: "ud.email_id", operator: "=", value: email_id },
                {
                  field: "ud.phone_number",
                  operator: "=",
                  value: phone_number,
                },
              ],
            },
          ];
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.user_id",
          "ud.user_status",
          "sop.order_type",
          "ad.official_phone as mentor_phone",
          "ad.active",
          "ad.email_id as mentor_email",
          "ad2.official_phone as counsellor_phone",
          "ud.first_name",
          "ad2.email_id as counsellor_email",
          "ud.mentor_assigned",
          "sop.sent_sessions",
          "DATEDIFF(NOW(), sop.start_date) as days_passed",
          "hs.overall_health_score",
          `(SELECT goal_weight from ${tables.assessment_personal_details} aspd WHERE aspd.user_id = ud.user_id ORDER BY aspd.added_date DESC LIMIT 1) as goal_weight`,
          "sop.start_program_weight",
          "ud.my_wallet",
          "hs.body_mass_index as last_bmi",
          "hs.ideal_weight",
          "mg.comment as goal_comment",
          "apm.program_name as advance_program_name",
          "aps.program_duration as advance_program_duration",
          "ud.suggested_program_id",
          "spm.program_name as suggested_program_name",
          "sps.program_duration as suggested_program_duration",
          "pr.photo_id",
          "ud.phone_number",
          "ud.phone_code",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ud.mentor_assigned = ad.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad2`,
            on: "ud.counsellor_assigned = ad2.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hs`,
            on: `sop.sub_order_id = hs.sub_order_id ${
              Number(type) === 1
                ? "AND hs.type = 0"
                : Number(type) === 2
                ? " AND hs.type= 1"
                : ""
            }`,
          },
          {
            type: "LEFT",
            table: `${tables.bnMyGoalsNew} mg`,
            on: "ud.user_id = mg.user_id AND ud.active_order_id = mg.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop2`,
            on: `ud.user_id = sop2.user_id AND sop2.sub_order_id != ud.active_order_id AND sop2.program_status = '4'`,
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} apm`,
            on: `sop2.program_id = apm.program_id`,
          },
          {
            type: "LEFT",
            table: `${tables.programSession} aps`,
            on: "sop2.program_session_id = aps.program_session_id",
          },
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: `ud.suggested_program_id = sp.suggested_program_id`,
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} spm`,
            on: `sp.program_id = spm.program_id`,
          },
          {
            type: "LEFT",
            table: `${tables.programSession} sps`,
            on: `sp.program_session_id = sps.program_session_id`,
          },
          {
            type: "LEFT",
            table: `${tables.photoRecords} pr`,
            on: "ud.user_id = pr.user_id AND sop.sub_order_id = pr.sub_order_id AND pr.session = sop.sent_sessions AND pr.days=10",
          },
        ],
        conditions: conditionsOther,
        orderBy: ["ud.added_date DESC"], // <-- or created_at, whichever exists
        pagination: { limit: 1 },
      });
      userDetails = [...results];

      // console.log(userDetails);
      // return;
      const { results: countryResults } = await readRecord({
        table: `${tables.countries} c`,
        selectFields: ["c.country_id"],
        conditions: [
          { field: "c.phonecode", operator: "=", value: phone_code },
        ],
      });

      if (results.length === 0) {
        // if (!phone_code || !phone_number || !first_name || !last_name) {
        //   return next(
        //     new ErrorHandler("Required fields missing for new user", 400)
        //   );
        // }
        let source_utm = null;
        if (utm_source) {
          const { results: lead_source } = await readRecord({
            table: `${tables.leadSource}`,
            selectFields: ["*"],
            conditions: [
              { field: "source_name", operator: "=", value: utm_source },
            ],
          });
          source_utm = lead_source[0].source_id;
        }
        const country_id = countryResults.length
          ? countryResults[0].country_id
          : null;
        const columns = [
          "first_name",
          "last_name",
          "gender",
          "email_id",
          phone_code ? "phone_code" : null,
          phone_number ? "phone_number" : null,
          phone_number ? "phone" : null,
          "country_id",
          "health_conditions",
          "primary_lead_source",
          "current_lead_source",
          "sales_status",
          "height",
          goal_weight ? "goal_weight" : null,
          "stage",
          "current_primary_lead_source",
          "user_status",
          "start_weight",
          "latest_weight",
        ].filter(Boolean);

        const values = [
          first_name,
          last_name,
          String(gender).toLowerCase() === "male"
            ? "1"
            : String(gender).toLowerCase() === "female"
            ? "2"
            : "0",
          email_id || `${cleanedNumber}@bn.com`,
          phone_code ? phone_code : null,
          phone_number ? phone_number : null,
          phone_number ? `${phone_code} ${phone_number}` : null,
          country_id,
          health_issues?.length
            ? JSON.stringify(
                Array.isArray(health_issues)
                  ? health_issues
                  : health_issues.split(",")
              )
            : null,
          source_utm ? source_utm : weightDiff > 15 ? 2 : 1,
          source_utm ? source_utm : weightDiff > 15 ? 2 : 1,
          weightDiff > 15 || (weightDiff >= 7 && weightDiff <= 15) ? "2" : "0",
          height,
          goal_weight,
          weightDiff > 15
            ? 4
            : weightDiff >= 7
            ? 3
            : weightDiff <= 7
            ? 2
            : weightDiff >= 0
            ? 1
            : 0,
          weightDiff > 15 ? 2 : 1,
          "Lead",
          weightInput,
          weightInput,
        ].filter(Boolean);

        const insertResult = await insertRecord(
          tables.userDetails,
          columns,
          values
        );

        console.log(insertResult, 462);
        //  console.log(insertResult,462);
        // return;
        if (!insertResult || insertResult.affectedRows === 0) {
          return next(new ErrorHandler("Error inserting new lead", 500));
        }

        await Promise.all([
          addSaleStatusLogNew({ sales_status: "0", id: insertResult.insertId }),
          addStatusLogNew({
            status: "Lead",
            sub_status: "Inactive",
            id: insertResult.insertId,
          }),
          addSourceLogNew({
            source: sources[weightDiff > 7 ? 2 : 1],
            id: insertResult.insertId,
          }),
          addStageLogNew({
            stage:
              weightDiff > 15
                ? 4
                : weightDiff >= 7
                ? 3
                : weightDiff <= 7
                ? 2
                : weightDiff >= 0
                ? 1
                : 0,
            id: insertResult.insertId,
          }),
          insertRecord(
            tables.weightRecordsLead,
            ["user_id", "weight"],
            [insertResult.insertId, weightInput]
          ),
        ]);

        db_user_id = insertResult.insertId;
        user_status = "Lead";
      } else {
        db_user_id = results[0].user_id;
        user_status = results[0].user_status;
        addSourceLogNew({
          source: sources[weightDiff > 7 ? 2 : 1],
          id: db_user_id,
        });
        addStageLogNew({
          stage:
            weightDiff > 15
              ? 4
              : weightDiff >= 7
              ? 3
              : weightDiff <= 7
              ? 2
              : weightDiff >= 0
              ? 1
              : 0,
          id: db_user_id,
        });
        insertRecord(
          tables.weightRecordsLead,
          ["user_id", "weight"],
          [db_user_id, weightInput]
        );
      }
    }
    let category, pointAdjustment, percentage;
    if (bmi <= 18.49) {
      category = "underweight";
    } else if (bmi >= 18.5 && bmi <= 24.99) {
      category = "normal weight";
    } else if (bmi >= 25.0 && bmi <= 29.99) {
      category = "overweight";
    } else {
      category = "obese";
    }
    console.log(healthScore.lifestyle_score, 1234567);
    percentage = healthScore.total_health_score;
    let notification_id = "";
    let healthScoreDifference = 0;
    if (
      oldHealthScore != null ||
      oldHealthScore != undefined ||
      oldHealthScore > 0
    ) {
      healthScoreDifference = oldHealthScore - percentage;
      if (healthScoreDifference < 0) {
        //Improved
        notification_id = 427;
      } else if (healthScoreDifference > 0) {
        //Decreased
        notification_id = 428;
      } else {
      }
      if (notification_id) {
        const sendNotification = await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user_id],
            notification_id,
            sent_via: "cron",
          }
        );
      }
      const fullPhone = `${userDetails[0]?.phone_code?.replace(
        /\D/g,
        ""
      )}${userDetails[0]?.phone_number?.replace(/\D/g, "")}`;
      const templateName = "lead_health_score_updated";
      const broadcastName = "LeadHealthScoreUpdate";
      const response = await axios.post(
        `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
        {
          template_name: templateName,
          broadcast_name: broadcastName,
          parameters: [{ name: "name", value: userDetails[0].name }],
        }
      );
    }

    // Insert health score

    const columns = [
      "user_id",
      "sub_order_id",
      "type",
      "gender",
      "age",
      "height",
      "weight",
      "goal_weight",
      "health_issue",
      "body_shape",
      "sleep_duration",
      "activity_level",
      "smoke_frequency",
      "alcohol_frequency",
      "food_preferences",
      "water_frequency",
      "veg_fruits_frequency",
      "goals",
      "email",
      "source",
      "body_mass_index",
      "ideal_weight",
      "weight_difference",
      "overall_health_score",
      "health_category",
      "ideal_bmi",
      "periods",
      "weight_score",
      "diet_score",
      "lifestyle_score",
      "medical_score",
    ];

    const values = [
      db_user_id,
      sub_order_id || null,
      userDetails[0].user_status == "Completed" ? "3" : "0",
      gender || null,
      age || null,
      height,
      weight,
      goal_weight || null,
      health_issues?.length
        ? JSON.stringify(
            Array.isArray(health_issues)
              ? health_issues
              : health_issues.split(",")
          )
        : null,
      body_shape || null,
      sleep_duration,
      activity_level,
      smoking_frequency,
      alcohol_frequency,
      food_preferences || null,
      water_frequency,
      veg_fruits_frequency,
      goals?.length
        ? JSON.stringify(Array.isArray(goals) ? goals : goals.split(","))
        : null,
      email_id || `${cleanedNumber}@bn.com`,
      source,
      bmi,
      ideal_weight,
      ideal_weight - weight === 0 ? "0" : ideal_weight - weight,
      percentage,
      category,
      idealBMI,
      periods_frequency || null,
      healthScore.weight_score || "0",
      healthScore.diet_score || "0",
      healthScore.lifestyle_score || "0",
      healthScore.medical_score || "0",
    ];

    console.log(columns, 123456789);
    console.log(values, 123456789);
    const insertedResult = await insertRecord(
      tables.healthScoreClient,
      columns,
      values
    );
    if (!insertedResult || insertedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while inserting health score", 500));
    }
    addStageLogNew({
      stage:
        weightDiff > 15
          ? 4
          : weightDiff >= 7
          ? 3
          : weightDiff <= 7
          ? 2
          : weightDiff >= 0
          ? 1
          : 0,
      id: db_user_id,
    });
    // Wallet logic
    let wallet_amount = 0;
    let wallet_reason = "";

    wallet_amount = 1000;
    wallet_reason = "Health Score";

    if (wallet_amount > 0) {
      await addAmountWallet({
        user_id: db_user_id,
        amount: wallet_amount,
        reason: wallet_reason,
      });
    }
    let motivation_text = "";
    let old_motivation_text = "";
    let hs_color = "";
    if (percentage >= 90) {
      hs_color = "#216F35";
      motivation_text = "Excellent";
    } else if (percentage >= 71 && percentage <= 89) {
      hs_color = "#AAD53A";
      motivation_text = "Very Good";
    } else if (percentage >= 51 && percentage <= 70) {
      hs_color = "#F4AF2D";
      motivation_text = "Can Do Better";
    } else if (percentage >= 31 && percentage <= 50) {
      hs_color = "#9F6B09";
      motivation_text = "Needs Attention";
    } else if (percentage <= 30) {
      hs_color = "#E72A21";
      motivation_text = "Act NOW!";
    }

    if (userDetails[0]?.overall_health_score >= 90) {
      old_motivation_text = "Excellent";
    } else if (
      userDetails[0]?.overall_health_score >= 71 &&
      userDetails[0]?.overall_health_score <= 89
    ) {
      old_motivation_text = "Very Good";
    } else if (
      userDetails[0]?.overall_health_score >= 51 &&
      userDetails[0]?.overall_health_score <= 70
    ) {
      old_motivation_text = "Can Do Better";
    } else if (
      userDetails[0]?.overall_health_score >= 31 &&
      userDetails[0]?.overall_health_score <= 50
    ) {
      old_motivation_text = "Needs Attention";
    } else if (userDetails[0]?.overall_health_score <= 30) {
      old_motivation_text = "Act NOW!";
    }
    console.log(motivation_text, 431);

    const mailData = {};
    mailData.to = `${first_name} <${email_id || userDetails[0].email_id}>`;
    (mailData.bcc = [
      "akansha.priyadarshini@balancenutrition.in",
      "krishna.sidhpura@balancenutrition.in",
      // "khyatirupani@balancenutrition.in",
      "info@balancenutrition.in",
      "testerteam@balancenutrition.in",
    ]),
      (mailData.cc = []),
      (mailData.subject = `Your BN Health Score Result ${
        Number(type) === 1
          ? "(Mid Progress Report)"
          : Number(type) === 2
          ? "(Program Progress Report)"
          : ""
      }`);
    mailData.body = generateEmailContent({
      weight_color: weightDiff <= 0 ? "#f2000d" : "#38a169",
      weight_difference: Math.abs(weightDiff.toFixed(2)),
      health_category: category,
      current_weight: weightInput,
      ideal_weight: ideal_weight,
      bmi,
      health_score: percentage,
      health_score_category: motivation_text,
      calculated_top: percentage,
      hs_color: hs_color,
      counsellor_phone:
        userDetails[0]?.user_status === "Lead"
          ? userDetails[0].counsellor_phone || 7021960648
          : null,
      user_name:
        userDetails[0]?.user_status === "Lead"
          ? `${userDetails[0].first_name}`
          : null,
    });
    if (userDetails.length === 0) {
      const { results } = await readRecord({
        selectFields: ["*"],
        table: `${tables.adminUsers} ad`,
        conditions: [
          { field: "ad.role_id", operator: "=", value: "2" },
          { field: "ad.is_active", operator: "=", value: "1" },
        ],
      });
      const counsellor_emails = results.map((user) => user.email_id);
      mailData.bcc.push(...counsellor_emails);
    } else {
      if (userDetails[0].user_status === "Lead") {
        mailData.bcc.push(
          userDetails[0]?.counsellor_email ||
            "krishna.sidhpura@balancenutrition.in,akansha.priyadarshini@balancenutrition.in"
        );
      } else if (userDetails[0]?.user_status !== "Lead") {
        const { hs } = safeJSONParse(userDetails[0]?.active);

        if (Number(type) === 1 || Number(type) === 2) {
          mailData.cc.push(userDetails[0]?.mentor_email);
          mailData.bcc = hs.cc;
          mailData.bcc.push("khyati.rupani@balancenutrition.in");
        } else {
          mailData.cc = hs.cc;
          mailData.bcc = hs.bcc;
        }
      }
    }
    console.log(source, 13131313);
    if (isnewHS == true) {
      if (
        healthScoreParameters.source === "web" ||
        healthScoreParameters.source === "app" ||
        source === "ios"
      ) {
        const mail = await sendMailUtil({
          to: mailData.to,
          from: "Balance Nutrition <info@balancenutrition.in>",
          cc: mailData.cc,
          bcc: mailData.bcc,
          subject: mailData.subject,
          html: mailData.body,
        });
        console.log(mail, 443);
      }
      const goal_comment = safeJSONParse(userDetails[0]?.goal_comment, {
        goals_achieved: [],
        milestone_achieved: [],
        new_goals: [],
        pending_goals: [],
      }).new_goals;
      let goal_text = "";
      if (goal_comment.length > 0) {
        goal_text += `<p>You have also set new goals, which we spoke about. I am enlisting them here.`;
        goal_text += `<ol>`;
        goal_comment.forEach((goal) => {
          goal_text += `<li>${goal}</li>`;
        });
        goal_text += `</ol>`;
        goal_text += `</p>`;
      }
      let program_text = "";
      if (userDetails[0]?.advance_program_name) {
        program_text = `<p>We Have A ${userDetails[0]?.advance_program_duration} ${userDetails[0]?.advance_program_name} Program To Go After You Complete The Sessions Of This Program. We Will Continue To Work On Your Goals & Ideal Weight :)
                          </p>`;
      } else if (userDetails[0]?.suggested_program_name) {
        program_text = `<p> For further progress & to get to our goals, I have already recommended the ${userDetails[0]?.suggested_program_duration} ${userDetails[0]?.suggested_program_name} Program to you.Check the current offers on the same here <a href=""></a><p>`;
      }
      let photo_text = "";
      if (!userDetails[0]?.photo_id) {
        photo_text =
          "P.S. If you send me your recent photo, I can make more out of our overall progress & plan your next sessions with a lot more precision.";
      }
      let hs_text = "";
      if (percentage < userDetails[0]?.overall_health_score) {
        hs_text = `<p>Your health score has not improved too & it remains at ${percentage} & in the ${motivation_text} Category</p>`;
      } else if (percentage > userDetails[0]?.overall_health_score) {
        hs_text = `<p>Your health score has improved by ${
          percentage - userDetails[0]?.overall_health_score
        } points but there is no category progress & we are still at ${motivation_text} category</p>`;
      }
      if (Number(type) === 1) {
        let query = ``;
        if (weightInput - userDetails[0]?.start_program_weight > 0) {
          query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                            <p>Hi ${userDetails[0]?.first_name},</p>
                          
                            <p>
                              Great to see you filled out the <strong>mid-program health score</strong> questions & got your report in the app.
                            </p>
                          
                            <p>
                              In ${userDetails[0]?.sent_sessions} sessions (${
            userDetails[0]?.days_passed
          } days), you have lost ${
            weightInput - userDetails[0]?.start_program_weight
          } kg which is very good given all our efforts & priorities.
                            </p>
                            <p>
                              Your health score has improved by ${
                                percentage -
                                userDetails[0]?.overall_health_score
                              } points
                            </p>
                            <p>
                              Let's connect on a quick call to discuss this progress report & how to ensure the rest of our sessions are more aligned towards achieving the best results!
                            </p>
                          
                            <p>
                              Book your Mid-Program Progress Call :  https://www.balancenutrition.in/app_link/screen_id=29/call_type=1
                            </p>
                          
                           
                          </div>
                          `;
        } else {
          query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                            <p>Hi ${userDetails[0]?.first_name},</p>
                          
                            <p>
                              Yes, I have seen your comparative health score report for this program. In ${
                                userDetails[0]?.sent_sessions
                              } sessions (${
            userDetails[0]?.days_passed
          } days), we have not lost weight & nor do we see any positive changes in your B.M.I and other parameters.
                            </p>
                          
                            <p>
                              I am always worried about your progress & also keep trying to do all I can in my capacity to ensure we see good results.
                            </p>
                          
                            <p>
                              We still have half of this program pending. We can still see great results.
                            </p>
                          
                            <p>
                              If you remember, you had set your Goal Weight in the Assessment as ${
                                userDetails[0]?.goal_weight - weightInput
                              } kg. We have ${
            userDetails[0]?.pending_session
          } sessions pending & ${
            goal_weight - weightInput
          } kg more to lose to get here.
                            </p>
                          
                            <p>
                              I want to discuss this at length with you. Please book a call with me at your earliest convenience: https://www.balancenutrition.in/app_link/screen_id=29/call_type=1
                            </p>
                          
                            <p>
                              Let's make the rest of the program better!
                            </p>
                          </div>
                          `;
        }
        const addAutoDraftResponse = addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: query,
        });
      } else if (Number(type) === 2) {
        let query = ``;
        console.log(weightInput, userDetails[0]?.start_program_weight, 777);
        if (weightInput - userDetails[0]?.start_program_weight > 0) {
          query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                          
                            <p>Hi ${userDetails[0]?.first_name},</p>
                          
                            <p>It is time for a progress check once again :) I have got your health score report.</p>
                          
                            <p>
                              For This Program So Far, In ${
                                userDetails[0]?.sent_sessions
                              } Sessions 
                              (${
                                userDetails[0]?.days_passed
                              } Days), You Have Lost {weight_loss} Kg & 
                              Your B.M.I Also Has Improved From ${
                                userDetails[0]?.last_bmi
                              } kg/M2 
                              To ${bmi} Kg/M2
                            </p>
                          
                            <p>
                              Your Health Score Also Has Improved By 
                              ${
                                percentage -
                                userDetails[0]?.overall_health_score
                              } Points & Is Now In The 
                              <strong>${motivation_text}</strong> Category from the older 
                              <strong>${old_motivation_text}</strong> Category
                            </p>
                          
                            ${goal_comment.length > 0 ? goal_text : ""}
                          
                            <p>
                              If We Have To Take Stock Of Your Overall Progress &amp; Health, We Have Done 
                              Well So Far & If Compared To Ideal Weight, There Is Still 
                              ${
                                ideal_weight - weightInput
                              } Kg That We Have To Lose. BMI Also Must Be 
                              Below 25kg/M2
                            </p>
                          
                            ${health_issues.length > 0 ? health_issue_text : ""}
                          
                            ${program_text}
                          
                            <p>
                              In the coming few days, you will get a notification to rate the program. 
                              Do leave your feedback.
                            </p>
                          
                            <p>
                              Though you will get a notification to schedule a call with me to discuss your 
                              progress as well, feel free to click here &amp; schedule it at your convenience
                            </p>
                          
                            ${photo_text}
                          
                            <p>Talk to you soon :)</p>
                          
                          </div>`;
        } else {
          query = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                            <p>Hi ${userDetails[0]?.first_name},</p>
                          
                            <p> I, too, received a copy of your health score report.  In this program so far, in ${
                              userDetails[0]?.sent_sessions
                            } sessions (${
            userDetails[0]?.days_passed
          } days),we haven't seen any weight loss, unfortunately. 
                          </p>
                          
                            <p>${hs_text}</p>
                          
                            
                            ${goal_text}
                          
                            If We Have To Take Stock Of Your Overall Progress &amp Health, We Have Done Well So Far &amp If Compared To Ideal Weight, There Is Still ${
                              ideal_weight - weightInput
                            } Kg That We Have To Lose. BMI Also Must Be Below 25kg/M2
                          
                            
                          
                            <p>
                              In the coming few days, you will get a notification to rate the program. 
                              Do leave your feedback.
                            </p>
                          
                            <p>
                              Though you will get a notification to schedule a call with me to discuss your 
                              progress as well, feel free to click here &amp; schedule it at your convenience
                            </p>
                          
                            ${photo_text}
                          
                            <p>Talk to you soon :)</p>
                          </div>`;
        }
        console.log(query, 864);
        const addAutoDraftResponse = addAutoDraftedQuery({
          user_id: user_id,
          mentor_id: userDetails[0].mentor_assigned,
          query: query,
        });
        console.log(addAutoDraftResponse, 653);
      }
    }
    return {
      ideal_weight,
      bmi,
      health_score: percentage,
      current_weight: weightInput,
      health_category: category,
      weight_difference: Math.abs(weightDiff.toFixed(2)),
      wallet_amount,
      markerWiseHealthScore: {
        weight_marker: healthScore.weight_score,
        lifestyle_marker: healthScore.lifestyle_score,
        diet_marker: healthScore.diet_score,
        health_marker: healthScore.medical_score,
        total_health_score: healthScore.total_health_score,
      },
    };
  } catch (error) {
    console.error("Error in addHealthScore:", error);
    // return next(new ErrorHandler("Internal Server Error", 500));
  }
}

function calculateHealthScore(hsData) {
  let {
    weightDiff,
    health_issues,
    activity_level,
    alcohol_frequency,
    sleep_duration,
    smoking_frequency,
    water_frequency,
    veg_fruits_frequency,
    junk_food_consumption,
  } = hsData;

  weightDiff = parseFloat(weightDiff || 0);
  alcohol_frequency = parseFloat(alcohol_frequency || 0);
  sleep_duration = parseFloat(sleep_duration || 0);
  smoking_frequency = parseFloat(smoking_frequency || 0);
  water_frequency = parseFloat(water_frequency || 0);
  activity_level = parseFloat(activity_level || 0);
  veg_fruits_frequency = parseFloat(veg_fruits_frequency || 0);
  junk_food_consumption = Array.isArray(junk_food_consumption)
    ? junk_food_consumption
    : [];
  health_issues = Array.isArray(health_issues) ? health_issues : [];

  let weight_score,
    lifestyle_score,
    diet_score,
    medical_score,
    total_health_score;

  // Weight marker (out of 10 → normalized to 25)
  let weight_score_raw = 0;
  if (weightDiff >= 15) weight_score_raw = 0;
  else if (weightDiff >= 7) weight_score_raw = 3;
  else if (weightDiff >= 2) weight_score_raw = 6;
  else weight_score_raw = 10;
  weight_score = parseFloat(((weight_score_raw / 10) * 25).toFixed(2));

  // Lifestyle marker (sum out of 50 → normalized to 30)
  const lifestyle_total =
    alcohol_frequency +
    sleep_duration +
    smoking_frequency +
    water_frequency +
    activity_level;
  lifestyle_score = parseFloat(((lifestyle_total / 50) * 25).toFixed(2));

  // Diet marker (veg + junk out of 20 → normalized to 30)
  let junk_score = 10;
  const junk_count = junk_food_consumption.length;
  if (junk_count === 1) junk_score = 8;
  else if (junk_count === 2) junk_score = 6;
  else if (junk_count === 3) junk_score = 3;
  else if (junk_count === 4) junk_score = 1;
  else if (junk_count > 4) junk_score = 0;

  if (junk_count === 0) {
    diet_score = parseFloat(((veg_fruits_frequency / 10) * 25).toFixed(2));
  } else {
    const diet_raw = veg_fruits_frequency + junk_score;
    diet_score = parseFloat(((diet_raw / 20) * 25).toFixed(2));
  }

  // Medical marker (out of 10 → normalized to 20)
  let med_raw = 0;
  const issue_count = health_issues.length;
  if (issue_count === 0) med_raw = 10;
  else if (issue_count === 1) med_raw = 7;
  else if (issue_count === 2) med_raw = 5;
  else if (issue_count === 3) med_raw = 1;
  else med_raw = 0;
  medical_score = parseFloat(((med_raw / 10) * 25).toFixed(2));

  // Total Score
  total_health_score = parseFloat(
    (weight_score + lifestyle_score + diet_score + medical_score).toFixed(2)
  );

  return {
    weight_score,
    lifestyle_score,
    diet_score,
    medical_score,
    total_health_score,
  };
}

const getLeadHealthScoreReport = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Health Score Report",
    data: {
      description:
        "<Span>Your health score is 56, slightly below your peer group average of 63. But here’s the good news—over 40% of your peers started below 60 and improved in just 3 months. You’re next.</span>",
      current_score: {
        label: "Your Score",
        background_color: "#9F6B09",
        label_color: "#FFFFFF",
        score_color: "#FFFFFF",
        message_color: "#FFFFFF",
        score: 36,
        message: "Needs Attention",
      },
      target_score: {
        label: "Target Score",
        background_color: "#FFF8EA",
        label_color: "#9F6B09",
        score_color: "#FFAB0D",
        message_color: "#9F6B09",
        score: 36,
        message: "Can Do Better",
      },
    },
  });

  return res.status(200).json(apiresponse);
};

const getLeadBmiReport = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "BMI Report",
    data: {
      description:
        "<Span>Your health score is <b>56</b>, slightly below your peer group average of 63. But here’s the good news—over 40% of your peers started below 60 and improved in just 3 months. You’re next.</span>",
      current_bmi: {
        label: "Your B.M.I>",
        background_color: "#E72A21",
        label_color: "#FFFFFF",
        score_color: "#FFFFFF",
        score: 44,
      },
      ideal_bmi: {
        label: "Ideal B.M.I",
        background_color: "#DFFFE7",
        label_color: "#216F35",
        score_color: "#216F35",
        score: 23,
      },
    },
  });

  return res.status(200).json(apiresponse);
};

const getLeadWeightReport = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Weight Report",
    data: {
      description:
        "<Span>Your health score is <b>56</b>, slightly below your peer group average of 63. But here’s the good news—over 40% of your peers started below 60 and improved in just 3 months. You’re next.</span>",
      current_weight: 44.0,
      goal_weight: 67.32,
      ideal_weight: 56,
      bmi: 30,
      bmi_color: "#FF0000",
      message: "<span>You are 11kg away from your goal wight</span>",
    },
  });

  return res.status(200).json(apiresponse);
};

export {
  addHealthScore,
  getHealthScoreReport,
  getHealthScoreReportByAssessment,
  compareMidAndEndHS,
  addLeadHealthScore,
  getLeadHealthScoreReport,
  getLeadBmiReport,
  getLeadWeightReport,
};
