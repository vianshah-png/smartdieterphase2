import moment from "moment";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "./constant.js";
import md5 from "md5";
import { insertOrderLog } from "./common.js";

const handleServicePayment = async ({ sub_order_id, service_id }) => {
  try {
    const { results } = await readRecord({
      table: `${tables.subOrderPrograms} sop`,
      selectFields: ["*"],
      conditions: [
        {
          field: "sop.sub_order_id",
          operator: "=",
          value: sub_order_id,
        },
      ],
    });
    if (results.length === 0) {
      throw new Error("Sub Order ID not found");
    }
    const subOrderDetails = results[0];

    if (Number(service_id) === 1) {
      const { results } = await readRecord({
        table: `${tables.orderDetails} od`,
        selectFields: ["od.order_balance_amount"],
      });
      const orderDetails = results[0];
      updateRecord(
        tables.orderDetails,
        {
          balance_amount: 0,
          due_date: null,
          paid_amount:
            subOrderDetails.balance_amount + subOrderDetails.paid_amount,
        },
        {
          sub_order_id: sub_order_id,
        }
      );
      updateRecord(
        tables.orderDetails,
        {
          due_date: null,
          order_paid_amount:
            orderDetails.order_paid_amount + orderDetails.order_balance_amount,
        },
        {
          order_id: subOrderDetails.order_id,
        }
      );
    }
    if (Number(service_id) === 2) {
      updateRecord(
        tables.orderDetails,
        {
          program_status: 2,
        },
        {
          sub_order_id: sub_order_id,
        }
      );
    }
    const serviceMap = {
      1: "Balance Payment",
      2: "Freezing  Fee",
    };
    const insertOrderLogResult = await insertOrderLog({
      user_id: subOrderDetails.user_id,
      order_id: subOrderDetails.order_id,
      amount: subOrderDetails.paid_amount,
      payment_for: serviceMap[parseInt(service_id)],
      src: "Razorpay",
    });
    return { success: true };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const handleGuidePayment = async ({
  guide_id,
  phone_number,
  user_id,
  amount,
  admin_user_id,
}) => {
  try {
    const { results } = await readRecord({
      table: `${tables.guides} g`,
      selectFields: ["g.mrp"],
      conditions: [
        {
          field: "g.guide_id",
          operator: "=",
          value: guide_id,
        },
      ],
    });
    if (results.length === 0) {
      throw new Error("Guide ID not found");
    }
    const guideDetails = results[0];
    const orderDetailsInsertedResult = await insertRecord(
      tables.orderDetails,
      [
        "user_id",
        "phone_number",
        "order_mrp",
        "order_paid_amount",
        "payment_mode",
        "order_date",
        "total_items",
        "sale_by",
      ],
      [
        user_id,
        phone_number,
        guideDetails.mrp,
        amount,
        moment().format(),
        1,
        admin_user_id,
      ]
    );

    const insertOrderLogResult = await insertOrderLog({
      user_id: user_id,
      order_id: orderDetailsInsertedResult.insertId,
      amount: amount,
      payment_for: "Guide Payment",
      src: "Razorpay",
    });

    const subOrderProgramInsertedResult = await insertRecord(
      tables.subOrderPrograms,
      ["order_id", "user_id", "guide_id", "type", "mrp", "paid_amount"],
      [
        orderDetailsInsertedResult.insertId,
        user_id,
        guide_id,
        1,
        guideDetails.mrp,
        amount,
      ]
    );

    if (subOrderProgramInsertedResult.affectedRows === 0) {
      throw new Error("Failed to insert sub order program details");
    }
    return { success: true };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const handleProgramPayment = async ({
  program_id,
  program_session_id,
  amount,
  user_id,
  phone_number,
  admin_user_id,
}) => {
  try {
    const { results } = await readRecord({
      table: `${tables.userDetails} ud`,
      selectFields: [
        "ud.sub_user_status",
        "ud.user_status",
        "ud.mentor_assigned",
        "ud.suggested_program_id",
        "sop.expiry_date",
        "sop.program_status",
      ],
      conditions: [
        {
          field: "ud.user_id",
          operator: "=",
          value: user_id,
        },
      ],
      joins: [
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
      ],
    });
    if (results.length === 0) {
      throw new Error("User ID not found");
    }
    const userDetails = results[0];

    // Fetch program session details including extra_validity
    const { results: programSessionDetails } = await readRecord({
      table: `${tables.programSession} ps`,
      selectFields: [
        "ps.mrp",
        "ps.program_sessions",
        "ps.program_duration",
        "ps.extra_validity",
      ],
      conditions: [
        {
          field: "ps.program_session_id",
          operator: "=",
          value: program_session_id,
        },
      ],
    });


    // Determine order_type
    const order_type =
      userDetails.user_status === "Active"
        ? "Renewal"
        : userDetails.user_status === "Lead"
        ? "New"
        : userDetails.user_status === "Completed"
        ? "OCR"
        : null;
    let mentor_assigned_id = "";
    if(order_type === "Renewal"){
        mentor_assigned_id = userDetails.mentor_assigned;
    }
    // Insert into orderDetails
    const order_discount = programSessionDetails[0].mrp - amount;
    const orderDetailsInsertedResult = await insertRecord(
      tables.orderDetails,
      [
        "user_id",
        "phone_number",
        "order_mrp",
        "order_type",
        "order_paid_amount",
        "order_discount",
        "payment_mode",
        "order_date",
        "total_items",
        "order_status",
        "sale_by",
        "mentor_assigned"
      ],
      [
        user_id,
        phone_number,
        programSessionDetails[0].mrp,
        order_type,
        amount,
        order_discount,
        6, // Assuming 1 is a payment mode ID
        moment().format(),
        1,
        "2",
        admin_user_id,
        mentor_assigned_id
      ]
    );

    // Fetch program details
    const { results: programDetails } = await readRecord({
      table: `${tables.programsMaster} pm`,
      selectFields: ["pm.program_category"],
      conditions: [
        {
          field: "pm.program_id",
          operator: "=",
          value: program_id,
        },
      ],
    });

    // Determine if there's an active program based on userDetails
    const hasActiveProgram =
      userDetails.expiry_date &&
      moment(userDetails.expiry_date).isAfter(moment()) &&
      userDetails.program_status === 1;

    // Set start_date
    const start_date = hasActiveProgram
      ? moment(userDetails.expiry_date)
          .add(1, "day")
          .format("YYYY-MM-DD HH:mm:ss")
      : moment().add(1, "day").format("YYYY-MM-DD HH:mm:ss");

    // Calculate expiry_date with program_duration and extra_validity
    const program_duration =
      parseInt(programSessionDetails[0].program_duration.split(" ")[0]) || 0;
    const extra_validity =
      parseInt(programSessionDetails[0].extra_validity) || 0;
    const expiry_date = moment(start_date)
      .add(program_duration, "days")
      .add(extra_validity, "days")
      .format("YYYY-MM-DD HH:mm:ss");


    // Insert into subOrderPrograms
    const discount = programSessionDetails[0].mrp - amount;
    const subOrderProgramInsertedResult = await insertRecord(
      tables.subOrderPrograms,
      [
        "order_id",
        "user_id",
        "program_id",
        "program_session_id",
        "program_type",
        "total_sessions",
        "pending_session",
        "mrp",
        "discount",
        "paid_amount",
        "program_status",
        "start_date",
        "expiry_date",
        "order_type",
      ],
      [
        orderDetailsInsertedResult.insertId,
        user_id,
        program_id,
        program_session_id,
        programDetails[0].program_category === "Basic Stack" ? 1 : 0,
        programSessionDetails[0].program_sessions,
        programSessionDetails[0].program_sessions,
        programSessionDetails[0].mrp,
        discount,
        amount,
        hasActiveProgram ? 4 : 1, // 4 (pending) if active program exists, else 1 (active)
        start_date,
        expiry_date,
        order_type,
      ]
    );

    if (subOrderProgramInsertedResult.affectedRows === 0) {
      throw new Error("Failed to insert sub order program details");
    }

    // Update suggested program
    const updatedSuggestedProgramResult = await updateRecord(
      tables.suggestedProgram,
      { payment_status: 1 },
      { suggested_program_id: userDetails.suggested_program_id }
    );
    await updateRecord(
      tables.userDetails,
      { suggested_program_id: null },
      { user_id: user_id }
    );
    if (updatedSuggestedProgramResult.affectedRows === 0) {
      throw new Error("Failed to update suggested program details");
    }

    // Update userDetails if applicable, conditionally setting active_order_id
    if (
      [
        "Lead",
        "Completed"
      ].includes(userDetails.user_status)
    ) {
      const updateUserData = {
        user_status: "Active",
        sub_user_status:
          programDetails[0].program_category === "Basic Stack" ||
          [1, 3].includes(program_duration)
            ? "Cleanse active"
            : "Active",
        user_type: "1",
        ...(hasActiveProgram
          ? {} // No active_order_id update if active program exists
          : { active_order_id: subOrderProgramInsertedResult.insertId }),
        enc_password: md5("123456"),
        plain_password: "123456",
        last_screen_visited: "program_details_info"
      };

      await updateRecord(tables.userDetails, updateUserData, { user_id });
    }
    const insertOrderLogResult = await insertOrderLog({
      user_id: user_id,
      order_id: orderDetailsInsertedResult.insertId,
      amount: amount,
      payment_for: "Program Purchase",
      src: "Razorpay",
    });
    return { success: true };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
export { handleServicePayment, handleProgramPayment, handleGuidePayment };
