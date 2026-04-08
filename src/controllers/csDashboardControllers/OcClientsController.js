import { readRecord } from "../../config/query.js";
import { appVersions, tables } from "../../helper/constant.js";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const getTotalOcClients = async (_, res, next) => {
  try {
    const latestAndroidVersion = appVersions.latestAndroidVersion;
    const latestIosVersion = appVersions.latestIosVersion;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(ud.user_id) AS total_count",
        `COUNT(CASE WHEN 
          ((ud.device = 'Android' AND ud.app_version < '${latestAndroidVersion}') 
          OR (ud.device = 'IOS' AND ud.app_version < '${latestIosVersion}')) 
          THEN ud.user_id END) AS oc_app_not_updated`,
        `COUNT(CASE WHEN ud.device IS NULL OR ud.device = '' THEN ud.user_id END) AS oc_without_app`,
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OC Details fetched successfully",
      data: results[0],
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching OC client details:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAndroidOcClients = async (_, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(CASE WHEN ud.device = 'Android' THEN ud.user_id END) AS total_android_count",
        `COUNT(CASE WHEN ud.device = 'Android' AND ud.app_version < '${appVersions.latestAndroidVersion}'  THEN ud.user_id END) AS android_app_not_updated_count`,
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
      ],
    });
    console.log(results, 62);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Oc Android Details fetched Sucessfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getIosOcClients = async (_, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "COUNT(CASE WHEN ud.device = 'IOS' THEN ud.user_id END) AS total_ios_count",
        `COUNT(CASE WHEN ud.device = 'IOS' AND ud.app_version < '${appVersions.latestIosVersion}'  THEN ud.user_id END) AS ios_app_not_updated_count`,
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "=",
          value: "Completed",
        },
      ],
    });
    console.log(results, 62);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Oc IOS Details fetched Sucessfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOCClientsUserData = async (req, res, next) => {
  try {
    const { page, limit, search } = req.body;
    const filter = String(req.body.data).toLowerCase();
    const latestAndroidVersion = appVersions.latestAndroidVersion;
    const latestIosVersion = appVersions.latestIosVersion;
    const conditions = [
      {
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      },
    ];
    if (filter === "oc_app_not_updated") {
      conditions.push({
        orConditions: [
          {
            field: `ud.device = 'Android' AND ud.app_version < '${latestAndroidVersion}'`,
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `ud.device = 'IOS' AND ud.app_version < '${latestIosVersion}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
      });
    }
    if (filter === "oc_without_app") {
      conditions.push({
        orConditions: [
          {
            field: "ud.device",
            operator: "IS",
            value: "NULL",
            raw: true,
          },
          {
            field: "ud.device",
            operator: "=",
            value: "",
          },
        ],
      });
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
        };
      },
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "OC Clients User Data fetched Successfully",
      data,
      meta_data: {
        page,
        total_pages: total_page,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getOCAppClientsUserData = async (req, res, next) => {
  try {
    const { page, limit, search } = req.body;
    const filter = String(req.body.data).toLowerCase();
    const device_type = String(req.body.device_type).toLowerCase();
    const latestAndroidVersion = appVersions.latestAndroidVersion;
    const latestIosVersion = appVersions.latestIosVersion;
    const conditions = [
      {
        field: "ud.user_status",
        operator: "=",
        value: "Completed",
      },
    ];
    if (device_type === "android") {
      if (filter === "total") {
        conditions.push({
          field: `ud.device`,
          operator: "=",
          value: "Android",
        });
      } else {
        conditions.push(
          {
            field: `ud.device`,
            operator: "=",
            value: "Android",
          },
          {
            field: `ud.app_version`,
            operator: "<",
            value: `${latestAndroidVersion}`,
          }
        );
      }
    }
    if (device_type === "ios") {
      if (filter === "total") {
        conditions.push({
          field: `ud.device`,
          operator: "=",
          value: "IOS",
        });
      } else {
        conditions.push(
          {
            field: `ud.device`,
            operator: "=",
            value: "IOS",
          },
          {
            field: `ud.app_version`,
            operator: "<",
            value: `${latestIosVersion}`,
          }
        );
      }
    }

    const { data, total_page } = await getFormattedUserData({
      page,
      limit,
      search,
      extraConditions: conditions,
      extraGroupBy: ["ud.user_id"],
      extraObjects: (i) => {
        return {
          mentor_details: {
            mentor_assigned: i.mentor_assigned,
            mentor_assigned_phone: i.mentor_assigned_phone,
          },
        };
      },
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "OC App Clients User Data fetched Successfully",
      data,
      meta_data: {
        page,
        total_pages: total_page,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getAndroidOcClients,
  getIosOcClients,
  getOCClientsUserData,
  getTotalOcClients,
  getOCAppClientsUserData,
};
