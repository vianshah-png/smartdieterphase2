import Router from "express";
import {
  addSuccessStories,
  changeSuccesStoriesStatus,
  deleteSuccessStories,
  getAllSuccessStories,
  updateSuccessStories,
} from "../../controllers/contentDashboardControllers/successStoriesController.js";
import { multerUpload } from "../../config/multerConfig.js";
import {
  addSuccessStoryValidator,
  validateHandler,
  validatePageAndLimit,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();

router.post(
  "/all",
  // redisMiddleware(redisKeys.sucessStories),
  validatePageAndLimit,
  getAllSuccessStories
);
router.post(
  "/add",
  multerUpload.fields([
    { name: "photo_before", maxCount: 1 },
    { name: "photo_after", maxCount: 1 },
    { name: "photo_before_after", maxCount: 1 },
    { name: "testimonial_video", maxCount: 1 },
  ]),
  // addSuccessStoryValidator(),
  // validateHandler,
  addSuccessStories
);

router.patch(
  "/update/:id",
  multerUpload.fields([
    { name: "photo_before", maxCount: 1 },
    { name: "photo_after", maxCount: 1 },
    { name: "photo_before_after", maxCount: 1 },
    { name: "testimonial_video", maxCount: 1 },
  ]),
  updateSuccessStories
);

router.patch("/change-status/:id", changeSuccesStoriesStatus);
router.delete("/remove/:id", deleteSuccessStories);

export default router;
