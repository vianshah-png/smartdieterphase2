import moment from "moment";
import { readPool } from "../../config/dbConnection.js";
import {
  insertRecord,
  readRecord,
  readRecordUnion,
  updateRecord,
  updateRecordAdvanced,
} from "../../config/query.js";
import {
  app_versions,
  leadSources,
  leadSubSources,
  sources,
  tables,
  image_guide_base_url_live,
} from "../../helper/constant.js";
import ejs from "ejs";
import path from "path";

import { calculateAge, safeJSONParse } from "../../helper/commonHelper.js";

import clientEnquiry from "../../models/clientQueryModel.js";

import {
  reAssignLeadUtil,
  updateClinicalConditions,
  updateKeyInsights,
  updatePrimarySourceUtil,
  updateSaleStatus,
  updateUserPhaseUtil,
} from "../../helper/leadHelpers.js";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import { createPaymentLink } from "../../utils/createPaymentLink.js";
import UserVisitLog from "../../models/userVisitLogModel.js";
import { calculateBMI, calculateIdealWeight } from "../../helper/common.js";
import {
  generateBlogContent,
  generateNotificationContent,
  generateSocialPostContent,
  generateSuccessStoryContent,
} from "../../helper/emailAutochatTemplateHelpers/getLeadTargetMessaegTemplates.js";
import { sendMailUtil } from "../../utils/sendEmail.js";

const getAllLeads = async (req, res, next) => {
  const { page, limit, search } = req.query;
  const source = req.headers.source;

  try {
    const pageNumber = parseInt(page, 10) || 1;
    const pageLimit = parseInt(limit, 10) || 10;

    const selectFields = [
      "cd.user_id",
      "CONCAT(cd.first_name, ' ', cd.last_name) as full_name",
      "cd.email_id AS email",
      "cd.phone_code",
      "CONCAT(cd.phone_code, ' ', cd.phone_number) as phone",
      "cd.birth_date AS dob",
      "cd.gender AS gender",
      "cd.mentor_assigned",
      "cd.counsellor_assigned",
      "cd.added_date AS registered_date",
      "cd.suggested_program_id",
      "ls.source_name",
      "cd.lead_type",
      "ad.first_name AS mentor_first_name",
      "ad.last_name AS mentor_last_name",
      "admin.first_name AS counsellor_first_name",
      "admin.last_name AS counsellor_last_name",
      "sp.program_session_id",
      "ps.program_id",
      "pm.program_name",
      "sp.suggested_amount",
      "sp.added_date AS suggested_date",
      "paym.payment_mode_name",
      "uki.key_insight",
      "cd.phase",
      "cd.follow_up_id",
      "CONCAT('[', GROUP_CONCAT(CONCAT('{\"log_date\":\"', fu.follow_up_date, '\",\"log_note\":\"', fu.follow_up_note, '\",\"log_time\":\"', fu.follow_up_time, '\",\"log_status\":\"', fu.follow_up_status, '\"}') ORDER BY fu.follow_up_date SEPARATOR ','), ']') AS logs",
      "GROUP_CONCAT(DISTINCT uki.key_insight ORDER BY uki.key_insight SEPARATOR ',') AS key_insights",
      "IF(cl.user_id IS NOT NULL, 'yes', 'no') as phone_consultation",
    ];

    const joins = [
      {
        type: "LEFT",
        table: `${tables.leadSource} ls`,
        on: "cd.current_lead_source = ls.source_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} ad`,
        on: "cd.mentor_assigned = ad.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.adminUsers} admin`,
        on: "cd.counsellor_assigned = admin.admin_user_id",
      },
      {
        type: "LEFT",
        table: `${tables.suggestedProgram} sp`,
        on: "cd.suggested_program_id = sp.suggested_program_id",
      },
      {
        type: "LEFT",
        table: `${tables.userKeyInsight} uki`,
        on: "cd.user_id = uki.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.programSession} ps`,
        on: "sp.program_session_id = ps.program_session_id",
      },
      {
        type: "LEFT",
        table: `${tables.programsMaster} pm`,
        on: "ps.program_id = pm.program_id",
      },
      {
        type: "LEFT",
        table: `${tables.leadFollowUpLogs} fu`,
        on: "cd.user_id = fu.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.consultationLogs} cl`,
        on: "cd.user_id = cl.user_id",
      },
      {
        type: "LEFT",
        table: `${tables.paymentModes} paym`,
        on: "sp.payment_mode_id = paym.payment_mode_id",
      },
    ];

    let conditions = [
      {
        field: "cd.user_type",
        operator: "=",
        value: "0",
      },
    ];

    const { results: result, totalCount } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields,
      joins,
      groupBy: ["cd.user_id"],
      conditions,
      pagination: { limit: pageLimit, page: pageNumber },
      ...(search && {
        search: {
          searchQuery: search,
          searchFields: [
            "CONCAT(cd.first_name, ' ', cd.last_name)",
            "cd.email_id",
            "cd.phone_number",
          ],
        },
      }),
      orderBy: ["cd.added_date DESC"],
      countTotal: true,
    });
    console.log(result.length, 254);
    if (!result || result.length === 0) {
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: "No leads found",
        data: [],
      });
      return res.status(200).json([apiresponse]);
    }

    const allLeads = result.map((row) => {
      const followUps = JSON.parse(row.logs || "[]");
      let latestFollowUp = null;
      let nextFollowUp = null;

      followUps.forEach((log) => {
        const followUpDateTime = new Date(`${log.log_date} ${log.log_time}`);

        if (log.log_status === "Done") {
          if (
            !latestFollowUp ||
            new Date(latestFollowUp.log_date) < followUpDateTime
          ) {
            latestFollowUp = log;
          }
        } else if (log.log_status === "Pending") {
          if (
            !nextFollowUp ||
            new Date(nextFollowUp.log_date) > followUpDateTime
          ) {
            nextFollowUp = log;
          }
        }
      });

      return {
        lead_details: {
          user_id: row.user_id,
          lead_name: row.full_name,
          email_id: row.email,
          phone_number: row.phone,
          registered_date: row.registered_date,
          counsellor_assigned: row.counsellor_assigned,
          counsellor_name: `${row.counsellor_first_name || ""} ${
            row.counsellor_last_name || ""
          }`.trim(),
        },
        sources: {
          source: row.source_name,
          phone_consultation: row.phone_consultation,
          last_follow_up: latestFollowUp,
          next_follow_up: nextFollowUp,
        },
        health_issues: {
          health_issue: "",
          suggested_program: row.program_name,
          current_weight: "",
          bmi: "",
          ideal_weight: "",
        },
      };
    });
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Leads fetched successfully",
      data: allLeads,
      totalCount,
    });

    return res.status(200).json([apiresponse]);
  } catch (error) {
    console.error("Error fetching leads:", error.message);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addLead = async (req, res, next) => {
  const { counsellor_id } = req.params;
  let {
    leadData,
    suggestedProgramData = {},
    followUpData = {},
    callData = {},
  } = req.body;

  // Handle birth date calculation using native Date methods
  if (leadData.age) {
    leadData.birth_date = new Date(
      new Date().setFullYear(new Date().getFullYear() - leadData.age, 0, 1),
    )
      .toISOString()
      .split("T")[0];
  }
  delete leadData.age;
  if (!leadData.start_weight) delete leadData.start_weight;
  if (!leadData.height) delete leadData.height;
  leadData.counsellor_assigned = counsellor_id;

  console.log(req.body, 358);

  // Check if leadData is empty after modifications
  if (Object.keys(leadData).length === 0) {
    return next(new ErrorHandler("No data provided", 400));
  }

  // Handle splitting lead_name into first_name and last_name before deleting lead_name
  if (leadData.lead_name) {
    const name = leadData.lead_name.split(" ");
    leadData.first_name = name[0];
    leadData.last_name = name.slice(1).join(" ");
    delete leadData.lead_name; // Now delete lead_name after processing
  }

  if (leadData.phone_code) {
    leadData.phone_code = leadData.phone_code.toString().replace(/\D/g, ""); // Keep only digits
  }

  if (leadData.phone_number) {
    leadData.phone_number = leadData.phone_number.toString().replace(/\D/g, ""); // Keep only digits
    leadData.phone = `${leadData.phone_code}-${leadData.phone_number}`;
  }

  if (!leadData.email_id || leadData.email_id.trim() === "") {
    leadData.email_id = `${leadData.phone_code}${leadData.phone_number}@bn.com`;
  }

  // Assign lead source and phase values
  if (leadData.current_lead_source) {
    leadData.primary_lead_source = leadData.current_lead_source;
  }
  if (leadData.current_phase) {
    leadData.previous_phase = leadData.current_phase;
  }

  // Set sales status based on suggestedProgramData
  if (Object.keys(suggestedProgramData).length > 0) {
    if (suggestedProgramData.suggested_amount) {
      leadData.sales_status = "3";
    } else if (suggestedProgramData.payment_mode_id) {
      leadData.sales_status = "2";
    }
  }

  // return false;
  try {
    // Insert lead data
    // 🔎 1. Check if lead already exists by phone or email
    const { results: existingLead } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: ["ud.user_id", "ud.email_id", "ud.phone_number"],
      conditions: [
        {
          field: "ud.phone_number",
          operator: "=",
          value: leadData.phone_number,
        },
        {
          field: "ud.phone_code",
          operator: "=",
          value: leadData.phone_code,
        },
      ],
    });

    if (existingLead.length > 0) {
      return res.status(200).json({
        status: false,
        message: "Lead already exists with this phone number",
        data: { existing_lead_id: existingLead[0].user_id },
      });
    }

    // Optionally also check email
    if (leadData.email_id) {
      const { results: existingEmailLead } = await readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: ["ud.user_id", "ud.email_id"],
        conditions: [
          { field: "ud.email_id", operator: "=", value: leadData.email_id },
        ],
      });
      if (existingEmailLead.length > 0) {
        return res.status(200).json({
          status: false,
          message: "Lead already exists with this email",
          data: { existing_lead_id: existingEmailLead[0].user_id },
        });
      }
    }

    if (leadData.gender) {
      leadData.gender = leadData.gender.toString();
    }

    // 🔥 2. Insert new lead if no duplicates
    const columns = Object.keys(leadData);
    const values = Object.values(leadData);
    const insertResult = await insertRecord(
      tables.userDetails,
      columns,
      values,
    );

    if (!insertResult) {
      return next(new ErrorHandler("Error while adding lead", 400));
    }

    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Lead added successfully",
      data: { lead_id: insertResult.insertId },
    });

    const [
      { results: userDetails },
      { results: programDetails },
      { results: programsSessionDetails },
      { results: adminDetails },
    ] = await Promise.all([
      readRecord({
        table: `${tables.userDetails} ud`,
        selectFields: [
          "ud.user_id",
          "ud.email_id",
          "ud.phone_number",
          "CONCAT_WS(' ', ud.first_name, ud.last_name) AS full_name",
        ],
        conditions: [
          {
            field: "ud.user_id",
            operator: "=",
            value: insertResult.insertId,
          },
        ],
      }),
      readRecord({
        table: `${tables.programsMaster} pm`,
        selectFields: ["pm.program_name"],
        conditions: [
          {
            field: "pm.program_id",
            operator: "=",
            value: suggestedProgramData.program_id,
          },
        ],
      }),
      readRecord({
        table: `${tables.programSession} pm`,
        selectFields: ["pm.program_duration"],
        conditions: [
          {
            field: "pm.program_session_id",
            operator: "=",
            value: suggestedProgramData.program_session_id,
          },
        ],
      }),
      readRecord({
        table: `${tables.adminUsers} ad`,
        selectFields: [
          "ad.first_name as admin_first_name",
          "ad.last_name as admin_last_name",
        ],
        conditions: [
          {
            field: "ad.admin_user_id",
            operator: "=",
            value: counsellor_id,
          },
        ],
      }),
    ]);
    let payment_link_id = null;
    if (
      suggestedProgramData.payment_mode_id &&
      Number(suggestedProgramData.payment_mode_id) === 1
    ) {
      const payment_link = await createPaymentLink({
        amount: suggestedProgramData.suggested_amount,
        expire_by: moment.utc(suggestedProgramData.payment_expiry).unix(),
        customerDetails: {
          email: userDetails[0].email_id,
          phone: `${userDetails[0].phone_number}`,
        },
        description: `Payment Link For ${userDetails[0].full_name} For ${programDetails[0].program_name} (${programsSessionDetails[0].program_duration}) Program`,
        source: "Mentor DB",
        user: userDetails[0].full_name,
        email: userDetails[0].email_id,
        phone: userDetails[0].phone_number,
        created_by: `${adminDetails[0].admin_first_name} ${adminDetails[0].admin_last_name}`,
      });

      const newPaymentLinkColumns = [
        "payment_link_id",
        "email",
        "phone_number",
        "program_id",
        "program_session_id",
        "amount",
        "expiry_at",
        "payment_link",
        "user_id",
        "admin_user_id",
      ];
      const newPaymentLinkValues = [
        payment_link.id,
        userDetails[0].email_id,
        userDetails[0].phone_number,
        suggestedProgramData.program_id,
        suggestedProgramData.program_session_id,
        suggestedProgramData.suggested_amount,
        suggestedProgramData.payment_expiry,
        payment_link.short_url,
        userDetails[0].user_id,
        counsellor_id,
      ];
      const newPaymentLinkEntry = await insertRecord(
        `${tables.paymentLinks}`,
        newPaymentLinkColumns,
        newPaymentLinkValues,
      );
      payment_link_id = newPaymentLinkEntry.insertId;
    }

    // Insert suggested program data
    if (suggestedProgramData && Object.keys(suggestedProgramData).length > 0) {
      suggestedProgramData.user_id = userDetails[0].user_id;
      suggestedProgramData.suggested_by = counsellor_id;
      suggestedProgramData.payment_link_id = payment_link_id;
      suggestedProgramData.program_days =
        programsSessionDetails[0].program_duration;
      const suggestedProgramColumn = Object.keys(suggestedProgramData);
      const suggestedProgramValues = Object.values(suggestedProgramData);
      const sugg_insert = await insertRecord(
        tables.suggestedProgram,
        suggestedProgramColumn,
        suggestedProgramValues,
      );
      const updatedData = { suggested_program_id: sugg_insert.insertId };
      const updateResult = await updateRecord(tables.userDetails, updatedData, {
        user_id: userDetails[0].user_id,
      });
    }

    // Insert call data if present
    if (callData && Object.keys(callData).length > 0) {
      callData.user_id = userDetails[0].user_id;
      callData.added_by = counsellor_id;
      const callUpdateColumns = Object.keys(callData);
      const callUpdateValues = Object.values(callData);
      await insertRecord(
        tables.callUpdates,
        callUpdateColumns,
        callUpdateValues,
      );
    }

    // Insert follow-up data
    if (followUpData && Object.keys(followUpData).length > 0) {
      followUpData.user_id = userDetails[0].user_id;
      followUpData.added_by = counsellor_id;

      const followUpColumns = Object.keys(followUpData);
      const followUpValues = Object.values(followUpData);
      await insertRecord(
        tables.leadFollowUpLogs,
        followUpColumns,
        followUpValues,
      );
    }

    // Status, source, and sales status logs
    const statusLog = {
      status: leadData.user_status || "Lead",
      sub_status: leadData.sub_user_status || "Inactive",
      id: userDetails[0].user_id,
    };
    const sourceLog = {
      source: sources[leadData.current_lead_source],
      id: userDetails[0].user_id,
    };
    const salesStatusLog = {
      sales_status: leadData.sales_status || "0",
      id: userDetails[0].user_id,
    };

    // Await all asynchronous log functions
    await addSaleStatusLogNew(salesStatusLog); // user_sales_status log
    await addStatusLogNew(statusLog);

    if (leadData.current_lead_source) {
      await addSourceLogNew(sourceLog);
    }

    // Handle counsellor assignment
    if (leadData.counsellor_assigned) {
      await addLeadAssignLog({
        user_id: userDetails[0].user_id,
        counsellor_id: counsellor_id,
        assigned_by: counsellor_id,
      });
    }
    // try {
    //   const hsData = {};
    //   if (leadData.start_weight && leadData.height) {
    //     const bmi = calculateBMI(leadData.start_weight, leadData.height);
    //     if (bmi) {
    //       hsData.body_mass_index = bmi;
    //     }
    //     const idealBMI = Number(
    //       (
    //         leadData.start_weight / Math.pow(processHeight(leadData.height), 2)
    //       ).toFixed(2),
    //     );
    //     if (idealBMI) {
    //       hsData.ideal_bmi = idealBMI;
    //     }
    //   }
    //   if (leadData.height && leadData.gender) {
    //     const gender =
    //       leadData.gender == "1"
    //         ? "male"
    //         : leadData.gender == "2"
    //           ? "female"
    //           : "other";
    //     const ideal_weight = calculateIdealWeight(leadData.height, gender);
    //     if (ideal_weight) {
    //       hsData.ideal_weight = ideal_weight;
    //     }
    //   }
    //   if (Object.keys(hsData).length > 0) {
    //     const insertHSData = insertRecord(
    //       tables.healthScoreClient,
    //       ["user_id", ...Object.keys(hsData)],
    //       [userDetails[0].user_id, ...Object.values(hsData)],
    //     );
    //     if (insertHSData.affectedRows === 1) {
    //       apiResponse.message += " and health score data initialized";
    //       console.log("Health score data inserted successfully");
    //     }
    //   }
    // } catch (error) {
    //   console.log(error, "error in inserting health score data");
    // }

    return res.status(201).json(apiResponse);
  } catch (error) {
    console.error("Error details:", error); // Improved logging for error details
    if (error.code === "ER_DUP_ENTRY") {
      return next(new ErrorHandler(error.sqlMessage, 500));
    }
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const addFollowUpUtil = async (followUpData) => {
  const {
    user_id,
    slot_id,
    type,
    follow_up_date,
    follow_up_note = "",
    added_by,
    assigned_to,
  } = followUpData;

  const columns = [
    "user_id",
    "slot_id",
    "type",
    "follow_up_date",
    "follow_up_note",
    "added_by",
    "assigned_to",
  ];

  const values = [
    user_id,
    slot_id || 0,
    type,
    follow_up_date,
    follow_up_note,
    added_by,
    assigned_to,
  ];

  if (
    moment(follow_up_date).format("YYYY-MM-DD") ===
      moment().format("YYYY-MM-DD") &&
    follow_up_note &&
    follow_up_note.length > 0
  ) {
    columns.push("follow_up_status");
    values.push(1);
  }
  const result = {
    followUpAdded: false,
    followUpId: null,
    callBooked: false,
    callId: null,
    error: null,
  };

  try {
    const insertResult = await insertRecord(
      tables.leadFollowUpLogs,
      columns,
      values,
    );
    console.log(insertResult, 545, "utils function");
    console.log(typeof insertResult.affectedRow);
    if (insertResult.affectedRows === 1) {
      console.log("follow up added ", 547);
      result.followUpAdded = true;
      result.followUpId = insertResult.insertId;

      if (type == 0) {
        console.log("call type ", 552);
        // Book a call if the type is 0
        const callData = {
          slot_id: slot_id || 0,
          follow_up_id: insertResult.insertId,
          user_id,
          call_type: "14",
          schedule_date: follow_up_date,
          added_by,
          source: "DB",
        };
        if (
          moment(follow_up_date).format("YYYY-MM-DD") ===
            moment().format("YYYY-MM-DD") &&
          follow_up_note &&
          follow_up_note.length > 0
        ) {
          callData.call_status = 1;
          callData.call_insights = follow_up_note;
        }
        const callColumns = Object.keys(callData);
        const callValues = Object.values(callData);

        const callBookResult = await insertRecord(
          tables.callUpdates,
          callColumns,
          callValues,
        );

        if (callBookResult.affectedRows === 1) {
          result.callBooked = true;
          result.callId = callBookResult.insertId;
        }
      }
    }
  } catch (error) {
    console.error(error);
    result.error =
      error.message || "Unknown error occurred while adding follow-up";
  }

  return result;
};
const addEngageMentUtil = async (followUpData) => {
  const {
    user_id,
    slot_id,
    engagement_type,
    engagement_date,
    engagement_note = "",
    added_by,
    assigned_to,
  } = followUpData;

  const columns = [
    "user_id",
    "slot_id",
    "type",
    "engagement_date",
    "engagement_note",
    "added_by",
    "assigned_to",
  ];

  const values = [
    user_id,
    slot_id || 0,
    engagement_type,
    engagement_date,
    engagement_note,
    added_by,
    assigned_to,
  ];
  if (
    engagement_note &&
    engagement_note.length > 0 &&
    moment(engagement_date).format("YYYY-MM-DD") ===
      moment().format("YYYY-MM-DD")
  ) {
    columns.push("status");
    values.push(1);
  }
  const result = {
    engagementAdded: false,
    engagementId: null,
    callBooked: false,
    callId: null,
    error: null,
  };

  try {
    const insertResult = await insertRecord(
      tables.leadEngagementLogs,
      columns,
      values,
    );
    console.log(insertResult, 545, "add engagement utils function");
    console.log(typeof insertResult.affectedRow);
    if (insertResult.affectedRows === 1) {
      console.log("engagement  added ", 547);
      result.engagementAdded = true;
      result.engagementId = insertResult.insertId;

      if (engagement_type == 0) {
        console.log("call type ", 552);
        // Book a call if the type is 0
        const callData = {
          slot_id: slot_id || 0,
          user_id,
          call_type: "45",
          schedule_date: engagement_date,
          added_by,
          source: "DB",
        };
        if (
          engagement_note &&
          engagement_note.length > 0 &&
          moment(engagement_date).format("YYYY-MM-DD") ===
            moment().format("YYYY-MM-DD")
        ) {
          callData.call_status = 1;
          callData.call_insights = engagement_note;
        }
        const callColumns = Object.keys(callData);
        const callValues = Object.values(callData);

        const callBookResult = await insertRecord(
          tables.callUpdates,
          callColumns,
          callValues,
        );

        if (callBookResult.affectedRows === 1) {
          result.callBooked = true;
          result.callId = callBookResult.insertId;
        }
      }
    }
  } catch (error) {
    console.error(error);
    result.error =
      error.message || "Unknown error occurred while adding engagement";
  }

  return result;
};

const addFollowUp = async (req, res, next) => {
  const {
    user_id,
    slot_id,
    type,
    follow_up_date,
    added_by,
    assigned_to,
    follow_up_note,
  } = req.body;

  const followUpData = {
    user_id,
    slot_id,
    type,
    follow_up_date,
    added_by,
    assigned_to,
    follow_up_note,
  };

  try {
    // Use the utility function to handle the follow-up creation and call booking
    console.log(followUpData, 600, "follow up data api");
    const followUpResult = await addFollowUpUtil(followUpData);
    console.log(followUpResult, 601, "utils response ");
    if (followUpResult.followUpAdded) {
      if (followUpResult.callBooked) {
        // Follow-up and call booking both successful
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: `Follow Up added and call booked successfully`,
          data: {
            follow_id: followUpResult.followUpId,
            call_id: followUpResult.callId,
          },
        });
        return res.status(201).json(apiResponse);
      } else if (followUpResult.callBooked === false && followUpResult.error) {
        // Follow-up added but call booking failed due to an error
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: `Follow Up added but call not booked successfully due to an error`,
          data: {
            follow_id: followUpResult.followUpId,
          },
        });
        return res.status(201).json(apiResponse);
      } else {
        // Follow-up added but call not booked (no error, just unsuccessful)
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: `Follow Up added but call not booked successfully`,
          data: {
            follow_id: followUpResult.followUpId,
          },
        });
        return res.status(201).json(apiResponse);
      }
    } else {
      // Follow-up creation failed
      return next(
        new ErrorHandler(
          followUpResult.error || "Failed to add Follow Up",
          400,
        ),
      );
    }
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const addEngagement = async (req, res, next) => {
  const {
    user_id,
    slot_id,
    type,
    schedule_date: engagement_date,
    added_by,
    assigned_to,
    engagement_note,
  } = req.body;

  const engagementData = {
    user_id,
    slot_id,
    engagement_type: type,
    engagement_date,
    added_by,
    assigned_to,
    engagement_note,
  };

  try {
    // Use the utility function to handle the engagement creation and call booking
    console.log(engagementData, 600, "engagement data api");
    const engagementResult = await addEngageMentUtil(engagementData);
    console.log(engagementResult, 601, "utils response ");
    if (engagementResult.engagementAdded) {
      if (engagementResult.callBooked) {
        // Engagement and call booking both successful
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: `Engagement added and call booked successfully`,
          data: {
            engagement_id: engagementResult.engagementId,
            call_id: engagementResult.callId,
          },
        });
        return res.status(201).json(apiResponse);
      } else if (
        engagementResult.callBooked === false &&
        engagementResult.error
      ) {
        // Engagement added but call booking failed due to an error
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: `Engagement added but call not booked successfully due to an error`,
          data: {
            follow_id: followUpResult.followUpId,
          },
        });
        return res.status(201).json(apiResponse);
      } else {
        // Engagement added but call not booked (no error, just unsuccessful)
        const apiResponse = new ApiResponse({
          statusCode: 201,
          message: `Engagement added but call not booked successfully`,
          data: {
            engagement_id: engagementResult.engagementId,
          },
        });
        return res.status(201).json(apiResponse);
      }
    } else {
      // Engagement creation failed
      return next(
        new ErrorHandler(
          engagementData.error || "Failed to add Engagement",
          400,
        ),
      );
    }
  } catch (error) {
    console.error(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const statusLog = async (req, res, next) => {
  try {
    const { results: result } = await readRecord({
      table: tables.leadStatusLog,
      selectFields: ["*"],
    });

    if (!result) {
      return next(new ErrorHandler("Error while fetching status logs", 400));
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse(200, "No status logs found", []);
      return res.status(200).json([apiResponse]);
    }
    console.log(result);
    const logs = result.map((log) => {
      console.log(log);
      return {
        id: log.status_log_id,
        user_id: log.user_id,
        added_date: log.added_date,
        status_log: JSON.parse(log.status_log),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Status logs fetched successfully",
      data: logs,
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};

const sourceLog = async (req, res, next) => {
  try {
    const { results: result } = await readRecord({
      table: tables.leadSourceLog,
      selectFields: ["*"],
    });

    if (!result) {
      return next(new ErrorHandler("Error while fetching source logs", 400));
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse(200, "No source logs found", []);
      return res.status(200).json([apiResponse]);
    }
    console.log(result);
    const logs = result.map((log) => {
      console.log(log);
      return {
        id: log.source_log_id,
        user_id: log.user_id,
        added_date: log.added_date,
        status_log: JSON.parse(log.source_log),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Source logs fetched successfully",
      data: logs,
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};
const phaseLog = async (req, res, next) => {
  try {
    const { results: result } = await readRecord({
      table: tables.phaseLogs,
      selectFields: ["*"],
    });

    if (!result) {
      return next(new ErrorHandler("Error while fetching phase logs", 400));
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse(200, "No phase logs found", []);
      return res.status(200).json([apiResponse]);
    }
    console.log(result, 404);
    const logs = result.map((log) => {
      console.log(log);
      return {
        id: log.phase_log_id,
        user_id: log.user_id,
        added_date: log.added_date,
        phase_log: JSON.parse(log.phase_log),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Phase logs fetched successfully",
      data: logs,
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};
const stageLogs = async (req, res, next) => {
  try {
    const { results: result } = await readRecord({
      table: tables.leadStageLog,
      selectFields: ["*"],
    });

    if (!result) {
      return next(new ErrorHandler("Error while fetching stage logs", 400));
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse(200, "No stage log found", []);
      return res.status(200).json([apiResponse]);
    }
    console.log(result, 404);
    const logs = result.map((log) => {
      console.log(log);
      return {
        id: log.phase_log_id,
        user_id: log.user_id,
        phase_log: JSON.parse(log.stage_logs),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Stage logs fetched successfully",
      data: logs,
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};
const salesStatusLogs = async (req, res, next) => {
  try {
    const { results: result } = await readRecord({
      table: tables.leadSaleStatusLog,
      selectFields: ["*"],
    });

    if (!result) {
      return next(
        new ErrorHandler("Error while fetching sales status logs", 400),
      );
    }
    if (result.length === 0) {
      const apiResponse = new ApiResponse(200, "No sales status log found", []);
      return res.status(200).json([apiResponse]);
    }
    console.log(result, 404);
    const logs = result.map((log) => {
      console.log(log);
      return {
        id: log.phase_log_id,
        user_id: log.user_id,
        phase_log: JSON.parse(log.sales_status_log),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Sales status logs fetched successfully",
      data: logs,
    });
    res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateLeadStatus = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));
  const { prev_status, updated_status, prev_sub_status, updated_sub_status } =
    req.body;
  if (
    !prev_status ||
    !updated_status ||
    !prev_sub_status ||
    !updated_sub_status
  )
    return next(new ErrorHandler("All fields are required", 400));

  try {
    const updatedData = {
      user_status: updated_status,
      sub_user_status: updated_sub_status,
    };
    const condition = { user_id: parseInt(leadId) };
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);
    if (updateResult) {
      const apiResponse = new ApiResponse(
        200,
        `Lead ${leadId} updated Successfully`,
      );
      addStatusLog({
        prev_status,
        updated_status,
        prev_sub_status,
        updated_sub_status,
        leadId,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${id}`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updatedLeadPhase = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));
  const { prev_phase, updated_phase } = req.body;
  console.log(prev_phase, updated_phase, 478);
  if (!prev_phase || !updated_phase)
    return next(new ErrorHandler("All fields are required", 400));

  try {
    const updatedData = {
      previous_phase: prev_phase,
      current_phase: updated_phase,
    };
    const condition = { user_id: parseInt(leadId) };
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);
    if (updateResult) {
      const apiResponse = new ApiResponse(
        200,
        `Lead ${leadId} updated Successfully`,
      );
      addPhaseLog({
        prev_phase,
        updated_phase,
        leadId,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${id}`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateLeadSource = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));
  const { prev_source, updated_source, prev_sub_source, updated_sub_source } =
    req.body;
  if (
    !prev_source ||
    !updated_source ||
    !prev_sub_source ||
    !updated_sub_source
  )
    return next(new ErrorHandler("All fields are required", 400));

  try {
    const updatedData = {
      current_lead_source: updated_source,
      lead_sub_source: updated_sub_source,
    };
    const condition = { user_id: parseInt(leadId) };
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);
    if (updateResult) {
      const apiResponse = new ApiResponse(
        200,
        `Lead ${leadId} updated Successfully`,
      );
      addSourceLog({
        prev_source: leadSources[prev_source],
        updated_source: leadSources[updated_source],
        prev_sub_source: leadSubSources[prev_sub_source],
        updated_sub_source: leadSubSources[updated_sub_source],
        leadId,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${id}`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function addStatusLog(data) {
  const {
    prev_status,
    updated_status,
    prev_sub_status,
    updated_sub_status,
    leadId,
  } = data;

  console.log(data, 449);
  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.leadStatusLog,
      selectFields: ["status_log", "user_id"],
      conditions: [{ field: "user_id", operator: "=", value: leadId }],
    });
    console.log(prevLogs, 457);

    let statusLogs = [];

    if (prevLogs.length > 0) {
      // Parse existing logs if available
      statusLogs = JSON.parse(prevLogs[0].status_log);
    }

    // Add new log entry
    statusLogs.push({
      prev_status,
      updated_status,
      prev_sub_status,
      updated_sub_status,
    });

    // Prepare data for upsert
    const updatedData = {
      status_log: JSON.stringify(statusLogs),
    };
    const condition = { user_id: leadId };

    // Insert or update the record
    const operation = prevLogs.length > 0 ? updateRecord : insertRecord;
    const columns =
      prevLogs.length > 0 ? null : ["user_id", "added_by", "status_log"];
    const values =
      prevLogs.length > 0 ? null : [leadId, "1", updatedData.status_log];

    await operation(
      tables.leadStatusLog,
      operation === updateRecord ? updatedData : columns,
      operation === updateRecord ? condition : values,
    );

    console.log("Status Log added successfully");
  } catch (error) {
    console.error("Error adding status log:", error);
  }
}

async function addSourceLog(data) {
  const {
    prev_source,
    updated_source,
    prev_sub_source,
    updated_sub_source,
    leadId,
  } = data;
  console.log(data, 1004);

  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.leadSourceLog,
      selectFields: ["source_log"],
      conditions: [{ field: "user_id", operator: "=", value: leadId }],
    });

    let sourceLogs = [];

    if (prevLogs.length > 0) {
      // Parse existing logs if available
      sourceLogs = JSON.parse(prevLogs[0].source_log);
    }
    console.log(prevLogs, 525);

    // Add new log entry
    sourceLogs.push({
      prev_source,
      updated_source,
      prev_sub_source,
      updated_sub_source,
    });

    // Prepare data for upsert
    const updatedData = {
      source_log: JSON.stringify(sourceLogs),
    };
    const condition = { user_id: leadId };
    console.log(updatedData, 536);

    // Insert or update the record
    const operation = prevLogs.length > 0 ? updateRecord : insertRecord;
    const columns =
      prevLogs.length > 0 ? null : ["user_id", "added_by", "source_log"];
    const values =
      prevLogs.length > 0 ? null : [leadId, "1", updatedData.source_log];

    await operation(
      tables.leadSourceLog,
      operation === updateRecord ? updatedData : columns,
      operation === updateRecord ? condition : values,
    );

    console.log("Source Log added successfully");
  } catch (error) {
    console.error("Error adding source log:", error);
  }
}
async function addPhaseLog(data) {
  const { prev_phase, updated_phase, leadId } = data;
  console.log(data, 1057);

  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.phaseLogs,
      selectFields: ["phase_log"],
      conditions: [{ field: "user_id", operator: "=", value: leadId }],
    });

    let phaseLogs = [];

    if (prevLogs.length > 0) {
      // Parse existing logs if available
      phaseLogs = JSON.parse(prevLogs[0].phase_log);
    }
    console.log(prevLogs, 525);

    // Add new log entry
    phaseLogs.push({
      prev_phase,
      updated_phase,
    });

    // Prepare data for upsert
    const updatedData = {
      phase_log: JSON.stringify(phaseLogs),
    };
    const condition = { user_id: leadId };
    console.log(updatedData, 536);

    // Insert or update the record
    const operation = prevLogs.length > 0 ? updateRecord : insertRecord;
    const columns =
      prevLogs.length > 0 ? null : ["user_id", "added_by", "phase_log"];
    const values =
      prevLogs.length > 0 ? null : [leadId, "1", updatedData.phase_log];
    console.log(columns, values);
    await operation(
      tables.phaseLogs,
      operation === updateRecord ? updatedData : columns,
      operation === updateRecord ? condition : values,
    );

    console.log("Phase Log added successfully");
  } catch (error) {
    console.error("Error adding phase log:", error);
  }
}

async function addLeadAssignLog(data) {
  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const log = await insertRecord(tables.leadAssignedLog, columns, values);
    return { log };
  } catch (error) {
    console.log(error);
  }
}

const assignLead = async (req, res, next) => {
  const { user_id } = req.params;
  const { old_counsellor_id, new_counsellor_id, assigned_by } = req.body;

  if (!user_id || !old_counsellor_id || !new_counsellor_id)
    return next(
      new ErrorHandler("Invalid client id or counsellor details", 400),
    );
  try {
    const updateCounsellor = await updateRecord(
      tables.userDetails,
      { counsellor_assigned: new_counsellor_id },
      { user_id: parseInt(user_id) },
    );
    console.log(updateCounsellor);
    if (updateCounsellor.info.substr(0, 27) === "Rows matched: 1  Changed: 0") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No rows changed",
      });
      return res.status(200).json(apiResponse);
    }
    await addLeadAssignLog({
      user_id: user_id,
      assigned_by: assigned_by,
      counsellor_id: new_counsellor_id,
    });

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Counsellor assigned successfully",
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateUserStatus = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));

  const { status, sub_status } = req.body; // Simplified to only get status and sub_status
  if (!status || !sub_status)
    return next(new ErrorHandler("Status and sub-status are required", 400));

  try {
    // Prepare the data for the update
    const updatedData = {
      user_status: status, // Update the main user status
      sub_user_status: sub_status, // Update the sub-status
    };

    // Define the condition for the update
    const condition = { user_id: parseInt(leadId) };

    // Execute the update query for the main user details
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult, 928);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      // After updating the main user data, log the status change
      await addStatusLogNew({
        status, // New status passed in the request
        sub_status, // New sub-status passed in the request
        id: leadId, // User ID
      });

      // Prepare the successful response
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Lead ${leadId} updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${leadId}`, 400));
    }
  } catch (error) {
    console.error("Error updating lead status:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateUserSource = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));

  const { source, sub_source } = req.body; // Simplified to only get source and sub_source
  if (!source || !sub_source)
    return next(new ErrorHandler("Source and sub-source are required", 400));

  try {
    // Prepare the data for the update
    const updatedData = {
      current_lead_source: source, // Update the lead source
      lead_sub_source: sub_source, // Update the lead sub-source
    };

    // Define the condition for the update
    const condition = { user_id: parseInt(leadId) };

    // Execute the update query for the main user details
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);

    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      // After updating the main user data, log the source change
      await addSourceLogNew({
        source: leadSources[source], // New lead source
        sub_source: leadSubSources[sub_source], // New lead sub-source
        id: leadId, // User ID
      });

      // Prepare the successful response
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Lead ${leadId} updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${leadId}`, 400));
    }
  } catch (error) {
    console.error("Error updating lead source:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateUserPhase = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));
  const { prev_phase, updated_phase } = req.body;
  console.log(prev_phase, updated_phase, 478);
  if (!prev_phase || !updated_phase)
    return next(new ErrorHandler("All fields are required", 400));

  try {
    const updatedData = {
      previous_phase: prev_phase,
      current_phase: updated_phase,
    };
    const condition = { user_id: parseInt(leadId) };
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Lead ${leadId} updated Successfully`,
      });
      addPhaseLogNew({
        phase: updated_phase,
        id: leadId,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${id}`, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateUserStage = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));

  const { stage } = req.body; // Get only the stage
  if (!stage) return next(new ErrorHandler("Stage is required", 400));

  try {
    // Prepare the data for the update
    const updatedData = {
      stage: stage, // Update the main user stage
    };

    // Define the condition for the update
    const condition = { user_id: parseInt(leadId) };

    // Execute the update query for the main user details
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);

    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      // After updating the main user data, log the stage change
      console.log(leadId, 1360);
      await addStageLogNew({
        stage, // New stage passed in the request
        id: leadId, // User ID
      });

      // Prepare the successful response
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Lead ${leadId} stage updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${leadId}`, 400));
    }
  } catch (error) {
    console.error("Error updating lead stage:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const updateUserSalesStatus = async (req, res, next) => {
  const leadId = req.params.id;
  if (!leadId) return next(new ErrorHandler("Invalid lead id", 400));

  const { sales_status, sub_sales_status } = req.body;
  if (!sales_status && !sub_sales_status)
    return next(
      new ErrorHandler("Sales status or sub sales status is required", 400),
    );

  try {
    // Prepare the data for the update
    const updatedData = {
      sales_status: sales_status,
      sub_sales_status: sub_sales_status,
    };

    // Define the condition for the update
    const condition = { user_id: parseInt(leadId) };

    // Execute the update query for the main user details
    const updateResult = await updateRecord(
      tables.userDetails,
      updatedData,
      condition,
    );
    console.log(updateResult);

    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    }
    if (updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1") {
      // After updating the main user data, log the stage change
      await addSaleStatusLogNew({
        sales_status, // New stage passed in the request
        id: leadId, // User ID
      });

      // Prepare the successful response
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Lead ${leadId} sales status  updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead ${leadId}`, 400));
    }
  } catch (error) {
    console.error("Error updating lead stage:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

async function addStatusLogNew({ status, sub_status, id }) {
  try {
    // Fetch existing status logs for the user
    const { results: prevLogs } = await readRecord({
      table: tables.leadStatusLog,
      selectFields: ["status_log", "user_id"],
      conditions: [{ field: "user_id", operator: "=", value: id }],
    });

    if (prevLogs.length > 0) {
      // If there are existing logs, append the new log using JSON_ARRAY_APPEND
      await updateRecord(
        tables.leadStatusLog,
        {
          status_log: {
            raw: true,
            query: `JSON_ARRAY_APPEND(status_log, '$', JSON_OBJECT('status','${status}','sub_status','${sub_status}', 'timestamp', NOW()))`,
          },
        },
        {
          user_id: id,
        },
      );
      console.log("Log updated with JSON_ARRAY_APPEND.");
    } else {
      // If there are no existing logs, insert a new record with the first log entry
      const newLog = [
        {
          status,
          sub_status,
          timestamp: new Date().toISOString(),
        },
      ];

      await insertRecord(
        tables.leadStatusLog,
        ["user_id", "status_log"],
        [id, JSON.stringify(newLog)],
      );
      console.log("New log inserted for the user.");
    }
  } catch (error) {
    console.error("Error adding status log:", error);
  }
}
async function addSourceLogNew(data) {
  const { source, id } = data;
  console.log(data, 1484);

  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.leadSourceLog,
      selectFields: ["source_log", "user_id"],
      conditions: [{ field: "user_id", operator: "=", value: id }],
    });

    // Get current date in IST
    const currentDate = new Date();
    const currentTimestamp = new Date(
      currentDate.getTime() + 5.5 * 60 * 60 * 1000,
    ).toISOString(); // Convert to IST

    if (prevLogs.length > 0) {
      // If logs exist, use JSON_ARRAY_APPEND to update the source_log
      const logresult = await updateRecord(
        tables.leadSourceLog,
        {
          source_log: {
            raw: true,
            query: `JSON_ARRAY_APPEND(source_log, '$', JSON_OBJECT('source', '${source}','timestamp', NOW()))`,
          },
        },
        { user_id: id },
      );

      console.log("Source log updated with JSON_ARRAY_APPEND.");
      return { logresult };
    } else {
      // If no logs exist, insert a new record with the initial log
      const newLog = [
        {
          source,
          timestamp: currentTimestamp,
        },
      ];

      const logresult = await insertRecord(
        tables.leadSourceLog,
        ["user_id", "added_by", "source_log"],
        [id, "1", JSON.stringify(newLog)],
      );
      console.log("New source log inserted for the user.");
      return { logresult };
    }
  } catch (error) {
    console.error("Error adding source log:", error);
  }
}

async function addPhaseLogNew(data) {
  const { phase, id } = data; // Accept only phase and id
  console.log(data, 1539);

  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.phaseLogs,
      selectFields: ["phase_log"],
      conditions: [{ field: "user_id", operator: "=", value: id }],
    });

    const currentTimestamp = new Date().toISOString();

    if (prevLogs.length > 0) {
      // If logs exist, use JSON_ARRAY_APPEND to update the phase_log
      await updateRecord(
        tables.phaseLogs,
        {
          phase_log: {
            raw: true,
            query: `JSON_ARRAY_APPEND(phase_log, '$', JSON_OBJECT('phase', '${phase}', 'timestamp', NOW()))`,
          },
        },
        { user_id: id },
      );
      console.log("Phase log updated with JSON_ARRAY_APPEND.");
    } else {
      // If no logs exist, insert a new record with the initial log
      const newLog = [
        {
          phase,
          timestamp: currentTimestamp,
        },
      ];

      await insertRecord(
        tables.phaseLogs,
        ["user_id", "added_by", "phase_log"],
        [id, "1", JSON.stringify(newLog)],
      );
      console.log("New phase log inserted for the user.");
    }
  } catch (error) {
    console.error("Error adding phase log:", error);
  }
}
async function addStageLogNew(data) {
  const { stage, id } = data; // Accept only stage and id
  console.log(data, 1586);

  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.leadStageLog, // Assuming the table name is stageLog
      selectFields: ["stage_logs", "user_id"],
      conditions: [{ field: "user_id", operator: "=", value: id }],
    });

    // Get current date in IST
    const currentDate = new Date();
    const currentTimestamp = new Date(
      currentDate.getTime() + 5.5 * 60 * 60 * 1000,
    ).toISOString(); // Convert to IST

    if (prevLogs.length > 0) {
      // If logs exist, use JSON_ARRAY_APPEND to update the stage_log
      await updateRecord(
        tables.leadStageLog,
        {
          stage_logs: {
            raw: true,
            query: `JSON_ARRAY_APPEND(stage_logs, '$', JSON_OBJECT('stage', '${stage}', 'timestamp', NOW()))`,
          },
        },
        { user_id: id },
      );
      console.log("Stage log updated with JSON_ARRAY_APPEND.");
    } else {
      // If no logs exist, insert a new record with the initial log
      const newLog = [
        {
          stage,
          timestamp: currentTimestamp,
        },
      ];

      await insertRecord(
        tables.leadStageLog,
        ["user_id", "stage_logs"],
        [id, JSON.stringify(newLog)],
      );
      console.log("New stage log inserted for the user.");
    }
  } catch (error) {
    console.error("Error adding stage log:", error);
  }
}

async function addSaleStatusLogNew(data) {
  const { sales_status, id, sub_sales_status } = data; // Accept only stage and id
  console.log(data, 1638);

  try {
    // Read existing logs
    const { results: prevLogs } = await readRecord({
      table: tables.leadSaleStatusLog,
      selectFields: ["sales_status_log", "user_id"],
      conditions: [{ field: "user_id", operator: "=", value: id }],
    });

    // Get current date in IST
    const currentDate = new Date();
    const currentTimestamp = new Date(
      currentDate.getTime() + 5.5 * 60 * 60 * 1000,
    ).toISOString(); // Convert to IST

    if (prevLogs.length > 0) {
      // If logs exist, use JSON_ARRAY_APPEND to update the stage_log
      const result = await updateRecord(
        tables.leadSaleStatusLog,
        {
          sales_status_log: {
            raw: true,
            query: `
  JSON_ARRAY_APPEND(
    sales_status_log, '$',
    JSON_OBJECT(
      'sales_status', '${sales_status}',
      ${sub_sales_status ? `'sub_sales_status', '${sub_sales_status}',` : ""}
      'timestamp', NOW()
    )
  )
`,
          },
        },
        { user_id: id },
      );
      console.log("Stage log updated with JSON_ARRAY_APPEND.");
    } else {
      // If no logs exist, insert a new record with the initial log
      const newLog = [
        {
          sales_status,
          timestamp: currentTimestamp,
          sub_sales_status: sub_sales_status || null,
        },
      ];

      await insertRecord(
        tables.leadSaleStatusLog,
        ["user_id", "sales_status_log"],
        [id, JSON.stringify(newLog)],
      );
      console.log("New stage log inserted for the user.");
    }
    return { success: true };
  } catch (error) {
    console.error("Error adding stage log:", error);
  }
}
function isFutureOrPast(dateStr, timeRangeStr) {
  const today = moment().startOf("day"); // Set the current date to 00:00:00
  const dateToCheck = moment(dateStr).startOf("day"); // Set the input date to 00:00:00

  if (dateToCheck.isAfter(today)) {
    return true; // The date is in the future
  } else if (dateToCheck.isBefore(today)) {
    return false; // The date is in the past
  }
  const [startTimeStr, endTimeStr] = timeRangeStr.split(" - ");

  const startDateTime = moment(`${dateStr} ${startTimeStr}`).format(
    "YYYY-MM-DD hh:mm a",
  );
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  console.log(currentDateTime, 1705);
  const currentMoment = moment(currentDateTime).format("YYYY-MM-DD hh:mm a");
  const dateMoment = moment(currentMoment);
  const hours = dateMoment.hour();
  const minutes = dateMoment.minute();
  const currentHourAndMin = `${hours}:${minutes}`;
  const newTime = moment(
    `${dateStr} ${currentHourAndMin}`,
    "YYYY-MM-DD hh:mm a",
  );

  if (newTime.isBefore(startDateTime)) {
    return true; // Slot has not passed, it's in the future
  }

  return false; // Slot is ongoing
}
function isFutureOrPastOneHour(dateStr, timeRangeStr) {
  const today = moment().startOf("day"); // Set the current date to 00:00:00
  const dateToCheck = moment(dateStr).startOf("day"); // Set the input date to 00:00:00

  if (dateToCheck.isAfter(today)) {
    return true; // The date is in the future
  } else if (dateToCheck.isBefore(today)) {
    return false; // The date is in the past
  }
  const [startTimeStr, endTimeStr] = timeRangeStr.split(" - ");

  const startDateTime = moment(`${dateStr} ${startTimeStr}`).format(
    "YYYY-MM-DD hh:mm a",
  );
  const currentDate = new Date();
  const oneHourEarlier = new Date(currentDate.getTime() - 60 * 60 * 1000);
  const currentDateTime = oneHourEarlier.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  console.log(currentDateTime, 1739);
  const currentMoment = moment(currentDateTime).format("YYYY-MM-DD hh:mm a");
  const dateMoment = moment(currentMoment);
  const hours = dateMoment.hour();
  const minutes = dateMoment.minute();
  const currentHourAndMin = `${hours}:${minutes}`;
  const newTime = moment(
    `${dateStr} ${currentHourAndMin}`,
    "YYYY-MM-DD hh:mm a",
  );

  if (newTime.isBefore(startDateTime)) {
    return true; // Slot has not passed, it's in the future
  }

  return false; // Slot is ongoing
}

const checkMentorSlot = async (req, res, next, internal = false) => {
  const { id, date, type } = internal || req.query;

  if (!id || !date) {
    if (internal) return { error: "Id and date both reqired" };
    return res.status(400).json({ error: "id and date are required." });
  }

  const day = moment(date).format("dddd");
  if (day === "Sunday" || date < moment().format("YYYY-MM-DD")) {
    if (internal) return [];
    return next(new ErrorHandler("No slots available on Sunday", 400));
  }

  try {
    let availableSlots = [];
    let bookedSlotsUsers = [];

    if (type == 1 || type == 2) {
      const isToday = moment(date).isSame(moment(), "day");
      const currentTime = moment().format("HH:mm:ss");

      const { results: bookedSlots } = await readRecord({
        table: tables.leadFollowUpLogs,
        selectFields: ["slot_id"],
        conditions: [
          { field: "added_by", operator: "=", value: parseInt(id) },
          { field: "DATE(follow_up_date)", operator: "=", value: date },
          { field: "type", operator: "IN", value: ["1", "2"] },
          { field: "follow_up_status", operator: "=", value: 0 },
        ],
      });
      const bookedSlotIds = bookedSlots.map((s) => s.slot_id);
      const slotConditions = [
        {
          field: "is_active",
          operator: "=",
          value: 1,
        },
      ];

      if (bookedSlotIds.length) {
        slotConditions.push({
          field: "id",
          operator: "NOT IN",
          value: bookedSlotIds,
        });
      }

      if (isToday) {
        slotConditions.push({
          field: "start_time",
          operator: ">=",
          value: currentTime,
        });
      }

      const { results } = await readRecord({
        table: `${tables.whatsappAppSlots}`,
        selectFields: ["id", "appointment_slots", "start_time"],
        conditions: slotConditions,
        orderBy: ["id ASC"],
      });

      availableSlots = results;
    } else {
      const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
      const slotTimeRanges = {
        1: "10:00 am - 10:20 am",
        2: "10:30 am - 10:50 am",
        3: "11:00 am - 11:20 am",
        4: "11:30 am - 11:50 am",
        5: "12:00 pm - 12:20 pm",
        6: "12:30 pm - 12:50 pm",
        7: "01:00 pm - 01:20 pm",
        8: "01:30 pm - 01:50 pm",
        9: "02:00 pm - 02:20 pm",
        10: "02:30 pm - 02:50 pm",
        11: "03:00 pm - 03:20 pm",
        12: "03:30 pm - 03:50 pm",
        13: "04:00 pm - 04:20 pm",
        14: "04:30 pm - 04:50 pm",
        15: "05:00 pm - 05:20 pm",
        16: "05:30 pm - 05:50 pm",
        17: "06:00 pm - 06:20 pm",
        // 18–26 are commented in original code
      };

      // 🔹 Custom condition for mentor id 312
      if (
        req.headers.source !== "mentor_db" &&
        Number(id) === 312 &&
        ["Tuesday", "Wednesday"].includes(day)
      ) {
        const customSlots = [
          5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
          24,
        ];

        slots.length = 0;
        slots.push(...customSlots);

        slotTimeRanges[5] = "12:00 pm - 12:20 pm";
        slotTimeRanges[6] = "12:30 pm - 12:50 pm";
        slotTimeRanges[7] = "01:00 pm - 01:20 pm";
        slotTimeRanges[8] = "01:30 pm - 01:50 pm";
        slotTimeRanges[9] = "02:00 pm - 02:20 pm";
        slotTimeRanges[10] = "02:30 pm - 02:50 pm";
        slotTimeRanges[11] = "03:00 pm - 03:20 pm";
        slotTimeRanges[12] = "03:30 pm - 03:50 pm";
        slotTimeRanges[13] = "04:00 pm - 04:20 pm";
        slotTimeRanges[14] = "04:30 pm - 04:50 pm";
        slotTimeRanges[15] = "05:00 pm - 05:20 pm";
        slotTimeRanges[16] = "05:30 pm - 05:50 pm";
        slotTimeRanges[17] = "06:00 pm - 06:20 pm";
        slotTimeRanges[18] = "06:30 pm - 06:50 pm";
        slotTimeRanges[19] = "07:00 pm - 07:20 pm";
        slotTimeRanges[20] = "07:30 pm - 07:50 pm";
        slotTimeRanges[21] = "08:00 pm - 08:20 pm";
        slotTimeRanges[22] = "08:30 pm - 08:50 pm";
        slotTimeRanges[23] = "09:00 pm - 09:20 pm";
        slotTimeRanges[24] = "09:30 pm - 09:50 pm";
      }

      if (
        req.headers.source === "mentor_db" &&
        !(
          Number(id) === 52 &&
          ["Tuesday", "Thursday"].includes(day) &&
          moment(date).isBefore(moment("2026-06-30"))
        )
      ) {
        slots.push(18);
        slotTimeRanges[18] = "06:30 pm - 06:50 pm";
        slots.push(19);
        slotTimeRanges[19] = "07:00 pm - 07:20 pm";
        slots.push(20);
        slotTimeRanges[20] = "07:30 pm - 07:50 pm";
        const { results: adminDetails } = await readRecord({
          selectFields: ["ad.admin_user_id"],
          table: `${tables.adminUsers} ad`,
          conditions: [
            { field: "ad.admin_user_id", operator: "=", value: parseInt(id) },
            { field: "ad.role_id", operator: "=", value: 1 },
          ],
        });
        if (adminDetails.length > 0) {
          slots.push(21);
          slotTimeRanges[21] = "08:00 pm - 08:20 pm";
          slots.push(22);
          slotTimeRanges[22] = "08:30 pm - 08:50 pm";
          slots.push(23);
          slotTimeRanges[23] = "09:00 pm - 09:20 pm";
          slots.push(24);
          slotTimeRanges[24] = "09:30 pm - 09:50 pm";
          slots.push(25);
          slotTimeRanges[25] = "10:00 pm - 10:20 pm";
          slots.push(26);
          slotTimeRanges[26] = "10:30 pm - 10:50 pm";
          slots.push(29);
          slotTimeRanges[29] = "11:00 pm - 11:20 pm";
          slots.push(30);
          slotTimeRanges[30] = "11:30 pm - 11:50 pm";
        }
      }

      if (
        Number(id) === 52 &&
        ["Tuesday", "Thursday"].includes(day) &&
        moment(date).isBefore(moment("2026-06-30"))
      ) {
        delete slotTimeRanges[17];
        slots.pop();
        slotTimeRanges[27] = "09:00 am - 09:20 am";
        slotTimeRanges[28] = "09:30 am - 09:50 am";
        const allSlots = [...slots];
        slots.length = 0;
        slots.push(27, 28, ...allSlots);
      }

      if (Number(id) === 215) {
        slots.push(18);
        slotTimeRanges[18] = "06:30 pm - 06:50 pm";
        slots.push(19);
        slotTimeRanges[19] = "07:00 pm - 07:20 pm";
        slots.push(20);
        slotTimeRanges[20] = "07:30 pm - 07:50 pm";
        // slots.push(21);
        // slotTimeRanges[21] = "08:00 pm - 08:20 pm";
        // slots.push(22);
        // slotTimeRanges[22] = "08:30 pm - 08:50 pm";
        // slots.push(23);
        // slotTimeRanges[23] = "09:00 pm - 09:20 pm";
        // slots.push(24);
        // slotTimeRanges[24] = "09:30 pm - 09:50 pm";
        // slots.push(25);
        // slotTimeRanges[25] = "10:00 pm - 10:20 pm";
        // slots.push(26);
        // slotTimeRanges[26] = "10:30 pm - 10:50 pm";
        // slots.push(29);
        // slotTimeRanges[29] = "11:00 pm - 11:20 pm";
        // slots.push(30);
        // slotTimeRanges[30] = "11:30 pm - 11:50 pm";
      }

      const condition = [];
      if ([240, 183, 284, 266].includes(parseInt(id))) {
        if ([240, 183].includes(parseInt(id))) {
          condition.push({
            field: "cu.added_by",
            operator: "IN",
            value: [240, 183],
          });
        }else if([232, 282].includes(parseInt(id))){
          condition.push({
            field: "cu.added_by",
            operator: "IN",
            value: [232, 282],
          });
        } else {
          condition.push({
            field: "cu.added_by",
            operator: "IN",
            value: [284, 266],
          });
        }
      } else {
        condition.push({
          field: "cu.added_by",
          operator: "=",
          value: parseInt(id),
        });
      }

      const { results: callBookedSlots } = await readRecord({
        table: `${tables.callUpdates} cu`,
        selectFields: [
          "CONCAT('[',GROUP_CONCAT(cu.slot_id),']') as slots",
          "CONCAT('[', GROUP_CONCAT(JSON_OBJECT('user_id', cu.user_id, 'slot_id', cu.slot_id,'time_slot',s.appointment_slots)), ']') AS users",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.slots} s`,
            on: "s.id = cu.slot_id",
          },
        ],
        conditions: [
          ...condition,
          {
            field: "cu.schedule_date",
            operator: "=",
            value: date,
          },
          {
            field: "cu.call_status",
            operator: "!=",
            value: 2,
          },
        ],
      });

      const { results: followUpSlots } = await readRecord({
        table: `${tables.leadFollowUpLogs} lfu`,
        selectFields: [
          "CONCAT('[',GROUP_CONCAT(lfu.slot_id),']') as slots",
          "CONCAT('[', GROUP_CONCAT(JSON_OBJECT('user_id', lfu.user_id, 'slot_id', lfu.slot_id,'time_slot',s.appointment_slots)), ']') AS users",
        ],
        joins: [
          {
            type: "LEFT",
            table: `${tables.slots} s`,
            on: "s.id = lfu.slot_id",
          },
        ],
        conditions: [
          {
            field: "lfu.added_by",
            operator: "=",
            value: parseInt(id),
          },
          {
            field: "lfu.follow_up_date",
            operator: "=",
            value: date,
          },
          {
            field: "lfu.type",
            operator: "=",
            value: "0",
          },
        ],
      });

      const bookedSlots = [...callBookedSlots, ...followUpSlots];
      console.log(bookedSlots, 1860);
      const bookedSlotIds = [
        ...JSON.parse(bookedSlots[0].slots ?? "[]"),
        ...JSON.parse(bookedSlots[1].slots ?? "[]"),
      ];

      bookedSlotsUsers = [
        ...JSON.parse(bookedSlots[0].users ?? "[]"),
        ...JSON.parse(bookedSlots[1].users ?? "[]"),
      ];
      console.log(bookedSlots, 1876);
      const isMentor = req.headers.source === "mentor_db";

      const availableSlotsIds = slots.filter((slot) => {
        const slotRange = slotTimeRanges[`${slot}`];
        const isSlotAvailable = !bookedSlotIds.includes(slot);
        const isValidTime = isMentor
          ? isFutureOrPastOneHour(date, slotRange)
          : isFutureOrPast(date, slotRange);

        return isSlotAvailable && isValidTime;
      });
      console.log(availableSlotsIds, 1560);

      if (availableSlotsIds.length === 0) {
        const apiResponse = new ApiResponse({
          statusCode: 200,
          message: "No slots available",
          data: [],
        });
        if (internal) return { error: "No slots available" };
        return res.status(200).json([apiResponse]);
      }

      const { results } = await readRecord({
        table: `${tables.slots}`,
        selectFields: ["id", "appointment_slots"],
        conditions: [{ field: "id", operator: "IN", value: availableSlotsIds }],
        orderBy: [`Field(id, ${availableSlotsIds.join(",")})`],
      });

      availableSlots = results;
    }

    if (!availableSlots.length) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No slots available",
        data: [],
      });
      if (internal) return { error: "No slots available" };
      return res.status(200).json([apiResponse]);
    }

    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Success",
      data: availableSlots,
      meta_data: { booked_slots_users: bookedSlotsUsers || [] },
    });

    if (internal) return availableSlots;
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export const addFollowUpWatiWebhook = async (
  req,
  res,
  next,
  internal = false,
) => {
  try {
    const getNextAvailableSlot = async (mentorId, date, depth = 0) => {
      if (depth > 7) return null; // max 7 days lookahead
      let checkDate = moment(date);

      // Skip Sunday
      if (checkDate.format("dddd") === "Sunday") {
        checkDate = checkDate.add(1, "days");
      }
      const formattedDate = checkDate.format("YYYY-MM-DD");
      const result = await checkMentorSlot(null, null, null, {
        internal: true,
        id: mentorId,
        date: formattedDate,
        type: 1,
        headers: { source: "mentor_db" },
      });

      // If slots found → return slot + date
      if (result && result.length > 0) {
        return {
          slotId: result[0].id,
          followUpDate: formattedDate,
        };
      }
      // Otherwise recursively check next day
      return getNextAvailableSlot(
        mentorId,
        checkDate.add(1, "days").format("YYYY-MM-DD"),
        depth + 1,
      );
    };

    console.log(req.body, req.query, 'HELLO') ;
    let campaign; 
    const sender  = req?.body?.sender ;
    campaign = req.body?.campaign ; 
    const {userId, source, campaign: emailCampaign} = internal ; 

    console.log(internal, 'internal'); 
    
    if (emailCampaign) campaign = emailCampaign ; 

    if ((!sender && !userId) || sender == "{{phone}}") {
      throw new Error("Either sender or userId is required");
    }

    const normalizePhone = sender?.toString().replace(/\D/g, "").slice(-10);
    const { results: senderUser } = await readRecord({
      table: tables.userDetails,
      selectFields: [
        "user_id",
        "CASE WHEN user_status='Lead' THEN counsellor_assigned ELSE mentor_assigned END as mentor_assigned",
      ],
      conditions: [
        ...(normalizePhone
          ? [
              {
                field: "RIGHT(phone_number,10)",
                operator: "=",
                value: `'${normalizePhone}'`,
                raw: true,
              },
            ]
          : []),
        ...(userId ? [{ field: "user_id", operator: "=", value: userId }] : []),
      ],
    });

    if (senderUser.length == 0) {
      if (internal != false) return { message: "No user found" };
      return res.status(200).json({
        message: "NO user found",
      });
    }

    const mentorId = senderUser[0].mentor_assigned;
    let followUpDate = moment().add(1, "days").format("YYYY-MM-DD");
    const senderUserId = senderUser[0].user_id;
    if (moment(followUpDate).format("dddd") === "Sunday")
      followUpDate = moment().add(1, "days").format("YYYY-MM-DD");

    const slotData = await getNextAvailableSlot(mentorId, followUpDate);
    if (!slotData) {
      if (internal !== false) {
        return { message: "No slots available for mentor" };
      }
      return res.status(200).json({
        message: "No slots available for mentor",
      });
    }

    const { slotId, followUpDate: finalFollowUpDate } = slotData;
    followUpDate = finalFollowUpDate;

    const { results: alreadyBooked } = await readRecord({
      table: tables.leadFollowUpLogs,
      columns: ["user_id", "slot"],
      conditions: [
        {field: "user_id", operator: "=", value: senderUserId}, 
        {field: "follow_up_date", operator: "=", value: followUpDate}, 
        {field: "follow_up_status", operator: "=", value: 0},
        {field: "type", operator: "IN", value: "(1,2,'1','2')"},
      ],
    });

    if (alreadyBooked.length > 0) {
      if (internal != false) return { message: "FU already booked" };
      return res.status(200).json({
        message: "FU already booked!",
      });
    }

    const columns = [
      "user_id",
      "slot_id",
      "type",
      "follow_up_date",
      "added_by",
      "assigned_to",
      "source",
      "campaign",
    ];

    const values = [
      senderUserId,
      slotId || 0,
      "1",
      followUpDate,
      mentorId,
      mentorId,
      source ? source : "WATI",
      campaign ? campaign : "",
    ];

    console.log(columns, values, "heeyyy");
    await insertRecord(tables.leadFollowUpLogs, columns, values);
  } catch (error) {
    console.error(error);
    return next(
      new ErrorHandler(error?.message || "Internal Server Error", 500),
    );
  }
};

export const addFollowupForEmailClicks = async (req, res, next) => {
  try {
    const { userIds, campaign, source } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        message: "userIds must be a non-empty array",
      });
    }

    const results = [];
    for (const userId of userIds) {
      try {
        const response = await addFollowUpWatiWebhook({}, {}, null, {
          internal: true,
          userId,
          source: source || "EMAIL",
          campaign,
        });
        results.push({
          userId,
          status: "success",
          response,
        });
      } catch (err) {
        console.error(`Follow-up failed for user ${userId}`, err);
        results.push({
          userId,
          status: "failed",
          error: err?.message || "Unknown error",
        });
      }
    }

    console.log({
      message: "Bulk follow-up processing completed",
      total: userIds.length,
      success: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });

    return res.status(200).json({
      message: "Bulk follow-up processing completed",
      total: userIds.length,
      success: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error(error);
    return next(
      new ErrorHandler(error?.message || "Internal Server Error", 500),
    );
  }
};

const checkUserExist = async (req, res, next) => {
  const { email_id, phone_number } = req.body;
  if (!email_id && !phone_number) {
    return next(new ErrorHandler("email_id or phone_no is required"));
  }
  try {
    let conditions = [];
    if (email_id) {
      conditions.push({
        field: `(email_id = '${email_id}' OR alternate_email = '${email_id}')`,
        operator: "",
        value: "",
        raw: true,
      });
    }
    if (phone_number) {
      conditions.push({
        field: "phone_number",
        operator: "=",
        value: phone_number,
      });
    }
    const { results: users } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: [
        "CONCAT(cd.first_name,' ',cd.last_name) as user_name",
        "cd.email_id",
        "cd.phone_number",
        "cd.alternate_email",
      ],
      conditions: conditions,
    });
    console.log(users, 1570);
    if (users.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Success",
        data: [],
      });
      return res.status(200).json([apiResponse]);
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Success",
      data: users,
    });
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const suggestProgramToUser = async (req, res, next) => {
  const { id } = req.params;
  const suggestedProgramData = req.body;
  if (!id) {
    return next(new ErrorHandler("Id is required ", 400));
  }
  try {
    suggestedProgramData.suggested_by = id;
    const columns = Object.keys(suggestedProgramData);
    const values = Object.values(suggestedProgramData);

    if (
      suggestedProgramData.payment_mode_id &&
      Number(suggestedProgramData.payment_mode_id) === 1
    ) {
      const [
        { results: userDetails },
        { results: programDetails },
        { results: adminDetails },
      ] = await Promise.all([
        readRecord({
          table: `${tables.userDetails} ud`,
          selectFields: [
            "ud.email_id",
            "ud.phone_number",
            "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
          ],
          conditions: [
            {
              field: "ud.user_id",
              operator: "=",
              value: user_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.programsMaster} pm`,
          selectFields: ["pm.program_name"],
          conditions: [
            {
              field: "pm.program_id",
              operator: "=",
              value: suggestedProgramData.program_id,
            },
          ],
        }),
        readRecord({
          table: `${tables.adminUsers} ad`,
          selectFields: [
            "ad.first_name as admin_first_name",
            "ad.last_name as admin_last_name",
          ],
          conditions: [
            {
              field: "ad.admin_user_id",
              operator: "=",
              value: suggestedProgramData.suggested_by,
            },
          ],
        }),
      ]);
      const payment_link = await createPaymentLink({
        amount: suggestedProgramData.suggested_amount,
        expire_by: moment.utc(suggestedProgramData.payment_expiry).unix(),
        customerDetails: {
          email: userDetails[0].email_id,
          phone: `${userDetails[0].phone_number}`,
        },
        description: `Payment Link For ${userDetails[0].full_name} For ${programDetails[0].program_name}`,
        user: userDetails[0].full_name,
        email: userDetails[0].email_id,
        phone: userDetails[0].phone_number,
        created_by: `${adminDetails[0].admin_first_name} ${adminDetails[0].admin_last_name}`,
      });

      const newPaymentLinkColumns = [
        "payment_link_id",
        "email",
        "phone_number",
        "program_id",
        "program_session_id",
        "amount",
        "expiry_at",
        "payment_link",
        "user_id",
        "admin_user_id",
      ];
      const newPaymentLinkValues = [
        payment_link.id,
        userDetails[0].email_id,
        userDetails[0].phone_number,
        suggestedProgramData.program_id,
        suggestedProgramData.program_session_id,
        suggestedProgramData.suggested_amount,
        suggestedProgramData.payment_expiry,
        payment_link.short_url,
        user_id,
        suggestedProgramData.suggested_by,
      ];
      const newPaymentLinkEntry = await insertRecord(
        `${tables.paymentLinks}`,
        newPaymentLinkColumns,
        newPaymentLinkValues,
      );
      suggestedProgramData.payment_link_id = newPaymentLinkEntry.insertId;
    }

    const insertResult = await insertRecord(
      tables.subOrderPrograms,
      columns,
      values,
    );
    if (insertResult.affectedRow === 1) {
      const updateSalesStatusData = {};
      if (suggestedProgramData.suggested_amount) {
        updateSalesStatusData.status = "3";
      }
      if (suggestedProgramData.payment_mode_id) {
        updateSalesStatusData.status = "2";
      }
      const updateResult = await updateRecord(
        tables.userDetails,
        updateSalesStatusData,
        { user_id: suggestedProgramData.user_id },
      );
      if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
        console.log("No users found with the given id");
      } else if (
        updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
      ) {
        console.log("No changes made for user sales status");
      } else if (
        updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
      ) {
        console.log("user sales status updated successfully ");
        await addSaleStatusLogNew({
          sales_status: updateSalesStatusData.status,
          id: suggestedProgramData.user_id,
        });
      } else {
        console.log("Error updating the user sales status");
      }
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "suggested program added successfully",
        data: insertResult.insertId,
      });
      return res.status(200).json(apiResponse);
    }
    return next(new ErrorHandler("Error while adding suggested program", 404));
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateSuggestedProgram = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next(
      new ErrorHandler(
        "Id is required for updating the suggested program",
        400,
      ),
    );
  }
  const updatedData = req.body;
  if (!updatedData.user_id) {
    return next(new ErrorHandler("user_id is required ", 400));
  }
  const user_id = updatedData.user_id;
  delete updatedData.user_id;
  if (updatedData.suggested_amount) {
    updatedData.status = "3";
  }
  if (updatedData.payment_mode_id) {
    updatedData.status = "2";
  }

  let message = ""; // Initialize message variable

  // Fetch paymentModeDetails once
  const { results: paymentModeDetails } = await readRecord({
    selectFields: ["*"],
    table: `${tables.paymentModes} pm`,
    conditions: [
      {
        field: "pm.payment_mode_id",
        operator: "=",
        value: updatedData.payment_mode_id,
      },
    ],
  });

  // Ensure paymentModeDetails is fetched, otherwise return an error
  // if (!paymentModeDetails || paymentModeDetails.length === 0) {
  //   return next(new ErrorHandler("Invalid payment mode selected", 400));
  // }
  const [
    { results: userDetails },
    { results: programDetails },
    { results: programsSessionDetails },
    { results: adminDetails },
  ] = await Promise.all([
    readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "ud.phone_number",
        "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
    }),
    readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: ["pm.program_name"],
      conditions: [
        {
          field: "pm.program_id",
          operator: "=",
          value: updatedData.program_id,
        },
      ],
    }),
    readRecord({
      table: `${tables.programSession} pm`,
      selectFields: ["pm.program_duration"],
      conditions: [
        {
          field: "pm.program_session_id",
          operator: "=",
          value: updatedData.program_session_id,
        },
      ],
    }),
    readRecord({
      table: `${tables.adminUsers} ad`,
      selectFields: [
        "ad.first_name as admin_first_name",
        "ad.last_name as admin_last_name",
      ],
      conditions: [
        {
          field: "ad.admin_user_id",
          operator: "=",
          value: updatedData.suggested_by,
        },
      ],
    }),
  ]);
  // Handle payment mode-specific messages
  if (updatedData.payment_mode_id && updatedData.payment_mode_id === 1) {
    const expiryMoment = moment(updatedData.payment_expiry)
      .utcOffset("+05:30") // shift to IST
      .set({ hour: 23, minute: 55, second: 0, millisecond: 0 });
    const expiryUnix = expiryMoment.unix(); // Unix seconds

    const expiryDateTime = expiryMoment.format("YYYY-MM-DD HH:mm:ss");
    // Create payment link
    const payment_link = await createPaymentLink({
      amount: updatedData.suggested_amount,
      expire_by: expiryUnix,
      customerDetails: {
        email: userDetails[0].email_id,
        phone: `${userDetails[0].phone_number}`,
      },
      description: `Payment Link For ${userDetails[0].full_name} For ${programDetails[0].program_name} (${programsSessionDetails[0].program_duration})`,
      user: userDetails[0].full_name,
      email: userDetails[0].email_id,
      phone: userDetails[0].phone_number,
      created_by: `${adminDetails[0].admin_first_name} ${adminDetails[0].admin_last_name}`,
    });

    // Create new payment link entry in database
    const newPaymentLinkColumns = [
      "payment_link_id",
      "email",
      "phone_number",
      "program_id",
      "program_session_id",
      "amount",
      "expiry_at",
      "payment_link",
      "user_id",
      "admin_user_id",
    ];
    const newPaymentLinkValues = [
      payment_link.id,
      userDetails[0].email_id,
      userDetails[0].phone_number,
      updatedData.program_id,
      updatedData.program_session_id,
      updatedData.suggested_amount,
      expiryDateTime,
      payment_link.short_url,
      user_id,
      updatedData.suggested_by,
    ];
    const newPaymentLinkEntry = await insertRecord(
      `${tables.paymentLinks}`,
      newPaymentLinkColumns,
      newPaymentLinkValues,
    );
    updatedData.payment_link_id = newPaymentLinkEntry.insertId;
    updatedData.payment_expiry = expiryDateTime;
    const daysLeft = moment(updatedData.payment_expiry).diff(moment(), "days");

    let displayDays;
    if (daysLeft > 0) {
      displayDays = `in the next ${daysLeft} Days`;
    } else if (daysLeft === 0) {
      displayDays = "Today";
    } else {
      displayDays = ""; // or "Expired" if you want to show past due
    }
    // Set message for chat
    message = `<span>Hi ${
      userDetails[0].full_name
    },<br> PFA your payment link for <b>${programDetails[0].program_name} (${
      programsSessionDetails[0].program_duration
    })</b> program for Amount <b>Rs.${
      updatedData.suggested_amount
    }</b> <br> Click here: <a href="${payment_link.short_url}">${
      payment_link.short_url
    }</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
      updatedData.payment_expiry,
    ).format(
      "Do MMMM YYYY",
    )} which is ${displayDays} . Please ensure you use it before that. <br/>${
      updatedData?.free_hamper !== "No" && updatedData?.free_hamper
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br><br> P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
      updatedData.suggested_amount
    }">Click here</a></span>`;
  } else if (updatedData.payment_mode_id && updatedData.payment_mode_id === 3) {
    // Handle Bank Account Payment Mode
    message = `<span>PFA the Bank Account Details for the payment of ${
      updatedData.suggested_amount
    } for ${programDetails[0].program_name} (${
      programsSessionDetails[0].program_duration
    }) program.<br> ${paymentModeDetails[0].payment_mode_details} <br/>${
      updatedData?.free_hamper !== "No" && updatedData?.free_hamper
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
  } else if (updatedData.payment_mode_id && updatedData.payment_mode_id === 2) {
    console.log(userDetails, 2222);
    // Handle UPI Payment Mode
    message = `<span>Hi ${
      userDetails[0].full_name
    }, <br> PFA the UPI details for the Amount of ${
      updatedData.suggested_amount
    } for ${programDetails[0].program_name} (${
      programsSessionDetails[0].program_duration
    }) program. <br> ${paymentModeDetails[0].payment_mode_details} <br/>${
      updatedData?.free_hamper !== "No" && updatedData?.free_hamper
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br> P.S. Please let us know once the transfer is done and share a screenshot of the transaction details.</span>`;
  } else if (updatedData.payment_mode_id && updatedData.payment_mode_id === 4) {
    // Handle Cash Collection Payment Mode
    message = `<span>Hi ${
      userDetails[0].full_name
    },<br> Cash Collection for the amount of Rs. ${
      updatedData.suggested_amount
    } for ${programDetails[0].program_name} (${
      programsSessionDetails[0].program_duration
    }). <br> Date: ${moment(updatedData.payment_expiry).format(
      "Do MMMM YYYY",
    )} <br> Contact Person: Abdul Shaikh (919158267868) <br/>${
      updatedData?.free_hamper !== "No" && updatedData?.free_hamper
        ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
        : ""
    } <br> P.S. Please connect with us incase you have any query & type it in here.</span>`;
  }

  // Create the chat message if payment_mode_id exists
  if (updatedData.payment_mode_id) {
    const { results: userDetails } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.email_id",
        "ud.phone_number",
        "CONCAT(ud.first_name,' ',ud.last_name) as full_name",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
    });
    console.log(user_id, 2254);
    const chat = await clientEnquiry.create({
      user_id: user_id,
      name: userDetails[0].full_name || " ",
      query: message,
      mentor_id: updatedData.suggested_by,
      sender: "mentor",
      type: "reminder",
    });
    console.log(chat, 799);
  }

  try {
    const followUpData = {
      user_id: user_id,
      slot_id: updatedData.slot_id,
      type: updatedData.type,
      follow_up_date: updatedData.follow_up_date,
      added_by: updatedData.suggested_by,
      assigned_to: updatedData.suggested_by,
    };
    console.log(followUpData, 2335);
    delete updatedData.slot_id;
    delete updatedData.type;
    delete updatedData.follow_up_date;
    const isFollowUpRequired =
      followUpData.slot_id && followUpData.type && followUpData.follow_up_date;
    const updateResult = await updateRecord(
      tables.suggestedProgram,
      updatedData,
      { suggested_program_id: id },
    );
    if (isFollowUpRequired) {
      const followUpResult = addFollowUpUtil(followUpData);
      console.log(followUpResult, 2348);
      if (followUpResult) {
        console.log("Follow-up added successfully.");
      } else {
        console.log("Error adding follow-up.");
      }
    }
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler(
          `No suggested program found with the given id: ${id}`,
          400,
        ),
      );
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      return next(
        new ErrorHandler("No changes made for the suggested program", 400),
      );
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      await addSaleStatusLogNew({
        sales_status: updatedData.status,
        id: user_id,
      });
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Suggested program updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(
        new ErrorHandler("Error updating the suggested program", 404),
      );
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const markFollowUpDone = async (req, res, next) => {
  const { id: follow_up_id } = req.params;
  const { follow_up_note, type } = req.body;

  if (!follow_up_id) {
    return next(new ErrorHandler("Id is required for updating follow up", 400));
  }
  try {
    
    let updatedData = { follow_up_note, follow_up_status: 1 };
    const {results: followUpDetails} = await readRecord({
      table: tables.leadFollowUpLogs, 
      selectFields: ["follow_up_date", "user_id", 'slot_id'],
      conditions: [
        { field: 'follow_up_id', operator: '=', value:follow_up_id}
      ]
    })

    if (followUpDetails.length==0) {
      return next(new ErrorHandler("Invalid follow-up Id", 400));
    }

    const followUpObj = followUpDetails[0]; 
    await updateRecordAdvanced({
      table: tables.leadFollowUpLogs,
      updateData: updatedData,
      conditions: [
        { 
          field: 'follow_up_status', 
          operator: '=', 
          value: 0,
        },
        { 
          field: 'follow_up_date', 
          operator: '<=', 
          value: followUpObj.follow_up_date,
        },
        { 
          field: 'user_id', 
          operator: '=', 
          value: followUpObj.user_id,
        },
      ]
    }); 
 
    if (type == 0) {
        // If the follow-up type is 0, update the call details as well
        try {
          const callData = {
            call_insights: follow_up_note,
            call_status: 1,
          };

          const callUpdateResult = await updateRecord(
            tables.callUpdates,
            callData,
            { follow_up_id },
          );

          if (
            callUpdateResult.info.substring(0, 27) ==
            "Rows matched: 1  Changed: 1"
          ) {
            // Both follow-up and call updated successfully
            const apiResponse = new ApiResponse({
              statusCode: 200,
              message: "Follow-up and call updated successfully",
            });
            return res.status(200).json(apiResponse);
          } else {
            // Follow-up updated, but no changes made to the call
            const apiResponse = new ApiResponse({
              statusCode: 200,
              message: "Follow-up updated but call not updated",
            });
            return res.status(200).json(apiResponse);
          }
        } catch (callError) {
          // Error while updating the call
          console.log(callError);
          const apiResponse = new ApiResponse({
            statusCode: 200,
            message: "Follow-up updated but error while updating the call",
          });
          return res.status(200).json(apiResponse);
        }
    }

    // Only the follow-up was updated (no call update needed)
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Follow-up updated successfully",
    });
    return res.status(200).json(apiResponse);
   
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const markEngagementDone = async (req, res, next) => {
  const { id } = req.params;
  const { engagement_note, type } = req.body;

  if (!id) {
    return next(
      new ErrorHandler("Id is required for updating engagement", 400),
    );
  }
  try {
    let updatedData = { engagement_note, status: 1 };

    // Update the engagement record
    const updateResult = await updateRecord(
      tables.leadEngagementLogs,
      updatedData,
      { id },
    );

    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(
        new ErrorHandler(`No engagement found with the given id: ${id}`, 400),
      );
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      return next(new ErrorHandler("No changes made for the engagement", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      if (type == 0) {
        // If the engagement type is 0, update the call details as well
        try {
          const { results: engagementData } = await getRecord(
            tables.leadEngagementLogs,
            { id },
          );
          const callData = {
            call_insights: engagement_note,
            call_status: 1,
          };

          const callUpdateResult = await updateRecord(
            tables.callUpdates,
            callData,
            {
              schedule_date: engagementData[0].engagement_date,
              slot_id: engagementData[0].engagement_slot_id,
              user_id: engagementData[0].user_id,
              call_type: "45",
            },
          );

          if (
            callUpdateResult.info.substring(0, 27) ==
            "Rows matched: 1  Changed: 1"
          ) {
            // Both follow-up and call updated successfully
            const apiResponse = new ApiResponse({
              statusCode: 200,
              message: "Engagement and call updated successfully",
            });
            return res.status(200).json(apiResponse);
          } else {
            // Engagement updated, but no changes made to the call
            const apiResponse = new ApiResponse({
              statusCode: 200,
              message: "Engagement updated but call not updated",
            });
            return res.status(200).json(apiResponse);
          }
        } catch (callError) {
          // Error while updating the call
          console.log(callError);
          const apiResponse = new ApiResponse({
            statusCode: 200,
            message: "Engagement updated but error while updating the call",
          });
          return res.status(200).json(apiResponse);
        }
      }

      // Only the engagement was updated (no call update needed)
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Engagement updated successfully",
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler("Error updating the engagement", 404));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const updateLeadDetails = async (req, res, next) => {
  const { id: user_id } = req.params;
  if (!user_id) {
    return next(
      new ErrorHandler("user id is required for updating details", 400),
    );
  }
  const updatedData = req.body;
  console.log(updatedData, 1954);
  if (updatedData.name) {
    updatedData.first_name = updatedData.name.split(" ")[0];
    updatedData.last_name = updatedData.name.split(" ")[1];
    delete updatedData.name;
  }
  try {
    console.log(req.body);
    // return;
    const updateResult = await updateRecord(tables.userDetails, updatedData, {
      user_id,
    });
    if (updateResult.info.substring(0, 15) == "Rows matched: 0") {
      return next(new ErrorHandler("No user found with the given", 400));
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 0"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No changes made ",
      });
      return res.status(200).json(apiResponse);
    } else if (
      updateResult.info.substring(0, 27) == "Rows matched: 1  Changed: 1"
    ) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: `Lead ${user_id} updated successfully`,
      });
      return res.status(200).json(apiResponse);
    } else {
      return next(new ErrorHandler(`Error updating lead details `, 400));
    }
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadConsultationForm = async (req, res, next) => {
  try {
    const {
      user_id,
      admin_id,
      re_assign_to,
      lead_sub_status: sub_sales_status,
      source_id,
      lead_status,
      ethnicity,
      lifestyle,
      clinical_conditions,
      health_history,
      target_oriented,
      meal_management,
      frequency,
      consultation_note,
      suggested_program_id,
      suggested_program_session_id,
      suggested_amount,
      payment_expiry,
      payment_mode_id,
      communication,
      awareness_level,
      motivational_level,
      language,
      follow_up_type,
      special_note,
      follow_up_date,
      follow_up_note,
      slot_id,
      engagement_type,
      engagement_date,
      engagement_note,
      engagement_slot_id,
      city_id,
      state_id,
      country_id,
      payment_date,
      milestones,
      pitched_id,
    } = req.body;

    if (!user_id || !admin_id) {
      return next(new ErrorHandler("user_id or admin_id not provided", 400));
    }

    const updates = [];
    const messages = [];

    // Reassign lead
    if (re_assign_to) {
      const { success } = await reAssignLeadUtil({
        user_id,
        new_counsellor_id: re_assign_to,
        old_counsellor_id: admin_id,
        assigned_by: admin_id,
      });

      if (!success) {
        return next(new ErrorHandler("Error reassigning lead", 500));
      }

      messages.push("Lead Assigned Successfully");
    }

    if (sub_sales_status) {
      const updatedResult = await updateRecord(
        `${tables.userDetails}`,
        {
          sub_sales_status,
        },
        {
          user_id,
        },
      );
      if (updatedResult.affectedRows === 0) {
        throw new Error("No user found with the given ID");
      }
      messages.push("Sub Sales Status updated successfully");
    }

    if (payment_date) {
      const updatedResult = await updateRecord(
        `${tables.userDetails}`,
        {
          payment_date,
        },
        {
          user_id,
        },
      );
      if (updatedResult.affectedRows === 0) {
        throw new Error("No user found with the given ID");
      }
      messages.push("Payment date updated successfully");
    }

    if (city_id || state_id || country_id) {
      const updateLocationResult = await updateRecord(
        `${tables.userDetails}`,
        {
          ...(city_id && { city_id }),
          ...(state_id && { state_id }),
          ...(country_id && { country_id }),
        },
        {
          user_id,
        },
      );
      messages.push("Location updated successfully");
    }
    // Update Current primary source
    if (source_id) {
      updates.push(
        updatePrimarySourceUtil({
          user_id,
          current_primary_lead_source: source_id,
        }).then(({ success }) => {
          if (!success) throw new Error("Error updating primary source");
          messages.push("Primary source updated successfully");
        }),
      );
    }

    // Update sales status
    if (lead_status) {
      updates.push(
        updateSaleStatus({
          sale_status: lead_status,
          user_id,
        }).then(({ success }) => {
          if (!success) throw new Error("Error updating sales status");
          messages.push("Lead sales status updated successfully");
        }),
      );
    }

    // Update ethnicity
    if (ethnicity) {
      console.log(ethnicity, 2435);
      updates.push(
        updateRecord(tables.userDetails, { ethnicity }, { user_id }).then(
          (result) => {
            if (result.affectedRows === 0)
              throw new Error("No user found with the given ID");
            messages.push("Ethnicity updated successfully");
          },
        ),
      );
    }

    // Update clinical conditions
    if (clinical_conditions) {
      updates.push(
        updateClinicalConditions({
          user_id,
          health_conditions: clinical_conditions,
        }).then(({ success }) => {
          if (!success) throw new Error("Error updating clinical conditions");
          messages.push("Clinical conditions updated successfully");
        }),
      );
    }
    if (milestones) {
      await insertRecord(
        tables.userMilestones,
        ["user_id", "milestones", "added_by"],
        [user_id, JSON.stringify(milestones), "Counsellor"],
      ).then((result) => {
        if (result.affectedRows === 0) {
          throw new Error("Error inserting milestones");
        }
      });
    }
    // if (lifestyle) {
    //   updates.push(
    //     updateClinicalConditions({
    //       user_id,
    //       lifestyle: lifestyle,
    //     }).then(({ success }) => {
    //       if (!success) throw new Error("Error updating lifestyle conditions");
    //       messages.push("lifestyle updated successfully");
    //     })
    //   );
    // }

    // Update key insights
    if (
      lifestyle ||
      health_history ||
      target_oriented ||
      meal_management ||
      frequency ||
      consultation_note ||
      communication ||
      suggested_program_id ||
      suggested_program_session_id ||
      suggested_amount ||
      awareness_level ||
      motivational_level ||
      payment_mode_id ||
      language ||
      special_note ||
      payment_expiry
    ) {
      updates.push(
        updateKeyInsights({
          admin_id,
          awareness_level,
          communication,
          consultation_note,
          frequency,
          special_note,
          payment_mode_id,
          language,
          health_history,
          lifestyle,
          meal_management,
          motivational_level,
          payment_expiry,
          suggested_program_id,
          suggested_program_session_id,
          suggested_amount,
          target_oriented,
          user_id,
          pitched_id,
        }).then(({ success }) => {
          if (!success) throw new Error("Error updating key insights");
          messages.push("Key insights updated successfully");
        }),
      );
    }
    if (
      lifestyle &&
      awareness_level &&
      communication &&
      language &&
      motivational_level &&
      user_id
    ) {
      updates.push(
        updateUserPhaseUtil({
          user_id,
          lifestyle,
          awareness_level,
          communication,
          language,
          motivational_level,
        }).then(({ success }) => {
          if (!success) throw new Error("Error updating user phase");
          messages.push("User phase updated successfully");
        }),
      );
    }
    // Add follow-up
    if (follow_up_date) {
      updates.push(
        addFollowUpUtil({
          user_id,
          slot_id,
          type: follow_up_type,
          follow_up_date,
          follow_up_note,
          added_by: admin_id,
          assigned_to: admin_id,
        }).then((result) => {
          if (result.followUpAdded) {
            const message = result.callBooked
              ? "Follow-up added and call booked successfully"
              : "Follow-up added successfully";
            messages.push(message);
          } else {
            throw new Error("Error adding follow-up");
          }
        }),
      );
    }

    // Add engagement
    if (engagement_date) {
      updates.push(
        addEngageMentUtil({
          user_id,
          engagement_type,
          engagement_date,
          engagement_note,
          slot_id: engagement_slot_id,
          added_by: admin_id,
          assigned_to: admin_id,
        }).then((result) => {
          if (result.engagementAdded) {
            messages.push("Engagement added successfully");
          } else {
            throw new Error("Error adding engagement");
          }
        }),
      );
    }

    // Wait for all updates to complete
    await Promise.all(updates);

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: messages.join(". "),
      }),
    );
  } catch (error) {
    console.error(error);
    return next(
      new ErrorHandler(error.message || "Internal Server Error", 500),
    );
  }
};

const TIMESTAMP_FORMAT = "YYYY-MM-DD HH:mm:ss";
const TIMESTAMP_FORMAT1 = "DD-MM-YYYY";

const leadHistory = async (req, res, next) => {
  const { user_id } = req.params;
  const { is_completed } = req.query;

  try {
    await readPool.query("SET SESSION group_concat_max_len = 1000000");
    const [query] = await readPool.query(
      `WITH follow_up AS (
    SELECT cd.user_id, 
        CONCAT(
            '[', 
            GROUP_CONCAT(
                JSON_OBJECT(
                    'timestamp', fu.added_date, 
                    'follow_up_detail', 
                    CASE 
                        WHEN fu.follow_up_date > CURRENT_DATE THEN CONCAT('Next Follow Up:',' ',CONCAT(fu.follow_up_date, ' ', SUBSTRING((CASE WHEN fu.type IN (0, '0') THEN slot.appointment_slots
       WHEN fu.type IN (1, 2, '1', '2') THEN wap_slot.appointment_slots
     END), 1, 8)))
                        WHEN fu.follow_up_status = 0 THEN 'Follow-up Pending'
                        WHEN fu.follow_up_status = 1 THEN 'Follow-up Done'
                        ELSE 'Unknown'
                    END,
                    'follow_up_note', IF(fu.follow_up_note = '', 'N/A', fu.follow_up_note),
                    'source', IF(fu.source = '', 'N/A', fu.source),
                    'campaign', IF(fu.campaign = '', 'N/A', fu.campaign)
                ) SEPARATOR ',' 
            ),
            ']'
        ) AS follow_up_details
    FROM users_details cd
    LEFT JOIN lead_follow_up_logs fu ON cd.user_id = fu.user_id
    LEFT JOIN bn_book_appointment_slots_mentor slot ON fu.slot_id = slot.id and fu.type IN (0, '0')
    LEFT JOIN whatsapp_app_follow_up_slots wap_slot ON fu.slot_id = wap_slot.id and fu.type IN ('1', '2', 1,2)
    WHERE cd.user_id = ?
    GROUP BY cd.user_id
),

consultations AS (
    SELECT cd.user_id,
        CONCAT(
            '[', 
            GROUP_CONCAT(
                JSON_OBJECT(
                    'timestamp', cl.added_date,
                    'consultation_key_insights', cl.key_insights,
                    'consultation_status', 'Consultation'
                )
            ), 
            ']'
        ) AS consultations_details
    FROM users_details cd
    LEFT JOIN consultation_log cl ON cd.user_id = cl.user_id
    WHERE cd.user_id = ?
    GROUP BY cd.user_id
),

calls AS (
    SELECT cd.user_id,
        CONCAT(
            '[', 
            GROUP_CONCAT(
                JSON_OBJECT(
                    'timestamp', cl.added_date,
                    'consultation_call_note', cl.key_insight
                ) SEPARATOR ',' 
            ),
            ']'
        ) AS calls_details
    FROM users_details cd
    LEFT JOIN user_key_insight cl ON cd.user_id = cl.user_id
    WHERE cd.user_id = ?
    GROUP BY cd.user_id
),

-- ✅ New CTE for lead_engagement_logs
engagements AS (
    SELECT cd.user_id,
        CONCAT(
            '[', 
            GROUP_CONCAT(
                JSON_OBJECT(
                    'timestamp', el.added_date,
                    'engagement_detail', 
                    CASE 
                        WHEN el.engagement_date > CURRENT_DATE THEN CONCAT('Upcoming Engagement:',' ',CONCAT(el.engagement_date, ' ', SUBSTRING(slot.appointment_slots, 1, 8)))
                        WHEN el.status = 0 THEN  CONCAT('Engagement Pending:',' ',CONCAT(el.engagement_date, ' ', SUBSTRING(slot.appointment_slots, 1, 8)))
                        WHEN el.status = 1 THEN 'Engagement Done'
                        ELSE 'Unknown'
                    END,
                    'engagement_note', IF(el.engagement_note = '', 'N/A', el.engagement_note)
                ) SEPARATOR ','
            ),
            ']'
        ) AS engagement_details
    FROM users_details cd
    LEFT JOIN lead_engagement_logs el ON cd.user_id = el.user_id
    LEFT JOIN bn_book_appointment_slots_mentor slot ON el.slot_id = slot.id
    WHERE cd.user_id = ?
    GROUP BY cd.user_id
)

${
  is_completed
    ? `, suggested_programs AS (
    SELECT sp.user_id,
        CONCAT(
            '[',
            GROUP_CONCAT(
                JSON_OBJECT(
                    'timestamp', sp.added_date,
                    'suggested_program', pm.program_name,
                    'program_duration', ps.program_duration,
                    'suggested_amount', sp.suggested_amount,
                    'program_mrp',ps.mrp,
                    'payment_mode_id', pmm.payment_mode_name,
                    'mentor_note', IF(sp.mentor_note = '', 'N/A', sp.mentor_note)
                ) SEPARATOR ','
            ),
            ']'
        ) AS suggested_program_details
    FROM suggested_program sp
    LEFT JOIN programs_master pm ON sp.program_id = pm.program_id
    LEFT JOIN program_session ps ON sp.program_session_id = ps.program_session_id AND ps.program_id = sp.program_id
    LEFT JOIN payment_mode pmm ON sp.payment_mode_id = pmm.payment_mode_id
    GROUP BY sp.user_id
)`
    : ""
}

SELECT cd.user_id, 
       follow_up.follow_up_details, 
       consultations.consultations_details,
       calls.calls_details,
       engagements.engagement_details,
        ${is_completed ? "sp.suggested_program_details," : ""}
       lsl.source_log,
       odd.order_date
FROM users_details cd
LEFT JOIN follow_up ON cd.user_id = follow_up.user_id
LEFT JOIN consultations ON cd.user_id = consultations.user_id
LEFT JOIN calls ON cd.user_id = calls.user_id
LEFT JOIN engagements ON cd.user_id = engagements.user_id
LEFT JOIN lead_source_logs lsl ON cd.user_id = lsl.user_id
${
  is_completed
    ? "LEFT JOIN suggested_programs sp ON cd.user_id = sp.user_id"
    : ""
}
LEFT JOIN (
    SELECT od.user_id, od.order_id,
           CONCAT('[', JSON_OBJECT('timestamp', od.created_at, 'event', 'order_created'), ']') AS order_date
    FROM order_details od
    WHERE od.created_at = (
        SELECT MAX(od2.created_at)
        FROM order_details od2
        WHERE od2.user_id = od.user_id
    )
) AS odd ON cd.user_id = odd.user_id
WHERE cd.user_id = ?;
`,
      [
        user_id,
        user_id,
        user_id,
        user_id,
        user_id,
        ...(is_completed ? [user_id] : []),
      ],
    );

    if (!query || query.length === 0) {
      return res.status(404).json(
        new ApiResponse({
          statusCode: 404,
          message: "No lead history found for this user",
          data: [],
        }),
      );
    }

    const leadJourney = [];

    // Helper to safely parse timestamps
    const parseTimestamp = (ts) => {
      const parsed = moment(ts, [
        moment.ISO_8601,
        "YYYY-MM-DD HH:mm:ss",
        "YYYY/MM/DD HH:mm:ss",
        "YYYY-MM-DDTHH:mm:ssZ",
        "DD-MM-YYYY HH:mm:ss",
        "MM-DD-YYYY hh:mm A",
      ]);
      return parsed.isValid() ? parsed.toDate() : new Date(0);
    };

    const row = query[0];

    // --- FOLLOW UPS ---
    const followUpDetails = JSON.parse(row?.follow_up_details || "[]");
    followUpDetails.forEach((item) => {
      if (item.timestamp) {
        item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT);
        leadJourney.push(item);
      }
    });

    const consultationsDetails = JSON.parse(row?.consultations_details || "[]");
    consultationsDetails.forEach((item) => {
      if (item.timestamp) {
        item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT1);

        leadJourney.push(item);
      }
    });

    // --- CALLS ---
    console.log(row?.calls_details, "calls");
    const callsDetails = JSON.parse(row?.calls_details || "[]");
    callsDetails.forEach((item) => {
      if (item.consultation_call_note) {
        item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT);
        leadJourney.push(item);
      }
    });

    const engagementDetails = JSON.parse(row?.engagement_details || "[]");
    engagementDetails.forEach((item) => {
      if (item.timestamp) {
        item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT);
        leadJourney.push(item);
      }
    });

    const suggestedPrograms = JSON.parse(
      row?.suggested_program_details || "[]",
    );
    suggestedPrograms.forEach((item) => {
      if (item.timestamp) {
        item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT);
        leadJourney.push(item);
      }
    });

    // --- SOURCE LOGS ---
    const sourceLog = JSON.parse(row?.source_log || "[]");
    sourceLog.forEach((item) => {
      item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT);
      leadJourney.push(item);
    });

    // --- ORDER DATE ---
    const orderDate = JSON.parse(row?.order_date || "[]");
    orderDate.forEach((item) => {
      item.timestamp = moment(item.timestamp).format(TIMESTAMP_FORMAT);
      leadJourney.push(item);
    });

    // --- SORT by timestamp ---
    leadJourney.sort(
      (a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp),
    );

    return res.status(200).json([
      new ApiResponse({
        statusCode: 200,
        message: "Lead history fetched successfully",
        data: leadJourney,
      }),
    ]);
  } catch (error) {
    console.error("Lead History Error:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const updateleadDetailSpecify = async (req, res, next) => {
  try {
    const { user_id, element_name, element_value } = req.body;

    const updateData = async (
      table,
      fields,
      conditions,
      successMessage,
      errorMessage,
    ) => {
      const updatedRecord = await updateRecord(table, fields, conditions);
      if (updatedRecord.affectedRows === 0) {
        return next(new ErrorHandler(errorMessage, 400));
      }
      const apiresponse = new ApiResponse({
        statusCode: 200,
        message: successMessage,
      });
      return res.status(200).json(apiresponse);
    };

    return await updateData(
      `${tables.userDetails}`,
      { [element_name]: element_value },
      { user_id },
      "Lead Details updated successfully",
      "Failed to update lead Data",
    );
  } catch (error) {
    console.error("Error updating client weight:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const userGoals = async (req, res, next) => {
  const { user_id } = req.params;
  const { user_type } = req.body;
  if (!user_id) {
    return next(new ErrorHandler("user_id is required", 400));
  }
  try {
    if (user_type === "Lead") {
      const { results: hsData } = await readRecord({
        selectFields: ["*"],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hs1`,
            on: "cd.user_id = hs1.user_id",
          },
          {
            type: "LEFT",
            table: `${tables.healthScoreClient} hs2`,
            on: "hs1.user_id = hs2.user_id AND hs1.id < hs2.id",
          },
        ],
        conditions: [
          { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
          { field: "hs2.id", operator: "IS", value: "NULL", raw: true },
        ],
      });
      const { results: cslData } = await readRecord({
        selectFields: ["*"],
        table: `${tables.userDetails} cd`,
        joins: [
          {
            type: "LEFT",
            table: `${tables.consultationLogs} csl`,
            on: "cd.user_id = csl.user_id",
          },
        ],
        conditions: [
          { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
        ],
      });
      const data = {
        health_score_goal: hsData[0].goal_weight || null,
        target_oriented:
          JSON.parse(cslData[0].key_insights || "[]")?.target_oriented || null,
      };
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "Goals fetched successfully",
        data,
      });
      return res.status(200).json(apiResponse);
    }
    const { results: goals } = await readRecord({
      selectFields: ["mg.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.bnMyGoalsNew} mg`,
          on: "cd.active_order_id = mg.sub_order_id",
        },
      ],
      conditions: [
        { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    const { results: assessmentGoals } = await readRecord({
      table: `${tables.userDetails} cd`,
      selectFields: ["*"],
      joins: [
        {
          type: "LEFT",
          table: `${tables.assessment} asm`,
          on: "cd.user_id = asm.user_id AND cd.active_order_id = asm.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} asp`,
          on: "asm.assessment_id = asp.assessment_id",
        },
      ],
      conditions: [
        { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    console.log(goals, 2847);
    const goalsData = safeJSONParse(goals[0]?.comment, {});
    const data = {
      new_goals: goalsData?.new_goals || [],
      goals_achieved: goalsData?.goals_achieved || [],
      milestone_achieved: goalsData?.milestone_achieved || [],
      assessment_goals: {
        goal_weight: assessmentGoals[0]?.goal_weight || null,
        other_goals: JSON.parse(assessmentGoals[0]?.other_goals) || null,
      },
    };
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Goals fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};
const getUserHealthScore = async (req, res, next) => {
  const { user_id } = req.params;
  try {
    const { results: healthScore } = await readRecord({
      selectFields: ["hs.*", "cd.*"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs`,
          on: `cd.user_id = hs.user_id`,
        },
        {
          type: "LEFT",
          table: `${tables.healthScoreClient} hs2`,
          on: `hs.user_id = hs2.user_id AND hs.id < hs2.id`,
        },
      ],
      conditions: [
        { field: `hs2.id`, operator: `IS`, value: `NULL`, raw: true },
        { field: `cd.user_id`, operator: `=`, value: parseInt(user_id) },
      ],
    });
    if (healthScore.length === 0) {
      return next(new ErrorHandler("No health score found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Health score fetched successfully",
      data: {
        latest_weight: healthScore[0].latest_weight,
        height: healthScore[0].height,
        inch: healthScore[0].inch,
        body_shape: healthScore[0].body_shape,
        health_issues: healthScore[0].health_issue,
        sleep_duration: healthScore[0].sleep_duration,
        activity_level: healthScore[0].activity_level,
        stress_level: healthScore[0].stress_level,
        smoke_frequency: healthScore[0].smoke_frequency,
        water_frequency: healthScore[0].water_frequency,
        alcohol_frequency: healthScore[0].alcohol_frequency,
        veg_fruits_frequency: healthScore[0].veg_fruits_frequency,
        bmi: healthScore[0].body_mass_index,
        ideal_weight: healthScore[0].ideal_weight,
        ideal_bmi: healthScore[0].ideal_bmi,
        health_score: healthScore[0].overall_health_score,
        health_category: healthScore[0].health_category,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};
const getUserMedicalReports = async (req, res, next) => {
  const { user_id } = req.params;
  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }
  try {
    const { results: medicalReports } = await readRecord({
      selectFields: ["asmh.report_attachment_details"],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.assessment} asm`,
          on: "cd.user_id = asm.user_id ",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_medical_history} asmh`,
          on: "asm.assessment_id = asmh.assessment_id",
        },
      ],
      conditions: [
        { field: "cd.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    console.log(medicalReports, 2711);
    if (medicalReports.length === 0) {
      return next(new ErrorHandler("No medical reports found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Medical reports fetched successfully",
      data: JSON.parse(medicalReports[0].report_attachment_details || "[]"),
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getSingleLeadDataById = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_id",
        "CONCAT(COALESCE(ud.first_name, ''), ' ', COALESCE(ud.last_name, '')) as full_name",
        "ud.first_name",
        "ud.last_name",
        "ud.plain_password",
        "ud.phone",
        "ud.phone_number",
        "ud.phone_code",
        "ud.email_id",
        "ud.birth_date",
        "ud.my_wallet",
        "ud.old_wallet",
        "ud.ethnicity",
        "ud.app_version",
        "ud.device",
        "ud.os",
        "ud.model",
        "ud.gender",
        "ud.wati",
        "ud.start_weight",
        "ud.latest_weight",
        "ud.height",
        "CONCAT(DATE_FORMAT(fl.follow_up_date, '%d-%m-%Y'), ' ', SUBSTRING(CASE WHEN fl.type IN (0,'0') THEN slot.appointment_slots WHEN fl.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END, 1, 8)) as follow_up_date",
        "ud.counsellor_assigned as counsellor_assigned_id",
        "CONCAT(ad.first_name,' ',ad.last_name) as counsellor_assigned_name",
        "ud.health_conditions ",
        "ud.current_lead_source",
        "ud.sales_status",
        "ud.added_date",
        "country.country_name",
        "ad.crm_user",
        "ad.call_link",
        "ad.designation",
        "ad.official_phone",
        "state.state_name",
        "city.city_name",
        "sp.suggested_program_id as pitched_id",
        "spm.program_name AS suggested_program_name",
        "sp.program_id",
        "sp.payment_mode_id",
        "sp.program_session_id",
        "sp.suggested_amount",
        "sps.mrp as suggested_program_mrp",
        "sps.program_duration as suggested_program_days",
        "sp.added_date AS suggested_at",
        "sp_paym.payment_mode_name as suggested_payment_mode_name",
        "sp_paym.payment_mode_details as suggested_payment_mode_details",
        "sp.payment_expiry as suggested_payment_expiry",
        "DATEDIFF(sp.payment_expiry, NOW()) as suggested_payment_expiry_days",
        "sp.status as suggested_status",
        "sp.motivation_level as suggested_motivation_level",
        "sp_pl.payment_link as suggested_payment_link",
        "sp.mentor_note as suggested_mentor_note",
        "sp.free_hamper as free_hamper",
        "CONCAT(sad.first_name,' ',sad.last_name) as suggested_by_name",
        "cl.key_insights",
        "ls.source_name",
        "ud.stage",
        "ud.current_phase",
        "ud.sub_sales_status as lead_sub_status",
        "ud.city_id",
        "ud.state_id",
        "ud.country_id",
        `(SELECT CONCAT( DATE_FORMAT(lel.engagement_date, '%d-%m-%Y '), " (", (SELECT appointment_slots FROM bn_book_appointment_slots_mentor WHERE id = lel.slot_id), ")" ) AS engagement_date FROM lead_engagement_logs lel WHERE lel.user_id = ud.user_id ORDER BY id DESC LIMIT 1) as engagement_date`,
        `(SELECT age FROM bn_client_hs WHERE user_id = ud.user_id ORDER BY id DESC LIMIT 1) as age`,
        "(SELECT (weight_difference*-1) FROM `bn_client_hs` WHERE `user_id` = ud.user_id ORDER BY id DESC LIMIT 1) as lead_latest_weight_difference",
        "(SELECT health_category FROM `bn_client_hs` WHERE `user_id` = ud.user_id ORDER BY id DESC LIMIT 1) as lead_latest_health_category",
        "(SELECT overall_health_score FROM `bn_client_hs` WHERE `user_id` = ud.user_id ORDER BY id DESC LIMIT 1) as lead_overall_health_score",
        "um.milestone_id",
        "ud.bmi",
        "ud.ideal_weight",
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
          table: `${tables.suggestedProgram} sp`,
          on: "ud.suggested_program_id = sp.suggested_program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programsMaster} spm`,
          on: "spm.program_id  = sp.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} sps`,
          on: "sps.program_session_id  = sp.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} sp_paym`,
          on: "sp.payment_mode_id  = sp_paym.payment_mode_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} sp_pl`,
          on: "sp.payment_link_id= sp_pl.id",
        },
        {
          type: "LEFT",
          table: `${tables.consultationLogs} cl`,
          on: "cl.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.leadFollowUpLogs} fl`,
          on: "fl.user_id = ud.user_id and date(fl.follow_up_date) >= date(now()) and fl.follow_up_status='0'",
        },
        {
          type: "LEFT",
          table: `${tables.leadSource} ls`,
          on: "ud.current_lead_source = ls.source_id ",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} sad`,
          on: "sp.suggested_by =sad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "ad.admin_user_id = ud.counsellor_assigned",
        },
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "fl.slot_id = slot.id and fl.type IN ('0', 0)",
        },
        {
          type: "LEFT",
          table: `${tables.whatsappAppSlots} wap_slot`,
          on: "fl.slot_id = wap_slot.id and fl.type IN (1,2,'1','2')",
        },
        {
          type: "LEFT",
          table: `${tables.userMilestones} um`,
          on: "um.user_id = ud.user_id",
        },
      ],
      conditions: [
        { field: "ud.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    if (results.length === 0) {
      return next(new ErrorHandler("No lead found", 404));
    }
    const leadData = results[0];
    console.log(leadData, 2887);
    const gender = parseInt(leadData.gender);
    const sales_status = parseInt(leadData.sales_status);
    let message = "";
    const daysLeft = moment(leadData.suggested_payment_expiry).diff(
      moment(),
      "days",
    );

    let displayDays;
    if (daysLeft > 0) {
      displayDays = `in the next ${daysLeft} Days`;
    } else if (daysLeft === 0) {
      displayDays = "Today";
    } else {
      displayDays = ""; // or "Expired" if you want to show past due
    }
    if (Number(leadData.payment_mode_id) === 1) {
      message = `<span>Hi ${
        leadData.full_name
      },<br> PFA your payment link for <b>${leadData.suggested_program_name} (${
        leadData.suggested_program_days
      }) program</b> for Amount <b>Rs.${
        leadData.suggested_amount
      }</b> <br> Click here: <a href="${leadData.suggested_payment_link}">${
        leadData.suggested_payment_link
      }</a> <br> Once you make the payment, do send me a screenshot & I shall get the program registered. The link expires on ${moment(
        leadData.suggested_payment_expiry,
      ).format(
        "Do MMMM YYYY",
      )} which is ${displayDays}. Please ensure you use it before that. ${
        leadData?.free_hamper !== "No" && leadData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br><br> P.S. You can also use UPI: <a href="upi://pay?pa=vishalrupani-hotmail.com@okicici&pn=Vishal%20Rupani&cu=INR&am=${
        leadData.suggested_amount
      }">Click here</a></span>`;
    } else if (Number(leadData.payment_mode_id) === 3) {
      // Handle Bank Account Payment Mode
      message = `<span>PFA the Bank Account Details for the payment of ${
        leadData.suggested_amount
      } for ${leadData.suggested_program_name} (${
        leadData.suggested_program_days
      }) program.<br> ${leadData.suggested_payment_mode_details} ${
        leadData?.free_hamper !== "No" && leadData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
    } else if (Number(leadData.payment_mode_id) === 2) {
      // Handle UPI Payment ModeleadData.suggested_program_name
      message = `<span>Hi ${
        leadData.lead_name
      }, <br> PFA the UPI details for the Amount of ${
        leadData.suggested_amount
      } for ${leadData.suggested_program_name} (${
        leadData.suggested_program_days
      }) program. <br> ${leadData.suggested_payment_mode_details} ${
        leadData?.free_hamper !== "No" && leadData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br> P.S. Please let us know once you are done with the transfer & attach a screenshot of the transaction details.</span>`;
    } else if (Number(leadData.payment_mode_id) === 4) {
      // Handle Cash Collection Payment Mode
      message = `<span>Hi ${
        leadData.full_name
      },<br> Cash Collection for the amount of Rs. ${
        leadData.suggested_amount
      } for ${leadData.suggested_program_name} (${
        leadData.suggested_program_days
      }) program. <br> Date: ${moment(leadData.suggested_payment_expiry).format(
        "Do MMMM YYYY",
      )} <br> Contact Person: Abdul Shaikh (919158267868) ${
        leadData?.free_hamper !== "No" && leadData?.free_hamper
          ? `<br/>Along with your program, you’ll also receive a hamper of <b>BN-approved healthy snacks</b> — a little treat to make your journey healthier and happier!`
          : ""
      } <br>  P.S. Please connect with us incase you have any query & type it in here.</span>`;
    }
        let whatsapp_text = `Hii ${leadData.full_name},
    This is ${leadData.crm_user}, ${leadData.designation} at Balance Nutrition.

    To help you solve your health concerns and reach your health goals, I recommend booking a free consultation call with us.

    What time would you be available today?

    Alternatively, you can book a call from here too: ${leadData.call_link}

    Waiting to hear from you :)

    Draft 2 :
    Hi ${leadData.full_name},
    This is ${leadData.crm_user}, ${leadData.designation} at Balance Nutrition.

    I'm sending you a Health Score Test which will help me understand your health parameters like your body type, BMI, ideal body weight, etc. It should take hardly 60 seconds to complete.

    You will also receive a copy via email. Please let me know once you have taken the test.

    http://balancenutrition.in/health-score
    `;

    // let whatsapp_text = `Hi ${leadData.full_name || "User"},

    // Your BN Wallet balance of Rs.${leadData.old_wallet} just expired. You just missed out on a very good offer :(

    // As per your health score, you are ${leadData.lead_latest_weight_difference} kg overweight.

    // I can request the management to re credit your money just for today & we can register for the ${leadData.suggested_program_days || "60 days"} ${leadData.suggested_program_name} program at very good rates!

    // Just ping me and I'll help you out.`

//     let whatsapp_text =`Hi ${leadData.full_name || "User"},
    
// 7-Day Free Gut-Reset Challenge!
// The Challenge has started, Register ASAP.

// All the tips will be shared on our BN App. 
// Download now: http://www.balancenutrition.in/download-bn-app

// Let me know if you need any help :)
//     `;

    if(leadData.my_wallet >= 3000){
       if(leadData.suggested_program_name){
        whatsapp_text = `Hi ${leadData.full_name || "User"},

We heard you. After 500+ requests, your expired wallet balance has been restored :)

We've re-credited *₹${leadData?.my_wallet}*  in your wallet again. 

This is our Women's Day gift for you.

*Important: Your wallet balance is valid only till 7th March.*

Check the final price of the ${leadData.suggested_program_days || "60 days"} ${leadData.suggested_program_name} Program that I had recommended to you. 

Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${leadData?.program_id}

Feel free to reach out to me on
WhatsApp: ${leadData?.official_phone}
Call: ${leadData?.call_link}`;

      }else{
        whatsapp_text = `Hi ${leadData.full_name || "User"},

We heard you. After 500+ requests, your expired wallet balance has been restored :)

We've re-credited *₹${leadData?.my_wallet}*  in your wallet again. 

This is our Women's Day gift for you.

*Important: Your wallet balance is valid only till 7th March.*

Not sure which program is right for you? Let's get on a quick call, and I'll personally recommend the best one based on your goals. Please feel free to 
WhatsApp me: ${leadData?.official_phone}
Book a Call: ${leadData?.call_link}`;
      }

    }


//      if(leadData.old_wallet > 999){

// whatsapp_text=`Hi ${leadData.full_name || "User"},

// Sadly, last night your BN wallet balance of Rs.${leadData.old_wallet} expired leaving Rs.00 as your current balance.

// We had a great chance to save up to Rs.18000 on your next program purchase with discount offers that come rarely. 

// Let me know if I should talk to the management & see if we can avail this offer until tonight.`;
//     }

//     let whatsapp_text = `Hi ${leadData.full_name || "User"}, 

// Good News!

// Since many of you were not able to use the wallet balance, Rs.${leadData.my_wallet} is back in your account!

// Use this to get your online diet program at the lowest rates! Becomes Rs.0 Tonight.

// I also wanted to have a call with you regarding your health score. It is ${leadData?.lead_overall_health_score}, which means ${leadData?.lead_latest_health_category}.

// `;
//     if (leadData.suggested_program_days) {
//       whatsapp_text += `Click here https://www.balancenutrition.in/app_link/screen_id=33/redirect_id=${leadData.program_id} to check the total discount on the ${leadData.suggested_program_days || "60 days"} ${leadData.suggested_program_name} program that I recommended to you :)`;
//     } else {
//       whatsapp_text += `Ping me asap :)`;
//     }

    const data = {
      lead_details: {
        user_id: leadData.user_id,
        lead_name: leadData.full_name,
        first_name: leadData.first_name,
        last_name: leadData.last_name,
        phone: leadData.phone
          ? leadData.phone
          : `${leadData.phone_code}-${leadData.phone_number}`,
        phone_code: leadData.phone_code,
        phone_number: leadData.phone_number,
        email: leadData.email_id,
        age: calculateAge(leadData.birth_date) || leadData.age,
        my_wallet: leadData.my_wallet,
        ethnicity: leadData.ethnicity,
        gender: gender === 1 ? "Male" : gender === 2 ? "Female" : "Other",
        recorded_at: leadData.added_date,
        weight: leadData.latest_weight,
        height: leadData.height,
        stage: leadData.stage,
        wati: leadData.wati,
        os: leadData.os,
        model: leadData.model,
        app_version: leadData.app_version,
        device: leadData.device,
        ask_update: ![app_versions.android, app_versions.ios].includes(
          leadData.app_version,
        ),
        phase: leadData.current_phase,
        follow_up_date: leadData.follow_up_date,
        engagement_date: leadData.engagement_date,
        sales_status:
          sales_status === 0
            ? "To Engage"
            : sales_status === 1
              ? "1st pitch"
              : sales_status === 2
                ? "HOT"
                : sales_status === 3
                  ? "WARM"
                  : sales_status === 4
                    ? "COLD"
                    : sales_status === 6
                      ? "Connected"
                      : sales_status === 7
                        ? "Consultation Booked"
                        : null,
        lead_sub_status: leadData.lead_sub_status,
        country: leadData.country_name,
        state: leadData.state_name,
        city: leadData.city_name,
        current_primary_source: {
          source_name: leadData.source_name,
          source_id: leadData.current_lead_source,
        },
        counsellor_assigned: {
          counsellor_id: leadData.counsellor_assigned_id,
          counsellor_name: leadData.counsellor_assigned_name,
        },
        city_id: leadData.city_id,
        state_id: leadData.state_id,
        country_id: leadData.country_id,
        bmi: leadData.bmi,
        away_ibw: Math.abs(
          Number(leadData.latest_weight) - Number(leadData.ideal_weight),
        ),
      },
      pitched_program: {
        pitched_id: leadData.pitched_id,
        program_id: leadData.program_id,
        program_session_id: leadData.program_session_id,
        program_name: `${leadData.suggested_program_name} (${leadData.suggested_program_days})`,
        suggested_mrp: leadData.suggested_program_mrp,
        suggested_amount: leadData.suggested_amount,
        suggested_payment_mode: leadData.suggested_payment_mode_name,
        suggested_payment_mode_details: leadData.suggested_payment_mode_details,
        suggested_payment_link: leadData.suggested_payment_link,
        suggested_mentor_note: leadData.suggested_mentor_note,
        suggested_payment_expiry: leadData.suggested_payment_expiry,
        suggested_sale_status: leadData.suggested_status,
        suggested_motivation_level:
          Number(leadData.suggested_motivation_level) === 0
            ? "low"
            : Number(leadData.suggested_motivation_level) === 1
              ? "medium"
              : "high",
        suggested_by: leadData.suggested_by_name,
        pitched_at: leadData.suggested_at
          ? moment(leadData.suggested_at).fromNow()
          : null,
        message,
        free_hamper: leadData.free_hamper,
      },
      whatsapp_text: whatsapp_text,
      key_insights: leadData.key_insights
        ? JSON.parse(leadData.key_insights)
        : null,
      health_conditions: leadData.health_conditions
        ? JSON.parse(leadData.health_conditions)
        : [],
      milestone_filled: leadData.milestone_id ? true : false,
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Lead fetched successfully",
      data: data,
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};
const getLeadInsightsByLeadId = async (req, res, next) => {
  try {
    const { user_id } = await req.query;
    const { results: leadInsights } = await readRecord({
      table: `${tables.userKeyInsight} cl`,
      selectFields: [
        "cl.key_insight",
        "cl.source",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = cl.added_by) as mentor_name`,
        "cl.added_date",
      ],
      conditions: [{ field: "cl.user_id", operator: "=", value: user_id }],
      orderBy: ["cl.id desc"],
    });
    if (leadInsights.length === 0) {
      return next(new ErrorHandler("No lead insights found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead insights fetched successfully",
      data: leadInsights,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const addSocialMediaLeads = async (req, res, next) => {
  const { name, source, phone_code, phone_number, assigned_to, assigned_by } =
    req.body;
  try {
    const columns = [
      "primary_lead_source",
      "current_lead_source",
      "phone_code",
      "phone_number",
      "counsellor_assigned",
      "email_id",
    ];
    const values = [
      source,
      source,
      phone_code,
      phone_number,
      assigned_to,
      `${phone_number}@bn.com`,
    ];
    const names = name.split(" ");
    const first_name = names[0];
    columns.push("first_name");
    values.push(first_name);
    if (names.length > 1) {
      const last_name = names.slice(1).join(" ");
      columns.push("last_name");
      values.push(last_name);
    }
    const insertResult = await insertRecord(
      tables.userDetails,
      columns,
      values,
    );
    if (insertResult.affectedRows === 0) {
      return next(new ErrorHandler("Error adding lead", 500));
    }
    if (insertResult.affectedRows > 0) {
      const addSourceLog = await addSourceLogNew({
        source: sources[source],
        id: insertResult.insertId,
      });
      const addStatusLog = await addStatusLogNew({
        status: "Lead",
        sub_status: "Inactive",
        id: insertResult.insertId,
      });
      const addSaleStatusLog = await addSaleStatusLogNew({
        sales_status: 0,
        id: insertResult.insertId,
      });
      const addAssignLog = await addLeadAssignLog({
        user_id: insertResult.insertId,
        assigned_by: assigned_by,
        counsellor_id: assigned_to,
      });
    }

    const apiResponse = new ApiResponse({
      statusCode: 201,
      message: "Lead added successfully",
    });
    return res.status(201).json(apiResponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const getLeadCalls = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "cu.call_id",
        "cu.comment",
        "cu.call_insights",
        "cu.call_status",
        `(SELECT ad.crm_user FROM ${tables.adminUsers} ad WHERE cu.added_by = ad.admin_user_id) as admin_name`,
        "cu.schedule_date",
        `(SELECT slot.appointment_slots FROM ${tables.slots} slot WHERE slot.id = cu.slot_id) as slot`,
      ],
      conditions: [{ field: "cu.user_id", operator: "=", value: user_id }],
    });
    return res.status(200).json(
      new ApiResponse({
        message: "Lead Calls Fetched Successfully",
        data: results.map((i) => {
          return {
            ...i,
            schedule_date: moment(i.schedule_date).format("DD-MM-YYYY"),
          };
        }),
      }),
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadPopupNotifications = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return next(new ErrorHandler("Missing user_id", 400));
    }

    // Step 1: Fetch user details
    const { results: users = [] } = await readRecord({
      table: "users_details ud",
      selectFields: [
        "ud.user_id",
        "CONCAT(ud.first_name, ' ', ud.last_name) AS name",
        "ud.added_date",
        "ud.sales_status",
        "ud.sub_sales_status",
        "ud.payment_date",
      ],
      conditions: [{ field: "ud.user_id", operator: "=", value: user_id }],
    });

    if (!users.length) {
      return next(new ErrorHandler("User not found", 404));
    }

    const user = users[0];
    const now = new Date();
    const addedDate = new Date(user.added_date);
    const paymentDate = user.payment_date ? new Date(user.payment_date) : null;

    // Step 2: Fetch engagement count and latest engagement timestamp
    const { results: engagementLogs = [] } = await readRecord({
      table: "lead_engagement_logs",
      selectFields: [
        "user_id",
        "COUNT(*) as count",
        "MAX(added_date) as last_engagement_at",
      ],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
      groupBy: ["user_id"],
    });

    const engagementCount = engagementLogs[0]?.count || 0;
    const lastEngagementAt = engagementLogs[0]?.last_engagement_at
      ? new Date(engagementLogs[0].last_engagement_at)
      : null;

    // Step 3: Fetch latest sales status log
    const { results: salesLogs = [] } = await readRecord({
      table: "lead_sale_status_log",
      selectFields: ["user_id", "sales_status_log"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    let latestStatus;
    let statusChangeDate;

    if (salesLogs.length) {
      try {
        const parsed = JSON.parse(salesLogs[0].sales_status_log);
        const latestEntry = parsed[parsed.length - 1];
        if (latestEntry) {
          latestStatus = latestEntry.sales_status;
        }
        const relevantEntry = parsed
          .slice()
          .reverse()
          .find(
            (e) => parseInt(e.sales_status) === parseInt(user.sales_status),
          );
        if (relevantEntry?.timestamp || relevantEntry?.created_at) {
          statusChangeDate = new Date(
            relevantEntry.timestamp || relevantEntry.created_at,
          );
        }
      } catch (e) {
        console.warn("Invalid JSON in sales_status_log for user_id:", user_id);
      }
    }

    // Step 4: Check if app downloaded
    const { results: fcmTokens = [] } = await readRecord({
      table: "bn_user_fcm_token",
      selectFields: ["DISTINCT user_id"],
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });

    const hasDownloadedApp = fcmTokens.length > 0;

    // Step 5: Compile popup messages
    const messages = [];

    // ✅ Connected + 5 engagement notes
    if (parseInt(user.sales_status) === 6 && engagementCount >= 5) {
      messages.push(
        "5 Engagements Done for the lead, no response. Change status of lead to COLD or engage again.",
      );
    }

    // ✅ Connected + 0 engagements + 2 days since status change
    if (
      parseInt(user.sales_status) === 6 &&
      engagementCount === 0 &&
      statusChangeDate
    ) {
      const diffDays = (now - statusChangeDate) / (1000 * 60 * 60 * 24);
      if (diffDays >= 2) {
        messages.push(
          "Connected Lead but No Engagement since 2 days\n(Engage Now)",
        );
      }
    }

    // ✅ To Engage + 1 hour since lead added
    if (parseInt(user.sales_status) === 0) {
      const diffHours = (now - addedDate) / (1000 * 60 * 60);
      if (diffHours >= 1) {
        messages.push(`Engagement pending for lead ${user.name} since 1 hour.`);
      }
    }

    // ✅ HOT + Pay Later logic
    if (
      parseInt(user.sales_status) === 2 &&
      user.sub_sales_status?.toLowerCase().includes("pay later") &&
      paymentDate
    ) {
      const diffDays = Math.floor((paymentDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays === 2) {
        messages.push("Payment Due for this lead in 2 days.");
      } else if (diffDays === 1) {
        messages.push("Payment due for this lead tomorrow");
      } else if (diffDays === 0) {
        messages.push("Payment due for this lead today");
      }

      if (
        statusChangeDate &&
        (now - statusChangeDate) / (1000 * 60 * 60 * 24) >= 15
      ) {
        messages.push(
          "Payment overdue for this Pay Later Lead. Shift to Warm (Rate Shared) or Follow up.",
        );
      }
    }

    // ✅ HOT + To Pay + 4+ days
    if (
      parseInt(user.sales_status) === 2 &&
      user.sub_sales_status?.toLowerCase() === "to pay" &&
      statusChangeDate
    ) {
      const diffDays = (now - statusChangeDate) / (1000 * 60 * 60 * 24);
      if (diffDays >= 4) {
        messages.push(
          "Payment Overdue for this lead. Shift the lead to Pay Later or follow up.\nOkay",
        );
      }
    }

    // ✅ HOT + Negotiating Price + 4+ days
    if (
      parseInt(user.sales_status) === 2 &&
      user.sub_sales_status?.toLowerCase() === "negotiating price" &&
      statusChangeDate
    ) {
      const diffDays = (now - statusChangeDate) / (1000 * 60 * 60 * 24);
      if (diffDays >= 4) {
        messages.push(
          "Lead is Negotiating on price since 4 days. Shift lead to Warm (Build Faith)\n(Okay)",
        );
      }
    }

    // ✅ WARM + For Basic Stack + 5+ days
    if (
      parseInt(user.sales_status) === 3 &&
      user.sub_sales_status?.toLowerCase().includes("for basic stack") &&
      statusChangeDate
    ) {
      const diffDays = (now - statusChangeDate) / (1000 * 60 * 60 * 24);
      if (diffDays >= 5) {
        messages.push(
          "Lead has not yet purchased a basic stack. Shift lead to COLD (Just for Knowledge/Gone Silent)\n(Okay)",
        );
      }
    }

    // ✅ Sales status mismatch with log
    if (
      latestStatus !== undefined &&
      Number(latestStatus) !== Number(user.sales_status)
    ) {
      messages.push(
        `${user.name}'s latest sales status in the log is different from the current one. Please update if needed.`,
      );
    }

    // ✅ App not downloaded
    // if (!hasDownloadedApp) {
    //   messages.push(
    //     `${user.name} has not downloaded the app yet. 📲 Please prompt them to install.`
    //   );
    // }

    // ✅ New: No recent engagement (only for Connected leads)
    if (parseInt(user.sales_status) === 6 && lastEngagementAt) {
      const diffDays = Math.floor(
        (now - lastEngagementAt) / (1000 * 60 * 60 * 24),
      );
      if (diffDays >= 3) {
        messages.push(
          `No engagement with ${user.name} in the last ${diffDays} days. Consider following up.`,
        );
      }
    }

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Lead popup fetched successfully",
        data: {
          user_id: user.user_id,
          name: user.name,
          popups: messages,
        },
      }),
    );
  } catch (error) {
    console.error("Error fetching lead popup:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getPopupLeadsByStatus = async (req, res, next) => {
  console.log("Yesss");
};

const leadConcernAndGoals = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }
    const { results: hsData } = await readRecord({
      selectFields: ["*"],
      table: `${tables.healthScoreClient} hs`,
      conditions: [
        { field: "hs.user_id", operator: "=", value: parseInt(user_id) },
      ],
      orderBy: ["hs.created DESC"],
      pagination: {
        page: 1,
        limit: 1,
      },
    });
    if (hsData.length === 0) {
      return next(new ErrorHandler("No health score found", 404));
    }
    const data = {
      goals: safeJSONParse(hsData[0].goals, []),
      medical_history: safeJSONParse(hsData[0].health_issue, []),
    };
    const { results: aqData } = await readRecord({
      selectFields: ["*"],
      table: `${tables.additionalQuestions} aq`,
      conditions: [
        { field: "aq.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    aqData.map((item) => {
      const question = safeJSONParse(item.result, []);
      question.map((q) => {
        data[`${q.question}`] = [
          ...safeJSONParse(q.answer)?.values,
          ...safeJSONParse(q.answer)?.anyOtherValue,
        ];
      });
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead concerns and goals fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadConcernAndGoals:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const trackerAndMarker = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }
    const { results: keyInsights } = await readRecord({
      selectFields: ["*"],
      table: `${tables.consultationLogs} cl`,
      conditions: [
        { field: "cl.user_id", operator: "=", value: parseInt(user_id) },
      ],
      orderBy: ["cl.id DESC"],
    });
    const { results: userDetails } = await readRecord({
      selectFields: ["*"],
      table: `${tables.userDetails} ud`,
      conditions: [
        { field: "ud.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    const data = {};

    console.log(keyInsights, 12121212);

    if (keyInsights && keyInsights.length > 0) {
      // Sentiment tracker → always from latest entry (DESC order, index 0)
      const latestInsightData = safeJSONParse(keyInsights[0].key_insights, {});
      data["sentiment_tracker"] = {
        motivational_level: latestInsightData?.motivational_level || null,
        awareness_level: latestInsightData?.awareness_level || null,
        communication: latestInsightData?.communication || null,
        language: latestInsightData?.language || null,
      };

      data["key_insight"] = keyInsights[0];

      // Oldest first for consultation timeline
      const orderedInsights = [...keyInsights].reverse();

      data["key_insights_new"] = orderedInsights
        .map((item, index) => {
          const parsedInsight = safeJSONParse(item.key_insights, {});

          const type = index === 0 ? "Consultation" : `Reconsultation ${index}`;

          return {
            type,
            consultation_note: parsedInsight?.consultation_note || null,
            date: moment(item.added_date).format("YYYY-MM-DD HH:mm:ss"),
          };
        })
        .reverse();
    }
    const { results: healthScoreData } = await readRecord({
      selectFields: ["*"],
      table: `${tables.healthScoreClient} hs`,
      conditions: [
        { field: "hs.user_id", operator: "=", value: parseInt(user_id) },
      ],
      orderBy: ["hs.created DESC"],
      pagination: {
        page: 1,
        limit: 1,
      },
    });
    const { results: additionalQuestions } = await readRecord({
      selectFields: ["*"],
      table: `${tables.additionalQuestions} aq`,
      conditions: [
        { field: "aq.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    let junkFoodConsumption;
    additionalQuestions.map((item) => {
      const question = safeJSONParse(item.result, []);
      question.map((q) => {
        if (q?.key === "junk_food_consumption") {
          junkFoodConsumption = q.answer;
        }
      });
    });
    if (healthScoreData.length > 0) {
      const healthScore = healthScoreData[0];
      data["weight_marker"] = {
        height: healthScore.height || null,
        weight: healthScore.weight || null,
        age: healthScore.age || null,
        health_score: healthScore.overall_health_score || null,
        ibw: healthScore.ideal_weight || null,
        bmi: healthScore.body_mass_index || null,
      };
      data["lifestyle_marker"] = {
        sleep_duration: healthScore.sleep_duration || null,
        daily_activity_level: healthScore.activity_level || null,
        "smoking/vaping/hookah": healthScore.smoke_frequency || null,
        alcohol_consumption: healthScore.alcohol_frequency || null,
        water_intake: healthScore.water_frequency || null,
      };
      data["health_marker"] = {
        medical_conditions: safeJSONParse(healthScore.health_issue, []) || null,
      };
      data["diet_marker"] = {
        "fruit_&_vegetable_intake": healthScore.veg_fruits_frequency || null,
      };
      if (junkFoodConsumption) {
        data["diet_marker"]["junk_food_consumption"] =
          junkFoodConsumption || null;
      }
      data["eating_habits"] = healthScore.food_preferences || null;
      data["hs_data"] = healthScore.created || null;
    }
    if (userDetails.length > 0) {
      data["ethnicity"] = userDetails[0].ethnicity || null;
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Tracker and marker data fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in trackerAndMarker:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const pitchedHistory = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }
    const { results: pitchedData } = await readRecord({
      selectFields: [
        "sp.suggested_program_id as suggested_id",
        "sp.program_id AS suggested_program_id",
        "sp.program_session_id AS suggested_program_session_id",
        "spr.program_name AS suggested_program_name",
        "sp.suggested_amount",
        "sps.program_duration AS suggested_program_days",
        "sps.mrp AS suggested_program_mrp",
        "DATE_FORMAT(sp.added_date, '%d %b %Y') AS suggested_at",
        "DATEDIFF(CURDATE(), sp.added_date) AS suggested_days_ago",
        "CONCAT(ad.first_name, ' ', ad.last_name) AS suggested_by",
        "sp.payment_link_id",
        "sppm.payment_mode_name AS suggested_payment_mode",
        "sppm.payment_mode_details AS suggested_payment_mode_details",
        "sp.payment_expiry AS suggested_payment_expiry",
        "spl.payment_link_id AS suggested_payment_link_id",
        "sp.mentor_note AS suggested_mentor_note",
        "sp.motivation_level AS suggested_motivation_level",
        "sp.status AS suggested_sale_status",
        "spl.payment_link AS suggested_payment_link",
        "sp.payment_mode_id AS suggested_payment_mode_id",
      ],
      table: `${tables.suggestedProgram} sp`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} spr`,
          on: "sp.program_id = spr.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} sps`,
          on: "sp.program_session_id = sps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "sp.suggested_by = ad.admin_user_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentModes} sppm`,
          on: "sp.payment_mode_id = sppm.payment_mode_id",
        },
        {
          type: "LEFT",
          table: `${tables.paymentLinks} spl`,
          on: "sp.payment_link_id = spl.id",
        },
      ],
      conditions: [
        { field: "sp.user_id", operator: "=", value: parseInt(user_id) },
      ],
      orderBy: ["sp.added_date DESC"],
    });
    if (pitchedData.length === 0) {
      return next(new ErrorHandler("No pitched history found", 404));
    }
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Pitched history fetched successfully",
      data: pitchedData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in pitchedHistory:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const userAppActivity = async (req, res, next) => {
  try {
    const { user_id } = req.params;

    // Helper: Convert UTC to IST formatted string
    const toIST = (utcDate) => {
      const indiaDate = new Date(
        utcDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      );
      const pad = (n) => n.toString().padStart(2, "0");
      return `${indiaDate.getFullYear()}-${pad(indiaDate.getMonth() + 1)}-${pad(
        indiaDate.getDate(),
      )} ${pad(indiaDate.getHours())}:${pad(indiaDate.getMinutes())}:${pad(
        indiaDate.getSeconds(),
      )}`;
    };

    const { results: loginLogs } = await readRecord({
      selectFields: ["added_date"],
      table: `${tables.loginLogs} lg`,
      conditions: [
        { field: "lg.user_id", operator: "=", value: parseInt(user_id) },
      ],
      orderBy: ["lg.added_date DESC"],
    });

    const { results: walletLogs } = await readRecord({
      selectFields: ["date", "action", "amount", "trans_type"],
      table: `${tables.walletLog} wl`,
      conditions: [
        { field: "wl.user_id", operator: "=", value: parseInt(user_id) },
      ],
      orderBy: ["wl.date DESC"],
    });

    // Fetch program visits
    const { results: programVisits } = await readRecord({
      selectFields: [
        "iapv.visit_date",
        "iapv.visit_time",
        "pm.program_name",
        "CONCAT(iapv.visit_date, ' ', iapv.visit_time) AS visit_datetime",
      ],
      table: `${tables.inAppPageVisitLog} iapv`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "iapv.program_id = pm.program_id",
        },
      ],
      conditions: [
        { field: "iapv.user_id", operator: "=", value: parseInt(user_id) },
        { field: "iapv.page_type", operator: "=", value: 1 },
      ],
      orderBy: ["iapv.visit_date DESC", "iapv.visit_time DESC"],
    });

    // Fetch checkout visits
    const { results: checkoutVisits } = await readRecord({
      selectFields: [
        "iapv.visit_date",
        "iapv.visit_time",
        "pm.program_name",
        "ps.program_duration",
        "CONCAT(iapv.visit_date, ' ', iapv.visit_time) AS visit_datetime",
      ],
      table: `${tables.inAppPageVisitLog} iapv`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.programsMaster} pm`,
          on: "iapv.program_id = pm.program_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "iapv.program_id = ps.program_id AND iapv.sessions = ps.program_sessions",
        },
      ],
      conditions: [
        { field: "iapv.user_id", operator: "=", value: parseInt(user_id) },
        { field: "iapv.page_type", operator: "=", value: 2 },
      ],
      orderBy: ["iapv.visit_date DESC", "iapv.visit_time DESC"],
    });

    console.log(checkoutVisits, 4448);
    // Fetch Mongo logs (ensure sorted)
    const userActvityLogs = await UserVisitLog.find({
      user_id: parseInt(user_id),
    }).sort({ createdAt: -1 });

    const leadAppActivity = [];

    // Push SQL program visits
    programVisits.forEach((visit) => {
      leadAppActivity.push({
        timestamp: visit.visit_datetime, // Assumed already in IST
        activity: "program_visit",
        details: {
          program_name: visit.program_name,
          visit_date: visit.visit_date,
          visit_time: visit.visit_time,
          title: `Visited Program: ${visit.program_name}`,
        },
      });
    });

    // Push SQL checkout visits
    checkoutVisits.forEach((visit) => {
      leadAppActivity.push({
        timestamp: visit.visit_datetime, // Assumed already in IST
        activity: "checkout_visit",
        details: {
          program_name: visit.program_name,
          program_duration: visit.program_duration,
          visit_date: visit.visit_date,
          visit_time: visit.visit_time,
          title: `Visited Checkout for Program: ${visit.program_name} ${
            visit.program_duration ? `(${visit.program_duration})` : ""
          }`,
        },
      });
    });

    loginLogs.forEach((log) => {
      leadAppActivity.push({
        timestamp: log.added_date,
        activity: "login",
        details: {
          title: `Logged in`,
        },
      });
    });

    // Push wallet logs
    walletLogs.forEach((log) => {
      leadAppActivity.push({
        timestamp: log.date,
        activity: "wallet_activity",
        details: {
          action: log.action,
          amount: log.amount,
          trans_type: log.trans_type,
          title: `Amount ${log.amount} ${
            log.trans_type == "C" ? "credited" : "debited"
          } for ${log.action}`,
        },
      });
    });

    // Push Mongo logs with IST-converted timestamps
    userActvityLogs.forEach((log) => {
      leadAppActivity.push({
        timestamp: toIST(log.createdAt),
        activity: `${log.page} Page Visit`,
        details: {
          title: `Visited ${log.page} Page`,
        },
      });
    });

    // Sort all combined activity logs by descending timestamp
    leadAppActivity.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );

    // Respond
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "User app activity fetched successfully",
      data: leadAppActivity,
    });

    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in userAppActivity:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const leadMilestones = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }
    const { results: milestones } = await readRecord({
      selectFields: ["milestone_id", "is_ack", "added_date", "milestones"],
      table: `${tables.userMilestones} m`,
      conditions: [
        { field: "m.user_id", operator: "=", value: parseInt(user_id) },
        { field: "m.added_by", operator: "=", value: "User" },
      ],
      orderBy: ["m.added_date DESC"],
    });
    if (milestones.length === 0) {
      return next(new ErrorHandler("No milestones found for this user", 404));
    }
    const finalData = milestones.map((milestone) => {
      return {
        milestone_id: milestone.milestone_id,
        is_ack: milestone.is_ack,
        added_date: milestone.added_date,
        milestones: safeJSONParse(milestone.milestones, []),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Milestones fetched successfully",
      data: finalData,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in leadMilestones:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadFeedbacksNew = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return next(new ErrorHandler("user_id is required", 400));
    }
    const { results: feedbacks } = await readRecord({
      selectFields: ["*"],
      table: `${tables.leadFeedback} lf`,
      conditions: [
        { field: "lf.user_id", operator: "=", value: parseInt(user_id) },
      ],
    });
    if (feedbacks.length === 0) {
      const apiResponse = new ApiResponse({
        statusCode: 200,
        message: "No feedbacks found for this user",
        data: [],
      });
      return res.status(200).json(apiResponse);
    }
    const data = feedbacks.map((item) => {
      return {
        id: item.id,
        type: item.type,
        feedback: item.feedback,
        is_ack: item.is_ack,
        ack_date: item.ack_date,
        added_date: moment(item.added_date).format("Do MMM YYYY"),
      };
    });
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead feedbacks fetched successfully",
      data,
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getLeadFeedbacksNew:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLeadFollowUpAndEngagement = async (req, res, next) => {
  try {
    const { user_id, admin_id } = req.query;
    const { results: followUps } = await readRecord({
      selectFields: [
        "fu.follow_up_id",
        "fu.follow_up_date",
        "CASE WHEN fu.type IN (0,'0') THEN s.appointment_slots WHEN fu.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END as appointment_slots",
      ],
      table: `${tables.leadFollowUpLogs} fu`,
      joins: [
        {
          type: "INNER",
          table: `${tables.slots} s`,
          on: "fu.slot_id = s.id AND fu.type IN (0, '0')",
        },

        {
          type: "INNER",
          table: `${tables.whatsappAppSlots} wap_slot`,
          on: "fu.slot_id = wap_slot.id AND fu.type IN (1,'1', 2, '2')",
        },
      ],
      conditions: [
        { field: "fu.user_id", operator: "=", value: parseInt(user_id) },
        { field: "fu.added_by", operator: "=", value: parseInt(admin_id) },
        { field: "fu.follow_up_status", operator: "=", value: 0 },
        {
          field: "DATE(fu.follow_up_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
      orderBy: [
        "STR_TO_DATE(SUBSTRING_INDEX((CASE WHEN fu.type IN (0,'0') THEN s.appointment_slots WHEN fu.type IN (1,2,'1','2') THEN wap_slot.appointment_slots END), ' - ', 1), '%h:%i %p');",
      ],
    });
    const { results: engagements } = await readRecord({
      selectFields: ["lel.id", "lel.engagement_date", "s.appointment_slots"],
      table: `${tables.leadEngagementLogs} lel`,
      joins: [
        {
          type: "INNER",
          table: `${tables.slots} s`,
          on: "lel.slot_id = s.id",
        },
      ],
      conditions: [
        { field: "lel.user_id", operator: "=", value: parseInt(user_id) },
        { field: "lel.added_by", operator: "=", value: parseInt(admin_id) },
        { field: "lel.status", operator: "=", value: 0 },
        {
          field: "DATE(lel.engagement_date)",
          operator: "=",
          value: "CURDATE()",
          raw: true,
        },
      ],
      orderBy: [
        "STR_TO_DATE(SUBSTRING_INDEX(s.appointment_slots, ' - ', 1), '%h:%i %p');",
      ],
    });
    console.log(followUps, engagements);
    const apiResponse = new ApiResponse({
      statusCode: 200,
      message: "Lead follow-ups and engagements fetched successfully",
      data: {
        follow_ups: followUps,
        engagements,
      },
    });
    return res.status(200).json(apiResponse);
  } catch (error) {
    console.log("Error in getLeadFollowUpAndEngagement:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const escapeHtml = (str = "") =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const sendLeadTargetMessages = async (req, res, next) => {
  try {
    const { medicalCondition, type, clientName } = req.body;

    if (!medicalCondition || !type) {
      return next(new ErrorHandler("Invalid request", 400));
    }

    const currentYear = new Date().getFullYear();
    let bodyContent = "";
    let header = "";
    let title = "";
    let footerText = "";

    switch (type) {
      case "success-stories": {
        const { results } = await readRecord({
          selectFields: [
            `CONCAT('${image_guide_base_url_live}/testimonials/',ss.slug) as web_link`,
            `CONCAT('${image_guide_base_url_live}/app_link/screen_id=1011/redirect_id=',ss.id) as app_link`,
            "ss.short_descriptions",
            "ss.long_descriptions",
          ],
          table: `${tables.successStories} ss`,
          conditions: [
            { field: "ss.status", operator: "=", value: 1 },
            {
              orConditions: [
                {
                  field: "ss.slug",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "ss.hashtags",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "ss.short_descriptions",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "ss.long_descriptions",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
              ],
            },
          ],
          orderBy: ["RAND()"],
          pagination: { page: 1, limit: 1 },
        });

        bodyContent =
          results.length > 0
            ? generateSuccessStoryContent({
                clientName,
                story: results?.[0] || null,
              })
            : null;
        header = "🌟 Success Story";
        title = "Inspiring Success Story";
        footerText =
          "You're receiving this because you expressed interest in health and wellness content.";
        console.log(results?.[0], "success-stories");
        break;
      }

      case "blogs": {
        const { results } = await readRecord({
          selectFields: [
            "bp.postId",
            "bp.postTitle",
            `CONCAT('${image_guide_base_url_live}/health-reads/',bc.catSlug,"/",bp.slug) as web_link`,
            `CONCAT('${image_guide_base_url_live}/app_link/screen_id=1029/redirect_id=',bp.postId) as app_link`,
            "bp.postDesc",
            "bp.postCont",
          ],
          table: `${tables.blogPosts} bp`,
          conditions: [
            { field: "bp.status", operator: "=", value: 1 },
            {
              orConditions: [
                {
                  field: "bp.slug",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "bp.hashtags",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "bp.postDesc",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "bp.postTitle",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
              ],
            },
          ],
          joins: [
            {
              table: `${tables.blogPostsCategory} bc`,
              type: "LEFT",
              on: "bc.catId = bp.category_id",
            },
          ],
          orderBy: ["RAND()"],
          pagination: { page: 1, limit: 1 },
        });

        bodyContent =
          results.length > 0
            ? generateBlogContent({
                clientName,
                blog: results?.[0] || null,
              })
            : null;
        header = "📚 Health Read";
        title = results?.[0]?.postTitle || "Health Read";
        footerText =
          "Stay informed with our latest health articles and expert tips.";
        console.log(results?.[0], "blogs");
        break;
      }

      case "notification": {
        const { results } = await readRecord({
          selectFields: [
            "nt.title",
            "nt.description",
            "nt.auto_chat",
            "nt.id",
            "nt.url",
          ],
          table: `${tables.notifications} nt`,
          conditions: [
            {
              orConditions: [
                {
                  field: "nt.title",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "nt.description",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
              ],
            },
          ],
          orderBy: ["RAND()"],
          pagination: { page: 1, limit: 1 },
        });

        bodyContent =
          results.length > 0
            ? generateNotificationContent({
                clientName,
                notification: results?.[0] || null,
              })
            : null;
        header = "🔔 Important Update";
        title = results?.[0]?.title || "Important Update";
        footerText =
          "Stay updated with important health notifications and reminders.";
        console.log(results?.[0], "notification");
        break;
      }

      default: {
        const { results } = await readRecord({
          selectFields: [
            "sp.id",
            "sp.title",
            "sp.description",
            `JSON_UNQUOTE(
                            COALESCE(
                                NULLIF(JSON_EXTRACT(sp.accounts, '$.insta_account."Balance Nutrition"'), ''),
                                JSON_EXTRACT(sp.accounts, '$.youtube_account."Balance Nutrition"')
                            )
                        ) AS balance_nutrition_link`,
            `JSON_UNQUOTE(
                            COALESCE(
                                NULLIF(JSON_EXTRACT(sp.accounts, '$.insta_account."Khyati Rupani"'), ''),
                                JSON_EXTRACT(sp.accounts, '$.youtube_account."Khyati Rupani"')
                            )
                        ) AS khyati_rupani_link`,
            `JSON_UNQUOTE(
                            NULLIF(JSON_EXTRACT(sp.thumbnail_image, '$[0].file.path'), '')
                        ) AS image_link`,
          ],
          table: `${tables.socialPost} sp`,
          conditions: [
            { field: "sp.post_sub_type", operator: "=", value: type },
            {
              orConditions: [
                {
                  field: "sp.title",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "sp.description",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
                {
                  field: "sp.tags",
                  operator: "LIKE",
                  value: `'%${medicalCondition}%'`,
                  raw: true,
                },
              ],
            },
          ],
          orderBy: ["RAND()"],
          pagination: { page: 1, limit: 1 },
        });

        bodyContent =
          results.length > 0
            ? generateSocialPostContent({
                clientName,
                post: results?.[0] || null,
              })
            : null;
        header = "📱 Daily Tip";
        title = "Daily Health Tip";
        footerText =
          "Follow us on social media for daily health tips and inspiration!";
        console.log(results?.[0], "social-post");
        break;
      }
    }

    // Render the email using EJS template
    const html = bodyContent
      ? await ejs.renderFile(
          path.join(__dirname, "../../../../../src/mails/leadTargetMail.ejs"),
          {
            title,
            header,
            body: bodyContent,
            footerText,
            currentYear,
          },
        )
      : null;

    res.setHeader("Content-Type", "text/html");

    await sendMailUtil({
      from: "support@balancenutrition.in",
      to: "madhupakasuper@gmail.com",
      cc: ["clientservices@balancenutrition.in"],
      bcc: ["testerteam@balancenutrition.in"],
      subject: "Some Random Subject",
      html: html,
    });

    return res.status(200).send(html);
  } catch (err) {
    console.error("Error in sendLeadTargetMessages:", err);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

export {
  addFollowUp,
  addFollowUpUtil,
  addLead,
  addLeadAssignLog,
  addSaleStatusLogNew,
  addSourceLogNew,
  addStatusLogNew,
  addPhaseLogNew,
  assignLead,
  checkMentorSlot,
  checkUserExist,
  getAllLeads,
  getLeadFollowUpAndEngagement,
  getSingleLeadDataById,
  getUserHealthScore,
  getUserMedicalReports,
  isFutureOrPast,
  leadConsultationForm,
  leadHistory,
  markFollowUpDone,
  phaseLog,
  salesStatusLogs,
  sourceLog,
  stageLogs,
  statusLog,
  suggestProgramToUser,
  updateLeadDetails,
  updateLeadSource,
  updateLeadStatus,
  updateSuggestedProgram,
  updateUserPhase,
  updateUserSalesStatus,
  updateUserSource,
  updateUserStage,
  updateUserStatus,
  updatedLeadPhase,
  userGoals,
  addStageLogNew,
  getLeadInsightsByLeadId,
  addSocialMediaLeads,
  getLeadCalls,
  updateleadDetailSpecify,
  addEngageMentUtil,
  getLeadPopupNotifications,
  getPopupLeadsByStatus,
  leadConcernAndGoals,
  trackerAndMarker,
  pitchedHistory,
  userAppActivity,
  addEngagement,
  markEngagementDone,
  leadMilestones,
  getLeadFeedbacksNew,
};
