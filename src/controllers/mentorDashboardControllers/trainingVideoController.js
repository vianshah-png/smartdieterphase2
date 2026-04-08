import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllTrainingVideo = async (req, res, next) => {
  try {
    const { type, search, category } = req.query;
    const { results } = await readRecord({
      table: `${tables.otherLinks} l`,
      selectFields: [
        "l.id",
        "l.title",
        "l.content",
        "l.link",
        "l.type",
        "l.category",
      ],
      conditions: [
        {
          field: "l.type",
          operator: "=",
          value: type ? type : "training",
        },
        {
          field: "l.is_deleted",
          operator: "=",
          value: "0",
        },
        category
          ? { field: "l.category", operator: "=", value: category }
          : null,
      ].filter(Boolean),
      search: search
        ? {
            searchQuery: decodeURIComponent(search),
            searchFields: ["l.title", "l.content", "l.link"],
          }
        : {},
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Training Links Fetched Successfully",
        data: results,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { getAllTrainingVideo };
