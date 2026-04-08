import { readRecord } from "../../config/query.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { redis } from "../../middlewares/redisMiddleware.js";
const getAllEnquiryClients = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const selectFields = [
      "cd.added_date",
      "CONCAT(cd.first_name,' ',cd.last_name) as full_name",
      "cd.email_id",
      "CONCAT(cd.phone_code,' ',cd.phone_number) as phone_number",
      "cd.user_id",
      "cd.country_id",
      "cd.state_id",
      "cd.city_id",
      "cd.country_id",
      "cd.active_order_id",
      "country.country_name",
      "states.state_name",
      "city.city_name",
      "cd.primary_lead_source",
      "ls.source_name",
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
        type: "INNER",
        table: `${tables.leadSource} ls`,
        on: "cd.primary_lead_source  = ls.source_id",
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      joins,
      conditions: [
        {
          field: "cd.primary_lead_source",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
      ],
      order: ["cd.added_date DESC"],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name,' ',cd.last_name)",
            "cd.last_name",
            "ls.source_name",
            "cd.phone_number",
          ],
        },
      }),
      countTotal: true,
      pagination: { limit, page },
    });
    console.log(results, 68);
    const data = results.map((i) => ({
      registeredDate: i.added_date,
      client_details: {
        full_name: i.full_name,
        email: i.email_id,
        phone: i.phone_number,
      },
      country: {
        id: i.country_id,
        name: i.country_name,
      },
      state: {
        id: i.state_id,
        name: i.state_name,
      },
      city: {
        id: i.city_id,
        name: i.city_name,
      },
      source: i.source_name,
    }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Enquiry Clients fetched Successfully",
      data,
      totalCount,
    });
    const redisKey = `${redisKeys.enquiryClients}:${page}:${limit}:${search}`;
    await redis.setex(redisKey, 30, JSON.stringify({ data, totalCount }));
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getAllEnquiryClients };
