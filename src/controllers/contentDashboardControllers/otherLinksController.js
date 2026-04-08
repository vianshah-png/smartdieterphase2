import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";

const addNewLinks = async (req, res, next) => {
  try {
    const { title, content, link, type, category } = req.body;
    const columns = ["title", "content", "link", "type", "category"];
    const values = [title, content, link, type, category];
    const newLinks = await insertRecord(
      `${tables.otherLinks}`,
      columns,
      values
    );
    if (newLinks.affectedRows === 0) {
      return next(new ErrorHandler("Error While adding new link", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Link added successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllLinks = async (req, res, next) => {
  try {
    const { type, search, category } = req.query;
    const selectFields = [
      "l.id",
      "l.title",
      "l.content",
      "l.link",
      "l.type",
      "l.category",
    ];
    const conditions = [
      { field: "l.is_deleted", operator: "=", value: 0 },
      type ? { field: "type", operator: "=", value: type } : null,
      category ? { field: "l.category", operator: "=", value: category } : null,
    ].filter(Boolean);
    const searchCondition = search
      ? {
          searchQuery: search,
          searchFields: ["l.title", "l.content", "l.link"], // Specify fields to search
        }
      : {};

    const { results: links, totalCount } = await readRecord({
      table: `${tables.otherLinks} l`,
      selectFields,
      conditions: conditions,
      search: searchCondition, // Add the search condition
      countTotal: true,
    });
    if (!links) {
      return next(new ErrorHandler("Error While fetching links", 400));
    } else if (links.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Links fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Links fetched successfully",
      data: links,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateLinks = async (req, res, next) => {
  const { id } = req.params;
  if (!id) return next(new ErrorHandler("id not Provided", 400));
  try {
    const updatedData = req.body;
    const condition = { id: parseInt(id) };
    const updatedotherlinks = await updateRecord(
      `${tables.otherLinks}`,
      updatedData,
      condition
    );
    if (updatedotherlinks.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "other Link updated successfully",
      });

      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While Updating other Link", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteLinks = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id is not Provided", 500));
  }
  try {
    const updatedData = {
      is_deleted: 1,
    };

    const condition = { id: parseInt(id) };
    const deletedOtherLinks = await updateRecord(
      `${tables.otherLinks}`,
      updatedData,
      condition
    );
    if (!deletedOtherLinks) {
      return next(new ErrorHandler("Error While deleting FbPost", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `other Link ${id} deleted Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addNewLinks, getAllLinks, updateLinks, deleteLinks };
