import axios from "axios";
import pool from "../../../config/db.js";
import { transporter } from "../../../utils/email.service.js";
import {
  sanitize,
  csvEscape,
  validateEmail,
  verifyTurnstile,
  getClientIp,
  LEAD_EMAILS,
} from "../lead.helpers.js";

const FORM_TYPE = "amazon_leads";
const BRAND_NAME = "Services4Amazon";
const THANK_YOU_URL =
  process.env.SERVICES4AMAZON_THANK_YOU_URL ||
  "https://www.services4amazon.com/thank-you.html";

const turnstileSecret = () =>
  process.env.SERVICES4AMAZON_TURNSTILE_SECRET ||
  process.env.AMAZON_LEADS_TURNSTILE_SECRET ||
  process.env.S4A_TURNSTILE_SECRET ||
  process.env.SERVICES4AMAZON_TURNSTILE_KEY ||
  process.env.TURNSTILE_SECRET_KEY ||
  process.env.TURNSTILE_SECRET ||
  null;

const buildFullName = (firstName, lastName) => {
  const parts = [sanitize(firstName), sanitize(lastName)].filter(Boolean);
  return parts.join(" ").trim();
};

const validatePhone = (phone) => {
  if (!phone) return false;
  const cleaned = String(phone).replace(/[\s-]/g, "");
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    return /^\d+$/.test(digits) && digits.length >= 5 && digits.length <= 15;
  }
  return /^\d+$/.test(cleaned) && cleaned.length >= 5 && cleaned.length <= 15;
};

const formatCountryFromGeo = (geo) => {
  if (!geo?.country_name) return null;
  // ipapi.co already returns calling codes with a leading "+", e.g. "+91"
  const callingCode = String(geo.country_calling_code || "").replace(/^\+/, "");
  const dialCode = callingCode ? ` (+${callingCode})` : "";
  return `${geo.country_name}${dialCode}`;
};

const lookupGeo = async (ip) => {
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return { location: "Unknown", country: null };
  }

  try {
    const { data: geo } = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 4000,
    });
    const location = `${geo.city || "-"}, ${geo.region || "-"}, ${geo.country_name || "-"}`;
    return { location, country: formatCountryFromGeo(geo) };
  } catch {
    return { location: "Unknown", country: null };
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const looksLikeUrl = (value) => /^https?:\/\/\S+/i.test(String(value || "").trim());

/** Prefer store_link; only use message as store link when it looks like a URL (keeps old text messages out of store_link). */
const resolveStoreLink = (body) => {
  const explicit = sanitize(body.store_link);
  if (explicit) return explicit;
  const message = sanitize(body.message);
  return looksLikeUrl(message) ? message : null;
};

const buildTeamEmailHtml = (lead) => {
  const storeLink = lead.store_link ? escapeHtml(lead.store_link) : "";
  return `
<div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">
  <div style="max-width:700px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">
    <h2 style="margin-top:0;color:#232F3E;">New ${BRAND_NAME} Lead</h2>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <p><strong>Name:</strong> ${escapeHtml(lead.name) || "-"}</p>
    <p><strong>Email:</strong> ${escapeHtml(lead.email) || "-"}</p>
    <p><strong>Phone:</strong> ${escapeHtml(lead.phone) || "-"}</p>
    <p><strong>Country:</strong> ${escapeHtml(lead.country) || "-"}</p>
    <p><strong>Amazon Store Link:</strong> ${
      storeLink ? `<a href="${storeLink}">${storeLink}</a>` : "-"
    }</p>
    <p><strong>Source:</strong> ${escapeHtml(lead.source_page) || "-"}</p>
    <p><strong>IP:</strong> ${escapeHtml(lead.ip) || "-"}</p>
    <p><strong>Location:</strong> ${escapeHtml(lead.location) || "-"}</p>
  </div>
</div>`;
};

export const createAmazonLead = async (req, res) => {
  try {
    const body = req.body || {};
    const captchaToken =
      body.captchaToken || body["cf-turnstile-response"] || "";
    const requireMessage =
      body.require_message === true ||
      body.require_message === "1" ||
      body.require_message === 1;

    const ip = getClientIp(req);
    const captcha = await verifyTurnstile(captchaToken, ip, turnstileSecret());
    if (!captcha.ok) {
      return res.status(400).json({
        success: false,
        errors: { captcha: captcha.message || "Captcha verification failed" },
      });
    }

    const errors = {};
    const firstName = sanitize(body.firstName);
    const lastName = sanitize(body.lastName);
    const email = sanitize(body.email)?.toLowerCase();
    const phone = sanitize(body.phone);
    const countrySelected = sanitize(body.country);
    const storeLink = resolveStoreLink(body);
    const messageInput = sanitize(body.message);
    const sourcePage = sanitize(body.source_page) || "";

    if (!firstName) errors.firstName = "Name is required";
    if (!email || !validateEmail(email)) errors.email = "Valid email is required";
    if (!validatePhone(phone)) errors.phone = "Enter a valid phone number";
    if (!countrySelected) errors.country = "Please select a country";
    if (requireMessage && !storeLink) {
      // Both keys so new (store_link) and older clients (message) show the error
      errors.store_link = "Amazon store link is required";
      errors.message = "Amazon store link is required";
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, errors });
    }

    // Keep message filled for admin/export compatibility; store_link holds the URL when present
    const message = storeLink || messageInput || "Free Amazon Audit Request";
    const name = buildFullName(firstName, lastName) || firstName;
    const geo = await lookupGeo(ip);
    // Prefer form selection; fall back to IP geo only when country wasn't provided
    const countryForRecord = countrySelected || geo.country;

    const [result] = await pool.execute(
      `INSERT INTO amazon_leads
       (name, email, country, phone, store_link, message, source_page, client_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, countryForRecord, phone, storeLink || null, message, sourcePage, ip],
    );

    const lead = {
      id: result.insertId,
      name,
      email,
      phone,
      store_link: storeLink,
      message,
      country: countryForRecord,
      location: geo.location,
      ip,
      source_page: sourcePage,
      form_type: FORM_TYPE,
      brand_name: BRAND_NAME,
    };

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: LEAD_EMAILS.join(","),
        replyTo: email,
        subject: `Enquiry from - services4amazon Page - ${name}`,
        html: buildTeamEmailHtml(lead),
      })
      .catch((err) => console.error("Amazon lead team mail failed:", err.message));

    transporter
      .sendMail({
        from: `"${BRAND_NAME}" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: `Thank You for Contacting ${BRAND_NAME}`,
        html: `
        <div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">
          <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">
            <h2 style="margin-top:0;color:#232F3E;">Thank You</h2>
            <p>Dear ${name},</p>
            <p>We have received your request. Our team will review your details and contact you shortly.</p>
            <p>Regards,<br/><strong>${BRAND_NAME} Team</strong></p>
          </div>
        </div>`,
      })
      .catch((err) => console.error("Amazon lead user mail failed:", err.message));

    return res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Lead created successfully",
      redirect: THANK_YOU_URL,
    });
  } catch (error) {
    console.error("AMAZON LEADS CREATE ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

const buildFilters = (query) => {
  const clauses = [];
  const params = [];
  const search = sanitize(query.search);

  if (search) {
    const like = `%${search}%`;
    clauses.push(`(
      name LIKE ? OR email LIKE ? OR phone LIKE ? OR country LIKE ? OR
      store_link LIKE ? OR message LIKE ? OR source_page LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like);
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

const mapListRow = (row) => {
  const storeLink = row.store_link || null;
  return {
    ...row,
    form_type: FORM_TYPE,
    lead_source: FORM_TYPE,
    store_link: storeLink,
    // Admin UI still reads `message`; prefer store_link when present
    message: storeLink || row.message || "Services4Amazon audit request",
  };
};

export const getAmazonLeads = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const offset = (page - 1) * limit;
    const { where, params } = buildFilters(req.query);

    const [rows] = await pool.query(
      `SELECT * FROM amazon_leads ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM amazon_leads ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: rows.map(mapListRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("AMAZON LEADS READ ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load submissions" });
  }
};

export const getAmazonLeadById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const [rows] = await pool.execute(`SELECT * FROM amazon_leads WHERE id = ?`, [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.json({ success: true, data: mapListRow(rows[0]) });
  } catch (error) {
    console.error("AMAZON LEADS READ ONE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};

export const exportAmazonLeads = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const [rows] = await pool.query(
      `SELECT * FROM amazon_leads ${where} ORDER BY id DESC LIMIT 10000`,
      params,
    );

    const headers = [
      "ID",
      "Name",
      "Email",
      "Country",
      "Phone",
      "Store Link",
      "Message",
      "Source Page",
      "Client IP",
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
          r.store_link,
          r.message,
          r.source_page,
          r.client_ip,
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
      `attachment; filename="amazon-leads-export-${stamp}.csv"`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("AMAZON LEADS EXPORT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
};

export const deleteAmazonLead = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false });

    const [result] = await pool.execute(`DELETE FROM amazon_leads WHERE id = ?`, [id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("AMAZON LEADS DELETE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};
