import nodemailer from "nodemailer";
import { google } from "googleapis";
import "dotenv/config";

const oAuthClient = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);

oAuthClient.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

export async function getTransporter() {
  const accessToken = await oAuthClient.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.MAIL_EMAIL_ID,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
}

export const getTfacTransporter = () => {
  return nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: "info@teesforacause.co",
    pass: process.env.TFAC_APP_PASSWORD, // Google App Password
  },
});
}

