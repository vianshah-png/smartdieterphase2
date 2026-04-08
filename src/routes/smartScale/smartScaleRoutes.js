import Router from "express";
import { acknowledgeSmartScaleWeightData, getSmartScaleData, submitSmartScaleData } from "../../controllers/smartScaleController/smartScaleController.js";
const router = Router();

router.post(
  '/submit-data',
  submitSmartScaleData
);

router.get(
  '/weight-data-by-user-id',
  getSmartScaleData
);

router.patch(
  '/acknowledge-weight-data/:id',
  acknowledgeSmartScaleWeightData
);


export default router;