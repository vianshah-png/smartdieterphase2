import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import {
  fetchUsersDetailsNew,
  generateUserIdsAndOrderById,
  getCommonJoins,
  getCommonSelectFields,
  mapOCData,
  mapUserData,
  readRecordNewForLead,
  withMap,
} from "../../helper/common.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { sendMailUtil } from "../../utils/sendEmail.js";

const approvePendingMilestone = async (req, res, next) => {
  try {
    const { milestone_id, admin_user_id, is_approved } = req.body;
    if (!milestone_id || !admin_user_id || typeof is_approved === "undefined") {
      return next(new ErrorHandler("Missing required fields", 400));
    }
    const { results } = await readRecord({
      selectFields: [
        "mfd.id",
        "mfd.photo_before",
        "mfd.photo_after",
        "mfd.progress_video",
        "mfd.user_id",
        "mfd.user_feedback",
      ],
      table: `${tables.milestoneFormData} mfd`,
      conditions: [{ field: "mfd.id", operator: "=", value: milestone_id }],
    });
    console.log(results, 30);
    if (results.length === 0) {
      return next(new ErrorHandler("Milestone not found", 404));
    }
    const {
      photo_before,
      photo_after,
      progress_video,
      user_id,
      user_feedback,
    } = results[0];
    const updateData = {
      approved_by: admin_user_id,
      approved: Number(is_approved),
      approved_at: new Date(),
      acknowledged: 1,
      acknowledged_by: admin_user_id,
      acknowledged_at: new Date(),
    };
    const updateResult = await updateRecord(
      tables.milestoneFormData,
      updateData,
      {
        id: milestone_id,
      }
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to approve milestone", 500));
    }
    if (Number(is_approved) === 1) {
      function generateOL(array) {
        return `<ol>
    ${array
      .map(
        (item, index) =>
          `<li><a href="${item.file.path}" target="_blank">File ${
            index + 1
          }</a></li>`
      )
      .join("")}
  </ol>`;
      }
      const beforePhotos = safeJSONParse(photo_before, []);
      const afterPhotos = safeJSONParse(photo_after, []);
      const progressVideos = safeJSONParse(progress_video, []);
      const mailData = {
        from: "Support <support@balancenutrition.in>",
        to: "teammarketing@balancenutrition.in",
        subject: "Social Media Update: Approved Client Transformation Content",
        html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Transformation Content Approved</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
  <p>Hi Team,</p>

  <p>We have received the transformation photos/videos from the client along with the required consent form.</p>

  <p>The submission has been carefully reviewed, and the mentor has given approval for the same.</p>

  <p>You can now proceed to use this transformation content for social media purposes across relevant platforms.</p>

  <p>All required permissions have been received from the client, and the content is approved for use as part of our success stories on social media.</p>

  <hr>

  <h3>Photos Before:</h3>
  ${generateOL(beforePhotos)}

  <h3>Photos After:</h3>
  ${generateOL(afterPhotos)}

  ${
    progressVideos.length > 0
      ? `<h3>Progress Videos:</h3>${generateOL(progressVideos)}`
      : ""
  }

  ${
    user_feedback
      ? `
        <h3>Client Feedback:</h3>
        <blockquote style="margin: 10px 0; padding: 12px 16px; background-color: #f9f9f9; border-left: 4px solid #1eacbc;">
          ${user_feedback}
        </blockquote>
      `
      : ""
  }

  <p>Let us know if you need any additional details from our end.</p>

  <p>
    Click here to view the client profile:
    <a href="https://mentor.balancenutrition.in/profile/${user_id}" target="_blank">
      Client Profile
    </a>
  </p>

  <p>Thanks,<br>
  <strong>Team Balance Nutrition</strong></p>
</body>
</html>
`,
        cc: ["khyati.rupani@balancenutrition.in"],
      };
      await sendMailUtil(mailData);
    }
    const insertProductOrderResult = await insertGeneralHamper({
      user_id: results[0].user_id,
    });
    console.log(insertProductOrderResult, 267);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Milestone approved successfully ${
        insertProductOrderResult
          ? "and hamper added"
          : "but failed to add hamper"
      }`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in approvePendingMilestone", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function insertGeneralHamper({ user_id }) {
  try {
    const { results: previousOrderId } = await readRecord({
      table: tables.product_orders,
      selectFields: ["product_order_id"],
      pagination: { page: 1, limit: 1 },
      conditions: [
        { field: "payment_method", operator: "=", value: "free" },
        { field: "payment_status", operator: "=", value: "Success" },
      ],
      orderBy: ["order_id DESC"],
    });
    const latestProductOrderId = previousOrderId[0]?.product_order_id;

    const orderCount = latestProductOrderId.split("/").pop();
    const productOrderId = "KBN/25-26/FREE/" + (Number(orderCount) + 1);
    const pack_size = "3 Pack";
    const { results } = await readRecord({
      selectFields: [
        "cd.user_id",
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as customer_name",
        "CONCAT(COALESCE(cd.phone_code,''),COALESCE(cd.phone_number,'')) as customer_phone",
        "cd.active_order_id",
        "cd.mentor_assigned",
      ],
      table: `${tables.userDetails} cd`,
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    const userDetails = results[0];
    const insertResult = await insertRecord(
      tables.product_orders,
      [
        "user_id",
        "customer_name",
        "customer_phone",
        "product_order_id",
        "product_id",
        "product_code",
        "product_name",
        "razorpay_payment_id",
        "quantity",
        "pack_size",
        "sub_order_id",
        "price_per_unit",
        "total_price",
        "payment_method",
        "order_total",
        "net_settled",
        "created_at",
        "updated_at",
        "sold_by",
        "customer_address",
        "customer_pincode",
        "customer_city",
        "customer_state",
        "customer_country",
        "payment_status",
        "hamper_type",
        "price_per_unit_to_bn",
      ],
      [
        userDetails.user_id,
        userDetails.customer_name,
        userDetails.customer_phone,
        productOrderId,
        "sampler-pack",
        "PROD_006",
        "Sampler Pack",
        "free_" + Date.now(),
        1,
        pack_size,
        userDetails.active_order_id || null,
        0.0,
        0.0,
        "free",
        0.0,
        1,
        new Date(),
        new Date(),
        userDetails.mentor_assigned,
        null,
        null,
        null,
        null,
        null,
        "Success",
        "general",
        pack_size === "Pack of 5" ? 270 : 192,
      ]
    );
    if (insertResult.affectedRows === 0) {
      return false;
    }
    return true;
  } catch (error) {
    console.log("Error in insertGeneralHamper", error);
    return false;
  }
}

const acknowledgePendingMilestone = async (req, res, next) => {
  try {
    const { milestone_id, admin_user_id } = req.body;
    const { results } = await readRecord({
      selectFields: ["mfd.id", "mfd.user_id"],
      table: `${tables.milestoneFormData} mfd`,
      conditions: [{ field: "mfd.id", operator: "=", value: milestone_id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("Milestone not found", 404));
    }
    const updateData = {
      acknowledged: 1,
      acknowledged_by: admin_user_id,
      acknowledged_at: new Date(),
    };
    const updateResult = await updateRecord(
      tables.milestoneFormData,
      updateData,
      {
        id: milestone_id,
      }
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to acknowledge milestone", 500));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Milestone acknowledged successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in acknowledgePendingMilestone", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const markMilestoneAddedToSuccessStory = async (req, res, next) => {
  try {
    const { milestone_id } = req.params;
    const { results } = await readRecord({
      selectFields: ["mfd.id"],
      table: `${tables.milestoneFormData} mfd`,
      conditions: [{ field: "mfd.id", operator: "=", value: milestone_id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("Milestone not found", 404));
    }
    const updateData = {
      added_to_story: 1,
    };
    const updateResult = await updateRecord(
      tables.milestoneFormData,
      updateData,
      {
        id: milestone_id,
      }
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to mark milestone", 500));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Milestone marked as added to success story successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in markAsAddedToSuccessStory", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function getMilestoneFilledUsersCount({ mentor_id }) {
  try {
    const counts = await readRecordUnion([
      {
        selectField: [
          "COUNT(DISTINCT mfd.user_id) as count",
          "'active' as type",
        ],
        table: `${tables.milestoneFormData} mfd`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `mfd.user_id = cd.user_id`,
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Active",
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT mfd.user_id) as count",
          "'active-approval-pending' as type",
        ],
        table: `${tables.milestoneFormData} mfd`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `mfd.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Active" },
          { field: "mfd.approved", operator: "=", value: 0 },
          { field: "mfd.acknowledged", operator: "=", value: 0 },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        selectField: ["COUNT(DISTINCT mfd.user_id) as count", "'oc' as type"],
        table: `${tables.milestoneFormData} mfd`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `mfd.user_id = cd.user_id`,
          },
        ],
        condition: [
          {
            field: "cd.user_status",
            operator: "=",
            value: "Completed",
          },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
      {
        selectField: [
          "COUNT(DISTINCT mfd.user_id) as count",
          "'oc-approval-pending' as type",
        ],
        table: `${tables.milestoneFormData} mfd`,
        join: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `mfd.user_id = cd.user_id`,
          },
        ],
        condition: [
          { field: "cd.user_status", operator: "=", value: "Completed" },
          { field: "mfd.approved", operator: "=", value: 0 },
          { field: "mfd.acknowledged", operator: "=", value: 0 },
          {
            field: "cd.mentor_assigned",
            operator: "=",
            value: mentor_id,
          },
        ],
      },
    ]);
    return counts;
  } catch (error) {
    console.log("Error in getMilestoneFilledUsersCount", error);
    return [];
  }
}

const getMilestoneFilledUsers = async (req, res, next) => {
  try {
    const { mentor_id, filter = "" } = req.body;
    const conditions = [
      { field: "cd.user_type", operator: "=", value: "1" },
      { field: "cd.mentor_assigned", operator: "=", value: mentor_id },
    ];
    const orderBy = [];
    if (filter === "active") {
      conditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Active",
      });
      orderBy.push(
        "mfd.acknowledged ASC",
        "mfd.created_at DESC",
        "mfd.approved ASC"
      );
    } else if (filter === "oc") {
      conditions.push({
        field: "cd.user_status",
        operator: "=",
        value: "Completed",
      });
      orderBy.push(
        "mfd.acknowledged ASC",
        "mfd.created_at DESC",
        "mfd.approved ASC"
      );
    } else if (filter === "active-approval-pending") {
      conditions.push(
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "mfd.approved", operator: "=", value: 0 },
        { field: "mfd.acknowledged", operator: "=", value: 0 }
      );
      orderBy.push("mfd.created_at DESC");
    } else if (filter === "oc-approval-pending") {
      conditions.push(
        { field: "cd.user_status", operator: "=", value: "Completed" },
        { field: "mfd.approved", operator: "=", value: 0 },
        { field: "mfd.acknowledged", operator: "=", value: 0 }
      );
      orderBy.push("mfd.created_at DESC");
    }
    let finalData = [];
    let totalCount = 0;
    const counts = await getMilestoneFilledUsersCount({ mentor_id });
    console.log(filter.startsWith("active"), 137);
    if (filter.startsWith("active")) {
      const { results } = await readRecord({
        selectFields: [
          "mfd.user_id",
          `CONCAT(
    '[',
    GROUP_CONCAT(
      CONCAT(
        '{',
          '"milestone_id":', mfd.id, ',',
          '"milestone_weight_kg":', IFNULL(mfd.milestone_weight_kg, 'null'), ',',
          '"photo_before":', IFNULL( mfd.photo_before, 'null'), ',',
          '"photo_after":', IFNULL( mfd.photo_after, 'null'), ',',
          '"progress_video":', IFNULL( mfd.progress_video, 'null'), ',',
          '"approved":', IFNULL(mfd.approved, 0), ',',
          '"created_at":"', mfd.created_at, '",',
          '"approved_at":', IFNULL(CONCAT('"', mfd.approved_at, '"'), 'null'), ',',
          '"approved_by":', IFNULL(CONCAT('"', ad.crm_user, '"'), 'null'), ',',
          '"acknowledged":', IFNULL(mfd.acknowledged, 0), ',',
          '"acknowledged_at":', IFNULL(CONCAT('"', mfd.acknowledged_at, '"'), 'null'), ',',
          '"acknowledged_by":', IFNULL(CONCAT('"', ab.crm_user, '"'), 'null'),',',
          '"story_permission":', IFNULL(mfd.story_permission, 0) , ',',
          '"user_feedback":', IFNULL(CONCAT('"', mfd.user_feedback, '"'), 'null') ,
        '}'
      )
      ORDER BY
        ${orderBy.join(", ")}
      SEPARATOR ','
    ),
    ']'
  ) AS milestones`,
        ],
        table: `${tables.milestoneFormData} as mfd`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `mfd.user_id = cd.user_id`,
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "ad.admin_user_id = mfd.approved_by",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ab`,
            on: "ab.admin_user_id = mfd.acknowledged_by",
          },
        ],
        conditions,
        groupBy: ["mfd.user_id"],
      });
      console.log(results, 167, "active data");
      const { userIds: user_ids, orderById } =
        generateUserIdsAndOrderById(results);
      console.log(user_ids, 170);
      if (user_ids.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Milestone data fetched successfully",
          data: [],
          totalCount: 0,
          meta_data: {
            counts: counts.reduce((acc, curr) => {
              acc[curr.type] = Number(curr.count);
              return acc;
            }, {}),
          },
        });
        return res.status(200).json(apiResponse);
      }
      const details = await fetchUsersDetailsNew({
        ids: user_ids,
        selectData: {
          active_program: true,
          suggested_program: true,
          order_summary: true,
          latest_weight_data: true,
        },
        orderBy: orderById,
      });
      console.log(details, 186);
      finalData = user_ids.map((user_id, index) => {
        const userDetails = details[index];
        const mappedData = mapUserData({
          details: userDetails,
          addFields: {
            latest_weight_data: true,
          },
          extraMappings: {
            milestone_data: [...JSON.parse(results[index].milestones)],
          },
        });
        return mappedData;
      });
      totalCount = finalData.length;
    } else if (filter.startsWith("oc")) {
      const { results } = await readRecordNewForLead({
        withQueries: [
          ...withMap.get("latest_health"),
          {
            name: "latest_weight",
            query: `
    SELECT *
    FROM (
        SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_date DESC) AS rn
        FROM ${tables.weightRecordsLead}
    ) sub`,
          },
        ],
        selectFields: [
          ...getCommonSelectFields(),
          "mfd.user_id",
          `CONCAT(
    '[',
    GROUP_CONCAT(
      CONCAT(
        '{',
          '"milestone_id":', mfd.id, ',',
          '"milestone_weight_kg":', IFNULL(mfd.milestone_weight_kg, 'null'), ',',
          '"photo_before":', IFNULL( mfd.photo_before, 'null'), ',',
          '"photo_after":', IFNULL( mfd.photo_after, 'null'), ',',
          '"progress_video":', IFNULL( mfd.progress_video, 'null'), ',',
          '"approved":', IFNULL(mfd.approved, 0), ',',
          '"created_at":"', mfd.created_at, '",',
          '"approved_at":', IFNULL(CONCAT('"', mfd.approved_at, '"'), 'null'), ',',
          '"approved_by":', IFNULL(CONCAT('"', adp.crm_user, '"'), 'null'), ',',
          '"acknowledged":', IFNULL(mfd.acknowledged, 0), ',',
          '"acknowledged_at":', IFNULL(CONCAT('"', mfd.acknowledged_at, '"'), 'null'), ',',
          '"acknowledged_by":', IFNULL(CONCAT('"', ab.crm_user, '"'), 'null'),',',
          '"story_permission":', IFNULL(mfd.story_permission, 0) ,
        '}'
      )
      ORDER BY
        ${orderBy.join(", ")}
      SEPARATOR ','
    ),
    ']'
  ) AS milestones`,
          "wrl.added_date as latest_weight_date",
          "wrl.weight as latest_weight",
        ],
        table: `${tables.milestoneFormData}  mfd`,
        joins: [
          {
            type: "INNER",
            table: `${tables.userDetails} cd`,
            on: `mfd.user_id = cd.user_id`,
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} adp`,
            on: "adp.admin_user_id = mfd.approved_by",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} ab`,
            on: "ab.admin_user_id = mfd.acknowledged_by",
          },
          {
            type: "LEFT",
            table: `latest_weight wrl`,
            on: "wrl.user_id = mfd.user_id AND wrl.rn = 1",
          },
          ...getCommonJoins(),
        ],
        conditions,
        groupBy: ["mfd.user_id"],
      });
      console.log(results, 643);
      finalData = results.map((item, index) => {
        const mappedData = mapOCData({
          details: item,
          extraMappings: {
            weight_details: {
              weight: item.latest_weight,
              added_date: item.latest_weight_date,
            },
            milestone_data: [...JSON.parse(results[index].milestones)],
          },
        });
        return mappedData;
      });
      totalCount = finalData.length;
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Milestone data fetched successfully",
      data: finalData,
      totalCount: totalCount,
      meta_data: {
        counts: counts.reduce((acc, curr) => {
          acc[curr.type] = Number(curr.count);
          return acc;
        }, {}),
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getMilestoneFilledUsers", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getPendingSuccessStoryMilestones = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search } = req.body;
    const { results, totalCount } = await readRecord({
      selectFields: [
        "mfd.milestone_weight_kg",
        "mfd.photo_before",
        "mfd.photo_after",
        "mfd.progress_video",
        "mfd.user_feedback",
        "ad.crm_user as approved_by",
        "mfd.approved_at",
        "mfd.created_at",
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as client_name",
        "cd.email_id",
        "cd.user_id",
        "mfd.id as milestone_id",
      ],
      table: `${tables.milestoneFormData} mfd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: `mfd.user_id = cd.user_id`,
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = mfd.approved_by`,
        },
      ],
      conditions: [
        { field: "mfd.added_to_story", operator: "=", value: 0 },
        { field: "mfd.approved", operator: "=", value: 1 },
      ],
      countTotal: true,
      pagination: {
        page,
        limit,
      },
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
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Success stories not added milestones fetched successfully",
      data: results.map((item) => ({
        ...item,
        photo_before: safeJSONParse(item.photo_before, []),
        photo_after: safeJSONParse(item.photo_after, []),
        progress_video: safeJSONParse(item.progress_video, []),
      })),
      totalCount,
      meta_data: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in controller getSuccessStoryNotAddedMilestones", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  approvePendingMilestone,
  acknowledgePendingMilestone,
  getMilestoneFilledUsers,
  getPendingSuccessStoryMilestones,
  markMilestoneAddedToSuccessStory,
};
