import { Router } from "express";
import {
  assignedSMLeadsByCounsellors,
  consolidatedTeamPerformance,
  contentVisits,
  counsellorSMPerformance,
  facebookPerformance,
  getAllSocialMediaPerformance,
  guideAndBookInteractions,
  instagramPerformance,
  leadDownGradeAnalysis,
  leadStatusOverview,
  linkedINPerformance,
  overallSocialMediaLeads,
  socialMediaPerformance,
  sourceWiseLeadPerformance,
  twitterPerformance,
  updateSocialMediaAnalysis,
  youtubePerformance,
} from "../../controllers/salesDashboardControllers/socialMediaController.js";
const router = Router();
router.post("/overall-social-media-leads", overallSocialMediaLeads);
router.post("/assigned-sm-leads-by-counsellors", assignedSMLeadsByCounsellors);
router.post("/source-wise-leads-performance", sourceWiseLeadPerformance);
router.post("/lead-status-overview", leadStatusOverview);
router.post("/lead-downgrade-analysis", leadDownGradeAnalysis);
router.post("/counsellor-sm-performance", counsellorSMPerformance);
router.post("/consolidated-team-performance", consolidatedTeamPerformance);
router.post("/content-visits", contentVisits);
router.post("/guide-and-book-interactions", guideAndBookInteractions);
router.post("/all-social-media-performance", getAllSocialMediaPerformance);
router.post("/instagram-performance", instagramPerformance);
router.post("/youtube-performance", youtubePerformance);
router.post("/facebook-performance", facebookPerformance);
router.post("/linkedin-performance", linkedINPerformance);
router.post("/twitter-performance", twitterPerformance);
router.post("/social-media-performance", socialMediaPerformance);
router.post("/update-social-media-analysis", updateSocialMediaAnalysis);
export default router;
