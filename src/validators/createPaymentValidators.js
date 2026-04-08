import { z } from "zod";
import { isValidPhoneNumber } from "../utils/isPhoneNumberValid.js";

const createPaymentLinkSchema = z
  .object({
    program_id: z.number().min(1, "Program Id is required").optional(),
    program_session_id: z
      .number()
      .min(1, "Program Session Id is required")
      .optional(),
    phone_code: z
      .string()
      .min(1, "Phone code is required")
      .refine((code) => code.startsWith("+"), {
        message: "Phone code must start with a '+'",
      })
      .optional(),
    phone_number: z.number().min(1, "Phone Number is required").optional(),
    email_id: z.string().email("Invalid email address").optional(),
    expiry_at: z.string().datetime("Invalid date format"),
    payment_amount: z.number().min(1, "Payment Amount is required"),
    user_type: z.enum(["Lead", "Client"]).optional(),
    currency: z.enum(["INR", "USD"]).optional(),
    user_id: z.number().min(1, "User Id is required").optional(),
    guide_id: z.number().min(1, "Guide Id is required").optional(),
    service_id: z.number().min(1, "Service Id is required").optional(),
    admin_user_id: z.number().min(1, "Admin User Id is required"),
    country_id: z.number().min(1, "Country Id is required").optional(),
    sub_order_id: z.number().min(1, "Sub Order Id is required").optional(),
  })
  .refine(
    (data) => {
      if (data.phone_code && data.phone_number) {
        return isValidPhoneNumber(data.phone_code, data.phone_number);
      }
      return true;
    },
    {
      message: "Invalid phone number for the provided phone code",
      path: ["phone_number"],
    }
  );

export { createPaymentLinkSchema };
