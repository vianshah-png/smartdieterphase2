import Router from "express";
import {
  addDraft,
  getAllDrafts,
  editDraft,
  deleteDraft,
} from "../../controllers/contentDashboardControllers/draftsController.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";
import { multerUpload } from "../../config/multerConfig.js";
import { validatePageAndLimit } from "../../utils/validators.js";

const router = Router();
router.post(
  "/all",
  redisMiddleware(redisKeys.drafts),
  validatePageAndLimit,
  getAllDrafts
);
router.post("/add", multerUpload.array("image", 1), addDraft);
router.patch("/update/:id", editDraft);
router.delete("/remove/:id", deleteDraft);

export default router;
