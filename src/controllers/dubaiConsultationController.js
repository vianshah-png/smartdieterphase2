import moment from "moment";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../config/query.js";
import { tables } from "../helper/constant.js";
import { ApiResponse } from "../utils/APiResponse.js";
import { ErrorHandler } from "../utils/ErrorClass.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import { isFutureOrPast } from "./salesDashboardControllers/leadsController.js";
import axios from "axios";

const addConsultation = async (req, res, next) => {
  try {
    const { name, email, phone, amount, admin_id, phone_code, currency } =
      await req.body;

    const columns = [
      "name",
      "email",
      "phone",
      "amount",
      "phone_code",
      "currency",
    ];
    const values = [name, email, phone, amount, phone_code, currency];
    const insertRecordResult = await insertRecord(
      tables.dubaiConsultations,
      columns,
      values,
      true
    );
    if (insertRecordResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add consultation", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Dubai Consultation Added Successfully",
      data: {
        consultation_id: insertRecordResult.insertId,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addConsultationForPaymentDone = async (req, res, next) => {
  try {
    const { name, email, phone, amount, admin_id, phone_code, currency } =
      await req.body;

    const columns = [
      "name",
      "email",
      "phone",
      "amount",
      "phone_code",
      "currency",
      "payment_id",
      "payment_status",
    ];
    const values = [
      name,
      email,
      phone,
      amount,
      phone_code,
      currency,
      "other",
      1,
    ];
    const insertRecordResult = await insertRecord(
      tables.dubaiConsultations,
      columns,
      values,
      true
    );
    if (insertRecordResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to add consultation", 400));
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Dubai Consultation Added Successfully For Payment Done User",
      data: {
        consultation_id: insertRecordResult.insertId,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const bookConsultation = async (req, res, next) => {
  try {
    const { consultation_id, schedule_date, slot_id } = req.body;

    if (!consultation_id || !schedule_date || !slot_id) {
      return next(new ErrorHandler("Invalid input data", 400));
    }

    const updatedResult = await updateRecord(
      tables.dubaiConsultations,
      { schedule_date, slot_id },
      { id: parseInt(consultation_id) },
      true
    );

    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to book consultation", 400));
    }

    const { results: consultationDetails } = await readRecord({
      table: `${tables.dubaiConsultations} c`,
      selectFields: [
        "c.name",
        "c.email",
        "c.phone",
        "c.phone_code",
        "slot.appointment_slots as slot",
        "c.schedule_date",
      ],
      conditions: [
        { field: "c.id", operator: "=", value: parseInt(consultation_id) },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.dubaiSlots} slot`,
          on: "c.slot_id = slot.id",
        },
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
          field: `(bd.email_id = '${consultationDetails[0].email}' OR bd.mobile_no1 = '${consultationDetails[0].phone_code}-${consultationDetails[0].phone}') `,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      isLive: true,
    });
    if (results.length === 0) {
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
            table: `(SELECT *FROM lead_action la WHERE la.email = '${consultationDetails[0].email}' ORDER BY id DESC LIMIT 1 ) la`,
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
            field: `lm.email = '${consultationDetails[0].email}' OR lm.phone = '${consultationDetails[0].phone_code}-${consultationDetails[0].phone}'`,
            operator: "",
            value: "",
            raw: true,
          },
        ],
        isLive: true,
      });

      mailDataDB = results[0];
    }
    mailDataDB = results[0];

    const mailData = {
      to: consultationDetails[0].email,
      subject: "In-Person Consultation Appointment Successfully Scheduled",
      cc: [
        "jubin.desai@balancenutrition.in",
        mailDataDB ? mailDataDB.email_id : "mentor.barkha@balancenutrition.in",
        "khyatirupani@balancenutrition.in",
        "accounts@balancenutrition.in",
      ],

      html: `<html>
  <body>
    <p>Dear  <strong>${consultationDetails[0].name}</strong>,</p>

    <p>Your in-person consultation appointment with Nutritionist Khyati Rupani has been successfully scheduled</p>

    <p>Please find the details below:</p>

    <ul>
    <h2>Details of the Appointment:</h2>
      <li><strong>Date:</strong> ${moment(
        consultationDetails[0].schedule_date
      ).format("DD MMM YYYY")}</li>
      <li><strong>Time Slot:</strong> ${consultationDetails[0].slot}</li>
      <li><strong>Venue:</strong>Taj Dubai, Business Bay</li>
    </ul>

    <p>
  ${mailDataDB ? mailDataDB.designation : ""}  ${
        mailDataDB ? mailDataDB.crm_user : "Barkha"
      } from Balance Nutrition will give you a gentle reminder call on your registered mobile number at the above-mentioned time. Alternatively, feel free to message him on WhatsApp or reach out via BOTIM at <a href="https://wa.me/${
        mailDataDB ? mailDataDB.phone : "+919152419848"
      }" style="color: #1c87c9; text-decoration: none;">${
        mailDataDB ? mailDataDB.phone : "+919152419848"
      }</a> for any assistance.
    
    </p>

    <p>
      Take a moment to watch this video to learn more about us: 
      <a href="https://youtu.be/yZP7cpCcHSY" style="color: #1c87c9; text-decoration: none;">https://youtu.be/yZP7cpCcHSY</a>
    </p>

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
    });
    // ${consultationDetails[0].phone}
    const watiResponse = await axios.post(
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${consultationDetails[0].phone_code}${consultationDetails[0].phone}`,
      {
        template_name: "dubai_consulation_booked_successfully_new_",
        broadcast_name: "dubai_consulation_booked_successfully_new_",
        parameters: [
          {
            name: "name",
            value: consultationDetails[0].name,
          },
          {
            name: "counsellor_designation",
            value: mailDataDB ? mailDataDB.designation : "Sr.Nutritionist",
          },
          {
            name: "mentor_name",
            value: mailDataDB ? mailDataDB.crm_user : "Barkha",
          },
          {
            name: "mentor_wa",
            value: mailDataDB ? mailDataDB.phone : "9152419848",
          },
          {
            name: "cons_date",
            value: moment(consultationDetails[0].schedule_date).format(
              "DD MMM YYYY"
            ),
          },
          {
            name: "cons_time",
            value: consultationDetails[0].slot,
          },
        ],
      }
    );
    console.log("Wati Response:", watiResponse.data);
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Consultation booked successfully",
      })
    );
  } catch (error) {
    console.error("Error booking consultation:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const checkSlots = async (req, res, next) => {
  const { id, date } = req.query;
  if (!id || !date) {
    return res.status(400).json({ error: "id and date are required." });
  }

  const slotsArr = [];
  if (moment(date).format("YYYY-MM-DD") === "2025-01-29") {
    // slotsArr.push(12,13, 14, 15, 16, 17, 18, 19, 20);
    slotsArr.push(13, 14, 15, 16, 17, 18, 19, 20, 21);
  } else if (moment(date).format("YYYY-MM-DD") === "2025-01-30") {
    // slotsArr.push(9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20);
    slotsArr.push();
    // slotsArr.push(12,13, 14, 15, 16, 17, 18, 19, 20);
  } else {
    console.log("Unsupported date:", date);
  }

  // const slots = [
  //   1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  //   22, 23, 24, 25,
  // ];
  const slotTimeRanges = {
    1: "10:00 am - 10:25 am",
    2: "10:30 am - 10:55 am",
    3: "11:00 am - 11:25 am",
    4: "11:30 am - 11:55 am",
    5: "12:00 pm - 12:25 pm",
    6: "12:30 pm - 12:55 pm",
    7: "01:00 pm - 01:25 pm",
    8: "01:30 pm - 01:55 pm",
    9: "02:00 pm - 02:25 pm",
    10: "02:30 pm - 02:55 pm",
    11: "03:00 pm - 03:25 pm",
    12: "03:30 pm - 03:55 pm",
    13: "04:00 pm - 04:25 pm",
    14: "04:30 pm - 04:55 pm",
    15: "05:00 pm - 05:25 pm",
    16: "05:30 pm - 05:55 pm",
    17: "06:00 pm - 06:25 pm",
    18: "06:30 pm - 06:55 pm",
    19: "07:00 pm - 07:25 pm",
    20: "07:30 pm - 07:55 pm",
    21: "08:00 pm - 08:25 pm",
    22: "08:30 pm - 08:55 pm",
    23: "09:00 pm - 09:25 pm",
    24: "09:30 pm - 09:55 pm",
    25: "10:00 pm - 10:25 pm",
    26: "10:30 pm - 10:55 pm",
  };

  try {
    const { results: bookedSlots } = await readRecord({
      table: `${tables.dubaiConsultations}`,
      selectFields: ["CONCAT('[',GROUP_CONCAT(slot_id),']') as slots"],
      conditions: [
        {
          field: "DATE(schedule_date)",
          operator: "=",
          value: date,
        },
      ],
      isLive: true,
    });
    const bookedSlotIds = [...JSON.parse(bookedSlots[0].slots ?? "[]")];
    if (
      (moment(date).format("YYYY-MM-DD") === "2025-01-29" &&
        bookedSlotIds.length === 9) ||
      (moment(date).format("YYYY-MM-DD") === "2025-01-30" &&
        bookedSlotIds.length === 12)
    ) {
      return res.status(400).json({ error: "All slots are booked." });
    }
    const availableSlotsIds = slotsArr.filter(
      (slot) =>
        !bookedSlotIds.includes(slot) &&
        isFutureOrPast(date, slotTimeRanges[`${slot}`])
    );
    if (availableSlotsIds.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: `No Slots Available`,
        data: [],
      });
      return res.status(200).json([apiresponse]);
    }
    const { results: availableSlots } = await readRecord({
      table: `${tables.dubaiSlots}`,
      selectFields: ["id", "appointment_slots"],
      conditions: [{ field: "id", operator: "IN", value: availableSlotsIds }],
      isLive: true,
    });
    console.log(availableSlots, 1570);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Success",
      data: availableSlots,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const checkPaymentStatus = async (req, res, next) => {
  try {
    const { consultation_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.dubaiConsultations}`,
      selectFields: ["payment_status"],
      conditions: [
        { field: "id", operator: "=", value: parseInt(consultation_id) },
      ],
      isLive: true,
    });
    if (results.length === 0) {
      return res.status(404).json({ error: "Consultation not found." });
    }
    const paymentStatus = results[0].payment_status;
    if (Number(paymentStatus) === 1) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "Payment Done",
        data: {
          payment_status: true,
        },
      });
      return res.status(200).json(apiresponse);
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Payment Pending",
      data: {
        payment_status: false,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updatePaymentStatus = async (req, res, next) => {
  try {
    const { consultation_id, payment_id } = req.body;
    const updatedResult = await updateRecord(
      tables.dubaiConsultations,
      { payment_status: 1, payment_id },
      { id: parseInt(consultation_id) },
      true
    );
    if (updatedResult.affectedRows === 0) {
      return next(new ErrorHandler("Failed to update payment status", 400));
    }

    const { results: consultationDetails } = await readRecord({
      table: `${tables.dubaiConsultations} c`,
      selectFields: [
        "c.id",
        "c.name",
        "c.email",
        "c.phone",
        "c.amount",
        "c.phone_code",
        "slot.appointment_slots as slot",
        "c.schedule_date",
        "c.currency",
      ],
      conditions: [
        { field: "c.id", operator: "=", value: parseInt(consultation_id) },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.dubaiSlots} slot`,
          on: "c.slot_id = slot.id",
        },
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
          field: `(bd.email_id = '${consultationDetails[0].email}' OR bd.mobile_no1 = '${consultationDetails[0].phone_code}-${consultationDetails[0].phone}') `,
          operator: "",
          value: "",
          raw: true,
        },
      ],
      isLive: true,
    });
    if (results.length === 0) {
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
            table: `(SELECT *FROM lead_action la WHERE la.email = '${consultationDetails[0].email}' ORDER BY id DESC LIMIT 1 ) la`,
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
            field: `lm.email = '${consultationDetails[0].email}' OR lm.phone = '${consultationDetails[0].phone_code}-${consultationDetails[0].phone}'`,
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
              value: consultationDetails[0].email,
            },
          ],
          isLive: true,
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
             consultationDetails[0].name,
             consultationDetails[0].email,
             `+${consultationDetails[0].phone_code} - ${consultationDetails[0].phone}`,
             "Dubai Workshop 2025",
             "United Arab Emirates",
             "Dubai",
             "Dubai",
             "New",
             "Dubai Workshop 2025",
             consultationDetails[0].phone_code,
             consultationDetails[0].phone,
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
      to: consultationDetails[0].email,
      subject: "Payment Received",
      cc: [
        mailDataDB ? mailDataDB.email_id : "mentor.barkha@balancenutrition.in",
        "khyatirupani@balancenutrition.in",
        "accounts@balancenutrition.in",
        "jubin.desai@balancenutrition.in",
        "support@balancenutrition.in",
      ],
      bcc: "support@balancenutrition.in",
      html: `
    <html>
      <body>
        <div>
          <h2>Thank You for Your Payment!</h2>
          <p>
            Hello <strong>${consultationDetails[0].name}</strong>,
          </p>
          <p>
            Thank you for making your payment of 
            <strong>${consultationDetails[0].amount} ${
        consultationDetails[0].currency
      }</strong>
            toward booking an appointment with Nutritionist Khyati Rupani.
          </p>
          <p>
            You have not booked your appointment yet.
            Please WhatsApp
            ${
              mailDataDB ? ` <strong>${mailDataDB.designation}</strong>` : ""
            } ${mailDataDB ? mailDataDB.email_id : "Barkha"} on:
            <a href="https://wa.me/${
              mailDataDB ? mailDataDB.phone : "+919152419848"
            } style="color: #1c87c9; text-decoration: none">919152419848</a>
            
        
            to check the available slots or click here to book your slot:
            <a href="https://dubai-consultation.vercel.app/book/${
              consultationDetails[0].id
            }">
              Book Your Slot
            </a>.
          </p>
          <p>Best Regards,</p>
          <p><strong>Team Balance Nutrition</strong></p>
        </div>
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
      `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${consultationDetails[0].phone_code}${consultationDetails[0].phone}`,
      {
        template_name: "dubai_consultation_payment_done_new_",
        broadcast_name: "dubai_consultation_payment_done_new_",
        parameters: [
          {
            name: "name",
            value: consultationDetails[0].name,
          },
          {
            name: "amount",
            value: `${consultationDetails[0].amount} ${consultationDetails[0].currency} `,
          },

          {
            name: "counsellor_designation",
            value: `${
              mailDataDB ? mailDataDB[0].designation : "Sr.Nutritionist"
            }`,
          },
          {
            name: "mentor_name",
            value: `${mailDataDB ? mailDataDB[0].crm_user : "Barkha"}`,
          },
          {
            name: "mentor_wa",
            value: `${mailDataDB ? mailDataDB[0].phone : "9152419848"}`,
          },
          {
            name: "cons_id",
            value: consultationDetails[0].id,
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
export {
  addConsultation,
  bookConsultation,
  updatePaymentStatus,
  checkSlots,
  addConsultationForPaymentDone,
  checkPaymentStatus,
};
