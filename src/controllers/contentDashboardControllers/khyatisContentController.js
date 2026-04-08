import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { insertContentUsageLog } from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import ContentUsageLog from "../../models/contentUsageLogModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import UserContentLog from "../../models/userContentLogModel.js";

const addKhyatisContent = async (req, res, next) => {
  try {
    const {
      title,
      description,
      link,
      category,
      sub_category,
      platforms,
      tags,
      views,
      likes,
      shares,
      content_type,
    } = req.body;
    const columns = [
      "title",
      "description",
      "link",
      "category",
      "platforms",
      "content_type",
    ];
    const values = [
      title,
      description,
      link,
      category,
      platforms ? JSON.stringify(platforms) : "[]",
      content_type,
    ];

    if (sub_category) {
      columns.push("sub_category");
      values.push(sub_category);
    }
    if (tags) {
      columns.push("tags");
      values.push(tags);
    }
    if (views) {
      columns.push("views");
      values.push(views);
    }
    if (likes) {
      columns.push("likes");
      values.push(likes);
    }
    if (shares) {
      columns.push("shares");
      values.push(shares);
    }

    const insertResult = await insertRecord(
      tables.khyatisContent,
      columns,
      values
    );
    if (insertResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Content added successfully",
        data: { content_id: insertResult.insertId },
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add content", 500));
    }
  } catch (error) {
    console.log("Error adding content:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getKhyatisContent = async (req, res, next) => {
  try {
    const { page, limit, search, category, content_type } = req.body;
    const conditions = [{ field: "kc.is_deleted", operator: "=", value: 0 }];
    if (category) {
      conditions.push({ field: "kc.category", operator: "=", value: category });
    }
    const { results, totalCount } = await readRecord({
      selectFields: [
        "id",
        "title",
        "description",
        "link",
        "category",
        "sub_category",
        "platforms",
        "tags",
        "views",
        "likes",
        "shares",
        "content_type",
        "added_date",
        "updated_date",
        "last_used_date",
        "status",
      ],
      table: `${tables.khyatisContent} kc`,
      conditions,
      ...(search
        ? {
            search: {
              searchQuery: search,
            },
          }
        : {}),
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });
    const finalData = results.map((item) => ({
      ...item,
      platforms: item.platforms ? JSON.parse(item.platforms) : [],
      added_date: moment(item.added_date).format("Do MMM YYYY"),
      updated_date: moment(item.updated_date).format("Do MMM YYYY"),
      last_used_date: item.last_used_date
        ? moment(item.last_used_date).format("Do MMM YYYY")
        : null,
    }));
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Content fetched successfully",
      data: finalData,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching content:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateLastUsedDate = {
  khyatis_content: (contentId) =>
    updateRecord(
      tables.khyatisContent,
      { last_used_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { id: contentId }
    ),
  success_story: (contentId) =>
    updateRecord(
      tables.successStories,
      { last_used_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { id: contentId }
    ),
  blog_post: (contentId) =>
    updateRecord(
      tables.blogPosts,
      { last_used_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { postID: contentId }
    ),
  recipe: (contentId) =>
    updateRecord(
      tables.recipe,
      { last_used_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { id: contentId }
    ),
  social_post: (contentId) =>
    updateRecord(
      tables.socialPost,
      { last_used_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { id: contentId }
    ),
};

const useContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { platforms, content_type } = req.body;
    if (!id || !platforms || !content_type) {
      return next(
        new ErrorHandler(
          "Content ID, platform, and content type are required",
          400
        )
      );
    }
    const updateResult = await updateLastUsedDate[content_type](parseInt(id));
    console.log(updateResult);
    if (updateResult.affectedRows === 1) {
      const insertUsagePromises = platforms.map((platform) =>
        insertContentUsageLog({ id, platform, content_type })
      );
      const insertUsageResult = await Promise.all(insertUsagePromises);
      if (!insertUsageResult) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Content usage updated successfully but failed to log usage",
        });
        return res.status(200).json(apiResponse);
      }
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Content usage updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler(
          "Failed to update content usage may be content is not present for the given id and content type",
          500
        )
      );
    }
  } catch (error) {
    console.log("Error using content:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const contentUsageHistory = {
  khyatis_content: async (contentId) => {
    const { results } = await readRecord({
      selectFields: ["likes", "views", "shares"],
      table: tables.khyatisContent,
      conditions: [{ field: "id", operator: "=", value: contentId }],
    });
    const contentUsageHistory = await ContentUsageLog.find({
      content_id: contentId,
      content_type: "khyatis_content",
    }).sort({
      timestamp: -1,
    });
    const data = results.map((item) => ({
      ...item,
    }));
    const finalData = data[0];
    finalData.usageHistory = contentUsageHistory.map((log) => ({
      platform: log.platform,
      timestamp: moment(log.timestamp).format("Do MMM YYYY, h:mm A"),
    }));
    return finalData;
  },
  success_story: async (contentId) => {
    const contentLikes = await UserContentLog.find({
      content_id: contentId,
      content_type: "success_story",
      action: "like",
    });
    const contentShares = await UserContentLog.find({
      content_id: contentId,
      content_type: "success_story",
      action: "share",
    });
    const contentViews = await UserContentLog.find({
      content_id: contentId,
      content_type: "success_story",
      action: "view",
    });
    console.log(contentLikes, contentShares, contentViews, 248);
    const contentUsageHistory = await ContentUsageLog.find({
      content_id: contentId,
      content_type: "success_story",
    }).sort({
      timestamp: -1,
    });
    const finalData = {
      content_id: contentId,
      content_type: "success_story",
      likes: contentLikes.length,
      shares: contentShares.length,
      views: contentViews.length,
      usageHistory: contentUsageHistory.map((log) => ({
        platform: log.platform,
        timestamp: moment(log.timestamp).format("Do MMM YYYY, h:mm A"),
      })),
    };
    return finalData;
  },
  blog_post: async (contentId) => {
    const { results } = await readRecord({
      selectFields: ["view_count as views"],
      table: tables.blogPosts,
      conditions: [{ field: "postID", operator: "=", value: contentId }],
    });
    console.log(results, 296);
    const contentUsageHistory = await ContentUsageLog.find({
      content_id: contentId,
      content_type: "blog_post",
    }).sort({
      timestamp: -1,
    });
    console.log(contentUsageHistory, 303);
    const finalData = {
      content_id: contentId,
      content_type: "blog_post",
      views: results[0]?.views || 0,
      usageHistory: contentUsageHistory.map((log) => ({
        platform: log.platform,
        timestamp: moment(log.timestamp).format("Do MMM YYYY, h:mm A"),
      })),
    };
    return finalData;
  },
  recipe: async (contentId) => {
    const contentLikes = await UserContentLog.find({
      content_id: contentId,
      content_type: "recipe",
      action: "like",
    });
    const contentShares = await UserContentLog.find({
      content_id: contentId,
      content_type: "recipe",
      action: "share",
    });
    const contentViews = await UserContentLog.find({
      content_id: contentId,
      content_type: "recipe",
      action: "view",
    });
    const contentUsageHistory = await ContentUsageLog.find({
      content_id: contentId,
    }).sort({
      timestamp: -1,
    });
    const finalData = {
      content_id: contentId,
      content_type: "recipe",
      likes: contentLikes.length,
      shares: contentShares.length,
      views: contentViews.length,
      usageHistory: contentUsageHistory.map((log) => ({
        platform: log.platform,
        timestamp: moment(log.timestamp).format("Do MMM YYYY, h:mm A"),
      })),
    };
    return finalData;
  },
  social_post: async (contentId) => {
    const contentUsageHistory = await ContentUsageLog.find({
      content_id: contentId,
      content_type: "social_post",
    }).sort({
      timestamp: -1,
    });
    const contentLikes = await UserContentLog.find({
      content_id: contentId,
      content_type: "reel",
      action: "like",
    });
    const contentShares = await UserContentLog.find({
      content_id: contentId,
      content_type: "reel",
      action: "share",
    });
    const contentViews = await UserContentLog.find({
      content_id: contentId,
      content_type: "reel",
      action: "view",
    });
    const finalData = {
      content_id: contentId,
      content_type: "social_post",
      likes: contentLikes.length,
      shares: contentShares.length,
      views: contentViews.length,
      usageHistory: contentUsageHistory.map((log) => ({
        platform: log.platform,
        timestamp: moment(log.timestamp).format("Do MMM YYYY, h:mm A"),
      })),
    };
    return finalData;
  },
};

const getContentUsageHistory = async (req, res, next) => {
  try {
    const { content_type, id } = req.body;
    if (!id || !content_type) {
      return next(
        new ErrorHandler("Content ID and content type are required", 400)
      );
    }
    const finalData = await contentUsageHistory[content_type](id);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Content usage history fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error fetching content usage history:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateKhyatisContent = async (req, res, next) => {
  try {
    const updatedData = req.body;
    const { id } = req.params;
    if (!id || Object.keys(updatedData).length === 0) {
      return next(
        new ErrorHandler("Content ID and updated data are required", 400)
      );
    }
    if (updatedData.platforms) {
      updatedData.platforms = JSON.stringify(updatedData.platforms);
    }
    const updateResult = await updateRecord(
      tables.khyatisContent,
      { ...updatedData, updated_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { id }
    );
    if (updateResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Content updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to update content", 500));
    }
  } catch (error) {
    console.log("Error updating content:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteKhyatisContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleteResult = await updateRecord(
      tables.khyatisContent,
      { is_deleted: 1, deleted_date: moment().format("YYYY-MM-DD HH:mm:ss") },
      { id }
    );
    if (deleteResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Content deleted successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to delete content", 500));
    }
  } catch (error) {
    console.log("Error deleting content:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeKhyatisContentStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const { results: khyatisContent } = await readRecord({
      table: `${tables.khyatisContent} kc`,
      selectFields: ["kc.status"],
      conditions: [{ field: "kc.id", operator: "=", value: parseInt(id) }],
    });

    const updatedStatus =
      khyatisContent[0].status === "active" ? "inactive" : "active";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedKhyatisContent = await updateRecord(
      `${tables.khyatisContent}`,
      updatedData,
      condition
    );
    if (updatedKhyatisContent) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Khyatis content ${id} status updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Khyatis content ${id} not found`, 400));
    }
  } catch (error) {
    console.log(error, 489);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addKhyatisContent,
  getKhyatisContent,
  updateKhyatisContent,
  useContent,
  deleteKhyatisContent,
  getContentUsageHistory,
  changeKhyatisContentStatus,
};
