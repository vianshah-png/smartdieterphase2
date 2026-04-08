import cron, { schedule } from "node-cron";
import moment from "moment";
import { fetchScheduledNotifications } from "../controllers/contentDashboardControllers/notificationController.js";
import {
  fetchCalls,
  fetchConsultationCalls,
  fetchFollowUpReminders,
} from "../controllers/contentDashboardControllers/userController.js";
import {
  dietSentNotification,
  assessmentNotFilledNotification,
  setSessionStartDateNotification,
  updateStatusToDormant,
  updateStatusToMaintenance,
  updateStatusToNotStarted,
  welcomeCallNotBookedNotification,
  welcomeCallReminderNotifications,
  calorieCountedNotification,
  sessionBasedNotifications,
  sundayNotification,
  balanceDueNotifications,
  birthDayNotifications,
  sendHalfTimeFeedbackNotification,
  sendHealthScoreNotification,
  sendHTCallReminderNotification,
  sendTailendHealthScoreNotification,
  sendTailendFeedbackNotification,
  sendTailendFeedbackCallReminderNotification,
  sendPageVisitMails,
  sendPageVisit,
  yesterdayDroppedOutClients,
  onholdClientsExpiry,
  callsBookedMails,
  callsDoneMails,
  callsPendingMails,
  callsUnansweredMails,
  iclPopUp,
  nafPopUp,
  paymentLinkExpiring,
  weightUpdateNotification,
  sendAtRiskCron,
  updateClientStatusToOnHold,
  sendAdvanceProgramStartDateChats,
  dietAsk,
  dailyFuCheck,
  sendTailendNoAdvacnePurchaseUserReport,
  sendWelcomeCallWati,
  sendGoalWati,
  sendTECallReminderWati,
  sendHTCallReminderWati,
  sendHalfTimeHealthScoreWati,
  sendFinalHealthScoreWati,
  sendFinalFeedbackWati,
  sendHalfTimeFeedbackWati,
  sendStartWeightReminderWati,
  sendMidWeightReminderWati,
  sendEndWeightReminderWati,
  sendStartDateReminderWati,
  sendDormantClientReminderWati,
  weightUpdateDormantNotification,
  sendHSWatiNotification,
  sendLeadMultipleCheckoutWatiNotification,
  sendAlcoholFeedbackReminder,
  sendRestaurantFeedbackReminder,
  sendAlcoholGuideNotification,
  sendRestaurantGuideNotification,
  sendPerformanceSummary,
  sendDietPdfNotification,
  checkValidityAwarenessForMentors,
  validityAwarenessBufferedMail,
  checkPendingDietsForMentors,
  checkDietOverdueForAllMentors,
  sendDietPdfInChat,
  dailyClientFuCheck,
  dailyLeadFuCheck,
  dailyFirstPitch48HrCheck,
  dailyPitched48HrNoActivityCheck,
  checkMissedCallsForMentors,
  notifyEndingTravelOnholdBreaks,
  notifyOnholdResumesToday,
  notifyOnholdOverdue,
  moveOnholdToDormant,
  sendOnholdOverdueMail,
  activateTravelGuidesForRecentOnholdClients,
  notifyEndingWeddingsOnholdBreaks,
  notifyEndingHealthIssuesOnholdBreaks,
  notifyOnholdOverdueWeddings,
  notifyOnholdOverdueHealthIssues,
  activateWeddingGuidesForRecentOnholdClients,
  activateAirportGuidesForRecentOnholdClients,
  sendWeddingsOnholdBreakScheduledNotifications,
  sendMedicalIssuesOnholdBreakScheduledNotifications,
  checkProductPayment,
  cartAddedNotification,
  cartPaymentReminder,
  sendWeeklyWedFriReferNotifications,
  cartPaymentReminder72Hour,
  cartPaymentReminder24Hour,
  cartPaymentReminder4Hour,
  cartPaymentReminder30Min,
  cartAddedNotPaidMails,
  sendPregnancyOnHoldPaymentReminder,
  shareCartLinkReminder24Hours,
  shareCartLinkReminder48Hours,
  hamperDeliveredMails,
  notifyPregnancyTrimesterTips,
  notifyEndingPregnancyDueDate,
  notifyPregnancyPostDueDate,
  notifyPregnancyOverdueEndDate,
  sendPostpartumRestartAssessmentReminder,
  sendBNSnackNotificationNewJoinees,
  dietShoppingListNotification1hr,
  dietShoppingList45MinStartDate,
  getTodaysPendingFollowCountReminder,
  cronInductionCallReminders,
} from "../crons/cronFunctions.js";
import {
  fetchAdvanceUsersForReminders,
  sendAdvanceReminders,
} from "../controllers/common.js";
import { updateProductDeliveryStatus } from "../controllers/productDashboardController/productDashboardController.js";
import { updateDrStoreOrderStatus } from "../services/drStoreIntegration.js";
import {
  birthdayHamperNotification,
  postDeliveryGeneralHamperNotification,
  productWiseHamperNotification,
  sendBirthDayHamperAddressNotification,
  sendClaraActivityPopUp,
  sendEmergencyOnholdODNotification,
  sendEmergencyOnholdReminderNotification,
  sendEmergencyOnholdWeeklyNotification,
  sendGeneralHamperNotification,
  sendMilestoneDataFormNotification,
  sendPostBirthDayHamperNotificationFirst,
  sendPostBirthDayHamperNotificationFourth,
  sendPostBirthDayHamperNotificationSeventh,
  updateAccountsDbReport,
} from "../crons/cronFunction2.js";
import { sendPerformanceRoiReportMail } from "../services/performanceRoiReportService.js";

// console.log(moment().week(), 113);
async function runCron() {
  
  cron.schedule("15 9 * * *", async () => {
    try {
      await sendPerformanceRoiReportMail({
        date: moment().subtract(1, "day").format("YYYY-MM-DD"),
      });
    } catch (error) {
      console.error("Error in 9:15 AM Performance ROI report cron:", error);
    }
  });

  cron.schedule("0 0 * * *", async () => {
    // will run every day at midnight 12 AM
    await updateAccountsDbReport(moment().format("YYYY-MM-DD"));
  });
  cron.schedule("*/5 * * * *", async () => {
    await checkProductPayment();
  });

  // cron.schedule("*/1 * * * *", async () => {
  //   await notifyEndingPregnancyDueDate();
  // });

  cron.schedule("*/10 * * * *", async () => {
    try {
      await cartPaymentReminder();
    } catch (error) {
      console.error("Error in cart payment reminder cron:", error);
    }
  });

  cron.schedule("0 12 * * *", async () => {
    try {
      await shareCartLinkReminder24Hours();
      await shareCartLinkReminder48Hours();
    } catch (error) {
      console.error("Error in share cart link reminder cron:", error);
    }
  });

  cron.schedule("0 11 * * *", async () => {
    try {
      await sendPregnancyOnHoldPaymentReminder();
      await notifyPregnancyOverdueEndDate();
    } catch (error) {
      console.error("Pregnancy Reminder Error cron:", error);
    }
  });

  cron.schedule("0 13 * * *", async () => {
    try {
      await notifyEndingPregnancyDueDate();
      await notifyPregnancyPostDueDate();
    } catch (error) {
      console.error("Error: Pregnancy Cron", error);
    }
  });

  cron.schedule("0 15 * * *", async () => {
    try {
      await notifyPregnancyTrimesterTips();
    } catch (error) {
      console.error("Pregnancy Trimester Tips Cron", error);
    }
  });

  cron.schedule("0 10 * * *", async () => {
    try {
      await sendPostpartumRestartAssessmentReminder();
    } catch (error) {
      console.error("Error: Pregnancy Asessment Form Reminder Cron", error);
    }
  });

  cron.schedule("5 10 * * *", async () => {
    // will run every day at 10:05 AM
    await sendClaraActivityPopUp();
  });

  cron.schedule("*/30 * * * *", async () => {
    try {
      console.log("⏳ Running 30-min cart reminder cron...");
      await cartPaymentReminder30Min();
      console.log("✅ 30-min cart reminder processed.");
    } catch (error) {
      console.error("❌ Error in 30-min cart reminder:", error);
    }
  });

  cron.schedule("0 */4 * * *", async () => {
    try {
      console.log("⏳ Running 4-hour cart reminder cron...");
      await cartPaymentReminder4Hour();
      console.log("✅ 4-hour cart reminder processed.");
    } catch (error) {
      console.error("❌ Error in 4-hour cart reminder:", error);
    }
  });

  cron.schedule("0 */1 * * *", async () => {
    try {
      console.log("⏳ Running 1-hour diet cart reminder cron...");
      await dietShoppingListNotification1hr();
      console.log("✅ 1-hour diet cart reminder processed.");
    } catch (error) {
      console.error("❌ Error in 1-hour diet cart reminder:", error);
    }
  });

  cron.schedule("0 */1 * * *", async () => {
    try {
      await dietShoppingList45MinStartDate();
      console.log("✅ 45 min diet cart reminder processed.");
    } catch (error) {
      console.error("❌ Error in 45 min diet cart reminder:", error);
    }
  });

  cron.schedule("30 11 * * *", async () => {
    try {
      console.log("⏳ Running 24-hour cart reminder cron...");
      await cartPaymentReminder24Hour();
      console.log("✅ 24-hour cart reminder processed.");
    } catch (error) {
      console.error("❌ Error in 24-hour cart reminder:", error);
    }
  });

  cron.schedule("0 11 */3 * *", async () => {
    try {
      console.log("⏳ Running 72-hour cart reminder cron...");
      await cartPaymentReminder72Hour();
      console.log("✅ 72-hour cart reminder processed.");
    } catch (error) {
      console.error("❌ Error in 72-hour cart reminder:", error);
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    // Remove the extra space
    console.log("Running notification Cron Job every 15 minutes");
    try {
      fetchScheduledNotifications();
      fetchConsultationCalls();
      fetchCalls();
      fetchFollowUpReminders();
      sendPageVisit({ status: "Active", page_type: 1 });
      sendPageVisit({ status: "Active", page_type: 2 });
      sendPageVisit({ status: "OCR", page_type: 1 });
      sendPageVisit({ status: "OCR", page_type: 2 });
      // welcomeCallReminderNotifications()
      // calorieCountedNotification();
      // assessmentNotFilledNotification({
      //   window: [360, 375],
      //   period: "MINUTE",
      //   notification_id: 3,
      // });
    } catch (error) {
      console.log("Error in notification cron job:", error); // More specific error message
    }
  });

  cron.schedule("0 * * * *", async () => {
    await sendHSWatiNotification();
  });

  cron.schedule("0 18 * * *", async () => {
    await sendLeadMultipleCheckoutWatiNotification();
  });

  cron.schedule("*/30 * * * *", async () => {
    await sendDietPdfInChat();
  });

  cron.schedule("*/2 * * * *", async () => {
    // Remove the extra space
    console.log("Running notification Cron Job every 2 minutes");
    try {
      sendPageVisit({ status: "Active", page_type: 2 });
      sendPageVisit({ status: "OCR", page_type: 2 });
      // welcomeCallReminderNotifications()
      // calorieCountedNotification();
      // assessmentNotFilledNotification({
      //   window: [360, 375],
      //   period: "MINUTE",
      //   notification_id: 3,
      // });
    } catch (error) {
      console.log("Error in notification cron job:", error); // More specific error message
    }
  });

  cron.schedule("0 8 * * *", async () => {
    // assessmentNotFilledNotification({
    //   window: [24, 48],
    //   period: "HOUR",
    //   notification_id: 4,
    // });
    // });
  });

  cron.schedule("30 8 * * *", async () => {
    // assessmentNotFilledNotification({
    //   window: [48, 72],
    //   period: "HOUR",
    //   notification_id: 5,
    // });
  });

  cron.schedule("0 9 * * *", async () => {
    callsBookedMails();
    // ! uncomment the below lines to start the cron
    welcomeCallNotBookedNotification({
      window: [24, 48],
      period: "HOUR",
      notification_id: 10,
    });
    welcomeCallNotBookedNotification({
      window: [48, 72],
      period: "HOUR",
      notification_id: 11,
    });
    welcomeCallNotBookedNotification({
      window: [72, 96],
      period: "HOUR",
      notification_id: 12,
    });
    welcomeCallNotBookedNotification({
      window: [96, 120],
      period: "HOUR",
      notification_id: 13,
    });
    birthDayNotifications();
    // birthdayHamperNotification();
  });

  // cron.schedule("15 9 * * *", async () => {
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "7_days_before",
  //     daysBefore: 7,
  //   });
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "6_days_before",
  //     daysBefore: 6,
  //     addressReceived: false,
  //   });
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "5_days_before",
  //     daysBefore: 5,
  //     addressReceived: false,
  //   });
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "4_days_before",
  //     daysBefore: 4,
  //     addressReceived: false,
  //   });
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "3_days_before",
  //     daysBefore: 3,
  //     addressReceived: false,
  //   });
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "2_days_before",
  //     daysBefore: 2,
  //     addressReceived: false,
  //   });
  //   await sendBirthDayHamperAddressNotification({
  //     content_key: "1_day_before",
  //     daysBefore: 1,
  //     addressReceived: false,
  //   });
  // });

  cron.schedule("30 9 * * *", async () => {
    // ! uncomment the below lines to start the cron
    dietSentNotification({ notification_id: 97, auto_chat: true });
    setSessionStartDateNotification({
      window: [1, 2],
      notification_id: 15,
    });
    setSessionStartDateNotification({
      window: [2, 3],
      notification_id: 17,
    });
    yesterdayDroppedOutClients();

    // general hamper notification cron
    await sendGeneralHamperNotification({
      daysAfter: 1,
      content_key: "1_day_after",
      addressReceived: true,
    });
    await sendGeneralHamperNotification({
      daysAfter: 2,
      content_key: "2_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 3,
      content_key: "3_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 4,
      content_key: "4_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 5,
      content_key: "5_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 6,
      content_key: "6_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 7,
      content_key: "7_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 8,
      content_key: "8_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 9,
      content_key: "9_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 10,
      content_key: "10_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 11,
      content_key: "11_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 12,
      content_key: "12_days_after",
      addressReceived: false,
    });
    await sendGeneralHamperNotification({
      daysAfter: 13,
      content_key: "13_days_after",
      addressReceived: false,
    });
  });
  cron.schedule("25 10 * * *", async () => {
    // ! uncomment the below lines to start the cron
    sendHalfTimeFeedbackNotification();
    sendTailendFeedbackNotification();
  });

  cron.schedule("0 23 * * *", async () => {
    clientsDroppingOut();
    paymentLinkExpiring({ day: "yesterday" });
  });
  cron.schedule("10 23 * * *", async () => {
    //pre
    weightUpdateNotification({
      weight_day: 5,
      notification_day: 4,
      notification_id: 7,
    });

    weightUpdateNotification({
      weight_day: 10,
      notification_day: 9,
      notification_id: 8,
    });
  });
  cron.schedule("15 11 * * *", async () => {
    paymentLinkExpiring({ day: "today" });
  });

  cron.schedule("*/40 * * * *", async () => {
    await activateTravelGuidesForRecentOnholdClients();
    await activateWeddingGuidesForRecentOnholdClients();
  });

  cron.schedule("*/60 * * * *", async () => {
    await activateAirportGuidesForRecentOnholdClients();
  });

  cron.schedule("15 7 * * *", async () => {
    await notifyEndingTravelOnholdBreaks();
    await notifyEndingHealthIssuesOnholdBreaks();
    await notifyEndingWeddingsOnholdBreaks();
  });
  cron.schedule("35 12 * * *", async () => {
    await notifyOnholdResumesToday();
    await sendEmergencyOnholdReminderNotification({
      content_key: "3_days_before",
      daysBefore: 3,
    });
    await sendEmergencyOnholdReminderNotification({
      content_key: "2_days_before",
      daysBefore: 2,
    });
    await sendEmergencyOnholdReminderNotification({
      content_key: "1_day_before",
      daysBefore: 1,
    });
    await sendEmergencyOnholdReminderNotification({
      content_key: "today",
      daysBefore: 0,
    });
  });
  cron.schedule("25 12 * * *", async () => {
    await notifyOnholdOverdue();
    await notifyOnholdOverdueHealthIssues();
    await notifyOnholdOverdueWeddings();
  });
  cron.schedule("15 12 * * *", async () => {
    await sendOnholdOverdueMail();
    await sendEmergencyOnholdODNotification({
      content_key: "1_day_after",
      interval: 1,
      intervalType: "DAY",
    });
    await sendEmergencyOnholdODNotification({
      content_key: "2_days_after",
      interval: 2,
      intervalType: "DAY",
    });
    await sendEmergencyOnholdODNotification({
      content_key: "3_days_after",
      interval: 3,
      intervalType: "DAY",
    });
  });
  cron.schedule("15 23 * * *", async () => {
    await moveOnholdToDormant();
  });
  cron.schedule("0 10 * * *", async () => {
    console.log("Running cron job for 10 AM notifications...");
    await sendWeddingsOnholdBreakScheduledNotifications(); // Call your function
    await sendMedicalIssuesOnholdBreakScheduledNotifications(); // Call your function
  });

  cron.schedule("0 14 * * *", async () => {
    console.log("Running cron job for 2 PM notifications...");
    await sendWeddingsOnholdBreakScheduledNotifications(); // Call your function
    await sendMedicalIssuesOnholdBreakScheduledNotifications(); // Call your function
    // await sendPostBirthDayHamperNotificationFirst();
    // await sendPostBirthDayHamperNotificationFourth();
    // await sendPostBirthDayHamperNotificationSeventh();
    await postDeliveryGeneralHamperNotification({
      content_key: "1_day_after",
      daysAfter: 1,
    });
    await postDeliveryGeneralHamperNotification({
      content_key: "3_days_after",
      daysAfter: 3,
    });
    const notificationIdList = [973, 974, 975];
    const notificationId =
      notificationIdList[Math.floor(Math.random() * notificationIdList.length)];
    await sendEmergencyOnholdWeeklyNotification({
      notificationId: notificationId,
    });
  });

  cron.schedule("0 15 * * *", async () => {
    // uncomment only these three lines to start the hamper notification crons
    // await productWiseHamperNotification({ dayKey: "day_2" });
    // await productWiseHamperNotification({ dayKey: "day_3" });
    // await productWiseHamperNotification({ dayKey: "day_4" });
    // await productWiseHamperNotification({ dayKey: "day_5" });
    // await productWiseHamperNotification({ dayKey: "day_6" });
  });

  cron.schedule("0 16 * * *", async () => {
    console.log("Running cron job for 4 PM notifications...");
    await sendWeddingsOnholdBreakScheduledNotifications(); // Call your function
    await sendMedicalIssuesOnholdBreakScheduledNotifications(); // Call your function
  });

  cron.schedule("0 22 * * *", async () => {
    console.log("Running cron job for 10 PM notifications...");
    await sendWeddingsOnholdBreakScheduledNotifications(); // Call your function
    await sendMedicalIssuesOnholdBreakScheduledNotifications(); // Call your function
  });

  cron.schedule("11 17 * * *", async () => {
    await dietAsk();
  });

  cron.schedule("11 16 * * *", async () => {
    await dailyFuCheck();
  });

  cron.schedule("15 11 * * *", async () => {
    await cronInductionCallReminders();
  });

  cron.schedule("30 11 * * *", async () => {
    await paymentLinkExpiring({ day: "tomorrow" });
    // ! uncomment the below lines to start the cron
    // balanceDueNotifications({notification_id:138,auto_chat:true,chat_id:1,days_before:2});
    // balanceDueNotifications({notification_id:177,auto_chat:true,chat_id:2,days_before:1});
    // balanceDueNotifications({notification_id:178,auto_chat:true,chat_id:3,days_before:0});
  });
  cron.schedule("0 12 * * *", async () => {
    onholdClientsExpiry({ overdue: true });
    onholdClientsExpiry({ overdue: false });
  });

  cron.schedule("0 11 * * *", async () => {
    console.log("⏰ Running Tailend No Advance Purchase Report at 11:00 AM...");
    sendTailendNoAdvacnePurchaseUserReport();
    cartAddedNotPaidMails({ status: "Active" });
    cartAddedNotPaidMails({ status: "Completed" });
  });
  cron.schedule("45 11 * * *", async () => {
    console.log("⏰ Running validityAwarenessBufferedMail at 11:45 AM...");
    validityAwarenessBufferedMail();
  });
  cron.schedule("0 13 * * *", async () => {
    // hamperDeliveredMails({ status: "Active" });
    // hamperDeliveredMails({ status: "Completed" });
    // ! uncomment the below lines to start the cron
    // sessionBasedNotifications({ session: 1, days: 1, notification_id: 1 });
    if (
      moment().format("dddd") === "Tuesday" ||
      moment.format("dddd") === "Friday"
    ) {
      sendPageVisitMails({ status: "Active", page_type: 1 });
      sendPageVisitMails({ status: "Active", page_type: 2 });
      sendPageVisitMails({ status: "OCR", page_type: 1 });
      sendPageVisitMails({ status: "OCR", page_type: 2 });
    }
    sendMilestoneDataFormNotification();
  });
  cron.schedule("30 14 * * *", async () => {
    // ! uncomment the below lines to start the cron
    sendHealthScoreNotification();
    sendHTCallReminderNotification();
    sendTailendHealthScoreNotification();
    sendTailendFeedbackCallReminderNotification();
  });
  cron.schedule("0 14 * * *", async () => {
    await sendWeeklyWedFriReferNotifications();
    // ! uncomment the below lines to start the cron
    // sessionBasedNotifications({ session: 2, days: 2, notification_id: 27,auto_chat : true,chat_id: 1 });
    // sessionBasedNotifications({ session: 4, days: 2, notification_id: 27,auto_chat : true,chat_id: 1 });
    // sessionBasedNotifications({ session: 6, days: 2, notification_id: 27,auto_chat : true,chat_id: 1 });
    // sessionBasedNotifications({ session: 8, days: 2, notification_id: 27,auto_chat : true,chat_id: 1 });
    // sessionBasedNotifications({ session: 3, days: 7, notification_id: 28 ,auto_chat: true,chat_id: 2 });
    // sessionBasedNotifications({ session: 5, days: 7, notification_id: 28 ,auto_chat: true,chat_id: 2 });
    // sessionBasedNotifications({ session: 7, days: 7, notification_id: 28 ,auto_chat: true,chat_id: 2 });
    // sessionBasedNotifications({ session: 9, days: 7, notification_id: 28 ,auto_chat: true,chat_id: 2 });
  });
  cron.schedule("15 14 * * *", async () => {
    iclPopUp();
  });
  cron.schedule("30 14 * * *", async () => {
    // ! uncomment the below lines to start the cron
    // sessionBasedNotifications({ session: 1, days: 3, notification_id: 136 });
  });
  cron.schedule("0 8 * * *", async () => {
    // Your function call here
    sendAtRiskCron();
  });
  cron.schedule("0 6 * * *", async () => {
    // Your function call here
    updateClientStatusToOnHold();
  });

  cron.schedule("40 14 * * *", async () => {
    nafPopUp();
  });
  cron.schedule("0 17 * * *", async () => {
    onholdClientsExpiry({ overdue: true });
    onholdClientsExpiry({ overdue: false });
    await sendBNSnackNotificationNewJoinees();
  });
  cron.schedule("30 18 * * *", async () => {
    // ! uncomment the below lines to start the cron and pass the notification_id
    // dietSentNotification({notification_id:133})
    await getTodaysPendingFollowCountReminder();
    await checkPendingDietsForMentors();
  });
  cron.schedule("45 18 * * *", async () => {
    // ! uncomment the below lines to start the cron and pass the notification_id
    checkDietOverdueForAllMentors();
  });
  cron.schedule("50 18 * * *", async () => {
    // ! uncomment the below lines to start the cron and pass the notification_id
    checkMissedCallsForMentors();
  });
  cron.schedule("40 14 * * *", async () => {
    dailyClientFuCheck();
  });
  cron.schedule("10 15 * * *", async () => {
    dailyLeadFuCheck();
  });
  cron.schedule("40 15 * * *", async () => {
    dailyFirstPitch48HrCheck();
  });
  cron.schedule("40 17 * * *", async () => {
    dailyPitched48HrNoActivityCheck();
  });
  cron.schedule("0 19 * * *", async () => {
    // ! uncomment the below lines to start the cron and pass the notification_id
    setSessionStartDateNotification({
      window: [1, 2],
      notification_id: 16,
    });
    setSessionStartDateNotification({
      window: [2, 5],
      notification_id: 134,
    });
  });
  cron.schedule("30 20 * * *", async () => {
    callsDoneMails();
  });
  cron.schedule("45 20 * * *", async () => {
    callsPendingMails();
  });
  cron.schedule("55 20 * * *", async () => {
    callsUnansweredMails();
  });

  cron.schedule("0 21 * * 0", async () => {
    // ! uncomment the below lines to start the cron
    // const week_number = moment().week();
    // if(week_number%2===1){
    //   sundayNotification({notification_id:25})
    // }else{
    //   sundayNotification({notification_id:137})
    // }
  });
  cron.schedule("30 23 * * *", async () => {
    // ! start the cron by uncommenting the below lines
    updateStatusToMaintenance();
    updateStatusToNotStarted();
  });
  cron.schedule("35 11 * * *", async () => {
    // ! start the cron by uncommenting the below lines
    const users = await fetchAdvanceUsersForReminders();
    await sendAdvanceReminders(users);
  });

  cron.schedule("0 6 * * *", async () => {
    // Your function call here
    weightUpdateNotification({
      weight_day: 10,
      notification_day: 19,
      notification_id: 23,
    });
    updateStatusToDormant();
  });

  cron.schedule("0 18 * * 5,6,0", async () => {
    console.log("Running Restaurant Guide Notification Cron (Fri-Sun, 6 PM)");
    await sendRestaurantGuideNotification();
  });

  cron.schedule("30 9 * * *", async () => {
    console.log("Running Diet PDF Notification Cron (9:30 AM)");
    await sendDietPdfNotification();
  });

  cron.schedule("0 19 * * 5,6,0", async () => {
    console.log("Running Alcohol Guide Notification Cron (Fri-Sun, 7 PM)");
    await sendAlcoholGuideNotification();
  });
  cron.schedule("0 9 * * 1", async () => {
    console.log("Running Monday Feedback Notification Cron (9 AM)");
    await sendRestaurantFeedbackReminder();
  });
  cron.schedule("45 9 * * 1", async () => {
    console.log("Running Monday Feedback Notification Cron (9:45 AM)");
    await sendAlcoholFeedbackReminder();
  });

  // cron.schedule("0 7 * * *", async () => {
  //   // Your function call here
  //   sendAdvanceProgramStartDateChats();
  // });

  cron.schedule("45 23 * * *", async () => {
    // Your function call here
    handleDormantToDroupout();
  });

  //crons for wati of halftime and tailend journey

  cron.schedule("50 11 * * *", async () => {
    // await sendWelcomeCallWati();
  });

  cron.schedule("55 11 * * *", async () => {
    // await sendGoalWati();
  });

  cron.schedule("30 10 * * *", async () => {
    await sendPerformanceSummary();
  });

  cron.schedule("0 12 * * *", async () => {
    // await sendTECallReminderWati();
  });

  cron.schedule("5 12 * * *", async () => {
    // await sendHTCallReminderWati();
  });

  cron.schedule("10 12 * * *", async () => {
    // await sendHalfTimeHealthScoreWati();
  });

  cron.schedule("15 12 * * *", async () => {
    // await sendFinalHealthScoreWati();
  });

  cron.schedule("20 12 * * *", async () => {
    // await sendFinalFeedbackWati();
  });

  cron.schedule("25 12 * * *", async () => {
    // await sendHalfTimeFeedbackWati();
  });

  cron.schedule("0 21 * * *", async () => {
    console.log("🕗 Running 9:00 PM Dormant WATI reminders");
    await sendDormantClientReminderWati();
  });

  cron.schedule("30 8 * * *", async () => {
    console.log("🕗 Running 8:30 AM WATI weight reminder cron");
    // await sendStartWeightReminderWati();
    // await sendMidWeightReminderWati();
    await sendEndWeightReminderWati();
    console.log("✅ Completed all 4 WATI weight reminders");
  });

  cron.schedule("0 8 * * *", async () => {
    console.log("🕗 Running 8:00 AM WATI Start Date reminder cron");
    // await sendStartDateReminderWati();
  });

  cron.schedule("15 6 * * *", async () => {
    console.log("🕗 Running 8:15 AM WATI Start Date reminder cron");
    //overdue 11 12

    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 11,
      notification_id: 9,
    });
    await weightUpdateNotification({
      weight_day: 5,
      notification_day: 6,
      notification_id: 297,
    });
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 12,
      notification_id: 296,
    });
    await weightUpdateNotification({
      weight_day: 5,
      notification_day: 7,
      notification_id: 297,
    });
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 13,
      notification_id: 18,
    });
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 14,
      notification_id: 18,
    });
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 15,
      notification_id: 19,
    });
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 16,
      notification_id: 20,
    });
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 17,
      notification_id: 21,
    });

    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 18,
      notification_id: 22,
    });

    await weightUpdateDormantNotification({
      weight_day: 10,
      notification_day: 19,
      notification_id: 23,
    });
  });

  cron.schedule("0 7 * * *", async () => {
    console.log("🕗 Running 7:0 AM WATI WMR reminder cron");
    //on the day

    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 10,
      notification_id: 295,
    });
    await weightUpdateNotification({
      weight_day: 5,
      notification_day: 5,
      notification_id: 294,
    });
  });

  cron.schedule("0 19 * * *", async () => {
    console.log("🕗 Running 7:0 PM WATI WMR reminder cron");
    //on the day
    await weightUpdateNotification({
      weight_day: 10,
      notification_day: 10,
      notification_id: 299,
    });
    await weightUpdateNotification({
      weight_day: 5,
      notification_day: 5,
      notification_id: 298,
    });
  });

  cron.schedule("15 12 * * *", async () => {
    console.log("🕗 Running 12:0 PM WATI checkValidityAwarenessForMentors");
    checkValidityAwarenessForMentors();
  });
  cron.schedule("0 18 * * *", async () => {
    console.log("🕗 Running 6:0 PM WATI checkValidityAwarenessForMentors");
    checkValidityAwarenessForMentors();
  });

  cron.schedule("25 20 * * *", async () => {
    console.log("🕗 Running 8:25 PM WATI WMR reminder cron");
    //on the day
    await weightUpdateDormantNotification({
      weight_day: 10,
      notification_day: 24,
      notification_id: 300,
    });

    await weightUpdateDormantNotification({
      weight_day: 10,
      notification_day: 27,
      notification_id: 300,
    });

    await weightUpdateDormantNotification({
      weight_day: 10,
      notification_day: 30,
      notification_id: 300,
    });

    await weightUpdateDormantNotification({
      weight_day: 10,
      notification_day: 33,
      notification_id: 300,
    });

    await weightUpdateDormantNotification({
      weight_day: 10,
      notification_day: 36,
      notification_id: 300,
    });
  });
  cron.schedule("*/10 * * * *", async () => {
    await cartAddedNotification();
  });
  cron.schedule("0 * * * *", async () => {
    await updateProductDeliveryStatus(null, null, null, true);
    await updateDrStoreOrderStatus(null, null, null, true);
  });
}

export default runCron;
