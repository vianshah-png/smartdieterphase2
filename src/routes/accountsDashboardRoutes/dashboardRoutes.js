import { Router } from "express";
import {
  SalesUnits,
  salesOverview,
  salesSource,
  customerGenders,
  salesTypes,
  collectionData,
  globalClients,
  totalCollections,
  clientBase,
  growthChart,
  averageProgramPrice,
  clientsWithHealthConditions,
  balanceWalletAnalysis,
  balanceData,
  countryWiseClients,
  getExecutiveSummary,
  getGeographySummary,
  balanceWalletAnalysisMonthYear,
  // getDemographics,
} from "../../controllers/accountsDashboardControllers/dashboardController.js";

const router = Router();

router.get("/sales", SalesUnits);
router.get("/sales-overview", salesOverview);
router.get("/total-collections", totalCollections);
router.get("/sales-source", salesSource);
router.get("/customer-genders", customerGenders);
router.get("/sales-types", salesTypes);
router.get("/global-clients", globalClients);
router.get("/client-base", clientBase);
router.get("/growth-chart", growthChart);
router.get("/average-program-price", averageProgramPrice);
router.get("/health-conditions-clients", clientsWithHealthConditions);
router.get("/balance-wallet-analysis", balanceWalletAnalysis);
router.get("/balance-wallet-analysis-month-year", balanceWalletAnalysisMonthYear);
router.get("/collection-data", collectionData);
router.get("/balance-data", balanceData);
router.get("/country-wise-clients", countryWiseClients);
router.post("/get-summary", getExecutiveSummary);
// router.post("/get-demographics", getDemographics)
router.post("/get-geography", getGeographySummary)
export default router;
