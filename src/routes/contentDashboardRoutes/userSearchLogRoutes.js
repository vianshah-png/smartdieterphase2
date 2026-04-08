import Router from "express";
import { getUserSearchLog } from "../../controllers/contentDashboardControllers/userSearchLogController.js";

const router = Router();

router.get("/get-user-logs/:userId", getUserSearchLog);
export default router;
