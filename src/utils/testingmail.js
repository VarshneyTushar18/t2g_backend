import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function sendTestMail() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.verify();
    console.log("SMTP is working ✅");

    const info = await transporter.sendMail({
      from: `"Tech2Globe Test" <${process.env.SMTP_EMAIL}>`,
      to: process.env.TEST_EMAIL,
      subject: "Test Email",
      text: "Nodemailer is working successfully",
    });

    console.log("Mail sent:", info.messageId);
  } catch (error) {
    console.error("Error:", error);
  }
}


console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);

sendTestMail();