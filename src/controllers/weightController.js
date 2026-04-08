import moment from "moment";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../config/query.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import {
  addAmountWallet,
  addAutoDraftForWeightUpdate,
  addAutoDraftForWeightUpdateFifthDay,
  addWeightAutoChat,
} from "../helper/common.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { readPool } from "../config/dbConnection.js";
import { addStatusLogNew } from "./salesDashboardControllers/leadsController.js";
import { fifthDayRecievedChat, tenthDayRecievedChat } from "./common.js";

export const updateMaintenanceStatus = async ({ user_id }) => {
  try {
    if (!user_id) {
      return {
        success: false,
        error: "Invalid or missing UserId",
      };
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "anal.eating_habit",
        "sop.program_id",
        "sop.program_type",
        "ud.mentor_assigned",
        "ud.active_order_id",
        `(SELECT prev_sop.program_id FROM ${tables.subOrderPrograms} prev_sop WHERE prev_sop.user_id = ${user_id} AND prev_sop.program_status = '3' AND prev_sop.program_type = 0 ORDER BY prev_sop.sub_order_id DESC LIMIT 1  ) as prev_program_id`,
      ],
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
          table: `${tables.assessment_nutrition_and_lifestyle} anal`,
          on: "anal.assessment_id = ass.assessment_id",
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });
    if (!results || !results[0]) {
      return {
        success: false,
        error: "User not found or no associated program/eating habit data",
      };
    }
    let {
      program_id,
      prev_program_id,
      program_type,
      eating_habit,
      active_order_id,
      mentor_assigned,
    } = results[0];

    if (!program_id) {
      return {
        success: false,
        error: "Missing program_id for the user",
      };
    }

    // Default to "veg" if no eating_habit is found
    const defaultEatingHabit = eating_habit || "veg";

    const eatingHabitMapping = {
      veg: "veg",
      vegetarian: "veg",
      veggie: "veg",
      vegan: "veg",
      "ovo-vegetarian": "veg",
      "ovo vegetarian": "veg",
      "ovo-vegetarian (veg. eating eggs)": "veg",
      "ovo-vegetarian (veg eating eggs)": "veg",
      nonveg: "nonveg",
      non_vegetarian: "nonveg",
      nonvegetarian: "nonveg",
      nonvegetarian: "nonveg",
      "non-veg": "nonveg",
      "non veg": "nonveg",
      "non-vegetarian": "nonveg",
      "non vegetarian": "nonveg",
      "ovo vegetarian veg eating eggs": "veg",
    };

    const normalizeEatingHabit = (habit) => {
      if (!habit || typeof habit !== "string") {
        throw new Error("Invalid eating_habit value");
      }

      const normalizedHabit = habit
        .toLowerCase()
        .replace(/[^a-z]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const standardHabit = eatingHabitMapping[normalizedHabit];

      if (!standardHabit) {
        console.warn(
          `Unrecognized eating_habit: '${habit}' (normalized: '${normalizedHabit}')`
        );

        return "veg";
      }

      return standardHabit;
    };

    const normalizedEatingHabit = normalizeEatingHabit(defaultEatingHabit);

    const query = `
      SELECT m.id 
      FROM ${tables.maintenanceMasters} m 
      WHERE m.program_id LIKE ? 
      AND m.eating_habit LIKE LOWER(?)
    `;
    console.log(program_id, prev_program_id, 135);
    const params = [
      `%${Number(program_type) === 0 ? program_id : prev_program_id}%`,
      normalizedEatingHabit,
    ];
    const [rows] = await readPool.query(query, params);
    if (!rows || !rows[0]) {
      return {
        success: false,
        error: "No matching maintenance program found for this user",
      };
    }

    const maintenanceId = rows[0].id;

    const insertedResult = await insertRecord(
      tables.maintenanceOrderDetails,
      [
        "user_id",
        "order_id",
        "maintenance_id",
        "wallet_amount",
        "payment_method",
        "mentor_id",
      ],
      [user_id, active_order_id, maintenanceId, 0, "free", mentor_assigned]
    );

    const updatedResult = await updateRecord(
      tables.userDetails,
      {
        user_status: "Completed",
        sub_user_status: "Maintenance",
        active_maintenance_id: insertedResult.insertId,
      },
      { user_id }
    );

    if (updatedResult.affectedRows === 0) {
      return {
        success: false,
        error: "Failed to update user details",
      };
    }

    const addStatusLog = await addStatusLogNew({
      status: "Completed",
      sub_status: "Maintenance",
      id: user_id,
    });
    return { success: true };
  } catch (error) {
    console.log(error, 178);
    console.error("Error in updateMaintenanceStatus:", error);
    return {
      success: false,
      error: error.message || "Internal Server Error",
    };
  }
};

export const getWeightList = async (req, res) => {
  const { order_id, user_id } = req.body;
  if (!order_id || !user_id) {
    return res
      .status(400)
      .json({ message: "Invalid or missing required fields" });
  }

  try {
    let weightListResponse = [];

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "pm.program_name",
        "ps.program_sessions",
        "ps.validity",
        "ps.extra_validity",
        "pm.program_category as program_category",
        "ps.ask_imf_window",
        "ud.latest_weight",
        "ud.start_weight",
        "sop.sent_sessions",
        "ud.active_order_id",
        "ud.sub_user_status",
        `(SELECT end_date FROM onhold_clients WHERE user_id = ud.user_id ORDER BY id DESC LIMIT 1) AS break_end_date`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: `${order_id} = sop.sub_order_id`,
        },
        {
          type: "INNER",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        // { field: "ud.active_order_id", operator: "=", value: order_id },
      ],
    });
    console.log(results, 199);
    const { results: weightTrackerList } = await readRecord({
      table: `${tables.weightRecords} wr`,
      selectFields: [
        "wr.session",
        "wr.days",
        "wr.weight",
        "wr.weight_acknowledge",
        "wr.posted_date",
        "wr.day_status",
      ],
      conditions: [
        { field: "wr.sub_order_id", operator: "=", value: order_id },
      ],
      orderBy: ["wr.wmr_id ASC"],
    });

    const { results: assessmentPersonalDetails } = await readRecord({
      table: `${tables.assessment_personal_details} aspd`,
      selectFields: ["aspd.goal_weight"],
      conditions: [{ field: "aspd.user_id", operator: "=", value: user_id }],
      orderBy: ["aspd.personal_details_id DESC"],
    });

    console.log(results, 215);
    weightTrackerList.forEach((currentWeight, i, arr) => {
      const program_type = "Loss";
      let weight_difference = 0;
      if (i > 0) {
        weight_difference = currentWeight.weight - arr[i - 1].weight;
      }

      let weight_color = "#000000";
      if (weight_difference > 0) {
        weight_color = program_type === "Loss" ? "#ff0000" : "#2fc56e";
      } else if (weight_difference < 0) {
        weight_color = program_type === "Loss" ? "#2fc56e" : "#ff0000";
      }

      const responseWeightList = {
        session: Number(currentWeight.session),
        // session_days:
        //   currentWeight.session === 0
        //     ? "St. Wt"
        //     : Number(currentWeight.day_status) === 2
        //     ? "Ot. Wt"
        //     : currentWeight.days,
        session_days:
          currentWeight.days === 0
            ? "St. Wt"
            : Number(currentWeight.days) === 5 ||
              Number(currentWeight.days) === 10
            ? Number(currentWeight.days)
            : "Br. Wt",
        weight: currentWeight.weight,
        difference:
          weight_difference < 0
            ? weight_difference.toFixed(2)
            : weight_difference > 0
            ? `+` + weight_difference.toFixed(2)
            : weight_difference.toFixed(2),
        color: weight_color,
        weight_acknowledge: currentWeight.weight_acknowledge,
        weight_status: currentWeight.day_status === 2 ? "Br. Wt" : "St. Wt",
        day_status: currentWeight.day_status,
        day_status_color:
          currentWeight.day_status === 2 ? "#ff0000" : "#2fc56e",
        posted_date: moment(currentWeight.posted_date).format("DD-MM-YYYY"),
      };
      weightListResponse.push(responseWeightList);
    });

    const { results: dietList } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_id",
        "dsl.diet_start_date",
        "dsl.start_session_weight",
        "dsl.session",
        "dsl.mid_session_weight",
        "dsl.end_session_weight",
        "dsl.diet_start_date_set_by",
      ],
      conditions: [
        { field: "dsl.sub_order_id", operator: "=", value: order_id },
        ...(Number(results[0].active_order_id) === Number(order_id)
          ? [
              {
                field: "dsl.session",
                operator: "=",
                value: results[0]?.sent_sessions,
              },
              {
                field: "dsl.diet_status",
                operator: "=",
                value: "4",
              },
            ]
          : []),
      ],
    });

    const dietStartDate = moment(dietList[0]?.diet_start_date).format(
      "YYYY-MM-DD"
    );

    let weightDay = "other";
    const programSessions = Number(results[0]?.program_sessions);
    const validity = Number(results[0]?.validity);
    const isCleanseProgram = programSessions === 1;
    const cleanseEndDay = isCleanseProgram
      ? validity === 1
        ? 2
        : validity === 3
        ? 4
        : 10
      : 10;
    const startWeightFilled = Number(dietList[0]?.start_session_weight) !== 0;

    if (isCleanseProgram) {
      weightDay = startWeightFilled ? "end" : "start";
    } else {
      const daysSinceStart = moment().diff(dietStartDate, "days");
      if (daysSinceStart <= 4) {
        weightDay = "start";
      } else if (daysSinceStart <= 7) {
        weightDay = "mid";
      } else if (daysSinceStart >= 10) {
        weightDay = "end";
      }
    }

    let weight_update_due = false;

    console.log(results, 1);

    if (dietList[0]?.diet_start_date) {
      const daysSinceStart = moment().diff(
        dietList[0]?.diet_start_date,
        "days"
      );
      if (
        Number(results[0]?.sent_sessions) === 1 &&
        Number(dietList[0]?.start_session_weight) === 0
      ) {
        weight_update_due = true;
      }
      if (
        !isCleanseProgram &&
        Number(dietList[0]?.mid_session_weight) === 0 &&
        daysSinceStart >= 5 &&
        daysSinceStart <= 7 &&
        Number(dietList[0]?.end_session_weight) === 0
      ) {
        weight_update_due = true;
      }
      if (
        Number(dietList[0]?.end_session_weight) === 0 &&
        daysSinceStart >= cleanseEndDay &&
        daysSinceStart <= cleanseEndDay + 4
      ) {
        weight_update_due = true;
      }
      if (
        Number(dietList[0]?.end_session_weight) === 0 &&
        daysSinceStart > cleanseEndDay + 4
      ) {
        weight_update_due = true;
      }
    }

    const { totalCount: prevCount } = await readRecord({
      table: `${tables.weightRecords} wr`,
      selectFields: ["wr.wmr_id"],
      conditions: [
        { field: "wr.sub_order_id", operator: "!=", value: order_id },
        { field: "wr.user_id", operator: "=", value: user_id },
      ],
      countTotal: true,
    });

    console.log(prevCount, 353);
    const startWeight =
      weightTrackerList[0]?.weight || Number(results[0]?.start_weight);
    const latestWeight =
      weightTrackerList[weightTrackerList.length - 1]?.weight ||
      Number(results[0]?.latest_weight);

    const weightDifference = (startWeight - latestWeight).toFixed(2);
    const isWeightLoss = Number(startWeight) > Number(latestWeight);
    const color = isWeightLoss ? "green" : "red";
    const actionText = isWeightLoss ? "lost" : "gained";
    console.log(startWeight, latestWeight, isWeightLoss, 426);
    const absoluteDifference = Math.abs(weightDifference).toFixed(2);

    if (
      results[0].sub_user_status == "Onhold" &&
      moment(results[0].break_end_date).format("YYYY-MM-DD") <=
        moment().format("YYYY-MM-DD")
    ) {
      weight_update_due = true;
      weightDay = "other";
    }
    console.log(dietList, 1212121212);
    const response = {
      status: true,
      message: "Weight List Fetched Successfully.",
      screen_name: "Weight Tracker",
      program_name: results[0]?.program_name,
      weight_update_due: weight_update_due,
      weight_day: weightDay,
      goal_weight:
        assessmentPersonalDetails.length > 0 &&
        assessmentPersonalDetails[0].goal_weight > 0
          ? assessmentPersonalDetails[0].goal_weight
          : 0,
      weight_lost: "3.4", // Consider making this dynamic
      weight_loss: weightDifference,
      previous_tracker: prevCount > 0,
      current_session: results[0]?.sent_sessions,
      diet_id: dietList[0]?.diet_id,
      data: {
        weight_list: weightListResponse,
        popup_data: {
          showPopup:
            dietList.length == 0 ||
            dietList[0]?.diet_start_date_set_by == "Default"
              ? true
              : false,
          message:
            "This Tracker will be Functional upon receiving your diet 1 & setting a start date.",
          button_text: "Stay Tuned",
        },
      },
    };

    // Upper message condition (unchanged, session-based)
    const currentSession = Number(results[0]?.sent_sessions);
    const midSessionWeightFilled =
      Number(dietList[0]?.mid_session_weight) !== 0;
    if (
      (currentSession === 1 && midSessionWeightFilled) ||
      currentSession > 1
    ) {
      response.upper_message = `<p style='font-size:18px;text-align:center;'>You have ${actionText} <span style='color:${color}'><b>${absoluteDifference}</b></span> kgs in this Program.</p>`;
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error("Error in getWeightList:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
export const addWeight = async (req, res, next) => {
  try {
    const {
      user_id,
      order_id,
      session,
      diet_id,
      weight_day,
      weight,
      mentor_id,
    } = req.body;

    if (!user_id || !order_id || !weight || isNaN(Number(weight))) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "sop.sent_sessions",
        "ud.active_order_id",
        "sop.program_type",
        "ud.first_name",
        "ud.last_name",
        "ud.mentor_assigned",
        "ps.program_sessions",
        "ud.sub_user_status",
        "ps.validity", // To determine cleanse program duration (1 or 3 days)
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "INNER",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
      ],
    });

    const { results: dietList } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_id",
        "dsl.diet_start_date",
        "dsl.start_session_weight",
        "dsl.session",
        "dsl.mid_session_weight",
        "dsl.end_session_weight",
      ],
      conditions: [
        { field: "dsl.sub_order_id", operator: "=", value: order_id },
        ...(Number(results[0].active_order_id) === Number(order_id)
          ? [
              {
                field: "dsl.session",
                operator: "=",
                value: results[0]?.sent_sessions,
              },
              {
                field: "dsl.diet_status",
                operator: "=",
                value: "4",
              },
            ]
          : []),
      ],
    });

    const dietStartDate = moment(dietList[0]?.diet_start_date).format(
      "YYYY-MM-DD"
    );

    let weightDay = null;

    const programSessions = Number(results[0]?.program_sessions);
    const isCleanseProgram = programSessions == 1; // Cleanse programs have 1 session

    const startWeightFilled = Number(dietList[0]?.start_session_weight) !== 0;
    let dayUpdate = "";
    if (isCleanseProgram) {
      weightDay = startWeightFilled ? "end" : "start";
    } else {
      const daysSinceStart = moment().diff(dietStartDate, "days");
      if (daysSinceStart <= 2) {
        weightDay = "start";
        dayUpdate = "0";
      } else if (daysSinceStart <= 7) {
        weightDay = "mid";
        dayUpdate = "5";
      } else if (daysSinceStart >= 10) {
        weightDay = "end";
        dayUpdate = "10";
      }
      if (weight_day == "other") {
        dayUpdate = 2;
      }
      if (weight_day == 2 || weight_day == 3) {
        dayUpdate = 2;
      }
      if (weight_day == "0") {
        dayUpdate = "0";
      }
      if (weight_day == 5) {
        dayUpdate = 5;
      }
      if (weight_day == 10) {
        dayUpdate = 10;
      }
    }
    let actual_weight_day = "";
    if (weight_day == "start") {
      actual_weight_day = dayUpdate;
    } else if (weight_day == "mid") {
      actual_weight_day = dayUpdate;
    } else if (weight_day == "end") {
      actual_weight_day = dayUpdate;
    } else {
      actual_weight_day = dayUpdate;
    }

    if (!results.length) {
      return next(new ErrorHandler("User not found with this UserId", 400));
    }

    const {
      sent_sessions,
      first_name,
      last_name,
      mentor_assigned,
      program_sessions,
      validity,
    } = results[0];
    const cleanseEndDay = isCleanseProgram
      ? validity === 1
        ? 2
        : validity === 3
        ? 4
        : 10
      : 10;

    if (weight_day == "other") {
      dayUpdate = 2;
    }

    if (isCleanseProgram) {
      dayUpdate = startWeightFilled ? "2" : "0";
    }

    const numericWeightDay = Number(dayUpdate);
    const numericSession = Number(session) || 0;
    const cleanseDuration = Number(validity); // 1 or 3 days

    const weightRecordBase = {
      user_id,
      sub_order_id: order_id,
      weight,
      posted_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      added_by: mentor_id ? "1" : "0",
      added_by_id: mentor_id || user_id,
    };

    let message = "Weight Added Successfully";
    let amount_to_add = 0;
    let dietUpdate = {};

    if (sent_sessions === 1 && numericWeightDay === 0) {
      const insertResult = await insertRecord(
        tables.weightRecords,
        [
          "user_id",
          "sub_order_id",
          "session",
          "days",
          "weight",
          "posted_date",
          "added_by",
          "added_by_id",
          "weight_acknowledge",
        ],
        [
          user_id,
          order_id,
          0,
          actual_weight_day,
          weight,
          weightRecordBase.posted_date,
          weightRecordBase.added_by,
          weightRecordBase.added_by_id,
          "0",
        ]
      );

      if (!insertResult || insertResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to add weight record", 500));
      }

      await updateRecord(
        tables.subOrderPrograms,
        { start_program_weight: weight },
        { sub_order_id: order_id }
      );
      await updateRecord(
        tables.dietSessionLog,
        { start_session_weight: weight },
        { sub_order_id: order_id, session: sent_sessions }
      );
      await updateRecord(
        tables.userDetails,
        { start_weight: weight, latest_weight: weight },
        { user_id }
      );

      amount_to_add = 150;
      message = "Start Program Weight Updated Successfully";
      await addAmountWallet({
        user_id,
        amount: amount_to_add,
        reason: "Start Weight Updated",
        sub_order_id: order_id,
      });
    } else if (
      numericWeightDay === 5 || // Mid-session weight for regular programs
      numericWeightDay === 10 || // End-session weight for regular programs
      (isCleanseProgram &&
        ((cleanseDuration === 1 && numericWeightDay === 2) || // End weight for 1-day cleanse
          (cleanseDuration === 3 && numericWeightDay === 4))) // End weight for 3-day cleanse
    ) {
      if (!diet_id || !session) {
        return next(
          new ErrorHandler(
            "Diet ID and session required for mid/end weight",
            400
          )
        );
      }

      const insertResult = await insertRecord(
        tables.weightRecords,
        [
          "user_id",
          "sub_order_id",
          "diet_id",
          "session",
          "days",
          "weight",
          "posted_date",
          "added_by",
          "added_by_id",
          "weight_acknowledge",
        ],
        [
          user_id,
          order_id,
          diet_id,
          numericSession,
          actual_weight_day ? actual_weight_day : numericWeightDay,
          weight,
          moment(weightRecordBase.posted_date).format("YYYY-MM-DD HH:mm:ss"),
          weightRecordBase.added_by,
          weightRecordBase.added_by_id,
          "0",
        ]
      );
      console.log(weight_day, 710);
      let ma = results[0]?.mentor_assigned;
      console.log(ma, 712);
      if (weight_day == "end") {
        // addAutoDraftForWeightUpdate({
        //   user_id,
        //   weight_day: 10,
        //   weight,
        //   session,
        //   mentor_id,
        // });

        // addWeightAutoChat({
        //   diet_id,
        //   weight_day: 10,
        //   weight,
        //   session,
        //   user_id,
        //   mentor_id:ma,
        // });

        await tenthDayRecievedChat({ user_id });

        console.log(weight_day, 728);
      } else if (weight_day == "mid") {
        // addAutoDraftForWeightUpdateFifthDay({
        //   session,
        //   user_id,
        //   weight,
        //   weight_day: 5,
        //   mentor_id,
        // });

        // addWeightAutoChat({
        //   diet_id,
        //   weight_day: 5,
        //   weight,
        //   session,
        //   user_id,
        //   mentor_id:ma,
        // });
        await fifthDayRecievedChat({ user_id });

        console.log(weight_day, 745);
      }
      if (!insertResult || insertResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to add weight record", 500));
      }

      const isMidSession = numericWeightDay === 5;
      const isEndSession =
        numericWeightDay === 10 ||
        (isCleanseProgram &&
          ((cleanseDuration === 1 && numericWeightDay === 2) ||
            (cleanseDuration === 3 && numericWeightDay === 4)));

      dietUpdate = isMidSession
        ? { mid_session_weight: weight }
        : { end_session_weight: weight };

      const dietUpdateResult = await updateRecord(
        tables.dietSessionLog,
        dietUpdate,
        { sub_order_id: order_id, session: numericSession }
      );

      if (!dietUpdateResult || dietUpdateResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update diet session log", 500));
      }

      await updateRecord(
        tables.userDetails,
        { latest_weight: weight },
        { user_id }
      );

      amount_to_add = isMidSession ? 50 : 150;
      message = isMidSession
        ? "Mid Session Weight Updated Successfully"
        : "End Session Weight Updated Successfully";

      await addAmountWallet({
        user_id,
        amount: amount_to_add,
        reason: isMidSession
          ? "Mid Session Weight Updated"
          : "End Session Weight Updated",
        sub_order_id: order_id,
      });
    } else if (sent_sessions !== 1 && numericWeightDay === 0) {
      if (!diet_id || !session) {
        return next(
          new ErrorHandler(
            "Diet ID and session required for mid/end weight",
            400
          )
        );
      }

      const insertResult = await insertRecord(
        tables.weightRecords,
        [
          "user_id",
          "sub_order_id",
          "diet_id",
          "session",
          "days",
          "weight",
          "posted_date",
          "added_by",
          "added_by_id",
          "weight_acknowledge",
        ],
        [
          user_id,
          order_id,
          diet_id,
          numericSession,
          actual_weight_day ? actual_weight_day : numericWeightDay,
          weight,
          moment(weightRecordBase.posted_date).format("YYYY-MM-DD HH:mm:ss"),
          weightRecordBase.added_by,
          weightRecordBase.added_by_id,
          "0",
        ]
      );
    } else if (
      numericWeightDay === 3 // End-session weight for regular programs
    ) {
      if (!diet_id || !session) {
        return next(
          new ErrorHandler(
            "Diet ID and session required for mid/end weight",
            400
          )
        );
      }

      const insertResult = await insertRecord(
        tables.weightRecords,
        [
          "user_id",
          "sub_order_id",
          "diet_id",
          "session",
          "days",
          "weight",
          "posted_date",
          "added_by",
          "added_by_id",
          "weight_acknowledge",
        ],
        [
          user_id,
          order_id,
          diet_id,
          numericSession,
          weight_day ? weight_day : numericWeightDay,
          weight,
          moment(weightRecordBase.posted_date).format("YYYY-MM-DD HH:mm:ss"),
          weightRecordBase.added_by,
          weightRecordBase.added_by_id,
          "0",
        ]
      );

      if (!insertResult || insertResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to add weight record", 500));
      }

      const updateWeight = await updateRecord(
        tables.userDetails,
        { latest_weight: weight },
        { user_id }
      );
      console.log(updateWeight, 833);
      console.log(weight_day, 833);
    } else if (
      numericWeightDay === 2 // End-session weight for regular programs
    ) {
      if (!diet_id || !session) {
        return next(
          new ErrorHandler(
            "Diet ID and session required for mid/end weight",
            400
          )
        );
      }

      const insertResult = await insertRecord(
        tables.weightRecords,
        [
          "user_id",
          "sub_order_id",
          "diet_id",
          "session",
          "days",
          "weight",
          "posted_date",
          "added_by",
          "added_by_id",
          "weight_acknowledge",
        ],
        [
          user_id,
          order_id,
          diet_id,
          numericSession,
          numericWeightDay,
          weight,
          moment(weightRecordBase.posted_date).format("YYYY-MM-DD HH:mm:ss"),
          weightRecordBase.added_by,
          weightRecordBase.added_by_id,
          "0",
        ]
      );

      if (!insertResult || insertResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to add weight record", 500));
      }

      const updateWeight = await updateRecord(
        tables.userDetails,
        { latest_weight: weight },
        { user_id }
      );
      console.log(updateWeight, 833);
      console.log(weight_day, 833);
    } else {
      return next(new ErrorHandler("Invalid weight_day value", 400));
    }

    const { results: inchRecords } = await readRecord({
      table: `${tables.inchRecords} ir`,
      selectFields: ["days"],
      conditions: [
        { field: "ir.sub_order_id", operator: "=", value: order_id },
        { field: "ir.session", operator: "=", value: numericSession },
      ],
      orderBy: ["ir.days DESC"],
    });

    const hasStartInch = inchRecords.some(
      (record) => record.days === 0 || record.days === 1
    );
    const hasEndInch = inchRecords.some(
      (record) =>
        record.days === 10 ||
        (isCleanseProgram &&
          ((cleanseDuration === 1 && record.days === 2) ||
            (cleanseDuration === 3 && record.days === 4)))
    );
    let askInch = false;

    if (sent_sessions === 1 && numericWeightDay === 0 && !hasStartInch) {
      askInch = true;
    } else if (
      (numericWeightDay === 10 ||
        (isCleanseProgram &&
          ((cleanseDuration === 1 && numericWeightDay === 2) ||
            (cleanseDuration === 3 && numericWeightDay === 4)))) &&
      !hasEndInch
    ) {
      askInch = true;
    }

    const notificationTitle =
      numericWeightDay === 0
        ? `${first_name} ${last_name} Has Updated Start Weight`
        : numericWeightDay === 5
        ? `${first_name} ${last_name} Has Updated Mid Session Weight`
        : `${first_name} ${last_name} Has Updated End Session Weight`;

    const notificationData = {
      title: notificationTitle,
      priority: 3,
      redirect: "/weight",
    };

    const notificationResult = await insertRecord(
      tables.mentorNotifications,
      ["user_id", "admin_id", "content", "redirect"],
      [user_id, mentor_assigned, notificationTitle, "/weight"]
    );

    if (!notificationResult || notificationResult.affectedRows === 0) {
      console.warn(`Failed to insert notification for user ${user_id}`);
    }

    if (mentor_assigned) {
      if (numericWeightDay === 5 || numericWeightDay === 10) {
        sendSSEEvent({ mentor_id: mentor_assigned, data: notificationData });
      }
    }

    if (sent_sessions === program_sessions && numericWeightDay === 10) {
      await updateMaintenanceStatus({ user_id });
    }

    if (
      results[0]?.program_type == 0 &&
      !(sent_sessions === program_sessions && numericWeightDay === 10)
    ) {
      await updateRecord(
        tables.userDetails,
        { sub_user_status: "Active" },
        { user_id }
      );
    }
    return res.status(200).json({
      status: "success",
      message,
      wallet_amount: amount_to_add,
      ask_inch: askInch,
    });
  } catch (error) {
    console.error("Error in addWeight:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const ackWeight = async (req, res, next) => {
  try {
    const { weight_id,user_id } = req.body;

    // Validate required fields
    if (!weight_id || !user_id  ) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const weightUpdatedResult = await updateRecord(
      tables.weightRecords,
      {
        weight_acknowledge: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { wmr_id: weight_id }
    );

    if (!weightUpdatedResult || weightUpdatedResult.affectedRows === 0) {

      const weightUpdatedResult1 = await updateRecord(
      tables.weightRecords,
      {
        weight_acknowledge: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { user_id: user_id }
    );
      if (!weightUpdatedResult1 || weightUpdatedResult1.affectedRows === 0) {
      return next(
        new ErrorHandler("Weight record not found or not updated", 404)
      );
    }else{      
      return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Weight Acknowledge Successfully",
      })
    );  
    }
  }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Weight Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const ackLeadWeight = async (req, res, next) => {
  try {
    const { id } = req.body;

    // Validate required fields
    if (!id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const weightUpdatedResult = await updateRecord(
      tables.weightRecordsLead,
      {
        weight_acknowledge: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { id }
    );

    if (!weightUpdatedResult || weightUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Weight record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Weight Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const editWeight = async (req, res, next) => {
  try {
    const {
      weight_id,
      session,
      weight_day,
      weight,
      sub_order_id,
      user_id,
      posted_date,
    } = req.body;

    // Validate required fields
    if (
      !weight_id ||
      !session ||
      !weight_day ||
      !weight ||
      isNaN(Number(weight)) ||
      !sub_order_id ||
      !user_id
    ) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const numericDay = Number(weight_day);
    const numericSession = Number(session);
    const numericWeight = Number(weight);

    // Validate day value
    if (![0, 5, 10, 2, 3].includes(numericDay)) {
      return next(
        new ErrorHandler("Invalid day value; must be 0, 5, or 10", 400)
      );
    }

    // Fetch sent_sessions to check if it's the current session
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["sop.sent_sessions"],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
    });

    if (!results.length) {
      return next(new ErrorHandler("User not found with this UserId", 400));
    }

    const { sent_sessions } = results[0];
    const isCurrentSession = Number(sent_sessions) === numericSession;

    // Check existing weight_day for the weight record
    const { results: existingWeight } = await readRecord({
      table: tables.weightRecords,
      selectFields: ["days"],
      conditions: [{ field: "wmr_id", operator: "=", value: weight_id }],
    });

    if (!existingWeight.length) {
      return next(new ErrorHandler("Weight record not found", 404));
    }

    const previousDay = Number(existingWeight[0].days);
    const isDayChangedFrom10To5 = previousDay === 10 && numericDay === 5;

    // Update weight_records

    const updatePayload = {
      weight: numericWeight,
      days: numericDay,
      session: numericSession,
      ...(posted_date && { posted_date }), // include only if posted_date has a truthy value
    };

    const weightUpdatedResult = await updateRecord(
      tables.weightRecords,
      updatePayload,
      { wmr_id: weight_id }
    );

    if (!weightUpdatedResult || weightUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Weight record not found or not updated", 404)
      );
    }

    if (numericDay === 0) {
      // Update dietSessionLog start_session_weight
      const dietUpdateResult = await updateRecord(
        tables.dietSessionLog,
        { start_session_weight: numericWeight },
        { sub_order_id, session: numericSession == 0 ? 1 : numericSession }
      );

      if (!dietUpdateResult || dietUpdateResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Failed to update start session weight", 500)
        );
      }

      // Update subOrderPrograms start_program_weight
      const programUpdateResult = await updateRecord(
        tables.subOrderPrograms,
        { start_program_weight: numericWeight },
        { sub_order_id }
      );

      if (!programUpdateResult || programUpdateResult.affectedRows === 0) {
        console.warn(
          `Failed to update start_program_weight for sub_order_id ${sub_order_id}`
        );
      }

      // Update userDetails
      const userUpdateData = { start_weight: numericWeight };
      if (isCurrentSession) {
        userUpdateData.latest_weight = numericWeight;
      }

      const userUpdateResult = await updateRecord(
        tables.userDetails,
        userUpdateData,
        { user_id }
      );

      if (!userUpdateResult || userUpdateResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update user details", 400));
      }
    } else if (numericDay === 5) {
      // Update dietSessionLog mid_session_weight
      const dietUpdateResult = await updateRecord(
        tables.dietSessionLog,
        { mid_session_weight: numericWeight },
        { sub_order_id, session: numericSession }
      );

      if (!dietUpdateResult || dietUpdateResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Failed to update mid session weight", 400)
        );
      }

      if (isDayChangedFrom10To5) {
        const resetEndWeightResult = await updateRecord(
          tables.dietSessionLog,
          { end_session_weight: null },
          { sub_order_id, session: numericSession }
        );

        if (!resetEndWeightResult || resetEndWeightResult.affectedRows === 0) {
          console.warn(
            `Failed to reset end_session_weight for sub_order_id ${sub_order_id}, session ${numericSession}`
          );
        }

        const { results: nextSessionCheck } = await readRecord({
          table: tables.dietSessionLog,
          selectFields: ["session"],
          conditions: [
            { field: "sub_order_id", operator: "=", value: sub_order_id },
            { field: "session", operator: "=", value: numericSession + 1 },
          ],
        });

        if (nextSessionCheck.length > 0) {
          const nextSessionUpdateResult = await updateRecord(
            tables.dietSessionLog,
            { start_session_weight: 0 },
            { sub_order_id, session: numericSession + 1 }
          );

          if (
            !nextSessionUpdateResult ||
            nextSessionUpdateResult.affectedRows === 0
          ) {
            console.warn(
              `Failed to reset start_session_weight for sub_order_id ${sub_order_id}, session ${
                numericSession + 1
              }`
            );
          }
        }
      }

      if (isCurrentSession) {
        const userUpdateResult = await updateRecord(
          tables.userDetails,
          { latest_weight: numericWeight },
          { user_id }
        );

        if (!userUpdateResult || userUpdateResult.affectedRows === 0) {
          return next(new ErrorHandler("Failed to update user details", 500));
        }
      }
    } else if (numericDay === 10) {
      const endWeightUpdateResult = await updateRecord(
        tables.dietSessionLog,
        { end_session_weight: numericWeight },
        { sub_order_id, session: numericSession }
      );

      if (!endWeightUpdateResult || endWeightUpdateResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Failed to update end session weight", 500)
        );
      }

      const { results: nextSessionCheck } = await readRecord({
        table: tables.dietSessionLog,
        selectFields: ["session"],
        conditions: [
          { field: "sub_order_id", operator: "=", value: sub_order_id },
          { field: "session", operator: "=", value: numericSession + 1 },
        ],
      });

      if (nextSessionCheck.length > 0) {
        const nextSessionUpdateResult = await updateRecord(
          tables.dietSessionLog,
          { start_session_weight: numericWeight },
          { sub_order_id, session: numericSession + 1 }
        );

        if (
          !nextSessionUpdateResult ||
          nextSessionUpdateResult.affectedRows === 0
        ) {
          console.warn(
            `Failed to update start_session_weight for sub_order_id ${sub_order_id}, session ${
              numericSession + 1
            }`
          );
        }
      }
      if (isCurrentSession) {
        const userUpdateResult = await updateRecord(
          tables.userDetails,
          { latest_weight: numericWeight },
          { user_id }
        );

        if (!userUpdateResult || userUpdateResult.affectedRows === 0) {
          return next(new ErrorHandler("Failed to update user details", 500));
        }
      }
    } else if (numericDay === 2 || numericDay === 3) {
      const userUpdateResult = await updateRecord(
        tables.userDetails,
        { latest_weight: numericWeight },
        { user_id }
      );

      if (!userUpdateResult || userUpdateResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update user details", 500));
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Weight updated successfully",
        data: { weight_id, updated_weight: numericWeight },
      })
    );
  } catch (error) {
    console.error("Error in editWeight:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addWeightLead = async (req, res, next) => {
  const { user_id, weight } = req.body;
  try {
    const columns = ["user_id", "weight"];
    const values = [user_id, weight];
    const insertResult = await insertRecord(
      `${tables.weightRecordsLead}`,
      columns,
      values
    );

    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Error adding weight lead", 400));
    }
    await updateRecord(
      `${tables.userDetails}`,
      { latest_weight: weight },
      { user_id }
    );
    await addAmountWallet({
      user_id,
      amount: 100,
      reason: "Weight Added",
    });
    const { totalCount, results: weightRecordLeads } = await readRecord({
      table: tables.weightRecordsLead,
      selectFields: ["*"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["added_date"],
      countTotal: true,
    });

    const { results: userDetails } = await readRecord({
      table: tables.userDetails,
      selectFields: ["*"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    let show_milestone = false;
    if (totalCount > 1) {
      let start_weight, end_weight;
      start_weight = weightRecordLeads[0].weight;
      end_weight = weightRecordLeads[totalCount - 1].weight;
      const weightLoss = end_weight - start_weight;
      console.log(weightLoss, 99229922);
      if (weightLoss < 0 && Math.abs(weightLoss) > 2) {
        show_milestone = true;
      }
    }

    if (userDetails[0].user_type == 1) {
      show_milestone = false;
    }
    console.log(weightRecordLeads, 1122334455);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Weight lead added successfully",
      wallet_amount: 100,
      data: insertResult.insertId,
      meta_data: {
        show_feedback_popup: totalCount > 1,
        show_milestone,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getWeightListLead = async (req, res, next) => {
  const { user_id } = req.body;

  try {
    const { results: users } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });

    if (users.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }

    const userDetails = users[0];

    const { results: hs } = await readRecord({
      table: tables.healthScoreClient,
      selectFields: ["*"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    const { results, totalCount } = await readRecord({
      table: tables.weightRecordsLead,
      selectFields: ["user_id", "weight", "added_date","weight_acknowledge","id"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["added_date"],
      countTotal: true,
    });

    const finalData = results;

    if (finalData.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "Weight lead fetched successfully",
        data: [],
        hs_taken: hs.length > 0,
        goal_weight_status_text: `<span style='color: red;'><b>You are ${
          userDetails?.latest_weight || 0
        } kg of current weight</b></span>`,
        current_weight: userDetails.latest_weight,
        goal_weight: hs[0]?.goal_weight || null,
        ideal_weight: hs[0]?.ideal_weight || null,
        is_weight_pending: true,
      });
    }
    let weight_due = false;
    if (hs.length > 0 && results.length === 0) {
      weight_due =
        moment().diff(moment(hs[0].created), "days") >= 1 ? true : false;
    }
    if (results.length > 0) {
      weight_due =
        moment().diff(results[totalCount - 1]?.added_date, "days") >= 1
          ? true
          : false;
    }
    let prevWeight = parseFloat(finalData[0].weight);
    const transformedData = finalData.map((item, index) => {
      const weight = parseFloat(item.weight);
      let difference = 0;
      let color = "black";

      if (index > 0) {
        difference = weight - prevWeight;

        if (difference < 0) {
          color = "green"; // Weight loss
        } else if (difference > 0) {
          color = "red"; // Weight gain
        } else {
          color = "black";
        }
      }
      prevWeight = weight;

      return {
        weight: item.weight,
        difference: difference.toFixed(2),
        color,
        added_date: moment(item.added_date).format("DD-MM-YYYY"),
        weight_acknowledge: item.weight_acknowledge,
        id: item.id,
      };
    });
    const apiResponse = {
      status: "success",
      message: "Weight lead fetched successfully",
      data: transformedData,
      hs_taken: hs.length > 0,
      ...(transformedData.length > 0 && {
        goal_weight_status_text: ``,
      }),
      current_weight: userDetails.latest_weight,
      goal_weight: hs[0]?.goal_weight || null,
      ideal_weight: hs[0]?.ideal_weight || null,
      is_weight_pending: weight_due,
    };

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const deleteWeight = async (req, res, next) => {
  try {
    const { sub_order_id, session, day, user_id, weight_id } = req.body;

    if (!sub_order_id || !session || !day || !user_id) {
      return next(
        new ErrorHandler(
          "Missing required fields: sub_order_id, session, day, or user_id",
          400
        )
      );
    }

    const numericSession = Number(session);
    const numericDay = Number(day);

    if (![0, 5, 10, 3, 2].includes(numericDay)) {
      return next(
        new ErrorHandler("Invalid day value; must be 0, 5, or 10", 400)
      );
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["sop.sent_sessions"],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "INNER",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
    });

    if (!results.length) {
      return next(new ErrorHandler("User not found with this UserId", 400));
    }

    const { sent_sessions } = results[0];
    const isCurrentSession = sent_sessions === numericSession;

    const deleteResult = await deleteRecords(tables.weightRecords, null, {
      sub_order_id,
      session: numericSession,
      days: numericDay,
      wmr_id: weight_id,
    });

    if (!deleteResult || deleteResult.affectedRows === 0) {
      return next(new ErrorHandler("No weight record found to delete", 404));
    }

    const weightField =
      numericDay === 0
        ? "start_session_weight"
        : numericDay === 5
        ? "mid_session_weight"
        : "end_session_weight";

    const dietUpdateResult = await updateRecord(
      tables.dietSessionLog,
      { [weightField]: 0 },
      { sub_order_id, session: numericSession }
    );

    if (!dietUpdateResult || dietUpdateResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update diet session log", 500));
    }

    if (numericDay === 0) {
      const programUpdateResult = await updateRecord(
        tables.subOrderPrograms,
        { start_program_weight: 0 },
        { sub_order_id }
      );

      if (!programUpdateResult || programUpdateResult.affectedRows === 0) {
        console.warn(
          `Failed to reset start_program_weight for sub_order_id ${sub_order_id}`
        );
      }
    }

    if (numericDay === 10) {
      const { results: nextSessionCheck } = await readRecord({
        table: tables.dietSessionLog,
        selectFields: ["session"],
        conditions: [
          { field: "sub_order_id", operator: "=", value: sub_order_id },
          { field: "session", operator: "=", value: numericSession + 1 },
        ],
      });

      if (nextSessionCheck.length > 0) {
        const nextSessionUpdateResult = await updateRecord(
          tables.dietSessionLog,
          { start_session_weight: 0 },
          { sub_order_id, session: numericSession + 1 }
        );

        if (
          !nextSessionUpdateResult ||
          nextSessionUpdateResult.affectedRows === 0
        ) {
          console.warn(
            `Failed to reset start_session_weight for next session ${
              numericSession + 1
            } on sub_order_id ${sub_order_id}`
          );
        }
      }
    }

    if (isCurrentSession) {
      const userUpdateResult = await updateRecord(
        tables.userDetails,
        { latest_weight: 0 },
        { user_id }
      );

      if (!userUpdateResult || userUpdateResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update user details", 500));
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Weight record deleted and session log updated successfully",
        data: { sub_order_id, session: numericSession, day: numericDay },
      })
    );
  } catch (error) {
    console.error("Error in deleteWeight:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
