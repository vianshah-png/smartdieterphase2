import { Router } from "express";
import {
  addNewRecipe,
  getAllRecipes,
  updateRecipes,
  changeRecipeStatus,
  deleteRecipe,
  searchRecipeTitles,
  increaseRecipeViewCount,
  searchAllergies,
  getAllRecipesTest,
} from "../../controllers/contentDashboardControllers/recipeController.js";

import { multerUpload } from "../../config/multerConfig.js";
import {
  addRecipeValidator,
  validateHandler,
  validatePageAndLimit,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();
// ? GET method routes
router.post("/all", redisMiddleware(redisKeys.recipes), getAllRecipes);
router.post("/all-test", redisMiddleware(redisKeys.recipes), getAllRecipesTest);
router.get("/search-recipes", searchRecipeTitles);
router.get("/search-allergies", searchAllergies);

//? POST method routes
router.post(
  "/add",
  multerUpload.fields([
    { name: "recipe_images", maxCount: 5 },
    { name: "recipe_thumbnail_images", maxCount: 5 },
    { name: "recipe_video", maxCount: 5 },
  ]),
  validatePageAndLimit,
  addNewRecipe
);

router.patch(
  "/update/:id",
  multerUpload.fields([
    { name: "recipe_images", maxCount: 5 },
    { name: "recipe_video", maxCount: 5 },
  ]),
  updateRecipes
);
router.patch("/increase-view", increaseRecipeViewCount);
router.patch("/change-status/:id", changeRecipeStatus);

router.delete("/remove/:id", deleteRecipe);
export default router;
