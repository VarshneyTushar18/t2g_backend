// controllers/lead.controller.js

import pool from "../../config/db.js";
import { transporter } from "../../utils/email.service.js";
import axios from "axios";
import {
  getShopifyIntakes,
  getShopifyIntakeById,
  exportShopifyIntakes,
  deleteShopifyIntake,
} from "./shopify-intake/shopifyIntake.controller.js";
import {
  getAmazonOnboardings,
  getAmazonOnboardingById,
  exportAmazonOnboardings,
  deleteAmazonOnboarding,
} from "./amazon-onboarding/amazonOnboarding.controller.js";
import {
  getAmazonLeads,
  getAmazonLeadById,
  exportAmazonLeads,
  deleteAmazonLead,
} from "./amazon-leads/amazonLeads.controller.js";

// ================= COMMON HELPERS =================

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const sanitize = (value) => (value ? String(value).trim() : null);

const formatCountryFromGeo = (geo) => {
  if (!geo?.country_name) return null;
  const dialCode = geo.country_calling_code
    ? ` (+${geo.country_calling_code})`
    : "";
  return `${geo.country_name}${dialCode}`;
};

const normalizeCountryName = (value) => {
  if (!value) return "";
  const name = String(value)
    .replace(/\s*\(\+\d+\)\s*$/g, "")
    .trim()
    .toLowerCase();

  const aliases = {
    usa: "united states",
    uae: "united arab emirates",
    uk: "united kingdom",
  };

  return aliases[name] || name;
};

const countriesMatch = (formCountry, geoCountryName) => {
  if (!formCountry || !geoCountryName) return false;
  const formName = normalizeCountryName(formCountry);
  const geoName = normalizeCountryName(geoCountryName);
  return (
    formName === geoName ||
    geoName.includes(formName) ||
    formName.includes(geoName)
  );
};

// ================= LEAD EMAIL LIST =================

const LEAD_EMAILS = ["info@tech2globe.com", "enquiries@tech2globe.net"];

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

    // ===== VALIDATION =====

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

    // ===== CLIENT IP =====

    const ip =
      req.headers["cf-connecting-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    // ===== LOCATION LOOKUP =====

    let location = "Unknown";
    let geo = null;
    let countryFromIp = null;

    try {
      const geoResponse = await axios.get(
        `https://ipapi.co/${ip}/json/`,
      );

      geo = geoResponse.data;

      location = `${geo.city || "-"}, ${geo.region || "-"}, ${geo.country_name || "-"}`;
      countryFromIp = formatCountryFromGeo(geo);
    } catch (error) {
      console.log("Geo lookup failed:", error.message);
    }

    const countrySelected = country;
    const countryForRecord = countryFromIp || countrySelected;
    const countryMismatch =
      countrySelected &&
      countryFromIp &&
      !countriesMatch(countrySelected, geo?.country_name);

    // ===== DB INSERT =====

    const [result] = await pool.execute(
      `
      INSERT INTO leads 
      (name, email, country, phone, message, form_type, source_page)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        email,
        countryForRecord,
        phone,
        message,
        form_type,
        source_page,
      ],
    );

    // ================= MAIL 1: TO LEAD TEAM =================

    const teamMailSubject =
      form_type === "amazon_ads"
        ? "Enquiry From Google Ads"
        : `New Lead Inquiry - ${name}`;

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: LEAD_EMAILS.join(","),
        replyTo: email,
        subject: teamMailSubject,

        html: `
        <div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">

          <div style="max-width:700px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">

            <h2 style="margin-top:0;color:#111;">
              ${form_type === "amazon_ads" ? "Enquiry From Google Ads" : "New Lead Inquiry"}
            </h2>

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />

            <h3 style="margin-bottom:15px;color:#222;">
              Contact Details
            </h3>

            <p><strong>Name:</strong> ${name}</p>

            <p>
              <strong>Email:</strong>
              <a href="mailto:${email}">
                ${email}
              </a>
            </p>

            <p><strong>Phone:</strong> ${phone || "-"}</p>

            <p><strong>Country:</strong> ${countryForRecord || "-"}</p>

            ${
              countryMismatch
                ? `<p><strong>Country (form selection):</strong> ${countrySelected}</p>`
                : ""
            }

            <p><strong>Location:</strong> ${location}</p>

            <p><strong>Sender IP:</strong> ${ip}</p>

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />

            <h3 style="margin-bottom:15px;color:#222;">
              Message
            </h3>

            <p style="line-height:1.7;">
              ${message || "-"}
            </p>

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />

            <h3 style="margin-bottom:15px;color:#222;">
              Additional Information
            </h3>

            <p>
              <strong>Source Page:</strong>
              <a href="${source_page}">
                ${source_page || "-"}
              </a>
            </p>

            <p><strong>Form Type:</strong> ${form_type || "-"}</p>

            <p><strong>Submitted At:</strong> ${new Date().toLocaleString()}</p>

          </div>

        </div>
        `,
      })
      .then((info) => console.log("Lead mail sent:", info.messageId))
      .catch((err) => console.error("Lead mail failed:", err.message));

    // ================= MAIL 2: TO USER =================

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: "Thank You for Contacting Tech2Globe",

        html: `
        <div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">

          <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">

            <h2 style="margin-top:0;color:#111;">
              Thank You for Contacting Us
            </h2>

            <p>
              Dear ${name},
            </p>

            <p style="line-height:1.7;">
              Thank you for reaching out to Tech2Globe.
              We have received your inquiry successfully and our team will contact you shortly.
            </p>

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />

            <h3>Your Submitted Details</h3>

            <p><strong>Name:</strong> ${name}</p>

            <p><strong>Email:</strong> ${email}</p>

            <p><strong>Phone:</strong> ${phone || "-"}</p>

            <p><strong>Country:</strong> ${countrySelected || countryForRecord || "-"}</p>

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />

            <p>
              Regards,<br />
              <strong>Tech2Globe Team</strong>
            </p>

          </div>

        </div>
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

// ================= LEAD LIST FILTERS =================

const buildLeadFilters = (query) => {
  const clauses = [];
  const params = [];

  const search = sanitize(query.search);
  if (search) {
    const like = `%${search}%`;
    clauses.push(
      `(name LIKE ? OR email LIKE ? OR phone LIKE ? OR message LIKE ? OR country LIKE ? OR source_page LIKE ? OR form_type LIKE ?)`,
    );
    params.push(like, like, like, like, like, like, like);
  }

  const formType = sanitize(query.form_type);
  if (formType) {
    clauses.push(`form_type = ?`);
    params.push(formType);
  }

  const dateFrom = sanitize(query.date_from);
  const dateTo = sanitize(query.date_to);
  if (dateFrom) {
    clauses.push(`DATE(created_at) >= ?`);
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push(`DATE(created_at) <= ?`);
    params.push(dateTo);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
};

// ================= GET ALL LEADS =================

export const getLeads = async (req, res) => {
  if (sanitize(req.query.form_type) === "shopify_intake") {
    return getShopifyIntakes(req, res);
  }
  if (sanitize(req.query.form_type) === "amazon_onboarding") {
    return getAmazonOnboardings(req, res);
  }
  if (sanitize(req.query.form_type) === "amazon_leads") {
    return getAmazonLeads(req, res);
  }

  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const offset = (page - 1) * limit;
    const { where, params } = buildLeadFilters(req.query);

    const [rows] = await pool.query(
      `
      SELECT id, name, email, country, phone, message, form_type, source_page, created_at
      FROM leads
      ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM leads ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("READ ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load leads" });
  }
};

// ================= EXPORT LEADS (CSV) =================

const csvEscape = (value) => {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const exportLeads = async (req, res) => {
  if (sanitize(req.query.form_type) === "shopify_intake") {
    return exportShopifyIntakes(req, res);
  }
  if (sanitize(req.query.form_type) === "amazon_onboarding") {
    return exportAmazonOnboardings(req, res);
  }
  if (sanitize(req.query.form_type) === "amazon_leads") {
    return exportAmazonLeads(req, res);
  }

  try {
    const { where, params } = buildLeadFilters(req.query);
    const maxRows = 10000;

    const [rows] = await pool.query(
      `
      SELECT id, name, email, country, phone, message, form_type, source_page, created_at
      FROM leads
      ${where}
      ORDER BY id DESC
      LIMIT ?
      `,
      [...params, maxRows],
    );

    const headers = [
      "ID",
      "Name",
      "Email",
      "Country",
      "Phone",
      "Message",
      "Form Type",
      "Source Page",
      "Created At",
    ];

    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.id,
          r.name,
          r.email,
          r.country,
          r.phone,
          r.message,
          r.form_type,
          r.source_page,
          r.created_at,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];

    const csv = `\uFEFF${lines.join("\n")}`;
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads-export-${stamp}.csv"`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("EXPORT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
};

// ================= GET LEAD BY ID =================

export const getLeadById = async (req, res) => {
  if (sanitize(req.query.form_type) === "shopify_intake") {
    return getShopifyIntakeById(req, res);
  }
  if (sanitize(req.query.form_type) === "amazon_onboarding") {
    return getAmazonOnboardingById(req, res);
  }
  if (sanitize(req.query.form_type) === "amazon_leads") {
    return getAmazonLeadById(req, res);
  }

  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const [shopifyRows] = await pool.execute(
      `SELECT * FROM shopify_intake_leads WHERE id = ?`,
      [id],
    );
    if (shopifyRows.length) {
      return getShopifyIntakeById(req, res);
    }

    const [amazonRows] = await pool.execute(
      `SELECT * FROM amazon_onboarding_leads WHERE id = ?`,
      [id],
    );
    if (amazonRows.length) {
      return getAmazonOnboardingById(req, res);
    }

    const [s4aRows] = await pool.execute(`SELECT * FROM amazon_leads WHERE id = ?`, [id]);
    if (s4aRows.length) {
      return getAmazonLeadById(req, res);
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

    const [shopifyRows] = await pool.execute(
      `SELECT id FROM shopify_intake_leads WHERE id = ?`,
      [id],
    );
    if (shopifyRows.length) {
      return deleteShopifyIntake(req, res);
    }

    const [amazonRows] = await pool.execute(
      `SELECT id FROM amazon_onboarding_leads WHERE id = ?`,
      [id],
    );
    if (amazonRows.length) {
      return deleteAmazonOnboarding(req, res);
    }

    const [s4aRows] = await pool.execute(`SELECT id FROM amazon_leads WHERE id = ?`, [id]);
    if (s4aRows.length) {
      return deleteAmazonLead(req, res);
    }

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
