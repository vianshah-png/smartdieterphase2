//This file contains common function which are used across every other module.

import { readRecord } from "../config/query.js";
import { tables } from "./constant.js";

//Function for removing keys from object having null value
function filterObjectRemoveNullValues(obj) {
  const filteredObj = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== null) {
      filteredObj[key] = obj[key];
    }
  });
  return filteredObj;
}

//Function to get current date and time in YYYY-MM-DD H:I:S Format

function getCurrentDateTime() {
  const now = new Date();

  // Extract date components
  const year = now.getFullYear();
  let month = now.getMonth() + 1; // Months are zero indexed
  let day = now.getDate();

  // Add leading zeros if needed
  month = month < 10 ? `0${month}` : month;
  day = day < 10 ? `0${day}` : day;

  // Extract time components
  let hours = now.getHours();
  let minutes = now.getMinutes();
  let seconds = now.getSeconds();

  // Add leading zeros if needed
  hours = hours < 10 ? `0${hours}` : hours;
  minutes = minutes < 10 ? `0${minutes}` : minutes;
  seconds = seconds < 10 ? `0${seconds}` : seconds;

  // Construct the formatted date and time string
  const dateTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  return dateTimeString;
}

//Funtion to add Days to date
function addDaysToDate(date, daysToAdd) {
  const result = new Date(date);
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

//function to calculate age
function calculateAge(birthdate) {
  if (!birthdate) return null; // Handle null or undefined birthdate
  var birthDate = new Date(birthdate);
  var currentDate = new Date();
  var timeDiff = currentDate.getTime() - birthDate.getTime();
  var age = Math.floor(timeDiff / (1000 * 3600 * 24 * 365.25));
  return age;
}

//function to add Hours to time
function addHoursToTime(timeString, hoursToAdd) {
  // Parse the time string to get hours and minutes
  let time = new Date(`1970-01-01T${timeString}`);

  // Add hours to the time
  time.setHours(time.getHours() + hoursToAdd);

  // Format the new time
  let hours = time.getHours().toString().padStart(2, "0");
  let minutes = time.getMinutes().toString().padStart(2, "0");

  return `${hours}:${minutes}`;
}
function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are zero-based, so add 1 and pad with leading zero if needed
  const day = String(today.getDate()).padStart(2, "0"); // Pad with leading zero if needed

  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const formatZodErrors = (error, res) => {
  return res.status(422).json({
    success: false,
    message: "Invalid Data Inputed",
    error: error.issues.map((e) => ({
      [e.path[0]]: e.message,
    })),
  });
};

class CustomDate {
  constructor(date) {
    this.date = date instanceof Date ? date : new Date(date);
  }

  getFormattedDate() {
    const year = this.date.getFullYear();
    const month = String(this.date.getMonth() + 1).padStart(2, "0");
    const day = String(this.date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  getDateObject() {
    return this.date;
  }
}

function generateRandomFourDigitNumber() {
  return Math.floor(1000 + Math.random() * 9000);
}

export const fetchLocationData = async (field, userId) => {
  const { results } = await readRecord({
    table: `${tables.userDetails} ud`,
    selectFields: [`ud.${field}`],
    conditions: [{ field: "ud.user_id", operator: "=", value: userId }],
  });
  return results[0][field];
};

const mapCallType = (call_type) => {
  switch (String(call_type)) {
    case "0":
      return "welcome (program induction) call";
    case "1":
      return "progress call";
    case "2":
      return "feedback call";
    case "3":
      return "Induction Call ";
    case "4":
      return "Service Call ";
    case "6":
      return "Book by Mentor";
    case "10":
      return "Change of Mentor Call";
    case "11":
      return "Extra Call (Engagement)";
    case "12":
      return "Pitching Call";
    case "13":
      return "Bad Feedback Call";
    case "14":
      return "Follow up Call";
    case "15":
      return "Overdue Call (Weight / any other)";
    case "16":
      return "Dormant Call";
    case "17":
      return "On hold OD Call";
    case "18":
      return "Follow up for Renewal Call";
    case "19":
      return "Any Other Call";
    case "20":
      return "Concern Call";
    case "21":
      return "Head Nutritionist Concern Call";
    case "23":
      return "Poor Rating Call";
    case "24":
      return "Poor Weight Loss Call";
    case "25":
      return "Nutrition Manager Less Loss Call";
    case "26":
      return "Nutrition Manager Poor Rating Call";
    case "30":
      return "Consultation Call";
    case "31":
      return "Less Loss Call";
    case "32":
      return "Diet Feedback Call";
    case "45":
      return "Extra Call";
    case "66":
        return "Introduction Call";
    case "68":
        return "Lead Welcome Call";
    default:
      return "Default Call";
  }
};
const getSourceNameLabel = ({ source_group }) => {
  const leadSources = {
    1: "HSL",
    2: "Website",
    3: "Social Media Organic",
    4: "Direct Sources",
    5: "Referral",
    6: "Paid Campaigns",
  };

  return leadSources[source_group] || null;
};

const getDormancyWhatsappMessage = ({ level, data }) => {
  let message = ``;
  if (level && level === 0) {
    message = `Hello ${data.client_name}, Your weight update for the last diet session is OVERDUE. Please fill it out ASAP.Please message back in case you are stuck. Click below to fill now : https://www.balancenutrition.in/app_link/screen_id=2 Client Service Team`;
  } else {
    message = `Hello ${data.client_name}, Your membership with us is about to expire!! Your program ${data.current_program_name} has only ${data.current_program_validity} of validity left and you have ${data.current_program_pending_sessions} sessions pending. Start again ASAP. Write back to me in case you have any doubts. Client Service Team Balance Nutrition! Click Below to update your Weight: https://www.balancenutrition.in/app_link/screen_id=2`;
  }
  return { message };
};

const applyNonNegative = (value) => Math.max(0, value);

const safeJSONParse = (str, defaultValue = null) => {
  if (typeof str !== "string") return defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
};
const discountCalculator = ({
  sessionData = {},
  programData = {},
  userWallet = 0,
  offerLogs = [],
  couponsParsed = [],
}) => {
  // Utility to ensure non-negative values
  const applyNonNegative = (value) => Math.max(0, Number(value) || 0);

  // Find applicable offer log
  const applicableOfferLog = offerLogs.find(
    (ol) =>
      Number(ol?.session_id) === Number(sessionData?.program_session_id) &&
      Number(ol?.program_id) === Number(programData?.program_id)
  );
  console.log(applicableOfferLog, sessionData, 239);
  // Initialize discountDetails with default values
  let discountDetails = {
    ...sessionData,
    discount: false,
    discounted_amount: 0,
    discounted_percentage: 0,
    discount_amount: 0,
    discount_percentage: applicableOfferLog
      ? `${Number(applicableOfferLog.discount_percent) || 0}`
      : null,
    coupon_discount: false,
    coupon_code: null,
    coupon_discount_type: null,
    coupon_amount: null,
    discounted_amount_with_coupon: 0,
    discounted_percentage_with_coupon: 0,
    wallet_discount: 0,
    discounted_amount_with_wallet: 0,
    discounted_percentage_with_wallet: 0,
    discounted_amount_with_coupon_with_wallet: 0,
    discounted_percentage_with_coupon_with_wallet: 0,
    with_wallet: 0,
    with_coupon_with_wallet: 0,
    final_amount: 0,
    final_coupon_amount: 0,
    final_wallet_amount: 0,
  };
  // if (sessionData?.program_duration == "30 Day") {
  //   return discountDetails;
  // }
  // Base MRP with fallback to 0
  const baseMRP = Number(sessionData?.mrp) || 0;

  // If no offer_id, return baseMRP as final amount
  if (!programData?.offer_id) {
    discountDetails.final_amount = baseMRP;
    return discountDetails;
  }

  // Wallet amount with fallback
  const wallet = Number(userWallet) || 0;
  const isAllProgram = Number(programData?.is_all_program) === 1;

  // Calculate base discount (offer-based)
  const calculateBaseDiscount = () => {
    if (!applicableOfferLog && !isAllProgram) return 0;

    let discountAmount = 0;
    if (applicableOfferLog) {
      discountAmount = Number(applicableOfferLog?.discount_amount) || 0;
      discountDetails.discount_amount = discountAmount;
    } else {
      discountAmount = Number(programData?.offer_discount_amount) || 0;
      discountDetails.discount_amount = discountAmount;
    }

    return Math.ceil(discountAmount);
  };

  // Calculate coupon discount
  const calculateCouponDiscount = (
    couponType,
    couponQuantity,
    isCouponMatch
  ) => {
    if (!isCouponMatch) return 0;
    if (couponType === 0) {
      return Number(couponQuantity) || 0;
    } else if (couponType === 1) {
      return applyNonNegative((baseMRP * (Number(couponQuantity) || 0)) / 100);
    }
    return 0;
  };

  // Calculate percentage from discount amount
  const calculateDiscountPercentage = (discountAmount) => {
    if (baseMRP === 0 || !discountAmount) return 0;
    return Number(((discountAmount / baseMRP) * 100).toFixed(2));
  };

  // Core calculations
  let offerType = Number(programData?.offer_type) || 0;
  const baseDiscount = calculateBaseDiscount();
  const walletDeduction = Math.min(wallet, baseMRP);

  // Check for coupon match
  const isCouponMatch = couponsParsed.some(
    (c) =>
      Number(c?.program_session_id) === Number(sessionData?.program_session_id)
  );

  // Calculate coupon discount
  const couponDiscount = calculateCouponDiscount(
    Number(programData?.coupon_type) || 0,
    programData?.coupon_quantity || 0,
    isCouponMatch
  );

  // Populate coupon-related details
  const couponDetails = {
    coupon_discount: [3, 6, 11].includes(offerType) ? true : !!isCouponMatch,
    coupon_code:
      [3, 6, 11].includes(offerType) || isCouponMatch
        ? programData?.coupon_code || null
        : null,
    coupon_discount_type: [3, 6, 11].includes(offerType)
      ? "Auto"
      : isCouponMatch
      ? Number(programData?.coupon_type) === 0
        ? "Amount"
        : "Percent"
      : null,
    coupon_amount:
      isCouponMatch || [3, 6, 11].includes(offerType)
        ? `${programData?.coupon_quantity || 0}${
            Number(programData?.coupon_type) === 1 ? "%" : ""
          }`
        : null,
  };

  // Set discount flag based on offerType
  discountDetails.discount = [1, 2, 3, 4, 5, 6].includes(offerType);

  // Update discountDetails with base discount and percentage
  discountDetails.discounted_amount = applyNonNegative(baseDiscount);
  discountDetails.discounted_percentage =
    calculateDiscountPercentage(baseDiscount);
  // if (sessionData?.program_duration != "30 Day") {
  //   discountDetails.wallet_discount = walletDeduction;
  // }
  if (offerType === 0) {
    discountDetails.wallet_discount = 0;
  }
  if (!applicableOfferLog) {
    offerType = null;
  }
  console.log(offerType, "offerType");
  Object.assign(discountDetails, couponDetails);

  // Handle final amounts and percentages based on offerType
  switch (offerType) {
    case 1:
      discountDetails.final_amount = Math.ceil(baseMRP - baseDiscount);
      break;

    case 2:
    case 3:
      if (couponDetails.coupon_discount) {
        discountDetails.discounted_amount_with_coupon = applyNonNegative(
          baseDiscount + couponDiscount
        );
        discountDetails.discounted_percentage_with_coupon =
          calculateDiscountPercentage(
            discountDetails.discounted_amount_with_coupon
          );
        discountDetails.final_amount = Math.ceil(
          baseMRP - discountDetails.discounted_amount_with_coupon
        );
      } else {
        discountDetails.final_amount = Math.ceil(baseMRP - baseDiscount);
      }
      break;

    case 4:
      if (sessionData?.program_duration == "30 Day") {
        discountDetails.final_amount = Math.ceil(baseMRP - baseDiscount);
      } 
      // else if (
      //   sessionData?.program_duration == "60 Day" &&
      //   Number(programData?.program_id) !== 134
      // ) {
      //   discountDetails.final_amount = Math.ceil(baseMRP - baseDiscount);
      // } 
      else {
        discountDetails.discounted_amount = applyNonNegative(
          baseDiscount + walletDeduction
        );
        discountDetails.discounted_percentage = calculateDiscountPercentage(
          discountDetails.discounted_amount
        );
        discountDetails.discounted_amount_with_wallet = applyNonNegative(
          baseDiscount + walletDeduction
        );
        discountDetails.discounted_percentage_with_wallet =
          calculateDiscountPercentage(
            discountDetails.discounted_amount_with_wallet
          );
        discountDetails.final_amount = Math.ceil(
          baseMRP - baseDiscount - walletDeduction
        );
        discountDetails.wallet_discount = walletDeduction;
      }
      break;

    case 5:
    case 6:
      if (couponDetails.coupon_discount) {
        discountDetails.discounted_amount_with_coupon_with_wallet =
          applyNonNegative(baseDiscount + couponDiscount + walletDeduction);
        discountDetails.discounted_percentage_with_coupon_with_wallet =
          calculateDiscountPercentage(
            discountDetails.discounted_amount_with_coupon_with_wallet
          );
        discountDetails.final_amount = Math.ceil(
          baseMRP - discountDetails.discounted_amount_with_coupon_with_wallet
        );
      } else {
        discountDetails.discounted_amount_with_wallet = applyNonNegative(
          baseDiscount + walletDeduction
        );
        discountDetails.discounted_percentage_with_wallet =
          calculateDiscountPercentage(
            discountDetails.discounted_amount_with_wallet
          );
        discountDetails.final_amount = Math.ceil(
          baseMRP - baseDiscount - walletDeduction
        );
      }
      break;

    case 7:
    case 8:
      if (couponDetails.coupon_discount) {
        discountDetails.discounted_amount_with_coupon =
          applyNonNegative(couponDiscount);
        discountDetails.discounted_percentage_with_coupon =
          calculateDiscountPercentage(
            discountDetails.discounted_amount_with_coupon
          );
        discountDetails.final_amount = Math.ceil(
          baseMRP - discountDetails.discounted_amount_with_coupon
        );
      } else {
        discountDetails.final_amount = Math.ceil(baseMRP);
      }
      break;

    case 9:
      discountDetails.with_wallet = applyNonNegative(walletDeduction);
      discountDetails.discounted_percentage_with_wallet =
        calculateDiscountPercentage(walletDeduction);
      discountDetails.final_amount = Math.ceil(baseMRP - walletDeduction);
      break;

    case 10:
    case 11:
      if (couponDetails.coupon_discount) {
        discountDetails.with_coupon_with_wallet = applyNonNegative(
          couponDiscount + walletDeduction
        );
        discountDetails.discounted_percentage_with_coupon_with_wallet =
          calculateDiscountPercentage(discountDetails.with_coupon_with_wallet);
        discountDetails.final_amount = Math.ceil(
          baseMRP - discountDetails.with_coupon_with_wallet
        );
      } else {
        discountDetails.with_wallet = applyNonNegative(walletDeduction);
        discountDetails.discounted_percentage_with_wallet =
          calculateDiscountPercentage(walletDeduction);
        discountDetails.final_amount = Math.ceil(baseMRP - walletDeduction);
      }
      break;

    case 12:
      if (couponDetails.coupon_discount) {
        discountDetails.discounted_amount_with_coupon = applyNonNegative(
          baseDiscount + couponDiscount
        );
        discountDetails.discounted_percentage_with_coupon =
          calculateDiscountPercentage(
            discountDetails.discounted_amount_with_coupon
          );
        discountDetails.final_coupon_amount = Math.ceil(
          baseMRP - discountDetails.discounted_amount_with_coupon
        );
      } else {
        discountDetails.final_coupon_amount = Math.ceil(baseMRP - baseDiscount);
      }
      discountDetails.discounted_amount_with_wallet = applyNonNegative(
        baseDiscount + walletDeduction
      );
      discountDetails.discounted_percentage_with_wallet =
        calculateDiscountPercentage(
          discountDetails.discounted_amount_with_wallet
        );
      discountDetails.final_wallet_amount = Math.ceil(
        baseMRP - baseDiscount - walletDeduction
      );
      discountDetails.final_amount = discountDetails.final_coupon_amount;
      break;

    default:
      discountDetails.final_amount = Math.ceil(baseMRP);
      break;
  }
  // discountDetails.discount_amount = discountDetails.discounted_amount;
  return discountDetails;
};


function compareDataObjects(obj1, obj2) {
  // Helper to extract the main number from strings like "46   (Action Taken: 1)"
  const parseValue = (val) => {
    if (typeof val === "string") {
      const match = val.match(/^\s*(\d+)/);
      return match ? Number(match[1]) : 0;
    }
    return typeof val === "number" ? val : 0;
  };

  const compareRecursive = (a, b) => {
    const result = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

    for (const key of keys) {
      const val1 = a?.[key];
      const val2 = b?.[key];

      if (val1 && typeof val1 === "object" && !Array.isArray(val1)) {
        // Nested object — recurse
        result[key] = compareRecursive(val1, val2 || {});
      } else {
        const num1 = parseValue(val1);
        const num2 = parseValue(val2);
        if (num2 > num1) result[key] = "inc"+ `(${num2 - num1})`;
        else if (num2 < num1) result[key] = "dec"+ `(${num1 - num2})`;
        else result[key] = "same";
      }
    }

    return result;
  };

  return compareRecursive(obj1, obj2);
}

function checkActionTakenAndLogoff(obj) {
  const result = {};

  function traverse(obj) {
    const subResult = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];

        // ✅ If the key is "overdue", skip its processing and set null
        if (key === "overdue") {
          subResult[key] = null;
          continue;
        } 
      
        if (key==='birthday_hamper_not_claimed') {
           subResult[key]=null; 
          continue; 
        }

        // If nested object, process recursively
        if (typeof value === "object" && value !== null) {
          subResult[key] = traverse(value);
        } else if (typeof value === "string" && value.includes(" (Action Taken: ")) {
          // If it's a string with the Action Taken info, process it
          const regex = /(\d+)\s+\(Action Taken:\s+(\d+)\)/;
          const match = value.match(regex);

          if (match) {
            const beforeAction = parseInt(match[1], 10);
            const afterAction = parseInt(match[2], 10);
            console.log(beforeAction, afterAction, "beforeAction, afterAction");
            subResult[key] = beforeAction <= afterAction;
          }
        } else {
          // Default case — assume true if not an "Action Taken" string
          subResult[key] = true;
        }
      }
    }

    return subResult;
  }

  // Start recursion
  return traverse(obj);
}


const getComboInclusions = (productName, packSize) => {
  const samplerPackList = {
    "Pack of 3": ["Makhana Chips (50g)", "Nippat (50g)", "Chocolate Cookies (200g)"],
    "Pack of 5": ["Quicky (60g)", "KM Quicky (60g)", "Chocolate Cookies (200g)", "Makhana Chips (50g)", "Nippat (50g)"],
    "Pack of 6": ["Quicky (60g)", "KM Quicky (60g)", "Chocolate Cookies (200g)", "Almond Berry Cookies (200g)", "Makhana Chips (50g)", "Nippat (50g)"],
  };

  const comboMapping = {
    "BN-Tea-time Munchies Combo Pack": ["BN Makhana Chips", "BN Baked Nippat", "BN-Millet Chivda"],
    "BN-Healthy Breakfast Combo Pack": ["BN High Protein Upma (Quicky)", "BN Khatta Meetha Upma(Quicky)", "BN-Apple Cinnamon Muesli", "BN-Nutty Choco Cereal"],
    "BN-Sampler Pack": samplerPackList?.[packSize] || ["BN Makhana Chips", "BN Baked Nippat", "BN-Chocolate Cookies"],
    "BN-Sugar Free Cookies Combo": ["BN-Almond Berry Cookies", "BN-Dark Chocolate Cookies"],
  };

  return comboMapping[productName] || null;
};


const isComboProduct = (productName) => {
  const comboProducts = [
    "BN-Tea-time Munchies Combo Pack",
    "BN-Healthy Breakfast Combo Pack",
    "BN-Sampler Pack",
    "BN-Sugar Free Cookies Combo"
  ];
  return comboProducts.includes(productName);
};

function formatString(str) {
  return str
    .replace(/_/g, " ") // replace underscores with space
    .toLowerCase() // convert to lowercase first
    .replace(/\b\w/g, (c) => c.toUpperCase()); // capitalize each word
}

function isFinalStatus(status = "") {
  const normalized = status.toLowerCase();
  return !normalized.includes("delivered");
}



export {
  isFinalStatus,
  filterObjectRemoveNullValues,
  getCurrentDateTime,
  addDaysToDate,
  calculateAge,
  addHoursToTime,
  getCurrentDate,
  CustomDate,
  formatDate,
  generateRandomFourDigitNumber,
  mapCallType,
  getDormancyWhatsappMessage,
  getSourceNameLabel,
  discountCalculator,
  safeJSONParse,
  compareDataObjects,
  checkActionTakenAndLogoff,
  isComboProduct,
  getComboInclusions,
  formatString
};
