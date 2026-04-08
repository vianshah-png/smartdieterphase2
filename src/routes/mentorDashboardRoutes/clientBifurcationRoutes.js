import Router from "express";
import {
  allClients,
  getStackWiseClientsCount,
  getStackWiseClients,
  allClient,
  allActiveNoAdvancePurchaseClient,
  activeClient,
  cleanseClient,
  dormantClient,
  onholdClient,
  notStartedClient,
  dormantODClient,
  onholdODClient,
  notStartedODClient,
  OCRCompletedClient,
  OCRFClient,
  OCRDropoutClient,
  OCRAllClient,
  allActiveClient,
  OCRMaintanenceClient,
  getUpcomingBirthdayUsers,
} from "../../controllers/mentorDashboardControllers/clientBifurcation.js";
const router = Router();
router.post("/all-clients", allClients); 
router.post("/all-client", allClient);
router.post(
  "/all-client-no-advance-purchase",
  allActiveNoAdvancePurchaseClient
);
router.post("/active-client", activeClient);
router.post("/all-active-client", allActiveClient);
router.post("/cleanse-client", cleanseClient);
router.post("/dormant-client", dormantClient);
router.post("/dormant-od-client", dormantODClient);
router.post("/onhold-client", onholdClient);
router.post("/onhold-od-client", onholdODClient);
router.post("/not-started-client", notStartedClient);
router.post("/not-started-od-client", notStartedODClient);
router.post("/ocr-all-client", OCRAllClient);
router.post("/ocr-completed-client", OCRCompletedClient);
router.post("/ocr-dropout-client", OCRDropoutClient);
router.post("/ocr-maintenance-client", OCRMaintanenceClient);
router.post("/ocrf-client", OCRFClient);
router.post("/stack-wise-clients", getStackWiseClients);
router.post("/stack-wise-client-counts", getStackWiseClientsCount);
router.post("/upcoming-birthday-users", getUpcomingBirthdayUsers);
export default router;
