import { Router } from "express";
import {
  addFollowUp,
  addLead,
  addSocialMediaLeads,
  assignLead,
  checkMentorSlot,
  checkUserExist,
  getAllLeads,
  getLeadInsightsByLeadId,
  getSingleLeadDataById,
  getUserHealthScore,
  getUserMedicalReports,
  leadConsultationForm,
  leadHistory,
  markFollowUpDone,
  phaseLog,
  salesStatusLogs,
  sourceLog,
  stageLogs,
  statusLog,
  suggestProgramToUser,
  updateLeadDetails,
  updateSuggestedProgram,
  updateUserPhase,
  updateUserSalesStatus,
  updateUserSource,
  updateUserStage,
  updateUserStatus,
  userGoals,
  getLeadCalls,
  updateleadDetailSpecify,
  getLeadPopupNotifications,
  getPopupLeadsByStatus,
  leadConcernAndGoals,
  trackerAndMarker,
  pitchedHistory,
  userAppActivity,
  addEngagement,
  markEngagementDone,
  leadMilestones,
  getLeadFeedbacksNew,
  getLeadFollowUpAndEngagement,
  addFollowUpWatiWebhook,
  sendLeadTargetMessages,
  addFollowupForEmailClicks,
} from "../../controllers/salesDashboardControllers/leadsController.js";

const router = Router();

router.get("/all-leads", getAllLeads);
router.patch("/update-lead-details/:id", updateLeadDetails);
router.post("/add-follow-up", addFollowUp);
router.post("/add-follow-up-wati", addFollowUpWatiWebhook);
router.post("/add-follow-up-email-click", addFollowupForEmailClicks);
router.post("/send-lead-target-messages", sendLeadTargetMessages)
router.post("/add-engagement", addEngagement);
router.patch("/mark-follow-up-done/:id", markFollowUpDone);
router.patch("/mark-engagement-done/:id", markEngagementDone);
router.get("/lead-follow-up-and-engagement", getLeadFollowUpAndEngagement);
router.post("/add-lead/:counsellor_id", addLead);
router.get("/status-logs", statusLog);
router.get("/source-logs", sourceLog);
router.get("/phase-logs", phaseLog);
router.get("/stage-logs", stageLogs);
router.get("/sales-status-logs", salesStatusLogs);
router.post("/update-status/:id", updateUserStatus);
router.post("/update-source/:id", updateUserSource);
router.post("/update-phase/:id", updateUserPhase);
router.post("/update-stage/:id", updateUserStage);
router.post("/update-sales-status/:id", updateUserSalesStatus);
router.post("/assign_lead/:user_id", assignLead);
router.post("/check-slot", checkMentorSlot);
router.post("/check-user", checkUserExist);
// router.get("/user-history/:user_id", leadHistory);
router.post("/suggest-program", suggestProgramToUser);
router.patch("/update-suggested-program/:id", updateSuggestedProgram);
router.patch("/lead-consultation-form", leadConsultationForm);
router.get("/lead-history/:user_id", leadHistory);
router.get("/lead-prompts", getLeadPopupNotifications);
router.get("/lead-statuswise-overdue", getPopupLeadsByStatus);
router.patch("/updateleadDetailSpecify", updateleadDetailSpecify);
router.post("/lead-goals/:user_id", userGoals);
router.get("/user_health-score/:user_id", getUserHealthScore);
router.get("/medical-reports/:user_id", getUserMedicalReports);
router.get("/single-lead-data", getSingleLeadDataById);
router.get("/get-lead-insights", getLeadInsightsByLeadId);
router.post("/add-social-media-leads", addSocialMediaLeads);
router.get("/get-lead-calls", getLeadCalls);
router.get("/concern-and-goals/:user_id", leadConcernAndGoals);
router.get("/tracker-and-marker/:user_id", trackerAndMarker);
router.get("/pitched-history/:user_id", pitchedHistory);
router.get("/app-activity/:user_id", userAppActivity);
router.get("/lead-milestones/:user_id", leadMilestones);
router.get("/lead-feedbacks/:user_id", getLeadFeedbacksNew);
export default router;
