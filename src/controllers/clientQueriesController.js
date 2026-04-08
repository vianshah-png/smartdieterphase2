import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { getFormattedUserData } from "../helper/mentordbHelpers.js";

const getClientQueries = async (req, res, next) => {
  try {
    const { client_id, page, limit, search } = req.query;

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      base_table: `${tables.clientQueries} cq`,
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "cq.user_id = ud.user_id",
        },
      ],
      extraSelectFields: [
        "cq.id as client_query_id",
        "cq.query as client_query",
        "cq.source as client_query_source",
        "cq.comment as client_query_comment",
        "cq.status as client_query_status",
        "cq.added_date as client_added_date",
        "cq.resolved_at as client_resolved_at",
      ],
      ...(client_id && {
        extraConditions: [
          {
            field: "cq.user_id",
            operator: "=",
            value: parseInt(client_id),
          },
        ],
      }),
      extraGroupBy: ["cq.id"],
      extraOrderBy: ["cq.added_date DESC"],
      extraObjects: (i) => {
        return {
          client_query: {
            client_query_id: i.client_query_id,
            client_query: i.client_query,
            client_query_source: i.client_query_source,
            client_query_status: i.client_query_status,
            client_query_comment: i.client_query_comment,
            client_added_date: `${moment(i.client_added_date).format(
              "DD-MM-YYYY"
            )} ${moment(i.client_added_date).fromNow()}`,
            ...(i.client_resolved_at && {
              client_resolved_at: `${moment(i.client_resolved_at).format(
                "DD-MM-YYYY"
              )} ${moment(i.client_resolved_at).fromNow()}`,
            }),
          },
        };
      },
    });

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Queries Fetched Successfully",
      data: data,
      totalCount: total_page,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateClientQueriesStatus = async (req, res, next) => {
  try {
    const { client_query_id, status, comment } = req.body;
    const { results } = await readRecord({
      table: `${tables.clientQueries} cq`,
      selectFields: ["cq.status"],
      conditions: [
        {
          field: "cq.id",
          operator: "=",
          value: client_query_id,
        },
      ],
    });
    if (!results || results.length === 0) {
      return next(
        new ErrorHandler(`No Query Found with provided ${client_query_id}`, 404)
      );
    }
    const queryResult = results[0];
    if (queryResult.status === "done") {
      return next(
        new ErrorHandler(
          "Query status is already 'done' and cannot be changed",
          400
        )
      );
    }
    if (queryResult.status === "in-process" && status === "pending") {
      return next(
        new ErrorHandler(
          "Status cannot be changed to 'pending' from 'in-progress'",
          400
        )
      );
    }
    if (queryResult.status === status) {
      return next(
        new ErrorHandler(`Status of this query is Already in ${status}`, 400)
      );
    }
    const updateResult = await updateRecord(
      `${tables.clientQueries}`,
      {
        status,
        comment,
        ...(status === "done" && {
          resolved_at: moment().format("YYYY-MM-DD:HH:mm:ss"),
        }),
      },
      {
        id: client_query_id,
      }
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler(`Error While Updating Client Query`, 404));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Query Status Updated Successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeClientQueryAssignedTo = async (req, res, next) => {
  try {
    const { query_id, assign_to } = req.body;
    const { results } = await readRecord({
      table: `${tables.clientQueries} cl`,
      selectFields: ["cl.status as query_status"],
      conditions: [
        {
          field: "cl.id ",
          operator: "=",
          value: query_id,
        },
      ],
    });
    if (results[0].query_status === "done") {
      return next(
        new ErrorHandler("Query is already resolved, Cant Resolve Now", 400)
      );
    }
    const updateResult = await updateRecord(
      `${tables.clientQueries}`,
      {
        assigned_to: assign_to,
      },
      {
        id: query_id,
      }
    );
    if (updateResult.affectedRows === 0) {
      return next(new ErrorHandler(`Error While Updating Client Query`, 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Client Query Assigned To Updated Successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const pendingClientQueriesCount = async (_, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.clientQueries} cq`,
      selectFields: ["COUNT(*) as count"],
      conditions: [
        {
          field: "cq.status",
          operator: "=",
          value: "pending",
        },
      ],
    });
    if (!results || results.length === 0) {
      return next(new ErrorHandler("No Pending Queries Found", 404));
    }
    const countResult = results[0];
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Pending Client Queries Count Fetched Successfully",
      data: countResult.count,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addClientQuery = async (req, res, next) => {
  try {
    const { user_id, query, comment, source, query_date } = req.body;
    const columns = ["user_id", "query", "source", "comment", "added_date"];
    const values = [
      user_id,
      query,
      source,
      comment,
      query_date ? query_date : moment().format("YYYY-MM-DD"),
    ];
    const queryResult = await insertRecord(
      `${tables.clientQueries}`,
      columns,
      values
    );
    if (!queryResult.affectedRows === 0) {
      return next(new ErrorHandler("Error While Adding Client Query", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 201,
      message: "Client Query Added Successfully",
    });
    return res.status(201).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getClientQueries,
  updateClientQueriesStatus,
  pendingClientQueriesCount,
  addClientQuery,
  changeClientQueryAssignedTo,
};
