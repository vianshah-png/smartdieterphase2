import { z } from "zod";

const addOrderSchema = z.object({
  user_id: z.number().min(1, "User Id is required"),
  orderDateTime: z.string().datetime("Invalid date format"),
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  country_id: z.number().min(1, "Country is required"),
  state_id: z.number().min(1, "State is required"),
  city_id: z.number().min(1, "City is required"),
  pincode: z.number().min(1, "Pincode is required"),
  phone: z.number().min(1, "Phone Number is required"),
  order_type: z.enum(["New", "Renewal", "OCR"], {
    message: "Order type should be either online or offline",
  }),
  currency: z.enum(["Rupees", "Dollar"], {
    message: "Currency should be either Rupees or Dollar",
  }),
  program_id: z.number().min(1, "Program Id is required"),
  session_id: z.number().min(1, "Session Id is required"),
  program_amount: z.number().min(1, "Program Amount is required"),
  discount: z.number().min(1, "Discount is required").optional(),
  wallet_discount: z.number().min(1, "Wallet discount is required").optional(),
  paid_amount: z.number().min(1, "Paid amount is required"),
  balance_amount: z.number().min(1, "Balance amount is required"),
  due_date: z.string().datetime("Invalid date format"),
  payment_method: z.enum(
    [
      "Razorpay",
      "Paypal",
      "GPay",
      "PhonePay",
      "Paytm",
      "UPI",
      "NEFT",
      "RTGS",
      "EBS",
      "CPS",
      "Cheque",
      "PayU Money",
      "HDFC PayZap",
    ],
    { message: "Payment method not Valid" }
  ),
  note: z
    .string()
    .min(1, "Note is required")
    .max(45, { message: "Note must be less than 45 characters" })
    .optional(),
  mentor_assigned: z.number().min(1, "Mentor Id is incorrect"),
  sale_by: z.number().min(1, "Sale by is required"),
});
export { addOrderSchema };
