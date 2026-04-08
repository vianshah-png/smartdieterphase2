import { Router } from "express";
import {
  getAllSources,
  getHealthIssues,
  getSources,
  updateClientStartDate,
  getProgramPageVisitDetails,
  getCheckoutPageVisitDetails,
  acknowledgePageVisit, 
  getDailyFuDetails,
  getAllOC,
  addProgramVisit,
  addCheckoutVisit,
  getReportsByUser,
  uploadReport,
  getAdminNotifications,
  getAdminNotificationsCount,
  updateAcknowledgeStatus,
  addSource,
  sendMail,
  getTodayVisitCounts,
  getUser,
  subscribeToWati,
  unsubscribeToWati,
  watiActivity,
  getVipDetails,
  deleteDuplicateLead,
  submitMilestoneDataForm,
  checkMilestoneDataSubmitted,
} from "../../controllers/common.js";
import { multerUpload } from "../../config/multerConfig.js";
import {
  getSegments,
  spinToWin,
  spinToWinApp,
  submitPrizeApi,
} from "../../controllers/spinToWin.js";
import {
  dietFeedback,
  getDietname,
  getFeedbackAck,
  getResult,
  getSessionFeedbackByUserId,
  insertInTable,
  getLatestUserCampaignData,
  insertNewCampaignLead,
} from "../../controllers/freeConsultation.js";

const router = Router();

router.patch("/update-start-date", updateClientStartDate);
router.get("/get-sources", getAllSources);
router.get("/get-all-sources", getSources);
router.post("/add-source", addSource);
router.get("/get-health-issues", getHealthIssues);
router.get("/spin-to-win-main", getSegments);
router.post("/get-users-id", getUser);
router.get("/spin-to-win", spinToWin);
router.post("/spin-to-win-app", spinToWinApp);
router.post("/spin-to-win-store", submitPrizeApi);
router.post("/free-consultation", insertInTable);
router.post("/insert-slimsmart-campaign", insertNewCampaignLead);
router.post("/get-latest-campaign-data", getLatestUserCampaignData);
router.post("/feedback-form", dietFeedback);
router.get("/diet-name", getDietname);
router.get("/diet-feedback", getSessionFeedbackByUserId);
router.get("/diet-data", getResult);
router.post("/diet-ack", getFeedbackAck);
router.post("/add-program-page-visit", addProgramVisit);
router.get("/get-program-page-visit", getProgramPageVisitDetails);
router.post("/add-checkout-page-visit", addCheckoutVisit);
router.post("/get-users-id", getUser);
router.get("/get-checkout-page-visit", getCheckoutPageVisitDetails);
router.patch('/acknowldge-page-visit', acknowledgePageVisit); 

router.get("/get-today-program-visit", getTodayVisitCounts);

router.get("/get-daily-fu", getDailyFuDetails);
router.get("/get-vip", getVipDetails);
router.get("/get-all-oc", getAllOC);

router.get("/get-reports-by-user_id", getReportsByUser);
router.post("/upload-report", multerUpload.array("reports", 5), uploadReport);

router.get("/get-admin-notifications", getAdminNotifications);
router.get("/get-admin-notifications-count", getAdminNotificationsCount);
router.patch("/acknowledge-notification", updateAcknowledgeStatus);

router.post("/send-mail", sendMail);
router.get("/subscribe-to-wati", subscribeToWati);
router.get("/unsubscribe-to-wati", unsubscribeToWati);
router.get("/wati-activity", watiActivity);
router.delete("/delete-duplicate-lead/:user_id/:password", deleteDuplicateLead);
router.post(
  "/submit-milestone-data",
  multerUpload.fields([
    { name: "photo_before", maxCount: 5 },
    { name: "photo_after", maxCount: 5 },
    { name: "progress_video", maxCount: 5 },
  ]),
  submitMilestoneDataForm
);
router.get(
  "/check-milestone-data/:user_id/:milestone_kg",
  checkMilestoneDataSubmitted
);
export default router;
