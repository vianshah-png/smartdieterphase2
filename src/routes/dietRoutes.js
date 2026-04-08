import { Router } from "express";
import {
  getDietDetailS,
  getDietDetails,
  getDietList,
  setDietStartDate,
} from "../controllers/dietController.js";

const router = Router();

router.post("/get-diet-list", getDietList);

router.post("/get-diet-details", getDietDetails);
router.post("/get-diet-detailed", getDietDetailS);
router.post("/set-diet-start-date", setDietStartDate);


export default router;
