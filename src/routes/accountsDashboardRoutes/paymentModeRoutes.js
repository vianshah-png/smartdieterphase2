import Router from "express";
import {
  addPaymentMode,
  changePaymentModeStatus,
  getAllPaymentMode,
  getPaymentModeByGroup,
  updatePaymentModeDetails,
} from "../../controllers/accountsDashboardControllers/paymentModeController.js";

const router = Router();

router.get("/all", getAllPaymentMode);
router.get("/get-mode-by-group", getPaymentModeByGroup);
router.post("/add", addPaymentMode);
router.patch("/update/:id", updatePaymentModeDetails);
router.patch("/change-status/:id", changePaymentModeStatus);

export default router;
