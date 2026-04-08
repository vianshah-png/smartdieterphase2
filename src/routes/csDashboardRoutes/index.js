import { Router } from "express";
import { updateCallDetails } from "../../controllers/csDashboardControllers/InductionFlowController.js";
import { getClientData } from "../../helper/common.js";
import ExpiryClientsRoutes from "./ExpiryClientsRoutes.js";
import InductionFlowRoutes from "./InductionFlowRoutes.js";
import MaintainenceRoutes from "./MaintainenceRoutes.js";
import OcClientRoutes from "./OcClientsRoutes.js";
import OverallPendingRoutes from "./OveralPendingRoutes.js";
import halftimeJourneyRoutes from "./halftimeJourneyRoutes.js";
import reminderRoutes from "./remindRoutes.js";
import tailendJourneyRoutes from "./tailendJourneyRoutes.js";
const router = Router();

router.use("/induction-flow", InductionFlowRoutes);
router.use("/overall-pending", OverallPendingRoutes);
router.use("/expiry-clients", ExpiryClientsRoutes);
router.use("/oc-clients", OcClientRoutes);
router.use("/maintenance", MaintainenceRoutes);
router.use("/halftime-journey", halftimeJourneyRoutes);
router.use("/tailend-journey", tailendJourneyRoutes);
router.post("/get-client-data", getClientData);
router.patch("/update-cs-call-details", updateCallDetails);
router.use("/reminders", reminderRoutes);

export default router;

// index.js