import { Router } from "express";
import {
  addCouponController,
  changeCouponStatus,
  getAllCoupons,
  deleteCoupon,
} from "../../controllers/accountsDashboardControllers/couponController.js";

const router = Router();

router.post("/add-coupon", addCouponController);
router.get("/get-all-coupons", getAllCoupons);
router.patch("/update-status/:coupon_id", changeCouponStatus);
router.delete("/delete-coupon/:coupon_id", deleteCoupon);

export default router;
