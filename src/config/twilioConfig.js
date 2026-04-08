import { configDotenv } from "dotenv";
import twilio from "twilio";
configDotenv();
const client = twilio(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

export { client };
