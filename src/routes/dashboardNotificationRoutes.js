import Router from "express";
import {
  sseHandler,
  triggerEvent
} from "../controllers/dashboardNotificationController.js";

const router = Router();
router.get("/start-event", sseHandler);
router.get("/send-event", triggerEvent);

export default router;
