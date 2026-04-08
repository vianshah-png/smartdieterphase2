import { storeEmbedding } from "../../config/qDrantConfig.js";
import { v4 as uuidv4 } from "uuid";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { cloudinaryFolders, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { insertUserVisitLog } from "../../helper/common.js";
import { raw } from "express";
async function insertSocialPostVisitLog({
  post_type,
  post_sub_type,
  user_id,
  meta_data,
}) {
  let page = "";
  console.log(post_sub_type, 101010);
  if (post_type && post_type === "reel") {
    page = "reel";
  } else {
    page = "tips";
  }
  try {
    const { status, message } = await insertUserVisitLog({
      page,
      user_id,
      meta_data,
    });
    console.log("Social post visit log inserted:", status, message);
    return true;
  } catch (error) {
    console.log("Error inserting social post visit log:", error);
    return false;
  }
}
const getAllSocialPost = async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    social_platform,
    tags,
    social_handle,
    post_type,
    post_sub_type,
    id,
    user_id,
  } = req.body;

  const video_id = req.body.video_id;

  let conditions = [];
  const pagination = { page, limit };
  const searchQuery = search ? { searchQuery: decodeURIComponent(search) } : {};
  const source = req.headers["source"] || "unknown";
  if (id) {
    if (source === "app") {
      conditions.push({ field: "id", operator: "!=", value: id });
    } else {
      conditions.push({ field: "id", operator: "=", value: id });
    }
  }
  if (social_handle && social_handle.length > 0) {
    conditions.push({
      field: "accounts",
      operator: "LIKE",
      value: [...social_handle],
    });
  }
  if (user_id) {
    const meta_data = {
      device: req.headers["source"] || req.headers["user-agent"] || "unknown",
      ip:
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        "unknown",
    };
    if (
      (post_type && post_type.length > 0) ||
      (post_sub_type && post_sub_type.length > 0)
    ) {
      const payload = {
        ...(post_type?.length > 0 && { post_type: post_type[0] }),
        ...(post_sub_type?.length > 0 && { post_sub_type: post_sub_type[0] }),
        user_id,
        meta_data,
      };

      if (post_type?.length > 0 || post_sub_type?.length > 0) {
        await insertSocialPostVisitLog(payload);
      }
    }
  }
  if (social_platform && social_platform.length > 0) {
    console.log(social_platform, 10);
    let value = [];
    social_platform.forEach((item) => {
      value.push(`"${item}"`);
    });
    conditions.push({
      field: "posted_on",
      operator: "JSON_CONTAINS",
      value: [...value],
    });
  }
  // if (Array.isArray(tags) && tags && tags.length > 0) {
  //   let value = [];
  //   tags.forEach((item) => {
  //     value.push(`"${item}"`);
  //   });
  //   conditions.push({
  //     field: "tags",
  //     operator: "JSON_CONTAINS",
  //     value: [...value],
  //   });
  // }

  if (tags && source === "app") {
    conditions.push({
      field: `LOWER(tags) LIKE '%"${tags.toLowerCase()}"%'`,
      operator: "",
      value: ``,
      raw: true,
    });
  }

  if (post_type && post_type.length > 0) {
    conditions.push({ field: "post_type", operator: "IN", value: post_type });
    if (post_type == "reel") {
      conditions.push({
        field: "video",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      });
    }
  }
  if (post_sub_type && post_sub_type.length > 0) {
    conditions.push({
      field: "post_sub_type",
      operator: "IN",
      value: post_sub_type,
    });
  }
  console.log(conditions, 56);
  try {
    const selectFields = [
      "id",
      "post_type",
      "post_sub_type",
      "image",
      "video",
      "description",
      "tags",
      "post_link",
      "posted_on",
      "accounts",
      "thumbnail_image",
      "title",
      "created_at",
      "updated_at",
      "platforms",
      "DATE_FORMAT(last_used_date,'%a %b %d %Y') AS last_used_date",
      "program_name",
    ];
    if (user_id) {
      selectFields.push(
        `CASE WHEN EXISTS(SELECT 1 FROM ${tables.contentLikes} cl WHERE cl.user_id = ${user_id} AND cl.content_id = sp.id AND cl.content_type = 'reel') THEN 1 ELSE 0 END AS liked`,
        `(SELECT COUNT(*) FROM ${tables.contentLikes} WHERE content_id = sp.id AND content_type = 'reel') AS like_count`,
        `(SELECT COUNT(*) FROM ${tables.contentShares} WHERE content_id = sp.id AND content_type = 'reel') AS share_count`,
      );

      if (video_id) {
        selectFields.push(
          `CASE WHEN sp.id = '${video_id}' THEN 0 ELSE 1 END AS priority`,
        );
      }
    }
    if (source === "content_db") {
      selectFields.push(
        `(select COUNT(*) from ${tables.contentLikes} cl where cl.content_id = sp.id and cl.content_type = 'reel' ) as total_likes`,
        `(select COUNT(*) from ${tables.contentShares} cs where cs.content_id = sp.id and cs.content_type = 'reel') as total_shares`,
      );
    }
    let orderBy = [];
    if (video_id) {
      orderBy = ["priority ASC", "created_at DESC"];
    } else {
      orderBy = ["created_at DESC"];
    }
    const { results, totalCount } = await readRecord({
      table: `${tables.socialPost} sp`,
      selectFields,
      conditions,
      pagination,
      search: searchQuery,
      countTotal: true,
      orderBy: orderBy,
    });
    const { results: singlePost } = await readRecord({
      selectFields,
      table: `${tables.socialPost} sp`,
      conditions: [{ field: "id", operator: "=", value: id }],
    });
    if (results.length === 0 && source !== "app") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No post found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const finalResult = results.map((row) => {
      return {
        id: row.id,
        postType: row.post_type,
        postSubType: row.post_sub_type,
        title: row.title,
        description: row.description,
        postedOn: safeJSONParse(row.posted_on, ""),
        fb_account: safeJSONParse(row.accounts)?.fb_account || "",
        insta_account: safeJSONParse(row.accounts)?.insta_account || "",
        twitter: safeJSONParse(row.accounts)?.twitter || "",
        youtube_account: safeJSONParse(row.accounts)?.youtube_account || "",
        ...(user_id
          ? {
              liked: Number(row.liked) == 1 ? true : false,
              like_count: Number(row.like_count),
              share_count: Number(row.share_count),
            }
          : {}),
        image: safeJSONParse(row.image, ""),
        video: safeJSONParse(row.video, []),
        tags: safeJSONParse(row.tags, ""),
        postLink: row.post_link,
        thumbnailImage: safeJSONParse(row.thumbnail_image, ""),
        ...(source === "content_db" && {
          total_likes: row.total_likes || 0,
          total_shares: row.total_shares || 0,
        }),
        created_at: row.created_at,
        updated_at: row.updated_at,
        platforms: safeJSONParse(row.platforms, []),
        last_used_date: row.last_used_date,
        program_name: row.program_name,
      };
    });
    const single_post = singlePost.map((row) => {
      return {
        id: row.id,
        postType: row.post_type,
        postSubType: row.post_sub_type,
        title: row.title,
        description: row.description,
        postedOn: safeJSONParse(row.posted_on, ""),
        fb_account: safeJSONParse(row.accounts)?.fb_account || "",
        insta_account: safeJSONParse(row.accounts)?.insta_account || "",
        twitter: safeJSONParse(row.accounts)?.twitter || "",
        youtube_account: safeJSONParse(row.accounts)?.youtube_account || "",
        ...(user_id
          ? {
              liked: Number(row.liked) == 1 ? true : false,
              like_count: Number(row.like_count),
              share_count: Number(row.share_count),
            }
          : {}),
        image: safeJSONParse(row.image, ""),
        video: safeJSONParse(row.video, []),
        tags: safeJSONParse(row.tags, ""),
        postLink: row.post_link,
        thumbnailImage: safeJSONParse(row.thumbnail_image, ""),
        created_at: row.created_at,
        updated_at: row.updated_at,
        program_name: row.program_name,
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "all social post fetched successfully",
      data:
        user_id && single_post.length
          ? [single_post[0], ...finalResult]
          : finalResult,
      totalCount,
      meta_data: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to fetch", 500));
  }
};

const getVideoById = async (req, res, next) => {
  const {
    video_id, // Get video_id from the request body
    user_id,
    page = 1,
    limit = 10,
  } = req.body;

  // Conditions to filter based on video_id
  let conditions = [];
  const pagination = { page, limit };

  // Check if video_id is provided
  if (video_id) {
    conditions.push({
      field: "id", // Assuming `id` is the video ID in the database
      operator: "=",
      value: video_id,
    });
  } else {
    return res.status(400).json({
      message: "Video ID is required to fetch the post.",
    });
  }

  // Prepare select fields
  const selectFields = [
    "id",
    "post_type",
    "post_sub_type",
    "image",
    "video",
    "description",
    "tags",
    "post_link",
    "posted_on",
    "accounts",
    "thumbnail_image",
    "title",
    "created_at",
    "updated_at",
    "platforms",
    "DATE_FORMAT(last_used_date,'%a %b %d %Y') AS last_used_date",
    "program_name",
  ];

  if (user_id) {
    selectFields.push(
      `CASE WHEN EXISTS(SELECT 1 FROM ${tables.contentLikes} cl WHERE cl.user_id = ${user_id} AND cl.content_id = sp.id AND cl.content_type = 'reel') THEN 1 ELSE 0 END AS liked`,
      `(SELECT COUNT(*) FROM ${tables.contentLikes} WHERE content_id = sp.id AND content_type = 'reel') AS like_count`,
      `(SELECT COUNT(*) FROM ${tables.contentShares} WHERE content_id = sp.id AND content_type = 'reel') AS share_count`
    );
  }

  try {
    const { results, totalCount } = await readRecord({
      table: `${tables.socialPost} sp`,
      selectFields,
      conditions,
      pagination,
      countTotal: true,
      orderBy: ["created_at DESC"], // Default sorting by created_at
    });

    // If no results are found
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No post found for this video.",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const finalResult = results.map((row) => {
      return {
        id: row.id,
        postType: row.post_type,
        postSubType: row.post_sub_type,
        title: row.title,
        description: row.description,
        postedOn: safeJSONParse(row.posted_on, ""),
        fb_account: safeJSONParse(row.accounts)?.fb_account || "",
        insta_account: safeJSONParse(row.accounts)?.insta_account || "",
        twitter: safeJSONParse(row.accounts)?.twitter || "",
        youtube_account: safeJSONParse(row.accounts)?.youtube_account || "",
        ...(user_id
          ? {
              liked: Number(row.liked) == 1 ? true : false,
              like_count: Number(row.like_count),
              share_count: Number(row.share_count),
            }
          : {}),
        image: safeJSONParse(row.image, ""),
        video: safeJSONParse(row.video, []),
        tags: safeJSONParse(row.tags, ""),
        postLink: row.post_link,
        thumbnailImage: safeJSONParse(row.thumbnail_image, ""),
        created_at: row.created_at,
        updated_at: row.updated_at,
        platforms: safeJSONParse(row.platforms, []),
        last_used_date: row.last_used_date,
        program_name: row.program_name,
      };
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Post fetched successfully based on Video ID",
      data: finalResult,
      totalCount,
      meta_data: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Failed to fetch video post", 500));
  }
};


const getPostNames = async (req, res, next) => {
  try {
    const selectFields = ["id", "post_type", "title"];
    const { results } = await readRecord({
      table: tables.socialPost,
      selectFields,
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No post found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Post Names fetched Successfully",
      data: results.map((row) => ({
        id: row.id,
        postType: row.post_type,
        title: row.title,
      })),
    });
    return res.status(200).json([apiresponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addSocialPost = async (req, res, next) => {
  console.log(109);
  try {
    const newData = req.body;
    console.log(req.files, 112);
    console.log(newData, 111);

    // Prepare promises for file uploads only if files are provided
    const uploadPromises = [];
    const embeddings = [];
    // Upload images if they exist
    if (req.files && req.files.image) {
      uploadPromises.push(
        uploadArrayOfFilesToCloudinary(
          req.files.image,
          cloudinaryFolders.socialPostImages,
          newData.title,
          // {
          //   createEmbedding: true,
          // }
        ).then((images) => {
          console.log(images, 196);
          // return false;
          images.forEach((image, index) => {
            embeddings.push({
              embedding: image.embedding,
              photo_url: image.file.path,
            });
            delete images[index].embedding;
          });
          if (images.length > 0) {
            newData.image = JSON.stringify(images);
          }
        }),
      );
    }
    // return false;
    // Upload videos if they exist
    if (req.files && req.files.video) {
      uploadPromises.push(
        uploadArrayOfFilesToCloudinary(
          req.files.video,
          cloudinaryFolders.socialPostVideos,
          newData.title,
        ).then((videos) => {
          if (videos.length > 0) {
            newData.video = JSON.stringify(videos);
          }
        }),
      );
    }

    // Upload thumbnail image if it exists
    if (req.files && req.files.thumbnail_image) {
      uploadPromises.push(
        uploadArrayOfFilesToCloudinary(
          req.files.thumbnail_image,
          cloudinaryFolders.socialPostImages,
          newData.title,
        ).then((thumbnail_image) => {
          thumbnail_image.forEach((image, index) => {
            embeddings.push({
              embedding: image.embedding,
              photo_url: image.file.path,
            });
            delete thumbnail_image[index].embedding;
          });
          if (thumbnail_image.length > 0) {
            newData.thumbnail_image = JSON.stringify(thumbnail_image);
          }
        }),
      );
    }

    // Wait for all file uploads to finish before proceeding
    await Promise.all(uploadPromises);

    console.log(newData, 198);

    // Insert the new social post into the database
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const newPost = await insertRecord(tables.socialPost, columns, values);

    console.log(newPost);
    if (!newPost) {
      return next(new ErrorHandler("Error while adding new post", 400));
    }

    embeddings.forEach(async (elem) => {
      const id = uuidv4();
      await storeEmbedding({
        id,
        embedding: elem.embedding,
        metadata: {
          photo_url: elem.photo_url,
          photo_id: newPost.insertId,
          table: "social_post",
        },
        collection: "content",
      });
    });
    // Return success response
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Social post added successfully",
      data: {
        postId: newPost.insertId,
      },
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error, 152);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editSocialPost = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const newData = req.body;
    const embeddings = [];
    if (req.files.image) {
      const images = await uploadArrayOfFilesToCloudinary(
        req.files.image,
        cloudinaryFolders.socialPostImages,
        req.files.image[0].originalname,
        // {
        //   createEmbedding: true,
        // }
      );
      images.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete images[index].embedding;
      });
      newData.image = JSON.stringify(images);
    }
    if (req.files.video) {
      const videos = await uploadArrayOfFilesToCloudinary(
        req.files.video,
        cloudinaryFolders.socialPostVideos,
      );
      newData.video = JSON.stringify(videos);
    }

    if (req.files.thumbnail_image) {
      const thumbnail_image = await uploadArrayOfFilesToCloudinary(
        req.files.thumbnail_image,
        cloudinaryFolders.socialPostImages,
      );
      thumbnail_image.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete thumbnail_image[index].embedding;
      });
      newData.thumbnail_image = JSON.stringify(thumbnail_image);
    }

    const updateResult = await updateRecord(tables.socialPost, newData, {
      id: id,
    });

    console.log(updateResult, 349);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No post found with the given id", 400));
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
            table: "social_post",
          },
          collection: "content",
        });
      });
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Social post updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error while updating post", 400));
    }
  } catch (error) {
    console.log(error, 152);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteSocialPost = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const deletedPost = await deleteRecords(tables.socialPost, id, {
      id: parseInt(id),
    });
    if (deletedPost.success === false) {
      return next(
        new ErrorHandler(
          "No social post deleted  (possible cause :there isn't any social post exist with the given id)",
          400,
        ),
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Social post deleted successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 204);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  getAllSocialPost,
  addSocialPost,
  editSocialPost,
  deleteSocialPost,
  getPostNames,
  getVideoById
};
