import { Router } from "express";
import {
  fetchHalfTimeFeedbackAndUploadtoNewFeedbackTable,
  fetchProgramFeedbackAndUploadtoNewFeedbackTable,
  getFeedbackbyMentorId,
  getFeedbackCounts,
  getFeedbackDetails,
  getLeadFeedback,
  submitLeadFeedback,
  submitFinalFeedback,
  submitHalfTimeFeedback,
  submitNewHalfTimeFeedback,
  submitNewFinalFeedback
} from "../controllers/feedbackController.js";

const router = Router();

router.get("/get-feedback", getFeedbackbyMentorId);
router.get(
  "/migrating-feedback",
  fetchHalfTimeFeedbackAndUploadtoNewFeedbackTable
);
router.get(
  "/program-migrating-feedback",
  fetchProgramFeedbackAndUploadtoNewFeedbackTable
);

router.get("/feedback-counts", getFeedbackCounts);
router.post("/feedback-details", getFeedbackDetails);
router.post("/submit-final-feedback", submitFinalFeedback);
router.post("/submit-new-final-feedback", submitNewFinalFeedback);
router.post("/submit-halftime-feedback", submitHalfTimeFeedback);
router.post("/submit-new-halftime-feedback", submitNewHalfTimeFeedback);
router.post("/submit-lead-feedback", submitLeadFeedback);
router.get("/get-lead-feedback", getLeadFeedback);

export default router;
