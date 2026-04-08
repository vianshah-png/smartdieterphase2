import { Router } from "express";
import {
  addNotification,
  deleteNotification,
  getAllNotifications,
  getAllNotificationTitles,
  getNotificationById,
  logNotifications,
  allNotificationLogs,
  sendNotification,
  sendNotificationNew,
  sendNotificationsDirect,
  updateNotification,
  getLoggedNotificationInfo,
} from "../../controllers/contentDashboardControllers/notificationController.js";
import { redisKeys } from "../../helper/constant.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { multerUpload } from "../../config/multerConfig.js";

const router = Router();

router.post(
  "/all",
  redisMiddleware(redisKeys.notifications),
  getAllNotifications
);
router.get("/all-titles", getAllNotificationTitles);
router.get("/notification-log", allNotificationLogs);
router.get("/:id", getNotificationById);
router.post("/add", multerUpload.array("image", 1), addNotification);
router.patch("/update/:id", multerUpload.array("image", 1), updateNotification);
router.delete("/remove/:id", deleteNotification);
router.post("/send-notification", sendNotification);
router.post("/send-notification-separately", sendNotificationNew);
router.post("/log-notifications", logNotifications);
router.post("/send-notifications-to-users", sendNotificationsDirect);

router.get("/notification-log/:id", getLoggedNotificationInfo);
export default router;
