import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";

const getAllHashtags = async (_, res, next) => {
  try {
    const getnotDeleted = [{ field: "ht.is_deleted", operator: "=", value: 0 }];
    const hashtags = await readRecord({
      table: `${tables.hashtags} ht`,
      selectFields: ["ht.id", "ht.hashtag_name as tag"],
      conditions: getnotDeleted,
    });
    if (!hashtags) {
      return next(new ErrorHandler("Error While fetching hashtags", 400));
    }
    console.log(hashtags.results.length);
    if (hashtags.results.length == 0) {
      const apiResponse = new ApiResponse(
        200,
        "Hashtags fetched successfully",
        []
      );
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse(
      {
        message : "Hashtags fetched successfully",
        data : hashtags.results,
        totalCount: hashtags.results.length,
      }
    );
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addHashtag = async (req, res, next) => {
  const { hashtag_name, added_by } = req.body;
  if (!hashtag_name || !added_by) {
    return next(new ErrorHandler("hashtag_name or added_by not Provided", 400));
  }

  try {
    const columns = ["hashtag_name", "added_by"];
    const values = [hashtag_name, added_by];
    const result = await insertRecord(`${tables.hashtags}`, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse(200, "Hashtag added successfully");
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add hashtag", 500));
    }
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateTag = async (req, res, next) => {
  const { id } = req.params;

  const { hashtag_name } = req.body;
  if (!hashtag_name || !id) {
    return next(new ErrorHandler("hashtag_name or id Not Provided", 400));
  }
  try {
    const success = await updateRecord(
      `${tables.hashtags}`,
      { hashtag_name: hashtag_name },
      { id: id }
    );
    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse(200, "hashtag updated successfully");
      return res.status(200).json(apiResponse);
    } else {
      if (success.info.substring(0, 15) == "Rows matched: 0") {
        return next(
          new ErrorHandler("No hashtag found with the given id", 400)
        );
      } else if (
        success.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        const apiResponse = new ApiResponse(
          200,
          "No changes made to the hashtag"
        );
        return res.status(200).json(apiResponse);
      } else {
        return next(new ErrorHandler("Error While Updating hashtag", 500));
      }
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteHashtag = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("id not Provided", 500));
    }
    const table = `${tables.hashtags}`;
    const whereCondition = { id: id };
    const updatedData = {
      is_deleted: 1,
    };

    const response = await updateRecord(table, updatedData, whereCondition);
    if (response.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No hashtag found with the given id", 400));
    }
    const apiResponse = new ApiResponse(
      200,
      `hashtag ${id} deleted Successfully`
    );
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addHashtag, deleteHashtag, getAllHashtags, updateTag };
