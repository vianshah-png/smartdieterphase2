import ejs from "ejs";
import md5 from "md5";
import moment from "moment";
import { isValidObjectId } from "mongoose";
import convertToWords from "number-to-words";
import path from "path";
import {
  deleteRecords,
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import { updateUserStatusAndLog } from "../../crons/cronFunctions.js";
import { fetchLocationData, safeJSONParse } from "../../helper/commonHelper.js";
import {drStoreWeighingScaleHamperItems, SMART_SCALE_PRICE_TO_BN, tables } from "../../helper/constant.js";
import dietDetails from "../../models/dietDetailsModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import axios from "axios";
import { insertOrderLog } from "../../helper/common.js";
import * as XLSX from "xlsx";
import { generalContentMap } from "../../crons/cronFunction2.js";
import { createShipyaariDraftOrder } from "../../services/shipyaariIntegration.js";
import { generateInvoicePDF, generateMasterOrderId, generateProductOrderId } from "../paymentControllers/productPaymentUtil/productPaymentUtil.js";
import { placeDrStoreOrder } from "../../services/drStoreIntegration.js";
import { generateFreeDrStoreConfirmationEmail } from "../../helper/emailAutochatTemplateHelpers/getProductOrderConfirmationEmail.js";

const addOrderController = async (req, res, next) => {
  try {
    const {
      user_id,
      phone_number,
      payment_currency,
      payment_mode,
      payment_mode_type,
      payment_mode_bank,
      order_discount_type,
      order_date_time,
      address,
      pincode,
      sale_by,
      order_type,
      mentor_assigned,
      items,
      country_id: inputCountryId,
      state_id: inputStateId,
      city_id: inputCityId,
      brand,
      is_hamper,
      pack_size,
    } = req.body;
    console.log(order_date_time, 50);
    let itemsArray;
    try {
      itemsArray = Array.isArray(items) ? items : JSON.parse(items);
    } catch (err) {
      return next(new ErrorHandler("Invalid items format", 400));
    }

    const total_mrp = itemsArray.reduce((total, i) => total + Number(i.mrp), 0);
    const total_discount = itemsArray.reduce(
      (total, i) => total + Number(i.discount_amount),
      0
    );
    const total_balance = itemsArray.reduce(
      (total, i) => total + Number(i.balance_amount),
      0
    );
    const total_paid_amount = itemsArray.reduce(
      (total, i) => total + Number(i.paid_amount),
      0
    );

    const accumulated_due_date = itemsArray.reduce(
      (finalDate, item) =>
        moment(finalDate).add(moment(item.due_date).diff(moment(finalDate))),
      moment(order_date_time)
    );
    const final_due_date = accumulated_due_date.format("YYYY-MM-DD HH:mm:ss");

    const country_id =
      inputCountryId || (await fetchLocationData("country_id", user_id));
    const state_id =
      inputStateId || (await fetchLocationData("state_id", user_id));
    const city_id =
      inputCityId || (await fetchLocationData("city_id", user_id));

    const OrderDetailscolumns = [];
    const OrderDetailsvalues = [];

    const addColumn = (column, value) => {
      if (value !== undefined) {
        OrderDetailscolumns.push(column);
        OrderDetailsvalues.push(value);
      }
    };

    addColumn("user_id", user_id);
    addColumn("phone_number", phone_number);
    addColumn("order_mrp", total_mrp);
    addColumn("order_discount", total_discount);
    addColumn("order_paid_amount", total_paid_amount);
    addColumn("order_balance_amount", total_balance);
    addColumn("discount_type", order_discount_type);
    addColumn("due_date", final_due_date);
    addColumn("payment_currency", payment_currency);
    addColumn("payment_mode", payment_mode || null);
    addColumn("payment_mode_type", payment_mode_type || 0);
    addColumn("payment_mode_bank", payment_mode_bank || 0);
    addColumn("order_date", order_date_time);
    addColumn("total_items", itemsArray.length);
    addColumn("order_status", "2");
    addColumn("order_address", address || null);
    addColumn("pincode", pincode);
    addColumn("sale_by", sale_by || mentor_assigned || null);
    addColumn("mentor_assigned", mentor_assigned || null);
    addColumn("country_id", country_id);
    addColumn("state_id", state_id || null);
    addColumn("city_id", city_id || null);
    addColumn("order_type", order_type); // keep as-is, don't default to null if this must be required
    if (!order_type)
      return next(new ErrorHandler("order_type is required", 400));

    console.log("OrderDetailscolumns", OrderDetailscolumns);
    console.log("OrderDetailsvalues", OrderDetailsvalues);
    const newOrderDetails = await insertRecord(
      `${tables.orderDetails}`,
      OrderDetailscolumns,
      OrderDetailsvalues
    );

    if (newOrderDetails.affectedRows === 0) {
      return next(new ErrorHandler("Failed to insert order details", 400));
    }

    const insertOrderLogResult = await insertOrderLog({
      user_id: user_id,
      order_id: newOrderDetails.insertId,
      amount: total_paid_amount,
      src: "Accounts Dashboard",
      payment_for: "Program Purchase",
    });
    console.log(insertOrderLogResult, 136);
    if (mentor_assigned) {
      const insertedResult = await insertRecord(
        tables.changeOfMentor,
        ["user_id", "old_mentor", "new_mentor"],
        [user_id, "0", mentor_assigned]
      );
      const updateResult = await updateRecord(
        tables.userDetails,
        { mentor_assigned: mentor_assigned },
        { user_id: user_id }
      );
    }

    await Promise.all(
      itemsArray.map((item, index) =>
        addSubOrderProgram({
          item,
          newOrderDetails,
          order_type,
          index,
          user_id,
          mentor_assigned,
        })
      )
    );

    if (is_hamper) {
  // Fetch common data for all hamper types
      const [originResult, registerResult, stateResult, cityResult] = await Promise.all([
        readRecord({
          table: tables.countries,
          selectFields: ["country_name"],
          conditions: [{ field: "country_id", operator: "=", value: country_id }],
        }),
        readRecord({
          table: tables.userDetails,
          selectFields: ["phone", "first_name", "active_order_id"],
          conditions: [{ field: "user_id", operator: "=", value: user_id }],
        }),
        readRecord({
          table: tables.states,
          selectFields: ["state_name"],
          conditions: [{ field: "state_id", operator: "=", value: state_id }],
        }),
        readRecord({
          table: tables.cities,
          selectFields: ["city_name"],
          conditions: [{ field: "city_id", operator: "=", value: city_id }],
        }),
      ]);

      const masterOrderId = await generateMasterOrderId('free');

      let productCode;
      let productName;

  if (brand === 'kb' || brand === 'kilobeaters') {
    productCode = "PROD_006";
    productName = "Sampler Pack"
  } else if (brand === 'doctorstore') {

    productCode = "PROD_011";
    productName = "BN BodyScan Smart Scale";
  }

  const productOrderId = await generateProductOrderId(brand, 'free');

  // Insert free order (common for both brands)
  const insertedFreeOrder = await insertRecord(
    tables.productOrders,
    [
    "user_id",
    "customer_name",
    "customer_phone",
    "master_order_id",
    "product_order_id",
    "product_id",
    "product_code",
    "product_name",
    "razorpay_payment_id",
    "quantity",
    "pack_size",
    "sub_order_id",
    "price_per_unit",
    "total_price",
    "payment_method",
    "order_total",
    "net_settled",
    "created_at",
    "updated_at",
    "sold_by",
    "customer_address",
    "customer_pincode",
    "customer_city",
    "customer_state",
    "customer_country",
    "payment_status",
    ...(brand === 'kilobeaters' ? ['hamper_type'] : []),  
    "price_per_unit_to_bn",
    "brand"
  ],
  [
    user_id,
    registerResult.results[0]?.first_name,
    registerResult.results[0]?.phone,
    masterOrderId,
    productOrderId,
    brand === 'kilobeaters' ? 'sampler-pack' : 'bn-bodyscan-smart-scale',
    productCode,
    productName,
    "free_" + Date.now(),
    1,
    brand === 'kilobeaters' ? pack_size : 'Single Unit',
    registerResult.results[0]?.active_order_id,
    0.0,
    0.0,
    "free",
    0.0,
    1,
    new Date(),
    new Date(),
    sale_by,
    address,
    pincode,
    cityResult.results[0]?.city_name,
    stateResult.results[0]?.state_name,
    originResult.results[0]?.country_name,
    "Success",
    ...(brand === 'kilobeaters' ? ['general'] : []),
    brand === 'kilobeaters' ? (pack_size === "Pack of 5" ? 270 : 192) : SMART_SCALE_PRICE_TO_BN,
    brand
  ]
  );

  console.log(
    "Free hamper order inserted:",
    insertedFreeOrder,
    "Brand:",
    brand
  );

  // Send notifications (common for both brands)
  try {
    const tasks = [];
    const { results: users } = await readRecord({
      selectFields: [
        "cd.email_id",
        "COALESCE(cd.first_name,cd.last_name) AS name",
        "cd.user_id",
        "cd.phone_number",
        "ad.email_id AS mentor_email",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });

    const user = users[0];
    const { mail_data, wati_template_data, notification_id } =
      generalContentMap["1_day_after"]({ user });

    if (mail_data && user.email_id) tasks.push(sendMailUtil(mail_data));
    
    if (wati_template_data && user.phone_number) {
      tasks.push(
        axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=+91${user.phone_number.replace(
            /\D/g,
            ""
          )}`,
          {
            template_name: wati_template_data.template_name,
            broadcast_name: wati_template_data.broadcast_name,
            parameters: wati_template_data.parameters,
          }
        )
      );
    }

    if (notification_id) {
      tasks.push(
        axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user_id],
            notification_id,
            sent_via: "cron",
          }
        )
      );
    }

    await Promise.all(tasks);
  } catch (error) {
    console.log("Error while sending notification:", error);
  }
}

    if(order_type=="New" || order_type=="OCR"){
    await sendIdAndPasswordNew(user_id);
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order added successfully",
      })
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addHamper = async (req, res, next) => {
  try {
    const { user_id, admin_id, pack_size, hamper_type } = req.body;
    const { results: userData } = await readRecord({
      selectFields: [
        "cd.user_id", 
        "COALESCE(c.country_name, ac.country_name) AS country_name",
        "COALESCE(s.state_name, ast.state_name) AS state_name",
        "COALESCE(ci.city_name, aci.city_name) AS city_name",
        "aspd.address",
        "cd.phone",
        "cd.first_name",
        "cd.active_order_id",
        `(SELECT pincode from ${tables.orderDetails} od WHERE od.user_id = cd.user_id ORDER BY od.created_at DESC LIMIT 1) AS pincode`,
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.phone_number",
        "cd.email_id",
        "ad.email_id AS mentor_email",
        "cd.mentor_assigned",
      ],
      table: `${tables.userDetails} cd`,
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.countries} c`,
          on: "cd.country_id = c.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} s`,
          on: "cd.state_id = s.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} ci`,
          on: "cd.city_id = ci.city_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: `cd.user_id = aspd.user_id AND aspd.updated_date = (SELECT MAX(updated_date) FROM ${tables.assessment_personal_details} WHERE user_id = cd.user_id) AND aspd.address != ''`,
        },
        {
          type: "LEFT",
          table: `${tables.countries} ac`,
          on: "aspd.country_of_residence = ac.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} ast`,
          on: "cd.state_id = ast.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} aci`,
          on: "cd.city_id = aci.city_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = cd.mentor_assigned",
        },
      ],
    });

    
    const productOrderId = await generateProductOrderId('kilobeaters', 'free');
    const masterOrderId = await generateMasterOrderId("free");

    const {
      country_name,
      state_name,
      city_name,
      address,
      phone,
      first_name,
      pincode,
      active_order_id,
      mentor_assigned,
    } = userData[0];
    const columns = [
      "user_id",
      "customer_name",
      "customer_phone",
      "master_order_id", 
      "product_order_id",
      "product_id",
      "product_code",
      "product_name",
      "razorpay_payment_id",
      "quantity",
      "pack_size",
      "sub_order_id",
      "price_per_unit",
      "total_price",
      "payment_method",
      "order_total",
      "net_settled",
      "created_at",
      "updated_at",
      "sold_by",
      "customer_address",
      "customer_pincode",
      "customer_city",
      "customer_state",
      "customer_country",
      "hamper_type",
      "payment_status",
      "price_per_unit_to_bn",
      "status",
      'brand'
    ];
    const values = [
      user_id,
      first_name,
      phone,
      masterOrderId, 
      productOrderId,
      "sampler-pack",
      "PROD_006",
      "Sampler Pack",
      "free_" + Date.now(),
      1,
      pack_size,
      active_order_id ? active_order_id : 0,
      0.0,
      0.0,
      "free",
      0.0,
      1,
      new Date(),
      new Date(),
      mentor_assigned ? mentor_assigned : 0,
      address,
      pincode ? pincode : 0,
      city_name,
      state_name,
      country_name,
      hamper_type ? hamper_type : "general",
      "Success",
      pack_size === "Pack of 5" ? 270 : 192,
      "Pending",
      'kilobeaters'
    ];
    if (admin_id) {
      columns.push("added_by");
      values.push(admin_id);
    }
    console.log(columns);
    console.log(values);
    // return;
    const insertResult = await insertRecord(
      tables.productOrders,
      columns,
      values
    );
    console.log(insertResult);
    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to insert hamper order", 500));
    }
    const user = userData[0];
    try {
      const tasks = [];
      const { mail_data, wati_template_data, notification_id } =
        generalContentMap["1_day_after"]({ user });
      if (mail_data && user.email_id) tasks.push(sendMailUtil(mail_data));
      if (wati_template_data && user.phone_number) {
        tasks.push(
          axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=+91${user.phone_number.replace(
              /\D/g,
              ""
            )}`,
            {
              template_name: wati_template_data.template_name,
              broadcast_name: wati_template_data.broadcast_name,
              parameters: wati_template_data.parameters,
            }
          )
        );
      }
      if (notification_id) {
        tasks.push(
          axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [user_id],
              notification_id,
              sent_via: "cron",
            }
          )
        );
      }
      await Promise.all(tasks);
    } catch (error) {
      console.log("Error in sending hamper notification:", error);
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order added successfully",
      })
    );
  } catch (error) {
    console.log("error in addHamper:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addFreeDrStoreOrder = async(req,res,next)=> {
  try {
    const { user_id, admin_id } = req.body;
    const { results: userData } = await readRecord({
      selectFields: [
        "cd.user_id",
        "COALESCE(c.country_name, ac.country_name) AS country_name",
        "COALESCE(s.state_name, ast.state_name) AS state_name",
        "COALESCE(ci.city_name, aci.city_name) AS city_name",
        "aspd.address",
        "cd.phone",
        "cd.first_name",
        "cd.active_order_id",
        `(SELECT pincode from ${tables.orderDetails} od WHERE od.user_id = cd.user_id ORDER BY od.created_at DESC LIMIT 1) AS pincode`,
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.phone_number",
        "cd.email_id",
        "ad.email_id AS mentor_email",
        "cd.mentor_assigned",
      ],
      table: `${tables.userDetails} cd`,
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.countries} c`,
          on: "cd.country_id = c.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} s`,
          on: "cd.state_id = s.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} ci`,
          on: "cd.city_id = ci.city_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: `cd.user_id = aspd.user_id AND aspd.updated_date = (SELECT MAX(updated_date) FROM ${tables.assessment_personal_details} WHERE user_id = cd.user_id) AND aspd.address != ''`,
        },
        {
          type: "LEFT",
          table: `${tables.countries} ac`,
          on: "aspd.country_of_residence = ac.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} ast`,
          on: "cd.state_id = ast.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} aci`,
          on: "cd.city_id = aci.city_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = cd.mentor_assigned",
        },
      ],
    });

    const productOrderId = await generateProductOrderId('doctorstore', 'free');
    const masterOrderId = await generateMasterOrderId("free");

    const {
      country_name,
      state_name,
      city_name,
      address,
      phone,
      first_name,
      pincode,
      active_order_id,
      mentor_assigned,
    } = userData[0];
    const columns = [
      "user_id",
      "customer_name",
      "customer_phone",
      "master_order_id", 
      "product_order_id",
      "product_id",
      "product_code",
      "product_name",
      "razorpay_payment_id",
      "quantity",
      "pack_size",
      "sub_order_id",
      "price_per_unit",
      "total_price",
      "payment_method",
      "order_total",
      "net_settled",
      "created_at",
      "updated_at",
      "sold_by",
      "customer_address",
      "customer_pincode",
      "customer_city",
      "customer_state",
      "customer_country",
      "payment_status",
      "price_per_unit_to_bn",
      "status",
      'brand'
    ];
    const values = [
      user_id,
      first_name,
      phone,
      masterOrderId, 
      productOrderId,
      "bn-bodyscan-smart-scale",
      "PROD_011",
      "BN BodyScan Smart Scale",
      "free_" + Date.now(),
      1,
      'Single Unit',
      active_order_id ? active_order_id : 0,
      0.0,
      0.0,
      "free",
      0.0,
      1,
      new Date(),
      new Date(),
      mentor_assigned ? mentor_assigned : 0,
      address,
      pincode ? pincode : 0,
      city_name,
      state_name,
      country_name,
      "Success",
      SMART_SCALE_PRICE_TO_BN, 
      "Pending",
      'doctorstore'
    ];
    if (admin_id) {
      columns.push("added_by");
      values.push(admin_id);
    }
    console.log(columns);
    console.log(values);
    // return;
    const insertResult = await insertRecord(
      tables.productOrders,
      columns,
      values
    );
    console.log(insertResult);
    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to insert hamper order", 500));
    }
    const user = userData[0];
    try {
      const tasks = [];
      const { mail_data, wati_template_data, notification_id } =
        generalContentMap["1_day_after"]({ user });
      if (mail_data && user.email_id) tasks.push(sendMailUtil(mail_data));
      if (wati_template_data && user.phone_number) {
        tasks.push(
          axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=+91${user.phone_number.replace(
              /\D/g,
              ""
            )}`,
            {
              template_name: wati_template_data.template_name,
              broadcast_name: wati_template_data.broadcast_name,
              parameters: wati_template_data.parameters,
            }
          )
        );
      }
      if (notification_id) {
        tasks.push(
          axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [user_id],
              notification_id,
              sent_via: "cron",
            }
          )
        );
      }
      await Promise.all(tasks);
    } catch (error) {
      console.log("Error in sending hamper notification:", error);
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order added successfully",
      })
    );
  } catch (error) {
    console.log("error in addHamper:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
}

const addShipyaariOrder = async (req, res, next) => {
  try {
    const { master_order_id } = req.query;

    if (!master_order_id) {
      return next(new ErrorHandler("master_order_id is required", 400));
    }

    const { results: productOrders } = await readRecord({
      selectFields: [
        "po.user_id",
        "po.customer_name",
        "po.customer_phone AS customer_phone_number",
        "po.product_order_id",
        "cd.email_id AS customer_email",
        "po.customer_address",
        "po.customer_pincode",
        "po.customer_city",
        "po.customer_state",
        "po.customer_landmark",
        "po.product_name",
        "po.product_code",
        "po.pack_size",
        "po.quantity",
        "po.total_price",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "po.master_order_id",
          operator: "=",
          value: master_order_id,
        },
        { field: "po.status", operator: "=", value: "Pending" },
        { field: "po.brand", operator: "=", value: "kilobeaters" },

      ],
    });

    if (productOrders.length === 0) {
      return next(new ErrorHandler("Product order not found", 404));
    }

    
    const items = productOrders.map((item)=>{
       return  {
        product_name: item.product_name,
        product_code: item.product_code,
        pack_size: item.pack_size,
        quantity: item.quantity,
        price_per_unit: item.total_price,
      }
    });

    const order =productOrders[0]; 
    const invoiceValue = items.reduce(
      (sum, item) => sum + Number(item.price_per_unit) * item.quantity,
      0
    );
    console.log(order.customer_phone_number.match(/\d+$/)?.[0] || "", 793);
    const shipyaariPayload = {
      orderId: order.product_order_id,
      pickupDetails: {
        fullAddress:
          "KILOBEATERS BESPOKE MEALS PRIVATE LIMITED, 30/8 SHREE RISHIKESH HEIGHTS, NARHE, Pune, Maharashtra, 411041",
        pincode: 411041,
        contact: {
          name: "kilobeaters bn",
          mobileNo: "9689479997",
        },
      },

      deliveryDetails: {
        fullAddress: order.customer_address,
        pincode: Number(order.customer_pincode.replaceAll(" ", "")),
        contact: {
          name: order.customer_name,
          mobileNo: order.customer_phone_number.match(/\d+$/)?.[0] || "",
        },
      },

      boxInfo: [
        {
          name: order.product_order_id,
          type: "parcel",
          weightUnit: "Kg",
          deadWeight: 0.5,
          length: 10,
          breadth: 10,
          height: 15,
          qty: 1,
          measureUnit: "cm",

          products: items.map((item) => ({
            name: `${item.product_name} (${item.pack_size})`,
            category: "Food",
            sku: item.product_code,
            hsnCode: "210690",
            qty: item.quantity,
            unitPrice: Number(item.price_per_unit),
            unitTax: 0,
            weightUnit: "Kg",
            deadWeight: 0.5 / items.length,
            length: 10,
            breadth: 10,
            height: 15,
            measureUnit: "cm",
          })),

          codInfo: {
            isCod: false,
            collectableAmount: 0,
            invoiceValue,
          },

          podInfo: {
            isPod: false,
          },

          insurance: false,
        },
      ],

      orderType: "B2C",
      transit: "FORWARD",
      servicePriority: "cheapest",
    };

    let awbNumber ; 
    const shipyaariResp = await createShipyaariDraftOrder(shipyaariPayload);
    awbNumber = shipyaariResp?.data?.[0]?.awbs?.[0]?.tracking?.awb || "";
    
    await updateRecord(
      tables.productOrders,
      {
        status: "Added in Shipyaari",
        ...(awbNumber ? { awb_number: awbNumber } : {}),
      },
      { master_order_id, brand: 'kilobeaters' }
    );

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order added in Shipyaari successfully",
      })
    );
  } catch (error) {
    console.error(
      "Error while adding order in Shipyaari:",
      error.response?.data || error
    );
    return next(new ErrorHandler( error?.message || "Internal Server Error", 500));
  }
}; 

const addToDoctorStoreManual = async (req, res, next) => {
  try {
    const { master_order_id } = req.query;

    if (!master_order_id) {
      return next(new ErrorHandler("master_order_id is required", 400));
    }

    const { results: productOrders } = await readRecord({
      selectFields: [
        "po.user_id",
        "po.customer_name",
        "po.customer_phone AS customer_phone",
        "po.product_order_id",
        "cd.email_id AS customer_email",
        "po.customer_address",
        "po.customer_pincode",
        "po.customer_city",
        'po.customer_country',
        "po.customer_state",
        "po.customer_landmark",
        "po.product_name",
        "po.product_code",
        "po.quantity",
        "po.total_price",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
      ],
      conditions: [
        {
          field: "po.master_order_id",
          operator: "=",
          value: master_order_id,
        },
        { field: "po.status", operator: "IN", value: "('Pending', 'Error Adding on DrStore')", raw:true },
      ],  
    });

    const productOrder = productOrders[0];
    const items = [{
      quantity: Number(productOrder?.quantity) || 1, 
      product_slug:  'bn-bodyscan-smart-scale',
      product_sku: 'BN-DR-1'
    }]

    console.log(productOrder, 'productOrder') ;

    if (productOrders.length === 0) {
      return next(new ErrorHandler("Product order not found", 404));
    }

    await placeDrStoreOrder(productOrder, items); 

    const order = productOrders[0];
    console.log(order, 778);
  
    
    await updateRecord(
      tables.productOrders,
      {
        status: "Added in DrStore",
      },
      { master_order_id, brand: 'doctorstore' }
    );

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order added in DrStore successfully",
      })
    );
  } catch (error) {
    console.error(
      "Error while adding order in DrStore:",
      error.response?.data || error
    );
    return next(new ErrorHandler( error?.message || "Internal Server Error", 500));
  }
}; 

const editProductOrderAddress = async (req, res, next) => {
  try {
    const {
      address,
      razorpay_payment_id,
      pincode,
      city_id,
      state_id,
      country_id,
    } = req.body;
    const { results: productOrders } = await readRecord({
      selectFields: ["user_id", "order_id"],
      table: `${tables.productOrders} po`,
      conditions: [
        {
          field: "po.razorpay_payment_id",
          operator: "=",
          value: razorpay_payment_id,
        },
      ],
    });
    if (productOrders.length === 0) {
      return next(new ErrorHandler("Product order not found", 404));
    }
    const { user_id, order_id: p_order_id } = productOrders[0];

    const [country, state, city] = await readRecordUnion([
      {
        selectField: ["country_name as name"],
        table: `${tables.countries} co`,
        condition: [
          { field: "co.country_id", operator: "=", value: country_id },
        ],
      },
      {
        selectField: ["state_name as name"],
        table: `${tables.states} st`,
        condition: [{ field: "st.state_id", operator: "=", value: state_id }],
      },
      {
        selectField: ["city_name as name"],
        table: `${tables.cities} ci`,
        condition: [{ field: "ci.city_id", operator: "=", value: city_id }],
      },
    ]);
    const updateProductOrderResult = await updateRecord(
      tables.productOrders,
            {
        ...(address && { customer_address: address }),
        ...(pincode && { customer_pincode: pincode.replaceAll(" ", "") }),
        ...(city?.name && { customer_city: city.name }),
        ...(state?.name && { customer_state: state.name }),
        ...(country?.name && { customer_country: country.name }),
      },
      {
        razorpay_payment_id,
      }
    );
    const { results: orderData } = await readRecord({
      selectFields: ["od.order_id"],
      table: `${tables.orderDetails} od`,
      conditions: [{ field: "od.user_id", operator: "=", value: user_id }],
      orderBy: ["od.created_at DESC"],
      pagination: {
        page: 1,
        limit: 1,
      },
    });
    if (orderData.length > 0) {
      const { order_id } = orderData[0];
      const updateOrderAddressResult = await updateRecord(
        tables.orderDetails,
        {
          order_address: address,
          country_id: country_id,
          state_id: state_id,
          city_id: city_id,
          pincode: pincode,
        },
        {
          order_id: order_id,
        }
      );
      console.log(updateOrderAddressResult);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Address updated successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("error in editOrderAddress:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function ackAddressReceivedNotification({ user }) {
  try {
    console.log(user, 1003);
    const tasks = [];
    if (user.user_status == "Active") {
      tasks.push(
        axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id: 906,
            sent_via: "",
          }
        )
      );
    } else if (user.user_status == "Completed") {
      tasks.push(
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: [user.user_id],
            notification_id: 986,
            sent_via: "",
          }
        )
      );
      const mailData = {
        from: "Support <support@balancenutrition.in>",
        to: user.customer_email,
        subject: "Address Received!",
        html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">

<p>Hi ${user.customer_name},</p>

<p>
Thank you for sharing your delivery address. Your hamper is now being prepared and will be dispatched soon.  
We'll keep you posted as it moves through dispatch and delivery.
</p>

<p>We can't wait to hear your feedback once it arrives!</p>

<p>
Get in touch with your Mentor, <strong>${user.mentor_name}</strong> and she will guide you on adding these products to your diet.
</p>

<p>
<strong>WhatsApp her:</strong><br>
<a href="https://wa.me/91${user.mentor_phone}" style="color: #1a73e8;">Click here to WhatsApp</a>
</p>

<p>
<strong>Talk to her:</strong><br>
<a href="tel:91${user.mentor_phone}" style="color: #1a73e8;">Call ${user.mentor_name}</a>
</p>

<p>
For real-time delivery updates, download the BN App here:<br>
<a href="https://www.balancenutrition.in/download-bn-app" style="color: #1a73e8;">BN App Download Link</a>
</p>

</body>
</html>`,
      };

      if (user.customer_email) {
        tasks.push(sendMailUtil(mailData));
      }
      if (user.customer_phone_number) {
        tasks.push(
          axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${user.customer_phone_number.replace(
              /\D/g,
              ""
            )}`,
            {
              template_name: "oc_address_received",
              broadcast_name: "oc_address_received",
              parameters: [
                { name: "name", value: user.customer_name },
                { name: "mentor_name", value: user.mentor_name },
                { name: "mentor_phone", value: user.mentor_phone },
                { name: "mentor_wa", value: user.mentor_wa },
              ],
            }
          )
        );
      }
    }
    await Promise.all(tasks);
  } catch (error) {
    console.log("Error in ackAddressReceivedNotification:", error);
  }
}

const addHamperProductToShip = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    const { address, pincode, city, state, country, landmark, phone_number } =
      req.body;

    if (!address || !city || !state || !country) {
      return res.status(400).json(
        new ApiResponse({
          statusCode: 400,
          message: "Missing required address fields",
        })
      );
    }

    // Order ID
    const { results: orderDetails } = await readRecord({
      selectFields: [
        "od.user_id",
        "od.order_id",
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) AS customer_name",
        "cd.phone AS customer_phone",
        "cd.email_id AS customer_email",
        "cd.active_order_id",
        "cd.phone_number AS customer_phone_number",
        "cd.mentor_assigned",
        "cd.user_status",
        "ad.email_id AS mentor_email",
        "ad.official_phone AS mentor_phone",
        "ad.crm_user AS mentor_name",
        "ad.official_phone AS mentor_wa",
      ],
      table: `${tables.orderDetails} od`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "cd.user_id = od.user_id",
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = cd.mentor_assigned",
        },
      ],
      conditions: [
        { field: "od.user_id", operator: "=", value: user_id },
        // { field: "cd.mentor_assigned", operator: "=", value: 196 },
      ],
      orderBy: ["od.created_at DESC"],
      pagination: { page: 1, limit: 1 },
    });

    if (orderDetails.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No order found for the given user ID",
        })
      );
    }

    const userOrder = orderDetails[0];

    // fetch general hamper without awb
    const { results: productOrders } = await readRecord({
      selectFields: [
        "po.user_id",
        "po.master_order_id", 
        "po.product_order_id",
        "po.product_name",
        "po.product_code",
        "po.quantity",
        "po.total_price",
        "po.pack_size",
        "po.order_id",
        "po.customer_phone",
        "po.brand"
      ],
      table: `${tables.productOrders} po`,
      conditions: [
        { field: "po.user_id", operator: "=", value: user_id },
        { field: "po.payment_method", operator: "=", value: "free" },
        { field: "po.status", operator: "=", value: "Pending" },
        {
          field:
            "(po.awb_number IS NULL OR po.awb_number = '' OR po.awb_number = '0')",
          operator: "",
          value: "",
          raw: true,
        },
      ],
      orderBy: ["po.created_at DESC LIMIT 1"],
    });

    console.log(productOrders[0], 'productOrders'); 

    const [countryData, stateData, cityData] = await readRecordUnion([
      {
        selectField: ["country_id AS name"],
        table: tables.countries,
        condition: [
          {
            field: "LCASE(country_name)",
            operator: "=",
            value: country.toLowerCase().trim(),
          },
        ],
      },
      {
        selectField: ["state_id AS name"],
        table: tables.states,
        condition: [
          {
            field: "LCASE(state_name)",
            operator: "=",
            value: state.toLowerCase().trim(),
          },
        ],
      },
      {
        selectField: ["city_id AS name"],
        table: tables.cities,
        condition: [
          {
            field: "LCASE(city_name)",
            operator: "=",
            value: city.toLowerCase().trim(),
          },
        ],
      },
    ]);
    const countryID = countryData?.name || null;
    const stateID = stateData?.name || null;
    const cityID = cityData?.name || null;

    await updateRecord(
      tables.orderDetails,
      {
        order_address: address,
        pincode,
        city_id: cityID,
        state_id: stateID,
        country_id: countryID,
        phone_number: phone_number,
      },
      { order_id: userOrder.order_id }
    );

    const createShipyaariOrder = async (items, productOrderId) => {
      try {
        const invoiceValue = items.reduce(
          (sum, item) => sum + Number(item.price) * Number(item.quantity),
          0
        );
        const phoneRaw =
          phone_number ||
          userOrder?.customer_phone_number?.trim() ||
          "8928001617";
        const phoneNumber =
          phoneRaw.length > 10 ? phoneRaw.slice(-10) : phoneRaw;
        const shipyaariPayload = {
          orderId: productOrderId,
          pickupDetails: {
            fullAddress:
              "KILOBEATERS BESPOKE MEALS PRIVATE LIMITED, 30/8 SHREE RISHIKESH HEIGHTS, NARHE, Pune, Maharashtra, 411041",
            pincode: 411041,
            contact: {
              name: "kilobeaters bn",
              mobileNo: "9689479997", // warehouse number
            },
          },

          deliveryDetails: {
            fullAddress: `${address} ${city ? city : ""} ${
              state ? state : ""
            } ${country ? country : ""}`,
            pincode: Number(pincode),
            contact: {
              name: userOrder?.customer_name,
              mobileNo: Number(phoneNumber),
            },
          },

          boxInfo: [
            {
              name: productOrderId,
              type: "parcel",
              weightUnit: "Kg",
              deadWeight: 0.5,
              length: 10,
              breadth: 10,
              height: 15,
              qty: 1,
              measureUnit: "cm",
              products: items.map((item) => ({
                name: item.name,
                category: "Food",
                sku: item.sku,
                hsnCode: "210690",
                qty: item.qty,
                unitPrice: Number(item.price),
                unitTax: 0,
                weightUnit: "Kg",
                deadWeight: 0.5 / items.length,
                length: 10,
                breadth: 10,
                height: 15,
                measureUnit: "cm",
              })),

              codInfo: {
                isCod: false,
                collectableAmount: 0,
                invoiceValue,
              },

              podInfo: {
                isPod: false,
              },

              insurance: false,
            },
          ],

          orderType: "B2C",
          transit: "FORWARD",
          servicePriority: "cheapest",
        };

        const response = await createShipyaariDraftOrder(shipyaariPayload);
        console.log(response?.data[0]?.awbs[0]?.tracking?.awb, "awb");

        return {
          success: true,
          awb_number: response?.data[0]?.awbs[0]?.tracking?.awb,
        };
      } catch (err) {
        console.log("Shipyaari Error:", err?.response?.data || err.message);
        return { success: false, awb_number: "" };
      }
    };

    let awbNumber = "";
    let shippedGeneralHamper = false;
    let drstore_invoice = null; 
    const p = productOrders[0];
    
    if (productOrders.length > 0) {
      try {
        if (p.brand === "doctorstore") {

          const orderMeta = {
            customer_name: userOrder?.customer_name, 
            customer_email: userOrder?.customer_email, 
            customer_phone: userOrder?.customer_phone_number,
            customer_address: address, 
            customer_city: city,
            customer_state: state,
            customer_landmark: landmark || "",
            customer_country: country,
            customer_pincode: pincode,
            master_order_id: p?.master_order_id, 
            product_order_id: p?.product_order_id,
          }

          const { awb_number } = await placeDrStoreOrder(orderMeta, drStoreWeighingScaleHamperItems);
          awbNumber = awb_number;
          shippedGeneralHamper = true;

          // generate invoice for free doctor store order ;
          const { invoiceLink, pdfBuffer } = await generateInvoicePDF(orderMeta,[p],p.master_order_id, 'doctorstore');
          drstore_invoice = invoiceLink ; 
          const mailData = {
            from: "Support <support@balancenutrition.in>",
            to: orderMeta.customer_email,
            cc: ["khyati.rupani@balancenutrition.in" ],
            bcc:[ "accounts@balancenutrition.in", "kushal.agrawal@balancenutrition.in", userOrder.mentor_email || "clientservices@balancenutrition.in"],
            subject: `Free Order Confirmation - ${p.product_order_id}`,
            html: generateFreeDrStoreConfirmationEmail(orderMeta).html,
            attachments: [{ filename: `Invoice_${p.product_order_id}.pdf`, content: pdfBuffer, contentType: "application/pdf"}]
          }
          await sendMailUtil(mailData);


        } else if (p.brand === "kilobeaters") {

          const generalHamper = [
            {
              hsnCode: "210690",
              name: `${p.product_name} (${p.pack_size})`,
              qty: p.quantity,
              sku: p.product_code,
              category: "Food",
              price: Number(p.total_price),
            },
          ];

          const { awb_number, success } = await createShipyaariOrder(
            generalHamper,
            p?.product_order_id
          );
          awbNumber = awb_number;
          shippedGeneralHamper = success;
        } else {
          console.log(`Unknown brand: ${p.brand}, skipping shipping`);
          shippedGeneralHamper = false;
        }
      } catch (error) {
        console.log(error, "ERROR IN creating shipping order");
        shippedGeneralHamper = false;
      }
    }
    
    // 9. Update General Hamper if Shipped
    if (productOrders.length > 0 && shippedGeneralHamper) {
      console.log(p.brand)
      const updateObj = {
        awb_number: awbNumber,
        status: awbNumber ?  "Added in shipyaari" : p.brand==='doctorstore' ? 'Added in DrStore' : 'Pending',
        customer_address: address,
        customer_pincode: pincode,
        customer_city: city,
        customer_state: state,
        customer_country: country,
        overall_invoice: drstore_invoice, 
      };
      if (awbNumber && awbNumber.length>0) {
        updateObj.awb_number = awbNumber;
      }
      await updateRecord(tables.productOrders, updateObj, {
        order_id: productOrders[0].order_id,
      });
    }

    try {
      if (p.brand==='kilobeaters') {
        await ackAddressReceivedNotification({ user: userOrder });
      }
    } catch (error) {
      console.log("Error sending notification:", error);
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Address updated successfully",
      })
    );
  } catch (error) {
    console.log("error in editOrderAddressByUserId:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editOrderController = async (req, res, next) => {
  try {
    const {
      order_id,
      order_date,
      email_id,
      name,
      address,
      country_id,
      state_id,
      city_id,
      pincode,
      phone_number,
      payment_currency,
      order_type,
      payment_mode,
      mentor_assigned,
      converted_by,
    } = req.body;
    console.log(order_date, 1227);
    const items = safeJSONParse(req.body.items, []);
    // Validate order_id
    if (!order_id) {
      return next(new ErrorHandler("Order ID not provided", 400));
    }

    // Fetch order to validate existence and get user_id and order_type
    const { results: orderDetails } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: ["user_id", "order_type", "order_date"],
      conditions: [
        {
          field: "od.order_id",
          operator: "=",
          value: order_id,
        },
      ],
    });

    if (!orderDetails.length) {
      return next(new ErrorHandler("Order not found", 404));
    }

    const user_id = orderDetails[0].user_id;
    const current_order_type = order_type || orderDetails[0].order_type;

    // Fetch current user status
    const { results: userDetails } = await readRecord({
      table: tables.userDetails,
      selectFields: ["user_status"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    const prior_user_status = userDetails.length
      ? userDetails[0].user_status
      : null;

    // Update user details (name, email)
    if (name || email_id) {
      const updateData = {
        ...(email_id && { email_id }),
        ...(name && {
          first_name: name.split(" ")[0] || "",
          last_name: name.split(" ").slice(1).join(" ") || "",
        }),
      };
      if (Object.keys(updateData).length > 0) {
        const updatedResult = await updateRecord(
          tables.userDetails,
          updateData,
          { user_id }
        );
        if (updatedResult.affectedRows === 0) {
          return next(new ErrorHandler("Failed to update name or email", 400));
        }
      }
    }

    // Update order details (order_date, phone_number)
    const existingOrderDate = moment(orderDetails[0].order_date).format(
      "YYYY-MM-DD"
    );
    const newOrderDate = moment(order_date).format("YYYY-MM-DD");

    // Extract time from the first date (just time, no date)
    const timeOfExistingOrder = moment(orderDetails[0].order_date).format(
      "HH:mm:ss"
    );

    if (order_date || phone_number) {
      const updateData = {
        ...(newOrderDate && {
          order_date:
            existingOrderDate !== newOrderDate
              ? order_date
              : orderDetails[0].order_date,
        }),
        ...(phone_number && { phone_number }),
      };
      if (Object.keys(updateData).length > 0) {
        const updatedResult = await updateRecord(
          tables.orderDetails,
          updateData,
          { order_id }
        );
        const updateSubOrderCreatedAt = await updateRecord(
          tables.subOrderPrograms,
          {
            created_at: updateData.order_date,
          },
          {
            order_id,
          }
        );
        if (updatedResult.affectedRows === 0) {
          return next(
            new ErrorHandler("Failed to update order date or phone", 400)
          );
        }
      }
    }

    // Update address details
    if (address || country_id || state_id || city_id || pincode) {
      const updateData = {
        ...(address && { order_address: address }),
        ...(country_id && { country_id }),
        ...(state_id && { state_id }),
        ...(city_id && { city_id }),
        ...(pincode && { pincode }),
      };
      if (Object.keys(updateData).length > 0) {
        const updatedResult = await updateRecord(
          tables.orderDetails,
          updateData,
          { order_id }
        );
        if (updatedResult.affectedRows === 0) {
          return next(
            new ErrorHandler("Failed to update address details", 400)
          );
        }
      }
    }

    // Update payment currency
    if (payment_currency) {
      const updatedResult = await updateRecord(
        tables.orderDetails,
        { payment_currency },
        { order_id }
      );
      if (updatedResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update payment currency", 400));
      }
    }

    // Update order type
    if (order_type) {
      const validOrderTypes = ["New", "Renewal", "Upgrade", "Free", "OCR"];
      if (!validOrderTypes.includes(order_type)) {
        return next(new ErrorHandler("Invalid order type", 400));
      }
      await Promise.all([
        updateRecord(tables.subOrderPrograms, { order_type }, { order_id }),
        updateRecord(tables.orderDetails, { order_type }, { order_id }),
      ]);
    }

    // Update payment mode
    if (payment_mode !== null && payment_mode !== undefined) {
      const updatedResult = await updateRecord(
        tables.orderDetails,
        { payment_mode },
        { order_id }
      );
      if (updatedResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update payment mode", 400));
      }
    }

    // Update mentor assignment
    if (mentor_assigned) {
      const { results: comDetails } = await readRecord({
        table: tables.changeOfMentor,
        selectFields: ["old_mentor"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
        pagination: { limit: 1 },
        orderBy: ["added_date DESC"],
      });

      await Promise.all([
        updateRecord(tables.orderDetails, { mentor_assigned }, { order_id }),
        updateRecord(tables.userDetails, { mentor_assigned }, { user_id }),
        insertRecord(
          tables.changeOfMentor,
          ["user_id", "old_mentor", "new_mentor"],
          [
            user_id,
            comDetails.length ? comDetails[0].old_mentor : "0",
            mentor_assigned,
          ]
        ),
      ]);
    }

    // Update converted_by (sale_by)
    if (converted_by) {
      const updatedResult = await updateRecord(
        tables.orderDetails,
        { sale_by: converted_by },
        { order_id }
      );
      if (updatedResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update sale_by", 400));
      }
    }

    // Process sub-order details
    let userDetailsUpdate = {};
    let activeSubOrderUpdated = false;

    if (items && Array.isArray(items)) {
      // Fetch existing sub-orders
      const { results: existingSubOrders } = await readRecord({
        table: tables.subOrderPrograms,
        selectFields: ["sub_order_id", "program_id", "program_status"],
        conditions: [{ field: "order_id", operator: "=", value: order_id }],
      });

      const providedSubOrderIds = items
        .filter((so) => so.sub_order_id)
        .map((so) => so.sub_order_id);

      // Check for deletion of active sub-orders with assessments
      const subOrdersToDelete = existingSubOrders
        .filter((so) => !providedSubOrderIds.includes(so.sub_order_id))
        .map((so) => ({
          sub_order_id: so.sub_order_id,
          program_id: so.program_id,
          program_status: so.program_status,
        }));

      for (const subOrder of subOrdersToDelete) {
        if (subOrder.program_id && subOrder.program_status === 1) {
          // Check for assessment entry
          const { results: assessment } = await readRecord({
            table: tables.assessment_personal_details,
            selectFields: ["id"],
            conditions: [{ field: "user_id", operator: "=", value: user_id }],
          });

          if (assessment.length > 0) {
            return next(
              new ErrorHandler(
                `Cannot delete active sub-order ${subOrder.sub_order_id} with assessment`,
                400
              )
            );
          }
        }

        // Delete non-active or non-assessment sub-orders
        const deleteResult = await deleteRecords(
          tables.subOrderPrograms,
          null,
          {
            sub_order_id: subOrder.sub_order_id,
          }
        );
        if (!deleteResult.success) {
          return next(
            new ErrorHandler(
              `Failed to delete sub-order ${subOrder.sub_order_id}`,
              400
            )
          );
        }
      }

      // Process provided sub-orders
      await Promise.all(
        items.map(async (subOrder, index) => {
          const {
            sub_order_id,
            program_id,
            program_session_id,
            guide_id,
            mrp,
            discount,
            paid_amount,
            balance_amount,
            due_date,
            program_status,
            start_date,
            expiry_date,
          } = subOrder;
          let isNewSubOrder = !sub_order_id;
          console.log(subOrder, 448);
          if (sub_order_id) {
            // Update existing sub-order
            const updateData = {
              ...(program_id && { program_id }),
              ...(program_session_id && { program_session_id }),
              ...(guide_id && { guide_id }),
              ...(mrp !== undefined && { mrp }),
              ...(discount !== undefined && { discount }),
              ...(paid_amount !== undefined && { paid_amount }),
              ...(balance_amount !== undefined && { balance_amount }),
              ...(due_date &&
                moment(due_date).isValid() && {
                  due_date: moment(due_date).format("YYYY-MM-DD"),
                }),
              ...(program_status !== undefined && { program_status }),
              ...(start_date &&
                moment(start_date).isValid() && {
                  start_date: moment(start_date).format("YYYY-MM-DD"),
                }),
              ...(expiry_date &&
                moment(expiry_date).isValid() && {
                  expiry_date: moment(expiry_date).format("YYYY-MM-DD"),
                }),
            };

            if (Object.keys(updateData).length > 0) {
              const updatedResult = await updateRecord(
                tables.subOrderPrograms,
                updateData,
                { sub_order_id }
              );
              if (updatedResult.affectedRows === 0) {
                throw new Error(`Failed to update sub-order ${sub_order_id}`);
              }
              if (program_status === 1) {
                activeSubOrderUpdated = true;
              } else if (program_status === 3) {
                activeSubOrderUpdated = false;
              }
            }
          } else {
            // Insert new sub-order
            await addSubOrderProgram({
              item: {
                program_id,
                program_session_id,
                guide_id,
                mrp,
                discount_amount: discount,
                paid_amount: current_order_type === "Free" ? 0 : paid_amount,
                balance_amount,
                due_date,
                order_date_time: order_date || orderDetails[0].order_date,
              },
              newOrderDetails: { insertId: order_id },
              order_type: current_order_type,
              index,
              user_id,
              mentor_assigned,
            });
            if (
              index === 0 &&
              ["New", "OCR", "Free"].includes(current_order_type)
            ) {
              activeSubOrderUpdated = true;
            } else if (current_order_type === "Upgrade" && index === 0) {
              // Check prior sub-orders for Upgrade
              const { results: priorSubOrders } = await readRecord({
                table: tables.subOrderPrograms,
                selectFields: ["program_status"],
                conditions: [
                  { field: "user_id", operator: "=", value: user_id },
                  { field: "order_id", operator: "!=", value: order_id },
                ],
              });
              const hasActivePrior = priorSubOrders.some(
                (so) => so.program_status === 1
              );
              if (!hasActivePrior) {
                activeSubOrderUpdated = true;
              }
            }
          }

          // Update userDetails for programs becoming active or completed
          if (
            program_id &&
            (isNewSubOrder || program_status === 1 || program_status === 3)
          ) {
            const { results: programDetails } = await readRecord({
              table: `${tables.programsMaster} pm`,
              selectFields: ["program_category"],
              conditions: [
                {
                  field: "pm.program_id",
                  operator: "=",
                  value: program_id,
                },
              ],
            });

            const { results: programSession } = await readRecord({
              table: `${tables.programSession} ps`,
              selectFields: ["validity"],
              conditions: [
                {
                  field: "ps.program_session_id",
                  operator: "=",
                  value: program_session_id,
                },
              ],
            });

            const program_duration =
              programSession.length > 0
                ? parseInt(programSession[0].validity)
                : 0;
            const isBasicStack = [1, 3, 10].includes(program_duration);

            // Update userDetails only for active programs
            if (
              (isNewSubOrder &&
                index === 0 &&
                ["New", "OCR", "Free"].includes(current_order_type)) ||
              (sub_order_id && program_status === 1) ||
              (current_order_type === "Upgrade" &&
                isNewSubOrder &&
                index === 0 &&
                !priorSubOrders?.some((so) => so.program_status === 1))
            ) {
              userDetailsUpdate = {
                user_status: "Active",
                sub_user_status: isBasicStack ? "Cleanse active" : "Active",
                user_type: "1",
                ...(current_order_type === "New" || current_order_type === "OCR"
                  ? { active_order_id: sub_order_id || order_id }
                  : {}),
                ...(current_order_type === "New" && {
                  last_screen_visited: "program_details_info",
                }),
                ...(mentor_assigned && { mentor_assigned }),
                enc_password: md5("123456"),
                plain_password: "123456",
              };
              activeSubOrderUpdated = true;
            }
          }
        })
      );

      // Recalculate order totals
      const { results: subOrders } = await readRecord({
        table: tables.subOrderPrograms,
        selectFields: ["mrp", "discount", "paid_amount", "balance_amount"],
        conditions: [{ field: "order_id", operator: "=", value: order_id }],
      });

      const total_mrp = subOrders.reduce((sum, so) => sum + Number(so.mrp), 0);
      const total_discount = subOrders.reduce(
        (sum, so) => sum + Number(so.discount),
        0
      );
      const total_paid_amount = subOrders.reduce(
        (sum, so) => sum + Number(so.paid_amount),
        0
      );
      const total_balance = subOrders.reduce(
        (sum, so) => sum + Number(so.balance_amount),
        0
      );

      const updatedResult = await updateRecord(
        tables.orderDetails,
        {
          order_mrp: total_mrp,
          order_discount: total_discount,
          order_paid_amount: total_paid_amount,
          order_balance_amount: total_balance,
          total_items: subOrders.length,
        },
        { order_id }
      );

      if (updatedResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update order totals", 400));
      }
    }

    // Update userDetails based on sub-order status
    const { results: allSubOrders } = await readRecord({
      table: tables.subOrderPrograms,
      selectFields: [
        "sub_order_id",
        "program_status",
        "created_at as added_date",
      ],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    const hasActiveSubOrders = allSubOrders.some(
      (so) => so.program_status === 1
    );

    if (Object.keys(userDetailsUpdate).length > 0) {
      // Apply updates for active programs
      const updatedResult = await updateRecord(
        tables.userDetails,
        userDetailsUpdate,
        { user_id }
      );
      if (updatedResult.affectedRows === 0) {
        return next(new ErrorHandler("Failed to update user details", 400));
      }
    } else if (items && items.length === 0) {
      // Check if any sub-orders remain for this order
      const { results: remainingSubOrders } = await readRecord({
        table: tables.subOrderPrograms,
        selectFields: ["sub_order_id"],
        conditions: [{ field: "order_id", operator: "=", value: order_id }],
      });

      if (remainingSubOrders.length === 0) {
        // No sub-orders for this order, check user-wide status
        if (current_order_type === "OCR" && prior_user_status === "Completed") {
          // Find the most recent completed sub-order
          const completedSubOrders = allSubOrders
            .filter((so) => so.program_status === 3)
            .sort((a, b) => new Date(b.added_date) - new Date(a.added_date));

          const latestCompletedSubOrderId = completedSubOrders.length
            ? completedSubOrders[0].sub_order_id
            : null;

          const updatedResult = await updateRecord(
            tables.userDetails,
            {
              user_status: "Completed",
              sub_user_status: null,
              active_order_id: latestCompletedSubOrderId,
            },
            { user_id }
          );
          if (updatedResult.affectedRows === 0) {
            return next(new ErrorHandler("Failed to update user details", 400));
          }
        } else if (!hasActiveSubOrders) {
          // Default to Completed if no active sub-orders
          const completedSubOrders = allSubOrders
            .filter((so) => so.program_status === 3)
            .sort((a, b) => new Date(b.added_date) - new Date(a.added_date));

          const latestCompletedSubOrderId = completedSubOrders.length
            ? completedSubOrders[0].sub_order_id
            : null;

          const updatedResult = await updateRecord(
            tables.userDetails,
            {
              user_status: "Completed",
              sub_user_status: null,
              active_order_id: latestCompletedSubOrderId,
            },
            { user_id }
          );
          if (updatedResult.affectedRows === 0) {
            return next(new ErrorHandler("Failed to update user details", 400));
          }
        }
      }
    } else if (!activeSubOrderUpdated) {
      // No active sub-orders updated in this request, check user-wide status
      if (current_order_type === "OCR" && prior_user_status === "Completed") {
        // Find the most recent completed sub-order
        const completedSubOrders = allSubOrders
          .filter((so) => so.program_status === 3)
          .sort((a, b) => new Date(b.added_date) - new Date(a.added_date));

        const latestCompletedSubOrderId = completedSubOrders.length
          ? completedSubOrders[0].sub_order_id
          : null;

        const updatedResult = await updateRecord(
          tables.userDetails,
          {
            user_status: "Completed",
            sub_user_status: "Completed",
            active_order_id: latestCompletedSubOrderId,
          },
          { user_id }
        );
        if (updatedResult.affectedRows === 0) {
          return next(new ErrorHandler("Failed to update user details", 400));
        }
      } else if (!hasActiveSubOrders) {
        // const completedSubOrders = allSubOrders
        //   .filter((so) => so.program_status === 3)
        //   .sort((a, b) => new Date(b.added_date) - new Date(a.added_date));
        // const latestCompletedSubOrderId = completedSubOrders.length
        //   ? completedSubOrders[0].sub_order_id
        //   : null;
        // const updatedResult = await updateRecord(
        //   tables.userDetails,
        //   {
        //     user_status: "Lead",
        //     sub_user_status: "Inactive",
        //     active_order_id: null,
        //   },
        //   { user_id }
        // );
        // if (updatedResult.affectedRows === 0) {
        //   return next(new ErrorHandler("Failed to update user details", 400));
        // }
      }
    }

    // Return success response
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order updated successfully",
      })
    );
  } catch (error) {
    console.error(error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500)
    );
  }
};

const getfilterss = (sourceKey, date) => {
  const filters = [];
  const today = moment().format("YYYY-MM-DD");
  const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
  const startOfYear = moment().startOf("year").format("YYYY-MM-DD");

  if (!sourceKey) return filters;

  if (sourceKey === "pg") {
    if (date === "today") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "IN",
          value: [6, 7],
        }
      );
    } else if (date === "this_month") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "IN",
          value: [6, 7],
        }
      );
    } else if (date === "this_year") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "IN",
          value: [6, 7],
        }
      );
    }
  } else if (sourceKey === "cps") {
    if (date === "today") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "=",
          value: 1,
        }
      );
    } else if (date === "this_month") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "=",
          value: 1,
        }
      );
    } else if (date === "this_year") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "=",
          value: 1,
        }
      );
    }
  } else if (sourceKey === "bank/cheque") {
    if (date === "today") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "=",
          value: 3,
        }
      );
    } else if (date === "this_month") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "=",
          value: 3,
        }
      );
    } else if (date === "this_year") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.payment_mode",
          operator: "=",
          value: 3,
        }
      );
    }
  } else if (sourceKey === "other") {
    if (date === "today") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field:
            "(od.payment_mode NOT IN (1, 3, 6, 7) OR od.payment_mode IS NULL OR od.payment_mode = '')",
          operator: "=",
          value: true,
          raw: true,
        }
      );
    } else if (date === "this_month") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field:
            "(od.payment_mode NOT IN (1, 3, 6, 7) OR od.payment_mode IS NULL OR od.payment_mode = '')",
          operator: "=",
          value: true,
          raw: true,
        }
      );
    } else if (date === "this_year") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field:
            "(od.payment_mode NOT IN (1, 3, 6, 7) OR od.payment_mode IS NULL OR od.payment_mode = '')",
          operator: "=",
          value: true,
          raw: true,
        }
      );
    }
  } else if (sourceKey === "total") {
    if (date === "today") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "ud.user_id",
          operator: "<>",
          value: 0,
        }
      );
    } else if (date === "this_month") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "ud.user_id",
          operator: "<>",
          value: 0,
        }
      );
    } else if (date === "this_year") {
      filters.push(
        {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "ud.user_id",
          operator: "<>",
          value: 0,
        }
      );
    }
  }

  return filters;
};

const getAllOrdersController = async (req, res, next) => {
  try {
    const {
      order_type,
      search,
      page = 1,
      limit = 10,
      date,
      sale_by,
      is_balance,
      start_date,
      end_date,
      source,
      balance_filter,
    } = req.body;

    const formatDate = (dateObj) => moment(dateObj).format("YYYY-MM-DD");
    const addMinutes = (date, minutes) =>
      new Date(date.getTime() + minutes * 60000);
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const startOfYear = moment()
      .month(3)
      .date(1)
      .year(moment().year())
      .format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const formatDateToYMDHMS = (date) => {
      const pad = (n) => (n < 10 ? "0" + n : n);
      return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        " " +
        pad(date.getHours()) +
        ":" +
        pad(date.getMinutes()) +
        ":" +
        pad(date.getSeconds())
      );
    };

    // Handle date range
    const filterDateCondition = (() => {
      if (start_date && end_date) {
        return {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        };
      }
      if (["cs", "ps", "bc", "nd", "od"].includes(balance_filter)) return null;
      switch (date) {
        case "today":
          return {
            field: "DATE(od.order_date)",
            operator: "=",
            value: formatDate(new Date()),
          };
        case "yesterday":
          return {
            field: "DATE(od.order_date)",
            operator: "=",
            value: formatDate(new Date(Date.now() - 864e5)),
          };
        case "last_month":
          const now = new Date();
          const lastMonthStart = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
          );
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [formatDate(lastMonthStart), formatDate(lastMonthEnd)],
          };
        case "this_month":
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment().startOf("month").format("YYYY-MM-DD")}`,
              `${moment().endOf("month").format("YYYY-MM-DD")}`,
            ],
          };
        case "this_year":
          return {
            field: "DATE(od.order_date)",
            operator: ">=",
            value: startOfYear,
          };
        case "last_year_today":
          const todayLastYear = new Date();
          todayLastYear.setFullYear(todayLastYear.getFullYear() - 1);
          return {
            field: "DATE(od.order_date)",
            operator: "=",
            value: formatDate(todayLastYear),
          };
        case "last_year_this_month":
          const lastYear = new Date().getFullYear() - 1;
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment()
                .year(lastYear)
                .month(moment().month())
                .startOf("month")
                .format("YYYY-MM-DD")}`,
              `${moment()
                .year(lastYear)
                .month(moment().month())
                .endOf("month")
                .format("YYYY-MM-DD")}`,
            ],
          };
        case "last_year_previous_month":
          const prevMonth = moment().subtract(1, "month");
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${moment()
                .year(new Date().getFullYear() - 1)
                .month(prevMonth.month())
                .startOf("month")
                .format("YYYY-MM-DD")}`,
              `${moment()
                .year(new Date().getFullYear() - 1)
                .month(prevMonth.month())
                .endOf("month")
                .format("YYYY-MM-DD")}`,
            ],
          };
        case "last_year_total":
          const lastYearStart = moment().subtract(1, "year").startOf("year");
          const lastYearEnd = moment().subtract(1, "year").endOf("year");
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              `${lastYearStart.format("YYYY-MM-DD")}`,
              `${lastYearEnd.format("YYYY-MM-DD")}`,
            ],
          };
        default:
          return null;
      }
    })();

    // Unified payment mode filtering
    const sourceKey = source?.toLowerCase();
    let filters = [];

    console.log("startOfMonth", startOfMonth);
    console.log("startOfYear", startOfYear);
    console.log("today", today);
    if (sourceKey === "pg") {
      if (date === "today") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "IN",
            value: [6, 7],
          }
        );
      } else if (date === "this_month") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "IN",
            value: [6, 7],
          }
        );
      } else if (date === "this_year") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "IN",
            value: [6, 7],
          }
        );
      }
    } else if (sourceKey === "cps") {
      if (date === "today") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "=",
            value: 1,
          }
        );
      } else if (date === "this_month") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "=",
            value: 1,
          }
        );
      } else if (date === "this_year") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "=",
            value: 1,
          }
        );
      }
    } else if (sourceKey === "bank/cheque") {
      if (date === "today") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "=",
            value: 3,
          }
        );
      } else if (date === "this_month") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "=",
            value: 3,
          }
        );
      } else if (date === "this_year") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.payment_mode",
            operator: "=",
            value: 3,
          }
        );
      }
    } else if (sourceKey === "other") {
      if (date === "today") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field:
              "(od.payment_mode NOT IN (1, 3, 6, 7) OR od.payment_mode IS NULL OR od.payment_mode = '')",
            operator: "=",
            value: true,
            raw: true,
          }
        );
      } else if (date === "this_month") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field:
              "(od.payment_mode NOT IN (1, 3, 6, 7) OR od.payment_mode IS NULL OR od.payment_mode = '')",
            operator: "=",
            value: true,
            raw: true,
          }
        );
      } else if (date === "this_year") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field:
              "(od.payment_mode NOT IN (1, 3, 6, 7) OR od.payment_mode IS NULL OR od.payment_mode = '')",
            operator: "=",
            value: true,
            raw: true,
          }
        );
      }
    } else if (sourceKey === "total") {
      if (date === "today") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "ud.user_id",
            operator: "<>",
            value: 0,
          }
        );
      } else if (date === "this_month") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "ud.user_id",
            operator: "<>",
            value: 0,
          }
        );
      } else if (date === "this_year") {
        filters.push(
          {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "ud.user_id",
            operator: "<>",
            value: 0,
          }
        );
      }
    }
    const balanceConditions = [];
    if (balance_filter === "cs") {
      if (date === "today") {
        balanceConditions.push(
          {
            field: "DATE(od.order_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "this_month") {
        balanceConditions.push(
          {
            field: `DATE(od.order_date)`,
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "this_year") {
        balanceConditions.push(
          {
            field: `DATE(od.order_date)`,
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          }
        );
      }
    } else if (balance_filter === "bc") {
      if (date === "today") {
        balanceConditions.push({
          field: "DATE(bl.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        });
      } else if (date === "this_month") {
        balanceConditions.push({
          field: "DATE(bl.added_date)",
          operator: "BETWEEN",
          value: [`${startOfMonth}`, `${today}`],
        });
      } else if (date === "this_year") {
        balanceConditions.push({
          field: "DATE(bl.added_date)",
          operator: "BETWEEN",
          value: [`${startOfYear}`, `${today}`],
        });
      }
    } else if (balance_filter === "ps") {
      if (date === "today") {
        balanceConditions.push(
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field:
              "DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) = CURDATE()",
            operator: "",
            value: "",
            raw: true,
          }
        );
      } else if (date === "this_month") {
        balanceConditions.push(
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) BETWEEN ${startOfMonth} AND ${today}`,
            operator: "",
            value: "",
            raw: true,
          }
        );
      } else if (date === "this_year") {
        balanceConditions.push(
          {
            field: "ud.sub_user_status",
            operator: "=",
            value: "Fs",
          },
          {
            field:
              "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
            operator: "",
            value: "",
            raw: true,
          },
          {
            field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) BETWEEN '${startOfYear}' AND '${today}'`,
            operator: "",
            value: "",
            raw: true,
          }
        );
      }
    } else if (balance_filter === "nd") {
      balanceConditions.push(
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Completed", "Active"],
        },
        {
          field: "ud.sub_user_status",
          operator: "NOT IN",
          value: ["Fs", "Dropout"],
        },
        {
          field: "sop.program_status",
          operator: "IN",
          value: [1, 2, 4],
        }
      );
      if (date === "today") {
        balanceConditions.push(
          {
            field: "od.due_date",
            operator: "=",
            value: "CURRENT_DATE()",
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "this_month") {
        balanceConditions.push(
          {
            field: `od.due_date `,
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "this_year") {
        balanceConditions.push(
          {
            field: `od.due_date `,
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "(od.order_balance_amount)",
            operator: ">",
            value: 0,
          }
        );
      }
    } else if (balance_filter === "od") {
      balanceConditions.push(
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Completed", "Active"],
        },
        {
          field: "ud.sub_user_status",
          operator: "NOT IN",
          value: ["Fs", "Dropout"],
        },
        {
          field: "sop.program_status",
          operator: "IN",
          value: [1, 2, 4],
        }
      );

      if (date === "today") {
        balanceConditions.push(
          {
            field: "od.due_date",
            operator: "=",
            value: "CURRENT_DATE() - INTERVAL 1 DAY",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
            raw: true,
          }
        );
      } else if (date === "this_month") {
        balanceConditions.push(
          {
            field: `MONTH(od.due_date)`,
            operator: "=",
            value: "MONTH(CURDATE())",
            raw: true,
          },
          {
            field: `YEAR(od.due_date)`,
            operator: "=",
            value: "YEAR(CURDATE())",
            raw: true,
          },
          {
            field: "od.due_date",
            operator: "<=",
            value: "CURRENT_DATE() - INTERVAL 1 DAY",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
            raw: true,
          }
        );
      } else if (date === "this_year") {
        balanceConditions.push(
          {
            field: `od.due_date`,
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "od.due_date",
            operator: "<=",
            value: "CURRENT_DATE() - INTERVAL 1 DAY",
            raw: true,
          },
          {
            field: "od.order_balance_amount",
            operator: ">",
            value: 0,
            raw: true,
          }
        );
      }
    }

    // Additional balance collection filter if is_balance is true
    if (is_balance) {
      if (date === "this_month") {
        balanceConditions.push(
          {
            field: "DATE(bl.added_date)",
            operator: "BETWEEN",
            value: [`"${startOfMonth}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "bl.paid_amount",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "last_month") {
        const lastMonthStart = moment()
          .subtract(1, "month")
          .startOf("month")
          .format("YYYY-MM-DD");
        const lastMonthEnd = moment()
          .subtract(1, "month")
          .endOf("month")
          .format("YYYY-MM-DD");

        balanceConditions.push(
          {
            field: "DATE(bl.added_date)",
            operator: "BETWEEN",
            value: [`"${lastMonthStart}"`, `"${lastMonthEnd}"`],
            raw: true,
          },
          {
            field: "bl.paid_amount",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "this_year") {
        balanceConditions.push(
          {
            field: "DATE(bl.added_date)",
            operator: "BETWEEN",
            value: [`"${startOfYear}"`, `"${today}"`],
            raw: true,
          },
          {
            field: "bl.paid_amount",
            operator: ">",
            value: 0,
          }
        );
      } else if (date === "today") {
        balanceConditions.push(
          {
            field: "DATE(bl.added_date)",
            operator: "=",
            value: "CURDATE()",
            raw: true,
          },
          {
            field: "bl.paid_amount",
            operator: ">",
            value: 0,
          }
        );
      }
    }

    const { results, totalCount } = await readRecord({
      countTotal: true,
      table: `${tables.orderDetails} od`,
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "CONCAT(ud.phone_code, ' ', ud.phone_number) as client_phone",
        "ud.email_id",
        "ud.user_status",
        "od.order_id",
        "sop.order_type",
        "od.order_mrp",
        "od.order_paid_amount",
        "od.order_balance_amount",
        "COALESCE(od.order_discount, 0) as order_discount",
        // Fetch raw order_date (no conversion)
        // "od.order_date",
        "sop.created_at as order_date",
        "sop.due_date",
        "od.mentor_assigned as mentor_assigned_id",
        "od.sale_by",
        "od.discount_type",
        "od.pincode",
        "od.city_id",
        "od.state_id",
        "od.country_id",
        "od.order_address",
        "ud.my_wallet",
        "sop.sub_order_id",
        "COUNT(sop.sub_order_id) as sub_order_count",
        "sad.crm_user as saled_by",
        "ad.crm_user as mentor_assigned",
        `CONCAT(
          COALESCE(apm.name, ''), 
          ' ',
          CASE 
            WHEN COALESCE(aba.account_holder, '') <> '' 
              OR COALESCE(aba.bank_name, '') <> '' 
              OR COALESCE(aba.account_type, '') <> '' 
            THEN CONCAT(
              '(', 
                TRIM(CONCAT_WS(' ', 
                  COALESCE(aba.account_holder, ''), 
                  COALESCE(aba.bank_name, ''), 
                  CASE 
                    WHEN COALESCE(aba.account_type, '') <> '' THEN 
                      CONCAT('(', aba.account_type, ')') 
                    ELSE '' 
                  END
                )),
              ')'
            )
            ELSE ''
          END
        ) AS payment_mode_details`,
        "od.payment_mode",
        "apm.name as payment_mode_name",
        "CONCAT('Balance/',od.user_id,'/',od.order_id,'/',sop.sub_order_id) as invoice_number",
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} ud`,
          on: "od.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} sad`,
          on: "od.sale_by = sad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "od.mentor_assigned = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.order_id = od.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.accountPaymentModes} apm`,
          on: "apm.id = od.payment_mode",
        },
        {
          type: "LEFT",
          table: `${tables.accountsBankAccounts} aba`,
          on: "od.payment_mode_bank = aba.id",
        },
        ...(balance_filter === "bc" || is_balance
          ? [
              {
                type: "INNER",
                table: `${tables.balanceLogs} bl`,
                on: "sop.sub_order_id = bl.sub_order_id",
              },
            ]
          : []),
        ...(balance_filter === "ps"
          ? [
              {
                type: "LEFT",
                table: `${tables.leadStatusLog} lsl`,
                on: "ud.user_id = lsl.user_id",
              },
            ]
          : []),
      ],
      conditions: [
        { field: "ud.user_id", operator: "<>", value: "0" },
        order_type && {
          field: "sop.order_type",
          operator: "=",
          value: order_type,
        },
        sale_by && { field: "od.sale_by", operator: "=", value: sale_by },
        !is_balance && filterDateCondition,
        ...(!is_balance ? filters : []),
        ...balanceConditions,
      ].filter(Boolean),
      groupBy: ["od.order_id"],
      search: {
        searchQuery: search,
        searchFields: [
          "CONCAT(ud.first_name,' ',ud.last_name)",
          "ud.phone_number",
          "ud.email_id",
        ],
      },
      pagination: { limit, page },
      orderBy: ["sop.created_at DESC"],
    });
    console.log(results, 1904);
    // results.forEach((order) => {
    //   if (
    //     order.order_date &&
    //     order?.payment_mode_name?.toLowerCase() != "razorpay"
    //   ) {
    //     const istDate = addMinutes(new Date(order.order_date), 330);
    //     order.order_date = formatDateToYMDHMS(istDate);
    //   } else if (
    //     order.order_date &&
    //     order?.payment_mode_name?.toLowerCase() == "razorpay"
    //   ) {
    //     const istDate = moment(order.order_date).format(
    //       "YYYY-MM-DD hh:mm:ss A"
    //     );
    //     order.order_date = istDate;
    //   }
    // });
    for (let i = 0; i < results.length; i++) {
      const order = results[i];
      if (order.sub_order_count <= 1) {
        const { results: subOrders } = await readRecord({
          table: `${tables.subOrderPrograms} sop`,
          selectFields: [
            "pm.program_name",
            "ps.program_duration",
            "ps.program_session_id",
            "pm.program_id",
            "sop.program_status",
            "sop.program_combo",
            "sop.program_type",
          ],
          conditions: [
            { field: "sop.order_id", operator: "=", value: order.order_id },
          ],
          joins: [
            {
              type: "LEFT",
              table: `${tables.programsMaster} pm`,
              on: "sop.program_id = pm.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.programSession} ps`,
              on: "ps.program_session_id = sop.program_session_id",
            },
          ],
          orderBy: ["sop.created_at DESC"],
        });

        if (subOrders.length > 0) {
          const program = subOrders[0];

          // Normalize program_type and status
          const programType =
            program.program_type === 0
              ? "Special Stack"
              : program.program_type === 1
              ? "Basic Stack"
              : null;

          const programStatus =
            program.program_status === "1"
              ? "Active"
              : program.program_status === "2"
              ? "Paused"
              : program.program_status === "3"
              ? "Completed"
              : program.program_status === "4"
              ? "Advance Purchase"
              : null;

          results[i].program_info = {
            program_name: program.program_name,
            program_duration: program.program_duration,
            program_type: programType,
            program_status: programStatus,
            program_id: program.program_id,
            program_session_id: program.program_session_id,
            program_combo: program.program_combo,
          };
        }
      }
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Orders fetched successfully",
      data: results,
      totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Failed to fetch orders", 500));
  }
};

export const getAllProductOrdersController = async (req, res, next) => {
  try {
    const {
      payment_method,
      start_date,
      end_date,
      date,
      search,
      deliveryStatus, 
      admin_id,
      type,
      user_status,
      page = 1,
      limit = 10,
      brand
    } = req.body;

    const formatDate = (dateObj) => moment(dateObj).format("YYYY-MM-DD");

    // 📅 Date filter logic
    const filterDateCondition = (() => {
      if (start_date && end_date) {
        return {
          field: "DATE(po.created_at)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        };
      }
      switch (date) {
        case "today":
          return {
            field: "DATE(po.created_at)",
            operator: "=",
            value: formatDate(new Date()),
          };
        case "this_month":
          return {
            field: "DATE(po.created_at)",
            operator: "BETWEEN",
            value: [
              moment().startOf("month").format("YYYY-MM-DD"),
              moment().endOf("month").format("YYYY-MM-DD"),
            ],
          };
        case "this_year":
          return {
            field: "DATE(po.created_at)",
            operator: ">=",
            value: moment().startOf("year").format("YYYY-MM-DD"),
          };
        default:
          return null;
      }
    })();


    console.log(filterDateCondition); 

    // 💳 Payment method filter
    const paymentFilter = payment_method
      ? { field: "po.payment_method", operator: "=", value: payment_method }
      : null;
    //not null product_order_id
    const notNullProductOrderId = {
      field: "po.razorpay_payment_id",
      operator: "IS NOT",
      value: null,
      raw: true,
    };

    const adminFilter = admin_id
      ? {
          field: "po.sold_by",
          operator: "=",
          value: admin_id,
        }
      : null;

    const statusFilter = user_status
      ? {
          field: "ud.user_status",
          operator: "=",
          value: user_status,
        }
      : null;

    const typeFilter = type
      ? {
          field: "po.payment_method",
          operator: "=",
          value: type,
        }
      : null;

    const deliveryStatusFilter = deliveryStatus ?  {
       field: "po.status", 
       operator: "=", 
       value: deliveryStatus
    } : null;

    const brandFilter = brand!='all' ? {
      field: "po.brand", 
      operator: '=', 
      value: brand
    } : null;

    // 🔍 Searchable fields
    const searchFields = [
      "po.customer_name",
      "po.customer_phone",
      "po.product_name",
      "po.product_code",
      "po.customer_city",
      "po.customer_state",
      "po.customer_country",
      "po.customer_pincode",
      "po.awb_number",
      "po.status",
      "ud.email_id",
      "po.payment_method",
      "po.status",
      "ud.first_name",
      `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned)`,
      `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned)`,
    ];

    // 📦 Main query
    const { results, totalCount } = await readRecord({
      countTotal: true,
      table: `${tables.productOrders} po`,
      selectFields: [
        "po.master_order_id", 
        "po.product_order_id",
        "po.user_id",
        "po.order_id",
        "po.customer_name",
        "po.customer_phone",
        "po.customer_address",
        "po.customer_city",
        "po.customer_state",
        "po.customer_country",
        "po.customer_pincode",
        "po.awb_number",
        "po.status",
        "po.product_name",
        "po.pack_size",
        "po.product_code",
        "po.hamper_type",
        "po.quantity",
        "po.price_per_unit",
        "po.total_price",
        "po.order_total",
        "po.payment_method",
        "po.razorpay_payment_id",
        "po.created_at",
        "ud.user_status",
        "ud.sub_user_status",
        "ud.email_id",
        "ud.my_wallet",
        "ud.first_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as counsellor_name`,
        'po.brand'
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "po.user_id = ud.user_id",
        },
      ],
      conditions: [
        filterDateCondition,
        paymentFilter,
        notNullProductOrderId,
        brandFilter,
        adminFilter,
        typeFilter,
        deliveryStatusFilter,  
        statusFilter,
        {
          field: "po.payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ].filter(Boolean),
      search: { searchQuery: search, searchFields },
      pagination: { limit, page },
      orderBy: ["po.created_at DESC"],
    });

    // 🧩 Group by product_order_id
    const groupedOrders = results.reduce((acc, row) => {
      const id = row.razorpay_payment_id;
      if (!acc[id]) {
        acc[id] = {
          master_order_id: row.master_order_id,
          product_order_id: row.product_order_id,
          user_id: row.user_id,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          address: row.customer_address,
          city: row.customer_city,
          state: row.customer_state,
          country: row.customer_country,
          pincode: row.customer_pincode,
          user_status: row.user_status,
          sub_user_status: row.sub_user_status,
          email_id: row.email_id,
          my_wallet: row.my_wallet,
          first_name: row.first_name,
          payment_method: row.payment_method,
          hamper_type:
            (row.hamper_type && row.hamper_type.toUpperCase() + " HAMPER") ||
            "ONLINE PAYMENT",
          razorpay_payment_id: row.razorpay_payment_id,
          awb_number: row.awb_number,
          status: row.status,
          order_total: row.order_total,
          mentor_name: row.mentor_name,
          counsellor_name: row.counsellor_name,
          order_date: moment(row.created_at).format("YYYY-MM-DD HH:mm:ss"),
          products: [],
        };
      }

      acc[id].products.push({
        order_id: row.order_id,
        product_name: row.product_name,
        product_code: row.product_code,
        pack_size: row.pack_size,
        quantity: row.quantity,
        price_per_unit: row.price_per_unit,
        brand: row.brand,
        total_price: row.total_price,
        status: row.status
      });

      return acc;
    }, {});

    const groupedArray = Object.values(groupedOrders);

    // ✅ Response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message:
        "Product orders grouped by product_order_id fetched successfully",
      data: groupedArray,
      totalCount: totalCount,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Failed to fetch product orders", 500));
  }
};

const getOrderHistoryByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return next(new ErrorHandler("Missing user_id", 400));
    }

    const commonSelectFields = [
      "sop.total_sessions",
      "sop.sent_sessions as completed_sessions",
      "sop.pending_session",
      "sop.mrp",
      "sop.paid_amount as paid_amount",
      "sop.balance_amount as balance",
      "sop.created_at as purchase_date",
      "sop.start_date as program_start_date",
      "sop.expiry_date as program_expiry_date",
      "sop.sub_order_id as order_id",
      "dsl.diet_details_id",
      "pm.program_name",
      "ps.program_duration",
      "sop.program_id",
      "ps.program_session_id",
      "sop.program_status",
      "sop.sub_order_id",
      "sop.order_id",
      "sop.start_date_added_by",
      `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = (SELECT sale_by FROM order_details WHERE order_id = sop.order_id )) as Sales_Person_Name`,
      `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = (SELECT mentor_assigned FROM order_details WHERE order_id = sop.order_id )) as Mentor_Assigned`,
    ];

    const currentProgramsJoins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "ud.user_id = sop.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
      },
    ];

    const currentProgramsConditions = [
      {
        field: "ud.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "sop.program_status",
        operator: "IN",
        value: ["2", "1"], // pause and active program status
      },
    ];

    const { results: currentPrograms } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: commonSelectFields,
      joins: currentProgramsJoins,
      groupBy: ["sop.sub_order_id"],
      conditions: currentProgramsConditions,
      orderBy: ["sop.sub_order_id DESC"],
    });
    console.log(currentPrograms, 564);
    const currentDiet = await Promise.all(
      currentPrograms.map(async (program) => {
        if (
          !program.diet_details_id ||
          !isValidObjectId(program.diet_details_id)
        ) {
          return null;
        }
        const diet = await dietDetails
          .findById(program.diet_details_id)
          .select("diet_name");
        return diet ? diet.diet_name : null;
      })
    );

    const advancePurchasesJoins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "od.order_id = sop.order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
      },
    ];

    const advancePurchasesConditions = [
      {
        field: "od.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "sop.program_status",
        operator: "=",
        value: 4, // Advance purchases status
      },
    ];

    const { results: advancePurchases } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: commonSelectFields,
      joins: advancePurchasesJoins,
      groupBy: ["sop.sub_order_id"],
      conditions: advancePurchasesConditions,
      orderBy: ["sop.sub_order_id DESC"],
    });

    const advanceDiet = await Promise.all(
      advancePurchases.map(async (program) => {
        if (
          !program.diet_details_id ||
          !isValidObjectId(program.diet_details_id)
        ) {
          return null;
        }
        const diet = await dietDetails
          .findById(program.diet_details_id)
          .select("diet_name");
        return diet ? diet.diet_name : null;
      })
    );

    // Older Programs
    const olderProgramsJoins = [
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "od.order_id = sop.order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.dietSessionLog} dsl`,
        on: "sop.sub_order_id = dsl.sub_order_id AND dsl.session = sop.sent_sessions",
      },
    ];

    const olderProgramsConditions = [
      {
        field: "od.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "sop.program_status",
        operator: "=",
        value: 3, // Completed status
      },
    ];

    const { results: olderPrograms } = await readRecord({
      table: `${tables.orderDetails} od`,
      selectFields: commonSelectFields,
      joins: olderProgramsJoins,
      groupBy: ["sop.sub_order_id"],
      conditions: olderProgramsConditions,
      orderBy: ["sop.sub_order_id DESC"],
    });

    const olderDiet = await Promise.all(
      olderPrograms.map(async (program) => {
        if (
          !program.diet_details_id ||
          !isValidObjectId(program.diet_details_id)
        ) {
          return null;
        }
        const diet = await dietDetails
          .findById(program.diet_details_id)
          .select("diet_name");
        return diet ? diet.diet_name : null;
      })
    );

    const formatDate = (date) =>
      date ? moment(date).format("Do MMM YYYY") : null;

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Orders History Fetched Successfully",
      data: {
        currentPrograms: currentPrograms.map((program, index) => {
          const { diet_details_id, ...rest } = program;
          return {
            ...rest,
            diet_name: currentDiet[index],
            purchase_date: formatDate(program.purchase_date),
            program_start_date: formatDate(program.program_start_date),
            program_expiry_date: formatDate(program.program_expiry_date),
          };
        }),
        advancePurchases: advancePurchases.map((program, index) => {
          const { diet_details_id, start_date_added_by, ...rest } = program;
          return {
            ...rest,
            diet_name: advanceDiet[index],
            purchase_date: formatDate(program.purchase_date),
            program_start_date: formatDate(program.program_start_date),
            program_expiry_date: formatDate(program.program_expiry_date),
            show_program_start_date_btn: program.start_date_added_by == 0,
          };
        }),
        olderPrograms: olderPrograms.map((program, index) => {
          const { diet_details_id, ...rest } = program;
          return {
            ...rest,
            diet_name: olderDiet[index],
            purchase_date: formatDate(program.purchase_date),
            program_start_date: formatDate(program.program_start_date),
            program_expiry_date: formatDate(program.program_expiry_date),
          };
        }),
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in getOrderHistoryByUserId:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getProductOrderHistoryByUserId = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return next(new ErrorHandler("Missing user_id", 400));
    }

    // Common fields from product_orders table
    const selectFields = [
      "order_id",
      "product_order_id",
      "user_id",
      "customer_name",
      "customer_phone",
      "customer_address",
      "customer_city",
      "customer_state",
      "customer_country",
      "customer_pincode",
      "customer_landmark",
      "payment_method",
      "order_total",
      "razorpay_payment_id",
      "product_id",
      "product_code",
      "product_name",
      "quantity",
      "pack_size",
      "price_per_unit",
      "total_price",
      "created_at",
      "updated_at",
      "status",
    ];

    // ✅ Query to get all product orders for the user
    const { results } = await readRecord({
      table: "product_orders",
      selectFields,
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        {
          field: "payment_status",
          operator: "NOT IN",
          value: "('Failed', 'Pending')",
          raw: true,
        },
      ],
      orderBy: ["order_id DESC"],
    });

    // ✅ Format dates for readability
    const formatDate = (date) =>
      date ? moment(date).format("Do MMM YYYY, h:mm A") : null;

    // ✅ Group orders (if same order_id has multiple products)
    const groupedOrders = {};
    results.forEach((order) => {
      if (!groupedOrders[order.order_id]) {
        groupedOrders[order.order_id] = {
          order_id: order.order_id,
          product_order_id: order.product_order_id,
          user_id: order.user_id,
          customer_details: {
            name: order.customer_name,
            phone: order.customer_phone,
            address: order.customer_address,
            city: order.customer_city,
            state: order.customer_state,
            country: order.customer_country,
            pincode: order.customer_pincode,
            landmark: order.customer_landmark,
          },
          payment_details: {
            method: order.payment_method,
            total: Number(order.order_total || 0),
            razorpay_payment_id: order.razorpay_payment_id,
            status: order.status,
          },
          products: [],
          created_at: formatDate(order.created_at),
          updated_at: formatDate(order.updated_at),
        };
      }

      groupedOrders[order.order_id].products.push({
        product_id: order.product_id,
        product_code: order.product_code,
        product_name: order.product_name,
        quantity: order.quantity,
        pack_size: order.pack_size,
        price_per_unit: Number(order.price_per_unit || 0),
        total_price: Number(order.total_price || 0),
      });
    });

    // ✅ Convert to array
    const formattedOrders = Object.values(groupedOrders);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Product order history fetched successfully",
      totalCount: formattedOrders.length,
      data: formattedOrders,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getProductOrderHistoryByUserId:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOrderDetailsById = async (req, res, next) => {
  try {
    const { user_id, order_id } = req.query;
    if (!user_id) {
      return next(new ErrorHandler("Missing user_id", 400));
    }
    if (!order_id) {
      return next(new ErrorHandler("Missing order_id", 400));
    }

    const commonSelectFields = [
      "sop.mrp",
      "sop.paid_amount as paid_amount",
      "sop.balance_amount as balance",
      "sop.created_at as purchase_date",
      "sop.start_date as program_start_date",
      "sop.expiry_date as program_expiry_date",
      "sop.order_id as order_id",
      "pm.program_name",
      "ps.program_duration",
      "sop.program_id",
      "ps.program_session_id",
    ];

    const programsJoins = [
      {
        type: "LEFT",
        table: `${tables.orderDetails} od`,
        on: "od.user_id = ud.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "od.order_id = sop.order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "sop.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_id = ps.program_session_id",
      },
    ];

    const programsConditions = [
      {
        field: "ud.user_id",
        operator: "=",
        value: user_id,
      },
      {
        field: "od.order_id",
        operator: "=",
        value: order_id,
      },
    ];

    const { results: programDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: commonSelectFields,
      joins: programsJoins,
      conditions: programsConditions,
    });

    const programD = programDetails[0];

    const formatDate = (date) =>
      date ? moment(date).format("Do MMM YYYY") : null;

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Orders Details Fetched Successfully",
      data: {
        mrp: programD.mrp,
        paid_amount: programD.paid_amount,
        balance: programD.balance || 0,
        order_id: programD.order_id,
        program_id: programD.program_id,
        program_session_id: programD.program_session_id,
        program_name: programD.program_name,
        program_duration: programD.program_duration,
        purchase_date: formatDate(programD.purchase_date),
        program_start_date: formatDate(programD.program_start_date),
        program_expiry_date: formatDate(programD.program_expiry_date),
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error in getOrderHistoryByUserId:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getBalanceFilterConditions = (balance_filter, date) => {
  const balanceConditions = [];
  const today = moment().format("YYYY-MM-DD");
  const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
  const startOfYear = moment().startOf("year").format("YYYY-MM-DD");

  if (balance_filter === "cs") {
    if (date === "today") {
      balanceConditions.push(
        {
          field: "DATE(od.order_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        {
          field: "od.order_balance_amount",
          operator: ">",
          value: 0,
        }
      );
    } else if (date === "this_month") {
      balanceConditions.push(
        {
          field: `DATE(od.order_date)`,
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "(od.order_balance_amount)",
          operator: ">",
          value: 0,
        }
      );
    } else if (date === "this_year") {
      balanceConditions.push(
        {
          field: `DATE(od.order_date)`,
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "(od.order_balance_amount)",
          operator: ">",
          value: 0,
        }
      );
    }
  } else if (balance_filter === "bc") {
    if (date === "today") {
      balanceConditions.push({
        field: "DATE(bl.added_date)",
        operator: "=",
        value: "CURDATE()",
        raw: true,
      });
    } else if (date === "this_month") {
      balanceConditions.push({
        field: "DATE(bl.added_date)",
        operator: "BETWEEN",
        value: [`${startOfMonth}`, `${today}`],
      });
    } else if (date === "this_year") {
      balanceConditions.push({
        field: "DATE(bl.added_date)",
        operator: "BETWEEN",
        value: [`${startOfYear}`, `${today}`],
      });
    }
  } else if (balance_filter === "ps") {
    if (date === "today") {
      balanceConditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Fs",
        },
        {
          field:
            "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field:
            "DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) = CURDATE()",
          operator: "",
          value: "",
          raw: true,
        }
      );
    } else if (date === "this_month") {
      balanceConditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Fs",
        },
        {
          field:
            "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) BETWEEN ${startOfMonth} AND ${today}`,
          operator: "",
          value: "",
          raw: true,
        }
      );
    } else if (date === "this_year") {
      balanceConditions.push(
        {
          field: "ud.sub_user_status",
          operator: "=",
          value: "Fs",
        },
        {
          field:
            "JSON_EXTRACT(lsl.status_log, CONCAT('$[', JSON_LENGTH(lsl.status_log) - 1, '].sub_status')) = 'Fs'",
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: `DATE(JSON_UNQUOTE(JSON_EXTRACT(status_log, CONCAT('$[', JSON_LENGTH(status_log) - 1, '].timestamp')))) BETWEEN '${startOfYear}' AND '${today}'`,
          operator: "",
          value: "",
          raw: true,
        }
      );
    }
  } else if (balance_filter === "nd") {
    balanceConditions.push(
      {
        field: "ud.user_status",
        operator: "IN",
        value: ["Completed", "Active"],
      },
      {
        field: "ud.sub_user_status",
        operator: "NOT IN",
        value: ["Fs", "Dropout"],
      },
      {
        field: "sop.program_status",
        operator: "IN",
        value: [1, 2, 4],
      }
    );
    if (date === "today") {
      balanceConditions.push(
        {
          field: "od.due_date",
          operator: "=",
          value: "CURRENT_DATE()",
          raw: true,
        },
        {
          field: "(od.order_balance_amount)",
          operator: ">",
          value: 0,
        }
      );
    } else if (date === "this_month") {
      balanceConditions.push(
        {
          field: `od.due_date `,
          operator: "BETWEEN",
          value: [`"${startOfMonth}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "(od.order_balance_amount)",
          operator: ">",
          value: 0,
        }
      );
    } else if (date === "this_year") {
      balanceConditions.push(
        {
          field: `od.due_date `,
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "(od.order_balance_amount)",
          operator: ">",
          value: 0,
        }
      );
    }
  } else if (balance_filter === "od") {
    balanceConditions.push(
      {
        field: "ud.user_status",
        operator: "IN",
        value: ["Completed", "Active"],
      },
      {
        field: "ud.sub_user_status",
        operator: "NOT IN",
        value: ["Fs", "Dropout"],
      },
      {
        field: "sop.program_status",
        operator: "IN",
        value: [1, 2, 4],
      }
    );
    if (date === "today") {
      balanceConditions.push(
        {
          field: "od.due_date",
          operator: "=",
          value: "CURRENT_DATE() - INTERVAL 1 DAY",
          raw: true,
        },
        {
          field: "od.order_balance_amount",
          operator: ">",
          value: 0,
          raw: true,
        }
      );
    } else if (date === "this_month") {
      balanceConditions.push(
        {
          field: `MONTH(od.due_date)`,
          operator: "=",
          value: "MONTH(CURDATE())",
          raw: true,
        },
        {
          field: `YEAR(od.due_date)`,
          operator: "=",
          value: "YEAR(CURDATE())",
          raw: true,
        },
        {
          field: "od.due_date",
          operator: "<=",
          value: "CURRENT_DATE() - INTERVAL 1 DAY",
          raw: true,
        },
        {
          field: "od.order_balance_amount",
          operator: ">",
          value: 0,
          raw: true,
        }
      );
    } else if (date === "this_year") {
      balanceConditions.push(
        {
          field: `od.due_date`,
          operator: "BETWEEN",
          value: [`"${startOfYear}"`, `"${today}"`],
          raw: true,
        },
        {
          field: "od.due_date",
          operator: "<=",
          value: "CURRENT_DATE() - INTERVAL 1 DAY",
          raw: true,
        },
        {
          field: "od.order_balance_amount",
          operator: ">",
          value: 0,
          raw: true,
        }
      );
    }
  }
  return balanceConditions;
};

const exportAllOrdersController = async (req, res) => {
  try {
    const {
      order_type,
      date,
      start_date,
      end_date,
      source,
      balance_filter,
      is_balance,
    } = req.query;

    const formatDate = (date) => moment(date).format("YYYY-MM-DD");
    const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
    const startOfYear = moment()
      .month(3)
      .date(1)
      .year(moment().year())
      .format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");

    const buildDateCondition = () => {
      if (start_date && end_date) {
        return {
          field: "DATE(od.order_date)",
          operator: "BETWEEN",
          value: [start_date, end_date],
        };
      }

      if (["cs", "ps", "bc", "nd", "od"].includes(balance_filter)) return null;

      switch (date) {
        case "today":
          return {
            field: "DATE(od.order_date)",
            operator: "=",
            value: formatDate(new Date()),
          };
        case "yesterday":
          return {
            field: "DATE(od.order_date)",
            operator: "=",
            value: formatDate(moment().subtract(1, "day")),
          };
        case "last_month":
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [
              formatDate(moment().subtract(1, "month").startOf("month")),
              formatDate(moment().subtract(1, "month").endOf("month")),
            ],
          };
        case "this_month":
          return {
            field: "DATE(od.order_date)",
            operator: "BETWEEN",
            value: [startOfMonth, today],
          };
        case "this_year":
          return {
            field: "DATE(od.order_date)",
            operator: ">=",
            value: startOfYear,
          };
        default:
          return null;
      }
    };

    const dateCondition = buildDateCondition();

    const condition = [{ field: "ud.user_id", operator: "<>", value: 0 }];

    if (dateCondition) condition.push(dateCondition);

    if (order_type && order_type !== "All") {
      condition.push({
        field: "sop.order_type",
        operator: "=",
        value: order_type,
      });
    }

    if (balance_filter === "nd" || balance_filter === "od") {
      condition.push({
        field: "od.due_date",
        operator: "IS NOT",
        value: "NULL",
        raw: true,
      });
    }

    const sourceFilters = getfilterss(source, date);
    condition.push(...sourceFilters);

    const balanceFilters = getBalanceFilterConditions(balance_filter, date);
    condition.push(...balanceFilters);

    const balanceConditions = [];
    if (is_balance === "true") {
      switch (date) {
        case "this_month":
          balanceConditions.push(
            {
              field: "DATE(bl.added_date)",
              operator: "BETWEEN",
              value: [`"${startOfMonth}"`, `"${today}"`],
              raw: true,
            },
            {
              field: "bl.paid_amount",
              operator: ">",
              value: 0,
            }
          );
          break;
        case "last_month":
          balanceConditions.push(
            {
              field: "DATE(bl.added_date)",
              operator: "BETWEEN",
              value: [
                `"${moment()
                  .subtract(1, "month")
                  .startOf("month")
                  .format("YYYY-MM-DD")}"`,
                `"${moment()
                  .subtract(1, "month")
                  .endOf("month")
                  .format("YYYY-MM-DD")}"`,
              ],
              raw: true,
            },
            {
              field: "bl.paid_amount",
              operator: ">",
              value: 0,
            }
          );
          break;
        case "this_year":
          balanceConditions.push(
            {
              field: "DATE(bl.added_date)",
              operator: "BETWEEN",
              value: [`"${startOfYear}"`, `"${today}"`],
              raw: true,
            },
            {
              field: "bl.paid_amount",
              operator: ">",
              value: 0,
            }
          );
          break;
        case "today":
          balanceConditions.push(
            {
              field: "DATE(bl.added_date)",
              operator: "=",
              value: "CURDATE()",
              raw: true,
            },
            {
              field: "bl.paid_amount",
              operator: ">",
              value: 0,
            }
          );
          break;
      }
    }

    const results = await readRecordUnion([
      {
        selectField: `
          od.order_id,
          ud.user_id,
          CONCAT(ud.first_name, ' ', ud.last_name) AS client_name,
          CONCAT(ud.phone_code, ' ', ud.phone_number) AS client_phone,
          ud.email_id,
          ud.user_status,
          sop.order_type,
          od.order_mrp,
          od.order_paid_amount,
          od.order_balance_amount,
          od.order_date,
          sop.due_date,
          od.mentor_assigned AS mentor_assigned_id,
          od.sale_by,
          od.discount_type,
          od.pincode,
          od.city_id,
          od.state_id,
          od.country_id,
          od.order_address,
          ud.my_wallet,
          COUNT(sop.sub_order_id) AS sub_order_count,
          CONCAT(sad.first_name, ' ', sad.last_name) AS saled_by,
          CONCAT(ad.first_name, ' ', ad.last_name) AS mentor_assigned,
          CONCAT(
            COALESCE(apm.name, ''), 
            ' ',
            CASE 
              WHEN COALESCE(aba.account_holder, '') <> '' 
                OR COALESCE(aba.bank_name, '') <> '' 
                OR COALESCE(aba.account_type, '') <> '' 
              THEN CONCAT(
                '(',
                TRIM(CONCAT_WS(' ', 
                  COALESCE(aba.account_holder, ''), 
                  COALESCE(aba.bank_name, ''), 
                  CASE 
                    WHEN COALESCE(aba.account_type, '') <> '' THEN 
                      CONCAT('(', aba.account_type, ')') 
                    ELSE '' 
                  END
                )),
                ')'
              )
              ELSE ''
            END
          ) AS payment_mode_details,
          od.payment_mode,
          apm.name AS payment_mode_name
        `,
        table: "order_details od",
        join: [
          {
            type: "INNER",
            table: "users_details ud",
            on: "od.user_id = ud.user_id",
          },
          {
            type: "LEFT",
            table: "admin_users sad",
            on: "od.sale_by = sad.admin_user_id",
          },
          {
            type: "LEFT",
            table: "admin_users ad",
            on: "od.mentor_assigned = ad.admin_user_id",
          },
          {
            type: "LEFT",
            table: "sub_orders_programs sop",
            on: "sop.order_id = od.order_id",
          },
          {
            type: "LEFT",
            table: "accounts_payment_modes apm",
            on: "apm.id = od.payment_mode",
          },
          {
            type: "LEFT",
            table: "accounts_bank_accounts aba",
            on: "od.payment_mode_bank = aba.id",
          },
          {
            type: is_balance === "true" ? "INNER" : "LEFT",
            table: "balance_amount_log bl",
            on: "sop.sub_order_id = bl.sub_order_id",
          },
        ],
        condition,
        having: is_balance === "true" ? balanceConditions : [],
        groupBy: ["od.order_id"],
        orderBy: ["od.order_date DESC"],
      },
    ]);

    if (!results || results.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No orders found to export.",
      });
    }

    const formattedData = results.map((item) => {
      const newItem = {};
      for (const key in item) {
        const newKey = key
          .replace(/_/g, " ")
          .replace(/^\w/, (c) => c.toUpperCase());
        newItem[newKey] = item[key];
      }
      return newItem;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=OrderDetails_${Date.now()}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Error in exportAllOrdersController:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Internal server error",
    });
  }
};

const addSubOrderProgram = async ({
  item,
  newOrderDetails,
  order_type,
  index,
  user_id,
  mentor_assigned,
}) => {
  try {
    let programSessions = [];
    let programData;
    let program_duration = 0;
    let extra_validity = 0;
    let expiry_date = null;
    let start_date = null;
    let start_program_weight = null;
    let userDetails = [];
    let hasActiveSubOrders = false;

    if (!item.guide_id) {
      // Fetch program session and program details
      const [{ results: programSessionsResults }, { results: programDetails }] =
        await Promise.all([
          readRecord({
            table: `${tables.programSession} ps`,
            selectFields: [
              "ps.program_sessions",
              "ps.validity",
              "ps.extra_validity",
            ],
            conditions: [
              {
                field: "ps.program_session_id",
                operator: "=",
                value: item.program_session_id,
              },
            ],
          }),
          readRecord({
            table: `${tables.programsMaster} pm`,
            selectFields: ["pm.program_category"],
            conditions: [
              {
                field: "pm.program_id",
                operator: "=",
                value: item.program_id,
              },
            ],
          }),
        ]);

      programSessions = programSessionsResults;
      programData = programDetails;

      if (!programSessions.length || !programData.length) {
        throw new Error("Invalid program or session ID");
      }

      // Fetch user weight
      const { results: userWeight } = await readRecord({
        table: `${tables.assessment_personal_details}`,
        selectFields: ["weight"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });

      const { results: subOrderResults } = await readRecord({
        table: tables.subOrderPrograms,
        selectFields: ["expiry_date", "program_status"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });

      userDetails = subOrderResults.filter(
        (r) => Number(r.program_status) === 1
      );
      hasActiveSubOrders = userDetails.length > 0;

      start_program_weight = userWeight[0]?.weight || null;
      program_duration = parseInt(programSessions[0].validity) || 0;
      extra_validity = parseInt(programSessions[0].extra_validity) || 0;

      // Set start_date
      if (userDetails.length > 0) {
        start_date = moment(userDetails[0].expiry_date)
          .add(3, "days")
          .format("YYYY-MM-DD");
      } else {
        start_date = moment(item.order_date_time)
          .add(1, "day")
          .format("YYYY-MM-DD");
      }

      // Set expiry_date
      expiry_date = moment(start_date)
        .add(program_duration, "days")
        .add(extra_validity, "days")
        .format("YYYY-MM-DD");
    }

    // Set program status
    let program_status = null;
    if (!item.guide_id) {
      if (order_type === "OCR") {
        program_status = index === 0 ? 1 : 4;
      } else if (order_type === "Renewal") {
        program_status = 4;
      } else if (order_type === "New") {
        program_status = index === 0 ? 1 : 4;
      } else if (order_type === "Free") {
        program_status = hasActiveSubOrders ? 4 : index === 0 ? 1 : 4;
      } else if (order_type === "Upgrade") {
        program_status = index === 0 ? 1 : 4;
      }
    }

    // Prepare columns and values for insertion
    const subOrderProgramsColumns = [
      "order_id",
      !item.guide_id ? "program_id" : null,
      item.guide_id ? "guide_id" : "program_session_id",
      item.program_combo ? "program_combo" : null,
      item.guide_id ? "type" : null,
      !item.guide_id ? "total_sessions" : null,
      !item.guide_id ? "sent_sessions" : null,
      !item.guide_id ? "pending_session" : null,
      "mrp",
      "discount",
      "paid_amount",
      !item.guide_id ? "program_status" : null,
      !item.guide_id ? "start_date" : null,
      !item.guide_id ? "expiry_date" : null,
      order_type === "Free" ? null : "balance_amount",
      order_type !== "Free" && Number(item.balance_amount) > 0
        ? "due_date"
        : null,
      "order_type",
      "user_id",
      programData[0].program_category === "Basic Stack" ||
      [1, 3].includes(program_duration)
        ? "program_type"
        : null,
    ].filter(Boolean);

    const subOrderProgramsValues = [
      newOrderDetails.insertId,
      !item.guide_id ? item.program_id : null,
      item.guide_id ? item.guide_id : item.program_session_id,
      item.program_combo ? item.program_combo : null,
      item.guide_id ? 1 : 0,
      !item.guide_id ? programSessions[0]?.program_sessions || null : null,
      !item.guide_id ? "0" : null,
      !item.guide_id ? programSessions[0]?.program_sessions || null : null,
      item.mrp,
      item.discount_amount,
      order_type === "Free" ? "0" : item.paid_amount,
      !item.guide_id ? program_status : null,
      !item.guide_id ? start_date : null,
      !item.guide_id ? expiry_date : null,
      order_type === "Free" ? null : item.balance_amount,
      order_type !== "Free" && Number(item.balance_amount) > 0
        ? item.due_date
        : null,
      order_type,
      user_id,
      programData[0].program_category === "Basic Stack" ||
      [1, 3].includes(program_duration)
        ? 1
        : null,
    ].filter(Boolean);

    const insertedResult = await insertRecord(
      `${tables.subOrderPrograms}`,
      subOrderProgramsColumns,
      subOrderProgramsValues
    );

    if (!insertedResult.insertId) {
      throw new Error("Failed to insert sub-order program");
    }
    let chat = null;
    let chat_mentor_assigned = null;
    let mentor_name = null;

    if (order_type == "Renewal") {
      const { results: orderData } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: user_id,
          },
          {
            field: "sops.order_type",
            operator: "=",
            value: "Renewal",
          },
          {
            field: "sops.sub_order_id",
            operator: "=",
            value: insertedResult.insertId,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sops`,
            on: "ud.user_id = sops.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pms`,
            on: "pms.program_id = sops.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id   = sops.program_session_id",
          },
        ],
        selectFields: [
          "ud.user_id",
          "ud.first_name",
          "pms.program_name",
          "ps.validity",
          "ud.mentor_assigned",
          `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        ],
      });

      chat_mentor_assigned = orderData[0].mentor_assigned;
      mentor_name = orderData[0].mentor_name;
      chat = `<p>Hi ${orderData[0].first_name},</p><p><br></p><p>Welcome back to <strong>Balance Nutrition :)</strong></p><p><br></p><p>This is to confirm that your payment of Rs.${item.paid_amount} for ${orderData[0].program_name} (${orderData[0].validity} Day) has been received &amp; updated to your account.</p><p><br></p><p>You shall receive the other details over email as well.</p><p><br></p><p>We shall start with the ${orderData[0].program_name} program after your current one is over.</p><p><br></p><p>You can set the date of start for this program now or later as well.</p><p><br></p><p><a href="https://www.balancenutrition.in/app_link/screen_id=64" rel="noopener noreferrer" target="_blank">Click here</a> to set start date now.</p>`;
    }

    if (order_type == "OCR") {
      const { results: orderData } = await readRecord({
        table: `${tables.userDetails} ud`,
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: user_id,
          },
          {
            field: "sops.order_type",
            operator: "=",
            value: "OCR",
          },
          {
            field: "sops.sub_order_id",
            operator: "=",
            value: insertedResult.insertId,
          },
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.subOrderPrograms} sops`,
            on: "ud.user_id = sops.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.programsMaster} pms`,
            on: "pms.program_id = sops.program_id",
          },
          {
            type: "LEFT",
            table: `${tables.programSession} ps`,
            on: "ps.program_session_id   = sops.program_session_id",
          },
        ],
        selectFields: [
          "ud.user_id",
          "ud.first_name",
          "pms.program_name",
          "ps.validity",
          "ud.mentor_assigned",
          `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        ],
      });
      chat_mentor_assigned = orderData[0].mentor_assigned;
      mentor_name = orderData[0].mentor_name;
      chat = `<p><strong>Welcome back to Balance Nutrition :)</strong></p>
<p>Hi ${orderData[0].first_name},</p>
<p>We have received your payment of Rs.${item.paid_amount} for the <strong>${orderData[0].validity} Day ${orderData[0].program_name}</strong> program.</p>
<p>You should have also received an email from us in this regard. To begin your Program, you have to start with filling out your Assessment<a href="https://www.balancenutrition.in/app_link/screen_id=1"> (Click Here).</a></p>
<p>Let us know here in case you need any further assistance.</p>
<p>&nbsp;</p>`;
    }

    if (chat) {
      await clientEnquiry.create({
        mentor_id: chat_mentor_assigned,
        type: "broadcast",
        sender: "mentor",
        query: chat,
        user_id: user_id,
        name: mentor_name,
      });
    }

    if (item.program_id && ["Free", "OCR", "New"].includes(order_type)) {
      const updateData = {
        user_status: "Active",
        sub_user_status:
          programData[0].program_category === "Basic Stack" ||
          [1, 3].includes(program_duration)
            ? "Cleanse active"
            : "Active",
        user_type: "1",
        ...((order_type === "New" ||
          order_type === "OCR" ||
          (order_type === "Free" && !hasActiveSubOrders)) && {
          ...(index === 0 && { active_order_id: insertedResult.insertId }),
        }),
        enc_password: md5("123456"),
        plain_password: "123456",
        mentor_assigned,
        ...(["New", "OCR"].includes(order_type) && {
          last_screen_visited: "program_details_info",
          current_screen: "program_details_info",
        }),
      };

      const updatedResult = await updateRecord(tables.userDetails, updateData, {
        user_id,
      });

      if (updatedResult.affectedRows === 0) {
        throw new Error("Failed to update user details");
      }
    }
  } catch (error) {
    throw new Error(`Failed to add sub-order: ${error.message}`);
  }
};
const getSubOrderDetailsController = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const { results: subOrderDetails } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "sop.sub_order_id",
        "sop.total_sessions",
        "sop.sent_sessions",
        "sop.pending_session",
        "sop.mrp",
        "sop.discount",
        "sop.program_type",
        "sop.paid_amount",
        "sop.program_status",
        "sop.start_date",
        "sop.expiry_date",
        "sop.created_at",
        "sop.balance_amount",
        "pm.program_name",
        "g.guide",
        "ps.program_session_id",
        "pm.program_id",
        "sop.order_type",
        "od.order_date",
        "ps.program_duration",
      ],
      conditions: [{ field: "sop.order_id", operator: "=", value: order_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.guides} g`,
          on: "g.guide_id = sop.guide_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        },
      ],
      orderBy: ["sop.created_at DESC"],
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Sub Order Details Fetched Successfully",
      data: subOrderDetails.map((i) => {
        const is_active = Number(i.program_status) === 1 ? true : false;
        i.program_type =
          i.program_type === 0
            ? "Special Stack"
            : i.program_type === 1
            ? "Basic Stack"
            : null;
        i.program_status =
          i.program_status === "1"
            ? "Active"
            : i.program_status === "2"
            ? "Paused"
            : i.program_status === "3"
            ? "Completed"
            : i.program_status === "4"
            ? "Advance Purchase"
            : null;

        return {
          ...i,
          is_active,
        };
      }),
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendIdAndPassword = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return next(new ErrorHandler("User ID Not Provided", 400));
    }
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.plain_password",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });
    if (userDetails.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }
    if (
      userDetails[0].plain_password === null ||
      userDetails[0].plain_password === undefined ||
      userDetails[0].plain_password === ""
    ) {
      await updateRecord(
        tables.userDetails,
        { plain_password: "123456" },
        { user_id: userDetails[0].user_id }
      );
    }
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/wam.ejs"),
      {
        firstName: userDetails[0].first_name,
        username: userDetails[0].email_id,
        password: userDetails[0].plain_password || "123456",
      }
    );

    await sendMailUtil({
      subject: "Your Login Id & Password",
      to: `${userDetails[0].email_id}`,
      from: `Accounts <accounts@balancenutrition.in>`,
      cc: "info@balancenutrition.in",
      bcc: "accounts@balancenutrition.in",
      html: html,
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Wam Email Sent Successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sendIdAndPasswordNew = async (user_id) => {
  try {
    
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.phone_code",
        "ud.phone_number",
        "ud.plain_password",
        "pm.program_name",
        "ps.program_duration",
        "sop.paid_amount",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "LEFT", 
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT", 
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
        {
          type: "LEFT", 
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
        ],
    });
    
    if (
      userDetails[0].plain_password === null ||
      userDetails[0].plain_password === undefined ||
      userDetails[0].plain_password === ""
    ) {
      await updateRecord(
        tables.userDetails,
        { plain_password: "123456" },
        { user_id: userDetails[0].user_id }
      );
    }
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/newdetails.ejs"),
      {
        firstName: userDetails[0].first_name,
        username: userDetails[0].email_id,
        password: userDetails[0].plain_password || "123456",
        programDuration: userDetails[0].program_duration,
        programName: userDetails[0].program_name,
        paidAmount: userDetails[0].paid_amount,
      }
    );

    await sendMailUtil({
      subject: "Login Details For Your Diet Program",
      to: `${userDetails[0].email_id}`,
      from: `Accounts <accounts@balancenutrition.in>`,
      cc: "info@balancenutrition.in",
      bcc: "accounts@balancenutrition.in",
      html: html,
    });
      let fullPhone = `${userDetails[0].phone_code}${userDetails[0].phone_number}`;
          fullPhone = fullPhone.replace(/\s/g, ""); // Remove any spaces from the phone number
           
          if(userDetails[0].program_name && userDetails[0].program_duration && userDetails[0].paid_amount){            
        const response = await axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${fullPhone}`,
          {
            template_name: "payment_recived_new_wati_", // The template to be used
            broadcast_name: "payment_recived_new_wati_", // Template broadcast name
            parameters: [
              { name: "name", value: capitalizeWords(userDetails[0].first_name) || "User" },
              { name: "program_name", value: userDetails[0].program_name },
              { name: "program_days", value: userDetails[0].program_duration },
              { name: "program_amount", value: userDetails[0].paid_amount },
            ],
          }
        );
        console.log(
          `✅ WATI sent to ${fullPhone} (${userDetails[0].first_name})`
        );
      }
      
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

const sendWamMail = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return next(new ErrorHandler("User ID Not Provided", 400));
    }
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.plain_password",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });
    if (userDetails.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }
    if (
      userDetails[0].plain_password === null ||
      userDetails[0].plain_password === undefined ||
      userDetails[0].plain_password === ""
    ) {
      await updateRecord(
        tables.userDetails,
        { plain_password: "123456" },
        { user_id: userDetails[0].user_id }
      );
    }
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/wam2.ejs"),
      {
        name: userDetails[0].first_name,
        email: userDetails[0].email_id,
        password: userDetails[0].plain_password || "123456",
      }
    );
    await sendMailUtil({
      subject: "The Way ahead",
      to: `${userDetails[0].email_id}`,
      from: `Accounts <accounts@balancenutrition.in>`,
      cc: "info@balancenutrition.in",
      bcc: "accounts@balancenutrition.in",
      html: html,
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Wam Email Sent Successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const sendInvoiceMail = async (req, res, next) => {
  try {
    const {
      sub_order_id,
      include_gst = true,
      company_name,
      address,
      invoice_number,
    } = req.query;
    if (!sub_order_id) {
      return next(new ErrorHandler("Sub Order ID Not Provided", 400));
    }
    const { results: userDetails } = await readRecord({
      selectFields: [
        "ud.first_name",
        "od.order_address",
        "ud.phone",
        "ud.email_id",
        "od.order_date",
        "pm.program_name",
        "ps.program_duration",
        "pm.program_category",
        "sop.mrp",
        "sop.paid_amount",
        "sop.discount",
        "sop.wallet_discount",
        "sop.balance_amount",
        "sop.program_combo",
        "ud.user_id",
        "od.order_id",
      ],
      table: `${tables.subOrderPrograms} sop`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "sop.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "sop.order_id = od.order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
      ],
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: sub_order_id,
        },
      ],
    });
    if (userDetails.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }
    console.log(
      userDetails[0],
      convertToWords.toWords(userDetails[0].paid_amount),
      1745
    );
    // console.log(Boolean(include_gst), 1774);
    // return false;
    let invoice_data_updated = false;
    if (
      company_name !== undefined &&
      company_name !== "" &&
      address !== undefined &&
      address !== "" &&
      invoice_number !== undefined &&
      invoice_number !== ""
    ) {
      const updateSubOrderInvoice = await updateRecord(
        tables.subOrderPrograms,
        {
          invoice_name: company_name,
          invoice_address: address,
          invoice_number: invoice_number,
        },
        {
          sub_order_id: sub_order_id,
        }
      );
      if (updateSubOrderInvoice.affectedRows > 0) {
        invoice_data_updated = true;
      }
    }
    const html = await ejs.renderFile(
      path.join(__dirname, "../../../../../src/mails/invoiceMail.ejs"),
      {
        name: userDetails[0].first_name,
        address: address || userDetails[0].order_address,
        gstn: invoice_number || "N/A",
        contact: userDetails[0].phone,
        email: userDetails[0].email_id,
        orderDate: moment(userDetails[0].order_date).format("Do MMM YYYY"),
        invoiceNo: `Balance/${userDetails[0].user_id}/${userDetails[0].order_id}/${sub_order_id}`,
        programName: userDetails[0].program_name,
        programCombo: userDetails[0].program_combo,
        programDuration:
          userDetails[0]?.program_category === "Service"
            ? ""
            : userDetails[0].program_duration,
        hsnCode: "999723",
        mrp: userDetails[0].mrp,
        existingDiscount: userDetails[0].discount,
        couponDiscount: 0,
        walletDiscount: userDetails[0].wallet_discount || 0,
        balanceAmount: userDetails[0].balance_amount || 0,
        cgst:
          include_gst === true
            ? Number(userDetails[0].paid_amount * 0.025).toFixed(2)
            : 0,
        sgst:
          include_gst === true
            ? Number(userDetails[0].paid_amount * 0.025).toFixed(2)
            : 0,
        totalAmount: userDetails[0].mrp,
        paidAmount: userDetails[0].paid_amount,
        amountInWords: capitalizeWords(
          convertToWords.toWords(userDetails[0].paid_amount)
        ),
        companyName: company_name,
      }
    );
    console.log(html, 1801);
    const mail = await sendMailUtil({
      subject: "Balance Nutrition - Program Order Invoice",
      to: userDetails[0].email_id,
      from: `Accounts <accounts@balancenutrition.in>`,
      cc: "info@balancenutrition.in",
      bcc: `accounts@balancenutrition.in`,
      html: html,
    });
    console.log(mail, 1770);
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: `Wam Email Sent Successfully ${
          invoice_data_updated ? "and Invoice Data Updated" : ""
        }`,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateSubOrderStatusOld = async (req, res, next) => {
  const { sub_order_id, id: extended_by, program_status } = req.body;
  if (!program_status || !sub_order_id || !extended_by) {
    return next(new ErrorHandler("Missing required fields", 400));
  }
  console.log(sub_order_id, extended_by, program_status, 1176);
  try {
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.subOrderPrograms} sop`,
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: sub_order_id,
        },
      ],
    });
    console.log(results, 1189);
    const { results: users } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: "cd.user_id",
          operator: "=",
          value: results[0].user_id,
        },
      ],
    });
    const userDetails = users[0];
    console.log(userDetails, 1203);
    const prev_program_status = results[0].program_status;
    console.log(prev_program_status, 1191);
    const { results: advanceProgram, totalCount: advanceProgramCount } =
      await readRecord({
        selectFields: ["*"],
        table: `${tables.subOrderPrograms} sop`,
        conditions: [
          {
            field: "sop.user_id",
            operator: "=",
            value: results[0].user_id,
          },
          {
            field: "sop.program_status",
            operator: "=",
            value: 4,
          },
          {
            field: "sop.sub_order_id",
            operator: "<>",
            value: sub_order_id,
          },
        ],
        orderBy: ["sop.expiry_date ASC"],
        countTotal: true,
      });

    const updatedData = {
      program_status,
      expiry_extended_by: extended_by,
    };
    console.log(updatedData, 1221);
    console.log(advanceProgramCount, 1222);
    if (Number(prev_program_status) === 2 && Number(program_status) === 1) {
      const newExpiryDate = moment()
        .add(results[0].pending_session * 11, "days")
        .format("YYYY-MM-DD");
      updatedData.expiry_date = newExpiryDate;

      if (advanceProgramCount > 0) {
        let lastProgramExpiryDate = newExpiryDate;
        for (const elem of advanceProgram) {
          const expiryDateAdvancePurchase = moment(lastProgramExpiryDate)
            .add(3, "days")
            .format("YYYY-MM-DD");
          lastProgramExpiryDate = expiryDateAdvancePurchase;
          await updateRecord(
            tables.subOrderPrograms,
            {
              expiry_date: expiryDateAdvancePurchase,
              expiry_extended_by: extended_by,
            },
            {
              sub_order_id: elem.sub_order_id,
            }
          );
        }
      }
    }
    if (Number(results[0].program_type) === 1) {
      await updateUserStatusAndLog({
        userId: results[0].user_id,
        status: "Active",
        subStatus: "Cleanse active",
      });
    }
    if (Number(program_status) === 3) {
      await updateUserStatusAndLog({
        userId: results[0].user_id,
        status: "Completed",
        subStatus: "Completed",
      });
    }
    const updateResult = await updateRecord(
      tables.subOrderPrograms,
      updatedData,
      {
        sub_order_id,
      }
    );
    console.log(updateResult, 1263);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No sub order  found with the given id", 400)
      );
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
      if (
        userDetails.active_order_id !== sub_order_id &&
        Number(program_status) === 1
      ) {
        const userActiveOrderUpdate = await updateRecord(
          tables.userDetails,
          {
            active_order_id: sub_order_id,
          },
          { user_id: results[0].user_id }
        );
        console.log(userActiveOrderUpdate, 1295);
        const subOrderProgramStatusUpdate = await updateRecord(
          tables.subOrderPrograms,
          {
            program_status: "2",
          },
          {
            sub_order_id: userDetails.active_order_id,
          }
        );
        console.log(subOrderProgramStatusUpdate, 1301);
      }
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Program's status  updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler(`Error while updating status of program`, 400)
      );
    }
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateSubOrderStatus = async (req, res, next) => {
  const { sub_order_id, id: extended_by } = req.body;
  let { program_status } = req.body;
  if (!program_status || !sub_order_id || !extended_by) {
    return next(new ErrorHandler("Missing required fields", 400));
  }
  try {
    if (program_status == "Active") {
      program_status = "1";
    }
    if (program_status == "Pause") {
      program_status = "2";
    }
    if (program_status == "Completed") {
      program_status = "3";
    }
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.subOrderPrograms} sop`,
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: sub_order_id,
        },
      ],
    });
    const prev_program_status = results[0].program_status;
    const updatedData = {
      program_status: program_status,
      expiry_extended_by: extended_by,
    };
    console.log(updatedData, 1221);
    const updateResult = await updateRecord(
      tables.subOrderPrograms,
      updatedData,
      {
        sub_order_id,
      }
    );
    console.log(updateResult, 1263);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler("No sub order  found with the given id", 400)
      );
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
      if ([1, 3].includes(Number(program_status))) {
        if (Number(program_status) === 1) {
          if (Number(results[0].program_type) == 1) {
            updateRecord(
              tables.userDetails,
              {
                user_status: "Active",
                sub_user_status: "Cleanse active",
                active_order_id: sub_order_id,
              },
              { user_id: results[0].user_id }
            );
          } else {
            updateRecord(
              tables.userDetails,
              {
                user_status: "Active",
                sub_user_status: "Active",
                active_order_id: sub_order_id,
              },
              { user_id: results[0].user_id }
            );
          }
        } else if (Number(program_status) === 3) {
          updateRecord(
            tables.userDetails,
            {
              user_status: "Completed",
              sub_user_status: "Completed",
            },
            { user_id: results[0].user_id }
          );
        }
      }
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Program's status  updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler(`Error while updating status of program`, 400)
      );
    }
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteOrderController = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return next(new ErrorHandler("Missing order_id", 400));
    }
    const { results } = await readRecord({
      table: `${tables.orderDetails}`,
      selectFields: ["order_type", "user_id"],
      conditions: [{ field: "order_id", operator: "=", value: order_id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("Order not found", 404));
    }
    const orderToDelete = results[0];
    const [deletedSubOrderResult, deletedOrderResult] = await Promise.all([
      deleteRecords(tables.subOrderPrograms, null, { order_id }),
      deleteRecords(tables.orderDetails, null, { order_id }),
    ]);
    if (
      deletedSubOrderResult.affectedRows === 0 &&
      deletedOrderResult.affectedRows === 0
    ) {
      return next(new ErrorHandler("Error Deleting Order", 400));
    }
    if (["New", "OCR"].includes(orderToDelete.order_type)) {
      await updateRecord(
        tables.userDetails,
        { active_order_id: null },
        { user_id: orderToDelete.user_id }
      );
    }
    return res
      .status(200)
      .json(new ApiResponse({ message: "Order Deleted Successfully" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getOrderLogs = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const { results, totalCount } = await readRecord({
      selectFields: [
        "ol.id",
        "ol.user_id",
        "ol.amount",
        "ol.payment_for",
        "ol.src",
        "DATE_FORMAT(ol.added_date, '%e %b %Y %l:%i %p') AS added_date",
        "od.order_type",
        "CONCAT(COALESCE(cd.first_name, ''), ' ', COALESCE(cd.last_name, '')) AS client_name",
      ],
      table: `${tables.orderLogs} ol`,
      joins: [
        {
          type: "INNER",
          table: `${tables.orderDetails} od`,
          on: "ol.order_id = od.order_id",
        },
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "ol.user_id = cd.user_id",
        },
      ],
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone",
          ],
        },
      }),
      pagination: {
        page,
        limit,
      },
      countTotal: true,
      orderBy: ["ol.added_date DESC"],
    });
    console.log(results, 2839);
    if (totalCount === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Order Logs Found",
        data: [],
        totalCount: 0,
      });
      return res.status(200).json(apiResponse);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Order Logs Fetched Successfully",
      data: results,
      totalCount,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getServiceProgramDetails = async (req, res, next) => {
  try {
    const { results: serviceDetails } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: [
        "pm.program_id",
        "pm.program_name",
        "ps.program_session_id",
        "ps.mrp",
        "ps.usd_mrp",
        "ps.discount_percentage",
        "ps.discount_amount",
      ],
      conditions: [
        { field: "pm.program_category", operator: "=", value: "Service" },
        { field: "pm.is_active", operator: "=", value: 1 },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "pm.program_id = ps.program_id",
        },
      ],
    });

    console.log(serviceDetails);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sources Fetched Successfully",
      data: serviceDetails,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getServiceProgramDetails:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addServiceProgramOrder = async (req, res, next) => {
  try {
    const {
      service_id,
      program_session_id,
      user_id,
      mrp,
      discount_amount,
      paid_amount,
      balance_amount,
      due_date,
      payment_mode,
      payment_mode_type,
      payment_mode_bank,
    } = req.body;

    if (!service_id || !program_session_id || !user_id) {
      return next(new ErrorHandler("Bad Request: Invalid Input", 400));
    }

    const { results: users } = await readRecord({
      table: tables.userDetails,
      selectField: ["phone_number", "mentor_assigned"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    // insert into order details:

    const odCols = [
      "user_id",
      "phone_number",
      "order_mrp",
      "order_paid_amount",
      "payment_mode",
      "payment_mode_type",
      "order_date",
      "order_status",
      // 'sale_by',
      "mentor_assigned",
      "payment_mode_bank",
      "order_discount",
    ];

    const odValues = [
      user_id,
      users[0]?.phone_number,
      mrp,
      paid_amount,
      payment_mode,
      payment_mode_type || "0",
      moment().format("YYYY-MM-DD HH:mm:ss"),
      1,
      users[0]?.mentor_assigned,
      payment_mode_bank || "",
      discount_amount || 0,
    ];

    if (due_date) {
      odCols.push("due_date");
      odValues.push(due_date);
    }
    if (balance_amount) {
      odCols.push("order_balance_amount");
      odValues.push(balance_amount);
    }

    const insertedRow = await insertRecord(
      tables.orderDetails,
      odCols,
      odValues
    );

    const orderId = insertedRow.insertId;

    const sopCols = [
      "order_id",
      "user_id",
      "program_id",
      "program_session_id",
      "mrp",
      "paid_amount",
      "program_status", // 3,
      "start_date", // Today
      "order_type", // Renewal
      "discount",
    ];

    const sopVals = [
      orderId,
      user_id,
      service_id,
      program_session_id,
      mrp,
      paid_amount,
      3,
      moment().format("YYYY-MM-DD HH:MM:ss"),
      "Renewal",
      discount_amount || 0,
    ];

    if (due_date) {
      sopCols.push("due_date");
      sopVals.push(due_date);
    }

    if (balance_amount) {
      sopCols.push("balance_amount");
      sopVals.push(balance_amount);
    }

    await insertRecord(tables.subOrderPrograms, sopCols, sopVals);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sub",
      data: [],
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in getServiceProgramDetails:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};



export {
  addOrderController,
  addHamper,
  addHamperProductToShip,
  editProductOrderAddress,
  exportAllOrdersController,
  deleteOrderController,
  editOrderController,
  getAllOrdersController,
  getOrderDetailsById,
  getOrderHistoryByUserId,
  getOrderLogs,
  getSubOrderDetailsController,
  sendIdAndPassword,
  sendInvoiceMail,
  sendWamMail,
  updateSubOrderStatus,
  getProductOrderHistoryByUserId,
  addFreeDrStoreOrder,
  addShipyaariOrder,
  addToDoctorStoreManual
};
