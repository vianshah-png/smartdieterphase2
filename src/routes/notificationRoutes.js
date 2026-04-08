import { Router } from "express";
import {
  notificationList,
  sendAskAllNotification,
  notificationCount,
  acknowledgeNotification,
} from "../controllers/notificationControllers.js";
const router = Router();

router.post("/get-notification-list", notificationList);

router.post('/send-ask-all-notification', sendAskAllNotification)
router.post('/acknowledge-notification',acknowledgeNotification)

router.post('/send-count-notification',notificationCount)


export default router;



