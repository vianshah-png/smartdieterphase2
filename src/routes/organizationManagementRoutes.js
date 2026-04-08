import { Router } from "express";
import {
  addDepartment,
  addOrganization,
  addRole,
  getAllEmployeesOfOrganization,
  getDepartments,
  getOrganizations,
  getRoles,
  updateOrganization,
} from "../controllers/organisationManagementController.js";
import { multerUpload } from "../config/multerConfig.js";

const router = Router();

router.post(
  "/add-organization",
  multerUpload.array("logo", 1),
  addOrganization
);
router.get("/get-organization", getOrganizations);
router.patch(
  "/update-organization/:id",
  multerUpload.array("logo", 1),
  updateOrganization
);

router.get("/get-departments/:id", getDepartments);
router.post("/add-department", addDepartment);

router.get("/get-roles/:id", getRoles);
router.post("/add-role", addRole);

router.get("/get-all-employees/:id", getAllEmployeesOfOrganization);

export default router;
