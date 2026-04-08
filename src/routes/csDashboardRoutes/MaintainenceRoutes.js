import { Router } from "express";
import {
  getAllMaintainenceClients,
  getAllMaintainenceWeightsODCounts,
  getMaintenanceWeightODData,
  getAllMaintainenceClientsUserData,
  getMaintenanceList,
} from "../../controllers/csDashboardControllers/MaintainenceController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();

router.get(
  "/all-maintainence-clients",
  redisMiddleware(redisKeys.AllMaintainenceClients),
  getAllMaintainenceClients
);
router.post(
  "/all-maintainence-clients-user-data",
  redisMiddleware(redisKeys.AllMaintainenceClients),
  getAllMaintainenceClientsUserData
);
router.get("/weight-od-counts", getAllMaintainenceWeightsODCounts);
router.post("/weight-od-data", getMaintenanceWeightODData);

router.get("/get-maintenance-list", getMaintenanceList);

export default router;
