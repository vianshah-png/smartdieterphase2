import { insertRecord, readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addHealthIssues = async (req, res, next) => {
  try {
    const { health_issue } = req.body;
    if (!health_issue)
      return next(new ErrorHandler("Health Issue title Not Provided", 400));
    const columns = ["name"];
    const values = [health_issue];
    const result = await insertRecord(
      `${tables.healthIssues}`,
      columns,
      values
    );
    if (!result.affectedRows === 1) {
      return next(new ErrorHandler("Failed to add Health issue", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Health Issue added successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getHealthIssues = async (_, res, next) => {
  try {
    const selectFields = ["hi.id", "hi.name"];
    const { results: healthIssues, totalCount } = await readRecord({
      table: `${tables.healthIssues} hi`,
      selectFields: selectFields,
      countTotal: true,
    });
    if (!healthIssues) {
      return next(new ErrorHandler("Error While fetching hashtags", 400));
    }
    if (healthIssues.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "health Issues fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "health Issues fetched successfully",
      data: healthIssues,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addHealthIssues, getHealthIssues };
