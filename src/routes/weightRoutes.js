import { Router } from "express";
import {
  getWeightList,
  addWeight,
  editWeight,
  getWeightListLead,
  addWeightLead,
  deleteWeight,
  ackWeight,
  ackLeadWeight,
} from "../controllers/weightController.js";
const router = Router();

router.post("/get-weight-list", getWeightList);
router.post("/add-weight", addWeight);
router.patch("/edit-weight", editWeight);
router.patch("/ack-weight", ackWeight);
router.patch("/ack-lead-weight", ackLeadWeight);
router.delete("/delete-weight",deleteWeight);
router.post("/get-weight-list-lead", getWeightListLead);
router.post("/add-weight-lead", addWeightLead);

export default router;
