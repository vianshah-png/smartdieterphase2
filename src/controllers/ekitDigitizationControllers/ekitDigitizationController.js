import axios from "axios";
import moment from "moment";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { image_guide_base_url, tables } from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import { sendSSEEvent } from "../dashboardNotificationController.js";
import { addAutoDraftedQuery } from "../common.js";
import { addAmountWallet } from "../../helper/common.js";

async function assignLead(user_id, counsellor_id) {
  let assigned_by = user_id;
  const updateCounsellor = await updateRecord(
    tables.userDetails,
    { counsellor_assigned: counsellor_id },
    { user_id: parseInt(user_id) },
  );
  console.log(updateCounsellor);
  if (updateCounsellor.info.substr(0, 27) === "Rows matched: 1  Changed: 0") {
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "No rows changed",
    });
    return res.status(200).json(apiResponse);
  }
  await addLeadAssignLog({
    user_id: user_id,
    assigned_by: assigned_by,
    counsellor_id: counsellor_id,
  });
}

const getRestaurantMenuByCuisineId = async (req, res, next) => {
  try {
    const { cuisine_id, course_id, search, user_id } = req.query;

    // Step 1: Fetch all cuisines
    const { results: cuisinesRaw } = await readRecord({
      table: `${tables.restaurantCuisines}`,
      selectFields: ["cuisine_id", "cuisine_name", "cuisine_image_url"],
      orderBy: ["cuisine_name ASC"],
    });

    const priorityOrder = [];
    const cuisines = cuisinesRaw
      .filter(
        (c) =>
          c.cuisine_name.toLowerCase() !== "other" &&
          c.cuisine_name.toLowerCase() !== "others",
      )
      .sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a.cuisine_name);
        const bIndex = priorityOrder.indexOf(b.cuisine_name);
        if (aIndex === -1 && bIndex === -1)
          return a.cuisine_name.localeCompare(b.cuisine_name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
      .map((cuisine) => ({
        ...cuisine,
        cuisine_image_url: cuisine.cuisine_image_url,
        cuisine_banner_image: "",
      }));

    // Step 2: Fetch all course types
    const { results: courses } = await readRecord({
      table: `${tables.restaurantCourses}`,
      selectFields: ["course_id", "course_name"],
      orderBy: ["course_name ASC"],
    });

    // Step 3: Build conditions
    const conditions = [];
    if (cuisine_id) {
      conditions.push({
        field: "rm.cuisine_id",
        operator: "=",
        value: cuisine_id,
      });
    }
    if (course_id) {
      conditions.push({
        field: "rm.course_id",
        operator: "=",
        value: course_id,
      });
    }
    if (search) {
      conditions.push({
        field: "rm.food_name",
        operator: "LIKE",
        value: `%${search}%`,
      });
    }

    // Step 4: Fetch menu items
    const { results: menuItems } = await readRecord({
      table: `${tables.restaurantFoodMenu} rm`,
      selectFields: [
        "rm.food_id",
        "rm.food_name",
        "rm.course_id",
        "rc.course_name",
        "rm.cuisine_id",
        "rm.portion_size",
        "rm.energy",
        "rm.protein",
        "rm.fat",
        "rm.carbs",
        "rm.fibre",
        "rm.food_type",
        "rm.nutrient_tags",
        "rm.allergy_tags",
        "rm.food_image",
      ],
      joins: [
        {
          table: `${tables.restaurantCourses} rc`,
          on: "rm.course_id = rc.course_id",
          type: "LEFT",
        },
      ],
      conditions,
      orderBy: ["rm.food_name ASC"],
    });

    // Step 5: Format results
    const formattedMenu = menuItems.map((item) => {
      const nutrientTags = JSON.parse(item.nutrient_tags || "[]");
      const allergyTags = JSON.parse(item.allergy_tags || "[]");

      const foodType = item.food_type?.toLowerCase() || "";
      const isVegan = foodType === "vegan";
      const isVeg = isVegan || foodType === "veg";

      const cuisineName =
        cuisines.find((c) => c.cuisine_id === item.cuisine_id)?.cuisine_name ||
        "Unknown";

      const tags = new Set([
        ...(item.energy < 250 ? ["Under 250 calories"] : []),
        ...nutrientTags,
        ...allergyTags,
        ...(isVegan ? ["Vegan"] : []),
      ]);

      return {
        id: item.food_id,
        name: item.food_name,
        description: "",
        image: item.food_image?.includes("http")
          ? item.food_image
          : `${item.food_image}`,
        calories: `${item.energy}cal`,
        protein: `${item.protein}g`,
        carbs: `${item.carbs}g`,
        fat: `${item.fat}g`,
        isVeg,
        isVegan,
        food_type: item.food_type,
        quantity: item.portion_size,
        cuisine: cuisineName,
        courseType:
          item.course_name?.toLowerCase().replace(/\s+/g, "_") || "other",
        tags: Array.from(tags),
        allergyTags,
        nutrientTags,
      };
    });
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
      }
    }

    // Step 6: Send final response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Menu fetched successfully",
      data: {
        home_banner_image: "",
        cuisines,
        courses,
        menu: formattedMenu,
        pop_up_details: {
          title: "Enjoy Free Access to BN Go Pro!",
          description:
            "You now have 30 days of free access to the BN Go Pro Restaurant Guide. Explore exclusive restaurants, personalized recommendations, and more!",
          button: "Start Exploring",
          image:
            "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png",
          show_pop_up: show_access_popup,
        },
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitUserRestaurantMenu = async (req, res, next) => {
  try {
    const {
      user_id,
      food_menu,
      total_calories,
      excess_calories,
      total_protein,
      total_carbs,
      total_fat,
    } = req.body;

    if (!user_id || !food_menu) {
      return next(new ErrorHandler("User ID and food menu are required", 400));
    }
    await insertRecord(
      tables.userRestaurantMenu,
      [
        "user_id",
        "food_menu",
        "total_calories",
        "excess_calories",
        "total_protein",
        "total_carbs",
        "total_fat",
      ],
      [
        user_id,
        JSON.stringify(food_menu),
        total_calories,
        excess_calories,
        total_protein,
        total_carbs,
        total_fat,
      ],
    );

    const { results: mentorAssignedData } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_type",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });

    const counsellor_assigned = req.body.mentor_id;

    if (
      counsellor_assigned &&
      mentorAssignedData[0].user_type == "0" &&
      mentorAssignedData[0].counsellor_assigned == null
    ) {
      assignLead(user_id, counsellor_assigned);
    }

    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_id",
        "cd.first_name",
        "ad.crm_user as mentor_name",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
        "cd.user_type",
        "ad2.crm_user as counsellor_name",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad2`,
          on: "cd.counsellor_assigned = ad2.admin_user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    console.log(userDetails, 223);
    const user = userDetails[0];
    let mentor_assigned_id,
      nutritionistName = "";
    if (user.user_type == "0") {
      mentor_assigned_id = user.counsellor_assigned;
      nutritionistName = user.counsellor_name;
    } else {
      mentor_assigned_id = user.mentor_assigned;
      nutritionistName = user.mentor_name;
    }
    let query = `<p>Hello ${nutritionistName},</p>

    <p>I ate the following food items from the <strong>BN Restaurant Guide</strong> today at <strong>${moment().format(
      "hh:mm A",
    )}</strong>:</p>
        <p>This is what I Ate:</p>
    <ol>
    `;
    food_menu.map((item) => {
      query += `<li>
            <strong>${item.name}</strong><br>
            Calories: ${item.calories}<br>
            Protein: ${item.protein}<br>
            Carbs: ${item.carbs}<br>
            Fat: ${item.fat}
        </li>`;
    });
    query += `</ol>`;
    if (excess_calories > 0) {
      query += `<p>Here is the Calorie Intake Summary the BN App Calculated:</p><br>
    <p>My calorie limit was set at 500 cal, but I ended up consuming ${total_calories} cal ☹️</p><br>
    <p>So I was in <strong>Excess Calorie Consumption ${excess_calories} calories</strong></p><br>


    <p>Please let me know if I should do a detox or any other trick to burn these off!</p>`;
    } else {
      query += `<p>Here is the Calorie Intake Summary the BN App Calculated:</p>
<p>My calorie limit was set at 500 calories, & I ended up consuming ${total_calories} calories 😀</p><br>
<p>So I was <strong>well within my allowed calorie consumption</strong>.</p><br>

<p>Do let me know if anything needs to be done to ensure it doesn't impact my progress.</p>
`;
    }
    console.log(query, 259);
    const autoChat = await clientEnquiry.create({
      user_id: user.user_id,
      name: user.first_name,
      query: query,
      mentor_id: mentor_assigned_id,
      sender: "client",
      type: "query",
    });
    console.log(autoChat, 266);
    let draftQuery = "";

    console.log(excess_calories, 271);
    if (excess_calories > 0 && excess_calories < 201) {
      draftQuery = `<p>Hi ${user.first_name},</p> <b>PLEASE EDIT AND SEND</b>

<p>I am glad you filled out the BN Restaurant Guide. I see we have eaten ${excess_calories} calories extra.</p>
<br>
<p>While it's a small excess, it's important to keep an eye on staying within your calorie target.<br>
Don't worry—this is all part of the process, and we can work on making small adjustments to help you stay on track with your goals moving forward. No detoxes or starvation needed :)</p>
<br>
<p>Let's try getting 8000/10000 steps through the day &amp; stay vigilant on hydration.</p>
<br>
<p>Keep updating me on your meals otherwise too.</p>
<br>
<p>Let me know if you need any tips or suggestions for future meals. You're doing great—keep it up!</p>
`;
    } else if (excess_calories > 0 && excess_calories > 200) {
      draftQuery = `<p>Hi ${user.first_name},</p> <b>PLEASE EDIT AND SEND</b>

<p>I am glad you filled out the BN Restaurant Guide. I see we have eaten ${excess_calories} calories extra.</p>
<br>
<p>While it's a substantial excess, it's important to keep an eye on staying within your calorie target.<br>
Don't worry—this is all part of the process, and we can work on making small adjustments to help you stay on track with your goals.</p>
<br>
<p>Can we do a <a href="https://www.balancenutrition.in/app_link/screen_id=21/redirect_id=112">1-day weight loss cleanse</a> </p> <p><a href="https://www.balancenutrition.in/app_link/screen_id=21/redirect_id=113">flat stomach cleanse</a></p> <p> <a href="https://www.balancenutrition.in/app_link/screen_id=21/redirect_id=114">No sugar cleanse</a> in the coming days? (CHOOSE 1 OR 2 ACCORDING TO EXCESS CALORIES MENTORS)</p>
<br>
<p>Let's also try getting 8000/10000 steps through the day & stay vigilant on hydration. 1 litre of any infused water will help if sipped throughout the day.</p>
<br>
<p>Keep updating me on your meals otherwise too.<br>
Let me know if you need any tips or suggestions for future outside meals.</p>
`;
    } else if (excess_calories === 0) {
      draftQuery = `<p>Hi ${user.first_name},</p> <b>PLEASE EDIT AND SEND</b>

<p>I am glad you filled out the BN Restaurant Guide. Great Job, you have eaten within your calorie limit!</p>
<br>
<p>It is important to keep an eye on staying within your calorie target.</p>
<br>
<p>Keep updating me on your meals otherwise too.<br>
Let me know if you need any tips or suggestions for future meals. You're doing great—keep it up!</p>
`;
    }
    if (draftQuery !== "") {
      await addAutoDraftedQuery({
        mentor_id: mentor_assigned_id,
        user_id: user.user_id,
        query: draftQuery,
      });
    }
    const data = {
      title: `New Restaurant Menu Received!`,
      description: `${user.first_name} has submitted the Food Menu from Restaurant Guide. 
Kindly review it.`,
      redirect: `/profile/${user.user_id}?menu=chat`,
      priority: 1,
    };
    sendSSEEvent({ mentor_id: user.mentor_assigned, data });

    await addAmountWallet({
      amount: "100",
      reason: `Restaurant Guide Log In`,
      user_id,
    });

    if (user_id) {
      const arr = ["537", "538", "539", "540"];
      let notification_id = arr[Math.floor(Math.random() * arr.length)];
      const sendNotification = await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: notification_id,
        },
      );
    }

    const response = new ApiResponse({
      statusCode: 200,
      message: "User restaurant menu submitted successfully",
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error occurred:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUsersWithRestaurantMenus = async (req, res, next) => {
  try {
    const { mentor_id } = req.query;

    if (!mentor_id) {
      return next(new ErrorHandler("Mentor ID is required", 400));
    }

    const { results: rows } = await readRecord({
      table: `${tables.userRestaurantMenu} urm`,
      selectFields: [
        "urm.menu_id",
        "urm.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "urm.food_menu",
        "urm.total_calories",
        "urm.excess_calories",
        "urm.total_protein",
        "urm.total_carbs",
        "urm.total_fat",
        "urm.added_date",
      ],
      joins: [
        {
          table: `${tables.userDetails} ud`,
          on: "urm.user_id = ud.user_id",
          type: "INNER",
        },
      ],
      conditions: [
        {
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        },
      ],
      orderBy: ["urm.added_date DESC"],
    });

    const response = new ApiResponse({
      statusCode: 200,
      message: "Users with restaurant menus fetched successfully",
      data: rows,
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserMenuHistory = async (req, res, next) => {
  const { user_id } = req.query;

  try {
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }

    // Step 1: Fetch user menu history
    const { results: userMenus } = await readRecord({
      table: "user_restaurant_menu",
      selectFields: [
        "menu_id",
        "user_id",
        "food_menu",
        "total_calories",
        "excess_calories",
        "total_protein",
        "total_carbs",
        "total_fat",
        "added_date",
      ],
      conditions: [{ field: "user_id", operator: "=", value: Number(user_id) }],
      orderBy: ["added_date DESC"],
    });

    if (!userMenus.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No menu history found for this user.",
          data: [],
        }),
      );
    }

    // Step 2: Collect all unique food_ids
    const allFoodIds = new Set();
    userMenus.forEach((entry) => {
      const foodItems = JSON.parse(entry.food_menu || "[]");
      foodItems.forEach((item) => allFoodIds.add(item.id));
    });

    // Step 3: Fetch food details from restaurant_food_menu
    const { results: foodDetails } = await readRecord({
      table: "restaurant_food_menu",
      selectFields: ["food_id", "cuisine_id"],
      conditions: [
        {
          field: "food_id",
          operator: "IN",
          value: Array.from(allFoodIds),
        },
      ],
    });

    // Map food_id to cuisine_id
    const foodToCuisine = {};
    foodDetails.forEach((fd) => {
      foodToCuisine[fd.food_id] = fd.cuisine_id;
    });

    // Step 4: Fetch all cuisines
    const { results: cuisineData } = await readRecord({
      table: "restaurant_cuisines",
      selectFields: ["cuisine_id", "cuisine_name"],
    });

    // Map cuisine_id to cuisine_name
    const cuisineMap = {};
    cuisineData.forEach((c) => {
      cuisineMap[c.cuisine_id] = c.cuisine_name;
    });

    // Step 5: Build final response
    const formatted = userMenus.map((entry, index) => {
      const foodItems = JSON.parse(entry.food_menu || "[]");

      const menu_selected = foodItems.map((item) => {
        const cuisine_id = foodToCuisine[item.id];
        const cuisine = cuisineMap[cuisine_id] || "";

        return {
          name: item.name,
          cuisine,
          calories: parseFloat(item.calories?.replace("cal", "").trim() || 0),
          protein: parseFloat(item.protein?.replace("g", "").trim() || 0),
          carbs: parseFloat(item.carbs?.replace("g", "").trim() || 0),
          fat: parseFloat(item.fat?.replace("g", "").trim() || 0),
        };
      });

      const addedMoment = moment(entry.added_date);
      const isToday = addedMoment.isSame(moment(), "day");
      const daysAgo = moment().diff(addedMoment, "days");

      return {
        sr_no: index + 1,
        menu_selected,
        overall_macros: {
          total_calories: entry.total_calories,
          excess_calories: entry.excess_calories,
          total_protein: entry.total_protein,
          total_carbs: entry.total_carbs,
          total_fat: entry.total_fat,
        },
        added_date: addedMoment.format("Do MMMM YYYY, hh:mm A"),
        relative_date: isToday
          ? ""
          : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`,
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User restaurant menu history fetched successfully",
        data: formatted,
      }),
    );
  } catch (error) {
    console.error("Error fetching menu history:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAlcoholMenu = async (req, res, next) => {
  try {
    const { category_id, search } = req.query;

    // Step 1: Fetch all alcohol categories
    const { results: rawCategories } = await readRecord({
      table: "alcohol_categories",
      selectFields: ["category_id", "category_name", "category_image_url"],
      conditions: [
        {
          field: "category_id",
          operator: "!=",
          value: 7,
        },
      ],
      orderBy: ["category_name ASC"],
    });

    const categories = rawCategories.map((cat) => ({
      ...cat,
    }));

    // Step 2: Build conditions
    const conditions = [];
    if (category_id) {
      conditions.push({
        field: "am.category_id",
        operator: "=",
        value: category_id,
      });
    }

    if (search) {
      conditions.push({
        field: "am.alcohol_name",
        operator: "LIKE",
        value: `%${search}%`,
      });
    }

    // Step 3: Fetch alcohol items
    const { results: alcoholItems } = await readRecord({
      table: "alcohol_master am",
      selectFields: [
        "am.alcohol_id",
        "am.alcohol_name",
        "am.category_id",
        "ac.category_name",
        "am.serving_size",
        "CAST(am.calories AS UNSIGNED) AS calories",
        "CAST(am.abv AS DECIMAL(5,2)) AS abv",
        "ROUND(CAST(am.abv AS DECIMAL(5,2)) * 0.75, 1) AS idealAbv",
        "CAST(am.sugar AS DECIMAL(5,2)) AS sugar",
        "LOWER(am.health_ratings) AS healthRating",
        "am.alcohol_image",
      ],
      joins: [
        {
          table: "alcohol_categories ac",
          on: "am.category_id = ac.category_id",
          type: "LEFT",
        },
      ],
      conditions, // whatever conditions you're already passing
      orderBy: ["am.alcohol_name ASC"],
    });

    console.log("Yessss", 123123123);
    // Step 4: Format alcohol menu
    const formattedMenu = alcoholItems.map((item) => {
      const tags = new Set([
        ...(item.calories < 120 ? ["Low Calorie"] : []),
        ...(item.sugar < 5 ? ["Low Sugar"] : []),
        ...(item.abv < 5 ? ["Low ABV"] : []),
        ...(item.healthRating === "good" ? ["Recommended"] : []),
      ]);

      return {
        id: item.alcohol_id,
        name: item.alcohol_name,
        type: item.category_name?.toLowerCase() || "other",
        servingSize: item.serving_size,
        calories: `${item.calories}cal`,
        abv: item.abv,
        idealAbv: item.idealAbv,
        sugar: item.sugar,
        healthRating: item.healthRating,
        image: item.alcohol_image,
        tags: Array.from(tags),
      };
    });

    // Step 5: Respond
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Alcohol menu fetched successfully",
      data: {
        home_banner_image: "", // Optional
        categories,
        menu: formattedMenu,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitUserAlcoholMenu = async (req, res, next) => {
  try {
    const {
      client_id,
      menu,
      total_calories,
      alcohol_calories,
      mixture_calories,
      excess_calories,
    } = req.body;

    if (!client_id || !menu) {
      return next(
        new ErrorHandler("Client ID and alcohol menu are required", 400),
      );
    }

    // Step 1: Insert the data into the database
    await insertRecord(
      tables.userAlcoholMenu,
      [
        "user_id",
        "alcohol_menu",
        "total_calories",
        "alcohol_calories",
        "mixers_calories",
        "excess_calories",
        "added_date",
      ],
      [
        client_id,
        JSON.stringify(menu),
        total_calories,
        alcohol_calories,
        mixture_calories,
        excess_calories,
        new Date().toISOString().slice(0, 19).replace("T", " "), // Date format YYYY-MM-DD HH:mm:ss
      ],
    );

    const { results: mentorAssignedData } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_type",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: client_id }],
    });

    const counsellor_assigned = req.body.mentor_id;

    if (
      counsellor_assigned &&
      mentorAssignedData[0].user_type == "0" &&
      mentorAssignedData[0].counsellor_assigned == null
    ) {
      assignLead(client_id, counsellor_assigned);
    }

    // Step 2: Get user and mentor info
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_id",
        "cd.first_name",
        "ad.crm_user as mentor_name",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
        "cd.user_type",
        "ad2.crm_user as counsellor_name",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad2`,
          on: "cd.counsellor_assigned = ad2.admin_user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: client_id }],
    });
    console.log(userDetails, 223);
    const user = userDetails[0];
    let mentor_assigned_id,
      nutritionistName = "";
    if (user.user_type == "0") {
      mentor_assigned_id = user.counsellor_assigned;
      nutritionistName = user.counsellor_name;
    } else {
      mentor_assigned_id = user.mentor_assigned;
      nutritionistName = user.mentor_name;
    }
    // Step 3: Build alcohol consumption report
    let query = `<p>Hello ${nutritionistName},</p>
<p>I consumed the following drinks from the <strong>BN Alcohol Guide</strong> today at <strong>${moment().format(
      "hh:mm A",
    )}</strong>:</p>
<p>This is what I drank:</p><ol>`;

    menu.map((item) => {
      query += `<li>
        <strong>${item.name}</strong><br>
        Serving: ${item.servingSize}<br>
        No. of Drinks: ${item.drinks_count}<br>
        Calories: ${item.calories}<br>
        ABV: ${item.abv}%<br>
        Sugar: ${item.sugar}g
      </li>`;
    });

    query += `</ol>`;

    if (excess_calories > 0) {
      query += `<p>Here's the calorie summary:</p>
<p>My limit was 300 kcal, but I consumed <strong>${total_calories} kcal</strong>, i.e., <strong>${excess_calories} kcal excess ☹️</strong>.</p>
<p>Please let me know if I should do a detox or compensate in any way!</p>`;
    } else {
      query += `<p>Here's the calorie summary:</p>
<p>My limit was 300 kcal and I stayed within it, consuming <strong>${total_calories} kcal 😀</strong>.</p>
<p>Let me know if you’d like to review or tweak anything.</p>`;
    }

    // Step 4: Save the user query
    await clientEnquiry.create({
      user_id: user.user_id,
      name: user.first_name,
      query,
      mentor_id: mentor_assigned_id,
      sender: "client",
      type: "query",
    });

    // Step 5: Create draft response for the mentor
    let draftQuery = "";

    if (excess_calories > 0 && excess_calories < 101) {
      draftQuery = `<p>Hi ${user.first_name},</p> <b>PLEASE EDIT AND SEND</b>
<p>Thanks for filling out the BN Alcohol Guide. Looks like we had ${excess_calories} kcal extra.</p>
<p>It's a minor excess — nothing to stress over. Let's aim for 8000–10000 steps and extra hydration today!</p>`;
    } else if (excess_calories > 100) {
      draftQuery = `<p>Hi ${user.first_name},</p> <b>PLEASE EDIT AND SEND</b>
<p>Thanks for logging your alcohol intake. We exceeded our limit by ${excess_calories} kcal.</p>
<p>Would you be open to doing a <a href="https://www.balancenutrition.in/app_link/screen_id=21/redirect_id=112">1-day detox</a> or <a href="https://www.balancenutrition.in/app_link/screen_id=21/redirect_id=113">flat stomach cleanse</a> this week?</p>
<p>Stay hydrated and log all meals — we’ll bounce back easily!</p>`;
    } else {
      draftQuery = `<p>Hi ${user.first_name},</p> <b>PLEASE EDIT AND SEND</b>
<p>You stayed within your alcohol calorie limit — great job! 🎉</p>
<p>Keep it going. Let me know if you need help planning around future occasions.</p>`;
    }

    // Step 6: Save draft query
    if (draftQuery !== "") {
      await addAutoDraftedQuery({
        mentor_id: mentor_assigned_id,
        user_id: user.user_id,
        query: draftQuery,
      });
    }

    // Step 7: Notify the mentor
    const notification = {
      title: "New Alcohol Menu Received!",
      description: `${user.first_name} has submitted their Alcohol intake. Please review.`,
      redirect: `/profile/${user.user_id}?menu=chat`,
      priority: 1,
    };

    sendSSEEvent({ mentor_id: user.mentor_assigned, data: notification });

    await addAmountWallet({
      amount: "200",
      reason: `Alcohol Guide Log In`,
      user_id: client_id,
    });

    if (client_id) {
      const arr = ["541", "542", "543", "544"];
      let notification_id = arr[Math.floor(Math.random() * arr.length)];
      const sendNotification = await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [client_id],
          notification_id: notification_id,
        },
      );
    }
    // Step 8: Return response
    const response = new ApiResponse({
      statusCode: 200,
      message: "User alcohol menu submitted successfully",
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error occurred:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUserAlcoholHistory = async (req, res, next) => {
  const { user_id } = req.query;

  try {
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }

    // Step 1: Fetch user alcohol history
    const { results: userAlcoholHistory } = await readRecord({
      table: "user_alcohol_menu",
      selectFields: [
        "alcohol_menu_id",
        "user_id",
        "alcohol_menu",
        "total_calories",
        "alcohol_calories",
        "mixers_calories",
        "excess_calories",
        "added_date",
      ],
      conditions: [{ field: "user_id", operator: "=", value: Number(user_id) }],
      orderBy: ["added_date DESC"],
    });

    if (!userAlcoholHistory.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No alcohol history found for this user.",
          data: [],
        }),
      );
    }

    // Step 2: Collect all unique alcohol IDs
    const allAlcoholIds = new Set();
    userAlcoholHistory.forEach((entry) => {
      const alcoholItems = JSON.parse(entry.alcohol_menu || "[]");
      alcoholItems.forEach((item) => allAlcoholIds.add(item.id));
    });

    // Step 3: Fetch alcohol details from alcohol_master
    const { results: alcoholDetails } = await readRecord({
      table: "alcohol_master",
      selectFields: ["alcohol_id", "category_id", "alcohol_name"],
      conditions: [
        {
          field: "alcohol_id",
          operator: "IN",
          value: Array.from(allAlcoholIds),
        },
      ],
    });

    // Map alcohol_id to category_id and alcohol_name
    const alcoholToCategory = {};
    alcoholDetails.forEach((ad) => {
      alcoholToCategory[ad.alcohol_id] = {
        category_id: ad.category_id,
        alcohol_name: ad.alcohol_name,
      };
    });

    // Step 4: Fetch all alcohol categories
    const { results: categoryData } = await readRecord({
      table: "alcohol_categories",
      selectFields: ["category_id", "category_name"],
    });

    // Map category_id to category_name
    const categoryMap = {};
    categoryData.forEach((c) => {
      categoryMap[c.category_id] = c.category_name;
    });

    // Step 5: Build final response
    const formatted = userAlcoholHistory.map((entry, index) => {
      const alcoholItems = JSON.parse(entry.alcohol_menu || "[]");

      const alcoholSelected = alcoholItems.map((item) => {
        const { category_id, alcohol_name } = alcoholToCategory[item.id];
        const category = categoryMap[category_id] || "";
        console.log(item, 11112222);
        return {
          name: alcohol_name,
          category,
          serving_size: parseFloat(
            item.servingSize?.replace("ml", "").trim() || 0,
          ),
          total_drinks: parseFloat(item.drinks_count || 0),
          calories: parseFloat(item.calories?.replace("cal", "").trim() || 0),
          abv: parseFloat(item.abv?.trim() || 0),
          sugar: parseFloat(item.sugar?.replace("g", "").trim() || 0),
        };
      });

      const addedMoment = moment(entry.added_date);
      const isToday = addedMoment.isSame(moment(), "day");
      const daysAgo = moment().diff(addedMoment, "days");

      return {
        sr_no: index + 1,
        alcohol_selected: alcoholSelected,
        overall_calories: {
          total_calories: entry.total_calories,
          alcohol_calories: entry.alcohol_calories,
          mixers_calories: entry.mixers_calories,
          excess_calories: entry.excess_calories,
        },
        added_date: addedMoment.format("Do MMMM YYYY, hh:mm A"),
        relative_date: isToday
          ? ""
          : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`,
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "User alcohol history fetched successfully",
        data: formatted,
      }),
    );
  } catch (error) {
    console.error("Error fetching alcohol history:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFreeFillerData = async (req, res, next) => {
  const { category_id, tags } = req.body;

  try {
    const conditions = [];

    // ✅ Category ID filter
    if (
      category_id &&
      !(
        Array.isArray(category_id) &&
        category_id.length === 1 &&
        category_id[0] === ""
      ) &&
      category_id !== ""
    ) {
      conditions.push({
        field: "category_id",
        operator: "IN",
        value: Array.isArray(category_id) ? category_id : [category_id],
      });
    }

    // ✅ Tags filter
    if (
      Array.isArray(tags) &&
      tags.length &&
      !(tags.length === 1 && tags[0] === "")
    ) {
      const pattern = /under-\d+-cal/;
      const patternToExtractCal = /under-(\d+)-cal/;

      const foodType = tags.includes("vegan")
        ? "vegan"
        : tags.includes("vegetarian")
          ? "vegetarian"
          : null;

      if (foodType === "vegan") {
        conditions.push({
          field: "LOWER(food_type)",
          operator: "=",
          value: "vegan",
          rawField: true,
        });
      } else if (foodType === "vegetarian") {
        conditions.push({
          field: "LOWER(food_type)",
          operator: "IN",
          value: ["vegetarian", "vegan"],
          rawField: true,
        });
      }

      const filteredTags = tags.filter(
        (tag) =>
          !pattern.test(tag) &&
          tag !== "veg" &&
          tag !== "vegan" &&
          tag !== "vegetarian",
      );

      if (filteredTags.length) {
        const perTagConditions = filteredTags.map(
          (tag) =>
            `(JSON_CONTAINS(allergy_tags, '"${tag}"') OR JSON_CONTAINS(nutritional_tags, '"${tag}"'))`,
        );

        // ✅ ensure this combines properly with category_id
        conditions.push({
          field: `(${perTagConditions.join(" AND ")})`,
          operator: "",
          value: "",
          raw: true,
        });
      }

      const calTags = tags
        .map((item) => {
          const match = item.match(patternToExtractCal);
          return match ? Number(match[1]) : null;
        })
        .filter(Boolean);

      if (calTags.length > 0) {
        const maxCal = Math.max(...calTags);
        if (Number.isFinite(maxCal)) {
          conditions.push({
            field: "calories",
            operator: "<",
            value: maxCal,
          });
        }
      }
    }

    // ✅ Query config
    const queryConfig = [
      {
        selectField: "*",
        table: "free_filler_data",
        condition: conditions.length ? conditions : [],
        orderBy: ["TRIM(food_name) COLLATE utf8mb4_general_ci"],
      },
    ];

    const result = await readRecordUnion(queryConfig);
    console.log(result, 12121212);
    const existingData = Array.isArray(result) ? result : result?.results || [];

    // ✅ Parse tags safely
    existingData.forEach((item) => {
      ["nutritional_tags", "allergy_tags"].forEach((key) => {
        if (!item[key]) {
          item[key] = [];
        } else if (Array.isArray(item[key])) {
          // already array
        } else if (typeof item[key] === "string") {
          try {
            item[key] = JSON.parse(item[key]);
          } catch {
            item[key] = item[key]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
        } else {
          item[key] = [];
        }
      });
    });

    // ✅ API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: existingData.length
        ? "Data fetched successfully"
        : "No data found for the given filters",
      data: { food_details: existingData, is_shop: true },
    });

    return res.status(200).json(apiResponse);
  } catch (err) {
    console.error("Error in getFreeFillerData:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const submitFreeFillerData = async (req, res, next) => {
  const { user_id, free_filler_data, total_calories } = req.body;

  try {
    await insertRecord(
      tables.freeFillerUsersData,
      ["user_id", "client_free_filler_data", "total_calories"],
      [user_id, JSON.stringify(free_filler_data), total_calories],
    );

    const { results: fillerCountRes } = await readRecord({
      table: tables.freeFillerUsersData,
      selectFields: ["COUNT(*) as cnt"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        {
          field: "DATE(created_at)",
          operator: "=",
          value: "curdate()",
          raw: true,
        },
      ],
    });

    const submissionCount = fillerCountRes?.[0]?.cnt || 1;

    const toOrdinal = (n) => {
      const s = ["th", "st", "nd", "rd"],
        v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const { results: mentorAssignedData } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_type",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });

    const counsellor_assigned = req.body.mentor_id;

    if (
      counsellor_assigned &&
      mentorAssignedData[0].user_type == "0" &&
      mentorAssignedData[0].counsellor_assigned == null
    ) {
      assignLead(user_id, counsellor_assigned);
    }

    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "cd.user_id",
        "cd.first_name",
        "ad.crm_user as mentor_name",
        "cd.mentor_assigned",
        "cd.counsellor_assigned",
        "cd.user_type",
        "ad2.crm_user as counsellor_name",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad2`,
          on: "cd.counsellor_assigned = ad2.admin_user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    console.log(userDetails, 223);
    const user = userDetails[0];
    let mentor_assigned_id,
      nutritionistName = "";
    if (user.user_type == "0") {
      mentor_assigned_id = user.counsellor_assigned;
      nutritionistName = user.counsellor_name;
    } else {
      mentor_assigned_id = user.mentor_assigned;
      nutritionistName = user.mentor_name;
    }
    let query = `<p>Hello ${nutritionistName},</p>
    <p>I ate the following food items from the <strong>BN Quick Filler Guide</strong> today at <strong>${moment().format(
      "hh:mm A",
    )}</strong>:</p>`;

    if (submissionCount === 1) {
      query += `<p>This is what I Ate:</p><ol>`;
    } else {
      query += `<p>This is my <strong>${toOrdinal(
        submissionCount,
      )} meal</strong> using the BN Quick Filler Guide:</p><ol>`; // ✅ Added <ol>
    }

    free_filler_data.forEach((item, index) => {
      query += `<li><strong>${index + 1}. ${item.food_name}</strong><br>
      Quantity: ${item.quantity}<br>
      Calories: ${item.calories} kcal<br>
      Protein: ${item.protein} g<br>
      Carbs: ${item.carbs} g<br>
      Fat: ${item.fat} g
  </li>`;
    });

    query += `</ol>`;

    if (total_calories > 150) {
      const exceeded = total_calories - 150;

      query += `<p>Here is the Calorie Intake Summary the BN App Calculated:</p><br>
      <p><strong>Total Calorie Intake:</strong> ${total_calories} cal</p><br>
      <p><strong>Calories Exceeded:</strong> ${exceeded} cal</p>
      <p>Please let me know what I can do to negate the impact of these excess calories.</p>`;
    } else {
      const pending = 150 - total_calories;

      query += `<p>Here is the Calorie Intake Summary the BN App Calculated:</p><br>
      <p><strong>Total Calorie Intake:</strong> ${total_calories} cal</p><br>
      <p><strong>Calories Pending:</strong> ${pending} cal</p>
      <p>I still have ${pending} calories more to go through this day :)</p>`;
    }

    console.log(query, 1186);
    await clientEnquiry.create({
      user_id: user.user_id,
      name: user.first_name,
      query: query.replace("\n", ""),
      mentor_id: mentor_assigned_id,
      sender: "client",
      type: "query",
    });

    let draftQuery = "";

    if (total_calories > 150) {
      const exceeded = total_calories - 150;
      draftQuery = `<p>Hi ${user.first_name}
      <p>I am glad you filled out the BN Restaurant Guide. I see we have eaten ${exceeded} calories extra.</p>
      <br>
      <p>While it's a small excess, it's important to keep an eye on staying within your calorie target.<br>
      Don't worry—this is all part of the process, and we can work on making small adjustments to help you stay on track with your goals moving forward. No detoxes or starvation needed :)</p>
      <br>
      <p>Let's try getting 8000/10000 steps through the day &amp; stay vigilant on hydration.</p>
      <br>
      <p>Keep updating me on your meals otherwise too.</p>
      <br>
      <p>Let me know if you need any tips or suggestions for future meals. You're doing great—keep it up!</p>
      `;
    } else {
      draftQuery = `
      Hi ${user.first_name}, <br><br>
      Very happy to see you are using the 'BN-QUICK FILLERS Guide'. <br><br>
      All your choices are healthy & I am glad they are well within the calorie intake limit. <br><br>
      There are a lot of options that you can choose from in this guide to manage your cravings & also stay healthy. 
      Browse through it well & keep filling this whenever you use it for my reference and records. <br><br>
      I personally like the ice-creams & beverage sections :) Do take a look at those. 
      Don't go overboard, though; all calories count :)
      `;
    }

    if (draftQuery !== "") {
      await addAutoDraftedQuery({
        mentor_id: mentor_assigned_id,
        user_id: user.user_id,
        query: draftQuery,
      });
    }

    const notification = {
      title: "New Free Filler Data Received!",
      description: `${user.first_name} has submitted their Free Filler intake. Please review.`,
      redirect: `/profile/${user.user_id}?menu=chat`,
      priority: 2,
    };

    sendSSEEvent({ mentor_id: user.mentor_assigned, data: notification });

    await addAmountWallet({
      amount: "50",
      reason: `Quick Filler Guide Log In`,
      user_id,
    });

    if (user_id) {
      const arr = ["545", "546", "547", "548", "549"];
      let notification_id = arr[Math.floor(Math.random() * arr.length)];
      const sendNotification = await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: [user_id],
          notification_id: notification_id,
        },
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Free filler data submitted successfully",
      }),
    );
  } catch (error) {
    console.error("Error occurred while storing the data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCountOfClicksFreeFiller = async (req, res, next) => {
  const { card_id, user_id, is_clicked } = req.body;

  try {
    const { results: existingNameRows } = await readRecord({
      table: tables.freeFillerData,
      selectFields: ["food_name"],
      conditions: [{ field: "id", operator: "=", value: card_id }],
    });

    if (!existingNameRows.length) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No food item found with this id",
      });

      return res.status(200).json(apiResponse);
    }

    const foodName = existingNameRows[0].food_name;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { results: existingClickRows } = await readRecord({
      table: "free_filler_clicks",
      selectFields: ["user_id"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "id_card", operator: "=", value: card_id },
        {
          field: "clicked_at",
          operator: "BETWEEN",
          value: [todayStart, todayEnd],
        },
      ],
    });

    if (existingClickRows.length) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "User has already clicked this card today",
      });

      return res.status(200).json(apiResponse);
    }

    await insertRecord(
      "free_filler_clicks",
      ["user_id", "id_card", "food_name", "clicked_at"],
      [user_id, card_id, foodName, new Date()],
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Data recorded successfully",
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in recording the data:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCalorieCount = async (req, res, next) => {
  const { user_id } = req.query;

  try {
    const today = new Date().toISOString().split("T")[0];

    // 🔹 Get latest total_calories for today
    const { results: latestRecord } = await readRecord({
      table: tables.freeFillerUsersData,
      selectFields: ["total_calories"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "DATE(created_at)", operator: "=", value: today },
      ],
      orderBy: ["total_calories DESC"],
      limit: 1,
    });

    const totalCalories =
      latestRecord.length > 0 ? latestRecord[0].total_calories : 0;

    // 🔹 Get today's meals
    const { results: todaysMeals } = await readRecord({
      table: tables.freeFillerUsersData,
      selectFields: ["client_free_filler_data", "created_at"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "DATE(created_at)", operator: "=", value: today },
      ],
      orderBy: ["created_at ASC"],
    });

    let combinedMeals = [];
    todaysMeals.forEach((meal) => {
      let parsedData = [];
      try {
        parsedData = JSON.parse(meal.client_free_filler_data || "[]");
      } catch (e) {
        parsedData = [];
      }

      if (Array.isArray(parsedData)) {
        const formatted = parsedData.map((m) => ({
          ...m,
          created_at: meal.created_at,
        }));
        combinedMeals = combinedMeals.concat(formatted);
      }
    });

    const formattedResponse = [
      {
        client_free_filler_data: combinedMeals,
      },
    ];

    // 🔹 Get distinct category_ids that have data in freeFillerData
    const { results: usedCategories } = await readRecord({
      table: tables.freeFillerData,
      selectFields: ["DISTINCT category_id"],
    });

    const usedCategoryIds = usedCategories.map((item) => item.category_id);

    // 🔹 Fetch only those categories (alphabetical order)
    let filteredCategories = [];
    if (usedCategoryIds.length > 0) {
      const { results } = await readRecord({
        table: tables.categoryList,
        selectFields: ["*"],
        conditions: [{ field: "id", operator: "IN", value: usedCategoryIds }],
        orderBy: ["category_name ASC"],
      });
      filteredCategories = results;
    }

    // 🔹 Build API response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Today's calories and meals fetched successfully",
      data: {
        total_calories: totalCalories,
        meals: formattedResponse,
        category: filteredCategories, // ✅ only categories with actual data
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching total calories:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getFoodItemOnsearch = async (req, res, next) => {
  const { search, category_id } = req.query;

  try {
    const searchTerm = search?.trim() || "";
    const conditions = [];

    if (searchTerm !== "") {
      conditions.push({
        field: "LOWER(food_name)",
        operator: "LIKE",
        value: `%${searchTerm.toLowerCase()}%`,
      });
    }

    if (category_id && category_id !== "") {
      conditions.push({
        field: "category_id",
        operator: "=",
        value: category_id,
      });
    }

    const queryConfig = [
      {
        selectField: "*",
        table: "free_filler_data",
        condition: conditions,
        orderBy: ["food_name ASC"],
      },
    ];

    const result = await readRecordUnion(queryConfig);

    let matchingItems = Array.isArray(result) ? result : result?.results || [];

    matchingItems = matchingItems.map((item) => ({
      ...item,
      nutritional_tags: Array.isArray(item.nutritional_tags)
        ? item.nutritional_tags
        : item.nutritional_tags
          ? JSON.parse(item.nutritional_tags)
          : [],
      allergy_tags: Array.isArray(item.allergy_tags)
        ? item.allergy_tags
        : item.allergy_tags
          ? JSON.parse(item.allergy_tags)
          : [],
    }));

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: matchingItems.length
        ? "Matching food items found"
        : "No matching food items",
      data: matchingItems,
    });

    return res.status(200).json(apiResponse);
  } catch (err) {
    console.error("Search error:", err);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getFreeAccessPopUp = async (req, res, next) => {
  const { user_id } = req.query;
  try {
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
      }
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Pop Up fetched successfully",
      data: {
        show_pop_up: show_access_popup,
        restaurant_guide_popup: {
          title: "Enjoy Free Access to BN Go Pro!",
          description:
            "You now have 30 days of free access to the BN Go Pro Restaurant Guide. Explore exclusive restaurants, personalized recommendations, and more!",
          button: "Start Exploring",
          image:
            "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png",
        },
        alcohol_guide_popup: {
          title: "Enjoy Free Access to BN Go Pro!",
          description:
            "You now have 30 days of free access to the BN Go Pro Alcohol Guide. Explore exclusive restaurants, personalized recommendations, and more!",
          button: "Start Exploring",
          image:
            "https://www.bncleanse.com/bn-api-new/images/ekit/dashboard-ekit/alcohol_guide.png",
        },
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClaraCategoryList = async (req, res, next) => {
  const { user_id } = req.query;

  try {
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }

    // Step 1: Fetch user info (mocked or from DB)
    // Assuming a 'users' table exists with columns like first_name, last_name, gender, clara_intro, profile_img
    const { results: userData } = await readRecord({
      table: tables.userDetails,
      selectFields: [
        "first_name",
        "last_name",
        "gender",
        "clara_intro",
        "user_id",
        "mentor_assigned",
        "counsellor_assigned",
        "user_type",
      ],
      conditions: [{ field: "user_id", operator: "=", value: Number(user_id) }],
    });

    let admin_id = "";

    if (userData[0].user_type == "0") {
      admin_id = userData[0].counsellor_assigned;
    } else {
      admin_id = userData[0].mentor_assigned;
    }

    const { results: adminData } = await readRecord({
      table: tables.adminUsers,
      selectFields: ["CONCAT(first_name,' ',last_name) as mentor_name"],
      conditions: [{ field: "admin_user_id", operator: "=", value: admin_id }],
    });

    if (!userData.length) {
      return next(new ErrorHandler("User not found", 404));
    }

    const user = userData[0];

    // Step 2: Fetch Clara FAQ categories
    const { results: categoryData } = await readRecord({
      table: tables.claraCategories,
      selectFields: ["category_id", "category_name", "category_image"],
      conditions: [{ field: "is_show", operator: "=", value: 1 }],
    });

    // Step 3: Map category data
    const formattedCategories = categoryData.map((cat) => ({
      category_id: cat.category_id,
      title: cat.category_name,
      icon: cat.category_image,
    }));

    // Step 4: Construct final JSON
    let gender = "Female";
    if (user.gender == "1") {
      gender = "Male";
    }

    const finalResponse = {
      user: {
        first_name: user.first_name,
        last_name: user.last_name,
        gender: gender,
        clara_intro: !!user.clara_intro,
        user_id: user.user_id,
        profile_img: user.profile_img,
        mentor_id: admin_id,
        mentor_name: adminData[0].mentor_name,
      },
      data: formattedCategories,
    };

    // Step 5: Send API response
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Clara FAQ categories fetched successfully",
        data: finalResponse,
      }),
    );
  } catch (error) {
    console.error("Error fetching Clara FAQ categories:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClaraQuestionsAndAnswers = async (req, res, next) => {
  try {
    // Step 1: Fetch all questions and answers
    const { results: qnaData } = await readRecord({
      table: tables.claraQnA,
      selectFields: ["question_id", "category_id", "question", "answer"],
      orderBy: ["category_id ASC", "question_id ASC"],
    });

    if (!qnaData.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No questions or answers found.",
          data: {},
        }),
      );
    }

    // Step 2: Group Q&A by category_id
    const groupedData = {};
    qnaData.forEach((row) => {
      const { category_id, question, answer } = row;

      if (!groupedData[category_id]) {
        groupedData[category_id] = [];
      }

      groupedData[category_id].push({
        question: question || "",
        answer: answer || "",
      });
    });

    // Step 3: Return formatted response
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Clara questions and answers fetched successfully",
        data: groupedData,
      }),
    );
  } catch (error) {
    console.error("Error fetching Clara Q&A:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const CLARA_INTENT_VARIANTS = {
  yes: [
    "yes", "yeah", "ya", "yup", "y", "👍",
    "yes it helped", "helped", "helpful", "it helped", "that helped",
    "works", "worked",
    "ok", "okay", "fine", "alright", "cool",
    "good", "great", "perfect",
    "makes sense", "understood", "got it", "clear", "correct", "right"
  ],

  no: [
    "no", "nope", "na", "naa", "nah",
    "not helpful", "didn’t help", "did not help",
    "not clear", "confusing", "unclear",
    "wrong", "incorrect",
    "doesn’t help", "useless",
    "doesn’t make sense",
    "not what i asked", "not answered", "irrelevant"
  ],

  thank_you: [
    "thank you", "thanks", "thanx","thank u", "thx", "ty", "tysm",
    "thanks a lot", "thank you so much", "thanks a ton",
    "appreciate it", "appreciated","thankss","thanksss"
  ],
  greeting: [
    // basic
    "hi", "hello", "hey",
  
    // extended
    "hi there", "hello there", "hey there",
  
    // casual / chatty
    "hii", "hiii", "hiiii",
    "heyy", "heyyy",
    "helo", "hlo", "heyyo",
  
    // slang / informal
    "yo", "sup", "wassup", "what's up", "whats up",
  
    // polite / professional
    "good morning", "good afternoon", "good evening",
    "greetings",
  
    // indian / hinglish
    "namaste", "namaskar", "pranam", "ram ram",
    "hi ji", "hello ji", "hey ji",
  
    // emoji-style (optional but useful)
    "👋", "👋 hi", "👋 hello"
  ]
};


const CLARA_INTENT_REPLIES = {
  yes: [
    "Glad I could help 😊",
    "Is there anything else I can help you with? Feel free to ask your question below",
  ],

  no: [
    "Since you were not satisfied with my response, I went ahead and forwarded your question to mentor. She will answer this the moment she resumes🙂",
    "Is there anything else I can help you with? Feel free to ask your question below",
  ],

  thank_you: [
   "Glad I could help 😊",
   "Is there anything else I can help you with? Feel free to ask your question below",
  ],

  greeting: [
    "Hello!",
    "How may I assist you?",
    "Ask anything you’re curious about, or tell me what you’d like to know."
  ]  
};

const CLARA_DEFAULT_REPLIES = [
  "I'm here to help! Could you please rephrase your question or choose from the suggested questions?"
];


const detectClaraIntent = (text = "") => {
  const normalizedText = normalizeText(text);

  for (const intent in CLARA_INTENT_VARIANTS) {
    if (CLARA_INTENT_VARIANTS[intent].includes(normalizedText)) {
      return intent;
    }
  }

  return null;
};


const STOPWORDS = [
  // pronouns
  "i","me","my","we","us",

  // intent / filler
  "want","need","needs","needed",
  "know","knowing","tell","explain",
  "learn","understand","information","info",

  // polite / conversational
  "please","kindly","help",

  // connectors
  "about","on","regarding","for",

  // verbs
  "can","could","should","would",
  "do","does","did","is","are","was","were",

  // articles / prepositions
  "the","a","an","to","of","in","at","with","from","by",

  // modifiers
  "more","some","any",
  "yes", "yeah", "ya", "yup", "y", "👍",
    "yes it helped", "helped", "helpful", "it helped", "that helped",
    "works", "worked",
    "ok", "okay", "fine", "alright", "cool",
    "good", "great", "perfect",
    "makes sense", "understood", "got it", "clear", "correct", "right",
    "no", "nope", "na", "naa", "nah",
    "not helpful", "didn’t help", "did not help",
    "not clear", "confusing", "unclear",
    "wrong", "incorrect",
    "doesn’t help", "useless",
    "doesn’t make sense",
    "not what i asked", "not answered", "irrelevant",
    "thank you", "thanks", "thank u", "thx", "ty", "tysm",
    "thanks a lot", "thank you so much", "thanks a ton",
    "appreciate it", "appreciated","thankss","thanksss"

];


const isMeaningfulQuery = (tokens) => {
  if (!tokens?.length) return false;

  // Minimum signal rules
  return tokens.some(token =>
    token.length >= 3 &&                // avoid "a", "ok", "hi"
    /[a-zA-Z]/.test(token) &&            // must contain letters
    !/^[bcdfghjklmnpqrstvwxyz]+$/i.test(token) // reject random consonant spam
  );
};



const extractMeaningfulTokens = (text) => {
  return normalizeText(text)
    .split(" ")
    .filter(word => word && !STOPWORDS.includes(word));
};



const normalizeText = (text = "") =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "");

const tokenize = (text = "") =>
  normalizeText(text)
    .split(" ")
    .filter(Boolean);


    const calculateRelevanceScore = (userTokens, row) => {
      const questionTokens = extractMeaningfulTokens(row.question);
    
      let score = 0;
    
      userTokens.forEach(token => {
        if (questionTokens.includes(token)) {
          score += 30; // strong match
        } else {
          // partial word match (safe)
          const partialMatch = questionTokens.find(qt => qt.includes(token) || token.includes(qt));
          if (partialMatch) {
            score += 10;
          }
        }
      });
    
      // Bonus if question length is close (topic-focused)
      const lengthDiff = Math.abs(questionTokens.length - userTokens.length);
      score += Math.max(0, 10 - lengthDiff);
    
      return score;
    };
    

    const getClaraSuggestedReplies = async (req, res, next) => {
      try {
        const { text,previousQuestion } = req.body;
    
        if (!text) {
          return res.status(400).json(
            new ApiResponse({
              statusCode: 400,
              message: "Text is required",
              data: {},
            })
          );
        }
    
        /* 1️⃣ INTENT LOGIC FIRST — FIXED */
        /* 1️⃣ INTENT LOGIC — ONLY AFTER FEEDBACK QUESTION */
let intent = detectClaraIntent(text);
const isGreetingIntent = intent === "greeting";
if ((previousQuestion === "Was this response helpful?" || isGreetingIntent) &&
CLARA_INTENT_REPLIES[intent]) {

  if (intent && CLARA_INTENT_REPLIES[intent]) {
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Suggested replies generated successfully",
        data: {
          intent,
          replies: CLARA_INTENT_REPLIES[intent],
        },
      })
    );
  }
}

    
        /* 2️⃣ DB QnA LOGIC (ONLY IF INTENT NOT APPLIED) */
        const normalizedText = normalizeText(text);
    
        const { results: qnaData } = await readRecord({
          table: tables.claraQnA,
          selectFields: ["question", "answer"],
        });
    
        if (!qnaData?.length) {
          return res.status(200).json(
            new ApiResponse({
              statusCode: 200,
              message: "No questions or answers found. Default replies returned.",
              data: {
                intent: "default",
                replies: CLARA_DEFAULT_REPLIES,
              },
            })
          );
        }
    
        /* 3️⃣ EXACT QUESTION MATCH */
        const exactMatch = qnaData.find(
          (row) => normalizeText(row.question) === normalizedText
        );
    
        if (exactMatch) {
          return res.status(200).json(
            new ApiResponse({
              statusCode: 200,
              message: "Exact question matched",
              data: {
                intent: "exact_match",
                questions: [],
                replies: [
                  exactMatch.answer || "",
                  "Was this response helpful?"
                ]
              },
            })
          );
        }

        /* 🚫 GIBBERISH / LOW-SIGNAL GUARD */
        const userTokens = extractMeaningfulTokens(text);
        if (!isMeaningfulQuery(userTokens)) {
          return res.status(200).json(
            new ApiResponse({
              statusCode: 200,
              message: "No meaningful match found. Default replies returned.",
              data: {
                intent: "default",
                replies: CLARA_DEFAULT_REPLIES,
              },
            })
          );
        }

/* 4️⃣ RELEVANCE-BASED QUESTION MATCHING */
let rankedQuestions = qnaData
  .map((row) => ({
    question: row.question,
    score: calculateRelevanceScore(userTokens, row),
  }))
  .filter((item) => item.score >= 25)   // your existing match logic
  .sort((a, b) => b.score - a.score)
  .slice(0, 4)
  .map((item) => item.question);

/* ✅ NEW: NO-MATCH GUARD (THIS IS THE FIX) */
if (rankedQuestions.length === 0) {
  return res.status(200).json(
    new ApiResponse({
      statusCode: 200,
      message: "No intent matched. Default replies returned.",
      data: {
        intent: "default",
        replies: CLARA_DEFAULT_REPLIES,
      },
    })
  );
}

/* 🔹 EXISTING PADDING LOGIC (UNCHANGED, SAFE NOW) */
if (rankedQuestions.length < 4) {
  const remainingSlots = 4 - rankedQuestions.length;
  const normalizedTokens = userTokens.map(t => t.toLowerCase());

  const answerMatchedQuestions = qnaData
    .filter(row => {
      if (rankedQuestions.includes(row.question)) return false;
      const answerText = normalizeText(row.answer || "");
      return normalizedTokens.some(token => answerText.includes(token));
    })
    .map(row => row.question)
    .slice(0, remainingSlots);

  rankedQuestions = [...rankedQuestions, ...answerMatchedQuestions];
}

/* 🔹 FINAL GENERIC FILL (if still < 4) */
if (rankedQuestions.length < 4) {
  const remainingSlots = 4 - rankedQuestions.length;

  const genericFill = qnaData
    .map(row => row.question)
    .filter(q => !rankedQuestions.includes(q))
    .slice(0, remainingSlots);

  rankedQuestions = [...rankedQuestions, ...genericFill];
}

/* 🔹 RETURN AS BEFORE */
return res.status(200).json(
  new ApiResponse({
    statusCode: 200,
    message: "Related questions found",
    data: {
      intent: "related_questions",
      questions: rankedQuestions,
      reply: "",
    },
  })
);


        /* 5️⃣ DEFAULT FALLBACK — SAME AS OLD */
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: "No intent matched. Default replies returned.",
            data: {
              intent: "default",
              replies: CLARA_DEFAULT_REPLIES,
            },
          })
        );
      } catch (error) {
        console.error("Error in Clara suggested replies:", error);
        return next(new ErrorHandler("Internal Server Error", 500));
      }
    };
    
    



const getSupportMenuItems = async (req, res, next) => {
  try {
    const supportItems = [
      {
        icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1768297540/app_images/uziohi9zqkwmb3d3xfjs.png",
        title: "Upgrades",
        description: "Enhanced plans with added benefits and priority support.",
        link: "https://balancenutrition.in/privy-platinum/reform-intermittent",
      },
      {
        icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1768297555/app_images/hog1tdp7t7s8jhrhisom.png",
        title: "Help Center",
        description: "Support for client services and general queries.",
        link: "https://www.balancenutrition.in/app_link/screen_id=36",
      },
      {
        icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1768297570/app_images/yhnmen2onpx7ojobboz3.png",
        title: "App related query",
        description: "Support for app usage and technical assistance.",
        link: "https://www.balancenutrition.in/app_link/screen_id=36",
      },
      {
        icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1768297595/app_images/fctd7rffzmeozosrygol.png",
        title: "Mentor Support",
        description: "Get on a call with your mentor.",
        link: "https://www.balancenutrition.in/app_link/screen_id=18/call_type=45",
      },
      // {
      //   icon: "https://res.cloudinary.com/dg4wzx8c8/image/upload/v1768297640/app_images/nccghmbfjlorehdpatyh.png",
      //   title: "Contact Khyati",
      //   description:
      //     "Exclusive guidance from our founder.",
      //   link: "https://api.whatsapp.com/send?phone=919820054339&text=Hi",
      // },
    ];

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Support menu items fetched successfully",
        data: supportItems,
      }),
    );
  } catch (error) {
    console.error("Error fetching support menu items:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getRestaurantMenuByCuisineId,
  submitUserRestaurantMenu,
  getUsersWithRestaurantMenus,
  getUserMenuHistory,
  getAlcoholMenu,
  submitUserAlcoholMenu,
  getUserAlcoholHistory,
  getFreeFillerData,
  submitFreeFillerData,
  getCountOfClicksFreeFiller,
  getCalorieCount,
  getFoodItemOnsearch,
  getFreeAccessPopUp,
  getClaraCategoryList,
  getClaraQuestionsAndAnswers,
  getSupportMenuItems,
  getClaraSuggestedReplies
};
