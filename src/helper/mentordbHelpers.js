import moment from "moment";
import { readRecord, readRecordUnion } from "../config/query.js";
import { healthData, leadSources, tables } from "./constant.js";
import { calculateAge } from "./commonHelper.js";
import { raw } from "express";

const howzmyDayActiveFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'active_assigned' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: `Active`,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
          {
            orConditions: [
              {
                field: "sop.order_type",
                operator: "=",
                value: "New",
              },
              {
                field: "sop.order_type",
                operator: "=",
                value: "OCR",
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'not_started' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          // {
          //   field: "sop.start_date",
          //   operator: "=",
          //   value: `${moment().format("YYYY-MM-DD")}`,
          // },
          {
            field: "sop.start_date_added_by",
            operator: "<>",
            value: `0`,
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [`COUNT(DISTINCT ass.user_id) AS count`, "'NAF' as type"],
        join: [
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: `ass.user_id = ud.user_id`,
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: "0",
          },
          {
            field: "ass.completion_status",
            operator: "=",
            value: 2,
          },
          {
            field: "ass.added_date >= NOW() - INTERVAL 1440 HOUR",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: ["COUNT(DISTINCT iclr.user_id) AS count", "'ICL' AS type"],
        join: [
          {
            type: "LEFT",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: `iclr.user_id = ud.user_id`,
          },
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: "0",
          },
          {
            field: "iclr.completion_status",
            operator: "=",
            value: 2,
          },
          {
            field: "iclr.added_date >= NOW() - INTERVAL 1440 HOUR",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'pending_diet' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} adv_sop`,
            on: "ud.user_id = adv_sop.user_id AND adv_sop.program_status = '4'",
          },
          {
            type: "INNER",
            table: `${tables.weightRecords} wr`,
            on: "wr.sub_order_id = sop.sub_order_id AND sop.sent_sessions = wr.session",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions + 1 = dsl.session",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            orConditions: [
              {
                field:
                  "(adv_sop.sub_order_id IS NULL AND sop.sent_sessions <> sop.total_sessions)",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: "adv_sop.sub_order_id",
                operator: "IS NOT",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            orConditions: [
              {
                field: "wr.days",
                operator: "=",
                value: 10,
              },
              {
                field: "sop.sent_sessions",
                operator: "=",
                value: 0,
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT dsl.diet_id) as count",
          "'drafted_diet' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id AND sop.total_sessions <> sop.sent_sessions",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session",
          },
        ],
        condition: [
          {
            field: "dsl.diet_status",
            operator: "=",
            value: "1",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'pre_attempted_diet' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl_next`,
            on: "dsl_next.sub_order_id = sop.sub_order_id AND dsl_next.session = sop.sent_sessions + 1",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: "dsl.session",
            raw: true,
          },
          {
            field: "sop.sent_sessions",
            operator: "!=",
            value: "sop.total_sessions",
            raw: true,
          },
          {
            field: "dsl.end_session_weight",
            operator: "=",
            value: "0",
            raw: true,
          },
          {
            field:
              "((dsl_next.diet_status = 2 AND dsl_next.diet_id IS NOT NULL) OR (dsl.session = 1 AND dsl.diet_status != 4))",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.draftedQueries} dq`,
        selectField: ["COUNT( dq.user_id) as count", "'drafted_query' as type"],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = dq.user_id",
          },
        ],
        condition: [
          {
            field: "dq.mentor_id",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

//howsMyDay
const howsMyDayActiveFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'new_assigned_clients' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: "sop.sub_order_id = ass.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: `iclr.active_order_id = ud.active_order_id`,
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "sop.sent_sessions", operator: "=", value: 0 },
          {
            orConditions: [
              { field: "sop.order_type", operator: "=", value: "New" },
              { field: "sop.order_type", operator: "=", value: "OCR" },
            ],
          },

          {
            field: "Date(sop.updated_at)",
            operator: ">=",
            value: "DATE_SUB(NOW(), INTERVAL 30 DAY)",
            raw: true,
          },
          {
            orConditions: [
              {
                field: "ass.assessment_id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
              {
                field: "ass.completion_status",
                operator: "!=",
                value: "2",
                raw: true,
              },
              {
                field: "iclr.ingredient_checklist_id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
              {
                field: "iclr.completion_status",
                operator: "!=",
                value: "2",
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'client_expiring_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "DATE(sop.expiry_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"), // <-- today
          },
        ],
      },
      // 2. Diets Pending
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'diets_pending' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} adv_sop`,
            on: "ud.user_id = adv_sop.user_id AND adv_sop.program_status = '4'",
          },
          {
            type: "LEFT",
            table: `${tables.weightRecords} wr`,
            on: "wr.sub_order_id = sop.sub_order_id AND sop.sent_sessions = wr.session",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions + 1 = dsl.session",
          },
          {
            table: `${tables.ingredientChecklistRecords} iclr`,
            type: "LEFT",
            on: "iclr.user_id = ud.user_id AND iclr.active_order_id = ud.active_order_id",
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ud.sub_user_status", operator: "IN", value: ["Active"] },

          {
            orConditions: [
              { field: "iclr.completion_status", operator: "=", value: "2" },
              {
                field: "ud.last_screen_visited",
                operator: "IN",
                value: ["e-kit", "my_profile", "bn_ekit"],
              },
            ],
          },
          {
            field: "sop.sent_sessions <> sop.total_sessions",
            operator: "",
            value: "",
            raw: true,
          },
          {
            orConditions: [
              {
                field:
                  "(adv_sop.sub_order_id IS NULL AND sop.sent_sessions <> sop.total_sessions)",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: "adv_sop.sub_order_id",
                operator: "IS NOT",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            orConditions: [
              {
                field: "date(sop.start_date)",
                operator: ">=",
                value: "now()",
              },
              {
                field: "date(adv_sop.start_date)",
                operator: ">=",
                value: "now()",
              },
            ],
          },
          {
            orConditions: [
              { field: "wr.days", operator: "=", value: 10 },
              {
                field: "sop.sent_sessions",
                operator: "=",
                value: 0,
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.dietFeedback} df`,
        selectField: [
          "COUNT(DISTINCT df.user_id) AS count",
          "'diet_feedback' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT df.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "df.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "df.is_ack", operator: "=", value: 0 },
          {
            // Extract and cast the answer from the first question
            field: `CAST(JSON_UNQUOTE(JSON_EXTRACT(df.result, '$[0].answer')) AS UNSIGNED)`,
            operator: "<=",
            value: 4,
            raw: true,
          },
          {
            field: "DATE(df.created_at)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT dsl.diet_id) as count",
          "'diets_drafted' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id AND sop.total_sessions <> sop.sent_sessions",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND sop.sent_sessions + 1 = dsl.session",
          },
        ],
        condition: [
          {
            field: "dsl.diet_status",
            operator: "=",
            value: "1",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.draftedQueries} dq`,
        selectField: [
          "COUNT( dq.user_id) as count",
          "'drafted_query' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT dq.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = dq.user_id",
          },
        ],
        condition: [
          {
            field: "dq.mentor_id",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "dq.draft_text",
            operator: "NOT IN",
            value: '("")',
            raw: true,
          },
          {
            field: "ud.user_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'calls' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          {
            field: "cu.call_type",
            operator: "NOT IN",
            value: `('14','45','6')`,
            raw: true,
          },
          {
            orConditions: [
              {
                field: "hf.mentor_star_rating",
                operator: "<=",
                value: "4",
              },
              {
                field: "ff.rate_mentor",
                operator: "<=",
                value: "4",
              },
              {
                field: "df.result",
                operator: "NOT LIKE",
                value: '"5"',
                raw: true,
              },
            ],
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.halfTimeFeedback} hf`,
            on: "hf.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.finalFeedback} ff`,
            on: "ff.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietFeedback} df`,
            on: "df.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.changeOfMentor} com`,
        selectField: [
          "COUNT(DISTINCT com.user_id) as count",
          "'com_clients' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = com.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.callUpdates} cu`,
            on: `ud.user_id = cu.user_id AND DATE(cu.schedule_date) >= date(com.added_date) and cu.added_by=${mentor_id}`,
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "com.old_mentor", operator: "<>", value: "com.new_mentor" },
          { field: "com.old_mentor", operator: "<>", value: 0 },
          { field: "com.new_mentor", operator: "=", value: Number(mentor_id) },
          { field: "cu.call_id", operator: "IS", value: "NULL", raw: true },
          {
            field: `com.added_date = (
        SELECT MAX(added_date) 
        FROM change_of_mentor com_sub 
        WHERE com_sub.user_id = com.user_id
    )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "date(com.added_date)",
            operator: ">=",
            value: moment().startOf("month").format("YYYY-MM-DD"),
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: Number(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'breakover_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc1`,
            on: "ohc.user_id = ohc1.user_id AND ohc1.id > ohc.id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(ohc.end_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "ohc1.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'program_starting_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: `ass.active_order_id = ud.active_order_id`,
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
          {
            field: "DATE(sop.start_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            orConditions: [
              {
                field:
                  "sop.order_type in ('New','OCR') and ass.completion_status!=2 ",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: "sop.order_type",
                operator: "=",
                value: "Renewal",
              },
            ],
          },
        ],
      },

      {
        table: `${tables.halfTimeFeedback} hf`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "hf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(hf.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hf.halftime_ack",
            operator: "=",
            value: "0",
          },
          {
            field: "hf.mentor_star_rating",
            operator: "<=",
            value: "4",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },     
      {
        table: "users_details ud",
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'not_improved_health_score' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: "bn_client_hs current_hs",
            on: "ud.user_id = current_hs.user_id",
          },
          {
            type: "LEFT",
            table: "bn_client_hs previous_hs",
            on: "ud.user_id = previous_hs.user_id AND previous_hs.id = (SELECT MAX(id) FROM bn_client_hs WHERE user_id = ud.user_id AND id < current_hs.id)",
          },
        ],
        condition: [
          {
            field: "DATE(current_hs.created)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "current_hs.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "current_hs.ack", operator: "=", value: "0" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "current_hs.type", operator: "IN", value: ["1", "2"] },
          {
            field:
              "(previous_hs.id IS NOT NULL AND previous_hs.overall_health_score >= current_hs.overall_health_score OR current_hs.id IS NOT NULL)",
            operator: "",
            value: "",
            raw: true,
          },
        ],
        groupBy: ["ud.user_id"],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(ff.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ff.final_feedback_ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ff.rate_mentor",
            operator: "<=",
            value: "4",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      // 3. Weight Day 0, 5, 10
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          `COUNT(DISTINCT cd.user_id) as count`,
          `'weight_day_other' as type`,
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.weightRecords} wr`,
            on: "cd.user_id = wr.user_id",
            type: "LEFT",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = cd.user_id and ohc.sub_order_id=cd.active_order_id",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "wr.weight_acknowledge", operator: "=", value: 0 },
          { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
          { field: "wr.days", operator: "NOT IN", value: [0, 5, 10] },
          {
            field: "ohc.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          `COUNT(DISTINCT cd.user_id) as count`,
          `'weight_day_0' as type`,
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.weightRecords} wr`,
            on: "cd.user_id = wr.user_id",
            type: "LEFT",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "wr.weight_acknowledge", operator: "=", value: 0 },
          { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
          { field: "wr.days", operator: "=", value: 0 },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          `COUNT(DISTINCT cd.user_id) as count`,
          `'weight_day_5' as type`,
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.weightRecords} wr`,
            on: "cd.user_id = wr.user_id",
            type: "LEFT",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "wr.weight_acknowledge", operator: "=", value: 0 },
          { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
          { field: "wr.days", operator: "=", value: 5 },
          {
            field: "wr.sub_order_id=cd.active_order_id",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          `COUNT(DISTINCT cd.user_id) as count`,
          `'weight_day_10' as type`,
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.weightRecords} wr`,
            on: "cd.user_id = wr.user_id",
            type: "LEFT",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "cd.sub_user_status",
            operator: "NOT IN",
            value: ["Dropout", "Fs", "Completed"],
          },
          { field: "wr.weight_acknowledge", operator: "=", value: 0 },
          { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
          { field: "wr.days", operator: "=", value: 10 },
          {
            field: "wr.sub_order_id=cd.active_order_id",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      
      {
        table: `${tables.userAlcoholMenu} ua`,
        selectField: [
          "COUNT(DISTINCT ua.user_id) AS count",
          "'alcohol_menu' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ua.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ua.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ua.ack", operator: "=", value: 0 },
          {
            field: "DATE(ua.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },

      // 2. Restaurant Menu
      {
        table: `${tables.userRestaurantMenu} ur`,
        selectField: [
          "COUNT(DISTINCT ur.user_id) AS count",
          "'restaurant_menu' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ur.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ur.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ur.ack", operator: "=", value: 0 },
          {
            field: "DATE(ur.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const howsMyTommorowActiveFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'calls_tomorrow' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"), // <-- tomorrow's date
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "<>", value: "14" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'tracker_due_tomorrow' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            orConditions: [
              {
                field:
                  "DATEDIFF(CURDATE() + INTERVAL 1 DAY, dsl.diet_start_date) = 5 AND dsl.mid_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE() + INTERVAL 1 DAY, dsl.diet_start_date) = 10 AND dsl.end_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count", // Count of distinct users
          "'diet_due_tomorrow' as type", // Label for the diet type
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids', // List of user IDs
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id", // Joins active orders with users
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} adv_sop`,
            on: "ud.user_id = adv_sop.user_id AND adv_sop.program_status = '4'", // Joins to check active program status
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND sop.sent_sessions = dsl.session", // Checks current diet session
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id), // Filters by assigned mentor
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active", // Filters by active user status
          },
          {
            orConditions: [
              {
                field:
                  "(adv_sop.sub_order_id IS NULL AND sop.sent_sessions <> sop.total_sessions)", // Ensures diet has not been completed yet
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: "adv_sop.sub_order_id",
                operator: "IS NOT",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field:
              "DATEDIFF(DATE_ADD(dsl.diet_start_date, INTERVAL 10 DAY), CURDATE()) = 1 AND dsl.diet_start_date IS NOT NULL", // Checks if diet is due tomorrow using diet_start_date
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'breakover_tomorrow' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc1`,
            on: "ohc.user_id = ohc1.user_id AND ohc1.id > ohc.id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(ohc.end_date)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"), // <-- tomorrow
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "ohc1.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'link_expiring_tomorrow_sp' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "DATE(sp.payment_expiry)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"),
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.onHoldClientPaidService} ohc`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'link_expiring_tomorrow_service' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "DATE(ohc.payment_expiry)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"),
          },
          {
            field: "ohc.status",
            operator: "=",
            value: "Pending",
          },
          {
            field: "pl.payment_link_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.paymentLinks} pl`,
            on: "pl.payment_link_id = ohc.payment_link_id",
          },
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'client_expiring_tomorrow' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "DATE(sop.expiry_date)",
            operator: "=",
            value: moment().add(2, "day").format("YYYY-MM-DD"), // <-- tomorrow
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'program_starting_tomorrow' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: `ass.active_order_id = ud.active_order_id`,
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
          {
            field: "DATE(sop.start_date)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"), // <-- tomorrow
          },
          {
            orConditions: [
              {
                field:
                  "sop.order_type in ('New','OCR') and ass.completion_status!=2 ",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field: "sop.order_type",
                operator: "=",
                value: "Renewal",
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'followups_tomorrow' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: `lfl.user_id = ud.user_id`,
          },
        ],
        condition: [
          {
            orConditions: [
              {
                field: "ud.mentor_assigned",
                operator: "=",
                value: mentor_id,
              },
              {
                field: "ud.counsellor_assigned",
                operator: "=",
                value: mentor_id,
              },
            ],
          },
          {
            field: "DATE(lfl.follow_up_date)",
            operator: "=",
            value: moment().add(1, "day").format("YYYY-MM-DD"), // <-- tomorrow
          },
          {
            field: "lfl.follow_up_status",
            operator: "=",
            value: "0",
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

//howsMyDay

//salesOpportunitys

const salesOpportunitysActiveFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'leads_to_capture' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.added_date",
            operator: "BETWEEN",
            value: [
              moment()
                .subtract(3, "days")
                .startOf("day")
                .format("YYYY-MM-DD HH:mm:ss"),
              moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"),
            ],
          },
        ],
      },
      {
        table: `${tables.halfTimeFeedback} hf`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "hf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(hf.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hf.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "hf.halftime_ack",
            operator: "!=",
            value: "1",
          },
          {
            field: "hf.mentor_star_rating",
            operator: "=",
            value: "5",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'healthscore_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        table: `${tables.userDetails} ud`,
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "sop.sub_order_id = hs.sub_order_id AND ud.user_id = hs.user_id AND hs.type = '1'",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(hs.created)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hs.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "hs.ack",
            operator: "!=",
            value: "1",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'healthscore_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hs`,
            on: "sop.sub_order_id = hs.sub_order_id AND ud.user_id = hs.user_id AND hs.type = '2'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "hs.id", operator: "IS NOT", value: "NULL", raw: true },
          {
            field: "DATE(hs.created)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "dsl.diet_start_date <= hs.created",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hs.ack",
            operator: "!=",
            value: "1",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ff.id", operator: "IS NOT", value: "NULL", raw: true },
          {
            field: "DATE(ff.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "dsl.diet_start_date <= ff.added_date",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ff.final_feedback_ack",
            operator: "!=",
            value: "1",
          },
          {
            field: "ff.rate_mentor",
            operator: "=",
            value: "5",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.dietFeedback} df`,
        selectField: [
          "COUNT(DISTINCT df.user_id) AS count",
          "'diet_feedback' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT df.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "df.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            // Extract and cast the answer from the first question
            field: `CAST(JSON_UNQUOTE(JSON_EXTRACT(df.result, '$[0].answer')) AS UNSIGNED)`,
            operator: "=",
            value: 5,
            raw: true,
          },
          {
            field: "DATE(df.created_at)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.prizeDetails} pd`,
        selectField: [
          "COUNT(DISTINCT pd.user_id) as count",
          "'spin_to_win' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT pd.user_id), "]") as user_ids',
        ],
        condition: [
          {
            orConditions: [
              {
                field: "ud.counsellor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              },
              {
                field: "ud.mentor_assigned",
                operator: "=",
                value: parseInt(mentor_id),
              },
            ],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "pd.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'link_expiring_today_sp' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "=",
            value: "CURRENT_DATE() ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.onHoldClientPaidService} ohc`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'link_expiring_today_service' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "DATE(ohc.payment_expiry)",
            operator: "=",
            value: "CURRENT_DATE() ",
            raw: true,
          },
          {
            field: "ohc.status",
            operator: "=",
            value: "Pending",
          },
          {
            field: "pl.payment_link_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.paymentLinks} pl`,
            on: "pl.payment_link_id = ohc.payment_link_id",
          },
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(ud.user_id) as count",
          "'OCL' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.leadSourceLog} lsl`,
            on: `ud.user_id = lsl.user_id`,
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "lsl.updated_at",
            operator: "BETWEEN",
            value: [
              moment().startOf("day").format("YYYY-MM-DD HH:mm:ss"),
              moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"),
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'unconverted_referrals' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "cd.current_lead_source",
            operator: "IN",
            value: ["22", "23"],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "cd.added_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("day").format("YYYY-MM-DD HH:mm:ss"),
              moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"),
            ],
          },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'unconverted_referrals_month' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "cd.current_lead_source",
            operator: "IN",
            value: ["22", "23"],
          },
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "cd.added_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD HH:mm:ss"),
              moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"),
            ],
          },
          {
            field: "cd.user_type",
            operator: "=",
            value: "0",
          },
        ],
      },
      {
        table: `(SELECT 
              cd.user_id,
              cd.mentor_assigned,
              cd.latest_weight,
              sop.start_program_weight,
              wr.posted_date,
              ROW_NUMBER() OVER (PARTITION BY sop.sub_order_id ORDER BY wr.posted_date DESC) AS rn
           FROM users_details cd
           LEFT JOIN sub_orders_programs sop ON cd.active_order_id = sop.sub_order_id
           LEFT JOIN weight_records wr ON sop.sub_order_id = wr.sub_order_id
           WHERE (cd.latest_weight - sop.start_program_weight) < -4.99
             AND wr.posted_date BETWEEN '${moment()
               .startOf("day")
               .format("YYYY-MM-DD HH:mm:ss")}' 
                                   AND '${moment()
                                     .endOf("day")
                                     .format("YYYY-MM-DD HH:mm:ss")}'
             AND cd.user_status IN ('Active', 'Completed')
             AND cd.mentor_assigned = ${mentor_id}
         ) AS ranked_weights`,
        selectField: [
          "COUNT(DISTINCT user_id) as count",
          "'good_weight_loss' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "rn",
            operator: "=",
            value: 1,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'tailend_clients_no_adv_purchase' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
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
          {
            field: "sop.pending_session",
            operator: "IN",
            value: ["0", "1", "2", "3"],
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
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'clients_expired_in_last_30_days' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "sop.expiry_date",
            operator: ">=",
            value: "CURDATE() - INTERVAL 30 DAY",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'active_no_adv_purchase' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: `NOT EXISTS (
        SELECT 1 FROM ${tables.subOrderPrograms} sop2 
        WHERE sop2.user_id = cd.user_id 
        AND sop2.program_status = '4'
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export const ocBucketData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'first_pitched' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.payment_mode_id",
            operator: "=",
            value: "0",
          },
          {
            field: "sp.status",
            operator: "=",
            value: "1",
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'rate_shared' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "sp.suggested_amount",
            operator: "!=",
            value: 0,
          },
          {
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.payment_mode_id",
            operator: "IN",
            value: ["NULL", "0"],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'not_pitched' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field:
              "(ud.suggested_program_id IS NULL OR ud.suggested_program_id = 0)",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'ocr_with_70kg_plus' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "ud.latest_weight",
            operator: ">=",
            value: 70,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'ocr_with_good_feedback_ht' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `bn_halftime_feedback bhf`,
            on: "ud.user_id = bhf.user_id",
          },
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "bhf.mentor_star_rating",
            operator: ">=",
            value: 4,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },

      // 2. From final feedback
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'ocr_with_good_feedback_ff' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `bn_final_feedback bff`,
            on: "ud.user_id = bff.user_id",
          },
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "bff.rate_mentor",
            operator: ">=",
            value: 4,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'ocr_with_3_plus_program' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: `(
        SELECT COUNT(*) FROM ${tables.subOrderPrograms} sop
        WHERE sop.user_id = ud.user_id
      )`,
            operator: ">=",
            value: 3,
            raw: true,
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export const activeSalesBifurcationData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'tailend_clients_no_adv_purchase' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
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
          {
            field: "sop.pending_session",
            operator: "IN",
            value: ["0", "1", "2", "3"],
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
        ],
      },

      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'active_no_adv_purchase' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: `NOT EXISTS (
        SELECT 1 FROM ${tables.subOrderPrograms} sop2 
        WHERE sop2.user_id = cd.user_id 
        AND sop2.program_status = '4'
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'active_adv_purchase' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: `EXISTS (
        SELECT 1 FROM ${tables.subOrderPrograms} sop2 
        WHERE sop2.user_id = cd.user_id 
        AND sop2.program_status = '4'
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'clients_giving_multiple_referrals' AS type",
          'CONCAT("[", GROUP_CONCAT(cd.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Active"],
          },
          {
            field: `cd.user_id IN (
        SELECT referred_by FROM ${tables.userDetails}
        WHERE referred_by != 0 AND user_status IN ('Lead')
        GROUP BY referred_by HAVING COUNT(*) > 2
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'clients_giving_multiple_referrals_oc' AS type",
          'CONCAT("[", GROUP_CONCAT(cd.user_id), "]") AS user_ids',
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: `cd.user_id IN (
        SELECT referred_by FROM ${tables.userDetails}
        WHERE referred_by != 0 AND user_status IN ('Lead')
        GROUP BY referred_by HAVING COUNT(*) > 2
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export const activeMaintanenceBifurcationData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'clients_expired_in_last_30_days' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "cd.sub_user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "sop.expiry_date",
            operator: ">=",
            value: "CURDATE() - INTERVAL 60 DAY",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'maintanence_active' AS type",
          'CONCAT("[", GROUP_CONCAT(cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: ["Maintenance"],
          },
          {
            field: "cd.active_maintenance_id",
            operator: "!=",
            value: 0,
          },
          {
            field: `NOT EXISTS (
        SELECT 1 FROM ${tables.subOrderPrograms} sop2 
        WHERE sop2.user_id = cd.user_id 
        AND sop2.program_status = '4'
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'maintanence_active_with_adv' AS type",
          'CONCAT("[", GROUP_CONCAT(cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "IN",
            value: ["Completed"],
          },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: ["Maintenance"],
          },
          {
            field: "cd.active_maintenance_id",
            operator: "!=",
            value: 0,
          },
          {
            field: `EXISTS (
        SELECT 1 FROM ${tables.subOrderPrograms} sop2 
        WHERE sop2.user_id = cd.user_id 
        AND sop2.program_status = '4'
      )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

export const salesOpportunitysClientFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'first_pitched_48Hrs_ago' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.payment_mode_id",
            operator: "=",
            value: "0",
          },
          {
            field: "sp.status",
            operator: "=",
            value: "1",
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "DATE(sp.updated_date)",
            operator: "=",
            value: "DATE(NOW() - INTERVAL 2 DAY)", // Exactly 2 days ago
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'pitched_48Hrs_ago' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
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
            field: "DATE(sp.updated_date)",
            operator: "=",
            value: "DATE(NOW() - INTERVAL 2 DAY)", // Exactly 2 days ago
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.payment_mode_id",
            operator: "IN",
            value: ["NULL", "0"],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },  
      
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'sales_follow_ups' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "Date(lfl.follow_up_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "lfl.follow_up_status",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "lfl.added_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.weightRecords} wr1`,
        selectField: [
          "COUNT(DISTINCT wr1.user_id) AS count",
          "'good_weight_loss_5th' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT wr1.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.weightRecords} wr2`,
            on: `wr1.user_id = wr2.user_id AND wr1.sub_order_id = wr2.sub_order_id AND wr2.wmr_id = (SELECT MAX(wmr_id) FROM ${tables.weightRecords} WHERE user_id = wr1.user_id AND sub_order_id = wr1.sub_order_id AND wmr_id < wr1.wmr_id)`,
          },
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wr1.user_id",
          },
        ],
        condition: [
          { field: "wr1.days", operator: "=", value: 5 },
          { field: "wr1.weight_acknowledge", operator: "=", value: 0 },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "Date(wr1.posted_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "wr1.weight-wr2.weight",
            operator: "<=",
            value: 1,
            raw: true, // This condition checks for the weight difference >= 1kg
          },
        ],
        groupBy: ["wr1.user_id"],
      },
      {
        table: `${tables.weightRecords} wr1`,
        selectField: [
          "COUNT(DISTINCT wr1.user_id) AS count",
          "'good_weight_loss_active' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT wr1.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wr1.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.weightRecords} wr2`,
            on: `wr1.user_id = wr2.user_id 
           AND ud.active_order_id = wr2.sub_order_id 
           AND wr2.wmr_id = (
             SELECT MIN(wmr_id) 
             FROM ${tables.weightRecords} 
             WHERE user_id = wr1.user_id 
               AND sub_order_id = ud.active_order_id
           )`,
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "wr1.wmr_id",
            operator: "=",
            value: `(SELECT MAX(wmr_id) FROM ${tables.weightRecords} WHERE user_id = wr1.user_id AND sub_order_id = ud.active_order_id)`,
            raw: true,
          },
          {
            field: "wr2.weight - wr1.weight",
            operator: ">=",
            value: 5,
            raw: true,
          },
        ],
      },

      {
        table: `${tables.weightRecords} wr1`,
        selectField: [
          "COUNT(DISTINCT wr1.user_id) AS count",
          "'good_weight_loss_oc' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT wr1.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wr1.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.weightRecords} wr_first`,
            on: `wr1.user_id = wr_first.user_id 
           AND wr_first.wmr_id = (
             SELECT MIN(wmr_id)
             FROM ${tables.weightRecords}
             WHERE user_id = wr1.user_id
           )`,
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "wr1.wmr_id",
            operator: "=",
            value: `(SELECT MAX(wmr_id) 
               FROM ${tables.weightRecords}  
               WHERE user_id = wr1.user_id)`,
            raw: true,
          },
          {
            field: "wr_first.weight - wr1.weight",
            operator: ">=",
            value: 5,
            raw: true,
          },
        ],
      },
      // Query for the 10th day
      {
        table: `${tables.weightRecords} wr1`,
        selectField: [
          "COUNT(DISTINCT wr1.user_id) AS count",
          "'good_weight_loss_10th' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT wr1.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.weightRecords} wr2`,
            on: `wr1.user_id = wr2.user_id AND wr1.sub_order_id = wr2.sub_order_id AND wr2.wmr_id = (SELECT MAX(wmr_id) FROM ${tables.weightRecords} WHERE user_id = wr1.user_id AND sub_order_id = wr1.sub_order_id AND wmr_id < wr1.wmr_id)`,
          },
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wr1.user_id",
          },
        ],
        condition: [
          { field: "wr1.days", operator: "=", value: 10 },
          { field: "wr1.weight_acknowledge", operator: "=", value: 0 },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "Date(wr1.posted_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "wr1.weight-wr2.weight",
            operator: "<=",
            value: 1.5,
            raw: true, // This condition checks for the weight difference >= 1.5kg
          },
        ],
        groupBy: ["wr1.user_id"],
      },
      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'calls_5_rating' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "=",
            value: moment().format("YYYY-MM-DD"),
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "cu.call_status",
            operator: "=",
            value: 0,
          },
          {
            field: "cu.call_type",
            operator: "NOT IN",
            value: `('14','0')`,
            raw: true,
          },
          // New condition: feedback_ht = 5 OR feedback_te = 5 OR diet_feedback = 5
          {
            orConditions: [
              {
                field: "hf.mentor_star_rating",
                operator: "=",
                value: "5",
              },
              {
                field: "ff.rate_mentor",
                operator: "=",
                value: "5",
              },
              {
                field: "df.result",
                operator: "LIKE",
                value: '"5"',
                raw: true,
              },
            ],
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.halfTimeFeedback} hf`,
            on: "hf.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.finalFeedback} ff`,
            on: "ff.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietFeedback} df`,
            on: "df.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.halfTimeFeedback} hf`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "hf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(hf.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hf.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "hf.halftime_ack",
            operator: "=",
            value: "0",
          },
          {
            field: "hf.mentor_star_rating",
            operator: "=",
            value: "5",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'milestone' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: "JSON_LENGTH(mg.comment,'$.milestone_achieved')",
            operator: ">",
            value: 0,
          },
          {
            field: "DATE(mg.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "mg.m_ack", operator: "=", value: "0" },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'goals_filled' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
            operator: ">",
            value: 0,
          },
          {
            field: "DATE(mg.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "mg.ack", operator: "=", value: "0" },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
       {
        table: `${tables.weightRecordsLead} wrl`,
        selectField: [
          "COUNT(DISTINCT wrl.user_id) as count",
          "'weight_tracker_oc' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT wrl.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wrl.user_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "wrl.weight_acknowledge",
            operator: "=",
            value: 0,
          },
          {
            field: "DATE(wrl.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'healthscore_oc' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        table: `${tables.userDetails} ud`,
        join: [
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "ud.user_id = hs.user_id AND hs.type = '3'",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(hs.created)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hs.ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },

      {
        table: "users_details ud",
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'improved_health_score' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: "bn_client_hs current_hs",
            on: "ud.user_id = current_hs.user_id",
          },
          {
            type: "LEFT",
            table: "bn_client_hs previous_hs",
            on: "ud.user_id = previous_hs.user_id AND previous_hs.id = (SELECT MAX(id) FROM bn_client_hs WHERE user_id = ud.user_id AND id < current_hs.id)",
          },
        ],
        condition: [
          {
            field: "DATE(current_hs.created)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "current_hs.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "current_hs.ack", operator: "!=", value: "1" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "current_hs.type", operator: "IN", value: ["1", "2"] },
          {
            // This condition ensures that only users with a previous health score are included (excluding first health score)
            field: "previous_hs.id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "previous_hs.overall_health_score",
            operator: "<",
            value: "current_hs.overall_health_score",
            raw: true,
          },
        ],
        groupBy: ["ud.user_id"],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(ff.added_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ff.final_feedback_ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ff.rate_mentor",
            operator: "=",
            value: "5",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.dietFeedback} df`,
        selectField: [
          "COUNT(DISTINCT df.user_id) AS count",
          "'diet_feedback' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT df.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "df.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "df.is_ack",
            operator: "=",
            value: "0",
          },
          {
            // Extract and cast the answer from the first question
            field: `CAST(JSON_UNQUOTE(JSON_EXTRACT(df.result, '$[0].answer')) AS UNSIGNED)`,
            operator: "=",
            value: 5,
            raw: true,
          },
          {
            field: "DATE(df.created_at)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
        ],
      },
      // {
      //   table: `${tables.prizeDetails} pd`,
      //   selectField: [
      //     "COUNT(DISTINCT pd.user_id) as count",
      //     "'spin_to_win' as type",
      //     'CONCAT("[", GROUP_CONCAT(DISTINCT pd.user_id), "]") as user_ids',
      //   ],
      //   condition: [
      //     {
      //       field: "ud.mentor_assigned",
      //       operator: "=",
      //       value: parseInt(mentor_id),
      //     },
      //     {
      //       field: "ud.user_status",
      //       operator: "IN",
      //       value: ["Active", "Completed"],
      //     },
      //   ],
      //   join: [
      //     {
      //       type: "LEFT",
      //       table: `${tables.userDetails} ud`,
      //       on: "pd.user_id = ud.user_id",
      //     },
      //   ],
      // },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'link_expiring_today_sp' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "=",
            value: "CURRENT_DATE() ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.onHoldClientPaidService} ohc`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'link_expiring_today_service' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "DATE(ohc.payment_expiry)",
            operator: "=",
            value: "CURRENT_DATE() ",
            raw: true,
          },
          {
            field: "ohc.status",
            operator: "=",
            value: "Pending",
          },
          {
            field: "pl.payment_link_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.paymentLinks} pl`,
            on: "pl.payment_link_id = ohc.payment_link_id",
          },
        ],
      },

      // cart related
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'cart_added_oc' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'share_cart_link_added_oc' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },

          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
          {
            field: "ct.cart_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
          { field: "ct.cart_code", operator: "!=", value: "''", raw: true },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is not null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'cart_added_oc_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'share_cart_link_added_oc_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
          {
            field: "ct.cart_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
          { field: "ct.cart_code", operator: "!=", value: "''", raw: true },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is not null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'cart_added_lead' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'share_cart_link_added_lead' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_code", 
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "!=", value: "''", raw: true },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is not null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'cart_added_lead_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'share_cart_link_added_lead_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is not null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'cart_added' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'share_cart_link_added' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "MONTH(ct.updated_date)",
            operator: "=",
            value: "MONTH(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "YEAR(ct.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE())",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is not null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
          { field: "ct.cart_code", operator: "!=", value: "''", raw: true },

          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'cart_added_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.cart_code",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.cart} ct`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'share_cart_link_added_today' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "DATE(ct.updated_date)",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ct.user_id",
            operator: "NOT IN",
            value:
              "(SELECT user_id FROM product_orders WHERE user_id = ct.user_id AND created_at >= ct.updated_date AND payment_method='online')",
            raw: true,
          },
          {
            field: "ct.cart_id",
            operator: "=",
            value:
              "(SELECT cart_id FROM cart WHERE user_id = ct.user_id and cart_code is not null ORDER BY cart_id DESC LIMIT 1)",
            raw: true,
          },

          {
            field: "ct.cart_code",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },

          { field: "ct.cart_code", operator: "!=", value: "''", raw: true },

          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "JSON_LENGTH(ct.cart_items)",
            operator: ">",
            value: 0,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ct.user_id = ud.user_id",
          },
        ],
      },
    ]);

    console.log(results, "data-results");

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

//salesOpportunitys

//salesFollowupAndRisk
const salesFollowupAndRiskActiveFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'first_pitched' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.payment_mode_id",
            operator: "=",
            value: "0",
          },
          {
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared_month' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_expired' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "<",
            value: "CURRENT_DATE() ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_expired' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'sales_follow_ups' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
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
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "Date(lfl.follow_up_date)",
            operator: ">=",
            value: " CURRENT_DATE()",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'pitched_but_no_fu' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "sp.suggested_by",
            operator: "=",
            value: parseInt(mentor_id),
          },

          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "lfl.follow_up_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
const mtdFollowUpsRisksLeadData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'leads_to_capture' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "IN",
            value: ["NULL", "0"],
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.added_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
        ],
      },
      {
        table: `${tables.leadAssignedLog} lal`,
        selectField: [
          "COUNT(DISTINCT lal.user_id) as count",
          "'assigned_lead_and_refs' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "lal.user_id = ud.user_id",
          },
        ],
        condition: [
          {
            field: "lal.assign_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'first_pitched' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.payment_mode_id",
            operator: "=",
            value: "0",
          },
          {
            field: "sp.status",
            operator: "=",
            value: "1",
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
          {
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
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
            field: "date(sp.payment_expiry)",
            operator: ">=",
            value: moment().format("YYYY-MM-DD"),
          },
          {
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.payment_mode_id",
            operator: "NOT IN",
            value: `("NULL","0")`,
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'rate_shared' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
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
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_expired' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.suggested_amount",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
          {
            field: "sp.suggested_amount",
            operator: "!=",
            value: 0,
          },
          {
            field: "sp.updated_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'followups_pending' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
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
            field: "lfl.follow_up_status",
            operator: "=",
            value: 0,
          },

          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "lfl.follow_up_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
const mtdFollowUpsRisksClientData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'first_pitched' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.payment_mode_id",
            operator: "=",
            value: "0",
          },
          {
            field: "sp.status",
            operator: "=",
            value: "1",
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_shared' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
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
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: ">=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "sp.payment_mode_id",
            operator: "IN",
            value: [1, 2, 3, 4],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'rate_shared' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
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
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "sp.payment_mode_id",
            operator: "IN",
            value: ["NULL", "0"],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },

      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'payment_details_expired' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.suggested_amount",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
          },
          {
            field: "sp.suggested_amount",
            operator: "!=",
            value: 0,
          },
          {
            field: "MONTH(sp.updated_date)",
            operator: "=",
            value: " MONTH(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "YEAR(sp.updated_date)",
            operator: "=",
            value: "YEAR(CURRENT_DATE()) ",
            raw: true,
          },
          {
            field: "DATE(sp.payment_expiry)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.suggestedProgram} sp`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'followups_pending' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "IN",
            value: ["Active", "Completed"],
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
            field: "lfl.follow_up_status",
            operator: "=",
            value: 0,
          },

          {
            field: "ud.suggested_program_id",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          {
            field: "lfl.follow_up_date",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD 00:00:00"),
              moment().endOf("month").format("YYYY-MM-DD 23:59:59"),
            ],
          },
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "sp.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
      },
    ]);

    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
//salesFollowupAndRisk

const howzmyDayOCFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: ["COUNT(ud.user_id) as count", "'OCL' as type"],
        join: [
          {
            type: "INNER",
            table: `${tables.leadSourceLog} lsl`,
            on: `ud.user_id = lsl.user_id`,
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "lsl.updated_at",
            operator: "BETWEEN",
            value: [
              `${moment().format("YYYY-MM-DD")}`,
              `${moment().format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const howzmyDayLeadFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'leads_to_capture' as type",
        ],
        condition: [
          {
            field: "ud.counsellor_assigned",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.user_type",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.added_date",
            operator: "BETWEEN",
            value: [
              moment()
                .subtract(7, "days")
                .startOf("day")
                .format("YYYY-MM-DD HH:mm:ss"),
              moment().endOf("day").format("YYYY-MM-DD HH:mm:ss"),
            ],
          },
        ],
      },
      {
        table: `${tables.leadAssignedLog} lal`,
        selectField: [
          "COUNT(DISTINCT lal.user_id) as count",
          "'leads_assigned' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "lal.user_id = ud.user_id",
          },
        ],
        condition: [
          {
            field: "lal.counsellor_id",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "lal.assign_date",
            operator: ">=",
            value: moment().format("YYYY-MM-DD"),
          },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Lead",
          },
        ],
      },
      {
        table: `${tables.leadEngagementLogs} lel`,
        selectField: [
          "COUNT(DISTINCT lel.user_id) as count",
          "'engagement_today' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = lel.user_id",
          },
        ],
        condition: [
          {
            field: "lel.engagement_date",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          { field: "lel.status", operator: "=", value: 0 },
          { field: "lel.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "ud.user_type", operator: "=", value: "0" },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const overdueAndMissesActiveFilterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'weight_overdue_5th_day' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            orConditions: [
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 6 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 8 AND dsl.mid_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'weight_overdue_10th_day' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field:
              "DATEDIFF(CURDATE(), dsl.diet_start_date) > 10 AND dsl.end_session_weight = 0",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'diet_overdue' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.weightRecords} wr`,
            on: "wr.sub_order_id = ud.active_order_id AND sop.sent_sessions = wr.session",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions + 1",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.pending_session",
            operator: "<>",
            value: "sop.sent_sessions",
            raw: true,
          },
          {
            field: "wr.session",
            operator: "=",
            value: "sop.sent_sessions",
            raw: true,
          },
          {
            field: "wr.posted_date",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "wr.days",
            operator: "=",
            value: 10,
            raw: true,
          },
          {
            orConditions: [
              {
                field: "dsl.session",
                operator: "IS",
                value: null,
                raw: true,
              },
              {
                field: "dsl.diet_status",
                operator: "<>",
                value: 4,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'not_started_od' as type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "sop.start_date",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'onhold_today' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc1`,
            on: "ohc.user_id = ohc1.user_id AND ohc1.id > ohc.id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(ohc.end_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "ohc1.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'onhold_od' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc1`,
            on: "ohc.user_id = ohc1.user_id AND ohc1.id > ohc.id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(ohc.end_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "ohc1.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'assessment_od' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: "ud.user_id = ass.user_id AND ass.active_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field:
              "((ass.completion_status = 0 OR ass.user_id IS NULL) OR (ass.completion_status = 1 AND ass.user_id IS NOT NULL))",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.created_at",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "sop.program_type",
            operator: "=",
            value: 0,
          },
          {
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'icl_od' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.ingredientChecklistRecords} iclr`,
            on: "ud.user_id = iclr.user_id AND iclr.active_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field:
              "((iclr.completion_status = 0 OR iclr.user_id IS NULL) OR (iclr.completion_status = 1 AND iclr.user_id IS NOT NULL))",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.created_at",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "sop.program_type",
            operator: "=",
            value: 0,
          },
          {
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.sent_sessions",
            operator: "=",
            value: 0,
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const todaysRiskAndMissesData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'weight_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            orConditions: [
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 6 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 8 AND dsl.mid_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 11 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 18 AND dsl.end_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 1 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 3 AND dsl.start_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      },

      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) AS count",
          "'calls_missed' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: moment().format("YYYY-MM-DD"),
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "<>", value: "14" },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'diet_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.weightRecords} wr`,
            on: "wr.sub_order_id = ud.active_order_id AND sop.sent_sessions = wr.session",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions + 1",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.pending_session",
            operator: ">",
            value: "sop.sent_sessions",
            raw: true, // Ensures session is still pending
          },
          {
            field: "wr.session",
            operator: "=",
            value: "sop.sent_sessions",
            raw: true,
          },
          {
            field: "wr.posted_date",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true, // At least 48 hours passed since last weight
          },
          {
            field: "wr.days",
            operator: ">=",
            value: 10,
            raw: true, // 10 days gap to qualify as diet overdue
          },
          {
            orConditions: [
              {
                field: "dsl.session",
                operator: "IS",
                value: null,
                raw: true,
              },
              {
                field: "dsl.diet_status",
                operator: "<>",
                value: 4,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'not_started_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "Date(sop.start_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'onhold_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc1`,
            on: "ohc.user_id = ohc1.user_id AND ohc1.id > ohc.id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(ohc.end_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "ohc1.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'welcome_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
			
				 sop.sent_sessions = 1
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			
		
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '0'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'ht_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'te_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
          (
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 7 and 9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'validity_awareness_plus_increase' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "sop.program_session_id = ps.program_session_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id, 10),
          },
          {
            field: `
        (DATEDIFF(sop.expiry_date, CURDATE()) >= 0 
         AND DATEDIFF(sop.expiry_date, CURDATE()) <= 
           (sop.pending_session * 11 +
             CASE ps.validity
               WHEN 30  THEN 15
               WHEN 60  THEN 20
               WHEN 90  THEN 25
               WHEN 120 THEN 30
               WHEN 150 THEN 35
               WHEN 180 THEN 40
               ELSE 5
             END
           )
        )
      `,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value:
              "'Active' AND ud.sub_user_status <> 'Onhold' AND sop.total_sessions != sop.sent_sessions",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'goal_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            orConditions: [
              {
                field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
                operator: "=",
                value: 0,
              },
              {
                field: "mg.id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10 ))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'feedback_od_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hf.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.halftimeFeedback} hf`,
            type: "LEFT",
            on: "sop.sub_order_id = hf.sub_order_id and cd.user_id = hf.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'feedback_od_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 4 and 6
			)
		
		OR
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "ff.id", operator: "IS", value: "NULL", raw: true },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'health_score_od_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hs.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'health_score_od_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },

          {
            field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 3
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "hs.id", operator: "IS", value: "NULL", raw: true },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export const todaysRiskAndMissesMentorData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      
       {
        table: `${tables.weightRecordsLead} wrl`,
        selectField: [
          "COUNT(DISTINCT wrl.user_id) as count",
          "'weight_tracker_oc' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT wrl.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = wrl.user_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "wrl.weight_acknowledge",
            operator: "=",
            value: 0,
          },
          {
            field: "DATE(wrl.added_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'healthscore_oc' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        table: `${tables.userDetails} ud`,
        join: [
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "ud.user_id = hs.user_id AND hs.type = '3'",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Completed" },
          {
            field: "DATE(hs.created)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hs.ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },

      {
        table: `${tables.callUpdates} cu`,
        selectField: [
          "COUNT(DISTINCT cu.user_id) AS count",
          "'calls_missed' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        condition: [
          {
            field: "DATE(cu.schedule_date)",
            operator: "<",
            value: moment().format("YYYY-MM-DD"),
          },
          { field: "cu.added_by", operator: "=", value: parseInt(mentor_id) },
          { field: "cu.call_status", operator: "=", value: 0 },
          { field: "cu.call_type", operator: "<>", value: "14" },
          {
            field: `cu.user_id NOT IN (SELECT cu1.user_id FROM ${tables.callUpdates} cu1 WHERE cu1.added_by = ${mentor_id} AND cu1.call_status = '1' GROUP BY cu1.user_id)`,
            operator: "",
            value: "",
            raw,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} ud`,
            on: "ud.user_id = cu.user_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'diet_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.weightRecords} wr`,
            on: "wr.sub_order_id = ud.active_order_id AND sop.sent_sessions = wr.session",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions + 1",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "date(sop.start_date)",
            operator: ">=",
            value: "now()",
          },
          {
            field: "sop.pending_session",
            operator: ">",
            value: "sop.sent_sessions",
            raw: true, // Ensures session is still pending
          },
          {
            field: "wr.session",
            operator: "=",
            value: "sop.sent_sessions",
            raw: true,
          },
          {
            field: "wr.posted_date",
            operator: "<=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true, // At least 48 hours passed since last weight
          },
          {
            field: "wr.days",
            operator: ">=",
            value: 10,
            raw: true, // 10 days gap to qualify as diet overdue
          },
          {
            orConditions: [
              {
                field: "dsl.session",
                operator: "IS",
                value: null,
                raw: true,
              },
              {
                field: "dsl.diet_status",
                operator: "<>",
                value: 4,
              },
            ],
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'validity_awareness_plus_increase' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "sop.program_session_id = ps.program_session_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pm`,
            on: "ps.program_id = pm.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.program_expiry_log} pel`,
            on: "pel.sub_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id, 10),
          },
          {
            field: `
        (
          DATEDIFF(sop.expiry_date, CURDATE()) >= 0
          AND DATEDIFF(sop.expiry_date, CURDATE()) <= (sop.pending_session * 11)
          AND (sop.pending_session * 11 - DATEDIFF(sop.expiry_date, CURDATE())) >= 15
        )
      `,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.total_sessions <> sop.pending_session",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "!=",
            value: "Onhold",
          },
          {
            field: "pel.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "LCASE(pm.program_name)",
            operator: "NOT LIKE",
            value: "'%khyati%'",
            raw: true,
          },
          {
            field: "LCASE(pm.program_name)",
            operator: "NOT LIKE",
            value: "'%platinum%'",
            raw: true,
          },
          {
            field: "LCASE(pm.program_name)",
            operator: "NOT LIKE",
            value: "'%privy%'",
            raw: true,
          },
          {
            field: "pm.program_category",
            operator: "=",
            value: "Special Stack",
          },
        ],
      },
      
      {
        table: `${tables.halfTimeFeedback} hf`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.userDetails} ud`,
            type: "LEFT",
            on: "hf.user_id = ud.user_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(hf.added_date)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "hf.halftime_ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },     
      {
        table: "users_details ud",
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'health_score' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") AS user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: "bn_client_hs current_hs",
            on: "ud.user_id = current_hs.user_id and ud.active_order_id = current_hs.sub_order_id",
          },
        ],
        condition: [
          {
            field: "DATE(current_hs.created)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "ud.user_status", operator: "=", value: "Active" },         
          { field: "current_hs.ack", operator: "=", value: "0" },
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "current_hs.type", operator: "IN", value: ["1", "2"] },
         
        ],
        groupBy: ["ud.user_id"],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'feedback_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "ud.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
        ],
        condition: [
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "DATE(ff.added_date)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "ff.final_feedback_ack",
            operator: "=",
            value: "0",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
       {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'goal' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
            operator: ">",
            value: 0,
          },
          {
            field: "DATE(mg.updated_date)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "mg.ack", operator: "=", value: "0" },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'milestone' AS type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") AS user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: "JSON_LENGTH(mg.comment,'$.milestone_achieved')",
            operator: ">",
            value: 0,
          },
          {
            field: "DATE(mg.updated_date)",
            operator: "<",
            value: "CURRENT_DATE()",
            raw: true,
          },
          { field: "mg.m_ack", operator: "=", value: "0" },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export const startLaterData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) AS count",
          "'start_later_clients' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "ud.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.user_status", operator: "=", value: "Active" },
          {
            field: "date(sop.start_date)",
            operator: ">=",
            value: moment().add(2, "days").format("YYYY-MM-DD"),
          },
          { field: "sop.sent_sessions", operator: "=", value: "0" },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export const todaysRiskAndMissesClientData = async ({ mentor_id }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'weight_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            orConditions: [
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 6 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 8 AND dsl.mid_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 11 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 18 AND dsl.end_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 1 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 3 AND dsl.start_session_weight = 0 and sop.sent_sessions = 1",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'not_started_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "Date(sop.start_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'onhold_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc1`,
            on: "ohc.user_id = ohc1.user_id AND ohc1.id > ohc.id",
          },
        ],
        condition: [
          {
            field: "ud.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
          {
            field: "DATE(ohc.end_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "ohc1.user_id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'welcome_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
			
				 sop.sent_sessions = 1
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			
		
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '0'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'ht_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'te_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
          (
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 7 and 9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },

      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'goal_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            orConditions: [
              {
                field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
                operator: "=",
                value: 0,
              },
              {
                field: "mg.id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10 ))`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'feedback_od_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hf.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.halftimeFeedback} hf`,
            type: "LEFT",
            on: "sop.sub_order_id = hf.sub_order_id and cd.user_id = hf.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'feedback_od_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 4 and 6
			)
		
		OR
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "ff.id", operator: "IS", value: "NULL", raw: true },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'health_score_od_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hs.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'health_score_od_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },

          {
            field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 3
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "hs.id", operator: "IS", value: "NULL", raw: true },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

export const todaysRiskAndMissesClientDataCs = async () => {
  try {
    const startofMonth = moment().startOf("month").format();
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'weight_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "INNER",
            table: `${tables.dietSessionLog} dsl`,
            on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions",
          },
        ],
        condition: [
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            orConditions: [
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 6 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 8 AND dsl.mid_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 11 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 18 AND dsl.end_session_weight = 0",
                operator: "",
                value: "",
                raw: true,
              },
              {
                field:
                  "DATEDIFF(CURDATE(), dsl.diet_start_date) >= 1 AND DATEDIFF(CURDATE(), dsl.diet_start_date) <= 3 AND dsl.start_session_weight = 0 and sop.sent_sessions = 1",
                operator: "",
                value: "",
                raw: true,
              },
            ],
          },
        ],
      },

      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'not_started_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field: "Date(sop.start_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "notstarted",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'onhold_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onholdClients} ohc`,
            on: "ohc.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
        ],
        condition: [
          {
            field: "DATE(ohc.end_date)",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Onhold",
          },
          {
            field: "sop.program_status",
            operator: "=",
            value: "1",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'welcome_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
			
				 sop.sent_sessions = 1
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			
		
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '0'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'ht_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 4
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 6
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '1'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'te_call_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
          (
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 7 and 9
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 6
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "cu.call_id",
            operator: "IS",
            value: " NULL",
            raw: true,
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.callUpdates} cu`,
            type: "LEFT",
            on: "sop.sub_order_id = cu.sub_order_id and cu.call_type = '2'",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },

      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'goal_od' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.bnMyGoalsNew} mg`,
            type: "LEFT",
            on: "sop.sub_order_id = mg.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            orConditions: [
              {
                field: "JSON_LENGTH(mg.comment,'$.goals_achieved')",
                operator: "=",
                value: 0,
              },
              {
                field: "mg.id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: `((sop.total_sessions = 6 AND sop.sent_sessions = 4 
          AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10 ) 
          OR (sop.total_sessions = 9 AND sop.sent_sessions = 6 
          AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10 ))`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'feedback_od_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `NOT EXISTS (
        SELECT 1
        FROM bn_halftime_feedback hf2
        WHERE hf2.sub_order_id = sop.sub_order_id
        AND hf2.user_id = cd.user_id
    )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `(
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 2
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hf.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.halftimeFeedback} hf`,
            type: "LEFT",
            on: "sop.sub_order_id = hf.sub_order_id and cd.user_id = hf.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'feedback_od_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.finalFeedback} ff`,
            type: "LEFT",
            on: "sop.sub_order_id = ff.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 4 and 6
			)
		
		OR
          
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 8
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "ff.id", operator: "IS", value: "NULL", raw: true },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'health_score_od_ht' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =1)",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          {
            field: `(
         
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 5
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "hs.id",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} cd`,
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'health_score_od_te' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT cd.user_id), "]") as user_ids',
        ],
        join: [
          {
            table: `${tables.subOrderPrograms} sop`,
            type: "LEFT",
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            table: `${tables.healthScoreClient} hs`,
            type: "LEFT",
            on: "(sop.sub_order_id = hs.sub_order_id AND cd.user_id = hs.user_id and hs.type =2)",
          },
          {
            type: "LEFT",
            table: `${tables.dietSessionLog} dsl`,
            on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions AND dsl.diet_status = 4",
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },

          {
            field: ` (
          	(
				sop.total_sessions = 3
				AND sop.sent_sessions = 3
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 3
			)
		
		OR
			(
				sop.total_sessions = 6
				AND sop.sent_sessions = 5
				AND DATEDIFF(NOW(), dsl.diet_start_date) between 1 and 5
			)
		
		OR (
			sop.total_sessions = 9
			AND sop.sent_sessions = 7
			AND DATEDIFF(NOW(), dsl.diet_start_date) between 6 and 10
		)
	)`,
            operator: "",
            value: "",
            raw: true,
          },
          { field: "hs.id", operator: "IS", value: "NULL", raw: true },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(distinct ud.user_id) as count",
          "'assessment_not_filled' as type",
          'CONCAT("[", GROUP_CONCAT(DISTINCT ud.user_id), "]") as user_ids',
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.subOrderPrograms} sop`,
            on: "sop.sub_order_id = ud.active_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.assessment} ass`,
            on: "ud.user_id = ass.user_id AND ass.active_order_id = sop.sub_order_id",
          },
        ],
        condition: [
          {
            orConditions: [
              {
                field: "ass.completion_status",
                operator: "=",
                value: 0,
              },
              {
                field: "ass.user_id",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ],
          },
          {
            field: "ud.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "sop.order_type",
            operator: "IN",
            value: ["New", "OCR"],
          },
          {
            field: "sop.created_at",
            operator: ">=",
            value: startofMonth,
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

export const getTodayDueWeightManagementDataCs = async () => {
  const result = await readRecordUnion([
    // Start weight not updated
    {
      table: `${tables.userDetails} ud`,
      selectField: [
        "COUNT(DISTINCT ud.user_id) as count",
        "'start_weight' as type",
      ],
      join: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
        },
      ],
      condition: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "date(dsl.diet_start_date)",
          operator: ">",
          value: "2025-04-12",
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [1, 2, 3],
        },
        {
          orConditions: [
            {
              field: "dsl.start_session_weight",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
            {
              field: "dsl.start_session_weight",
              operator: "=",
              value: "0",
              raw: true,
            },
          ],
        },
      ],
    },
    // Start inch not updated
    {
      table: `${tables.userDetails} ud`,
      selectField: [
        "COUNT(DISTINCT ud.user_id) as count",
        "'start_inch' as type",
      ],
      join: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.inchRecords} ir`,
          on: "ir.sub_order_id = sop.sub_order_id AND ir.session = sop.sent_sessions and ir.days = 0",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
        },
      ],
      condition: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "sop.sent_sessions",
          operator: "=",
          value: 1,
        },
        {
          field: "date(dsl.diet_start_date)",
          operator: ">",
          value: "2025-04-12",
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "IN",
          value: [1, 2, 3],
        },
        { field: "ir.inch_id", operator: "IS", value: "NULL", raw: true },
      ],
    },

    // End weight not updated
    {
      table: `${tables.userDetails} ud`,
      selectField: [
        "COUNT(DISTINCT ud.user_id) as count",
        "'10th_day_weight' as type",
      ],
      join: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
        },
      ],
      condition: [
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "date(dsl.diet_start_date)",
          operator: ">",
          value: "2025-04-12",
        },
        {
          orConditions: [
            { field: "dsl.end_session_weight", operator: "=", value: 0 },
            {
              field: "dsl.end_session_weight",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "=",
          value: 10,
        },
      ],
    },
    // End inch not updated
    {
      table: `${tables.userDetails} ud`,
      selectField: [
        "COUNT(DISTINCT ud.user_id) as count",
        "'10th_day_inch' as type",
      ],
      join: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
        },
      ],
      condition: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Active" },
        {
          field: "date(dsl.diet_start_date)",
          operator: ">",
          value: "2025-04-12",
        },
        {
          orConditions: [
            {
              field: "dsl.end_session_inch",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "dsl.end_session_inch",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "=",
          value: 10,
        },
      ],
    },
    // End photo not updated
    {
      table: `${tables.userDetails} ud`,
      selectField: [
        "COUNT(DISTINCT ud.user_id) as count",
        "'10th_day_photo' as type",
      ],
      join: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: "dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4",
        },
      ],
      condition: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Active",
        },
        {
          field: "date(dsl.diet_start_date)",
          operator: ">",
          value: "2025-04-12",
        },
        {
          orConditions: [
            {
              field: "dsl.end_session_photo",
              operator: "=",
              value: 0,
              raw: true,
            },
            {
              field: "dsl.end_session_photo",
              operator: "IS",
              value: "NULL",
              raw: true,
            },
          ],
        },
        {
          field: "DATEDIFF(CURDATE(), dsl.diet_start_date)",
          operator: "=",
          value: 10,
        },
      ],
    },
  ]);

  const data = result.reduce((acc, item) => {
    acc[item.type] = item.count || 0;
    return acc;
  }, {});

  return result;
};

const overdueAndMissesCommonData = async ({ mentor_id, user_type }) => {
  try {
    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT cu.call_id) as count",
          "'call_missed' as type",
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value:
              user_type === "Active"
                ? "Active"
                : user_type === "OC"
                ? "Completed"
                : "Lead",
          },
          {
            field: "cu.added_by",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cu.call_status", operator: "=", value: "0", raw: true },
          {
            field: "cu.schedule_date",
            operator: "<",
            value: `CURDATE()`,
            raw: true,
          },
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.callUpdates} cu`,
            on: "cu.user_id = ud.user_id",
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: ["COUNT(fu.follow_up_id) as count", "'fu_missed' as type"],
        join: [
          {
            type: "INNER",
            table: `${tables.leadFollowUpLogs} fu`,
            on: "fu.user_id = ud.user_id",
          },
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value:
              user_type === "Active"
                ? "Active"
                : user_type === "OC"
                ? "Completed"
                : "Lead",
          },
          {
            field: "fu.assigned_to",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: `fu.follow_up_date = (
        SELECT MAX(follow_up_date)  -- Get the latest follow-up for each user
        FROM lead_follow_up_logs
        WHERE user_id = fu.user_id
    )`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: "fu.follow_up_status",
            operator: "=",
            value: 0,
          },
          {
            field: "fu.follow_up_date",
            operator: "<",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          "COUNT(DISTINCT ud.user_id) as count",
          "'pitched_but_no_fu' as type",
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "sp.suggested_program_id = ud.suggested_program_id",
          },
          {
            type: "LEFT",
            table: `${tables.leadFollowUpLogs} lfl`,
            on: "ud.user_id = lfl.user_id",
          },
        ],
        condition: [
          {
            field: "ud.user_status",
            operator: "=",
            value:
              user_type === "Active"
                ? " Active"
                : user_type === "OC "
                ? "Completed"
                : "Lead",
          },
          {
            field:
              user_type === "Active" || user_type === "OC"
                ? "ud.mentor_assigned"
                : "ud.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "sp.updated_date",
            operator: ">=",
            value: "NOW() - INTERVAL 48 HOUR",
            raw: true,
          },
          {
            field: "lfl.user_id",
            operator: "IS",
            value: null,
            raw: true,
          },
        ],
      },
    ]);
    return results;
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const getFormattedUserData = async ({
  extraSelectFields = [],
  extraConditions = [],
  extraJoins = [],
  page,
  limit,
  search,
  base_table = `${tables.userDetails} ud`,
  extraObjects = (i) => ({}),
  extraGroupBy = [],
  extraOrderBy = [],
  showWeightDetails = true,
}) => {
  try {
    const selectFields = [
      "ud.user_id",
      `CONCAT(COALESCE(ud.first_name, ''), 
       CASE WHEN ud.first_name IS NOT NULL AND ud.last_name IS NOT NULL THEN ' ' ELSE '' END, 
       COALESCE(ud.last_name, '')) as client_name`,
      "ud.email_id",
      "ud.cs_notes",
      "CASE WHEN ud.phone_code NOT IN ('0','') THEN CONCAT(RTRIM(ud.phone_code), ' ', ud.phone_number) ELSE ud.phone END AS phone",
      "ud.sub_user_status",
      "ud.active_order_id as current_program_sub_order_id",
      // "ud.free_hamper",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.order_type",
      "sop.pending_session as current_pending_session",
      "sop.total_sessions as total_sent_session",
      "sop.created_at as created_at",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "ps.program_duration AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.start_date",
      "sop.expiry_date as current_expiry_date",
      "ud.latest_weight",
      "sp.suggested_program_id as suggested_id",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sps.program_duration",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as mentor_assigned_phone",
      "ad.crm_user as mentor_assigned",
      "sps.mrp as suggested_program_mrp",
      "sps.program_id as program_session_program_id",
      "sps.program_duration as suggested_program_days",
      "sp.program_id",
      "sp.payment_mode_id as suggested_payment_mode_id",
      "paym.name as payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
      "sp.free_hamper as free_hamper",
      "ud.my_wallet as wallet",
      ...extraSelectFields,
    ];
    const hasUserDetailsJoin = extraJoins.some((join) =>
      join.table.includes(`${tables.userDetails} ud`)
    );
    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "pm.program_id  = sop.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "ps.program_session_id = sop.program_session_id",
      },
      {
        type: "LEFT",
        table: `(SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC, suggested_program_id DESC) AS rn FROM ${tables.suggestedProgram}) AS sp_inner WHERE rn = 1) AS sp`,

        on: "ud.user_id = sp.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} sps`,
        on: "sp.program_session_id =  sps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} spm`,
        on: "sp.program_id = spm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.assessment_personal_details} aspd`,
        on: "aspd.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "ad.admin_user_id = ud.mentor_assigned",
      },
      {
        type: "LEFT",
        table: `${tables.orderDetails} od2`,
        on: "od2.order_id  = sop.order_id",
      },
      {
        type: "LEFT",
        table: `${tables.accountPaymentModes} paym`,
        on: "od2.payment_mode  = paym.id",
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
      },
    ];
    if (hasUserDetailsJoin) {
      joins.unshift(...extraJoins);
    } else {
      joins.push(...extraJoins);
    }
    const conditions = [...extraConditions];
    const { results, totalCount } = await readRecord({
      table: base_table,
      selectFields,
      joins,
      conditions,
      pagination: { limit, page },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "ud.user_id",
            "CONCAT(ud.first_name,' ',ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
      ...(extraGroupBy.length > 0 && { groupBy: [...extraGroupBy] }),
      ...(extraOrderBy.length > 0 && {
        orderBy: [...extraOrderBy],
      }),
    });

    const data = await Promise.all(
      results.map(async (i) => {
        const weightDifference = Math.abs(
          Number(i.start_program_weight) - Number(i.latest_weight)
        ).toFixed(2);
        let message = "";
        const daysLeft = moment(i.suggested_payment_expiry).diff(
          moment(),
          "days"
        );

        let displayDays;
        if (daysLeft > 0) {
          displayDays = `in the next ${daysLeft} Days`;
        } else if (daysLeft === 0) {
          displayDays = "Today";
        } else {
          displayDays = ""; // or "Expired" if you want to show past due
        }
        if (Number(i.suggested_payment_mode_id) === 1) {
          message = `<span>Hi ${
            i.client_name
          },<br> PFA your payment link for <b>${i.suggested_program_name} (${
            i.suggested_program_days
          }) program</b> for Amount <b>Rs.${
            i.suggested_amount
          }</b> <br> Click here: <a href="${i.suggested_payment_link}">${
            i.suggested_payment_link
          }</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
            i.suggested_payment_expiry
          ).format(
            "Do MMMM YYYY"
          )} which is ${displayDays}. Please ensure you use it before that. ${
            i.free_hamper !== "No" && i.free_hamper
              ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
              : ""
          } <br><br> P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
            i.suggested_amount
          }">Click here</a></span>`;
        } else if (Number(i.suggested_payment_mode_id) === 3) {
          // Handle Bank Account Payment Mode
          message = `<span>PFA the Bank Account Details for the payment of ${
            i.suggested_amount
          } for ${i.suggested_program_name} (${
            i.suggested_program_days
          }) program.<br> ${i.suggested_payment_mode_details} ${
            i.free_hamper !== "No" && i.free_hamper
              ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
              : ""
          } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
        } else if (Number(i.suggested_payment_mode_id) === 2) {
          // Handle UPI Payment Mode
          message = `<span>Hi ${
            i.client_name
          }, <br> PFA the UPI details for the Amount of ${
            i.suggested_amount
          } for ${i.suggested_program_name} (${
            i.suggested_program_days
          }) program. <br> ${i.suggested_payment_mode_details} ${
            i.free_hamper !== "No" && i.free_hamper
              ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
              : ""
          } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
        } else if (Number(i.suggested_payment_mode_id) === 4) {
          // Handle Cash Collection Payment Mode
          message = `<span>Hi ${
            i.client_name
          },<br> Cash Collection for the amount of Rs. ${
            i.suggested_amount
          } for ${i.suggested_program_name} (${
            i.suggested_program_days
          }). <br> Date: ${moment(i.suggested_payment_expiry).format(
            "Do MMMM YYYY"
          )} <br> Contact Person: Abdul Shaikh (919158267868) ${
            i.free_hamper !== "No" && i.free_hamper
              ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
              : ""
          } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
        }

        return {
          client_details: {
            client_id: i.user_id,
            client_name: i.client_name,
            client_email: i.email_id,
            client_cs_notes: i.cs_notes,
            client_phone: i.phone,
            program_number: i.program_count,
            order_type: i.order_type,
            client_sub_user_status: i.sub_user_status,
            client_sub_order_id: i.current_program_sub_order_id,
            wallet: i.wallet,
            free_hamper: i?.free_hamper,
            ...(i.whatsapp_text ? { whatsapp_text: i.whatsapp_text } : {}),
          },
          program_details: {
            current_program_name: i.program_name,
            current_program_duration: `(${i.current_program_duration})`,
            current_program_mrp: i.mrp,
            current_program_amount_paid: i.paid_amount,
            current_program_payment_mode: i.payment_mode_name,
            current_program_session: `(${i.current_pending_session}/${i.total_sent_session})`,
            current_program_validity: i.current_program_validity,
            current_program_validity_used: Math.abs(
              i.current_program_validity_used
            ),
            advance_program_count:
              Number(i.advance_purchase_count) > 0
                ? Number(i.advance_purchase_count)
                : 0,
            current_expiry_date: i.current_expiry_date,
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },

          suggested_details: {
            suggested_id: i.suggested_id,
            suggested_program_id: i.suggested_program_id,
            suggested_program_session_id: i.suggested_program_session_id,
            suggested_program_name: i.suggested_program_name,
            suggested_program_duration: `(${i.suggested_program_days})`,
            suggested_program_mrp: i.suggested_program_mrp,
            suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
            suggested_payment_mode: i.suggested_payment_mode_name,
            suggested_payment_details: i.suggested_payment_mode_details,
            suggested_payment_link_shared: i.suggested_payment_mode_id
              ? true
              : false,
            suggested_payment_link_expiry: i.suggested_payment_mode_id
              ? moment(i.suggested_payment_expiry)
                  .add(5, "hours")
                  .add(30, "minutes")
              : false,
            suggested_payment_link: i.suggested_payment_link,
            suggested_mentor_note: i.suggested_mentor_note,
            suggested_date: i.suggested_at
              ? moment(i.suggested_at).format("DD-MMM-YYYY")
              : false,
            suggested_days_ago: i.suggested_at
              ? `(${moment(i.suggested_at).fromNow()})`
              : false,
            suggested_motivation_level: i.suggested_motivation_level,
            suggested_sale_status: i.suggested_sale_status,
            message,
            free_hamper: i?.free_hamper,
          },

          ...(showWeightDetails && {
            weight_details: {
              start_program_weight: Number(i.start_program_weight),
              latest_weight: Number(i.latest_weight),
              ...(Number(weightDifference) > 0
                ? {
                    lost_weight: Number(weightDifference),
                  }
                : { gained_weight: Number(weightDifference) }),
              goal_weight: Number(i.goal_weight),
              height: i.client_height,
            },
          }),

          ...(await Promise.resolve(extraObjects(i))),
        };
      })
    );
    return { data, total_page: Math.ceil(totalCount / limit), totalCount };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
const getFormattedLeadData = async ({
  extraSelectFields = [],
  extraConditions = [],
  extraJoins = [],
  page,
  limit,
  search,
  base_table = `${tables.userDetails} ud`,
  extraObjects = (i) => ({}),
  extraGroupBy = [],
  extraOrderBy = [],
}) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(COALESCE(ud.first_name, ''), ' ', COALESCE(ud.last_name, '')) as lead_name",
      "ud.email_id as lead_email",
      "CASE WHEN ud.phone_code NOT IN ('0') THEN CONCAT(ud.phone_code, ' ', ud.phone_number) ELSE ud.phone END AS lead_phone",
      "ud.gender as lead_gender",
      "ud.birth_date as lead_birth_date",
      "ud.added_date as lead_added_date",
      "sp.suggested_program_id as pitched_id",
      "sp.program_id as pitched_program_id",
      "sp.program_session_id as pitched_program_session_id",
      "spm.program_name as pitched_program_name",
      "sp.program_days as pitched_program_days",
      "ps.mrp as pitched_program_mrp",
      "ps.program_duration as suggested_program_days",
      "sp.suggested_amount as pitched_amount",
      "sp_paym.payment_mode_name as pitched_payment_mode_name",
      "sp_paym.payment_mode_details as pitched_payment_mode_details",
      "sp.payment_mode_id as pitched_payment_mode_id",
      "sp.payment_expiry as pitched_payment_expiry",
      "sp_pl.payment_link as pitched_payment_link",
      "sp.mentor_note as pitched_mentor_note",
      "sp.added_date as pitched_at",
      "hs.created as health_score_taken_date",
      "hs.health_category as health_score_health_category",
      "hs.weight as health_score_weight",
      "hs.height as health_score_height",
      "hs.body_mass_index as health_score_bmi",
      "hs.ideal_weight as health_score_ideal_weight",
      "hs.weight_difference as health_score_weight_difference",
      "hs.sleep_duration as health_score_sleep_duration",
      "hs.body_shape as health_score_body_shape",
      "hs.activity_level as health_score_activity_level",
      "hs.smoke_frequency as health_score_smoke_frequency",
      "hs.periods as health_score_periods",
      "hs.alcohol_frequency as health_score_alchohol_frequency",
      "hs.water_frequency as health_score_water_frequency",
      "hs.veg_fruits_frequency as health_score_fruit_frequency",
      "hs.source as device",
      "ls.source_name as current_source_name",
      "ls.source_group as current_source_group",
      "ud.lead_type as lead_type",
      "ud.sales_status as lead_status",
      "pls.source_name as primary_source_name",
      "pls.source_group as primary_source_group",
      "cl.key_insights as key_insights",
      "sp.free_hamper as free_hamper",
      ...extraSelectFields,
    ];

    const hasUserDetailsJoin = extraJoins.some((join) =>
      join.table.includes(`${tables.userDetails} ud`)
    );

    const joins = [
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "sp.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sp.program_session_id =  ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} spm`,
        on: "sp.program_id = spm.program_id",
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
      },
      {
        type: "LEFT",
        table: `${tables.healthScoreClient} hs`,
        on: "hs.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadSource} ls`,
        on: "ls.source_id = ud.current_lead_source",
      },
      {
        type: "LEFT",
        table: `${tables.leadSource} pls`,
        on: "ls.source_id = ud.primary_lead_source",
      },
      {
        type: "LEFT",
        table: `${tables.consultationLogs} cl`,
        on: "ud.user_id = cl.user_id",
      },
    ];

    if (hasUserDetailsJoin) {
      joins.unshift(...extraJoins);
    } else {
      joins.push(...extraJoins);
    }
    const conditions = [...extraConditions];

    const { results, totalCount } = await readRecord({
      table: base_table,
      selectFields,
      joins,
      conditions,
      pagination: { limit, page },
      ...(page && { countTotal: true }),
      ...(search && {
        search: {
          searchQuery: decodeURIComponent(search),
          searchFields: [
            "ud.user_id",
            "ud.first_name",
            "ud.last_name",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
      ...(extraGroupBy.length > 0 && { groupBy: [...extraGroupBy] }),
      ...(extraOrderBy.length > 0 && {
        orderBy: [...extraOrderBy],
      }),
    });
    const data = results.map((i) => {
      const gender = Number(i.lead_gender);
      const lead_added_date = i.lead_added_date;
      let message = "";
      const daysLeft = moment(i.pitched_payment_expiry).diff(moment(), "days");

      let displayDays;
      if (daysLeft > 0) {
        displayDays = `in the next ${daysLeft} Days`;
      } else if (daysLeft === 0) {
        displayDays = "Today";
      } else {
        displayDays = ""; // or "Expired" if you want to show past due
      }
      if (Number(i.pitched_payment_mode_id) === 1) {
        message = `<span>Hi ${i.lead_name},<br> PFA your payment link for <b>${
          i.pitched_program_name
        } (${i.suggested_program_days})</b> program for Amount <b>Rs.${
          i.pitched_amount
        }</b> <br> Click here: <a href="${i.pitched_payment_link}">${
          i.pitched_payment_link
        }</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
          i.pitched_payment_expiry
        ).format(
          "Do MMMM YYYY"
        )} which is ${displayDays}. Please ensure you use it before that. ${
          i?.free_hamper !== "No" && i?.free_hamper
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        } <br><br> P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
          i.pitched_amount
        }">Click here</a></span>`;
      } else if (Number(i.pitched_payment_mode_id) === 3) {
        // Handle Bank Account Payment Mode
        message = `<span>PFA the Bank Account Details for the payment of ${
          i.pitched_amount
        } for ${i.pitched_program_name} (${
          i.suggested_program_days
        }) program.<br> ${i.pitched_payment_mode_details} ${
          i?.free_hamper !== "No" && i?.free_hamper
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
      } else if (Number(i.pitched_payment_mode_id) === 2) {
        // Handle UPI Payment Mode
        message = `<span>Hi ${
          i.lead_name
        }, <br> PFA the UPI details for the Amount of ${i.pitched_amount} for ${
          i.pitched_program_name
        } (${i.suggested_program_days}) program. <br> ${
          i.pitched_payment_mode_details
        } ${
          i?.free_hamper !== "No" && i?.free_hamper
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
      } else if (Number(i.pitched_payment_mode_id) === 4) {
        // Handle Cash Collection Payment Mode
        message = `<span>Hi ${
          i.lead_name
        },<br> Cash Collection for the amount of Rs. ${i.pitched_amount} for ${
          i.pitched_program_name
        } (${i.suggested_program_days}). <br> Date: ${moment(
          i.pitched_payment_expiry
        ).format(
          "Do MMMM YYYY"
        )} <br> Contact Person: Abdul Shaikh (919158267868) ${
          i?.free_hamper !== "No" && i?.free_hamper
            ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
            : ""
        }<br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
      }

      return {
        lead_details: {
          lead_id: i.user_id,
          lead_name: i.lead_name,
          lead_email: i.lead_email,
          lead_phone: i.lead_phone,
          lead_gender:
            gender === 1 ? "Male" : gender === 2 ? "Female" : "Others",
          lead_birth_date: calculateAge(i.lead_birth_date),
          lead_added_date: `${moment(lead_added_date).format(
            "DD-MM-YYYY"
          )} ${moment(lead_added_date).fromNow()}`,
        },
        pitched_details: {
          pitched_id: i.pitched_id,
          pitched_program_id: i.pitched_program_id,
          pitched_program_session_id: i.pitched_program_session_id,
          pitched_program_name: i.pitched_program_name,
          pitched_program_duration: `(${i.suggested_program_days})`,
          pitched_program_mrp: i.pitched_program_mrp,
          pitched_program_qtd: i.pitched_amount ? i.pitched_amount : 0,
          pitched_payment_mode: i.pitched_payment_mode_name,
          pitched_payment_details: i.pitched_payment_mode_details,
          pitched_payment_link_shared: i.pitched_payment_mode_id ? true : false,
          pitched_payment_link_expiry: i.pitched_payment_mode_id
            ? i.pitched_payment_expiry
            : false,
          pitched_payment_link: i.pitched_payment_link,
          pitched_mentor_note: i.pitched_mentor_note,
          pitched_date: i.pitched_at
            ? moment(i.pitched_at).format("DD-MMM-YYYY")
            : false,
          pitched_days_ago: i.pitched_at
            ? `(${moment(i.pitched_at).fromNow()})`
            : false,
          message,
          free_hamper: i?.free_hamper,
        },
        health_score_details: {
          health_score_taken_date: i.health_score_taken_date,
          health_category: i.health_score_health_category?.toUpperCase(),
          weight_difference: i.health_score_weight_difference,
          latest_weight: i.health_score_weight,
          height: i.health_score_height,
          bmi: i.health_score_bmi,
          ideal_weight: i.health_score_ideal_weight,
          sleep_duration:
            healthData.sleep[i.health_score_sleep_duration] || "N/A",
          activity_level:
            healthData.activityLevels[i.health_score_activity_level] || "N/A",
          smoke_frequency:
            healthData.smokingFrequency[i.health_score_smoke_frequency] ||
            "N/A",
          ...(gender === 2 && {
            periods:
              healthData.periodsFrequency[i.health_score_periods] || "N/A",
          }),
          alcohol_frequency:
            healthData.alcoholConsumption[i.health_score_alchohol_frequency] ||
            "N/A",
          water_frequency:
            healthData.waterFrequency[i.health_score_water_frequency] || "N/A",
          fruit_frequency:
            healthData.veg_nonveg_frequency[i.health_score_fruit_frequency] ||
            "N/A",
        },
        source_and_status_details: {
          current_source_name: `${i.current_source_name}  ${
            leadSources[i.current_source_group] == "HS"
              ? i.device?.toLowerCase() == "web"
                ? "(Web)"
                : "(App)"
              : ""
          }`,
          current_source_group: leadSources[i.current_source_group],
          lead_type: i.lead_type,
          lead_status:
            Number(i.lead_status) === 0
              ? "To Engage"
              : Number(i.lead_status) === 1
              ? "1st Pitch"
              : Number(i.lead_status) === 2
              ? "Hot"
              : Number(i.lead_status) === 3
              ? "Warm"
              : Number(i.lead_status) === 4
              ? "Cold"
              : null,
          primary_source_name: i.primary_source_name,
          primary_source_group: leadSources[i.primary_source_group],
        },
        key_insights_details: i.key_insights
          ? { ...JSON.parse(i.key_insights) }
          : {},

        ...extraObjects(i),
      };
    });

    return { data, total_page: Math.ceil(totalCount / limit), totalCount };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

export {
  howzmyDayActiveFilterData,
  howzmyDayOCFilterData,
  howzmyDayLeadFilterData,
  overdueAndMissesActiveFilterData,
  overdueAndMissesCommonData,
  getFormattedUserData,
  getFormattedLeadData,
  todaysRiskAndMissesData,
  howsMyDayActiveFilterData,
  salesFollowupAndRiskActiveFilterData,
  salesOpportunitysActiveFilterData,
  howsMyTommorowActiveFilterData,
  mtdFollowUpsRisksLeadData,
  mtdFollowUpsRisksClientData,
};
