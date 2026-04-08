import { insertRecord, readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addOfficeVisit = async (req, res, next) => {
  const { added_by, user_id, visit_date, comment } = req.body;
  if (!added_by || !user_id || !visit_date || !comment) {
    return next(
      new ErrorHandler("Please provide all the required fields", 400)
    );
  }
  try {
    const columns = ["added_by", "user_id", "visit_date", "comment"];
    console.log(comment);
    const values = [added_by, user_id, visit_date, comment];
    const insertResult = await insertRecord(
      tables.officeVisit,
      columns,
      values
    );
    if (insertResult.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 201,
        message: "Office visit added successfully",
        data: insertResult.insertId,
      });
      return res.status(201).json(apiResponse);
    }
    return next(new ErrorHandler("Failed to add office visit", 500));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOfficeVisits = async (req, res, next) => {
  const { id } = req.body;
  try {
    const conditions = [];
    if (id != "all") {
      conditions.push({
        field: "ov.added_by",
        operator: "=",
        value: id,
      });
    }
    const { results } = await readRecord({
      table: `${tables.officeVisit} ov`,
      selectFields: [
        "ov.id",
        "ov.added_by as added_by_id",
        "ov.user_id",
        "DATE_FORMAT(ov.visit_date,'%d-%m-%Y') as visit_date",
        "ov.comment",
        "CONCAT(ad.first_name, ' ', ad.last_name) as added_by",
        "CONCAT(cd.first_name, ' ', cd.last_name) as client_name",
        "cd.email_id as client_email",
        "CASE WHEN cd.phone_code NOT IN ('0') THEN CONCAT(cd.phone_code, ' ', cd.phone_number) ELSE cd.phone END AS client_phone",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: " ov.added_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: " ov.user_id = cd.user_id",
        },
      ],
      conditions,
    });
    if (results.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No office visits found",
          data: [],
        })
      );
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Office visits fetched successfully",
        data: results,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { addOfficeVisit, getOfficeVisits };
