import moment from "moment";
import { ApiResponse } from "../../utils/APiResponse.js";
import {
  breakRequest,
  ocAndLeadWithAppAndNoConsultation,
  ocAndLeadWithoutApp,
  dormancy,
  highFrequencyPV,
  linkExpiring,
  notStarted,
  onhold,
  upgradeRequest,
  ocAndLeadLinkExpiring,
  lessLoss,
  ocAndLeadHighFrequencyPV,
  leadTriggers,
  ocTriggers,
  activeTriggers,
  ocAndLeadWithApp,
  ocAndLeadWithAppAndNoHS,
  leadBifurcation,
  ocAndLeadPageVisit,
  ocAndLeadWallet,
  ocAndLeadCouponUnlocked,
  ocAndLeadSpinToWin,
  ocAndLeadVisitDetails,
  ocAndLeadAlcoholMenuFilled,
  ocAndLeadRestaurantMenuFilled,
  ocAndLeadRecipeBookCreated,
} from "../../utils/mentorDashboradTableDataUtil.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { readRecordUnion } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import UserVisitLog from "../../models/userVisitLogModel.js";
import { readRecordNewForLead } from "../../helper/common.js";

const getDashboardTableData = async (req, res, next) => {
  try {
    const {
      mentor_id,
      user_type,
      filter_query,
      sub_filter_query = null,
      page,
      limit,
      search,
      country_id = null,
      source_group = null,
      age_max = null,
      age_min = null,
      health_issues = null,
      month = null,
      year = null,
      sales_status = null,
    } = req.body;

    let response;
    const extraConditions = {
      country_id: country_id,
      source_group: source_group,
      age_max: age_max,
      age_min: age_min,
      health_issues: health_issues,
      month: month,
      year: year,
      sales_status: sales_status,
      sub_filter_query: sub_filter_query,
    };
    if (user_type === "Active") {
      switch (filter_query) {
        case "break_request":
          response = await breakRequest({ mentor_id, limit, page, search });
          break;
        case "upgrade_request":
          response = await upgradeRequest({ mentor_id, limit, page, search });
          break;
        case "not_started":
          response = await notStarted({ mentor_id, limit, page, search });
          break;
        case "dormancy":
          response = await dormancy({ mentor_id, limit, page });
          break;
        case "onhold":
          response = await onhold({ mentor_id, limit, page });
          break;
        case "link_expiring":
          response = await linkExpiring({ mentor_id, limit, page, search });
          break;
        case "high_frequency_pv":
          response = await highFrequencyPV({
            mentor_id,
            limit,
            page,
            user_type,
            search,
          });
          break;
        case "less_loss":
          response = await lessLoss({ mentor_id, limit, page, search });
          break;
        case "hot_trigger":
          response = await activeTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "2",
            search,
          });
          break;
        case "warm_trigger":
          response = await activeTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "4",
          });
          break;
        default:
          console.log("Unknown filter query:", filter_query);
          response = { message: "No data for this filter query" };
          break;
      }
    } else if (user_type === "OC") {
      switch (filter_query) {
        case "with_app":
          response = await ocAndLeadWithApp({
            mentor_id,
            page,
            limit,
            user_type: "OC",
            search,
          });
          break;
        case "without_app":
          response = await ocAndLeadWithoutApp({
            mentor_id,
            page,
            limit,
            user_type: "OC",
            search,
          });
          break;
        case "with_app_no_hs":
          response = await ocAndLeadWithAppAndNoHS({
            mentor_id,
            page,
            limit,
            user_type: "OC",
            search,
          });
          break;
        case "with_app_no_consultation":
          response = await ocAndLeadWithAppAndNoConsultation({
            mentor_id,
            page,
            limit,
            user_type: "OC",
            search,
          });
          break;
        case "link_expiring":
          response = await ocAndLeadLinkExpiring({
            mentor_id,
            page,
            limit,
            user_type,
            search,
          });
          break;
        case "high_frequency_pv":
          response = await ocAndLeadHighFrequencyPV({
            mentor_id,
            limit,
            page,
            user_type,
            search,
          });
          break;
        case "hot_trigger":
          response = await ocTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "2",
            search,
          });
          break;
        case "warm_trigger":
          response = await ocTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "4",
            search,
          });
          break;
        case "page_visit":
          response = await ocAndLeadPageVisit({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "wallet_3000":
          response = await ocAndLeadWallet({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "coupon_unlocked":
          response = await ocAndLeadCouponUnlocked({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "spin_to_win":
          response = await ocAndLeadSpinToWin({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "tip_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "tips",
            search,
            user_type,
          });
          break;
        case "video_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "reel",
            search,
            user_type,
          });
          break;
        case "recipe_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "recipe",
            search,
            user_type,
          });
          break;
        case "success_story":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "success_story",
            search,
            user_type,
          });
          break;
        case "wallet_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "wallet",
            search,
            user_type,
          });
          break;
        case "peer_group_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "peer_group",
            search,
            user_type,
          });
          break;
        case "alcohol_guide_filled":
          response = await ocAndLeadAlcoholMenuFilled({
            mentor_id,
            search,
            user_type,
          });
          break;
        case "restaurant_guide_filled":
          response = await ocAndLeadRestaurantMenuFilled({
            mentor_id,
            search,
            user_type,
          });
          break;
        case "recipe_book_created":
          response = await ocAndLeadRecipeBookCreated({
            mentor_id,
            search,
            user_type,
          });
          break;
        default:
          break;
      }
    } else if (user_type === "Lead") {
      switch (filter_query) {
        case "with_app":
          response = await ocAndLeadWithApp({
            mentor_id,
            page,
            limit,
            user_type: "Lead",
            search,
            extraConditions,
          });
          break;
        case "without_app":
          response = await ocAndLeadWithoutApp({
            mentor_id,
            page,
            limit,
            user_type: "Lead",
            search,
          });
          break;
        case "with_app_no_hs":
          response = await ocAndLeadWithAppAndNoHS({
            mentor_id,
            page,
            limit,
            user_type: "Lead",
            search,
          });
          break;
        case "with_app_no_consultation":
          response = await ocAndLeadWithAppAndNoConsultation({
            mentor_id,
            page,
            limit,
            user_type: "Lead",
            search,
          });
          break;
        case "link_expiring":
          response = await ocAndLeadLinkExpiring({
            mentor_id,
            page,
            limit,
            user_type,
            search,
          });
          break;
        case "high_frequency_pv":
          response = await ocAndLeadHighFrequencyPV({
            mentor_id,
            limit,
            page,
            user_type,
            search,
          });
          break;
        case "to_engage_trigger":
          response = await leadTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "0",
            search,
          });
          break;
        case "hot_trigger":
          response = await leadTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "2",
            search,
          });
          break;
        case "warm_trigger":
          response = await leadTriggers({
            mentor_id,
            page,
            limit,
            sales_status: "4",
            search,
          });
          break;

        case "hot":
          response = await leadBifurcation({
            mentor_id,
            status: 2,
            page,
            limit,
            search,
            month,
            year,
            extraConditions,
          });
          break;
        case "warm":
          response = await leadBifurcation({
            mentor_id,
            status: 3,
            page,
            limit,
            search,
            month,
            year,
            extraConditions,
          });
          break;
        case "cold":
          response = await leadBifurcation({
            mentor_id,
            status: 4,
            page,
            limit,
            search,
            month,
            year,
            extraConditions,
          });
          break;
        case "to_engage":
          response = await leadBifurcation({
            mentor_id,
            status: 0,
            page,
            limit,
            search,
            month,
            year,
            extraConditions,
          });
          break;
        case "connected":
          response = await leadBifurcation({
            mentor_id,
            status: 6,
            page,
            limit,
            search,
            month,
            year,
            extraConditions,
          });
          break;
        case "consultation_booked":
          response = await leadBifurcation({
            mentor_id,
            status: 7,
            page,
            limit,
            search,
            month,
            year,
            sub_filter_query,
            extraConditions,
          });
          break;
        case "all":
          response = await leadBifurcation({
            mentor_id,
            status: "all",
            page,
            limit,
            search,
            month,
            year,
            extraConditions,
          });
          break;
        case "page_visit":
          response = await ocAndLeadPageVisit({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "wallet_3000":
          response = await ocAndLeadWallet({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "coupon_unlocked":
          response = await ocAndLeadCouponUnlocked({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "spin_to_win":
          response = await ocAndLeadSpinToWin({
            mentor_id,
            user_type,
            search,
          });
          break;
        case "tip_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "tips",
            search,
            user_type,
          });
          break;
        case "video_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "reel",
            search,
            user_type,
          });
          break;
        case "recipe_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "recipe",
            search,
            user_type,
          });
          break;
        case "success_story":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "success_story",
            search,
            user_type,
          });
          break;
        case "wallet_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "wallet",
            search,
            user_type,
          });
          break;
        case "peer_group_visit":
          response = await ocAndLeadVisitDetails({
            mentor_id,
            page: "peer_group",
            search,
            user_type,
          });
          break;
        case "alcohol_guide_filled":
          response = await ocAndLeadAlcoholMenuFilled({
            mentor_id,
            search,
            user_type,
          });
          break;
        case "restaurant_guide_filled":
          response = await ocAndLeadRestaurantMenuFilled({
            mentor_id,
            search,
            user_type,
          });
          break;
        case "recipe_book_created":
          response = await ocAndLeadRecipeBookCreated({
            mentor_id,
            search,
            user_type,
          });
          break;
        default:
          break;
      }
    } else {
      console.log("User type is not active:", user_type);
      response = { message: "User is not active" };
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `User Data for ${user_type} and ${filter_query} fetched Successfully`,
      data: response?.data || [],
      totalCount: response?.totalCount || 0,
      // meta_data: ["key_insights"],
      hide_columns: ["next_follow_up"],
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error occurred:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserActivityColumnCounts = async (req, res, next) => {
  const { id, user_type } = req.body;
  try {
    const conditionsBase = [
      {
        field: "cd.device",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      },
    ];

    const getMentorCondition = () => {
      if (user_type === "OC") {
        return [
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
          {
            field: "cd.sub_user_status",
            operator: "IN",
            value: '("Completed", "Dropout", "Maintenance", "Fs")',
            raw: true,
          },
        ];
      } else if (user_type === "Active") {
        return [
          { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        ];
      } else {
        return [
          {
            field: "cd.counsellor_assigned",
            operator: "=",
            value: parseInt(id),
          },
          { field: "cd.user_type", operator: "=", value: "0" },
        ];
      }
    };

    let queries = [];

    if (user_type === "Active") {
      // Only include break_request and upgrade_request for Active users
      queries = [
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'break_request' AS type`,
          ],
          join: [
            {
              type: "LEFT",
              table: `${tables.onholdClients} ohc`,
              on: "ohc.user_id = cd.user_id AND ohc.sub_order_id = cd.active_order_id",
            },
          ],
          condition: [
            { field: "cd.user_status", operator: "=", value: "Active" },
            { field: "ohc.read_status", operator: "=", value: 0 },
            ...getMentorCondition(),
          ],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'upgrade_request' AS type`,
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.upgradeRequest} ur`,
              on: "ur.user_id = cd.user_id",
            },
          ],
          condition: [
            { field: "cd.user_status", operator: "=", value: "Active" },
            {
              field: "cd.sub_user_status",
              operator: "=",
              value: "Cleanse active",
            },
            { field: "ur.status", operator: "=", value: "0", raw: true },
            ...getMentorCondition(),
          ],
        },
      ];
    } else {
      // Include all activity counts for non-Active users
      queries = [
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'without_app' AS type`],
          condition: [
            { field: "cd.device", operator: "IS", value: "NULL", raw: true },
            ...getMentorCondition(),
          ],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'with_app' AS type`],
          condition: [...conditionsBase, ...getMentorCondition()],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'with_app_no_hs' AS type`,
          ],
          join: [
            ...(user_type === "OC"
              ? [
                  {
                    table: `${tables.subOrderPrograms} sop`,
                    on: "cd.active_order_id = sop.sub_order_id",
                    type: "LEFT",
                  },
                ]
              : []),
            {
              type: "LEFT",
              table: `(
                SELECT *, ROW_NUMBER() OVER (PARTITION BY sub_order_id ORDER BY created DESC) AS rn_latest
                FROM bn_client_hs
              ) hs_latest`,
              on: `${
                user_type === "OC"
                  ? "sop.sub_order_id = hs_latest.sub_order_id"
                  : "cd.user_id = hs_latest.user_id"
              }  AND hs_latest.rn_latest = 1`,
            },
          ],
          condition: [
            ...conditionsBase,
            { field: "hs_latest.id", operator: "IS", value: "NULL", raw: true },
            ...getMentorCondition(),
          ],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'with_app_no_consultation' AS type`,
          ],
          join: [
            {
              table: `${tables.subOrderPrograms} sop`,
              on: "cd.active_order_id = sop.sub_order_id",
              type: "LEFT",
            },
            {
              table: `${tables.consultationLogs} csl`,
              on: "sop.sub_order_id = csl.sub_order_id",
              type: "LEFT",
            },
          ],
          condition: [
            ...conditionsBase,
            { field: "csl.id", operator: "IS", value: "NULL", raw: true },
            ...getMentorCondition(),
          ],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'break_request' AS type`,
          ],
          join: [
            {
              type: "LEFT",
              table: `${tables.onholdClients} ohc`,
              on: "ohc.user_id = cd.user_id AND ohc.sub_order_id = cd.active_order_id",
            },
          ],
          condition: [
            ...conditionsBase,
            { field: "cd.user_status", operator: "=", value: "Active" },
            { field: "ohc.read_status", operator: "=", value: 0, raw: true },
            ...getMentorCondition(),
          ],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'upgrade_request' AS type`,
          ],
          join: [
            {
              type: "INNER",
              table: `${tables.upgradeRequest} ur`,
              on: "ur.user_id = cd.user_id",
            },
          ],
          condition: [
            ...conditionsBase,
            { field: "cd.user_status", operator: "=", value: "Active" },
            {
              field: "cd.sub_user_status",
              operator: "=",
              value: "Cleanse active",
            },
            { field: "ur.status", operator: "=", value: "0", raw: true },
            ...getMentorCondition(),
          ],
        },
      ];
    }

    // Execute the union query
    const counts = await readRecordUnion(queries);

    // Map counts by type for dynamic response generation
    const activityCounts = counts.reduce((acc, { count, type }) => {
      acc[type] = parseInt(count) || 0;
      return acc;
    }, {});

    // API Response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Data for Activity fetched Successfully",
      data: activityCounts,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching user activity counts:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserBifurcationColumnCounts = async (req, res, next) => {
  const { id, user_type } = req.body;
  try {
    let counts;
    if (user_type === "OC") {
      const conditionsBase = [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_status", operator: "=", value: "Completed" },
      ];
      counts = await readRecordUnion([
        // 'completed' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'completed' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sub_user_status", operator: "=", value: "Completed" },
          ],
        },

        // 'Fs' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'Fs' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sub_user_status", operator: "=", value: "Fs" },
          ],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'Dropout' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sub_user_status", operator: "=", value: "Dropout" },
          ],
        },
      ]);
    } else if (user_type === "Active") {
      const conditionsBase = [
        { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "sop.program_status", operator: "=", value: "1" },
      ];
      const joinBase = [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "cd.active_order_id = sop.sub_order_id",
        },
      ];
      counts = await readRecordUnion([
        // 'all active' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'All_Active' AS type`],
          condition: [...conditionsBase],
          join: [...joinBase],
        },
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'Active' AS type`],
          condition: [
            ...conditionsBase,

            { field: "cd.sub_user_status", operator: "=", value: "Active" },
          ],
          join: [...joinBase],
        },

        // 'Onhold' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'Onhold' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
          ],
          join: [...joinBase],
        },

        // 'Dormant' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'Dormant' AS type`],
          condition: [
            ...conditionsBase,

            { field: "cd.sub_user_status", operator: "=", value: "Dormant" },
          ],
          join: [...joinBase],
        },

        // 'not_started' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'not_started' AS type`],
          condition: [
            ...conditionsBase,

            {
              field: "cd.sub_user_status",
              operator: "=",
              value: "notstarted",
            },
          ],
          join: [...joinBase],
        },

        // 'cleanse_active' count
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'cleanse_active' AS type`,
          ],
          condition: [
            ...conditionsBase,

            {
              field: "cd.sub_user_status",
              operator: "=",
              value: "Cleanse active",
            },
          ],
          join: [...joinBase],
        },

        // 'freeze' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'freeze' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sub_user_status", operator: "=", value: "Freeze" },
          ],
          join: [...joinBase],
        },
      ]);
    } else if (user_type === "Lead") {
      const conditionsBase = [
        { field: "cd.counsellor_assigned", operator: "=", value: parseInt(id) },
        { field: "cd.user_type", operator: "=", value: "0" },
      ];
      counts = await readRecordUnion([
        // 'to_engage' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'to_engage' AS type`],
          condition: [
            ...conditionsBase,

            { field: "cd.sales_status", operator: "=", value: "0" },
          ],
        },

        // 'hot' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'hot' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sales_status", operator: "=", value: "2" },
          ],
        },

        // 'warm' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'warm' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sales_status", operator: "=", value: "3" },
          ],
        },

        // 'cold' count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'cold' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sales_status", operator: "=", value: "4" },
          ],
        },

        // connected count
        {
          table: `${tables.userDetails} cd`,
          selectField: ["COUNT(cd.user_id) AS count", `'connected' AS type`],
          condition: [
            ...conditionsBase,
            { field: "cd.sales_status", operator: "=", value: "6" },
          ],
        },

        // consultation booked count
        {
          table: `${tables.userDetails} cd`,
          selectField: [
            "COUNT(cd.user_id) AS count",
            `'consultation_booked' AS type`,
          ],
          condition: [
            ...conditionsBase,
            { field: "cd.sales_status", operator: "=", value: "7" },
          ],
        },
      ]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Activity Column Counts fetched Successfully",
      data: {
        ...(user_type === "OC" && {
          completed: counts[0]?.count ?? 0,
          Fs: counts[1]?.count ?? 0,
          Dropout: counts[2]?.count ?? 0,
        }),
        ...(user_type === "Active" && {
          all_active: counts[0]?.count ?? 0,
          active: counts[1]?.count ?? 0,
          onhold: counts[2]?.count ?? 0,
          dormant: counts[3]?.count ?? 0,
          not_started: counts[4]?.count ?? 0,
          cleanse_active: counts[5]?.count ?? 0,
          freeze: counts[6]?.count ?? 0,
        }),
        ...(user_type === "Lead" && {
          to_engage: counts[0]?.count ?? 0,
          hot: counts[1]?.count ?? 0,
          warm: counts[2]?.count ?? 0,
          cold: counts[3]?.count ?? 0,
          connected: counts[4]?.count ?? 0,
          consultation_booked: counts[5]?.count ?? 0,
        }),
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getUserNeedAttentionColumnCounts = async (req, res, next) => {
  const { id, user_type } = req.body;

  try {
    // Define mentorCondition based on user_type
    const mentorCondition =
      user_type === "OC"
        ? [
            { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
            {
              field: "cd.sub_user_status",
              operator: "IN",
              value: '("Completed", "Dropout", "Maintenance", "Fs")',
              raw: true,
            },
          ]
        : user_type === "Active"
        ? [
            { field: "cd.mentor_assigned", operator: "=", value: parseInt(id) },
            {
              field: "cd.user_status",
              operator: "=",
              value: "Active",
            },
          ]
        : [
            {
              field: "cd.counsellor_assigned",
              operator: "=",
              value: parseInt(id),
            },
            { field: "cd.user_type", operator: "=", value: "0" },
          ];

    // Base conditions (could be used globally)
    const conditionsBase = [];

    const counts = await readRecordUnion([
      // High Frequency Page Visit Count
      {
        table: `(
        SELECT 
            cd.user_id
        FROM 
            users_details cd
        LEFT JOIN 
            in_app_page_visit_log iapv 
            ON cd.user_id = iapv.user_id AND iapv.visit_date = CURDATE()
        WHERE 
            ${
              user_type === "Active"
                ? `cd.user_status = 'Active' AND cd.mentor_assigned = ${id}`
                : user_type === "OC"
                ? `cd.user_status = 'Completed' AND (cd.mentor_assigned = ${id} OR cd.counsellor_assigned = ${id})`
                : `cd.counsellor_assigned = ${id} AND cd.user_type = 0`
            }
        GROUP BY 
            cd.user_id
        HAVING 
            COUNT(iapv.user_id) > 5  
    ) AS filtered_users`,
        selectField: ["COUNT(*) AS count", `'high_frequency_pv' AS type`],
      },
      // Link Expiring Count
      {
        table: `${tables.userDetails} cd`,
        selectField: ["COUNT(cd.user_id) AS count", `'link_expiring' AS type`],
        join: [
          {
            table: `${tables.suggestedProgram} sp`,
            on: "cd.suggested_program_id = sp.suggested_program_id",
            type: "LEFT",
          },
        ],
        condition: [
          ...conditionsBase,
          { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
          {
            field: "TIMESTAMPDIFF(DAY, sp.payment_expiry, CURDATE())",
            operator: "BETWEEN",
            value: [-2, 0],
          },
          ...(Array.isArray(mentorCondition)
            ? mentorCondition.slice(1)
            : [mentorCondition]),
        ],
      },
      // Less Loss Count (Only for Active users)
      ...(user_type === "Active"
        ? [
            {
              table: `${tables.userDetails} cd`,
              selectField: [
                "COUNT(cd.user_id) AS count",
                `'less_loss' AS type`,
              ],
              join: [
                {
                  type: "LEFT",
                  table: `${tables.subOrderPrograms} sop`,
                  on: "cd.active_order_id = sop.sub_order_id",
                },
                {
                  type: "LEFT",
                  table: `${tables.weightRecords} wr`,
                  on: "wr.sub_order_id = sop.sub_order_id AND wr.session = sop.sent_sessions",
                },
              ],
              condition: [
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
                       AND (sop.start_program_weight - wr.weight) < 3.0))`,
                  operator: "",
                  value: "",
                  raw: true,
                },
                {
                  field: "cd.mentor_assigned",
                  operator: "=",
                  value: parseInt(id),
                },
              ],
            },
          ]
        : []),
      // Dormancy Count (Only for Active users)
      ...(user_type === "Active"
        ? [
            {
              table: `${tables.userDetails} cd`,
              selectField: ["COUNT(cd.user_id) AS count", `'dormancy' AS type`],
              condition: [
                ...conditionsBase,
                {
                  field: "cd.sub_user_status",
                  operator: "=",
                  value: "Dormant",
                },
                {
                  field: "cd.mentor_assigned",
                  operator: "=",
                  value: parseInt(id),
                },
              ],
            },
          ]
        : []),
      // Onhold Count (Only for Active users)
      ...(user_type === "Active"
        ? [
            {
              table: `${tables.userDetails} cd`,
              selectField: ["COUNT(cd.user_id) AS count", `'onhold' AS type`],
              condition: [
                ...conditionsBase,
                {
                  field: "cd.sub_user_status",
                  operator: "=",
                  value: "Onhold",
                },
                {
                  field: "cd.mentor_assigned",
                  operator: "=",
                  value: parseInt(id),
                },
              ],
            },
          ]
        : []),
      // Not Started Count (Only for Active users)
      ...(user_type === "Active"
        ? [
            {
              table: `${tables.userDetails} cd`,
              selectField: [
                "COUNT(cd.user_id) AS count",
                `'not_started' AS type`,
              ],
              condition: [
                ...conditionsBase,
                {
                  field: "cd.sub_user_status",
                  operator: "=",
                  value: "notstarted",
                },
                {
                  field: "cd.mentor_assigned",
                  operator: "=",
                  value: parseInt(id),
                },
              ],
            },
          ]
        : []),
    ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Need Attention Column Counts fetched Successfully",
      data: {
        high_frequency_pv: counts[0]?.count ?? 0,
        link_expiring: counts[1]?.count ?? 0,
        ...(user_type === "Active" && { less_loss: counts[2]?.count ?? 0 }),
        ...(user_type === "Active" && { dormancy: counts[3]?.count ?? 0 }),
        ...(user_type === "Active" && { onhold: counts[4]?.count ?? 0 }),
        ...(user_type === "Active" && { not_started: counts[5]?.count ?? 0 }),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error); // Log the error for debugging
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserSalesTriggerColumnCounts = async (req, res, next) => {
  const { id, user_type } = req.body;

  try {
    // Define base conditions based on user_type
    const conditionsBase =
      user_type === "Lead"
        ? [
            { field: "cd.user_type", operator: "=", value: "0" },
            {
              field: "cd.counsellor_assigned",
              operator: "=",
              value: parseInt(id),
            },
          ]
        : user_type === "Active"
        ? [
            { field: "cd.user_type", operator: "=", value: "1" },
            { field: "cd.user_status", operator: "=", value: "Active" },
            {
              field: "cd.mentor_assigned",
              operator: "=",
              value: parseInt(id),
            },
          ]
        : [
            { field: "cd.user_type", operator: "=", value: "1" },
            { field: "sp.suggested_by", operator: "=", value: parseInt(id) },
            {
              field: "cd.sub_user_status",
              operator: "IN",
              value: '("Completed", "Dropout", "Maintenance", "Fs")',
              raw: true,
            },
          ];

    // Define the query configurations
    const queryConfigs =
      user_type === "Lead"
        ? [
            {
              selectField: [
                "COUNT(cd.user_id) AS count",
                "'to_engage_trigger' AS type",
              ],
              join: [
                {
                  table: "lead_assigned_log lal1",
                  on: "cd.user_id = lal1.user_id",
                  type: "INNER",
                },
                {
                  table: "lead_assigned_log lal2",
                  on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
                  type: "LEFT",
                },
              ],
              condition: [
                { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
                {
                  field: "DATEDIFF(CURDATE(), lal1.assign_date)",
                  operator: ">",
                  value: "7",
                  raw: true,
                },
                { field: "cd.sales_status", operator: "=", value: "0" },
                ...conditionsBase,
              ],
            },
            {
              selectField: [
                "COUNT(cd.user_id) AS count",
                "'hot_trigger' AS type",
              ],
              join: [
                {
                  table: "lead_assigned_log lal1",
                  on: "cd.user_id = lal1.user_id",
                  type: "INNER",
                },
                {
                  table: "lead_assigned_log lal2",
                  on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
                  type: "LEFT",
                },
              ],
              condition: [
                { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
                {
                  field: "DATEDIFF(CURDATE(), lal1.assign_date)",
                  operator: ">",
                  value: "7",
                  raw: true,
                },
                { field: "cd.sales_status", operator: "=", value: "2" },
                ...conditionsBase,
              ],
            },
            {
              selectField: [
                "COUNT(cd.user_id) AS count",
                "'warm_trigger' AS type",
              ],
              join: [
                {
                  table: "lead_assigned_log lal1",
                  on: "cd.user_id = lal1.user_id",
                  type: "INNER",
                },
                {
                  table: "lead_assigned_log lal2",
                  on: "lal1.user_id = lal2.user_id AND lal1.id < lal2.id",
                  type: "LEFT",
                },
              ],
              condition: [
                { field: "lal2.id", operator: "IS", value: "NULL", raw: true },
                {
                  field: "DATEDIFF(CURDATE(), lal1.assign_date)",
                  operator: ">",
                  value: "15",
                  raw: true,
                },
                { field: "cd.sales_status", operator: "=", value: "4" },
                ...conditionsBase,
              ],
            },
          ]
        : [
            {
              selectField: [
                "COUNT(cd.user_id) AS count",
                "'hot_trigger' AS type",
              ],
              join: [
                {
                  table: "suggested_program sp",
                  on: "cd.suggested_program_id = sp.suggested_program_id",
                  type: "LEFT",
                },
              ],
              condition: [
                {
                  field: "DATEDIFF(CURDATE(), DATE(sp.added_date))",
                  operator: ">",
                  value: "7",
                  raw: true,
                },
                { field: "cd.sales_status", operator: "=", value: "2" },
                ...conditionsBase,
              ],
            },
            {
              selectField: [
                "COUNT(cd.user_id) AS count",
                "'warm_trigger' AS type",
              ],
              join: [
                {
                  table: "suggested_program sp",
                  on: "cd.suggested_program_id = sp.suggested_program_id",
                  type: "LEFT",
                },
              ],
              condition: [
                {
                  field: "DATEDIFF(CURDATE(), DATE(sp.added_date))",
                  operator: ">",
                  value: "15",
                  raw: true,
                },
                { field: "cd.sales_status", operator: "=", value: "4" },
                ...conditionsBase,
              ],
            },
          ];

    // Execute the union query using readRecordUnion (similar to your other controller)
    const counts = await readRecordUnion(
      queryConfigs.map((config) => ({
        table: `${tables.userDetails} cd`,
        ...config,
      }))
    );

    // Prepare the response
    const response = counts.reduce((acc, item) => {
      acc[item.type] = item.count;
      return acc;
    }, {});

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Sales Trigger Column Counts fetched successfully",
      data: response,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserActivityColumnCountsNew = async (req, res, next) => {
  try {
    const { mentor_id, user_type } = req.body;
    if (!mentor_id || !user_type) {
      return next(
        new ErrorHandler("mentor_id and user_type are required", 400)
      );
    }
    const counts = {
      tip_visit: 0,
      video_visit: 0,
      recipe_visit: 0,
      success_story: 0,
      wallet_visit: 0,
      alcohol_guide_filled: 0,
      restaurant_guide_filled: 0,
      recipe_book_created: 0,
      peer_group_visit: 0,
    };
    const startOfDate = new Date();
    startOfDate.setHours(0, 0, 0, 0);
    const endOfDate = new Date(startOfDate);
    endOfDate.setHours(23, 59, 59, 999);
    const data = await UserVisitLog.aggregate([
      {
        $facet: {
          tip_visit: [
            {
              $match: {
                page: "tips",
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
                type: "tip_visit",
                user_ids: 1,
              },
            },
          ],
          video_visit: [
            {
              $match: {
                page: "reel",
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
                type: "video_visit",
                user_ids: 1,
              },
            },
          ],
          recipe_visit: [
            {
              $match: {
                page: "recipe",
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
                type: "recipe_visit",
                user_ids: 1,
              },
            },
          ],
          success_story: [
            {
              $match: {
                page: "success_story",
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
                type: "success_story",
                user_ids: 1,
              },
            },
          ],
          wallet_visit: [
            {
              $match: {
                page: "wallet",
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
                type: "wallet_visit",
                user_ids: 1,
              },
            },
          ],
          peer_group_visit: [
            {
              $match: {
                page: "peer_group",
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
                type: "peer_group_visit",
                user_ids: 1,
              },
            },
          ],
        },
      },
      {
        $project: {
          all: {
            $concatArrays: [
              "$tip_visit",
              "$video_visit",
              "$recipe_visit",
              "$success_story",
              "$wallet_visit",
              "$peer_group_visit",
            ],
          },
        },
      },
      { $unwind: "$all" },
      { $replaceRoot: { newRoot: "$all" } },
    ]);
    console.log("User Visit Data:", data);
    const conditions = [];
    if (user_type === "OC") {
      conditions.push(
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_status",
          operator: "=",
          value: "Completed",
        }
      );
    } else if (user_type === "Lead") {
      conditions.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_type",
          operator: "=",
          value: "0",
        }
      );
    }
    for (let i = 0; i < data.length; i++) {
      const { results } = await readRecordNewForLead({
        selectFields: ["COUNT(DISTINCT cd.user_id) AS count"],
        table: `${tables.userDetails} cd`,
        conditions: [
          ...conditions,
          { field: "cd.user_id", operator: "IN", value: data[i].user_ids },
        ],
      });
      counts[data[i].type] = parseInt(results[0].count) || 0;
    }
    const dataCount = await readRecordUnion([
      {
        table: `${tables.userAlcoholMenu} uam`,
        selectField: [
          "COUNT(DISTINCT uam.user_id) AS count",
          "'alcohol_guide_filled' AS type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = uam.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "DATE(uam.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.userRestaurantMenu} urm`,
        selectField: [
          "COUNT(DISTINCT urm.user_id) AS count",
          "'restaurant_guide_filled' AS type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = urm.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "DATE(urm.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.recipeChapters} rc`,
        selectField: [
          "COUNT(DISTINCT rc.user_id) AS count",
          "'recipe_book_created' AS type",
        ],
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = rc.user_id",
          },
        ],
        condition: [
          ...conditions,
          {
            field: "DATE(rc.created_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    dataCount.forEach((item) => {
      counts[item.type] = parseInt(item.count) || 0;
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User Activity Column Counts fetched successfully",
      data: counts,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getPotentialSalesColumnCounts = async (req, res, next) => {
  try {
    const { mentor_id, user_type } = req.body;
    if (!mentor_id || !user_type) {
      return next(
        new ErrorHandler("mentor_id and user_type are required", 400)
      );
    }
    const baseCondition = [];
    if (user_type === "Lead") {
      baseCondition.push(
        {
          field: "cd.counsellor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        { field: "cd.user_type", operator: "=", value: "0" }
      );
    } else if (user_type === "OC") {
      baseCondition.push(
        {
          field: "cd.mentor_assigned",
          operator: "=",
          value: parseInt(mentor_id),
        },
        {
          field: "cd.user_status",
          operator: "IN",
          value: '("Completed", "Dropout", "Maintenance", "Fs")',
          raw: true,
        }
      );
    }
    const data = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT iapv.user_id) AS count",
          "'page_visit' AS type",
        ],
        table: `${tables.inAppPageVisitLog} iapv`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = iapv.user_id",
          },
        ],
        condition: [
          ...baseCondition,
          {
            field: "iapv.page_type",
            operator: "=",
            value: 1,
          },
          {
            field: "iapv.visit_date",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("day").format("YYYY-MM-DD")}`,
            ],
          },
        ],
      },
      {
        selectField: ["COUNT(cd.user_id) AS count", "'wallet_3000' AS type"],
        table: `${tables.userDetails} cd`,
        condition: [
          ...baseCondition,
          { field: "cd.my_wallet", operator: ">=", value: 3000 },
        ],
      },
      {
        selectField: [
          "COUNT(cd.user_id) AS count",
          "'coupon_unlocked' AS type",
        ],
        table: `${tables.leadsActivatedFeatures} la`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = la.user_id",
          },
        ],
        condition: [
          ...baseCondition,
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
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) AS count",
          "'spin_to_win' AS type",
        ],
        table: `${tables.prizeDetails} pd`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: "cd.user_id = pd.user_id",
          },
        ],
        condition: [
          ...baseCondition,
          {
            field: "DATE(pd.added_date) + INTERVAL 2 DAY",
            operator: "<=",
            value: "CURDATE()",
            raw: true,
          },
        ],
      },
    ]);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Potential Sales Column Counts fetched successfully",
      data: data.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count) || 0;
        return acc;
      }, {}),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getDashboardTableData,
  getPotentialSalesColumnCounts,
  getUserActivityColumnCounts,
  getUserNeedAttentionColumnCounts,
  getUserSalesTriggerColumnCounts,
  getUserBifurcationColumnCounts,
  getUserActivityColumnCountsNew,
};
