import mongoose from "mongoose";

// Pack Size Schema (embedded)
const packSizeSchema = new mongoose.Schema(
  {
    id: Number,
    size: { type: String },
    price: Number,
    final_price: Number,
    discount_percentage: Number,
    tag: String,
    features: [String],
    pack_image: [String],
  },
  { timestamps: true, versionKey: false, _id: false }
);

// Product Schema
const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    brand: { type: String, default: "BNXKB" },
    tag: {type:String},
    availability: {type:String},
    category: String,
    categoryDescription: String,
    product_details: String,
    description: String,
    price: Number,
    image: String,
    images: [String],
    features: [String],
    protein: String,
    howToConsume: [String],
    fullDescription: String,
    productCode: String,
    isActive: { type: Boolean, default: true },

    // Embedded pack sizes
    packSizes: [packSizeSchema],
  },
  { timestamps: true, versionKey: false }
);

// Correct export
export const Product = mongoose.model("Product", productSchema);
