import { Router } from "express";
import {
  assignedLeadsPerformance,
  keySourceConversion,
  leadManagement,
  salesBreakDownByStack,
  salesPerformance,
  salesProjection,
  salesTriggers,
  counsellorPerformance,
  assignedLeadsPerformanceById,
  pitchedHistory,
  ocManagement,
  oldLeadManagement,
  unconvertedLeads,
  consultationPending,
  quickSalesSnapshot,
  solidSalesOpportunities,
  leadFunnel,
  pageVisitDetails,
  salesTriggersData,
  assignedLeadsPerformanceAll,
  getCounsellorDailyPerformanceById,
  dailyNewLeads,
  getFranchiseEnquiries,
  addCommentsToFranchiseEnquiry,
  getNutripreneurEnquiries,
  addCommentsToNutripreneurEnquiry,
} from "../../controllers/salesDashboardControllers/overviewController.js";

const router = Router();

router.post("/lead-management", leadManagement);
router.post("/old-lead-management", oldLeadManagement);
router.post("/oc-management", ocManagement);
router.post("/sales-performance", salesPerformance);
router.post("/counsellor-performance", counsellorPerformance);
router.post(
  "/counsellor-daily-performance-by-id",
  getCounsellorDailyPerformanceById,
);
router.post("/assigned-leads-performance", assignedLeadsPerformance);
router.post("/assigned-leads-performance-all", assignedLeadsPerformanceAll);
router.post(
  "/assigned-leads-performance-by-id/:id",
  assignedLeadsPerformanceById,
);
router.post("/sales-breakdown-by-stack", salesBreakDownByStack);
router.post("/sales-trigger", salesTriggers);
router.post("/sales-projection", salesProjection);
router.post("/key-source-conversion", keySourceConversion);
router.post("/pitched-history", pitchedHistory);
router.post("/unconverted-leads", unconvertedLeads);
router.post("/consultation-pending", consultationPending);
router.post("/quick-sales-snapshot", quickSalesSnapshot);
router.post("/solid-sales-opportunities", solidSalesOpportunities);
router.post("/lead-funnel", leadFunnel);
router.post("/page-visit-details", pageVisitDetails);
router.post("/sales-trigger-data", salesTriggersData);
router.post("/daily-new-leads", dailyNewLeads);
router.post("/franchise-enquiries", getFranchiseEnquiries);
router.post("/nutripreneur-enquiries", getNutripreneurEnquiries);

router.patch(
    "/add-comment-to-franchise-enquiry/:id",
    addCommentsToFranchiseEnquiry,
  );

router.patch(
    "/add-comment-to-nutripreneur-enquiry/:id",
    addCommentsToNutripreneurEnquiry,
  );
export default router;
