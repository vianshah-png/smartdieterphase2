import moment from "moment";
import {
  bulkInsertRecords,
  insertRecord,
  readRecord,
  updateRecord,
} from "../../config/query.js";
import {
  image_guide_base_url,
  reasonNotificationMap,
  tables,
} from "../../helper/constant.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import clientEnquiry from "../../models/clientQueryModel.js";
import {
  extractVariables,
  insertUserVisitLog,
  replacePlaceholders,
} from "../../helper/common.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import axios from "axios";
import { client } from "../../config/qDrantConfig.js";

const getWalletById = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("UserId is Required", 400));
    const selectFields = [
      "wl.id",
      "wl.date",
      "wl.action",
      "wl.amount",
      "wl.trans_type",
      "wl.balance_amount",
    ];
    const conditions = [{ field: "wl.user_id", operator: "=", value: user_id }];
    const { results: rows } = await readRecord({
      table: `${tables.walletLog} wl`,
      selectFields,
      conditions,
      orderBy: ["date DESC"],
    });
    const data = rows.map((i) => ({
      wallet_history: {
        id: i.id,
        date: i.date,
        action: i.action,
        amount: i.amount,
        transaction_type:
          i.trans_type === "C"
            ? "Credit"
            : i.trans_type === "D"
              ? "Debit"
              : null,
        total_balance: i.balance_amount,
      },
    }));
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Wallet fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

const getTotalWallet = async (req, res, next) => {
  try {
    const selectFields = [
      "sum(wl.my_wallet) as total_wallet",
      "count(wl.user_id) as total_registered_wallet",
    ];
    const conditions = [{ field: "wl.user_type", operator: "=", value: "1" }];
    const { results: rows } = await readRecord({
      table: `${tables.userDetails} wl`,
      selectFields,
      conditions,
    });
    //  console.log(rows);
    //  return;
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Total Wallet fetched successfully",
      data: rows,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

const getCurrentWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return next(new ErrorHandler("user_id Not Provided", 400));
    }
    if (user_id) {
      const meta_data = {
        device: req.headers.device || req.headers["user-agent"] || "unknown",
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      };
      await insertUserVisitLog({ user_id, page: "wallet", meta_data });
    }
    const { results: rows } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.my_wallet as current_wallet",
        "ud.first_name",
        "ud.user_type",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });

    let wallet_options;

    if (Number(rows[0].user_type) === 0) {
      wallet_options = [
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/wallet_statement.png`,
          menu_title: "View BN Wallet Statement",
          redirect_id: user_id,
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "bn_wallet_statement",
        },
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/earnsomemore.png`,
          menu_title: "Lose Weight & Earn ₹ 100*",
          redirect_id: "",
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "weight_tracker",
        },
        {
          image_icon_url: `https://${image_guide_base_url}/images/refer-a-friend-icon.png`,
          menu_title: "Refer & Earn Upto ₹ 1000*",
          redirect_id: "",
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "refer_a_friend",
        },
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/tips.png`,
          menu_title: "Follow Tip & Earn ₹ 50*",
          redirect_id: "",
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "bn_tips",
        },
      ];
    } else {
      wallet_options = [
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/wallet_statement.png`,
          menu_title: "View BN Wallet Statement",
          redirect_id: user_id,
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "bn_wallet_statement",
        },
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/earnsomemore.png`,
          menu_title: "Earn Some More",
          redirect_id: "",
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "refer_and_earn",
        },
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/percentage.png`,
          menu_title: "Current Offers (Client Privilege)",
          redirect_id: "134",
          mentor_auto_text: "",
          client_auto_text: "",
          redirect_screen: "program",
        },
        {
          image_icon_url: `https://${image_guide_base_url}/images/wallet_screen/percentage.png`,
          menu_title: "Offers for Friends & Family",
          redirect_id: "",
          mentor_auto_text: `<p>Hi ${rows[0].first_name},</p> 
                           <p>I am glad you want to know more about our offers for friends & family.</p> 
                           <p>If you have any family member in mind, do send me his/her</p> 
                           <p>Name:</p> <p>Current Weight:</p> 
                           <p>Health Issues if any:</p> <p>Contact Number:</p>`,
          client_auto_text: "",
          redirect_screen: "refer_and_earn",
        },
      ];
    }

    return res.status(201).json({
      statusCode: 200,
      message: "Current Wallet fetched successfully",
      data:
        rows && rows[0]
          ? (({ user_type, ...rest }) => ({ ...rest }))(rows[0])
          : {},
      wallet_options,
    });
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

const addWallet = async (req, res, next) => {
  try {
    const {
      user_id,
      admin_user_id,
      action,
      amount,
      balance_amount,
      trans_type,
    } = req.body;

    if (
      !user_id ||
      !admin_user_id ||
      !action ||
      !amount ||
      !balance_amount ||
      !trans_type
    ) {
      return next(new ErrorHandler("All fields are required", 400));
    }

    const transactionAmount = parseFloat(amount);
    let newBalance;

    console.log(transactionAmount, newBalance, req.body);

    const currentWalletResult = await readRecord({
      table: tables.userDetails,
      selectFields: ["my_wallet"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    if (!currentWalletResult.results.length) {
      return next(new ErrorHandler("User not found", 404));
    }

    const currentBalance = parseFloat(
      currentWalletResult.results[0].my_wallet || 0,
    );

    if (trans_type.toLowerCase() === "d") {
      if (currentBalance - transactionAmount < 0) {
        return next(new ErrorHandler("Insufficient wallet balance", 400));
      }

      newBalance = currentBalance - transactionAmount;
    } else if (trans_type.toLowerCase() === "c") {
      if (transactionAmount <= 0 || transactionAmount > 10000) {
        return next(new ErrorHandler("Invalid balance amount provided", 400));
      }

      newBalance = currentBalance + transactionAmount;
    } else {
      return next(new ErrorHandler("Invalid transaction type", 400));
    }

    const columns = [
      "user_id",
      "admin_user",
      "action",
      "amount",
      "balance_amount",
      "trans_type",
      "expiry",
    ];
    const expiry = moment().add(7, "days").format("YYYY-MM-DD HH:mm:ss");
    const values = [
      user_id,
      admin_user_id,
      action,
      transactionAmount,
      newBalance,
      trans_type,
      expiry,
    ];

    const newWalletLog = await insertRecord(tables.walletLog, columns, values);
    if (newWalletLog.affectedRows === 0) {
      return next(new ErrorHandler("Error while adding new wallet log", 400));
    }

    const updatedData = { my_wallet: newBalance };
    const condition = { user_id: parseInt(user_id) };
    const updatedWallet = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );

    if (updatedWallet.affectedRows === 0) {
      return next(new ErrorHandler("Error while updating user wallet", 400));
    }

    // ==========================================================
    // === Send Mail Notification based on Wallet Action Type ===
    // ==========================================================
    try {
      const userDetails = await readRecord({
        table: tables.userDetails,
        selectFields: ["first_name", "email_id", "mentor_assigned"],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });

      if (userDetails.results.length) {
        const user = userDetails.results[0];
        const clientName = user.first_name || "Client";
        const email = user.email_id;
        const amountFmt = `Rs. ${parseFloat(transactionAmount).toFixed(2)}`;
        const balanceFmt = `Rs. ${parseFloat(newBalance).toFixed(2)}`;
        const callLink =
          "https://www.balancenutrition.in/app_link/screen_id=294/call_type=45";

        let subject = "";
        let html = "";

        const notification_id = reasonNotificationMap[action];
        if (notification_id) {
          try {
            await axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user_id],
                notification_id,
                sent_via: "mentor_db",
              },
            );
            console.log(`Notification ${notification_id} sent for ${action}`);
          } catch (e) {
            console.log("Notification send failed:", e.message);
          }
        }

        if (action === "BN Policy") {
          subject = "Your Wallet is Debited";
          html = `
            <p>Hi ${clientName},</p>
            <p>Just an update that ${amountFmt} has been debited from your BN Wallet. Your current Wallet Balance is now <b>${balanceFmt}</b>.</p>
            <p><b>Reason:</b></p>
            <p>As per the bi-annual company policy, the balance in your wallet is valid for a specific period, and the debit has been processed according to these guidelines.</p>
            <p><b>P.S.</b> Please reach out to your mentor in case you have any additional queries regarding the debit. You can schedule a call with her using this link: 
            <a href="${callLink}" target="_blank">Schedule a Call</a>.</p>
            <p>Warm Regards,<br>Balance Nutrition Team</p>
          `;
        }

        if (action === "Program Purchase") {
          subject = "BN Wallet Debit Update";
          html = `
            <p>Hi ${clientName},</p>
            <p>Just an update that ${amountFmt} has been debited from your BN Wallet. Your current BN Wallet Balance is <b>${balanceFmt}</b>.</p>
            <p><b>Reason:</b></p>
            <p>The amount debited corresponds to the value of the program you have enrolled in, and it has been deducted from your BN Wallet as part of your program purchase.</p>
            <p><b>P.S.</b> Please reach out to your mentor in case you have any additional queries regarding the debit. You can schedule a call with her using this link: 
            <a href="${callLink}" target="_blank">Schedule a Call</a>.</p>
            <p>Warm Regards,<br>Balance Nutrition Team</p>
          `;
        }

        if (action === "Program Validity") {
          subject = "BN Wallet Debit Update";
          html = `<p>Hi ${clientName},</p>
          <p>Just an update that Rs.${amountFmt} has been debited from your BN Wallet. Your current BN Wallet Balance is <b>Rs.${balanceFmt}</b>.</p>
          <p>Reason:<br />The amount has been debited to extend the validity of your ongoing program. This ensures uninterrupted access to your personalized plans and continued mentor support.</p>
          <p>P.S. Please reach out to your mentor in case you have any questions regarding this debit or your program validity. You can schedule a call with her here: <a href="${callLink}" target="_blank">Schedule a Call</a>.</p>
          <p>Warm Regards,<br />Balance Nutrition Team</p>`;
        }

        if (subject && html) {
          await sendMailUtil({
            from: "clientservices@balancenutrition.in",
            to: email,
            cc: ["accounts@balancenutrition.in"],
            subject,
            html,
          });
        }
      }
    } catch (mailError) {
      console.error("Mail sending failed:", mailError);
      // Don’t interrupt main flow if email fails
    }

    // ==========================================================
    // === Final Response ===
    // ==========================================================
    return res.status(200).json({
      success: true,
      message: "Wallet updated successfully",
      data: {
        new_balance: newBalance,
      },
    });
  } catch (error) {
    console.error("Error in addWallet:", error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500),
    );
  }
};

const BulkAddWallet = async (req, res, next) => {
  try {
    const { amount, reason, added_by, wallet } = req.body;
    const transaction_type = String(
      req.body.transaction_type || "",
    ).toLowerCase();
    const user_status = String(req.body.user_status || "").toLowerCase();
    const sub_user_status = String(
      req.body.sub_user_status || "",
    ).toLowerCase();
    const mentor_id = req.body.mentor_id ? Number(req.body.mentor_id) : null;

    const walletGiven =
      wallet !== undefined && wallet !== null && !isNaN(wallet);

    if (!added_by) {
      return next(new ErrorHandler("Added by is required", 400));
    }
    if (!reason) {
      return next(new ErrorHandler("Reason is required", 400));
    }
    if (
      !walletGiven &&
      (!transaction_type ||
        (transaction_type !== "credit" && transaction_type !== "debit"))
    ) {
      return next(
        new ErrorHandler(
          "Invalid transaction type. Must be 'credit' or 'debit'",
          400,
        ),
      );
    }

    // Build query conditions
    let conditions = [];
    if (user_status === "lead") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "lead",
      });
      if (mentor_id) {
        conditions.push({
          field: "ud.counsellor_assigned",
          operator: "=",
          value: mentor_id,
        });
      }
    } else if (user_status === "active") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "active",
      });
      if (mentor_id) {
        conditions.push({
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        });
      }
    } else if (user_status === "oc") {
      conditions.push({
        field: "ud.user_status",
        operator: "=",
        value: "completed",
      });
      if (mentor_id) {
        conditions.push({
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        });
      }
    }

    if (sub_user_status !== "all" && sub_user_status) {
      conditions.push({
        field: "ud.sub_user_status",
        operator: "=",
        value: sub_user_status,
      });
      if (mentor_id) {
        conditions.push({
          field: "ud.mentor_assigned",
          operator: "=",
          value: mentor_id,
        });
      }
    }

    // Fetch users
    const { results: users } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id", "ud.my_wallet", "ud.active_order_id"],
      conditions,
    });

    if (!users || users.length === 0) {
      return next(new ErrorHandler("No Users Found", 404));
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const updates = [];
      const logs = [];

      for (const user of batch) {
        const oldWallet = Number(user.my_wallet);

        let newWallet = wallet;
        let diffAmount = wallet - Number(oldWallet);
        let transType = transaction_type === "credit" ? "C" : "D";

        console.log(wallet, oldWallet, "Wallet");
        if (diffAmount > 0) {
          updates.push({
            user_id: user.user_id,
            new_wallet: newWallet,
          });

          logs.push({
            user_id: user.user_id,
            sub_order_id: user.active_order_id,
            admin_user: added_by,
            action: reason,
            amount: diffAmount,
            balance_amount: newWallet,
            trans_type: transType,
          });
        } else {
          updates.push({
            user_id: user.user_id,
            new_wallet: newWallet,
          });

          logs.push({
            user_id: user.user_id,
            sub_order_id: user.active_order_id,
            admin_user: added_by,
            action: reason,
            amount: diffAmount,
            balance_amount: newWallet,
            trans_type: transType,
          });
        }
      }

      // Update wallets
      for (const upd of updates) {
        await updateRecord(
          `${tables.userDetails}`,
          {
            old_wallet: { raw: true, query: "my_wallet" },
            my_wallet: { raw: true, query: `${upd.new_wallet}` },
          },
          { user_id: upd.user_id },
        );
      }

      // Insert logs
      for (const log of logs) {
        await insertRecord(
          `${tables.walletLog}`,
          [
            "user_id",
            "sub_order_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
          ],
          [
            log.user_id,
            log.sub_order_id,
            log.admin_user,
            log.action,
            log.amount,
            log.balance_amount,
            log.trans_type,
          ],
        );
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Wallet(s) updated successfully",
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const bulkAddWalletByUserId = async (req, res, next) => {
  try {
    const { amount, reason, added_by, field, ids } = req.body;

    const transaction_type = String(
      req.body.transaction_type || "",
    ).toLowerCase();
    const mentor_id = req.body.mentor_id ? Number(req.body.mentor_id) : null;

    // Validate required fields
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return next(new ErrorHandler("Invalid amount provided", 400));
    }
    if (!added_by) {
      return next(new ErrorHandler("Added by is required", 400));
    }
    if (!reason) {
      return next(new ErrorHandler("Reason is required", 400));
    }
    if (
      !transaction_type ||
      (transaction_type !== "credit" && transaction_type !== "debit")
    ) {
      return next(
        new ErrorHandler(
          "Invalid transaction type. Must be 'credit' or 'debit'",
          400,
        ),
      );
    }
    if (!field || (field !== "user_id" && field !== "email")) {
      return next(
        new ErrorHandler("Invalid field. Must be 'user_id' or 'email'", 400),
      );
    }
    if (!ids || ids.length === 0) {
      return next(new ErrorHandler("Ids array is required", 400));
    }

    let conditions = [];

    // Depending on the field, either use user_id or email to fetch users
    if (field === "user_id") {
      conditions.push({
        field: "ud.user_id",
        operator: "IN",
        value: ids.split(","),
      });
    } else if (field === "email") {
      conditions.push({
        field: "ud.email",
        operator: "IN",
        value: ids.split(","),
      });
    }

    const { results: users } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id", "ud.my_wallet", "ud.active_order_id"],
      conditions,
    });
    console.log(users);
    // return false;
    if (!users || users.length === 0) {
      return next(new ErrorHandler("No Users Found", 404));
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const userIds = batch.map((user) => user.user_id);

      const rawQuery =
        transaction_type === "credit"
          ? `my_wallet + ${Number(amount)}`
          : `my_wallet - ${Number(amount)}`;

      // Ensure this updateRecord method supports raw SQL queries
      await updateRecord(
        `${tables.userDetails}`,
        {
          old_wallet: { raw: true, query: "my_wallet" },
          my_wallet: { raw: true, query: rawQuery },
          // Make sure this is valid syntax for your query system
          wallet_added_date: { raw: true, query: "NOW()" }, // Make sure this works in your DB system
        },
        { user_id: userIds },
      );

      // Insert a log for each user in the batch
      for (const user of batch) {
        const newWalletBalance =
          transaction_type === "credit"
            ? Number(user.my_wallet) + Number(amount)
            : Number(user.my_wallet) - Number(amount);

        await insertRecord(
          `${tables.walletLog}`,
          [
            "user_id",
            "sub_order_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
          ],
          [
            user.user_id,
            user.active_order_id,
            added_by,
            reason,
            amount,
            newWalletBalance,
            transaction_type === "credit" ? "C" : "D",
          ],
        );
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Wallet Updated Successfully",
      }),
    );
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const acknowledgeWalletById = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const updateResult = await updateRecord(
      tables.walletLog,
      {
        view_flag: 1,
      },
      {
        user_id: user_id,
      },
    );
    console.log(updateResult, "Update Result");
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry with the given id", 400));
    } else if (updateResult.affectedRows > 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Wallet log acknowledged successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating wallet log`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error"));
  }
};

const reCreditWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.mentor_assigned",
        "ud.my_wallet",
        "ud.old_wallet",
        "sp.program_id",
        "pm.program_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.mentor_assigned", operator: "!=", value: 196 },
        { field: "ud.old_wallet", operator: ">", value: 1000 },
        {
          field: "ud.user_id",
          operator: "NOT IN",
          value: [
            122870, 26697, 111382, 105390, 64341, 109653, 131387, 74032, 108001,
            1119, 118378, 120018, 22029, 27657, 125519, 130849, 129638, 63125,
            75950, 94306, 128241, 107363, 132547, 132520, 96812, 132229, 10940,
            120279, 107599, 15647, 83046, 13853, 126962, 131935, 131495, 37904,
            17841, 119868, 28261, 132161, 121918, 42054, 42316, 130016, 122844,
            126845, 123974, 132362, 10241, 124692, 52273, 9592, 130748, 77587,
            57233, 57859, 40778, 131273, 77612, 131457, 131790, 93275, 131693,
            9877, 131648, 68538, 75479, 122129, 75131, 130309, 16568, 111334,
            50193, 111981,
          ],
        },
        user_id
          ? {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
      ],
    });

    for (const user of results) {
      const amount = Number(user.old_wallet) - 1000;
      const balanceAmount = Number(user.my_wallet) + amount;
      // Insert into wallet log
      await insertRecord(
        tables.walletLog,
        [
          "user_id",
          "admin_user",
          "action",
          "amount",
          "balance_amount",
          "trans_type",
          "expiry",
        ],
        [
          user.user_id,
          user.mentor_assigned,
          "Wallet Credited Back",
          amount,
          balanceAmount,
          "C",
          moment().add(7, "days").format("YYYY-MM-DD"),
        ],
      );
      // Update user wallet
      await updateRecord(
        tables.userDetails,
        {
          old_wallet: user.my_wallet,
          my_wallet: balanceAmount,
        },
        {
          user_id: user.user_id,
        },
      );

      //       const generateChatMessage = (
      //         firstName,
      //         amount,
      //         balanceAmount,
      //         programName,
      //         programId
      //       ) => {
      //         const commonIntro = `<p>Hi ${firstName},</p>
      // <p>To bring in this new year with positivity &amp; to get to your goals, we have credited your BN Wallet with <strong>Rs.${amount}</strong> which was debited last month. <br />You now have a total of <strong>Rs.${balanceAmount}</strong> in the wallet that you can use to purchase your next program using the double-discount offer :)</p>`;

      //         const programLink = programName
      //           ? `<p>P.S. Check the rates of the ${programName} program that I recommended to you now. <a href='https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${programId}'>Click here</a></p>`
      //           : "";

      //         const callLink = `<p><a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45">Click here</a> to book a call with me &amp; discuss the offers.</p>`;

      //         // return `${commonIntro}${programLink}${callLink}`;

      //         return `<p>Hi ${firstName},</p>
      // <p>It\'s a big surprise for both you &amp; me! <br />On account of Mother\'s Day, Rs.${amount} was credited back in your BN Wallet along with a BONUS!</p>
      // <p>Now, you have a total of Rs.${balanceAmount}, which you can use to purchase your next program on the in-app double discount offers until the 20th of May.</p>
      // <p>Ping me asap to know more :)</p>`;
      //       };
      // Create chat message

      // const chat = generateChatMessage(
      //   user.first_name,
      //   amount,
      //   balanceAmount,
      //   user.program_name,
      //   user.program_id
      // );

      // await clientEnquiry.create({
      //   mentor_id: user.mentor_assigned,
      //   type: "broadcast",
      //   sender: "mentor",
      //   query: chat,
      //   user_id: user.user_id,
      //   name: user.mentor_name,
      // });
    }

    return res
      .status(200)
      .json(new ApiResponse({ message: "Wallet reCredited Successfully" }));
  } catch (error) {
    console.error("reCreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//client credit wallet
const creditWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.mentor_assigned",
        "ud.email_id",
        "ud.my_wallet",
        "ud.old_wallet",
        "sp.program_id",
        "pm.program_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Active"],
        },
        { field: "ud.old_wallet", operator: ">", value: 0 },
        { field: "ud.mentor_assigned", operator: "=", value: 196 },
        user_id
          ? {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
      ],
    });

    for (const user of results) {
      const amount = Number(user.my_wallet) - 1000;
      const balanceAmount =
        Number(user_my_wallet) + (Number(user.my_wallet) - 1000);
      // Insert into wallet log

      if (amount > 0) {
        await insertRecord(
          tables.walletLog,
          [
            "user_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
            "expiry",
          ],
          [
            user.user_id,
            user.mentor_assigned || 0,
            "Wallet Credited Back",
            amount,
            balanceAmount,
            "C",
            moment().add(7, "days").format("YYYY-MM-DD"),
          ],
        );
        // Update user wallet
        await updateRecord(
          tables.userDetails,
          {
            old_wallet: user.my_wallet,
            my_wallet: balanceAmount,
          },
          {
            user_id: user.user_id,
          },
        );
      }
    }
    return res
      .status(200)
      .json(new ApiResponse({ message: "Wallet reCredited Successfully" }));
  } catch (error) {
    console.error("reCreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//lead credit wallet
const leadCreditWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.counsellor_assigned",
        "ud.email_id",
        "ud.my_wallet",
        "ud.old_wallet",
        "sp.program_id",
        "pm.program_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as mentor_name`,
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Lead"],
        },
        { field: "ud.my_wallet", operator: ">=", value: 5000 },
        { field: "ud.my_wallet", operator: "<=", value: 8000 },

        { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        {
          field: "ud.app_version",
          operator: " IN ",
          value: `('1.1.14','5.2.58')`,
          raw: true,
        },
        // {
        //   field: "DATE(ud.wallet_added_date)",
        //   operator: "<>",
        //   value: `${moment().format("YYYY-MM-DD")}`,
        // },
        user_id
          ? {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
      ],
    });

    for (const user of results) {
      const amount = 10000 - Number(user.my_wallet);
      const balanceAmount = 10000;
      // Insert into wallet log

      if (amount > 0) {
        await insertRecord(
          tables.walletLog,
          [
            "user_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
            "expiry",
          ],
          [
            user.user_id,
            user.counsellor_assigned || 0,
            "Coach Bonus",
            amount,
            balanceAmount,
            "C",
            moment().add(7, "days").format("YYYY-MM-DD"),
          ],
        );
        // Update user wallet
        await updateRecord(
          tables.userDetails,
          {
            old_wallet: user.my_wallet,
            my_wallet: balanceAmount,
          },
          {
            user_id: user.user_id,
          },
        );

        const generateChatMessage = (
          firstName,
          amount,
          balanceAmount,
          programName,
          programId,
          mentorWa,
        ) => {
          const commonIntro = `<p>Hi ${firstName || "User"},</p>
        <p>It's a big surprise for both you & me! </p>
<p>Since many of our users were unable to use their wallet balance, the money has been added back only for the next 2 days!</p>
<p>You now have Rs.${balanceAmount} , which will now expire in the next 48 hours.</p>`;

          const programLink = programName
            ? `<p>Click here to check the final price of the 90-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${programId} >${programName}</a></p>`
            : `<p>Click here to check the price of our 60-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=132 >SlimPossible</> program available at 30% off + Wallet Balance Discount</p>`;

          const callLink = `<p>Click here to </p>
<p>WhatsApp me : <a href=wa.me/${mentorWa} >Click Here</a></p>
<p>Schedule a Call: <a href=https://www.balancenutrition.in/app_link/screen_id=29/call_type=30 >Click Here</a></p>`;

          // return `${commonIntro}${programLink}${callLink}`;
          return `<p>Hi ${firstName || "User"},</p><p>I have the facility to add Rs.${amount} to your BN Wallet as a Coach Bonus :)</p><p>I have done just that. Congratulations.<a href="https://www.balancenutrition.in/app_link/screen_id=11"> Click here</a>&nbsp;to view your wallet balance</p>`;
        };
        // Create chat message

        const chat = generateChatMessage(
          user.first_name,
          amount,
          balanceAmount,
          user.program_name,
          user.program_id,
          user.mentor_wa,
        );

        await clientEnquiry.create({
          mentor_id: user.counsellor_assigned || 0,
          type: "broadcast",
          sender: "mentor",
          query: chat,
          user_id: user.user_id,
          name: user.mentor_name || "Mentor",
        });
      }
    }
    return res
      .status(200)
      .json(new ApiResponse({ message: "Wallet reCredited Successfully" }));
  } catch (error) {
    console.error("Lead CreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//lead recredit wallet
const leadReCreditWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.counsellor_assigned",
        "ud.email_id",
        "ud.my_wallet",
        "ud.old_wallet",
        "sp.program_id",
        "pm.program_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as mentor_wa`,        
        `(SELECT ad.call_link FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as call_link`,
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Lead"],
        },
        { field: "ud.old_wallet", operator: ">=", value: 2000 },
        { field: "ud.my_wallet", operator: "<", value: 1000 },
        // { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        // {
        //   field: "ud.app_version",
        //   operator: " IN ",
        //   value: `('1.1.14','5.2.58')`,
        //   raw: true,
        // },
        // {
        //   field: "DATE(ud.wallet_added_date)",
        //   operator: "<>",
        //   value: `${moment().format("YYYY-MM-DD")}`,
        // },
        user_id
          ? {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
      ],
    });

    for (const user of results) {
      const amount = Number(user.old_wallet) ;
      const balanceAmount = Number(user.old_wallet) + Number(user.my_wallet);
      // Insert into wallet log
      if (amount > 0) {
        await insertRecord(
          tables.walletLog,
          [
            "user_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
            "expiry",
          ],
          [
            user.user_id,
            user.counsellor_assigned || 0,
            "Wallet Credit Back",
            amount,
            balanceAmount,
            "C",
            moment().add(7, "days").format("YYYY-MM-DD"),
          ],
        );
        // Update user wallet
        await updateRecord(
          tables.userDetails,
          {
            old_wallet: user.my_wallet,
            my_wallet: balanceAmount,
          },
          {
            user_id: user.user_id,
          },
        );

        const generateChatMessage = (
          firstName,
          amount,
          balanceAmount,
          programName,
          programId,
          mentorWa,
        ) => {
          const commonIntro = `<p>Hi ${firstName || "User"},</p>
       <p>We heard you. After 500+ requests, your expired wallet balance has been restored :)</p>

<p>We've re-credited ₹${amount} in your wallet again. </p>

<p>This is our Women's Day gift for you.</p>

<p><b>Important: Your wallet balance is valid only till 7th March.</b></p>`;

          const programLink = programName
            ? `<p>Click here to check the final price of the 90-day <a href=https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${programId} >${programName}</a> that I had recommended to you.</p>`
            : `<p>Not sure which program is right for you? Let's get on a quick call, and I'll personally recommend the best one based on your goals.</p>`;

          const callLink = `<p>Please feel free to </p>
<p>WhatsApp me : <a href=wa.me/${mentorWa} >Click Here</a></p>
<p>Schedule a Call: <a href=https://www.balancenutrition.in/app_link/screen_id=29/call_type=30 >Click Here</a></p>`;

          return `${commonIntro}${programLink}${callLink}`;
        };
        // Create chat message

        const chat = generateChatMessage(
          user.first_name,
          amount,
          balanceAmount,
          user.program_name,
          user.program_id,
          user.mentor_wa,
        );

        await clientEnquiry.create({
          mentor_id: user.counsellor_assigned || 0,
          type: "broadcast",
          sender: "mentor",
          query: chat,
          user_id: user.user_id,
          name: user.mentor_name || "Mentor",
        });
      }
    }
    return res
      .status(200)
      .json(new ApiResponse({ message: "Wallet reCredited Successfully" }));
  } catch (error) {
    console.error("Lead CreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//lead debit wallet
const leadDebitWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.counsellor_assigned",
        "ud.email_id",
        "ud.my_wallet",
        "ud.old_wallet",
        "sp.program_id",
        "pm.program_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.counsellor_assigned) as mentor_wa`,
        
      ],
      conditions: [
        {
          field: "ud.user_status",
          operator: "IN",
          value: ["Lead"],
        },
        // { field: "ud.old_wallet", operator: ">=", value: 8000 },
        { field: "ud.my_wallet", operator: ">=", value: 1000 },
        { field: "ud.counsellor_assigned", operator: "=", value: 196 },
        // {
        //   field: "ud.app_version",
        //   operator: " IN ",
        //   value: `('1.1.14','5.2.58')`,
        //   raw: true,
        // },
        // {
        //   field: "DATE(ud.wallet_added_date)",
        //   operator: "<>",
        //   value: `${moment().format("YYYY-MM-DD")}`,
        // },
        user_id
          ? {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
      ],
    });

    for (const user of results) {
      const amount = Number(user.my_wallet);
      const balanceAmount = 0;
      // Insert into wallet log

      if (amount > 0) {
        await insertRecord(
          tables.walletLog,
          [
            "user_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
            "expiry",
          ],
          [
            user.user_id,
            user.counsellor_assigned || 0,
            "BN Policy",
            amount,
            balanceAmount,
            "D",
            moment().add(7, "days").format("YYYY-MM-DD"),
          ],
        );
        // Update user wallet
        await updateRecord(
          tables.userDetails,
          {
            old_wallet: user.my_wallet,
            my_wallet: balanceAmount,
          },
          {
            user_id: user.user_id,
          },
        );

        const generateChatMessage = (
          firstName,
          amount,
          balanceAmount,
          programName,
          programId,
          mentorName,
          mentorPhone
        ) => {
          //         const commonIntro = `<p>Hi ${firstName},</p>
          // <p>To bring in this new year with positivity &amp; to get to your goals, we have credited your BN Wallet with <strong>Rs.${amount}</strong> which was debited last month. <br />You now have a total of <strong>Rs.${balanceAmount}</strong> in the wallet that you can use to purchase your next program using the double-discount offer :)</p>`;

          //         const programLink = programName
          //           ? `<p>P.S. Check the rates of the ${programName} program that I recommended to you now. <a href='https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${programId}'>Click here</a></p>`
          //           : "";

          //         const callLink = `<p><a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45">Click here</a> to book a call with me &amp; discuss the offers.</p>`;

          // return `${commonIntro}${programLink}${callLink}`;

          return `<p>Hi ,</p>

<p>An important update regarding your BN Wallet balance. As per the BN policy, Rs.${amount} from your BN Wallet Balance has been debited.</p>

<p>Your Current Wallet Balance is Rs.0</p>

<p>P.S. To check if you can still avail the offers, please connect with Sr.Counselor ${mentorName} on: <a href=wa.me/${mentorPhone}?text=Hi >${mentorPhone}</a>
`;
        };
        // Create chat message

        const chat = generateChatMessage(
          user.first_name,
          amount,
          balanceAmount,
          user.program_name,
          user.program_id,
          user.mentor_name,
          user.mentor_wa
        );

        await clientEnquiry.create({
          mentor_id: user.counsellor_assigned || 0,
          type: "broadcast",
          sender: "mentor",
          query: chat,
          user_id: user.user_id,
          name: user.mentor_name || "Mentor",
        });
      }
    }
    return res
      .status(200)
      .json(new ApiResponse({ message: "Wallet reCredited Successfully" }));
  } catch (error) {
    console.error("Lead CreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const bulkCreditWallet = async (req, res, next) => {
  try {
    const {
      amount,
      mentorId = [],
      userStatus,
      usersIn = [],
      usersNotIn = [],
      reason = "Bulk Wallet Credit",
      expiryInDays = 7,
      notificationId,
      autochat = "",
    } = req.body;

    if (!amount || Number(amount) <= 0 || amount > 10000) {
      return next(
        new ErrorHandler("Invalid amount or High Value not Permitted", 400),
      );
    }

    if (!usersIn && !mentorId && !userStatus && !usersNotIn) {
      return next(
        new ErrorHandler("At least one filter must be provided", 400),
      );
    }

    /* -------------------- FETCH USERS -------------------- */
    const { results: eligibleUsers } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name as name",
        "ud.email_id",
        "ud.my_wallet as old_wallet",
        "au.official_phone as mentor_wa",
        "au.email_id as mentor_email",
        "ud.suggested_program_id as sugg_program_id",
        "sp.suggested_amount as sugg_program_amount",
        "pm.program_name as sugg_program_name",
        "ud.pro_notification",
        "au.admin_user_id as mentor_assigned",
        "au.crm_user as mentor_name",
      ],
      conditions: [
        usersIn.length > 0 && {
          field: "ud.user_id",
          operator: "IN",
          value: usersIn,
        },
        usersNotIn.length > 0 && {
          field: "ud.user_id",
          operator: "NOT IN",
          value: usersNotIn,
        },
        userStatus.length > 0 && {
          field: "ud.user_status",
          operator: "IN",
          value: userStatus,
        },
        mentorId.length > 0 && {
          field: "au.admin_user_id",
          operator: "IN",
          value: mentorId,
        },

        {
          field: "DATE(ud.wallet_added_date)",
          operator: "!=",
          value: "CURDATE()",
          raw: true,
        },
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: `sp.suggested_program_id=ud.suggested_program_id`,
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: `sp.program_id = pm.program_id`,
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: `
            au.admin_user_id = 
            (CASE 
              WHEN ud.user_status = 'Lead' 
              THEN ud.counsellor_assigned 
              ELSE ud.mentor_assigned 
            END)
          `,
        },
      ],
    });

    if (!eligibleUsers.length) {
      return res
        .status(200)
        .json(new ApiResponse({ message: "No eligible users found" }));
    }

    /* -------------------- PREP DATA -------------------- */
    const expiryDate = moment().add(expiryInDays, "days").format("YYYY-MM-DD");

    const walletLogs = [];
    const walletUpdates = [];
    const autoChatPayload = [];
    const userIdsNoti = [];

    for (const user of eligibleUsers) {
      const newBalance = Number(user.old_wallet || 0) + Number(amount);
      user.my_wallet = newBalance;
      if (!user.sugg_program_id) user.sugg_program_id = 134;
      if (!user.sugg_program_name) user.sugg_program_name = "Slim Possible";
      if (!user.sugg_program_amount) user.sugg_program_amount = "8499";
      const replacedAutochat = replacePlaceholders(autochat, user);
      walletUpdates.push({
        table: tables.userDetails,
        data: {
          my_wallet: newBalance,
          old_wallet: user.old_wallet,
          wallet_added_date: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        where: { user_id: user.user_id },
      });

      walletLogs.push([
        user.user_id,
        user.mentor_assigned || mentorId || 0,
        reason,
        amount,
        newBalance,
        "C",
        expiryDate,
      ]);

      if (user.pro_notification == 0) {
        userIdsNoti.push(user.user_id);
      }

      if (autochat?.trim()) {
        autoChatPayload.push({
          mentor_id: user.mentor_assigned,
          type: "broadcast",
          sender: "mentor",
          query: replacedAutochat,
          user_id: user.user_id,
          name: user.mentor_name,
        });
      }
    }

    /* -------------------- EXECUTE BULK OPS -------------------- */

    // Wallet updates (parallel)
    await Promise.all(
      walletUpdates.map((u) => updateRecord(u.table, u.data, u.where)),
    );

    // Wallet logs
    await bulkInsertRecords(
      tables.walletLog,
      [
        "user_id",
        "admin_user",
        "action",
        "amount",
        "balance_amount",
        "trans_type",
        "expiry",
      ],
      walletLogs,
    );

    // Auto chats (bulk)
    if (autoChatPayload.length) {
      await clientEnquiry.insertMany(autoChatPayload);
    }

    // Notifications (single API call)
    if (notificationId && userIdsNoti.length) {
      try {
        await axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: userIdsNoti,
            notification_id: notificationId,
            sent_via: "cron",
          },
        );
      } catch (e) {
        console.error("Bulk notification failed:", e.message);
      }
    }

    return res.status(200).json(
      new ApiResponse({
        message: `Wallet credited for ${eligibleUsers.length} users`,
      }),
    );
  } catch (error) {
    console.error("bulkCreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

//client debit wallet
const debitWallet = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.mentor_assigned",
        "ud.my_wallet",
        "ud.old_wallet",
        "sp.program_id",
        "pm.program_name",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_name`,
        `(SELECT ad.official_phone FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_wa`,
  
      ],
      conditions: [
        { field: "ud.user_status", operator: "=", value: "Completed" },
        { field: "ud.mentor_assigned", operator: "=", value: 196 },
        // { field: "ud.my_wallet", operator: ">=", value: 1000 },
        { field: "ud.my_wallet", operator: ">", value: 0 },
        // {
        //   field: "DATE(ud.wallet_added_date)",
        //   operator: "<>",
        //   value: `${moment().format("YYYY-MM-DD")}`,
        // },
        user_id
          ? {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            }
          : null,
      ].filter(Boolean),
      joins: [
        {
          type: "LEFT",
          table: `${tables.suggestedProgram} sp`,
          on: "sp.suggested_program_id = ud.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sp.program_id",
        },
      ],
    });

    for (const user of results) {
      const amount = Number(user.my_wallet);
      const balanceAmount = 0;
      // Insert into wallet log
      if (amount > 0) {
        await insertRecord(
          tables.walletLog,
          [
            "user_id",
            "admin_user",
            "action",
            "amount",
            "balance_amount",
            "trans_type",
            "expiry",
          ],
          [
            user.user_id,
            user.mentor_assigned || 0,
            "BN Policy",
            amount,
            balanceAmount,
            "D",
            moment().add(7, "days").format("YYYY-MM-DD"),
          ],
        );
        // Update user wallet
        await updateRecord(
          tables.userDetails,
          {
            old_wallet: user.my_wallet,
            my_wallet: balanceAmount,
          },
          {
            user_id: user.user_id,
          },
        );
      }
            const generateChatMessage = (
              firstName,
              amount,
              balanceAmount,
              programName,
              programId,
              mentorName,
              mentorPhone
            ) => {
      //         const commonIntro = `<p>Hi ${firstName},</p>
      // <p>To bring in this new year with positivity &amp; to get to your goals, we have credited your BN Wallet with <strong>Rs.${amount}</strong> which was debited last month. <br />You now have a total of <strong>Rs.${balanceAmount}</strong> in the wallet that you can use to purchase your next program using the double-discount offer :)</p>`;

      //         const programLink = programName
      //           ? `<p>P.S. Check the rates of the ${programName} program that I recommended to you now. <a href='https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${programId}'>Click here</a></p>`
      //           : "";

      //         const callLink = `<p><a href="https://www.balancenutrition.in/app_link/screen_id=29/call_type=45">Click here</a> to book a call with me &amp; discuss the offers.</p>`;

              // return `${commonIntro}${programLink}${callLink}`;

             return `<p>Hi ${firstName},</p>

<p>An important update regarding your BN Wallet balance. As per the BN policy, Rs.${amount} from your BN Wallet Balance has been debited.</p>

<p>Your Current Wallet Balance is Rs.0</p>

<p>P.S. To check if you can still avail the offers, please connect with ${mentorName} on: <a href=wa.me/${mentorPhone}?text=Hi >${mentorPhone}</a>
`;
            };
      // Create chat message

      const chat = generateChatMessage(
        user.first_name || "User",
        amount,
        balanceAmount,
        user.program_name,
        user.program_id,
        user.mentor_name,
        user.mentor_wa
      );

      await clientEnquiry.create({
        mentor_id: user.mentor_assigned || 0,
        type: "broadcast",
        sender: "mentor",
        query: chat,
        user_id: user.user_id,
        name: user.mentor_name || "Mentor",
      });
    }

    return res
      .status(200)
      .json(new ApiResponse({ message: "Wallet Debited Successfully" }));
  } catch (error) {
    console.error("reCreditWallet error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  getWalletById,
  debitWallet,
  addWallet,
  getTotalWallet,
  getCurrentWallet,
  BulkAddWallet,
  bulkAddWalletByUserId,
  acknowledgeWalletById,
  reCreditWallet,
  creditWallet,
  leadCreditWallet,
  leadReCreditWallet,
  leadDebitWallet,
};
