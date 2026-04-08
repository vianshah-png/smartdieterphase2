import { Router } from "express";
import {
  getTotalOcClients,
  getAndroidOcClients,
  getIosOcClients,
  getOCClientsUserData,
  getOCAppClientsUserData,
} from "../../controllers/csDashboardControllers/OcClientsController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();

router.get(
  "/total-oc-client",
  redisMiddleware(redisKeys.totalOc),
  getTotalOcClients
);
router.get(
  "/android-oc-client",
  redisMiddleware(redisKeys.AndroidOcClients),
  getAndroidOcClients
);
router.get(
  "/ios-oc-client",
  redisMiddleware(redisKeys.iosOcClients),
  getIosOcClients
);

router.post("/get-OC-clients-user-data", getOCClientsUserData);
router.post("/get-OC-clients-app-user-data", getOCAppClientsUserData);

export default router;
