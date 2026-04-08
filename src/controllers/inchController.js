import moment from "moment";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../config/query.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { addAmountWallet } from "../helper/common.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
export const getInchList = async (req, res) => {
  const { user_id, order_id } = req.body;

  try {
    if (
      !order_id ||
      order_id === "" ||
      order_id === undefined ||
      order_id === null
    ) {
      return res.status(400).json({ message: "Invalid or missing order_id" });
    }

    let inchListResponse = [];

    // Get order details
    const orderColumns = [
      "sod.order_id",
      "pm.program_name",
      "ps.program_sessions",
      "ps.validity",
      "ps.extra_validity",
      "pm.program_category as program_category",
      "ps.ask_imf_window",
      "sod.sent_sessions",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sod.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sod.program_id = pm.program_id",
      },
    ];
    const conditions = [
      { field: "sod.sub_order_id", operator: "=", value: order_id },
    ];
    const { results: active_order_details } = await readRecord({
      table: `${tables.subOrderPrograms} sod`,
      selectFields: orderColumns,
      joins: joins,
      conditions: conditions,
    });

    if (!active_order_details.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const { program_sessions, validity, sent_sessions, program_name } =
      active_order_details[0];
    const isCleanseProgram = program_sessions === 1;
    const cleanseDuration = Number(validity);
    const cleanseEndDay = isCleanseProgram
      ? cleanseDuration === 1
        ? 2
        : cleanseDuration === 3
        ? 4
        : 10
      : 10;

    // Fetch inch records
    const inchListTable = tables.inchRecords;
    const selectInchListColumns = ["*"];
    const inchListWhereCondition = [
      { field: "sub_order_id", operator: "=", value: order_id },
    ];
    const { results: inchList } = await readRecord({
      table: inchListTable,
      selectFields: selectInchListColumns,
      conditions: inchListWhereCondition,
      orderBy: ["inch_id ASC"],
    });

    const inchTrackerList = inchList;
    const hasDayZero = inchList.some(record => Number(record.days) === 0);
    const topLevelInchDay = hasDayZero ? 10 : 0;

    for (let i = 0; i < inchTrackerList.length; i++) {
    
      const program_type = "Loss";
      let chest_difference = 0;
      let waist_difference = 0;
      let hips_difference = 0;
      

      if (i > 0) {
        chest_difference =
          inchTrackerList[i - 1].chest - inchTrackerList[i].chest;
        waist_difference =
          inchTrackerList[i - 1].waist - inchTrackerList[i].waist;
        hips_difference = inchTrackerList[i - 1].hips - inchTrackerList[i].hips;
      }

      let chest_color = "#000000";
      let waist_color = "#000000";
      let hips_color = "#000000";

      if (program_type === "Loss") {
        chest_color =
          chest_difference < 0
            ? "#2fc56e"
            : chest_difference > 0
            ? "#ff0000"
            : "#000000";
        waist_color =
          waist_difference < 0
            ? "#2fc56e"
            : waist_difference > 0
            ? "#ff0000"
            : "#000000";
        hips_color =
          hips_difference < 0
            ? "#2fc56e"
            : hips_difference > 0
            ? "#ff0000"
            : "#000000";
      } else {
        chest_color =
          chest_difference > 0
            ? "#2fc56e"
            : chest_difference < 0
            ? "#ff0000"
            : "#000000";
        waist_color =
          waist_difference > 0
            ? "#2fc56e"
            : waist_difference < 0
            ? "#ff0000"
            : "#000000";
        hips_color =
          hips_difference > 0
            ? "#2fc56e"
            : hips_difference < 0
            ? "#ff0000"
            : "#000000";
      }

      const responseInchList = {
        session: (inchTrackerList[i].days == '0')?'0':inchTrackerList[i].session,
        session_days: inchTrackerList[i].days,
        chest: inchTrackerList[i].chest,
        waist: inchTrackerList[i].waist,
        hips: inchTrackerList[i].hips,
        inch_acknowledge:inchTrackerList[i].inch_acknowledge,
        chest_color,
        waist_color,
        hips_color,
        posted_date: moment(inchTrackerList[i].posted_date).format(
          "YYYY-MM-DD"
        ),
      };
      inchListResponse.push(responseInchList);
    }

    const dietListTable = tables.dietSessionLog;
    const selectDietListColumns = ["diet_start_date", "end_session_inch","diet_id","diet_start_date_set_by"];
    const dietListWhereCondition = [
      { field: "sub_order_id", operator: "=", value: order_id },
      { field: "diet_status", operator: "=", value: "4" },
      { field: "session", operator: "=", value: sent_sessions },
    ];
    const { results: dietList } = await readRecord({
      table: dietListTable,
      selectFields: selectDietListColumns,
      conditions: dietListWhereCondition,
      orderBy: ["diet_id DESC"],
    });

    let inch_update_due = false;
    if (dietList.length > 0) {
      const latestDietSent = dietList[0];
      const dietStartMoment = moment(latestDietSent.diet_start_date);
      const twoDaysAgo = moment().subtract(2, "days");
      const now = moment();
      if (
        dietStartMoment.isValid() &&
        Number(latestDietSent.end_session_inch) === 0
      ) {
        const daysSinceStart = moment().diff(dietStartMoment, "days");

        const hasStartInch = inchTrackerList.some(
          (inch) => inch.days == 0 && (inch.session == 1 || inch.session == 0)
        );
        if (dietStartMoment.isBetween(twoDaysAgo, now, undefined, "[]") && !hasStartInch) {
          inch_update_due = true;
        }
        const endDay = isCleanseProgram ? cleanseEndDay : 10;
        console.log(hasStartInch, daysSinceStart, endDay, 193);
        inch_update_due = Number(daysSinceStart) >= Number(endDay);
      }
    }
    

    const { totalCount: prevCount } = await readRecord({
      table: `${tables.inchRecords} ir`,
      selectFields: ["ir.inch_id"],
      conditions: [
        { field: "ir.user_id", operator: "=", value: user_id },
        { field: "ir.sub_order_id", operator: "!=", value: order_id },
      ],
      countTotal: true,
    });

    console.log(dietList,32323232);

    return res.status(200).json({
      status: true,
      message: "Inch List Fetched Successfully.",
      screen_name: "Inch Tracker",
      program_name,
      inch_update_due,
      inch_day:topLevelInchDay,
      current_session: sent_sessions,
      previous_tracker: prevCount > 0,
      data: {
        inch_list: inchListResponse,
        popup_data:{
          showPopup:(dietList.length == 0 || dietList[0]?.diet_start_date_set_by == 'Default')?true:false,
          message: 'This Tracker will be Functional upon receiving your diet 1 & setting a start date.',
          button_text: 'Stay Tuned',
        }
      },
    });
  } catch (error) {
    console.error("Error in getInchList:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const ackInch = async (req, res, next) => {
  try {
    const { inch_id } =  req.body;

    // Validate required fields
    if (  !inch_id    ) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const inchUpdatedResult = await updateRecord(
      tables.inchRecords,
      { inch_acknowledge: 1 ,ack_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { inch_id: inch_id }
    );

    if (!inchUpdatedResult || inchUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Inch record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Inch Acknowledge Successfully",
        
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addInch = async (req, res, next) => {
  try {
    const {
      user_id,
      order_id,
      diet_id,
      mentor_id,
      session,
      waist,
      chest,
      hips,
    } = req.body;
    const inch_day = String(req.body.inch_day);
    // Validate required fields
    if (
      !user_id ||
      !order_id ||
      !session ||
      !diet_id ||
      !inch_day ||
      !waist ||
      !chest ||
      !hips
    ) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const numericInchDay = Number(inch_day);
    const numericSession = Number(session);

    // Fetch user and program details
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "sop.sent_sessions",
        "ud.first_name",
        "ud.last_name",
        "ud.mentor_assigned",
        "ps.program_sessions",
        "ps.validity",
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
    const isCleanseProgram = program_sessions === 1;
    const cleanseDuration = Number(validity);
    const cleanseEndDay = isCleanseProgram
      ? cleanseDuration === 1
        ? 2
        : cleanseDuration === 3
        ? 4
        : 10
      : 10;

    // Validate inch_day based on program type
    const validEndDays = isCleanseProgram ? [0, cleanseEndDay] : [0, 10];
    if (!validEndDays.includes(numericInchDay)) {
      return next(
        new ErrorHandler(
          `Invalid inch_day value; must be 0 or ${
            isCleanseProgram ? cleanseEndDay : 10
          } for this program`,
          400
        )
      );
    }

    // if (numericInchDay === 0) {
    //   if (![0, 1].includes(numericSession) || sent_sessions > 1) {
    //     return next(
    //       new ErrorHandler(
    //         "Start inch can only be added for session 0 or 1 in the first sent session",
    //         400
    //       )
    //     );
    //   }
    // } else {
    //   if (numericSession !== sent_sessions) {
    //     return next(
    //       new ErrorHandler(
    //         `End inch can only be added for the current sent session (${sent_sessions})`,
    //         400
    //       )
    //     );
    //   }
    // }

    const inchRecordBase = {
      user_id,
      sub_order_id: order_id,
      diet_id,
      session: numericSession,
      days: numericInchDay,
      chest: Number(chest),
      waist: Number(waist),
      hips: Number(hips),
      posted_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      added_by: mentor_id ? "1" : "0",
    };

    let message = "Inch Added Successfully";
    let amount_to_add = 300;

    const insertResult = await insertRecord(
      tables.inchRecords,
      [
        "user_id",
        "sub_order_id",
        "diet_id",
        "session",
        "days",
        "chest",
        "waist",
        "hips",
        "posted_date",
        "added_by",
      ],
      [
        inchRecordBase.user_id,
        inchRecordBase.sub_order_id,
        inchRecordBase.diet_id,
        inchRecordBase.session,
        inchRecordBase.days,
        inchRecordBase.chest,
        inchRecordBase.waist,
        inchRecordBase.hips,
        inchRecordBase.posted_date,
        inchRecordBase.added_by,
      ]
    );

    if (!insertResult || insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add inch record", 500));
    }

    const inch_id = insertResult.insertId;

    const isEndInch = numericInchDay !== 0;
    if (isEndInch) {
      const dietUpdateResult = await updateRecord(
        tables.dietSessionLog,
        { end_session_inch: inch_id },
        { sub_order_id: order_id, session: numericSession }
      );

      if (!dietUpdateResult || dietUpdateResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update end session inch", 500));
      }

      amount_to_add = 300;
      message = "End Session Inch Added Successfully";
    }

    await addAmountWallet({
      user_id,
      amount: amount_to_add,
      reason: isEndInch ? "End Session Inch Updated" : "Inch Added",
      sub_order_id: order_id,
    });

    // Check for photo records
    const { results: photoData } = await readRecord({
      table: tables.photoRecords,
      selectFields: ["*"],
      conditions: [
        { field: "sub_order_id", operator: "=", value: order_id },
        { field: "session", operator: "=", value: numericSession },
      ],
    });

    const askPhoto = photoData.length === 0;

    const notificationTitle =
      numericInchDay === 0
        ? `${first_name} ${last_name} Has Updated Start Program Inch`
        : `${first_name} ${last_name} Has Updated End Session Inch`;

    const notificationData = {
      title: notificationTitle,
      priority: 3,
      redirect: "/inch",
    };

    await insertRecord(
      tables.mentorNotifications,
      ["user_id", "admin_id", "content", "redirect"],
      [user_id, mentor_assigned, notificationTitle, "/inch"]
    );

    if (mentor_assigned) {
      if(numericInchDay !== 0){
      sendSSEEvent({ mentor_id: mentor_assigned, data: notificationData });
      }
    }

    return res.status(200).json({
      status: "success",
      message,

      inch_id,
      wallet_amount: amount_to_add,
      ask_photo: askPhoto,
    });
  } catch (error) {
    console.error("Error in addInch:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const editInch = async (req, res, next) => {
  try {
    const { inch_id, chest, waist, hips, inch_day , posted_date } = req.body;
    const updatedInchResult = await updateRecord(
      `${tables.inchRecords}`,
      {
        ...(chest && { chest }),
        ...(waist && { waist }),
        ...(hips && { hips }),
        ...(inch_day && { days: inch_day }),
        ...(posted_date && { posted_date }),
      },
      {
        inch_id,
      }
    );
    if (updatedInchResult.affectedRows === 0) {
      return next(new ErrorHandler("Error updating Inch"));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Inch updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const deleteInch = async (req, res, next) => {
  try {
    const { sub_order_id, session, day, inch_id } = req.body;
    if (!sub_order_id || !session) {
      return next(
        new ErrorHandler(
          "Missing required fields: sub_order_id, session, or day",
          400
        )
      );
    }
    const deleteResult = await deleteRecords(tables.inchRecords, inch_id, {
      inch_id,
      sub_order_id,
    });

    if (!deleteResult.success) {
      return next(new ErrorHandler("No Inch record found to delete", 404));
    }
    const weightField = Number(day) === 10 ? "end_session_inch" : null;

    const updatedResult = await updateRecord(
      tables.dietSessionLog,
      { [weightField]: 0 },
      { session, sub_order_id }
    );

    if (!updatedResult || updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update diet session log", 404));
    }

    return res.status(200).json(
      new ApiResponse({
        status: 200,
        message: "Inch record deleted and session log updated successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
