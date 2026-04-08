import { Router } from "express";
import {
  addHealthScore,
  compareMidAndEndHS,
  getHealthScoreReport,
  getHealthScoreReportByAssessment,
  addLeadHealthScore,
  getLeadHealthScoreReport,
  getLeadBmiReport,
  getLeadWeightReport
} from "../controllers/healthScoreController.js";

const router = Router();

router.post("/add-health-score", addHealthScore);
router.get("/get-health-score", getHealthScoreReport);
router.post(
  "/get-health-score-by-assessment",
  getHealthScoreReportByAssessment
);
router.get("/compare-hs", compareMidAndEndHS);
router.post("/add-lead-health-score", addLeadHealthScore);
router.post("/get-lead-health-score-report", getLeadHealthScoreReport);
router.post("/get-lead-bmi-report", getLeadBmiReport);
router.post("/get-lead-weight-report", getLeadWeightReport);

export default router;
