import { Router } from "express";
import { getAllAssessmentClients } from "../../controllers/accountsDashboardControllers/assessmentController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();

router.get(
  "/get-all-assessment-clients",
  redisMiddleware(redisKeys.assessment_clients),
  getAllAssessmentClients
);

export default router;
