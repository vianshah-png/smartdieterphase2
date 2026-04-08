import { Router } from "express";
import {
  activeClientData,
  activeManagement,
  leadManagement,
  leadsData,
  ocManagement,
  oldClientData,
  orderDataDownload,
  quickSalesSnapshot,
  salesAlert,
  salesBreakDown,
  salesOpportunities,
  salesOpportunitiesData,
  salesRiskAndMisses,
  totalOC,
  totalOldLeads,
} from "../../controllers/franchiseDashboardControllers/countryWiseSalesDashboard.js";

const router = Router();

router.get("/quick-sales-snapshot", quickSalesSnapshot);
router.get("/lead-management", leadManagement);
router.get("/oc-management", ocManagement);
router.get("/active-management", activeManagement);
router.get("/sales-breakdown", salesBreakDown);
router.get("/sales-opportunities", salesOpportunities);
router.get("/sales-risk-and-misses", salesRiskAndMisses);
router.get("/sales-alert", salesAlert);
router.get("/total-old-leads", totalOldLeads);
router.get("/total-oc", totalOC);
router.post("/leads-data", leadsData);
router.post("/old-client-data", oldClientData);
router.post("/active-client-data", activeClientData);
router.post("/order-data-download", orderDataDownload);
router.post("/sales-opportunities-data", salesOpportunitiesData);
export default router;
