import Router from "express";
import { multerUpload } from "../../config/multerConfig.js";
import {
  addProgramStatsImages,
  deleteProgramStatsImages,
  editProgramStatsImages,
  getAllProgramStatsImages,
} from "../../controllers/contentDashboardControllers/programStatsImagesController.js";

const router = Router();
router.get("/all", getAllProgramStatsImages);

router.post("/add", multerUpload.array("images", 20), addProgramStatsImages);
router.patch(
  "/update/:id",
  multerUpload.array("images", 20),
  editProgramStatsImages
);
router.delete("/delete/:id", deleteProgramStatsImages);
export default router;
