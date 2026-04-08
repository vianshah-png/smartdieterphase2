import { Router } from "express";
import {
  getMessageTemplates,
  sendTemplateMessage,
  sendTemplateMessages,
} from "../../controllers/contentDashboardControllers/watiController.js";

const router = Router();

router.get("/message-templates", getMessageTemplates);
router.post("/send-message-template", sendTemplateMessage);
router.post("/send-messages-template", sendTemplateMessages);

export default router;
