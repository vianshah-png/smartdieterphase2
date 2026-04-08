import moment from "moment";
import {
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { leadSourceGroups, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { readRecordNewForLead } from "../../helper/common.js";

const leadManagement = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().format("YYYY-MM-DD"),
    } = req.body;
    if (!start_date || !end_date) {
      return next(
        new ErrorHandler("start_date and end_date are required", 400),
      );
    }
    const totalLeadsSelectFields = [
      "COUNT(DISTINCT cd.user_id) AS total_leads",
    ];
    const totalLeadsConditions = [
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        orConditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [0, 10, 196],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (end_date == moment().format("YYYY-MM-DD")) {
      totalLeadsSelectFields.push(
        "COUNT(DISTINCT CASE WHEN DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_leads",
      );
    }
    const { results: totalLeadCounts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: totalLeadsSelectFields,
      conditions: totalLeadsConditions,
    });

    const unAssignedLeadsSelectFields = [
      `COUNT(DISTINCT CASE 
    WHEN 
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) >= 35
      OR (cd.country_id != 101 AND cd.country_id IS NOT NULL AND cd.country_id != 0)
      OR ls.source_group IN (3, 5)
    THEN cd.user_id 
  END) AS total_target_market_unassigned_leads`,
      `COUNT(DISTINCT CASE 
    WHEN 
      (TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) < 35 OR cd.birth_date IS NULL)
      AND (cd.country_id = 101 OR cd.country_id IS NULL)
      AND cd.country_id != 0
      AND ls.source_group NOT IN (3, 5)
    THEN cd.user_id 
  END) AS total_non_target_market_unassigned_leads`,
      "COUNT(DISTINCT cd.user_id) AS total_unassigned_leads",
    ];
    const unAssignedLeadsConditions = [
      { field: "cd.phone_code", operator: "!=", value: "" },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.counsellor_assigned",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (end_date == moment().format("YYYY-MM-DD")) {
      unAssignedLeadsSelectFields.push(
        `COUNT(DISTINCT CASE 
    WHEN (
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) >= 35
      OR (cd.country_id != 101 AND cd.country_id IS NOT NULL AND cd.country_id != 0)
      OR (ls.source_group IN (3, 5))
    )
    AND DATE(cd.added_date) = CURDATE()
    THEN cd.user_id 
  END) AS todays_target_market_unassigned_leads`,

        `COUNT(DISTINCT CASE 
    WHEN (
      (TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) < 35 OR cd.birth_date IS NULL)
      AND (cd.country_id = 101 OR cd.country_id IS NULL)
      AND cd.country_id != 0
      AND ls.source_group NOT IN (3, 5)
    )
    AND DATE(cd.added_date) = CURDATE()
    THEN cd.user_id 
  END) AS todays_non_target_market_unassigned_leads`,

        `COUNT(DISTINCT CASE 
        WHEN DATE(cd.added_date) = CURDATE() 
        THEN cd.user_id 
    END) AS todays_unassigned_leads`,
      );
    }

    const { results: unAssignedLeadCounts } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: unAssignedLeadsSelectFields,
      conditions: unAssignedLeadsConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
    });

    const assignedLeadsSelectFields = [
      "COUNT(DISTINCT cd.user_id) AS total_assigned_leads",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_mentors",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_counsellors",
    ];

    if (end_date == moment().format("YYYY-MM-DD")) {
      assignedLeadsSelectFields.push(
        `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_leads`,
        `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_to_mentors`,
        `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_to_counsellors`,
      );
    }

    const assignedLeadsConditions = [
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: assignedLeadCounts } = await readRecord({
      selectFields: assignedLeadsSelectFields,
      table: `${tables.userDetails} cd`,
      conditions: assignedLeadsConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id and DATE(lal.assign_date) BETWEEN '${start_date}' AND '${end_date}'`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });

    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.is_currently_working", operator: "=", value: 1 },
      ],
    });

    const counsellorIds = counsellors.map((c) => c.admin_user_id);
    const consultationLeadsSelectFields = [
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 THEN csl.user_id END) AS total_mentor_consultations",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 THEN csl.user_id END) AS total_counsellor_consultations",
      "COUNT(DISTINCT csl.user_id) AS total_consultations",
    ];

    const consultationLeadsConditions = [
      {
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (end_date == moment().format("YYYY-MM-DD")) {
      consultationLeadsSelectFields.push(
        `COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_consultations`,
        `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_mentor_consultations`,
        `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_counsellor_consultations`,
      );
    }

    const { results: consultationLeadCounts } = await readRecord({
      selectFields: consultationLeadsSelectFields,
      table: `${tables.consultationLogs} csl`,
      conditions: consultationLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    console.log(consultationLeadCounts, 326);

    const salesLeadsSelectFields = [
      "SUM(od.order_paid_amount + od.order_balance_amount) AS total_sales",
    ];

    if (end_date == moment().format("YYYY-MM-DD")) {
      salesLeadsSelectFields.push(
        `SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN od.order_paid_amount + od.order_balance_amount END) AS todays_sales`,
      );
    }

    const salesLeadsConditions = [
      { field: "od.sale_by", operator: "NOT IN", value: [0, 10, 196] },
      { field: "od.order_type", operator: "=", value: "New" },
      {
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: salesLeadCounts } = await readRecord({
      selectFields: salesLeadsSelectFields,
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
      ],
      conditions: salesLeadsConditions,
    });

    const data = {
      total_leads: "",
      unassigned: {
        total_unassigned_leads: "",
        total_target_market_unassigned_leads: "",
        total_non_target_market_unassigned_leads: "",
      },
      assigned: {
        total_assigned_leads: "",
        total_assigned_to_mentors: "",
        total_assigned_to_counsellors: "",
      },
      consultation_done: {
        mentor_consultations: "",
        counsellor_consultations: "",
        total_consultations: "",
      },
      sales: "",
    };
    if (end_date == moment().format("YYYY-MM-DD")) {
      data.total_leads = `${totalLeadCounts[0]?.todays_leads ?? 0} | ${
        totalLeadCounts[0]?.total_leads ?? 0
      }`;
      data.unassigned.total_unassigned_leads = `${
        unAssignedLeadCounts[0]?.todays_unassigned_leads ?? 0
      } | ${unAssignedLeadCounts[0]?.total_unassigned_leads ?? 0}`;
      data.unassigned.total_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.todays_target_market_unassigned_leads ?? 0
      } | ${
        unAssignedLeadCounts[0]?.total_target_market_unassigned_leads ?? 0
      }`;
      data.unassigned.total_non_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.todays_non_target_market_unassigned_leads ?? 0
      } | ${
        unAssignedLeadCounts[0]?.total_non_target_market_unassigned_leads ?? 0
      }`;

      data.assigned.total_assigned_leads = `${
        assignedLeadCounts[0]?.todays_assigned_leads ?? 0
      } | ${assignedLeadCounts[0]?.total_assigned_leads ?? 0}`;
      data.assigned.total_assigned_to_mentors = `${
        assignedLeadCounts[0]?.todays_assigned_to_mentors ?? 0
      } | ${assignedLeadCounts[0]?.total_assigned_to_mentors ?? 0}`;
      data.assigned.total_assigned_to_counsellors = `${
        assignedLeadCounts[0]?.todays_assigned_to_counsellors ?? 0
      } | ${assignedLeadCounts[0]?.total_assigned_to_counsellors ?? 0}`;

      data.consultation_done.mentor_consultations = `${
        consultationLeadCounts[0]?.todays_mentor_consultations ?? 0
      } | ${consultationLeadCounts[0]?.total_mentor_consultations ?? 0}`;
      data.consultation_done.counsellor_consultations = `${
        consultationLeadCounts[0]?.todays_counsellor_consultations ?? 0
      } | ${consultationLeadCounts[0]?.total_counsellor_consultations ?? 0}`;
      data.consultation_done.total_consultations = `${
        consultationLeadCounts[0]?.todays_consultations ?? 0
      } | ${consultationLeadCounts[0]?.total_consultations ?? 0}`;

      data.sales = `₹${salesLeadCounts[0]?.todays_sales ?? 0} | ₹${
        salesLeadCounts[0]?.total_sales ?? 0
      }`;
    } else {
      data.total_leads = `${totalLeadCounts[0]?.total_leads ?? 0}`;
      data.unassigned.total_unassigned_leads = `${
        unAssignedLeadCounts[0]?.total_unassigned_leads ?? 0
      }`;
      data.unassigned.total_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.total_target_market_unassigned_leads ?? 0
      }`;
      data.unassigned.total_non_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.total_non_target_market_unassigned_leads ?? 0
      }`;

      data.assigned.total_assigned_leads = `${
        assignedLeadCounts[0]?.total_assigned_leads ?? 0
      }`;
      data.assigned.total_assigned_to_mentors = `${
        assignedLeadCounts[0]?.total_assigned_to_mentors ?? 0
      }`;
      data.assigned.total_assigned_to_counsellors = `${
        assignedLeadCounts[0]?.total_assigned_to_counsellors ?? 0
      }`;

      data.consultation_done.mentor_consultations = `${
        consultationLeadCounts[0]?.total_mentor_consultations ?? 0
      }`;
      data.consultation_done.counsellor_consultations = `${
        consultationLeadCounts[0]?.total_counsellor_consultations ?? 0
      }`;
      data.consultation_done.total_consultations = `${
        consultationLeadCounts[0]?.total_consultations ?? 0
      }`;

      data.sales = `₹${salesLeadCounts[0]?.total_sales ?? 0}`;
    }

    const apiResponse = new ApiResponse({
      status: "success",
      message: "Sales dashboard data retrieved successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadManagement:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const oldLeadManagement = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().format("YYYY-MM-DD"),
    } = req.body;
    if (!start_date || !end_date) {
      return next(
        new ErrorHandler("start_date and end_date are required", 400),
      );
    }
    const totalLeadsSelectFields = [
      "COUNT(DISTINCT cd.user_id) AS total_leads",
    ];
    const totalLeadsConditions = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      { field: "cd.phone_code", operator: "!=", value: "" },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        orConditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [0, 10, 196],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (end_date == moment().format("YYYY-MM-DD")) {
      totalLeadsSelectFields.push(
        "COUNT(DISTINCT CASE WHEN DATE(lsl.updated_at) = CURDATE() THEN cd.user_id END) AS todays_leads",
      );
    }
    const { results: totalLeadCounts } = await readRecord({
      table: `${tables.leadSourceLog} lsl`,
      selectFields: totalLeadsSelectFields,
      conditions: totalLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lsl.user_id",
        },
      ],
    });
    const unAssignedLeadsSelectFields = [
      `COUNT(DISTINCT CASE 
    WHEN 
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) >= 35
      OR (cd.country_id != 101 AND cd.country_id IS NOT NULL AND cd.country_id != 0)
      OR ls.source_group IN (3, 5)
    THEN cd.user_id 
  END) AS total_target_market_unassigned_leads`,
      `COUNT(DISTINCT CASE 
    WHEN 
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) < 35
      AND (cd.country_id = 101 OR cd.country_id IS NULL)
      AND cd.country_id != 0
      AND ls.source_group NOT IN (3, 5)
    THEN cd.user_id 
  END) AS total_non_target_market_unassigned_leads`,
      "COUNT(DISTINCT cd.user_id) AS total_unassigned_leads",
    ];
    const unAssignedLeadsConditions = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      { field: "cd.phone_code", operator: "!=", value: "" },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.counsellor_assigned",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (end_date == moment().format("YYYY-MM-DD")) {
      unAssignedLeadsSelectFields.push(
        `COUNT(DISTINCT CASE 
    WHEN (
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) >= 35
      OR (cd.country_id != 101 AND cd.country_id IS NOT NULL AND cd.country_id != 0)
      OR (ls.source_group IN (3, 5))
    )
    AND DATE(cd.added_date) = CURDATE()
    THEN cd.user_id 
  END) AS todays_target_market_unassigned_leads`,

        `COUNT(DISTINCT CASE 
    WHEN (
      TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE()) < 35
      AND (cd.country_id = 101 OR cd.country_id IS NULL)
      AND cd.country_id != 0
      AND ls.source_group NOT IN (3, 5)
    )
    AND DATE(cd.added_date) = CURDATE()
    THEN cd.user_id 
  END) AS todays_non_target_market_unassigned_leads`,

        `COUNT(DISTINCT CASE 
        WHEN DATE(cd.added_date) = CURDATE() 
        THEN cd.user_id 
    END) AS todays_unassigned_leads`,
      );
    }

    const { results: unAssignedLeadCounts } = await readRecord({
      table: `${tables.leadSourceLog} lsl`,
      selectFields: unAssignedLeadsSelectFields,
      conditions: unAssignedLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = lsl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
    });

    const assignedLeadsSelectFields = [
      "COUNT(DISTINCT cd.user_id) AS total_assigned_leads",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_mentors",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_counsellors",
    ];

    if (end_date == moment().format("YYYY-MM-DD")) {
      assignedLeadsSelectFields.push(
        `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_leads`,
        `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_to_mentors`,
        `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_to_counsellors`,
      );
    }

    const assignedLeadsConditions = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      { field: "cd.phone_code", operator: "!=", value: "" },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: assignedLeadCounts } = await readRecord({
      selectFields: assignedLeadsSelectFields,
      table: `${tables.leadSourceLog} lsl`,
      conditions: assignedLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `lsl.user_id = cd.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id and DATE(lal.assign_date) BETWEEN '${start_date}' AND '${end_date}'`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });

    const consultationLeadsSelectFields = [
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 THEN csl.user_id END) AS total_mentor_consultations",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 THEN csl.user_id END) AS total_counsellor_consultations",
      "COUNT(DISTINCT csl.user_id) AS total_consultations",
    ];

    const consultationLeadsConditions = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];
    if (end_date == moment().format("YYYY-MM-DD")) {
      consultationLeadsSelectFields.push(
        `COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_consultations`,
        `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_mentor_consultations`,
        `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_counsellor_consultations`,
      );
    }

    const { results: consultationLeadCounts } = await readRecord({
      selectFields: consultationLeadsSelectFields,
      table: `${tables.leadSourceLog} lsl`,
      conditions: consultationLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.consultationLogs} csl`,
          on: `csl.user_id = lsl.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    const salesLeadsSelectFields = [
      "SUM(od.order_paid_amount + od.order_balance_amount) AS total_sales",
    ];

    if (end_date == moment().format("YYYY-MM-DD")) {
      salesLeadsSelectFields.push(
        `COALESCE(SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN od.order_paid_amount + od.order_balance_amount END), 0) AS todays_sales`,
      );
    }

    const salesLeadsConditions = [
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${start_date}`,
      },
      { field: "od.sale_by", operator: "NOT IN", value: [0, 10, 196] },
      { field: "od.order_type", operator: "=", value: "New" },
      {
        field: "DATE(od.order_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: salesLeadCounts } = await readRecord({
      selectFields: salesLeadsSelectFields,
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
      ],
      conditions: salesLeadsConditions,
    });

    const data = {
      total_leads: "",
      unassigned: {
        total_unassigned_leads: "",
        total_target_market_unassigned_leads: "",
        total_non_target_market_unassigned_leads: "",
      },
      assigned: {
        total_assigned_leads: "",
        total_assigned_to_mentors: "",
        total_assigned_to_counsellors: "",
      },
      consultation_done: {
        mentor_consultations: "",
        counsellor_consultations: "",
        total_consultations: "",
      },
      sales: "",
    };
    if (end_date == moment().format("YYYY-MM-DD")) {
      data.total_leads = `${totalLeadCounts[0]?.todays_leads ?? 0} | ${
        totalLeadCounts[0]?.total_leads ?? 0
      }`;
      data.unassigned.total_unassigned_leads = `${
        unAssignedLeadCounts[0]?.todays_unassigned_leads ?? 0
      } | ${unAssignedLeadCounts[0]?.total_unassigned_leads ?? 0}`;
      data.unassigned.total_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.todays_target_market_unassigned_leads ?? 0
      } | ${
        unAssignedLeadCounts[0]?.total_target_market_unassigned_leads ?? 0
      }`;
      data.unassigned.total_non_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.todays_non_target_market_unassigned_leads ?? 0
      } | ${
        unAssignedLeadCounts[0]?.total_non_target_market_unassigned_leads ?? 0
      }`;

      data.assigned.total_assigned_leads = `${
        assignedLeadCounts[0]?.todays_assigned_leads ?? 0
      } | ${assignedLeadCounts[0]?.total_assigned_leads ?? 0}`;
      data.assigned.total_assigned_to_mentors = `${
        assignedLeadCounts[0]?.todays_assigned_to_mentors ?? 0
      } | ${assignedLeadCounts[0]?.total_assigned_to_mentors ?? 0}`;
      data.assigned.total_assigned_to_counsellors = `${
        assignedLeadCounts[0]?.todays_assigned_to_counsellors ?? 0
      } | ${assignedLeadCounts[0]?.total_assigned_to_counsellors ?? 0}`;

      data.consultation_done.mentor_consultations = `${
        consultationLeadCounts[0]?.todays_mentor_consultations ?? 0
      } | ${consultationLeadCounts[0]?.total_mentor_consultations ?? 0}`;
      data.consultation_done.counsellor_consultations = `${
        consultationLeadCounts[0]?.todays_counsellor_consultations ?? 0
      } | ${consultationLeadCounts[0]?.total_counsellor_consultations ?? 0}`;
      data.consultation_done.total_consultations = `${
        consultationLeadCounts[0]?.todays_consultations ?? 0
      } | ${consultationLeadCounts[0]?.total_consultations ?? 0}`;

      data.sales = `₹${salesLeadCounts[0]?.todays_sales ?? 0} | ₹${
        salesLeadCounts[0]?.total_sales ?? 0
      }`;
    } else {
      data.total_leads = `${totalLeadCounts[0]?.total_leads ?? 0}`;
      data.unassigned.total_unassigned_leads = `${
        unAssignedLeadCounts[0]?.total_unassigned_leads ?? 0
      }`;
      data.unassigned.total_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.total_target_market_unassigned_leads ?? 0
      }`;
      data.unassigned.total_non_target_market_unassigned_leads = `${
        unAssignedLeadCounts[0]?.total_non_target_market_unassigned_leads ?? 0
      }`;

      data.assigned.total_assigned_leads = `${
        assignedLeadCounts[0]?.total_assigned_leads ?? 0
      }`;
      data.assigned.total_assigned_to_mentors = `${
        assignedLeadCounts[0]?.total_assigned_to_mentors ?? 0
      }`;
      data.assigned.total_assigned_to_counsellors = `${
        assignedLeadCounts[0]?.total_assigned_to_counsellors ?? 0
      }`;

      data.consultation_done.mentor_consultations = `${
        consultationLeadCounts[0]?.total_mentor_consultations ?? 0
      }`;
      data.consultation_done.counsellor_consultations = `${
        consultationLeadCounts[0]?.total_counsellor_consultations ?? 0
      }`;
      data.consultation_done.total_consultations = `${
        consultationLeadCounts[0]?.total_consultations ?? 0
      }`;

      data.sales = `₹${salesLeadCounts[0]?.total_sales ?? 0}`;
    }

    const apiResponse = new ApiResponse({
      status: "success",
      message: "Sales dashboard data retrieved successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadManagement:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const ocManagement = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.body;
    const { results: pageVisitedUsers } = await readRecord({
      selectFields: [
        "CONCAT('[', GROUP_CONCAT(DISTINCT cd.user_id), ']') AS monthly_oc_visits",
        "CONCAT('[', GROUP_CONCAT(DISTINCT CASE WHEN DATE(iapv.visit_date) = CURDATE() THEN cd.user_id END), ']') AS todays_oc_visits",
      ],
      table: `${tables.inAppPageVisitLog} iapv`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "iapv.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "iapv.visit_date",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "cd.phone_code",
          operator: "!=",
          value: "",
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "1",
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
      ],
    });
    console.log(pageVisitedUsers, 221);
    const { results: appDownloadedUsers } = await readRecord({
      selectFields: [
        `CONCAT('[', GROUP_CONCAT(DISTINCT cd.user_id), ']') AS monthly_active_oc_leads`,
        `IFNULL(CONCAT('[', GROUP_CONCAT(DISTINCT CASE WHEN DATE(fcm.added_date) = CURDATE() THEN cd.user_id END), ']'), '[]') AS todays_active_oc_leads`,
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `(SELECT * FROM ${tables.fcm_registry} f1 WHERE f1.id = (
                SELECT MIN(f2.id) 
                FROM ${tables.fcm_registry} f2 
                WHERE f2.user_id = f1.user_id
              )) fcm`,
          on: "cd.user_id = fcm.user_id",
        },
      ],
      conditions: [
        {
          field: "cd.phone_code",
          operator: "!=",
          value: "",
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "1",
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "DATE(fcm.added_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
      ],
    });

    console.log(appDownloadedUsers, 250);

    const { results: consultationBookedUsers } = await readRecord({
      selectFields: [
        `CONCAT('[', GROUP_CONCAT(DISTINCT cu.user_id), ']') AS monthly_call_updates`,
        `CASE WHEN DATE(cu.schedule_date) = CURDATE() THEN CONCAT('[', GROUP_CONCAT(DISTINCT cu.user_id), ']') END AS todays_call_updates`,
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cu.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "cu.user_id",
          operator: "IS NOT NULL",
          value: "",
          raw: true,
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "1",
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "cu.call_type",
          operator: "=",
          value: "30",
        },
        {
          field: "cu.source",
          operator: "=",
          value: "Web",
        },
      ],
    });
    console.log(consultationBookedUsers, 269);
    const ocThisMonth = new Set();
    const ocToday = new Set();
    if (pageVisitedUsers[0]?.monthly_oc_visits) {
      const monthlyVisits = safeJSONParse(
        pageVisitedUsers[0]?.monthly_oc_visits,
        [],
      );
      monthlyVisits.forEach((userId) => ocThisMonth.add(userId));
      const todaysVisits = safeJSONParse(
        pageVisitedUsers[0]?.todays_oc_visits,
        [],
      );
      todaysVisits.forEach((userId) => ocToday.add(userId));
    }
    if (appDownloadedUsers[0]?.monthly_active_oc_leads) {
      const monthlyAppDownloads = safeJSONParse(
        appDownloadedUsers[0]?.monthly_active_oc_leads,
        [],
      );
      monthlyAppDownloads.forEach((userId) => ocThisMonth.add(userId));
      const todaysAppDownloads = safeJSONParse(
        appDownloadedUsers[0]?.todays_active_oc_leads,
        [],
      );
      todaysAppDownloads.forEach((userId) => ocToday.add(userId));
    }
    if (consultationBookedUsers[0]?.monthly_call_updates) {
      const monthlyConsultations = safeJSONParse(
        consultationBookedUsers[0]?.monthly_call_updates,
        [],
      );
      monthlyConsultations.forEach((userId) => ocThisMonth.add(userId));
      const todaysConsultations = safeJSONParse(
        consultationBookedUsers[0]?.todays_call_updates,
        [],
      );
      todaysConsultations.forEach((userId) => ocToday.add(userId));
    }
    const { results: suggestedPrograms } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT sp.user_id) AS monthly_oc_suggested_programs",
        "COUNT(DISTINCT CASE WHEN DATE(sp.added_date) = CURDATE() THEN sp.user_id END) AS todays_oc_suggested_programs",
      ],
      table: `${tables.suggestedProgram} sp`,
      conditions: [
        {
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "sp.user_id",
          operator: "IN",
          value: [...ocThisMonth],
        },
      ],
    });

    const { results: callUpdates } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT cu.user_id) AS monthly_oc_call_updates",
        "COUNT(DISTINCT CASE WHEN DATE(cu.schedule_date) = CURDATE() THEN cu.user_id END) AS todays_oc_call_updates",
      ],
      table: `${tables.callUpdates} cu`,
      conditions: [
        {
          field: "DATE(cu.schedule_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "cu.user_id",
          operator: "IN",
          value: [...ocThisMonth],
        },
      ],
    });

    const { results: orderDetails } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) AS monthly_oc_orders",
        "SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN od.order_paid_amount + od.order_balance_amount ELSE 0 END) AS todays_oc_orders",
      ],
      table: `${tables.orderDetails} od`,
      conditions: [
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "od.order_type",
          operator: "=",
          value: "OCR",
        },
        {
          field: "od.sale_by",
          operator: "!=",
          value: 196,
        },
      ],
    });

    const data = {
      oc: `${ocToday.size} | ${ocThisMonth.size}`,
      suggested_programs: `${
        suggestedPrograms[0]?.todays_oc_suggested_programs ?? 0
      } | ${suggestedPrograms[0]?.monthly_oc_suggested_programs ?? 0}`,
      calls: `${callUpdates[0]?.todays_oc_call_updates ?? 0} | ${
        callUpdates[0]?.monthly_oc_call_updates ?? 0
      }`,
      orders: `${orderDetails[0]?.todays_oc_orders ?? 0} | ${
        orderDetails[0]?.monthly_oc_orders ?? 0
      }`,
    };
    const apiResponse = new ApiResponse({
      status: "success",
      message: "OC Management data retrieved successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in ocManagement:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesPerformance = async (req, res, next) => {
  try {
    const start_date = moment().startOf("month").format("YYYY-MM-DD");
    const end_date = moment().endOf("day").format("YYYY-MM-DD");
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT sop.sub_order_id) as count",
          "'sales_closed' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "!=", value: 196 },
          { field: "od.order_type", operator: "=", value: "New" },
          // {
          //   orConditions: [
          //     { field: "od.order_type", operator: "=", value: "New" },
          //     { field: "od.order_type", operator: "=", value: "OCR" },
          //   ],
          // },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "!=", value: 196 },
          { field: "od.order_type", operator: "=", value: "New" },
          // {
          //   orConditions: [
          //     { field: "od.order_type", operator: "=", value: "New" },
          //     { field: "od.order_type", operator: "=", value: "OCR" },
          //   ],
          // },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    const dataBifurcation = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT sop.sub_order_id) as count",
          "'sales_closed_by_counsellor' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
          {
            type: "INNER",
            table: `${tables.adminUsers} ad`,
            on: "od.sale_by = ad.admin_user_id",
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "ad.role_id", operator: "!=", value: 1 },
          { field: "od.sale_by", operator: "!=", value: 196 },
          { field: "ad.is_active", operator: "=", value: 1 },
          { field: "od.order_type", operator: "=", value: "New" },
          // {
          //   orConditions: [
          //     { field: "od.order_type", operator: "=", value: "New" },
          //     { field: "od.order_type", operator: "=", value: "OCR" },
          //   ],
          // },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT sop.sub_order_id) as count",
          "'sales_closed_by_mentor' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
          {
            type: "INNER",
            table: `${tables.adminUsers} ad`,
            on: "od.sale_by = ad.admin_user_id",
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "!=", value: 196 },
          { field: "ad.role_id", operator: "=", value: 1 },
          { field: "ad.is_active", operator: "=", value: 1 },
          { field: "od.order_type", operator: "=", value: "New" },
          // {
          //   orConditions: [
          //     { field: "od.order_type", operator: "=", value: "New" },
          //     { field: "od.order_type", operator: "=", value: "OCR" },
          //   ],
          // },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_by_counsellor' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
          {
            type: "INNER",
            table: `${tables.adminUsers} ad`,
            on: "od.sale_by = ad.admin_user_id",
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "!=", value: 196 },
          { field: "ad.role_id", operator: "!=", value: 1 },
          { field: "ad.is_active", operator: "=", value: 1 },
          { field: "od.order_type", operator: "=", value: "New" },
          // {
          //   orConditions: [
          //     { field: "od.order_type", operator: "=", value: "New" },
          //     { field: "od.order_type", operator: "=", value: "OCR" },
          //   ],
          // },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "SUM(od.order_paid_amount + od.order_balance_amount) as count",
          "'revenue_by_mentor' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "od.order_id = sop.order_id",
          },
          {
            type: "INNER",
            table: `${tables.adminUsers} ad`,
            on: "od.sale_by = ad.admin_user_id",
          },
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `od.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "od.sale_by", operator: "!=", value: 196 },
          { field: "ad.role_id", operator: "=", value: 1 },
          { field: "ad.is_active", operator: "=", value: 1 },
          { field: "od.order_type", operator: "=", value: "New" },
          // {
          //   orConditions: [
          //     { field: "od.order_type", operator: "=", value: "New" },
          //     { field: "od.order_type", operator: "=", value: "OCR" },
          //   ],
          // },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`${start_date}`, `${end_date}`],
          },
          {
            field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${start_date}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);
    console.log(data, 176);
    const totalTarget = await readRecordUnion([
      {
        selectField: [
          "SUM(ad.lead_target) as count",
          "'counsellor_lead_target' as type",
        ],
        table: `${tables.adminUsers} ad`,
        condition: [
          { field: "ad.role_id", operator: "=", value: 2 },
          { field: "ad.is_active", operator: "=", value: 1 },
          { field: "ad.is_currently_working", operator: "=", value: 1 },
        ],
      },
      {
        selectField: [
          "SUM(ad.lead_target) as count",
          "'mentor_lead_target' as type",
        ],
        table: `${tables.adminUsers} ad`,
        condition: [
          { field: "ad.role_id", operator: "=", value: 1 },
          { field: "ad.is_active", operator: "=", value: 1 },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'leads_assigned_this_month' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "cd.counsellor_assigned = ad.admin_user_id",
          },
          {
            type: "INNER",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id and cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${moment()
              .startOf("month")
              .format("YYYY-MM-DD")}' AND '${moment()
              .endOf("day")
              .format("YYYY-MM-DD")}'`,
          },
        ],
        condition: [
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'converted_lead' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id and cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${moment()
              .startOf("month")
              .format("YYYY-MM-DD")}' AND '${moment()
              .endOf("day")
              .format("YYYY-MM-DD")}'`,
          },
        ],
        condition: [
          // {
          //   field: "(od.order_type = 'New' OR od.order_type = 'OCR')",
          //   operator: "",
          //   value: "",
          //   raw: true,
          // },
          {
            field: "od.order_type",
            operator: "=",
            value: "New",
          },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
        ],
      },
    ]);
    console.log(totalTarget, 276);
    const finalData = {};
    data.forEach((item) => {
      finalData[item.type] = item.count ?? 0;
    });
    finalData.sales_closed = {
      total: finalData.sales_closed ?? 0,
      by_counsellor:
        dataBifurcation.find((d) => d.type === "sales_closed_by_counsellor")
          ?.count ?? 0,
      by_mentor:
        dataBifurcation.find((d) => d.type === "sales_closed_by_mentor")
          ?.count ?? 0,
    };
    finalData.revenue = {
      total: finalData.revenue ?? 0,
      by_counsellor:
        dataBifurcation.find((d) => d.type === "revenue_by_counsellor")
          ?.count ?? 0,
      by_mentor:
        dataBifurcation.find((d) => d.type === "revenue_by_mentor")?.count ?? 0,
    };
    finalData.target =
      (totalTarget[0]?.count ?? 0) + (totalTarget[1]?.count ?? 0);
    finalData.conversion_rate = (
      (totalTarget[3]?.count / totalTarget[2]?.count) * 100 ?? 0
    ).toFixed(2);
    finalData.revenue_target_progress = (
      (finalData.revenue.total / finalData.target) * 100 ?? 0
    ).toFixed(2);
    finalData.pending_target = finalData.target - finalData.revenue.total ?? 0;
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Performance Data Fetched Successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in salesPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const counsellorPerformance = async (req, res, next) => {
  try {
    const { sort_by = "conversion_rate", order = "desc" } = req.body;

    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.is_currently_working", operator: "=", value: 1 },
      ],
    });

    const counsellorIds = counsellors.map((c) => c.admin_user_id);

    // ---- Sales Data ----
    const { results: salesData } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as sales",
        "ad.crm_user",
        "ad.admin_user_id",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "IN", value: counsellorIds },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
      ],
      groupBy: ["od.sale_by", "ad.crm_user"],
    });

    // ---- Assigned Data ----
    const assignedData = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'leads_assigned_this_month' as type",
          "ad.crm_user",
          "ad.admin_user_id",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "cd.counsellor_assigned = ad.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadAssignedLog} lal`,
            on: `cd.user_id = lal.user_id and cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${moment()
              .startOf("month")
              .format("YYYY-MM-DD")}' AND '${moment()
              .endOf("day")
              .format("YYYY-MM-DD")}'`,
          },
        ],
        condition: [
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
          {
            field: "lal.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.counsellor_assigned",
            operator: "IN",
            value: counsellorIds,
          },
        ],
        groupBy: ["ad.crm_user"],
        orderBy: ["ad.admin_user_id"],
      },
    ]);

    // ---- Conversion Data ----
    const conversionData = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'converted_lead' as type",
          "ad.crm_user",
          "ad.admin_user_id",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            type: "INNER",
            table: `${tables.orderDetails} od`,
            on: "cd.user_id = od.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "od.sale_by = ad.admin_user_id",
          },
        ],
        condition: [
          {
            field: "od.sale_by",
            operator: "IN",
            value: counsellorIds,
          },
          {
            field: "od.order_type",
            operator: "=",
            value: "New",
          },
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            field: "cd.counsellor_assigned",
            operator: "NOT IN",
            value: [10, 0, 196],
          },
        ],
        groupBy: ["od.sale_by", "ad.crm_user"],
        orderBy: ["ad.admin_user_id"],
      },
    ]);

    // ---- Combine Final Data ----
    const finalData = salesData.reduce((acc, item) => {
      acc[item.crm_user] = {
        sales: Number(item.sales),
        id: item.admin_user_id,
      };
      return acc;
    }, {});

    assignedData.forEach((item) => {
      finalData[item.crm_user] = finalData[item.crm_user] || { sales: 0 };
      const convertedLeads = conversionData.find(
        (i) => i.crm_user === item.crm_user,
      );

      finalData[item.crm_user]["conversion_rate"] = !isNaN(
        (convertedLeads?.count / item.count) * 100,
      )
        ? ((convertedLeads?.count / item.count) * 100).toFixed(2)
        : 0;

      // Example: average per unit (sales / assigned leads)
      finalData[item.crm_user]["avg_per_unit"] =
        item.count > 0
          ? (finalData[item.crm_user].sales / item.count).toFixed(2)
          : 0;
    });

    // ---- Sorting ----
    const sortedData = Object.entries(finalData).map(([crm_user, value]) => ({
      crm_user,
      ...value,
    }));

    sortedData.sort((a, b) => {
      const valA = Number(a[sort_by]) || 0;
      const valB = Number(b[sort_by]) || 0;
      return order === "asc" ? valA - valB : valB - valA;
    });

    const finalSortedData = {};
    sortedData.forEach((item) => {
      finalSortedData[item.crm_user] = item;
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Top Performers Data Fetched Successfully",
      data: finalSortedData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in topPerformers:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const assignedLeadsPerformance = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().format("YYYY-MM-DD"),
    } = req.body;
    // 1. Fetch active and currently working counsellors
    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "!=", value: 1 },
        { field: "ad.is_active", operator: "=", value: 1 },
      ],
    });

    const { results: mentors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "ad.is_active", operator: "=", value: 1 },
      ],
    });

    const counsellorIds = counsellors.map((c) => c.admin_user_id);
    const mentorIds = mentors.map((m) => m.admin_user_id);

    const dateFrom = start_date;
    const dateTo = end_date;

    // 2. Leads Assigned This Month
    const { results: assignedData } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS count", "ad.crm_user"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND DATE(cd.added_date) BETWEEN '${dateFrom}' AND '${dateTo}'`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
      conditions: [
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "IN",
          value: counsellorIds,
        },
      ],
      groupBy: ["cd.counsellor_assigned"],
      orderBy: ["ad.admin_user_id"],
    });

    const { results: assignedDataMentors } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS count", "ad.crm_user"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id  AND DATE(cd.added_date) BETWEEN '${dateFrom}' AND '${dateTo}'`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
      conditions: [
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "IN",
          value: mentorIds,
        },
        {
          field: "cd.counsellor_assigned",
          operator: "!=",
          value: 196,
        },
      ],
      groupBy: ["cd.counsellor_assigned"],
      orderBy: ["ad.admin_user_id"],
    });

    // 3. Consultations
    const { results: consultationData } = await readRecord({
      selectFields: ["COUNT(DISTINCT csl.user_id) AS count", "ad.crm_user"],
      table: `${tables.consultationLogs} csl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
      ],
      conditions: [
        { field: "csl.consultation_by", operator: "IN", value: counsellorIds },
        {
          field: "DATE(csl.added_date)",
          operator: "BETWEEN",
          value: [dateFrom, dateTo],
        },
      ],
      groupBy: ["ad.crm_user"],
      orderBy: ["ad.admin_user_id"],
    });

    const { results: consultationDataMentors } = await readRecord({
      selectFields: ["COUNT(DISTINCT csl.user_id) AS count", "ad.crm_user"],
      table: `${tables.consultationLogs} csl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
      ],
      conditions: [
        { field: "csl.consultation_by", operator: "IN", value: mentorIds },
        {
          field: "csl.consultation_by",
          operator: "!=",
          value: 196,
        },
        {
          field: "DATE(csl.added_date)",
          operator: "BETWEEN",
          value: [dateFrom, dateTo],
        },
      ],
      groupBy: ["ad.crm_user"],
      orderBy: ["ad.admin_user_id"],
    });

    // 4. Sales (Closed Sub Orders)
    const { results: salesData } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT sop.sub_order_id) AS count",
        "ad.crm_user",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `od.sale_by = ad.admin_user_id`,
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "!=", value: 196 },
        { field: "od.sale_by", operator: "IN", value: counsellorIds },
        { field: "od.order_type", operator: "=", value: "New" },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [dateFrom, dateTo],
        },
      ],
      groupBy: ["ad.crm_user"],
      orderBy: ["ad.admin_user_id"],
    });

    const { results: salesDataMentors } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT sop.sub_order_id) AS count",
        "ad.crm_user",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `od.sale_by = ad.admin_user_id`,
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "!=", value: 196 },
        { field: "od.sale_by", operator: "IN", value: mentorIds },
        { field: "od.order_type", operator: "=", value: "New" },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [dateFrom, dateTo],
        },
      ],
      groupBy: ["ad.crm_user"],
      orderBy: ["ad.admin_user_id"],
    });

    // Convert result arrays to lookup maps for fast access
    const assignedMap = Object.fromEntries(
      assignedData.map((item) => [item.crm_user, +item.count]),
    );
    const consultationMap = Object.fromEntries(
      consultationData.map((item) => [item.crm_user, +item.count]),
    );
    const salesMap = Object.fromEntries(
      salesData.map((item) => [item.crm_user, +item.count]),
    );

    const assignedMapMentors = Object.fromEntries(
      assignedDataMentors.map((item) => [item.crm_user, +item.count]),
    );

    const consultationMapMentors = Object.fromEntries(
      consultationDataMentors.map((item) => [item.crm_user, +item.count]),
    );

    const salesMapMentors = Object.fromEntries(
      salesDataMentors.map((item) => [item.crm_user, +item.count]),
    );

    // 5. Final Aggregated Data
    const data = counsellors.map(({ crm_user }) => {
      const leadsAssigned = assignedMap[crm_user] || 0;
      const consultations = consultationMap[crm_user] || 0;
      const sales = salesMap[crm_user] || 0;

      return {
        crm_user,
        leads_assigned: leadsAssigned,
        consultations,
        sales,
        "l:c": leadsAssigned
          ? ((consultations / leadsAssigned) * 100).toFixed(2)
          : "0.00",
        "c:s": consultations
          ? ((sales / consultations) * 100).toFixed(2)
          : "0.00",
        "l:s": leadsAssigned
          ? ((sales / leadsAssigned) * 100).toFixed(2)
          : "0.00",
      };
    });

    // Sort by sales descending
    data.sort((a, b) => b.sales - a.sales);

    // Convert to object format
    const counsellor_data = Object.fromEntries(
      data.map((item) => [item.crm_user, item]),
    );

    const mentorData = mentors.map(({ crm_user }) => {
      const leadsAssigned = assignedMapMentors[crm_user] || 0;
      const consultations = consultationMapMentors[crm_user] || 0;
      const sales = salesMapMentors[crm_user] || 0;

      return {
        crm_user,
        leads_assigned: leadsAssigned,
        consultations,
        sales,
        "l:c": leadsAssigned
          ? ((consultations / leadsAssigned) * 100).toFixed(2)
          : "0.00",
        "c:s": consultations
          ? ((sales / consultations) * 100).toFixed(2)
          : "0.00",
        "l:s": leadsAssigned
          ? ((sales / leadsAssigned) * 100).toFixed(2)
          : "0.00",
      };
    });

    mentorData.sort((a, b) => b.sales - a.sales);
    const mentor_data = Object.fromEntries(
      mentorData.map((item) => [item.crm_user, item]),
    );
    // Send response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Assigned Leads Performance Data Fetched Successfully",
      data: {
        counsellor_data,
        mentor_data,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in assignedLeadsPerformance:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesBreakDownByStack = async (req, res, next) => {
  try {
    const { results: programCategories } = await readRecord({
      selectFields: ["DISTINCT(program_category)"],
      table: `${tables.programsMaster} pm`,
      conditions: [
        {
          field: "pm.program_category",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "pm.program_category", operator: "!=", value: "Service" },
      ],
    });
    const { results: salesData } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT sop.sub_order_id) as count",
        "pm.program_category",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `od.user_id = cd.user_id`,
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "!=", value: 196 },
        { field: "od.order_type", operator: "=", value: "New" },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${moment()
        .startOf("month")
        .format("YYYY-MM-DD")}'
			AND '${moment().endOf("day").format("YYYY-MM-DD")}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      groupBy: ["pm.program_category"],
    });
    console.log(salesData, 680);
    const { results: revenueData } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as count",
        "pm.program_category",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `od.user_id = cd.user_id`,
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "!=", value: 196 },
        { field: "od.order_type", operator: "=", value: "New" },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("day").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${moment()
        .startOf("month")
        .format("YYYY-MM-DD")}'
			AND '${moment().endOf("day").format("YYYY-MM-DD")}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      groupBy: ["pm.program_category"],
    });
    const data = programCategories.map((category) => {
      const sales =
        salesData.find(
          (item) => item.program_category === category.program_category,
        ) || {};
      const revenue =
        revenueData.find(
          (item) => item.program_category === category.program_category,
        ) || {};
      return {
        program_category: category.program_category,
        sales: sales.count || 0,
        revenue: Number(revenue.count) || 0,
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Breakdown by Stack Data Fetched Successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in salesBreakDownByStack:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesTriggers = async (req, res, next) => {
  try {
    const { results: hotTriggers } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as total",
        "COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(),lal1.assign_date) >= 7 THEN cd.user_id END) as 7_days",
        "COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(),lal1.assign_date) >= 5 AND DATEDIFF(CURDATE(),lal1.assign_date) < 7 THEN cd.user_id END) as 5_days",
        "COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(),lal1.assign_date) >= 3 AND DATEDIFF(CURDATE(),lal1.assign_date) < 5 THEN cd.user_id END) as 3_days",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal1`,
          on: "cd.user_id = lal1.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal2`,
          on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
        },
      ],
      conditions: [
        { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
        {
          field: "DATEDIFF(CURDATE(),lal1.assign_date)",
          operator: ">=",
          value: 3,
        },
        { field: "cd.sales_status", operator: "=", value: "2" },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      ],
    });

    const { results: warmTriggers } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT cd.user_id) as total",
        "COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(),lal1.assign_date) >= 15 THEN cd.user_id END) as 15_days",
        "COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(),lal1.assign_date) >= 12 AND DATEDIFF(CURDATE(),lal1.assign_date) < 15 THEN cd.user_id END) as 12_days",
        "COUNT(DISTINCT CASE WHEN DATEDIFF(CURDATE(),lal1.assign_date) >= 10 AND DATEDIFF(CURDATE(),lal1.assign_date) < 12 THEN cd.user_id END) as 10_days",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal1`,
          on: "cd.user_id = lal1.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal2`,
          on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
        },
      ],
      conditions: [
        { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
        {
          field: "DATEDIFF(CURDATE(),lal1.assign_date)",
          operator: ">=",
          value: 10,
        },
        { field: "cd.sales_status", operator: "=", value: "3" },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      ],
    });

    const { results: toEngageTriggers } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) as total"],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: "DATEDIFF(CURDATE(),cd.added_date)",
          operator: ">=",
          value: 7,
        },
        { field: "cd.sales_status", operator: "=", value: "0" },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      ],
    });

    const { results: allTargetMarketLogs } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadSaleStatusLog} lssl`,
          on: "cd.user_id = lssl.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions: [
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        {
          orConditions: [
            {
              field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
              operator: ">=",
              value: 35,
            },
            {
              field:
                "(cd.country_id != 101 AND cd.country_id IS NOT NULL AND cd.country_id != 0)",
              operator: "",
              value: "",
              raw: true,
            },
            { field: "ls.source_group", operator: "IN", value: [3, 5] },
          ],
        },
      ],
    });

    const downgradeCounts = {
      hot_to_warm: 0,
      hot_to_cold: 0,
      warm_to_cold: 0,
    };
    allTargetMarketLogs.forEach((result) => {
      const salesLog = JSON.parse(result.sales_status_log);
      if (salesLog.length > 1) {
        salesLog.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const secondLast = salesLog[salesLog.length - 2];
        const last = salesLog[salesLog.length - 1];
        if (moment(last.timestamp).isAfter(moment().subtract(3, "days"))) {
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
      }
    });
    const data = {
      hot_triggers: {
        total: hotTriggers[0]?.total || 0,
        "3_days": hotTriggers[0]?.["3_days"] || 0,
        "5_days": hotTriggers[0]?.["5_days"] || 0,
        "7_days": hotTriggers[0]?.["7_days"] || 0,
      },
      warm_triggers: {
        total: warmTriggers[0]?.total || 0,
        "10_days": warmTriggers[0]?.["10_days"] || 0,
        "12_days": warmTriggers[0]?.["12_days"] || 0,
        "15_days": warmTriggers[0]?.["15_days"] || 0,
      },
      to_engage: toEngageTriggers[0]?.total || 0,
      downgrade_counts: downgradeCounts,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Triggers Data Fetched Successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in salesTriggers:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const salesProjection = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.body;
    // Leads (user_type = 0)
    const { results: leadsSuggestedData } = await readRecord({
      selectFields: [
        "SUM(sp.suggested_amount) as total",
        "COUNT(sp.suggested_program_id) as total_leads",
        "COUNT(CASE WHEN cd.payment_date = CURDATE() AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay_today",
        "SUM(CASE WHEN cd.payment_date = CURDATE() AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as to_pay_today_amount",
        "COUNT(CASE WHEN cd.payment_date = CURDATE() + INTERVAL 1 DAY AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as to_pay_tomorrow",
        "SUM(CASE WHEN cd.payment_date = CURDATE() + INTERVAL 1 DAY AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as to_pay_tomorrow_amount",
        "COUNT(CASE WHEN cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay",
        "SUM(CASE WHEN cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as total_to_pay_amount",
        "COUNT(CASE WHEN cd.sub_sales_status = 'Pay Later' THEN sp.suggested_program_id END) as total_pay_later",
        "SUM(CASE WHEN cd.sub_sales_status = 'Pay Later' THEN sp.suggested_amount ELSE 0 END) as pay_later_amount",
        "COUNT(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NULL THEN 1 END) as rate_shared",
        "SUM(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NULL THEN sp.suggested_amount ELSE 0 END) as rate_shared_amount",
        "COUNT(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NOT NULL THEN 1 END) as link_shared",
        "SUM(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NOT NULL THEN sp.suggested_amount ELSE 0 END) as link_shared_amount",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "sp.user_id = cd.user_id",
        },
      ],
      conditions: [
        start_date && end_date
          ? {
              field: "DATE(sp.updated_date)",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        { field: "cd.phone_code", operator: "!=", value: "" },
        { field: "cd.user_type", operator: "=", value: "0" },
      ].filter(Boolean),
    });

    // OC (user_type = 1, status Completed)
    const { results: ocSuggestedData } = await readRecord({
      selectFields: [
        "SUM(sp.suggested_amount) as total",
        "COUNT(sp.suggested_program_id) as total_leads",
        "COUNT(CASE WHEN cd.payment_date = CURDATE() AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay_today",
        "SUM(CASE WHEN cd.payment_date = CURDATE() AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as to_pay_today_amount",
        "COUNT(CASE WHEN cd.payment_date = CURDATE() + INTERVAL 1 DAY AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay_tomorrow",
        "SUM(CASE WHEN cd.payment_date = CURDATE() + INTERVAL 1 DAY AND cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as to_pay_tomorrow_amount",
        "COUNT(CASE WHEN cd.sub_sales_status = 'To Pay' THEN sp.suggested_program_id END) as total_to_pay",
        "SUM(CASE WHEN cd.sub_sales_status = 'To Pay' THEN sp.suggested_amount ELSE 0 END) as total_to_pay_amount",
        "COUNT(CASE WHEN cd.sub_sales_status = 'Pay Later' THEN sp.suggested_program_id END) as total_pay_later",
        "SUM(CASE WHEN cd.sub_sales_status = 'Pay Later' THEN sp.suggested_amount ELSE 0 END) as pay_later_amount",
        "COUNT(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NULL THEN 1 END) as rate_shared",
        "SUM(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NULL THEN sp.suggested_amount ELSE 0 END) as rate_shared_amount",
        "COUNT(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NOT NULL THEN 1 END) as link_shared",
        "SUM(CASE WHEN sp.suggested_amount IS NOT NULL AND sp.suggested_amount > 0 AND sp.payment_link_id IS NOT NULL THEN sp.suggested_amount ELSE 0 END) as link_shared_amount",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "sp.user_id = cd.user_id",
        },
      ],
      conditions: [
        start_date && end_date
          ? {
              field: "DATE(sp.updated_date)",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        { field: "cd.phone_code", operator: "!=", value: "" },
        { field: "cd.user_type", operator: "=", value: "1" },
        { field: "cd.user_status", operator: "=", value: "Completed" },
      ].filter(Boolean),
    });

    const { results: pageVisitData } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN iapv.page_type = 1 THEN iapv.user_id END) AS page_visits",
      ],
      table: `${tables.inAppPageVisitLog} iapv`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "iapv.user_id = cd.user_id",
        },
      ],
      conditions: [
        start_date && end_date
          ? {
              field: "iapv.visit_date",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        {
          field: "cd.phone_code",
          operator: "!=",
          value: "",
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      ].filter(Boolean),
    });

    const { results: checkoutVisitData } = await readRecordNewForLead({
      withQueries: [
        {
          name: "latest_checkout_visits",
          query: `SELECT *,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date DESC, visit_time DESC) AS rn
    FROM in_app_page_visit_log
    WHERE page_type = 2`,
        },
      ],
      selectFields: [
        "COUNT(DISTINCT iapv.page_visit_id) AS checkout_visits",
        "SUM(iapv.amount) AS checkout_visit_amount",
      ],
      table: "latest_checkout_visits iapv",
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "iapv.user_id = cd.user_id",
        },
      ],
      conditions: [
        { field: "iapv.rn", operator: "=", value: 1 },
        start_date && end_date
          ? {
              field: "iapv.visit_date",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        { field: "cd.phone_code", operator: "!=", value: "" },
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      ],
    });

    // Merge Data
    const leads = leadsSuggestedData[0] || {};
    const oc = ocSuggestedData[0] || {};

    const data = {
      total_pitched: {
        units: (leads.total_leads || 0) + (oc.total_leads || 0),
        amount: Number(leads.total || 0) + Number(oc.total || 0),
      },
      rate_shared: {
        units: (leads.rate_shared || 0) + (oc.rate_shared || 0),
        amount:
          Number(leads.rate_shared_amount || 0) +
          Number(oc.rate_shared_amount || 0),
      },
      link_shared: {
        units: (leads.link_shared || 0) + (oc.link_shared || 0),
        amount:
          Number(leads.link_shared_amount || 0) +
          Number(oc.link_shared_amount || 0),
      },
      total_to_pay: {
        units: (leads.total_to_pay || 0) + (oc.total_to_pay || 0),
        amount:
          Number(leads.total_to_pay_amount || 0) +
          Number(oc.total_to_pay_amount || 0),
      },
      pay_later: {
        units: (leads.total_pay_later || 0) + (oc.total_pay_later || 0),
        amount:
          Number(leads.pay_later_amount || 0) +
          Number(oc.pay_later_amount || 0),
      },
      today_to_pay: {
        units: (leads.total_to_pay_today || 0) + (oc.total_to_pay_today || 0),
        amount:
          Number(leads.to_pay_today_amount || 0) +
          Number(oc.to_pay_today_amount || 0),
      },
      tomorrow_to_pay: {
        units: (leads.to_pay_tomorrow || 0) + (oc.to_pay_tomorrow || 0),
        amount:
          Number(leads.to_pay_tomorrow_amount || 0) +
          Number(oc.to_pay_tomorrow_amount || 0),
      },
      page_visits: {
        total_page_visits: pageVisitData[0]?.page_visits || 0,
        total_checkout_visits: checkoutVisitData[0]?.checkout_visits || 0,
        total_checkout_amount:
          Number(checkoutVisitData[0]?.checkout_visit_amount) || 0,
      },
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Projection Data Fetched Successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in salesProjection:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const keySourceConversion = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.body;
    const sources = [
      {
        name: "social_media",
        condition: { field: "ls.source_group", operator: "=", value: 3 },
      },
      {
        name: "direct",
        condition: { field: "ls.source_group", operator: "=", value: 4 },
      },
      {
        name: "iwd",
        condition: { field: "ls.source_id", operator: "=", value: 56 },
      },
      {
        name: "referrals",
        condition: { field: "ls.source_group", operator: "=", value: 5 },
      },
      {
        name: "campaigns",
        condition: { field: "ls.source_group", operator: "=", value: 6 },
      },
      {
        name: "health_score",
        condition: { field: "ls.source_group", operator: "=", value: 1 },
      },
      {
        name: "website",
        condition: { field: "ls.source_group", operator: "=", value: 2 },
      },
    ];
    const data = await Promise.all(
      sources.map(async (source) => {
        const { results } = await readRecord({
          selectFields: [
            "COUNT(DISTINCT cd.user_id) as leads",
            "COUNT(DISTINCT CASE WHEN cd.user_type = '1' THEN cd.user_id END) as converted",
            "COALESCE(CAST(SUM(CASE WHEN od.order_type = 'New' THEN od.order_paid_amount ELSE 0 END) as DOUBLE), 0) as revenue",
            "CONCAT(COALESCE(CAST(COUNT(DISTINCT CASE WHEN cd.user_type = '1' THEN cd.user_id END)/COUNT(DISTINCT cd.user_id) * 100 AS DECIMAL(10,2)),0),'%') as conversion",
            `'${source.name}' as type`,
          ],
          table: `${tables.userDetails} cd`,
          joins: [
            {
              type: "INNER",
              table: `${tables.leadSource} ls`,
              on: "cd.primary_lead_source = ls.source_id",
            },
            {
              type: "LEFT",
              table: `${tables.orderDetails} od`,
              on: `cd.user_id = od.user_id AND od.order_type = 'New' ${
                start_date && end_date
                  ? `AND DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}'`
                  : ""
              }`,
            },
          ],
          conditions: [
            source.condition,
            { field: "cd.phone_code", operator: "!=", value: "" },
            {
              orConditions: [
                {
                  field: "cd.counsellor_assigned",
                  operator: "NOT IN",
                  value: [0, 10, 196],
                },
                {
                  field: "cd.counsellor_assigned",
                  operator: "IS NULL",
                  value: "",
                  raw: true,
                },
              ],
            },
            ...(start_date && end_date
              ? [
                  {
                    field: "DATE(cd.added_date)",
                    operator: "BETWEEN",
                    value: [start_date, end_date],
                  },
                ]
              : []),
          ],
        });
        return results[0];
      }),
    );
    console.log(data, 2884);
    data.sort((a, b) => b.leads - a.leads);
    console.log(data, 2886);
    const formattedData = {};
    data.forEach((item) => {
      formattedData[item.type] = item;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Key Source Conversion Data Fetched Successfully",
      data: formattedData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in keySourceConversion:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const assignedLeadsPerformanceById = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().format("YYYY-MM-DD"),
    } = req.query;

    const { id } = req.params; // single counsellor/mentor id

    const dateFrom = start_date;
    const dateTo = end_date;

    // 1. Fetch User Info (check if counsellor or mentor)
    const { results: userInfo } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user", "ad.role_id"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: id },
        { field: "ad.is_active", operator: "=", value: 1 },
      ],
    });

    if (!userInfo.length) {
      return res
        .status(404)
        .json(new ApiResponse({ statusCode: 404, message: "User not found" }));
    }

    const { admin_user_id, crm_user, role_id } = userInfo[0];

    // 2. Leads Assigned
    const { results: assignedData } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS count"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id AND DATE(cd.added_date) BETWEEN '${dateFrom}' AND '${dateTo}'`,
        },
      ],
      conditions: [
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: admin_user_id,
        },
        { field: "cd.counsellor_assigned", operator: "!=", value: 196 },
      ],
    });

    const { results: assignedSalesStausData } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS count", "cd.sales_status"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id AND DATE(cd.added_date) BETWEEN '${dateFrom}' AND '${dateTo}'`,
        },
      ],
      conditions: [
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: admin_user_id,
        },
        { field: "cd.counsellor_assigned", operator: "!=", value: 196 },
        {
          field: "cd.sales_status",
          operator: "IN",
          value: ["0", "2", "3", "4"],
        },
      ],
      groupBy: ["cd.sales_status"],
    });

    const salesStatusCounts = {
      to_engage: 0,
      hot: 0,
      warm: 0,
      cold: 0,
    };
    assignedSalesStausData.forEach((item) => {
      if (item.sales_status === "0") {
        salesStatusCounts.to_engage = item.count;
      } else if (item.sales_status === "2") {
        salesStatusCounts.hot = item.count;
      } else if (item.sales_status === "3") {
        salesStatusCounts.warm = item.count;
      } else if (item.sales_status === "4") {
        salesStatusCounts.cold = item.count;
      }
    });

    // 3. Consultations
    const { results: consultationData } = await readRecord({
      selectFields: ["COUNT(DISTINCT csl.user_id) AS count"],
      table: `${tables.consultationLogs} csl`,
      conditions: [
        { field: "csl.consultation_by", operator: "=", value: admin_user_id },
        { field: "csl.consultation_by", operator: "!=", value: 196 },
        {
          field: "DATE(csl.added_date)",
          operator: "BETWEEN",
          value: [dateFrom, dateTo],
        },
      ],
    });

    // 4. Sales (Closed Sub Orders)
    const { results: salesData } = await readRecord({
      selectFields: ["COUNT(DISTINCT sop.sub_order_id) AS count"],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: admin_user_id },
        { field: "od.sale_by", operator: "!=", value: 196 },
        { field: "od.order_type", operator: "=", value: "New" },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [dateFrom, dateTo],
        },
      ],
    });

    // revenue and sales
    const { results: revenueData } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as sales",
        "SUM(od.order_paid_amount) as revenue",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: id },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
      ],
    });

    const { results: suggestedPrograms } = await readRecord({
      selectFields: [
        "COUNT(sp.suggested_program_id) as count",
        "SUM(sp.suggested_amount) as amount",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "sp.user_id = cd.user_id",
        },
      ],
      conditions: [
        { field: "sp.suggested_by", operator: "=", value: id },
        {
          field: "DATE(sp.updated_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          orConditions: [
            { field: "cd.user_type", operator: "=", value: "0" },
            {
              field: "cd.user_type = '1' and cd.user_status = 'Completed'",
              operator: "",
              value: "",
              raw: true,
            },
          ],
        },
      ],
    });

    const { results: bestSourcePerformance } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as sales",
        "ls.source_group",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "cd.primary_lead_source = ls.source_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: id },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
      ],
      groupBy: ["ls.source_group"],
      orderBy: ["sales DESC"],
      pagination: { limit: 1, page: 1 },
    });

    // Extract values
    const leadsAssigned = assignedData[0]?.count || 0;
    const consultations = consultationData[0]?.count || 0;
    const sales = salesData[0]?.count || 0;

    // Calculate ratios
    const result = {
      crm_user,
      role_id,
      leads_assigned: leadsAssigned,
      consultations,
      sales,
      "l:c": leadsAssigned
        ? ((consultations / leadsAssigned) * 100).toFixed(2)
        : "0.00",
      "c:s": consultations
        ? ((sales / consultations) * 100).toFixed(2)
        : "0.00",
      "l:s": leadsAssigned
        ? ((sales / leadsAssigned) * 100).toFixed(2)
        : "0.00",
      sales_amount: revenueData[0]?.sales || 0,
      revenue: revenueData[0]?.revenue || 0,
      suggested_programs: suggestedPrograms[0]?.count || 0,
      suggested_amount: suggestedPrograms[0]?.amount || 0,
      best_source_performance:
        leadSourceGroups[bestSourcePerformance[0]?.source_group] || 0,
      lead_assigned_sales_status_count: salesStatusCounts,
    };

    // Response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Assigned Leads Performance Data Fetched Successfully",
      data: result,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in assignedLeadsPerformanceById:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const assignedLeadsPerformanceAll = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().format("YYYY-MM-DD"),
      filter = "all",
    } = req.query;

    const dateFrom = start_date;
    const dateTo = end_date;

    // 1. Fetch all active counsellors (excluding default/system ones)
    const { results: counsellors } = await readRecord({
      selectFields: ["ad.admin_user_id", "ad.crm_user", "ad.role_id"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "!=", value: 1 },
      ],
    });

    if (!counsellors.length) {
      return res.status(404).json(
        new ApiResponse({
          statusCode: 404,
          message: "No active counsellors found",
        }),
      );
    }

    const filterConditions = [];
    if (filter.toLowerCase() === "ol") {
      // old leads
      filterConditions.push({
        field: "cd.added_date",
        operator: "<",
        value: moment().startOf("month").format("YYYY-MM-DD"),
      });
    } else if (filter.toLowerCase() === "fl") {
      // fresh leads
      filterConditions.push({
        field: "cd.added_date",
        operator: ">=",
        value: moment().startOf("month").format("YYYY-MM-DD"),
      });
    } else if (filter.toLowerCase() === "oc") {
      filterConditions.push(
        { field: "cd.user_type", operator: "=", value: "1" },
        // { field: "cd.user_status", operator: "=", value: "Completed" }
      );
    }
    // 2. For each counsellor, compute stats
    const performanceData = await Promise.all(
      counsellors.map(async (counsellor) => {
        const { admin_user_id, crm_user, role_id } = counsellor;

        try {
          // Leads Assigned
          const { results: assignedData } = await readRecord({
            selectFields: ["COUNT(DISTINCT cd.user_id) AS count"],
            table: `${tables.userDetails} cd`,
            joins: [
              {
                type: "INNER",
                table: `${tables.leadAssignedLog} lal`,
                on: `cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${dateFrom}' AND '${dateTo}'`,
              },
            ],
            conditions: [
              { field: "cd.phone_code", operator: "!=", value: "" },
              {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: admin_user_id,
              },
              { field: "cd.counsellor_assigned", operator: "!=", value: 196 },
              ...filterConditions,
            ],
          });

          const { results: assignedSalesStatusData } = await readRecord({
            selectFields: [
              "COUNT(DISTINCT cd.user_id) AS count",
              "cd.sales_status",
            ],
            table: `${tables.userDetails} cd`,
            joins: [
              {
                type: "INNER",
                table: `${tables.leadAssignedLog} lal`,
                on: `cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id AND DATE(cd.added_date) BETWEEN '${dateFrom}' AND '${dateTo}'`,
              },
            ],
            conditions: [
              { field: "cd.phone_code", operator: "!=", value: "" },
              {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: admin_user_id,
              },
              { field: "cd.counsellor_assigned", operator: "!=", value: 196 },
              {
                field: "cd.sales_status",
                operator: "IN",
                value: ["0", "2", "3", "4"],
              },
              ...filterConditions,
            ],
            groupBy: ["cd.sales_status"],
          });

          const salesStatusCounts = { to_engage: 0, hot: 0, warm: 0, cold: 0 };
          assignedSalesStatusData.forEach((item) => {
            if (item.sales_status === "0")
              salesStatusCounts.to_engage = item.count;
            else if (item.sales_status === "2")
              salesStatusCounts.hot = item.count;
            else if (item.sales_status === "3")
              salesStatusCounts.warm = item.count;
            else if (item.sales_status === "4")
              salesStatusCounts.cold = item.count;
          });

          // Consultations
          const { results: consultationData } = await readRecord({
            selectFields: ["COUNT(DISTINCT csl.user_id) AS count"],
            table: `${tables.consultationLogs} csl`,
            joins: [
              {
                type: "INNER",
                table: `${tables.userDetails} cd`,
                on: "csl.user_id = cd.user_id",
              },
            ],
            conditions: [
              {
                field: "csl.consultation_by",
                operator: "=",
                value: admin_user_id,
              },
              { field: "csl.consultation_by", operator: "!=", value: 196 },
              {
                field: "DATE(csl.added_date)",
                operator: "BETWEEN",
                value: [dateFrom, dateTo],
              },
              ...filterConditions,
            ],
          });

          // Sales
          const { results: salesData } = await readRecord({
            selectFields: ["COUNT(DISTINCT sop.sub_order_id) AS count"],
            table: `${tables.orderDetails} od`,
            joins: [
              {
                type: "LEFT",
                table: `${tables.subOrderPrograms} sop`,
                on: "od.order_id = sop.order_id",
              },
              {
                type: "INNER",
                table: `${tables.userDetails} cd`,
                on: "od.user_id = cd.user_id",
              },
            ],
            conditions: [
              { field: "od.sale_by", operator: "=", value: admin_user_id },
              {
                field: "od.order_type",
                operator: "=",
                value: filter == "oc" ? "OCR" : "New",
              },
              {
                field: "DATE(od.order_date)",
                operator: "BETWEEN",
                value: [dateFrom, dateTo],
              },
              ...filterConditions,
            ],
          });

          // Revenue
          const { results: revenueData } = await readRecord({
            selectFields: [
              "SUM(od.order_paid_amount + od.order_balance_amount) as sales",
              "SUM(od.order_paid_amount) as revenue",
            ],
            table: `${tables.orderDetails} od`,
            joins: [
              {
                type: "INNER",
                table: `${tables.userDetails} cd`,
                on: "od.user_id = cd.user_id",
              },
            ],
            conditions: [
              { field: "od.sale_by", operator: "=", value: admin_user_id },
              {
                field: "od.order_type",
                operator: "=",
                value: filter == "oc" ? "OCR" : "New",
              },
              {
                field: "DATE(od.order_date)",
                operator: "BETWEEN",
                value: [start_date, end_date],
              },
              ...filterConditions,
            ],
          });

          // Suggested Programs
          const { results: suggestedPrograms } = await readRecord({
            selectFields: [
              "COUNT(sp.suggested_program_id) as count",
              "SUM(sp.suggested_amount) as amount",
            ],
            table: `${tables.suggestedProgram} sp`,
            joins: [
              {
                type: "INNER",
                table: `${tables.userDetails} cd`,
                on: "sp.user_id = cd.user_id",
              },
            ],
            conditions: [
              { field: "sp.suggested_by", operator: "=", value: admin_user_id },
              {
                field: "DATE(sp.updated_date)",
                operator: "BETWEEN",
                value: [start_date, end_date],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [10, 0, 196],
              },
              { field: "cd.phone_code", operator: "!=", value: "" },
              {
                orConditions: [
                  { field: "cd.user_type", operator: "=", value: "0" },
                  {
                    field:
                      "cd.user_type = '1' and cd.user_status = 'Completed'",
                    operator: "",
                    value: "",
                    raw: true,
                  },
                ],
              },
              ...filterConditions,
            ],
          });

          const { results: bestSourcePerformance } = await readRecord({
            selectFields: [
              "SUM(od.order_paid_amount + od.order_balance_amount) as sales",
              "ls.source_group",
            ],
            table: `${tables.orderDetails} od`,
            joins: [
              {
                type: "LEFT",
                table: `${tables.userDetails} cd`,
                on: "od.user_id = cd.user_id",
              },
              {
                type: "LEFT",
                table: `${tables.leadSource} ls`,
                on: "cd.primary_lead_source = ls.source_id",
              },
            ],
            conditions: [
              { field: "od.sale_by", operator: "=", value: admin_user_id },
              {
                field: "DATE(od.order_date)",
                operator: "BETWEEN",
                value: [start_date, end_date],
              },
              ...filterConditions,
            ],
            groupBy: ["ls.source_group"],
            orderBy: ["sales DESC"],
            pagination: { limit: 1, page: 1 },
          });

          const { results: leadConversionTimes } = await readRecord({
            selectFields: [
              "DATEDIFF(MIN(od.order_date), lal.assign_date) AS conversion_days",
            ],
            table: `${tables.userDetails} cd`,
            joins: [
              {
                type: "INNER",
                table: `${tables.leadAssignedLog} lal`,
                on: "cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id",
              },
              {
                type: "INNER",
                table: `${tables.orderDetails} od`,
                on: "cd.user_id = od.user_id AND od.order_type = 'New'",
              },
            ],
            conditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: admin_user_id,
              },
              { field: "cd.counsellor_assigned", operator: "!=", value: 196 },
              {
                field: "DATE(cd.added_date)",
                operator: "BETWEEN",
                value: [dateFrom, dateTo],
              },
            ],
            groupBy: ["cd.user_id"],
          });

          const avgConversionTime =
            leadConversionTimes.length > 0
              ? (
                  leadConversionTimes.reduce(
                    (acc, item) => acc + item.conversion_days,
                    0,
                  ) / leadConversionTimes.length
                ).toFixed(2)
              : 0;

          const leadsAssigned = assignedData[0]?.count || 0;
          const consultations = consultationData[0]?.count || 0;
          const sales = salesData[0]?.count || 0;

          return {
            admin_user_id,
            crm_user,
            role_id,
            leads_assigned: leadsAssigned,
            consultations,
            sales,
            "l:c": leadsAssigned
              ? ((consultations / leadsAssigned) * 100).toFixed(2)
              : "0.00",
            "c:s": consultations
              ? ((sales / consultations) * 100).toFixed(2)
              : "0.00",
            "l:s": leadsAssigned
              ? ((sales / leadsAssigned) * 100).toFixed(2)
              : "0.00",
            sales_amount: revenueData[0]?.sales || 0,
            revenue: revenueData[0]?.revenue || 0,
            suggested_programs: suggestedPrograms[0]?.count || 0,
            suggested_amount: suggestedPrograms[0]?.amount || 0,
            best_source_performance:
              leadSourceGroups[bestSourcePerformance[0]?.source_group] || null,
            lead_assigned_sales_status_count: salesStatusCounts,
            avg_conversion_time_days: avgConversionTime,
          };
        } catch (err) {
          console.error(
            `Error fetching data for counsellor ${admin_user_id}:`,
            err,
          );
          return { admin_user_id, crm_user, role_id, error: err.message };
        }
      }),
    );
    console.log(performanceData, 3671);
    const date_from = moment()
      .subtract(6, "months")
      .startOf("month")
      .format("YYYY-MM-DD");
    const date_to = moment().endOf("month").format("YYYY-MM-DD");
    const benchmarkData = {
      "l:c": 0,
      "c:s": 0,
      "l:s": 0,
    };
    const lastSixMonthsPerformanceData = {};
    for (
      let m = moment(date_from).clone();
      m.isSameOrBefore(date_to, "month");
      m.add(1, "month")
    ) {
      const monthStart = m.clone().startOf("month").format("YYYY-MM-DD");
      const monthEnd = m.clone().endOf("month").format("YYYY-MM-DD");
      for (const counsellor of counsellors) {
        const performanceData = await getCounsellorPerformance({
          id: counsellor.admin_user_id,
          startDate: monthStart,
          endDate: monthEnd,
          filter,
        });
        if (performanceData.leads_assigned >= 20) {
          benchmarkData["l:c"] = Math.max(
            benchmarkData["l:c"],
            parseFloat(performanceData["l:c"] || 0),
          );
          benchmarkData["c:s"] = Math.max(
            benchmarkData["c:s"],
            parseFloat(performanceData["c:s"] || 0),
          );
          benchmarkData["l:s"] = Math.max(
            benchmarkData["l:s"],
            parseFloat(performanceData["l:s"] || 0),
          );
        }
        const lastPerformance =
          lastSixMonthsPerformanceData[counsellor.admin_user_id] || [];
        lastPerformance.push(performanceData);
        lastSixMonthsPerformanceData[counsellor.admin_user_id] =
          lastPerformance;
      }
    }
    console.log(benchmarkData, "benchmark data");
    console.log(lastSixMonthsPerformanceData, "last six months data");
    performanceData.forEach((counsellor) => {
      const previousPerformances =
        lastSixMonthsPerformanceData[counsellor.admin_user_id] || [];
      const data = counsellor;
      data.avg_performance = {
        "l:c": (
          previousPerformances
            .slice(3)
            .reduce((acc, item) => acc + parseFloat(item["l:c"] || 0), 0) /
          Math.max(previousPerformances.slice(3).length, 1)
        ).toFixed(2),
        "c:s": (
          previousPerformances
            .slice(3)
            .reduce((acc, item) => acc + parseFloat(item["c:s"] || 0), 0) /
          Math.max(previousPerformances.slice(3).length, 1)
        ).toFixed(2),
        "l:s": (
          previousPerformances
            .slice(3)
            .reduce((acc, item) => acc + parseFloat(item["l:s"] || 0), 0) /
          Math.max(previousPerformances.slice(3).length, 1)
        ).toFixed(2),
      };
      return data;
    });
    const filtered = Object.values(lastSixMonthsPerformanceData)
      .flatMap((perfs) => perfs.slice(3))
      .filter((perf) => perf.leads_assigned >= 20);

    const count = Math.max(filtered.length, 1);

    const avgPerformance = {
      "l:c": parseFloat(
        (
          filtered.reduce((a, b) => a + Number(b["l:c"] || 0), 0) / count
        ).toFixed(2),
      ),
      "c:s": parseFloat(
        (
          filtered.reduce((a, b) => a + Number(b["c:s"] || 0), 0) / count
        ).toFixed(2),
      ),
      "l:s": parseFloat(
        (
          filtered.reduce((a, b) => a + Number(b["l:s"] || 0), 0) / count
        ).toFixed(2),
      ),
    };

    // 3. Return final array
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "All Counsellors' Assigned Leads Performance Fetched Successfully",
      data: performanceData,
      meta_data: {
        benchmarkData,
        avgPerformance,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in assignedLeadsPerformanceAll:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const pitchedHistory = async (req, res, next) => {
  try {
    const {
      id,
      user_type = "",
      start_date,
      end_date,
      filter = "rate_shared",
    } = req.body;
    const { results: suggestedCounts } = await readRecord({
      selectFields: [
        "SUM(sp.suggested_amount) as amount",
        "SUM(CASE WHEN pm.program_category = 'Basic Stack' THEN sp.suggested_amount ELSE 0 END) as basic_stack",
        "SUM(CASE WHEN pm.program_category = 'Special Stack' THEN sp.suggested_amount ELSE 0 END) as special_stack",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "sp.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sp.program_id = pm.program_id",
        },
      ],
      conditions: [
        ...(id ? [{ field: "sp.suggested_by", operator: "=", value: id }] : []),

        ...(user_type === "lead"
          ? [{ field: "cd.user_type", operator: "=", value: "0" }]
          : user_type === "oc"
            ? [
                { field: "cd.user_type", operator: "=", value: "1" },
                { field: "cd.user_status", operator: "=", value: "Completed" },
              ]
            : [
                {
                  field:
                    "(cd.user_type = '0' OR (cd.user_type = '1' AND cd.user_status = 'Completed'))",
                  operator: "",
                  value: "",
                  raw: true,
                },
              ]),

        start_date && end_date
          ? {
              field: "DATE(sp.updated_date)",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        {
          field: "cd.phone_code",
          operator: "!=",
          value: "",
        },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        filter === "rate_shared"
          ? {
              field: "sp.payment_link_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            }
          : filter === "link_shared"
            ? {
                field: "sp.payment_link_id",
                operator: "IS NOT",
                value: "NULL",
                raw: true,
              }
            : filter === "to_pay"
              ? {
                  field: "cd.sub_sales_status",
                  operator: "=",
                  value: "To Pay",
                }
              : filter === "pay_later"
                ? {
                    field: "cd.sub_sales_status",
                    operator: "=",
                    value: "Pay Later",
                  }
                : null,
      ].filter(Boolean),
    });

    const { results: usersData } = await readRecord({
      selectFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name) as name",
        "cd.user_id",
        "pm.program_name",
        "pm.program_category",
        "sp.suggested_amount",
        "ps.mrp as mrp",
        "ad.crm_user as suggested_by",
        "ad.designation",
        "sp.added_date",
        "sp.payment_status",
        "ps.program_duration",
        "cd.email_id",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "sp.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sp.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "sp.suggested_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sp.program_session_id = ps.program_session_id",
        },
        {
          type: "INNER",
          // Subquery to get latest updated_date per user
          table: `(SELECT user_id, MAX(updated_date) as latest_date FROM ${tables.suggestedProgram} GROUP BY user_id) latest_sp`,
          on: "sp.user_id = latest_sp.user_id AND sp.updated_date = latest_sp.latest_date",
        },
      ],
      conditions: [
        ...(id ? [{ field: "sp.suggested_by", operator: "=", value: id }] : []),

        ...(user_type === "lead"
          ? [{ field: "cd.user_type", operator: "=", value: "0" }]
          : user_type === "oc"
            ? [
                { field: "cd.user_type", operator: "=", value: "1" },
                { field: "cd.user_status", operator: "=", value: "Completed" },
              ]
            : [
                {
                  field:
                    "(cd.user_type = '0' OR (cd.user_type = '1' AND cd.user_status = 'Completed'))",
                  operator: "",
                  value: "",
                  raw: true,
                },
              ]),

        start_date && end_date
          ? {
              field: "DATE(sp.added_date)",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        filter === "rate_shared"
          ? {
              field: "sp.payment_link_id",
              operator: "IS",
              value: "NULL",
              raw: true,
            }
          : filter === "link_shared"
            ? {
                field: "sp.payment_link_id",
                operator: "IS NOT",
                value: "NULL",
                raw: true,
              }
            : filter === "to_pay"
              ? {
                  field: "cd.sub_sales_status",
                  operator: "=",
                  value: "To Pay",
                }
              : filter === "pay_later"
                ? {
                    field: "cd.sub_sales_status",
                    operator: "=",
                    value: "Pay Later",
                  }
                : null,
      ].filter(Boolean),
      orderBy: ["sp.updated_date DESC"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Pitched History Data Fetched Successfully",
      data: {
        total_amount: suggestedCounts[0]?.amount || 0,
        basic_stack: suggestedCounts[0]?.basic_stack || 0,
        special_stack: suggestedCounts[0]?.special_stack || 0,
        users: usersData,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in pitchedHistory:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const unconvertedLeads = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.body;
    const { results } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN cd.sales_status = '2' THEN cd.user_id END) AS hot",
        "COUNT(DISTINCT CASE WHEN cd.sales_status = '3' THEN cd.user_id END) AS warm",
        "COUNT(DISTINCT CASE WHEN cd.sales_status = '4' THEN cd.user_id END) AS cold",
      ],
      table: `${tables.consultationLogs} csl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "csl.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(csl.added_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
        { field: "cd.user_type", operator: "=", value: "0" },
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
      ],
    });
    const data = {
      hot: results[0]?.hot || 0,
      warm: results[0]?.warm || 0,
      cold: results[0]?.cold || 0,
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Unconverted Leads Data Fetched Successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in unconvertedLeads:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const consultationPending = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.body;
    const { results } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT CASE WHEN cd.sales_status = '0' THEN cd.user_id END) AS to_engage",
        "COUNT(DISTINCT CASE WHEN cd.sales_status = '6' THEN cd.user_id END) AS connected",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.consultationLogs} csl`,
          on: `cd.user_id = csl.user_id AND DATE(csl.added_date) BETWEEN '${start_date}' AND '${end_date}'`,
        },
      ],
      conditions: [
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.phone_code",
          operator: "!=",
          value: "",
        },
        {
          orConditions: [
            {
              field: "cd.counsellor_assigned",
              operator: "NOT IN",
              value: [10, 0, 196],
            },
            {
              field: "cd.counsellor_assigned",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "csl.id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        {
          field: "DATE(cd.added_date)",
          operator: "BETWEEN",
          value: [`${start_date}`, `${end_date}`],
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Consultation Pending Data Fetched Successfully",
      data: {
        to_engage: results[0]?.to_engage || 0,
        connected: results[0]?.connected || 0,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in consultationPending:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const quickSalesSnapshot = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.body;

    const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
    // days passed in current month window (inclusive of start_date..today)
    const daysInMonthSoFar =
      moment(end_date).diff(moment(start_date), "days") + 1;

    // if start_date is after yesterday (happens when today is the 1st),
    // extend start for the WHERE to include yesterday rows; otherwise keep original start_date
    const extendedStartDate = moment(start_date).isAfter(yesterday)
      ? yesterday
      : start_date;

    const data = await readRecordUnion([
      // Leads (first-time leads)
      {
        selectField: [
          // monthly_avg: only count rows inside start_date..end_date
          `ROUND(COUNT(DISTINCT CASE WHEN DATE(cd.added_date) BETWEEN '${start_date}' AND '${end_date}' THEN cd.user_id END) / ${daysInMonthSoFar}, 2) AS monthly_avg`,
          // yesterday_count: only count rows exactly on yesterday
          `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) = '${yesterday}' THEN cd.user_id END) AS yesterday_count`,
          "'fl' as type",
        ],
        table: `${tables.userDetails} cd`,
        condition: [
          { field: "cd.phone_code", operator: "!=", value: "" },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          // use extendedStartDate so yesterday rows are present for yesterday_count
          {
            field: "DATE(cd.added_date)",
            operator: "BETWEEN",
            value: [extendedStartDate, end_date],
          },
          {
            field: `cd.user_id NOT IN (SELECT
      ud.user_id
    FROM
      users_details ud
    INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
    INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
    WHERE
      ud.phone_code != ''
      AND (
        ud.counsellor_assigned NOT IN (0, 10, 196)
        OR ud.counsellor_assigned IS NULL
      )
      AND DATE(ud.added_date) BETWEEN '${start_date}'
      AND '${end_date}'
      AND ls.source_group = 5
      AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },

      // Old Leads (leadSourceLog)
      {
        selectField: [
          `ROUND(COUNT(DISTINCT CASE WHEN DATE(lsl.updated_at) BETWEEN '${start_date}' AND '${end_date}' THEN lsl.user_id END) / ${daysInMonthSoFar}, 2) AS monthly_avg`,
          `COUNT(DISTINCT CASE WHEN DATE(lsl.updated_at) = '${yesterday}' THEN lsl.user_id END) AS yesterday_count`,
          "'ol' as type",
        ],
        table: `${tables.leadSourceLog} lsl`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = lsl.user_id",
          },
        ],
        condition: [
          {
            // use extendedStartDate so yesterday rows are available for yesterday_count
            field: "DATE(lsl.updated_at)",
            operator: "BETWEEN",
            value: [extendedStartDate, end_date],
          },
          { field: "DATE(lsl.added_date)", operator: "<", value: start_date },
          { field: "DATE(cd.added_date)", operator: "<", value: start_date },
          { field: "cd.phone_code", operator: "!=", value: "" },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            orConditions: [
              {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
              {
                field: "cd.counsellor_assigned",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: `cd.user_id NOT IN (SELECT
      ud.user_id
    FROM
      users_details ud
    INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
    INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
    WHERE
      ud.phone_code != ''
      AND (
        ud.counsellor_assigned NOT IN (0, 10, 196)
        OR ud.counsellor_assigned IS NULL
      )
      AND DATE(ud.added_date) BETWEEN '${start_date}'
      AND '${end_date}'
      AND ls.source_group = 5
      AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },

      // Consultations
      {
        selectField: [
          `ROUND(COUNT(DISTINCT CASE WHEN DATE(csl.added_date) BETWEEN '${start_date}' AND '${end_date}' THEN csl.user_id END) / ${daysInMonthSoFar}, 2) AS monthly_avg`,
          `COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = '${yesterday}' THEN csl.user_id END) AS yesterday_count`,
          "'consultations' as type",
        ],
        table: `${tables.consultationLogs} csl`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "csl.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `${tables.adminUsers} ad`,
            on: "csl.consultation_by = ad.admin_user_id",
          },
        ],
        condition: [
          { field: "ad.is_active", operator: "=", value: 1 },
          {
            field: "csl.consultation_by",
            operator: "NOT IN",
            value: [0, 10, 196],
          },
          {
            field: "DATE(csl.added_date)",
            operator: "BETWEEN",
            value: [extendedStartDate, end_date],
          },
          {
            field: `cd.user_id NOT IN (SELECT
      ud.user_id
    FROM
      users_details ud
    INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
    INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
    WHERE
      ud.phone_code != ''
      AND (
        ud.counsellor_assigned NOT IN (0, 10, 196)
        OR ud.counsellor_assigned IS NULL
      )
      AND DATE(ud.added_date) BETWEEN '${start_date}'
      AND '${end_date}'
      AND ls.source_group = 5
      AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },

      // Sales (New orders)
      {
        selectField: [
          // monthly_avg should sum only amounts inside start_date..end_date
          `ROUND(SUM(CASE WHEN DATE(od.order_date) BETWEEN '${start_date}' AND '${end_date}' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) / ${daysInMonthSoFar}, 2) AS monthly_avg`,
          // yesterday_count should sum amounts on yesterday (include even if yesterday < start_date)
          `SUM(CASE WHEN DATE(od.order_date) = '${yesterday}' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS yesterday_count`,
          "'sales' as type",
        ],
        table: `${tables.orderDetails} od`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "od.user_id = cd.user_id",
          },
        ],
        condition: [
          { field: "od.order_type", operator: "=", value: "New" },
          // ensure rows include yesterday if needed for yesterday_count
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [extendedStartDate, end_date],
          },
          {
            field: `cd.user_id NOT IN (SELECT
      ud.user_id
    FROM
      users_details ud
    INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
    INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
    WHERE
      ud.phone_code != ''
      AND (
        ud.counsellor_assigned NOT IN (0, 10, 196)
        OR ud.counsellor_assigned IS NULL
      )
      AND DATE(ud.added_date) BETWEEN '${start_date}'
      AND '${end_date}'
      AND ls.source_group = 5
      AND ad.role_id = 1)`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
    ]);

    const finalData = {
      monthly: data.reduce((acc, item) => {
        acc[item.type] = Number(item.monthly_avg) || 0;
        return acc;
      }, {}),
      yesterday: data.reduce((acc, item) => {
        acc[item.type] = Number(item.yesterday_count) || 0;
        return acc;
      }, {}),
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Quick Sales Snapshot Data Fetched Successfully",
      data: finalData,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in quickSalesSnapshot:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const solidSalesOpportunities = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    const data = await readRecordUnion([
      {
        table: `${tables.inAppPageVisitLog} iapv`,
        selectField: [
          "COUNT(DISTINCT iapv.user_id) as count",
          "'checkout_visit' as type",
          "ad.crm_user as counsellor",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = iapv.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.counsellor_assigned",
          },
        ],
        condition: [
          { field: "iapv.page_type", operator: "=", value: 2 },
          {
            field: "iapv.visit_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          mentor_id
            ? {
                field: "ud.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "ud.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "ud.user_type", operator: "=", value: "0" },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared(to_pay)' as type",
          "ad.crm_user as counsellor",
        ],
        condition: [
          mentor_id
            ? {
                field: "sp.suggested_by",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "sp.suggested_by",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            field: "sp.suggested_amount",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.suggested_amount",
            operator: "!=",
            value: 0,
          },
          {
            field: "DATE(sp.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          { field: "ud.sub_sales_status", operator: "=", value: "To Pay" },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.counsellor_assigned",
          },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared(pay_later)' as type",
          "ad.crm_user as counsellor",
        ],
        condition: [
          mentor_id
            ? {
                field: "sp.suggested_by",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "sp.suggested_by",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            field: "sp.suggested_amount",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.suggested_amount",
            operator: "!=",
            value: 0,
          },
          {
            field: "DATE(sp.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          { field: "ud.sub_sales_status", operator: "=", value: "Pay Later" },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.counsellor_assigned",
          },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.leadsActivatedFeatures} la`,
        selectField: [
          "COUNT(DISTINCT la.user_id) as count",
          "'leads_with_double_discount' as type",
          "ad.crm_user as counsellor",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "la.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.prizeDetails} pd`,
            on: "la.user_id = pd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.counsellor_assigned",
          },
        ],
        condition: [
          {
            field: "JSON_VALID(la.coupon)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          mentor_id
            ? {
                field: "ud.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "ud.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            orConditions: [
              {
                field:
                  "DATE(JSON_UNQUOTE(JSON_EXTRACT(la.coupon,'$.end_date')))",
                operator: ">=",
                value: "CURDATE()",
                raw: true,
              },
              {
                field: "DATE(pd.added_date) + INTERVAL 3 DAY",
                operator: ">=",
                value: "CURDATE()",
                raw: true,
              },
            ],
          },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'referrals' as type",
          "ad.crm_user as counsellor",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} rud`,
            on: "ud.referred_by = rud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = ud.counsellor_assigned",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "rud.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "rud.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "ud.current_lead_source", operator: "=", value: 22 },
          { field: "rud.user_type", operator: "=", value: "0" },
          {
            field: "DATE(ud.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.subOrderPrograms} sop`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'leads_with_GO_pro' as type",
          "ad.crm_user as counsellor",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "sop.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = cd.counsellor_assigned",
          },
        ],
        condition: [
          { field: "sop.type", operator: "=", value: 1 },
          mentor_id
            ? {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
          {
            field: "sop.expiry_date",
            operator: ">=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        selectField: [
          "COUNT(DISTINCT wrl.user_id) as count",
          "'good_weight_loss' as type",
          "ad.crm_user as counsellor",
        ],
        table: `(
    SELECT *
    FROM (
        SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC) AS rn
        FROM ${tables.weightRecordsLead}
    ) sub
    WHERE rn = 1
) wrl`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "wrl.user_id = cd.user_id",
          },
          {
            type: "INNER",
            table: `(
    SELECT *
    FROM (
        SELECT *,
               ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY added_date) AS rn
        FROM ${tables.weightRecordsLead}
        WHERE added_date BETWEEN '${moment()
          .startOf("month")
          .format("YYYY-MM-DD")}' AND '${moment()
          .endOf("day")
          .format("YYYY-MM-DD")}'
    ) ranked_weights
    WHERE rn = 1
) msw`,
            on: "msw.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = cd.counsellor_assigned",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
          { field: "msw.weight", operator: "IS NOT", value: "NULL", raw: true },
          {
            field: "cd.latest_weight",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.latest_weight", operator: "!=", value: 0 },
          { field: "msw.weight - cd.latest_weight", operator: ">=", value: 2 },
          { field: "wrl.weight_acknowledge", operator: "=", value: 0 },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.userMilestones} um`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'milestone' as type",
          "ad.crm_user as counsellor",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "um.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = cd.counsellor_assigned",
          },
        ],
        condition: [
          mentor_id
            ? {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_type", operator: "=", value: "0" },
          { field: "um.added_by", operator: "=", value: "User" },
          { field: "um.is_ack", operator: "=", value: 0 },
          {
            field: "DATE(um.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["ad.crm_user"],
      },
      {
        table: `${tables.leadFeedback} lfb`,
        selectField: [
          "COUNT(DISTINCT lfb.user_id) as count",
          "'good_consultation_feedback' as type",
          "ad.crm_user as counsellor",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} cd`,
            on: "lfb.user_id = cd.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = cd.counsellor_assigned",
          },
        ],
        condition: [
          { field: "lfb.type", operator: "=", value: "Consultation" },
          mentor_id
            ? {
                field: "cd.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              }
            : {
                field: "cd.counsellor_assigned",
                operator: "NOT IN",
                value: [0, 10, 196],
              },
          { field: "cd.user_type", operator: "=", value: "0" },
          {
            field: "JSON_VALID(lfb.feedback)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "LCASE(JSON_UNQUOTE(JSON_EXTRACT(lfb.feedback, '$.rating'))) = 'happy'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "DATE(lfb.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
        groupBy: ["ad.crm_user"],
      },
    ]);

    const { results: leadsWithFreeCourse } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "laf.guides",
        "laf.user_id",
        "cd.counsellor_assigned",
        "ad.crm_user",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadsActivatedFeatures} laf`,
          on: "laf.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.user_id = cd.user_id AND sop.type = 1",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = cd.counsellor_assigned",
        },
      ],
      conditions: [
        mentor_id
          ? {
              field: "cd.counsellor_assigned",
              operator: "=",
              value: parseInt(mentor_id),
            }
          : {
              field: "cd.counsellor_assigned",
              operator: "NOT IN",
              value: [0, 10, 196],
            },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "sop.sub_order_id",
          operator: "IS",
          value: "NULL",
          raw: true,
        },
        { field: "JSON_LENGTH(laf.guides)", operator: ">", value: 0 },
      ],
    });

    // Group counts by counsellor
    const usersWithActiveGuidesByMentor = {};

    leadsWithFreeCourse.forEach((item) => {
      const guides = safeJSONParse(item.guides, []);
      const hasActiveGuide = guides.some((guide) => {
        return (
          guide?.guide_end_date &&
          moment(guide.guide_end_date, "YYYY-MM-DD", true).isAfter(
            moment(),
            "day",
          )
        );
      });

      if (hasActiveGuide) {
        const mentor = item.crm_user || "Unknown";
        if (!usersWithActiveGuidesByMentor[mentor]) {
          usersWithActiveGuidesByMentor[mentor] = new Set();
        }
        usersWithActiveGuidesByMentor[mentor].add(item.user_id);
      }
    });

    const finalData = {
      checkout_visit: {},
      "payment_details_shared(to_pay)": {},
      "payment_details_shared(pay_later)": {},
      leads_with_double_discount: {},
      referrals: {},
      leads_with_free_course: {},
      leads_with_GO_pro: {},
      good_weight_loss: {},
      milestone: {},
      good_consultation_feedback: {},
    };
    data.forEach((item, index) => {
      finalData[item.type][`${item.counsellor}`] = parseInt(item.count);
    });
    Object.keys(usersWithActiveGuidesByMentor).forEach((mentor) => {
      finalData[`leads_with_free_course`][`${mentor}`] =
        usersWithActiveGuidesByMentor[mentor].size;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Solid Sales Opportunities data fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in solidSalesOpportunities controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const leadFunnel = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.body;

    const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
    // days passed in current month window (inclusive of start_date..today)
    const daysInMonthSoFar =
      moment(end_date).diff(moment(start_date), "days") + 1;

    // if start_date is after yesterday (happens when today is the 1st),
    // extend start for the WHERE to include yesterday rows; otherwise keep original start_date
    const extendedStartDate = moment(start_date).isAfter(yesterday)
      ? yesterday
      : start_date;
    const startOfPrevMonth = moment()
      .subtract(1, "month")
      .startOf("month")
      .format("YYYY-MM-DD");
    const endOfPrevMonth = moment()
      .subtract(1, "month")
      .endOf("month")
      .format("YYYY-MM-DD");
    const { results: counsellorLeadTarget } = await readRecord({
      selectFields: [
        "SUM(ad.lead_required) as lead_units",
        "SUM(ad.lead_target) as total_target",
      ],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.is_currently_working", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 2 },
      ],
    });

    const { results: totalMentors } = await readRecord({
      selectFields: [
        "COUNT(ad.admin_user_id) as total_mentor",
        "SUM(ad.lead_target) as total_target",
      ],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 1 },
      ],
    });

    const { results: counsellorSales } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as total_sales",
        "SUM(CASE WHEN DATE(od.created_at) = CURDATE() THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) as todays_sales",
        "SUM(CASE WHEN DATE(od.created_at) = CURDATE() - INTERVAL 1 DAY THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) as yesterdays_sales",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${extendedStartDate}`, `${end_date}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "!=", value: 1 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });
    const { results: counsellorSalesLastMonth } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as total_sales",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${startOfPrevMonth}`, `${endOfPrevMonth}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "!=", value: 1 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });
    console.log(counsellorSales, 4455);
    const { results: mentorSales } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as total_sales",
        "SUM(CASE WHEN DATE(od.created_at) = CURDATE() THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) as todays_sales",
        "SUM(CASE WHEN DATE(od.created_at) = CURDATE() - INTERVAL 1 DAY THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) as yesterdays_sales",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${extendedStartDate}`, `${end_date}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });
    const { results: mentorSalesLastMonth } = await readRecord({
      selectFields: [
        "SUM(od.order_paid_amount + od.order_balance_amount) as total_sales",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${startOfPrevMonth}`, `${endOfPrevMonth}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });
    console.log(mentorSales, 4456);
    const { results: counsellorSalesUnits } = await readRecord({
      selectFields: ["COUNT(DISTINCT od.user_id) as total_sales_units"],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${extendedStartDate}`, `${end_date}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });

    const { results: counsellorSalesUnitsLastMonth } = await readRecord({
      selectFields: ["COUNT(DISTINCT od.user_id) as total_sales_units"],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${startOfPrevMonth}`, `${endOfPrevMonth}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 2 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });

    const { results: mentorSalesUnits } = await readRecord({
      selectFields: ["COUNT(DISTINCT od.user_id) as total_sales_units"],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${extendedStartDate}`, `${end_date}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });

    const { results: mentorSalesUnitsLastMonth } = await readRecord({
      selectFields: ["COUNT(DISTINCT od.user_id) as total_sales_units"],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "od.sale_by = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "DATE(od.created_at)",
          operator: "BETWEEN",
          value: [`${startOfPrevMonth}`, `${endOfPrevMonth}`],
        },
        { field: "ad.is_active", operator: "=", value: 1 },
        { field: "ad.role_id", operator: "=", value: 1 },
        { field: "od.order_type", operator: "=", value: "New" },
      ],
    });
    console.log(counsellorSalesUnits, mentorSalesUnits, 4457);

    const assignedFreshLeadsSelectFields = [
      "COUNT(DISTINCT cd.user_id) AS total_assigned_leads",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_mentors",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_counsellors",
      `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_leads`,
      `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_to_mentors`,
      `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() THEN cd.user_id END) AS todays_assigned_to_counsellors`,
      `COUNT(DISTINCT CASE WHEN DATE(cd.added_date) = CURDATE() - INTERVAL 1 DAY THEN cd.user_id END) AS yesterdays_assigned_leads`,
      `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() - INTERVAL 1 DAY THEN cd.user_id END) AS yesterday_assigned_to_mentors`,
      `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 AND DATE(cd.added_date) = CURDATE() - INTERVAL 1 DAY THEN cd.user_id END) AS yesterday_assigned_to_counsellors`,
    ];

    const assignedFreshLeadsConditions = [
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [start_date, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${extendedStartDate}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: assignedFreshLeadCounts } = await readRecord({
      selectFields: assignedFreshLeadsSelectFields,
      table: `${tables.userDetails} cd`,
      conditions: assignedFreshLeadsConditions,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id and DATE(lal.assign_date) BETWEEN '${extendedStartDate}' AND '${end_date}'`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });
    console.log(assignedFreshLeadCounts, 5207);
    const assignedFreshLeadsSelectFieldsLastMonth = [
      "COUNT(DISTINCT cd.user_id) AS total_assigned_leads",
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_mentors",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND ad.is_active = 1 THEN cd.user_id END) AS total_assigned_to_counsellors",
    ];

    const assignedFreshLeadsConditionsLastMonth = [
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "BETWEEN",
        value: [startOfPrevMonth, endOfPrevMonth],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${startOfPrevMonth}'
			AND '${endOfPrevMonth}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: assignedFreshLeadCountsLastMonth } = await readRecord({
      selectFields: assignedFreshLeadsSelectFieldsLastMonth,
      table: `${tables.userDetails} cd`,
      conditions: assignedFreshLeadsConditionsLastMonth,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id and DATE(lal.assign_date) BETWEEN '${startOfPrevMonth}' AND '${endOfPrevMonth}'`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });

    const assignedLeadsConditions = [
      // {
      //   field: "DATE(lsl.updated_at)",
      //   operator: "BETWEEN",
      //   value: [extendedStartDate, end_date],
      // },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${extendedStartDate}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${extendedStartDate}`,
      },
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: assignedOldLeadCounts } = await readRecord({
      selectFields: assignedFreshLeadsSelectFields,
      table: `${tables.leadSourceLog} lsl`,
      conditions: assignedLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `lsl.user_id = cd.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id and DATE(lal.assign_date) BETWEEN '${extendedStartDate}' AND '${end_date}' AND cd.counsellor_assigned = lal.counsellor_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });
    console.log(assignedOldLeadCounts, 5345);
    const assignedLeadsConditionsLastMonth = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [startOfPrevMonth, endOfPrevMonth],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${startOfPrevMonth}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${startOfPrevMonth}`,
      },
      { field: "cd.phone_code", operator: "!=", value: "" },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "cd.counsellor_assigned",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: assignedOldLeadCountsLastMonth } = await readRecord({
      selectFields: assignedFreshLeadsSelectFields,
      table: `${tables.leadSourceLog} lsl`,
      conditions: assignedLeadsConditionsLastMonth,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `lsl.user_id = cd.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id and DATE(lal.assign_date) BETWEEN '${startOfPrevMonth}' AND '${endOfPrevMonth}'`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
    });

    const consultationFreshLeadsSelectFields = [
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 THEN csl.user_id END) AS total_mentor_consultations",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 THEN csl.user_id END) AS total_counsellor_consultations",
      "COUNT(DISTINCT csl.user_id) AS total_consultations",
      `COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_consultations`,
      `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_mentor_consultations`,
      `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND DATE(csl.added_date) = CURDATE() THEN csl.user_id END) AS todays_counsellor_consultations`,
      `COUNT(DISTINCT CASE WHEN DATE(csl.added_date) = CURDATE() - INTERVAL 1 DAY THEN csl.user_id END) AS yesterday_consultations`,
      `COUNT(DISTINCT CASE WHEN ad.role_id = 1 AND DATE(csl.added_date) = CURDATE() - INTERVAL 1 DAY THEN csl.user_id END) AS yesterday_mentor_consultations`,
      `COUNT(DISTINCT CASE WHEN ad.role_id != 1 AND DATE(csl.added_date) = CURDATE() - INTERVAL 1 DAY THEN csl.user_id END) AS yesterday_counsellor_consultations`,
    ];

    const consultationFreshLeadsConditions = [
      {
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [extendedStartDate, end_date],
      },
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${extendedStartDate}'
			AND '${end_date}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: consultationFreshLeadCounts } = await readRecord({
      selectFields: consultationFreshLeadsSelectFields,
      table: `${tables.consultationLogs} csl`,
      conditions: consultationFreshLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    const consultationFreshLeadsSelectFieldsLastMonth = [
      "COUNT(DISTINCT CASE WHEN ad.role_id = 1 THEN csl.user_id END) AS total_mentor_consultations",
      "COUNT(DISTINCT CASE WHEN ad.role_id != 1 THEN csl.user_id END) AS total_counsellor_consultations",
      "COUNT(DISTINCT csl.user_id) AS total_consultations",
    ];

    const consultationFreshLeadsConditionsLastMonth = [
      {
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [startOfPrevMonth, endOfPrevMonth],
      },
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND DATE(ud.added_date) BETWEEN '${startOfPrevMonth}'
			AND '${endOfPrevMonth}'
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: consultationFreshLeadCountsLastMonth } = await readRecord({
      selectFields: consultationFreshLeadsSelectFieldsLastMonth,
      table: `${tables.consultationLogs} csl`,
      conditions: consultationFreshLeadsConditionsLastMonth,
      joins: [
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    const consultationLeadsConditions = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [extendedStartDate, end_date],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${extendedStartDate}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${extendedStartDate}`,
      },
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [extendedStartDate, end_date],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: consultationOldLeadCounts } = await readRecord({
      selectFields: consultationFreshLeadsSelectFields,
      table: `${tables.leadSourceLog} lsl`,
      conditions: consultationLeadsConditions,
      joins: [
        {
          type: "INNER",
          table: `${tables.consultationLogs} csl`,
          on: `csl.user_id = lsl.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    const consultationLeadsConditionsLastMonth = [
      {
        field: "DATE(lsl.updated_at)",
        operator: "BETWEEN",
        value: [startOfPrevMonth, endOfPrevMonth],
      },
      {
        field: "DATE(lsl.added_date)",
        operator: "<",
        value: `${startOfPrevMonth}`,
      },
      {
        field: "DATE(cd.added_date)",
        operator: "<",
        value: `${startOfPrevMonth}`,
      },
      {
        field: "ad.is_active",
        operator: "=",
        value: 1,
      },
      {
        field: "csl.consultation_by",
        operator: "NOT IN",
        value: [0, 10, 196],
      },
      {
        field: "DATE(csl.added_date)",
        operator: "BETWEEN",
        value: [startOfPrevMonth, endOfPrevMonth],
      },
      {
        field: `cd.user_id NOT IN (SELECT
			ud.user_id
		FROM
			users_details ud
		INNER JOIN lead_source ls ON ud.primary_lead_source = ls.source_id
		INNER JOIN admin_users ad ON ud.counsellor_assigned = ad.admin_user_id
		WHERE
			ud.phone_code != ''
			AND (
				ud.counsellor_assigned NOT IN (0, 10, 196)
				OR ud.counsellor_assigned IS NULL
			)
			AND ls.source_group = 5
			AND ad.role_id = 1)`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results: consultationOldLeadCountsLastMonth } = await readRecord({
      selectFields: consultationFreshLeadsSelectFieldsLastMonth,
      table: `${tables.leadSourceLog} lsl`,
      conditions: consultationLeadsConditionsLastMonth,
      joins: [
        {
          type: "INNER",
          table: `${tables.consultationLogs} csl`,
          on: `csl.user_id = lsl.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `csl.consultation_by = ad.admin_user_id`,
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `csl.user_id = cd.user_id`,
        },
      ],
    });

    const workingDays = Math.max(moment().daysInMonth() - 4, 1);
    const workingDaysLastMonth = Math.max(
      moment(startOfPrevMonth).daysInMonth() - 4,
      1,
    );

    const data = {
      monthly: {
        counsellor_lead_target_units: Number(
          counsellorLeadTarget[0]?.lead_units || 0,
        ),
        counsellor_lead_assigned_units:
          assignedFreshLeadCounts[0].total_assigned_to_counsellors +
          assignedOldLeadCounts[0].total_assigned_to_counsellors,
        mentor_lead_target_units: (totalMentors[0]?.total_mentor || 0) * 20,
        mentor_lead_assigned_units:
          assignedFreshLeadCounts[0].total_assigned_to_mentors +
          assignedOldLeadCounts[0].total_assigned_to_mentors,
        counsellor_total_target: Number(
          counsellorLeadTarget[0]?.total_target || 0,
        ),
        mentor_total_target: Number(totalMentors[0]?.total_target || 0),
        counsellor_total_sales: Number(counsellorSales[0]?.total_sales || 0),
        mentor_total_sales: Number(mentorSales[0]?.total_sales || 0),
        counsellor_total_sales_units:
          counsellorSalesUnits[0]?.total_sales_units || 0,
        mentor_total_sales_units: mentorSalesUnits[0]?.total_sales_units || 0,
        counsellor_total_consultations:
          consultationFreshLeadCounts[0].total_counsellor_consultations +
          consultationOldLeadCounts[0].total_counsellor_consultations,
        mentor_total_consultations:
          consultationFreshLeadCounts[0].total_mentor_consultations +
          consultationOldLeadCounts[0].total_mentor_consultations,
        counsellor_lead_to_sales_conversion_rate:
          (counsellorSalesUnits[0]?.total_sales_units * 100) /
            (assignedFreshLeadCounts[0].total_assigned_to_counsellors +
              assignedOldLeadCounts[0].total_assigned_to_counsellors) || 0,
        mentor_lead_to_sales_conversion_rate:
          (mentorSalesUnits[0]?.total_sales_units * 100) /
            (assignedFreshLeadCounts[0].total_assigned_to_mentors +
              assignedOldLeadCounts[0].total_assigned_to_mentors) || 0,
        counsellor_consultation_to_sales_conversion_rate:
          (counsellorSalesUnits[0]?.total_sales_units * 100) /
            (consultationFreshLeadCounts[0].total_counsellor_consultations +
              consultationOldLeadCounts[0].total_counsellor_consultations) ?? 0,
        mentor_consultation_to_sales_conversion_rate:
          (mentorSalesUnits[0]?.total_sales_units * 100) /
            (consultationFreshLeadCounts[0].total_mentor_consultations +
              consultationOldLeadCounts[0].total_mentor_consultations) ?? 0,
        total_lead_to_sales_conversion_rate:
          (((counsellorSalesUnits[0]?.total_sales_units || 0) +
            (mentorSalesUnits[0]?.total_sales_units || 0)) *
            100) /
            (assignedFreshLeadCounts[0].total_assigned_to_counsellors +
              assignedOldLeadCounts[0].total_assigned_to_counsellors +
              assignedFreshLeadCounts[0].total_assigned_to_mentors +
              assignedOldLeadCounts[0].total_assigned_to_mentors) || 0,
        total_consultation_to_sales_conversion_rate:
          (((counsellorSalesUnits[0]?.total_sales_units || 0) +
            (mentorSalesUnits[0]?.total_sales_units || 0)) *
            100) /
            (consultationFreshLeadCounts[0].total_counsellor_consultations +
              consultationOldLeadCounts[0].total_counsellor_consultations +
              consultationFreshLeadCounts[0].total_mentor_consultations +
              consultationOldLeadCounts[0].total_mentor_consultations) || 0,
      },
      last_month: {
        counsellor_lead_assigned_units:
          assignedFreshLeadCountsLastMonth[0].total_assigned_to_counsellors +
          assignedOldLeadCountsLastMonth[0].total_assigned_to_counsellors,
        mentor_lead_target_units: (totalMentors[0]?.total_mentor || 0) * 20,
        mentor_lead_assigned_units:
          assignedFreshLeadCountsLastMonth[0].total_assigned_to_mentors +
          assignedOldLeadCountsLastMonth[0].total_assigned_to_mentors,
        counsellor_total_sales: Number(
          counsellorSalesLastMonth[0]?.total_sales || 0,
        ),
        mentor_total_sales: Number(mentorSalesLastMonth[0]?.total_sales || 0),
        counsellor_total_sales_units:
          counsellorSalesUnitsLastMonth[0]?.total_sales_units || 0,
        mentor_total_sales_units:
          mentorSalesUnitsLastMonth[0]?.total_sales_units || 0,
        counsellor_total_consultations:
          consultationFreshLeadCountsLastMonth[0]
            .total_counsellor_consultations +
          consultationOldLeadCountsLastMonth[0].total_counsellor_consultations,
        mentor_total_consultations:
          consultationFreshLeadCountsLastMonth[0].total_mentor_consultations +
          consultationOldLeadCountsLastMonth[0].total_mentor_consultations,
        counsellor_lead_to_sales_conversion_rate:
          (counsellorSalesUnitsLastMonth[0]?.total_sales_units * 100) /
            (assignedFreshLeadCountsLastMonth[0].total_assigned_to_counsellors +
              assignedOldLeadCountsLastMonth[0]
                .total_assigned_to_counsellors) || 0,
        mentor_lead_to_sales_conversion_rate:
          (mentorSalesUnitsLastMonth[0]?.total_sales_units * 100) /
            (assignedFreshLeadCountsLastMonth[0].total_assigned_to_mentors +
              assignedOldLeadCountsLastMonth[0].total_assigned_to_mentors) || 0,
        counsellor_consultation_to_sales_conversion_rate:
          (counsellorSalesUnitsLastMonth[0]?.total_sales_units * 100) /
            (consultationFreshLeadCountsLastMonth[0]
              .total_counsellor_consultations +
              consultationOldLeadCountsLastMonth[0]
                .total_counsellor_consultations) ?? 0,
        mentor_consultation_to_sales_conversion_rate:
          (mentorSalesUnitsLastMonth[0]?.total_sales_units * 100) /
            (consultationFreshLeadCountsLastMonth[0]
              .total_mentor_consultations +
              consultationOldLeadCountsLastMonth[0]
                .total_mentor_consultations) ?? 0,
        total_lead_to_sales_conversion_rate:
          (((counsellorSalesUnitsLastMonth[0]?.total_sales_units || 0) +
            (mentorSalesUnitsLastMonth[0]?.total_sales_units || 0)) *
            100) /
            (assignedFreshLeadCountsLastMonth[0].total_assigned_to_counsellors +
              assignedOldLeadCountsLastMonth[0].total_assigned_to_counsellors +
              assignedFreshLeadCountsLastMonth[0].total_assigned_to_mentors +
              assignedOldLeadCountsLastMonth[0].total_assigned_to_mentors) || 0,
        total_consultation_to_sales_conversion_rate:
          (((counsellorSalesUnitsLastMonth[0]?.total_sales_units || 0) +
            (mentorSalesUnitsLastMonth[0]?.total_sales_units || 0)) *
            100) /
            (consultationFreshLeadCountsLastMonth[0]
              .total_counsellor_consultations +
              consultationOldLeadCountsLastMonth[0]
                .total_counsellor_consultations +
              consultationFreshLeadCountsLastMonth[0]
                .total_mentor_consultations +
              consultationOldLeadCountsLastMonth[0]
                .total_mentor_consultations) || 0,
      },
      today: {
        counsellor_todays_lead_target_units: Math.round(
          (counsellorLeadTarget[0]?.lead_units || 0) / workingDays,
        ),
        counsellor_todays_lead_assigned_units:
          assignedFreshLeadCounts[0].todays_assigned_to_counsellors +
          assignedOldLeadCounts[0].todays_assigned_to_counsellors,
        mentor_todays_lead_target_units: Math.round(
          ((totalMentors[0]?.total_mentor || 0) * 20) / workingDays,
        ),
        mentor_todays_lead_assigned_units:
          assignedFreshLeadCounts[0].todays_assigned_to_mentors +
          assignedOldLeadCounts[0].todays_assigned_to_mentors,
        counsellor_todays_sales_target: Math.round(
          (counsellorLeadTarget[0]?.total_target || 0) / workingDays,
        ),
        mentor_todays_sales_target: Math.round(
          (totalMentors[0]?.total_target || 0) / workingDays,
        ),
        counsellor_todays_sales: Number(counsellorSales[0]?.todays_sales || 0),
        mentor_todays_sales: Number(mentorSales[0]?.todays_sales || 0),
        counsellor_todays_consultations:
          consultationFreshLeadCounts[0].todays_counsellor_consultations +
          consultationOldLeadCounts[0].todays_counsellor_consultations,
        mentor_todays_consultations:
          consultationFreshLeadCounts[0].todays_mentor_consultations +
          consultationOldLeadCounts[0].todays_mentor_consultations,
      },
      yesterday: {
        counsellor_yesterdays_lead_target_units: Math.round(
          (counsellorLeadTarget[0]?.lead_units || 0) / workingDays,
        ),
        counsellor_yesterdays_lead_assigned_units:
          assignedFreshLeadCounts[0].yesterday_assigned_to_counsellors +
          assignedOldLeadCounts[0].yesterday_assigned_to_counsellors,
        mentor_yesterdays_lead_target_units: Math.round(
          ((totalMentors[0]?.total_mentor || 0) * 20) / workingDays,
        ),
        mentor_yesterdays_lead_assigned_units:
          assignedFreshLeadCounts[0].yesterday_assigned_to_mentors +
          assignedOldLeadCounts[0].yesterday_assigned_to_mentors,
        counsellor_yesterdays_sales_target: Math.round(
          (counsellorLeadTarget[0]?.total_target || 0) / workingDays,
        ),
        mentor_yesterdays_sales_target: Math.round(
          (totalMentors[0]?.total_target || 0) / workingDays,
        ),
        counsellor_yesterdays_sales: Number(
          counsellorSales[0]?.yesterdays_sales || 0,
        ),
        mentor_yesterdays_sales: Number(mentorSales[0]?.yesterdays_sales || 0),
        total_yesterdays_sales:
          Number(counsellorSales[0]?.todays_sales || 0) +
          Number(mentorSales[0]?.todays_sales || 0),
        counsellor_yesterdays_consultations:
          consultationFreshLeadCounts[0].yesterday_counsellor_consultations +
          consultationOldLeadCounts[0].yesterday_counsellor_consultations,
        mentor_yesterdays_consultations:
          consultationFreshLeadCounts[0].yesterday_mentor_consultations +
          consultationOldLeadCounts[0].yesterday_mentor_consultations,
      },
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead Funnel Data Fetched Successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadFunnel controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const pageVisitDetails = async (req, res, next) => {
  try {
    const { page_type, start_date, end_date } = req.query;
    const { results } = await readRecordNewForLead({
      withQueries: [
        {
          name: "latest_visits",
          query: `SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date DESC, visit_time DESC) AS rn
    FROM 
        ${tables.inAppPageVisitLog}
    WHERE 
        page_type = ${parseInt(page_type)}`,
        },
      ],
      selectFields: [
        "CONCAT(cd.first_name, ' ', cd.last_name) as name",
        "cd.user_id",
        "pm.program_name",
        "pm.program_category",
        "ps.mrp as mrp",
        "ps.program_duration",
        "cd.email_id",
        "CASE WHEN iapv.page_type = 1 THEN 'Program Page Visit' WHEN iapv.page_type = 2 THEN 'Checkout Page Visit' ELSE 'Unknown' END as page_type",
      ],
      table: `latest_visits iapv`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "iapv.user_id = cd.user_id",
        },
        {
          type: page_type == 2 ? "INNER" : "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "iapv.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "iapv.program_id = ps.program_id and iapv.sessions =  ps.program_sessions",
        },
      ],
      conditions: [
        {
          field: "iapv.rn",
          operator: "=",
          value: 1,
        },
        start_date && end_date
          ? {
              field: "iapv.visit_date",
              operator: "BETWEEN",
              value: [`${start_date}`, `${end_date}`],
            }
          : null,
        {
          field: "cd.phone_code",
          operator: "!=",
          value: "",
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        {
          field: "iapv.page_type",
          operator: "=",
          value: parseInt(page_type),
        },
      ].filter(Boolean),
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Page Visit Details fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in pageVisitDetails controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const salesTriggersData = async (req, res, next) => {
  try {
    const { status } = req.query;
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "0" },
      { field: "cd.phone_code", operator: "!=", value: "" },
      {
        field: "cd.counsellor_assigned",
        operator: "NOT IN",
        value: [10, 0, 196],
      },
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "cd.suggested_program_id = sp.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sp.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "sp.suggested_by = ad.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sp.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        // Subquery to get latest updated_date per user
        table: `(SELECT user_id, MAX(updated_date) as latest_date FROM ${tables.suggestedProgram} GROUP BY user_id) latest_sp`,
        on: "sp.user_id = latest_sp.user_id AND sp.updated_date = latest_sp.latest_date",
      },
    ];
    if (["hot", "warm"].includes(status)) {
      conditions.push({
        field: "lal2.id",
        operator: "IS",
        value: "NULL",
        raw: true,
      });
      joins.push(
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal1`,
          on: "cd.user_id = lal1.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadAssignedLog} lal2`,
          on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
        },
      );
    }
    if (status === "hot") {
      conditions.push(
        {
          field: "DATEDIFF(CURDATE(),lal1.assign_date)",
          operator: ">=",
          value: 3,
        },
        { field: "cd.sales_status", operator: "=", value: "2" },
      );
    } else if (status === "warm") {
      conditions.push(
        {
          field: "DATEDIFF(CURDATE(),lal1.assign_date)",
          operator: ">=",
          value: 10,
        },
        { field: "cd.sales_status", operator: "=", value: "3" },
      );
    } else if (status === "to_engage") {
      conditions.push(
        {
          field: "DATEDIFF(CURDATE(),cd.added_date)",
          operator: ">=",
          value: 7,
        },
        { field: "cd.sales_status", operator: "=", value: "0" },
      );
    }
    const { results } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name, ''), ' ', COALESCE(cd.last_name, '')) AS name",
        "cd.user_id",
        "pm.program_name",
        "pm.program_category",
        "sp.suggested_amount",
        "ps.mrp as mrp",
        "ad.crm_user as suggested_by",
        "ad.designation",
        "sp.added_date",
        "sp.payment_status",
        "ps.program_duration",
        "cd.email_id",
      ],
      table: `${tables.userDetails} cd`,
      joins: [...joins],
      conditions: [...conditions],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Triggers Data fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in salesTriggersData controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getCounsellorDailyPerformanceById = async (req, res, next) => {
  try {
    const {
      id,
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.query;
    if (!id) {
      return next(new ErrorHandler("Counsellor ID is required", 400));
    }
    const { results } = await readRecord({
      selectFields: ["srn.note", "srn.added_date", "srn.other_data"],
      table: `${tables.salesReviewNotes} srn`,
      conditions: [
        { field: "srn.mentor_id", operator: "=", value: parseInt(id) },
        {
          field: "DATE(srn.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        },
        { field: "srn.slot", operator: "=", value: 3 },
      ],
      orderBy: ["srn.added_date DESC"],
    });
    const data = results.map((item) => {
      const { other_data, ...rest } = item;
      let otherData = {
        lead_assigned: "N/A",
        follow_up_done_today: "N/A",
        consultation_done: "N/A",
        engagement_today: "N/A",
        sale_today: { unit: "N/A", amount: "N/A" },
      };
      if (id == 215) {
        const debugData = safeJSONParse(other_data, {
          leads_assigned: "N/A",
          sales: {
            units: "N/A",
            amount: "N/A",
          },
          consultation_done: "N/A",
          engagement_today: "N/A",
        });
        console.log(debugData, "debugData for id 215");
        otherData = {
          lead_assigned: debugData.leads_assigned.today,
          follow_up_done_today: 0,
          consultation_done: 0,
          engagement_today: 0,
          sale_today: debugData.sales.today,
        };
      } else {
        const debugData = safeJSONParse(other_data, {
          today: {
            lead_assigned: "N/A",
            follow_up_done_today: "N/A",
            consultation_done: "N/A",
            engagement_today: "N/A",
            sale_today: { unit: "N/A", amount: "N/A" },
          },
        });
        console.log(otherData, "debugData for other users");
        otherData = {
          lead_assigned: debugData.today.lead_assigned,
          follow_up_done_today: debugData.today.follow_up_done_today,
          consultation_done: debugData.today.consultation_done,
          engagement_today: debugData.today.engagement_today,
          sale_today: debugData.today.sale_today,
        };
      }
      console.log(otherData, 7890);
      return {
        ...rest,
        ...otherData,
        added_date: moment(rest.added_date).format("YYYY-MM-DD"),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Counsellor Performance Data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getCounsellorPerformance controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const dailyNewLeads = async (req, res, next) => {
  try {
    const {
      start_date = moment().startOf("month").format("YYYY-MM-DD"),
      end_date = moment().endOf("day").format("YYYY-MM-DD"),
    } = req.query;
    const { results } = await readRecord({
      selectFields: [
        "DATE(cd.added_date) AS lead_date",
        "ls.source_name",
        "ad.crm_user AS counsellor_name",
        "COUNT(*) AS total_leads",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadSource} ls`,
          on: `cd.primary_lead_source = ls.source_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `cd.counsellor_assigned = ad.admin_user_id`,
        },
      ],
      conditions: [
        {
          field: "DATE(cd.added_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        },
        { field: "cd.phone_code", operator: "!=", value: "" },
        { field: "cd.user_type", operator: "=", value: "0" },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 0, 196],
        },
        { field: "ad.role_id", operator: "!=", value: 1 },
      ],
      groupBy: [
        "DATE(cd.added_date)",
        "ls.source_name",
        "cd.counsellor_assigned",
      ],
      orderBy: ["DATE(cd.added_date) ASC"],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Daily New Leads fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in dailyNewLeads controller:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

async function getCounsellorPerformance({
  id,
  startDate,
  endDate,
  filter = "",
}) {
  console.log(filter, 6385);
  try {
    const { results: assignedData } = await readRecord({
      selectFields: ["COUNT(DISTINCT cd.user_id) AS count"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.leadAssignedLog} lal`,
          on: `cd.user_id = lal.user_id AND cd.counsellor_assigned = lal.counsellor_id AND DATE(lal.assign_date) BETWEEN '${startDate}' AND '${endDate}'`,
        },
      ],
      conditions: [
        { field: "cd.phone_code", operator: "!=", value: "" },
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: id,
        },
      ],
    });
    const { results: consultationData } = await readRecord({
      selectFields: ["COUNT(DISTINCT csl.user_id) AS count"],
      table: `${tables.consultationLogs} csl`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "csl.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "csl.consultation_by",
          operator: "=",
          value: id,
        },
        {
          field: "DATE(csl.added_date)",
          operator: "BETWEEN",
          value: [startDate, endDate],
        },
      ],
    });
    const { results: salesData } = await readRecord({
      selectFields: ["COUNT(DISTINCT sop.sub_order_id) AS count"],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "od.user_id = cd.user_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: id },
        {
          field: "od.order_type",
          operator: "=",
          value: filter == "oc" ? "OCR" : "New",
        },
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [startDate, endDate],
        },
      ],
    });
    const leadsAssigned = assignedData[0]?.count || 0;
    const consultations = consultationData[0]?.count || 0;
    const sales = salesData[0]?.count || 0;
    return {
      leads_assigned: leadsAssigned,
      consultations: consultations,
      sales: sales,
      "l:c": leadsAssigned
        ? ((consultations / leadsAssigned) * 100).toFixed(2)
        : "0.00",
      "c:s": consultations
        ? ((sales / consultations) * 100).toFixed(2)
        : "0.00",
      "l:s": leadsAssigned
        ? ((sales / leadsAssigned) * 100).toFixed(2)
        : "0.00",
    };
  } catch (error) {
    console.log("Error in getCounsellorPerformance helper:", error);
    throw error;
  }
}

const getFranchiseEnquiries = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.franchiseInquiries} fe`,
      // conditions: [],
      orderBy: [
        "CASE WHEN fe.comment IS NULL THEN 0 ELSE 1 END, fe.created_at DESC",
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Franchise Enquiries fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getFranchiseEnquiries:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getNutripreneurEnquiries = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.nutripreneurEnquiry} nu`,
      // conditions: [],
      orderBy: [
        "CASE WHEN nu.comment IS NULL THEN 0 ELSE 1 END, nu.created_at DESC",
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Nutripreneur Enquiries fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getNutripreneurEnquiries:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const addCommentsToFranchiseEnquiry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    if (!comment || comment.trim() === "") {
      return next(new ErrorHandler("Comments cannot be empty", 400));
    }
    const updateResult = await updateRecord(
      tables.franchiseInquiries,
      { comment },
      { id: parseInt(id) },
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Franchise Enquiry not found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Comments added to Franchise Enquiry successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in addCommentsToFranchiseEnquiry:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const addCommentsToNutripreneurEnquiry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    if (!comment || comment.trim() === "") {
      return next(new ErrorHandler("Comments cannot be empty", 400));
    }
    const updateResult = await updateRecord(
      tables.nutripreneurEnquiry,
      { comment },
      { id: parseInt(id) },
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Nutripreneur Enquiry not found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Comments added to Nutripreneur Enquiry successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in addCommentsToNutripreneurEnquiry:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export {
  addCommentsToFranchiseEnquiry,
  assignedLeadsPerformance,
  assignedLeadsPerformanceAll,
  assignedLeadsPerformanceById,
  dailyNewLeads,
  getCounsellorDailyPerformanceById,
  getFranchiseEnquiries,
  leadManagement,
  oldLeadManagement,
  ocManagement,
  salesPerformance,
  counsellorPerformance,
  salesBreakDownByStack,
  salesTriggers,
  salesProjection,
  keySourceConversion,
  pitchedHistory,
  unconvertedLeads,
  consultationPending,
  quickSalesSnapshot,
  solidSalesOpportunities,
  leadFunnel,
  pageVisitDetails,
  salesTriggersData,
  getNutripreneurEnquiries,
  addCommentsToNutripreneurEnquiry,
  getCounsellorPerformance,
};
