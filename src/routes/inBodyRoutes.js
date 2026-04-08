import Router from "express";
import {
  addUser,
  getAllUserDataByToken,
  getDateTimeUserByToken,
  getFullInBodyDataByDateTime,
  getTodayUser,
  inbodyWebHook,
} from "../controllers/inBodyController.js";
const router = Router();
router.post("/add-user", addUser);
router.get("/get-user", getTodayUser);
router.post("/get-user-date-time", getDateTimeUserByToken);
router.post("/get-full-inbody-data", getFullInBodyDataByDateTime);
router.post("/get-all-user-data-by-token", getAllUserDataByToken);
router.post("/web-hook", inbodyWebHook);
export default router;
