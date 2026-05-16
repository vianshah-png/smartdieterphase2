import { body } from "express-validator";
import { z } from 'zod';

/**
 * Standard body validator for Express routes
 */
export const dietAuditValidator = [
  body("user_id")
    .notEmpty()
    .withMessage("user_id is required to fetch client health context"),

  body("diet_id")
    .notEmpty()
    .isNumeric()
    .withMessage("diet_id is required to identify the template to audit"),

  body("assessment_id")
    .optional()
    .isNumeric()
    .withMessage("assessment_id must be a number (from the assessment-list API response)"),

  body("generate_alternatives")
    .optional()
    .isBoolean()
    .withMessage("generate_alternatives must be a boolean"),
];

/**
 * Zod Schema for the AI inference output
 */
export const aiResponseSchema = z.object({
  conflicts: z.array(z.object({
    dish_name: z.string(),
    conflicting_ingredient: z.string(),
    conflict_type: z.enum(['diet_type_violation', 'allergy_conflict', 'aversion_conflict', 'icl_conflict']),
    reason: z.string(),
    suggested_alternative: z.string().optional()
  }))
});

/**
 * Zod Schema for the Phase 3 AI alternative suggestions output
 */
export const aiSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    conflict_dish_name: z.string(),
    suggestion_type: z.enum(['ingredient_swap', 'full_replacement']),
    swap_instruction: z.string().optional(),
    alternative_dishes: z.array(z.object({
      recipe_id: z.number(),
      title: z.string(),
      slug: z.string(),
      category_name: z.string(),
      reason: z.string()
    })).max(3).optional()
  }))
});