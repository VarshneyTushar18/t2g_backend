import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // smtp.zoho.in
  port: Number(process.env.SMTP_PORT), // 465
  secure: true, // must be true for port 465
  auth: {
    user: process.env.SMTP_EMAIL, // career@tech2globe.com
    pass: process.env.SMTP_PASSWORD, // vttbSwHG7nUH
  },
});
