import { readRecord } from "../../config/query.js";
import { fetchUsersDetailsNew, mapUserData } from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import moment from "moment";
const allTailendClientsCounts = async (req, res, next) => {
  const { id } = req.body;
  if (!id) {
    return next(new ErrorHandler("id is required", 400));
  }
  try {
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(DISTINCT CASE 
          WHEN cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          THEN cd.user_id
        END) AS all_users`,

        `COUNT(DISTINCT CASE 
          WHEN cd.sub_user_status = 'Active' 
          THEN cd.user_id
        END) AS active`,

        `COUNT(DISTINCT CASE 
          WHEN sop.pending_session = 0 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  
          THEN cd.user_id
        END) AS pending0`,

        `COUNT(DISTINCT CASE 
          WHEN sop.pending_session = 1 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  
          THEN cd.user_id
        END) AS pending1`,

        `COUNT(DISTINCT CASE 
          WHEN sop.pending_session = 2 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          THEN cd.user_id
        END) AS pending2`,

        `COUNT(DISTINCT CASE 
          WHEN sop.pending_session = 3 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          THEN cd.user_id
        END) AS pending3`,

        `COUNT(DISTINCT CASE 
          WHEN cd.suggested_program_id IS NOT NULL 
          AND cd.suggested_program_id NOT IN (0) 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  
          THEN cd.user_id
        END) AS pitched`,

        `COUNT(DISTINCT CASE 
          WHEN cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          AND (cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)
          THEN cd.user_id
        END) AS not_pitched`,
      ],

      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: `sop.pending_session`,
          operator: "<=",
          value: 3,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      status: 200,
      message: "counts for tailend all client fetched successfully",
      data: dataCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allTailendClients = async (req, res, next) => {
  const { page, limit, search } = req.body;
  const pagination = { page, limit };
  const { id, filter } = req.body;
  console.log(filter);
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: `sop.pending_session`,
        operator: "<=",
        value: 3,
      },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
    
      `SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN fu1.follow_up_date < CURDATE()
             AND fu1.follow_up_status = 1
            THEN fu1.follow_up_date
          END
          ORDER BY fu1.follow_up_date DESC
        ),
        ',', 1
      ) AS prev_follow_up_date`,
    
      `SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN fu1.follow_up_date < CURDATE()
             AND fu1.follow_up_status = 1
            THEN fu1.follow_up_note
          END
          ORDER BY fu1.follow_up_date DESC
        ),
        ',', 1
      ) AS prev_follow_up_note`,
    
      `SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN fu1.follow_up_date < CURDATE()
             AND fu1.follow_up_status = 1
            THEN (
              CASE
                WHEN fu1.type IN (0,'0') THEN slot.appointment_slots
                WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots
              END
            )
          END
          ORDER BY fu1.follow_up_date DESC
        ),
        ',', 1
      ) AS prev_appointment_slots`,
    
      `SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN fu1.follow_up_date >= CURDATE()
            THEN fu1.follow_up_date
          END
          ORDER BY fu1.follow_up_date ASC
        ),
        ',', 1
      ) AS next_follow_up_date`,
    
      `SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN fu1.follow_up_date >= CURDATE()
            THEN (
              CASE
                WHEN fu1.type IN (0,'0') THEN slot.appointment_slots
                WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots
              END
            )
          END
          ORDER BY fu1.follow_up_date ASC
        ),
        ',', 1
      ) AS next_appointment_slots`,
    ];
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "IN",
          value: [
            "Dormant",
            "Onhold",
            "Cleanse active",
            "Active",
            "notstarted",
          ],
        });
        break;
      case "active":
        console.log(57);
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Active",
        });
        break;
      case "pending0":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 0,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pending1":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 1,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pending2":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 2,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pending3":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 3,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          },
          {
            field:
              "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL )",
            operator: "",
            value: "",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
        goal: true,
      },
      orderBy: orderById,
    });
    // console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = mapUserData({
        user,
        details: details[index],
        addFields: { weight_details: {}, health_score: {} },
        extraMappings: {
          next_fu: {
            prev_fu_date: users[index].prev_follow_up_date || null,
            prev_fu_note: users[index].prev_follow_up_note || null,
            next_fu_date: users[index].next_follow_up_date || null,
          },
          weight_details: {},
          health_score: {},
        },
      });

      // console.log(resultData, 401);
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details.gained_weight =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details.lost_weight =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    // console.log(finalData, 122);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendExpiringThisMonthCount = async (req, res, next) => {
  const { id } = req.body;
  if (!id) {
    return next(new ErrorHandler("id is required", 400));
  }
  try {
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const endOfMonth = moment().endOf("month").format("YYYY-MM-DD");
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(CASE 
          WHEN cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          THEN 1
        END) AS all_users`,
        `COUNT(CASE 
          WHEN cd.sub_user_status = 'Active' 
          THEN 1
        END) AS active`,
        `COUNT(CASE 
          WHEN sop.pending_session = 0 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  
          THEN 1
        END) AS pending0`,
        `COUNT(CASE 
          WHEN sop.pending_session = 1 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  
          THEN 1
        END) AS pending1`,
        `COUNT(CASE 
          WHEN sop.pending_session = 2 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          THEN 1
        END) AS pending2`,
        `COUNT(CASE 
          WHEN sop.pending_session = 3 
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
          THEN 1
        END) AS pending3`,
        `COUNT(CASE 
          WHEN cd.suggested_program_id IS NOT NULL 
          AND cd.suggested_program_id NOT IN (0) 
          AND sp.suggested_program_id IS NOT NULL
          AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  
          THEN 1
        END) AS pitched`,
        `COUNT(CASE 
          WHEN cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted')  AND ( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL )
          THEN 1
        END) AS not_pitched`,
      ],
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: "sop.expiry_date",
          operator: "BETWEEN",
          value: [startOfMonth, endOfMonth],
        },
        {
          field: `sop.pending_session`,
          operator: "<=",
          value: 3,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      status: 200,
      message:
        "counts for tailend expiring this month clients fetched successfully",
      data: dataCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const tailendExpiringThisMonth = async (req, res, next) => {
  const { page, limit, search } = req.body;
  const pagination = { page, limit };
  const { id, filter } = req.body;
  console.log(filter);
  try {
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const endOfMonth = moment().endOf("month").format("YYYY-MM-DD");
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: `sop.pending_session`,
        operator: "<=",
        value: 3,
      },
      {
        field: "sop.expiry_date",
        operator: "BETWEEN",
        value: [startOfMonth, endOfMonth],
      },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date  
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_appointment_slots`,
      ` GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END)
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_appointment_slots`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_note`,
    ];
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "IN",
          value: [
            "Dormant",
            "Onhold",
            "Cleanse active",
            "Active",
            "notstarted",
          ],
        });
        break;
      case "active":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Active",
        });
        break;
      case "pending0":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 0,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pending1":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 1,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pending2":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 2,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pending3":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 3,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          },
          {
            field:
              "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = {
        user_details: {
          user_id: user.user_id,
          user_name: details[index].client_name || null,
          email_id: details[index].client_email || null,
          phone_number: details[index].client_phone || null,
          program_number: details[index].client_program_count,
          status: user.sub_user_status || null,
          // whatsapp_text,
        },
        program_details: {
          current_program_name: details[index].current_program_name || null,
          current_program_duration: `(${details[index].current_program_duration} Days)`,
          current_program_mrp: details[index].current_program_mrp || null,
          current_program_amount_paid:
            details[index].current_program_amount || null,
          current_program_payment_mode:
            details[index].current_program_payment_mode || null,
          current_program_session: `(${details[index].current_program_sent_sessions}/${details[index].current_program_total_sessions})`,
          current_program_mentor_assigned: details[index].mentor_assigned,
          current_program_validity: details[index].current_program_validity,
          current_program_validity_used: Math.abs(
            details[index].current_program_validity_used
          ),
          current_program_expiry_date:
            details[index].current_program_expiry_date,
          advance_program_count: details[index].client_advance_program_count,
        },
        suggested_program_details: {
          suggested_program_name: details[index].suggested_program_name || null,
          duration: `(${details[index].suggested_program_days} Days)`,
          suggested_program_mrp: details[index].suggested_program_mrp || null,
          suggested_program_qtd: details[index].suggested_amount || null,
          suggested_date: details[index].suggested_at,
          suggested_days_ago: `(${details[index].suggested_days_ago} Days ago)`,
          suggested_by: details[index].suggested_by || null,
          suggested_payment_mode: details[index].suggested_payment_mode || null,
          suggested_payment_details:
            details[index].suggested_payment_mode_details || null,
          suggested_payment_link_shared: details[index]
            .suggested_payment_link_id
            ? true
            : false,
          suggested_payment_link_expiry: details[index]
            .suggested_payment_link_id
            ? moment(details[index].suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: details[index].suggested_payment_link,
          ssuggested_mentor_note: details[index].suggested_mentor_note,
          suggested_motivation_level: details[index].suggested_motivation_level,
          suggested_sale_status:
            Number(details[index].suggested_sale_status) === 1
              ? "1st Pitch"
              : Number(details[index].suggested_sale_status) === 2
              ? "HOT"
              : Number(details[index].suggested_sale_status) === 3
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: details[index].program_start_weight || null,
          latest_weight: details[index].client_latest_weight || null,
          goal_weight: details[index].goal_weight || null,
          height: details[index].client_height || null,
          // weight_difference: details[index].client_weight_difference || null,
        },
        health_score_details: {
          health_score: details[index].client_latest_health_score || null,
          ibw: details[index].client_latest_ibw || null,
          bmi: details[index].client_latest_bmi || null,
          health_category: details[index].client_latest_health_category || null,
        },
        next_fu: {
          prev_fu_date: users[index].prev_follow_up_date || null,
          prev_fu_note: users[index].prev_follow_up_note || null,
          next_fu_date: users[index].next_follow_up_date || null,
        },
      };
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details["gained_weight"] =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details["lost_weight"] =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Tailend expiring this month clients fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendDormantNoAdvancePurchaseCount = async (req, res, next) => {
  const { id } = req.body;
  if (!id) {
    return next(new ErrorHandler("id is required", 400));
  }
  try {
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(CASE
          WHEN cd.sub_user_status = 'Dormant' THEN 1
      END) AS all_users`,
        `COUNT(CASE
          WHEN sop.pending_session = 0
               AND cd.sub_user_status = 'Dormant' THEN 1
      END) AS pending0`,
        `COUNT(CASE
          WHEN sop.pending_session = 1
               AND cd.sub_user_status = 'Dormant' THEN 1
      END) AS pending1`,
        `COUNT(CASE
          WHEN sop.pending_session = 2
               AND cd.sub_user_status = 'Dormant' THEN 1
      END) AS pending2`,
        `COUNT(CASE
          WHEN sop.pending_session = 3
               AND cd.sub_user_status = 'Dormant' THEN 1
      END) AS pending3`,
        `COUNT(CASE
          WHEN cd.suggested_program_id IS NOT NULL
               AND sp.suggested_program_id IS NOT NULL
               AND cd.suggested_program_id NOT IN (0)
               AND cd.sub_user_status = 'Dormant' THEN 1
      END) AS pitched`,
        `COUNT(CASE
          WHEN cd.sub_user_status = 'Dormant'
               AND (cd.suggested_program_id IS NULL
                    OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL) THEN 1
      END) AS not_pitched`,
      ],
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: `sop.pending_session`,
          operator: "<=",
          value: 3,
        },
        {
          field: `NOT EXISTS (
               SELECT 1 FROM ${tables.subOrderPrograms} sop2 
               WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
             )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      status: 200,
      message:
        "Dormant tailend client with no adv. purchase count fetched successfully",
      data: dataCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const tailendDormantNoAdvancePurchase = async (req, res, next) => {
  const { page, limit, search } = req.body;
  const pagination = { page, limit };
  const { id, filter } = req.body;
  console.log(filter);
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: `sop.pending_session`,
        operator: "<=",
        value: 3,
      },
      {
        field: `NOT EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2 
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date  
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END)
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_appointment_slots`,
      ` GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END)
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_appointment_slots`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_note`,
    ];
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Dormant",
        });
        break;
      case "pending0":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 0,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pending1":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 1,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pending2":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 2,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pending3":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 3,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          },
          {
            field:
              "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = {
        user_details: {
          user_id: user.user_id,
          user_name: details[index].client_name || null,
          email_id: details[index].client_email || null,
          phone_number: details[index].client_phone || null,
          program_number: details[index].client_program_count,
          status: user.sub_user_status || null,
          // whatsapp_text,
        },
        program_details: {
          current_program_name: details[index].current_program_name || null,
          current_program_duration: `(${details[index].current_program_duration} Days)`,
          current_program_mrp: details[index].current_program_mrp || null,
          current_program_amount_paid:
            details[index].current_program_amount || null,
          current_program_payment_mode:
            details[index].current_program_payment_mode || null,
          current_program_session: `(${details[index].current_program_sent_sessions}/${details[index].current_program_total_sessions})`,
          current_program_mentor_assigned: details[index].mentor_assigned,
          current_program_validity: details[index].current_program_validity,
          current_program_validity_used: Math.abs(
            details[index].current_program_validity_used
          ),
          current_program_expiry_date:
            details[index].current_program_expiry_date,
          advance_program_count: details[index].client_advance_program_count,
        },
        suggested_program_details: {
          suggested_program_name: details[index].suggested_program_name || null,
          duration: `(${details[index].suggested_program_days} Days)`,
          suggested_program_mrp: details[index].suggested_program_mrp || null,
          suggested_program_qtd: details[index].suggested_amount || null,
          suggested_date: details[index].suggested_at,
          suggested_days_ago: `(${details[index].suggested_days_ago} Days ago)`,
          suggested_by: details[index].suggested_by || null,
          suggested_payment_mode: details[index].suggested_payment_mode || null,
          suggested_payment_details:
            details[index].suggested_payment_mode_details || null,
          suggested_payment_link_shared: details[index]
            .suggested_payment_link_id
            ? true
            : false,
          suggested_payment_link_expiry: details[index]
            .suggested_payment_link_id
            ? moment(details[index].suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: details[index].suggested_payment_link,
          ssuggested_mentor_note: details[index].suggested_mentor_note,
          suggested_motivation_level: details[index].suggested_motivation_level,
          suggested_sale_status:
            Number(details[index].suggested_sale_status) === 1
              ? "1st Pitch"
              : Number(details[index].suggested_sale_status) === 2
              ? "HOT"
              : Number(details[index].suggested_sale_status) === 3
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: details[index].program_start_weight || null,
          latest_weight: details[index].client_latest_weight || null,
          goal_weight: details[index].goal_weight || null,
          height: details[index].client_height || null,
          // weight_difference: details[index].client_weight_difference || null,
        },
        health_score_details: {
          health_score: details[index].client_latest_health_score || null,
          ibw: details[index].client_latest_ibw || null,
          bmi: details[index].client_latest_bmi || null,
          health_category: details[index].client_latest_health_category || null,
        },
        next_fu: {
          prev_fu_date: users[index].prev_follow_up_date || null,
          prev_fu_note: users[index].prev_follow_up_note || null,
          next_fu_date: users[index].next_follow_up_date || null,
        },
      };
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details["gained_weight"] =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details["lost_weight"] =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Dormant tailend client with no adv. purchase count fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendDormantOdNoAdvancePurchaseCount = async (req, res, next) => {
  const { id } = req.body;
  if (!id) {
    return next(new ErrorHandler("id is required", 400));
  }
  try {
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(CASE
                  WHEN cd.sub_user_status = 'Dormant' THEN 1
              END) AS all_users`,
        `COUNT(CASE
                 WHEN sop.pending_session = 0
                      AND cd.sub_user_status = 'Dormant' THEN 1
             END) AS pending0`,
        `COUNT(CASE
                 WHEN sop.pending_session = 1
                      AND cd.sub_user_status = 'Dormant' THEN 1
             END) AS pending1`,
        `COUNT(CASE
                 WHEN sop.pending_session = 2
                      AND cd.sub_user_status = 'Dormant' THEN 1
             END) AS pending2`,
        `COUNT(CASE
                 WHEN sop.pending_session = 3
                      AND cd.sub_user_status = 'Dormant' THEN 1
             END) AS pending3`,
        `COUNT(CASE
                 WHEN cd.suggested_program_id IS NOT NULL
                      AND cd.suggested_program_id NOT IN (0)
                      AND sp.suggested_program_id IS NOT NULL
                      AND cd.sub_user_status = 'Dormant' THEN 1
             END) AS pitched`,
        `COUNT(CASE
                 WHEN cd.sub_user_status = 'Dormant'
                      AND (cd.suggested_program_id IS NULL
                           OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL) THEN 1
             END) AS not_pitched`,
      ],
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: `sop.pending_session`,
          operator: "<=",
          value: 3,
        },
        {
          field: `NOT EXISTS (
               SELECT 1 FROM ${tables.subOrderPrograms} sop2 
               WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
             )`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "dsl.diet_status", operator: "=", value: 4 },
        {
          field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
          operator: ">",
          value: 19,
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      status: 200,
      message:
        "Dormant OD tailend client with no adv. purchase count fetched successfully",
      data: dataCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendDormantOdNoAdvancePurchase = async (req, res, next) => {
  const { page, limit, search } = req.body;
  const pagination = { page, limit };
  const { id, filter } = req.body;
  console.log(filter);
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: `sop.pending_session`,
        operator: "<=",
        value: 3,
      },
      {
        field: `NOT EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2 
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      },
      { field: "dsl.diet_status", operator: "=", value: 4 },
      {
        field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
        operator: ">",
        value: 19,
        raw: true,
      },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
       {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date  
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1  THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_appointment_slots`,
      ` GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_appointment_slots`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_note`,
    ];
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Dormant",
        });
        break;
      case "pending0":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 0,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pending1":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 1,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pending2":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 2,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pending3":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 3,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          }
        );
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dormant",
          },
          {
            field:
              "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = {
        user_details: {
          user_id: user.user_id,
          user_name: details[index].client_name || null,
          email_id: details[index].client_email || null,
          phone_number: details[index].client_phone || null,
          program_number: details[index].client_program_count,
          status: user.sub_user_status || null,
          // whatsapp_text,
        },
        program_details: {
          current_program_name: details[index].current_program_name || null,
          current_program_duration: `(${details[index].current_program_duration} Days)`,
          current_program_mrp: details[index].current_program_mrp || null,
          current_program_amount_paid:
            details[index].current_program_amount || null,
          current_program_payment_mode:
            details[index].current_program_payment_mode || null,
          current_program_session: `(${details[index].current_program_sent_sessions}/${details[index].current_program_total_sessions})`,
          current_program_mentor_assigned: details[index].mentor_assigned,
          current_program_validity: details[index].current_program_validity,
          current_program_validity_used: Math.abs(
            details[index].current_program_validity_used
          ),
          current_program_expiry_date:
            details[index].current_program_expiry_date,
          advance_program_count: details[index].client_advance_program_count,
        },
        suggested_program_details: {
          suggested_program_name: details[index].suggested_program_name || null,
          duration: `(${details[index].suggested_program_days} Days)`,
          suggested_program_mrp: details[index].suggested_program_mrp || null,
          suggested_program_qtd: details[index].suggested_amount || null,
          suggested_date: details[index].suggested_at,
          suggested_days_ago: `(${details[index].suggested_days_ago} Days ago)`,
          suggested_by: details[index].suggested_by || null,
          suggested_payment_mode: details[index].suggested_payment_mode || null,
          suggested_payment_details:
            details[index].suggested_payment_mode_details || null,
          suggested_payment_link_shared: details[index]
            .suggested_payment_link_id
            ? true
            : false,
          suggested_payment_link_expiry: details[index]
            .suggested_payment_link_id
            ? moment(details[index].suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: details[index].suggested_payment_link,
          ssuggested_mentor_note: details[index].suggested_mentor_note,
          suggested_motivation_level: details[index].suggested_motivation_level,
          suggested_sale_status:
            Number(details[index].suggested_sale_status) === 1
              ? "1st Pitch"
              : Number(details[index].suggested_sale_status) === 2
              ? "HOT"
              : Number(details[index].suggested_sale_status) === 3
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: details[index].program_start_weight || null,
          latest_weight: details[index].client_latest_weight || null,
          goal_weight: details[index].goal_weight || null,
          height: details[index].client_height || null,
          // weight_difference: details[index].client_weight_difference || null,
        },
        health_score_details: {
          health_score: details[index].client_latest_health_score || null,
          ibw: details[index].client_latest_ibw || null,
          bmi: details[index].client_latest_bmi || null,
          health_category: details[index].client_latest_health_category || null,
        },
        next_fu: {
          prev_fu_date: users[index].prev_follow_up_date || null,
          prev_fu_note: users[index].prev_follow_up_note || null,
          next_fu_date: users[index].next_follow_up_date || null,
        },
      };
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details["gained_weight"] =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details["lost_weight"] =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Dormant OD tailend client with no adv. purchase count fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendOnholdNoAdvancePurchaseCount = async (req, res, next) => {
  const { id } = req.body;
  if (!id) {
    return next(new ErrorHandler("id is required", 400));
  }
  try {
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(DISTINCT CASE
            WHEN cd.sub_user_status = 'Onhold' THEN cd.user_id
         END) AS all_users`,
        `COUNT(DISTINCT CASE
            WHEN sop.pending_session = 0
                 AND cd.sub_user_status = 'Onhold' THEN cd.user_id
         END) AS pending0`,
        `COUNT(DISTINCT CASE
            WHEN sop.pending_session = 1
                 AND cd.sub_user_status = 'Onhold' THEN cd.user_id
         END) AS pending1`,
        `COUNT(DISTINCT CASE
            WHEN sop.pending_session = 2
                 AND cd.sub_user_status = 'Onhold' THEN cd.user_id
         END) AS pending2`,
        `COUNT(DISTINCT CASE
            WHEN sop.pending_session = 3
                 AND cd.sub_user_status = 'Onhold' THEN cd.user_id
         END) AS pending3`,
        `COUNT(DISTINCT CASE
            WHEN cd.suggested_program_id IS NOT NULL
                 AND cd.suggested_program_id NOT IN (0)
                 AND sp.suggested_program_id IS NOT NULL
                 AND cd.sub_user_status = 'Onhold' THEN cd.user_id
         END) AS pitched`,
        `COUNT(DISTINCT CASE
            WHEN cd.sub_user_status = 'Onhold'
                 AND (cd.suggested_program_id IS NULL
                      OR cd.suggested_program_id IN (0)
                      OR sp.suggested_program_id IS NULL) THEN cd.user_id
         END) AS not_pitched`,
      ],
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: `sop.pending_session`,
          operator: "<=",
          value: 3,
        },
        {
          field: `NOT EXISTS (
               SELECT 1 FROM ${tables.subOrderPrograms} sop2 
               WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
             )`,
          operator: "",
          value: "",
          raw: true,
        },
        { field: "CURDATE()", operator: ">", value: "od.end_date", raw: true },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.onholdClients} od`,
          on: "cd.user_id = od.user_id AND cd.active_order_id = od.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      status: 200,
      message:
        "Onhold tailend client with no adv. purchase count fetched successfully",
      data: dataCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendOnholdNoAdvancePurchase = async (req, res, next) => {
  const { page, limit, search } = req.body;
  const pagination = { page, limit };
  const { id, filter } = req.body;
  console.log(filter);
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: `sop.pending_session`,
        operator: "<=",
        value: 3,
      },
      {
        field: `NOT EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2 
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      },
      { field: "CURDATE()", operator: ">", value: "od.end_date", raw: true },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
      {
        type: "LEFT",
        table: `${tables.onholdClients} od`,
        on: "cd.user_id = od.user_id AND cd.active_order_id = od.sub_order_id",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date  
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_appointment_slots`,
      ` GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_appointment_slots`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_note`,
    ];
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Onhold",
        });
        break;
      case "pending0":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 0,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Onhold",
          }
        );
        break;
      case "pending1":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 1,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Onhold",
          }
        );
        break;
      case "pending2":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 2,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Onhold",
          }
        );
        break;
      case "pending3":
        conditions.push(
          {
            field: "sop.pending_session",
            operator: "=",
            value: 3,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Onhold",
          }
        );
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field:
              "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = {
        user_details: {
          user_id: user.user_id,
          user_name: details[index].client_name || null,
          email_id: details[index].client_email || null,
          phone_number: details[index].client_phone || null,
          program_number: details[index].client_program_count,
          status: user.sub_user_status || null,
          // whatsapp_text,
        },
        program_details: {
          current_program_name: details[index].current_program_name || null,
          current_program_duration: `(${details[index].current_program_duration} Days)`,
          current_program_mrp: details[index].current_program_mrp || null,
          current_program_amount_paid:
            details[index].current_program_amount || null,
          current_program_payment_mode:
            details[index].current_program_payment_mode || null,
          current_program_session: `(${details[index].current_program_sent_sessions}/${details[index].current_program_total_sessions})`,
          current_program_mentor_assigned: details[index].mentor_assigned,
          current_program_validity: details[index].current_program_validity,
          current_program_validity_used: Math.abs(
            details[index].current_program_validity_used
          ),
          current_program_expiry_date:
            details[index].current_program_expiry_date,
          advance_program_count: details[index].client_advance_program_count,
        },
        suggested_program_details: {
          suggested_program_name: details[index].suggested_program_name || null,
          duration: `(${details[index].suggested_program_days} Days)`,
          suggested_program_mrp: details[index].suggested_program_mrp || null,
          suggested_program_qtd: details[index].suggested_amount || null,
          suggested_date: details[index].suggested_at,
          suggested_days_ago: `(${details[index].suggested_days_ago} Days ago)`,
          suggested_by: details[index].suggested_by || null,
          suggested_payment_mode: details[index].suggested_payment_mode || null,
          suggested_payment_details:
            details[index].suggested_payment_mode_details || null,
          suggested_payment_link_shared: details[index]
            .suggested_payment_link_id
            ? true
            : false,
          suggested_payment_link_expiry: details[index]
            .suggested_payment_link_id
            ? moment(details[index].suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: details[index].suggested_payment_link,
          ssuggested_mentor_note: details[index].suggested_mentor_note,
          suggested_motivation_level: details[index].suggested_motivation_level,
          suggested_sale_status:
            Number(details[index].suggested_sale_status) === 1
              ? "1st Pitch"
              : Number(details[index].suggested_sale_status) === 2
              ? "HOT"
              : Number(details[index].suggested_sale_status) === 3
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: details[index].program_start_weight || null,
          latest_weight: details[index].client_latest_weight || null,
          goal_weight: details[index].goal_weight || null,
          height: details[index].client_height || null,
          // weight_difference: details[index].client_weight_difference || null,
        },
        health_score_details: {
          health_score: details[index].client_latest_health_score || null,
          ibw: details[index].client_latest_ibw || null,
          bmi: details[index].client_latest_bmi || null,
          health_category: details[index].client_latest_health_category || null,
        },
        next_fu: {
          prev_fu_date: users[index].prev_follow_up_date || null,
          prev_fu_note: users[index].prev_follow_up_note || null,
          next_fu_date: users[index].next_follow_up_date || null,
        },
      };
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details["gained_weight"] =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details["lost_weight"] =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Onhold tailend client with no adv. purchase count fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const tailendNoAdvancePurchaseCount = async (req, res, next) => {
  const { id, pending } = req.body;

  if (!id ) {
    return next(new ErrorHandler("id and pending are required", 400));
  }


  try {
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(DISTINCT CASE WHEN cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') THEN cd.user_id END) AS all_users`,

        `COUNT(DISTINCT CASE WHEN cd.sub_user_status = 'Active' THEN cd.user_id END) AS active`,

        `COUNT(DISTINCT CASE WHEN cd.sub_user_status = 'Dormant' THEN cd.user_id END) AS dormant`,

        `COUNT(DISTINCT CASE WHEN cd.sub_user_status = 'Onhold' THEN cd.user_id END) AS onhold`,

        `COUNT(DISTINCT CASE WHEN cd.sub_user_status = 'Onhold' AND CURDATE() > od.end_date THEN cd.user_id END) AS onholdOD`,

        `COUNT(DISTINCT CASE 
            WHEN cd.suggested_program_id IS NOT NULL 
              AND cd.suggested_program_id NOT IN (0) 
              AND sp.suggested_program_id IS NOT NULL
              AND cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
            THEN cd.user_id 
        END) AS pitched`,

        `COUNT(DISTINCT CASE 
            WHEN cd.sub_user_status IN ('Dormant', 'Onhold', 'Cleanse active', 'Active', 'notstarted') 
              AND (
                cd.suggested_program_id IS NULL 
                OR cd.suggested_program_id IN (0) 
                OR sp.suggested_program_id IS NULL
              ) 
            THEN cd.user_id 
        END) AS not_pitched`,
      ],
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        {
          field: `NOT EXISTS (
               SELECT 1 FROM ${tables.subOrderPrograms} sop2 
               WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
             )`,
          operator: "",
          value: "",
          raw: true,
        },
        ...(pending ?[{
          field: "sop.pending_session",
          operator: "=",
          value: parseInt(pending),
        }]:[{
          field: "sop.pending_session",
          operator: "<=",
          value: 3,
        }]),
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.onholdClients} od`,
          on: "cd.user_id = od.user_id AND cd.active_order_id = od.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });

    const apiResponse = new ApiResponse({
      status: 200,
      message: `Tailend client with ${pending} pending sessions and no adv. purchase count fetched successfully`,
      data: dataCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendNoAdvancePurchase = async (req, res, next) => {
  const { page, limit, search } = req.body;
  const pagination = { page, limit };
  const { id, filter, pending } = req.body;
  if (!id || !filter ) {
    return next(new ErrorHandler("id, filter, and pending are required", 400));
  }
 
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      ...(pending ?[{
          field: "sop.pending_session",
          operator: "=",
          value: parseInt(pending),
        }]:[{
          field: "sop.pending_session",
          operator: "<=",
          value: 3,
        }]),
      {
        field: `NOT EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2 
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date  
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_follow_up_date`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC 
    ) AS prev_appointment_slots`,
      ` GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date >= CURDATE() THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END) 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date ASC
    ) AS next_appointment_slots`,
      `GROUP_CONCAT(
        CASE 
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note 
            ELSE NULL 
        END 
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_note`,
    ];
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "IN",
          value: [
            "Dormant",
            "Onhold",
            "Cleanse active",
            "Active",
            "notstarted",
          ],
        });
        break;
      case "active":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Active",
        });
        break;
      case "dormant":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Dormant",
        });
        break;
      case "onhold":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Onhold",
        });
        break;
      case "onholdOD":
        conditions.push(
          { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
          { field: "CURDATE()", operator: ">", value: "od.end_date", raw: true }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.onholdClients} od`,
          on: "cd.active_order_id = od.sub_order_id",
        });
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push(
          {
            field:
              "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: [
              "Dormant",
              "Onhold",
              "Cleanse active",
              "Active",
              "notstarted",
            ],
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
        follow_up: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = {
        user_details: {
          user_id: user.user_id,
          user_name: details[index].client_name || null,
          email_id: details[index].client_email || null,
          phone_number: details[index].client_phone || null,
          program_number: details[index].client_program_count,
          status: user.sub_user_status || null,
          // whatsapp_text,
        },
        program_details: {
          current_program_name: details[index].current_program_name || null,
          current_program_duration: `(${details[index].current_program_duration} Days)`,
          current_program_mrp: details[index].current_program_mrp || null,
          current_program_amount_paid:
            details[index].current_program_amount || null,
          current_program_payment_mode:
            details[index].current_program_payment_mode || null,
          current_program_session: `(${details[index].current_program_sent_sessions}/${details[index].current_program_total_sessions})`,
          current_program_mentor_assigned: details[index].mentor_assigned,
          current_program_validity: details[index].current_program_validity,
          current_program_validity_used: Math.abs(
            details[index].current_program_validity_used
          ),
          current_program_expiry_date:
            details[index].current_program_expiry_date,
          advance_program_count: details[index].client_advance_program_count,
        },
        suggested_program_details: {
          suggested_program_name: details[index].suggested_program_name || null,
          suggested_program_duration: `(${details[index].suggested_program_days} Days)`,
          suggested_program_mrp: details[index].suggested_program_mrp || null,
          suggested_program_qtd: details[index].suggested_amount || null,
          suggested_date: details[index].suggested_at,
          suggested_days_ago: `(${details[index].suggested_days_ago} Days ago)`,
          suggested_by: details[index].suggested_by || null,
          suggested_payment_mode: details[index].suggested_payment_mode || null,
          suggested_payment_details:
            details[index].suggested_payment_mode_details || null,
          suggested_payment_link_shared: details[index]
            .suggested_payment_link_id
            ? true
            : false,
          suggested_payment_link_expiry: details[index]
            .suggested_payment_link_id
            ? moment(details[index].suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: details[index].suggested_payment_link,
          ssuggested_mentor_note: details[index].suggested_mentor_note,
          suggested_motivation_level: details[index].suggested_motivation_level,
          suggested_sale_status:
            Number(details[index].suggested_sale_status) === 1
              ? "1st Pitch"
              : Number(details[index].suggested_sale_status) === 2
              ? "HOT"
              : Number(details[index].suggested_sale_status) === 3
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: details[index].program_start_weight || null,
          latest_weight: details[index].client_latest_weight || null,
          goal_weight: details[index].goal_weight || null,
          height: details[index].client_height || null,
          // weight_difference: details[index].client_weight_difference || null,
        },
        health_score_details: {
          health_score: details[index].client_latest_health_score || null,
          ibw: details[index].client_latest_ibw || null,
          bmi: details[index].client_latest_bmi || null,
          health_category: details[index].client_latest_health_category || null,
        },
        follow_up_details : {
      prev_follow_up_date: details[index].prev_follow_up_date || null,
      prev_follow_up_id: details[index].prev_follow_up_id || null,
      prev_follow_up_type: details[index].prev_follow_up_type || null,
      prev_follow_up_assigned_by: details[index].prev_follow_up_assigned_by || null,
      prev_appointment_slots: details[index].prev_appointment_slots || null,
      prev_follow_up_note: details[index].prev_follow_up_note || null,
      next_follow_up_date: details[index].next_follow_up_date || null,
      next_follow_up_id: details[index].next_follow_up_id || null,
      next_follow_up_type: details[index].next_follow_up_type || null,
      next_follow_up_assigned_by: details[index].next_follow_up_assigned_by || null,
      next_appointment_slots: details[index].next_appointment_slots || null,
      next_follow_up_note: details[index].next_follow_up_note || null,
    }
      };
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details["gained_weight"] =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details["lost_weight"] =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Onhold tailend client with no adv. purchase count fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const tailendMaitenanceClientsCount = async (req, res, next) => {
  const { id, advance_purchase } = req.body;
  if (!id || advance_purchase === undefined) {
    return next(new ErrorHandler("id and advance_purchase are required", 400));
  }
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      {
        field: "sop.pending_session",
        operator: "<=",
        value: 3,
      },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Maintenance",
      },
    ];
    if (advance_purchase) {
      conditions.push({
        field: ` EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2 
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      });
    } else {
      conditions.push({
        field: `NOT EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2 
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      });
    }
    const { results: dataCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `COUNT(CASE WHEN  cd.user_status = 'Maintenance' 
          THEN 1 END) AS all_users`,
        `COUNT(CASE WHEN  cd.suggested_program_id IS NOT NULL 
                AND cd.suggested_program_id NOT IN (0) 
                AND sp.suggested_program_id IS NOT NULL
          THEN 1 END) AS pitched`,

        `COUNT(CASE WHEN  (cd.suggested_program_id IS NULL 
                     OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL) 
          THEN 1 END) AS not_pitched`,
      ],
      conditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      status: 200,
      message: `tailend maintenence client with ${
        advance_purchase ? "advance pruchase" : " no advance purchase"
      }  count fetched successfully`,
      data: dataCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const tailendMaitenanceClients = async (req, res, next) => {
  const { id, filter } = req.body;
  if (!id || !filter) {
    return next(new ErrorHandler("Invalid request body", 400));
  }
  const { page, limit, search, advance_purchase } = req.body;
  const pagination = { page, limit };
  console.log(filter);
  try {
    let conditions = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "sop.pending_session", operator: "<=", value: 3 },
      { field: "cd.user_status", operator: "=", value: "Maintenance" },
    ];
    let joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.slots} slot`,
        on: "fu1.slot_id = slot.id and fu1.type IN (0, '0')",
      },
      {
        type: "LEFT",
        table: `${tables.whatsappAppSlots} wap_slot`,
        on: "fu1.slot_id = wap_slot.id and fu1.type IN ('1','2',1,2)",
      },
    ];
    let selectFields = [
      "cd.user_id",
      "cd.suggested_program_id",
      "sop.pending_session",
      "cd.sub_user_status",
      `GROUP_CONCAT(
        CASE
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_date
            ELSE NULL
        END
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_date`,
      `GROUP_CONCAT(
        CASE
            WHEN fu1.follow_up_date >= CURDATE() THEN fu1.follow_up_date
            ELSE NULL
        END
        ORDER BY fu1.follow_up_date ASC
    ) AS next_follow_up_date`,
      `GROUP_CONCAT(
        CASE
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END)
            ELSE NULL
        END
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_appointment_slots`,
      ` GROUP_CONCAT(
        CASE
            WHEN fu1.follow_up_date >= CURDATE() THEN (CASE WHEN fu1.type IN (0,'0') THEN slot.appointment_slots WHEN fu1.type IN ('1','2',1,2) THEN wap_slot.appointment_slots END)
            ELSE NULL
        END
        ORDER BY fu1.follow_up_date ASC
    ) AS next_appointment_slots`,
      `GROUP_CONCAT(
        CASE
            WHEN fu1.follow_up_date < CURDATE() AND fu1.follow_up_status = 1 THEN fu1.follow_up_note
            ELSE NULL
        END
        ORDER BY fu1.follow_up_date DESC
    ) AS prev_follow_up_note`,
    ];
    if (advance_purchase) {
      conditions.push({
        field: ` EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      });
    } else {
      conditions.push({
        field: `NOT EXISTS (
             SELECT 1 FROM ${tables.subOrderPrograms} sop2
             WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4'
           )`,
        operator: "",
        value: "",
        raw: true,
      });
    }
    switch (filter) {
      case "all":
        conditions.push({
          field: "cd.user_status",
          operator: "=",
          value: "Maintenance",
        });
        break;
      case "pitched":
        conditions.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT ",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN ",
            value: "(0)",
            raw: true,
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      case "notPitched":
        conditions.push({
          field:
            "( cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL)",
          operator: "",
          value: "",
          raw: true,
        });
        joins.push({
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid filter input ", 400));
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "cd.first_name",
            "cd.last_name",
            "cd.phone_number",
            "email_id",
          ],
        },
      }),
      pagination,
      countTotal: true,
      having: [
        { field: "cd.user_id", operator: "IS NOT NULL", value: "", raw: true },
      ],
      groupBy: [
        "cd.user_id",
        "cd.suggested_program_id",
        "sop.pending_session",
        "cd.sub_user_status",
      ],
    });
    console.log(users.length, 332);
    console.log(users[0], 44);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let orderById = `FIELD(cd.user_id,`;
    let userIds = [];
    for (let i = 0; i < users.length; i++) {
      userIds.push(users[i].user_id);
      if (i === users.length - 1) {
        orderById += `${users[i].user_id}`;
      } else {
        orderById += `${users[i].user_id},`;
      }
    }
    orderById += ")";
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        goal_weight: true,
        health_score: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const resultData = mapUserData({
        user,
        details: details[index],
        addFields: { weight_details: true, health_score: true },
        extraMappings: {
          next_fu: {
            prev_fu_date: users[index].prev_follow_up_date || null,
            prev_fu_note: users[index].prev_follow_up_note || null,
            next_fu_date: users[index].next_follow_up_date || null,
          },
        },
      });
      if (details[index].client_weight_difference > 0) {
        resultData.weight_details["gained_weight"] =
          details[index].client_weight_difference;
      } else {
        resultData.weight_details["lost_weight"] =
          details[index].client_weight_difference;
      }
      return resultData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Onhold tailend client with no adv. purchase count fetched successfully",
      data: finalData,
      meta_data: [
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  allTailendClientsCounts,
  allTailendClients,
  tailendExpiringThisMonthCount,
  tailendExpiringThisMonth,
  tailendDormantNoAdvancePurchaseCount,
  tailendDormantNoAdvancePurchase,
  tailendDormantOdNoAdvancePurchaseCount,
  tailendDormantOdNoAdvancePurchase,
  tailendOnholdNoAdvancePurchaseCount,
  tailendOnholdNoAdvancePurchase,
  tailendNoAdvancePurchaseCount,
  tailendNoAdvancePurchase,
  tailendMaitenanceClientsCount,
  tailendMaitenanceClients,
};
