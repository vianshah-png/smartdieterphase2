import { ZodError } from "zod";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import {
  addPaymentModeSchema,
  updatePaymentModeDetailsSchema,
} from "../../validators/paymentModeValidators.js";
import { formatZodErrors } from "../../helper/commonHelper.js";

const getAllPaymentMode = async (req, res, next) => {
  try {
    const { results: paymentMode } = await readRecord({
      table: `${tables.paymentModes}`,
      selectFields: [
        "payment_mode_id",
        "payment_mode_name",
        "mode_group",
        "payment_mode_details",
        "status",
      ],
    });
    if (paymentMode.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No payment modes found",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Modes fetched successfully",
      data: paymentMode,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addPaymentMode = async (req, res, next) => {
  try {
    const { payment_mode_name, mode_group, payment_mode_details } =
      addPaymentModeSchema.parse(req.body);

    console.log(req.body);
    const columns = ["payment_mode_name", "mode_group", "payment_mode_details"];
    const values = [payment_mode_name, mode_group, payment_mode_details];
    const result = await insertRecord(
      `${tables.paymentModes}`,
      columns,
      values
    );
    if (!result.affectedRows === 1) {
      return next(new ErrorHandler("Failed to add payment mode", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Payment mode added successfully",
      data: {
        payment_mode_id: result.insertId,
      },
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error instanceof ZodError) {
      return formatZodErrors(error, res);
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changePaymentModeStatus = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { results: oldData } = await readRecord({
      table: `${tables.paymentModes}`,
      selectFields: ["*"],
      conditions: [
        { field: "payment_mode_id", operator: "=", value: parseInt(id) },
      ],
    });
    if (oldData.length === 0) {
      return next(
        new ErrorHandler("No payment mode found with the given", 400)
      );
    }
    const updatedData = { status: !oldData[0].status };
    console.log(updatedData, 94);
    const updateResult = await updateRecord(tables.paymentModes, updatedData, {
      payment_mode_id: parseInt(id),
    });
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `status updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating status`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updatePaymentModeDetails = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("Id is required ", 400));
  }
  try {
    const updatedData = updatePaymentModeDetailsSchema.parse(req.body);
    const updateResult = await updateRecord(tables.paymentModes, updatedData, {
      payment_mode_id: parseInt(id),
    });
    console.log(updatedData, 133);
    console.log(updateResult, 134);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `payment mode ${id} details updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating details`, 400));
    }
  } catch (error) {
    console.log(error);
    if (error instanceof ZodError) {
      return formatZodErrors(error, res);
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getPaymentModeByGroup = async (req, res, next) => {
  const { group } = req.query;
  if (!group) {
    return next(new ErrorHandler("group is required", 400));
  }
  console.log(group);
  try {
    const { results: paymentMode } = await readRecord({
      table: `${tables.paymentModes}`,
      selectFields: ["payment_mode_id", "payment_mode_name"],
      conditions: [{ field: "mode_group", operator: "=", value: group }],
    });
    if (paymentMode.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No payment modes found in this group",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Modes fetched successfully",
      data: paymentMode,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addPaymentMode,
  changePaymentModeStatus,
  updatePaymentModeDetails,
  getAllPaymentMode,
  getPaymentModeByGroup,
};
