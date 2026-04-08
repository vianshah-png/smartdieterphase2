import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";

const addFAQ = async (req, res, next) => {
  const { title, question, answer, type, keyword, created_by } = req.body;
  if (!question || !answer || !created_by) {
    return next(
      new ErrorHandler("Please provide all the required fields", 400)
    );
  }
  try {
    const columns = ["title", "question", "answer", "created_by"];
    const values = [title, question, answer, created_by];
    if (type) {
      columns.push("type");
      values.push(type);
    }
    if (keyword) {
      columns.push("keyword");
      values.push(keyword);
    }
    const insertResult = await insertRecord(tables.faq, columns, values);
    console.log(insertResult, 17);
    if (insertResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "FAQ added successfully",
        data: insertResult.insertId,
      });
      return res.status(201).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to add FAQ", 500));
  } catch (error) {
    console.log(error, 25);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllFAQ = async (req, res, next) => {
  const { id, page, limit, search } = req.query;
  try {
    const { results, totalCount } = await readRecord({
      selectFields: [
        "f.faq_id",
        "f.title",
        "f.question",
        "f.answer",
        "CONCAT(ab.crm_user) as created_by",
        "f.keyword",
        "f.type",
        "f.created_date",
      ],
      table: `${tables.faq} f`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ab`,
          on: "f.created_by = ab.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "f.is_deleted",
          operator: "=",
          value: 0,
        },
        ...((id && [{ field: "f.created_by", operator: "=", value: id }]) ||
          []),
      ],
      pagination: {
        page,
        limit,
      },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ab.first_name, ' ', ab.last_name)",
            "f.title",
            "f.question",
            "f.answer",
          ],
        },
      }),
      countTotal: true,
    });
    console.log(results[0], totalCount, 70);
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No FAQ found",
        data: [],
      });
      return res.status(404).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "FAQ fetched successfully",
      data: results,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to fetch FAQ", 500));
  }
};

const updateFAQ = async (req, res, next) => {
  const updateData = req.body;
  if (!updateData.id || !updateData.updated_by) {
    return next(
      new ErrorHandler("Please provide id and updated by field", 400)
    );
  }
  try {
    const id = updateData.id;
    delete updateData.id;
    const updateResult = await updateRecord(tables.faq, updateData, {
      faq_id: id,
    });
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry with the given id", 400));
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
        message: `FAQ updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating FAQ`, 400));
    }
  } catch (error) {
    console.log(error, 140);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteFAQ = async (req, res, next) => {
  const { id, deleted_by } = req.body;
  if (!id || !deleted_by) {
    return next(
      new ErrorHandler("Please provide id and deleted by field", 400)
    );
  }
  try {
    const deleteResult = await updateRecord(
      tables.faq,
      { is_deleted: 1, deleted_by, deleted_datetime: new Date() },
      { faq_id: id }
    );
    if (deleteResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry with the given id", 400));
    } else if (
      deleteResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No FAQ deleted",
      });
      return res.status(200).json(apiResponse);
    } else if (
      deleteResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `FAQ deleted successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error deleting FAQ`, 400));
    }
  } catch (error) {
    console.log(error, 175);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addFAQ, getAllFAQ, updateFAQ, deleteFAQ };
