import { Router } from "express";
import {
  addRecipeType,
  getRecipeType,
  updateRecipeType,
  removeRecipeType,
} from "../../controllers/contentDashboardControllers/recipeTypeController.js";
import { multerUpload } from "../../config/multerConfig.js";

const router = Router();

router.post("/add", multerUpload.array("icon", 1), addRecipeType);
router.get("/all", getRecipeType);
router.patch("/update/:id", multerUpload.array("icon", 1), updateRecipeType);
router.delete("/remove/:id", removeRecipeType);
export default router;
