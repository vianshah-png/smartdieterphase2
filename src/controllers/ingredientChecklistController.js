import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables, cloudinaryFolders } from "../helper/constant.js";
import {
  filterObjectRemoveNullValues,
  getCurrentDateTime,
  calculateAge,
  addHoursToTime,
  safeJSONParse,
} from "../helper/commonHelper.js";
import { uploadArrayOfFilesToCloudinary } from "../helper/uploadToCloudinary.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import { addAmountWallet } from "../helper/common.js";

//API For Ingredient Category Listing
export const getIngredientCategoryList = async (req, res) => {
  const newData = req.body;
  try {
    const user_id = newData.user_id;
    const active_order_id = newData.active_order_id;

    //Check Ingredient Filled
    const ingredientChecklisttable = tables.ingredientChecklistRecords;
    const selectaIngredientChecklistColumns = ["*"];
    const ingredientChecklistWhereCondition = [
      {
        field: "active_order_id",
        operator: "=",
        value: active_order_id,
      },
    ];

    const { results: ingredientChecklistDetails } = await readRecord({
      table: `${ingredientChecklisttable}`,
      selectFields: selectaIngredientChecklistColumns,
      conditions: ingredientChecklistWhereCondition,
    });
    console.log(ingredientChecklistDetails, 34);
    //Check Personal Details Assessment Filled
    const personalDetailstable = tables.assessment_personal_details;
    const selectpersonalDetailsColumns = ["country_of_residence"];
    const personalDetailsWhereCondition = [
      {
        field: "user_id",
        operator: "=",
        value: user_id,
      },
    ];

    const { results: assessmentPersonalDetails } = await readRecord({
      table: `${personalDetailstable}`,
      selectFields: selectpersonalDetailsColumns,
      conditions: personalDetailsWhereCondition,
      orderBy: ["personal_details_id DESC"],
    });

    //Check Assessment Filled
    const nutritionLifestyleDetailstable =
      tables.assessment_nutrition_and_lifestyle;
    const selectnutritionLifestyleDetailsColumns = [
      "food_allergies",
      "eating_habit",
    ];
    const nutritionLifestyleDetailsWhereCondition = [
      {
        field: "user_id",
        operator: "=",
        value: user_id,
      },
    ];

    const { results: assessmentNutritionDetails } = await readRecord({
      table: `${nutritionLifestyleDetailstable}`,
      selectFields: selectnutritionLifestyleDetailsColumns,
      conditions: nutritionLifestyleDetailsWhereCondition,
      orderBy: ["nutrition_and_lifestyle_id DESC"],
    });

    let allergy_array = [];
    if (assessmentNutritionDetails.length > 0) {
      const allergy = safeJSONParse(
        assessmentNutritionDetails[0]?.food_allergies,
        []
      )?.allergies;
      // const total_allergies = Object.keys(allergy).length;

      for (const key in allergy) {
        if (allergy.hasOwnProperty(key)) {
          // Optional check to avoid inherited properties
          allergy_array.push(`${allergy[key].food}`);
        }
      }
    }
    //Get Ingredient Category List
    const ingredientCategorytable = tables.ingredientCategory;
    const selectIngredientCategoryColumns = [
      "ingredient_category_id",
      "ingredient_category_name",
    ];
    let country_type = "";
    let ingredientCategoryWhereCondition = [];
    if (
      assessmentPersonalDetails.length > 0 &&
      assessmentPersonalDetails[0].country_of_residence == "101"
    ) {
      ingredientCategoryWhereCondition = [
        {
          field: "country_type",
          operator: "=",
          value: "0",
        },
      ];
    } else {
      ingredientCategoryWhereCondition = [];
    }

    const { results: ingredientCategoryList } = await readRecord({
      table: `${ingredientCategorytable}`,
      selectFields: selectIngredientCategoryColumns,
      conditions: ingredientCategoryWhereCondition,
    });

    if (ingredientChecklistDetails.length == 0) {
      try {
        const columns = [
          "user_id",
          "active_order_id",
          "added_date",
          "added_by",
        ];
        const currentDate = getCurrentDateTime();
        const values = [user_id, active_order_id, currentDate, user_id];
        const insertResult = await insertRecord(
          `${tables.ingredientChecklistRecords}`,
          columns,
          values
        );
        const ingredient_checklist_id = insertResult.insertId;

        if (insertResult) {
          ingredientCategoryList.forEach((obj) => {
            obj["status"] = "1";
          });

          const responseData = {
            ingredient_checklist_id: ingredient_checklist_id,
            ingredient_category_list: ingredientCategoryList,
          };
          return res.status(201).json({
            status: true,
            message: "Ingredient Category List Fetched Successfully.",
            screen_name: "Ingredient Category List",
            data: responseData,
          });
        }
      } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
      }
    } else {
      if (ingredientChecklistDetails[0].can_buy_ingredients != null) {
        const canBuyIngredients = JSON.parse(
          ingredientChecklistDetails[0].can_buy_ingredients
        );
        const cantBuyIngredients = JSON.parse(
          ingredientChecklistDetails[0].cant_buy_ingredients
        );
        const canBuyCategories = Object.keys(canBuyIngredients);
        const cantBuyCategories = Object.keys(cantBuyIngredients);
        const filledCategories = [
          ...new Set([...canBuyCategories, ...cantBuyCategories]),
        ];

        ingredientCategoryList.forEach((obj) => {
          if (filledCategories.includes(obj.ingredient_category_name)) {
            obj["status"] = "2";
          } else {
            obj["status"] = "1";
          }
        });
        const responseData = {
          ingredient_checklist_id:
            ingredientChecklistDetails[0].ingredient_checklist_id,
          ingredient_category_list: ingredientCategoryList,
        };
        return res.status(201).json({
          status: true,
          message: "Ingredient Category List Fetched Successfully.",
          screen_name: "Ingredient Category List",
          data: responseData,
        });
      } else {
        ingredientCategoryList.forEach((obj) => {
          obj["status"] = "1";
        });

        const responseData = {
          ingredient_checklist_id:
            ingredientChecklistDetails[0].ingredient_checklist_id,
          ingredient_category_list: ingredientCategoryList,
        };
        return res.status(201).json({
          status: true,
          message: "Ingredient Category List Fetched Successfully.",
          screen_name: "Ingredient Category List",
          data: responseData,
        });
      }
    }
    return res.status(200).json({
      status: true,
      message: "Ingredient Category List Fetched Successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};

export const getIngredientsList = async (req, res) => {
  try {
    const { user_id, active_order_id, categoryName, ingredient_category_id } =
      req.body;

    if (
      !user_id ||
      !active_order_id ||
      !categoryName ||
      !ingredient_category_id
    ) {
      return res.status(400).json({
        status: false,
        message:
          "user_id, active_order_id, categoryName, and ingredient_category_id are required",
      });
    }
    const { results: ingredientList } = await readRecord({
      table: tables.ingredientsList,
      selectFields: ["ingredient_id", "ingredient_name"],
      conditions: [
        {
          field: "ingredient_category_id",
          operator: "=",
          value: ingredient_category_id,
        },
        { field: "indian_regular", operator: "=", value: "1" },
      ],
    });

    if (!ingredientList.length) {
      return res.status(200).json({
        status: true,
        message: "No ingredients found for this category",
        screen_name: "Ingredient List",
        data: { ingredientList: [] },
      });
    }
    const { results: filledIngredientList } = await readRecord({
      table: tables.ingredientChecklistRecords,
      selectFields: ["can_buy_ingredients", "cant_buy_ingredients"],
      conditions: [
        { field: "active_order_id", operator: "=", value: active_order_id },
      ],
    });
    ingredientList.forEach((item) => {
      item.status = "0";
    });

    if (
      filledIngredientList.length &&
      filledIngredientList[0].can_buy_ingredients !== null
    ) {
      try {
        const canBuyData = JSON.parse(
          filledIngredientList[0].can_buy_ingredients
        );
        const cantBuyData = filledIngredientList[0].cant_buy_ingredients
          ? JSON.parse(filledIngredientList[0].cant_buy_ingredients)
          : {};

        const canBuyIngredientIds = canBuyData[categoryName]
          ? new Set(canBuyData[categoryName].map((item) => item.ingredient_id))
          : new Set();
        const cantBuyIngredientIds = cantBuyData[categoryName]
          ? new Set(cantBuyData[categoryName].map((item) => item.ingredient_id))
          : new Set();

        ingredientList.forEach((item) => {
          if (canBuyIngredientIds.has(item.ingredient_id)) {
            item.status = "1";
          } else if (cantBuyIngredientIds.has(item.ingredient_id)) {
            item.status = "2";
          }
        });
      } catch (parseError) {
        console.error("Error parsing ingredient checklist:", parseError);
      }
    }

    return res.status(200).json({
      status: true,
      message: "Ingredient List Fetched Successfully",
      screen_name: "Ingredient List",
      data: { ingredientList },
    });
  } catch (error) {
    console.error("Error in getIngredientsList:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const submitIngredientChecklist = async (req, res) => {
  try {
    const {
      user_id,
      active_order_id,
      can_buy_ingredients: canBuyIngredients,
      cant_buy_ingredients: cantBuyIngredients,
      categoryName,
      is_last = false,
    } = req.body;

    // Validate required fields
    if (!user_id || !active_order_id || !categoryName) {
      return res.status(400).json({
        status: false,
        message: "user_id, active_order_id, and categoryName are required",
      });
    }

    // Fetch existing checklist records
    const { results: filledIngredientList } = await readRecord({
      table: tables.ingredientChecklistRecords,
      selectFields: ["can_buy_ingredients", "cant_buy_ingredients"],
      conditions: [
        { field: "active_order_id", operator: "=", value: active_order_id },
      ],
    });

    let canBuyFilledIngredients = {};
    let cantBuyFilledIngredients = {};

    if (filledIngredientList.length > 0) {
      if (filledIngredientList[0].can_buy_ingredients) {
        canBuyFilledIngredients = JSON.parse(
          filledIngredientList[0].can_buy_ingredients
        );
      }
      if (filledIngredientList[0].cant_buy_ingredients) {
        cantBuyFilledIngredients = JSON.parse(
          filledIngredientList[0].cant_buy_ingredients
        );
      }
    }

    // Update with new data
    canBuyFilledIngredients[categoryName] = canBuyIngredients || [];
    cantBuyFilledIngredients[categoryName] = cantBuyIngredients || [];

    const ingredientChecklistData = {
      can_buy_ingredients: JSON.stringify(canBuyFilledIngredients),
      cant_buy_ingredients: JSON.stringify(cantBuyFilledIngredients),
      completion_status: is_last ? 2 : 1,
    };

    const condition = { active_order_id: parseInt(active_order_id) };
    let updateResult;

    // Insert or update based on existing record
    if (filledIngredientList.length > 0) {
      updateResult = await updateRecord(
        tables.ingredientChecklistRecords,
        ingredientChecklistData,
        condition
      );
    } else {
      ingredientChecklistData.user_id = user_id;
      ingredientChecklistData.active_order_id = active_order_id;
      updateResult = await insertRecord(
        tables.ingredientChecklistRecords,
        Object.keys(ingredientChecklistData),
        Object.values(ingredientChecklistData)
      );
      updateResult.affectedRows = updateResult.insertId ? 1 : 0;
    }

    if (updateResult.affectedRows === 0) {
      return res.status(500).json({
        status: false,
        message: "Failed to update or insert ingredient checklist",
      });
    }

    // Handle completion actions if is_last is true
    if (is_last) {
      const { results: userDetails } = await readRecord({
        table: tables.userDetails,
        selectFields: ["first_name", "last_name", "mentor_assigned"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });

      if (!userDetails.length) {
        return res.status(404).json({
          status: false,
          message: "User not found",
        });
      }

       let updateUserResult = await updateRecord(
        tables.userDetails,
        { sub_user_status: "Active"},
        { user_id:user_id}
      );

      const data = {
        title: `${userDetails[0].first_name} ${userDetails[0].last_name} Has Filled ICL`,
        priority: 1,
        redirect: "/naf-icl",
      };

      const insertedResultNotification = await insertRecord(
        tables.mentorNotifications,
        ["user_id", "admin_id", "content", "redirect"],
        [user_id, userDetails[0].mentor_assigned, data.title, "/naf-icl"]
      );

      if (insertedResultNotification.affectedRows === 0) {
        return res.status(500).json({
          status: false,
          message: "Error while inserting mentor notification",
        });
      }

      sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });

      await addAmountWallet({
        user_id,
        sub_order_id: active_order_id,
        amount: 500,
        reason: "NAF/ICL filled",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Ingredient List Updated Successfully",
      screen_name: "Ingredient List",
      data: { is_complete: is_last },
    });
  } catch (error) {
    console.error("Error in submitIngredientChecklist:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
