import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { cloudinaryFolders, redisKeys, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

const getAllPrograms = async (req, res, next) => {
  const { page = 1, limit = 10, search } = req.query;
  try {
    const { results: programs, totalCount } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: ["*"],
      pagination: { limit, page },
      ...(search && {
        search: { searchQuery: search, searchFields: ["pm.program_name"] },
      }),
      countTotal: true,
    });

    if (programs.length === 0) {
      return next(new ErrorHandler("No Programs Found", 404));
    }

    const data = programs.map((program) => {
      return {
        program_id: program.program_id || null,
        program_name: program.program_name || "",
        slug: program.slug,
        web_program_banner: program.web_program_banner || "",
        app_program_banner: program.app_program_banner || "",
        thumbnail: program.thumbnail || "",
        ideal_for_web: safeJSONParse(program.ideal_for_web, []),
        ideal_for_image: program.ideal_for_image || "",
        what_will_i_get_app: safeJSONParse(program.what_will_i_get_app, []),
        what_will_i_get_web: safeJSONParse(program.what_will_i_get_web, []),
        what_will_i_get_yt_link: program.what_will_i_get_yt_link || "",
        stats_card: safeJSONParse(program.stats_card, {}),
        app_stats_image: program.app_stats_image || "",
        program_features_web: safeJSONParse(program.program_features_web, []),
        program_features_app: safeJSONParse(program.program_features_app, []),
        program_description: program.program_description || "",
        who_should_do_it_app: safeJSONParse(program.who_should_do_it_app, []),
        who_should_do_it_web: safeJSONParse(program.who_should_do_it_web, []),
        who_should_do_it_yt_link: program.who_should_do_it_yt_link || "",
        is_active: Number(program.is_active) === 0 ? false : true,
      };
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Programs fetched Successfully",
      data,
      meta_data: {
        currentPage: Number(page),
        totalPage: Math.ceil(totalCount / limit),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(
      "Error occurred while fetching all programs:",
      error.message,
      error.stack
    );
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllProgramNames = async (req, res, next) => {
  try {
    const source = req.headers.source;
    const { user_type } = req.query;

    const conditions = [{ field: "is_active", operator: "=", value: "1" }];
    if (source === "app") {
      
      if (user_type?.toLowerCase() === "lead") {
        conditions.push({
          field: "app_web",
          operator: "IN",
          value: ["Web", "Both"],
        });
      }else{
        conditions.push({
          field: "app_web",
          operator: "=",
          value: "Web",
        });
      }
    }
    if (user_type?.toLowerCase() === "lead") {
      conditions.push({
        field: "app_web",
        operator: "IN",
        value: ["Web", "Both"],
      });
    }
    if (user_type?.toLowerCase() === "client") {
      conditions.push({
        field: "app_web",
        operator: "IN",
        value: ["App", "Both"],
      });
    }
    // else {
    //   conditions.push({
    //     field: "app_web",
    //     operator: "IN",
    //     value: ["App", "Both"],
    //   });
    // }
    const { results: result, totalCount } = await readRecord({
      table: tables.programsMaster,
      selectFields: [`REPLACE(REPLACE(program_name,' (client exclusive advanced)',''),'(Client Exclusive)','') as program_name`, "program_id"],
      conditions,
      countTotal: true,
    });
    if (!result) {
      return next(new ErrorHandler("No programs found", 404));
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Programs fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Programs fetched successfully",
      data: result,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addProgram = async (req, res, next) => {
  try {
    const {
      program_name,
      ideal_for,
      what_will_i_get,
      stats_card,
      program_features,
      program_description,
      yt_links,
      program_category,
      status,
    } = req.body;

    const files = req.files;
    if (!files?.program_banners || !files?.program_thumbnail) {
      return next(
        new ErrorHandler("Program Banner or Thumbnail not provided", 400)
      );
    }

    const [program_banner, program_thumbnail] = await Promise.all([
      uploadArrayOfFilesToCloudinary(files.program_banners),
      uploadArrayOfFilesToCloudinary(files.program_thumbnail),
    ]);

    const columns = [
      "program_name",
      "program_banner",
      "thumbnail",
      "ideal_for",
      "what_will_i_get",
      "stats_card",
      "program_features",
      "program_description",
      "yt_links",
      "program_category",
      "is_active",
    ];

    const values = [
      program_name,
      JSON.stringify(program_banner),
      JSON.stringify(program_thumbnail[0]),
      JSON.stringify(ideal_for),
      JSON.stringify(what_will_i_get),
      JSON.stringify(stats_card),
      JSON.stringify(program_features),
      program_description,
      JSON.stringify(yt_links),
      program_category,
      status === "active" ? 1 : 0,
    ];

    const result = await insertRecord(tables.programsMaster, columns, values);

    if (result.affectedRows !== 1) {
      return next(new ErrorHandler("Failed to add program", 500));
    }

    await redisDelByPattern({ pattern: `${redisKeys.programMaster}*`, redis });

    res.status(201).json(
      new ApiResponse({
        statusCode: 201, // Consistent status
        message: "Program added successfully",
      })
    );
  } catch (error) {
    console.error("Add program error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return next(new ErrorHandler("Duplicate entry", 409));
    }
    next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateProgram = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const {
    slug,
    // ideal_for,
    // what_will_i_get,
    // stats_card,
    // program_features,
    // program_description,
    // yt_links,
    // program_category,
    // status,
  } = req.body;

  const files = req.files;
  let program_banner, program_thumbnail;

  if (files && files.program_banners.length > 0) {
    [program_banner, program_thumbnail] = await Promise.all([
      uploadArrayOfFilesToCloudinary(files.program_banners),
      uploadArrayOfFilesToCloudinary(files.program_thumbnail),
    ]);
  }
  try {
    const condition = { program_id: parseInt(id) };

    const success = await updateRecord(
      `${tables.programsMaster}`,
      { slug: slug },
      condition
    );

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Program updated successfully",
      });
      await redisDelByPattern({
        pattern: `${redisKeys.programMaster}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("No program found with the given id", 400));
    }
  } catch (error) {
    console.error("Error updating program:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteProgram = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;
  if (!id || !deleted_by) {
    return next(new ErrorHandler("id or deleted_by not Provided", 400));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by: deleted_by,
    };
    const condition = { program_id: parseInt(id) };
    const deletedBlog = await updateRecord(
      `${tables.programsMaster}`,
      updatedData,
      condition
    );

    if (!deletedBlog) {
      return next(new ErrorHandler("Error While deleting Program", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Progam ${id} deleted Successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.programMaster}*`,
      redis,
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeProgramStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const { results: programMaster } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: ["pm.is_active"],
      conditions: [
        { field: "pm.program_id", operator: "=", value: parseInt(id) },
      ],
    });
    if (!programMaster)
      return next(new ErrorHandler("Error While fetching program"));
    const updatedStatus = Number(programMaster[0].is_active) === 0 ? 1 : 0;

    const updatedData = {
      is_active: updatedStatus,
    };
    const condition = { program_id: parseInt(id) };
    const updatedProgram = await updateRecord(
      `${tables.programsMaster}`,
      updatedData,
      condition
    );
    if (!updatedProgram) {
      return next(new ErrorHandler("Error While updating Program status"));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Program ${id} status updated`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.programMaster}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const programPageData = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const { results } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: ["*"],
      conditions: [
        { field: "pm.program_id", operator: "=", value: parseInt(id) },
      ],
    });
    if (!results) return next(new ErrorHandler("Error While fetching program"));
    const finalData = {
      program_id: results[0].program_id,
      old_program_id: results[0].old_program_id,
      program_name: results[0].program_name,
      program_short_name: results[0].program_short_name,
      program_category: results[0].program_category,
      program_banner: JSON.parse(results[0].program_banner),
      ideal_for: results[0].ideal_for,
      content: results[0].content,
      program_features: results[0].program_features,
      program_video_url: results[0].program_video_url,
      program_marquee: results[0].program_marquee,
      program_stats: results[0].program_stats,
      hashtags: results[0].hashtags,
      status: results[0].status,
      clients: results[0].clients,
      high_weightloss: results[0].high_weightloss,
      low_weightloss: results[0].low_weightloss,
      avg_weightloss: results[0].avg_weightloss,
      added_date: results[0].added_date,
      added_by: results[0].added_by,
      updated_date: results[0].updated_date,
      updated_by: results[0].updated_by,
      short_description: results[0].short_description,
      program_info: results[0].program_info,
      stats_box: results[0].stats_box,
      slug: results[0].slug,
      how_to_follow: results[0].how_to_follow,
      app_content: results[0].app_content,
      icon: results[0].icon,
      display_on: results[0].display_on,
      youtube_video_id: results[0].youtube_video_id,
      youtube_video_flag: results[0].youtube_video_flag,
      app_feature_detail: results[0].app_feature_detail,
      who_should_try_it: JSON.parse(results[0].who_should_try_it),
      what_will_i_get: results[0].what_will_i_get,
      what_will_i_get_video: results[0].what_will_i_get_video,
      ideal_for_image: JSON.parse(results[0].ideal_for_image),
      desktop_banner: results[0].desktop_banner,
      mobile_banner: results[0].mobile_banner,
      marquee: results[0].marquee,
      is_deleted: results[0].is_deleted,
      deleted_by: results[0].deleted_by,
      deleted_datetime: results[0].deleted_datetime,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Program ${id} fetched`,
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addProgram,
  changeProgramStatus,
  deleteProgram,
  getAllProgramNames,
  getAllPrograms,
  programPageData,
  updateProgram,
};
