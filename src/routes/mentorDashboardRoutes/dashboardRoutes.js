import { Router } from "express";
import {
  howzMyDay,
  overDueMisses,
  salesOpportunity,
  trackerAndFeedback,
  newAssignedUserData,
  NAFICLReceivedUserData,
  rateSharedData,
  stageWiseData,
  referralData,
  clientWeightSeventyData,
  paymentLinkData,
  CallsBookedUserData,
  FuUserData,
  actionAssignedUserData,
  OCLUserData,
  leadsToCaptureUserData,
  leadsAssignedUserData,
  weightOverdueUserData,
  dietOverdueUserData,
  notStartedOverdueUserData,
  callMissedUserData,
  fuMissedUserData,
  pendingDietUserData,
  draftedDietUserData,
  preAttemptedDietUserData,
  unansweredQueriesUserData,
  pitchedButNoFuUserData,
  atRiskUserData,
  draftedQueryUserData,
  weightData,
  inchData,
  photoData,
  milestoneData,
  goalData,
  halftimeFeedbackData,
  finalFeedbackData,
  healthScoreData,
  lessLossData,
  goodLossData,
  getComUserData,
  UpdateLeadDetailsUsers,
  paymentDetailsData,
  rateSharedDataLead,
  notStarted,
  linkSharedUserData,
  onholdToday,
  onholdOd,
  assessmentOdUserData,
  iclOdUserData,
  spinToWinDataList,
  updatePrizeComment,
  spinToWinLeadDataList,
  dietFeedbackData,
  todayRiskAndMisses,
  weightOdData,
  dietOdData,
  onholdOdData,
  notstartedOdData,
  callOdData,
  validityAwarnessIncreaseData,
  goalOdData,
  feedbackOdData,
  healthscoreData,
  atriskData,
  howsMyDay,
  newAssignedClientsData,
  progressTrackerData,
  unansweredQueriesData,
  callsData,
  dietsPendingData,
  breakoverTodayData,
  programStartingTodayData,
  healthscoreReceivedData,
  feedbackReceivedData,
  goalReceivedData,
  comCallData,
  salesFollowupAndRisk,
  firstPitchedData,
  pitchedButNoFuData,
  salesFollowUpsData,
  paymentDetailsSharedData,
  salesOpportunitys,
  leadToCaptureData,
  oclData,
  unconvertedReferralsData,
  goodWeightLossData,
  clientsGivingMultipleReferralsData,
  tailendClientsNoAdvPurchaseData,
  clientsExpiredInLast30DaysData,
  activeNoAdvPurchaseData,
  spinToWinData,
  fitnessChallengeData,
  walletOfferData,
  linkExpiringTodayData,
  getBirthdayUserIdsTodayAndTomorrow,
  birthdayData,
  getFollowUpCounts,
  getFollowUpData,
  ackBirthdayData,
  draftedQueriesData,
  callsMissedData,
  getClientVisitSummary,
  dietFeedbackReceivedData,
  todayRiskAndMissesClient,
  todayRiskAndMissesMentor,
  howsMyTommorow,
  programExpiringData,
  callsDataTomorrow,
  progressTrackerDataTomorrow,
  dietDueTomorrowData,
  salesOpportunitysClient,
  milestoneClientData,
  mtdFollowUpsRisksLead,
  mtdFollowUpsRisksClient,
  ratesharedData,
  paymentDetailsExpiredData,
  ratesharedDataLead,
  salesFollowUpsDataLead,
  paymentDetailsSharedDataLead,
  paymentDetailsExpiredDataLead,
  firstPitchedDataLead,
  leadsRefsData,
  activeSalesBifurcation,
  activeMaintanenceBifurcation,
  ocBucket,
  activeMaintanenceData,
  activeWithAdvPurchaseData,
  ocRatesharedData,
  ocNotPitchedData,
  ocFirstPitchedData,
  ocGoodFeedbackData,
  ocMultipleProgramData,
  oc70PlusData,
  getReferralsByUserId,
  getActiveAdminUsersBasicList,
  linkExpiringTomorrowData,
  getSalesFollowUpStats,
  getNumberOfFormsFilled,
  ekitTrackerData,
  ackEkitTracker,
  getMentorKpis,
  getRateShared,
  leadsEngagementTodayUserData,
  startLater,
  otherTrackerData,
  cartAddedUserData,
  watiData,
  getCampaignTypeCounts,
  cartShareLinkUserData,
  getCsBirthdayUserIdsTodayYesterday,
  getBirthdayHamperDeliveredData,
  claraQueriesData,
  getFollowUpsByUserId,
  getGutCounts,
  getSmartScaleData,
  ocWeightFilledOdData,
} from "../../controllers/mentorDashboardControllers/dashboardController.js";
import {
  getDashboardTableData,
  getUserActivityColumnCounts,
  getUserNeedAttentionColumnCounts,
  getUserSalesTriggerColumnCounts,
  getUserBifurcationColumnCounts,
  getPotentialSalesColumnCounts,
  getUserActivityColumnCountsNew,
} from "../../controllers/mentorDashboardControllers/dashboardTableDataController.js";

const router = Router();
// user_id counts
router.get("/howz-my-day", howzMyDay);
router.get("/overdue-misses", overDueMisses);

router.get("/tracker-and-feedback", trackerAndFeedback);
router.get("/sales-opportunity", salesOpportunity);

//howsMyDay
router.get("/hows-my-day", howsMyDay);
router.get("/hows-my-tomorrow", howsMyTommorow);
//todayRiskAndMisses
router.get("/mentor/kpis", getMentorKpis);
router.get("/mentor/rate-shared", getRateShared);
router.post("/new-assigned-clients-data", newAssignedClientsData);
router.post("/progress-tracker-data", progressTrackerData);
router.post("/other-tracker-data", otherTrackerData);
router.post("/progress-tracker-data-tomorrow", progressTrackerDataTomorrow);
router.post("/unanswered-queries-data", unansweredQueriesData);
router.post("/smart-scale-data", getSmartScaleData);
router.post("/clara-queries-data", claraQueriesData);
router.post("/drafted-queries-data", draftedQueriesData);
router.post("/calls-data", callsData);
router.post("/calls-data-tomorrow", callsDataTomorrow);
router.post("/diets-due-tomorrow", dietDueTomorrowData);
router.post("/diets-pending-data", dietsPendingData);
router.post("/breakover-today-data", breakoverTodayData);
router.post("/program-expiring-data", programExpiringData);
router.post("/program-starting-today-data", programStartingTodayData);
router.post("/healthscore-received-data", healthscoreReceivedData);
router.post("/feedback-received-data", feedbackReceivedData);
router.post("/diet-feedback-data", dietFeedbackReceivedData);
router.post("/goal-received-data", goalReceivedData);
router.post("/com-call-data", comCallData);
router.post("/engagment-today-data", leadsEngagementTodayUserData);
//howsMyDay

//todayRiskAndMisses
router.get("/today-risk-and-misses", todayRiskAndMisses);
router.get("/today-risk-and-misses-client", todayRiskAndMissesClient);
router.get("/today-risk-and-misses-mentor", todayRiskAndMissesMentor);
router.get("/start-later", startLater);
router.post("/weight-od-data", weightOdData);
router.post("/diet-od-data", dietOdData);
router.post("/onhold-od-data", onholdOdData);
router.post("/notstarted-od-data", notstartedOdData);
router.post("/call-od-data", callOdData);
router.post("/calls-missed-data", callsMissedData);
router.post("/validity-od-data", validityAwarnessIncreaseData);
router.post("/goal-od-data", goalOdData);
router.post("/feedback-od-data", feedbackOdData);
router.post("/healthscore-od-data", healthscoreData);
router.post("/atrisk-od-data", atriskData);
router.post("/less-loss-records", lessLossData);
router.post("/link-expiring-today-data", linkExpiringTodayData);
router.post("/link-expiring-tomorrow-data", linkExpiringTomorrowData);
router.post("/cart-added-data", cartAddedUserData);
router.post("/shared-cart-link-data", cartShareLinkUserData);
//todayRiskAndMisses

//salesFollowupAndRisk
router.get("/sales-followup-and-risk", salesFollowupAndRisk);
router.get("/sales-followup-and-risk-lead", mtdFollowUpsRisksLead);
router.get("/sales-followup-and-risk-client", mtdFollowUpsRisksClient);
router.post("/first-pitched-data", firstPitchedData);
router.post("/ekit-tracker-data", ekitTrackerData);
router.patch("/ack-ekit-tracker", ackEkitTracker);
router.post("/pitched-but-no-fu-data", pitchedButNoFuData);
router.post("/rate-shared-data", ratesharedData);
router.post("/oc-weight-filled-od-data", ocWeightFilledOdData);
router.post("/sales-follow-ups-data", salesFollowUpsData);
router.post("/payment-details-shared-data", paymentDetailsSharedData);
router.post("/payment-details-expired-data", paymentDetailsExpiredData);
//salesFollowupAndRisk
router.post("/first-pitched-data-lead", firstPitchedDataLead);
router.post("/lead-refs-assigned-data", leadsRefsData);
router.post("/rate-shared-data-lead", ratesharedDataLead);
router.post("/sales-follow-ups-data-lead", salesFollowUpsDataLead);
router.post("/payment-details-shared-data-lead", paymentDetailsSharedDataLead);
router.post(
  "/payment-details-expired-data-lead",
  paymentDetailsExpiredDataLead,
);

//salesOpportunitys
router.get("/sales-opportunitys", salesOpportunitys);
router.get("/oc-bucket", ocBucket);
router.get("/active-sales-bifurcation", activeSalesBifurcation);
router.get("/active-maintanence-bifurcation", activeMaintanenceBifurcation);

router.get("/sales-opportunitys-client", salesOpportunitysClient);

router.post("/lead-to-capture-data", leadToCaptureData);
router.post("/ocl-data", oclData);
router.post("/unconverted-referrals-data", unconvertedReferralsData);
router.post("/good-weight-loss-data", goodWeightLossData);
router.post("/active-maintanence-data", activeMaintanenceData);
router.get("/referrals-by-userid", getReferralsByUserId);
router.get("/admin-users-phone-list", getActiveAdminUsersBasicList);
router.post(
  "/clients-giving-multiple-referrals-data",
  clientsGivingMultipleReferralsData,
);
router.post(
  "/tailend-clients-no-adv-purchase-data",
  tailendClientsNoAdvPurchaseData,
);
router.post("/active-with-adv-purchase-data", activeWithAdvPurchaseData);
router.post(
  "/clients-expired-in-last-30-days-data",
  clientsExpiredInLast30DaysData,
);
router.post("/active-no-adv-purchase-data", activeNoAdvPurchaseData);
router.post("/oc-rateshared-data", ocRatesharedData);
router.post("/oc-not-pitched-data", ocNotPitchedData);
router.post("/oc-first-pitched-data", ocFirstPitchedData);
router.post("/oc-good-feedback-data", ocGoodFeedbackData);
router.post("/oc-multiple-program-data", ocMultipleProgramData);
router.post("/oc-70-plus-data", oc70PlusData);

router.post("/spin-to-win-data", spinToWinData);
// router.post("/fitness-challenge-data", fitnessChallengeData);
router.post("/wallet-offer-data", walletOfferData);
router.post("/wati-data", watiData);
router.post("/milestone-client-data", milestoneClientData);

//salesOpportunitys

//getBirthdayTodayAndTomorrow
router.get(
  "/birthday-today-tomorrow-counts",
  getBirthdayUserIdsTodayAndTomorrow,
);
router.get(
  "/cs-birthday-today-yesterday-counts",
  getCsBirthdayUserIdsTodayYesterday,
);
router.get("/get-campaign-type-counts", getCampaignTypeCounts);
router.get("/get-gut-counts", getGutCounts);
router.post("/birthday-data", birthdayData);
router.patch("/ack-birthday-data", ackBirthdayData);
//getBirthdayTodayAndTomorrow

//getFollowUpCounts
router.get("/get-followup-counts", getSalesFollowUpStats);
router.post("/get-followup-data", getFollowUpData);
//getFollowUpCounts

router.get("/page-visit-history", getClientVisitSummary);

// user_data
router.post("/new-assigned", newAssignedUserData);
router.post("/not-started", notStarted);
router.post("/naf-icl", NAFICLReceivedUserData);
router.post("/unanswered-queries", unansweredQueriesUserData);
router.post("/rate-shared", rateSharedData);
router.post("/payment-data", paymentDetailsData);
router.post("/stage-data", stageWiseData);
router.post("/referral-data", referralData);
router.post("/seventy-weight-client-data", clientWeightSeventyData);
router.post("/calls-booked", CallsBookedUserData);
router.post("/pending-diet", pendingDietUserData);
router.post("/drafted-diet", draftedDietUserData);
router.post("/pre-attempted-diet", preAttemptedDietUserData);
router.post("/fu", FuUserData);
router.post("/action-assigned", actionAssignedUserData);
router.post("/OCL", OCLUserData);
router.post("/leads-to-capture", leadsToCaptureUserData);
router.post("/leads-assigned", leadsAssignedUserData);
router.post("/weight-overdue", weightOverdueUserData);
router.post("/diet-overdue", dietOverdueUserData);
router.post("/spin-data", spinToWinDataList);
router.post("/lead-spin-data", spinToWinLeadDataList);
router.post("/update-spin-comment", updatePrizeComment);

router.post("/assessment-od-user-data", assessmentOdUserData);
router.post("/icl-od-user-data", iclOdUserData);

router.post("/not-started-overdue", notStartedOverdueUserData);
router.post("/call-missed", callMissedUserData);
router.post("/fu-missed", fuMissedUserData);
router.post("/pitched-but-no-fu", pitchedButNoFuUserData);
router.post("/at-risk", atRiskUserData);
router.post("/drafted-query", draftedQueryUserData);
router.post("/weight-records", weightData);
router.post("/inch-records", inchData);
router.post("/photo-records", photoData);
router.post("/milestone-records", milestoneData);
router.post("/goal-records", goalData);
router.post("/halftime-feedback-records", halftimeFeedbackData);
router.post("/final-feedback-records", finalFeedbackData);
router.post("/diet-feedback-records", dietFeedbackData);
router.get("/diet-feedback-count", getNumberOfFormsFilled);
router.post("/hs-records", healthScoreData);
router.post("/less-loss-records", lessLossData);
router.post("/good-loss", goodLossData);
router.post("/com-user-data", getComUserData);
router.post("/update-lead-details-users", UpdateLeadDetailsUsers);

router.post("/link-shared-user-data", linkSharedUserData);

router.post("/onhold-today", onholdToday);
router.post("/onhold-od", onholdOd);
// dashboard table data api routes starting from blue drop down

router.post("/dashboard-table-data", getDashboardTableData);
router.post("/user-activity-counts", getUserActivityColumnCounts);
router.post("/user-need-attention-counts", getUserNeedAttentionColumnCounts);
router.post("/user-sales-trigger-counts", getUserSalesTriggerColumnCounts);
router.post("/user-bifurcation-counts", getUserBifurcationColumnCounts);
router.post("/potential-sales-counts", getPotentialSalesColumnCounts);
router.post("/user-activity-counts-new", getUserActivityColumnCountsNew);
router.post("/get-followups-by-user", getFollowUpsByUserId);



router.post(
  "/get-birthday-hamper-deliver-data",
  getBirthdayHamperDeliveredData,
);
export default router;
