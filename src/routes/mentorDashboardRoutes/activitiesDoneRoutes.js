import { Router } from "express";
import {
  getActionsCount,
  getCaptured,
  getCapturedUserData,
  getFollowupUserData,
  getHsStage,
  statusBasedCount,
  getConsultationUserData,
  getActionAssignedUserData,
  getStageWiseUserData,
  getStatusData,
} from "../../controllers/mentorDashboardControllers/activitiesDoneController.js";

const router = Router();

router.get("/captured", getCaptured);
router.post("/captured-user-data", getCapturedUserData);

router.get("/actions-count", getActionsCount);
router.post("/follow-up-done-user-data", getFollowupUserData);
router.post("/consultation-done-user-data", getConsultationUserData);
router.post("/action-assigned-user-data", getActionAssignedUserData);

router.get("/status-counts", statusBasedCount);
router.get("/stage-wise-counts", getHsStage);
router.post("/stage-wise-user-data", getStageWiseUserData);
router.post("/status-data", getStatusData);
export default router;
