import { Router } from "express";
import { getMessageFromKhyati, getChangeOfMentorScreen } from "../controllers/inductionScreensController.js";

const router = Router();

router.get("/get-message-from-khyati", getMessageFromKhyati);
router.post("/get-change-of-mentor-details", getChangeOfMentorScreen);
export default router;