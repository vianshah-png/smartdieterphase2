import Router from "express";
import {
  addSocialPost,
  deleteSocialPost,
  editSocialPost,
  getAllSocialPost,
  getPostNames,
  getVideoById
} from "../../controllers/contentDashboardControllers/socialPostController.js";
import { multerUpload } from "../../config/multerConfig.js";
import { validatePageAndLimit } from "../../utils/validators.js";
const router = Router();

router.post("/all", validatePageAndLimit, getAllSocialPost);
router.post(
  "/add",
  multerUpload.fields([
    { name: "image", maxCount: 5 },
    { name: "video", maxCount: 5 },
    { name: "thumbnail_image", maxCount: 5 },
  ]),
  addSocialPost
);

router.patch(
  "/update/:id",
  multerUpload.fields([
    { name: "image", maxCount: 5 },
    { name: "video", maxCount: 5 },
    { name: "thumbnail_image", maxCount: 5 },
  ]),
  editSocialPost
);

router.delete("/remove/:id", deleteSocialPost);
router.get("/post-names", getPostNames);
router.post("/get-video-by-id", getVideoById);

export default router;
