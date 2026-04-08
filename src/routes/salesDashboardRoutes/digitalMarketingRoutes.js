import { Router } from "express";
import {
  addCampaign,
  adPerformanceOverview,
  adPerformanceReport,
  campaignOverview,
  clinicalConditionsWiseLeads,
  counsellorCampaignPerformance,
  createAdPerformanceReport,
  getCampaigsDetailsById,
  getDetailsOfCampaigns,
  leadMISForRetargeting,
  overAllLeadGenderWise,
  updateAdPerformanceReport,
  updateCampaignDetails,
  uploadAdPerformanceReport,
  userBifurcationCount,
  websitePerformance,
} from "../../controllers/salesDashboardControllers/digitalMarketingController.js";
import { multerUpload } from "../../config/multerConfig.js";
const router = Router();

router.post("/overall-gender-wise-leads", overAllLeadGenderWise);
router.post("/clinical-conditions-wise-data", clinicalConditionsWiseLeads);
router.post("/lead-mis-data", leadMISForRetargeting);
router.post("/add-campaign", addCampaign);
router.get("/get-campaigns-details", getDetailsOfCampaigns);
router.post("/campaigns-details-id", getCampaigsDetailsById);
router.post("/update-campaign", updateCampaignDetails);
router.post("/user-bifurcation-count", userBifurcationCount);
router.post("/campaign-overview", campaignOverview);
router.post("/website-performance", websitePerformance);
router.post("/counsellor-campaign-performance", counsellorCampaignPerformance);
router.post("/ad-performance-report", adPerformanceReport);
router.post("/ad-performance-report-overview", adPerformanceOverview);
router.post("/create-ad-performance-report", createAdPerformanceReport);
router.patch("/update-ad-performance-report/:id", updateAdPerformanceReport);
router.post(
  "/upload-ad-performance-report",
  multerUpload.single("file"),
  uploadAdPerformanceReport
);

export default router;
