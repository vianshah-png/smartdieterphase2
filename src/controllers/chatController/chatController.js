import moment from "moment";
import { cloudinaryFolders, tables } from "../../helper/constant.js";
import { uploadArrayOfFilesToCloudinary } from "../../helper/uploadToCloudinary.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import deletedClientEnquiry from "../../models/deletedClientEnquiryModel.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { deleteRecords, insertRecord, readRecord } from "../../config/query.js";
import { writePool } from "../../config/dbConnection.js";
import {
  ActiveUserChatConditions,
  LeadChatConditions,
  OcUserChatConditions,
} from "../../helper/chatHelper.js";
import {
  extractVariables,
  fetchUserDetailsDynamic,
  fetchUsersDetailsNew,
  replacePlaceholders,
  getPreviousInchTracker,
  getInchTracker,
  getPhotoTracker,
  getGoalData,
} from "../../helper/common.js";
import {
  alcoholGuideAutoDraft,
  checkoutVisitDraft,
  fifthDayOd,
  fifthDayRecievedDraft,
  fifthDayToday,
  fifthDayTomorrow,
  halfTimeCallDraft,
  halfTimeFeedbackDraft,
  halfTimeHsDraft,
  pageVisitDraft,
  programFeedbackDraft,
  programHsDraft,
  spinToWinAutoDraft,
  startDayRecievedDraft,
  tailendCallDraft,
  tenDayOd,
  tenDayToday,
  tenDayTomorrow,
  tenthDayRecievedDraft,
  validityAwarenessBufferedDraft,
  welcomeCallDoneDraft,
  welcomeCallDraft,
} from "../common.js";
import { sendSSEEvent } from "../dashboardNotificationController.js";
import { safeJSONParse } from "../../helper/commonHelper.js";
import { buildCartAutodraft } from "../../helper/emailAutochatTemplateHelpers/getAutoCartCreationMessageTemplates.js";
import mongoose from "mongoose";

// generate abandoned cart autodraft
const generateAbandonedCartAutoDraft = async (user_id, mentor_id) => {
  const { results: recordFound } = await readRecord({
    table: "cart ct",
    selectFields: [
      "CONCAT('[',GROUP_CONCAT(ct.cart_items),']') as cart_info",
      "ud.first_name",
      "ud.last_name",
      "ct.cart_id",
    ],
    joins: [
      {
        type: "LEFT",
        table: `${tables.userDetails} ud`,
        on: "ct.user_id = ud.user_id",
      },
    ],
    conditions: [
      { field: "JSON_LENGTH(ct.cart_items)", operator: ">", value: 0 },
      { field: "ct.user_id", operator: "=", value: user_id },
      { field: "ct.cart_code", operator: "IS", value: "NULL", raw: true },
    ],
  });

  console.log(recordFound);
  if (recordFound?.length == 0 || !recordFound[0]?.cart_id)
    return { status: false, draftMessage: "" };
  else {
    const client_name = recordFound[0]?.first_name + recordFound[0]?.last_name;
    const cart_items = safeJSONParse(recordFound[0]?.cart_info).flat();
    const cart_id = recordFound[0]?.cart_id;
    const { abandonedCartMessage } = buildCartAutodraft(
      cart_items,
      client_name,
      cart_id,
    );
    return { status: true, draftMessage: abandonedCartMessage };
  }
};

const generateShareCartLinkAutoDraft = async (user_id, mentor_id) => {
  const { results: recordFound } = await readRecord({
    table: "cart ct",
    selectFields: [
      "CONCAT('[',GROUP_CONCAT(ct.cart_items),']') as cart_info",
      "ud.first_name",
      "ud.last_name",
      "ct.cart_id",
      "ct.cart_code",
    ],
    joins: [
      {
        type: "LEFT",
        table: `${tables.userDetails} ud`,
        on: "ct.user_id = ud.user_id",
      },
    ],
    conditions: [
      { field: "JSON_LENGTH(ct.cart_items)", operator: ">", value: 0 },
      { field: "ct.user_id", operator: "=", value: user_id },
      { field: "ct.cart_code", operator: "IS NOT", value: "NULL", raw: true },
      { field: "ct.cart_code", operator: "LIKE", value: "%bn-%" },
    ],
  });

  if (recordFound?.length == 0 || !recordFound[0]?.cart_code)
    return { status: false, draftMessage: "" };
  else {
    const client_name = recordFound[0]?.first_name + recordFound[0]?.last_name;
    const cart_items = safeJSONParse(recordFound[0]?.cart_info).flat();
    const cart_code = recordFound[0]?.cart_code;
    const { shareCartLinkMessage } = buildCartAutodraft(
      cart_items,
      client_name,
      cart_code,
    );
    return { status: true, draftMessage: shareCartLinkMessage };
  }
};

const generateAutoDraftMessage = async (
  data,
  client_id,
  mentor_id,
  sub_order_id,
) => {
  let text = "";
  let inch_common_text = "";
  let common_text =
    "<p>While I wait for these updates at your end, why don't you also let me know the following:</p>";

  // Fetch previous inch tracker
  const prev_inch_tracker = await getPreviousInchTracker(
    client_id,
    data.session_number - 1,
  );
  // Fetch current inch tracker
  const inch_tracker = await getInchTracker(data.order_id, data.session_number);
  // Fetch photo tracker
  const photo_tracker = await getPhotoTracker(
    data.order_id,
    data.actual_session,
  );

  // Calculate inch losses (example: hips, waist, chest)
  const hips_loss = inch_tracker.hip - prev_inch_tracker.hip;
  const waist_loss = inch_tracker.waist - prev_inch_tracker.waist;
  const chest_loss = inch_tracker.chest - prev_inch_tracker.chest;

  // Get goal data (new, achieved, milestones)
  const { new_goals, goals_achieved, milestone_achieved } = await getGoalData(
    data.user_id,
    sub_order_id,
  );

  // Sample message structure
  text = `<p>Hi ${data.client_name},</p> 
          <p>As per your last weight update, you have lost ${data.weight_difference} kg in this session. </p>
          <p>Inches lost: Hips: ${hips_loss}, Waist: ${waist_loss}, Chest: ${chest_loss}</p>`;

  // Goal-related message content
  let goalMessage = "";

  // If goals are achieved, mention them
  if (goals_achieved && goals_achieved.length > 0) {
    goalMessage += `<p>Congratulations! You've achieved the following goals:</p>`;
    goals_achieved.forEach((goal, index) => {
      goalMessage += `<p>${index + 1}. ${goal}</p>`;
    });
  }

  // If there are new goals, mention them
  if (new_goals && new_goals.length > 0) {
    goalMessage += `<p>Here are your new goals to focus on:</p>`;
    new_goals.forEach((goal, index) => {
      goalMessage += `<p>${index + 1}. ${goal}</p>`;
    });
  }

  // If milestones are achieved, mention them
  if (milestone_achieved && milestone_achieved.length > 0) {
    goalMessage += `<p>You've also achieved the following milestones:</p>`;
    milestone_achieved.forEach((milestone, index) => {
      goalMessage += `<p>${index + 1}. ${milestone}</p>`;
    });
  }

  // Append goal message if any
  if (goalMessage !== "") {
    text += `<p>${goalMessage}</p>`;
  }

  // Checking if inch and photo trackers are updated
  if (empty(inch_tracker) && empty(photo_tracker)) {
    inch_common_text =
      "<p>You haven't updated your inch & photo trackers. Please update them as soon as possible. Tracking your progress helps you earn BN Wallet points and helps me plan better for your fat loss goals.</p>";
  } else {
    if (hips_loss < 0 || waist_loss < 0 || chest_loss < 0) {
      inch_common_text = `<p>Good inch loss detected! You have lost ${Math.abs(
        hips_loss,
      )} inches on your hips, ${Math.abs(
        waist_loss,
      )} inches on your waist, and ${Math.abs(
        chest_loss,
      )} inches on your chest.</p>`;
    } else if (hips_loss > 0 || waist_loss > 0 || chest_loss > 0) {
      inch_common_text = `<p>You've gained some inches: ${Math.abs(
        hips_loss,
      )} on your hips, ${Math.abs(waist_loss)} on your waist, and ${Math.abs(
        chest_loss,
      )} on your chest. Let's focus on the next steps to get back on track!</p>`;
    } else {
      inch_common_text =
        "<p>Your inch tracker seems to be unchanged. Are your clothes fitting better?</p>";
    }
  }

  // Final message composition
  text += inch_common_text;

  // If there are pending sessions, inform the user
  if (data.pending_session > 0) {
    text += `<p>We still have ${data.pending_session} more sessions to go! Let's stay focused and make the most out of them.</p>`;
  }

  // Call-to-action for the mentor or a session
  text += `<p>If you need further clarification or a session with me, feel free to book one! <a href="https://balancenutrition.in/consultation-landing?name=Mentor%20${mentor_id}">Click here</a> to schedule.</p>`;

  // Return the message
  return text;
};

const sendchatMessage = async (req, res, next) => {
  try {
    const { user_id, name, query, is_response, sender, type, draft_id } =
      req.body;
    let { mentor_id } = req.body;
    console.log(req.body, 25);
    const files = req?.files;
    let urls = [];

    if (files && files.length > 0) {
      const folder = cloudinaryFolders.queryAttachments;
      urls = await uploadArrayOfFilesToCloudinary(files, folder, query);
    }
    let messageType = "query";

    const { results: mentorQueries } = await readRecord({
      selectFields: ["first_name", "mentor_assigned"],
      table: `${tables.userDetails}`,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    if (mentor_id == 0) {
      mentor_id = mentorQueries[0].mentor_assigned;
    }

    if (
      is_response &&
      sender === "mentor" &&
      type !== "broadcast" &&
      type !== "clara"
    ) {
      messageType = "reply";
      await clientEnquiry.updateMany(
        { user_id, mentor_id, type: "query" },
        { $set: { type: "replied" } },
      );
    } else {
      if (sender === "client" && type == "query") {
        const data = {
          title: `New Chat From ${mentorQueries[0].first_name}`,
          description: query,
          priority: 2,
          redirect: `/profile/${user_id}?menu=chat`,
        };
        sendSSEEvent({ mentor_id: mentor_id, data });
      }
    }

    await clientEnquiry.create({
      user_id,
      name,
      mentor_id,
      query,
      is_response,
      sender,
      ...(files && { attachment: urls.map((item) => item.file.path) }),
      type: type ? type : messageType,
    });
    const { results: draftedQueries } = await readRecord({
      selectFields: ["*"],
      table: `${tables.draftedQueries}`,
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "draft_text", operator: "LIKE", value: query },
      ],
    });
    console.log(draftedQueries, 60);
    if (sender === "mentor" && draftedQueries.length > 0) {
      console.log(sender, draftedQueries.length, 61);
      for (const draft of draftedQueries) {
        const deleteDraftedQuery = await deleteRecords(
          tables.draftedQueries,
          draft.id,
          {
            id: draft.id,
          },
        );
        console.log("Deleted drafted query:", deleteDraftedQuery);
      }
    }
    draft_id &&
      (await deleteRecords(tables.draftedQueries, draft_id, { id: draft_id }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `${type ? type : messageType} sent successfully`,
    });
    // const deleteQuery = `DELETE FROM ${tables.draftedQueries} WHERE user_id = ${user_id}`;
    // await writePool.query(deleteQuery);
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getChatById = async (req, res, next) => {
  try {
    let { user_id } = req.query;
    const { page = 1, limit = 100 } = req.query;
    const { source } = req.headers;
    user_id = user_id?.replace("%2F", "");
    user_id = user_id?.replace("/", "");
   
    if (!user_id) {
      return next(new ErrorHandler("Invalid input: user_id is required", 400));
    }
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const skip = (pageNum - 1) * limitNum;

    const totalCount = await clientEnquiry.countDocuments({ user_id });
    let chat = await clientEnquiry
      .find({
        user_id,
        ...(source && source === "app"
          ? {
              type: { $ne: "clara" },
            }
          : {}),
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    if (!chat.length) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "No chats found for this user",
          data: [],
          meta_data: {
            totalCount: 0,
            totalPages: 0,
            currentPage: pageNum,
            limit: limitNum,
            hasMore: false,
          },
        }),
      );
    }
    // chat.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    chat = chat.map((item) => {
      let decodedQuery = item.query;

      // Try decoding URI if it's not HTML
      const isProbablyEncoded = /^[^<]*(%[0-9A-F]{2}|\+)[^<]*$/i.test(
        item?.query,
      ); // crude check

      // try {
      //   decodedQuery = decodeURIComponent(item?.query?.replace(/\+/g, " "));
      // } catch (err) {
      //   console.error("Malformed URI component:", item?.query);
      //   decodedQuery = item?.query; // or set it to null, or fallback value
      // }
      decodedQuery = item?.query;
      const isHTML = /<\/?[a-z][\s\S]*>/i.test(decodedQuery?.trim());

      if (isHTML) {
        decodedQuery = `<div style="font-size: 16px; font-family: Arial, sans-serif; line-height: 1.6;">${decodedQuery}</div>`;
      } else {
        decodedQuery = `<div style="font-size: 16px; font-family: Arial, sans-serif; line-height: 1.6;">${decodedQuery}</div>`;
      }
      return {
        ...item,
        query: decodedQuery,
        createdAt: moment(item.createdAt).format("Do MMM YYYY, hh:mm A"),
        updatedAt: moment(item.updatedAt).format("Do MMM YYYY, hh:mm A"),
      };
    });

    const totalPages = Math.ceil(totalCount / limitNum);
    const hasMore = pageNum < totalPages;

    const updatedChat = await clientEnquiry.updateMany(
      { user_id, sender: "mentor" },
      { $set: { is_acknowledged: true } },
    );

    const now = moment();

    // Define today’s 7 PM and tomorrow’s 10 AM
    const sevenPM = moment().set({
      hour: 19,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const tenAMNextDay = moment()
      .add(1, "day")
      .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });

    // Determine if current time is between 7PM and 10AM (next day)
    let isBetween = false;

    if (now.isSameOrAfter(sevenPM)) {
      // Between 7PM and midnight
      isBetween = true;
    } else if (now.isBefore(tenAMNextDay) && now.hour() < 10) {
      // Between midnight and 10AM next day
      isBetween = true;
    }

    // Calculate time remaining until 10AM tomorrow
    let hoursPendingFormatted = "00:00:00";

    if (isBetween) {
      const diffMs = tenAMNextDay.diff(now);
      const duration = moment.duration(diffMs);

      const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
      const minutes = String(duration.minutes()).padStart(2, "0");
      const seconds = String(duration.seconds()).padStart(2, "0");

      hoursPendingFormatted = `${hours}:${minutes}:${seconds}`;
    }

    console.log("Now:", now.format("YYYY-MM-DD HH:mm:ss"));
    console.log("Is Between 7PM and 10AM:", isBetween);
    console.log("Hours Pending for 10AM Tomorrow:", hoursPendingFormatted);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Chat fetched successfully`,
      data: chat.reverse(),
      meta_data: {
        totalCount,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        showClara: false,
        mentorAvailableAt: "00:00:00",
        hasMore,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addDraftedQuery = async (req, res, next) => {
  try {
    const { user_id, mentor_id, draft_text } = req.body;
    const files = req?.files;
    let urls = [];

    if (files && files.length > 0) {
      const folder = cloudinaryFolders.queryAttachments;
      urls = await uploadArrayOfFilesToCloudinary(files, folder, draft_text);
    }

    const columns = [
      "user_id",
      "mentor_id",
      draft_text ? "draft_text" : null,
      files && files.length > 0 ? "attachment" : null,
    ].filter(Boolean);
    const values = [
      user_id,
      mentor_id,
      draft_text ? draft_text : null,
      files && files.length > 0
        ? JSON.stringify(urls.map((item) => item.file.path))
        : null,
    ].filter(Boolean);

    const result = await insertRecord(
      `${tables.draftedQueries}`,
      columns,
      values,
    );
    if (result.affectedRows === 0) {
      return next(new ErrorHandler("Error While adding Drafted Query", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Drafted Query added successfully`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteDraftQuery = async (req, res, next) => {
  try {
    const { id } = req.body;

    const deleteRecordsResult = await deleteRecords(
      `${tables.draftedQueries}`,
      parseInt(id),
      { id },
    );
    if (deleteRecordsResult.success === false) {
      return next(new ErrorHandler("Error While Deleting Drafted Query", 400));
    }

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Draft deleted successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getDraftedQuery = async (req, res, next) => {
  try {
    let { user_id, mentor_id } = req.query;

    user_id = user_id?.replace("%2F", "");
    user_id = user_id?.replace("/", "");

    const selectFields = [
      "dq.id",
      "dq.user_id",
      "dq.mentor_id",
      "dq.draft_text",
      "dq.attachment",
    ];
    let offer_text = "<br>";
    let conditions = [];
    if (user_id) {
      conditions.push({ field: "dq.user_id", operator: "=", value: user_id });
    }
    if (mentor_id) {
      conditions.push({
        field: "dq.mentor_id",
        operator: "=",
        value: mentor_id,
      });
    }

    const { results: draftedQueries = [] } = await readRecord({
      table: `${tables.draftedQueries} dq`,
      selectFields,
      ...(conditions.length > 0 && { conditions }),
      orderBy: ["dq.created_at DESC"],
    });
    const formattedQueries = draftedQueries.map((query) => ({
      id: query.id,
      user_id: query.user_id,
      mentor_id: query.mentor_id,
      draft_text: query.draft_text,
      attachment: JSON.parse(query.attachment),
    }));
    const { results: userData } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails}`,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    const draftIds = [];
    const validAdvanceProgramIds = [
      162, 163, 166, 167, 168, 169, 170, 171, 172, 173, 176,
    ];
    const validPhase2ProgramIds = [4, 34, 74, 75, 92, 91, 108, 6, 5, 38];

    const details = await fetchUsersDetailsNew({
      ids: [user_id],
      selectData: {
        active_program: true,
        suggested_program: true,
        order_summary: true,
        health_score: true,
        goal_weight: true,
        goal: true,
      },
    });
    console.log(details, 612);
    if (userData[0]?.user_status === "Active") {
      draftIds.push(2880);
      // if (userData[0]?.suggested_program_id) {
      //   draftIds.push(2890);
      // } else {
      //   draftIds.push(2888);
      // }

      // if (validAdvanceProgramIds.includes(details[0]?.suggested_program_id)) {
      //   offer_text = `
      //     <p>Hi ${details[0].client_name},</p>

      //     <p>I was also feeling bad about your account losing Rs.${details[0]?.old_wallet} that we had earned :(</p>

      //     <p>Here is what I would like you to think about.</p>

      //     <p>I had suggested the <strong>90-day Anti-inflammatory Plateau breaker / Intermittent Fasting</strong> program that came to Rs.${27999 - details[0]?.old_wallet}, right?</p>

      //     <p>What if we do <strong>90 days of Plateau breaker / Intermittent Fasting</strong> instead? And I get your wallet credits back by tomorrow?</p>

      //     <p><strong>The final Wallet Discount price will come to: Rs.${23999 - details[0]?.old_wallet} only along with a complementary 10-day session!</strong></p>

      //     <p>Do let me know when we can connect over a call to discuss the same - <a href="${details[0]?.call_link}">${details[0]?.call_link}</a></p>
      //   `;
      // } else if (validPhase2ProgramIds.includes(details[0]?.suggested_program_id)) {
      //   offer_text = `
      //     <p>Hi ${details[0].client_name},</p>

      //     <p>I was also feeling bad about your account losing Rs.${details[0]?.old_wallet} that we had earned :(</p>

      //     <p>Here is what I would like you to think about.</p>

      //     <p>I had suggested the <strong>90 day ${details[0]?.suggested_program_name}</strong> program that came to Rs.${23999 - details[0]?.old_wallet}, right?</p>

      //     <p>What if we do <strong>60 days of ${details[0]?.suggested_program_name}</strong> instead? And I get your wallet credits back by tomorrow?</p>

      //     <p><strong>The Wallet Discount price will come to: Rs.${19999 - details[0]?.old_wallet} only! You also get a 10-day Anti-inflammatory diet free!</strong></p>

      //     <p>Do let me know when we can connect over a call to discuss the same - <a href="${details[0]?.call_link}">${details[0]?.call_link}</a></p>
      //   `;
      // } else {
      //   offer_text = `
      //     <p>Hi ${details[0]?.client_name},</p>

      //     <p>I was also feeling bad about your account losing Rs.${details[0]?.old_wallet} that we had earned :(</p>

      //     <p>Here is what I would like you to think about.</p>

      //     <p>I had suggested the <strong>SlimPossible 60</strong> program that came to Rs.${21599 - details[0]?.old_wallet}, right?</p>

      //     <p>What if I tell you that you get an <strong>additional 10-day Anti-inflammatory diet free</strong>? And I also get your wallet credits back by tomorrow?</p>

      //     <p><strong>The final Wallet Discount price will come to: Rs.7999 only along with a complementary 10-day session!</strong></p>

      //     <p>Do let me know when we can connect over a call to discuss the same - <a href="${details[0]?.call_link}">${details[0]?.call_link}</a></p>
      //   `;
      // }
    } else {
      draftIds.push(2905);
      // if (userData[0]?.suggested_program_id) {
      //   draftIds.push(2903);
      // } else {
      //   draftIds.push(2904);
      // }

      //       if (validAdvanceProgramIds.includes(details[0]?.suggested_program_id)) {
      //         offer_text = `
      //     <p>Hi ${details[0].client_name},</p>
      //   <p>Hi ${details[0]?.client_name},</p>
      //     <p>An urgent reminder Rs.${details[0]?.client_wallet} in your BN Wallet will become 0 on Saturday!</p>

      // <p>The 90-day <b>${details[0]?.suggested_program_name}</b> program that I had recommended to you is available at a very good price.</p>

      // <p>To know your final price, please write back to me here & I shall send you all the details.
      // </p>
      // <p>Let me know if you want to get on a quick call too</p>
      //      `;
      //       } else if (
      //         validPhase2ProgramIds.includes(details[0]?.suggested_program_id)
      //       ) {
      //         offer_text = `
      //   <p>Hi ${details[0]?.client_name},</p>
      //     <p>An urgent reminder Rs.${details[0]?.client_wallet} in your BN Wallet will become 0 on Saturday!</p>

      // <p>The 90-day <b>${details[0]?.suggested_program_name}</b> program that I had recommended to you is available at a very good price.</p>

      // <p>To know your final price, please write back to me here & I shall send you all the details.
      // </p>
      // <p>Let me know if you want to get on a quick call too</p>
      //      `;
      //       } else {
      //         offer_text = `
      //     <p>Hi ${details[0]?.client_name},</p>
      //     <p>An urgent reminder Rs.${details[0]?.client_wallet} in your BN Wallet will become 0 on Saturday!</p>

      // <p>The 60-day <b>Slim Possible</b> program that I had recommended to you is available at a very good price.</p>

      // <p>To know your final price, please write back to me here & I shall send you all the details.
      // </p>
      // <p>Let me know if you want to get on a quick call too</p>
      //    `;
      //       }
    }
    console.log(details[0], 551);
    let psBlock = "";
    const phone = details[0]?.client_phone?.replace(/\s/g, "") || "";
    if ([132, 134].includes(details[0]?.suggested_program_id)) {
      offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    <p>We are now left with only <strong>${
      details[0]?.current_program_total_sessions -
      details[0]?.current_program_sent_sessions
    } sessions</strong> of the <strong>${
      details[0]?.current_program_name
    } Program</strong>.</p>

    <p>
      I was just checking up on our progress so far in the program. In the last <strong>${
        details[0]?.current_program_sent_sessions
      } sessions</strong>, we have lost <strong>${
        details[0].client_weight_difference
      } kg</strong> and need to lose <strong>${
        details[0].goal_weight - details[0].client_latest_weight
      } kg</strong> more to reach your goal weight.
    </p>

    ${
      details[0].client_latest_bmi
        ? `<p>
      Your B.M.I is currently <strong>${details[0].client_latest_bmi} kg/m<sup>2</sup></strong>, whereas the ideal BMI is under <strong>25 kg/m<sup>2</sup></strong>.
    </p>`
        : ""
    }

    <p>
      As our next plan of action, we should consider joining the <strong>10-day Fitness Challenge</strong> starting <strong>Saturday</strong>. 
      This will not only help burn more calories but also get us more active — supporting hormones and cardiovascular health too.
    </p>

    <p>
      If we add the <strong>60-day Advanced Combo</strong> program, the cost of the challenge becomes <strong style="color: green;">Rs. 0</strong>!
    </p>

    <p>
      We'll go for the <strong>30-day <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=75">Plateau Breaker</a> </strong> &amp; <strong>30-day <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=92">Reform Intermittent</a> / <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=108">ReneU</a> / <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=38">Body Transformation</a></strong> 
      to make a 60-day program!
    </p>

    <p>
      This program is currently available at <strong>65% off</strong>, so the cost to you after the offers comes to:
    </p>

    <ul>
      <li><strong>Total MRP:</strong> Rs. 26999</li>
      <li><strong>Discount to you:</strong> Rs. 9499</li>
      <li><strong>Total Savings:</strong> Rs. 17500</li>
    </ul>

    <p>
      Since this will be your <strong>${
        details[0].client_program_count
      }</strong> program with us, just for you, we're offering an additional 
      <strong>Rs. 500 / 1000 off</strong>, along with the free fitness challenge!
    </p>

    <p><strong>Let me know if I should send you the link</strong></p>`;
    } else if (details[0]?.suggested_program_id) {
      offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    <p>We are now left with only <strong>${
      details[0]?.current_program_total_sessions -
      details[0]?.current_program_sent_sessions
    } sessions</strong> of the <strong>${
      details[0].current_program_name
    } Program</strong>.</p>

    <p>
      I was just checking up on our progress so far in the program. In the last <strong>${
        details[0]?.current_program_sent_sessions
      } sessions</strong>, we have lost 
      <strong>${
        details[0].client_weight_difference
      } kg</strong> and have <strong>${
        details[0].goal_weight - details[0].client_latest_weight
      } kg</strong> left to lose to reach your goal weight.
    </p>

    ${
      details[0].client_latest_bmi
        ? `<p>
      Your B.M.I is currently <strong>${details[0].client_latest_bmi} kg/m<sup>2</sup></strong>, whereas the ideal BMI is under <strong>25 kg/m<sup>2</sup></strong>.
    </p>`
        : ""
    }

    <p>
      As our next plan of action, we must consider joining the <strong>10-day Fitness Challenge</strong> starting 
      <strong>Saturday</strong>. This will not only help us burn more calories, but also help us become more active — 
      supporting hormones and cardiovascular health too.
    </p>

    <p>
      If we add the <strong>${
        details[0].suggested_program_days
      } <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
        details[0].suggested_program_id
      }"> ${
        details[0].suggested_program_name
      }</a></strong> now, the cost of the challenge becomes 
      <strong style="color: green;">Rs. 0</strong>!
    </p>

    <p>
      This program is available at <strong>55% off</strong>, so the cost to you after the offers comes to:
    </p>

    <ul>
      <li><strong>Total MRP:</strong> Rs. ${
        details[0].suggested_program_mrp
      }</li>
    </ul>

    <p>
      Since this will be your <strong>${
        details[0].client_program_count
      }</strong> program with us, just for you, we're offering an 
      additional <strong>Rs. 500 / 1000 off</strong>, along with the free fitness challenge!
    </p>

    <p><strong>Let me know if I can send you the link 😊</strong></p>`;
    } else {
      offer_text = `<p>Hi <strong>${details[0]?.client_name}</strong>,</p>

    <p>We are now left with only <strong>${
      details[0]?.current_program_total_sessions -
      details[0]?.current_program_sent_sessions
    } sessions</strong> of the <strong>${
      details[0].current_program_name
    } Program</strong>.</p>

    <p>
      I was just checking up on our progress so far in the program. In the last <strong>${
        details[0].current_program_sent_sessions
      } sessions</strong>, we have lost 
      <strong>${
        details[0].client_weight_difference
      } kg</strong> and have <strong>${
        details[0].goal_weight - details[0].client_latest_weight
      } kg</strong> left to lose to reach your goal weight.
    </p>
      ${
        details[0].client_latest_bmi
          ? `<p>
      Your B.M.I is currently <strong>${details[0].client_latest_bmi} kg/m<sup>2</sup></strong>, whereas the ideal BMI is under <strong>25 kg/m<sup>2</sup></strong>.
    </p>`
          : ""
      }
    

    <p>
      As our next plan of action, we must consider joining the <strong>10-day Fitness Challenge</strong> starting 
      <strong>Saturday</strong>. This will not only help us burn more calories, but also help us become more active — 
      supporting hormones and cardiovascular health too.
    </p>

    <p>
      If we add the <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=92" rel="noopener noreferrer" target="_blank"><strong>Reform Intermittent</strong></a> 90/60 Days.... <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=108" rel="noopener noreferrer" target="_blank"><strong>Reneu</strong></a> 90/60 days.... <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=34" rel="noopener noreferrer" target="_blank"><strong>Body Transformation</strong></a> 90/60 days...<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=38" rel="noopener noreferrer" target="_blank"><strong>Active</strong></a> 90/60 days...<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=75" rel="noopener noreferrer" target="_blank">PlateauBreaker</a> 60/90 days....<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134" rel="noopener noreferrer" target="_blank">Slimpossible60</a>.... now, the cost of the challenge becomes 
      <strong style="color: green;">Rs. 0</strong>!
    </p>

    <p>
      This program is available at <strong>55% off</strong>, so the cost to you after the offers comes to:
    </p>

    <ul>
      <li><strong>Total MRP:</strong> Rs. 27999</li>
    </ul>

    <p>
      Since this will be your <strong>${
        details[0].client_program_count
      }</strong> program with us, just for you, we're offering an 
      additional <strong>Rs. 500 / 1000 off</strong>, along with the free fitness challenge!
    </p>

    <p><strong>Let me know if I can send you the link </strong></p>`;
    }

    //     if (userData[0]?.user_status === "Active") {
    //       if (
    //         [4, 34, 74, 75, 92, 91, 108, 6, 5, 38].includes(
    //           details[0]?.suggested_program_id
    //         )
    //       ) {
    //         offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the <strong>90 days ${details[0].suggested_program_name} program</strong> to reach your goal weight.</p>

    // <p>I wanted to let you know that the <strong>month-end offer is still available</strong> for you until <strong>5th July</strong>. While new offers will be introduced on Saturday, they may not be the lowest price, and we want you to get the best discount.</p>

    // <p>If you're considering it, let's connect before Saturday for a quick discussion. I'd be happy to guide you through the best option for your goals.</p>

    // <p><strong>P.S.</strong> <a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">Click here</a> to book a call with me to understand more!</p>
    // `;
    //       } else if (
    //         [162, 163, 166, 167, 168, 169, 170, 171, 172, 173, 176].includes(
    //           details[0]?.suggested_program_id
    //         )
    //       ) {
    //         offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the <strong>90 days ${details[0].suggested_program_name} program</strong> to reach your goal weight.</p>

    // <p>I wanted to let you know that the <strong>month-end offer is still available</strong> for you until <strong>5th July</strong>. While new offers will be introduced on Saturday, they may not be the lowest price, and we want you to get the best discount.</p>

    // <p>If you're considering it, let's connect before Saturday for a quick discussion. I'd be happy to guide you through the best option for your goals.</p>

    // <p><strong>P.S.</strong> <a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">Click here</a> to book a call with me to understand more!</p>
    // `;
    //       } else if ([132, 134].includes(details[0]?.suggested_program_id)) {
    //         offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the <strong>60 days ${details[0].suggested_program_name} program</strong> to reach your goal weight.</p>

    // <p>I wanted to let you know that the <strong>month-end offer is still available</strong> for you until <strong>5th July</strong>. While new offers will be introduced on Saturday, they may not be the lowest price, and we want you to get the best discount.</p>

    // <p>If you're considering it, let's connect before Saturday for a quick discussion. I'd be happy to guide you through the best option for your goals.</p>

    // <p><strong>P.S.</strong> <a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">Click here</a> to book a call with me to understand more!</p>
    // `;
    //       } else {
    //         offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>As discussed with you earlier, Khyati ma'am and I strongly recommend you continue with the <strong>60 days Slim Possible program</strong> to reach your goal weight.</p>

    // <p>I wanted to let you know that the <strong>month-end offer is still available</strong> for you until <strong>5th July</strong>. While new offers will be introduced on Saturday, they may not be the lowest price, and we want you to get the best discount.</p>

    // <p>If you're considering it, let's connect before Saturday for a quick discussion. I'd be happy to guide you through the best option for your goals.</p>

    // <p><strong>P.S.</strong> <a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">Click here</a> to book a call with me to understand more!</p>
    // `;
    //       }
    //     } else {
    //       offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>How are you?</p>

    // <p>Your weight back  was <strong>${details[0].client_latest_weight} kg</strong> when you left us last.</p>

    // <p>How about now, are you maintaining the same or have you gained?</p>

    // <p>
    //   The <strong>Founder's Day offers</strong> are now live, and until
    //   <strong>7th July 2025</strong>, all our programs are available at
    //   <strong>flat 60% off</strong> - which is the lowest price ever!
    // </p>

    // <p>Do ping me back if you wish to know more and restart your health journey with us!</p>
    // `;
    //     }
    //     if (details[0]?.suggested_program_id) {
    //       offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>If you recollect, I had recommended you take a look at the <strong>${
    //         details[0].suggested_program_days
    //       }</strong>, <strong><a href="https://www.balancenutrition.in/app_link/screen_id=21/redirect_id=${
    //         details[0]?.suggested_program_id
    //       }">${details[0].suggested_program_name}</a></strong> program.</p>

    // <p>On client request, we are now allowed to give the founder's birthday offers till <strong>Monday</strong>! (Lowest rates of the year) So you are eligible to get this program at a flat <strong> ${
    //         details[0].suggested_program_id === 134 ? "70" : "60"
    //       }% off</strong>!</p>

    // <p><a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=45" rel="noopener noreferrer" target="_blank">Click here</a> to check the current discount on your next program.</p>

    // <p><strong>This is what I plan to address next:</strong></p>
    // <p><strong>Main goals:</strong> (edit mentor)</p>
    // <ol>
    //   <li>Work on body composition improvement - try & add more weight but muscle</li>
    //   <li>Work on IBS symptoms</li>
    //   <li>Get the HbA1C to 5.7</li>
    // </ol>

    // <p>The other blood parameters will automatically come down on their own with the changes we will make in diet & lifestyle.</p>

    // <p><a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=45" rel="noopener noreferrer" target="_blank">Click here</a> to schedule a call with me & we shall talk about this in detail.</p>`;
    //     } else {
    //       offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>

    // <p>If you recollect, I had recommended you take a look at the <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=92" rel="noopener noreferrer" target="_blank"><strong>Reform Intermittent</strong></a> 90/60 Days.... <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=108" rel="noopener noreferrer" target="_blank"><strong>Reneu</strong></a> 90/60 days.... <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=34" rel="noopener noreferrer" target="_blank"><strong>Body Transformation</strong></a> 90/60 days...<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=38" rel="noopener noreferrer" target="_blank"><strong>Active</strong></a> 90/60 days...<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=75" rel="noopener noreferrer" target="_blank">PlateauBreaker</a> 60/90 days....<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134" rel="noopener noreferrer" target="_blank">Slimpossible60</a>....</p> program.</p>

    // <p>On client request, we are now allowed to give the founder's birthday offers till <strong>Monday</strong>! (Lowest rates of the year) So you are eligible to get this program at a flat <strong>60% off</strong>!</p>

    // <p><a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=45" rel="noopener noreferrer" target="_blank">Click here</a> to check the current discount on your next program.</p>

    // <p><strong>This is what I plan to address next:</strong></p>
    // <p><strong>Main goals:</strong> (edit mentor)</p>
    // <ol>
    //   <li>Work on body composition improvement - try & add more weight but muscle</li>
    //   <li>Work on IBS symptoms</li>
    //   <li>Get the HbA1C to 5.7</li>
    // </ol>

    // <p>The other blood parameters will automatically come down on their own with the changes we will make in diet & lifestyle.</p>

    // <p><a href="https://www.balancenutrition.in/app_link/screen_id=18/call_type=45" rel="noopener noreferrer" target="_blank">Click here</a> to schedule a call with me & we shall talk about this in detail.</p>
    // `;
    //     }

    // offer_text= `<p><strong>AUTO 1 = TO GET THEM ADD MORE MONEY (USE SMARTLY)</strong></p><p><br></p><p>Hi ${details[0].client_name},&nbsp;</p><p><br></p><p>Congratulations! You have auto-won Rs.${details[0].client_wallet-details[0].old_wallet} in your BN Wallet as you&nbsp;:) Your total wallet balance is Rs.0000</p><p><br></p><p>Here is a quick way you can earn more money.&nbsp;</p><p><br></p><p>1. Subscribe to our YouTube channel:&nbsp; <a href="https://www.youtube.com/c/BalanceNutrition" rel="noopener noreferrer" target="_blank">Link</a></p><p>2. Use the BN Restaurant guide &amp; tell us all about your outside meals: <a href="https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_id}" rel="noopener noreferrer" target="_blank">click here&nbsp;</a></p><p>3. Refer a friend: <a href="https://www.balancenutrition.in/app_link/screen_id=4" rel="noopener noreferrer" target="_blank">Click here&nbsp;</a></p><p><br></p><p>You can easily earn up to Rs.3000 with these activities!</p><p><br></p><p>Let me know once you do these activities so I will add the money to your BN Wallet.</p>`;

    if (userData[0]?.user_status === "Completed") {
      if (details[0]?.suggested_program_id) {
        offer_text = `
 
      <p>Hi <strong>${details[0].client_name}</strong>,</p>
       <p><strong>DROP IT BETWEEN QUERY</strong></p>

  <p>
    Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your BN Wallet expiring tonight
    This is the ideal time to consider adding another program, as you will save a significant amount of money.
  </p>
    
  <p>
    Check the final pricing of the <strong>90-day ${details[0]?.suggested_program_name} program</strong> that I have recommended to you - 
    <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">Click here</a>. Let’s connect soon.
  </p>

  <p>
    <a href="https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45" target="_blank">Click here</a> to book a call with me, or simply write back &amp; we’ll discuss your progress &amp; the next steps.
  </p>

  <p><strong>P.S.</strong> The BN App, in the coming weeks, will introduce a lot of new features that will help us stay motivated & also track calories, water intake, steps, extra food eaten & lot more. :) </p>
 
      `;
      } else {
        offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>
       <p><strong>DROP IT BETWEEN QUERY</strong></p>

  <p>
    Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your BN Wallet expiring tonight
    This is the ideal time to consider adding another program, as you will save a significant amount of money.
  </p>

    <p>MENTION DETAILS OF THE PROGRAM YOU WANT TO PITCH </p>

  <p>
    <a href="https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45" target="_blank">Click here</a> to book a call with me, or simply write back &amp; we’ll discuss your progress &amp; the next steps.
  </p>

  <p><strong>P.S.</strong> The BN App, in the coming weeks, will introduce a lot of new features that will help us stay motivated & also track calories, water intake, steps, extra food eaten & lot more. :) </p>
    
  `;
      }

      if (details[0]?.suggested_program_id) {
        offer_text =
          offer_text +
          `<p><b>Default P.S Line</b></p><p><b>P.S.</b> Rs.${details[0]?.client_wallet} in your BN Wallet will become Rs. 0 soon. Please review the final discount for the 90-day ${details[0]?.suggested_program_name} (<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">click here</a>) program that I have recommended for you. </p>`;
      } else {
        offer_text =
          offer_text +
          `<p><b>Default P.S Line</b></p><p><b>P.S.</b> Rs.${details[0]?.client_wallet} in your BN Wallet will become Rs. 0 soon. Please review the final discount for the 60-day Slim Possible (<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134" target="_blank">click here</a>) program that I have recommended for you. </p>`;
      }
    } else {
      const parsedComment = JSON.parse(details[0]?.comment);

      // Extract goals_achieved
      const goals = parsedComment?.goals_achieved || [];

      let goal_point = "";
      // Output each milestone
      // goals.forEach((goal, index) => {
      //   goal_point=goal_point+`<p>${index + 1}: ${goal}</p>`;
      // });

      //     if (details[0]?.suggested_program_id) {
      //       offer_text=`<p>Hi ${details[0].client_name}, </p> <p>We received multiple client requests to enable the use of the old BN Wallet Balance that was recently debited. </p> <p>You now have a total credit of <b>Rs.${details[0]?.client_wallet}</b> lying unused in your BN Wallet :)</p> <p>You can use 100% of this amount + existing in-app offers to get your next program at the lowest rates!</p> <p><a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">click here</a> to check the total discount on the 90-day intermittent fasting program that I recommended to you 🙂</p> <p>P.S. All wallet balances will become Rs.0 on the 25th of August</p>`;
      //     }else{
      //       offer_text=`<p>Hi ${details[0].client_name}, </p> <p>We received multiple client requests to enable the use of the old BN Wallet Balance that was recently debited. </p> <p>You now have a total credit of <b>Rs.${details[0]?.client_wallet}</b> lying unused in your BN Wallet :)</p> <p>You can use 100% of this amount + existing in-app offers to get your next program at the lowest rates!</p> <p>Ping me asap to know more :)  </p> <p>P.S. All wallet balances will become Rs.0 on the 25th of August</p>`;
      //     }

      //     if (details[0]?.suggested_program_id) {
      //       offer_text=offer_text+`<p><b>Default P.S Line</b></p><p><b>P.S.</b><p>Your wallet money is re-credited!</p>
      // <p>You now have a total of Rs.${details[0]?.client_wallet} to purchase your next program using the double-discounts :)</p>` ;
      // }else{
      //       offer_text=offer_text+`<p><b>Default P.S Line</b></p><p><b>P.S.</b><p>Your wallet money is re-credited!</p>
      // <p>You now have a total of Rs.${details[0]?.client_wallet} to purchase your next program using the double-discounts :)</p>`;
      //     }

      if (details[0]?.suggested_program_id) {
        offer_text = `
 
      <p>Hi <strong>${details[0].client_name}</strong>,</p>
       <p><strong>DROP IT BETWEEN QUERY</strong></p>

  <p>
    Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your BN Wallet expiring tonight
    This is the ideal time to consider adding another program, as you will save a significant amount of money.
  </p>
    
  <p>
    Check the final pricing of the <strong>90-day ${details[0]?.suggested_program_name} program</strong> that I have recommended to you - 
    <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">Click here</a>. Let’s connect soon.
  </p>

  <p>
    <a href="https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45" target="_blank">Click here</a> to book a call with me, or simply write back &amp; we’ll discuss your progress &amp; the next steps.
  </p>

  <p><strong>P.S.</strong> The BN App, in the coming weeks, will introduce a lot of new features that will help us stay motivated & also track calories, water intake, steps, extra food eaten & lot more. :) </p>
 
      `;
      } else {
        offer_text = `<p>Hi <strong>${details[0].client_name}</strong>,</p>
       <p><strong>DROP IT BETWEEN QUERY</strong></p>

  <p>
    Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your BN Wallet expiring tonight
    This is the ideal time to consider adding another program, as you will save a significant amount of money.
  </p>

    <p>MENTION DETAILS OF THE PROGRAM YOU WANT TO PITCH </p>

  <p>
    <a href="https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45" target="_blank">Click here</a> to book a call with me, or simply write back &amp; we’ll discuss your progress &amp; the next steps.
  </p>

  <p><strong>P.S.</strong> The BN App, in the coming weeks, will introduce a lot of new features that will help us stay motivated & also track calories, water intake, steps, extra food eaten & lot more. :) </p>
    
  `;
      }

      if (details[0]?.suggested_program_id) {
        offer_text =
          offer_text +
          `<p><b>Default P.S Line</b></p><p><b>P.S.</b> Rs.${details[0]?.client_wallet} in your BN Wallet will become Rs. 0 soon. Please review the final discount for the 90-day ${details[0]?.suggested_program_name} (<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">click here</a>) program that I have recommended for you. </p>`;
      } else {
        offer_text =
          offer_text +
          `<p><b>Default P.S Line</b></p><p><b>P.S.</b> Rs.${details[0]?.client_wallet} in your BN Wallet will become Rs. 0 soon. Please review the final discount for the 60-day Slim Possible (<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134" target="_blank">click here</a>) program that I have recommended for you. </p>`;
      }
    }

    offer_text = "";
    if (details[0]?.suggested_program_id) {
      if (
        [4, 34, 74, 75, 92, 91, 108, 6, 5, 38].includes(
          details[0]?.suggested_program_id,
        )
      ) {
        offer_text = `<p><b>Auto 1 : MENTOR CAN EDIT TEXT </b></p> <p>Hi ${
          details[0].client_name
        },</p> <p>I just wanted to update you that there is <b>Rs.${
          details[0].client_wallet
        }</b> in your BN Wallet expiring on Saturday. As per your current progress, we've lost ${
          details[0].client_weight_difference
        } kg, and we’re still ${
          details[0].goal_weight - details[0].client_latest_weight
        } kg away from your goal as per your assessment.</p> <p>I would strongly recommend we add the <b>90-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          details[0]?.suggested_program_id
        } >${
          details[0]?.suggested_program_name
        }</a></b> Program & do that next. </p> <p><b>Write WHY properly. IN STEPS - MENTION GOALS. </b></p> <p>MRP: Rs.27999</p> <p>App Offer: - Rs.4200</p> <p>BN Wallet: - Rs.${
          details[0].client_wallet
        }</p> <p>You get a total discount of Rs.${
          27999 - 4200 - details[0].client_wallet
        }! <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${
          details[0]?.suggested_program_id
        } >Click here</a> to check your final price.</p> <p>P.S. The rates of the programs after Diwali will be higher. Do register for this ASAP :)</p> <p>Shall I send you the Registration link?</p>`;
      } else if (
        [162, 163, 166, 167, 168, 169, 170, 171, 172, 173, 176].includes(
          details[0]?.suggested_program_id,
        )
      ) {
        offer_text = `<p><b>Auto 1 : MENTOR CAN EDIT TEXT </b></p> <p>Hi ${
          details[0].client_name
        },</p> <p>I just wanted to update you that there is <b>Rs.${
          details[0].client_wallet
        }</b> in your BN Wallet expiring on Saturday. As per your current progress, we've lost ${
          details[0].client_weight_difference
        } kg, and we’re still ${
          details[0].goal_weight - details[0].client_latest_weight
        } kg away from your goal as per your assessment.</p> <p>I would strongly recommend we add the <b>180-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=163 >${
          details[0]?.suggested_program_name
        }</a></b> Program & do that next. </p> <p><b>Write WHY properly. IN STEPS - MENTION GOALS. </b></p> <p>MRP: Rs.64,999</p> <p>App Offer: - Rs.22750</p> <p>BN Wallet: - Rs.${
          details[0].client_wallet
        }</p> <p>You get a total discount of Rs.${
          64999 - 22750 - details[0].client_wallet
        }! <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=163 >Click here</a> to check your final price.</p> <p>P.S. The rates of the programs after Diwali will be higher. Do register for this ASAP :)</p> <p>Shall I send you the Registration link?</p>`;
      } else {
        offer_text = `<p><b>Auto 1 : MENTOR CAN EDIT TEXT </b></p> <p>Hi ${
          details[0].client_name
        },</p> <p>I just wanted to update you that there is <b>Rs.${
          details[0].client_wallet
        }</b> in your BN Wallet expiring on Saturday. As per your current progress, we've lost ${
          details[0].client_weight_difference
        } kg, and we’re still ${
          details[0].goal_weight - details[0].client_latest_weight
        } kg away from your goal as per your assessment.</p> <p>I would strongly recommend we add the <b>60-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 >Slim Possible</a></b> Program & do that next. </p> <p><b>Write WHY properly. IN STEPS - MENTION GOALS. </b></p> <p>MRP: Rs.26999</p> <p>App Offer: - Rs.6750</p> <p>BN Wallet: - Rs.${
          details[0].client_wallet
        }</p> <p>You get a total discount of Rs.${
          64999 - 22750 - details[0].client_wallet
        }! <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134 >Click here</a> to check your final price.</p> <p>P.S. The rates of the programs after Diwali will be higher. Do register for this ASAP :)</p> <p>Shall I send you the Registration link?</p>`;
      }
    } else {
      offer_text = `<p><b>Auto 1 : MENTOR CAN EDIT TEXT </b></p> <p>Hi ${
        details[0].client_name
      },</p> <p>I just wanted to update you that there is <b>Rs.${
        details[0].client_wallet
      }</b> in your BN Wallet expiring on Saturday. As per your current progress, we've lost ${
        details[0].client_weight_difference
      } kg, and we’re still ${
        details[0].goal_weight - details[0].client_latest_weight
      } kg away from your goal as per your assessment.</p> <p>I would strongly recommend we add the <b>180-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=163 >Anti-Inflammatory Intermittent Fasting</a></b> Program & do that next. </p> <p><b>Write WHY properly. IN STEPS - MENTION GOALS. </b></p> <p>MRP: Rs.64,999</p> <p>App Offer: - Rs.22750</p> <p>BN Wallet: - Rs.${
        details[0].client_wallet
      }</p> <p>You get a total discount of Rs.${
        64999 - 22750 - details[0].client_wallet
      }! <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=163 >Click here</a> to check your final price.</p> <p>P.S. The rates of the programs after Diwali will be higher. Do register for this ASAP :)</p> <p>Shall I send you the Registration link?</p>`;
    }

    let psdebit = "";

    if (/^(?:\+)?(91|44|971|973)/.test(phone)) {
      psdebit =
        "<p>P.S. Have you checked the BN-Healthy Snacks & Cookies? <a href=https://www.balancenutrition.in/shop >Click here</a> to explore the products: <a href=https://www.balancenutrition.in/shop >Click here</a></p>";
    }
    if (details[0]?.old_wallet >= 11000) {
      if (
        details[0]?.suggested_program_id &&
        [4, 34, 74, 75, 92, 91, 108, 6, 5, 38].includes(
          details[0]?.suggested_program_id,
        )
      ) {
        offer_text = `<p>Hi ${details[0].client_name},</p>

<p>As you are aware, Rs.${
          details[0].old_wallet - 1000
        } was debited from your BN Wallet Yesterday :(</p>

<p>I was just checking, you had paid Rs.${
          details[0].current_program_amount
        } for your current program & this one was available to you at just Rs.${
          27999 - 4200 - details[0].old_wallet
        } with the BN Snack Hamper Free. </p>

<p>Your total discount on the 90-day ${
          details[0]?.suggested_program_name
        } program was Rs.${4200 + details[0].old_wallet}!</p>

<p>Do you want me to check with management if we can still use your wallet balance for this until tomorrow?</p>

<p>Let me know quickly, I can try 🤞</p>
    
       ${psdebit}
      `;
      } else {
        offer_text = `
      <p>Hi ${details[0].client_name},</p>

<p>As you are aware, Rs.${
          details[0].old_wallet - 1000
        } was debited from your BN Wallet Yesterday :(</p>

<p>I was just checking, you had paid Rs.${
          details[0].current_program_amount
        } for your current program & this one was available to you at just Rs.${
          26999 - 6750 - details[0].old_wallet
        } with the BN Snack Hamper Free. </p>

<p>Your total discount on the 60-day Slim Possible program was Rs.${
          6750 + details[0].old_wallet
        }!</p>

<p>Do you want me to check with management if we can still use your wallet balance for this until tomorrow?</p>

<p>Let me know quickly, I can try 🤞</p>

      ${psdebit}
      `;
      }
    }
    console.log(details[0], 1328);
    offer_text = "";

    // ✅ Check phone code (India, UK, UAE, Bahrain)
    if (/^(?:\+)?(91|44|971|973)/.test(phone)) {
      psBlock = `
  <p><b>P.S.</b> I will be sending you a surprise hamper with our newly launched BN Health Snacks along with your program purchase</p>
  <p>Check the products here: <a href="https://www.balancenutrition.in/shop" target="_blank">https://www.balancenutrition.in/shop</a></p>
  `;
    }

    if (details[0]?.suggested_program_id) {
      offer_text = `
  <p>Hi <strong>${details[0].client_name}</strong>,</p>
  <p><strong>DROP IT BETWEEN QUERY</strong></p>

  <p>
    Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your BN Wallet expiring in 3 days 
    This is the ideal time to consider adding another program, as you will save a significant amount of money.
  </p>
    
  <p>
    Check the final pricing of the <strong>90-day ${details[0]?.suggested_program_name} program</strong> that I have recommended to you - 
    <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">Click here</a>. Let’s connect soon.
  </p>

  <p>
    <a href="https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45" target="_blank">Click here</a> to book a call with me, or simply write back &amp; we’ll discuss your progress &amp; the next steps.
  </p>

  ${psBlock}
  `;
    } else {
      offer_text = `
  <p>Hi <strong>${details[0].client_name}</strong>,</p>
  <p><strong>DROP IT BETWEEN QUERY</strong></p>

  <p>
    Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your BN Wallet expiring in 3 days 
    This is the ideal time to consider adding another program, as you will save a significant amount of money.
  </p>

  <p>WRITE ABOUT THE PROGRAM YOU WANT TO PITCH - DRAFTS ARE IN YOUR SAVED REPLIES</p>

  <p>
    <a href="https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45" target="_blank">Click here</a> to book a call with me, or simply write back &amp; we’ll discuss your progress &amp; the next steps.
  </p>

  ${psBlock}
  `;
    }

    //     if (userData[0]?.user_status === "Active" && details[0]?.client_wallet > 8000) {
    //       if(details[0]?.suggested_program_id){
    //         offer_text = `<p>Hi ${details[0].client_name},</p> <p>Good News for those who could not use their BN Wallet Balance last month :)</p> <p>Since many of our clients were not able to use their wallet balances, it was decided to re-credit Rs.${details[0].client_wallet - 1000} back to your BN Wallet. Your current wallet balance now is Rs.${details[0].client_wallet}</p> <p>Use the wallet money to purchase your next program on the in-app double discount offer & get a complimentary BN Snack Hamper with your next purchase.</p> <p>Write back to me to know more or schedule a call with me: <a href=https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45 >Click here</a></p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id} >Click here</a> to check the total discount on the 90-day ${details[0]?.suggested_program_name} program that I recommended to you 🙂</p>`;

    //       }else{
    //         offer_text = `<p>Hi ${details[0].client_name},</p> <p>Good News for those who could not use their BN Wallet Balance last month :)</p> <p>Since many of our clients were not able to use their wallet balances, it was decided to re-credit Rs.${details[0].client_wallet - 1000} back to your BN Wallet. Your current wallet balance now is Rs.${details[0].client_wallet}</p> <p>Use the wallet money to purchase your next program on the in-app double discount offer & get a complimentary BN Snack Hamper with your next purchase.</p> <p>Write back to me to know more or schedule a call with me: <a href=https://www.balancenutrition.in/app_link/screen_id=294/redirect_id=45 >Click here</a></p>`;

    //       }
    //       offer_text +=`<p>P.S. With your old wallet balance credited back, your new balance is Rs.${details[0].client_wallet}. <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id||134} >Click here</a> to check the new final rates on the ${details[0]?.suggested_program_name?"90":"60"}-day ${details[0]?.suggested_program_name||"Slim Possible"} program.</p>`;
    //     }

    offer_text += `<br/>
    <p><b>Cookies</b></p>
    <p>For your cravings, I have a good option from the <a href=\"https://balancenutrition.in/shop/dessert-cookies-chocolate\" rel=\"noopener noreferrer\" target=\"_blank\">BN-Dessert Range</a> :)</p><p>These cookies are the perfect dessert fix for you, with 7g of protein per serving &amp; 0 added sugar. Vegan and gluten-free, they melt in the mouth.</p><p>You will get a packet of 200g with mini packs of 3, which sets you up for the month. 1 mini packet contains 3 cookies - try to limit yourself to having 1 cookie after meals. Easy to carry too :)</p><p><br></p><p>Order Here: <a href=\"https://balancenutrition.in/shop/dessert-cookies-chocolate\" rel=\"noopener noreferrer\" target=\"_blank\">https://balancenutrition.in/shop/dessert-cookies-chocolate</a></p>
    <br/>
    <p><b>Nippat</b></p>
    <p>In your evening snack, you can also try the <a href=\"https://www.balancenutrition.in/shop/baked-nippat\" rel=\"noopener noreferrer\" target=\"_blank\"><strong>Nippat</strong></a> from the BN Healthy Snack range. </p><p>1 serving is only 157 calories, low GI and slow-digesting, made without refined carbs or sugar.</p><p>They help maintain steady energy, keep sugar levels balanced &amp; keep you full. Safe for diabetics &amp; also children :)</p><p>1 packet is 2 servings, so you can order a pack of 3 &amp; have it on alternate evenings. </p><p>OR</p><p>1 packet is 2 servings, so you can order a pack of 5 &amp; have it in your evening snack. </p><p><br></p><p>It comes in an easy-to-carry pack too :)</p><p><br></p><p>Order Here: <a href=\"https://www.balancenutrition.in/shop/baked-nippat\" rel=\"noopener noreferrer\" target=\"_blank\">https://www.balancenutrition.in/shop/baked-nippat</a></p>
<br/>
<p><b>Chips</b></p>
<p>In your evening snack, you can also try the <a href=\"https://balancenutrition.in/shop/makhana-chips\" rel=\"noopener noreferrer\" target=\"_blank\"><strong>Makhana Chips</strong></a> from the BN Healthy Snack range. </p><p>1 serving is only 57 calories, low GI and slow-digesting, made without refined carbs or sugar.</p><p>They help maintain steady energy, keep sugar levels balanced &amp; keep you full.</p><p>1 packet is 2 servings, so you can order a pack of 3 &amp; have it on alternate evenings. </p><p>OR</p><p>1 packet is 2 servings, so you can order a pack of 5 &amp; have it in your evening snack. </p><p><br></p><p>It comes in an easy-to-carry pack too :)</p><p><br></p><p>Order Here: <a href=\"https://balancenutrition.in/shop/makhana-chips\" rel=\"noopener noreferrer\" target=\"_blank\">https://balancenutrition.in/shop/makhana-chips</a></p>
<br/>
<p><b>I am having sweet cravings after meals. What options do we have?</b></p>
<p>If you check the BN Quick filler guide in your App, you will see that there are multiple options under desserts &amp; dry fruits that you can choose from.&nbsp;</p><p>Alternatively, from the <a href="https://balancenutrition.in/shop" rel="noopener noreferrer" target="_blank"><strong>BN Healthy Dessert</strong></a> range, you can choose the <a href="https://balancenutrition.in/shop/dessert-cookies-chocolate" rel="noopener noreferrer" target="_blank">Chocolate Cookie</a>. It has 7g of protein per serving &amp; 0 added sugar. Vegan and gluten-free, they melt in the mouth.</p><p>You will get a packet of 200g with mini packs of 3, which sets you up for the month. 1 mini packet contains 3 cookies - try to limit yourself to having 1 cookie after meals. Easy to carry too :)</p><p><br></p><p><strong style="color: rgb(55, 65, 81);">Order Here: </strong><a href="https://balancenutrition.in/shop/dessert-cookies-chocolate" rel="noopener noreferrer" target="_blank" style="color: rgb(10, 10, 10);">https://balancenutrition.in/shop/dessert-cookies-chocolate</a></p>
<br/>
<b><p>Are there any vegan or gluten-free snack options?</p></b>
<p>Yes! You can take a look at the BN Quick Filler guide &amp; put filters of vegan, gluten-free &amp; many other options.&nbsp;</p><p>You can also choose from the BN Healthy snack range &amp; check out the <a href="https://balancenutrition.in/shop/makhana-chips" rel="noopener noreferrer" target="_blank">BN Makhana Chips</a>, <a href="https://balancenutrition.in/shop/baked-nippat" rel="noopener noreferrer" target="_blank">Baked Nippat</a>, or <a href="https://balancenutrition.in/shop/dessert-cookies-chocolate" rel="noopener noreferrer" target="_blank">Dessert Cookies</a>.</p><p><span style="color: inherit;">&nbsp;All are vegan, gluten-free, and made with clean, roasted ingredients.</span></p><p><span style="color: rgb(34, 34, 34);">CHECK THE OPTIONS:&nbsp;</span><a href="https://balancenutrition.in/shop" rel="noopener noreferrer" target="_blank" style="color: rgb(17, 85, 204);">https://balancenutrition.in/shop</a></p>
<br/>
<p><b>Craving something to munch in between meals.</b></p>
<p>If you are craving something to munch in between meals, we have many options under Munches in the Quick Fillers Guide.</p><p><span style="color: inherit;">Go for baked or roasted snacks instead of fried ones.&nbsp;</span></p><p>From the&nbsp;BN Healthy Snack Range, try the&nbsp;<a href="https://balancenutrition.in/shop/baked-nippat" rel="noopener noreferrer" target="_blank" style="color: rgb(55, 65, 81);"><strong><u>BN</u></strong></a><a href="https://balancenutrition.in/shop/baked-nippat" rel="noopener noreferrer" target="_blank"><strong><u>&nbsp;Baked&nbsp;Nippat</u></strong></a>&nbsp;or <a href="https://balancenutrition.in/shop/makhana-chips" rel="noopener noreferrer" target="_blank"><strong><u>BN Makhana Chips</u></strong></a>.&nbsp;Th<span style="color: rgb(67, 67, 67);">ey help maintain steady energy, keep sugar levels balanced &amp; keep you full.&nbsp;</span></p><p><span style="color: rgb(67, 67, 67);">1 packet is 2 servings, so you can order a pack of 3 &amp; have it on alternate evenings.&nbsp;</span></p><p><span style="color: rgb(67, 67, 67);">OR</span></p><p><span style="color: rgb(67, 67, 67);">1 packet is 2 servings, so you can order a pack of 5 &amp; have it in your evening snack.&nbsp;</span></p><p>MAKHANA CHIPS:&nbsp;<a href="https://balancenutrition.in/shop/makhana-chips" rel="noopener noreferrer" target="_blank" style="color: rgb(17, 85, 204);">https://balancenutrition.in/shop/makhana-chips</a></p><p>BAKED NIPPAT:&nbsp;<span style="color: rgb(17, 85, 204);">&nbsp;</span><a href="https://balancenutrition.in/shop/baked-nippat" rel="noopener noreferrer" target="_blank" style="color: rgb(17, 85, 204);">https://balancenutrition.in/shop/baked-nippat</a></p>`;

    offer_text = `<p></p>`;

    if (details[0]?.suggested_program_id) {
      if ([132, 134].includes(details[0]?.suggested_program_id)) {
        offer_text += `<p>Hi <strong>${details[0].client_name}</strong>,</p>

<p>
As per your current progress, we still need to lose <strong>${
          details[0]?.goal_weight - details[0]?.client_latest_weight
        } kg</strong>, and we have <strong>${
          details[0]?.current_program_total_sessions -
          details[0]?.current_program_sent_sessions
        } more sessions</strong> pending.
There is a special <strong>60-day program</strong> that is at <strong>30% off</strong> &amp; you also get
<strong>Rs.${
          details[0]?.client_wallet
        }</strong> additional off (wallet credits).
</p>

<p>
I would strongly recommend we add the <strong>SlimPossible 60</strong> program next, which is a combo of
<strong>2 advanced programs</strong> &amp; just what's needed at the moment.
</p>

<p>
<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=132" target="_blank">Click here</a> to see your offer price!
</p>

<p>
<strong>P.S.</strong>
<a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">Click here</a> to book a call with &amp; understand more.
</p>`;
      } else {
        offer_text += `<p>Hi <strong>${details[0]?.client_name}</strong>,</p>

<p><strong>DROP IT BETWEEN QUERY</strong></p>

<p>
Also wanted to update you that <strong>Rs.${details[0]?.client_wallet}</strong> lying in your <strong>BN Wallet</strong> is currently unused.
</p>

<p>
Check the final pricing of the <strong>${details[0].suggested_program_days} <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0].suggested_program_id}"> ${details[0].suggested_program_name}</a></strong> program that I have recommended to you -
<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0].suggested_program_id}" target="_blank">Click here</a>.
</p>

<p>
<a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">Click here</a> to book a call with me, we'll discuss your progress &amp; the next steps to get to your goals.
</p>

<p>
<strong>P.S.</strong> I will be sending you a surprise hamper with our newly launched <strong>BN-Meals</strong>, along with your program purchase.
</p>

<p>
Check the products here (new additions):
<a href="https://www.balancenutrition.in/shop" target="_blank">
https://www.balancenutrition.in/shop
</a>
</p>`;
      }
    } else {
      offer_text += `<p>Hi <strong>${details[0]?.client_name}</strong>,</p>

<p><strong>DROP IT BETWEEN QUERY</strong></p>

<p>
You have <strong>Rs.${details[0]?.client_wallet}</strong> lying unused in your <strong>BN Wallet</strong> &amp; it will expire soon.
</p>

<p>
I also wanted to discuss your progress &amp; the next steps for us that will help us reach your goals.
When can we connect over a call?
Here is a link to schedule a call with me whenever you like:
<a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">link</a>
</p>

<p>
Did you also check <strong>Clara</strong>? She is going to be your mentor after my work hours.
I have myself added answers &amp; trained her, do check her once.
<a href="https://www.balancenutrition.in/app_link/screen_id=401" target="_blank">Click here</a>.
</p>`;
    }

    // if (details[0]?.suggested_program_id) {
    //     offer_text =
    //       offer_text +
    //       `<p><b>Default P.S Line</b></p><p><b>P.S.</b> Rs.${details[0]?.client_wallet} in your BN Wallet will become Rs. 0 in 3 days. Please review the final discount for the 90-day ${details[0]?.suggested_program_name} (<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id}" target="_blank">click here</a>) program that I have recommended for you. </p>`;
    //   } else {
    //     offer_text =
    //       offer_text +
    //       `<p><b>Default P.S Line</b></p><p><b>P.S.</b> Rs.${details[0]?.client_wallet} in your BN Wallet will become Rs. 0 in 3 days. Please review the final discount for the 60-day Slim Possible (<a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=134" target="_blank">click here</a>) program that I have recommended for you. </p>`;
    //   }
    
    offer_text= `
    <p>Auto Draft 1 Edit & Send</p> <p>Hi ${details[0]?.client_name}, </p> <p>This Women’s Day, we’re celebrating YOU 💜</p> <p>For the first time this year, get the 90-Day Intermittent Fasting Program at just <b>₹9,999</b> (regular price ₹27,999). </p> <p>For the first time this year, get the 90-Day Anti-Inflammatory Program at just <b>₹12,999</b> (regular price ₹34,999) & the 180-Day Anti-Inflammatory Program at just <b>₹24,999</b> (regular price ₹64,999.</p> <p>These are available only until March 7th post which the prices will increase to the regular offers. </p> <p>Please reach out to me asap to get your program at these rates before that :)</p> <br/> <p>Auto Draft 2 SP60 Edit & Send</p> <p>Hi ${details[0]?.client_name}, </p> <p>This Women’s Day, we’re celebrating YOU 💜</p> <p>For the first time this year, get the 60-Day <b>Slim Possible</b> Program at just <b>₹7,999</b> upto 70% Off (regular price ₹26,999). </p> <p>These are available only until March 7th post which the prices will increase to the regular offers. </p> <p>Please reach out to me asap to get your program at these rates before that :)</p>
    `; 
    const isIndiaNumber = /^(?:\+)?91/.test(phone || "");
    const isActiveUser = details?.[0]?.client_user_status === 'Active';
    console.log(phone, isIndiaNumber, details?.[0]?.client_user_status, isActiveUser, 'HELLO'); 
    if (isIndiaNumber && isActiveUser) {
    console.log("HELLOOO");
    offer_text += `
     <p>Hi ${details[0]?.client_name}</p> <p>What if I tell you that your weight tracker will get automatically updated? </p> <p>This is what the <b>BN-BodyScan Smart Body Scale</b> will do for you. Not just weight, it will track your body fat%, metabolic age, BMR & 15 other parameters! All these can help us track your overall progress much better. </p> <p>The MRP of this scale is Rs.3999, but you can get it FREE with your next program. It is a double offer for us in a way, you are getting 55% off on the 90-day ${details[0]?.suggested_program_name || "ANTI INFLAMMATORY-PB" } program that I have been recommending to you, now with the scale at no extra price. <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id || "163"}>Click here</a> to check the final offer rates applicable to you.</p> <p>P.S. This offer ends soon, so please get in touch with me ASAP!</p>
      <p>Weighing Scale Draft 1</p>
      <p>Hi ${details[0]?.client_name}</p>
      <p>In our team meeting today, all of us mentors, along with Khyati maam were discussing weighing scales and the common errors we see in them.</p>
      <p>I want to understand what you are currently using.<br>
      Please send me a photo of your weighing scale, and I will decode it for you.</p>
      <br/><br/>
      <p>Weighing Scale Draft 2</p><p>When you're on a program, we shouldn't focus only on weight. Real progress comes from tracking fat loss, muscle levels, metabolic age, and other body readings, because weight alone doesn't tell the full story.</p><p>That’s why we’ve launched the <strong>BN BodyScan Smart Scale</strong>. It’s fully integrated with the BN app &amp; gives us multiple readings, so we can track your session-by-session progress clearly and make better decisions for your results.</p><p>Take a look at it: <a href="https://www.balancenutrition.in/shop/bn-bodyscan-smart-scale">Click here</a></p><p>P.S. It is available in the pre-launch offers &amp; at a very good offer :)</p><p>OR</p><p>You can get this <strong>Smart Scale worth Rs.3999 FREE</strong> with your next program purchase. Ping me to know more.</p>
      <p>Reply to people who sent scale pic Draft</p></br><p>Your Weight Doesn't Tell the Full Story</p>
<p>You could be losing muscle instead of fat. Or retaining water. Or building muscle while burning fat.&nbsp;Here&rsquo;s a simple breakdown:</p>
<p><strong><span style="font-family: arial, sans-serif;">Analogue Scale</span></strong></p>
<ul>
<li>
<p><span style="font-family: arial, sans-serif;">Traditional dial-style scale:&nbsp;</span>basic and affordable,&nbsp;less accurate and harder to read,&nbsp;only shows body weight.</p>
</li>
</ul>
<p><strong><span style="font-family: arial, sans-serif;">Digital Scale</span></strong></p>
<ul>
<li>
<p><span style="font-family: arial, sans-serif;">Displays weight clearly on a screen,&nbsp;</span>more accurate than analogue scales,&nbsp;Easy to use, and widely available. Still&nbsp;only shows body weight. It doesn&rsquo;t&nbsp;track progress over time.&nbsp;</p>
</li>
</ul>
<p><strong><span style="font-family: arial, sans-serif;">Smart Scale&nbsp;</span></strong></p>
<ul>
<li>
<p><span style="font-family: arial, sans-serif;">Measures weight plus body fat, muscle mass, and water levels, s</span>yncs with your phone to track trends over time,&nbsp;helps you see progress even when weight doesn&rsquo;t change,&nbsp;especially useful for fat loss, not just weight loss,&nbsp;keeps you motivated with clear data and long-term insights.</p>
</li>
</ul>
<p><span style="font-family: arial, sans-serif;"><strong>After months of research &amp; finding the best device for our clients, we have finally launched the BN BodyScan Smart Scale, which provides 18+ body measurements and will be essential for tracking our progress.<br /><br />Check it out <a href="https://www.balancenutrition.in/shop/bn-bodyscan-smart-scale">here</a> :)</strong></span></p>
      `;
    } 
    else if (!isIndiaNumber && isActiveUser) {
      console.log("BELLOOO");
      offer_text += `
        <p>Hi ${details[0]?.client_name},</p> <p>You can now get a flat 60% off on all diet programs. This is the lowest ever offer & comes only once every year. </p> <p>Check the final price of the 90-Day ${details[0]?.suggested_program_name || "ANTI INFLAMMATORY-PB" } program: <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0]?.suggested_program_id || "163"}>Click here</a></p> <p>Please write back to me ASAP or book a call with me: <a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45" target="_blank">click here</a></p>  
      `;
    }

    if(userData[0]?.user_status === "Completed"){
      if(details[0]?.old_wallet>7999){
    offer_text=`<p>Hi ${details[0].client_name},</p><p>Sadly, last night your BN wallet balance of Rs.${details[0]?.old_wallet} expired leaving Rs.00 as your current balance ☹️</p>

<p>We had a great chance to save up to Rs.18000 on your next program purchase with discount offers that come rarely. </p>

<p>Let me know if I should talk to the management & see if we can avail this offer until tonight.</p>`;
    }
    }



    offer_text += `<p><b>DRAFT 1 CLARA</b></p> <p>Hi ${details[0]?.client_name},</p> <p>I know there are times when questions come up, and I may not be available right away, but I never want you to feel stuck or waiting for support. </p> <p>That’s why we’ve introduced Clara, a support assistant who’s here to help you in the moment. These are nothing but answers to queries all our clients have asked us in the past 10 years & my replies. We saved those and made them available to you when we are closed. </p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=401 >Mentor Clara</a> can guide you with questions around your plan, meals, food choices, and other day-to-day queries that may come up along the way.</p> <p>And of course, I’m still here for you. I’ll personally continue to connect with you during my working hours and continue to support you throughout your journey.</p> <p>Feel free to explore and reach out whenever you need.</p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=401 >Click here</a> to Open Clara in the App</p> <p><b>DRAFT 2 CLARA</b></p> <p>Hi ${details[0]?.client_name},</p> <p>Sometimes, when I’m away, questions may come up, and I don’t want you to feel stuck or unsure. To support you better, we’ve introduced Clara, who will be there to help you with your queries related to your meals, diet plan, snacks, food choices, and other day-to-day guidance whenever needed.</p> <p>While I’m away, Clara will be available to assist you. Please feel free to reach out anytime.</p> <p>I’ll connect with you during my working hours.</p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=401 >Click here</a> to Open Clara in the App</p>`;

    if (userData[0]?.user_status === "Lead") {
      
      if(details[0]?.my_wallet>2999){
          offer_text=`<p>Hi ${details[0].client_name},</p>
<p>We heard you. After 500+ requests, your expired wallet balance has been restored :)</p>
<p>We've re-credited ₹${details[0]?.my_wallet}  in your wallet again. </p>
<p>This is our Women's Day gift for you.</p>
<p><b>Important: Your wallet balance is valid only till 7th March.</b></p>
          `;
           if(details[0].suggested_program_id){
            offer_text+=`<p>Check the final price of the ${details[0].suggested_program_days || "60 days"} ${details[0].suggested_program_name} Program that I had recommended to you. <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0].suggested_program_id} >Click here</a></p>
<p>Feel free to reach out to me on</p>
<p>WhatsApp: ${details[0]?.official_phone}</p>
<p>Call: ${details[0]?.call_link}</p>`;
           }else{
            offer_text+=`<p>Not sure which program is right for you? Let's get on a quick call, and I'll personally recommend the best one based on your goals. </p>
<p>Please feel free to </p>
<p>WhatsApp me: ${details[0]?.official_phone}</p>
<p>Book a Call: ${details[0]?.call_link}</p>`;
           }

         }else{
          offer_text="";
         }
   
     offer_text+=`<br/><p><b>WHEN LEAD CALL DONE - EDIT AND SEND</b></p> <p>Hi ${details[0].client_name}, </p> <p>It was great connecting with you. </p> <p><b>Give them a summary of what you discussed that needs to be highlighted like hs, health concern in short </b></p> <p>Add or delete these as per the conversation you have had with lead....</p> <p>As recommended, do take a look & use the:</p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=289 >BN Restaurant Guide</a> </p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=400 >BN Quick Filler Guide</a> </p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=290 >BN Alcohol Guide </a></p> <p><a href=https://www.balancenutrition.in/app_link/screen_id=1018 >BN Healthy Recipes</a> </p> <p>These are available to you to browse & use freely to track your meals & snacks. </p> <p>We also have the BN Gut Reset Challenge starting soon. Stay tuned & don't forget to participate.</p> <p>Just so you know, you'll be notified here, so keep checking the app for notifications :)</p>`; 
      offer_text+=`<br/><p><b>TO APP Downloads - No Consultation Call done</b></p> <p>Hi ${details[0]?.client_name},</p> <p>Sr.Counselor here from Balance Nutrition. I have a copy of your Health Score Report. Your Score is ${details[0]?.lead_latest_health_score} & falls in the '${details[0]?.lead_latest_health_category}' Category. </p> <p>I wanted to discuss this with you & also explain the Free tools in the BN App that can help you work on your health. </p> <p>Would 5:30pm IST today work for you?</p>`;
     // offer_text=`<p>Hi ${details[0].client_name},</p> <p>Your BN Wallet balance of Rs.${details[0]?.old_wallet} just expired. You just missed out on a very good offer :( </p> <p>As per your health score, you are ${details[0]?.lead_latest_weight_difference} kg overweight.</p> <p>I can request the management to re credit your money just for today & we can register for the <strong>${details[0].suggested_program_days || "60 Day"} <a href="https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0].suggested_program_id || "132"}"> ${details[0].suggested_program_name || "Slim Possible"}</a></strong> program at very good rates!</p> <p>Just ping me and I'll help you out</p> <p><a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=30" target="_blank">Click here</a> to schedule a call with me</p>`;
//      offer_text=`<p>Hi ${details[0].client_name},</p>

// <p>Good News!</p>

// <p>Since many of you were not able to use the wallet balance, Rs.${details[0]?.client_wallet} is back in your account!</p>

// <p>Use this to get your online diet program at the lowest rates!
// Becomes Rs.0 Tonight</p>

// <p>I also wanted to have a call with you regarding your health score. It is ${details[0]?.lead_latest_health_score}, which means ${details[0]?.lead_latest_health_category}.</p>`;
//       if(details[0].suggested_program_id){
//         offer_text+=`<p><a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${details[0].suggested_program_id} >Click here</a> to check the total discount on the 90-day ${details[0].suggested_program_name} program that I recommended to you :)</p>`;
//       }else{
//         offer_text+=`<p>Ping me asap :)</p>`;
//       }        

    }
    
   
    offer_text = offer_text.replace(/\n/g, "").replace(/\s{2,}/g, " ");

    draftIds.push(2944);

    const { results: psLine } = await readRecord({
      table: `${tables.drafts} d`,
      selectFields: ["*"],
      conditions: [{ field: "d.drafts_id", operator: "IN", value: draftIds }],
      orderBy: ["d.created_at DESC"],
    });

    // pitched 2888 ,not pitched 2890
    const draft = await Promise.all(
      psLine.map(async (item, index) => {
        const extractedVariables = extractVariables(item.description);
        const userData = await fetchUserDetailsDynamic({
          ids: [user_id],
          fields: [...extractedVariables],
        });

        return {
          id: item.drafts_id,
          user_id: user_id,
          draft_text: replacePlaceholders(item.description, userData[0]),
        };
      }),
    );
    const finalDraft = [];
    formattedQueries.map((item, index) => {
      if (index === 0) {
        finalDraft.push(item);
      } else {
        finalDraft[0].draft_text += `<br>${item.draft_text}`;
      }
    });

    if (finalDraft.length === 0) {
      // finalDraft[0].draft_text += ;
      draft.map((item, index) => {
        if (index === 0) {
          finalDraft.push(item);
          finalDraft[0].draft_text =
            `<br><b><p>OFFER DRAFT</p></b><br>${offer_text}` + item.draft_text;
        } else {
          finalDraft[0].draft_text += `<br>${item.draft_text}`;
        }
      });

      const { status: pageVisitDraftStatus, message: pageVisitDraftMessage } =
        await pageVisitDraft({ user_id });
      if (pageVisitDraftStatus) {
        finalDraft[0].draft_text += `<br>${pageVisitDraftMessage}`;
      }
      const {
        status: checkoutVisitDraftStatus,
        message: checkoutVisitDraftMessage,
      } = await checkoutVisitDraft({ user_id });
      if (checkoutVisitDraftStatus) {
        finalDraft[0].draft_text += `<br>${checkoutVisitDraftMessage}`;
      }

      const {
        status: welcomeCallNotDoneDraftStatus,
        message: welcomeCallNotDoneDraftMessage,
      } = await welcomeCallDraft({ user_id });
      if (welcomeCallNotDoneDraftStatus) {
        finalDraft[0].draft_text += `<br>${welcomeCallNotDoneDraftMessage}`;
      }

      const {
        status: welcomeCallDoneDraftStatus,
        message: welcomeCallDoneDraftMessage,
      } = await welcomeCallDoneDraft({ user_id });
      if (welcomeCallDoneDraftStatus) {
        finalDraft[0].draft_text += `<br>${welcomeCallDoneDraftMessage}`;
      }
      const {
        status: validityAwarenessBufferedDraftStatus,
        message: validityAwarenessBufferedDraftMessage,
      } = await validityAwarenessBufferedDraft({ user_id });
      if (validityAwarenessBufferedDraftStatus) {
        finalDraft[0].draft_text += `<br>${validityAwarenessBufferedDraftMessage}`;
      }

      const {
        status: fifthDayRecievedDraftStatus,
        message: fifthDayRecievedDraftMessage,
      } = await fifthDayRecievedDraft({ user_id });
      if (fifthDayRecievedDraftStatus) {
        finalDraft[0].draft_text += `<br>${fifthDayRecievedDraftMessage}`;
      }

      const {
        status: startDayRecievedDraftStatus,
        message: startDayRecievedDraftMessage,
      } = await startDayRecievedDraft({ user_id });
      if (startDayRecievedDraftStatus) {
        finalDraft[0].draft_text += `<br>${startDayRecievedDraftMessage}`;
      }

      const {
        status: tenthDayRecievedDraftStatus,
        message: tenthDayRecievedDraftMessage,
      } = await tenthDayRecievedDraft({ user_id });
      if (tenthDayRecievedDraftStatus) {
        finalDraft[0].draft_text += `<br>${tenthDayRecievedDraftMessage}`;
      }
      // return;
      const { status: tenDayOdStatus, message: tenDayOdMessage } =
        await tenDayOd({ user_id });
      if (tenDayOdStatus) {
        finalDraft[0].draft_text += `<br>${tenDayOdMessage}`;
      }

      const { status: fifthDayOdStatus, message: fifthDayOdMessage } =
        await fifthDayOd({ user_id });
      if (fifthDayOdStatus) {
        finalDraft[0].draft_text += `<br>${fifthDayOdMessage}`;
      }
      const { status: tenDayTodayStatus, message: tenDayTodayMessage } =
        await tenDayToday({ user_id });
      if (tenDayTodayStatus) {
        finalDraft[0].draft_text += `<br>${tenDayTodayMessage}`;
      }
      const { status: fifthDayTodayStatus, message: fifthDayTodayMessage } =
        await fifthDayToday({ user_id });
      if (fifthDayTodayStatus) {
        finalDraft[0].draft_text += `<br>${fifthDayTodayMessage}`;
      }
      const { status: tenDayTomorrowStatus, message: tenDayTomorrowMessage } =
        await tenDayTomorrow({ user_id });
      if (tenDayTomorrowStatus) {
        finalDraft[0].draft_text += `<br>${tenDayTomorrowMessage}`;
      }
      const {
        status: fifthDayTomorrowStatus,
        message: fifthDayTomorrowMessage,
      } = await fifthDayTomorrow({ user_id });
      if (fifthDayTomorrowStatus) {
        finalDraft[0].draft_text += `<br>${fifthDayTomorrowMessage}`;
      }
      const { status: alcoholGuideStatus, message: alcoholGuideMessage } =
        await alcoholGuideAutoDraft({ user_id });
      if (alcoholGuideStatus) {
        finalDraft[0].draft_text += `<br>${alcoholGuideMessage}`;
      }

      const { status: abandonedCartStatus, draftMessage } =
        await generateAbandonedCartAutoDraft(user_id);

      if (abandonedCartStatus) {
        finalDraft[0].draft_text += `<br>${draftMessage}`;
      }

      const {
        status: shareCartLinkStatus,
        draftMessage: shareCartLinkMessage,
      } = await generateShareCartLinkAutoDraft(user_id);

      if (shareCartLinkStatus) {
        finalDraft[0].draft_text += `<br>${shareCartLinkMessage}`;
      }

      // const { status: spinToWinStatus, message: spinToWinMessage } =
      //   await spinToWinAutoDraft({ user_id });
      // if (spinToWinStatus) {
      //   finalDraft[0].draft_text += `<br>${spinToWinMessage}`;
      // }
      // const {
      //   status: halfTimeFeedbackCallStatus,
      //   message: halfTimeFeedbackCallMessage,
      // } = await halfTimeCallDraft({ user_id });
      // if (halfTimeFeedbackCallStatus) {
      //   finalDraft[0].draft_text += `<br>${halfTimeFeedbackCallMessage}`;
      // }
      // const {
      //   status: tailendFeedbackCallStatus,
      //   message: tailendFeedbackCallMessage,
      // } = await tailendCallDraft({ user_id });
      // if (tailendFeedbackCallStatus) {
      //   finalDraft[0].draft_text += `<br>${tailendFeedbackCallMessage}`;
      // }
      // const {
      //   status: halfTimeFeedbackStatus,
      //   message: halfTimeFeedbackMessage,
      // } = await halfTimeFeedbackDraft({ user_id });
      // if (halfTimeFeedbackStatus) {
      //   finalDraft[0].draft_text += `<br>${halfTimeFeedbackMessage}`;
      // }
      // const {
      //   status: programFeedbackStatus,
      //   message: programFeedbackMessage,
      // } = await programFeedbackDraft({ user_id });
      // if (programFeedbackStatus) {
      //   finalDraft[0].draft_text += `<br>${programFeedbackMessage}`;
      // }
      // const { status: halfTimeHsStatus, message: halfTimeHsMessage } =
      //   await halfTimeHsDraft({ user_id });
      // if (halfTimeHsStatus) {
      //   finalDraft[0].draft_text += `<br>${halfTimeHsMessage}`;
      // }
      // const { status: programHsStatus, message: programHsMessage } =
      //   await programHsDraft({ user_id });
      // if (programHsStatus) {
      //   finalDraft[0].draft_text += `<br>${programHsMessage}`;
      // }
    }
    if (finalDraft[0].draft_text) {
      finalDraft[0].draft_text = finalDraft[0].draft_text
        .replace(/\n/g, "")
        .replace(/\s{2,}/g, " ");
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Drafted Query fetched successfully",
      data: finalDraft,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllChats = async (req, res, next) => {
  try {
    const {
      admin_id,
      search,
      user_status,
      filters,
      page = 1,
      limit = 10,
    } = req.body;
    const parsedUserStatus = String(user_status).toLowerCase();
    const parsedFilters = String(filters).toLowerCase();
    const parsedAdminId = parseInt(admin_id);
    const conditions = [];
    const joins = [];

    if (parsedUserStatus === "active") {
      const { conditions: activeConditions, joins: activeJoins } =
        ActiveUserChatConditions({ filters: parsedFilters, parsedAdminId });
      conditions.push(...activeConditions);
      joins.push(...activeJoins);
    }
    if (parsedUserStatus === "oc") {
      const { conditions: ocConditions, joins: ocJoins } = OcUserChatConditions(
        { filters: parsedFilters, parsedAdminId },
      );
      conditions.push(...ocConditions);
      joins.push(...ocJoins);
    }
    if (parsedUserStatus === "lead") {
      const { conditions: leadConditions, joins: leadJoins } =
        LeadChatConditions({ filters: parsedFilters, parsedAdminId });
      conditions.push(...leadConditions);
      joins.push(...leadJoins);
    }

    let { results: allUsers } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.phone",
      ],
      conditions: search
        ? [
            {
              field:
                parsedUserStatus === "lead"
                  ? "ud.counsellor_assigned"
                  : "ud.mentor_assigned",
              operator: "=",
              value: parsedAdminId,
            },
          ]
        : conditions,
      joins,
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "ud.user_id",
            "CONCAT(ud.first_name,' ', ud.last_name)",
            "ud.email_id",
            "ud.phone",
          ],
        },
      }),
    });

    if (!allUsers.length) {
      return res
        .status(200)
        .json(new ApiResponse({ statusCode: 200, message: "No Chat Found" }));
    }

    const userIds = allUsers.map((u) => u.user_id);

    const Chats = await clientEnquiry.aggregate([
      {
        $match: {
          user_id: { $in: userIds },
          type: "query",
          ...(parsedFilters === "unread" && {
            is_acknowledged: false,
            sender: "client",
          }),
        },
      },
      {
        $sort: {
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: "$user_id",
          latestMessage: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$latestMessage" },
      },
    ]);
    if (parsedFilters === "unread") {
      const unreadUserIds = new Set(Chats.map((c) => c.user_id));
      allUsers = allUsers.filter((u) => unreadUserIds.has(u.user_id));
    }
    const mergedList = allUsers.map((user) => {
      const chat = Chats.find((c) => c.user_id === user.user_id);
      return {
        user_id: user.user_id,
        user_name: `${user.first_name} ${user.last_name}`,
        email_id: user.email_id,
        phone: user.phone,
        query: chat?.query || "N/A",
        createdAt: chat?.createdAt
          ? `${moment(chat.createdAt).format("DD-MM-YY HH:mm")}`
          : "N/A",
        is_read: chat?.is_acknowledged ?? true,
        sender: chat?.sender,
      };
    });

    mergedList.sort((a, b) => {
      const aIsClient = a.sender === "client" ? 0 : 1;
      const bIsClient = b.sender === "client" ? 0 : 1;
      if (aIsClient !== bIsClient) {
        return aIsClient - bIsClient;
      }
      const aDate =
        a.createdAt === "N/A"
          ? new Date(0)
          : moment(a.createdAt, "DD-MM-YY HH:mm").toDate();
      const bDate =
        b.createdAt === "N/A"
          ? new Date(0)
          : moment(b.createdAt, "DD-MM-YY HH:mm").toDate();
      return aDate - bDate;
    });

    const start = (page - 1) * limit;
    const paginatedList = mergedList.slice(start, start + limit);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Chats fetched successfully",
      data: paginatedList,
      totalCount: Math.ceil(mergedList.length / limit),
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getChatCounts = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    if (!admin_id) {
      return next(new ErrorHandler("Admin Id is required", 400));
    }
    const parsedAdminId = parseInt(admin_id);

    const chatCountsResult = await clientEnquiry.aggregate([
      {
        $match: {
          is_acknowledged: false,
          ...(parsedAdminId && { mentor_id: parsedAdminId }),
        },
      },
      {
        $group: {
          _id: "$user_id",
          latestMessage: { $max: "$createdAt" },
          latestDoc: { $last: "$$ROOT" },
        },
      },
      {
        $match: {
          "latestDoc.type": "query",
        },
      },
      {
        $count: "chatCounts",
      },
    ]);

    const chatCounts =
      chatCountsResult.length > 0 ? chatCountsResult[0].chatCounts : 0;

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Chat Counts fetched successfully",
      data: { chatCounts },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const acknowledgeMessage = async (req, res, next) => {
  try {
    const { message_ids = [] } = req.body;

    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return next(new ErrorHandler("Invalid message_ids provided", 400));
    }

    const acknowledgedQueries = await clientEnquiry.updateMany(
      { _id: { $in: message_ids } },
      { $set: { is_acknowledged: true } },
    );

    if (acknowledgedQueries.matchedCount === 0) {
      return next(new ErrorHandler("No messages found to acknowledge", 404));
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Messages acknowledged successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in acknowledgeMessage:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getUnreadChatCountByStatus = async (req, res, next) => {
  try {
    const { admin_id } = req.query;
    const parsedAdminId = parseInt(admin_id, 10);

    const [
      { results: activeClients },
      { results: ocClients },
      { results: leadClients },
    ] = await Promise.all([
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["ud.user_id"],
        conditions: [
          { field: "ud.mentor_assigned", operator: "=", value: parsedAdminId },
          { field: "ud.user_status", operator: "=", value: "Active" },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["ud.user_id"],
        conditions: [
          { field: "ud.mentor_assigned", operator: "=", value: parsedAdminId },
          { field: "ud.user_status", operator: "=", value: "Completed" },
        ],
      }),
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["ud.user_id"],
        conditions: [
          {
            field: "ud.counsellor_assigned",
            operator: "=",
            value: parsedAdminId,
          },
          { field: "ud.user_status", operator: "=", value: "Lead" },
        ],
      }),
    ]);

    const activeUserIds = activeClients.map((client) => client.user_id);
    const ocUserIds = ocClients.map((client) => client.user_id);
    const leadUserIds = leadClients.map((client) => client.user_id);

    const getUnreadCount = async (userIds) => {
      if (!userIds.length) return 0;

      const result = await clientEnquiry.aggregate([
        {
          $match: {
            user_id: { $in: userIds },
            type: "query",
            is_acknowledged: false,
          },
        },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$user_id", latestMessage: { $first: "$$ROOT" } } },
      ]);

      return result.length;
    };

    const [activeUnreadCount, ocUnreadCount, leadUnreadCount] =
      await Promise.all([
        getUnreadCount(activeUserIds),
        getUnreadCount(ocUserIds),
        getUnreadCount(leadUserIds),
      ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Unread chat counts fetched successfully",
      data: {
        activeUnreadCount,
        ocUnreadCount,
        leadUnreadCount,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const broadcastMessage = async (req, res, next) => {
  try {
    const { mentor_id, user_filter, message, name } = req.body;

    if (!mentor_id || !message) {
      return next(new ErrorHandler("mentor_id and message are required", 400));
    }

    if (
      ![
        "all",
        "active",
        "ocr",
        "dormant",
        "not_started",
        "daily_fu",
        "lead_with_app",
        "oc_with_app",
      ].includes(user_filter)
    ) {
      return next(new ErrorHandler("Invalid user_filter provided", 400));
    }

    const conditions = [
      { field: "ud.mentor_assigned", operator: "=", value: mentor_id },
    ];
    const joins = [];

    if (user_filter === "active") {
      conditions.push({
        field: "ud.sub_user_status",
        operator: "=",
        value: "Active",
      });
    } else if (user_filter === "ocr") {
      joins.push({
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.sub_order_id = ud.active_order_id",
      });
      conditions.push({ field: "sop.order_type", operator: "=", value: "OCR" });
    } else if (user_filter === "dormant") {
      joins.push({
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.sub_order_id = ud.active_order_id",
      });
      conditions.push({
        field: "ud.sub_user_status",
        operator: "=",
        value: "Dormant",
      });
    } else if (user_filter === "not_started") {
      joins.push({
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "sop.sub_order_id = ud.active_order_id",
      });
      conditions.push({
        field: "ud.sub_user_status",
        operator: "=",
        value: "notstarted",
      });
    } else if (user_filter === "daily_fu") {
      conditions.push({ field: "ud.daily_fu", operator: "=", value: 1 });
    } else if (user_filter === "oc_with_app") {
      conditions.push(
        { field: "ud.user_status", operator: "=", value: "Completed" },
        { field: "ud.app_version", operator: "!=", value: "" },
        {
          field: "ud.app_version",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
      );
    } else if (user_filter === "lead_with_app") {
      conditions.pop();
      conditions.push(
        { field: "ud.user_type", operator: "=", value: "0" },
        { field: "ud.app_version", operator: "!=", value: "" },
        {
          field: "ud.app_version",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        {
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        },
      );
    }

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      joins,
      conditions,
    });

    const userIds = results.map((user) => user.user_id);

    let urls = [];
    if (req?.files?.length > 0) {
      const folder = cloudinaryFolders.queryAttachments;
      urls = await uploadArrayOfFilesToCloudinary(req.files, folder);
    }

    await Promise.all(
      userIds.map((user_id) =>
        clientEnquiry.create({
          user_id,
          name,
          mentor_id,
          query: message,
          sender: "mentor",
          ...(urls.length && {
            attachment: urls.map((item) => item.file.path),
          }),
          type: "broadcast",
        }),
      ),
    );

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Broadcast sent successfully",
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteLastMessage = async (req, res, next) => {
  try {
    const { user_id, sender } = req.query;

    const lastMessage = await clientEnquiry
      .findOne({ user_id, sender })
      .sort({ createdAt: -1 });

    if (!lastMessage) {
      return res
        .status(404)
        .json({ success: false, message: "No message found" });
    }

    await clientEnquiry.findByIdAndDelete(lastMessage._id);

    return res
      .status(200)
      .json({ success: true, message: "Last message deleted successfully" });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const deleteMessageByIds = async (req, res, next) => {
  try {
    let { msgIds, chatType } = req.body;

    if (!msgIds) {
      return next(new ErrorHandler("msgIds is required", 400));
    }
    
    if (!Array.isArray(msgIds)) msgIds = [msgIds];

    const invalidIds = [];
    const validMsgIds = msgIds
      .map(id => String(id).trim())
      .filter(id => {
        const ok = mongoose.Types.ObjectId.isValid(id);
        if (!ok) invalidIds.push(id);
        return ok;
      });

    if (!validMsgIds.length) {
      return next(new ErrorHandler("No valid Ids provided", 400));
    }

    console.log(validMsgIds, 'validMsgids'); 
    const validMessageQuery =  {
      _id: { $in: validMsgIds },
    }; 

    if (String(chatType).toLocaleLowerCase()!=='broadcast') {
      validMessageQuery.is_acknowledged = false;
    }

    const messagesToBeDeleted = await clientEnquiry
      .find(validMessageQuery);

    console.log(messagesToBeDeleted,'messagesToBeDeleted');

    if (!messagesToBeDeleted.length) {
      return next(new ErrorHandler("No messages eligible for deletion", 400));
    }

    const deletableIds = messagesToBeDeleted.map(m => m._id.toString());
    const notDeletedIds = validMsgIds.filter(
      id => !deletableIds.includes(id)
    );

    await clientEnquiry.deleteMany({
      _id: { $in: deletableIds },
    });

    await deletedClientEnquiry.insertMany(messagesToBeDeleted);
    return res.status(200).json(
      new ApiResponse({
        success: true,
        message: "Messages deleted successfully",
        deleted_ids: deletableIds,
        not_deleted_ids: notDeletedIds,
        invalid_ids: invalidIds,
      })
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const editMessageByIds = async (req, res, next) => {
  try {
    let { msgId, updatedContent } = req.body;

    console.log(msgId, updatedContent, 'req.body'); 

    const isValid = mongoose.Types.ObjectId.isValid(msgId);
    if (!isValid) return next(new ErrorHandler("Invalid Id", 400));

    const lastMessage = await clientEnquiry.findOne({ _id: msgId });

    if (!lastMessage) {
      return next(new ErrorHandler("Invalid Id", 400));
    }

    await clientEnquiry.updateOne({ _id: msgId }, { $set: { query: updatedContent } });

    return res
      .status(200)
      .json(new ApiResponse({ success: true, message: "Message updated successfully" }));

  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const markLastMessageAsUnread = async (req, res, next) => {
  try {
    const { user_id, sender } = req.body;

    const lastMessage = await clientEnquiry
      .findOne({ user_id, sender })
      .sort({ createdAt: -1 });

    if (!lastMessage) {
      return res
        .status(404)
        .json({ success: false, message: "No message found" });
    }

    // Update the message's read status to unread
    lastMessage.is_acknowledged = false;
    await lastMessage.save();

    return res.status(200).json({
      success: true,
      message: "Last message marked as unread successfully",
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  sendchatMessage,
  deleteDraftQuery,
  markLastMessageAsUnread,
  getChatById,
  addDraftedQuery,
  getDraftedQuery,
  getAllChats,
  getChatCounts,
  acknowledgeMessage,
  getUnreadChatCountByStatus,
  broadcastMessage,
  deleteLastMessage,
  deleteMessageByIds,
  editMessageByIds
};
