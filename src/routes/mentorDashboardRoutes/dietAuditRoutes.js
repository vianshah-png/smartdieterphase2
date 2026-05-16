import Router from "express";
import { 
  runDietComplianceAudit 
} from "../../controllers/mentorDashboardControllers/dietAuditController.js";
import { ingestAllRecipes } from "../../services/embeddingService.js";
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
 * @route   POST /api/v1/diet-audit/ingest-recipes
 * @desc    Bulk ingest all active BN recipes into Qdrant vector index (one-time bootstrap)
 * @access  Admin only
 */
router.post("/ingest-recipes", async (req, res) => {
  try {
    const result = await ingestAllRecipes();
    res.status(200).json({
      status: 'success',
      message: `Recipe ingestion complete: ${result.success}/${result.total} recipes embedded`,
      data: result,
    });
  } catch (error) {
    console.error('❌ Ingestion error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * @route   GET /api/v1/diet-audit/tester
 * @desc    Serves the High-Fidelity UI for safety testing
 */
router.get("/tester", (req, res) => {
  // Correctly resolves the path to your src/views folder
  res.sendFile(path.join(__dirname, "../../../src/views/dietAuditTester.html"));
});

export default router;