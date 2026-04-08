import { Queue, Worker } from "bullmq";
import cron from "node-cron";
import { defaultQueueConfig, redisConnection } from "../config/bullmqConfig.js";
import { FCM } from "../config/firebaseConfig.js";
import {
  fetchScheduledNotifications,
  getUsersForNotification,
} from "../helper/common.js";
const fcm = new FCM();

// Create BullMQ notification queue
export const NotificationQueueName = "NotificationQueue";

export const NotificationQueue = new Queue(NotificationQueueName, {
  connection: redisConnection,
  defaultJobOptions: defaultQueueConfig,
});

// Function to add notifications to BullMQ queue with a delay
const addNotificationsToQueue = async (notification, users) => {
  if (users.length > 0) {
    for (let user of users) {
      const payload = {
        notification: {
          title: notification.title,
          body: notification.description,
          image: notification.notification_banner
            ? JSON.parse(notification.notification_banner)[0].file.path
            : null,
        },
        userId: user.user_id,
        fcmToken: user.fcm_token,
      };

      const scheduleDateTime = new Date(notification.notification_time);
      const now = new Date();
      const delay = scheduleDateTime.getTime() - now.getTime();

      if (delay > 0) {
        // Add the notification to the queue with delay
        await NotificationQueue.add("send-notification", payload, {
          attempts: 3, // Retry 3 times on failure
          delay: delay,
          removeOnComplete: true, // Remove job after it's done
          removeOnFail: true, // Remove job if it fails all attempts
          jobId: `${notification.id}-${user.user_id}`, // Unique job ID for deduplication
        });
        console.log(
          `Scheduled notification for user ${user.user_id} at ${scheduleDateTime}`
        );
      } else {
        console.log(
          `Notification for user ${user.user_id} is in the past and won't be scheduled.`
        );
      }
    }
    console.log(
      `Added ${users.length} notifications for notification ID ${notification.id}`
    );
  } else {
    console.log(
      `No users matching filters for notification ID ${notification.id}`
    );
  }
};

// Worker to send notifications
const worker = new Worker(
  NotificationQueueName,
  async (job) => {
    const { userId, fcmToken, notification } = job.data;

    const payload = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.image,
      },
    };

    try {
      console.log(`Sending notification to user ${userId}`);
      await fcm.sendToDevice(fcmToken, payload); // Send notification using FCM
      console.log(`Notification sent to user ${userId}`);
    } catch (error) {
      console.error(`Failed to send notification to user ${userId}:`, error);
    }
  },
  {
    connection: redisConnection,
  }
);

// Cron job running every 15 minutes to schedule notifications
cron.schedule("*/15 * * * *", async () => {
  console.log("Running scheduled notification job...");

  const { results: notifications } = await fetchScheduledNotifications();

  if (notifications.length > 0) {
    for (let notification of notifications) {
      const users = await getUsersForNotification(notification);
      await addNotificationsToQueue(notification, users);
    }
  } else {
    console.log("No scheduled notifications to process.");
  }
});


export default cron;
