import cron from "node-cron";
import { readRecord } from "../config/query.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { mapCallType } from "../helper/commonHelper.js";
import { tables } from "../helper/constant.js";
import moment from "moment";

cron.schedule("*/5 * * * * *", async () => {
  try {
    const now = new Date();
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);
    const formatTime = (date) =>
      date.toLocaleTimeString("en-IN", {
        hour12: false,
        timeZone: "Asia/Kolkata",
      });

    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: ["cu.call_type", "cu.schedule_date", "cu.added_by"],
      conditions: [
        {
          field: "TIME(cu.schedule_date)",
          operator: ">=",
          value: `TIME('${formatTime(now)}')`,
          raw: true,
        },
        {
          field: "TIME(cu.schedule_date)",
          operator: "<",
          value: `TIME('${formatTime(fifteenMinutesLater)}')`,
          raw: true,
        },
      ],
    });

    if (results.length > 0) {
      console.log("Reminder sent to users");
      const scheduleTime = moment(results[0].schedule_time).fromNow();
      const data = {
        title: `You Have a ${mapCallType(
          results[0].call_type
        )} In ${scheduleTime}`,
        priority: 1,
      };
      sendSSEEvent({ mentor_id: results[0].added_by, data });
    } else {
      console.log("No reminders to send");
    }
  } catch (error) {
    console.error("Error occurred:", error);
    return new Error(error.message);
  }
});

export { cron as reminderCron };
