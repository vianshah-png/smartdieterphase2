import { Router } from "express";
import {
  addNewGoodMail,
  getGoodMail,
  updateGoodMail,
  deleteGoodMail,
} from "../../controllers/contentDashboardControllers/goodMailController.js";

const router = Router();

router.post("/add", addNewGoodMail);
router.post("/all", getGoodMail);
router.patch("/update/:id", updateGoodMail);
router.delete("/remove/:id", deleteGoodMail);

export default router;
