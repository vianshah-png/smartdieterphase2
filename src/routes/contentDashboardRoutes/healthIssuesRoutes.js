import { Router } from "express";
import {
  addHealthIssues,
  getHealthIssues,
} from "../../controllers/contentDashboardControllers/healthIssuesController.js";
import {
  addHealthIssueValidator,
  validateHandler,
} from "../../utils/validators.js";

const router = Router();

router.post(
  "/add",
  addHealthIssueValidator(),
  validateHandler,
  addHealthIssues
);
router.get("/all", getHealthIssues);

export default router;
