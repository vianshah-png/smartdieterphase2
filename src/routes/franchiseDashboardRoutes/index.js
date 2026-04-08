import { Router } from "express";
import countryWiseSalesDashboardRoutes from "./countryWiseSalesDashboardRoutes.js";

const router = Router();

router.use("/country-wise-sales", countryWiseSalesDashboardRoutes);
export default router;
