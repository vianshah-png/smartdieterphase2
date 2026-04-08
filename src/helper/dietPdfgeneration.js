import axios from "axios";
import dotenv from "dotenv";
import { cloudinaryFolders, tables } from "./constant.js";
import { uploadArrayOfFilesToCloudinary } from "./uploadToCloudinary.js";
import { updateRecord } from "../config/query.js";

dotenv.config();

export async function uploadDietPdfToCloudinary({
  user_id,
  order_id,
  diet_details_id,
  customFilename,
  diet_id
}) {
  console.log("Function called");
  console.log(typeof user_id);
  // if (!user_id || typeof user_id !== "string") {
  //   throw new Error("Invalid or missing user_id");
  // }
  // if (!order_id || typeof order_id !== "number") {
  //   throw new Error("Invalid or missing order_id");
  // }
  // if (!diet_details_id || typeof diet_details_id !== "string") {
  //   throw new Error("Invalid or missing diet_details_id");
  // }
  
  try {
    const apiUrl = `https://balancenutrition.in/api/download-pdf?user_id=${user_id}&order_id=${order_id}&diet_details_id=${diet_details_id}`;
    // console.log("Attempting to fetch PDF from URL:", apiUrl);

    const response = await axios.get(apiUrl, {
      responseType: "arraybuffer",
    });

    const pdfBuffer = Buffer.from(response.data);
    // console.log(pdfBuffer)

    const fileObject = {
      buffer: pdfBuffer,
      mimetype: "application/pdf",
      originalname: customFilename || `diet_pdf_${user_id}.pdf`,
    };

    let dietPdf = await uploadArrayOfFilesToCloudinary(
      [fileObject],
      cloudinaryFolders.dietPdf,
      customFilename || `diet_pdf_${user_id}`,
      { createEmbedding: false }
    );



    const pdfPath = dietPdf[0].file.path
    const condition = {diet_id : diet_id};
    await updateRecord(
      `${tables.dietSessionLog}`,
      { diet_pdf: pdfPath },
      condition
    );

    // console.log("PDF uploaded to Cloudinary:", pdfPath);
    return dietPdf;
  } catch (error) {
    console.error("Error uploading PDF to Cloudinary:", {
      message: error.message,
      apiResponse: error.response?.data,
      cloudinaryError: error.http_code,
    });
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }
}
