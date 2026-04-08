import Router from "express";
import {
  ackGoals,
  ackMilestone,
  ackOcHs,
  ackTailendFeedback,
  ackTailendHs,
  remindersMissedData,
  tailendJourneyDataReceivedToday,
  tailendJourneyFifthReminderMissed,
  tailendJourneyFirstReminderMissed,
  tailendJourneyFourthReminderMissed,
  tailendJourneySecondReminderMissed,
  tailendJourneyThirdReminderMissed,
  todaysRecievedData,
} from "../../controllers/csDashboardControllers/tailendJourneyController.js";

const router = Router();
router.get("/todays-received-data", tailendJourneyDataReceivedToday);
router.get("/first-reminder-missed-count", tailendJourneyFirstReminderMissed);
router.get("/second-reminder-missed-count", tailendJourneySecondReminderMissed);
router.get("/third-reminder-missed-count", tailendJourneyThirdReminderMissed);
router.get("/fourth-reminder-missed-count", tailendJourneyFourthReminderMissed);
router.get("/fifth-reminder-missed-count", tailendJourneyFifthReminderMissed);
router.post("/get-todays-received-data", todaysRecievedData);
router.post("/reminder-missed-data", remindersMissedData);
router.post("/tailend-hs-ack", ackTailendHs);
router.post("/tailend-oc-hs-ack", ackOcHs);
router.post("/tailend-feedback-ack", ackTailendFeedback);
router.post("/tailend-goal-ack", ackGoals);
router.post("/tailend-milestone-ack", ackMilestone);

export default router;
