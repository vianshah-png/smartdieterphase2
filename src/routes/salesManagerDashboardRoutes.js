import { Router } from "express";
import { dailyRunRateStats, productivityMetricsData,efficiencyMetricsData,salesBreakdown,leadsBreakdown,unconvertedLeads,leadDistribution,missesDashboard, avgDaysToConvert,risksDashboard } from "../controllers/salesManagerDashboardController.js";

const router = Router();

router.get("/get-daily-run-rate", dailyRunRateStats);
router.get("/get-productivity-metrics", productivityMetricsData);
router.get("/get-efficiency-metrics", efficiencyMetricsData);
router.get("/get-sales-breakdown", salesBreakdown);
router.get("/get-leads-breakdown", leadsBreakdown);
router.get("/get-unconverted-leads", unconvertedLeads);
router.get("/get-leads-distribution", leadDistribution);
router.get("/get-misses", missesDashboard);
router.get("/get-average-days-to-convert", avgDaysToConvert);
router.get("/get-risks", risksDashboard);

export default router;
