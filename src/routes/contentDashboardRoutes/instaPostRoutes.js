import Router from "express";
import {
  addInstaPost,
  changeInstaPostStatus,
  deleteInstaPost,
  getAllInstaPost,
  updateInstaPost,
} from "../../controllers/contentDashboardControllers/instaPostController.js";
import { multerUpload } from "../../config/multerConfig.js";
import {
  addInstaPostValidator,
  validateHandler,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();

router.get("/all", redisMiddleware(redisKeys.instaPosts), getAllInstaPost);

router.post(
  "/add",
  multerUpload.array("files", 5),
  addInstaPostValidator(),
  validateHandler,
  addInstaPost
);

router.patch("/update/:id", multerUpload.array("files", 5), updateInstaPost);

router.patch("/change-status/:id", changeInstaPostStatus);

router.delete("/remove/:id", deleteInstaPost);

export default router;
