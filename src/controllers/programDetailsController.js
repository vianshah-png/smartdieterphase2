import { readRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
export const getProgramDetails = async (req, res) => {
  const newData = req.body;
  try {
    //Get User Details from User ID
    const selectColumns = [
      "first_name",
      "last_name",
      "email_id",
      "mentor_assigned",
    ];
    const whereCondition = [
      { field: "user_id", operator: "=", value: newData.user_id },
    ];
    const { results: userDetails } = await readRecord({
      table: tables.userDetails,
      selectFields: selectColumns,
      conditions: whereCondition,
    });

    //Get Assigned Mentor Details
    const mentorDetailstable = "admin_users";
    const selectMentorDetailsColumns = ["first_name", "last_name", "email_id"];
    const mentorDetailsWhereCondition = [
      {
        field: "admin_user_id",
        operator: "=",
        value: userDetails[0].mentor_assigned,
      },
    ];
    const { results: mentorDetails } = await readRecord({
      table: `${mentorDetailstable}`,
      selectFields: selectMentorDetailsColumns,
      conditions: mentorDetailsWhereCondition,
    });
    //Get Active order details of active_order_id passed in request
    const orderColumns = [
      "pm.program_name",
      "ps.program_sessions",
      "ps.validity",
      "ps.extra_validity",
      "pm.program_category as program_category",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sod.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
    ];

    const conditions = [
      {
        field: "sod.sub_order_id",
        operator: "=",
        value: newData.active_order_id,
      },
    ];

    const { results: active_order_details } = await readRecord({
      table: `${tables.subOrderPrograms} sod`,
      selectFields: orderColumns,
      joins: joins,
      conditions: conditions,
    });

    //Calculate program duration
    const programDuration =
      active_order_details[0].validity + active_order_details[0].extra_validity;
    const mentorName =
      mentorDetails[0].first_name + " " + mentorDetails[0].last_name;
    let is_cleanse_program = false;
    if (active_order_details[0].program_category == "Basic Stack") {
      is_cleanse_program = true;
    }

    //Create a response object
    const responseData = {
      first_name: userDetails[0].first_name,
      last_name: userDetails[0].last_name,
      program_name: active_order_details[0].program_name,
      validity: active_order_details[0].validity,
      extra_validity: active_order_details[0].extra_validity,
      program_duration: programDuration,
      program_type: active_order_details[0].program_category,
      assigned_mentor: mentorName,
      program_status: "Active",
      is_cleanse_program: is_cleanse_program,
      program_details_flag: "4",
    };

    if (active_order_details.length > 0) {
      return res.status(201).json({
        message: "Program Details Fetched Successfully.",
        screen_name: "program-details",
        screen_title: "Your Program Details",
        data: responseData,
      });
    } else {
      return res.status(404).json({
        message: "Data not found",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};
