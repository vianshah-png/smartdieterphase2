import { Router } from "express";
import {
  addOrderController,
  editOrderController,
  getAllOrdersController,
  getOrderHistoryByUserId,
  getOrderDetailsById,
  getSubOrderDetailsController,
  sendIdAndPassword,
  updateSubOrderStatus,
  sendWamMail,
  sendInvoiceMail,
  deleteOrderController,
  exportAllOrdersController,
  getOrderLogs,
  getProductOrderHistoryByUserId,
  getAllProductOrdersController,
  addHamper,
  editProductOrderAddress,
  addHamperProductToShip,
  getServiceProgramDetails,
  addServiceProgramOrder,
  addShipyaariOrder,
  addFreeDrStoreOrder,
  addToDoctorStoreManual,
} from "../../controllers/accountsDashboardControllers/orderController.js";
import { addOrUpdateCart, getCart, getCartByShareLink } from "../../controllers/shop/cartController.js";
import { createManualDoctorStoreOrder } from "../../controllers/paymentControllers/productPaymentController.js";

const router = Router();
router.post("/add-order", addOrderController);
router.post("/add-hamper", addHamper);
router.patch("/edit-product-order-address", editProductOrderAddress);
router.post("/add-free-dr-store-order", addFreeDrStoreOrder);
router.post('/add-manual-drstore-order', createManualDoctorStoreOrder);
router.post("/add-shipyaari-order", addShipyaariOrder);
router.post("/add-order-to-drstore", addToDoctorStoreManual);
router.patch("/order-address/:user_id", addHamperProductToShip);
router.post(
  "/get-orders",
  // redisMiddleware(redisKeys.orders),
  getAllOrdersController
);
router.post("/get-product-orders", getAllProductOrdersController);

router.get("/export-orders", exportAllOrdersController);

router.post("/get-sub-order-details", getSubOrderDetailsController);

router.patch("/edit-order", editOrderController);
router.patch("/update-sub-order-status", updateSubOrderStatus);
router.delete("/delete-order", deleteOrderController);
router.get("/get-order-history", getOrderHistoryByUserId);
router.get("/get-product-history", getProductOrderHistoryByUserId);
router.get("/get-order-detail", getOrderDetailsById);
router.get("/order-logs", getOrderLogs);
router.get("/send-id-and-pass", sendIdAndPassword);
router.get("/send-wam-mail", sendWamMail);
router.get("/send-invoice", sendInvoiceMail);
router.post("/add-to-cart", addOrUpdateCart);
router.post("/get-cart", getCart);
router.get("/cart-by-share-link", getCartByShareLink);

// service details
router.get("/service-program-details", getServiceProgramDetails);
router.post("/service-program-order", addServiceProgramOrder);
export default router;
