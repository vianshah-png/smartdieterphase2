import Router from "express";

import { validatePageAndLimit } from "../../utils/validators.js";
import {
  addIncentivePool,
  deleteIncentiveRecord,
  getIncentiveList,
  getTotalAmount,
} from "../../controllers/accountsDashboardControllers/incentivePoolController.js";

const router = Router();

router.get("/all", getIncentiveList);
router.post("/add", validatePageAndLimit, addIncentivePool);
router.delete("/delete/:id", deleteIncentiveRecord);
router.get("/get-month-total", getTotalAmount);

export default router;
