import axios from "axios";
import { readRecord, updateRecord } from "../config/query.js";
import { app_versions, tables } from "../helper/constant.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import "dotenv/config";
import moment from "moment";
import { ApiResponse } from "../utils/APiResponse.js";
import userNotification from "../models/userNotificationModel.js";
const notificationList = async (req, res, next) => {
  try {
    const { user_id } = req.body;

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1); // CURDATE() + INTERVAL 1 DAY
    tomorrow.setHours(0, 0, 0, 0);
    console.log(tomorrow);
    const userNotifications = await userNotification
      .find({
        user_id: Number(user_id),
        expiry_date: { $gte: tomorrow },
      })
      .sort({ added_date: -1 });

    const formattedNotifications = userNotifications.map((notification) => {
      // Convert to plain JS object
      const notifObj = notification.toObject();

      // Destructure to remove __v
      const { __v, _id, ...rest } = notifObj;

      return {
        id: _id,
        ...rest,
        redirect_id: notification.redirect_id ? notification.redirect_id : 0,
        read_status: notification.read_status ? "1" : "0",
        expiry_date: moment(notification.expiry_date).format(
          "DD-MM-YYYY HH:mm:ss"
        ),
        added_date: moment(notification.added_date).fromNow(),
      };
    });

    return res.status(201).json({
      status: true,
      message: "Notification list fetched Successfully.",
      data: formattedNotifications,
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

const notificationCount = async (req, res, next) => {
  try {
    const { user_id } = req.body;

    const count = await userNotification.countDocuments({
      user_id: Number(user_id),
    });

    return res.status(200).json({
      status: true,
      message: "Notification count fetched successfully.",
      count,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

const sendAskAllNotification = async (req, res, next) => {
  try {
    const { table_name } = req.body;
    const source = req.headers["source"];

    if (!table_name) {
      return next(new ErrorHandler("Table Name Not Provided", 400));
    }

    switch (table_name) {
      case "app_not_updated":
        const { results } = await readRecord({
          table: `${tables.userDetails} ud`,
          selectFields: ["DISTINCT ud.user_id"],
          conditions: [
            {
              orConditions: [
                {
                  raw: true,
                  field: `(
                    (SELECT LOWER(device)
                     FROM bn_user_fcm_token
                     WHERE user_id = ud.user_id
                     ORDER BY id DESC
                     LIMIT 1) LIKE 'ios%'
                     AND ud.app_version < '${app_versions.ios}'
                  )`,
                  operator: "=",
                  value: true,
                },
                {
                  raw: true,
                  field: `(
                    (SELECT LOWER(device)
                     FROM bn_user_fcm_token
                     WHERE user_id = ud.user_id
                     ORDER BY id DESC
                     LIMIT 1) LIKE 'android%'
                     AND ud.app_version < '${app_versions.android}'
                  )`,
                  operator: "=",
                  value: true,
                },
              ],
            },
            {
              field: "ud.user_status",
              operator: "=",
              value: "Active",
            },
          ],
        });

        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            // user_ids: [114409, 30325, 126836],
            user_ids: results.map((id) => id.user_id),
            notification_id: 175,
            send_later: false,
            time_delay: 0,
            sent_via: source,
            expiry_date: moment().add(1, "day").format("YYYY-MM-DD"),
          }
        );
        break;

      default:
        break;
    }

    return res.status(200).json(
      new ApiResponse({
        message: `${table_name} Notification Sent Successfully`,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server Error", 500));
  }
};

const acknowledgeNotification = async (req, res, next) => {
  try {
    const { notification_id } = req.body;

    // Update read_status in MongoDB
    const updatedResult = await userNotification.updateOne(
      { _id: notification_id },
      { $set: { read_status: true } } // store as boolean true (or "1" if string)
    );

    if (updatedResult.modifiedCount === 0) {
      return next(new ErrorHandler("Error Acknowledging Notification", 400));
    }

    return res
      .status(200)
      .json(
        new ApiResponse({ message: "Notification Acknowledged Successfully" })
      );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  notificationList,
  sendAskAllNotification,
  notificationCount,
  acknowledgeNotification,
};
