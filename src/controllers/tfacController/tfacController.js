

import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";



export const getAllOrders = async (req, res, next) => {
  try {


    // check key: 
    const { secret_key } = req.headers;
    const { page, limit, search, status } = req.query;


    const pagination = {
      page: page ? page : 1,
      limit: limit ? limit : 10,
    };

    // if (!secret_key || (secret_key!=='tfac-1108-dashboard')) {
    //   return next(new ErrorHandler("Unauthorized", 401));
    // }

    const { results: orders, totalCount } = await readRecord({
      table: "tfac_orders tfac",
      selectFields: ["tfac.customer_name", "tfac.customer_phone", "tfac.customer_email", "tfac.shipping_address", "tfac.pincode", "tfac.order_id", "tfac.instamojo_payment_id", "tfac.payment_status", "tfac.created_at", "tfac.updated_at as payment_date", "tfac.product_name", 'tfac.product_size', 'tfac.quantity', 'tfac.total as paid_amount'],
      conditions: [
        ...(status && status!='all' ? [{field: "tfac.payment_status", operator: "=", value: status}] : [])
      ].filter(Boolean),
      orderBy: ["tfac.created_at DESC"],
      pagination: pagination,
      countTotal: true,
      search: {
            searchQuery: search,
            searchFields: [
              "tfac.customer_name",
              "tfac.customer_email",
              "tfac.customer_phone",
              "tfac.shipping_address",
              "tfac.order_id",
            ],
          },
        });

    
    if (orders.length>0) {
        orders.forEach(order => {
            order.product = {
                name: order.product_name,
                size: order.product_size,
                quantity: order.quantity,
            }
            delete order.product_name;
            delete order.product_size;
            delete order.quantity;
        });
    }

    console.log(totalCount, "TOTAL COUNT") ; 

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
      totalPages: Math.ceil(totalCount / limit),
      totalItems: totalCount,   
    }); 

  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getCustomers = async (req, res, next) => {
  try {


    // check key: 

    const { secret_key } = req.headers;
    const { page, limit, search, status } = req.query;

    const pagination = {
      page: page ? page : 1,
      limit: limit ? limit : 10,
    };

    // if (!secret_key || (secret_key!=='tfac-1108-dashboard')) {
    //   return next(new ErrorHandler("Unauthorized", 401));
    // }

    const { results: customers, totalCount } = await readRecord({
      table: "tfac_customers tfac",
      selectFields: ["tfac.id as customer_id", "tfac.full_name as customer_name", "tfac.email as customer_email", "tfac.phone_number as customer_phone", "tfac.shipping_address", "tfac.pincode", "COUNT(orders.id) as total_orders"],
      joins: [
        {
            table: "tfac_orders orders",
            type: "LEFT",
            on: "tfac.id = orders.customer_id"
        }
      ],      
      conditions: [
        {
            field: "orders.payment_status",
            operator: "=",
            value: "Success"
        }
      ],
      groupBy: ["tfac.id"],
      pagination: pagination,
      countTotal: true,
      search: {
            searchQuery: search,
            searchFields: [
              "tfac.full_name",
              "tfac.email",
              "tfac.phone_number",
              "tfac.shipping_address",
              "tfac.pincode",
            ],
          },
        });

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: customers,
      totalPages: Math.ceil(totalCount / limit),
      totalItems: totalCount,   
    }); 

  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addProduct = async (req, res, next) => {
  try {
    const { product_name, price, designer, cause, discount_percent, final_price, sizes, description } = req.body;
    const image = req.file ; 

    // upload to cloudinary ;

    if (!product_name || !price || !description || !image || !designer || !cause || !discount_percent || !final_price || !sizes) 
      {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const productColumns = [
      "product_name",
      "price",
      "designer",
      "cause",
      "discount_percent",
      "final_price",
      "sizes",
      "description",
      "image",
    ];
    const newProduct = [
      product_name,
      price,
      designer,
      cause,
      discount_percent,
      final_price,
      sizes,
      description,
      image?.path,
    ]

    const { results: product } = await insertRecord(
      "tfac_products",
      productColumns,
      newProduct
    );
   
    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: product,
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getProducts = async(req,res,next)=>{
 try {
    const { secret_key } = req.headers;
    const { page, limit, search } = req.query;

    const pagination = {
      page: page ? page : 1,
      limit: limit ? limit : 10,
    };

    // if (!secret_key || (secret_key!=='tfac-1108-dashboard')) {
    //   return next(new ErrorHandler("Unauthorized", 401));
    // }

    const { results: products, totalCount } = await readRecord({
      table: "tfac_products tfac",
      selectFields: ["tfac.id as product_id", "tfac.product_name", "tfac.price", "tfac.designer", "tfac.cause", "tfac.discount_percent", "tfac.final_price", "tfac.sizes", "tfac.description", "tfac.image"],
      orderBy: ["tfac.created_at DESC"],
      pagination: pagination,
      countTotal: true,
      search: {
            searchQuery: search,
            searchFields: [
              "tfac.product_name",
              "tfac.designer",
              "tfac.cause",
            ],
          },
        });

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: products,
      totalPages: Math.ceil(totalCount / limit),
      totalItems: totalCount,   
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
}