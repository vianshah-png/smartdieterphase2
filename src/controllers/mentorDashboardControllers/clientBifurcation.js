import moment from "moment";
import { readRecord } from "../../config/query.js";
import {
  compareVersions,
  extractVariables,
  fetchUserDetailsDynamic,
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonSelectFields,
  mapLeadDataNew,
  mapUserData,
  readRecordNewForLead,
  replacePlaceholders,
  withMap,
} from "../../helper/common.js";
import { app_versions, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { readPool } from "../../config/dbConnection.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { spinToWinWhatsappDraft } from "../common.js";

function addConditions(condition, filter) {
  switch (filter) {
    case "pitched":
      condition.push(
        {
          field: "cd.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "cd.suggested_program_id",
          operator: "NOT IN",
          value: [0],
        },
        {
          field: "sp.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "sp.updated_date",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        }
      );
      break;
    case "not_pitched":
      condition.push({
        orConditions: [
          {
            field: "cd.suggested_program_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "IN",
            value: [0],
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.updated_date NOT",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      });
      break;
    case "no_follow_up_72_hours":
      condition.push({
        field: "fu1.added_date",
        operator: "<",
        value: "DATE_SUB(CURDATE(), INTERVAL 3 DAY)",
        raw: true,
      });
      break;
    case "lead_cleanse_active":
      condition.push({
        field: "cd.sub_user_status",
        operator: "=",
        value: "Cleanse active",
      });
      break;
    case "hamper_status":
      condition.push({
        field: `(SELECT  CASE WHEN created_at IS NOT NULL THEN 1 ELSE 0 END FROM ${tables.productOrders} WHERE payment_method='free' and sub_order_id=cd.active_order_id and user_id=cd.user_id ORDER by order_id desc LIMIT 1)`,
        operator: "=",
        value: 1,
        raw: true,
      });
      break;
    case "not_downloaded":
      condition.push({
        field: "cd.app_version",
        operator: "IS NULL",
        value: "",
        raw: true,
      });
      break;
    case "not_updated":
      condition.push({
        orConditions: [
          {
            field: `cd.app_version IS NULL 
                 OR (cd.device = 'android' AND cd.app_version < '${app_versions.android}') 
                 OR (cd.device = 'ios' AND cd.app_version < '${app_versions.ios}')`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });
      break;
    case "com_client":
      condition.push({
        field: `EXISTS (
            SELECT 1 
            FROM change_of_mentor com 
            WHERE com.user_id = cd.user_id 
              AND com.added_date BETWEEN '${moment()
                .startOf("month")
                .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("month")
          .format("YYYY-MM-DD")}' 
              AND cd.mentor_assigned != com.old_mentor
          )`,
        operator: "",
        value: "",
        raw: true,
      });
      break;
    case "platinum_clients":
      condition.push(
        {
          field: "pm.program_category",
          operator: "=",
          value: "Platinum Stack",
        },
        {
          field: "LCASE(pm.program_name)",
          operator: "LIKE",
          value: "khyati",
        }
      );
      break;
    case "privy_clients":
      condition.push(
        {
          field: "pm.program_category",
          operator: "IN",
          value: ["Privy Stack", "Premium Stack"],
        },
        {
          field: "LCASE(pm.program_name)",
          operator: "LIKE",
          value: "with mentor",
        }
      );
      break;
    case "poshan_clients":
      condition.push({
        field:
          "(LCASE(pm.program_name) LIKE '%weaning%' OR LCASE(pm.program_name) LIKE '%nourish%' OR LCASE(pm.program_name) LIKE '%satvaa%' OR LCASE(pm.program_name) LIKE '%sphoorti%')",
        operator: "",
        value: "",
        raw: true,
      });
      break;
    case "pregnancy_clients":
      condition.push({
        field: "pm.program_category",
        operator: "=",
        value: "Pregnancy",
      });
      break;
  }
}

const commonSelectFields = () => [
  "COUNT(DISTINCT cd.user_id) AS all_users",

  `COUNT(
    DISTINCT CASE 
      WHEN cd.suggested_program_id IS NOT NULL 
           AND cd.suggested_program_id NOT IN (0) 
           AND sp.suggested_program_id IS NOT NULL AND sp.updated_date BETWEEN '${moment()
             .startOf("month")
             .format("YYYY-MM-DD")}' AND '${moment()
    .endOf("month")
    .format("YYYY-MM-DD")}'
      THEN cd.user_id 
    END
  ) AS pitched`,

  `(COUNT(DISTINCT cd.user_id)-COUNT(
    DISTINCT CASE 
      WHEN cd.suggested_program_id IS NOT NULL 
           AND cd.suggested_program_id NOT IN (0) 
           AND sp.suggested_program_id IS NOT NULL AND sp.updated_date BETWEEN '${moment()
             .startOf("month")
             .format("YYYY-MM-DD")}' AND '${moment()
    .endOf("month")
    .format("YYYY-MM-DD")}'
      THEN cd.user_id 
    END
  )) AS not_pitched`,

  `COUNT(
    DISTINCT CASE 
      WHEN DATE(fu1.added_date) < DATE_SUB(CURDATE(), INTERVAL 3 DAY) 
      THEN cd.user_id 
    END
  ) AS no_follow_up_72_hours`,

  `COUNT(
    DISTINCT CASE 
      WHEN cd.sub_user_status = 'Cleanse active' 
      THEN cd.user_id 
    END
  ) AS lead_cleanse_active`,

  `COUNT(
    DISTINCT CASE 
      WHEN cd.app_version IS NULL 
      THEN cd.user_id 
    END
  ) AS not_downloaded`,
  `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status
      `,
  `COUNT(
    DISTINCT CASE 
      WHEN EXISTS (
        SELECT 1 
        FROM change_of_mentor com 
        WHERE com.user_id = cd.user_id 
          AND com.added_date BETWEEN '${moment()
            .startOf("month")
            .format("YYYY-MM-DD")}' AND '${moment()
    .endOf("month")
    .format("YYYY-MM-DD")}' 
          AND cd.mentor_assigned != com.old_mentor
      ) 
      THEN cd.user_id 
    END
  ) AS com_client`,

  `COUNT(
    DISTINCT CASE 
      WHEN cd.app_version IS NULL 
           OR (cd.device = 'android' AND cd.app_version < '${app_versions.android}') 
           OR (cd.device = 'ios' AND cd.app_version < '${app_versions.ios}') 
      THEN cd.user_id 
    END
  ) AS not_updated`,
  `COUNT(DISTINCT CASE WHEN pm.program_category='Platinum Stack' AND LCASE(pm.program_name) LIKE '%khyati%' THEN cd.user_id END) as platinum_clients`,
  `COUNT(DISTINCT CASE WHEN pm.program_category IN ('Privy Stack','Premium Stack') AND LCASE(pm.program_name) LIKE '%with mentor%' THEN cd.user_id END) as privy_clients`,
  `COUNT(DISTINCT CASE WHEN (LCASE(pm.program_name) LIKE '%weaning%' OR LCASE(pm.program_name) LIKE '%nourish%' OR LCASE(pm.program_name) LIKE '%satvaa%' OR LCASE(pm.program_name) LIKE '%sphoorti%') THEN cd.user_id END) as poshan_clients`,
  `COUNT(DISTINCT CASE WHEN pm.program_category = 'Pregnancy' THEN cd.user_id END) as pregnancy_clients`,
];

const allClients = async (req, res, next) => {
  const { status, id, page, limit, search } = req.body;
  if (!id || !status) {
    return next(new ErrorHandler("Id and status are required", 400));
  }
  try {
    let conditions = [
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
    ];
    let joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
    ];

    let textTableConditions = [];
    switch (status) {
      case "allActive":
        conditions.push({
          field: "cd.user_status",
          operator: "=",
          value: "Active",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "All Active Client List",
        });
        break;
      case "allActiveNAP":
        conditions.push({
          field: `(NOT EXISTS (SELECT 1 FROM ${tables.subOrderPrograms} sop2 WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4') )`,
          operator: "",
          value: "",
          raw: true,
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "All Active (No Advanced Purchase)",
        });
        break;
      case "active":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Active",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Active Client List",
        });
        break;
      case "cleanse":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Cleanse Active",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Cleanseactive Client List",
        });
        break;
      case "dormant":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Dormant",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Dormant Client List",
        });
        break;
      case "onhold":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Onhold",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Onhold Client List",
        });
        break;
      case "notStarted":
        conditions.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "notstarted",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Not Started Client List",
        });
        break;
      case "dormantOD":
        conditions.push(
          { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
          { field: "dsl.diet_status", operator: "=", value: 4 },
          {
            field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
            operator: ">",
            value: 19,
            raw: true,
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Dormant OD Client List",
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
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Onhold OD Client List",
        });
        break;
      case "notStartedOD":
        conditions.push(
          { field: "cd.sub_user_status", operator: "=", value: "notstarted" },
          {
            field: "CURDATE()",
            operator: ">",
            value: "sop.start_date",
            raw: true,
          }
        );
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Not Started OD Client List",
        });
        break;
      case "OCRCompleted":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "sop.order_type",
            operator: "=",
            value: "OCR",
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Completed Client List",
        });
        break;
      case "OCRFs":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field: "sop.order_type",
            operator: "=",
            value: "OCR",
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Forceful Shut Client List",
        });
        break;
      case "OCRDropout":
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Dropout",
          },
          {
            field: "sop.order_type",
            operator: "=",
            value: "OCR",
          }
        );
        joins.push({
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        });
        textTableConditions.push({
          field: "table_name",
          operator: "=",
          value: "Dropout Client List",
        });
        break;
      default:
        return next(new ErrorHandler("Invalid status value", 400));
    }
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_id",
        `CASE 
          WHEN cd.suggested_program_id IS NOT NULL AND cd.suggested_program_id NOT IN (0) AND sp.suggested_program_id IS NOT NULL THEN '1' 
          ELSE '0' 
        END AS 'pitched'`,
        `CASE 
          WHEN cd.suggested_program_id IS NULL OR cd.suggested_program_id IN (0) OR sp.suggested_program_id IS NULL THEN '1' 
          ELSE '0' 
        END AS 'not_pitched'`,
        "CASE WHEN DATE(fu1.added_date) < DATE_SUB(CURDATE(), INTERVAL 3 DAY) THEN '1' ELSE '0' END AS 'no_follow_up_72_hours'",
        "CASE WHEN cd.sub_user_status = 'Cleanse active' THEN '1' ELSE '0' END AS 'lead_cleanse_active'",
        "CASE WHEN cd.app_version IS NULL THEN '1' ELSE '0' END AS 'not_downloaded'",
        `CASE WHEN EXISTS (SELECT 1 FROM change_of_mentor com WHERE com.user_id = cd.user_id AND com.added_date BETWEEN '2025-04-01' AND '2025-04-30' AND cd.mentor_assigned != com.old_mentor) THEN '1' ELSE '0' END AS 'mentor_changed'`,
        "cd.app_version",
        "cd.device",
        `(SELECT  CASE WHEN created_at IS NOT NULL THEN 1 ELSE 0 END FROM ${tables.productOrders} WHERE payment_method='free' and sub_order_id=cd.active_order_id and user_id=cd.user_id ORDER by order_id desc LIMIT 1) as hamper_status`,
        "cd.sub_user_status",
      ],
      conditions,
      joins,
      groupBy: ["cd.user_id"],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });

    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(cd.user_id) AS all_users",
        `COUNT(
          CASE 
            WHEN cd.suggested_program_id IS NOT NULL 
                 AND cd.suggested_program_id NOT IN (0) 
                 AND sp.suggested_program_id IS NOT NULL 
            THEN 1 
            ELSE NULL 
          END
        ) AS pitched`,
        `COUNT(
          CASE 
            WHEN cd.suggested_program_id IS NULL 
                 OR cd.suggested_program_id IN (0) 
                 OR sp.suggested_program_id IS NULL 
            THEN 1 
            ELSE NULL 
          END
        ) AS not_pitched`,
        `COUNT(
          CASE 
            WHEN DATE(fu1.added_date) < DATE_SUB(CURDATE(), INTERVAL 3 DAY) 
            THEN 1 
            ELSE NULL 
          END
        ) AS no_follow_up_72_hours`,
        `COUNT(
          CASE 
            WHEN cd.sub_user_status = 'Cleanse active' 
            THEN 1 
            ELSE NULL 
          END
        ) AS lead_cleanse_active`,
        `COUNT(
          CASE 
            WHEN cd.app_version IS NULL 
            THEN 1 
            ELSE NULL 
          END
        ) AS not_downloaded`,
        `(SELECT COUNT(DISTINCT CASE WHEN created_at IS NOT NULL THEN cd.user_id END) FROM ${tables.productOrders} WHERE payment_method='free' and sub_order_id=cd.active_order_id and user_id=cd.user_id ORDER by order_id desc LIMIT 1) as hamper_status
      `,
        `COUNT(
          CASE 
            WHEN EXISTS (
              SELECT 1 
              FROM change_of_mentor com 
              WHERE com.user_id = cd.user_id 
                AND com.added_date BETWEEN '2024-10-01' AND '2024-10-31' 
                AND cd.mentor_assigned != com.old_mentor
            ) 
            THEN 1 
            ELSE NULL 
          END
        ) AS com_client`,
        `COUNT(
          CASE 
            WHEN cd.app_version IS NULL 
                 OR (cd.device = 'android' AND cd.app_version < '${app_versions.android}') 
                 OR (cd.device = 'ios' AND cd.app_version < '${app_versions.ios}') 
            THEN 1 
            ELSE NULL 
          END
        ) AS not_updated`,
      ],
      conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      pagination: {
        page,
        limit,
      },
      countTotal: true,
    });
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
      },
      orderBy: orderById,
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = whatsappText[0]?.whatsapp_text.replace(
        /{name}/g,
        `${details[index].client_name}`
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "All Active Client List",
      },
    ];
    switch (filter) {
      case "pitched":
        condition.push(
          {
            field: "cd.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.suggested_program_id",
            operator: "NOT IN",
            value: [0],
          },
          {
            field: "sp.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          }
        );
        break;
      case "not_pitched":
        condition.push({
          orConditions: [
            {
              field: "cd.suggested_program_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "cd.suggested_program_id",
              operator: "IN",
              value: [0],
            },
            {
              field: "sp.suggested_program_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "sp.updated_date NOT",
              operator: "BETWEEN",
              value: [
                `${moment().startOf("month").format("YYYY-MM-DD")}`,
                `${moment().endOf("month").format("YYYY-MM-DD")}`,
              ],
            },
          ],
        });
        break;
      case "no_follow_up_72_hours":
        condition.push({
          field: "fu1.added_date",
          operator: "<",
          value: "DATE_SUB(CURDATE(), INTERVAL 3 DAY)",
          raw: true,
        });
        break;
      case "lead_cleanse_active":
        condition.push({
          field: "cd.sub_user_status",
          operator: "=",
          value: "Cleanse active",
        });
        break;
      case "hamper_status":
        condition.push({
          field: `(SELECT  CASE WHEN created_at IS NOT NULL THEN 1 ELSE 0 END FROM ${tables.productOrders} WHERE payment_method='free' and sub_order_id=cd.active_order_id and user_id=cd.user_id ORDER by order_id desc LIMIT 1)`,
          operator: "=",
          value: 1,
          raw: true,
        });
        break;
      case "not_downloaded":
        condition.push({
          field: "cd.app_version",
          operator: "IS NULL",
          value: "",
          raw: true,
        });
        break;
      case "not_updated":
        condition.push({
          orConditions: [
            {
              field: `cd.app_version IS NULL 
                 OR (cd.device = 'android' AND cd.app_version < '${app_versions.android}') 
                 OR (cd.device = 'ios' AND cd.app_version < '${app_versions.ios}')`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        });
        break;
      case "com_client":
        condition.push({
          field: `EXISTS (
            SELECT 1 
            FROM change_of_mentor com 
            WHERE com.user_id = cd.user_id 
              AND com.added_date BETWEEN '${moment()
                .startOf("month")
                .format("YYYY-MM-DD")}' AND '${moment()
            .endOf("month")
            .format("YYYY-MM-DD")}' 
              AND cd.mentor_assigned != com.old_mentor
          )`,
          operator: "",
          value: "",
          raw: true,
        });
        break;
      case "platinum_clients":
        condition.push(
          {
            field: "pm.program_category",
            operator: "=",
            value: "Platinum Stack",
          },
          {
            field: "LCASE(pm.program_name)",
            operator: "LIKE",
            value: "khyati",
          }
        );
        break;
      case "privy_clients":
        condition.push(
          {
            field: "pm.program_category",
            operator: "IN",
            value: ["Privy Stack", "Premium Stack"],
          },
          {
            field: "LCASE(pm.program_name)",
            operator: "LIKE",
            value: "with mentor",
          }
        );
        break;
      case "poshan_clients":
        condition.push({
          field:
            "(LCASE(pm.program_name) LIKE '%weaning%' OR LCASE(pm.program_name) LIKE '%nourish%' OR LCASE(pm.program_name) LIKE '%satvaa%' OR LCASE(pm.program_name) LIKE '%sphoorti%')",
          operator: "",
          value: "",
          raw: true,
        });
        break;
      case "pregnancy_clients":
        condition.push({
          field: "pm.program_category",
          operator: "=",
          value: "Pregnancy",
        });
        break;
    }
    console.log(condition, 601);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `(SELECT  CASE WHEN created_at IS NOT NULL THEN 1 ELSE 0 END FROM ${tables.productOrders} WHERE payment_method='free' and sub_order_id=cd.active_order_id and user_id=cd.user_id ORDER by order_id desc LIMIT 1) as hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, totalCount, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "COUNT(DISTINCT cd.user_id) AS all_users",

        `COUNT(
    DISTINCT CASE 
      WHEN cd.suggested_program_id IS NOT NULL 
           AND cd.suggested_program_id NOT IN (0) 
           AND sp.suggested_program_id IS NOT NULL AND sp.updated_date BETWEEN '${moment()
             .startOf("month")
             .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("month")
          .format("YYYY-MM-DD")}'
      THEN cd.user_id 
    END
  ) AS pitched`,

        `(COUNT(DISTINCT cd.user_id)-COUNT(
    DISTINCT CASE 
      WHEN cd.suggested_program_id IS NOT NULL 
           AND cd.suggested_program_id NOT IN (0) 
           AND sp.suggested_program_id IS NOT NULL AND sp.updated_date BETWEEN '${moment()
             .startOf("month")
             .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("month")
          .format("YYYY-MM-DD")}'
      THEN cd.user_id 
    END
  )) AS not_pitched`,

        `COUNT(
    DISTINCT CASE 
      WHEN DATE(fu1.added_date) < DATE_SUB(CURDATE(), INTERVAL 3 DAY) 
      THEN cd.user_id 
    END
  ) AS no_follow_up_72_hours`,

        `COUNT(
    DISTINCT CASE 
      WHEN cd.sub_user_status = 'Cleanse active' 
      THEN cd.user_id 
    END
  ) AS lead_cleanse_active`,

        `COUNT(
    DISTINCT CASE 
      WHEN cd.app_version IS NULL 
      THEN cd.user_id 
    END
  ) AS not_downloaded`,
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,

        `COUNT(
    DISTINCT CASE 
      WHEN EXISTS (
        SELECT 1 
        FROM change_of_mentor com 
        WHERE com.user_id = cd.user_id 
          AND com.added_date BETWEEN '${moment()
            .startOf("month")
            .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("month")
          .format("YYYY-MM-DD")}' 
          AND cd.mentor_assigned != com.old_mentor
      ) 
      THEN cd.user_id 
    END
  ) AS com_client`,

        `COUNT(
    DISTINCT CASE 
      WHEN cd.app_version IS NULL 
           OR (cd.device = 'android' AND cd.app_version < '${app_versions.android}') 
           OR (cd.device = 'ios' AND cd.app_version < '${app_versions.ios}') 
      THEN cd.user_id 
    END
  ) AS not_updated`,
        `COUNT(DISTINCT CASE WHEN pm.program_category='Platinum Stack' AND LCASE(pm.program_name) LIKE '%khyati%' THEN cd.user_id END) as platinum_clients`,
        `COUNT(DISTINCT CASE WHEN pm.program_category IN ('Privy Stack','Premium Stack') AND LCASE(pm.program_name) LIKE '%with mentor%' THEN cd.user_id END) as privy_clients`,
        `COUNT(DISTINCT CASE WHEN (LCASE(pm.program_name) LIKE '%weaning%' OR LCASE(pm.program_name) LIKE '%nourish%' OR LCASE(pm.program_name) LIKE '%satvaa%' OR LCASE(pm.program_name) LIKE '%sphoorti%') THEN cd.user_id END) as poshan_clients`,

        `COUNT(DISTINCT CASE WHEN pm.program_category = 'Pregnancy' THEN cd.user_id END) as pregnancy_clients`,
      ],

      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });

    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    // console.log(extractedVariables);
    // return false;
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    console.log(details.length, 767);
    console.log(userData.length, 768);
    const validAdvanceProgramIds = [
      162, 163, 166, 167, 168, 169, 170, 171, 172, 173, 176,
    ];
    const validPhase2ProgramIds = [4, 34, 74, 75, 92, 91, 108, 6, 5, 38];
    const validPhasesp = [132, 134];
    const finalData = await Promise.all(
      users.map(async (user, index) => {
        const device = user.device;
        const version = user.app_version;
        const updated = compareVersions(
          device === "android" ? app_versions.android : app_versions.ios,
          version
        );

        const whatsapp_text = replacePlaceholders(
          whatsappText[0]?.whatsapp_text,
          userData[index]
        );
        // const { status, message } = await spinToWinWhatsappDraft(user.user_id);
        // console.log(whatsapp_text, 790);
        const mappedData = mapUserData({
          user: user,
          details: details[index],
          extraMappings: {
            filter_flags: {
              pitched: user.pitched,
              not_pitched: user.not_pitched,
              no_follow_up_72_hours: user.no_follow_up_72_hours,
              lead_cleanse_active: user.lead_cleanse_active,
              not_downloaded: user.not_downloaded,
              not_updated: updated ? "0" : "1",
              com_client: user.mentor_changed,
            },
          },
          addExtraKeyTo: {
            user_details: {
              // whatsapp_text: status == true ? message : whatsapp_text,
              whatsapp_text: whatsapp_text,
            },
          },
        });

        if (
          mappedData.user_details.status === "Completed" ||
          mappedData.user_details.status === "Dropout"
        ) {
          if (mappedData?.suggested_program_details?.suggested_program_id) {
            mappedData.user_details.whatsapp_text = `
                  Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
          } else {
            mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
          }
        } else {
          if (mappedData?.suggested_program_details?.suggested_program_id) {
            mappedData.user_details.whatsapp_text = `Hi ${
              mappedData.user_details.user_name
            }, 

Your BN Wallet just got a makeover with Rs.${
              mappedData.user_details?.wallet -
              mappedData.user_details?.old_wallet
            } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
              mappedData?.suggested_program_details?.suggested_program_id
            } to check the total discount on the 90-day ${
              mappedData?.suggested_program_details?.suggested_program_name
            } program  that I recommended to you :)
  `;
          } else {
            mappedData.user_details.whatsapp_text = `Hi ${
              mappedData.user_details.user_name
            }, 

Your BN Wallet just got a makeover with Rs.${
              mappedData.user_details?.wallet -
              mappedData.user_details?.old_wallet
            } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
          }
        }

        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }

        //       if (
        //         validAdvanceProgramIds.includes(
        //           mappedData?.suggested_program_details?.suggested_program_id
        //         )
        //       ) {
        //         mappedData.user_details.whatsapp_text = `Hi ${
        //           mappedData.user_details.user_name
        //         },

        // I was also feeling bad about your account losing Rs.${
        //           mappedData?.user_details?.old_wallet
        //         } that we had earned :(
        // Here is what I would like you to think about.

        // I had suggested the 90-day Anti-inflammatory Plateau breaker / Intermittent Fasting program that came to Rs.${
        //           27999 - mappedData?.user_details?.old_wallet
        //         }, right?

        // What if we do 90 days of Plateau breaker /  Intermittent Fasting instead? And I get your wallet credits back by tomorrow?

        // *The final Wallet Discount price will come to: Rs.${
        //           23999 - mappedData?.user_details?.old_wallet
        //         } only along with a complementary 10-day session!*

        // Do let me know when we can connect over a call to discuss the same - ${
        //           mappedData?.user_details?.call_link
        //         } `;
        //       } else if (
        //         validPhase2ProgramIds.includes(
        //           mappedData?.suggested_program_details?.suggested_program_id
        //         )
        //       ) {
        //         mappedData.user_details.whatsapp_text = `Hi ${
        //           mappedData.user_details.user_name
        //         },

        // I was also feeling bad about your account losing Rs.${
        //           mappedData?.user_details?.old_wallet
        //         } that we had earned :(
        // Here is what I would like you to think about.

        // I had suggested the 90 day ${
        //           mappedData?.suggested_program_details?.suggested_program_name
        //         } program that came to Rs.${
        //           23999 - mappedData?.user_details?.old_wallet
        //         }, right?

        // What if we do 60 days of ${
        //           mappedData?.suggested_program_details?.suggested_program_name
        //         } instead? And I get your wallet credits back by tomorrow?
        // The Wallet Discount price will come to: *Rs.${
        //           19999 - mappedData?.user_details?.old_wallet
        //         } only! You also get a 10-day Anti-inflammatory diet free!*

        // Do let me know when we can connect over a call to discuss the same - ${
        //           mappedData?.user_details?.call_link
        //         } `;
        //       } else {
        //         mappedData.user_details.whatsapp_text = `Hi ${
        //           mappedData?.user_details?.user_name
        //         },

        // I was also feeling bad about your account losing Rs.${
        //           mappedData?.user_details?.old_wallet
        //         }  that we had earned :(
        // Here is what I would like you to think about.

        // I had suggested the SlimPossible 60 program that came to Rs.${
        //           21599 - mappedData?.user_details?.old_wallet
        //         }, right?

        // What if I tell you that you get an additional 10-day Anti-inflammatory diet free? And I also get your wallet credits back by tomorrow?
        // *The final Wallet Discount price will come to: Rs.7999 only along with a complementary 10-day session!*

        // Do let me know when we can connect over a call to discuss the same - ${
        //           mappedData?.user_details?.call_link
        //         }`;
        //       }
        //       if(mappedData?.user_details?.status=='Active'){
        //        if (mappedData?.suggested_program_details?.suggested_program_id) {

        //         if (validPhase2ProgramIds.includes(mappedData?.suggested_program_details?.suggested_program_id)) {
        //             mappedData.user_details.whatsapp_text=`Hi ${mappedData.user_details.user_name},

        // We just ended our *Founder's Birthday Month* offer. It would have been the best option for you.

        // We still have a chance to get the program at 60% off on all the programs until tonight. The cost of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} Program that I had recommended to you will be Rs.11500 instead of Rs.27999

        // Let me know if you need a link or bank details. Will be happy to share!`;
        //         }else if (validPhasesp.includes(mappedData?.suggested_program_details?.suggested_program_id)) {
        //             mappedData.user_details.whatsapp_text=`Hi ${mappedData.user_details.user_name},

        // We just ended our *Founder's Birthday Month* offer. It would have been the best option for you.

        // We still have a chance to get the program at 70% off on all the programs until tonight. The cost of the 60-day ${mappedData?.suggested_program_details?.suggested_program_name} Program that I had recommended to you will be Rs.7999 instead of Rs.26999

        // Let me know if you need a link or bank details. Will be happy to share!`;
        //         }else if (validAdvanceProgramIds.includes(mappedData?.suggested_program_details?.suggested_program_id)) {
        //          mappedData.user_details.whatsapp_text=`Hi ${mappedData.user_details.user_name},

        // We just ended our *Founder's Birthday Month* offer. It would have been the best option for you.

        // We still have a chance to get the program upto 60% off on all the programs until tonight. The cost of the 180-day ${mappedData?.suggested_program_details?.suggested_program_name} Program that I had recommended to you will be Rs.28999 instead of Rs.64999

        // Let me know if you need a link or bank details. Will be happy to share!`;

        //         }else{
        //             mappedData.user_details.whatsapp_text=`Hi ${mappedData.user_details.user_name},

        // You just missed out on an excellent offer on the 60-day *Slim Possible* program that would have come at a very, very good rate.

        // The MRP of the program is Rs.26999 & you would have got it at Rs.7999/-

        // Until tomorrow, I can request the accounts to make this offer applicable to you.

        // Do let me know, & I shall have to share an external payment link for this as the offers in the app are over.

        // P.S. Click here https://www.balancenutrition.in/app_link/screen_id=29/call_type=45 to book a call with me to understand more!`;

        //         }

        //       } else {
        //       mappedData.user_details.whatsapp_text=`Hi ${mappedData.user_details.user_name},

        // You just missed out on an excellent offer on the 60-day *Slim Possible* program that would have come at a very, very good rate.

        // The MRP of the program is Rs.26999 & you would have got it at Rs.7999/-

        // Until tomorrow, I can request the accounts to make this offer applicable to you.

        // Do let me know, & I shall have to share an external payment link for this as the offers in the app are over.

        // P.S. Click here https://www.balancenutrition.in/app_link/screen_id=29/call_type=45 to book a call with me to understand more!`;

        //       }
        //     }else{
        //       mappedData.user_details.whatsapp_text = whatsapp_text;
        // //       mappedData.user_details.whatsapp_text=`Hi ${mappedData.user_details.user_name},

        // // How are you?

        // // Your weight back was ${mappedData.user_details.client_latest_weight} kg when you left us last.

        // // How about now, are you maintaining the same or have you gained?

        // // The Founder's day offers are now live, and until 7th July 2025, all our programs are available at flat 60% off - which is the lowest price ever!

        // // Do ping me back if you wish to know more and restart your health journey with us!`;
        //     }

        // mappedData.user_details.whatsapp_text = whatsapp_text;
        if (mappedData?.user_details?.status == "Active") {
          if (mappedData?.suggested_program_details?.suggested_program_id) {
            mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
          } else {
            mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
          }
        } else {
          if (mappedData?.suggested_program_details?.suggested_program_id) {
            mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
          } else {
            mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
          }
        }
        if (mappedData?.user_details?.status == "Active") {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
            mappedData?.suggested_program_details?.suggested_program_name ||
            "Slim Possible"
          } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id || 134
          } to check the final price.`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }

        const phone =
          mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
        const psBlock = /^(?:\+)?(91)/.test(phone)
          ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
          : "";

        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight.  

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight.

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
        }

        if (
          [
            "active",
            "onhold",
            "cleanse active",
            "dormant",
            "freezed",
            "notstarted",
          ].includes(mappedData.user_details?.status?.toLowerCase()) &&
          mappedData.user_details?.old_wallet >= 9000
        ) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          },

As you may know, the BN Healthy Snack Range is out :)

We have:
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- High Protein Cookies: https://balancenutrition.in/shop/dessert-cookies-chocolate
- Nippat Namkeen: https://balancenutrition.in/shop/baked-nippat

On the purchase of your next program using your expired BN Wallet (Rs. ${
            mappedData.user_details?.old_wallet - 1000
          }) & the double discount in-app, you get this hamper absolutely FREE.

${
  !mappedData?.suggested_program_details?.suggested_program_id
    ? `As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the 60 days Slim Possible program to reach your goal weight.
Program details: https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`
    : `I had recommended the 90 Days ${mappedData?.suggested_program_details?.suggested_program_name} program for you, should I send you the final rates?`
}

P.S. This offer is available till 6th November!

You can also purchase these products using these links:
- Baked Nippat: https://balancenutrition.in/shop/baked-nippat
- Quicky: https://balancenutrition.in/shop/quicky
- Khatta Meetha Quicky: https://balancenutrition.in/shop/khatta-meetha-quicky
- BN-Dark Chocolate Cookies: https://balancenutrition.in/shop/dessert-cookies-chocolate
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- Shop all: https://balancenutrition.in/shop

I will tell you which ones to order & also add them to your plan :)
`;
        } else if (
          [
            "active",
            "onhold",
            "cleanse active",
            "dormant",
            "freezed",
            "notstarted",
          ].includes(mappedData.user_details?.status?.toLowerCase())
        ) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

BN - Healthy Snacks, Desserts & Meals!

Discover our new healthy range that’s tasty, balanced & guilt-free :)

Here’s what’s inside the range:
- Nippat (baked snack under 150 calories): https://balancenutrition.in/shop/baked-nippat
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- Chocolate Cookies (0 sugar): https://balancenutrition.in/shop/dessert-cookies-chocolate
- Quicky Meal (high protein): https://balancenutrition.in/shop/quicky
- Khatta Meetha (lighter upma): https://balancenutrition.in/shop/khatta-meetha-quicky

P.S. Check our Sampler Packs & try all our products: https://balancenutrition.in/shop

P.P.S. Pick your favourites, I will add them to your next session :)
`;
        }
        if (
          [
            "active",
            "onhold",
            "cleanse active",
            "dormant",
            "freezed",
            "notstarted",
          ].includes(mappedData.user_details?.status?.toLowerCase()) &&
          mappedData.user_details?.wallet >= 8000
        ) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          },

Exciting news alert! Your BN Wallet just got a makeover with a cool Rs.${
            mappedData.user_details?.wallet - 1000
          } credited back.

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here to check the total discount on the ${
            mappedData?.suggested_program_details?.suggested_program_name
              ? "90"
              : "60"
          }-day ${
            mappedData?.suggested_program_details?.suggested_program_name ||
            "Slim Possible"
          } program that I recommended to you until 15th Nov. 

P.S. Get a BN Snack Hamper with our compliments on your purchase. `;
        }

        const psBlock1 = /^(?:\+)?(91)/.test(phone)
          ?"\n\nP.S. Also going to send you an exclusive BN Healthy Snack Hamper :)":"\n\nP.S.You'll receive a FREE 3-Day Gut Reset Detox to welcome you back!";
        
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon. 
Before this happens. Let's get your next program registered for.
${psBlock1}`;
        if (
          [
            "active",
            "onhold",
            "cleanse active",
            "cleanseactive",
            "dormant",
            "freezed",
            "notstarted",
            "not started",
          ].includes(mappedData.user_details?.status?.toLowerCase()) 
        ){
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
Wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring soon. Do check the current offer with your BN Wallet on the 90-day ${ mappedData?.suggested_program_details?.suggested_program_name || "Advance Plateau Breaker" } program that I had recommended to you.`;
        }
        if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
        return mappedData;
      })
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
        "old_wallet",
        "call_link",
        "mentor_assigned",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allActiveNoAdvancePurchaseClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "sop.program_status", operator: "=", value: "1" },
      {
        field: `(NOT EXISTS (SELECT 1 FROM ${tables.subOrderPrograms} sop2 WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4') )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "All Active (No Advanced Purchase)",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "sop.program_status", operator: "=", value: "1" },
        {
          field: `(NOT EXISTS (SELECT 1 FROM ${tables.subOrderPrograms} sop2 WHERE sop2.user_id = cd.user_id AND sop2.program_status = '4') )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      if (
        mappedData.user_details.status === "Completed" ||
        mappedData.user_details.status === "Dropout"
      ) {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id
          } to check the total discount on the 90-day ${
            mappedData?.suggested_program_details?.suggested_program_name
          } program  that I recommended to you :)
  `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
        }
      }

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      // mappedData.user_details.whatsapp_text = whatsapp_text;
      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          mappedData?.suggested_program_details?.suggested_program_id || 134
        } to check the final price.`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
      }
      const phone =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const psBlock = /^(?:\+)?(91)/.test(phone)
        ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
        : "";

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      }

      if (
        [
          "active",
          "onhold",
          "cleanse active",
          "dormant",
          "freezed",
          "notstarted",
        ].includes(mappedData.user_details?.status?.toLowerCase()) &&
        mappedData.user_details?.old_wallet >= 9000
      ) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

As you may know, the BN Healthy Snack Range is out :)

We have:
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- High Protein Cookies: https://balancenutrition.in/shop/dessert-cookies-chocolate
- Nippat Namkeen: https://balancenutrition.in/shop/baked-nippat

On the purchase of your next program using your expired BN Wallet (Rs. ${
          mappedData.user_details?.old_wallet - 1000
        }) & the double discount in-app, you get this hamper absolutely FREE.

${
  !mappedData?.suggested_program_details?.suggested_program_id
    ? `As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the 60 days Slim Possible program to reach your goal weight.
Program details: https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`
    : `I had recommended the 90 Days ${mappedData?.suggested_program_details?.suggested_program_name} program for you, should I send you the final rates?`
}

P.S. This offer is available till 6th November!

You can also purchase these products using these links:
- Baked Nippat: https://balancenutrition.in/shop/baked-nippat
- Quicky: https://balancenutrition.in/shop/quicky
- Khatta Meetha Quicky: https://balancenutrition.in/shop/khatta-meetha-quicky
- BN-Dark Chocolate Cookies: https://balancenutrition.in/shop/dessert-cookies-chocolate
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- Shop all: https://balancenutrition.in/shop

I will tell you which ones to order & also add them to your plan :)
`;
      } else if (
        [
          "active",
          "onhold",
          "cleanse active",
          "dormant",
          "freezed",
          "notstarted",
        ].includes(mappedData.user_details?.status?.toLowerCase())
      ) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

BN - Healthy Snacks, Desserts & Meals!

Discover our new healthy range that’s tasty, balanced & guilt-free :)

Here’s what’s inside the range:
- Nippat (baked snack under 150 calories): https://balancenutrition.in/shop/baked-nippat
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- Chocolate Cookies (0 sugar): https://balancenutrition.in/shop/dessert-cookies-chocolate
- Quicky Meal (high protein): https://balancenutrition.in/shop/quicky
- Khatta Meetha (lighter upma): https://balancenutrition.in/shop/khatta-meetha-quicky

P.S. Check our Sampler Packs & try all our products: https://balancenutrition.in/shop

P.P.S. Pick your favourites, I will add them to your next session :)
`;
      }
      if (
        [
          "active",
          "onhold",
          "cleanse active",
          "dormant",
          "freezed",
          "notstarted",
        ].includes(mappedData.user_details?.status?.toLowerCase()) &&
        mappedData.user_details?.wallet >= 8000
      ) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Exciting news alert! Your BN Wallet just got a makeover with a cool Rs.${
          mappedData.user_details?.wallet - 1000
        } credited back.

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here to check the total discount on the ${
          mappedData?.suggested_program_details?.suggested_program_name
            ? "90"
            : "60"
        }-day ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } program that I recommended to you until 15th Nov. 

P.S. Get a BN Snack Hamper with our compliments on your purchase. `;
      }
      const psBlock1 = /^(?:\+)?(91)/.test(phone)
          ?"\n\nP.S. Also going to send you an exclusive BN Healthy Snack Hamper :)":"\n\nP.S.You'll receive a FREE 3-Day Gut Reset Detox to welcome you back!";
        
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon. 
Before this happens. Let's get your next program registered for.
${psBlock1}`;
 if (
          [
            "active",
            "onhold",
            "cleanse active",
            "cleanseactive",
            "dormant",
            "freezed",
            "notstarted",
            "not started",
          ].includes(mappedData.user_details?.status?.toLowerCase()) 
        ){
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
Wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring soon. Do check the current offer with your BN Wallet on the 90-day ${ mappedData?.suggested_program_details?.suggested_program_name || "Advance Plateau Breaker" } program that I had recommended to you.`;
        }
     if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const activeClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "Active" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Active Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      // mappedData.user_details.whatsapp_text = whatsapp_text;
      if (
        mappedData.user_details.status === "Completed" ||
        mappedData.user_details.status === "Dropout"
      ) {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id
          } to check the total discount on the 90-day ${
            mappedData?.suggested_program_details?.suggested_program_name
          } program  that I recommended to you :)
  `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
        }
      }

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }

      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          mappedData?.suggested_program_details?.suggested_program_id || 134
        } to check the final price.`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
      }
      const phone =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const psBlock = /^(?:\+)?(91)/.test(phone)
        ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
        : "";

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      }

      if (
        [
          "active",
          "onhold",
          "cleanse active",
          "dormant",
          "freezed",
          "notstarted",
        ].includes(mappedData.user_details?.status?.toLowerCase()) &&
        mappedData.user_details?.old_wallet >= 9000
      ) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

As you may know, the BN Healthy Snack Range is out :)

We have:
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- High Protein Cookies: https://balancenutrition.in/shop/dessert-cookies-chocolate
- Nippat Namkeen: https://balancenutrition.in/shop/baked-nippat

On the purchase of your next program using your expired BN Wallet (Rs. ${
          mappedData.user_details?.old_wallet - 1000
        }) & the double discount in-app, you get this hamper absolutely FREE.

${
  !mappedData?.suggested_program_details?.suggested_program_id
    ? `As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the 60 days Slim Possible program to reach your goal weight.
Program details: https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`
    : `I had recommended the 90 Days ${mappedData?.suggested_program_details?.suggested_program_name} program for you, should I send you the final rates?`
}

P.S. This offer is available till 6th November!

You can also purchase these products using these links:
- Baked Nippat: https://balancenutrition.in/shop/baked-nippat
- Quicky: https://balancenutrition.in/shop/quicky
- Khatta Meetha Quicky: https://balancenutrition.in/shop/khatta-meetha-quicky
- BN-Dark Chocolate Cookies: https://balancenutrition.in/shop/dessert-cookies-chocolate
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- Shop all: https://balancenutrition.in/shop

I will tell you which ones to order & also add them to your plan :)
`;
      } else if (
        [
          "active",
          "onhold",
          "cleanse active",
          "dormant",
          "freezed",
          "notstarted",
        ].includes(mappedData.user_details?.status?.toLowerCase())
      ) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

BN - Healthy Snacks, Desserts & Meals!

Discover our new healthy range that’s tasty, balanced & guilt-free :)

Here’s what’s inside the range:
- Nippat (baked snack under 150 calories): https://balancenutrition.in/shop/baked-nippat
- Makhana Chips: https://balancenutrition.in/shop/makhana-chips
- Chocolate Cookies (0 sugar): https://balancenutrition.in/shop/dessert-cookies-chocolate
- Quicky Meal (high protein): https://balancenutrition.in/shop/quicky
- Khatta Meetha (lighter upma): https://balancenutrition.in/shop/khatta-meetha-quicky

P.S. Check our Sampler Packs & try all our products: https://balancenutrition.in/shop

P.P.S. Pick your favourites, I will add them to your next session :)
`;
      }

      if (
        [
          "active",
          "onhold",
          "cleanse active",
          "dormant",
          "freezed",
          "notstarted",
        ].includes(mappedData.user_details?.status?.toLowerCase()) &&
        mappedData.user_details?.wallet >= 8000
      ) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Exciting news alert! Your BN Wallet just got a makeover with a cool Rs.${
          mappedData.user_details?.wallet - 1000
        } credited back.

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here to check the total discount on the ${
          mappedData?.suggested_program_details?.suggested_program_name
            ? "90"
            : "60"
        }-day ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } program that I recommended to you until 15th Nov. 

P.S. Get a BN Snack Hamper with our compliments on your purchase. `;
      }

      const psBlock1 = /^(?:\+)?(91)/.test(phone)
          ?"\n\nP.S. Also going to send you an exclusive BN Healthy Snack Hamper :)":"\n\nP.S.You'll receive a FREE 3-Day Gut Reset Detox to welcome you back!";
        
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon. 
Before this happens. Let's get your next program registered for.
${psBlock1}`;
 if (
          [
            "active",
            "onhold",
            "cleanse active",
            "cleanseactive",
            "dormant",
            "freezed",
            "notstarted",
            "not started",
          ].includes(mappedData.user_details?.status?.toLowerCase()) 
        ){
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
Wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring soon. Do check the current offer with your BN Wallet on the 90-day ${ mappedData?.suggested_program_details?.suggested_program_name || "Advance Plateau Breaker" } program that I had recommended to you.`;
        }
   if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allActiveClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.user_status", operator: "=", value: "Active" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Active Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Active" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const cleanseClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "Cleanse Active" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Cleanseactive Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Cleanse Active" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const dormantClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Dormant Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const onholdClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
      { field: "sop.program_status", operator: "=", value: "1" },
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.onholdClients} oh`,
        on: "oh.sub_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "cd.suggested_program_id = sp.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Onhold Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        "oh.start_date",
        "oh.end_date",
        "oh.onhold_note",
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
          break_details: {
            start_date: moment(user.start_date).format("DD MMM YYYY"),
            end_date: moment(user.end_date).format("DD MMM YYYY"),
            onhold_note: user.onhold_note,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      // mappedData.user_details.start_date = user.start_date;
      // mappedData.user_details.end_date = user.end_date;
      // mappedData.user_details.onhold_note = user.onhold_note
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const notStartedClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "notstarted" },
      {
        field: "CURDATE()",
        operator: "<=",
        value: "date(sop.start_date)",
        raw: true,
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Not Started Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 2764);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "notstarted" },
        {
          field: "CURDATE()",
          operator: "<=",
          value: "date(sop.start_date)",
          raw: true,
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      function formatProgramStartDate(dateStr) {
        const inputDate = moment(dateStr).startOf("day");
        const today = moment().startOf("day");
        const tomorrow = moment().add(1, "day").startOf("day");

        if (inputDate.isSame(today)) return "Today";
        if (inputDate.isSame(tomorrow)) return "Tomorrow";

        // Customize the format as needed
        return inputDate.format("DD/MM/YYYY"); // e.g. "02/05/2025"
      }
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          starts_in: formatProgramStartDate(
            details[index].current_program_start_date
          ),
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const dormantODClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
      { field: "sop.program_status", operator: "=", value: "1" },
      { field: "dsl.diet_status", operator: "=", value: 4 },
      {
        field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
        operator: ">",
        value: 19,
        raw: true,
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Dormant OD Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
        { field: "dsl.diet_status", operator: "=", value: 4 },
        { field: "sop.program_status", operator: "=", value: "1" },
        {
          field: "DATEDIFF(CURDATE(),dsl.diet_start_date)",
          operator: ">",
          value: 19,
          raw: true,
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const onholdODClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
      { field: "sop.program_status", operator: "=", value: "1" },
      { field: "CURDATE()", operator: ">", value: "od.end_date", raw: true },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.onholdClients} od`,
        on: `od.id =(SELECT id
           FROM ${tables.onholdClients} 
           where sub_order_id = cd.active_order_id order by id desc limit 1) `,
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Onhold OD Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        "od.start_date",
        "od.end_date",
        "od.onhold_note",
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
        { field: "sop.program_status", operator: "=", value: "1" },
        { field: "CURDATE()", operator: ">", value: "od.end_date", raw: true },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
          break_details: {
            start_date: moment(user.start_date).format("DD MMM YYYY"),
            end_date: moment(user.end_date).format("DD MMM YYYY"),
            onhold_note: user.onhold_note,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const notStartedODClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.sub_user_status", operator: "=", value: "notstarted" },
      {
        field: "CURDATE()",
        operator: ">",
        value: "sop.start_date",
        raw: true,
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Not Started OD Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.sub_user_status", operator: "=", value: "notstarted" },
        {
          field: "CURDATE()",
          operator: ">",
          value: "sop.start_date",
          raw: true,
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });

    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text = replacePlaceholders(
        whatsappText[0]?.whatsapp_text,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          stats_in: moment().fromNow(details[index].current_program_start_date),
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const OCRAllClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "cd.user_status",
        operator: "=",
        value: "Completed",
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Completed Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }

    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    const validAdvanceProgramIds = [
      162, 163, 166, 167, 168, 169, 170, 171, 172, 173, 176,
    ];
    const validPhase2ProgramIds = [4, 34, 74, 75, 92, 91, 108, 6, 5, 38];
   let oc_txt=`Hi {{name}},
This is {{mentor_designation}} {{mentor_name}} from Balance Nutrition.

You had done a program with us in the year {{expiry_date}} and your last recorded weight with us was {{last_wmr}}kg.

*Khyati Ma'am* and I were just reviewing your profile, and she wanted to know about your progress.

What’s your current weight now?

Awaiting your revert.`;
let oc_hs_txt=`“{{overall_health_score}}” was your last BN-HEALTH SCORE

Hi {{name}},

As per your last updates, {{client_days_ago}} days ago, your weight was {{last_hs_weight}}kg & your overall B.M.I was {{bmi}}.

*Let's Check Your Current Health Parameters* 

Update a few details & get to know your:
* Ideal Weight
* B.M.I
* Obesity Category
* Overall Health Score

*Let's Set Our Health Goals For 2026 Together!*

Get Report : http://balancenutrition.in/health-score`;
const extractedVariables1 = extractVariables(oc_hs_txt);
    // const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const extractedVariables = extractVariables(oc_txt);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
     const userData1 = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables1],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      // const whatsapp_text = replacePlaceholders(
      //   whatsappText[0]?.whatsapp_text,
      //   userData[index]
      // );
      const whatsapp_text = replacePlaceholders(
        oc_txt,
        userData[index]
      );
      const whatsapp_text1 = replacePlaceholders(
        oc_hs_txt,
        userData1[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });

      //       if (
      //         validAdvanceProgramIds.includes(
      //           mappedData?.suggested_program_details?.suggested_program_id
      //         )
      //       ) {
      //         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

      // An urgent reminder Rs.${mappedData?.user_details?.wallet} in your BN Wallet will become 0 on Saturday!

      // The 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I had recommended to you is available at a very good price.

      // To know your final price, please write back to me here & I shall send you all the details.

      // Let me know if you want to get on a quick call too
      //           `;
      //       } else if (
      //         validPhase2ProgramIds.includes(
      //           mappedData?.suggested_program_details?.suggested_program_id
      //         )
      //       ) {
      //         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

      // An urgent reminder Rs.${mappedData?.user_details?.wallet} in your BN Wallet will become 0 on Saturday!

      // The 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I had recommended to you is available at a very good price.

      // To know your final price, please write back to me here & I shall send you all the details.

      // Let me know if you want to get on a quick call too
      //           `;
      //       } else {
      //         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

      // An urgent reminder Rs.${mappedData?.user_details?.wallet} in your BN Wallet will become 0 on Saturday!

      // The 60-day Slim Possible program that I had recommended to you is available at a very good price.

      // To know your final price, please write back to me here & I shall send you all the details.

      // Let me know if you want to get on a quick call too
      //           `;
      //       }
      //       mappedData.user_details.whatsapp_text = whatsapp_text;

      if (
        mappedData.user_details.status === "Completed" ||
        mappedData.user_details.status === "Dropout"
      ) {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `
                  Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id
          } to check the total discount on the 90-day ${
            mappedData?.suggested_program_details?.suggested_program_name
          } program  that I recommended to you :)
  `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
        }
      }

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          mappedData?.suggested_program_details?.suggested_program_id || 134
        } to check the final price.`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
      }
      const phone =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const psBlock = /^(?:\+)?(91)/.test(phone)
        ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
        : "";

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      }

      const dropoutCount = details[index]?.dropout_count || 0;
      const programDuration =
        details[index]?.current_program_duration || "90-day";
      const programName =
        details[index]?.current_program_name || "Intermittent Fasting Program";

      // 🔹 Get phone & check if user is in India
      const phonein =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const isIndia = /^(?:\+)?91/.test(phonein);

      // 🔹 If dropout_count exists and > 0 → use "Reopen Unused Sessions" message
      if (dropoutCount > 1 && dropoutCount <=8) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Good news for you! 

Until December 15th, you can re-open your ${dropoutCount} unused sessions from the ${programDuration} Days ${programName} that you had dropped out of.
${
  isIndia
    ? "\n\nYou'll also receive a FREE BN Healthy Snack Hamper to welcome you back!"
    : "\n\nYou'll also receive a FREE 3-Day Gut Reset Detox to welcome you back! "
}

Get in touch with me to know how. :)

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to schedule a call with me & discuss this further. `;
      }
      // 🔹 Else if dropout_count not present → fallback to App Upgrade message
      else  {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
We've upgraded your BN App & added a Free Diet!

Inside, you'll also find that you have:
1. 1800 Weight Loss Recipes 
2. Wallet Money 
3. Old Program Reports
4. Digitised Restaurant & Alcohol Guides
5. Complimentary BN Snack Hampers

Download the BN App Now!
https://www.balancenutrition.in/download-bn-app
        `;
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon.
What is your weight currently?
        `;
      }
      if (dropoutCount > 1 && dropoutCount <= 8) {
  mappedData.user_details.whatsapp_text = whatsapp_text;
} else if (
  whatsapp_text1 &&
  !whatsapp_text1.toLowerCase().includes("null")
) {
  mappedData.user_details.whatsapp_text = whatsapp_text1;
}else{
  mappedData.user_details.whatsapp_text = whatsapp_text;
}

if (dropoutCount > 1 && dropoutCount <= 8) {
 mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.

You also have ${dropoutCount} pending sessions from the previous ${programDuration}Days ${programName} program that we can re open :)

Let's talk: https://www.balancenutrition.in/app_link/screen_id=294/call_type=45`;

}else{
   mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.`;

}
      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
        "mentor_assigned",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const OCRCompletedClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Completed",
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Completed Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        {
          field: "cd.sub_user_status",
          operator: "=",
          value: "Completed",
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    let oc_txt=`Hi {{name}},
This is {{mentor_designation}} {{mentor_name}} from Balance Nutrition.

You had done a program with us in the year {{expiry_date}} and your last recorded weight with us was {{last_wmr}}kg.

*Khyati Ma'am* and I were just reviewing your profile, and she wanted to know about your progress.

What’s your current weight now?

Awaiting your revert.`;
let oc_hs_txt=`“{{overall_health_score}}” was your last BN-HEALTH SCORE

Hi {{name}},

As per your last updates, {{client_days_ago}} days ago, your weight was {{last_hs_weight}}kg & your overall B.M.I was {{bmi}}.

*Let's Check Your Current Health Parameters* 

Update a few details & get to know your:
* Ideal Weight
* B.M.I
* Obesity Category
* Overall Health Score

*Let's Set Our Health Goals For 2026 Together!*

Get Report : http://balancenutrition.in/health-score`;
const extractedVariables1 = extractVariables(oc_hs_txt);
    // const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const extractedVariables = extractVariables(oc_txt);
     const userData1 = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables1],
      groupBy: " GROUP BY cd.user_id",
    });
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      // const whatsapp_text = replacePlaceholders(
      //   whatsappText[0]?.whatsapp_text,
      //   userData[index]
      // );
      const whatsapp_text1 = replacePlaceholders(
        oc_hs_txt,
        userData1[index]
      );
      const whatsapp_text = replacePlaceholders(
        oc_txt,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });

      if (
        mappedData.user_details.status === "Completed" ||
        mappedData.user_details.status === "Dropout"
      ) {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `
                  Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id
          } to check the total discount on the 90-day ${
            mappedData?.suggested_program_details?.suggested_program_name
          } program  that I recommended to you :)
  `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
        }
      }

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      // mappedData.user_details.whatsapp_text = whatsapp_text;
      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          mappedData?.suggested_program_details?.suggested_program_id || 134
        } to check the final price.`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.

You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
      }
      const phone =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const psBlock = /^(?:\+)?(91)/.test(phone)
        ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
        : "";

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      }

      const dropoutCount = details[index]?.dropout_count || 0;
      const programDuration =
        details[index]?.current_program_duration || "90-day";
      const programName =
        details[index]?.current_program_name || "Intermittent Fasting Program";

      // 🔹 Get phone & check if user is in India
      const phonein =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const isIndia = /^(?:\+)?91/.test(phonein);

      // 🔹 If dropout_count exists and > 0 → use "Reopen Unused Sessions" message
      if (dropoutCount > 1 && dropoutCount <=8) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Good news for you! 

Until December 15th, you can re-open your ${dropoutCount} unused sessions from the ${programDuration} Days ${programName} that you had dropped out of.
${
  isIndia
    ? "\n\nYou'll also receive a FREE BN Healthy Snack Hamper to welcome you back!"
    : "\n\nYou'll also receive a FREE 3-Day Gut Reset Detox to welcome you back! "
}

Get in touch with me to know how. :)

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to schedule a call with me & discuss this further. `;
      }
      // 🔹 Else if dropout_count not present → fallback to App Upgrade message
      else  {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
We've upgraded your BN App & added a Free Diet!

Inside, you'll also find that you have:
1. 1800 Weight Loss Recipes 
2. Wallet Money 
3. Old Program Reports
4. Digitised Restaurant & Alcohol Guides
5. Complimentary BN Snack Hampers

Download the BN App Now!
https://www.balancenutrition.in/download-bn-app
        `;
         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon.
What is your weight currently?
        `;
      }
      if (dropoutCount > 1 && dropoutCount <= 8) {
  mappedData.user_details.whatsapp_text = whatsapp_text;
} else if (
  whatsapp_text1 &&
  !whatsapp_text1.toLowerCase().includes("null")
) {
  mappedData.user_details.whatsapp_text = whatsapp_text1;
}else{
  mappedData.user_details.whatsapp_text = whatsapp_text;
}
if (dropoutCount > 1 && dropoutCount <= 8) {
 mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.

You also have ${dropoutCount} pending sessions from the previous ${programDuration}Days ${programName} program that we can re open :)

Let's talk: https://www.balancenutrition.in/app_link/screen_id=294/call_type=45`;

}else{
   mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.`;

}
      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
        "mentor_assigned",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const OCRFClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Fs",
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Forceful Shut Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        {
          field: "cd.sub_user_status",
          operator: "=",
          value: "Fs",
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    let oc_txt=`Hi {{name}},
This is {{mentor_designation}} {{mentor_name}} from Balance Nutrition.

You had done a program with us in the year {{expiry_date}} and your last recorded weight with us was {{last_wmr}}kg.

*Khyati Ma'am* and I were just reviewing your profile, and she wanted to know about your progress.

What’s your current weight now?

Awaiting your revert.`;
let oc_hs_txt=`“{{overall_health_score}}” was your last BN-HEALTH SCORE

Hi {{name}},

As per your last updates, {{client_days_ago}} days ago, your weight was {{last_hs_weight}}kg & your overall B.M.I was {{bmi}}.

*Let's Check Your Current Health Parameters* 

Update a few details & get to know your:
* Ideal Weight
* B.M.I
* Obesity Category
* Overall Health Score

*Let's Set Our Health Goals For 2026 Together!*

Get Report : http://balancenutrition.in/health-score`;
const extractedVariables1 = extractVariables(oc_hs_txt);
const extractedVariables = extractVariables(oc_txt);
    // const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData1 = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables1],
      groupBy: " GROUP BY cd.user_id",
    });
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text1 = replacePlaceholders(
        oc_hs_txt,
        userData1[index]
      );
      const whatsapp_text = replacePlaceholders(
        oc_txt,
        userData[index]
      );
      
      // const whatsapp_text = replacePlaceholders(
      //   whatsappText[0]?.whatsapp_text,
      //   userData[index]
      // );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      mappedData.user_details.whatsapp_text = whatsapp_text;
      const dropoutCount = details[index]?.dropout_count || 0;
      const programDuration =
        details[index]?.current_program_duration || "90-day";
      const programName =
        details[index]?.current_program_name || "Intermittent Fasting Program";

      // 🔹 Get phone & check if user is in India
      const phonein =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const isIndia = /^(?:\+)?91/.test(phonein);

      // 🔹 If dropout_count exists and > 0 → use "Reopen Unused Sessions" message
      if (dropoutCount > 1 && dropoutCount <=8) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Good news for you! 

Until December 15th, you can re-open your ${dropoutCount} unused sessions from the ${programDuration} Days ${programName} that you had dropped out of.
${
  isIndia
    ? "\n\nYou'll also receive a FREE BN Healthy Snack Hamper to welcome you back!"
    : "\n\nYou'll also receive a FREE 3-Day Gut Reset Detox to welcome you back! "
}

Get in touch with me to know how. :)

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to schedule a call with me & discuss this further. `;
      }
      // 🔹 Else if dropout_count not present → fallback to App Upgrade message
      else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
We've upgraded your BN App & added a Free Diet!

Inside, you'll also find that you have:
1. 1800 Weight Loss Recipes 
2. Wallet Money 
3. Old Program Reports
4. Digitised Restaurant & Alcohol Guides
5. Complimentary BN Snack Hampers

Download the BN App Now!
https://www.balancenutrition.in/download-bn-app
        `;
         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon.
What is your weight currently?
        `;
      }
      if (dropoutCount > 1 && dropoutCount <= 8) {
  mappedData.user_details.whatsapp_text = whatsapp_text;
} else if (
  whatsapp_text1 &&
  !whatsapp_text1.toLowerCase().includes("null")
) {
  mappedData.user_details.whatsapp_text = whatsapp_text1;
}else{
  mappedData.user_details.whatsapp_text = whatsapp_text;
}
if (dropoutCount > 1 && dropoutCount <= 8) {
 mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.

You also have ${dropoutCount} pending sessions from the previous ${programDuration}Days ${programName} program that we can re open :)

Let's talk: https://www.balancenutrition.in/app_link/screen_id=294/call_type=45`;

}else{
   mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.`;

}
  if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134}. 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
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
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const OCRDropoutClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Dropout",
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Dropout Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        {
          field: "cd.sub_user_status",
          operator: "=",
          value: "Dropout",
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    let oc_txt=`Hi {{name}},
This is {{mentor_designation}} {{mentor_name}} from Balance Nutrition.

You had done a program with us in the year {{expiry_date}} and your last recorded weight with us was {{last_wmr}}kg.

*Khyati Ma'am* and I were just reviewing your profile, and she wanted to know about your progress.

What’s your current weight now?

Awaiting your revert.`;
let oc_hs_txt=`“{{overall_health_score}}” was your last BN-HEALTH SCORE

Hi {{name}},

As per your last updates, {{client_days_ago}} days ago, your weight was {{last_hs_weight}}kg & your overall B.M.I was {{bmi}}.

*Let's Check Your Current Health Parameters* 

Update a few details & get to know your:
* Ideal Weight
* B.M.I
* Obesity Category
* Overall Health Score

*Let's Set Our Health Goals For 2026 Together!*

Get Report : http://balancenutrition.in/health-score`;
const extractedVariables1 = extractVariables(oc_hs_txt);
const extractedVariables = extractVariables(oc_txt);
    // const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
     const userData1 = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables1],
      groupBy: " GROUP BY cd.user_id",
    });
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      const whatsapp_text1 = replacePlaceholders(
        oc_hs_txt,
        userData1[index]
      );
     
      const whatsapp_text = replacePlaceholders(
        oc_txt,
        userData[index]
      );
      // const whatsapp_text = replacePlaceholders(
      //   whatsappText[0]?.whatsapp_text,
      //   userData[index]
      // );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      if (
        mappedData.user_details.status === "Completed" ||
        mappedData.user_details.status === "Dropout"
      ) {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id
          } to check the total discount on the 90-day ${
            mappedData?.suggested_program_details?.suggested_program_name
          } program  that I recommended to you :)
  `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
        }
      }

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      // mappedData.user_details.whatsapp_text = whatsapp_text;
      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          mappedData?.suggested_program_details?.suggested_program_id || 134
        } to check the final price.`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
      }
      const phone =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const psBlock = /^(?:\+)?(91)/.test(phone)
        ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
        : "";

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      }

      const dropoutCount = details[index]?.dropout_count || 0;
      const programDuration =
        details[index]?.current_program_duration || "90-day";
      const programName =
        details[index]?.current_program_name || "Intermittent Fasting Program";

      // 🔹 Get phone & check if user is in India
      const phonein =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const isIndia = /^(?:\+)?91/.test(phonein);

      // 🔹 If dropout_count exists and > 0 → use "Reopen Unused Sessions" message
      if (dropoutCount > 1 && dropoutCount <=8) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Good news for you! 

Until December 15th, you can re-open your ${dropoutCount} unused sessions from the ${programDuration} Days ${programName} that you had dropped out of.
${
  isIndia
    ? "\n\nYou'll also receive a FREE BN Healthy Snack Hamper to welcome you back!"
    : "\n\nYou'll also receive a FREE 3-Day Gut Reset Detox to welcome you back! "
}

Get in touch with me to know how. :)

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to schedule a call with me & discuss this further. `;
      }
      // 🔹 Else if dropout_count not present → fallback to App Upgrade message
      else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
We've upgraded your BN App & added a Free Diet!

Inside, you'll also find that you have:
1. 1800 Weight Loss Recipes 
2. Wallet Money 
3. Old Program Reports
4. Digitised Restaurant & Alcohol Guides
5. Complimentary BN Snack Hampers

Download the BN App Now!
https://www.balancenutrition.in/download-bn-app
        `;
         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon.
What is your weight currently?
        `;
      }
     if (dropoutCount > 1 && dropoutCount <= 8) {
  mappedData.user_details.whatsapp_text = whatsapp_text;
} else if (
  whatsapp_text1 &&
  !whatsapp_text1.toLowerCase().includes("null")
) {
  mappedData.user_details.whatsapp_text = whatsapp_text1;
}else{
  mappedData.user_details.whatsapp_text = whatsapp_text;
}
if (dropoutCount > 1 && dropoutCount <= 8) {
 mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.

You also have ${dropoutCount} pending sessions from the previous ${programDuration}Days ${programName} program that we can re open :)

Let's talk: https://www.balancenutrition.in/app_link/screen_id=294/call_type=45`;

}else{
   mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.`;

}
if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
        "mentor_assigned",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const OCRMaintanenceClient = async (req, res, next) => {
  const { id, page, limit, search, filter } = req.body;
  try {
    const condition = [
      { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Maintenance",
      },
    ];
    const joins = [
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
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu1`,
        on: "cd.user_id = fu1.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu2`,
        on: "fu1.follow_up_id < fu2.follow_up_id AND fu1.user_id = fu2.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
    ];
    const textTableConditions = [
      {
        field: "table_name",
        operator: "=",
        value: "Dropout Client List",
      },
    ];
    addConditions(condition, filter);
    const { results: users, totalCount } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.app_version",
        "cd.device",
        `COUNT(
  DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 
      FROM product_orders po
      WHERE po.payment_method = 'free'
        AND po.sub_order_id = cd.active_order_id
        AND po.user_id = cd.user_id
        AND po.created_at IS NOT NULL
    )
    THEN cd.user_id
  END
) AS hamper_status`,
      ],
      table: `${tables.userDetails} cd`,
      joins,
      conditions: condition,
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      groupBy: ["cd.user_id"],
      pagination: {
        page,
        limit,
      },
    });
    console.log(users, 605);
    const { results: whatsappText } = await readRecord({
      table: tables.tableText,
      selectFields: ["whatsapp_text"],
      conditions: textTableConditions,
    });
    console.log(whatsappText, 608);
    const { results: counts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: commonSelectFields(),
      conditions: [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "1" },
        {
          field: "cd.sub_user_status",
          operator: "=",
          value: "Maintenance",
        },
      ],
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      countTotal: true,
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No clients found",
        data: [],
        meta_data: [
          counts[0],
          "filter_flags",
          "user_id",
          "whatsapp_text",
          "current_program_validity_used",
          "current_program_expiry_date",
          "suggested_date",
        ],
      });
      return res.status(200).json(apiResponse);
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    console.log(userIds.length, 696);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    let oc_txt=`Hi {{name}},
This is {{mentor_designation}} {{mentor_name}} from Balance Nutrition.

You had done a program with us in the year {{expiry_date}} and your last recorded weight with us was {{last_wmr}}kg.

*Khyati Ma'am* and I were just reviewing your profile, and she wanted to know about your progress.

What’s your current weight now?

Awaiting your revert.`;
let oc_hs_txt=`“{{overall_health_score}}” was your last BN-HEALTH SCORE

Hi {{name}},

As per your last updates, {{client_days_ago}} days ago, your weight was {{last_hs_weight}}kg & your overall B.M.I was {{bmi}}.

*Let's Check Your Current Health Parameters* 

Update a few details & get to know your:
* Ideal Weight
* B.M.I
* Obesity Category
* Overall Health Score

*Let's Set Our Health Goals For 2026 Together!*

Get Report : http://balancenutrition.in/health-score`;
const extractedVariables1 = extractVariables(oc_hs_txt);
const extractedVariables = extractVariables(oc_txt);
    // const extractedVariables = extractVariables(whatsappText[0]?.whatsapp_text);
    const userData = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables],
      groupBy: " GROUP BY cd.user_id",
    });
     const userData1 = await fetchUserDetailsDynamic({
      ids: userIds,
      fields: [...extractedVariables1],
      groupBy: " GROUP BY cd.user_id",
    });
    const finalData = users.map((user, index) => {
      const device = user.device;
      const version = user.app_version;
      const updated = compareVersions(
        device === "android" ? app_versions.android : app_versions.ios,
        version
      );
      // const whatsapp_text = replacePlaceholders(
      //   whatsappText[0]?.whatsapp_text,
      //   userData[index]
      // );
      const whatsapp_text1 = replacePlaceholders(
        oc_hs_txt,
        userData1[index]
      );
      const whatsapp_text = replacePlaceholders(
        oc_txt,
        userData[index]
      );
      const mappedData = mapUserData({
        user: user,
        details: details[index],
        extraMappings: {
          filter_flags: {
            pitched: user.pitched,
            not_pitched: user.not_pitched,
            no_follow_up_72_hours: user.no_follow_up_72_hours,
            lead_cleanse_active: user.lead_cleanse_active,
            not_downloaded: user.not_downloaded,
            not_updated: updated ? "0" : "1",
            com_client: user.mentor_changed,
          },
        },
      });
      if (
        mappedData.user_details.status === "Completed" ||
        mappedData.user_details.status === "Dropout"
      ) {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} Let's connect soon and utilise our wallet money before they expire!!   `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
            mappedData?.suggested_program_details?.suggested_program_id
          } to check the total discount on the 90-day ${
            mappedData?.suggested_program_details?.suggested_program_name
          } program  that I recommended to you :)
  `;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${
            mappedData.user_details.user_name
          }, 

Your BN Wallet just got a makeover with Rs.${
            mappedData.user_details?.wallet -
            mappedData.user_details?.old_wallet
          } re-credited to you. 

Your current wallet balance is Rs.${mappedData.user_details?.wallet} now!

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 to check the total discount on the 60-day Slim Possible program  that I recommended to you :)
  `;
        }
      }

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      if (mappedData?.user_details?.status == "Active") {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id}`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How have you been? I have not heard from you in a while, so I thought of sending you a WhatsApp :)
How is your diet going?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

We have already come halfway, with the right plan, you can achieve all your health goals :)

Check the final discount : Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134`;
        }
      } else {
        if (mappedData?.suggested_program_details?.suggested_program_id) {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the ${mappedData?.suggested_program_details?.suggested_program_name} Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        } else {
          mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

How are you doing & how is the weight?

There is also a flat 55% discount on the Slim Possible Program that I have been recommending you , plus a complimentary 10-day Navratri Diet Session worth Rs. 3999.

Please ping me back to know more & let's reach your goals before 2025 ends :)

What's your current weight? Let's work towards your health goals again! 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
        }
      }
      if (mappedData?.user_details?.status == "Active") {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Just a reminder that the *annual client-exclusive lowest-rate offers are ending tomorrow.* 

Alongwith a flat 60% off, our clients get:
1. BN Diwali guide worth Rs.3999
2. 1-day post-festive detox diet worth Rs.14993.  
3. BN Maintenance plan worth Rs.6999 
4. 7-day Diwali Break & an increase in your validity
5. The Pro version of the guides in-app

I had recommended the  ${
          mappedData?.suggested_program_details?.suggested_program_name ||
          "Slim Possible"
        } Program for our next set of goals. Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          mappedData?.suggested_program_details?.suggested_program_id || 134
        } to check the final price.`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

You have Rs.${mappedData.user_details?.wallet} in your BN Wallet expiring on Saturday.
 
You can use 100% of this amount along with existing pre-Diwali in-app discounts to get your next program at the lowest rates!

What's your current weight? 

Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to book a call with me and know more`;
      }
      const phone =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const psBlock = /^(?:\+)?(91)/.test(phone)
        ? `

P.S. I will be sending you a surprise hamper with our newly launched BN Health Snacks alongwith your program purchase

Check the products here: https://www.balancenutrition.in/shop`
        : "";

      if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final discounted pricing of the *90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you* - Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

We have *Rs.${mappedData.user_details?.wallet}* in your BN Wallet that becomes Rs.0 tonight. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further - https://www.balancenutrition.in/app_link/screen_id=294/call_type=45${psBlock}`;
      }

      const dropoutCount = details[index]?.dropout_count || 0;
      const programDuration =
        details[index]?.current_program_duration || "90-day";
      const programName =
        details[index]?.current_program_name || "Intermittent Fasting Program";

      // 🔹 Get phone & check if user is in India
      const phonein =
        mappedData.user_details?.phone_number?.replace(/\s/g, "") || "";
      const isIndia = /^(?:\+)?91/.test(phonein);

      // 🔹 If dropout_count exists and > 0 → use "Reopen Unused Sessions" message
      if (dropoutCount > 1 && dropoutCount <=8) {
        mappedData.user_details.whatsapp_text = `Hi ${
          mappedData.user_details.user_name
        },

Good news for you! 

Until December 15th, you can re-open your ${dropoutCount} unused sessions from the ${programDuration} Days ${programName} that you had dropped out of.
${
  isIndia
    ? "\n\nYou'll also receive a FREE BN Healthy Snack Hamper to welcome you back!"
    : "\n\nYou'll also receive a FREE 3-Day Gut Reset Detox to welcome you back! "
}

Get in touch with me to know how. :)

P.S. Click here https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 to schedule a call with me & discuss this further. `;
      }
      // 🔹 Else if dropout_count not present → fallback to App Upgrade message
      else  {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},
We've upgraded your BN App & added a Free Diet!

Inside, you'll also find that you have:
1. 1800 Weight Loss Recipes 
2. Wallet Money 
3. Old Program Reports
4. Digitised Restaurant & Alcohol Guides
5. Complimentary BN Snack Hampers

Download the BN App Now!
https://www.balancenutrition.in/download-bn-app
        `;
         mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here :)

I had an important update for you. This is your last chance to get our diet programs at the lowest rates. 
The rates of all our programs are going to increase soon.
What is your weight currently?
        `;
      }
      
       if (dropoutCount > 1 && dropoutCount <= 8) {
  mappedData.user_details.whatsapp_text = whatsapp_text;
} else if (
  whatsapp_text1 &&
  !whatsapp_text1.toLowerCase().includes("null")
) {
  mappedData.user_details.whatsapp_text = whatsapp_text1;
}else{
  mappedData.user_details.whatsapp_text = whatsapp_text;
}
if (dropoutCount > 1 && dropoutCount <= 8) {
 mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.

You also have ${dropoutCount} pending sessions from the previous ${programDuration}Days ${programName} program that we can re open :)

Let's talk: https://www.balancenutrition.in/app_link/screen_id=294/call_type=45`;

}else{
   mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Just wanted to update that you have Rs.${mappedData.user_details?.wallet} in your BN Wallet unused. It will expire soon. 

What's your current weight? Also, do you have the latest BN App? There is a free online fitness challenge on at the moment.`;

}
if (mappedData?.suggested_program_details?.suggested_program_id) {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

 I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of the 90-day ${mappedData?.suggested_program_details?.suggested_program_name} program that I have recommended to you - Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${mappedData?.suggested_program_details?.suggested_program_id || 134} 

Let's connect soon and utilise our wallet money before they expire!!   `;
      } else {
        mappedData.user_details.whatsapp_text = `Hi ${mappedData.user_details.user_name},

Mentor ${mappedData.user_details?.mentor_assigned} here 

I  have an urgent update for you that *Rs.${mappedData.user_details?.wallet}* in your BN Wallet is expiring soon. 

Check the final pricing of one of our favourite and short program, *“Slim Possible”*

Click here to discuss further -  https://www.balancenutrition.in/app_link/screen_id=294/call_type=45 Let's connect soon and utilise our wallet money before it expires!`;
      }
      return mappedData;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Link Data fetched successfully",
      data: finalData,
      meta_data: [
        counts[0],
        "filter_flags",
        "user_id",
        "whatsapp_text",
        "current_program_validity_used",
        "current_program_expiry_date",
        "suggested_date",
        "mentor_assigned",
      ],
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getStackWiseClients = async (req, res, next) => {
  try {
    const { page, limit, search, admin_id, stack = [] } = req.body;

    // Ensure stack is always an array
    const stacks = Array.isArray(stack) ? stack : [stack];

    let allData = [];

    // ✅ Loop through each stack and gather data
    for (const singleStack of stacks) {
      const { data } = await getFormattedUserData({
        search,
        page,
        limit,
        extraConditions: [
          { field: "pm.program_category", operator: "=", value: singleStack },
          { field: "ud.mentor_assigned", operator: "=", value: admin_id },
        ].filter(Boolean),
        extraGroupBy: ["ud.user_id"],
      });

      // Push into main array
      allData.push(...data);
    }

    // ✅ Categorize by user_status
    const activeClients = [];
    const completedClients = [];

    allData.forEach((item) => {
      const status =
        item?.client_details?.client_sub_user_status || item?.user_status || "";

      if (
        status.toLowerCase() === "active" ||
        status.toLowerCase() === "onhold" ||
        status.toLowerCase() === "cleanse active" ||
        status.toLowerCase() === "dormant" ||
        status.toLowerCase() === "freezed" ||
        status.toLowerCase() === "notstarted"
      ) {
        activeClients.push(item);
      } else if (
        status.toLowerCase() === "completed" ||
        status.toLowerCase() === "dropout" ||
        status.toLowerCase() === "fs" ||
        status.toLowerCase() === "maintenance"
      ) {
        completedClients.push(item);
      }
    });

    // ✅ Count summary
    const userStatusCount = {
      Active: activeClients.length,
      Completed: completedClients.length,
      Total: allData.length,
    };

    // ✅ Build combined data
    const combinedData = {
      All: allData,
      Active: activeClients,
      Completed: completedClients,
    };

    // ✅ Create API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `${stacks.join(", ")} Wise Clients fetched successfully`,
      totalCount: allData.length,
      userStatusCount,
      data: combinedData,
      meta_data: [
        "client_id",
        "client_active_order_id",
        "suggested_program_id",
        "suggested_program_session_id",
      ],
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getStackWiseClientsCount = async (req, res, next) => {
  try {
    const { stack, mentor_id } = req.body;

    const query = `SELECT 
    COUNT(
        CASE 
            WHEN ud.mentor_assigned = ${mentor_id} 
                 AND pm.program_category = '${stack}' 
                 AND sop.order_type = 'New' THEN 1 
            ELSE NULL 
        END
    ) AS new_users,
    
    COUNT(
        CASE 
            WHEN ud.mentor_assigned = ${mentor_id} 
                 AND pm.program_category = '${stack}' 
                 AND sop.order_type = 'OCR' THEN 1 
            ELSE NULL 
        END
    ) AS ocr_users,
     COUNT(
        CASE 
            WHEN ud.mentor_assigned = ${mentor_id} 
                 AND pm.program_category = '${stack}' 
                 AND (sop.order_type = 'New' OR sop.order_type = 'OCR') THEN 1
            ELSE NULL 
        END
    ) AS total_users
FROM users_details ud
INNER JOIN sub_orders_programs sop ON sop.sub_order_id = ud.active_order_id
INNER JOIN programs_master pm ON pm.program_id = sop.program_id
INNER JOIN order_details od ON od.order_id = sop.order_id;
`;
    const [result] = await readPool.query(query);
    console.log(result, 637);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Stack wise clients count fetched successfully",
      data: result,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUpcomingBirthdayUsers = async (req, res, next) => {
  try {
    const {
      filter = "",
      birthday_on = "",
      user_type = "active",
      mentor_id,
      search,
      page,
      limit,
    } = req.body;
    const mentorCondition = [];
    const birthdayDays = birthday_on ? Number(birthday_on) : null;
    const birthdayConditions = [];
    if (birthdayDays !== null && !isNaN(birthdayDays)) {
      // exact N days from today
      birthdayConditions.push({
        field: `DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL ${birthdayDays} DAY, '%m-%d')`,
        operator: "",
        value: ``,
        raw: true,
      });
    } else {
      // next 7 days
      birthdayConditions.push({
        field: `(
      (
        DATE_FORMAT(CURDATE(), '%m-%d') <= DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
        AND DATE_FORMAT(cd.birth_date, '%m-%d') BETWEEN 
            DATE_FORMAT(CURDATE(), '%m-%d')
        AND DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
      )
      OR
      (
        DATE_FORMAT(CURDATE(), '%m-%d') > DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
        AND (
                DATE_FORMAT(cd.birth_date, '%m-%d') >= DATE_FORMAT(CURDATE(), '%m-%d')
            OR  DATE_FORMAT(cd.birth_date, '%m-%d') <= DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
        )
      )
    )`,
        operator: "",
        value: "",
        raw: true,
      });
    }

    const userTypeConditions = [];
    switch (user_type) {
      case "active":
        userTypeConditions.push(
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cd.user_type", operator: "=", value: "1" }
        );
        if (mentor_id) {
          mentorCondition.push({
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          });
        }
        break;
      case "completed":
        userTypeConditions.push(
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Completed", "Dropout", "Fs"],
          },
          { field: "cd.user_type", operator: "=", value: "1" }
        );
        if (mentor_id) {
          mentorCondition.push({
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          });
        }
        break;
      case "lead":
        userTypeConditions.push({
          field: "cd.user_type",
          operator: "=",
          value: "0",
        });
        if (mentor_id) {
          mentorCondition.push({
            field: "cd.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          });
        }
        break;
      default:
        userTypeConditions.push(
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "cd.user_type", operator: "=", value: "1" }
        );
        if (mentor_id) {
          mentorCondition.push({
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          });
        }
    }
    const filterConditions = [];
    if (filter == "indian") {
      filterConditions.push({
        orConditions: [
          { field: "cd.country_id", operator: "=", value: 101 },
          { field: "cd.phone_code", operator: "IN", value: ["+91", "91"] },
        ],
      });
    } else if (filter == "nri") {
      filterConditions.push({
        orConditions: [
          { field: "cd.country_id", operator: "!=", value: 101 },
          { field: "cd.phone_code", operator: "NOT IN", value: ["+91", "91"] },
        ],
      });
    }
    console.log(
      userTypeConditions,
      mentorCondition,
      birthdayConditions,
      filterConditions,
      875
    );
    const { results: counts } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT cd.user_id) AS all_users",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d') THEN cd.user_id END) AS `today`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 1 DAY, '%m-%d') THEN cd.user_id END) AS `1_day`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 2 DAY, '%m-%d') THEN cd.user_id END) AS `2_day`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 3 DAY, '%m-%d') THEN cd.user_id END) AS `3_day`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 4 DAY, '%m-%d') THEN cd.user_id END) AS `4_day`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 5 DAY, '%m-%d') THEN cd.user_id END) AS `5_day`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 6 DAY, '%m-%d') THEN cd.user_id END) AS `6_day`",
        "COUNT(CASE WHEN DATE_FORMAT(cd.birth_date, '%m-%d') = DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d') THEN cd.user_id END) AS `7_day`",
      ],
      table: `${tables.userDetails} cd`,
      conditions: [
        ...userTypeConditions,
        ...mentorCondition,
        ...filterConditions,
        {
          field: `(
          (
            DATE_FORMAT(CURDATE(), '%m-%d') <= DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
            AND DATE_FORMAT(cd.birth_date, '%m-%d') BETWEEN 
                DATE_FORMAT(CURDATE(), '%m-%d')
            AND DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
          )
          OR
          (
            DATE_FORMAT(CURDATE(), '%m-%d') > DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
            AND (
                    DATE_FORMAT(cd.birth_date, '%m-%d') >= DATE_FORMAT(CURDATE(), '%m-%d')
                OR  DATE_FORMAT(cd.birth_date, '%m-%d') <= DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
            )
          )
        )`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    const user_types = ["Active", "Completed"];
    const filters = ["indian", "nri"];
    let filterCounts = {
      indian: {
        active: 0,
        completed: 0,
      },
      nri: {
        active: 0,
        completed: 0,
      },
    };
    for (const type of user_types) {
      for (const filterType of filters) {
        const userTypeConditionsTemp = [
          { field: "cd.user_type", operator: "=", value: "1" },
          { field: "cd.user_status", operator: "=", value: type },
        ];
        const filterConditionsTemp = [];
        if (filterType == "indian") {
          filterConditionsTemp.push({
            orConditions: [
              { field: "cd.country_id", operator: "=", value: 101 },
              { field: "cd.phone_code", operator: "IN", value: ["+91", "91"] },
            ],
          });
        } else {
          filterConditionsTemp.push({
            orConditions: [
              { field: "cd.country_id", operator: "!=", value: 101 },
              {
                field: "cd.phone_code",
                operator: "NOT IN",
                value: ["+91", "91"],
              },
            ],
          });
        }
        const { results: counts } = await readRecord({
          selectFields: ["COUNT(DISTINCT cd.user_id) AS all_users"],
          table: `${tables.userDetails} cd`,
          conditions: [
            ...userTypeConditionsTemp,
            ...mentorCondition,
            ...filterConditionsTemp,
            {
              field: `(
          (
            DATE_FORMAT(CURDATE(), '%m-%d') <= DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
            AND DATE_FORMAT(cd.birth_date, '%m-%d') BETWEEN 
                DATE_FORMAT(CURDATE(), '%m-%d')
            AND DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
          )
          OR
          (
            DATE_FORMAT(CURDATE(), '%m-%d') > DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
            AND (
                    DATE_FORMAT(cd.birth_date, '%m-%d') >= DATE_FORMAT(CURDATE(), '%m-%d')
                OR  DATE_FORMAT(cd.birth_date, '%m-%d') <= DATE_FORMAT(CURDATE() + INTERVAL 7 DAY, '%m-%d')
            )
          )
        )`,
              operator: "",
              value: "",
              raw: true,
            },
          ],
        });
        filterCounts[filterType][type.toLowerCase()] = counts[0].all_users;
      }
    }
    console.log(filterCounts, "filter counts");
    if (user_type.toLowerCase() === "active") {
      const { results: users } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id"],
        conditions: [
          ...userTypeConditions,
          ...mentorCondition,
          ...birthdayConditions,
          ...filterConditions,
        ],
      });

      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      if (userIds.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No users found",
          data: [],
          meta_data: [counts[0], filterCounts],
        });
        return res.status(200).json(apiResponse);
      }
      console.log(userIds.length, 696);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          birthday_hamper: true,
        },
        orderBy: orderById,
      });
      const finalData = users.map((user, index) => {
        const mappedData = mapUserData({
          user: user,
          details: details[index],
          addFields: {
            birthday_hamper: true,
          },
        });
        return mappedData;
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Birthday Users fetched successfully",
        data: finalData,
        meta_data: [counts[0], filterCounts],
        totalCount: finalData.length,
      });

      return res.status(200).json(apiResponse);
    } else {
      const { results: data } = await readRecordNewForLead({
        withQueries: [...withMap.get("latest_health")],
        selectFields: [
          ...getCommonSelectFields(),
          "pod.product_name as hamper_product_name",
          "pod.pack_size as hamper_pack_size",
          "pod.status as delivery_status",
          "pod.created_at as hamper_claimed_date",
        ],
        table: `${tables.userDetails} cd`,
        joins: [
          ...getCommonJoins(),
          {
            type: "LEFT",
            table: `${tables.productOrders} pod`,
            on: "cd.user_id = pod.user_id and pod.hamper_type = 'birthday'",
          },
        ],
        conditions: [
          ...userTypeConditions,
          ...mentorCondition,
          ...birthdayConditions,
          ...filterConditions,
        ],
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
        pagination: {
          page,
          limit,
        },
        groupBy: ["cd.user_id"],
      });
      const finalData = data.map((user) => {
        const mappedData = mapLeadDataNew({
          details: user,
          extraMappings: {
            birthday_hamper_details: {
              hamper_product_name: user.hamper_product_name,
              hamper_pack_size: user.hamper_pack_size,
              delivery_status: user.delivery_status,
              hamper_claimed_date: user.hamper_claimed_date,
            },
          },
        });
        return mappedData;
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Birthday Users fetched successfully",
        data: finalData,
        meta_data: [counts[0], filterCounts],
        totalCount: finalData.length,
      });

      return res.status(200).json(apiResponse);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  allClients,
  getStackWiseClients,
  getStackWiseClientsCount,
  allClient,
  allActiveNoAdvancePurchaseClient,
  activeClient,
  cleanseClient,
  dormantClient,
  onholdClient,
  notStartedClient,
  dormantODClient,
  onholdODClient,
  notStartedODClient,
  OCRCompletedClient,
  OCRFClient,
  OCRDropoutClient,
  OCRMaintanenceClient,
  OCRAllClient,
  allActiveClient,
  getUpcomingBirthdayUsers,
};
