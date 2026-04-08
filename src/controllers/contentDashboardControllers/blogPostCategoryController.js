import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllBlogCategory = async (req, res, next) => {
  try {
    const selectFields = ["catID", "catTitle", "created_at"];
    const getNotDeleted = [{ field: "is_deleted", operator: "=", value: 0 }];
    const { results: result, totalCount } = await readRecord({
      table: `${tables.blogPostsCategory}`,
      selectFields,
      conditions: getNotDeleted,
      countTotal: true,
    });
    if (result.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Health reads category fetched Successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const healthReadCategories = result.map((r) => {
      return {
        id: r.catID,
        title: r.catTitle,
        created_at: r.created_at,
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Health reads category fetched successfully",
      data: healthReadCategories,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addBlogCategory = async (req, res, next) => {
  const { title } = req.body;
  if (!title) {
    return next(new ErrorHandler("cat title not provided", 400));
  }
  try {
    console.log(title);
    const columns = ["catTitle", "catSlug"];
    const values = [title, title.split(" ").join("-").toLowerCase()];
    const result = await insertRecord(
      `${tables.blogPostsCategory}`,
      columns,
      values
    );
    if (result.affectedRows === 1) {
      res.status(201).json({ message: "Blog category added successfully" });
    } else {
      next(new ErrorHandler("Failed to add blog category", 500));
    }
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler(error.sqlMessage, 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteBlogCategory = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;
  if (!id || !deleted_by) {
    return next(new ErrorHandler("id not provided", 400));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by: deleted_by,
    };
    const condition = { catID: parseInt(id) };
    const response = await updateRecord(
      tables.blogPostsCategory,
      updatedData,
      condition
    );
    if (response.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No health read category found with the given id", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `blog post category ${id} deleted Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { getAllBlogCategory, addBlogCategory, deleteBlogCategory };
