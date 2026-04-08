import { readRecord, updateRecord } from "../../config/query.js";
import {
  fetchUserDetailsDynamic,
  fetchUsersDetailsNew,
  mapUserData,
  replacePlaceholders,
} from "../../helper/common.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import moment from "moment";

const tailendJourneyDataReceivedToday = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: goalsReceivedToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
          operator: ">",
          value: 0,
        },
        {
          field: "DATE(mg.updated_date)",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "mg.ack",
          operator: "!=",
          value: "1",
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // HS received today for final progress
    const { results: hsReceivedToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs`,
          on: "sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id AND hs.type = '2'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "hs.id", operator: "IS NOT", value: "NULL", raw: true },
        {
          field: "DATE(hs.created)",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "dsl.diet_start_date <= hs.created",
          operator: "",
          value: "",
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
    });

    // Final feedback received today
    const { results: finalFeedbackReceivedToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.finalFeedback} ff`,
          type: "LEFT",
          on: "sop.sub_order_id = ff.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "ff.id", operator: "IS NOT", value: "NULL", raw: true },
        {
          field: "DATE(ff.added_date)",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "dsl.diet_start_date <= ff.added_date",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "ff.final_feedback_ack",
          operator: "!=",
          value: "1",
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Final feedback calls scheduled today
    const { results: finalFeedbackCallsToday } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cu.call_status", operator: "=", value: "1" },
        { field: "cu.call_type", operator: "=", value: "2" },
        {
          field: "cu.call_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "cu.schedule_date",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
      ],
      groupBy: ["cu.user_id"],
      orderBy: ["cu.schedule_date DESC"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        goal_received_count: goalsReceivedToday,
        hs_received_count: hsReceivedToday,
        fb_received_count: finalFeedbackReceivedToday,
        fd_call_done_count: finalFeedbackCallsToday,
      },
    });

    res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error in fetching data" });
  }
};

const tailendJourneyFirstReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    // First Reminder Missed: Goals
    const { results: goalsReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
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
          orConditions: [
            {
              field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
              operator: "=",
              value: 0,
            },
            {
              field: "mg.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=6 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=6 ))`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    console.log(goalsReminderMissed, 216);
    // First Reminder Missed: Health Score
    const { results: healthScoreReminderMissed } = await readRecord({
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
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
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
          field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =1
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =1
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =6
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "hs.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // First Reminder Missed: Final Feedback
    const { results: finalFeedbackReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.finalFeedback} ff`,
          type: "LEFT",
          on: "sop.sub_order_id = ff.sub_order_id",
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
          field: ` (
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date)=6
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=1
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ff.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // First Reminder Missed: Final Feedback Call
    const { results: finalFeedbackCallReminderMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cu.call_type", operator: "=", value: "2" },
        {
          field: `(
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date)=1
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =6
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Send the response with all missed reminders
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Missed Reminders Counts",
      data: {
        goal_reminder_miss_count: goalsReminderMissed,
        hs_reminder_miss_count: healthScoreReminderMissed,
        fb_reminder_miss_count: finalFeedbackReminderMissed,
        fb_call_reminder_miss_count: finalFeedbackCallReminderMissed,
      },
      meta_data: {
        goal_reminder_miss_table_label: "Goal Reminder 1",
        hs_reminder_miss_table_label: "TEHealthScore Reminder 1",
        fb_reminder_miss_table_label: "TEFeedback Reminder 1",
        fb_call_miss_table_label: "TECall Reminder 1",
        hs_reminder_miss_notification_id: 160,
        fb_call_miss_notification_id: 170,
        fb_reminder_miss_notification_id: 165,
        goal_reminder_miss_notification_id: 155,
      },
    });
    res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendJourneySecondReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    // Second Reminder Missed: Goals
    const { results: goalsReminderSecondMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
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
          orConditions: [
            {
              field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
              operator: "=",
              value: 0,
            },
            {
              field: "mg.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=7 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=7 ))`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Second Reminder Missed: Health Score
    const { results: healthScoreReminderSecondMissed } = await readRecord({
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
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
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
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =7
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "hs.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Second Reminder Missed: Final Feedback
    const { results: finalFeedbackReminderSecondMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.finalFeedback} ff`,
          type: "LEFT",
          on: "sop.sub_order_id = ff.sub_order_id",
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
          field: ` (
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date)=7
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=2
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ff.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Second Reminder Missed: Final Feedback Call
    const { results: finalFeedbackCallReminderSecondMissed } = await readRecord(
      {
        table: `${tables.userDetails} cd`,
        selectFields: ["DISTINCT cd.user_id"],
        joins: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        conditions: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cu.call_type", operator: "=", value: "2" },
          {
            field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =7 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =2
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =7
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          ...(id
            ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
            : []),
        ],
      }
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Tailend journey data second reminder missed counts",
      data: {
        fb_reminder_miss_count: finalFeedbackReminderSecondMissed,
        hs_reminder_miss_count: healthScoreReminderSecondMissed, // Update this if needed
        fb_call_reminder_miss_count: finalFeedbackCallReminderSecondMissed,
        goal_reminder_miss_count: goalsReminderSecondMissed,
      },
      meta_data: {
        fb_reminder_miss_table_label: "TEFeedback Reminder 2",
        hs_reminder_miss_table_label: "TEHealthScore Reminder 2",
        fb_call_miss_table_label: "TECall Reminder 2",
        goal_reminder_miss_table_label: "Goal Reminder 2",
        hs_reminder_miss_notification_id: 161,
        fb_call_miss_notification_id: 171,
        fb_reminder_miss_notification_id: 166,
        goal_reminder_miss_notification_id: 156,
      },
    });

    return res.status(200).json(apiResponse);
    // Send response with all second missed reminders
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendJourneyThirdReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    // Third Reminder Missed: Goals
    const { results: goalsReminderThirdMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
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
          orConditions: [
            {
              field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
              operator: "=",
              value: 0,
            },
            {
              field: "mg.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=8 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=8 ))`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Third Reminder Missed: Health Score
    const { results: healthScoreReminderThirdMissed } = await readRecord({
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
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
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
          field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =8
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "hs.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Third Reminder Missed: Final Feedback
    const { results: finalFeedbackReminderThirdMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.finalFeedback} ff`,
          type: "LEFT",
          on: "sop.sub_order_id = ff.sub_order_id",
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
          field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date)=4
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date)=8
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=3
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ff.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Third Reminder Missed: Final Feedback Call
    const { results: finalFeedbackCallReminderThirdMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cu.call_type", operator: "=", value: "2" },
        {
          field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =8 
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =3
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =8
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Tailend journey data third reminder missed counts",
      data: {
        fb_reminder_miss_count: finalFeedbackReminderThirdMissed,
        hs_reminder_miss_count: healthScoreReminderThirdMissed, // Update this if needed
        fb_call_reminder_miss_count: finalFeedbackCallReminderThirdMissed,
        goal_reminder_miss_count: goalsReminderThirdMissed,
      },
      meta_data: {
        fb_reminder_miss_table_label: "TEFeedback Reminder 3",
        hs_reminder_miss_table_label: "TEHealthScore Reminder 3",
        fb_call_miss_table_label: "TECall Reminder 3",
        goal_reminder_miss_table_label: "Goal Reminder 3",
        hs_reminder_miss_notification_id: 162,
        fb_call_miss_notification_id: 172,
        fb_reminder_miss_notification_id: 167,
        goal_reminder_miss_notification_id: 157,
      },
    });

    return res.status(200).json(apiResponse);
    // Send response with all third missed reminders
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendJourneyFourthReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    // Third Reminder Missed: Goals
    const { results: goalsReminderFourthMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
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
          orConditions: [
            {
              field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
              operator: "=",
              value: 0,
            },
            {
              field: "mg.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=9 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=9 ))`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Third Reminder Missed: Health Score
    const { results: healthScoreReminderFourthMissed } = await readRecord({
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
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
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
          field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =9
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "hs.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Third Reminder Missed: Final Feedback
    const { results: finalFeedbackReminderFourthMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.finalFeedback} ff`,
          type: "LEFT",
          on: "sop.sub_order_id = ff.sub_order_id",
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
          field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date)=5
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date)=9
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=4
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ff.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Third Reminder Missed: Final Feedback Call
    const { results: finalFeedbackCallReminderFourthMissed } = await readRecord(
      {
        table: `${tables.userDetails} cd`,
        selectFields: ["DISTINCT cd.user_id"],
        joins: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        conditions: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cu.call_type", operator: "=", value: "2" },
          {
            field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =4 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =9
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          ...(id
            ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
            : []),
        ],
      }
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Tailend journey data fourth reminder missed counts",
      data: {
        fb_reminder_miss_count: finalFeedbackReminderFourthMissed,
        hs_reminder_miss_count: healthScoreReminderFourthMissed, // Update this if needed
        fb_call_reminder_miss_count: finalFeedbackCallReminderFourthMissed,
        goal_reminder_miss_count: goalsReminderFourthMissed,
      },
      meta_data: {
        fb_reminder_miss_table_label: "TEFeedback Reminder 4",
        hs_reminder_miss_table_label: "TEHealthScore Reminder 4",
        fb_call_miss_table_label: "TECall Reminder 4",
        goal_reminder_miss_table_label: "Goal Reminder 4",
        hs_reminder_miss_notification_id: 163,
        fb_call_miss_notification_id: 173,
        fb_reminder_miss_notification_id: 168,
        goal_reminder_miss_notification_id: 158,
      },
    });

    return res.status(200).json(apiResponse);
    // Send response with all third missed reminders
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const tailendJourneyFifthReminderMissed = async (req, res, next) => {
  const { id } = req.query;
  try {
    // Fifth Reminder Missed: Goals
    const { results: goalsReminderFifthMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.bnMyGoalsNew} mg`,
          type: "LEFT",
          on: "sop.sub_order_id = mg.sub_order_id",
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
          field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=10 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date)=10 ))`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          orConditions: [
            {
              field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
              operator: "=",
              value: 0,
            },
            {
              field: "mg.id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },

        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });
    console.log(goalsReminderFifthMissed, 1189);
    // Fifth Reminder Missed: Health Score
    const { results: healthScoreReminderFifthMissed } = await readRecord({
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
          on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
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
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) =10
		)
	)`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "hs.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Fifth Reminder Missed: Final Feedback
    const { results: finalFeedbackReminderFifthMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.finalFeedback} ff`,
          type: "LEFT",
          on: "sop.sub_order_id = ff.sub_order_id",
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
          field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date)=6
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date)=10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date)=5
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "ff.id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Fifth Reminder Missed: Final Feedback Call
    const { results: finalFeedbackCallReminderFifthMissed } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["DISTINCT cd.user_id"],
      joins: [
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "LEFT",
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.callUpdates} cu`,
          type: "LEFT",
          on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cu.call_type", operator: "=", value: "2" },
        {
          field: `(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) =5 
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) =10
		)
	)
`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
        ...(id
          ? [{ field: "cd.mentor_assigned", operator: "=", value: id }]
          : []),
      ],
    });

    // Combine results into a response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Tailend journey data fifth reminder missed counts",
      data: {
        fb_reminder_miss_count: finalFeedbackReminderFifthMissed,
        hs_reminder_miss_count: healthScoreReminderFifthMissed, // Update this if needed
        fb_call_reminder_miss_count: finalFeedbackCallReminderFifthMissed,
        goal_reminder_miss_count: goalsReminderFifthMissed,
      },
      meta_data: {
        fb_reminder_miss_table_label: "TEFeedback Final Reminder",
        hs_reminder_miss_table_label: "TEHealthScore Last Reminder",
        fb_call_miss_table_label: "TECall Final Reminder",
        goal_reminder_miss_table_label: "Goal Final Reminder",
        hs_reminder_miss_notification_id: 164,
        fb_call_miss_notification_id: 174,
        fb_reminder_miss_notification_id: 169,
        goal_reminder_miss_notification_id: 159,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const todaysRecievedData = async (req, res, next) => {
  const { user_ids: ids, data, search } = req.body;
  if (!ids.length > 0 || !data) {
    return next(new ErrorHandler("Invalid request", 400));
  }
  const dataCategory = ["hs", "fb", "call", "goal"];
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
          goal: true,
          goal_weight: true,
        },
        ...(search && searchObj),
      });
      if (req.headers.source === "cs_db") {
        finalData = details;
      } else {
        console.log(details, 1432);
        console.log(
          safeJSONParse(details[0].comment, {
            new_goals: [],
            goals_achieved: [],
            milestone_achieved: [],
          }),
          1433
        );
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { health_score: true, weight_data: true, hs_back: true },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
              },
            },
            extraMappings: {
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
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
          final_feedback: true,
          goal: true,
          goal_weight: true,
          health_score: true,
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
            addFields: { health_score: true, weight_data: true },
            extraMappings: {
              final_feedback: {
                mentor_rating: details[index].client_final_mentor_rating,
                improvement_needed: details[index].client_final_improvement,
                added_date: details[index].client_final_feedback_date,
              },
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
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
          { field: "cu.call_type", operator: "=", value: "2" },
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
          goal: true,
          goal_weight: true,
          final_feedback: true,
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
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
              final_feedback: {
                mentor_rating: details[index].client_final_mentor_rating,
                improvement_needed: details[index].client_final_improvement,
                added_date: details[index].client_final_feedback_date,
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
    } else if (data === "goal") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          goal: true,
          goal_weight: true,
        },
        ...(search && searchObj),
      });
      console.log(details, 1385);
      if (req.headers.source === "cs_db") {
        finalData = details;
      } else {
        finalData = ids.map((user, index) => {
          return mapUserData({
            details: details[index],
            user,
            addFields: { weight_data: true },
            extraMappings: {
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
            },
            addExtraKeyTo: {
              user_details: {
                user_id: user,
              },
            },
          });
        });
      }
      console.log(details, 1385);
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
const remindersMissedData = async (req, res, next) => {
  const { user_ids: ids, data, whatsapp_text_label, search } = req.body;
  if (!ids.length > 0 || !data) {
    return next(new ErrorHandler("Invalid request", 400));
  }
  console.log(data, 2013);
  const dataCategory = ["hs", "fb", "call", "goal"];
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
    console.log(whatsappTextVariables, 1888);
    const whatsTextDetails = await fetchUserDetailsDynamic({
      ids,
      fields: [...whatsappTextVariables],
    });
    console.log(whatsappText, 1809);
    if (data === "hs") {
      const details = await fetchUsersDetailsNew({
        ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          health_score: true,
          order_summary: true,
          goal: true,
          goal_weight: true,
          halftime_feedback: true,
          is_active: true,
        },
        ...(search && searchObj),
      });
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
      console.log(callDetails, 1708);
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
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
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
          final_feedback: true,
          goal: true,
          goal_weight: true,
          health_score: true,
          order_summary: true,
          halftime_feedback: true,
          is_active: true,
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
            addFields: { health_score: true, weight_data: true },
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
              "call_&_key_insight_details": {
                schedule_date: moment(callDetails[index]?.schedule_date).format(
                  "YYYY-MM-DD"
                ),
                appointment_slots: callDetails[index]?.appointment_slots,
                key_insight: callDetails[index]?.call_insights,
                call_status: callDetails[index]?.call_status,
              },
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
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
          goal: true,
          goal_weight: true,
          order_summary: true,
          final_feedback: true,
        },
        ...(search && searchObj),
      });
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
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: replacePlaceholders(
                  whatsappText,
                  whatsTextDetails[index]
                ),
              },
            },
            addFields: { weight_data: true, health_score: true },
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
              goals: safeJSONParse(details[index].comment, {
                new_goals: [],
                goals_achieved: [],
                milestone_achieved: [],
              }).goals_achieved,
              final_feedback: {
                mentor_rating: details[index].client_final_mentor_rating,
                improvement_needed: details[index].client_final_improvement,
                added_date: details[index].client_final_feedback_date,
              },
            },
          });
        });
      }
    } else if (data === "goal") {
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
          goal_weight: true,
          halftime_feedback: true,
          health_score: true,
        },
      });
      console.log(whatsappText, 2088);
      console.log(whatsTextDetails, 2089);
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
            addExtraKeyTo: {
              user_details: {
                user_id: user,
                whatsapp_text: replacePlaceholders(
                  whatsappText,
                  whatsTextDetails[index]
                ),
              },
            },
            addFields: { weight_data: true, health_score: true },
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
      message: "Data fetched successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const ackTailendHs = async (req, res, next) => {
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
const ackOcHs = async (req, res, next) => {
  try {
    const { user_id,mentor_id } = req.body;

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
        type:'3'
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

const ackTailendFeedback = async (req, res, next) => {
  try {
    const { user_id,sub_order_id,mentor_id } = req.body;

    // Validate required fields
    if (!user_id && !sub_order_id && !mentor_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const feedbackUpdatedResult = await updateRecord(
      tables.finalFeedback,
      {
        final_feedback_ack: 1,
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

const ackGoals = async (req, res, next) => {
  try {
    const { user_id,sub_order_id,mentor_id } = req.body;

    // Validate required fields
    if (!user_id && !sub_order_id && !mentor_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const goalUpdatedResult = await updateRecord(
      tables.bnMyGoalsNew,
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

    if (!goalUpdatedResult || goalUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("goal record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "goal Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const ackMilestone = async (req, res, next) => {
  try {
    const { user_id,sub_order_id,mentor_id } = req.body;

    // Validate required fields
    if (!user_id && !sub_order_id && !mentor_id) {
      return next(new ErrorHandler("Invalid or missing required fields", 400));
    }

    const goalUpdatedResult = await updateRecord(
      tables.bnMyGoalsNew,
      {
        m_ack: 1,
        m_ack_by: mentor_id,
        m_ack_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { 
        user_id: user_id,
        sub_order_id:sub_order_id,
       }
    );

    if (!goalUpdatedResult || goalUpdatedResult.affectedRows === 0) {
      return next(
        new ErrorHandler("goal record not found or not updated", 404)
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Milestone Acknowledge Successfully",
      })
    );
  } catch (error) {
    console.error("Error in Acknowledge:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


export {
  tailendJourneyDataReceivedToday,
  tailendJourneyFirstReminderMissed,
  tailendJourneySecondReminderMissed,
  tailendJourneyThirdReminderMissed,
  tailendJourneyFourthReminderMissed,
  tailendJourneyFifthReminderMissed,
  todaysRecievedData,
  remindersMissedData,
  ackTailendFeedback,
  ackTailendHs,
  ackGoals,
  ackMilestone,
  ackOcHs,

};
