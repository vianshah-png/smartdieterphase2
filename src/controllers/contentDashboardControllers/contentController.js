import moment from "moment";
import { deleteRecords, insertRecord, readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import UserContentLog from "../../models/userContentLogModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

async function logUserContentAction({
  user_id,
  content_id,
  content_type,
  action,
  meta,
}) {
  try {
    const logEntry = await UserContentLog.create({
      user_id,
      content_id,
      content_type,
      action,
      meta,
    });
    return { status: true, data: logEntry };
  } catch (error) {
    console.log("Error logging user content action:", error);
    return { status: false, error: "Failed to log user content action" };
  }
}

const contentAction = async (req, res, next) => {
  try {
    const { content_id, user_id, content_type, action } = req.body;
    console.log(req.body, 32);
    // Validate required fields
    if (!content_id || !user_id || !content_type) {
      return next(
        new ErrorHandler(
          400,
          "Content ID, User ID, and Content Type are required"
        )
      );
    }

    // Validate content type
    const validContentTypes = ["reel", "recipe", "success_story"];
    if (!validContentTypes.includes(content_type)) {
      return next(new ErrorHandler(400, "Invalid content type"));
    }

    // Prepare metadata
    const meta = {
      device: req.headers["source"] || "unknown",
      ip:
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        "unknown",
    };
    // Handle 'like' or 'share'
    if (["like", "share"].includes(action)) {
      const columns = ["user_id", "content_id", "content_type"];
      const values = [user_id, content_id, content_type];
      const contentTable =
        action === "like" ? tables.contentLikes : tables.contentShares;

      const insertedResult = await insertRecord(contentTable, columns, values);

      console.log(insertedResult, 71);
      if (!insertedResult.insertId) {
        return next(new ErrorHandler(500, `Failed to insert ${action} record`));
      }

      const logResult = await logUserContentAction({
        user_id,
        content_id,
        content_type,
        action,
        meta,
      });

      if (!logResult.status) {
        return next(
          new ErrorHandler(500, `Failed to log content ${action} action`)
        );
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: `Content ${action}d successfully`,
        })
      );
    }

    // Handle 'unlike'
    if (action === "unlike") {
      const { results: contents } = await readRecord({
        selectFields: ["*"],
        table: `${tables.contentLikes} cl`,
        conditions: [
          { field: "cl.content_id", operator: "=", value: content_id },
          { field: "cl.content_type", operator: "=", value: content_type },
          { field: "cl.user_id", operator: "=", value: user_id },
        ],
      });
      console.log(contents, 103);
      const id = contents[0].id;
      const deleteResult = await deleteRecords(tables.contentLikes, id, { id });

      if (!deleteResult.success) {
        return next(new ErrorHandler(500, "Failed to unlike content"));
      }

      const logResult = await logUserContentAction({
        user_id,
        content_id,
        content_type,
        action,
        meta,
      });

      if (!logResult.status) {
        return next(
          new ErrorHandler(500, "Failed to log content unlike action")
        );
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Content unliked successfully",
        })
      );
    }

    // Handle unsupported actions
    return next(new ErrorHandler(400, "Invalid action type"));
  } catch (error) {
    console.error("Error in contentAction controller:", error);
    if (error.code === "ER_DUP_ENTRY") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `content already ${req.body.action}d`,
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler(500, "Internal Server Error"));
  }
};

const topPerformersContentWise = {
  khyatis_content: async () => {
    try {
      const { results } = await readRecord({
        selectFields: ["*"],
        table: `${tables.khyatisContent} kc`,
        conditions: [
          {
            field: "(kc.likes + kc.shares + kc.views)",
            operator: ">",
            value: 0,
          },
        ],
        orderBy: ["(kc.likes + kc.shares + kc.views) DESC"],
        pagination: {
          limit: 5,
          page: 1,
        },
      });
      const finalData = results.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        like: item.likes,
        share: item.shares,
        view: item.views,
        platforms: item.platforms ? JSON.parse(item.platforms) : [],
      }));
      return finalData;
    } catch (error) {
      console.log(
        "Error in topPerformersContentWise - khyatis_content:",
        error
      );
      return [];
    }
  },
  success_story: async () => {
    try {
      const topSuccessStories = await UserContentLog.aggregate([
        {
          $match: {
            content_type: "success_story",
            action: { $in: ["like", "share"] },
          },
        },
        {
          $group: {
            _id: "$content_id",
            likeCount: {
              $sum: {
                $cond: [{ $eq: ["$action", "like"] }, 1, 0],
              },
            },
            shareCount: {
              $sum: {
                $cond: [{ $eq: ["$action", "share"] }, 1, 0],
              },
            },
          },
        },
        {
          $addFields: {
            totalInteractions: { $add: ["$likeCount", "$shareCount"] },
          },
        },
        {
          $sort: { totalInteractions: -1 },
        },
        {
          $limit: 5,
        },
        {
          $project: {
            _id: 0,
            content_id: "$_id",
            likeCount: 1,
            shareCount: 1,
            totalInteractions: 1,
          },
        },
      ]);
      const { results } = await readRecord({
        selectFields: ["ss.id", "ss.short_descriptions", "ss.platforms"],
        table: `${tables.successStories} ss`,
        conditions: [
          {
            field: "ss.id",
            operator: "IN",
            value: topSuccessStories.map((item) => item.content_id),
          },
        ],
        orderBy: [
          "FIELD(ss.id," +
            topSuccessStories.map((item) => item.content_id).join(",") +
            ")",
        ],
      });
      console.log(results, 236);
      const finalData = results.map((row) => {
        return {
          id: row.id,
          description: row.short_descriptions,
          like:
            topSuccessStories.find((item) => item.content_id === row.id)
              ?.likeCount || 0,
          share:
            topSuccessStories.find((item) => item.content_id === row.id)
              ?.shareCount || 0,
          view:
            topSuccessStories.find((item) => item.content_id === row.id)
              ?.viewCount || 0,
          platforms: safeJSONParse(row.platforms, []),
        };
      });
      return finalData;
    } catch (error) {
      console.log("Error in topPerformersContentWise - success_story:", error);
      return [];
    }
  },
  blog_post: async () => {
    try {
      const { results } = await readRecord({
        selectFields: [
          "bp.postID as id",
          "bp.postTitle as title",
          "bp.postDesc as description",
          "bp.view_count",
          "bp.platforms",
        ],
        table: `${tables.blogPosts} bp`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.blogPostsCategory} c`,
            on: "bp.category_id = c.catID",
          },
        ],
        orderBy: ["bp.view_count DESC"],
        pagination: {
          limit: 5,
          page: 1,
        },
      });
      const finalData = results.map((row) => {
        return {
          id: row.id,
          title: row.title,
          description: row.description
            ?.replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'"),
          view: row.view_count,
          platforms: safeJSONParse(row.platforms, []),
        };
      });
      return finalData;
    } catch (error) {
      console.log("Error in topPerformersContentWise - blog_post:", error);
      return [];
    }
  },
  recipe: async () => {
    try {
      const topRecipes = await UserContentLog.aggregate([
        {
          $match: {
            content_type: "recipe",
            action: { $in: ["like", "share"] },
          },
        },
        {
          $group: {
            _id: "$content_id",
            likeCount: {
              $sum: {
                $cond: [{ $eq: ["$action", "like"] }, 1, 0],
              },
            },
            shareCount: {
              $sum: {
                $cond: [{ $eq: ["$action", "share"] }, 1, 0],
              },
            },
          },
        },
        {
          $addFields: {
            totalInteractions: { $add: ["$likeCount", "$shareCount"] },
          },
        },
        {
          $sort: { totalInteractions: -1 },
        },
        {
          $limit: 5,
        },
        {
          $project: {
            _id: 0,
            content_id: "$_id",
            likeCount: 1,
            shareCount: 1,
            totalInteractions: 1,
          },
        },
      ]);
      const { results } = await readRecord({
        selectFields: [
          "r.title",
          "r.id",
          "r.seo_description",
          "r.view_count",
          "r.platforms",
        ],
        table: `${tables.recipe} r`,
        conditions: [
          {
            field: "r.id",
            operator: "IN",
            value: topRecipes.map((item) => item.content_id),
          },
        ],
        orderBy: [
          "FIELD(r.id," +
            topRecipes.map((item) => item.content_id).join(",") +
            ")",
        ],
      });
      const finalData = results.map((recipe) => {
        return {
          id: recipe.id,
          title: recipe.title,
          description: recipe.seo_description,
          like:
            topRecipes.find((item) => item.content_id === recipe.id)
              ?.likeCount || 0,
          share:
            topRecipes.find((item) => item.content_id === recipe.id)
              ?.shareCount || 0,
          view: recipe.view_count,
          platforms: safeJSONParse(recipe.platforms, []),
        };
      });
      return finalData;
    } catch (error) {
      console.log("Error in topPerformersContentWise - recipe:", error);
      return [];
    }
  },
  social_post: async () => {
    try {
      const topSocialPost = await UserContentLog.aggregate([
        {
          $match: {
            content_type: "reel",
            action: { $in: ["like", "share"] },
          },
        },
        {
          $group: {
            _id: "$content_id",
            likeCount: {
              $sum: {
                $cond: [{ $eq: ["$action", "like"] }, 1, 0],
              },
            },
            shareCount: {
              $sum: {
                $cond: [{ $eq: ["$action", "share"] }, 1, 0],
              },
            },
          },
        },
        {
          $addFields: {
            totalInteractions: { $add: ["$likeCount", "$shareCount"] },
          },
        },
        {
          $sort: { totalInteractions: -1 },
        },
        {
          $limit: 5,
        },
        {
          $project: {
            _id: 0,
            content_id: "$_id",
            likeCount: 1,
            shareCount: 1,
            totalInteractions: 1,
          },
        },
      ]);
      const { results } = await readRecord({
        selectFields: ["sp.id", "sp.title", "sp.description", "sp.posted_on"],
        table: `${tables.socialPost} sp`,
        conditions: [
          {
            field: "sp.id",
            operator: "IN",
            value: topSocialPost.map((item) => item.content_id),
          },
        ],
        orderBy: [
          "FIELD(sp.id," +
            topSocialPost.map((item) => item.content_id).join(",") +
            ")",
        ],
      });
      const finalData = results.map((row) => {
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          like:
            topSocialPost.find((item) => item.content_id === row.id)
              ?.likeCount || 0,
          share:
            topSocialPost.find((item) => item.content_id === row.id)
              ?.shareCount || 0,
          platforms: safeJSONParse(row.posted_on, ""),
        };
      });
      return finalData;
    } catch (error) {
      console.log("Error in topPerformersContentWise - social_post:", error);
      return [];
    }
  },
};

const getTopPerformers = async (req, res, next) => {
  try {
    const { content_type } = req.query;
    if (!content_type) {
      return next(new ErrorHandler(400, "Content type is required"));
    }
    if (!topPerformersContentWise[content_type]) {
      return next(new ErrorHandler(400, "Invalid content type"));
    }
    const data = await topPerformersContentWise[content_type]();
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Top performers fetched successfully",
        data,
      })
    );
  } catch (error) {
    console.log("Error in getTopPerformers:", error);
  }
};

export { contentAction, getTopPerformers };
