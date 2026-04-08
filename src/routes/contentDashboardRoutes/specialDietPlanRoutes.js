import Router from "express";
import {
  addSpecialDiet,
  deleteSpecialDiet,
  getSpecialDietPlanById,
  specialDietPlanList,
  updateSpecialDiet,
} from "../../controllers/contentDashboardControllers/specialDietPlanController.js";
import { validatePageAndLimit } from "../../utils/validators.js";
import { multerUpload } from "../../config/multerConfig.js";
const router = Router();

router.get("/all", validatePageAndLimit, specialDietPlanList);
router.post("/add", multerUpload.array("docs", 10), addSpecialDiet);
router.patch("/update/:id", updateSpecialDiet);
router.delete("/delete/:id", deleteSpecialDiet);
router.get("/get-single-diet/:diet_id", getSpecialDietPlanById);

export default router;
