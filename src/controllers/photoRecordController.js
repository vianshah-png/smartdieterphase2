import moment from "moment";
import {
  insertRecord,
  deleteRecords,
  readRecord,
  updateRecord,
} from "../config/query.js";
import { cloudinaryFolders, tables } from "../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../helper/uploadToCloudinary.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { addAmountWallet } from "../helper/common.js";
import { v4 as uuidv4 } from "uuid";
import { storeEmbedding } from "../config/qDrantConfig.js";
import { safeJSONParse } from "../helper/commonHelper.js";

const addWeightPhoto = async (req, res, next) => {
  try {
    const newData = req.body;
    const files = req.files;
    const embeddings = [];
    if (!files || files.length === 0) {
      return next(new ErrorHandler("No files provided", 500));
    }
    const images = await uploadArrayOfFilesToCloudinary(
      files,
      cloudinaryFolders.weightRecord,
      files[0].originalname,
      {
        createEmbedding: false,
      }
    );
    if (files.length > 0) {
      newData.photo_url = JSON.stringify(images);
    }
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const result = await insertRecord(tables.photoRecords, columns, values);
    if (result.affectedRows === 1) {
      embeddings.forEach(async (elem) => {
        const id = uuidv4();
        await storeEmbedding({
          id,
          embedding: elem.embedding,
          metadata: {
            photo_url: elem.photo_url,
            photo_id: result.insertId,
            table: "photo_records",
            user_id: newData.user_id,
          },
          collection: "photos",
        });
      });
      const { results: userDetails } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["ud.first_name", "ud.last_name", "ud.mentor_assigned"],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: newData.user_id,
          },
        ],
      });
      await updateRecord(
        tables.dietSessionLog,
        { end_session_photo: result.insertId },
        { session: newData.session, sub_order_id: newData.sub_order_id }
      );
      const notification_title =
        Number(newData.days) === 5
          ? `${userDetails[0].first_name} ${userDetails[0].last_name} Has Updated End Session Photo`
          : Number(newData.days) === 10
          ? `${userDetails[0].first_name} ${userDetails[0].last_name} Has Updated End Session Photo`
          : `${userDetails[0].first_name} ${userDetails[0].last_name} Has Updated Start Session Photo`;
      const data = {
        title: notification_title,
        priority: 3,
        redirect: "/photo",
      };
      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [newData.user_id, userDetails[0].mentor_assigned, data.title, "/photo"]
      );
      if (insertedResultNotification.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Inserting Mentor Notifications", 400)
        );
      }

      if( Number(newData.days) === 10){
      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
      }
      
      const addToWallet = await addAmountWallet({
        user_id: newData.user_id,
        amount: 150,
        reason: "Photo Added",
        sub_order_id: newData.sub_order_id,
      });
      console.log(addToWallet, 66);
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "weight photo added successfully",
        data: {
          weightPhotoId: result.insertId,
          wallet_amount: 150,
        },
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add category", 500));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deletePhotoRecord = async (req, res, next) => {
  const { id } = req.params;
  const { sub_order_id, session } = req.body;
  if (!id) {
    return next(new ErrorHandler("id not provided", 500));
  }
  try {
    const deletedRecord = await deleteRecords(
      tables.photoRecords,
      parseInt(id),
      {
        photo_id: parseInt(id),
      }
    );
    await updateRecord(
      tables.dietSessionLog,
      { end_session_photo: 0 },
      { session, sub_order_id }
    );
    if (deletedRecord.success === true) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "photo record deleted successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler(
          "Failed to delete  photo record amy a record doesn't exist with the gievn id",
          500
        )
      );
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const ackPhoto = async (req, res, next) => {
  try {
    const { photo_id } = req.body;

    // Validate required fields
    if (!photo_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const photoUpdatedResult = await updateRecord(
      tables.photoRecords,
      {
        photo_acknowledge: 1,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { photo_id: photo_id }
    );

    if (!photoUpdatedResult || photoUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("photo record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "photo Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserPhotosList = async (req, res, next) => {
  try {
    const { user_id, sub_order_id } = req.body;

    if (!user_id || !sub_order_id) {
      return res.status(400).json({
        statusCode: 400,
        message: "Missing required parameters: user_id and sub_order_id",
        data: [],
      });
    }

    const { results: subOrderProgram } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "sop.sent_sessions",
        "sop.total_sessions",
        "sop.last_session_sent_date",
        "ps.program_sessions",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
      ],
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: sub_order_id },
      ],
    });

    if (!subOrderProgram.length) {
      return res.status(404).json({
        statusCode: 404,
        message: "Sub-order not found",
        data: [],
      });
    }

    const program = subOrderProgram[0];
    const isCleanseProgram = program.program_sessions === 1;
    const photoDueDay = 10;

    const { results: assessmentPhotos } = await readRecord({
      table: `${tables.assessment} ass`,
      joins: [
        {
          type: "INNER",
          table: `${tables.assessment_personal_details} aspd`,
          on: "aspd.assessment_id = ass.assessment_id",
        },
      ],
      selectFields: ["aspd.added_date", "aspd.assessment_photo"],
      conditions: [{ field: "ass.user_id", operator: "=", value: user_id }],
      orderBy: ["ass.assessment_id DESC"],
      pagination: { limit: 1 },
    });

    const beforeImage = assessmentPhotos.length
      ? assessmentPhotos[0].assessment_photo
      : null;
    console.log(beforeImage, 258);
    const { results: dietLogs } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: ["dsl.diet_start_date", "dsl.session","diet_start_date_set_by"],
      conditions: [
        { field: "dsl.user_id", operator: "=", value: user_id },
        { field: "dsl.sub_order_id", operator: "=", value: sub_order_id },
        { field: "dsl.diet_status", operator: "=", value: 4 },
      ],
      orderBy: ["dsl.diet_id desc"],
    });
    const { results: photoRecords, totalCount: photoCount } = await readRecord({
      table: `${tables.photoRecords} pr`,
      selectFields: [
        "pr.photo_id",
        "pr.photo_url",
        "pr.posted_date",
        "pr.session",
        "pr.photo_acknowledge",
        "pr.days",
        "pr.diet_id",
      ],
      conditions: [
        { field: "pr.user_id", operator: "=", value: user_id },
        { field: "pr.sub_order_id", operator: "=", value: sub_order_id },
      ],
      countTotal: true,
      orderBy: ["pr.posted_date ASC"],
    });
    console.log(photoRecords, 287);
    // Get previous photo records (for previous_tracker)
    const { totalCount: previousCount } = await readRecord({
      table: `${tables.photoRecords} pr`,
      selectFields: ["pr.photo_id"],
      conditions: [
        { field: "pr.user_id", operator: "=", value: user_id },
        { field: "pr.sub_order_id", operator: "=", value: sub_order_id },
      ],
      countTotal: true,
    });

    let finalData = [];
    let assessmentPhotosRev = assessmentPhotos.reverse();
    // Parse the JSON string
    let assessmentimagePath = null;

    try {
      const parsedArray = safeJSONParse(
        assessmentPhotosRev[0].assessment_photo,
        []
      );
      assessmentimagePath =
        parsedArray[0]?.file?.path || parsedArray?.file?.path || null;
      console.log(
        "Image Path:",
        assessmentimagePath,
        assessmentPhotosRev[0].assessment_photo
      );
    } catch (err) {
      console.error("Failed to parse JSON:", err);
    }
    console.log(JSON.parse(beforeImage), 11221122);

    if (photoRecords.length && !isCleanseProgram) {
      const path = JSON.parse(beforeImage)?.file?.path;
      finalData = photoRecords.map((photo) => ({
        id: photo.photo_id,
        before_image: beforeImage ? path : null,
        after_image: JSON.parse(photo.photo_url)?.file?.path
          ? JSON.parse(photo.photo_url)?.file?.path
          : JSON.parse(photo.photo_url)[0]?.file?.path
          ? JSON.parse(photo.photo_url)[0]?.file?.path
          : null,
        posted_date: photo.posted_date,
        sub_order_id,
        user_id,
        photo_acknowledge: photo.photo_acknowledge,
        session: photo.session,
        diet_id: photo.diet_id,
        days: photo.days,
      }));
      console.log(finalData, 11221122);
    } else if (assessmentPhotosRev.length) {
      finalData = [
        {
          id: null,
          before_image: assessmentimagePath,
          after_image: null,
          posted_date: assessmentPhotosRev[0].added_date,
          sub_order_id,
          user_id,
          session: null,
          diet_id: null,
          days: null,
        },
      ];
    }
    let uploadButton = false;
    if (!isCleanseProgram) {
      const currentSession = program.sent_sessions;
      const latestDietLog = dietLogs.find(
        (log) => log.session === currentSession
      );
      const dietStartMoment = latestDietLog?.diet_start_date
        ? moment(latestDietLog.diet_start_date)
        : null;

      if (dietStartMoment && dietStartMoment.isValid()) {
        const daysSinceStart = moment().diff(dietStartMoment, "days");
        console.log(currentSession, photoRecords, 279);
        const hasSessionEndPhoto = photoRecords.some(
          (photo) => Number(photo.session) === Number(currentSession)
        );
        console.log(hasSessionEndPhoto, photoDueDay, 285);
        if (!hasSessionEndPhoto && daysSinceStart >= photoDueDay) {
          uploadButton = true;
        }
      }
    }
    finalData['popup_data'] ={
      showPopup: program.sent_sessions > 0
      ?false:true,
      message: 'The tracker for your new program will be functional once you receive your diet session & set a start date.',
      button_text: 'Stay Tuned',
    };
    console.log(finalData,12121212);

    return res.status(200).json({
      statusCode: 200,
      message: finalData.length
        ? "Photo records fetched successfully"
        : "No photo records found, showing assessment photo if available",
      data: finalData,
      popup_data:{
        showPopup:  (dietLogs.length == 0 || dietLogs[0]?.diet_start_date_set_by == 'Default')
        ?true:false,
        message: 'The tracker for your new program will be functional once you receive your diet session & set a start date.',
        button_text: 'Stay Tuned',
      },
      previous_tracker: previousCount > 0,
      upload_button: uploadButton,
      current_session: program.sent_sessions,
      
    });
  } catch (error) {
    console.error("Error in getUserPhotosList:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addWeightPhoto, deletePhotoRecord, getUserPhotosList, ackPhoto };
