import dotenv from "dotenv";
import { getTransporter } from "../config/mailConfig.js";
import nodemailer from "nodemailer";

dotenv.config();
const transporter = await getTransporter();
async function sendMailUtil({
  from,
  to,
  subject,
  text,
  html,
  cc,
  bcc,
  attachments,
  encoding,
  headers,
}) {
  let mailOptions = {
    from: from || process.env.MAIL_EMAIL_ID,
    to,
    cc: cc || "",
    bcc: bcc || "",
    subject,
    text,
    html,
    attachments,
    ...(encoding && { encoding }),
    ...(headers && { headers }),
  };
  if (Array.isArray(mailOptions.bcc)) {
    mailOptions.bcc.push("testerteam@balancenutrition.in");
  } else if (typeof mailOptions.bcc === "string") {
    mailOptions.bcc += "testerteam@balancenutrition.in";
  }
  if (process.env.NODE_ENV !== "production") {
    const testMessage = `<br/><br/>This email was sent in a non-production environment.<br/>
      Original To: ${mailOptions.to}<br/>
      CC: ${mailOptions.cc}<br/>
      BCC: ${mailOptions.bcc}`;
    mailOptions.to = "testerteam@balancenutrition.in";
    mailOptions.cc = "testerteam@balancenutrition.in";
    mailOptions.bcc = "testerteam@balancenutrition.in";
    mailOptions.html = (mailOptions.html || "") + testMessage;
  }
  try {
    console.log("Sending email with the following options:", mailOptions);
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
    return info;
  } catch (error) {
    console.error("Error sending email:", {
      message: error?.message,
      stack: error?.stack,
      to: mailOptions?.to,
      cc: mailOptions?.cc,
      bcc: mailOptions?.bcc,
      subject: mailOptions?.subject,
    });
    throw error;
  }
}

async function sendBulkMail({
  toList,
  from,
  cc = [],
  bcc = [],
  subject,
  text = "",
  html = "",
  attachments = [],
  batchSize = 10,
  delay = 10000,
}) {
  try {
    if (!from) {
      throw new Error("From email address is required");
    }
    if (!Array.isArray(toList) || toList.length === 0) {
      throw new Error("toList must be a non-empty array of emails");
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < toList.length; i += batchSize) {
      batches.push(toList.slice(i, i + batchSize));
    }

    // Process batches sequentially
    for (const [index, batch] of batches.entries()) {
      for (const recipient of batch) {
        await sendMailUtil({
          from,
          to: recipient, // 👈 only one recipient per mail
          cc,
          bcc,
          subject,
          text,
          html,
          attachments,
        });
        console.log(`📧 Mail sent to: ${recipient}`);
      }

      console.log(`✅ Batch ${index + 1} completed`);

      // Delay between batches (skip last)
      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return "done mail";
  } catch (err) {
    console.error("Bulk mail error:", err);
    throw err;
  }
}

export { sendMailUtil, sendBulkMail };
