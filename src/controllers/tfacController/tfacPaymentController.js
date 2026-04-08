

// generate access token for Instamojo API
import axios from 'axios';
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import {getCachedToken, setCachedToken} from './tokenCache.js' ; 
import crypto from "crypto";
import ejs from 'ejs';
import { getTfacTransporter } from '../../config/mailConfig.js';


// API v2 URLs (OAuth2 with Bearer token)
const INSTAMOJO_API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api.instamojo.com/v2' 
  : 'https://api.instamojo.com/v2';

const INSTAMOJO_AUTH_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.instamojo.com/oauth2/token/'
  : 'https://api.instamojo.com/oauth2/token/';

const INSTAMOJO_CLIENT_ID = process.env.INSTAMOJO_CLIENT_ID;
const INSTAMOJO_CLIENT_SECRET = process.env.INSTAMOJO_CLIENT_SECRET;
const INSTAMOJO_SALT = process.env.INSTAMOJO_SALT;

export const addOrder = async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      customer_pincode,
      product_id, 
      product_name,
      product_size,
      product_price,
      product_image,
      product_cause,
      order_quantity
    } = req.body;

    const trimmedCustomerPhone = customer_phone.trim();

    // 1️⃣ CHECK IF CUSTOMER EXISTS
    const { results: existingCustomer } = await readRecord({
      table: "tfac_customers tfac",
      selectFields: ["tfac.id"],
      conditions: [
        {
          field: "tfac.phone_number",
          operator: "=",
          value: trimmedCustomerPhone
        }
      ]
    });

    let customerId;

    if (existingCustomer.length === 0) {
      // CREATE NEW CUSTOMER
      const newCustomerColumns = [
        "full_name",
        "email",
        "phone_number",
        "shipping_address",
        "pincode"
      ];

      const newCustomerValues = [
        customer_name,
        customer_email,
        trimmedCustomerPhone,
        customer_address,
        customer_pincode
      ];

      await insertRecord(
        "tfac_customers",
        newCustomerColumns,
        newCustomerValues
      );

      const { results: newCustomer } = await readRecord({
        table: "tfac_customers tfac",
        selectFields: ["tfac.id"],
        conditions: [
          {
            field: "tfac.phone_number",
            operator: "=",
            value: trimmedCustomerPhone
          }
        ]
      });

      customerId = newCustomer[0].id;
    } else {
      customerId = existingCustomer[0].id;
    }

    // 2️⃣ GET ACCESS TOKEN
    const accessToken = await generateAccessToken();

    // 3️⃣ CREATE INSTAMOJO PAYMENT REQUEST (Using form-data format like the cURL)
    const formData = new URLSearchParams();
    formData.append('purpose', `TFAC Tshirt Purchase - for ${customer_name}` || 'Product Purchase');
    formData.append('amount', Number(product_price).toString()); //
    formData.append('buyer_name', customer_name);
    formData.append('email', customer_email);
    formData.append('phone', trimmedCustomerPhone);
    formData.append('redirect_url', process.env.NODE_ENV === 'production' 
      ? process.env.INSTAMOJO_REDIRECT_URL 
      : 'http://localhost:8080/payment-verification');
    formData.append('webhook', process.env.NODE_ENV === 'production'
      ? process.env.INSTAMOJO_WEBHOOK_URL 
      : 'https://urogenous-uninfused-janis.ngrok-free.dev/api/v1/tfac/verify-payment');
    formData.append('allow_repeated_payments', 'False');

    console.log('Creating payment request with access token', formData, accessToken);

    const instamojoResponse = await axios.post(
      `${INSTAMOJO_API_URL}/payment_requests/`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const paymentRequest = instamojoResponse.data;

    if (!paymentRequest.id) {
      console.error('Invalid response from Instamojo:', paymentRequest);
      return next(new ErrorHandler("Failed to create Instamojo payment request", 500));
    }

    // 4️⃣ INSERT INTO tfac_orders TABLE
    const orderColumns = [
      "customer_id",
      "customer_name", 
      "customer_email", 
      "shipping_address", 
      "pincode", 
      "customer_phone", 
      "product_id", 
      "product_name",
      "product_size",
      "quantity",
      "instamojo_payment_request_id",
      "order_id", 
      "subtotal", 
      "total",
      "notes"
    ];

    const orderNotes = {
      merchant: "TFAC", 
      customer_id: customerId,
      product_id: product_id || "test_product", 
      product_name: product_name || "test_product", 
      product_size: product_size || "test_product", 
      product_price: product_price || "test_product", 
      product_image: product_image || "test_product", 
      product_cause: product_cause || "test_product", 
      order_quantity: order_quantity || "test_product", 
      customer_name: customer_name || "test_product", 
      customer_email: customer_email || "test_product", 
      customer_phone: customer_phone || "test_product", 
      customer_address: customer_address || "test_product", 
      customer_pincode: customer_pincode || "test_product", 
    };

    const orderValues = [
      customerId,
      customer_name,
      customer_email,
      customer_address,
      customer_pincode,
      customer_phone,
      product_id || "test_product1",
      product_name,
      product_size,
      order_quantity, 
      paymentRequest.id,
      paymentRequest.id, 
      product_price,
      product_price,
      JSON.stringify(orderNotes)
    ];  

    const { results: finalOrder } = await insertRecord(
      "tfac_orders",
      orderColumns,
      orderValues
    );

    // 5️⃣ SEND RESPONSE WITH PAYMENT URL
    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      data: {
        paymentRequestId: paymentRequest.id,
        paymentUrl: paymentRequest.longurl, // Redirect user to this URL
        orderId: paymentRequest.id, 
        customerId,
      }
    });

  } catch (error) {
    console.error('Instamojo API Error:', error.response?.data || error.message);
    
    // If token expired, clear cache and retry once
    if (error.response?.status === 401) {
      console.log('Token might be expired, clearing cache...');
      accessTokenCache = { token: null, expiresAt: null };
    }
    
    return next(new ErrorHandler(error.response?.data?.message || "Internal Server Error", 500));
  }
};

export const verifyPayment = async (req, res, next) => {  
  try {
    // Extract webhook data
    const {
      payment_id,
      payment_request_id,
      status,
      mac,
    } = req.body;

    console.log(req.body); 

    if (!payment_id || !payment_request_id || !status) {
      console.error('Missing required webhook fields');
      return res.status(400).json({
        success: false,
        message: "Invalid webhook data - missing required fields"
      });
    }

    console.log(`Processing payment: ${payment_id} for request: ${payment_request_id}`);
    console.log(`Payment Status: ${status}`);

    console.log('Verifying payment with Instamojo API...');

    const accessToken = await generateAccessToken();
    console.log(accessToken, 'accesstoken'); 

    let paymentDetails;
    try {
      const response = await axios.get(
        `${INSTAMOJO_API_URL}/payments/${payment_id}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      paymentDetails = response.data;
      console.log('Payment details from Instamojo:', paymentDetails);

    } catch (apiError) {
      console.error('Failed to verify payment with Instamojo API:', apiError.response?.data || apiError.message);
      
      await updateRecord(
        "tfac_orders",
        {
          payment_status: "Verification Failed",
        },
        {
          order_id: payment_request_id
        }
      ).catch(err => console.error('Failed to log API verification failure:', err));

      return res.status(500).json({
        success: false,
        message: "Failed to verify payment with Instamojo"
      });
    }
    
    if (!paymentDetails || paymentDetails.status !== true) {
      await updateRecord(
        "tfac_orders",
        {
          payment_status: paymentDetails?.status === 'Failed' ? 'Verification Failed' : 'Pending',
          instamojo_payment_id: payment_id,
          instamojo_payment_request_id: payment_request_id,
          notes: JSON.stringify(paymentDetails),
          payment_signature: mac, 
        },
        {
          order_id: payment_request_id
        }
      );

      return res.status(200).json({
        success: false,
        message: `Payment status is ${paymentDetails?.status}, not successful`
      });
    }

    console.log('✅ Payment verified successfully - Status: Credit');

    // Update order in database
    console.log('Updating order in database...');

    const updateData = {
      payment_status: "Success",
      instamojo_payment_id: payment_id,
      instamojo_payment_request_id: payment_request_id,
      notes: JSON.stringify({
        payment_id: paymentDetails.id,
        payment_request_id: payment_request_id,
        status: paymentDetails.status == true ? 'Success' : 'Failed',
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        buyer_name: paymentDetails.buyer_name,
        buyer_email: paymentDetails.buyer_email,
        buyer_phone: paymentDetails.buyer_phone,
        fees: paymentDetails.fees,
        instrument_type: paymentDetails.instrument_type,
        payment_method: paymentDetails.payment_method,
        created_at: paymentDetails.created_at,
        verified_at: new Date().toISOString(),
        webhook_received_at: new Date().toISOString()
      })
    };

    await updateRecord(
      "tfac_orders",
      updateData,
      {
        order_id: payment_request_id
      }
    );

    console.log('✅ Order updated successfully');

    // Send response immediately
    res.status(200).json({
      success: true,
      message: "Payment verified and processed successfully"
    });

    // Send email after response (non-blocking)
    setImmediate(async () => {
      try {

        console.log(paymentDetails, payment_id, 'paymentDetails'); 
        if (paymentDetails.name) {
          const templateData = {
            customerName: paymentDetails.name,
            orderId: payment_request_id,
            paymentId: payment_id,
            amount: paymentDetails.amount,
            currency: 'INR',
            paymentMethod: paymentDetails.payment_method || 'Online Payment',
            orderDate: new Date(paymentDetails.created_at).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }),
            currentYear: new Date().getFullYear()
          };

          // Compile the handlebars template
          const emailHtml = await compileEmailTemplate('tfacOrderConfirmed', templateData);

          console.log*('emailHtml', emailHtml); 

          await getTfacTransporter().sendMail({
            from: "Tees For A Cause <info@teesforacause.co>",
            to: paymentDetails.email,
            cc: ["info@teesforacause.co", "accounts@balancenutrition.in"],
            subject: "Order Confirmation - Tees For A Cause",
            html: emailHtml,
          });

          console.log('✅ Order confirmation email sent successfully');
        }
      } catch (emailError) {
        console.error('Failed to send order confirmation email:', emailError);
        // Don't throw - email failure shouldn't affect the webhook response
      }
    });

  } catch (error) {
    console.error('Error:', error, error?.message);
    console.error('Stack:', error.stack);
   
    try {
      if (req.body?.payment_request_id) {
        await updateRecord(
          "tfac_orders",
          {
            payment_status: "Failed",
            notes: JSON.stringify({
              message: error.message,
              data: error.response?.data
            })
          },
          {
            order_id: req.body.payment_request_id
          }
        );
      }
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }

    return res.status(200).json({
      success: false,
      message: "Webhook received but processing failed",
      error: error.message
    });
  }
};


export const checkPaymentStatus = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    // Fetch order from database
    const { results: order } = await readRecord({
      table: "tfac_orders",
      selectFields: ["payment_status", "instamojo_payment_id", "order_id"],
      conditions: [
        {
          field: "order_id",
          operator: "=",
          value: paymentId
        }
      ]
    });

    if (!order || order.length === 0) {
      return next(new ErrorHandler("Order not found", 404));
    }

    return res.status(200).json({
      success: true,
      data: {
        payment_status: order[0].payment_status,
        order_id: order[0].order_id
      }
    });

  } catch (error) {
    console.error('Check Payment Status Error:', error.message);
    return next(new ErrorHandler("Failed to check payment status", 500));
  }
};

export const generateAccessToken = async () => {
  try {
    // Check cache first
    const cachedToken = await getCachedToken();
    if (cachedToken) return cachedToken;

    const response = await axios.post(
      INSTAMOJO_AUTH_URL,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: INSTAMOJO_CLIENT_ID,
        client_secret: INSTAMOJO_CLIENT_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = response.data;

    // cache token (seconds)
    await setCachedToken(access_token, expires_in);

    return access_token;

  } catch (error) {
    console.error(
      'Error generating access token:',
      error.response?.data || error.message
    );
    throw new Error('Failed to generate Instamojo access token');
  }
};

// Helper function to compile email templates
async function compileEmailTemplate(templateName, data) {
  const fs = require('fs').promises;
  const path = require('path');
  
  const templatePath = path.join(__dirname, '../../../../../src/mails/', `${templateName}.ejs`);
  return  ejs.renderFile(templatePath, data);
}