import { Router } from "express";
import {
  getGeographyCounts,
  getClientPerformanceCounts,
  getRenewalAnalysisCounts,
  getDemographicsCounts,
  getProgramPerformanceCounts,
  getExecutiveSummary,
  getFilteredData,
  getAllUsersCountries,
  getCountryOnregion,
  getProgramByStack,
  getFinancialYearlySalesBreakdown,
  getMentorRevenueBreakup,
  getSalesDataComparison,
  getProgramWiseSalesData,
  getOverallSummaryReport,
  getKhyatiMaamReport,
  getSalesDataReport,
} from "../../controllers/accountsDashboardControllers/misController.js";

const router = Router();

router.post("/count/users-region-countries", getCountryOnregion);
router.post("/count/users-countries", getAllUsersCountries);
router.post("/count/program-by-stack", getProgramByStack);
router.post("/count/filtered-data", getFilteredData);
router.post("/count/executive-summary", getExecutiveSummary);

router.post("/count/demographics", getGeographyCounts);

// POST request for Client Performance counts
router.post("/count/client-performance", getClientPerformanceCounts);

// POST request for Renewal Analysis counts
router.post("/count/renewal-analysis", getRenewalAnalysisCounts);

// POST request for Demographics counts
router.post("/count/geography", getDemographicsCounts);

// POST request for Program Performance counts
router.post("/count/program-performance", getProgramPerformanceCounts);

router.get(
  "/count/financial-year-sales-breakdown",
  getFinancialYearlySalesBreakdown
);
router.get("/count/mentor-revenue-breakup", getMentorRevenueBreakup);

router.get("/count/sales-data-comparison", getSalesDataComparison);
router.get("/count/program-wise-sales-data", getProgramWiseSalesData);
router.get("/count/overall-summary-report", getOverallSummaryReport);
router.get("/count/get-khyati-maam-report", getKhyatiMaamReport);
router.get("/count/sales-data-report", getSalesDataReport);
export default router;
