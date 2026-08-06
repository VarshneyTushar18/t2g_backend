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
  // ipapi.co already returns calling codes with a leading "+", e.g. "+91"
  const callingCode = String(geo.country_calling_code || "").replace(/^\+/, "");
  const dialCode = callingCode ? ` (+${callingCode})` : "";
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

const LEAD_EMAILS = ["info@tech2globe.com", "enquiries@tech2globe.com"];

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

    let {
      name,
      email,
      country,
      phone,
      message,
      form_type,
      source_page,
      company,
      website,
      marketplaces,
      spend_band,
      role,
    } = req.body;

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

    if (!phone && !message && form_type !== "amazon_ads") {
      return res.status(400).json({
        success: false,
        message: "Either phone or message is required",
      });
    }

    if (form_type === "amazon_ads" && !phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
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
    company = sanitize(company);
    website = sanitize(website);
    spend_band = sanitize(spend_band);
    role = sanitize(role);

    const marketplacesText = Array.isArray(marketplaces)
      ? marketplaces.map((item) => sanitize(item)).filter(Boolean).join(", ")
      : sanitize(marketplaces);

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
    // Prefer the form selection; fall back to IP geo only when country wasn't provided
    const countryForRecord = countrySelected || countryFromIp;
    const countryMismatch =
      countrySelected &&
      countryFromIp &&
      !countriesMatch(countrySelected, geo?.country_name);

    // ===== DB INSERT =====

    const [result] = await pool.execute(
      `
      INSERT INTO leads 
      (name, email, country, phone, company, website, marketplaces, spend_band, role, message, form_type, source_page)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        email,
        countryForRecord,
        phone,
        company,
        website,
        marketplacesText,
        spend_band,
        role,
        message,
        form_type,
        source_page,
      ],
    );

    // ================= MAIL 1: TO LEAD TEAM =================

    const spendLabel = spend_band ? ` [${spend_band}]` : "";
    const companyLabel = company ? ` - ${company}` : "";
    const teamMailSubject =
      form_type === "amazon_ads"
        ? `Enquiry From Google Ads${companyLabel}${spendLabel}`
        : `New Lead Inquiry - ${name}`;

    const amazonQualificationHtml =
      form_type === "amazon_ads"
        ? `
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />

            <h3 style="margin-bottom:15px;color:#222;">
              Brand Qualification
            </h3>

            <p><strong>Company / Brand:</strong> ${company || "-"}</p>
            <p><strong>Website / Storefront:</strong> ${
              website
                ? `<a href="${website}">${website}</a>`
                : "-"
            }</p>
            <p><strong>Marketplaces:</strong> ${marketplacesText || "-"}</p>
            <p><strong>Monthly ad spend / revenue:</strong> ${spend_band || "-"}</p>
            <p><strong>Role:</strong> ${role || "-"}</p>
          `
        : "";

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
                ? `<p><strong>Country (IP detected):</strong> ${countryFromIp}</p>`
                : ""
            }

            <p><strong>Location:</strong> ${location}</p>

            <p><strong>Sender IP:</strong> ${ip}</p>

            ${amazonQualificationHtml}

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />

            <h3 style="margin-bottom:15px;color:#222;">
              Message
            </h3>

            <p style="line-height:1.7;">
              ${(message || "-").replace(/\n/g, "<br/>")}
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

            ${
              form_type === "amazon_ads"
                ? `
            <p><strong>Company / Brand:</strong> ${company || "-"}</p>
            <p><strong>Website / Storefront:</strong> ${website || "-"}</p>
            <p><strong>Marketplaces:</strong> ${marketplacesText || "-"}</p>
            <p><strong>Monthly ad spend / revenue:</strong> ${spend_band || "-"}</p>
            <p><strong>Role:</strong> ${role || "-"}</p>
                `
                : ""
            }

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
      `(name LIKE ? OR email LIKE ? OR phone LIKE ? OR message LIKE ? OR country LIKE ? OR source_page LIKE ? OR form_type LIKE ? OR company LIKE ? OR website LIKE ? OR marketplaces LIKE ? OR spend_band LIKE ? OR role LIKE ?)`,
    );
    params.push(like, like, like, like, like, like, like, like, like, like, like, like);
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
      SELECT id, name, email, country, phone, company, website, marketplaces, spend_band, role, message, form_type, source_page, created_at
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
      SELECT id, name, email, country, phone, company, website, marketplaces, spend_band, role, message, form_type, source_page, created_at
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
      "Company",
      "Website",
      "Marketplaces",
      "Spend Band",
      "Role",
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
          r.company,
          r.website,
          r.marketplaces,
          r.spend_band,
          r.role,
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

// ================= DASHBOARD STATS =================

const buildDateOnlyFilters = (query) => {
  const clauses = [];
  const params = [];
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
  return { clauses, params };
};

const withWhere = (extraClauses = [], baseClauses = []) => {
  const all = [...baseClauses, ...extraClauses];
  return all.length ? `WHERE ${all.join(" AND ")}` : "";
};

const countFromTable = async (table, dateFilters, extraClauses = [], extraParams = []) => {
  const where = withWhere(extraClauses, dateFilters.clauses);
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${table} ${where}`,
    [...dateFilters.params, ...extraParams],
  );
  return Number(total) || 0;
};

export const getLeadStats = async (req, res) => {
  try {
    const dateFilters = buildDateOnlyFilters(req.query);
    const formTypeFilter = sanitize(req.query.form_type);

    // When a specific landing form is requested, only query that table.
    if (formTypeFilter === "shopify_intake") {
      const total = await countFromTable("shopify_intake_leads", dateFilters);
      const byCompany = await companyBreakdown(
        "shopify_intake_leads",
        "business_name",
        dateFilters,
      );
      const uniqueCompanies = await uniqueCompanyCount(
        "shopify_intake_leads",
        "business_name",
        dateFilters,
      );
      const uniqueCountries = await uniqueCountryCount("shopify_intake_leads", dateFilters);
      const byCountry = await countryBreakdown("shopify_intake_leads", dateFilters);
      const byDay = await dayBreakdown("shopify_intake_leads", dateFilters);
      const byMonth = await monthBreakdown("shopify_intake_leads", dateFilters);
      const bySourcePage = await sourcePageBreakdown("shopify_intake_leads", dateFilters);
      const recentLeads = await fetchRecentFromTable(
        "shopify_intake_leads",
        dateFilters,
        "id, name, email, business_name AS business_name, country, source_page, created_at",
        "shopify_intake",
        12,
      );
      const period = await periodTotals("shopify_intake_leads", dateFilters);
      const totals = { ...period, total, uniqueCompanies, uniqueCountries };
      return res.json(
        buildStatsResponse({
          totals,
          byFormType: [{ key: "shopify_intake", count: total }],
          byCompany,
          byCountry,
          byDay,
          byMonth,
          bySourcePage,
          recentLeads,
        }),
      );
    }

    if (formTypeFilter === "amazon_onboarding") {
      const total = await countFromTable("amazon_onboarding_leads", dateFilters);
      const byCompany = await companyBreakdown(
        "amazon_onboarding_leads",
        "company_name",
        dateFilters,
      );
      const uniqueCompanies = await uniqueCompanyCount(
        "amazon_onboarding_leads",
        "company_name",
        dateFilters,
      );
      const byCountry = [];
      const byDay = await dayBreakdown("amazon_onboarding_leads", dateFilters);
      const byMonth = await monthBreakdown("amazon_onboarding_leads", dateFilters);
      const bySourcePage = await sourcePageBreakdown("amazon_onboarding_leads", dateFilters);
      const recentLeads = await fetchRecentFromTable(
        "amazon_onboarding_leads",
        dateFilters,
        "id, contact_person AS name, email, company_name, NULL AS country, source_page, created_at",
        "amazon_onboarding",
        12,
      );
      const period = await periodTotals("amazon_onboarding_leads", dateFilters);
      const totals = {
        ...period,
        total,
        uniqueCompanies,
        uniqueCountries: 0,
      };
      return res.json(
        buildStatsResponse({
          totals,
          byFormType: [{ key: "amazon_onboarding", count: total }],
          byCompany,
          byCountry,
          byDay,
          byMonth,
          bySourcePage,
          recentLeads,
        }),
      );
    }

    if (formTypeFilter === "amazon_leads") {
      const total = await countFromTable("amazon_leads", dateFilters);
      const byCompany = [];
      const uniqueCountries = await uniqueCountryCount("amazon_leads", dateFilters);
      const byCountry = await countryBreakdown("amazon_leads", dateFilters);
      const byDay = await dayBreakdown("amazon_leads", dateFilters);
      const byMonth = await monthBreakdown("amazon_leads", dateFilters);
      const bySourcePage = await sourcePageBreakdown("amazon_leads", dateFilters);
      const recentLeads = await fetchRecentFromTable(
        "amazon_leads",
        dateFilters,
        "id, name, email, NULL AS company, country, source_page, created_at",
        "amazon_leads",
        12,
      );
      const period = await periodTotals("amazon_leads", dateFilters);
      const totals = {
        ...period,
        total,
        uniqueCompanies: 0,
        uniqueCountries,
      };
      return res.json(
        buildStatsResponse({
          totals,
          byFormType: [{ key: "amazon_leads", count: total }],
          byCompany,
          byCountry,
          byDay,
          byMonth,
          bySourcePage,
          recentLeads,
        }),
      );
    }

    const leadsDate = { ...dateFilters };
    if (formTypeFilter) {
      leadsDate.clauses = [...dateFilters.clauses, `form_type = ?`];
      leadsDate.params = [...dateFilters.params, formTypeFilter];
    }

    const includeLandingForms = !formTypeFilter;

    const [
      leadsTotal,
      shopifyTotal,
      amazonOnboardingTotal,
      amazonLeadsTotal,
      formRows,
      companyRows,
      countryRows,
      dayRows,
      monthRows,
      sourcePageRows,
      recentRows,
      leadsPeriod,
      uniqueCompanies,
      uniqueCountriesLeads,
    ] = await Promise.all([
      countFromTable("leads", leadsDate),
      includeLandingForms
        ? countFromTable("shopify_intake_leads", dateFilters)
        : Promise.resolve(0),
      includeLandingForms
        ? countFromTable("amazon_onboarding_leads", dateFilters)
        : Promise.resolve(0),
      includeLandingForms
        ? countFromTable("amazon_leads", dateFilters)
        : Promise.resolve(0),
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(form_type), ''), 'unknown') AS key_name, COUNT(*) AS count
         FROM leads ${withWhere([], leadsDate.clauses)}
         GROUP BY key_name
         ORDER BY count DESC`,
        leadsDate.params,
      ),
      combinedCompanyBreakdown(dateFilters, formTypeFilter, includeLandingForms),
      combinedCountryBreakdown(dateFilters, formTypeFilter, includeLandingForms),
      combinedDayBreakdown(dateFilters, formTypeFilter, includeLandingForms),
      combinedMonthBreakdown(dateFilters, formTypeFilter, includeLandingForms),
      combinedSourcePageBreakdown(dateFilters, formTypeFilter, includeLandingForms),
      combinedRecentLeads(dateFilters, formTypeFilter, includeLandingForms),
      periodTotals("leads", leadsDate),
      combinedUniqueCompanyCount(dateFilters, formTypeFilter, includeLandingForms),
      combinedUniqueCountryCount(dateFilters, formTypeFilter, includeLandingForms),
    ]);

    const byFormType = formRows[0].map((r) => ({
      key: r.key_name,
      count: Number(r.count) || 0,
    }));

    if (includeLandingForms) {
      if (shopifyTotal > 0) {
        byFormType.push({ key: "shopify_intake", count: shopifyTotal });
      }
      if (amazonOnboardingTotal > 0) {
        byFormType.push({ key: "amazon_onboarding", count: amazonOnboardingTotal });
      }
      if (amazonLeadsTotal > 0) {
        byFormType.push({ key: "amazon_leads", count: amazonLeadsTotal });
      }
    }

    byFormType.sort((a, b) => b.count - a.count);

    let today = leadsPeriod.today;
    let thisWeek = leadsPeriod.thisWeek;
    let thisMonth = leadsPeriod.thisMonth;

    if (includeLandingForms) {
      const [shopifyPeriod, amazonOnboardingPeriod, amazonLeadsPeriod] =
        await Promise.all([
          periodTotals("shopify_intake_leads", dateFilters),
          periodTotals("amazon_onboarding_leads", dateFilters),
          periodTotals("amazon_leads", dateFilters),
        ]);
      today += shopifyPeriod.today + amazonOnboardingPeriod.today + amazonLeadsPeriod.today;
      thisWeek +=
        shopifyPeriod.thisWeek +
        amazonOnboardingPeriod.thisWeek +
        amazonLeadsPeriod.thisWeek;
      thisMonth +=
        shopifyPeriod.thisMonth +
        amazonOnboardingPeriod.thisMonth +
        amazonLeadsPeriod.thisMonth;
    }

    const total =
      leadsTotal + shopifyTotal + amazonOnboardingTotal + amazonLeadsTotal;

    const totals = {
      total,
      today,
      thisWeek,
      thisMonth,
      uniqueCompanies,
      uniqueCountries: uniqueCountriesLeads,
    };

    return res.json(
      buildStatsResponse({
        totals,
        byFormType,
        byCompany: companyRows,
        byCountry: countryRows,
        byDay: dayRows,
        byMonth: monthRows,
        bySourcePage: sourcePageRows,
        recentLeads: recentRows,
      }),
    );
  } catch (error) {
    console.error("STATS ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch lead stats",
    });
  }
};

const periodTotals = async (table, dateFilters) => {
  const where = withWhere([], dateFilters.clauses);
  const [rows] = await pool.query(
    `
    SELECT
      SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) THEN 1 ELSE 0 END) AS thisWeek,
      SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS thisMonth
    FROM ${table}
    ${where}
    `,
    dateFilters.params,
  );
  const row = rows[0] || {};
  return {
    today: Number(row.today) || 0,
    thisWeek: Number(row.thisWeek) || 0,
    thisMonth: Number(row.thisMonth) || 0,
  };
};

const companyBreakdown = async (table, column, dateFilters, limit = 25) => {
  const where = withWhere(
    [`${column} IS NOT NULL`, `TRIM(${column}) <> ''`],
    dateFilters.clauses,
  );
  const [rows] = await pool.query(
    `
    SELECT TRIM(${column}) AS name, COUNT(*) AS count
    FROM ${table}
    ${where}
    GROUP BY TRIM(${column})
    ORDER BY count DESC
    LIMIT ?
    `,
    [...dateFilters.params, limit],
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) || 0 }));
};

const uniqueCompanyCount = async (table, column, dateFilters) => {
  const where = withWhere(
    [`${column} IS NOT NULL`, `TRIM(${column}) <> ''`],
    dateFilters.clauses,
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT TRIM(${column})) AS total FROM ${table} ${where}`,
    dateFilters.params,
  );
  return Number(total) || 0;
};

const countryBreakdown = async (table, dateFilters, limit = 20) => {
  const where = withWhere(
    [`country IS NOT NULL`, `TRIM(country) <> ''`],
    dateFilters.clauses,
  );
  const [rows] = await pool.query(
    `
    SELECT TRIM(country) AS name, COUNT(*) AS count
    FROM ${table}
    ${where}
    GROUP BY TRIM(country)
    ORDER BY count DESC
    LIMIT ?
    `,
    [...dateFilters.params, limit],
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) || 0 }));
};

const dayBreakdown = async (table, dateFilters) => {
  const hasRange = dateFilters.clauses.length > 0;
  const clauses = hasRange
    ? dateFilters.clauses
    : [`created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)`];
  const params = hasRange ? dateFilters.params : [];
  const where = withWhere([], clauses);
  const [rows] = await pool.query(
    `
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM ${table}
    ${where}
    GROUP BY DATE(created_at)
    ORDER BY day ASC
    `,
    params,
  );
  return rows.map((r) => ({
    date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    count: Number(r.count) || 0,
  }));
};

const monthBreakdown = async (table, dateFilters, months = 12) => {
  const hasRange = dateFilters.clauses.length > 0;
  const clauses = hasRange
    ? dateFilters.clauses
    : [`created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)`];
  const params = hasRange ? dateFilters.params : [months - 1];
  const where = withWhere([], clauses);
  const [rows] = await pool.query(
    `
    SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
    FROM ${table}
    ${where}
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month ASC
    `,
    params,
  );
  return rows.map((r) => ({
    month: String(r.month),
    count: Number(r.count) || 0,
  }));
};

const sourcePageBreakdown = async (table, dateFilters, limit = 15) => {
  const where = withWhere(
    [`source_page IS NOT NULL`, `TRIM(source_page) <> ''`],
    dateFilters.clauses,
  );
  const [rows] = await pool.query(
    `
    SELECT TRIM(source_page) AS name, COUNT(*) AS count
    FROM ${table}
    ${where}
    GROUP BY TRIM(source_page)
    ORDER BY count DESC
    LIMIT ?
    `,
    [...dateFilters.params, limit],
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) || 0 }));
};

const uniqueCountryCount = async (table, dateFilters) => {
  const where = withWhere(
    [`country IS NOT NULL`, `TRIM(country) <> ''`],
    dateFilters.clauses,
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT TRIM(country)) AS total FROM ${table} ${where}`,
    dateFilters.params,
  );
  return Number(total) || 0;
};

const fetchRecentFromTable = async (
  table,
  dateFilters,
  fields,
  formTypeLabel,
  limit = 10,
) => {
  const where = withWhere([], dateFilters.clauses);
  const [rows] = await pool.query(
    `
    SELECT ${fields}
    FROM ${table}
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...dateFilters.params, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name || row.contact_person || "—",
    email: row.email || "—",
    company: row.company || row.company_name || row.business_name || null,
    country: row.country || null,
    form_type: row.form_type || formTypeLabel,
    source_page: row.source_page || null,
    created_at: row.created_at,
  }));
};

const buildInsights = ({ total, byFormType, byCountry, byCompany, byDay, bySourcePage }) => {
  const top = (list) => (list?.length ? list[0] : null);
  const peakDay = [...(byDay || [])].sort((a, b) => b.count - a.count)[0] || null;
  const days = Math.max((byDay || []).length, 1);
  return {
    topForm: top(byFormType),
    topCountry: top(byCountry),
    topCompany: top(byCompany),
    topSourcePage: top(bySourcePage),
    peakDay,
    avgDaily: total > 0 ? Math.round((total / days) * 10) / 10 : 0,
  };
};

const buildStatsResponse = (payload) => ({
  success: true,
  data: {
    ...payload,
    insights: buildInsights({
      total: payload.totals.total,
      byFormType: payload.byFormType,
      byCountry: payload.byCountry,
      byCompany: payload.byCompany,
      byDay: payload.byDay,
      bySourcePage: payload.bySourcePage,
    }),
  },
});

const mergeNamedCounts = (lists, keyField = "name", limit = 25) => {
  const map = new Map();
  for (const list of lists) {
    for (const item of list) {
      const key = item[keyField];
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + (item.count || 0));
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ [keyField]: name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

const mergeDayCounts = (lists) => {
  const map = new Map();
  for (const list of lists) {
    for (const item of list) {
      map.set(item.date, (map.get(item.date) || 0) + (item.count || 0));
    }
  }
  return [...map.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const combinedCompanyBreakdown = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [companyBreakdown("leads", "company", leadsFilters)];
  if (includeLandingForms) {
    parts.push(companyBreakdown("shopify_intake_leads", "business_name", dateFilters));
    parts.push(
      companyBreakdown("amazon_onboarding_leads", "company_name", dateFilters),
    );
  }
  const lists = await Promise.all(parts);
  return mergeNamedCounts(lists, "name", 25);
};

const combinedUniqueCompanyCount = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [uniqueCompanyCount("leads", "company", leadsFilters)];
  if (includeLandingForms) {
    parts.push(uniqueCompanyCount("shopify_intake_leads", "business_name", dateFilters));
    parts.push(
      uniqueCompanyCount("amazon_onboarding_leads", "company_name", dateFilters),
    );
  }
  const counts = await Promise.all(parts);
  return counts.reduce((sum, n) => sum + n, 0);
};

const combinedCountryBreakdown = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const parts = [
    countryBreakdown("leads", {
      clauses: formTypeFilter
        ? [...dateFilters.clauses, `form_type = ?`]
        : dateFilters.clauses,
      params: formTypeFilter
        ? [...dateFilters.params, formTypeFilter]
        : dateFilters.params,
    }),
  ];
  if (includeLandingForms) {
    parts.push(countryBreakdown("shopify_intake_leads", dateFilters));
    parts.push(countryBreakdown("amazon_leads", dateFilters));
  }
  const lists = await Promise.all(parts);
  return mergeNamedCounts(lists, "name", 20);
};

const combinedDayBreakdown = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [dayBreakdown("leads", leadsFilters)];
  if (includeLandingForms) {
    parts.push(dayBreakdown("shopify_intake_leads", dateFilters));
    parts.push(dayBreakdown("amazon_onboarding_leads", dateFilters));
    parts.push(dayBreakdown("amazon_leads", dateFilters));
  }
  const lists = await Promise.all(parts);
  return mergeDayCounts(lists);
};

const mergeMonthCounts = (lists) => {
  const map = new Map();
  for (const list of lists) {
    for (const item of list) {
      map.set(item.month, (map.get(item.month) || 0) + (item.count || 0));
    }
  }
  return [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const combinedMonthBreakdown = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [monthBreakdown("leads", leadsFilters)];
  if (includeLandingForms) {
    parts.push(monthBreakdown("shopify_intake_leads", dateFilters));
    parts.push(monthBreakdown("amazon_onboarding_leads", dateFilters));
    parts.push(monthBreakdown("amazon_leads", dateFilters));
  }
  const lists = await Promise.all(parts);
  return mergeMonthCounts(lists);
};

const combinedSourcePageBreakdown = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [sourcePageBreakdown("leads", leadsFilters)];
  if (includeLandingForms) {
    parts.push(sourcePageBreakdown("shopify_intake_leads", dateFilters));
    parts.push(sourcePageBreakdown("amazon_onboarding_leads", dateFilters));
    parts.push(sourcePageBreakdown("amazon_leads", dateFilters));
  }
  const lists = await Promise.all(parts);
  return mergeNamedCounts(lists, "name", 15);
};

const combinedUniqueCountryCount = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [uniqueCountryCount("leads", leadsFilters)];
  if (includeLandingForms) {
    parts.push(uniqueCountryCount("shopify_intake_leads", dateFilters));
    parts.push(uniqueCountryCount("amazon_leads", dateFilters));
  }
  const counts = await Promise.all(parts);
  return counts.reduce((sum, n) => sum + n, 0);
};

const combinedRecentLeads = async (
  dateFilters,
  formTypeFilter,
  includeLandingForms,
) => {
  const leadsFilters = {
    clauses: formTypeFilter
      ? [...dateFilters.clauses, `form_type = ?`]
      : dateFilters.clauses,
    params: formTypeFilter
      ? [...dateFilters.params, formTypeFilter]
      : dateFilters.params,
  };
  const parts = [
    fetchRecentFromTable(
      "leads",
      leadsFilters,
      "id, name, email, company, country, form_type, source_page, created_at",
      null,
      12,
    ),
  ];
  if (includeLandingForms) {
    parts.push(
      fetchRecentFromTable(
        "shopify_intake_leads",
        dateFilters,
        "id, name, email, business_name AS business_name, country, source_page, created_at",
        "shopify_intake",
        12,
      ),
    );
    parts.push(
      fetchRecentFromTable(
        "amazon_onboarding_leads",
        dateFilters,
        "id, contact_person AS name, email, company_name, NULL AS country, source_page, created_at",
        "amazon_onboarding",
        12,
      ),
    );
    parts.push(
      fetchRecentFromTable(
        "amazon_leads",
        dateFilters,
        "id, name, email, NULL AS company, country, source_page, created_at",
        "amazon_leads",
        12,
      ),
    );
  }
  const lists = await Promise.all(parts);
  return lists
    .flat()
    .sort(
      (a, b) =>
        new Date(String(b.created_at || 0)).getTime() -
        new Date(String(a.created_at || 0)).getTime(),
    )
    .slice(0, 15);
};
