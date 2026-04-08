import moment from "moment";
import { insertRecord, readRecord } from "../../config/query.js";
import {
  discountCalculator,
  safeJSONParse,
} from "../../helper/commonHelper.js";
import {
  image_guide_base_url,
  offerTypes,
  popUpDetailsMap,
  tables,
} from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { sendMailUtil } from "../../utils/sendEmail.js";

const getPrograms = async (req, res, next) => {
  try {
    const { page, limit, search, program_id, user_id } = req.query;
    const source = String(req.headers.source || "").toLowerCase();

    const selectFields = [
      "pm.program_id",
      "pm.slug",
      "pm.program_name",
      "pm.app_stats_image",
      "pm.stats_card as stats",
      "pm.web_program_banner",
      "pm.app_program_banner",
      "pm.ideal_for_image",
      "pm.ideal_for_web",
      "pm.who_should_do_it_yt_link",
      "pm.program_description",
      "pm.what_will_i_get_yt_link",
      "pm.who_should_do_it_app",
      "pm.who_should_do_it_web",
      "pm.what_will_i_get_app",
      "pm.what_will_i_get_web",
      "pm.program_features_app",
      "pm.program_features_web",
      "pm.thumbnail",
      `CONCAT(
        '[',
        GROUP_CONCAT(DISTINCT
            JSON_OBJECT(
                'program_duration', IFNULL(ps.program_duration, ''),
                'program_session_id', IFNULL(ps.program_session_id, ''),
                'mrp', IFNULL(ps.mrp, ''),
                'usd_mrp', IFNULL(ps.usd_mrp, ''),
                'session_description', IFNULL(ps.session_description, '')
            ) SEPARATOR ','
        ),
        ']'
      ) AS sessions`,
      `CONCAT(
        '[',
        GROUP_CONCAT(DISTINCT
            JSON_OBJECT(
                'coupon_program_id', IFNULL(c.program_id, ''),
                'coupon_program_session_id', IFNULL(c.program_session_id, ''),
                'coupon_type', IFNULL(c.discount_type, ''),
                'coupon_quantity', IFNULL(c.quantity, ''),
                'coupon_code', IFNULL(c.coupon_code, '')
            ) SEPARATOR ','
        ),
        ']'
      ) AS coupons`,
      `CONCAT(
        '[',
        GROUP_CONCAT(DISTINCT
            JSON_OBJECT(
                'offer_log_id', IFNULL(ofl.id, ''),
                'discount_percent', IFNULL(ofl.discount_percent, ''),
                'discount_amount', IFNULL(ofl.discount_amount, ''),
                'program_id', IFNULL(ofl.program_id, ''),
                'session_id', IFNULL(ofl.session_id, '')
            ) SEPARATOR ','
        ),
        ']'
      ) AS offer_logs`,
      "ofn.id as offer_id",
      "ofn.offer_title",
      "ofn.offer_description",
      "ofn.offer_type",
      "ofn.offer_discount_percentage",
      "ofn.offer_banners",
      "ofn.is_all_program",
      "ofn.program_marquee",
      "ofn.redirect_page",
      "ofn.redirect_id",
      "ofn.start_date",
      "ofn.end_date",
    ];

    let wallet = 0;
    const appWebConditions = [];
    const programSessionMap = {
      default: null, // means ALL
      1: [3, 6, 9],
      2: [3, 6, 9],
      3: [3, 6, 9],
      4: [3, 6, 9],
      5: [3, 6, 9],
      6: [3, 6, 9],
      74: [3, 6, 9],
      91: [3, 6, 9],
      132: [6],
      7: [3],
      172: [9, 18],
      173: [9, 18],
    };

    let offerIdCondition = ""; // default
    if (user_id) {
      const { results: walletResults } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.my_wallet as wallet",
          "ud.user_type",
          "ud.user_status",
          "ud.country_id",
        ],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      });
      if (walletResults.length) {
        wallet = Number(walletResults[0].wallet) || 0;
      }
      if (Number(walletResults[0].user_type) === 0) {
        appWebConditions.push({
          field: "pm.app_web",
          operator: "=",
          value: "Web",
        });
      }

      if (walletResults.length) {
        const userStatus = walletResults[0].user_status;
        // if (userStatus === "Completed") {
        //   offerIdCondition = "AND ofn.id = 61";
        // } else if (userStatus === "Active" && walletResults[0]?.country_id === 101) {
        //   offerIdCondition = "AND ofn.id = 63";
        // }else if (userStatus === "Active" && walletResults[0]?.country_id !== 101) {
        //   offerIdCondition = "AND ofn.id = 64";
        // }
      }
    }

    let sessionCondition = null;

    if (source === "app" && program_id) {
      const allowedSessions =
        programSessionMap[program_id] ?? programSessionMap.default;

      if (allowedSessions) {
        sessionCondition = {
          field: "ps.program_sessions",
          operator: "IN",
          value: allowedSessions,
        };
      }
    }

    if (source === "web" || source === "app") {
      appWebConditions.push(
        {
          field: "pm.app_web",
          operator: "=",
          value: source === "web" ? "Web" : "App",
        },
        { field: "pm.app_web", operator: "=", value: "Both" },
      );
    } else {
      appWebConditions.push(
        { field: "pm.app_web", operator: "=", value: "App" },
        { field: "pm.app_web", operator: "=", value: "Web" },
        { field: "pm.app_web", operator: "=", value: "Both" },
      );
    }

    const conditions = [
      { field: "pm.is_active", operator: "=", value: 1 },
      program_id
        ? { field: "pm.program_id", operator: "=", value: program_id }
        : null,
      sessionCondition,
      appWebConditions.length ? { orConditions: appWebConditions } : null,
    ].filter(Boolean);

    const { results, totalCount } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "pm.program_id = ps.program_id AND ps.is_active = 1",
        },
        {
          type: "LEFT",
          table: `${tables.coupons} c`,
          on: `(c.program_session_id = ps.program_session_id OR c.program_id = pm.program_id) AND c.status = 'active'`,
        },
        {
          type: "LEFT",
          table: `${tables.offersNew} ofn`,
          on: `ofn.is_active = 1 AND CURDATE() BETWEEN ofn.start_date AND ofn.end_date AND ofn.offer_for = ${
            req.headers["source"] === "web" ? 1 : 0
          } ${offerIdCondition}`,
        },
        {
          type: "LEFT",
          table: `${tables.offerLogs} ofl`,
          on: "ofl.offer_id = ofn.id AND (ofl.program_id = pm.program_id OR ofl.session_id = ps.program_session_id)",
        },
      ],
      conditions,
      ...(limit && page && { pagination: { limit, page } }),
      ...(search && {
        search: { searchQuery: search, searchFields: ["pm.program_name"] },
      }),
      countTotal: true,
      groupBy: ["pm.program_id"],
    });

    console.log(results, 9090909090);

    const { results: walletResults } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.my_wallet as wallet",
        "ud.user_type",
        "ud.user_status",
        "ud.country_id",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });

    let marquee_text = "";
    let offer_image = "";
    const data = results.map((program) => {
      const offer = program.offer_id
        ? {
            offer_id: program.offer_id,
            title: program.offer_title,
            description: program.offer_description,
            offer_type: {
              id: program.offer_type,
              name: offerTypes[program.offer_type] || "",
            },
            marquee: program.offer_marquee,
            start_date: program.start_date
              ? moment(program.start_date).format("YYYY-MM-DD")
              : null,
            end_date: program.end_date
              ? moment(program.end_date).format("YYYY-MM-DD")
              : null,
            offer_banners: program.offer_banners
              ? safeJSONParse(program.offer_banners, [])
              : [],
          }
        : null;

      if (offer && offer.marquee) {
        marquee_text = offer.marquee;
      }
      const sessionsParsed = safeJSONParse(program.sessions, []);
      const offerLogsParsed = safeJSONParse(program.offer_logs, []);
      const couponsParsed = safeJSONParse(program.coupons, []);
      console.log(offer, offer?.offer_banners, walletResults[0]);
      if (offer && offer?.offer_banners && offer?.offer_banners.length > 0) {
        offer_image = offer.offer_banners[0]?.file.path;
      }
      if (
        offer &&
        offer.offer_banners &&
        offer.offer_banners.length > 1 &&
        walletResults.length &&
        Number(walletResults[0].country_id) !== 101
      ) {
        offer_image = offer.offer_banners[1]?.file.path;
      }
      const sessions = sessionsParsed
        .filter((session) => session.program_session_id)
        .map((session) =>
          discountCalculator({
            sessionData: session,
            programData: program,
            userWallet: wallet,
            offerLogs: offerLogsParsed,
            couponsParsed,
          }),
        );

      const idealForWeb = safeJSONParse(program.ideal_for_web, []);
      const whoShouldDoItApp = safeJSONParse(program.who_should_do_it_app, []);
      const whoShouldDoItWeb = safeJSONParse(program.who_should_do_it_web, []);
      const whatWillIGetApp = safeJSONParse(program.what_will_i_get_app, []);
      const whatWillIGetWeb = safeJSONParse(program.what_will_i_get_web, []);
      const programFeaturesApp = safeJSONParse(
        program.program_features_app,
        [],
      );
      const programFeaturesWeb = safeJSONParse(
        program.program_features_web,
        [],
      );
      const flattenedProgramFeaturesWeb = programFeaturesWeb
        .filter((feature) => feature && Array.isArray(feature.points)) // Ensure feature and points exist
        .flatMap((feature) => feature.points)
        .filter(Boolean); //
      const response = {
        program_id: program.program_id,
        program_name:
          program.program_name && source === "app"
            ? String(program.program_name)
                .replace(/client\s+exclusive\s+advanced/i, "")
                .replace(/\([^()]*\)/g, "")
                .trim()
            : program.program_name,
        program_description: program.program_description || "",
        who_should_do_it_yt_link: program.who_should_do_it_yt_link || "",
        what_will_i_get_yt_link: program.what_will_i_get_yt_link || "",
        program_thumbnail: program.thumbnail || "",
        sessions: sessions.sort((a, b) => {
          const aDuration = a.program_duration.split(" ")[0];
          const bDuration = b.program_duration.split(" ")[0];
          return Number(bDuration) - Number(aDuration);
        }),
        offer: "",
        program_banner:
          req.headers["source"] === "web"
            ? program.web_program_banner
            : program.app_program_banner,
        mobile_program_banner: program.app_program_banner,
      };

      const testimonial_section = {
        title: "If They Can, So Can You!",
        name: "Khyati Rupani",
        program: "Active",
        weight_loss: "35",
        country: "India",
        before_image: `https://${image_guide_base_url}/images/testimonial/before_777cd0a3.png`,
        after_image: `https://${image_guide_base_url}/images/testimonial/after_fe2a96e9.png`,
      };

      const back_popup = {
        title: "Need A Better Deal?",
        description:
          "Contact your counsellor, she may be able to give you a good one :)",
        button1_text: "Yes",
        button2_text: "Not Now",
        show: true,
      };

      if (source === "app") {
        if (walletResults[0].user_type == "0") {
          response.ideal_for = program.ideal_for_image;
        } else {
          response.ideal_for = offer_image || program.ideal_for_image;
        }
        response.who_should_do_it = whoShouldDoItApp;
        response.what_will_i_get = whatWillIGetApp;
        response.program_features = programFeaturesApp;

        response.image_slider = [
          program.app_program_banner,
          program.app_stats_image,
        ].filter(Boolean);
        response.testimonial_section = testimonial_section;
        response.call_details =
          '<p style="padding:20px 0px;font-weight:700;text-align:center;font-size:18px;font-family:sans-serif">Now, get upto <b style="color:white">5 calls</b> with your<br>nutritionist**</p>';
        response.popup = back_popup;
      } else if (source === "web") {
        response.program_banner = program.web_program_banner || "";
        response.ideal_for = idealForWeb;
        response.stats_data = safeJSONParse(program.stats, []);
        response.who_should_do_it = whoShouldDoItWeb;
        response.what_will_i_get = whatWillIGetWeb;
        response.program_features = flattenedProgramFeaturesWeb;
        response.slug = program.slug;
      } else {
        response.program_banner = {
          app: program.app_program_banner || "",
          web: program.web_program_banner || "",
        };
        response.ideal_for = {
          app: program.ideal_for_image,
          web: idealForWeb,
        };
        response.stats_data = {
          app: program.app_stats_image || "",
          web: program.stats || "",
        };
        response.who_should_do_it = {
          app: whoShouldDoItApp,
          web: whoShouldDoItWeb,
        };
        response.what_will_i_get = {
          app: whatWillIGetApp,
          web: whatWillIGetWeb,
        };
        response.program_features = {
          app: programFeaturesApp,
          web: flattenedProgramFeaturesWeb,
        };
      }

      return response;
    });
    console.log(wallet, 331);
    let marquee_details = {
      marquee_color: "#03989F",
      text: results[0]?.program_marquee?.replace("{{my_wallet}}", wallet),
      redirect_page: results[0]?.redirect_page,
      params: { redirect_id: results[0]?.redirect_id },
    };
    let coupon_code,
      coupon_amount = "";
    let coupon_discount = 0;

    if (source == "app" && walletResults[0].user_status == "Lead") {
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

      console.log(data[0].sessions, 5454545454);

      if (
        couponActivationDetails &&
        moment(couponActivationDetails.end_date).format(`DD-MM-YYYY`) >=
          moment().format("DD-MM-YYYY")
      ) {
        coupon_code = couponActivationDetails.coupon_code;
        coupon_discount = parseInt(couponActivationDetails.coupon_amount);

        data[0].sessions[0].coupon_discount = coupon_discount;
        data[0].sessions[0].coupon_code = coupon_code;
        data[0].sessions[0].coupon_discount_type = 0;
        data[0].sessions[0].coupon_amount = coupon_discount;

        if (data.length > 1) {
          data[0].sessions[1].coupon_discount = coupon_discount;
          data[0].sessions[1].coupon_code = coupon_code;
          data[0].sessions[1].coupon_discount_type = 0;
          data[0].sessions[1].coupon_amount = coupon_discount;
        }

        if (data.length > 2) {
          data[0].sessions[2].coupon_discount = coupon_discount;
          data[0].sessions[2].coupon_code = coupon_code;
          data[0].sessions[2].coupon_discount_type = 0;
          data[0].sessions[2].coupon_amount = coupon_discount;
        }
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

      let spin_reward = "";
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

      data[0].sessions[0].spin_to_win_reward = spin_reward;

      if (data[0].sessions.length > 1) {
        data[0].sessions[1].spin_to_win_reward = spin_reward;
      }

      if (data[0].sessions.length > 2) {
        data[0].sessions[2].spin_to_win_reward = spin_reward;
      }
      console.log(walletResults, 2323232323);
      if (walletResults[0].user_type == "0") {
        let total_discount = coupon_discount + walletResults[0].wallet;
        data[0].sessions.map((session) => {
          if (Number(program_id) === 132 && source === "app") {
            const MIN_PROGRAM_AMOUNT = 8999;

            const PROGRAM_AMOUNT = session.final_amount; // original amount
            const WALLET_BALANCE = walletResults[0].wallet || 0;

            // 30% discount (money → floor)
            const percentageDiscount = Math.floor(PROGRAM_AMOUNT * 0.3);

            // Max total discount allowed
            const MAX_TOTAL_DISCOUNT = PROGRAM_AMOUNT - MIN_PROGRAM_AMOUNT;

            // Remaining room for wallet usage
            const maxWalletUsable = Math.max(
              0,
              MAX_TOTAL_DISCOUNT - percentageDiscount,
            );

            // Wallet discount
            const walletDiscount = Math.min(WALLET_BALANCE, maxWalletUsable);

            // Total discount
            const totalDiscount = Math.min(
              percentageDiscount + walletDiscount,
              MAX_TOTAL_DISCOUNT,
            );

            const finalAmount = PROGRAM_AMOUNT - totalDiscount;

            // Assignments
            session.wallet_discount = walletDiscount;
            session.discount_amount = percentageDiscount;

            // 🔽 Percentage is now FLOOR (user-friendly)
            session.discount_percentage = 30;
            session.discounted_percentage = Math.floor(
              (totalDiscount / PROGRAM_AMOUNT) * 100,
            );

            // Money fields
            session.discounted_amount = totalDiscount;
            session.final_amount = finalAmount; // guaranteed ≥ 7999
          } else if (
            session.program_duration !== "30 Day" &&
            ![1, 2, 3, 132, 134].includes(parseInt(program_id))
          ) {
            session.wallet_discount = walletResults[0].wallet;
            session.final_amount = session.final_amount - total_discount;
            session.with_coupon_with_wallet = 1;
          }
        });
      }
    }
    if (walletResults[0]?.user_type == "0" && source == "app") {
      marquee_details = {};
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Programs Fetched Successfully",
        data,
        meta_data: {
          marquee_text: marquee_details,
          pop_up_text:
            popUpDetailsMap[`program_details_${req.headers["source"]}`],
          bank_details: [
            {
              bank_name: "HDFC BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "AXIS BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "INDUSIND BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "STANDARD CHARTERED BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "BANK OF BARODA",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "ICICI BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "KOTAK BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "YES BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
            {
              bank_name: "RATNAKAR BANK",
              interest: [
                { time: "3 Months", interest: "0% per annum" },
                { time: "6 Months", interest: "0% per annum" },
                { time: "9 Months", interest: "0% per annum" },
                { time: "18 Months", interest: "0% per annum" },
                { time: "24 Months", interest: "0% per annum" },
              ],
            },
          ],
          currentPage: Number(page),
          totalPage: Math.ceil(totalCount / limit),
        },
      }),
    );
  } catch (error) {
    console.error("Error occurred while fetching programs:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getCleansePrograms = async (req, res, next) => {
  try {
    const { program_id, page = 1, limit = 10, user_id, slug } = req.query;
    const source = String(req.headers.source || "").toLowerCase();

    const { results, totalCount } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: [
        "pm.program_id",
        "pm.program_name",
        "pm.slug",
        "pm.who_should_try_it_cleanse_web",
        "pm.who_should_try_it_cleanse_app",
        "pm.benefits_cleanse_web",
        "pm.benefits_cleanse_app",
        "pm.what_will_i_get_cleanse_app",
        "pm.what_will_i_get_cleanse_web",
        "pm.cleanse_program_banner",
        `CONCAT(
          '[',
          GROUP_CONCAT(DISTINCT
              JSON_OBJECT(
                  'program_duration', IFNULL(ps.program_duration, ''),
                  'program_session_id', IFNULL(ps.program_session_id, ''),
                  'mrp', IFNULL(ps.mrp, ''),
                  'usd_mrp', IFNULL(ps.usd_mrp, ''),
                  'session_description', IFNULL(ps.session_description, '')
              ) SEPARATOR ','
          ),
          ']'
        ) AS sessions`,
        `CONCAT(
          '[',
          GROUP_CONCAT(DISTINCT
              JSON_OBJECT(
                  'coupon_program_id', IFNULL(c.program_id, ''),
                  'coupon_program_session_id', IFNULL(c.program_session_id, ''),
                  'coupon_type', IFNULL(c.discount_type, ''),
                  'coupon_quantity', IFNULL(c.quantity, ''),
                  'coupon_code', IFNULL(c.coupon_code, '')
              ) SEPARATOR ','
          ),
          ']'
        ) AS coupons`,
        `CONCAT(
          '[',
          GROUP_CONCAT(DISTINCT
              JSON_OBJECT(
                  'offer_log_id', IFNULL(ofl.id, ''),
                  'discount_percent', IFNULL(ofl.discount_percent, ''),
                  'discount_amount', IFNULL(ofl.discount_amount, ''),
                  'program_id', IFNULL(ofl.program_id, ''),
                  'session_id', IFNULL(ofl.session_id, '')
              ) SEPARATOR ','
          ),
          ']'
        ) AS offer_logs`,
        "ofn.id as offer_id",
        "ofn.offer_title",
        "ofn.offer_description",
        "ofn.offer_type",
        "ofn.offer_discount_percentage",
        "ofn.offer_banners",
        "ofn.is_all_program",
        "ofn.program_marquee",
        "ofn.start_date",
        "ofn.end_date",
      ],
      conditions: [
        {
          field: "pm.program_category",
          operator: "=",
          value: "Basic Stack",
        },
        {
          field: "pm.is_active",
          operator: "=",
          value: 1,
        },
        program_id
          ? {
              field: "pm.program_id",
              operator: "=",
              value: program_id,
            }
          : null,
        slug
          ? {
              field: "pm.slug",
              operator: "=",
              value: slug,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "pm.program_id = ps.program_id AND ps.is_active = 1",
        },
        {
          type: "LEFT",
          table: `${tables.coupons} c`,
          on: `(c.program_session_id = ps.program_session_id OR c.program_id = pm.program_id) AND c.status = 'active'`,
        },
        {
          type: "LEFT",
          table: `${tables.offersNew} ofn`,
          on: `ofn.is_active = 1 AND CURDATE() BETWEEN ofn.start_date AND ofn.end_date AND ofn.offer_for = ${
            req.headers["source"] === "web" ? 1 : 0
          }`,
        },
        {
          type: "LEFT",
          table: `${tables.offerLogs} ofl`,
          on: "ofl.offer_id = ofn.id AND (ofl.program_id = pm.program_id OR ofl.session_id = ps.program_session_id)",
        },
      ],
      groupBy: ["pm.program_id"],
      countTotal: true,
      pagination: { limit, page },
    });
    let wallet = 0;
    if (user_id) {
      const { results: walletResults } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["ud.my_wallet as wallet"],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      });
      if (walletResults.length) {
        wallet = Number(walletResults[0].wallet) || 0;
      }
    }

    const data = results.map((program) => {
      const offer = program.offer_id
        ? {
            offer_id: program.offer_id,
            title: program.offer_title,
            description: program.offer_description,
            offer_type: {
              id: program.offer_type,
              name: offerTypes[program.offer_type] || "",
            },
            marquee: program.offer_marquee,
            start_date: program.start_date
              ? moment(program.start_date).format("YYYY-MM-DD")
              : null,
            end_date: program.end_date
              ? moment(program.end_date).format("YYYY-MM-DD")
              : null,
            offer_banners: program.offer_banners
              ? safeJSONParse(program.offer_banners, [])
              : [],
          }
        : null;

      const sessionsParsed = safeJSONParse(program.sessions, []);
      const offerLogsParsed = safeJSONParse(program.offer_logs, []);
      const couponsParsed = safeJSONParse(program.coupons, []);

      const sessions = sessionsParsed
        .filter((session) => session.program_session_id)
        .map((session) =>
          discountCalculator({
            sessionData: session,
            programData: program,
            userWallet: wallet,
            offerLogs: offerLogsParsed,
            couponsParsed,
          }),
        );

      const whoShouldTryItWeb = safeJSONParse(
        program.who_should_try_it_cleanse_web,
        [],
      );
      const whoShouldTryItApp = safeJSONParse(
        program.who_should_try_it_cleanse_app,
        [],
      );
      const benefitsCleanseWeb = safeJSONParse(
        program.benefits_cleanse_web,
        [],
      );
      const benefitsCleanseApp = safeJSONParse(
        program.benefits_cleanse_app,
        [],
      );
      const whatWillIGetCleanseWeb = safeJSONParse(
        program.what_will_i_get_cleanse_web,
        [],
      );
      const whatWillIGetCleanseApp = safeJSONParse(
        program.what_will_i_get_cleanse_app,
        [],
      );

      const response = {
        program_id: program.program_id,
        program_name: (program.program_name ? String(program.program_name) : "")
          .replace(/client\s+exclusive\s+advanced/i, "")
          .replace(/\([^()]*\)/g, "")
          .trim(),
        program_description: program.program_description || "",
        who_should_do_it_yt_link: program.who_should_do_it_yt_link || "",
        what_will_i_get_yt_link: program.what_will_i_get_yt_link || "",
        program_thumbnail: program.thumbnail || "",
        sessions,
        offer,
        is_10_day:
          Number(program.program_id) === 117 ||
          Number(program.program_id) === 118
            ? true
            : false,
        is_14_day:
          Number(program.program_id) === 119 ||
          Number(program.program_id) === 120
            ? true
            : false,
      };

      if (source === "app") {
        response.program_banner = program.cleanse_program_banner;
        response.who_should_try_it = whoShouldTryItApp;
        response.benefits = benefitsCleanseApp;
        response.what_will_i_get = whatWillIGetCleanseApp;
      } else if (source === "web") {
        response.program_banner = program.cleanse_program_banner;
        response.who_should_try_it = whoShouldTryItWeb;
        response.benefits = benefitsCleanseWeb;
        response.what_will_i_get = whatWillIGetCleanseWeb;
        response.slug = program.slug;
      } else {
        response.who_should_try_it = {
          app: whoShouldTryItApp,
          web: whoShouldTryItWeb,
        };
        response.benefits = {
          app: benefitsCleanseApp,
          web: benefitsCleanseWeb,
        };
        response.what_will_i_get = {
          app: whatWillIGetCleanseApp,
          web: whatWillIGetCleanseWeb,
        };
      }

      return response;
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Cleanse Programs Fetched Successfully",
        data,
        meta_data: {
          marquee_details: {
            marquee_color: "#03989F",
            text: results[0]?.program_marquee,
            redirect_page: results[0]?.redirect_page,
            params: { redirect_id: results[0]?.redirect_id },
          },
          currentPage: Number(page),
          totalPage: Math.ceil(totalCount / limit),
        },
      }),
    );
  } catch (error) {
    console.error("Error occurred while fetching cleanse programs:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getPoshanPrograms = async (req, res, next) => {
  try {
    const { program_id } = req.query;
    const validPrograms = [
      "Weaning (4 - 6 Months)",
      "Weaning (7 - 9 Months)",
      "Weaning (10 - 14 Months)",
      "Nourish",
      "Satvaa",
      "Sphoorti",
    ];

    const { results } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: [
        "pm.program_id",
        "pm.program_name",
        "pm.slug",
        "pm.web_program_banner",
        "pm.app_program_banner",
        "pm.program_description",
        "pm.program_features_web",
        "pm.ideal_for_web",
        "pm.thumbnail",
        `CONCAT(
        '[',
        GROUP_CONCAT(DISTINCT
            JSON_OBJECT(
                'program_duration', IFNULL(ps.program_duration, ''),
                'program_session_id', IFNULL(ps.program_session_id, ''),
                'mrp', IFNULL(ps.mrp, ''),
                'usd_mrp', IFNULL(ps.usd_mrp, ''),
                'session_description', IFNULL(ps.session_description, '')
            ) SEPARATOR ','
        ),
        ']'
      ) AS sessions`,
        `CONCAT(
        '[',
        GROUP_CONCAT(DISTINCT
            JSON_OBJECT(
                'coupon_program_id', IFNULL(c.program_id, ''),
                'coupon_program_session_id', IFNULL(c.program_session_id, ''),
                'coupon_type', IFNULL(c.discount_type, ''),
                'coupon_quantity', IFNULL(c.quantity, ''),
                'coupon_code', IFNULL(c.coupon_code, '')
            ) SEPARATOR ','
        ),
        ']'
      ) AS coupons`,
        `CONCAT(
        '[',
        GROUP_CONCAT(DISTINCT
            JSON_OBJECT(
                'offer_log_id', IFNULL(ofl.id, ''),
                'discount_percent', IFNULL(ofl.discount_percent, ''),
                'discount_amount', IFNULL(ofl.discount_amount, ''),
                'program_id', IFNULL(ofl.program_id, ''),
                'session_id', IFNULL(ofl.session_id, '')
            ) SEPARATOR ','
        ),
        ']'
      ) AS offer_logs`,
        "ofn.id as offer_id",
        "ofn.offer_title",
        "ofn.offer_description",
        "ofn.offer_type",
        "ofn.offer_discount_percentage",
        "ofn.offer_banners",
        "ofn.is_all_program",
        "ofn.offer_marquee",
        "ofn.start_date",
        "ofn.end_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "pm.program_id = ps.program_id AND ps.is_active = 1",
        },
        {
          type: "LEFT",
          table: `${tables.coupons} c`,
          on: `(c.program_session_id = ps.program_session_id OR c.program_id = pm.program_id) AND c.status = 'active'`,
        },
        {
          type: "LEFT",
          table: `${tables.offerLogs} ofl`,
          on: "ofl.program_id = pm.program_id OR ofl.session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.offersNew} ofn`,
          on: "ofn.id = ofl.offer_id AND ofn.is_active = 1 AND CURDATE() BETWEEN ofn.start_date AND ofn.end_date",
        },
      ],
      conditions: [
        {
          field: "pm.program_name",
          operator: "IN",
          value: validPrograms,
        },
        {
          field: "pm.is_active",
          operator: "=",
          value: 1,
        },
        program_id
          ? {
              field: "pm.program_id",
              operator: "=",
              value: program_id,
            }
          : null,
      ].filter(Boolean),
      groupBy: [
        "pm.program_id",
        "pm.program_name",
        "pm.web_program_banner",
        "pm.thumbnail",

        "pm.program_description",
      ],
    });
    if (!results || results.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No active Poshan Programs found",
          data: [],
        }),
      );
    }

    const data = results.map((program) => {
      const offer = program.offer_id
        ? {
            offer_id: program.offer_id,
            title: program.offer_title,
            description: program.offer_description,
            offer_type: {
              id: program.offer_type,
              name: offerTypes[program.offer_type] || "",
            },
            marquee: program.offer_marquee,
            start_date: program.start_date
              ? moment(program.start_date).format("YYYY-MM-DD")
              : null,
            end_date: program.end_date
              ? moment(program.end_date).format("YYYY-MM-DD")
              : null,
            offer_banners: program.offer_banners
              ? safeJSONParse(program.offer_banners, [])
              : [],
          }
        : "";

      const sessionsParsed = safeJSONParse(program.sessions, []);
      const offerLogsParsed = safeJSONParse(program.offer_logs, []);
      const couponsParsed = safeJSONParse(program.coupons, []);
      const programFeaturesWeb = safeJSONParse(
        program.program_features_web,
        [],
      );
      const flattenedProgramFeaturesWeb = programFeaturesWeb
        .filter((feature) => feature && Array.isArray(feature.points))
        .flatMap((feature) => feature.points)
        .filter(Boolean);
      const idealForWeb = safeJSONParse(program.ideal_for_web, []);
      const sessions = sessionsParsed
        .filter((session) => session.program_session_id)
        .map((session) =>
          discountCalculator({
            sessionData: session,
            programData: program,
            offerLogs: offerLogsParsed,
            couponsParsed,
          }),
        );

      return {
        program_id: program.program_id || null,
        program_name: program.program_name || "",
        slug: program.slug,
        program_banner: program.web_program_banner,
        mobile_program_banner: program.app_program_banner,
        ideal_for: idealForWeb,
        program_description: safeJSONParse(
          program.program_description,
          program.program_description,
        ),
        program_features: flattenedProgramFeaturesWeb,
        sessions: sessions,
        thumbnail: program.thumbnail || "",
        offer,
      };
    });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Poshan Programs Fetched Successfully",
        data,
      }),
    );
  } catch (error) {
    console.error("Error in getPoshanPrograms:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getTermsandCondition = async (req, res, next) => {
  return res.status(200).json(
    new ApiResponse({
      statusCode: 200,
      message: "BN - Terms & Condition",
      data: `<div class="container">
		<p>
			Our Policies are compliant with the European Union’s General Data Protection Regulation. As per the policies of the General Data Protection Regulation you as a user have more control over your own data, hereby making your experience safe and secure.
		</p>
		<h1>
			TERMS OF USE &amp; PRIVACY POLICIES
		</h1>
		<p> This user agreement (Agreement) is an agreement between you and <b>M/s Balance Nutrition</b> (Balance Nutrition or we or us as the context requires) governing your use of <b>M/s Balance Nutrition</b>'s Mobile Application (Application), website : <b>www.balancenutrition.in</b> and/or any of its services. By accessing the Application and the website www.balancenutrition.in at your sole discretion, registering and using our services as a guest/visitor or as a registered member, you agree to be bound by this Agreement and all the terms mentioned herein. This user Agreement governs your access to the Mobile Application, website any any/all of the services (programs) offered by <b>M/s Balance Nutrition</b> and shall apply to all the users, visitors and the ones who access the use of this Mobile Application and website www.balancenutrition.in and any of our services. If you do not agree with the terms and conditions mentioned in this Agreement then you as a user should stop using our Mobile Application and the website <b>www.balancenutrition.in</b> and all/any of our services immediately but if you still continue using this Application and the website then M/s Balance Nutrition shall not be liable for any consequences, losses, damage/s and liabilities whatsoever arising from this unauthorised use. By entering into this Agreement you affirm that you're not a minor and are fully able to and competent as per law to enter into this Agreement and to abide by all the terms, conditions and obligations of this Agreement. You further agree that you as a person are not barred by law to enter into a binding agreement and that you agree to use the mobile application of M/s Balance Nutrition and the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> in compliance with local, national and international laws and regulations. M/s Balance Nutrition reserves a right to revise the terms of use and Privacy Policies on the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and on the mobile application (on Google Pay and on IOS) at any given point of time by amending this page and providing information about the updated policies. These terms of use shall be posted on the Mobile Application and the website and you as a user are expected to check this page from time to time and take note of the changes made, as they are binding on you as a user. All the changes made on the website and the mobile application are effective as soon as they are published on the Mobile Application - Balance Nutrition and the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and you agree to be bound by the revised terms and conditions of use and all the policies.
		</p>

		<h2>TERMS AND CONDITIONS</h2>
		<p>By subscribing to our services you accept and agree to all the terms and conditions mentioned on the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and the Mobile Application - Balance Nutrition ( hereinafter referred to as “Terms”). It is therefore important that you read through all the terms and conditions carefully. You are hereby notified and informed that you should not register with us or any of our services if you do not consent to these terms and conditions.</p>


		<h2>USE OF OUR SERVICES</h2>
		<p>
			Balance Nutrition is a service developed and provided by M/s Balance Nutrition. Services provided by M/s Balance Nutrition are available online through our website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and on Google Play store and Apple App Store through a Mobile Application - “Balance Nutrition”. M/s Balance Nutrition shall strive to provide you with the best possible nutritional and health information. These services are available for your personal use and consumption only and are not meant for commercial use. By agreeing to the use of services of M/s Balance Nutrition and agreeing to its terms mentioned you agree that:-
		</p>
		<ol style="list-style-type: decimal;">
			<li>You shall provide your accurate personal data i.e. Name, Age, address, mobile number, height, weight, medical condition/s, physical activity, daily regime etc as and when asked for.</li>
			<li>Your membership/ subscription with M/s Balance Nutrition is of a personal nature and under no circumstances shall be transferred to anybody else.</li>
			<li>Balance Nutrition shall be authorised to remove user material/s from the service and/or user account if it is found to be inappropriate for others.</li>
			<li>You shall be responsible for storing your login credentials safely so as to prevent misuse of your account.</li>
			<li>M/s Balance Nutrition shall in no way whatsoever be responsible for losses or damage/s caused by unauthorised access or login of your account. You shall inform M/s Balance Nutrition immediately if you suspect unauthorised access or login of your account.</li>
			<li>You are not under the age of 13. M/s Balance Nutrition’s services are not meant for anybody who is below the age of 13.</li>
			<li>You shall not engage in any illegal or unlawful activities on the Mobile Application or the website www.balancenutrition.in, such as posting or contributing to any information that may contain or involve incitement, pornography, defamation, child pornography, racial hatred etc.</li>
			<li>You shall not contribute to any religious or political views or any form of propaganda.</li>
			<li>You shall not share any other person’s personal information.</li>
			<li>Your next program/ diet session depends on the progress made in your earlier session and information shared by you (reply to questions asked by your mentor/dietician)  hence all the diet sessions cannot and shall not be sent to you together.</li>
			<li>Violation of any of the terms of M/s Balance Nutrition shall lead to termination of your user account and services.</li>
		</ol>
	

		<h2>INFORMATION ABOUT PERSONAL DATA WE COLLECT</h2>
		<p>
			This policy tells you about how we at M/s Balance Nutrition use the personal information collected on our mobile Application and our website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> . When you register with our services or signup on our Mobile Application - Balance Nutrition and/or our website www.balancenutrition.in we collect your personal data (general information) at the time of registration like your first name, last name, mobile number, email address, postal address, country of residence, geo-location, IP address, height, weight, date of birth (dd/mm/yyyy), gender, body type, medical condition, menstruation (whether on time or not) health issues, body measurement, sleeping pattern, smoking habits (if any) alcohol consumption pattern (if any), daily activity levels water intake, fruits and vegetables intake, eating habits etc. On the basis of the information provided by you M/s Balance Nutrition provides you, the user with his/her Body Mass Index, health score and weight report in addition to providing you with what your ideal weight should be. You (the user) can choose whether to provide us with information or not but you may not be able to register yourself on the mobile Application, enroll with us or take advantage of all the features unless certain information is provided by you. The information you provide to M/s Balance Nutrition is used to fulfil your specific requests. By agreeing to our terms and conditions you also consent to the use of information provided by you to send you emails /newsletters, health tips and text messages to provide you with informative services, latest offers, policy changes etc. For users of our subscription services the information is also used to remind you (the users) about membership renewal and/or to confirm your orders and to send you recipes, health tips , new updates etc. To know more about Balance Nutrition’s data protection practices, please read our privacy policy mentioned below. This policy explains to you as to how your personal information is treated by M/s Balance Nutrition and how M/s Balance Nutrition protects your privacy when you use its Services.
		</p>


		<h2>COOKIES <small><u>(meant only for use of the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a>)</u></small></h2>
		<p>
			Our website www.balancenutrition.in may use cookies and tracking technology depending on the features offered. Cookies and tracking technology are useful for gathering information such as browser type and operating system, tracking the number of visitors to our website, and understanding how visitors use our website. Cookies can also help customize the website for visitors. Personal information cannot be collected via cookies and other tracking technology, however, if you previously provided personally identifiable information, cookies may be tied to such information. You may choose to block and prevent use of cookies through your browser and mobile phone device but that may prevent you from taking advantage of our Mobile Application’s most features. We may use the information shared by you on the website to only understand as to how people use our website, what features do your users like and to further provide you best online experience.
		</p>


		<h2>USE OF SUBSCRIBED SERVICES</h2>
		<p>
			Certain portions, components, contents and features of our Mobile Application - Balance Nutrition and our Website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> are available only to such individuals who purchase our services as available on our mobile Application - Balance Nutrition (on Google Play and IOS) and/or our Website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> . These services are referred to as Subscribed Services in this Agreement for the sake of brevity. As a subscriber to the Subscribed Services, you agree:
		</p>
	
        <p>To pay for in a timely manner any fixed and periodic charges and fees required for the Subscribed Services along with any Applicable government taxes. Unless payments, as required are received by M/s BALANCE NUTRITION, the Subscribed Services shall not be available to you. M/s BALANCE NUTRITION shall not be responsible for any non-receipt of fees on account of any faults in the payment gateway or internet connection or postal delays. The subscribed services are non- transferable and the fees paid are non refundable under all circumstances . Every subscribed service must be consumed within the set days provisioned and mentioned clearly on the program page. The validity period for a 1 day program is 3 days, the validity period of a 3 days program is 5 days, the validity period for a 10 days program is 15 days, the validity period for a  30 days program is 45 days, the validity period for a 60 days program is 80 days, the validity period for a 90 days program is 115 days and the validity period for a 120 days program is 150 days and no further extensions shall be granted beyond the program validity under any circumstance/s.</p>
        <p>The diet plans/sessions given to the user by M/s Balance Nutrition shall be available/ visible in the Accounts section until the validity period of the program as mentioned above. The user has the option to save or print the same until the validity of the program. M/s Balance Nutrition shall not be responsible if the user is unable to print the diet plan subscribed  for whatsoever reason/s during the validity of the program and shall further not be entitled to ask for a copy after the validity of the program. M/s Balance Nutrition reserves the right to increase charges and fees, or to institute new charges or fees at any time, communicated through a posting on the Website and/or Mobile Application or such other means as we may deem appropriate from time to time (including electronic mail or conventional mail). The revised/enhanced fees shall be paid within 21 days of the date of the above communication failing which the program shall stand terminated without prior intimation.</p>
        <p>To pay the entire fees for the Subscribed Services / program along with any applicable government taxes in advance (100%). The fees are non-refundable under any circumstances regardless of whether you (the user) have utilized the subscribed services or not. No request/s for refund shall be entertained by M/s Balance Nutrition.</p>
        <p>For any reward schemes announced validity dates of the program will be strictly enforced and no extension will be considered. Final discretion of deciding on any kind of reward announced in any offer will be with M/s Balance Nutrition.</p>
        <p>For any kind of reward on referral points or of any other kind final authentication for eligibility will have to be done by M/s Balance Nutrition and M/s Balance Nutrition will have sole discretion on the matter.</p>
        <p>To be responsible for all charges and fees associated with connecting to the Website and/or mobile Application and the Subscribed Services, including without limitation all your telephone access lines, internet service provider fees, telephone and computer equipment, sales taxes and any other fees and charges necessary to access Subscribed Services.</p>
        <p>To provide us with true, accurate and complete information as required during the sign-up process ("Subscription Data") for purposes of your use of the Subscribed Services (data as mentioned above). To provide us with data and information as and when required from time to time to enable us to plan your diet sessions/programs. You shall accurately maintain and update the Subscription Data on the Mobile Application  / Website. Notwithstanding any other provision of this Agreement, if you provide any information that is untrue, inaccurate, or incomplete, or we have reasonable grounds to suspect that such is the case, we reserve the right to suspend or terminate your user account or subscription and refuse any or all current or future use by you of our Website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and our mobile application(or any portion thereof) or any of Subscribed Services. You are obligated to check the "My Account" feature of our Website and mobile Application to determine whether your Subscription Data is accurate, and, if not, to correct or update your Subscription Data including your billing information and other details asked for. You agree not to register or subscribe for more than one account, create an account on behalf of someone else, or create a false or misleading identity on the Website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> or on the Mobile Application - Balance Nutrition.</p>
        <p>That the availability and use of our Subscribed Services may be limited based on demographic, geographic, health or other criteria as we may establish or change at our discretion. You understand and agree that we may disallow you from subscribing to the Subscribed Services or may terminate your subscription to the Subscribed Services at any time based on the criteria mentioned above.</p>
        <p>On revocation or termination of your registration, not to register or subscribe again with our Website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> or our Application or by using another user name or through any other means. If M/s Balance Nutrition has reason to suspect, in its sole discretion, that your account has previously been terminated, M/s Balance Nutrition reserves the right to terminate any new accounts you have registered without any notice, or to exercise any other remedies available to them under this Subscription Agreement or by law.</p>
        <p>To be fully responsible for maintaining the confidentiality of your password and user account information. You must notify M/s Balance Nutrition immediately in the event of any known or suspected unauthorized use of your user account, or any known or suspected breach of security, including loss, theft, or unauthorized disclosure of password. In the event of a breach of security, you will remain liable for any unauthorized use of your subscription until you update your Subscription Data. You shall be entirely responsible for any and all activities which occur under your user account. You shall remain solely responsible for paying any amounts billed to your credit card by a third party which were not authorized by you.</p>
        <p>Not to post on the service, any material protected by copyright, trademark, or other proprietary right (which you as a user are not the owner of) without the express permission of the owner of the copyright, trademark or other proprietary right. You agree that the posting of any material by you shall imply that the copyright, trademark or other proprietary right in that material rests with you. You agree and acknowledge that you shall be solely liable for any action/s or damages resulting from any infringement of copyrights, trademarks, or proprietary rights, or any other harm resulting from any posting made by you.</p>
        <p><b>Please Note:-</b> Women who conceive in the middle of an existing program/during their program/while on a program with us (get pregnant) shall be given an option to either upgrade to the pregnancy program by paying the differential amount or to take guidelines for their entire term of pregnancy. The current program and the pending sessions shall not be converted to a pregnancy program without the upgrade by paying the differential amount or they shall have an option to freeze their current / subsisting  program and sessions on payment of applicable freezing charges.
</p>


		<!--<h2>PAYMENT</h2>
		<p>
			M/s Balance Nutrition takes payments from users on the mobile application and the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> only through third party payment gateways. In case of any disputes regarding the payments made, M/s Balance Nutrition shall pass the same to the payment gateway provider for the dispute resolution. Our payment gateway providers use secure encryption technology in order to keep your transactions safe and secure at all times. M/s Balance Nutrition shall not be held responsible in whatsoever manner for payment disputes. Under no circumstances shall a user be entitled for a refund from M/s Balance Nutrition at any given point of time whether he/she has availed the services or not. Payment once made to M/s Balance Nutrition shall not be refunded. Please note that we do not collect your Credit Card/ Debit Card information as all payments are made through third party payment gateways.
		</p>-->


		<h2>BN-WALLET SECTION</h2>
		<p>
			BN-WALLET SECTION is designed for all the clients of M/s Balance Nutrition who subscribe to its services. BN-Wallet Section is available on the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and the Mobile Application on successful registration. Registered users of subscribed services can earn reward points/loyalty points from existing subscriptions, client referrals, targeted weight loss and frequent service purchases, specific updates and the same shall be credited to a user’s BN-WALLET SECTION in the account on the mobile application and the website www.balancenutrition.in . The reward points/loyalty points so collected can be used to avail discounts on new plans/subscriptions. Please note that reward points/loyalty points are non-transferable and the same cannot be exchanged for money. Users can only avail discounts using the reward points/ loyalty points which shall be available to users at the time of making payments for the new subscriptions. The loyalty/reward points shall be valid for a period as announced from time to time and the validity of the same cannot be extended under any circumstance/s. The validity and redemption  of the reward/loyalty shall solely be decided by M/s Balance Nutrition and is and shall always be made available at the discretion of M/s Balance Nutrition. M/s Balance Nutrition shall reserve a right to deduct  reward /loyalty points or block the BN - Wallet for users who provide false information and / or references. M/s Balance Nutrition shall credit loyalty / reward for client referrals to a user’s account once the client referred by them successfully enrols and subscribes to the services offered by M/s Balance Nutrition.
		</p>


		<h2>CHILDREN</h2>
		<p>
			M/s Balance Nutrition does not knowingly or unknowingly seek or collect any personal information from children that are under the age of 13. If at any point of time Balance Nutrition realises that it has inadvertently gathered any sort of personal information from a user who is under the age of 13 then the same shall be deleted from our records immediately. Our website www.balancenutrition.in and our mobile application does not allow users below the age of 13 to register. If you are under the age of 13 then you are not allowed to provide and submit any personal data to us. If you are aware that a child under the age of 13 has submitted any personal data to us then please contact us immediately on info@balancenutrition.in.
		</p>


		<h2>GENERAL DATA PROTECTION REGULATION:</h2>
		<p>Policies of M/s Balance Nutrition are compliant with the European Union’s General Data Protection Regulation. As per the policies of the General Data Protection Regulation, you shall have more control over your data, hereby making your experience safe and secure. You as a user have the right to ask for rectification (amendment), deletion of your data by writing to us on info@balancenutrition.in. You as a user have the right to be informed about the manner in which your personal data is collected and used. You further have a right to access your own data in the My Accounts section of our Mobile Application and the website www.balancenutrition.in and a copy of the same can also be availed by e-mailing us on info@balancenutrition.in . You can contact our grievance officer Mr. Vikram Gupta on Contact Number: 022-26600273 E-mail ID info@balancenutrition.in in case you wish to exercise any of the above mentioned rights as a user.</p>

		<h3>PROFILING</h3>
		<p>
			M/s Balance Nutrition’s services are knowledge based and we use the best practices in the industry to make sure our clients benefit from our services. We hire/work with expert nutritionists to add value to our services. In addition to that we analyse your usage of our services in order to give all our users relevant features as per their likes. In order to analyse your usage of the services M/s Balance Nutrition processes certain data for the profiling purposes. Profiling means that we will analyse the way you use our services on the basis of the data you process. We further analyse user habits, services that keep the users engaged and search for ways or methods to make our services more effective, user friendly and vary the features as per individual usage patterns. Our processing of your personal data for profiling does not require any consent as a legal ground. If under any provisions relevant personal data consent is required for the use of data processed as mentioned above then by accepting the terms you have hereby given your consent to M/s Balance Nutrition to use the personal data processed by you for the purpose of profiling, improving services and for providing you with customer support.
		</p>

		<h3>MARKETING</h3>
		<p>
			M/s Balance Nutrition may use your personal data for profiling and marketing via emails, notifications, updates, calls or messages by M/s Balance Nutrition. Profiling may be used for marketing purpose to enable personalized features/experiences based on your preferences and usage pattern. No personal data provided by you shall be transferred to any third party for any purposes. The data you process on the Application or the website of M/s Balance Nutrition shall only be used to provide you best services and relevant user experience. In case you do not want Balance Nutrition to use your personal data for the purpose of marketing you may at any given point of time click “UNSUBSCRIBE” at the bottom of the email or write to us at info@balancenutrition.in.
		</p>


		<h3>RECTIFICATION OR DELETION</h3>
		<p>
			You as a user have complete control over your data and what you process and hence you have the right to access and to rectify or deletion of your personal data by M/s Balance Nutrition. If you make a request for rectification that concerns data that is compulsorily required by M/s Balance Nutrition for offering you services then such a request will have an effect of account termination by M/s Balance Nutrition. All your requests for Rectification or Deletion of personal data shall be made on info@balancenutrition.in in addition to a written Application made by you which must be signed.
		</p>


		<h3>CANCELLATION OF ACCOUNT</h3>
		<p>
			You can at any point of time choose to cancel your subscription or to deactivate your account. It is pertinent to note that uninstalling the Balance Nutrition Application will not deactivate your account or cancel your subscription. You can cancel your subscription from the mobile Application or the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a>.
		</p>


		<h3>PUBLISHED CONTENT</h3>
		<p>
			All success stories, recipes, testimonials, comments, messages and any other content conveyed or published  by you on the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a>, the mobile Application and/pr any other platform owned and managed by M/s Balance Nutrition shall be published content. By this user agreement you as a client grant M/s Balance Nutrition a License and authority  to publish such content on social media and/or any other platform owned and managed by M/s Balance Nutrition. You may by a communication to us in writing at any time may ask such published content to be taken down.

		</p>

		<h3>GRIEVANCE OFFICER</h3>
		<p>
			In case of any complaints or grievances regarding processing of your personal data on the website www.balancenutrition.in or our mobile Application or any of our services then you may contact our grievance officer on Contact Number: 022-26600273 email: info@balancenutrition.in having address at Sai mansarovar building, 1st floor, S.V. Road, above HP World Showroom, Santacruz West, Mumbai 400054, Maharashtra, India.
		</p>



		<h3>USE OF PERSONAL INFORMATION</h3>
		<p>
			The information that you as a visitor/user, client share with us on this mobile Application or our website www.balancenutrition.in is used to personalize and improve your experience continuously. We at M/s Balance Nutrition also use this information to assist our employees to process your information in our database, to help you and the mentors(nutritionists) and other employees of M/s Balance Nutrition to communicate regarding services, products, offers and promotions, billing information, reviews etc. We further use the information shared by you to improve our website and to detect frauds and to give you a risk free experience every time you visit our website, domain, mobile Application etc.
		</p>
		<p>
			We may share this information with government agencies or other companies assisting us in fraud prevention or investigation. We may do so when: (1) permitted or required by law; or, (2) trying to protect against or prevent actual or potential fraud or unauthorized transactions; or, (3) investigating fraud which has already taken place.
		</p>



		<h3>COMMITTED TO DATA SECURITY</h3>
		<p>
			Your personally identifiable information is kept secure. Only authorized employees (who have agreed to keep information secure and confidential) have access to this information. The security of your personal information is important to us at M/s Balance Nutrition. We use accepted industry standards and technologies like firewalls, security software etc to protect your personal data against unauthorised access in addition to complying with the relevant personal data regulations. You are however aware that no security system is 100% secure and despite our best efforts there is always a risk of unauthorised access to your data. We at M/s Balance Nutrition therefore request you to use a very strong password for your user account with M/s Balance Nutrition and to keep the login account and password safely. Our endeavour shall always be to safeguard your security information and personal details in every possible manner.
		</p>


		<h3>CHANGES TO THE POLICIES</h3>
		<p>
			M/s Balance Nutrition may have to make changes or update the Privacy Policies from time to time in accordance with the change in laws and change in circumstances. These changes shall be incorporated by giving a notice to you. You are bound by all the policy changes if you continue using this mobile Application and our website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a>. The date of last modification shall be posted right before the Privacy Policies.
		</p>


		<h3>HEALTH DISCLAIMER</h3>
		<p>
			You shall be responsible for your own health. M/s Balance Nutrition is an organisation that only gives you diet plans/programs to stay fit and to live a healthy lifestyle. M/s Balance Nutrition is not a medical organisation and hence we do not provide you with any medical advice or diagnosis. Information made available by the subscription of our services through the Application and the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> is only for informative purposes. You must always consult your doctor/physician before starting any diet/nutrition plan or if you feel any pain or discomfort. We do not guarantee any weight loss or health improvement. M/s Balance Nutrition shall in no way be held responsible for any personal injury or any other damages caused to you by use or misuse of our Services.
		</p>


		<h3>INTELLECTUAL PROPERTY</h3>
		<p>
			All rights in and to the Services, including any trademarks, trade names, logos, illustrations, service marks, copyrighted content (collectively referred to as “Intellectual Property” presented within the services i.e. on the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> , the mobile Application : Balance Nutrition and any other platform shall always be the property of M/s Balance Nutrition. You undertake to not use the Intellectual Property for any other purposes except till the extent of services provided to you.
		</p>


		<h3>DISCLAIMER</h3>
		<p>
			The information shared on this Mobile Application and on the website www.balancenutrition.in is general information provided by M/s BALANCE NUTRITION and while we endeavor to keep the information up to date and correct, we make no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, suitability or availability with respect to the website or the information, services, or related graphics contained on the website for any purpose. Any of such information is therefore strictly at your own risk.
		</p>
		<p>
			In no event shall M/s Balance Nutrition be liable for any loss or damage including without limitation, direct, indirect or consequential loss or damage, or any loss or damage whatsoever arising from loss of data, health or profits or any loss or damage arising out of, or in connection with the use of this Application or the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> . You hereby indemnify and agree to hold M/s Balance Nutrition  harmless from loss or damage of whatsoever nature caused to you or any other person from the use of our services. Every effort is made to keep the website www.balancenutrition.in and this mobile Application up and running smoothly. However, M/s BALANCE NUTRITION takes no responsibility for, and will not be liable for, this mobile Application and the website www.balancenutrition.in being temporarily unavailable due to technical issues beyond the control of M/s Balance Nutrition.
		</p>


		<h2>GOVERNING LAW &amp; DISPUTE RESOLUTION</h2>
		<p>
			By subscribing to our services and by using the website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and Mobile Application - Balance Nutrition you agree, as we do that only the Courts in Mumbai, India shall have exclusive jurisdiction for claims arising out of or relating to these terms and conditions and/or all the Service provided by M/s Balance Nutrition. M/s Balance Nutrition accepts no liability whatsoever, direct or indirect, for non-compliance with the laws of any country other than that of India, the fact that our website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and our mobile Application can be accessed or used or any of our facilities can be availed of in a country other than India will not imply that we accede to the laws of such country.
		</p>
        
        <h2>ARBITRATION</h2>
		<p>
			Any dispute, claim or controversy arising out of or relating to this Agreement, including the determination of the scope or applicability of this Agreement to arbitrate, or your use of the Website, the Mobile Application - Balance Nutrition (on Android and IOS platform) or the Services or information to which it gives access, shall be determined by arbitration in India, before a sole arbitrator appointed by M/s Balance Nutrition. Arbitration shall be conducted in accordance with the Arbitration and Conciliation Act, 1996. The seat of such arbitration shall be Mumbai. All proceedings of such arbitration, including, without limitation, any awards, shall be in the English language. The award shall be final and binding on the parties to the dispute.
		</p>    
		<p>Subject to the above Clause, the courts at Mumbai shall have exclusive jurisdiction over any disputes arising out of or in relation to this Agreement, your use of the Website or the Services or the information to which it gives access.</p>

		<h3>ENTIRE AGREEMENT :-</h3>
		<p>
			This Agreement constitutes the entire agreement between you i.e. the user and M/s Balance Nutrition relating to the website www.balancenutrition.in and this mobile Application “Balance Nutrition” and supersedes all prior or contemporaneous oral or written communications including but not limited to any terms and conditions of purchase, proposals and representations with respect to the Application or any other subject matter covered by this Agreement. The headings in this Agreement are for convenience only and do not affect the interpretation of this Agreement.
		</p>

		<h3>SEVERABILITY CLAUSE</h3>
		<p>
			If any provisions of this Agreement is/are held to be void, invalid, unenforceable or illegal by a court of competent jurisdiction then other such provisions shall be set aside and the remaining provisions shall continue in full force and effect.
		</p>

		<h3>RELATION BETWEEN WEBSITE AND LEGAL NAME</h3>
		<p>
			The website <a href="https://www.balancenutrition.in/">www.balancenutrition.in</a> and the associated mobile Application “BalanceNutrition”, are registered and owned by <br>M/s Balance Nutrition.
		</p>


		<h2>CONTACT US</h2>
		<p>
			M/s Balance Nutrition shall communicate with you vide email and notices posted on your mobile device. We welcome your feedback regarding our services. If you have any questions or suggestions regarding our privacy policies, then you can contact us on <a href="mailto:info@balancenutrition.in">info@balancenutrition.in</a>.
		</p>

	</div>`,
    }),
  );
};

const websiteHomePage = async (req, res, next) => {
  try {
    const { results: successStories } = await readRecord({
      selectFields: ["*"],
      table: `${tables.successStories}`,
      conditions: [{ field: "id", operator: "IN", value: [181, 180, 139] }],
      orderBy: ["FIELD(id,181,180,139)"],
    });
    const successStoriesData = successStories.map((row) => {
      return {
        id: row.id,
        client_details: JSON.parse(row.client_details),
        images: [
          ...JSON.parse(row.photo_before || "[]"),
          ...JSON.parse(row.photo_after || "[]"),
          ...JSON.parse(row.photo_before_after || "[]"),
        ],
        program_details: JSON.parse(row.program_details),
        health_conditions: JSON.parse(row.health_conditions) || [],
        description: row.description,
        status: row.status,
        slug: row.slug,
        short_descriptions: row.short_descriptions,
        long_descriptions: row.long_descriptions,
        social_media_id: row.social_media_id,
        mentor: row.mentor,
        post: row.post ? "done" : "pending",
        story: row.story ? "done" : "pending",
        what_i_eat_in_a_day: row.what_i_eat_in_a_day ? "done" : "pending",
        reel_transformation: row.reel_transformation ? "done" : "pending",
        website_link: row.website_link ? "done" : "pending",
        tags: JSON.parse(row.hashtags) || [],
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        meta_data: {
          total_weight_loss: row.weight_loss,
          check_list: [
            {
              after_photo: JSON.parse(row.photo_after || "[]"),
              before_photo: JSON.parse(row.photo_before || "[]"),
              before_after_photo: JSON.parse(row.photo_before_after || "[]"),
              testimonial_video: JSON.parse(row.testimonial_video || "[]"),
              what_i_eat_in_a_day: row.what_i_eat_in_a_day
                ? row.what_i_eat_in_a_day
                : "",
              reel_transformation: row.reel_transformation
                ? row.reel_transformation
                : "",
              story: row.story ? row.story : "",
              post: row.post ? row.post : "",
              website_link: row.website_link ? row.website_link : "",
            },
          ],
        },
      };
    });
    const { results: healthReads } = await readRecord({
      selectFields: [
        "bp.postId AS id",
        "bp.postTitle AS post_name",
        "bp.slug",
        "bp.postDesc AS description",
        "bp.postCont",
        "bp.hashtags",
        "bp.category_id",
        "bp.postBannerBig",
        "bp.postBannerSmall",
        "bp.seoKeywords",
        "bp.seoDescription",
        "bp.seoTitle",
        "bp.seoSubject",
        "bp.seoAuthor",
        "bp.seoSubtitle",
        "bp.created_at AS date_of_post",
        "bp.updated_at",
        "bp.postStatus",
        "bp.is_deleted",
        "bp.deleted_by",
        "bp.deleted_at",
        "bp.status AS status",
        "c.catTitle AS category",
        "bp.view_count",
      ],
      table: `${tables.blogPosts} bp`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.blogPostsCategory} c`,
          on: `bp.category_id = c.catID`,
        },
      ],
      conditions: [{ field: "postID", operator: "IN", value: [100, 160, 184] }],
      orderBy: ["FIELD(postID,100,160,184)"],
    });
    const healthReadsData = healthReads.map((row) => {
      // const tags = row.hashtags_id
      //   ? JSON.parse(row.hashtags_id).map((id) => hashtagMap[id])
      //   : [];

      const validJsonString = row.hashtags.replace(/'/g, '"');
      const hashtagsArray = safeJSONParse(validJsonString, []);

      return {
        id: row.id,
        post_name: row.post_name,
        category: row.category,
        description: row.description
          ?.replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'"),
        status: row.status,
        post_banner_small_images: JSON.parse(row.postBannerSmall),
        tags: hashtagsArray,
        date_of_posted: moment(row.date_of_post).format("Do MMM YYYY"),
        updated_at: row.updated_at,
        view_count: row.view_count,
        meta_data: {
          slug: row.slug,
          postCont: row.postCont,
          seoKeywords: row.seoKeywords,
          seoDescription: row.seoDescription,
          seoTitle: row.seoTitle,
          seoSubject: row.seoSubject,
          seoAuthor: row.seoAuthor,
          seoSubtitle: row.seoSubtitle,
          category_id: row.category_id,
        },
      };
    });
    const { results: experts } = await readRecord({
      selectFields: [
        "admin_user_id as id",
        "email_id as counsellor_email",
        "crm_user as counsellor_name",
        "designation as counsellor_post",
        "official_phone as counsellor_mobile",
        "education as qualification",
        "expertise as counsellor_speciality",
        "total_clients",
        "TIMESTAMPDIFF(YEAR, total_experience, CURDATE()) as experience",
        "photo as image",
      ],
      table: `${tables.adminUsers}`,
      conditions: [
        {
          field: "is_active",
          operator: "=",
          value: "1",
        },
        { field: "available_for_consultation", operator: "=", value: 1 },
      ],
      orderBy: ["sequence"],
    });
    const expertsData = experts.map((item) => {
      return {
        ...item,
        counsellor_post: item.counsellor_post.split("(")[0].trim(),
        image: JSON.parse(item.image || "[]"),
      };
    });
    const { results: offerDetails } = await readRecord({
      table: `${tables.offersNew} ofn`,
      selectFields: [
        "ofn.id as offer_id",
        "ofn.offer_title",
        "ofn.offer_description",
        // "ofn.offer_type",
        // "ofn.offer_discount_percentage",
        "ofn.offer_banners",
        "ofn.redirect_page",
        "ofn.redirect_id",

        // "ofn.is_all_program",
        "ofn.offer_marquee",
        // "ofn.start_date",
        // "ofn.end_date",
      ],
      conditions: [
        { field: "ofn.is_active", operator: "=", value: 1 },
        {
          field: "ofn.offer_for",
          operator: "=",
          value: 1,
        },
      ],
    });

    const { results: popup } = await readRecord({
      table: `${tables.drafts} d`,
      selectFields: ["d.*"],
      conditions: [{ field: "d.drafts_id", operator: "=", value: 2995 }],
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Home Page Data Fetched Successfully",
      data: {
        success_stories: successStoriesData,
        health_reads: healthReadsData,
        experts: expertsData,
      },
      meta_data: {
        marquee_text: {
          marquee_color: "#03989F",
          text: offerDetails[0].offer_marquee,
          redirect_page: offerDetails[0].redirect_page,
          params: { redirect_id: offerDetails[0].redirect_id },
        },
        pop_up_text: popup?.[0]
          ? {
              title: popup[0].title,
              description: popup[0].description,
              button_one_name: popup[0].button_one_name,
              button_one_redirect: popup[0].button_one_redirect,
              button_two_name: popup[0]?.button_two_name,
              button_two_redirect: popup[0]?.button_two_redirect,
              ...(popup[0].button_two_name
                ? {
                    button_two_name: popup[0].button_two_name,
                    button_two_redirect: popup[0].button_two_redirect,
                  }
                : {}),
              image: JSON.parse(popup[0].image || "[]"),
            }
          : popUpDetailsMap["home_page_web"],
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(ErrorHandler("Internal Server Error", 500));
  }
};

const getPrivyAndPlatniumProgramRates = async (req, res, next) => {
  try {
    const slugToIdMap = {
      "weight-loss-pro": [139, 140],
      "beat-pcos": [143, 144],
      "weight-loss-plus": [141, 142],
      "body-transformation": [145, 146],
      active: [137, 138],
      reneu: [149, 150],
      "plateau-breaker": [147, 148],
      "slim-possible": [155, 156],
      "slim-smart": [153, 154],
      "reform-intermittent": [151, 152],
      "adv-plateau-breaker": [166, 169],
      "adv-reform-intermittent": [167, 168],
    };

    // 139,140,143,144,141,142,145,146,137,138,149,150,147,148,155,156,153,154,151,152

    const getIdFromSlug = (slug) => {
      return slugToIdMap[slug] || [147, 148]; // returns null if slug is invalid
    };

    const slug = req.query.slug; // assuming slug comes from query string
    const programId = getIdFromSlug(slug);

    const { results } = await readRecord({
      selectFields: [
        "pm.program_name",
        "ps.mrp",
        "ps.discount_percentage",
        "ps.discount_amount",
        "ps.program_duration",
        "ps.program_session_id",
      ],
      table: `${tables.programsMaster} pm`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: `pm.program_id = ps.program_id`,
        },
      ],
      conditions: [
        { field: "pm.program_id", operator: "IN", value: programId },
      ],
      orderBy: ["pm.program_name", "ps.program_duration"],
    });
    if (results.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No Privy and Platnium Program Rates Found",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const { results: successStories } = await readRecord({
      selectFields: ["*"],
      table: `${tables.successStories}`,
      conditions: [{ field: "id", operator: "IN", value: [458, 479, 529] }],
      orderBy: ["FIELD(id,458,479,529)"],
    });
    const successStoriesData = successStories.map((row) => {
      return {
        id: row.id,
        client_details: JSON.parse(row.client_details),
        images: [
          ...JSON.parse(row.photo_before || "[]"),
          ...JSON.parse(row.photo_after || "[]"),
          ...JSON.parse(row.photo_before_after || "[]"),
        ],
        program_details: JSON.parse(row.program_details),
        health_conditions: JSON.parse(row.health_conditions) || [],
        description: row.description,
        status: row.status,
        slug: row.slug,
        short_descriptions: row.short_descriptions,
        long_descriptions: row.long_descriptions,
        social_media_id: row.social_media_id,
        mentor: row.mentor,
        post: row.post ? "done" : "pending",
        story: row.story ? "done" : "pending",
        what_i_eat_in_a_day: row.what_i_eat_in_a_day ? "done" : "pending",
        reel_transformation: row.reel_transformation ? "done" : "pending",
        website_link: row.website_link ? "done" : "pending",
        tags: JSON.parse(row.hashtags) || [],
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        meta_data: {
          total_weight_loss: row.weight_loss,
          check_list: [
            {
              after_photo: JSON.parse(row.photo_after || "[]"),
              before_photo: JSON.parse(row.photo_before || "[]"),
              before_after_photo: JSON.parse(row.photo_before_after || "[]"),
              testimonial_video: JSON.parse(row.testimonial_video || "[]"),
              what_i_eat_in_a_day: row.what_i_eat_in_a_day
                ? row.what_i_eat_in_a_day
                : "",
              reel_transformation: row.reel_transformation
                ? row.reel_transformation
                : "",
              story: row.story ? row.story : "",
              post: row.post ? row.post : "",
              website_link: row.website_link ? row.website_link : "",
            },
          ],
        },
      };
    });
    const privy = results.filter(
      (item) =>
        item.program_name.includes("Privy") ||
        item.program_name.includes("Mentor"),
    );

    const platinum = results.filter(
      (item) =>
        !item.program_name.includes("Privy") &&
        !item.program_name.includes("Mentor"),
    );

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Privy and Platnium Program Rates Fetched Successfully",
      data: {
        privy,
        platinum,
        success_stories: successStoriesData,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(ErrorHandler("Internal Server Error", 500));
  }
};

export const franchiseChapter = async (req, res, next) => {
  try {
    const { name, email, phone_code, phone_number } = req.body;

    // Basic validation
    if (!name || !email || !phone_code || !phone_number) {
      return next(new ErrorHandler("All fields are required", 400));
    }

    // Insert user using helper
    const insertResult = await insertRecord(
      tables.franchiseChapter,
      ["name", "email", "phone_code", "phone_number"],
      [name, email, phone_code, phone_number],
    );

    if (!insertResult || insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to insert franchise_chapter", 500));
    }

    return res.status(201).json({
      status: "success",
      message: "franchise_chapter added successfully",
      userId: insertResult.insertId,
    });
  } catch (error) {
    console.error("Error in franchise_chapter:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


export const nutripreneurEnquiry = async (req, res, next) => {
  try {
    const { full_name, phone_number, city, occupation } = req.body;


    if (!full_name || !phone_number || !city || !occupation) {
      return next(new ErrorHandler("All fields are required", 400));
    }

    const insertResult = await insertRecord(
      tables.nutripreneurEnquiry,
      ["full_name", "phone_number", "city", "occupation"],
      [full_name, phone_number, city, occupation],
    );

    if (!insertResult || insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to insert nutripreneur enquiry", 500));
    }

    const htmlString  = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nutripreneur Enquiry</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td>
              <h2 style="color: #333333; text-align: center;">New Enquiry Details</h2>
              <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;">
              <p style="font-size: 16px; color: #555555;"><strong>Full Name:</strong> ${full_name}</p>
              <p style="font-size: 16px; color: #555555;"><strong>Phone Number:</strong> ${phone_number}</p>
              <p style="font-size: 16px; color: #555555;"><strong>City:</strong> ${city}</p>
              <p style="font-size: 16px; color: #555555;"><strong>Occupation:</strong> ${occupation}</p>
              <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;">
              <p style="font-size: 14px; color: #999999; text-align: center;">
                This email was generated automatically. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
    await sendMailUtil({
      from: 'empower@balancenutrition.in',
      to: 'empower@balancenutrition.in',
      cc: [
        'accounts@balancenutrition.in', 
        'vishalrupani@balancenutrition.in',
        'kushal.agrawal@balancenutrition.in',
        'krishna.sidhpura@balancenutrition.in',
      ],
      bcc: ["testerteam@balancenutrition.in"],
      subject: `New Nutripreneur Enquiry - ${full_name}`,
      html:htmlString,
    });

    return res.status(201).json({
      status: "success",
      message: "Nutripreneur Enquiry added successfully",
      userId: insertResult.insertId,
    });
  } catch (error) {
    console.error("Error in adding nutripreneur enquiry :", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addFranchiseInquiry = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      country,
      state,
      city,
      pincode,
      franchise_location,
      have_place_or_rent_plan,
      investment_amount_in_lacs,
      interest_reason,
      industry_interest,
      background,
      franchise_motivation,
    } = req.body;

    if (!name || !phone || !email || !franchise_location) {
      return next(new ErrorHandler("Required fields missing", 400));
    }

    const insertResult = await insertRecord(
      tables.franchiseInquiries,
      [
        "name",
        "phone",
        "email",
        "address",
        "country",
        "state",
        "city",
        "pincode",
        "franchise_location",
        "have_place_or_rent_plan",
        "investment_amount_in_lacs",
        "interest_reason",
        "industry_interest",
        "background",
        "franchise_motivation",
      ],
      [
        name,
        phone,
        email,
        address,
        country,
        state,
        city,
        pincode,
        franchise_location,
        have_place_or_rent_plan,
        investment_amount_in_lacs,
        interest_reason,
        industry_interest,
        background,
        franchise_motivation,
      ],
    );

    if (!insertResult || insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to submit inquiry", 500));
    }
    const mailData = {
      from: "Support <support@balancenutrition.in>",
      to: "info@balancenutrition.in",
      subject: "New Franchise Inquiry Submitted",
      cc: ["accounts@balancenutrition.in", "vishalrupani@balancenutrition.in"],
      html: `<!DOCTYPE html>

<html>
<head>
    <meta charset="UTF-8" />
    <title>New Franchise Enquiry</title>
</head>
<body style="margin:0; padding:0; background-color:#eef3f5; font-family: Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
            <td align="center" style="padding:24px;">
                <table width="720" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 3px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                    <td style="background-color:#00a0b0; padding:22px 30px; color:#ffffff;">
                        <h2 style="margin:0; font-size:22px; font-weight:600;">
                            New Franchise Enquiry Received
                        </h2>
                        <p style="margin:6px 0 0; font-size:14px; opacity:0.95;">
                            A new enquiry has been submitted via the website
                        </p>
                    </td>
                </tr>

                <!-- Content -->
                <tr>
                    <td style="padding:30px; color:#333;">
                        <p style="margin-top:0;">
                            Hello Team,
                        </p>

                        <p style="color:#555;">
                            Please find below the details of a newly submitted franchise enquiry. Kindly review and initiate the next steps accordingly.
                        </p>

                        <!-- Applicant Details -->
                        <h3 style="margin:26px 0 12px; font-size:16px; color:#00a0b0; border-bottom:1px solid #dfecee; padding-bottom:6px;">
                            Applicant Details
                        </h3>

                        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                                <td width="32%" style="font-weight:600;">Name</td>
                                <td>${name}</td>
                            </tr>
                            <tr style="background-color:#f7fbfc;">
                                <td style="font-weight:600;">Phone</td>
                                <td>${phone}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600;">Email</td>
                                <td>${email}</td>
                            </tr>
                            <tr style="background-color:#f7fbfc;">
                                <td style="font-weight:600;">Address</td>
                                <td>${address}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600;">City / State</td>
                                <td>${city}, ${state}</td>
                            </tr>
                            <tr style="background-color:#f7fbfc;">
                                <td style="font-weight:600;">Country</td>
                                <td>${country}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600;">Pincode</td>
                                <td>${pincode}</td>
                            </tr>
                        </table>

                        <!-- Franchise Preferences -->
                        <h3 style="margin:30px 0 12px; font-size:16px; color:#00a0b0; border-bottom:1px solid #dfecee; padding-bottom:6px;">
                            Franchise Preferences
                        </h3>

                        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                                <td width="32%" style="font-weight:600;">Preferred Location</td>
                                <td>${franchise_location}</td>
                            </tr>
                            <tr style="background-color:#f7fbfc;">
                                <td style="font-weight:600;">Place / Rent Plan</td>
                                <td>${have_place_or_rent_plan}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600;">Investment Capacity</td>
                                <td>${investment_amount_in_lacs}</td>
                            </tr>
                            <tr style="background-color:#f7fbfc;">
                                <td style="font-weight:600;">Interest Reason</td>
                                <td>${interest_reason}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:600;">Industry Interest</td>
                                <td>${industry_interest}</td>
                            </tr>
                        </table>

                        <!-- Background & Motivation -->
                        <h3 style="margin:30px 0 12px; font-size:16px; color:#00a0b0; border-bottom:1px solid #dfecee; padding-bottom:6px;">
                            Background & Motivation
                        </h3>

                        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                                <td width="32%" style="font-weight:600;">Background</td>
                                <td>${background}</td>
                            </tr>
                            <tr style="background-color:#f7fbfc;">
                                <td style="font-weight:600;">Franchise Motivation</td>
                                <td>${franchise_motivation}</td>
                            </tr>
                        </table>

                        <p style="margin-top:26px; color:#555;">
                            Please <a href="https://sales-manager-dashboard.vercel.app/franchise-enquires" target="_blank">log in</a> to the CRM to view the complete enquiry and proceed with follow-up.
                        </p>

                        <p style="margin-bottom:0;">
                            Regards,<br>
                            <strong>System Notification</strong><br>
                            Balance Nutrition
                        </p>
                    </td>
                </tr>

                <!-- Footer -->
                <tr>
                    <td style="background-color:#f1f7f8; padding:14px 30px; font-size:12px; color:#666;">
                        This is an automated email generated on new franchise enquiry submission.
                    </td>
                </tr>

            </table>
        </td>
    </tr>
</table>

</body>
</html>
`,
    };
    await sendMailUtil(mailData);
    return res.status(201).json({
      status: "success",
      message: "Franchise inquiry submitted successfully",
      inquiryId: insertResult.insertId,
    });
  } catch (error) {
    console.error("Error in addFranchiseInquiry:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getCleansePrograms,
  getPoshanPrograms,
  getPrivyAndPlatniumProgramRates,
  getPrograms,
  getTermsandCondition,
  websiteHomePage,
};
