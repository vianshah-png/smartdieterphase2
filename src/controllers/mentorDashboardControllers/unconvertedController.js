import { readRecord } from "../../config/query.js";
import { fetchUsersDetailsNew, mapUserData } from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import {
  getFormattedLeadData,
  getFormattedUserData,
} from "../../helper/mentordbHelpers.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getTotalClientsCount = async (req, res, next) => {
  try {
    const { mentor_id, user_type } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(*) as total_unconverted_count"],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: String(user_type) === "OC" ? "Completed" : "Lead",
        },
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        mentor_id
          ? {
              field:
                String(user_type) === "OC"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total fetched Successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOcCountWithoutApp = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(*) as oc_without_app"],
      conditions: [
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "ud.device",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        mentor_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: Number(mentor_id),
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total Oc fetched Successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getOcCountWithApp = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["COUNT(*) as oc_without_app"],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "ud.device",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        mentor_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud. suggested_program_id= sp.suggested_program_id",
        },
      ],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total Oc fetched Successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getPrimeSegmentLeadCounts = async (req, res, next) => {
  try {
    const { mentor_id } = await req.query;
    const selectFields = [
      `COUNT(
        CASE 
            WHEN (
                ud.country_id = 101
                AND (YEAR(NOW()) - YEAR(ud.birth_date)) >= 35
            )
            OR (
                ud.country_id != 101
                AND ud.country_id IS NOT NULL
                AND ud.country_id != 0
            )
            THEN ud.user_id
            ELSE NULL
        END
    ) AS prime_segments_count`,
    ];
    const conditions = [
      mentor_id
        ? {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          }
        : null,
      {
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      },
      {
        orConditions: [
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
    ].filter(Boolean);
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total Prime Segment Leads fetched Successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getHighPotentialsLeadCounts = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;
    const selectFields = [
      `COUNT(
        CASE 
            WHEN ls.source_group IN (3, 5) THEN ud.user_id
            ELSE NULL
        END
    ) AS high_potential_count`,
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "ud.suggested_program_id = sp.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadSource} ls`,
        on: "ls.source_id = ud.current_lead_source",
      },
    ];
    const conditions = [
      {
        orConditions: [
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      mentor_id
        ? {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          }
        : null,

      {
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      },
    ].filter(Boolean);
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      conditions,
      joins,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total High Potentials Leads fetched Successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getConsultationCount = async (req, res, next) => {
  try {
    const { admin_id, user_type } = req.query;

    if (!admin_id && req.headers.source === "mentor_db") {
      return next(new ErrorHandler("ID is required", 400));
    }
    const conditions = [
      {
        orConditions: [
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
    ];
    if (user_type === "OC") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
      if (admin_id) {
        conditions.push({
          field: "ud.mentor_assigned",
          operator: "=",
          value: admin_id,
        });
      }
    }
    if (user_type === "Lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      });
      if (admin_id) {
        conditions.push({
          field: "ud.counsellor_assigned",
          operator: "=",
          value: admin_id,
        });
      }
    }

    if (admin_id) {
      conditions.push({
        field: "sp.suggested_by",
        operator: "=",
        value: admin_id,
      });
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(sp.user_id) AS total_consultation_count",
        ` COUNT(
        CASE 
            WHEN (
                ud.country_id = 101
                AND (YEAR(NOW()) - YEAR(ud.birth_date)) >= 35
            )
            OR (
                ud.country_id != 101
                AND ud.country_id IS NOT NULL
                AND ud.country_id != 0
            )
            THEN ud.user_id
            ELSE NULL
        END
    ) AS prime_segments_count`,
        ` COUNT(
        CASE 
            WHEN ls.source_group IN (3, 5) THEN ud.user_id
            ELSE NULL
        END
    ) AS high_potential_count`,
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "ls.source_id = ud.current_lead_source",
        },
      ],
      conditions: conditions,
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Unconverted Consultation",
      data: results[0],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getStageCount = async (req, res, next) => {
  try {
    const { admin_id, user_type } = req.query;
    if (!admin_id && req.headers.source === "mentor_db") {
      return next(new ErrorHandler("ID is required", 400));
    }

    const conditions = [
      {
        orConditions: [
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
    ];
    if (user_type === "OC") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
      if (admin_id) {
        conditions.push({
          field: "ud.mentor_assigned",
          operator: "=",
          value: admin_id,
        });
      }
    }
    if (user_type === "Lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      });
      if (admin_id) {
        conditions.push({
          field: "ud.counsellor_assigned",
          operator: "=",
          value: admin_id,
        });
      }
    }

    if (admin_id) {
      conditions.push({
        field: "sp.suggested_by",
        operator: "=",
        value: admin_id,
      });
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(CASE WHEN ud.stage IS NOT NULL OR ud.stage <> 0 THEN ud.old_user_id END) AS total_stage_oc",
        `COUNT(
		CASE WHEN ud.stage = 1 THEN ud.user_id END
	) AS first_stage_oc`,
        `COUNT(
		CASE WHEN ud.stage = 2 THEN ud.user_id END
	) AS second_stage_oc`,
        `COUNT(
		CASE WHEN ud.stage = 3 THEN ud.user_id END
	) AS third_stage_oc`,
        `	COUNT(
		CASE WHEN ud.stage = 4 THEN ud.user_id END
	) AS fourth_stage_oc`,
      ],
      conditions: conditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Unconverted Stage",
      data: results[0],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDownGradeCounts = async (req, res, next) => {
  try {
    const { mentor_id, user_type } = req.query;

    // Fetch the sales status logs from the database
    const { results } = await readRecord({
      table: `${tables.leadSaleStatusLog} lssl`,
      selectFields: ["lssl.sales_status_log", "lssl.user_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "lssl.user_id = ud.user_id",
        },
      ],
      conditions: [
        user_type
          ? {
              field: "ud.user_status",
              operator: "=",
              value:
                String(user_type).toLowerCase() === "oc" ? "Completed" : "Lead",
            }
          : null,
        mentor_id
          ? {
              field:
                String(user_type).toLowerCase() === "OC"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : null,
      ].filter(Boolean),
    });

    const downgradeCounts = {
      hot_to_warm: 0,
      hot_to_cold: 0,
      warm_to_cold: 0,
    };
    results.forEach((result) => {
      const salesLog = JSON.parse(result.sales_status_log);
      if (salesLog.length > 1) {
        salesLog.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const secondLast = salesLog[salesLog.length - 2];
        const last = salesLog[salesLog.length - 1];
        if (
          Number(secondLast.sales_status) === 2 &&
          Number(last.sales_status) === 3
        ) {
          downgradeCounts.hot_to_warm++;
        } else if (
          Number(secondLast.sales_status) === 2 &&
          Number(last.sales_status) === 4
        ) {
          downgradeCounts.hot_to_cold++;
        } else if (
          Number(secondLast.sales_status) === 3 &&
          Number(last.sales_status) === 4
        ) {
          downgradeCounts.warm_to_cold++;
        }
      }
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Unconverted Downgrade Counts",
      data: downgradeCounts,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClinicalConditionsCount = async (req, res, next) => {
  try {
    const { admin_id, user_type } = req.query;
    if (!admin_id && req.headers.source === "mentor_db") {
      return next(new ErrorHandler("ID is required", 400));
    }
    const conditions = [
      {
        orConditions: [
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
    ];
    if (user_type === "OC") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
      if (admin_id) {
        conditions.push({
          field: "ud.mentor_assigned",
          operator: "=",
          value: admin_id,
        });
      }
    }
    if (user_type === "Lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      });
      if (admin_id) {
        conditions.push({
          field: "ud.counsellor_assigned",
          operator: "=",
          value: admin_id,
        });
      }
    }

    if (admin_id) {
      conditions.push({
        field: "sp.suggested_by",
        operator: "=",
        value: admin_id,
      });
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"diabetes"') OR JSON_CONTAINS(ud.health_conditions, '"Diabletes"') THEN 1 END) AS diabetes_count`,
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"thyroid"') OR JSON_CONTAINS(ud.health_conditions, '"Thyroid"') THEN 1 END) AS thyroid_count`,
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"pcos"') OR JSON_CONTAINS(ud.health_conditions, '"PCOS"') THEN 1 END) AS pcos_count`,
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"blood_pressure"') OR JSON_CONTAINS(ud.health_conditions, '"BP"') THEN 1 END) AS bp_count`,
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"cholestrol"') OR JSON_CONTAINS(ud.health_conditions, '"Cholestrol"') THEN 1 END) AS cholestrol_count`,
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"pregnancy"') OR JSON_CONTAINS(ud.health_conditions, '"Post pregnancy"') THEN 1 END) AS pregnancy_count`,
        `COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"diabetes"') OR JSON_CONTAINS(ud.health_conditions, '"Diabletes"') THEN 1 END) +
   COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"thyroid"') OR JSON_CONTAINS(ud.health_conditions, '"Thyroid"') THEN 1 END) +
   COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"pcos"') OR JSON_CONTAINS(ud.health_conditions, '"PCOS"') THEN 1 END) +
   COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"blood_pressure"') OR JSON_CONTAINS(ud.health_conditions, '"BP"') THEN 1 END) +
   COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"cholestrol"') OR JSON_CONTAINS(ud.health_conditions, '"Cholestrol"') THEN 1 END) +
   COUNT(CASE WHEN JSON_CONTAINS(ud.health_conditions, '"pregnancy"') OR JSON_CONTAINS(ud.health_conditions, '"Post pregnancy"') THEN 1 END) AS total_count`,
      ],

      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "ls.source_id = ud.current_lead_source",
        },
      ],
      conditions: conditions,
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Unconverted Clinical Count",
      data: results[0],
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getTotalUnconvertedUserData = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id, user_type } = req.body;

    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraConditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: String(user_type) === "OC" ? "Completed" : "Lead",
        },
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        mentor_id
          ? {
              field:
                String(user_type) === "OC"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: mentor_id,
            }
          : null,
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total Unconverted User Data fetched Successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getOcCountWithoutAppUserData = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.body;

    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraConditions: [
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "ud.device",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        mentor_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: Number(mentor_id),
            }
          : null,
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total Unconverted Without App User Data fetched Successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getOcCountWithAppUserData = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.body;
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraConditions: [
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "ud.device",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        mentor_id
          ? {
              field: "ud.mentor_assigned",
              operator: "=",
              value: Number(mentor_id),
            }
          : null,
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total Unconverted With App User Data fetched Successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getPrimeSegmentLeadUserData = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.body;

    const { data, total_page } = await getFormattedLeadData({
      page,
      limit,
      search,
      extraConditions: [
        mentor_id
          ? {
              field: "ud.counsellor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : null,
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        },
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: `(
                ud.country_id = 101
                AND (YEAR(NOW()) - YEAR(ud.birth_date)) >= 35
            )
            OR (
                ud.country_id != 101
                AND ud.country_id IS NOT NULL
                AND ud.country_id != 0
            )`,
          operator: "",
          value: "",
          raw: true,
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Lead Prime Segment User Data User Data fetched Successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getHighPotentialsLeadUserData = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.body;

    const { data, total_page } = await getFormattedLeadData({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadSource} ls1`,
          on: "ls1.source_id = ud.current_lead_source",
        },
      ],
      extraConditions: [
        {
          orConditions: [
            {
              field: "sp.payment_status",
              operator: "=",
              value: 0,
            },
            {
              field: "sp.user_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        mentor_id
          ? {
              field: "ud.counsellor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : null,

        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        },
        {
          field: "ls1.source_group",
          operator: "IN",
          value: [3, 5],
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Lead High Potential User Data User Data fetched Successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getConsultationUserData = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      search,
      mentor_id,
      filter,
      user_type: rawUserType,
    } = req.body;
    const user_type = String(rawUserType).toLowerCase();

    if (!["oc", "lead"].includes(user_type)) {
      return next(new ErrorHandler("Invalid user type", 400));
    }

    const isPrimeSegment = String(filter).toLowerCase() === "prime_segment";
    const conditions = [
      {
        orConditions: [
          { field: "sp.payment_status", operator: "=", value: 0 },
          { field: "sp.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      },
    ];

    if (user_type === "oc" || user_type === "lead") {
      const baseConditions = [
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "oc" ? "Completed" : "Lead",
        },
      ];

      const additionalConditions = isPrimeSegment
        ? {
            field: `(
              ud.country_id = 101
              AND (YEAR(NOW()) - YEAR(ud.birth_date)) >= 35
            )
            OR (
              ud.country_id != 101
              AND ud.country_id IS NOT NULL
              AND ud.country_id != 0
            )`,
            operator: "",
            value: "",
            raw: true,
          }
        : {
            field: "ls.source_group",
            operator: "IN",
            value: [3, 5],
          };

      baseConditions.push(additionalConditions);

      if (mentor_id) {
        const assignmentField =
          user_type === "oc" ? "ud.mentor_assigned" : "ud.counsellor_assigned";
        baseConditions.push({
          field: assignmentField,
          operator: "=",
          value: mentor_id,
        });
      }

      conditions.push(...baseConditions);
    }

    if (mentor_id) {
      conditions.push({
        field: "sp.suggested_by",
        operator: "=",
        value: mentor_id,
      });
    }
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "ls.source_id = ud.current_lead_source",
        },
      ],
      extraConditions: conditions.filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `${
        user_type === "lead" ? "Lead" : "OC"
      } Consultation User Data fetched successfully`,
      data,
      totalCount: total_page,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getStageUserData = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      search,
      mentor_id,
      stage,
      user_type: rawUserType,
    } = req.body;
    const user_type = String(rawUserType).toLowerCase();

    if (!["oc", "lead"].includes(user_type)) {
      return next(new ErrorHandler("Invalid user type", 400));
    }
    const conditions = [
      {
        orConditions: [
          { field: "sp.payment_status", operator: "=", value: 0 },
          { field: "sp.user_id", operator: "IS", value: "NULL", raw: true },
        ],
      },
    ];

    if (user_type === "oc" || user_type === "lead") {
      const baseConditions = [
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "oc" ? "Completed" : "Lead",
        },
        {
          field: "ud.stage",
          operator: "=",
          value: Number(stage),
        },
      ];

      if (mentor_id) {
        const assignmentField =
          user_type === "oc" ? "ud.mentor_assigned" : "ud.counsellor_assigned";
        baseConditions.push({
          field: assignmentField,
          operator: "=",
          value: mentor_id,
        });
      }

      conditions.push(...baseConditions);
    }

    if (mentor_id) {
      conditions.push({
        field: "sp.suggested_by",
        operator: "=",
        value: mentor_id,
      });
    }
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraConditions: conditions.filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `${
        user_type === "lead" ? "Lead" : "OC"
      } Consultation User Data fetched successfully`,
      data,
      totalCount: total_page,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getClinicalConditionsUserData = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id, condition, user_type } = req.body;

    const conditions = [
      {
        orConditions: [
          {
            field: "sp.payment_status",
            operator: "=",
            value: 0,
          },
          {
            field: "sp.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        field: "ud.health_conditions",
        operator: "JSON_CONTAINS",
        value: [`"${condition}"`],
      },
    ];
    if (user_type === "OC") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
    }
    if (user_type === "Lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Lead",
      });
      if (mentor_id) {
        conditions.push({
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        });
      }
    }

    if (mentor_id) {
      conditions.push({
        field: "sp.suggested_by",
        operator: "=",
        value: mentor_id,
      });
    }
    const dataFunction =
      String(user_type) === "oc" ? getFormattedUserData : getFormattedLeadData;
    const { data, total_page } = await dataFunction({
      page,
      limit,
      search,
      extraConditions: conditions.filter(Boolean),
      extraGroupBy: ["ud.user_id"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total Unconverted With App User Data fetched Successfully`,
      data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getDownGradeData = async (req, res, next) => {
  try {
    const { mentor_id, user_type, filter } = req.query;

    if (!filter) {
      return res.status(400).json({
        statusCode: 400,
        message: "Filter is required.",
      });
    }

    // Fetch the sales status logs from the database
    const { results } = await readRecord({
      table: `${tables.leadSaleStatusLog} lssl`,
      selectFields: ["lssl.sales_status_log", "lssl.user_id"],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "lssl.user_id = ud.user_id",
        },
      ],
      conditions: [
        user_type
          ? {
              field: "ud.user_status",
              operator: "=",
              value:
                String(user_type).toLowerCase() === "oc" ? "Completed" : "Lead",
            }
          : null,
        mentor_id
          ? {
              field:
                String(user_type).toLowerCase() === "oc"
                  ? "ud.mentor_assigned"
                  : "ud.counsellor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : null,
      ].filter(Boolean),
    });

    if (!results || results.length === 0) {
      return res.status(200).json({
        statusCode: 200,
        message: "No data found.",
        data: [],
      });
    }

    const filteredUserIds = [];
    results.forEach((result) => {
      let salesLog;
      try {
        salesLog = JSON.parse(result.sales_status_log);
      } catch (err) {
        console.error("Error parsing sales_status_log:", err);
        return;
      }

      if (salesLog.length > 1) {
        salesLog.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const secondLast = salesLog[salesLog.length - 2];
        const last = salesLog[salesLog.length - 1];

        if (
          filter === "hot_to_warm" &&
          Number(secondLast.sales_status) === 2 &&
          Number(last.sales_status) === 3
        ) {
          filteredUserIds.push(result.user_id);
        } else if (
          filter === "hot_to_cold" &&
          Number(secondLast.sales_status) === 2 &&
          Number(last.sales_status) === 4
        ) {
          filteredUserIds.push(result.user_id);
        } else if (
          filter === "warm_to_cold" &&
          Number(secondLast.sales_status) === 3 &&
          Number(last.sales_status) === 4
        ) {
          filteredUserIds.push(result.user_id);
        }
      }
    });

    if (filteredUserIds.length === 0) {
      return res.status(200).json({
        statusCode: 200,
        message: `No users found for the filter ${filter}`,
        data: [],
      });
    }

    let orderById = `FIELD(cd.user_id,${filteredUserIds.join(",")})`;

    const details = await fetchUsersDetailsNew({
      ids: filteredUserIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });

    const finalData = filteredUserIds.map((userId, index) => {
      const mappedData = mapUserData({
        user: { user_id: userId },
        details: details[index],
      });
      return mappedData;
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Filtered User IDs for ${filter}`,
      data: finalData,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getClinicalConditionsCount,
  getClinicalConditionsUserData,
  getConsultationCount,
  getConsultationUserData,
  getDownGradeCounts,
  getDownGradeData,
  getHighPotentialsLeadCounts,
  getHighPotentialsLeadUserData,
  getOcCountWithApp,
  getOcCountWithAppUserData,
  getOcCountWithoutApp,
  getOcCountWithoutAppUserData,
  getPrimeSegmentLeadCounts,
  getPrimeSegmentLeadUserData,
  getStageCount,
  getStageUserData,
  getTotalClientsCount,
  getTotalUnconvertedUserData,
};
