import { Router } from "express";
import {
  deleteDiet,
  getDietDetailS,
  getDietDetails,
  getDietList,
  setDietStartDate,
  getClientFeedbackQuestions,
  unSendDiet
} from "../../controllers/dietController.js";
import {
  addDietController,
  approveDiet,
  draftDiet,
  editDietController,
  getDietByDietId,
  getDietByUserId,
  sendDiet,
  getCurrentDiet,
  sendDietSms,
  dietPdfLog,
  getDietByDietIds,
} from "../../controllers/dietController/dietController.js";

const router = Router();

router.post("/add-diet", addDietController);
router.patch("/edit-diet", editDietController);
router.post("/get-dietByUserId", getDietByUserId);
router.get("/get-diet-by-id", getDietByDietId);
router.get("/get-diet-by-ids", getDietByDietIds);
router.post("/get-diet-list", getDietList);
router.post("/get-diet-details", getDietDetailS);
// router.post("/get-diet-detailed", getDietDetailS);
router.post("/set-diet-start-date", setDietStartDate);
router.patch("/approve-diet", approveDiet);
router.post("/delete-diet", deleteDiet);
router.post("/unsend-diet", unSendDiet);
router.get("/send-diet", sendDiet);
router.get("/draft-diet", draftDiet);
router.get('/get-current-diet', getCurrentDiet);
router.get('/send-diet-sms',sendDietSms);
router.post('/pdf-log', dietPdfLog);
router.post('/get-client-feedback-questions', getClientFeedbackQuestions);
export default router;