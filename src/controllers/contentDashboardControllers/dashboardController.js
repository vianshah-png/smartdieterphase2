import { readRecord, readRecordUnion } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { sendBulkMail } from "../../utils/sendEmail.js";

const successStoriesStats = async (_, res, next) => {
  try {
    const selectFields = [
      `COUNT(*) `,
      `COUNT(CASE WHEN status = 'active' THEN 1 END) AS active`,
      `COUNT(CASE WHEN status = 'active' AND reel_transformation = 'pending' THEN 1 END) AS active_pending_transformation`,
      `COUNT(CASE WHEN status = 'active' AND what_i_eat_in_a_day = 'pending' THEN 1 END) AS active_pending_what_i_eat_in_a_day`,
      `COUNT(CASE WHEN status = 'active' AND story = 'pending' THEN 1 END) AS active_pending_story`,
      `COUNT(CASE WHEN status = 'active' AND post = 'pending' THEN 1 END) AS active_pending_post`,
      `COUNT(CASE WHEN status = 'inactive' THEN 1 END) AS inactive`,
      `COUNT(CASE WHEN status = 'inactive' AND reel_transformation = 'pending' THEN 1 END) AS inactive_pending_transformation`,
      `COUNT(CASE WHEN status = 'inactive' AND what_i_eat_in_a_day = 'pending' THEN 1 END) AS inactive_pending_what_i_eat_in_a_day`,
      `COUNT(CASE WHEN status = 'inactive' AND story = 'pending' THEN 1 END) AS inactive_pending_story`,
      `COUNT(CASE WHEN status = 'inactive' AND post = 'pending' THEN 1 END) AS inactive_pending_post`,
    ];

    const conditions = [{ field: "is_deleted", operator: "=", value: 0 }];

    const countStatusStats = await readRecord({
      table: tables.successStories,
      selectFields,
      conditions,
    });

    if (!countStatusStats || countStatusStats.length === 0) {
      return next(
        new ErrorHandler("Error while fetching success stories stats")
      );
    }

    const stats = countStatusStats[0];
    const response = {
      total: stats["COUNT(*)"],
      active: {
        total: stats.active,
        reel_transformation_pending: stats.active_pending_transformation,
        what_i_eat_in_a_day_pending: stats.active_pending_what_i_eat_in_a_day,
        story_pending: stats.active_pending_story,
        post_pending: stats.active_pending_post,
      },
      inactive: {
        total: stats.inactive,
        reel_transformation_pending: stats.inactive_pending_transformation,
        what_i_eat_in_a_day_pending: stats.inactive_pending_what_i_eat_in_a_day,
        story_pending: stats.inactive_pending_story,
        post_pending: stats.inactive_pending_post,
      },
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Success stories stats fetched successfully",
      data: response,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCardsStats = async (_, res, next) => {
  try {
    const getNotDeleted = [{ field: "is_deleted", operator: "=", value: 0 }];

    const queries = [
      { table: tables.programsMaster, alias: "programs" },
      { table: tables.blogPosts, alias: "healthReads" },
      { table: tables.recipe, alias: "recipes" },
      { table: tables.instPosts, alias: "instaPosts" },
      { table: tables.fbPost, alias: "fbPosts" },
    ];

    const results = await Promise.all(
      queries.map(({ table }) =>
        readRecord({
          table,
          selectFields: ["status", "COUNT(*) as count"],
          groupBy: ["status"],
          conditions: getNotDeleted,
        })
      )
    );

    const formatResults = (results) => {
      const formatted = results.reduce(
        (acc, { status, count }) => {
          acc[status] = count;
          acc.total += count;
          return acc;
        },
        { total: 0, active: 0, inactive: 0 }
      );

      return formatted;
    };

    const response = queries.reduce((acc, { alias }, index) => {
      acc[alias] = formatResults(results[index]);
      return acc;
    }, {});
    await redis.setex("cards-stats", 25, response);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cards Stats fetched Successfully",
      data: response,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.error("Error fetching card stats:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const programColumnData = async (_, res, next) => {
  const programCardCountsQuery = [
    {
      selectField: "'good_mails_count' as type, COUNT(*) as count",
      table: "good_mails",
      condition: [],
    },
    {
      selectField: "'program_offer_images_count' as type, COUNT(*) as count",
      table: "program_offer_images",
      condition: [],
    },
    {
      selectField: "'program_drafts_count' as type, COUNT(*) as count",
      table: "drafts",
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Program Draft",
        },
      ],
    },
    {
      selectField: "'program_rate_drafts_count' as type, COUNT(*) as count",
      table: "drafts",
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Program Rate Draft",
        },
      ],
    },
    {
      selectField: "'program_stats_images_count' as type, COUNT(*) as count",
      table: "program_stats_images",
      condition: [],
    },
  ];
  try {
    const programCardCount = await readRecordUnion(programCardCountsQuery);
    console.log(programCardCount, 40);
    const data = {
      good_mails_count: programCardCount[0].count,
      program_offer_images_count: programCardCount[1].count,
      program_drafts_count: programCardCount[2].count,
      program_rate_drafts_count: programCardCount[3].count,
      program_stats_images_count: programCardCount[4].count,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "program card count fetched successfully",
      data,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const engagementColumnData = async (_, res, next) => {
  const engagementCardCountsQuery = [
    {
      selectField: "'success_stories' as type,COUNT(*) as count",
      table: tables.successStories,
      condition: [],
    },
    {
      selectField: "'recipes' as type,COUNT(*) as count",
      table: tables.recipe,
      condition: [{ field: "is_deleted", operator: "=", value: 0 }],
    },
    {
      selectField: "'blogs' as type,COUNT(*) as count",
      table: tables.blogPosts,
      condition: [{ field: "is_deleted", operator: "=", value: 0 }],
    },
    {
      selectField: "'tips' as type ,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_sub_type",
          operator: "=",
          value: "Tips",
        },
      ],
    },
    {
      selectField: "'gyan' as type ,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_sub_type",
          operator: "=",
          value: "Gyans",
        },
      ],
    },
    {
      selectField: "'notification' as type,COUNT(*) as count",
      table: tables.notifications,
      condition: [],
    },
    {
      selectField: "'other_drafts' as type, COUNT(*) as count",
      table: "drafts",
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Other Drafts",
        },
      ],
    },
    {
      selectField: "'google_reviews' as type , COUNT(*) as count",
      table: tables.bnGoogleReviews,
      condition: [],
    },
  ];
  try {
    const engagementCardCount = await readRecordUnion(
      engagementCardCountsQuery
    );
    console.log(engagementCardCount, 40);
    const data = {
      success_stories: engagementCardCount[0].count,
      recipes: engagementCardCount[1].count,
      blogs: engagementCardCount[2].count,
      tips: engagementCardCount[3].count,
      gyans: engagementCardCount[4].count,
      notifications: engagementCardCount[5].count,
      other_drafts: engagementCardCount[6].count,
      google_reviews: engagementCardCount[7].count,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "engagement card count fetched successfully",
      data,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const socialColumnData = async (_, res, next) => {
  const socialCardCountsQuery = [
    {
      selectField: "'static_post_count' as type,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_type",
          operator: "=",
          value: "static",
        },
      ],
    },
    {
      selectField: "'recipe_reels_count' as type,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_type",
          operator: "=",
          value: "reel",
        },
        {
          field: "post_sub_type",
          operator: "=",
          value: "Recipe",
        },
      ],
    },
    {
      selectField: "'gyan_reel_count' as type,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_type",
          operator: "=",
          value: "reel",
        },
        {
          field: "post_sub_type",
          operator: "=",
          value: "Gyans",
        },
      ],
    },
    {
      selectField: "'transformation_reel_count' as type ,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_type",
          operator: "=",
          value: "reel",
        },
        {
          field: "post_sub_type",
          operator: "=",
          value: "Transformation",
        },
      ],
    },
    {
      selectField: "'what_i_eat_in_a_day_count' as type ,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_sub_type",
          operator: "=",
          value: "What I eat in a day",
        },
      ],
    },
   
    {
      selectField: "'memes_count' as type,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_type",
          operator: "=",
          value: "static",
        },
        {
          field: "post_sub_type",
          operator: "=",
          value: "Memes",
        },
      ],
    },
    {
      selectField: "'qna_drafts_count' as type, COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "QnA Draft",
        },
      ],
    },
    {
      selectField: "'quick_replies_count' as type , COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Quick Reply",
        },
      ],
    },
    {
      selectField: "'raw_videos_count' as type , COUNT(*) as count",
      table: tables.rawVideos,
      condition: [{ field: "is_deleted", operator: "=", value: 0 }],
    },
     {
      selectField: "'challenge' as type ,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_sub_type",
          operator: "=",
          value: "Challenge",
        },
      ],
    },
     {
      selectField: "'diet_plan' as type ,COUNT(*) as count",
      table: tables.socialPost,
      condition: [
        {
          field: "post_sub_type",
          operator: "=",
          value: "Diet Plan",
        },
      ],
    },
  ];
  try {
    const socialCardCount = await readRecordUnion(socialCardCountsQuery);
    console.log(socialCardCount, 40);
    const data = {
      static_post_count: socialCardCount[0].count,
      recipe_reels_count: socialCardCount[1].count,
      gyan_reel_count: socialCardCount[2].count,
      transformation_reel_count: socialCardCount[3].count,
      what_i_eat_in_a_day_count: socialCardCount[4].count,
      memes_count: socialCardCount[5].count,
      qna_drafts_count: socialCardCount[6].count,
      quick_replies_count: socialCardCount[7].count,
      raw_videos_count: socialCardCount[8].count,
      challenge: socialCardCount[9].count,
      diet_plan: socialCardCount[10].count,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "social card count fetched successfully",
      data,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const offerColumnData = async (_, res, next) => {
  const offerCardCountsQuery = [
    {
      selectField: "'pop_up_count' as type,COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Pop Up",
        },
      ],
    },
    {
      selectField: "'marquees_count' as type,COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Marquee",
        },
      ],
    },
    {
      selectField: "'auto_drafts_count' as type,COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Auto Draft",
        },
      ],
    },
    {
      selectField: "'whatsapp_text_count' as type,COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "WhatsApp Draft",
        },
      ],
    },
    {
      selectField: "'ps_line_count' as type,COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "PS Line",
        },
      ],
    },
    {
      selectField: "'yellow_patta_count' as type,COUNT(*) as count",
      table: tables.drafts,
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Yellow Patta",
        },
      ],
    },
  ];
  try {
    const offerCardCount = await readRecordUnion(offerCardCountsQuery);
    console.log(offerCardCount, 40);
    const data = {
      pop_up_count: offerCardCount[0].count,
      marquees_count: offerCardCount[1].count,
      auto_drafts_count: offerCardCount[2].count,
      whatsapp_text_count: offerCardCount[3].count,
      ps_line_count: offerCardCount[4].count,
      yellow_patta_count: offerCardCount[5].count,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "offer card count fetched successfully",
      data,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function bulkMail(req, res, next) {
  try {
    const {
      from,
      toList,    // array of recipients (["user1@x.com", "user2@x.com"])
      cc,
      bcc,
      subject,
      text,
      html,
      attachments,
      batchSize = 10,
      delay = 10000,
    } = req.body;

    if (!from || !toList || !subject) {
      return res.status(400).json({ success: false, message: "from, toList, and subject are required" });
    }

    const result = await sendBulkMail({
      from,
      toList,
      cc,
      bcc,
      subject,
      text,
      html,
      attachments,
      batchSize,
      delay,
    });

    return res.status(200).json({ success: true, message: result });
  } catch (err) {
    console.error("Bulk mail route error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

export {
  getCardsStats,
  successStoriesStats,
  programColumnData,
  engagementColumnData,
  socialColumnData,
  offerColumnData,
  bulkMail,
};
