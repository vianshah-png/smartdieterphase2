import Router from "express";
import {
  addBlogPost,
  changeBlogStatus,
  deleteBlogs,
  getAllBlogs,
  increaseBlogsViewCount,
  updateBlogs,
} from "../../controllers/contentDashboardControllers/blogPostController.js";
import { multerUpload } from "../../config/multerConfig.js";
import {
  addBlogPostValidator,
  validateHandler,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();

router.post("/all", redisMiddleware(redisKeys.blogs), getAllBlogs);

router.post(
  "/add",
  multerUpload.fields([
    { name: "postBannerBig", maxCount: 5 },
    { name: "postBannerSmall", maxCount: 5 },
    // { name: "images", maxCount: 5 },
  ]),
  // addBlogPostValidator(),
  // validateHandler,
  addBlogPost
);

router.patch(
  "/update/:id",
  multerUpload.fields([
    { name: "postBannerBig", maxCount: 1 },
    { name: "postBannerSmall", maxCount: 1 },
    { name: "images", maxCount: 1 },
  ]),
  updateBlogs
);

router.patch("/increase-view", increaseBlogsViewCount);

router.patch("/change-status/:id", changeBlogStatus);

router.delete("/remove/:id", deleteBlogs);

export default router;
