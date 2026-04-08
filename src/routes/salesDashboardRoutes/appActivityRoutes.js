import { Router } from "express";
import {
  activatedFeatures,
  allActiveAppActivityCount,
  allLeadsWithAppCount,
  allOCAppActivityCount,
  appAnalyticsOverviewActive,
  appAnalyticsOverviewActiveData,
  appAnalyticsOverviewLead,
  appAnalyticsOverviewLeadData,
  appAnalyticsOverviewOC,
  appAnalyticsOverviewOCData,
  appDownloadCounts,
  appDownloadData,
  appUsageOverview,
  getCrashlyticsData,
  keyEngagementMetrics,
  notificationEngagement,
  notificationEngagementSummary,
  updateCrashlyticsData,
} from "../../controllers/salesDashboardControllers/appActivityController.js";

const router = Router();
router.post("/app-download-counts", appDownloadCounts);
router.post("/app-download-data", appDownloadData);
router.post("/app-usage-overview", appUsageOverview);
router.post("/key-engagement-metrics", keyEngagementMetrics);
router.post("/activated-features", activatedFeatures);
router.post("/all-leads-with-app-count", allLeadsWithAppCount);
router.post("/all-active-app-count", allActiveAppActivityCount);
router.post("/all-oc-app-count", allOCAppActivityCount);
router.post("/app-analytics-overview-active-count", appAnalyticsOverviewActive);
router.post(
  "/app-analytics-overview-active-data",
  appAnalyticsOverviewActiveData
);
router.post("/app-analytics-overview-oc-count", appAnalyticsOverviewOC);
router.post("/app-analytics-overview-oc-data", appAnalyticsOverviewOCData);
router.post("/app-analytics-overview-lead-count", appAnalyticsOverviewLead);
router.post("/app-analytics-overview-lead-data", appAnalyticsOverviewLeadData);
router.post("/notification-engagement", notificationEngagement);
router.post("/notification-engagement-summary", notificationEngagementSummary);
router.get("/crashlytics-data", getCrashlyticsData);
router.patch("/update-crashlytics-data", updateCrashlyticsData);
export default router;
