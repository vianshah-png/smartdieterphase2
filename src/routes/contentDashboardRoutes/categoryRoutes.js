import Router from "express";
import {
  addCategory,
  getAllCategories,
  getCategoryAndSubCategory,
  removeCategory,
  updateCategory,
  getAllType,
} from "../../controllers/contentDashboardControllers/categoryController.js";
import {
  addCategoryValidator,
  validateHandler,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
const router = Router();

// ? GET method routes
router.get("/all", redisMiddleware(redisKeys.categories), getAllCategories);

router.get("/type", getAllType);

router.get("/categories-with-subcategories", getCategoryAndSubCategory);

// ? POST method routes
router.post("/add", addCategoryValidator(), validateHandler, addCategory);

// ? PATCH method routes
router.patch("/update/:id", updateCategory);

//? DELETE method routes
router.delete("/remove/:id", removeCategory);
export default router;
