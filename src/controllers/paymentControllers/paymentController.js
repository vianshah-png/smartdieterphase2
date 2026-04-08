import moment from "moment";
import { ZodError } from "zod";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import razorPay from "../../config/razorpayConfig.js";
import { formatZodErrors } from "../../helper/commonHelper.js";
import { tables, image_guide_base_url } from "../../helper/constant.js";
import {
  handleGuidePayment,
  handleProgramPayment,
  handleServicePayment,
} from "../../helper/paymentHelper.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import {
  createPaymentLink,
  verifyRazorpaySignature,
} from "../../utils/createPaymentLink.js";
import { createPaymentLinkSchema } from "../../validators/createPaymentValidators.js";
import { sendSSEEvent } from "../dashboardNotificationController.js";
import "dotenv/config";
import md5 from "md5";
import { getFormattedUserData } from "../../helper/mentordbHelpers.js";
import { insertOrderLog } from "../../helper/common.js";
import crypto from "crypto";
import dotenv from "dotenv";
import { paidOnHoldConfirmation } from "../contentDashboardControllers/clientController.js";
import { handleProductOrderPaymentFailed, verifyProductOrderPayment } from "./productPaymentController.js";
dotenv.config();

//----- switch case functions //

const createPaymentLinkController = async (req, res, next) => {
  const { source } = req.headers;

  try {
    const body = createPaymentLinkSchema.parse(req.body);
    const {
      program_id,
      program_session_id,
      guide_id,
      service_id,
      email_id,
      sub_order_id,
      gender,
      phone_code,
      phone_number,
      payment_amount,
      currency = "INR",
      expiry_at,
      country_id,
      admin_user_id,
      user_id,
    } = body;

    const { results: adminDetails } = await readRecord({
      table: `${tables.adminUsers}`,
      selectFields: ["first_name", "last_name"],
      conditions: [
        { field: "admin_user_id", operator: "=", value: admin_user_id },
      ],
    });

    if (program_id) {
      const [
        { results: ProgramDetails },
        { results: ProgramSession },
        { results: UserDetails },
      ] = await Promise.all([
        readRecord({
          table: `${tables.programsMaster}`,
          selectFields: ["program_id", "program_name"],
          conditions: [
            {
              field: "program_id",
              operator: "=",
              value: program_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.programSession}`,
          selectFields: ["program_duration"],
        }),
        readRecord({
          table: `${tables.userDetails}`,
          selectFields: [
            "first_name",
            "last_name",
            "email_id",
            "phone_code",
            "phone_number",
          ],
          conditions: [
            {
              field: "user_id",
              operator: "=",
              value: user_id,
            },
          ],
        }),
      ]);

      if (!user_id) {
        const columns = [
          "first_name",
          "last_name",
          "gender",
          "email_id",
          "phone_code",
          "phone_number",
          "phone",
          "country_id",
          "user_type",
          "sales_status",
          "sub_sales_status",
          "user_status",
          "sub_user_status",
        ];
        const values = [
          email_id.split("@")[0],
          "lead",
          gender ?? "0",
          email_id,
          phone_code,
          phone_number,
          `${phone_code} ${phone_number}`,
          country_id,
          "0",
          "2",
          "To Pay",
          "Lead",
          "Inactive",
        ];
        const newLead = await insertRecord(
          `${tables.userDetails}`,
          columns,
          values
        );
        if (newLead.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While registering new lead", 400)
          );
        }

        const LeadPaymentLink = await createPaymentLink({
          amount: payment_amount,
          currency,
          expire_by: moment.utc(expiry_at).unix(),
          customerDetails: {
            email: email_id,
            phone: `${phone_code} ${phone_number}`,
          },
          notes: {
            description: `Payment Link For ${email_id.split("@")[0]} For ${
              ProgramDetails[0].program_name
            } (${ProgramSession[0].program_duration})`,
            user: `${email_id.split("@")[0]} ${"Lead"}`,
            email: email_id,
            phone: `${phone_code} ${phone_number}`,
            created_by: `${adminDetails[0].first_name} ${adminDetails[0].last_name}`,
          },
          source,
        });

        const newPaymentLinkColumns = [
          "payment_link_id",
          "email",
          "phone_number",
          "program_id",
          "program_session_id",
          "amount",
          "expiry_at",
          "source",
          "payment_link",
          "user_id",
          "admin_user_id",
        ];
        const newPaymentLinkValues = [
          LeadPaymentLink.id,
          email_id,
          phone_number,
          program_id,
          program_session_id,
          payment_amount,
          expiry_at,
          source ? source : "Other",
          LeadPaymentLink.short_url,
          newLead.insertId,
          admin_user_id,
        ];
        const newPaymentLinkEntry = await insertRecord(
          `${tables.paymentLinks}`,
          newPaymentLinkColumns,
          newPaymentLinkValues
        );
        if (newPaymentLinkEntry.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While adding new payment link", 400)
          );
        }

        const apiresponse = new ApiResponse({
          statusCode: 201,
          message: "Payment Link Created Successfully",
          data: {
            payment_link: LeadPaymentLink.short_url,
            email_id: email_id, // From request body (new lead)
            phone_number: phone_number,
          },
        });
        return res.status(201).json(apiresponse);
      } else {
        const clientPaymentLink = await createPaymentLink({
          amount: payment_amount,
          currency,
          expire_by: moment.utc(expiry_at).unix(),
          customerDetails: {
            email: UserDetails[0].email_id,
            phone: `${UserDetails[0].phone_code} ${UserDetails[0].phone_number}`,
          },
          notes: {
            description: `Payment Link For ${
              UserDetails[0].first_name + UserDetails[0].last_name
            } For ${ProgramDetails[0].program_name} (${
              ProgramSession[0].program_duration
            })`,
            user: `${UserDetails[0].first_name} ${UserDetails[0].last_name}`,
            email: UserDetails[0].email_id,
            phone: `${UserDetails[0].phone_code} ${UserDetails[0].phone_number}`,
            created_by: `${adminDetails[0].first_name} ${adminDetails[0].last_name}`,
          },
          source,
        });

        const newPaymentLinkColumns = [
          "payment_link_id",
          "email",
          "phone_number",
          "program_id",
          "program_session_id",
          "amount",
          "expiry_at",
          "source",
          "payment_link",
          "user_id",
          "admin_user_id",
        ];
        const newPaymentLinkValues = [
          clientPaymentLink.id,
          UserDetails[0].email_id,
          UserDetails[0].phone_number,
          program_id,
          program_session_id,
          payment_amount,
          expiry_at,
          source ? source : "Other",
          clientPaymentLink.short_url,
          user_id,
          admin_user_id,
        ];
        const newPaymentLinkEntry = await insertRecord(
          `${tables.paymentLinks}`,
          newPaymentLinkColumns,
          newPaymentLinkValues
        );
        if (newPaymentLinkEntry.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While adding new payment link", 400)
          );
        }

        const apiresponse = new ApiResponse({
          statusCode: 201,
          message: "Payment Link Created Successfully",
          data: {
            payment_link: clientPaymentLink.short_url,
            email_id: UserDetails[0].email_id,
            phone_number: UserDetails[0].phone_number,
          },
        });
        return res.status(201).json(apiresponse);
      }
    }

    if (service_id) {
      const [{ results: ServiceDetails }, { results: UserDetails }] =
        await Promise.all([
          readRecord({
            table: `${tables.Services}`,
            selectFields: ["service_name"],
            conditions: [{ field: "id", operator: "=", value: service_id }],
          }),
          readRecord({
            table: `${tables.userDetails}`,
            selectFields: [
              "first_name",
              "last_name",
              "email_id",
              "phone_code",
              "phone_number",
              "active_order_id",
            ],
            conditions: [
              {
                field: "user_id",
                operator: "=",
                value: user_id,
              },
            ],
          }),
        ]);

      const ServicePaymentLink = await createPaymentLink({
        amount: payment_amount,
        currency,
        expire_by: moment.utc(expiry_at).unix(),
        customerDetails: {
          email: UserDetails[0].email_id,
          phone: `${UserDetails[0].phone_code} ${UserDetails[0].phone_number}`,
        },
        notes: {
          description: `Payment Link For ${
            UserDetails[0].first_name + UserDetails[0].last_name
          } For ${ServiceDetails[0].service_name}`,
          user: `${UserDetails[0].first_name} ${UserDetails[0].last_name}`,
          email: UserDetails[0].email_id,
          phone: `${UserDetails[0].phone_code} ${UserDetails[0].phone_number}`,
          created_by: `${adminDetails[0].first_name} ${adminDetails[0].last_name}`,
        },
        source,
      });

      const newPaymentLinkColumns = [
        "payment_link_id",
        "email",
        "phone_number",
        "service_id",
        "amount",
        "expiry_at",
        "source",
        "payment_link",
        "user_id",
        "admin_user_id",
        "sub_order_id",
      ];
      const newPaymentLinkValues = [
        ServicePaymentLink.id,
        UserDetails[0].email_id,
        UserDetails[0].phone_number,
        service_id,
        payment_amount,
        expiry_at,
        source ? source : "Other",
        ServicePaymentLink.short_url,
        user_id,
        admin_user_id,
        sub_order_id ? sub_order_id : UserDetails[0].active_order_id,
      ];
      const newPaymentLinkEntry = await insertRecord(
        `${tables.paymentLinks}`,
        newPaymentLinkColumns,
        newPaymentLinkValues
      );
      if (newPaymentLinkEntry.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While adding new payment link", 400)
        );
      }

      if (Number(service_id) === 1) {
        const updatedBalanceAmountDueDate = await updateRecord(
          `${tables.subOrderPrograms}`,
          { due_date: expiry_at },
          {
            sub_order_id: sub_order_id
              ? sub_order_id
              : UserDetails[0].active_order_id,
          }
        );
        if (updatedBalanceAmountDueDate.affectedRows === 0) {
          return next(
            new ErrorHandler(
              "Error While updating due date in sub_order_programs",
              400
            )
          );
        }
        const apiresponse = new ApiResponse({
          statusCode: 200,
          message: `Updated Balance Due Date For ${sub_order_id}`,
          data: {
            payment_link: ServicePaymentLink.short_url,
            email_id: UserDetails[0].email_id, // From UserDetails
            phone_number: UserDetails[0].phone_number,
          },
        });
        return res.status(200).json(apiresponse);
      }

      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Payment Link Created Successfully",
        data: {
          payment_link: ServicePaymentLink.short_url,
          email_id: UserDetails[0].email_id,
          phone_number: UserDetails[0].phone_number,
        },
      });
      return res.status(201).json(apiresponse);
    }

    if (guide_id) {
      const [{ results: GuideDetails }, { results: UserDetails }] =
        await Promise.all([
          readRecord({
            table: `${tables.guides}`,
            selectFields: ["guide"],
            conditions: [{ field: "guide_id", operator: "=", value: guide_id }],
          }),
          readRecord({
            table: `${tables.userDetails}`,
            selectFields: [
              "first_name",
              "last_name",
              "email_id",
              "phone_code",
              "phone_number",
            ],
            conditions: [
              {
                field: "user_id",
                operator: "=",
                value: user_id,
              },
            ],
          }),
        ]);

      if (!user_id) {
        const columns = [
          "first_name",
          "last_name",
          "gender",
          "email_id",
          "phone_code",
          "phone_number",
          "phone",
          "country_id",
          "user_type",
          "sales_status",
          "sub_sales_status",
          "user_status",
          "sub_user_status",
        ];
        const values = [
          email_id.split("@")[0],
          "lead",
          gender ?? "0",
          email_id,
          phone_code,
          phone_number,
          `${phone_code} ${phone_number}`,
          country_id,
          "0",
          "2",
          "To Pay",
          "Lead",
          "Inactive",
        ];
        const newLead = await insertRecord(
          `${tables.userDetails}`,
          columns,
          values
        );
        if (newLead.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While registering new lead", 400)
          );
        }

        const LeadPaymentLink = await createPaymentLink({
          amount: payment_amount,
          currency,
          expire_by: moment.utc(expiry_at).unix(),
          customerDetails: {
            email: email_id,
            phone: `${phone_code} ${phone_number}`,
          },
          notes: {
            description: `Payment Link For ${email_id.split("@")[0]} For ${
              GuideDetails[0].guide
            }`,
            user: `${email_id.split("@")[0]} ${"Lead"}`,
            email: email_id,
            phone: `${phone_code} ${phone_number}`,
            created_by: `${adminDetails[0].first_name} ${adminDetails[0].last_name}`,
          },
          source,
        });

        const newPaymentLinkColumns = [
          "payment_link_id",
          "email",
          "phone_number",
          "guide_id",
          "amount",
          "expiry_at",
          "source",
          "payment_link",
          "user_id",
          "admin_user_id",
        ];
        const newPaymentLinkValues = [
          LeadPaymentLink.id,
          email_id,
          phone_number,
          guide_id,
          payment_amount,
          expiry_at,
          source ? source : "Other",
          LeadPaymentLink.short_url,
          newLead.insertId,
          admin_user_id,
        ];
        const newPaymentLinkEntry = await insertRecord(
          `${tables.paymentLinks}`,
          newPaymentLinkColumns,
          newPaymentLinkValues
        );
        if (newPaymentLinkEntry.affectedRows === 0) {
          return next(
            new ErrorHandler("Error While adding new payment link", 400)
          );
        }

        const apiresponse = new ApiResponse({
          statusCode: 201,
          message: "Payment Link Created Successfully",
          data: {
            payment_link: LeadPaymentLink.short_url,
            email_id: email_id, // From request body (new lead)
            phone_number: phone_number,
          },
        });
        return res.status(201).json(apiresponse);
      }

      const clientPaymentLink = await createPaymentLink({
        amount: payment_amount,
        currency,
        expire_by: moment.utc(expiry_at).unix(),
        customerDetails: {
          email: UserDetails[0].email_id,
          phone: `${UserDetails[0].phone_code} ${UserDetails[0].phone_number}`,
        },
        notes: {
          description: `Payment Link For ${
            UserDetails[0].first_name + UserDetails[0].last_name
          } For ${GuideDetails[0].guide}`,
          user: `${UserDetails[0].first_name} ${UserDetails[0].last_name}`,
          email: UserDetails[0].email_id,
          phone: `${UserDetails[0].phone_code} ${UserDetails[0].phone_number}`,
          created_by: `${adminDetails[0].first_name} ${adminDetails[0].last_name}`,
        },
        source,
      });

      const newPaymentLinkColumns = [
        "payment_link_id",
        "email",
        "phone_number",
        "guide_id",
        "amount",
        "expiry_at",
        "source",
        "payment_link",
        "user_id",
        "admin_user_id",
      ];
      const newPaymentLinkValues = [
        clientPaymentLink.id,
        UserDetails[0].email_id,
        UserDetails[0].phone_number,
        guide_id,
        payment_amount,
        expiry_at,
        source ? source : "Other",
        clientPaymentLink.short_url,
        user_id,
        admin_user_id,
      ];
      const newPaymentLinkEntry = await insertRecord(
        `${tables.paymentLinks}`,
        newPaymentLinkColumns,
        newPaymentLinkValues
      );
      if (newPaymentLinkEntry.affectedRows === 0) {
        return next(
          new ErrorHandler("Error While adding new payment link", 400)
        );
      }

      const apiresponse = new ApiResponse({
        statusCode: 201,
        message: "Payment Link Created Successfully",
        data: {
          payment_link: clientPaymentLink.short_url,
          email_id: UserDetails[0].email_id,
          phone_number: UserDetails[0].phone_number,
        },
      });
      return res.status(201).json(apiresponse);
    }
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return formatZodErrors(error, res);
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const createRazorPayOrder = async (req, res, next) => {
  try {
    const {
      amount,
      currency = "INR",
      program_id,
      user_id,
      program_session_id,
    } = req.body;

    if (!amount || !program_id || !user_id || !program_session_id) {
      return next(
        new ErrorHandler(
          "Missing required fields: amount, program_id, user_id, or program_session_id",
          400
        )
      );
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      return next(new ErrorHandler("Amount must be a positive number", 400));
    }

    const [
      { results: userDetails },
      { results: programDetails },
      { results: programSessionDetails },
    ] = await Promise.all([
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["CONCAT(ud.first_name,' ',ud.last_name) as full_name"],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      }),
      readRecord({
        table: `${tables.programsMaster} pm`,
        selectFields: ["pm.program_name"],
        conditions: [
          { field: "pm.program_id", operator: "=", value: program_id },
        ],
      }),
      readRecord({
        table: `${tables.programSession} ps`,
        selectFields: ["ps.program_duration"],
        conditions: [
          {
            field: "ps.program_session_id",
            operator: "=",
            value: program_session_id,
          },
        ],
      }),
    ]);

    if (
      !userDetails.length ||
      !programDetails.length ||
      !programSessionDetails.length
    ) {
      return next(new ErrorHandler("User, program, or session not found", 404));
    }

    const userFullName = userDetails[0].full_name;
    const programName = programDetails[0].program_name;
    const programDuration = programSessionDetails[0].program_duration;

    const options = {
      amount: Number(Number(amount) * 100),
      currency: currency,
      notes: {
        merchant: "Balance Nutrition",
        user_id: user_id,
        program_id: program_id,
        program_session_id: program_session_id,
        user_name: userFullName,
        program_name: programName,
        program_duration: programDuration,
      },
    };

    const order = await razorPay.orders.create(options);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Razorpay order created successfully",
      data: {
        order_id: order.id,
        amount: amount,
        currency: order.currency,
        user_id: user_id,
        program_id: program_id,
        program_session_id: program_session_id,
        user_name: userFullName,
        program_name: programName,
        program_duration: programDuration,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in createRazorPayOrder:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const createRazorPayOrderForGuidePurchase = async (req, res, next) => {
  try {
    const { amount, currency = "INR", user_id, guide_duration } = req.body;

    if (!amount || !user_id) {
      return next(
        new ErrorHandler("Missing required fields: amount or user_id", 400)
      );
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      return next(new ErrorHandler("Amount must be a positive number", 400));
    }

    const [{ results: userDetails }] = await Promise.all([
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["CONCAT(ud.first_name,' ',ud.last_name) as full_name"],
        conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      }),
    ]);

    if (!userDetails.length) {
      return next(new ErrorHandler("User not found", 404));
    }

    const userFullName = userDetails[0].full_name;

    const options = {
      amount: Number(Number(amount) * 100),
      currency: currency,
      notes: {
        merchant: "Balance Nutrition",
        user_id: user_id,
        user_name: userFullName,
        program_name: "Go Pro Guide Purchase",
        program_duration: guide_duration,
      },
    };

    const order = await razorPay.orders.create(options);

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Razorpay order created successfully",
      data: {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        user_id: user_id,
        user_name: userFullName,
        program_name: "Go Pro Guide Purchase",
        program_duration: guide_duration,
      },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error in createRazorPayOrder:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const verifyPaymentController = async (req, res, next) => {
  try {
    const { razorpay_payment_link_id, razorpay_payment_link_status } =
      req.query;
    const payment_status = razorpay_payment_link_status;

    const isverified = verifyRazorpaySignature(req);
    if (!isverified) {
      return next(new ErrorHandler("Invalid signature", 400));
    }

    if (payment_status === "failed") {
      const data = { payment_status: "failed" };
      const condition = { payment_link_id: razorpay_payment_link_id };
      await updateRecord(`${tables.paymentLinks}`, data, condition);

      const apiresponse = new ApiResponse({
        statusCode: 400,
        message: `Payment Failed`,
      });
      return res.status(400).json(apiresponse);
    }

    const { results } = await readRecord({
      table: `${tables.paymentLinks} pl`,
      selectFields: [
        "pl.sub_order_id",
        "pl.program_id",
        "pl.program_session_id",
        "pl.phone_number",
        "pl.service_id",
        "pl.guide_id",
        "pl.amount",
        "pl.user_id",
        "pl.admin_user_id",
      ],
      conditions: [
        {
          field: "pl.payment_link_id",
          operator: "=",
          value: razorpay_payment_link_id,
        },
        {
          field: "pl.payment_status",
          operator: "=",
          value: "pending",
        },
      ],
    });
    const paymentLinkDetails = results[0];
    if (!paymentLinkDetails) {
      return next(new ErrorHandler("Payment Link Not Found", 404));
    }
    if (paymentLinkDetails.sub_order_id && paymentLinkDetails.service_id) {
      const { success } = await handleServicePayment({
        sub_order_id: paymentLinkDetails.sub_order_id,
        service_id: paymentLinkDetails.service_id,
        amount: paymentLinkDetails.amount,
        user_id: paymentLinkDetails.user_id,
        admin_id: paymentLinkDetails.admin_user_id,
      });
      if (!success) {
        return next(
          new ErrorHandler("Error while handling service payment", 500)
        );
      }
    }
    if (paymentLinkDetails.guide_id) {
      const { success } = await handleGuidePayment({
        guide_id: paymentLinkDetails.guide_id,
        user_id: paymentLinkDetails.user_id,
        amount: paymentLinkDetails.amount,
        admin_user_id: paymentLinkDetails.admin_user_id,
        phone_number: paymentLinkDetails.phone_number,
      });
      if (!success) {
        return next(
          new ErrorHandler("Error while handling guide payment", 500)
        );
      }
    }
    if (paymentLinkDetails.program_id) {
      handleProgramPayment({
        admin_user_id: paymentLinkDetails.admin_user_id,
        amount: paymentLinkDetails.amount,
        phone_number: paymentLinkDetails.phone_number,
        program_id: paymentLinkDetails.program_id,
        program_session_id: paymentLinkDetails.program_session_id,
        user_id: paymentLinkDetails.user_id,
      });
    }
    await updateRecord(
      `${tables.paymentLinks}`,
      { payment_status: "paid" },
      { payment_link_id: razorpay_payment_link_id }
    );

    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.first_name",
        "ud.last_name",
        "ud.mentor_assigned",
        "ud.counsellor_assigned",
        "ud.user_type",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: paymentLinkDetails.user_id,
        },
      ],
    });
    let notificationTitle, admin_id;
    if (paymentLinkDetails.sub_order_id && paymentLinkDetails.service_id) {
      const { results: serviceDetails } = await readRecord({
        table: `${tables.Services} s`,
        selectFields: ["s.service_name"],
        conditions: [
          {
            field: "s.id",
            operator: "=",
            value: Number(paymentLinkDetails.service_id),
          },
        ],
      });
      notificationTitle = `Payment of ₹${paymentLinkDetails.amount} received for the ${serviceDetails[0].service_name} service from ${userDetails[0].first_name} ${userDetails[0].last_name}.`;
      admin_id =
        Number(userDetails[0].user_type) === 0
          ? userDetails[0].counsellor_assigned
          : userDetails[0].mentor_assigned;
    }
    if (paymentLinkDetails.guide_id) {
      const { results: guideDetails } = await readRecord({
        table: `${tables.guides} g`,
        selectFields: ["g.guide"],
        conditions: [
          {
            field: "g.guide_id",
            operator: "=",
            value: Number(paymentLinkDetails.guide_id),
          },
        ],
      });
      notificationTitle = `Payment of ₹${paymentLinkDetails.amount} received for the ${guideDetails[0].guide} Guide from ${userDetails[0].first_name} ${userDetails[0].last_name}.`;
      admin_id =
        Number(userDetails[0].user_type) === 0
          ? userDetails[0].counsellor_assigned
          : userDetails[0].mentor_assigned;
    }
    if (
      paymentLinkDetails.program_id &&
      paymentLinkDetails.program_session_id
    ) {
      const [{ results: programDetails }, { results: programSessionDetails }] =
        await Promise.all([
          readRecord({
            table: `${tables.programsMaster} pm`,
            selectFields: ["pm.program_name"],
            conditions: [
              {
                field: "pm.program_id",
                operator: "=",
                value: Number(paymentLinkDetails.program_id),
              },
            ],
          }),
          readRecord({
            table: `${tables.programSession} ps`,
            selectFields: ["ps.program_duration"],
            conditions: [
              {
                field: "ps.program_session_id",
                operator: "=",
                value: Number(paymentLinkDetails.program_session_id),
              },
            ],
          }),
        ]);

      notificationTitle = `Payment of ₹${paymentLinkDetails.amount} received for the ${programDetails[0].program_name} (${programSessionDetails[0]?.program_duration}) from ${userDetails[0].first_name} ${userDetails[0].last_name}.`;
      admin_id =
        Number(userDetails[0].user_type) === 0
          ? userDetails[0].counsellor_assigned
          : userDetails[0].mentor_assigned;
    }
    const data = {
      title: notificationTitle,
      priority: 1,
      redirect: `/profile/${paymentLinkDetails.user_id}`,
    };
    const insertedResultNotification = await insertRecord(
      tables.mentorNotifications,
      ["user_id", "admin_id", "content", "redirect"],
      [
        paymentLinkDetails.user_id,
        admin_id,
        data.title,
        `/profile/${paymentLinkDetails.user_id}`,
      ]
    );
    if (insertedResultNotification.affectedRows === 0) {
      return next(
        new ErrorHandler("Error While Inserting Mentor Notifications", 400)
      );
    }
    sendSSEEvent({ mentor_id: admin_id, data });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `Payment Successful`,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const verifyOrderPaymentController = async (req, res, next) => {
  try {
    const {
      program_id,
      program_session_id,
      mrp,
      paid_amount,
      discount_amount,
      discount_type,
      user_id,
    } = req.body;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_status",
        "ud.phone_number",
        "sop.program_status",
        "sop.expiry_date as current_program_expiry",
        "sop.program_type",
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: Number(user_id) },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
    });
    if (!results.length) {
      return next(new ErrorHandler("User Not Found For this User", 400));
    }
    const userDetails = results[0];
    console.log(userDetails, 992);
    const OrderDetailscolumns = [
      "user_id",
      "phone_number",
      "order_mrp",
      "order_discount",
      "order_paid_amount",
      discount_type !== "No Discount" ? "discount_type" : null,
      "payment_currency",
      "payment_mode",
      "order_date",
      "total_items",
    ].filter((item) => item !== null && item !== undefined);

    const OrderDetailsvalues = [
      user_id,
      userDetails.phone_number,
      mrp,
      discount_amount,
      paid_amount,
      discount_type !== "No Discount" ? discount_type : null,
      "INR",
      6,
      moment().format("YYYY-MM-DD"),
      1,
    ].filter((item) => item !== null && item !== undefined);
    const insertedOrderResult = await insertRecord(
      tables.orderDetails,
      OrderDetailscolumns,
      OrderDetailsvalues
    );
    const insertOrderLogResult = await insertOrderLog({
      user_id: user_id,
      order_id: insertedOrderResult.insertId,
      amount: paid_amount,
      payment_for: "Program Purchase",
      src: "Razorpay",
    });
    const [{ results: programSessionsResults }, { results: programDetails }] =
      await Promise.all([
        readRecord({
          table: `${tables.programSession} ps`,
          selectFields: [
            "ps.program_sessions",
            "ps.validity",
            "ps.extra_validity",
          ],
          conditions: [
            {
              field: "ps.program_session_id",
              operator: "=",
              value: program_session_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.programsMaster} pm`,
          selectFields: ["pm.program_category"],
          conditions: [
            {
              field: "pm.program_id",
              operator: "=",
              value: program_id,
            },
          ],
        }),
      ]);
    const start_date = userDetails.current_program_expiry
      ? moment(userDetails.current_program_expiry)
          .add(3, "days")
          .format("YYYY-MM-DD")
      : moment().format("YYYY-MM-DD");
    const program_type =
      String(programDetails[0].program_category).toLowerCase() === "basic stack"
        ? 1
        : 0;
    const program_status = userDetails.current_program_expiry ? 4 : 1;
    const expiry_date = moment(start_date)
      .add(
        Number(programSessionsResults[0].validity) +
          Number(programSessionsResults[0].extra_validity),
        "days"
      )
      .format("YYYY-MM-DD");
    const order_type =
      (Number(userDetails.program_status) === 3 &&
        Number(userDetails.program_type)) === 0 ||
      (Number(userDetails.program_status) === 4 &&
        Number(userDetails.program_type)) === 0
        ? "OCR"
        : Number(userDetails.program_status) === 1
        ? "Renewal"
        : Number(userDetails.program_type) === 1
        ? "Upgrade"
        : "New";
    const sopColumns = [
      "order_id",
      "user_id ",
      "program_id ",
      "program_session_id ",
      "program_type ",
      "total_sessions",
      "pending_session",
      "mrp",
      "discount",
      "paid_amount",
      "program_status",
      "start_date ",
      "expiry_date",
      "order_type ",
    ];
    const sopValues = [
      insertedOrderResult.insertId,
      user_id,
      program_id,
      program_session_id,
      program_type,
      programSessionsResults[0].program_sessions,
      programSessionsResults[0].program_sessions,
      mrp,
      discount_amount,
      paid_amount,
      program_status,
      start_date,
      expiry_date,
      order_type,
    ];
    if (insertedOrderResult.affectedRows === 0) {
      return next(new ErrorHandler("Error While Creating Order", 400));
    }
    const insertedSopResult = await insertRecord(
      tables.subOrderPrograms,
      sopColumns,
      sopValues
    );

    if (!userDetails.program_type) {
      await updateRecord(
        tables.userDetails,
        {
          user_status: "Active",
          sub_user_status:
            programDetails[0].program_category === "Basic Stack" ||
            [1, 3].includes(Number(programSessionsResults[0].validity))
              ? "Cleanse active "
              : "Active",
          user_type: "1",
          ...((order_type === "New" || order_type === "OCR") && {
            active_order_id: insertedSopResult.insertId,
          }),
          enc_password: md5("123456"),
          plain_password: "123456",
        },
        { user_id }
      );
    }
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order Verified And Added Successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const razorpayWebhookController = async (req, res, next) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const webhookSecret = "secret123";
    if (!webhookSecret) {
      console.error("Missing Razorpay Webhook Secret in environment variables");
      return next(
        new ErrorHandler("Server misconfiguration: missing webhook secret", 500)
      );
    }
    const webhookBody = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(webhookBody)
      .digest("hex");
    if (expectedSignature !== webhookSignature) {
      console.error("Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { event, payload } = req.body;
    const payment = payload.payment.entity;
    console.log(payment, "PAYMENT");
    if (payload?.payment?.entity?.notes?.type != "product") {
      return res.status(200).json({ message: "This is only for product" });
    }

    const { results: orderData } = await readRecord({
      table: "product_orders",
      selectFields: ["razorpay_payment_id", "payment_status"],
      conditions: [
        { field: "razorpay_order_id", operator: "=", value: payment.order_id },
      ],
    });

    console.log(orderData, "ORDER DATA");

    if (!orderData || orderData?.length === 0) {
      return res.status(200).json({ message: "This is only for product" });
    }

    switch (event) {
      case "payment.authorized":
        await razorPay.payments.capture(
          payment.id,
          payment.amount,
          payment.currency
        );
        console.log("Payment captured, waiting for payment.captured event");
        return res.status(200).json({ message: "Payment captured" });

      case "payment.captured":
        if (orderData[0]?.payment_status == "Success") {
          return res.status(200).json({ message: "Order Already Processed" });
        }
        return await verifyProductOrderPayment(res, next, payment);

      case "payment.failed":
        return await handleProductOrderPaymentFailed(res, payload);

      default:
        console.log(`Unhandled event type: ${event}`);
        return res.status(200).json({ message: "Event ignored" });
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

export const paymentLinkWebhook = async (req, res, next) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const webhookSecret = "secret123";
    if (!webhookSecret) {
      console.error("Missing Razorpay Webhook Secret in environment variables");
      return next(
        new ErrorHandler("Server misconfiguration: missing webhook secret", 500)
      );
    }

    const webhookBody = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(webhookBody)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      console.error("Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { event, payload } = req.body;

    if (event === "payment_link.paid") {
      const link = payload.payment_link.entity;
      const payment = link.payments?.[0];
      if (payment && !payment.captured) {
        console.log(`Payment not captured yet for link ${link.id}`);
        return res.status(200).json({ status: "ignored" });
      }

      const productType = link.notes?.type;
      console.log("ONHOLD NOTE", link?.notes);
      if (productType !== "onhold") {
        console.log(
          `Skipping payment link ${link.id}, product_type: ${productType}`
        );
        return res.status(200).json({ status: "ignored" });
      }

      res.status(200).json({ status: "ok" });

      // check if payment is marked success.

      setImmediate(async () => {
        try {
          const { results } = await readRecord({
            table: `${tables.onHoldClientPaidService} ohcps`,
            selectFields: ["ohcps.id"],
            conditions: [
              { field: "ohcps.status", operator: "=", value: "Pending" },
              {
                field: "ohcps.payment_link_id",
                operator: "=",
                value: link?.id,
              },
              {
                field: "ohcps.payment_link_id",
                operator: "IS NOT",
                value: "NULL",
                raw: true,
              },
              { field: "ohcps.payment_mode_id", operator: "=", value: 1 },
            ],
          });

          if (results?.length > 0) {
            await paidOnHoldConfirmation(req, null, next, {
              razorpay_payment_link_id: link.id,
              razorpay_payment_link_status: link.status,
              skipVerification: true,
            });
            console.log(`Processed onhold payment link: ${link.id}`);
          }
        } catch (err) {
          console.error("Error processing payment link webhook:", err);
        }
      });
    } else {
      res.status(200).json({ status: "ignored" });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ status: "error" });
  }
};

const verifyGuidePaymentController = async (req, res, next) => {
  try {
    const {
      guide_ids,
      mrp,
      paid_amount,
      discount_amount,
      discount_type,
      user_id,
      validity_days,
    } = req.body;

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_status",
        "ud.phone_number",
        "sop.program_status",
        "sop.expiry_date as current_program_expiry",
        "sop.program_type",
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: Number(user_id) },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
    });
    if (!results.length) {
      return next(new ErrorHandler("User Not Found For this User", 400));
    }
    const userDetails = results[0];
    console.log(userDetails, 992);
    const OrderDetailscolumns = [
      "user_id",
      "phone_number",
      "order_mrp",
      "order_discount",
      "order_paid_amount",
      discount_type !== "No Discount" ? "discount_type" : null,
      "payment_currency",
      "payment_mode",
      "order_date",
      "total_items",
    ].filter((item) => item !== null && item !== undefined);

    const OrderDetailsvalues = [
      user_id,
      userDetails.phone_number,
      mrp,
      discount_amount,
      paid_amount,
      discount_type !== "No Discount" ? discount_type : null,
      "INR",
      1,
      moment().format("YYYY-MM-DD"),
      1,
    ].filter((item) => item !== null && item !== undefined);
    const insertedOrderResult = await insertRecord(
      tables.orderDetails,
      OrderDetailscolumns,
      OrderDetailsvalues
    );
    const insertOrderLogResult = await insertOrderLog({
      user_id: user_id,
      order_id: insertedOrderResult.insertId,
      amount: paid_amount,
      payment_for: "Guide Purchase",
      src: "Razorpay",
    });

    const individual_guide_price = Math.round(paid_amount / guide_ids.length);
    let guides_purchased = [];
    if (guide_ids.length > 0) {
      console.log("Yesss");
      guide_ids.map(async (guide_id) => {
        let guide_details = [];
        guide_details = await readRecord({
          table: `${tables.guides} gd`,
          selectFields: ["*"],
          conditions: [
            { field: "gd.guide_id", operator: "=", value: guide_id },
          ],
        });

        const current_date = moment().format("YYYY-MM-DD");

        const expiry_date = moment(current_date)
          .add(Number(validity_days), "days")
          .format("YYYY-MM-DD");

        const sopColumns = [
          "order_id",
          "user_id ",
          "program_id ",
          "program_session_id ",
          "guide_id",
          "type",
          "total_sessions",
          "pending_session",
          "mrp",
          "discount",
          "paid_amount",
          "program_status",
          "start_date ",
          "expiry_date",
          "order_type ",
        ];
        const sopValues = [
          insertedOrderResult.insertId,
          user_id,
          0,
          null,
          guide_details["results"][0].guide_id,
          "1",
          0,
          0,
          guide_details["results"][0].mrp,
          Math.round(guide_details["results"][0].mrp - individual_guide_price),
          individual_guide_price,
          null,
          current_date,
          expiry_date,
          "New",
        ];
        if (insertedOrderResult.affectedRows === 0) {
          return next(new ErrorHandler("Error While Creating Order", 400));
        }
        const insertedSopResult = await insertRecord(
          tables.subOrderPrograms,
          sopColumns,
          sopValues
        );

        let guide = "";
        guide = {
          guide_id: guide_details["results"][0].guide_id,
          guide_name: guide_details["results"][0].guide,
          icon: `https://${image_guide_base_url}/${guide_details["results"][0].icon}`,
          file_path: `https://${image_guide_base_url}/${guide_details["results"][0].file_path}`,
          guide_added_date: current_date,
          guide_end_date: expiry_date,
          added_by: user_id,
        };
        guides_purchased.push(guide);
      });
    }

    console.log(guides_purchased, 121212121);

    //Fetch Already Activated Features
    const { results: alreadyActivatedGuides } = await readRecord({
      selectFields: ["*"],
      table: tables.leadsActivatedFeatures,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    if (alreadyActivatedGuides.length > 0) {
      let exisitingGuides = JSON.parse(alreadyActivatedGuides[0].guides);

      // Step 1: Get guide_ids in new_added_guide
      const newGuideIds = new Set(
        JSON.parse(guides_purchased).map((g) => g.guide_id)
      );

      // Step 2: Filter out entries from existing_guide that are being replaced
      const filteredExisting = exisitingGuides.filter(
        (g) => !newGuideIds.has(g.guide_id)
      );

      // Step 3: Merge the filtered old ones with all new ones
      const updated_guides = [
        ...filteredExisting,
        ...JSON.parse(guides_purchased),
      ];

      const leadsActivatedFeaturesColumns = ["guides"];
      const leadsActivatedFeaturesValues = [JSON.stringify(updated_guides)];
      const leadsActivatedFeaturesResult = await updateRecord(
        tables.leadsActivatedFeatures,
        leadsActivatedFeaturesColumns,
        leadsActivatedFeaturesValues,
        [{ field: "user_id", operator: "=", value: user_id }]
      );
    } else {
      const leadsActivatedFeaturesColumns = [
        "user_id",
        "guides",
        "recipe_book",
        "coupon",
        "spin_to_win",
      ];
      const leadsActivatedFeaturesValues = [
        user_id,
        JSON.stringify(guides_purchased),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
      ];
      const leadsActivatedFeaturesResult = await insertRecord(
        tables.leadsActivatedFeatures,
        leadsActivatedFeaturesColumns,
        leadsActivatedFeaturesValues
      );
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Order Verified And Added Successfully",
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllPaymentLinks = async (req, res, next) => {
  try {
    const { status } = req.query;
    const selectFields = [
      "pl.payment_link",
      "pl.payment_status",
      "pl.amount",
      " date(pl.expiry_at)",
      "pl.created_at",
      "pl.updated_at",
      "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      "CONCAT(ud.phone_code,' ',ud.phone_number) as phone_number",
      "ud.email_id",
      "ud.user_status",
      "ud.sub_user_status",
      "ud.gender",
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.userDetails} ud`,
        on: "pl.user_id = ud.user_id",
      },
    ];
    const conditions = [
      status
        ? {
            field: "pl.payment_status",
            operator: "=",
            value: status,
          }
        : null,
    ].filter(Boolean);
    const { results } = await readRecord({
      table: `${tables.paymentLinks} pl`,
      selectFields,
      orderBy: ["pl.created_at DESC"],
      joins,
      ...(status && { conditions: conditions }),
    });
    const data = results.map((item) => {
      return {
        payment_link: item.payment_link,
        payment_status: item.payment_status,
        amount: item.amount,
        expiry_at: item.expiry_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
        full_name: item.full_name,
        phone_number: item.phone_number,
        email_id: item.email_id,
        user_status: item.user_status,
        sub_user_status: item.sub_user_status,
        gender:
          item.gender === 1 ? "Male" : item.gender === 2 ? "Female" : "Other",
      };
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Links retrieved successfully",
      data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const handleFailedPayments = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id"],
      conditions: [
        {
          field: "ud.email_id",
          operator: "=",
          value: req.body.payload.payment.entity.notes.email,
        },
      ],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("No records found", 400));
    }
    const user_id = results[0].user_id;
    const updatePaymentRecord = await updateRecord(
      `${tables.paymentLinks}`,
      {
        payment_status: "failed",
      },
      {
        user_id,
        amount: Number(req.body.payload.payment.entity.amount) / 100,
      }
    );
    if (updatePaymentRecord.affectedRows === 0) {
      return next(new ErrorHandler("Error updating payment record", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Payment record updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getExpiringPaymentLinks = async (req, res, next) => {
  try {
    const { filter_query, page, limit, search, admin_id } = req.query;

    const validQueries = [
      "day_before_yesterday",
      "yesterday",
      "today",
      "tomorrow",
      "future",
    ];
    if (!validQueries.includes(filter_query)) {
      return next(new ErrorHandler("Invalid filter query", 400));
    }

    const dayBeforeYesterday = moment()
      .subtract(2, "days")
      .format("YYYY-MM-DD");
    const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const tomorrow = moment().add(1, "day").format("YYYY-MM-DD");
    const future = moment().add(2, "day").format("YYYY-MM-DD");

    function getExpiryText(dateStr) {
      const today = moment().startOf("day");
      const expiry = moment(dateStr, "YYYY-MM-DD").startOf("day");

      const diffDays = expiry.diff(today, "days");

      if (diffDays > 0)
        return `Expires in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
      if (diffDays === 0) return "Expires today";
      return `Expired on ${expiry.format("YYYY-MM-DD")}`;
    }

    const filterDateExpr =
      filter_query === "day_before_yesterday"
        ? `DATE_SUB(CURDATE(), INTERVAL 2 DAY)`
        : filter_query === "yesterday"
        ? `DATE_SUB(CURDATE(), INTERVAL 1 DAY)`
        : filter_query === "today"
        ? `CURDATE()`
        : filter_query === "tomorrow"
        ? `DATE_ADD(CURDATE(), INTERVAL 1 DAY)`
        : `DATE_ADD(CURDATE(), INTERVAL 2 DAY)`; // FUTURE

    const operator = [
      "day_before_yesterday",
      "yesterday",
      "today",
      "tomorrow",
    ].includes(filter_query)
      ? "="
      : ">="; // FUTURE uses >=

    const queryObj1 = {
      page,
      limit,
      search,
      extraConditions: [
        {
          field: "sp.payment_link_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "sp_pl.payment_status", operator: "=", value: "pending" },
        { field: "sp.suggested_by", operator: "=", value: admin_id },
        {
          field: "DATE(sp_pl.expiry_at)",
          operator: operator,
          value: filterDateExpr,
          raw: true,
        },
        {
          field: "ud.suggested_program_id",
          operator: "=",
          value: "sp.suggested_program_id",
          raw: true,
        },
        {
          field: "sp.suggested_program_id",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
      ],
    };

    const queryObj2 = {
      page,
      limit,
      search,
      extraSelectFields: [
        "pl.payment_link as oh_payment_link",
        "ohcps.reason as oh_reason",
        "ohcps.status as oh_payment_mode",
        "ohcps.amount as oh_amount",
        "ohcps.payment_expiry as oh_expiry_at",
        "ohcps.created_at as oh_created_at",
        "ohcps.days as oh_days",
      ],
      extraConditions: [
        { field: "pl.payment_status", operator: "=", value: "pending" },
        { field: "ohcps.status", operator: "=", value: "Pending" },
        { field: "ud.mentor_assigned", operator: "=", value: admin_id },
        {
          field: "pl.expiry_at",
          operator: operator,
          value: filterDateExpr,
          raw: true,
        },
        {
          field: "pl.payment_link_id",
          operator: "IS NOT",
          value: null,
          raw: true,
        },
        {
          field: "ohcps.id",
          operator: "IN",
          value: `(SELECT MAX(ohcps2.id) FROM ${tables.onHoldClientPaidService} ohcps2 GROUP BY ohcps2.user_id)`,
          raw: true,
        },
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.paymentLinks} pl`,
          on: "pl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.onHoldClientPaidService} ohcps`,
          on: "pl.payment_link_id = ohcps.payment_link_id",
        },
      ],
      extraObjects: (i) => {
        return {
          onhold_request_details: {
            payment_link: i.oh_payment_link,
            reason: i.oh_reason,
            payment_mode: i.oh_payment_mode,
            amount: i.oh_amount,
            expiry_at: moment(i.oh_expiry_at).format("Do MMM YYYY"),
            expiry_in: getExpiryText(i.oh_expiry_at),
            created_at: moment(i.oh_created_at).format("Do MMM YYYY"),
            whatsapp_text: `PFA payment link for onhold - ${i.oh_reason} of amount Rs.${i.oh_amount} is ${i.oh_payment_link}`,
            days: i.oh_days,
          },
        };
      },
    };

    // readRecord updated for future support
    const { results } = await readRecord({
      table: `${tables.paymentLinks} pl`,
      selectFields: [
        "pl.id",
        "pl.user_id",
        "pl.amount",
        "pl.payment_status",
        "pl.payment_link",
        "pl.payment_link_id",
        "pl.created_at",
        "pl.expiry_at",
        "pl.description",
      ],
      joins: [
        {
          type: "INNER",
          table: `(SELECT user_id, MAX(id) AS latest_id 
                   FROM ${tables.paymentLinks} 
                   GROUP BY user_id) latest_pl`,
          on: "pl.user_id = latest_pl.user_id AND pl.id = latest_pl.latest_id",
        },
      ],
      conditions: [
        {
          field: "pl.payment_status",
          operator: "=",
          value: "pending",
        },
        {
          field: "pl.source",
          operator: "=",
          value: "Custom Link",
        },
        {
          field: "DATE(pl.expiry_at)",
          operator: operator,
          value: filterDateExpr,
          raw: true,
        },
      ],
    });

    const userIds = results?.map((i) => i.user_id);
    const pIds = results.map((i) => i.id);

    const queryObj3 = {
      page,
      limit,
      search,
      extraSelectFields: [
        "custom_pl.id as payment_id",
        "custom_pl.amount as payment_amount",
        "custom_pl.payment_status as payment_status",
        "custom_pl.payment_link as payment_link",
        "custom_pl.payment_link_id as payment_link_id",
        "custom_pl.created_at as payment_created_at",
        "custom_pl.expiry_at as payment_expiry_at",
        "custom_pl.description as payment_description",
      ],
      extraJoins: [
        {
          type: "LEFT",
          table: `${tables.paymentLinks} custom_pl`,
          on: "custom_pl.user_id = ud.user_id",
        },
      ],
      extraConditions: [
        { field: "ud.user_id", operator: "IN", value: userIds },
        { field: "custom_pl.id", operator: "IN", value: pIds },
        {
          field: "DATE(custom_pl.expiry_at)",
          operator: operator,
          value: filterDateExpr,
          raw: true,
        },
      ],
      extraObjects: (i) => {
        return {
          payment_link_details: {
            amount: i.payment_amount,
            payment_status: i.payment_status,
            payment_link: i.payment_link,
            payment_link_id: i.payment_link_id,
            created_at: moment(i.payment_created_at).format("Do MMM YYYY"),
            expiry_at: moment(i.payment_expiry_at).format("Do MMM YYYY"),
            expiry_in: getExpiryText(i.payment_expiry_at),
            reason: i.payment_description,
            whatsapp_text: `PFA payment link for ${i.payment_description} of amount Rs.${i.payment_amount} is ${i.payment_link}`,
          },
        };
      },
    };

    const { data: data1 } = await getFormattedUserData(queryObj1);
    const { data: data2 } = await getFormattedUserData(queryObj2);
    const { data: data3 } =
      userIds.length > 0 ? await getFormattedUserData(queryObj3) : { data: [] };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Links Expiring Fetched Successfully",
      data: {
        program: data1,
        service: data2,
        custom: data3,
      },
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getExpiringPaymentLinksCount = async (req, res, next) => {
  try {
    const { admin_id } = req.query;

    const dayBeforeYesterday = moment()
      .subtract(2, "days")
      .format("YYYY-MM-DD");
    const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
    const today = moment().format("YYYY-MM-DD");
    const tomorrow = moment().add(1, "day").format("YYYY-MM-DD");
    const future = moment().add(2, "day").format("YYYY-MM-DD");

    const results = await readRecordUnion([
      {
        table: `${tables.userDetails} ud`,
        selectField: [
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_SUB(CURDATE(), INTERVAL 2 DAY) THEN pl.id END) AS day_before_yesterday_expired_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN pl.id END) AS yesterday_expired_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = CURDATE() THEN pl.id END) AS today_expiring_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN pl.id END) AS tomorrow_expiring_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) >= DATE_ADD(CURDATE(), INTERVAL 2 DAY) THEN pl.id END) AS future_expiring_payment_link`,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.suggestedProgram} sp`,
            on: "ud.suggested_program_id = sp.suggested_program_id",
          },
          {
            type: "LEFT",
            table: `${tables.paymentLinks} pl`,
            on: "pl.id = sp.payment_link_id",
          },
        ],
        condition: [
          { field: "pl.payment_status", operator: "=", value: "pending" },
          { field: "sp.suggested_by", operator: "=", value: admin_id },
          {
            field: "ud.suggested_program_id",
            operator: "=",
            value: "sp.suggested_program_id",
            raw: true,
          },
          // { field: "pl.expiry_at", operator: ">=", value: "DATE_SUB(CURDATE(), INTERVAL 3 DAY)", raw: true },
          {
            field: "pl.payment_link_id",
            operator: "IS NOT",
            value: null,
            raw: true,
          },
          {
            field:
              "(ud.suggested_program_id IS NOT NULL OR ud.suggested_program_id != 0)",
            operator: "",
            value: "",
            raw: true,
          },
        ],
      },
      {
        table: `${tables.paymentLinks} pl`,
        selectField: [
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_SUB(CURDATE(), INTERVAL 2 DAY) THEN pl.id END) AS day_before_yesterday_expired_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN pl.id END) AS yesterday_expired_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = CURDATE() THEN pl.id END) AS today_expiring_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN pl.id END) AS tomorrow_expiring_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) >= DATE_ADD(CURDATE(), INTERVAL 2 DAY) THEN pl.id END) AS future_expiring_payment_link`,
        ],
        join: [
          {
            type: "LEFT",
            table: `${tables.onHoldClientPaidService} ohcps`,
            on: "pl.payment_link_id = ohcps.payment_link_id",
          },
        ],
        condition: [
          { field: "pl.payment_status", operator: "=", value: "pending" },
          { field: "ohcps.status", operator: "=", value: "Pending" },
          { field: "pl.admin_user_id", operator: "=", value: admin_id },
          {
            field: "ohcps.id",
            operator: "IN",
            value: `(
                SELECT MAX(ohcps2.id)
                FROM ${tables.onHoldClientPaidService} ohcps2
                GROUP BY ohcps2.user_id
              )`,
            raw: true,
          },
        ],
      },
      {
        table: `${tables.paymentLinks} pl`,
        selectField: [
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_SUB(CURDATE(), INTERVAL 2 DAY) THEN pl.user_id END) AS day_before_yesterday_expired_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN pl.user_id END) AS yesterday_expired_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = CURDATE() THEN pl.user_id END) AS today_expiring_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN pl.user_id END) AS tomorrow_expiring_payment_link`,
          `COUNT(DISTINCT CASE WHEN DATE(pl.expiry_at) >= DATE_ADD(CURDATE(), INTERVAL 2 DAY) THEN pl.user_id END) AS future_expiring_payment_link`,
        ],
        condition: [
          { field: "pl.payment_status", operator: "=", value: "pending" },
          { field: "pl.source", operator: "=", value: "Custom Link" },
          { field: "pl.admin_user_id", operator: "=", value: admin_id },
        ],
      },
    ]);

    console.log(results, "results");

    const addedCounts = {
      day_before_yesterday_expired_payment_link:
        (results?.[0]?.day_before_yesterday_expired_payment_link || 0) +
        (results?.[1]?.day_before_yesterday_expired_payment_link || 0) +
        (results?.[2]?.day_before_yesterday_expired_payment_link || 0),
      yesterday_expired_payment_link:
        (results?.[0]?.yesterday_expired_payment_link || 0) +
        (results?.[1]?.yesterday_expired_payment_link || 0) +
        (results?.[2]?.yesterday_expired_payment_link || 0),
      today_expiring_payment_link:
        (results?.[0]?.today_expiring_payment_link || 0) +
        (results?.[1]?.today_expiring_payment_link || 0) +
        (results?.[2]?.today_expiring_payment_link || 0),
      tomorrow_expiring_payment_link:
        (results?.[0]?.tomorrow_expiring_payment_link || 0) +
        (results?.[1]?.tomorrow_expiring_payment_link || 0) +
        (results?.[2]?.tomorrow_expiring_payment_link || 0),
      future_expiring_payment_link:
        (results?.[0]?.future_expiring_payment_link || 0) +
        (results?.[1]?.future_expiring_payment_link || 0) +
        (results?.[2]?.future_expiring_payment_link || 0),
    };

    return res.status(200).json({
      statusCode: 200,
      message: "Payment Links Expiring Count Fetched Successfully",
      data: [addedCounts],
    });
  } catch (error) {
    console.error("Error fetching payment links:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const upDatePaymentLinkExpiry = async (req, res, next) => {
  try {
    const { suggested_program_id, expiry_at } = req.body;

    // Input validation
    if (!suggested_program_id || !expiry_at) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const newDate = new Date(expiry_at);
    if (isNaN(newDate.getTime())) {
      return next(new ErrorHandler("Invalid expiry date format", 400));
    }

    // Fetch existing record
    const { results } = await readRecord({
      table: `${tables.suggestedProgram} sp`,
      selectFields: [
        "pl.payment_link_id",
        "sp.payment_mode_id",
        "sp.payment_expiry",
      ],
      conditions: [
        {
          field: "sp.suggested_program_id",
          operator: "=",
          value: suggested_program_id,
        },
      ],
      joins: [
        {
          type: "INNER",
          table: `${tables.paymentLinks} pl`,
          on: "pl.id = sp.payment_link_id",
        },
      ],
    });

    if (!results?.length) {
      return next(new ErrorHandler("No records found", 404));
    }

    const { payment_link_id, payment_mode_id, payment_expiry } = results[0];
    const currentExpiry = new Date(payment_expiry);

    // Common validations
    if (!payment_mode_id) {
      return next(new ErrorHandler("Payment Details Not Yet Shared", 400));
    }

    if (currentExpiry < new Date()) {
      return next(
        new ErrorHandler(
          "Payment link has already expired. Create a new one.",
          400
        )
      );
    }

    if (newDate <= currentExpiry) {
      return next(
        new ErrorHandler("New expiry must be later than current expiry", 400)
      );
    }

    if (payment_mode_id === 1) {
      const updatedRazorpayLink = await razorPay.paymentLink.edit(
        payment_link_id,
        {
          expire_by: Math.floor(newDate.getTime() / 1000),
        }
      );
      console.log("Updated Razorpay Payment Link", updatedRazorpayLink);
      const [programResult, linkResult] = await Promise.all([
        updateRecord(
          tables.suggestedProgram,
          { payment_expiry: moment(expiry_at).format("YYYY-MM-DD") },
          { suggested_program_id }
        ),
        updateRecord(
          tables.paymentLinks,
          { expiry_at: moment(expiry_at).format("YYYY-MM-DD") },
          { payment_link_id }
        ),
      ]);

      if (!programResult.affectedRows || !linkResult.affectedRows) {
        throw new Error("Failed to update payment records");
      }
    } else {
      const result = await updateRecord(
        tables.suggestedProgram,
        { payment_expiry: moment(expiry_at).format("YYYY-MM-DD") },
        { suggested_program_id }
      );

      if (!result.affectedRows) {
        throw new Error("Failed to update payment expiry");
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        messag: "Payment Link Expiry Updated Successfully",
      })
    );
  } catch (error) {
    console.error("Error updating payment link expiry:", error);
    return next(
      new ErrorHandler(
        error.message || "Internal Server Error",
        error.status || 500
      )
    );
  }
};

const getBalancePayment = async (req, res, next) => {
  try {
    const { email_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "CONCAT(ud.phone_code,'',ud.phone_number) as 'phone'",
        "sop.sub_order_id",
        "pm.program_name",
        "sop.paid_amount",
        "sop.balance_amount",
        "sop.expiry_date",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "pm.program_id = sop.program_id",
        },
      ],
      conditions: [
        { field: "ud.email_id", operator: "=", value: email_id },
        { field: "sop.balance_amount", operator: ">", value: "0", raw: true },
      ],
    });
    console.log(results, 1505);
    return res.status(200).json(
      new ApiResponse({
        message: "Balance Payment Fetched Successfully",
        data: results,
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateBalanceAmount = async (req, res, next) => {
  try {
    const { sub_order_id, amount } = req.body;
    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: [
        "sop.paid_amount",
        "sop.balance_amount",
        "od.order_paid_amount",
        "od.order_balance_amount",
        "sop.order_id",
        "sop.user_id",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.order_id = sop.order_id",
        },
      ],
      conditions: [
        { field: "sop.sub_order_id", operator: "=", value: sub_order_id },
      ],
    });
    console.log(results, 1534);
    const updatedSubOrder = await updateRecord(
      `${tables.subOrderPrograms}`,
      {
        paid_amount: Number(results[0].paid_amount) + Number(amount),
        balance_amount: Number(results[0].balance_amount) - Number(amount),
      },
      {
        sub_order_id,
      }
    );
    const updatedOrder = await updateRecord(
      `${tables.orderDetails}`,
      {
        order_paid_amount: Number(results[0].paid_amount) + Number(amount),
        order_balance_amount:
          Number(results[0].balance_amount) - Number(amount),
      },
      {
        order_id: results[0].order_id,
      }
    );
    const insertOrderLogResult = await insertOrderLog({
      user_id: results[0].user_id,
      order_id: results[0].order_id,
      amount: amount,
      payment_for: "Balance Payment",
      src: "Accounts Dashboard",
    });
    const insertedResult = await insertRecord(
      tables.balanceLogs,
      ["user_id", "sub_order_id", "amount", "paid_amount"],
      [results[0].user_id, sub_order_id, results[0].balance_amount, amount]
    );

    if (updatedSubOrder.affectedRows === 0 && updatedOrder.affectedRows === 0) {
      return next(
        new ErrorHandler("Error Updating Balance Payment Details", 400)
      );
    }
    return res
      .status(200)
      .json(
        new ApiResponse({ message: "Balance Payment Updated Successfully" })
      );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const createCustomPaymentLink = async (req, res, next) => {
  try {
    const { user_id, amount, description, expiry_date } = req.body;

    if (!user_id || !amount) {
      return next(new ErrorHandler("user_id and amount are required", 400));
    }

    // Fetch user details
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "ud.first_name",
        "ud.last_name",
        "ud.email_id",
        "ud.phone_number",
        "ud.phone_code",
        "ud.mentor_assigned",
        "ud.counsellor_assigned",
        `CASE 
       WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned
       ELSE ud.mentor_assigned
     END AS assigned_user`,
        "au.email_id AS assigned_email",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} au`,
          on: `
        au.admin_user_id = CASE 
          WHEN ud.user_status = 'Lead' THEN ud.counsellor_assigned
          ELSE ud.mentor_assigned
        END
      `,
        },
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });

    if (!userDetails[0]) {
      return next(new ErrorHandler("User not found", 404));
    }

    const user = userDetails[0];

    // Define payment expiry — e.g., 3 days from now
    const payment_expiry = expiry_date
      ? moment(expiry_date).format("YYYY-MM-DD HH:mm:ss")
      : moment().add(3, "days").format("YYYY-MM-DD HH:mm:ss");

    // Create payment link via Razorpay (or your service)
    const paymentLink = await createPaymentLink({
      amount,
      currency: "INR",
      payment_expiry,
      callback_url: `${process.env.SERVER_URL}/api/v1/payment/verify-custom-payment-link`,
      description:
        description || `Payment for ${user.first_name} ${user.last_name}`,
      source: "Custom Link",
      customerDetails: {
        name: `${user.first_name} ${user.last_name}`,
        email: user?.email_id || "",
        phone: `${user?.phone_code}${user?.phone_number}` || "",
      },
    });

    if (!paymentLink?.id) {
      return next(new ErrorHandler("Failed to create payment link", 400));
    }

    // Insert new payment link record into DB
    const newPaymentLinkColumns = [
      "payment_link_id",
      "email",
      "phone_number",
      "amount",
      "expiry_at",
      "source",
      "description",
      "payment_link",
      "user_id",
      "admin_user_id",
    ];

    const newPaymentLinkValues = [
      paymentLink?.id,
      user?.email_id || "no_email",
      `${user?.phone_code}${user?.phone_number}` || "no_phone",
      amount,
      payment_expiry,
      "Custom Link",
      description,
      paymentLink?.short_url,
      user_id,
      user?.assigned_user || 0,
    ];

    const newPaymentLinkEntry = await insertRecord(
      `${tables.paymentLinks}`,
      newPaymentLinkColumns,
      newPaymentLinkValues
    );

    if (newPaymentLinkEntry.affectedRows === 0) {
      return next(new ErrorHandler("Error while saving payment link", 400));
    }

    res.status(200).json({
      success: true,
      message: "Payment link created successfully",
      data: {
        payment_link_id: paymentLink.id,
        short_url: paymentLink.short_url,
        expiry: payment_expiry,
        whatsapp_text: `PFA payment link for ${description} of amount Rs.${amount} is ${paymentLink.short_url}`,
        phone_number: `${user?.phone_code}${user?.phone_number}` || "no_phone",
        amount,
        description,
        user_name: `${user.first_name} ${user.last_name}`,
      },
    });
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const verifyCustomPaymentLink = async (req, res, next) => {
  try {
    const { razorpay_payment_link_id, razorpay_payment_link_status } =
      req.query;
    const payment_status = razorpay_payment_link_status;

    // 1️⃣ Verify signature
    const isVerified = verifyRazorpaySignature(req);
    if (!isVerified) {
      return next(new ErrorHandler("Invalid signature", 400));
    }

    // 2️⃣ If payment failed
    if (payment_status === "failed") {
      const data = { payment_status: "failed" };
      const condition = { payment_link_id: razorpay_payment_link_id };
      await updateRecord(`${tables.paymentLinks}`, data, condition);

      const apiResponse = new ApiResponse({
        statusCode: 400,
        message: "Payment Failed",
      });
      return res.status(400).json(apiResponse);
    }

    // 3️⃣ If payment successful
    if (payment_status === "paid") {
      const data = {
        payment_status: "paid",
        updated_at: new Date(),
      };
      const condition = { payment_link_id: razorpay_payment_link_id };
      await updateRecord(`${tables.paymentLinks}`, data, condition);

      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Payment verified successfully and marked as paid",
      });
      return res.status(200).json(apiResponse);
    }

    // 4️⃣ If payment is pending or other status
    const apiResponse = new ApiResponse({
      statusCode: 202,
      message: `Payment is in ${payment_status} state`,
    });
    return res.status(202).json(apiResponse);
  } catch (error) {
    console.error("Error verifying Razorpay payment link:", error);
    next(error);
  }
};

export {
  createPaymentLinkController,
  getAllPaymentLinks,
  getExpiringPaymentLinks,
  getExpiringPaymentLinksCount,
  handleFailedPayments,
  upDatePaymentLinkExpiry,
  verifyPaymentController,
  createRazorPayOrder,
  verifyOrderPaymentController,
  getBalancePayment,
  updateBalanceAmount,
  createRazorPayOrderForGuidePurchase,
  verifyGuidePaymentController,
};
