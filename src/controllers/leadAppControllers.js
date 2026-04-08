import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../config/query.js";
import {
  tables,
  image_guide_base_url,
  cloudinaryFolders,
  marketingVideoUrls,
} from "../helper/constant.js";
import {
  filterObjectRemoveNullValues,
  addDaysToDate,
  safeJSONParse,
} from "../helper/commonHelper.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { ApiResponse } from "../utils/APiResponse.js";
import {
  addAmountWallet,
  calculateBMI,
  calculateIdealWeight,
  calculateTotalHealthScore,
  insertUserVisitLog,
  processHeight,
} from "../helper/common.js";

import { uploadArrayOfFilesToCloudinary } from "../helper/uploadToCloudinary.js";
import moment from "moment";
import SmartScaleData from "../models/smartScaleModel.js";


const getGoProDetails = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Go Pro Products",
    data: {
      title: "BN Pro Exclusive Features",
      subtitle:
        "Unlock powerful guides designed to make healthy living simple, sustainable, and enjoyable - wherever you are.",
      guides: [
        {
          id: "restaurant-guide",
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1751445591/app_images/f0sswv72tv1gtsinuzvp.png",
          title: "BN Restaurant Guide",
          description: "Make The Healthiest Choices Even While Dining Out",
          value: "₹799",
          icon: "restaurant-guide",
        },
        {
          id: "alcohol-guide",
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1751448970/app_images/niu1maoedzortuswbwka.png",
          title: "BN Alcohol Guide",
          description: "Enjoy Smart Drinking Without Derailing Your Progress.",
          value: "₹499",
          icon: "alcohol-guide",
        },
        {
          id: "recipe-book",
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1751449034/app_images/pwwpcbg863a53cwkuky1.png",
          title: "BN Recipe Book",
          description: "Wholesome, Easy-To-Cook Meals Tailored To Your Goals.",
          value: "₹499",
          icon: "recipe-book",
        },
      ],
      subscriptions: [
        {
          id: "1-month",
          guide_ids: [81, 82, 83],
          display_price: "₹99",
          mrp: 1299,
          paid_amount: 99,
          discount_amount: 1200,
          validity_days: 30,
          discount_type: "other",
          display_duration: "1 Month",
          description: "Kickstart Your Wellness Journey TODAY!",
        },
        {
          id: "3-month",
          guide_ids: [81, 82, 83],
          display_price: "₹199",
          mrp: 1299,
          paid_amount: 199,
          discount_amount: 1100,
          validity_days: 90,
          discount_type: "other",
          display_duration: "3 Months",
          description: "See Real Results And Lasting Change!",
        },
      ],
    },
  });

  return res.status(200).json(apiresponse);
};

const getEkitProDetails = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Ekit Pro Products",
    data: {
      title: "BN Ekit Pro Exclusive Features",
      subtitle:
        "Unlock powerful guides designed to make healthy living simple, sustainable, and enjoyable - wherever you are.",
      guides: [
        {
          guide_ids: 81,
          guide_name: "restaurant-guide",
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1751445591/app_images/f0sswv72tv1gtsinuzvp.png",
          title: "BN Restaurant Guide",
          description: "Make The Healthiest Choices Even While Dining Out",
          display_price: "₹99",
          mrp: 1299,
          discount_amount: 1200,
          paid_amount: 99,
          discount_type: "other",
          validity: 30,
        },
        {
          guide_ids: 82,
          guide_name: "alcohol-guide",
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1751448970/app_images/niu1maoedzortuswbwka.png",
          title: "BN Alcohol Guide",
          description: "Enjoy Smart Drinking Without Derailing Your Progress.",
          display_price: "₹99",
          mrp: 1299,
          discount_amount: 1200,
          paid_amount: 99,
          discount_type: "other",
          validity: 30,
        },
        {
          guide_ids: 83,
          guide_name: "recipe-book",
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1751449034/app_images/pwwpcbg863a53cwkuky1.png",
          title: "BN Recipe Book",
          description: "Wholesome, Easy-To-Cook Meals Tailored To Your Goals.",
          display_price: "₹99",
          mrp: 1299,
          discount_amount: 1200,
          paid_amount: 99,
          discount_type: "other",
          validity: 30,
        },
        {
          guide_ids: 87,
          guide_name: "quick-fillers-guide",
          image: "https://bncleanse.com/images/quickFillers.png",
          title: "BN QuickFillers Guide",
          description: "Snacking Without Sacrificing Your Health.",
          display_price: "₹99",
          mrp: 1299,
          discount_amount: 1200,
          paid_amount: 99,
          discount_type: "other",
          validity: 30,
        },
      ],
      subscriptions: [
        {
          id: "1-year",
          guide_ids: [81, 82, 83],
          display_price: "₹99",
          mrp: 1299,
          paid_amount: 99,
          discount_amount: 1200,
          validity_days: 30,
          discount_type: "other",
          display_duration: "",
          description: "One upgrade, every benefit.",
          benefit: [
            "All four E-Kits Together",
            "Personalized Guidance Every Step of the Way",
            "More affordable than buying individual guides.",
            "All-in-One Nutrition Plan",
          ],
          validity: 365,
        },
      ],
    },
  });

  return res.status(200).json(apiresponse);
};

const getHealthScoreReport = async (req, res, next) => {
  try {
    const user_id = req.body.user_id; // Assuming user_id comes from the request body

    if (!user_id) {
      return res.status(400).json({
        status: false,
        message: "user_id is required",
      });
    }

    // 1. Get the latest health score record for the user
    const { results: userHealthScores } = await readRecord({
      selectFields: ["*"],
      table: "bn_client_hs",
      conditions: [
        { field: "user_id", operator: "=", value: parseInt(user_id) },
        { field: "overall_health_score", operator: ">", value: "0" },
      ],
      orderBy: ["id DESC"],
    });

    if (!userHealthScores.length) {
      return res.status(404).json({
        status: false,
        message: "No health score found for the user",
      });
    }

    const user = userHealthScores[0];
    const age = parseFloat(user.age);
    const gender = user.gender;
    const userGoals = user.goals
      ? user.goals.replace(/[\[\]"]/g, "").split(",")
      : [];
    const userHealthIssues = user.health_issue
      ? user.health_issue.replace(/[\[\]"]/g, "").split(",")
      : [];

    if (!age || !gender) {
      return res.status(400).json({
        status: false,
        message: "User profile incomplete (missing age/gender)",
      });
    }

    if (userGoals.length === 0 && userHealthIssues.length === 0) {
      return res.status(400).json({
        status: false,
        message: "User has no goals or health issues defined",
      });
    }

    // 2. Initialize the conditions array for the query
    let conditions = [
      { field: "user_id", operator: "!=", value: parseInt(user_id) },
      { field: "gender", operator: "=", value: gender },
      { field: "overall_health_score", operator: ">", value: "0" },
    ];

    // 3. Dynamically add the age condition based on the user's gender and age range
    if (gender === "female") {
      if (age < 25.0) {
        conditions.push({ field: "age", operator: "<", value: 25 });
      } else if (age >= 25.0 && age <= 35.0) {
        conditions.push({ field: "age", operator: "BETWEEN", value: [25, 35] });
      } else if (age >= 35.0 && age <= 45.0) {
        conditions.push({ field: "age", operator: "BETWEEN", value: [35, 45] });
      } else if (age > 45.0) {
        conditions.push({ field: "age", operator: ">", value: 45 });
      }
    }

    // 4. Build dynamic OR conditions for goals and health issues (connected by OR)
    let orConditions = [];

    // Add conditions for goals
    if (userGoals.length > 0) {
      userGoals.forEach((goal) => {
        orConditions.push({
          field: "goals",
          operator: "LIKE",
          value: `%${goal.trim()}%`,
        });
      });
    }

    // Add conditions for health issues in bn_client_hs
    if (userHealthIssues.length > 0) {
      userHealthIssues.forEach((healthIssue) => {
        orConditions.push({
          field: "health_issue",
          operator: "LIKE",
          value: `%${healthIssue.trim()}%`,
        });
      });
    }

    // 5. Subquery for checking "Diabetes" in the `assessment_medical_history` table (added to OR condition)
    if (
      userHealthIssues.includes("Diabetes") ||
      userHealthIssues.includes("Type 1 Diabetes") ||
      userHealthIssues.includes("Type 2 Diabetes") ||
      userHealthIssues.includes("Pre Diabetes")
    ) {
      // Subquery to check for "Diabetes" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(diabetes)
                     FROM assessment_medical_history amh
                     WHERE bch.user_id = amh.user_id
                     ORDER BY medical_history_id DESC
                     LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(diabetes)
                     FROM assessment_medical_history amh
                     WHERE bch.user_id = amh.user_id
                     ORDER BY medical_history_id DESC
                     LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("PCOS") ||
      userHealthIssues.includes("pcos") ||
      userHealthIssues.includes("pcod")
    ) {
      // Subquery to check for "PCOS" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(pcos)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) = 'yes'`,
      });
    }

    if (
      userHealthIssues.includes("Thyroid") ||
      userHealthIssues.includes("Hyperthyroid") ||
      userHealthIssues.includes("Hypothyroid")
    ) {
      // Subquery to check for "Thyroid" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(thyroid)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(thyroid)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Blood Pressure") ||
      userHealthIssues.includes("High Blood Pressure") ||
      userHealthIssues.includes("Low Blood Pressure")
    ) {
      // Subquery to check for "Blood Pressure" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(blood_pressure)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(blood_pressure)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Fatty Liver") ||
      userHealthIssues.includes("Grade 1 (mild) Fatty liver") ||
      userHealthIssues.includes("Grade 2 (moderate) Fatty liver") ||
      userHealthIssues.includes("Grade 3 (severe) Fatty liver") ||
      userHealthIssues.includes("Grade 4 (fibrosis) Fatty liver") ||
      userHealthIssues.includes("Cirhosis Fatty liver")
    ) {
      // Subquery to check for "Fatty Liver" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(fatty_liver)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(fatty_liver)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Acidity") ||
      userHealthIssues.includes("Mild Acidity") ||
      userHealthIssues.includes("Severe Acidity")
    ) {
      // Subquery to check for "Fatty Liver" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(acidity)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(acidity)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    // Combine all goal and health issue conditions into one OR condition
    if (orConditions.length > 0) {
      conditions.push({ orConditions });
    }

    console.log(conditions, 11223344);

    // 6. Get the count of potential peers based on the conditions
    const { results: potentialPeers } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT user_id) AS count",
        "ROUND(AVG(overall_health_score)) AS avg_health_score",
        "GROUP_CONCAT(DISTINCT(user_id)) as peer_users",
      ], // Use COUNT DISTINCT to count unique users
      table: "bn_client_hs bch",
      conditions,
    });

    console.log(potentialPeers[0].count, 100100100);
    let peerGroupCount =
      potentialPeers.length > 0 ? potentialPeers[0].count : 0;
    let avgHealthScore =
      potentialPeers.length > 0 ? potentialPeers[0].avg_health_score : 0;
    let peerUsers =
      potentialPeers.length > 0 ? potentialPeers[0].peer_users : 0;
    if (potentialPeers[0].count < 100) {
      let orConditions = [];

      orConditions.push({
        field: "health_issue",
        operator: "=",
        value: "",
      });

      orConditions.push({
        field: "health_issue",
        operator: "IS NULL",
        value: "",
        raw: true,
      });
      let additionalCondition = [
        { field: "gender", operator: "=", value: gender },
      ];

      additionalCondition.push({ orConditions });
      const { results: additionalPeer } = await readRecord({
        selectFields: [
          "COUNT(DISTINCT user_id) AS count",
          "ROUND(AVG(overall_health_score)) AS avg_health_score",
          "GROUP_CONCAT(DISTINCT(user_id)) as peer_users",
        ], // Use COUNT DISTINCT to count unique users
        table: "bn_client_hs bch",
        conditions: additionalCondition,
      });
      peerGroupCount = additionalPeer.length > 0 ? additionalPeer[0].count : 0;
      avgHealthScore =
        additionalPeer.length > 0 ? additionalPeer[0].avg_health_score : 0;
      peerUsers = additionalPeer.length > 0 ? additionalPeer[0].peer_users : 0;
    }

    // 7. Return the count of unique users

    let peer_users_array = peerUsers.split(",");
    const { results: successStories } = await readRecord({
      selectFields: ["*"],
      table: "success_stories",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array }, // Check if user_id exists in the list of potential peer user_ids
        { field: "status", operator: "=", value: "active" }, // Only active success stories
        { field: "is_deleted", operator: "=", value: 0 }, // Ensure success story is not deleted
      ],
    });

    const { results: weightRecords } = await readRecord({
      selectFields: [
        "user_id",
        "(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date ASC LIMIT 1) AS start_weight",
        "(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date DESC LIMIT 1) AS end_weight",
        "((SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date ASC LIMIT 1)-(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date DESC LIMIT 1)) AS weight_difference",
      ],
      table: "weight_records wr",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array }, // Only users in peer_users_array
      ],
      groupBy: ["wr.user_id"],
    });

    // 1. Get latest and first HS for all peers
    const { results: peerImprovementData } = await readRecord({
      selectFields: [
        "user_id",
        // HS
        "(SELECT overall_health_score FROM bn_client_hs WHERE user_id = b.user_id ORDER BY id ASC LIMIT 1) AS start_hs",
        "(SELECT overall_health_score FROM bn_client_hs WHERE user_id = b.user_id ORDER BY id DESC LIMIT 1) AS latest_hs",
        // BMI
        "(SELECT body_mass_index FROM bn_client_hs WHERE user_id = b.user_id ORDER BY id ASC LIMIT 1) AS start_bmi",
        "(SELECT body_mass_index FROM bn_client_hs WHERE user_id = b.user_id ORDER BY id DESC LIMIT 1) AS latest_bmi",
        // Weight
        "(SELECT weight FROM weight_records WHERE user_id = b.user_id ORDER BY posted_date ASC LIMIT 1) AS start_weight",
        "(SELECT weight FROM weight_records WHERE user_id = b.user_id ORDER BY posted_date DESC LIMIT 1) AS latest_weight",
        // bmi category
        "(SELECT health_category FROM bn_client_hs WHERE user_id = b.user_id ORDER BY id DESC LIMIT 1) AS bmi_category",
        // ideal bmi
        "(SELECT ideal_bmi FROM bn_client_hs WHERE user_id = b.user_id ORDER BY id DESC LIMIT 1) AS ideal_bmi",
      ],
      table: "bn_client_hs b",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array },
      ],
      groupBy: ["user_id"],
    });

    // 2. Analyze HS improvements
    let improvedCount = 0;
    let totalPeers = peerImprovementData.length;
    let userHS = parseFloat(userHealthScores[0].overall_health_score);
    let improvementThreshold = 6;
    const bmiCategory = userHealthScores[0]?.bmi_category || "";
    const idealBMI = parseFloat(userHealthScores[0]?.ideal_bmi || 0);

    peerImprovementData.forEach(({ start_hs, latest_hs }) => {
      const diff = parseFloat(latest_hs) - parseFloat(start_hs);
      if (diff >= improvementThreshold) {
        improvedCount++;
      }
    });

    let improvedPercentage =
      totalPeers > 0 ? Math.round((improvedCount / totalPeers) * 100) : 0;

    let avgHS = parseFloat(avgHealthScore); // Already calculated earlier
    let dynamicMessage = "";

    if (userHS === avgHS) {
      dynamicMessage = `We’ve identified ${peerGroupCount} people just like you, with similar lifestyle patterns and health goals with an average Health Score of ${avgHS}. We have seen that ${improvedPercentage}% of them saw a ${improvementThreshold} - ${
        improvementThreshold + 2
      } point improvement in just 3 months by making simple changes.`;
    } else if (userHS < avgHS) {
      dynamicMessage = `We have identified ${peerGroupCount} people just like you (similar lifestyle and health goals) with an average HS of ${avgHS}. At ${userHS}, your current Health Score is slightly below that – but here’s the best part: more than half of them improved their score by ${improvementThreshold}+ points within just 3 months.`;
    } else {
      dynamicMessage = `Among ${peerGroupCount} individuals with similar goals and lifestyle habits, the average Health Score is ${avgHS} – and yours is already above that! In fact, ${improvedPercentage}% of those with a similar starting point managed to boost their score even further in just 2 months.`;
    }

    //   console.log(weightRecords,909090);

    const positiveWeightLossArray = weightRecords.filter(
      (item) => parseFloat(item.weight_difference) > 0,
    );

    // Calculate the average weight_difference for positive values
    const averageWeightLoss =
      positiveWeightLossArray.length > 0
        ? (
            positiveWeightLossArray.reduce(
              (sum, item) => sum + parseFloat(item.weight_difference),
              0,
            ) / positiveWeightLossArray.length
          ).toFixed(2)
        : 0; // If no positive weight differences, return 0

    console.log("Average Positive Weight Loss:", averageWeightLoss);

    //Weight Peers

    let totalStartWeight = 0;
    let validWeightCount = 0;
    let significantLossCount = 0;
    let totalWeightLoss = 0;

    const weightLossThreshold = 4;
    const userStartWeight = parseFloat(userHealthScores[0].weight || 0); // Assuming available in bn_client_hs

    peerImprovementData.forEach(({ start_weight, latest_weight }) => {
      const start = parseFloat(start_weight);
      const latest = parseFloat(latest_weight);

      if (!isNaN(start) && !isNaN(latest)) {
        const diff = start - latest;
        totalStartWeight += start;
        validWeightCount++;

        if (diff >= weightLossThreshold) {
          significantLossCount++;
          totalWeightLoss += diff;
        }
      }
    });

    const avgPeerStartWeight =
      validWeightCount > 0
        ? (totalStartWeight / validWeightCount).toFixed(1)
        : 0;

    const avgWeightLoss =
      significantLossCount > 0
        ? (totalWeightLoss / significantLossCount).toFixed(1)
        : 0;

    const weightImprovedPercentage =
      validWeightCount > 0
        ? Math.round((significantLossCount / validWeightCount) * 100)
        : 0;

    let weightMessage = "";

    if (userStartWeight === parseFloat(avgPeerStartWeight)) {
      weightMessage = `Your current weight is close to the average of ${peerGroupCount} individuals who share a similar lifestyle as you. ${weightImprovedPercentage}% of them dropped 4–6 kg in just 12 weeks by taking a few structured steps forward.`;
    } else if (userStartWeight > parseFloat(avgPeerStartWeight)) {
      weightMessage = `You’re starting your journey at a weight slightly above that of ${peerGroupCount} others who share your health goals and lifestyle. Amongst them we saw an average reduction of ${avgWeightLoss}kg over 3 months with small adjustments to their routine!`;
    } else {
      weightMessage = `You’re already ahead — your weight is lower than most people in your peer group, who share your lifestyle and goals. This gives you a great foundation to reach your best — just like the ${significantLossCount} others who made it work.`;
    }

    //BMI message

    // Thresholds and user BMI
    const bmiImprovementThreshold = 5;
    const userBMI = parseFloat(userHealthScores[0]?.body_mass_index || 0);

    let totalStartBMI = 0;
    let validCount = 0;
    let improvedBMICount = 0;

    peerImprovementData.forEach(({ start_bmi, latest_bmi }) => {
      const start = parseFloat(start_bmi);
      const latest = parseFloat(latest_bmi);
      if (!isNaN(start) && !isNaN(latest)) {
        totalStartBMI += start;
        validCount++;
        if (start - latest >= bmiImprovementThreshold) {
          improvedBMICount++;
        }
      }
    });

    const avgBMIPeerGroup =
      validCount > 0 ? (totalStartBMI / validCount).toFixed(1) : 0;
    const improvedPercent =
      validCount > 0 ? Math.round((improvedBMICount / validCount) * 100) : 0;

    // Compose the message
    let bmiMessage = "";

    if (userBMI === parseFloat(avgBMIPeerGroup)) {
      bmiMessage = `We have identified ${peerGroupCount} people with similar lifestyles and health goals that share your current BMI of ${userBMI}. Nearly ${improvedPercent}% of them reduced their BMI by ${bmiImprovementThreshold} points in just 4 months. You're perfectly placed to see the same results.`;
    } else if (userBMI > parseFloat(avgBMIPeerGroup)) {
      const higherThreshold = bmiImprovementThreshold + 1;
      bmiMessage = `You’re not alone – ${peerGroupCount} others with similar lifestyles and health goals also started with a BMI of ${userBMI}. The inspiring part? Over ${improvedPercent}% of them lowered their BMI by ${higherThreshold} points in just 4 months through consistent, sustainable changes.`;
    } else {
      bmiMessage = `Your BMI is actually higher than the average of ${peerGroupCount} others with similar habits and health goals. ${improvedPercent}% in this range have successfully maintained their progress while improving overall fitness in just 6 weeks.`;
    }
    let health_score = userHealthScores[0].overall_health_score;
    let hs_color,
      motivation_text,
      toAchieveHS,
      toAchievecolor,
      toAchieveCategory = "";
    if (health_score >= 90) {
      hs_color = "#216F35";
      motivation_text = "Excellent";
      toAchieveHS = 100;
      toAchievecolor = "#216F35";
      toAchieveCategory = "Excellent";
    } else if (health_score >= 71 && health_score <= 89) {
      hs_color = "#AAD53A";
      motivation_text = "Very Good";
      toAchieveHS = 95;
      toAchievecolor = "#216F35";
      toAchieveCategory = "Excellent";
    } else if (health_score >= 51 && health_score <= 70) {
      hs_color = "#F4AF2D";
      motivation_text = "Can Do Better";
      toAchieveHS = 80;
      toAchievecolor = "#AAD53A";
      toAchieveCategory = "Very Good";
    } else if (health_score >= 31 && health_score <= 50) {
      hs_color = "#9F6B09";
      motivation_text = "Needs Attention";
      toAchieveHS = 71;
      toAchievecolor = "#AAD53A";
      toAchieveCategory = "Very Good";
    } else if (health_score <= 30) {
      hs_color = "#E72A21";
      motivation_text = "Act NOW!";
      toAchieveHS = 71;
      toAchievecolor = "#AAD53A";
      toAchieveCategory = "Very Good";
    }

    let bmi_colour;
    let bmi = userHealthScores[0].body_mass_index;

    if (bmi <= 18.49) {
      bmi_colour = "#AAD53A";
    } else if (bmi >= 18.5 && bmi <= 24.99) {
      bmi_colour = "#216F35";
    } else if (bmi >= 25.0 && bmi <= 29.99) {
      bmi_colour = "#AAD53A";
    } else {
      bmi_colour = "#E72A21";
    }
    //fetch lead consultation details
    const callDetailsTable = tables.callUpdates;
    const selectcallDetailsColumns = [
      `cu.call_id`,
      `cu.schedule_date as call_schedule_date`,
      `cu.call_type`,
      `cu.call_status`,
      `cu.added_by`,
      `slot.appointment_slots`,
      `cu.extra_questions_id`,
    ];
    const callDetailsWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
      { field: `call_type`, operator: `=`, value: "30" },
      {
        field: `DATE(schedule_date)`,
        operator: `>=`,
        value: `DATE(CURDATE() - INTERVAL 15 DAY)`,
        raw: true,
      },
    ];
    const { results: callDetails } = await readRecord({
      table: `${callDetailsTable} as cu`,
      selectFields: selectcallDetailsColumns,
      joins: [
        {
          type: `LEFT`,
          table: `${tables.slots} slot`,
          on: `slot.id = cu.slot_id`,
        },
      ],
      conditions: callDetailsWhereCondition,
      orderBy: ["cu.call_id DESC"],
    });

    let isCallBooked = false;
    if (callDetails.length > 0) {
      isCallBooked = true;
    }

    return res.status(200).json({
      status: true,
      message: "Peer Group Count",
      data: {
        isCallBooked: isCallBooked,
        count: peerGroupCount,
        healthScoreReport: {
          description: dynamicMessage,
          current_score: {
            label: "Your Score",
            background_color: hs_color,
            label_color: "#FFFFFF",
            score_color: "#FFFFFF",
            message_color: "#FFFFFF",
            score: userHealthScores[0].overall_health_score,
            message: motivation_text,
          },
          target_score: {
            label: "Target Score",
            background_color: toAchievecolor,
            label_color: "#FFFFFF",
            score_color: "#FFFFFF",
            message_color: "#FFFFFF",
            score: toAchieveHS,
            message: toAchieveCategory,
          },
          score_description: `This result signals an urgent need to focus on your health. Waiting can make the journey longer and more difficult. With structured dietary changes and expert support, we'll help you move forward safely and sustainably.`,
        },

        BMIReport: {
          description: bmiMessage,
          current_bmi: {
            label: "Your B.M.I.",
            background_color: "#E72A21",
            label_color: "#FFFFFF",
            score_color: "#FFFFFF",
            score: userHealthScores[0].body_mass_index,
          },
          ideal_bmi: {
            label: "Ideal B.M.I",
            background_color: "#DFFFE7",
            label_color: "#216F35",
            score_color: "#216F35",
            score: userHealthScores[0].ideal_bmi,
          },
          bmi_description: `Your BMI of ${userBMI} falls in the ${bmiCategory} category and needs attention. With the right guidance and consistency, moving toward a healthier target of ${idealBMI} is achievable every positive choice brings you closer. We'll support you with the structure and guidance needed to feel lighter, stronger, and more energized.`,
        },
        weightReport: {
          description: weightMessage,
          current_weight: userHealthScores[0].weight,
          goal_weight: userHealthScores[0].goal_weight,
          ideal_weight: userHealthScores[0].ideal_weight,
          bmi: userHealthScores[0].body_mass_index,
          bmi_color: bmi_colour,
          message: `<span>You are ${Math.abs(
            userHealthScores[0].weight - userHealthScores[0].goal_weight,
          ).toFixed(2)}kg away from your goal weight</span>`,
          weight_description: `You've taken an important first step. With regular follow-up of your plan, your weight can move towards a healthier range over time. The graph below gives a realistic view of this gradual journey.`,
          visualized_weight: [
            {
              session: 0,
              session_days: "0",
              weight: "70.0",
              color: "#ef4444",
            },
            {
              session: 1,
              session_days: "30",
              weight: "65.0",
              color: "#22c55e",
            },
            {
              session: 2,
              session_days: "60",
              weight: "60.0",
              color: "#22c55e",
            },
            {
              session: 3,
              session_days: "90",
              weight: "55.0",
              color: "#22c55e",
            },
          ],
        },
      },
    });
  } catch (error) {
    console.error("Error in getPeerGroupDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const getPeerGroupDetails = async (req, res, next) => {
  try {
    const user_id = req.body.user_id; // Assuming user_id comes from the request body

    if (!user_id) {
      return res.status(400).json({
        status: false,
        message: "user_id is required",
      });
    }
    if (user_id) {
      const meta_data = {
        device: req.headers.device || req.headers["user-agent"] || "unknown",
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      };
      await insertUserVisitLog({ user_id, page: "peer_group", meta_data });
    }
    // 1. Get the latest health score record for the user
    const { results: userHealthScores } = await readRecord({
      selectFields: ["*"],
      table: "bn_client_hs",
      conditions: [
        { field: "user_id", operator: "=", value: parseInt(user_id) },
        { field: "overall_health_score", operator: ">", value: "0" },
      ],
      orderBy: ["id DESC"],
    });

    if (!userHealthScores.length) {
      return res.status(404).json({
        status: false,
        message: "No health score found for the user",
      });
    }

    const user = userHealthScores[0];
    const age = parseFloat(user.age);
    const gender = user.gender;
    const userGoals = user.goals
      ? user.goals.replace(/[\[\]"]/g, "").split(",")
      : [];
    const userHealthIssues = user.health_issue
      ? user.health_issue.replace(/[\[\]"]/g, "").split(",")
      : [];

    if (!age || !gender) {
      return res.status(400).json({
        status: false,
        message: "User profile incomplete (missing age/gender)",
      });
    }

    if (userGoals.length === 0 && userHealthIssues.length === 0) {
      return res.status(400).json({
        status: false,
        message: "User has no goals or health issues defined",
      });
    }

    // 2. Initialize the conditions array for the query
    let conditions = [
      { field: "user_id", operator: "!=", value: parseInt(user_id) },
      { field: "gender", operator: "=", value: gender },
      { field: "overall_health_score", operator: ">", value: "0" },
    ];

    // 3. Dynamically add the age condition based on the user's gender and age range
    if (gender === "female") {
      if (age < 25.0) {
        conditions.push({ field: "age", operator: "<", value: 25 });
      } else if (age >= 25.0 && age <= 35.0) {
        conditions.push({ field: "age", operator: "BETWEEN", value: [25, 35] });
      } else if (age >= 35.0 && age <= 45.0) {
        conditions.push({ field: "age", operator: "BETWEEN", value: [35, 45] });
      } else if (age > 45.0) {
        conditions.push({ field: "age", operator: ">", value: 45 });
      }
    }

    // 4. Build dynamic OR conditions for goals and health issues (connected by OR)
    let orConditions = [];

    // Add conditions for goals
    if (userGoals.length > 0) {
      userGoals.forEach((goal) => {
        orConditions.push({
          field: "goals",
          operator: "LIKE",
          value: `%${goal.trim()}%`,
        });
      });
    }

    // Add conditions for health issues in bn_client_hs
    if (userHealthIssues.length > 0) {
      userHealthIssues.forEach((healthIssue) => {
        orConditions.push({
          field: "health_issue",
          operator: "LIKE",
          value: `%${healthIssue.trim()}%`,
        });
      });
    }

    // 5. Subquery for checking "Diabetes" in the `assessment_medical_history` table (added to OR condition)
    if (
      userHealthIssues.includes("Diabetes") ||
      userHealthIssues.includes("Type 1 Diabetes") ||
      userHealthIssues.includes("Type 2 Diabetes") ||
      userHealthIssues.includes("Pre Diabetes")
    ) {
      // Subquery to check for "Diabetes" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(diabetes)
                     FROM assessment_medical_history amh
                     WHERE bch.user_id = amh.user_id
                     ORDER BY medical_history_id DESC
                     LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(diabetes)
                     FROM assessment_medical_history amh
                     WHERE bch.user_id = amh.user_id
                     ORDER BY medical_history_id DESC
                     LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("PCOS") ||
      userHealthIssues.includes("pcos") ||
      userHealthIssues.includes("pcod")
    ) {
      // Subquery to check for "PCOS" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(pcos)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) = 'yes'`,
      });
    }

    if (
      userHealthIssues.includes("Thyroid") ||
      userHealthIssues.includes("Hyperthyroid") ||
      userHealthIssues.includes("Hypothyroid")
    ) {
      // Subquery to check for "Thyroid" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(thyroid)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(thyroid)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Blood Pressure") ||
      userHealthIssues.includes("High Blood Pressure") ||
      userHealthIssues.includes("Low Blood Pressure")
    ) {
      // Subquery to check for "Blood Pressure" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(blood_pressure)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(blood_pressure)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Fatty Liver") ||
      userHealthIssues.includes("Grade 1 (mild) Fatty liver") ||
      userHealthIssues.includes("Grade 2 (moderate) Fatty liver") ||
      userHealthIssues.includes("Grade 3 (severe) Fatty liver") ||
      userHealthIssues.includes("Grade 4 (fibrosis) Fatty liver") ||
      userHealthIssues.includes("Cirhosis Fatty liver")
    ) {
      // Subquery to check for "Fatty Liver" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(fatty_liver)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(fatty_liver)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Acidity") ||
      userHealthIssues.includes("Mild Acidity") ||
      userHealthIssues.includes("Severe Acidity")
    ) {
      // Subquery to check for "Fatty Liver" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(acidity)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(acidity)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    // Combine all goal and health issue conditions into one OR condition
    if (orConditions.length > 0) {
      conditions.push({ orConditions });
    }

    console.log(conditions, 11223344);

    const { results: potentialPeersUsers } = await readRecord({
      selectFields: ["GROUP_CONCAT(DISTINCT(user_id)) as peer_users"], // Only get user_id from potential peers
      table: "bn_client_hs bch",
      conditions,
    });

    // 6. Get the count of potential peers based on the conditions
    const { results: potentialPeers } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT user_id) AS count",
        "ROUND(AVG(overall_health_score)) AS avg_health_score",
        "GROUP_CONCAT(DISTINCT(user_id)) as peer_users",
      ], // Use COUNT DISTINCT to count unique users
      table: "bn_client_hs bch",
      conditions,
    });

    console.log(potentialPeers, 100100100);

    // 7. Return the count of unique users
    let peerGroupCount =
      potentialPeers.length > 0 ? potentialPeers[0].count : 0;
    let avgHealthScore =
      potentialPeers.length > 0 ? potentialPeers[0].avg_health_score : 0;
    let peerUsers =
      potentialPeers.length > 0 ? potentialPeers[0].peer_users : 0;
    if (potentialPeers[0].count < 100) {
      let orConditions = [];

      orConditions.push({
        field: "health_issue",
        operator: "=",
        value: "",
      });

      orConditions.push({
        field: "health_issue",
        operator: "IS NULL",
        value: "",
        raw: true,
      });
      let additionalCondition = [
        { field: "gender", operator: "=", value: gender },
      ];

      additionalCondition.push({ orConditions });
      const { results: additionalPeer } = await readRecord({
        selectFields: [
          "COUNT(DISTINCT user_id) AS count",
          "ROUND(AVG(overall_health_score)) AS avg_health_score",
          "GROUP_CONCAT(DISTINCT(user_id)) as peer_users",
        ], // Use COUNT DISTINCT to count unique users
        table: "bn_client_hs bch",
        conditions: additionalCondition,
      });
      peerGroupCount = additionalPeer.length > 0 ? additionalPeer[0].count : 0;
      avgHealthScore =
        additionalPeer.length > 0 ? additionalPeer[0].avg_health_score : 0;
      peerUsers = additionalPeer.length > 0 ? additionalPeer[0].peer_users : 0;
    }
    let peer_users_array = peerUsers.split(",");
    const { results: successStories } = await readRecord({
      selectFields: ["*"],
      table: "success_stories",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array }, // Check if user_id exists in the list of potential peer user_ids
        { field: "status", operator: "=", value: "active" }, // Only active success stories
        { field: "is_deleted", operator: "=", value: 0 }, // Ensure success story is not deleted
      ],
    });

    const { results: weightRecords } = await readRecord({
      selectFields: [
        "user_id",
        "(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date ASC LIMIT 1) AS start_weight",
        "(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date DESC LIMIT 1) AS end_weight",
        "((SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date ASC LIMIT 1)-(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date DESC LIMIT 1)) AS weight_difference",
      ],
      table: "weight_records wr",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array }, // Only users in peer_users_array
      ],
      groupBy: ["wr.user_id"],
    });
    //   console.log(weightRecords,909090);

    const positiveWeightLossArray = weightRecords.filter(
      (item) => parseFloat(item.weight_difference) > 0,
    );

    // Calculate the average weight_difference for positive values
    const averageWeightLoss =
      positiveWeightLossArray.length > 0
        ? (
            positiveWeightLossArray.reduce(
              (sum, item) => sum + parseFloat(item.weight_difference),
              0,
            ) / positiveWeightLossArray.length
          ).toFixed(2)
        : 0; // If no positive weight differences, return 0

    console.log("Average Positive Weight Loss:", averageWeightLoss);

    let peerSuccessStories = successStories.map((story) => ({
      title: "Lost " + story.weight_loss + "kg Overall",
      user_id: story.user_id,
      story_id: story.id,
      before: JSON.parse(story.photo_before),
      after: JSON.parse(story.photo_after),
      userDetails: JSON.parse(story.client_details),
      impact: [],
      program_id: story.program_id,
    }));

    return res.status(200).json({
      status: true,
      message: "Peer Group Count",
      data: {
        peerGroup: {
          count: peerGroupCount,
          description:
            "people with similar age, gender, health conditions, goals & profession",
          caption: "If they can, so can you!",
          period: "In 60 days",
          program_list: "",
          metrics: [
            {
              section: "Average Health Score",
              from: avgHealthScore,
            },
            {
              section: "Average Weight Loss",
              from: averageWeightLoss + "kg",
            },
          ],
        },
        success_story_list: peerSuccessStories,
        program_list: [
          {
            image:
              "https://www.bncleanse.com/images/programs/original/Body_transformation_main_app.png",
            redirect_screen_name: "program",
            screen_params: {
              program_id: 4,
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("Error in getPeerGroupDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const getPeerGroupComparisonData = async (req, res, next) => {
  try {
    const user_id = req.body.user_id; // Assuming user_id comes from the request body

    if (!user_id) {
      return res.status(400).json({
        status: false,
        message: "user_id is required",
      });
    }

    // 1. Get the latest health score record for the user
    const { results: userHealthScores } = await readRecord({
      selectFields: ["*"],
      table: "bn_client_hs",
      conditions: [
        { field: "user_id", operator: "=", value: parseInt(user_id) },
        { field: "overall_health_score", operator: ">", value: "0" },
      ],
      orderBy: ["id DESC"],
    });

    if (!userHealthScores.length) {
      return res.status(404).json({
        status: false,
        message: "No health score found for the user",
      });
    }

    const user = userHealthScores[0];
    const age = parseFloat(user.age);
    const gender = user.gender;
    const userGoals = user.goals
      ? user.goals.replace(/[\[\]"]/g, "").split(",")
      : [];
    const userHealthIssues = user.health_issue
      ? user.health_issue.replace(/[\[\]"]/g, "").split(",")
      : [];

    if (!age || !gender) {
      return res.status(400).json({
        status: false,
        message: "User profile incomplete (missing age/gender)",
      });
    }

    if (userGoals.length === 0 && userHealthIssues.length === 0) {
      return res.status(400).json({
        status: false,
        message: "User has no goals or health issues defined",
      });
    }

    // 2. Initialize the conditions array for the query
    let conditions = [
      { field: "user_id", operator: "!=", value: parseInt(user_id) },
      { field: "gender", operator: "=", value: gender },
      { field: "overall_health_score", operator: ">", value: "0" },
    ];

    // 3. Dynamically add the age condition based on the user's gender and age range
    if (gender === "female") {
      if (age < 25.0) {
        conditions.push({ field: "age", operator: "<", value: 25 });
      } else if (age >= 25.0 && age <= 35.0) {
        conditions.push({ field: "age", operator: "BETWEEN", value: [25, 35] });
      } else if (age >= 35.0 && age <= 45.0) {
        conditions.push({ field: "age", operator: "BETWEEN", value: [35, 45] });
      } else if (age > 45.0) {
        conditions.push({ field: "age", operator: ">", value: 45 });
      }
    }

    // 4. Build dynamic OR conditions for goals and health issues (connected by OR)
    let orConditions = [];

    // Add conditions for goals
    if (userGoals.length > 0) {
      userGoals.forEach((goal) => {
        orConditions.push({
          field: "goals",
          operator: "LIKE",
          value: `%${goal.trim()}%`,
        });
      });
    }

    // Add conditions for health issues in bn_client_hs
    if (userHealthIssues.length > 0) {
      userHealthIssues.forEach((healthIssue) => {
        orConditions.push({
          field: "health_issue",
          operator: "LIKE",
          value: `%${healthIssue.trim()}%`,
        });
      });
    }

    // 5. Subquery for checking "Diabetes" in the `assessment_medical_history` table (added to OR condition)
    if (
      userHealthIssues.includes("Diabetes") ||
      userHealthIssues.includes("Type 1 Diabetes") ||
      userHealthIssues.includes("Type 2 Diabetes") ||
      userHealthIssues.includes("Pre Diabetes")
    ) {
      // Subquery to check for "Diabetes" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(diabetes)
                     FROM assessment_medical_history amh
                     WHERE bch.user_id = amh.user_id
                     ORDER BY medical_history_id DESC
                     LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(diabetes)
                     FROM assessment_medical_history amh
                     WHERE bch.user_id = amh.user_id
                     ORDER BY medical_history_id DESC
                     LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("PCOS") ||
      userHealthIssues.includes("pcos") ||
      userHealthIssues.includes("pcod")
    ) {
      // Subquery to check for "PCOS" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(pcos)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) = 'yes'`,
      });
    }

    if (
      userHealthIssues.includes("Thyroid") ||
      userHealthIssues.includes("Hyperthyroid") ||
      userHealthIssues.includes("Hypothyroid")
    ) {
      // Subquery to check for "Thyroid" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(thyroid)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(thyroid)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Blood Pressure") ||
      userHealthIssues.includes("High Blood Pressure") ||
      userHealthIssues.includes("Low Blood Pressure")
    ) {
      // Subquery to check for "Blood Pressure" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(blood_pressure)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(blood_pressure)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Fatty Liver") ||
      userHealthIssues.includes("Grade 1 (mild) Fatty liver") ||
      userHealthIssues.includes("Grade 2 (moderate) Fatty liver") ||
      userHealthIssues.includes("Grade 3 (severe) Fatty liver") ||
      userHealthIssues.includes("Grade 4 (fibrosis) Fatty liver") ||
      userHealthIssues.includes("Cirhosis Fatty liver")
    ) {
      // Subquery to check for "Fatty Liver" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(fatty_liver)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(fatty_liver)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    if (
      userHealthIssues.includes("Acidity") ||
      userHealthIssues.includes("Mild Acidity") ||
      userHealthIssues.includes("Severe Acidity")
    ) {
      // Subquery to check for "Fatty Liver" in the `assessment_medical_history`
      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(acidity)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) IS NOT NULL`,
      });

      orConditions.push({
        field: "",
        operator: "",
        raw: true,
        value: `(SELECT LCASE(acidity)
                      FROM assessment_medical_history amh
                      WHERE bch.user_id = amh.user_id
                      ORDER BY medical_history_id DESC
                      LIMIT 1) != ''`,
      });
    }

    // Combine all goal and health issue conditions into one OR condition
    if (orConditions.length > 0) {
      conditions.push({ orConditions });
    }

    // 6. Get the count of potential peers based on the conditions
    const { results: potentialPeers } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT user_id) AS count",
        "ROUND(AVG(overall_health_score)) AS avg_health_score",
        "GROUP_CONCAT(DISTINCT(user_id)) as peer_users",
      ], // Use COUNT DISTINCT to count unique users
      table: "bn_client_hs bch",
      conditions,
    });

    console.log(potentialPeers, 100100100);

    // 7. Return the count of unique users
    let peerGroupCount =
      potentialPeers.length > 0 ? potentialPeers[0].count : 0;
    let avgHealthScore =
      potentialPeers.length > 0 ? potentialPeers[0].avg_health_score : 0;
    let peerUsers =
      potentialPeers.length > 0 ? potentialPeers[0].peer_users : 0;
    if (potentialPeers[0].count < 100) {
      let orConditions = [];

      orConditions.push({
        field: "health_issue",
        operator: "=",
        value: "",
      });

      orConditions.push({
        field: "health_issue",
        operator: "IS NULL",
        value: "",
        raw: true,
      });
      let additionalCondition = [
        { field: "gender", operator: "=", value: gender },
      ];

      additionalCondition.push({ orConditions });
      const { results: additionalPeer } = await readRecord({
        selectFields: [
          "COUNT(DISTINCT user_id) AS count",
          "ROUND(AVG(overall_health_score)) AS avg_health_score",
          "GROUP_CONCAT(DISTINCT(user_id)) as peer_users",
        ], // Use COUNT DISTINCT to count unique users
        table: "bn_client_hs bch",
        conditions: additionalCondition,
      });
      peerGroupCount = additionalPeer.length > 0 ? additionalPeer[0].count : 0;
      avgHealthScore =
        additionalPeer.length > 0 ? additionalPeer[0].avg_health_score : 0;
      peerUsers = additionalPeer.length > 0 ? additionalPeer[0].peer_users : 0;
    }
    let peer_users_array = peerUsers.split(",");
    const { results: successStories } = await readRecord({
      selectFields: ["*"],
      table: "success_stories",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array }, // Check if user_id exists in the list of potential peer user_ids
        { field: "status", operator: "=", value: "active" }, // Only active success stories
        { field: "is_deleted", operator: "=", value: 0 }, // Ensure success story is not deleted
      ],
    });

    const { results: weightRecords } = await readRecord({
      selectFields: [
        "user_id",
        "(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date ASC LIMIT 1) AS start_weight",
        "(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date DESC LIMIT 1) AS end_weight",
        "((SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date ASC LIMIT 1)-(SELECT weight FROM weight_records WHERE user_id = wr.user_id ORDER BY posted_date DESC LIMIT 1)) AS weight_difference",
      ],
      table: "weight_records wr",
      conditions: [
        { field: "user_id", operator: "IN", value: peer_users_array }, // Only users in peer_users_array
      ],
      groupBy: ["wr.user_id"],
    });
    //   console.log(weightRecords,909090);

    const positiveWeightLossArray = weightRecords.filter(
      (item) => parseFloat(item.weight_difference) > 0,
    );

    // Calculate the average weight_difference for positive values
    const averageWeightLoss =
      positiveWeightLossArray.length > 0
        ? (
            positiveWeightLossArray.reduce(
              (sum, item) => sum + parseFloat(item.weight_difference),
              0,
            ) / positiveWeightLossArray.length
          ).toFixed(2)
        : 0; // If no positive weight differences, return 0

    console.log("Average Positive Weight Loss:", averageWeightLoss);

    // let peerSuccessStories = successStories.map((story) => ({
    //   title: "Lost " + story.weight_loss + "kg Overall",
    //   user_id: story.user_id,
    //   story_id: story.id,
    //   before: JSON.parse(story.photo_before),
    //   after: JSON.parse(story.photo_after),
    //   userDetails: JSON.parse(story.client_details),
    //   impact: [
    //     {
    //       label: "Weight Loss",
    //       before: story.start_weight,
    //       after: story.end_weight,
    //     },
    //   ],
    //   program_id: story.program_id,
    // }));

    const { results: userDetails } = await readRecord({
      selectFields: ["home_screen_video"],
      table: "users_details",
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    console.log(successStories, 1122334455);
    let motivationText = "";

    let current_date = new Date();
    let hsTakenDate = new Date(userHealthScores[0].created);

    const differenceInMilliseconds = hsTakenDate - current_date;

    // Convert milliseconds to days
    const daysDifference = Math.round(
      Math.abs(differenceInMilliseconds / (1000 * 60 * 60 * 24)),
    );

    console.log(daysDifference, 22113311);

    if (daysDifference == 0) {
      motivationText = `<span><b>${peerGroupCount}</b> people with similar journey <br/> like you have lost <b>${averageWeightLoss}kg in 60 days.</b></span>`;
    } else if (daysDifference % 2 == 0) {
      motivationText = `<span><b>${peerGroupCount}</b> people with similar journey <br/> like you have lost <b>${averageWeightLoss}kg in 60 days.</b></span>`;
    } else if (daysDifference % 2 == 1) {
      motivationText = `<span><b>${peerGroupCount}</b> people with similar journey <br/> like you have lost <b>${averageWeightLoss}kg in 60 days.</b></span>`;
    }
    return res.status(200).json({
      status: true,
      message: "Peer Group Comparison Data",
      data: {
        video_url:
          userDetails[0].home_screen_video == 0
            ? "https://res.cloudinary.com/dg4wzx8c8/video/upload/v1759557096/app_images/suwhogqwa4xr8jaag0b0.mp4"
            : "",
        peerGroup: peerGroupCount,
        Motivation_section: {
          section_title: "Peer Group Update",
          section_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759495192/app_images/haebz3vhq5iactlvxfxe.png",
          section_text: motivationText,
          redirect_screen: "peer_group",
          redirect_params: {
            redirect_id: "",
          },
        },
      },
    });
  } catch (error) {
    console.error("Error in getPeerGroupDetails:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const submitStepAndSleepTracker = async (req, res, next) => {
  const { user_id, date, steps_count, sleeping_minutes } = req.body;

  const userTrackerDetailstable = tables.userDailyTracker;
  const selectuserTrackerDetailsColumns = ["daily_tracker_id"];
  const userTrackerDetailsWhereCondition = [
    {
      field: `DATE(date)`,
      operator: `=`,
      value: moment(date).format("YYYY-MM-DD"),
    },
    { field: `user_id`, operator: `=`, value: user_id },
  ];
  const { results: userTrackerDetails } = await readRecord({
    table: `${userTrackerDetailstable}`,
    selectFields: selectuserTrackerDetailsColumns,
    conditions: userTrackerDetailsWhereCondition,
  });

  if (userTrackerDetails.length === 0) {
    // Insert new tracker record

    const columns = ["user_id", "date", "steps_count", "sleep_duration"];
    const values = [user_id, date, steps_count, sleeping_minutes];
    const insertedResult = await insertRecord(
      tables.userDailyTracker,
      columns,
      values,
    );
    if (insertedResult.affectedRows === 1) {
      return res.status(200).json({
        status: true,
        message: "Tracker record inserted successfully",
      });
    }
  } else {
    // Update existing tracker record
    const condition = {
      daily_tracker_id: parseInt(userTrackerDetails[0].daily_tracker_id),
    };
    // Perform the database update
    const updateData = {
      steps_count,
      sleep_duration: sleeping_minutes,
    };

    const updatedResult = await updateRecord(
      `${tables.userDailyTracker}`,
      filterObjectRemoveNullValues(updateData),
      condition,
    );
    if (updatedResult) {
      return res.status(200).json({
        status: true,
        message: "Tracker record updated successfully",
      });
    }
  }
};

const getLeadHomeScreen = async (req, res, next) => {
  const { user_id } = req.body;

  let upper_section = [];
  //   //fetch lead details
  const userDetailstable = tables.userDetails;
  const selectUserDetailsColumns = ["*"];
  const userDetailsWhereCondition = [
    { field: `user_id`, operator: `=`, value: user_id },
  ];
  const { results: userDetails } = await readRecord({
    table: `${userDetailstable}`,
    selectFields: selectUserDetailsColumns,
    conditions: userDetailsWhereCondition,
  });

  //fetch lead latest HS
  const healthScoreTable = tables.healthScoreClient;
  const selecthealthScoreColumns = ["*"];
  const healthScoreWhereCondition = [
    { field: `user_id`, operator: `=`, value: user_id },
    {
      field: `DATE(created)`,
      operator: `>=`,
      value: `DATE(CURDATE() - INTERVAL 21 DAY)`,
      raw: true,
    },
  ];
  const { results: healthScoreDetails } = await readRecord({
    table: `${healthScoreTable}`,
    selectFields: selecthealthScoreColumns,
    conditions: healthScoreWhereCondition,
    orderBy: ["id DESC"],
  });
  console.log(healthScoreDetails[0], 333444);

  //fetch lead consultation details
  const callDetailsTable = tables.callUpdates;
  const selectcallDetailsColumns = [
    `cu.call_id`,
    `cu.schedule_date as call_schedule_date`,
    `cu.call_type`,
    `cu.call_status`,
    `cu.added_by`,
    `slot.appointment_slots`,
    `cu.extra_questions_id`,
    `cu.feedback_filled`,
  ];
  const callDetailsWhereCondition = [
    { field: `user_id`, operator: `=`, value: user_id },
    { field: `call_type`, operator: `=`, value: "30" },
    {
      field: `DATE(schedule_date)`,
      operator: `>=`,
      value: `DATE(CURDATE() - INTERVAL 15 DAY)`,
      raw: true,
    },
  ];
  const { results: callDetails } = await readRecord({
    table: `${callDetailsTable} as cu`,
    selectFields: selectcallDetailsColumns,
    joins: [
      {
        type: `LEFT`,
        table: `${tables.slots} slot`,
        on: `slot.id = cu.slot_id`,
      },
    ],
    conditions: callDetailsWhereCondition,
    orderBy: ["cu.call_id DESC"],
  });

  console.log(callDetails, 444555);

  //fetch suggested program
  const suggestedProgramTable = tables.suggestedProgram;
  const selectsuggestedProgramColumns = [
    "spg.program_id",
    "pm.app_program_banner",
  ];
  const suggestedProgramWhereCondition = [
    {
      field: `suggested_program_id`,
      operator: `=`,
      value: userDetails[0].suggested_program_id,
    },
  ];
  const { results: suggestedProgramDetails } = await readRecord({
    table: `${suggestedProgramTable} as spg`,
    selectFields: selectsuggestedProgramColumns,
    joins: [
      {
        type: `LEFT`,
        table: `${tables.programsMaster} pm`,
        on: `spg.program_id = pm.program_id`,
      },
    ],
    conditions: suggestedProgramWhereCondition,
  });
  console.log(suggestedProgramDetails, 223344);

  //fetch random counsellors
  const counsellorListTable = tables.adminUsers;
  const selectcounsellorListColumns = [
    "admin_user_id as counsellor_id",
    "first_name",
    "photo",
  ];
  const counsellorListWhereCondition = [
    // { field: `role_id`, operator: `=`, value: "2" }, //role ID 2 is for counsellors
    { field: `is_active`, operator: `=`, value: "1" },
  ];

  if (
    userDetails[0].user_status == "Completed" &&
    userDetails[0].mentor_assigned !== null &&
    userDetails[0].mentor_assigned !== 0
  ) {
    counsellorListWhereCondition.push({
      field: `admin_user_id`,
      operator: `=`,
      value: userDetails[0].mentor_assigned,
    });
  } else if (
    userDetails[0].counsellor_assigned !== null &&
    userDetails[0].counsellor_assigned !== 0
  ) {
    counsellorListWhereCondition.push({
      field: `admin_user_id`,
      operator: `=`,
      value: userDetails[0].counsellor_assigned,
    });
  }
  const { results: counsellorList } = await readRecord({
    table: `${counsellorListTable}`,
    selectFields: selectcounsellorListColumns,
    conditions: counsellorListWhereCondition,
  });

  const randomCounsellor =
    counsellorList[Math.floor(Math.random() * counsellorList.length)];
  const photoArray = JSON.parse(randomCounsellor.photo); // Convert string to array
  const counsellorImagePath = photoArray[0].file.path; // Extract the path

  //fetch Admin Details
  let message,
    image,
    button_title,
    redirect_screen,
    redirect_params,
    section_id;

  if (callDetails.length === 0) {
    if (
      userDetails[0].user_status == "Completed" &&
      userDetails[0].mentor_assigned !== null
    ) {
      message = `<span style='font-weight: bold; font-size: 16px;'>Call the Expert</span><br><span style='font-size: 14px;'>Start your next journey again with Mentor ${randomCounsellor.first_name}</span>`;
      image = counsellorImagePath;
      button_title = "Book a Call";
      redirect_screen = "book_appointment";
      redirect_params = {
        call_type: 30,
      };
      section_id = "";
    } else {
      //if consultation is not booked or booked consultation was before 15 days
      message =
        "<span style='font-weight: bold; font-size: 16px;'>Let's get one step closer to a healthier you!</span>";
      image = counsellorImagePath;
      button_title = "Book a Call";
      console.log(userDetails, 202020202);
      if (
        userDetails[0].counsellor_assigned == null ||
        userDetails[0].counsellor_assigned == 0
      ) {
        redirect_screen = "call_booking";
        redirect_params = {};
      } else {
        redirect_screen = "book_appointment";
        redirect_params = {
          call_type: 30,
        };
      }
      section_id = "";
    }
  } else {
    //Consultation booked and extra questions are not answered yet
    if (callDetails[0].call_status == "0") {
      image = counsellorImagePath;
      if (userDetails[0].user_status == "Completed") {
        button_title = "";
      } else {
        button_title = "Answer Now";
      }

      redirect_screen = "";
      redirect_params = {};

      if (
        moment(callDetails[0].call_schedule_date).format(`DD-MM-YYYY`) ===
        moment().format("DD-MM-YYYY")
      ) {
        if (callDetails[0].extra_questions_id === null) {
          message = `<span style='font-weight: bold; font-size: 16px; line-height: 22px;'>Your call is scheduled for ${
            callDetails[0].appointment_slots.split(" - ")[0]
          } today.</span><br><span style='font-size: 14px;'>Help ${
            randomCounsellor.first_name
          } know you a little better.</span>`;
          if (userDetails[0].user_status == "Completed") {
            button_title = "";
          } else {
            button_title = "Answer Now";
          }

          redirect_screen = "";
          redirect_params = {};
          section_id = "consultation_card";
        } else {
          message = `<span style='font-weight: bold; font-size: 16px;'>Your call is scheduled for ${
            callDetails[0].appointment_slots.split(" - ")[0]
          } today.</span>`;
          button_title = "Reschedule";
          redirect_screen = "book_appointment";
          redirect_params = {
            call_type: 30,
          };
          section_id = "";
        }
      } else {
        if (callDetails[0].extra_questions_id === null) {
          message = `<span style='font-weight: bold; font-size: 16px; line-height: 22px;'>Your call is scheduled!</span><br><span style='font-size: 14px; line-height: 22px;'>${moment(
            callDetails[0].call_schedule_date,
          ).format(`Do MMMM YYYY`)} ${
            callDetails[0].appointment_slots.split(" - ")[0]
          }</span><br><span style='font-size: 14px;'> ${
            randomCounsellor.first_name
          } wants to know you a little better</span>`;
          if (userDetails[0].user_status == "Completed") {
            button_title = "";
          } else {
            button_title = "Answer Now";
          }

          redirect_screen = "";
          redirect_params = {};
          section_id = "consultation_card";
        } else {
          message = `<span style='font-weight: bold; font-size: 18px;line-height: 22px;'>Your call is scheduled!</span><br><span style='font-weight: bold; font-size: 14px;line-height: 22px;'>${moment(
            callDetails[0].call_schedule_date,
          ).format(`Do MMMM YYYY`)} ${
            callDetails[0].appointment_slots.split(" - ")[0]
          }</span>`;
          button_title = "";
          redirect_screen = "";
          redirect_params = {};
          section_id = "";
        }
      }
    } else if (callDetails[0].call_status == "4") {
      //When call is missed
      message = `<span style='font-weight: bold; font-size: 15px;'>You missed your consultation.</span><br><span style='font-size: 14px;'>${randomCounsellor.first_name} is ready to reconnect!</span>`;
      image = counsellorImagePath;
      button_title = "Reschedule";
      redirect_screen = "book_appointment";
      redirect_params = {
        call_type: 30,
      };
      section_id = "";
    }
  }

  let mentor_booking_section = {
    message,
    image,
    button_title,
    redirect_screen,
    redirect_params,
    section_id,
  };
  let program_section = [];
  if (
    callDetails.length > 0 &&
    callDetails[0].call_status == "1" &&
    suggestedProgramDetails.length !== 0
  ) {
    mentor_booking_section = {};

    //Fetch Suggested Program Details
    program_section = [
      {
        image: suggestedProgramDetails[0].app_program_banner,
        redirect_screen_name: "program",
        screen_params: {
          program_id: suggestedProgramDetails[0].program_id,
        },
      },
    ];
  }
  let feedback_type = "";

  if (
    callDetails.length > 0 &&
    callDetails[0].call_status == "1" &&
    callDetails[0].feedback_filled == "0"
  ) {
    feedback_type = "Consultation";
  }
  const lead_added_date = userDetails[0].added_date;
  const add7Days = moment(lead_added_date).add(7, "days").format("YYYY-MM-DD");
  const current_date = moment().format("YYYY-MM-DD");

  if (
    userDetails[0].lead_app_feedback == "0" &&
    moment(current_date).isSameOrAfter(add7Days)
  ) {
    feedback_type = "App";
  }

  //Offer Card
  const featureActivationtable = tables.leadsActivatedFeatures;
  const selectfeatureActivationColumns = ["*"];
  const featureActivationWhereCondition = [
    { field: `user_id`, operator: `=`, value: user_id },
  ];
  const { results: activatedFeatures } = await readRecord({
    table: `${featureActivationtable}`,
    selectFields: selectfeatureActivationColumns,
    conditions: featureActivationWhereCondition,
  });

  console.log(activatedFeatures.length, 1313131);
  let couponActivationDetails,
    recipeBookActivationDetails,
    spinToWinActivationDetails,
    guidesActivationDetails = "";
  if (activatedFeatures.length > 0) {
    couponActivationDetails = JSON.parse(activatedFeatures[0].coupon);
    recipeBookActivationDetails = activatedFeatures[0].recipe_book;
    spinToWinActivationDetails = JSON.parse(activatedFeatures[0].spin_to_win);
    guidesActivationDetails = activatedFeatures[0].guides;
  }

  console.log(couponActivationDetails, 333333);
  console.log(spinToWinActivationDetails, 4444444);
  let couponStartDate,
    couponEndDate,
    spinStartDate,
    spinEndDate = "";
  let offer_section = "";

  if (
    couponActivationDetails &&
    moment(couponActivationDetails.end_date).format(`DD-MM-YYYY`) >=
      moment().format("DD-MM-YYYY")
  ) {
    console.log("Coupon");
    couponStartDate = couponActivationDetails.start_date;
    couponEndDate = couponActivationDetails.end_date;

    if (
      moment(couponStartDate).format(`DD-MM-YYYY`) ===
      moment().format("DD-MM-YYYY")
    ) {
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Coupon Unlocked!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: "Redeem & get 20% off",
        button_title: "Claim Now",
        redirect_screen: "program",
        redirect_params: {
          program_id:
            suggestedProgramDetails.length > 0
              ? suggestedProgramDetails[0].program_id
              : "91",
        },
      };
    } else if (
      moment(couponEndDate).format(`DD-MM-YYYY`) ===
      moment().format("DD-MM-YYYY")
    ) {
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Coupon Expiring Soon!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: "Use it on your next program now!",
        button_title: "Claim Now",
        redirect_screen: "program",
        redirect_params: {
          program_id:
            suggestedProgramDetails.length > 0
              ? suggestedProgramDetails[0].program_id
              : "91",
        },
      };
    } else if (
      moment(couponEndDate).format(`DD-MM-YYYY`) > moment().format("DD-MM-YYYY")
    ) {
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Redeem & Save Big!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: `${userDetails[0].my_wallet} Wallet + Coupon Discount`,
        button_title: "Claim Now",
        redirect_screen: "program",
        redirect_params: {
          program_id:
            suggestedProgramDetails.length > 0
              ? suggestedProgramDetails[0].program_id
              : "91",
        },
      };
    }
  } else if (
    spinToWinActivationDetails &&
    moment(spinToWinActivationDetails.end_date).format(`DD-MM-YYYY`) >=
      moment().format("DD-MM-YYYY")
  ) {
    console.log("Spin");

    spinStartDate = spinToWinActivationDetails.start_date;
    spinEndDate = spinToWinActivationDetails.end_date;

    if (
      moment(spinStartDate).format(`DD-MM-YYYY`) ===
      moment().format("DD-MM-YYYY")
    ) {
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Your spin is live!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: "Your reward is one tap away!",
        button_title: "Claim Now",
        redirect_screen: "spin_to_win",
        redirect_params: {},
      };
    } else if (
      moment(spinEndDate).format(`DD-MM-YYYY`) === moment().format("DD-MM-YYYY")
    ) {
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Last Chance to Spin!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: "Reward window closes today.",
        button_title: "Claim Now",
        redirect_screen: "spin_to_win",
        redirect_params: {},
      };
    } else if (
      moment(spinEndDate).format(`DD-MM-YYYY`) > moment().format("DD-MM-YYYY")
    ) {
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Spin Live Only For 2 Days!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: "Spin & Win exciting rewards.",
        button_title: "Claim Now",
        redirect_screen: "spin_to_win",
        redirect_params: {},
      };
    }
  }

  const spinRewardtable = tables.prizeDetails;
  const selectspinRewardColumns = ["*"];
  const spinRewardWhereCondition = [
    { field: `user_id`, operator: `=`, value: user_id },
  ];
  const { results: spinRewardDetails } = await readRecord({
    table: `${spinRewardtable}`,
    selectFields: selectspinRewardColumns,
    conditions: spinRewardWhereCondition,
  });

  let spin_reward_date, spin_reward;
  let add_3_days;
  if (spinRewardDetails.length > 0) {
    spin_reward_date = moment(spinRewardDetails[0].added_date).format(
      `YYYY-MM-DD`,
    );
    add_3_days = moment(spin_reward_date).add(3, "days").format(`YYYY-MM-DD`);
    if (moment().format(`YYYY-MM-DD`) <= add_3_days) {
      spin_reward = spinRewardDetails[0].prize;
      offer_section = {
        message:
          '<span style="font-weight: bold; font-size: 16px;">Double Discount Unlocked!</span>',
        offer_image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
        valid_till: `${userDetails[0].my_wallet} Wallet + ${spin_reward}`,
        button_title: "Claim Now",
        redirect_screen: "program",
        redirect_params: {
          program_id:
            suggestedProgramDetails.length > 0
              ? suggestedProgramDetails[0].program_id
              : "91",
        },
      };
    }
  }
  //Content Section

  const conditions = [
    { field: `social_post.post_sub_type`, operator: `=`, value: `Tips` },
    {
      field: `social_post.image`,
      operator: `IS NOT`,
      value: null,
      raw: true,
    },
  ];

  const { results: randomSocialPost } = await readRecord({
    table: `${tables.socialPost} social_post`,
    selectFields: [
      `social_post.id`,
      `social_post.title`,
      `social_post.description`,
      `social_post.post_link`,
      `social_post.posted_on`,
      `social_post.video`,
      `social_post.image`,
    ],
    conditions,
    pagination: { limit: 3 },
    orderBy: [`RAND()`],
  });

  const socialPostConditions = [
    { field: `social_post.post_type`, operator: `=`, value: `reel` },
    {
      field: `social_post.thumbnail_image`,
      operator: `IS NOT`,
      value: null,
      raw: true,
    },
  ];

  const { results: randomReelPost } = await readRecord({
    table: `${tables.socialPost} social_post`,
    selectFields: [`social_post.*`],
    conditions: socialPostConditions,
    pagination: { limit: 3 },
    orderBy: [`RAND()`],
  });

  const { results: latestRecipe } = await readRecord({
    table: `${tables.recipe} r`,
    selectFields: [
      `r.id`,
      `r.title`,
      `r.recipe_images`,
      `rt.title as recipe_type_name`,
      `rc.category_name `,
      `r.health_meter`,
      `rt.icon`,
    ],
    joins: [
      {
        type: `LEFT`,
        table: `${tables.recipe_type} rt`,
        on: `r.recipe_type_id = rt.id`,
      },
      {
        type: `LEFT`,
        table: `${tables.category} rc`,
        on: `r.category_id = rc.category_id `,
      },
    ],
    pagination: { limit: 3 },
  });

  console.log(latestRecipe[1], 212121212121);

  const { results: randomHealthRead } = await readRecord({
    table: `${tables.blogPosts} bp`,
    selectFields: [
      `bp.postID `,
      `bp.postTitle`,
      `bp.postBannerSmall`,
      `bp.seoDescription`,
      `bp.postDate`,
      `bp.view_count`,
    ],

    orderBy: [`RAND()`],
    pagination: { limit: 3 },
  });

  console.log(healthScoreDetails, 6767676767);
  let gender = "";
  if (healthScoreDetails.length > 0) {
    gender = healthScoreDetails[0].gender;
  } else {
    gender = "female";
  }

  // if (userDetails[0].gender != null && userDetails[0].gender == "1") {
  //   gender = "male";
  // } else {
  //   gender = "female";
  // }

  const { results: successStories } = await readRecord({
    selectFields: ["*"],
    table: "success_stories",
    conditions: [
      { field: "status", operator: "=", value: "active" }, // Only active success stories
      { field: "is_deleted", operator: "=", value: 0 }, // Ensure success story is not deleted
      {
        field: "client_details",
        operator: "LIKE",
        value: `'%"gender":"${gender}"%'`,
        raw: true,
      },
    ],
    orderBy: [`RAND()`],
    pagination: { limit: 3 },
  });
  console.log(successStories, 123456789);
  //Latest weight update
  const { results: latestWeightDetails } = await readRecord({
    selectFields: ["*"],
    table: "weight_records_lead",
    conditions: [{ field: "user_id", operator: "=", value: user_id }],
    orderBy: [`id DESC`],
    pagination: { limit: 1 },
  });
  let current_weight = "";
  const { results: milestoneDetails } = await readRecord({
    selectFields: ["*"],
    table: "user_milestones",
    conditions: [{ field: "user_id", operator: "=", value: user_id }],
    orderBy: [`milestone_id DESC`],
    pagination: { limit: 1 },
  });

  const { results: weeklyProgress } = await readRecord({
    selectFields: [
      "l.user_id",
      "ROUND(l.avg_steps - p.avg_steps, 0) AS step_diff",
      "ROUND(l.avg_sleep - p.avg_sleep, 0) AS sleep_diff",
      "ROUND(l.avg_water - p.avg_water, 1) AS water_diff",
    ],
    table: `
        (
          SELECT 
            user_id,
            AVG(steps_count) AS avg_steps,
            AVG(sleep_duration) AS avg_sleep,
            AVG(water_intake) AS avg_water,
            COUNT(*) AS entry_count
          FROM user_daily_tracker
          WHERE date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE() - INTERVAL 1 DAY
          GROUP BY user_id
        ) AS l
        JOIN (
          SELECT 
            user_id,
            AVG(steps_count) AS avg_steps,
            AVG(sleep_duration) AS avg_sleep,
            AVG(water_intake) AS avg_water,
            COUNT(*) AS entry_count
          FROM user_daily_tracker
          WHERE date BETWEEN CURDATE() - INTERVAL 14 DAY AND CURDATE() - INTERVAL 8 DAY
          GROUP BY user_id
        ) AS p
        ON l.user_id = p.user_id
      `,
    conditions: [
      { field: "l.entry_count", operator: "=", value: 7 },
      { field: "p.entry_count", operator: "=", value: 7 },
    ],
    orderBy: ["l.user_id ASC"],
  });
  let water_diff, step_diff, sleep_diff;
  // ✅ Thresholds for meaningful improvement
  const thresholds = {
    water_diff: 2,
    step_diff: 1000,
    sleep_diff: 30,
  };

  // ✅ Message definitions (priority order)
  if (water_diff >= thresholds.water_diff) {
    upper_section = {
      title: `Good Job!`,
      description: [`Water intake up! Your consistency is paying off!`],
      health_score: {
        section_title: "Health Score",
        subtitle: motivation_text,
        score: healthScoreDetails[0].overall_health_score,
        color: hs_color,
        image_url: "",
      },
      redirection: {},
      bottom_text: "",
    };
  } else if (step_diff >= thresholds.step_diff) {
    upper_section = {
      title: `Keep It Up!`,
      description: [`Step count up - you’re moving more this week!`],
      health_score: {
        section_title: "Health Score",
        subtitle: motivation_text,
        score: healthScoreDetails[0].overall_health_score,
        color: hs_color,
        image_url: "",
      },
      redirection: {},
      bottom_text: "",
    };
  } else if (sleep_diff >= thresholds.sleep_diff) {
    upper_section = {
      title: `Well Done!`,
      description: [`You’re getting better rest - your body’s loving it!`],
      health_score: {
        section_title: "Health Score",
        subtitle: motivation_text,
        score: healthScoreDetails[0].overall_health_score,
        color: hs_color,
        image_url: "",
      },
      redirection: {},
      bottom_text: "",
    };
  }
  if (healthScoreDetails.length > 0) {
    if (healthScoreDetails[0].added_date < latestWeightDetails[0].added_date) {
      current_weight = healthScoreDetails[0].weight;
    } else {
      current_weight = latestWeightDetails[0].weight;
    }

    let goal_weight = healthScoreDetails[0].goal_weight;
    let away_from_goal = Math.abs(goal_weight - current_weight);
    let health_score = healthScoreDetails[0].overall_health_score;
    let weightLoss =
      healthScoreDetails[0].weight - latestWeightDetails[0].weight;
    let hs_color,
      motivation_text = "";
    if (health_score >= 90) {
      hs_color = "#216F35";
      motivation_text = "Excellent";
    } else if (health_score >= 71 && health_score <= 89) {
      hs_color = "#AAD53A";
      motivation_text = "Very Good";
    } else if (health_score >= 51 && health_score <= 70) {
      hs_color = "#F4AF2D";
      motivation_text = "Can Do Better";
    } else if (health_score >= 31 && health_score <= 50) {
      hs_color = "#9F6B09";
      motivation_text = "Needs Attention";
    } else if (health_score <= 30) {
      hs_color = "#E72A21";
      motivation_text = "Act NOW!";
    }

    if (healthScoreDetails[0].length > 0) {
      upper_section = {
        title: `Current Weight: ${current_weight}kg`,
        description: [
          `You are still ${Number(away_from_goal).toFixed(
            2,
          )}kg away from Ideal body weight`,
        ],
        health_score: {
          section_title: "Health Score",
          subtitle: motivation_text,
          score: healthScoreDetails[0].overall_health_score,
          color: hs_color,
          image_url: "",
        },
        redirection: {
          button_text: "View Report",
          redirect_screen: "lead_health_score_report",
          screen_params: {},
        },
        bottom_text: "",
      };
    }

    if (callDetails.length > 0 && callDetails[0].call_status == "4") {
      //When call is missed
      upper_section = {
        title: `Current Weight: ${current_weight}kg`,
        description: [
          `You are still ${Number(away_from_goal).toFixed(
            2,
          )}kg away from Ideal body weight`,
        ],
        health_score: {
          section_title: "Health Score",
          subtitle: motivation_text,
          score: healthScoreDetails[0].overall_health_score,
          color: hs_color,
          image_url: "",
        },
        redirection: {
          button_text: "View Report",
          redirect_screen: "lead_health_score_report",
          screen_params: {},
        },
        bottom_text: "",
      };
    }

    if (
      milestoneDetails.length > 0 &&
      moment().format(`YYYY-MM-DD`) <=
        moment(milestoneDetails[0].added_date).add(2, "days")
    ) {
      upper_section = {
        title: `Your Milestones.`,
        description: milestoneDetails[0].milestones,
        health_score: {
          section_title: "Health Score",
          subtitle: motivation_text,
          score: healthScoreDetails[0].overall_health_score,
          color: hs_color,
          image_url: "",
        },
        redirection: {},
        bottom_text: "Progress starts with consistency.",
      };
    }

    const diffInDays = Math.abs(
      moment(latestWeightDetails[0].added_date).format(`YYYY-MM-DD`) -
        moment(healthScoreDetails[0].added_date).format(`YYYY-MM-DD`),
      "days",
    );

    if (
      moment(latestWeightDetails[0].added_date).format(`YYYY-MM-DD`) <=
        moment(latestWeightDetails[0].added_date).add(2, "days") &&
      milestoneDetails[0].length > 0
    ) {
      if (weightLoss >= 0) {
        upper_section = {
          title: `Diets and insta hacks not working for you? `,
          description: [
            `Its time you get a personalised plan that’s designed for your body and habits!`,
          ],
          health_score: {
            section_title: "Health Score",
            subtitle: motivation_text,
            score: healthScoreDetails[0].overall_health_score,
            color: hs_color,
            image_url: "",
          },
          redirection: {
            button_text: "Chat with Counsellor",
            redirect_screen: "mentor_chat",
            screen_params: {},
          },
          bottom_text: "Progress starts with consistency.",
        };
      } else if (weightLoss < 0 && Math.abs(weightLoss) >= 2) {
        upper_section = {
          title: `Well Done!`,
          description: [
            `You’ve successfully lost ${weightLoss}kg in just ${diffInDays} days! You're only ${away_from_goal}kg away from your goal weight!`,
          ],
          health_score: {
            section_title: "Health Score",
            subtitle: motivation_text,
            score: healthScoreDetails[0].overall_health_score,
            color: hs_color,
            image_url: "",
          },
          redirection: {},
          bottom_text: "Progress starts with consistency.",
        };
      }
    }
    if (upper_section.length == 0) {
      upper_section = {
        title: `Current Weight: ${current_weight}kg`,
        description: [
          `You are still ${Number(away_from_goal).toFixed(
            2,
          )}kg away from Ideal body weight`,
        ],
        health_score: {
          section_title: "Health Score",
          subtitle: motivation_text,
          score: healthScoreDetails[0].overall_health_score,
          color: hs_color,
          image_url: "",
        },
        redirection: {
          button_text: "View Report",
          redirect_screen: "lead_health_score_report",
          screen_params: {},
        },
        bottom_text: "",
      };
    }
  } else {
    upper_section = {
      title: `Know Your Health.`,
      description: [`Get your health score curated by our team of Experts.`],
      health_score: {
        section_title: "",
        subtitle: "",
        score: "",
        color: "",
        image_url:
          "https://bncleanse.com/bn-api-new/images/lead_home_screen/weighing_icon.png",
      },
      redirection: {
        button_text: "Get Now",
        redirect_screen: "take_health_score",
        screen_params: {},
      },
      bottom_text: "",
    };
  }

  const condition = { user_id: user_id };
  // Perform the database update
  const userUpdateData = {
    app_last_visit_date: moment().format("YYYY-MM-DD HH:mm:ss"),
  };

  const updateUserDetailResult = await updateRecord(
    `${tables.userDetails}`,
    filterObjectRemoveNullValues(userUpdateData),
    condition,
  );

  const { results: leadActivatedFeature } = await readRecord({
    selectFields: ["*"],
    table: "leads_activated_features",
    conditions: [{ field: "user_id", operator: "=", value: user_id }],
    orderBy: [`id DESC`],
  });
  console.log(leadActivatedFeature, 100100100);
  let guides = [];
  if (leadActivatedFeature.length > 0) {
    guides = JSON.parse(leadActivatedFeature[0].guides ?? "[]");
  }

  const currentDate = moment().format("YYYY-MM-DD");
  let recipe_book_array = {
    top_name: "Recipe",
    bottom_name: "Book",
    redirect_id: "",
    image: "https://bncleanse.com/images/Recipe_book.png",
    notification_flag: false,
    redirect_screen: "go_pro",
    screen_params: {
      link: "",
      screen_title: "",
    },
    section_id: "",
  };
  let restaurant_redirect_id = "1";
  let alcohol_redirect_id = "4";
  let eatinportion_redirect_id = "3";
  let faq_redirect_id = "5";
  let daily_essentials_redirect_id = "2";
  let lead_redirect_screen = "lead ekit guide";
  let otherGuidesActivated = [];
  if (guides.length > 0) {
    guides.forEach((guide) => {
      if (guide.guide_id == 81) {
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
          recipe_book_array = {
            top_name: "Recipe",
            bottom_name: "Book",
            redirect_id: "",
            image: "https://bncleanse.com/images/Recipe_book.png",
            notification_flag: false,
            redirect_screen: "Recipe Add Chapter",
            screen_params: {
              link: "",
              screen_title: "",
            },
            section_id: "",
          };
        }
      } else if (guide.guide_id == 82) {
        //Alcohol Guide
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
          alcohol_redirect_id = `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_id}`;
          lead_redirect_screen = "webview";
        }
      } else if (guide.guide_id == 83) {
        //Restaurant Guide
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
          restaurant_redirect_id = `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`;
          lead_redirect_screen = "webview";
        }
      } else if (guide.guide_id == 84) {
        //Daily Essentials
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
          daily_essentials_redirect_id =
            "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-daily-essentials";
          lead_redirect_screen = "webview";
        }
      } else if (guide.guide_id == 85) {
        //FAQ
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
          faq_redirect_id =
            "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-faqs";
          lead_redirect_screen = "webview";
        }
      } else if (guide.guide_id == 86) {
        //Eat In Portion
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
          eatinportion_redirect_id =
            "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-eat-in-portions";
          lead_redirect_screen = "webview";
        }
      } else {
        if (currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")) {
        }
      }
    });
  }

  //Free Access Starts Here
  alcohol_redirect_id = `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_id}`;
  lead_redirect_screen = "webview";

  restaurant_redirect_id = `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`;
  lead_redirect_screen = "webview";

  recipe_book_array = {
    top_name: "Recipe",
    bottom_name: "Book",
    redirect_id: "",
    image: "https://bncleanse.com/images/Recipe_book.png",
    notification_flag: false,
    redirect_screen: "Recipe Add Chapter",
    screen_params: {
      link: "",
      screen_title: "",
    },
    section_id: "",
  };
  //Free Access Ends Here
  let trackersAndEkits = [
    {
      top_name: "Diet",
      bottom_name: "Charts",
      redirect_id: "",
      image:
        "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/diet_chart_new.png",
      notification_flag: false,
      redirect_screen: "diet_details",
      screen_params: {
        link: "",
        screen_title: "Diet Chart",
      },
      section_id: "home_screen_diet",
    },
    {
      top_name: `Quick`,
      bottom_name: `Fillers`,
      redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
      image: `https://bncleanse.com/images/quickFillers.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
        screen_title: `Quick Fillers`,
      },
    },
    {
      top_name: "Alcohol",
      bottom_name: "Guide",
      // redirect_id:`https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_id}`,
      redirect_id: alcohol_redirect_id,
      image:
        "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/alcohol_guide.png",
      notification_flag: false,
      // redirect_screen: "webview",
      redirect_screen: lead_redirect_screen,
      screen_params: {
        link: alcohol_redirect_id,
        screen_title: "Alcohol Guide",
        redirect_id: alcohol_redirect_id,
      },
      section_id: "",
    },
    {
      top_name: "Restaurant",
      bottom_name: "Guide",
      // redirect_id:
      //   `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
      redirect_id: restaurant_redirect_id,
      image:
        "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png",
      notification_flag: false,
      redirect_screen: lead_redirect_screen,
      screen_params: {
        link: restaurant_redirect_id,
        screen_title: "Restaurant Guide",
        redirect_id: restaurant_redirect_id,
      },
      section_id: "home_screen_restaurant_guide",
    },
    recipe_book_array,
    {
      top_name: "Frequent",
      bottom_name: "Queries",
      // redirect_id:
      //   "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-faqs",
      redirect_id: faq_redirect_id,
      image:
        "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/bn_faq.png",
      notification_flag: false,
      redirect_screen: "lead ekit guide",
      screen_params: {
        link: faq_redirect_id,
        screen_title: "Ekit FAQs",
        redirect_id: faq_redirect_id,
      },
      section_id: "",
    },

    {
      top_name: `Photo`,
      bottom_name: `Tracker`,
      redirect_id: ``,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/photo_tracker_new.png`,
      notification_flag: false,
      redirect_screen: `photo_tracker_lead_oc`,
      screen_params: {},
      section_id: "",
    },
    {
      top_name: "Daily",
      bottom_name: "Essentials",
      // redirect_id:
      //   "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-daily-essentials",
      redirect_id: daily_essentials_redirect_id,
      image:
        "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/daily_essentials.png",
      notification_flag: false,
      redirect_screen: "lead ekit guide",
      screen_params: {
        link: daily_essentials_redirect_id,
        screen_title: "Ekit Daily Essentials",
        redirect_id: daily_essentials_redirect_id,
      },
      section_id: "",
    },
    {
      top_name: "Eat In",
      bottom_name: "Portions",
      // redirect_id:
      //   "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-eat-in-portions",
      redirect_id: eatinportion_redirect_id,
      image:
        "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/eat_n_portions.png",
      notification_flag: false,
      redirect_screen: "lead ekit guide",
      screen_params: {
        link: daily_essentials_redirect_id,
        screen_title: "Ekit Eat In Portions",
        redirect_id: daily_essentials_redirect_id,
      },
      section_id: "",
    },
  ];

  if (userDetails[0].user_type == "0") {
    trackersAndEkits = trackersAndEkits.filter(
      (item) => !(item.top_name === "Photo" && item.bottom_name === "Tracker"),
    );
  }
  console.log(userDetails, 1110000111000111);
  let middleSection = "";
  let weightComparisonSection, goalSection;
  const ocmiddleSection = await ocHomeMiddleSection({ userDetails });

  console.log(userDetails, 1100110011);
  if (userDetails[0].user_status == "Completed") {
    middleSection = ocmiddleSection;
    let pendingGoals = "";
    const { results: goalDetails } = await readRecord({
      table: `${tables.bnMyGoalsNew} gm`,
      selectFields: [
        "gm.id",
        "gm.user_id",
        "gm.sub_order_id",
        "gm.comment",
        "gm.added_date",
        "gm.updated_date",
      ],
      conditions: [{ field: "gm.user_id", operator: "=", value: user_id }],
      orderBy: ["gm.updated_date DESC"],
    });

    if (goalDetails.length > 0) {
      const { new_goals, goals_achieved, milestone_achieved } = JSON.parse(
        goalDetails[0].comment,
      );
      if (healthScoreDetails.length > 0) {
        let goal_weight = healthScoreDetails[0].goal_weight;
        let away_from_goal = Math.abs(goal_weight - current_weight);
        let health_score = healthScoreDetails[0].overall_health_score;
        let weightLoss =
          healthScoreDetails[0].weight - latestWeightDetails[0].weight;
        let hs_color,
          motivation_text = "";
        if (health_score >= 90) {
          hs_color = "#216F35";
          motivation_text = "Excellent";
        } else if (health_score >= 71 && health_score <= 89) {
          hs_color = "#AAD53A";
          motivation_text = "Very Good";
        } else if (health_score >= 51 && health_score <= 70) {
          hs_color = "#F4AF2D";
          motivation_text = "Can Do Better";
        } else if (health_score >= 31 && health_score <= 50) {
          hs_color = "#9F6B09";
          motivation_text = "Needs Attention";
        } else if (health_score <= 30) {
          hs_color = "#E72A21";
          motivation_text = "Act NOW!";
        }

        if (
          moment(goalDetails[0].updated_date).format("YYYY-MM-DD") ==
          moment().format("YYYY-MM-DD")
        ) {
          upper_section = {
            title: `Your New Goals`,
            description: new_goals,
            health_score: {
              section_title: "Health Score",
              subtitle: motivation_text,
              score: healthScoreDetails[0].overall_health_score,
              color: hs_color,
              image_url: "",
            },
            redirection: {
              button_text: "Achieve Now",
              redirect_screen: "mentor_chat",
              screen_params: {},
            },
            bottom_text: "",
          };
          goalSection = "";
        } else {
          upper_section = {
            title: `Goal You Are Yet to Achieve`,
            description: new_goals,
            health_score: {
              section_title: "Health Score",
              subtitle: motivation_text,
              score: healthScoreDetails[0].overall_health_score,
              color: hs_color,
              image_url: "",
            },
            redirection: {
              button_text:
                new_goals.length > 0 ? "Update New Goals" : "Add New Goals",
              redirect_screen: "my_goal_screen",
              screen_params: {},
            },
            bottom_text: "",
          };
        }
        goalSection = "";
      } else {
        goalSection = {
          goal_list: new_goals,
          button_text: "Start Again",
          redirect_screen: "mentor_chat",
          screen_params: {},
        };
        let redirection = "";

        console.log(new_goals, 123123123);
      }
    }

    const { results: weightRecords } = await readRecord({
      table: `${tables.weightRecords}`,
      selectFields: ["*"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["wmr_id DESC"],
    });

    let start_weight = userDetails[0].start_weight;
    let end_weight, goal_weight, weight_days_ago;
    if (healthScoreDetails.length > 0) {
      end_weight = healthScoreDetails[0].weight;
      goal_weight = healthScoreDetails[0].goal_weight;
      weight_days_ago = moment().diff(
        moment(healthScoreDetails[0].created),
        "days",
      );
    } else {
      const { results: leadWeightRecords } = await readRecord({
        table: `${tables.weightRecordsLead}`,
        selectFields: ["*"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
        orderBy: ["id DESC"],
      });
      if (
        leadWeightRecords.length > 0 &&
        moment(weightRecords[0].added_date).format("YYYY-MM-DD") <
          moment(leadWeightRecords[0].added_date).format("YYYY-MM-DD")
      ) {
        end_weight = leadWeightRecords[0].weight;
        goal_weight = userDetails[0].goal_weight;
        weight_days_ago = moment().diff(
          moment(leadWeightRecords[0].added_date),
          "days",
        );
      } else {
        if (weightRecords.length > 0) {
          end_weight = weightRecords?.[0].weight;
          goal_weight = userDetails[0].goal_weight;
          weight_days_ago = moment().diff(
            moment(weightRecords?.[0].added_date),
            "days",
          );
        } else {
          end_weight = "0";
          goal_weight = 0;
          weight_days_ago = "";
        }
      }
    }
    const { results: programDetails } = await readRecord({
      table: `${tables.subOrderPrograms}`,
      selectFields: ["expiry_date"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["expiry_date DESC"],
    });

    let program_ended_ago = moment().diff(
      moment(programDetails[0].expiry_date),
      "days",
    );

    weightComparisonSection = {
      start_weight_title: "Start Weight",
      start_weight_value: start_weight,
      last_weight_title: `${Math.abs(program_ended_ago)} Days Ago`,
      last_weight_value: end_weight,
      ideal_weight_title: "Goal Weight",
      ideal_weight_value: goal_weight,
      button_text: "Start Again",
      redirect_screen: "mentor_chat",
      screen_params: {},
    };
  } else {
    middleSection = {
      title: "Diets, E-Kits & Guides",
      color: "#EDFEFF",
      trackers_and_ekit: trackersAndEkits,
    };
    weightComparisonSection = "";
    goalSection = "";
  }
  if (userDetails[0].user_status == "Completed") {
    feedback_type = "";
  }
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Lead App Home Screen",
    data: {
      user_type: userDetails[0].user_status,
      notifications: [
        {
          type: "restaurant_guide",
          notification_date: "2025-09-11",
          notification_time: "19:30",
          title: "Taco on your mind?",
          description: `Explore our entire Mexican cuisine guide to discover the healthiest options!`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
          screen_title: "Restaurant Guide",
          send_notification: true,
        },
        {
          type: "restaurant_guide",
          notification_date: "2025-09-12",
          notification_time: "19:30",
          title: "Did you know?",
          description: `Your pita just pulled a carb-heavy stunt - 40g of carbs! But hey, it's flexing a little 7g of protein too. Balance that hummus dip wisely.`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
          screen_title: "Restaurant Guide",
          send_notification: true,
        },
        {
          type: "restaurant_guide",
          notification_date: "2025-09-13",
          notification_time: "19:30",
          title: "Craving Veg Fried Rice or Veg Hakka Noodles?",
          description: `Let's see which one's actually the healthier pick for you!`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
          screen_title: "Restaurant Guide",
          send_notification: true,
        },
        {
          type: "restaurant_guide",
          notification_date: "2025-09-14",
          notification_time: "19:30",
          title: "Aam Ras, Gajar Ka Halwa, Kheer, Dudh Pak",
          description: `All your favorite Gujarati desserts are delicious, but do you know what's inside each one? Let's find out!`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
          screen_title: "Restaurant Guide",
          send_notification: true,
        },
        {
          type: "restaurant_guide",
          notification_date: "2025-09-15",
          notification_time: "19:30",
          title: "Munch at the movies and still eat healthy - possible?",
          description: `ABSOLUTELY! 🍿 Let us show you what the healthy options are!`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
          screen_title: "Restaurant Guide",
          send_notification: true,
        },

        {
          type: "did_you_know",
          notification_date: "2025-09-11",
          notification_time: "11:30",
          title: "Did You Know?",
          description: `Avocado helps in blood pressure...`,
          redirect: "tip_of_the_day",
          redirect_id: `319`,
          screen_title: "Did You Know?",
          send_notification: true,
        },

        {
          type: "did_you_know",
          notification_date: "2025-09-12",
          notification_time: "10:30",
          title: "6 Super foods that will help you combat bloating",
          description: `Find out now!`,
          redirect: "tip_of_the_day",
          redirect_id: `146`,
          screen_title: "Did You Know?",
          send_notification: true,
        },
        {
          type: "did_you_know",
          notification_date: "2025-09-13",
          notification_time: "10:30",
          title: "A magical spice in your kitchen!",
          description: `One spice. A bunch of health perks. And yes - you already have it at home.`,
          redirect: "tip_of_the_day",
          redirect_id: `268`,
          screen_title: "Did You Know?",
          send_notification: true,
        },
        {
          type: "did_you_know",
          notification_date: "2025-09-14",
          notification_time: "10:30",
          title: "Fiber? Blessing or Curse?",
          description: `Find out the truth now.`,
          redirect: "tip_of_the_day",
          redirect_id: `247`,
          screen_title: "Did You Know?",
          send_notification: true,
        },
        {
          type: "recipe",
          notification_date: "2025-09-11",
          notification_time: "13:30",
          title: "Iron-Rich Jowar & Bajra Roti for Lunch",
          description: `This roti made from jowar and bajra flours is rich in iron. Balanced & flavorful for afternoon.`,
          redirect: "recipe_details",
          redirect_id: `470`,
          screen_title: "",
          send_notification: true,
        },
        {
          type: "recipe",
          notification_date: "2025-09-12",
          notification_time: "12:30",
          title: "Iron-Rich Jowar & Bajra Roti for Lunch",
          description: `This roti made from jowar and bajra flours is rich in iron. Balanced & flavorful for afternoon.`,
          redirect: "recipe_details",
          redirect_id: `470`,
          screen_title: "",
          send_notification: true,
        },
        {
          type: "recipe",
          notification_date: "2025-09-13",
          notification_time: "12:30",
          title: "This recipe is truly a powerhouse of nutrition!",
          description: `Light yet satisfying for your afternoon.`,
          redirect: "recipe_details",
          redirect_id: `573`,
          screen_title: "",
          send_notification: true,
        },
        {
          type: "recipe",
          notification_date: "2025-09-14",
          notification_time: "22:30",
          title: "Sleep Better with Chamomile & Tulsi Tea",
          description: `A calming, stress-reducing drink that promotes relaxation.`,
          redirect: "recipe_details",
          redirect_id: `1700`,
          screen_title: "",
          send_notification: true,
        },
        {
          type: "recipe",
          notification_date: "2025-09-15",
          notification_time: "09:30",
          title: "Light yet satisfying for your morning.",
          description: `This recipe is very high in fiber. Check now.`,
          redirect: "recipe_details",
          redirect_id: `191`,
          screen_title: "",
          send_notification: true,
        },
        {
          type: "quick_filler",
          notification_date: "2025-09-11",
          notification_time: "16:30",
          title: "Peda facts!",
          description:
            "3.7g protein, 9g carbs, 4.7g fat per piece. Get the full breakdown of popular desi sweets.",
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
          screen_title: "Quick Fillers",
          send_notification: true,
        },
        {
          type: "quick_filler",
          notification_date: "2025-09-12",
          notification_time: "16:30",
          title: "Healthy filler unlocked!",
          description:
            "Sprouts Dahi Chaat = 6g protein. Discover more guilt-free snack hacks!",
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
          screen_title: "Quick Fillers",
          send_notification: true,
        },
        {
          type: "quick_filler",
          notification_date: "2025-09-13",
          notification_time: "16:30",
          title: "Not just a shake!",
          description: `20g protein, sugar-free, 138 cal. Amul Protein Shake = filler done right. Tap to explore more!`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
          screen_title: "Quick Fillers",
          send_notification: true,
        },
        {
          type: "quick_filler",
          notification_date: "2025-09-14",
          notification_time: "16:30",
          title: "Who knew a glass of Lassi could flex so hard?",
          description: `87.5 cal, 8.5g protein, and just 0.25g fat-low cal, protein-packed, zero fat drama!`,
          redirect: "webview",
          redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
          screen_title: "Quick Fillers",
          send_notification: true,
        },
      ],
      feedback_type: feedback_type,
      feedback_wallet: 200,
      lead_upper_section: upper_section,
      mentor_booking_section:
        userDetails[0].user_status == "Completed"
          ? healthScoreDetails.length > 0
            ? mentor_booking_section
            : ""
          : mentor_booking_section,
      program_section,
      offer_section,
      pop_up: {
        show_popup: false,
        description: "",
        title: "Urmila has unlocked restaurant guide for you for 3 days",
        image_url:
          "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png",
        button1: {
          title: "Explore Now",
          redirect_screen: "restaurant_guide",
          screen_params: {},
        },
        button2: {
          title: "",
          redirect_screen: "",
          screen_params: {},
        },
        show_x: true,
      },
      goal_section: goalSection,
      weight_comparison_section: weightComparisonSection,
      trackers_and_ekit_section: middleSection,
      Motivation_section: {
        section_text:
          "<span><b>2,350</b> people with similar journey <br/> like you have lost <b>12kg in 60 days.</b></span>",
      },
      content_carousel: {
        tipsData: [
          {
            id: "1",
            tip_id: randomSocialPost[0].id,
            title: randomSocialPost[0].title,
            label: "Tip of the Day",
            description: randomSocialPost[0].description,
            image: [
              {
                file: {
                  path: "https://bncleanse.com/images/TipOfTheDay.png",
                  name: randomSocialPost[0].title,
                  type: "image/png",
                },
              },
            ],
          },
          {
            id: "2",
            tip_id: randomSocialPost[1].id,
            title: randomSocialPost[1].title,
            label: "Tip of the Day",
            description: randomSocialPost[1].description,
            image: [
              {
                file: {
                  path: "https://bncleanse.com/images/TipOfTheDay.png",
                  name: randomSocialPost[1].title,
                  type: "image/png",
                },
              },
            ],
          },
          {
            id: "3",
            tip_id: randomSocialPost[2].id,
            title: randomSocialPost[2].title,
            label: "Tip of the Day",
            description: randomSocialPost[2].description,
            image: [
              {
                file: {
                  path: "https://bncleanse.com/images/TipOfTheDay.png",
                  name: randomSocialPost[2].title,
                  type: "image/png",
                },
              },
            ],
          },
        ],
        recipesData: [
          {
            id: "1",
            recipe_id: latestRecipe[0].id,
            title: latestRecipe[0].title,
            description: latestRecipe[0].health_meter,
            image: safeJSONParse(latestRecipe[0].recipe_images)[0]?.file?.path,
          },
          {
            id: "2",
            recipe_id: latestRecipe[1].id,
            title: latestRecipe[1].title,
            description: latestRecipe[1].health_meter,
            image: safeJSONParse(latestRecipe[1].recipe_images)[0]?.file?.path,
          },
          {
            id: "3",
            recipe_id: latestRecipe[2].id,
            title: latestRecipe[2].title,
            description: latestRecipe[2].health_meter,
            image: safeJSONParse(latestRecipe[2].recipe_images)[0]?.file?.path,
          },
        ],
        videosData: [
          {
            id: randomReelPost[0].id,
            postType: "reel",
            postSubType: "General",
            title: randomReelPost[0].title,
            description: randomReelPost[0].description,
            image: safeJSONParse(randomReelPost[0].thumbnail_image),
            video: safeJSONParse(randomReelPost[0].video),
            thumbnailImage: safeJSONParse(randomReelPost[0].thumbnail_image),
            tags: randomReelPost[0].tags,
            postLink: "https://balancenutrition.in",
          },
          {
            id: randomReelPost[1].id,
            postType: "reel",
            postSubType: "General",
            title: randomReelPost[1].title,
            description: randomReelPost[1].description,
            image: safeJSONParse(randomReelPost[1].thumbnail_image),
            video: safeJSONParse(randomReelPost[1].video),
            thumbnailImage: safeJSONParse(randomReelPost[1].thumbnail_image),
            tags: randomReelPost[1].tags,
            postLink: "https://balancenutrition.in",
          },
          {
            id: randomReelPost[2].id,
            postType: "reel",
            postSubType: "General",
            title: randomReelPost[2].title,
            description: randomReelPost[2].description,
            image: safeJSONParse(randomReelPost[2].thumbnail_image),
            video: safeJSONParse(randomReelPost[2].video),
            thumbnailImage: safeJSONParse(randomReelPost[2].thumbnail_image),
            tags: randomReelPost[2].tags,
            postLink: "https://balancenutrition.in",
          },
        ],
        blogsData: [
          {
            id: "1",
            blog_id: randomHealthRead[0].postID,
            title: randomHealthRead[0].postTitle,
            description: randomHealthRead[0].seoDescription,
            image: safeJSONParse(randomHealthRead[0].postBannerSmall)[0]?.file
              ?.path,
          },
          {
            id: "1",
            blog_id: randomHealthRead[1].postID,
            title: randomHealthRead[1].postTitle,
            description: randomHealthRead[1].seoDescription,
            image: safeJSONParse(randomHealthRead[1].postBannerSmall)[0]?.file
              ?.path,
          },
          {
            id: "1",
            blog_id: randomHealthRead[2].postID,
            title: randomHealthRead[2].postTitle,
            description: randomHealthRead[2].seoDescription,
            image: safeJSONParse(randomHealthRead[2].postBannerSmall)[0]?.file
              ?.path,
          },
        ],
      },
      success_story: [
        {
          title: "Lost " + successStories[0].weight_loss + "kg Overall",
          story_id: successStories[0].id,
          before: JSON.parse(successStories[0].photo_before),
          after: JSON.parse(successStories[0].photo_after),
          userDetails: JSON.parse(successStories[0].client_details),
          impact: [],
        },
        {
          title: "Lost " + successStories[1].weight_loss + "kg Overall",
          story_id: successStories[1].id,
          before: JSON.parse(successStories[1].photo_before),
          after: JSON.parse(successStories[1].photo_after),
          userDetails: JSON.parse(successStories[1].client_details),
          impact: [],
        },
        {
          title: "Lost " + successStories[2].weight_loss + "kg Overall",
          story_id: successStories[2].id,
          before: JSON.parse(successStories[2].photo_before),
          after: JSON.parse(successStories[2].photo_after),
          userDetails: JSON.parse(successStories[2].client_details),
          impact: [],
        },
      ],
    },
  });

  return res.status(200).json(apiresponse);
};

function getOCUpperSection(
  userDetails,
  callDetails,
  healthScoreDetails,
  suggestedProgramDetails,
  randomCounsellor,
) {
  let ocUpperSection = [];
  let healthScoreDay = 0;
  let message,
    image,
    button_title,
    redirect_screen,
    redirect_params,
    section_id = "";
  if (healthScoreDetails.length > 0) {
    const healthScoreDate = new Date(healthScoreDetails[0].created);
    const today = new Date();
    // Clear out the time part for both dates to avoid timezone issues
    healthScoreDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    // Calculate difference in days
    const diffTimeHS = today - healthScoreDate;
    const diffDaysHS = Math.floor(diffTimeHS / (1000 * 60 * 60 * 24));
    // Add 1 because the day it was added should be Day 1
    healthScoreDay = diffDaysHS + 1;
  } else {
    healthScoreDay = 0;
  }

  console.log(randomCounsellor, 11331133);

  const photoArray = JSON.parse(randomCounsellor.photo); // Convert string to array
  const counsellorImagePath = photoArray[0].file.path; // Extract the path
  let consultationDay = 0;
  if (callDetails.length > 0) {
    const consultationDate = new Date(callDetails[0].call_schedule_date);
    const today = new Date();
    consultationDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTimeConsultation = today - consultationDate;
    const diffDaysConsultation = Math.floor(
      diffTimeConsultation / (1000 * 60 * 60 * 24),
    );
    consultationDay = diffDaysConsultation + 1;
  } else {
    consultationDay = 0;
  }

  console.log(randomCounsellor, 22233332222);
  let counsellorType = "Mentor";
  if (userDetails[0].user_type == "0") {
    counsellorType = "Counsellor";
  }

  if (healthScoreDetails.length == 0) {
    ocUpperSection = [
      {
        id: "1",
        type: "Health Score",
        image: counsellorImagePath,
        title: `Your Next Phase Starts with a Health Check!`,
        description: ` ${randomCounsellor.first_name} is prepared to guide you again, but she needs a clear understanding of your current status. Retake your Health Score today.`,
        redirection: {
          button_text: "Take Health Score",
          redirect_screen: "take_health_score",
          screen_params: {},
        },
      },
    ];
  } else if (callDetails.length == 0 && healthScoreDay == 1) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: ` ${randomCounsellor.first_name} Wants to Discuss Your Results`,
        description: `Your Health Score is complete. A call with ${randomCounsellor.first_name} will ensure your program matches your goals perfectly.`,
        redirection: {
          button_text: "Book Consultation",
          redirect_screen:
            userDetails[0].user_type == "1"
              ? "book_appointment"
              : userDetails[0].counsellor_assigned == null
                ? "call_booking"
                : "book_appointment",
          screen_params: {
            call_type: "30",
            added_by: randomCounsellor.counsellor_id,
          },
        },
      },
    ];
  } else if (callDetails.length == 0 && healthScoreDay == 2) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Take the Next Step Forward 🚀`,
        description: `Your progress starts with a consultation. ${randomCounsellor.first_name} will review your Health Score and align it with your goals—let’s move ahead together.`,
        redirection: {
          button_text: "Book Now",
          redirect_screen:
            userDetails[0].user_type == "1"
              ? "book_appointment"
              : userDetails[0].counsellor_assigned == null
                ? "call_booking"
                : "book_appointment",
          screen_params: {
            call_type: "30",
            added_by: randomCounsellor.counsellor_id,
          },
        },
      },
    ];
  } else if (callDetails.length == 0 && healthScoreDay >= 3) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Let's Align Your Goals🌟`,
        description: `You've set clear goals in your Health Score. ${randomCounsellor.first_name} will review these with you in your consultation.`,
        redirection: {
          button_text: "Book Consultation",
          redirect_screen:
            userDetails[0].user_type == "1"
              ? "book_appointment"
              : userDetails[0].counsellor_assigned == null
                ? "call_booking"
                : "book_appointment",
          screen_params: {
            call_type: "30",
            added_by: randomCounsellor.counsellor_id,
          },
        },
      },
    ];
  } else if (callDetails.length > 0 && callDetails[0].call_status == 0) {
    if (
      moment(callDetails[0].call_schedule_date).format(`DD-MM-YYYY`) ===
      moment().format("DD-MM-YYYY")
    ) {
      if (
        callDetails[0].extra_questions_id === null &&
        userDetails[0].user_type == 0
      ) {
        message = `<span style='font-size: 16px; line-height: 22px;'>Your call is scheduled for ${
          callDetails[0].appointment_slots.split(" - ")[0]
        } today.</span><br><span style='font-size: 14px;'>Help ${
          randomCounsellor.first_name
        } know you a little better.</span>`;
        if (userDetails[0].user_status == "Completed") {
          button_title = "";
        } else {
          button_title = "Answer Now";
        }

        redirect_screen = "";
        redirect_params = {};
        section_id = "consultation_card";
      } else {
        message = `<span style='font-size: 16px;'>Your call is scheduled for ${
          callDetails[0].appointment_slots.split(" - ")[0]
        } today.</span>`;
        button_title = "Reschedule";
        redirect_screen = "book_appointment";
        redirect_params = {
          call_type: 30,
        };
        section_id = "";
      }
    } else {
      console.log(callDetails, 1212121212);

      if (callDetails[0].extra_questions_id === null) {
        message = `<span style='font-size: 16px; line-height: 22px;'>Your call is scheduled for </span><br><span style='font-weight: bold; font-size: 14px; line-height: 22px;'>${moment(
          callDetails[0].call_schedule_date,
        ).format(`Do MMM YYYY`)} @ ${
          callDetails[0].appointment_slots.split(" - ")[0]
        }</span><br><span style='font-size: 14px;'> ${
          randomCounsellor.first_name
        } wants to know you a little better</span>`;
        if (userDetails[0].user_status == "Completed") {
          button_title = "";
        } else {
          button_title = "Answer Now";
        }
        redirect_screen = "extra_questions";
        section_id = "consultation_card";
      } else {
        message = `<span style='font-size: 16px; line-height: 22px;'>Your call is scheduled for </span><br><span style='font-weight: bold; font-size: 14px; line-height: 22px;'>${moment(
          callDetails[0].call_schedule_date,
        ).format(`Do MMM YYYY`)} @ ${
          callDetails[0].appointment_slots.split(" - ")[0]
        }</span>`;
        button_title = "";
        redirect_screen = "";
        redirect_params = {};
        section_id = "";
      }
    }
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Consultation Call Booked`,
        description: message,
        redirection: {
          button_text: button_title,
          redirect_screen: redirect_screen,
          screen_params: redirect_params,
        },
        section_id,
      },
    ];
  } else if (callDetails[0].call_status == 4) {
    message = `<span style='font-size: 15px;'>You missed your consultation.</span><br><span style='font-size: 14px;'>${randomCounsellor.first_name} is ready to reconnect!</span>`;
    image = counsellorImagePath;
    button_title = "Reschedule";
    redirect_screen = "book_appointment";
    redirect_params = {
      call_type: 30,
    };
    section_id = "";
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Consultation Call Booked`,
        description: message,
        redirection: {
          button_text: button_title,
          redirect_screen: redirect_screen,
          screen_params: redirect_params,
        },
        section_id,
      },
    ];
  } else if (
    callDetails[0].call_status == 1 &&
    suggestedProgramDetails.length == 0 &&
    (consultationDay == 0 || consultationDay == 1)
  ) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Time to Make a Change`,
        description: `Your consultation highlighted areas where improvement is needed. Don't worry,  ${randomCounsellor.first_name} is here to help you every step of the way.`,
        redirection: {
          button_text: `Chat with ${randomCounsellor.first_name}`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (
    callDetails[0].call_status == 1 &&
    suggestedProgramDetails.length > 0 &&
    (consultationDay == 0 || consultationDay == 1)
  ) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Your Transformation Starts Now!`,
        description: `Based on your consultation,  ${randomCounsellor.first_name} has recommended a ${suggestedProgramDetails[0].program_name} Program tailored to your goals. Chat with ${randomCounsellor.first_name} for further guidance and support.`,
        redirection: {
          button_text: `Chat with ${randomCounsellor.first_name}`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 2) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Let's Build on What You Achieved 💪`,
        description: `You've shown great commitment before—now ${randomCounsellor.first_name} wants to take you even further. This program is your next level.`,
        redirection: {
          button_text: `Begin Your Journey`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 3) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Real Results, Real People`,
        description: `Ramesh joined this program last month and already lost 3 kg. Your journey can be next, don't wait to see changes.`,
        redirection: {
          button_text: `View Success Stories`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 4) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `${randomCounsellor.first_name} Has Your Back`,
        description: `Guidance makes all the difference. With  ${randomCounsellor.first_name} by your side, you'll never feel lost nutrition and motivation all covered.`,
        redirection: {
          button_text: `Chat with ${randomCounsellor.first_name}`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 5) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Imagine Next Week ✨`,
        description: `You've been on this journey before—you know how it feels. Most clients start feeling lighter and more energetic within 7 days of restarting the program. Your fresh start begins today.`,
        redirection: {
          button_text: `Start Now`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 6) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Waiting Delays Results`,
        description: `Every day you wait is a day lost. The program is built to fit into your routine-not disrupt it. Take the leap now.`,
        redirection: {
          button_text: `Claim Your Spot`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 7) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `From Struggle to Success`,
        description: `Anita dropped 5 inches off her waist in 8 weeks with the same program. If she could do it, so can you.`,
        redirection: {
          button_text: `See Anita's Journey`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 8) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `One Week Gone…⏳`,
        description: `It's been 7 days since your consultation. With your past experience, you could already have been seeing changes by now. Don't wait another week—restart your progress today.`,
        redirection: {
          button_text: `Begin Your Transformation`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];

    // }else if (consultationDay == 9){
    //   ocUpperSection = [
    //     {
    //         id: "1",
    //         type: "Counselor",
    //         image: counsellorImagePath,
    //         title: `Your Future Self Is Waiting`,
    //         description: `Vikram lost 10 kg in 12 weeks by starting where you are now. Picture yourself 3 months from today—fitter, stronger, healthier.`,
    //         redirection: {
    //           button_text: `Take the First Step`,
    //           redirect_screen: "mentor_chat",
    //           screen_params: {},
    //         },
    //       }
    //     ];
  } else if (consultationDay == 10) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `The Best Time Is Now ✨`,
        description: `You've already proved you can make progress. You've seen the stories, and you know the benefits. Don't wait—your next transformation begins the moment you commit again.`,
        redirection: {
          button_text: `Join the Program`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 11) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Your Group Is Moving Ahead`,
        description: `Ramesh lost 3 kg in his first month. He started right after his consultation. What's stopping you?`,
        redirection: {
          button_text: `See Ramesh's Story`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 12) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Your Future Self Is Waiting`,
        description: `Every step you take today brings you closer to the body you want. Start now—your transformation begins with action.`,
        redirection: {
          button_text: `Start Today`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 13) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Stuck or Unsure?`,
        description: `It's normal to have doubts before starting. ${randomCounsellor.first_name} is here to answer your questions.`,
        redirection: {
          button_text: `Talk to ${randomCounsellor.first_name}`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 14) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Your Goals Deserve Priority`,
        description: `Every day without action delays your progress. Don't let time cost you your transformation.`,
        redirection: {
          button_text: `Take the First Step`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else if (consultationDay == 15) {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Consultation Complete - Your Transformation Starts Now!`,
        description: `Based on your consultation,  ${randomCounsellor.first_name} has recommended a ${suggestedProgramDetails[0].program_name} Program tailored to your goals. Stay focused, and if you have any questions, Chat with ${randomCounsellor.first_name} for further guidance and support.`,
        redirection: {
          button_text: `Chat with ${randomCounsellor.first_name}`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
      },
    ];
  } else {
    ocUpperSection = [
      {
        id: "1",
        type: "Counselor",
        image: counsellorImagePath,
        title: `Consultation Complete - Your Transformation Starts Now!`,
        description: `Based on your consultation,  ${randomCounsellor.first_name} has recommended a ${suggestedProgramDetails[0].program_name} Program tailored to your goals. Stay focused, and if you have any questions, Chat with ${randomCounsellor.first_name} for further guidance and support.`,
        redirection: {
          button_text: `Chat with ${randomCounsellor.first_name}`,
          redirect_screen: "mentor_chat",
          screen_params: {},
        },
        section_id,
      },
    ];
  }

  return ocUpperSection;
}

const getLeadOCHomeScreen = async (req, res, next) => {
  const { user_id } = req.body;
  try {
    //   //fetch lead details
    const userDetailstable = tables.userDetails;
    const selectUserDetailsColumns = [
      "ud.*",
      `(SELECT COUNT(*) > 0 FROM ${tables.productOrders} po WHERE po.user_id = ud.user_id AND po.brand = 'doctorstore' AND po.product_id = 'bn-bodyscan-smart-scale' AND po.status = 'Delivered') AS scale_purchased`,
      "ad.email_id as counsellor_email",
      "RIGHT(ad.official_phone, 10) AS counsellor_phone",
      "RIGHT(mentor.official_phone, 10) AS mentor_phone",
      "mentor.crm_user AS mentor_name",
      "ad.crm_user AS counsellor_name",
    ];
    const userDetailsWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
    ];
    const { results: userDetails } = await readRecord({
      table: `${userDetailstable} ud`,
      selectFields: selectUserDetailsColumns,
      joins: [
        {
          type: `LEFT`,
          table: `${tables.adminUsers} ad`,
          on: `ud.counsellor_assigned = ad.admin_user_id`,
        },
         {
          type: `LEFT`,
          table: `${tables.adminUsers} mentor`,
          on: `ud.mentor_assigned = mentor.admin_user_id`,
        },
      ],
      conditions: userDetailsWhereCondition,
    });

    const condition = { user_id: user_id };
    // Perform the database update
    const userUpdateData = {
      app_last_visit_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      home_screen_video: "1",
    };

    const updateUserDetailResult = await updateRecord(
      `${tables.userDetails}`,
      filterObjectRemoveNullValues(userUpdateData),
      condition,
    );

    //fetch lead latest HS
    const healthScoreTable = tables.healthScoreClient;
    const selecthealthScoreColumns = ["*"];
    const healthScoreWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
      {
        field: `DATE(created)`,
        operator: `>=`,
        value: `DATE(CURDATE() - INTERVAL 21 DAY)`,
        raw: true,
      },
    ];
    const { results: healthScoreDetails } = await readRecord({
      table: `${healthScoreTable}`,
      selectFields: selecthealthScoreColumns,
      conditions: healthScoreWhereCondition,
      orderBy: ["id DESC"],
    });
    console.log(healthScoreDetails[0], 333444);

    //fetch lead consultation details
    const callDetailsTable = tables.callUpdates;
    const selectcallDetailsColumns = [
      `cu.call_id`,
      `cu.schedule_date as call_schedule_date`,
      `cu.call_type`,
      `cu.call_status`,
      `cu.added_by`,
      `slot.appointment_slots`,
      `cu.extra_questions_id`,
      `cu.feedback_filled`,
    ];
    const callDetailsWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
      { field: `call_type`, operator: `=`, value: "30" },
      {
        field: `DATE(schedule_date)`,
        operator: `>=`,
        value: `DATE(CURDATE() - INTERVAL 15 DAY)`,
        raw: true,
      },
    ];
    const { results: callDetails } = await readRecord({
      table: `${callDetailsTable} as cu`,
      selectFields: selectcallDetailsColumns,
      joins: [
        {
          type: `LEFT`,
          table: `${tables.slots} slot`,
          on: `slot.id = cu.slot_id`,
        },
      ],
      conditions: callDetailsWhereCondition,
      orderBy: ["cu.call_id DESC"],
    });

    //fetch suggested program
    const suggestedProgramTable = tables.suggestedProgram;
    const selectsuggestedProgramColumns = [
      "spg.program_id",
      "pm.program_name",
      "pm.app_program_banner",
    ];
    const suggestedProgramWhereCondition = [
      {
        field: `suggested_program_id`,
        operator: `=`,
        value: userDetails[0].suggested_program_id,
      },
    ];
    const { results: suggestedProgramDetails } = await readRecord({
      table: `${suggestedProgramTable} as spg`,
      selectFields: selectsuggestedProgramColumns,
      joins: [
        {
          type: `LEFT`,
          table: `${tables.programsMaster} pm`,
          on: `spg.program_id = pm.program_id`,
        },
      ],
      conditions: suggestedProgramWhereCondition,
    });

    //Fetch Recipes
    const { results: latestRecipe } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: [
        `r.id`,
        `r.title`,
        `r.recipe_images`,
        `rt.title as recipe_type_name`,
        `rc.category_name `,
        `r.health_meter`,
        `rt.icon`,
      ],
      joins: [
        {
          type: `LEFT`,
          table: `${tables.recipe_type} rt`,
          on: `r.recipe_type_id = rt.id`,
        },
        {
          type: `LEFT`,
          table: `${tables.category} rc`,
          on: `r.category_id = rc.category_id `,
        },
      ],
      orderBy: [`RAND()`],
      pagination: { limit: 3 },
    });

    //fetch blog categories
    const { results: blogCategories } = await readRecord({
      table: `${tables.blogPostsCategory} bp`,
      selectFields: [`catID`, `catTitle`, `category_image`],

      orderBy: [`RAND()`],
      pagination: { limit: 3 },
    });

    //fetch videos
    const { results: videoDetails } = await readRecord({
      table: `${tables.socialPost} social_post`,
      selectFields: [`social_post.*`],
      conditions: [
        { field: `social_post.post_type`, operator: `=`, value: `reel` },
        {
          field: `social_post.thumbnail_image`,
          operator: `IS NOT`,
          value: null,
          raw: true,
        },
      ],
      pagination: { limit: 3 },
      orderBy: [`RAND()`],
    });

    //fetch recipe chapters
    let recipeBookCategories = [];
    const { results: chapters } = await readRecord({
      table: `${tables.recipeChapters} rc`,
      selectFields: [
        "rc.chapter_id",
        "rc.chapter_name",
        `(SELECT JSON_UNQUOTE(JSON_EXTRACT(r.recipe_images, '$[0].file.path')) as recipe_image
        FROM ${tables.bookmarkedRecipes} br
        JOIN ${tables.recipe} r ON r.id = br.recipe_id
        WHERE br.chapter_id = rc.chapter_id 
          AND br.is_deleted = 0 
        ORDER BY RAND() 
        LIMIT 1) as chapter_image`,
      ],
      conditions: [
        { field: "rc.user_id", operator: "=", value: user_id },
        { field: "rc.is_deleted", operator: "=", value: 0 },
      ],
    });

    if (chapters.length > 0) {
      recipeBookCategories = chapters.map((chapter) => ({
        category_id: chapter.chapter_id,
        category_name: chapter.chapter_name,
        category_image_url: chapter.chapter_image,
      }));
    }

    //fetch restaurant cuisines
    const { results: restaurantGuideCuisines } = await readRecord({
      table: `${tables.restaurantCuisines}`,
      selectFields: [`*`],
      orderBy: [`cuisine_name ASC`],
    });

    //fetch alcohol categories
    const { results: alcoholGuideCategories } = await readRecord({
      table: `${tables.alcoholCategories}`,
      selectFields: [`*`],
      orderBy: [`category_id ASC`],
    });

    //fetch quick filler categories
    const { results: quickFillerCategories } = await readRecord({
      table: `${tables.categoryList}`,
      selectFields: [`*`],
      orderBy: [`id ASC`],
    });

    //fetch recipe books created

    //Fetch Success Stories
    let gender = "";
    if (healthScoreDetails.length > 0) {
      gender = healthScoreDetails[0].gender;
    } else {
      gender = "female";
    }

    if (gender == "other") {
      gender = "female";
    }
    let success_story_condition = [
      { field: "status", operator: "=", value: "active" }, // Only active success stories
      { field: "is_deleted", operator: "=", value: 0 }, // Ensure success story is not deleted
    ];
    if (healthScoreDetails.length > 0 && gender != "") {
      success_story_condition.push({
        field: "LCASE(gender)",
        operator: "=",
        value: `'${gender.toLowerCase()}'`,
        raw: true,
      });
    } else {
    }

    const { results: successStories } = await readRecord({
      selectFields: ["*"],
      table: "success_stories",
      conditions: success_story_condition,
      orderBy: [`RAND()`],
      pagination: { limit: 3 },
    });

    //Check Guide Usage

    // 2) recipe_chapters (only count non-deleted rows)
    const recipeChapterstable = tables.recipeChapters;
    const selectRecipeChaptersColumns = ["user_id"];
    const recipeChaptersWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
      { field: `is_deleted`, operator: `=`, value: 0 },
    ];
    const { results: recipeChapters } = await readRecord({
      table: `${recipeChapterstable}`,
      selectFields: selectRecipeChaptersColumns,
      conditions: recipeChaptersWhereCondition,
    });

    // 3) user_alcohol_menu
    const alcoholTable = tables.userAlcoholMenu;
    const selectAlcoholColumns = ["user_id"];
    const alcoholWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
    ];
    const { results: alcoholMenus } = await readRecord({
      table: `${alcoholTable}`,
      selectFields: selectAlcoholColumns,
      conditions: alcoholWhereCondition,
    });

    // 4) user_restaurant_menu
    const restaurantTable = tables.userRestaurantMenu;
    const selectRestaurantColumns = ["user_id"];
    const restaurantWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
    ];
    const { results: restaurantMenus } = await readRecord({
      table: `${restaurantTable}`,
      selectFields: selectRestaurantColumns,
      conditions: restaurantWhereCondition,
    });

    // 5) free_filler_users_data
    const freeFillerTable = tables.freeFillerUsersData;
    const selectFreeFillerColumns = ["user_id"];
    const freeFillerWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
    ];
    const { results: freeFillers } = await readRecord({
      table: `${freeFillerTable}`,
      selectFields: selectFreeFillerColumns,
      conditions: freeFillerWhereCondition,
    });

    // 6) Build a simple status object (used / not_used)
    const featureUsageStatus = {
      recipe_chapters: recipeChapters.length > 0 ? true : false,
      alcohol_menu: alcoholMenus.length > 0 ? true : false,
      restaurant_menu: restaurantMenus.length > 0 ? true : false,
      free_filler: freeFillers.length > 0 ? true : false,
    };

    let weightComparisonSection = [];
    let bodyCompositionSection = null ; 

    const { results: weightScaleOrderData } = await readRecord({
      table: `${tables.productOrders}`,
      selectFields: ["status"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "brand", operator: "=", value: 'doctorstore' },
        { field: "status", operator: "=", value: 'Delivered'}

      ],
      orderBy: ["order_id DESC"],
    });

    const smartScaleScanData = await SmartScaleData.find({
      user_id: user_id,
    }).sort({createdAt:-1});


    console.log(weightScaleOrderData, smartScaleScanData, 'weightScaleOrderData, smartScaleScanData');

    if ( smartScaleScanData.length > 0 ) {

      const scaleData = smartScaleScanData[0];
      bodyCompositionSection = {
        title: 'Body Composition Report',
        sections: [
          { icon: '', title: 'Weight', value: `${Number(smartScaleScanData[0]?.weight_value).toFixed(2)} ${smartScaleScanData[0]?.weight_unit}`},
          { icon: '', title: 'Body Fat', value: `${Number(smartScaleScanData[0]?.additional_data?.bodyFatPercentage).toFixed(2)} %` },
          { icon: '', title: 'Muscle', value: `${Number(smartScaleScanData[0]?.additional_data?.muscleMass).toFixed(2)} ${smartScaleScanData[0]?.weight_unit}` },
        ],
        redirection1: {
          button_text: 'View Details',
          redirect_screen: 'weighing_scale_health_analysis',
          screen_params: {data:{
            weight_value: scaleData?.weight_value ?? null,
            weight_decimal: scaleData?.weight_raw
              ? Number(scaleData.weight_raw) / 100
              : null,
            weight_unit: scaleData?.weight_unit ?? null,
            weight_raw: scaleData?.weight_raw ?? null,
            adc: scaleData?.adc ?? null,
            algorithm_id: scaleData?.algorithm_id ?? null,
            data_id: scaleData?.data_id ?? null,
            device_type: scaleData?.device_type ?? null,
            weight_status: scaleData?.weight_status ?? null,
          
            bmi_value: scaleData?.additional_data?.bmi ?? null,
            body_fat_percentage: scaleData?.additional_data?.bodyFatPercentage ?? null,
            muscle_rate: scaleData?.additional_data?.muscleRate ?? null,
            visceral_fat_index: scaleData?.additional_data?.visceralFatIndex ?? null,
            subcutaneous_fat: scaleData?.additional_data?.subcutaneousFat ?? null,
            fat_mass: scaleData?.additional_data?.fatMass ?? null,
            muscle_mass: scaleData?.additional_data?.muscleMass ?? null,
            protein_amount: scaleData?.additional_data?.proteinAmount ?? null,
            protein_rate: scaleData?.additional_data?.proteinRate ?? null,
            moisture: scaleData?.additional_data?.moisture ?? null,
            bone_mass: scaleData?.additional_data?.boneMass ?? null,
            basal_metabolic_rate: scaleData?.additional_data?.basalMetabolicRate ?? null,
            weight_control: scaleData?.additional_data?.weightControl ?? null,
            standard_weight: scaleData?.additional_data?.standardWeight ?? null,
            lean_body_mass: scaleData?.additional_data?.leanBodyMass ?? null,
            body_age: scaleData?.additional_data?.bodyAge ?? null,
          
            measured_at: scaleData?.measured_at ?? null,
          }
        }
        },
        redirection2: {
          button_text: 'Take Again',
          redirect_screen: 'scan_weighing_scale',
          screen_params: null
        },
      } 
    }

    else if (smartScaleScanData.length==0) {
       bodyCompositionSection = {
        title: 'Body Composition Report',
        sections: [
          { icon: '', title: 'Weight', value: '?' },
          { icon: '', title: 'Body Fat', value: '?' },
          { icon: '', title: 'Muscle', value: '?' },
        ],
        redirection2: {
          button_text: 'Update Now',
          redirect_screen: 'scan_weighing_scale',
          screen_params: null
        },
      } 
    }

    //Fetch OC weight data
    if (userDetails[0].user_type == "1") {
      const { results: weightRecords } = await readRecord({
        table: `${tables.weightRecords}`,
        selectFields: ["*"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
        orderBy: ["wmr_id DESC"],
      });
      let start_weight = userDetails[0].start_weight;
      let end_weight, goal_weight, weight_days_ago;
      if (healthScoreDetails.length > 0) {
        end_weight = healthScoreDetails[0].weight;
        goal_weight = healthScoreDetails[0].goal_weight;
        weight_days_ago = moment().diff(
          moment(healthScoreDetails[0].created),
          "days",
        );
      } else {
        const { results: leadWeightRecords } = await readRecord({
          table: `${tables.weightRecordsLead}`,
          selectFields: ["*"],
          conditions: [{ field: "user_id", operator: "=", value: user_id }],
          orderBy: ["id DESC"],
        });
        if (
          leadWeightRecords.length > 0 &&
          weightRecords.length > 0 &&
          moment(weightRecords[0].added_date).format("YYYY-MM-DD") <
            moment(leadWeightRecords[0].added_date).format("YYYY-MM-DD")
        ) {
          end_weight = leadWeightRecords[0].weight;
          goal_weight = userDetails[0].goal_weight;
          weight_days_ago = moment().diff(
            moment(leadWeightRecords[0].added_date),
            "days",
          );
        } else {
          if (weightRecords.length > 0) {
            end_weight = weightRecords?.[0].weight;
            goal_weight = userDetails[0].goal_weight;
            weight_days_ago = moment().diff(
              moment(weightRecords?.[0].added_date),
              "days",
            );
          } else {
            end_weight = "0";
            goal_weight = 0;
            weight_days_ago = "";
          }
        }
      }
    

    weightComparisonSection = {
        start_weight_title: "Start Weight",
        start_weight_value: start_weight,
        last_weight_title: "72 Days Ago",
        last_weight_value: end_weight,
        ideal_weight_title: "Goal Weight",
        ideal_weight_value: goal_weight,
        button_text: "Start Again",
        redirect_screen: "mentor_chat",
        screen_params: {},
      };


    if (weightScaleOrderData.length > 0) {
        weightComparisonSection.button_text = "Connect Device";
        weightComparisonSection.redirect_screen = "scan_weighing_scale";
    }
    
    } else {
      weightComparisonSection = {};
    }


    const diwaliGuide = [];
    if (userDetails[0].user_type == "1") {
      // diwaliGuide.push({
      //   top_name: `BN - Christmas`,
      //   bottom_name: `Guide`,
      //   redirect_id: `https://www.balancenutrition.in/media/guides/pdf/christmas_guide.pdf`,
      //   banner_image: `https://${image_guide_base_url}/media/guides/icons/Christmas.png`,
      //   notification_flag: true,
      //   redirect_screen: `webview`,
      //   screen_params: {
      //     link: `https://www.balancenutrition.in/media/guides/pdf/christmas_guide.pdf`,
      //     screen_title: `BN - Christmas Guide`,
      //   },
      // });
      // diwaliGuide.push({
      //   top_name: `BN - Eat Smart Party`,
      //   bottom_name: `Guide`,
      //   redirect_id: `https://www.balancenutrition.in/media/guides/pdf/PartyGuide.pdf`,
      //   banner_image: `https://${image_guide_base_url}/media/guides/icons/partyguide.png`,
      //   notification_flag: true,
      //   redirect_screen: `webview`,
      //   screen_params: {
      //     link: `https://www.balancenutrition.in/media/guides/pdf/PartyGuide.pdf`,
      //     screen_title: `BN - Eat Smart Party Guide`,
      //   },
      // });
    }
    if (
      userDetails[0].active_maintenance_id ||
      userDetails[0].sub_user_status === `Maintenance`
    ) {
      diwaliGuide.push(
        {
          top_name: `BN`,
          bottom_name: `Maintenance`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit//diet.png`,
          notification_flag: true,
          redirect_screen: `maintenance`,
        },
        {
          top_name: `Maintenance`,
          bottom_name: `Tracker`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/weight_tracker_new.png`,
          notification_flag: false,
          redirect_screen: `weight_tracker`,
        },
      );
    }

    let ocEkitandGuidesSection = {
      ekit_and_guide: [
        ...diwaliGuide,
        {
          top_name: "Quick",
          bottom_name: "Fillers",
          redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
          icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577520/app_images/wbc0aw26xcmlgxqktfbc.png",
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577154/app_images/ykknudgoviquwpqcomcz.png",
          notification_flag: true,
          redirect_screen: "quick_filler_guide",
          screen_params: {
            link: `https://balancenutrition.in/bn-free-filler?client_id=${user_id}`,
            screen_title: "Quick Fillers",
          },
        },
        {
          top_name: "Alcohol",
          bottom_name: "Guide",
          redirect_id: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_id}`,
          icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577556/app_images/rsuw7xxkajjcmh0wy2tr.png",
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577195/app_images/dprxrquandmpwjfa54tv.png",
          notification_flag: false,
          redirect_screen: "alcohol_guide",
          screen_params: {
            link: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_id}`,
            screen_title: "Alcohol Guide",
          },
        },
        {
          top_name: "Restaurant",
          bottom_name: "Guide",
          redirect_id: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
          icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577588/app_images/ge44tdgrgpdea2gtce12.png",
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577231/app_images/v2165yiroskhpru3wheo.png",
          notification_flag: false,
          redirect_screen: "restaurant_guide",
          screen_params: {
            link: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
            screen_title: "Restaurant Guide",
          },
        },
        {
          top_name: "Frequent",
          bottom_name: "Queries",
          redirect_id:
            "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-faqs",
          icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577625/app_images/ccd1m0o6v25w7hx71lwp.png",
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577263/app_images/vixzq3hcna8scuills38.png",
          notification_flag: false,
          redirect_screen: "webview",
          screen_params: {
            // "link": "https://www.bncleanse.com/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-faqs",
            link: "https://balancenutrition.in/media/ekits/frequently_asked_questions.pdf",
            screen_title: "Ekit FAQs",
          },
        },
        {
          top_name: "Daily",
          bottom_name: "Essentials",
          // "redirect_id": "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-daily-essentials",
          redirect_id:
            "https://balancenutrition.in/media/ekits/daily_essentials.pdf",
          icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759578282/app_images/ahytbz24dmczdbimyakn.png",
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577291/app_images/bmndqmf22jmd7goptshr.png",
          notification_flag: false,
          redirect_screen: "webview",
          screen_params: {
            // "link": "https://www.bncleanse.com/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-daily-essentials",
            link: "https://balancenutrition.in/media/ekits/daily_essentials.pdf",
            screen_title: "Ekit Daily Essentials",
          },
        },
        {
          top_name: "Eat In",
          bottom_name: "Portions",
          redirect_id:
            "https://www.bncleanse.com/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-eat-in-portions",
          icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577810/app_images/gcqzqgaeh31t5npguve3.png",
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759577325/app_images/nxprsluzmvemr7ykpncs.png",
          notification_flag: false,
          redirect_screen: "webview",
          screen_params: {
            // "link": "https://www.bncleanse.com/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions",
            link: "https://balancenutrition.in/media/ekits/eat_in_portions.pdf",
            screen_title: "Eat In Portions",
          },
        },
      ],
      diet_and_trackers: [
        {
          top_name: "Diet",
          bottom_name: "Old Diets",
          redirect_id: "",
          banner_image:
            "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/diet_chart_new.png",
          notification_flag: false,
          redirect_screen: "diet_session_list",
        },
        {
          top_name: "Photo",
          bottom_name: "Tracker",
          redirect_id: "",
          banner_image:
            "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/photo_tracker_new.png",
          notification_flag: false,
          redirect_screen: "photo_tracker_lead_oc",
        },
      ],
    };

    //Fetch Counsellor Data
    const counsellorListTable = tables.adminUsers;
    const selectcounsellorListColumns = [
      "admin_user_id as counsellor_id",
      "first_name",
      "photo",
    ];

    let counsellorListWhereCondition = [];

    // if(userDetails[0].user_type == '0'){

    // }else{
    //   counsellorListWhereCondition = [
    //     { field: `is_active`, operator: `=`, value: "1" }
    //   ];
    // }
    counsellorListWhereCondition = [
      // { field: `role_id`, operator: `=`, value: "2" },
      { field: `is_active`, operator: `=`, value: "1" },
    ];
    if (
      userDetails[0].user_status == "Completed" &&
      userDetails[0].mentor_assigned !== null &&
      userDetails[0].mentor_assigned !== 0
    ) {
      counsellorListWhereCondition.push({
        field: `admin_user_id`,
        operator: `=`,
        value: userDetails[0].mentor_assigned,
      });
    } else if (
      userDetails[0].counsellor_assigned !== null &&
      userDetails[0].counsellor_assigned !== 0
    ) {
      counsellorListWhereCondition.push({
        field: `admin_user_id`,
        operator: `=`,
        value: userDetails[0].counsellor_assigned,
      });
    }
    const { results: counsellorList } = await readRecord({
      table: `${counsellorListTable}`,
      selectFields: selectcounsellorListColumns,
      conditions: counsellorListWhereCondition,
    });

    const randomCounsellor =
      counsellorList[Math.floor(Math.random() * counsellorList.length)];
    const photoArray = randomCounsellor?.photo ? JSON.parse(randomCounsellor?.photo) : []; // Convert string to array
    const counsellorImagePath = photoArray?.[0]?.file.path || ''; // Extract the path

    let upperSectionCards = [];

    console.log(callDetails, 444555);

    // if(userDetails[0].user_type == 0){
    //   upperSectionCards= getLeadUpperSection(userDetails,callDetails,healthScoreDetails,suggestedProgramDetails,randomCounsellor);
    // }else{
    upperSectionCards = getOCUpperSection(
      userDetails,
      callDetails,
      healthScoreDetails,
      suggestedProgramDetails,
      randomCounsellor,
    );
    // }

    // upperSectionCards = [
    //                       {
    //                           id: "1",
    //                           type: "Counselor",
    //                           image: counsellorImagePath,
    //                           title: `Meet Your Counsellor - ${randomCounsellor.first_name}`,
    //                           description:
    //                             `Counsellor ${randomCounsellor.first_name} is here to guide you with expert advice and support. Reach out for any assistance you need!`,
    //                           redirection: {
    //                             button_text: "Consult Now",
    //                             redirect_screen: "call_booking",
    //                             screen_params: {
    //                               call_id: "30",
    //                               added_by: randomCounsellor.admin_user_id,
    //                             },
    //                           },
    //                         }
    //                       ];
    //Condition to be written for First Card

    let programType = "";
    if (userDetails[0]?.user_type == 1) {
      programType = "App";
    } else {
      programType = "Web";
    }

    const { results: programs } = await readRecord({
      table: tables.programsMaster,
      selectFields: [
        `program_id`,
        `program_name`,
        `program_category`,
        `app_program_banner`,
      ],
      conditions: [
        { field: `is_active`, operator: `=`, value: 1 },
        { field: `app_web`, operator: `=`, value: programType },
        {
          field: "program_id",
          operator: `NOT IN`,
          value: `(18,136,172,173)`,
          raw: true,
        },
      ],
    });

    const programListData = programs.map((program) => {
      return {
        image: program.app_program_banner,
        redirect_screen_name: "program",
        screen_params: {
          program_id: program.program_id,
        },
      };
    });

    // let program_list = [
    //   {
    //     image:
    //       "https://www.bncleanse.com/images/programs/original/Body_transformation_main_app.png",
    //     redirect_screen_name: "program",
    //     screen_params: {
    //       program_id: 4,
    //     },
    //   },
    //   {
    //     image:
    //       "https://www.bncleanse.com/images/programs/original/Weight_loss_pro_main_app.png",
    //     redirect_screen_name: "program",
    //     screen_params: {
    //       program_id: 1,
    //     },
    //   },
    // ];

    //Previous OC Journey Section
    let previousOCJourney;
    if (userDetails[0].user_type == 0) {
      previousOCJourney = {};
    } else {
      previousOCJourney = {
        message:
          "<span>Hey! Let's continue from where you left us. Here's your <b>Previous Journey.</b></span>",
      };
    }

    //Feature Section
    let featureSection = [];
    let recommendedProgram = "";
    if (suggestedProgramDetails.length > 0) {
      recommendedProgram = {
        title: "Recommended Program",
        view_all_redirection: {},
        program_data: [
          {
            image: suggestedProgramDetails[0].app_program_banner,
            redirect_screen_name: "program",
            screen_params: {
              program_id: suggestedProgramDetails[0].program_id,
            },
          },
        ],
      };
    } else if (
      userDetails[0].user_type == 0 &&
      userDetails[0].sales_status == "4"
    ) {
      featureSection = [
        {
          image:
            "https://bncleanse.com/images/LeadOCApp/WhatsApp%20Image%202025-09-29%20at%208.03.45%20PM.jpeg",
          redirect_screen_name: "program",
          screen_params: {
            redirect_id: 4,
          },
        },
      ];
    }
    recommendedProgram = {
      title: "Clara",
      view_all_redirection: {},
      program_data: [
        {
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1763370372/app_images/iwaa8jb8syhghfjewvrm.png",
          redirect_screen_name: "mentor_clara",
          screen_params: {},
        },
      ],
    };
    let feedback_type = "";

    if (
      callDetails.length > 0 &&
      callDetails[0].call_status == "1" &&
      callDetails[0].feedback_filled == "0"
    ) {
      feedback_type = "Consultation";
    }
    const lead_added_date = userDetails[0].added_date;
    const add7Days = moment(lead_added_date)
      .add(7, "days")
      .format("YYYY-MM-DD");
    const current_date = moment().format("YYYY-MM-DD");

    if (
      userDetails[0].lead_app_feedback == "0" &&
      moment(current_date).isSameOrAfter(add7Days)
    ) {
      feedback_type = "App";
    }

    if (userDetails[0].user_type == 1) {
      feedback_type = "";
    }

    //Offer Section
    //Offer Card
    const featureActivationtable = tables.leadsActivatedFeatures;
    const selectfeatureActivationColumns = ["*"];
    const featureActivationWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
    ];
    const { results: activatedFeatures } = await readRecord({
      table: `${featureActivationtable}`,
      selectFields: selectfeatureActivationColumns,
      conditions: featureActivationWhereCondition,
    });

    console.log(activatedFeatures.length, 1313131);
    let couponActivationDetails,
      recipeBookActivationDetails,
      spinToWinActivationDetails,
      guidesActivationDetails = "";
    if (activatedFeatures.length > 0) {
      couponActivationDetails = JSON.parse(activatedFeatures[0].coupon);
      recipeBookActivationDetails = activatedFeatures[0].recipe_book;
      spinToWinActivationDetails = JSON.parse(activatedFeatures[0].spin_to_win);
      guidesActivationDetails = activatedFeatures[0].guides;
    }

    console.log(couponActivationDetails, 333333);
    console.log(spinToWinActivationDetails, 4444444);
    let couponStartDate,
      couponEndDate,
      spinStartDate,
      spinEndDate = "";
    let offer_section = "";

    if (
      couponActivationDetails &&
      moment(couponActivationDetails.end_date).format(`DD-MM-YYYY`) >=
        moment().format("DD-MM-YYYY")
    ) {
      console.log("Coupon");
      couponStartDate = couponActivationDetails.start_date;
      couponEndDate = couponActivationDetails.end_date;

      if (
        moment(couponStartDate).format(`DD-MM-YYYY`) ===
        moment().format("DD-MM-YYYY")
      ) {
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Coupon Unlocked!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: "Redeem & get 20% off",
          button_title: "Claim Now",
          redirect_screen: "program",
          redirect_params: {
            program_id:
              suggestedProgramDetails.length > 0
                ? suggestedProgramDetails[0].program_id
                : "91",
          },
        };
      } else if (
        moment(couponEndDate).format(`DD-MM-YYYY`) ===
        moment().format("DD-MM-YYYY")
      ) {
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Coupon Expiring Soon!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: "Use it on your next program now!",
          button_title: "Claim Now",
          redirect_screen: "program",
          redirect_params: {
            program_id:
              suggestedProgramDetails.length > 0
                ? suggestedProgramDetails[0].program_id
                : "91",
          },
        };
      } else if (
        moment(couponEndDate).format(`DD-MM-YYYY`) >
        moment().format("DD-MM-YYYY")
      ) {
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Redeem & Save Big!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: `${userDetails[0].my_wallet} Wallet + Coupon Discount`,
          button_title: "Claim Now",
          redirect_screen: "program",
          redirect_params: {
            program_id:
              suggestedProgramDetails.length > 0
                ? suggestedProgramDetails[0].program_id
                : "91",
          },
        };
      }
    } else if (
      spinToWinActivationDetails &&
      moment(spinToWinActivationDetails.end_date).format(`DD-MM-YYYY`) >=
        moment().format("DD-MM-YYYY")
    ) {
      console.log("Spin");

      spinStartDate = spinToWinActivationDetails.start_date;
      spinEndDate = spinToWinActivationDetails.end_date;

      if (
        moment(spinStartDate).format(`DD-MM-YYYY`) ===
        moment().format("DD-MM-YYYY")
      ) {
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Your spin is live!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: "Your reward is one tap away!",
          button_title: "Claim Now",
          redirect_screen: "spin_to_win",
          redirect_params: {},
        };
      } else if (
        moment(spinEndDate).format(`DD-MM-YYYY`) ===
        moment().format("DD-MM-YYYY")
      ) {
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Last Chance to Spin!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: "Reward window closes today.",
          button_title: "Claim Now",
          redirect_screen: "spin_to_win",
          redirect_params: {},
        };
      } else if (
        moment(spinEndDate).format(`DD-MM-YYYY`) > moment().format("DD-MM-YYYY")
      ) {
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Spin Live Only For 2 Days!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: "Spin & Win exciting rewards.",
          button_title: "Claim Now",
          redirect_screen: "spin_to_win",
          redirect_params: {},
        };
      }
    }

    const spinRewardtable = tables.prizeDetails;
    const selectspinRewardColumns = ["*"];
    const spinRewardWhereCondition = [
      { field: `user_id`, operator: `=`, value: user_id },
    ];
    const { results: spinRewardDetails } = await readRecord({
      table: `${spinRewardtable}`,
      selectFields: selectspinRewardColumns,
      conditions: spinRewardWhereCondition,
    });

    let spin_reward_date, spin_reward;
    let add_3_days;
    if (spinRewardDetails.length > 0) {
      spin_reward_date = moment(spinRewardDetails[0].added_date).format(
        `YYYY-MM-DD`,
      );
      add_3_days = moment(spin_reward_date).add(3, "days").format(`YYYY-MM-DD`);
      if (moment().format(`YYYY-MM-DD`) <= add_3_days) {
        spin_reward = spinRewardDetails[0].prize;
        offer_section = {
          message:
            '<span style="font-weight: bold; font-size: 16px;">Double Discount Unlocked!</span>',
          offer_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1748240019/app_images/aacjhoria7ubw9hzdle3.png",
          valid_till: `${userDetails[0].my_wallet} Wallet + ${spin_reward}`,
          button_title: "Claim Now",
          redirect_screen: "program",
          redirect_params: {
            program_id:
              suggestedProgramDetails.length > 0
                ? suggestedProgramDetails[0].program_id
                : "91",
          },
        };
      }
    }

    let quickActionBar = {};

    if (offer_section) {
      quickActionBar = {
        image: offer_section.offer_image,
        message: offer_section.message,
        redirect_screen: offer_section.redirect_screen,
        redirect_params: offer_section.redirect_params,
      };
    }

    let hs_color,
      hs_secondary_color = "";
    if (healthScoreDetails.length > 0) {
      let health_score = healthScoreDetails[0].overall_health_score;
      if (health_score >= 90) {
        hs_color = "#216F35";
        hs_secondary_color = "#B7EAC5";
      } else if (health_score >= 71 && health_score <= 89) {
        hs_color = "#AAD53A";
        hs_secondary_color = "#E1F5A9";
      } else if (health_score >= 51 && health_score <= 70) {
        hs_color = "#F4AF2D";
        hs_secondary_color = "#F8D486";
      } else if (health_score >= 31 && health_score <= 50) {
        hs_color = "#9F6B09";
        hs_secondary_color = "#D5A15D";
      } else if (health_score <= 30) {
        hs_color = "#E72A21";
        hs_secondary_color = "#F39C8D";
      }
    }
    let offer_details = {};
    let marquee_text = {};

    if (userDetails[0].my_wallet > 9000) {
      offer_details = {
        offer_id: ``,
        offer_title: `Rs.${userDetails[0].my_wallet} credit expiring soon!`,
        // offer_title: `BN-Healthy Snack Range`,
        offer_description:
          "Your BN wallet expires soon. Please connect with your mentor to use it before that.",
        // offer_description: "Low-calorie, fat-free chips, cookies & high-protein breakfast options by BN.",
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `program`,
        offer_button1_screen_params: { redirect_id: 134 },
        // offer_button1_redirect_screen: `redirect_url`,
        // offer_button1_screen_params: { redirect_id:"https://www.balancenutrition.in/shop"},
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: 0 },
        offer_mentor_autotext: ``,
        offer_client_autotext: ``,
      };
      marquee_text = {
        marquee_color: `#03989F`,
        text: `<p>Rs.${userDetails[0].my_wallet} credit expiring soon! Please connect with your mentor to use it before that. &nbsp;&nbsp;    &nbsp;&nbsp;  &nbsp;&nbsp;    &nbsp;&nbsp;  &nbsp;&nbsp;    &nbsp;&nbsp; &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   </p>`,
        redirect_page: "program",
        params: { redirect_id: 134 },
      };
    } else {
      offer_details = {
        offer_id: ``,
        offer_title:
          "Decode Women's Health & Tips to Control Emotional Eating!",
        offer_description:
          "How mindless overeating can ruin your hormones & your overall health, tips to manage cravings & over eating.",
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id: "https://youtu.be/8K5mYsIyons",
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: 0 },
        offer_mentor_autotext: ``,
        offer_client_autotext: ``,
      };
      marquee_text = {
        marquee_color: `#03989F`,
        text: "<p>Decode Women's Health & Tips to Control Emotional Eating! - How mindless overeating can ruin your hormones & your overall health, tips to manage cravings & over eating.</p>",
        redirect_page: "redirect_url",
        params: { redirect_id: "https://youtu.be/8K5mYsIyons" },
      };
    }

    if (userDetails[0]?.user_status === "Completed") {
      if (Number(userDetails[0].country_id) === 101) {
        offer_details = {
          // Popup
          offer_id: ``,
          offer_title: `Rates Increasing Soon!`,
          offer_description: `Get your next Program at the Lowest Rates alongwith a Free BN-Healthy Food Hamper worth Rs.1999`,
          offer_button1: `Know More`,
          offer_button2: `Not Now`,
          offer_button1_redirect_screen: `program`,
          offer_button1_screen_params: { redirect_id: "134" },
          offer_button2_redirect_screen: `close_popup`,
          offer_button2_screen_params: { redirect_id: "0" },
          offer_image: [
            {
              file: {
                path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
                name: `percent_image`,
                type: `image/jpeg`,
              },
            },
          ],
        };

        marquee_text = {
          marquee_color: `#03989F`,
          text: "<p>Rates Increasing! Get your next program at the lowest rates + get a FREE BN-Healthy Food Hamper delivered home :)</p>",

          redirect_page: `program`,
          params: { redirect_id: "134" },
        };
      } else {
        offer_details = {
          // Popup
          offer_id: ``,
          offer_title: `Rates Increasing Soon!`,
          offer_description: `Get your next Program at the Lowest Rates alongwith a Free Gut-Reset Detox Diet worth Rs.1999`,
          offer_button1: `Know More`,
          offer_button2: `Not Now`,
          // offer_button1_redirect_screen: `redirect_url`,
          // offer_button1_screen_params: {
          //   redirect_id: `https://wa.me/91${
          //     userDetails.mentor_phone
          //   }?text=${encodeURIComponent(
          //     `Hi, I want to know about the lowest rate offers. My email address is ${userDetails.email_id}`
          //   )}`,
          // },
          offer_image: [
            {
              file: {
                path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
                name: `percent_image`,
                type: `image/jpeg`,
              },
            },
          ],
          offer_button1_redirect_screen: `program`,
          offer_button1_screen_params: { redirect_id: "134" },
          offer_button2_redirect_screen: `close_popup`,
          offer_button2_screen_params: { redirect_id: "0" },
        };

        marquee_text = {
          marquee_color: `#03989F`,
          text: "Rates Increasing! Get your next program at the lowest rates + get a FREE BN Gut Reset Diet worth Rs.1999 :)",

          redirect_page: `program`,
          params: { redirect_id: "134" },
        };
      }
      offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `Up to 75% Off until 31st Dec Only!`,
        offer_description: `The rates of our online diet programs are set to increase tomorrow. Book yours ASAP at the existing offers. `,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id: `https://wa.me/${
            userDetails.mentor_phone
          }?text=${encodeURIComponent(
            `Hi, I want to know more about the year-end offers. My email address is ${userDetails.email_id} and my weight is`,
          )}`,
        },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
        // offer_button1_redirect_screen: `program`,
        // offer_button1_screen_params: { redirect_id: "134" },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: "Last Day to get up to 75% off on all BN Diet Programs. Rates Increasing Jan 1st Onwards. Click here to get details.",

        redirect_page: `program`,
        params: { redirect_id: "134" },
      };
    } else {
      offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `Why We Created a Better Whey Protein`,
        offer_description: `Most proteins in India are adulterated or loaded with additives. We created a clean whey isolate with pure cocoa & monk fruit! `,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id:
            "https://www.balancenutrition.in/shop/bn-chocolate-whey-protein-isolate",
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "" },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: "<p>Introducing our New Launch - <b>BN Pure Chocolate Whey Protein Isolate!</b> Made with high-quality whey isolate, pure cocoa, & monk fruit. Available in a trial pack of 5 sachets. Order now.</p>",

        redirect_page: `redirect_url`,
        params: {
          redirect_id:
            "https://www.balancenutrition.in/shop/bn-chocolate-whey-protein-isolate",
        },
      };
    }
    if (userDetails[0]?.user_status === "Completed" && userDetails[0].country_id == 101) {
      offer_details = {
        // Popup
        offer_id: ``,
        offer_title: ` Want to have Mangoes this Season?`,
        offer_description: `Try our limited edition, high-protein, ready-to-drink mango shake. `,
        offer_button1: `Order Now`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id:
            "https://balancenutrition.in/shop/bn-Mango-whey-protein-isolate",
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: "<p>New on BN Shop- BN Mango Whey Protein Isolate is here. A high-protein, ready-to-drink mango shake is now available in a pack of 5. Order Now</p>",

        redirect_page: `redirect_url`,
        params: {
          redirect_id:
            "https://www.balancenutrition.in/shop/bn-Mango-whey-protein-isolate",
        },
      };
    } else if (
      moment().isBetween(
        moment("2026-01-26").startOf("day"),
        moment("2026-01-30").endOf("day"),
      )
    ) {
      offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `Rs.${userDetails[0]?.my_wallet} in your BN Wallet expiring in ${moment("2026-01-30").startOf("day").diff(moment().startOf("day"), "days")} days!`,
        offer_description: `Use your BN Wallet balance to get your program at the lowest rates or even free`,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id: `https://wa.me/91${
            userDetails[0]?.counsellor_phone
          }?text=${encodeURIComponent(
            `Hi, I want to use Rs.${userDetails[0]?.my_wallet} lying in my BN Wallet. My name is ${userDetails[0]?.first_name}`,
          )}`,
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
        offer_image: [
          {
            file: {
              path: `https://bncleanse.com/media/guides/icons/Exercises.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: `<p>Rs.${userDetails[0]?.my_wallet} in your BN Wallet expiring in ${moment("2026-01-30").startOf("day").diff(moment().startOf("day"), "days")} days, check the final discount on your next program. Click here </p>`,

        redirect_page: `program`,
        params: {
          redirect_id: "132",
        },
      };
    } else {
      const challengeStartDate1 = new Date('2026-02-16');

    const currentDate1 = new Date();

    const timeDifference1 = currentDate1 - challengeStartDate1;

    const daysDifference1 = timeDifference1 / (1000 * 60 * 60 * 24);

    const challengeDay1 = Math.floor(daysDifference1) + 1;
      offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `Day ${challengeDay1} Tip for the Gut Reset Challenge`,
        offer_description: `Click here to Know more.`,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `mentor_chat`,
        offer_button1_screen_params: {
          redirect_id: "0",
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "11" },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: `<p>Day ${challengeDay1} Tip for the Gut Reset Challenge. Click here to know more.</p>`,

        redirect_page: `mentor_chat`,
        params: {
          redirect_id: "0",
        },
      };
    }

    if(userDetails[0]?.my_wallet >= 2999 && userDetails[0]?.user_status=="Lead"){
    offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `Rs.${userDetails[0]?.my_wallet} Credited Back!`,
        offer_description: `Expiring on 7th March. Check your final discounts.`,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id: `https://wa.me/91${
            userDetails[0]?.counsellor_phone
          }?text=${encodeURIComponent(
            `Hi, I want to use Rs.${userDetails[0]?.my_wallet} that was credited back. My email is ${userDetails[0]?.email_id}`,
          )}`,
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: `<p>Rs.${userDetails[0]?.my_wallet} is credited back to your BN Wallet. Your current wallet balance is Rs.${userDetails[0]?.my_wallet}. Contact ${userDetails[0]?.counsellor_name} to know more: Click here </p>`,

        redirect_page: `redirect_url`,
        params: {
           redirect_id: `https://wa.me/91${
            userDetails[0]?.counsellor_phone
          }?text=${encodeURIComponent(
            `Hi, I want to use Rs.${userDetails[0]?.my_wallet} that was credited back. My email is ${userDetails[0]?.email_id}`,
          )}`,
        },
      };
    }else if(userDetails[0]?.old_wallet > 999 && userDetails[0]?.user_status=="Completed"){
    offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `Rs.${userDetails[0]?.old_wallet} Debited from your BN Wallet! 💡`,
        offer_description: `As per company policies, your BN Wallet was debited & your current balance is Rs.000 ☹️`,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id: `https://wa.me/91${
            userDetails[0]?.mentor_phone
          }?text=${encodeURIComponent(
            `Hi, I want to use Rs.${userDetails[0]?.old_wallet} that was expired. My email is ${userDetails[0]?.email_id}`,
          )}`,
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
        offer_image: [
          {
           file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: `<p>Rs.${userDetails[0]?.old_wallet} is debited from your BN Wallet according to company policies. Your current wallet balance is Rs.00. Contact ${userDetails[0]?.mentor_name} to know more: Click here </p>`,

        redirect_page: `redirect_url`,
        params: {
           redirect_id: `https://wa.me/91${
            userDetails[0]?.mentor_phone
          }?text=${encodeURIComponent(
            `Hi, I want to use Rs.${userDetails[0]?.old_wallet} that was expired. My email is ${userDetails[0]?.email_id}`,
          )}`,
        },
      };
    }else{
      offer_details = {
        // Popup
        offer_id: ``,
        offer_title: ` Want to have Mangoes this Season?`,
        offer_description: `Try our limited edition, high-protein, ready-to-drink mango shake. `,
        offer_button1: `Order Now`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `redirect_url`,
        offer_button1_screen_params: {
          redirect_id:
            "https://balancenutrition.in/shop/bn-Mango-whey-protein-isolate",
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: "<p>New on BN Shop- BN Mango Whey Protein Isolate is here. A high-protein, ready-to-drink mango shake is now available in a pack of 5. Order Now</p>",

        redirect_page: `redirect_url`,
        params: {
          redirect_id:
            "https://www.balancenutrition.in/shop/bn-Mango-whey-protein-isolate",
        },
      };
    }
    
    if(userDetails[0]?.user_status=="Completed") {
       offer_details = {
        // Popup
        offer_id: ``,
        offer_title: `1 Day Detox Diets at Rs.499!`,
        offer_description: `Lose your post-weekend weight with these 1-day Detox Diets!`,
        offer_button1: `Know More`,
        offer_button2: `Not Now`,
        offer_button1_redirect_screen: `cleanse_program`,
        offer_button1_screen_params: {
          redirect_id:"131",
        },
        offer_button2_redirect_screen: `close_popup`,
        offer_button2_screen_params: { redirect_id: "0" },
        offer_image: [
          {
            file: {
              path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
              name: `percent_image`,
              type: `image/jpeg`,
            },
          },
        ],
      };

      marquee_text = {
        marquee_color: `#03989F`,
        text: "<p>1 Day Detox Diets at Rs.499 - Lose your post-weekend weight with these 1-day Detox Diets!</p>",

        redirect_page: `cleanse_program`,
        params: {
          redirect_id:"131",
        },
      };
    }


    const challengeStartDate = new Date('2026-02-16');

    const currentDate = new Date();

    const timeDifference = currentDate - challengeStartDate;

    const daysDifference = timeDifference / (1000 * 60 * 60 * 24);

    const challengeDay = Math.floor(daysDifference) + 1;

    console.log(challengeDay,"This is the challenge day");

    const scalePurchased = Boolean(userDetails?.[0]?.scale_purchased); 
    const isIndian  = userDetails?.[0]?.country_id==101; 
    const todayDate = new Date().getDate();
    const videoIndex  = todayDate % marketingVideoUrls.length; 


    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Lead OC Home Screen Data",
      data: {
        user_type: "Lead",
        offer_details: offer_details,
        marquee_text: marquee_text,
        feedback_type: feedback_type,
        feedback_wallet: 200,
        quick_action_bar: quickActionBar,
        ...(isIndian && {marketing_video: {
          video_url:
            !scalePurchased ? 'https://res.cloudinary.com/dg4wzx8c8/video/upload/v1772679611/app_images/i8zgjsax9bdg81ocourd.mp4' : marketingVideoUrls[videoIndex].video_link,
          orientation: 'portrait',
          button: {
            title: 'Shop Now!',
            screen_name: 'redirect_url',
            screen_params: {
              url: !scalePurchased ? 'https://www.balancenutrition.in/shop/bn-bodyscan-smart-scale': marketingVideoUrls[videoIndex].product_link ,
            },
          },
        }}),
        // video_url:
        //   userDetails[0].home_screen_video == 0
        //     ? "https://res.cloudinary.com/dg4wzx8c8/video/upload/v1759557096/app_images/suwhogqwa4xr8jaag0b0.mp4"
        //     : "",
        lead_oc_upper_section: {
          title:
            userDetails[0].user_type == 0
              ? "Welcome to Your Health Journey!"
              : "Welcome Back!",
          message:
            userDetails[0].user_type == 0
              ? "Let's get you started with personalized guidance."
              : "Let's get you started again with personalized guidance.",
          goals:
            healthScoreDetails.length > 0
              ? JSON.parse(healthScoreDetails[0].goals)
              : [],
          medical_issue:
            healthScoreDetails.length > 0
              ? JSON.parse(healthScoreDetails[0].health_issue)
              : [],
          health_score: {
            score:
              healthScoreDetails.length > 0
                ? healthScoreDetails[0].overall_health_score
                : "",
            color: [hs_color, hs_secondary_color, hs_color],
            label: "Health Score",
          },
          redirection: {
            button_text:
              healthScoreDetails.length > 0
                ? "View Full Report"
                : "Take Health Score",
            redirect_screen:
              healthScoreDetails.length > 0
                ? "lead_health_score_report"
                : "take_health_score",
            screen_params: {},
          },
          carousel_data: upperSectionCards,
        },
        // challenge_section: {
        //   section_title1: '<b><span style="font-size: 22px;">BN 7-Day <span style="font-family: serif;color:#e34f4f;"><i>FREE</i></span> Gut Reset</span></b>',
        //   section_title2:'<span style="font-size: 22px;text-align: center;"><b>Challenge</b></span>',
        //   current_challenge: challengeDay,
        //   video_list: [
        //     {
        //       video_id: 2242,
        //       isLock: false,
        //       is_video:false,
        //       challenge_title:"BN BodyScan Smart Scale",
        //       challenge_description:"",
        //       challenge_number: 0,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771072456/app_images/snrpvmwphqiaqooubb6p.jpg',
        //             name: 'snrpvmwphqiaqooubb6p.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
              
        //       redirect_screen_name: 'redirect_url',
        //       redirect_params:{url:'https://www.balancenutrition.in/shop/bn-bodyscan-smart-scale'}
        //     },
        //     {
        //       video_id: 2242,
        //       isLock: false,
        //       is_video:true,
        //       challenge_title:"Challenge 1",
        //       challenge_description:"",
        //       challenge_number: 1,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771061271/app_images/ikvhfyxcs6e8yegt1bsu.jpg',
        //             name: 'ikvhfyxcs6e8yegt1bsu.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
              
        //       redirect_screen_name: 'reels',
        //       redirect_params:{video_id:2242,challenge_day:1,recipe_id:1756}
        //     },
        //     {
        //       video_id: 2243,
        //       isLock: false,
        //        is_video:true,
        //       challenge_title:"Challenge 2",
        //       challenge_description:"",
        //       challenge_number: 2,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771061329/app_images/ddmucv4tuk9tmvsfm71i.jpg',
        //             name: 'ddmucv4tuk9tmvsfm71i.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
            
        //       redirect_screen_name: 'reels',
        //        redirect_params:{video_id:2243,challenge_day:2}
        //     },
        //     {
        //       video_id: 2244,
        //       isLock: false,
        //        is_video:true,
        //        challenge_title:"Challenge 3",
        //        challenge_description:"",
        //       challenge_number: 3,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771061835/app_images/s97pp7odhhqy57z7o3rf.jpg',
        //             name: 's97pp7odhhqy57z7o3rf.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
        //         redirect_screen_name: 'reels',
        //        redirect_params:{video_id:2244,challenge_day:3}
        //     },
        //     {
        //       video_id: 2245,
        //       isLock: false,
        //        is_video:true,
        //        challenge_title:"Challenge 4",
        //        challenge_description:"",
        //       challenge_number: 4,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771061889/app_images/msjtg1rrk18c1fubixjt.jpg',
        //             name: 'msjtg1rrk18c1fubixjt.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
        //          redirect_screen_name: 'reels',
        //        redirect_params:{video_id:2245,challenge_day:4}
             
        //     },
        //     {
        //       video_id: 2245,
        //       isLock: false,
        //        is_video:true,
        //        challenge_title:"Challenge 5",
        //        challenge_description:"",
        //       challenge_number: 5,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771061929/app_images/mwmnqwzlv4mx5jfc8jpk.jpg',
        //             name: 'mwmnqwzlv4mx5jfc8jpk.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
        //          redirect_screen_name: 'reels',
        //        redirect_params:{video_id:2246,challenge_day:5}
             
        //     },
        //     {
        //       video_id: 2246,
        //       isLock: false,
        //        is_video:true,
        //        challenge_title:"Challenge 6",
        //        challenge_description:"",
        //       challenge_number: 6,
        //       thumbnail_image: [
        //         {
        //           file: {
        //             path: 'https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771061972/app_images/ypw2qh2x78xacs6crzdj.jpg',
        //             name: 'ypw2qh2x78xacs6crzdj.jpg',
        //             type: 'image/jpg',
        //           },
        //         },
        //       ],
        //          redirect_screen_name: 'reels',
        //        redirect_params:{video_id:2247,challenge_day:6}
             
        //     }
        //   ],
        // },
        weight_comparison_section: weightComparisonSection,
        ...(bodyCompositionSection && {body_composition_section: bodyCompositionSection} ),
        previous_journey_section: previousOCJourney,
        recommended_programs_section: recommendedProgram,
        feature_section: featureSection,
        new_trackers_and_ekit_section: ocEkitandGuidesSection,
        restaurant_guide: {
          section_title: "Restaurant Guide",
          guide_name: "restaurant-guide",
          video_url:
            "https://res.cloudinary.com/dg4wzx8c8/video/upload/v1759303713/app_images/rt24vbelaswemhdbessr.mp4",
          icon_url: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png`,
          show_eKit_pro: true,
          is_guide_used: featureUsageStatus.restaurant_menu,
          guide_banner:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759578552/app_images/ipkyntzkleof4h58et3i.png",
          subtitle: "What is Restaurant Guide?",
          highlight:
            "Average restaurant meal: 1,128 calories - that's 56% of your daily needs! Smart ordering can reduce this by 40%",
          description: "",
          banner_description:
            "<span>Your Ultimate <b>Restaurant Guide</b> - Healthy Choices Made Easy</span>",
          category_data: {
            categoryTitle: "Choose Cuisines",
            redirect_screen_name: "selected_cuisines",
            categories: [
              {
                category_id: restaurantGuideCuisines[0].cuisine_id,
                category_name: restaurantGuideCuisines[0].cuisine_name,
                category_image_url:
                  restaurantGuideCuisines[0].cuisine_image_url,
              },
              {
                category_id: restaurantGuideCuisines[1].cuisine_id,
                category_name: restaurantGuideCuisines[1].cuisine_name,
                category_image_url:
                  restaurantGuideCuisines[1].cuisine_image_url,
              },
              {
                category_id: restaurantGuideCuisines[2].cuisine_id,
                category_name: restaurantGuideCuisines[2].cuisine_name,
                category_image_url:
                  restaurantGuideCuisines[2].cuisine_image_url,
              },
              {
                category_id: restaurantGuideCuisines[3].cuisine_id,
                category_name: restaurantGuideCuisines[3].cuisine_name,
                category_image_url:
                  restaurantGuideCuisines[3].cuisine_image_url,
              },
            ],
          },
          button: {
            button_title: "Explore Restaurant Guide",
            redirect_screen_name: "restaurant_guide",
          },
          section_id: "home_screen_restaurant_guide",
        },

        tip_blog_section: [
          {
            tip_category_id: 1,
            tip_id: 106,
            image:
              "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1760149508/app_images/lsukycdebuahfozdbhjc.png",
            redirect_screen_name: "",
            title: "Build Muscles",
            // reading_time: "5 min",
          },
          {
            tip_category_id: 2,
            tip_id: 106,
            image:
              "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1760149623/app_images/a8yplrwyk1bmcyfp00pc.png",
            redirect_screen_name: "",
            title: "Lose Weight",
            // reading_time: "5 min",
          },
          {
            tip_category_id: 3,
            tip_id: 106,
            image:
              "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1760150181/app_images/bbjqsing2urthkoh23hn.png",
            redirect_screen_name: "",
            title: "Metabolism",
            // reading_time: "5 min",
          },
          {
            tip_category_id: 4,
            tip_id: 106,
            image:
              "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1760150439/app_images/u1hzyu2ilyowsv2ez8ny.png",
            redirect_screen_name: "",
            title: "Intermittent Fasting",
            // reading_time: "5 min",
          },
        ],

        // offer_section: {
        //   banner_image:
        //     "https://as2.ftcdn.net/v2/jpg/03/69/95/67/1000_F_369956775_8ShgQJSunVjE75u9273l8pq6zOPlifbg.jpg",
        //   redirect_screen: "program",
        //   screen_params: {
        //     program_id: 4,
        //   },
        // },
        offer_section: {},
        recipe_section: [
          {
            recipe_id: latestRecipe[0].id,
            recipe_name: latestRecipe[0].title,
            description: latestRecipe[0].health_meter,
            image: safeJSONParse(latestRecipe[0].recipe_images)[0]?.file?.path,
          },
          {
            recipe_id: latestRecipe[1].id,
            recipe_name: latestRecipe[1].title,
            description: latestRecipe[1].health_meter,
            image: safeJSONParse(latestRecipe[1].recipe_images)[0]?.file?.path,
          },
          {
            recipe_id: latestRecipe[2].id,
            recipe_name: latestRecipe[2].title,
            description: latestRecipe[2].health_meter,
            image: safeJSONParse(latestRecipe[2].recipe_images)[0]?.file?.path,
          },
        ],

        // highlights_section: {
        //   id: 2025,
        //   type: "festival",
        //   title: "Navratri Day 3",
        //   bg_color: "#FFEDD0",
        //   subtitle: "Celebrate Navratri with our Smart Diet Plan!",
        //   banner_image:
        //     "https: //cbx-prod.b-cdn.net/COLOURBOX60991621.jpg?width=1600&height=1600&quality=70",
        //   highlight: {
        //     label: "Recipe of the Day",
        //     image_url:
        //       "https: //res.cloudinary.com/dg4wzx8c8/image/upload/v1744525181/recipes/images/smtqsb1fxv5oi8agmyzc.jpg",
        //     redirect_screen: "recipe_details",
        //     screen_params: {
        //       redirect_id: 1366,
        //     },
        //   },
        //   button: {
        //     button_text: "Participate in the Contest",
        //     redirect_screen: "contest_screen",
        //     screen_params: { occasion_id: 2025 },
        //   },
        // },
        highlights_section: {},
        alcohol_guide: {
          section_title: "Alcohol Guide",
          guide_name: "alcohol-guide",
          video_url:
            "https://res.cloudinary.com/dg4wzx8c8/video/upload/v1759304799/app_images/ubegnn0cfmzazh7u15ay.mp4",
          icon_url: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/alcohol_guide.png`,
          show_eKit_pro: true,
          is_guide_used: featureUsageStatus.alcohol_menu,
          guide_banner:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759578625/app_images/whmao9efnptlozfwmmki.png",
          subtitle: "Mindful Drinking",
          highlight:
            "A single cocktail contains 200-500 calories. Up to 20% of daily calories can come from drinks alone!",
          description:
            "Select and submit alcohol consumption to track total calories. Monitor your drinking habits.",
          banner_description:
            "<span>Your Ultimate <b>Alcohol Guide</b> – Healthy Choices Made Easy</span>",
          category_data: {
            categoryTitle: "Choose Your Drinks",
            redirect_screen_name: "selected_drink",
            categories: [
              {
                category_id: alcoholGuideCategories[0].category_id,
                category_name: alcoholGuideCategories[0].category_name,
                category_image_url:
                  alcoholGuideCategories[0].category_image_url,
              },
              {
                category_id: alcoholGuideCategories[1].category_id,
                category_name: alcoholGuideCategories[1].category_name,
                category_image_url:
                  alcoholGuideCategories[1].category_image_url,
              },
              {
                category_id: alcoholGuideCategories[2].category_id,
                category_name: alcoholGuideCategories[2].category_name,
                category_image_url:
                  alcoholGuideCategories[2].category_image_url,
              },
              {
                category_id: alcoholGuideCategories[3].category_id,
                category_name: alcoholGuideCategories[3].category_name,
                category_image_url:
                  alcoholGuideCategories[3].category_image_url,
              },
            ],
          },
          button: {
            button_title: "Explore Alcohol Guide",
            redirect_screen_name: "alcohol_guide",
          },
        },

        success_story: [
          {
            title: "Lost " + successStories[0].weight_loss + "kg Overall",
            story_id: successStories[0].id,
            before: JSON.parse(successStories[0].photo_before),
            after: JSON.parse(successStories[0].photo_after),
            userDetails: JSON.parse(successStories[0].client_details),
            impact: [],
          },
          {
            title: "Lost " + successStories[1].weight_loss + "kg Overall",
            story_id: successStories[1].id,
            before: JSON.parse(successStories[1].photo_before),
            after: JSON.parse(successStories[1].photo_after),
            userDetails: JSON.parse(successStories[1].client_details),
            impact: [],
          },
          {
            title: "Lost " + successStories[2].weight_loss + "kg Overall",
            story_id: successStories[2].id,
            before: JSON.parse(successStories[2].photo_before),
            after: JSON.parse(successStories[2].photo_after),
            userDetails: JSON.parse(successStories[2].client_details),
            impact: [],
          },
        ],

        recipe_book_guide: {
          section_title: "Recipe Book",
          guide_name: "recipe-book",
          video_url:
            "https://res.cloudinary.com/dg4wzx8c8/video/upload/v1759303713/app_images/rt24vbelaswemhdbessr.mp4",
          icon_url: "https://bncleanse.com/images/Recipe_book.png",
          show_eKit_pro: true,
          is_guide_used: true,
          // is_guide_used: featureUsageStatus.recipe_chapters,
          guide_banner:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759578671/app_images/yi0szhp1exzxmfl07eyq.png",
          subtitle: "Recipe Book",
          highlight:
            "People who cook at home consume 137 fewer calories per day and have better overall diet quality.",
          description:
            "Create your own recipe chapters and save favorite recipes for future reference. Organize by meal type, diet preference, or cooking time.",
          banner_description:
            "Create your own recipe chapters and save favorite recipes for future reference. Organize by meal type, diet preference, or cooking time.",
          category_data: {
            categoryTitle: "Existing Chapters",
            redirect_screen_name: "selected_category",
            categories: recipeBookCategories,
          },
          button: {
            button_title: "Explore Recipe Book",
            redirect_screen_name: "Recipe Add Chapter",
          },
        },

        // counselor_section: [
        //   {
        //     id: 252,
        //     image:
        //       "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1750852373/default-folder/gnntnvi1wje7wrbkcnlc.png",

        //     description:
        //       "<span>Your counselor <b>Krishna</b> has unlocked  <b>free consultation</b> with a Senior Nutritionist Urmila.</span>",
        //     button: {
        //       button_title: "Consult Now",
        //       redirect_screen_name: "book_appointment",
        //       screen_params: { call_type: "", added_by: "252" },
        //     },
        //   },
        //   {
        //     id: 25,
        //     image:
        //       "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1750852373/default-folder/gnntnvi1wje7wrbkcnlc.png",

        //     description:
        //       "<span>Your counselor <b>Krishna</b> has unlocked a <b>free consultation</b> with a Senior Nutritionist Urmila.</span>",
        //     redirect_screen_name: "PeerDetails",
        //     button: {
        //       button_title: "Consult Now",
        //       redirect_screen_name: "book_appointment",
        //       screen_params: { call_type: "", added_by: "252" },
        //     },
        //   },
        //   {
        //     id: 26,
        //     image:
        //       "https: //images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face",
        //     description:
        //       "<span>Your counselor <b>Krishna</b> has unlocked a <b>free consultation</b> with a Senior Nutritionist Urmila.</span>",
        //     redirect_screen_name: "PeerDetails",
        //     button: {
        //       button_title: "Consult Now",
        //       redirect_screen_name: "book_appointment",
        //       screen_params: { call_type: "", added_by: "252" },
        //     },
        //   },
        // ],
        counselor_section: [],
        program_section: {
          title: "BN Diet Programs",
          view_all_redirection: {},
          program_data: programListData,
        },
        // program_section: {},
        quick_fillers_guide: {
          section_title: "Quick Fillers Guide",
          guide_name: "quick-fillers-guide",
          video_url:
            "https://res.cloudinary.com/dg4wzx8c8/video/upload/v1759304944/app_images/tetgjgq3lilyo5enwmaz.mp4",
          icon_url: `https://bncleanse.com/images/quickFillers.png`,
          show_eKit_pro: false,
          is_guide_used: featureUsageStatus.free_filler,
          guide_banner:
            "https://bncleanse.com/images/alcohol_guide_images/Tap%20Beer%20Bira%2091%20-%20image.jpg",
          subtitle: "What is Quick Fillers?",
          highlight:
            "Mindless snacking adds an average of 400 calories daily. Tracking reduces this by 60%!",
          description:
            "Select snacks and munchies you're having throughout the day. Track calories from all your small bites and stay within your daily goals.",
          banner_description:
            "<span>Your Ultimate <b>Quick Filler Guide</b> – Healthy Choices Made Easy</span>",
          category_data: {
            categoryTitle: "Choose BN Approved Fillers",
            redirect_screen_name: "selected_category",
            categories: [
              {
                category_id: quickFillerCategories[0].id,
                category_name: quickFillerCategories[0].category_name,
                category_image_url: quickFillerCategories[0].category_image,
              },
              {
                category_id: quickFillerCategories[1].id,
                category_name: quickFillerCategories[1].category_name,
                category_image_url: quickFillerCategories[1].category_image,
              },
              {
                category_id: quickFillerCategories[2].id,
                category_name: quickFillerCategories[2].category_name,
                category_image_url: quickFillerCategories[2].category_image,
              },
              {
                category_id: quickFillerCategories[3].id,
                category_name: quickFillerCategories[3].category_name,
                category_image_url: quickFillerCategories[3].category_image,
              },
            ],
          },
          button: {
            button_title: "Explore Quick Fillers",
            redirect_screen_name: "quick_filler_guide",
          },
        },
        motivation_section: {
          Motivation_section: {
            section_title: "Peer Group Update",
            section_image:
              "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759495192/app_images/haebz3vhq5iactlvxfxe.png",
            section_text:
              "<span><b>475</b> people with similar journey <br/> like you have lost <b>5.37kg in 60 days.</b></span>",
            redirect_screen: "peer_group",
            redirect_params: {
              redirect_id: "",
            },
          },
        },
        daily_essentials_guide: {
          section_title: "Daily Essentials Guide",
          video_url: "https: //www.w3schools.com/html/mov_bbb.mp4",
          icon_url: "https: //bncleanse.com/images/quickFillers.png",
          show_eKit_pro: true,
          is_guide_used: true,
          guide_banner:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759755602/app_images/odsfpxljo0m2uofwiefi.png",
          subtitle: "Mindful Drinking",
          highlight:
            "A single cocktail contains 200-500 calories. Up to 20% of daily calories can come from drinks alone!",
          description:
            "Select and submit alcohol consumption to track total calories. Monitor your drinking habits ",
          banner_description:
            "<span>Your Ultimate <b>Daily Essentials Guide</b> – Healthy Choices Made Easy</span>",
          category_data: {
            categoryTitle: "Choose Your Drinks",
            redirect_screen_name: "selected_drink",
            categories: [
              {
                category_id: 3,
                category_name: "Beers",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Beer/Banner/Banner%20-.jpg",
              },
              {
                category_id: 6,
                category_name: "Breezers",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Breezers/BreezerBanner.png",
              },
              {
                category_id: 1,
                category_name: "Cocktails",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Cocktail/Banner/Banner%20-.jpg",
              },
              {
                category_id: 5,
                category_name: "Liqueurs",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Liqueur/Banner/Banner%20-%20(1).jpg",
              },
            ],
          },
          button: {
            button_title: "Explore Daily Essentials",
            redirect_screen_name: "webview",
            screen_params: {
              screen_title: `Daily Essentials`,
              link: `https://balancenutrition.in/media/ekits/daily_essentials.pdf`,
            },
          },
        },
        blog_section: [
          {
            blog_category_id: blogCategories[0].catID,
            image: blogCategories[0].category_image,
            redirect_screen_name: "",
            title: blogCategories[0].catTitle,
          },
          {
            blog_category_id: blogCategories[1].catID,
            image: blogCategories[1].category_image,
            redirect_screen_name: "",
            title: blogCategories[1].catTitle,
          },
          {
            blog_category_id: blogCategories[2].catID,
            image: blogCategories[2].category_image,
            redirect_screen_name: "",
            title: blogCategories[2].catTitle,
          },
        ],

        video_section: [
          {
            video_id: videoDetails[0].id,
            thumbnail_image: safeJSONParse(videoDetails[0].thumbnail_image),
            redirect_screen_name: "reels",
            title: videoDetails[0].title,
          },
          {
            video_id: videoDetails[1].id,
            thumbnail_image: safeJSONParse(videoDetails[1].thumbnail_image),
            redirect_screen_name: "reels",
            title: videoDetails[1].title,
          },
          {
            video_id: videoDetails[2].id,
            thumbnail_image: safeJSONParse(videoDetails[2].thumbnail_image),
            redirect_screen_name: "reels",
            title: videoDetails[2].title,
          },
        ],
        eat_in_portions_guide: {
          section_title: "Eat In Portions Guide",
          video_url: "https: //www.w3schools.com/html/mov_bbb.mp4",
          icon_url: "https: //bncleanse.com/images/quickFillers.png",
          show_eKit_pro: true,
          is_guide_used: true,
          guide_banner:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759755683/app_images/r8y6zmdimtbzs3slriuh.png",
          subtitle: "Mindful Drinking",
          highlight:
            "A single cocktail contains 200-500 calories. Up to 20% of daily calories can come from drinks alone!",
          description:
            "Select and submit alcohol consumption to track total calories. Monitor your drinking habits ",
          banner_description:
            "<span>Your Ultimate <b>Eat In Portion Guide</b> - Healthy Choices Made Easy</span>",
          category_data: {
            categoryTitle: "Choose Your Drinks",
            redirect_screen_name: "selected_drink",
            categories: [
              {
                category_id: 3,
                category_name: "Beers",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Beer/Banner/Banner%20-.jpg",
              },
              {
                category_id: 6,
                category_name: "Breezers",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Breezers/BreezerBanner.png",
              },
              {
                category_id: 1,
                category_name: "Cocktails",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Cocktail/Banner/Banner%20-.jpg",
              },
              {
                category_id: 5,
                category_name: "Liqueurs",
                category_image_url:
                  "https: //bncleanse.com/images/alcohol_guide_images/Thumbnails/Liqueur/Banner/Banner%20-%20(1).jpg",
              },
            ],
          },
          button: {
            button_title: "Explore Alcohol Guide",
            redirect_screen_name: "webview",
            screen_params: {
              screen_title: `Eat In Portions`,
              // link:`https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`
              link: "https://balancenutrition.in/media/ekits/eat_in_portions.pdf",
            },
          },
        },

        refer_friend: {
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759586116/app_images/ptvgk2xxwhkibi9r1u25.png",
          redirect_screen: "refer_a_friend",
        },
        did_you_know: {
          banner_image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1759585310/app_images/afn8ofmrpnnm7zktujbp.jpg",
          redirect_screen: "tip_of_the_day",
          screen_params: {
            redirect_id: 256,
          },
        },
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(error, 500));
  }
};

// Assumptions:
// - tables.subOrdersPrograms -> "sub_orders_programs"
// - tables.programsMaster    -> "programs_master"
// - tables.weightRecords     -> "weight_records"
// - readRecord({ table, selectFields, joins, conditions, orderBy }) is the same helper you showed
// - ApiResponse & ErrorHandler are available in scope

const getOCPreviousPrograms = async (req, res, next) => {
  const { user_id } = req.body;

  if (!user_id) {
    return next(new ErrorHandler("user_id is required", 400));
  }

  try {
    // 1) Fetch user's prior programs (completed or expired)
    const selectProgramCols = [
      "sop.order_id",
      "sop.sub_order_id",
      "sop.program_id",
      "sop.start_date",
      "sop.expiry_date",
      "sop.program_status",
      "pm.program_name",
    ];

    const programConditions = [
      { field: "sop.user_id", operator: "=", value: user_id },
      // Only "Programs" (if you store types; remove if not applicable)
      // { field: "sop.type", operator: "=", value: "0" },

      // Completed OR expired. We detect expired in JS by comparing dates,
      // but we still fetch all historical rows here.
    ];

    const { results: rawPrograms } = await readRecord({
      table: `${tables.subOrderPrograms} as sop`,
      selectFields: selectProgramCols,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
      ],
      conditions: programConditions,
      orderBy: [
        "COALESCE(sop.expiry_date, sop.start_date) DESC",
        "sop.sub_order_id DESC",
      ],
    });

    // Short-circuit: nothing to show
    if (!rawPrograms || rawPrograms.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Previous Programs List",
        data: [],
      });
      return res.status(200).json(apiresponse);
    }

    // 2) Keep only completed or already expired programs
    const today = new Date();
    const isCompleted = (ps) => ps === "3" || ps === 3 || ps === "completed";
    const isExpired = (exp) =>
      exp && new Date(exp) < new Date(today.toDateString());

    const programs = rawPrograms.filter(
      (p) => isCompleted(p.program_status) || isExpired(p.expiry_date),
    );

    if (programs.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Previous Programs List",
        data: [],
      });
      return res.status(200).json(apiresponse);
    }

    // 3) Pull all weight records for the fetched sub_order_ids in one go
    const subOrderIds = [...new Set(programs.map((p) => p.sub_order_id))];

    let weightsBySubOrder = {};
    if (subOrderIds.length > 0) {
      const weightConditions = [
        { field: "sub_order_id", operator: "IN", value: subOrderIds },
        // Only program weight logs (adjust/remove if you don't use weight_type)
        // { field: "weight_type", operator: "=", value: "0" },
      ];

      const { results: weightRows } = await readRecord({
        table: `${tables.weightRecords} wr`,
        selectFields: ["wr.sub_order_id", "wr.weight", "wr.posted_date"],
        conditions: weightConditions,
        orderBy: ["wr.sub_order_id ASC", "wr.posted_date ASC"],
      });

      // Compute first and last weight per sub_order_id
      for (const row of weightRows || []) {
        const sid = row.sub_order_id;
        if (!weightsBySubOrder[sid]) {
          weightsBySubOrder[sid] = {
            first: { weight: Number(row.weight), posted_date: row.posted_date },
            last: { weight: Number(row.weight), posted_date: row.posted_date },
          };
        } else {
          // first is earliest (already sorted asc); last keeps updating
          weightsBySubOrder[sid].last = {
            weight: Number(row.weight),
            posted_date: row.posted_date,
          };
        }
      }
    }

    // 4) Helpers for formatting and duration
    const fmtOrdinal = (n) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const MONTHS = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sept",
      "Oct",
      "Nov",
      "Dec",
    ];
    const fmtDate = (d) => {
      if (!d) return null;
      const dt = new Date(d);
      const day = fmtOrdinal(dt.getUTCDate());
      const month = MONTHS[dt.getUTCMonth()];
      const year = dt.getUTCFullYear();
      return `${day} ${month} ${year}`;
    };
    const diffDaysInclusive = (start, end) => {
      if (!start || !end) return null;
      const s = new Date(start);
      const e = new Date(end);
      const MS = 24 * 60 * 60 * 1000;
      return Math.max(1, Math.round((e - s) / MS) + 1);
    };

    // 5) Shape the response
    const data = programs.map((r) => {
      const startDate = r.start_date ? new Date(r.start_date) : null;
      const expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;

      const durationDays = diffDaysInclusive(startDate, expiryDate);
      const program_duration = durationDays ? `${durationDays} Days` : null;

      // status
      const status = isCompleted(r.program_status) ? "completed" : "missed";

      // weights
      const w = weightsBySubOrder[r.sub_order_id] || null;
      const startW = w?.first?.weight ?? null;
      const endW = w?.last?.weight ?? null;

      // message/remarks per spec
      let message =
        "<span>You dropped the program in between. But during that period too you did a great job. Your results were really remarkable.</span>";
      let remarks = "You can re-take the program to achieve your target.";

      if (status === "completed") {
        let weightLine = "";
        if (startW != null && endW != null && durationDays) {
          const delta = Number((startW - endW).toFixed(2));
          if (delta > 0) {
            weightLine = `You had lost ${delta.toFixed(
              2,
            )} Kgs in just ${durationDays} Days. `;
          } else if (delta < 0) {
            weightLine = `Your weight increased by ${Math.abs(delta).toFixed(
              2,
            )} Kgs over ${durationDays} Days. `;
          } else {
            weightLine = `Your weight remained the same over ${durationDays} Days. `;
          }
        }
        message = `<span>Your previous journey with us was fabulous. ${weightLine}</span>`;
        remarks = "GREAT JOB.";
      }

      return {
        order_id: r.order_id,
        sub_order_id: r.sub_order_id,
        program_name: r.program_name || null,
        program_duration,
        program_id: r.program_id,
        program_start_date: fmtDate(startDate),
        program_expiry_date: fmtDate(expiryDate),
        status,
        message,
        remarks,
      };
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Previous Programs List",
      data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    return next(new ErrorHandler(error, 500));
  }
};

const getProgramJourney = async (req, res, next) => {
  const { sub_order_id, diet_id } = req.body;

  if (!sub_order_id || !diet_id) {
    return next(new ErrorHandler("sub_order_id and diet_id are required", 400));
  }

  try {
    // 0) Enrolled: sub_orders_programs.created_at
    const { results: sopRows } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: ["sop.user_id", "sop.created_at"],
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: sub_order_id },
      ],
      orderBy: ["sop.sub_order_id DESC"],
    });
    if (!sopRows || !sopRows.length) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Program Journey",
        data: [],
      });
      return res.status(200).json(apiresponse);
    }
    const { user_id, created_at: sopCreatedAt } = sopRows[0];

    // 1) Diet session (look up by diet_id; also get session for downstream filters & titles)
    const { results: dietRows } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_id",
        "dsl.session",
        "dsl.diet_sent_date",
        "dsl.diet_start_date",
        "dsl.sub_order_id",
      ],
      conditions: [
        { field: "dsl.diet_id", operator: "=", value: diet_id },
        { field: "dsl.sub_order_id", operator: "=", value: sub_order_id },
      ],
      orderBy: ["dsl.diet_id DESC"],
    });

    if (!dietRows || !dietRows.length) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Program Journey",
        data: [],
      });
      return res.status(200).json(apiresponse);
    }

    const { session, diet_sent_date, diet_start_date } = dietRows[0];

    // 2) Assessment for this order
    const { results: assessRows } = await readRecord({
      table: `${tables.assessment} a`,
      selectFields: ["a.added_date", "a.completion_status"],
      conditions: [
        { field: "a.user_id", operator: "=", value: user_id },
        { field: "a.active_order_id", operator: "=", value: sub_order_id },
      ],
      orderBy: ["a.added_date ASC"],
    });

    // 3) Photos for this sub_order_id + session
    const { results: photoRows } = await readRecord({
      table: `${tables.photoRecords} pr`,
      selectFields: ["pr.photo_url", "pr.days", "pr.posted_date"],
      conditions: [
        { field: "pr.sub_order_id", operator: "=", value: sub_order_id },
        { field: "pr.session", operator: "=", value: session },
      ],
      orderBy: ["pr.posted_date ASC"],
    });

    // 4) Weights for this sub_order_id + session
    const { results: weightRows } = await readRecord({
      table: `${tables.weightRecords} wr`,
      selectFields: ["wr.weight", "wr.days", "wr.posted_date"],
      conditions: [
        { field: "wr.sub_order_id", operator: "=", value: sub_order_id },
        { field: "wr.session", operator: "=", value: session },
      ],
      orderBy: ["wr.posted_date ASC"],
    });

    // 5) Inches for this sub_order_id + session
    const { results: inchRows } = await readRecord({
      table: `${tables.inchRecords} ir`,
      selectFields: ["ir.posted_date", "ir.chest", "ir.waist", "ir.hips"],
      conditions: [
        { field: "ir.sub_order_id", operator: "=", value: sub_order_id },
        { field: "ir.session", operator: "=", value: session },
      ],
      orderBy: ["ir.posted_date ASC"],
    });

    // ---------- Helpers ----------
    const fmtOrdinal = (n) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const MONTHS_FULL = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const MONTHS_SHORT = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sept",
      "Oct",
      "Nov",
      "Dec",
    ];

    const asDate = (d) => (d ? new Date(d) : null);
    const yyyy_mm_dd = (d) =>
      d
        ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
            2,
            "0",
          )}-${String(d.getUTCDate()).padStart(2, "0")}`
        : null;

    const prettyDay = (d, longMonth = false) => {
      if (!d) return "";
      const day = fmtOrdinal(d.getUTCDate());
      const month = longMonth
        ? MONTHS_FULL[d.getUTCMonth()]
        : MONTHS_SHORT[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      return `${day} ${month} ${year}`;
    };

    // Anchor for "Day N": prefer enrolled date; fallback earliest of assessment/diet
    const enrolledAt = asDate(sopCreatedAt);
    const fallbackEarliest = [
      ...(assessRows || []).map((a) => asDate(a.added_date)).filter(Boolean),
      asDate(diet_sent_date),
      asDate(diet_start_date),
    ].filter(Boolean);
    const fallbackMin = fallbackEarliest.length
      ? new Date(Math.min(...fallbackEarliest.map((d) => d.getTime())))
      : null;
    const anchor = enrolledAt || fallbackMin;

    const dayIndex = (d) => {
      if (!d || !anchor) return null;
      const ms = 24 * 60 * 60 * 1000;
      return Math.max(
        1,
        Math.floor(
          (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
            Date.UTC(
              anchor.getUTCFullYear(),
              anchor.getUTCMonth(),
              anchor.getUTCDate(),
            )) /
            ms,
        ) + 1,
      );
    };
    const dayLine = (d, longMonth = false) => {
      const di = dayIndex(d);
      return di
        ? `Day ${String(di).padStart(2, "0")}- ${prettyDay(d, longMonth)}`
        : prettyDay(d, longMonth);
    };

    // ---------- Build timeline ----------
    const timeline = [];

    // Enrolled
    if (enrolledAt) {
      timeline.push({
        type: "enrolled",
        title: "Enrolled",
        date: yyyy_mm_dd(enrolledAt),
        description: dayLine(enrolledAt),
      });
    }

    // Assessment
    if (assessRows?.length) {
      const aDate = asDate(assessRows[0].added_date);
      if (aDate) {
        timeline.push({
          type: "assessment",
          title: "Assessment & ICL Filled",
          date: yyyy_mm_dd(aDate),
          description: dayLine(aDate),
        });
      }
    }

    // Diet received / started
    const sent = asDate(diet_sent_date);
    if (sent) {
      timeline.push({
        type: "diet_received",
        title: `Session ${session} Diet Received`,
        date: yyyy_mm_dd(sent),
        description: dayLine(sent),
      });
    }
    const started = asDate(diet_start_date);
    if (started) {
      timeline.push({
        type: "diet_started",
        title: `Session ${session} Diet Started`,
        date: yyyy_mm_dd(started),
        description: dayLine(started),
      });
    }

    // Inches
    for (const r of inchRows || []) {
      const d = asDate(r.posted_date);
      if (!d) continue;
      timeline.push({
        type: "inches_measured",
        title: "Inches Measured:",
        date: yyyy_mm_dd(d),
        description: dayLine(d),
        measurements: {
          chest: r.chest != null ? `${r.chest} in` : undefined,
          waist: r.waist != null ? `${r.waist} in` : undefined,
          hip: r.hip != null ? `${r.hip} in` : undefined,
        },
      });
    }

    // Weights
    const weightLabel = (days) => {
      if (days === 0) return "Start Weight";
      if (days === 5) return "Mid Session Weight";
      if (days === 10) return "End Session Weight";
      return "Weight";
    };
    for (const w of weightRows || []) {
      const d = asDate(w.posted_date);
      if (!d) continue;
      const lbl = weightLabel(Number(w.days));
      timeline.push({
        type: "weight",
        title: `${lbl} : ${Number(w.weight).toFixed(2)}kg`,
        date: yyyy_mm_dd(d),
        description: dayLine(d),
      });
    }

    // Photos
    for (const p of photoRows || []) {
      const d = asDate(p.posted_date);
      if (!d) continue;
      const isEnd = Number(p.days) === 10;
      timeline.push({
        type: isEnd ? "session_completed" : "photo",
        title: isEnd ? `Session ${session} Completed` : "Progress Photo",
        date: yyyy_mm_dd(d),
        description: dayLine(d, true),
        image: p.photo_url || undefined,
        badgeText: isEnd ? "10th Day Pic" : undefined,
      });
    }

    // Sort ascending by date
    timeline.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Program Journey",
      data: timeline,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    return next(new ErrorHandler(error, 500));
  }
};

// GET Program Summary
// INPUT: { sub_order_id }
// OUTPUT: { order_id, program_name, program_duration, start_weight, last_weight, lose_weight, goal_weight, completed_days,
//           program_expired, program_start_date, program_end_date, goals_achieved, start_again_redirection, weight_data }

const getProgramSummary = async (req, res, next) => {
  const { sub_order_id } = req.body;

  if (!sub_order_id) {
    return next(new ErrorHandler("sub_order_id is required", 400));
  }

  try {
    // 1) Program basics: from sub_orders_programs + programs_master
    const { results: progRows } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "sop.order_id",
        "sop.user_id",
        "sop.program_id",
        "sop.start_date",
        "sop.expiry_date",
        "sop.start_program_weight",
        "sop.end_program_weight",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
      ],
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: sub_order_id },
      ],
      orderBy: ["sop.sub_order_id DESC"],
    });

    if (!progRows || !progRows.length) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Program Summary",
        data: null,
      });
      return res.status(200).json(apiresponse);
    }

    const prog = progRows[0];
    const { order_id, user_id, program_id, start_date, expiry_date } = prog;

    // Get program name
    let program_name = null;
    if (program_id) {
      const { results: nameRows } = await readRecord({
        table: `${tables.programsMaster} pm`,
        selectFields: ["pm.program_name"],
        conditions: [
          { field: "pm.program_id", operator: "=", value: program_id },
        ],
        orderBy: ["pm.program_id DESC"],
      });
      program_name = nameRows?.[0]?.program_name || null;
    }

    // 2) All program weights for the sub_order_id (Program weights only)
    const { results: wRows } = await readRecord({
      table: `${tables.weightRecords} wr`,
      selectFields: [
        "wr.session",
        "wr.days",
        "wr.weight",
        "wr.posted_date",
        "wr.weight_type",
      ],
      conditions: [
        { field: "wr.sub_order_id", operator: "=", value: sub_order_id },
        { field: "wr.weight_type", operator: "=", value: 0 }, // 0 => Program Weight
      ],
      orderBy: ["wr.posted_date ASC", "wr.wmr_id ASC"],
    });

    // ---------- Helpers ----------
    const asDate = (d) => (d ? new Date(d) : null);
    const pad2 = (n) => String(n).padStart(2, "0");

    const fmtOrdinal = (n) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const MONTHS_SHORT_LOWER = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sept",
      "oct",
      "nov",
      "dec",
    ];

    const fmtDateOrdinalShort = (d) => {
      if (!d) return null;
      const day = fmtOrdinal(d.getUTCDate());
      const month = MONTHS_SHORT_LOWER[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      return `${day} ${month} ${year}`;
    };

    const fmtDDMMYYYY = (d) =>
      d
        ? `${pad2(d.getUTCDate())}-${pad2(
            d.getUTCMonth() + 1,
          )}-${d.getUTCFullYear()}`
        : null;

    const diffDaysInclusive = (s, e) => {
      if (!s || !e) return null;
      const MS = 24 * 60 * 60 * 1000;
      const sUTC = Date.UTC(
        s.getUTCFullYear(),
        s.getUTCMonth(),
        s.getUTCDate(),
      );
      const eUTC = Date.UTC(
        e.getUTCFullYear(),
        e.getUTCMonth(),
        e.getUTCDate(),
      );
      return Math.max(1, Math.round((eUTC - sUTC) / MS) + 1);
    };

    // ---------- Duration / Completed / Expired ----------
    const startDt = asDate(start_date);
    const endDt = asDate(expiry_date);
    const today = new Date();

    const program_duration_days =
      startDt && endDt ? diffDaysInclusive(startDt, endDt) : null;
    const program_duration = program_duration_days
      ? `${program_duration_days} Days`
      : null;

    // completed_days: days from start to min(today, end), inclusive; if no start, null
    let completed_days = null;
    if (startDt) {
      const cap = endDt && today > endDt ? endDt : today;
      completed_days = diffDaysInclusive(startDt, cap);
    }

    // program_expired: if today > end → days since end, else 0
    let program_expired = 0;
    if (endDt && today > endDt) {
      const MS = 24 * 60 * 60 * 1000;
      const eUTC = Date.UTC(
        endDt.getUTCFullYear(),
        endDt.getUTCMonth(),
        endDt.getUTCDate(),
      );
      const tUTC = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      );
      program_expired = Math.max(0, Math.round((tUTC - eUTC) / MS));
    }

    // ---------- Weights ----------
    // start_weight: prefer first record with days=0; fallback to sop.start_program_weight if > 0
    let start_weight = null;
    const startRow = (wRows || []).find((r) => Number(r.days) === 0);
    if (startRow?.weight != null) start_weight = Number(startRow.weight);
    else if (prog.start_program_weight && Number(prog.start_program_weight) > 0)
      start_weight = Number(prog.start_program_weight);

    // last_weight: latest posted_date; fallback to sop.end_program_weight if > 0
    let last_weight = null;
    if (wRows?.length) {
      const last = wRows[wRows.length - 1];
      if (last?.weight != null) last_weight = Number(last.weight);
    }
    if (
      (last_weight == null || Number.isNaN(last_weight)) &&
      prog.end_program_weight &&
      Number(prog.end_program_weight) > 0
    ) {
      last_weight = Number(prog.end_program_weight);
    }

    // lose_weight = start - last (rounded to 0 decimals like your example)
    let lose_weight = null;
    if (start_weight != null && last_weight != null) {
      lose_weight = Math.round((start_weight - last_weight) * 100) / 100; // keep 2dp internally
      // If you want integer like the sample:
      lose_weight = Math.round(lose_weight);
    }

    // goal_weight: not present in shared schemas; set null or fetch from your goals table
    const goal_weight = null; // TODO: replace when you share the source (e.g., users_goals.target_weight)

    // ---------- weight_data ----------
    const weight_data = [];
    let prevWeight = null;

    // Sort by posted_date ASC (already ordered), then map
    for (const r of wRows || []) {
      const d = asDate(r.posted_date);
      const wt = r.weight != null ? Number(r.weight) : null;
      const isStart = Number(r.days) === 0;

      let diff = 0;
      if (prevWeight != null && wt != null)
        diff = Math.round((prevWeight - wt) * 100) / 100; // positive = loss vs prev
      // color: start black; else loss green; gain red; no change black
      let color = "#000000";
      if (!isStart && wt != null && prevWeight != null) {
        if (wt < prevWeight) color = "#2fc56e";
        else if (wt > prevWeight) color = "#ef4444";
      }

      weight_data.push({
        session: r.session != null ? Number(r.session) : null,
        session_days: isStart
          ? "St. Wt"
          : r.days != null
            ? Number(r.days)
            : null,
        weight: wt != null ? wt.toFixed(3) : null, // sample shows mixed precisions; using 3dp for consistency
        difference: diff.toFixed(2),
        color,
        posted_date: d ? fmtDDMMYYYY(d) : null,
      });

      if (wt != null) prevWeight = wt;
    }

    // ---------- Final payload ----------
    const payload = {
      sub_order_id,
      order_id,
      program_name,
      program_duration,
      start_weight,
      last_weight,
      lose_weight,
      goal_weight,
      completed_days,
      program_expired,
      program_start_date: startDt ? fmtDateOrdinalShort(startDt) : null, // e.g., '1st sept 2025'
      program_end_date: endDt ? fmtDateOrdinalShort(endDt) : null, // e.g., '30th sept 2025'
      goals_achieved: [], // TODO: fill from your goals source/table if available
      start_again_redirection: {
        redirect_screen: "mentor_chat",
        screen_params: {},
      },
      weight_data,
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Program Summary",
      data: payload,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    return next(new ErrorHandler(error, 500));
  }
};

const getLeadMilestones = async (req, res, next) => {
  const { user_id } = req.body;
  try {
    const { results: userMilestones } = await readRecord({
      selectFields: ["*"],
      table: "user_milestones",
      conditions: [
        { field: "user_id", operator: "=", value: user_id }, // Only active success stories
      ],
      orderBy: [`milestone_id DESC`],
      pagination: { limit: 1 },
    });

    console.log(userMilestones[0]);
    let milestones = [];
    if (userMilestones.length > 0) {
      milestones = userMilestones[0].milestones;
    }

    console.log(milestones, 12345);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Milestones List",
      data: {
        header_Image:
          "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1752053688/app_images/vt1ei3y88t0vankiibng.png",
        milestones: milestones.length > 0 ? JSON.parse(milestones) : [],
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadAdditionalQuestions = async (req, res, next) => {
  const { user_id } = req.body;
  //fetch lead consultation details
  const callDetailsTable = tables.callUpdates;
  const selectcallDetailsColumns = [
    `cu.call_id`,
    `cu.schedule_date as call_schedule_date`,
    `cu.call_type`,
    `cu.call_status`,
    `cu.added_by`,
    `slot.appointment_slots`,
    `cu.extra_questions_id`,
  ];
  const callDetailsWhereCondition = [
    { field: `user_id`, operator: `=`, value: user_id },
    { field: `call_type`, operator: `=`, value: "30" },
  ];
  const { results: callDetails } = await readRecord({
    table: `${callDetailsTable} as cu`,
    selectFields: selectcallDetailsColumns,
    joins: [
      {
        type: `LEFT`,
        table: `${tables.slots} slot`,
        on: `slot.id = cu.slot_id`,
      },
    ],
    conditions: callDetailsWhereCondition,
    orderBy: ["cu.call_id DESC"],
  });
  let showConsultationForm, showDietQuestions, showRestaurantQuestions;
  console.log(callDetails, 1234567);

  if (callDetails.length == 0) {
    showConsultationForm = false;
  } else if (
    callDetails.length > 0 &&
    callDetails[0].extra_questions_id != null
  ) {
    showConsultationForm = false;
  } else {
    showConsultationForm = true;
  }

  const { results: additionalDietQuestions } = await readRecord({
    selectFields: ["*"],
    table: "additional_questions",
    conditions: [
      { field: "user_id", operator: "=", value: user_id }, // Only active success stories
      { field: "type", operator: "=", value: "Diet" },
    ],
  });

  const { results: userDetails } = await readRecord({
    selectFields: ["user_type"],
    table: "users_details",
    conditions: [{ field: "user_id", operator: "=", value: user_id }],
  });

  if (additionalDietQuestions.length > 0) {
    showDietQuestions = false;
  } else {
    showDietQuestions = true;
  }

  const { results: additionalRestaurantQuestions } = await readRecord({
    selectFields: ["*"],
    table: "additional_questions",
    conditions: [
      { field: "user_id", operator: "=", value: user_id }, // Only active success stories
      { field: "type", operator: "=", value: "Restaurant Guide" },
    ],
  });

  if (additionalRestaurantQuestions.length > 0) {
    showRestaurantQuestions = false;
  } else {
    showRestaurantQuestions = true;
  }

  if (userDetails[0].user_type == "1") {
    showDietQuestions = false;
    showRestaurantQuestions = false;
    showConsultationForm = false;
  }

  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Additional Questions",
    data: [
      {
        show_form: showConsultationForm,
        form_type: "Consultation",
        show_on: [
          {
            section_id: "consultation_card",
            type: "click",
          },
        ],
        wallet_rewards: {
          show_wallet: true,
          wallet_amount: 200,
          title: "Thankyou for answering",
          description: "**BN ₹ 200** has been credited to your\n**BN Wallet!**",
        },
        submit_data: {
          end_point: "lead-app/submit-additional-questions",
          redirect_screen: "",
          screen_params: {},
        },
        impact_on_health_score: true,
        redirect_to: "",
        steps: [
          {
            type: "CheckboxList",
            key: "what_stopped_you",
            question: "What has stopped you from achieving your goals?",
            anyOtherFieldOptions: {
              showAddMore: true,
            },
            options: [
              {
                label: "Struggling to find time",
                value: "Struggling to find time",
              },
              {
                label: "Lack of trust in service providers",
                value: "Lack of trust in service providers",
              },
              { label: "Family commitments", value: "Family commitments" },
              { label: "Work pressure", value: "Work pressure" },
              { label: "No proper guidance", value: "No proper guidance" },
              { label: "Any other (Please Specify):", value: "any_other" },
            ],
            is_compulsory: true,
            dependency: [],
          },
          {
            type: "CheckboxList",
            key: "situation_or_event",
            question: "Is there any event/situation motivating you now?",
            anyOtherFieldOptions: {
              showAddMore: true,
            },
            options: [
              { label: "Celebration", value: "Celebration" },
              { label: "Health emergency", value: "Health emergency" },
              { label: "Any big events", value: "Any big events" },
              { label: "Travel goals", value: "Travel goals" },
              { label: "Self Motivation", value: "Self Motivation" },
              { label: "Any other (Please Specify):", value: "any_other" },
            ],
            is_compulsory: true,
            dependency: [],
          },
          {
            type: "RadioGroup",
            key: "current_state_of_mind",
            question: "How would you describe your current state of mind",
            anyOtherFieldOptions: {
              showAddMore: false,
            },
            options: [
              { label: "Positive", value: "Positive" },
              { label: "Sometimes stressed", value: "Sometimes stressed" },
              { label: "Often stressed", value: "Often stressed" },
              { label: "Highly stressed", value: "Highly stressed" },
            ],
            is_compulsory: true,
            dependency: [],
          },
          {
            type: "RadioGroup",
            key: "work_arrangement",
            question: "What is your current work arrangement?",
            anyOtherFieldOptions: {
              showAddMore: false,
            },
            options: [
              { label: "Not working", value: "Not working" },
              { label: "Working from office", value: "Working from office" },
              { label: "Working from home", value: "Working from home" },
              {
                label: "Hybrid (home and office)",
                value: "Hybrid (home and office)",
              },
              { label: "I am a student", value: "I am a student" },
            ],
            is_compulsory: true,
            dependency: [],
          },
          {
            type: "CheckboxList",
            key: "occupation_involves",
            question: "Does your occupation involve any of this?",
            anyOtherFieldOptions: {
              showAddMore: false,
            },
            options: [
              {
                label: "Irregular meal timings",
                value: "Irregular meal timings",
              },
              {
                label: "Frequently eat outside",
                value: "Frequently eat outside",
              },
              {
                label: "Travel frequently (out station)",
                value: "Travel frequently (out station)",
              },
              {
                label: "Daily travelling for work",
                value: "Daily travelling for work",
              },
            ],
            is_compulsory: true,
            dependency: {
              show_when: [
                {
                  key: "work_arrangement",
                  value: "Not working",
                  condition: "!=",
                },
                {
                  key: "work_arrangement",
                  value: "I am a student",
                  condition: "!=",
                },
              ],
            },
          },
        ],
      },
      {
        show_form: showDietQuestions,
        form_type: "Diet",
        show_on: [
          {
            section_id: "home_screen_diet",
            type: "click",
          },
        ],
        wallet_rewards: {
          show_wallet: true,
          wallet_amount: 100,
          title: "Thankyou for answering",
          description: "**BN ₹ 100** has been credited to your\n**BN Wallet!**",
        },
        submit_data: {
          end_point: "lead-app/submit-additional-questions",
          redirect_screen: "diet_details",
          screen_params: {},
        },
        impact_on_health_score: true,
        steps: [
          {
            type: "RadioGroup",
            key: "tried_diet_in_past",
            question: "Have you tried any diet programs in the past?",
            anyOtherFieldOptions: {
              showAddMore: false,
            },
            options: [
              { label: "Yes", value: "Yes" },
              { label: "No", value: "No" },
            ],
            is_compulsory: true,
            dependency: [],
          },
          {
            type: "CheckboxList",
            key: "what_did_not_worked",
            question: "What didn't work for you in your previous diet program?",
            anyOtherFieldOptions: {
              showAddMore: true,
            },
            options: [
              {
                label: "Diet meals were not tasty",
                value: "Diet meals were not tasty",
              },
              {
                label: "Diet foods were expensive",
                value: "Diet foods were expensive",
              },
              {
                label: "No time to cook separately",
                value: "No time to cook separately",
              },
              {
                label: "Can’t control my cravings",
                value: "Can’t control my cravings",
              },
              {
                label: "Too restricted when socializing",
                value: "Too restricted when socializing",
              },
              {
                label: "Diet program was hard to follow",
                value: "Diet program was hard to follow",
              },
              {
                label: "Did not see much progress",
                value: "Did not see much progress",
              },
              { label: "Any Other (Please Specify):", value: "any_other" },
            ],
            is_compulsory: true,
            dependency: {
              show_when: [
                {
                  key: "tried_diet_in_past",
                  value: "Yes",
                  condition: "=",
                },
              ],
            },
          },
          {
            type: "CheckboxList",
            key: "what_worries_you",
            question: "What worries you the most about following diets?",
            anyOtherFieldOptions: {
              showAddMore: true,
            },
            options: [
              { label: "None for now", value: "None for now" },
              { label: "I fear strict diets", value: "I fear strict diets" },
              {
                label: "I can't stay hungry for too long",
                value: "I can't stay hungry for too long",
              },
              { label: "I love eating out", value: "I love eating out" },
              {
                label: "I can't eat only soups and salads",
                value: "I can't eat only soups and salads",
              },
              {
                label: "Diet meals are not tasty",
                value: "Diet meals are not tasty",
              },
              {
                label: "I can't control my cravings",
                value: "I can't control my cravings",
              },
              { label: "Any Other (Please Specify):", value: "any_other" },
            ],
            is_compulsory: true,
            dependency: {
              show_when: [
                {
                  key: "tried_diet_in_past",
                  value: "No",
                  condition: "=",
                },
              ],
            },
          },
        ],
      },
      {
        show_form: showRestaurantQuestions,
        form_type: "Restaurant Guide",
        show_on: [
          {
            section_id: "home_screen_restaurant_guide",
            type: "click",
          },
        ],
        wallet_rewards: {
          show_wallet: true,
          wallet_amount: 100,
          title: "Thankyou for answering",
          description: "**BN ₹ 100** has been credited to your\n**BN Wallet!**",
        },
        submit_data: {
          end_point: "lead-app/submit-additional-questions",
          redirect_screen: "webview",
          screen_params: {
            redirect_id: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}`,
            screen_title: "Restaurant Guide",
          },
        },
        impact_on_health_score: true,
        steps: [
          {
            type: "CheckboxList",
            key: "foods_you_consume",
            question:
              "Which of the following foods do you consume more than once in a week?",
            anyOtherFieldOptions: {
              showAddMore: false,
            },
            options: [
              { label: "Indian fast foods", value: "Indian fast foods" },
              { label: "Sugary drinks", value: "Sugary drinks" },
              { label: "Packaged snacks", value: "Packaged snacks" },
              { label: "Desserts", value: "Desserts" },
              { label: "Packaged diet foods", value: "Packaged diet foods" },
              { label: "Western fast foods", value: "Western fast foods" },
            ],
            is_compulsory: true,
            dependency: [],
          },
        ],
      },
    ],
  });

  return res.status(200).json(apiresponse);
};

const getLeadFeedbackQuestions = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Feedback Questions",
    data: {
      feedback_type: "App",
      wallet_amount: 200,
      question_list: [
        {
          question:
            "How satisfied are you with your overall experience on the app?",
          type: "star",
          is_required: true,
        },
        {
          question: "Was the app easy to navigate & use?",
          type: "star",
          is_required: true,
        },
        {
          question:
            "Are the articles, videos & tips relevant and helpful to your goals?",
          type: "star",
          is_required: true,
        },
        {
          question: "What features do you find most useful or valuable?",
          type: "list",
          list: [
            "Peer Group",
            "Health Score",
            "Guides & Kits",
            "Blogs & Videos",
            "Expert Calls",
            "Recipes",
          ],
          is_required: true,
        },
        {
          question:
            "What can we improve or add to make the app better for you.",
          placeholder: "Add a comment.....",
          type: "text",
          is_required: false,
          maxLength: 200,
        },
      ],
    },
  });

  return res.status(200).json(apiresponse);
};

const getLeadTrialDiet = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Trial Diet",
    data: [
      {
        diet_title: "<b style='font-size: 18px;'>ON RISING:</b>",
        diet_description:
          '<p>1 glass anti-bloat weight loss water <strong><a href="https://www.balancenutrition.in/recipes/recipe-details/1578" style="text-decoration:none"><u>[View recipe]</u></a></strong></p>\r\n\r\n<p><strong>[Helps in building immunity in the given weather &amp; boosts metabolism]</strong></p>\r\n\r\n<p><strong>OR</strong></p>\r\n\r\n<p>1 glass golden weight loss water <strong><a href="https://www.balancenutrition.in/recipes/recipe-details/1481" style="text-decoration:none"><u>[View recipe]</u></a></strong></p>\r\n\r\n<p><strong>[Since turmeric is anti-bacterial, it kills the harmful bacteria internally. It helps to push out all the toxins in the body and is great at cutting down fats from the body]</strong></p>\r\n',
      },
      {
        diet_title: "<b style='font-size: 18px;'>PRE BREAKFAST:</b>",
        diet_description: "N/A",
      },
      {
        diet_title: "<b style='font-size: 18px;'>BREAKFAST:</b>",
        diet_description:
          '<p>1 beetroot pancake <a href="https://www.balancenutrition.in/recipes/recipe-details/1461" style="text-decoration:none"><strong><u>[View recipe]</u></strong></a> / 1 besan oats waffle <a href="https://www.balancenutrition.in/recipes/recipe-details/1602" style="text-decoration:none"><strong><u>[View recipe]</u></strong></a>&nbsp;<strong>[You can also make it like chilla] +</strong> 2 tbsp mint coriander chutney<strong> </strong><a href="https://www.balancenutrition.in/recipes/recipe-details/188" style="text-decoration:none"><strong><u>[View recipe]</u></strong></a><strong> / </strong>2 tbsp mustard sauce<strong> [no other sauces/ketchup]</strong></p>\r\n\r\n<p><strong>OR</strong></p>\r\n\r\n<p>1 bowl of fruit porridge<strong> [using 2tbsp of instant oats + 100ml skim or nut milk + 1/2 tsp of cinnamon of powder + 1 apple/1 pear/1 papaya to this menu]&nbsp;</strong></p>\r\n\r\n<p><u><strong>[SALT FREE OPTION] [FOLLOW THIS OPTIONS 4TIMES THIS SESSION]</strong></u></p>\r\n\r\n<p><strong>[You can use any seasonal fruits of your choice] [This is a High fibre, moderate protein, salt-free option - ideal to start the day]</strong></p>\r\n\r\n<p>&nbsp;<strong>OR</strong></p>\r\n\r\n<p>1 glass papaya smoothie<strong> </strong><a href="https://www.balancenutrition.in/recipes/recipe-details/1058" style="text-decoration:none"><strong><u>[View recipes]</u></strong></a><strong> </strong>&nbsp;/ 1 glass green smoothie <a href="https://www.balancenutrition.in/recipes/recipe-details/1113" style="text-decoration:none"><strong><u>[View recipes]</u></strong></a></p>\r\n\r\n<p><strong>[can also have any smoothie from the BN app]&nbsp;</strong></p>\r\n',
      },
      {
        diet_title: "<b style='font-size: 18px;'>MID MORNING:</b>",
        diet_description:
          '<p>1 glass lime and mint infused water<strong> <a href="https://www.balancenutrition.in/recipes/recipe-details/545" style="text-decoration:none"><u>[View recipe]</u></a>[carry it in a bottle]</strong></p>\r\n\r\n<p><strong>[Benefits of infused water include appetite control, hydration, immune defense, heartburn prevention, blood sugar regulation, and weight management]</strong></p>\r\n\r\n<p><strong><em>[Prepare the infused water in a bottle and keep sipping throughout the day]</em></strong></p>\r\n\r\n<p>&nbsp;</p>\r\n',
      },
      {
        diet_title: "<b style='font-size: 18px;'>PRE WORKOUT:</b>",
        diet_description: "N/A",
      },
      {
        diet_title: "<b style='font-size: 18px;'>DURING WORKOUT:</b>",
        diet_description: "N/A",
      },
      {
        diet_title: "<b style='font-size: 18px;'>PRE LUNCH:</b>",
        diet_description: "N/A",
      },
      {
        diet_title: "<b style='font-size: 18px;'>LUNCH:</b>",
        diet_description:
          '<p>1 bowl steamed veggies&nbsp;<strong>/</strong>&nbsp;1 bowl sabzi<strong>&nbsp;[refer recipes or cook in your style in low oil]&nbsp;</strong>+ 2&nbsp;multigrain roti<strong>&nbsp;</strong><a href="https://www.balancenutrition.in/recipes/recipe-details/472"><strong><u>[View recipes]</u></strong></a>&nbsp;<strong>[no oil/ghee][SIZE OF CD]&nbsp;</strong>+ 1 bowl dal<strong>&nbsp;[avoid sugar, too much tadka or oil]</strong>&nbsp;/ 1 bowl chicken/fish curry&nbsp;<strong>[no coconut, low in oil][100 gm chicken or fish][on weekends]</strong>&nbsp;<strong>/&nbsp;</strong>1 glass buttermilk&nbsp;</p>\r\n\r\n<p><strong>OR</strong></p>\r\n\r\n<p>1 onion &amp; tomato sliced<strong> </strong>+ 1 bowl dal <strong>[refer to any dal recipe from the app recipe section] /</strong> 1 bowl paneer bhurji <a href="https://www.balancenutrition.in/recipes/recipe-details/572" style="text-decoration:none"><strong><u>[View recipe]</u></strong></a> <strong>[low in oil][make it in your style] +</strong> 1 glass of buttermilk<strong> [Unsweetened] / </strong>1 bowl raita<strong> </strong>flaxseeds and dudhi raita<strong> </strong><a href="https://www.balancenutrition.in/recipes/recipe-details/841" style="text-decoration:none"><strong><u>[View recipe]</u></strong></a>&nbsp;<strong>[you can also have simple vegetable raita here]</strong></p>\r\n\r\n<p><u><strong>[Four times in this session][if hungry have 1 small phulka but best if avoided]</strong></u></p>\r\n\r\n<p><strong>[Ideal Meal with adequate fiber, and protein][let me know if you feel hungry]</strong></p>\r\n',
      },
      {
        diet_title: "<b style='font-size: 18px;'>POST LUNCH:</b>",
        diet_description: "N/A",
      },
      {
        diet_title: "<b style='font-size: 18px;'>TEA EVENING:</b>",
        diet_description:
          "<p>1 cup tea +</p>\r\n\r\n<p><strong>[avoid having cookies/biscuits]</strong></p>\r\n\r\n<p>2 dry khakhra</p>\r\n",
      },
      {
        diet_title: "<b style='font-size: 18px;'>LATE EVENING:</b>",
        diet_description:
          "<p><strong>[If hungry]</strong></p>\r\n\r\n<p>1 fruit</p>\r\n",
      },
      {
        diet_title: "<b style='font-size: 18px;'>PRE DINNER:</b>",
        diet_description:
          "<p>1 glass of warm water <strong>[squeeze lime] [20min before dinner]</strong></p>\r\n",
      },
      {
        diet_title: "<b style='font-size: 18px;'>DINNER:</b>",
        diet_description:
          '<p>1 bowl vegetable soup  / 1 bowl tomato soup &nbsp;<strong>[can make the soup in quantity and store for 2-3 days] [You can also go ahead with other soups recipes from the App] </strong>+ 1 bowl paneer<strong> [paneer- 30 gms] [can make bhurji or a scramble or even a sabzi in low oil] /</strong> 1 bowl moong apple medley <strong><a href="https://www.balancenutrition.in/recipes/recipe-details/moong-apple-medley" style="text-decoration:none"><u>[View recipe]</u></a></strong> / 1 portion paneer chilli <strong><a href="https://www.balancenutrition.in/recipes/recipe-details/new-paneer-chilli" style="text-decoration:none"><u>[View recipe]</u></a>&nbsp;[30g paneer]</strong></p>\r\n\r\n<p><strong>THRICE TIMES IN THIS SESSION&nbsp;</strong></p>\r\n\r\n<p><strong>OR</strong></p>\r\n\r\n<p>1 bowl stir fry veggies&nbsp;<strong>[low oil]</strong><strong>&nbsp;+&nbsp;</strong>1 portion paneer tikka<strong>&nbsp;</strong><a href="https://www.balancenutrition.in/recipes/recipe-details/979"><strong><u>[View recipe]</u></strong></a><strong>&nbsp;/&nbsp;</strong>1 bowl chilli chicken&nbsp;<a href="https://www.balancenutrition.in/recipes/recipe-details/1273"><strong><u>[View recipe]</u></strong></a>&nbsp;<strong>&nbsp;/&nbsp;</strong>1 bowl tofu scramble&nbsp;<a href="https://www.balancenutrition.in/recipes/recipe-details/1129"><strong><u>[View recipe]</u></strong></a><strong>&nbsp;[Paneer/tofu - 40 gms][You can also prepare paneer or tofu in your style or refer recipes from the App]</strong></p>\r\n\r\n<p><strong>[Salads being rich in fiber will help us feel full and also will improve digestion]</strong></p>\r\n\r\n<p><strong>OR</strong></p>\r\n\r\n<p>1 bowl of stir fry veggies<strong>&nbsp;</strong><a href="https://www.balancenutrition.in/recipes/recipe-details/320"><strong><u>[View recipe]</u></strong></a><strong>[Any veggies of your choice] +&nbsp;</strong>1 high protein open toast<strong>&nbsp;</strong><a href="https://www.balancenutrition.in/recipes/recipe-details/1603"><strong><u>[View recipe]</u></strong></a><strong>&nbsp;/&nbsp;</strong>1 bowl oats khichdi&nbsp;<a href="https://www.balancenutrition.in/recipes/recipe-details/1601"><strong><u>[View recipe]</u></strong></a><strong>&nbsp;</strong>+ 1 Mug hot water with lime<strong>&nbsp;[will help for better digestion]</strong></p>\r\n\r\n<p><strong>[Maximum three times this session]</strong></p>\r\n',
      },
      {
        diet_title: "<b style='font-size: 18px;'>POST DINNER:</b>",
        diet_description: "N/A",
      },
      {
        diet_title: "<b style='font-size: 18px;'>BED TIME:</b>",
        diet_description:
          "<p>1 glass cardamom water <strong>[crush two pods of cardamom [with or without the skin), boil the powder in water, drink the cooled water]</strong></p>\r\n\r\n<p><strong>[Cardamon stimulates digestion, reduces inflammation of the stomach lining, and helps soothe heartburns. It also soothes the mucous membrane and thereby relieving the symptoms of acidity]</strong></p>\r\n\r\n<p><strong>OR</strong></p>\r\n\r\n<p>1/4 tsp hing + 1 glass warm water<strong> [strain the water and drink]</strong></p>\r\n\r\n<p><strong>[Helps keep indigestion at bay]</strong></p>\r\n",
      },
      {
        diet_title: "<b style='font-size: 18px;'>DIET NOTE:</b>",
        diet_description:
          "<p><strong>As per your goal, we have made a strict but balanced diet that will help you achieve your goal.</strong></p>\r\n\r\n<p><strong>Let us not make any changes to this diet to see the maximum results.&nbsp;</strong></p>\r\n\r\n<p><strong>Keep sipping infused water</strong></p>\r\n\r\n<p><strong>ALL THE BEST!</strong></p>\r\n\r\n<p><strong>P.S. This diet is tailor-made for YOU &amp; your better health. Please do not share it with anybody as it can impact their well-being.</strong></p>\r\n",
      },
    ],
  });

  return res.status(200).json(apiresponse);
};

const submitAdditionalQuestions = async (req, res, next) => {
  const {
    user_id,
    additional_questions,
    form_type,
    is_impact_hs,
    wallet_amount,
  } = req.body;

  try {
    if (additional_questions) {
      const columns = [`user_id`, `result`, `type`];
      const values = [user_id, JSON.stringify(additional_questions), form_type];
      const insertedResult = await insertRecord(
        tables.additionalQuestions,
        columns,
        values,
      );

      const targetObject = additional_questions.find(
        (item) => item.key === "foods_you_consume",
      );

      // Access the answer key if the object is found
      if (targetObject) {
        const answer = targetObject.answer;
        console.log(JSON.parse(answer).values, 1122334455); // This will log the answer string
      } else {
        console.log("No object with key 'foods_you_consume' found");
      }

      if (insertedResult.affectedRows > 0) {
        await addAmountWallet({
          amount: wallet_amount,
          reason: `${form_type} Additional Questions Filled`,
          user_id,
        });

        if (form_type === "Consultation") {
          const callDetailsTable = tables.callUpdates;
          const selectcallDetailsColumns = [`cu.call_id`];
          const callDetailsWhereCondition = [
            { field: `user_id`, operator: `=`, value: user_id },
            { field: `call_type`, operator: `=`, value: "30" },
          ];
          const { results: callDetails } = await readRecord({
            table: `${callDetailsTable} as cu`,
            selectFields: selectcallDetailsColumns,
            conditions: callDetailsWhereCondition,
            orderBy: ["cu.call_id DESC"],
          });

          const condition = { call_id: parseInt(callDetails[0].call_id) };
          // Perform the database update
          const callUpdateData = {
            extra_questions_id: 1,
          };

          const updateCallDetailResult = await updateRecord(
            `${tables.callUpdates}`,
            filterObjectRemoveNullValues(callUpdateData),
            condition,
          );
        }
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Additional Questions Submitted successfully",
          data: {
            success: true,
            wallet_amount: wallet_amount,
          },
        });
        return res.status(200).json(apiResponse);
      }
    }
  } catch (err) {
    console.error("Error in storing the details:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const submitFeedback = async (req, res, next) => {
  const { user_id, feedback, feedback_type, wallet_amount } = req.body;
  try {
    if (feedback) {
      const columns = [`user_id`, `feedback`, `type`];
      const values = [user_id, JSON.stringify(feedback), feedback_type];
      const insertedResult = await insertRecord(
        tables.leadFeedback,
        columns,
        values,
      );

      if (insertedResult.affectedRows > 0) {
        await addAmountWallet({
          amount: wallet_amount,
          reason: `${feedback_type} Filled`,
          user_id,
        });

        if (feedback_type === "Consultation") {
          const condition = { user_id: user_id };
          // Perform the database update
          const callUpdateData = {
            feedback_filled: 1,
          };

          const updateCallDetailResult = await updateRecord(
            `${tables.callUpdates}`,
            filterObjectRemoveNullValues(callUpdateData),
            condition,
          );
        }

        if (feedback_type === "App") {
          const condition = { user_id: user_id };
          // Perform the database update
          const userData = {
            lead_app_feedback: 1,
          };

          const updateCallDetailResult = await updateRecord(
            `${tables.userDetails}`,
            filterObjectRemoveNullValues(userData),
            condition,
          );
        }

        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Feedback Submitted successfully",
          data: {
            success: true,
            wallet_amount: wallet_amount,
          },
        });
        return res.status(200).json(apiResponse);
      }
    }
  } catch (err) {
    console.error("Error occurred in submitFeedback:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const submitWaterIntake = async (req, res, next) => {
  const { user_id, date, water_intake } = req.body;

  const userTrackerDetailstable = tables.userDailyTracker;
  const selectuserTrackerDetailsColumns = ["daily_tracker_id"];
  const userTrackerDetailsWhereCondition = [
    {
      field: `DATE(date)`,
      operator: `=`,
      value: moment(date).format("YYYY-MM-DD"),
    },
    { field: `user_id`, operator: `=`, value: user_id },
  ];
  const { results: userTrackerDetails } = await readRecord({
    table: `${userTrackerDetailstable}`,
    selectFields: selectuserTrackerDetailsColumns,
    conditions: userTrackerDetailsWhereCondition,
  });

  if (userTrackerDetails.length > 0) {
    const condition = {
      daily_tracker_id: userTrackerDetails[0].daily_tracker_id,
    };
    // Perform the database update
    const updateTrackerData = {
      water_intake: water_intake,
    };

    const updateTrackerResult = await updateRecord(
      `${userTrackerDetailstable}`,
      filterObjectRemoveNullValues(updateTrackerData),
      condition,
    );

    if (updateTrackerResult.affectedRows > 0) {
      res.status(200).json({
        success: true,
        message: "Water Intake Updated successfully",
        data: {
          success: true,
          water_intake: water_intake,
        },
      });
    }
  } else {
    const columns = ["user_id", "date", "water_intake"];
    const values = [user_id, date, water_intake];
    const insertedResult = await insertRecord(
      tables.userDailyTracker,
      columns,
      values,
    );

    if (insertedResult.affectedRows > 0) {
      res.status(200).json({
        success: true,
        message: "Water Intake Submitted successfully",
        data: {
          success: true,
          water_intake: water_intake,
        },
      });
    }
  }
};

const submitMilestones = async (req, res, next) => {
  const { user_id, milestones } = req.body;

  try {
    if (milestones) {
      const columns = [`user_id`, `milestones`, `added_by`, "added_date"];
      const values = [
        user_id,
        JSON.stringify(milestones),
        "User",
        moment().format("YYYY-MM-DD HH:mm:ss"),
      ];
      const insertedResult = await insertRecord(
        tables.userMilestones,
        columns,
        values,
      );

      if (insertedResult.affectedRows > 0) {
        await addAmountWallet({
          amount: "200",
          reason: `Milestones Filled`,
          user_id,
        });
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Milestones Submitted successfully",
          data: {
            success: true,
            wallet_amount: "200",
          },
        });
        return res.status(200).json(apiResponse);
      }
    }
  } catch (err) {
    console.error("Error in storing the details:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const ocHomeMiddleSection = async ({ userDetails }) => {
  console.log(userDetails, 2004);

  const responseArray = [
    {
      top_name: `Frequent`,
      bottom_name: `Queries`,
      redirect_id: `https://${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-faqs`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/bn_faq.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-faqs`,
        screen_title: `Ekit FAQs`,
      },
    },
    {
      top_name: `Daily`,
      bottom_name: `Essentials`,
      redirect_id: `https://${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-daily-essentials`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/daily_essentials.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-daily-essentials`,
        screen_title: `Ekit Daily Essentials`,
      },
    },
    {
      top_name: `Eat In`,
      bottom_name: `Portions`,
      redirect_id: `https://${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-eat-in-portions`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/eat_n_portions.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        screen_title: `Ekit Eat In Portions`,
      },
    },
  ];

  // Flags for notification badges
  let notifyWeight = false;
  let notifyInchLoss = false;
  let notifyPhoto = false;
  let notifyDiet = false;

  if (Number(userDetails[0].user_type) > 0) {
    console.log("yessssss", 192829389);
    const startItems = [];

    if (
      userDetails[0].active_maintenance_id ||
      userDetails[0].sub_user_status === `Maintenance`
    ) {
      startItems.push({
        top_name: `BN`,
        bottom_name: `Maintenance`,
        redirect_id: ``,
        image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit//diet.png`,
        notification_flag: false,
        redirect_screen: `maintenance`,
      });
    }

    startItems.push({
      top_name: `Quick`,
      bottom_name: `Fillers`,
      redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${userDetails[0].user_id}`,
      image: `https://bncleanse.com/images/quickFillers.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://balancenutrition.in/bn-free-filler?client_id=${userDetails[0].user_id}`,
        screen_title: `Quick Fillers`,
      },
    });

    startItems.push({
      top_name: `Alcohol`,
      bottom_name: `Guide`,
      redirect_id: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${userDetails[0].user_id}`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/alcohol_guide.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${userDetails[0].user_id}`,
        screen_title: `Alcohol Guide`,
      },
    });

    startItems.push({
      top_name: `Restaurant`,
      bottom_name: `Guide`,
      redirect_id: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${userDetails[0].user_id}`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${userDetails[0].user_id}`,
        screen_title: `Restaurant Guide`,
      },
    });

    startItems.push({
      top_name: `Diet`,
      bottom_name:
        userDetails[0].user_status === `Completed` ? `Old Diets` : `Charts`,
      redirect_id: ``,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/diet_chart_new.png`,
      notification_flag: notifyDiet,
      redirect_screen: `diet_session_list`,
    });

    // if (userDetails[0].user_status === `Active`) {
    startItems.push({
      top_name: `Photo`,
      bottom_name: `Tracker`,
      redirect_id: ``,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/photo_tracker_new.png`,
      notification_flag: notifyPhoto,
      redirect_screen: `photo_tracker_lead_oc`,
    });
    // }

    responseArray.unshift(...startItems);
  }

  // Add guides at the end if available
  if (userDetails[0].guides) {
    const { results } = await readRecord({
      table: `${tables.guides} g`,
      selectFields: [`g.guide`, `g.icon`, `g.file_path`],
      conditions: [
        {
          field: `g.guide_id`,
          operator: `IN`,
          value: JSON.parse(userDetails[0].guides),
        },
        {
          field: `g.status`,
          operator: `=`,
          value: "1",
        },
      ],
    });
    results.forEach((guide) => {
      responseArray.push({
        top_name: `${guide.guide}`,
        bottom_name: `Guide`,
        redirect_id:
          `https://${image_guide_base_url}/media/guides/pdf/` + guide.file_path,
        image: `https://${image_guide_base_url}/${guide.icon}`,
        notification_flag: false,
        redirect_screen: `webview`,
        screen_params: {
          link:
            `https://${image_guide_base_url}/media/guides/pdf/` +
            guide.file_path,
          screen_title: guide.guide,
        },
      });
    });
  }
  if (
    userDetails[0].user_status === "Active" &&
    [176, 173, 169, 166, 163].includes(userDetails[0].program_id)
  ) {
    responseArray.push({
      top_name: "Inflammation",
      bottom_name: " Guide PB",
      redirect_id: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-PB.pdf`,
      image: `https://${image_guide_base_url}/media/guides/icons/inf-pb.png`,
      notification_flag: true,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-PB.pdf`,
        screen_title: `Inflammation Guide PB`,
      },
    });
  }
  if (
    userDetails.user_status === "Active" &&
    [172, 168, 167, 162].includes(userDetails[0].program_id)
  ) {
    responseArray.push({
      top_name: "Inflammation ",
      bottom_name: "Guide IMF",
      redirect_id: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-IMF.pdf`,
      image: `https://${image_guide_base_url}/media/guides/icons/inf-imf.png`,
      notification_flag: true,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-IMF.pdf`,
        screen_title: `Inflammation Guide IMF`,
      },
    });
  }

  const middleSection = {
    title:
      userDetails[0].user_status === `Active`
        ? `Diets, Trackers & BN Guides`
        : `Old Diets & Ekit`,
    color: `#EDFEFF`,
    trackers_and_ekit: responseArray.filter(Boolean),
  };

  return middleSection;
};

const addLeadPhoto = async (req, res, next) => {
  try {
    const newData = req.body;
    const files = req.files;
    const embeddings = [];
    if (!files || files.length === 0) {
      return next(new ErrorHandler("No files provided", 500));
    }
    const images = await uploadArrayOfFilesToCloudinary(
      files,
      cloudinaryFolders.weightRecord,
      files[0].originalname,
      {
        createEmbedding: false,
      },
    );
    if (files.length > 0) {
      newData.photo_url = JSON.stringify(images);
    }
    const columns = Object.keys(newData);
    const values = Object.values(newData);
    const result = await insertRecord(tables.leadPhotoRecords, columns, values);
    if (result.affectedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Lead photo uploaded successfully",
        data: {
          weightPhotoId: result.insertId,
          wallet_amount: 150,
        },
      });
      return res.status(201).json(apiResponse);
    } else {
      return next(new ErrorHandler("Failed to add photo", 500));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadPhoto = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    //Fetch Photo as a client
    const { results: photoRecords } = await readRecord({
      selectFields: ["*"],
      table: tables.photoRecords,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: [`photo_id DESC`],
      pagination: { limit: 1 },
    });

    const { results: userDetails } = await readRecord({
      selectFields: [
        "user_status",
        "first_name",
        "last_name",
        "sub_user_status",
      ],
      table: tables.userDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    const { results: weightRecords } = await readRecord({
      selectFields: ["*"],
      table: tables.weightRecords,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: [`wmr_id DESC`],
      pagination: { limit: 1 },
    });

    const { results: latestHealthSccore } = await readRecord({
      selectFields: ["*"],
      table: tables.healthScoreClient,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: [`id DESC`],
      pagination: { limit: 1 },
    });

    const { results: leadPhotoRecords } = await readRecord({
      selectFields: ["*"],
      table: "lead_photo_records",
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: [`photo_id DESC`],
      pagination: { limit: 1 },
    });
    const photoData = {
      thenPhoto: {
        then_photo_url:
          photoRecords.length > 0
            ? JSON.parse(photoRecords[0].photo_url)[0].file.path
            : "",
        then_weight:
          weightRecords.length > 0 ? JSON.parse(weightRecords[0].weight) : "",
      },
      nowPhoto: {
        now_photo_url:
          leadPhotoRecords.length > 0
            ? JSON.parse(leadPhotoRecords[0].photo_url)[0].file?.path
            : "",
        now_weight:
          latestHealthSccore.length > 0
            ? JSON.parse(latestHealthSccore[0].weight)
            : "",
      },
    };

    let apiResponse = null;
    apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead photo fetched successfully",
      data: {
        photoData,
        upperSection: {
          title: "You've done it before, you can do it again!",
          sub_title:
            "Your previous transformation proves, you can do it again!",
          description:
            "Let's capture where are you today and restart your journey.",
        },
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserDetailsBySubOrderId = async (req, res, next) => {
  try {
    const { sub_order_id } = req.body;
    const { results } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: ["*"],
      conditions: [
        { field: "active_order_id", operator: "=", value: sub_order_id },
      ],
    });
    let userDetails = {};
    if (results.length > 0) {
      userDetails = {
        user_id: results[0].user_id,
        user_type: results[0].user_type,
      };
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User details fetched successfully",
      data: userDetails,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getGoProDetails,
  getPeerGroupDetails,
  getLeadHomeScreen,
  getLeadMilestones,
  getLeadAdditionalQuestions,
  getLeadTrialDiet,
  submitAdditionalQuestions,
  submitFeedback,
  getLeadFeedbackQuestions,
  submitStepAndSleepTracker,
  submitWaterIntake,
  getHealthScoreReport,
  getPeerGroupComparisonData,
  addLeadPhoto,
  getLeadPhoto,
  submitMilestones,
  getUserDetailsBySubOrderId,
  getLeadOCHomeScreen,
  getOCPreviousPrograms,
  getProgramJourney,
  getProgramSummary,
  getEkitProDetails,
};


