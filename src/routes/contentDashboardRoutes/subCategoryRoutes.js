import Router from "express";
import {
  addSubCategory,
  getAllSubCategories,
  removeSubCategory,
  updateSubCategory,
} from "../../controllers/contentDashboardControllers/subCategoryController.js";
import {
  addSubCategoryValidator,
  validateHandler,
} from "../../utils/validators.js";
const router = Router();

// ? GET method routes
router.get("/all", getAllSubCategories);

// ? POST method routes
router.post("/add", addSubCategoryValidator(), validateHandler, addSubCategory);

// ? PATCH method routes
router.patch("/update/:id", updateSubCategory);

// ? DELETE method routes
router.delete("/remove/:id", removeSubCategory);

export default router;
