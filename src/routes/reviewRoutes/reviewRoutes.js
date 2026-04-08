import { Router } from "express";
import {
  fetchGoogleReview,
  getAllGoogleReviews,
  updateGoogleReview,
} from "../../controllers/reviewsController/reviewsController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
import { validatePageAndLimit } from "../../utils/validators.js";

const router = Router();

router.get("/fetch-google-reviews", fetchGoogleReview);
router.get(
  "/get-all-google-reviews",
  redisMiddleware(`${redisKeys.googleReviews}`),
  validatePageAndLimit,
  getAllGoogleReviews
);
router.patch("/update-google-reviews/:id", updateGoogleReview);

export default router;
