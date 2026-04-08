import md5 from "md5";
import { ZodError } from "zod";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";
import { formatZodErrors } from "../../helper/commonHelper.js";
import { redisKeys, sources, tables } from "../../helper/constant.js";
import { redis } from "../../middlewares/redisMiddleware.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { addRegisterMembersSchema } from "../../validators/registryValidators.js";
import {
  addLeadAssignLog,
  addSourceLogNew,
} from "../salesDashboardControllers/leadsController.js";
const addMember = async (req, res, next) => {
  try {
    const body = addRegisterMembersSchema.parse(req.body);

    const {
      first_name,
      last_name,
      email,
      alternative_email,
      phone_code,
      phone,
      password,
      gender,
      country_id,
      state_id,
      city_id,
      assign_to,
      source,
      admin_id,
    } = body;
    const { results: checkMemberExists } = await readRecord({
      table: `${tables.userDetails}`,
      conditions: [
        {
          orConditions: [
            { field: "email_id", operator: "=", value: email },
            { field: "phone_number", operator: "=", value: phone },
          ],
        },
      ],
    });

    if (checkMemberExists.length > 0) {
      return next(new ErrorHandler("Member Already Registered", 400));
    }

    const columns = [
      "first_name",
      "last_name",
      "email_id",
      "phone_code",
      "phone_number",
      "phone",
      "enc_password",
      "plain_password",
      "gender",
      "country_id",
    ];

    const values = [
      first_name,
      last_name,
      email,
      Number(phone_code),
      Number(phone),
      `${phone_code} ${phone}`,
      md5(password),
      password,
      String(gender).toLowerCase() === "male"
        ? "1"
        : String(gender).toLowerCase() === "female"
        ? "2"
        : "0",
      Number(country_id),
    ];

    if (alternative_email) {
      columns.push("alternate_email");
      values.push(alternative_email);
    }
    if (state_id) {
      columns.push("state_id");
      values.push(Number(state_id));
    }
    if (city_id) {
      columns.push("city_id");
      values.push(Number(city_id));
    }
    if (assign_to) {
      columns.push("counsellor_assigned");
      values.push(Number(assign_to));
    }
    if (source) {
      columns.push(
        "primary_lead_source",
        "current_lead_source",
        "current_primary_lead_source"
      );
      values.push(Number(source), Number(source), Number(source));
    }

    const rows = await insertRecord(`${tables.userDetails}`, columns, values);

    if (!rows.affectedRows || rows.affectedRows <= 0) {
      return next(new ErrorHandler("Error While Registering Member", 400));
    }
    if (assign_to) {
      console.log(admin_id, 101);
      const { log } = await addLeadAssignLog({
        user_id: rows.insertId,
        counsellor_id: assign_to,
        assigned_by: admin_id,
      });
    }
    if (source) {
      const sourceLog = {
        source: sources[source],
        id: rows.insertId,
      };
      addSourceLogNew(sourceLog);
    }
    const apiresponse = new ApiResponse(201, "Registered Member Successfully");

    return res.status(201).json(apiresponse);
  } catch (error) {
    console.log(error);
    if (error instanceof ZodError) {
      return formatZodErrors(error, res);
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getAllMembers = async (req, res, next) => {
  try {
    const { status, search, page, limit, mentor } = req.body;
    const selectFields = [
      "cd.added_date",
      "CONCAT(cd.first_name,' ',cd.last_name) as full_name",
      "cd.email_id",
      "CONCAT(cd.phone_code,' ',cd.phone_number) as phone_number",
      "cd.sub_user_status",
      "cd.my_wallet",
      "cd.old_wallet",
      "(SELECT otp FROM `login_registration_otp` WHERE phone_number like concat('%',trim(cd.phone_number),'%') ORDER BY `otp_id` DESC LIMIT 1) as otp",
      "cd.plain_password",
      "cd.user_id",
      "cd.gender",
      "cd.country_id",
      "cd.state_id",
      "cd.city_id",
      "country.country_name",
      "states.state_name",
      "city.city_name",
      `(SELECT apd.address FROM ${tables.assessment_personal_details} apd WHERE apd.user_id = cd.user_id LIMIT 1) as pincode`, 
      `(SELECT od.pincode FROM ${tables.orderDetails} od WHERE od.user_id = cd.user_id LIMIT 1) as pincode`,
      `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cd.mentor_assigned) as 'mentor_assigned'`,
      `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cd.counsellor_assigned) as 'counsellor_assigned'`,
    ];
    const joins = [
      {
        type: "LEFT",
        table: `${tables.countries} country`,
        on: "cd.country_id = country.country_id",
      },
      {
        type: "LEFT",
        table: `${tables.states} states`,
        on: "cd.state_id = states.state_id",
      },
      {
        type: "LEFT",
        table: `${tables.cities} city`,
        on: "cd.city_id = city.city_id",
      },
      {
        type: "LEFT",
        table: `${tables.subOrderPrograms} sop`,
        on: "cd.active_order_id = sop.sub_order_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sop.program_session_id = ps.program_session_id",
      },
    ];
    
    let conditions = [{ field: "cd.is_deleted", operator: "=", value: 0 }];
    if (status) {
      conditions.push({
        field: "cd.sub_user_status",
        operator: "=",
        value: status,
      });
    }
    if (mentor) {
      conditions.push({
        field: "cd.mentor_assigned",
        operator: "=",
        value: mentor,
      });
    }
    const { results: result, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      ...(conditions.length > 0 && { conditions }),
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name,' ',cd.last_name)",
            "cd.phone_number",
            "cd.email_id",
          ],
        },
      }),
      joins,
      pagination: { limit, page },
      countTotal: true,
      orderBy: ["cd.added_date DESC"],
    });
    const data = result.map((i) => ({
      client_details: {
        full_name: i.full_name,
        email_id: i.email_id,
        phone_number: i.phone_number,
        sub_user_status: i.sub_user_status,
        registeredDate: i.added_date,
        gender:
          i.gender === "1" ? "Male" : i.gender === "2" ? "Female" : "Others",
        country: {
          country_id: i.country_id,
          country_name: i.country_name,
        },
        state: {
          state_id: i.state_id,
          state_name: i.state_name,
        },
        city: {
          city_id: i.city_id,
          city_name: i.city_name,
        },
        address: i?.address, 
        pincode: i?.pincode,
        mentor_assigned: i.mentor_assigned,
        counsellor_assigned: i.counsellor_assigned,
      },
      wallet: {
        wallet: i.my_wallet,
        old_wallet: i.old_wallet,
      },
      credentials: {
        otp: i.otp,
        user_id: i.user_id,
        password: i.plain_password,
      },
    }));
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Members fetched successfully",
      data,
      totalCount,
    });
    const redisKey = `${redisKeys.registerMembers}:${page}:${limit}:${search}:${
      status ? status : undefined
    }`;

    await redis.setex(redisKey, 30, JSON.stringify({ data, totalCount }));
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export const getAllOTP = async (req, res, next) => {
  try {
    const { search, page, limit } = req.body;

    const select = [
      "sc.otp_id as id",
      "sc.name as name",
      "sc.otp as otp",
      "sc.phone_code as phone_code",
      "sc.phone_number as phone_number",
    ];
    const { results: otpRegister, totalCount } = await readRecord({
      table: `${tables.loginRegistrationOtp} sc`,
      selectFields: select,
      ...(search && {
        search: {
          searchFields: ["sc.name", "sc.phone_code", "sc.phone_number"],
          searchQuery: search,
        },
      }),
      pagination: { limit, page },
      countTotal: true,
      orderBy: ["sc.otp_id desc"],
    });

    if (!otpRegister) {
      return next(new ErrorHandler("Error While fetching programs", 400));
    } else if (otpRegister.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "OTP fetched successfully",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "OTP fetched successfully",
      data: otpRegister,
      meta_data: {},
      totalCount,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new ErrorHandler("id Not Provided", 400));
    }

    const updatedData = req.body;

    const condition = { user_id: parseInt(id) };
    const updateResult = await updateRecord(
      `${tables.userDetails}`,
      updatedData,
      condition
    );
    if (!updateResult.affectedRows > 0) {
      return next(new ErrorHandler("Error While Updating members", 400));
    }
    const apiresponse = new ApiResponse(201, "Member updated Successfully");

    return res.status(201).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const deleteMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.*"],
      conditions: [{ field: "ud.user_id", operator: "=", value: id }],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("no Member With Given Id", 400));
    }
    const updatedResult = await updateRecord(
      tables.userDetails,
      { is_deleted: 1 },
      { user_id: id }
    );
    if (updatedResult.affectedRows === 0)
      return next(new ErrorHandler("Error While Deleting Member", 400));
    return res
      .status(200)
      .json(new ApiResponse({ message: "Member Deleted Successfuly" }));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export { addMember, deleteMember, getAllMembers, updateMember };
