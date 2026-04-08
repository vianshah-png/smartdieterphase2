import razorpay from "razorpay";

import "dotenv/config";
const razorPay = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY,
});

export default razorPay;