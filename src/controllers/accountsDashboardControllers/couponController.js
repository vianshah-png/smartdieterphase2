import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addCouponController = async (req, res, next) => {
  try {
    const {
      program_id,
      program_session_id,
      discount_type,
      amount,
      coupon_code,
      expiry,
    } = req.body;
    if (
      !program_id ||
      !program_session_id ||
      !discount_type ||
      !amount ||
      !coupon_code ||
      !expiry
    ) {
      return next(new ErrorHandler("All fields are required", 400));
    }
    const columns = [
      "program_id",
      "program_session_id",
      "discount_type",
      "quantity",
      "coupon_code",
      "expiry_date",
    ];

    const values = [
      program_id,
      program_session_id,
      discount_type === "Amount" ? 0 : 1,
      amount,
      coupon_code,
      expiry,
    ];
    const newCoupon = await insertRecord(`${tables.coupons}`, columns, values);
    if (newCoupon.affectedRows === 0) {
      return next(new ErrorHandler("Error while adding new coupon", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Coupon added successfully",
    });
    await redisDelByPattern({
      pattern: `${redisKeys.coupons}*`,
      redis, // ioredis client
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

const getAllCoupons = async (req, res, next) => {
  const { page, limit, search } = req.query;
  try {
    const selectFields = [
      "c.id",
      "c.program_id",
      "c.program_session_id",
      "c.discount_type",
      "c.quantity",
      "c.coupon_code",
      "c.expiry_date",
      "c.added_date",
      "c.status",
      "pm.program_name",
      "ps.program_sessions",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "c.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "c.program_session_id = ps.program_session_id",
      },
    ];
    const conditions = [
      { field: "c.is_deleted", operator: "=", value: "0", raw: true },
    ];

    const { results, totalCount } = await readRecord({
      table: `${tables.coupons} c`,
      selectFields,
      joins,
      conditions,
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: ["c.coupon_code", "pm.program_name"],
        },
      }),
      pagination: { limit, page },
      countTotal: true,
    });
    if (results.length === 0) {
      const apiresponse = new ApiResponse(
        200,
        "Coupon fetched Successfully",
        []
      );
      return res.status(200).json(apiresponse);
    }
    const data = results.map((i) => ({
      id: i.id,
      added_date: i.added_date,
      program_name: i.program_name,
      program_sessions: i.program_sessions,
      coupon_code: i.coupon_code,
      amount: i.quantity,
      status: i.status,
      expiry: i.expiry_date,
      discount_type: i.discount_type === 0 ? "Amount" : "Percentage",
    }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Coupon fetched Successfully",
      data,
      totalCount,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

const changeCouponStatus = async (req, res, next) => {
  try {
    const { coupon_id } = req.params;

    const { results: coupon } = await readRecord({
      table: `${tables.coupons} c`,
      conditions: [
        { field: "c.id", operator: "=", value: parseInt(coupon_id) },
      ],
    });

    const updatedStatus = coupon[0].status === "active" ? "inactive" : "active";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(coupon_id) };
    const updatedCoupon = await updateRecord(
      `${tables.coupons}`,
      updatedData,
      condition
    );
    if (updatedCoupon.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating coupon", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Coupon ${coupon_id} status updated successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.coupons}*`,
      redis, // ioredis client
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};
const deleteCoupon = async (req, res, next) => {
  try {
    const { coupon_id } = req.params;
    const updatedData = {
      is_deleted: 1,
    };
    await updateRecord(tables.coupons, updatedData, { id: coupon_id });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Coupon Deleted Successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addCouponController, changeCouponStatus, getAllCoupons, deleteCoupon };
