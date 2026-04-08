import { readRecord } from "../config/query.js";
import { image_guide_base_url, tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import moment from "moment";

const checkoutPage = async (req, res, next) => {
  const { program_id, program_session_id, user_id, wallet_applied, coupon } =
    req.body;
  try {
    const { results: users } = await readRecord({
      selectFields: [
        "cd.user_id",
        "cd.phone",
        "c.country_name",
        "c.currencyID",
        "cd.my_wallet",
        "cd.email_id",
        "cd.country_id",
        "ad.official_phone",
        "cd.user_status",
        "cd.user_type",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.countries} c`,
          on: "c.country_id = cd.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [{ field: "cd.user_id", operator: "=", value: user_id }],
    });
    if (users.length === 0) {
      return next(new ErrorHandler("User not found", 404));
    }
    const userDetails = users[0];

    let offerIdCondition = ""; // default
    if (users.length) {
      const userStatus = users[0].user_status;
      // if (userStatus === "Completed") {
      //   offerIdCondition = "AND ofn.id = 61";
      // } else if (userStatus === "Active" && users[0].country_id === 101) {
      //   offerIdCondition = "AND ofn.id = 63";
      // } else if (userStatus === "Active" && users[0].country_id !== 101) {
      //   offerIdCondition = "AND ofn.id = 64";
      // }
    }

    const { results: programs } = await readRecord({
      selectFields: [
        "pm.program_id",
        "pm.program_name",
        "pm.thumbnail",
        "ps.validity",
        "ps.extra_validity",
        "ps.is_wallet_allowed",
        "ps.is_coupon_allowed",
        "ps.mrp",
        "ofl.offer_id as offer_id",
        "ofn.offer_type",
        "ofl.discount_amount",
        "ofl.discount_percent",
        // "c.coupon_code",
        // "c.discount_type",
        // "c.quantity",
        "ps.discount_amount as program_discount_amount",
        "ps.discount_percentage as program_discount_percent",
      ],
      table: `${tables.programSession} ps`,
      joins: [
        {
          type: "INNER",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = ps.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.offersNew} ofn`,
          on: `ofn.is_active = 1 AND ofn.offer_for = 0  AND  CURDATE() BETWEEN ofn.start_date AND ofn.end_date ${offerIdCondition}`,
        },
        {
          type: "LEFT",
          table: `${tables.offerLogs} ofl`,
          on: "ofl.offer_id = ofn.id AND (ofl.program_id = pm.program_id AND ofl.session_id = ps.program_session_id)",
        },
      ],
      conditions: [
        {
          field: "ps.program_id",
          operator: "=",
          value: program_id,
        },
        {
          field: "ps.program_session_id",
          operator: "=",
          value: program_session_id,
        },
        {
          field: "pm.is_active",
          operator: "=",
          value: 1,
        },
      ],
    });
    console.log(programs, 95);
    let total_amount = programs[0].mrp;
    let discounted_amount = programs[0].mrp;
    let program = programs[0];
    let is_counpon_valid = false;
    let is_counpon_applied = false;
    let is_wallet_applied = false;
    let is_both_allowed = true;
    let is_program_discount = false;
    const source = String(req.headers.source || "").toLowerCase();
    let spin_reward = "";

    if (userDetails.user_status == "Lead" && source == "app") {
      let coupon_code = "";
      is_wallet_applied = false;
      program.is_wallet_allowed = "0";
      program.offer_id = "12";

      if (userDetails.user_type == "0") {
        program.offer_type = 4;
      }

      const featureActivationtable = tables.leadsActivatedFeatures;
      const selectfeatureActivationColumns = ["*"];
      const featureActivationWhereCondition = [
        { field: `user_id`, operator: `=`, value: user_id },
      ];
      const { results: activatedFeatures } = await readRecord({
        table: `${featureActivationtable}`,
        selectFields: selectfeatureActivationColumns,
        conditions: featureActivationWhereCondition,
      });
      let couponActivationDetails,
        recipeBookActivationDetails,
        spinToWinActivationDetails,
        guidesActivationDetails = "";
      if (activatedFeatures.length > 0) {
        couponActivationDetails = JSON.parse(activatedFeatures[0].coupon);
        recipeBookActivationDetails = activatedFeatures[0].recipe_book;
        spinToWinActivationDetails = JSON.parse(
          activatedFeatures[0].spin_to_win,
        );
        guidesActivationDetails = activatedFeatures[0].guides;
      }

      console.log(couponActivationDetails, 333333);
      console.log(spinToWinActivationDetails, 4444444);

      if (
        couponActivationDetails &&
        moment(couponActivationDetails.end_date).format(`DD-MM-YYYY`) >=
          moment().format("DD-MM-YYYY")
      ) {
        coupon_code = couponActivationDetails.coupon_code;
        program.quantity = parseInt(couponActivationDetails.coupon_amount);
        program.discount_type = "0";
        if (userDetails.user_type == "0") {
          program.offer_type = 6;
        } else {
          program.offer_type = 3;
        }
        is_counpon_applied = true;
        is_both_allowed = true;
      }

      const spinRewardtable = tables.prizeDetails;
      const selectspinRewardColumns = ["*"];
      const spinRewardWhereCondition = [
        { field: `user_id`, operator: `=`, value: user_id },
      ];
      const { results: spinRewardDetails } = await readRecord({
        table: `${spinRewardtable}`,
        selectFields: selectspinRewardColumns,
        conditions: spinRewardWhereCondition,
      });

      let spin_reward_date;
      let add_3_days;
      if (spinRewardDetails.length > 0) {
        spin_reward_date = moment(spinRewardDetails[0].added_date).format(
          `YYYY-MM-DD`,
        );
        add_3_days = moment(spin_reward_date)
          .add(3, "days")
          .format(`YYYY-MM-DD`);
        if (moment().format(`YYYY-MM-DD`) <= add_3_days) {
          spin_reward = spinRewardDetails[0].prize;
        }
      }
    }
    console.log(userDetails, 199);
    console.log(program.offer_type, 1010101010);
    console.log(program.is_wallet_allowed, 1010101010);
    console.log(program, 202);
    const payment_details = [
      {
        title: "<span><b>Program Cost:</b></span>",
        currency: userDetails?.currencyID || "INR",
        amount: `<b>${programs[0].mrp}</b>`,
      },
    ];
    let is_offer_applied = false;
    let discount_type = "No Discount";
    console.log(program.offer_type, 111);
    if (program.offer_id) {
      console.log("offer_found", 115);

      switch (program.offer_type) {
        case 1:
          discounted_amount = programs[0].mrp - program.discount_amount;
          is_offer_applied = true;
          payment_details.push({
            title: "<span><b>Offer Discount:</b></span>",
            currency: userDetails?.currencyID || "INR",
            amount: `<b>-${Number(program.discount_amount)}</b>`,
          });
          discount_type = "Only Discount";
          break;
        case 2:
          discounted_amount = programs[0].mrp - program.discount_amount;
          is_offer_applied = true;
          payment_details.push({
            title: "<span><b>Offer Discount:</b></span>",
            currency: userDetails?.currencyID || "INR",
            amount: `<b>-${Number(program.discount_amount)}</b>`,
          });
          if (program.discount_type == 0 && program.coupon == coupon) {
            discounted_amount = discounted_amount - program.quantity;
            is_counpon_applied = true;
          } else if (program.discount_type == 1 && program.coupon == coupon) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
            is_counpon_applied = true;
          } else {
            is_counpon_valid = false;
          }
          discount_type = "Discount + Coupon (Not Auto)";
          break;
        case 3:
          discounted_amount = programs[0].mrp - program.discount_amount;
          is_offer_applied = true;
          payment_details.push({
            title: "<span><b>Offer Discount:</b></span>",
            currency: userDetails?.currencyID || "INR",
            amount: `<b>-${Number(program.discount_amount)}</b>`,
          });
          is_counpon_applied = true;
          if (program.discount_type == 0) {
            discounted_amount = discounted_amount - program.quantity;
          } else if (program.discount_type == 1) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
          }
          discount_type = "Discount + Coupon (Auto)";
          break;
        case 4:
          console.log(
            "case 4",
            discounted_amount - Number(program.discount_amount),
            program.discount_amount,
            162,
          );
          if (
            userDetails.user_type === "0" &&
            Number(program_id) === 132 &&
            source === "app"
          ) {
            const MIN_PROGRAM_AMOUNT = 8999;

            const PROGRAM_AMOUNT = discounted_amount; // treat as original here
            const WALLET_BALANCE = userDetails.my_wallet || 0;

            // 30% offer discount (money → floor)
            const offerDiscount = Math.floor(program.mrp * 0.3);

            // Max discount allowed
            const MAX_TOTAL_DISCOUNT = PROGRAM_AMOUNT - MIN_PROGRAM_AMOUNT;

            // Remaining space for wallet after offer
            const maxWalletUsable = Math.max(
              0,
              MAX_TOTAL_DISCOUNT - offerDiscount,
            );

            // Wallet discount (double capped)
            const walletDiscount = Math.min(WALLET_BALANCE, maxWalletUsable);

            // Total discount (hard capped)
            const totalDiscount = Math.min(
              offerDiscount + walletDiscount,
              MAX_TOTAL_DISCOUNT,
            );

            // Final amount (guaranteed ≥ 7999)
            discounted_amount = PROGRAM_AMOUNT - totalDiscount;

            is_offer_applied = offerDiscount > 0;
            is_wallet_applied = walletDiscount > 0;

            if (offerDiscount > 0) {
              payment_details.push({
                title: "<span><b>Offer Discount:</b></span>",
                currency: userDetails?.currencyID || "INR",
                amount: `<b>-${offerDiscount}</b>`,
              });
            }

            if (walletDiscount > 0) {
              payment_details.push({
                title: "<span><b>Wallet Discount:</b></span>",
                currency: userDetails?.currencyID || "INR",
                amount: `<b>-${walletDiscount}</b>`,
              });
            }

            discount_type =
              offerDiscount && walletDiscount
                ? "Discount + Wallet"
                : offerDiscount
                  ? "Discount"
                  : "Wallet";
          } else if (
            userDetails.user_type === "0" &&
            (program.validity === 30 ||
              [1, 2, 3].includes(parseInt(program_id)))
          ) {
            discounted_amount = discounted_amount - program.discount_amount;
            is_offer_applied = true;
            is_wallet_applied = false;
            payment_details.push({
              title: "<span><b>Existing Discount:</b></span>",
              currency: userDetails?.currencyID || "INR",
              amount: `<b>-${Number(program.discount_amount)}</b>`,
            });
            payment_details.push({
              title: "<span><b>Wallet Discount:</b></span>",
              currency: userDetails?.currencyID || "INR",
              amount: `<b>-0</b>`,
            });
            is_wallet_applied = false;
            discount_type = "Only Discount";
          } else {
            discounted_amount = discounted_amount - program.discount_amount;
            is_offer_applied = true;
            payment_details.push({
              title: "<span><b>Existing Discount:</b></span>",
              currency: userDetails?.currencyID || "INR",
              amount: `<b>-${Number(program.discount_amount)}</b>`,
            });
            payment_details.push({
              title: "<span><b>Wallet Discount:</b></span>",
              currency: userDetails?.currencyID || "INR",
              amount: `<b>-${userDetails.my_wallet}</b>`,
            });
            discounted_amount = discounted_amount - userDetails.my_wallet;
            is_wallet_applied = true;
            discount_type = "Discount + Wallet";
          }
          break;
        case 5:
          discounted_amount = discounted_amount - program.discount_amount;
          discounted_amount = discounted_amount - userDetails.my_wallet;
          is_offer_applied = true;
          payment_details.push({
            title: "<span><b>Offer Discount:</b></span>",
            currency: userDetails?.currencyID || "INR",
            amount: `<b>-${Number(program.discount_amount)}</b>`,
          });
          is_wallet_applied = true;
          if (program.discount_type == 0 && program.coupon == coupon) {
            discounted_amount = discounted_amount - program.quantity;
            is_counpon_applied = true;
          } else if (program.discount_type == 1 && program.coupon == coupon) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
            is_counpon_applied = true;
          } else {
            is_counpon_valid = false;
          }
          discount_type = "Discount + Wallet + Coupon (Not Auto)";
          break;
        case 6:
          console.log("I am hereeeeeeeeeeeee", 1212121212);
          discounted_amount = discounted_amount - program.discount_amount;
          discounted_amount = discounted_amount - userDetails.my_wallet;
          is_offer_applied = true;
          is_wallet_applied = true;
          if (program.discount_type == 0) {
            discounted_amount = discounted_amount - program.quantity;
          } else if (program.discount_type == 1) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
          }
          discount_type = "Discount + Wallet + Coupon (Auto)";
          break;
        case 7:
          if (program.discount_type == 0 && program.coupon == coupon) {
            discounted_amount = discounted_amount - program.quantity;
            is_counpon_applied = true;
          } else if (program.discount_type == 1 && program.coupon == coupon) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
            is_counpon_applied = true;
          } else {
            is_counpon_valid = false;
          }
          discount_type = "Only Coupon (Not Auto)";
          break;
        case 8:
          if (program.discount_type == 0) {
            discounted_amount = discounted_amount - program.quantity;
          } else if (program.discount_type == 1) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
          }
          discount_type = "Only Coupon (Auto)";
          break;
        case 9:
          discounted_amount = discounted_amount - userDetails.my_wallet;
          is_wallet_applied = true;
          discount_type = "Only Wallet";
          break;
        case 10:
          discounted_amount = discounted_amount - userDetails.my_wallet;
          is_wallet_applied = true;
          if (program.discount_type == 0 && program.coupon == coupon) {
            discounted_amount = discounted_amount - program.quantity;
            is_counpon_applied = true;
          } else if (program.discount_type == 1 && program.coupon == coupon) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
            is_counpon_applied = true;
          } else {
            is_counpon_valid = false;
          }
          discount_type = "Wallet + Coupon (Not Auto)";
          break;
        case 11:
          discounted_amount = discounted_amount - userDetails.my_wallet;
          is_wallet_applied = true;
          if (program.discount_type == 0) {
            discounted_amount = discounted_amount - program.quantity;
          } else if (program.discount_type == 1) {
            discounted_amount =
              discounted_amount - (program.quantity / 100) * discounted_amount;
          }
          discount_type = "Wallet + Coupon (Auto)";
          break;
        case 12:
          discounted_amount = discounted_amount - program.discount_amount;
          payment_details.push({
            title: "<span><b>Offer Discount:</b></span>",
            currency: userDetails?.currencyID || "INR",
            amount: `<b>-${Number(program.discount_amount)}</b>`,
          });
          is_offer_applied = true;
          if (wallet_applied && coupon == program.coupon) {
            is_both_allowed = false;
          }
          if (userDetails.my_wallet > 0 && wallet_applied) {
            discounted_amount = discounted_amount - userDetails.my_wallet;
            is_wallet_applied = true;
          } else if (coupon == program.coupon) {
            discounted_amount = discounted_amount - program.quantity;
            is_counpon_applied = true;
          } else {
            is_counpon_valid = false;
          }
          discount_type = "Either Coupon Or Wallet (With or without Discount)";
          break;
      }
    }
    console.log(discounted_amount, 399);
    discounted_amount = Math.max(discounted_amount, 0);

    // Handle wallet application only if wallet is allowed and wallet_applied is true
    console.log(is_wallet_applied, 111000111000);

    if (is_wallet_applied && program.is_wallet_allowed === "1") {
      payment_details.push({
        title: "<span><b>Wallet Applied:</b></span>",
        currency: userDetails?.currencyID || "INR",
        amount: `<b>-${userDetails.my_wallet}</b>`,
      });
    }

    if (is_counpon_applied) {
      payment_details.push({
        title: "<span><b>Coupon Discount:</b></span>",
        currency: userDetails?.currencyID || "INR",
        amount: `<b>-${program.quantity}</b>`,
      });
    }
    const totalSavings = {
      currency: userDetails.currencyID || "INR",
      amount: Number((total_amount - discounted_amount).toFixed(2)),
      percentage: `(${(
        ((total_amount - discounted_amount) / total_amount) *
        100
      ).toFixed(2)}%)`,
    };

    const grandTotal = {
      currency: userDetails.currencyID || "INR",
      amount: discounted_amount,
      actual_amount: total_amount,
    };

    const data = {
      countryId: userDetails.country_id,
      country: userDetails.country_name,
      currency: userDetails.currencyID || "INR",
      mobileNumber: userDetails.phone,
      program_name: programs[0].program_name,
      program_logo: programs[0].thumbnail,
      program_validity: programs[0].validity,
      program_extra_validity: programs[0].extra_validity,
      wallet_apply_top_section: {
        wallet_amount: userDetails.my_wallet,
        is_show: programs[0].is_wallet_allowed == "1",
        auto_apply: is_wallet_applied,
      },
      payment_details: payment_details,
      total_savings: totalSavings,
      grand_total: grandTotal,
      show_coupon_code_line: 0,
      spin_reward,
      help_section_array: [
        {
          help_title: "Payment Related Queries:",
          help_number: "9820798255",
          help_icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/call_icon.png`,
          help_action: "call",
        },
        {
          help_title: "Program Related Queries:",
          help_number: "9820455544",
          help_icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/call_icon.png`,
          help_action: "call",
        },
        {
          help_title: "Whatsapp us:",
          help_number: "9820455544",
          help_icon: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/whatsapp_icon.png`,
          help_action: "whatsapp",
        },
      ],
      help_section_title: "Need Help? We’re here for you",
      back_button_pop_up: {
        checkout_pop_up_title: "Are You Sure?",
        checkout_pop_up_desc:
          "You are still away from your goal weight. Do not miss these Offers!",
        checkout_pop_up_btn1: "Alright",
        checkout_pop_up_btn2: "Not Now",
        show_popup: true,
      },
      available_coupon_codes: [],
      show_invalid_coupon: false,
      invalid_coupon_title: "Oops!",
      invalid_coupon_description:
        "Seems like you have entered an <b>invalid code.</b> Connect with your mentor now!",
      invalid_coupon_button1: "Mentor Chat",
      invalid_coupon_button2: "WhatsApp Us",
      invalid_coupon_call: userDetails.official_phone,
      client_email: userDetails.email_id,
      wallet_bonus: {
        currency: "₹",
        amount: "500",
      },
      is_both_allowed,
      is_counpon_valid,
      is_counpon_applied,
      is_wallet_applied,
      discount_type,
    };

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Checkout Page Data Fetched Successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { checkoutPage };
