import Router from "express";
import {
  addProgramSession,
  deleteProgramSession,
  getAllProgramSessions,
  updateProgramSession,
  updateStatus,
} from "../../controllers/contentDashboardControllers/programSessionController.js";
import { redisKeys } from "../../helper/constant.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";

const router = Router();

router.get(
  "/all",
  redisMiddleware(redisKeys.programSession),
  getAllProgramSessions
);

router.post(
  "/add",

  addProgramSession
);

router.patch("/update/:id", updateProgramSession);

router.patch("/update-status", updateStatus);

router.delete("/remove/:id", deleteProgramSession);
export default router;
