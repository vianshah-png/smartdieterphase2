import { ErrorHandler } from "../../utils/ErrorClass.js";
import QrCode from "qrcode";
import crypto from "crypto";
import { uploadFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";

function generateShortCode(length = 6) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}
const base_url = `balancenutrition.in/bn`;

async function generateQRCode(data) {
  const buffer = await QrCode.toBuffer(data, {
    color: { dark: "#000", light: "#fff" },
    width: 300,
  });

  const file = {
    fieldname: "qr_code",
    originalname: "qr_code.png",
    mimetype: "image/png",
    buffer,
  };

  return uploadFilesToCloudinary([file], "qr-codes");
}

const generateQrController = async (req, res, next) => {
  try {
    const { name, url, shortName } = req.body;
    if (!url || !name) return next(new ErrorHandler("Url is required", 400));
    const shortCode = (shortName)?shortName:generateShortCode();
    const shortUrl = `${base_url}/${shortCode}`;

    const qr = await generateQRCode(url);
    const insertedResult = await insertRecord(
      tables.shortUrls,
      ["name", "qr_code_url", "original_url", "short_url", "short_code"],
      [name, qr.qr_code.url, url, shortUrl, shortCode]
    );
    if (insertedResult.affectedRows === 0)
      return next(
        new ErrorHandler("Error Generating and Inserting Qr Code", 400)
      );
    return res.status(201).json(
      new ApiResponse({
        message: "Qr Code and Short Url",
        data: {
          short_url: shortUrl,
          qr_code_url: qr.qr_code.url,
        },
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getShortUrlsController = async (req, res, next) => {
  try {
    const { search } = req.query;
    const { results } = await readRecord({
      table: `${tables.shortUrls}`,
      selectFields: ["*"],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: ["short_url", "name", "short_code", "original_url"],
        },
      }),
      conditions: [{ field: "is_deleted", operator: "=", value: 0 }],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Short Links List Fetched Successfully",
        data:
          results.length === 0
            ? []
            : results.length === 1
            ? results[0]
            : results,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteShortUrlController = async (req, res, next) => {
  try {
    const { id } = req.query;
    const deletedRecord = await updateRecord(
      tables.shortUrls,
      {
        is_deleted: 1,
      },
      {
        id,
      }
    );
    if (deletedRecord.affectedRows == 0)
      return next(new ErrorHandler("Error While Deleting Short Url", 400));
    return res.status(200).json(
      new ApiResponse({
        message: "Short Links Deleted Successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  generateQrController,
  getShortUrlsController,
  deleteShortUrlController,
};
