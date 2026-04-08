import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllTableText = async (req, res, next) => {
  const { limit, page, search } = req.query;
  const searchQuery = search ? { searchQuery: search } : {};
  try {
    const { results: allTableText, totalCount } = await readRecord({
      table: `${tables.tableText}`,
      selectFields: [
        "id",
        "table_name",
        "whatsapp_text",
        "auto_draft_text",
        "mail_text",
        "wati_template",
      ],
      pagination: { limit, page },
      search: searchQuery,
      countTotal: true,
    });
    if (allTableText.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No table text records found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "All table texts fetched successfully",
      data: allTableText,
      totalCount: Math.ceil(totalCount / limit),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addTableText = async (req, res, next) => {
  const {
    table_name,
    notification_id,
    whatsapp_text,
    auto_draft_text,
    mail_text,
    wati_template,
  } = req.body;
  try {
    const columns = [
      "table_name",
      "notification_id",
      "whatsapp_text",
      "auto_draft_text",
      "mail_text",
      "wati_template",
    ];
    const values = [
      table_name,
      notification_id,
      whatsapp_text,
      auto_draft_text,
      mail_text,
      wati_template,
    ];
    const insertResult = await insertRecord(tables.tableText, columns, values);
    if (insertResult.affectedRows == 1) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Table text added successfully",
        data: {
          id: insertResult.insertId,
        },
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error while adding table table", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateTableText = async (req, res, next) => {
  const updatedData = req.body;
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }
  console.log(updatedData, 96);
  if (Object.keys(updatedData).length === 0) {
    return next(new ErrorHandler("No data to update", 400));
  }
  try {
    const updateResult = await updateRecord(tables.tableText, updatedData, {
      id: parseInt(req.params.id),
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
        message: `table text updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating table text`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteTableText = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("ID is required", 400));
  }
  try {
    const deletedResult = await deleteRecords(tables.tableText, parseInt(id), {
      id: parseInt(id),
    });
    console.log(deletedResult, 145);
    if (deletedResult.success === false) {
      return next(
        new ErrorHandler(
          "No table text deleted  (possible cause :there isn't any table text exist with the given id)",
          400
        )
      );
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "table text deleted successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { getAllTableText, addTableText, updateTableText, deleteTableText };
