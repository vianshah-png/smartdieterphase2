import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeScan } from "../controllers/nutriScanController.js";
import { multerUpload } from "../config/multerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

/**
 * @route   GET /api/v1/nutriscan/tester
 * @desc    Serves the High-Fidelity UI for NutriScan
 */
router.get("/tester", (req, res) => {
    res.sendFile(path.join(__dirname, "../views/nutriScan.html"));
});

/**
 * @route   POST /api/v1/nutriscan/analyze
 * @desc    Analyze a scan result (receipt/menu)
 */
router.post("/analyze", multerUpload.single("image"), analyzeScan);

export default router;
