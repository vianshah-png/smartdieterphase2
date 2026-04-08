import moment from "moment";
import { readRecord, updateRecord } from "../../config/query.js";
import {
  fetchUserDetailsDynamic,
  fetchUsersDetails,
  fetchUsersDetailsNew,
  mapUserData,
  replacePlaceholders,
} from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
const todaysRecieved = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: hfReceivedToday } = await readRecord({
      table: `${tables.halfTimeFeedback} hf`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.userDetails} cd`,
          type: "LEFT",
          on: "hf.user_id = cd.user_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: "DATE(hf.added_date)",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "hf.id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "hf.halftime_ack",
          operator: "!=",
          value: "1",
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      orderBy: ["hf.added_date DESC"],
    });

    const { results: todayHTCallDone } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cu.call_status", operator: "=", value: "1" },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: "CURRENT_DATE() ",
          raw: true,
        },
        {
          field: "cu.call_id",
          operator: "IS",
          value: "NOT NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
        },
      ],
    });
    console.log(todayHTCallDone);
    const { results: hsTakenToday } = await readRecord({
      selectFields: ["DISTINCT cd.user_id"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id AND hs.type = '1'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: "DATE(hs.created)",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "hs.id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "hs.ack",
          operator: "!=",
          value: "1",
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      groupBy: ["hs.user_id"],
    });
    console.log(hsTakenToday, 124);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "counts fetched successfully",
      data: {
        health_score: hsTakenToday,
        feed_back: hfReceivedToday,
        ht_call: todayHTCallDone,
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error in fetching data" });
  }
};

const firstReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: firstReminderHFmissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =6
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =1
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =1
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hf.id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.halftimeFeedback} hf`,
          type: "LEFT",
          on: "sop.sub_order_id = hf.sub_order_id and cd.user_id = hf.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: firstReminderCallMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=1 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=1
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.call_id",
          operator: "IS",
          value: " NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: firstHSReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =6
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =6
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hs.id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Halftime Feedback for First Reminder Missed",
      data: {
        hs_reminder_miss_count: firstHSReminderMissed,
        fb_reminder_miss_count: firstReminderHFmissed,
        call_reminder_miss_count: firstReminderCallMissed,
      },
      meta_data: {
        hs_reminder_miss_table_label: "HTHealthScore Reminder 1",
        fb_reminder_miss_table_label: "HTFeedback Reminder 1",
        fb_call_miss_table_label: "HTCall Reminder 1",
        hs_reminder_miss_notification_id: 145,
        fb_call_miss_notification_id: 150,
        fb_reminder_miss_notification_id: 140,
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const secondReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: secondReminderHFmissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =7 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =2
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },

        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: secondReminderCallMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
 (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=2
		)
)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.call_id",
          operator: "IS",
          value: " NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: secondHSReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
          	
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =7
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =7
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hs.id",
          operator: "IS ",
          value: "NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Halftime Feedback for Second Reminder Missed",
      data: {
        hs_reminder_miss_count: secondHSReminderMissed,
        fb_reminder_miss_count: secondReminderHFmissed,
        call_reminder_miss_count: secondReminderCallMissed,
      },
      meta_data: {
        hs_reminder_miss_table_label: "HTHealthScore Reminder 2",
        fb_reminder_miss_table_label: "HTFeedback Reminder 2",
        fb_call_miss_table_label: "HTCall Reminder 2",
        hs_reminder_miss_notification_id: 146,
        fb_call_miss_notification_id: 151,
        fb_reminder_miss_notification_id: 141,
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const thirdReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: thirdReminderHFmissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =8 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =3
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: thirdReminderCallMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
   (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=3
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=3
		)
)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.call_id",
          operator: "IS",
          value: " NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: thirdHSReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `(
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =8
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =8
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hs.id",
          operator: "IS ",
          value: "NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Halftime Feedback for Third Reminder Missed",
      data: {
        hs_reminder_miss_count: thirdHSReminderMissed,
        fb_reminder_miss_count: thirdReminderHFmissed,
        call_reminder_miss_count: thirdReminderCallMissed,
      },
      meta_data: {
        hs_reminder_miss_table_label: "HTHealthScore Reminder 3",
        fb_reminder_miss_table_label: "HTFeedback Reminder 3",
        fb_call_miss_table_label: "HTCall Reminder 3",
        hs_reminder_miss_notification_id: 147,
        fb_call_miss_notification_id: 152,
        fb_reminder_miss_notification_id: 142,
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const fourthReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: fourthReminderHFmissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =4
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: fourthReminderCallMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
    (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=4
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=4
		)
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.call_id",
          operator: "IS",
          value: " NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: fourthHSReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
          	
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =9
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =9
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hs.id",
          operator: "IS ",
          value: "NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Halftime Feedback for Fourth Reminder Missed",
      data: {
        hs_reminder_miss_count: fourthHSReminderMissed,
        fb_reminder_miss_count: fourthReminderHFmissed,
        call_reminder_miss_count: fourthReminderCallMissed,
      },
      meta_data: {
        hs_reminder_miss_table_label: "HTHealthScore Reminder 4",
        fb_reminder_miss_table_label: "HTFeedback Reminder 4",
        fb_call_miss_table_label: "HTCall Reminder 4",
        hs_reminder_miss_notification_id: 148,
        fb_call_miss_notification_id: 153,
        fb_reminder_miss_notification_id: 143,
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const fifthReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: fifthReminderHFmissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) =10
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =5
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: fifthReminderCallMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
   (
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date)=5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date)=5
		)
    )`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cu.call_id",
          operator: "IS",
          value: " NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
    });
    const { results: fifthHSReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.healthScoreClient} hs`,
          type: "LEFT",
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },

        {
          field: `(
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) =10
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "hs.id",
          operator: "IS ",
          value: "NULL",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Halftime Feedback for Fifth Reminder Missed",
      data: {
        hs_reminder_miss_count: fifthHSReminderMissed,
        fb_reminder_miss_count: fifthReminderHFmissed,
        call_reminder_miss_count: fifthReminderCallMissed,
      },
      meta_data: {
        hs_reminder_miss_table_label: "HTHealthScore Final Reminder",
        fb_reminder_miss_table_label: "HTFeedback Final Reminder",
        fb_call_miss_table_label: "HTCall Final Reminder",
        hs_reminder_miss_notification_id: 149,
        fb_call_miss_notification_id: 154,
        fb_reminder_miss_notification_id: 144,
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const todaysRecievedData = async (req, res, next) => {
  const { user_ids: ids, data, search } = req.body;
  if (!ids.length > 0 || !data) {
    return next(new ErrorHandler("Invalid request", 400));
  }
  const dataCategory = ["hs", "fb", "call"];
  if (!dataCategory.includes(data)) {
    return next(new ErrorHandler("Invalid data category", 400));
  }
  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };
  try {
    let finalData;
    if (data == "hs") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          health_score: true,
          goal_weight: true,
          order_summary: true,
        },
        ...(search && searchObj),
      });
      if (req.headers.source === "cs_db") {
        finalData = details;
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true, health_score: true },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
              },
            },
          });
        });
      }
    } else if (data == "fb") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          halftime_feedback: true,
          goal_weight: true,
          is_active: true,
          order_summary: true,
        },
        ...(search && searchObj),
      });
      if (req.headers.source === "cs_db") {
        finalData = details;
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true, health_score: true },
            extraMappings: {
              halftime_feedback: {
                mentor_star_rating:
                  details[index].client_halftime_mentor_rating,
                added_date: details[index].client_halftime_feedback_date,
                improvement_needed: details[index].client_halftime_improvement,
              },
            },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
              },
            },
          });
        });
      }
    } else if (data == "call") {
      const { results: callDetails } = await readRecord({
        table: `${tables.callUpdates} cu`,
        selectFields: ["*"],
        conditions: [
          { field: "cu.call_type", operator: "=", value: "1" },
          { field: "cu.user_id", operator: "IN", value: ids },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.slots} s`,
            on: "cu.slot_id = s.id",
          },
        ],
      });
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          health_score: true,
          goal_weight: true,
          halftime_feedback: true,
          is_active: true,
          order_summary: true,
        },
        ...(search && searchObj),
      });
      if (req.headers.source == "cs_db") {
        finalData = details;
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true, health_score: true },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
              },
            },
            extraMappings: {
              halftime_feedback: {
                mentor_star_rating:
                  details[index].client_halftime_mentor_rating,
                added_date: details[index].client_halftime_feedback_date,
                improvement_needed: details[index].client_halftime_improvement,
              },
              "call_&_key_insight_details": {
                schedule_date: moment(callDetails[index]?.schedule_date).format(
                  "YYYY-MM-DD"
                ),
                appointment_slots: callDetails[index]?.appointment_slots,
                key_insight: callDetails[index]?.call_insights,
                call_status: callDetails[index]?.call_status,
              },
            },
          });
        });
      }
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const firstReminderMissedData = async (req, res, next) => {
  const { user_ids: ids, data, whatsapp_text_label, search } = req.body;
  if (!ids.length > 0 || !data) {
    return next(new ErrorHandler("Invalid request", 400));
  }

  const dataCategory = ["hs", "fb", "call"];
  if (!dataCategory.includes(data)) {
    return next(new ErrorHandler("Invalid data category", 400));
  }
  const searchObj = {
    search: {
      searchQuery: search,
      searchFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name)",
        "cd.email_id",
        "cd.phone",
      ],
    },
  };
  try {
    let finalData;
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.whatsappText} wt`,
      conditions: [
        { field: "wt.label", operator: "=", value: whatsapp_text_label },
        {
          field: "wt.source",
          operator: "=",
          value: req.headers.source || "mentor",
        },
      ],
    });
    const whatsappText = results[0].whatsapp_text;
    let whatsappTextVariables = safeJSONParse(results[0].variables, []);
    console.log(whatsappTextVariables, 1886);
    whatsappTextVariables = whatsappTextVariables.map((item) => {
      return `{{${item}}}`;
    });
    const whatsTextDetails = await fetchUserDetailsDynamic({
      ids,
      fields: [...whatsappTextVariables],
    });
    console.log(whatsappTextVariables, whatsappText, 1488);
    if (data === "hs") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          health_score: true,
          order_summary: true,
        },
        ...(search && searchObj),
      });

      if (req.headers.source === "cs_db") {
        finalData = details.map((data, index) => {
          return {
            ...data,
            whatsapp_text: replacePlaceholders(
              whatsappText,
              whatsTextDetails[index]
            ),
          };
        });
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: replacePlaceholders(
                  whatsappText,
                  whatsTextDetails[index]
                ),
              },
            },
          });
        });
      }
    } else if (data === "fb") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        ...(search && searchObj),
      });

      if (req.headers.source === "cs_db") {
        finalData = details.map((data, index) => {
          return {
            ...data,
            whatsapp_text: replacePlaceholders(
              whatsappText,
              whatsTextDetails[index]
            ),
          };
        });
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true, health_score: true },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: replacePlaceholders(
                  whatsappText,
                  whatsTextDetails[index]
                ),
              },
            },
          });
        });
      }
    } else if (data === "call") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          weight_data: true,
          halftime_feedback: true,
          health_score: true,
          is_active: true,
          order_summary: true,
        },
        ...(search && searchObj),
      });
      console.log(details, 1742);
      if (req.headers.source === "cs_db") {
        finalData = details.map((data, index) => {
          return {
            ...data,
            whatsapp_text: replacePlaceholders(
              whatsappText,
              whatsTextDetails[index]
            ),
          };
        });
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true, health_score: true },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: replacePlaceholders(
                  whatsappText,
                  whatsTextDetails[index]
                ),
              },
            },
            extraMappings: {
              halftime_feedback: {
                mentor_star_rating:
                  details[index].client_halftime_mentor_rating,
                added_date: details[index].client_halftime_feedback_date,
                improvement_needed: details[index].client_halftime_improvement,
              },
            },
          });
        });
      }
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const ackHalftimeHs = async (req, res, next) => {
  try {
    const { user_id,sub_order_id,mentor_id } = req.body;

    // Validate required fields
    if (!user_id && !sub_order_id && !mentor_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const hsUpdatedResult = await updateRecord(
      tables.healthScoreClient,
      {
        ack: 1,
        ack_by: mentor_id,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { 
        user_id: user_id,
        sub_order_id:sub_order_id,
       }
    );

    if (!hsUpdatedResult || hsUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("hs record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Hs Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const ackHalftimeFeedback = async (req, res, next) => {
  try {
    const { user_id,sub_order_id,mentor_id } = req.body;

    // Validate required fields
    if (!user_id && !sub_order_id && !mentor_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const feedbackUpdatedResult = await updateRecord(
      tables.halfTimeFeedback,
      {
        halftime_ack: 1,
        ack_by: mentor_id,
        ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { 
        user_id: user_id,
       }
    );

    if (!feedbackUpdatedResult || feedbackUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("feedback record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "feedback Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  todaysRecieved,
  firstReminderMissed,
  secondReminderMissed,
  thirdReminderMissed,
  fourthReminderMissed,
  fifthReminderMissed,
  firstReminderMissedData,
  todaysRecievedData,
  ackHalftimeHs,
  ackHalftimeFeedback,
};
