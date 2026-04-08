import { Router } from "express";
import { pitchedNotPitchedController } from "../../controllers/mentorDashboardControllers/dashboardController.js";
import { futureDietController } from "../../controllers/mentorDashboardControllers/futureDietController.js";
import { sentQueriesController } from "../../controllers/mentorDashboardControllers/sentQueriesController.js";
import { getAllTrainingVideo } from "../../controllers/mentorDashboardControllers/trainingVideoController.js";
import {
  weightReminderCountController,
  weightReminderUserDataController,
} from "../../controllers/mentorDashboardControllers/weightReminderController.js";
import activitiesDoneRoutes from "./activitiesDoneRoutes.js";
import clientBifurcationRoutes from "./clientBifurcationRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import eventsRoutes from "./eventsRoutes.js";
import mentorPaymentRoutes from "./mentorPaymentRoutes.js";
import officeVisitRoutes from "./officeVisitRoutes.js";
import tailendClientRoutes from "./tailendClientRoutes.js";
import unconvertedRoutes from "./unconvertedRoutes.js";
import dashboardLeadRoutes from "./dashboardLeadRoutes.js";
import dashboardLeadRevampRoutes from "./dashboardLeadRevampRoutes.js";
import dashboardOCRoutes from "./dashboardOCRoutes.js";
import milestoneDataRoutes from "./milestoneDataRoutes.js";

const router = Router();

router.use("/dashboard", dashboardRoutes);
router.use("/lead-dashboard", dashboardLeadRoutes);
router.use("/lead-dashboard-revamp", dashboardLeadRevampRoutes);
router.use("/oc-dashboard", dashboardOCRoutes);
router.use("/client-bifurcation", clientBifurcationRoutes);
router.use("/tailend-clients", tailendClientRoutes);
router.use("/events", eventsRoutes);
router.use("/activities-done", activitiesDoneRoutes);
router.use("/unconverted", unconvertedRoutes);
router.get("/pitched-not-pitched", pitchedNotPitchedController);
router.get("/training-video", getAllTrainingVideo);
router.use("/office-visit", officeVisitRoutes);
router.use("/payment-links", mentorPaymentRoutes);
router.get("/sent-queries", sentQueriesController);
router.get("/future-diet", futureDietController);
router.get("/weight-reminder-count", weightReminderCountController);
router.get("/weight-reminder-user-data", weightReminderUserDataController);
router.use("/milestone", milestoneDataRoutes);
export default router;
