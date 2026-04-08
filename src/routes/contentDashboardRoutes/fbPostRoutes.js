import Router from "express";
import {
  addFbPost,
  changeFbPostStatus,
  deleteFbPost,
  getAllFbPost,
  updateFbPost,
} from "../../controllers/contentDashboardControllers/fbPostController.js";
import { multerUpload } from "../../config/multerConfig.js";
import { addFbPostValidator, validateHandler } from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();

router.get("/all", redisMiddleware(redisKeys.fbposts), getAllFbPost);

router.post(
  "/add",
  multerUpload.array("files", 5),
  addFbPostValidator(),
  validateHandler,
  addFbPost
);

router.patch("/update/:id", multerUpload.array("files", 5), updateFbPost);

router.patch("/change-status/:id", changeFbPostStatus);

router.delete("/remove/:id", deleteFbPost);

export default router;
