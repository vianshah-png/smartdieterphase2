import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { cloudinaryFolders, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

const addRecipeType = async (req, res, next) => {
  const { recipe_type, added_by } = req.body;
  const files = req.files;
  if (!recipe_type || !added_by)
    return next(new ErrorHandler("title or added_by not Provided", 400));
  try {
    const images = await uploadArrayOfFilesToCloudinary(
      files,
      cloudinaryFolders.recipeTypeIcon
    );
    const columns = ["title", "added_by", "icon"];
    const values = [recipe_type, added_by, JSON.stringify(images)];

    const newRecipeType = await insertRecord(
      `${tables.recipe_type}`,
      columns,
      values
    );
    if (!newRecipeType) {
      return next(new ErrorHandler("Error While adding recipe_type", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Recipe Type added successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getRecipeType = async (_, res, next) => {
  try {
    const selectFields = [
      "rt.id",
      "rt.title",
      "rt.added_by",
      "CONCAT(u.first_name,' ',u.last_name) as user_name",
      "rt.icon",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.userDetails} u`,
        on: `rt.added_by = u.user_id`,
      },
    ];
    const getnotDeleted = [{ field: "rt.is_deleted", operator: "=", value: 0 }];
    const { results: rows, totalCount } = await readRecord({
      table: `${tables.recipe_type} rt`,
      selectFields: selectFields,
      joins,
      conditions: getnotDeleted,
      countTotal: true,
      orderBy: ["rt.created_at DESC"],
    });
    if (!rows) {
      return next(new ErrorHandler("Error While fetching recipe_Type", 400));
    } else if (rows.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "recipe_types fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const recipe_types = rows.map((row) => ({
      id: row.id,
      recipe_type: row.title,
      icon: safeJSONParse(row.icon, []),
    }));
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Recipe Types fetched successfully",
      data: recipe_types,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);

    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateRecipeType = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const { recipe_type, added_by } = req.body;
  const files = req.files;
  try {
    const updateData = {
      title: recipe_type,
      added_by,
    };
    if (files.length > 0) {
      const images = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.programStatsImages
      );
      updateData.icon = JSON.stringify(images);
    }
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );
    const whereCondition = { id: id };

    const success = await updateRecord(
      `${tables.recipe_type}`,
      updateData,
      whereCondition
    );
    if (!success)
      return next(new ErrorHandler("Error While updating Recipe Type", 400));
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Recipe Type ${id} updated successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const removeRecipeType = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("id Not Provided", 400));
    }
    const recipeType = await deleteRecords(tables.recipe_type, id, {
      id: parseInt(id),
    });
    if (recipeType.message === "No records deleted") {
      return next(new ErrorHandler("recipe type not found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Recipe Type ${id} removed successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return next(
        new ErrorHandler(
          "This recipe type is being used in other tables. Please delete them first.",
          400
        )
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addRecipeType, getRecipeType, updateRecipeType, removeRecipeType };
