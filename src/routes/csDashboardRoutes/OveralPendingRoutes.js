import { Router } from "express";
import {
  AppNotUpdatedClientsCount,
  appnotUpdatedClientUserData,
  getClientNotStartedCount,
  getClientNotStartedUserData,
  getClientOnBreakCount,
  getClientsAdvancedPurchase,
  getClientsBalanceDue,
  getClientsServiceCallNotDone,
  getClientsWeightReceivedDietNotSentCount,
  getDormancyClientCount,
  getDormancyClientUserData,
  getClientOnholdUserData,
  updateOnholdEndDate,
  getClientsWeightReceivedDietNotSentUserData,
  getClientsServiceCallNotDoneUserData,
  getClientsAdvancedPurchaseUserData,
  getClientsBalanceDueUserData,
  UpdateBalanceDueDate,
} from "../../controllers/csDashboardControllers/OverallPendingController.js";
import { redisKeys } from "../../helper/constant.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";

const router = Router();

router.get("/client-app-not-updated-client-counts", AppNotUpdatedClientsCount);
router.post(
  "/client-app-not-updated-client-user-data",
  redisMiddleware(redisKeys.appNotUpdatedClients),
  appnotUpdatedClientUserData
);
router.get(
  "/client-dormancy-count",
  redisMiddleware(redisKeys.dormantClientsCount),
  getDormancyClientCount
);
router.post("/client-dormancy-user-data", getDormancyClientUserData);
router.get(
  "/client-not-started-count",
  redisMiddleware(redisKeys.notStartedClients),
  getClientNotStartedCount
);
router.post("/client-not-started-user-data", getClientNotStartedUserData);
router.get(
  "/client-onhold-client",
  redisMiddleware(redisKeys.ClientOnBreakCount),
  getClientOnBreakCount
);
router.post("/client-onhold-user-data", getClientOnholdUserData);
router.patch("/update-onhold-end-date", updateOnholdEndDate);
router.get(
  "/client-weight-received-diet-not-sent",
  redisMiddleware(redisKeys.ClientsWeightReceivedDietNotSentCount),
  getClientsWeightReceivedDietNotSentCount
);
router.post(
  "/client-weight-received-diet-not-sent-user-data",
  redisMiddleware(redisKeys.ClientsWeightReceivedDietNotSentCount),
  getClientsWeightReceivedDietNotSentUserData
);
router.get(
  "/client-service-call-not-done",
  redisMiddleware(redisKeys.ClientServiceCallNotDone),
  getClientsServiceCallNotDone
);
router.post(
  "/client-service-call-not-done-user-data",
  redisMiddleware(redisKeys.ClientServiceCallNotDone),
  getClientsServiceCallNotDoneUserData
);
router.get(
  "/client-advance-purchase-active-notActive",
  redisMiddleware(redisKeys.ClientsWithAdvancePurchase),
  getClientsAdvancedPurchase
);
router.post(
  "/client-advance-purchase-active-notActive-user-data",
  redisMiddleware(redisKeys.ClientsWithAdvancePurchase),
  getClientsAdvancedPurchaseUserData
);
router.get(
  "/client-balance-due",
  redisMiddleware(redisKeys.ClientsBalanceDue),
  getClientsBalanceDue
);
router.post("/client-balance-due-user-data", getClientsBalanceDueUserData);

router.patch("/update-balance-due-date", UpdateBalanceDueDate);

export default router;
