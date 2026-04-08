import { redisDelByPattern } from "@eturino/ioredis-del-by-pattern";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";
import { storeEmbedding } from "../../config/qDrantConfig.js";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import {
  cloudinaryFolders,
  popUpDetailsMap,
  redisKeys,
  tables,
} from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

const addBlogPost = async (req, res, next) => {
  const newData = req.body;
  console.log(newData, 11);
  const files = req.files;

  const folderName = cloudinaryFolders.blog_post;
  const embeddings = [];
  const [smallBannerLink, bigBannerLink] = await Promise.all([
    uploadArrayOfFilesToCloudinary(
      files.postBannerSmall,
      folderName,
      newData.postTitle,
      // {
      //   createEmbedding: true,
      // }
    ),
    uploadArrayOfFilesToCloudinary(
      files.postBannerBig,
      folderName,
      newData.postTitle,
      // {
      //   createEmbedding: true,
      // }
    ),
    // uploadArrayOfFilesToCloudinary(files.images, folderName),
  ]);

  if (smallBannerLink) {
    smallBannerLink.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete smallBannerLink[index].embedding;
    });
    newData.postBannerSmall = JSON.stringify(smallBannerLink);
  }
  if (bigBannerLink) {
    bigBannerLink.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete bigBannerLink[index].embedding;
    });
    newData.postBannerBig = JSON.stringify(bigBannerLink);
  }
  // if (images) {
  //   newData.images = JSON.stringify(images);
  // }
  if (newData.platforms) {
    newData.platforms = Array.isArray(newData.platforms)
      ? JSON.stringify(newData.platforms)
      : `[${newData.platforms}]`;
  }
  const columns = Object.keys(newData);
  const values = Object.values(newData);

  try {
    const insertResult = await insertRecord(
      `${tables.blogPosts}`,
      columns,
      values,
    );
    embeddings.forEach(async (elem) => {
      const id = uuidv4();
      await storeEmbedding({
        id,
        embedding: elem.embedding,
        metadata: {
          photo_url: elem.photo_url,
          photo_id: insertResult.insertId,
          table: "blog_posts",
        },
        collection: "content",
      });
    });
    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: `Blog post Created Successfully`,
      data: {
        insertId: insertResult.insertId,
      },
    });
    await redisDelByPattern({
      pattern: `${redisKeys.blogs}*`,
      redis, // ioredis client
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.error("Error creating blog post:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getAllBlogs = async (req, res, next) => {
  const { tags, categories, blog_id, page, limit, search, slug } = req.body;
  const source = String(req.headers.source).toLowerCase();
  const conditions = [{ field: "bp.is_deleted", operator: "=", value: 0 }];
  if (blog_id) {
    conditions.push({
      field: "bp.postID",
      operator: "=",
      value: parseInt(blog_id),
    });
  }
  if (tags && tags.length > 0) {
    let value = [];
    tags.forEach((item) => {
      value.push(`"${item}"`);
    });
    conditions.push({
      field: "bp.hashtags",
      operator: "JSON_CONTAINS",
      value: [...value],
    });
  }
  if (categories && categories.length > 0) {
    conditions.push({
      field: "bp.category_id",
      operator: "IN",
      value: [...categories],
    });
  }
  if (slug !== undefined) {
    conditions.push({
      field: "bp.slug",
      operator: "=",
      value: `${slug.toLowerCase()}`,
    });
  }
  try {
    const selectFields = [
      "bp.postId AS id",
      "bp.postTitle AS post_name",
      "bp.slug",
      "bp.postDesc AS description",
      "bp.postCont",
      "bp.hashtags",
      "bp.category_id",
      "bp.postBannerBig",
      "bp.postBannerSmall",
      "bp.seoKeywords",
      "bp.seoDescription",
      "bp.seoTitle",
      "bp.seoSubject",
      "bp.seoAuthor",
      "bp.seoSubtitle",
      "bp.created_at AS date_of_post",
      "bp.updated_at",
      "bp.postStatus",
      "bp.is_deleted",
      "bp.deleted_by",
      "bp.deleted_at",
      "bp.status AS status",
      "c.catTitle AS category",
      "bp.view_count",
      "DATE_FORMAT(bp.last_used_date,'%a %b %d %Y') AS last_used_date",
      // "bp.images", // Assuming images are stored as JSON string in images column
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.blogPostsCategory} c`,
        on: "bp.category_id = c.catID",
      },
    ];
    // Read all blog posts
    const { results: rows, totalCount } = await readRecord({
      table: `${tables.blogPosts} bp`,
      selectFields,
      joins,
      conditions,
      pagination: { limit, page },
      search: {
        searchQuery: search,
        searchFields: [
          "bp.postTitle",
          "bp.postDesc",
          "bp.postDesc",
          "bp.postCont",
          "bp.seoKeywords",
          "bp.seoDescription",
          "bp.seoTitle",
          "bp.seoSubject",
          "bp.seoAuthor",
          "bp.seoSubtitle",
        ],
      },
      countTotal: true,
      orderBy: ["bp.created_at DESC"],
    });
    if (!rows) {
      return next(new ErrorHandler("Error WHile fetching blog Post", 400));
    } else if (rows.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "blog Posts fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    // const allHashtagIds = new Set(
    //   rows
    //     .map((row) => JSON.parse(row.hashtags_id))
    //     .filter((ids) => ids) // Filter out null or undefined
    //     .flat()
    // );  Flatten the array of arrays

    // Fetch all hashtags in a single query
    // const tagsCondition = [
    //   { field: "h.id", operator: "IN", value: Array.from(allHashtagIds) },
    // ];
    // const hashtags = await readRecord({
    //   table: `${tables.hashtags} h`,
    //   selectFields: ["h.id", "h.hashtag_name"],
    //   conditions: tagsCondition,
    // });

    // const hashtagMap = {};
    // hashtags.forEach((tag) => {
    //   hashtagMap[tag.id] = tag.hashtag_name;
    // });

    // Map through blog posts to attach hashtags
    const blogs = rows.map((row) => {
      // const tags = row.hashtags_id
      //   ? JSON.parse(row.hashtags_id).map((id) => hashtagMap[id])
      //   : [];

      const validJsonString = row.hashtags.replace(/'/g, '"');
      const hashtagsArray = safeJSONParse(validJsonString, []);

      return {
        id: row.id,
        post_name: row.post_name,
        category: row.category,
        description: row.description
          ?.replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'"),
        content: row.postCont,
        status: row.status,
        post_banner_small_images: JSON.parse(row.postBannerSmall),
        post_banner_big_images: JSON.parse(row.postBannerBig),
        tags: hashtagsArray,
        date_of_posted: moment(row.date_of_post).format("Do MMM YYYY"),
        updated_at: row.updated_at,
        view_count: row.view_count,
        last_used_date: row.last_used_date,
        meta_data: {
          slug: row.slug,
          postCont: row.postCont,
          seoKeywords: row.seoKeywords,
          seoDescription: row.seoDescription,
          seoTitle: row.seoTitle,
          seoSubject: row.seoSubject,
          seoAuthor: row.seoAuthor,
          seoSubtitle: row.seoSubtitle,
          category_id: row.category_id,
        },
      };
    });

    await redis.setex(
      `redisKeys.blogs : ${page} : ${limit} : ${search}`,
      30,
      JSON.stringify(blogs),
    );
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
      message: "Blog Posts Fetched Successfully",
      data: blogs,
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
            ? popUpDetailsMap["health_reads_app"]
            : popUpDetailsMap["health_reads_web"],
      },
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.error("Error in getAllBlogs:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateBlogs = async (req, res, next) => {
  const { id } = req.params;
  const updatedData = req.body;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 500));
  }
  console.log(req.files, 251);
  const smallBanner = req.files["postBannerSmall"];
  const bigBanner = req.files["postBannerBig"];
  const image = req.files["images"];
  const embeddings = [];
  console.log(smallBanner, 255);

  if (smallBanner) {
    let smallBannerLink = await uploadArrayOfFilesToCloudinary(
      smallBanner,
      cloudinaryFolders.blog_post,
      updatedData.postTitle
        ? updatedData.postTitle
        : smallBanner[0].originalname,
      // {
      //   createEmbedding: true,
      // }
    );
    smallBannerLink.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete smallBannerLink[index].embedding;
    });
    updatedData.postBannerSmall = JSON.stringify(smallBannerLink);
  }
  if (bigBanner) {
    let bigBannerLink = await uploadArrayOfFilesToCloudinary(
      bigBanner,
      cloudinaryFolders.blog_post,
      updatedData.postTitle ? updatedData.postTitle : bigBanner[0].originalname,
      // {
      //   createEmbedding: true,
      // }
    );
    bigBannerLink.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete bigBannerLink[index].embedding;
    });

    updatedData.postBannerBig = JSON.stringify(bigBannerLink);
  }
  if (image) {
    let imageLink = await uploadArrayOfFilesToCloudinary(
      image,
      cloudinaryFolders.blog_post,
      updatedData.postTitle ? updatedData.postTitle : image[0].originalname,
      // {
      //   createEmbedding: true,
      // }
    );
    imageLink.map((image, index) => {
      embeddings.push({
        embedding: image.embedding,
        photo_url: image.file.path,
      });
      delete imageLink[index].embedding;
    });

    updatedData.images = JSON.stringify(imageLink);
  }
  if (updatedData.platforms) {
    updatedData.platforms = Array.isArray(updatedData.platforms)
      ? JSON.stringify(updatedData.platforms)
      : `[${updatedData.platforms}]`;
  }
  // console.log();
  try {
    // Check if updatedData is still an object after removal
    if (!updatedData || typeof updatedData !== "object") {
      throw new Error("Invalid updatedData object");
    }

    // Ensure id is converted to integer for condition
    const condition = { postID: parseInt(id) };

    // Perform the database update
    console.log(updatedData, 292);
    const updateResult = await updateRecord(
      `${tables.blogPosts}`,
      updatedData,
      condition,
    );
    // console.log(updateResult, 283);
    // Check the result of the update operation
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No post found with the given id", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      embeddings.forEach(async (elem) => {
        const uid = uuidv4();
        await storeEmbedding({
          uid,
          embedding: elem.embedding,
          metadata: {
            photo_url: elem.photo_url,
            photo_id: id,
            table: "blog_posts",
          },
          collection: "content",
        });
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Blog post ${id} updated Successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.blogs}*`,
        redis, // ioredis client
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Blog Post Not Found For ${id}`, 400));
    }
  } catch (error) {
    console.error("Error updating blog post:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteBlogs = async (req, res, next) => {
  const { id } = req.params;
  const { deleted_by } = req.body;
  if (!id || !deleted_by) {
    return next(new ErrorHandler("id or deleted_by not provided", 400));
  }
  try {
    const updatedData = {
      is_deleted: 1,
      deleted_by: deleted_by,
    };
    const condition = { postID: parseInt(id) };
    const deletedBlog = await updateRecord(
      `${tables.blogPosts}`,
      updatedData,
      condition,
    );
    if (deletedBlog) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Blog post ${id} deleted successfully`,
      });

      await redisDelByPattern({
        pattern: `${redisKeys.blogs}*`,
        redis, // ioredis client
      });

      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Blog post ${id} not found`, 400));
    }
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const changeBlogStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(new ErrorHandler("id not Provided", 400));
  }
  try {
    const { results: blogPost } = await readRecord({
      table: `${tables.blogPosts} bp`,
      selectFields: ["bp.status"],
      conditions: [{ field: "bp.postID", operator: "=", value: parseInt(id) }],
    });

    const updatedStatus =
      blogPost[0].status === "active" ? "inactive" : "active";

    const updatedData = {
      status: updatedStatus,
    };
    const condition = { postID: parseInt(id) };
    const updatedBlog = await updateRecord(
      `${tables.blogPosts}`,
      updatedData,
      condition,
    );
    if (updatedBlog) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Blog post ${id} status updated successfully`,
      });
      await redisDelByPattern({
        pattern: `${redisKeys.blogs}*`,
        redis, // ioredis client
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Blog post ${id} not found`, 400));
    }
  } catch (error) {
    console.log(error, 369);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const increaseBlogsViewCount = async (req, res, next) => {
  const { id, current_count } = req.body;
  console.log(req.body, 515);
  if (!id || current_count === undefined) {
    return next(new ErrorHandler("id or current count is not provided ", 400));
  }
  try {
    const updateResult = await updateRecord(
      tables.blogPosts,
      { view_count: current_count + 1 },
      { postID: id },
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No blog found with the given", 400));
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
  addBlogPost,
  changeBlogStatus,
  deleteBlogs,
  getAllBlogs,
  increaseBlogsViewCount,
  updateBlogs,
};
