import axios from "axios";
import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const fetchGoogleReview = async (_, res, next) => {
  try {
    let reviewsData;
    try {
      const response = await axios.get(
        "https://service-reviews-ultimate.elfsight.com/data/reviews?uris[]=ChIJsRAH9QrJ5zsRksT11cwyTKY"
      );
      reviewsData = response?.data?.result?.data;
    } catch (axiosError) {
      throw new Error("Failed to fetch Google Reviews from API");
    }

    if (!Array.isArray(reviewsData) || !reviewsData.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No new Google Reviews",
        })
      );
    }

    const columns = [
      "id",
      "reviewer_name",
      "reviewer_picture_url",
      "rating",
      "text",
      "review_url",
      "published_at",
      "lang",
      "response",
    ];

    const { results: existingReviews } = await readRecord({
      table: tables.bnGoogleReviews,
      selectFields: ["id"],
      conditions: [],
    });

    if (!Array.isArray(existingReviews)) {
      throw new Error("Failed to fetch existing reviews from database");
    }

    const existingReviewIds = new Set(
      existingReviews.map((review) => review.id)
    );

    const newReviews = reviewsData
      .filter((review) => review.id && !existingReviewIds.has(review.id)) // Ensure review.id exists
      .map((review) => [
        review.id,
        review.reviewer_name || null, // Handle missing fields
        review.reviewer_picture_url || null,
        review.rating || null,
        review.text || null,
        review.url || null,
        review.published_at || null,
        review.language ?? null,
        review.response ? JSON.stringify(review.response) : null,
      ]);

    if (!newReviews.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No new Google Reviews",
        })
      );
    }

    const insertPromises = newReviews.map((values) =>
      insertRecord(tables.bnGoogleReviews, columns, values)
    );
    await Promise.all(insertPromises);

    return res.status(201).json(
      new ApiResponse({
        statusCode: 201,
        message: "Google Reviews Inserted successfully",
      })
    );
  } catch (error) {
    console.error("Error fetching Google Reviews:", error.message || error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllGoogleReviews = async (req, res, next) => {
  try {
    const { rating, sort, text, search, page = 1, limit = 10 } = req.query;

    const selectFields = [
      "gr.id",
      "gr.user_id",
      "gr.reviewer_name",
      "gr.reviewer_picture_url",
      "gr.rating",
      "gr.text",
      "gr.review_url",
      "gr.published_at",
      "gr.lang",
      "gr.response",
    ];
    const conditions = [];
    const pagination = { page, limit };
    if (rating) {
      conditions.push({
        field: "rating",
        operator: "=",
        value: Number(rating),
      });
    }

    if (text === "true") {
      conditions.push({
        field: "text",
        operator: "<>",
        value: "",
      });
      conditions.push({
        field: "text",
        operator: "IS NOT",
        value: null,
      });
    } else if (text === "false") {
      conditions.push({
        orConditions: [
          { field: "text", operator: "=", value: "" },
          { field: "text", operator: "IS", value: null },
        ],
      });
    }

    const orderBy = [];
    if (sort === "oldest") {
      orderBy.push("published_at ASC");
    } else {
      orderBy.push("published_at DESC");
    }

    const { results: result, totalCount } = await readRecord({
      table: `${tables.bnGoogleReviews} gr`,
      selectFields,
      conditions,
      orderBy,
      search: { searchQuery: search },
      pagination,
      countTotal: true,
    });

    if (result.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Google Reviews fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const data = result.map((i) => ({
      ...i,
      published_at: moment.unix(i.published_at).format("YYYY-MM-DD"),
    }));
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Google Reviews fetched successfully",
      data,
      totalCount,
      meta_data: {
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        currentPage: parseInt(page),
      },
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateGoogleReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id || !id)
      return next(new ErrorHandler("UserId or Review Id not provided", 400));
    const updatedData = { user_id };
    const condition = { id: parseInt(id) };
    const updateResult = await updateRecord(
      `${tables.bnGoogleReviews}`,
      updatedData,
      condition
    );
    if (updateResult.affectedRows === 0)
      return next(
        new ErrorHandler("Error wile updating userId in Google Reviews", 400)
      );
    const apiResponse = new ApiResponse(
      200,
      `Google Review updated successfully`
    );
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { fetchGoogleReview, getAllGoogleReviews, updateGoogleReview };
