import "dotenv/config";
import moment from "moment";
import razorPay from "../config/razorpayConfig.js";
import { currencyConversionRates } from "../helper/constant.js";

import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";

const createPaymentLink = async ({
  amount,
  currency = "INR",
  expire_by,
  description,
  source,
  notes,
  customerDetails,
  no_callback_url=false 
}) => {

  const defaultCallbackUrl = `${process.env.BACKEND_URL}/api/v1/payment/verify`;
  try {
    const conversionRate = currencyConversionRates[currency];

    if (!conversionRate) {
      throw new Error(
        `Unsupported currency: ${currency}. Please use INR or USD.`
      );
    }
    if (!expire_by) {
      expire_by = moment().add(2, "days").endOf("day").unix();
    }
    // expire_by = moment.unix(expire_by).add(1, "days").endOf("day").unix();
    expire_by = moment.unix(expire_by)   // start from Unix seconds
  .utcOffset("+05:30")                       // add one day
  .set({ hour: 23, minute: 55, second: 0 }) // force 23:55
  .unix();
    const paymentLink = await razorPay.paymentLink.create({
      amount: amount * conversionRate,
      currency: currency,
      description,
      expire_by: expire_by,
      customer: customerDetails,
      reference_id: `${source?source:"DB"} ${Date.now()}`,
      notes,
      reminder_enable: false,
      notify: {
        sms: false,
        email: false,
      },
      ...(no_callback_url !== true && { callback_url: defaultCallbackUrl }),
    });
    return paymentLink;
  } catch (error) {
    console.error(error);
    throw new Error("Unable to create payment link. Please try again.");
  }
};
const verifyRazorpaySignature = async (req) => {
  const {
    razorpay_payment_id,
    razorpay_payment_link_status,
    razorpay_signature,
    razorpay_payment_link_reference_id,
    razorpay_payment_link_id,
  } = req.query;

  const result = validatePaymentVerification(
    {
      payment_link_id: razorpay_payment_link_id,
      payment_id: razorpay_payment_id,
      payment_link_reference_id: razorpay_payment_link_reference_id,
      payment_link_status: razorpay_payment_link_status,
    },
    razorpay_signature,
    process.env.RAZORPAY_SECRET_KEY
  );
  if (!result) {
    throw new Error("Invalid Signature");
  }
  return result;
};

export { createPaymentLink, verifyRazorpaySignature };
