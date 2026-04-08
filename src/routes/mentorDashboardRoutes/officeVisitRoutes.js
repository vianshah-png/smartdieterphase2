import { Router } from "express";
import {
  addOfficeVisit,
  getOfficeVisits,
} from "../../controllers/mentorDashboardControllers/officeVisitController.js";

const router = Router();

router.post("/get-visits", getOfficeVisits);
router.post("/add-visit", addOfficeVisit);

export default router;
