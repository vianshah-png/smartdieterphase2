import { Router } from "express";
import {
  addConsultation,
  bookConsultation,
  updatePaymentStatus,
  checkSlots,
  addConsultationForPaymentDone,
  checkPaymentStatus,
} from "../controllers/dubaiConsultationController.js";
import {
  addWorkshop,
  updateWorkshopPaymentStatus,
  workShopCount,
  addWorkShopFree,
  addWorkShopInstagram,
  addWorkShopPaymentDone,
} from "../controllers/dubaiWorkshopController.js";

const router = Router();

router.post("/add-consultation", addConsultation);
router.post("/add-consultation-payment-done", addConsultationForPaymentDone);
router.post("/add-workshop", addWorkshop);
router.post("/add-workshop-payment-done", addWorkShopPaymentDone);
router.post("/add-workshop-free", addWorkShopFree);
router.post("/add-workshop-insta", addWorkShopInstagram);
router.post("/book-consultation", bookConsultation);
router.get("/check-slots", checkSlots);
router.patch("/update-payment-status", updatePaymentStatus);
router.patch("/update-workshop-payment-status", updateWorkshopPaymentStatus);
router.post("/add-workshop", addWorkshop);
router.get("/workshop-count", workShopCount);
router.get("/check-payment-status", checkPaymentStatus);

export default router;
