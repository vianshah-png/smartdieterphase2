import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import {
  cloudinaryFolders,
  marqueDetailsMap,
  popUpDetailsMap,
  redisKeys,
  tables,
} from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { storeEmbedding } from "../../config/qDrantConfig.js";
import { v4 as uuidv4 } from "uuid";
import moment from "moment";
import { insertUserVisitLog } from "../../helper/common.js";
const addNewRecipe = async (req, res, next) => {
  const {
    title,
    category_id,
    sub_category_id,
    cuisine_id,
    recipe_type_id,
    energy,
    protein,
    fat,
    carbs,
    fiber,
    calories,
    ingredients,
    method,
    health_meter,
    seo_keywords,
    seo_description,
    seo_title,
    recipe_by,
    hashtags,
    link,
    slug,
    allergy_tags,
    nutrition_tags,
    health_tags,
    platforms,
  } = req.body;

  try {
    const files = req.files;
    let recipe_images = [],
      recipe_thumbnail_images = [],
      recipe_video = [];
    const embeddings = [];
    if (files && files.recipe_images && files.recipe_images.length > 0) {
      recipe_images = await uploadArrayOfFilesToCloudinary(
        files.recipe_images,
        cloudinaryFolders.recipe_images,
        title,
        // {
        //   createEmbedding: true,
        // },
      );
      recipe_images.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete recipe_images[index].embedding;
      });
      if (!recipe_images.length) {
        return next(new ErrorHandler("Error uploading Recipe Images", 400));
      }
    }
    if (
      files &&
      files.recipe_thumbnail_images &&
      files.recipe_thumbnail_images.length > 0
    ) {
      recipe_thumbnail_images = await uploadArrayOfFilesToCloudinary(
        files.recipe_thumbnail_images,
        cloudinaryFolders.recipe_thumbnail_images,
        title,
        // {
        //   createEmbedding: true,
        // },
      );
      recipe_thumbnail_images.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete recipe_thumbnail_images[index].embedding;
      });
      if (!recipe_thumbnail_images.length) {
        return next(new ErrorHandler("Error uploading Recipe Images", 400));
      }
    }

    // Handle video uploads
    if (files && files.recipe_video && files.recipe_video.length > 0) {
      recipe_video = await uploadArrayOfFilesToCloudinary(
        files.recipe_video,
        cloudinaryFolders.recipe_videos,
        title,
      );
      if (!recipe_video.length) {
        return next(new ErrorHandler("Error uploading Recipe Videos", 400));
      }
    }

    const columns = [
      "title",
      "category_id",
      sub_category_id ? "sub_category_id" : null,
      "cuisine_id",
      "recipe_type_id",
      recipe_images.length > 0 ? "recipe_images" : null,
      recipe_thumbnail_images.length > 0 ? "recipe_thumbnail_images" : null,
      "energy",
      "protein",
      "fat",
      "carbs",
      "fiber",
      "calories",
      "ingredients",
      method ? "method" : null,
      health_meter ? "health_meter" : null,
      seo_keywords ? "seo_keywords" : null,
      seo_title ? "seo_title" : null,
      seo_description ? "seo_description" : null,
      recipe_by ? "recipe_by" : null,
      hashtags ? "hashtags" : null,
      recipe_video.length > 0 ? "recipe_video" : null,
      link ? "link" : null,
      "slug",
      allergy_tags ? "allergy_tags" : null,
      nutrition_tags ? "nutrition_tags" : null,
      health_tags ? "health_tags" : null,
      platforms ? "platforms" : null,
    ].filter(Boolean);

    const values = [
      title,
      category_id,
      sub_category_id ? sub_category_id : null,
      cuisine_id,
      recipe_type_id,
      recipe_images.length > 0 ? JSON.stringify(recipe_images) : null,
      recipe_thumbnail_images.length > 0
        ? JSON.stringify(recipe_thumbnail_images)
        : null,
      energy,
      protein,
      fat,
      carbs,
      fiber,
      calories,
      ingredients,
      method ? method : null,
      health_meter ? JSON.stringify(health_meter) : null,
      seo_keywords ? seo_keywords : null,
      seo_title ? seo_title : null,
      seo_description ? seo_description : null,
      recipe_by ? recipe_by : null,
      hashtags ? hashtags : null,
      recipe_video.length > 0 ? JSON.stringify(recipe_video) : null,
      link ? link : null,
      slug,
      allergy_tags ? allergy_tags : null,
      nutrition_tags ? nutrition_tags : null,
      health_tags ? health_tags : null,
      platforms ? JSON.stringify(platforms) : null,
    ].filter(Boolean);
    console.log(allergy_tags, 140);
    console.log(nutrition_tags, 141);
    console.log(health_tags, 142);
    console.log(columns, 100);
    console.log(values, 101);
    const newRecipe = await insertRecord(`${tables.recipe}`, columns, values);
    if (!newRecipe.affectedRows === 0) {
      return next(new ErrorHandler("Error While Adding recipe", 400));
    }
    embeddings.forEach(async (elem) => {
      const id = uuidv4();
      await storeEmbedding({
        id,
        embedding: elem.embedding,
        metadata: {
          photo_url: elem.photo_url,
          photo_id: newRecipe.insertId,
          table: "social_post",
        },
        collection: "content",
      });
    });
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Recipe added successfully",
    });
    await redisDelByPattern({
      pattern: `${redisKeys.recipes}*`,
      redis, // ioredis client
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    if (error.code === "ER_DUP_ENTRY")
      return next(new ErrorHandler("Duplicate entry", 500));
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllRecipes = async (req, res, next) => {
  const {
    page,
    limit,
    search,
    cuisine_id,
    category_id,
    sub_category_id,
    recipe_type_id,
    type_id,
    ingredient_name,
    allergy_tags,
    nutrition_tags,
    health_tags,
    sort,
    veg_only = false,
    id,
    slug,
    user_id,
  } = req.body;

  const source = String(req.headers.source).toLowerCase();

  try {
    const selectFields = [
      "r.id as id",
      "r.title",
      "r.category_id",
      "r.sub_category_id",
      "r.cuisine_id",
      "r.recipe_type_id",
      "r.status",
      "c.category_name",
      "subci.sub_category_name",
      "cui.cuisine_name",
      "rt.title as recipe_type_title",
      "rt.icon as recipe_icon",
      "r.link",
      "r.recipe_images",
      "r.recipe_thumbnail_images",
      "r.recipe_video",
      "r.hashtags",
      "r.seo_keywords",
      "r.seo_description",
      "r.seo_title",
      "r.energy",
      "r.protein",
      "r.fat",
      "r.carbs",
      "r.fiber",
      "r.calories",
      "r.method",
      "r.health_meter",
      `r.ingredients`,
      "r.view_count",
      "CONCAT(ad.first_name, ' ', ad.last_name) as recipe_by",
      "r.slug",
      "r.allergy_tags",
      "r.nutrition_tags",
      "r.health_tags",
      "DATE_FORMAT(r.last_used_date,'%a %b %d %Y') AS last_used_date",
      "r.platforms",
      "DATE(r.created_at) as added_date",
    ];
    if (source === "content_db") {
      selectFields.push(
        `(select COUNT(*) from ${tables.contentLikes} cl where cl.content_id = r.id and cl.content_type = 'recipe' ) as total_likes`,
        `(select COUNT(*) from ${tables.contentShares} cs where cs.content_id = r.id and cs.content_type = 'recipe') as total_shares`,
      );
    }
    const joinTables = [
      {
        type: "LEFT",
        table: `${tables.category} c`,
        on: "r.category_id = c.category_id",
      },
      {
        type: "LEFT",
        table: `${tables.subCategory} subci`,
        on: "r.sub_category_id = subci.sub_category_id",
      },
      {
        type: "LEFT",
        table: `${tables.cuisine} cui`,
        on: "r.cuisine_id = cui.id",
      },
      {
        type: "LEFT",
        table: `${tables.recipe_type} rt`,
        on: "r.recipe_type_id = rt.id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "r.recipe_by = ad.admin_user_id",
      },
    ];
    const conditions = [{ field: "r.is_deleted", operator: "=", value: 0 }];
    if (slug !== undefined) {
      conditions.push({
        field: "r.slug",
        operator: "=",
        value: slug.toLowerCase(),
      });
    }
    if (id) {
      conditions.push({
        field: "r.id",
        operator: "=",
        value: parseInt(id),
      });
    }
    if (cuisine_id) {
      conditions.push({
        field: "r.cuisine_id",
        operator: "=",
        value: cuisine_id,
      });
    }
    if (type_id) {
      conditions.push({
        field: "r.recipe_type_id",
        operator: "=",
        value: type_id,
      });
    }

    // if (category_id) {
    //   conditions.push({
    //     field: "r.category_id",
    //     operator: "=",
    //     value: category_id,
    //   });
    // }

    if (sub_category_id) {
      conditions.push({
        field: "r.sub_category_id",
        operator: "=",
        value: sub_category_id,
      });
    }
    console.log(category_id, 281);
    if (category_id) {
      if (category_id != "30" && category_id != "26") {
        conditions.push({
          field: "r.category_id",
          operator: "=",
          value: category_id,
        });
      } else {
        if (category_id == "30") {
          conditions.push({
            field: "r.recipe_type_id",
            operator: "=",
            value: 2,
          });
        }
        if (category_id == "26") {
          conditions.push({
            field: "r.recipe_type_id",
            operator: "=",
            value: 1,
          });
        }
      }
    }
    if (recipe_type_id) {
      conditions.push({
        field: "r.recipe_type_id",
        operator: "=",
        value: recipe_type_id,
      });
    }
    if (ingredient_name) {
      conditions.push({
        field: "r.ingredients",
        operator: "Like",
        value: ingredient_name,
      });
    }

    if (allergy_tags && allergy_tags.length > 0) {
      let value = [];
      allergy_tags.forEach((item) => {
        value.push(`"${item}"`);
      });
      console.log(value, 353);
      conditions.push({
        field: "r.allergy_tags",
        operator: "json_contains",
        value: [...value],
      });
    }

    if (health_tags && health_tags.length > 0) {
      let value = [];
      health_tags.forEach((item) => {
        value.push(`"${item}"`);
      });
      conditions.push({
        field: "r.health_tags",
        operator: "json_contains",
        value: [...value],
      });
    }

    if (nutrition_tags && nutrition_tags.length > 0) {
      let value = [];
      nutrition_tags.forEach((item) => {
        value.push(`"${item}"`);
      });
      conditions.push({
        field: "r.nutrition_tags",
        operator: "json_contains",
        value: [...value],
      });
    }

    if (veg_only) {
      const { results: recipe_type_id } = await readRecord({
        table: `${tables.recipe_type}`,
        selectFields: ["id"],
        conditions: [
          { field: "title", operator: "IN", value: ["Veg", "Vegan"] },
        ],
      });
      if (recipe_type_id.length > 0) {
        conditions.push({
          field: "r.recipe_type_id",
          operator: "IN",
          value: [1, 4], //1,4 for vegan
        });
      }
    }
    const orderBy = [];
    if (sort === "new") {
      orderBy.push("r.created_at DESC");
    } else if (sort === "alphabetical") {
      orderBy.push("TRIM(r.title) COLLATE utf8_general_ci");
    } else if (sort === "view") {
      orderBy.push("r.view_count DESC");
    } else if (sort === "videos") {
      orderBy.push("r.recipe_video DESC");
    }
    if (user_id) {
      console.log(user_id, 391);
      const meta_data = {
        device: req.headers.device || req.headers["user-agent"],
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      };
      await insertUserVisitLog({ user_id, page: "recipe", meta_data });
    }
    const { results: rows, totalCount } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields,
      joins: joinTables,
      conditions,
      pagination: { limit, page },
      search: { searchQuery: search, searchFields: ["r.title"] },
      countTotal: true,
      orderBy,
    });

    console.log(rows, 121212121);
    if (!rows) {
      return next(new ErrorHandler("Error While fetching recipes", 400));
    } else if (rows.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Recipes fetched Successfully",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    let isRecent = false;
    const recipes = rows.map((recipe) => {
      // console.log(recipe, 279);

      let added_date = recipe.added_date;

      if (moment().diff(moment(added_date), "days") <= 30) {
        isRecent = true;
      } else {
        isRecent = false;
      }
      const cleanRecipeImages = recipe.recipe_images
        ? JSON.parse(recipe.recipe_images)
        : [];
      const cleanRecipeThumbnailImages = recipe.recipe_thumbnail_images
        ? JSON.parse(recipe.recipe_thumbnail_images)
        : [];
      return {
        id: recipe.id,
        title: recipe.title,
        category: recipe.category_name,
        show_new_tag: isRecent,
        sub_category: recipe.sub_category_name || "",
        cuisine: recipe.cuisine_name,
        recipe_type: recipe.recipe_type_title,
        recipe_icon: recipe.recipe_icon ? JSON.parse(recipe.recipe_icon) : [],
        recipe_images: cleanRecipeImages,
        recipe_thumbnail_images: cleanRecipeThumbnailImages,
        recipe_video: recipe.recipe_video
          ? JSON.parse(recipe.recipe_video)
          : "",
        ...(source === "content_db" && { status: recipe.status }),
        hashtags: safeJSONParse(recipe.hashtags, []),
        ingredients: safeJSONParse(recipe.ingredients, []),
        view_count: recipe.view_count,
        slug: recipe.slug,
        allergy_tags: safeJSONParse(recipe.allergy_tags, []),
        nutrition_tags: safeJSONParse(recipe.nutrition_tags, []),
        health_tags: safeJSONParse(recipe.health_tags, []),
        share_count: Math.floor(Math.random() * (2000 - 1200 + 1)) + 1200,
        like_count: Math.floor(Math.random() * (2000 - 1200 + 1)) + 1200,
        is_liked: false,
        ...(source === "content_db" && {
          total_likes: recipe.total_likes || 0,
          total_shares: recipe.total_shares || 0,
        }),
        last_used_date: recipe.last_used_date || null,
        platforms: safeJSONParse(recipe.platforms, []),
        meta_data: {
          link: recipe.link,
          category_id: recipe.category_id,
          sub_category_id: String(recipe.sub_category_id) || "",
          cuisine_id: recipe.cuisine_id,
          recipe_type_id: recipe.recipe_type_id,
          seo_keywords: recipe.seo_keywords || "",
          seo_description: recipe.seo_description || "",
          seo_title: recipe.seo_title || "",
          energy: recipe.energy,
          protein: recipe.protein,
          fat: recipe.fat,
          carbs: recipe.carbs,
          fiber: recipe.fiber,
          calories: recipe.calories,
          health_meter: recipe.health_meter,
          method: safeJSONParse(recipe.method, []),
          recipe_by: recipe.recipe_by || "",
        },
      };
    });
    const { results: offerDetails } = await readRecord({
      table: `${tables.offersNew} ofn`,
      selectFields: [
        "ofn.id as offer_id",
        "ofn.offer_title",
        "ofn.offer_description",
        // "ofn.offer_type",
        // "ofn.offer_discount_percentage",
        "ofn.offer_banners",
        "ofn.redirect_page",
        "ofn.redirect_id",

        // "ofn.is_all_program",
        "ofn.recipe_marquee",
        // "ofn.start_date",
        // "ofn.end_date",
      ],
      conditions: [
        { field: "ofn.is_active", operator: "=", value: 1 },
        {
          field: "ofn.offer_for",
          operator: "=",
          value: source === "app" ? 0 : 1,
        },
      ],
    });

    let isRecipeBookAllow = true;
    let show_access_popup = false;
    if (user_id) {
      const { results: userDetails } = await readRecord({
        selectFields: ["user_type", "added_date"],
        table: tables.userDetails,
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });

      if (userDetails[0]?.user_type == "0") {
        console.log(userDetails[0].added_date);
        let loginDate = moment(userDetails[0].added_date);
        let add30Days = loginDate.add(30, "days");

        console.log(loginDate.format("YYYY-MM-DD"), 333333333);

        if (moment().isBefore(add30Days, "day")) {
          show_access_popup = true;
        }

        const currentDate = moment().format("YYYY-MM-DD");
        const { results: leadActivatedFeature } = await readRecord({
          selectFields: ["*"],
          table: "leads_activated_features",
          conditions: [{ field: "user_id", operator: "=", value: user_id }],
          orderBy: [`id DESC`],
        });

        let guides = [];
        if (leadActivatedFeature.length > 0) {
          guides = JSON.parse(leadActivatedFeature[0].guides ?? "[]");
        }

        if (guides.length > 0) {
          guides.forEach((guide) => {
            if (guide.guide_id == 81) {
              if (
                currentDate <= moment(guide.guide_end_date).format("YYYY-MM-DD")
              ) {
                isRecipeBookAllow = true;
              } else {
                isRecipeBookAllow = false;
              }
            }
          });
        } else {
          isRecipeBookAllow = false;
        }
      } else {
        isRecipeBookAllow = true;
      }
    }
    isRecipeBookAllow = true;
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Recipes fetched successfully",
      data: recipes,
      totalCount,
      meta_data: {
        currentPage: parseInt(page) || 1,
        totalPages: Math.ceil(totalCount / parseInt(limit)) || 1,
        marquee_text: {
          marquee_color: "#03989F",
          text: offerDetails[0].recipe_marquee,
          redirect_page: offerDetails[0].redirect_page,
          params: { redirect_id: offerDetails[0].redirect_id },
        },
        pop_up_text:
          req.headers.source === "app"
            ? popUpDetailsMap["recipe_app"]
            : popUpDetailsMap["recipe_web"],
        isRecipeBookAllow,
        pop_up: {
          show_popup: show_access_popup,
          description:
            "Bookmark your favourite recipes and create personalized chapters. 30 days of free BN Go Pro access Recipe Book just for you!",
          title: "Enjoy Free Access to BN Go Pro!",
          image_url: "https://bncleanse.com/images/Recipe_book.png",
          button1: {
            title: "Explore Now",
            redirect_screen: "close_popup",
            screen_params: {},
          },
          button2: {
            title: "",
            redirect_screen: "",
            screen_params: {},
          },
          show_x: false,
        },
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllRecipesTest = async (req, res, next) => {
  const {
    page,
    limit,
    search,
    cuisine_id,
    category_id,
    sub_category_id,
    recipe_type_id,
    type_id,
    ingredient_name,
    allergy_tags,
    sort,
    veg_only = false,
    id,
    slug,
  } = req.body;

  const source = String(req.headers.source).toLowerCase();

  try {
    const selectFields = [
      "r.id as id",
      "r.title",
      "r.category_id",
      "r.sub_category_id",
      "r.cuisine_id",
      "r.recipe_type_id",
      "r.status",
      "c.category_name",
      "subci.sub_category_name",
      "cui.cuisine_name",
      "rt.title as recipe_type_title",
      "rt.icon as recipe_icon",
      "r.link",
      "r.recipe_images",
      "r.recipe_video",
      "r.hashtags",
      "r.seo_keywords",
      "r.seo_description",
      "r.seo_title",
      "r.energy",
      "r.protein",
      "r.fat",
      "r.carbs",
      "r.fiber",
      "r.calories",
      "r.method",
      "r.health_meter",
      `r.ingredients`,
      "r.view_count",
      "CONCAT(ad.first_name, ' ', ad.last_name) as recipe_by",
      "r.slug",
      "r.allergy_tags",
      "r.nutrition_tags",
      "r.health_tags",
    ];
    const joinTables = [
      {
        type: "LEFT",
        table: `${tables.category} c`,
        on: "r.category_id = c.category_id",
      },
      {
        type: "LEFT",
        table: `${tables.subCategory} subci`,
        on: "r.sub_category_id = subci.sub_category_id",
      },
      {
        type: "LEFT",
        table: `${tables.cuisine} cui`,
        on: "r.cuisine_id = cui.id",
      },
      {
        type: "LEFT",
        table: `${tables.recipe_type} rt`,
        on: "r.recipe_type_id = rt.id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "r.recipe_by = ad.admin_user_id",
      },
    ];
    const conditions = [{ field: "r.is_deleted", operator: "=", value: 0 }];
    if (slug !== undefined) {
      conditions.push({
        field: "r.slug",
        operator: "=",
        value: slug.toLowerCase(),
      });
    }
    if (id) {
      conditions.push({
        field: "r.id",
        operator: "=",
        value: parseInt(id),
      });
    }
    if (cuisine_id) {
      conditions.push({
        field: "r.cuisine_id",
        operator: "=",
        value: cuisine_id,
      });
    }
    if (type_id) {
      conditions.push({
        field: "r.recipe_type_id",
        operator: "=",
        value: type_id,
      });
    }

    // if (category_id) {
    //   conditions.push({
    //     field: "r.category_id",
    //     operator: "=",
    //     value: category_id,
    //   });
    // }

    if (sub_category_id) {
      conditions.push({
        field: "r.sub_category_id",
        operator: "=",
        value: sub_category_id,
      });
    }
    // console.log(category_id, 281);
    // if (category_id) {
    //   if (category_id != "30" && category_id != "26") {
    //     conditions.push({
    //       field: "r.category_id",
    //       operator: "=",
    //       value: category_id,
    //     });
    //   } else {
    //     if (category_id == "30") {
    //       conditions.push({
    //         field: "r.recipe_type_id",
    //         operator: "=",
    //         value: 2,
    //       });
    //     }
    //     if (category_id == "26") {
    //       conditions.push({
    //         field: "r.recipe_type_id",
    //         operator: "=",
    //         value: 1,
    //       });
    //     }
    //   }
    // }
    if (category_id) {
      conditions.push({
        field: "r.category_id",
        operator: "=",
        value: category_id,
      });
    }
    if (recipe_type_id) {
      conditions.push({
        field: "r.recipe_type_id",
        operator: "=",
        value: recipe_type_id,
      });
    }
    if (ingredient_name) {
      conditions.push({
        field: "r.ingredients",
        operator: "Like",
        value: ingredient_name,
      });
    }

    if (allergy_tags && allergy_tags.length > 0) {
      let value = [];
      allergy_tags.forEach((item) => {
        value.push(`"${item}"`);
      });
      console.log(value, 353);
      conditions.push({
        field: "r.allergy_tags",
        operator: "json_contains",
        value: [...value],
      });
    }

    if (veg_only) {
      const { results: recipe_type_id } = await readRecord({
        table: `${tables.recipe_type}`,
        selectFields: ["id"],
        conditions: [{ field: "title", operator: "=", value: "Veg" }],
      });
      if (recipe_type_id.length > 0) {
        conditions.push({
          field: "r.recipe_type_id",
          operator: "=",
          value: recipe_type_id[0].id,
        });
      }
    }
    const orderBy = [];
    if (sort === "new") {
      orderBy.push("r.created_at DESC");
    } else if (sort === "alphabetical") {
      orderBy.push("TRIM(r.title) COLLATE utf8_general_ci");
    } else if (sort === "view") {
      orderBy.push("r.view_count DESC");
    } else if (sort === "videos") {
      orderBy.push("r.recipe_video DESC");
    }
    const { results: rows, totalCount } = await readRecord({
      table: `recipe_test r`,
      selectFields,
      joins: joinTables,
      conditions,
      pagination: { limit, page },
      search: { searchQuery: search, searchFields: ["r.title"] },
      countTotal: true,
      orderBy,
    });
    if (!rows) {
      return next(new ErrorHandler("Error While fetching recipes", 400));
    } else if (rows.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Recipes fetched Successfully",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }

    const recipes = rows.map((recipe) => {
      // console.log(recipe, 279);
      const cleanRecipeImages = recipe.recipe_images
        ? JSON.parse(recipe.recipe_images)
        : [];
      return {
        id: recipe.id,
        title: recipe.title,
        category: recipe.category_name,
        sub_category: recipe.sub_category_name || "",
        cuisine: recipe.cuisine_name,
        recipe_type: recipe.recipe_type_title,
        recipe_icon: recipe.recipe_icon ? JSON.parse(recipe.recipe_icon) : [],
        recipe_images: cleanRecipeImages,
        recipe_video: recipe.recipe_video
          ? JSON.parse(recipe.recipe_video)
          : [],
        ...(source === "content_db" && { status: recipe.status }),
        hashtags: safeJSONParse(recipe.hashtags, []),
        ingredients: safeJSONParse(recipe.ingredients, []),
        view_count: recipe.view_count,
        slug: recipe.slug,
        allergy_tags: safeJSONParse(recipe.allergy_tags, []),
        nutrition_tags: safeJSONParse(recipe.nutrition_tags, []),
        health_tags: safeJSONParse(recipe.health_tags, []),
        meta_data: {
          link: recipe.link,
          category_id: recipe.category_id,
          sub_category_id: String(recipe.sub_category_id) || "",
          cuisine_id: recipe.cuisine_id,
          recipe_type_id: recipe.recipe_type_id,
          seo_keywords: recipe.seo_keywords || "",
          seo_description: recipe.seo_description || "",
          seo_title: recipe.seo_title || "",
          energy: recipe.energy,
          protein: recipe.protein,
          fat: recipe.fat,
          carbs: recipe.carbs,
          fiber: recipe.fiber,
          calories: recipe.calories,
          health_meter: recipe.health_meter,
          method: safeJSONParse(recipe.method, []),
          recipe_by: recipe.recipe_by || "",
        },
      };
    });
    const { results: offerDetails } = await readRecord({
      table: `${tables.offersNew} ofn`,
      selectFields: [
        "ofn.id as offer_id",
        "ofn.offer_title",
        "ofn.offer_description",
        // "ofn.offer_type",
        // "ofn.offer_discount_percentage",
        "ofn.offer_banners",
        "ofn.redirect_page",
        "ofn.redirect_id",

        // "ofn.is_all_program",
        "ofn.recipe_marquee",
        // "ofn.start_date",
        // "ofn.end_date",
      ],
      conditions: [
        { field: "ofn.is_active", operator: "=", value: 1 },
        {
          field: "ofn.offer_for",
          operator: "=",
          value: source === "app" ? 0 : 1,
        },
      ],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Recipes fetched successfully",
      data: recipes,
      totalCount,
      meta_data: {
        currentPage: parseInt(page) || 1,
        totalPages: Math.ceil(totalCount / parseInt(limit)) || 1,
        marquee_text: {
          marquee_color: "#03989F",
          text: offerDetails[0].recipe_marquee,
          redirect_page: offerDetails[0].redirect_page,
          params: { redirect_id: offerDetails[0].redirect_id },
        },
        pop_up_text:
          req.headers.source === "app"
            ? popUpDetailsMap["recipe_app"]
            : popUpDetailsMap["recipe_web"],
      },
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const searchAllergies = async (req, res, next) => {
  const { allergy_tags } = req.body;
  try {
    const { results } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: ["r.allergy_tags"],
      pagination: { limit: 10, page: 1 },
      search: search ? { searchQuery: allergy_tags } : {},
      orderBy: !search ? ["r.view_count DESC"] : [],
    });

    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Recipe found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Recipes fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const searchRecipeTitles = async (req, res, next) => {
  const { search } = req.query;
  try {
    const { results } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: ["r.id", "r.title", "r.view_count"],
      pagination: { limit: 10, page: 1 },
      search: search ? { searchQuery: search } : {},
      orderBy: !search ? ["r.view_count DESC"] : [],
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Recipe found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Recipes fetched successfully",
      data: results,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateRecipes = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id Not Provided", 400));
  }
  const files = req.files;
  const updatedData = req.body;
  try {
    const embeddings = [];
    if (files.recipe_images) {
      const recipe_images = await uploadArrayOfFilesToCloudinary(
        files.recipe_images,
        cloudinaryFolders.recipe_images,
        updatedData.title
          ? updatedData.title
          : files.recipe_images[0].originalname,
      );
      recipe_images.map((image, index) => {
        embeddings.push({
          embedding: image.embedding,
          photo_url: image.file.path,
        });
        delete recipe_images[index].embedding;
      });
      if (!recipe_images) {
        return next(
          new ErrorHandler(
            "Error While uploading recipe images to cloudinary",
            400,
          ),
        );
      }
      updatedData.recipe_images = JSON.stringify(recipe_images);
    }

    // Check and upload recipe video if it exists
    if (files.recipe_video) {
      const recipe_video = await uploadArrayOfFilesToCloudinary(
        files.recipe_video,
        cloudinaryFolders.recipe_videos,
      );
      if (!recipe_video) {
        return next(
          new ErrorHandler(
            "Error While uploading recipe video to cloudinary",
            400,
          ),
        );
      }
      updatedData.recipe_video = JSON.stringify(recipe_video);
    }
    console.log(updatedData, 321);
    if (updatedData.platforms) {
      updatedData.platforms = JSON.stringify(JSON.parse(updatedData.platforms));
    }
    // if (updatedData.ingredients) {
    //   updatedData.ingredients = JSON.parse(updatedData.ingredients).join(",");
    // }
    const condition = { id: parseInt(id) };
    const updateResult = await updateRecord(
      `${tables.recipe}`,
      updatedData,
      condition,
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No recipe found with the given id", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      embeddings.forEach(async (elem) => {
        const uid = uuidv4();
        await storeEmbedding({
          uid,
          embedding: elem.embedding,
          metadata: {
            photo_url: elem.photo_url,
            photo_id: parseInt(id),
            table: "bn_recipe",
          },
          collection: "content",
        });
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `recipe ${id} Updated Successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.recipes}*`,
        redis, // ioredis client
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error While updating recipe", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const changeRecipeStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) return next(new ErrorHandler("id not Provided", 400));
  try {
    const { results: recipe } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: ["r.status"],
      conditions: [{ field: "r.id", operator: "=", value: parseInt(id) }],
    });
    if (recipe.length === 0) {
      return next(new ErrorHandler("No recipe found with the given id", 400));
    }

    const updatedStatus = recipe[0].status === "active" ? "inactive" : "active";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { id: parseInt(id) };
    const updatedRecipe = await updateRecord(
      `${tables.recipe}`,
      updatedData,
      condition,
    );
    if (!updatedRecipe) {
      return next(new ErrorHandler("Error While Updating recipe status", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `Recipe ${id} status changed Successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.recipes}*`,
      redis, // ioredis client
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteRecipe = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  try {
    const updatedData = {
      is_deleted: 1,
    };

    const condition = { id: parseInt(id) };
    const deletedRecipe = await updateRecord(
      `${tables.recipe}`,
      updatedData,
      condition,
    );
    console.log(deletedRecipe, 381);
    if (!deletedRecipe) {
      return next(new ErrorHandler("Error While deleting recipe", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: `recipe ${id} deleted Successfully`,
    });
    await redisDelByPattern({
      pattern: `${redisKeys.recipes}*`,
      redis,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const increaseRecipeViewCount = async (req, res, next) => {
  const { id, current_count } = req.body;
  console.log(req.body, 515);
  if (!id || current_count === undefined) {
    return next(new ErrorHandler("id or current count is not provided ", 400));
  }
  try {
    const updateResult = await updateRecord(
      tables.recipe,
      { view_count: current_count + 1 },
      { id },
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No recipe found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `view count updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error increasing veiws`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export {
  addNewRecipe,
  changeRecipeStatus,
  deleteRecipe,
  getAllRecipes,
  increaseRecipeViewCount,
  searchRecipeTitles,
  updateRecipes,
  searchAllergies,
  getAllRecipesTest,
};
