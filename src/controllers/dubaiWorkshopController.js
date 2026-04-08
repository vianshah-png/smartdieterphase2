import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import axios from "axios";

// const addWorkshop = async (req, res, next) => {
//   try {
//     const { name, email, phone, amount, phone_code, currency } = await req.body;

//     // const { results } = await readRecord({
//     //   table: `${tables.dubaiWorkshops} w`,
//     //   conditions: [
//     //     {
//     //       field: "w.email",
//     //       operator: "=",
//     //       value: email,
//     //     },
//     //   ],
//     // });
//     // if (results.length > 0) {
//     //   const apiresponse = new ApiResponse({
//     //     statusCode: 200,
//     //     message: "You Have Already Registered",
//     //   });
//     //   return res.status(200).json(apiresponse);
//     // }

//     const columns = [
//       "name",
//       "email",
//       "phone",
//       "amount",
//       "phone_code",
//       "currency",
//     ];
//     const values = [name, email, phone, amount, phone_code, currency];
//     const insertRecordResult = await insertRecord(
//       tables.dubaiWorkshops,
//       columns,
//       values,
//       true
//     );
//     if (insertRecordResult.affectedRows === 0) {
//       return next(new ErrorHandler("Failed to add consultation", 400));
//     }
//     const apiresponse = new ApiResponse({
//       statusCode: 200,
//       message: "Dubai Workshop Added Successfully",
//       data: {
//         workshop_id: insertRecordResult.insertId,
//       },
//     });
//     return res.status(200).json(apiresponse);
//   } catch (error) {
//     console.log(error);
//     return next(new ErrorHandler("Internal Server Error", 500));
//   }
// };
const addWorkShopPaymentDone = async (req, res, next) => {
  try {
    const { name, email, phone, amount, phone_code, currency } = await req.body;

    const columns = [
      "name",
      "email",
      "phone",
      "amount",
      "phone_code",
      "currency",
      "payment_status",
      "payment_id",
    ];
    const values = [
      name,
      email,
      phone,
      amount,
      phone_code,
      currency,
      1,
      "other",
    ];
    const insertRecordResult = await insertRecord(
      tables.dubaiWorkshops,
      columns,
      values,
      true
    );
    if (insertRecordResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add consultation", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Dubai Workshop Added Successfully",
      data: {
        workshop_id: insertRecordResult.insertId,
      },
    });
    const mailData = {
      to: email,
      subject: "Payment Received",
      cc: [
        "mentor.barkha@balancenutrition.in",
        "accounts@balancenutrition.in",
        "jubin.desai@balancenutrition.in",
        "support@balancenutrition.in",
      ],
      bcc: `support@balancenutrition.in`,
      html: `<html>
  <body>
    <p>Hello <strong>${name}</strong>,</p>

    <p>We are pleased to inform you that your payment of <strong>${amount} ${currency}</strong> has been successfully received for the workshop with Nutritionist <strong>Khyati Rupani</strong>.</p>

    <p><strong>Workshop Details:</strong></p>
    <ul>
      <li><strong>Date:</strong> 29th January</li>
      <li><strong>Time:</strong> 10:30 AM GMT</li>
      <li><strong>Topic:</strong> How to lose weight without going to the gym?</li>
      <li><strong>Venue:</strong>Dubai</li>
    </ul>

    <p>If you have any further questions or require assistance, feel free to WhatsApp Barkha at: 
      <a href="https://wa.me/919152419848" style="color: #1c87c9; text-decoration: none;">+91-9152419848</a>.
    </p>

    <p>We look forward to seeing you at the workshop!</p>

    <p>Best regards,</p>
    <p>Team Balance Nutrition</p>
  </body>
</html>
`,
    };

    await sendMailUtil({
      from: `Support support@balancenutrition.in `,
      to: mailData.to,
      subject: mailData.subject,
      html: mailData.html,
      cc: mailData.cc,
      bcc: mailData.bcc,
    });

    const watiResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${phone_code}${phone}`,
      {
        template_name: "dubai_workshop_payment_barkha_",
        broadcast_name: "dubai_workshop_payment_barkha_",
        parameters: [
          {
            name: "name",
            value: name,
          },
          {
            name: "amount",
            value: `${amount} ${currency} `,
          },
        ],
      }
    );
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
// const addWorkShopInstagram = async (req, res, next) => {

//   try {
//     const { name, email, phone, amount, phone_code, currency } = await req.body;

//     // const { results } = await readRecord({
//     //   table: `${tables.dubaiWorkshops} w`,
//     //   conditions: [
//     //     {
//     //       field: "w.email",
//     //       operator: "=",
//     //       value: email,
//     //     },
//     //   ],
//     // });
//     // if (results.length > 0) {
//     //   const apiresponse = new ApiResponse({
//     //     statusCode: 200,
//     //     message: "You Have Already Registered",
//     //   });
//     //   return res.status(200).json(apiresponse);
//     // }

//     const columns = [
//       "name",
//       "email",
//       "phone",
//       "amount",
//       "phone_code",
//       "currency",
//       "source",
//     ];
//     const values = [
//       name,
//       email,
//       phone,
//       amount,
//       phone_code,
//       currency,
//       "instagram",
//     ];
//     const insertRecordResult = await insertRecord(
//       tables.dubaiWorkshops,
//       columns,
//       values,
//       true
//     );
//     if (insertRecordResult.affectedRows === 0) {
//       return next(new ErrorHandler("Failed to add consultation", 400));
//     }
//     const apiresponse = new ApiResponse({
//       statusCode: 200,
//       message: "Dubai Workshop Added Successfully",
//       data: {
//         workshop_id: insertRecordResult.insertId,
//       },
//     });
//     return res.status(200).json(apiresponse);
//   } catch (error) {
//     console.log(error);
//     return next(new ErrorHandler("Internal Server Error", 500));
//   }
// };

const addWorkShopInstagram = async (req, res, next) => {
  try {
    const { name, email, phone, amount, phone_code, currency } = await req.body;

    const columns = [
      "name",
      "email",
      "phone",
      "amount",
      "phone_code",
      "currency",
      "payment_id",
    ];
    const values = [name, email, phone, amount, phone_code, currency, "free"];
    const insertRecordResult = await insertRecord(
      tables.dubaiWorkshops,
      columns,
      values,
      true
    );
    if (insertRecordResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add consultation", 400));
    }
    let mentorData;
    const mentorQuery = await readRecord({
      table: `billing_details bd`,
      selectFields: [
        "ad.crm_user",
        "ad.email_id",
        "ad.designation",
        "ad.phone",
      ],
      joins: [
        { type: "LEFT", table: "registries r", on: "r.id = bd.user_id" },
        {
          type: "LEFT",
          table: "admin_user ad",
          on: "ad.admin_id = r.mentor_id",
        },
      ],
      conditions: [
        {
          field: `(bd.email_id = '${email}' OR bd.mobile_no1 = '${phone_code}-${phone}')`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      isLive: true,
    });

    mentorData = mentorQuery.results.length > 0 ? mentorQuery.results[0] : null;

    if (!mentorData) {
      const leadQuery = await readRecord({
        table: `lead_management lm`,
        selectFields: [
          "ad.crm_user",
          "ad.email_id",
          "ad.designation",
          "ad.phone",
        ],
        joins: [
          {
            type: "LEFT",
            table: `(SELECT *FROM lead_action la WHERE la.email = '${email}' ORDER BY id DESC LIMIT 1 ) la`,
            on: "la.email = lm.email",
          },
          {
            type: "LEFT",
            table: "admin_user ad",
            on: "ad.admin_id = la.assign_to",
          },
        ],
        conditions: [
          {
            field: `lm.email = '${email}' OR lm.phone = '${phone_code}-${phone}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
        isLive: true,
      });

      if (leadQuery.results.length > 0) {
        mentorData = leadQuery.results[0];
      } else {
        const existingLead = await readRecord({
          table: `lead_management lm`,
          selectFields: ["lm.email"],
          conditions: [{ field: "lm.email", operator: "=", value: email }],
          isLive: true,
        });

        if (existingLead.results.length === 0) {
          const newLeadResult = await insertRecord(
            `lead_management`,
            [
              "fname",
              "email",
              "phone",
              "enquiry_from",
              "country",
              "state",
              "city",
              "lead_type",
              "primary_source",
              "ccode",
              "wphone",
            ],
            [
              name,
              email,
              `+${phone_code} - ${phone}`,
              "Dubai Workshop 2025",
              "United Arab Emirates",
              "Dubai",
              "Dubai",
              "New",
              "Dubai Workshop 2025",
              phone_code,
              phone,
            ],
            true
          );

          if (newLeadResult.affectedRows === 0) {
            return next(
              new ErrorHandler(
                "Failed to insert new lead record for workshop registration",
                400
              )
            );
          }
        }
      }
    }

    // Prepare email data
    const mailData = {
      to: email,
      subject: "Registration Successful",
      cc: [
        mentorData?.email_id || "mentor.barkha@balancenutrition.in",
        "khyatirupani@balancenutrition.in",
        "accounts@balancenutrition.in",
        "jubin.desai@balancenutrition.in",
        "support@balancenutrition.in",
      ],
      bcc: "support@balancenutrition.in",
      html: `<html>
        <body>
          <p>Hello <strong>${name}</strong>,</p>
          <p>You have registered for the workshop with Nutritionist Khyati Rupani, hosted by IWD.</p>
          <ul>
            <li><strong>Date:</strong> 30th January</li>
            <li><strong>Time:</strong> 10:30 AM GMT</li>
            <li><strong>Venue:</strong> B Hub, BurJuman</li>
          </ul>
          <p>If you have any further questions or need clarification, you can WhatsApp ${
            mentorData?.designation || ""
          } ${mentorData?.crm_user || "Barkha"} at:
            <a href="https://wa.me/${
              mentorData?.phone || "+919152419848"
            }" style="color: #1c87c9; text-decoration: none;">+919152419848</a>.
          </p>
          <p>Best regards,</p>
          <p>Team Balance Nutrition</p>
        </body>
      </html>`,
    };

    await sendMailUtil({
      from: "Support <support@balancenutrition.in>",
      to: mailData.to,
      subject: mailData.subject,
      html: mailData.html,
      cc: mailData.cc,
      bcc: mailData.bcc,
    });

    // Send WhatsApp notification
    const watiResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${phone_code}${phone}`,
      {
        template_name: "dubai_workshop_booked_barkha_new_",
        broadcast_name: "dubai_workshop_booked_barkha_new_",
        parameters: [
          { name: "name", value: name },
          {
            name: "counsellor_designation",
            value: mentorData?.designation || "Sr. Nutritionist",
          },
          { name: "mentor_name", value: mentorData?.crm_user || "Barkha" },
          { name: "mentor_wa", value: mentorData?.phone || "9152419848" },
        ],
      }
    );

    console.log("Wati Response:", watiResponse.data);

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Dubai Workshop Added Successfully For Free",
      data: {
        workshop_id: insertRecordResult.insertId,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const addWorkshop = async (req, res, next) => {
  try {
    const { name, email, phone, amount, phone_code, currency } = await req.body;

    const columns = [
      "name",
      "email",
      "phone",
      "amount",
      "phone_code",
      "currency",
      "payment_id",
    ];
    const values = [name, email, phone, amount, phone_code, currency, "free"];
    const insertRecordResult = await insertRecord(
      tables.dubaiWorkshops,
      columns,
      values,
      true
    );
    if (insertRecordResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add consultation", 400));
    }
    //     const mailData = {
    //       to: email,
    //       subject: "Payment Received",
    //       cc: [
    //         // "mentor.barkha@balancenutrition.in",
    //         // "khyatirupani@balancenutrition.in",
    //         // "accounts@balancenutrition.in",
    //         // "jubin.desai@balancenutrition.in",
    //         // "support@balancenutrition.in",
    //       ],
    //       bcc: `support@balancenutrition.in`,
    //       html: `<html>
    //   <body>
    //     <p>Hello <strong>${workshopDetails[0].name}</strong>,</p>

    //     <p>We are pleased to inform you that your payment of <strong>${workshopDetails[0].amount} ${workshopDetails[0].currency}</strong> has been successfully received for the workshop with Nutritionist <strong>Khyati Rupani</strong>.</p>

    //     <p><strong>Workshop Details:</strong></p>
    //     <ul>
    //       <li><strong>Date:</strong> 29th January</li>
    //       <li><strong>Time:</strong> 10:30 AM GMT</li>
    //       <li><strong>Topic:</strong> How to lose weight without going to the gym?</li>
    //       <li><strong>Venue:</strong> India Club, Dubai</li>
    //     </ul>

    //     <p>If you have any further questions or require assistance, feel free to WhatsApp Barkha at:
    //       <a href="https://wa.me/917021985258" style="color: #1c87c9; text-decoration: none;">+91-7021985258</a>.
    //     </p>

    //     <p>We look forward to seeing you at the workshop!</p>

    //     <p>Best regards,</p>
    //     <p>Team Balance Nutrition</p>
    //   </body>
    // </html>
    // `,
    //     };
    //     await sendMailUtil({
    //       from: `Support support@balancenutrition.in `,
    //       to: mailData.to,
    //       subject: mailData.subject,
    //       html: mailData.html,
    //       cc: mailData.cc,
    //       bcc: mailData.bcc,
    //     });

    //     const watiResponse = await axios.post(
    //       `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${phone_code}${phone}`,
    //       {
    //         template_name: "dubai_workshop_free",
    //         broadcast_name: "dubai_workshop_free",
    //         parameters: [
    //           {
    //             name: "name",
    //             value: name,
    //           },
    //         ],
    //       }
    //     );
    //     console.log("Wati Response:", watiResponse.data);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Dubai Workshop Added Successfully For Free",
      data: {
        workshop_id: insertRecordResult.insertId,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const addWorkShopFree = async (req, res, next) => {
  try {
    const { name, email, phone, amount, phone_code, currency } = req.body;

    const columns = [
      "name",
      "email",
      "phone",
      "amount",
      "phone_code",
      "currency",
      "payment_id",
    ];
    const values = [name, email, phone, amount, phone_code, currency, "other"];

    const insertRecordResult = await insertRecord(
      tables.dubaiWorkshops,
      columns,
      values,
      true
    );

    if (insertRecordResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add consultation", 400));
    }

    let mentorData;
    const mentorQuery = await readRecord({
      table: `billing_details bd`,
      selectFields: [
        "ad.crm_user",
        "ad.email_id",
        "ad.designation",
        "ad.phone",
      ],
      joins: [
        { type: "LEFT", table: "registries r", on: "r.id = bd.user_id" },
        {
          type: "LEFT",
          table: "admin_user ad",
          on: "ad.admin_id = r.mentor_id",
        },
      ],
      conditions: [
        {
          field: `(bd.email_id = '${email}' OR bd.mobile_no1 = '${phone_code}-${phone}')`,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      isLive: true,
    });

    mentorData = mentorQuery.results.length > 0 ? mentorQuery.results[0] : null;

    if (!mentorData) {
      const leadQuery = await readRecord({
        table: `lead_management lm`,
        selectFields: [
          "ad.crm_user",
          "ad.email_id",
          "ad.designation",
          "ad.phone",
        ],
        joins: [
          {
            type: "LEFT",
            table: `(SELECT *FROM lead_action la WHERE la.email = '${email}' ORDER BY id DESC LIMIT 1 ) la`,
            on: "la.email = lm.email",
          },
          {
            type: "LEFT",
            table: "admin_user ad",
            on: "ad.admin_id = la.assign_to",
          },
        ],
        conditions: [
          {
            field: `lm.email = '${email}' OR lm.phone = '${phone_code}-${phone}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
        isLive: true,
      });

      if (leadQuery.results.length > 0) {
        mentorData = leadQuery.results[0];
      } else {
        const existingLead = await readRecord({
          table: `lead_management lm`,
          selectFields: ["lm.email"],
          conditions: [{ field: "lm.email", operator: "=", value: email }],
          isLive: true,
        });

        if (existingLead.results.length === 0) {
         const newLeadResult = await insertRecord(
           `lead_management`,
           [
             "fname",
             "email",
             "phone",
             "enquiry_from",
             "country",
             "state",
             "city",
             "lead_type",
             "primary_source",
             "ccode",
             "wphone",
           ],
           [
             name,
             email,
             `+${phone_code} - ${phone}`,
             "Dubai Workshop 2025",
             "United Arab Emirates",
             "Dubai",
             "Dubai",
             "New",
             "Dubai Workshop 2025",
             phone_code,
             phone,
           ],
           true
         );

          if (newLeadResult.affectedRows === 0) {
            return next(
              new ErrorHandler(
                "Failed to insert new lead record for workshop registration",
                400
              )
            );
          }
        }
      }
    }

    // Prepare email data
    const mailData = {
      to: email,
      subject: "Registration Successful",
      cc: [
        mentorData?.email_id || "mentor.barkha@balancenutrition.in",
        "khyatirupani@balancenutrition.in",
        "accounts@balancenutrition.in",
        "jubin.desai@balancenutrition.in",
        "support@balancenutrition.in",
      ],
      bcc: "support@balancenutrition.in",
      html: `<html>
        <body>
          <p>Hello <strong>${name}</strong>,</p>
          <p>You have registered for the workshop with Nutritionist Khyati Rupani, hosted by IWD.</p>
          <ul>
            <li><strong>Date:</strong> 30th January</li>
            <li><strong>Time:</strong> 10:30 AM GMT</li>
            <li><strong>Venue:</strong> B Hub, BurJuman</li>
          </ul>
          <p>If you have any further questions or need clarification, you can WhatsApp ${
            mentorData?.designation || ""
          } ${mentorData?.crm_user || "Barkha"} at:
            <a href="https://wa.me/${
              mentorData?.phone || "+919152419848"
            }" style="color: #1c87c9; text-decoration: none;">+919152419848</a>.
          </p>
          <p>Best regards,</p>
          <p>Team Balance Nutrition</p>
        </body>
      </html>`,
    };

    await sendMailUtil({
      from: "Support <support@balancenutrition.in>",
      to: mailData.to,
      subject: mailData.subject,
      html: mailData.html,
      cc: mailData.cc,
      bcc: mailData.bcc,
    });

    // Send WhatsApp notification
    const watiResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${phone_code}${phone}`,
      {
        template_name: "dubai_workshop_booked_barkha_new_",
        broadcast_name: "dubai_workshop_booked_barkha_new_",
        parameters: [
          { name: "name", value: name },
          {
            name: "counsellor_designation",
            value: mentorData?.designation || "Sr. Nutritionist",
          },
          { name: "mentor_name", value: mentorData?.crm_user || "Barkha" },
          { name: "mentor_wa", value: mentorData?.phone || "9152419848" },
        ],
      }
    );

    console.log("Wati Response:", watiResponse.data);

    // Send success response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Dubai Workshop Added Successfully For Free",
      data: { workshop_id: insertRecordResult.insertId },
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateWorkshopPaymentStatus = async (req, res, next) => {
  try {
    const { workshop_id, payment_id } = req.body;
    const updatedResult = await updateRecord(
      tables.dubaiWorkshops,
      { payment_status: 1, payment_id },
      { id: parseInt(workshop_id) },
      true
    );
    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update payment status", 400));
    }

    const { results: workshopDetails } = await readRecord({
      table: `${tables.dubaiWorkshops} w`,
      selectFields: [
        "w.name",
        "w.email",
        "w.phone",
        "w.amount",
        "w.phone_code",
        "w.schedule_date",
        "w.currency",
      ],
      conditions: [
        { field: "w.id", operator: "=", value: parseInt(workshop_id) },
      ],
      isLive: true,
    });
    let mailDataDB;
    const { results } = await readRecord({
      table: `billing_details bd`,
      selectFields: [
        "ad.crm_user",
        "ad.email_id",
        "ad.designation",
        "ad.phone",
      ],
      joins: [
        {
          type: "LEFT",
          table: "registries r",
          on: "r.id = bd.user_id",
        },
        {
          type: "LEFT",
          table: "admin_user ad",
          on: "ad.admin_id = r.mentor_id",
        },
      ],
      conditions: [
        {
          field: `(bd.email_id = '${workshopDetails[0].email}' OR bd.mobile_no1 = '${workshopDetails[0].phone_code}-${workshopDetails[0].phone}') `,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      isLive: true,
    });
    if (mailDataDB.length === 0) {
      const { results } = await readRecord({
        table: `lead_management lm`,
        selectFields: [
          "ad.crm_user",
          "ad.email_id",
          "ad.designation",
          "ad.phone",
        ],
        joins: [
          {
            type: "LEFT",
            table: `lead_action la`,
            on: "la.email = lm.email",
          },
          {
            type: "LEFT",
            table: `admin_user ad`,
            on: "ad.admin_id = la.assign_to",
          },
        ],
        conditions: [
          {
            field: `lm.email = '${workshopDetails[0].email}' OR lm.phone = '${workshopDetails[0].phone_code}-${workshopDetails[0].phone}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
        isLive: true,
      });
      if (results.length === 0) {
        const { results: isLeadExist } = await readRecord({
          table: `lead_management lm`,
          selectFields: ["lm.email"],
          conditions: [
            {
              field: "lm.email",
              operator: "=",
              value: workshopDetails[0].email,
            },
          ],
        });
        if (isLeadExist.length === 0) {
          const newData = await insertRecord(
            `lead_management`,
            [
              "fname",
              "email",
              "phone",
              "enquiry_from",
              "country",
              "state",
              "city",
              "lead_type",
              "primary_source",
              "ccode",
              "wphone",
            ],
            [
              workshopDetails[0].name,
              workshopDetails[0].email,
              `+${workshopDetails[0].phone_code} - ${workshopDetails[0].phone}`,
              "Dubai Workshop 2025",
              "United Arab Emirates",
              "Dubai",
              "Dubai",
              "New",
              "Dubai Workshop 2025",
              workshopDetails[0].phone_code,
              workshopDetails[0].phone,
            ],
            true
          );
          if (newData.affectedRows === 0) {
            return next(
              new ErrorHandler(
                "Failed to insert new lead record for workshop registration",
                400
              )
            );
          }
        }
      }
      mailDataDB = results[0];
    }
    mailDataDB = results[0];

    const mailData = {
      to: workshopDetails[0].email,
      subject: "Payment Received",
      cc: [
        "accounts@balancenutrition.in",
        "jubin.desai@balancenutrition.in",
        "support@balancenutrition.in",
        mailDataDB.email
          ? mailDataDB.email
          : "mentor.barkha@balancenutrition.in",
      ],
      bcc: `support@balancenutrition.in`,
      html: `<html>
  <body>
    Hello ${workshopDetails[0].name},

You have registered for the workshop with Nutritionist Khyati Rupani, hosted by IWD.

Date: 30th January, 2025
Time: 10:30 AM - 2:00 PM
venue: "Taj Dubai, Business Bay"

Topic: How to Lose Weight Without Going to the Gym?
Free workshop for Weight loss & Anti-Inflammatory Diets!

If you have any questions or need clarifications, you can WhatsApp ${
        mailDataDB.crm_user ? mailDataDB.crm_user : "Barkha"
      }  at ${mailDataDB.phone ? mailDataDB.phone : "+91 91524 19848"}.

  </body>
</html>
`,
    };

    await sendMailUtil({
      from: `Support support@balancenutrition.in `,
      to: mailData.to,
      subject: mailData.subject,
      html: mailData.html,
      cc: mailData.cc,
      bcc: mailData.bcc,
    });

    const watiResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${workshopDetails[0].phone_code}${workshopDetails[0].phone}`,
      {
        template_name: "dubai_workshop_payment_barkha_",
        broadcast_name: "dubai_workshop_payment_barkha_",
        parameters: [
          {
            name: "name",
            value: workshopDetails[0].name,
          },
          {
            name: "amount",
            value: `${workshopDetails[0].amount} ${workshopDetails[0].currency} `,
          },
        ],
      }
    );
    console.log("Wati Response:", watiResponse.data);
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Payment status updated successfully",
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const workShopCount = async (req, res, next) => {
  try {
    const { results } = await readRecord({
      table: `${tables.dubaiWorkshops} w`,
      selectFields: ["COUNT(*) as total_count"],
      isLive: true,
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Workshop Count Fetched successfully",
      data: results[0],
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addWorkshop,
  addWorkShopInstagram,
  updateWorkshopPaymentStatus,
  workShopCount,
  addWorkShopFree,
  addWorkShopPaymentDone,
};
