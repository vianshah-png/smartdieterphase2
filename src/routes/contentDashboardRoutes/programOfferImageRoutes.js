import Router from "express";
import { multerUpload } from "../../config/multerConfig.js";
import {
  addProgramOfferImages,
  deleteProgramOfferImages,
  editProgramOfferImages,
  getAllProgramOfferImages,
} from "../../controllers/contentDashboardControllers/programOfferImageController.js";

const router = Router();
router.post("/all", getAllProgramOfferImages);

router.post("/add", multerUpload.array("images", 20), addProgramOfferImages);
router.patch(
  "/update/:id",
  multerUpload.array("images", 20),
  editProgramOfferImages
);
router.delete("/delete/:id", deleteProgramOfferImages);
export default router;
