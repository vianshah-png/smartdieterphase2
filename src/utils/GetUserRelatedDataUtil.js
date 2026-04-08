import { readRecord } from "./../config/query.js";
import { tables } from "../helper/constant.js";
async function getUserRelatedDataUtil({
  user_ids = [],
  additionalselectFields = [],
  search = false,
  searchQuery = "",
  searchFields = [],
  paginate = false,
  includeProgramDetails = true,
  includeWeightDetails = true,
  includeSuggestedDetails = true,
  page,
  limit,
  additionalJoins = [],
  additionalConditions = [],
  additionalGroupBy = [],
  additionalOrderBy = [],
}) {
  try {
    const selectFields = [
      "ud.user_id as client_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id as client_email",
      "ud.phone as client_phone",
      "ud.sub_user_status as client_sub_user_status",
      "ud.active_order_id as client_active_order_id",
      "uad.first_name as mentor_assigned",
      "uad.official_phone as mentor_assigned_phone",
      "paym.payment_mode_name as current_program_payment_mode",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
    ];
    const conditions = [
      {
        field: "ud.user_id",
        operator: "IN",
        value: user_ids,
      },
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.adminUsers} uad`,
        on: "uad.admin_user_id = ud.mentor_assigned",
      },
    ];
    const orderBy = [];
    const groupBy = [];

    if (includeProgramDetails) {
      joins.push(
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.order_id  = sop.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} paym`,
          on: "od.payment_mode = paym.payment_mode_id",
        }
      );
      selectFields.push(
        "pm.program_name as current_program",
        "(sop.total_sessions * 10) as current_program_duration",
        "sop.total_sessions as current_program_total_sessions",
        "sop.sent_sessions as current_program_sent_sessions",
        "sop.mrp as current_program_mrp",
        "sop.paid_amount as current_program_paid_amount",
        "sop.discount as current_program_discount",
        "sop.balance_amount as current_program_balance_amount",
        "sop.created_at as current_program_bought_date",
        "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
        "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
        "sop.start_date as current_program_start_date",
        "sop.start_date_added_by as current_program_start_date_set_by"
      );
    }

    if (includeSuggestedDetails) {
      joins.push(
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} spm`,
          on: "sp.program_id = spm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} sps`,
          on: "sps.program_session_id = sp.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} sad`,
          on: "sad.admin_user_id = sp.suggested_by",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} sp_paym`,
          on: "sp.payment_mode_id  = sp_paym.payment_mode_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} sp_pl`,
          on: "sp.payment_link_id= sp_pl.id",
        }
      );
      selectFields.push(
        "sp.program_id as suggested_program_id",
        "sp.program_session_id as suggested_program_session_id",
        "spm.program_name as suggested_program_name",
        "sp.program_days as suggested_program_days",
        "sps.mrp as suggested_mrp",
        "sp.suggested_amount as suggested_amount",
        "sp_paym.payment_mode_name as suggested_payment_mode_name",
        "sp_paym.payment_mode_details as suggested_payment_mode_details",
        "sp.payment_expiry as suggested_payment_expiry",
        "sp.payment_link_id as suggested_payment_link_id",
        "sp.added_date as suggested_at",
        "CONCAT(sad.first_name,' ',sad.last_name) as suggested_by",
        "sp.mentor_note as suggested_mentor_note",
        "sp.motivation_level as suggested_motivation_level",
        "sp.status as suggested_sale_status",
        "sp_pl.payment_link as suggested_payment_link"
      );
    }
    if (additionalselectFields.length > 0) {
      selectFields.push(...additionalselectFields);
    }
    if (additionalJoins.length > 0) {
      joins.push(...additionalJoins);
    }
    if (additionalConditions.length > 0) {
      conditions.push(...additionalConditions);
    }
    if (additionalGroupBy.length > 0) {
      groupBy.push(...additionalGroupBy);
    }
    if (additionalOrderBy.length > 0) {
      orderBy.push(...additionalOrderBy);
    }

    if (includeWeightDetails) {
      selectFields.push(
        "sop.start_program_weight as program_start_weight",
        "ud.latest_weight",
        "ud.height",
        "aspd.goal_weight as goal_weight"
      );
      joins.push({
        type: "LEFT",
        table: `${tables.assessment_personal_details} aspd`,
        on: "ud.user_id = aspd.user_id",
      });
    }
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      ...(conditions.length && { conditions }),
      ...(joins.length > 0 && { joins }),
      ...(groupBy.length > 0 && { groupBy }),
      ...(orderBy.length > 0 && { orderBy }),
      ...(search && { search: { searchQuery, searchFields } }),
      ...(paginate && { pagination: { limit, page } }),
      countTotal: paginate,
    });

    return { results, ...(paginate ? { totalCount } : null) };
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export { getUserRelatedDataUtil };
