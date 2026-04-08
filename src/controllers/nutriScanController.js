import { readRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { generateNutriScanAnalysis } from "../services/aiService.js";
import fs from "fs";

export const analyzeScan = async (req, res, next) => {
    try {
        const { user_id } = req.body;
        const file = req.file;

        if (!user_id) return next(new ErrorHandler("User ID is required", 400));

        // Get client context for personalized analysis
        const { results: clientContext } = await readRecord({
            table: `${tables.userDetails} ud`,
            selectFields: ["ass_n_l.eating_habit", "ass_n_l.food_allergies", "ass_n_l.food_aversions"],
            joins: [{ type: "LEFT", table: `${tables.assessment_nutrition_and_lifestyle} ass_n_l`, on: "ass_n_l.user_id = ud.user_id" }],
            conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
            orderBy: ["ass_n_l.nutrition_and_lifestyle_id DESC"],
            pagination: { limit: 1 }
        });

        const client = clientContext.length > 0 ? clientContext[0] : { eating_habit: "Balanced", food_allergies: "", food_aversions: "" };

        let imageBase64 = null;
        if (file) {
            const bitmap = fs.readFileSync(file.path);
            imageBase64 = Buffer.from(bitmap).toString('base64');
        }

        const analysis = await generateNutriScanAnalysis({
            imageBase64,
            textContent: req.body.text || "",
            client
        });

        // Cleanup temp file if it exists
        if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return res.status(200).json(new ApiResponse({
            statusCode: 200,
            message: "Analysis completed successfully",
            data: analysis
        }));

    } catch (error) {
        console.error("❌ NutriScan Analysis Error:", error);
        return next(new ErrorHandler("Failed to analyze scan", 500));
    }
};
