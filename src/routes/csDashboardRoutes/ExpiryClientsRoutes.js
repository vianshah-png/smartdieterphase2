import { Router } from "express";
import {
  getClientsExpiring,
  getExpiringClientUserData,
} from "../../controllers/csDashboardControllers/ExpiryClientsController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();

router.get("/clients-expiry", getClientsExpiring);
router.post("/clients-expiry-user-data", getExpiringClientUserData);

export default router;
