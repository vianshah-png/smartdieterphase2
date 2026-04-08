import { readRecord } from "../../config/query.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { getWhatsappTextUtil } from "../../utils/getWhatsappTextUtil.js";
const getClientsExpiring = async (req, res, next,internal = false) => {
  try {
    const { admin_id } = req.query;

    const conditions = [
      {
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      },
    ];

    if (admin_id && !internal) {
      conditions.push({
        field: "cd.mentor_assigned",
        operator: "=",
        value: admin_id,
      });
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "SUM(CASE WHEN date(sop.expiry_date) = CURDATE() THEN 1 ELSE 0 END) AS expiring_today",
        "SUM(CASE WHEN date(sop.expiry_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS expiring_tomorrow",
        "SUM(CASE WHEN date(sop.expiry_date) = DATE_ADD(CURDATE(), INTERVAL 2 DAY) THEN 1 ELSE 0 END) AS expiring_day_after_tomorrow"
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = cd.active_order_id",
        },
      ],
      conditions,
    });

    const categorizedCounts = {
      "Expiring Today": results[0]?.expiring_today || 0,
      "Expiring Tomorrow": results[0]?.expiring_tomorrow || 0,
      "Expiring Day After Tomorrow":
        results[0]?.expiring_day_after_tomorrow || 0,
    };
    if (internal) return categorizedCounts; 

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Clients expiring soon fetched successfully",
      data: categorizedCounts,
    });

    await redis.setex(
      `${redisKeys.ClientsExpiring}:${admin_id || "all"}`,
      25,
      JSON.stringify(categorizedCounts)
    );

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const getExpiringClientUserData = async (req, res, next) => {
  try {
    const { search, page, limit, admin_id } = req.body;
    const filter = String(req.body.data).toLowerCase();

    const extraConditions = [
      {
        field: "date(sop.expiry_date)",
        operator: "=",
        value:
          filter === "today"
            ? "CURDATE()"
            : filter === "tomorrow"
            ? "DATE_ADD(CURDATE(), INTERVAL 1 DAY)"
            : "DATE_ADD(CURDATE(), INTERVAL 2 DAY)",
        raw: true,
      },
      {
        field: "ud.user_status",
        operator: "=",
        value: "Active",
      },
    ];

    if (admin_id) {
      extraConditions.push({
        field: "ud.mentor_assigned",
        operator: "=",
        value: admin_id,
      });
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: async (i) => {
        const { formattedText: client_whatsapp_text } =
          await getWhatsappTextUtil({
            label:
              filter === "today"
                ? `Expiring Client (Today)`
                : filter === "tomorrow"
                ? "Expiring Client (Tomorrow)"
                : "Expiring Client (Day After Tomorrow)",
            variables: [
              {
                key: "mentor_assigned",
                value: i.mentor_assigned,
              },
              {
                key: "name",
                value: i.client_name,
              },
              {
                key: "email_id",
                value: i.email_id,
              },
            ],
            to: "client",
          });

        return {
          action_details: {
            client_whatsapp_text,
          },
        };
      },
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Expiry Clients User Data fetched successfully",
      data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


export { getClientsExpiring, getExpiringClientUserData };
