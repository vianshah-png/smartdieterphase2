import { Router } from "express";
import {
  addProgramDocument,
  deleteProgramDocument,
  getAllProgramDocuments,
  updateProgramDocument,
} from "../../controllers/contentDashboardControllers/programDocumentsController.js";
import { multerUpload } from "../../config/multerConfig.js";

const router = Router();

router.post(
  "/add-program-document",
  multerUpload.array("files", 1),
  addProgramDocument
);
router.get("/program-documents", getAllProgramDocuments);
router.patch(
  "/update-program-document/:id",
  multerUpload.array("files", 1),
  updateProgramDocument
);
router.delete("/delete-program-document/:id", deleteProgramDocument);

export default router;
