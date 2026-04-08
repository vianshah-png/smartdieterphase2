import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import {
  fetchUserDetailsDynamic,
  rangeFormatter,
  replacePlaceholders,
  containsNull,
  extractVariables,
} from "../../helper/common.js";
import { cloudinaryFolders, redisKeys, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import axios from "axios";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { raw } from "express";
import userNotification from "../../models/userNotificationModel.js";
const addNotification = async (req, res, next) => {
  const {
    title,
    description,
    redirect_page,
    redirect_id,
    url,
    auto_chat,
    stack,
  } = req.body;
  const files = req.files;
  try {
    if (!title || !description || !redirect_page) {
      return next(
        new ErrorHandler(
          "title , description , redirect_page not provided",
          404
        )
      );
    }
    const new_data = {
      title,
      description,
      redirect_page,
      redirect_id: redirect_id || "",
      url: url || "",
      stack: stack || "both",
    };
    const title_vaiables = extractVariables(title);
    const description_variables = extractVariables(description);
    if (title_vaiables.length > 0) {
      new_data.title_variables = JSON.stringify(title_vaiables);
    }
    if (description_variables.length > 0) {
      new_data.description_variables = JSON.stringify(description_variables);
    }
    if (files && files.length > 0) {
      const images = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.notification
      );
      new_data.notification_banner = JSON.stringify(images);
    }
    const columns = Object.keys(new_data);
    const values = Object.values(new_data);
    if (auto_chat) {
      columns.push("auto_chat");
      values.push(auto_chat);
    }
    const result = await insertRecord(tables.notifications, columns, values);
    if (!result.affectedRows === 1) {
      return next(new ErrorHandler("Error While Adding Notitification", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Notification added successfully",
      data: { notificationId: result.insertId },
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllNotificationTitles = async (req, res, next) => {
  const { search } = req.query;
  try {
    const { results: result } = await readRecord({
      table: tables.notifications,
      selectFields: ["id", "title"],
      conditions: [{ field: "is_deleted", operator: "=", value: 0 }],
      search: {
        searchQuery: search,
        searchFields: ["title", "description", "redirect_page"],
      },
      orderBy: ["created_at DESC"],
    });
    return res.status(200).json(result);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllNotifications = async (req, res, next) => {
  const { page, limit, search, stack } = req.query;
  const pagination = { page, limit };
  const searchQuery = search ? { searchQuery: search } : {};
  let conditions = [
    {
      field: "n.is_deleted",
      operator: "=",
      value: 0,
    },
  ];
  if (stack) {
    conditions.push({ field: "n.stack", operator: "=", value: stack });
  }
  try {
    const selectFields = [
      "n.id",
      "n.title",
      "n.description",
      "n.redirect_page",
      "n.redirect_id",
      "n.title_variables",
      "n.description_variables",
      "n.notification_banner",
      "n.url",
      "n.auto_chat",
      "n.stack",
    ];

    // Fetch notifications
    const { results: notifications, totalCount } = await readRecord({
      table: `${tables.notifications} n`,
      selectFields,
      pagination,
      search: searchQuery,
      conditions,
      countTotal: true,
      orderBy: ["n.created_at DESC"],
    });
    if (notifications.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Notifications found",
        data: [],
        totalCount: 0,
      });
      return res.status(200).json([apiResponse]);
    }
    const finalData = notifications.map((notification) => {
      const title_variables = JSON.parse(notification.title_variables || "[]");
      const description_variables = JSON.parse(
        notification.description_variables || "[]"
      );
      const notification_banner = safeJSONParse(
        notification.notification_banner,
        []
      );
      return {
        ...notification,
        title_variables,
        description_variables,
        notification_banner,
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notifications fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getNotificationById = async (req, res, next) => {
  const id = req.params.id;
  console.log("hello", 158, id);
  if (!id) {
    return next(new ErrorHandler("ID not provided", 400));
  }

  try {
    // Fetch the notification by ID
    const { results: notification } = await readRecord({
      table: `${tables.notifications}`,
      selectFields: [
        "id",
        "title",
        "description",
        "redirect_page",
        "redirect_id",
      ],
      conditions: [{ field: "id", operator: "=", value: parseInt(id) }],
    });

    if (notification.length === 0) {
      return next(
        new ErrorHandler("No notification found with the given ID", 404)
      );
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notification fetched successfully",
      data: notification,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateNotification = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;
  const files = req.files;
  try {
    if (files.length > 0) {
      const images = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.notification
      );
      updatedData.notification_banner = JSON.stringify(images);
    }
    const condition = { id: parseInt(id) };
    delete updatedData.image;
    const success = await updateRecord(
      `${tables.notifications}`,
      updatedData,
      condition
    );
    console.log(success);

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Notification updated successfully",
      });
      await redisDelByPattern({
        pattern: `${redisKeys.notifications}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      if (success.info.substring(0, 15) == "Rows matched: 0") {
        return next(
          new ErrorHandler("No notification found with the given id", 400)
        );
      } else if (
        success.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No changes made to the notifications",
        });
        return res.status(200).json(apiResponse);
      } else {
        return next(new ErrorHandler("Error While Updating Notification", 500));
      }
    }
  } catch (error) {
    console.error("Error updating Notification", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteNotification = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;

  console.log(id, deleted_by, 109);
  if (!id || !deleted_by) {
    return next(new ErrorHandler("id or deleted_by is not Provided", 400));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by,
    };

    const condition = { id: parseInt(id) };
    const deletedNotification = await updateRecord(
      `${tables.notifications}`,
      updatedData,
      condition
    );
    if (deletedNotification.affectedRows === 0) {
      return next(
        new ErrorHandler("No Notification found with the given id", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notification ${id} deleted Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const sendNotification = async (req, res, next) => {
  const { userIds, notificationId } = req.body;
  if (!notificationId || userIds.length === 0) {
    return next(
      new ErrorHandler("notification Id and user ids are required", 400)
    );
  }

  const { results: notifications } = await readRecord({
    table: `${tables.notifications}`,
    selectFields: [
      "title",
      "description",
      "redirect_page",
      "notification_banner",
    ],
    conditions: [{ field: "id", operator: "=", value: notificationId }],
  });

  if (!notifications || notifications.length === 0) {
    return next(
      new ErrorHandler("No notification found with the given id", 400)
    );
  }

  // Create the payload object that will be reused and modified for each user
  const basePayload = {
    notification: {
      title: notifications[0].title,
      body: notifications[0].description,
    },
    data: {
      route: notifications[0].redirect_page,
    },
  };

  // Parse and set notification banner image if it exists
  try {
    if (notifications[0].notification_banner) {
      const notification_banner = JSON.parse(
        notifications[0].notification_banner
      );
      basePayload.notification.image = notification_banner[0].file.path;
    }
  } catch (error) {
    return next(new ErrorHandler("Failed to parse notification banner", 400));
  }

  for (const userId of userIds) {
    const { results: userData } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["*"],
      conditions: [{ field: "user_id", operator: "=", value: userId }],
    });

    if (userData.length === 0) {
      return next(
        new ErrorHandler(`No user found with the given user_id: ${userId}`, 400)
      );
    }

    // Deep copy the payload so it is unique for each user
    const payload = JSON.parse(JSON.stringify(basePayload));

    if (userData[0].first_name) {
      payload.notification.body = payload.notification.body.replace(
        "{{name}}",
        `${userData[0].first_name} ${userData[0].last_name}`
      );
    } else {
      return next(
        new ErrorHandler(`User ${userId} has no first or last name`, 400)
      );
    }

    if (!userData[0].fcm_token) {
      return next(
        new ErrorHandler(`No FCM token found for user ${userId}`, 400)
      );
    }

    try {
      const send_notification = await axios.post(
        "https://notification-service-jet.vercel.app/notification",
        {
          tokens: [userData[0].fcm_token],
          payload,
        }
      );
      console.log(
        `Notification sent successfully: to ${userData[0].user_id}`,
        send_notification.data
      );
    } catch (error) {
      console.error("Error sending notification:", error);
      return next(new ErrorHandler("Error sending notification", 500));
    }
  }

  const apiResponse = new ApiResponse({
    statusCode: 200,
    message: "notification sent successfully",
    data: basePayload,
  });

  return res.json([apiResponse]);
};
const sendNotificationNew = async (req, res, next) => {
  const {
    user_ids,
    notification_id,
    send_later = false,
    time_delay = 0,
    scheduled_notification_id,
    sent_via,
    expiry_date,
    extraVariables,
  } = req.body;
  console.log(user_ids, notification_id, send_later, time_delay, sent_via, 397);
  // return false;
  //  Check if user_ids and notification_id are provided
  if (user_ids.length === 0 || !notification_id) {
    return next(
      new ErrorHandler("User ids and notification id are required", 400)
    );
  }
  try {
    // Fetch the notification by the given notification id
    const { results: notification } = await readRecord({
      selectFields: ["*"],
      table: tables.notifications,
      conditions: [{ field: "id", operator: "=", value: notification_id }],
    });

    // if no notification found with the given id we will return an error
    if (notification.length === 0) {
      return next(
        new ErrorHandler("No notification found with the given id", 400)
      );
    }
    // console.log(notification[0]);

    // parsing the title variables and description variables as they are stored as JSON string in the database
    const title_vaiables = JSON.parse(notification[0].title_variables || "[]"); // "[]" is default value if no title variables are present and empty string will throw an error

    const description_variables = JSON.parse(
      notification[0].description_variables || "[]"
    );

    const extractedVariables = extractVariables(notification[0].auto_chat);
    const urlVariables = extractVariables(notification[0]?.url);
    // extracting fields from title variables and description variables
    const fields = [
      ...title_vaiables,
      ...description_variables,
      ...extractedVariables,
      ...urlVariables,
    ];
    console.log(fields, 398);

    // fetching user details for the given user ids and according to the fields found in the notification
    const usersData = await fetchUserDetailsDynamic({
      ids: user_ids,
      fields,
      extraVariables,
    });
    const notificationBanner = JSON.parse(
      notification[0].notification_banner || "[]"
    ); // parsing the notification banner as it is stored as JSON string in the database
    const notificationData = []; // array to store the notification data
    const tokens = []; // array to store fcm tokens of the users
    console.log(usersData, 399);
    const userInAppNotifications = new Map();
    const autChatsMap = new Map();
    for (let i = 0; i < usersData.length; i++) {
      let isValid = true; // flag to check if the notification is valid or not for the given user id
      const notificationObj = {
        notification: {
          title:
            title_vaiables.length === 0
              ? notification[0].title
              : replacePlaceholders(notification[0].title, usersData[i]), // replacing the placeholders in the title with the actual values using the replacePlaceholders function
          body:
            description_variables.length === 0
              ? notification[0].description
              : replacePlaceholders(notification[0].description, usersData[i]),
        },
        data: {
          redirect_page: notification[0].redirect_page || "",
          redirect_id: notification[0].redirect_id || "",
          url:
            replacePlaceholders(notification[0].url ?? "", usersData[i]) || "",
        },
      };

      // setting the image for the notification if the notification banner is present
      if (notificationBanner.length > 0) {
        notificationObj.notification.image = notificationBanner[0].file.path;
      }
      if (
        containsNull(notificationObj.notification.title) ||
        containsNull(notificationObj.notification.body) ||
        !usersData[i].fcm_token // checking if the title, body using containsNull and fcm token is null if found then the notification is marked as invalid for the given user id
      ) {
        isValid = false;
      }
      let chat = "";
      if (notification[0].auto_chat) {
        // const extractedVariables = extractVariables(notification[0].auto_chat);
        // console.log(extractedVariables, 490);
        // const userDetails = await fetchUserDetailsDynamic({
        //   ids: [usersData[i].user_id],
        //   fields: extractedVariables,
        //   extraVariables,
        // });
        // console.log(userDetails, 491);
        console.log(notification[0].auto_chat, 492);
        chat = replacePlaceholders(notification[0]?.auto_chat, usersData[i]);
      }

      if (chat !== "" && !containsNull(chat) && usersData[i].mentor_id) {
        autChatsMap.set(usersData[i].user_id, {
          user_id: usersData[i].user_id,
          name: usersData[i].name,
          query: chat,
          mentor_id: usersData[i].mentor_id,
          sender: "mentor",
          type: "broadcast",
        });
      }
      // pushing the fcm token to the tokens array if the notification is valid
      if (isValid) {
        tokens.push({
          fcm: usersData[i].fcm_token,
          id: usersData[i].fcm_id,
        });
        notificationData.push(notificationObj);
        userInAppNotifications.set(usersData[i].user_id, {
          user_id: usersData[i].user_id,
          notification_id: notification[0].id,
          title: notificationObj.notification.title,
          description: notificationObj.notification.body,
          notification_image: notificationObj.notification.image,
          redirect_page: notification[0].redirect_page,
          redirect_id: notification[0].redirect_id,
          url: notificationObj.data.url,
          read_status: "0",
          expiry_date:
            expiry_date ||
            moment().add(1, "days").format("YYYY-MM-DD HH:mm:ss"),
        });
      }
    }
    // if no valid tokens are found for the given notification id we will not call our notification service we will return an error instead

    for (const userId of userInAppNotifications.keys()) {
      try {
        const data = userInAppNotifications.get(userId);
        // const insertResult = await insertRecord(
        //   tables.user_notifications,
        //   Object.keys(data),
        //   Object.values(data)
        // );
        const insertResultMongo = await userNotification.create(data);
        // console.log(insertResult, userId);
        console.log(insertResultMongo, userId);
      } catch (error) {
        console.log(error);
      }
    }
    console.log(autChatsMap, 532);
    const autChats = Array.from(autChatsMap.values());
    // console.log()
    if (autChats.length > 0) {
      try {
        await clientEnquiry.insertMany(autChats, { ordered: false });
      } catch (err) {
        console.log(err.insertedDocs); // successfully inserted docs
        console.log(err.writeErrors); // failed ones
      }
    }

    await updateRecord(
      tables.schedulesNotifications,
      {
        notification_status: "sent",
      },
      {
        id: scheduled_notification_id,
      }
    );
    console.log(tokens, notificationData, 480);
    if (tokens.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No valid tokens found for the given notification id",
      });
    }
    try {
      await axios.post(
        `${process.env.NOTIFICATION_SERVICE_URL}/api/v1/notifications/send-separate-notifications`,
        {
          tokens,
          payloads: notificationData,
          notification_id,
          send_later,
          time_delay,
          sent_via: sent_via || req.headers["source"],
          scheduled_notification_id,
        }
      );
    } catch (error) {
      console.log(error);
    }

    // finall we will return the response from the notification service as it is
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notification sent successfully",
      data: "",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const fetchScheduledNotifications = async () => {
  try {
    const { results: scheduledNotifications, totalCount } = await readRecord({
      selectFields: [
        "sn.*",
        "TIMESTAMPDIFF(MINUTE,TIME(NOW()),sn.schedule_time) as min_to_schedule",
      ],
      table: `${tables.schedulesNotifications} sn`,
      conditions: [
        { field: "sn.notification_status", operator: "=", value: "pending" },
        {
          field: "DATE(sn.schedule_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "TIMESTAMPDIFF(MINUTE,TIME(NOW()),sn.schedule_time)",
          operator: "<=",
          value: 15,
          raw: true,
        },
        { field: "sn.is_deleted", operator: "=", value: 0 },
      ],
      countTotal: true,
    });
    console.log(scheduledNotifications, 606);
    console.log(totalCount, 607);
    // return;
    let notifications = [];
    for (let i = 0; i < totalCount; i++) {
      let conditions = [];
      let joins = [];
      let notification = scheduledNotifications[i];
      if (
        notification.wallet_range != null &&
        notification.wallet_range != ""
      ) {
        let range = notification.wallet_range.split("-");
        conditions.push({
          field: "cd.my_wallet",
          operator: "BETWEEN",
          value: [range[0], range[1]],
          raw: true,
        });
      }
      if (
        notification.user_status != null &&
        notification.user_status != "" &&
        notification.user_status != "[]"
      ) {
        const status = safeJSONParse(notification.user_status, []);
        conditions.push({
          orConditions: status.map((s) => {
            return { field: "cd.sub_user_status", operator: "=", value: s };
          }),
        });
      }
      if (
        notification.gender != null &&
        notification.gender != "" &&
        notification.gender != "[]"
      ) {
        const genders = safeJSONParse(notification.gender, []);
        conditions.push({
          orConditions: genders.map((g) => {
            return { field: "cd.gender", operator: "=", value: g };
          }),
        });
      }
      if (
        notification.countries != null &&
        notification.countries != "" &&
        notification.countries != "[]"
      ) {
        const countries = safeJSONParse(notification.countries, []);
        conditions.push({
          orConditions: countries.map((c) => {
            return { field: "cd.country_id", operator: "=", value: c };
          }),
        });
      }
      if (
        notification.cities != null &&
        notification.cities != "" &&
        notification.cities != "[]"
      ) {
        const cities = safeJSONParse(notification.cities, []);
        conditions.push({
          orConditions: cities.map((c) => {
            return { field: "cd.city_id", operator: "=", value: c };
          }),
        });
      }
      if (
        notification.states != null &&
        notification.states != "" &&
        notification.states != "[]"
      ) {
        const states = safeJSONParse(notification.states, []);
        conditions.push({
          orConditions: states.map((s) => {
            return { field: "cd.state_id", operator: "=", value: s };
          }),
        });
      }
      if (
        notification.programs != null &&
        notification.programs != "" &&
        notification.programs != "[]"
      ) {
        const programs = safeJSONParse(notification.programs, []);
        conditions.push({
          orConditions: programs.map((p) => {
            return { field: "sop.program_id", operator: "=", value: p };
          }),
        });
        joins.push({
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id and cd.active_order_id is not null",
        });
      }
      if (
        notification.weight_range != null &&
        notification.weight_range != ""
      ) {
        let range = notification.weight_range.split("-");
        conditions.push({
          field: "cd.latest_weight",
          operator: "BETWEEN",
          value: [range[0], range[1]],
          raw: true,
        });
      }
      if (notification.age_range != null && notification.age_range != "") {
        let range = notification.age_range.split("-");
        conditions.push({
          field: "TIMESTAMPDIFF(YEAR,cd.birth_date,NOW())",
          operator: "BETWEEN",
          value: [range[0], range[1]],
          raw: true,
        });
      }
      if (
        notification.ethnicity != null &&
        notification.ethnicity != "" &&
        notification.ethnicity != "[]"
      ) {
        const ethnicities = safeJSONParse(notification.ethnicity, []);
        conditions.push({
          orConditions: ethnicities.map((e) => {
            return { field: "cd.ethnicity", operator: "=", value: e };
          }),
        });
      }
      if (
        notification.suggested_programs != null &&
        notification.suggested_programs != "" &&
        notification.suggested_programs != "[]"
      ) {
        const suggestedPrograms = safeJSONParse(
          notification.suggested_programs,
          []
        );
        conditions.push({
          orConditions: suggestedPrograms.map((sp) => {
            return {
              field: "cd.suggested_program_id",
              operator: "=",
              value: sp,
            };
          }),
        });
      }
      if (String(notification.promotional) === "yes") {
        conditions.push({
          field: "cd.pro_notification",
          operator: "<>",
          value: 1,
        });
      }
      if (String(notification.mode) === "test") {
        conditions.push({
          field: "cd.mentor_assigned",
          operator: "=",
          value: 196,
        });
      }

      if (
        String(notification.user_id) !== "null" &&
        String(notification.user_id) !== ""
      ) {
        const user_ids = notification.user_id.split(",");
        conditions.push({
          field: "cd.user_id",
          operator: "IN",
          value: user_ids,
        });
      }
      if (
        String(notification.not_include_user) !== "null" &&
        String(notification.not_include_user) !== ""
      ) {
        conditions.push({
          field: "cd.user_id",
          operator: "NOT IN",
          value: `(${notification.not_include_user})`,
          raw: true,
        });
      }

      const { results: users, totalCount: userCount } = await readRecord({
        selectFields: ["*"],
        table: `${tables.userDetails} cd`,
        conditions,
        joins,
        countTotal: true,
      });
      // console.log(conditions, 683);
      // return;
      const user_ids = users.map((u) => u.user_id);
      const notificationData = {
        user_ids,
        notification_id: notification.notification_id,
        time: notification.min_to_schedule,
        scheduled_notification_id: notification.id,
        expiry_date: moment()
          .add("days", notification.expiry_days || 1)
          .format("YYYY-MM-DD HH:mm:ss"),
      };
      notifications.push(notificationData);
    }
    console.log(notifications, 651);
    const BATCH_SIZE = 5000;
    const DELAY_TIME = 5000; // Delay of 5 seconds
    // return;
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];

      // Split user_ids into batches of max 2000
      const userIdsBatches = chunkArray(notification.user_ids, BATCH_SIZE);

      // Send the first batch immediately
      processBatch(userIdsBatches[0], notification);

      // Process subsequent batches with a delay
      for (let j = 1; j < userIdsBatches.length; j++) {
        setTimeout(() => {
          processBatch(userIdsBatches[j], notification);
        }, DELAY_TIME * j);
      }
    }

    // Helper function to send a batch of notifications
    async function processBatch(batch, notification) {
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: batch,
            notification_id: notification.notification_id,
            send_later: notification.time > 0 ? true : false,
            time_delay: notification.time,
            scheduled_notification_id: notification.scheduled_notification_id,
            sent_via: "scheduled",
            expiry_date: notification.expiry_date,
          }
        );
      } catch (error) {
        console.log(error);
      }
    }

    // Helper function to split an array into chunks
    function chunkArray(array, size) {
      const result = [];
      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
      }
      return result;
    }
  } catch (error) {
    console.log(error);
  }
};
// fetchScheduledNotifications();

const logNotifications = async (req, res, next) => {
  const { notification_id, sent_to, failed_to, sent_via } = req.body;
  try {
    console.log(req.body, 761);
    const insertedResult = await insertRecord(
      tables.notificationLogs,
      ["notification_id", "sent_to", "failed_to", "sent_via"],
      [notification_id, sent_to, failed_to, sent_via]
    );
    console.log(insertedResult, 764);
    if (insertedResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Notification log added successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Adding Notification Log", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendNotificationsDirect = async (req, res, next) => {
  const {
    title,
    description,
    redirect_page,
    redirect_id,
    wallet_range,
    user_status,
    gender,
    countries,
    cities,
    states,
    programs,
    weight_range,
    age_range,
    ethnicity,
    suggested_programs,
    promotional,
    mode,
    expiry_days,
    user_id,
    url,
    not_include_user,
  } = req.body;
  console.log(req.body, 889);
  try {
    const title_variables = extractVariables(title);
    const description_variables = extractVariables(description);
    const url_variables = extractVariables(url);

    // Construct conditions and joins based on request body data
    let conditions = [];
    let joins = [];

    // Wallet range filter
    if (wallet_range && wallet_range !== "") {
      let range = wallet_range.split("-");
      conditions.push({
        field: "cd.my_wallet",
        operator: "BETWEEN",
        value: [range[0], range[1]],
        raw: true,
      });
    }

    // User status filter
    if (user_status && user_status !== "" && user_status.length > 0) {
      const status = user_status;
      conditions.push({
        orConditions: status.map((s) => ({
          field: "cd.sub_user_status",
          operator: "=",
          value: s,
        })),
      });
    }

    // Gender filter
    if (gender && gender !== "" && gender.length > 0) {
      const genders = gender;
      console.log(genders, 924);
      conditions.push({
        orConditions: genders.map((g) => ({
          field: "cd.gender",
          operator: "=",
          value: g,
        })),
      });
    }

    // Countries filter
    if (countries && countries.length > 0) {
      const countriesParsed = countries;
      conditions.push({
        orConditions: countriesParsed.map((c) => ({
          field: "cd.country_id",
          operator: "=",
          value: c,
        })),
      });
    }

    // Cities filter
    if (cities && cities !== "" && cities.length > 0) {
      const citiesParsed = cities;
      conditions.push({
        orConditions: citiesParsed.map((c) => ({
          field: "cd.city_id",
          operator: "=",
          value: c,
        })),
      });
    }

    // States filter
    if (states && states !== "" && states.length > 0) {
      const statesParsed = states;
      conditions.push({
        orConditions: statesParsed.map((s) => ({
          field: "cd.state_id",
          operator: "=",
          value: s,
        })),
      });
    }

    // Programs filter
    if (programs && programs !== "" && programs.length > 0) {
      const programsParsed = programs;
      conditions.push({
        orConditions: programsParsed.map((p) => ({
          field: "sop.program_id",
          operator: "=",
          value: p,
        })),
      });
      joins.push({
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id and cd.active_order_id is not null",
      });
    }

    // Weight range filter
    if (weight_range && weight_range !== "") {
      let range = weight_range.split("-");
      conditions.push({
        field: "cd.latest_weight",
        operator: "BETWEEN",
        value: [range[0], range[1]],
        raw: true,
      });
    }

    // Age range filter
    if (age_range && age_range !== "") {
      let range = age_range.split("-");
      conditions.push({
        field: "TIMESTAMPDIFF(YEAR,cd.birth_date,NOW())",
        operator: "BETWEEN",
        value: [range[0], range[1]],
        raw: true,
      });
    }

    // Ethnicity filter
    if (ethnicity && ethnicity !== "" && ethnicity.length > 0) {
      const ethnicities = ethnicity;
      conditions.push({
        orConditions: ethnicities.map((e) => ({
          field: "cd.ethnicity",
          operator: "=",
          value: e,
        })),
      });
    }

    // Suggested programs filter
    if (
      suggested_programs &&
      suggested_programs !== "" &&
      suggested_programs.length > 0
    ) {
      const suggestedPrograms = suggested_programs;
      conditions.push({
        orConditions: suggestedPrograms.map((sp) => ({
          field: "cd.suggested_program_id",
          operator: "=",
          value: sp,
        })),
      });
    }

    // Promotional filter
    if (String(promotional) === "yes") {
      conditions.push({
        field: "cd.pro_notification",
        operator: "<>",
        value: 1,
      });
    }

    // Test mode filter
    if (String(mode) === "test") {
      conditions.push({
        field: "cd.mentor_assigned",
        operator: "=",
        value: 196,
      });
    }
    if (String(user_id) !== "null" && String(user_id) !== "") {
      const user_ids = user_id.split(",");
      conditions.push({
        field: "cd.user_id",
        operator: "IN",
        value: user_ids,
      });
    }
    if (
      String(not_include_user) !== "null" &&
      String(not_include_user) !== ""
    ) {
      conditions.push({
        field: "cd.user_id",
        operator: "NOT IN",
        value: `(${not_include_user})`,
        raw: true,
      });
    }
    const { results: users, totalCount } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} cd`,
      conditions,
      joins,
      countTotal: true,
    });
    console.log(users, 1041);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Users with given conditions",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    // return false;
    const user_ids = users.map((u) => u.user_id);
    const fields = [
      ...title_variables,
      ...description_variables,
      ...url_variables,
    ];
    const userData = await fetchUserDetailsDynamic({
      ids: user_ids,
      fields,
    });

    const notificationData = [];
    const tokens = [];
    const userInAppNotifications = new Map();
    for (let i = 0; i < userData.length; i++) {
      let isValid = true;
      const notificationObj = {
        notification: {
          title:
            title_variables.length === 0
              ? title
              : replacePlaceholders(title, userData[i]),
          body:
            description_variables.length === 0
              ? description
              : replacePlaceholders(description, userData[i]),
        },
        data: {
          redirect_page: String(redirect_page) || "",
          redirect_id: String(redirect_id) || "",
          url: replacePlaceholders(url, userData[i]) || "", // Changed from notificationData.url
        },
      };
      if (
        containsNull(notificationObj.notification.title) ||
        containsNull(notificationObj.notification.body) ||
        !userData[i].fcm_token
      ) {
        isValid = false;
      }
      if (isValid) {
        tokens.push({
          fcm: userData[i].fcm_token,
          id: userData[i].fcm_id,
        });
        notificationData.push(notificationObj);
        userInAppNotifications.set(userData[i].user_id, {
          user_id: userData[i].user_id,
          notification_id: 0,
          title: notificationObj.notification.title,
          description: notificationObj.notification.body,
          redirect_page: redirect_page || "",
          redirect_id: redirect_id || "",
          read_status: "0",
          notification_image: null,
          expiry_date: moment()
            .add("days", expiry_days || 1)
            .format("YYYY-MM-DD HH:mm:ss"),
        });
      }
    }
    // console.log(userInAppNotifications, 1126);
    // console.log(notificationData, 1127);
    // return false;
    if (mode !== "test") {
      for (const userId of userInAppNotifications.keys()) {
        try {
          const data = userInAppNotifications.get(userId);
          // const insertResult = await insertRecord(
          //   tables.user_notifications,
          //   Object.keys(data),
          //   Object.values(data)
          // );
          const insertResultMongo = await userNotification.create(data);
          // console.log(insertResult, userId);
          console.log(insertResultMongo, userId);
        } catch (error) {
          console.log(error);
        }
      }
    }

    console.log(notificationData, 1115);
    // return false;
    // Send notifications
    let notificationResponse;
    if (tokens.length > 0) {
      notificationResponse = await axios.post(
        `${process.env.NOTIFICATION_SERVICE_URL}/api/v1/notifications/send-separate-notifications`,
        {
          tokens,
          payloads: notificationData,
        }
      );
      console.log(notificationResponse.data, 1108);
    }

    // Send success response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notifications sent successfully",
      data: notificationResponse.data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in fetchScheduledNotificationsDirect:", error);
    res.status(500).json({
      success: false,
      message: "Error processing notifications",
      error: error.message,
    });
  }
};

const allNotificationLogs = async (req, res, next) => {
  try {
    const { page, limit, start_time, end_time, search, user_id } = req.query;
    const conditions = [];
    console.log(start_time, end_time, 1211);
    if (start_time && end_time) {
      conditions.push({
        field: "nl.added_date",
        operator: "BETWEEN",
        value: [start_time, end_time],
      });
    }
    const joins = [
      {
        type: "LEFT",
        table: `${tables.notifications} n`,
        on: "n.id = nl.notification_id",
      },
    ];
    if (user_id) {
      joins.push({
        type: "LEFT",
        table: `${tables.fcm_registry} fcm`,
        on: `CONCAT(',', nl.sent_to, ',') LIKE CONCAT('%,', fcm.id, ',%')
   OR CONCAT(',', nl.failed_to, ',') LIKE CONCAT('%,', fcm.id, ',%')`,
      });
      conditions.push({ field: "fcm.user_id", operator: "=", value: user_id });
    }
    const { results: notificationLogs, totalCount } = await readRecord({
      selectFields: [
        "nl.id",
        "nl.notification_id",
        "nl.sent_to",
        "nl.failed_to",
        "nl.sent_via",
        "n.title",
        "n.description",
        "n.redirect_page",
        "nl.added_date",
      ],
      table: `${tables.notificationLogs} nl`,
      joins,
      conditions,
      pagination: {
        page: page || 1,
        limit: limit || 10,
      },
      countTotal: true,
      orderBy: ["nl.added_date DESC"],
      ...{
        search: search
          ? {
              searchQuery: search,
              searchFields: ["n.title", "n.description", "n.id"],
            }
          : {},
      },
    });
    const finalData = notificationLogs.map((log) => {
      return {
        id: log.id,
        notification_id: log.notification_id,
        sent_to: log.sent_to,
        failed_to: log.failed_to,
        sent_via: log.sent_via,
        title: log.title,
        description: log.description,
        redirect_page: log.redirect_page,
        added_date: moment(log.added_date).format("YYYY-MM-DD HH:mm:ss"),
      };
    });
    console.log(totalCount, limit, 1249);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notification logs fetched successfully",
      data: finalData,
      meta_data: {
        totalPages: Math.ceil(totalCount / limit || 10),
        currentPage: Number(page) || 1,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 1247);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLoggedNotificationInfo = async (req, res, next) => {
  const { id } = req.params;
  const { search } = req.query;
  try {
    const { results: notificationLogs } = await readRecord({
      selectFields: [
        "nl.id",
        "nl.notification_id",
        "nl.sent_to",
        "nl.failed_to",
        "nl.sent_via",
        "n.title",
        "n.description",
        "n.redirect_page",
        "nl.added_date",
      ],
      table: `${tables.notificationLogs} nl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.notifications} n`,
          on: "n.id = nl.notification_id",
        },
      ],
      conditions: [{ field: "nl.id", operator: "=", value: id }],
    });
    let sentUserDetailsByFcmId = [];
    if (safeJSONParse(notificationLogs[0].sent_to, []).length > 0) {
      sentUserDetailsByFcmId = await readRecord({
        selectFields: [
          "fcm.id",
          "fcm.device",
          "fcm.app_version",
          "fcm.added_date",
          "ud.first_name",
        ],
        table: `${tables.fcm_registry} fcm`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = fcm.user_id",
          },
        ],
        conditions: [
          {
            field: "fcm.id",
            operator: "IN",
            value: safeJSONParse(notificationLogs[0].sent_to),
          },
        ],
        ...{
          search: search
            ? {
                searchQuery: search,
                searchFields: [
                  "ud.user_id",
                  "ud.first_name",
                  "CONCAT(ud.first_name, ' ', ud.last_name)",
                  "ud.email_id",
                  "ud.phone",
                  "ud.phone_number",
                  "CONCAT(ud.phone_code,ud.phone_number)",
                ],
              }
            : {},
        },
      });
    }
    let failedUserDetailsByFcmId = [];
    if (safeJSONParse(notificationLogs[0].failed_to, []).length > 0) {
      failedUserDetailsByFcmId = await readRecord({
        selectFields: [
          "fcm.id",
          "fcm.device",
          "fcm.app_version",
          "fcm.added_date",
          "ud.first_name",
        ],
        table: `${tables.fcm_registry} fcm`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = fcm.user_id",
          },
        ],
        conditions: [
          {
            field: "fcm.id",
            operator: "IN",
            value: safeJSONParse(notificationLogs[0].failed_to),
          },
        ],
        ...{
          search: search
            ? {
                searchQuery: search,
                searchFields: [
                  "ud.user_id",
                  "ud.first_name",
                  "CONCAT(ud.first_name, ' ', ud.last_name)",
                  "ud.email_id",
                  "ud.phone",
                  "ud.phone_number",
                  "CONCAT(ud.phone_code,ud.phone_number)",
                ],
              }
            : {},
        },
      });
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notification logs fetched successfully",
      data: {
        notification_data: notificationLogs,
        sent_to: sentUserDetailsByFcmId,
        failed_to: failedUserDetailsByFcmId,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 1247);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addNotification,
  deleteNotification,
  sendNotification,
  getAllNotificationTitles,
  getAllNotifications,
  getNotificationById,
  updateNotification,
  sendNotificationNew,
  fetchScheduledNotifications,
  logNotifications,
  sendNotificationsDirect,
  allNotificationLogs,
  getLoggedNotificationInfo,
};
