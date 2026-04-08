import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { cloudinaryFolders, redisKeys, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
const getAllFbPost = async (req, res, next) => {
  const { page, limit, search } = req.query;
  try {
    const selectFields = [
      "fp.id",
      "fp.created_at as dateOfPosted",
      "fp.fb_post_name",
      "fp.content",
      "fp.images",
      "fp.status",
      "fp.link",
      "fp.hashtags_id",
      "fp.fb_account ",
    ];
    const headers = req.headers;
    console.log(headers, 23);

    const getnotDeleted = [{ field: "fp.is_deleted", operator: "=", value: 0 }];

    const rows = await readRecord({
      table: `${tables.fbPost} fp`,
      selectFields: selectFields,
      conditions: getnotDeleted,
      pagination: { limit, page },
      search: { searchQuery: search },
    });
    if (!rows) {
      return next(new ErrorHandler("Error While Fetching allfbPosts", 400));
    }
    if (rows.length === 0) {
      const apiResponse = new ApiResponse(
        200,
        "Fb Post fetched Successfully",
        []
      );
      return res.status(200).json([apiResponse]);
    }

    const allHashtagIds = new Set(
      rows
        .map((row) => JSON.parse(row.hashtags_id))
        .filter((ids) => ids) // Filter out null or undefined
        .flat()
    ); // Flatten the array of arrays

    // Fetch all hashtags in a single query
    const tagsCondition = [
      { field: "h.id", operator: "IN", value: Array.from(allHashtagIds) },
    ];
    const hashtags = await readRecord({
      table: `${tables.hashtags} h`,
      selectFields: ["h.id", "h.hashtag_name"],
      conditions: tagsCondition,
    });

    const hashtagMap = {};
    hashtags.forEach((tag) => {
      hashtagMap[tag.id] = tag.hashtag_name;
    });

    const posts = rows.map((row) => {
      const tags = row.hashtags_id
        ? JSON.parse(row.hashtags_id).map((id) => hashtagMap[id])
        : [];
      console.log(tags, 71);
      return {
        id: row.id,
        fb_post_name: row.fb_post_name,
        content: row.content,
        images: JSON.parse(row.images),
        status: row.status,
        link: row.link,
        tags: tags,
        fb_account: row.fb_account,
        posted_date: row.dateOfPosted,
        meta_data: {
          hashtags_id: JSON.parse(row.hashtags_id),
        },
      };
    });
    await redis.setex(
      `${redisKeys.fbposts} : ${page} : ${limit} : ${search}`,
      30,
      JSON.stringify(posts)
    );
    const apiResponse = new ApiResponse(
      200,
      "Fb Post fetched successfully",
      posts
    );
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addFbPost = async (req, res, next) => {
  const newData = req.body;
  const files = req.files;
  if (!files) return next(new ErrorHandler("images not Provided", 400));
  const folderName = cloudinaryFolders.fbPosts;
  const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);

  if (!imageLink) {
    return next(
      new ErrorHandler("Error While uploading Files to cloudinary", 400)
    );
  }
  newData.images = JSON.stringify(imageLink);
  if (newData.hashtags_id) {
    newData.hashtags_id = Array.isArray(newData.hashtags_id)
      ? JSON.stringify(newData.hashtags_id)
      : `[${newData.hashtags_id}]`;
  }
  const columns = Object.keys(newData);
  const values = Object.values(newData);
  try {
    const result = await insertRecord(`${tables.fbPost}`, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse(
        200,
        "Facebook post added successfully"
      );
      await redisDelByPattern({
        pattern: `${redisKeys.fbposts}*`,
        redis,
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add facebook post", 500));
    }
  } catch (error) {
    console.error("Error creating Facebook post:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateFbPost = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;

  // Convert hashtags and images to JSON strings if they exist
  if (updatedData.hashtags_id) {
    updatedData.hashtags_id = Array.isArray(updatedData.hashtags_id)
      ? JSON.stringify(updatedData.hashtags_id)
      : `[${updatedData.hashtags_id}]`;
  }
  const files = req.files;
  if (files.length > 0) {
    const folderName = cloudinaryFolders.fbPosts;
    const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);
    if (!imageLink) {
      return next(
        new ErrorHandler("Error While uploading Files to cloudinary", 400)
      );
    }
    updatedData.images = JSON.stringify(imageLink);
  }

  try {
    // Define the condition for the update query
    const condition = { id: parseInt(id) };

    // Perform the database update
    const success = await updateRecord(
      `${tables.fbPost}`,
      updatedData,
      condition
    );

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse(
        200,
        "Facebook post updated successfully"
      );
      await redisDelByPattern({
        pattern: `${redisKeys.fbposts}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Updating Facebook post", 400));
    }
  } catch (error) {
    console.error("Error updating Facebook post:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteFbPost = async (req, res, next) => {
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
    const deletedFbPost = await updateRecord(
      `${tables.fbPost}`,
      updatedData,
      condition
    );
    if (!deletedFbPost) {
      return next(new ErrorHandler("Error While deleting FbPost", 400));
    }
    const apiResponse = new ApiResponse(
      200,
      `Fb Post ${id} deleted Successfully`
    );
    await redisDelByPattern({
      pattern: `${redisKeys.fbposts}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeFbPostStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const fbPost = await readRecord({
      table: `${tables.fbPost} fp`,
      selectFields: ["fp.status"],
      conditions: [{ field: "fp.id", operator: "=", value: parseInt(id) }],
    });
    if (fbPost.length === 0) {
      return next(new ErrorHandler("No FbPost found with given id", 400));
    }

    console.log(fbPost);
    const updatedStatus = fbPost[0].status === "active" ? "inactive" : "active";

    console.log(updatedStatus);

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedPost = await updateRecord("fb_posts", updatedData, condition);
    if (!updatedPost) {
      return next(new ErrorHandler("Error While Updating FbPost status", 400));
    }
    const apiResponse = new ApiResponse(
      200,
      `Fb Post ${id} status changed Successfully`
    );
    await redisDelByPattern({
      pattern: `${redisKeys.fbposts}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Sever Error", 500));
  }
};
export {
  addFbPost,
  getAllFbPost,
  changeFbPostStatus,
  deleteFbPost,
  updateFbPost,
};
