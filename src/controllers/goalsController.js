import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { addAmountWallet } from "../helper/common.js";
import { addDraftedQuery } from "./chatController/chatController.js";
import { addAutoDraftedQuery } from "./common.js";

const submitGoal = async (req, res, next) => {
  const { user_id, sub_order_id, mentor_id, comment } = req.body;
  try {
    const { results: goals } = await readRecord({
      table: `${tables.bnMyGoalsNew} gm`,
      selectFields: ["gm.id"],
      conditions: [
        { field: "gm.user_id", operator: "=", value: user_id },
        { field: "gm.sub_order_id", operator: "=", value: sub_order_id },
      ],
    });

    if (goals.length > 0) {
      return next(
        new ErrorHandler("Goals already submitted for this user", 400)
      );
    }
    let keyMapping = new Map();
    keyMapping.set("new_goals", "New Goals");
    keyMapping.set("goals_achieved", "Goals Achieved");
    keyMapping.set("milestone_achieved", "Milestone Achieved");
    keyMapping.set("pending_goals", "Pending Goals");
    for (const key of Object.keys(comment)) {
      if (!keyMapping.has(key)) {
        return next(new ErrorHandler(`Invalid key ${key}`, 400));
      }
    }
    for (const key of keyMapping.keys()) {
      if (!comment.hasOwnProperty(key)) {
        comment[key] = [];
      }
    }
    const columns = ["user_id", "sub_order_id", "mentor_id", "comment"];
    const values = [user_id, sub_order_id, mentor_id, JSON.stringify(comment)];
    const insertResult = await insertRecord(
      tables.bnMyGoalsNew,
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
          "ud.my_wallet",
          "ud.latest_weight - ud.start_weight as weight_diff",
          "sop2.sub_order_id as advance_program",
          "ps.program_duration",
          "pm.program_name",
          "sop.pending_session",
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: Number(user_id),
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop2`,
            on: "sop2.user_id = ud.user_id and sop2.program_status = '4'",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id = sop2.program_session_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = ps.program_id",
          },
        ],
      });
      const data = {
        title: `${userDetails[0].first_name} ${userDetails[0].last_name} has Submitted Goal`,
        priority: 1,
        redirect: "/goal",
      };
      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, userDetails[0].mentor_assigned, data.title, "/goal"]
      );
      if (insertedResultNotification.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
      const addWallet = await addAmountWallet({
        user_id: user_id,
        amount: 1000,
        reason: "Goal Submission",
        sub_order_id: sub_order_id,
      });
      const apiResponse = {
        statusCode: 201,
        message: "Goal added successfully",
        data: insertResult.insertId,
        wallet_amount: 1000,
      };
      return res.status(201).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to add Goal", 500));
  } catch (error) {
    console.log(error, 27);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getGoals = async (req, res, next) => {
  const { user_id, sub_order_id } = req.body;
  console.log(user_id, sub_order_id, 62);
  try {
    const { results } = await readRecord({
      table: `${tables.bnMyGoalsNew} gm`,
      selectFields: [
        "gm.id",
        "gm.user_id",
        "gm.sub_order_id",
        "gm.comment",
        "gm.added_date",
        "gm.updated_date",
      ],
      conditions: [{ field: "gm.user_id", operator: "=", value: user_id }],
      orderBy: ["id DESC"],
    });
    console.log(results, 27);

    const subOrderProgramDetails = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "sop.last_session_sent_date",
        "sop.expiry_date",
        "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS validity",
        "wr.wmr_id",
        "sop.total_sessions",
        "sop.pending_session",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr`,
          on: "sop.sub_order_id = wr.sub_order_id AND wr.days = 10 and wr.session = 1",
        },
      ],
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: parseInt(sub_order_id),
        },
      ],
    });
    console.log(results, 11221122);
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No goals found",
        data: [],
        meta_data: {
          is_first_session_completed: subOrderProgramDetails.results[0]?.wmr_id
            ? true
            : false,
          validity: 0,
          expiry_date: "N/A",
        },
      });
      return res.status(200).json(apiResponse);
    }

    console.log(subOrderProgramDetails, 68);
    console.log(JSON.parse(results[0].comment), 69);
    const { new_goals, goals_achieved, milestone_achieved } = JSON.parse(
      results[0].comment
    );
    let show_goal = false;
    if (
      subOrderProgramDetails?.results[0]?.total_sessions === 3 &&
      subOrderProgramDetails?.results[0]?.pending_session === 1
    ) {
      show_goal = true;
    } else if (
      (subOrderProgramDetails?.results[0]?.total_sessions === 6 ||
        subOrderProgramDetails?.results[0]?.total_sessions === 9 ||
        subOrderProgramDetails?.results[0]?.total_sessions === 12) &&
      subOrderProgramDetails?.results[0]?.pending_session === 3
    ) {
      show_goal = true;
    }
    let screen_name = "1";
    if (milestone_achieved.length === 0) {
      screen_name = "1";
    } else if (milestone_achieved.length > 0 && show_goal) {
      screen_name = "3";
    } else if (milestone_achieved.length > 0 && goals_achieved.length > 0) {
      screen_name = "3";
    } else if (milestone_achieved.length > 0) {
      screen_name = "2";
    } else if (new_goals.length > 0) {
      screen_name = "5";
    }
    const data = results.map((i) => {
      let comment = [];
      try {
        comment = JSON.parse(i.comment);
      } catch (error) {
        comment = [];
      }
      return {
        id: i.id,
        user_id: i.user_id,
        sub_order_id: i.sub_order_id,
        comment,
        added_date: i.added_date,
        updated_date: i.updated_date,
      };
    });
    console.log(data[0], 241);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Goals fetched successfully",
      data,
      meta_data: {
        is_first_session_completed: subOrderProgramDetails.results[0]?.wmr_id
          ? true
          : false,
        validity: subOrderProgramDetails.results[0]?.validity || 0,
        expiry_date:
          moment(subOrderProgramDetails.results[0]?.expiry_date).format(
            "Do MMM YYYY"
          ) || "N/A",
        screen_name,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Error fetching goals", 500));
  }
};

const updateGoal = async (req, res, next) => {
  const { id, comment } = req.body;
  try {
    let keyMapping = new Map();
    keyMapping.set("new_goals", "New Goals");
    keyMapping.set("goals_achieved", "Goals Achieved");
    keyMapping.set("milestone_achieved", "Milestone Achieved");
    keyMapping.set("pending_goals", "Pending Goals");
    for (const key of Object.keys(comment)) {
      if (!keyMapping.has(key)) {
        return next(new ErrorHandler(`Invalid key ${key}`, 400));
      }
    }
    if (!Object.keys(comment).includes("pending_goals")) {
      comment.pending_goals = comment.new_goals.filter(
        (i) => !comment.goals_achieved.includes(i)
      );
    }
    for (const key of keyMapping.keys()) {
      if (!comment.hasOwnProperty(key)) {
        comment[key] = [];
      }
    }
    // console.log(comment, 283);
    //    if (!Object.prototype.hasOwnProperty.call(comment, "pending_goals")) {
    //   const achievedSet = new Set(comment.goals_achieved);
    //   comment.pending_goals = comment.new_goals.filter(goal => !achievedSet.has(goal));
    // }

    console.log(comment, 289);
    const updateResult = await updateRecord(
      tables.bnMyGoalsNew,
      { comment: JSON.stringify(comment) },
      { id }
    );
    if (comment.goals_achieved.length > 0) {
      const { results: userDetails } = await readRecord({
        table: `${tables.bnMyGoalsNew} mg`,
        selectFields: [
          "mg.user_id",
          "ud.first_name",
          "ud.last_name",
          "ud.mentor_assigned",
          "ud.my_wallet",
          "ud.latest_weight - ud.start_weight as weight_diff",
          "sop2.sub_order_id as advance_program",
          "ps.program_duration",
          "pm.program_name",
          "sop.pending_session",
          `(SELECT goal_weight from ${tables.assessment_personal_details} aspd WHERE aspd.user_id = ud.user_id ORDER BY aspd.added_date DESC LIMIT 1) as goal_weight`,
          "ud.latest_weight",
        ],
        conditions: [
          {
            field: "mg.id",
            operator: "=",
            value: Number(id),
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = mg.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop2`,
            on: "sop2.user_id = ud.user_id and sop2.program_status = '4'",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id = sop2.program_session_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "pm.program_id = ps.program_id",
          },
        ],
      });
      let pending_goals_text = "<ul>";
      const pending_goals = comment?.pending_goals.map((goal) => {
        return `<li>${goal}</li>`;
      });
      pending_goals_text += pending_goals.join("");
      pending_goals_text += "</ul>";
      const addAutoDraftResponse = await addAutoDraftedQuery({
        user_id: userDetails[0].user_id,
        mentor_id: userDetails[0].mentor_assigned,
        query: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi ${userDetails[0].first_name},</p>

  <p>
    Just got an update on your goals that you filled out in the BN App.
    This section appears towards the tail end of the program, to remind you & me both of the goals we set in the beginning, the progress so far & our visit to our pending goals.
  </p>

  <p>
    ${
      userDetails[0].advance_program
        ? `Summarising the goals here, we have ${
            userDetails[0].goal_weight - userDetails[0].latest_weight
          } kg to lose & our pending goals are: ${pending_goals_text}`
        : `Let's get on a call to discuss your progress & set the path to achieving these effectively. Please schedule a call with me at your convenience: <a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45">Schedule Call</a>`
    }
  </p>

  <p>We will be diligently working towards these in your upcoming sessions :)</p>

  <p>
    P.S. I wanted you to watch this podcast. It is very insightful & will help you understand a lot about nutrition labels - 
    <a href="https://youtu.be/BtTw_on0OtA">Watch the podcast here</a>
  </p>
</div>
`,
      });
      console.log(addAutoDraftResponse, 387);
    }
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry with the given id", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `goals updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating goals`, 400));
    }
  } catch (error) {
    console.log(error, 27);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { submitGoal, getGoals, updateGoal };
