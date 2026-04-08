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

const addProgramOfferImages = async (req, res, next) => {
  const { program_id } = req.body;
  const files = req.files;
  if (!program_id || files.length === 0) {
    return next(new ErrorHandler("program_id or files not provided", 500));
  }
  try {
    const images = await uploadArrayOfFilesToCloudinary(
      files,
      cloudinaryFolders.programOfferImages
    );
    console.log(images, 18);
    const columns = ["program_id", "offer_images"];
    const values = [parseInt(program_id), JSON.stringify(images)];
    const newOffer = await insertRecord(
      tables.programOfferImages,
      columns,
      values
    );
    console.log(newOffer, 22);
    const apiResponse = new ApiResponse(201, "Offer image added successfully", {
      offerId: newOffer.insertId,
    });
    return res.status(201).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllProgramOfferImages = async (req, res, next) => {
  const { page, limit, search } = req.body;
  try {
    const joins = [
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "poi.program_id = pm.program_id",
      },
    ];
    const { results: programOfferImages, totalCount } = await readRecord({
      table: `${tables.programOfferImages} poi`,
      selectFields: [
        "poi.id",
        "poi.program_id",
        "poi.offer_images",
        "pm.program_name",
        "pm.program_id",
      ],
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: ["pm.program_name"],
        },
      }),
      joins,
      countTotal: true,
    });
    if (programOfferImages.length === 0) {
      return next(new ErrorHandler("No Offer Images found", 404));
    }
    const result = programOfferImages.map((row) => {
      return {
        id: row.id,
        program_id: row.program_id,
        program_name: row.program_name,
        offer_images: JSON.parse(row.offer_images),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Offer Images fetched successfully",
      data: result,
      totalCount,
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editProgramOfferImages = async (req, res, next) => {
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
        cloudinaryFolders.programOfferImages
      );
      updatedData.offer_images = JSON.stringify(images);
    }

    const updateResult = await updateRecord(
      tables.programOfferImages,
      updatedData,
      { id }
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("No Offer Image found with this id", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Offer Image updated successfully",
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteProgramOfferImages = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not provided", 400));
  }
  try {
    const deleteResult = await deleteRecords(tables.programOfferImages, id, {
      id,
    });
    if (deleteResult.success === false) {
      return next(new ErrorHandler("No Offer Image found with this id", 404));
    }
    console.log(deleteResult);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Offer Image deleted successfully",
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addProgramOfferImages,
  getAllProgramOfferImages,
  editProgramOfferImages,
  deleteProgramOfferImages,
};
