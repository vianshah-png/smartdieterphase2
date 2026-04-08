// prettier-ignore
import {
  insertRecord,
  deleteRecords,
  readRecord,
  updateRecord,
} from "../config/query.js";
import {
  cloudinaryFolders,
  image_guide_base_url,
  marketingVideoUrls,
  tables,
} from "../helper/constant.js";
import {
  getCurrentDateTime,
  filterObjectRemoveNullValues,
  safeJSONParse,
} from "../helper/commonHelper.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import moment from "moment";
import {
  appLowerSectionResponse,
  appUpperSectionResponse,
} from "../helper/appHomeScreenHelper.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { fetchNotification } from "./common.js";
import { addAmountWallet } from "../helper/common.js";
import clientEnquiry from "../models/clientQueryModel.js";
import userNotification from "../models/userNotificationModel.js";
import { checkSmartScaleWeightDataExists } from "./smartScaleController/smartScaleController.js";

export const getSidemenuData = async (req, res) => {
  try {
    const { user_id } = req.body;
    const { results: user_details } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        `pm.program_name`,
        `(SELECT 
        SUM(CASE WHEN sop2.program_status = '4' THEN 1 ELSE 0 END)
     FROM sub_orders_programs sop2
     LEFT JOIN order_details od2 ON sop2.order_id = od2.order_id
     WHERE sop2.program_type = 0 AND od2.user_id = cd.user_id) AS client_advance_program_count`,
        `sop.program_status`,
        `sop.total_sessions`,
        `sop.sent_sessions`,
        `sop.pending_session`,
        `cd.user_type`,
        `cd.user_status`,
        `dsl.diet_id`,
        `hs.id`,
        `cd.user_id`,
      ],
      joins: [
        {
          type: `LEFT`,
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.active_order_id = sop.sub_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.programsMaster} pm`,
          on: `pm.program_id = sop.program_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.dietSessionLog} dsl`,
          on: `dsl.user_id = cd.user_id and sop.sub_order_id = dsl.sub_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.healthScoreClient} hs`,
          on: `hs.user_id = cd.user_id`,
        },
      ],
      conditions: [{ field: `cd.user_id`, operator: `=`, value: user_id }],
    });
    let programType = "";
    if (user_details[0]?.user_type == 1) {
      programType = "App";
    } else {
      programType = "Web";
    }
    let programsArray = [];
    const { results: programs } = await readRecord({
      table: tables.programsMaster,
      selectFields: [`program_id`, `program_name`, `program_category`],
      conditions: [
        { field: `is_active`, operator: `=`, value: 1 },
        { field: `app_web`, operator: `=`, value: programType },
        {
          field: "program_id",
          operator: `NOT IN`,
          value: `(18,136)`,
          raw: true,
        },
      ],
    });

    const { results: cleanseProgramsData } = await readRecord({
      table: tables.programsMaster,
      selectFields: [`program_id`, `program_name`, `program_category`],
      conditions: [
        { field: `is_active`, operator: `=`, value: 1 },
        {
          field: "program_id",
          operator: `NOT IN`,
          value: `(18,136)`,
          raw: true,
        },
        { field: `program_category`, operator: `=`, value: "Basic Stack" },
      ],
    });
    programsArray = [...programs, ...cleanseProgramsData];
    const cleansePrograms = [];

    const programListData = programsArray.map((program) => {
      const cleanedProgramName = (
        program.program_name ? String(program.program_name.toUpperCase()) : ``
      )
        .replace(/client\s+exclusive\s+advanced/i, ``)
        .replace(/\([^()]*\)/g, ``)
        .trim();
      // if (program.program_name === `BODY TRANSFORMATION`) {
      //   return {
      //     list_label: cleanedProgramName,
      //     list_sub_label: ``,
      //     list_sub_label_color: `#FFC932`,
      //     screen_name: `program`,
      //     params: {
      //       program_name: cleanedProgramName,
      //       program_id: program.program_id,
      //     },
      //   };
      // } else if (program.program_name === `Reform Intermittent`) {
      //   return {
      //     list_label: cleanedProgramName,
      //     list_sub_label: `(Most Recommended)`,
      //     list_sub_label_color: `green`,
      //     screen_name: `program`,
      //     params: {
      //       program_name: cleanedProgramName,
      //       program_id: program.program_id,
      //     },
      //   };
      // }
      if (program.program_category === `Basic Stack`) {
        cleansePrograms.push({
          list_label: cleanedProgramName,
          screen_name: `cleanse_program`,
          params: {
            program_name: cleanedProgramName,
            program_id: program.program_id,
          },
        });
        return null;
      }
      return {
        list_label: cleanedProgramName,
        screen_name: `program`,
        params: {
          program_name: cleanedProgramName,
          program_id: program.program_id,
        },
      };
    });
    console.log(programListData, 143);
    let programData = programListData.filter((program) => program !== null);
    if (user_details[0]?.user_type == 1) {
      programData.push({
        list_label: `BN Cleanse Plans`,
        children: cleansePrograms,
      });
    }
    const imf = programData.filter(
      (program) =>
        program?.params?.program_id === 162 ||
        program?.params?.program_id === 163,
    );
    programData = programData.filter(
      (program) =>
        program?.params?.program_id !== 162 &&
        program?.params?.program_id !== 163,
    );
    programData.unshift(...imf);
    console.log(user_details[0], 109);
    programData.sort((a, b) => {
      const aLength = a.list_sub_label ? a.list_sub_label.length : 0;
      const bLength = b.list_sub_label ? b.list_sub_label.length : 0;
      return bLength - aLength;
    });
    programData = [
      // {
      //   list_label: "10-Day Fitness Challenge",
      //   screen_name: "cleanse_program",
      //   params: {
      //     program_name: "10-Day Fitness Challenge",
      //     program_id: 161,
      //   },
      // },
      ...programData,
    ];
    const { results: leadFeedback, totalCount: fbCount } = await readRecord({
      selectFields: [`*`],
      table: `${tables.leadFeedback} lf`,
      conditions: [{ field: `lf.user_id`, operator: `=`, value: user_id }],
      countTotal: true,
    });

    console.log(user_id, 209);
    const smartScaleDataExists = await checkSmartScaleWeightDataExists(user_id);

    console.log(smartScaleDataExists, 210);
   const myAccountList =
  user_details[0]?.user_type === 1
    ? [
        {
          list_label: "My BN Reward",
          screen_name: "wallet",
        },

        ...(user_details[0]?.diet_id != null
          ? [
              {
                list_label: "Diet & Progress Trackers",
                children: [
                  {
                    list_label: "Diet",
                    screen_name: "diet_session_list",
                  },
                  {
                    list_label: "Weight Tracker",
                    screen_name: "weight_tracker",
                  },
                  {
                    list_label: "Inch Tracker",
                    screen_name: "inch_tracker",
                  },
                  {
                    list_label: "Photo Tracker",
                    screen_name:
                      user_details[0]?.user_status === "Completed"
                        ? "photo_tracker_lead_oc"
                        : "photo_tracker",
                  },
                ],
              },
            ]
          : []),

        {
          list_label: "Where You Stand",
          screen_name: "assessment_health_score",
        },
        {
          list_label: "My Recipe Book",
          screen_name: "recipes",
        },

        ...(smartScaleDataExists
          ? [
              {
                list_label: "Body Compositions",
                screen_name: "body_composition_log",
              },
            ]
          : []),

        {
          list_label: "Know Your Mentor",
          screen_name: "mentor_intro",
        },
      ]
    : [
        {
          list_label: "My Recipe Book",
          screen_name: "recipes",
        },
        {
          list_label: user_details[0]?.id
            ? "View Health Score"
            : "Health Score Report",
          screen_name: user_details[0]?.id
            ? user_details[0]?.user_status !== "Active"
              ? "lead_health_score_report"
              : "view_health_score"
            : "take_health_score",
          ...(user_details[0]?.id
            ? {
                params: {
                  user_id: user_id,
                },
              }
            : {}),
        },

        ...(fbCount > 0
          ? [
              {
                list_label: "My Feedbacks",
                screen_name: "lead_feedback_list",
              },
            ]
          : []),

        ...(smartScaleDataExists
          ? [
              {
                list_label: "Body Compositions",
                screen_name: "body_composition_log",
              },
            ]
          : []),

        {
          list_label: "My BN Reward",
          screen_name: "wallet",
        },
        {
          list_label: "Do & Get",
          screen_name: "do_and_get",
        },
      ];



    const menuList = [
      {
        list_label: `Success Stories`,
        screen_name: `success_stories`,
      },
      {
        list_label: `How We Work`,
        screen_name: `how_we_work`,
      },
      {
        list_label: `Meet Khyati`,
        screen_name: `meet_khyati`,
      },
      {
        list_label: `About Us`,
        children: [
          {
            list_label: `About Us`,
            screen_name: `about_us`,
          },
          {
            list_label: `Our Journey`,
            screen_name: `our_journey`,
          },
        ],
      },
      {
        list_label: `BN Gyaan`,
        children: [
          {
            list_label: `Healthy Recipes`,
            screen_name: `recipes`,
          },
          {
            list_label: `Health Reads`,
            screen_name: `health_reads`,
          },
          {
            list_label: `Videos`,
            screen_name: `health_videos`,
          },
        ],
      },
      ...(user_details[0]?.user_type == 1
        ? [
            {
              list_label: `Media`,
              screen_name: `health_videos`,
            },
            {
              list_label: `My BN E-Kit`,
              children: [
                {
                  list_label: `BN Restaurant Guide`,
                  screen_name: `webview`,
                  params: {
                    link: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${user_details[0].user_id}`,
                    screen_title: `BN Restaurant Guide`,
                  },
                },
                {
                  list_label: `BN Daily Essentials`,
                  screen_name: `webview`,
                  params: {
                    // link: `https://${image_guide_base_url}/show-ekit/Mjg2NjM=/b376eaa46904f0e044302d45ebd9784f/ekit-daily-essentials`,
                    link: "https://balancenutrition.in/media/ekits/daily_essentials.pdf",
                    screen_title: `BN Daily Essentials`,
                  },
                },
                {
                  list_label: `BN Eat In Portions`,
                  screen_name: `webview`,
                  params: {
                    // link: `https://${image_guide_base_url}/show-ekit/Mjg2NjM=/b376eaa46904f0e044302d45ebd9784f/ekit-eat-in-portions`,
                    link: `https://balancenutrition.in/media/ekits/eat_in_portions.pdf`,
                    screen_title: `BN Eat in Portions`,
                  },
                },
                {
                  list_label: `BN Frequently Asked Question`,
                  screen_name: `webview`,
                  params: {
                    // link: `https://${image_guide_base_url}/show-ekit/Mjg2NjM=/b376eaa46904f0e044302d45ebd9784f/ekit-faqs`,
                    link: "https://balancenutrition.in/media/ekits/frequently_asked_questions.pdf",
                    screen_title: `BN Frequently Asked Question`,
                  },
                },
                {
                  list_label: `BN Alcohol Guide`,
                  screen_name: `webview`,
                  params: {
                    link: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${user_details[0].user_id}`,
                    screen_title: `BN Alchohol Guide`,
                  },
                },
              ],
            },
          ]
        : []),
    ];

    const settingsList = [
      {
        list_label: `Allow Notification`,
      },
      ...(user_details[0]?.user_type == 1 &&
      user_details[0].user_status == "Active"
        ? [
            {
              list_label: `Program Details & Validity`,
              children: [
                {
                  list_label: `View Validity`,
                  screen_name: `current_program_validity`,
                },
                {
                  list_label: `Pause My Program`,
                  screen_name: `pause_my_program`,
                },
              ],
            },
          ]
        : []),
      {
        list_label: `Help & Support`,
        children: [
          {
            list_label: `Client Services`,
            screen_name: `client_services`,
          },
          {
            list_label: `Terms & Privacy Policy`,
            screen_name: `terms_and_condition`,
          },
        ],
      },
      ...(user_details[0]?.user_type == 1
        ? [
            {
              list_label: `Personal Info & Password`,
              children: [
                {
                  list_label: `Personal Info`,
                  screen_name: `personal_info`,
                },
                {
                  list_label: `Password`,
                  screen_name: `password_settings`,
                },
              ],
            },
            {
              list_label: `History`,
              children: [
                {
                  list_label: `My Order History`,
                  screen_name: `order_history`,
                },
                {
                  list_label: `Assessment History`,
                  screen_name: `assessment_history`,
                },
                {
                  list_label: `Ingredient Check List History`,
                  screen_name: `ingredient_checklist_history`,
                },
              ],
            },
            {
              list_label: `Updates`,
              screen_name: `updates`,
            },
          ]
        : []),
      ...(user_details[0]?.user_type == 0
        ? [
            {
              list_label: `My Profile`,
              screen_name: `lead_view_my_profile`,
            },
          ]
        : []),
      {
        list_label: `App Version`,
        screen_name: `app_version`,
      },
      {
        list_label: `Logout`,
        screen_name: `logout`,
      },
      ...(user_details[0]?.user_type == 1
        ? [
            {
              list_label: `Deactivate Account`,
              screen_name: `deactivate_account`,
            },
          ]
        : []),
    ];

    const sidemenuArray = [
      {
        tab_name: "My Account",
        tab_icon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="20" viewBox="0 0 21 20" fill="none"><path d="M10.477 0a9.97 9.97 0 1 0 9.97 9.971A10 10 0 0 0 10.478 0m0 2.991a2.94 2.94 0 0 1 2.99 2.991 2.94 2.94 0 0 1-2.99 2.992 2.94 2.94 0 0 1-2.991-2.992 2.94 2.94 0 0 1 2.99-2.991m0 14.158a7.28 7.28 0 0 1-5.982-3.191c0-1.994 3.988-3.091 5.982-3.091s5.982 1.1 5.982 3.091a7.27 7.27 0 0 1-5.982 3.191" fill="#646464"/></svg>',
        tab_lists_data: myAccountList,
      },
      {
        tab_name: "Programs",
        tab_icon:
          '<svg width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.533 10.914a.58.58 0 0 1-.17-.413v-.213A1.84 1.84 0 0 1 18.2 8.45h.213a.584.584 0 0 1 .584.584v.213a1.84 1.84 0 0 1-1.838 1.838h-.213a.58.58 0 0 1-.413-.17" fill="#646464"/><path d="M19.018 11.61a2.98 2.98 0 0 1-1.859.644h-.213a1.753 1.753 0 0 1-1.753-1.752v-.213q0-.243.04-.483a2.3 2.3 0 0 0-.715-.5.583.583 0 1 0-.479 1.066 1.14 1.14 0 0 1 .657.861 3.4 3.4 0 0 0-2.85.206 3.37 3.37 0 0 0-1.682 3.32c0 .02.007.04.01.058a8.43 8.43 0 0 0 2.624 4.475l.255.228a1.645 1.645 0 0 0 2.13.058l.11-.087.111.09a1.646 1.646 0 0 0 2.127-.06l.256-.227a8.43 8.43 0 0 0 2.626-4.48c0-.02.008-.04.01-.059a3.36 3.36 0 0 0-1.405-3.146m-8.19-7.325h-7.01a.584.584 0 0 1-.563-.745A2.73 2.73 0 0 1 5.18 1.651V.584A.584.584 0 0 1 5.764 0H8.88a.584.584 0 0 1 .584.584v1.067A2.73 2.73 0 0 1 11.39 3.54a.585.585 0 0 1-.562.745z" fill="#646464"/><path d="M13.554 2.725h-1.22q.106.24.178.494a1.75 1.75 0 0 1-1.685 2.234h-7.01a1.753 1.753 0 0 1-1.685-2.234q.073-.254.18-.494H1.09a.584.584 0 0 0-.584.584v16.047a.584.584 0 0 0 .584.584h10.69a9.6 9.6 0 0 1-2.748-4.878 2 2 0 0 1-.03-.175 4.53 4.53 0 0 1 2.262-4.472c.394-.224.82-.386 1.263-.48a1.754 1.754 0 0 1 1.61-1.852V3.309a.584.584 0 0 0-.583-.584m-5.453 14.02H3.427a.584.584 0 1 1 0-1.167h4.674a.584.584 0 1 1 0 1.168m0-2.336H3.427a.584.584 0 1 1 0-1.168h4.674a.584.584 0 1 1 0 1.168m0-2.337H3.427a.584.584 0 1 1 0-1.168h4.674a.584.584 0 1 1 0 1.168m0-2.337H3.427a.584.584 0 1 1 0-1.168h4.674a.584.584 0 1 1 0 1.168m0-2.337H3.427a.584.584 0 1 1 0-1.168h4.674a.584.584 0 1 1 0 1.168m3.116 2.337h-.779a.584.584 0 0 1 0-1.168h.78a.584.584 0 1 1 0 1.168m0-2.337h-.779a.584.584 0 0 1 0-1.168h.78a.584.584 0 1 1 0 1.168" fill="#646464"/></svg>',
        tab_lists_data: programData,
      },
      {
        tab_name: "Menu",
        tab_icon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="20" viewBox="0 0 21 20" fill="none"><path d="M10.477 0a9.97 9.97 0 1 0 9.97 9.971A9.98 9.98 0 0 0 10.478 0m4.154 14.125H6.32a.83.83 0 1 1 0-1.662h8.31a.831.831 0 0 1 0 1.662m0-3.324H6.32a.831.831 0 0 1 0-1.662h8.31a.83.83 0 1 1 0 1.662m0-3.324H6.32a.831.831 0 0 1 0-1.662h8.31a.83.83 0 1 1 0 1.662" fill="#646464"/></svg>',
        tab_lists_data: menuList,
      },
      {
        tab_name: "My Settings",
        tab_icon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="20" viewBox="0 0 21 20" fill="none"><path d="M17.8811 9.84357C17.8991 9.51182 17.8622 9.17937 17.7721 8.85958L19.8501 7.21957C20.0691 7.11057 20.0691 6.78257 19.9591 6.56357L17.9911 3.17357C17.8821 2.95457 17.5541 2.84558 17.4441 2.95458L15.0381 3.93857C14.5428 3.53182 13.9902 3.20026 13.3981 2.95458L12.9611 0.439575C12.9534 0.326057 12.9047 0.219202 12.8242 0.138838C12.7436 0.0584738 12.6367 0.0100581 12.5231 0.00257503H8.58614C8.45591 -0.0106897 8.32567 0.0276495 8.22339 0.109358C8.12111 0.191067 8.05496 0.309627 8.03914 0.439575L7.71114 3.06457C7.12099 3.26618 6.56721 3.56164 6.07114 3.93957L3.55614 2.95458C3.33714 2.95458 3.11914 2.95457 3.00914 3.17357L1.04114 6.67257C0.822141 6.89157 0.932141 7.10957 1.15014 7.21957L3.23114 8.85958C3.14105 9.17937 3.10423 9.51182 3.12214 9.84357C3.10423 10.1753 3.14105 10.5078 3.23114 10.8276L1.15114 12.4686C0.932141 12.5776 0.932141 12.7966 1.04214 13.0156L3.00914 16.4026C3.11814 16.6216 3.44614 16.7306 3.55614 16.6216L5.96214 15.6376C6.45752 16.0443 7.01012 16.3759 7.60214 16.6216L7.93114 19.2476C7.93886 19.3609 7.98737 19.4677 8.06772 19.548C8.14806 19.6283 8.25478 19.6769 8.36814 19.6846H12.3041C12.4175 19.6769 12.5242 19.6283 12.6046 19.548C12.6849 19.4677 12.7334 19.3609 12.7411 19.2476L13.0691 16.6236C13.6735 16.4031 14.2302 16.0691 14.7091 15.6396L17.1151 16.6236C17.1651 16.6475 17.2195 16.6608 17.2748 16.6627C17.3302 16.6645 17.3853 16.6548 17.4367 16.6342C17.4882 16.6136 17.5348 16.5826 17.5736 16.5431C17.6124 16.5035 17.6425 16.4564 17.6621 16.4046L19.6301 13.0146C19.6924 12.91 19.7157 12.7867 19.6957 12.6666C19.6758 12.5465 19.6139 12.4374 19.5211 12.3586L17.4431 10.7186C17.6027 10.6418 17.7323 10.5142 17.8115 10.3558C17.8908 10.1975 17.9153 10.0173 17.8811 9.84357ZM10.5551 13.2336C9.66627 13.2183 8.81897 12.8545 8.19577 12.2205C7.57258 11.5865 7.22336 10.7331 7.22336 9.84408C7.22336 8.95508 7.57258 8.10165 8.19577 7.46766C8.81897 6.83366 9.66627 6.46984 10.5551 6.45457C11.4647 6.45413 12.3386 6.80774 12.9919 7.44051C13.6452 8.07328 14.0266 8.93551 14.0551 9.84457C14.0263 10.7536 13.6447 11.6158 12.9912 12.2483C12.3377 12.8809 11.4647 13.2343 10.5551 13.2336Z" fill="#646464"/></svg>',
        tab_lists_data: settingsList,
      },
    ];

    let program_status = ``;
    if (user_details[0]?.program_status == 1) {
      program_status = `Active`;
    } else if (user_details[0]?.program_status == 2) {
      program_status = `Paused`;
    } else if (user_details[0]?.program_status == 3) {
      program_status = `Completed`;
    } else if (user_details[0]?.program_status == 4) {
      program_status = `Advance Program`;
    } else {
      program_status = `Default`;
    }

    return res.status(201).json({
      status: true,
      message: `Recipe Chapter List fetched Successfully.`,
      data: sidemenuArray,
      program_name: (user_details[0]?.program_name
        ? String(user_details[0].program_name)
        : ``
      )
        .replace(/client\s+exclusive\s+advanced/i, ``)
        .replace(/\([^()]*\)/g, ``)
        .trim(),
      program_status: program_status,
      current_sessions: user_details[0]?.sent_sessions,
      action_type:
        user_details[0]?.program_sessions <= 3 &&
        user_details[0]?.client_advance_program_count === 0
          ? `upgrade`
          : null,
    });
  } catch (error) {
    console.log(error);
    return res.status(404).json({ message: error.message });
  }
};

export const appHomePage = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const app_version = req.headers.app_version;
    const { results: loginLogs } = await readRecord({
      selectFields: ["*"],
      table: `${tables.loginLogs} ll`,
      conditions: [
        { field: `ll.user_id`, operator: `=`, value: user_id },
        {
          field: "DATE(ll.added_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
    });
    if (loginLogs.length === 0) {
      const insertResult = await insertRecord(
        tables.loginLogs,
        ["user_id"],
        [user_id],
      );
    }
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `ud.user_id`,
        `ud.email_id`,
        `ud.latest_weight`,
        `ud.birth_date as dob`,
        `ud.user_status`,
        "ud.my_wallet",
        "ud.country_id",
        "ud.old_wallet",
        `ud.sub_user_status`,
        "ud.user_type",
        `dsl.diet_sent_date`,
        `dsl.diet_start_date`,
        `DATE_ADD(dsl.diet_start_date, INTERVAL 10 DAY) AS diet_start_date_plus_10`,
        `DATE_ADD(dsl.diet_start_date, INTERVAL 5 DAY) AS diet_start_date_plus_5`,
        `dsl.diet_status`,
        `dsl.start_session_weight`,
        `dsl.end_session_weight`,
        'dsl.mid_session_weight',
        `dsl.diet_details_id`,
        `dsl.diet_start_date_set_by`,
        `sop.sent_sessions`,
        `sop.expiry_date`,
        `sop.total_sessions`,
        `sop.pending_session`,
        `sop.start_program_weight`,
        `sop.end_program_weight`,
        `sop.balance_amount`,
        `sop.program_id`,
        `ir.days`,
        `ir.chest`,
        `ir.waist`,
        `ir.hips`,
        `pr.photo_id`,
        `ir.posted_date as inch_posted_date`,
        `wr.days as weight_days`,
        `wr.weight as weight`,
        `pm.program_name`,
        `ps.program_sessions`,
        `sop.due_date as balance_due_date`,
        `wr.posted_date as weight_posted_date`,
        `ad.first_name as mentor_name`,
        `ad.official_phone as mentor_phone`,
        `htf.added_date as half_time_feedback_posted_date`,
        `pf.added_date as program_feedback_posted_date`,
        `(SELECT pv.page_type FROM ${tables.inAppPageVisitLog} pv WHERE pv.user_id = ud.user_id ORDER BY pv.visit_date DESC LIMIT 1) AS pv_type`,
        `(SELECT pv.visit_date FROM ${tables.inAppPageVisitLog} pv WHERE pv.user_id = ud.user_id ORDER BY pv.visit_date DESC LIMIT 1) AS pv_date`,
        `(SELECT cu.call_type FROM ${tables.callUpdates} cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_type`,
        `(SELECT cu.user_id FROM ${tables.callUpdates} cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_user_id`,
        `(SELECT cu.call_status FROM ${tables.callUpdates} cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_status`,
        `(SELECT cu.schedule_date FROM ${tables.callUpdates} cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) AS call_schedule_date`,
        `(SELECT s.appointment_slots FROM bn_book_appointment_slots_mentor s WHERE s.id = (SELECT cu.slot_id FROM call_updates cu WHERE cu.user_id = ud.user_id AND cu.sub_order_id = ud.active_order_id ORDER BY cu.schedule_date DESC LIMIT 1) LIMIT 1) AS appointment_slot`,
        `(SELECT hs.created FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id AND hs.sub_order_id = sop.sub_order_id ORDER BY hs.created DESC LIMIT 1) AS hs_created_at`,
        `(SELECT hs.type FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id AND hs.sub_order_id = sop.sub_order_id ORDER BY hs.created DESC LIMIT 1) AS hs_type`,
        `(SELECT hs.ideal_weight FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id AND hs.sub_order_id = sop.sub_order_id ORDER BY hs.created DESC LIMIT 1) AS hs_ideal_weight`,
        `(SELECT hs.ideal_bmi FROM ${tables.healthScoreClient} hs WHERE hs.user_id = ud.user_id AND hs.sub_order_id = sop.sub_order_id ORDER BY hs.created DESC LIMIT 1) AS hs_ideal_bmi`,
        `(SELECT COUNT(sop2.sub_order_id) FROM ${tables.subOrderPrograms} sop2 WHERE sop2.user_id = ${user_id} AND sop2.program_type = 0 AND sop2.program_status = 4) AS advance_program_count`,
        `(SELECT ofr.start_date FROM ${tables.offersNew} ofr WHERE ofr.is_active = 1 ORDER BY ofr.start_date DESC LIMIT 1) AS offer_start_date`,
        `(SELECT ofr.end_date FROM ${tables.offersNew} ofr WHERE ofr.is_active = 1 ORDER BY ofr.end_date DESC LIMIT 1) AS offer_end_date`,
        `(SELECT sop_new.start_date FROM ${tables.subOrderPrograms} sop_new WHERE sop_new.program_status = 4 AND sop_new.user_id = ud.user_id ORDER BY sop_new.start_date DESC LIMIT 1) AS advance_program_start_date`,
        `(SELECT sop_new.start_date_added_by FROM ${tables.subOrderPrograms} sop_new WHERE sop_new.program_status = 4 AND sop_new.user_id = ud.user_id ORDER BY sop_new.start_date DESC LIMIT 1) AS advance_program_start_date_added_by`,
        `dsl.diet_details_id as diet_id`,
        `ff.id as final_feedback_id`,
        `ohc.start_date as onhold_start_date`,
        `ohc.end_date as onhold_end_date`,
        `ud.active_maintenance_id`,
        `ud.guides`,
        `ass.completion_status as assessment_completion_status`,
        `icl.completion_status as icl_completion_status`,
        `goal.comment`,
        "ud.active_order_id",
        `(SELECT wmr.posted_date FROM ${tables.weightRecords} wmr WHERE  sop.sub_order_id = wmr.sub_order_id AND ud.user_id = wmr.user_id ORDER BY wmr_id LIMIT 1) as weight_update_date`,
        `(SELECT cu.user_id FROM ${tables.callUpdates} cu WHERE dsl.user_id = cu.user_id AND cu.sub_order_id = dsl.sub_order_id AND cu.call_type = '0' ORDER BY cu.schedule_date DESC LIMIT 1) AS welcome_call`,
        `(SELECT COUNT(*) > 0 FROM ${tables.productOrders} po WHERE po.user_id = ud.user_id AND po.brand = 'doctorstore' AND po.product_id = 'bn-bodyscan-smart-scale' AND po.status = 'Delivered') AS scale_purchased`,
      ],
      joins: [
        {
          type: `LEFT`,
          table: `${tables.subOrderPrograms} sop`,
          on: `sop.sub_order_id = ud.active_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.dietSessionLog} dsl`,
          on: `dsl.user_id = ud.user_id AND dsl.sub_order_id = sop.sub_order_id AND dsl.session = sop.sent_sessions and dsl.diet_status=4`,
        },
        {
          type: `LEFT`,
          table: `${tables.inchRecords} ir`,
          on: `sop.sub_order_id = ir.sub_order_id AND ud.user_id = ir.user_id AND ir.session = sop.sent_sessions`,
        },
        {
          type: `LEFT`,
          table: `${tables.weightRecords} wr`,
          on: `sop.sub_order_id = wr.sub_order_id AND ud.user_id = wr.user_id AND wr.session = sop.sent_sessions`,
        },
        {
          type: `LEFT`,
          table: `${tables.photoRecords} pr`,
          on: `sop.sub_order_id = pr.sub_order_id AND ud.user_id = pr.user_id AND pr.session = sop.sent_sessions`,
        },
        {
          type: `LEFT`,
          table: `${tables.programsMaster} pm`,
          on: `sop.program_id = pm.program_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.programSession} ps`,
          on: `sop.program_session_id = ps.program_session_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.halfTimeFeedback} htf`,
          on: `sop.sub_order_id = htf.sub_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.finalFeedback} pf`,
          on: `sop.sub_order_id = pf.sub_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.adminUsers} ad`,
          on: `ad.admin_user_id = ud.mentor_assigned`,
        },
        {
          type: `LEFT`,
          table: `${tables.finalFeedback} ff`,
          on: `ff.sub_order_id = sop.sub_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.assessment} ass`,
          on: `ass.user_id = ud.user_id AND ud.active_order_id = ass.active_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.ingredientChecklistRecords} icl`,
          on: `icl.user_id = ud.user_id AND ud.active_order_id = icl.active_order_id`,
        },
        {
          type: "LEFT",
          table: `${tables.onholdClients} ohc`,
          on: `ohc.user_id = ud.user_id 
                AND ohc.sub_order_id = ud.active_order_id 
                AND ohc.session = sop.sent_sessions 
                AND ohc.id = (
                    SELECT MAX(id)
                    FROM ${tables.onholdClients}
                    WHERE user_id = ohc.user_id
                )`,
        },
        {
          type: `LEFT`,
          table: `${tables.bnMyGoalsNew} goal`,
          on: `ud.active_order_id = goal.sub_order_id`,
        },
      ],
      conditions: [
        {
          field: `ud.user_id`,
          operator: `=`,
          value: user_id,
        },
      ],
    });

    if (results.length === 0) {
      return next(new ErrorHandler(`User Not Found`, 404));
    }

    const userDetails = results[0];
    // console.log(userDetails);

    let ocScreenData;
    if (userDetails.user_status === `Completed`) {
      const { data } = await ocHomePage({ userDetails });
      ocScreenData = data;
    }
    const { upperSection } = await homePageUpperSection({ userDetails });
    console.log({upperSection}); 
    const { lowerSection } = await homePageLowerSection({ userDetails });
    const middle_section = await homePageMiddleSection({
      userDetails,
      app_version,
    });

    let show_goal = false;
    if (
      userDetails?.total_sessions === 3 &&
      userDetails?.pending_session === 1
    ) {
      show_goal = true;
    } else if (
      (userDetails?.total_sessions === 6 ||
        userDetails?.total_sessions === 9 ||
        userDetails?.total_sessions === 12) &&
      userDetails?.pending_session <= 3
    ) {
      show_goal = true;
    }
    const notifications = await fetchNotification({ user_id });
    const quickFillerToday = await getQuickFillerNotification(user_id, {
      onlyToday: true,
      isIndiaClient: userDetails?.country_id == 101,
    });
    // quickFillerToday is [] or [oneItem]
    notifications.push(...(quickFillerToday || []));

    // console.log(offerDetails, 709);
    // console.log(userDetails, 710);
    const { offer_details, marquee_text } = await getOfferAndMarqueeData({
      userDetails,
      image_guide_base_url,
    });
    const scalePurchased = Boolean(userDetails?.scale_purchased); 
    const isIndian  = userDetails?.country_id==101; 
    const todayDate = new Date().getDate();
    const videoIndex  = todayDate % marketingVideoUrls.length; 
    return res.status(200).json({
      status: true,
      data: {
        offer_details,
        marquee_text,
        ...(isIndian && {marketing_video: {
          video_url:
            !scalePurchased ? 'https://res.cloudinary.com/dg4wzx8c8/video/upload/v1771571558/BN_bodyscan_Machine_jpbdke.mp4' : marketingVideoUrls[videoIndex]?.video_link,
          orientation: 'portrait',
          button: {
            title: 'Shop Now!',
            screen_name: 'redirect_url',
            screen_params: {
              url:  !scalePurchased ? 'https://www.balancenutrition.in/shop/bn-bodyscan-smart-scale' : marketingVideoUrls[videoIndex]?.product_link ,
            },
          },
        }}),
        ...(userDetails.user_status === `Completed`
          ? ocScreenData
          : {
              upper_section: upperSection,
              trackers_and_ekit_section: middle_section,
              lower_section: lowerSection,
              show_goal,
              notifications,
            }),
        clara_sticky_section: {
          description: `Mentor ${userDetails.mentor_name} is currently unavailable. Please direct your queries to Mentor Clara.`,
          redirect_screen: "mentor_clara",
          show_clara:
            moment().day() === 0 ||
            moment().isSameOrAfter(moment().startOf("day").hour(19)) ||
            moment().isBefore(moment().startOf("day").hour(10)),
        },
      },
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(`Internal Server Error`));
  }
};

// Rotating 14-day Quick Filler notifications (no timezone)
async function getQuickFillerNotification(
  user_id,
  { onlyToday = false, useTable = true, isIndiaClient = false } = {},
) {
  const today = moment().startOf("day");
  const todayStr = today.format("YYYY-MM-DD");

  // --- BASE QUICK FILLER NOTIFICATIONS ---
  const templates = [
    {
      title: "Craving something tasty & gluten-free?",
      desc: "Your Quick Filler Guide has approved options under 150 calories. Log them in.",
      time: "16:00",
    },
    {
      title: "Had chai, coffee, or chaas today?",
      desc: "A quick log in your Quick Filler Guide keeps your drinks accounted for.",
      time: "16:00",
    },
    {
      title: "Craving ice cream today?",
      desc: "Your Quick Filler Guide has options under 150 calories; log it if you had one.",
      time: "22:00",
    },
    {
      title: "Snacked on something protein-rich?",
      desc: "Check if it’s in your Quick Filler Guide and log it to keep your tracker complete.",
      time: "16:00",
    },
    {
      title: "Guilt-free sweets are part of your plan!",
      desc: "If you had any mithai today, just record it in your Quick Filler Guide.",
      time: "16:00",
    },
    {
      title: "Almonds, cashews, or raisins today?",
      desc: "Log your dried fruit munch in the Quick Filler Guide so your tracker stays precise.",
      time: "16:00",
    },
    {
      title: "Did you know your guide has vegan fillers too?",
      desc: "If you picked one today, don’t forget to record it; every bite counts.",
      time: "16:00",
    },
    {
      title: "Gave in to a chocolate craving?",
      desc: "Don’t worry, just record it in your Quick Filler Guide to stay on track.",
      time: "23:00",
    },
    {
      title: "Enjoyed a light or low-fat snack?",
      desc: "Add it to your Quick Filler Guide so your calorie count stays accurate.",
      time: "16:00",
    },
    {
      title: "Couldn’t resist a sweet bite?",
      desc: "If it was mithai or dessert, add it to your Quick Filler Guide so your tracker stays accurate.",
      time: "21:00",
    },
    {
      title: "Evening cravings satisfied?",
      desc: "If you had namkeen or other munchies, update your Quick Filler Guide before the day ends.",
      time: "16:00",
    },
    {
      title: "Reached out for namkeen or chips?",
      desc: "Update it in your Quick Filler Guide, even small munches matter.",
      time: "16:00",
    },
    {
      title: "Picked a fat-free or lighter filler today?",
      desc: "Don’t forget to mark it in your Quick Filler Guide — small details add up.",
      time: "16:00",
    },
    {
      title: "Whether it’s gluten-free, vegan or low-fat…",
      desc: "Your Quick Filler Guide covers it all. Log what you’ve had today and keep your progress in check.",
      time: "16:00",
    },
  ];

  // --- INDIA-ONLY SNACK NOTIFICATIONS ---
  const indiaSnackTemplates = [
    {
      title: "Your New Evening Snack!",
      desc: "Low-calorie, high-protein & fits your plan.",
      time: "16:00",
      redirect_id: "https://balancenutrition.in/shop/baked-nippat",
    },
    {
      title: "Non-Fried Makhana Chips!",
      desc: "Crispy, flavourful, and the smarter way to curb evening cravings.",
      time: "16:00",
      redirect_id: "https://balancenutrition.in/shop/makhana-chips",
    },
    {
      title: "Craving Chocolate Cookies?",
      desc: "Then try our 0 sugar, no maida, healthy ones!",
      time: "20:00",
      redirect_id: "https://balancenutrition.in/shop/dessert-cookies-chocolate",
    },
  ];

  // --- ROTATION ANCHOR ---
  let anchor = today.clone();
  if (useTable) {
    try {
      const { results } = await readRecord({
        table: `${tables.userDetails}`,
        selectFields: [
          "quick_filler_anchor_date",
          "quick_filler_enroll_date",
          "quick_filler_created_at",
        ],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
        limit: 1,
      });
      if (results && results.length) {
        const r = results[0];
        const anchorStr =
          r.quick_filler_anchor_date ||
          r.quick_filler_enroll_date ||
          r.quick_filler_created_at ||
          null;
        if (anchorStr) {
          const a = moment(anchorStr, [
            "YYYY-MM-DD",
            "YYYY-MM-DD HH:mm:ss",
            moment.ISO_8601,
          ]);
          if (a.isValid()) anchor = a.startOf("day");
        }
      }
    } catch (e) {
      // fallback silently
    }
  }

  let daysSinceStart = today.diff(anchor, "days");
  if (daysSinceStart === 0) {
    const hash = simpleHash(String(user_id));
    daysSinceStart = hash % templates.length;
  } else if (daysSinceStart < 0) {
    daysSinceStart = 0;
  }

  const totalDays = 14;
  const baseRotation = templates.length;
  const snackRotation = indiaSnackTemplates.length;

  const list = Array.from({ length: totalDays }, (_, i) => {
    const dateStr = today.clone().add(i, "days").format("YYYY-MM-DD");

    // --- INDIA SNACK ROTATION (every ~5 days) ---
    if (isIndiaClient && i % 5 === 0) {
      const idx = (daysSinceStart + i) % snackRotation;
      const t = indiaSnackTemplates[idx];
      return {
        type: "quick_filler_snack",
        notification_date: dateStr,
        notification_time: t.time,
        title: t.title,
        description: t.desc,
        redirect: "redirect_url",
        redirect_id: t.redirect_id,
        screen_title: "BN Shop - Healthy Snacks",
        send_notification: dateStr === todayStr,
      };
    }

    // --- DEFAULT QUICK FILLER ---
    const idx = (daysSinceStart + i) % baseRotation;
    const t = templates[idx];
    return {
      type: "quick_filler",
      notification_date: dateStr,
      notification_time: t.time,
      title: t.title,
      description: t.desc,
      redirect: "quick_filler_guide",
      redirect_id: 400,
      screen_title: "Quick Fillers",
      send_notification: dateStr === todayStr,
    };
  });

  return onlyToday ? list.filter((n) => n.send_notification) : list;
}

// Tiny stable hash for fallback rotation (no external deps)
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const getOfferAndMarqueeData = async ({
  userDetails,
  image_guide_base_url,
}) => {
  const { results: offerDetails } = await readRecord({
    table: `${tables.offersNew} ofn`,
    selectFields: [
      `ofn.id as offer_id`,
      `ofn.offer_title`,
      `ofn.offer_description`,
      `ofn.offer_banners`,
      `ofn.redirect_page`,
      `ofn.redirect_id`,
      `ofn.offer_marquee`,
      `ofn.button_1`,
      `ofn.button_1_redirect`,
      `ofn.button_1_redirect_id`,
      `ofn.button_2`,
      `ofn.button_2_redirect`,
      `ofn.button_2_redirect_id`,
    ],
    conditions: [
      { field: `ofn.is_active`, operator: `=`, value: 1 },
      { field: `ofn.offer_for`, operator: `=`, value: 0 },
    ],
  });

  const offer = offerDetails?.[0];

  // helpers
  const inr = (n) => {
    const num = Number(n ?? 0);
    return `Rs.${num.toLocaleString("en-IN")}`;
  };
  const replaceWalletValues = (text) =>
    text
      ?.replace(`{{my_wallet}}`, userDetails.my_wallet ?? 0)
      ?.replace(`{{old_wallet}}`, userDetails.old_wallet ?? 0) || ``;

  let showWalletCreditOffer = false;

  // if (
  //   userDetails.old_wallet <2000 &&
  //   userDetails.my_wallet > 8000 &&
  //   userDetails.user_status == "Active"
  // ) {
  //   showWalletCreditOffer = true;
  // }

  // Base (fallback) payload from offers table
  const basePayload = showWalletCreditOffer
    ? {
        offer_details: {
          // Your modified offer_details for showWalletDebitOffer=true
          offer_id: "",
          offer_title: `BN Wallet Credited Back! 💡`,
          offer_description: `Use your BN Wallet balance + in-app offers before 31st January`,
          offer_image: [
            {
                file: {
                  path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
                  name: `percent_image`,
                  type: `image/jpeg`,
                },
              },
          ],
          offer_button1: "Know More",
          offer_button1_redirect_screen: "bn_wallet_statement",
          offer_button1_screen_params: {
            redirect_id: 0,
          },
          offer_mentor_autotext: "",
          offer_client_autotext: "",
        },
        marquee_text: {
          marquee_color: `#03989F`,
          text: `Your BN Wallet is Credited Back & has Rs. ${inr(Number(userDetails.my_wallet) - Number(userDetails.old_wallet))}! Click here to use it ASAP.  `,
          redirect_page: "bn_wallet_statement",
          params: { redirect_id: 0 },
        },
      }
    : offer
      ? {
          offer_details: {
            // Original offer_details
            offer_id: offer.offer_id || "",
            offer_title: replaceWalletValues(offer.offer_title),
            offer_description: replaceWalletValues(offer.offer_description),
            offer_image: [
              {
                file: {
                  path: `https://${image_guide_base_url}/images/app_images/percentage.png`,
                  name: `percent_image`,
                  type: `image/jpeg`,
                },
              },
            ],
            offer_button1: offer.button_1 || `Know More`,
            offer_button2: offer.button_2 || `Not Now`,
            offer_button1_redirect_screen:
              offer.button_1_redirect || `mentor_chat`,
            offer_button1_screen_params: {
              redirect_id: offer.button_1_redirect_id || 0,
            },
            offer_button2_redirect_screen:
              offer.button_2_redirect || `close_popup`,
            offer_button2_screen_params: {
              redirect_id: offer.button_2_redirect_id || 0,
            },
            offer_mentor_autotext: "",
            offer_client_autotext: "",
          },
          marquee_text: {
            marquee_color: `#03989F`,
            text: replaceWalletValues(offer.offer_marquee),
            redirect_page: offer.redirect_page,
            params: { redirect_id: offer.redirect_id },
          },
        }
      : {
          offer_details: {},
          marquee_text: {},
        };

  // 🔸 Override for ACTIVE users (per Vikram’s copy)
  // if (String(userDetails?.user_status).toLowerCase() === "active" && userDetails?.my_wallet > 8000 ) {
  // if (userDetails?.old_wallet > 10000) {
  //   const debited = inr(userDetails?.old_wallet - 1000);
  //   const balance = inr(userDetails?.my_wallet);

  //   basePayload.offer_details = {
  //     ...basePayload.offer_details,
  //     // Popup
  //     offer_title: `${debited} Debited from your BN Wallet! 💡`,
  //     offer_description: `As per company policies, your BN Wallet was debited & your current balance is ${balance} ☹️`,
  //     offer_button1: `Know more`,
  //     offer_button2: `Not Now`,
  //     offer_button1_redirect_screen: `mentor_chat`,
  //     offer_button1_screen_params: {},
  //     offer_button2_redirect_screen: `close_popup`,
  //     offer_button2_screen_params: { redirect_id: 0 },
  //   };

  //   basePayload.marquee_text = {
  //     marquee_color: `#03989F`,
  //     // Marquee
  //     // text: `${debited} is debited from your BN Wallet according to company policies. Your current wallet balance is ${balance}`,
  //     // text:`Due to Multiple Requests from Clients, we have re-credited your BN Wallet with ${balance} that was deducted recently. Check your New Balance here`,
  //     // text:`Rs.${userDetails?.my_wallet} in your Wallet becoming Rs.0 soon. Contact your mentor & use it before it expires. Click here to book a call`,
  //     text: `${debited} is debited from your BN Wallet according to company policies. Your current wallet balance is ${balance}`,
  //     redirect_page: `new_extra_call`,
  //     params: { call_type: 45 },
  //   };
  // }

  // if (Number(userDetails.country_id) === 101) {
  //   basePayload.offer_details = {
  //     ...basePayload.offer_details,
  //     // Popup
  //     offer_title: `Rates Increasing Soon!`,
  //     offer_description: `Get your next Program at the Lowest Rates alongwith a Free BN-Healthy Food Hamper worth Rs.1999`,
  //     offer_button1: `Know More`,
  //     offer_button2: `Not Now`,
  //     offer_button1_redirect_screen: `program`,
  //     offer_button1_screen_params: { redirect_id: "134" },
  //     offer_button2_redirect_screen: `close_popup`,
  //     offer_button2_screen_params: { redirect_id: "0" },
  //   };

  //   basePayload.marquee_text = {
  //     marquee_color: `#03989F`,
  //     text: "<p>Rates Increasing! Get your next program at the lowest rates + get a FREE BN-Healthy Food Hamper delivered home :)</p>",

  //     redirect_page: `program`,
  //     params: { redirect_id: "134" },
  //   };
  // }
  // else {
  //   basePayload.offer_details = {
  //     ...basePayload.offer_details,
  //     offer_title: `Rates Increasing Soon!`,
  //     offer_description: `Get your next Program at the Lowest Rates alongwith a Free Gut-Reset Detox Diet worth Rs.1999`,
  //     offer_button1: `Know More`,
  //     offer_button2: `Not Now`,
  //     // offer_button1_redirect_screen: `redirect_url`,
  //     // offer_button1_screen_params: {
  //     //   redirect_id: `https://wa.me/91${
  //     //     userDetails.mentor_phone
  //     //   }?text=${encodeURIComponent(
  //     //     `Hi, I want to know about the lowest rate offers. My email address is ${userDetails.email_id}`
  //     //   )}`,
  //     // },
  //     offer_button1_redirect_screen: `program`,
  //     offer_button1_screen_params: { redirect_id: "134" },
  //     offer_button2_redirect_screen: `close_popup`,
  //     offer_button2_screen_params: { redirect_id: "0" },
  //   };

  //   basePayload.marquee_text = {
  //     marquee_color: `#03989F`,
  //     text: "Rates Increasing! Get your next program at the lowest rates + get a FREE BN Gut Reset Diet worth Rs.1999 :)",

  //     redirect_page: `program`,
  //     params: { redirect_id: "134" },
  //   };
  // }

 
    // if (userDetails.country_id==101) {
    //     basePayload.offer_details = {
    //           ...basePayload.offer_details,
    //       // Popup
    //       offer_title: `Get the BN BodyScan Scale FREE!`,
    //       offer_description: `Get your next 60 or 90-day program at a flat 55% off & get BN Smart Scale worth Rs.3999 at Rs.0`,
    //       offer_button1: `Know More`,
    //       offer_button2: `Not Now`,
    //       offer_button1_redirect_screen: `redirect_url`,
    //       offer_button1_screen_params: {redirect_id: `https://wa.me/91${userDetails.mentor_phone}?text=${encodeURIComponent(
    //       `I want to know more about the BN BodyScan Smart Scale & want it free :). My email address is ${userDetails.email_id}`
    //     )}`},
    //       offer_button2_redirect_screen: `close_popup`,
    //       offer_button2_screen_params: { redirect_id: 0 },
    //     };
      
    //     basePayload.marquee_text = {
    //       marquee_color: `#03989F`,
    //       text: "<p>Get flat 55% off on 60 & 90-day programs + BN BodyScan scale worth Rs.3999 FREE. Offer Ends Soon.Ask your mentor for details.</p>",
          
    //       redirect_page: `redirect_url`,
    //       params: {redirect_id: `https://wa.me/91${userDetails.mentor_phone}?text=${encodeURIComponent(
    //       `I want to know more about the BN BodyScan Smart Scale & want it free :). My email address is ${userDetails.email_id}`
    //     )}`}
    //     };
    //   basePayload.offer_details = {
    //   ...basePayload.offer_details,
    //   // Popup
    //   offer_title: `High Protein Mango Milkshake`,
    //   offer_description: `Try our limited edition, high-protein, ready-to-drink mango shake.`,
    //   offer_button1: `Know More`,
    //   offer_button2: `Not Now`,
    //   offer_button1_redirect_screen: `redirect_url`,
    //   offer_button1_screen_params: { redirect_id: "https://balancenutrition.in/shop/bn-Mango-whey-protein-isolate" },
    //   offer_button2_redirect_screen: `close_popup`,
    //   offer_button2_screen_params: { redirect_id: "0" },
    // };

    //  basePayload.marquee_text = {
    //     marquee_color: `#03989F`,
    //     text: "<p>Have you met Clara? Your Mentor is Away.. But she has appointed mentor Clara for you :)  Click here to check.</p>",
    
    //     redirect_page: `redirect_url`,
    //     params: { redirect_id: "https://www.balancenutrition.in/app_link/screen_id=401" },
    //   };
    //   }   
    // else {
      
    //   basePayload.offer_details = {
    //         ...basePayload.offer_details,
    //     // Popup
    //     offer_title: `Lowest Rates 2026!`,
    //     offer_description: `Get your next 60 or 90-day program at a flat 60% off. The lowest rates ever!`,
    //     offer_button1: `Know More`,
    //     offer_button2: `Not Now`,
    //     offer_button1_redirect_screen: `program`,
    //     offer_button1_screen_params: {redirect_id: "163"},
    //     offer_button2_redirect_screen: `close_popup`,
    //     offer_button2_screen_params: { redirect_id: "0" },
    //   };
    
    //   basePayload.marquee_text = {
    //     marquee_color: `#03989F`,
    //     text: "<p>Get a flat 60% off on all programs, which is the lowest rate ever for our clients. Comes just once every year.Ask your mentor for details.</p>",
    
    //     redirect_page: `program`,
    //     params: { redirect_id: "163" },
    //   };

    //    basePayload.offer_details = {
    //   ...basePayload.offer_details,
    //   // Popup
    //   offer_title: `Puberty to Menopause - Why One Diet Never Works`,
    //   offer_description: `Watch the full podcast now👇`,
    //   offer_button1: `Know More`,
    //   offer_button2: `Not Now`,
    //   offer_button1_redirect_screen: `redirect_url`,
    //   offer_button1_screen_params: { redirect_id: "https://youtu.be/h0MG1Y2gZJw?si=n-u7MzoLr1BEiFMl" },
    //   offer_button2_redirect_screen: `close_popup`,
    //   offer_button2_screen_params: { redirect_id: "0" },
    // };
    //   basePayload.marquee_text = {
    //     marquee_color: `#03989F`,
    //     text: "<p>Have you met Clara? Your Mentor is Away.. But she has appointed mentor Clara for you :)  Click here to check.</p>",
    
    //     redirect_page: `redirect_url`,
    //     params: { redirect_id: "https://www.balancenutrition.in/app_link/screen_id=401" },
    //   };
    // }

  return basePayload;
};

const homePageUpperSection = async ({ userDetails }) => {
  const scalePurchased = Boolean(userDetails.scale_purchased); 
  const isIndian =  Boolean(userDetails?.country_id==101); 
  console.log(scalePurchased, 'scalePurchased')
  try {
    const STATUSES = {
      ON_HOLD: `Onhold`,
      DROPOUT: `dropout`,
    };
    const CALL_STATUSES = {
      UNANSWERED: 4, // Call was not answered
      DONE: 1, // Call completed
      PENDING: 0, // Call not yet booked
    };
    const PV_TYPES = {
      CHECKOUT: 2, // Checkout-related
      PROGRAM: 1, // Program-related
    };
    const IMAGE_URLS = {
      MAINTAINENC_LIST: `https://${image_guide_base_url}/bn-api-new/images/upper_section/checklist.png`,
      DIET_LIST: `https://${image_guide_base_url}/bn-api-new/images/upper_section/diet_list.png`,
      CLIENT_SERVICES: `https://${image_guide_base_url}/bn-api-new/images/upper_section/client_services.png`,
      MENTOR_CHAT: `https://${image_guide_base_url}/bn-api-new/images/upper_section/mentor_chat.png`,
      BOOK: `https://${image_guide_base_url}/bn-api-new/images/upper_section/book.png`,
      WEIGHT_TRACKER: `https://${image_guide_base_url}/bn-api-new/images/upper_section/weight_tracker2.png`,
      INCH_TRACKER: `https://${image_guide_base_url}/bn-api-new/images/upper_section/inch_tracker.png`,
      SET_DATE: `https://${image_guide_base_url}/bn-api-new/images/upper_section/set_date.png`,
      CALL_MISSED: `https://${image_guide_base_url}/bn-api-new/images/upper_section/call_missed.png`,
      PROGRESS: `https://${image_guide_base_url}/bn-api-new/images/upper_section/progress.png`,
      SUGGESTED_PROGRAM: `https://${image_guide_base_url}/bn-api-new/images/upper_section/suggested_program.png`,
    };

    if (!userDetails || typeof userDetails !== `object`) {
      throw new Error(`Invalid userDetails provided`);
    }

    const createResponse = (data) => new appUpperSectionResponse(data);

    const currentDate = moment().format(`YYYY-MM-DD`);

    const callScheduleDate = userDetails.call_schedule_date
      ? moment(userDetails.call_schedule_date).format(`YYYY-MM-DD`)
      : null;
    const dietSentDate = userDetails.diet_sent_date
      ? moment(userDetails.diet_sent_date).format(`YYYY-MM-DD`)
      : null;
    const dob = userDetails.dob
      ? moment(userDetails.dob).format(`YYYY-MM-DD`)
      : null;
    const offerStartDate = userDetails.offer_start_date
      ? moment(userDetails.offer_start_date).format(`YYYY-MM-DD`)
      : null;
    const offerEndDate = userDetails.offer_end_date
      ? moment(userDetails.offer_end_date).format(`YYYY-MM-DD`)
      : null;
    const pvDate = userDetails.pv_date
      ? moment(userDetails.pv_date).format(`YYYY-MM-DD`)
      : null;
    const expiryDate = userDetails.expiry_date
      ? moment(userDetails.expiry_date).format(`YYYY-MM-DD`)
      : null;
    const dietStartDate = userDetails.diet_start_date
      ? moment(userDetails.diet_start_date).format(`YYYY-MM-DD`)
      : null;
    const advanceProgramStartDate = userDetails.advance_program_start_date
      ? moment(userDetails.advance_program_start_date).format(`YYYY-MM-DD`)
      : null;
    const onholdEndDate = userDetails.onhold_end_date
      ? moment(userDetails.onhold_end_date).format(`YYYY-MM-DD`)
      : null;
    const balanceDueDate = userDetails.balance_due_date
      ? moment(userDetails.balance_due_date).format(`YYYY-MM-DD`)
      : null;
    const weightPostedDate = userDetails.weight_posted_date
      ? moment(userDetails.weight_posted_date).format(`YYYY-MM-DD`)
      : null;
    const weightUpdateDate = userDetails.weight_update_date
      ? moment(userDetails.weight_update_date).format(`YYYY-MM-DD`)
      : null;

    const inchPostedDate = userDetails.inch_posted_date
      ? moment(userDetails.inch_posted_date).format(`YYYY-MM-DD`)
      : null;
    const halfTimeFeedbackPostedDate =
      userDetails.half_time_feedback_posted_date
        ? moment(userDetails.half_time_feedback_posted_date).format(
            `YYYY-MM-DD`,
          )
        : null;
    const hsCreatedAt = userDetails.hs_created_at
      ? moment(userDetails.hs_created_at).format(`YYYY-MM-DD`)
      : null;

    // userDetails.start_session_weight &&
    //     (Number(userDetails.days) !== 0 ||
    //       Number(userDetails.chest) === 0 ||
    //       !userDetails.chest ||
    //       Number(userDetails.waist) === 0 ||
    //       !userDetails.waist ||
    //       Number(userDetails.hips) === 0 ||
    //       !userDetails.hips) &&
    //     Number(userDetails.sent_sessions) === 1 &&
    //     weightPostedDate &&
    //     moment(currentDate).isSameOrBefore(
    //       moment(weightPostedDate).add(9, `days`),
    //       `day`,
    //     ),

    console.log(userDetails.start_session_weight, 30000);
    console.log(
      Number(userDetails.days) !== 0 ||
        Number(userDetails.chest) === 0 ||
        !userDetails.chest ||
        Number(userDetails.waist) === 0 ||
        !userDetails.waist ||
        Number(userDetails.hips) === 0 ||
        !userDetails.hips,
      30000,
    );
    console.log(Number(userDetails.sent_sessions), 30000);
    console.log(weightUpdateDate, 30000);
    console.log(callScheduleDate, 30000);
    console.log(
      moment(currentDate).isSameOrBefore(
        moment(weightUpdateDate).add(9, `days`),
        `day`,
      ),
      30000,
    );

    const conditions = [
      // Program On Hold
      {
        check: () =>
          userDetails.sub_user_status === STATUSES.ON_HOLD &&
          onholdEndDate &&
          moment(currentDate).isBefore(onholdEndDate, `day`),
        data: {
          upper_section_image_url: ``,
          title: `Program On Hold`,
          description: `Your requested break ends in ${moment(
            onholdEndDate,
          ).diff(currentDate, `days`)} days.`,
        },
      },

      // Program On Hold Overdue
      {
        check: () =>
          userDetails.sub_user_status === STATUSES.ON_HOLD &&
          onholdEndDate &&
          moment(currentDate).isAfter(onholdEndDate, `day`),
        data: {
          upper_section_image_url: ``,
          title: `Break Overdue`,
          description: `Your break has ended & you need to start again.`,
          button_text: `Start Now`,
          redirect_screen: `weight_tracker`,
        },
      },

      // Break Over Today
      {
        check: () =>
          userDetails.sub_user_status === STATUSES.ON_HOLD &&
          onholdEndDate &&
          moment(onholdEndDate).isSame(currentDate, `day`),
        data: {
          upper_section_image_url: ``,
          title: `Break Over Today`,
          description: `Your break has ended today. Please update your weight`,
          button_text: `Update Now`,
          redirect_screen: `weight_tracker`,
        },
      },
      // Call Unanswered (previously `Call Missed`)
      {
        check: () =>
          Number(userDetails.call_status) === CALL_STATUSES.UNANSWERED ||
          (Number(userDetails.call_status) === CALL_STATUSES.PENDING &&
            callScheduleDate &&
            moment(callScheduleDate).isBefore(currentDate, `day`)),
        data: {
          upper_section_image_url: IMAGE_URLS.CALL_MISSED,
          title: `Call Unanswered`,
          description: `You didn't answer your call. Reschedule it now.`,
          button_text: `Reschedule`,
          redirect_screen: `call_schedule`,
          screen_params: {
            call_type: userDetails.call_type,
          },
        },
      },

      // Diet 1 Preparing
      {
        check: () =>
          Number(userDetails.assessment_completion_status) === 2 &&
          Number(userDetails.icl_completion_status) === 2 &&
          Number(userDetails.sent_sessions) === 0,
        data: {
          upper_section_image_url: IMAGE_URLS.DIET_LIST,
          title: `Preparing Diet`,
          description: `Diet Is Being Prepared And Being Audited`,
          button_text: ``,
          redirect_screen: ``,
        },
      },

      // New Diet Received
      {
        check: () =>
          dietSentDate &&
          moment(dietSentDate).isSame(currentDate, `day`) &&
          moment(dietStartDate).isValid(),

        data: {
          upper_section_image_url: IMAGE_URLS.DIET_LIST,
          title: `New Diet Received`,
          description: `Diet session ${userDetails.sent_sessions} has been sent to you`,
          button_text: `View Now`,
          redirect_screen: `diet_details`,
          screen_params: {
            redirect_id: userDetails.diet_id,
            diet_session_value: userDetails.sent_sessions,
          },
        },
      },

      // Birthday (day/month match only)
      {
        check: () =>
          dob &&
          moment(currentDate).format(`MM-DD`) === moment(dob).format(`MM-DD`) &&
          userDetails.country_id == 101,
        data: {
          upper_section_image_url: IMAGE_URLS.DIET_LIST,
          title: `Happy Birthday`,
          description: `Unlock your birthday gift here :)`,
          button_text: `Unlock Now`,
          redirect_screen: `webview`,
          screen_params: {
            link:
              userDetails.country_id == 101
                ? `http://balancenutrition.in/address-form?client_id=${userDetails.user_id}`
                : `https://${image_guide_base_url}/birthday-offer`,
            screen_title: `Birthday Offer`,
          },
        },
      },

      // Offer Alert
      {
        check: () =>
          offerStartDate && moment(offerStartDate).isSame(currentDate, `day`),
        data: {
          upper_section_image_url: IMAGE_URLS.DIET_LIST,
          title: `Offer Alert`,
          description: `A new offer exclusively for clients has begins today!`,
          button_text: `Check Now`,
          redirect_screen: `mentor_chat`,
        },
      },

      // Offer Ending Tonight
      {
        check: () =>
          offerEndDate && moment(offerEndDate).isSame(currentDate, `day`),
        data: {
          upper_section_image_url: IMAGE_URLS.DIET_LIST,
          title: `Offer Ending Tonight`,
          description: `All offers exclusive to clients are ending tonight.`,
          button_text: `Check Now`,
          redirect_screen: `mentor_chat`,
        },
      },

      // Program Lapsed
      {
        check: () =>
          String(userDetails.sub_user_status).toLowerCase() ===
            STATUSES.DROPOUT &&
          expiryDate &&
          moment(expiryDate).isBefore(currentDate, `day`),
        data: {
          upper_section_image_url: ``,
          title: `Start Again`,
          description: `Please connect with your mentor to re-enrol.`,
          button_text: `Start Again`,
          redirect_screen: `mentor_chat`,
        },
      },

      // Payment Defaulted
      {
        check: () =>
          expiryDate &&
          moment(expiryDate).isBefore(currentDate, `day`) &&
          Number(userDetails.balance_amount) > 0,
        data: {
          upper_section_image_url: ``,
          title: `Payment Defaulted`,
          description: `Your program has lapsed due to nonpayment of balances.`,
          button_text: `Re-Enrol`,
          redirect_screen: `/book-call`,
        },
      },

      // Set Start Date
      {
        check: () =>
          Number(userDetails.advance_program_count) !== 0 &&
          Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
          dietStartDate &&
          moment(currentDate).isAfter(
            moment(dietStartDate).add(7, `days`),
            `day`,
          ) &&
          Number(userDetails.advance_program_start_date_added_by) === 0,
        data: {
          upper_section_image_url: ``,
          title: `Set Start Date`,
          description: `Your new program starts on: ${
            advanceProgramStartDate || `N/A`
          }`,
          button_text: `Set New Date`,
          redirect_screen: `program_start_date`,
        },
      },
      // Welcome Call Not Booked (call_status = pending)
      {
        check: () =>
          userDetails.welcome_call == null &&
          Number(userDetails.sent_sessions) == 1,
        data: {
          upper_section_image_url: IMAGE_URLS.BOOK,
          title: `Welcome Call Pending`,
          description: `Please book your welcome call with mentor.`,
          button_text: `Book Now`,
          redirect_screen: `book_appointment`,
          screen_params: {
            call_type: `0`,
          },
        },
      },

      // Congratulations (Program Completed)
      {
        check: () =>
          userDetails.sub_user_status === "Completed" &&
          Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
          Number(userDetails.end_session_weight) > 0 &&
          dietStartDate &&
          moment(dietStartDate).add(11, `days`).isAfter(currentDate, `day`),
        data: {
          upper_section_image_url: ``,
          title: `Congratulations!`,
          description: `You have completed all sessions of your program`,
          button_text: `View More`,
          redirect_screen: `maintenance`,
        },
      },

      // This is Incomplete!
      {
        check: () =>
          Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
          Number(userDetails.end_session_weight) === 0 &&
          dietStartDate &&
          moment().isBetween(
            moment(dietStartDate).add(11, `days`),
            moment(dietStartDate).add(13, `days`),
            `day`,
            `[]`,
          ),
        data: {
          upper_section_image_url: ``,
          title: `This is Incomplete!`,
          description: `You haven’t filled out this tracker from your last program.`,
          button_text: `View Now`,
          redirect_screen: `my_goal_screen`,
        },
      },

      // Program will Lapse!
      {
        check: () =>
          Number(userDetails.program_sessions) -
            Number(userDetails.sent_sessions) >
            2 &&
          expiryDate &&
          moment(currentDate).isBetween(
            moment(expiryDate).subtract(15, `days`),
            expiryDate,
            `day`,
            `[]`,
          ),
        data: {
          upper_section_image_url: ``,
          title: `Program will Lapse!`,
          description: `Purchase additional validity to complete your program`,
          button_text: `Extend Now`,
          redirect_screen: `mentor_chat`,
        },
      },

      // Balance Payment Due
      {
        check: () =>
          Number(userDetails.balance_amount) > 0 &&
          balanceDueDate &&
          moment(currentDate).isSame(
            moment(balanceDueDate).subtract(3, `days`),
            `day`,
          ),
        data: {
          upper_section_image_url: ``,
          title: `Balance Payment Due`,
          description: `Your payment of Rs. ${userDetails.balance_amount} towards your program is due.`,
          button_text: `Pay Now`,
          redirect_screen: `/pay-now`,
        },
      },

      // Balance Payment Overdue
      {
        check: () =>
          Number(userDetails.balance_amount) > 0 &&
          balanceDueDate &&
          moment(currentDate).isAfter(balanceDueDate, `day`),
        data: {
          upper_section_image_url: ``,
          title: `Payment Overdue`,
          description: `Balance Rs.${userDetails.balance_amount} is overdue. Please clear immediately.`,
          button_text: `Pay Now`,
          redirect_screen: `/pay-now`,
        },
      },

      // Welcome Call Overdue (call_status = pending)
      {
        check: () =>
          dietSentDate &&
          moment(currentDate).isBetween(
            moment(dietSentDate).add(9, `days`),
            moment(dietSentDate).add(10, `days`),
            `day`,
            `[]`,
          ) &&
          String(userDetails.call_type) !== `0` &&
          Number(userDetails.sent_sessions) <= 1 &&
          Number(userDetails.call_status) === CALL_STATUSES.PENDING,
        data: {
          upper_section_image_url: IMAGE_URLS.BOOK,
          title: `Welcome Call Overdue`,
          description: `You have not spoken to your mentor yet.`,
          button_text: `Book Now`,
          redirect_screen: `book_appointment`,
          screen_params: {
            call_type: `0`,
          },
        },
      },

      // Diet Start Not Set (call_status = done)
      {
        check: () =>
          userDetails.diet_start_date_set_by == "Default" &&
          Number(userDetails.sent_sessions) === 1 &&
          Number(userDetails.diet_status) === 4 &&
          String(userDetails.call_type) === `0` &&
          callScheduleDate &&
          moment(currentDate).isSameOrBefore(
            moment(callScheduleDate).add(1, `day`),
            `day`,
          ),
        data: {
          upper_section_image_url: IMAGE_URLS.DIET_LIST,
          title: `Have You Started?`,
          description: `Have you started diet session 1? Tell us here.`,
          button_text: `Update Now`,
          redirect_screen: `diet_details`,
          screen_params: {
            redirect_id: userDetails.diet_details_id,
            diet_session_value: userDetails.sent_sessions,
          },
        },
      },

      // Start Weight Not Updated
      {
        check: () =>
          (!userDetails.start_session_weight ||
            Number(userDetails.start_session_weight) === 0) &&
          Number(userDetails.sent_sessions) === 1 &&
          dietSentDate &&
          moment(currentDate).isSameOrBefore(
            moment(dietSentDate).add(3, `days`),
            `day`,
          ),
        data: {
          upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
          title: `Weight Update Pending`,
          description: `You have not updated your start weight. It is a mandatory field.`,
          button_text: `Fill Now`,
          redirect_screen: `start_weight_tracker`,
        },
      },

      // Start Inch Not Updated
      {
        check: () =>
          userDetails.start_session_weight &&
          (Number(userDetails.days) !== 0 ||
            Number(userDetails.chest) === 0 ||
            !userDetails.chest ||
            Number(userDetails.waist) === 0 ||
            !userDetails.waist ||
            Number(userDetails.hips) === 0 ||
            !userDetails.hips) &&
          Number(userDetails.sent_sessions) === 1 &&
          weightUpdateDate &&
          moment(currentDate).isSameOrBefore(
            moment(weightUpdateDate).add(9, `days`),
            `day`,
          ),
        data: {
          upper_section_image_url: IMAGE_URLS.INCH_TRACKER,
          title: `Update Your Inches`,
          description: `You have not updated your inch tracker. It is a mandatory field.`,
          button_text: `Fill Now`,
          redirect_screen: `start_inch_screen`,
        },
      },

      // Program Validity (call_status = done)
      {
        check: () =>
          userDetails.waist &&
          userDetails.hips &&
          userDetails.chest &&
          userDetails.start_session_weight &&
          dietStartDate &&
          String(userDetails.call_type) === `0` &&
          Number(userDetails.call_status) === CALL_STATUSES.DONE &&
          inchPostedDate &&
          moment(currentDate).isSameOrBefore(
            moment(inchPostedDate).add(1, `day`).endOf(`day`),
            `day`,
          ),
        data: {
          upper_section_image_url: IMAGE_URLS.SET_DATE,
          title: `Program Validity`,
          description: `To understand your program duration & validity`,
          button_text: `View Now`,
          redirect_screen: `current_program_validity`,
        },
      },

      // Session 1
      {
        check: () =>
          inchPostedDate &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(inchPostedDate).add(1, `days`),
            moment(dietStartDate).add(10, `days`),
            `day`,
            `()`,
          ) &&
          userDetails.waist &&
          userDetails.hips &&
          userDetails.chest &&
          userDetails.start_session_weight &&
          Number(userDetails.sent_sessions) === 1,
        data: () => {
          const remainingDays = moment(dietStartDate)
            .add(10, `days`)
            .diff(currentDate, `days`);
          return {
            upper_section_image_url: IMAGE_URLS.DIET_LIST,
            title: `Session 1 ${userDetails.program_name}`,
            description: `You have ${
              remainingDays > 0 ? remainingDays : 0
            } days left before completing session 1`,
            button_text: `View Now`,
            redirect_screen: `current_program_validity`,
          };
        },
      },
      // cleanse End Weight Due
      {
        check: () => {
          const sessionCount = Number(userDetails.program_sessions);
          const isCleanseActive =
            String(userDetails.sub_user_status).toLowerCase() ===
            `cleanse active`;
          const dueDate = dietStartDate
            ? moment(dietStartDate)
                .add(sessionCount === 1 ? 1 : 4, `day`)
                .format(`YYYY-MM-DD`)
            : null;

          console.log({
            currentDate,
            dietStartDate,
            dueDate,
            sub_user_status: userDetails.sub_user_status,
            program_sessions: sessionCount,
            isSameOrAfter: moment(currentDate).isSameOrAfter(
              moment(dietStartDate).add(sessionCount === 1 ? 1 : 4, `day`),
              `day`,
            ),
          });

          return (
            isCleanseActive &&
            ((sessionCount === 1 &&
              moment(currentDate).isSameOrAfter(
                moment(dietStartDate).add(1, `day`),
                `day`,
              )) ||
              (sessionCount === 3 &&
                moment(currentDate).isSameOrAfter(
                  moment(dietStartDate).add(4, `day`),
                  `day`,
                )))
          );
        },
        data: {
          upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
          title: `Update Your Weight`,
          description: `Your End weight update is due today.`,
          button_text: `Update Now`,
          redirect_screen: `weight_tracker`,
        },
      },

      // End Weight Not Updated Due Today
      {
        check: () => {
          const isDay5 = moment(currentDate).isSame(
            moment(dietStartDate).add(5, `days`).startOf(`day`)
          );
          const isDay10 = moment(currentDate).isSame(
            moment(dietStartDate).add(10, `days`).startOf(`day`)
          );
        

          const missingWeight = isDay5
            ? (!userDetails.mid_session_weight ||
                Number(userDetails.mid_session_weight) === 0)
            : (!userDetails.end_session_weight ||
                Number(userDetails.end_session_weight) === 0);
          
          console.log(isDay5, isDay10, missingWeight, userDetails.mid_session_weight, userDetails.end_session_weight, 'MIDDDDDDDDDDD'); 
        
          return dietStartDate && (isDay5 || isDay10) && missingWeight;
        },
        data: {
          upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
          title: `Update Your Weight`,
          description: `Your ${moment(currentDate).isSame(
            moment(dietStartDate).add(10, `days`).startOf(`day`)) ? 'session-end': 'mid-session' } weight update for session ${userDetails.sent_sessions} is due today.`,
          button_text: `Update Now`,
          redirect_screen: scalePurchased==true && isIndian ? 'scan_weighing_scale_and_add_weight': 'weight_tracker',
        },
      },

      // Weight Update Due Tomorrow (10th day)
      {
        check: () => {
          const isDay5 = moment(currentDate).isSame(
            moment(dietStartDate).add(4, `days`).startOf(`day`)
          );
          const isDay10 = moment(currentDate).isSame(
            moment(dietStartDate).add(9, `days`).startOf(`day`)
          );
          const isMidSession = isDay5;
      
          const missingWeight = isMidSession
            ? (!userDetails.mid_session_weight ||
                Number(userDetails.mid_session_weight) === 0)
            : (!userDetails.end_session_weight ||
                Number(userDetails.end_session_weight) === 0);  
          return (
            dietStartDate &&
            isIndian &&
            (isDay5 || isDay10) &&
            missingWeight &&
            !scalePurchased
          );
        },
        data: {
          upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
          title: `Weight Update Due!`,
          description: `Your ${moment(currentDate).isSame(
            moment(dietStartDate).add(9, `days`).startOf(`day`)) ? 'session-end': 'mid-session' } update for session ${userDetails.sent_sessions} is due tomorrow! All the best.`,
          button_text: `New Update`,
          redirect_screen: `redirect_url`,
          screen_params: {
            redirect_id: `https://balancenutrition.in/shop/bn-bodyscan-smart-scale`,
          }
        },
      },

      // End Weight Not Updated Overdue
      {
        check: () =>
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(11, `days`).startOf(`day`),
            moment(dietStartDate).add(13, `days`).endOf(`day`),
            `day`,
            `[]`,
          ) &&
          (!userDetails.end_session_weight ||
            Number(userDetails.end_session_weight) === 0),
        data: () => {
          const overdueDays = moment(currentDate).diff(
            moment(dietStartDate).add(10, `days`).endOf(`day`),
            `days`,
          );
          const overdueMessage = `Your weight update for session ${
            userDetails.sent_sessions
          } was due ${
            overdueDays === 1 ? `yesterday` : `${overdueDays} days ago`
          }.`;
          return {
            upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
            title: `Weight Update Overdue`,
            description: overdueMessage,
            button_text: `Update Now`,
            redirect_screen: scalePurchased==true && isIndian ? 'scan_weighing_scale_and_add_weight': 'weight_tracker',
          };
        },
      },

      // We Are Waiting
      {
        check: () =>
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(13, `days`).startOf(`day`),
            moment(dietStartDate).add(18, `days`).endOf(`day`),
            `day`,
            `[]`,
          ) &&
          (!userDetails.end_session_weight ||
            Number(userDetails.end_session_weight) === 0) &&
          Number(userDetails.sent_sessions) !==
            Number(userDetails.total_sessions),
        data: () => {
          const remainingDays = moment(expiryDate).diff(currentDate, `days`);
          return {
            upper_section_image_url: ``,
            title: `We Are Waiting`,
            description: `Your program ${
              userDetails.program_name
            } expires in: ${remainingDays > 0 ? remainingDays : 0} days`,
            button_text: `Add Weight`,
            redirect_screen: `weight_tracker`,
          };
        },
      },

      // You Are Losing Days
      {
        check: () =>
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(19, `days`).startOf(`day`),
            moment(dietStartDate).add(24, `days`).endOf(`day`),
            `day`,
            `[]`,
          ) &&
          (!userDetails.end_session_weight ||
            Number(userDetails.end_session_weight) === 0),
        data: {
          upper_section_image_url: ``,
          title: `You Are Losing..`,
          description: `You are losing days instead of losing weight!`,
          button_text: `Add Weight`,
          redirect_screen: `weight_tracker`,
        },
      },

      // Program Expired
      {
        check: () =>
          dietStartDate &&
          moment(currentDate).isAfter(
            moment(dietStartDate).add(24, `days`).startOf(`day`),
            `day`,
          ) &&
          (!userDetails.end_session_weight ||
            Number(userDetails.end_session_weight) === 0),
        data: {
          upper_section_image_url: ``,
          title: `Program Expired`,
          description: `Your Program Has Expired. Please contact your mentor`,
          button_text: `Start Again`,
          redirect_screen: `mentor_chat`,
        },
      },

      // Congratulations For Good Weight Loss
      {
        check: () =>
          Number(userDetails.start_session_weight) > 0 &&
          Number(userDetails.end_session_weight) > 0 &&
          Number(userDetails.start_session_weight) -
            Number(userDetails.end_session_weight) >=
            1,
        data: () => {
          const weightLost =
            Number(userDetails.start_session_weight) -
            Number(userDetails.end_session_weight);
          return {
            upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
            title: `Congratulations`,
            description: `You have lost ${weightLost.toFixed(
              1,
            )} kg in session ${userDetails.sent_sessions} (${moment(
              currentDate,
            ).diff(dietStartDate, `days`)} Days)`,
            button_text: `View Now`,
            redirect_screen: `weight_tracker`,
          };
        },
      },

      // Motivate for Bad Weight Loss
      {
        check: () =>
          Number(userDetails.start_session_weight) > 0 &&
          Number(userDetails.end_session_weight) > 0 &&
          Math.abs(
            Number(userDetails.start_session_weight) -
              Number(userDetails.end_session_weight),
          ) <= 1,
        data: () => {
          const weightLost =
            Number(userDetails.start_session_weight) -
            Number(userDetails.end_session_weight);
          return {
            upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
            title: `Let’s Work Harder`,
            description: `You have lost ${weightLost.toFixed(
              1,
            )} kg in session ${userDetails.sent_sessions} (${moment(
              currentDate,
            ).diff(dietStartDate, `days`)} Days)`,
            button_text: `View Now`,
            redirect_screen: `weight_tracker`,
          };
        },
      },

      // Half Time Feedback
      {
        check: () =>
          (Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 3 &&
            dietStartDate &&
            moment(currentDate).isBefore(
              moment(dietStartDate).add(5, `days`),
              `day`,
            ) &&
            !halfTimeFeedbackPostedDate) ||
          (Number(userDetails.program_sessions) === 9 &&
            Number(userDetails.sent_sessions) === 5 &&
            dietStartDate &&
            moment(currentDate).isBefore(
              moment(dietStartDate).add(5, `days`),
              `day`,
            ) &&
            !halfTimeFeedbackPostedDate) ||
          (Number(userDetails.program_sessions) === 12 &&
            Number(userDetails.sent_sessions) === 7 &&
            dietStartDate &&
            moment(currentDate).isBefore(
              moment(dietStartDate).add(5, `days`),
              `day`,
            ) &&
            !halfTimeFeedbackPostedDate),
        data: {
          upper_section_image_url: ``,
          title: `Half-Time Feedback`,
          description: `Give us a Feedback on your program so far :)`,
          button_text: `Update Now`,
          redirect_screen: `halftime_feedback`,
        },
      },

      // Halftime Health Score
      {
        check: () =>
          ((Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 3) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 5) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 7)) &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(4, `days`),
            moment(dietStartDate).add(10, `days`),
            `days`,
            `[]`,
          ) &&
          halfTimeFeedbackPostedDate &&
          Number(userDetails.hs_type) !== 1,
        data: {
          upper_section_image_url: ``,
          title: `PROGRESS So Far`,
          description: `Take a progress score & compare your B.M.I & more.`,
          button_text: `Compare`,
          redirect_screen: `halftime_health_score`,
        },
      },

      // Half Time Progress Call Pending (call_status = pending)
      {
        check: () =>
          ((Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 4) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 6) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 8)) &&
          dietStartDate &&
          moment(currentDate).isBefore(
            moment(dietStartDate).add(5, `days`),
            `day`,
          ) &&
          String(userDetails.call_type) !== `1`,
        data: {
          upper_section_image_url: IMAGE_URLS.BOOK,
          title: `Progress Call Due`,
          description: `Book your mid-program progress call with Mentor ${userDetails.mentor_name}.`,
          button_text: `Book Now`,
          redirect_screen: `halftime_book_appointment`,
          screen_params: {
            call_type: 1,
          },
        },
      },

      // Half Time Progress Call Missed
      {
        check: () =>
          ((Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 4) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 6) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 8)) &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(5, `days`),
            moment(dietStartDate).add(10, `days`),
            `day`,
            `()`,
          ),
        data: {
          upper_section_image_url: ``,
          title: `Your Goals & More!`,
          description: `See the goals you had set & map your achievements.`,
          button_text: `View Now`,
          redirect_screen: `my_goal_screen`,
        },
      },

      // New Goal (Call Unanswered)
      {
        check: () =>
          ((Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 4) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 6) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 8)) &&
          dietStartDate &&
          moment(currentDate).isBefore(
            moment(dietStartDate).add(5, `days`),
            `day`,
          ) &&
          halfTimeFeedbackPostedDate &&
          moment(currentDate).isAfter(
            moment(halfTimeFeedbackPostedDate).add(1, `day`),
            `day`,
          ) &&
          Number(userDetails.hs_type) === 1 &&
          hsCreatedAt &&
          String(userDetails.call_type) === `1` &&
          Number(userDetails.call_status) === CALL_STATUSES.UNANSWERED,
        data: {
          upper_section_image_url: IMAGE_URLS.CALL_MISSED,
          title: `Appointment Unanswered`,
          description: `You didn’t answer your scheduled call with Mentor ${userDetails.mentor_name}.`,
          button_text: `Reschedule`,
          redirect_screen: `call_schedule`,
          screen_params: {
            call_type: ``,
          },
        },
      },

      // Final Analytics
      {
        check: () =>
          Number(userDetails.hs_type) !== 2 &&
          Number(userDetails.advance_program_count) === 0 &&
          ((Number(userDetails.program_sessions) === 3 &&
            Number(userDetails.sent_sessions) === 3 &&
            dietStartDate &&
            moment(currentDate).isBetween(
              moment(dietStartDate).add(1, `days`),
              moment(dietStartDate).add(3, `days`),
              `day`,
              `()`,
            )) ||
            (Number(userDetails.program_sessions) === 6 &&
              Number(userDetails.sent_sessions) === 5 &&
              dietStartDate &&
              moment(currentDate).isBetween(
                moment(dietStartDate).add(1, `days`),
                moment(dietStartDate).add(5, `days`),
                `day`,
                `()`,
              )) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 7 &&
              dietStartDate &&
              moment(currentDate).isBetween(
                moment(dietStartDate).add(5, `days`),
                moment(dietStartDate).add(10, `days`),
                `day`,
                `()`,
              )) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 9 &&
              dietStartDate &&
              moment(currentDate).isBetween(
                moment(dietStartDate).add(5, `days`),
                moment(dietStartDate).add(10, `days`),
                `day`,
                `()`,
              ))),
        data: {
          upper_section_image_url: ``,
          title: `Final Analytics`,
          description: `Get your final progress report`,
          button_text: `KNOW MORE`,
          redirect_screen: `program_health_score`,
        },
      },

      // Rate This Program
      {
        check: () =>
          (Number(userDetails.program_sessions) === 3 &&
            Number(userDetails.sent_sessions) === 3 &&
            dietStartDate &&
            moment(currentDate).isBetween(
              moment(dietStartDate).add(3, `days`),
              moment(dietStartDate).add(7, `days`),
              `day`,
              `()`,
            ) &&
            !userDetails.program_feedback_posted_date) ||
          (Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 5 &&
            dietStartDate &&
            moment(currentDate).isBetween(
              moment(dietStartDate).add(5, `days`),
              moment(dietStartDate).add(10, `days`),
              `day`,
              `()`,
            ) &&
            !userDetails.program_feedback_posted_date) ||
          (Number(userDetails.program_sessions) === 9 &&
            Number(userDetails.sent_sessions) === 8 &&
            dietStartDate &&
            moment(currentDate).isBefore(
              moment(dietStartDate).add(5, `days`),
              `day`,
            )) ||
          (Number(userDetails.program_sessions) === 12 &&
            Number(userDetails.sent_sessions) === 10 &&
            dietStartDate &&
            moment(currentDate).isBefore(
              moment(dietStartDate).add(5, `days`),
              `day`,
            ) &&
            !userDetails.program_feedback_posted_date),
        data: {
          upper_section_image_url: ``,
          title: `Rate This Program`,
          description: `Tell us your experience in this program & rate your mentor.`,
          button_text: `Rate Now`,
          redirect_screen: `program_feedback`,
        },
      },

      // Book Feedback Call (call_status = pending)
      {
        check: () =>
          (Number(userDetails.program_sessions) === 3 &&
            Number(userDetails.sent_sessions) === 3 &&
            dietStartDate &&
            moment(currentDate).isBetween(
              moment(dietStartDate).add(3, `days`),
              moment(dietStartDate).add(9, `days`),
              `day`,
              `[]`,
            ) &&
            String(userDetails.call_type) !== `2`) ||
          (Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 6 &&
            dietStartDate &&
            moment(currentDate).isSameOrBefore(
              moment(dietStartDate).add(5, `days`),
              `day`,
            ) &&
            String(userDetails.call_type) !== `2`) ||
          (Number(userDetails.program_sessions) === 9 &&
            Number(userDetails.sent_sessions) === 8 &&
            dietStartDate &&
            moment(currentDate).isBetween(
              moment(dietStartDate).add(5, `days`),
              moment(dietStartDate).add(10, `days`),
              `day`,
              `[]`,
            ) &&
            String(userDetails.call_type) !== `2`) ||
          (Number(userDetails.program_sessions) === 12 &&
            Number(userDetails.sent_sessions) === 10 &&
            dietStartDate &&
            moment(currentDate).isBetween(
              moment(dietStartDate).add(5, `days`),
              moment(dietStartDate).add(10, `days`),
              `day`,
              `[]`,
            ) &&
            String(userDetails.call_type) !== `2`),
        data: {
          upper_section_image_url: ``,
          title: `Book Feedback Call`,
          description: `Book your program feedback call with mentor ${userDetails.mentor_name}`,
          button_text: `Book Now`,
          redirect_screen: `final_book_appointment`,
          screen_params: {
            call_type: 2,
          },
        },
      },

      // Current Weight Stats (call_status = done)
      {
        check: () =>
          ((Number(userDetails.program_sessions) === 6 &&
            Number(userDetails.sent_sessions) === 6) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 9) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 12)) &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(5, `days`),
            moment(dietStartDate).add(6, `days`).endOf(`day`),
            `day`,
            `[]`,
          ) &&
          String(userDetails.call_type) === `2` &&
          Number(userDetails.call_status) === CALL_STATUSES.DONE,
        data: {
          upper_section_image_url: IMAGE_URLS.WEIGHT_TRACKER,
          title: `Current Weight Stats`,
          description: `You are ${
            Number(userDetails.hs_ideal_weight) -
            Number(userDetails.start_session_weight)
          } kg away from your ideal weight.`,
          button_text: `Upgrade Now`,
          redirect_screen: `program`,
        },
      },

      // Current B.M.I Report (call_status = done)
      {
        check: () =>
          ((Number(userDetails.program_sessions) === 3 &&
            Number(userDetails.sent_sessions) === 3) ||
            (Number(userDetails.program_sessions) === 6 &&
              Number(userDetails.sent_sessions) === 6) ||
            (Number(userDetails.program_sessions) === 9 &&
              Number(userDetails.sent_sessions) === 9) ||
            (Number(userDetails.program_sessions) === 12 &&
              Number(userDetails.sent_sessions) === 12)) &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(7, `days`),
            moment(dietStartDate).add(8, `days`).endOf(`day`),
            `day`,
            `[]`,
          ) &&
          String(userDetails.call_type) === `2` &&
          Number(userDetails.call_status) === CALL_STATUSES.DONE,
        data: {
          upper_section_image_url: IMAGE_URLS.PROGRESS,
          title: `Current B.M.I Report`,
          description: `You are ${userDetails.hs_ideal_bmi} kg/m2 away from your ideal B.M.I`,
          button_text: `Upgrade Now`,
          redirect_screen: `program`,
        },
      },

      // Maintainence Active

      {
        check: () =>
          (Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
            dietStartDate &&
            moment(currentDate).isAfter(
              moment(dietStartDate).add(11, `days`),
            ) &&
            Number(userDetails.end_session_weight) !== 0) ||
          (Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
            moment(currentDate).isAfter(moment(dietStartDate).add(13, `days`))),
        data: {
          upper_section_image_url: IMAGE_URLS.MAINTAINENC_LIST,
          title: `Maintenance Active`,
          description: `You have 28 days left to complete maintenance diet`,
          button_text: `View Now`,
          redirect_screen: `maintenance`,
        },
      },

      // Most Recommended
      {
        check: () =>
          Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(9, `days`),
            moment(dietStartDate).add(10, `days`),
            `day`,
            `[]`,
          ),
        data: {
          upper_section_image_url: IMAGE_URLS.SUGGESTED_PROGRAM,
          title: `Most Recommended`,
          description: `The best way forward for you would be.. `,
          button_text: `Check Now`,
          redirect_screen: `program`,
        },
      },

      // Let’s Advance
      {
        check: () =>
          Number(userDetails.sent_sessions) ===
            Number(userDetails.program_sessions) &&
          dietStartDate &&
          moment(currentDate).isBetween(
            moment(dietStartDate).add(10, `days`),
            moment(dietStartDate).add(14, `days`),
            `day`,
            `[]`,
          ) &&
          Number(userDetails.advance_program_count) === 0,
        data: {
          upper_section_image_url: ``,
          title: `Let’s Advance!`,
          description: `You are left with no sessions. Upgrade now`,
          button_text: `Upgrade Now`,
          redirect_screen: `program`,
        },
      },
    ];

    // Evaluate conditions
    for (const condition of conditions) {
      if (condition.check()) {
        const data =
          typeof condition.data === `function`
            ? condition.data()
            : condition.data;
        return { upperSection: createResponse(data) };
      }
    }

    // Default case
    const defaultData = {
      upper_section_image_url: ``,
      title: `What We Analysed`,
      description: `Know what your assessment report tells us`,
      button_text: `Know More`,
      redirect_screen: `assessment_health_score`,
    };
    return { upperSection: createResponse(defaultData) };
  } catch (error) {
    console.log(error);
    throw new ErrorHandler(error.message);
  }
};

export const homePageMiddleSection = async ({ userDetails, app_version }) => {
  const scalePurchased = Boolean(userDetails.scale_purchased); 
  const isIndian = Boolean(userDetails.country_id == 101); 
  const responseArray = [
    {
      top_name: `Frequent`,
      bottom_name: `Queries`,
      redirect_id: `https://${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-faqs`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/bn_faq.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        // link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-faqs`,
        link: "https://balancenutrition.in/media/ekits/frequently_asked_questions.pdf",
        screen_title: `Ekit FAQs`,
      },
    },
    {
      top_name: `Daily`,
      bottom_name: `Essentials`,
      redirect_id: `https://${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-daily-essentials`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/daily_essentials.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        // link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-daily-essentials`,
        link: "https://balancenutrition.in/media/ekits/daily_essentials.pdf",
        screen_title: `Ekit Daily Essentials`,
      },
    },
    {
      top_name: `Eat In`,
      bottom_name: `Portions`,
      redirect_id: `https://${image_guide_base_url}/show-ekit/MTI0MzM=/90824e3c7fbdca28219650fd126f585d/ekit-eat-in-portions`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/eat_n_portions.png`,
      notification_flag: false,
      redirect_screen: `webview`,
      screen_params: {
        // link: `https://${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        link: "https://balancenutrition.in/media/ekits/eat_in_portions.pdf",
        screen_title: `Ekit Eat In Portions`,
      },
    },
  ];

  // Use moment to compare dates ignoring time
  const currentDate = moment().startOf("day");
  const dietStartDatePlus10 = userDetails?.diet_start_date_plus_10
    ? moment(userDetails.diet_start_date_plus_10).startOf("day")
    : null;
  const dietSentDate = userDetails?.diet_sent_date
    ? moment(userDetails.diet_sent_date).startOf("day")
    : null;
  const dietStartDatePlus5 = userDetails?.diet_start_date_plus_5
    ? moment(userDetails.diet_start_date_plus_5).startOf("day")
    : null;

  // Flags for notification badges
  let notifyWeight = false;
  let notifyInchLoss = false;
  let notifyPhoto = false;
  let notifyDiet = false;

  // Check condition for diet_start_date_plus_10
  if (
    dietStartDatePlus10 &&
    dietStartDatePlus10.isSame(currentDate) &&
    Number(userDetails.weight_days) !== 5
  ) {
    notifyWeight = true;
  }

  if (
    dietStartDatePlus10 &&
    dietStartDatePlus10.isSame(currentDate) &&
    userDetails.chest === null
  ) {
    notifyInchLoss = true;
  }

  if (
    dietStartDatePlus10 &&
    dietStartDatePlus10.isSame(currentDate) &&
    userDetails.photo_id === null
  ) {
    notifyPhoto = true;
  }

  if (dietSentDate && dietSentDate.isSame(currentDate)) {
    console.log(currentDate, 2125);
    console.log(dietSentDate, 2126);
    notifyDiet = true;
  }

  // Check condition for diet_start_date_plus_5
  if (
    dietStartDatePlus5 &&
    dietStartDatePlus5.isSame(currentDate) &&
    Number(userDetails.weight_days) !== 5
  ) {
    console.log(2133);
    notifyWeight = true;
  }

  if (Number(userDetails.user_type) > 0) {
    const startItems = [];

    if (isIndian) {
      startItems.push({
        top_name: `Know Your`,
        bottom_name: ``,
        image: `https://res.cloudinary.com/dg4wzx8c8/image/upload/v1766574708/app_images/snnjav6ttlnkgicurija.jpg`,
        notification_flag: false,
        redirect_screen: scalePurchased?  `scan_weighing_scale`: 'redirect_url',
        screen_params: {
          redirect_id: scalePurchased? null: 'https://balancenutrition.in/shop/bn-bodyscan-smart-scale'
        },
        flipping_texts:[
          'Metabolic Age',
          'Body Fat %',
          'Muscle Mass',
          'Visceral Fat',
          'Body Water',
          'Ideal Weight',
        ]
      })
    }

    if (
      userDetails.active_maintenance_id ||
      userDetails.sub_user_status === `Maintenance`
    ) {
      startItems.push(
        {
          top_name: `BN`,
          bottom_name: `Maintenance`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit//diet.png`,
          notification_flag: false,
          redirect_screen: `maintenance`,
        },
        {
          top_name: `Maintenance`,
          bottom_name: `Tracker`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/weight_tracker_new.png`,
          notification_flag: notifyWeight,
          redirect_screen: `weight_tracker`,
        },
      );
    }
    // startItems.push({
    //   top_name: `BN - Christmas`,
    //   bottom_name: `Guide`,
    //   redirect_id: `https://www.balancenutrition.in/media/guides/pdf/christmas_guide.pdf`,
    //   image: `https://${image_guide_base_url}/media/guides/icons/Christmas.png`,
    //   notification_flag: true,
    //   redirect_screen: `webview`,
    //   screen_params: {
    //     link: `https://www.balancenutrition.in/media/guides/pdf/christmas_guide.pdf`,
    //     screen_title: `BN - Christmas Guide`,
    //   },
    // });
    // startItems.push({
    //   top_name: `BN - Eat Smart Party`,
    //   bottom_name: `Guide`,
    //   redirect_id: `https://www.balancenutrition.in/media/guides/pdf/PartyGuide.pdf`,
    //   image: `https://${image_guide_base_url}/media/guides/icons/partyguide.png`,
    //   notification_flag: true,
    //   redirect_screen: `webview`,
    //   screen_params: {
    //     link: `https://www.balancenutrition.in/media/guides/pdf/PartyGuide.pdf`,
    //     screen_title: `BN - Eat Smart Party Guide`,
    //   },
    // });
    // if(userDetails.user_id == 127864){
    startItems.push({
      top_name: `Quick`,
      bottom_name: `Fillers`,
      redirect_id: `https://balancenutrition.in/bn-free-filler?client_id=${userDetails.user_id}`,
      image: `https://bncleanse.com/images/quickFillers.png`,
      notification_flag: false,
      redirect_screen: `quick_filler_guide`,
      screen_params: {
        link: `https://balancenutrition.in/bn-free-filler?client_id=${userDetails.user_id}`,
        screen_title: `Quick Fillers`,
      },
    });
    // }

    startItems.push({
      top_name: `Alcohol`,
      bottom_name: `Guide`,
      redirect_id: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${userDetails.user_id}`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/alcohol_guide.png`,
      notification_flag: false,
      redirect_screen: `alcohol_guide`,
      screen_params: {
        link: `https://www.balancenutrition.in/bn-alcohol-guide?client_id=${userDetails.user_id}`,
        screen_title: `Alcohol Guide`,
      },
    });

    startItems.push({
      top_name: `Restaurant`,
      bottom_name: `Guide`,
      redirect_id: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${userDetails.user_id}`,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/restaurant_guide.png`,
      notification_flag: false,
      redirect_screen: `restaurant_guide`,
      screen_params: {
        link: `https://www.balancenutrition.in/bn-restaurant-guide?client_id=${userDetails.user_id}`,
        screen_title: `Restaurant Guide`,
      },
    });

    startItems.push({
      top_name: `Diet`,
      bottom_name:
        userDetails.sub_user_status === `Completed` ? `Old Diets` : `Charts`,
      redirect_id: ``,
      image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/diet_chart_new.png`,
      notification_flag: notifyDiet,
      redirect_screen: `diet_session_list`,
    });

    if (userDetails.user_status === `Active`) {
      startItems.push(
        {
          top_name: `Weight`,
          bottom_name: `Tracker`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/weight_tracker_new.png`,
          notification_flag: notifyWeight,
          redirect_screen: `weight_tracker`,
        },
        {
          top_name: `Inch Loss`,
          bottom_name: `Tracker`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/inch_tracker_new.png`,
          notification_flag: notifyInchLoss,
          redirect_screen: `inch_tracker`,
        },
        {
          top_name: `Photo`,
          bottom_name: `Tracker`,
          redirect_id: ``,
          image: `https://${image_guide_base_url}/bn-api-new/images/ekit/dashboard-ekit/photo_tracker_new.png`,
          notification_flag: notifyPhoto,
          redirect_screen: `photo_tracker`,
        },
      );
    }

    responseArray.unshift(...startItems);
  }

  // Add guides at the end if available

  const guideIds = safeJSONParse(userDetails.guides);

  if (Array.isArray(guideIds) && guideIds.length > 0) {
    const { results } = await readRecord({
      table: `${tables.guides} g`,
      selectFields: [`g.guide`, `g.icon`, `g.file_path`],
      conditions: [
        {
          field: `g.guide_id`,
          operator: `IN`,
          value: guideIds,
        },
        {
          field: `g.status`,
          operator: `=`,
          value: "1",
        },
      ],
    });

    results.forEach((guide) => {
      responseArray.push({
        top_name: guide.guide,
        bottom_name: `Guide`,
        redirect_id:
          `https://www.balancenutrition.in/media/guides/pdf/` + guide.file_path,
        image: `https://${image_guide_base_url}/${guide.icon}`,
        notification_flag: false,
        redirect_screen: `webview`,
        screen_params: {
          link:
            `https://www.balancenutrition.in/media/guides/pdf/` +
            guide.file_path,
          screen_title: guide.guide,
        },
      });
    });
  }

  if (
    userDetails.user_status === "Active" &&
    [176, 173, 169, 166, 163].includes(userDetails.program_id)
  ) {
    responseArray.push({
      top_name: "Inflammation",
      bottom_name: " Guide PB",
      redirect_id: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-PB.pdf`,
      image: `https://${image_guide_base_url}/media/guides/icons/inf-pb.png`,
      notification_flag: true,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-PB.pdf`,
        screen_title: `Inflammation Guide PB`,
      },
    });
  }
  if (
    userDetails.user_status === "Active" &&
    [172, 168, 167, 162].includes(userDetails.program_id)
  ) {
    responseArray.push({
      top_name: "Inflammation ",
      bottom_name: "Guide IMF",
      redirect_id: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-IMF.pdf`,
      image: `https://${image_guide_base_url}/media/guides/icons/inf-imf.png`,
      notification_flag: true,
      redirect_screen: `webview`,
      screen_params: {
        link: `https://www.balancenutrition.in/media/guides/pdf/Inflammation-Guide-IMF.pdf`,
        screen_title: `Inflammation Guide IMF`,
      },
    });
  }

  const middleSection = {
    title:
      userDetails.user_status === `Active`
        ? `Diets, Trackers & BN Guides`
        : `Old Diets & Ekit`,
    color: `#EDFEFF`,
    trackers_and_ekit: responseArray.filter(Boolean),
  };

  return middleSection;
};

function generateCallDescription(scheduleDate, appointmentSlot, type = ``) {
  // Current time
  const now = moment();

  // Parse the schedule_date from the database
  const scheduledTime = moment(scheduleDate);

  // Calculate the time difference in days, hours, and minutes
  const duration = moment.duration(now.diff(scheduledTime));
  const days = duration.days();
  const hours = duration.hours();
  const minutes = duration.minutes();

  // Extract appointment start and end times from the appointment_slot
  const [startTime, endTime] = appointmentSlot.split(` - `);

  // Format the start time into desired format (e.g., `10:30 AM`)
  const formattedStartTime = moment(startTime, `hh:mm a`).format(`hh:mm a`);

  // Format the end time into desired format (e.g., `10:50 AM`)
  const formattedEndTime = moment(endTime, `hh:mm a`).format(`hh:mm a`);

  // Generate the description
  const description = `Your ${type} call is due in ${days} days: ${hours} hrs: ${minutes} min i.e. ${scheduledTime.format(
    `dddd, Do MMMM, YYYY`,
  )}, ${formattedStartTime} IST`;

  return description;
}
const homePageLowerSection = async ({ userDetails }) => {
  let lowerSection = {};
  // missed call
  if (
    Number(userDetails.call_status) === 4 &&
    moment(userDetails.call_schedule_date).format(`YYYY-MM-DD`) ===
      moment().format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callMissed.png`,
      title: `Call Appointment Missed: `,
      description: `You missed your scheduled call with ${userDetails.mentor_name}. This is your last chance to re schedule it.`,
      button_text: `Schedule Again`,
      redirect_screen: `/book-call`,
    });
    lowerSection = { ...data };
  }
  // call scheduled
  else if (
    moment(userDetails.call_schedule_date).format(`YYYY-MM-DD`) <=
      moment().format(`YYYY-MM-DD`) &&
    Number(userDetails.call_status) === 0
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callBooking.png`,
      title: `Call Appointment Status:`,
      description: generateCallDescription(
        userDetails.call_schedule_date,
        userDetails.appointment_slot,
      ),
      button_text: `Reschedule`,
      redirect_screen: `/book-call`,
    });
    lowerSection = { ...data };
  }
  // program & session status
  else if (
    Number(userDetails.sent_sessions) === 1 &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.diet_sent_date).format(`YYYY-MM-DD`)
  ) {
    const data = {
      title: `Program & Session Status:`,
      description: `Your program expires in: ${moment(
        userDetails.expiry_date,
      ).diff(moment(), `days`)} days`,
      button_text: ``,
      total_sessions: userDetails.total_sessions,
      diets_sent: userDetails.sent_sessions,
      pending: userDetails.total_sessions - userDetails.sent_sessions,
    };
    lowerSection = { ...data };
  } else if (
    Number(userDetails.hs_type) !== 1 &&
    Number(userDetails.program_sessions) > 3 &&
    ((Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 3 &&
      moment().format(`YYYY-MM-DD`) >=
        moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
      moment().format(`YYYY-MM-DD`) <
        moment(userDetails.diet_start_date)
          .add(5, `days`)
          .format(`YYYY-MM-DD`)) ||
      (Number(userDetails.program_sessions) === 9 &&
        Number(userDetails.sent_sessions) === 5 &&
        moment().format(`YYYY-MM-DD`) >=
          moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
        moment().format(`YYYY-MM-DD`) <
          moment(userDetails.diet_start_date)
            .add(5, `days`)
            .format(`YYYY-MM-DD`)) ||
      (Number(userDetails.program_sessions) === 12 &&
        Number(userDetails.sent_sessions) === 7 &&
        moment().format(`YYYY-MM-DD`) >=
          moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
        moment().format(`YYYY-MM-DD`) <
          moment(userDetails.diet_start_date)
            .add(5, `days`)
            .format(`YYYY-MM-DD`)))
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_halfTimeProgress.png`,
      title: `Half-Time Progress Analysis:`,
      description: `It is time for a mid-program progress for Khyati & a call with ${userDetails.mentor_name}.`,
      button_text: `Check Now`,
      redirect_screen: `halftime_health_score`,
    });
    lowerSection = { ...data };
  }
  // half time progress analysis
  else if (1 === 2) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_halfTimeProgress.png`,
      title: `Half-Time Progress Analysis:`,
      description: `It is time for a mid-program progress.`,
      button_text: `Check Now`,
      redirect_screen: `halftime_health_score`,
    });
    lowerSection = { ...data };
  }
  // let's talk about progress
  else if (
    (Number(userDetails.hs_type) !== 1 &&
      userDetails.half_time_feedback_posted_date != null) ||
    (userDetails.total_sessions === 6 &&
      userDetails.sent_sessions === 5 &&
      moment().diff(moment(userDetails.diet_sent_date), `days`) >= 2) ||
    (userDetails.total_sessions === 9 &&
      userDetails.sent_sessions === 8 &&
      moment().diff(moment(userDetails.diet_sent_date), `days`) >= 2) ||
    (userDetails.total_sessions === 12 &&
      userDetails.sent_sessions == 11 &&
      moment().diff(moment(userDetails.diet_sent_date), `days`) >= 2)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_halfTimeProgress.png`,
      title: `LET’S TALK ABOUT PROGRESS!`,
      description: `Take a progress score so we can compare your weight, B.M.I & more.`,
      button_text: `Compare Health Score`,
      redirect_screen: `halftime_health_score`,
    });
    lowerSection = { ...data };
  }
  // refer & earn
  else if (
    (userDetails.total_sessions === 3 &&
      userDetails.sent_sessions === 3 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8) &&
      userDetails.advance_program_count > 0 &&
      userDetails.latest_weight - userDetails.start_program_weight < 0) ||
    (userDetails.total_sessions === 6 &&
      userDetails.sent_sessions === 6 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3) &&
      String(userDetails.call_type) === `2` &&
      userDetails.latest_weight - userDetails.start_program_weight < 0) ||
    (userDetails.total_sessions === 9 &&
      userDetails.sent_sessions === 9 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 1) &&
      userDetails.advance_program_count > 0 &&
      userDetails.latest_weight - userDetails.start_program_weight < 0)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_wallet.png`,
      title: `Refer & Earn:`,
      description: `If you like our program, please feel free to refer us to a friend.`,
      button_text: `Refer Now`,
      redirect_screen: `refer_and_earn`,
    });
    lowerSection = { ...data };
  }
  //  Book Your Progress Call
  else if (
    ((Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 4) ||
      (Number(userDetails.program_sessions) === 9 &&
        Number(userDetails.sent_sessions) === 6) ||
      (Number(userDetails.program_sessions) === 12 &&
        Number(userDetails.sent_sessions) === 8)) &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
    moment().format(`YYYY-MM-DD`) <
      moment(userDetails.diet_start_date).add(5, `days`).format(`YYYY-MM-DD`) &&
    userDetails.half_time_feedback_posted_date &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.half_time_feedback_posted_date)
        .add(1, `day`)
        .format(`YYYY-MM-DD`) &&
    Number(userDetails.hs_type) === 1 &&
    userDetails.hs_created_at &&
    (String(userDetails.call_type) !== `1` || !userDetails.call_type)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callMissed.png`,
      title: `Book Your Progress Call:`,
      description: `Book your mid-program progress feedback call with your mentor ${userDetails.mentor_name}.`,
      button_text: `Book Now`,
      redirect_screen: `halftime_book_appointment`,
    });
    lowerSection = { ...data };
  }
  // Progress Call appointment
  else if (
    ((Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 4) ||
      (Number(userDetails.program_sessions) === 9 &&
        Number(userDetails.sent_sessions) === 6) ||
      (Number(userDetails.program_sessions) === 12 &&
        Number(userDetails.sent_sessions) === 8)) &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
    moment().format(`YYYY-MM-DD`) <
      moment(userDetails.diet_start_date).add(5, `days`).format(`YYYY-MM-DD`) &&
    userDetails.half_time_feedback_posted_date &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.half_time_feedback_posted_date)
        .add(1, `day`)
        .format(`YYYY-MM-DD`) &&
    Number(userDetails.hs_type) === 1 &&
    userDetails.hs_created_at &&
    (String(userDetails.call_type) === `1` || userDetails.call_type)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callMissed.png`,
      title: `Progress Call Appointment:`,
      description: generateCallDescription(
        userDetails.call_schedule_date,
        userDetails.appointment_slot,
        `progress`,
      ),
      button_text: `Reschedule`,
      redirect_screen: `/book-call`,
    });
    lowerSection = { ...data };
  }
  // call appointment missed
  else if (
    ((Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 4) ||
      (Number(userDetails.program_sessions) === 9 &&
        Number(userDetails.sent_sessions) === 6) ||
      (Number(userDetails.program_sessions) === 12 &&
        Number(userDetails.sent_sessions) === 8)) &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
    moment().format(`YYYY-MM-DD`) <
      moment(userDetails.diet_start_date).add(5, `days`).format(`YYYY-MM-DD`) &&
    userDetails.half_time_feedback_posted_date &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.half_time_feedback_posted_date)
        .add(1, `day`)
        .format(`YYYY-MM-DD`) &&
    Number(userDetails.hs_type) === 1 &&
    userDetails.hs_created_at &&
    (Number(userDetails.call_type) === 1 || userDetails.call_type) &&
    moment().format(`YYYY-MM-DD`) >
      moment(userDetails.call_schedule_date).format(`YYYY-MM-DD`) &&
    Number(userDetails.call_status) === 0
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callMissed.png`,
      title: `Call Appointment Missed: `,
      description: `You missed your scheduled progress call with ${userDetails.mentor_name}. This is your last chance to re schedule it.`,
      button_text: `Schedule Again`,
      redirect_screen: `/book-call`,
    });
    lowerSection = { ...data };
  }
  // Khayti's Message
  else if (
    ((Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 4) ||
      (Number(userDetails.program_sessions) === 9 &&
        Number(userDetails.sent_sessions) === 6) ||
      (Number(userDetails.program_sessions) === 12 &&
        Number(userDetails.sent_sessions) === 8)) &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.diet_start_date).format(`YYYY-MM-DD`) &&
    moment().format(`YYYY-MM-DD`) <
      moment(userDetails.diet_start_date).add(5, `days`).format(`YYYY-MM-DD`) &&
    userDetails.half_time_feedback_posted_date &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.half_time_feedback_posted_date)
        .add(1, `day`)
        .format(`YYYY-MM-DD`) &&
    Number(userDetails.hs_type) === 1 &&
    userDetails.hs_created_at &&
    Number(userDetails.call_type) === 1 &&
    Number(userDetails.call_status) === 4
  ) {
    const data = new appLowerSectionResponse({
      title: `Khyati’s Message:`,
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_myGoals.png`,
      description: `With the pending sessions we have, let’s check your progress & see how to get to your goals.`,
      button_text: `What’s Next`,
      redirect_screen: `my_goal_screen`,
    });
    lowerSection = { ...data };
  }
  // final progress report
  else if (
    (userDetails.total_sessions === 3 &&
      userDetails.sent_sessions === 3 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3) &&
      userDetails.hs_created_at !== null &&
      userDetails.hs_type === 2) ||
    (userDetails.total_sessions === 6 &&
      userDetails.sent_sessions === 5 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 5) &&
      userDetails.hs_created_at !== null &&
      userDetails.hs_type === 2) ||
    (userDetails.total_sessions === 9 &&
      userDetails.sent_sessions === 7 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 6 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 10) &&
      userDetails.hs_created_at !== null &&
      userDetails.hs_type === 2)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_finalProgress.png`,
      title: `Final Progress Report:`,
      description: `Let’s compare your current B.M.I & Weight from the start until now.`,
      button_text: `Compare Now`,
      redirect_screen: `program_health_score`,
    });
    lowerSection = { ...data };
  }
  // rate this program
  else if (
    (Number(userDetails.program_sessions) === 3 &&
      Number(userDetails.sent_sessions) === 3 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 5 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 6) &&
      !userDetails.final_feedback_id) ||
    (Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 5 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 6 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 10) &&
      !userDetails.final_feedback_id) ||
    (Number(userDetails.program_sessions) === 9 &&
      Number(userDetails.sent_sessions) === 8 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 5) &&
      !userDetails.final_feedback_id)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_finalProgress.png`,
      title: `Rate This Program:`,
      description: `Tell us your experience in this program & rate your mentor.`,
      button_text: `Rate Now`,
      redirect_screen: `program_feedback`,
    });
    lowerSection = { ...data };
  } else if (
    (Number(userDetails.program_sessions) === 3 &&
      Number(userDetails.sent_sessions) === 3 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9) &&
      !Number(userDetails.call_type) === 2) ||
    (Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 5 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 6 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9 ||
        (moment().diff(moment(userDetails.diet_sent_date), `days`) === 10 &&
          !Number(userDetails.call_type) === 2))) ||
    (Number(userDetails.program_sessions) === 9 &&
      Number(userDetails.sent_sessions) === 8 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        (moment().diff(moment(userDetails.diet_sent_date), `days`) === 5 &&
          !Number(userDetails.call_type) === 2)))
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callBooking.png`,
      title: `Book Your Feedback Call:`,
      description: `Book your program feedback call with your mentor ${userDetails.mentor_name}.`,
      button_text: `Book Now`,
      redirect_screen: `final_book_appointment`,
    });
    lowerSection = { ...data };
  } else if (
    (Number(userDetails.program_sessions) === 3 &&
      Number(userDetails.sent_sessions) === 3 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9) &&
      !Number(userDetails.call_type) === 2) ||
    (Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 5 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 6 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9 ||
        (moment().diff(moment(userDetails.diet_sent_date), `days`) === 10 &&
          !Number(userDetails.call_type) === 2))) ||
    (Number(userDetails.program_sessions) === 9 &&
      Number(userDetails.sent_sessions) === 8 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        (moment().diff(moment(userDetails.diet_sent_date), `days`) === 5 &&
          !Number(userDetails.call_type) === 2)))
  ) {
    const data = new appLowerSectionResponse({
      title: `Feedback Call Appointment:`,
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callBooking.png`,
      description: generateCallDescription(
        userDetails.call_schedule_date,
        userDetails.appointment_slot,
        `feedback`,
      ),
      button_text: `Reschedule`,
      redirect_screen: `final_book_appointment`,
    });
    lowerSection = { ...data };
  }
  // call apoointment missed final feedback
  else if (
    (Number(userDetails.program_sessions) === 3 &&
      Number(userDetails.sent_sessions) === 3 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9) &&
      Number(userDetails.call_type) === 2 &&
      moment().diff(moment(userDetails.call_schedule_date), `days`) >= 1) ||
    (Number(userDetails.program_sessions) === 6 &&
      Number(userDetails.sent_sessions) === 5 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 6 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 7 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 8 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 9 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 10) &&
      Number(userDetails.call_type) === 2 &&
      moment().diff(moment(userDetails.call_schedule_date), `days`) >= 1) ||
    (Number(userDetails.program_sessions) === 9 &&
      Number(userDetails.sent_sessions) === 8 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 3 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 4 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 5) &&
      Number(userDetails.call_type) === 2 &&
      moment().diff(moment(userDetails.call_schedule_date), `days`) >= 1)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_callMissed.png`,
      title: `Call Appointment Missed: `,
      description: `You missed your scheduled feedback call with ${userDetails.mentor_name}. This is your last chance to reschedule it.`,
      button_text: `Schedule Again`,
      redirect_screen: `final_book_appointment`,
    });
    lowerSection = { ...data };
  } else if (
    (Number(userDetails.sent_sessions) === 9 &&
      Number(userDetails.total_sessions) === 9 &&
      userDetails.advance_program_count === 0 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2)) ||
    (Number(userDetails.sent_sessions) === 6 &&
      Number(userDetails.total_sessions) === 6 &&
      userDetails.advance_program_count === 0 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 6 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 7)) ||
    (Number(userDetails.sent_sessions) === 12 &&
      Number(userDetails.total_sessions) === 12 &&
      userDetails.advance_program_count === 0 &&
      (moment().diff(moment(userDetails.diet_sent_date), `days`) === 1 ||
        moment().diff(moment(userDetails.diet_sent_date), `days`) === 2))
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Let’s Advance!`,
      description: `You have not achieved your ideal weight & goals yet`,
      button_text: `Start Again`,
      redirect_screen: `program`,
    });
    lowerSection = { ...data };
  }
  // congratulations
  else if (
    Number(userDetails.sent_sessions) ===
      Number(userDetails.program_sessions) &&
    Number(userDetails.end_session_weight) > 0 &&
    moment(userDetails.diet_start_date).add(11, `days`).format(`YYYY-MM-DD`) >=
      moment().format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Congratulations!`,
      description: `You have completed all sessions of your program ${userDetails.mentor_name}!`,
      button_text: `Start Again`,
      redirect_screen: `program`,
    });
    lowerSection = { ...data };
  }
  // program lapsed
  else if (
    moment(userDetails.expiry_date).format(`YYYY-MM-DD`) <
    moment().format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      title: `Program Lapsed:`,
      description: `Please connect with your mentor to re-enrol or WhatsApp: ${userDetails.mentor_phone}`,
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      button_text: `Start Again`,
      redirect_screen: `program`,
    });
    lowerSection = { ...data };
  } else if (
    moment(userDetails.expiry_date).format(`YYYY-MM-DD`) <
      moment().format(`YYYY-MM-DD`) &&
    Number(userDetails.balance_amount) > 0
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Payment Defaulted`,
      description: `Your program has lapsed due to nonpayment of balances.`,
      button_text: `Re-Enrol`,
      redirect_screen: `/book-call`,
    });
    lowerSection = { ...data };
  } else if (
    Number(userDetails.sent_sessions) ===
      Number(userDetails.program_sessions) &&
    moment().format(`YYYY-MM-DD`) >
      moment(userDetails.diet_start_date).add(`7`).format(`YYYY-MM-DD`) &&
    Number(userDetails.advance_program_start_date_added_by) === 0
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Set Start Date`,
      description: `Your new program starts on: ${moment(
        userDetails.advance_program_start_date,
      ).format(`DD-MM-YYYY`)}`,
      button_text: `Set New Date`,
      button2_text: `Confirm Date`,
      redirect_screen: `/book-call`,
    });
    lowerSection = { ...data };
  } else if (
    Number(userDetails.balance_amount) > 0 &&
    moment().format(`YYYY-MM-DD`) ===
      moment(userDetails.balance_due_date)
        .subtract(3, `days`)
        .format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Balance Payment Due`,
      description: `Your payment of Rs. ${
        userDetails.balance_amount
      } towards your program is due. Pay before ${moment(
        userDetails.balance_due_date,
      ).format(`DD-MM-YYYY`)}`,
      button_text: `Pay Now`,
      redirect_screen: `/pay-now`,
    });
    lowerSection = { ...data };
  } else if (
    Number(userDetails.balance_amount) > 0 &&
    moment().format(`YYYY-MM-DD`) >
      moment(userDetails.balance_due_date).format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Balance Payment Overdue`,
      description: `Your payment of Rs. ${userDetails.balance_amount} is now overdue. Please clear immediately.`,
      button_text: `Pay Now`,
      redirect_screen: `/pay-now`,
    });
    lowerSection = { ...data };
  }
  // your program on hold
  else if (
    userDetails.sub_user_status === `Onhold` &&
    moment().format(`YYYY-MM-DD`) <
      moment(userDetails.onhold_end_date).format(`YYYY-MM-DD`)
  ) {
    let momentObj = moment(userDetails.expiry_date, `YYYY-MM-DD HH:mm:ss`);
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Your Program On Hold`,
      description: `${momentObj.format(`DD`)}:${momentObj.format(
        `HH`,
      )}:${momentObj.format(`mm`)}`,
    });
    lowerSection = { ...data };
  } else if (
    userDetails.sub_user_status === `Onhold` &&
    moment().format(`YYYY-MM-DD`) >
      moment(userDetails.onhold_end_date).format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      lower_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/program_status/programStatus_letsAdvance.png`,
      title: `Break Overdue`,
      description: `Your break has ended & You had to start again ${
        moment(userDetails.onhold_end_date).isSame(
          moment().subtract(1, `days`),
          `day`,
        )
          ? `yesterday`
          : ``
      }  ${moment(userDetails.onhold_end_date).fromNow()} ago `,
      button_text: `Start Now`,
      redirect_screen: `weight_tracker`,
    });
    lowerSection = { ...data };
  } else if (
    moment().format(`YYYY-MM-DD`) >
    moment(userDetails.expiry_date).format(`YYYY-MM-DD`)
  ) {
    const data = new appLowerSectionResponse({
      title: `Your Program will Lapse!`,
      description: `Purchase additional validity to complete your program`,
      button_text: `Extend Now`,
      redirect_screen: `program`,
    });
    lowerSection = { ...data };
  } else {
    const data = {
      title: `Program & Session Status:`,
      description: `Your program expires in: ${moment(
        userDetails.expiry_date,
      ).diff(moment(), `days`)} days`,
      button_text: `Increase Validity`,
      total_sessions: userDetails.total_sessions,
      diets_sent: userDetails.sent_sessions,
      pending: userDetails.total_sessions - userDetails.sent_sessions,
    };
    lowerSection = { ...data };
  }
  return { lowerSection };
};
export const goProSection = async (req, res, next) => {
  const { user_id } = req.query;
  try {
    const { results: users } = await readRecord({
      selectFields: [
        `hs.id as health_score_id`,
        `cu.call_id as call_id`,
        `sp.suggested_program_id`,
        `pm.program_name`,
        `pm.program_features_app as program_features`,
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: `LEFT`,
          table: `${tables.healthScoreClient} hs`,
          on: `cd.user_id = hs.user_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.callUpdates} cu`,
          on: `cd.user_id = cu.user_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.suggestedProgram} sp`,
          on: `cd.suggested_program_id = sp.suggested_program_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.programsMaster} pm`,
          on: `sp.program_id = pm.program_id`,
        },
      ],
      conditions: [{ field: `cd.user_id`, operator: `=`, value: user_id }],
    });
    if (users.length === 0) {
      return next(new ErrorHandler(`User not found`, 404));
    }
    const userDetails = users[0];
    if (!userDetails.health_score_id) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Go Pro`,
        data: {
          hs_taken: false,
        },
      });
      return res.status(200).send(apiResponse);
    } else if (userDetails.call_id) {
      const { results: programs } = await readRecord({
        selectFields: [
          `pm.program_id as program_id`,
          `pm.program_name`,
          `pm.app_program_banner`,
        ],
        table: `${tables.programsMaster} pm`,
        conditions: [
          {
            field: `pm.program_category`,
            operator: `!=`,
            value: `Basic Stack`,
          },
          {
            field: `pm.is_active`,
            operator: `=`,
            value: 1,
          },
          {
            field: `pm.program_id`,
            operator: `IN`,
            value: [4, 1, 3, 2, 5, 73, 74, 91, 6, 132],
          },
        ],
        orderBy: [`FIELD(pm.program_id, 4,1,3,2,5,73,74,91,6,132)`],
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Go Pro`,
        data: {
          hs_taken: true,
          call_button_status: true,
          hs_taken: true,
          program_suggested: false,
          paying_for_features: [
            `Personalised Diet Charts`,
            `Qualified Nutritionist Trained By Khyati Rupani`,
            `Calls With Nutritionist Expert`,
            `Progress Trackers`,
          ],
          available_with_program_features: [
            `BN Restaurant Guide`,
            `BN Portion Control Guide`,
            `Unlimited Chat in-App`,
            `1200+ Healthy Recipes`,
          ],
          program_list: programs.map((program) => {
            return {
              image: program.app_program_banner,
              redirect_screen_name: `program`,
              screen_params: {
                program_id: program.program_id,
              },
            };
          }),
        },
      });
      return res.status(200).send(apiResponse);
    } else if (userDetails.call_id && userDetails.suggested_program_id) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Go Pro`,
        data: {
          hs_taken: true,
          call_button_status: false,
          hs_taken: true,
          program_suggested: false,
          paying_for_features: [
            `Personalised Diet Charts`,
            `Qualified Nutritionist Trained By Khyati Rupani`,
            `Calls With Nutritionist Expert`,
            `Progress Trackers`,
          ],
          available_with_program_features: [
            `BN Restaurant Guide`,
            `BN Portion Control Guide`,
            `Unlimited Chat in-App`,
            `1200+ Healthy Recipes`,
          ],
          "Best Programs For You": {
            name: userDetails.program_name,
            percent: `93%`,
            features: JSON.parse(userDetails.program_features || `[]`),
          },
        },
      });
      return res.status(200).send(apiResponse);
    } else {
      const { results: programs } = await readRecord({
        selectFields: [
          `pm.program_id as program_id`,
          `pm.program_name`,
          `pm.app_program_banner`,
        ],
        table: `${tables.programsMaster} pm`,
        conditions: [
          {
            field: `pm.program_category`,
            operator: `!=`,
            value: `Basic Stack`,
          },
          {
            field: `pm.is_active`,
            operator: `=`,
            value: 1,
          },
          {
            field: `pm.program_id`,
            operator: `IN`,
            value: [4, 1, 3, 2, 5, 73, 74, 91, 6, 132],
          },
        ],
        orderBy: [`FIELD(pm.program_id, 4,1,3,2,5,73,74,91,6,132)`],
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Go Pro`,
        data: {
          hs_taken: true,
          call_button_status: false,
          hs_taken: true,
          program_suggested: false,
          paying_for_features: [
            `Personalised Diet Charts`,
            `Qualified Nutritionist Trained By Khyati Rupani`,
            `Calls With Nutritionist Expert`,
            `Progress Trackers`,
          ],
          available_with_program_features: [
            `BN Restaurant Guide`,
            `BN Portion Control Guide`,
            `Unlimited Chat in-App`,
            `1200+ Healthy Recipes`,
          ],
          most_recommended_program: {
            name: userDetails.program_name,
            percent: `93%`,
            features: JSON.parse(userDetails.program_features || `[]`),
          },
          // least_recommended_program: {
          //   name: `10 Day Trial`,
          //   percent: `68%`,
          //   features: [
          //     `Professional Diet Plans`,
          //     `1 Consultation Available`,
          //     `Easy & Simple Diets`,
          //     `Regular Weight Tracking`,
          //   ],
          // },
          program_list: programs.map((program) => {
            return {
              image: program.app_program_banner,
              redirect_screen_name: `program`,
              screen_params: {
                program_id: program.program_id,
              },
            };
          }),
        },
      });
      return res.status(200).send(apiResponse);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(`Internal Server Error`, 500));
  }
};

export const donGet = async (req, res, next) => {
  const { user_id } = req.query;
  const data = [
    {
      id: "1",
      image:
        "https://cdn3d.iconscout.com/3d/premium/thumb/net-promoter-score-nps-3d-icon-download-in-png-blend-fbx-gltf-file-formats--performance-speedometer-speed-customer-service-pack-network-communication-icons-10260634.png",
      title: "Take Health Score And Earn ₹1000",
      description: "Take your Health score report and earn ₹1000",
    },
    {
      id: "2",
      image:
        "https://cdn3d.iconscout.com/3d/premium/thumb/earn-rupee-4824086-4018478.png",
      title: "Update your Weight And Earn ₹100",
      description: "Update your weight every 5th day and earn ₹100",
    },
    {
      id: "3",
      image:
        "https://cdn3d.iconscout.com/3d/premium/thumb/group-chat-3d-icon-download-in-png-blend-fbx-gltf-file-formats--team-communication-discussion-meeting-pack-jobs-carriers-icons-5818874.png",
      title: "Submit your feedback and Earn ₹100",
      description: "Give your valuable feedback and earn ₹100.",
    },
    {
      id: "4",
      image:
        "https://cdn3d.iconscout.com/3d/premium/thumb/tips-3d-icon-download-in-png-blend-fbx-gltf-file-formats--idea-hand-bulb-light-digital-nomad-pack-holidays-icons-10335963.png",
      title: "View tips and earn ₹50",
      description: "Follow Daily tips and earn ₹50 on every tip.",
    },
    {
      id: "5",
      image:
        "https://cdn3d.iconscout.com/3d/premium/thumb/referral-7544394-6166282.png",
      title: "Earn ₹100  by referring your friend",
      description:
        "On Referring, we will be adding ₹100 to your Wallet & once they join a program, we shall Credit ₹1000 additionally :)",
    },
    {
      id: "6",
      image:
        "https://cdn3d.iconscout.com/3d/premium/thumb/customer-service-3d-icon-download-in-png-blend-fbx-gltf-file-formats--call-logo-care-center-business-pack-icons-8472352.png",
      title: "Gather rewards from your BN Expert",
      description: "Contact your counsellor for surprising rewards",
    },
  ];

  try {
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Rewards data fetched successfully",
      data: data, // Sending the static data array
    });
    return res.status(200).send(apiResponse);
  } catch (error) {
    console.error("Error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const appLeadHomePage = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        `ud.my_wallet`,
        `ud.user_id`,
        `hs.created as hs_created_at`,
        `cu.schedule_date as call_schedule_date`,
        `cu.call_type`,
        `cu.call_status`,
        `cu.added_by`,
        `slot.appointment_slots`,
        `hs.body_mass_index`,
        `hs.ideal_bmi`,
        `(SELECT lwr.added_date FROM ${tables.weightRecordsLead} lwr WHERE lwr.user_id = ud.user_id ORDER BY lwr.added_date DESC LIMIT 1) as latest_weight_posted_date`,
        `hs.ideal_weight`,
        `ud.latest_weight`,
      ],
      joins: [
        {
          type: `LEFT`,
          table: `${tables.healthScoreClient} hs`,
          on: `ud.user_id = hs.user_id`,
        },
        {
          type: `LEFT`,
          table: `(
        SELECT cu.*
        FROM ${tables.callUpdates} cu
        WHERE cu.user_id = ${user_id}
        ORDER BY cu.schedule_date DESC
        LIMIT 1
      ) cu`,
          on: `ud.user_id = cu.user_id`,
        },

        {
          type: `LEFT`,
          table: `${tables.slots} slot`,
          on: `slot.id = cu.slot_id`,
        },
      ],
      conditions: [{ field: `ud.user_id`, operator: `=`, value: user_id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler(`User not found`, 404));
    }
    const { results: randomSocialPost } = await readRecord({
      table: `${tables.socialPost} social_post`,
      selectFields: [
        `social_post.id`,
        `social_post.title`,
        `social_post.description`,
        `social_post.post_link`,
        `social_post.posted_on`,
        `social_post.video`,
        `social_post.image`,
      ],
      conditions: [
        { field: `social_post.post_sub_type`, operator: `=`, value: `Tips` },
      ],
      pagination: { limit: 1 },
      orderBy: [`RAND()`],
    });
    const { results: randomSuccessStory } = await readRecord({
      table: `${tables.successStories} success`,
      selectFields: [
        `success.id `,
        `success.photo_before_after`,
        `success.long_descriptions`,
        `success.client_details`,
      ],
      pagination: { limit: 1 },
      orderBy: [`RAND()`],
    });
    const { results: latestRecipe } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: [
        `r.id`,
        `r.title`,
        `r.recipe_images`,
        `rt.title as recipe_type_name`,
        `rc.category_name `,
        `r.health_meter`,
        `rt.icon`,
      ],
      joins: [
        {
          type: `LEFT`,
          table: `${tables.recipe_type} rt`,
          on: `r.recipe_type_id = rt.id`,
        },
        {
          type: `LEFT`,
          table: `${tables.category} rc`,
          on: `r.category_id = rc.category_id `,
        },
      ],
      pagination: { limit: 1 },
    });
    const { results: randomHealthRead } = await readRecord({
      table: `${tables.blogPosts} bp`,
      selectFields: [
        `bp.postID `,
        `bp.postTitle`,
        `bp.postBannerSmall`,
        `bp.seoDescription`,
        `bp.postDate`,
        `bp.view_count`,
      ],

      orderBy: [`RAND()`],
      pagination: { limit: 1 },
    });
    const { results: randomEkit } = await readRecord({
      table: `${tables.ekit} e`,
      selectFields: [`e.id  `, `e.name`, `e.short_description`],
      orderBy: [`RAND()`],
      pagination: { limit: 1 },
    });
    const userDetails = results[0];
    console.log(`User Details`, userDetails);
    const { upperSection } = LeadHomePageUpperSection({ userDetails });
    const [imageSlider] = LeadHomeImageSliderSection({ userDetails });

    return res.status(200).json({
      status: true,
      data: {
        upper_section: upperSection,
        image_slider_section: imageSlider,
        tip_section: {
          tip_id: randomSocialPost[0].id,
          title: `Tip of the Day`,
          platform: randomSocialPost[0].posted_on,
          is_video: safeJSONParse(randomSocialPost[0].image) ? false : true,
          tip_image: randomSocialPost?.[0]?.image
            ? safeJSONParse(randomSocialPost[0].image)?.[0]?.file?.path || null
            : null,
          tip_video: randomSocialPost?.[0]?.video
            ? safeJSONParse(randomSocialPost[0].video)?.[0]?.file?.path || null
            : null,
          tip_title: randomSocialPost[0].title,
          tip_description: randomSocialPost[0].description,
        },

        success_story: {
          story_id: `73`,
          title: `They Started and Succeeded`,
          success_desc: `Lost 11 kg`,
          success_story_image: `https://${image_guide_base_url}/images/testimonial/before_after_13bdaa1f.png`,
          name: `Ganesh Ramakrishnan`,
          country_flag: `https://${image_guide_base_url}/bn-api-new/images/flags/flags/ae.png`,
          health: `Inch loss,Weight loss,`,
          country_name: `United Arab Emirates`,
        },
        recipe_section: {
          title: `Latest Healthy Recipe`,
          recipe_id: latestRecipe[0].id,
          recipe_name: latestRecipe[0].title,
          recipe_image: safeJSONParse(latestRecipe[0].recipe_images)[0]?.file
            ?.path,
          recipe_category: latestRecipe[0].category_name,
          recipe_description: latestRecipe[0].health_meter,
          recipe_type: latestRecipe[0].recipe_type_name,
          recipe_type_image: safeJSONParse(latestRecipe[0].icon)[0]?.file?.path,
        },
        health_read_section: {
          blog_id: randomHealthRead[0].postID,
          title: `Health Reads`,
          desc: randomHealthRead[0].seoDescription,
          catTitle: randomHealthRead[0].postTitle,
          image: safeJSONParse(randomHealthRead[0].postBannerSmall)[0]?.file
            ?.path,
          added_date: moment(randomHealthRead[0].postDate).format(`DD-MM-YYYY`),
          total_view: Number(randomHealthRead[0].view_count),
        },

        ekit_section: {
          title: `E-kit:Friend For Life`,
          ekit_description: `BN Global Dine-Out & Party Guide`,
          ekit_sub_description: `Gives you the freedom to choose your meals when eating out or at a party.`,
          ekit_image: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/E-kit.png`,
        },
      },
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(`Internal Server Error`, 500));
  }
};

function LeadHomePageUpperSection({ userDetails }) {
  let upperSection = {};
  if (!userDetails.hs_created_at) {
    const data = new appUpperSectionResponse({
      upper_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/weighing_icon.png`,
      title: `Know Your Health `,
      description: `Get your health score curated by our team of Experts.`,
      button_text: `Get Now`,
      redirect_screen: `take_health_score`,
    });
    upperSection = { ...data };
  } else if (!userDetails.call_type || Number(userDetails.call_type) !== 30) {
    const data = new appUpperSectionResponse({
      upper_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/book_call.png`,
      title: `Still Confused ?`,
      description: `Talk to our Nutrition Expert`,
      button_text: `Book A Call`,
      redirect_screen: `call_booking`,
      screen_params: {
        call_type: 30,
      },
    });
    upperSection = { ...data };
  } else if (
    userDetails.call_type &&
    moment().format(`YYYY-MM-DD`) >=
      moment(userDetails.call_schedule_date).format(`YYYY-MM-DD`) &&
    Number(userDetails.call_type) === 30 &&
    Number(userDetails.call_status) === 0
  ) {
    const data = new appUpperSectionResponse({
      upper_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/book_call.png`,
      title: `Appointment Status`,
      description: `Your Call is due in ${moment(
        userDetails.call_schedule_date,
      ).fromNow()} ${moment(userDetails.call_schedule_date).format(
        `DD-MM-YYYY`,
      )} ${userDetails.appointment_slots}`,
      button_text: `Reschedule`,
      redirect_screen: `call_schedule`,
      screen_params: {
        call_type: 30,
        added_by: userDetails.added_by,
      },
    });
    upperSection = { ...data };
  } else if (
    userDetails.call_type &&
    moment().format(`YYYY-MM-DD`) >
      moment(userDetails.call_schedule_date).format(`YYYY-MM-DD`) &&
    Number(userDetails.call_type) === 30 &&
    Number(userDetails.call_status) === 0
  ) {
    const data = new appUpperSectionResponse({
      upper_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/miss.png`,
      title: `Appointment Missed`,
      description: `You Missed Your Call . This is last chance to re schedule it.`,
      button_text: `Reschedule`,
      redirect_screen: `call_schedule`,
      screen_params: {
        call_type: 30,
        added_by: userDetails.added_by,
      },
    });
    upperSection = { ...data };
  } else if (
    Number(userDetails.call_type) === 30 &&
    userDetails.hs_created_at &&
    moment().isAfter(
      moment(userDetails.latest_weight_posted_date).add(5, `days`),
    )
  ) {
    const data = new appUpperSectionResponse({
      upper_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/weighing_icon.png`,
      title: `Update your Weight`,
      description: `You have a weight update due ${moment(
        userDetails.latest_weight_posted_date,
      ).fromNow()}`,
      button_text: `Update Now`,
      redirect_screen: `weight_tracker`,
    });
    upperSection = { ...data };
  } else {
    const data = new appUpperSectionResponse({
      upper_section_image_url: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/weighing_icon.png`,
      title: `Current B.M.I report`,
      description: `You are ${
        userDetails.latest_weight - userDetails.ideal_weight
      } Kg away from your ideal B.M.I is ${userDetails.ideal_bmi}`,
      button_text: `View Report`,
      redirect_screen: `view_health_score`,
      screen_params: {
        user_id: userDetails.user_id,
      },
    });
    upperSection = { ...data };
  }
  return { upperSection };
}

function LeadHomeImageSliderSection({ userDetails }) {
  let imageSliderSection = [
    {
      image: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/meet_khyati_card.png`,
      redirect_screen: `meet_khyati`,
      screen_params: null,
    },
    {
      image: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/spin_&_win_card.png`,
      redirect_screen: `webview`,
      screen_params: {
        screen_title: `Spin the wheel`,
        link: `https://${image_guide_base_url}/spintowin/?user_id=30909`,
      },
    },
    {
      image: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/Reform.png`,
      redirect_screen: `program`,
      screen_params: {
        program_id: 92,
      },
    },
  ];

  const hasHealthScore = userDetails.hs_created_at ? true : false;
  const spinToWinEnabled = Number(userDetails.my_wallet) >= 1000 ? true : false;

  // Update card order based on conditions
  let updatedSliderSection = [];

  if (!hasHealthScore) {
    updatedSliderSection = [imageSliderSection[0]];
  } else {
    if (spinToWinEnabled) {
      updatedSliderSection = [
        imageSliderSection[1],
        imageSliderSection[0],
        imageSliderSection[2],
      ];
    } else {
      updatedSliderSection = [imageSliderSection[2], imageSliderSection[0]];
    }
  }
  return [imageSliderSection];
}

export const extendProgram = async (req, res, next) => {
  const { user_id } = req.query;
  try {
    const { results: userDetails } = await readRecord({
      selectFields: [
        `pm.program_name`,
        `sop.total_sessions`,
        `sop.sent_sessions`,
        `sop.pending_session`,
        `sop.start_date`,
        `sop.expiry_date`,
        `sop.expiry_extended_by`,
        `TIMESTAMPDIFF(DAY,CURDATE(),sop.expiry_date) AS days_left`,
        `sop.last_session_sent_date`,
        `ps.program_duration`,
        `CONCAT(pm.program_name,'(',ps.program_duration,' Days)') as active_program_name`,
        `cd.my_wallet`,
        `ps.validity`,
        `ps.extra_validity`,
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: `LEFT`,
          table: `${tables.subOrderPrograms} sop`,
          on: `cd.active_order_id = sop.sub_order_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.programsMaster} pm`,
          on: `sop.program_id = pm.program_id`,
        },
        {
          type: `LEFT`,
          table: `${tables.programSession} ps`,
          on: `sop.program_session_id = ps.program_session_id`,
        },
      ],
      conditions: [{ field: `cd.user_id`, operator: `=`, value: user_id }],
    });

    const lastSessionDate = moment(userDetails[0].last_session_sent_date);
    const expiryDate = moment(userDetails[0].expiry_date);
    let daysRemainingForCurrentSession = 0;
    if (expiryDate.diff(moment(), `days`) < 10) {
      daysRemainingForCurrentSession = expiryDate.diff(lastSessionDate, `days`);
    }
    const daysForPendingSessions = userDetails[0].pending_session * 10;
    const totalDaysNeeded =
      daysRemainingForCurrentSession + daysForPendingSessions;

    const data = {
      program_details: {
        program_name: userDetails[0].active_program_name,
        points: [
          `<span>Started on : <b> ${moment(userDetails[0].start_date).format(
            `Do-MMMM-YYYY`,
          )}</b></span>`,
          `<span>Expires on : <b>${moment(userDetails[0].expiry_date).format(
            `Do-MMMM-YYYY`,
          )}</b></span>`,
        ],
        description: `<span style="text-decoration: underline;">* Additional default validity (20 days) to cover Sunday off & holiday delays added already</span>`,
      },
      increase_validity: {
        title: `Increase Your Validity`,
        points: [
          `<span>You will need to <b> extend your validity</b> to finish all sessions of your program</span>`,
          `Extend Using the BN Wallet Balance Now`,
        ],
        validity_left: userDetails[0].days_left,
        pending_session: userDetails[0].pending_session,
        days_needed: totalDaysNeeded,
      },
      show_button: totalDaysNeeded > userDetails[0].days_left ? true : false,
      important_points_validity: {
        title: `Important Points`,
        points: [
          `<span>You can extend your validity <b>only once</b> every program</span> `,
          `<span>Maximum extension available:20 days</span> `,
          `<span>Extension charges are <b>Rs. 100 per day</b> </span>`,
          `<span>This will be <b>debited from your BN Wallet</b></span> `,
        ],
        description: `<span>If the balance is insufficient, we will still give you the maximum available extension for your program. (20 days)<span>`,
      },
      extention_details: {
        title: `Extension Details`,
        points: [
          `<span>Extending Validity for <b>:${totalDaysNeeded} days</b> </span>`,
          `<span>BN Wallet Debit : <b>Rs. ${userDetails[0].my_wallet}</b></span>`,
          `<span>For Pending Sessions :<b>${userDetails[0].pending_session}</b></span> `,
        ],
      },
      pause_my_program: {
        my_diet_session: {
          title: `My Diet Sessions`,
          total_sessions: userDetails[0].total_sessions,
          sent_sessions: userDetails[0].sent_sessions,
          pending_sessions: userDetails[0].pending_session,
        },
        program_started_on: `<span>Started on : ${moment(
          userDetails[0].start_date,
        ).format(`Do-MMMM-YYYY`)}</span>`,
        program_expires_on: `<span>Expires on : <b>${moment(
          userDetails[0].expiry_date,
        ).format(`Do-MMMM-YYYY`)}</b></span>`,
        program_validity_details: {
          program_validity: userDetails[0].validity,
          additional_validity: userDetails[0].extra_validity,
          total_validity:
            userDetails[0].validity + userDetails[0].extra_validity,
          program_expires_in: `<span>Your program <b>${userDetails[0].program_name}</b> expires in <b> ${userDetails[0].days_left} days </b></span>`,
        },
      },
    };
    const apiResponse = {
      status: true,
      data: data,
    };
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler(`Internal Server Error`, 500));
  }
};

export const updateTipLog = async (req, res, next) => {
  try {
    const { user_id, tip_id } = req.body;
    const { results } = await readRecord({
      table: `${tables.tipsVisitLog}`,
      selectFields: [`user_id`],
      conditions: [
        { field: `user_id`, operator: `=`, value: user_id },
        { field: `DATE(date)`, operator: `=`, value: `CURDATE()`, raw: true },
      ],
    });

    console.log(results, 123123);
    if (results.length > 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: `Tip Already Visited`,
          data: {
            is_wallet_credited: false,
            wallet_amount: 0,
          },
        }),
      );
    }
    const columns = [`user_id`, `tip_id`];
    const values = [user_id, tip_id];
    const insertedResult = await insertRecord(
      tables.tipsVisitLog,
      columns,
      values,
    );
    if (insertedResult.affectedRows === 0) {
      return next(new ErrorHandler(`Error Inserting Tip Log`, 400));
    }
    const wallet_amount = 50;
    await addAmountWallet({
      amount: wallet_amount,
      reason: `Tip Visited`,
      user_id,
    });
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: `Tip Visited Log Successfully`,
        data: {
          is_wallet_credited: true,
          wallet_amount: wallet_amount,
        },
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler(`Internal Server Error`, 500));
  }
};

const ocHomePage = async ({ userDetails }) => {
  try {
    const { results: latestRecipe } = await readRecord({
      table: `${tables.recipe} r`,
      selectFields: [
        `r.id`,
        `r.title`,
        `r.recipe_images`,
        `rt.title as recipe_type_name`,
        `rc.category_name `,
        `r.health_meter`,
        `rt.icon`,
      ],
      joins: [
        {
          type: `LEFT`,
          table: `${tables.recipe_type} rt`,
          on: `r.recipe_type_id = rt.id`,
        },
        {
          type: `LEFT`,
          table: `${tables.category} rc`,
          on: `r.category_id = rc.category_id `,
        },
      ],
      pagination: { limit: 1 },
    });
    const { results: randomHealthRead } = await readRecord({
      table: `${tables.blogPosts} bp`,
      selectFields: [
        `bp.postID `,
        `bp.postTitle`,
        `bp.postBannerSmall`,
        `bp.seoDescription`,
        `bp.postDate`,
        `bp.view_count`,
      ],

      orderBy: [`RAND()`],
      pagination: { limit: 1 },
    });
    const { results: randomSocialPost } = await readRecord({
      table: `${tables.socialPost} social_post`,
      selectFields: [
        `social_post.id`,
        `social_post.title`,
        `social_post.description`,
        `social_post.post_link`,
        `social_post.posted_on`,
        `social_post.video`,
        `social_post.image`,
      ],
      conditions: [
        { field: `social_post.post_sub_type`, operator: `=`, value: `Tips` },
      ],
      pagination: { limit: 1 },
      orderBy: [`RAND()`],
    });
    const middleSection = await homePageMiddleSection({
      userDetails,
    });

    const upperSection = await homePageUpperSection({
      userDetails,
    });
    const data = {
      upper_section: upperSection.upperSection,
      goal_section: {
        goal_list: safeJSONParse(userDetails?.comment, [])?.pending_goals,
        button_text: `Start Again`,
        redirect_screen: `program`,
        screen_params: {
          redirect_id: 134,
        },
      },
      trackers_and_ekit_section: middleSection,
      tip_section: {
        tip_id: randomSocialPost[0].id,
        title: `Tip of the Day`,
        platform: randomSocialPost[0].posted_on,
        is_video: safeJSONParse(randomSocialPost[0].image) ? false : true,
        tip_image: randomSocialPost?.[0]?.image
          ? safeJSONParse(randomSocialPost[0].image)?.[0]?.file?.path || null
          : null,
        tip_video: randomSocialPost?.[0]?.video
          ? safeJSONParse(randomSocialPost[0].video)?.[0]?.file?.path || null
          : null,
        tip_title: randomSocialPost[0].title,
        tip_description: randomSocialPost[0].description,
      },

      success_story: {
        story_id: `73`,
        title: `They Started and Succeeded`,
        success_desc: `Lost 11 kg`,
        success_story_image: `https://${image_guide_base_url}/images/testimonial/before_after_13bdaa1f.png`,
        name: `Ganesh Ramakrishnan`,
        country_flag: `https://${image_guide_base_url}/bn-api-new/images/flags/flags/ae.png`,
        health: `Inch loss,Weight loss,`,
        country_name: `United Arab Emirates`,
      },
      recipe_section: {
        title: `Latest Healthy Recipe`,
        recipe_id: latestRecipe[0].id,
        recipe_name: latestRecipe[0].title,
        recipe_image: safeJSONParse(latestRecipe[0].recipe_images)[0]?.file
          ?.path,
        recipe_category: latestRecipe[0].category_name,
        recipe_description: latestRecipe[0].health_meter,
        recipe_type: latestRecipe[0].recipe_type_name,
        recipe_type_image: safeJSONParse(latestRecipe[0].icon)[0]?.file?.path,
      },
      health_read_section: {
        blog_id: randomHealthRead[0].postID,
        title: `Health Reads`,
        desc: randomHealthRead[0].seoDescription,
        catTitle: randomHealthRead[0].postTitle,
        image: safeJSONParse(randomHealthRead[0].postBannerSmall)[0]?.file
          ?.path,
        added_date: moment(randomHealthRead[0].postDate).format(`DD-MM-YYYY`),
        total_view: Number(randomHealthRead[0].view_count),
      },

      ekit_section: {
        title: `E-kit:Friend For Life`,
        ekit_description: `BN Global Dine-Out & Party Guide`,
        ekit_sub_description: `Gives you the freedom to choose your meals when eating out or at a party.`,
        ekit_image: `https://${image_guide_base_url}/bn-api-new/images/lead_home_screen/E-kit.png`,
      },
    };
    return { data };
    x;
  } catch (error) {
    console.log(error);
  }
};

export const notificationCounts = async (req, res, next) => {
  const { user_id } = req.query;
  if (!user_id) {
    return next(new ErrorHandler("User ID is required", 400));
  }

  try {
    // still fetching from MySQL if userDetails not yet migrated
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [`ud.active_order_id`],
      conditions: [{ field: `ud.user_id`, operator: `=`, value: user_id }],
    });

    const today = new Date();

    // parallel queries
    const [notificationCount, unreadChats, unseenWalletCount] =
      await Promise.all([
        // MongoDB version of the old COUNT query
        userNotification.countDocuments({
          user_id: Number(user_id),
          read_status: false, // previously '0'
          expiry_date: { $gte: today },
        }),

        // MongoDB chat count (already in your code)
        clientEnquiry.countDocuments({
          sender: "mentor",
          is_acknowledged: false,
          user_id: Number(user_id),
        }),

        // wallet count - still from MySQL if not migrated yet
        readRecord({
          table: `${tables.walletLog} wl`,
          selectFields: ["COUNT(wl.id) as count"],
          conditions: [
            { field: "wl.user_id", operator: "=", value: user_id },
            {
              field: "wl.sub_order_id",
              operator: "=",
              value: userDetails?.[0]?.active_order_id,
            },
            { field: "wl.view_flag", operator: "=", value: 0 },
          ],
        }),
      ]);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Notification Counts",
      data: {
        notification_count: notificationCount,
        chat_count: unreadChats,
        wallet_count: unseenWalletCount?.results?.[0]?.count || 0,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(
      new ErrorHandler("Something went wrong while fetching counts", 500),
    );
  }
};
