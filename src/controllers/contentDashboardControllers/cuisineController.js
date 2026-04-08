import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllCuisines = async (_, res, next) => {
  try {
    const select = ["cu.cuisine_name as cuisine", "cu.id"];
    const getnotDeleted = [{ field: "cu.is_deleted", operator: "=", value: 0 }];
    const { results: cuisines, totalCount } = await readRecord({
      table: `${tables.cuisine} cu`,
      selectFields: select,
      conditions: getnotDeleted,
      countTotal: true,
      orderBy: ["cu.created_at DESC"],
    });
    if (!cuisines) {
      return next(new ErrorHandler("Error While fetching cuisines", 400));
    } else if (cuisines.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Cuisines fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cuisines Fetched Successfully",
      data: cuisines,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(error.message, 500));
  }
};

const addCuisine = async (req, res, next) => {
  try {
    const { cuisine, added_by } = req.body;
    if (!added_by || !cuisine) {
      return next(
        new ErrorHandler("cuisine or added_by or cuisine not Provided", 400)
      );
    }
    const columns = ["cuisine_name", "added_by"];

    const values = [cuisine, added_by];

    const result = await insertRecord(`${tables.cuisine}`, columns, values);

    // Check if the insert was successful
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Cuisine added successfully",
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Adding Cuisine", 400));
    }
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const removeCuisine = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("id not Provided", 400));
    }
    const cuisine = await deleteRecords(tables.cuisine, id, {
      id: parseInt(id),
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cuisine deleted successflly",
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return next(
        new ErrorHandler(
          "This cuisine is being used in other tables. Please delete them first.",
          400
        )
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateCuisine = async (req, res, next) => {
  const { id } = req.params;
  const { cuisine, added_by } = req.body;
  if (!id) {
    return next(new ErrorHandler("id  not Provided", 400));
  }

  const updateData = {
    cuisine_name: cuisine,
    added_by,
  };

  // Remove undefined values from updateData
  Object.keys(updateData).forEach(
    (key) => updateData[key] === undefined && delete updateData[key]
  );

  const whereCondition = { id: id };

  try {
    const success = await updateRecord(
      `${tables.cuisine}`,
      updateData,
      whereCondition
    );

    if (success) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `cuisine ${id} updated Successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Updating cuisines", 400));
    }
  } catch (error) {
    console.error("Error updating cuisine:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addCuisine, getAllCuisines, removeCuisine, updateCuisine };
