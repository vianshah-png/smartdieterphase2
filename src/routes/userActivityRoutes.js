import { Router } from "express";
import {
  addUserActivity,
  getUserActivityLog,
} from "../controllers/userActivityController.js";

const router = Router();
router.get("/get-user-activity", getUserActivityLog);
router.post("/add-activity", addUserActivity);
export default router;
