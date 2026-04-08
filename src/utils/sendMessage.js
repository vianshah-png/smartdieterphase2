import { client } from "../config/twilioConfig.js";
import "dotenv/config";

async function sendMessage({ to, body }) {
  const message = await client.messages.create({
    body: body,
    from: process.env.TWILIO_PHONE,
    to: to,
  });
  console.log(message, 11);
}

export { sendMessage };
