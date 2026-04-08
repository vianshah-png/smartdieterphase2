import {
  insertRecord,
  deleteRecords,
  readRecord,
  updateRecord,
} from "../config/query.js";
import { cloudinaryFolders, tables } from "../helper/constant.js";
import {
  getCurrentDateTime,
  filterObjectRemoveNullValues,
} from "../helper/commonHelper.js";

export const getRecipeChapterList = async (req, res) => {
  try {
    const newData = req.body;

    //Fetch chapters for particular user
    const recipeChapterstable = tables.recipeChapters;
    const selectrecipeChaptersColumns = ["*"];
    const recipeChaptersWhereCondition = [
      {
        field: "user_id",
        operator: "=",
        value: newData.user_id,
      },
      {
        field: "is_deleted",
        operator: "=",
        value: "0",
      },
    ];

    const { results: recipeChapterList } = await readRecord({
      table: `${recipeChapterstable}`,
      selectFields: selectrecipeChaptersColumns,
      conditions: recipeChaptersWhereCondition,
    });
    return res.status(201).json({
      status: true,
      message: "Recipe Chapter List fetched Successfully.",
      data: recipeChapterList,
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const addChapter = async (req, res) => {
  const newData = req.body;
  try {
    const chapterName = newData.chapter_name;
    const user_id = newData.user_id;
    const recipeChapterstable = tables.recipeChapters;
    const selectrecipeChaptersColumns = ["*"];
    const recipeChaptersWhereCondition = [
      {
        field: "user_id",
        operator: "=",
        value: newData.user_id,
      },
      {
        field: "LCASE(chapter_name)",
        operator: "=",
        value: newData.chapter_name.toLowerCase(),
      },
      {
        field: "is_deleted",
        operator: "=",
        value: "0",
      },
    ];

    const { results: recipeChapterList } = await readRecord({
      table: `${recipeChapterstable}`,
      selectFields: selectrecipeChaptersColumns,
      conditions: recipeChaptersWhereCondition,
    });

    if (recipeChapterList.length > 0) {
      return res.status(404).json({ message: "Chapter Already Exists." });
    } else {
      const columns = ["chapter_name", "user_id", "created_date", "updated_by"];
      const currentDate = getCurrentDateTime();

      const values = [chapterName, user_id, currentDate, user_id];
      const insertResult = await insertRecord(
        `${tables.recipeChapters}`,
        columns,
        values
      );

      console.log(insertResult.insertId,1010101010);

      if (insertResult) {
        return res
          .status(201)
          .json({ status: true, message: "Chapter created Successfully.",data:{chapter_id: insertResult.insertId } });
      } else {
        return res
          .status(404)
          .json({ status: true, message: "Issue in adding chapter." });
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const getRecipeListForChapter = async (req, res) => {
  const {
    page,
    limit,
    search,
    cuisine_id,
    category_id,
    sub_category_id,
    sort,
    veg_only = false,
    user_id,
    chapter_id,
  } = req.body;
  try {
    //Fetch notifications for particular user
    const recipeBookmarktable = tables.bookmarkedRecipes;
    const selectrecipeBookmarkColumns = ["*"];
    const recipeBookmarkWhereCondition = [
      {
        field: "chapter_id",
        operator: "=",
        value: chapter_id,
      },
      {
        field: "is_deleted",
        operator: "=",
        value: "0",
      },
    ];

    const { results: recipeBookmarkList } = await readRecord({
      table: `${recipeBookmarktable}`,
      selectFields: selectrecipeBookmarkColumns,
      conditions: recipeBookmarkWhereCondition,
    });
    console.log(recipeBookmarkList, 142);
    const recipeIds = recipeBookmarkList.map((item) => item.recipe_id);
    if (recipeIds.length === 0) {
      return res.status(201).json({
        status: true,
        message: "No Recipe found for this chapter.",
        data: [],
        totalCount: 0,
      });
    }
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
      "CONCAT(ad.first_name,' ',ad.last_name) as recipe_by",
      `r.ingredients`,
      "r.view_count",
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
    console.log(recipeIds, 183);
    const conditions = [
      { field: "r.is_deleted", operator: "=", value: 0 },
      { field: "r.id", operator: "IN", value: recipeIds },
    ];
    if (cuisine_id) {
      conditions.push({
        field: "r.cuisine_id",
        operator: "=",
        value: cuisine_id,
      });
    }
    if (category_id) {
      conditions.push({
        field: "r.category_id",
        operator: "=",
        value: category_id,
      });
    }
    if (sub_category_id) {
      conditions.push({
        field: "r.sub_category_id",
        operator: "=",
        value: sub_category_id,
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
      orderBy.push("r.title ASC");
    } else if (sort === "view") {
      orderBy.push("r.view_count DESC");
    } else if (sort === "videos") {
      orderBy.push("r.recipe_video DESC");
    }
    const { results: rows, totalCount } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields,
      joins: joinTables,
      conditions,
      pagination: { limit, page },
      search: { searchQuery: search },
      countTotal: true,
      orderBy,
    });

    const recipes = rows.map((recipe) => {
      console.log(recipe);
      return {
        id: recipe.id,
        title: recipe.title,
        category: recipe.category_name,
        sub_category: recipe.sub_category_name || "",
        cuisine: recipe.cuisine_name,
        recipe_type: recipe.recipe_type_title || "",
        recipe_icon: JSON.parse(recipe.recipe_icon) || [],
        recipe_images: recipe.recipe_images
          ? JSON.parse(recipe.recipe_images)
          : [],
        recipe_video: recipe.recipe_video
          ? JSON.parse(recipe.recipe_video)
          : "",
        status: recipe.status,
        hashtags: recipe.hashtags ? JSON.parse(recipe.hashtags) : [],
        ingredients: JSON.parse(recipe.ingredients) || [],
        view_count: recipe.view_count,
        meta_data: {
          link: recipe.link || "",
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
          method: recipe.method ? JSON.parse(recipe.method) : [],
          recipe_by: String(recipe.recipe_by) || "",
        },
      };
    });

    return res.status(201).json({
      status: true,
      message: "Recipe List fetched Successfully.",
      data: recipes,
      totalCount,
    });
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const addRecipeToChapter = async (req, res) => {
  const newData = req.body;
  try {
    const user_id = newData.user_id;
    const chapter_id = newData.chapter_id;
    const recipe_id = newData.recipe_id;
    const recipe_name = newData.recipe_name;

    //Fetch notifications for particular user
    const recipeBookmarktable = tables.bookmarkedRecipes;
    const selectrecipeBookmarkColumns = ["*"];
    const recipeBookmarkWhereCondition = [
      {
        field: "chapter_id",
        operator: "=",
        value: chapter_id,
      },
      {
        field: "recipe_id",
        operator: "=",
        value: recipe_id,
      },
      {
        field: "is_deleted",
        operator: "=",
        value: "0",
      },
    ];

    const { results: recipeBookmarkList } = await readRecord({
      table: `${recipeBookmarktable}`,
      selectFields: selectrecipeBookmarkColumns,
      conditions: recipeBookmarkWhereCondition,
    });

    if (recipeBookmarkList.length > 0) {
      return res.status(404).json({ message: "Recipe Already Exists." });
    } else {
      const columns = [
        "user_id",
        "recipe_id",
        "recipe_name",
        "chapter_id",
        "created_date",
      ];
      const currentDate = getCurrentDateTime();

      const values = [user_id, recipe_id, recipe_name, chapter_id, currentDate];
      const insertResult = await insertRecord(
        `${tables.bookmarkedRecipes}`,
        columns,
        values
      );

      if (insertResult) {
        return res
          .status(201)
          .json({ status: true, message: "Recipe added Successfully." });
      } else {
        return res
          .status(404)
          .json({ status: true, message: "Issue in adding recipe." });
      }
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const deleteChapter = async (req, res) => {
  const newData = req.body;
  try {
    const chapter_id = newData.chapter_id;

    //Update delete status for the chapter ID
    const chapterDeleteData = {
      is_deleted: "1",
    };
    //If personal_details_id is present then update the record.
    const condition = { chapter_id: chapter_id };
    // Perform the database update
    const updateResult = await updateRecord(
      `${tables.recipeChapters}`,
      filterObjectRemoveNullValues(chapterDeleteData),
      condition
    );

    if (updateResult) {
      return res
        .status(201)
        .json({ status: true, message: "Chapter deleted successfully." });
    } else {
      return res.status(404).json({ message: error.message });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const deleteRecipesFromChapter = async (req, res) => {
  const newData = req.body;
  try {
    const chapter_id = newData.chapter_id;
    const recipe_id = newData.recipe_id;

    //Update delete status for the chapter ID
    const recipeDeleteData = {
      is_deleted: "1",
    };
    //If personal_details_id is present then update the record.
    const condition = { chapter_id: chapter_id, recipe_id: recipe_id };
    // Perform the database update
    const updateResult = await updateRecord(
      `${tables.bookmarkedRecipes}`,
      filterObjectRemoveNullValues(recipeDeleteData),
      condition
    );

    if (updateResult) {
      return res
        .status(201)
        .json({ status: true, message: "Recipe deleted successfully." });
    } else {
      return res.status(404).json({ message: error.message });
    }
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};
