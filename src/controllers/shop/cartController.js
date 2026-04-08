import {
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import { tables } from "../../helper/constant.js";
import dietDetails from "../../models/dietDetailsModel.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import axios from "axios";

import {
  generateAutoCartCreationMessageTemplates,
  getInstantEmailTemplate,
} from "../../helper/emailAutochatTemplateHelpers/getAutoCartCreationMessageTemplates.js";
import { Product } from "../../models/productModel.js";


function selectDefaultPack(product) {
  if (
    product.is_combo ||
    !Array.isArray(product.packSizes) ||
    product.packSizes.length === 0
  ) {
    return {
      pack_size: "",
      price: product.price,
      original_price: product.original_price
    };
  }

  const packs = [...product.packSizes].sort(
    (a, b) => a.pack_size - b.pack_size
  );


  if (packs.length === 1) {
    return packs[0];
  }

  if (packs.length === 2) {
    return packs[1];
  }

  const midIndex = Math.floor(packs.length / 2);
  return packs[midIndex];
}

const buildProductMap = async () => {
  const productDocs = await Product.find({ isActive: true }).lean();

  const productMap = {};

  for (const product of productDocs) {
    const selectedPack = selectDefaultPack(product);
    productMap[product.slug] = {
      image: product.image,
      product_id: product.slug,
      product_code: product.productCode || product.product_code,
      brand: product?.brand || 'kilobeaters', 
      product_name: product.name,
      quantity: 1,
      pack_size: selectedPack.size
        ? `${selectedPack.size}`
        : "",
      price_per_unit: selectedPack.final_price,
      original_price: selectedPack.price,
      total_price: selectedPack.final_price
    };
  }

  return productMap;
};

export const getCart = async (req, res, next) => {
  const { user_id } = req.body;
  try {
    const { results: cartData } = await readRecord({
      table: tables.cart,
      selectFields: ["cart_id", "cart_items", "added_date", "updated_date"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      orderBy: ["cart_id DESC"],
    });

    if (!cartData.length) {
      return res.status(200).json({
        statusCode: 200,
        message: "No cart found for this user",
        data: [],
      });
    }

    const parsedCart = JSON.parse(cartData[0].cart_items || "[]");

    return res.status(200).json({
      statusCode: 200,
      message: "Cart fetched successfully",
      data: parsedCart,
    });
  } catch (error) {
    console.error("Error in getCart:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addOrUpdateCart = async (req, res, next, internal=false) => {
  console.log(internal, 'internal'); 
  const { user_id, cart_items, cart_code } = req?.body || internal; // cart_items should be an array or object

  try {
    // Check if user already has a cart
    const { results: userCart = [] } = await readRecord({
      table: `cart ct`,
      selectFields: ["ct.cart_id"],
      conditions: [
        {
          field: "ct.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      pagination: { page: 1, limit: 1 },
      orderBy: ["ct.cart_id DESC"],
    });

    const cartInsertCols = ["user_id", "cart_items"];
    const cartInsertVals = [user_id, JSON.stringify(cart_items)];

    const cartUpdateObj = {
      cart_items: JSON.stringify(cart_items),
    };

    if (cart_code) {
      cartInsertCols.push("cart_code");
      cartInsertVals.push(cart_code);
      cartUpdateObj.cart_code = cart_code;
    }

    console.log(userCart, user_id);

    if (userCart?.length > 0) {
      // update cart
      await updateRecord(tables.cart, cartUpdateObj, {
        cart_id: userCart[0]?.cart_id,
      });
    } else {
      if (!cart_items || cart_items?.length == 0) {
        return res.status(200).json({
          statusCode: 200,
          message: "Cart Items Empty",
        });
      }
      await insertRecord(tables.cart, cartInsertCols, cartInsertVals);
    }
    let whatsappText;
    if (req?.body?.cart_code) {
      whatsappText = await sendAutoCartCreationMessages(
        cart_code,
        cart_items,
        user_id
      );
    }

    if (!internal) {
      return res.status(200).json({
      statusCode: 200,
      message: "Cart created successfully",
      data: {
        whatsappText,
      }, 
    });
    }
  } catch (error) {
    console.error("Error in addOrUpdateCart:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getCartByShareLink = async (req, res, next) => {
  const { cart_code } = req.query;
  let cart_id;

  try {
    if (!cart_code) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid share link!",
      });
    }

    // cc-1323
    if (cart_code.startsWith("cc-")) {
      cart_id = cart_code.substring(3);
    }

    const { results: cartData } = await readRecord({
      table: `${tables.cart} ct`,
      selectFields: [
        "ct.cart_id",
        "ct.cart_items",
        "ct.added_date",
        "ct.updated_date",
        "cd.email_id",
        "asd.address as address",
        "cd.phone_code",
        "cd.phone_number",
        "cd.first_name",
        "cd.last_name",
        "cd.user_id",
        "cd.user_status",
        "cd.sub_user_status",
        "ct.added_date",
        "cts.city_name as city",
        "st.state_name as state",
        "cs.country_name as country",
      ],
      conditions: [
        cart_id
          ? { field: "cart_id", operator: "=", value: cart_id }
          : { field: "ct.cart_code", operator: "=", value: cart_code },
      ],

      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: `cd.user_id = ct.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.countries} cs`,
          on: `cs.country_id = cd.country_id`,
        },
        {
          type: "LEFT",
          table: `${tables.cities} cts`,
          on: `cts.city_id = cd.city_id`,
        },
        {
          type: "LEFT",
          table: `${tables.states} st`,
          on: `st.state_id = cd.state_id`,
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} asd`,
          on: `asd.user_id = cd.user_id`,
        },
      ],

      orderBy: ["ct.cart_id"],
    });

    console.log(cartData.length, "CART LEGNTH");

    if (!cartData.length) {
      return res.status(200).json({
        statusCode: 200,
        message: "No cart found for this user",
        data: [],
      });
    }

    const parsedCart = JSON.parse(cartData[0].cart_items || "[]");
    cartData[0].cart_items = parsedCart;

    return res.status(200).json({
      statusCode: 200,
      message: "Cart fetched successfully",
      data: cartData[0],
    });
  } catch (error) {
    console.error("Error in getCart:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const sendAutoCartCreationMessages = async (cart_code, cartItems, user_id) => {
  try {
    console.log(cartItems, "cartItems");
    const cartLink = `https://balancenutrition.in/shop?share=${cart_code}`;

    // get user details for email auto chat and notification
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.phone_number",
        "ud.first_name",
        "ud.last_name",
        "ad.admin_user_id",
        "ad.crm_user as mentor_name",
        "ad.email_id as mentor_email",
        "ud.user_status",
        "ud.device",
        "ad.official_phone as mentor_wa",
        "ad.designation",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = (CASE WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned ELSE ud.mentor_assigned END)`,
        },
      ],
    });

    const user = results[0];
    const cartSummary = `${cartItems
      .map(
        (item) =>
          `${item?.product_name} x ${item?.quantity} = ${
            Number(item?.price_per_unit) * Number(item?.quantity)
          } `
      )
      .join(" || ")}`;
    const total = `${cartItems.reduce(
      (total, item) =>
        total + Number(item?.price_per_unit) * Number(item?.quantity),
      0
    )}`;
    console.log(cartSummary, total);
    if (user?.device) {
      console.log(user?.device, "device is there");
      let notificationId = 950;
      let autoChatMessage = generateAutoCartCreationMessageTemplates(
        user?.first_name,
        cartItems,
        cartLink,
        user?.mentor_wa
      );

      // send notification here:
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user_id],
            notification_id: notificationId,
            sent_via: "",
          }
        );
      } catch (err) {
        console.log("SENDING NOTIFICATION error 5549", err?.message || err);
      }
      // send autochat
      try {
        await clientEnquiry.create({
          mentor_id: user.admin_user_id,
          type: "broadcast",
          sender: "mentor",
          query: autoChatMessage?.instant,
          user_id: user.user_id,
          name: user.mentor_name,
        });
      } catch (err) {
        console.log("SENDING AUTOCHAT error 6116", err?.message || err);
      }
    }

    if (
      ["Lead", "Completed"].includes(user?.user_status) &&
      user?.phone_number
    ) {
      const fullPhone = `${user?.phone_number?.replace(/\D/g, "")}`;
      console.log(fullPhone, cartSummary, total, cart_code, "HERE IS THE FLOW");
      try {
        await axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
          {
            template_name: "share_cart_add_notification_new",
            broadcast_name: "share_cart_add_notification_new",
            parameters: [
              {
                name: "name",
                value: user?.first_name,
              },
              {
                name: "total",
                value: total,
              },
              {
                name: "shareCode",
                value: cart_code,
              },
              {
                name: "cart_summary",
                value: cartSummary,
              },
              {
                name: "mentor_name",
                value: user?.mentor_name || "Mansi",
              },
              {
                name: "mentor_wa",
                value: user?.mentor_wa || "9619845139",
              },
              {
                name: "designation",
                value: user?.designation || "Sr. Nutritionist",
              },
            ],
          }
        );

        console.log("Wati SENT to:", fullPhone, user?.first_name);
      } catch (error) {
        console.log("SENDING WATI error 6147", error?.message || error);
      }
    }

    const whatsappText = `Hi ${user?.first_name},

As per your request, we’ve added the products you selected and created your cart.

*Cart Summary*:
${cartSummary}

Total Amount: *₹${total}*

Click here to complete your order: ${cartLink}

P.S. If you need help or have any questions, feel free to reach out to me`;

    const emailHtml = getInstantEmailTemplate({
      name: user.first_name,
      cartLink: cartLink,
      cartItems: cartItems,
      designation: user?.designation,
      mentor_name: user?.mentor_name,
      mentor_wa: user?.mentor_wa,
    });

    await sendMailUtil({
      from: "support@balancenutrition.in",
      to: user.email_id,
      cc: ["clientservices@balancenutrition.in"],
      bcc: ["testerteam@balancenutrition.in", `${user.mentor_email}`],
      subject: emailHtml.subject,
      html: emailHtml.body,
    });

    return whatsappText;
  } catch (error) {
    console.log(error);
  }
};

export const createCartFromDietSent = async (results) => {

  let dietProductCache = new Map();

  const products = await buildProductMap(); 
  
  // Helper function to extract product IDs from HTML string
  const extractProductIds = (htmlString) => {
    if (!htmlString || htmlString === "N/A") return [];
  
    const productIds = new Set();
    // Matches /shop/{product-slug}
    const hrefRegex = /href=["'][^"']*\/shop\/([a-z0-9\-]+)[^"']*["']/gi;
    let match;
  
    while ((match = hrefRegex.exec(htmlString)) !== null) {
      const productId = match[1];
      if (products[productId]) {
        productIds.add(productId);
      }
    }
  
    return [...productIds];
  };

  // Helper function to create cart items from product IDs
  const createCartItems = (productIds) => {
    const cartItemsMap = {};
    
    productIds.forEach(productId => {
      if (products[productId]) {
        if (cartItemsMap[productId]) {
          // If product already exists, increment quantity
          cartItemsMap[productId].quantity += 1;
          cartItemsMap[productId].total_price = 
            cartItemsMap[productId].quantity * cartItemsMap[productId].price_per_unit;
        } else {
          // Add new product to cart
          cartItemsMap[productId] = { ...products[productId] };
        }
      }
    });
    
    return Object.values(cartItemsMap);
  };

  try {
    let userCartItems = {} ;
    for (const user of results) {
      try {
        // Fetch diet details from MongoDB
        let allProductIds = [];
        
        if (dietProductCache.has(user.diet_details_id)) {
          allProductIds = dietProductCache.get(user.diet_details_id); 
        }
        else {
          const dietDetail = await dietDetails.findById(user.diet_details_id).lean(); 
        
          if (!dietDetail) {
            console.log(`No diet details found for user ${user.user_id}`);
            continue;
          }
  
          // Extract all product IDs from all diet fields
          let extractedIds = [] ; 
          const dietFields = [
            'on_rising', 'breakfast', 'pre_breakfast', 'mid_morning',
            'pre_workout', 'during_workout', 'pre_lunch', 'lunch',
            'post_lunch', 'tea_eve', 'late_eve', 'pre_dinner',
            'post_dinner', 'bed_time'
          ];
  
          dietFields.forEach(field => {
            const productIds = extractProductIds(dietDetail[field]);
            console.log(field, productIds, 'ehllo')
            extractedIds.push(...productIds);
          });

          allProductIds = [...new Set(extractedIds)];
          dietProductCache.set(user.diet_details_id, allProductIds)
        } 

        // Create cart items
        const cartItems = allProductIds?.length>0 ? createCartItems(allProductIds): [];
        if (cartItems.length === 0) {
          console.log(`No products found in diet for user ${user.user_id}`);
          continue;
        }
        const cart_code =  Math.random().toString(36).substr(2, 8);
        const internal = {user_id:user.user_id, cart_items:cartItems, cart_code:`dd-${cart_code}`}
        await addOrUpdateCart(null,null,null,internal);
        userCartItems[user.user_id] = {cart_items:cartItems, cart_code: `dd-${cart_code}`} ;

      } catch (userError) {
        console.error(`Error processing user ${user.user_id}:`, userError);
        continue;
      }
    }

    return userCartItems; 

  } catch (error) {
    console.error("Error in createCartForDietSentClients:", error);
    throw error;
  }
};
