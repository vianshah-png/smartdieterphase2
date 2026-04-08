import moment from "moment";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { callTypes, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import ejs from "ejs";
import path from "path";
import { sendMailUtil } from "../../utils/sendEmail.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

const addMentorEvent = async (req, res, next) => {
  try {
    const {
      admin_id,
      title,
      description,
      event_start_at,
      event_end_at,
      is_additional,
    } = req.body;
    const columns = [
      "admin_id",
      "title",
      "description",
      "event_start_at",
      "event_end_at",
    ];
    const values = [admin_id, title, description, event_start_at, event_end_at];
    if (is_additional) {
      columns.push("is_additional");
      values.push(is_additional);
    }
    const addEventResult = await insertRecord(
      `${tables.mentorEvents}`,
      columns,
      values
    );
    if (addEventResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while adding event", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Event added successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMentorEvents = async (req, res, next) => {
  try {
    const { admin_id, start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return next(
        new ErrorHandler("Start date and end date are required", 400)
      );
    }

    const { results } = await readRecord({
      table: `${tables.mentorEvents} me`,
      selectFields: [
        "me.id as event_id",
        "me.title as event_title",
        "me.description as event_description",
        "me.event_start_at as event_start_date",
        "me.event_end_at as event_end_date",
        "me.added_date as event_added_date",
        "me.is_additional as event_is_additional",
        "me.status as event_status",
      ],
      conditions: [
        {
          field: "me.admin_id",
          operator: "=",
          value: parseInt(admin_id),
        },
        {
          field: "DATE(me.event_start_at)",
          operator: "<=",
          value: end_date,
        },
        {
          field: "DATE(me.event_end_at)",
          operator: ">=",
          value: start_date,
        },
      ],
      orderBy: ["me.event_start_at ASC"],
    });
    const data = results.map((i) => {
      return {
        event_id: i.event_id,
        event_title: i.event_title,
        event_description: i.event_description,
        event_start_date: i.event_start_date,
        event_end_date: i.event_end_date,
        event_added_date: i.event_added_date,
        event_is_additional: i.event_is_additional,
        event_status: i.event_status,
      };
    });
    const { results: callsData } = await readRecord({
      selectFields: [
        "cu.slot_id",
        "DATE_FORMAT(cu.schedule_date,'%D %b %Y') as schedule_date",
        "cu.call_status",
        "s.appointment_slots",
        "cd.first_name",
        "cd.last_name",
        "cd.email_id",
        "cd.phone_number",
        "cu.call_type",
        // "cd.profile_pic",
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `cu.user_id = cd.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.slots} s`,
          on: `cu.slot_id = s.id`,
        },
      ],
      conditions: [
        { field: "cu.added_by", operator: "=", value: parseInt(admin_id) },
        { field: "cu.call_status", operator: "=", value: 0 },
        { field: "cu.schedule_date", operator: ">=", value: start_date },
        { field: "cu.schedule_date", operator: "<=", value: end_date },
      ],
      orderBy: ["cu.slot_id"],
    });

    const { results: followUpData } = await readRecord({
      selectFields: [
        "lfu.slot_id",
        "DATE_FORMAT(lfu.follow_up_date,'%D %b %Y') as schedule_date",
        "lfu.follow_up_status",
        "s.appointment_slots",
        "cd.first_name",
        "cd.last_name",
        "cd.email_id",
        "cd.phone_number",
        "lfu.type",
      ],
      table: `${tables.leadFollowUpLogs} lfu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `lfu.user_id = cd.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.slots} s`,
          on: `lfu.slot_id = s.id`,
        },
      ],
      conditions: [
        { field: "lfu.assigned_to", operator: "=", value: parseInt(admin_id) },
        { field: "lfu.follow_up_status", operator: "=", value: 0 },
        { field: "lfu.follow_up_date", operator: ">=", value: start_date },
        { field: "lfu.follow_up_date", operator: "<=", value: end_date },
      ],
    });

    const { results: engagementData } = await readRecord({
      selectFields: [
        "lel.slot_id",
        "DATE_FORMAT(lel.engagement_date,'%D %b %Y') as schedule_date",
        "lel.status",
        "s.appointment_slots",
        "cd.first_name",
        "cd.last_name",
        "cd.email_id",
        "cd.phone_number",
        "lel.type",
      ],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `lel.user_id = cd.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.slots} s`,
          on: `lel.slot_id = s.id`,
        },
      ],
      conditions: [
        { field: "lel.assigned_to", operator: "=", value: parseInt(admin_id) },
        { field: "lel.engagement_date", operator: ">=", value: start_date },
        { field: "lel.engagement_date", operator: "<=", value: end_date },
        { field: "lel.status", operator: "=", value: 0 },
      ],
    });
    console.log(callsData, 108);
    console.log(followUpData, 155);
    console.log(engagementData, 156);
    const { results: dayEndReviewData } = await readRecord({
      selectFields: ["*"],
      table: `${tables.salesReviewNotes} srn`,
      conditions: [
        { field: "srn.mentor_id", operator: "=", value: parseInt(admin_id) },
        { field: "srn.slot", operator: "=", value: 3 },
        {
          field: "DATE(srn.added_date)",
          operator: "<",
          value: "CURDATE()",
          raw: true,
        },
      ],
      orderBy: ["srn.added_date DESC"],
      pagination: { limit: 1, page: 1 },
    });
    const salesReviewData = safeJSONParse(dayEndReviewData[0]?.other_data, {});
    let last_day_zone = "N/A";
    if (salesReviewData.green_zone) {
      last_day_zone = "Green";
    } else if (salesReviewData.yellow_zone) {
      last_day_zone = "Yellow";
    } else if (salesReviewData.red_zone) {
      last_day_zone = "Red";
    }
    // Send the response back with the data
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Mentor Events fetched successfully",
      data: {
        events: data,
        calls_data: callsData.map((i) => {
          return {
            ...i,
            call_type: callTypes[i.call_type],
          };
        }),
        follow_up_data: followUpData,
        engagement_data: engagementData,
        last_day_zone: last_day_zone,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateEventStatus = async (req, res, next) => {
  try {
    const { event_id } = req.query;

    const { results } = await readRecord({
      table: `${tables.mentorEvents} me`,
      selectFields: ["status"],
      conditions: [
        {
          field: "me.id",
          operator: "=",
          value: parseInt(event_id),
        },
      ],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("No event found with given id", 400));
    }
    const eventStatus = results[0];
    if (eventStatus.status === "done") {
      return next(new ErrorHandler("Event is already marked as done", 400));
    }
    const updatedStatusResult = await updateRecord(
      `${tables.mentorEvents}`,
      {
        status: "done",
      },
      {
        id: parseInt(event_id),
      }
    );
    if (updatedStatusResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating event status", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Event status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteEvent = async (req, res, next) => {
  try {
    const { event_id } = req.query;

    const deletedResult = await deleteRecords(
      `${tables.mentorEvents}`,
      parseInt(event_id),
      { id: parseInt(event_id) }
    );
    if (deletedResult.success === false) {
      return next(
        new ErrorHandler(
          "Error While Deleting Event (Probably Doesnt Exists)",
          400
        )
      );
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Event deleted successfully ",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addMentorEvent, getMentorEvents, updateEventStatus, deleteEvent };
