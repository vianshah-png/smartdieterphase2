import Router from "express";
import {
  todaysRecieved,
  firstReminderMissed,
  secondReminderMissed,
  thirdReminderMissed,
  fourthReminderMissed,
  fifthReminderMissed,
  firstReminderMissedData,
  todaysRecievedData,
  ackHalftimeFeedback,
  ackHalftimeHs,
} from "../../controllers/csDashboardControllers/halftimeJourneyController.js";

const router = Router();

router.get("/halftime-received-today", todaysRecieved);
router.get("/halftime-first-reminder", firstReminderMissed);
router.get("/halftime-second-reminder", secondReminderMissed);
router.get("/halftime-third-reminder", thirdReminderMissed);
router.get("/halftime-fourth-reminder", fourthReminderMissed);
router.get("/halftime-fifth-reminder", fifthReminderMissed);
router.post("/todays-halftime-data", todaysRecievedData);
router.post("/reminder-missed-data", firstReminderMissedData);
router.post("/halftime-hs-ack", ackHalftimeHs);
router.post("/halftime-feedback-ack", ackHalftimeFeedback);


export default router;
