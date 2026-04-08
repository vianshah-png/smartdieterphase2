import cloudinary from "../config/cloudinaryConfig.js";

async function deleteResourcesFromCloudinary(publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    throw new Error("The publicIds parameter must be a non-empty array.");
  }

  // Create a list of promises for deleting each resource
  const deletePromises = publicIds.map((publicId) =>
    cloudinary.uploader.destroy(publicId)
  );

  try {
    // Wait for all deletion promises to resolve
    const results = await Promise.all(deletePromises);
    console.log("Deletion results:", results);
  } catch (error) {
    console.error("Error deleting resources:", error);
    throw error; // Rethrow the error for further handling if needed
  }
}

export { deleteResourcesFromCloudinary };
