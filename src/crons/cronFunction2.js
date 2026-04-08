import axios from "axios";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import { sendMailUtil } from "../utils/sendEmail.js";
import moment from "moment";
import { getQueryTimeRange, readRecordNewForLead } from "../helper/common.js";
import { readPool } from "../config/dbConnection.js";
import { sendSSEEvent } from "../controllers/dashboardNotificationController.js";
import clientEnquiry from "../models/clientQueryModel.js";
const contentMap = {};
contentMap["7_days_before"] = ({ user }) => {
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "A Little Birthday Surprise from Balance Nutrition",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Birthday Surprise</title>
</head>
<body>
  <p>Hi ${user.name},</p>

  <p>I hope you're doing well!</p>

  <p>At Balance Nutrition (BN), we love celebrating milestones that matter and your birthday is one of them!</p>

  <p>To make your day extra special, we'd love to send you a healthy surprise hamper from our newly launched snack, breakfast & sweet range.</p>

  <p>Could you kindly share your full shipping address with the pincode so we can ensure your birthday gift reaches you right on time?</p>

  <p>
    Click <a href="https://balancenutrition.in/address-form?client_id=${user.user_id}">here</a> to update your details: 
  </p>

  <p>Wishing you a wonderful year ahead filled with good health, happiness, and balance.</p>

  <p>Warm regards,<br>
  Balance Nutrition Team</p>
</body>
</html>`,
    cc: [user.mentor_email, "accounts@balancenutrition.in"],
  };

  const watiTemplateData = {
    template_name: "birthday_address_7d",
    broadcast_name: "birthday_address_7d",
    parameters: [
      { name: "name", value: user.name },
      { name: "client_id", value: user.user_id },
    ],
  };

  const notificationId = 821;

  return {
    mail_data: mailData,
    wati_template_data: watiTemplateData,
    notification_id: notificationId,
  };
};

contentMap["6_days_before"] = ({ user }) => {
  const notificationId = 822;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};

contentMap["5_days_before"] = ({ user }) => {
  const notificationId = 823;
  return {
    notification_id: notificationId,
    mail_data: null,
    wati_template_data: null,
  };
};

contentMap["4_days_before"] = ({ user }) => {
  const notificationId = 824;
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "Just a Quick Reminder Your BN Birthday Gift Is Waiting!",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Your BN Birthday Hamper</title>
</head>
<body>
  <p>Hi ${user.name},</p>

  <p>Your BN Birthday Hamper is almost ready to ship — we just need your shipping address (with pincode) to make sure it reaches you before your big day!</p>

  <p>Each hamper is filled with our new snack, breakfast & sweet range — handpicked by Khyati to be healthy, tasty & perfect for every goal.</p>

  <p>
    Click <a href="https://balancenutrition.in/address-form?client_id=${user.user_id}">here</a> to update your details: 
  </p>

  <p>We can't wait to make your birthday a little sweeter and a lot healthier!</p>

  <p>Warm regards,<br>
  <strong>Team Balance Nutrition</strong></p>
</body>
</html>`,
  };
  const wati_template_data = {
    template_name: "birthday_address_4d",
    broadcast_name: "birthday_address_4d",
    parameters: [
      { name: "name", value: user.name },
      { name: "client_id", value: user.user_id },
    ],
  };
  return {
    notification_id: notificationId,
    mail_data: mailData,
    wati_template_data: wati_template_data,
  };
};
contentMap["3_days_before"] = ({ user }) => {
  const notificationId = 825;
  return {
    notification_id: notificationId,
    mail_data: null,
    wati_template_data: null,
  };
};

contentMap["2_days_before"] = ({ user }) => {
  const notificationId = 826;
  return {
    notification_id: notificationId,
    mail_data: null,
    wati_template_data: null,
  };
};

contentMap["1_day_before"] = ({ user }) => {
  const notificationId = 827;
  return {
    notification_id: notificationId,
    mail_data: null,
    wati_template_data: null,
  };
};
async function sendBirthDayHamperAddressNotification({
  daysBefore,
  addressReceived = true,
  content_key,
}) {
  try {
    if (!contentMap[content_key]) {
      console.error(`No content mapping found for key: ${content_key}`);
      return;
    }
    const { results } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.user_id",
        "cd.phone_number",
        "cd.email_id",
        "ad.email_id as mentor_email",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "LEFT",
          table: `(
        SELECT
            user_id,
            MAX(updated_date) AS latest_update
        FROM
            ${tables.assessment_personal_details}
        GROUP BY
            user_id
    ) latest`,
          on: "cd.user_id = latest.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: "aspd.user_id = latest.user_id AND aspd.updated_date = latest.latest_update",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
        ...(!addressReceived
          ? [
              {
                type: "INNER",
                table: `${tables.orderDetails} od`,
                on: `cd.user_id = od.user_id AND od.created_at = (SELECT MAX(created_at) FROM ${tables.orderDetails} WHERE user_id = cd.user_id)`,
              },
              {
                type: "INNER",
                table: `${tables.orderDetails} latest_od`,
                on: "od.order_id = latest_od.order_id",
              },
            ]
          : []),
      ],
      conditions: [
        {
          field: "cd.birth_date",
          operator: "IS NOT",
          value: "NULL",
          raw: true,
        },
        { field: "cd.birth_date", operator: "!=", value: "0000-00-00" },
        {
          field: "cd.user_status",
          operator: "IN",
          value: ["Active", "Completed"],
        },
        {
          field: "DATE_FORMAT(cd.birth_date, '%m-%d')",
          operator: "=",
          value: `DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL ${daysBefore} DAY), '%m-%d')`,
          raw: true,
        },
        {
          orConditions: [
            { field: "cd.country_id", operator: "=", value: 101 },
            {
              field: `aspd.country_of_residence`,
              operator: "=",
              value: 101,
              raw: true,
            },
            { field: "cd.phone_code", operator: "IN", value: ["+91", "91"] },
          ],
        },
        {
          field: "cd.mentor_assigned",
          operator: "NOT IN",
          value: [10, 196],
        },
        // {
        //   field: "cd.mentor_assigned",
        //   operator: "=",
        //   value: 196,
        // },
        {
          field: "cd.counsellor_assigned",
          operator: "NOT IN",
          value: [10, 196],
        },
        ...(!addressReceived
          ? [
              {
                orConditions: [
                  {
                    field: "LENGTH(latest_od.order_address)",
                    operator: "<",
                    value: 25,
                  },
                  {
                    field: "latest_od.order_address",
                    operator: "IS",
                    value: "NULL",
                    raw: true,
                  },
                ],
              },
              {
                field: "latest_od.pincode",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ]
          : []),
      ],
      groupBy: ["cd.user_id"],
    });
    console.log(results);
    // return;
    for (const user of results) {
      try {
        const { name, email_id, phone_number, user_id } = user;
        const { mail_data, wati_template_data, notification_id } = contentMap[
          content_key
        ]({ user });
        const tasks = [];

        if (mail_data && email_id) tasks.push(sendMailUtil(mail_data));
        if (wati_template_data && phone_number) {
          tasks.push(
            axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${phone_number.replace(
                /\D/g,
                "",
              )}`,
              {
                template_name: wati_template_data.template_name,
                broadcast_name: wati_template_data.broadcast_name,
                parameters: wati_template_data.parameters,
              },
            ),
          );
        }
        if (notification_id) {
          tasks.push(
            axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user_id],
                notification_id,
                sent_via: "cron",
              },
            ),
          );
        }

        await Promise.all(tasks);
      } catch (err) {
        console.error(`Error sending to user_id ${user.user_id}:`, err);
      }
    }
  } catch (error) {
    console.log(error);
  }
}

async function sendPostBirthDayHamperNotificationFirst() {
  try {
    const { results } = await readRecord({
      selectFields: [
        "cd.email_id",
        "COALESCE(cd.first_name,cd.last_name) AS name",
        "cd.user_id",
        "cd.phone_number",
        "ad.email_id AS mentor_email",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "po.status", operator: "=", value: "Delivered" },
        {
          field: "DATE(po.delivery_date) + INTERVAL 1 DAY",
          operator: "=",
          value: "DATE(CURDATE())",
          raw: true,
        },
        { field: "po.hamper_type", operator: "=", value: "birthday" },
      ],
    });
    console.log(results);
    // return;
    for (const user of results) {
      try {
        const tasks = [];
        if (user.email_id) {
          const mailData = {
            from: "Support <support@balancenutrition.in>",
            to: user.email_id,
            subject: "Hope You Loved Your BN Birthday Surprise!",
            html: `<p>Hi ${user.name},</p>

<p>I hope you enjoyed your Balance Nutrition Birthday Hamper  a little surprise from us to make your special day healthier and happier!</p>

<p>Each item in your box from snacks to sweets was crafted to be low in calories, high in protein, and perfect for your health goals.</p>

<p>We'd love to know what you liked best your feedback helps us create even better products and recommend the right ones for you.</p>

<p>And if you'd like to stock up or gift these to someone you love, explore our full BN Snack, Breakfast & Sweet Range here: <a href="https://balancenutrition.in/shop" style="color:#2b7de9; text-decoration:underline;"><b>Shop Now</b></a></p> 

<br>
<br>
<br>
<p>Warm regards,<br>
<strong>Balance Nutrition</strong></p>`,
            cc: [user.mentor_email, "account@balancenutrition.in"],
          };
          tasks.push(sendMailUtil(mailData));
        }
        if (user.phone_number) {
          tasks.push(
            axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${user.phone_number.replace(
                /\D/g,
                "",
              )}`,
              {
                template_name: "post_birthday_hamper_1_day_pack_of_3",
                broadcast_name: "post_birthday_hamper_1_day_pack_of_3",
                parameters: [{ name: "name", value: user.name }],
              },
            ),
          );
        }
        tasks.push(
          axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [user.user_id],
              notification_id: 850,
              sent_via: "cron",
            },
          ),
        );
        await Promise.all(tasks);
      } catch (error) {
        console.log("Error", error);
      }
    }
  } catch (error) {
    console.log(
      "Error while sending post birthday hamper notification 1st day",
      error,
    );
  }
}

async function sendPostBirthDayHamperNotificationFourth() {
  try {
    const { results } = await readRecord({
      selectFields: [
        "po.user_id",
        "COALESCE(cd.first_name,cd.last_name) as name",
        "cd.email_id as email_id",
        "ad.email_id as mentor_email",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "po.status", operator: "=", value: "Delivered" },
        {
          field: "DATE(po.delivery_date) + INTERVAL 4 DAY",
          operator: "=",
          value: "DATE(CURDATE())",
          raw: true,
        },
        { field: "po.hamper_type", operator: "=", value: "birthday" },
      ],
    });
    for (const user of results) {
      try {
        const tasks = [];
        if (user.email_id) {
          const mailData = {
            from: "Support <support@balancenutrition.in>",
            to: user.email_id,
            subject: "Hope You Loved Your BN Birthday Surprise!",
            html: `<p>Hi ${user.name},</p>

<p>I hope you enjoyed the Birthday Snack & Meal Hamper we sent from Balance Nutrition. We're so happy to be part of your special day and are thankful for all the lovely feedback we've received so far.</p>

<p>All the goodies inside are low in calories, high in protein, and suitable for diabetics, weight watchers, thyroid, peri-menopause, and fatty liver clients too.</p>

<p>Please feel free to visit the SHOP section on our website and place your orders here:<br>
<a href="https://balancenutrition.in/shop" style="color:#2b7de9; text-decoration:underline;">SHOP</a></p>

<p><strong>Here's a quick reminder of what you tried:</strong></p>

<ul>
  <li>
    <strong>Nippat</strong> - a light baked snack under 150 calories, perfect with your evening chai. 
    <a href="https://balancenutrition.in/shop/baked-nippat" style="color:#2b7de9; text-decoration:underline;">Order here</a>
  </li>
  <li>
    <strong>Makhana Chips</strong> - a smart swap for your chaat cravings. 
    <a href="https://balancenutrition.in/shop/makhana-chips" style="color:#2b7de9; text-decoration:underline;">Order here</a>
  </li>
  <li>
    <strong>Chocolate Cookies</strong> - 0 sugar, made to satisfy your sweet tooth while staying healthy. 
    <a href="https://balancenutrition.in/shop/dessert-cookies-chocolate" style="color:#2b7de9; text-decoration:underline;">Order here</a>
  </li>
  <!-- <li>
    <strong>Quicky Mix</strong> - a high-protein mix, ideal for breakfast or as a quick filler. 
    <a href="https://balancenutrition.in/shop/quicky" style="color:#2b7de9; text-decoration:underline;">Order here</a>
  </li>
  <li>
    <strong>Khatta Meetha Upma</strong> - a wholesome, healthier take on upma for mid-day meals. 
    <a href="https://balancenutrition.in/shop/khatta-meetha-quicky" style="color:#2b7de9; text-decoration:underline;">Order here</a>
  </li> -->
</ul>

<p>I'd love to know which ones you enjoyed most — your feedback helps us make every bite better.</p>
<br>
<br>
<br>
<p>Warm regards,<br>
<strong>Balance Nutrition</strong></p>
`,
            cc: [user.mentor_email, "account@balancenutrition.in"],
          };
          tasks.push(sendMailUtil(mailData));
        }
        await Promise.all(tasks);
      } catch (error) {
        console.log("Error", error);
      }
    }
  } catch (error) {
    console.log(
      "Error while sending post birthday hamper delivery notification 4th day",
    );
  }
}
async function sendPostBirthDayHamperNotificationSeventh() {
  try {
    const { results } = await readRecord({
      selectFields: [
        "po.user_id",
        "COALESCE(cd.first_name,cd.last_name) as name",
        "cd.email_id as email_id",
        "ad.email_id as mentor_email",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
        {
          type: "INNER",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "po.status", operator: "=", value: "Delivered" },
        {
          field: "DATE(po.delivery_date) + INTERVAL 7 DAY",
          operator: "=",
          value: "DATE(CURDATE())",
          raw: true,
        },
        { field: "po.hamper_type", operator: "=", value: "birthday" },
      ],
    });
    for (const user of results) {
      try {
        const tasks = [];
        if (user.email_id) {
          const mailData = {
            from: "Support <support@balancenutrition.in>",
            to: user.email_id,
            subject: "Hope You Loved Your BN Birthday Hamper",
            html: `<p>Hi ${user.name},</p>

<p>Just checking in — did you get a chance to try everything from your BN Birthday Hamper?<br>
We'd love to know which ones you enjoyed most!</p>

<p>Your feedback helps us personalise your future plans and improve every bite we create.</p>

<p>You can also reorder your favourites anytime from our BN Shop here:<br>
<a href="https://balancenutrition.in/shop" style="color:#2b7de9; text-decoration:underline;">Visit BN Shop</a></p>
<br>
<br>
<br>
<p>Warm regards,<br>
Team Balance Nutrition</p>
`,
            cc: [user.mentor_email, "account@balancenutrition.in"],
          };
          tasks.push(sendMailUtil(mailData));
        }
        await Promise.all(tasks);
      } catch (error) {
        console.log("Error", error);
      }
    }
  } catch (error) {
    console.log(
      "Error while sending post birthday hamper delivery notification 7th day",
    );
  }
}
const productWiseNotificationMap = {
  day_2: {
    notificationId: 851,
    dayOffset: 2,
  },
  day_3: {
    notificationId: 852,
    dayOffset: 3,
  },
  day_4: {
    notificationId: 853,
    dayOffset: 4,
  },
  // day_5: {
  //   notificationId: 854,
  //   dayOffset: 5,
  // },
  // day_6: {
  //   notificationId: 855,
  //   dayOffset: 6,
  // },
};
async function productWiseHamperNotification({ dayKey }) {
  try {
    const days_interval = productWiseNotificationMap[dayKey].dayOffset;
    console.log(days_interval);
    const { results } = await readRecord({
      selectFields: ["*"],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
      ],
      conditions: [
        { field: "po.status", operator: "=", value: "Delivered" },
        {
          field: `DATE(po.delivery_date) + INTERVAL ${days_interval} DAY`,
          operator: "=",
          value: "DATE(CURDATE())",
          raw: true,
        },
        { field: "po.hamper_type", operator: "=", value: "birthday" },
      ],
    });
    const user_ids = results.map((user) => user.user_id);
    console.log(user_ids);
    if (user_ids.length) {
      const { notificationId } = productWiseNotificationMap[dayKey];
      await axios.post(
        `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
        {
          user_ids: user_ids,
          notification_id: notificationId,
          sent_via: "cron",
        },
      );
    }
  } catch (error) {
    console.log("Error in product wise hamper notification", error);
  }
}

const generalContentMap = {};
generalContentMap["1_day_after"] = ({ user }) => {
  const notificationId = 873;
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "We'd Love to Send You a Little Surprise from Balance Nutrition",
    html: `<html>
  <body style="font-family: Arial, sans-serif; color: #333;">
    <p>Hi ${user.name},</p>

    <p>I hope you're doing well!</p>

    <p>At Balance Nutrition (BN), we love celebrating the little milestones that make our journey with you so special.</p>

    <p>As a small token of our appreciation, we're sending out an exclusive BN Gift Hamper to say thank you for being part of our BN family.</p>

    <p>Could you kindly share your full shipping address (with pincode) so we can ensure your surprise reaches you right on time.</p>

    <p>Just <a href="https://balancenutrition.in/address-form?client_id=${user.user_id}">Click here</a> to update your details.</p>

	<br>
    <br>
	<br>
    <p>Warm regards,<br>
    Balance Nutrition Team</p>
  </body>
</html>`,
    cc: [user.mentor_email, "account@balancenutrition.in"],
  };
  const watiTemplateData = {
    template_name: "general_address_1d",
    broadcast_name: "general_address_1d",
    parameters: [
      { name: "name", value: user.name },
      { name: "client_id", value: user.user_id },
    ],
  };
  return {
    mail_data: mailData,
    wati_template_data: watiTemplateData,
    notification_id: notificationId,
  };
};

generalContentMap["2_days_after"] = ({ user }) => {
  const notificationId = 874;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["3_days_after"] = ({ user }) => {
  const notificationId = 875;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["4_days_after"] = ({ user }) => {
  const notificationId = 878;
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "Just a Quick Reminder Your BN Gift Hamper Is Waiting!",
    html: `<html>
  <body style="font-family: Arial, sans-serif; color: #333;">
    
    <p>Hi ${user.name},</p>

    <p>Your Balance Nutrition Gift Hamper is ready and waiting!</p>

    <p>We'd love to send your healthy surprise your way — we just need your shipping address (with pincode) to make sure it reaches you on time.</p>

    <p>Each hamper is packed with our delicious new snack, breakfast & sweet range, made to keep you feeling light, happy & healthy!</p>

    <p>Click here to update your details: <a href="https://balancenutrition.in/address-form?client_id=${user.user_id}">https://balancenutrition.in/address-form?client_id=${user.user_id}</a></p>

	<br>
	<br>
	<br>
    <p>Warm regards,<br>
    Team Balance Nutrition</p>

  </body>
</html>`,
    cc: [user.mentor_email, "account@balancenutrition.in"],
  };
  const wati_template_data = {
    template_name: "general_address_4d",
    broadcast_name: "general_address_4d",
    parameters: [
      { name: "name", value: user.name },
      { name: "client_id", value: user.user_id },
    ],
  };
  return {
    mail_data: mailData,
    wati_template_data: wati_template_data,
    notification_id: notificationId,
  };
};
generalContentMap["5_days_after"] = ({ user }) => {
  const notificationId = 876;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["6_days_after"] = ({ user }) => {
  const notificationId = 877;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["7_days_after"] = ({ user }) => {
  const notificationId = 894;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["8_days_after"] = ({ user }) => {
  const notificationId = 900;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["9_days_after"] = ({ user }) => {
  const notificationId = 901;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["10_days_after"] = ({ user }) => {
  const notificationId = 902;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["11_days_after"] = ({ user }) => {
  const notificationId = 903;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["12_days_after"] = ({ user }) => {
  const notificationId = 904;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap["13_days_after"] = ({ user }) => {
  const notificationId = 905;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
async function sendGeneralHamperNotification({
  daysAfter,
  addressReceived = true,
  content_key,
}) {
  try {
    if (!generalContentMap[content_key]) {
      console.error(`No content mapping found for key: ${content_key}`);
      return;
    }
    const { results } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.user_id",
        "cd.phone_number",
        "cd.email_id",
        "ad.email_id as mentor_email",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `(
        SELECT
            user_id,
            MAX(updated_date) AS latest_update
        FROM
            ${tables.assessment_personal_details}
        GROUP BY
            user_id
    ) latest`,
          on: "cd.user_id = latest.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.assessment_personal_details} aspd`,
          on: "aspd.user_id = latest.user_id AND aspd.updated_date = latest.latest_update",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
        ...(!addressReceived
          ? [
              {
                type: "INNER",
                table: `${tables.orderDetails} od`,
                on: `cd.user_id = od.user_id AND od.created_at = (SELECT MAX(created_at) FROM ${tables.orderDetails} WHERE user_id = cd.user_id)`,
              },
              {
                type: "INNER",
                table: `${tables.orderDetails} latest_od`,
                on: "od.order_id = latest_od.order_id",
              },
            ]
          : []),
      ],
      conditions: [
        {
          field: `DATE(po.created_at + INTERVAL ${daysAfter} DAY)`,
          operator: "=",
          value: "DATE(CURDATE())",
          raw: true,
        },
        { field: "po.hamper_type", operator: "=", value: "general" },
        { field: "po.status", operator: "=", value: "Pending" },
        ...(!addressReceived
          ? [
              {
                orConditions: [
                  {
                    field: "LENGTH(latest_od.order_address)",
                    operator: "<",
                    value: 25,
                  },
                  {
                    field: "latest_od.order_address",
                    operator: "IS",
                    value: "NULL",
                    raw: true,
                  },
                ],
              },
              {
                field: "latest_od.pincode",
                operator: "IS",
                value: "NULL",
                raw: true,
              },
            ]
          : []),
      ],
      groupBy: ["cd.user_id"],
    });
    console.log(results);
    // return;
    for (const user of results) {
      try {
        const { email_id, phone_number, user_id } = user;
        const { mail_data, wati_template_data, notification_id } =
          generalContentMap[content_key]({ user });
        const tasks = [];

        if (mail_data && email_id) tasks.push(sendMailUtil(mail_data));
        if (wati_template_data && phone_number) {
          tasks.push(
            axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${phone_number.replace(
                /\D/g,
                "",
              )}`,
              {
                template_name: wati_template_data.template_name,
                broadcast_name: wati_template_data.broadcast_name,
                parameters: wati_template_data.parameters,
              },
            ),
          );
        }
        if (notification_id) {
          tasks.push(
            axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user_id],
                notification_id,
                sent_via: "cron",
              },
            ),
          );
        }
        await Promise.all(tasks);
      } catch (err) {
        console.error(`Error sending to user_id ${user.user_id}:`, err);
      }
    }
  } catch (error) {
    console.log("Error in general hamper notification", error);
  }
}

const generalContentMap2 = {};
generalContentMap2["1_day_after"] = ({ user }) => {
  const notificationId = 879;
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "Hope You Loved Your BN Gift Hamper",
    html: `<html>
  <body style="font-family: Arial, sans-serif; color: #333;">

    <p>Hi ${user.name},</p>

    <p>Just checking in — have you tried all the goodies from your BN Gift Hamper yet?<br>
    We'd really love to hear which ones were your favourites.</p>

    <p>Your feedback helps us personalise your future plans and improve every bite we create.</p>

    <p>You can also reorder your favourites anytime from our BN Shop here: <a href="https://balancenutrition.in/shop
">https://balancenutrition.in/shop</a></p>
<br>
<br>
<br>
	<p>Warm regards,<br>
  Balance Nutrition Team</p>
  </body>
</html>`,
    cc: [user.mentor_email, "accounts@balancenutrition.in"],
  };
  return {
    mail_data: mailData,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap2["3_days_after"] = ({ user }) => {
  const notificationId = 880;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap2["4_days_after"] = ({ user }) => {
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "Hope You Enjoyed Your BN Gift Hamper",
    html: `<html>
  <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">

    <p>Hi ${user.name},</p>

    <p>I hope you enjoyed the BN Gift Snack & Meal Hamper we sent from Balance Nutrition.</p>

    <p>All the goodies inside are low in calories, high in protein, and suitable for diabetics, weight watchers, thyroid, peri-menopause, and fatty liver clients too.</p>

    <p>
      Please feel free to visit the SHOP section on our website and place your orders here: 
      <a href="https://balancenutrition.in/shop">SHOP</a>
    </p>

    <p>Here's a quick reminder of what you tried:</p>

    <ul>
      <li>
        <strong>Nippat</strong> - a light baked snack under 150 calories, perfect with your evening chai. 
        <a href="https://balancenutrition.in/shop/baked-nippat">Order here</a>
      </li>
      <li>
        <strong>Makhana Chips</strong> - a smart swap for your chaat cravings. 
        <a href="https://balancenutrition.in/shop/makhana-chips">Order here</a>
      </li>
      <li>
        <strong>Chocolate Cookies</strong> - 0 sugar, made to satisfy your sweet tooth while staying healthy. 
        <a href="https://balancenutrition.in/shop/dessert-cookies-chocolate">Order here</a>
      </li>
    </ul>

    <p>I'd love to know which ones you enjoyed most — your feedback helps us make every bite better.</p>

  </body>
</html>`,
    cc: [user.mentor_email, "accounts@balancenutrition.in"],
  };
  return {
    mail_data: mailData,
    wati_template_data: null,
    notification_id: null,
  };
};
generalContentMap2["5_days_after"] = ({ user }) => {
  const notificationId = 881;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};
generalContentMap2["6_days_after"] = ({ user }) => {
  const notificationId = 882;
  return {
    mail_data: null,
    wati_template_data: null,
    notification_id: notificationId,
  };
};

generalContentMap2["7_days_after"] = ({ user }) => {
  const mailData = {
    from: "Support <support@balancenutrition.in>",
    to: user.email_id,
    subject: "Hope You Loved Your BN Gift Hamper!",
    html: `<html>
  <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">

    <p>Hi ${user.name},</p>

    <p>I hope you enjoyed your Balance Nutrition Gift Hamper, a little surprise from us.</p>

<p>Each item in your box, from snacks to sweets, is low in calories, high in protein, and perfect for your health goals.</p>

    <p>We'd love to know what you liked best. Your feedback helps us create even better products and recommend the right ones for you.</p>

    <p>
      And if you'd like to stock up or gift these to someone you love, explore our full BN Snack, Breakfast & Sweet Range here: 
      <a href="https://balancenutrition.in/shop">https://balancenutrition.in/shop</a>
    </p>

  </body>
</html>`,
  };
  return {
    mail_data: mailData,
    wati_template_data: null,
    notification_id: null,
  };
};

async function postDeliveryGeneralHamperNotification({
  daysAfter,
  content_key,
}) {
  try {
    const { results } = await readRecord({
      selectFields: [
        "cd.email_id",
        "COALESCE(cd.first_name,cd.last_name) AS name",
        "cd.user_id",
        "cd.phone_number",
        "ad.email_id AS mentor_email",
      ],
      table: `${tables.productOrders} po`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "po.user_id = cd.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.adminUsers} ad`,
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        { field: "po.status", operator: "=", value: "Delivered" },
        {
          field: `DATE(po.delivery_date) + INTERVAL ${daysAfter} DAY`,
          operator: "=",
          value: "DATE(CURDATE())",
          raw: true,
        },
        { field: "po.hamper_type", operator: "=", value: "general" },
      ],
    });
    console.log(results);
    // return;
    for (const user of results) {
      try {
        const { email_id, phone_number, user_id } = user;
        const { mail_data, wati_template_data, notification_id } =
          generalContentMap2[content_key]({ user });
        const tasks = [];
        if (mail_data && email_id) tasks.push(sendMailUtil(mail_data));
        if (wati_template_data && phone_number) {
          tasks.push(
            axios.post(
              `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=91${phone_number.replace(
                /\D/g,
                "",
              )}`,
              {
                template_name: wati_template_data.template_name,
                broadcast_name: wati_template_data.broadcast_name,
                parameters: wati_template_data.parameters,
              },
            ),
          );
        }
        if (notification_id) {
          tasks.push(
            axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user_id],
                notification_id,
                sent_via: "cron",
              },
            ),
          );
        }
        await Promise.all(tasks);
      } catch (error) {
        console.log("Error", error);
      }
    }
  } catch (error) {
    console.log(
      "Error while sending post birthday hamper notification 1st day",
      error,
    );
  }
}

async function birthdayHamperNotification() {
  try {
    const { results } = await readRecord({
      selectFields: [
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.user_id",
        "po.status",
      ],
      table: `${tables.userDetails} cd`,
      joins: [
        {
          type: "INNER",
          table: `${tables.productOrders} po`,
          on: "cd.user_id = po.user_id",
        },
      ],
      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        {
          field: `DATE_FORMAT(cd.birth_date, '%m-%d')`,
          operator: "=",
          value: "DATE_FORMAT(CURDATE(), '%m-%d')",
          raw: true,
        },
        {
          field: "po.hamper_type",
          operator: "=",
          value: "birthday",
        },
        {
          field: "DATE(po.created_at)",
          operator: "BETWEEN",
          value: [
            `${moment().subtract(8, "days").format("YYYY-MM-DD")}`,
            `${moment().format("YYYY-MM-DD")}`,
          ],
        },
      ],
    });
    const tasks = [];
    const deliveredUserIds = results
      .filter((r) => r.status === "Delivered")
      .map((r) => r.user_id);
    const inProgressUserIds = results
      .filter((r) => r.status !== "Delivered")
      .map((r) => r.user_id);
    if (deliveredUserIds.length) {
      tasks.push(
        axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: deliveredUserIds,
            notification_id: 947,
            sent_via: "cron",
          },
        ),
      );
    }
    if (inProgressUserIds.length) {
      tasks.push(
        axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: inProgressUserIds,
            notification_id: 948,
            sent_via: "cron",
          },
        ),
      );
    }
    await Promise.all(tasks);
  } catch (error) {
    console.log("Error in birthday hamper notification", error);
  }
}

const onholdContentMap = {};
onholdContentMap["3_days_before"] = ({ user }) => {
  const notificationId = 976;
  return {
    notification_id: notificationId,
  };
};

onholdContentMap["2_days_before"] = ({ user }) => {
  const notificationId = 977;
  return {
    notification_id: notificationId,
  };
};

onholdContentMap["1_day_before"] = ({ user }) => {
  const notificationId = 978;
  const mailData = null;
  return {
    notification_id: notificationId,
    mail_data: mailData,
  };
};

onholdContentMap["today"] = ({ user }) => {
  const notificationId = 979;
  const mailData = {
    from: "Support <support@example.com>",
    to: user.email_id,
    cc: [user.mentor_email],
    subject: "Your Program Resumes Today. Here's What's Next",
    html: `<html>
  <body style="font-family: Arial, sans-serif; font-size: 15px; color: #333; line-height: 1.6;">
    
    <p>Dear <strong>${user.name}</strong>,</p>

    <p>Welcome back! We hope this break gave you the time and space you needed.</p>

    <p>Here's a quick overview of your program details:</p>

    <ul>
      <li><strong>Break Started:</strong> ${user.break_start_date}</li>
      <li><strong>Break Ended:</strong> ${user.break_end_date}</li>
      <li><strong>Sessions Pending:</strong> ${user.pending_session}</li>
      <li><strong>Validity Remaining:</strong> ${user.validity_remaining} Days</li>
    </ul>

    <p>
      To restart smoothly, please update your current weight today. 
      This helps us customize your next plan and schedule your diet session right away.
    </p>

    <p>
      <strong>You can update your weight directly here:</strong>
      <a href="https://www.balancenutrition.in/app_link/screen_id=1002" style="color: #0073e6; text-decoration: underline;">Update Weight</a>
    </p>

    <p>
      Once updated, your mentor will reach out to you and help you ease into the next phase of your journey.
    </p>

  </body>
</html>`,
  };
  return {
    notification_id: notificationId,
    mail_data: mailData,
  };
};

async function sendEmergencyOnholdReminderNotification({
  content_key,
  daysBefore,
}) {
  try {
    const { results } = await readRecord({
      selectFields: [
        "cd.user_id",
        "DATE_FORMAT(ohc.start_date,'%d-%m-%Y') as break_start_date",
        "DATE_FORMAT(ohc.end_date,'%d-%m-%Y') as break_end_date",
        "cd.email_id",
        "ad.email_id as mentor_email",
        "sop.pending_session",
        "DATEDIFF(sop.expiry_date,CURDATE()) as validity_remaining",
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
      ],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "ohc.user_id = cd.user_id",
        },
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "INNER",
          on: "ohc.sub_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.adminUsers} ad`,
          type: "LEFT",
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: `CURDATE() + INTERVAL ${daysBefore} DAY`,
          operator: "=",
          value: "ohc.end_date",
          raw: true,
        },
        {
          field: "ohc.onhold_reason",
          operator: "=",
          value: "Personal Emergency",
        },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: "ohc.created_at",
          operator: "=",
          value: `(SELECT MAX(created_at) FROM ${tables.onholdClients} WHERE user_id = cd.user_id)`,
          raw: true,
        },
      ],
    });
    console.log(results);
    // return;
    for (const user of results) {
      try {
        const { notification_id, mail_data } = onholdContentMap[content_key]({
          user,
        });
        const tasks = [];
        if (mail_data && user.email_id) {
          tasks.push(sendMailUtil(mail_data));
        }
        if (notification_id) {
          tasks.push(
            axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user.user_id],
                notification_id,
                sent_via: "cron",
              },
            ),
          );
        }
        await Promise.all(tasks);
      } catch (error) {
        console.error(
          `Error sending notifications for user ${user.user_id}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error(
      `Error fetching users for content key ${content_key}:`,
      error,
    );
  }
}

const onholdODContentMap = {};
onholdODContentMap["1_day_after"] = ({ user }) => {
  const notificationId = 981;
  const mailData = null;
  return {
    notification_id: notificationId,
    mail_data: mailData,
  };
};

onholdODContentMap["2_days_after"] = ({ user }) => {
  const notificationId = 982;
  const mailData = {
    from: "Support <support@example.com>",
    to: user.email_id,
    cc: [user.mentor_email],
    subject: "Don't Miss Out on Your Pending Sessions!",
    html: `<html>
  <body style="font-family: Arial, sans-serif; font-size: 15px; color: #333; line-height: 1.6;">

    <p>Hi <strong>${user.name}</strong>,</p>

    <p>Your break has ended, but you haven't restarted yet. Don't lose valuable days or sessions.</p>

    <p>Here are your current details:</p>

    <ul>
      <li><strong>Break Started:</strong> ${user.break_start_date}</li>
      <li><strong>Break Ended:</strong> ${user.break_end_date}</li>
      <li><strong>Break Overdue By:</strong> ${user.break_overdue_by} Days</li>
      <li><strong>Sessions Pending:</strong> ${user.pending_session}</li>
    </ul>

    <p>
      To resume your program smoothly, please update your current weight today. 
      This will help us customize your next plan and support you based on your current requirements.
    </p>

    <p>
      Update your weight now using the BN App: 
      <a href="https://www.balancenutrition.in/app_link/screen_id=1002" style="color: #0073e6; text-decoration: underline;">Update Weight</a>
    </p>

    <p>
      The sooner you update, the more time you'll have to make progress toward your goals—don't let your validity slip away.
    </p>

    <p>Wishing you strength and a smooth restart ahead!</p>

  </body>
</html>`,
  };
  return {
    notification_id: notificationId,
    mail_data: mailData,
  };
};

onholdODContentMap["3_days_after"] = ({ user }) => {
  const notificationId = 983;
  const mailData = null;
  return {
    notification_id: notificationId,
    mail_data: mailData,
  };
};

async function sendEmergencyOnholdODNotification({
  content_key,
  intervalType,
  interval,
}) {
  try {
    const { results: breaks } = await readRecord({
      selectFields: [
        "ohc.user_id",
        "DATE_FORMAT(ohc.start_date,'%d-%m-%Y') as break_start_date",
        "DATE_FORMAT(ohc.end_date,'%d-%m-%Y') as break_end_date",
        "CONCAT(COALESCE(ud.first_name,''),' ',COALESCE(ud.last_name,'')) as name",
        "ud.email_id",
        "sop.pending_session",
        "DATE_FORMAT(sop.expiry_date,'%d-%m-%Y') as expiry_date",
        `(SELECT ad.email_id FROM ${tables.adminUsers} ad WHERE ad.admin_user_id = ud.mentor_assigned) as mentor_email`,
        `DATEDIFF(CURDATE(),ohc.end_date) as break_overdue_by`,
      ],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "LEFT",
          table: `${tables.userDetails} ud`,
          on: "ohc.user_id = ud.user_id",
        },
        {
          type: "LEFT",
          table: `${tables.subOrderPrograms} sop`,
          on: "ud.active_order_id = sop.sub_order_id",
        },
      ],
      conditions: [
        {
          field: `ohc.end_date + INTERVAL ${interval} ${intervalType}`,
          operator: "=",
          value: `CURDATE()`,
          raw: true,
        },
        { field: "ud.user_status", operator: "=", value: "Active" },
        { field: "ud.sub_user_status", operator: "=", value: "Onhold" },
        {
          field: `ohc.id = ( SELECT MAX(id) FROM onhold_clients WHERE user_id = ohc.user_id)`,
          operator: "",
          value: "",
          raw: true,
        },
        {
          field: "ohc.onhold_reason",
          operator: "=",
          value: "Personal Emergency",
        },
      ],
    });
    console.log(breaks);
    // return;
    for (const user of breaks) {
      try {
        const { notification_id, mail_data } = onholdODContentMap[content_key]({
          user,
        });
        const tasks = [];
        if (notification_id) {
          tasks.push(
            axios.post(
              `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
              {
                user_ids: [user.user_id],
                notification_id,
                sent_via: "cron",
              },
            ),
          );
        }
        if (mail_data && user.email_id) {
          tasks.push(sendMailUtil(mail_data));
        }
        await Promise.all(tasks);
      } catch (error) {
        console.error("Error fetching on-hold clients:", error);
      }
    }
  } catch (error) {
    console.error("Error fetching on-hold clients:", error);
  }
}

// sendEmergencyOnholdODNotification({
//   content_key: "3_days_after",
//   intervalType: "DAY",
//   interval: 3,
// });

async function sendEmergencyOnholdWeeklyNotification({ notificationId }) {
  try {
    const { results } = await readRecord({
      selectFields: [
        "cd.user_id",
        "ohc.start_date as break_start_date",
        "ohc.end_date as break_end_date",
        "cd.email_id",
        "ad.email_id as mentor_email",
        "sop.pending_session",
        "DATEDIFF(sop.expiry_date,CURDATE()) as validity_remaining",
      ],
      table: `${tables.onholdClients} ohc`,
      joins: [
        {
          type: "INNER",
          table: `${tables.userDetails} cd`,
          on: "ohc.user_id = cd.user_id",
        },
        {
          table: `${tables.subOrderPrograms} sop`,
          type: "INNER",
          on: "ohc.sub_order_id = sop.sub_order_id",
        },
        {
          table: `${tables.adminUsers} ad`,
          type: "LEFT",
          on: "cd.mentor_assigned = ad.admin_user_id",
        },
      ],
      conditions: [
        {
          field: "ohc.onhold_reason",
          operator: "=",
          value: "Personal Emergency",
        },
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
        { field: "cd.mentor_assigned", operator: "=", value: 196 },
        { field: "cd.sub_user_status", operator: "=", value: "Onhold" },
      ],
    });
    console.log(results);
    const tasks = [];
    const userIds = results.map((r) => r.user_id);
    if (notificationId && userIds.length) {
      tasks.push(
        axios.post(
          `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
          {
            user_ids: userIds,
            notification_id: notificationId,
            sent_via: "cron",
          },
        ),
      );
    }
    await Promise.all(tasks);
  } catch (error) {
    console.error(
      `Error fetching users for content key ${content_key}:`,
      error,
    );
  }
}

async function updateAccountsDbReport(date) {
  try {
    const month = moment(date).format("MM");
    const year = moment(date).format("YYYY");
    // const date = moment(date).format("YYYY-MM-DD");
    const startDate = moment(date).startOf("month").format("YYYY-MM-DD");
    const endDate = moment(date).endOf("month").format("YYYY-MM-DD");
    const { results: leadsThisMonth } = await readRecord({
      selectFields: [
        "COUNT(DISTINCT cd.phone_number) as overall_lead",
        "COUNT(DISTINCT CASE WHEN cd.sub_sales_status != 'Discard' THEN cd.phone_number ELSE NULL END) as relevant_lead",
      ],
      table: `${tables.userDetails} cd`,
      conditions: [
        {
          field: "DATE(cd.added_date)",
          operator: "BETWEEN",
          value: [startDate, endDate],
        },
        { field: "cd.counsellor_assigned", operator: "!=", value: 196 },
      ],
    });
    // console.log(leadsThisMonth, 1759);
    const [revenueThisMonth] =
      await readPool.query(`SELECT (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.sale_by != 196
    ) AS total_sales,

    -- ORDER TYPE TOTALS
    (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type = 'Renewal'
       AND od.sale_by != 196
    ) AS total_renewal_sales,

    (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type IN ('New','Referral','OCR')
       AND od.sale_by != 196
    ) AS total_new_ref_ocr_sales,

    (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type IN ('New','Upgrade')
       AND od.sale_by != 196
    ) AS total_sales_from_leads,

    (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     JOIN users_details ud ON ud.user_id = od.user_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND ud.primary_lead_source IN (22,23)
       AND od.sale_by != 196
    ) AS total_sales_from_referrals,

    (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type = 'OCR'
       AND od.sale_by != 196
    ) AS total_ocr_sales,

    (SELECT SUM(od.order_paid_amount + od.order_balance_amount)
     FROM order_details od
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type = 'Upgrade'
       AND od.sale_by != 196
    ) AS total_upgrade_sales,

    -- UNIT COUNTS (now correct)
    (SELECT COUNT(DISTINCT sop.sub_order_id)
     FROM sub_orders_programs sop
     JOIN order_details od ON od.order_id = sop.order_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.sale_by != 196
    ) AS total_units,

    (SELECT COUNT(DISTINCT sop.sub_order_id)
     FROM sub_orders_programs sop
     JOIN order_details od ON od.order_id = sop.order_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type IN ('New','Upgrade')
       AND sop.order_type IN ('New','Upgrade')
       AND od.sale_by != 196
    ) AS total_units_from_leads,

    (SELECT COUNT(DISTINCT sop.sub_order_id)
     FROM sub_orders_programs sop
     JOIN order_details od ON od.order_id = sop.order_id
     JOIN users_details ud ON ud.user_id = od.user_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND ud.primary_lead_source IN (22,23)
       AND od.sale_by != 196
    ) AS total_units_from_referrals,

    (SELECT COUNT(DISTINCT sop.sub_order_id)
     FROM sub_orders_programs sop
     JOIN order_details od ON od.order_id = sop.order_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type = 'Renewal'
       AND sop.order_type = 'Renewal'
       AND od.sale_by != 196
    ) AS total_renewal_units,

    (SELECT COUNT(DISTINCT sop.sub_order_id)
     FROM sub_orders_programs sop
     JOIN order_details od ON od.order_id = sop.order_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type = 'OCR'
       AND sop.order_type = 'OCR'
       AND od.sale_by != 196
    ) AS total_ocr_units,

    (SELECT COUNT(DISTINCT sop.sub_order_id)
     FROM sub_orders_programs sop
     JOIN order_details od ON od.order_id = sop.order_id
     WHERE DATE(od.order_date) BETWEEN '${startDate}' AND '${endDate}'
       AND od.order_type = 'Upgrade'
       AND sop.order_type = 'Upgrade'
       AND od.sale_by != 196
    ) AS total_upgrade_units;`);
    console.log(revenueThisMonth);
    // const totalSales = parseFloat(revenueThisMonth[0].total_sales) || 0;
    const totalUnits = revenueThisMonth[0].total_units || 0;
    const formattedDate = new Date();
    console.log(month, 1804);
    formattedDate.setMonth(parseInt(month) - 1);
    formattedDate.setFullYear(parseInt(year));
    formattedDate.setDate(parseInt(moment(date).format("YY")) + 1);
    formattedDate.setHours(0, 0, 0, 0);
    console.log(date, formattedDate);
    const data = {
      overall_leads: leadsThisMonth[0].overall_lead,
      relevant_leads: leadsThisMonth[0].relevant_lead,
      total_new_upgrade_sale: {
        ol_units: revenueThisMonth[0].total_units_from_leads,
        ol_percentage: revenueThisMonth[0].overall_lead_conversions
          ? (
              (revenueThisMonth[0].overall_lead_conversions / totalUnits) *
              100
            ).toFixed(2)
          : "0.00",
        rl_percentage: revenueThisMonth[0].relevant_lead_conversions
          ? (
              (revenueThisMonth[0].relevant_lead_conversions / totalUnits) *
              100
            ).toFixed(2)
          : "0.00",
        amount: parseInt(revenueThisMonth[0].total_sales_from_leads) || 0,
      },
      referrals: {
        units: revenueThisMonth[0].total_units_from_referrals,
        percentage_of_client_base: 0,
        amount: parseInt(revenueThisMonth[0].total_sales_from_referrals) || 0,
      },
      renewals: {
        overall_expiries: 0,
        advance_purchase: 0,
        actual_expiry: 0,
        units: revenueThisMonth[0].total_renewal_units,
        percentage: "0.00%",
        amount: parseInt(revenueThisMonth[0].total_renewal_sales) || 0,
      },
      ocr: {
        oc_total_base: 0,
        units: revenueThisMonth[0].total_ocr_units,
        percentage_of_client_base: 0,
        amount: parseInt(revenueThisMonth[0].total_ocr_sales) || 0,
      },
      upgrade: {
        units: revenueThisMonth[0].total_upgrade_units,
        amount: parseInt(revenueThisMonth[0].total_upgrade_sales) || 0,
      },
      total_sales: {
        units: totalUnits,
        amount: parseInt(revenueThisMonth[0].total_sales) || 0,
      },
      total_new_ref_ocr:
        parseInt(revenueThisMonth[0].total_new_ref_ocr_sales) || 0,
      year: "25-26",
      month: formattedDate,
      actual_client_base: 0,
    };
    const finalData = {
      report_name: "sales data report",
      report_data: JSON.stringify(data),
      month: moment(date).format("MM-YY"),
    };
    if (moment(date).format("DD") === "01") {
      const insertResult = await insertRecord(
        tables.accountsDashboardReports,
        Object.keys(finalData),
        Object.values(finalData),
      );
    } else {
      const updateResult = await updateRecord(
        tables.accountsDashboardReports,
        { month: moment(date).format("MM-YY") },
        finalData,
      );
    }
  } catch (error) {
    console.log(error);
  }
}

const milestoneNotificationContentMap = {
  milestone_10: {
    1: ({ user }) => {
      const notificationId = 1029;
      const mailData = {
        from: "",
        to: user.email_id,
        subject: "Congratulations on Your Milestone",
        html: `<p>Hi <strong>${user.name}</strong>,</p>

<p>
  <strong>Heartiest congratulations</strong> on achieving your milestone!  
  We're truly so proud of the consistency and dedication you've shown on your journey.  
  Watching your progress unfold has been nothing short of inspiring.
</p>

<p>
  We'd love to feature your transformation so it can motivate others who are just beginning their journey.  
  To allow us to feature your journey and inspire others, we request you to kindly fill the <a href="https://balancenutrition.in/success-story-upload/${user.user_id}/10">permission form</a>.
</p>

<p>
  As a small token of appreciation, <strong>Team BN</strong> will be sending you a  
  <strong>FREE Healthy Snack Hamper</strong>.
</p>

<p>
  Warm regards,<br>
  <strong>Team Balance Nutrition</strong>
</p>`,
      };
      const watiTemplateData = {
        template_name: "milestone_10_kg_day_1",
        broadcast_name: "milestone_10_kg_day_1",
        parameters: [
          { name: "name", value: user.name },
          {
            name: "client_id_milestone_kg",
            value: user.user_id.toString() + "/10",
          },
        ],
      };
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
    2: ({ user }) => {
      const notificationId = 1030;
      const mailData = null;
      const watiTemplateData = null;
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
    3: ({ user }) => {
      const notificationId = 1031;
      const mailData = null;
      const watiTemplateData = null;
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
    4: ({ user }) => {
      const notificationId = 1032;
      const mailData = {
        from: "",
        to: user.email_id,
        subject: "A Gentle Reminder to Fill the Permission Form",
        html: `<p>Hi <strong>${user.name}</strong>,</p>

<p>
Hope you're doing well. Just checking in again to say how proud we still are of your progress —  
it truly reflects the effort you've been putting in.
</p>

<p>
  To help us celebrate your journey and inspire others, we request you to please complete the  
  <a href="https://balancenutrition.in/success-story-upload/${user.user_id}/10">permission form</a> and upload your transformation photos/videos.
</p>

<p>
  As a small token of appreciation, we'll be sending you a  
  <strong>FREE Healthy Snack Hamper</strong> filled with our BN snacks &amp; treats.
</p>

<p>
  Warm regards,<br>
  <strong>Team Balance Nutrition</strong>
</p>
`,
      };
      const watiTemplateData = {
        template_name: "milestone_10_kg_day_4",
        broadcast_name: "milestone_10_kg_day_4",
        parameters: [
          { name: "name", value: user.name },
          {
            name: "client_id_milestone_kg",
            value: user.user_id.toString() + "/10",
          },
        ],
      };
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
    5: ({ user }) => {
      const notificationId = 1033;
      const mailData = null;
      const watiTemplateData = null;
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
    6: ({ user }) => {
      const notificationId = 1034;
      const mailData = null;
      const watiTemplateData = null;
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
    7: ({ user }) => {
      const notificationId = 1035;
      const mailData = null;
      const watiTemplateData = null;
      return {
        mail_data: mailData,
        wati_template_data: watiTemplateData,
        notification_id: notificationId,
      };
    },
  },
};

function categorizeUsers(users) {
  const categorizedUsers = {};
  for (const user of users) {
    const bucket = user.milestone_bucket;
    if (bucket) {
      if (!categorizedUsers[bucket]) {
        categorizedUsers[bucket] = [];
      }
      categorizedUsers[bucket].push(user);
    }
  }
  return categorizedUsers;
}

async function sendMilestoneDataFormNotification() {
  try {
    // 1️⃣ Fetch eligible users
    const { results } = await readRecordNewForLead({
      withQueries: [
        {
          name: "latest_weight",
          query: `(
            SELECT 
              wr.user_id,
              wr.weight,
              wr.posted_date,
              ROW_NUMBER() OVER (PARTITION BY wr.user_id ORDER BY wr.posted_date DESC) rn
            FROM ${tables.weightRecords} wr
            INNER JOIN ${tables.userDetails} cd ON wr.user_id = cd.user_id
            WHERE cd.user_status = 'Active'
              AND cd.mentor_assigned = 196
          )`,
        },
        {
          name: "oldest_weight",
          query: `(
            SELECT 
              wr.user_id,
              wr.weight,
              ROW_NUMBER() OVER (PARTITION BY wr.user_id ORDER BY wr.posted_date ASC) rn
            FROM ${tables.weightRecords} wr
            INNER JOIN ${tables.userDetails} cd ON wr.user_id = cd.user_id
            WHERE cd.user_status = 'Active'
              AND cd.mentor_assigned = 196
          )`,
        },
      ],

      selectFields: [
        "cd.user_id",
        "(ow.weight - lw.weight) AS total_weight_loss",
        `
        CASE
          WHEN (ow.weight - lw.weight) >= 20 THEN 20
          WHEN (ow.weight - lw.weight) >= 17 THEN 17
          WHEN (ow.weight - lw.weight) >= 15 THEN 15
          WHEN (ow.weight - lw.weight) >= 12 THEN 12
          WHEN (ow.weight - lw.weight) >= 10 THEN 10
          ELSE NULL
        END AS milestone_bucket
        `,
        "DATEDIFF(CURDATE(), lw.posted_date) AS reminder_days",
        "CONCAT(COALESCE(cd.first_name,''),' ',COALESCE(cd.last_name,'')) as name",
        "cd.email_id",
        "cd.phone_code",
        "cd.phone_number",
        "ow.weight AS starting_weight",
        "lw.weight AS latest_weight",
        "lw.posted_date AS latest_weight_date",
      ],

      table: `${tables.userDetails} cd`,

      joins: [
        {
          type: "INNER",
          table: "oldest_weight ow",
          on: "cd.user_id = ow.user_id AND ow.rn = 1",
        },
        {
          type: "INNER",
          table: "latest_weight lw",
          on: "cd.user_id = lw.user_id AND lw.rn = 1",
        },
        {
          type: "LEFT",
          table: `${tables.milestoneFormData} mfd`,
          on: `
            cd.user_id = mfd.user_id
            AND mfd.milestone_weight_kg = (
              CASE
                WHEN (ow.weight - lw.weight) >= 20 THEN 20
                WHEN (ow.weight - lw.weight) >= 17 THEN 17
                WHEN (ow.weight - lw.weight) >= 15 THEN 15
                WHEN (ow.weight - lw.weight) >= 12 THEN 12
                WHEN (ow.weight - lw.weight) >= 10 THEN 10
              END
            )
          `,
        },
      ],

      conditions: [
        { field: "cd.user_status", operator: "=", value: "Active" },
        { field: "cd.mentor_assigned", operator: "=", value: 196 },
        { field: "mfd.id", operator: "IS", value: "NULL", raw: true },
        {
          field: "(ow.weight - lw.weight)",
          operator: ">=",
          value: 10,
        },
        {
          field: "DATEDIFF(CURDATE(), lw.posted_date)",
          operator: ">=",
          value: 1,
        },
        {
          field: "DATEDIFF(CURDATE(), lw.posted_date)",
          operator: "<=",
          value: 7,
        },
      ],
    });

    // 2️⃣ Categorize users by milestone bucket
    const usersByMilestone = categorizeUsers(results);
    console.log(usersByMilestone, 2143);
    // return;
    // 3️⃣ Helper to send notification per user
    async function processUserNotification(user, milestoneBucket) {
      const content =
        milestoneNotificationContentMap?.[`milestone_${milestoneBucket}`]?.[
          user.reminder_days
        ];

      if (!content) return;

      const { mail_data, wati_template_data, notification_id } = content({
        user,
      });
      const tasks = [];

      if (user.email_id && mail_data) {
        tasks.push(sendMailUtil(mail_data));
      }

      if (user.phone_code && user.phone_number && wati_template_data) {
        const phone = `${user.phone_code}${user.phone_number}`.replace(
          /\D/g,
          "",
        );
        tasks.push(
          axios.post(
            `${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=${phone}`,
            {
              template_name: wati_template_data.template_name,
              broadcast_name: wati_template_data.broadcast_name,
              parameters: wati_template_data.parameters,
            },
          ),
        );
      }

      if (notification_id) {
        tasks.push(
          axios.post(
            `${process.env.SERVER_URL}/api/v1/notifications/send-notification-separately`,
            {
              user_ids: [user.user_id],
              notification_id,
              sent_via: "cron",
            },
          ),
        );
      }

      await Promise.allSettled(tasks);
    }

    // 4️⃣ Iterate over buckets and send notifications in parallel
    for (const [bucket, users] of Object.entries(usersByMilestone)) {
      await Promise.all(
        users.map((user) => processUserNotification(user, bucket)),
      );
    }
  } catch (error) {
    console.log("Error while sending sendMilestoneDataFormNotification", error);
  }
}

// sendMilestoneDataFormNotification();

async function sendClaraActivityPopUp() {
  try {
    const { results } = await readRecord({
      selectFields: ["ad.admin_user_id"],
      table: `${tables.adminUsers} ad`,
      conditions: [
        { field: "ad.role_id", operator: "IN", value: [1, 2] },
        { field: "ad.is_active", operator: "=", value: 1 },
      ],
    });
    console.log(results, 2188);
    const { start_time, end_time } = getQueryTimeRange();

    for (const admin of results) {
      try {
        const claraUserIdDocs = await clientEnquiry.aggregate([
          {
            $match: {
              type: "clara",
              mentor_id: admin.admin_user_id,
              createdAt: { $gte: start_time, $lte: end_time },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$user_id",
              latestDoc: { $first: "$$ROOT" },
            },
          },
          { $project: { _id: 1 } },
        ]);

        const claraUserIds = claraUserIdDocs.map((doc) => doc._id.toString());
        console.log(claraUserIds, admin.admin_user_id);
        // continue;
        if (claraUserIds.length > 0) {
          const { results: filteredUsers } = await readRecord({
            table: `${tables.userDetails} ud`,
            conditions: [
              {
                field: "ud.user_status",
                operator: "IN",
                value: ["Active", "Completed"],
              },
              {
                field: "ud.mentor_assigned",
                operator: "=",
                value: admin.admin_user_id,
              },
              {
                field: "ud.user_id",
                operator: "IN",
                value: claraUserIds,
              },
            ],
          });
          console.log(filteredUsers.length, admin.admin_user_id);
          // continue;
          if (filteredUsers.length > 0) {
            const data = {
              title: "Clara activity detected",
              description:
                "Clara assisted these users during non-working hours. Review the interaction to provide the next steps.",
              redirect: "/",
              priority: 1,
            };

            sendSSEEvent({
              mentor_id: admin.admin_user_id,
              data,
            });
          }
        }
      } catch (error) {
        console.log(
          "Error in sending clara activity pop up for admin:",
          admin.admin_user_id,
          error,
        );
      }
    }
  } catch (error) {
    console.log(error);
  }
}
// sendClaraActivityPopUp();
export {
  birthdayHamperNotification,
  generalContentMap,
  sendClaraActivityPopUp,
  sendBirthDayHamperAddressNotification,
  sendPostBirthDayHamperNotificationFirst,
  sendPostBirthDayHamperNotificationFourth,
  sendPostBirthDayHamperNotificationSeventh,
  productWiseHamperNotification,
  sendGeneralHamperNotification,
  postDeliveryGeneralHamperNotification,
  sendEmergencyOnholdODNotification,
  sendEmergencyOnholdReminderNotification,
  sendEmergencyOnholdWeeklyNotification,
  sendMilestoneDataFormNotification,
  updateAccountsDbReport,
};
