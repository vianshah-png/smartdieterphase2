import { z } from "zod";

const addIncentivePoolSchema = z.object({
  admin_id: z.number().min(0, "admin_id cannot be negative"),
  date: z.string().date("Invalid date"),
  month: z.string().regex(/^(0[1-9]|1[0-2])-\d{4}$/, {
    message: "Invalid month-year format. Please use MM-YYYY (e.g., 06-2024).",
  }),
  incentive: z.number().min(0, "incentive cannot be negative").optional(),
  pool: z.number().min(0, "pool cannot be negative"),
  type: z.enum(["pool", "incentive"], {
    message: "Please enter valid incentive type",
  }),
});

export { addIncentivePoolSchema };
