import Router from "express";
import { programColumnData } from "../../controllers/contentDashboardControllers/dashboardPageController.js";

const router = Router();
router.get("/program-card-count", programColumnData);

export default router;
