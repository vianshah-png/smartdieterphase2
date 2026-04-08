import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { cloudinaryFolders, redisKeys, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";

const getAllInstaPost = async (req, res, next) => {
  const { page, limit, search } = req.query;
  try {
    const selectFields = [
      "ip.id",
      "ip.created_at",
      "ip.insta_post_name",
      "ip.content",
      "ip.images",
      "ip.status",
      "ip.link",
      "ip.hashtags_id",
      "ip.insta_account ",
    ];
    const getnotDeleted = [{ field: "ip.is_deleted", operator: "=", value: 0 }];
    const rows = await readRecord({
      table: `${tables.instPosts} ip`,
      selectFields: selectFields,
      conditions: getnotDeleted,
      pagination: { limit, page },
      search: { searchQuery: search },
    });
    if (!rows) {
      return next(new ErrorHandler("Error fetching instaPost", 400));
    } else if (rows.length === 0) {
      const apiResponse = new ApiResponse(
        200,
        "Insta Post fetched successfully",
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
    if (!hashtags)
      return next(new ErrorHandler("Error While fetching Hashtags", 400));
    const hashtagMap = {};
    hashtags.forEach((tag) => {
      hashtagMap[tag.id] = tag.hashtag_name;
    });

    const posts = rows.map((row) => {
      const tags = row.hashtags_id
        ? JSON.parse(row.hashtags_id).map((id) => hashtagMap[id])
        : [];

      return {
        id: row.id,
        insta_post_name: row.insta_post_name,
        content: row.content,
        images: JSON.parse(row.images),
        status: row.status,
        link: row.link,
        tags: tags,
        insta_account: row.insta_account,
        posted_date: row.created_at,
        meta_data: {
          hashtags_id: JSON.parse(row.hashtags_id),
        },
      };
    });
    await redis.setex(
      `${redisKeys.instaPosts} : ${page} : ${limit} : ${search}`,
      30,
      JSON.stringify(posts)
    );
    const apiResponse = new ApiResponse(
      200,
      "Insta Posts fetched Successfully",
      posts
    );
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addInstaPost = async (req, res, next) => {
  const newData = req.body;

  const files = req.files;
  const folderName = cloudinaryFolders.instaPosts;
  const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);

  if (!imageLink)
    return next(
      new ErrorHandler("Error While uploading Files on Cloudinary", 400)
    );
  newData.images = JSON.stringify(imageLink);
  if (newData.hashtags_id) {
    newData.hashtags_id = Array.isArray(newData.hashtags_id)
      ? JSON.stringify(newData.hashtags_id)
      : `[${newData.hashtags_id}]`;
  }
  const columns = Object.keys(newData);
  const values = Object.values(newData);

  try {
    const result = await insertRecord(`${tables.instPosts}`, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse(
        200,
        "Instagram post added successfully"
      );
      await redisDelByPattern({
        pattern: `${redisKeys.instaPosts}*`,
        redis,
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add instagram post", 500));
    }
  } catch (error) {
    console.error("Error creating Instagram post:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateInstaPost = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;

  const files = req.files;
  if (files.length > 0) {
    const folderName = cloudinaryFolders.instaPosts;
    const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);
    if (!imageLink) {
      return next(
        new ErrorHandler("Error While uploading Files cloudinary", 400)
      );
    }
    updatedData.images = JSON.stringify(imageLink);
  }
  if (updatedData.hashtags_id) {
    updatedData.hashtags_id = Array.isArray(updatedData.hashtags_id)
      ? JSON.stringify(updatedData.hashtags_id)
      : `[${updatedData.hashtags_id}]`;
  }

  try {
    const condition = { id: parseInt(id) };
    const success = await updateRecord(
      `${tables.instPosts}`,
      updatedData,
      condition
    );
    console.log(success);

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse(
        200,
        "Insta post updated successfully"
      );
      await redisDelByPattern({
        pattern: `${redisKeys.instaPosts}*`,
        redis,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler("No error post found with the given id", 400)
      );
    }
  } catch (error) {
    console.error("Error updating Instagram post:", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteInstaPost = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;
  if (!id || !deleted_by) {
    return next(new ErrorHandler("id or deleted_by  not Provided", 500));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by: deleted_by,
    };
    const condition = { id: parseInt(id) };
    const deletedInstaPost = await updateRecord(
      `${tables.instPosts}`,
      updatedData,
      condition
    );
    if (!deletedInstaPost) {
      return next(new ErrorHandler("Error While deleting InstaPost", 400));
    }
    const apiResponse = new ApiResponse(
      200,
      `InstaPost ${id} deleted Successfully`
    );
    await redisDelByPattern({
      pattern: `${redisKeys.instaPosts}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeInstaPostStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const instaPost = await readRecord({
      table: "insta_posts ip",
      selectFields: ["ip.status"],
      conditions: [{ field: "ip.id", operator: "=", value: parseInt(id) }],
    });
    console.log(instaPost.length);
    if (instaPost.length === 0) {
      return next(
        new ErrorHandler("No insta post found with the given id", 400)
      );
    }

    const updatedStatus =
      instaPost[0].status === "active" ? "inactive" : "active";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedPost = await updateRecord(
      `${tables.instPosts}`,
      updatedData,
      condition
    );
    if (!updatedPost) {
      return next(
        new ErrorHandler("Error while changing instaPost status", 400)
      );
    }
    const apiResponse = new ApiResponse(
      200,
      `Insta Post ${id} status Changed successfully`
    );
    await redisDelByPattern({
      pattern: `${redisKeys.instaPosts}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addInstaPost,
  changeInstaPostStatus,
  deleteInstaPost,
  getAllInstaPost,
  updateInstaPost,
};
