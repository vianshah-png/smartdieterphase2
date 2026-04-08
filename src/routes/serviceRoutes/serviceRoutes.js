import { Router } from "express";
import { getAllServices } from "../../controllers/serviceController/serviceController.js";

const router = Router();

router.get("/get-all-services", getAllServices);

export default router;
