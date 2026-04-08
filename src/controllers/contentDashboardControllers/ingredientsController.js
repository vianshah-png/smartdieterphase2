import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllIngredients = async (req, res, next) => {
  try {
    const { search } = req.query;
    const select = ["ingredient", "id", "quantity"];
    const { results: ingredients, totalCount } = await readRecord({
      table: `${tables.ingredients}`,
      selectFields: select,
      ...(search && {
        search: { searchQuery: search, searchFields: ["ingredient"] },
      }),
      countTotal: true,
    });
    if (ingredients.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No ingredients were found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Ingredients Fetched Successfully",
      data: ingredients,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(error.message, 500));
  }
};

const getAllBnIngredients = async (req, res, next) => {
  try {
    const { search } = req.query;
    const select = ["ingredient_name", "id", "image"];
    const { results: ingredients, totalCount } = await readRecord({
      table: `${tables.bn_recipes_ingredients}`,
      selectFields: select,
      ...(search && {
        search: { searchQuery: search, searchFields: ["ingredient_name"] },
      }),     
      countTotal: true,
    });

    if (ingredients.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No ingredients were found",
        data: [],
      });
      return res.status(200).json(apiResponse); // Changed to return the object directly
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Ingredients Fetched Successfully",
      data: ingredients,
      totalCount,
    });
    return res.status(200).json([apiResponse]); 

  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(error.message, 500));
  }
};

const addIngredient = async (req, res, next) => {
  try {
    const { ingredient, quantity, added_by } = req.body;
    if (!ingredient) {
      return next(
        new ErrorHandler("ingreidient and quantity are required ", 400)
      );
    }
    const columns = ["ingredient", "added_by"];

    const values = [ingredient, added_by];
    if (quantity) {
      columns.push("quantity");
      values.push(quantity);
    }
    const result = await insertRecord(`${tables.ingredients}`, columns, values);

    // Check if the insert was successful
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "ingredient added successfully",
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Adding Ingredient", 400));
    }
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteIngredients = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  try {
    const deleteResult = await deleteRecords(tables.ingredients, id, {
      id,
    });
    if (deleteResult.success === false) {
      return next(new ErrorHandler("No ingredient found with this id", 404));
    }
    console.log(deleteResult);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "ingredient deleted successfully",
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editIngredient = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  const updatedData = req.body;
  console.log(updatedData);
  try {
    const updateResult = await updateRecord(tables.ingredients, updatedData, {
      id,
    });
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry found with the given id", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `ingredient updated successfully`,
      });
      return res.status(200).json(apiResponse);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addIngredient, getAllIngredients, deleteIngredients, editIngredient ,getAllBnIngredients};
