import { Router } from "express";
import { getAllEnquiryClients } from "../../controllers/accountsDashboardControllers/enquiryController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();

router.get(
  "/all-enquires",

  getAllEnquiryClients
);

export default router;
