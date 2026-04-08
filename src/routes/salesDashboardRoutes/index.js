import Router from "express";
import leadRoutes from "./leadsRoutes.js";
import adminUserRoutes from "./adminUserRoutes.js";
import socialMediaRoutes from "./socialMediaRoutes.js";
import digitalMarketingRoutes from "./digitalMarketingRoutes.js";
import appActivityRoutes from "./appActivityRoutes.js";
import overviewRoutes from "./overviewRoutes.js";
const router = Router();

router.use("/leads", leadRoutes);
router.use("/admin-user", adminUserRoutes);
router.use("/social-media", socialMediaRoutes);
router.use("/digital-marketing", digitalMarketingRoutes);
router.use("/app-activity", appActivityRoutes);
router.use("/overview", overviewRoutes);

export default router;
