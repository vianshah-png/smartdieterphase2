import { Router } from "express";
import {
  getReminders,
  addReminder,
  editReminder,
} from "../../controllers/csDashboardControllers/reminderController.js";

const router = Router();

router.get("/get-reminders", getReminders);
router.post("/add-reminder", addReminder);
router.patch("/edit-reminder", editReminder);

export default router;
