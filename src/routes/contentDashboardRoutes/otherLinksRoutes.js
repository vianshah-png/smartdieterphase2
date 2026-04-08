import { Router } from "express";
import {
  addNewLinks,
  deleteLinks,
  getAllLinks,
  updateLinks,
} from "../../controllers/contentDashboardControllers/otherLinksController.js";

const router = Router();

router.post("/add", addNewLinks);
router.get("/all", getAllLinks);
router.patch("/update/:id", updateLinks);
router.delete("/remove/:id", deleteLinks);

export default router;
