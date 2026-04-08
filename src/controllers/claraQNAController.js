import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";

const addClaraQNA = async (req, res, next) => {
  const { question, answer, category_id } = req.body;
  if (!question || !answer || !category_id) {
    return next(
      new ErrorHandler("Please provide all the required fields", 400)
    );
  }
  try {
    const columns = ["question", "answer", "category_id"];
    const values = [question, answer, category_id];
    const insertResult = await insertRecord(tables.claraQnA, columns, values);
    console.log(insertResult, 17);
    if (insertResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Clara QnA added successfully",
        data: insertResult.insertId,
      });
      return res.status(201).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to add Clara QnA", 500));
  } catch (error) {
    console.log(error, 25);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllClaraQNA = async (req, res, next) => {
  const { page, limit, search } = req.query;
  try {
    const { results, totalCount } = await readRecord({
      selectFields: [
        "cq.question_id",
        "cq.question",
        "cq.answer",
        "cc.category_name",
        "cc.category_id",
      ],
      table: `${tables.claraQnA} cq`,
      joins: [
        {
          type: "INNER",
          table: `${tables.claraCategories} cc`,
          on: "cq.category_id = cc.category_id",
        },
      ],
      conditions: [
        {
          field: "cq.is_deleted",
          operator: "=",
          value: 0,
        },
        // ...((id && [{ field: "cq.created_by", operator: "=", value: id }]) ||
        //   []),
      ],
      pagination: {
        page,
        limit,
      },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: ["cq.question", "cq.answer", "cc.category_name"],
        },
      }),
      countTotal: true,
    });
    console.log(results[0], totalCount, 70);
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Clara QnA found",
        data: [],
      });
      return res.status(404).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Clara QnA fetched successfully",
      data: results,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to fetch Clara QnA", 500));
  }
};

const claraQnACategories = async (req, res, next) => {
  try {
    const categories = await readRecord({
      selectFields: ["category_id", "category_name"],
      table: tables.claraCategories,
      conditions: [
        {
          field: "is_show",
          operator: "=",
          value: 1,
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Clara QnA categories fetched successfully",
      data: categories,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to fetch Clara QnA categories", 500));
  }
};

const updateClaraQNA = async (req, res, next) => {
  const updateData = req.body;
  if (!updateData.id) {
    return next(new ErrorHandler("Please provide id by field", 400));
  }
  try {
    const id = updateData.id;
    delete updateData.id;
    const updateResult = await updateRecord(tables.claraQnA, updateData, {
      question_id: id,
    });
    if (updateResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Clara QnA updated successfully",
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to update Clara QnA", 500));
  } catch (error) {
    console.log(error, 140);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteClaraQNA = async (req, res, next) => {
  const { id } = req.body;
  if (!id) {
    return next(new ErrorHandler("Please provide id field", 400));
  }
  try {
    const deleteResult = await updateRecord(
      tables.claraQnA,
      { is_deleted: 1 },
      { question_id: id }
    );
    if (deleteResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Clara QnA deleted successfully",
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to delete Clara QnA", 500));
  } catch (error) {
    console.log(error, 175);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addClaraQNA,
  getAllClaraQNA,
  updateClaraQNA,
  deleteClaraQNA,
  claraQnACategories,
};
