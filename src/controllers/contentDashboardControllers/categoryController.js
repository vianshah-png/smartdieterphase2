import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";

import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllCategories = async (req, res, next) => {
  try {
    const { search } = req.query;
    const select = ["c.category_name", "c.category_id as id"];
    const getnotDeleted = [{ field: "c.is_deleted", operator: "=", value: 0 },{ field: "c.category_name", operator: "NOT IN", value: "('Veg','Non-Veg')",raw:true }];
    const { results: categories, totalCount } = await readRecord({
      table: `${tables.category} c`,
      selectFields: select,
      ...(search && {
        search: {
          searchFields: ["c.category_name"],
          searchQuery: search,
        },
      }),
      conditions: getnotDeleted,
      countTotal: true,
      orderBy: ["c.created_at DESC"],
    });

    if (!categories) {
      return next(new ErrorHandler("Error While fetching Categories"));
    } else if (categories.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Categories fetched Successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `All Categories Fetched Successfully`,
      data: categories,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getAllType = async (req, res, next) => {
  try {
    const { search } = req.query;
    const select = ["c.title", "c.icon" , "c.id as id"  ];
    const getnotDeleted = [{ field: "c.is_deleted", operator: "=", value: 0 }];
    const { results: categories, totalCount } = await readRecord({
      table: `${tables.bn_recipe_type} c`,
      selectFields: select,
      ...(search && {
        search: {
          searchFields: ["c.title"],
          searchQuery: search,
        },
      }),
      conditions: getnotDeleted,
      countTotal: true,
      // orderBy: ["c.created_at DESC"],
    });

    if (!categories) {
      return next(new ErrorHandler("Error While fetching Type"));
    } else if (categories.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Type fetched Successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `All Categories Fetched Successfully`,
      data: categories,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const addCategory = async (req, res, next) => {
  const { category, added_by } = req.body;
  try {
    if (!category || !added_by) {
      return next(new ErrorHandler("Category or Added_by Not Provided", 400));
    }

    const columns = ["category_name", "added_by"];

    const values = [category, added_by];

    const result = await insertRecord(`${tables.category}`, columns, values);

    // Check if the insert was successful
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Category added successfully",
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add category", 500));
    }
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const removeCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("id not Provided", 500));
    }
    // const category = await deleteRecords(tables.category, id, {
    //   category_id: parseInt(id),
    // });

    const updatedData = {
      is_deleted: 1,
    };

    const condition = { category_id: parseInt(id) };
    const deletedRecipe = await updateRecord(
      `${tables.category}`,
      updatedData,
      condition
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Category deleted successflly",
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return next(
        new ErrorHandler(
          "This category is being used in other tables. Please delete them first.",
          400
        )
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateCategory = async (req, res, next) => {
  const { id } = req.params;
  const { category, added_by } = req.body;
  console.log(category);
  if (!id) {
    return next(new ErrorHandler("id  not provided", 400));
  }
  const updateData = {
    category_name: category,
    added_by,
  };

  // Remove undefined values from updateData
  Object.keys(updateData).forEach(
    (key) => updateData[key] === undefined && delete updateData[key]
  );

  const whereCondition = { category_id: id };

  try {
    const success = await updateRecord(
      `${tables.category}`,
      updateData,
      whereCondition
    );
    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Category updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Updating Category", 400));
    }
  } catch (error) {
    console.log(error, 123);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getCategoryAndSubCategory = async (req, res, next) => {
  try {
    const getnotDeleted = [{ field: "rc.is_deleted", operator: "=", value: 0 },{ field: "rsc.is_deleted", operator: "=", value: 0 }];
    const { results } = await readRecord({
      selectFields: [
        "rc.category_name",
        "rc.category_id",
        "CONCAT('[', GROUP_CONCAT(JSON_OBJECT('sub_category_name',rsc.sub_category_name,'sub_category_id',rsc.sub_category_id) ORDER BY rsc.sub_category_name ), ']') AS sub_category",
      ],
      table: `${tables.category} rc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subCategory} rsc`,
          on: "rc.category_id = rsc.category_id",
        },
      ],
      conditions:getnotDeleted,
      groupBy: ["rc.category_id"],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("No Category or Subcategory found", 404));
    }
    console.log(results.length, 175);
    const data = results.map((row) => {
      let sub_category = JSON.parse(row.sub_category);
      return {
        category_id: row.category_id,
        category: row.category_name,
        sub_category:
          sub_category[0].sub_category_id === null ? [] : sub_category,
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Category and Subcategory fetched successfully",
      data,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  updateCategory,
  addCategory,
  getAllCategories,
  removeCategory,
  getCategoryAndSubCategory,
};
