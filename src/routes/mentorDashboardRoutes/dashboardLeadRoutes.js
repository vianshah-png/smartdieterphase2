import { Router } from "express";
import {
  acknowledgeEntriesLeadsDashboard,
  additionalQuestionsLeadsDashboard,
  appFeedbackLeadsDashboard,
  assignedLeads,
  balancePaymentLeadsDashboard,
  callsLeadsDashboard,
  checkoutVisitLeadsDashboard,
  consultationFeedbackLeadsDashboard,
  crossCallsLeadsDashboard,
  draftedQueriesLeadsDashboard,
  dubaiLeadsToCapture,
  engagementTodayLeadsDashboard,
  extraDiscountExpiringTomorrorwLeadDB,
  firstPitchedLeadsDashboard,
  followUpsLeadsDashboard,
  goodFeedbackLeadsDashboard,
  goodWeightLossLeadsDashboard,
  healthScoreLeadsDashboard,
  hotFollowUpsPendingLeadsDB,
  hotLeadsWithPaymentDueLeadDB,
  hotLeadWithNegativeFeedback,
  howsMyDay,
  leadAppDownloaded,
  leadsWithDoubleDiscount,
  leadsWithFreeActiveGuide,
  leadsWithGoPro,
  leadsWithImprovedHealthScore,
  leadsWithoutApp,
  leadToCapture,
  milestoneFilledLeadsDashboard,
  mtdSalesRisks,
  payLaterOdLeadDashboard,
  paymentDetailsSharedLeadsDB,
  paymentDetailsSharedPayLaterLeadsDB,
  paymentDetailsSharedToPayLeadsDB,
  referralDataLeadsDashboard,
  riskAndMisses,
  serviceCallsLeadsDashboard,
  solidSalesOpportunities,
  toPayOdLeadDashboard,
  unacknowledgedMilestonesLeadsDB,
  unansweredQueriesLeadsDashboard,
  unconvertedLeadsWithFreeCourse,
  unconvertedLeadsWithGoPro,
  walletExpiringTomorrowLeadDB,
  weightTrackerLeadsDashboard,
  leadAppDownloadedmtd,
  snackPurchaseLeadsDashboard,
  cartAddedLeadsDashboard,
  categoryWisePerformanceLeadsDashboard,
  sourceWisePerformanceLeadsDashboard,
  oldLeadTakenHealthScore,
  performanceTrendChart,
  shareCartLinkAddedLeadsDashboard,
  leadAppDownloadedall,
} from "../../controllers/mentorDashboardControllers/dashboardControllerLead.js";

const router = Router();

// how's my day
router.get("/hows-my-day", howsMyDay);

router.post("/leads-to-capture", leadToCapture);
router.post("/dubai-leads-to-capture", dubaiLeadsToCapture);
router.post("/assigned-leads", assignedLeads);
router.post("/calls-leads", callsLeadsDashboard);
router.post("/follow-ups-leads", followUpsLeadsDashboard);
router.post("/unanswered-queries-leads", unansweredQueriesLeadsDashboard);
router.post("/clara-queries-leads", unansweredQueriesLeadsDashboard);
router.post("/drafted-queries-leads", draftedQueriesLeadsDashboard);
router.post("/weight-tracker-leads", weightTrackerLeadsDashboard);
router.post("/consultation-feedback-leads", consultationFeedbackLeadsDashboard);
router.post("/app-feedback-leads", appFeedbackLeadsDashboard);
router.post("/balance-payment-leads", balancePaymentLeadsDashboard);
router.post("/hot-leads-with-payment-due", hotLeadsWithPaymentDueLeadDB);
router.post("/engagement-today-leads", engagementTodayLeadsDashboard);
router.post("/health-score-leads", healthScoreLeadsDashboard);
router.post("/additional-questions-leads", additionalQuestionsLeadsDashboard);
router.post("/cross-calls-leads", crossCallsLeadsDashboard);
router.post("/service-calls-leads", serviceCallsLeadsDashboard);
router.post("/lead-app-downloaded", leadAppDownloaded);
router.post("/lead-app-downloaded-mtd", leadAppDownloadedmtd);
router.post("/lead-app-downloaded-all", leadAppDownloadedall);
router.post("/old-lead-taken-hs", oldLeadTakenHealthScore);

// Risk and Misses
router.get("/risk-and-misses", riskAndMisses);
router.post("/leads-without-app", leadsWithoutApp);

// solid sales opportunities
router.get("/solid-sales-opportunity", solidSalesOpportunities);

router.post("/checkout-visit-leads", checkoutVisitLeadsDashboard);
router.post("/payment-details-shared-leads", paymentDetailsSharedLeadsDB);
router.post(
  "/payment-details-shared-to-pay-leads",
  paymentDetailsSharedToPayLeadsDB,
);
router.post(
  "/payment-details-shared-pay-later-leads",
  paymentDetailsSharedPayLaterLeadsDB,
);
router.post("/double-discount-leads", leadsWithDoubleDiscount);
router.post("/improved-health-score-leads", leadsWithImprovedHealthScore);
router.post("/referral-leads", referralDataLeadsDashboard);
router.post("/guide-purchased-leads", leadsWithGoPro);
router.post("/free-course-leads", leadsWithFreeActiveGuide);
router.post("/good-weight-loss-leads", goodWeightLossLeadsDashboard);
router.post("/milestone-filled-leads", milestoneFilledLeadsDashboard);
router.post("/good-feedback-leads", goodFeedbackLeadsDashboard);
router.post("/first-pitched-leads", firstPitchedLeadsDashboard);
router.post("/snack-purchase-leads", snackPurchaseLeadsDashboard);
router.post("/cart-added-leads", cartAddedLeadsDashboard);
router.post("/shared-cart-link-added-leads", shareCartLinkAddedLeadsDashboard);

// mtd sales risk
router.get("/mtd-sales-risk", mtdSalesRisks);

router.post("/hot-follow-ups-pending-leads", hotFollowUpsPendingLeadsDB);
router.post(
  "/unacknowledged-milestones-leads",
  unacknowledgedMilestonesLeadsDB,
);
router.post("/to-pay-od-leads", toPayOdLeadDashboard);
router.post("/pay-later-od-leads", payLaterOdLeadDashboard);
router.post("/wallet-expiring-tomorrow-leads", walletExpiringTomorrowLeadDB);
router.post(
  "/extra-discount-expiring-tomorrow-leads",
  extraDiscountExpiringTomorrorwLeadDB,
);
router.post("/hot-leads-with-negative-feedback", hotLeadWithNegativeFeedback);
router.post("/unconverted-leads-with-go-pro", unconvertedLeadsWithGoPro);
router.post(
  "/unconverted-leads-with-free-course",
  unconvertedLeadsWithFreeCourse,
);
router.patch("/acknowledge-entries-lead", acknowledgeEntriesLeadsDashboard);

// performance routes
router.get("/category-wise-performance", categoryWisePerformanceLeadsDashboard);
router.get("/source-wise-performance", sourceWisePerformanceLeadsDashboard);
router.get("/performance-trend-chart", performanceTrendChart);
export default router;
