import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import { v4 as uuidv4 } from "uuid";
import { storeEmbedding } from "../../config/qDrantConfig.js";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import {
  cloudinaryFolders,
  popUpDetailsMap,
  redisKeys,
  tables,
} from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { insertUserVisitLog } from "../../helper/common.js";

const getAllSuccessStories = async (req, res, next) => {
  const {
    page,
    limit,
    search,
    tags,
    programs,
    program_id,
    weight_loss,
    slug,
    id,
    user_id,
    stack,
  } = req.body;

  const source = String(req.headers.source).toLowerCase();
  let conditions = [
    { field: "ss.is_deleted", operator: "=", value: "0" },
    { field: "ss.status", operator: "=", value: "active" },
  ];
  if (id) conditions.push({ field: "ss.id", operator: "=", value: id });
  if (slug) conditions.push({ field: "ss.slug", operator: "=", value: slug });

  let orderBy = [];
  const pagination = { page, limit };
  const searchQuery = search ? { searchQuery: search } : {};

  if (program_id && program_id.length) {
    const orConditions = program_id
      .map((id) => `JSON_CONTAINS(ss.program_id, '${Number(id)}', '$')`)
      .join(" OR ");
    conditions.push({
      field: `(${orConditions})`,
      operator: ``,
      value: "",
      raw: true,
    });
  }

  if (tags && tags.length > 0) {
    conditions.push({
      field: "ss.hashtags",
      operator: "JSON_CONTAINS",
      value: tags,
    });
  }

  if (programs && programs.length > 0) {
    conditions.push({
      field: "ss.program_details",
      operator: "JSON_CONTAINS",
      value: programs.map((item) => `"${item}"`),
      searchIn: "program",
    });
  }

  // weight_loss sorting
  if (weight_loss) {
    orderBy.push(
      weight_loss === "asc" ? "ss.weight_loss ASC" : "ss.weight_loss DESC",
    );
  } else {
    orderBy.push("ss.created_at DESC");
  }
  // stack filtering
  if (stack) {
    conditions.push({ field: "ss.stack", operator: "=", value: stack });
  }
  // Get gender from healthScoreClient
  let gender = null;
  const { results: healthScoreDetails } = await readRecord({
    table: tables.healthScoreClient,
    columns: ["*"],
    conditions: [{ field: "user_id", operator: "=", value: user_id }],
    orderBy: ["id DESC"],
    pagination: { limit: 1 },
  });
  if (healthScoreDetails.length > 0) {
    gender = healthScoreDetails[0].gender; // user's gender
  }

  try {
    const selectFields = [
      "ss.id",
      "ss.photo_before",
      "ss.photo_after",
      "ss.photo_before_after",
      "ss.hashtags",
      "ss.short_descriptions",
      "ss.long_descriptions",
      "ss.insta_handle",
      "ss.slug",
      "ss.priority",
      "ss.testimonial_video",
      "ss.testimonial_video_flag",
      "ss.status",
      "ss.note",
      "ss.confirmation",
      "ss.is_deleted",
      "ss.deleted_by",
      "ss.deleted_at",
      "ss.created_at",
      "ss.updated_at",
      "ss.social_post_id",
      "ss.client_id",
      "ss.health_issues",
      "ss.client_details",
      "ss.program_details",
      "ss.program_id",
      "ss.health_conditions",
      "ss.description",
      "ss.mentor",
      "ss.social_media_id",
      "ss.post",
      "ss.story",
      "ss.what_i_eat_in_a_day",
      "ss.reel_transformation",
      "ss.website_link",
      "ss.weight_loss",
      "ss.yt_link",
      "DATE_FORMAT(ss.last_used_date,'%a %b %d %Y') AS last_used_date",
      "ss.stack",
      "ss.platforms",
    ];
    if (source === "content_db") {
      selectFields.push(
        `(select COUNT(*) from ${tables.contentLikes} cl where cl.content_id = ss.id and cl.content_type = 'success_story' ) as total_likes`,
        `(select COUNT(*) from ${tables.contentShares} cs where cs.content_id = ss.id and cs.content_type = 'success_story') as total_shares`,
      );
    }
    if (source === "content_db") {
      selectFields.push(
        `(select COUNT(*) from ${tables.contentLikes} cl where cl.content_id = ss.id and cl.content_type = 'success_story' ) as total_likes`,
        `(select COUNT(*) from ${tables.contentShares} cs where cs.content_id = ss.id and cs.content_type = 'success_story') as total_shares`,
      );
    }
    if (user_id) {
      const meta_data = {
        device: req.headers.device || req.headers["user-agent"],
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      };
      await insertUserVisitLog({ user_id, page: "success_story", meta_data });
    }

    let orderBy = ["ss.id DESC"];

    // If gender exists, add it into sorting
    if (gender) {
      orderBy = [
        `CASE WHEN LCASE(ss.gender) = '${gender}' THEN 0 ELSE 1 END`,
        "ss.id DESC",
      ];
    }

    const { results: rows, totalCount } = await readRecord({
      table: "success_stories ss",
      selectFields,
      conditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ss.client_id = ud.user_id",
        },
      ],
      pagination,
      search: searchQuery,
      orderBy,
      countTotal: true,
    });

    if (rows.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Success Stories fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    // Construct success stories array
    let successStories = rows.map((row) => {
      console.log(row.stack, 179);
      const clientDetails = JSON.parse(row.client_details || "{}");
      return {
        id: row.id,
        client_details: clientDetails,
        images: [
          ...JSON.parse(row.photo_before || "[]"),
          ...JSON.parse(row.photo_after || "[]"),
          ...JSON.parse(row.photo_before_after || "[]"),
        ],
        program_details: JSON.parse(row.program_details || "[]"),
        health_conditions: JSON.parse(row.health_conditions || "[]"),
        description: row.description,
        status: row.status,
        slug: row.slug,
        short_descriptions: row.short_descriptions,
        long_descriptions: row.long_descriptions,
        social_media_id: row.social_media_id,
        mentor: row.mentor,
        post: row.post ? "done" : "pending",
        story: row.story ? "done" : "pending",
        what_i_eat_in_a_day: row.what_i_eat_in_a_day ? "done" : "pending",
        reel_transformation: row.reel_transformation ? "done" : "pending",
        website_link: row.website_link ? "done" : "pending",
        tags: JSON.parse(row.hashtags || "[]"),
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        yt_link: row.yt_link,
        program_id: JSON.parse(row.program_id || "[]"),
        ...(source === "content_db" && {
          total_likes: row.total_likes || 0,
          total_shares: row.total_shares || 0,
        }),
        last_used_date: row.last_used_date || null,
        stack: row.stack || null,
        platforms: JSON.parse(row.platforms || "[]"),
        ...(source === "content_db" && {
          total_likes: row.total_likes || 0,
          total_shares: row.total_shares || 0,
        }),
        meta_data: {
          total_weight_loss: row.weight_loss,
          check_list: [
            {
              after_photo: JSON.parse(row.photo_after || "[]"),
              before_photo: JSON.parse(row.photo_before || "[]"),
              before_after_photo: JSON.parse(row.photo_before_after || "[]"),
              testimonial_video: JSON.parse(row.testimonial_video || "[]"),
              what_i_eat_in_a_day: row.what_i_eat_in_a_day || "",
              reel_transformation: row.reel_transformation || "",
              story: row.story || "",
              post: row.post || "",
              website_link: row.website_link || "",
            },
          ],
        },
      };
    });

    // --- Sort by gender: user's gender first ---
    // if (gender) {
    //   successStories.sort((a, b) => {
    //     const genderA = a.client_details.gender || "";
    //     const genderB = b.client_details.gender || "";
    //     if (genderA === gender && genderB !== gender) return -1;
    //     if (genderA !== gender && genderB === gender) return 1;
    //     return 0; // keep relative order otherwise
    //   });
    // }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Success Stories fetched successfully",
      data: successStories,
      totalCount,
      meta_data: {
        currentPage: parseInt(page) || 1,
        totalPages: Math.ceil(totalCount / parseInt(limit)) || 1,
      },
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.error("Error in getAllSuccessStories:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addSuccessStories = async (req, res, next) => {
  const newData = req.body;
  const clientDetailsNew = JSON.parse(newData.client_details);

  const files = req.files;

  // Initialize the media variables to null by default.
  let photo_before = null;
  let photo_after = null;
  let photo_before_after = null;
  let testimonial_video = null;

  try {
    const embeddings = [];
    // Upload files only if they are present in the request.
    if (files.photo_before) {
      photo_before = await uploadArrayOfFilesToCloudinary(
        files.photo_before,
        cloudinaryFolders.successStoryImages,
        clientDetailsNew.name,
        // { createEmbedding: true }
      );
      photo_before.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete photo_before[index].embedding;
      });
    }

    if (files.photo_after) {
      photo_after = await uploadArrayOfFilesToCloudinary(
        files.photo_after,
        cloudinaryFolders.successStoryImages,
        clientDetailsNew.name,
        // { createEmbedding: true }
      );

      photo_after.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete photo_after[index].embedding;
      });
    }

    if (files.photo_before_after) {
      photo_before_after = await uploadArrayOfFilesToCloudinary(
        files.photo_before_after,
        cloudinaryFolders.successStoryImages,
        clientDetailsNew.name,
        // { createEmbedding: true }
      );
      photo_before_after.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete photo_before_after[index].embedding;
      });
    }

    if (files.testimonial_video) {
      testimonial_video = await uploadArrayOfFilesToCloudinary(
        files.testimonial_video,
        cloudinaryFolders.successStoryVideos,
        clientDetailsNew.name,
      );
    }

    // Update the newData object with the uploaded media if they exist.
    if (photo_before) {
      newData.photo_before = JSON.stringify(photo_before);
    }
    if (photo_after) {
      newData.photo_after = JSON.stringify(photo_after);
    }
    if (photo_before_after) {
      newData.photo_before_after = JSON.stringify(photo_before_after);
    }
    if (testimonial_video) {
      newData.testimonial_video = JSON.stringify(testimonial_video);
    }

    // Function to sanitize the strings for website link.
    const sanitizeString = (str) => {
      return str
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(" ")
        .join("-");
    };

    const programDetails = JSON.parse(newData.program_details);
    const clientDetails = JSON.parse(newData.client_details);

    if (programDetails.weight_loss) {
      newData.weight_loss = parseFloat(programDetails.weight_loss);
    }
    // Create a website link using sanitized data.
    const websiteLink = `/succes-stories/${sanitizeString(
      programDetails?.program?.toLowerCase(),
    )}-${sanitizeString(clientDetails.name)}-weight-loss-${
      newData.weight_loss
    }kgs`;
    console.log(websiteLink, 456);
    newData.website_link = websiteLink;

    const slug = `${sanitizeString(
      programDetails?.program?.toLowerCase(),
    )}-${sanitizeString(clientDetails.name)}-weight-loss-${
      newData.weight_loss
    }kgs`;
    newData.slug = slug;

    console.log(slug, 466);
    // Handle hashtags and health_conditions as arrays.
    if (newData.hashtags) {
      newData.hashtags = Array.isArray(newData.hashtags)
        ? JSON.stringify(newData.hashtags)
        : `[${newData.hashtags}]`;
    }
    if (newData.health_conditions) {
      newData.health_conditions = Array.isArray(newData.health_conditions)
        ? JSON.stringify(newData.health_conditions)
        : `[${newData.health_conditions}]`;
    }

    if (newData.platforms) {
      newData.platforms = Array.isArray(newData.platforms)
        ? JSON.stringify(newData.platforms)
        : `[${newData.platforms}]`;
    }
    // Convert weight_loss to float if available.

    // If program_id is present, parse it to JSON.
    if (newData.program_id) {
      newData.program_id = JSON.stringify(newData.program_id);
    }

    const columns = Object.keys(newData);
    const values = Object.values(newData);

    console.log(newData, 160);
    console.log(values, 202);

    try {
      const result = await insertRecord(tables.successStories, columns, values);
      console.log(result);

      if (result.affectedRows === 1) {
        embeddings.forEach(async (elem) => {
          const id = uuidv4();
          await storeEmbedding({
            id,
            embedding: elem.embedding,
            metadata: {
              photo_url: elem.photo_url,
              photo_id: result.insertId,
              table: "success_stories",
            },
            collection: "content",
          });
        });
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Success Story added successfully",
        });
        await redisDelByPattern({
          pattern: `${redisKeys.sucessStories}*`,
          redis,
        });
        return res.status(201).json(apiResponse);
      } else {
        return next(new ErrorHandler("Failed to add success story", 500));
      }
    } catch (error) {
      console.log("Error Adding Success Story:", error);
      if (error.code === "ER_DUP_ENTRY")
        return next(new ErrorHandler("Duplicate entry", 500));
      return next(new ErrorHandler("Internal Server Error", 500));
    }
  } catch (error) {
    console.log("Error uploading media files:", error);
    return next(new ErrorHandler("Error uploading media files", 500));
  }
};

const updateSuccessStories = async (req, res, next) => {
  const { id } = req.params;
  const updatedData = req.body;

  if (!id) {
    return next(new ErrorHandler("ID not provided", 500));
  }

  const files = req.files;
  let photo_before, photo_after, photo_before_after, testimonial_video;

  try {
    [photo_before, photo_after, photo_before_after, testimonial_video] =
      await Promise.all([
        files.photo_before
          ? uploadArrayOfFilesToCloudinary(
              files.photo_before,
              cloudinaryFolders.successStoryImages,
            )
          : [],
        files.photo_after
          ? uploadArrayOfFilesToCloudinary(
              files.photo_after,
              cloudinaryFolders.successStoryImages,
            )
          : [],
        files.photo_before_after
          ? uploadArrayOfFilesToCloudinary(
              files.photo_before_after,
              cloudinaryFolders.successStoryImages,
            )
          : [],
        files.testimonial_video
          ? uploadArrayOfFilesToCloudinary(
              files.testimonial_video,
              cloudinaryFolders.successStoryVideos,
            )
          : [],
      ]);
  } catch (error) {
    return next(new ErrorHandler("Error uploading files to Cloudinary", 400));
  }
  const embeddings = [];
  if (photo_before && photo_before?.length > 0) {
    photo_before.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete photo_before[index].embedding;
    });

    updatedData.photo_before = JSON.stringify(photo_before);
  }
  if (photo_after && photo_after?.length > 0) {
    photo_after.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete photo_after[index].embedding;
    });
    updatedData.photo_after = JSON.stringify(photo_after);
  }
  if (photo_before_after && photo_before_after?.length > 0) {
    photo_before_after.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete photo_before_after[index].embedding;
    });
    updatedData.photo_before_after = JSON.stringify(photo_before_after);
  }
  if (testimonial_video && testimonial_video?.length > 0) {
    updatedData.testimonial_video = JSON.stringify(testimonial_video);
  }
  if (updatedData.program_id) {
    updatedData.program_id = JSON.stringify(updatedData.program_id);
  }
  if (updatedData.platforms) {
    updatedData.platforms = Array.isArray(updatedData.platforms)
      ? JSON.stringify(updatedData.platforms)
      : `[${updatedData.platforms}]`;
  }
  // if (updatedData.hashtags) {
  //   updatedData.hashtags = Array.isArray(updatedData.hashtags)
  //     ? JSON.stringify(updatedData.hashtags)
  //     : `[${updatedData.hashtags}]`;
  // }
  // if (updatedData.health_conditions) {
  //   updatedData.health_conditions = Array.isArray(updatedData.health_conditions)
  //     ? JSON.stringify(updatedData.health_conditions)
  //     : `[${updatedData.health_conditions}]`;
  // }

  try {
    const condition = { id: parseInt(id) };
    const updateResult = await updateRecord(
      `${tables.successStories}`,
      updatedData,
      condition,
    );

    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No success story found with the given id", 400),
      );
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
      embeddings.forEach(async (elem) => {
        const uid = uuidv4();
        await storeEmbedding({
          uid,
          embedding: elem.embedding,
          metadata: {
            photo_url: elem.photo_url,
            photo_id: id,
            table: "success_stories",
          },
          collection: "content",
        });
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Success story  updated successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.sucessStories}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
        return next(
          new ErrorHandler(`Success story not found for ID ${id}`, 400),
        );
      }
      return next(
        new ErrorHandler(`Success story not found for ID ${id}`, 400),
      );
    }
  } catch (error) {
    console.error("Error updating success story:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return next(new ErrorHandler("Duplicate entry", 500));
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteSuccessStories = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;

  if (!id || !deleted_by) {
    return next(new ErrorHandler("id or deleted_by not provided", 400));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by: deleted_by,
    };
    const condition = { id: parseInt(id) };
    const deletedBlog = await updateRecord(
      `${tables.successStories}`,
      updatedData,
      condition,
    );
    if (deletedBlog.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Success story ${id} deleted successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.sucessStories}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Success story ${id} not found`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeSuccesStoriesStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const { results: successStory } = await readRecord({
      table: `${tables.successStories} ss`,
      selectFields: ["ss.status"],
      conditions: [{ field: "ss.id", operator: "=", value: parseInt(id) }],
    });
    console.log(successStory, 557);
    if (successStory.length === 0) {
      return next(
        new ErrorHandler("No success story found with the given id", 400),
      );
    }

    const updatedStatus =
      successStory[0].status === "active" ? "inactive" : "active";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedStory = await updateRecord(
      `${tables.successStories}`,
      updatedData,
      condition,
    );
    if (updatedStory) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Success Story ${id} status updated successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.sucessStories}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Success Story ${id} not found`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addSuccessStories,
  changeSuccesStoriesStatus,
  deleteSuccessStories,
  getAllSuccessStories,
  updateSuccessStories,
};
