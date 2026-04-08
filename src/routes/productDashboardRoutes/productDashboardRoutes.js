import Router from "express";

//controller imports 
import { getProductDashboardOverview, getProductDashboardData, getExportExcelProductDashboardData, markNetSettledForFinancialYear, getExportExcelCartDashboardData, updateAwbNumberByRazporpayId, updateProductDeliveryStatus, updateProductOrderDetails, addZeroInvoiceOrder } from "../../controllers/productDashboardController/productDashboardController.js";

const router = Router();

router.post("/get-product-dashboard-overview", getProductDashboardOverview);
router.post("/get-product-dashboard-table-data", getProductDashboardData);
router.get('/get-purchase-data-excel', getExportExcelProductDashboardData);
router.patch('/update-awb-number', updateAwbNumberByRazporpayId);
router.get('/get-cart-user-data-excel', getExportExcelCartDashboardData);
router.patch('/mark-net-settled', markNetSettledForFinancialYear);
router.get('/update-order-status', updateProductDeliveryStatus);

router.patch('/update-product-order-details', updateProductOrderDetails); 
router.post('/add-zero-invoice-order', addZeroInvoiceOrder)

export default router;
  