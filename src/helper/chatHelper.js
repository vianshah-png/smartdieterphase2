import { tables } from "./constant.js";

const ActiveUserChatConditions = ({ filters, parsedAdminId }) => {
  const joins = [];
  const conditions = [
    {
      field: "ud.user_status",
      operator: "=",
      value: "Active",
    },
    {
      field: "ud.mentor_assigned",
      operator: "=",
      value: parsedAdminId,
    },
  ];
  if (filters === "expiring_this_month") {
    joins.push({
      type: "LEFT",
      table: `${tables.subOrderPrograms} sop`,
      on: "ud.active_order_id = sop.sub_order_id",
    });
    conditions.push(
      {
        field: "MONTH(sop.expiry_date)",
        operator: "=",
        value: "MONTH(CURDATE())",
        raw: true,
      },
      {
        field: "YEAR(sop.expiry_date)",
        operator: "=",
        value: "YEAR(CURDATE())",
        raw: true,
      }
    );
  }
  if (filters === "pending_1/2") {
    joins.push({
      type: "LEFT",
      table: `${tables.subOrderPrograms} sop`,
      on: "ud.active_order_id = sop.sub_order_id",
    });
    conditions.push({
      field: "(sop.pending_session = 1 OR sop.pending_session = 2)",
      operator: "",
      value: "",
      raw: true,
    });
  }
  if (filters === "tailend") {
    joins.push(
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} adv_sop`,
        on: "ud.user_id = adv_sop.user_id AND adv_sop.program_status = '4'",
      }
    );
    conditions.push(
      {
        field: "sop.pending_session",
        operator: "=",
        value: "3",
      },
      {
        field: "adv_sop.sub_order_id",
        operator: "IS",
        value: "NULL",
        raw: true,
      }
    );
  }
  if (filters === "10_day") {
    joins.push({
      type: "LEFT",
      table: `${tables.dietSessionLog} dsl`,
      on: "sop.sub_order_id = dsl.sub_order_id AND sop.sent_sessions  = dsl.session ",
    });
    conditions.push({
      field: "DATEDIFF(dsl.diet_start_date , CURDATE())",
      operator: "=",
      value: "10",
      raw: true,
    });
  }
  if (filters === "5_day") {
    joins.push({
      type: "LEFT",
      table: `${tables.dietSessionLog} dsl`,
      on: "sop.sub_order_id = dsl.sub_order_id AND sop.sent_sessions  = dsl.session ",
    });
    conditions.push({
      field: "DATEDIFF(dsl.diet_start_date , CURDATE())",
      operator: "=",
      value: "5",
      raw: true,
    });
  }
  if (filters === "pending_draft") {
    joins.push({
      type: "LEFT",
      table: `${tables.draftedQueries}`,
      on: "dq.user_id = ud.user_id",
    });
    conditions.push({
      field: "dq.id",
      operator: "IS NOT",
      value: "NULL",
      raw: true,
    });
  }

  return { joins, conditions };
};

const OcUserChatConditions = ({ filters, parsedAdminId }) => {
  const joins = [];
  const conditions = [
    {
      field: "ud.user_status",
      operator: "=",
      value: "Completed",
    },
    {
      field: "ud.mentor_assigned",
      operator: "=",
      value: parsedAdminId,
    },
  ];

  if (filters === "call_booked") {
    joins.push({
      type: "LEFT",
      table: `${tables.callUpdates} cu`,
      on: "ud.user_id = cu.user_id",
    });
    conditions.push({
      field: "cu.schedule_date",
      operator: "=",
      value: "CURDATE()",
      raw: true,
    });
  }
  if (filters === "ocl") {
    joins.push({
      type: "LEFT",
      table: `${tables.leadSourceLog} lsl`,
      on: "ud.user_id = lsl.user_id",
    });
    conditions.push({
      field: "MONTH(lsl.updated_at)",
      operator: "=",
      value: "MONTH(CURDATE())",
      raw: true,
    });
  }
  if (filters === "page_visit") {
    joins.push({
      type: "LEFT",
      table: `${tables.inAppPageVisitLog} iapvl`,
      on: "ud.user_id = iapvl.user_id",
    });
    conditions.push(
      {
        field: "iapvl.page_type",
        operator: "=",
        value: "1",
        raw: true,
      },
      {
        field: "iapvl.visit_date",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      }
    );
  }
  if (filters === "checkout_visit") {
    joins.push({
      type: "LEFT",
      table: `${tables.inAppPageVisitLog} iapvl`,
      on: "ud.user_id = iapvl.user_id",
    });
    conditions.push(
      {
        field: "iapvl.page_type",
        operator: "=",
        value: "2",
        raw: true,
      },
      {
        field: "iapvl.visit_date",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      }
    );
  }
  if (filters === "health_score") {
    joins.push({
      type: "LEFT",
      table: `${tables.healthScoreClient} hs`,
      on: "ud.user_id = hs.user_id",
    });
    conditions.push({
      field: "hs.created",
      operator: "=",
      value: "CURDATE()",
      raw: true,
    });
  }
  return { conditions, joins };
};

const LeadChatConditions = ({ filters, parsedAdminId }) => {
  const conditions = [
    {
      field: "ud.user_status",
      operator: "=",
      value: "Lead",
    },
    {
      field: "ud.counsellor_assigned",
      operator: "=",
      value: parsedAdminId,
    },
  ];
  const joins = [];

  if (filters === "hot") {
    conditions.push({
      field: "ud.sales_status",
      operator: "=",
      value: 2,
    });
  }
  if (filters === "warm") {
    conditions.push({
      field: "ud.sales_status",
      operator: "=",
      value: 3,
    });
  }
  if (filters === "cold") {
    conditions.push({
      field: "ud.sales_status",
      operator: "=",
      value: 4,
    });
  }
  if (filters === "call_booked") {
    joins.push({
      type: "LEFT",
      table: `${tables.callUpdates} cu`,
      on: "ud.user_id = cu.user_id",
    });
    conditions.push({
      field: "cu.schedule_date",
      operator: "=",
      value: "CURDATE()",
      raw: true,
    });
  }
  if (filters === "page_visit") {
    joins.push({
      type: "LEFT",
      table: `${tables.inAppPageVisitLog} iapvl`,
      on: "ud.user_id = iapvl.user_id",
    });
    conditions.push(
      {
        field: "iapvl.page_type",
        operator: "=",
        value: "1",
        raw: true,
      },
      {
        field: "iapvl.visit_date",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      }
    );
  }
  if (filters === "checkout_visit") {
    joins.push({
      type: "LEFT",
      table: `${tables.inAppPageVisitLog} iapvl`,
      on: "ud.user_id = iapvl.user_id",
    });
    conditions.push(
      {
        field: "iapvl.page_type",
        operator: "=",
        value: "2",
        raw: true,
      },
      {
        field: "iapvl.visit_date",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      }
    );
  }
  if (filters === "health_score") {
    joins.push({
      type: "LEFT",
      table: `${tables.healthScoreClient} hs`,
      on: "ud.user_id = hs.user_id",
    });
    conditions.push({
      field: "hs.created",
      operator: "=",
      value: "CURDATE()",
      raw: true,
    });
  }
  return { conditions, joins };
};

export { ActiveUserChatConditions, OcUserChatConditions, LeadChatConditions };
