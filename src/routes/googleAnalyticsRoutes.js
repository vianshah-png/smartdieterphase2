import { Router } from "express";
import { getAnalytics,getYTAnalytics } from "../controllers/googleAnalytics.js";

const router = Router();
router.post("/get-analytics", getAnalytics);
router.post("/get-youtube-analytics", getYTAnalytics);

export default router;
// IN PROGRESS
