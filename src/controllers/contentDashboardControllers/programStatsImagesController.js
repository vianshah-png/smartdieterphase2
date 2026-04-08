import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { cloudinaryFolders, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addProgramStatsImages = async (req, res, next) => {
  const { program_id } = req.body;
  const files = req.files;
  if (!program_id || files.length === 0) {
    return next(new ErrorHandler("program_id or files not provided", 500));
  }
  try {
    const images = await uploadArrayOfFilesToCloudinary(
      files,
      cloudinaryFolders.programStatsImages
    );
    console.log(images, 18);
    const columns = ["program_id", "stats_images"];
    const values = [program_id, JSON.stringify(images)];
    const newOffer = await insertRecord(
      tables.programStatsImages,
      columns,
      values
    );
    console.log(newOffer, 22);
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Program Stats image added successfully",
      data: {
        statsId: newOffer.insertId,
      },
    });
    return res.status(201).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllProgramStatsImages = async (req, res, next) => {
  const { page, limit, search } = req.query;
  try {
    const joins = [
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "poi.program_id = pm.program_id",
      },
    ];
    const { results: programStatsImages, totalCount } = await readRecord({
      table: `${tables.programStatsImages} poi`,
      selectFields: [
        "poi.id",
        "poi.program_id",
        "poi.stats_images",
        "pm.program_name",
        "pm.program_id",
      ],
      joins,
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: ["pm.program_name"],
        },
      }),
      orderBy: ["poi.added_date DESC"],
    });
    if (programStatsImages.length === 0) {
      return next(new ErrorHandler("No program stats images found", 404));
    }
    console.log(programStatsImages);
    const result = programStatsImages.map((row) => {
      return {
        id: row.id,
        program_id: row.program_id,
        program_name: row.program_name,
        offer_images: JSON.parse(row.stats_images),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Stats Images fetched successfully",
      data: result,
      totalCount,
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editProgramStatsImages = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  const updatedData = req.body;
  const files = req.files;
  console.log(updatedData);
  try {
    if (files.length > 0) {
      const images = await uploadArrayOfFilesToCloudinary(
        files,
        cloudinaryFolders.programStatsImages
      );
      updatedData.stats_images = JSON.stringify(images);
    }

    const updateResult = await updateRecord(
      tables.programStatsImages,
      updatedData,
      { id }
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry found with the given id", 400));
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
        message: `program stats image  updated successfully`,
      });
      return res.status(200).json(apiResponse);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteProgramStatsImages = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  try {
    const deleteResult = await deleteRecords(tables.programStatsImages, id, {
      id,
    });
    if (deleteResult.success === false) {
      return next(new ErrorHandler("No Stats Image found with this id", 404));
    }
    console.log(deleteResult);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Stats Image deleted successfully",
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addProgramStatsImages,
  getAllProgramStatsImages,
  editProgramStatsImages,
  deleteProgramStatsImages,
};
