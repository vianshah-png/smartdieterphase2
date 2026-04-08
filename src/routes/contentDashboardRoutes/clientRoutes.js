import Router from "express";
import multer from "multer";
import {
  clientProfile,
  getAllApplinks,
  getClientStatus,
  getCurrentSessionTrackersByUserId,
  getInchDetails,
  getMilestoneDetails,
  getPhotoDetails,
  getSingleClientByUserId,
  getUserData,
  getWeightDetails,
  goalsByUserId,
  lastDevice,
  notifications,
  offOnholdClient,
  overallPending,
  receivedNotification,
  searchClients,
  sendNotification,
  toggleAskDiet,
  toggleClientOnhold,
  paidOnHoldRequest,
  paidOnHoldConfirmation,
  toggleDailyFu,
  toggleProNotification,
  toggleWati,
  updateClientExpiryDate,
  updateClientScreen,
  updateClientStatus,
  updateClientWeight,
  getClientHealthScoreData,
  askDiet,
  askDietCount,
  getDraftedQuerybyUserId,
  onholdHistoryByUserId,
  extendOnholdDate,
  editClientFoodAversions,
  getFreeFillerDataOnUserId,
  insertComProcessLog,
  listComProcessLogs,
  updateComProcessApprovalStatus,
  sendCloseDbMail,
  getPaidOnHoldRequest,
  toggleVip,
  postPregnancyData,
  getPostPregnancyFormDataById,
} from "../../controllers/contentDashboardControllers/clientController.js";

const router = Router();


const storage = multer.memoryStorage();
const uploadReport = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB file limit
  },
});

const uploadReportFiles = uploadReport.single('file')


router.get("/search", searchClients);
router.get("/get-single-client-by-user_id", getSingleClientByUserId);
router.get("/client-profile", clientProfile);
router.patch("/update-client-screen", updateClientScreen);
router.patch("/update-client-status", updateClientStatus);
router.patch("/update-client-expiry", updateClientExpiryDate);
router.get("/last-device", lastDevice);
router.get("/goal", goalsByUserId);
router.get("/overall-pending", overallPending);
router.get("/received-notification", receivedNotification);
router.post("/send-notification", sendNotification);
router.post("/insert-com-process-log", insertComProcessLog);
router.post("/send-close-db-mail", sendCloseDbMail);
router.get("/com-process-log", listComProcessLogs);
router.patch('/com-process-log-update', updateComProcessApprovalStatus);
router.get("/app-notification-content", notifications);
router.patch("/toggle-wati", toggleWati);
router.patch("/toggle-pro-notification", toggleProNotification);
router.patch("/toggle-ask-diet", toggleAskDiet);
router.patch("/toggle-daily-fu", toggleDailyFu);
router.patch("/toggle-vip", toggleVip);
router.post("/client-onhold-on", toggleClientOnhold);
router.post("/create-onhold-payment-link", paidOnHoldRequest);
router.post('/post-pregnancy-data', uploadReportFiles , postPregnancyData);
router.get('/get-post-pregnancy-data', getPostPregnancyFormDataById);
// router.get('/paid-onhold-confirmation-cb', paidOnHoldConfirmation);
router.post('/paid-onhold-confirmation', paidOnHoldConfirmation);
router.get('/paid-onhold-request-list', getPaidOnHoldRequest);
router.get("/all-app-links", getAllApplinks);
router.post("/client-onhold-off", offOnholdClient);
router.post("/update-weight", updateClientWeight);
router.get("/get-current-session-trackers", getCurrentSessionTrackersByUserId);
router.get("/get-weight-details", getWeightDetails);
router.get("/get-inch-details", getInchDetails);
router.get("/get-photo-details", getPhotoDetails);
router.get("/get-milestone-details", getMilestoneDetails);
router.get("/check-client-status", getClientStatus);
router.get("/get-user-data", getUserData);
router.get("/get-client-health-score-data", getClientHealthScoreData);
router.post("/ask-diet", askDiet);
router.get("/ask-diet-count", askDietCount);
router.get("/get-drafted-query-by-user-id", getDraftedQuerybyUserId);
router.get('/onhold-history', onholdHistoryByUserId);
router.patch('/edit-client-food-aversions', editClientFoodAversions);
router.patch('/extend-onhold-date',extendOnholdDate);
router.get('/get-free-filler-details', getFreeFillerDataOnUserId)

export default router;
