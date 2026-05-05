// controllers/lead.controller.js

import pool from "../../config/db.js";
import { transporter } from "../../utils/email.service.js";
import axios from "axios";

// ================= COMMON HELPERS =================

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const sanitize = (value) => (value ? String(value).trim() : null);

// ================= HR EMAIL LIST =================

const HR_EMAILS = process.env.OWNER_EMAILS
  ? process.env.OWNER_EMAILS.split(",").map((e) => e.trim())
  : [process.env.SMTP_EMAIL];

// ================= CREATE LEAD =================

export const createLead = async (req, res) => {
  try {
    const { captchaToken } = req.body;

    // ===== CAPTCHA CHECK =====
    if (!captchaToken) {
      return res.status(400).json({
        success: false,
        message: "Captcha required",
      });
    }

    const verifyResponse = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: captchaToken,
        remoteip: req.ip,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!verifyResponse.data.success) {
      return res.status(400).json({
        success: false,
        message: "Captcha verification failed",
      });
    }

    let { name, email, country, phone, message, form_type, source_page } =
      req.body;

    // ===== VALIDATION ====
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (!phone && !message) {
      return res.status(400).json({
        success: false,
        message: "Either phone or message is required",
      });
    }

    // ===== SANITIZATION =====
    name = sanitize(name);
    email = sanitize(email)?.toLowerCase();
    country = sanitize(country);
    phone = sanitize(phone);
    message = sanitize(message);
    form_type = sanitize(form_type);
    source_page = sanitize(source_page);

    // ===== DB INSERT =====
    const [result] = await pool.execute(
      `
      INSERT INTO leads 
      (name, email, country, phone, message, form_type, source_page)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [name, email, country, phone, message, form_type, source_page],
    );

    // ================= MAIL 1: TO HR TEAM =================
    // FROM: career@tech2globe.com
    // TO:   career@tech2globe.com, hr@tech2globe.com, rathiishita2004@gmail.com
    // replyTo: user's email so HR can reply directly to user

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: HR_EMAILS.join(","),
        replyTo: email,
        subject: `New Lead Inquiry - ${name}`,
        html: `
          <h3>New Lead Received</h3>
          <br>
          <b>Contact Details:</b><br>
          Name: ${name}<br>
          Email: ${email}<br>
          Phone: ${phone || "-"}<br>
          Country: ${country || "-"}<br><br>

          <b>Message:</b><br>
          ${message || "-"}<br><br>

          <b>Additional Info:</b><br>
          Source Page: ${source_page || "-"}<br>
          Form Type: ${form_type || "-"}<br>
        `,
      })
      .then((info) => console.log("HR mail sent:", info.messageId))
      .catch((err) => console.error("HR mail failed:", err.message));

    // ================= MAIL 2: TO USER (confirmation) =================
    // FROM: career@tech2globe.com
    // TO:   user's submitted email

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: "Thank You for Contacting Tech2Globe",
        html: `
          Dear ${name},<br><br>
          Thank you for reaching out to us.<br>
          We have received your inquiry and our team will get back to you shortly.<br><br>
          <b>Your Submitted Details:</b><br>
          Name: ${name}<br>
          Phone: ${phone || "-"}<br>
          Country: ${country || "-"}<br>
          Regards,<br>
          <b>Tech2Globe Team</b>
        `,
      })
      .then((info) =>
        console.log("User confirmation mail sent:", info.messageId),
      )
      .catch((err) =>
        console.error("User confirmation mail failed:", err.message),
      );

    // ===== RESPONSE =====
    return res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Lead created successfully",
    });
  } catch (error) {
    console.error("CREATE ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ================= GET ALL LEADS =================

export const getLeads = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const [rows] = await pool.execute(
      `
      SELECT id, name, email, country, phone, message, form_type, source_page, created_at
      FROM leads
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [limit, offset],
    );

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) as total FROM leads`,
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("READ ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};

// ================= GET LEAD BY ID =================

export const getLeadById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const [rows] = await pool.execute(`SELECT * FROM leads WHERE id = ?`, [id]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("READ ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false });

    const [result] = await pool.execute(`DELETE FROM leads WHERE id = ?`, [id]);

    if (!result.affectedRows) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};
