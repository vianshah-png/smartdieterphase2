import { Router } from "express";
import {
  getClinicalConditionsCount,
  getConsultationCount,
  getOcCountWithApp,
  getOcCountWithoutApp,
  getTotalClientsCount,
  getStageCount,
  getPrimeSegmentLeadCounts,
  getHighPotentialsLeadCounts,
  getDownGradeCounts,
  getTotalUnconvertedUserData,
  getOcCountWithoutAppUserData,
  getOcCountWithAppUserData,
  getPrimeSegmentLeadUserData,
  getHighPotentialsLeadUserData,
  getConsultationUserData,
  getStageUserData,
  getClinicalConditionsUserData,
  getDownGradeData,
} from "../../controllers/mentorDashboardControllers/unconvertedController.js";

const router = Router();

router.get("/total-unconverted-count", getTotalClientsCount);
router.post("/get-total-unconverted-user-data", getTotalUnconvertedUserData);

router.get("/oc-without-app", getOcCountWithoutApp);
router.post("/oc-without-app-user-data", getOcCountWithoutAppUserData);
router.get("/oc-with-app", getOcCountWithApp);
router.post("/oc-with-app-user-data", getOcCountWithAppUserData);

router.get("/prime-segment-leads-counts", getPrimeSegmentLeadCounts);
router.post("/prime-segment-leads-user-data", getPrimeSegmentLeadUserData);
router.get("/high-potentials-leads-counts", getHighPotentialsLeadCounts);
router.post("/high-potentials-user-data", getHighPotentialsLeadUserData);

router.get("/consultation-count", getConsultationCount);
router.post("/consultation-user-data", getConsultationUserData);
router.get("/stage-count", getStageCount);
router.post("/stage-user-data", getStageUserData);
router.get("/downgrade-counts", getDownGradeCounts);
router.get("/clinical-conditions-count", getClinicalConditionsCount);
router.post("/clinical-conditions-user-data", getClinicalConditionsUserData);

router.post("/downgrade-data", getDownGradeData);
export default router;
