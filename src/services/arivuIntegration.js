import axios from "axios";

// Arivu Foods API Configuration
const ARIVU_BASE_URL = process.env.ARIVU_BASE_URL || "https://arivufoods-server-s-v1.onrender.com";
const ARIVU_API_KEY = process.env.ARIVU_API_KEY;

// Create axios instance for Arivu Foods API
const arivuClient = axios.create({
  baseURL: ARIVU_BASE_URL,
  headers: {
    'x-bn-api-key': ARIVU_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Helper function to handle API errors
const handleArivuError = (error, operation) => {
  console.error(`Arivu Foods ${operation} Failed:`, error?.response?.data || error.message);
  
  if (error?.response?.status === 401) {
    throw new Error("Missing or invalid API key for Arivu Foods");
  } else if (error?.response?.status === 403) {
    throw new Error("Invalid API key for Arivu Foods");
  } else if (error?.response?.status === 404) {
    throw new Error("Resource not found in Arivu Foods");
  } else if (error?.response?.status === 400) {
    throw new Error(`Bad request: ${error?.response?.data?.message || 'Invalid data provided'}`);
  }
  
  throw new Error(`Arivu Foods ${operation} failed`);
};

/**
 * Get all active products from Arivu Foods
 * @returns {Promise<Array>} Array of products
 */
export const getArivuProducts = async () => {
  try {
    const response = await arivuClient.get('/api/bn/products');
    
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Failed to fetch products');
    }
    
    console.log(`Fetched ${response.data.data?.length || 0} products from Arivu Foods`);
    return response.data.data;
    
  } catch (error) {
    handleArivuError(error, 'Products Fetch');
  }
};

/**
 * Get a specific product by ID from Arivu Foods
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} Product details
 */
export const getArivuProductById = async (productId) => {
  if (!productId) {
    throw new Error("Product ID is required");
  }
  
  try {
    const response = await arivuClient.get(`/api/bn/products/${productId}`);
    
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Failed to fetch product');
    }
    
    return response.data.data;
    
  } catch (error) {
    handleArivuError(error, 'Product Fetch');
  }
};

/**
 * Create a new order in Arivu Foods
 * @param {Object} orderData - Order data
 * @param {string} orderData.bnReferenceId - Your unique reference ID
 * @param {string} [orderData.paymentId] - Payment gateway transaction ID
 * @param {Array} orderData.cartItems - Array of cart items
 * @param {Object} orderData.customerInfo - Customer information
 * @param {string} [orderData.notes] - Additional notes
 * @returns {Promise<Object>} Created order details
 */
export const createArivuOrder = async (orderData) => {
  const { bnReferenceId, paymentId, cartItems, customerInfo, notes } = orderData;
  
  // Validate required fields
  if (!bnReferenceId) {
    throw new Error("BN Reference ID is required");
  }
  
  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error("Cart items are required and must be a non-empty array");
  }
  
  if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
    throw new Error("Customer name and phone are required");
  }
  
  // Validate cart items
  cartItems.forEach((item, index) => {
    if (!item.productId || !item.weight || !item.quantity) {
      throw new Error(`Cart item ${index + 1} is missing required fields (productId, weight, quantity)`);
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new Error(`Cart item ${index + 1} quantity must be a positive number`);
    }
  });
  
  try {
    const payload = {
      bnReferenceId,
      paymentId,
      cartItems: cartItems.map(item => ({
        productId: item.productId,
        weight: item.weight,
        quantity: Number(item.quantity)
      })),
      customerInfo: {
        name: customerInfo.name,
        email: customerInfo.email || '',
        phone: customerInfo.phone,
        street: customerInfo.street || '',
        city: customerInfo.city || '',
        state: customerInfo.state || '',
        pincode: customerInfo.pincode || null,
        country: customerInfo.country || 'India'
      },
      notes: notes || ''
    };
    
    const response = await arivuClient.post('/api/bn/orders', payload);
    
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Failed to create order');
    }
    
    console.log(`Arivu Foods order created successfully: ${response.data.data?.orderId}`);
    return response.data.data;
    
  } catch (error) {
    handleArivuError(error, 'Order Creation');
  }
};

/**
 * Get all orders (excluding delivered) from Arivu Foods
 * @returns {Promise<Array>} Array of orders
 */
export const getArivuOrders = async () => {
  try {
    const response = await arivuClient.get('/api/bn/orders');
    
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Failed to fetch orders');
    }
    
    console.log(`Fetched ${response.data.data?.length || 0} orders from Arivu Foods`);
    return response.data.data;
    
  } catch (error) {
    handleArivuError(error, 'Orders Fetch');
  }
};

/**
 * Get order status by ID from Arivu Foods
 * @param {string} orderId - Order ID, MongoDB ID, or BN Reference ID
 * @returns {Promise<Object>} Order details
 */
export const getArivuOrderStatus = async (orderId) => {
  if (!orderId) {
    throw new Error("Order ID is required");
  }
  
  try {
    const response = await arivuClient.get(`/api/bn/orders/${orderId}`);
    
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Failed to fetch order status');
    }
    
    return response.data.data;
    
  } catch (error) {
    handleArivuError(error, 'Order Status Fetch');
  }
};

/**
 * Check if a product is available and in stock
 * @param {string} productId - Product ID
 * @param {string} weight - Variant weight
 * @returns {Promise<Object>} Product availability info
 */
export const checkArivuProductAvailability = async (productId, weight) => {
  try {
    const product = await getArivuProductById(productId);
    
    if (!product.isActive) {
      return {
        available: false,
        reason: 'Product is not active'
      };
    }
    
    const variant = product.variants.find(v => v.weight === weight);
    
    if (!variant) {
      return {
        available: false,
        reason: `Variant with weight '${weight}' not found`
      };
    }
    
    if (!variant.inStock) {
      return {
        available: false,
        reason: 'Variant is out of stock'
      };
    }
    
    return {
      available: true,
      variant: {
        _id: variant._id,
        weight: variant.weight,
        price: variant.price,
        gst: product.gst
      }
    };
    
  } catch (error) {
    return {
      available: false,
      reason: error.message
    };
  }
};

/**
 * Calculate order total including GST
 * @param {Array} cartItems - Array of cart items with product details
 * @returns {Promise<number>} Total amount including GST
 */
export const calculateArivuOrderTotal = async (cartItems) => {
  let totalAmount = 0;
  
  for (const item of cartItems) {
    const availability = await checkArivuProductAvailability(item.productId, item.weight);
    
    if (!availability.available) {
      throw new Error(`Product ${item.productId} with weight ${item.weight} is not available: ${availability.reason}`);
    }
    
    const variant = availability.variant;
    const itemTotal = (variant.price + (variant.price * variant.gst / 100)) * item.quantity;
    totalAmount += itemTotal;
  }
  
  return Math.round(totalAmount * 100) / 100; // Round to 2 decimal places
};
