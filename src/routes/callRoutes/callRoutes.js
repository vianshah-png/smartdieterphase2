import { Router } from "express";
import {
  callRecordingController,
  getCallStatusController,
  getCallsByProgramController,
  twilioTokenGeneratorController,
  voiceController,
  getClientCallStatusController,
  getLatestUserCallScheduled,
  makeDashboardCallExotel,
  checkOrRegisterExotelAgent,
} from "../../controllers/callsController/callController.js";

const router = Router();
router.post("/voice", voiceController);
router.post("/token", twilioTokenGeneratorController);
router.get("/call-status", getCallStatusController);
router.post("/call-recording", callRecordingController);
router.get("/get-calls-by-program", getCallsByProgramController);
router.get("/get-client-call-status", getClientCallStatusController);
router.get("/get-latest-call-scheduled", getLatestUserCallScheduled);
router.post('/make-dashboard-call-exotel', makeDashboardCallExotel);
router.post('/status-webhook', (req,res,next)=> {
  console.log({body:req.body}) ; 
  res.status(200).json({message:'OK'})
})
router.post('/check-or-register-exotel-agent', checkOrRegisterExotelAgent);


export default router;
