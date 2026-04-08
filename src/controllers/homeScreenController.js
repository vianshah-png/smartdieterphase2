import { insertRecord, readRecord, updateRecord } from `../config/query.js`;
import { tables } from `../helper/constant.js`;
import moment from `moment`;
import {
  filterObjectRemoveNullValues,
  addDaysToDate,
  getCurrentDateTime,
  formatDate,
} from `../helper/commonHelper.js`;
import { ErrorHandler } from `../utils/ErrorClass.js`;
import { ApiResponse } from `../utils/APiResponse.js`;



function upperSectionData(userDetails,activeProgramDetails,latestDietDetails){
  
  const currentDate = getCurrentDate();
  const active_order_id = activeProgramDetails[0].sub_order_id;
  const activeUserstatus = [`active`,`notstarted`,`onhold`,`dormant`];
  if(activeProgramDetails[0].balance_amount != `` && activeProgramDetails[0].balance_amount > 0){
                const formattedBalDueDate = formatDate(activeProgramDetails[0].due_date);
                if(formattedBalDueDate >= currentDate){
                    $profile_box_title         = `Balance Payment Due`;
                    $profile_box_description   = `Your payment of Rs. `+activeProgramDetails[0].balance_amount+` towards your program is due.`;
                    $profile_box_button        = `Pay Now`;
                    $profile_box_redirect      = `balance payment`;
                    $redirect_id               = active_order_id;
                    $image_url                 =`https://www.${image_guide_base_url}/bn-api-new/images/upper_section/programStatus_callBooking.png`;
                    $camera_flag               = false;
                }else if(formattedBalDueDate < currentDate){
                    $profile_box_title         = `Payment Overdue`;
                    $profile_box_description   = `Balance Rs.`+activeProgramDetails[0].balance_amount+` is overdue. Please clear immediately.`;
                    $profile_box_button        = `Pay Now`;
                    $profile_box_redirect      = `balance payment`;
                    $redirect_id               = active_order_id;
                    $image_url                 =`https://www.${image_guide_base_url}/bn-api-new/images/upper_section/programStatus_callBooking.png`;
                    $camera_flag               = false;
                }
    }else if (userDetails[0].sub_user_status.toLowerCase() === `onhold`) {
        // Fetching on-hold details
      
        // Format dates
        const breakStart = formatDate(activeProgramDetails[0].break_start_date);
        const breakEnd = formatDate(activeProgramDetails[0].break_end_date);;

        // Set profile box properties
        const profileBox = {
          title: `Program On Hold`,
          description: `Your program is on hold from `+breakStart+` to `+breakEnd,
          button: ``,
          redirect: ``,
          redirectId: ``,
          imageUrl: `https://www.${image_guide_base_url}/bn-api-new/images/upper_section/programStatus_callBooking.png`,
          cameraFlag: false
        };

      } else if (userDetails[0].sub_user_status.toLowerCase() === `dropout`) {
            // Set profile box properties for dropout status
            const profileBox = {
              title: `Program Lapsed`,
              description: `Program has lapsed. Contact your mentor to start again.`,
              button: `Start Again`,
              redirect: `mentor chat`,
              redirectId: ``,
              imageUrl: `https://www.${image_guide_base_url}/bn-api-new/images/upper_section/programStatus_callBooking.png`,
              cameraFlag: false
            };
      }else if(activeUserstatus.includes(userDetails[0].sub_user_status.toLowerCase()) && activeProgramDetails[0].program_type == 0){
          
        

















      }
    

 }

 function programStatusSection(userDetails,activeProgramDetails,latestDietDetails){
  console.log(`Yesss`);
 }

export const getHomeScreenData = async (req, res) => {
  const newData = req.body;
  const user_id = newData.user_id;
  const active_order_id = newData.order_id;
   try{
    const userDetailstable = tables.userDetails;
      const selectUserDetailsColumns = [`*`];
      const userDetailsWhereCondition = [
        { field: `user_id`, operator: `=`, value: user_id },
      ];
      const { results: userDetails } = await readRecord({
        table: `${userDetailstable}`,
        selectFields: selectUserDetailsColumns,
        conditions: userDetailsWhereCondition,
      });
    const orderDetailstable = tables.subOrderPrograms;
    const selectorderDetailsColumns = [`*`];
    const orderDetailsWhereCondition = [
      {
        field: `sub_order_id`,
        operator: `=`,
        value: active_order_id,
      },
    ];
    const { results: activeProgramDetails } = await readRecord({
      table: `${orderDetailstable}`,
      selectFields: selectorderDetailsColumns,
      conditions: orderDetailsWhereCondition,
    });
    
    const dietSessionstable = tables.dietSessionLog;
    const selectDietSessionsColumns = [`*`];
    const dietSessionsWhereCondition = [
      {
        field: `sub_order_id`,
        operator: `=`,
        value: active_order_id,
      },
    ];
    const { results: latestDietDetails } = await readRecord({
      table: `${dietSessionstable}`,
      selectFields: selectDietSessionsColumns,
      conditions: dietSessionsWhereCondition,
    });



const upperSection = upperSectionData(userDetails,activeProgramDetails,latestDietDetails);
const programStatus = programStatusSection(userDetails,activeProgramDetails,latestDietDetails);



    return res.status(200).json({
        status: true,
        data: {
          page_title: `My BN Account`,
          notification_count: `6`,
          user_type: 2,
          upper_section: {
            upper_section_image: `https://i.ibb.co/Zz8Lv9k/image.png`,
            camera_visibility: true,
            title: `Program Lapsed`,
            description: `Program has lapsed. Contact your mentor to start again.`,
            button_text: `Start Again`,
            redirect_screen: `mentor chat`,
            redirect_id: ``,
            phone_number: null,
            default_start_date: null,
            calender_date: null,
            calender_start_date: null,
            auto_text: null,
          },
          program_status_section: {
            section_id: 4,
            title: `Program Lapsed:`,
            button_1_text: `Start Again`,
            button_1_redirect_screen: `mentor chat`,
            button_2_text: ``,
            button_2_redirect_screen: ``,
            text_data:
              `Your program has lapsed. Please contact your mentor to start again.`,
            text_data1: ``,
            timer: ``,
            left_button_text: ``,
            left_button_redirect_screen: ``,
            right_button_text: ``,
            right_button_redirect_screen: ``,
            total_sessions: ``,
            completed_sessions: ``,
            pending_sessions: ``,
            to_do_image: true,
            program_status_image:
              `https://www.${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
            default_start_date: ``,
            order_id: `52019`,
            calender_start_date: 3,
            auto_text: `program_expired`,
            whatsapp_no: `8433580878`,
            whatsapp_automessage: `hello whats up`,
            onhold_date_timestamp: ``,
            calender_date: `2025-01-23`,
          },
          trackers_and_ekit_section: {
            title: `Diets, Trackers & BN Guides`,
            color: `#EDFEFF`,
            trackers_and_ekit: [
              {
                top_name: `Diet`,
                bottom_name: `Charts`,
                redirect_id: ``,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/diet_chart_new.png`,
                notification_flag: false,
                redirect_page: `diet list`,
              },
              {
                top_name: `Weight`,
                bottom_name: `Tracker`,
                redirect_id: ``,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/weight_tracker_new.png`,
                notification_flag: false,
                redirect_page: `weight tracker`,
              },
              {
                top_name: `Inch Loss`,
                bottom_name: `Tracker`,
                redirect_id: ``,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/inch_tracker_new.png`,
                notification_flag: false,
                redirect_page: `46`,
              },
              {
                top_name: `Photo`,
                bottom_name: `Tracker`,
                redirect_id: ``,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/photo_tracker_new.png`,
                notification_flag: true,
                redirect_page: `photo tracker`,
              },
              {
                top_name: `Restaurant`,
                bottom_name: `Guide`,
                redirect_id:
                  `https://www.${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-restaurant-guide`,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png`,
                notification_flag: false,
                redirect_page: `inAppWebView`,
              },
              {
                top_name: `Frequent`,
                bottom_name: `Queries`,
                redirect_id:
                  `https://www.${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-faqs`,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/bn_faq.png`,
                notification_flag: false,
                redirect_page: `inAppWebView`,
              },
              {
                top_name: `Daily`,
                bottom_name: `Essentials`,
                redirect_id:
                  `https://www.${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-daily-essentials`,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/daily_essentials.png`,
                notification_flag: false,
                redirect_page: `inAppWebView`,
              },
              {
                top_name: `Eat In`,
                bottom_name: `Portions`,
                redirect_id:
                  `https://www.${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
                image:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/eat_n_portions.png`,
                notification_flag: false,
                redirect_page: `inAppWebView`,
              },
            ],
          },
          tab_bar_section: {
            wallet_log_badge: 8,
            unread_chat_badge: 74,
            my_goals_badge: 0,
          },
          fasting_notification: {
            fasting_start: ``,
            fasting_end: ``,
          },
          weight_comparison_section: {
            section_title: `You Left us here 108 Days Ago`,
            start_weight_title: `Start Weight:`,
            start_weight_value:
              `<p style="font-size:25px;font-weight:400;font-family: Roboto">74.00 <span style="font-size:14px">kg</span></p>`,
            last_weight_title: `108 Days Ago:`,
            last_weight_value:
              `<p style="font-size:25px;font-weight:400;font-family: Roboto">74.00 <span style="font-size:14px">kg</span></p>`,
            ideal_weight_title: `Ideal Weight:`,
            ideal_weight_value:
              `<p style="font-size:25px;font-weight:700;font-family: Roboto">54.00 <span style="font-size:14px">kg</span></p>`,
            button_text: `Update Now`,
            redirect_screen: `take_health_score`,
          },
          weight_and_bmi_report: {
            section_title: `Your B.M.I. & Ideal Weight Report`,
            report_sliders: [
              {
                text: `<p face="Roboto-Regular" size="4">You are <b>8</b></p><p face="Roboto-Regular" size="3"> kg/m<sup><small>2</small></sup></p> <p face="Roboto-Regular" size="4">away from your ideal B.M.I</p>`,
                button_text: `Start Again`,
                redirect_screen: `mentor chat`,
                redirect_id: ``,
                box_border_color: `#03989F`,
                icon_url:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ocr_screen/icon1.png`,
                info_pop_up: {
                  title: `BMI Classification Table`,
                  image:
                    `https://www.${image_guide_base_url}/bn-api-new/images/ocr_screen/bmi_classification.png`,
                },
              },
              {
                text: `<p face="Roboto-Regular" size="4">You are <b>20</b> kg away from your ideal weight.</p>`,
                button_text: `Start Again`,
                redirect_screen: `mentor chat`,
                redirect_id: ``,
                box_border_color: `#FF5B8D`,
                icon_url:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ocr_screen/icon2.png`,
                info_pop_up: null,
              },
              {
                text: `<p face="Roboto-Regular" size="4">You are <b>64</b> points away from your ideal health score.</p>`,
                button_text: `Start Again`,
                redirect_screen: `mentor chat`,
                redirect_id: ``,
                box_border_color: `#FFB82C`,
                icon_url:
                  `https://www.${image_guide_base_url}/bn-api-new/images/ocr_screen/icon3.png`,
                info_pop_up: null,
              },
            ],
          },
          other_option_section: {
            section_title: `Other Options`,
            other_option_list: [
              {
                text: `Watch Educational Videos`,
                redirect_screen: `redirect_url`,
                redirect_id: `https://www.instagram.com/${image_guide_base_url}/`,
              },
              {
                text: `Correct Your Constipation`,
                redirect_screen: `cleanse_program`,
                redirect_id: `121`,
              },
              {
                text: `Get Relief From Acidity`,
                redirect_screen: `cleanse_program`,
                redirect_id: `115`,
              },
              {
                text: `Weight Loss Detox Cleanse`,
                redirect_screen: `cleanse_program`,
                redirect_id: `112`,
              },
              {
                text: `Flat Stomach Detox Cleanse`,
                redirect_screen: `cleanse_program`,
                redirect_id: `114`,
              },
            ],
          },
          suggested_program_section: null,
          popup_section: null,
          omr_popup: 1,
          advance_program_order_id: 0,
          order_id: `52019`,
          force_update: 1,
          display_pop_up: 1,
          offer_title:
            `<p face="Roboto-Regular" size="6"><center><b>Anti-Inflammatory Diets </b></center></p>`,
          offer_description:
            `<p face="Roboto-Regular" size="5"><center>BN has come up with 2 New & Advanced Programs only for our clients!<br/>Available at 50% off! </center></p>`,
          offer_image:
            `https://www.${image_guide_base_url}/images/app_images/percentage.png`,
          offer_button1: `Know More`,
          offer_button2: `Not Now`,
          offer_button1_redirect_screen: `redirect_url`,
          offer_button1_redirect_id:
            `https://www.${image_guide_base_url}/advance-reform-intermittent-app?user_id=30909`,
          offer_button2_redirect_screen: `redirect_url`,
          offer_button2_redirect_id:
            `https://www.${image_guide_base_url}/advance-plateau-breaker-app?user_id=30909`,
          offer_mentor_autotext: ``,
          offer_client_autotext: null,
          new_android_version: `151`,
          mentor_photo:
            `https://www.${image_guide_base_url}/crm_ui/images/Shraddha_joshi.png`,
          mentor_full_name: `M/s. Shraddha Joshi`,
          faq_url:
            `https://www.${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-faqs`,
          wmr_notifications: [
            {
              type: `notification_5th_pre`,
              notification_date: `2024-10-10`,
              notification_time: `07:00`,
              title: `Weight Update Due!`,
              description:
                "It`s time for your mid-session weight update. Ensure you record the weight empty-stomach & using the same weighing scale.",
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_5th_post`,
              notification_date: `2024-10-10`,
              notification_time: `19:00`,
              title: `Weight Update Over Due!`,
              description:
                `You had to fill in your weight this morning. Please update it empty stomach to stay regular with your program progress!`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_7th_pre`,
              notification_date: `2024-10-12`,
              notification_time: `07:00`,
              title: `Weight Update Missed!`,
              description:
                `You missed updating your weight mid session. The tracker is now open only for 12 hours. Fill it now!`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_7th_post`,
              notification_date: `2024-10-12`,
              notification_time: `19:00`,
              title: `Important Update From Mentor`,
              description:
                `You missed updating your weight mid session. The tracker is now open only for 12 hours. Fill it now!`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_10th_pre`,
              notification_date: `2024-10-15`,
              notification_time: `07:00`,
              title: `WMR 10th Day Pre`,
              description: `Fill Your 5th Day Weight`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_10th_post`,
              notification_date: `2024-10-15`,
              notification_time: `19:00`,
              title: `WMR 10th Day Post`,
              description: `Fill Your 5th Day Weight`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_12th_pre`,
              notification_date: `2024-10-17`,
              notification_time: `07:00`,
              title: `WMR 12th Day Pre`,
              description: `Fill Your 5th Day Weight`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_12th_post`,
              notification_date: `2024-10-17`,
              notification_time: `19:00`,
              title: `WMR 12th Day Post`,
              description: `Fill Your 5th Day Weight`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_14th_day`,
              notification_date: `2024-10-19`,
              notification_time: `19:00`,
              title: `WMR 14th Day`,
              description: `Fill Your 5th Day Weight`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
            {
              type: `notification_17th_day`,
              notification_date: `2024-10-22`,
              notification_time: `19:00`,
              title: `WMR 17th Day`,
              description: `Fill Your 5th Day Weight`,
              redirect: `weight_tracker`,
              send_notification: false,
            },
          ],
          in_app_notifications: [],
          maintenance_status: false,
          balance_popup: null,
          is_goal_button_enabled: false,
          restrict_section: {
            restrict_title: `End-Session Weight Overdue`,
            restrict_message: `End-session 1 weight update is overdue`,
            restrict_button_text: `Update Now`,
            restrict_popup_image:
              `https://www.${image_guide_base_url}/bn-api-new/images/program_status/programStatus_weighingScale.png`,
            restrict_button_redirect_screen: `weight_tracker`,
            restrict_button_redirect_id: ``,
            restrict_button_mentor_autotext: `Mentor Auto Text`,
            restrict_button_client_autotext: `Client Auto Text`,
            restrict_popup_status: false,
          },
          marquee_text: {
            marquee_color: `#03989F`,
            text: `<p face="Roboto-Regular" size="5">After <p>200 Days of R&D</p>,  BN has come up with 2 new programs! Introducing <b>Intermittent Fasting Advanced  & Plateau Breaker Advanced</b> in 90 & 180-Day Formats. Designed to reduce Chronic Inflammation, Food Sensitivity & other health issues from the Root! </p>`,
            redirect_page: `redirect_url`,
            redirect_id:
              `https://www.${image_guide_base_url}/advance-plateau-breaker-app?user_id=30909`,
          },
          isRenewal: false,
          isRenwalIMF: false,
          program_name: `10 Day Intermittent Fasting`,
          is_ocr_client: true,
          program_id: `118`,
          is_cleanse_program: true,
          tips_section: {
            tip_id: `50`,
            title: `Tip of the Day`,
            platform: `instagram`,
            is_video: true,
            tip_image: ``,
            tip_video: `ReOlNmR9Hao`,
            tip_title: `Want to Lose Weight but Not Motivated?`,
            tip_description:
              `<p><span style="font-family: arial, helvetica, sans-serif;"><strong><span style="font-size: 14px;">We\'ve got some motivation for you!</span></strong></span></p>\r\n<p><span style="font-family: arial, helvetica, sans-serif;"><strong><span style="font-size: 14px;">Losing weight is difficult..</span></strong></span></p>\r\n<ul>\r\n<li><span style="font-size: 14px; font-family: arial, helvetica, sans-serif;" data-sheets-root="1" data-sheets-value='{&quot;1&quot;:2,&quot;2&quot;:&quot;Losing weight is difficult..\\n\\nWorking on your health &amp; giving up on your favorite foods also is difficult.\\n\\nThere are times when you are genuinely trying &amp; putting the effort to follow a diet nicely &amp; yet do not see the desired results.\\n\\nThis is when you want to give up &amp; get back to your old eating habits.\\n\\nIf this is you, then as mentioned in the video, give yourself this last chance.\\n\\nAs your nutrition expert, we will make weight loss practical, easy, doable &amp; result-oriented for you.&quot;}' data-sheets-userformat='{&quot;2&quot;:29569,&quot;3&quot;:{&quot;1&quot;:0},&quot;10&quot;:2,&quot;11&quot;:4,&quot;12&quot;:0,&quot;15&quot;:&quot;Arial&quot;,&quot;16&quot;:10,&quot;17&quot;:1}' data-sheets-textstyleruns='{&quot;1&quot;:0,&quot;2&quot;:{&quot;5&quot;:0}}?{&quot;1&quot;:29}?{&quot;1&quot;:30,&quot;2&quot;:{&quot;5&quot;:0}}'>Working on your health &amp; giving up on your favorite foods also is difficult.</span></li>\r\n<li><span style="font-size: 14px; font-family: arial, helvetica, sans-serif;" data-sheets-root="1" data-sheets-value='{&quot;1&quot;:2,&quot;2&quot;:&quot;Losing weight is difficult..\\n\\nWorking on your health &amp; giving up on your favorite foods also is difficult.\\n\\nThere are times when you are genuinely trying &amp; putting the effort to follow a diet nicely &amp; yet do not see the desired results.\\n\\nThis is when you want to give up &amp; get back to your old eating habits.\\n\\nIf this is you, then as mentioned in the video, give yourself this last chance.\\n\\nAs your nutrition expert, we will make weight loss practical, easy, doable &amp; result-oriented for you.&quot;}' data-sheets-userformat='{&quot;2&quot;:29569,&quot;3&quot;:{&quot;1&quot;:0},&quot;10&quot;:2,&quot;11&quot;:4,&quot;12&quot;:0,&quot;15&quot;:&quot;Arial&quot;,&quot;16&quot;:10,&quot;17&quot;:1}' data-sheets-textstyleruns='{&quot;1&quot;:0,&quot;2&quot;:{&quot;5&quot;:0}}?{&quot;1&quot;:29}?{&quot;1&quot;:30,&quot;2&quot;:{&quot;5&quot;:0}}'>There are times when you are genuinely trying &amp; putting the effort to follow a diet nicely &amp; yet do not see the desired results.</span></li>\r\n<li><span style="font-size: 14px; font-family: arial, helvetica, sans-serif;" data-sheets-root="1" data-sheets-value='{&quot;1&quot;:2,&quot;2&quot;:&quot;Losing weight is difficult..\\n\\nWorking on your health &amp; giving up on your favorite foods also is difficult.\\n\\nThere are times when you are genuinely trying &amp; putting the effort to follow a diet nicely &amp; yet do not see the desired results.\\n\\nThis is when you want to give up &amp; get back to your old eating habits.\\n\\nIf this is you, then as mentioned in the video, give yourself this last chance.\\n\\nAs your nutrition expert, we will make weight loss practical, easy, doable &amp; result-oriented for you.&quot;}' data-sheets-userformat='{&quot;2&quot;:29569,&quot;3&quot;:{&quot;1&quot;:0},&quot;10&quot;:2,&quot;11&quot;:4,&quot;12&quot;:0,&quot;15&quot;:&quot;Arial&quot;,&quot;16&quot;:10,&quot;17&quot;:1}' data-sheets-textstyleruns='{&quot;1&quot;:0,&quot;2&quot;:{&quot;5&quot;:0}}?{&quot;1&quot;:29}?{&quot;1&quot;:30,&quot;2&quot;:{&quot;5&quot;:0}}'>This is when you want to give up &amp; get back to your old eating habits.</span></li>\r\n<li><span style="font-size: 14px; font-family: arial, helvetica, sans-serif;" data-sheets-root="1" data-sheets-value='{&quot;1&quot;:2,&quot;2&quot;:&quot;Losing weight is difficult..\\n\\nWorking on your health &amp; giving up on your favorite foods also is difficult.\\n\\nThere are times when you are genuinely trying &amp; putting the effort to follow a diet nicely &amp; yet do not see the desired results.\\n\\nThis is when you want to give up &amp; get back to your old eating habits.\\n\\nIf this is you, then as mentioned in the video, give yourself this last chance.\\n\\nAs your nutrition expert, we will make weight loss practical, easy, doable &amp; result-oriented for you.&quot;}' data-sheets-userformat='{&quot;2&quot;:29569,&quot;3&quot;:{&quot;1&quot;:0},&quot;10&quot;:2,&quot;11&quot;:4,&quot;12&quot;:0,&quot;15&quot;:&quot;Arial&quot;,&quot;16&quot;:10,&quot;17&quot;:1}' data-sheets-textstyleruns='{&quot;1&quot;:0,&quot;2&quot;:{&quot;5&quot;:0}}?{&quot;1&quot;:29}?{&quot;1&quot;:30,&quot;2&quot;:{&quot;5&quot;:0}}'>If this is you, then as mentioned in the video, give yourself this last chance.</span></li>\r\n<li><span style='font-size: 14px; font-family: arial, helvetica, sans-serif;'' data-sheets-root='1' data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Losing weight is difficult..\\n\\nWorking on your health &amp; giving up on your favorite foods also is difficult.\\n\\nThere are times when you are genuinely trying &amp; putting the effort to follow a diet nicely &amp; yet do not see the desired results.\\n\\nThis is when you want to give up &amp; get back to your old eating habits.\\n\\nIf this is you, then as mentioned in the video, give yourself this last chance.\\n\\nAs your nutrition expert, we will make weight loss practical, easy, doable &amp; result-oriented for you.&quot;}" data-sheets-userformat='{&quot;2&quot;:29569,&quot;3&quot;:{&quot;1&quot;:0},&quot;10&quot;:2,&quot;11&quot;:4,&quot;12&quot;:0,&quot;15&quot;:&quot;Arial&quot;,&quot;16&quot;:10,&quot;17&quot;:1}' data-sheets-textstyleruns='{&quot;1&quot;:0,&quot;2&quot;:{&quot;5&quot;:0}}?{&quot;1&quot;:29}?{&quot;1&quot;:30,&quot;2&quot;:{&quot;5&quot;:0}}'>As your nutrition expert, we will make weight loss practical, easy, doable &amp; result-oriented for you.</span></li>\r\n</ul>`,
          },
          success_story_section: {
            story_id: `86`,
            title: `They Started and Succeeded`,
            success_desc: `Lost 7.8 kg`,
            success_story_image:
              `https://www.${image_guide_base_url}/images/testimonial/before_after_9a520229.png`,
            name: `niket sachar`,
            country_flag:
              `https://www.${image_guide_base_url}/bn-api-new/images/flags/flags/bh.png`,
            health: `Weight loss,Uric acid,`,
            country_name: `Bahrain`,
          },
          image_slider_section: [
            {
              image:
                `https://www.${image_guide_base_url}/bn-api-new/images/lead_home_screen/meet_khyati_card.png`,
              redirect_screen_name: `Explore`,
              redirect_screen_id: `lead_meet_khyati`,
              redirect_id: `1`,
            },
            {
              image:
                `https://www.${image_guide_base_url}/bn-api-new/images/lead_home_screen/spin_&_win_card.png`,
              redirect_screen_name: `Spin The Wheel`,
              redirect_screen_id: `webview`,
              redirect_id: `https://${image_guide_base_url}/spintowin/?user_id=30909`,
            },
            {
              image:
                `https://www.${image_guide_base_url}/bn-api-new/images/lead_home_screen/Reform.png`,
              redirect_screen_name: `Explore`,
              redirect_screen_id: `AdvanceProgram`,
              redirect_id: `92`,
            },
          ],
          e_kit_section: {
            title: `E-kit:Friend For Life`,
            ekit_description: `BN Global Dine-Out & Party Guide`,
            ekit_sub_description:
              `Gives you the freedom to choose your meals when eating out or at a party.`,
            ekit_image:
              `https://www.${image_guide_base_url}/bn-api-new/images/lead_home_screen/E-kit.png`,
          },
          blog_section: {
            blog_id: `30`,
            title: `Health Reads`,
            desc: `Each and every kind of food that we intake has some kind of nutritional value; be it carb or carbohydrate or fiber, etc. which helps our body metabolism. Hence, food cannot be simply termed as bad, th`,
            catTitle: `OBESITY`,
            image:
              `https://www.${image_guide_base_url}/nina/images/blog-images/large/blog_2023-02-02-21:18:48.png`,
            added_date: `02 Feb 2023`,
            total_view: `77`,
          },
          recipe_section: {
            title: `Latest Healthy Recipes`,
            recipe_id: `1225`,
            recipe_name: `MOONG DAL PARATHA`,
            recipe_image:
              `https://www.${image_guide_base_url}/images/receipe-img/1645873401_large.png`,
            recipe_category: `CEREALS AND GRAINS`,
            recipe_description:
              `Dal paratha is a wonderful nutritional boost if seeking for weight loss. High in protein and dietary fibre, it keeps one full for a longer time. Also, adding a complex carbohydrate such as wheat flour makes this paratha a perfect cereal-pulse combination. Eating this balanced meal with a bowl of curd not only provides good nutrition but also helps you edge towards a better body and overall well-being.`,
            recipe_type: `Veg`,
            recipe_type_image:
              `https://www.${image_guide_base_url}/images/recipes/veg.png`,
          },
          goal_section: {
            goal_list: [
              `Want to lose 10 kg weight`,
              `Look good in 3 months`,
              `Improve health condition`,
            ],
            button_text: `Start Again`,
            redirect_screen: `mentor_chat`,
            redirect_id: `1`,
          },
        },
      });

   
   } catch (error){
        console.log(`Error`);
   }
};

