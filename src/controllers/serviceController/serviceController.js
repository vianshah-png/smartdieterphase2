import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllServices = async (req, res, next) => {
  try {
    const selectFields = [
      "s.id",
      "s.service_name",
      "s.mrp",
      "s.discount",
      "s.final_amount",
    ];
    const conditions = [
      {
        field: "s.status",
        operator: "=",
        value: "1",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.Services} s`,
      selectFields,
      conditions,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Services fetched successfully",
      data: results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getAllServices };
