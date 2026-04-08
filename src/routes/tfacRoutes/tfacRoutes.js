import Router from "express";
// import { addProduct, getShopProducts, getProductById, updateProduct, deleteProduct, getAllProducts, getPackSize, addPackSize } from "../../controllers/productDashboardController/productController.js";
import multer from "multer";
import {
    // addOrder,
     getAllOrders, getCustomers } from "../../controllers/tfacController/tfacController.js";
import { addOrder, verifyPayment, checkPaymentStatus} from "../../controllers/tfacController/tfacPaymentController.js";


const router = Router();

router.post('/add-order', addOrder);
router.post('/verify-payment', verifyPayment);
router.get('/status/:paymentId', checkPaymentStatus)

router.get('/get-customers', getCustomers);
router.get('/get-orders', getAllOrders);

export default router;
