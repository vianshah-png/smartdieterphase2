import axios from "axios";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import dotenv from "dotenv";
dotenv.configDotenv();
const BASE_URL = process.env.WATI_API_END_POINT;
const token = process.env.WATI_TOKEN;
const getMessageTemplates = async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    try {
      let url = `${BASE_URL}/v1/getMessageTemplates`;
      console.log(BASE_URL, 13);
      const result = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          pageSize: limit,
          pageNumber: page,
        },
      });
      console.log(result, 22);
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Wati Message Template Fetched Successfully",
        data: result.data.messageTemplates,
        totalCount: result.data.link.total,
      });
      return res.status(200).json([apiresponse]);
    } catch (error) {
      console.log(error.message);
      return next(new ErrorHandler("Internal Server Error", 500));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendTemplateMessage = async (req, res, next) => {
  const { whatsappNumber } = req.query;
  const { template_name, broadcast_name, parameters } = req.body;
  try {
    console.log(whatsappNumber, 45);
    console.log(template_name, broadcast_name, parameters, 46);

    const result = await axios.post(
      `${BASE_URL}/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`,
      {
        template_name: `${template_name}`,
        broadcast_name: `${broadcast_name}`,
        parameters: parameters, // Do not stringify
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log(result, 61);
    if (result.data.result === true) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Message sent to ${whatsappNumber} successfully`,
      });
      return res.status(200).json([apiResponse]);
    } else if (result.data.result === false) {
      const apiResponse = new ApiResponse({
        statusCode: 400,
        message: result.data.info,
      });
      return res.status(400).json([apiResponse]);
    }
  } catch (error) {
    console.log(error.response ? error.response : error, 64);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendTemplateMessages = async (req, res, next) => {
  const { template_name, broadcast_name, receivers } = req.body;
  try {
    const result = await axios.post(
      `${BASE_URL}/v1/sendTemplateMessages`,
      {
        template_name: `${template_name}`,
        broadcast_name: `${broadcast_name}`,
        receivers: receivers,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(result, 93);
    if (result.status === 200) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Messages sent successfully`,
      });
      return res.status(200).json([apiResponse]);
    }
  } catch (error) {
    console.log(error.response ? error.response : error, 95);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getMessageTemplates, sendTemplateMessage, sendTemplateMessages };
