import { Router } from "express";
import {
    getIngredientCategoryList,
    getIngredientsList,
    submitIngredientChecklist
} from "../controllers/ingredientChecklistController.js";
const router = Router();

router.post("/get-ingredient-category", getIngredientCategoryList);
router.post("/get-ingredient-list", getIngredientsList);
router.post("/submit-ingredient-checklist",submitIngredientChecklist);


export default router;
