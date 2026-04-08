import { Router } from "express";
import {
  getAllUsers,
  searchUser,
  login,
  registerUser,
  editUserDetails,
  getPersonalInfo,
  forgotPassword,
  verifyOtp,
  resetPassword,
  appointmentList,
  addFCMToken,
  copyClientDetails,
  referAFriend,
  updateUserFirstAndLastName
} from "../../controllers/contentDashboardControllers/userController.js";
import {
  validateEmail,
  validateHandler,
  validatePassword,
  validateUsername,
} from "../../utils/validators.js";

const router = Router();

router.post(
  "/register-user",
  validateUsername(),
  validatePassword(),
  validateEmail(),
  validateHandler,
  registerUser
);
router.post("/login", validateEmail(), validateHandler, login);
router.get("/all", getAllUsers);
router.get("/search-user", searchUser);
router.patch("/edit-user-details", editUserDetails);
router.get("/get-user-personal-info", getPersonalInfo);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/appointment-list", appointmentList);
router.post("/add-fcm-token", addFCMToken);
router.post("/client-details", copyClientDetails);
router.post("/refer-user", referAFriend);
router.patch("/update-user-first-and-last-name",updateUserFirstAndLastName);
export default router;
