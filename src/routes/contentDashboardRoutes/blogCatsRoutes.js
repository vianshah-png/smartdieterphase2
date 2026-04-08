import { Router } from "express";
import {
  addBlogCategory,
  deleteBlogCategory,
  getAllBlogCategory,
} from "../../controllers/contentDashboardControllers/blogPostCategoryController.js";

const router = Router();

router.get("/all", getAllBlogCategory);
router.post("/add", addBlogCategory);
router.delete("/remove/:id", deleteBlogCategory);

export default router;
