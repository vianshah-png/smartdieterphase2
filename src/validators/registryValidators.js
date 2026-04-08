import { z } from "zod";
import { isValidPhoneNumber } from "../utils/isPhoneNumberValid.js";

const addRegisterMembersSchema = z
  .object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    alternative_email: z
      .string()
      .email("Invalid alternative email address")
      .optional(),
    phone_code: z
      .string()
      .min(1, "Phone code is required")
      .refine((code) => code.startsWith("+"), {
        message: "Phone code must start with a '+'",
      }),
    phone: z.string().min(1, "Phone number is required"),
    password: z.string().min(3, "Password must be at least 3 characters long"),
    gender: z.enum(["Male", "Female"], {
      message: "Gender should be either Male or Female",
    }),
    country_id: z.number().min(1, "Country is required"),
    state_id: z.number().min(1, "State is required").optional(),
    city_id: z.number().min(1, "City is required").optional(),
    assign_to: z.number().min(1, "Mentor Id is incorrect").optional(),
    source: z.string().min(1, "Source is required").optional(),
    admin_id: z.number().min(1, "Admin Id is required"),
  })
  .refine(
    (data) => {
      const { phone_code, phone } = data;
      return isValidPhoneNumber(phone_code, phone);
    },
    {
      message: "Invalid phone number for the provided phone code",
      path: ["phone"],
    }
  );

export { addRegisterMembersSchema };
