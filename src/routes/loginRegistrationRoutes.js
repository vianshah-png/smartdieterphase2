import { Router } from "express";
import {
  adminLogin,
  adminLogout,
  generateOTP,
  login,
  verifyOTP,
  deactivateClient,
} from "../controllers/loginRegistrationController.js";
const router = Router();

router.post("/generate-otp", generateOTP);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/login-admin", adminLogin);
router.get("/logout-admin", adminLogout);
router.patch("/deactivate-client", deactivateClient);

export default router;
