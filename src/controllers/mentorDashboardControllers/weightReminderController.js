import moment from "moment";
import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";

const weightReminderCountController = async (req, res, next) => {
  try {
    const weight_day = req.query.weight_day
      ? Number(req.query.weight_day)
      : null;
    const mentor_id = Number(req.query.mentor_id);

    const conditions = [
      { field: "ud.sub_user_status", operator: "=", value: "Active" },
      {
        orConditions: [
          {
            field: "pm.program_category",
            operator: "IN",
            value: ["Premium Stack", "Platinum Stack", "Privy Stack"],
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%Plats%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%Privy%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%Premium%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%With mentor%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%With khyati%'",
            raw: true,
          },
        ],
      },
      {
        field: "sop.program_status",
        operator: "=",
        value: 1,
      },
    ];
    if (weight_day) {
      conditions.push({
        field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
        operator: "=",
        value: weight_day,
      });
      conditions.push({
        field:
          weight_day === 5
            ? "dsl.mid_session_weight"
            : "dsl.end_session_weight",
        operator: "=",
        value: 0,
      });
    } else {
      conditions.push(
        {
          field:
            "(CASE WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 4 THEN dsl.mid_session_weight ELSE dsl.end_session_weight END)",
          operator: "=",
          value: 0,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [4, 9],
        }
      );
    }

    if (mentor_id) {
      conditions.push({
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      });
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [`COUNT(DISTINCT ud.user_id) as count`],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
        },
      ],
      conditions,
    });

    const count = results[0].count;

    return res.status(200).json(
      new ApiResponse({
        message: `Weight Reminder${
          weight_day ? ` for ${weight_day}` : ""
        } Count fetched Successfully`,
        data: count,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const weightReminderUserDataController = async (req, res, next) => {
  try {
    const weight_day = req.query.weight_day
      ? Number(req.query.weight_day)
      : null;
    const mentor_id = Number(req.query.mentor_id);
    const { page, limit, search } = req.query;

    const conditions = [
      { field: "ud.sub_user_status", operator: "=", value: "Active" },
      {
        orConditions: [
          {
            field: "pm.program_category",
            operator: "IN",
            value: ["Premium Stack", "Platinum Stack", "Privy Stack"],
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%Plats%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%Privy%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%Premium%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%With mentor%'",
            raw: true,
          },
          {
            field: "pm.program_name",
            operator: "LIKE",
            value: "'%With khyati%'",
            raw: true,
          },
        ],
      },
      {
        field: "sop.program_status",
        operator: "=",
        value: 1,
      },
    ];

    if (weight_day) {
      conditions.push({
        field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
        operator: "=",
        value: weight_day,
      });
      conditions.push({
        field:
          weight_day === 5
            ? "dsl.mid_session_weight"
            : "dsl.end_session_weight",
        operator: "=",
        value: 0,
      });
    } else {
      conditions.push(
        {
          field: `(CASE 
                    WHEN DATEDIFF(CURDATE(), dsl.diet_start_date) = 4 THEN dsl.mid_session_weight 
                    ELSE dsl.end_session_weight 
                END)`,
          operator: "=",
          value: 0,
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [4, 9],
        }
      );
    }

    if (mentor_id) {
      conditions.push({
        field: "ud.mentor_assigned",
        operator: "=",
        value: mentor_id,
      });
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraSelectFields: [
        "DATEDIFF(CURDATE(), dsl.diet_start_date) as weight_day",
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
        },
      ],
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {
        return { isPlat: true, weight_day: i.weight_day };
      },
    });

    return res.status(200).json(
      new ApiResponse({
        message: `Weight Reminder${
          weight_day ? ` for ${weight_day}` : " (5 & 10)"
        } Data fetched Successfully`,
        data: data,
        totalCount: total_page,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { weightReminderCountController, weightReminderUserDataController };
