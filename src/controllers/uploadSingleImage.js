import cloudinary from "../config/cloudinaryConfig.js";
export const getBase64 = (file) =>
  `data:${file?.mimetype};base64,${file?.buffer.toString("base64")}`;
const uploadSingleImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Upload the image to Cloudinary
    const file = req.file;
    console.log(file);
    const result = await cloudinary.uploader.upload(getBase64(file), {
      folder: "app_images", // Optional: specify a folder name,
      resource_type: file.mimetype.startsWith("video") ? "video" : "auto",
    });

    // Return the secure URL of the uploaded image
    res.status(200).json({ imageUrl: result.secure_url });
  } catch (error) {
    console.log("Error uploading to Cloudinary:", error);
    res.status(500).json({ error: "Upload failed" });
  }
};

// Function to get the file extension based on the MIME type
// Utility function to map MIME types to file extensions
const getFileExtension = (mimeType) => {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "video/mp4":
      return ".mp4";
    case "application/pdf":
      return ".pdf";
    case "text/csv":
      return ".csv";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return ".xlsx";
    case "application/vnd.ms-excel":
      return ".xls";
    case "application/vnd.ms-powerpoint":
      return ".ppt";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return ".pptx";
    case "application/msword":
      return ".doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    default:
      return ""; // fallback
  }
};

// Cloudinary upload function
export const uploadArrayOfFilesToCloudinary = async (
  files = [],
  folder = "default-folder"
) => {
  if (!files.length) {
    throw new Error("No files provided for upload.");
  }

  const uploadPromises = files.flat().map((file) => {
    return new Promise((resolve, reject) => {
      const extension = getFileExtension(file.mimetype) || "";
      const fileNameWithoutSpaces = file.originalname
        .replace(/\.[^/.]+$/, "") // remove original extension
        .replace(/\s+/g, "_"); // replace spaces with underscores
      const publicId = fileNameWithoutSpaces + extension;

      // Decide resource_type
      let resourceType = "auto";
      if (
        file.mimetype?.startsWith("video") ||
        file.mimetype?.includes("msword") ||
        file.mimetype?.includes("spreadsheetml") ||
        file.mimetype?.includes("ms-excel") ||
        file.mimetype?.includes("presentationml") ||
        file.mimetype?.includes("powerpoint") ||
        file.mimetype === "application/pdf"
      ) {
        resourceType = "raw";
      }

      // Upload using buffer
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          public_id: publicId,
          use_filename: true,
          unique_filename: false,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            path: result.secure_url,
            type: file.mimetype,
            name: file.originalname,
          });
        }
      );

      stream.end(file.buffer); // Send file buffer to Cloudinary
    });
  });

  try {
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    throw new Error("Error uploading files to Cloudinary.");
  }
};

// Function to handle multiple file uploads
const uploadAnyFile = async (req, res) => {
  console.log(req.files);
  console.log(req.file);
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  try {
    const result = await uploadArrayOfFilesToCloudinary(
      req.files,
      "content_files"
    );

    res.status(200).json({ files: result });
  } catch (error) {
    console.log("Error uploading files to Cloudinary:", error);
    res.status(500).json({ error: "Upload failed" });
  }
};

export const deleteFromCloudinary = async (filePath) => {
  try {
    if (!filePath) return;

    // Extract public_id from Cloudinary URL
    // Example: https://res.cloudinary.com/demo/image/upload/v1234/products/slug/image.jpg
    // Extract: products/slug/image
    let publicId = filePath;
    
    if (filePath.includes('cloudinary.com')) {
      const parts = filePath.split('/upload/');
      if (parts[1]) {
        // Remove version (v1234567890) and get the rest
        publicId = parts[1].split('/').slice(1).join('/');
        // Remove file extension
        publicId = publicId.substring(0, publicId.lastIndexOf('.'));
      }
    }

    console.log(`Deleting from Cloudinary: ${publicId}`);
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Cloudinary delete result:', result);
    
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    // Don't throw error, just log it - we don't want to fail the update if deletion fails
  }
};

export const deleteMultipleFromCloudinary = async (filePaths) => {
  if (!filePaths || !Array.isArray(filePaths)) return;
  
  const deletePromises = filePaths.map(path => deleteFromCloudinary(path));
  return Promise.all(deletePromises);
};

export { uploadSingleImage, uploadAnyFile };
