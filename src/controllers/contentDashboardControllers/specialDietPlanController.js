import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { cloudinaryFolders, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const specialDietPlanList = async (req, res, next) => {
  const { page = 1, limit = 10, search, user_id, stack } = req.query;

  const pagination = { page, limit };
  const searchQuery = search
    ? {
        searchQuery: decodeURIComponent(search),
        searchFields: [
          "sdp.diet_name",
          "sdp.on_rising",
          "sdp.breakfast",
          "sdp.mid_morning",
          "sdp.pre_workout",
          "sdp.lunch",
          "sdp.dinner",
          "sdp.bed_time",
        ],
      }
    : {};
  try {
    const { results: clientResults } = await readRecord({
      selectFields: ["dsl.diet_name"],
      table: `${tables.dietSessionLog} dsl`,

      conditions: [
        {
          field: "dsl.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "dsl.diet_name",
          operator: "not like",
          value: "'%cleanse%'",
          raw: true,
        },
        {
          field: "dsl.diet_status",
          operator: "=",
          value: "4",
        },
      ],
    });

    const baseConditions = [
      { field: "is_special", operator: "=", value: 1 },
      { field: "is_deleted", operator: "=", value: 0 },
    ];
    // console.log(clientResults,49);

    if (stack) {
      baseConditions.push({ field: "stack", operator: "=", value: stack });
    }

    if (clientResults.length > 0) {
      baseConditions.push({
        field: "diet_name",
        operator: "NOT IN",
        value: clientResults.map((item) => item.diet_name),
      });
    }
    // console.log(baseConditions,49);
    // return;
    const { results: specialDiet, totalCount } = await readRecord({
      selectFields: ["sdp.*", "pm.program_name"],
      table: `${tables.specialDietPlan} sdp`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: `sdp.program_id = pm.program_id`,
        },
      ],
      conditions: baseConditions,
      orderBy: ["sequence ASC"],
      pagination,
      search: searchQuery,
      countTotal: true,
    });
    // console.log(specialDiet);
    if (specialDiet.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No special diet plans found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Special diet plans fetched successfully",
      data: {
        data: specialDiet,
        totalPage: Math.ceil(totalCount / limit),
      },
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getSpecialDietPlanById = async (req, res, next) => {
  const { diet_id } = req.params;
  console.log(req.params);
  if (!diet_id) {
    return next(new ErrorHandler("Diet ID not provided", 400));
  }
  try {
    const { results: specialDiet } = await readRecord({
      selectFields: ["sdp.*", "pm.program_name"],
      table: `${tables.specialDietPlan} sdp`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: `sdp.program_id = pm.program_id`,
        },
      ],
      conditions: [
        {
          field: "is_special",
          operator: "=",
          value: 1,
        },
        {
          field: "is_deleted",
          operator: "=",
          value: 0,
        },
        {
          field: "diet_id",
          operator: "=",
          value: diet_id,
        },
      ],
    });
    // console.log(specialDiet);
    if (specialDiet.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No special diet plans found",
        data: {},
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Special diet plan for diet id ${diet_id} fetched successfully`,
      data: specialDiet[0],
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addSpecialDiet = async (req, res, next) => {
  const newData = req.body;
  try {
    const files = req.files;
    if (files && files.length > 0) {
      const images = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.programOfferImages
      );
      newData.attachment = JSON.stringify(images);
    }
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const result = await insertRecord(tables.specialDietPlan, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Special diet plan added successfully",
        data: {
          diet_id: result.insertId,
        },
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add diet", 500));
    }
  } catch (error) {
    console.log(error, 117);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateSpecialDiet = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  const updatedData = req.body;
  console.log(updatedData, 135);
  try {
    const updateResult = await updateRecord(
      tables.specialDietPlan,
      updatedData,
      { diet_id: parseInt(id) }
    );
    console.log(updateRecord);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No diet found with the given", 400));
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
        message: "Special Diet updated successfully ",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating diet id ${id}`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteSpecialDiet = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  try {
    const deleteResult = await updateRecord(
      tables.specialDietPlan,
      { is_deleted: 1 },
      { diet_id: parseInt(id) }
    );
    if (deleteResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No diet found with the given", 400));
    } else if (
      deleteResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (deleteResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Special diet plan deleted successfully",
      });
      return res.status(200).json([apiResponse]);
    } else {
      return next(new ErrorHandler(`Error deleting deit id ${id}`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  specialDietPlanList,
  addSpecialDiet,
  updateSpecialDiet,
  deleteSpecialDiet,
  getSpecialDietPlanById,
};
