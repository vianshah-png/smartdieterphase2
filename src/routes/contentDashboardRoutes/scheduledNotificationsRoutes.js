import { Router } from "express";
import {
  deleteScheduledNotification,
  getAllScheduledNotifications,
  scheduleNotification,
  updateScheduledNotification,
  updateSNStatusAndAddLog,
} from "../../controllers/contentDashboardControllers/scheduledNotificationsController.js";

const router = Router();

router.post("/all", getAllScheduledNotifications);
router.post("/add", scheduleNotification);
router.patch("/update/:id", updateScheduledNotification);
router.delete("/delete/:id", deleteScheduledNotification);
router.patch("/update-status", updateSNStatusAndAddLog);
export default router;
