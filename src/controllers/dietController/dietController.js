import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { app_versions, tables } from "../../helper/constant.js";
import dietDetails from "../../models/dietDetailsModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { sendDietInMail } from "../common.js";
import { sendMessage } from "../../utils/sendMessage.js";
import { uploadDietPdfToCloudinary } from "../../helper/dietPdfgeneration.js";

const addDietController = async (req, res, next) => {
  try {
    const {
      user_id,
      sub_order_id,
      session,
      diet_name,
      on_rising,
      breakfast,
      pre_breakfast,
      mid_morning,
      pre_workout,
      during_workout,
      pre_lunch,
      lunch,
      post_lunch,
      tea_eve,
      late_eve,
      pre_dinner,
      dinner,
      post_dinner,
      bed_time,
      attachments,
      diet_note,
      msg,
      comment,
      diet_id,
    } = req.body;

    let result;
    let dietId;

    if (diet_id) {
      result = await dietDetails.updateOne(
        { _id: diet_id },
        {
          $set: {
            diet_name,
            on_rising,
            breakfast,
            pre_breakfast,
            mid_morning,
            pre_workout,
            during_workout,
            pre_lunch,
            lunch,
            post_lunch,
            tea_eve,
            late_eve,
            pre_dinner,
            dinner,
            post_dinner,
            bed_time,
            attachments,
            diet_note,
            msg,
            comment,
          },
        }
      );
      if (diet_name) {
        await updateRecord(
          tables.dietSessionLog,
          {
            diet_name,
          },
          { diet_details_id: diet_id }
        );
      }
      if (!result || result.modifiedCount === 0) {
        return next(
          new ErrorHandler(
            "Error while updating diet details or no changes made",
            400
          )
        );
      }
      dietId = diet_id;

      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: `Diet Details updated successfully ${diet_id}`,
        data: {
          dietId,
        },
      });
      return res.status(200).json(apiresponse);
    } else {
      result = await dietDetails.create({
        diet_name,
        on_rising,
        breakfast,
        pre_breakfast,
        mid_morning,
        pre_workout,
        during_workout,
        pre_lunch,
        lunch,
        post_lunch,
        tea_eve,
        late_eve,
        pre_dinner,
        dinner,
        post_dinner,
        bed_time,
        attachments,
        diet_note,
        msg,
        comment,
      });

      if (!result) {
        return next(new ErrorHandler("Error while adding diet details", 400));
      }
      const buffer = Buffer.from(result._id, "hex");
      dietId = buffer.toString("hex");
      const { results: prevDiet } = await readRecord({
        table: `${tables.dietSessionLog} dsl`,
        selectFields: [
          "dsl.end_session_weight",
          "sop.total_sessions",
          "dsl.session",
        ],
        conditions: [
          {
            field: "dsl.sub_order_id",
            operator: "=",
            value: sub_order_id,
          },
          {
            field: "dsl.user_id",
            operator: "=",
            value: user_id,
          },
        ],
        joins: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = dsl.sub_order_id",
          },
        ],
        orderBy: ["dsl.session DESC"],
        pagination: { limit: 1 },
      });

      const columns = [
        "user_id",
        "diet_details_id",
        "sub_order_id",
        "session",
        "diet_name",
      ];
      const values = [user_id, dietId, sub_order_id, session, diet_name];

      if (
        prevDiet.length > 0 &&
        Number(prevDiet[0].session) <= Number(prevDiet[0].total_sessions)
      ) {
        const prevWeight = prevDiet[0].end_session_weight;
        columns.push("start_session_weight");
        values.push(prevWeight);
      }

      const sqlresult = await insertRecord(
        `${tables.dietSessionLog}`,
        columns,
        values
      );

      if (sqlresult.affectedRows === 0) {
        return next(
          new ErrorHandler("Error while adding diet session log", 400)
        );
      }

      await dietDetails.updateOne(
        {
          _id: dietId,
        },
        {
          $set: { diet_id: sqlresult.insertId },
        }
      );

      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: `Diet Details added successfully ${sqlresult.insertId}`,
        data: {
          dietId,
        },
      });
      return res.status(201).json(apiresponse);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editDietController = async (req, res, next) => {
  try {
    const {
      diet_id,
      diet_name,
      on_rising,
      breakfast,
      pre_breakfast,
      mid_morning,
      pre_workout,
      during_workout,
      pre_lunch,
      lunch,
      post_lunch,
      tea_eve,
      late_eve,
      pre_dinner,
      dinner,
      post_dinner,
      bed_time,
      attachments,
      diet_note,
      msg,
      comment,
    } = req.body;

    const result = await dietDetails.findByIdAndUpdate(
      { _id: diet_id },
      {
        diet_name,
        on_rising,
        breakfast,
        pre_breakfast,
        mid_morning,
        pre_workout,
        during_workout,
        pre_lunch,
        lunch,
        post_lunch,
        tea_eve,
        late_eve,
        pre_dinner,
        dinner,
        post_dinner,
        bed_time,
        attachments,
        diet_note,
        msg,
        comment,
      }
    );

    if (result.modifiedCount === 0) {
      return next(new ErrorHandler("Diet not found or no changes made", 400));
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet details updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDietByUserId = async (req, res, next) => {
  try {
    const { user_id, active_order_id } = req.body;

    const currentDietSelectFields = [
      "dsl.diet_details_id",
      "dsl.diet_sent_date",
      "dsl.diet_start_date",
      "dsl.diet_start_date_set_by",
      "dsl.session",
      "ad.crm_user as sent_by",
      "dsl.diet_id",
      "ps.validity",
      "sop.program_type",
    ];
    const currentDietConditions = [
      {
        field: "dsl.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "dsl.sub_order_id",
        operator: "=",
        value: active_order_id,
      },
      {
        field: "dsl.diet_status",
        operator: "=",
        value: 4,
      },
    ];

    const { results: currentDietIds } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: currentDietSelectFields,
      conditions: currentDietConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "dsl.diet_sent_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = dsl.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
      ],
      // orderBy:["dsl.diet_id desc"],
    });
    const { results: dietFeedbacks } = await readRecord({
      selectFields: ["*"],
      table: `${tables.dietFeedback} df`,
      conditions: [{ field: "df.user_id", operator: "=", value: user_id }],
    });
    const dietFeedbacksMap = new Map();
    dietFeedbacks.forEach((feedback) => {
      dietFeedbacksMap.set(feedback.diet_id, 1);
    });
    const currentDiet = await Promise.all(
      currentDietIds.map(async (row) => {
        if (
          row.diet_details_id &&
          /^[a-fA-F0-9]{24}$/.test(row.diet_details_id)
        ) {
          const diet = await dietDetails.findById(row.diet_details_id).lean();
          if (diet) {
            const sixth_day = moment(row.diet_start_date)
              .add(5, "days")
              .format("DD-MM-YYYY");

            const eleventh_day =
              Number(row.program_type) === 0
                ? moment(row.diet_start_date)
                    .add(10, "days")
                    .format("DD-MM-YYYY")
                : moment(row.diet_start_date)
                    .add(row.validity, "days")
                    .format("DD-MM-YYYY");

            return {
              diet_sent_date: row.diet_sent_date,
              diet_start_date: row.diet_start_date,
              is_advance_program: Number(row.program_type) === 0 ? true : false,
              session: row.session,
              sent_by: row.sent_by,
              diet_id: row.diet_id,
              feedback_received: dietFeedbacksMap.has(row.diet_id) ? 1 : 0,
              _id: diet._id,
              sixth_day: sixth_day,
              eleventh_day: eleventh_day,

              diet_start_date_set_by: row.diet_start_date_set_by,
              diet_name: diet.diet_name || null,
              on_rising: diet.on_rising || null,
              pre_breakfast: diet.pre_breakfast || null,
              breakfast: diet.breakfast || null,
              mid_morning: diet.mid_morning || null,
              pre_workout: diet.pre_workout || null,
              during_workout: diet.during_workout || null,
              pre_lunch: diet.pre_lunch || null,
              lunch: diet.lunch || null,
              post_lunch: diet.post_lunch || null,
              tea_eve: diet.tea_eve || null,
              late_eve: diet.late_eve || null,
              pre_dinner: diet.pre_dinner || null,
              dinner: diet.dinner || null,
              post_dinner: diet.post_dinner || null,
              bed_time: diet.bed_time || null,
              diet_note: diet.diet_note || null,
              attachments: diet.attachments || [],
              msg: diet.msg || null,
              comment: diet.comment || null,
              createdAt: diet.createdAt || null,
              __v: diet.__v || 0,
              updatedAt: diet.updatedAt || null,
            };
          }
        }
        return null;
      })
    );

    const oldDietSelectFields = [
      "dsl.diet_details_id",
      "dsl.diet_sent_date",
      "dsl.diet_start_date",
      "dsl.diet_start_date_set_by",
      "dsl.session",
      "ad.crm_user as sent_by",
      "dsl.diet_id",
      "dsl.sub_order_id",
      "pm.program_name",
      "ps.validity",
      "sop.program_type",
    ];
    const oldDietConditions = [
      {
        field: "dsl.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "dsl.sub_order_id",
        operator: "!=",
        value: active_order_id,
      },
    ];

    const { results: oldDietIds } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: oldDietSelectFields,
      conditions: oldDietConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "dsl.diet_sent_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = dsl.sub_order_id",
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
      // orderBy:["dsl.session desc"],
    });

    const oldDietByProgram = {};
    await Promise.all(
      oldDietIds.map(async (row) => {
        if (
          row.diet_details_id &&
          /^[a-fA-F0-9]{24}$/.test(row.diet_details_id)
        ) {
          const diet = await dietDetails.findById(row.diet_details_id).lean();
          if (diet) {
            const result = {
              diet_sent_date: row.diet_sent_date,
              diet_start_date: row.diet_start_date,
              is_advance_program: Number(row.program_type) === 0 ? true : false,
              session: row.session,
              sent_by: row.sent_by,
              diet_id: row.diet_id,
              feedback_received: dietFeedbacksMap.has(row.diet_id) ? 1 : 0,
              sixth_day: moment(row.diet_start_date)
                .add(5, "days")
                .format("DD-MM-YYYY"),
              eleventh_day:
                Number(row.program_type) === 0
                  ? moment(row.diet_start_date)
                      .add(10, "days")
                      .format("DD-MM-YYYY")
                  : moment(row.diet_start_date)
                      .add(row.validity, "days")
                      .format("DD-MM-YYYY"),
              diet_start_date_set_by: row.diet_start_date_set_by,
              sub_order_id: row.sub_order_id,
              program_name: row.program_name || "Unknown",
              program_duration: row.program_duration || "Unknown",
              _id: diet._id,
              diet_name: diet.diet_name || null,
              on_rising: diet.on_rising || null,
              pre_breakfast: diet.pre_breakfast || null,
              breakfast: diet.breakfast || null,
              mid_morning: diet.mid_morning || null,
              pre_workout: diet.pre_workout || null,
              during_workout: diet.during_workout || null,
              pre_lunch: diet.pre_lunch || null,
              lunch: diet.lunch || null,
              post_lunch: diet.post_lunch || null,
              tea_eve: diet.tea_eve || null,
              late_eve: diet.late_eve || null,
              pre_dinner: diet.pre_dinner || null,
              dinner: diet.dinner || null,
              post_dinner: diet.post_dinner || null,
              bed_time: diet.bed_time || null,
              diet_note: diet.diet_note || null,
              attachments: diet.attachments || [],
              msg: diet.msg || null,
              comment: diet.comment || null,
              createdAt: diet.createdAt || null,
              __v: diet.__v || 0,
              updatedAt: diet.updatedAt || null,
            };

            const programKey = `${row.program_name || "Unknown"}_${
              row.program_duration || "Unknown"
            }_${row.sub_order_id || "Unknown"}`;
            if (!oldDietByProgram[programKey]) {
              oldDietByProgram[programKey] = {
                program_name: row.program_name || "Unknown",
                program_duration: row.program_duration || "Unknown",
                sub_order_id: row.sub_order_id,
                diets: [],
              };
            }
            oldDietByProgram[programKey].diets.push(result);
          }
        }
      })
    );

    const oldProgramDiets = Object.values(oldDietByProgram).map((group) => ({
      program_name: group.program_name,
      program_duration: group.program_duration,
      sub_order_id: group.sub_order_id,
      diets: group.diets.filter(Boolean),
    }));

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diets fetched successfully",
      data: {
        old_program_diets: oldProgramDiets,
        current_program_diet: currentDiet.filter(Boolean),
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error fetching diets:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDietByDietId = async (req, res, next) => {
  try {
    const { diet_id } = req.query;
    const diet = await dietDetails.findById(diet_id);
    if (!diet) {
      return res.status(404).json({ message: "Diet not found." });
    }
       const { results: dietData } = await readRecord({
      table: tables.dietSessionLog,
      selectFields: ["diet_id"],
      conditions: [
        { field: "diet_details_id", operator: "=", value: diet_id },
      ],
    });
    return res.status(200).json({
      status: true,
      message: "Diet fetched successfully.",
      data: {
        _id: diet._id,
        diet_id: dietData.length > 0 ? dietData[0].diet_id : null,
        diet_name: diet.diet_name || null,
        on_rising: diet.on_rising || null,
        pre_breakfast: diet.pre_breakfast || null,
        breakfast: diet.breakfast || null,
        mid_morning: diet.mid_morning || null,
        pre_workout: diet.pre_workout || null,
        during_workout: diet.during_workout || null,
        pre_lunch: diet.pre_lunch || null,
        lunch: diet.lunch || null,
        post_lunch: diet.post_lunch || null,
        tea_eve: diet.tea_eve || null,
        late_eve: diet.late_eve || null,
        pre_dinner: diet.pre_dinner || null,
        dinner: diet.dinner || null,
        post_dinner: diet.post_dinner || null,
        bed_time: diet.bed_time || null,
        diet_note: diet.diet_note || null,
        attachments: diet.attachments || [],
        msg: diet.msg || null,
        comment: diet.comment || null,
        createdAt: diet.createdAt || null,
        __v: diet.__v || 0,
        updatedAt: diet.updatedAt || null,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};
const getDietByDietIds = async (req, res, next) => {
  try {
    const { diet_id } = req.query;
    if(!diet_id){
      return res.status(404).json({ message: "Diet not found." });
    }
    const diet = await dietDetails.findOne({
      diet_id
    });

    console.log(diet);
    if (!diet) {
      return res.status(404).json({ message: "Diet not found." });
    }
       const { results: dietData } = await readRecord({
      table: tables.dietSessionLog,
      selectFields: ["diet_id"],
      conditions: [
        { field: "diet_details_id", operator: "=", value: diet_id },
      ],
    });
    return res.status(200).json({
      status: true,
      message: "Diet fetched successfully.",
      data: {
        _id: diet._id,
        diet_id: dietData.length > 0 ? dietData[0].diet_id : null,
        diet_name: diet.diet_name || null,
        on_rising: diet.on_rising || null,
        pre_breakfast: diet.pre_breakfast || null,
        breakfast: diet.breakfast || null,
        mid_morning: diet.mid_morning || null,
        pre_workout: diet.pre_workout || null,
        during_workout: diet.during_workout || null,
        pre_lunch: diet.pre_lunch || null,
        lunch: diet.lunch || null,
        post_lunch: diet.post_lunch || null,
        tea_eve: diet.tea_eve || null,
        late_eve: diet.late_eve || null,
        pre_dinner: diet.pre_dinner || null,
        dinner: diet.dinner || null,
        post_dinner: diet.post_dinner || null,
        bed_time: diet.bed_time || null,
        diet_note: diet.diet_note || null,
        attachments: diet.attachments || [],
        msg: diet.msg || null,
        comment: diet.comment || null,
        createdAt: diet.createdAt || null,
        __v: diet.__v || 0,
        updatedAt: diet.updatedAt || null,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};

const approveDiet = async (req, res, next) => {
  try {
    const { diet_id, approval_status, approved_admin_id } = req.body;
    const { results } = await readRecord({
      table: `${tables.dietSessionLog}`,
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      selectFields: ["diet_status"],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("Diet not found", 404));
    }
    const db_diet_status = Number(results[0].diet_status);
    if (db_diet_status === 2 || db_diet_status === 3 || db_diet_status === 4)
      return next(
        new ErrorHandler(
          `${
            db_diet_status === 2
              ? "Diet is Already Approved"
              : db_diet_status === 3
              ? "Diet is Already Disapproved"
              : "Diet is Already Sent"
          }`,
          400
        )
      );
    const updated_data = {
      diet_status: approval_status ? 2 : 3,
      approved_by: approved_admin_id,
      approved_at: moment().format("YYYY-MM-DD HH:mm:ss"),
    };
    const condition = {
      diet_id: parseInt(diet_id),
    };
    const updatedResult = await updateRecord(
      `${tables.dietSessionLog}`,
      updated_data,
      condition
    );
    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while Approving Diet", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet Approved successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendDiet = async (req, res, next) => {
  try {
    const { diet_id, mentor_id } = req.query;
    if (!diet_id) {
      return next(new ErrorHandler("Missing diet_id query parameter", 400));
    }

    const { results } = await readRecord({
      table: `${tables.dietSessionLog}`,
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      selectFields: [
        "diet_status",
        "sub_order_id",
        "user_id",
        "diet_details_id",
        "session",
      ],
    });

    if (results.length === 0) {
      return next(new ErrorHandler("Diet not found", 404));
    }
    const { results:dietCount } = await readRecord({
      table: `${tables.dietSessionLog}`,
      conditions: [{ field: "sub_order_id", operator: "=", value: results[0].sub_order_id },{ field: "diet_status", operator: "=", value: "4" }],
      selectFields: [
        "count(diet_id) as diet_count",
      ],
      groupBy: ["sub_order_id"],
    });

    // console.log(dietCount, 727);
    // return;

    const dietStatus = Number(results[0].diet_status);
    const errorMessages = {
      4: "Diet is Already Sent",
      3: "Diet is Disapproved, Can't send",
      1: "Diet is Not Yet Approved",
    };

    if (errorMessages[dietStatus]) {
      return next(new ErrorHandler(errorMessages[dietStatus], 400));
    }

    const d = new Date();
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const istISO = ist.toISOString().replace("Z", "+05:30");

    const updatedDataResult = await updateRecord(
      `${tables.dietSessionLog}`,
      {
        diet_status: 4,
        session: dietCount.length ==0 ? 1 : Number(dietCount[0].diet_count) + 1,
        diet_sent_date: istISO,
        diet_sent_by: mentor_id,
        diet_start_date: moment().add(1, "days").format("YYYY-MM-DD"),
      },
      { diet_id }
    );

    if (updatedDataResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while sending Diet", 400));
    }
    const { results: subOrderPrograms } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "sop.sent_sessions",
        "sop.pending_session",
        "sop.program_type",
      ],
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: results[0].sub_order_id,
        },
      ],
    });
    const sopUpdatedResult = await updateRecord(
      `${tables.subOrderPrograms}`,
      {
        last_session_sent_date: new Date().toISOString(),
        sent_sessions: subOrderPrograms[0].sent_sessions + 1,
        pending_session: subOrderPrograms[0].pending_session - 1,
      },
      {
        sub_order_id: results[0].sub_order_id,
      }
    );
    const ackKnowledgeWeights = await updateRecord(
      tables.weightRecords,
      { weight_acknowledge: 1 },
      { user_id: results[0].user_id }
    );
    const ackKnowledgeInch = await updateRecord(
      tables.inchRecords,
      { inch_acknowledge: 1 },
      { user_id: results[0].user_id }
    );
    if (sopUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("Error while updating SubOrderPrograms", 400)
      );
    }
    console.log(subOrderPrograms[0], 727);

    await updateRecord(
      tables.userDetails,
      {
        user_status: "Active",
        sub_user_status:
          subOrderPrograms[0].program_type == "0" ? "Active" : "Cleanse Active",
      },
      { user_id: results[0].user_id }
    );
console.log(results,333333);
    await uploadDietPdfToCloudinary({
      user_id: results[0].user_id,
      order_id: results[0].sub_order_id,
      diet_details_id: results[0].diet_details_id,
      diet_id: diet_id
    })

    sendDietInMail({
      user_id: results[0].user_id,
      diet_details_id: results[0].diet_details_id,
      session: results[0].session,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet Sent successfully",
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in sendDiet:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const draftDiet = async (req, res, next) => {
  try {
    const { diet_id } = req.query;
    if (!diet_id) {
      return next(new ErrorHandler("Missing diet_id query parameter", 400));
    }
    const { results } = await readRecord({
      table: `${tables.dietSessionLog}`,
      conditions: [{ field: "diet_id", operator: "=", value: diet_id }],
      selectFields: ["diet_status"],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("Diet not found", 404));
    }
    const db_diet_status = results[0].diet_status;
    const errorMessages = {
      1: "Diet is Already Drafted",
      4: "Diet is Already Sent",
      3: "Diet is Disapproved, Can't Draft",
      2: "Diet is Already Approved",
    };
    if (errorMessages[db_diet_status]) {
      return next(new ErrorHandler(errorMessages[db_diet_status], 400));
    }

    const updatedDataResult = await updateRecord(
      `${tables.dietSessionLog}`,
      { diet_status: 1 },
      { diet_id: parseInt(diet_id) }
    );
    if (updatedDataResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while drafting Diet", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet Drafted successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCurrentDiet = async (req, res, next) => {
  try {
    const { user_id, active_order_id } = req.query;
    const { results: sentDietResults } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_id",
        "dsl.diet_name",
        "dsl.diet_sent_date",
        "dsl.diet_details_id ",
        "dsl.diet_start_date_set_by",
        "dsl.diet_start_date",
        "ad.crm_user AS approved_by",
        "dsl.diet_status",
        `sop.program_type as program_type`,
        "ps.validity",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id  = dsl.approved_by",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = dsl.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
      ],
      conditions: [
        { field: "dsl.sub_order_id", operator: "=", value: active_order_id },
        { field: "dsl.user_id", operator: "=", value: user_id },
        { field: "dsl.diet_status", operator: "=", value: "4" },
      ],
      orderBy: ["dsl.diet_id DESC"],
      pagination: { limit: 1 },
    });
    const { results: pastedDietDetails } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_id",
        "dsl.diet_name",
        "dsl.diet_sent_date",
        "dsl.diet_details_id ",
        "dsl.diet_start_date_set_by",
        "dsl.diet_start_date",
        "CONCAT(ad.first_name, ' ', ad.last_name) AS approved_by",
        "dsl.diet_status",
        `sop.program_type as program_type`,
        "ps.validity",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id  = dsl.approved_by",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = dsl.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
      ],
      conditions: [
        { field: "dsl.sub_order_id", operator: "=", value: active_order_id },
        { field: "dsl.user_id", operator: "=", value: user_id },
        { field: "dsl.diet_status", operator: "IN", value: [0, 1, 2] },
      ],
      orderBy: ["dsl.diet_id DESC"],
      pagination: { limit: 2 },
    });
    if (!sentDietResults.length && !pastedDietDetails.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No diet data found",
          data: [],
        })
      );
    }
    const dietStatusMap = {
      0: { label: "Pasted", color: "#ffffff" }, // White
      1: { label: "Drafting in Progress", color: "#F97316" }, // Orange
      2: { label: "Approved", color: "#28a745" }, // Green
      3: { label: "Disapproved", color: "#6c757d" }, // Grey
      4: { label: "Diet Sent", color: "#06B6D4" }, // Blue
    };
    const concatedData = [...pastedDietDetails, ...sentDietResults];
    const data = concatedData.map((i) => {
      const sixth_day = moment(i.diet_start_date)
        .add(5, "days")
        .format("DD-MM-YYYY");

      const eleventh_day =
        Number(i.program_type) === 0
          ? moment(i.diet_start_date).add(10, "days").format("DD-MM-YYYY")
          : moment(i.diet_start_date)
              .add(i.validity, "days")
              .format("DD-MM-YYYY");
      return {
        diet_id: i.diet_id,
        is_advance_program: Number(i.program_type) === 0 ? true : false,
        diet_details_id: i.diet_details_id,
        diet_name: i.diet_name,
        diet_sent_date: i.diet_sent_date
          ? moment(i.diet_sent_date).format("DD-MM-YYYY")
          : null,
        diet_start_date: i.diet_start_date
          ? moment(i.diet_start_date).format("DD-MM-YYYY")
          : null,
        approved_by: i.approved_by,
        sixth_day: sixth_day,
        eleventh_day: eleventh_day,

        diet_status:
          Number(i.diet_status) === 0
            ? "pasted"
            : Number(i.diet_status) === 1
            ? "drafted"
            : Number(i.diet_status) === 2
            ? "approved"
            : Number(i.diet_status) === 3
            ? "disapproved"
            : "Sent",
        diet_status_color: dietStatusMap[Number(i.diet_status)] || {
          label: "Disapproved",
          color: "#6c757d",
        },
        diet_start_date_set_by: i.diet_start_date_set_by,
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet fetched successfully",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendDietSms = async (req, res, next) => {
  const { user_status } = req.query;
  try {
    const conditions = [
      {
        field: "ud.app_version",
        operator: " NOT IN ",
        value: `('${app_versions.ios}','${app_versions.android}')`,
        raw: true,
      },
      {
        field: "ud.user_status",
        operator: "=",
        value: user_status.toLowerCase() === "oc" ? "Completed" : "Active",
      },
      {
        field: "ud.phone_code",
        operator: "=",
        value: "91",
      },
      {
        field: "ud.phone_number",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "LENGTH(ud.phone_number)",
        operator: "=",
        value: 10,
      },
    ];
    // if (process.env.NODE_ENV === "development") {
    //   conditions.push({
    //     field: "ud.user_id",
    //     operator: "=",
    //     value: 125721,
    //   });
    // }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.first_name",
        "CONCAT('+',ud.phone_code,'',ud.phone_number) as phone",
        `(
        SELECT device 
        FROM bn_user_fcm_token 
        WHERE user_id = ud.user_id 
        ORDER BY id DESC 
        LIMIT 1
    ) AS device`,
      ],
      conditions: conditions,
    });
    console.log(results, 865);
    await Promise.all(
      results.map(async (i) => {
        let link = `https://www.balancenutrition.in/download-bn-app`;
        if (["iOS", "iPadOS", "ios"].includes(i.device)) {
          link = `https://apps.apple.com/in/app/bn-client-exclusive/id1500756201`;
        } else if (i.device === "android") {
          link = `https://play.google.com/store/apps/details?id=in.clientexclusive.balance`;
        }
        await sendMessage({
          body: `Dear ${
            i.first_name.charAt(0).toUpperCase() +
            i.first_name.slice(1).toLowerCase()
          }, 

Your mentor has sent your NEXT DIET PLAN. 

Click here to view it:
${link}

Regards,
Team Balance Nutrition
`,
          to: i.phone,
        });
      })
    );
    return res
      .status(200)
      .json(new ApiResponse({ message: "Diet SMS Sent Successfully" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const dietPdfLog = async (req, res, next) => {
  try {
    const { user_id, order_id, diet_details_id, session, type } = req.body;

    const time = moment().format("YYYY-MM-DD HH:mm:ss");

    const insertResult = await insertRecord(
      tables.dietPdfDownloadLog,
      ["user_id", "order_id", "diet_details_id", "downloaded_at", "session", "type"],
      [user_id, order_id, diet_details_id, time, session, type]
    );

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Data stored successfully",
    });

    return res.status(200).json(apiresponse);
  } catch (err) {
    console.error("Error in storing the details:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  addDietController,
  getDietByUserId,
  editDietController,
  getDietByDietId,
  getDietByDietIds,
  approveDiet,
  sendDiet,
  draftDiet,
  getCurrentDiet,
  sendDietSms,
  dietPdfLog,
};


