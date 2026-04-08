import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addNewGoodMail = async (req, res, next) => {
  try {
    const {
      client_email,
      feedback,
      program_name,
      client_name,
      weight_loss,
      diet_session,
      hashtags,
    } = req.body;
    if (
      !client_email ||
      !feedback ||
      !program_name ||
      !client_name ||
      !weight_loss ||
      !diet_session
    ) {
      return next(new ErrorHandler("All fields are required", 400));
    }
    const columns = [
      "client_email_id",
      "feedback",
      "program_name",
      "client_name",
      "weight_loss",
      "diet_session",
      "hashtags",
    ];
    const values = [
      client_email,
      feedback,
      program_name,
      client_name,
      weight_loss,
      diet_session,
      hashtags,
    ];
    const result = await insertRecord(`${tables.goodMails}`, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Good Mail added successfully",
      });
      await redisDelByPattern({
        pattern: `${redisKeys.goodMails}*`,
        redis,
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add Good Mail", 500));
    }
  } catch (error) {
    console.log("Error Adding Good Mail:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getGoodMail = async (req, res, next) => {
  const { program_name, weight_loss, search, page, limit } = req.body;
  console.log(page, limit, 73);
  const conditions = [];
  const orderBy = ["gm.created_at DESC"];
  const pagination = { page, limit };

  if (program_name) {
    conditions.push({
      field: "gm.program_name",
      operator: "=",
      value: program_name,
    });
  }

  if (weight_loss !== undefined) {
    weight_loss === "asc"
      ? (orderBy[0] = "gm.weight_loss ASC")
      : (orderBy[0] = "gm.weight_loss DESC");
  }
  try {
    const { results: GoodMail, totalCount } = await readRecord({
      table: `${tables.goodMails} gm`,
      columns: ["*"],
      conditions,
      pagination,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "gm.client_email_id",
            "gm.feedback",
            "gm.program_name",
            "gm.client_name",
            "gm.hashtags",
          ],
        },
      }),
      orderBy,
      countTotal: true,
    });

    if (GoodMail.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Good Mail Fetched Successfully",
        data: [],
      });
      return res.status(200).json([apiresponse]);
    }
    const GoodMailData = GoodMail.map((row) => {
      return {
        id: row.id,
        client_email_id: row.client_email_id,
        feedback: row.feedback,
        program_name: row.program_name,
        client_name: row.client_name,
        tags: JSON.parse(row.hashtags) || [],
        weight_loss: row.weight_loss,
        diet_session: row.diet_session,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Good Mail Fetched Successfully",
      data: GoodMailData,
      totalCount,
      meta_data: {
        currentPage: parseInt(page) || 1,
        totalPages: Math.ceil(totalCount / parseInt(limit)) || 1,
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateGoodMail = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(new ErrorHandler("Id not Provided", 404));
    const updatedData = req.body;
    if (updatedData.client_email) {
      updatedData.client_email_id = updatedData.client_email;
      delete updatedData.client_email;
    }
    const condition = { id: parseInt(id) };
    const updateResult = await updateRecord(
      `${tables.goodMails}`,
      updatedData,
      condition
    );
    if (updateResult.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Good mail updated ${id} successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.goodMails}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
        return next(new ErrorHandler("No data found with the given", 400));
      } else if (
        updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No changes made to the data",
        });
        return res.status(200).json(apiResponse);
      } else {
        return next(new ErrorHandler("Error While Updating data", 500));
      }
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteGoodMail = async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return next(new ErrorHandler("id is not Provided", 500));
  }
  try {
    const condition = { id: parseInt(id) };
    const { success } = await deleteRecords(
      `${tables.goodMails}`,
      parseInt(id),
      condition
    );

    if (!success) {
      return next(new ErrorHandler("Error While deleting good Mail", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Good Mail ${id} deleted Successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.goodMails}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addNewGoodMail, getGoodMail, updateGoodMail, deleteGoodMail };
