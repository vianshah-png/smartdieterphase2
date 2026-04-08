import Router from "express";
import { multerUpload } from "../config/multerConfig.js";
import {
  uploadAnyFile,
  uploadSingleImage,
} from "../controllers/uploadSingleImage.js";
const router = Router();

router.post("/upload-image", multerUpload.single("image"), uploadSingleImage);
router.post("/upload-files", multerUpload.array("files", 10), uploadAnyFile);

export default router;
