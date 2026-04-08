import {
  deleteRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../config/query.js";
import { tables, cloudinaryFolders } from "../helper/constant.js";
import {
  filterObjectRemoveNullValues,
  addDaysToDate,
} from "../helper/commonHelper.js";
import dietDetails from "../models/dietDetailsModel.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { ApiResponse } from "../utils/APiResponse.js";
import moment from "moment";
import { buildDietUpperSection } from "../helper/dietHelper.js";

//API for Getting Diet List
export const getDietList = async (req, res, next) => {
  try {
    const order_id = req.body.order_id;
    const user_id = req.body.user_id;
    const selectDietListColumns = [
      "dsl.diet_details_id",
      "dsl.diet_id",
      "dsl.session as diet_session",
      "sod.order_id",
      "pm.program_name",
      "ps.program_sessions",
      "ps.validity",
      "ps.extra_validity",
      "pm.program_category as program_category",
      "ps.ask_imf_window",
      "ps.program_sessions",
      "sod.balance_amount",
      "sod.pending_session",
      "sod.sent_sessions",
      "sod.program_combo",
      "sod.user_id",
    ];
    const dietListWhereCondition = [
      { field: "sod.sub_order_id", operator: "=", value: order_id },
    ];
    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} sod`,
      selectFields: selectDietListColumns,
      conditions: dietListWhereCondition,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sod.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sod.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.dietSessionLog} dsl`,
          on: `dsl.sub_order_id = sod.sub_order_id	AND dsl.diet_status = '4'`,
        },
      ],
      orderBy: ["dsl.session DESC"],
      groupBy: ["dsl.diet_details_id"],
    });

    const { results: oldProgramsResults } = await readRecord({
      table: `${tables.subOrderPrograms}`,
      selectFields: ["sub_order_id"],
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "program_status", operator: "=", value: 3 },
      ],
    });
    return res.status(200).json({
      status: true,
      message: "Diet List Fetched Successfully.",
      screen_name: "Diet list",
      active_prog_diet_id: results[0]?.diet_id || null,
      program_name: `${results[0]?.program_name || "Unknown"}${results[0]?.program_combo ? ` (${results[0].program_combo})` : ""
        }`,
      total_session: results[0]?.program_sessions || 0,
      balance_amount: results[0]?.balance_amount || 0,
      add_session: false,
      pending_session: Math.abs(results[0]?.pending_session ?? 0),
      cleanse_diet_pdf: "",
      request_maintenance: "",
      already_maintenance: "",
      maintenance_received: "",
      previous_diet: oldProgramsResults.length > 0,
      pause_program: "",
      pause_session: false,
      diet_flag: "",
      cleanse_show: false,
      data: {
        diet_list:
          results[0].diet_id == null
            ? []
            : results.map((i) => ({
              session: i.diet_session,
              diet_id: i.diet_details_id,
              actual_diet_id: i.diet_id,
            })),
        program_details: "",
        popup_data: {
          showPopup: results[0].diet_id == null ? true : false,
          message:
            "Your diet is getting prepared. You shall \n receive it shortly.",
          button_text: "OK",
        },
      },
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getDietDetailS = async (req, res, next) => {
  try {
    const { diet_details_id } = req.body;

    const { results } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.user_id",
        "dsl.diet_id",
        "dsl.sub_order_id",
        "dsl.diet_start_date",
        "dsl.diet_sent_date",
        "dsl.diet_start_date_set_by",
        "dsl.start_session_weight",
        "dsl.mid_session_weight",
        "dsl.end_session_weight",
        "dsl.end_session_photo",
        "dsl.session",
        "(SELECT dl.diet_id FROM diet_session_log dl WHERE dl.user_id = dsl.user_id AND dl.diet_status = '4' ORDER BY dl.diet_id DESC LIMIT 1) as latest_diet_id",
        "sop.sent_sessions",
        "sop.break_end_date",
        "pm.program_name",
        `CONCAT(ud.first_name,'', ud.last_name) as user_name`,
        `ud.user_status`,
        `ud.sub_user_status`,
        "ps.program_sessions",
        "ps.validity",
        "ps.per_session_days",
        "pm.program_name",
        "CONCAT(ud.first_name,' ', ud.last_name) as client_name",
        `(SELECT sop_advance.sub_order_id FROM ${tables.subOrderPrograms} sop_advance WHERE sop_advance.user_id = sop.user_id AND sop_advance.program_status = '4' ORDER BY sop_advance.created_at DESC LIMIT 1) as advance_program_sub_order_id`,
        `(SELECT cu.call_type FROM ${tables.callUpdates} cu WHERE dsl.user_id = cu.user_id AND cu.sub_order_id = dsl.sub_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_type`,
        `(SELECT cu.user_id FROM ${tables.callUpdates} cu WHERE dsl.user_id = cu.user_id AND cu.sub_order_id = dsl.sub_order_id AND cu.call_type = '0' ORDER BY cu.schedule_date DESC LIMIT 1) AS welcome_call`,
        `(
  SELECT ir.inch_id 
  FROM ${tables.inchRecords} ir 
  WHERE sop.sub_order_id = ir.sub_order_id 
    AND ir.session IN (0 ,1)
    AND ir.days IN (0 , 1)
  ORDER BY ir.posted_date DESC
  LIMIT 1
) as inch_id`,
        `(SELECT ir.inch_id FROM ${tables.inchRecords} ir WHERE sop.sub_order_id = ir.sub_order_id AND ir.session = sop.sent_sessions AND ir.days IN (10,2,4) ORDER BY ir.posted_date DESC LIMIT 1) as ten_inch_id`,
        `COALESCE(
  (
    SELECT JSON_OBJECT(
      'program_name', pm2.program_name,
      'end_days_ago', DATEDIFF(CURDATE(), sop2.expiry_date)
    )
    FROM sub_orders_programs sop2
    JOIN programs_master pm2
      ON sop2.program_id = pm2.program_id
    WHERE sop2.user_id = dsl.user_id
      AND sop2.program_status = '3'
    ORDER BY sop2.expiry_date DESC
    LIMIT 1
  ),
  JSON_OBJECT()
) AS last_program_data
`,
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = dsl.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "sop.user_id = ud.user_id",
        },
      ],
      conditions: [
        {
          field: "dsl.diet_details_id",
          operator: "=",
          value: diet_details_id,
        },
      ],
    });
    if (!results || results.length === 0) {
      return next(
        new ErrorHandler("Diet Not Found for This Diet Details Id", 404)
      );
    }

    const { results: cartData } = await readRecord({
      table: `${tables.cart} ct`,
      selectFields: [
        "ct.cart_code",
      ],
      conditions: [
        { field: "ct.cart_code", operator: "IS NOT", value: 'NULL', raw: true },
        { field: "ct.cart_code", operator: "LIKE", value: "'%dd-%'", raw: true },
        { field: "ct.user_id", operator: "=", value: results[0].user_id },
      ],
    })

    const { results: dietSessionLogData } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: [
        "dsl.diet_start_date",
        "dsl.diet_id",
        "dsl.session",
        "dsl.diet_sent_date",
        "dsl.diet_start_date_set_by",
        "dsl.sub_order_id",
      ],
      conditions: [
        { field: "dsl.user_id", operator: "=", value: results[0].user_id },
        { field: "DATE(dsl.diet_start_date)", operator: ">", value: 'CURDATE()-INTERVAL 5 DAY', raw: true },
        { field: "dsl.mid_session_weight", operator: "=", value: 0.0 },
        { field: "dsl.diet_status", operator: '=', value: 4 },
        { field: "dsl.diet_start_date_set_by", operator: "IN", value: "('Client', 'Mentor')", raw: true }

      ],
      orderBy: ["dsl.diet_id DESC"],
    });

    let dietPopupCondition = false;
    let cartCode = null;
    let cartLink = ''

    if (dietSessionLogData.length > 0) {
      dietPopupCondition = true;
    }

    if (cartData.length > 0) {
      cartCode = cartData[0].cart_code;
      cartLink = `https://balancenutrition.in/shop?share=${cartCode}`
    }


    const dietData = results[0];
    console.log(dietData, 219);
    let cleanseEndDay = null;
    if (Number(dietData.program_sessions) === 1) {
      cleanseEndDay =
        Number(dietData.validity) === 1
          ? 2
          : Number(dietData.validity) === 3
            ? 4
            : 10;
      const { results: cleanseInch } = await readRecord({
        table: `${tables.inchRecords} ir`,
        selectFields: ["ir.inch_id"],
        conditions: [
          {
            field: "ir.sub_order_id",
            operator: "=",
            value: dietData.sub_order_id,
          },
          { field: "ir.session", operator: "=", value: dietData.sent_sessions },
          { field: "ir.days", operator: "=", value: cleanseEndDay },
        ],
        orderBy: ["ir.posted_date DESC"],
        pagination: { limit: 1 },
      });
      dietData.ten_inch_id =
        cleanseInch.length > 0 ? cleanseInch[0].inch_id : null;
    }
    const dietDetailedData = await dietDetails.findById(diet_details_id).lean();
    const descArray = {
      "<b style='font-size: 18px;'>ON RISING:</b>":
        dietDetailedData?.on_rising || null,
      "<b style='font-size: 18px;'>PRE BREAKFAST:</b>":
        dietDetailedData?.pre_breakfast || null,
      "<b style='font-size: 18px;'>BREAKFAST:</b>":
        dietDetailedData?.breakfast || null,
      "<b style='font-size: 18px;'>MID MORNING:</b>":
        dietDetailedData?.mid_morning || null,
      "<b style='font-size: 18px;'>PRE WORKOUT:</b>":
        dietDetailedData?.pre_workout || null,
      "<b style='font-size: 18px;'>DURING WORKOUT:</b>":
        dietDetailedData?.during_workout || null,
      "<b style='font-size: 18px;'>PRE LUNCH:</b>":
        dietDetailedData?.pre_lunch || null,
      "<b style='font-size: 18px;'>LUNCH:</b>": dietDetailedData?.lunch || null,
      "<b style='font-size: 18px;'>POST LUNCH:</b>":
        dietDetailedData?.post_lunch || null,
      "<b style='font-size: 18px;'>TEA EVENING:</b>":
        dietDetailedData?.tea_eve || null,
      "<b style='font-size: 18px;'>LATE EVENING:</b>":
        dietDetailedData?.late_eve || null,
      "<b style='font-size: 18px;'>PRE DINNER:</b>":
        dietDetailedData?.pre_dinner || null,
      "<b style='font-size: 18px;'>DINNER:</b>":
        dietDetailedData?.dinner || null,
      "<b style='font-size: 18px;'>POST DINNER:</b>":
        dietDetailedData?.post_dinner || null,
      "<b style='font-size: 18px;'>BED TIME:</b>":
        dietDetailedData?.bed_time || null,
      "<b style='font-size: 18px;'>DIET NOTE:</b>":
        dietDetailedData?.diet_note || null,
    };
    const titleWithDesc = Object.entries(descArray).map(([key, value]) => ({
      diet_title: key,
      diet_description: `${value || "Not specified"}`,
    }));

    const { upperSection, show_button_1 } = buildDietUpperSection({ dietData });

    return res.status(200).json({
      status: true,
      message: "Diet Details Fetched Successfully",
      screen_name: "Diet List",
      data: {
        diet_id: dietData.diet_id,
        popup_details: {
          show_popup: cartCode && dietPopupCondition ? true : false,
          popup_title: 'Your Shopping Cart is Ready!',
          popup_description:
            `We have created your shopping cart for session ${dietData.session}. Take a look`,
          popup_image: [],
          popup_button1_redirect_screen: 'redirect_url',
          popup_button1: 'View Cart',
          popup_button1_screen_params: {
            redirect_url: cartLink,
          },
          popup_mentor_autotext: '',
          popup_client_autotext: '',
        },
        diet_details: titleWithDesc,
        dietAttachMent: dietDetailedData?.attachments?.map((att) => att.file),
        page_title: `Diet Session ${dietData.sent_sessions}`,
        show_button_1: show_button_1,
        show_button_2: null,
        default_start_date:
          dietData.diet_start_date_set_by === "Default"
            ? moment(dietData.diet_sent_date).format("Do MMM")
            : "",
        calender_start_date: dietData.diet_start_date
          ? moment(dietData.diet_start_date).format("Do MMM YY")
          : "",
        advance_program_order_id: dietData?.advance_program_sub_order_id || "",
        day_number: moment().diff(moment(dietData.diet_start_date), "days"),
        diet_upper_section: upperSection,
        diet_session: dietData.sent_sessions,
        client_name: dietData.client_name,
        program: dietData.program_name,
      },
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getDietDetails = async (req, res) => {
  const { user_id, order_id, diet_details_id } = req.body;

  try {
    // Input validation
    if (!diet_details_id || !user_id || !order_id) {
      return res.status(400).json({
        status: false,
        message:
          "Missing required fields: diet_details_id, user_id, or order_id",
      });
    }

    // Fetch diet session details
    const dietListtable = tables.dietSessionLog;
    const { results: dietList } = await readRecord({
      table: `${dietListtable} dsl`,
      selectFields: [
        "dsl.diet_start_date",
        "dsl.diet_id",
        "dsl.session",
        "dsl.diet_sent_date",
        "dsl.diet_start_date_set_by",
        "dsl.sub_order_id",
      ],
      conditions: [
        { field: "dsl.diet_details_id", operator: "=", value: diet_details_id },
      ],
    });

    if (!dietList.length) {
      return res
        .status(404)
        .json({ status: false, message: "Diet details not found" });
    }

    // Fetch call updates
    const { results: callsData } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: ["cu.call_type", "cu.call_status"],
      conditions: [
        { field: "cu.user_id", operator: "=", value: user_id },
        { field: "cu.sub_order_id", operator: "=", value: order_id },
        { field: "cu.call_type", operator: "=", value: "0" },
      ],
      orderBy: ["cu.schedule_date DESC"],
      pagination: { limit: 1 },
    });

    // Fetch sub-order program details
    const { results: subOrderProgram } = await readRecord({
      selectFields: [
        "sop.program_status",
        "ps.per_session_days",
        "sop.start_date",
        "sop.expiry_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "ps.program_session_id = sop.program_session_id",
        },
      ],
      table: `${tables.subOrderPrograms} sop`,
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: order_id },
      ],
    });

    // Fetch weight and inch records
    const { results: weightData } = await readRecord({
      selectFields: ["wr.weight", "wr.posted_date as recorded_date"],
      table: `${tables.weightRecords} wr`,
      conditions: [
        { field: "wr.user_id", operator: "=", value: user_id },
        { field: "wr.sub_order_id", operator: "=", value: order_id },
        { field: "wr.session", operator: "=", value: dietList[0].session },
      ],
      orderBy: ["wr.posted_date DESC"],
    });

    const { results: inchData } = await readRecord({
      selectFields: ["*"],
      table: `${tables.inchRecords} ir`,
      conditions: [
        { field: "ir.user_id", operator: "=", value: user_id },
        { field: "ir.sub_order_id", operator: "=", value: order_id },
        { field: "ir.session", operator: "=", value: dietList[0].session },
      ],
    });

    // Button logic (already dynamic)
    let showButton = "5";
    if (
      dietList[0].session == 1 &&
      subOrderProgram.length &&
      subOrderProgram[0].program_status == "1"
    ) {
      if (Number(callsData[0].call_type) !== 0) {
        showButton = "1";
      } else if (
        weightData.length === 0 &&
        moment().diff(moment(dietList[0].diet_start_date), "days") >= 2
      ) {
        showButton = "3";
      } else if (
        inchData.length === 0 &&
        moment().diff(moment(dietList[0].diet_start_date), "days") >= 7
      ) {
        showButton = "4";
      }
    }
    if (
      showButton !== "1" &&
      dietList[0].diet_start_date_set_by === "Default" &&
      !dietList[0].diet_start_date &&
      moment().diff(moment(dietList[0].diet_sent_date), "days") >= 5
    ) {
      showButton = "2";
    }
    if (dietList[0].sub_order_id !== order_id) {
      showButton = "5";
    }

    // Fetch user details (including mentor if applicable)
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails}`,
      selectFields: [
        "first_name",
        "last_name",
        "email_id",
        "phone_code",
        "phone_number",
        "active_order_id",
        "mentor_assigned as mentor",
        `(SELECT hs.ideal_weight FROM ${tables.healthScoreClient} hs WHERE hs.user_id = user_id ORDER BY hs.created DESC LIMIT 1) as hs_ideal_weight`,
      ],

      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    // Fetch mentor name if mentor_id exists
    let mentorName = "N/A";
    if (userDetails[0]?.mentor_id) {
      const { results: mentorData } = await readRecord({
        table: `${tables.adminUsers}`, // Assuming a mentors table exists
        selectFields: ["first_name as name"],
        conditions: [
          {
            field: "mentor_id",
            operator: "=",
            value: userDetails[0].mentor_id,
          },
        ],
      });
      mentorName = mentorData[0]?.name || "N/A";
    }

    // Fetch diet details from MongoDB
    const dietDetailData = await dietDetails.findById(diet_details_id).lean();
    if (!dietDetailData) {
      return res
        .status(404)
        .json({ status: false, message: "Diet detail data not found" });
    }

    // Dynamic diet description
    const descArray = {
      "<b style='font-size: 18px;'>ON RISING:</b>":
        dietDetailData.on_rising || null,
      "<b style='font-size: 18px;'>PRE BREAKFAST:</b>":
        dietDetailData.pre_breakfast || null,
      "<b style='font-size: 18px;'>BREAKFAST:</b>":
        dietDetailData.breakfast || null,
      "<b style='font-size: 18px;'>MID MORNING:</b>":
        dietDetailData.mid_morning || null,
      "<b style='font-size: 18px;'>PRE WORKOUT:</b>":
        dietDetailData.pre_workout || null,
      "<b style='font-size: 18px;'>DURING WORKOUT:</b>":
        dietDetailData.during_workout || null,
      "<b style='font-size: 18px;'>PRE LUNCH:</b>":
        dietDetailData.pre_lunch || null,
      "<b style='font-size: 18px;'>LUNCH:</b>": dietDetailData.lunch || null,
      "<b style='font-size: 18px;'>POST LUNCH:</b>":
        dietDetailData.post_lunch || null,
      "<b style='font-size: 18px;'>TEA EVENING:</b>":
        dietDetailData.tea_eve || null,
      "<b style='font-size: 18px;'>LATE EVENING:</b>":
        dietDetailData.late_eve || null,
      "<b style='font-size: 18px;'>PRE DINNER:</b>":
        dietDetailData.pre_dinner || null,
      "<b style='font-size: 18px;'>DINNER:</b>": dietDetailData.dinner || null,
      "<b style='font-size: 18px;'>POST DINNER:</b>":
        dietDetailData.post_dinner || null,
      "<b style='font-size: 18px;'>BED TIME:</b>":
        dietDetailData.bed_time || null,
      "<b style='font-size: 18px;'>DIET NOTE:</b>":
        dietDetailData.diet_note || null,
    };
    const titleWithDesc = Object.entries(descArray).map(([key, value]) => ({
      diet_title: key,
      diet_description: `${value || "Not specified"}`,
    }));

    // Dynamic upper section
    const daysSinceStart = dietList[0].diet_start_date
      ? moment().diff(moment(dietList[0].diet_start_date), "days")
      : 0;
    const overdueDays = weightData.length ? 0 : daysSinceStart - 2; // Overdue if no weight update after 2 days
    const dietUpperSection = {
      title: `<p style='text-align:center;font-size:20px;'><b><u>Weight Update <span style='color:red;'>${overdueDays > 0 ? "``OverDue``" : "Due"
        }</span>:</u></b></p>`,
      start_date: dietList[0].diet_start_date || "",
      end_date: subOrderProgram[0]?.expiry_date || "",
      description: "",
      marquee_text: {
        text: `<p style='font-size:16px;'>Your end-session weight update is <b>${overdueDays > 0 ? "Overdue" : "Due"
          }</b>! ${overdueDays > 0
            ? `You had to update your weight <span style='color:red;'><b>${overdueDays} days ago</b></span>.`
            : ""
          } Please update your weight ASAP. <span style='color:blue;'><u>Click here</u></span> to update now!</p>`,
        redirect_page: "Weight tracker",
        redirect_id: "",
        mentor_auto_text: "",
        client_auto_text: "",
      },
    };

    // Dynamic session dates
    const startDate = moment(
      dietList[0].diet_start_date || subOrderProgram[0]?.start_date
    );
    const sessionDuration = subOrderProgram[0]?.per_session_days || 10; // Default to 10 days if not specified
    const endDate = startDate.clone().add(sessionDuration, "days");
    const midSessionDate = startDate
      .clone()
      .add(Math.floor(sessionDuration / 2), "days");

    // Dynamic weights
    const startWeight = weightData.length
      ? weightData[weightData.length - 1]?.weight
      : "N/A"; // Oldest weight
    const currentWeight = weightData.length ? weightData[0]?.weight : "N/A"; // Latest weight
    const idealWeight = userDetails[0]?.hs_ideal_weight || 0;
    const awayFromIdeal =
      idealWeight !== "N/A" && currentWeight !== "N/A"
        ? Math.abs(idealWeight - currentWeight).toFixed(2)
        : "N/A";

    // Response
    return res.status(200).json({
      status: true,
      message: "Diet Details Fetched Successfully",
      screen_name: "Diet list",
      data: {
        diet_id: dietList[0].diet_id,
        diet_details: titleWithDesc,
        dietUpperSection,
        dietAttachMent:
          dietDetailData.attachments?.map((attachment) => attachment.file) ||
          [],
        start_date: startDate.format("YYYY-MM-DD"),
        end_date: endDate.format("YYYY-MM-DD"),
        current_session: dietList[0].session,
        days_pending: endDate.isAfter(moment())
          ? endDate.diff(moment(), "days")
          : 0,
        page_title: `Diet Session ${dietList[0].session}`,
        show_button_1: showButton,
        show_button_2: null,
        default_start_date:
          dietList[0].diet_start_date_set_by === "Default"
            ? dietList[0].diet_sent_date
            : "",
        calender_start_date: daysSinceStart.toString(),
        advance_program_order_id:
          subOrderProgram[0]?.advance_program_order_id || "",
        day_number: daysSinceStart,
        start_date_overdue: overdueDays > 0,
        client_new_goals: null, // Could be fetched from a goals table
        suggested_program1: subOrderProgram[0]?.suggested_program1 || "N/A", // Add to subOrderProgram table
        suggested_program2: subOrderProgram[0]?.suggested_program2 || "N/A", // Add to subOrderProgram table
        adv_purchase_program: subOrderProgram[0]?.adv_purchase_program || "",
        adv_purchase_start_date:
          subOrderProgram[0]?.adv_purchase_start_date || "",
        start_now_redirect: "weight tracker",
        start_now_auto_text: "",
        break_ended_days: subOrderProgram[0]?.break_ended_days || 0, // Add to subOrderProgram table
        break_end_date: subOrderProgram[0]?.break_end_date || "",
        mid_session_date: midSessionDate.format("Do MMM"),
        session_start_date: startDate.format("Do MMM YY"),
        session_end_date: endDate.format("Do MMM YY"),
        end_session_date: endDate.format("Do MMM"),
        days_till_now: daysSinceStart,
        session_ended_days: endDate.isBefore(moment())
          ? moment().diff(endDate, "days")
          : 0,
        upper_message_type: overdueDays > 0 ? "1" : "0",
        onhold_timestamp: subOrderProgram[0]?.onhold_timestamp || false,
        view_maintenance: subOrderProgram[0]?.view_maintenance || false,
        start_weight: startWeight,
        current_weight: currentWeight,
        ideal_weight: idealWeight,
        away_from_ideal_weight: awayFromIdeal,
        mentor_name: mentorName,
        show_half_time_info: daysSinceStart >= Math.floor(sessionDuration / 2),
        offer_redirect_screen: "program_suggestion_new", // Could be dynamic
        offer_redirect_id: subOrderProgram[0]?.offer_redirect_id || "",
        offer_client_auto_text:
          subOrderProgram[0]?.offer_client_auto_text || "",
        offer_mentor_auto_text:
          subOrderProgram[0]?.offer_mentor_auto_text || "",
      },
    });
  } catch (error) {
    console.error("Error in getDietDetails:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

export const setDietStartDate = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const order_id = newData.order_id;
  const diet_id = newData.diet_id;
  const session = newData.session;
  const new_start_date = newData.new_start_date;
  const set_by = newData.set_by;
  try {
    let active_order_details = [];
    if (order_id) {
      const orderColumns = [
        "sod.order_id",
        "pm.program_name",
        "ps.program_sessions",
        "ps.validity",
        "ps.extra_validity",
        "pm.program_category as program_category",
        "ps.ask_imf_window",
      ];
      const joins = [
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sod.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "ps.program_id = pm.program_id",
        },
      ];
      const conditions = [
        { field: "sod.sub_order_id", operator: "=", value: order_id },
      ];
      const { results: order_details } = await readRecord({
        table: `${tables.subOrderPrograms} sod`,
        selectFields: orderColumns,
        joins: joins,
        conditions: conditions,
      });
      active_order_details = order_details;
    } else {
      return res.status(404).json({ message: "Order ID Missing." });
    }

    if (new_start_date) {
      const condition = { diet_id: parseInt(diet_id) };
      // Perform the database update
      const dietDateData = {
        diet_start_date: moment(new_start_date).format("YYYY-MM-DD"),
        diet_start_date_set_by: set_by ? set_by : "Client",
        mid_session_weight: 0,
        end_session_weight: 0,
        end_session_inch: 0,
        end_session_photo: 0,
      };

      const updateDietDateResult = await updateRecord(
        `${tables.dietSessionLog}`,
        filterObjectRemoveNullValues(dietDateData),
        condition
      );
      if (session == 1) {
        const condition = { sub_order_id: parseInt(order_id) };
        const total_validity =
          active_order_details[0].validity +
          active_order_details[0].extra_validity;
        const new_program_expiry = moment(
          addDaysToDate(new_start_date, total_validity)
        ).format("YYYY-MM-DD");
        // Perform the database update
        const programDateData = {
          start_date: new_start_date,
          expiry_date: new_program_expiry,
        };
        const updateResult = await updateRecord(
          `${tables.subOrderPrograms}`,
          filterObjectRemoveNullValues(programDateData),
          condition
        );
        if (updateResult) {
          return res.status(201).json({
            status: true,
            message: "Session Start Date Updated Successfully.",
            screen_name: "Diet List",
          });
        } else {
          return res
            .status(404)
            .json({ message: "Error while setting start date." });
        }
      } else {
        if (updateDietDateResult) {
          return res.status(201).json({
            status: true,
            message: "Session Start Date Updated Successfully.",
            screen_name: "Diet List",
          });
        } else {
          return res
            .status(404)
            .json({ message: "Error while setting start date." });
        }
      }
    } else {
      return res.status(404).json({ message: "Start Date Missing." });
    }
  } catch (error) {
    console.log(error.message);
    return res.status(404).json({ message: error.message });
  }
};

export const deleteDiet = async (req, res, next) => {
  try {
    const { diet_id } = req.body;

    if (!diet_id) return next(new ErrorHandler("diet_Id Not Provided", 400));

    const { results } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: ["dsl.sub_order_id", "dsl.diet_status"],
      conditions: [{ field: "dsl.diet_id", operator: "=", value: diet_id }],
    });

    console.log(results, 727);

    const { results: orderResults } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: ["sop.sent_sessions", "sop.pending_session"],
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: results[0].sub_order_id,
        },
      ],
    });

    console.log(orderResults, 727);

    if (results[0].diet_status == 4) {
      await updateRecord(
        tables.subOrderPrograms,
        {
          sent_sessions: Number(orderResults[0].sent_sessions) - 1,
          pending_session: Number(orderResults[0].pending_session) + 1,
          last_session_sent_date: null,
        },
        {
          sub_order_id: results[0].sub_order_id,
        }
      );
    }

    const deleteRecordsResult = await deleteRecords(
      `${tables.dietSessionLog}`,
      parseInt(diet_id),
      { diet_id }
    );
    if (deleteRecordsResult.success === false) {
      return next(
        new ErrorHandler(
          "No Diet deleted  (possible cause :there isn't any Diet exist with the given id)",
          400
        )
      );
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet deleted successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
export const unSendDiet = async (req, res, next) => {
  try {
    const { diet_id } = req.body;

    if (!diet_id) return next(new ErrorHandler("diet_Id Not Provided", 400));

    const { results } = await readRecord({
      table: `${tables.dietSessionLog} dsl`,
      selectFields: ["dsl.sub_order_id", "dsl.diet_status"],
      conditions: [{ field: "dsl.diet_id", operator: "=", value: diet_id }],
    });

    console.log(results, 727);

    const { results: orderResults } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: ["sop.sent_sessions", "sop.pending_session"],
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: results[0].sub_order_id,
        },
      ],
    });

    console.log(orderResults, 727);

    if (results[0].diet_status == 4) {
      await updateRecord(
        tables.subOrderPrograms,
        {
          sent_sessions: Number(orderResults[0].sent_sessions) - 1,
          pending_session: Number(orderResults[0].pending_session) + 1,
          last_session_sent_date: null,
        },
        {
          sub_order_id: results[0].sub_order_id,
        }
      );
    }

    await updateRecord(
      tables.dietSessionLog,
      {
        diet_status: 0,
        diet_sent_date: null,
        diet_start_date: null,
        mid_session_weight: 0,
        end_session_weight: 0,
        end_session_inch: 0,
        end_session_photo: 0,
        diet_start_date_set_by: "Default",
        diet_sent_by: null,
        approved_by: null,
        approved_at: null,
        pdf_notification_sent: 0,
      },
      {
        diet_id: parseInt(diet_id),
      }
    );

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Diet Unsend successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getClientFeedbackQuestions = async (req, res, next) => {
  const apiresponse = new ApiResponse({
    statusCode: 200,
    message: "Diet Feedback Questions",
    data: {
      feedback_type: "Diet",
      wallet_amount: 200,
      question_list: [
        {
          question:
            "How satisfied are you with your overall experience on the app?",
          type: "star",
          is_required: true,
        },
        {
          question: "Was the app easy to navigate & use?",
          type: "star",
          is_required: true,
        },
        {
          question:
            "Are the articles, videos & tips relevant and helpful to your goals?",
          type: "star",
          is_required: true,
        },
        {
          question: "What features do you find most useful or valuable?",
          type: "list",
          list: [
            "Peer Group",
            "Health Score",
            "Guides & Kits",
            "Blogs & Videos",
            "Expert Calls",
            "Recipes",
          ],
          is_required: true,
        },
        {
          question:
            "What can we improve or add to make the app better for you.",
          placeholder: "Add a comment.....",
          type: "text",
          is_required: false,
          maxLength: 200,
        },
      ],
    },
  });

  return res.status(200).json(apiresponse);
};
