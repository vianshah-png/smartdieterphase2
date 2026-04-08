import { readRecord } from "../config/query.js";
import {
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonJoinsOC,
  getCommonSelectFields,
  getCommonSelectFieldsOC,
  joinsMap,
  mapLeadData,
  mapLeadDataNew,
  mapOCData,
  mapUserData,
  readRecordNewForLead,
  selectMap,
  withMap,
} from "../helper/common.js";
import { tables } from "../helper/constant.js";
import moment from "moment";
import UserVisitLog from "../models/userVisitLogModel.js";

const breakRequest = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id ",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
      "ohc.start_date break_start_date",
      "ohc.end_date break_end_date",
      "ohc.days as break_days",
      "ohc.onhold_note as break_note",
      "ohc.created_at as break_created_at",
    ];
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
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id  = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode  = paym.payment_mode_id",
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
        table: `${tables.onholdClients} ohc`,
        on: "ohc.user_id = ud.user_id AND ohc.sub_order_id  = ud.active_order_id",
      },
    ];
    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          { field: "ud.counsellor_assigned", operator: "=", value: mentor_id },
        ],
      },
      {
        field: "ohc.read_status",
        operator: "=",
        value: "0",
        raw: true,
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),

          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
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
        break_details: {
          break_start_date: moment(i.break_start_date).format("DD-MM-YYYY"),
          break_end_date: moment(i.break_end_date).format("DD-MM-YYYY"),
          break_days: i.break_days,
          break_note: i.break_note,
          break_created_at: moment(i.break_created_at).format("DD-MM-YYYY"),
        },
      };
    });
    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const upgradeRequest = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id ",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
      "ur.created_at as upgrade_request_made_at",
      "ur.status as upgrade_request_status",
      "sop.program_type as current_program_type",
    ];
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
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id  = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode  = paym.payment_mode_id",
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
        type: "INNER",
        table: `${tables.upgradeRequest} ur`,
        on: "ur.user_id = ud.user_id",
      },
    ];
    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "Cleanse active",
      },
      {
        field: "ur.status",
        operator: "=",
        value: "0",
        raw: true,
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),

          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
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
        upgrade_request_details: {
          upgrade_requested_at: `${moment(i.upgrade_request_made_at).format(
            "DD-MM-YYYY"
          )} ${moment(i.upgrade_request_made_at).fromNow()}}`,
          upgrade_request_status:
            Number(i.upgrade_request_status) === 0
              ? "Not Yet Upgraded"
              : "Upgraded",
          current_program_type:
            Number(i.current_program_type) === 0
              ? "Advance Purchase"
              : "Basic Stack",
        },
      };
    });
    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const ocAndLeadWithApp = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
  extraConditions,
}) => {
  console.log(page, limit, search, 507);
  try {
    let finalData = [];
    let count = 0;

     let conditions = [
       {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          {
            field: "cd.app_version",
            operator: "IS NOT",
            value: "NULL",
            raw: true,
          },
          { field: "cd.app_version", operator: "!=", value: "" },
          { field: "cd.user_type", operator: "=", value: "0" },
    ];
    if (Object.keys(extraConditions).length > 0) {
      if (extraConditions["country_id"]) {
        const countryId = extraConditions["country_id"];
        if (countryId == "0") {
          conditions.push({
            field: "cd.country_id",
            operator: "NOT IN",
            value: "(101)",
            raw: true,
          });
        } else {
          conditions.push({
            field: "cd.country_id",
            operator: "IN",
            value: [extraConditions["country_id"]],
          });
        }
      }
      
      if (extraConditions["source_group"]) {
        conditions.push({
          field: "cd.current_lead_source",
          operator: "IN",
          value: extraConditions["source_group"],
        });
      }
      if (extraConditions["age_max"] && extraConditions["age_min"]) {
        conditions.push({
          field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
          operator: "BETWEEN",
          value: [
            parseInt(extraConditions["age_min"]),
            parseInt(extraConditions["age_max"]),
          ],
        });
      }
      if (extraConditions["health_issues"]) {
        conditions.push({
          field: "cd.health_issues",
          operator: "JSON_CONTAINS",
          value: extraConditions["health_issues"].map((issue) => `"${issue}"`),
        });
      }
      if (extraConditions["month"] && extraConditions["year"]) {
        conditions.push({
          field: "cd.added_date",
          operator: "BETWEEN",
          value: [
            `${extraConditions["year"]}-${extraConditions["month"]}-01 00:00:00`,
            `${extraConditions["year"]}-${extraConditions["month"]}-31 23:59:59`,
          ],
        });
      }
      if (extraConditions["sales_status"]) {
        conditions.push({
          field: "cd.sales_status",
          operator: "=",
          value: extraConditions["sales_status"],
        });
      }
    }
    if (user_type === "Lead") {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),
          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),
          ...joinsMap.get("consultation"),
        ],
        conditions: conditions,
        withQueries: [...withMap.get("goals"), ...withMap.get("latest_health")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        pagination: { page, limit },
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
      });

      count = totalCount;
      console.log(data, "lead data");
      finalData = data.map((user) => mapLeadData({ details: user }));
    } else {
      let conditions = [
        { field: "cd.device", operator: "IS NOT", value: "NULL", raw: true },
      ];

      if (user_type === "OC") {
        conditions.push(
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: ["Completed", "Dropout", "Maintenance", "Fs"],
          },
          { field: "cd.mentor_assigned", operator: "=", value: mentor_id }
        );
      } else {
        conditions.push(
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.user_type", operator: "=", value: "1" }
        );
      }

      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id", "cd.device", "cd.app_version"],
        conditions,
        countTotal: true,
        pagination: { limit, page },
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
      });

      count = totalCount;
      if (users.length === 0) return { data: [], totalCount: 0 };

      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });

      finalData = users.map((user, index) =>
        mapUserData({
          user,
          details: details[index],
          extraMappings: {
            app_details: {
              device: users[index].device,
              version: users[index].app_version,
            },
          },
        })
      );
    }

    return { data: finalData, totalCount: count };
  } catch (error) {
    console.error("Error in ocAndLeadWithApp:", error);
    return { error };
  }
};

const ocAndLeadWithoutApp = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
}) => {
  try {
    let conditions = [
      { field: "cd.device", operator: "IS ", value: "NULL", raw: true },
    ];

    let finalData = [];
    let count = 0;

    // Handling different user types
    if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.sub_user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        { field: "cd.mentor_assigned", operator: "=", value: mentor_id }
      );

      // Fetching the user data
      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id"],
        conditions,
        countTotal: true,
        pagination: { limit, page },
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
      });
      console.log(users[0], totalCount, 471);

      if (users.length === 0) {
        return { data: [], totalCount: 0 };
      }

      // Generating userIds and orderById for further use
      const { userIds, orderById } = generateUserIdsAndOrderById(users);

      // Fetching user details based on the generated user IDs
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });
      console.log(details[0], 192);

      // Mapping the user data with the details
      finalData = users.map((user, index) => {
        const mappedData = mapUserData({ user, details: details[index] });
        return mappedData;
      });
      count = totalCount;
    } else {
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),
          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),
          ...joinsMap.get("consultation"),
        ],
        conditions: [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(mentor_id),
          },
          { field: "cd.device", operator: "IS", value: "NULL", raw: true },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        pagination: { page, limit },
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
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    }

    return { data: finalData, totalCount: count };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadWithAppAndNoHS = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
}) => {
  try {
    let conditions = [
      { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
      { field: "hs_latest.id", operator: "IS", value: "NULL", raw: true },
    ];

    let finalData = [];
    let count = 0;

    if (user_type === "OC") {
      // OC User Handling
      conditions.push(
        {
          field: "cd.sub_user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        { field: "cd.mentor_assigned", operator: "=", value: mentor_id }
      );

      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id"],
        conditions,
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `(
              SELECT *, ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created DESC) AS rn_latest 
              FROM ${tables.healthScoreClient}
            ) hs_latest`,
            on: "sop.sub_order_id = hs_latest.sub_order_id AND hs_latest.rn_latest = 1",
          },
        ],
        countTotal: true,
        pagination: { limit, page },
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
      });

      if (users.length === 0) return { data: [], totalCount: 0 };

      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });

      finalData = users.map((user, index) =>
        mapUserData({ user, details: details[index] })
      );
      count = totalCount;
    } else {
      // Lead Handling
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),
          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `(
              SELECT *, ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created DESC) AS rn_latest 
              FROM ${tables.healthScoreClient}
            ) hs_latest`,
            on: "cd.user_id = hs_latest.user_id AND hs_latest.rn_latest = 1",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),
          ...joinsMap.get("consultation"),
        ],
        conditions: [
          ...conditions,
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.user_type", operator: "=", value: "0" },
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        pagination: { page, limit },
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
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    }

    return { data: finalData, totalCount: count };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadWithAppAndNoConsultation = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
}) => {
  try {
    let conditions = [
      { field: "cd.device", operator: "IS", value: "NOT NULL", raw: true },
      {
        field: "csl.id",
        operator: "IS",
        value: "NULL",
        raw: true,
      },
    ];

    let finalData = [];
    let count = 0;

    if (user_type === "OC") {
      // OC User Handling
      conditions.push(
        {
          field: "cd.sub_user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        { field: "cd.mentor_assigned", operator: "=", value: mentor_id }
      );

      const { results: users, totalCount } = await readRecord({
        table: `${tables.userDetails} cd`,
        selectFields: ["cd.user_id"],
        conditions,
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sop`,
            on: "cd.active_order_id = sop.sub_order_id",
          },
          {
            type: "LEFT",
            table: `${tables.consultationLogs} csl`,
            on: "sop.sub_order_id = csl.sub_order_id",
          },
        ],
        countTotal: true,
        pagination: { limit, page },
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
      });

      if (users.length === 0) return { data: [], totalCount: 0 };

      const { userIds, orderById } = generateUserIdsAndOrderById(users);
      const details = await fetchUsersDetailsNew({
        ids: userIds,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
        },
        orderBy: orderById,
      });

      finalData = users.map((user, index) =>
        mapUserData({ user, details: details[index] })
      );
      count = totalCount;
    } else {
      // Lead Handling
      const { results: data, totalCount } = await readRecordNewForLead({
        table: `${tables.userDetails} cd`,
        selectFields: [
          ...selectMap.get("user_details"),
          ...selectMap.get("suggested_programs"),
          ...selectMap.get("health_score"),
          ...selectMap.get("goal_weight"),
          ...selectMap.get("goal"),
          ...selectMap.get("follow_up"),
          ...selectMap.get("source"),
          ...selectMap.get("consultation"),
        ],
        joins: [
          {
            type: "LEFT",
            table: `(
              SELECT *, ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created DESC) AS rn_latest 
              FROM ${tables.healthScoreClient}
            ) hs_latest`,
            on: "cd.user_id = hs_latest.user_id AND hs_latest.rn_latest = 1",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ma`,
            on: "cd.counsellor_assigned = ma.admin_user_id",
          },
          ...joinsMap.get("suggested_programs"),
          ...joinsMap.get("health_score"),
          ...joinsMap.get("goal_weight"),
          ...joinsMap.get("goal"),
          ...joinsMap.get("follow_up"),
          ...joinsMap.get("source"),
          ...joinsMap.get("consultation"),
        ],
        conditions: [
          ...conditions,
          { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
          { field: "cd.user_type", operator: "=", value: "0" }, // For "Lead"
        ],
        withQueries: [...withMap.get("goals")],
        groupBy: ["cd.user_id"],
        countTotal: true,
        pagination: { page, limit },
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
      });

      count = totalCount;
      finalData = data.map((user) => mapLeadData({ details: user }));
    }

    return { data: finalData, totalCount: count };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const notStarted = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.start_date as program_start_date",
      "sop.start_date_added_by",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id ",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
    ];
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
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id  = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode  = paym.payment_mode_id",
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
    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "notstarted",
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),
          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
          current_program_start_date: moment(i.program_start_date).format(
            "DD-MM-YYYY"
          ),
          start_date_added_by:
            Number(i.start_date_added_by) === 0
              ? "Purchase Day"
              : Number(i.start_date_added_by) === 1
              ? "Mentor"
              : "Client",
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
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
      };
    });
    console.log(data, 677);
    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const dormancy = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.last_session_sent_date",
      "sop.start_date as program_start_date",
      "sop.start_date_added_by",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id ",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
      "DATE_ADD(sop.last_session_sent_date, INTERVAL 10 DAY) AS dormancy_due_in",
    ];
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
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id  = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode  = paym.payment_mode_id",
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
    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
        ],
      },
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "Dormant",
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),
          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
          current_program_start_date: moment(i.program_start_date).format(
            "DD-MM-YYYY"
          ),
          start_date_added_by:
            Number(i.start_date_added_by) === 0
              ? "Purchase Day"
              : Number(i.start_date_added_by) === 1
              ? "Mentor"
              : "Client",
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
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
        dormancy_details: {
          last_sent_date:
            moment(i.last_session_sent_date).format("DD-MM-YYYY") ||
            i.last_session_sent_date,
          dormancy_due_in: i.dormancy_due_in,
        },
      };
    });
    console.log(data, totalCount, 904);
    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const onhold = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.start_date as program_start_date",
      "sop.start_date_added_by",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id ",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
      "ohc.start_date as onhold_start_date",
      "ohc.end_date as onhold_end_date",
      "ohc.days as onhold_days",
      "ohc.onhold_note as onhold_note",
    ];
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
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id  = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode  = paym.payment_mode_id",
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
        table: `${tables.onholdClients} ohc`,
        on: "ohc.user_id =ud.user_id AND ohc.sub_order_id = ud.active_order_id",
      },
    ];
    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "Onhold",
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),
          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
          current_program_start_date: moment(i.program_start_date).format(
            "DD-MM-YYYY"
          ),
          start_date_added_by:
            Number(i.start_date_added_by) === 0
              ? "Purchase Day"
              : Number(i.start_date_added_by) === 1
              ? "Mentor"
              : "Client",
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
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
        onhold_details: {
          onhold_start_date: moment(i.onhold_start_date).format("DD-MM-YYYY"),
          onhold_end_date: moment(i.onhold_end_date).format("DD-MM-YYYY"),
          onhold_days: i.onhold_days,
          onhold_note: i.onhold_note,
        },
      };
    });
    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const linkExpiring = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name,' ',ud.last_name) as client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions as current_sent_session",
      "sop.total_sessions as total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY,CURDATE(),sop.start_date) as current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.start_date as program_start_date",
      "sop.start_date_added_by",
      "ud.latest_weight",
      "sp.program_id as suggested_program_id ",
      "sp.program_session_id as suggested_program_session_id ",
      "sp.suggested_amount as suggested_amount",
      "spm.program_name as suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date as suggested_at",
      "aspd.goal_weight as goal_weight",
      "ud.height as client_height",
      "ad.official_phone as admin_phone",
      "ps.mrp as suggested_program_mrp",
      "ps.program_id as program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name as suggested_payment_mode_name",
      "sp_paym.payment_mode_details as suggested_payment_mode_details",
      "sp.payment_expiry as suggested_payment_expiry",
      "sp_pl.payment_link as suggested_payment_link",
      "sp.mentor_note as suggested_mentor_note",
      "sp.motivation_level as suggested_motivation_level",
      "sp.status as suggested_sale_status",
      "all_paym.expiry_at",
      "all_paym.amount",
    ];
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
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id  = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode  = paym.payment_mode_id",
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
        type: "INNER",
        table: `${tables.paymentLinks} all_paym`,
        on: "all_paym.user_id = ud.user_id",
      },
    ];
    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        field: "all_paym.expiry_at",
        operator: "BETWEEN",
        value: [
          moment().format("YYYY-MM-DD"), // Today
          moment().add(2, "days").format("YYYY-MM-DD"), // 2 days from now
        ],
      },
    ];
    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),
          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
          current_program_start_date: moment(i.program_start_date).format(
            "DD-MM-YYYY"
          ),
          start_date_added_by:
            Number(i.start_date_added_by) === 0
              ? "Purchase Day"
              : Number(i.start_date_added_by) === 1
              ? "Mentor"
              : "Client",
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
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
        link_details: {
          link_expiring_in: i.expiry_at,
          link_amount: i.amount,
        },
      };
    });
    console.log(data, 1378);
    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const highFrequencyPV = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
}) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name, ' ', ud.last_name) AS client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions AS current_sent_session",
      "sop.total_sessions AS total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY, CURDATE(), sop.start_date) AS current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.start_date AS program_start_date",
      "sop.start_date_added_by",
      "ud.latest_weight",
      "sp.program_id AS suggested_program_id",
      "sp.program_session_id AS suggested_program_session_id",
      "sp.suggested_amount AS suggested_amount",
      "spm.program_name AS suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date AS suggested_at",
      "aspd.goal_weight AS goal_weight",
      "ud.height AS client_height",
      "ad.official_phone AS admin_phone",
      "ps.mrp AS suggested_program_mrp",
      "ps.program_id AS program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name AS suggested_payment_mode_name",
      "sp_paym.payment_mode_details AS suggested_payment_mode_details",
      "sp.payment_expiry AS suggested_payment_expiry",
      "sp_pl.payment_link AS suggested_payment_link",
      "sp.mentor_note AS suggested_mentor_note",
      "sp.motivation_level AS suggested_motivation_level",
      "sp.status AS suggested_sale_status",
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "pm.program_id = sop.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sp.program_session_id = ps.program_session_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode = paym.payment_mode_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} sp_paym`,
        on: "sp.payment_mode_id = sp_paym.payment_mode_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentLinks} sp_pl`,
        on: "sp.payment_link_id = sp_pl.id",
      },
      {
        type: "INNER",
        table: `${tables.inAppPageVisitLog} iav`,
        on: "iav.user_id = ud.user_id AND DATE(iav.visit_date) = CURDATE()",
      },
    ];

    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        field: "ud.sub_user_status",
        operator: user_type === "oc" ? "IN" : "=",
        value:
          user_type === "oc"
            ? ["completed", "fs", "dropout", "maintenance"]
            : user_type === "active"
            ? "Active"
            : "Inactive",
      },
    ];

    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      having: [
        {
          field: "COUNT(iav.visit_date)",
          operator: ">",
          value: 5,
        },
      ],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });

    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),
          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
          current_program_start_date: moment(i.program_start_date).format(
            "DD-MM-YYYY"
          ),
          start_date_added_by:
            Number(i.start_date_added_by) === 0
              ? "Purchase Day"
              : Number(i.start_date_added_by) === 1
              ? "Mentor"
              : "Client",
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: Number(i.start_program_weight),
          latest_weight: Number(i.latest_weight),
          ...(Number(weightDifference) > 0
            ? { lost_weight: Number(weightDifference) }
            : { gained_weight: Number(weightDifference) }),
          goal_weight: Number(i.goal_weight),
          height: i.client_height,
        },
      };
    });

    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const ocAndLeadLinkExpiring = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
}) => {
  try {
    let conditions = [
      {
        field: "sp.suggested_by",
        operator: "=",
        value: mentor_id,
      },
      {
        field: "TIMESTAMPDIFF(DAY,sp.payment_expiry,CURDATE())",
        operator: "BETWEEN",
        value: [-2, 0],
      },
    ];
    if (user_type === "OC") {
      conditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
    } else {
      conditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["cd.user_id"],
      conditions,
      pagination: { page, limit },
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
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
    });
    console.log(users, 2144);
    if (users.length === 0) {
      return { data: [], totalCount: 0 };
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
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const mappedData = mapUserData({ user, details: details[index] });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const lessLoss = async ({ mentor_id, page, limit, search }) => {
  try {
    const selectFields = [
      "ud.user_id",
      "CONCAT(ud.first_name, ' ', ud.last_name) AS client_name",
      "ud.email_id",
      "ud.phone",
      "ud.sub_user_status",
      "ud.active_order_id",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status IN (1, 3)) AS program_count",
      "pm.program_name",
      "sop.mrp",
      "sop.sent_sessions AS current_sent_session",
      "sop.total_sessions AS total_sent_session",
      "TIMESTAMPDIFF(DAY, sop.start_date, sop.expiry_date) AS current_program_validity",
      "TIMESTAMPDIFF(DAY, CURDATE(), sop.start_date) AS current_program_validity_used",
      "(sop.total_sessions * 10) AS current_program_duration",
      "(SELECT COUNT(*) FROM sub_orders_programs sop WHERE sop.user_id = ud.user_id AND sop.program_status = 4) AS advance_purchase_count",
      "sop.paid_amount",
      "sop.start_program_weight",
      "sop.start_date AS program_start_date",
      "sop.start_date_added_by",
      "ud.latest_weight",
      "sp.program_id AS suggested_program_id",
      "sp.program_session_id AS suggested_program_session_id",
      "sp.suggested_amount AS suggested_amount",
      "spm.program_name AS suggested_program_name",
      "sp.program_days",
      "sp.payment_link_id",
      "sp.added_date AS suggested_at",
      "aspd.goal_weight AS goal_weight",
      "ud.height AS client_height",
      "ad.official_phone AS admin_phone",
      "ps.mrp AS suggested_program_mrp",
      "ps.program_id AS program_session_program_id",
      "sp.program_id",
      "paym.payment_mode_name",
      "sp_paym.payment_mode_name AS suggested_payment_mode_name",
      "sp_paym.payment_mode_details AS suggested_payment_mode_details",
      "sp.payment_expiry AS suggested_payment_expiry",
      "sp_pl.payment_link AS suggested_payment_link",
      "sp.mentor_note AS suggested_mentor_note",
      "sp.motivation_level AS suggested_motivation_level",
      "sp.status AS suggested_sale_status",
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "pm.program_id = sop.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "sp.suggested_program_id = ud.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sp.program_session_id = ps.program_session_id",
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
        table: `${tables.orderDetails} od`,
        on: "od.order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "od.payment_mode = paym.payment_mode_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} sp_paym`,
        on: "sp.payment_mode_id = sp_paym.payment_mode_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentLinks} sp_pl`,
        on: "sp.payment_link_id = sp_pl.id",
      },
      {
        type: "LEFT",
        table: `${tables.weightRecords} wr`,
        on: "wr.sub_order_id = sop.sub_order_id AND wr.session = sop.sent_sessions",
      },
    ];

    const conditions = [
      {
        orConditions: [
          { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        field: "ud.sub_user_status",
        operator: "=",
        value: "Active",
      },
      {
        field: "wr.day_status",
        operator: "=",
        value: 10,
      },
      {
        field: "sop.expiry_date",
        operator: ">",
        value: "CURRENT_DATE",
        raw: true,
      },
      {
        field: `((sop.total_sessions * 10 = 30
        AND sop.sent_sessions = 2
        AND (sop.start_program_weight - wr.weight) < 1.5) 
       OR (sop.total_sessions * 10 = 60
           AND sop.sent_sessions = 3
           AND (sop.start_program_weight - wr.weight) < 3.0) 
       OR (sop.total_sessions * 10 = 90
           AND sop.sent_sessions = 5
           AND (sop.start_program_weight - wr.weight) < 3.0) )`,
        operator: "",
        value: "",
        raw: true,
      },
    ];

    const { results, totalCount } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields,
      joins,
      conditions,
      groupBy: ["ud.user_id"],
      countTotal: true,
      pagination: { limit, page },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });

    const data = results.map((i) => {
      const weightDifference = Math.abs(
        Number(i.start_program_weight) - Number(i.latest_weight)
      ).toFixed(2);
      return {
        user_details: {
          client_id: i.user_id,
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          program_number: i.program_count,
          client_sub_user_status: i.sub_user_status,
        },
        program_details: {
          current_program_name: i.program_name,
          current_program_duration: i.current_program_duration,
          current_program_mrp: i.mrp,
          current_program_amount_paid: i.paid_amount,
          current_program_payment_mode: i.payment_mode_name,
          current_program_session: `(${i.current_sent_session}/${i.total_sent_session})`,
          current_program_validity: i.current_program_validity,
          current_program_validity_used: Math.abs(
            i.current_program_validity_used
          ),
          advance_program_count:
            Number(i.advance_purchase_count) > 0
              ? Number(i.advance_purchase_count)
              : 0,
          current_program_start_date: moment(i.program_start_date).format(
            "DD-MM-YYYY"
          ),
          start_date_added_by:
            Number(i.start_date_added_by) === 0
              ? "Purchase Day"
              : Number(i.start_date_added_by) === 1
              ? "Mentor"
              : "Client",
        },
        suggested_details: {
          suggested_program_id: i.suggested_program_id,
          suggested_program_session_id: i.suggested_program_session_id,
          suggested_program_name: i.suggested_program_name,
          suggested_duration: `(${i.program_days})`,
          suggested_program_mrp: i.suggested_program_mrp,
          suggested_program_qtd: i.suggested_amount ? i.suggested_amount : 0,
          suggested_payment_mode: i.suggested_payment_mode_name,
          suggested_payment_mode_details: i.suggested_payment_mode_details,
          suggested_payment_link_shared: i.payment_link_id ? true : false,
          suggested_payment_link_expiry: i.payment_link_id
            ? moment(i.suggested_payment_expiry).fromNow()
            : false,
          suggested_payment_link: i.suggested_payment_link,
          suggested_mentor_note: i.suggested_mentor_note,
          suggested_date: i.suggested_at
            ? moment(i.suggested_at).format("DD-MMM-YYYY")
            : false,
          suggested_days_ago: i.suggested_at
            ? `(${moment(i.suggested_at).fromNow()})`
            : false,
          suggested_motivation_level:
            Number(i.suggested_motivation_level) === 0
              ? "Low"
              : Number(i.suggested_motivation_level) === 1
              ? "Medium"
              : "High",
          suggested_sale_status:
            Number(i.suggested_sale_status) === 0
              ? "Pitch"
              : Number(i.suggested_sale_status) === 1
              ? "HOT"
              : Number(i.suggested_sale_status) === 2
              ? "WARM"
              : "COLD",
        },
        weight_details: {
          start_program_weight: Number(i.start_program_weight),
          latest_weight: Number(i.latest_weight),
          ...(Number(weightDifference) > 0
            ? { lost_weight: Number(weightDifference) }
            : { gained_weight: Number(weightDifference) }),
          goal_weight: Number(i.goal_weight),
          height: i.client_height,
        },
      };
    });

    return { data, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadHighFrequencyPV = async ({
  mentor_id,
  page,
  limit,
  user_type,
  search,
}) => {
  try {
    let conditions = [
      {
        field: "cd.mentor_assigned", // ? condition to check the user for given mentor
        operator: "=",
        value: mentor_id,
      },
      {
        field: "iapv.visit_date", // ? condition to check visite date of user to be today's
        operator: "=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    if (user_type === "OC") {
      conditions.push({
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      });
    } else {
      conditions.push({
        field: "cd.user_type",
        operator: "=",
        value: "0",
      });
    }
    const { results: users, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["cd.user_id"],
      conditions,
      pagination: { page, limit },
      joins: [
        {
          type: "LEFT",
          table: `${tables.inAppPageVisitLog} iapv`,
          on: "cd.user_id = iapv.user_id",
        },
      ],
      countTotal: true,
      groupBy: ["cd.user_id"],
      having: [
        { field: "COUNT(iapv.user_id)", operator: ">=", value: 5, raw: true },
      ],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(  .first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
    });
    console.log(users, 2144);
    if (users.length === 0) {
      return { data: [], totalCount: 0 };
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users);
    const details = await fetchUsersDetailsNew({
      ids: userIds,
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
      },
      orderBy: orderById,
    });
    console.log(details[0], 192);
    const finalData = users.map((user, index) => {
      const mappedData = mapUserData({ user, details: details[index] });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const leadTriggers = async ({
  mentor_id,
  page,
  limit,
  sales_status,
  search,
}) => {
  try {
    let count = 0;
    let finalData = [];
    let conditions = [
      { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
      {
        field: "DATEDIFF(CURDATE(),lal1.assign_date)",
        operator: ">",
        value: sales_status === "0" || sales_status === "2" ? 7 : 15,
      },
      { field: "cd.sales_status", operator: "=", value: sales_status },
      { field: "cd.user_type", operator: "=", value: "0" },
      {
        field: "cd.counsellor_assigned",
        operator: "=",
        value: parseInt(mentor_id),
      },
    ];
    const { results: data, totalCount } = await readRecordNewForLead({
      table: `${tables.userDetails} cd`,
      selectFields: [
        ...selectMap.get("user_details"),
        ...selectMap.get("suggested_programs"),
        ...selectMap.get("health_score"),
        ...selectMap.get("goal_weight"),
        ...selectMap.get("goal"),
        ...selectMap.get("follow_up"),
        ...selectMap.get("source"),
        ...selectMap.get("consultation"),
      ],
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
        {
          type: "LEFT",
          table: `${tables.adminUsers} ma`,
          on: "cd.counsellor_assigned = ma.admin_user_id",
        },
        ...joinsMap.get("suggested_programs"),
        ...joinsMap.get("health_score"),
        ...joinsMap.get("goal_weight"),
        ...joinsMap.get("goal"),
        ...joinsMap.get("follow_up"),
        ...joinsMap.get("source"),
        ...joinsMap.get("consultation"),
      ],
      conditions: [
        ...conditions,
        { field: "cd.counsellor_assigned", operator: "=", value: mentor_id },
        { field: "cd.user_type", operator: "=", value: "0" }, // For "Lead"
      ],
      withQueries: [...withMap.get("goals")],
      groupBy: ["cd.user_id"],
      countTotal: true,
      pagination: { page, limit },
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
    });

    count = totalCount;
    finalData = data.map((user) => mapLeadData({ details: user }));
    console.log(finalData, 2334);
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error, 2687);
    return { error };
  }
};
const ocTriggers = async ({ mentor_id, page, limit, sales_status, search }) => {
  try {
    let conditions = [
      {
        field: `DATEDIFF(CURDATE(),DATE(sp.added_date))`,
        operator: ">",
        value: sales_status === "0" || sales_status === "2" ? 7 : 15,
      },
      { field: "cd.sales_status", operator: "=", value: sales_status },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "sp.suggested_by",
        operator: "=",
        value: parseInt(mentor_id),
      },
      {
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Completed", "Dropout", "Maintenance", "Fs"],
      },
    ];
    const { results: users, totalCount } = await readRecord({
      selectFields: ["cd.user_id"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
      conditions: conditions,
      pagination: { page, limit },
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
    });
    console.log(users, 2334);
    if (users.length === 0) {
      return { data: [], totalCount: 0 };
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users); // ? return the userIds array and orderById which is used for ORDER BY clause in SQL querie
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
      const mappedData = mapUserData({ user, details: details[index] });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const activeTriggers = async ({
  mentor_id,
  page,
  limit,
  sales_status,
  search,
}) => {
  try {
    let conditions = [
      {
        field: `DATEDIFF(CURDATE(),DATE(sp.added_date))`,
        operator: ">",
        value: sales_status === "0" || sales_status === "2" ? 7 : 15,
      },
      { field: "cd.sales_status", operator: "=", value: sales_status },
      { field: "cd.user_type", operator: "=", value: "1" },
      {
        field: "sp.suggested_by",
        operator: "=",
        value: parseInt(mentor_id),
      },
      {
        field: "cd.sub_user_status",
        operator: "IN",
        value: ["Active", "notstarted", "Onhold", "Dormant"],
      },
    ];
    const { results: users, totalCount } = await readRecord({
      selectFields: ["cd.user_id"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "cd.suggested_program_id = sp.suggested_program_id",
        },
      ],
      conditions: conditions,
      pagination: { page, limit },
      countTotal: true,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(ud.first_name, ' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });
    console.log(users, 2334);
    if (users.length === 0) {
      return { data: [], totalCount: 0 };
    }
    const { userIds, orderById } = generateUserIdsAndOrderById(users); // ? return the userIds array and orderById which is used for ORDER BY clause in SQL querie
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
      const mappedData = mapUserData({ user, details: details[index] });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};
const leadBifurcation = async ({
  mentor_id,
  status,
  page,
  limit,
  search,
  month = null,
  year = null,
  extraConditions,
}) => {
  try {
    let finalData = [];
    let count = 0;
    const conditions = [
      {
        field: "cd.counsellor_assigned",
        operator: "=",
        value: parseInt(mentor_id),
      },
      ...(status !== "all"
        ? [
            {
              field: "cd.sales_status",
              operator: "=",
              value: String(status),
            },
          ]
        : []),
      {
        field: "cd.user_type",
        operator: "=",
        value: "0",
      },
    ];
    if (Object.keys(extraConditions).length > 0) {
      if (extraConditions["country_id"]) {
        const countryId = extraConditions["country_id"];
        if (countryId == "0") {
          conditions.push({
            field: "cd.country_id",
            operator: "NOT IN",
            value: "(101)",
            raw: true,
          });
        } else {
          conditions.push({
            field: "cd.country_id",
            operator: "IN",
            value: [extraConditions["country_id"]],
          });
        }
      }
      if (extraConditions["source_group"]) {
        conditions.push({
          field: "cd.current_lead_source",
          operator: "IN",
          value: extraConditions["source_group"],
        });
      }
      if (extraConditions["age_max"] && extraConditions["age_min"]) {
        conditions.push({
          field: "TIMESTAMPDIFF(YEAR, cd.birth_date, CURDATE())",
          operator: "BETWEEN",
          value: [
            parseInt(extraConditions["age_min"]),
            parseInt(extraConditions["age_max"]),
          ],
        });
      }
      if (extraConditions.health_issues) {
        conditions.push({
          field: "cd.health_issues",
          operator: "JSON_CONTAINS",
          value: extraConditions.health_issues.map((issue) => `"${issue}"`),
        });
      }
      if (month && year) {
        conditions.push({
          field: "cd.added_date",
          operator: "BETWEEN",
          value: [
            `${year}-${month}-01 00:00:00`,
            `${year}-${month}-31 23:59:59`,
          ],
        });
      }

      if(extraConditions.sub_filter_query == 'to_pay'){

        console.log(extraConditions.sub_filter_query,111122223333);
        conditions.push({
          field: "cd.sub_sales_status",
          operator: "LIKE",
          value: "to pay",
        });
      }

        if(extraConditions.sub_filter_query == 'pay_later'){
          conditions.push({
            field: "cd.sub_sales_status",
            operator: "LIKE",
            value: "pay later",
          });
        }

        
          if(extraConditions.sub_filter_query == 'negotiating_on_price'){
            conditions.push({
              field: "cd.sub_sales_status",
              operator: "LIKE",
              value: "negotiating",
            });
          }

            if(extraConditions.sub_filter_query == 'rate_shared'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "rate shared",
              });
            }

            if(extraConditions.sub_filter_query == 'build_trust_faith'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "trust",
              });
            }


            if(extraConditions.sub_filter_query == 'not_for_special_stack'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "special stack",
              });
            }


            if(extraConditions.sub_filter_query == 'not_interested'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "not interested",
              });
            }

            if(extraConditions.sub_filter_query == 'doing_plan_somewhere_else'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "somewhere else",
              });
            }
            if(extraConditions.sub_filter_query == 'just_for_knowledge'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "just for knowledge",
              });
            }

            if(extraConditions.sub_filter_query == 'unresponsive'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "unresponsive",
              });
            }

            if(extraConditions.sub_filter_query == 'discard'){
              conditions.push({
                field: "cd.sub_sales_status",
                operator: "LIKE",
                value: "discard",
              });
            }
    }

    const { results: data, totalCount } = await readRecordNewForLead({
      table: `${tables.userDetails} cd`,
      selectFields: [...getCommonSelectFields()],
      joins: [...getCommonJoins()],
      conditions,
      withQueries: [...withMap.get("latest_health")],
      groupBy: ["cd.user_id"],
      orderBy: ["cd.added_date DESC"],
      countTotal: true,
      pagination: { page, limit },
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
    });

    count = totalCount;
    finalData = data.map((user) => mapLeadDataNew({ details: user ,addExtraKeyTo: {
        user_details: {
          
                whatsapp_text: Number(user?.old_wallet) <= 999 ?`Hi ${user.user_name || "User"},
    
*7-Day Free Gut-Reset Challenge!*
*The Challenge has started, Register ASAP.*

All the tips will be shared on our BN App. 
Download now: http://www.balancenutrition.in/download-bn-app

Let me know if you need any help :)
    `:`Hi ${user?.user_name || "User"},
Sadly, last night your BN wallet balance of Rs.${user?.old_wallet} expired leaving Rs.00 as your current balance ☹️

We had a great chance to save up to Rs.18000 on your next program purchase with discount offers that come rarely. 

Let me know if I should talk to the management & see if we can avail this offer until tonight.`
        },
      },}));
    return { data: finalData, totalCount: count };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadPageVisit = async ({ mentor_id, search, user_type }) => {
  try {
    let finalData = [];
    let count = 0;
    const conditions = [{ field: "rn", operator: "=", value: 1 }];
    const selectFields = [
      ...getCommonSelectFields(),
      "pvl.visit_date",
      "pvl.visit_time",
      "pvpm.program_name as visit_program_name",
    ];
    const joins = [
      {
        type: "INNER",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = pvl.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pvpm`,
        on: "pvl.program_id = pvpm.program_id",
      },
      ...getCommonJoins(),
    ];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
      selectFields.push(...selectMap.get("previous_program")),
        joins.push(...joinsMap.get("previous_program"));
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [
        {
          name: "page_visit_latest",
          query: `SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY visit_date DESC, visit_time DESC
         ) AS rn
  FROM in_app_page_visit_log 
  WHERE DATE(visit_date) BETWEEN '${moment()
    .startOf("month")
    .format("YYYY-MM-DD")}' AND '${moment()
            .endOf("day")
            .format("YYYY-MM-DD")}' AND page_type = 1`,
        },
        ...withMap.get("latest_health"),
      ],
      selectFields,
      table: `page_visit_latest pvl`,
      joins,
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      conditions,
      countTotal: true,
      groupBy: ["cd.user_id"],
    });
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    finalData = data.map((item, index) => {
      const mappedData = mapFunction({
        details: item,
        extraMappings: {
          page_visit_details: {
            visit_program_name: `${item.visit_program_name}`,
            visit_date: moment(item.visit_date).format("Do MMM YYYY"),
            visit_time: item.visit_time,
          },
        },
      });
      return mappedData;
    });
    count = totalCount;
    return { data: finalData, totalCount: count };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadWallet = async ({ mentor_id, user_type, search }) => {
  try {
    const conditions = [{ field: "cd.my_wallet", operator: ">=", value: 3000 }];
    const selectFields = [];
    const joins = [];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
      selectFields.push(...getCommonSelectFields());
      joins.push(...getCommonJoins());
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
      selectFields.push(...getCommonSelectFieldsOC());
      joins.push(...getCommonJoinsOC());
    }

    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields,
      table: `${tables.userDetails} cd`,
      joins,
      conditions,
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      countTotal: true,
    });
    console.log(data, 3218);
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = data.map((item, index) => {
      const mappedData = mapFunction({ details: item });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadCouponUnlocked = async ({ mentor_id, user_type, search }) => {
  try {
    const conditions = [
      {
        field: "JSON_VALID(la.coupon)",
        operator: "",
        value: "",
        raw: true,
      },
      {
        field: "DATE(JSON_UNQUOTE(JSON_EXTRACT(la.coupon,'$.end_date')))",
        operator: ">=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    const selectFields = [];
    const joins = [
      {
        type: "INNER",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = la.user_id",
      },
    ];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
      selectFields.push(...getCommonSelectFields());
      joins.push(...getCommonJoins());
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
      selectFields.push(...getCommonSelectFieldsOC());
      joins.push(...getCommonJoinsOC());
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields,
      table: `${tables.leadsActivatedFeatures} la`,
      joins,
      conditions,
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      countTotal: true,
    });
    console.log(data, 3218);
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = data.map((item, index) => {
      const mappedData = mapFunction({ details: item });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadSpinToWin = async ({ mentor_id, user_type, search }) => {
  try {
    const conditions = [
      {
        field: "DATE(pd.added_date) + INTERVAL 2 DAY",
        operator: "<=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    const selectFields = ["pd.prize", "pd.added_date"];
    const joins = [
      {
        type: "INNER",
        table: `${tables.userDetails} cd`,
        on: "cd.user_id = pd.user_id",
      },
    ];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
      selectFields.push(...getCommonSelectFields());
      joins.push(...getCommonJoins());
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "IN",
          value: ["Completed", "Dropout", "Maintenance", "Fs"],
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
      selectFields.push(...getCommonSelectFieldsOC());
      joins.push(...getCommonJoinsOC());
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields,
      table: `${tables.prizeDetails} pd`,
      joins,
      conditions,
      groupBy: ["cd.user_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(cd.first_name, ' ', cd.last_name)",
          "cd.email_id",
          "cd.phone",
        ],
      },
      countTotal: true,
    });
    console.log(data, 3218);
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = data.map((item, index) => {
      const mappedData = mapFunction({
        details: item,
        extraMappings: {
          prize_details: {
            prize: item.prize,
            added_date: moment(item.added_date).format("Do MMM YYYY"),
          },
        },
      });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadVisitDetails = async ({
  mentor_id,
  user_type,
  search,
  page,
}) => {
  try {
    const startOfDate = new Date();
    startOfDate.setHours(0, 0, 0, 0);
    const endOfDate = new Date(startOfDate);
    endOfDate.setHours(23, 59, 59, 999);
    const [userIdGroup] = await UserVisitLog.aggregate([
      {
        $match: {
          page: page,
          createdAt: { $gte: startOfDate, $lte: endOfDate },
        },
      },
      {
        $group: {
          _id: null,
          user_ids: { $addToSet: "$user_id" },
        },
      },
      {
        $project: {
          _id: 0,
          user_ids: 1,
        },
      },
    ]);
    const userIds = userIdGroup?.user_ids || [];

    const commonSelectsFunction =
      user_type === "Lead" ? getCommonSelectFields : getCommonSelectFieldsOC;
    const commonJoinsFunction =
      user_type === "Lead" ? getCommonJoins : getCommonJoinsOC;
    const conditions = [];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
    }
    conditions.push({ field: "cd.user_id", operator: "IN", value: userIds });
    const { results, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...commonSelectsFunction()],
      table: `${tables.userDetails} cd`,
      joins: [...commonJoinsFunction()],
      conditions,
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
    });
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = results.map((item) => {
      const mappedData = mapFunction({ details: item });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadAlcoholMenuFilled = async ({ mentor_id, user_type, search }) => {
  try {
    const commonSelectsFunction =
      user_type === "Lead" ? getCommonSelectFields : getCommonSelectFieldsOC;
    const commonJoinsFunction =
      user_type === "Lead" ? getCommonJoins : getCommonJoinsOC;
    const conditions = [
      {
        field: "DATE(uam.added_date)",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...commonSelectsFunction(), "uam.*"],
      table: `${tables.userAlcoholMenu} uam`,
      joins: [
        {
          type: "INNER",
          table: `(
           SELECT MAX(uam.added_date) AS max_created_at, uam.user_id
           FROM ${tables.userAlcoholMenu} uam
           GROUP BY uam.user_id
          ) uam_max`,
          on: "uam.added_date = uam_max.max_created_at AND uam.user_id = uam_max.user_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = uam.user_id",
        },
        ...commonJoinsFunction(),
      ],
      conditions,
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
    });
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = data.map((item) => {
      const mappedData = mapFunction({
        details: item,
        extraMappings: {
          alcohol_menu: item.alcohol_menu ? JSON.parse(item.alcohol_menu) : {},
          nutritional_info: {
            total_calories: item.total_calories,
            excess_calories: item.excess_calories,
            alcohol_calories: item.alcohol_calories,
            mixers_calories: item.mixers_calories,
          },
        },
      });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadRestaurantMenuFilled = async ({
  mentor_id,
  user_type,
  search,
}) => {
  try {
    const commonSelectsFunction =
      user_type === "Lead" ? getCommonSelectFields : getCommonSelectFieldsOC;
    const commonJoinsFunction =
      user_type === "Lead" ? getCommonJoins : getCommonJoinsOC;
    const conditions = [
      {
        field: "DATE(urm.added_date)",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [...commonSelectsFunction(), "urm.*"],
      table: `${tables.userRestaurantMenu} urm`,
      joins: [
        {
          type: "INNER",
          table: `(
           SELECT MAX(urm.added_date) AS max_created_at, urm.user_id
           FROM ${tables.userRestaurantMenu} urm
           GROUP BY urm.user_id
          ) urm_max`,
          on: "urm.added_date = urm_max.max_created_at AND urm.user_id = urm_max.user_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = urm.user_id",
        },
        ...commonJoinsFunction(),
      ],
      conditions,
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
    });
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = data.map((item) => {
      const mappedData = mapFunction({
        details: item,
        extraMappings: {
          food_menu: item.food_menu ? JSON.parse(item.food_menu) : {},
          nutritional_info: {
            total_calories: item.total_calories,
            excess_calories: item.excess_calories,
            total_protein: item.total_protein,
            total_carbs: item.total_carbs,
            total_fat: item.total_fat,
          },
        },
      });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

const ocAndLeadRecipeBookCreated = async ({ mentor_id, user_type, search }) => {
  try {
    const commonSelectsFunction =
      user_type === "Lead" ? getCommonSelectFields : getCommonSelectFieldsOC;
    const commonJoinsFunction =
      user_type === "Lead" ? getCommonJoins : getCommonJoinsOC;
    const conditions = [
      {
        field: "DATE(urc.created_date)",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      },
    ];
    if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
    } else if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        },
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        }
      );
    }
    const { results: data, totalCount } = await readRecordNewForLead({
      withQueries: [...withMap.get("latest_health")],
      selectFields: [
        ...commonSelectsFunction(),
        "urc.chapter_name",
        "CONCAT('[',GROUP_CONCAT(CONCAT('\"',ubr.recipe_name,'\"')),']') as bookmarked_recipes",
      ],
      table: `${tables.recipeChapters} urc`,
      joins: [
        {
          type: "INNER",
          table: `(
           SELECT MAX(urc.created_date) AS max_created_at, urc.user_id
           FROM ${tables.recipeChapters} urc
           GROUP BY urc.user_id
          ) urc_max`,
          on: "urc.created_date = urc_max.max_created_at AND urc.user_id = urc_max.user_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = urc.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.bookmarkedRecipes} ubr`,
          on: "urc.chapter_id = ubr.chapter_id AND urc.user_id = ubr.user_id",
        },
        ...commonJoinsFunction(),
      ],
      conditions,
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
    });
    const mapFunction = user_type === "Lead" ? mapLeadDataNew : mapOCData;
    const finalData = data.map((item) => {
      const mappedData = mapFunction({
        details: item,
        extraMappings: {
          recipe_chapter: {
            chapter_name: item.chapter_name,
            bookmarked_recipes: item.bookmarked_recipes
              ? JSON.parse(item.bookmarked_recipes)
              : [],
          },
        },
      });
      return mappedData;
    });
    return { data: finalData, totalCount };
  } catch (error) {
    console.log(error);
    return { error };
  }
};

export {
  breakRequest,
  upgradeRequest,
  notStarted,
  dormancy,
  onhold,
  linkExpiring,
  highFrequencyPV,
  ocAndLeadWithApp,
  ocAndLeadWithoutApp,
  ocAndLeadWithAppAndNoHS,
  ocAndLeadWithAppAndNoConsultation,
  ocAndLeadLinkExpiring,
  lessLoss,
  ocAndLeadHighFrequencyPV,
  leadTriggers,
  ocTriggers,
  activeTriggers,
  leadBifurcation,
  ocAndLeadPageVisit,
  ocAndLeadWallet,
  ocAndLeadCouponUnlocked,
  ocAndLeadSpinToWin,
  ocAndLeadVisitDetails,
  ocAndLeadAlcoholMenuFilled,
  ocAndLeadRestaurantMenuFilled,
  ocAndLeadRecipeBookCreated,
};
