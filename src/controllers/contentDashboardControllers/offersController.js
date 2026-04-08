import {
  deleteRecordNormal,
  insertRecord,
  insertRecordNormal,
  readRecord,
  updateRecord,
  updateRecordNormal,
} from "../../config/query.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import {
  cloudinaryFolders,
  offerTypes,
  tables,
} from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllOffers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const selectFields = [
      "bn_offer.id as offer_id",
      "bn_offer.offer_for as offer_for",
      "bn_offer.offer_title as offer_title",
      "bn_offer.offer_description as offer_description",
      "bn_offer.offer_type as offer_type",
      "bn_offer.offer_discount_percentage as offer_discount_percentage",
      "bn_offer.offer_banners as offer_banners",
      "bn_offer.offer_marquee as offer_marquee",
      "bn_offer.start_date as start_date",
      "bn_offer.end_date as end_date",
      "bn_offer.is_all_program as is_all_program",
      "bn_offer.is_active as is_active",
      "bn_offer.button_1",
      "bn_offer.button_1_redirect",
      "bn_offer.button_1_redirect_id",
      "bn_offer.button_2",
      "bn_offer.button_2_redirect",
      "bn_offer.button_2_redirect_id",
      "bn_offer.program_marquee",
      "bn_offer.recipe_marquee",
      `CONCAT(
        '[', 
        GROUP_CONCAT(DISTINCT
          JSON_OBJECT(
            'offer_log_id', IFNULL(ofl.offer_id, ''),
            'program_id', IFNULL(ofl.program_id, ''),
            'program', IFNULL(pm.program_name, ''),
            'session_details', JSON_OBJECT(
              'session_duration', IFNULL(ps.program_duration, ''),
              'mrp', IFNULL(ps.mrp, ''),
              'program_sessions', IFNULL(ps.program_sessions, ''),
              'session_id', IFNULL(ofl.session_id, '')
            ),
            'discount_amount', IFNULL(ofl.discount_amount, ''),            
            'discount_percent', IFNULL(ofl.discount_percent, '')
          ) SEPARATOR ','
        ),
        ']'
      ) AS offers_details`,
      "bn_offer.redirect_page",
      "bn_offer.redirect_id",
    ];

    const { results: rows, totalCount } = await readRecord({
      table: `${tables.offersNew} bn_offer`,
      selectFields,
      joins: [
        {
          type: "LEFT",
          table: `${tables.offerLogs} ofl`,
          on: "ofl.offer_id = bn_offer.id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "ofl.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ofl.session_id = ps.program_session_id",
        },
      ],
      conditions: [{ field: "bn_offer.is_deleted", operator: "=", value: 0 }],
      countTotal: true,
      orderBy: ["bn_offer.created_at DESC"],
      groupBy: ["bn_offer.id"],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "bn_offer.offer_title",
            "bn_offer.offer_description",
            "bn_offer.offer_type",
            "bn_offer.program_marquee",
            "bn_offer.recipe_marquee",
          ],
        },
      }),
    });

    if (!rows) {
      return next(new ErrorHandler("Error while fetching offers"));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Offers fetched successfully",
      data:
        rows.length > 0
          ? rows.map((i) => {
              return {
                ...i,
                offer_type: offerTypes[i.offer_type],
                offer_type_id: i.offer_type,
                offer_banners: safeJSONParse(i.offer_banners, []),
                start_date: i.start_date,
                end_date: i.end_date,
                is_active: Number(i.is_active) === 0 ? false : true,
                offers_details: safeJSONParse(i.offers_details, []),
              };
            })
          : [],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching offers:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addOffer = async (req, res, next) => {
  try {
    const {
      offer_title,
      offer_description,
      offer_type,
      offer_discount_percentage,
      offer_marquee,
      program_marquee,
      recipe_marquee,
      offer_for, // 0 => APP, 1 => WEB
      start_date,
      end_date,
      status,
      button_1,
      button_1_redirect,
      button_1_redirect_id,
      button_2,
      button_2_redirect,
      button_2_redirect_id,
      offer_details = [],
      is_all_program,
      redirect_page,
      redirect_id,
    } = req.body;

    // Handle file uploads safely
    const files = req.files || [];

    const bannerLinks = files.length
      ? await uploadArrayOfFilesToCloudinary(files)
      : [];

    // Prepare SQL insert query
    const columns = [
      "offer_title",
      "offer_description",
      "offer_banners",
      "offer_type",
      "offer_discount_percentage",
      "offer_marquee",
      "program_marquee",
      "recipe_marquee",
      "start_date",
      "end_date",
      "is_active",
      "is_all_program",
      "offer_for",
      "button_1",
      "button_1_redirect",
      "button_1_redirect_id",
      "button_2",
      "button_2_redirect",
      "button_2_redirect_id",
      "redirect_page",
      "redirect_id",
    ];
    const values = [
      offer_title,
      offer_description,
      JSON.stringify(bannerLinks),
      offer_type,
      offer_discount_percentage,
      offer_marquee,
      program_marquee,
      recipe_marquee,
      start_date,
      end_date,
      String(status).toLowerCase() === "active" ? 1 : 0,
      is_all_program == "true" ? 1 : 0,
      offer_for,
      button_1,
      button_1_redirect,
      button_1_redirect_id,
      button_2,
      button_2_redirect,
      button_2_redirect_id,
      redirect_page,
      redirect_id,
    ];

    // Insert into offers table
    const insertResult = await insertRecord(
      `${tables.offersNew}`,
      columns,
      values
    );

    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while adding Offer", 400));
    }

    if (is_all_program === "true") {
      return res.status(201).json(
        new ApiResponse({
          statusCode: 200,
          message: "Offer applied to all programs",
          offer_id: insertResult.insertId,
        })
      );
    }

    const offer_id = insertResult.insertId;
    const parsedOfferDetails = Array.isArray(offer_details)
      ? offer_details
      : JSON.parse(offer_details || "[]");

    if (parsedOfferDetails.length === 0) {
      return res.status(201).json(
        new ApiResponse({
          statusCode: 200,
          message: "Offer added but no sessions provided",
          offer_id,
        })
      );
    }
    if (parsedOfferDetails.length > 0) {
      for (const detail of parsedOfferDetails) {
        const {
          program_id,
          program_session_id,
          discount_percentage,
          discount_amount,
        } = detail;

        if (
          !program_id ||
          discount_percentage === undefined ||
          discount_amount === undefined
        ) {
          return next(new ErrorHandler("Missing required offer details", 400));
        }

        const offerLogColumns = [
          "offer_id",
          "program_id",
          "session_id",
          "discount_percent",
          "discount_amount",
        ];
        const offerLogValues = [
          offer_id,
          program_id,
          program_session_id || null,
          discount_percentage,
          discount_amount,
        ];

        const insertedOfferLogsResult = await insertRecord(
          `${tables.offerLogs}`,
          offerLogColumns,
          offerLogValues
        );

        if (insertedOfferLogsResult.affectedRows === 0) {
          return next(new ErrorHandler("Error while adding offer logs", 400));
        }
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Offers added successfully",
        offer_id,
      })
    );
  } catch (error) {
    console.error("Error Adding Offer:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return next(new ErrorHandler("Duplicate entry", 500));
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateOffer = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;

  const files = req.files;
  if (files) {
    const folderName = cloudinaryFolders.offers;
    const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);
    if (!imageLink)
      return next(
        new ErrorHandler("Error While uploading files to Cloudinary", 400)
      );
    updatedData.images = JSON.stringify(imageLink);
  }

  try {
    // Define the condition for the update query
    const condition = { id: parseInt(id) };

    // Perform the database update
    const success = await updateRecord(
      `${tables.offers}`,
      updatedData,
      condition
    );

    console.log(success);
    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Offer updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      if (success.info.substring(0, 15) == "Rows matched: 0")
        return next(new ErrorHandler("No offer found with the given id", 400));
      console.log(success.info.substring(0, 28));
      if (success.info.substring(0, 27) == "Rows matched: 1  Changed: 0") {
        return next(new ErrorHandler("No changes made to the offer", 400));
      }
    }
  } catch (error) {
    console.error("Error updating Offer:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editOffer = async (req, res, next) => {
  try {
    const {
      offer_id,
      offer_title,
      offer_description,
      offer_type,
      offer_discount_percentage,
      offer_marquee,
      program_marquee,
      recipe_marquee,
      offer_for, // 0 => APP, 1 => WEB
      start_date,
      end_date,
      status,
      offer_details = [],
      is_all_program,
      button_1,
      button_1_redirect,
      button_1_redirect_id,
      button_2,
      button_2_redirect,
      button_2_redirect_id,
      redirect_page,
      redirect_id,
    } = req.body;

    if (!offer_id) {
      return next(new ErrorHandler("Offer ID is required for editing", 400));
    }

    const files = req.files || [];

    const bannerLinks = files.length
      ? await uploadArrayOfFilesToCloudinary(files)
      : [];

    const updateFields = [
      "offer_title",
      "offer_description",
      ...(bannerLinks.length > 0 ? ["offer_banners"] : []),
      "offer_type",
      "offer_discount_percentage",
      "offer_marquee",
      "program_marquee",
      "recipe_marquee",
      "start_date",
      "end_date",
      "is_active",
      "is_all_program",
      "offer_for",
      "button_1",
      "button_1_redirect",
      "button_1_redirect_id",
      "button_2",
      "button_2_redirect",
      "button_2_redirect_id",
      "redirect_page",
      "redirect_id",
    ];

    const updateValues = [
      offer_title,
      offer_description,
      ...(bannerLinks.length > 0 ? [JSON.stringify(bannerLinks)] : []),
      offer_type,
      offer_discount_percentage,
      offer_marquee,
      program_marquee,
      recipe_marquee,
      start_date,
      end_date,
      String(status).toLowerCase() === "active" ? 1 : 0,
      is_all_program == "true" ? 1 : 0,
      offer_for,
      button_1,
      button_1_redirect,
      button_1_redirect_id,
      button_2,
      button_2_redirect,
      button_2_redirect_id,
      redirect_page,
      redirect_id,
    ];

    const updateResult = await updateRecordNormal(
      `${tables.offersNew}`,
      updateFields,
      updateValues,
      "id",
      offer_id
    );

    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("No rows updated. Invalid Offer ID?", 400));
    }

    if (is_all_program === "true" || is_all_program === true) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Offer updated for all programs",
          offer_id,
        })
      );
    }

    await deleteRecordNormal(`${tables.offerLogs}`, "offer_id", offer_id);

    const parsedOfferDetails = Array.isArray(offer_details)
      ? offer_details
      : JSON.parse(offer_details || "[]");

    for (const detail of parsedOfferDetails) {
      const {
        program_id,
        program_session_id,
        discount_percentage,
        discount_amount,
      } = detail;

      if (
        !program_id ||
        discount_percentage === undefined ||
        discount_amount === undefined
      ) {
        return next(new ErrorHandler("Missing required offer details", 400));
      }

      const offerLogColumns = [
        "offer_id",
        "program_id",
        "session_id",
        "discount_percent",
        "discount_amount",
      ];
      const offerLogValues = [
        offer_id,
        program_id,
        program_session_id || null,
        discount_percentage,
        discount_amount,
      ];

      const insertedOfferLogsResult = await insertRecordNormal(
        `${tables.offerLogs}`,
        offerLogColumns,
        offerLogValues
      );

      if (insertedOfferLogsResult.affectedRows === 0) {
        return next(new ErrorHandler("Error while adding offer logs", 400));
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Offer updated successfully",
        offer_id,
      })
    );
  } catch (error) {
    console.error("Error Editing Offer:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteOffer = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;
  if (!id || !deleted_by) {
    return next(new ErrorHandler("id or deleted_by is not Provided", 500));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by: deleted_by,
    };
    const condition = { id: parseInt(id) };
    const deletedOffer = await updateRecord(
      `${tables.offersNew}`,
      updatedData,
      condition
    );
    console.log(deletedOffer);
    if (!deletedOffer) {
      return next(new ErrorHandler("Error While deleting offer", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: `Offer ${id} deleted successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeOfferStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const { results: offer } = await readRecord({
      table: `${tables.offersNew}`,
      selectFields: ["is_active"],
      conditions: [{ field: "id", operator: "=", value: parseInt(id) }],
    });
    if (offer.length === 0) {
      return next(new ErrorHandler("No offers found with the given id"));
    }
    const updatedStatus = Number(offer[0].is_active) === 0 ? 1 : 0;

    const updatedData = {
      is_active: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedPost = await updateRecord(
      `${tables.offersNew}`,
      updatedData,
      condition
    );
    if (!updatedPost) {
      return next(new ErrorHandler("Error While updating offer status", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: `offer ${id} status updated Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addOffer,
  changeOfferStatus,
  deleteOffer,
  getAllOffers,
  updateOffer,
  editOffer,
};
