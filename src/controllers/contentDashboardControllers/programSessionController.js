import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllProgramSessions = async (req, res, next) => {
  const { page, limit, search } = req.query;
  try {
    const joins = [
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
    ];
    const { results: row, totalCount } = await readRecord({
      table: `${tables.programSession} ps`,
      selectFields: [
        "pm.program_id",
        "ps.program_session_id",
        "pm.program_name",
        "ps.program_sessions",
        "ps.per_session_days",
        "ps.mrp",
        "ps.program_duration",
        "ps.session_description",
        "ps.is_coupon_allowed",
        "ps.is_wallet_allowed",
        "ps.is_active",
        "ps.discount_percentage",
        "ps.discount_amount",
      ],
      joins: joins,
      pagination: { limit, page },
      search: { searchQuery: search },
      countTotal: true,
    });

    if (row.length === 0) {
      return next(new ErrorHandler("No Program Sessions Found", 404));
    }
    const program_sessions = row.map((r) => {
      return {
        program_id: r.program_id,
        program_session_id: r.program_session_id,
        program_name: r.program_name,

        program_sessions: r.program_sessions,
        mrp: r.mrp,
        inr_amount: r.mrp - r.discount_amount,

        usd_mrp: r.usd_mrp,
        program_duration: r.program_duration,
        session_description: r.session_description,
        wallet_allowed: Number(r.is_wallet_allowed) === 0 ? false : true,
        coupon_allowed: Number(r.is_coupon_allowed) === 0 ? false : true,
        status: Number(r.is_active) === 0 ? false : true,
        discount_percentage: r.discount_percentage,
        discount_amount: r.discount_amount,
        meta_data: {
          program_id: r.program_id,
        },
      };
    });
    await redis.setex(
      `${redisKeys.programSession} : ${page} : ${limit} : ${search}`,
      30,
      JSON.stringify(program_sessions)
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Programs Sessions fetched successfully",
      data: program_sessions,
      meta_data: {
        currentPage: Number(page),
        totalPage: Math.ceil(totalCount / limit),
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addProgramSession = async (req, res, next) => {
  const {
    program_id,
    program_sessions,
    per_session_days,
    mrp,
    usd_mrp,
    allow_wallet: is_wallet_allowed,
    allow_coupon: is_coupon_allowed,
    is_active,
    program_duration,
    session_description,
    discount_percentage,
    discount_amount,
  } = req.body;

  if (
    !program_id ||
    program_sessions === undefined ||
    mrp === undefined ||
    usd_mrp === undefined ||
    is_wallet_allowed === undefined ||
    is_coupon_allowed === undefined ||
    is_active === undefined ||
    program_duration === undefined ||
    session_description === undefined
  ) {
    return next(new ErrorHandler("session details not provided", 400));
  }

  try {
    const columns = [
      "program_id",
      "program_sessions",
      "per_session_days",
      "mrp",
      "usd_mrp",
      "is_wallet_allowed",
      "program_duration",
      "is_coupon_allowed",
      "is_active",
      "session_description",
    ];
    const values = [
      program_id,
      program_sessions,
      10,
      mrp,
      usd_mrp,
      is_wallet_allowed === false ? 0 : 1,
      program_duration,
      is_coupon_allowed === false ? 0 : 1,
      is_active === false ? 0 : 1,
      session_description,
    ];
    if (discount_percentage) {
      columns.push("discount_percentage");
      values.push(discount_percentage);
    }
    if (discount_amount) {
      columns.push("discount_amount");
      values.push(discount_amount);
    }
    const insertResult = await insertRecord(
      `${tables.programSession}`,
      columns,
      values
    );

    if (!insertResult)
      return next(new ErrorHandler("Error while adding the program session"));

    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Program session added successfully",
    });
    await redisDelByPattern({
      pattern: `${redisKeys.programSession}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    return res.status(400).json({
      status: "failure",
      message: error.message,
    });
  }
};

const updateProgramSession = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;
  if (Object.keys(updatedData).length === 0) {
    return next(new ErrorHandler("No data to update", 400));
  }

  try {
    const condition = { program_session_id: parseInt(id) };

    if (updatedData.allow_wallet) {
      updatedData.is_wallet_allowed = updatedData.allow_wallet;
      delete updatedData.allow_wallet;
    }
    if (updatedData.allow_coupon) {
      updatedData.is_coupon_allowed = updatedData.allow_coupon;
      delete updatedData.allow_coupon;
    }
    const updateResult = await updateRecord(
      `${tables.programSession}`,
      updatedData,
      condition
    );
    console.log(updateResult, 192);
    if (!updateResult)
      return next(
        new ErrorHandler("Error While updating Program Session", 400)
      );

    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: `program session: ${id} updated Successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.programSession}*`,
      redis,
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.error("Error updating program:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteProgramSession = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const updatedData = {
      is_deleted: 1,
    };
    const condition = { program_session_id: parseInt(id) };
    const deletedProgramSession = await updateRecord(
      `${tables.programSession}`,
      updatedData,
      condition
    );
    if (!deletedProgramSession) {
      return next(
        new ErrorHandler("Error While deleting Program Session", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Progam session ${id} deleted Successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.programSession}*`,
      redis,
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { program_session_id } = req.body;
    const data = String(req.body.data).toLowerCase();

    if (data === "wallet") {
      const { results } = await readRecord({
        table: `${tables.programSession}`,
        selectFields: ["is_wallet_allowed"],
        conditions: [
          {
            field: "program_session_id",
            operator: "=",
            value: parseInt(program_session_id),
          },
        ],
      });
      const updatedStatus = await updateRecord(
        tables.programSession,
        {
          is_wallet_allowed:
            parseInt(results[0].is_wallet_allowed) === 0 ? 1 : 0,
        },
        {
          program_session_id,
        }
      );
      if (updatedStatus.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Updating wallet Status", 400)
        );
      }
    }
    if (data === "status") {
      const { results } = await readRecord({
        table: `${tables.programSession}`,
        selectFields: ["is_active"],
        conditions: [
          {
            field: "program_session_id",
            operator: "=",
            value: parseInt(program_session_id),
          },
        ],
      });
      const updatedStatus = await updateRecord(
        tables.programSession,
        {
          is_active: parseInt(results[0].is_active) === 0 ? 1 : 0,
        },
        {
          program_session_id,
        }
      );
      if (updatedStatus.affectedRows === 0) {
        return next(new ErrorHandler("Error While Updating Status", 400));
      }
    }
    if (data === "coupon") {
      const { results } = await readRecord({
        table: `${tables.programSession}`,
        selectFields: ["is_coupon_allowed"],
        conditions: [
          {
            field: "program_session_id",
            operator: "=",
            value: parseInt(program_session_id),
          },
        ],
      });
      const updatedStatus = await updateRecord(
        tables.programSession,
        {
          is_coupon_allowed:
            parseInt(results[0].is_coupon_allowed) === 0 ? 1 : 0,
        },
        {
          program_session_id,
        }
      );
      if (updatedStatus.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While Updating Coupon Status", 400)
        );
      }
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Updated ${data} Status Successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getAllProgramSessions,
  addProgramSession,
  updateProgramSession,
  deleteProgramSession,
  updateStatus,
};
