import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import {
  addHoursToTime,
  calculateAge,
  filterObjectRemoveNullValues,
  getCurrentDateTime,
  safeJSONParse,
} from "../helper/commonHelper.js";
import { cloudinaryFolders, tables } from "../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../helper/uploadToCloudinary.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";

//API For Assessment Listing
export const getAssessmentList = async (req, res) => {
  try {
    const { user_id, active_order_id } = req.body;

    // Input validation
    if (!user_id || !active_order_id) {
      return res.status(400).json({
        status: false,
        message: "user_id and active_order_id are required",
      });
    }

    // Get active order details
    const orderColumns = [
      "sod.order_id",
      "sod.order_type",
      "sod.program_combo",
      "pm.program_name",
      "ps.program_sessions",
      "ps.validity",
      "ps.extra_validity",
      "pm.program_category as program_category",
      "ps.ask_imf_window",
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sod.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
    ];

    const conditions = [
      { field: "sod.sub_order_id", operator: "=", value: active_order_id },
    ];

    const { results: active_order_details } = await readRecord({
      table: `${tables.subOrderPrograms} sod`,
      selectFields: orderColumns,
      joins,
      conditions,
    });

    if (!active_order_details.length) {
      return res.status(404).json({
        status: false,
        message: "Active order not found",
      });
    }

    // Check assessment
    const { results: assessmentDetails } = await readRecord({
      table: tables.assessment,
      selectFields: ["*"],
      conditions: [
        { field: "active_order_id", operator: "=", value: active_order_id },
      ],
      orderBy: ["assessment_id DESC"],
      pagination: { limit: 1 },
    });

    const saleTypeForAssessment = ["New", "OCR", "Free"];
    let assessmentId =
      assessmentDetails.length > 0 ? assessmentDetails[0].assessment_id : null;
    const responseBase = {
      status: true,
      message: "Assessment List Fetched Successfully",
      screen_name: "Assessment List",
    };
    if (
      assessmentDetails.length === 0 &&
      saleTypeForAssessment.includes(active_order_details[0].order_type)
    ) {
      const currentDate = getCurrentDateTime();
      const insertResult = await insertRecord(
        tables.assessment,
        ["user_id", "active_order_id", "added_date", "added_by"],
        [user_id, active_order_id, currentDate, user_id]
      );

      assessmentId = insertResult.insertId;
      const assessmentListArray = [
        {
          title: "Personal Details",
          screen: "assessment_personal_details",
          status: "1",
        },
        {
          title: "Nutrition & Lifestyle",
          screen: "assessment_nutrition_lifestyle",
          status: "1",
        },
        {
          title: "Workout Details",
          screen: "assessment_workout_details",
          status: "1",
        },
        {
          title: "Food Recall Details",
          screen: "assessment_24_hour_diet_recall",
          status: "1",
        },
        {
          title: "Food Frequency",
          screen: "assessment_food_frequency",
          status: "1",
        },
        {
          title: "Upload Photo",
          screen: "assessment_upload_photo",
          status: "1",
        },
        {
          title: "Medical History",
          screen: "assessment_medical_history",
          status: "1",
        },
        {
          title: "Note to Mentor & Khyati",
          screen: "assessment_note_to_khyati",
          status: "1",
        },
      ];

      if (active_order_details[0].ask_imf_window === 1) {
        assessmentListArray.push({
          title: "Fasting Window",
          screen: "assessment_fasting_method",
          status: "0",
        });
      } else if (
        active_order_details[0].program_combo &&
        active_order_details[0].program_combo.toLowerCase().includes("imf")
      ) {
        assessmentListArray.push({
          title: "Fasting Window",
          screen: "assessment_fasting_method",
          status: "0",
        });
      }

      return res.status(201).json({
        ...responseBase,
        data: {
          assessment_id: assessmentId,
          assessment_list: assessmentListArray,
          client_service_number: "+918928001619",
          assessment_status: "1",
          is_fasting_window: active_order_details[0].ask_imf_window === 1,
        },
      });
    }

    // Existing assessment case
    const assessmentListArray = [
      {
        title: "Personal Details",
        screen: "assessment_personal_details",
        status: assessmentDetails[0]?.personal_details.toString(),
      },
      {
        title: "Nutrition & Lifestyle",
        screen: "assessment_nutrition_lifestyle",
        status: assessmentDetails[0]?.nutrition_lifestyle.toString(),
      },
      {
        title: "Workout Details",
        screen: "assessment_workout_details",
        status: assessmentDetails[0]?.workout_details.toString(),
      },
      {
        title: "Food Recall Details",
        screen: "assessment_24_hour_diet_recall",
        status: assessmentDetails[0]?.diet_recall.toString(),
      },
      {
        title: "Food Frequency",
        screen: "assessment_food_frequency",
        status: assessmentDetails[0]?.food_frequency.toString(),
      },
      {
        title: "Upload Photo",
        screen: "assessment_upload_photo",
        status: assessmentDetails[0]?.upload_photo.toString(),
      },
      {
        title: "Medical History",
        screen: "assessment_medical_history",
        status: assessmentDetails[0]?.medical_history.toString(),
      },
      {
        title: "Note to Mentor & Khyati",
        screen: "assessment_note_to_khyati",
        status: assessmentDetails[0]?.note_to_mentor_and_khyati.toString(),
      },
    ];

    if (active_order_details[0].ask_imf_window === 1) {
      assessmentListArray.push({
        title: "Fasting Window",
        screen: "assessment_fasting_method",
        status: assessmentDetails[0]?.fasting_window?.toString() || "0",
      });
    } else if (
      active_order_details[0].program_combo &&
      active_order_details[0].program_combo.toLowerCase().includes("imf")
    ) {
      assessmentListArray.push({
        title: "Fasting Window",
        screen: "assessment_fasting_method",
        status: assessmentDetails[0]?.fasting_window?.toString() || "0",
      });
    }

    const assessment_fill_status =
      assessmentDetails[0]?.note_to_mentor_and_khyati === "2" ? "1" : "0";

    return res.status(200).json({
      ...responseBase,
      data: {
        assessment_id: assessmentId,
        assessment_list: assessmentListArray,
        client_service_number: "+918928001619",
        assessment_status: assessment_fill_status,
        is_fasting_window: active_order_details[0].ask_imf_window === 1,
      },
    });
  } catch (error) {
    console.error("Error in getAssessmentList:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
//API for Getting Personal Details
export const getPersonalDetails = async (req, res) => {
  try {
    const { user_id, assessment_id } = req.body;

    // Input validation
    if (!user_id || !assessment_id) {
      return res.status(400).json({
        status: false,
        message: "user_id and assessment_id are required",
      });
    }

    // Check for existing personal details
    const personalDetailsResult = await readRecord({
      table: tables.assessment_personal_details,
      selectFields: ["*"],
      conditions: [
        { field: "assessment_id", operator: "=", value: assessment_id },
      ],
    });

    const personalDetails = personalDetailsResult.results;

    if (personalDetails.length === 0) {
      // Fetch prefill data from user details
      const userDetailsResult = await readRecord({
        table: tables.userDetails,
        selectFields: [
          "first_name",
          "last_name",
          "email_id",
          "phone_code",
          "phone_number",
        ],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });

      const userDetails = userDetailsResult.results;
      if (!userDetails.length) {
        return res.status(404).json({
          status: false,
          message: "User details not found",
        });
      }

      const name = `${userDetails[0].first_name} ${userDetails[0].last_name}`;
      const personalDetailsData = {
        name,
        email_id: userDetails[0].email_id,
        phone_number: userDetails[0].phone_number,
      };

      return res.status(200).json({
        status: true,
        message: "Personal Details Fetched Successfully",
        screen_name: "Personal Details",
        data: personalDetailsData,
      });
    }

    // Process existing personal details
    const personalDetail = { ...personalDetails[0] };

    // Handle child details
    // if (personalDetail.child_details) {
    //   const childBirthDates = personalDetail.child_details.split(",");
    //   childBirthDates.forEach((date, index) => {
    //     personalDetail[`childBirthdate_${index + 1}`] = date.trim();
    //   });
    // }

    // Country of residence lookup
    if (personalDetail.country_of_residence) {
      const countryResult = await readRecord({
        table: tables.countries,
        selectFields: ["country_name"],
        conditions: [
          {
            field: "country_id",
            operator: "=",
            value: personalDetail.country_of_residence,
          },
        ],
      });
      personalDetail.country_of_residence_name =
        countryResult.results[0]?.country_name || "";
    } else {
      personalDetail.country_of_residence_name = "";
    }

    // Country of origin lookup (optional)
    if (personalDetail.country_of_origin) {
      const originResult = await readRecord({
        table: tables.countries,
        selectFields: ["country_name"],
        conditions: [
          {
            field: "country_id",
            operator: "=",
            value: personalDetail.country_of_origin,
          },
        ],
      });
      personalDetail.country_of_origin_name =
        originResult.results[0]?.country_name || "";
    } else {
      personalDetail.country_of_origin = "";
      personalDetail.country_of_origin_name = "";
    }

    // State lookup
    if (personalDetail.state) {
      const stateResult = await readRecord({
        table: tables.states,
        selectFields: ["state_name"],
        conditions: [
          { field: "state_id", operator: "=", value: personalDetail.state },
        ],
      });
      personalDetail.state_name = stateResult.results[0]?.state_name || "";
    } else {
      personalDetail.state_name = "";
    }

    // City lookup
    if (personalDetail.city) {
      const cityResult = await readRecord({
        table: tables.cities,
        selectFields: ["city_name"],
        conditions: [
          { field: "city_id", operator: "=", value: personalDetail.city },
        ],
      });
      personalDetail.city_name = cityResult.results[0]?.city_name || "";
    } else {
      personalDetail.city_name = "";
    }

    // Remove null values
    const personalDetailsData = filterObjectRemoveNullValues(personalDetail);

    return res.status(200).json({
      status: true,
      message: "Personal Details Fetched Successfully",
      screen_name: "Personal Details",
      data: personalDetailsData,
    });
  } catch (error) {
    console.error("Error in getPersonalDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for Getting Nutrition and Lifestyle Details
export const getNutritionAndLifestyleDetails = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Nutrition Lifestyle details against assessment id
    const nutritionLifestyleDetailstable =
      tables.assessment_nutrition_and_lifestyle;
    const selectNutritionLifestyleDetailsColumns = ["*"];
    const nutritionLifestyleDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: nutritionLifestyleDetails } = await readRecord({
      table: `${nutritionLifestyleDetailstable}`,
      selectFields: selectNutritionLifestyleDetailsColumns,
      conditions: nutritionLifestyleDetailsWhereCondition,
    });

    //Parameters from Personal Details Form for CONDITIONS

    const personalDetailstable = tables.assessment_personal_details;
    const selectpersonalDetailsColumns = ["family_type", "ethinicity"];
    const personalDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: personalDetails } = await readRecord({
      table: `${personalDetailstable}`,
      selectFields: selectpersonalDetailsColumns,
      conditions: personalDetailsWhereCondition,
    });

    //If not found then fetch and send data which is to be shown prefilled in the form
    if (nutritionLifestyleDetails.length == 0) {
      const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
      ];
      const userDetailsWhereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });

      const nutritionLifestyleDetailsData = {};
      var jain_restrictions = 0;
      const jain_array = ["Jain", "Gujrati Jain"];
      if (
        personalDetails[0]?.ethnicity &&
        jain_array.some(
          (item) =>
            item.toLowerCase() === personalDetails[0].ethnicity.toLowerCase()
        )
      ) {
        jain_restrictions = 1;
      }
      nutritionLifestyleDetailsData["jain_food_restrictions"] =
        jain_restrictions;
      return res.status(201).json({
        status: true,
        message: "Nutrition and Lifestyle Details Fetched Successfully.",
        screen_name: "Nutrition and Lifestyle Details",
        family_type: personalDetails[0].family_type,
        ethinicity: personalDetails[0].ethinicity,
        data: nutritionLifestyleDetailsData,
      });
    } else {
      //Remove all the null values from extracted data
      const nutritionLifestyleDetailsData = filterObjectRemoveNullValues(
        nutritionLifestyleDetails[0]
      );
      console.log(nutritionLifestyleDetails[0], 469);
      console.log(nutritionLifestyleDetailsData, 470);
      function extractClientFoodData(data) {
        const parseJSON = (input, fallback = {}) => {
          try {
            return typeof input === "string"
              ? JSON.parse(input)
              : input || fallback;
          } catch (e) {
            return fallback;
          }
        };

        const extractFoodPreferences = (raw) => {
          const parsed = parseJSON(raw, {});
          const preferenceObj = parsed.preference || parsed;
          return Object.values(preferenceObj || {})
            .map((f) => f?.trim())
            .filter(Boolean);
        };

        const extractAversions = (raw) => {
          const parsed = parseJSON(raw, {});
          const aversionObj = parsed.aversion || parsed;
          return Object.values(aversionObj || {})
            .map((f) => f?.trim())
            .filter(Boolean);
        };

        const extractAllergies = (raw) => {
          const parsed = parseJSON(raw, {});
          const allergyBlock = parsed?.allergies || parsed;
          let allAllergies = [];

          // ✅ Case 1: Structured allergy object (with food/sub_food/any_other_sub_food)
          if (typeof allergyBlock === "object") {
            for (const allergy of Object.values(allergyBlock)) {
              if (typeof allergy === "object") {
                const main = allergy.food?.trim();
                const subFoods = Array.isArray(allergy.sub_food)
                  ? allergy.sub_food.map((s) => s?.trim()).filter(Boolean)
                  : [];
                const others = Array.isArray(allergy.any_other_sub_food)
                  ? allergy.any_other_sub_food
                      .map((s) => s?.trim())
                      .filter(Boolean)
                  : [];
                if (main) allAllergies.push(main);
                allAllergies.push(...subFoods, ...others);
              } else if (typeof allergy === "string") {
                // ✅ Case 2: Flat format like { allergy_1: "Gluten" }
                allAllergies.push(allergy.trim());
              }
            }
          }

          // ✅ Case 3: Fallback to other_allergies
          const otherAllergies = parsed.other_allergies || {};
          for (const val of Object.values(otherAllergies)) {
            if (typeof val === "string") {
              const parts = val
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
              allAllergies.push(...parts);
            }
          }

          // ✅ Remove duplicates
          return [...new Set(allAllergies)];
        };

        const getPreferredCuisine = (input) => {
          try {
            const raw = input?.preferred_cuisine;

            // typeof raw === "string" ? JSON.parse(raw) :
            const parsed = raw;

            if (parsed?.cuisine && typeof parsed.cuisine === "object") {
              const values = Object.values(parsed.cuisine);
              if (values.length) return values;
            }

            if (Array.isArray(raw)) {
              return raw.length ? raw : null;
            }
          } catch (e) {
            // fail silently
          }

          return null;
        };
        return {
          food_preferences: extractFoodPreferences(data?.food_preference),
          allergies: extractAllergies(data?.food_allergies),
          aversions: extractAversions(data?.food_aversions),
          preferred_cuisine: data?.preferred_cuisine,
        };
      }
      const foodData = extractClientFoodData(nutritionLifestyleDetailsData);
      console.log(foodData, 549);
      var jain_restrictions = 0;
      const jain_array = ["Jain", "Gujrati Jain"];
      if (
        personalDetails[0]?.ethnicity &&
        jain_array.some(
          (item) =>
            item.toLowerCase() === personalDetails[0].ethnicity.toLowerCase()
        )
      ) {
        jain_restrictions = 1;
      }
      nutritionLifestyleDetailsData["jain_food_restrictions"] =
        jain_restrictions;
      return res.status(201).json({
        status: true,
        message: "Nutrition and Lifestyle Details Fetched Successfully.",
        screen_name: "Nutrition and Lifestyle Details",
        family_type: personalDetails[0].family_type,
        ethinicity: personalDetails[0].ethinicity,
        data: {
          ...nutritionLifestyleDetailsData,
          preferred_cuisine: foodData.preferred_cuisine,
          food_preference: foodData.food_preferences,
          food_aversions: foodData.aversions,
          food_allergies: foodData.allergies,
        },
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Nutrition and Lifestyle Details
export const getWorkoutDetails = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Nutrition Lifestyle details against assessment id
    const workoutDetailstable = tables.assessment_workout_details;
    const selectWorkoutDetailsColumns = ["*"];
    const workoutDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: workoutDetails } = await readRecord({
      table: `${workoutDetailstable}`,
      selectFields: selectWorkoutDetailsColumns,
      conditions: workoutDetailsWhereCondition,
    });
    //If not found then fetch and send data which is to be shown prefilled in the form
    if (workoutDetails.length == 0) {
      const workoutDetailsData = {};
      return res.status(201).json({
        message: "Workout Details Fetched Successfully.",
        screen_name: "Workout Details",
        data: workoutDetailsData,
      });
    } else {
      //Remove all the null values from extracted data
      const workoutDetailsData = filterObjectRemoveNullValues(
        workoutDetails[0]
      );
      return res.status(201).json({
        message: "Workout Details Fetched Successfully.",
        screen_name: "Workout Details",
        data: workoutDetailsData,
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Medical History Details
export const getMedicalHistory = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Medical History details against assessment id
    const medicalHistoryDetailstable = tables.assessment_medical_history;
    const selectMedicalHistoryDetailsColumns = ["*"];
    const medicalHistoryDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: medicalHistoryDetails } = await readRecord({
      table: `${medicalHistoryDetailstable}`,
      selectFields: selectMedicalHistoryDetailsColumns,
      conditions: medicalHistoryDetailsWhereCondition,
    });

    //Parameters from Personal Details Form for CONDITIONS
    const personalDetailstable = tables.assessment_personal_details;
    const selectpersonalDetailsColumns = ["gender"];
    const personalDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: personalDetails } = await readRecord({
      table: `${personalDetailstable}`,
      selectFields: selectpersonalDetailsColumns,
      conditions: personalDetailsWhereCondition,
    });

    //If not found then fetch and send data which is to be shown prefilled in the form
    if (medicalHistoryDetails.length == 0) {
      const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
      ];
      const userDetailsWhereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });
      //Check for Personal details against assessment id
      const personalDetailstable = tables.assessment_personal_details;
      const selectPersonalDetailsColumns = [
        "gender",
        "date_of_birth",
        "is_pregnant",
      ];
      const personalDetailsWhereCondition = [
        { field: "assessment_id", operator: "=", value: assessment_id },
      ];
      const { results: personalDetails } = await readRecord({
        table: `${personalDetailstable}`,
        selectFields: selectPersonalDetailsColumns,
        conditions: personalDetailsWhereCondition,
      });
      const userAge = calculateAge(personalDetails[0].date_of_birth);
      const medicalHistoryDetailsData = {};
      return res.status(201).json({
        message: "Medical History Details Fetched Successfully.",
        screen_name: "Medical History",
        gender: personalDetails[0].gender,
        age: userAge,
        is_pregnant: personalDetails[0].is_pregnant,
        data: medicalHistoryDetailsData,
        medical_history_id: medicalHistoryDetailsData.medical_history_id,
      });
    } else {
      //Remove all the null values from extracted data
      const medicalHistoryDetailsData = filterObjectRemoveNullValues(
        medicalHistoryDetails[0]
      );

      return res.status(201).json({
        message: "Medical History Details Fetched Successfully.",
        screen_name: "Medical History",
        data: medicalHistoryDetailsData,
        medical_history_id: medicalHistoryDetailsData.medical_history_id,
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Diet Recall Details here
export const getDietRecall = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Personal details against assessment id
    const dietRecallDetailstable = tables.assessment_24_hour_diet_recall;
    const selectDietRecallDetailsColumns = ["*"];
    const dietRecallDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: dietRecallDetails } = await readRecord({
      table: `${dietRecallDetailstable}`,
      selectFields: selectDietRecallDetailsColumns,
      conditions: dietRecallDetailsWhereCondition,
      orderBy: ["diet_recall_id desc"],
      pagination: ["limit 1"],
    });

    //Parameters from Personal Details Form for CONDITIONS
    const workoutDetailstable = tables.assessment_workout_details;
    const selectworkoutDetailsColumns = ["is_workout"];
    const workoutDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: workoutDetails } = await readRecord({
      table: `${workoutDetailstable}`,
      selectFields: selectworkoutDetailsColumns,
      conditions: workoutDetailsWhereCondition,
    });
    //If not found then fetch and send data which is to be shown prefilled in the form
    if (dietRecallDetails.length == 0) {
      const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
      ];
      const userDetailsWhereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });
      const dietRecallDetailsData = {};
      return res.status(201).json({
        message: "24 Hour Diet Recall Details Fetched Successfully.",
        screen_name: "24 Hour Diet Recall",
        is_workout: workoutDetails[0].is_workout,
        data: dietRecallDetailsData,
      });
    } else {
      //Remove all the null values from extracted data
      const dietRecallDetailsData = filterObjectRemoveNullValues(
        dietRecallDetails[0]
      );
      return res.status(201).json({
        message: "24 Hour Diet Recall Details Fetched Successfully.",
        screen_name: "24 Hour Diet Recall",
        is_workout: workoutDetails[0].is_workout,
        data: dietRecallDetailsData,
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Food Frequency Details
export const getFoodFrequency = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for food_frequency_column Nutrition Lifestyle details against assessment id
    const nutritionLifestyleDetailstable =
      tables.assessment_nutrition_and_lifestyle;
    const selectNutritionLifestyleDetailsColumns = [
      "nutrition_and_lifestyle_id",
      "eating_habit",
      "food_frequency",
      "food_allergies",
    ];
    const nutritionLifestyleDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: nutritionLifestyleDetails } = await readRecord({
      table: `${nutritionLifestyleDetailstable}`,
      selectFields: selectNutritionLifestyleDetailsColumns,
      conditions: nutritionLifestyleDetailsWhereCondition,
    });

    //Parameters from Personal Details Form for CONDITIONS
    const personalDetailstable = tables.assessment_personal_details;
    const selectpersonalDetailsColumns = [
      "country_of_residence",
      "ethinicity",
      "family_type",
    ];
    const personalDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: personalDetails } = await readRecord({
      table: `${personalDetailstable}`,
      selectFields: selectpersonalDetailsColumns,
      conditions: personalDetailsWhereCondition,
    });

    //Logic for fetching condition based food frequency list
    const gcc_country = [17, 117, 165, 178, 191, 229, 223, 64, 85]; //GCC countries + turkey + greece + egypt
    let country_type = "";
    let food_frequency_where_condition = "";
    //Check Allergy
    let allergy = [];
    if (
      nutritionLifestyleDetails.length > 0 &&
      nutritionLifestyleDetails[0].food_allergies
    ) {
      allergy = JSON.parse(
        nutritionLifestyleDetails[0].food_allergies
      ).allergies;
    }

    // const total_allergies = Object.keys(allergy).length;
    let allergy_array = [];
    if (allergy?.length > 0) {
      for (const key in allergy) {
        if (allergy.hasOwnProperty(key)) {
          // Optional check to avoid inherited properties
          allergy_array.push(`${allergy[key].food}`);
        }
      }
    }

    //Tulu, Tamilian, Manglorean, Telugu, Malayali Ethnicity
    const south_indian_ethinicity = [
      "Tulu",
      "Tamilian",
      "Manglorean",
      "Telugu",
      "Malayali",
    ];
    //check eating habits
    // if (
    //   nutritionLifestyleDetails[0].eating_habit.toLowerCase() == "vegetarian"
    // ) {
    //   if (personalDetails[0].country_of_residence == "101") {
    //     if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       food_frequency_where_condition = [
    //         { field: "veg_south_indian", operator: "=", value: "1" },
    //       ];
    //     } else {
    //       if(allergy_array.includes("Gluten") && allergy_array.includes("Lactose")){
    //         food_frequency_where_condition = [
    //           { field: "veg_indian_lactose_gluten", operator: "=", value: "1" },
    //         ];
    //       }

    //       if (allergy_array.includes("Gluten")) {
    //         food_frequency_where_condition = [
    //           { field: "veg_indian_gluten", operator: "=", value: "1" },
    //         ];
    //       }

    //       if (allergy_array.includes("Lactose")) {
    //           food_frequency_where_condition = [
    //             { field: "veg_indian_gluten", operator: "=", value: "1" },
    //           ];
    //       }
    //     }
    //   } else {
    //     //check if country is among gcc + turkey + greece + egypt
    //     if (gcc_country.includes(personalDetails[0].country_of_residence)) {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //         food_frequency_where_condition = [
    //           { field: "veg_south_indian", operator: "=", value: "1" },
    //         ];
    //       } else {
    //         if(allergy_array.includes("Gluten") && allergy_array.includes("Lactose")){
    //           food_frequency_where_condition = [
    //             { field: "veg_nri_gcc_lactose_gluten", operator: "=", value: "1" },
    //           ];
    //         }

    //         if (allergy_array.includes("Gluten")) {
    //           food_frequency_where_condition = [
    //             { field: "veg_indian_gluten", operator: "=", value: "1" },
    //           ];
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //             food_frequency_where_condition = [
    //               { field: "veg_indian_lactose", operator: "=", value: "1" },
    //             ];
    //         }
    //       }
    //     } else {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //         food_frequency_where_condition = [
    //           { field: "veg_south_indian", operator: "=", value: "1" },
    //         ];
    //       } else {
    //         if(allergy_array.includes("Gluten") && allergy_array.includes("Lactose")){
    //           food_frequency_where_condition = [
    //             { field: "veg_nri_lactose_gluten", operator: "=", value: "1" },
    //           ];
    //         }

    //         if (allergy_array.includes("Gluten")) {
    //           food_frequency_where_condition = [
    //             { field: "veg_nri_gluten", operator: "=", value: "1" },
    //           ];
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //             food_frequency_where_condition = [
    //               { field: "veg_nri_lactose", operator: "=", value: "1z" },
    //             ];
    //         }
    //       }
    //     }
    //   }
    // } else if (
    //   nutritionLifestyleDetails[0].eating_habit.toLowerCase() ==
    //   "vegan (eating only plant-based foods)"
    // ) {
    //   if (personalDetails[0].country_of_residence == "101") {

    //   } else {
    //     //check if country is among gcc + turkey + greece + egypt
    //     if (gcc_country.includes(personalDetails[0].country_of_residence)) {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       } else {
    //         if (allergy_array.includes("Gluten")) {
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //         }
    //       }
    //     } else {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       } else {
    //         if (allergy_array.includes("Gluten")) {
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //         }
    //       }
    //     }
    //   }
    // } else if (
    //   nutritionLifestyleDetails[0].eating_habit.toLowerCase() ==
    //   "ovo-vegetarian (veg. eating eggs"
    // ) {
    //   if (personalDetails[0].country_of_residence == "101") {
    //     if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //     } else {
    //       if (allergy_array.includes("Gluten")) {
    //       }

    //       if (allergy_array.includes("Lactose")) {
    //       }
    //     }
    //   } else {
    //     //check if country is among gcc + turkey + greece + egypt
    //     if (gcc_country.includes(personalDetails[0].country_of_residence)) {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       } else {
    //         if (allergy_array.includes("Gluten")) {
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //         }
    //       }
    //     } else {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       } else {
    //         if (allergy_array.includes("Gluten")) {
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //         }
    //       }
    //     }
    //   }
    // } else {
    //   if (personalDetails[0].country_of_residence == "101") {
    //     if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //     } else {
    //       if (allergy_array.includes("Gluten")) {
    //       }

    //       if (allergy_array.includes("Lactose")) {
    //       }
    //     }
    //   } else {
    //     //check if country is among gcc + turkey + greece + egypt
    //     if (gcc_country.includes(personalDetails[0].country_of_residence)) {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       } else {
    //         if (allergy_array.includes("Gluten")) {
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //         }
    //       }
    //     } else {
    //       if (south_indian_ethnicity.includes(personalDetails[0].ethinicity)) {
    //       } else {
    //         if (allergy_array.includes("Gluten")) {
    //         }

    //         if (allergy_array.includes("Lactose")) {
    //         }
    //       }
    //     }
    //   }
    // }
    let foodListWhereCondition = [];
    if (
      nutritionLifestyleDetails[0].eating_habit.toLowerCase() == "vegetarian"
    ) {
      if (personalDetails[0].country_of_residence == "101") {
        foodListWhereCondition = [
          { field: "veg_indian", operator: "=", value: "1" },
        ];
      } else {
        foodListWhereCondition = [
          { field: "veg_nri", operator: "=", value: "1" },
        ];
      }
    } else if (
      nutritionLifestyleDetails[0].eating_habit.toLowerCase() ==
        "ovo-vegetarian" ||
      nutritionLifestyleDetails[0].eating_habit.toLowerCase() ==
        "ovo-vegetarian (veg. eating eggs)"
    ) {
      if (personalDetails[0].country_of_residence == "101") {
        foodListWhereCondition = [
          { field: "ovo_veg_indian", operator: "=", value: "1" },
        ];
      } else {
        foodListWhereCondition = [
          { field: "ovo_veg_nri", operator: "=", value: "1" },
        ];
      }
    } else if (
      nutritionLifestyleDetails[0].eating_habit.toLowerCase() ==
        "vegan (eating only plant-based foods)" ||
      nutritionLifestyleDetails[0].eating_habit.toLowerCase() == "vegan"
    ) {
      if (personalDetails[0].country_of_residence == "101") {
        foodListWhereCondition = [
          { field: "vegan_indian", operator: "=", value: "1" },
        ];
      } else {
        foodListWhereCondition = [
          { field: "vegan_nri", operator: "=", value: "1" },
        ];
      }
    } else {
      if (personalDetails[0].country_of_residence == "101") {
        foodListWhereCondition = [
          { field: "non_veg_indian", operator: "=", value: "1" },
        ];
      } else {
        foodListWhereCondition = [
          { field: "non_veg_nri", operator: "=", value: "1" },
        ];
      }
    }

    //Fetch Food List

    const foodListtable = tables.food_frequency_master;
    const selectfoodListColumns = ["food_id", "food_name", "food_sub_text"];
    const { results: foodList } = await readRecord({
      table: `${foodListtable}`,
      selectFields: selectfoodListColumns,
      conditions: foodListWhereCondition,
    });
    let foodFrequencyDetailsData = [];

    //If not found then fetch and send data which is to be shown prefilled in the form
    if (
      nutritionLifestyleDetails.length == 0 ||
      nutritionLifestyleDetails[0].food_frequency == null
    ) {
      const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
      ];
      const userDetailsWhereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });
      let foodArray = {};
      for (let i = 0; i < foodList.length; i++) {
        foodArray = {
          food_id: foodList[i].food_id,
          food_name: foodList[i].food_name,
          food_sub_text: foodList[i].food_sub_text,
          value: "",
        };
        foodFrequencyDetailsData.push(foodArray);
      }

      return res.status(201).json({
        message: "Food Frequency Details Fetched Successfully.",
        screen_name: "Food Frequency",
        nutrition_and_lifestyle_id:
          nutritionLifestyleDetails[0].nutrition_and_lifestyle_id,
        data: foodFrequencyDetailsData,
      });
    } else {
      //Remove all the null values from extracted data
      let foodFrequencyFilled;
      try {
        foodFrequencyFilled = JSON.parse(
          nutritionLifestyleDetails[0].food_frequency || "[]"
        );
        if (typeof foodFrequencyFilled === "string") {
          foodFrequencyFilled = JSON.parse(foodFrequencyFilled);
        }
      } catch (parseError) {
        console.error("Error parsing food_frequency:", parseError);
        return res.status(500).json({
          status: false,
          message: "Invalid food frequency data format",
        });
      }

      const foodFrequencyDetailsData = [];

      for (let i = 0; i < foodList.length; i++) {
        const indexOfMatchedValue = foodFrequencyFilled.findIndex(
          (food) => food.food_name === foodList[i].food_name
        );

        let filledValue = "";
        if (indexOfMatchedValue !== -1) {
          filledValue = foodFrequencyFilled[indexOfMatchedValue].value;
        }

        const foodArray = {
          food_id: foodList[i].food_id,
          food_name: foodList[i].food_name,
          food_sub_text: foodList[i].food_sub_text,
          value: filledValue,
        };

        foodFrequencyDetailsData.push(foodArray);
      }

      return res.status(200).json({
        status: true,
        message: "Food Frequency Details Fetched Successfully",
        screen_name: "Food Frequency",
        nutrition_and_lifestyle_id:
          nutritionLifestyleDetails[0].nutrition_and_lifestyle_id,
        data: foodFrequencyDetailsData,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Assessment Photo Details
export const getAssessmentPhoto = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Personal details against assessment id
    const personalDetailstable = tables.assessment_personal_details;
    const selectPersonalDetailsColumns = [
      "personal_details_id",
      "assessment_photo",
    ];
    const personalDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: personalDetails } = await readRecord({
      table: `${personalDetailstable}`,
      selectFields: selectPersonalDetailsColumns,
      conditions: personalDetailsWhereCondition,
    });
    //If not found then fetch and send data which is to be shown prefilled in the form

    if (
      personalDetails.length == 0 ||
      personalDetails[0].assessment_photo == null
    ) {
      const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
      ];
      const userDetailsWhereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });
      const assessmentPhotoDetailsData = {};
      return res.status(201).json({
        message: "Assessment Photo Fetched Successfully.",
        screen_name: "Upload Photo",
        personal_detail_id: personalDetails[0].personal_details_id,
        data: assessmentPhotoDetailsData[0],
      });
    } else {
      //Remove all the null values from extracted data
      const assessmentPhotoDetailsData =
        filterObjectRemoveNullValues(personalDetails);
      assessmentPhotoDetailsData[0].assessment_photo = JSON.stringify([
        JSON.parse(assessmentPhotoDetailsData[0].assessment_photo),
      ]);
      return res.status(201).json({
        message: "Assessment Photo Fetched Successfully.",
        screen_name: "Upload Photo",
        personal_detail_id: personalDetails[0].personal_details_id,
        data: assessmentPhotoDetailsData[0],
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Medication Details
export const getMedicationDetails = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Medical Report Attachment details against assessment id
    const medicationDetailstable = tables.assessment_medical_history;
    const selectMedicationDetailsColumns = [
      "acidity",
      "blood_pressure",
      "cholesterol",
      "cholesterol",
      "diabetes",
      "pcos",
      "thyroid",
      "fatty_liver",
      "other_medical_issue",
      "medical_history_id",
      "medication_details",
    ];
    const medicationDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: medicationDetails } = await readRecord({
      table: `${medicationDetailstable}`,
      selectFields: selectMedicationDetailsColumns,
      conditions: medicationDetailsWhereCondition,
    });
    let medicalIssues = [];
    if (medicationDetails[0].acidity) {
      medicalIssues.push("Acidity");
    }

    if (medicationDetails[0].blood_pressure) {
      medicalIssues.push("Blood Pressure");
    }

    if (medicationDetails[0].cholesterol) {
      medicalIssues.push("Cholesterol");
    }

    if (medicationDetails[0].pcos) {
      medicalIssues.push("PCOS");
    }

    if (medicationDetails[0].diabetes) {
      medicalIssues.push("Diabetes");
    }

    if (medicationDetails[0].thyroid) {
      medicalIssues.push("Thyroid");
    }

    if (medicationDetails[0].fatty_liver) {
      medicalIssues.push("Fatty Liver");
    }

    if (medicationDetails[0].other_medical_issue) {
      const otherMedicalIssues = Object.values(
        JSON.parse(medicationDetails[0].other_medical_issue)
      );
      if (otherMedicalIssues) {
        medicalIssues = [...medicalIssues, ...otherMedicalIssues];
      }
    }

    //If not found then fetch and send data which is to be shown prefilled in the form
    if (
      medicationDetails[0].medication_details == null ||
      medicationDetails[0].medication_details == ""
    ) {
      const medicationDetailsData = "";
      return res.status(201).json({
        message: "Medication Details Fetched Successfully.",
        screen_name: "Medication etails",
        medical_history_id: medicationDetails[0].medical_history_id,
        medical_issues: medicalIssues,
        data: medicationDetailsData,
      });
    } else {
      //Remove all the null values from extracted data
      const medicationDetailsData = filterObjectRemoveNullValues(
        medicationDetails[0]
      );
      return res.status(201).json({
        message: "Medication Details Fetched Successfully.",
        screen_name: "Medication Details",
        medical_history_id: medicationDetails[0].medical_history_id,
        medical_issues: medicalIssues,
        data: medicationDetailsData.medication_details,
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Attached Medical Reports Details
export const getMedicalReports = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Medical Report Attachment details against assessment id
    const medicalHistoryDetailstable = tables.assessment_medical_history;
    const selectMedicalHistoryDetailsColumns = [
      "medical_history_id",
      "report_attachment_details",
    ];
    const medicalHistoryDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: medicalHistoryDetails } = await readRecord({
      table: `${medicalHistoryDetailstable}`,
      selectFields: selectMedicalHistoryDetailsColumns,
      conditions: medicalHistoryDetailsWhereCondition,
    });
    //If not found then fetch and send data which is to be shown prefilled in the form
    if (medicalHistoryDetails[0].report_attachment_details == null) {
      const medicalReportDetailsData = "";
      return res.status(201).json({
        status: true,
        message: "Medical Reports Fetched Successfully.",
        screen_name: "Medical Report",
        medical_history_id: medicalHistoryDetails[0].medical_history_id,
        data: medicalReportDetailsData,
      });
    } else {
      //Remove all the null values from extracted data
      const medicalReportDetailsData = filterObjectRemoveNullValues(
        medicalHistoryDetails[0]
      );
      return res.status(201).json({
        status: true,
        message: "Medical Reports Fetched Successfully.",
        screen_name: "Medical Report",
        medical_history_id: medicalHistoryDetails[0].medical_history_id,
        data: medicalReportDetailsData.report_attachment_details,
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Note to Mentor and Khyati Details
export const getNoteToMentorAndKhyati = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  try {
    //Check for Personal details against assessment id
    const personalDetailstable = tables.assessment_personal_details;
    const selectPersonalDetailsColumns = [
      "personal_details_id",
      "note_to_mentor_and_khyati",
    ];
    const personalDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
    ];
    const { results: personalDetails } = await readRecord({
      table: `${personalDetailstable}`,
      selectFields: selectPersonalDetailsColumns,
      conditions: personalDetailsWhereCondition,
    });
    //If not found then fetch and send data which is to be shown prefilled in the form
    if (
      personalDetails.length == 0 ||
      personalDetails[0].note_to_mentor_and_khyati == null
    ) {
      const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
      ];
      const userDetailsWhereCondition = [
        { field: "user_id", operator: "=", value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });
      const noteToMentorAndKhyatiDetailsData = {};
      return res.status(201).json({
        message: "Note to Mentor and Khyati Fetched Successfully.",
        screen_name: "Note To Mentor And Khyati",
        personal_details_id: personalDetails[0].personal_details_id,
        data: noteToMentorAndKhyatiDetailsData[0],
      });
    } else {
      //Remove all the null values from extracted data
      const noteToMentorAndKhyatiDetailsData =
        filterObjectRemoveNullValues(personalDetails);
      return res.status(201).json({
        message: "Note to Mentor and Khyati Fetched Successfully.",
        personal_details_id: personalDetails[0].personal_details_id,
        screen_name: "Note To Mentor And Khyati",
        data: decodeURIComponent(
          noteToMentorAndKhyatiDetailsData[0].note_to_mentor_and_khyati?.replace(
            /\+/g,
            " "
          )
        ),
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//API for Getting Fasting Window Details
export const getFastingWindowDetails = async (req, res, next) => {
  try {
    const { user_id, assessment_id } = req.body;
    const fastingWindowDetailsWhereCondition = [
      { field: "assessment_id", operator: "=", value: assessment_id },
      { field: "user_id", operator: "=", value: user_id },
    ];

    // Fetch fasting window details from the database
    const { results: fastingWindowDetails } = await readRecord({
      table: tables.assessment_nutrition_and_lifestyle,
      selectFields: ["nutrition_and_lifestyle_id", "fasting_window_details"],
      conditions: fastingWindowDetailsWhereCondition,
    });

    // No fasting window details found
    if (!fastingWindowDetails || fastingWindowDetails.length === 0) {
          return res.status(200).json({
          success: true,
          data: {},
          message: "Fasting window Not Found"
          });
    }

    // Destructure the first result for clarity
    const { nutrition_and_lifestyle_id, fasting_window_details } =
      fastingWindowDetails[0];

    // If fasting window details are not available, return empty data
    if (!fasting_window_details) {
      return res.status(200).json({
        message: "Fasting Window Details Fetched Successfully.",
        screen_name: "Fasting Window",
        nutrition_and_lifestyle_id,
        mentor_assigned: true,
        unread_chat_badge: true,
        data: {},
      });
    }

    // Remove null values from fasting window details object
    const filteredFastingWindowDetailsData = filterObjectRemoveNullValues(
      fastingWindowDetails[0]
    );

    // Parse fasting window details
    const parsedFastingWindowDetails = JSON.parse(
      filteredFastingWindowDetailsData.fasting_window_details
    );

    // Return the successfully fetched and parsed fasting window details
    return res.status(200).json({
      message: "Fasting Window Details Fetched Successfully.",
      screen_name: "Fasting Window",
      nutrition_and_lifestyle_id,
      mentor_assigned: true,
      unread_chat_badge: true,
      data: parsedFastingWindowDetails,
    });
  } catch (error) {
    console.error(
      "Error occurred while fetching fasting window details:",
      error
    );
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//POST API FOR ASSESSMENT

//API for Submitting Personal Details
export const submitPersonalDetails = async (req, res) => {
  try {
    const { user_id, assessment_id, personal_detail_id, ...personalData } =
      req.body;
    console.log(req.body);
    // Required field validation
    if (!user_id || !assessment_id) {
      return res.status(400).json({
        status: false,
        message: "user_id and assessment_id are required",
      });
    }

    // Base personal details object
    const personalDetailsData = {};

    // Conditionally add fields if provided
    if (personalData.name) personalDetailsData.name = personalData.name;
    if (personalData.phone_number)
      personalDetailsData.phone_number = personalData.phone_number;
    if (personalData.address)
      personalDetailsData.address = personalData.address;
    if (personalData.country_of_residence)
      personalDetailsData.country_of_residence =
        personalData.country_of_residence;
    if (personalData.state) personalDetailsData.state = personalData.state;
    if (personalData.city) personalDetailsData.city = personalData.city;
    if (personalData.country_of_origin)
      personalDetailsData.country_of_origin = personalData.country_of_origin;
    if (personalData.gender) personalDetailsData.gender = personalData.gender;
    if (personalData.date_of_birth)
      personalDetailsData.date_of_birth = personalData.date_of_birth;
    if (personalData.weight) personalDetailsData.weight = personalData.weight;
    if (personalData.height) personalDetailsData.height = personalData.height;
    if (personalData.goal_weight)
      personalDetailsData.goal_weight = personalData.goal_weight;
    if (personalData.other_goals)
      personalDetailsData.other_goals = personalData.other_goals;
    if (personalData.ethinicity)
      personalDetailsData.ethinicity = personalData.ethinicity;
    if (personalData.marital_status)
      personalDetailsData.marital_status = personalData.marital_status;

    if (personalData.is_pregnant !== undefined) {
      const val = personalData.is_pregnant;
      personalDetailsData.is_pregnant =
        val === "Yes" || val === 1 || val === "1"
          ? 1
          : val === "No" || val === 0 || val === "0"
          ? 0
          : null;
    }
    if (personalData.pregnancy_due_date)
      personalDetailsData.pregnancy_due_date = personalData.pregnancy_due_date;
    if (personalData.menstrual_periods)
      personalDetailsData.menstrual_periods = personalData.menstrual_periods;
    if (personalData.is_pms !== undefined) {
      const val = personalData.is_pms;
      personalDetailsData.is_pms =
        val === "Yes" || val === 1 || val === "1"
          ? 1
          : val === "No" || val === 0 || val === "0"
          ? 0
          : null;
    }
    if (personalData.last_menstrual_period)
      personalDetailsData.last_menstrual_period =
        personalData.last_menstrual_period;
    if (personalData.anniversary_date)
      personalDetailsData.anniversary_date = personalData.anniversary_date;
    if (personalData.family_type)
      personalDetailsData.family_type = personalData.family_type;

    if (personalData.has_children !== undefined) {
      const val = personalData.has_children;
      personalDetailsData.has_children =
        val === "Yes" || val === 1 || val === "1"
          ? 1
          : val === "No" || val === 0 || val === "0"
          ? 0
          : null;
    }
    if (personalData.number_of_children)
      personalDetailsData.number_of_children = parseInt(
        personalData.number_of_children
      );
    if (personalData.child_details)
      personalDetailsData.child_details = personalData.child_details;

    if (personalData.is_breast_feed !== undefined) {
      const val = personalData.is_breast_feed;
      personalDetailsData.is_breast_feed =
        val === "Yes" || val === 1 || val === "1"
          ? 1
          : val === "No" || val === 0 || val === "0"
          ? 0
          : null;
    }

    if (personalData.is_exclusive_breast_feed !== undefined) {
      const val = personalData.is_exclusive_breast_feed;
      personalDetailsData.is_exclusive_breast_feed =
        val === "Yes" || val === 1 || val === "1"
          ? 1
          : val === "No" || val === 0 || val === "0"
          ? 0
          : null;
    }
    if (personalData.breast_feed_frequency)
      personalDetailsData.breast_feed_frequency =
        personalData.breast_feed_frequency;
    if (personalData.foods_to_enhance_breast_milk)
      personalDetailsData.foods_to_enhance_breast_milk =
        personalData.foods_to_enhance_breast_milk;

    if (personalData.tried_diets_in_past !== undefined) {
      const val = personalData.tried_diets_in_past;
      personalDetailsData.tried_diets_in_past =
        val === "Yes" || val === 1 || val === "1"
          ? 1
          : val === "No" || val === 0 || val === "0"
          ? 0
          : null;
    }
    if (personalData.what_did_not_worked)
      personalDetailsData.what_did_not_worked =
        personalData.what_did_not_worked;
    if (personalData.dietery_challenge)
      personalDetailsData.dietery_challenge = personalData.dietery_challenge;
    if (personalData.stress_feel)
      personalDetailsData.stress_feel = personalData.stress_feel;
    if (personalData.other_goals) {
      let other_goals = safeJSONParse(personalData.other_goals, {});
      let new_goals = [];

      if (typeof other_goals === "object" && other_goals !== null) {
        for (const [key, value] of Object.entries(other_goals)) {
          new_goals.push(value);
        }
      }

      const { results: goals } = await readRecord({
        selectFields: ["*"],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.bnMyGoalsNew} mg`,
            on: "cd.active_order_id = mg.sub_order_id",
          },
        ],
        conditions: [
          { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
        ],
      });
      if (goals[0] && goals[0].id) {
        let goal = goals[0];
        let goalData = {};

        try {
          goalData = JSON.parse(goal.comment);
        } catch (e) {
          console.error("Error parsing goal.comment:", e);
          goalData = { new_goals: [] };
        }

        goalData.new_goals.push(...new_goals);

        // Update the goal data in the database
        const updateResult = await updateRecord(
          tables.bnMyGoalsNew,
          { comment: JSON.stringify(goalData) },
          { id: goal.id }
        );
      } else {
        const goalData = {
          new_goals: new_goals,
          goals_achieved: [],
          milestone_achieved: [],
        };

        const insertResult = await insertRecord(
          tables.bnMyGoalsNew,
          ["sub_order_id", "user_id", "comment"],
          [goals[0].active_order_id, user_id, JSON.stringify(goalData)]
        );

        console.log("Insert result:", insertResult);
      }
    }
    if (personalData.address2) {
      personalDetailsData.address2 = personalData.address2;
    }
    if (personalData.pincode) {
      personalDetailsData.pincode = personalData.pincode;
    }
    if (personalData.body_type) {
      personalDetailsData.body_type = personalData.body_type;
    }
    const hasPersonalDetailId =
      personal_detail_id && parseInt(personal_detail_id) > 0;
    let personalDetailsId = personal_detail_id;

    if (Object.keys(personalDetailsData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No personal details provided to update or insert",
      });
    }

    if (hasPersonalDetailId) {
      // Update existing record
      const updateResult = await updateRecord(
        tables.assessment_personal_details,
        filterObjectRemoveNullValues(personalDetailsData),
        { personal_details_id: parseInt(personalDetailsId) }
      );

      if (!updateResult.affectedRows) {
        return res.status(404).json({
          status: false,
          message: "Personal details record not found",
        });
      }
    } else {
      // Insert new record
      personalDetailsData.assessment_id = parseInt(assessment_id);
      personalDetailsData.user_id = user_id;
      personalDetailsData.added_date = getCurrentDateTime();
      personalDetailsData.added_by = user_id;

      const insertResult = await insertRecord(
        tables.assessment_personal_details,
        Object.keys(personalDetailsData),
        Object.values(personalDetailsData)
      );

      personalDetailsId = insertResult.insertId;
      if (!personalDetailsId) {
        throw new Error("Failed to insert personal details");
      }
    }

    // Update assessment status
    const assessmentData = { personal_details: "2" };
    const updateResult = await updateRecord(
      tables.assessment,
      filterObjectRemoveNullValues(assessmentData),
      { assessment_id: parseInt(assessment_id) }
    );

    if (!updateResult.affectedRows) {
      throw new Error("Failed to update assessment status");
    }

    if (
      personalData.country_of_residence ||
      personalData.state ||
      personalData.city ||
      personalData.date_of_birth
    ) {
      const userDetailsData = {};
      if (personalData.country_of_residence)
        userDetailsData.country_id = personalData.country_of_residence;
      if (personalData.state) userDetailsData.state_id = personalData.state;
      if (personalData.city) userDetailsData.city_id = personalData.city;
      if (personalData.date_of_birth)
        userDetailsData.birth_date = personalData.date_of_birth;
      await updateRecord(
        tables.userDetails,
        filterObjectRemoveNullValues(userDetailsData),
        { user_id: parseInt(user_id) }
      );
    }

    return res.status(hasPersonalDetailId ? 200 : 201).json({
      status: true,
      message: "Personal Details Submitted Successfully",
      next_screen: "assessment_nutrition_lifestyle",
      data: { personal_details_id: personalDetailsId },
    });
  } catch (error) {
    console.error("Error in submitPersonalDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
export const editPersonalDetails = async (req, res) => {
  try {
    const { user_id, assessment_id, personal_detail_id, ...personalData } =
      req.body;
    console.log(req.body);

    // Required field validation
    if (!user_id || !assessment_id || !personal_detail_id) {
      return res.status(400).json({
        status: false,
        message: "user_id, assessment_id, and personal_detail_id are required",
      });
    }

    // Validate personal_detail_id
    if (parseInt(personal_detail_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid personal_detail_id",
      });
    }

    // Base personal details object
    const personalDetailsData = {};

    // Conditionally add fields if provided
    if (personalData.name) personalDetailsData.name = personalData.name;
    if (personalData.phone_number)
      personalDetailsData.phone_number = personalData.phone_number;
    if (personalData.address)
      personalDetailsData.address = personalData.address;
    if (personalData.country_of_residence)
      personalDetailsData.country_of_residence =
        personalData.country_of_residence;
    if (personalData.state) personalDetailsData.state = personalData.state;
    if (personalData.city) personalDetailsData.city = personalData.city;
    if (personalData.country_of_origin)
      personalDetailsData.country_of_origin = personalData.country_of_origin;
    if (personalData.gender) personalDetailsData.gender = personalData.gender;
    if (personalData.date_of_birth)
      personalDetailsData.date_of_birth = personalData.date_of_birth;
    if (personalData.weight) personalDetailsData.weight = personalData.weight;
    if (personalData.height) personalDetailsData.height = personalData.height;
    if (personalData.goal_weight)
      personalDetailsData.goal_weight = personalData.goal_weight;
    if (personalData.other_goals)
      personalDetailsData.other_goals = personalData.other_goals;
    if (personalData.ethinicity)
      personalDetailsData.ethinicity = personalData.ethinicity;
    if (personalData.other_ethinicity)
      personalDetailsData.other_ethinicity = personalData.other_ethinicity; // Note: Typo, should be ethnicity
    if (personalData.marital_status)
      personalDetailsData.marital_status = personalData.marital_status;
    if (personalData.is_pregnant !== undefined)
      personalDetailsData.is_pregnant = personalData.is_pregnant;
    if (personalData.pregnancy_due_date)
      personalDetailsData.pregnancy_due_date = personalData.pregnancy_due_date;
    if (personalData.menstrual_periods)
      personalDetailsData.menstrual_periods = personalData.menstrual_periods;
    if (personalData.is_pms !== undefined)
      personalDetailsData.is_pms = personalData.is_pms;
    if (personalData.last_menstrual_period)
      personalDetailsData.last_menstrual_period =
        personalData.last_menstrual_period;
    if (personalData.anniversary_date)
      personalDetailsData.anniversary_date = personalData.anniversary_date;
    if (personalData.family_type)
      personalDetailsData.family_type = personalData.family_type;
    if (personalData.has_children !== undefined)
      personalDetailsData.has_children = personalData.has_children;
    if (personalData.number_of_children)
      personalDetailsData.number_of_children = parseInt(
        personalData.number_of_children
      );
    if (personalData.child_details)
      personalDetailsData.child_details = personalData.child_details;
    if (personalData.is_breast_feed !== undefined)
      personalDetailsData.is_breast_feed = personalData.is_breast_feed;
    if (personalData.is_exclusive_breast_feed !== undefined)
      personalDetailsData.is_exclusive_breast_feed =
        personalData.is_exclusive_breast_feed;
    if (personalData.breast_feed_frequency)
      personalDetailsData.breast_feed_frequency =
        personalData.breast_feed_frequency;
    if (personalData.foods_to_enhance_breast_milk)
      personalDetailsData.foods_to_enhance_breast_milk =
        personalData.foods_to_enhance_breast_milk;
    if (personalData.tried_diets_in_past)
      personalDetailsData.tried_diets_in_past =
        personalData.tried_diets_in_past;
    if (personalData.what_did_not_worked)
      personalDetailsData.what_did_not_worked =
        personalData.what_did_not_worked; // Note: Typo, should be what_did_not_work
    if (personalData.dietery_challenge)
      personalDetailsData.dietery_challenge = personalData.dietery_challenge; // Note: Typo, should be dietary_challenge
    if (personalData.stress_feel)
      personalDetailsData.stress_feel = personalData.stress_feel;

    // Handle other_goals separately
    if (personalData.other_goals) {
      let other_goals = safeJSONParse(personalData.other_goals, {});
      let new_goals = [];

      if (typeof other_goals === "object" && other_goals !== null) {
        for (const [key, value] of Object.entries(other_goals)) {
          new_goals.push(value);
        }
      }

      const { results: goals } = await readRecord({
        selectFields: ["*"],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.bnMyGoalsNew} mg`,
            on: "cd.active_order_id = mg.sub_order_id",
          },
        ],
        conditions: [
          { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
        ],
      });

      if (goals[0] && goals[0].id) {
        let goal = goals[0];
        let goalData = {};

        try {
          goalData = JSON.parse(goal.comment);
        } catch (e) {
          console.error("Error parsing goal.comment:", e);
          goalData = { new_goals: [] };
        }

        // Replace or append new_goals based on your requirement
        goalData.new_goals = [...new_goals]; // Replace existing goals

        // Update the goal data in the database
        const updateResult = await updateRecord(
          tables.bnMyGoalsNew,
          { comment: JSON.stringify(goalData) },
          { id: goal.id }
        );
      } else {
        const goalData = {
          new_goals: new_goals,
          goals_achieved: [],
          milestone_achieved: [],
        };

        const insertResult = await insertRecord(
          tables.bnMyGoalsNew,
          ["sub_order_id", "user_id", "comment"],
          [goals[0].active_order_id, user_id, JSON.stringify(goalData)]
        );

        console.log("Insert result:", insertResult);
      }
    }

    // Check if there are fields to update
    if (Object.keys(personalDetailsData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No personal details provided to update",
      });
    }

    // Update existing record
    const updateResult = await updateRecord(
      tables.assessment_personal_details,
      filterObjectRemoveNullValues(personalDetailsData),
      { personal_details_id: parseInt(personal_detail_id) }
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Personal details record not found",
      });
    }

    // Optionally update assessment status
    const assessmentData = { personal_details: "2" };
    const assessmentUpdateResult = await updateRecord(
      tables.assessment,
      filterObjectRemoveNullValues(assessmentData),
      { assessment_id: parseInt(assessment_id) }
    );

    if (!assessmentUpdateResult.affectedRows) {
      throw new Error("Failed to update assessment status");
    }
    if (
      personalData.country_of_residence ||
      personalData.state ||
      personalData.city ||
      personalData.date_of_birth
    ) {
      const updateUserData = {};
      if (personalData.country_of_residence)
        updateUserData.country_id = personalData.country_of_residence;
      if (personalData.state) updateUserData.state_id = personalData.state;
      if (personalData.city) updateUserData.city_id = personalData.city;
      if (personalData.date_of_birth)
        updateUserData.birth_date = personalData.date_of_birth;
      if (Object.keys(updateUserData).length > 0) {
        await updateRecord(tables.userDetails, updateUserData, {
          user_id: parseInt(user_id),
        });
      }
    }
    return res.status(200).json({
      status: true,
      message: "Personal Details Updated Successfully",
      next_screen: "assessment_nutrition_lifestyle",
      data: { personal_details_id: parseInt(personal_detail_id) },
    });
  } catch (error) {
    console.error("Error in editPersonalDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for Submitting Nutrition and Lifestyle Details
export const submitNutritionAndLifestyleDetails = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  const nutrition_lifestyle_detail_id = newData.nutrition_and_lifestyle_id;

  try {
    if (
      nutrition_lifestyle_detail_id != "" &&
      nutrition_lifestyle_detail_id != undefined &&
      nutrition_lifestyle_detail_id != null &&
      nutrition_lifestyle_detail_id != 0
    ) {
      const nutritionLifestyleData = {
        work_status: newData.work_status,
        work_shift_type: newData.work_shift_type,
        profession: newData.profession,
        business_or_company: newData.business_or_company,
        designation: newData.designation,
        is_work_in_shifts: newData.is_work_in_shifts,
        work_start_time: newData.work_start_time,
        work_end_time: newData.work_end_time,
        is_carry_meals: newData.is_carry_meals,
        meals_to_office: newData.meals_to_office,
        is_restaurant_available: newData.is_restaurant_available,
        is_frequent_traveller: newData.is_frequent_traveller,
        travel_frequency: newData.travel_frequency,
        travel_place_type: newData.travel_place_type,
        activity_level: newData.activity_level,
        eating_habit: newData.eating_habit,
        jain_food_restrictions: newData.jain_food_restrictions,
        daily_vegetable_consumption: newData.daily_vegetable_consumption,
        avoided_jain_foods: newData.avoided_jain_foods,
        daily_fruits_consumption: newData.daily_fruits_consumption,
        per_day_water_intake: newData.per_day_water_intake,
        smoke_frequency: newData.smoke_frequency,
        alcohol_consumption: newData.alcohol_consumption,
        junk_food_you_order: newData.junk_food_you_order,
        junk_food_you_consume: newData.junk_food_you_consume,
        is_fasting: newData.is_fasting,
        frequency_of_fasting: newData.frequency_of_fasting,
        foods_for_fasting: newData.foods_for_fasting,
        sleep_duration: newData.sleep_duration,
        sleep_time: newData.sleep_time,
        wakeup_time: newData.wakeup_time,
        preferred_cuisine: newData.preferred_cuisine,
        food_preference: newData.food_preference,
        food_aversions: newData.food_aversions,
        food_allergies: newData.food_allergies,
        supplements_taken: newData.supplements_taken,
        who_cooks: newData.who_cooks,
        home_appliances_access: newData.home_appliances_access,
        frequency_of_restaurant_visit: newData.frequency_of_restaurant_visit,
        restaurant_to_order: newData.restaurant_to_order,
        added_by: user_id,
      };
      if (newData.jain_food_restrictions !== undefined) {
        const val = newData.jain_food_restrictions;
        nutritionLifestyleData.jain_food_restrictions =
          val === "Yes" || val === 1 || val === "1"
            ? 1
            : val === "No" || val === 0 || val === "0"
            ? 0
            : null;
      }

      if (newData.frequency_of_fasting !== undefined) {
        const val = newData.frequency_of_fasting;
        nutritionLifestyleData.is_fasting = val === "Never" ? 0 : 1;
      }
      const condition = {
        nutrition_and_lifestyle_id: parseInt(nutrition_lifestyle_detail_id),
      };
      // Perform the database update
      const updateResult = await updateRecord(
        `${tables.assessment_nutrition_and_lifestyle}`,
        filterObjectRemoveNullValues(nutritionLifestyleData),
        condition
      );
      const nutritionLifestyleDetails_id = updateResult;
      if (nutritionLifestyleDetails_id) {
        const assessmentData = { nutrition_lifestyle: "2" };
        const updateCondition = { assessment_id: parseInt(assessment_id) };
        const updateResult = await updateRecord(
          `${tables.assessment}`,
          filterObjectRemoveNullValues(assessmentData),
          updateCondition
        );
        if (updateResult) {
          return res.status(201).json({
            status: true,
            message: "Nutrition and Lifestyle Details Updated Successfully.",
            next_screen: "assessment_workout_details",
          });
        } else {
          return res.status(404).json({
            status: false,
            message: "Error in updating Nutrition and Lifestyle Details.",
          });
        }
      }
    } else {
      //If nutrition_lifestyle_detail_id is not there then insert record
      const columns = [
        "assessment_id",
        "user_id",
        "work_status",
        "work_shift_type",
        "profession",
        "business_or_company",
        "designation",
        "is_work_in_shifts",
        "work_start_time",
        "work_end_time",
        "is_carry_meals",
        "meals_to_office",
        "is_restaurant_available",
        "is_frequent_traveller",
        "travel_frequency",
        "travel_place_type",
        "activity_level",
        "eating_habit",
        "jain_food_restrictions",
        "daily_vegetable_consumption",
        "avoided_jain_foods",
        "daily_fruits_consumption",
        "per_day_water_intake",
        "smoke_frequency",
        "alcohol_consumption",
        "junk_food_you_order",
        "junk_food_you_consume",
        "is_fasting",
        "frequency_of_fasting",
        "foods_for_fasting",
        "sleep_duration",
        "sleep_time",
        "wakeup_time",
        "preferred_cuisine",
        "food_preference",
        "food_aversions",
        "food_allergies",
        "supplements_taken",
        "who_cooks",
        "home_appliances_access",
        "frequency_of_restaurant_visit",
        "restaurant_to_order",
        "added_date",
        "added_by",
      ];
      const currentDate = getCurrentDateTime();
      const values = [
        assessment_id,
        user_id,
        newData.work_status,
        newData.work_shift_type,
        newData.profession,
        newData.business_or_company,
        newData.designation,
        newData.is_work_in_shifts,
        newData.work_start_time,
        newData.work_end_time,
        newData.is_carry_meals,
        newData.meals_to_office,
        newData.is_restaurant_available,
        newData.is_frequent_traveller,
        newData.travel_frequency,
        newData.travel_place_type,
        newData.activity_level,
        newData.eating_habit,
        newData.jain_food_restrictions,
        newData.daily_vegetable_consumption,
        newData.avoided_jain_foods,
        newData.daily_fruits_consumption,
        newData.per_day_water_intake,
        newData.smoke_frequency,
        newData.alcohol_consumption,
        newData.junk_food_you_order,
        newData.junk_food_you_consume,
        newData.is_fasting,
        newData.frequency_of_fasting,
        newData.foods_for_fasting,
        newData.sleep_duration,
        newData.sleep_time,
        newData.wakeup_time,
        newData.preferred_cuisine,
        newData.food_preference,
        newData.food_aversions,
        newData.food_allergies,
        newData.supplements_taken,
        newData.who_cooks,
        newData.home_appliances_access,
        newData.frequency_of_restaurant_visit,
        newData.restaurant_to_order,
        currentDate,
        user_id,
      ];
      const insertResult = await insertRecord(
        `${tables.assessment_nutrition_and_lifestyle}`,
        columns,
        values
      );
      const nutritionLifestyleDetails_id = insertResult.insertId;
      if (nutritionLifestyleDetails_id) {
        const assessmentData = { nutrition_lifestyle: "2" };
        const updateCondition = { assessment_id: parseInt(assessment_id) };
        const updateResult = await updateRecord(
          `${tables.assessment}`,
          filterObjectRemoveNullValues(assessmentData),
          updateCondition
        );
        if (updateResult) {
          return res.status(201).json({
            status: true,
            message: "Nutrition and Lifestyle Details Updated Successfully.",
            next_screen: "assessment_workout_details",
          });
        } else {
          return res.status(404).json({
            status: false,
            message: "Error while adding nutrition and lifestyle details.",
          });
        }
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const editNutritionAndLifestyleDetails = async (req, res) => {
  try {
    const newData = req.body;
    const user_id = newData.user_id;
    const assessment_id = newData.assessment_id;
    const nutrition_lifestyle_detail_id = newData.nutrition_and_lifestyle_id;

    // Required field validation
    if (!user_id || !assessment_id || !nutrition_lifestyle_detail_id) {
      return res.status(400).json({
        status: false,
        message:
          "user_id, assessment_id, and nutrition_and_lifestyle_id are required",
      });
    }

    // Validate nutrition_and_lifestyle_id
    if (parseInt(nutrition_lifestyle_detail_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid nutrition_and_lifestyle_id",
      });
    }

    // Build nutrition and lifestyle data object
    const nutritionLifestyleData = {
      work_status: newData.work_status,
      work_shift_type: newData.work_shift_type,
      profession: newData.profession,
      business_or_company: newData.business_or_company,
      designation: newData.designation,
      is_work_in_shifts: newData.is_work_in_shifts,
      work_start_time: newData.work_start_time,
      work_end_time: newData.work_end_time,
      is_carry_meals: newData.is_carry_meals,
      meals_to_office: newData.meals_to_office,
      is_restaurant_available: newData.is_restaurant_available,
      is_frequent_traveller: newData.is_frequent_traveller,
      travel_frequency: newData.travel_frequency,
      travel_place_type: newData.travel_place_type,
      activity_level: newData.activity_level,
      eating_habit: newData.eating_habit,
      jain_food_restrictions: newData.jain_food_restrictions,
      daily_vegetable_consumption: newData.daily_vegetable_consumption,
      avoided_jain_foods: newData.avoided_jain_foods,
      daily_fruits_consumption: newData.daily_fruits_consumption,
      per_day_water_intake: newData.per_day_water_intake,
      smoke_frequency: newData.smoke_frequency,
      alcohol_consumption: newData.alcohol_consumption,
      junk_food_you_order: newData.junk_food_you_order,
      junk_food_you_consume: newData.junk_food_you_consume,
      is_fasting: newData.is_fasting,
      frequency_of_fasting: newData.frequency_of_fasting,
      foods_for_fasting: newData.foods_for_fasting,
      sleep_duration: newData.sleep_duration,
      sleep_time: newData.sleep_time,
      wakeup_time: newData.wakeup_time,
      preferred_cuisine: newData.preferred_cuisine,
      food_preference: newData.food_preference,
      food_aversions: newData.food_aversions,
      food_allergies: newData.food_allergies,
      supplements_taken: newData.supplements_taken,
      who_cooks: newData.who_cooks,
      home_appliances_access: newData.home_appliances_access,
      frequency_of_restaurant_visit: newData.frequency_of_restaurant_visit,
      restaurant_to_order: newData.restaurant_to_order,
      added_by: user_id,
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(nutritionLifestyleData))
        .length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No nutrition and lifestyle details provided to update",
      });
    }

    // Perform the database update
    const condition = {
      nutrition_and_lifestyle_id: parseInt(nutrition_lifestyle_detail_id),
    };
    const updateResult = await updateRecord(
      `${tables.assessment_nutrition_and_lifestyle}`,
      filterObjectRemoveNullValues(nutritionLifestyleData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Nutrition and lifestyle record not found",
      });
    }

    // Update assessment status
    const assessmentData = { nutrition_lifestyle: "2" };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      `${tables.assessment}`,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      throw new Error("Failed to update assessment status");
    }

    return res.status(200).json({
      status: true,
      message: "Nutrition and Lifestyle Details Updated Successfully.",
      next_screen: "assessment_workout_details",
      data: {
        nutrition_and_lifestyle_id: parseInt(nutrition_lifestyle_detail_id),
      },
    });
  } catch (error) {
    console.error("Error in editNutritionAndLifestyleDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for Submitting Workout Details
export const submitWorkoutDetails = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const assessment_id = newData.assessment_id;
  const workout_details_id = newData.workout_details_id;

  try {
    if (
      workout_details_id != "" &&
      workout_details_id != undefined &&
      workout_details_id != null
    ) {
      const workoutDetailsData = {
        is_workout: newData.is_workout,
        workout_place: newData.workout_place,
        cardio_workout: newData.cardio_workout,
        weight_training_workout: newData.weight_training_workout,
        other_workout: newData.other_workout,
      };
      const condition = { workout_details_id: parseInt(workout_details_id) };
      // Perform the database update
      const updateResult = await updateRecord(
        `${tables.assessment_workout_details}`,
        filterObjectRemoveNullValues(workoutDetailsData),
        condition
      );
      const workoutDetails_id = updateResult;
      if (workoutDetails_id) {
        const assessmentData = { workout_details: "2" };
        const updateCondition = { assessment_id: parseInt(assessment_id) };
        const updateResult = await updateRecord(
          `${tables.assessment}`,
          filterObjectRemoveNullValues(assessmentData),
          updateCondition
        );
        if (updateResult) {
          return res.status(201).json({
            status: true,
            message: "Workout Details Updated Successfully.",
            next_screen: "assessment_food_diet_recall",
          });
        } else {
          return res.status(404).json({
            status: false,
            message: "Error while updating Workout details.",
          });
        }
      }
    } else {
      //If nutrition_lifestyle_detail_id is not there then insert record
      const columns = [
        "assessment_id",
        "user_id",
        "is_workout",
        "workout_place",
        "cardio_workout",
        "weight_training_workout",
        "other_workout",
        "added_date",
        "added_by",
      ];
      const currentDate = getCurrentDateTime();
      const values = [
        assessment_id,
        user_id,
        newData.is_workout,
        newData.workout_place,
        newData.cardio_workout,
        newData.weight_training_workout,
        newData.other_workout,
        currentDate,
        user_id,
      ];
      const insertResult = await insertRecord(
        `${tables.assessment_workout_details}`,
        columns,
        values
      );
      const workoutDetails_id = insertResult.insertId;
      if (workoutDetails_id) {
        const assessmentData = { workout_details: "2" };
        const updateCondition = { assessment_id: parseInt(assessment_id) };
        const updateResult = await updateRecord(
          `${tables.assessment}`,
          filterObjectRemoveNullValues(assessmentData),
          updateCondition
        );
        if (updateResult) {
          return res.status(201).json({
            status: true,
            message: "Workout Details Updated Successfully.",
            next_screen: "assessment_food_diet_recall",
          });
        } else {
          return res
            .status(404)
            .json({ message: "Error while adding Workout details." });
        }
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//Edit workout details
export const editWorkoutDetails = async (req, res) => {
  try {
    const newData = req.body;
    const user_id = newData.user_id;
    const assessment_id = newData.assessment_id;
    const workout_details_id = newData.workout_details_id;

    // Required field validation
    if (!user_id || !assessment_id || !workout_details_id) {
      return res.status(400).json({
        status: false,
        message: "user_id, assessment_id, and workout_details_id are required",
      });
    }

    // Validate workout_details_id
    if (parseInt(workout_details_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid workout_details_id",
      });
    }

    // Build workout details data object
    const workoutDetailsData = {
      is_workout: newData.is_workout,
      workout_place: newData.workout_place,
      cardio_workout: newData.cardio_workout,
      weight_training_workout: newData.weight_training_workout,
      other_workout: newData.other_workout,
      added_by: user_id,
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(workoutDetailsData)).length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No workout details provided to update",
      });
    }

    // Perform the database update
    const condition = { workout_details_id: parseInt(workout_details_id) };
    const updateResult = await updateRecord(
      `${tables.assessment_workout_details}`,
      filterObjectRemoveNullValues(workoutDetailsData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Workout details record not found",
      });
    }

    // Update assessment status
    const assessmentData = { workout_details: "2" };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      `${tables.assessment}`,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      throw new Error("Failed to update assessment status");
    }

    return res.status(200).json({
      status: true,
      message: "Workout Details Updated Successfully.",
      next_screen: "assessment_food_diet_recall",
      data: { workout_details_id: parseInt(workout_details_id) },
    });
  } catch (error) {
    console.error("Error in editWorkoutDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
//API for Submitting 24 Hour Diet Recall Details
export const submitDietRecallDetails = async (req, res) => {
  try {
    const newData = req.body;
    const { user_id, assessment_id, diet_recall_detail_id } = newData;

    // Validate required fields
    if (!user_id || !assessment_id) {
      return res.status(400).json({
        status: false,
        message: "user_id and assessment_id are required",
      });
    }

    const hasDietRecallId =
      diet_recall_detail_id != null && diet_recall_detail_id !== "";

    // Prepare diet recall data
    const dietRecallData = {
      assessment_id,
      user_id,
      breakfast_details: newData.breakfast_details,
      mid_morning_details: newData.mid_morning_details,
      lunch_details: newData.lunch_details,
      late_evening_details: newData.late_evening_details,
      dinner_details: newData.dinner_details,
      pre_or_post_workout_meal: newData.pre_or_post_workout_meal,
      pre_workout_details: newData.pre_workout_details,
      post_workout_details: newData.post_workout_details,
      ...(hasDietRecallId
        ? {}
        : { added_date: getCurrentDateTime(), added_by: user_id }),
    };

    let dietRecallDetails_id;

    if (hasDietRecallId) {
      // Update existing record
      const condition = { diet_recall_id: parseInt(diet_recall_detail_id) };
      const updateResult = await updateRecord(
        tables.assessment_24_hour_diet_recall,
        filterObjectRemoveNullValues(dietRecallData),
        condition
      );
      if (updateResult.affectedRows === 0) {
        return res.status(404).json({
          status: false,
          message: "Diet recall record not found or no changes made",
        });
      }
      dietRecallDetails_id = diet_recall_detail_id; // Use existing ID
    } else {
      // Insert new record
      const columns = Object.keys(dietRecallData);
      const values = Object.values(dietRecallData);
      const insertResult = await insertRecord(
        tables.assessment_24_hour_diet_recall,
        columns,
        values
      );
      if (!insertResult.insertId) {
        throw new Error("Failed to insert diet recall details");
      }
      dietRecallDetails_id = insertResult.insertId;
    }

    // Update assessment table
    const assessmentData = { diet_recall: "2" }; // 2 means completed
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      tables.assessment,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );
    if (assessmentUpdateResult.affectedRows === 0) {
      console.warn(
        `No rows updated in assessment table for assessment_id: ${assessment_id}`
      );
      return res.status(404).json({
        status: false,
        message: "Assessment record not found or diet_recall already updated",
      });
    }

    return res.status(hasDietRecallId ? 200 : 201).json({
      status: true,
      message: `Diet Recall Details ${
        hasDietRecallId ? "Updated" : "Added"
      } Successfully`,
      next_screen: "assessment_food_frequency", // Fixed typo
    });
  } catch (error) {
    console.error("Error in submitDietRecallDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//for editing diet recall data

export const editDietRecallDetails = async (req, res) => {
  try {
    const newData = req.body;
    const { user_id, assessment_id, diet_recall_detail_id } = newData;

    // Validate required fields
    if (!user_id || !assessment_id || !diet_recall_detail_id) {
      return res.status(400).json({
        status: false,
        message:
          "user_id, assessment_id, and diet_recall_detail_id are required",
      });
    }

    // Validate diet_recall_detail_id
    if (parseInt(diet_recall_detail_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid diet_recall_detail_id",
      });
    }

    // Prepare diet recall data
    const dietRecallData = {
      breakfast_details: newData.breakfast_details,
      mid_morning_details: newData.mid_morning_details,
      lunch_details: newData.lunch_details,
      late_evening_details: newData.late_evening_details,
      dinner_details: newData.dinner_details,
      pre_or_post_workout_meal: newData.pre_or_post_workout_meal,
      pre_workout_details: newData.pre_workout_details,
      post_workout_details: newData.post_workout_details,
      added_by: user_id,
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(dietRecallData)).length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No diet recall details provided to update",
      });
    }

    // Update existing record
    const condition = { diet_recall_id: parseInt(diet_recall_detail_id) };
    const updateResult = await updateRecord(
      tables.assessment_24_hour_diet_recall,
      filterObjectRemoveNullValues(dietRecallData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Diet recall record not found or no changes made",
      });
    }

    // Update assessment table
    const assessmentData = { diet_recall: "2" };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      tables.assessment,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      console.warn(
        `No rows updated in assessment table for assessment_id: ${assessment_id}`
      );
      return res.status(404).json({
        status: false,
        message: "Assessment record not found or diet_recall already updated",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Diet Recall Details Updated Successfully",
      next_screen: "assessment_food_frequency",
      data: { diet_recall_detail_id: parseInt(diet_recall_detail_id) },
    });
  } catch (error) {
    console.error("Error in editDietRecallDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
//API for Submitting Food Frequency Details
export const submitFoodFrequencyDetails = async (req, res) => {
  //Food Frequency is stored in a column of Nutrition and Lifestyle details table.
  const newData = req.body;
  const assessment_id = newData.assessment_id;
  const nutrition_lifestyle_detail_id = newData.nutrition_lifestyle_detail_id;
  try {
    const foodFrequencyData = {
      food_frequency: JSON.stringify(newData.food_frequency),
    };
    const condition = {
      nutrition_and_lifestyle_id: parseInt(nutrition_lifestyle_detail_id),
    };
    // Perform the database update
    const updateResult = await updateRecord(
      `${tables.assessment_nutrition_and_lifestyle}`,
      filterObjectRemoveNullValues(foodFrequencyData),
      condition
    );
    const foodFrequencyDetails_id = updateResult;
    if (foodFrequencyDetails_id) {
      const assessmentData = { food_frequency: "2" };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      const updateResult = await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );
      if (updateResult) {
        return res.status(201).json({
          status: true,
          message: "Food Frequency Details Updated Successfully.",
          next_screen: "assessment_upload_photo",
        });
      } else {
        return res.status(404).json({
          status: false,
          message: "Error while updating Food Frequency details.",
        });
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

//editing food frequency details
export const editFoodFrequencyDetails = async (req, res) => {
  try {
    const newData = req.body;
    const {
      user_id,
      assessment_id,
      nutrition_and_lifestyle_id,
      foodFrequencyData,
    } = newData;

    // Validate required fields
    if (!user_id || !assessment_id || !nutrition_and_lifestyle_id) {
      return res.status(400).json({
        status: false,
        message:
          "user_id, assessment_id, and food_frequency_detail_id are required",
      });
    }

    console.log(newData, 2743);

    // Validate food_frequency_detail_id
    if (parseInt(nutrition_and_lifestyle_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid food_frequency_detail_id",
      });
    }

    // Update existing record
    const condition = {
      nutrition_and_lifestyle_id: parseInt(nutrition_and_lifestyle_id),
    };
    const foodFrequency = { food_frequency: foodFrequencyData };

    const updateResult = await updateRecord(
      tables.assessment_nutrition_and_lifestyle,
      foodFrequency,
      condition
    );

    console.log(updateResult, 2774);

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Food frequency record not found or no changes made",
      });
    }

    // Update assessment table
    const assessmentData = { food_frequency: "2" };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      tables.assessment,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      console.warn(
        `No rows updated in assessment table for assessment_id: ${assessment_id}`
      );
      return res.status(404).json({
        status: false,
        message:
          "Assessment record not found or food_frequency already updated",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Food Frequency Details Updated Successfully",
      next_screen: "assessment_summary", // Hypothetical next screen
      data: {
        nutrition_and_lifestyle_id: parseInt(nutrition_and_lifestyle_id),
      },
    });
  } catch (error) {
    console.error("Error in editFoodFrequencyDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for submitting Assessment Photo
export const submitAssessmentPhoto = async (req, res) => {
  const newData = req.body;
  const assessment_id = newData.assessment_id;
  const personal_detail_id = newData.personal_detail_id;
  const files = req.files;

  try {
    if (files.length === 0) {
      return res.status(400).json({
        message: " Please upload the image",
      });
    }

    const folderName = cloudinaryFolders.recipes;
    // console.log(files);
    // return false;
    const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);
    // const assessmentPhotoUrl = imageLink[0].url;

    const assessmentPhotoData = {
      assessment_photo: JSON.stringify(imageLink[0]),
    };
    const condition = { personal_details_id: parseInt(personal_detail_id) };
    // return;
    const updateResult = await updateRecord(
      `${tables.assessment_personal_details}`,
      filterObjectRemoveNullValues(assessmentPhotoData),
      condition
    );
    const assessmentPhotoDetails_id = updateResult;
    if (assessmentPhotoDetails_id) {
      const assessmentData = { upload_photo: "2" };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      const updateResult = await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );
      if (updateResult) {
        return res.status(201).json({
          status: true,
          message: "Assessment Photo Updated Successfully.",
          next_screen: "assessment_medical_history",
        });
      } else {
        return res.status(404).json({
          status: false,
          message: "Error while updating Assessment Photo.",
        });
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};
export const editAssessmentPhoto = async (req, res) => {
  try {
    const newData = req.body;
    const { assessment_id, personal_detail_id } = newData;
    const files = req.files;

    // Validate required fields
    if (!assessment_id || !personal_detail_id) {
      return res.status(400).json({
        status: false,
        message: "assessment_id and personal_detail_id are required",
      });
    }

    // Validate personal_detail_id
    if (parseInt(personal_detail_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid personal_detail_id",
      });
    }

    // Validate file upload
    if (!files || files.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Please upload an image",
      });
    }

    // Upload image to Cloudinary
    const folderName = cloudinaryFolders.recipes;
    const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);

    // Prepare assessment photo data
    const assessmentPhotoData = {
      assessment_photo: JSON.stringify(imageLink[0]),
    };

    // Update existing record
    const condition = { personal_details_id: parseInt(personal_detail_id) };
    const updateResult = await updateRecord(
      `${tables.assessment_personal_details}`,
      filterObjectRemoveNullValues(assessmentPhotoData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Personal details record not found or no changes made",
      });
    }

    // Update assessment table
    const assessmentData = { upload_photo: "2" };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      `${tables.assessment}`,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Assessment record not found or upload_photo already updated",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Assessment Photo Updated Successfully",
      next_screen: "assessment_medical_history",
      data: { personal_detail_id: parseInt(personal_detail_id) },
    });
  } catch (error) {
    console.error("Error in editAssessmentPhoto:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for submitting Medical History

export const submitMedicalHistoryDetails = async (req, res) => {
  try {
    const newData = req.body;
    const { user_id, assessment_id, medical_history_id } = newData;
    const MEDICAL_HISTORY_STATUS = {
      HAS_ISSUES: 1,
      COMPLETED: 2,
    };

    const NEXT_SCREENS = {
      MEDICATION: "assessment_medication",
      NOTE_TO_KHYATI: "assessment_note_to_khyati",
    };

    // Validate required fields
    const validateMedicalHistoryData = (data) => {
      const requiredFields = ["user_id", "assessment_id", "is_medical_issue"];
      for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null) {
          throw new Error(`${field} is required`);
        }
      }
    };

    const updateAssessmentStatus = async (assessment_id, tables) => {
      const assessmentData = {
        medical_history: MEDICAL_HISTORY_STATUS.COMPLETED,
      };
      const condition = { assessment_id: parseInt(assessment_id) };
      const result = await updateRecord(
        tables.assessment,
        filterObjectRemoveNullValues(assessmentData),
        condition
      );
      if (result.affectedRows === 0) {
        console.warn(
          `No rows updated in assessment table for assessment_id: ${assessment_id}`
        );
      }
      return result;
    };

    validateMedicalHistoryData(newData);

    const hasMedicalHistoryId = !!medical_history_id;

    const medicalHistoryData = {
      assessment_id,
      user_id,
      is_medical_issue: newData.is_medical_issue,
      ...(Number(newData.is_medical_issue) ===
        MEDICAL_HISTORY_STATUS.HAS_ISSUES && {
        acidity: newData.acidity,
        blood_pressure: newData.blood_pressure,
        blood_pressure_readings: newData.blood_pressure_readings,
        cholesterol: newData.cholesterol,
        cholesterol_readings: newData.cholesterol_readings,
        diabetes: newData.diabetes,
        diabetes_readings: newData.diabetes_readings,
        pcos: newData.pcos,
        thyroid: newData.thyroid,
        thyroid_readings: newData.thyroid_readings,
        fatty_liver: newData.fatty_liver,
        other_medical_issue: newData.other_medical_issue,
      }),
      added_by: user_id,
      ...(hasMedicalHistoryId ? {} : { added_date: getCurrentDateTime() }),
    };

    let medicalHistoryDetails_id;

    if (hasMedicalHistoryId) {
      const condition = { medical_history_id: parseInt(medical_history_id) };
      const updateResult = await updateRecord(
        tables.assessment_medical_history,
        filterObjectRemoveNullValues(medicalHistoryData),
        condition
      );
      if (updateResult.affectedRows === 0) {
        throw new Error("Failed to update medical history");
      }
      medicalHistoryDetails_id = medical_history_id;
    } else {
      const columns = Object.keys(medicalHistoryData);
      const values = Object.values(medicalHistoryData);
      const insertResult = await insertRecord(
        tables.assessment_medical_history,
        columns,
        values
      );
      if (!insertResult.insertId) {
        throw new Error("Failed to insert medical history");
      }
      medicalHistoryDetails_id = insertResult.insertId;
    }

    await updateAssessmentStatus(assessment_id, tables);

    const nextScreen =
      Number(newData.is_medical_issue) === 0
        ? NEXT_SCREENS.NOTE_TO_KHYATI
        : NEXT_SCREENS.MEDICATION;

    return res.status(201).json({
      status: true,
      message: "Medical History Updated Successfully",
      next_screen: nextScreen,
    });
  } catch (error) {
    console.error("Error in submitMedicalHistoryDetails:", error);
    const statusCode = error.message.includes("required") ? 400 : 500;
    return res.status(statusCode).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
export const editMedicalHistoryDetails = async (req, res) => {
  try {
    const newData = req.body;
    const { user_id, assessment_id, medical_history_id, is_medical_issue } =
      newData;
    const MEDICAL_HISTORY_STATUS = {
      HAS_ISSUES: 1,
      COMPLETED: 2,
    };

    const NEXT_SCREENS = {
      MEDICATION: "assessment_medication",
      NOTE_TO_KHYATI: "assessment_note_to_khyati",
    };

    // Validate required fields
    const validateMedicalHistoryData = (data) => {
      const requiredFields = [
        "user_id",
        "assessment_id",
        "medical_history_id",
        "is_medical_issue",
      ];
      for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null) {
          throw new Error(`${field} is required`);
        }
      }
    };

    const updateAssessmentStatus = async (assessment_id, tables) => {
      const assessmentData = {
        medical_history: MEDICAL_HISTORY_STATUS.COMPLETED,
      };
      const condition = { assessment_id: parseInt(assessment_id) };
      const result = await updateRecord(
        tables.assessment,
        filterObjectRemoveNullValues(assessmentData),
        condition
      );
      if (result.affectedRows === 0) {
        console.warn(
          `No rows updated in assessment table for assessment_id: ${assessment_id}`
        );
      }
      return result;
    };

    validateMedicalHistoryData(newData);

    // Validate medical_history_id
    if (parseInt(medical_history_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid medical_history_id",
      });
    }

    // Prepare medical history data
    const medicalHistoryData = {
      is_medical_issue: newData.is_medical_issue,
      ...(Number(newData.is_medical_issue) ===
        MEDICAL_HISTORY_STATUS.HAS_ISSUES && {
        acidity: newData.acidity,
        blood_pressure: newData.blood_pressure,
        blood_pressure_readings: newData.blood_pressure_readings,
        cholesterol: newData.cholesterol,
        cholesterol_readings: newData.cholesterol_readings,
        diabetes: newData.diabetes,
        diabetes_readings: newData.diabetes_readings,
        pcos: newData.pcos,
        thyroid: newData.thyroid,
        thyroid_readings: newData.thyroid_readings,
        fatty_liver: newData.fatty_liver,
        other_medical_issue: newData.other_medical_issue,
      }),
      added_by: user_id,
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(medicalHistoryData)).length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No medical history details provided to update",
      });
    }

    // Update existing record
    const condition = { medical_history_id: parseInt(medical_history_id) };
    const updateResult = await updateRecord(
      tables.assessment_medical_history,
      filterObjectRemoveNullValues(medicalHistoryData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Medical history record not found or no changes made",
      });
    }

    // Update assessment status
    await updateAssessmentStatus(assessment_id, tables);

    // Determine next screen
    const nextScreen =
      Number(newData.is_medical_issue) === 0
        ? NEXT_SCREENS.NOTE_TO_KHYATI
        : NEXT_SCREENS.MEDICATION;

    return res.status(200).json({
      status: true,
      message: "Medical History Updated Successfully",
      next_screen: nextScreen,
      data: { medical_history_id: parseInt(medical_history_id) },
    });
  } catch (error) {
    console.error("Error in editMedicalHistoryDetails:", error);
    const statusCode = error.message.includes("required") ? 400 : 500;
    return res.status(statusCode).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
//API for Submitting Medications
export const submitMedicationDetails = async (req, res) => {
  //Medication is stored in a column of Medical History details table.
  const newData = req.body;
  const assessment_id = newData.assessment_id;
  const medical_history_id = newData.medical_history_id;
  try {
    const medicationData = {
      medication_details: newData.medication_details,
    };
    const condition = {
      medical_history_id: parseInt(medical_history_id),
    };
    // Perform the database update
    const updateResult = await updateRecord(
      `${tables.assessment_medical_history}`,
      filterObjectRemoveNullValues(medicationData),
      condition
    );
    const medicationDetails_id = updateResult;
    if (medicationDetails_id) {
      return res.status(201).json({
        status: true,
        message: "Medication Details Updated Successfully.",
        next_screen: "assessment_medical_report",
      });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};
export const editMedicationDetails = async (req, res) => {
  try {
    const newData = req.body;
    const { assessment_id, medical_history_id, medication_details } = newData;

    // Validate required fields
    if (!assessment_id || !medical_history_id || !medication_details) {
      return res.status(400).json({
        status: false,
        message:
          "assessment_id, medical_history_id, and medication_details are required",
      });
    }

    // Validate medical_history_id
    if (parseInt(medical_history_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid medical_history_id",
      });
    }

    // Prepare medication data
    const medicationData = {
      medication_details: medication_details,
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(medicationData)).length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No medication details provided to update",
      });
    }

    // Update existing record
    const condition = { medical_history_id: parseInt(medical_history_id) };
    const updateResult = await updateRecord(
      `${tables.assessment_medical_history}`,
      filterObjectRemoveNullValues(medicationData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Medical history record not found or no changes made",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Medication Details Updated Successfully",
      next_screen: "assessment_medical_report",
      data: { medical_history_id: parseInt(medical_history_id) },
    });
  } catch (error) {
    console.error("Error in editMedicationDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for submitting Medical Reports
export const submitMedicalReports = async (req, res) => {
  const newData = req.body;
  const assessment_id = newData.assessment_id;
  const medical_history_id = newData.medical_history_id;
  const files = req.files;
  const uploadArray = newData.uploadArray;

  try {
    if (uploadArray) {
      const reportData = {
        report_attachment_details: newData.uploadArray,
      };
      const condition = {
        medical_history_id: parseInt(medical_history_id),
      };
      // Perform the database update
      const updateResult = await updateRecord(
        `${tables.assessment_medical_history}`,
        filterObjectRemoveNullValues(reportData),
        condition
      );
      const reportAttachment_id = updateResult;
      if (reportAttachment_id) {
        const assessmentData = { medical_history: "2" };
        const updateCondition = { assessment_id: parseInt(assessment_id) };
        const updateResult = await updateRecord(
          `${tables.assessment}`,
          filterObjectRemoveNullValues(assessmentData),
          updateCondition
        );
        if (updateResult) {
          return res.status(201).json({
            status: true,
            message: "Medical History Updated Successfully.",
            next_screen: "assessment_note_to_khyati",
          });
        } else {
          return res.status(404).json({
            status: false,
            message: "Error in updating Medical History.",
          });
        }
      }
    } else {
      if (files.length === 0) {
        return res.status(400).json({
          status: false,
          message: " Please upload the report",
        });
      } else {
        const folderName = cloudinaryFolders.medicalReports;
        const imageLink = await uploadArrayOfFilesToCloudinary(
          files,
          folderName
        );
        const reportAttachmentUrl = imageLink[0].file.path;
        if (reportAttachmentUrl) {
          return res.status(201).json({
            status: true,
            message: "Report uploaded Successfully.",
            report: reportAttachmentUrl,
          });
        }
      }
    }
  } catch (error) {
    return res.status(404).json({ status: false, message: error.message });
  }
};
export const editMedicalReports = async (req, res) => {
  try {
    const newData = req.body;
    const { assessment_id, medical_history_id, uploadArray } = newData;
    const files = req.files;

    // Validate required fields
    if (!assessment_id || !medical_history_id) {
      return res.status(400).json({
        status: false,
        message: "assessment_id and medical_history_id are required",
      });
    }

    // Validate medical_history_id
    if (parseInt(medical_history_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid medical_history_id",
      });
    }

    // Validate input: either uploadArray or files must be provided
    if (!uploadArray && (!files || files.length === 0)) {
      return res.status(400).json({
        status: false,
        message: "Either uploadArray or files must be provided",
      });
    }

    let reportData = {};
    let reportAttachmentUrl = null;

    if (uploadArray) {
      // Handle uploadArray update
      reportData = {
        report_attachment_details: uploadArray,
      };

      // Update existing record
      const condition = { medical_history_id: parseInt(medical_history_id) };
      const updateResult = await updateRecord(
        `${tables.assessment_medical_history}`,
        filterObjectRemoveNullValues(reportData),
        condition
      );

      if (!updateResult.affectedRows) {
        return res.status(404).json({
          status: false,
          message: "Medical history record not found or no changes made",
        });
      }

      // Update assessment table
      const assessmentData = { medical_history: "2" };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      const assessmentUpdateResult = await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );

      if (!assessmentUpdateResult.affectedRows) {
        return res.status(404).json({
          status: false,
          message:
            "Assessment record not found or medical_history already updated",
        });
      }

      return res.status(200).json({
        status: true,
        message: "Medical History Updated Successfully",
        next_screen: "assessment_note_to_khyati",
        data: { medical_history_id: parseInt(medical_history_id) },
      });
    } else {
      // Handle file upload to Cloudinary
      const folderName = cloudinaryFolders.medicalReports;
      const imageLink = await uploadArrayOfFilesToCloudinary(files, folderName);
      reportAttachmentUrl = imageLink[0].file.path;

      // Prepare report data with Cloudinary URL
      reportData = {
        report_attachment_details: reportAttachmentUrl,
      };

      // Update existing record
      const condition = { medical_history_id: parseInt(medical_history_id) };
      const updateResult = await updateRecord(
        `${tables.assessment_medical_history}`,
        filterObjectRemoveNullValues(reportData),
        condition
      );

      if (!updateResult.affectedRows) {
        return res.status(404).json({
          status: false,
          message: "Medical history record not found or no changes made",
        });
      }

      return res.status(200).json({
        status: true,
        message: "Report Uploaded Successfully",
        report: reportAttachmentUrl,
        data: { medical_history_id: parseInt(medical_history_id) },
      });
    }
  } catch (error) {
    console.error("Error in editMedicalReports:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for submitting Fasting Window
export const submitFastingWindowDetails = async (req, res) => {
  const newData = req.body;
  const assessment_id = newData.assessment_id;
  const nutrition_lifestyle_detail_id = newData.nutrition_lifestyle_detail_id;
  try {
    const fasting_window = newData.fasting_window;
    const fasting_window_end_time = newData.eating_window_start;
    const fasting_window_hours = fasting_window.split(":");
    const fasting_hours = fasting_window_hours[0];
    const eating_hours = parseInt(fasting_window_hours[1]);
    console.log(eating_hours, 3559);
    let fasting_window_start_time = addHoursToTime(
      fasting_window_end_time,
      eating_hours
    );
    const fastingWindowData = {
      fasting_window: fasting_window,
      fasting_start_time: fasting_window_start_time,
      fasting_end_time: fasting_window_end_time,
    };
    const foodFrequencyData = {
      fasting_window_details: JSON.stringify(fastingWindowData),
    };
    const condition = {
      nutrition_and_lifestyle_id: parseInt(nutrition_lifestyle_detail_id),
    };
    // Perform the database update
    const updateResult = await updateRecord(
      `${tables.assessment_nutrition_and_lifestyle}`,
      filterObjectRemoveNullValues(foodFrequencyData),
      condition
    );
    const foodFrequencyDetails_id = updateResult;
    if (foodFrequencyDetails_id) {
      const assessmentData = { fasting_window: "2", completion_status: 2 };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      const updateResult = await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );
      if (updateResult.affectedRows > 0) {
        const { results: userDetails } = await readRecord({
          table: `${tables.userDetails} ud`,
          selectFields: ["ud.first_name", "ud.last_name", "ud.mentor_assigned"],
          conditions: [
            {
              field: "ud.user_id",
              operator: "=",
              value: newData.user_id,
            },
          ],
        });
        const data = {
          title: `${userDetails[0].first_name} ${userDetails[0].last_name} Has Filled Assessment`,
          priority: 1,
          redirect: "/naf-icl",
        };
        const insertedResultNotification = await insertRecord(
          tables.mentorNotifications,
          ["user_id", "admin_id", "content", "redirect"],
          [
            newData.user_id,
            userDetails[0].mentor_assigned,
            data.title,
            "/naf-icl",
          ]
        );
        if (insertedResultNotification.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While Inserting Mentor Notifications", 400)
          );
        }
        sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });
        return res
          .status(201)
          .json({ message: "Fasting Window Details Updated Successfully." });
      } else {
        return res
          .status(404)
          .json({ message: "Error while updating Fasting Window details." });
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const editFastingWindowDetails = async (req, res) => {
  try {
    const newData = req.body;
    const {
      user_id,
      assessment_id,
      nutrition_lifestyle_detail_id,
      fasting_window,
      eating_window_start,
    } = newData;

    // Validate required fields
    if (
      !user_id ||
      !assessment_id ||
      !nutrition_lifestyle_detail_id ||
      !fasting_window ||
      !eating_window_start
    ) {
      return res.status(400).json({
        status: false,
        message:
          "user_id, assessment_id, nutrition_lifestyle_detail_id, fasting_window, and eating_window_start are required",
      });
    }

    // Validate nutrition_lifestyle_detail_id
    if (parseInt(nutrition_lifestyle_detail_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid nutrition_lifestyle_detail_id",
      });
    }

    // Process fasting window data
    const fasting_window_hours = fasting_window.split(":");
    const fasting_hours = fasting_window_hours[0];
    const eating_hours = parseInt(fasting_window_hours[1]);
    const fasting_window_start_time = addHoursToTime(
      eating_window_start,
      eating_hours
    );

    // Prepare fasting window data
    const fastingWindowData = {
      fasting_window,
      fasting_start_time: eating_window_start,
      fasting_end_time: fasting_window_start_time,
    };

    // Prepare data for database update
    const foodFrequencyData = {
      fasting_window_details: JSON.stringify(fastingWindowData),
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(foodFrequencyData)).length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No fasting window details provided to update",
      });
    }

    // Update existing record
    const condition = {
      nutrition_and_lifestyle_id: parseInt(nutrition_lifestyle_detail_id),
    };
    const updateResult = await updateRecord(
      `${tables.assessment_nutrition_and_lifestyle}`,
      filterObjectRemoveNullValues(foodFrequencyData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Nutrition and lifestyle record not found or no changes made",
      });
    }

    // Update assessment table
    const assessmentData = { fasting_window: "2", completion_status: 2 };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      `${tables.assessment}`,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message:
          "Assessment record not found or fasting_window already updated",
      });
    }

    // Fetch user details for notification
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.first_name", "ud.last_name", "ud.mentor_assigned"],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });

    if (!userDetails[0]) {
      return res.status(404).json({
        status: false,
        message: "User details not found",
      });
    }

    // Insert mentor notification
    const data = {
      title: `${userDetails[0].first_name} ${userDetails[0].last_name} Has Updated Fasting Window Details`,
      priority: 1,
      redirect: "/naf-icl",
    };
    const insertedResultNotification = await insertRecord(
      tables.mentorNotifications,
      ["user_id", "admin_id", "content", "redirect"],
      [user_id, userDetails[0].mentor_assigned, data.title, "/naf-icl"]
    );

    if (!insertedResultNotification.affectedRows) {
      return res.status(400).json({
        status: false,
        message: "Error while inserting mentor notifications",
      });
    }

    // Send SSE event
    sendSSEEvent({ mentor_id: userDetails[0].mentor_assigned, data });

    return res.status(200).json({
      status: true,
      message: "Fasting Window Details Updated Successfully",
      data: {
        nutrition_lifestyle_detail_id: parseInt(nutrition_lifestyle_detail_id),
      },
    });
  } catch (error) {
    console.error("Error in editFastingWindowDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//API for submitting Note to mentor and Khyati
export const submitNoteToMentorAndKhyati = async (req, res) => {
  const newData = req.body;
  const assessment_id = newData.assessment_id;
  const personal_details_id = newData.personal_details_id;
  try {
    const noteToMentorAndKhyatiData = {
      note_to_mentor_and_khyati: newData.note_to_mentor_and_khyati,
    };

    const condition = { personal_details_id: parseInt(personal_details_id) };
    // Perform the database update
    const updateResult = await updateRecord(
      `${tables.assessment_personal_details}`,
      filterObjectRemoveNullValues(noteToMentorAndKhyatiData),
      condition
    );
    const noteToMentorAndKhyati_id = updateResult;

    const { results } = await readRecord({
      selectFields: ["ps.ask_imf_window"],
      table: `${tables.assessment} ass`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ass.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
      ],
    });
    const ask_imf_window = Number(results[0].ask_imf_window) === 1;

    if (!ask_imf_window) {
      const assessmentData = { completion_status: "2" };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );
    }
    if (noteToMentorAndKhyati_id) {
      const assessmentData = { note_to_mentor_and_khyati: "2" };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      const updateResult = await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );
      if (updateResult.affectedRows > 0) {
        return res
          .status(201)
          .json({ message: "Note to Mentor and Khyati Updated Successfully." });
      } else {
        return res
          .status(404)
          .json({ message: "Error while updating Note to Mentor and Khyati." });
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};
//Edit note to Mentor in assessment

export const editNoteToMentorAndKhyati = async (req, res) => {
  try {
    const newData = req.body;
    const { assessment_id, personal_details_id, note_to_mentor_and_khyati } =
      newData;

    // Validate required fields
    if (!assessment_id || !personal_details_id || !note_to_mentor_and_khyati) {
      return res.status(400).json({
        status: false,
        message:
          "assessment_id, personal_details_id, and note_to_mentor_and_khyati are required",
      });
    }

    // Validate personal_details_id
    if (parseInt(personal_details_id) <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid personal_details_id",
      });
    }

    // Prepare note data
    const noteToMentorAndKhyatiData = {
      note_to_mentor_and_khyati,
    };

    // Check if there are fields to update
    if (
      Object.keys(filterObjectRemoveNullValues(noteToMentorAndKhyatiData))
        .length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "No note details provided to update",
      });
    }

    // Update existing record
    const condition = { personal_details_id: parseInt(personal_details_id) };
    const updateResult = await updateRecord(
      `${tables.assessment_personal_details}`,
      filterObjectRemoveNullValues(noteToMentorAndKhyatiData),
      condition
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message: "Personal details record not found or no changes made",
      });
    }

    // Check ask_imf_window flag
    const { results } = await readRecord({
      selectFields: ["ps.ask_imf_window"],
      table: `${tables.assessment} ass`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ass.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
      ],
    });

    if (!results[0]) {
      return res.status(404).json({
        status: false,
        message: "Program session details not found",
      });
    }

    const ask_imf_window = Number(results[0].ask_imf_window) === 1;

    // Update assessment table (completion_status if ask_imf_window is false)
    if (!ask_imf_window) {
      const assessmentData = { completion_status: "2" };
      const updateCondition = { assessment_id: parseInt(assessment_id) };
      const completionUpdateResult = await updateRecord(
        `${tables.assessment}`,
        filterObjectRemoveNullValues(assessmentData),
        updateCondition
      );
      if (!completionUpdateResult.affectedRows) {
        return res.status(404).json({
          status: false,
          message:
            "Assessment record not found or completion_status already updated",
        });
      }
    }

    // Update assessment table (note_to_mentor_and_khyati status)
    const assessmentData = { note_to_mentor_and_khyati: "2" };
    const updateCondition = { assessment_id: parseInt(assessment_id) };
    const assessmentUpdateResult = await updateRecord(
      `${tables.assessment}`,
      filterObjectRemoveNullValues(assessmentData),
      updateCondition
    );

    if (!assessmentUpdateResult.affectedRows) {
      return res.status(404).json({
        status: false,
        message:
          "Assessment record not found or note_to_mentor_and_khyati already updated",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Note to Mentor and Khyati Updated Successfully",
      data: { personal_details_id: parseInt(personal_details_id) },
    });
  } catch (error) {
    console.error("Error in editNoteToMentorAndKhyati:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
