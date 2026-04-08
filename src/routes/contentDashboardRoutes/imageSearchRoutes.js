import { Router } from "express";

import { multerUpload } from "../../config/multerConfig.js";
import {
  saveImageInVectorDB,
  searchImageByImage,
  searchImageByImageService,
} from "../../controllers/contentDashboardControllers/imageSearchController.js";
const router = new Router();

router.post("/search-image", multerUpload.single("image"), searchImageByImage);
router.post(
  "/search-image-service",
  multerUpload.single("image"),
  searchImageByImageService
);

router.post("/upload", multerUpload.single("image"), saveImageInVectorDB);
export default router;
