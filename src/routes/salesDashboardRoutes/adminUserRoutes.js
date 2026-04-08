import Router from "express";
import { multerUpload } from "../../config/multerConfig.js";
import {
  activitesDone,
  addNewAdminUser,
  assignMentor,
  bookCall,
  bulkAssignLead,
  bulkAssignOC,
  changeAdminStatus,
  getAdminCalls,
  getAllAdmins,
  getAllRoles,
  getBirthdayClients,
  getCallByCallId,
  getCallsCount,
  getCounsellors,
  getCounsellorsForConsultation,
  getDayReviewData,
  getFollowUps,
  getMentor,
  getMentors,
  myFollowUpsToday,
  overdueAndMisses,
  searchAdmin,
  sendDayPlanner,
  sendDayPlannerCS,
  sendDayReviewCS,
  sendReview,
  submitDayReview,
  suggestProgramToUser,
  totalsSalesOpportunity,
  updateCallDetails,
  getAdminDayReviewStatus,
  getDayEndReviewData,
  sendDayEnd,
  getMonthlyGoal,
  sendGoalMail,
  insertMonthlyGoal,
  editAdminUser,
  getClientServiceDashboard,
  getAdminSalesCalculation,
  getDayReviewNotesCS,
  getDayReviewDataCs,
  getOCAppCountData,
  getLeadAppCountData,
  getClientLeadAppCountData,
  updateOCLeadAppCount,
  getFollowUpsCountFilterWise
} from "../../controllers/salesDashboardControllers/adminUser.js";
const router = Router();

router.post(
  "/add-new-admin-user",
  multerUpload.single("photo"),
  addNewAdminUser
);
router.put(
  "/edit-admin-user",
  multerUpload.single("photo"), // For updating photo if needed
  editAdminUser
);

router.get("/get-all-admins", getAllAdmins);
router.get("/get-all-roles", getAllRoles);
router.get("/get-all-counsellors", getCounsellors);
router.get("/search-admin/:name", searchAdmin);
router.get("/get-counsellors-consultation", getCounsellorsForConsultation);
router.get("/get-all-mentors", getMentors);
router.get("/get-calls-count", getCallsCount);
router.post("/get-calls-by-callId", getCallByCallId);
router.post("/book-call", bookCall);
router.get("/get-birthday-clients", getBirthdayClients);
router.post("/update-call/:callId", updateCallDetails);
router.get("/my-follow-up-todays/:id", myFollowUpsToday);
router.get("/overdues-and-misses/:id", overdueAndMisses);
router.get("/total-sales-opportunity", totalsSalesOpportunity);
router.get("/total-activities-done", activitesDone);
router.post("/assign-mentor", assignMentor);
router.post("/suggest-program", suggestProgramToUser);
router.get("/get-mentor-id", getMentor);
router.patch("/change-admin-status", changeAdminStatus);
router.post("/bulk-assign-oc", bulkAssignOC);
router.post("/bulk-assign-lead", bulkAssignLead);
router.get("/get-follow-ups", getFollowUps);
router.get("/get-follow-ups-count-filter-wise", getFollowUpsCountFilterWise);

router.get("/get-admin-calls", getAdminCalls);
router.get("/get-admin-day-review", getDayReviewData);
router.post("/submit-admin-day-review", submitDayReview);
router.get("/get-admin-day-review-status", getAdminDayReviewStatus);
router.post("/send-day-planner", sendDayPlanner);
router.post("/send-day-planner-cs", sendDayPlannerCS);
router.post("/get-day-review-notes-cs", getDayReviewNotesCS);
router.post('/get-day-review-data-cs',getDayReviewDataCs);
router.post("/send-day-review-cs", sendDayReviewCS);
router.get("/get-day-end-review", getDayEndReviewData);
router.post("/send-review", sendReview);
router.post("/send-day-end-review", sendDayEnd);
router.get("/get-monthly-goal", getMonthlyGoal);
router.get("/get-client-service-dashboard", getClientServiceDashboard);
router.post("/insert-monthly-goal", insertMonthlyGoal);
router.post("/send-goal-mail", sendGoalMail);
router.get("/admin-sales-calculation", getAdminSalesCalculation);
router.post('/get-oc-app-data', getOCAppCountData);
router.post('/get-lead-app-data', getLeadAppCountData);
router.get('/get-oc-lead-app-count', getClientLeadAppCountData);
router.patch('/update-oc-lead-count', updateOCLeadAppCount);


export default router;
