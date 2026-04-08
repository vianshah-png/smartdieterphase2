import moment from "moment/moment.js";
import {
  getFormattedLeadData,
  getFormattedUserData,
} from "../../helper/mentordbHelpers.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
const sentQueriesController = async (req, res, next) => {
  try {
    const { mentor_id, search, user_type = "Active" } = req.query;

    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }

    const normalizedType = user_type.toLowerCase();

    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();

    /* --------------------------------------------------
       STEP 1: Mongo match condition
       - Leads → no date filter
       - Active / OC → today only
    -------------------------------------------------- */
    const matchCondition = {
      mentor_id: parseInt(mentor_id),
      sender: normalizedType !== "lead" ? "mentor" : "client",
    };

    if (normalizedType !== "lead") {
      matchCondition.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }

    /* --------------------------------------------------
       STEP 2: Fetch latest sent query per user
    -------------------------------------------------- */
    const sentQueries = await clientEnquiry.aggregate([
      { $match: matchCondition },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$user_id",
          user_id: { $first: "$user_id" },
          messages: {
            $push: {
              query: "$query",
              createdAt: "$createdAt",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          messages: { $slice: ["$messages", 1] },
        },
      },
    ]);

    if (sentQueries.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No queries found",
          data: [],
          meta_data: {
            total_count: 0,
            active_count: 0,
            oc_count: 0,
            lead_count: 0,
          },
        }),
      );
    }

    const userIds = sentQueries.map((q) => q.user_id);

    /* --------------------------------------------------
       STEP 3: SQL conditions for DATA
    -------------------------------------------------- */
    const dataConditions = [
      { field: "ud.user_id", operator: "IN", value: userIds },
    ];

    if (normalizedType === "active") {
      dataConditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Active",
      });
    }

    if (normalizedType === "oc") {
      dataConditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      });
    }

    if (normalizedType === "lead") {
      dataConditions.push({
        field: "ud.user_type",
        operator: "=",
        value: "0",
      });
    }

    /* --------------------------------------------------
       STEP 4: Get filtered DATA
    -------------------------------------------------- */
    const dataFunc =
      normalizedType === "lead" ? getFormattedLeadData : getFormattedUserData;

    const { data } = await dataFunc({
      search,
      extraConditions: dataConditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {
        const sentQuery = sentQueries.find((q) => q.user_id === i.user_id);

        return {
          query_details: {
            query: sentQuery?.messages?.[0]?.query || null,
            query_sent_date: sentQuery?.messages?.[0]?.createdAt
              ? moment(sentQuery.messages[0].createdAt).format("DD-MM-YYYY")
              : null,
            query_sent_time: sentQuery?.messages?.[0]?.createdAt
              ? moment(sentQuery.messages[0].createdAt).format("HH:mm:ss")
              : null,
          },
        };
      },
    });

    /* --------------------------------------------------
       STEP 5: COUNTS — BASED ON FILTERED DATA ONLY
    -------------------------------------------------- */
    const totalCount = data.length;

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Sent queries",
        data,
        hide_columns: ["weigt_details"],
        meta_data: {
          total_count: totalCount,
          active_count: normalizedType === "active" ? totalCount : 0,
          oc_count: normalizedType === "oc" ? totalCount : 0,
          lead_count: normalizedType === "lead" ? totalCount : 0,
        },
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { sentQueriesController };
