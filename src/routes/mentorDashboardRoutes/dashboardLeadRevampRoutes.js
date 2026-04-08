import { Router } from "express";
import {
  activitiesCapturedLeadsCount,
  activitiesCallsAndFollowUpsCounts,
  activitiesConsultationCounts,
  balanceDueData,
  balanceOverdueData,
  basicStackLeadsData,
  buildFaithLeadsData,
  buildYourBucketCounts,
  consultationLeadsData,
  consultationMissedLeadsData,
  criticalResponsesCounts,
  directLeadsData,
  directMissedLeadsData,
  engagementCallsLeadsData,
  followUpCallsLeadsData,
  followUpsAndCallsCounts,
  hotFUMissedLeadsData,
  hotOldLeadsData,
  justForKnowledgeLeadsData,
  leadsCount,
  leadsWithoutAppBucketData,
  nonTargetMarketLeadsData,
  ocrData,
  oldCampaignLeadsBucketData,
  paymentDueData,
  paymentOverdueData,
  phaseBucketLeadsData,
  previouslyHotLeadBucketData,
  previouslyWarmLeadsBucketData,
  referralLeadsData,
  riskAndMissesCriticalFollowUps,
  riskAndMissesLeadsCounts,
  riskAndMissesToNurtureCount,
  socialMediaLeadsData,
  socialMediaMissedLeadsData,
  targetMarketBucketLeadsData,
  targetMarketLeadsData,
  targetMarketMissedLeadsData,
  unansweredQueriesLeadsData,
  walletAbove3000LeadsData,
  warmFUMissedLeadsData,
  warmOldLeadsData,
  whatsappEngagementLeadsData,
  whatsappFollowUpLeadsData,
  activitiesConversationCounts,
  efficiencyMetricsData,
  productivityMetricsData,
  capturedLeadsActivitiesData,
  callsAndFollowUpsActivitiesData,
  consultationActivitiesData,
  conversationActivitiesData,
  adminDayPlannerData,
  adminDayReviewData,
  adminDayEndData,
  hSLeadsData,
  nonTargetMarketBucketLeadsData,
  ongoingChallengeCount,
  challengeParticipantsLeadsData,
  challengeActiveParticipantsLeadsData,
  challengeInactiveParticipantsLeadsData,
  dailyRunRateStats,
} from "../../controllers/mentorDashboardControllers/dashboardControllerLeadRevamp.js";
import {
  performanceRoiReportPreview,
  performanceRoiReportSend,
} from "../../controllers/mentorDashboardControllers/performanceRoiReportController.js";

const router = Router();

// today's critical action counts
router.get("/leads-counts", leadsCount);
router.get("/ongoing-challenge-counts", ongoingChallengeCount);
router.get("/follow-up-and-calls-counts", followUpsAndCallsCounts);
router.get("/critical-responses-counts", criticalResponsesCounts);

// leads data api routes
router.post("/target-market-leads-data", targetMarketBucketLeadsData);
router.post(
  "/non-target-market-leads-data-critical",
  nonTargetMarketBucketLeadsData,
);
router.post("/referral-leads-data", referralLeadsData);
router.post("/direct-leads-data", directLeadsData);
router.post("/social-media-leads-data", socialMediaLeadsData);
router.post("/hot-old-leads-data", hotOldLeadsData);
router.post("/warm-old-leads-data", warmOldLeadsData);
router.post("/ocr-data", ocrData);
router.post("/hs-leads-data", hSLeadsData);

router.post("/total-participants-leads-data", challengeParticipantsLeadsData);
router.post(
  "/active-participants-leads-data",
  challengeActiveParticipantsLeadsData,
);
router.post(
  "/inactive-participants-leads-data",
  challengeInactiveParticipantsLeadsData,
);

// follow-ups and calls data api routes
router.post("/consultation-leads-data", consultationLeadsData);
router.post("/follow-up-calls-leads-data", followUpCallsLeadsData);
router.post("/engagement-calls-leads-data", engagementCallsLeadsData);
router.post("/whatsapp-follow-up-leads-data", whatsappFollowUpLeadsData);
router.post("/whatsapp-engagement-leads-data", whatsappEngagementLeadsData);

// critical responses data api routes
router.post("/unanswered-queries-leads-data", unansweredQueriesLeadsData);
router.post("/balance-due-data", balanceDueData);
router.post("/payment-due-data", paymentDueData);

// risk and misses count api routes
router.get("/risk-and-misses-leads-counts", riskAndMissesLeadsCounts);
router.get(
  "/risk-and-misses-critical-fu-counts",
  riskAndMissesCriticalFollowUps,
);
router.get("/risk-and-misses-to-nurture-count", riskAndMissesToNurtureCount);

// risks and misses data api routes
// leads data api
router.post("/target-market-missed-leads-data", targetMarketMissedLeadsData);
router.post("/direct-missed-leads-data", directMissedLeadsData);
router.post("/social-media-missed-leads-data", socialMediaMissedLeadsData);

// critical follow ups data api
router.post("/consultation-missed-leads-data", consultationMissedLeadsData);
router.post("/hot-follow-up-missed-leads-data", hotFUMissedLeadsData);
router.post("/warm-follow-up-missed-leads-data", warmFUMissedLeadsData);
router.post("/balance-overdue-data", balanceOverdueData);
router.post("/payment-overdue-data", paymentOverdueData);

// to nurture data api
router.post("/non-target-market-leads-data", nonTargetMarketLeadsData);
router.post("/build-faith-leads-data", buildFaithLeadsData);
router.post("/just-for-knowledge-leads-data", justForKnowledgeLeadsData);
router.post("/basic-stack-leads-data", basicStackLeadsData);
router.post("/wallet-above-3000-leads-data", walletAbove3000LeadsData);

router.get("/build-your-bucket-counts", buildYourBucketCounts);
router.post("/target-market-bucket-leads-data", targetMarketBucketLeadsData);
router.post("/leads-without-app-bucket-data", leadsWithoutAppBucketData);
router.post("/phase-bucket-leads-data", phaseBucketLeadsData);
router.post("/previously-hot-lead-bucket-data", previouslyHotLeadBucketData);
router.post("/previously-warm-lead-bucket-data", previouslyWarmLeadsBucketData);
router.post("/old-campaign-lead-bucket-data", oldCampaignLeadsBucketData);

// activities done section api route

// activities done section count api route
router.get("/captured-leads-acivities-count", activitiesCapturedLeadsCount);
router.get(
  "/calls-and-follow-ups-acivities-count",
  activitiesCallsAndFollowUpsCounts,
);
router.get("/consultation-activities-count", activitiesConsultationCounts);
router.get("/conversation-activities-count", activitiesConversationCounts);

// activities done section data api route
router.post("/captured-leads-activities-data", capturedLeadsActivitiesData);
router.post(
  "/calls-and-follow-ups-activities-data",
  callsAndFollowUpsActivitiesData,
);
router.post("/consultation-activities-data", consultationActivitiesData);
router.post("/conversation-activities-data", conversationActivitiesData);

// performance efficiency metrics route

router.get("/daily-run-rate-data", dailyRunRateStats);
router.get("/efficiency-metrics-data", efficiencyMetricsData);
router.get("/productivity-metrics-data", productivityMetricsData);
router.get("/performance-roi-report", performanceRoiReportPreview);
router.post("/performance-roi-report/send", performanceRoiReportSend);

// day planner data
router.get("/admin-day-planner-data", adminDayPlannerData);
router.get("/admin-day-review-data", adminDayReviewData);
router.get("/admin-day-end-data", adminDayEndData);
export default router;
