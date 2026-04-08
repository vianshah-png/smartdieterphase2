import Router from "express";
import {
  successStoriesStats,
  getCardsStats,
  programColumnData,
  engagementColumnData,
  socialColumnData,
  offerColumnData,
  bulkMail,
} from "../../controllers/contentDashboardControllers/dashboardController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();
router.get("/success-stories-stats", successStoriesStats);
router.get("/cards-stats", redisMiddleware(redisKeys.card), getCardsStats);
router.get("/program-card-count", programColumnData);
router.get("/engagement-card-count", engagementColumnData);
router.get("/social-card-count", socialColumnData);
router.get("/offer-card-count", offerColumnData);
router.post("/bulk-mail", bulkMail);

export default router;
