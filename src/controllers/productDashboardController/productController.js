import { Product } from "../../models/productModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import mongoose from "mongoose";
import {
  deleteFromCloudinary,
  uploadArrayOfFilesToCloudinary,
} from "../uploadSingleImage.js";
import { deleteRecords, insertRecord, readRecord } from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

// get active products
export const getShopProducts = async (req, res, next) => {
  try {
    let { page, limit, search } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const skip = (page - 1) * limit;
    const query = {
      isActive: true,
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
      ];
    }

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    if (!products) {
      return next(new ErrorHandler("Products not found", 404));
    }

    console.log(products, "SHOP PRODUCTS");

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Products fetched successfully",
      data: products,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getAllProducts = async (req, res, next) => {
  try {
    let { page, limit, search } = req.query;

    console.log(req.params, "HELLO");

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const skip = (page - 1) * limit;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
      ];
    }

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    console.log(products);

    const totalCount = await Product.countDocuments(query);

    if (!products || products.length === 0) {
      return next(new ErrorHandler("Products not found", 404));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Products fetched successfully",
      data: products,
      meta_data: {
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        limit,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getPackSize = async (req, res, next) => {
  try {
    const { productId } = req.query;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findById(productId);

    if (!product) {
      return next(new ErrorHandler("Product not found", 404));
    }

    console.log(product.packSizes, "PACK SIZES");

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Product fetched successfully",
      data: product.packSizes,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getProductById = async (req, res, next) => {
  try {
    const { id } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findById(id);

    if (!product) {
      return next(new ErrorHandler("Product not found", 404));
    }

    console.log(product, "SHOP PRODUCT");

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Product fetched successfully",
      data: product,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// add product done
export const addProduct = async (req, res, next) => {
  try {
    const data = JSON.parse(req.body.data || "{}");
    const files = req.files || [];
    const brand = data?.brand || "BNXKB";

    console.log(data, "DATA");

    // Group files by fieldname
    const fileGroups = files.reduce((acc, file) => {
      if (!acc[file.fieldname]) acc[file.fieldname] = [];
      acc[file.fieldname].push(file);
      return acc;
    }, {});

    console.log(req.files, fileGroups, "FILES");

    // Handle main product image
    if (fileGroups["image"]?.length > 0) {
      const uploaded = await uploadArrayOfFilesToCloudinary(
        fileGroups["image"],
        `products/${data.slug || "default"}`,
      );
      console.log(uploaded, "UPLOADED");
      data.image = uploaded[0]?.path;
    }

    // Handle product gallery images
    if (fileGroups["images"]?.length > 0) {
      const uploadedGallery = await uploadArrayOfFilesToCloudinary(
        fileGroups["images"],
        `products/${data.slug || "default"}/gallery`,
      );
      console.log(uploadedGallery, "GALLERY");
      data.images = uploadedGallery.map((img) => img?.path);
    }

    // Handle packSizes with images
    if (data.packSizes && Array.isArray(data.packSizes)) {
      for (let i = 0; i < data.packSizes.length; i++) {
        const packSize = data.packSizes[i];
        const packImageFieldName = `packSizes[${i}][pack_image]`;

        if (fileGroups[packImageFieldName]?.length > 0) {
          const uploadedPackImages = await uploadArrayOfFilesToCloudinary(
            fileGroups[packImageFieldName],
            `products/${data.slug || "default"}/packSizes/${i}`,
          );

          console.log(uploadedPackImages, `PACK_SIZE_${i}_IMAGES`);

          // Store the Cloudinary paths
          packSize.id = i + 1;
          packSize.pack_image = uploadedPackImages.map((img) => img?.path);
        }
      }
    }

    // Generate product code
    const latestProduct = await Product.findOne().sort({ createdAt: -1 });
    const productsCount = latestProduct
      ? latestProduct.productCode.split("-").pop()
      : 0;

    const productCode = generateProductCode(brand, Number(productsCount) + 1);
    data.productCode = productCode;

    // Create product
    const product = await Product.create(data);

    return res.status(201).json(
      new ApiResponse({
        statusCode: 201,
        message: "Product added successfully",
        data: product,
      }),
    );
  } catch (error) {
    console.error("ADD PRODUCT ERROR:", error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500),
    );
  }
};

export const editProduct = async (req, res, next) => {
  try {
    const { id } = req.query;

    if (!id) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    let data = {};
    try {
      data = JSON.parse(req.body.data || "{}");
    } catch (e) {
      return next(new ErrorHandler("Invalid JSON format in data field", 400));
    }

    const files = req.files || [];
    const imagesToDelete = [];

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return next(new ErrorHandler("Product not found", 404));
    }

    const slug = data.slug || existingProduct.slug;

    // Group uploaded files by fieldname
    const fileGroups = createFileGroups(files);

    if (fileGroups["image"]?.length > 0) {
      if (existingProduct.image) {
        imagesToDelete.push(existingProduct.image);
      }

      const uploaded = await uploadArrayOfFilesToCloudinary(
        fileGroups["image"],
        `products/${slug}`,
      );

      data.image = uploaded[0]?.path;
    }

    if (Array.isArray(data.images)) {
      // Incoming images to keep
      const incoming = data.images;
      const existing = existingProduct.images || [];

      // Upload new gallery images
      let newUploads = [];
      if (fileGroups["images"]?.length > 0) {
        const uploadedGallery = await uploadArrayOfFilesToCloudinary(
          fileGroups["images"],
          `products/${slug}/gallery`,
        );
        newUploads = uploadedGallery.map((u) => u.path).filter(Boolean);
      }

      // Find which images user removed
      const incomingSet = new Set(incoming);
      const removed = existing.filter((img) => !incomingSet.has(img));
      imagesToDelete.push(...removed);

      // Combine kept + newly added
      data.images = [...incoming, ...newUploads].filter(Boolean);
    }
    // If frontend didn't send image list but uploaded images
    else if (fileGroups["images"]?.length > 0) {
      const uploadedGallery = await uploadArrayOfFilesToCloudinary(
        fileGroups["images"],
        `products/${slug}/gallery`,
      );
      const newUploads = uploadedGallery.map((u) => u.path).filter(Boolean);

      data.images = [...(existingProduct.images || []), ...newUploads];
    }

    if (data.packSizes && Array.isArray(data.packSizes)) {
      let finalPackSizes = [];

      for (let i = 0; i < data.packSizes.length; i++) {
        const incomingPack = data.packSizes[i];

        // Find existing pack by id (if any)
        let existingPack =
          existingProduct.packSizes.find((p) => p.id === incomingPack.id) ||
          null;

        // Clone existing or prepare new
        let updatedPack = existingPack
          ? { ...existingPack.toObject(), ...incomingPack }
          : { ...incomingPack };

        // Handle pack image uploads using field name: packSizes[i][pack_image]
        const fieldName = `packSizes[${i}][pack_image]`;

        if (fileGroups[fieldName]?.length > 0) {
          // Delete old images if existed
          if (existingPack?.pack_image) {
            if (Array.isArray(existingPack.pack_image)) {
              imagesToDelete.push(...existingPack.pack_image);
            } else {
              imagesToDelete.push(existingPack.pack_image);
            }
          }

          const uploadedPackImages = await uploadArrayOfFilesToCloudinary(
            fileGroups[fieldName],
            `products/${slug}/packSizes/${i}`,
          );

          updatedPack.pack_image = uploadedPackImages.map((img) => img.path);
        }

        // Ensure ID consistency
        if (!updatedPack.id) updatedPack.id = i + 1;

        finalPackSizes.push(updatedPack);
      }

      data.packSizes = finalPackSizes;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (imagesToDelete.length > 0) {
      await Promise.allSettled(
        imagesToDelete.map((url) =>
          deleteFromCloudinary(url).catch(() =>
            console.log("Failed to delete", url),
          ),
        ),
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Product updated successfully",
        data: updatedProduct,
      }),
    );
  } catch (error) {
    console.error("EDIT PRODUCT ERROR:", error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500),
    );
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findByIdAndUpdate(
      id,
      [{ $set: { isActive: { $not: "$isActive" } } }],
      { new: true },
    );

    if (!product) {
      return next(new ErrorHandler("Product not found", 404));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Product deleted successfully",
      data: product,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const hardDelete = async (req, res, next) => {
  try {
    const { id } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const product = await Product.findByIdAndDelete(id);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Product deleted successfully",
      data: product,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// helper functions

function generateProductCode(brand, length) {
  return `P-${brand}-${length}`;
}

function createFileGroups(files) {
  const fileGroups = files.reduce((acc, file) => {
    if (!acc[file.fieldname]) acc[file.fieldname] = [];
    acc[file.fieldname].push(file);
    return acc;
  }, {});

  return fileGroups;
}

export const getAllProductsByBrand = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 100,
      search,
      brand_ids,
      category_ids,
      allergy_tags,
      nutrient_tags,
      health_conditions,
      sort_by = "newest",
      source_page, 
    } = req.body;

    const conditions = [{
        field: "sp.is_active",
        operator: "=",
        value: 1,
      }];

    if (Array.isArray(brand_ids) && brand_ids.length > 0) {
      conditions.push({
        field: "sp.brand_id",
        operator: "IN",
        value: brand_ids,
      });
    }

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      conditions.push({
        field: "spcm.category_id",
        operator: "IN",
        value: category_ids,
      });
    }

    if (Array.isArray(allergy_tags) && allergy_tags.length > 0) {
      conditions.push({
        field: "sp.allergy_tags",
        operator: "JSON_CONTAINS",
        value: allergy_tags.map((tag) => `"${tag}"`),
      });
    }

    if (Array.isArray(nutrient_tags) && nutrient_tags.length > 0) {
      conditions.push({
        field: "sp.nutrient_tags",
        operator: "JSON_CONTAINS",
        value: nutrient_tags.map((tag) => `"${tag}"`),
      });
    }

    if (Array.isArray(health_conditions) && health_conditions.length > 0) {
      conditions.push({
        field: "sp.health_conditions",
        operator: "JSON_CONTAINS",
        value: health_conditions.map((tag) => `"${tag}"`),
      });
    }

    let orderByParams = []; 
    if (sort_by==='newest') {
        orderByParams = ['sp.id DESC']
    }
    else if (sort_by==='low') {
       orderByParams = ['sp.price ASC']
    }
    else if (sort_by==='high') {
       orderByParams = ['sp.price DESC']
    }

    const { results: products } = await readRecord({
      table: `${tables.shopProducts} sp`,
      selectFields: [
        "sp.*",
        "spb.name as brand_name",
        `
        CONCAT(
          '[',
          GROUP_CONCAT(
            DISTINCT CONCAT(
              '{"id":', spc.id,
              ',"name":"', REPLACE(spc.name, '"', '\\\\"'), '"}'
            )
          ),
          ']'
        ) as categories
        `,
      ],
      joins: [
        {
          table: `${tables.shopProductCategoryMap} spcm`,
          on: "spcm.product_id = sp.id",
          type: "LEFT",
        },
        {
          table: `${tables.shopProductCategories} spc`,
          on: "spc.id = spcm.category_id",
          type: "LEFT",
        },
        {
          table: `${tables.shopProductBrands} spb`,
          on: "spb.id = sp.brand_id",
          type: "INNER",
        },
      ],
      conditions,
      groupBy: ["sp.id"], // VERY IMPORTANT
      orderBy: orderByParams , 
      pagination: source_page==='home' ? {page:1, limit:8}  : { page, limit },
      search:   search && {
        searchQuery: search,
        searchFields: [
          "sp.name",
          "sp.description",
          "sp.slug",
          "sp.features",
          "sp.how_to_consume",
        ],
      },
    });

    const result = products.map((product) => {
      return {
        ...product,
        categories: product.categories
          ? safeJSONParse(product.categories, [])
          : [],
        images: product.images ? safeJSONParse(product.images, []) : [],
        features: product.features ? safeJSONParse(product.features, []) : [],
        how_to_consume: product.how_to_consume
          ? safeJSONParse(product.how_to_consume, [])
          : [],
        pack_sizes: product.pack_sizes
          ? safeJSONParse(product.pack_sizes, [])
          : [],
        allergy_tags: product.allergy_tags
          ? safeJSONParse(product.allergy_tags, [])
          : [],
        nutrient_tags: product.nutrient_tags
          ? safeJSONParse(product.nutrient_tags, [])
          : [],
        health_conditions: product.health_conditions
          ? safeJSONParse(product.health_conditions, [])
          : [],
      };
    });

    const allergiesOptions = [
      { id: 'gluten-free', label: 'Gluten Free' },
      { id: 'lactose-free', label: 'Lactose Free' },
      { id: 'nut-free', label: 'Nut Free' },
      { id: 'soy-free', label: 'Soy Free' },
    ];
    
    const nutrientsOptions = [
      { id: 'fat-free', label: 'Fat Free' },
      { id: 'high-fibre', label: 'High Fibre' },
      { id: 'sugar-free', label: 'Sugar Free' },
    ];

    const healthConcerns = [
    { name: "Fat Free", icon: "Droplets", color: "bg-blue-100 text-blue-600" },
    { name: "Gluten Free", icon: "Wheat", color: "bg-amber-100 text-amber-600" },
    { name: "Lactose Free", icon: "Milk", color: "bg-sky-100 text-sky-600" },
    {
      name: "Nut Free",
      icon: "TreeDeciduous",
      color: "bg-green-100 text-green-600",
    },
    { name: "Soy Free", icon: "Bean", color: "bg-orange-100 text-orange-600" },
    // { name: "Low Calorie", icon: "Flame", color: "bg-rose-100 text-rose-600" },
    {
      name: "High Fibre",
      icon: "Salad",
      color: "bg-emerald-100 text-emerald-600",
    },
  ];
    
    const healthConditionOptions = [
      { id: 'diabetes-friendly', label: 'Diabetes Friendly' },
      { id: 'heart-healthy', label: 'Heart Healthy' },
    ];

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Products fetched successfully",
        data: {
          products: result, 
          allergy_filter: allergiesOptions, 
          nutrient_filter: nutrientsOptions,
          health_filter: healthConditionOptions,
          health_concerns: healthConcerns,
        },
      }),
    );
  } catch (error) {
    console.error("GET ALL SHOP PRODUCTS ERROR:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const allShopBrands = async (req, res, next) => {
  try {
    const { results: brands } = await readRecord({
      table: tables.shopProductBrands,
      selectFields: ["id", "name"],
      conditions: [
        { field: "is_active", operator: "=", value: 1 },
        { field: "is_deleted", operator: "=", value: 0 },
      ],
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Brands fetched successfully",
      data: brands,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("GET ALL BRANDS ERROR:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const allProductsCategoriesByBrand = async (req, res, next) => {
  try {
    const { brand_ids } = req.body;

    const { results: categories } = await readRecord({
      table: `${tables.shopProducts} sp`,
      joins: [
        {
          table: `${tables.shopProductCategoryMap} spcm`,
          on: "spcm.product_id = sp.id",
          type: "INNER",
        },
        {
          table: `${tables.shopProductCategories} spc`,
          on: "spc.id = spcm.category_id",
          type: "INNER",
        },
      ],
      selectFields: ["spc.id", "spc.name", 'spc.slug','spc.icon'],
      conditions: [
        { field: "sp.is_active", operator: "=", value: 1 },
        { field: "sp.is_deleted", operator: "=", value: 0 },
        brand_ids && { field: "sp.brand_id", operator: "IN", value: brand_ids },
      ].filter(Boolean),
      groupBy: ["spc.id"], // Prevent duplicates
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Categories fetched successfully",
        data: categories,
      }),
    );
  } catch (error) {
    console.error("GET ALL CATEGORIES ERROR:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const updateProductCategoryMapping = async (req, res, next) => {
  try {
    const { product_id, category_id, action } = req.body;

    if (
      !product_id ||
      !category_id ||
      !action ||
      !["add", "remove"].includes(action)
    ) {
      return next(
        new ErrorHandler(
          "Product ID, Category ID and valid action are required",
          400,
        ),
      );
    }

    if (action === "add") {
      const existingMapping = await readRecord({
        table: tables.shopProductCategoryMap,
        conditions: [
          { field: "product_id", operator: "=", value: product_id },
          { field: "category_id", operator: "=", value: category_id },
        ],
      });

      if (existingMapping.results.length > 0) {
        return next(new ErrorHandler("Mapping already exists", 400));
      }

      const insertResult = await insertRecord(
        tables.shopProductCategoryMap,
        ["product_id", "category_id"],
        [product_id, category_id],
      );

      if (insertResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to add category mapping", 500));
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Category mapping added successfully",
        }),
      );
    }
    if (action === "remove") {
      const deleteResult = await deleteRecords(
        tables.shopProductCategoryMap,
        null,
        {
          product_id: product_id,
          category_id: category_id,
        },
      );

      if (deleteResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to remove category mapping", 500));
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Category mapping removed successfully",
        }),
      );
    }
  } catch (error) {
    console.error("UPDATE PRODUCT CATEGORY MAPPING ERROR:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getTopProducts = async (top = 3) => {
  try {
    const { results } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.product_name AS product_name",
        "SUM(po.quantity) AS total_sales_units",
      ],
      conditions: [
        { field: "po.payment_method", operator: "=", value: "online" },
        { field: "po.staff_order", operator: "=", value: 0 },
        {
          field: "IFNULL(po.hamper_type, '')",
          operator: "!=",
          value: "'zero-order'",
          raw: true,
        },
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed','Pending')",
          raw: true,
        },
      ],
      groupBy: ["po.product_name"],
      orderBy: ["total_sales_units DESC"],
      pagination: {
        page: 1,
        limit: top,
      },
    });

    return results.map((item) => ({
      product_name: item.product_name,
      total_sales_units: Number(item.total_sales_units) || 0,
    }));
  } catch (error) {
    console.error("GET TOP PRODUCTS ERROR:", error);
    return [];
  }
};

export const shopHomePage = async (req, res, next) => {
  try {
    const { top = 4 } = req.query;
    const { results: categories } = await readRecord({
      table: `${tables.shopProducts} sp`,
      joins: [
        {
          table: `${tables.shopProductCategoryMap} spcm`,
          on: "spcm.product_id = sp.id",
          type: "INNER",
        },
        {
          table: `${tables.shopProductCategories} spc`,
          on: "spc.id = spcm.category_id",
          type: "INNER",
        },
      ],
      selectFields: ["spc.id", "spc.name"],
      conditions: [
        { field: "sp.is_active", operator: "=", value: 1 },
        { field: "sp.is_deleted", operator: "=", value: 0 },
      ],
      groupBy: ["spc.id"], // Prevent duplicates
    });

    const carouselData = [
      {
        title: "Metabolic Risk Management",
        description:
          "Get a comprehensive BMI, ideal weight, obesity level, and health risk report prepared by expert nutritionists.",
        icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771349799/app_images/rhy8yfhkwml5dvo9w2gx.png",
        button: {
          name: "Take Your Health Score",
          redirect_url: "",
        },
      },
      {
        title: "Need help beyond food choices?",
        description:
          "If you have questions about your weight, gut health, or lifestyle, you can always talk to our nutrition team.",
        icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771350081/app_images/xzweo3gkawwl0uxfkerc.png",
        button: {
          name: "Start a Conversation",
          redirect_url: "",
        },
      },
    ];

    const healthConcerns = [
      "Fat Free",
      "Gluten Free",
      "Lactose Free",
      "Nut Free",
      "Soy Free",
      "Low Calorie",
      "High Fibre",
    ];

    const customerReviews = [
      {
        name: "Prafulla Goradia",
        review:
          "Yes, I received your valuable gift today. It means lot to us. Cookies and makhana chips we tried both are good in taste....Thanks....",
      },
      {
        name: "Dr. Beejal Thakkar",
        review:
          "Thank you for these diwali goodies..it just made my diwali..the snacks are so delicious, I am definitely getting back to ordering some more..Keep up the good work",
      },
      {
        name: "Veena Nenawat",
        review:
          "Hi Khyati.. thanks for the healthy Diwali hamper ..it is really great thought means thank you so much same for us also no regret since it's under low calorie. Thank you dear",
      },
      {
        name: "Ajit John",
        review:
          "Tasted the cookies ... It's good for sweet cravers like me ... Chocolate ka chocolate and no guilt of sugar Tasted the makhana chips as well .. it tasted good.. gives me a healthy chakna option More importantly I feel it is fairly priced ...",
      },
      {
        name: "RJ Rangeeli Ruchi",
        review: "",
        youtube_code: "https://www.youtube.com/embed/7clhwmVUlr",
      },
      {
        name: "Meenakshi Churiwala",
        review:
          "Thanku so much for the beautiful gift hamper….recieved it yesterday and was really delighted to have it",
      },
      {
        name: "Neeta Lulla",
        review: "Guilt-free binging snacks! Thank you Khyati Rupani",
      },
      {
        name: "Kanika Bhatia",
        review:
          "Thank for for the healthiest and yummiest hamper! This ensure festivity could be healthy too!",
      },
    ];
    const topProducts = await getTopProducts(top);
    console.log(topProducts, "TOP PRODUCTS");
    let bestSellers = [];
    if (topProducts.length > 0) {
      console.log("Fetching best sellers...");
      console.log(
        topProducts.map((p) => p.product_name).join(","),
        "TOP PRODUCT NAMES",
      );
      const { results } = await readRecord({
        table: tables.shopProducts,
        selectFields: ["id", "name", "slug", "thumbnail"],
        conditions: [
          { field: "is_active", operator: "=", value: 1 },
          { field: "is_deleted", operator: "=", value: 0 },
          {
            field: "name",
            operator: "IN",
            value: topProducts.map((p) => p.product_name),
          },
        ].filter(Boolean),
        orderBy: [
          "FIELD(name," +
            topProducts.map((p) => `"${p.product_name}"`).join(",") +
            ")",
        ],
      });
      bestSellers = results;
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Shop home page data fetched successfully",
      data: {
        banner: {
          image:
            "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1771349163/app_images/qmnhn8ebhbxr3xud1nsy.png",
        },
        categories,
        health_concerns: healthConcerns,
        carousel: carouselData,
        customer_reviews: customerReviews,
        best_sellers: bestSellers.map((product) => {
          const topProductData = topProducts.find(
            (tp) => tp.product_name === product.name,
          );
          return {
            id: product.id,
            name: product.name,
            slug: product.slug,
            thumbnail: product.thumbnail,
            is_top: topProductData ? topProductData.is_top : false,
          };
        }),
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("SHOP HOME PAGE ERROR:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getProductByIdSql = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || (Number(id)=='NaN')) {
      return next(new ErrorHandler("Product ID is required", 400));
    }

    const {results:product} = await readRecord({
      table: `${tables.shopProducts}`, 
      selectFields: ['*'], 
      conditions: [{
        field: 'slug', 
        operator: '=', 
        value: id
      }]
    })

    if (!product) {
      return next(new ErrorHandler("Product not found", 404));
    }

    const brand = product[0]?.brand_id;
    const {results} = await readRecord({
      table: `${tables.shopProducts} shp`, 
      selectFields: ['shp.brand_id', 'shp.name', 'shp.slug', 'shp.pack_sizes', 'shp.thumbnail'], 
      conditions: [
        {field: "shp.brand_id", operator: "=", value: brand},
        {field: "shp.slug", operator: "!=", value: id}
      ],
      orderBy: ['RAND()'],
      pagination: {page: 1, limit: 7}
    })

    const mappedProducts = results?.map((item)=> {
        const parsedPack = JSON.parse(item.pack_sizes); 
        const {pack_sizes, ...rest} = item; 
        return {
          ...rest, 
          default_pack_size:  parsedPack[0] || null 
        }
    })

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Product fetched successfully",
      data: {product, you_may_like: mappedProducts},
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};