
import "dotenv/config";
import { sendOrderStatusUpdateNotification } from "../productDashboardController/productDashboardController.js";
import { createShipyaariOrder, generateInvoicePDF, generateMasterOrderId, generateProductOrderId, sendOrderConfirmEmail } from "./productPaymentUtil/productPaymentUtil.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import razorPay from "../../config/razorpayConfig.js";
import moment from "moment";
import { readRecord, insertRecord, updateRecord } from "../../config/query.js";
import { SMART_SCALE_PRICE, SMART_SCALE_PRICE_TO_BN, tables } from "../../helper/constant.js";
import { placeDrStoreOrder } from "../../services/drStoreIntegration.js";



export const createProductOrderController = async (req, res, next) => {
  try {
    const {
      amount,
      user_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      customer_city,
      customer_state,
      customer_country,
      customer_pincode,
      customer_landmark,
      payment_method,
      items,
      is_staff,
    } = req.body;

    if (!amount || !items?.length) {
      return next(new ErrorHandler("Missing order amount or items", 400));
    }

    let razorpayOrder = null;

    console.log("items", items);

    if (payment_method?.toLowerCase() === "online") {
      const options = {
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: "order_rcpt_" + Math.floor(Math.random() * 100000),
        notes: {
          user_id,
          customer_name,
          type: "product",
        },
      };

      razorpayOrder = await razorPay.orders.create(options);
    }


    // fetch the last master order id ; 
    const master_order_id = await generateMasterOrderId('online');
    const staff_order = is_staff ? 1 : 0;

    // Get sold_by information
    let sold_by = null;
    if (user_id) {
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.mentor_assigned",
          "ud.counsellor_assigned",
          "ud.user_type",
        ],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      });

      if (results?.length) {
        sold_by =
          results[0].user_type === "1"
            ? results[0].mentor_assigned
            : results[0].counsellor_assigned;
      }
    }

    // Group items by brand
    const itemsByBrand = items.reduce((acc, item) => {
      const brand = item.brand || "kilobeaters";
      if (!acc[brand]) acc[brand] = [];
      acc[brand].push(item);
      return acc;
    }, {});

    // Process each brand separately
    for (const brand of Object.keys(itemsByBrand)) {
      console.log(brand,'brand object');  
      const product_order_id = await generateProductOrderId(brand, 'online');

      for (const item of itemsByBrand[brand]) {
        console.log(item, item.brand, 'item object');
        await insertRecord(
          tables.product_orders,
          [
            "master_order_id",
            "product_order_id",
            "brand",
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
            "product_id",
            "product_code",
            "product_name",
            "quantity",
            "pack_size",
            "price_per_unit",
            "total_price",
            "created_at",
            "sold_by",
            "staff_order",
            "awb_number",
            "status",
            "razorpay_order_id",
            "payment_status",
          ],
          [
            master_order_id,
            product_order_id,
            brand,
            user_id || 0,
            customer_name,
            customer_phone,
            customer_address,
            customer_city,
            customer_state,
            customer_country,
            customer_pincode,
            customer_landmark,
            payment_method,
            amount,
            item.product_id,
            item.product_code,
            item.product_name,
            item.quantity,
            item.pack_size,
            item.price_per_unit,
            item.total_price,
            moment().format("YYYY-MM-DD HH:mm:ss"),
            sold_by,
            staff_order,
            "",
            "Pending",
            razorpayOrder?.id || null,
            "Pending",
          ]
        );
      }
    }


    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      master_order_id,
      razorpayOrder,
    });
  } catch (error) {
    console.error("Create Product Order Error:", error);
    return next(new ErrorHandler("Failed to create order", 500));
  }
};

export const verifyProductOrderPayment = async (res, next, payment) => {
  try {
    const razorpay_payment_id = payment.id;
    const razorpay_order_id = payment.order_id;

    const { results: orderRows } = await readRecord({
      table: `${tables.product_orders} po`,
      selectFields: [
        "po.master_order_id",
        "po.product_order_id",
        "po.brand",
        "po.user_id",
        "po.customer_name",
        "po.customer_phone",
        "po.customer_address",
        "po.customer_city",
        "po.customer_state",
        "po.customer_country",
        "po.customer_pincode",
        "po.customer_landmark",
        "po.payment_method", 
        "po.order_total",
        "po.sold_by",
        "po.staff_order",
        "po.payment_status",
        "po.razorpay_payment_id",
        "ud.email_id AS customer_email",
        "au.email_id as assigned_email"
      ],
      conditions: [
        { field: "po.razorpay_order_id", operator: "=", value: razorpay_order_id },
        { field: "po.payment_status", operator: "IN", value: "('Pending', 'Failed')", raw:true },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ud.user_id = po.user_id",
        },
       {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: "au.admin_user_id = (CASE WHEN ud.user_status='Active' THEN ud.mentor_assigned ELSE ud.counsellor_assigned END)",
        },
      ],
    });

    if (!orderRows.length) {
      return res.status(200).json({ message: "Order already processed" });
    }

    const result = await updateRecord(
      tables.product_orders,
      {
        payment_status: "Success",
        razorpay_payment_id: razorpay_payment_id,
      },
      { razorpay_order_id: razorpay_order_id, payment_status: ["Pending", "Failed"] }
    );

    if (result.affectedRows === 0) {
      return res.status(200).json({ message: "Order Already Processed" });
    }

    const primaryOrderMeta = orderRows[0];
    const ordersByProductOrder = orderRows.reduce((acc, row) => {
      if (!acc[row.product_order_id]) acc[row.product_order_id] = [];
      acc[row.product_order_id].push(row);
      return acc;
    }, {});

    const master_order_id = orderRows[0].master_order_id;
    const { results: allItems } = await readRecord({
      table: tables.product_orders,
      selectFields: [
        "product_order_id",
        "brand",
        "product_id",
        "product_code",
        "product_name",
        "quantity",
        "pack_size",
        "price_per_unit",
        "total_price",
      ],
      conditions: [
        { field: "razorpay_order_id", operator: "=", value: razorpay_order_id },
      ],
    });

    let kbInvoiceLink ;
    let drStoreInvoiceLink; 
    let kbPdfBuffer ; 
    let drStorePdfBuffer ; 
    let kbOrderId; 
    let drStoreOrderId; 
    let assignedEmail = primaryOrderMeta.assigned_email ;
    const attachmentInfo = {};
    const grandTotal = Math.max(0, allItems.reduce(
      (s, i) => s + Number(i.total_price || 0),
      0
    ));

    // Track brand composition for email logic
    let hasKbItems = false;
    let hasDrStoreItems = false;
    let kbItems = [];

    for (const productOrderId of Object.keys(ordersByProductOrder)) {
      const rows = ordersByProductOrder[productOrderId];
      const orderMeta = rows[0];
      const items = allItems.filter(item => item.product_order_id === productOrderId);

      if (orderMeta.brand === "kilobeaters") {
        hasKbItems = true;
        kbItems = items;
        attachmentInfo.kb = 1 ; 
        await createShipyaariOrder(
          orderMeta,
          items
        ); 

        await updateRecord(
        tables.product_orders,
        {
          status:'Pending',
          updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        { product_order_id: productOrderId }
        );

        const { invoiceLink:kbInvoice, pdfBuffer, grandTotal } = await generateInvoicePDF(
            orderMeta,
            items,
            master_order_id,
            'kb',
        );


        kbInvoiceLink = kbInvoice;
        kbPdfBuffer = pdfBuffer; 
        kbOrderId = productOrderId; 
        attachmentInfo.kbPdfBuffer = kbPdfBuffer;
        attachmentInfo.kbOrderId = kbOrderId;

      }

      if (orderMeta.brand === "doctorstore") {
        hasDrStoreItems = true;
        attachmentInfo.drStore = 1 ; 
        const { invoiceLink, pdfBuffer } = await generateInvoicePDF( orderMeta, items, master_order_id, 'doctorstore');
        drStorePdfBuffer = pdfBuffer;
        drStoreInvoiceLink = invoiceLink;
        drStoreOrderId = productOrderId;
        attachmentInfo.drStorePdfBuffer = drStorePdfBuffer;
        attachmentInfo.drStoreOrderId = drStoreOrderId;
        try {
          await placeDrStoreOrder(orderMeta, items);
          await updateRecord(
            tables.product_orders,
              {
                status:'Added in DrStore',
              },
              { product_order_id: productOrderId }
          );
        }
        catch(error) {
           await updateRecord(
            tables.product_orders,
              {
                status:'Error Adding on DrStore',
              },
              { product_order_id: productOrderId }
          );
          console.error("❌ Dr Store API Error:", error.response?.data || error.message);
        }
      }

    }

    console.log(attachmentInfo,'heyy'); 
    
    // Handle email sending based on order composition
    if (hasKbItems && hasDrStoreItems) {
      // Mixed order: Send 2 separate emails
      // 1. KB internal email (KB team + BN stakeholders, KB items only, no client)
      await sendOrderConfirmEmail(
        primaryOrderMeta, 
        master_order_id, 
        razorpay_payment_id, 
        assignedEmail, 
        kbItems, 
        attachmentInfo, 
        grandTotal,
        'kb_mixed'
      );
      
      // 2. Client email (client + BN stakeholders, all items)
      await sendOrderConfirmEmail(primaryOrderMeta, master_order_id, razorpay_payment_id, assignedEmail, allItems, attachmentInfo, grandTotal, 'general');
    } else if (hasKbItems) {
      // KB only order: Send to client + Shyama Kilobeaters
      await sendOrderConfirmEmail(
        primaryOrderMeta,
        master_order_id,
        razorpay_payment_id,
        assignedEmail,
        allItems,
        attachmentInfo,
        grandTotal,
        'only_kb'
      );
    } else if (hasDrStoreItems) {
      // DrStore only order: Send to client and BN stakeholders with all items
      await sendOrderConfirmEmail(primaryOrderMeta, master_order_id, razorpay_payment_id, assignedEmail, allItems, attachmentInfo, grandTotal, 'general');
    }

    await updateRecord( tables.product_orders,
       { 
        ...(kbInvoiceLink && { invoice: kbInvoiceLink }),
        ...(drStoreInvoiceLink && { overall_invoice: drStoreInvoiceLink })
       },
       { master_order_id: master_order_id } 
      );

    await updateRecord(
      tables.cart,
      { cart_code: null, cart_items: "[]" },
      { user_id: orderRows[0].user_id }
    );

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });

  } catch (error) {
    console.error("verifyProductOrderPayment error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const handleProductOrderPaymentFailed = async (res, payload) => {
  try {
    const payment = payload.payment.entity;
    const razorpay_order_id = payment.order_id;
    const razorpay_payment_id = payment.id;

    console.log(`Payment failed for order: ${razorpay_order_id}`);

    // Update order status to failed
    await updateRecord(
      tables.product_orders,
      {
        payment_status: "Failed",
        razorpay_payment_id: razorpay_payment_id,
        updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { razorpay_order_id: razorpay_order_id, payment_status:'Pending' }
    );

    return res.status(200).json({
      success: true,
      message: "Payment failure recorded",
    });
  } catch (error) {
    console.error("Error in payment.failed handler:", error);
    return res.status(500).json({ error: "Failed to process payment failure" });
  }
};

export const createManualDoctorStoreOrder = async (req, res, next) => {
  try {
    const {
      user_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      city_id,
      state_id,
      country_id,
      customer_pincode,
      customer_landmark,
      quantity,
    } = req.body;

    if (!customer_name || !customer_phone || !customer_address || !city_id || !state_id || !country_id || !customer_pincode) {
      return next(new ErrorHandler("Missing required customer address fields", 400));
    }

    if (!quantity || quantity <= 0) {
      return next(new ErrorHandler("Valid quantity is required", 400));
    }

    const {results} = await readRecord({
      table: `${tables.cities} ct`,
      selectFields: ["ct.city_name as customer_city", "st.state_name as customer_state", "c.country_name as customer_country"],
      conditions: [{ field: "ct.city_id", operator: "=", value: city_id }],
      joins: [
        {
            type: "LEFT",
            table: `${tables.states} st`,
            on: "st.state_id = ct.state_id",
          },
          {
            type: "LEFT",
            table: `${tables.countries} c`,
            on: "c.country_id = st.country_id"
          }
        ],
    })

    console.log(results,'results');

    if (!results || results.length === 0) {
      return next(new ErrorHandler("Invalid city, state, or country ID", 400));
    }

    const customer_city = results[0].customer_city;
    const customer_state = results[0].customer_state;
    const customer_country = results[0].customer_country;
    const master_order_id = await generateMasterOrderId('online');
    const product_order_id = await generateProductOrderId('doctorstore', 'online');

    const total_price = SMART_SCALE_PRICE * Number(quantity || 1);
    let sold_by = null;
    if (user_id) {
      const { results } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.mentor_assigned",
          "ud.counsellor_assigned",
          "ud.user_type",
        ],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      });

      if (results?.length) {
        sold_by =
          results[0].user_type === "1"
            ? results[0].mentor_assigned
            : results[0].counsellor_assigned;
      }
    }

    const manualOrderId = "manual_" + Date.now();

    // Prepare order metadata for DrStore API
    const orderMeta = {
      product_order_id: product_order_id,
      customer_name: customer_name,
      customer_email: customer_email || "",
      customer_phone: customer_phone,
      customer_address: customer_address,
      customer_city: customer_city,
      customer_state: customer_state,
      customer_country: customer_country,
      customer_landmark: customer_landmark || "",
      customer_pincode: customer_pincode,
      payment_method: 'online',
      staff_order:0, 
    };

    const items = [
      {
        quantity: Number(quantity),
        product_slug: "bn-bodyscan-smart-scale",
        product_sku: "BN-DR-1",
      },
    ];

    let drStoreResponse = null;
    let orderStatus = "Pending";
    let awbNumber = "";
    let errorMessage = null;
    
    try {
      drStoreResponse = await placeDrStoreOrder(orderMeta, items);
      orderStatus = "Added in DrStore";
      awbNumber = drStoreResponse?.tracking_number || drStoreResponse?.awb || "";
      
      console.log("✅ DoctorStore order placed successfully:", drStoreResponse);

    } catch (error) {
      orderStatus = "Error Adding on DrStore";
      errorMessage = error.message || "Failed to place order on DrStore";
      
      console.error("❌ Dr Store API Error:", error.response?.data || error.message);
    }

    // Insert into database
      await insertRecord(
      tables.product_orders,
      [
        "master_order_id",
        "product_order_id",
        "brand",
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
        "product_id",
        "product_code",
        "product_name",
        "quantity",
        "pack_size",
        "price_per_unit",
        "total_price",
        "created_at",
        "sold_by",
        "staff_order",
        "status",
        "payment_status",
        "razorpay_payment_id",
        "razorpay_order_id",
        "awb_number",
      ],
      [
        master_order_id,
        product_order_id,
        "doctorstore",
        user_id || 0,
        customer_name,
        customer_phone,
        customer_address,
        customer_city,
        customer_state,
        customer_country,
        customer_pincode,
        customer_landmark || "",
        "online",
        total_price,
        'bn-bodyscan-smart-scale',
        'PROD_011',
        'BN BodyScan Smart Scale',
        quantity,
        'Single Unit',
        SMART_SCALE_PRICE,
        total_price,
        moment().format("YYYY-MM-DD HH:mm:ss"),
        sold_by,
        0,
        orderStatus,
        "Success",
        manualOrderId,
        manualOrderId,
        awbNumber,
      ]
    );

    const invoiceItems = [
      {
        product_order_id: product_order_id,
        brand: "doctorstore",
        product_id: 'bn-bodyscan-smart-scale',
        product_code: 'PROD_011',
        product_name: 'BN BodyScan Smart Scale',
        quantity: quantity,
        pack_size: 'Single Unit',
        price_per_unit: SMART_SCALE_PRICE,
        total_price: total_price,
      }
    ];

    const grandTotal = total_price;

    // Generate invoice PDF
    let invoiceLink = null;
    let pdfBuffer = null;
    
    try {
      const invoiceData = await generateInvoicePDF(
        orderMeta,
        invoiceItems,
        master_order_id,
        'doctorstore'
      );
      
      invoiceLink = invoiceData.invoiceLink;
      pdfBuffer = invoiceData.pdfBuffer;
      
      console.log("✅ Invoice generated successfully:", invoiceLink);
    } catch (error) {
      console.error("❌ Invoice generation error:", error);
    }

    // Send order confirmation email
    try {
      const attachmentInfo = {
        drStorePdfBuffer: pdfBuffer,
        drStoreOrderId: product_order_id,
      };

      await sendOrderConfirmEmail(
        orderMeta,
        product_order_id,
        manualOrderId, 
        "", 
        invoiceItems,
        attachmentInfo,
        grandTotal,
        'doctorstore'
      );
      
      console.log("✅ Order confirmation email sent successfully");
    } catch (error) {
      console.error("❌ Email sending error:", error);
    }

    if (invoiceLink) {
      try {
        await updateRecord(
          tables.product_orders,
          { 
            overall_invoice: invoiceLink,
            updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
          },
          { product_order_id: product_order_id }
        );
        
        console.log("✅ Invoice link updated in database");
      } catch (error) {
        console.error("❌ Invoice link update error:", error);
      }
    }

    return res.status(200).json({
      success: true,
      message: errorMessage 
        ? "Order created in DB but failed to place on DrStore" 
        : "Order created and placed on DrStore successfully",
      data: {
        master_order_id,
        product_order_id,
        status: orderStatus,
        invoice_link: invoiceLink,
        drstore_response: drStoreResponse,
        ...(errorMessage && { error: errorMessage }),
      },
    });

  } catch (error) {
    console.error("Create Manual DoctorStore Order Error:", error);
    return next(new ErrorHandler("Failed to create manual DoctorStore order", 500));
  }
};