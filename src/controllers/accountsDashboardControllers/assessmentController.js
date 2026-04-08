import { readRecord } from "../../config/query.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { redis } from "../../middlewares/redisMiddleware.js";
const getAllAssessmentClients = async (req, res, next) => {
  console.log("Controller Worked!", 7);
  try {
    const { search, page, limit } = req.query;
    const selectFields = [
      "cd.added_date",
      "CONCAT(cd.first_name,' ',cd.last_name) as full_name",
      "cd.email_id",
      "CONCAT(cd.phone_code,' ',cd.phone_number) as phone_number",
      "cd.user_id",
      "cd.gender",
      "cd.birth_date",
      "cd.country_id",
      "cd.state_id",
      "cd.city_id",
      "cd.country_id",
      "cd.active_order_id",
      "country.country_name",
      "states.state_name",
      "city.city_name",
      "sop.total_sessions",
      "pm.program_name",
      "ps.program_id",
      "ps.mrp",
      "pm.program_category",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.countries} country`,
        on: "cd.country_id = country.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} states`,
        on: "cd.state_id = states.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} city`,
        on: "cd.city_id = city.city_id",
      },
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id =  ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id =  pm.program_id",
      },
    ];
    let conditions = [
      {
        field: "cd.user_type",
        operator: "=",
        value: "1",
      },
    ];

    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      joins,
      conditions,
      ...(search && { search: { searchQuery: search } }),
      countTotal: true,
      pagination: { limit, page },
    });

    const data = results.map((i) => ({
      client_details: {
        user_id: i.user_id,
        registeredDate: i.added_date,
        full_name: i.full_name,
        email: i.email_id,
        phone: i.phone_number,
      },
      user_info: {
        gender:
          i.gender === "1" ? "Male" : i.gender === "2" ? "Female" : "Others",
        country: {
          country_id: i.country_id,
          country_name: i.country_name,
        },
        state: {
          state_id: i.state_id,
          state_name: i.state_name,
        },
        city: {
          city_id: i.city_id,
          city_name: i.city_name,
        },
        dob: i.birth_date,
      },
      program_details: {
        program_id: i.program_id,
        program_name: i.program_name,
        total_sessions: i.total_sessions,
        mrp: i.mrp,
        program_category: i.program_category,
      },
      order_details: {
        order_id: i.active_order_id,
      },
    }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Assessment Clients fetched successfully",
      data,
      totalCount,
    });
    const redisKey = `${redisKeys.assessment_clients}:${page}:${limit}:${search}`;
    await redis.setex(redisKey, 30, JSON.stringify({ data, totalCount }));
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { getAllAssessmentClients };
