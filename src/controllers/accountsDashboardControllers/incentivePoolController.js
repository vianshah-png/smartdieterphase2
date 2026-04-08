import { ZodError } from "zod";
import { deleteRecords, insertRecord, readRecord } from "../../config/query.js";
import { formatZodErrors } from "../../helper/commonHelper.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { addIncentivePoolSchema } from "../../validators/incentivePoolValidators.js";
import moment from "moment";

const addIncentivePool = async (req, res, next) => {
  try {
    const newData = addIncentivePoolSchema.parse(req.body);
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const result = await insertRecord(tables.incentivePool, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Incentive added successfully",
        data: {
          incentiveId: result.insertId,
        },
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add incentive", 500));
    }
  } catch (error) {
    console.log(error, "hello");
    if (error instanceof ZodError) {
      return formatZodErrors(error, res);
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getIncentiveList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { type, date, search } = req.query;

    // Validate pagination
    if (page < 1 || limit < 1) {
      return next(new ErrorHandler("Invalid pagination parameters", 400));
    }

    if (!type) {
      return next(new ErrorHandler("Type is required", 400));
    }

    const pagination = {
      page,
      limit,
      offset: (page - 1) * limit,
    };

    let conditions = [];
    if (type) {
      conditions.push({
        field: "ip.type",
        operator: "=",
        value: type,
      });
    }
    if (date) {
      // Split the YYYY-MM format
      const [year, month] = date.split("-");
      conditions.push({
        field: "YEAR(ip.date)",
        operator: "=",
        value: year,
      });
      conditions.push({
        field: "MONTH(ip.date)",
        operator: "=",
        value: parseInt(month),
      });
    }

    let selectFields = [
      "ip.id",
      "ip.admin_id",
      "ip.date",
      "ip.month",
      "ip.pool",
      "ip.type",
      "CONCAT(ad.first_name, ' ', ad.last_name) AS name",
    ];

    if (type === "incentive") {
      selectFields.push("ip.incentive");
    }

    const { results: incentive, totalCount } = await readRecord({
      table: `${tables.incentivePool} ip`,
      selectFields,
      pagination,
      conditions,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: ["CONCAT(ad.first_name, ' ', ad.last_name)"],
        },
      }),
      joins: [
        {
          table: `${tables.adminUsers} ad`,
          type: "LEFT",
          on: "ip.admin_id = ad.admin_user_id",
        },
      ],
      orderBy: ["ip.date DESC"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        incentive.length === 0
          ? "No incentive found"
          : "Incentive fetched successfully",
      data: incentive,
      totalCount,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getIncentiveList:", error);
    return next(
      new ErrorHandler(
        error.message || "Internal Server Error",
        error.statusCode || 500
      )
    );
  }
};

const deleteIncentiveRecord = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const deletedIncentive = await deleteRecords(tables.incentivePool, id, {
      id: parseInt(id),
    });
    if (deletedIncentive.success === false) {
      return next(
        new ErrorHandler(
          "No incentive deleted  (possible cause :there isn't any incentive exist with the given id)",
          400
        )
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `incentive ${id} deleted successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 204);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getTotalAmount = async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const startOfMonth = startDate
    ? startDate
    : moment().startOf("month").format("YYYY-MM-DD");
  const currentDate = endDate ? endDate : moment().format("YYYY-MM-DD");
  try {
    const { results: total } = await readRecord({
      table: `${tables.incentivePool}`,
      selectFields: [
        "COALESCE(SUM(incentive),0) as total_incentive",
        "COALESCE(SUM(pool),0) as total_pool",
      ],
      conditions: [
        {
          field: "date",
          operator: "BETWEEN",
          value: [`${startOfMonth}`, `${currentDate}`],
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Total Amount fetched successfully",
      data: {
        total_incentive: total[0].total_incentive,
        total_pool: total[0].total_pool,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addIncentivePool,
  getIncentiveList,
  deleteIncentiveRecord,
  getTotalAmount,
};
