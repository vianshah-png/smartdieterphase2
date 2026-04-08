import Router from "express";
import { universalSearchController } from "../../controllers/contentDashboardControllers/searchController.js";

const router = Router();

router.post("/all", universalSearchController);

export default router;
