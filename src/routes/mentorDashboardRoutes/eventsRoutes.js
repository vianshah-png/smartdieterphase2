import { Router } from "express";
import {
  addMentorEvent,
  deleteEvent,
  getMentorEvents,
  updateEventStatus
} from "../../controllers/mentorDashboardControllers/eventsController.js";

const router = Router();
router.post("/add-mentor-event", addMentorEvent);
router.get("/get-mentor-events", getMentorEvents);
router.patch("/update-event-status", updateEventStatus);
router.delete("/delete-event", deleteEvent);



export default router;
