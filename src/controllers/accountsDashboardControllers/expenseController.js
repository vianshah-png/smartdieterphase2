import { ZodError } from "zod";
import { deleteRecords, insertRecord, readRecord } from "../../config/query.js";
import { formatZodErrors } from "../../helper/commonHelper.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { addExpenseSchema } from "../../validators/expenseValidators.js";
import moment from "moment";

const addExpense = async (req, res, next) => {
  try {
    const newData = addExpenseSchema.parse(req.body);
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const result = await insertRecord(tables.officeExpenses, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Expense added successfully",
        data: {
          expenseId: result.insertId,
        },
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add expense", 500));
    }
  } catch (error) {
    console.log(error, "hello");
    if (error instanceof ZodError) {
      return formatZodErrors(error, res);
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getExpensesList = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, month, start_date, end_date } = req.query;

    const pagination = {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
    };

    const conditions = [];

    if (month) {
      const parsedMonth = moment(month, "MM-YYYY", true);
      if (!parsedMonth.isValid()) {
        return next(
          new ErrorHandler(
            "Invalid month format. Expected format: MM-YYYY (e.g., 01-2023).",
            400
          )
        );
      }
      conditions.push({
        field: "month",
        operator: "=",
        value: parsedMonth.format("MM-YYYY"),
      });
    }
    if (start_date && end_date) {
      conditions.push({
        field: "date",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    }

    const { results: expenses, totalCount } = await readRecord({
      table: tables.officeExpenses,
      selectFields: ["id", "type", "amount", "description", "date", "month"],
      conditions: conditions.length > 0 ? conditions : undefined,
      pagination,
      countTotal: true,
    });

    if (!expenses || expenses.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No expenses found",
        data: [],
        totalCount: 0,
      });
      return res.status(200).json(apiResponse);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Expenses fetched successfully",
      data: expenses,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching expenses:", error.message, error.stack);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getTotalExpenses = async (req, res, next) => {
  try {
    const { results: expenses } = await readRecord({
      table: tables.officeExpenses,
      selectFields: ["sum(amount) as total_expense"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Total Expenses fetched successfully",
      data: expenses,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteExpense = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const deletedExpense = await deleteRecords(tables.officeExpenses, id, {
      id: parseInt(id),
    });
    if (deletedExpense.success === false) {
      return next(
        new ErrorHandler(
          "No expense deleted  (possible cause :there isn't any expense exist with the given id)",
          400
        )
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Expense ${id} deleted successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 204);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addExpense, getExpensesList, deleteExpense, getTotalExpenses };
