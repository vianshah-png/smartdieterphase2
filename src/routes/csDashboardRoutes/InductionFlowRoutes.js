import { Router } from "express";
import {
  NAFICLReceivedDietNotSentUserData,
  appNotInstalledClientsData,
  getAssessmentAndICLNotFilledCount,
  getClientProgramStatusCount,
  getClientProgramUserData,
  getClientSubStatusCount,
  getClientSubStatusUserData,
  getClientsAssessmentNotFilledUserData,
  getClientsICLNotFilledUserData,
  getClientsInductionCallNotDone,
  getClientsInductionCardsCount,
  getClientsStartDateNotSentUserData,
  getClientsWelcomeCallNotDone,
  getSessionWeightAndInchNotUpdatedCount,
  getWMRNotUpdatedUserData,
  getMentorNotAssignedData,
  getClientsIntroductionCallNotDone,
  addCsNotes,
} from "../../controllers/csDashboardControllers/InductionFlowController.js";
import { redisKeys } from "../../helper/constant.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";

const router = Router();

router.get(
  "/client-sub-status-count",
  redisMiddleware(redisKeys.subStatusUserCount),
  getClientSubStatusCount
);

router.post("/client-sub-status-user-data", getClientSubStatusUserData);

router.get(
  "/client-programs-status-count",
  redisMiddleware(redisKeys.programCategoryCount),
  getClientProgramStatusCount
);
router.post("/client-programs-status-user-data", getClientProgramUserData);
router.get(
  "/client-induction-cards-count",
  redisMiddleware(redisKeys.inductionCardsCount),
  getClientsInductionCardsCount
);
router.post("/get-mentor-not-assign-data",getMentorNotAssignedData);
router.post("/app-not-downloaded-user-data", appNotInstalledClientsData);



router.get(
  "/client-NAL-ICL-not-filled-count",
  redisMiddleware(redisKeys.ClientNCLICLNotFilledCount),
  getAssessmentAndICLNotFilledCount
);
router.post("/naf-icl-received-user-data", NAFICLReceivedDietNotSentUserData);
router.post(
  "/induction-call-not-done-user-data",
  getClientsInductionCallNotDone
);
router.post(
  "/introduction-call-not-done-user-data",
  getClientsIntroductionCallNotDone
);

router.post(
  "/assessment-not-filled-user-data",
  getClientsAssessmentNotFilledUserData
);

router.post("/icl-not-filled-user-data", getClientsICLNotFilledUserData);
router.post("/welcome-call-not-done-user-data", getClientsWelcomeCallNotDone);
router.post(
  "/start-date-not-set-user-data",
  getClientsStartDateNotSentUserData
);

router.get("/wmr-not-updated-count", getSessionWeightAndInchNotUpdatedCount);
router.post("/wmr-not-updated-user-data", getWMRNotUpdatedUserData);

router.post('/add-cs-notes', addCsNotes)

export default router;
