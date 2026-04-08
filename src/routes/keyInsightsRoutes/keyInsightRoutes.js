import { Router } from "express";
import {
  addUserKeyInsight,
  getKeyInsights,
} from "../../controllers/keyInsightsControllers/keyInsightController.js";

const router = Router();
router.get("/get-user-key-insight", getKeyInsights);
router.post("/add-key-insight", addUserKeyInsight);

export default router;
