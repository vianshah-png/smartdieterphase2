import { client, storeEmbedding } from "../../config/qDrantConfig.js";
// import { createCanvas, Image, loadImage } from "canvas";
// import * as tf from "@tensorflow/tfjs-node";
// import * as mobilenet from "@tensorflow-models/mobilenet";
import cloudinary from "../../config/cloudinaryConfig.js";
import { v4 as uuidv4 } from "uuid";
import { universalSearchForImageLink } from "./searchController.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import sharp from "sharp";

const NEW_COLLECTION = "sumedh";
let imageModel;
/*
async function loadImageModel() {
  try {
    imageModel = await mobilenet.load();
    console.log("Image model loaded successfully.");
  } catch (error) {
    console.error("Error loading image model:", error);
  }
}

(async () => {
  await loadImageModel();
})();
*/
async function getImageEmbeddingSearch(imagePath) {
  console.log(imagePath, 86);
  if (!imageModel) {
    throw new Error(
      "Image model is not loaded. Please ensure the image model is loaded before calling getImageEmbedding."
    );
  }

  try {
    // Load and preprocess the image
    let width = 224;
    let height = 224;
    try {
      const metadata = await sharp(imagePath).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch (error) {
      console.log("Error getting image metadata:", error);
    }
    const image = await loadImage(imagePath);
    const canvas = createCanvas(width, height); // Ensure the image is 224x224
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height); // Resize image to 224x224

    // Convert the canvas to a tensor
    const tensor = tf.browser.fromPixels(canvas).toFloat().expandDims(); // Add batch dimension

    // Use the MobileNet model to get predictions (features)
    const prediction = imageModel.infer(tensor, "conv_preds"); // Extract features
    const embeddings = prediction.flatten().arraySync(); // Flatten and convert to array

    // Extract metadata
    const metadata = {
      imagePath: imagePath, // or extract any other relevant metadata
      width: canvas.width,
      height: canvas.height,
    };

    console.log("Image embedding extracted:", embeddings);
    console.log("Image metadata:", metadata);

    return {
      embeddings: embeddings,
      metadata: metadata,
    };
  } catch (error) {
    console.error("Error processing image:", error);
    throw error;
  }
}

async function searchImageInCollection(imageBuffer) {
  console.log(imageBuffer, 79);
  try {
    const imageEmbedding = await getImageEmbeddingSearch(imageBuffer);
    console.log("Image Embedding:", imageEmbedding, 85);

    const response = await client.search("content", {
      vector: imageEmbedding.embeddings,
      limit: 5,
    });
    console.log(response, 90, "image search response");

    const result = response
      .filter((item) => item.payload.photo_url)
      .map((item) => item.payload.photo_url);
    // console.log(result, 78);
    const query = result
      .map((url) => {
        // Extract filename and extension
        const filename = url.split("/").pop();
        // Extract ID and extension
        const [id, extension] = filename.split(".");
        return `${id}.${extension}`;
      })
      .join(",");
    console.log(query, "query for search");
    const finalResult = await universalSearchForImageLink(query);
    console.log(finalResult, 89);
    return finalResult;
  } catch (error) {
    console.error("Error searching for similar images:", error);
    throw error;
  }
}

async function searchImageInCollectionService(imageBuffer) {
  console.log(imageBuffer, 101);
  try {
    const imageEmbedding = await getImageEmbeddingSearch(imageBuffer);
    console.log("Image Embedding:", imageEmbedding, 85);

    const response = await client.search("photos", {
      vector: imageEmbedding.embeddings,
      limit: 5,
    });
    console.log(response, 110, "image search response");
    return response;
  } catch (error) {
    console.error("Error searching for similar images:", error);
    throw error;
  }
}
const searchImageByImageService = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res
        .status(400)
        .json({ error: "No file uploaded or file buffer is empty" });
    }

    // Access the image buffer directly
    const imageBuffer = req.file.buffer;
    console.log("Image buffer:", imageBuffer);

    // Call your search function with the image buffer
    searchImageInCollectionService(imageBuffer)
      .then((results) => {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Image search result...",
          data: results,
        });
        console.log("Search results:", results);
        res.status(200).json(apiResponse);
      })
      .catch((error) => {
        console.error("Error searching image:", error);
        res.status(500).json({ error: error.message });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const searchImageByImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res
        .status(400)
        .json({ error: "No file uploaded or file buffer is empty" });
    }

    // Access the image buffer directly
    const imageBuffer = req.file.buffer;
    console.log("Image buffer:", imageBuffer);

    // Call your search function with the image buffer
    searchImageInCollection(imageBuffer)
      .then((results) => {
        console.log("Search results:", results);
        res.json(results);
      })
      .catch((error) => {
        console.error("Error searching image:", error);
        res.status(500).json({ error: error.message });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function getImageEmbedding(imageBuffer) {
  if (!imageModel) {
    throw new Error(
      "Image model is not loaded. Please ensure the image model is loaded before calling getImageEmbedding."
    );
  }

  try {
    // Load and preprocess the image from the buffer
    let width = 224;
    let height = 224;
    try {
      const metadata = await sharp(imageBuffer).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch (error) {
      console.log("Error getting image metadata:", error);
    }
    const image = await loadImageFromBuffer(imageBuffer);
    const canvas = createCanvas(width, height); // Ensure the image is 224x224
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height); // Resize image to 224x224

    // Convert the canvas to a tensor
    const tensor = tf.browser.fromPixels(canvas).toFloat().expandDims(); // Add batch dimension

    // Use the MobileNet model to get predictions (features)
    const prediction = imageModel.infer(tensor, "conv_preds"); // Extract features
    const embeddings = prediction.flatten().arraySync(); // Flatten and convert to array

    // Upload the image to Cloudinary using a stream
    const uploadStream = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "image" },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(imageBuffer);
      });
    };

    const uploadResult = await uploadStream();
    const imageUrl = uploadResult.secure_url;

    // Extract metadata
    const metadata = {
      width: canvas.width,
      height: canvas.height,
      cloudinaryUrl: imageUrl, // Add Cloudinary URL
    };

    console.log("Image embedding extracted:", embeddings);
    console.log("Image metadata:", metadata);

    return {
      embeddings: embeddings,
      metadata: metadata,
    };
  } catch (error) {
    console.error("Error processing image:", error);
    throw error;
  }
}

// Helper function to load image from buffer
function loadImageFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (err) => reject(err);
    image.src = buffer;
  });
}

// Helper function to load image from buffer
const saveImageInVectorDB = async (req, res) => {
  try {
    // Access the image buffer directly from the request
    const imageBuffer = req.file.buffer;

    // Get embeddings and metadata using the image buffer
    const { embeddings, metadata } = await getImageEmbedding(imageBuffer);
    const id = uuidv4();

    // Store the embedding and metadata in Qdrant
    await storeEmbedding({ id, embedding: embeddings, metadata });

    res.json({
      message: "Image uploaded, embedding stored, and metadata updated!",
    });
  } catch (error) {
    console.error("Error processing image upload:", error);
    res.status(500).send("Error processing image upload.");
  }
};
async function getImageEmbeddingCloudinary(imageBuffer, link) {
  if (!imageModel) {
    throw new Error(
      "Image model is not loaded. Please ensure the image model is loaded before calling getImageEmbedding."
    );
  }

  try {
    // Load and preprocess the image from the buffer;
    let width = 224;
    let height = 224;
    try {
      const metadeta = await sharp(imageBuffer).metadata();
      width = metadeta.width;
      height = metadeta.height;
    } catch (error) {
      console.error("Error getting image metadata:", error);
    }
    const image = await loadImageFromBuffer(imageBuffer);
    const canvas = createCanvas(width, height); // Ensure the image is 224x224
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height); // Resize image to 224x224

    // Convert the canvas to a tensor
    const tensor = tf.browser.fromPixels(canvas).toFloat().expandDims(); // Add batch dimension

    // Use the MobileNet model to get predictions (features)
    const prediction = imageModel.infer(tensor, "conv_preds"); // Extract features
    const embeddings = prediction.flatten().arraySync(); // Flatten and convert to array

    // Upload the image to Cloudinary using a stream

    // Extract metadata
    const metadata = {
      width: canvas.width,
      height: canvas.height,
      cloudinaryUrl: link, // Add Cloudinary URL
    };

    console.log("Image embedding extracted:", embeddings);
    console.log("Image metadata:", metadata);

    return {
      embeddings: embeddings,
      metadata: metadata,
    };
  } catch (error) {
    console.error("Error processing image:", error);
    throw error;
  }
}
export {
  searchImageInCollection,
  searchImageByImage,
  saveImageInVectorDB,
  getImageEmbedding,
  getImageEmbeddingCloudinary,
  searchImageByImageService,
};
