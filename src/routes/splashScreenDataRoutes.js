import { Router } from "express";
import {
  getSplashScreenData,
  getNutritionistDetails,
  getEkitList,
  getGetCurrentScreen,
  updateCurrentScreen,
  getCleanseShoppingList,
  getClenaseProgramIngredients,
  getCleanseProgramBenefits,
} from "../controllers/splashScreenController.js";

const router = Router();

router.post("/get-splash-screen-data/:user_id", getSplashScreenData);
router.post("/get-nutritionist-details", getNutritionistDetails);
router.post("/get-ekit-list", getEkitList);
router.get("/get-current-screen", getGetCurrentScreen);
router.patch("/update-current-screen", updateCurrentScreen);
router.post("/get-cleanse-shopping-list", getCleanseShoppingList);
router.get("/cleanse-program-benefits", getCleanseProgramBenefits);
router.post("/cleanse-program-ingredients", getClenaseProgramIngredients);

export default router;
