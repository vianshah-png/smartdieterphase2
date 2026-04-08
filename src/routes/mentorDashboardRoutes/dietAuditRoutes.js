import Router from "express";
import { 
  runDietComplianceAudit 
} from "../../controllers/mentorDashboardControllers/dietAuditController.js";
import { 
  validateHandler 
} from "../../utils/validators.js"; //
import path from "path"; // FIX: Added missing import
import { fileURLToPath } from "url"; // FIX: Added missing import
import { 
  dietAuditValidator 
} from "../../validators/dietAuditValidator.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js"; //
import { redisKeys } from "../../helper/constant.js"; //

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

/**
 * @route   POST /api/v1/diet-audit/run-safety-check
 * @desc    8-Step Safety Engine: Extraction, Grounding, and AI Inference
 * @access  Private (Mentor Only)
 */
router.post(
  "/run-safety-check", 
  redisMiddleware(redisKeys.diet_audit || 'diet_audit'), // PRD 5.1: Protection against budget burn-through
  dietAuditValidator, // express-validator logic
  validateHandler,    // Standard project error handler
  runDietComplianceAudit
);

/**
 * @route   GET /api/v1/diet-audit/tester
 * @desc    Serves the High-Fidelity UI for safety testing
 */
router.get("/tester", (req, res) => {
  // Correctly resolves the path to your src/views folder
  res.sendFile(path.join(__dirname, "../../../src/views/dietAuditTester.html"));
});

export default router;