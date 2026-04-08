import { Router } from "express";
import {
  howsMyDay,
  mtdSalesRisks,
  riskAndMisses,
  solidSalesOpportunities,
  callsOCDashboard,
  followUpsOCDashboard,
  unansweredQueriesOCDashboard,
  draftedQueriesOCDashboard,
  weightTrackerOCDashboard,
  appFeedbackOCDashboard,
  consultationFeedbackOCDashboard,
  crossCallsOCDashboard,
  ocAppDownloaded,
  ocWithoutApp,
  checkoutVisitOCDashboard,
  paymentDetailsSharedOCDashboard,
  ocWithDoubleDiscount,
  referralDataOCDashboard,
  goodWeightLossOCDashboard,
  goodConsultationFeedbackOCDashboard,
  hotFollowUpsPendingOCDashboard,
  walletExpiringTomorrowOCDashboard,
  extraDiscountExpiringTomorrowOCDashboard,
  hotOCWithNegativeFeedback,
  firstPitchedOCDashboard,
  hotPaymentOverdueOCDashboard,
  photoTrackerOCDashboard,
  snackPurchaseOCDashboard,
  cartAddedOCDashboard,
  shareCartLinkAddedOCDashboard,
  ocSuggestedOCDashboard,
  engagementTodayOCDashboard,
  ocHealhScoreData,
  challengeActivityOCDashboard,
  claraQueriesOCDashboard,
} from "../../controllers/mentorDashboardControllers/dashboardControllerOC.js";

const router = Router();

// how's my day
router.get("/hows-my-day", howsMyDay);

router.post("/calls-oc", callsOCDashboard);
router.post("/follow-ups-oc", followUpsOCDashboard);
router.post("/unanswered-queries-oc", unansweredQueriesOCDashboard);
router.post("/clara-queries-oc", claraQueriesOCDashboard);
router.post("/drafted-queries-oc", draftedQueriesOCDashboard);
router.post("/weight-tracker-oc", weightTrackerOCDashboard);
router.post("/consultation-feedback-oc", consultationFeedbackOCDashboard);
router.post("/app-feedback-oc", appFeedbackOCDashboard);

router.post("/cross-calls-oc", crossCallsOCDashboard);
router.post("/oc-app-downloaded", ocAppDownloaded);
router.post("/oc-suggested", ocSuggestedOCDashboard);
router.post("/engagement-today-oc", engagementTodayOCDashboard);

// Risk and Misses
router.get("/risk-and-misses", riskAndMisses);
router.post("/oc-without-app", ocWithoutApp);

// solid sales opportunities
router.get("/solid-sales-opportunity", solidSalesOpportunities);

router.post("/checkout-visit-oc", checkoutVisitOCDashboard);
router.post("/payment-details-shared-oc", paymentDetailsSharedOCDashboard);
router.post("/double-discount-oc", ocWithDoubleDiscount);
router.post("/referral-oc", referralDataOCDashboard);
router.post("/good-weight-loss-oc", goodWeightLossOCDashboard);
router.post("/good-feedback-oc", goodConsultationFeedbackOCDashboard);
router.post("/first-pitched-oc", firstPitchedOCDashboard);
router.post("/photo-tracker-oc", photoTrackerOCDashboard);
router.post("/snack-purchase-oc", snackPurchaseOCDashboard);
router.post("/cart-added-oc", cartAddedOCDashboard);
router.post("/shared-cart-link-added-oc", shareCartLinkAddedOCDashboard);
router.post("/challenge-activity-oc", challengeActivityOCDashboard);

router.post("/oc-healhscore-data", ocHealhScoreData);

// mtd sales risk
router.get("/mtd-sales-risk", mtdSalesRisks);

router.post("/hot-follow-ups-pending-oc", hotFollowUpsPendingOCDashboard);

router.post("/hot-payment-od-oc", hotPaymentOverdueOCDashboard);
router.post("/wallet-expiring-tomorrow-oc", walletExpiringTomorrowOCDashboard);
router.post(
  "/extra-discount-expiring-tomorrow-oc",
  extraDiscountExpiringTomorrowOCDashboard,
);
router.post("/hot-oc-with-negative-feedback", hotOCWithNegativeFeedback);
export default router;
