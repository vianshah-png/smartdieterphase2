import Router from "express";
import {
  addCuisine,
  getAllCuisines,
  removeCuisine,
  updateCuisine,
} from "../../controllers/contentDashboardControllers/cuisineController.js";
import {
  addCuisineValidator,
  validateHandler,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();

// ? GET method routes
router.get("/all", redisMiddleware(redisKeys.cuisines), getAllCuisines);

//? POST method routes
router.post("/add", addCuisineValidator(), validateHandler, addCuisine);

// ? PATCH method routes
router.patch("/update/:id", updateCuisine);

//? DELETE method routes
router.delete("/remove/:id", removeCuisine);

export default router;
