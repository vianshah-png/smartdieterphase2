import { Router } from "express";
import { checkoutPage } from "../controllers/checkoutPageController.js";

const router = Router();

router.post("/get-checkout-page", checkoutPage);

export default router;
