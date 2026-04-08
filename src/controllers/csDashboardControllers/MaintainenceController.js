import { readRecord, readRecordUnion } from "../../config/query.js";
import {
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  mapUserData,
} from "../../helper/common.js";
import {
  image_guide_base_url,
  redisKeys,
  tables,
} from "../../helper/constant.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
const getAllMaintainenceClients = async (_, res, next) => {
  try {
    const selectFields = ["COUNT(cd.user_id) as maintainence_clients"];

    const conditions = [
      {
        field: "cd.sub_user_status",
        operator: "=",
        value: "Maintenance",
      },
    ];
    const { results: rows } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      conditions,
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total Maintenance clients fetched successfully",
      data: rows[0],
    });
    await redis.setex(
      `${redisKeys.AllMaintainenceClients}`,
      25,
      JSON.stringify(rows[0])
    );
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllMaintainenceClientsUserData = async (req, res, next) => {
  try {
    const { page, limit, search } = req.body;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: [
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Maintenance",
        },
      ].filter(Boolean),
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {},
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total Maintenance clients fetched successfully",
      data: data,
      meta_data: {
        page,
        totalPages: total_page,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllMaintainenceWeightsODCounts = async (req, res, next) => {
  try {
    const counts = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'10_day_OD' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            table: `${tables.weightRecords} wr`,
            type: "LEFT",
            on: "cd.active_order_id = wr.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.sub_user_status", operator: "=", value: "Maintenance" },
          {
            field: "CAST(wr.day_status AS CHAR)",
            operator: "=",
            value: "'M1'",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'20_day_OD' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            table: `${tables.weightRecords} wr`,
            type: "LEFT",
            on: "cd.active_order_id = wr.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.sub_user_status", operator: "=", value: "Maintenance" },
          {
            field: "CAST(wr.day_status AS CHAR)",
            operator: "=",
            value: "'M2'",
            raw: true,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT cd.user_id) as count",
          "'30_day_OD' as type",
        ],
        table: `${tables.userDetails} cd`,
        join: [
          {
            table: `${tables.weightRecords} wr`,
            type: "LEFT",
            on: "cd.active_order_id = wr.sub_order_id",
          },
        ],
        condition: [
          { field: "cd.sub_user_status", operator: "=", value: "Maintenance" },
          {
            field: "CAST(wr.day_status AS CHAR)",
            operator: "=",
            value: "'M3'",
            raw: true,
          },
        ],
      },
    ]);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Total Maintenance clients fetched successfully",
      data: counts,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMaintenanceWeightODData = async (req, res, next) => {
  const { days } = req.body;
  if (!days) {
    return next(new ErrorHandler("days field is required", 400));
  }
  let dayStatus;
  if (days === 10) {
    dayStatus = "M1";
  } else if (days === 20) {
    dayStatus = "M2";
  } else if (days === 30) {
    dayStatus = "M3";
  } else {
    return next(
      new ErrorHandler(
        "Invalid days value. Only 10, 20, and 30 are allowed.",
        400
      )
    );
  }
  try {
    const { results: users } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["cd.user_id"],
      conditions: [
        { field: "cd.sub_user_status", operator: "=", value: "Maintenance" },
        {
          field: "CAST(wr.day_status AS CHAR)",
          operator: "=",
          value: `'${dayStatus}'`,
          raw: true,
        },
      ],
      joins: [
        {
          table: `${tables.weightRecords} wr`,
          type: "LEFT",
          on: "cd.active_order_id = wr.sub_order_id",
        },
      ],
    });
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `No Maintenance clients found for ${days} days OD`,
        data: [],
      });
      return res.status(200).json(apiResponse);
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
    const finalData = users.map((user, index) => {
      const mappedData = mapUserData({ user, details: details[index] });
      return mappedData;
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Maintenance clients fetched successfully for ${days} days OD`,
      data: finalData,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getMaintenanceList = async (req, res, next) => {
  try {
    const { user_id, sub_order_id } = req.query;
    if (!user_id || !sub_order_id) {
      return next(
        new ErrorHandler("UserId or Sub Order Id Not Provided ", 400)
      );
    }

    const { results } = await readRecord({
      table: `${tables.maintenanceOrderDetails} mo`,
      selectFields: [
        "m.*",
        ` CASE 
        WHEN (
            SELECT COUNT(*) 
            FROM bn_client_hs hs 
            WHERE hs.user_id = mo.user_id 
              AND hs.created >= m.added_date
        ) > 0 THEN 1
        ELSE 0
    END AS has_hs_after_maintenance`,
        "anal.eating_habit",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.maintenanceMasters} m`,
          on: "m.id = mo.maintenance_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ass.user_id = mo.user_id AND ass.active_order_id = mo.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_nutrition_and_lifestyle} anal`,
          on: "ass.assessment_id = anal.assessment_id",
        },
      ],

      conditions: [
        {
          field: "mo.user_id",
          operator: "=",
          value: user_id,
        },
        {
          field: "mo.order_id",
          operator: "=",
          value: sub_order_id,
        },
      ],
    });

    const base_url = `https://balancenutrition.in/file/maintenance/`;
    const list = results.map((i) => {
      const items = [];
      let index = 1;

      if (i.introduction) {
        items.push({
          label: `${index}. Introduction`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "Introduction",
            link: base_url + i.introduction,
          },
        });
        index++;
      }

      if (i.maintenance_diet) {
        items.push({
          label: `${index}. Maintenance Diet Chart`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "Maintenance Diet Chart",
            link: base_url + i.maintenance_diet,
          },
        });
        index++;
      }

      if (i.daily_essential_guide) {
        items.push({
          label: `${index}. BN - Daily Essentials' Guide`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "BN - Daily Essentials' Guide",
            link: base_url + i.daily_essential_guide,
          },
        });
        index++;
      }

      if (i.eat_in_portion_guide) {
        items.push({
          label: `${index}. BN - Eat-in-Portion Guide`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "BN - Eat-in-Portion Guide",
            link: base_url + i.eat_in_portion_guide,
          },
        });
        index++;
      }

      if (i.cheat_sheet) {
        items.push({
          label: `${index}. BN - Cheat Sheet`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "BN - Cheat Sheet",
            link: base_url + i.cheat_sheet,
          },
        });
        index++;
      }

      if (i.exercise_guide) {
        items.push({
          label: `${index}. BN - Exercises Guide`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "BN - Exercises Guide",
            link: base_url + i.exercise_guide,
          },
        });
        index++;
      }

      if (i.detox_diet || i.metabolic_diet) {
        const detoxChildren = [];
        if (i.detox_diet) {
          detoxChildren.push({
            label: "BN - 1 Day Detox Cleansing",
            redirect_screen: "webview",
            screen_params: {
              screen_title: "BN - 1 Day Detox Cleansing",
              link: base_url + i.detox_diet,
            },
          });
        }
        if (i.metabolic_diet) {
          detoxChildren.push({
            label: "BN - 1 Day Metabolic Enhancer",
            redirect_screen: "webview",
            screen_params: {
              screen_title: "BN - 1 Day Metabolic Enhancer",
              link: base_url + i.metabolic_diet,
            },
          });
        }
        items.push({
          label: `${index}. Detox Diets`,
          children: detoxChildren,
        });
        index++;
      }

      if (i.travel_guide) {
        items.push({
          label: `${index}. BN - Travel Guide`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "BN - Travel Guide",
            link: base_url + i.travel_guide,
          },
        });
        index++;
      }

      if (i.airport_guide) {
        items.push({
          label: `${index}. BN - Airport Guide`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "BN - Airport Guide",
            link: base_url + i.airport_guide,
          },
        });
        index++;
      }

      if (i.protein_source) {
        items.push({
          label: `${index}. Protein Source Guide`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "Protein Source Guide",
            link: base_url + i.protein_source,
          },
        });
        index++;
      }

      if (i.pcos_1) {
        items.push({
          label: `${index}. Combat Bloating During PMS`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "Combat Bloating During PMS",
            link: base_url + i.pcos_1,
          },
        });
        index++;
      }

      if (i.pcos_2) {
        items.push({
          label: `${index}. TOP 10 Foods to Ease Menstrual Cramps`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "TOP 10 Foods to Ease Menstrual Cramps",
            link: base_url + i.pcos_2,
          },
        });
        index++;
      }

      if (i.introduction) {
        items.push({
          label: `${index}. Know Your Ideal Weight`,
          redirect_screen: "webview",
          screen_params: {
            screen_title: "Know Your Ideal Weight",
            link: base_url + i.introduction,
          },
        });
      }

      return items;
    });

    // const hs_taken =
    //   Number(results[0]?.has_hs_after_maintenance) === 1 ? true : false;
     const hs_taken = false;
    return res.status(200).json({
      statusCode: 200,
      message: "Maintenance List Fetched Successfully",
      data: list[0],
      hs_taken,
      eating_habit: results[0]?.eating_habit || "veg",
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  getAllMaintainenceClients,
  getAllMaintainenceClientsUserData,
  getAllMaintainenceWeightsODCounts,
  getMaintenanceList,
  getMaintenanceWeightODData,
};
