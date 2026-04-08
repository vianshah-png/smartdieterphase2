import moment from "moment";
import { tables } from "../../helper/constant.js";
import {
  getFormattedLeadData,
  getFormattedUserData,
} from "../../helper/mentordbHelpers.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getActivePaymentLinks = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id } = req.query;
    const user_type = String(req.query.user_type).toLowerCase();

    const dataFunc =
      user_type === "lead" ? getFormattedLeadData : getFormattedUserData;
    const conditions = [
      {
        field: "pl.expiry_at",
        operator: ">=",
        value: "CURDATE()",
        raw: true,
      },
      {
        field: "pl.payment_status",
        operator: "=",
        value: "pending",
      },
    ];

    if (user_type === "lead") {
      conditions.push(
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        }
      );
    }

    if (user_type === "active" || user_type === "oc") {
      conditions.push(
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "active" ? "Active" : "Completed",
        }
      );
    }

    const { data, total_page } = await dataFunc({
      search,
      page,
      limit,
      extraSelectFields: [
        "pl.id as pl_payment_link_id",
        "pl.expiry_at as payment_link_expiry",
        "g.guide as pl_guide",
        "s.service_name as pl_service",
        "pl_pm.program_name as pl_program",
        "pl_ps.program_sessions as pl_session",
        "pl.amount as pl_amount",
        "pl.payment_link as pl_payment_link",
        "pl.created_at as pl_created_at",
      ],
      extraConditions: conditions,
      extraOrderBy: ["pl.expiry_at DESC"],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.guides} g`,
          on: "pl.guide_id = g.guide_id",
        },
        {
          type: "LEFT",
          table: `${tables.Services} s`,
          on: "pl.service_id = s.id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pl_pm`,
          on: "pl_pm.program_id = pl.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} pl_ps`,
          on: "pl_ps.program_session_id = pl.program_session_id",
        },
      ],
      extraGroupBy: ["pl.id"],
      extraObjects: (i) => {
        const expiry_at = `${moment(i.payment_link_expiry).format(
          "DD-MM-YYYY"
        )} ${moment(i.payment_link_expiry).fromNow()}`;
        const createdAt = moment(i.created_at).format("DD-MM-YYYY");
        return {
          payment_link_details: {
            payment_id: i.pl_payment_link_id,
            ...(i.pl_guide && { guide: i.pl_guide }),
            ...(i.pl_service && { service: i.pl_service }),
            ...(i.pl_program && {
              program_name: i.pl_program,
              program_session: i.pl_session,
            }),
            amount: i.pl_amount,
            payment_link_expiry: expiry_at,
            payment_link: i.pl_payment_link,
            created_at: createdAt,
          },
        };
      },
      ...(user_type === "active" && { include_weight_details: false }),
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Active Payment Links Fetched Successfully",
        data: data,
        totalCount: total_page,
        hide_columns: ["weight_details"],
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getExpiredPaymentLinks = async (req, res, next) => {
  try {
    const { page, limit, search, mentor_id, start_date, end_date } = req.query;
    const user_type = String(req.query.user_type).toLowerCase();

    const dataFunc =
      user_type === "lead" ? getFormattedLeadData : getFormattedUserData;
    const conditions = [
      {
        field: "pl.expiry_at",
        operator: "<",
        value: "CURDATE()",
        raw: true,
      },
      {
        field: "pl.payment_status",
        operator: "=",
        value: "pending",
      },
    ];

    if (user_type === "lead") {
      conditions.push(
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: "Lead",
        }
      );
    }

    if (user_type === "active" || user_type === "oc") {
      conditions.push(
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
        {
          field: "ud.user_status",
          operator: "=",
          value: user_type === "active" ? "Active" : "Completed",
        }
      );
    }
    if (start_date && end_date) {
      conditions.push({
        field: "pl.expiry_at",
        operator: "BETWEEN",
        value: [start_date, end_date],
      });
    } else {
      conditions.push({
        field: "pl.expiry_at",
        operator: ">=",
        value: `${moment().startOf("month").format("YYYY-MM-DD")}`,
      });
    }

    const { data, total_page } = await dataFunc({
      search,
      page,
      limit,
      extraSelectFields: [
        "pl.id as pl_payment_link_id",
        "pl.expiry_at as payment_link_expiry",
        "g.guide as pl_guide",
        "s.service_name as pl_service",
        "pl_pm.program_name as pl_program",
        "pl_ps.program_sessions as pl_session",
        "pl.amount as pl_amount",
        "pl.payment_link as pl_payment_link",
        "pl.created_at as pl_created_at",
      ],
      extraConditions: conditions,
      extraOrderBy: ["pl.expiry_at DESC"],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.guides} g`,
          on: "pl.guide_id = g.guide_id",
        },
        {
          type: "LEFT",
          table: `${tables.Services} s`,
          on: "pl.service_id = s.id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pl_pm`,
          on: "pl_pm.program_id = pl.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} pl_ps`,
          on: "pl_ps.program_session_id = pl.program_session_id",
        },
      ],
      extraGroupBy: ["pl.id"],
      extraObjects: (i) => {
        const expiry_at = `${moment(i.payment_link_expiry).format(
          "DD-MM-YYYY"
        )} ${moment(i.payment_link_expiry).fromNow()}`;
        const createdAt = moment(i.created_at).format("DD-MM-YYYY");
        return {
          payment_link_details: {
            payment_id: i.pl_payment_link_id,
            ...(i.pl_guide && { guide: i.pl_guide }),
            ...(i.pl_service && { service: i.pl_service }),
            ...(i.pl_program && {
              program_name: i.pl_program,
              program_session: i.pl_session,
            }),
            amount: i.pl_amount,
            payment_link_expiry: expiry_at,
            payment_link: i.pl_payment_link,
            created_at: createdAt,
          },
        };
      },
      ...(user_type === "active" && { include_weight_details: false }),
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Active Payment Links Fetched Successfully",
        data: data,
        totalCount: total_page,
        hide_columns: ["weight_details"],
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getActivePaymentLinks, getExpiredPaymentLinks };
