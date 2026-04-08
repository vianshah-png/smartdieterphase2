import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { cloudinaryFolders, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addRawVideos = async (req, res, next) => {
  const { title, status } = req.body;
  if (!title) {
    return next(new ErrorHandler("title or videos not provided", 400));
  }
  const files = req.files;
  if (!files) return next(new ErrorHandler("files not provided", 400));
  const videosLink = await uploadArrayOfFilesToCloudinary(
    files,
    cloudinaryFolders.rawVideos,
    title
  );

  try {
    const columns = ["title", "videos"];
    const value = [title, JSON.stringify(videosLink), status];
    const result = await insertRecord(tables.rawVideos, columns, value);
    if (!result) {
      return next(new ErrorHandler("Failed to add raw videos", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Raw videos added successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllVideos = async (_, res, next) => {
  try {
    const { results: result, totalCount } = await readRecord({
      table: tables.rawVideos,
      selectFields: ["id", "title", "videos", "status"],
      conditions: [{ field: "is_deleted", operator: "=", value: 0 }],
      countTotal: true,
    });
    if (!result) {
      return next(new ErrorHandler("No raw videos found", 404));
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Raw videos fetched successfully",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const videos = result.map((item) => {
      return {
        id: item.id,
        title: item.title,
        videos: JSON.parse(item.videos),
        status: item.status,
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Raw videos fetched successfully",
      data: videos,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateRawVideos = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;

  const files = req.files;
  if (files.length > 0) {
    const folderName = cloudinaryFolders.rawVideos;
    const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);
    if (!imageLink) {
      return next(
        new ErrorHandler("Error While uploading Files to cloudinary", 400)
      );
    }
    updatedData.videos = JSON.stringify(imageLink);
  }

  try {
    // Define the condition for the update query
    const condition = { id: parseInt(id) };

    // Perform the database update
    const success = await updateRecord(
      `${tables.rawVideos}`,
      updatedData,
      condition
    );

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Raw videos updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      if (success.info.substring(0, 15) == "Rows matched: 0") {
        return next(
          new ErrorHandler("No raw video found with the given id", 400)
        );
      } else if (
        success.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No changes made to the raw videos",
        });
        return res.status(200).json(apiResponse);
      } else {
        return next(new ErrorHandler("Error While Updating Raw Video", 500));
      }
    }
  } catch (error) {
    console.log("Error updating raw videos:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const removeVideo = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const updatedData = {
      is_deleted: 1,
    };

    const condition = { id: parseInt(id) };
    const deletedRaw = await updateRecord(
      `${tables.rawVideos}`,
      updatedData,
      condition
    );
    if (deletedRaw.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No video found with the given id", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `raw video ${id} deleted Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const changeUsedStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const rawVideos = await readRecord({
      table: `${tables.rawVideos} rv`,
      selectFields: ["rv.status"],
      conditions: [{ field: "rv.id", operator: "=", value: parseInt(id) }],
    });
    if (rawVideos.length === 0) {
      return next(new ErrorHandler("No RawVideos found with given id", 400));
    }

    const updatedStatus = rawVideos[0].status === "used" ? "unused" : "used";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedRawVideo = await updateRecord(
      `${tables.rawVideos}`,
      updatedData,
      condition
    );
    if (!updatedRawVideo) {
      return next(
        new ErrorHandler("Error While Updating raw Videos status", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Raw Video ${id} status changed Successfully`,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Sever Error", 500));
  }
};
export {
  addRawVideos,
  getAllVideos,
  removeVideo,
  updateRawVideos,
  changeUsedStatus,
};
