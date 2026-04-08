import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { cloudinaryFolders, redisKeys, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { formatDate, safeJSONParse } from "../../helper/commonHelper.js";

const getAllDrafts = async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    sort_by,
    start_date,
    end_date,
    mentor_id,
    types,
    post_name,
    social_id,
  } = req.body;

  const order = sort_by === "latest" ? "DESC" : "ASC";

  const conditions = [];
  const pagination = { limit, page };

  if (types && types.length > 0) {
    conditions.push({ field: "type", operator: "IN", value: types });
  }
  if (post_name) {
    conditions.push({ field: "d.post_name", operator: "=", value: post_name });
  }
  if (social_id) {
    conditions.push({ field: "d.social_id", operator: "=", value: social_id });
  }

  if (mentor_id) {
    conditions.push({
      field: "d.created_by ",
      operator: "=",
      value: mentor_id,
    });
  }

  if (start_date && end_date) {
    let startDate = formatDate(start_date);
    let endDate = formatDate(end_date);
    console.log(startDate, endDate, 37);
    conditions.push({
      field: "d.created_at",
      operator: "BETWEEN",
      value: [`"${startDate}"`, `"${endDate}"`],
      raw: true,
    });
  }
  try {
    const selectFields = [
      "d.drafts_id as id",
      "d.title",
      "d.program_id",
      "d.type",
      "d.sub_type",
      "d.description",
      "d.link",
      "d.hashtags",
      "d.button_one_name",
      "d.button_one_redirect",
      "d.button_two_name",
      "d.button_two_redirect",
      "d.image",
      "d.created_at",
      "d.updated_at",
      "d.post_name",
    ];
    const { results: rows, totalCount } = await readRecord({
      table: `${tables.drafts} d`,
      selectFields,
      pagination,
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: ["d.title", "d.description", "d.post_name"],
        },
      }),
      conditions,
      orderBy: [`d.created_at ${order}`],
      countTotal: true,
    });

    if (!rows) {
      return next(new ErrorHandler("Error While fetching drafts", 400));
    }

    if (rows.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Drafts fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    console.log(rows, 110);

    const draftsResponse = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      link: row.link,
      type: row.type,
      tags: safeJSONParse(row.hashtags, []),
      program_id: row.program_id,
      sub_type: row.sub_type || "",
      button_one_name: row.button_one_name || "",
      button_one_redirect: row.button_one_redirect || "",
      button_two_name: row.button_two_name || "",
      button_two_redirect: row.button_two_redirect || "",
      image: row.image ? safeJSONParse(row.image) : "",
      post_name: row.post_name || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    const redisKey = `${redisKeys.drafts}:${parseInt(page)}:${parseInt(
      limit
    )}:${search || "all"}`;
    await redis.setex(redisKey, 30, JSON.stringify(draftsResponse));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Drafts fetched successfully",
      data: draftsResponse,
      totalCount,
      meta_data: {
        current_page: page,
        total_pages: Math.ceil(totalCount / limit),
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addDraft = async (req, res, next) => {
  try {
    const newData = req.body;
    const files = req.files;
    if (files && files.length > 0) {
      const imagesLink = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.drafts,
        newData.title
      );
      newData.image = JSON.stringify(imagesLink[0]);
    }
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const insertResult = await insertRecord(
      `${tables.drafts}`,
      columns,
      values
    );
    if (!insertResult) {
      return next(new ErrorHandler("Error While Adding Draft", 400));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Draft Added Successfully",
    });
    await redisDelByPattern({
      pattern: `${redisKeys.drafts}*`,
      redis,
    });

    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editDraft = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id Not Provided", 400));
  }
  const updatedData = req.body;
  console.log(updatedData, 196);
  try {
    if (updatedData.hashtags) {
      updatedData.hashtags = JSON.stringify(updatedData.hashtags);
    }
    const condition = { drafts_id: parseInt(id) };
    const updateResult = await updateRecord(
      `${tables.drafts}`,
      updatedData,
      condition
    );
    if (updateResult.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `draft ${id} Updated Successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.drafts}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
        return next(new ErrorHandler("No drafts found with the given", 400));
      } else if (
        updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No changes made to the drafts",
        });
        return res.status(200).json(apiResponse);
      } else {
        return next(new ErrorHandler("Error While Updating drafts", 500));
      }
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: "failure", message: error.message });
  }
};

const deleteDraft = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const deletedDraft = await deleteRecords(tables.drafts, id, {
      drafts_id: parseInt(id),
    });
    if (deletedDraft.success === false) {
      return next(
        new ErrorHandler(
          "No drafts deleted  (possible cause :there isn't any draft exist with the given id)",
          400
        )
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `draft ${id} deleted successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.drafts}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 204);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getAllDrafts, addDraft, editDraft, deleteDraft };
