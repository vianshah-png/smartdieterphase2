import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { rangeFormatter } from "../../helper/common.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
const scheduleNotification = async (req, res, next) => {
  const {
    notification_id,
    expiry_days,
    schedule_date,
    schedule_time,
    wallet_range,
    user_status,
    promotional,
    mode,
    auto_chat,
    gender,
    countries,
    cities,
    states,
    user_id,
    not_include_user,
    programs,
    weight_range,
    age_range,
    ethnicity,
    suggested_programs,
    health_conditions,
  } = req.body;
  try {
    const notification_time = moment(
      `${schedule_date} ${schedule_time}`,
      "YYYY-MM-DD HH:mm:ss"
    ).format("YYYY-MM-DD HH:mm:ss");
    console.log(req.body, 34);
    const new_data = {
      notification_id,
      expiry_days,
      schedule_date,
      schedule_time,
      auto_chat,
      user_id,
      not_include_user,
      wallet_range: wallet_range ? rangeFormatter(wallet_range) : "",
      user_status: user_status ? JSON.stringify(user_status) : "[]",
      gender: gender ? JSON.stringify(gender) : "[]",
      countries: countries ? JSON.stringify(countries) : "[]",
      cities: cities ? JSON.stringify(cities) : "[]",
      states: states ? JSON.stringify(states) : "[]",
      programs: programs ? JSON.stringify(programs) : "[]",
      weight_range: weight_range ? rangeFormatter(weight_range) : "",
      age_range: age_range ? rangeFormatter(age_range) : "",
      ethnicity: ethnicity ? JSON.stringify(ethnicity) : "[]",
      suggested_programs: suggested_programs
        ? JSON.stringify(suggested_programs)
        : "[]",
      health_conditions: health_conditions
        ? JSON.stringify(health_conditions)
        : "[]",

      notification_time: notification_time,
      mode,
      promotional,
    };

    const columns = Object.keys(new_data);
    const values = Object.values(new_data);
    const result = await insertRecord(
      tables.schedulesNotifications,
      columns,
      values
    );
    if (!result.affectedRows === 1) {
      return next(
        new ErrorHandler("Error While Scheduling Notitification", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Notification scheduled added successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllScheduledNotifications = async (req, res, next) => {
  const { health_conditions, programs, status, page, limit, search } = req.body;
  const pagination = { page, limit };
  const searchQuery = search
    ? {
        searchQuery: search,
        searchFields: [
          "n.title",
          "n.description",
          "n.redirect_page",
          "n.auto_chat",
          "nt.title",
          "nt.description",
          "nt.redirect_page",
          "nt.redirect_id",
        ],
      }
    : {};
  let conditions = [
    {
      field: "n.is_deleted",
      operator: "=",
      value: 0,
    },
    {
      field: "n.notification_status",
      operator: "=",
      value: "pending",
    },
  ];

  if (health_conditions && health_conditions.length > 0) {
    conditions.push({
      field: "n.health_conditions",
      operator: "JSON_CONTAINS",
      value: health_conditions.map((item) => `${item}`),
    });
  }
  if (programs && programs.length > 0) {
    conditions.push({
      field: "n.programs",
      operator: "JSON_CONTAINS",
      value: programs.map((item) => `${item}`),
    });
  }
  if (status) {
    conditions.push({
      field: "n.status",
      operator: "=",
      value: status,
    });
  }
  try {
    const selectFields = [
      "n.id",
      "n.expiry_days",
      "n.schedule_date as scheduled_date",
      "n.schedule_time as scheduled_time",
      "n.wallet_range",
      "n.user_status",
      "n.promotional",
      "n.mode",
      "n.auto_chat",
      "n.created_at",
      "n.user_id",
      "n.not_include_user",
      "n.gender",
      "n.countries",
      "n.cities",
      "n.states",
      "n.programs",
      "n.weight_range",
      "n.age_range",
      "n.ethnicity",
      "n.suggested_programs",
      "n.health_conditions",
      "nt.id as notification_id",
      "nt.title as notification_title",
      "nt.description as notification_description",
      "nt.redirect_page",
      "nt.redirect_id",
    ];

    // Fetch notifications
    const { results: result, totalCount } = await readRecord({
      table: `${tables.schedulesNotifications} n`,
      selectFields,
      pagination,
      search: searchQuery,
      conditions,
      countTotal: true,
      joins: [
        {
          table: `${tables.notifications} nt`,
          type: "LEFT",
          on: "n.notification_id = nt.id",
        },
      ],
      orderBy: ["n.created_at DESC"],
    });
    console.log(result[0], 172);
    if (!result) {
      return next(new ErrorHandler("Failed to get notifications", 400));
    }

    const countriesIds = new Set();
    const citiesIds = new Set();
    const statesIds = new Set();
    const programsIds = new Set();
    const suggestedProgramsIds = new Set();

    result.forEach((row) => {
      JSON.parse(row.countries).forEach((id) => countriesIds.add(id));
      JSON.parse(row.cities).forEach((id) => citiesIds.add(id));
      JSON.parse(row.states).forEach((id) => statesIds.add(id));
      JSON.parse(row.programs).forEach((id) => programsIds.add(id));
      JSON.parse(row.suggested_programs).forEach((id) =>
        suggestedProgramsIds.add(id)
      );
    });

    // Prepare queries, tagged by type
    const queries = [];

    if (countriesIds.size > 0) {
      queries.push({
        type: "countries",
        query: readRecord({
          table: `${tables.countries}`,
          selectFields: ["country_name", "country_id"],
          conditions: [
            {
              field: "country_id",
              operator: "IN",
              value: Array.from(countriesIds),
            },
          ],
        }),
      });
    }

    if (citiesIds.size > 0) {
      queries.push({
        type: "cities",
        query: readRecord({
          table: `${tables.cities}`,
          selectFields: ["city_name", "city_id"],
          conditions: [
            { field: "city_id", operator: "IN", value: Array.from(citiesIds) },
          ],
        }),
      });
    }

    if (statesIds.size > 0) {
      queries.push({
        type: "states",
        query: readRecord({
          table: `${tables.states}`,
          selectFields: ["state_name", "state_id"],
          conditions: [
            { field: "state_id", operator: "IN", value: Array.from(statesIds) },
          ],
        }),
      });
    }

    if (programsIds.size > 0) {
      queries.push({
        type: "programs",
        query: readRecord({
          table: `${tables.programsMaster}`,
          selectFields: ["program_name", "program_id"],
          conditions: [
            {
              field: "program_id",
              operator: "IN",
              value: Array.from(programsIds),
            },
          ],
        }),
      });
    }

    if (suggestedProgramsIds.size > 0) {
      queries.push({
        type: "suggestedPrograms",
        query: readRecord({
          table: `${tables.programsMaster}`,
          selectFields: ["program_name", "program_id"],
          conditions: [
            {
              field: "program_id",
              operator: "IN",
              value: Array.from(suggestedProgramsIds),
            },
          ],
        }),
      });
    }

    // Resolve all queries
    const queryResults = await Promise.all(queries.map((q) => q.query));

    // Map query results to their respective categories
    const resultsMap = queries.reduce((acc, query, index) => {
      const { results: queryResult } = queryResults[index];
      acc[query.type] = queryResult;
      return acc;
    }, {});

    const {
      countries = [],
      cities = [],
      states = [],
      programs = [],
      suggestedPrograms = [],
    } = resultsMap;

    const countryLookup = countries.reduce((acc, item) => {
      acc[item.country_id] = item.country_name;
      return acc;
    }, {});

    const cityLookup = cities.reduce((acc, item) => {
      acc[item.city_id] = item.city_name;
      return acc;
    }, {});

    const stateLookup = states.reduce((acc, item) => {
      acc[item.state_id] = item.state_name;
      return acc;
    }, {});

    const programLookup = programs.reduce((acc, item) => {
      acc[item.program_id] = item.program_name;
      return acc;
    }, {});

    const suggestedProgramLookup = suggestedPrograms.reduce((acc, item) => {
      acc[item.program_id] = item.program_name;
      return acc;
    }, {});
    console.log(result, 109);
    const data = result.map((row) => ({
      ...row,
      country_id: JSON.parse(row.countries || "[]"),
      city_id: JSON.parse(row.cities || "[]"),
      state_id: JSON.parse(row.states || "[]"),
      program_id: JSON.parse(row.programs || "[]"),
      suggested_prorgam_id: JSON.parse(row.suggested_programs || "[]"),
      user_status: JSON.parse(row.user_status),
      gender: JSON.parse(row.gender).map((gender) =>
        gender === 1 ? "male" : gender === 2 ? "female" : "others"
      ),
      ethnicity: JSON.parse(row.ethnicity),
      countries: JSON.parse(row.countries).map(
        (id) => countryLookup[id] || null
      ),
      cities: JSON.parse(row.cities).map((id) => cityLookup[id] || null),
      states: JSON.parse(row.states).map((id) => stateLookup[id] || null),
      programs: JSON.parse(row.programs).map((id) => programLookup[id] || null),
      suggested_programs: JSON.parse(row.suggested_programs).map(
        (id) => suggestedProgramLookup[id] || null
      ),
      health_conditions: JSON.parse(row.health_conditions) || [],
    }));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Scheduled Notifications fetched successfully",
      data,
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateScheduledNotification = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  const updatedData = req.body;
  try {
    const condition = { id: parseInt(id) };
    if (updatedData.wallet_range) {
      updatedData.wallet_range = rangeFormatter(updatedData.wallet_range);
    }
    if (updatedData.user_status) {
      updatedData.user_status = JSON.stringify(updatedData.user_status);
    }
    if (updatedData.gender) {
      updatedData.gender = JSON.stringify(updatedData.gender);
    }
    if (updatedData.countries) {
      updatedData.countries = JSON.stringify(updatedData.countries);
    }
    if (updatedData.cities) {
      updatedData.cities = JSON.stringify(updatedData.cities);
    }
    if (updatedData.states) {
      updatedData.states = JSON.stringify(updatedData.states);
    }
    if (updatedData.programs) {
      updatedData.programs = JSON.stringify(updatedData.programs);
    }
    if (updatedData.age_range) {
      updatedData.age_range = rangeFormatter(updatedData.age_range);
    }
    if (updatedData.weight_range) {
      updatedData.weight_range = rangeFormatter(updatedData.weight_range);
    }
    if (updatedData.ethnicity) {
      updatedData.ethnicity = JSON.stringify(updatedData.ethnicity);
    }
    if (updatedData.suggested_programs) {
      updatedData.suggested_programs = JSON.stringify(
        updatedData.suggested_programs
      );
    }
    if (updatedData.health_conditions) {
      updatedData.health_conditions = JSON.stringify(
        updatedData.health_conditions
      );
    }
    const success = await updateRecord(
      `${tables.schedulesNotifications}`,
      updatedData,
      condition
    );
    console.log(success);

    if (success.changedRows === 1) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Scheduled Notification updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      if (success.info.substring(0, 15) == "Rows matched: 0") {
        return next(
          new ErrorHandler(
            "No scheduled notification found with the given id",
            400
          )
        );
      } else if (
        success.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No changes made to the scheduled notifications",
        });
        return res.status(200).json(apiResponse);
      } else {
        return next(
          new ErrorHandler("Error While Updating Scheduled Notification", 500)
        );
      }
    }
  } catch (error) {
    console.error("Error updating Scheduled Notification", error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteScheduledNotification = async (req, res, next) => {
  const { id } = req.params;
  //   const { deleted_by } = req.body;

  console.log(id, 109);
  if (!id) {
    return next(new ErrorHandler("id  is not provided", 400));
  }
  try {
    const updatedData = {
      is_deleted: 1,
    };

    const condition = { id: parseInt(id) };
    const deletedNotification = await updateRecord(
      `${tables.schedulesNotifications}`,
      updatedData,
      condition
    );
    if (deletedNotification.affectedRows === 0) {
      return next(
        new ErrorHandler("No Notification found with the given id", 400)
      );
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Notification ${id} deleted Successfully`,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateSNStatusAndAddLog = async (req, res, next) => {
  const { id } = req.query;
  console.log(id, 447);
  try {
    const updateResult = await updateRecord(
      tables.schedulesNotifications,
      {
        notification_status: "sent",
      },
      { id }
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No notification found with the given id", 400)
      );
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `notification sent ${id}  Successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler(`Error while updating the notifications ${id}`, 400)
      );
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  scheduleNotification,
  getAllScheduledNotifications,
  updateScheduledNotification,
  deleteScheduledNotification,
  updateSNStatusAndAddLog,
};
