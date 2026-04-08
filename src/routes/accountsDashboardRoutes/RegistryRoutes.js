import { Router } from "express";
import {
  addMember,
  getAllMembers,
  updateMember,
  deleteMember,
  getAllOTP,
} from "../../controllers/accountsDashboardControllers/registryController.js";

const router = Router();

router.post("/add-member", addMember);
router.post("/all-members", getAllMembers);
router.post("/all-otp", getAllOTP);
router.patch("/update-member/:id", updateMember);
router.delete('/delete-member/:id',deleteMember)

export default router;
