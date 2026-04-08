import { Router } from "express";
import {
  contentAction,
  getTopPerformers,
} from "../../controllers/contentDashboardControllers/contentController.js";

const router = Router();
router.post("/action", contentAction);
router.get("/top-performing-content", getTopPerformers);

export default router;
