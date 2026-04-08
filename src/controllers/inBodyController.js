import "dotenv/config";
import axios from "axios";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { insertRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
const inbodyWebHook = async (req, res, next) => {
  try {
    const { TestDatetimes, UserID } = req.body;

    const insertResult = await insertRecord(
      tables.bcaTable,
      ["TestDatetimes", "UserID"],
      [TestDatetimes, UserID]
    );
    console.log(insertResult, 15);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addUser = async (req, res, next) => {
  const { name, iD, phone, gender, age, height, birthDay, userRegDate } =
    req.body;
  try {
    const insertResult = await axios.post(
      "https://apiind.lookinbody.com/User/InsertUser",
      {
        name,
        iD,
        phone,
        gender,
        age,
        height,
        birthDay,
        userRegDate,
      },
      {
        headers: {
          "API-KEY": process.env.IN_BODY_API_KEY,
          Account: process.env.IN_BODY_ACCOUNT,
        },
      }
    );
    console.log(insertResult, 21);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return next(
        new ErrorHandler(error.response.data.Message, error.response.status)
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getTodayUser = async (req, res, next) => {
  const { date } = req.query;
  try {
    // Sending 'date' as a query parameter in the GET request
    const userData = await axios.post(
      "https://apiind.lookinbody.com/User/GetTodayNewUser",
      {
        Date: date,
      },
      {
        headers: {
          "API-KEY": process.env.IN_BODY_API_KEY,
          Account: process.env.IN_BODY_ACCOUNT,
        },
      }
    );

    // Prepare and send response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "",
      data: userData.data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (axios.isAxiosError(error)) {
      return next(
        new ErrorHandler(error.response.data.Message, error.response.status)
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getDateTimeUserByToken = async (req, res, next) => {
  if (!req.body.usertoken) {
    return next(new ErrorHandler("User token is required", 400));
  }
  try {
    const dateTimes = await axios.post(
      "https://apiind.lookinbody.com/InBody/GetDatetimes",
      {
        userToken: req.body.usertoken,
      },
      {
        headers: {
          "API-KEY": process.env.IN_BODY_API_KEY,
          Account: process.env.IN_BODY_ACCOUNT,
        },
      }
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "",
      data: dateTimes.data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (axios.isAxiosError(error)) {
      console.log("hello");
      return next(new ErrorHandler("No data time found for this token", 404));
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getFullInBodyDataByDateTime = async (req, res, next) => {
  if (!req.body.usertoken || !req.body.Datetimes) {
    return next(new ErrorHandler("Usertokena and Date time is required", 400));
  }
  const formatDate = (dateStr) =>
    dateStr.replace(
      /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
      "$1-$2-$3 $4:$5:$6"
    );

  try {
    const userData = await axios.post(
      "https://apiind.lookinbody.com/InBody/GetFullInBodyData",
      {
        usertoken: req.body.usertoken,
        Datetimes: req.body.Datetimes,
      },
      {
        headers: {
          "API-KEY": process.env.IN_BODY_API_KEY,
          Account: process.env.IN_BODY_ACCOUNT,
        },
      }
    );
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `In body data fetched successfully for date ${formatDate(
        req.body.Datetimes
      )}`,
      data: userData.data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (axios.isAxiosError(error)) {
      return next(
        new ErrorHandler(error.response.data.Message, error.response.status)
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllUserDataByToken = async (req, res, next) => {
  if (!req.body.usertoken) {
    return next(new ErrorHandler("User token is required", 400));
  }
  try {
    const formatDate = (dateStr) =>
      dateStr.replace(
        /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
        "$1-$2-$3 $4:$5:$6"
      );
    const dateTimes = await axios.post(
      "https://apiind.lookinbody.com/InBody/GetDatetimes",
      {
        usertoken: req.body.usertoken,
      },
      {
        headers: {
          "API-KEY": process.env.IN_BODY_API_KEY,
          Account: process.env.IN_BODY_ACCOUNT,
        },
      }
    );
    console.log(dateTimes, 158);
    let finalData = [];
    for (let dateTime of dateTimes.data) {
      console.log(dateTime);
      if (dateTime !== "" && dateTime !== undefined && dateTime !== null) {
        const userData = await axios.post(
          "https://apiind.lookinbody.com/InBody/GetFullInBodyData",
          {
            usertoken: req.body.usertoken,
            Datetimes: dateTime,
          },
          {
            headers: {
              "API-KEY": process.env.IN_BODY_API_KEY,
              Account: process.env.IN_BODY_ACCOUNT,
            },
          }
        );
        console.log(userData.data, 205);
        finalData.push({
          dateTime: formatDate(dateTime),
          data: userData.data,
        });
      }
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "In body data fetched successfully for all date times",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (axios.isAxiosError(error)) {
      return next(
        new ErrorHandler(error.response.data.Message, error.response.status)
      );
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addUser,
  getTodayUser,
  getDateTimeUserByToken,
  getFullInBodyDataByDateTime,
  getAllUserDataByToken,
  inbodyWebHook,
};
