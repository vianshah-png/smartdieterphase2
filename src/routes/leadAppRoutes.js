import { Router } from "express";
import { multerUpload } from "../config/multerConfig.js";
import {
    getGoProDetails,
    getPeerGroupDetails,
    getLeadHomeScreen,
    getLeadMilestones,
    getLeadAdditionalQuestions,
    getLeadTrialDiet,
    submitAdditionalQuestions,
    submitFeedback,
    getLeadFeedbackQuestions,
    submitStepAndSleepTracker,
    submitWaterIntake,
    getHealthScoreReport,
    getPeerGroupComparisonData,
    addLeadPhoto,
    getLeadPhoto,
    submitMilestones,
    getUserDetailsBySubOrderId,
    getLeadOCHomeScreen,
    getOCPreviousPrograms,
    getProgramJourney,
    getProgramSummary,
    getEkitProDetails
} from "../controllers/leadAppControllers.js";
const router = Router();

router.post("/get-go-pro-details", getGoProDetails);
router.post("/get-ekit-pro-details", getEkitProDetails);
router.post("/get-peer-group-details", getPeerGroupDetails);
router.post("/get-lead-home-screen", getLeadHomeScreen);
router.post("/get-lead-milestones", getLeadMilestones);
router.post("/get-lead-additional-questions", getLeadAdditionalQuestions);
router.post("/get-lead-trial-diet", getLeadTrialDiet);
router.post("/get-lead-feedback-questions", getLeadFeedbackQuestions);
router.post("/submit-additional-questions", submitAdditionalQuestions);
router.post("/submit-lead-app-feedback", submitFeedback);
router.post("/submit-steps-and-sleep", submitStepAndSleepTracker);
router.post("/submit-water-intake", submitWaterIntake);
router.post("/get-health-score-report", getHealthScoreReport);
router.post("/get-peer-group-comparison", getPeerGroupComparisonData);
router.post("/upload-lead-photo",multerUpload.array("image", 1), addLeadPhoto);
router.post("/get-lead-photo", getLeadPhoto);
router.post("/submit-lead-milestones", submitMilestones);
router.post("/get-user-details-by-sub-order-id", getUserDetailsBySubOrderId);
router.post("/get-lead-oc-home-screen", getLeadOCHomeScreen);
router.post("/get-oc-previous-programs", getOCPreviousPrograms);
router.post("/get-program-journey", getProgramJourney);
router.post("/get-program-summary", getProgramSummary);





export default router;
