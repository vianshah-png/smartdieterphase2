import { Router } from "express";
import registerRoutes from "./RegistryRoutes.js";
import assessmentRoutes from "./assessmentRoutes.js";
import couponRoutes from "./couponRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import enquiryRoutes from "./enquiryRoutes.js";
import expenseRoutes from "./expenseRoutes.js";
import orderRoutes from "./orderRoutes.js";
import reportsRoutes from "./reportsRoutes.js";
import teamTargetRoutes from "./teamTargetRoutes.js";
// import dashboardRoutes from "./dashboardRoutes.js";
// import expenseRoutes from "./expenseRoutes.js";
import incentivePoolRoutes from "./incentivePoolRoutes.js";
import paymentModeRoutes from "./paymentModeRoutes.js";
import { getAllClients } from "../../helper/common.js";
// import shortProgramAnalyticsRoutes from "./shortProgramAnalyticsRoutes.js";

const router = Router();

router.use("/dashboard", dashboardRoutes);
router.use("/registry", registerRoutes);
router.use("/order", orderRoutes);
router.use("/assessment", assessmentRoutes);
router.use("/enquiry", enquiryRoutes);
router.use("/coupon", couponRoutes);
router.use("/reports", reportsRoutes);
router.use("/team-target", teamTargetRoutes);
router.use("/expense", expenseRoutes);
router.use("/incentive", incentivePoolRoutes);
router.use("/payment-mode", paymentModeRoutes);
router.use("/get-all-clients", getAllClients);

export default router;
