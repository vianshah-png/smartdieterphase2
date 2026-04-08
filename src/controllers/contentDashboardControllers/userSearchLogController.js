import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getUserSearchLog = async (req, res, next) => {
  const { userId } = req.params;
  if (!userId) {
    return next(new ErrorHandler("User id not provided", 400));
  }
  try {
    const { results: userLogs } = await readRecord({
      table: tables.userSearchLog,
      selectFields: ["*"],
      conditions: [
        { field: "user_id", operator: "=", value: parseInt(userId) },
      ],
    });
    if (userLogs.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No logs found for the user",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const result = userLogs.map((log) => {
      return {
        id: log.id,
        logs: JSON.parse(log.search_logs).reverse(),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Search logs fetched successfully",
      data: result,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addSearchTerm = async (userId, searchTerm) => {
  if (!userId || !searchTerm) {
    throw new Error("User id or search term not provided");
  }

  try {
    const existingLog = await readRecord({
      table: tables.userSearchLog,
      selectFields: ["search_logs"],
      conditions: [
        { field: "user_id", operator: "=", value: parseInt(userId) },
      ],
    });

    let searchLogs;

    if (existingLog.length > 0) {
      searchLogs = JSON.parse(existingLog[0].search_logs);
      searchLogs.push(searchTerm);

      // Keep only the latest 10 logs
      if (searchLogs.length > 10) {
        searchLogs = searchLogs.slice(-10);
      }

      const updatedLog = JSON.stringify(searchLogs);
      await updateRecord(
        tables.userSearchLog,
        { search_logs: updatedLog },
        { user_id: parseInt(userId) }
      );
    } else {
      searchLogs = [searchTerm];

      const newUserLog = {
        user_id: parseInt(userId),
        search_logs: JSON.stringify(searchLogs),
      };
      await insertRecord(
        tables.userSearchLog,
        Object.keys(newUserLog),
        Object.values(newUserLog)
      );
    }

    return {
      status: 200,
      message: "Search term added successfully",
      data: { userId, searchTerm },
    };
  } catch (error) {
    console.error(error);
    throw new Error("Internal Server Error");
  }
};

export { getUserSearchLog, addSearchTerm };
