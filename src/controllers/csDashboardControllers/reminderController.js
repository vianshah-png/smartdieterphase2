import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getReminders = async (req, res, next) => {
  try {
    const { day } = req.query;

    let dateCondition = null;

    if (day === "today") {
      dateCondition = {
        field: "csr.scheduled_at",
        operator: "BETWEEN",
        value: [
          `${moment().format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment().endOf("day").format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      };
    } else if (day === "tomorrow") {
      dateCondition = {
        field: "csr.scheduled_at",
        operator: "BETWEEN",
        value: [
          `${moment()
            .add(1, "day")
            .startOf("day")
            .format("YYYY-MM-DD HH:mm:ss")}`,
          `${moment()
            .add(1, "day")
            .endOf("day")
            .format("YYYY-MM-DD HH:mm:ss")}`,
        ],
      };
    } else if (day === "future") {
      dateCondition = {
        field: "csr.scheduled_at",
        operator: ">",
        value: `${moment().add(1, "day").format("YYYY-MM-DD HH:mm:ss")}`,
      };
    } else if (day !== "all") {
      return next(new ErrorHandler("Invalid day parameter", 400));
    }

    const conditions = [];
    if (dateCondition) {
      conditions.push(dateCondition);
    }
    conditions.push({
      field: "date(csr.scheduled_at)",
      operator: ">=",
      value: "date(NOW())",
      raw: true,
    });

    const { results } = await readRecord({
      table: `${tables.csReminders} csr`,
      selectFields: [
        "csr.id as reminder_id",
        "csr.title as reminder_title",
        "csr.description as reminder_description",
        "csr.scheduled_at as reminder_scheduled_at",
        "csr.added_date as reminder_added_date",
      ],
      orderBy: ["csr.scheduled_at DESC"],
      ...(conditions.length > 0 && { conditions }),
    });
   
    // return
    const formattedResults = results.map((reminder) => ({
      ...reminder,
      reminder_scheduled_at: moment(reminder.reminder_scheduled_at).format("YYYY-MM-DD HH:mm:ss"),
      reminder_added_date: moment(reminder.reminder_added_date).format("YYYY-MM-DD HH:mm:ss"),
    }));
  
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Reminders fetched successfully",
      data: formattedResults,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addReminder = async (req, res, next) => {
  try {
    const { title, description, scheduled_at } = req.body;
    const columns = ["title", "description", "scheduled_at"];
    const values = [title, description, scheduled_at];
    const insertedResults = await insertRecord(
      `${tables.csReminders}`,
      columns,
      values
    );
    if (insertedResults.affectedRows === 0) {
      return next(new ErrorHandler("Error while adding reminder", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 201,
      message: "Reminder added successfully",
    });
    return res.status(201).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editReminder = async (req, res, next) => {
  try {
    const { reminder_id, title, description, scheduled_at } = req.body;
    const updatedData = {
      ...(title && { title }),
      ...(description && { description }),
      ...(scheduled_at && { scheduled_at }),
    };
    const updatedDataResult = await updateRecord(
      `${tables.csReminders}`,
      updatedData,
      { id: parseInt(reminder_id) }
    );
    if (updatedDataResult.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating reminder", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Reminder updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getReminders, addReminder, editReminder };
