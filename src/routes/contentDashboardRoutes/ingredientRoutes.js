import Router from "express";
import {
  addIngredient,
  deleteIngredients,
  editIngredient,
  getAllIngredients,
  getAllBnIngredients,
} from "../../controllers/contentDashboardControllers/ingredientsController.js";

const router = Router();

// ? GET method routes
router.get("/all", getAllIngredients);

router.get("/alls", getAllBnIngredients);

// ? POST method routes
router.post("/add", addIngredient);

// ? PATCH method routes
router.patch("/update/:id", editIngredient);

// //? DELETE method routes
router.delete("/delete/:id", deleteIngredients);
export default router;
