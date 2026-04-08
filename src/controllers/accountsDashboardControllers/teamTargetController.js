import moment from "moment";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addTeamController = async (req, res, next) => {
  try {
    const { team_name, team_members, team_target, target_month } = req.body;

    if (!team_name || team_members.length === 0 || !team_target) {
      return next(new ErrorHandler("All fields are required", 400));
    }

    const columns = ["team_name", "team_member", "total_target"];
    if (target_month) {
      columns.push("target_month");
    }
    const memberIds = team_members.map((member) => member.admin_id);

    const values = [team_name, JSON.stringify(memberIds), team_target];
    if (target_month) values.push(moment(target_month, 'YYYY-MM').format('YYYY-MM-DD HH:mm:ss'));

    const insertResult = await insertRecord(
      `${tables.teamTarget}`,
      columns,
      values
    );

    if (insertResult.affectedRow === 0)
      return next(new ErrorHandler("Error While Adding Team", 400));
    await Promise.all(
      team_members.map(async (member) => {
        const updatedData = {
          lead_target: member.lead_target,
          active_target: member.active_target,
          ocr_target: member.ocr_target,
          lead_required: member.lead_required,
          team_id: insertResult.insertId,
          lead_units: member.lead_units,
          active_units: member.active_units,
          ocr_units: member.ocr_units,
        };
        const condition = { admin_user_id: Number(member.admin_id) };
        await updateRecord(`${tables.adminUsers}`, updatedData, condition);
      })
    );

    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: `Team ${team_name} added successfully`,
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editTeamController = async (req, res, next) => {
  try {
    const { team_id, team_name, team_members, team_target, target_month } =
      req.body;

    if (!team_id || !team_name || team_members.length === 0 || !team_target) {
      return next(
        new ErrorHandler("All fields (including team_id) are required", 400)
      );
    }
    const teamData = {
      team_name,
      team_member: JSON.stringify(
        team_members.map((member) => member.admin_id)
      ), // Update member IDs
      total_target: team_target,
      ...(target_month && { target_month }),
    };

    const condition = { id: parseInt(team_id) };

    const updateResult = await updateRecord(
      `${tables.teamTarget}`,
      teamData,
      condition
    );

    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Team not found or no changes made", 404));
    }

    await Promise.all(
      team_members.map(async (member) => {
        const updatedData = {
          lead_target: member.lead_target,
          active_target: member.active_target,
          ocr_target: member.ocr_target,
          lead_required: member.lead_required,
          team_id: parseInt(team_id),
        };
        const memberCondition = { admin_user_id: Number(member.admin_id) };
        const memberUpdateResult = await updateRecord(
          `${tables.adminUsers}`,
          updatedData,
          memberCondition
        );
        if (memberUpdateResult.affectedRows === 0) {
          console.warn(`No update for admin_user_id: ${member.admin_id}`);
        }
      })
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Team ${team_name} updated successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in editTeamController:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllTeams = async (req, res, next) => {
  const { date, team_id } = req.query;

  // Validate input date
  if (!date) {
    return next(new ErrorHandler("Date parameter is required", 400));
  }

  const startOfMonth = moment(date).startOf("month").format("YYYY-MM-DD");
  const endOfMonth = moment(date).endOf("month").format("YYYY-MM-DD");

  const todayStart = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss");
  const todayEnd = moment().endOf("day").format("YYYY-MM-DD HH:mm:ss");

  try {
    const { results: teams } = await readRecord({
      table: `${tables.teamTarget}`,
      selectFields: [
        "team_name",
        "team_member",
        "total_target",
        "id",
        "target_month",
      ],
      conditions: [
        team_id ? { field: "id", operator: "=", value: team_id } : null,
        { field: "DATE(target_month)", operator: ">=", value: startOfMonth },
        { field: "DATE(target_month)", operator: "<=", value: endOfMonth },
      ].filter(Boolean),
    });

    if (!teams.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No teams found for the given month",
          data: [],
        })
      );
    }

    const teamData = await Promise.all(
      teams.map(async (team) => {
        let memberIds = [];

        try {
          memberIds = JSON.parse(team.team_member) || [];
        } catch (error) {
          console.error("Invalid JSON in team_member:", team.team_member);
        }

        if (memberIds.length === 0) {
          return {
            team_id: team.id,
            team_name: team.team_name,
            target_month: team.target_month,
            total_target: team.total_target,
            achievedAmount: 0,
            achievedToday: 0,
            pendingAmount: team.total_target,
            percentage: 0,
          };
        }

        const { results: allOrders } = await readRecord({
          table: `${tables.orderDetails}`,
          selectFields: ["order_paid_amount"],
          conditions: [
            { field: "sale_by", operator: "IN", value: memberIds },
            { field: "created_at", operator: ">=", value: startOfMonth },
            { field: "created_at", operator: "<=", value: endOfMonth },
          ],
        });

        const achievedAmount = allOrders.reduce(
          (total, order) => total + Number(order.order_paid_amount),
          0
        );

        // Fetch today's achieved amount
        const { results: todayOrders } = await readRecord({
          table: `${tables.orderDetails}`,
          selectFields: ["order_paid_amount"],
          conditions: [
            { field: "sale_by", operator: "IN", value: memberIds },
            { field: "created_at", operator: ">=", value: todayStart },
            { field: "created_at", operator: "<=", value: todayEnd },
          ],
        });

        const achievedToday = todayOrders.reduce(
          (total, order) => total + Number(order.order_paid_amount),
          0
        );

        const pendingAmount = Math.max(0, team.total_target - achievedAmount);
        const percentage = team.total_target
          ? Math.round((achievedAmount / team.total_target) * 100)
          : 0;

        return {
          team_id: team.id,
          team_name: team.team_name,
          target_month: team.target_month,
          total_target: team.total_target,
          achievedAmount,
          achievedToday,
          pendingAmount,
          percentage,
        };
      })
    );

    // Return response
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Teams fetched successfully",
        data: teamData,
      })
    );
  } catch (error) {
    console.error("Error fetching team data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getIndividualTeamTargets = async (req, res, next) => {
  try {
    const { teamId, date } = req.query;

    if (!teamId) return next(new ErrorHandler("TeamId is required", 400));
    if (!date || !moment(date, "MM-YYYY", true).isValid()) {
      return next(new ErrorHandler("Date must be in MM-YYYY format", 400));
    }

    const formattedDate = moment(date, "MM-YYYY").format("YYYY-MM");
    const selectFields = [
      "ad.admin_user_id",
      "ad.first_name",
      "ad.last_name",
      "ad.ocr_target",
      "ad.lead_target",
      "ad.active_target",
      "ad.lead_required",
      "ad.active_units", 
      "ad.ocr_units", 
      "ad.lead_units" ,
      // Renewal
      "COUNT(CASE WHEN sop.order_type = 'Renewal' THEN 1 END) AS renewal_unit",
      "SUM(CASE WHEN sop.order_type = 'Renewal' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS renewal_sale",
      // OCR
      "COUNT(CASE WHEN sop.order_type = 'OCR' THEN 1 END) AS ocr_unit",
      "SUM(CASE WHEN sop.order_type = 'OCR' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS ocr_sale",
      // New
      "COUNT(CASE WHEN sop.order_type = 'New' THEN 1 END) AS new_unit",
      "SUM(CASE WHEN sop.order_type = 'New' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS new_sale",
      // Upgrade
      "COUNT(CASE WHEN sop.order_type = 'Upgrade' THEN 1 END) AS upgrade_unit",
      "SUM(CASE WHEN sop.order_type = 'Upgrade' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS upgrade_sale",
      `SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN 1 ELSE 0 END) as today_sale`,
      `SUM(CASE WHEN DATE(od.order_date) = CURDATE() THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) as today_sale_amount`,
      // Total sales for the month
      "SUM((od.order_paid_amount + od.order_balance_amount)) AS total_sale",
      `(SELECT COUNT(lal.id) FROM lead_assigned_log lal WHERE lal.counsellor_id = ad.admin_user_id AND DATE_FORMAT(lal.assign_date, '%Y-%m') = '${formattedDate}') as total_leads`,
      `(SELECT COUNT(DISTINCT ud.user_id) AS count FROM users_details ud INNER JOIN call_updates cu ON cu.user_id = ud.user_id WHERE DATE_FORMAT(cu.schedule_date,'%Y-%m') = '${formattedDate}' AND cu.call_status = '1' AND cu.added_by = ad.admin_user_id) as total_consultations`,
    ];

    const joins = [
      {
        type: "INNER",
        table: `${tables.adminUsers} ad`,
        on: "JSON_CONTAINS(tt.team_member, JSON_ARRAY(ad.admin_user_id))",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: `od.sale_by = ad.admin_user_id AND DATE_FORMAT(od.order_date, '%Y-%m') = '${formattedDate}'`,
      },
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.order_id = od.order_id",
      },
    ];
    console.log(formattedDate, 308);
    const { results } = await readRecord({
      table: `${tables.teamTarget} tt`,
      selectFields,
      joins,
      conditions: [
        {
          field: "DATE_FORMAT(tt.target_month, '%Y-%m')",
          operator: "=",
          value: formattedDate,
        },
        { field: "tt.id", operator: "=", value: teamId },
      ],
      groupBy: ["ad.admin_user_id", "ad.first_name", "ad.last_name"],
    });

    const data = results.map((i) => {
      const total_target =
        (Number(i.ocr_target) || 0) +
        (Number(i.lead_target) || 0) +
        (Number(i.active_target) || 0);
      const achieved_amount =
        (Number(i.renewal_sale) || 0) +
        (Number(i.ocr_sale) || 0) +
        (Number(i.new_sale) || 0) +
        (Number(i.upgrade_sale) || 0);
      const percentage =
        total_target > 0
          ? Math.round((achieved_amount / total_target) * 100)
          : 0;

      return {
        admin_user_id: i.admin_user_id,
        first_name: i.first_name,
        last_name: i.last_name,
        targets: {
          ocr_target: Number(i.ocr_target) || 0,
          lead_target: Number(i.lead_target) || 0,
          active_target: Number(i.active_target) || 0,
          lead_required: i.lead_required,
          total_target,
          active_units: Number(i.active_units) || 0,
          ocr_units: Number(i.ocr_units) || 0,
          lead_units: Number(i.lead_units) || 0,
        },
        lead_funnel: {
          total_leads: i.total_leads,
          total_consultations: i.total_consultations,
          total_sale:
            Number(i.renewal_unit) +
            Number(i.ocr_unit) +
            Number(i.new_unit) +
            Number(i.upgrade_unit),
        },
        sales: {
          renewal: {
            unit: Number(i.renewal_unit) || 0,
            sale: Number(i.renewal_sale) || 0,
          },
          ocr: { unit: Number(i.ocr_unit) || 0, sale: Number(i.ocr_sale) || 0 },
          new: { unit: Number(i.new_unit) || 0, sale: Number(i.new_sale) || 0 },
          upgrade: {
            unit: Number(i.upgrade_unit) || 0,
            sale: Number(i.upgrade_sale) || 0,
          },
          total_sale: Number(i.total_sale) || 0,
        },
        performance: {
          achieved_amount,
          pending_amount: total_target - achieved_amount,
          percentage,
          today_sale: i.today_sale,
          today_sale_amount: Number(i.today_sale_amount) || 0,
        },
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Individual Team Data fetched successfully",
      data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in getIndividualTeamTargets:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCompanyTarget = async (req, res, next) => {
  const { date } = req.query;
  const momentDate = moment(date, "MM-YYYY", true);
  if (!date || !momentDate.isValid()) {
    return res.status(400).send("Invalid date format. Please use MM-YYYY.");
  }

  const startOfMonth = momentDate.startOf("month").format("YYYY-MM-DD");
  const endOfMonth = momentDate.endOf("month").format("YYYY-MM-DD");
  const currentDate = moment().format("YYYY-MM-DD");

  try {
    const teamTargetQuery = {
      table: `${tables.teamTarget} tt`,
      selectFields: ["tt.total_target"],
      conditions: [
        {
          field: "DATE(tt.target_month)",
          operator: "BETWEEN",
          value: [startOfMonth, endOfMonth],
        },
      ],
    };

    const { results: teamTargets } = await readRecord(teamTargetQuery);
    const orderDetailsQuery = {
      table: `${tables.orderDetails} od`,
      selectFields: ["od.order_paid_amount", "od.order_date"],
      conditions: [
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [startOfMonth, endOfMonth],
        },
      ],
    };

    const { results: orderDetails } = await readRecord(orderDetailsQuery);

    const total_target = teamTargets.reduce(
      (sum, row) => sum + (Number(row.total_target) || 0),
      0
    );
    const total_achieved = orderDetails.reduce(
      (sum, row) => sum + (Number(row.order_paid_amount) || 0),
      0
    );

    const pending_target = Math.max(0, total_target - total_achieved);

    const today_sale = orderDetails.reduce((sum, row) => {
      const orderDate = moment(row.order_date).format("YYYY-MM-DD");
      return orderDate === currentDate
        ? sum + (Number(row.order_paid_amount) || 0)
        : sum;
    }, 0);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total targets fetched successfully`,
      data: {
        total_target: Math.floor(total_target),
        total_achieved: Math.floor(total_achieved),
        pending_target: Math.floor(pending_target),
        today_sale: Math.floor(today_sale),
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllTotalBalance = async (req, res, next) => {
  const { date } = req.query;
  const parsedDate = moment(date, "MM-YYYY");

  const startOfMonth = parsedDate.startOf("month").format("YYYY-MM-DD");
  const endOfMonth = parsedDate.endOf("month").format("YYYY-MM-DD");
  try {
    const selectFields = ["SUM(balance_amount) AS total_balance"];

    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} `,
      conditions: [
        {
          field: "program_status",
          operator: "IN",
          value: ["1", "2", "4"],
        },

        {
          field: "created_at",
          operator: ">=",
          value: startOfMonth,
        },
        {
          field: "created_at",
          operator: "<=",
          value: endOfMonth,
        },
      ],

      selectFields,
    });
    const data_ = { total_balance: 0 };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total Balance fetched successfully`,
      data: results[0].total_balance === null ? data_ : results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllTotalBalanceOd = async (req, res, next) => {
  const { date } = req.query;
  const parsedDate = moment(date, "MM-YYYY");

  const startOfMonth = parsedDate.startOf("month").format("YYYY-MM-DD");
  const endOfMonth = parsedDate.endOf("month").format("YYYY-MM-DD");
  try {
    const selectFields = ["SUM(balance_amount) AS total_balance"];

    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} `,
      conditions: [
        {
          field: "program_status",
          operator: "IN",
          value: ["1", "2", "4"],
        },
        {
          field: "due_date",
          operator: "<=",
          value: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
      ],

      selectFields,
    });
    const data_ = { total_balance: 0 };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Total Balance OD Fetched successfully`,
      data: results[0].total_balance === null ? data_ : results,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCompanyTargetDetails = async (req, res, next) => {
  try {
    const { date } = req.query;

    // Validate date format
    if (!date || !moment(date, "MM-YYYY", true).isValid()) {
      return res.status(400).send("Invalid date format. Please use MM-YYYY.");
    }

    const formattedDate = moment(date, "MM-YYYY").format("YYYY-MM");

    const selectFields = [
      "ad.admin_user_id",
      "ad.first_name",
      "ad.last_name",
      "ad.ocr_target",
      "ad.lead_target",
      "ad.active_target",
      // Renewal
      `COUNT(CASE WHEN sop.order_type = 'Renewal' THEN 1 END) AS renewal_unit`,
      `SUM(CASE WHEN sop.order_type = 'Renewal' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS renewal_sale`,
      // OCR
      `COUNT(CASE WHEN sop.order_type = 'OCR' THEN 1 END) AS ocr_unit`,
      `SUM(CASE WHEN sop.order_type = 'OCR' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS ocr_sale`,
      // New
      `COUNT(CASE WHEN sop.order_type = 'New' THEN 1 END) AS new_unit`,
      `SUM(CASE WHEN sop.order_type = 'New' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS new_sale`,
      // Upgrade
      `COUNT(CASE WHEN sop.order_type = 'Upgrade' THEN 1 END) AS upgrade_unit`,
      `SUM(CASE WHEN sop.order_type = 'Upgrade' THEN (od.order_paid_amount + od.order_balance_amount) ELSE 0 END) AS upgrade_sale`,
    ];

    const joins = [
      {
        type: "INNER",
        table: `${tables.adminUsers} ad`,
        on: "JSON_CONTAINS(tt.team_member, JSON_ARRAY(ad.admin_user_id))",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: `od.sale_by = ad.admin_user_id AND DATE_FORMAT(od.order_date, '%Y-%m') = '${formattedDate}'`,
      },
      {
        type: "INNER",
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.order_id = od.order_id",
      },
    ];

    const { results } = await readRecord({
      table: `${tables.teamTarget} tt`,
      selectFields,
      joins,
      conditions: [
        {
          field: "DATE_FORMAT(tt.target_month, '%Y-%m')",
          operator: "=",
          value: formattedDate,
        },
      ],
      groupBy: ["ad.admin_user_id", "ad.first_name", "ad.last_name"],
    });
    const data = results.map((i) => {
      const total_target =
        Number(i.ocr_target) +
          Number(i.lead_target) +
          Number(i.active_target) || 0;
      const achieved_amount =
        Number(i.renewal_sale) +
          Number(i.ocr_sale) +
          Number(i.new_sale) +
          Number(i.upgrade_sale) || 0;
      return {
        ...i,
        total_target,
        achieved_amount,
        pending_amount: total_target - achieved_amount,
        percentage: Math.round((achieved_amount / total_target) * 100) || 0,
      };
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Team target details fetched successfully",
      data: data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getSalesOpporunityTarget = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: rateShared } = await readRecord({
      selectFields: [
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Active' THEN 1 END) AS active_user_count`,
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Completed' THEN 1 END) AS oc_user_count`,
        `COUNT(CASE WHEN cd.counsellor_assigned = ${id} AND cd.user_type = '0' THEN 1 END) AS lead_count`,
        `SUM(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Active' THEN sp.suggested_amount ELSE 0 END) AS active_user_sum`,
        `SUM(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Completed' THEN sp.suggested_amount ELSE 0 END) AS oc_user_sum`,
        `SUM(CASE WHEN cd.counsellor_assigned = ${id} AND cd.user_type = '0' THEN sp.suggested_amount ELSE 0 END) AS lead_sum`,
      ],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: `(cd.mentor_assigned = ${id} OR cd.counsellor_assigned = ${id})`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "cd.suggested_program_id", operator: "!=", value: 0 },
        {
          field: "sp.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.suggested_amount", operator: "!=", value: 0 },
        {
          field: "DATE(sp.added_date)",
          operator: "BETWEEN",
          value: [
            moment().startOf("month").format("YYYY-MM-DD"),
            moment().endOf("month").format("YYYY-MM-DD"),
          ],
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    console.log(rateShared, 532);
    const rateSharedResponse = {
      active_unit_count: rateShared[0].active_user_count,
      active_user_sum: rateShared[0].active_user_sum,
      oc_unit_count: rateShared[0].oc_user_count,
      oc_user_sum: rateShared[0].oc_user_sum,
      lead_unit_count: rateShared[0].lead_count,
      lead_sum: rateShared[0].lead_sum,
    };
    const { results: paymentDetailsShared } = await readRecord({
      selectFields: [
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Active' THEN 1 END) AS active_user_count`,
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Completed' THEN 1 END) AS oc_user_count`,
        `COUNT(CASE WHEN cd.counsellor_assigned = ${id} AND cd.user_type = '0' THEN 1 END) AS lead_count`,
        `SUM(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Active' THEN sp.suggested_amount ELSE 0 END) AS active_user_sum`,
        `SUM(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Completed' THEN sp.suggested_amount ELSE 0 END) AS oc_user_sum`,
        `SUM(CASE WHEN cd.counsellor_assigned = ${id} AND cd.user_type = '0' THEN sp.suggested_amount ELSE 0 END) AS lead_sum`,
      ],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: `(cd.mentor_assigned = ${id} OR cd.counsellor_assigned = ${id})`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "cd.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "cd.suggested_program_id", operator: "!=", value: 0 },
        {
          field: "sp.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp.suggested_amount", operator: "!=", value: 0 },
        {
          field: "sp.payment_mode_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "DATE(sp.added_date)",
          operator: "BETWEEN",
          value: [
            moment().startOf("month").format("YYYY-MM-DD"),
            moment().endOf("month").format("YYYY-MM-DD"),
          ],
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
    });
    const paymentDetailsSharedResponse = {
      active_unit_count: paymentDetailsShared[0].active_user_count,
      active_user_sum: paymentDetailsShared[0].active_user_sum,
      oc_unit_count: paymentDetailsShared[0].oc_user_count,
      oc_user_sum: paymentDetailsShared[0].oc_user_sum,
      lead_unit_count: paymentDetailsShared[0].lead_count,
      lead_sum: paymentDetailsShared[0].lead_sum,
    };
    const { results: checkoutVisitCount } = await readRecord({
      selectFields: [
        `COUNT(CASE WHEN cd.user_status = 'Active' THEN 1 END) AS active_checkout_visit_count`,
        `COUNT(CASE WHEN cd.user_status = 'Completed' THEN 1 END) AS ocr_checkout_visit_count`,
        `COUNT(CASE WHEN cd.user_status = 'Lead' THEN 1 END) AS lead_checkout_visit_count`,
      ],
      table: `${tables.inAppPageVisitLog} iapvl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "iapvl.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: `(cd.mentor_assigned = ${id} OR cd.counsellor_assigned = ${id})`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "iapvl.visit_date",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "iapvl.page_type", operator: "=", value: 1 },
      ],
    });
    console.log(checkoutVisitCount, 633);
    const checkoutVisitCountResponse = {
      active_user: checkoutVisitCount[0].active_checkout_visit_count,
      oc_user: checkoutVisitCount[0].ocr_checkout_visit_count,
      lead_user: checkoutVisitCount[0].lead_checkout_visit_count,
    };
    const { results: stageWiseCount } = await readRecord({
      selectFields: [
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Active' THEN 1 END) AS active_user`,
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_status = 'Completed' THEN 1 END) AS oc_user`,
        `COUNT(CASE WHEN cd.mentor_assigned = ${id} AND cd.user_type = '0' THEN 1 END ) AS lead_user`,
      ],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: `(cd.mentor_assigned = ${id} OR cd.counsellor_assigned = ${id})`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `(cd.stage = 3 OR cd.stage = 4)`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
    });
    const stageWiseCountResponse = {
      active_user: stageWiseCount[0].active_user,
      oc_user: stageWiseCount[0].oc_user,
      lead_user: stageWiseCount[0].lead_user,
    };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sales Opportunity fetched successfully",
      data: {
        rateSharedResponse,
        paymentDetailsSharedResponse,
        checkoutVisitCountResponse,
        stageWiseCountResponse,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getBifurcationCounts = async (req, res, next) => {
  const { id } = req.query;
  try {
    const { results: bifurcationResult } = await readRecord({
      selectFields: [
        "COUNT(CASE WHEN cd.sub_user_status = 'Active' THEN 1 END) AS active",
        "COUNT(CASE WHEN cd.sub_user_status = 'notstarted' THEN 1 END) AS not_started",
        "COUNT(CASE WHEN cd.sub_user_status = 'notstarted' AND CURDATE()> sop.start_date THEN 1 END) AS not_started_od",
        "COUNT(CASE WHEN cd.sub_user_status = 'Dormant' THEN 1 END) AS dormant",
        "COUNT(CASE WHEN cd.sub_user_status = 'Onhold' THEN 1 END) AS onhold",
        "COUNT(CASE WHEN cd.sub_user_status = 'Onhold' AND CURDATE()> sop.start_date THEN 1 END) AS onhold_od",
        "COUNT(CASE WHEN cd.sub_user_status = 'Cleanse Active' THEN 1 END) AS cleanse_active",
        "COUNT(CASE WHEN cd.sub_user_status = 'Completed' THEN 1 END) AS completed",
        "COUNT(CASE WHEN cd.sub_user_status = 'Dropout' THEN 1 END) AS dropout",
        "COUNT(CASE WHEN cd.sub_user_status = 'Fs' THEN 1 END) AS fs",
        "COUNT(CASE WHEN cd.user_status = 'Maintenance' THEN 1 END) AS maintenance",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.active_order_id = sop.sub_order_id`,
        },
      ],
      conditions: [
        { field: `cd.mentor_assigned`, operator: "=", value: parseInt(id) },
      ],
    });
    const countResponse = {
      active: bifurcationResult[0].active,
      not_started: bifurcationResult[0].not_started,
      not_started_od: bifurcationResult[0].not_started_od,
      dormant: bifurcationResult[0].dormant,
      onhold: bifurcationResult[0].onhold,
      onhold_od: bifurcationResult[0].onhold_od,
      cleanse_active: bifurcationResult[0].cleanse_active,
      completed: bifurcationResult[0].completed,
      dropout: bifurcationResult[0].dropout,
      fs: bifurcationResult[0].fs,
      maintenance: bifurcationResult[0].maintenance,
    };
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Bifurcation Counts fetched successfully",
      data: countResponse,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getSalesCount = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const { results } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "COUNT(CASE WHEN sop.order_type = 'Renewal' THEN 1 ELSE NULL END) AS renewal_units",
        "SUM(CASE WHEN sop.order_type = 'Renewal' THEN od.order_mrp ELSE 0 END) AS renewal_amount",
        "COUNT(CASE WHEN sop.order_type = 'OCR' THEN 1 ELSE NULL END) AS ocr_units",
        "SUM(CASE WHEN sop.order_type = 'OCR' THEN od.order_mrp ELSE 0 END) AS ocr_amount",
        "COUNT(CASE WHEN sop.order_type = 'New' THEN 1 ELSE NULL END) AS new_units",
        "SUM(CASE WHEN sop.order_type = 'New' THEN od.order_mrp ELSE 0 END) AS new_amount",
        "COUNT(CASE WHEN sop.order_type = 'Upgrade' THEN 1 ELSE NULL END) AS upgrade_units",
        "SUM(CASE WHEN sop.order_type = 'Upgrade' THEN od.order_mrp ELSE 0 END) AS upgrade_amount",
      ],
      conditions: [
        {
          field: "od.sale_by",
          operator: "=",
          value: admin_id,
        },
        {
          field: "MONTH(od.order_date)",
          operator: "=",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: "YEAR(od.order_date)",
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
    });
    const data =
      results && results.length > 0
        ? results[0]
        : {
            renewal_units: 0,
            renewal_amount: 0,
            ocr_units: 0,
            ocr_amount: 0,
            new_units: 0,
            new_amount: 0,
            upgrade_units: 0,
            upgrade_amount: 0,
          };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales count fetched successfully",
      data: data,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching sales count:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const todaysWork = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();
    const todayISO = moment().format("YYYY-MM-DD");

    const queries = await clientEnquiry.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart, $lte: todayEnd },
          mentor_id: admin_id,
        },
      },
      {
        $facet: {
          totalQueries: [{ $count: "count" }],
          pendingQueries: [{ $match: { type: "query" } }, { $count: "count" }],
          sentQueries: [{ $match: { sender: "mentor" } }, { $count: "count" }],
        },
      },
    ]);
    const [
      { results: diet_counts },
      { results: call_counts },
      { results: tracker_counts },
    ] = await Promise.all([
      readRecord({
        table: `${tables.dietSessionLog} dsl`,
        selectFields: [
          `COUNT(CASE WHEN dsl.diet_added_date = '${todayISO}' THEN 1 END) AS total_diet`,
          `COUNT(CASE WHEN dsl.diet_added_date = '${todayISO}' AND dsl.diet_status = 1 THEN 1 END) AS drafted_diet`,
          `COUNT(CASE WHEN dsl.diet_sent_date = '${todayISO}' THEN 1 END) AS send_diet`,
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.active_order_id = dsl.sub_order_id",
          },
        ],
        conditions: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: admin_id,
          },
        ],
      }),
      readRecord({
        table: `${tables.callUpdates} cu`,
        selectFields: [
          `COUNT(CASE WHEN cu.schedule_date BETWEEN '${todayStart.toISOString()}' AND '${todayEnd.toISOString()}' AND cu.call_status = 0 THEN 1 END) AS call_due`,
          `COUNT(CASE WHEN cu.schedule_date < '${todayStart.toISOString()}' AND cu.call_status = 0 THEN 1 END) AS call_missed`,
          `COUNT(CASE WHEN cu.schedule_date = '${todayISO}' AND cu.call_status = 1 THEN 1 END) AS call_done`,
        ],
        conditions: [
          {
            field: "cu.added_by",
            operator: "=",
            value: admin_id,
          },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          `COUNT(CASE WHEN wr.posted_date = '${todayISO}' OR ir.posted_date = '${todayISO}' OR pr.posted_date = '${todayISO}' THEN 1 END) AS tracker_received`,
          `COUNT(CASE WHEN wr.ack_date = '${todayISO}' OR ir.ack_date = '${todayISO}' OR pr.ack_date = '${todayISO}' THEN 1 END) AS acknowledged_date`,
          `COUNT(CASE WHEN wr.user_id IS NULL OR ir.user_id IS NULL OR pr.user_id IS NULL THEN 1 ELSE 0 END) AS pending_tracker`,
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.weightRecords} wr`,
            on: "ud.user_id = wr.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.inchRecords} ir`,
            on: "ud.user_id = ir.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.photoRecords} pr`,
            on: "ud.user_id = pr.user_id",
          },
        ],
        conditions: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: admin_id,
          },
        ],
      }),
    ]);
    const queryStats = queries[0] || {};
    const totalQueriesCount = queryStats.totalQueries?.[0]?.count || 0;
    const pendingQueriesCount = queryStats.pendingQueries?.[0]?.count || 0;
    const sentQueriesCount = queryStats.sentQueries?.[0]?.count || 0;

    // Combine Results
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Today's Work Fetched Successfully",
      data: {
        totalQueriesCount,
        pendingQueriesCount,
        sentQueriesCount,
        ...diet_counts[0],
        ...call_counts[0],
        ...tracker_counts[0],
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching today's work:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteTeam = async (req, res, next) => {
  const { id: teamId } = req.params;
  try {
    const deletedResult = await deleteRecords(tables.teamTarget, teamId, {
      id: teamId,
    });
    if (deletedResult.success === false) {
      return next(new ErrorHandler(deletedResult.message, 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Team deleted successfully",
      data: deletedResult.data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error deleting team:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAdminTarget = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: [
        "ad.lead_target",
        "ad.lead_units",
        "ad.active_target",
        "ad.active_units",
        "ad.ocr_target",
        "ad.ocr_units",
      ],
      conditions: [
        { field: "ad.admin_user_id", operator: "=", value: admin_id },
      ],
    });
    const { results: orderDetails } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "SUM(od.order_paid_amount) as 'total_paid_amount'",
        "COUNT(od.order_id) as 'achieved_unit'",
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: admin_id },
        {
          field: "date(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    const { results: productEarning } = await readRecord({
      table: `${tables.productOrders} po`,
      selectFields: [
        "SUM(po.total_price)*0.05 as 'total_paid_amount'",
        "COUNT(po.razorpay_payment_id) as 'achieved_unit'",
      ],
      conditions: [
        { field: "po.sold_by", operator: "=", value: admin_id },
        {
          field: "date(po.created_at)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
        {
          field: "po.payment_method",
          operator: "!=",
          value: "free",
        },
        { field: "po.payment_status", operator: "NOT IN", value: "('Failed', 'Pending')", raw:true }
      ],
    });

    const { results: fourteenDayEarning } = await readRecord({
      table: `(
          SELECT
              od.user_id,
              DATE(od.order_date) AS order_day,
              GROUP_CONCAT(DISTINCT od.order_id) AS bundle_order_ids,
              SUM(sop.paid_amount) AS total_amount,
              COUNT(DISTINCT ps.validity) AS validity_count
          FROM ${tables.orderDetails} od
          LEFT JOIN ${tables.subOrderPrograms} sop 
              ON od.order_id = sop.order_id
          LEFT JOIN ${tables.programSession} ps 
              ON sop.program_session_id = ps.program_session_id
          WHERE od.sale_by = ${admin_id}
            AND sop.program_type = 1
            AND od.order_type != 'Free'
            AND ps.validity IN (1,3,10)
            AND DATE(od.order_date) BETWEEN
                  '${moment().startOf("month").format("YYYY-MM-DD")}' AND
                  '${moment().endOf("month").format("YYYY-MM-DD")}'
          GROUP BY od.user_id, DATE(od.order_date)
          HAVING COUNT(DISTINCT ps.validity) = 3
        ) AS x`,
      selectFields: [
        "SUM(x.total_amount * 0.10) AS total_fourteen_day_earnings",
        "COUNT(*) AS total_fourteen_day_units",
        "GROUP_CONCAT(x.bundle_order_ids) AS fourteen_day_order_ids"
      ]
    });



    console.log(fourteenDayEarning, 'Fourteen Day Earnings'); 
    let fourteenDayEarningIds ;

    if (fourteenDayEarning?.length>0) {
     fourteenDayEarningIds =fourteenDayEarning[0]?.fourteen_day_order_ids?.split(",").map(id => id.trim()) || [];
    }

    console.log(typeof fourteenDayEarningIds, fourteenDayEarningIds, 'EARNINGS IDS')

    const { results: cleanseEarning } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "SUM(sop.paid_amount)*0.05 as 'cleanse_earning'",
        "COUNT(od.order_id) as 'cleanse_earning_unit'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: admin_id },
        { field: "sop.program_type", operator: "=", value: 1 },
        { field: "od.order_type", operator: "!=", value: "Free" },
        { field: "sop.program_id", operator: "NOT IN", value: [117,118,125,126,127,128,129,130,157,170,171] },
        {
          field: "date(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
        ...(fourteenDayEarningIds.length > 0? [{field: "od.order_id",operator: "NOT IN",value: fourteenDayEarningIds} ]: []),
      ],
    });
    const { results: tendayEarning } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: [
        "SUM(sop.paid_amount)*0.10 as 'ten_earning'",
        "COUNT(od.order_id) as 'ten_earning_unit'",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: [
        { field: "od.sale_by", operator: "=", value: admin_id },
        { field: "sop.program_type", operator: "=", value: 1 },
        { field: "od.order_type", operator: "!=", value: "Free" },
        { field: "sop.program_id", operator: "IN", value: [117,118,125,126,127,128,129,130,157,170,171] },
        ...(fourteenDayEarningIds.length > 0? [{field: "od.order_id",operator: "NOT IN",value: fourteenDayEarningIds} ]: []),
        {
          field: "date(od.order_date)",
          operator: "BETWEEN",
          value: [
            `${moment().startOf("month").format("YYYY-MM-DD")}`,
            `${moment().endOf("month").format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    const { results: commissionData } = await readRecord({
      table: `${tables.adminCommission} ac`,
      selectFields: ["ac.commission"],
      conditions: [
        { field: "ac.admin_id", operator: "=", value: admin_id },
        {
          field: "DATE(ac.added_date)",
          operator: ">=",
          value: `${moment()
            .subtract(1, "month")
            .startOf("month")
            .format("YYYY-MM-DD")}`,
        },
      ],
      orderBy: ["ac.added_date ASC"],
    });
    const total_amount =
      Number(results[0].lead_target) +
      Number(results[0].active_target) +
      Number(results[0].ocr_target);
    const total_unit =
      Number(results[0].lead_units) +
      Number(results[0].active_units) +
      Number(results[0].ocr_units);

    let current_month_commission = 0;
    let previous_month_commission = 0;
    commissionData.forEach((item) => {
      const itemDate = moment(item.added_date);
      if (itemDate.isSame(moment(), "month")) {
        current_month_commission += Number(item.commission);
      } else if (itemDate.isSame(moment().subtract(1, "month"), "month")) {
        previous_month_commission += Number(item.commission);
      }
    });
    console.log(parseFloat(fourteenDayEarning[0].total_fourteen_day_earnings || 0), "HELLLLLOOOOOO")
    const data = {
      total_target: {
        amount: total_amount,
        unit: total_unit,
      },
      achieved: {
        amount: Number(orderDetails[0].total_paid_amount),
        unit: Number(orderDetails[0].achieved_unit),
      },
      pending: {
        amount:
          Number(total_amount) - Number(orderDetails[0].total_paid_amount),
        unit: Number(total_unit) - Number(orderDetails[0].achieved_unit),
      },
      commission: {
        current_month: current_month_commission,
        previous_month: previous_month_commission,
      },
      cleanse_earning: {
        amount: parseFloat(parseFloat(cleanseEarning[0].cleanse_earning || 0) + parseFloat(tendayEarning[0].ten_earning || 0) + parseFloat(fourteenDayEarning[0].total_fourteen_day_earnings || 0)).toFixed(2),
        unit: Number(cleanseEarning[0].cleanse_earning_unit)+Number(tendayEarning[0].ten_earning_unit + Number(fourteenDayEarning[0].total_fourteen_day_units)),
      },
      product_earning: {
        amount: Number(productEarning[0].total_paid_amount),
        unit: Number(productEarning[0].achieved_unit),
      },
    };
    return res.status(200).json(
      new ApiResponse({
        message: "Individual Target Details By admin Fetched Successfully",
        data,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const editIndividualTargetController = async (req, res, next) => {
  try {
    const {
      admin_id,
      lead_target,
      active_target,
      ocr_target,
      lead_required,
      lead_units,
      active_units,
      ocr_units,
    } = req.body;

    if (
      !admin_id ||
      lead_target === undefined ||
      active_target === undefined ||
      ocr_target === undefined
    ) {
      return next(
        new ErrorHandler("All required fields must be provided", 400)
      );
    }

    const updatedData = {
      lead_target,
      active_target,
      ocr_target,
      lead_required,
      lead_units,
      active_units,
      ocr_units,
    };

    const condition = { admin_user_id: Number(admin_id) };
    const updateResult = await updateRecord(
      tables.adminUsers,
      updatedData,
      condition
    );

    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Mentor update failed", 400));
    }

    const { results: mentorResults } = await readRecord({
      table: tables.adminUsers,
      selectFields: ["team_id"],
      conditions: [{ field: "admin_user_id", operator: "=", value: admin_id }],
    });

    if (!mentorResults || mentorResults.length === 0) {
      return next(new ErrorHandler("Mentor not found", 404));
    }

    const teamId = mentorResults[0].team_id;

    if (!teamId) {
      return next(new ErrorHandler("Mentor is not assigned to a team", 400));
    }

    const { results: teamMembers } = await readRecord({
      table: tables.adminUsers,
      selectFields: ["lead_target", "active_target", "ocr_target"],
      conditions: [{ field: "team_id", operator: "=", value: teamId }],
    });

    const totalTarget = teamMembers.reduce((acc, member) => {
      const lead = Number(member.lead_target) || 0;
      const active = Number(member.active_target) || 0;
      const ocr = Number(member.ocr_target) || 0;
      return acc + lead + active + ocr;
    }, 0);

    const updateTeam = await updateRecord(
      tables.teamTarget,
      { total_target: totalTarget },
      { id: teamId }
    );

    if (updateTeam.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update team target", 400));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Mentor target updated and team target recalculated successfully",
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in editIndividualTargetController:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getIndividualTarget = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    const { results } = await readRecord({
      table: tables.adminUsers,
      selectFields: [
        "admin_user_id",
        "lead_target",
        "active_target",
        "ocr_target",
        "lead_required",
        "lead_units",
        "active_units",
        "ocr_units",
        "team_id",
      ],
      conditions: [{ field: "admin_user_id", operator: "=", value: admin_id }],
    });

    if (!results || results.length === 0) {
      return next(new ErrorHandler("Client not found", 404));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client target fetched successfully",
      data: results[0],
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getSingleClientTargetController:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addTeamController,
  getAdminTarget,
  editTeamController,
  getAllTeams,
  getAllTotalBalance,
  getAllTotalBalanceOd,
  getBifurcationCounts,
  getCompanyTarget,
  getCompanyTargetDetails,
  getIndividualTeamTargets,
  getSalesCount,
  getSalesOpporunityTarget,
  todaysWork,
  deleteTeam,
  editIndividualTargetController,
  getIndividualTarget,
};
