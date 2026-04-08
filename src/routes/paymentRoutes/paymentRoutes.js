import { Router } from "express";
import {
  createPaymentLinkController,
  verifyPaymentController,
  verifyOrderPaymentController,
  getAllPaymentLinks,
  handleFailedPayments,
  getExpiringPaymentLinks,
  getExpiringPaymentLinksCount,
  upDatePaymentLinkExpiry,
  createRazorPayOrder,
  getBalancePayment,
  updateBalanceAmount,
  createRazorPayOrderForGuidePurchase,
  verifyGuidePaymentController,
  // verifyProductOrderPaymentController,
  createCustomPaymentLink,
  verifyCustomPaymentLink,
  razorpayWebhookController,
  paymentLinkWebhook
} from "../../controllers/paymentControllers/paymentController.js";
import { createProductOrderController } from "../../controllers/paymentControllers/productPaymentController.js";

const router = Router();

router.post('/create-order',createRazorPayOrder);
router.post('/create-product-order',createProductOrderController);
router.post('/create-guide-subscription-order',createRazorPayOrderForGuidePurchase);

router.post("/create-payment-link", createPaymentLinkController);
router.post("/create-custom-payment-link", createCustomPaymentLink);
router.get('/verify-custom-payment-link',verifyCustomPaymentLink)

router.get("/verify", verifyPaymentController);
router.post("/verify-app-payment", verifyOrderPaymentController);
router.post("/verify-product-order-payment", razorpayWebhookController);

router.post('/verify-onhold-payment-link', paymentLinkWebhook );

router.post("/verify-guides-payment", verifyGuidePaymentController);

router.get("/all-payment-links", getAllPaymentLinks);
router.post("/failed-payments", handleFailedPayments);


router.get("/get-expiring-payment-links-count", getExpiringPaymentLinksCount);
router.get("/get-expiring-payment-links", getExpiringPaymentLinks);
router.patch("/extend-payment-link-expiry", upDatePaymentLinkExpiry);
router.get('/get-balance-payment', getBalancePayment)
router.patch('/update-balance-amount',updateBalanceAmount)

export default router;
