import axios from "axios";
import jwt from "jsonwebtoken";
import { getVendorToken } from "../utils/tokenManager.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { formatString } from "../helper/commonHelper.js";



const DRSTORE_ORDER_API = process.env.DRSTORE_ORDER_API || "https://apigateway.mytracky.com/organization/v-1-0-0/oms/order/place";
const DRSTORE_LOGIN_API = process.env.DRSTORE_LOGIN_API || "https://apigateway.mytracky.com/organization/v-1-0-0/crm/login";
const DRSTORE_FETCH_ORDER_STATUS_API = process.env.DRSTORE_FETCH_ORDER_STATUS_API || "https://apigateway.mytracky.com/organization/v-1-0-0/oms/fetch-product/order-status";


export const getDrStoreAccessToken = () =>
  getVendorToken({
    cacheKey: "DRSTORE_ACCESS_TOKEN",
    lockKey: "DRSTORE_TOKEN_LOCK",
    generateTokenFn: async () => {
      const response = await axios.post(
        DRSTORE_LOGIN_API,
        {
          phone: process.env.DRSTORE_EMAIL,
          password: process.env.DRSTORE_PASSWORD,
          login_type: "login_email",
        }
      );

      const token = response?.data?.data?.token;
      if (!token) throw new Error("Dr Store JWT missing");

      const expiresInSeconds = 10 * 24 * 60 * 60; 

      return { token, expiresInSeconds };
    }
  });

export const placeDrStoreOrder = async (orderMeta,items) => {

  const payloadSr = {
    organization_order_id: orderMeta.product_order_id,
    userInfo: {
        name: orderMeta.customer_name,
        email: orderMeta.customer_email,
        phone: orderMeta.customer_phone,
    },
    addressInfo: {
        address: orderMeta.customer_address,              
        city_name: orderMeta.customer_city,
        state_name: orderMeta.customer_state,
        landmark: orderMeta.customer_landmark,
        phone: orderMeta.customer_phone,
        pincode: Number(orderMeta.customer_pincode),
        country_name: orderMeta.customer_country
    },
    product_items: items.map(item => ({
            qty: Number(item.quantity), 
            product_slug: 'bn-bodyscan-smart-scale',
            product_sku: 'BN-DR-1'
    }))
  }

  const token = await getDrStoreAccessToken();

  if (!token) {
    throw new Error("Failed to fetch Dr Store access token");
  }

  try {
    const response = await axios.post(
      DRSTORE_ORDER_API,
      payloadSr,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      }
    );

    console.log("Dr Store OMS Order Placed Successfully:");
    return response.data;

  } catch (error) {
    console.error(
      "Dr Store OMS Order Placement Failed:",
      error?.response?.data || error.message
    );

    throw new Error("Dr Store OMS order placement failed");
  }
};

export const fetchDrStoreOrderStatus = async (organizationOrderId) => {
  if (!organizationOrderId) {
    throw new Error("organizationOrderId is required");
  }

  const token = await getDrStoreAccessToken();

  if (!token) {
    throw new Error("Failed to fetch Dr Store access token");
  }

  try {
    const response = await axios.post(
      DRSTORE_FETCH_ORDER_STATUS_API,
      {
        organization_order_id: organizationOrderId,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      }
    );

    return response.data?.data?.sale_details?.status;

  } catch (error) {
    console.error(
      "Dr Store Order Status Fetch Failed:",
      error?.response?.data || error.message
    );

    throw new Error("Failed to fetch Dr Store order status");
  }
};

export const updateDrStoreOrderStatus = async (req, res, next,internal)=> {
   try {
      const { results: drstoreOrders } = await readRecord({
        table: `${tables.product_orders}`,
        selectFields: ["product_order_id", "status"],
        conditions: [
          {
            field: "payment_status",
            operator: "=",
            value: "Success",
          },
          {
            field: "status",
            operator: "!=",
            value: "Delivered",
          },
          {
            field: "brand",
            operator: "=",
            value: "doctorstore",
          }
        ],
        groupBy: ["product_order_id"],
      });

      if (!drstoreOrders?.length) {
        if (internal) {
          console.log("No Records found");
          return;
        }
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: "No records found",
            data: [],
          })
        );
      }

      for (const order of drstoreOrders) {
        try {
          const orderStatus = await fetchDrStoreOrderStatus(order.product_order_id); 
          if (orderStatus && (formatString(orderStatus) != order.status)) {
            const newStatus = formatString(orderStatus);
            await updateRecord(
              tables.product_orders,
              { status: newStatus },
              { product_order_id: order.product_order_id }
            );
            console.log(`Updated order ${order.product_order_id} status to: ${newStatus}`);
          }
        } catch (error) {
          console.error(`Failed to update order ${order.product_order_id}:`, error.message);
        }
      }

      if (internal) {
        console.log(`Processed ${drstoreOrders.length} Dr Store orders`);
        return;
      }

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: `Successfully processed ${drstoreOrders.length} orders`,
          data: drstoreOrders,
        })
      );

   }
   catch(error) {
    console.error(error);
    if (internal!==true) {
      return next(
      error instanceof ErrorHandler
        ? error
        : new ErrorHandler("Internal Server Error", 500)
      );
    }
   }
}