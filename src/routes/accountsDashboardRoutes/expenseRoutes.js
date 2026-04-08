import Router from "express";
import {
  addExpense,
  deleteExpense,
  getExpensesList,
  getTotalExpenses,
} from "../../controllers/accountsDashboardControllers/expenseController.js";
import { validatePageAndLimit } from "../../utils/validators.js";

const router = Router();

router.get("/all", getExpensesList);
router.post("/add", validatePageAndLimit, addExpense);
router.delete("/delete/:id", deleteExpense);
router.get("/totalExpense", getTotalExpenses);


export default router;
