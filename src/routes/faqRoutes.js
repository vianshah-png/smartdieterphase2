import { Router } from "express";
import {
  addFAQ,
  deleteFAQ,
  getAllFAQ,
  updateFAQ,
} from "../controllers/faqController.js";

const router = Router();

router.get("/get-all-faq", getAllFAQ);

router.post("/add-faq", addFAQ);

router.patch("/update-faq", updateFAQ);

router.delete("/delete-faq", deleteFAQ);

export default router;
