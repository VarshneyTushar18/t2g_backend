import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpUser = (process.env.SMTP_EMAIL || process.env.EMAIL_USER || "").trim();
const smtpPass = (process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD || "").trim();
const testTo = (process.env.TEST_EMAIL || smtpUser).trim();

console.log("SMTP_HOST:", smtpHost);
console.log("SMTP_PORT:", smtpPort);
console.log("SMTP_USER:", smtpUser);
console.log("TEST_EMAIL:", testTo);

async function sendTestMail() {
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.verify();
    console.log("SMTP is working ✅");

    const info = await transporter.sendMail({
      from: `"Tech2Globe Test" <${smtpUser}>`,
      to: testTo,
      subject: "Test Email",
      text: "Nodemailer is working successfully",
    });

    console.log("Mail sent:", info.messageId);
  } catch (error) {
    console.error("Error:", error);
  }
}

sendTestMail();