import { z } from "zod";
const addPaymentModeSchema = z.object({
  payment_mode_name: z.string().min(1, "payment_mode_name is required"),
  mode_group: z.enum(["UPI Details", "Bank Details"], {
    message: "Please enter a valid payment mode group",
  }),
  payment_mode_details: z.string().min(1, "payment_mode_details is required"),
});

const updatePaymentModeDetailsSchema = z.object({
  payment_mode_name: z.string().optional(),
  mode_group: z.enum(["UPI Details", "Bank Details"], {
    message: "Please enter a valid payment mode group",
  }),
  payment_mode_details: z.string().optional(),
});
export { addPaymentModeSchema, updatePaymentModeDetailsSchema };
