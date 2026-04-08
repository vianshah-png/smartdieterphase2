import Router from "express";

import { multerUpload } from "../../config/multerConfig.js";
import {
  addRawVideos,
  changeUsedStatus,
  getAllVideos,
  removeVideo,
  updateRawVideos,
} from "../../controllers/contentDashboardControllers/rawVideosController.js";

const router = Router();
router.get("/all", getAllVideos);
router.post("/add", multerUpload.array("files", 5), addRawVideos);
router.patch("/update/:id", multerUpload.array("files", 5), updateRawVideos);
router.patch("/change-status/:id", changeUsedStatus);
router.delete("/remove/:id", removeVideo);
export default router;
