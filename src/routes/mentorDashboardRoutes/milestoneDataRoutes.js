import { Router } from "express";
import {
  acknowledgePendingMilestone,
  approvePendingMilestone,
  getMilestoneFilledUsers,
  getPendingSuccessStoryMilestones,
  markMilestoneAddedToSuccessStory,
} from "../../controllers/mentorDashboardControllers/milestoneDataController.js";

const router = Router();

router.post("/milestone-filled-users", getMilestoneFilledUsers);
router.post("/pending-success-stories", getPendingSuccessStoryMilestones);
router.post("/approve-pending-milestone", approvePendingMilestone);
router.post("/acknowledge-pending-milestone", acknowledgePendingMilestone);
router.post(
  "/mark-added-to-success-story/:milestone_id",
  markMilestoneAddedToSuccessStory
);
export default router;
