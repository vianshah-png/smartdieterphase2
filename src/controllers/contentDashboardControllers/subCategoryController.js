import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

export const getAllSubCategories = async (req, res, next) => {
  try {
    const { category_id, search } = req.query;
    const conditions = [
      { field: "sc.is_deleted", operator: "=", value: 0 }
    ];
    if (category_id) {
      conditions.push({
        field: "sc.category_id",
        operator: "=",
        value: Number(category_id),
      });
    }
    const select = [
      "sc.sub_category_id as id",
      "sc.sub_category_name as sub_category",
      "sc.category_id as category_id",
    ];
    const { results: subCategories, totalCount } = await readRecord({
      table: `${tables.subCategory} sc`,
      selectFields: select,
      ...(search && {
        search: {
          searchFields: ["sc.sub_category_name"],
          searchQuery: search,
        },
      }),
      countTotal: true,
      conditions,
      orderBy: ["sc.created_at DESC"],
    });

    if (!subCategories) {
      return next(new ErrorHandler("Error While fetching programs", 400));
    } else if (subCategories.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Sub Categories fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sub Categories fetched successfully",
      data: subCategories,
      meta_data: {
        category_id: "hide",
      },
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addSubCategory = async (req, res, next) => {
  try {
    const { sub_category, added_by, category_id } = req.body;

    if (!sub_category || !added_by || !category_id) {
      return next(new ErrorHandler("All fields are required", 500));
    }

    console.log();
    const columns = ["sub_category_name", "added_by", "category_id"];

    const values = [sub_category, added_by, category_id];

    const result = await insertRecord(`${tables.subCategory}`, columns, values);
    console.log(result);

    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Sub Category added successfully",
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add sub category", 500));
    }
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const removeSubCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("id not Provided", 500));
    }
    // const subCategory = await deleteRecords(tables.subCategory, id, {
    //   sub_category_id: parseInt(id),
    // });
    // console.log(subCategory);

     const updatedData = {
      is_deleted: 1,
    };

    const condition = { sub_category_id: parseInt(id) };
    const deletedRecipe = await updateRecord(
      `${tables.subCategory}`,
      updatedData,
      condition
    );
    // if (subCategory.message === "No records deleted") {
    //   return next(new ErrorHandler("Sub Category not found", 404));
    // }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Sub Category ${id} Removed Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return next(
        new ErrorHandler(
          "This sub category is being used in other tables. Please delete them first.",
          400
        )
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const updateSubCategory = async (req, res, next) => {
  const { id } = req.params;

  const { sub_category, category_id } = req.body;

  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  if (!sub_category && !category_id) {
    return next(new ErrorHandler("No data is provided for update", 500));
  }
  const updateData = {
    sub_category_name: sub_category,

    category_id,
  };

  // Remove undefined values from updateData
  Object.keys(updateData).forEach(
    (key) => updateData[key] === undefined && delete updateData[key]
  );

  const whereCondition = { sub_category_id: id };

  try {
    const success = await updateRecord(
      `${tables.subCategory}`,
      updateData,
      whereCondition
    );
    console.log(success);

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Sub Category updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Updating Sub Category", 400));
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
