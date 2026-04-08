import { Router } from "express";
import {
  getInchList,
  addInch,
  editInch,
  deleteInch,
  ackInch,
} from "../controllers/inchController.js";
const router = Router();

router.post("/get-inch-list", getInchList);
router.post("/add-inch", addInch);
router.patch("/ack-inch", ackInch);
router.patch("/edit-inch", editInch);
router.delete("/delete-inch", deleteInch);

export default router;
