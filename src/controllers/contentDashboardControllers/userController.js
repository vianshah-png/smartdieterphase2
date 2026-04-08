import moment from "moment";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
} from "../../config/query.js";
import ejs from "ejs";
import path from "path";
import bcrypt from "bcryptjs";
import generateAuthToken from "../../utils/genarteAuthToken.js";
import {
  image_guide_base_url,
  sources,
  tables,
} from "../../helper/constant.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { calculateAge, safeJSONParse } from "../../helper/commonHelper.js";
import { sendMailUtil } from "../../utils/sendEmail.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import md5 from "md5";
import {
  addLeadAssignLog,
  addSaleStatusLogNew,
  addSourceLogNew,
  addStatusLogNew,
} from "../salesDashboardControllers/leadsController.js";
import { addAmountWallet } from "../../helper/common.js";
import { sendSSEEvent } from "../dashboardNotificationController.js";
import { addAutoDraftedQuery } from "../common.js";
import clientEnquiry from "../../models/clientQueryModel.js";

export const registerUser = async (req, res, next) => {
  const { username, email, password, first_name, last_name } = req.body;

  try {
    const condition = [
      { field: "u.username", operator: "=", value: username, logic: "OR" },
      { field: "u.email", operator: "=", value: email },
    ];
    const existingUser = await readRecord({
      table: `${tables.users} u`,
      selectFields: ["u.username", "u.email"],
      conditions: condition,
    });

    if (existingUser.length > 0) {
      return next(new ErrorHandler("Username or email already exists", 500));
    }

    // Data to be inserted
    const userData = {
      username,
      email,
      password,
      first_name,
      last_name,
    };

    Object.keys(userData).forEach(
      (key) => userData[key] === undefined && delete userData[key]
    );

    // Use insertRecord function to insert new user
    const result = await insertRecord(
      "users",
      Object.keys(userData),
      Object.values(userData)
    );

    if (!result) {
      return next(new ErrorHandler("Error while adding user", 404));
    }
    const apiResponse = new ApiResponse(201, "User registered successfully");
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    // Check if the user exists
    const rows = await readRecord({
      table: `${tables.users}`,
      selectFields: ["user_id", "password"],
      conditions: [{ field: "email", operator: "=", value: email }],
    });
    // const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
    //   email,
    // ]);
    if (rows.length === 0) {
      return next(new ErrorHandler("No users found", 404));
    }

    // Verify password (compare hashed password)
    const user = rows[0];
    const isPasswordMatch = user.password === password;
    if (!isPasswordMatch) {
      return next(new ErrorHandler("Invalid email or password", 400));
    }

    // Passwords match, generate JWT token (example function)
    const token = generateAuthToken(user.user_id);

    // Send token in response headers
    res.setHeader("Authorization", `Bearer ${token}`);

    // Send token and success message
    const apiResponse = new ApiResponse(200, "Login successful", token);

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Login error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getAllUsers = async (_, res, next) => {
  try {
    const users = await readRecord({
      table: `${tables.users} u`,
      selectFields: ["u.user_id as id", "u.username as username"],
    });
    if (!users) {
      return next(new ErrorHandler("No users found", 404));
    }

    const apiResponse = new ApiResponse(
      200,
      "Users fetched successfully",
      users
    );
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const searchUser = async (req, res, next) => {
  try {
    const { search, id, user_status } = req.query;
    let { mentor_id, country_id } = req.query;

    // If 'id' is provided, use it as mentor_id
    if (id != "") {
      mentor_id = id;
    }

    // Initialize an empty conditions array to build dynamic query conditions
    const conditions = [];

    if (country_id) {
      conditions.push({
        field: "ud.country_id",
        operator: "=",
        value: country_id,
      });
    }

    console.log(user_status);

    // Add condition for mentor_id and user_status
    if (mentor_id) {
      if (user_status) {
        if (["active", "oc", "client"].includes(user_status)) {
          // If user_status is active or oc (completed), use mentor_assigned
          const { results: counsellors } = await readRecord({
            table: `${tables.adminUsers} ad`,
            selectFields: ["ad.admin_user_id"],
            conditions: [
              { field: "ad.is_active", operator: "=", value: 1 },
              { field: "ad.role_id", operator: "=", value: 2 },
            ],
          });
          const counsellorIds = counsellors.map((i) => i.admin_user_id);
          if (!counsellorIds.includes(parseInt(mentor_id))) {
            conditions.push({
              field: "ud.mentor_assigned",
              operator: "=",
              value: mentor_id,
            });
          }
        } else {
          // If user_status is not active or completed, use counsellor_assigned
          conditions.push({
            field: "ud.counsellor_assigned",
            operator: "=",
            value: mentor_id,
          });
        }
      } else {
        // If no user_status is provided, include both mentor and counsellor assignments
        conditions.push({
          field: `(
            (ud.user_status IN ('Active', 'Completed', 'Maintenance') AND ud.mentor_assigned = ${mentor_id}) OR
            (ud.user_status = 'Lead' AND ud.counsellor_assigned = ${mentor_id})
          )`,
          operator: "",
          value: "",
          raw: true,
        });
      }
    }

    // Add condition for user_status
    if (user_status === "client") {
      conditions.push({
        field: "ud.user_type",
        operator: "=",
        value: "1",
      });
    } else {
      if (["active", "oc", "lead", "Lead"].includes(user_status)) {
        conditions.push({
          field: "ud.user_status",
          operator: "=",
          value:
            user_status === "active"
              ? "Active"
              : user_status === "oc"
              ? "Completed"
              : "Lead",
        });
      }
    }

    // Execute the database query using readRecord
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`, // Table to query from
      selectFields: [
        "ud.user_id",
        "ud.email_id",
        "ud.phone_number",
        "ud.phone",
        "ud.user_type",
        "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
        "ud.active_order_id",
        "m.crm_user as mentor_name",
        "c.crm_user as counsellor_name",
        "(SELECT cart_code FROM `cart` WHERE user_id=ud.user_id and cart_code is not null order by cart_id desc limit 1) as cart_code",
      ],
      ...(conditions.length > 0 && { conditions }), // Add conditions if any
      search: {
        searchQuery: decodeURIComponent(search),
        searchFields: [
          "ud.email_id",
          "ud.phone",
          "ud.phone_number",
          "concat(ud.phone_code,'',ud.phone_number)",
          "concat(ud.phone_code,' ',ud.phone_number)",
          "concat(ud.phone_code,'-',ud.phone_number)",
          "concat('+',ud.phone_code,'-',ud.phone_number)",
          "concat('+',ud.phone_code,' ',ud.phone_number)",
          "CONCAT(ud.first_name,' ', ud.last_name)",
          "ud.first_name",
          "ud.last_name",
        ],
      },
      joins: [
        {
          type: "LEFT",
          table: `${tables.adminUsers} m`,
          on: "ud.mentor_assigned = m.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} c`,
          on: "ud.counsellor_assigned = c.admin_user_id",
        },
      ],
    });

    // Handle if no results are found
    if (results.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: `No user found For ${search}`,
        data: [],
      });
      return res.status(200).json(apiresponse);
    }

    // Format the results and send the response
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `User fetched successfully by ${search}`,
      data: results.map((i) => {
        return {
          ...i,
          user_type: i.user_type === "0" ? "Lead" : "Client",
          full_name: i.full_name ? i.full_name : "No Name",
          email_id: i.email_id ? i.email_id : i.phone_number,
          mentor_name: i.mentor_name ? i.mentor_name : "No Mentor", // Check for mentor_name
          counsellor_name: i.counsellor_name
            ? i.counsellor_name
            : "No Counsellor", // Check for counsellor_name,
          cart_code: i?.cart_code,
        };
      }),
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const editUserDetails = async (req, res, next) => {
  try {
    const {
      user_id,
      pincode,
      address,
      country_id,
      state_id,
      city_id,
      alternate_phone,
    } = req.body;

    // Validate the required user_id field
    if (!user_id) return next(new ErrorHandler("Invalid user_id", 400));

    // Fetch the order_id related to the user
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["sop.order_id"],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
      ],
    });

    // Check if the user exists
    if (results.length === 0) {
      return next(new ErrorHandler("No user found", 404));
    }

    const order_id = results[0].order_id;

    // Update order details if any address-related field is provided
    if (pincode || country_id || state_id || city_id || address) {
      const updatedOrderResult = await updateRecord(
        tables.orderDetails,
        {
          ...(pincode && { pincode }),
          ...(address && { order_address: address }),
          ...(country_id && { country_id }),
          ...(state_id && { state_id }),
          ...(city_id && { city_id }),
        },
        {
          order_id: order_id,
        }
      );

      if (updatedOrderResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Error while updating order details", 400)
        );
      }
    }
    if (country_id || state_id || city_id) {
      // Update user address if country, state, or city are provided
      const updatedUserAddressResult = await updateRecord(
        tables.userDetails,
        {
          ...(country_id && { country_id }),
          ...(state_id && { state_id }),
          ...(city_id && { city_id }),
        },
        {
          user_id,
        }
      );

      if (updatedUserAddressResult.affectedRows === 0) {
        return next(
          new ErrorHandler("Error while updating user address information", 400)
        );
      }
    }

    // Update alternate phone if provided
    if (alternate_phone) {
      const updatedAlternatePhoneResult = await updateRecord(
        tables.userDetails,
        {
          alternate_phone,
        },
        {
          user_id,
        }
      );

      if (updatedAlternatePhoneResult.affectedRows === 0) {
        return next(new ErrorHandler("Error while updating user details", 400));
      }
    }

    // Send success response
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User details updated successfully",
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getPersonalInfo = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("Invalid user_id", 400));
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "od.pincode",
        "od.order_address",
        "country.country_id",
        "country.country_name",
        "state.state_name",
        "state.state_id",
        "city.city_name",
        "city.city_id",
        "CASE WHEN ud.phone_code NOT IN ('0','') THEN CONCAT(RTRIM(ud.phone_code), ' ', ud.phone_number) ELSE ud.phone END AS phone",
        "ud.alternate_phone",
        `CONCAT(COALESCE(ud.first_name, ''), 
       CASE WHEN ud.first_name IS NOT NULL AND ud.last_name IS NOT NULL THEN ' ' ELSE '' END, 
       COALESCE(ud.last_name, '')) AS client_name
`,
        "ud.email_id",
        "ud.birth_date",
        "ud.first_name",
        "ud.last_name",
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: parseInt(user_id) },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.countries} country`,
          on: "ud.country_id = country.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} state`,
          on: "ud.state_id = state.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} city`,
          on: "ud.city_id = city.city_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.orderDetails} od`,
          on: "od.order_id = sop.order_id",
        },
      ],
    });
    console.log(results[0], 377);
    const data = results.map((i) => {
      return {
        user_details: {
          client_name: i.client_name,
          client_email: i.email_id,
          client_phone: i.phone,
          client_alternate_phone: i.alternate_phone,
          client_age: calculateAge(i.birth_date),
          client_birth_date: moment(i.birth_date).format("DD-MM-YYYY"),
        },
        address_details: {
          pincode: i.pincode,
          address: i.order_address,
          country: { country_name: i.country_name, country_id: i.country_id },
          state: { state_name: i.state_name, state_id: i.state_id },
          city: { city_name: i.city_name, city_id: i.city_id },
        },
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Personal Info fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  try {
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      ],
      conditions: [{ field: "ud.email_id", operator: "=", value: email }],
    });

    if (userDetails.length === 0) {
      return next(new ErrorHandler("No user found with the given email", 400));
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    redis.setex(email, 60 * 5, otp);

    const mailBody = {
      from: "Support support@balancenutrition.in ",
      to: email,
      subject: "Reset Password",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f4f4;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin-left: 20px; /* Align to the left */
      background-color: #ffffff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    .email-header {
      text-align: left; /* Align header text to the left */
      margin-bottom: 20px;
    }
    .email-header h1 {
      font-size: 24px;
      color: #333;
    }
    .email-content {
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    
    #otp{
      color: #03989F;
      font-size: 20px;
      font-weight: bold;
      }
    .footer {
      font-size: 14px;
      text-align: left; /* Align footer text to the left */
      color: #888;
      margin-top: 30px;
    }
    .footer a {
      color: #03989F;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="email-content">
      <p>Hello ${userDetails[0]?.full_name},</p>
      <p>We received a request to reset the password for your account. Please use the following One-Time Password (OTP) to reset your password:</p>
      
      <!-- OTP Container -->
       <b id="otp"> ${otp}</b>
      

      <p>This OTP is valid for 5 minutes. If you did not request a password reset, please ignore this email. Your password will not be changed.</p>
    </div>
    <div class="footer">
      <p>Best regards,<br>The Balance Nutrition Team</p>
      <p>If you have any questions, please contact our support team at <a href="mailto:support@balancenutrition.in">support@balancenutrition.in</a>.</p>
    </div>
  </div>
</body>
</html>
`,
    };
    await sendMailUtil(mailBody);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OTP sent successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Forget password error:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const verifyOtp = async (req, res, next) => {
  const { email, otp } = req.body;
  try {
    const storedOtp = await redis.get(email);
    if (parseInt(otp) !== parseInt(storedOtp)) {
      return next(new ErrorHandler("Invalid OTP", 400));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OTP verified successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error, 140);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const resetPassword = async (req, res, next) => {
  const { email, new_password } = req.body;
  try {
    const encPassword = md5(new_password);
    const updateResult = await updateRecord(
      tables.userDetails,
      { enc_password: encPassword, plain_password: new_password },
      { email_id: email }
    );
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No entry with the given email", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Password reset successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error while resetting password", 400));
    }
  } catch (error) {
    console.log(error, 140);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const appointmentList = async (req, res, next) => {
  const { user_id, appointment_date, mentor_id } = req.body;
  try {
    let today = moment().format("YYYY-MM-DD");
    // console.log(today, 651);
    // Function to get the next valid date (skipping Sundays)
    const getNextValidDate = (startMoment, daysToAdd = 1) => {
      let nextDate = moment(startMoment).add(daysToAdd, "days");
      while (
        nextDate.day() === 0 ||
        /* list of holidays */ [
          "26-01",
          "15-08",
          "02-10",
          "20-10",
          "21-10",
          "03-03",
        ].includes(nextDate.format("DD-MM"))
      ) {
        nextDate.add(1, "days");
      }
      return nextDate;
    };

    // Compute the next three available dates
    let first_date = getNextValidDate(today, 1);
    let second_date = getNextValidDate(first_date, 1);
    let third_date = getNextValidDate(second_date, 1);

    // Determine the date to fetch
    let dateToFetch = appointment_date
      ? moment(appointment_date).format("YYYY-MM-DD")
      : first_date.format("YYYY-MM-DD");

    // Identify if the given date is within the 2nd or 3rd day
    const isSecondOrThirdDay =
      dateToFetch === second_date.format("YYYY-MM-DD") ||
      dateToFetch === third_date.format("YYYY-MM-DD");

    // If the given date is beyond the 3rd day, recalculate next 3 days
    const isBeyondThirdDay = moment(dateToFetch).isAfter(third_date);

    if (isBeyondThirdDay) {
      first_date = getNextValidDate(dateToFetch, 1);
      second_date = getNextValidDate(first_date, 1);
      third_date = getNextValidDate(second_date, 1);
    }
    let condition = [];
    if ([240, 183, 284, 266, 282, 232].includes(parseInt(mentor_id))) {
      if ([240, 183].includes(parseInt(mentor_id))) {
        condition.push({
          field: "cu.added_by",
          operator: "IN",
          value: [240, 183],
        });
      } else if ([282, 232].includes(parseInt(mentor_id))) {
        condition.push({
          field: "cu.added_by",
          operator: "IN",
          value: [282, 232],
        });
      } else {
        condition.push({
          field: "cu.added_by",
          operator: "IN",
          value: [284, 266],
        });
      }
    } else {
      condition.push({ field: "cu.added_by", operator: "=", value: mentor_id });
    }
    // Fetch booked calls for the given user_id and date
    const { results: bookedCalls } = await readRecord({
      selectFields: ["*"],
      table: `${tables.callUpdates} cu`,
      conditions: [
        { field: "DATE(cu.schedule_date)", operator: "=", value: dateToFetch },
        {
          orConditions: [
            { field: "cu.user_id", operator: "=", value: user_id },
            ...condition,
          ],
        },
        {
          field: "cu.call_status",
          operator: "!=",
          value: 2,
        },
      ],
    });
    const multipleSlotsCall = [];
    let bookedSlotIds = bookedCalls.map((call) => {
      if (call.slot_id?.length > 2) {
        // If slot_id is a string with multiple IDs, split and parse them
        const slotIds = call.slot_id.split(",").map((id) => parseInt(id));
        multipleSlotsCall.push(...slotIds);
      } else {
        return parseInt(call.slot_id);
      }
    });
    console.log(bookedSlotIds, 686);
    console.log(multipleSlotsCall, 687);
    bookedSlotIds.push(...multipleSlotsCall);
    bookedSlotIds = new Set(bookedSlotIds.filter((id) => !isNaN(id)));
    bookedSlotIds = Array.from(bookedSlotIds).map((id) => parseInt(id));
    console.log(bookedSlotIds, 688);
    // Fetch all slots
    const slotConditions = [];
    const orderBy = [];
    const day = moment(dateToFetch).format("dddd");
    if (
      Number(mentor_id) === 52 &&
      ["Tuesday", "Thursday"].includes(day) &&
      moment(dateToFetch).isBefore(moment("2026-06-30"))
    ) {
      slotConditions.push({
        field: "s.id",
        operator: "IN",
        value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 27, 28],
      });
      orderBy.push(
        "FIELD(s.id,27,28, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)"
      );
    } else if (
      Number(mentor_id) === 158 &&
      ["Tuesday", "Thursday", "Friday"].includes(day) &&
      moment(dateToFetch).isBefore(moment("2026-09-30"))
    ) {
      slotConditions.push({
        field: "s.id",
        operator: "IN",
        // Block 11–14 (3:00–5:00 pm), allow 1–10 (morning/early afternoon), 15–20 (5:00–8:00 pm)
        value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 17, 18, 19, 20],
      });
      orderBy.push("FIELD(s.id,1,2,3,4,5,6,7,8,9,10,16,17,18,19,20)");
    } else if (
      Number(mentor_id) === 284 &&
      moment(dateToFetch).isBefore(moment("2026-03-20"))
    ) {
      slotConditions.push({
        field: "s.id",
        operator: "IN",      
        value: [27,28,1, 2, 3, 4, 5, 6, 7, 8, 9, 10,11,12,13,14,15],
      });
      orderBy.push("FIELD(s.id,27,28,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15)");
    }else {
      slotConditions.push(
        { field: "s.id", operator: "<=", value: 17 },
        { field: "s.available_slots", operator: "=", value: 0 }
      );
    }
    const { results: slots } = await readRecord({
      selectFields: ["*"],
      table: `${tables.slots} s`,
      conditions: [
        // { field: "s.available_slots", operator: "=", value: 0 },
        ...slotConditions,
      ],
      ...(orderBy.length > 0 && { orderBy }),
    });

    const map = new Map();
    for (const call of bookedCalls) {
      map.set(call.slot_id, call.user_id);
    }

    // Mapping slot details
    const slotDetails = slots.map((slot) => {
      const isBooked = bookedSlotIds.includes(slot.id);
      const scheduledDate =
        bookedCalls.length > 0 ? bookedCalls[0]?.scheduled_date : "";
      let book_status = "Book Now";
      const booked_by = map.get(String(slot.id));

      if (isBooked && user_id == booked_by) {
        book_status = "Your Slot";
      } else if (isBooked && user_id != booked_by) {
        book_status = "Booked";
      }

      return {
        button_status: isBooked ? 0 : 1,
        call_status: isBooked ? 0 : 1,
        call_date: scheduledDate,
        id: slot.id,
        book_status: book_status,
        appointment_slots: slot.appointment_slots,
      };
    });

    // API Response
    const apiResponse = {
      status: true,
      message: "book_appointment_list",
      data: {
        next_day: first_date.format("DD ddd"),
        second_day: second_date.format("DD ddd"),
        third_day: third_date.format("DD ddd"),
        next_date: first_date.format("YYYY-MM-DD"),
        second_date: second_date.format("YYYY-MM-DD"),
        third_date: third_date.format("YYYY-MM-DD"),
        faq_url: `https://${image_guide_base_url}/show-ekit/MjczNzk=/53c8a5fbdb41e481370dc58a2e3a8bd9/ekit-faqs`,
        appointment_list: slotDetails,
      },
    };

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const addFCMToken = async (req, res, next) => {
  const {
    user_id,
    device,
    app_version,
    notification_flag,
    user_flag,
    fcm_token,
  } = req.body;
  if (!user_id || !device || !app_version || !user_flag || !fcm_token) {
    return next(new ErrorHandler("Invalid data", 400));
  }
  try {
    const { results: tokens } = await readRecord({
      selectFields: ["*"],
      table: tables.fcm_registry,
      conditions: [
        { field: "user_id", operator: "=", value: user_id },
        { field: "fcm_token", operator: "=", value: fcm_token },
      ],
    });
    if (tokens.length === 1) {
      const updateResult = updateRecord(
        tables.userDetails,
        { device, app_version },
        { user_id }
      );
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "FCM token already exists",
      });
      return res.status(200).json(apiResponse);
    } else {
      const columns = [
        "user_id",
        "device",
        "app_version",
        "notification_flag",
        "user_flag",
        "fcm_token",
      ];
      const values = [
        user_id,
        device,
        app_version,
        notification_flag,
        user_flag,
        fcm_token,
      ];
      const insertResult = await insertRecord(
        tables.fcm_registry,
        columns,
        values
      );
      if (insertResult.affectedRows > 0) {
        const updateResult = updateRecord(
          tables.userDetails,
          { device, app_version },
          { user_id }
        );
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: "FCM token added successfully",
        });
        return res.status(201).json(apiResponse);
      }
      return next(new ErrorHandler("Error while adding FCM token", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export async function fetchConsultationCalls() {
  try {
    const { results: calls } = await readRecord({
      selectFields: [
        "cu.*",
        "s.minutes_to_start",
        "CONCAT(cd.first_name,' ',cd.last_name) as user_name",
        "CONCAT(ad.first_name,' ',ad.last_name) as added_by",
        "slot.appointment_slots",
        "cd.email_id",
        "ad.official_phone",
        "ad.active",
        "ad.email_id as admin_email",
        "ad.oc",
        "ad.lead",
        `CASE WHEN cd.user_type = '0' THEN 'Lead' WHEN cd.user_status = 'Active' THEN 'Active' ELSE 'OC' END AS status`,
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "cu.slot_id = slot.id",
        },
        {
          type: "LEFT",
          table: `(SELECT 
    id,
    appointment_slots,
    TIMESTAMPDIFF(
        MINUTE, 
        NOW(), 
        STR_TO_DATE(
            CONCAT(CURDATE(), SUBSTRING_INDEX(appointment_slots, ' - ', 1)), 
            '%Y-%m-%d %h:%i %p'
        )
    ) AS minutes_to_start
FROM 
    bn_book_appointment_slots_mentor 
WHERE 
    STR_TO_DATE(
        CONCAT(CURDATE(), SUBSTRING_INDEX(appointment_slots, ' - ', 1)), 
        '%Y-%m-%d %h:%i %p'
    ) > NOW()
ORDER BY 
    minutes_to_start) as s`,
          on: "cu.slot_id = s.id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cu.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cu.added_by = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "cu.call_status", operator: "=", value: 0 },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "cu.call_type", operator: "=", value: "30" },
        { field: "s.minutes_to_start", operator: ">=", value: 15 },
        { field: "s.minutes_to_start", operator: "<=", value: 30 },
      ],
    });
    console.log(calls, 808);
    calls.map((call) => {
      const mailBody = {
        userName: call.user_name,
        counsellorName: call.added_by,
        callDate: call.schedule_date,
        consultTime: call.appointment_slots,
        year: moment().format("YYYY"),
      };
      console.log(mailBody, 830);
      console.log(call.email_id);
      setTimeout(async () => {
        let recipient = call.email_id;
        const mailBody = {
          userName: call.user_name,
          counsellorName: call.added_by,
          scheduledDate: call.schedule_date,
          consultTime: call.appointment_slots,
          year: moment().format("YYYY"),
          counsellorPhone: call.official_phone,
        };
        let mail_cc = [];
        let mail_bcc = [];
        if (call.status === "Lead") {
          const { call } = safeJSONParse(call.lead, []);
          mail_cc = call.cc;
          mail_bcc = call.bcc;
        } else if (call.status === "Active") {
          const { call } = safeJSONParse(call.active, []);
          mail_cc = call.cc;
          mail_bcc = call.bcc;
        } else {
          const { call } = safeJSONParse(call.oc, []);
          mail_cc = call.cc;
          mail_bcc = call.bcc;
        }
        console.log(mail_cc, 889, call);
        console.log(mailBody, 830);
        const email = await sendMailUtil({
          from: `No Reply - Balance Nutrition <support@balancenutrition.in>`,
          to: recipient,
          subject: "Consultation Reminder",
          html: await ejs.renderFile(
            path.join(__dirname, "../../../../../src/mails/callReminder.ejs"),
            {
              ...mailBody,
            }
          ),
          cc: mail_cc.length > 0 ? mail_cc : call?.admin_email,
          bcc: mail_bcc,
        });
        console.log(email, 830);
      }, (call.minutes_to_start - 15) * 60 * 1000);
    });
  } catch (error) {
    console.log(error, 790);
  }
}

export async function fetchCalls() {
  try {
    const { results: calls } = await readRecord({
      selectFields: [
        "cu.*",
        "s.minutes_to_start",
        "COALESCE(CONCAT_WS(' ', cd.first_name, cd.last_name), 'User') AS user_name",
        // "CONCAT(ad.first_name,' ',ad.last_name) as added_by",
        "slot.appointment_slots",
        "cd.email_id",
        "ad.official_phone",
        `CASE WHEN cd.user_type = '0' THEN 'Lead' WHEN cd.user_status = 'Active' THEN 'Active' ELSE 'OC' END AS status`,
      ],
      table: `${tables.callUpdates} cu`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "cu.slot_id = slot.id",
        },
        {
          type: "LEFT",
          table: `(SELECT 
    id,
    appointment_slots,
    TIMESTAMPDIFF(
        MINUTE, 
        NOW(), 
        STR_TO_DATE(
            CONCAT(CURDATE(), SUBSTRING_INDEX(appointment_slots, ' - ', 1)), 
            '%Y-%m-%d %h:%i %p'
        )
    ) AS minutes_to_start
FROM 
    bn_book_appointment_slots_mentor 
WHERE 
    STR_TO_DATE(
        CONCAT(CURDATE(), SUBSTRING_INDEX(appointment_slots, ' - ', 1)), 
        '%Y-%m-%d %h:%i %p'
    ) > NOW()
ORDER BY 
    minutes_to_start) as s`,
          on: "cu.slot_id = s.id",
        },
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "cu.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cu.added_by = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "cu.call_status", operator: "=", value: 0 },
        {
          field: "DATE(cu.schedule_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        // { field: "cu.call_type", operator: "!=", value: "30" },
        { field: "s.minutes_to_start", operator: ">=", value: 15 },
        { field: "s.minutes_to_start", operator: "<=", value: 30 },
      ],
    });
    console.log(calls, 808);
    // return false;
    calls.map((call) => {
      const data = {
        title: "Call Reminder",
        description: `You have a call with ${call.user_name} in 15 mins`,
        priority: 1,
        redirect: `/profile/${call.user_id}`,
      };
      console.log(data, 994);
      setTimeout(async () => {
        sendSSEEvent({ mentor_id: call.added_by, data });
      }, (call.minutes_to_start - 15) * 60 * 1000);
      const data1 = {
        title: "Call Reminder",
        description: `You have a call with ${call.user_name} in 5 mins`,
        priority: 1,
        redirect: `/profile/${call.user_id}`,
      };
      setTimeout(async () => {
        sendSSEEvent({ mentor_id: call.added_by, data1 });
      }, (call.minutes_to_start - 5) * 60 * 1000);
    });
  } catch (error) {
    console.log(error, 790);
  }
}

export async function fetchFollowUpReminders() {
  try {
    const { results: followUps } = await readRecord({
      selectFields: [
        "lfl.follow_up_id",
        "lfl.user_id",
        "lfl.slot_id",
        "lfl.type",
        "lfl.follow_up_date",
        "lfl.follow_up_status",
        "lfl.source",
        "lfl.campaign",
        "lfl.added_by",
        "lfl.assigned_to",
        "cd.first_name",
        "cd.last_name",
        "cd.email_id",
        "CASE WHEN lfl.type IN (0, '0') THEN slot.appointment_slots WHEN lfl.type IN ('1', '2',1,2) THEN wap_slot.appointment_slots ELSE NULL END AS appointment_slots",
        "TIMESTAMPDIFF(MINUTE, NOW(), STR_TO_DATE(CONCAT(CURDATE(), ' ', SUBSTRING_INDEX(slot.appointment_slots, ' -', 1)), '%Y-%m-%d %h:%i %p')) AS minutes_to_start",
      ],
      table: `${tables.leadFollowUpLogs} lfl`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} cd`,
          on: "lfl.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "lfl.slot_id = slot.id and lfl.type IN (0, '0')",
        },
        {
          type: "LEFT",
          table: `${tables.whatsappAppSlots} wap_slot`,
          on: "lfl.slot_id = wap_slot.id and lfl.type IN ('1', '2',1,2)",
        },
      ],
      conditions: [
        {
          field: "DATE(lfl.follow_up_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
        { field: "lfl.follow_up_status", operator: "=", value: 0 }, // Pending follow-ups
        {
          field:
            "TIMESTAMPDIFF(MINUTE, NOW(), STR_TO_DATE(CONCAT(CURDATE(), ' ', SUBSTRING_INDEX(slot.appointment_slots, ' -', 1)), '%Y-%m-%d %h:%i %p'))",
          operator: "BETWEEN",
          value: "15 AND 30",
          raw: true,
        }, // Reminders between 15-30 minutes
      ],
    });

    followUps.forEach((followUp) => {
      // Prepare the type of follow-up
      const followUpTypeText = {
        0: "Call",
        1: "WhatsApp",
        2: "App",
      };

      // Data for 15-minute reminder
      const data = {
        title: "Follow-Up Reminder",
        description: `You have a ${
          followUpTypeText[followUp.type]
        } follow-up with ${followUp?.first_name} ${
          followUp?.last_name
        } in 15 mins`,
        priority: 1,
        redirect: `/profile/${followUp.user_id}`,
      };
      // console.log(data, 994);
      setTimeout(async () => {
        sendSSEEvent({ mentor_id: followUp.assigned_to, data });
      }, (followUp.minutes_to_start - 15) * 60 * 1000); // Send 15 minutes before

      // Data for 5-minute reminder
      const data1 = {
        title: "Follow-Up Reminder",
        description: `You have a ${
          followUpTypeText[followUp.type]
        } follow-up with ${followUp?.first_name} ${
          followUp?.last_name
        } in 5 mins`,
        priority: 1,
        redirect: `/profile/${followUp.user_id}`,
      };
      // console.log(data1, 994);
      setTimeout(async () => {
        sendSSEEvent({ mentor_id: followUp.assigned_to, data1 });
      }, (followUp.minutes_to_start - 5) * 60 * 1000); // Send 5 minutes before
    });
  } catch (error) {
    console.log(error, 790);
  }
}

export const copyClientDetails = async (req, res, next) => {
  const { user_id } = req.body;

  try {
    const { results: clientDetails } = await readRecord({
      selectFields: [
        "CONCAT(ud.first_name, ' ', ud.last_name) as client_name",
        "CONCAT(ad.first_name, ' ', ad.last_name) as mentor_name",
        "CONCAT(ud.device, ' ', ud.app_version) as app_installed",
        "TIMESTAMPDIFF(year, ud.birth_date, CURDATE()) as age",
        "aspd.goal_weight as goal_weight",
        "ud.height as height",
        "ud.active_order_id as active_order_id",
        "aspd.other_goals as assessment_goals",
        "aspd.weight as assessment_start_weight",
        "sop.start_program_weight as program_start_weight",
        "sop.end_program_weight as program_end_weight",
        "sop.start_program_weight - sop.end_program_weight as total_loss_in_current_program",
        "ud.latest_weight - ud.start_weight as total_loss_with_us",
        "SUM(CASE WHEN sop_count.program_type = 0 AND sop_count.program_status IN ('1', '3') THEN 1 ELSE 0 END) AS client_program_count",
        "pm.program_name as current_program",
        "sop.mrp",
        "sop.paid_amount",
        "sop.pending_session",
        "sop.sent_sessions",
        "pm2.program_name as advance_purchase_program",
        "mg.comment",
        "hs.overall_health_score",
        "c.country_name",
        "s.state_name",
        "ci.city_name",
        "ud.ethnicity as caste",
        "anal.work_status",
        "anal.eating_habit",
        "anal.who_cooks",
        "anal.preferred_cuisine",
        "anal.meals_to_office",
        "anal.food_aversions",
        "anal.food_allergies",
        "asmh.other_medical_issue",
        "asmh.acidity",
        "asmh.cholesterol",
        "asmh.diabetes",
        "asmh.pcos",
        "asmh.thyroid",
        "asmh.fatty_liver",
        "aspd.has_children",
        "aspd.child_details",
        "aswd.is_workout",
        "aswd.cardio_workout",
        "aswd.weight_training_workout",
        "aswd.other_workout",
        "wr1.weight",
      ],
      table: `${tables.userDetails} ud`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "sop.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment} ass`,
          on: "ud.user_id = ass.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: "ass.assessment_id = aspd.assessment_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ud.mentor_assigned = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr1`,
          on: "ud.user_id = wr1.user_id and sop.sent_sessions = wr1.session",
        },
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr2`,
          on: "wr1.user_id = wr2.user_id and wr1.wmr_id < wr2.wmr_id",
        },
        {
          type: "LEFT",
          table: `(
            SELECT 
              od2.user_id, sop2.order_id, sop2.program_status, sop2.program_type
            FROM 
              order_details od2
            LEFT JOIN 
              sub_orders_programs sop2 ON sop2.order_id = od2.order_id
            WHERE 
              sop2.program_type = 0
          ) sop_count`,
          on: "sop_count.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop2`,
          on: "ud.user_id = sop2.user_id and sop2.program_type = 0 and sop2.program_status = '4'",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm2`,
          on: "sop2.program_id = pm2.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.bnMyGoalsNew} mg`,
          on: "ud.user_id = mg.user_id and sop.sub_order_id = mg.sub_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs`,
          on: "ud.user_id = hs.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.countries} c`,
          on: "ud.country_id = c.country_id",
        },
        {
          type: "LEFT",
          table: `${tables.states} s`,
          on: "ud.state_id = s.state_id",
        },
        {
          type: "LEFT",
          table: `${tables.cities} ci`,
          on: "ud.city_id = ci.city_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_nutrition_and_lifestyle} anal`,
          on: "ass.assessment_id = anal.assessment_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_medical_history} asmh`,
          on: "ass.assessment_id = asmh.assessment_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_workout_details} aswd`,
          on: "ass.assessment_id = aswd.assessment_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: user_id },
        { field: "wr2.wmr_id", operator: "IS", value: "NULL", raw: true },
      ],
    });

    const userDetails = clientDetails[0];
    const milestone = safeJSONParse(userDetails.comment, []);
    const { results: currentProgramDietDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.dietSessionLog} dsl`,
      conditions: [
        { field: "dsl.user_id", operator: "=", value: parseInt(user_id) },
        {
          field: "dsl.sub_order_id",
          operator: "=",
          value: userDetails.active_order_id,
        },
      ],
    });
    const { results: oldProgramDietDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.dietSessionLog} dsl`,
      conditions: [
        { field: "dsl.user_id", operator: "=", value: parseInt(user_id) },
        {
          field: "dsl.sub_order_id",
          operator: "!=",
          value: userDetails.active_order_id,
        },
      ],
    });
    console.log(userDetails, 1046);
    const { results: lastWeight } = await readRecord({
      selectFields: ["*"],
      table: `${tables.weightRecords} wr`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.weightRecords} wr2`,
          on: "wr.user_id = wr2.user_id and wr.wmr_id < wr2.wmr_id",
        },
      ],
      conditions: [
        { field: "wr2.wmr_id", operator: "IS NOT", value: "NULL", raw: true },
        { field: "wr.user_id", operator: "=", value: parseInt(user_id) },
        {
          field: "wr.sub_order_id",
          operator: "=",
          value: userDetails.active_order_id,
        },
        {
          field: "wr.session",
          operator: "=",
          value: parseInt(userDetails.sent_sessions - 1),
        },
      ],
    });

    // Initialize data object
    const data = {
      "Name of client": userDetails.client_name ?? "N/A",
      Temperature: "31° C", // Placeholder, dynamic temperature logic can be added later
      "COM of Mentor": userDetails.mentor_name ?? "N/A",
      "App Installed": userDetails.app_installed ?? "N/A",
      Age: `${userDetails.age} Yrs` ?? "N/A",
      "Goal Weight": userDetails.goal_weight ?? "N/A",
      Height: userDetails.height ?? "N/A",
      "Assessment Goals": userDetails.assessment_goals ?? "N/A",
      "Ass. St. Wt. (1st Prg Onwards)":
        userDetails.assessment_start_weight ?? "N/A",
      "Program Start Weight": userDetails.program_start_weight ?? "N/A",
      "Curr. Prgm. End Weight": userDetails.program_end_weight ?? "N/A",

      "Total Loss In Curr. Prg":
        userDetails.total_loss_in_current_program ?? "N/A",
      "Total Loss With Us": userDetails.total_loss_with_us ?? "N/A",
      "Program No.": userDetails.client_program_count ?? "N/A",
      "Current Program": userDetails.current_program ?? "N/A",
      MRP: userDetails.mrp ?? "N/A",
      "Amount Paid": userDetails.paid_amount ?? "N/A",
      "Pending sessions": userDetails.pending_session ?? "N/A",
      "Old Program": userDetails.advance_purchase_program ?? "NA",
      "Advance Purchase": userDetails.advance_purchase_program ?? "N/A",
      Milestone: milestone?.milestone_achieved ?? "No Ask",
      "Health Score": userDetails.overall_health_score ?? "No Ask",
      City: userDetails.city_name ?? "N/A",
      State: userDetails.state_name ?? "N/A",
      Country: userDetails.country_name ?? "N/A",
      Caste: userDetails.caste ?? "N/A",
      "Working / not working": userDetails.work_status ?? "N/A",
      "Veg / Non veg": userDetails.eating_habit ?? "N/A",
      "Who cooks": userDetails.who_cooks ?? "N/A",
      "Preferred Cuisine": userDetails.preffered_cuisine ?? "N/A",
      "Meals To Office": userDetails.meals_to_office ?? "N/A",
      "Food aversions": userDetails.food_aversions ?? "No",
    };

    // Process food allergies
    if (userDetails.food_allergies) {
      const obj = safeJSONParse(userDetails.food_allergies, {});
      const foods = Object.entries(obj.allergies || {}).map(
        ([key, value]) => value.food
      );
      data["Food Allergies"] = foods.join(", ") || "N/A";
    }

    // Process other medical issues
    if (userDetails.other_medical_issue) {
      const issues = safeJSONParse(userDetails.other_medical_issue, {});
      const medicalIssues = [];
      for (const [key, value] of Object.entries(issues)) {
        if (value) {
          medicalIssues.push({ key, value });
        }
      }
      medicalIssues.forEach((issue) => {
        data[issue.key] = issue.value;
      });
    }

    // Process other health conditions
    const healthConditions = [
      "acidity",
      "cholesterol",
      "diabetes",
      "pcos",
      "thyroid",
      "fatty_liver",
    ];
    healthConditions.forEach((condition) => {
      if (userDetails[condition]) {
        data[condition.charAt(0).toUpperCase() + condition.slice(1)] =
          userDetails[condition] || "N/A";
      }
    });

    // Process children's details
    if (userDetails.child_details) {
      const children = safeJSONParse(userDetails.child_details, []);
      children.forEach((child, index) => {
        data[`Age of Child ${index + 1}`] = child;
      });
    }

    // Process program diet details
    if (currentProgramDietDetails.length > 0) {
      const currentProgramDiets = {};
      currentProgramDietDetails.forEach((diet, index) => {
        currentProgramDiets[`${index}`] = diet?.diet_name;
      });
      data["Current Program Diet Details"] = currentProgramDiets;
    }

    if (oldProgramDietDetails.length > 0) {
      const oldProgramDiets = {};
      oldProgramDietDetails.forEach((diet, index) => {
        oldProgramDiets[`${index}`] = diet?.diet_name;
      });
      data["Old Program Diet Details"] = oldProgramDiets;
    }

    // Process workout details
    if (Number(userDetails.is_workout)) {
      const cardio = safeJSONParse(userDetails.cardio_workout, {});
      const weightTraining = safeJSONParse(
        userDetails.weight_training_workout,
        {}
      );
      const other = safeJSONParse(userDetails.other_workout, {});

      if (cardio?.frequency) {
        data["Cardio Workout"] = cardio.frequency || "N/A";
      }
      if (weightTraining?.frequency) {
        data["Weight Training Workout"] = weightTraining.frequency || "N/A";
      }
      if (other?.type_of_exercise) {
        data["Other Workout"] = other.frequency || "N/A";
      }
    }
    data[`Total Loss In Curr. Ssn (${userDetails.sent_sessions}th)`] =
      userDetails.weight - lastWeight.weight || "N/A";
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Client details fetched successfully",
      data,
    });
    res.status(200).json(apiResponse);
  } catch (error) {
    console.error("Error fetching client details:", error);
    res.status(500).send("Internal Server Error");
  }
};

export const referAFriend = async (req, res, next) => {
  let { user_id, name, email_id, phone_code, phone_number, sub_order_id } =
    req.body;
  if (!email_id) {
    const cleanedNumber = phone_number.replace(/\D/g, "");
    email_id = `${cleanedNumber}@bn.com`;
  }
  if (!user_id || !name || !email_id || !phone_code || !phone_number) {
    return next(new ErrorHandler("Invalid data", 400));
  }
  try {
    const { results: users } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} ud`,
      conditions: [
        {
          orConditions: [
            { field: "ud.email_id", operator: "=", value: email_id },
            {
              field: "ud.phone",
              operator: "=",
              value: `${phone_code} ${phone_number}`,
            },
          ],
        },
      ],
    });
    if (users.length > 0) {
      return next(new ErrorHandler("User already exists", 400));
    }
    const firstName = name.split(" ")[0];
    const last_name = name.split(" ").slice(1).join(" ");
    const insertResult = await insertRecord(
      tables.userDetails,
      [
        "first_name",
        "last_name",
        "email_id",
        "phone_number",
        "phone_code",
        "phone",
        "user_type",
        "lead_type",
        "primary_lead_source",
        "current_lead_source",
        "referred_by",
      ],
      [
        firstName,
        last_name,
        email_id,
        phone_number,
        phone_code,
        `${phone_code} ${phone_number}`,
        "0",
        "FL",
        22,
        22,
        user_id,
      ]
    );

    if (insertResult.affectedRows > 0) {
      const addSourceLog = await addSourceLogNew({
        source: "Referral",
        id: insertResult.insertId,
      });
      const addSalesLog = await addSaleStatusLogNew({
        sales_status: "0",
        id: insertResult.insertId,
      });
      const addStatusLog = await addStatusLogNew({
        status: "Lead",
        sub_status: "Inactive",
        id: insertResult.insertId,
      });

      const addToWallet = await addAmountWallet({
        user_id: user_id,
        amount: 100,
        reason: "Referred a friend",
        sub_order_id: sub_order_id,
      });
      const { results: user } = await readRecord({
        selectFields: [
          "cd.first_name",
          "ad.first_name as mentor_name",
          "ad.email_id as admin_email",
          "ad.active",
          "cd.mentor_assigned",
          "cd.user_id",
          "cd.email_id as client_email",
          "cd.counsellor_assigned",
          "cd.user_type",
          "adc.first_name as counsellor_name",
          "adc.email_id as counsellor_email",
          "adc.active as counsellor_active",
        ],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.adminUsers} ad`,
            on: "cd.mentor_assigned = ad.admin_user_id",
          },
          {
            type: "LEFT",
            table: `${tables.adminUsers} adc`,
            on: "cd.counsellor_assigned = adc.admin_user_id",
          },
        ],
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
      });
      const userDetails = user[0];
      console.log(userDetails, 1010101010);
      let mentor_name = userDetails.mentor_name;
      let mentor_to_be_assigned = userDetails.mentor_assigned;
      let mentor_email = userDetails.admin_email;
      let is_active_admin = userDetails.active;
      if (userDetails.user_type == "0" && userDetails.mentor_assigned == null) {
        mentor_to_be_assigned = userDetails.counsellor_assigned;
        mentor_name = userDetails.counsellor_name;
        mentor_email = userDetails.counsellor_email;
        is_active_admin = userDetails.counsellor_active;
      }

      const referData = { counsellor_assigned: mentor_to_be_assigned };
      const updateCondition = { user_id: insertResult.insertId };
      const updateResult = await updateRecord(
        `${tables.userDetails}`,
        referData,
        updateCondition
      );

      const { log } = await addLeadAssignLog({
        user_id: insertResult.insertId,
        counsellor_id: mentor_to_be_assigned,
        assigned_by: mentor_to_be_assigned,
      });

      const message = `<p>Hi ${
        userDetails.first_name
      },</p>\n<p>Thank you for sharing the contact details of <strong>${name}</strong>. I shall connect with <strong>${name}</strong> shortly and help out with the best program and rates.</p>\n<p><strong>Please confirm the contact details:</strong> ${
        String(phone_code) + String(phone_number)
      }</p>\n<p>Do send me the country and city of residence if possible as well, and any other detail that you think is crucial for me to know.</p>\n<p>Have credited a small thank you bonus of <strong>Rs.100</strong> to your <strong>BN Wallet</strong> as well :)</p>\n<p><strong>P.S.</strong> If you have any more friends you think need us, <a href="https://www.balancenutrition.in/app_link/screen_id=4">please click here</a> and send us their details.</p>
  `;
      const mailData = {
        subject: "New Referral Received",
        to: mentor_email,
        cc: [],
        bcc: [],
        html: `<p>Hello ${mentor_name},</p>
  
  <p>Below are the details:</p>
  
  <p><strong>Client Name:</strong> ${userDetails.first_name}<br>
  <strong>Client Email:</strong> ${userDetails?.client_email}<br>
  <strong>Referral Name:</strong> ${name}<br>
  <strong>Number:</strong> ${String(phone_code) + String(phone_number)}<br>
  <strong>Email Id:</strong> ${email_id}<br>
  <strong>Date:</strong> ${moment().format("DD-MM-YYYY")}</p>`,
      };
      const { hs } = safeJSONParse(is_active_admin);
      if (hs?.cc) {
        mailData.cc = hs.cc;
        console.log(hs.cc, 1234);
      }
      if (hs?.bcc) {
        mailData.bcc = hs.bcc;
        console.log(hs.bcc, 1235);
      }
      mailData.bcc.push("testerteam@balancenutrition.in");
      await sendMailUtil({
        from: "info@balancenutrition.in",
        to: mailData.to,
        subject: mailData.subject,
        cc: mailData.cc,
        bcc: mailData.bcc,
        html: mailData.html,
      });
      const autoChat = clientEnquiry.create({
        user_id: userDetails.user_id,
        name: userDetails.first_name,
        query: message,
        mentor_id: mentor_to_be_assigned,
        sender: "mentor",
        type: "broadcast",
      });
      const data = {
        statusCode: 201,
        message: "User added successfully",
        wallet_amount: 100,
      };
      return res.status(201).json(data);
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
// fetchConsultationCalls();

// Update name for user: Lead App API

export const updateUserFirstAndLastName = async (req, res, next) => {
  try {
    const { user_id, source } = req.body;
    const first_name = req.body.first_name;
    const last_name = req.body.last_name;

    console.log(req.body.first_name, 112233);

    // Validate the required user_id field
    if (!user_id) return next(new ErrorHandler("Invalid user_id", 400));

    if (first_name != "") {
      const updateUserDetailsName = await updateRecord(
        tables.userDetailsCopy,
        {
          first_name,
          last_name,
        },
        {
          user_id,
        }
      );

      if (updateUserDetailsName.affectedRows === 0) {
        return next(new ErrorHandler("Error while updating user details", 400));
      } else {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "Name updated successfully",
        });

        return res.status(200).json(apiResponse);
      }
    } else {
      return next(new ErrorHandler("First name missing", 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
