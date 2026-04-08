import Router from "express";
import {
  allTailendClients,
  allTailendClientsCounts,
  tailendDormantNoAdvancePurchaseCount,
  tailendDormantNoAdvancePurchase,
  tailendDormantOdNoAdvancePurchaseCount,
  tailendExpiringThisMonth,
  tailendExpiringThisMonthCount,
  tailendDormantOdNoAdvancePurchase,
  tailendOnholdNoAdvancePurchase,
  tailendOnholdNoAdvancePurchaseCount,
  tailendNoAdvancePurchaseCount,
  tailendNoAdvancePurchase,
  tailendMaitenanceClientsCount,
  tailendMaitenanceClients,
} from "../../controllers/mentorDashboardControllers/tailendClientController.js";

const router = Router();

router.post("/all-clients-count", allTailendClientsCounts);
router.post("/all-clients", allTailendClients);
router.post("/expiring-this-month-count", tailendExpiringThisMonthCount);
router.post("/expiring-this-month", tailendExpiringThisMonth);
router.post(
  "/dormant-no-advance-purchase-count",
  tailendDormantNoAdvancePurchaseCount
);
router.post("/dormant-no-advance-purchase", tailendDormantNoAdvancePurchase);
router.post(
  "/dormant-od-no-advance-purchase-count",
  tailendDormantOdNoAdvancePurchaseCount
);
router.post(
  "/dormant-od-no-advance-purchase",
  tailendDormantOdNoAdvancePurchase
);
router.post(
  "/onhold-no-advance-purchase-count",
  tailendOnholdNoAdvancePurchaseCount
);

router.post("/onhold-no-advance-purchase", tailendOnholdNoAdvancePurchase);
router.post(
  "/tailend-no-advance-purchase-count",
  tailendNoAdvancePurchaseCount
);
router.post("/tailend-no-advance-purchase", tailendNoAdvancePurchase);
router.post("/maitenance-count", tailendMaitenanceClientsCount);
router.post("/maitenance-clients", tailendMaitenanceClients);

export default router;
