import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { cloudinaryFolders, tables } from "../../helper/constant.js";

import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { uploadArrayOfFilesToCloudinary } from "../uploadSingleImage.js";

const addProgramDocument = async (req, res, next) => {
  try {
    const { program_id, type, title, description, link, content } = req.body;
    if (!program_id || !title || !description || !type) {
      return next(
        new ErrorHandler(
          "program_id, title, description or type not provided",
          500
        )
      );
    }
    const files = req.files;
    const columns = ["program_id", "title", "description", "type"];
    const values = [program_id, title, description, type];
    if (files && files.length > 0) {
      const result = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.programDocuments
      );
      console.log(result, 22);
      columns.push("link");
      values.push(result[0].path);
    }
    if (link) {
      columns.push("link");
      values.push(link);
    }
    if (content) {
      columns.push("content");
      values.push(content);
    }

    const insertedResult = await insertRecord(
      tables.programDocuments,
      columns,
      values
    );
    if (insertedResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Program Document added successfully",
        data: { id: insertedResult.insertId },
      });
      return res.status(201).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to add Program Document", 500));
  } catch (error) {
    console.log("Error in addProgramDocument", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllProgramDocuments = async (req, res, next) => {
  try {
    const { type, search } = req.query;
    const conditions = [{ field: "pd.is_deleted", operator: "=", value: 0 }];
    if (type) {
      conditions.push({ field: "pd.type", operator: "=", value: type });
    }
    const { results } = await readRecord({
      selectFields: [
        "id",
        "pd.program_id",
        "pd.title",
        "pd.description",
        "pd.link",
        "pd.added_date",
        "pm.program_name",
        "pd.type",
        "pd.content",
      ],
      table: `${tables.programDocuments} pd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pd.program_id = pm.program_id",
        },
      ],
      conditions,
      orderBy: ["pd.added_date DESC"],
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "pd.title",
            "pd.description",
            "pd.content",
            "pm.program_name",
          ],
        },
      }),
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Program Documents found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Program Documents fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getAllProgramDocuments", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateProgramDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { program_id, title, description, link, type, content } = req.body;
    const files = req.files;
    const updateFields = {};
    if (program_id) updateFields.program_id = program_id;
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (link) updateFields.link = link;
    if (type) updateFields.type = type;
    if (content) updateFields.content = content;
    console.log(files, 55);
    if (files && files.length > 0) {
      const result = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.programDocuments
      );
      updateFields.link = result[0].path;
    }
    const updatedResult = await updateRecord(
      tables.programDocuments,
      updateFields,
      { id }
    );
    if (updatedResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Program Document updated successfully",
        data: { id },
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to update Program Document", 500));
  } catch (error) {
    console.log("Error in updateProgramDocument", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteProgramDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedResult = await updateRecord(
      tables.programDocuments,
      { is_deleted: 1 },
      { id }
    );
    if (deletedResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Program Document deleted successfully",
        data: { id },
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to delete Program Document", 500));
  } catch (error) {
    console.log("Error in deleteProgramDocument", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addProgramDocument,
  getAllProgramDocuments,
  updateProgramDocument,
  deleteProgramDocument,
};
