import { Router } from "express";
import {
  allowGuideForUserId,
  allowResourceForLead,
  allResourcesForLead,
  getAllGuides,
  removeResourceForLead,
} from "../../controllers/guideController/guideController.js";

const router = Router();

router.get("/get-all-guides", getAllGuides);
router.get("/lead-resources/:user_id", allResourcesForLead);
router.patch("/allow-guide", allowGuideForUserId);
router.patch("/allow-resource-for-leads/:user_id", allowResourceForLead);
router.patch("/remove-resource-for-leads/:user_id", removeResourceForLead);

export default router;
