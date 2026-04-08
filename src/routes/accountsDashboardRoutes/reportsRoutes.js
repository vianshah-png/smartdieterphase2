import { Router } from "express";
import {
  getAllActiveClientsByProgramCategoryReport,
  getAppCheckoutPageVisitReport,
  getAppProgramPageVisitReport,
  getAppNotUpdatedClientsByUserStatusReport,
  getBasicStackNotUpgradedToFullStackReport,
  getCleansePaidReportByMentorId,
  getHfFeedbackReport,
  getMentorUserCountByProgramStatusReport,
  getMentorUserStatusCountReport,
  getNoAdvancePurchaseReport,
  getProjectedExpiryReport,
  mentorWiseRateSharedUnpaidReport,
  getWalletReportByAdminId,
  getWalletSummaryReport,
  walletUsedSummaryReportByMentorId,
  tailendNoAdvUnPitched,
  getProgramFeedbackReport,
  getUnconvertedReferral,
  getUnpaidPaymentDetailsShared,
  getExpiringClientsWith70Kg,
  getExpiredLink,
  goodWeightLoss,
  tailendNoAdvUnPitchedSumamry,
  totalPitchedNotPaid,
  getProgramFeedbackSummaryReport,
  InductionCallSummaryReport,
  InductionCallDataReport,
  allNutritionistAssignedUnpaidLeads,
  mentorWiseAllActiveNoAdvUnPitched,
  getHfFeedDatabackReport,
  HsReport,
  morningLeadConsultationReport,
  mentorWiseAllData,
  getBasicStackNotUpgradedToFullStackSummaryReport,
  comCallNotDoneSummary,
  comCallNotDoneData,
  rateSharedAbdulReport,
  khyatiSmLeadDayEnd,
  shareReportSheet,
  getAppStatusummary,
  forcepointSummaryReport,
  forcepointLeadWiseReport,
  getAppStatusForMail,
  getMentorStatisticsUnion,
  getMentorSuggestedStats,
  chatFromLeadsReport,
} from "../../controllers/accountsDashboardControllers/reportController.js";

const router = Router();

router.get(
  "/all-nutritionist-assigned-unpaid-leads",
  allNutritionistAssignedUnpaidLeads,
);

router.post("/tailend-no-adv-unpitched", tailendNoAdvUnPitched);
router.post("/tailend-no-adv-summary", tailendNoAdvUnPitchedSumamry);
router.get("/get-wallet-report-by-admin", getWalletReportByAdminId);
router.post("/unpaid-payment-details-shared", getUnpaidPaymentDetailsShared);
router.post("/wallet-summary-report", getWalletSummaryReport);
router.post(
  "/get-mentor-user-status-count-by-userstatus",
  getMentorUserStatusCountReport,
); // all active ,all ocr
router.post(
  "/get-mentor-user-count-by-programstatus",
  getMentorUserCountByProgramStatusReport,
); // all active count,program_category bifurcation
router.post(
  "/get-app-not-updated-clients-by-userstatus",
  getAppNotUpdatedClientsByUserStatusReport,
); // all active,ocr,lead,Bifurcate device

router.post(
  "/get-wallet-used-summary-report",
  walletUsedSummaryReportByMentorId,
);
router.post("/get-cleanse-paid-by-mentor-id", getCleansePaidReportByMentorId);
router.post(
  "/get-all-active-client-report-by-program-category",
  getAllActiveClientsByProgramCategoryReport,
);
router.post(
  "/get-app-checkout-page-visit-report",
  getAppCheckoutPageVisitReport,
);
router.post("/get-app-program-page-visit-report", getAppProgramPageVisitReport);
router.get("/app-status-summary-report", getAppStatusummary);
router.get("/app-status-for-mail", getAppStatusForMail);
router.get(
  "/mentor-wise-rate-shared-unpaid-report",
  mentorWiseRateSharedUnpaidReport,
);
router.get(
  "/get-basicStack-not-upgraded-to-fullStack-summary-report",
  getBasicStackNotUpgradedToFullStackSummaryReport,
);
router.get(
  "/get-basicStack-not-upgraded-to-fullStack-report",
  getBasicStackNotUpgradedToFullStackReport,
);
router.get("/get-hf-feedback-summary-report", getHfFeedbackReport);
router.get("/get-hf-feedback-data-report", getHfFeedDatabackReport);
router.get("/get-program-feedback-report", getProgramFeedbackReport);
router.get(
  "/get-program-feedback-summary-report",
  getProgramFeedbackSummaryReport,
);
router.get("/get-no-advance-purchase-pitch-report", getNoAdvancePurchaseReport);
router.post("/get-projected-expiry-report", getProjectedExpiryReport);
router.post("/unconverted-referral", getUnconvertedReferral);
router.post("/expiring-seventy-kg", getExpiringClientsWith70Kg);

router.post("/expired-link", getExpiredLink);
router.post("/good-weight-loss", goodWeightLoss); // all active,active,good weight loss mentor wise

router.get("/total-pitched-not-paid", totalPitchedNotPaid);

router.get("/induction-call-summary-report", InductionCallSummaryReport);
router.get("/induction-call-data-report", InductionCallDataReport);
router.get(
  "/mentor-wise-all-active-no-adv-unpitched",
  mentorWiseAllActiveNoAdvUnPitched,
);
router.get("/mentor-wise-all-data", mentorWiseAllData);

router.get("/hs-report", HsReport);

router.get("/morning-lead-consultation-report", morningLeadConsultationReport);
router.get("/com-call-not-done-summary", comCallNotDoneSummary);
router.get("/com-call-not-done-data", comCallNotDoneData);
router.get("/rate-shared-abdul-report", rateSharedAbdulReport);
router.get("/khyati-sm-lead-day-end", khyatiSmLeadDayEnd);

router.post("/share-report-sheet", shareReportSheet);
router.get("/forcepoint-mentor-wise-report", forcepointSummaryReport);
router.get("/forcepoint-lead-wise-report", forcepointLeadWiseReport);
router.get("/MentorStatisticsUnion", getMentorStatisticsUnion);
router.get("/maam-rate-shared-report", getMentorSuggestedStats);
router.get("/chat-from-leads-report", chatFromLeadsReport);

export default router;
