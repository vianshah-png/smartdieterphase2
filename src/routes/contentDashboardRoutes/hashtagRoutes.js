import Router from "express";
import {
  addHashtag,
  deleteHashtag,
  getAllHashtags,
  updateTag,
} from "../../controllers/contentDashboardControllers/hashtagController.js";
import {
  addHashtagValidator,
  validateHandler,
} from "../../utils/validators.js";

const router = Router();

router.get("/all", getAllHashtags);

router.post("/add", addHashtagValidator(), validateHandler, addHashtag);

router.patch("/update/:id", updateTag);

router.delete("/remove/:id", deleteHashtag);

export default router;
