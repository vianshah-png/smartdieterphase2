import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { addAmountWallet } from "../helper/common.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendSSEEvent } from "./dashboardNotificationController.js";
import {
  addSourceLogNew,
  addStatusLogNew,
} from "./salesDashboardControllers/leadsController.js";
import md5 from "md5";
import axios from "axios";
import { text } from "stream/consumers";

const SPIN_SOURCE_ID = 45;

const title = "BN Spin-to-Win Annual Celebration!";
const subtitle = "Take the spin & claim your reward 🎖️";

const segments = [
  { text: "Rs.10000 BN Bonus", color: "#4DD0E1", weight: 1 },
  { text: "Better Luck Next Time", color: "#ffffff", weight: 1 },
  { text: "Rs.5000 BN Bonus", color: "#4DD0E1", weight: 1 },
  { text: "1-Day Detox Free", color: "#ffffff", weight: 1 },
  { text: "Flat 30% Discount", color: "#4DD0E1", weight: 1 },
  { text: "Oops! Try Again", color: "#ffffff", weight: 1 },
  { text: "🧡 Surprise Gift 🧡", color: "#4DD0E1", weight: 1 },
  { text: "3-Day Detox Free", color: "#ffffff", weight: 1 },
];

const mentorWhatsAppMap = {
  52: "9920824179",
  57: "9920869055",
  85: "9820543329",
  88: "9867940635",
  152: "9820328039",
  158: "8433580878",
  183: "9152419847",
  196: "8452956562",
  232: "9653297649",
  240: "9152419847",
  252: "9820792855",
  260: "9820543329",
  263: "9025120894",
  266: "9820455544",
  274: "7021960648",
  275: "9820017056",
  277: "8928001614",
  280: "8928001613",
  284: "8452956562",
  285: "9152419848",
  287: "9653298124",
  304: "8104251721",
  306: "8108273005",
};

const prizePool = [
  {
    text: "Flat 30% Discount",
    color: "#ffffff",
    weight: 1,
    message: `<p>You have got a flat 30% off on all our Online Diet Programs.</p><p><a href="https://www.balancenutrition.in/consultation-landing-page?utm_source=spin%20to%20win">Click here</a> to claim the offer</p>`,
  },
  {
    text: "🧡 Surprise Gift 🧡",
    color: "#4DD0E1",
    weight: 1,
    message: "",
  },
  {
    text: "Rs.10000 BN Bonus",
    color: "#4DD0E1",
    weight: 1,
    message: `<p>Rs.10000 is added to your BN Wallet :)</p><p><a href="https://www.balancenutrition.in/app_link/screen_id=11">Click here</a> to check your Total Wallet Balance</p>`,
  },
  {
    text: "Better Luck Next Time",
    color: "#4DD0E1",
    weight: 1,
    message: `<p>You Have Alreay Used - Spin To Win is Closed</p>`,
  },
];

const getSegments = async (req, res, next) => {
  try {
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Segments retrieved successfully.",
        data: { title, subtitle, segments },
      })
    );
  } catch (err) {
    console.error("Error in getSegments:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

// spinToWin already included above

const spinToWinApp = async (req, res, next) => {
  try {
    const { user_id } = req.body;

    const { results: userRows } = await readRecord({
      selectFields: ["user_type", "counsellor_assigned"],
      table: tables.userDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      pagination: { page: 1, limit: 1 },
    });

    if (!userRows.length) {
      return res.status(404).json(
        new ApiResponse({
          statusCode: 404,
          message: "User not found",
          data: {},
        })
      );
    }

    const userType = Number(userRows[0].user_type);
    const mentorWhatsApp =
      mentorWhatsAppMap[userRows[0].counsellor_assigned] || "919820792855";

    const selectedPrize = userType === 0
      ? {
          ...prizePool[1],
          message: `<p>You have an exclusive discount on our diet programs.</p><p><a href="https://wa.me/${mentorWhatsApp}?text=Hi%2C+I+won+an+%27exclusive+discount%27+using+the+BN+Spin+to+win.+How+can+I+use+it%3F">Click here</a> to claim the offer</p>`
        }
      : prizePool[3];

    const { results: prizeRows } = await readRecord({
      selectFields: ["prize", "message"],
      table: tables.prizeDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      pagination: { page: 1, limit: 1 },
    });

    if (prizeRows.length > 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "User has already spun.",
          data: {
            title,
            subtitle,
            segments,
            user_id,
            spinInfo: {
              canSpin: false,
              prize: prizeRows[0].prize,
            },
            selectedPrize: {
              text: prizeRows[0].prize,
              message: prizeRows[0].message,
            },
          },
        })
      );
    }

    await addSourceLogNew({ source: "spin to win", id: user_id });

    return res.status(200).json(new ApiResponse({
      statusCode: 200,
      message: "Spin allowed",
      data: {
        success: true,
        title,
        subtitle,
        segments,
        spinInfo: { canSpin: true },
        selectedPrize: [selectedPrize],
        user_type: userType,
      },
    }));
  } catch (err) {
    console.error("Error in spinToWinApp:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const submitPrizeApi = async (req, res, next) => {
  try {
    const { user_id, prize, message } = req.body;

    const { results: existing } = await readRecord({
      selectFields: ["prize"],
      table: tables.prizeDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      pagination: { page: 1, limit: 1 },
    });

    const { results: users } = await readRecord({
      selectFields: [
        "user_id",
        "user_type",
        "counsellor_assigned",
        "active_order_id",
        "my_wallet",
        "mentor_assigned",
        "first_name",
        "last_name",
        "user_status",
        "phone_code",
        "phone_number",
        "suggested_program_id",
      ],
      table: tables.userDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      pagination: { page: 1, limit: 1 },
    });

    const user = users[0];
    const userId = user.user_id;
    const userType = Number(user.user_type);

    const { results: suggested_program } = await readRecord({
      selectFields: ["program_id"],
      table: tables.suggestedProgram,
      conditions: [
        {
          field: "suggested_program_id",
          operator: "=",
          value: user.suggested_program_id,
        },
      ],
      pagination: { page: 1, limit: 1 },
    });

    let suggested_program_data = suggested_program[0];

    if (userType === 0) {
      if (user.counsellor_assigned) {
        await insertRecord(
          tables.leadAssignedLog,
          ["counsellor_id", "assigned_by", "user_id"],
          [user.counsellor_assigned, user.counsellor_assigned, userId]
        );
      }

      await updateRecord(
        tables.userDetails,
        { current_lead_source: SPIN_SOURCE_ID },
        { user_id: userId }
      );

      await addSourceLogNew({ source: "spin to win", id: userId });

      sendSSEEvent({
        mentor_id: user.counsellor_assigned,
        data: {
          title: `${user.first_name} ${user.last_name} (Old Lead) has taken Spin`,
          priority: 1,
          redirect: "/?modal=leads_spin_assigned",
        },
      });

      try {
        const { results: mailDataDB } = await readRecord({
          selectFields: [
            "designation",
            "crm_user",
            "official_phone",
            "call_link",
          ],
          table: tables.adminUsers,
          conditions: [
            {
              field: "admin_user_id",
              operator: "=",
              value: user.counsellor_assigned,
            },
          ],
          pagination: { page: 1, limit: 1 },
        });
        let mailDataDBData = mailDataDB[0];

        const watiResponse = await axios.post(
          `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${user.phone_code}${user.phone_number}`,
          {
            template_name: "congratulations_spin_to_win_leads_",
            broadcast_name: "congratulations_spin_to_win_leads_",
            parameters: [
              {
                name: "name",
                value: user.first_name + " " + user.last_name,
              },
              {
                name: "counsellor_designation",
                value: mailDataDBData
                  ? mailDataDBData.designation
                  : "Sr.Nutritionist",
              },
              {
                name: "mentor_name",
                value: mailDataDBData ? mailDataDBData.crm_user : "Barkha",
              },
              {
                name: "mentor_wa",
                value: mailDataDBData
                  ? mailDataDBData.official_phone
                  : "9152419848",
              },
              {
                name: "call_link",
                value: mailDataDBData
                  ? mailDataDBData.call_link
                  : "https://bit.ly/speaktoExpertBarkha",
              },
              {
                name: "sugg_id",
                value: suggested_program_data
                  ? suggested_program_data.program_id
                  : "162",
              },
            ],
          }
        );

        } catch (error) {
          console.warn("Notification send failed:", error.message);
          
        }
   

    }else{
        // sendSSEEvent({
        //   mentor_id: user.mentor_assigned,
        //   data: {
        //     title: `${user.first_name} ${user.last_name} (${user.user_status}) has taken Spin`,
        //     priority: 1,
        //     redirect: "/?modal=spin_data",
        //   },
        // });

        // if (user.my_wallet < 16000) {
        //   await addAmountWallet({
        //     user_id: userId,
        //     amount: 10000,
        //     reason: "Spin Bonus",
        //     sub_order_id: user.active_order_id || 0,
        //   });

        //   try {
        //     await axios.post(`${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`, {
        //       user_ids: [user.user_id],
        //       notification_id: 417,
        //       sent_via: "server",
        //     });
        //   } catch (error) {
        //     console.warn("Notification send failed:", error.message);
        //   }

    //       try {
    //          const { results: mailDataDB } = await readRecord({
    //   selectFields: [
    //     "designation", "crm_user", "official_phone", "call_link"
    //   ],
    //   table: tables.adminUsers,
    //   conditions: [{ field: "admin_user_id", operator: "=", value: user.mentor_assigned }],
    //   pagination: { page: 1, limit: 1 },
    // });
    // let mailDataDBData = mailDataDB[0];
    
    //  const watiResponse = await axios.post(
    //       `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${user.phone_code}${user.phone_number}`,
    //       {
    //         template_name: "your_reward_is_here_client_july_2025",
    //         broadcast_name: "your_reward_is_here_client_july_2025",
    //         parameters: [
    //           {
    //             name: "name",
    //             value: user.first_name + " " + user.last_name,
    //           },
    //           {
    //             name: "counsellor_designation",
    //             value: mailDataDBData ? mailDataDBData.designation : "Sr.Nutritionist",
    //           },
    //           {
    //             name: "mentor_name",
    //             value: mailDataDBData ? mailDataDBData.crm_user : "Barkha",
    //           },
    //           {
    //             name: "mentor_wa",
    //             value: mailDataDBData ? mailDataDBData.official_phone : "9152419848",
    //           },
    //           {
    //             name: "call_link",
    //             value: mailDataDBData ? mailDataDBData.call_link : "https://bit.ly/speaktoExpertBarkha",
    //           },
    //           {
    //             name: "sugg_id",
    //             value: suggested_program_data ? suggested_program_data.program_id : "162",
    //           }
    //         ],
    //       }
    //     );   
            
    //       } catch (error) {
    //          console.warn("Notification send failed:", error.message);
    //       }

        // }

    }

    if (existing.length > 0) {
      await updateRecord(tables.prizeDetails, { prize, message }, { user_id });
    } else {
      await insertRecord(
        tables.prizeDetails,
        ["user_id", "prize", "message"],
        [user_id, prize, message]
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Prize updated successfully",
        data: { success: true },
      })
    );
  } catch (err) {
    console.error("Error in submitPrizeApi:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const spinToWin = async (req, res, next) => {
  try {
    const { phone_code, phone, name } = req.query;
    const fullPhone = `${phone_code} ${phone}`;
    const email = `${phone}@bn.com`;

    const { results: users } = await readRecord({
      selectFields: [
        "user_id",
        "user_type",
        "counsellor_assigned",
        "active_order_id",
        "my_wallet",
        "mentor_assigned",
        "first_name",
        "last_name",
        "user_status",
      ],
      table: tables.userDetails,
      conditions: [{ field: "phone_number", operator: "=", value: phone }],
      pagination: { page: 1, limit: 1 },
    });

    if (users.length > 0) {
      const user = users[0];
      const userId = user.user_id;
      const userType = Number(user.user_type);

      const { results: prizeRows } = await readRecord({
        selectFields: ["prize", "message"],
        table: tables.prizeDetails,
        conditions: [{ field: "user_id", operator: "=", value: userId }],
        pagination: { page: 1, limit: 1 },
      });

      console.log("Prize Rows:", prizeRows);
      console.log("User Type:", users);

      if (prizeRows.length > 0 && prizeRows[0].prize) {
        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: "User has already spun the wheel.",
            data: {
              title,
              subtitle,
              segments,
              userId,
              userType,
              spinInfo: { canSpin: false, prize: prizeRows[0].prize },
              selectedPrize: {
                text: prizeRows[0].prize,
                message: prizeRows[0].message,
              },
            },
          })
        );
      }

      await addSourceLogNew({ source: "spin to win", id: userId });

      if (userType === 0) {
        // Old Lead
        const mentorWhatsApp =
          mentorWhatsAppMap[user.counsellor_assigned] || "919820792855";

        const selectedPrize = {
          ...prizePool[1],
          message: `<p>You have an exclusive discount on our diet programs.</p><p><a href="https://wa.me/${mentorWhatsApp}?text=Hi%2C+I+won+an+%27exclusive+discount%27+using+the+BN+Spin+to+win.+How+can+I+use+it%3F">Click here</a> to claim the offer</p>`,
        };

        if (user.counsellor_assigned) {
          await insertRecord(
            tables.leadAssignedLog,
            ["counsellor_id", "assigned_by", "user_id"],
            [user.counsellor_assigned, user.counsellor_assigned, userId]
          );
        }

        await updateRecord(
          tables.userDetails,
          { current_lead_source: SPIN_SOURCE_ID },
          { user_id: userId }
        );

        await insertRecord(
          tables.prizeDetails,
          ["user_id", "prize", "message"],
          [userId, prizePool[1].text, selectedPrize.message]
        );

        sendSSEEvent({
          mentor_id: user.counsellor_assigned,
          data: {
            title: `${user.first_name} ${user.last_name} (Old Lead) has taken Spin`,
            priority: 1,
            redirect: "/?modal=leads_spin_assigned",
          },
        });

        return res.status(200).json(
          new ApiResponse({
            statusCode: 200,
            message: "Spin allowed",
            data: {
              title,
              subtitle,
              segments,
              userId,
              userType,
              spinInfo: { canSpin: true },
              selectedPrize: [selectedPrize],
              message: selectedPrize.message,
            },
          })
        );
      } else {
        // Client
        const selectedPrize = prizePool[3];

        // await insertRecord(tables.prizeDetails,
        //   ["user_id", "prize", "message"],
        //   [userId, selectedPrize.text, selectedPrize.message]);

        // sendSSEEvent({
        //   mentor_id: user.mentor_assigned,
        //   data: {
        //     title: `${user.first_name} ${user.last_name} (${user.user_status}) has taken Spin`,
        //     priority: 1,
        //     redirect: "/?modal=spin_data",
        //   },
        // });

        // if (user.my_wallet < 16000) {
        //   await addAmountWallet({
        //     user_id: userId,
        //     amount: 10000,
        //     reason: "Spin Bonus",
        //     sub_order_id: user.active_order_id || 0,
        //   });

        //   try {
        //     await axios.post(`${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`, {
        //       user_ids: [user.user_id],
        //       notification_id: 417,
        //       sent_via: "server",
        //     });
        //   } catch (error) {
        //     console.warn("Notification send failed:", error.message);
        //   }
        // }

        return res.status(200).json(new ApiResponse({
          statusCode: 200,
          message: "Prize assigned successfully",
          data: {
            title,
            subtitle,
            segments,
            userId,
            userType,
            spinInfo: { canSpin: false },
            selectedPrize: [selectedPrize],
            message: selectedPrize.message,
          },
        }));
      }
    } else {
      // New User
      const insertResult = await insertRecord(
        tables.userDetails,
        [
          "user_type",
          "phone",
          "primary_lead_source",
          "current_lead_source",
          "first_name",
          "phone_code",
          "phone_number",
          "email_id",
          "enc_password",
          "plain_password",
          "goal_weight",
          "old_wallet",
          "gender",
          "referred_by",
        ],
        [
          "0",
          fullPhone,
          SPIN_SOURCE_ID,
          SPIN_SOURCE_ID,
          name,
          phone_code,
          phone,
          email,
          md5("123456"),
          "123456",
          "0",
          0,
          "0",
          0,
        ]
      );

      const newUserId = insertResult?.insertId;
      const selectedPrize = prizePool[0];

      await insertRecord(
        tables.prizeDetails,
        ["user_id", "prize", "message"],
        [newUserId, selectedPrize.text, selectedPrize.message]
      );

      await addSourceLogNew({ source: "spin to win", id: newUserId });
      await addStatusLogNew({
        status: "Lead",
        sub_status: "Inactive",
        id: newUserId,
      });

      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "New user created and prize assigned.",
          data: {
            title,
            subtitle,
            segments,
            userId: newUserId,
            userType: 0,
            spinInfo: { canSpin: true },
            selectedPrize: [selectedPrize],
            message: selectedPrize.message,
          },
        })
      );
    }
  } catch (err) {
    console.error("Error in spinToWin:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { getSegments, spinToWin, spinToWinApp, submitPrizeApi };
