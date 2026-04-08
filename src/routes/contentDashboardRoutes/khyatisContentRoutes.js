import { Router } from "express";
import {
  addKhyatisContent,
  changeKhyatisContentStatus,
  deleteKhyatisContent,
  getContentUsageHistory,
  getKhyatisContent,
  updateKhyatisContent,
  useContent,
} from "../../controllers/contentDashboardControllers/khyatisContentController.js";
const router = Router();

router.post("/add-content", addKhyatisContent);
router.post("/get-content", getKhyatisContent);
router.post("/content-usage-history", getContentUsageHistory);
router.post("/use-content/:id", useContent);
router.patch("/update-content/:id", updateKhyatisContent);
router.patch("/change-content-status/:id", changeKhyatisContentStatus);
router.delete("/delete-content/:id", deleteKhyatisContent);
export default router;
