import axios from "axios";
import { configDotenv } from "dotenv";
import twilio from "twilio";
import cloudinary from "../../config/cloudinaryConfig.js";
import { client } from "../../config/twilioConfig.js";
import { image_guide_base_url, tables } from "../../helper/constant.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import moment from "moment";
import { ApiResponse } from "../../utils/APiResponse.js";
import { mapCallType } from "../../helper/commonHelper.js";
import { makeExotelCall, registerUsers } from "../../services/exotelIntegration.js";
import { insertRecord, readRecord, updateRecord } from "../../config/query.js";

configDotenv();
const voiceController = async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const dial = response.dial({
    callerId: process.env.TWILIO_PHONE,
    record: "record-from-answer-dual",
    recordingStatusCallback:
      "https://bn-new-api.balancenutritiononline.com/api/v1/call-recording",
  });
  dial.number(req.body.To);

  res.type("text/xml");
  res.send(response.toString());
};

const twilioTokenGeneratorController = async (req, res, next) => {
  const { identity } = req.body;
  try {
    if (!identity) {
      return res.status(400).json({
        success: false,
        message: "Identity Not Provided!",
      });
    }
    const token = new twilio.jwt.AccessToken(
      process.env.ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_SECRET_KEY,
      { identity }
    );
    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: process.env.OUTGOINGAPPLICATION_SID,
    });
    token.addGrant(voiceGrant);

    return res.status(200).json({
      success: true,
      message: "Token generated successfully",
      token: token.toJwt(),
    });
  } catch (error) {
    console.error("Error generating token:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};
const getCallStatusController = async (req, res, next) => {
  const { callSid } = req.query;

  try {
    const call = await client.calls(callSid).fetch();
    console.log(call, 59);
    return res.status(200).json({
      success: true,
      message: "Call status fetched successfully",
      data: {
        status: call.status,
      },
    });
  } catch (error) {
    console.error("Error fetching call status:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const callRecordingController = async (req, res, next) => {
  const recordingUrl = req.body.RecordingUrl + ".wav";
  const recordingSid = req.body.RecordingSid;
  const callSid = req.body.CallSid;

  const childCalls = await client.calls.list({
    parentCallSid: callSid,
  });

  const actualCallDetail = childCalls.find(
    (call) => call.direction === "outbound-dial"
  );

  const { to } = actualCallDetail;

  try {
    const response = await axios({
      method: "get",
      url: recordingUrl,
      responseType: "stream",
      auth: {
        username: process.env.ACCOUNT_SID,
        password: process.env.AUTH_TOKEN,
      },
    });

    const cloudinaryUpload = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "call_recordings",
          public_id: recordingSid,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      response.data.pipe(uploadStream);
    });

    const cloudinaryResponse = await cloudinaryUpload;

    const { original_filename: name, secure_url: url } = cloudinaryResponse;

    return res.status(200).json({
      success: true,
      message: "Call Recorded and Uploaded to Cloudinary Successfully",
      data: {
        name,
        url,
      },
    });
  } catch (error) {
    console.error(error);
    return next(
      new ErrorHandler("Error Recording and Uploading Call Recording", 500)
    );
  }
};

const getCallsByProgramController = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    const mapCallType = (call_type) => {
      switch (String(call_type)) {
        case "0":
          return "welcome (program induction) call";
        case "1":
          // return "Halftime Progress";
          return "progress call";
        case "2":
          // return "Final Feedback ";
          return "feedback call";
        case "3":
          return "Induction Call ";
        case "4":
          return "Service Call ";
        case "6":
          return "Book by Mentor";
        case "10":
          return "Change of Mentor Call";
        case "11":
          return "Extra Call (Engagement)";
        case "12":
          return "Pitching Call";
        case "13":
          return "Bad Feedback Call";
        case "14":
          return "Follow up Call";
        case "15":
          return "Overdue Call (Weight / any other)";
        case "16":
          return "Dormant Call";
        case "17":
          return "On hold OD Call";
        case "18":
          return "Follow up for Renewal Call";
        case "19":
          return "Any Other Call";
        case "20":
          return "Concern Call";
        case "21":
          return "Head Nutritionist Concern Call";
        case "23":
          return "Poor Rating Call";
        case "24":
          return "Poor Weight Loss Call";
        case "25":
          return "Nutrition Manager Less Loss Call";
        case "26":
          return "Nutrition Manager Poor Rating Call";
        case "30":
          return "Consultation Call";
        case "31":
          return "Less Loss Call";
        case "45":
          return "Entra Engagement Call";
        case "66":
          return "Introduction Call";
        case "68":
          return "Lead Welcome Call";
        default:
          return "Default Call";
      }
    };

    const mapCallStatus = (call_status) => {
      return call_status === 0
        ? "Pending"
        : call_status === 1
        ? "Done"
        : call_status === 2
        ? "cancel"
        : call_status === 3
        ? "Rescheduled"
        : call_status === 4
        ? "Unanswered"
        : "N/A";
    };

    const [olderProgramsData, currentProgramsData, advancePurchasesData] =
      await Promise.all([
        readRecord({
          table: `${tables.orderDetails} od`,
          selectFields: [
            "pm.program_name",
            "cu.call_type",
            "cu.call_status",
            "cu.added_date",
            "cu.schedule_date",
            "ad.crm_user as scheduled_by",
          ],
          joins: [
            {
              type: "LEFT",
              table: `${tables.subOrderPrograms} sop`,
              on: "od.order_id = sop.order_id",
            },
            {
              type: "LEFT",
              table: `${tables.programsMaster} pm`,
              on: "sop.program_id = pm.program_id",
            },
            {
              type: "INNER",
              table: `${tables.callUpdates} cu`,
              on: "sop.sub_order_id = cu.sub_order_id",
            },
            {
              type: "LEFT",
              table: `${tables.adminUsers} ad`,
              on: "cu.added_by = ad.admin_user_id",
            },
          ],
          conditions: [
            { field: "od.user_id", operator: "=", value: user_id },
            { field: "sop.program_status", operator: "=", value: 3 },
          ],
          orderBy: ["od.order_id DESC"],
        }),
        readRecord({
          table: `${tables.orderDetails} od`,
          selectFields: [
            "pm.program_name",
            "cu.call_type",
            "cu.call_status",
            "cu.added_date",
            "cu.schedule_date",
            "ad.crm_user as scheduled_by",
          ],
          joins: [
            {
              type: "LEFT",
              table: `${tables.subOrderPrograms} sop`,
              on: "od.order_id = sop.order_id",
            },
            {
              type: "LEFT",
              table: `${tables.programSession} ps`,
              on: "sop.program_session_id = ps.program_session_id",
            },
            {
              type: "LEFT",
              table: `${tables.programsMaster} pm`,
              on: "ps.program_id = pm.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.callUpdates} cu`,
              on: "sop.sub_order_id = cu.sub_order_id",
            },
            {
              type: "LEFT",
              table: `${tables.adminUsers} ad`,
              on: "cu.added_by = ad.admin_user_id",
            },
          ],
          conditions: [
            { field: "od.user_id", operator: "=", value: user_id },
            { field: "sop.program_status", operator: "=", value: 1 },
          ],
          orderBy: ["od.order_id DESC"],
        }),
        readRecord({
          table: `${tables.orderDetails} od`,
          selectFields: [
            "pm.program_name",
            "cu.call_type",
            "cu.call_status",
            "cu.added_date",
            "cu.schedule_date",
            "ad.crm_user as scheduled_by",
          ],
          joins: [
            {
              type: "LEFT",
              table: `${tables.subOrderPrograms} sop`,
              on: "od.order_id = sop.order_id",
            },
            {
              type: "LEFT",
              table: `${tables.programSession} ps`,
              on: "sop.program_session_id = ps.program_session_id",
            },
            {
              type: "LEFT",
              table: `${tables.programsMaster} pm`,
              on: "ps.program_id = pm.program_id",
            },
            {
              type: "LEFT",
              table: `${tables.callUpdates} cu`,
              on: "sop.sub_order_id = cu.sub_order_id",
            },
            {
              type: "LEFT",
              table: `${tables.adminUsers} ad`,
              on: "cu.added_by = ad.admin_user_id",
            },
          ],
          conditions: [
            { field: "od.user_id", operator: "=", value: user_id },
            { field: "sop.program_status", operator: "=", value: 4 },
          ],
          orderBy: ["od.order_id DESC"],
        }),
      ]);

    const mapProgramData = (programs) => {
      return programs.map((i) => {
        return {
          program_name: i.program_name || null,
          call_type:
            i.call_type !== undefined ? mapCallType(String(i.call_type)) : null,
          scheduled_by: i.scheduled_by || null,
          schedule_date:
            `${moment(i.schedule_date).format("DD-MM-YYYY")} ${moment(
              i.schedule_date
            ).fromNow()}` || null,
          call_status:
            i.call_status !== undefined ? mapCallStatus(i.call_status) : null,
        };
      });
    };

    const data = {
      oldProgram: mapProgramData(olderProgramsData.results || []),
      currentPrograms: mapProgramData(currentProgramsData.results || []),
      advancePurchases: mapProgramData(advancePurchasesData.results || []),
    };

    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: "Calls Fetched By Programs",
      data,
    });

    return res.status(200).json(apiresponse);
  } catch (error) {
    console.error("Error fetching program calls:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getClientCallStatusController = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return next(new ErrorHandler("User Id is required", 400));
    const parsedUserId = parseInt(user_id);

    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.user_status",
        "sop.sent_sessions",
        "sop.last_session_sent_date",
        "ps.program_sessions",
        "cu.call_type",
        "cu.call_status",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "sop.sub_order_id = ud.active_order_id",
        },
        {
          type: "LEFT",
          table: `${tables.programSession} ps`,
          on: "sop.program_session_id = ps.program_session_id",
        },
        {
          type: "LEFT",
          table: `${tables.callUpdates} cu`,
          on: "ud.user_id = cu.user_id AND ud.active_order_id = cu.sub_order_id",
        },
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: parsedUserId,
        },
      ],
    });

    if (results.length === 0)
      return next(new ErrorHandler("User not found", 404));

    const userDetails = results;
    const callTypeConditions = [
      {
        status: "Lead",
        call_type: "Consultation Call",
        call_type_id: 30,
        condition: (details) =>
          details.some(
            (item) =>
              item.user_status === "Lead" &&
              !details.some((d) => Number(d.call_type) === 30)
          ),
      },
      {
        status: "Active",
        call_type: "Welcome Call",
        call_type_id: 0,
        condition: (details) =>
          details.some(
            (item) =>
              item.user_status === "Active" &&
              Number(item.sent_sessions) === 1 &&
              !details.some((d) => Number(d.call_type) === 0)
          ),
      },
      {
        status: "Active",
        call_type: "Halftime Call",
        call_type_id: 1,
        condition: (details) =>
          details.some(
            (item) =>
              item.user_status === "Active" &&
              ((Number(item.program_sessions) === 3 &&
                Number(item.sent_sessions) === 2) ||
                (Number(item.program_sessions) === 6 &&
                  Number(item.sent_sessions) === 3) ||
                (Number(item.program_sessions) === 9 &&
                  Number(item.sent_sessions) === 5) ||
                (Number(item.program_sessions) === 12 &&
                  Number(item.sent_sessions) === 7)) &&
              !details.some((d) => Number(d.call_type) === 1)
          ),
      },
      {
        status: "Active",
        call_type: "Final Call",
        call_type_id: 2,
        condition: (details) =>
          details.some(
            (item) =>
              item.user_status === "Active" &&
              ((Number(item.program_sessions) === 3 &&
                Number(item.sent_sessions) === 3) ||
                (Number(item.program_sessions) === 6 &&
                  Number(item.sent_sessions) === 4) ||
                (Number(item.program_sessions) === 9 &&
                  Number(item.sent_sessions) === 6) ||
                (Number(item.program_sessions) === 12 &&
                  Number(item.sent_sessions) === 8)) &&
              !details.some((d) => Number(d.call_type) === 2)
          ),
      },
    ];

    for (const callType of callTypeConditions) {
      if (callType.condition(userDetails)) {
        const apiresponse = new ApiResponse({
          statusCode: 200,
          message: `User Upcoming Call Fetched Successfully`,
          data: {
            status: callType.status,
            call_type: callType.call_type,
            call_type_id: callType.call_type_id,
            call_status: false,
          },
        });
        return res.status(200).json(apiresponse);
      }
    }
    const apiresponse = new ApiResponse({
      statusCode: 200,
      message: `User Upcoming Call Fetched Successfully`,
      data: {
        status: "No Call",
        call_type: null,
        call_type_id: null,
        call_status: false,
      },
    });
    return res.status(200).json(apiresponse);
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};

const getLatestUserCallScheduled = async (req, res, next) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return next(new ErrorHandler("User Id not Provided", 400));
    }
    const { results } = await readRecord({
      table: `${tables.callUpdates} cu`,
      selectFields: [
        "cu.call_type",
        "cu.schedule_date",
        "slot.appointment_slots as booked_slot",
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.slots} slot`,
          on: "slot.id = cu.slot_id",
        },
      ],
      conditions: [
        { field: "cu.user_id", operator: "=", value: user_id },
        { field: "cu.call_status", operator: "=", value: "0", raw: true },
      ],
      orderBy: ["cu.schedule_date DESC"],
      pagination: { limit: 1 },
    });

    if (results.length === 0) {
      return res.status(200).json(
        new ApiResponse({
          statusCode: 200,
          message: "Latest Scheduled Call Fetched Successfully",
          data: {},
        })
      );
    }
    const SCREEN_PARAMS = {
      EAT_IN_PORTIONS: {
        // link: `https://www.${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-eat-in-portions`,
        link:`https://balancenutrition.in/media/ekits/eat_in_portions.pdf`,
        screen_title: "BN Eat In Portions",
      },
      FAQS: {
        // link: `https://www.${image_guide_base_url}/show-ekit/MzA2ODA=/9278e812ad2f7c499af635146e4f67ef/ekit-faqs`,
        link: "https://balancenutrition.in/media/ekits/frequently_asked_questions.pdf",
        screen_title: "Ekit FAQs",
      },
    };
    console.log(results[0].call_type, 562);
    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Latest Scheduled Call Fetched Successfully",
        data: {
          call_type: mapCallType(Number(results[0].call_type)),
          call_type_id: Number(results[0].call_type),
          scheduled_date: moment(results[0].schedule_date).format(
            "MMMM Do, dddd"
          ),
          scheduled_slot: results[0].booked_slot,
          redirect_screen: "webview",
          screen_params:
            Number(results[0].call_type) === 0
              ? SCREEN_PARAMS.EAT_IN_PORTIONS
              : SCREEN_PARAMS.FAQS,
        },
      })
    );
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
};


const makeDashboardCallExotel = async (req,res,next)=> {
  try {

    const {to, from, } = req.body;
    const makeCallResponse = await makeExotelCall({to, from});

    return res.status(200).json(new ApiResponse({
      statusCode: 200,
      message: "Call Initiated Successfully",
      data: makeCallResponse,
    }));

  } catch (error) {
    console.log('Error in making dashboard call - exotel', error?.message || error); 
    return next(new ErrorHandler("Internal Server Error", 500));  
  }
}

const checkOrRegisterExotelAgent = async (req, res, next) => {
  try {
    const { admin_id } = req.body;

    if (!admin_id) {
      return next(new ErrorHandler("Admin ID is required", 400));
    }

    // Check if agent exists in exotel_agents table
    const { results: existingAgent } = await readRecord({
      table: 'exotel_agents',
      selectFields: [
        'id',
        'admin_user_id',
        'exotel_agent_id',
        'exotel_extension',
        'exotel_tenant_id',
        'sip_username',
        'sip_domain',
        'status'
      ],
      conditions: [
        { field: 'admin_user_id', operator: '=', value: admin_id }
      ]
    });

    if (existingAgent.length > 0) {
      // Agent exists, return details
      const agentData = existingAgent[0];
      
      return res.status(200).json(new ApiResponse({
        statusCode: 200,
        message: "Exotel agent details retrieved successfully",
        data: {
          id: agentData.id,
          admin_user_id: agentData.admin_user_id,
          exotel_agent_id: agentData.exotel_agent_id,
          exotel_extension: agentData.exotel_extension,
          exotel_tenant_id: agentData.exotel_tenant_id,
          sip_username: agentData.sip_username,
          sip_domain: agentData.sip_domain,
          status: agentData.status,
          is_new: false
        }
      }));
    }

    // Agent doesn't exist, get admin details and register with Exotel
    const { results: adminDetails } = await readRecord({
      table: `${tables.adminUsers}`,
      selectFields: [
        'admin_user_id',
        'crm_user',
        'email_id',
        'official_phone',
        'first_name',
        'last_name'
      ],
      conditions: [
        { field: 'admin_user_id', operator: '=', value: admin_id }
      ]
    });

    if (adminDetails.length === 0) {
      return next(new ErrorHandler("Admin user not found", 404));
    }

    const admin = adminDetails[0];
    const fullName = `${admin.first_name} ${admin.last_name}`.trim();

    // Register user with Exotel
    const userData = [{
      AppUserId: admin.admin_user_id.toString(),
      AppUsername: fullName,
      Email: admin.email_id,
      ExotelAccountSid: process.env.EXOTEL_ACCOUNT_SID,
      ExotelUserName: fullName,
      AgentNumber: `91${admin.official_phone}`,
      VirtualNumber: process.env.EXOTEL_VIRTUAL_NUMBER || '02247790126'
    }];

    const exotelResponse = await registerUsers(userData);

    if (!exotelResponse || exotelResponse.length === 0) {
      return next(new ErrorHandler("Failed to register agent with Exotel", 500));
    }

    const registeredAgent = exotelResponse[0];

    // Save to exotel_agents table
    const insertData = {
      admin_user_id: admin.admin_user_id,
      exotel_agent_id: registeredAgent.ExotelUserId || '',
      exotel_extension: registeredAgent.ActiveDeviceId || '',
      exotel_tenant_id: registeredAgent.CustomerId || '',
      sip_username: registeredAgent.SipId || '',
      sip_password_enc: registeredAgent.SipSecret || '', // Note: This should be encrypted in production
      sip_domain: 'sip.exotel.com',
      status: 'active'
    };

    const { insertId } = await insertRecord(
      'exotel_agents',
      Object.keys(insertData),
      Object.values(insertData)
    );

    return res.status(201).json(new ApiResponse({
      statusCode: 201,
      message: "Exotel agent registered successfully",
      data: {
        id: insertId,
        admin_user_id: admin.admin_user_id,
        exotel_agent_id: registeredAgent.ExotelUserId,
        exotel_extension: registeredAgent.ActiveDeviceId,
        exotel_tenant_id: registeredAgent.CustomerId,
        sip_username: registeredAgent.SipId,
        sip_domain: 'sip.exotel.com',
        status: 'active',
        is_new: true,
        exotel_details: registeredAgent
      }
    }));

  } catch (error) {
    console.error("Error in checkOrRegisterExotelAgent:", error);
    return next(new ErrorHandler("Internal Server Error", 500));
  }
}


export {
  callRecordingController,
  getCallStatusController,
  twilioTokenGeneratorController,
  voiceController,
  getCallsByProgramController,
  getClientCallStatusController,
  makeDashboardCallExotel,
  getLatestUserCallScheduled,
  checkOrRegisterExotelAgent,
};
