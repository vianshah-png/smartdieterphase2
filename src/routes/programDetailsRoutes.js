import { Router } from "express";
import { getProgramDetails } from "../controllers/programDetailsController.js";

const router = Router();

router.post("/get-program-details", getProgramDetails);

export default router;
