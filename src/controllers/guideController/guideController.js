import axios from "axios";
import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { image_guide_base_url, image_guide_base_url_live, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllGuides = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    const selectFields = [
      "g.guide_id",
      "g.guide",
      "g.final_amount",
      "g.mrp",
      "g.discount",
      "g.final_amount",
      "g.file_path",
    ];
    const conditions = [
      {
        field: "g.is_active",
        operator: "=",
        value: "1",
      },
    ];
    const { results: guideResults } = await readRecord({
      table: `${tables.guides} g`,
      selectFields,
      conditions,
    });

    const { results: userDetailsResults } = await readRecord({
      table: `${tables.userDetails} ud`,
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      selectFields: ["ud.guides"],
    });

    const userGuides = userDetailsResults?.[0]?.guides || [];

    const guidesData = guideResults.map((guide) => {
      const isActive = userGuides.includes(guide.guide_id.toString());
      const decodedPath = encodeURIComponent(guide.file_path);
      return {
        ...guide,
        file_path: `https://${image_guide_base_url_live}/media/guides/pdf/${decodedPath}`,
        status: isActive ? "Active" : "Inactive",
      };
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Guides fetched successfully`,
      data: {
        guides: guidesData,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const allowGuideForUserId = async (req, res, next) => {
  try {
    const { user_id, guide_id } = req.body;

    const { results: userDetailsResults } = await readRecord({
      table: `${tables.userDetails} ud`,
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      selectFields: ["ud.guides"],
    });

    let userGuides = userDetailsResults?.[0]?.guides || "[]";
    try {
      userGuides = JSON.parse(userGuides);
    } catch (err) {
      userGuides = [];
    }

    const guideIdString = guide_id.toString();
    let notification_id = 425;
    if (userGuides.includes(guideIdString)) {
      userGuides = userGuides.filter((id) => id !== guideIdString);
      notification_id = 426;
    } else {
      userGuides.push(guideIdString);
    }

    const updateResult = await updateRecord(
      `${tables.userDetails}`,
      { guides: JSON.stringify(userGuides) },
      {
        user_id: user_id,
      }
    );
    await axios.post(
      `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
      {
        user_ids: [user_id],
        notification_id: notification_id,
        send_later: false,
        time_delay: 0,
        sent_via: "mentor_db",
        extraVariables: {
          guide: {
            guide_id: guide_id,
          },
        },
      }
    );
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Guide updated successfully`,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allowResourceForLead = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    const { resource_type, guide_id, coupon_code, mentor_id, coupon_amount } =
      req.body;
    console.log(req.body, 142);

    if (!["guide", "recipe", "coupon", "spin_to_win"].includes(resource_type)) {
      return next(
        new ErrorHandler(
          "Invalid resource_type. Must be 'guide' or 'recipe' or 'coupon' or 'spin_to_win'",
          400
        )
      );
    }
    if (resource_type === "guide" && !guide_id) {
      return next(
        new ErrorHandler("guide_id is required for guide resource_type", 400)
      );
    }
    if (resource_type === "coupon" && !coupon_code && !coupon_amount) {
      return next(
        new ErrorHandler(
          "coupon_code and coupon_amount are required for coupon resource_type",
          400
        )
      );
    }
    const { results: users } = await readRecord({
      selectFields: ["*"],
      table: tables.userDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    if (users.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }
    const { results } = await readRecord({
      selectFields: ["*"],
      table: tables.leadsActivatedFeatures,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    const guideExpireDate = moment().add(3, "days").format("YYYY-MM-DD");
    const guideAddedDate = moment().format("YYYY-MM-DD");

    if (results.length === 0) {
      const columns = ["user_id"];
      const values = [user_id];

      if (resource_type === "guide") {
        const { results: guideResults } = await readRecord({
          selectFields: ["*"],
          table: tables.guides,
          conditions: [{ field: "guide_id", operator: "=", value: guide_id }],
        });

        if (guideResults.length === 0) {
          return next(
            new ErrorHandler("Guide not found with the given ID", 404)
          );
        }

        const guide = {
          guide_id,
          guide_name: guideResults[0].guide,
          icon: `https://${image_guide_base_url}/${guideResults[0].icon}`,
          file_path: `https://${image_guide_base_url}/media/guides/pdf/${guideResults[0].file_path}`,
          guide_added_date: guideAddedDate,
          guide_end_date: guideExpireDate,
          added_by: mentor_id,
        };

        columns.push("guides");
        values.push(JSON.stringify([guide]));
      }

      if (resource_type === "recipe") {
        const recipe = {
          start_date: guideAddedDate,
          end_date: guideExpireDate,
          added_by: mentor_id,
        };
        columns.push("recipe_book");
        values.push(JSON.stringify(recipe));
      }
      if (resource_type === "coupon") {
        const coupon = {
          coupon_code: "BN20",
          start_date: guideAddedDate,
          end_date: guideExpireDate,
          added_by: mentor_id,
          coupon_amount: coupon_amount || 0,
        };
        columns.push("coupon");
        values.push(JSON.stringify(coupon));
      }
      if (resource_type === "spin_to_win") {
        const spinToWin = {
          start_date: guideAddedDate,
          end_date: guideExpireDate,
          added_by: mentor_id,
        };
        columns.push("spin_to_win");
        values.push(JSON.stringify(spinToWin));
      }
      console.log("Inserting new record:", {
        columns,
        values,
      });
      const insertResult = await insertRecord(
        tables.leadsActivatedFeatures,
        columns,
        values
      );

      if (insertResult.affectedRows > 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `${resource_type} access granted successfully`,
        });
        return res.status(200).json(apiResponse);
      }
    } else {
      const updateData = {};

      if (resource_type === "guide") {
        const { results: guideResults } = await readRecord({
          selectFields: ["*"],
          table: tables.guides,
          conditions: [{ field: "guide_id", operator: "=", value: guide_id }],
        });

        if (guideResults.length === 0) {
          return res.status(404).json({ message: "Guide not found" });
        }

        const guide = {
          guide_id,
          guide_name: guideResults[0].guide,
          icon: `https://${image_guide_base_url}/${guideResults[0].icon}`,
          file_path: `https://${image_guide_base_url}/media/guides/pdf/${guideResults[0].file_path}`,
          guide_added_date: guideAddedDate,
          guide_end_date: guideExpireDate,
        };

        const existingGuides = results[0].guides
          ? JSON.parse(results[0].guides)
          : [];
        updateData.guides = JSON.stringify([...existingGuides, guide]);
      }

      if (resource_type === "recipe") {
        const recipe = {
          start_date: guideAddedDate,
          end_date: guideExpireDate,
          added_by: mentor_id,
        };
        updateData.recipe_book = JSON.stringify(recipe);
      }
      if (resource_type === "coupon") {
        const coupon = {
          coupon_code: coupon_code,
          start_date: guideAddedDate,
          end_date: guideExpireDate,
          added_by: mentor_id,
          coupon_amount: coupon_amount || 0,
        };
        updateData.coupon = JSON.stringify(coupon);
      }
      if (resource_type === "spin_to_win") {
        const spinToWin = {
          start_date: guideAddedDate,
          end_date: guideExpireDate,
          added_by: mentor_id,
        };
        updateData.spin_to_win = JSON.stringify(spinToWin);
      }
      const updateResult = await updateRecord(
        tables.leadsActivatedFeatures,
        updateData,
        {
          user_id,
        }
      );

      if (updateResult.affectedRows > 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `${resource_type} access updated successfully`,
        });
        return res.status(200).json(apiResponse);
      }
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `No changes made to ${resource_type} access`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const removeResourceForLead = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    const { resource_type, guide_id } = req.body;
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.leadsActivatedFeatures}`,
      conditions: [
        {
          field: "user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });
    if (results.length > 0) {
      const updateData = {};
      if (resource_type === "guide") {
        const guides = JSON.parse(results[0].guides ?? "[]");
        const filteredGuides = guides.filter(
          (guide) => guide.guide_id !== guide_id
        );
        const guideExistsIndex = guides.find(
          (guide) => guide.guide_id === guide_id
        );
        const guideExists = guides[guideExistsIndex];
        filteredGuides.push({
          ...guideExists,
          guide_end_date: moment().subtract(1, "days").format("YYYY-MM-DD"),
        });
        updateData.guides = JSON.stringify(filteredGuides);
      }
      if (resource_type === "recipe") {
        const recipes = JSON.parse(results[0].recipes ?? "{}");
        recipes.end_date = moment().subtract(1, "days").format("YYYY-MM-DD");
        updateData.recipe_book = JSON.stringify(recipes);
      }
      if (resource_type === "coupon") {
        const coupons = JSON.parse(results[0].coupon ?? "{}");
        coupons.end_date = moment().subtract(1, "days").format("YYYY-MM-DD");
        updateData.coupon = JSON.stringify(coupons);
      }
      if (resource_type === "spin_to_win") {
        const spinToWin = JSON.parse(results[0].spin_to_win ?? "{}");
        spinToWin.end_date = moment().subtract(1, "days").format("YYYY-MM-DD");
        updateData.spin_to_win = JSON.stringify(spinToWin);
      }
      const updateResult = await updateRecord(
        tables.leadsActivatedFeatures,
        updateData,
        {
          user_id: user_id,
        }
      );
      if (updateResult.affectedRows > 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: `${resource_type} access removed successfully`,
        });
        return res.status(200).json(apiResponse);
      }
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `No changes made to ${resource_type} access`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const allResourcesForLead = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return next(new ErrorHandler("User ID is required", 400));
    }
    const { results } = await readRecord({
      selectFields: [
        "ud.user_id",
        "ud.user_type",
        "la.guides",
        "la.recipe_book",
        "la.coupon",
        "la.spin_to_win",
      ],
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.leadsActivatedFeatures} la`,
          on: "ud.user_id = la.user_id",
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("User not found ", 404));
    }
    const { results: guides } = await readRecord({
      selectFields: ["guide_id", "guide", "file_path"],
      table: `${tables.guides} `,
    });
    const userGuides = results[0].guides ? JSON.parse(results[0].guides) : [];
    console.log(userGuides, 367);
    const guideData = guides.map((guide) => {
      const isActive = userGuides.some(
        (ug) =>
          ug.guide_id === guide.guide_id &&
          ug.guide_end_date >= moment().format("YYYY-MM-DD")
      );
      const decodedPath = encodeURIComponent(guide.file_path);
      return {
        ...guide,
        file_path: `https://${image_guide_base_url}/media/guides/pdf/${decodedPath}`,
        status: isActive ? "active" : "inactive",
        ...(isActive
          ? {
              guide_start_date: userGuides.find(
                (ug) => ug.guide_id === guide.guide_id
              )?.guide_added_date,
              guide_end_date: userGuides.find(
                (ug) => ug.guide_id === guide.guide_id
              )?.guide_end_date,
            }
          : {}),
      };
    });
    const { results: prizeDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.prizeDetails} pd`,
      conditions: [
        {
          field: "pd.user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      data: {
        guides: guideData,
        recipe_book: JSON.parse(results[0].recipe_book || "{}"),
        coupon: JSON.parse(results[0].coupon || "{}"),
        spin_to_win: JSON.parse(results[0].spin_to_win || "{}"),
        spin_taken: prizeDetails.length > 0,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  allowGuideForUserId,
  allowResourceForLead,
  getAllGuides,
  removeResourceForLead,
  allResourcesForLead,
};
