import { Router } from "express";
import {
  getActivePaymentLinks,
  getExpiredPaymentLinks,
} from "../../controllers/mentorDashboardControllers/mentorPaymentLinksController.js";

const router = Router();

router.get("/get-active-payment-links", getActivePaymentLinks);
router.get("/get-expired-payment-links", getExpiredPaymentLinks);

export default router;
