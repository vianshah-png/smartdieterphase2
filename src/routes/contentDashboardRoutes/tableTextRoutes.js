import { Router } from "express";
import {
  addTableText,
  deleteTableText,
  getAllTableText,
  updateTableText,
} from "../../controllers/contentDashboardControllers/tableTextController.js";

const router = Router();

router.get("/all", getAllTableText);
router.post("/add", addTableText);
router.patch("/update/:id", updateTableText);
router.delete("/delete/:id", deleteTableText);

export default router;
