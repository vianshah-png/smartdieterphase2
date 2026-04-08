import { Router } from "express";
import { getRecipeChapterList,addChapter,addRecipeToChapter,getRecipeListForChapter, deleteChapter, deleteRecipesFromChapter } from "../controllers/recipeBookController.js";

const router = Router();

router.post("/get-recipe-chapter-list", getRecipeChapterList);
router.post("/add-chapter",addChapter);
router.post("/add-recipe-to-chapter",addRecipeToChapter);
router.post("/get-recipe-list-for-chapter",getRecipeListForChapter);
router.post("/delete-chapter",deleteChapter);
router.post("/delete-recipe-from-chapter",deleteRecipesFromChapter);

export default router;
