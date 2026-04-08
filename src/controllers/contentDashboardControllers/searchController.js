import { readPool } from "../../config/dbConnection.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { readRecord } from "../../config/query.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { redisKeys, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { addSearchTerm } from "./userSearchLogController.js";
import { safeJSONParse } from "../../helper/commonHelper.js";

const getSchemaInfo = async (
  db,
  tableNames = [
    tables.drafts,
    tables.blogPosts,
    tables.socialPost,
    tables.goodMails,
    tables.bnGoogleReviews,
    tables.successStories,
    tables.recipe,
    tables.rawVideos,
    tables.notifications,
  ]
) => {
  // console.log(tableNames, 23);
  const tableFilter =
    tableNames.length > 0
      ? `AND TABLE_NAME IN (${tableNames
          .map((name) => `'${name}'`)
          .join(", ")})`
      : "";

  const tableQuery = `
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'balancei_nutweb'
      AND DATA_TYPE IN ('varchar', 'text','longtext','enum')
      ${tableFilter}
  `;
  // console.log(tableQuery, 38);
  const [results] = await db.query(tableQuery);
  return results;
};

const processProgramMastersData = async (results, page, limit, search) => {
  const data = results.map((program) => {
    return {
      id: program.program_id,
      program_name: program.program_name,
      program_banner_images: safeJSONParse(program.program_banner),
      ideal_for: (() => {
        try {
          return safeJSONParse(program.ideal_for);
        } catch {
          return [program.ideal_for];
        }
      })(),
      status: program.status,
      program_category: program.program_category || "N/A",
      content: program.content,
      hashtags: safeJSONParse(program.hashtags) || [],
      added_by: program.username,
      created_at: program.created_at,
    };
  });

  await redis.setex(
    `${redisKeys.programMaster}:${page}:${limit}:${search}`,
    30,
    JSON.stringify(data)
  );

  return data;
};

function paginateArray(array, page, limit) {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  return array.slice(startIndex, endIndex);
}

const tableOperations = {
  programs_master: processProgramMastersData,
  blog_posts: async (results, page, limit, search) => {
    const postIds = results.map((row) => row.postID);

    // Perform a query to get full blog posts data with joins
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
      "bp.postStatus",
      "bp.is_deleted",
      "bp.deleted_by",
      "bp.deleted_at",
      "bp.status AS status",
      "c.category_name AS category",
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.category} c`,
        on: "bp.category_id = c.category_id",
      },
    ];

    // Fetch the complete data for the blog posts
    const { results: fullBlogPosts } = await readRecord({
      table: `${tables.blogPosts} bp`,
      selectFields,
      joins,
      conditions: [{ field: "bp.postId", operator: "IN", value: postIds }],
      pagination: {
        page,
        limit,
      },
    });

    // Fetch all hashtags in a single query based on the collected hashtag IDs

    // Map through blog posts to attach hashtags and category names
    const blogs = fullBlogPosts.map((row) => {
      return {
        id: row.id,
        post_name: row.post_name,
        category: row.category,
        description: row.description,
        status: row.status,
        post_banner_small_images: safeJSONParse(row.postBannerSmall),
        tags: safeJSONParse(row.hashtags, []),
        date_of_posted: row.date_of_post,
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

    // Cache the results in Redis for performance optimization
    // await redis.setex(
    //   `redisKeys.blogs : ${page} : ${limit} : ${search}`,
    //   30,
    //   JSON.stringify(blogs)
    // );

    return blogs;
  },
  bn_app_recipes_category: async (results, page, limit) => {
    const categories = results.map((category) => ({
      id: category.category_id,
      category_name: category.category_name,
    }));

    return paginateArray(categories, page, limit);
  },
  bn_app_recipes_cuisine: async (results) => {
    const cuisines = results.map((cuisine) => ({
      id: cuisine.id,
      cuisine: cuisine.cuisine_name,
    }));

    return paginateArray(cuisines, page, limit);
  },
  bn_app_recipes_sub_category: async (results, page, limit) => {
    const subCategories = results.map((subcategory) => ({
      id: subcategory.sub_category_id,
      subcategory_name: subcategory.sub_category_name,
    }));
    return paginateArray(subCategories, page, limit);
  },
  bn_hashtags: async (results, page, limit) => {
    const hashtags = results.map((hashtag) => ({
      id: hashtag.id,
      hashtag_name: hashtag.hashtag_name,
    }));
    return paginateArray(hashtags, page, limit);
  },
  bn_incentive_pool: async (results, page, limit) => {
    const offers = results.map((row) => ({
      id: row.id,
      offer_title: row.title,
      offer_name: row.offer_name,
      content: row.content,
      images: safeJSONParse(row.images),
      status: row.status,
      link: row.link,
      created_at: row.created_at,
      type: row.type,
      amount: row.amount,
      date_of_posted: row.created_at,
    }));
    return paginateArray(offers, page, limit);
  },
  bn_recipe: async (results, page, limit, search) => {
    const recipeIds = results.map((row) => row.id);

    // Perform a query to get full recipe data with joins
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
    ];

    const joins = [
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

    // Fetch the complete data for the recipes
    const { results: fullRecipes } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields,
      joins,
      conditions: [
        { field: "r.id", operator: "IN", value: recipeIds },
        { field: "r.is_deleted", operator: "=", value: 0 },
      ],
      pagination: {
        page,
        limit,
      },
    });

    // Map through recipes to attach hashtags and category names
    const recipes = fullRecipes.map((recipe) => {
      const cleanRecipeImages = recipe.recipe_images
        ? safeJSONParse(recipe.recipe_images)
        : [];
      return {
        id: recipe.id,
        title: recipe.title,
        category: recipe.category_name,
        sub_category: recipe.sub_category_name || "",
        cuisine: recipe.cuisine_name,
        recipe_type: recipe.recipe_type_title,
        recipe_icon: recipe.recipe_icon
          ? safeJSONParse(recipe.recipe_icon)
          : [],
        recipe_images: cleanRecipeImages,
        recipe_video: recipe.recipe_video
          ? safeJSONParse(recipe.recipe_video)
          : [],
        ...("content_db" === "content_db" && { status: recipe.status }),
        hashtags: safeJSONParse(recipe.hashtags, []),
        ingredients: safeJSONParse(recipe.ingredients, []),
        view_count: recipe.view_count,
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

    // Cache the results in Redis for performance optimization
    // await redis.setex(
    //   `${redisKeys.recipes} : ${page} : ${limit} : ${search}`,
    //   30,
    //   JSON.stringify(recipes)
    // );

    return recipes;
  },

  drafts: async (results, page, limit) => {
    const draftsResponse = results.map((row) => {
      // console.log(row);
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        hashtags: row.hashtags,
        description: row.description,
        link: row.link,
        sub_type: row.sub_type ? row.sub_type : "",
        button_one_name: row.button_one_name ? row.button_one_name : "",
        button_one_redirect: row.button_one_redirect
          ? row.button_one_redirect
          : "",
        button_two_name: row.button_two_name ? row.button_two_name : "",
        button_two_redirect: row.button_two_redirect
          ? row.button_two_redirect
          : "",
        image: row.image ? safeJSONParse(row.image) : "",
      };
    });

    return paginateArray(draftsResponse, page, limit);
  },
  notifications: async (results, page, limit, search) => {
    const notificationIds = results.map((row) => row.id);

    // Step 1: Define the fields for the full data query
    const selectFields = [
      "n.id",
      "n.title",
      "n.description",
      "n.redirect_page",
      "n.expiry_days",
      "n.schedule_date AS scheduled_date",
      "n.schedule_time AS scheduled_time",
      "n.wallet_range",
      "n.user_status",
      "n.promotional",
      "n.mode",
      "n.auto_chat",
      "n.created_at",
      "n.gender",
      "n.countries",
      "n.cities",
      "n.states",
      "n.programs",
      "n.weight_range",
      "n.age_range",
      "n.ethnicity",
      "n.suggested_programs",
      "n.health_conditions",
    ];

    // No additional joins needed, but you can add if necessary
    const joins = [];

    // Step 2: Fetch the complete data for the notifications
    const { results: result } = await readRecord({
      table: `${tables.notifications} n`,
      selectFields,
      joins,
      conditions: [{ field: "n.id", operator: "IN", value: notificationIds }],
      pagination: {
        page,
        limit,
      },
    });

    // Step 3: Collect and fetch related data for each notification
    const countriesIds = new Set();
    const citiesIds = new Set();
    const statesIds = new Set();
    const programsIds = new Set();
    const suggestedProgramsIds = new Set();

    result.forEach((row) => {
      safeJSONParse(row.countries).forEach((id) => countriesIds.add(id));
      safeJSONParse(row.cities).forEach((id) => citiesIds.add(id));
      safeJSONParse(row.states).forEach((id) => statesIds.add(id));
      safeJSONParse(row.programs).forEach((id) => programsIds.add(id));
      safeJSONParse(row.suggested_programs).forEach((id) =>
        suggestedProgramsIds.add(id)
      );
    });

    // Prepare queries, tagged by type
    const queries = [];

    if (countriesIds.size > 0) {
      queries.push({
        type: "countries",
        query: readRecord({
          table: `${tables.countries}`,
          selectFields: ["country_name", "country_id"],
          conditions: [
            {
              field: "country_id",
              operator: "IN",
              value: Array.from(countriesIds),
            },
          ],
        }),
      });
    }

    if (citiesIds.size > 0) {
      queries.push({
        type: "cities",
        query: readRecord({
          table: `${tables.cities}`,
          selectFields: ["city_name", "city_id"],
          conditions: [
            { field: "city_id", operator: "IN", value: Array.from(citiesIds) },
          ],
        }),
      });
    }

    if (statesIds.size > 0) {
      queries.push({
        type: "states",
        query: readRecord({
          table: `${tables.states}`,
          selectFields: ["state_name", "state_id"],
          conditions: [
            { field: "state_id", operator: "IN", value: Array.from(statesIds) },
          ],
        }),
      });
    }

    if (programsIds.size > 0) {
      queries.push({
        type: "programs",
        query: readRecord({
          table: `${tables.programsMaster}`,
          selectFields: ["program_name", "program_id"],
          conditions: [
            {
              field: "program_id",
              operator: "IN",
              value: Array.from(programsIds),
            },
          ],
        }),
      });
    }

    if (suggestedProgramsIds.size > 0) {
      queries.push({
        type: "suggestedPrograms",
        query: readRecord({
          table: `${tables.programsMaster}`,
          selectFields: ["program_name", "program_id"],
          conditions: [
            {
              field: "program_id",
              operator: "IN",
              value: Array.from(suggestedProgramsIds),
            },
          ],
        }),
      });
    }

    // Resolve all queries
    const queryResults = await Promise.all(queries.map((q) => q.query));

    // Map query results to their respective categories
    const resultsMap = queries.reduce((acc, query, index) => {
      const { results: queryResult } = queryResults[index];
      acc[query.type] = queryResult;
      return acc;
    }, {});

    const {
      countries = [],
      cities = [],
      states = [],
      programs = [],
      suggestedPrograms = [],
    } = resultsMap;

    const countryLookup = countries.reduce((acc, item) => {
      acc[item.country_id] = item.country_name;
      return acc;
    }, {});

    const cityLookup = cities.reduce((acc, item) => {
      acc[item.city_id] = item.city_name;
      return acc;
    }, {});

    const stateLookup = states.reduce((acc, item) => {
      acc[item.state_id] = item.state_name;
      return acc;
    }, {});

    const programLookup = programs.reduce((acc, item) => {
      acc[item.program_id] = item.program_name;
      return acc;
    }, {});

    const suggestedProgramLookup = suggestedPrograms.reduce((acc, item) => {
      acc[item.program_id] = item.program_name;
      return acc;
    }, {});

    const data = result.map((row) => ({
      ...row,
      user_status: safeJSONParse(row.user_status),
      gender: safeJSONParse(row.gender).map((gender) =>
        gender === 1 ? "male" : gender === 2 ? "female" : "others"
      ),
      ethnicity: safeJSONParse(row.ethnicity),
      countries: safeJSONParse(row.countries).map(
        (id) => countryLookup[id] || null
      ),
      cities: safeJSONParse(row.cities).map((id) => cityLookup[id] || null),
      states: safeJSONParse(row.states).map((id) => stateLookup[id] || null),
      programs: safeJSONParse(row.programs).map(
        (id) => programLookup[id] || null
      ),
      suggested_programs: safeJSONParse(row.suggested_programs).map(
        (id) => suggestedProgramLookup[id] || null
      ),
      health_conditions: safeJSONParse(row.health_conditions) || [],
    }));

    return data;
  },
  raw_videos: async (results) => {
    const rawVideos = results.map((item) => {
      return {
        id: item.id,
        title: item.title,
        videos: safeJSONParse(item.videos),
        status: item.status,
      };
    });
    return paginateArray(rawVideos, page, limit);
  },
  success_stories: async (results, page, limit, search) => {
    const storyIds = results.map((row) => row.id);

    // Step 1: Define the fields for the full data query
    const selectFields = [
      "ss.id",
      "ss.photo_before",
      "ss.photo_after",
      "ss.photo_before_after",
      "ss.hashtags",
      "ss.short_descriptions",
      "ss.long_descriptions",
      "ss.insta_handle",
      "ss.priority",
      "ss.testimonial_video",
      "ss.testimonial_video_flag",
      "ss.status",
      "ss.note",
      "ss.confirmation",
      "ss.is_deleted",
      "ss.deleted_by",
      "ss.deleted_at",
      "ss.social_post_id",
      "ss.client_id",
      "ss.health_issues",
      "ss.client_details",
      "ss.program_details",
      "ss.health_conditions",
      "ss.description",
      "ss.mentor",
      "ss.social_media_id",
      "ss.post",
      "ss.story",
      "ss.what_i_eat_in_a_day",
      "ss.reel_transformation",
      "ss.website_link",
    ];

    // Step 2: Fetch the complete data for the success stories
    const { results: fullSuccessStories } = await readRecord({
      table: "success_stories ss",
      selectFields,
      conditions: [{ field: "ss.id", operator: "IN", value: storyIds }],
      pagination: {
        page,
        limit,
      },
    });

    // Step 3: Collect and fetch related health conditions data
    // const allHealthConditionIds = new Set(
    //   fullSuccessStories
    //     .map((row) => safeJSONParse(row.health_conditions || "[]"))
    //     .flat()
    // );

    // const healthConditions =
    //   allHealthConditionIds.size > 0
    //     ? await readRecord({
    //         table: "health_issues hi",
    //         selectFields: ["hi.id", "hi.name"],
    //         conditions: [
    //           {
    //             field: "hi.id",
    //             operator: "IN",
    //             value: Array.from(allHealthConditionIds),
    //           },
    //         ],
    //       })
    //     : [];

    // const healthConditionMap = {};
    // healthConditions.forEach((condition) => {
    //   healthConditionMap[condition.id] = condition.name;
    // });

    // Step 5: Map through success stories to attach related data
    const successStories = fullSuccessStories.map((story) => {
      // const healthConditionsList = story.health_conditions
      //   ? safeJSONParse(story.health_conditions).map(
      //       (id) => healthConditionMap[id]
      //     )
      //   : [];

      return {
        id: story.id,
        client_details: safeJSONParse(story.client_details),
        images: [
          ...safeJSONParse(story.photo_before || "[]"),
          ...safeJSONParse(story.photo_after || "[]"),
          ...safeJSONParse(story.photo_before_after || "[]"),
        ],
        program_details: safeJSONParse(story.program_details),
        health_issue: safeJSONParse(story.health_conditions) || [],
        description: story.description,
        status: story.status,
        short_descriptions: story.short_descriptions,
        long_descriptions: story.long_descriptions,
        social_media_id: story.social_media_id,
        mentor: story.mentor,
        post: story.post ? "done" : "pending",
        story: story.story ? "done" : "pending",
        what_i_eat_in_a_day: story.what_i_eat_in_a_day ? "done" : "pending",
        reel_transformation: story.reel_transformation ? "done" : "pending",
        website_link: story.website_link ? "done" : "pending",
        tags: safeJSONParse(story.hashtags) || [],
        priority: story.priority,
        meta_data: {
          check_list: {
            after_photo: safeJSONParse(story.photo_after || "[]"),
            before_photo: safeJSONParse(story.photo_before || "[]"),
            before_after_photo: safeJSONParse(story.photo_before_after || "[]"),
            testimonial_video: safeJSONParse(story.testimonial_video || "[]"),
            what_i_eat_in_a_day: story.what_i_eat_in_a_day || "",
            reel_transformation: story.reel_transformation || "",
            story: story.story || "",
            post: story.post || "",
            website_link: story.website_link || "",
          },
        },
      };
    });

    // Step 6: Cache the results in Redis
    // await redis.setex(
    //   `redisKeys.successStories:${page}:${limit}:${search}`,
    //   30, // Cache expiration time in seconds
    //   JSON.stringify(successStories)
    // );

    return successStories;
  },

  social_post: async (results, page, limit) => {
    const finalResult = results.map((row) => {
      return {
        id: row.id,
        postType: row.post_type,
        image: row.image ? safeJSONParse(row.image) : "",
        video: row.video ? safeJSONParse(row.video) : "",
        description: row.description,
        tags: row.tags ? safeJSONParse(row.tags) : "",
        postLink: row.post_link,
        postedOn: row.posted_on ? safeJSONParse(row.posted_on) : "",
        accounts: row.accounts ? safeJSONParse(row.accounts) : "",
        thumbnailImage: row.thumbnail_image
          ? safeJSONParse(row.thumbnail_image)
          : "",
      };
    });
    return paginateArray(finalResult, page, limit);
  },
  // Add more table-specific operations as needed
};

const searchDatabase = async ({
  db,
  searchTerms,
  page,
  limit,
  search,
  filter,
  social_handle,
  tags,
  post_type,
  programs,
  types,
  hashtags,
}) => {
  let tableNames = [];
  let query = "";

  switch (filter) {
    case "social_handle":
      tableNames = [tables.socialPost];
      // queries = filter.join;
      break;
    case "tags":
      tableNames = [tables.socialPost];
      break;
    case "post_type":
      tableNames = [tables.socialPost];
      break;
    // case "programs":
    // tableNames = [tables.goodMails];
    // break;
    case "drafts":
      tableNames = [tables.drafts];
      break;
    default:
      tableNames = [
        tables.drafts,
        tables.blogPosts,
        tables.socialPost,
        tables.bnGoogleReviews,
        tables.successStories,
        tables.recipe,
        // tables.rawVideos,
      ];
      break;
  }
  const schemaInfo = await getSchemaInfo(db, tableNames);
  const searchResults = {};

  const queries = schemaInfo.flatMap((info) => {
    const tableName = info.TABLE_NAME;
    const columnName = info.COLUMN_NAME;
    const termQueries = searchTerms
      .map(() => `\`${columnName}\` LIKE ?`)
      .join(" OR ");
    const queryParams = searchTerms.map((term) => `%${term.trim()}%`);
    let finalQuery = `SELECT * FROM \`${tableName}\` WHERE ${termQueries}`;
    if (filter == "social_handle") {
      let extraQuery = social_handle
        .map((handle) => `accounts LIKE ?`)
        .join(" OR ");
      finalQuery += ` AND (${extraQuery})`;
      const extraParam = social_handle.map((handle) => `%${handle}%`);
      queryParams.push(...extraParam);
    } else if (filter == "tags") {
      let extraQuery = tags
        .map((tag) => `JSON_CONTAINS(tags, ?, '$')`)
        .join(" OR ");
      finalQuery += ` AND (${extraQuery})`;
      const extraParam = tags.map((tag) => `"${tag}"`);
      queryParams.push(...extraParam);
    } else if (filter == "post_type") {
      finalQuery += ` AND post_type IN (`;
      finalQuery += post_type.map(() => "?").join(", ");
      finalQuery += ")";
      queryParams.push(...post_type);
    } else if (filter == "programs") {
      finalQuery += ` AND program_name = ?`;
      queryParams.push(programs);
    } else if (hashtags && tableName === tables.goodMails) {
      let hashtagQuery = hashtags
        .map((hashtag) => `JSON_CONTAINS(hashtags, ?, '$')`)
        .join(" OR ");
      finalQuery += ` AND (${hashtagQuery})`;
      const hashtagParams = hashtags.map((hashtag) => `%${hashtag}%`);
      queryParams.push(...hashtagParams);
    } else if (filter == "drafts") {
      finalQuery += `AND type IN (`;
      finalQuery += types.map(() => "?").join(", ");
      finalQuery += ")";
      queryParams.push(...types);
      if (hashtags && tableName === tables.drafts) {
        let hashtagQuery = hashtags
          .map((hashtag) => `JSON_CONTAINS(hashtags, ?, '$')`)
          .join(" OR ");
        finalQuery += ` AND (${hashtagQuery})`;
        const hashtagParams = hashtags.map((hashtag) => `"${hashtag}"`);
        queryParams.push(...hashtagParams);
      }
    }
    return {
      tableName,
      query: finalQuery,
      queryParams,
    };
  });

  console.log(queries, 966);
  // console.log(queries.length, 967);
  await Promise.all(
    queries.map(async ({ tableName, query, queryParams }) => {
      const [results] = await db.query(query, queryParams);

      if (results.length > 0) {
        const data = tableOperations[tableName]
          ? await tableOperations[tableName](results, page, limit, search)
          : results;

        searchResults[tableName] = (searchResults[tableName] || []).concat(
          data
        );
      }
    })
  );

  return searchResults;
};

const searchDatabaseImages = async (db, searchTerms, page, limit, search) => {
  const schemaInfo = await getSchemaInfo(db);
  const searchResults = {};

  await Promise.all(
    schemaInfo.map(async (info) => {
      const tableName = info.TABLE_NAME;
      const columnName = info.COLUMN_NAME;

      // Construct a query for each term
      const termQueries = searchTerms
        .map(() => `\`${columnName}\` LIKE ?`)
        .join(" OR ");

      const query = `
        SELECT * FROM \`${tableName}\` 
        WHERE ${termQueries}
      `;

      const queryParams = searchTerms.map((term) => `%${term.trim()}%`);
      const [results] = await db.query(query, queryParams);

      if (results.length > 0) {
        const data = tableOperations[tableName]
          ? await tableOperations[tableName](results, page, limit, search)
          : results;

        if (!searchResults[tableName]) {
          searchResults[tableName] = [];
        }
        searchResults[tableName].push(...data);
      }
    })
  );

  return searchResults;
};
const universalSearchController = async (req, res, next) => {
  const {
    term: searchTerm,
    page = 1,
    limit = 100,
    search,
    filter,
    id,
  } = req.query;
  const { social_handle, tags, post_type, programs, types } = req.body;
  if(searchTerm=="weight")
  {
     return res.status(400).json(
      new ApiResponse({
        statusCode: 400,
        message: "Search term is not allowed",
        data: [],
      })
    );
  }
  if (!searchTerm) {
    return res.status(400).json(
      new ApiResponse({
        statusCode: 400,
        message: "Search term is required",
        data: [],
      })
    );
  }

  if (id) {
    await addSearchTerm(id, searchTerm);
  }
  const searchTerms = searchTerm.split(",").map((term) => term.trim());

  let connection;

  try {
    connection = await readPool.getConnection(); // Use a single connection

    const results = await searchDatabase({
      db: connection,
      searchTerms,
      page,
      limit,
      search,
      filter,
      social_handle,
      tags,
      post_type,
      programs,
      types,
    });

    if (Object.keys(results).length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No matching data found",
          data: [],
        })
      );
    }

    res.json(
      new ApiResponse({
        statusCode: 200,
        message: "Data fetched successfully",
        data: results,
      })
    );
  } catch (error) {
    console.error("Error executing search:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  } finally {
    if (connection) connection.release(); // Ensure the connection is released
  }
};

const universalSearchForImageLink = async (searchTerm, page, limit, search) => {
  if (!searchTerm) {
    return {
      statusCode: 400,
      message: "Search term is required",
      data: [],
    };
  }

  const searchTerms = searchTerm.split(",").map((term) => term.trim());
  let connection;

  try {
    connection = await readPool.getConnection(); // Use a single connection

    // Fetch schema information in advance
    const schemaInfo = await getSchemaInfo(connection, [
      tables.socialPost,
      tables.blogPosts,
      tables.recipe,
      tables.successStories,
    ]);

    // Group schema info by table
    const tableColumns = {};
    schemaInfo.forEach((info) => {
      if (!tableColumns[info.TABLE_NAME]) {
        tableColumns[info.TABLE_NAME] = [];
      }
      tableColumns[info.TABLE_NAME].push(info.COLUMN_NAME);
    });

    // Create queries for all tables
    const queries = Object.entries(tableColumns).map(([tableName, columns]) => {
      // Generate WHERE clause: one LIKE per column per search term
      const termQueries = columns
        .map((columnName) =>
          searchTerms.map(() => `\`${columnName}\` LIKE ?`).join(" OR ")
        )
        .join(" OR ");

      // Generate parameters: one param per search term per column
      const queryParams = columns.flatMap(() =>
        searchTerms.map((term) => `%${term.trim()}%`)
      );

      return {
        tableName,
        query: `SELECT DISTINCT * FROM \`${tableName}\` WHERE ${termQueries}`,
        queryParams,
      };
    });

    const searchResults = {};
    // console.log(queries, 985);
    // Execute all queries in parallel
    await Promise.all(
      queries.map(async ({ tableName, query, queryParams }) => {
        const [results] = await connection.query(query, queryParams);
        // console.log()
        if (results.length > 0) {
          const data = tableOperations[tableName]
            ? await tableOperations[tableName](results, page, limit, search)
            : results;

          searchResults[tableName] = data;
        }
      })
    );

    if (Object.keys(searchResults).length === 0) {
      return {
        statusCode: 200,
        message: "No matching data found",
        data: {},
      };
    }

    return {
      statusCode: 200,
      message: "Data fetched successfully",
      data: searchResults,
    };
  } catch (error) {
    console.error("Error executing search:", error);
    throw new Error("Internal Server Error");
  } finally {
    if (connection) connection.release(); // Ensure the connection is released
  }
};

export { universalSearchController, universalSearchForImageLink };
