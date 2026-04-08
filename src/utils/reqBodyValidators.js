// validators.js
import { z } from "zod";
import { ErrorHandler } from "./ErrorClass.js";


function validateRequest(schema) {
  return (req, res, next) => {
    try {
      schema.parse(req.body); // Parse and validate request body
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ErrorHandler(error.errors[0].message, 400));
      }
      next(error);
    }
  };
}

// Define Zod validation schema
const draftSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(
    [
      "Lead",
      "Refund",
      "Balance Payment",
      "Mentor Draft",
      "pop up",
      "Program Drafts",
      "Other Drafts",
      "Yellow Patta",
      "PS Line",
      "Whatsapp Drafts",
      "QNA Drafts",
    ],
    "Invalid draft type. Must be one of: Lead, Refund, Balance Payment, Mentor Draft, pop up, Program Drafts, Other Drafts, Yellow Patta, PS Line, Whatsapp Drafts, QNA Drafts"
  ),
  description: z.string().min(1, "Description is required"),
  link: z.string().url("Link must be a valid URL").optional(),
  sub_type: z.string().optional(),
  button_one_name: z.string().optional(),
  button_one_redirect: z.string().optional(),
  button_two_name: z.string().optional(),
  button_two_redirect: z.string().optional(),
});



export { validateRequest, draftSchema };
