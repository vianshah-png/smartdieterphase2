import { Router } from "express";
import {
  appHomePage,
  appLeadHomePage,
  donGet,
  extendProgram,
  getSidemenuData,
  goProSection,
  notificationCounts,
  updateTipLog,
} from "../controllers/homePageController.js";

const router = Router();

router.post("/get-sidemenu-data", getSidemenuData);
router.post("/get-rewards", donGet);
router.get("/home-page", appHomePage);
router.patch("/update-tip-log", updateTipLog);
router.get("/lead-home-page", appLeadHomePage);
router.get("/go-pro-section", goProSection);
router.get("/extend-program", extendProgram);
router.get("/get-notification-counts", notificationCounts);

export default router;
