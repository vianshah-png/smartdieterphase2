import cloudinary from "../config/cloudinaryConfig.js";
import { storeEmbedding } from "../config/qDrantConfig.js";
import {
  getImageEmbedding,
  getImageEmbeddingCloudinary,
} from "../controllers/contentDashboardControllers/imageSearchController.js";
import { v4 as uuidv4 } from "uuid";

export const getBase64 = (file) =>
  `data:${file?.mimetype};base64,${file?.buffer.toString("base64")}`;

export const uploadFilesToCloudinary = async (
  files = [],
  folder = "default-folder"
) => {
  const uploadPromises = files.flat().map((file) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        getBase64(file),
        { folder }, // Specify the folder here
        async (error, result) => {
          if (error) return reject(error);

          try {
            // Get image embeddings and metadata
            const { embeddings, metadata } = await getImageEmbeddingCloudinary(
              file.buffer,
              result.url
            );
            const id = uuidv4();

            // Store the embedding and Cloudinary URL in Qdrant
            await storeEmbedding({ id, embedding: embeddings, metadata });

            resolve({
              fieldname: file.fieldname,
              originalName: file.originalname,
              result,
            });
          } catch (embeddingError) {
            reject(embeddingError);
          }
        }
      );
    });
  });

  try {
    const results = await Promise.all(uploadPromises);
    const formattedResult = results.reduce(
      (acc, { fieldname, originalName, result }) => {
        acc[fieldname] = {
          originalName,
          public_id: result.public_id,
          url: result.secure_url,
        };
        return acc;
      },
      {}
    );
    return formattedResult;
  } catch (error) {
    console.log(error);
    throw new Error("Error Uploading Files to Cloudinary");
  }
};
// export const uploadArrayOfFilesToCloudinary = async (
//   files = [],
//   folder = "default-folder",
//   name = ""
// ) => {
//   const uploadPromises = files.flat().map((file) => {
//     return new Promise((resolve, reject) => {
//       cloudinary.uploader.upload(
//         getBase64(file),
//         {
//           folder,
//           resource_type: file.mimetype.startsWith("video") ? "video" : "auto",
//         },
//         async (error, result) => {
//           if (error) return reject(error);

//           try {
//             if (file.mimetype.startsWith("video")) {
//               resolve({
//                 file: {
//                   path: result.secure_url,
//                   name:
//                     name !== "" ? name.split(" ").join("_") : file.originalname,
//                   type: file.mimetype,
//                 },
//               });
//               return;
//             }
//             const { embeddings, metadata } = await getImageEmbeddingCloudinary(
//               file.buffer,
//               result.url
//             );
//             const id = uuidv4();

//             // Store the embedding and Cloudinary URL in Qdrant
//             await storeEmbedding(id, embeddings, metadata);

//             resolve({
//               file: {
//                 path: result.secure_url,
//                 name:
//                   name !== "" ? name.split(" ").join("_") : file.originalname,
//                 type: file.mimetype,
//               },
//             });
//           } catch (embeddingError) {
//             reject(embeddingError);
//           }
//         }
//       );
//     });
//   });

//   try {
//     const results = await Promise.all(uploadPromises);
//     return results;
//   } catch (error) {
//     console.log(error);
//     throw new Error("Error Uploading Files to Cloudinary");
//   }
// };

export const uploadArrayOfFilesToCloudinary = async (
  files = [],
  folder = "default-folder",
  name = "",
  imageSearch = {
    createEmbedding: false,
  }
) => {
  // Check if files are provided
  if (files.length === 0) {
    throw new Error("No files provided for upload.");
  }

  const uploadPromises = files.flat().map((file) => {
    console.log(file, 73);
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder,
        resource_type: "auto", // Use "auto" for all file types (image, video, etc.)
      };

      // Upload the file to Cloudinary
      cloudinary.uploader.upload(
        getBase64(file), // Assuming this function gets the base64 data of the file
        {
          folder,
          resource_type: file.mimetype.startsWith("video") ? "video" : "auto",
        },
        async (error, result) => {
          if (error) {
            return reject(error); // Reject the promise if there's an error
          }

          try {
            if (
              file.mimetype.startsWith("video") ||
              file.mimetype.startsWith("application/pdf")
            ) {
              // If it's a video or PDF, resolve with the file details
              resolve({
                file: {
                  path: result.secure_url,
                  name:
                    name !== "" ? name.split(" ").join("_") : file.originalname,
                  type: file.mimetype,
                },
              });
            } else {
              // For other file types, resolve with the file details
              let embeddingToSave = null; // Initialize embedding variable
              if (imageSearch.createEmbedding) {
                const { embeddings } = await getImageEmbeddingCloudinary(
                  file.buffer,
                  result.url
                );
                embeddingToSave = embeddings; // Assign the embedding value
              }
              resolve({
                file: {
                  path: result.secure_url,
                  name:
                    name !== "" ? name.split(" ").join("_") : file.originalname,
                  type: file.mimetype,
                },
                ...(imageSearch.createEmbedding
                  ? { embedding: embeddingToSave }
                  : {}),
              });
            }
          } catch (embeddingError) {
            reject(embeddingError); // Reject the promise if there's an error
          }
        }
      );
    });
  });

  try {
    // Wait for all file uploads to finish
    const results = await Promise.all(uploadPromises);
    return results; // Return the results of all the uploads
  } catch (error) {
    console.log(error);
    throw new Error("Error uploading files to Cloudinary.");
  }
};

export const uploadAudioFilesToCloudinary = async (
  folders = "call_recordings",
  files
) => {
  const uploadPromises = files.map((file) => {
    return cloudinary.uploader.upload(file.path, {
      resource_type: "video",
      folder: folders,
    });
  });

  try {
    const results = await Promise.all(uploadPromises);
    return results.map((result) => ({
      name: result.original_filename,
      url: result.secure_url,
    }));
  } catch (error) {
    console.error("Error uploading files to Cloudinary:", error);
    throw new Error("Failed to upload files");
  }
};
