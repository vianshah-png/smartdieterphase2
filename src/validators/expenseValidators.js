import { z } from "zod";

const addExpenseSchema = z.object({
  type: z.enum(
    [
      "Pantry",
      "Salary",
      "PG",
      "Employee Welfare",
      "Internet",
      "Mobile",
      "Travelling",
      "Office Stationery",
      "Rent",
      "Marketing",
      "Office",
      "Personal",
      "Operating",
      "Incentive",
      "IT",
    ],
    { message: "Please enter valid expense type" }
  ),
  amount: z.number().min(0, "amount cannot be negative"),
  description: z.string().min(0, "description cannot be empty"),
  date: z.string().date("Invalid date"),
  month: z.string().regex(/^(0[1-9]|1[0-2])-(19|20)\d{2}$/, {
    message: "Invalid month-year format. Please use MM-YYYY (e.g., 06-2024).",
  }),
});

export { addExpenseSchema };
