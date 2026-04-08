import { insertRecord, readRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";

const addUserActivity = async (req, res, next) => {
  const { user_id, type, activity } = req.body;
  if (!user_id || !type || !activity) {
    return next(new ErrorHandler("All fields are required", 500));
  }
  try {
    const { user_id, activity } = req.body;
    const insertResult = await insertRecord(
      tables.userActivityLog,
      ["user_id", "type", "activity_log"],
      [user_id, type, activity]
    );
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Activity added successfully",
      data: insertResult.insertId,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
const getUserActivityLog = async (req, res, next) => {
  const { user_id } = req.query;
  if (!user_id) {
    return next(new ErrorHandler("All fields are required", 500));
  }
  try {
    const { results: userActivityLog } = await readRecord({
      table: tables.userActivityLog,
      selectFields: ["type", "activity_log", "added_date"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    if (userActivityLog.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No activity found",
        data: userActivityLog,
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Activity found successfully",
      data: userActivityLog,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
export { addUserActivity, getUserActivityLog };
