import { readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getAllCountries = async (req, res, next) => {
  const { page, limit, search, id } = req.query;
  try {
    const { results: allCountries, totalCount } = await readRecord({
      table: tables.countries,
      selectFields: [
        "country_name",
        "country_id",
        "phonecode",
        "flag",
        "zone_name",
      ],
      pagination: { limit, page },
      search: { searchQuery: search },
      conditions: [
        { field: "country_id", operator: "!=", value: "0" },
        ...(id ? [{ field: "country_id", operator: "=", value: id }] : []),
      ],

      countTotal: true,
    });
    if (!allCountries)
      return next(new ErrorHandler("Error While fetching countries"));
    if (allCountries.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Countries fetched successfully",
        data: [],
      });

      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Countries fetched successfully",
      data: allCountries,
      totalCount,
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllStatesByCountryId = async (req, res, next) => {
  const { countryIds, page, limit, search } = req.query;
  // if (countryIds) return next(new ErrorHandler("countryId is required", 400));
  try {
    let conditions;
    if (countryIds) {
      conditions = [
        { field: "country_id", operator: "IN", value: JSON.parse(countryIds) },
        { field: "state_id", operator: "!=", value: "0" },
      ];
    }
    const { results: allStates, totalCount } = await readRecord({
      table: tables.states,
      selectFields: ["state_name", "state_id", "country_id"],
      conditions: conditions,
      pagination: { limit, page },
      search: { searchQuery: search },
      countTotal: true,
    });
    if (!allStates)
      return next(new ErrorHandler("Error While fetching states"));
    if (allStates.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "States fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "States fetched successfully",
      data: allStates,
      totalCount,
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllCitiesByStateId = async (req, res, next) => {
  const { stateIds, page, limit, search } = req.query;
  try {
    let conditions;
    if (stateIds) {
      conditions = [
        { field: "state_id", operator: "IN", value: JSON.parse(stateIds) },
        { field: "city_id", operator: "!=", value: "0" },
      ];
    }

    const { results: allCities, totalCount } = await readRecord({
      table: tables.cities,
      selectFields: ["city_name", "city_id", "state_id"],
      conditions: conditions,
      pagination: { limit, page },
      search: { searchQuery: search },
      countTotal: true,
    });

    if (!allCities)
      return next(new ErrorHandler("Error While fetching cities", 400));
    if (allCities.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Cities fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Cities fetched successfully",
      data: allCities,
      totalCount,
    });

    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getRegion = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: tables.regions,
      selectFields: ["region_id", "region_name"],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data fetched Successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getExecutiveSummary:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCountryOnregion = async (req, res, next) => {
  let { region_id } = req.query;

  try {
    // Parse region_id if it's a JSON array string
    if (typeof region_id === "string") {
      try {
        region_id = JSON.parse(region_id);
      } catch (err) {
        // If parsing fails, fallback to array with single item
        region_id = [region_id];
      }
    }

    if (!Array.isArray(region_id)) {
      // Make sure it's an array
      region_id = [region_id];
    }

    // Now use region_id array in your query
    const { results: existingCountryId } = await readRecord({
      table: tables.regionsMembers,
      selectFields: ["country_id"],
      conditions: [{ field: "region_id", operator: "IN", value: region_id }],
    });

    const countryIds = existingCountryId.map((row) => row.country_id);

    if (countryIds.length === 0) {
      return res.status(200).json({
        statusCode: 200,
        message: "No country found for the given region(s)",
        data: [],
      });
    }

    const { results: existingCountries } = await readRecord({
      table: tables.countries,
      selectFields: ["country_id", "country_name"],
      conditions: [{ field: "country_id", operator: "IN", value: countryIds }],
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Data fetched successfully",
      data: existingCountries,
    });
  } catch (error) {
    console.error("Error in getCountryOnregion:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getAllCountries,
  getAllStatesByCountryId,
  getAllCitiesByStateId,
  getRegion,
  getCountryOnregion,
};
