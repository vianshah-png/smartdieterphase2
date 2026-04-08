import { Router } from "express";
import {
  addClaraQNA,
  claraQnACategories,
  deleteClaraQNA,
  getAllClaraQNA,
  updateClaraQNA,
} from "../controllers/claraQNAController.js";

const router = Router();

router.get("/get-all-clara-qna", getAllClaraQNA);
router.get("/get-all-clara-qna-categories", claraQnACategories);

router.post("/add-clara-qna", addClaraQNA);

router.patch("/update-clara-qna", updateClaraQNA);
router.delete("/delete-clara-qna", deleteClaraQNA);

export default router;
