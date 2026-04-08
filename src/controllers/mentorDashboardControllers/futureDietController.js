import moment from "moment";
import { tables } from "../../helper/constant.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const futureDietController = async (req, res, next) => {
  try {
    const { mentor_id, page, limit, search } = req.query;
    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: [
        "DATE_ADD(dsl.diet_start_date, INTERVAL 10 DAY) AS expected_next_diet_start_date",
        "DATEDIFF(DATE_ADD(dsl.diet_start_date, INTERVAL 10 DAY), CURDATE()) AS days_left_for_next_diet",
        `(SELECT dsl.diet_name from diet_session_log dsl where dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status = '4' ORDER BY dsl.diet_id DESC LIMIT 1 ) AS last_diet_name`,
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions = dsl.session",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} next_dsl`,
          on: "next_dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions + 1 = next_dsl.session",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} adv_sop`,
          on: "adv_sop.user_id = ud.user_id AND adv_sop.program_status = '4'",
        },
      ],
      extraConditions: [
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
        {
          field:
            "(adv_sop.sub_order_id IS NOT NULL OR sop.total_sessions <> sop.sent_sessions)",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "dsl.diet_start_date",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "DATE_ADD(dsl.diet_start_date, INTERVAL 10 DAY)",
          operator: "BETWEEN",
          value: ["CURDATE()", "DATE_ADD(CURDATE(), INTERVAL 10 DAY)"],
          raw: true,
        },
        {
          field: "(next_dsl.diet_id IS NULL OR next_dsl.diet_status != '4')",
          operator: "",
          value: "",
          raw: true,
        },
      ],
      extraOrderBy: ["expected_next_diet_start_date"],
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {
        return {
          next_diet_details: {
            last_diet_name: i.last_diet_name,
            expected_next_diet_start_date: `${moment(
              i.expected_next_diet_start_date
            ).format("DD-MM-YYYY")}`,
            days_left_for_next_diet: `${i.days_left_for_next_diet} Days`,
          },
        };
      },
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Future Diet Fetched Successfully",
        data: data,
        totalCount: total_page,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export { futureDietController };
