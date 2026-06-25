import pool from "../../../config/db.js";
import { transporter } from "../../../utils/email.service.js";
import {
  LEAD_EMAILS,
  sanitize,
  validateEmail,
  verifyTurnstile,
  getClientIp,
  csvEscape,
} from "../lead.helpers.js";

const FORM_TYPE = "shopify_intake";

const boolField = (value) => (value === true || value === "true" || value === 1 ? 1 : 0);

const parseBody = (body) => ({
  name: sanitize(body.name),
  email: sanitize(body.email)?.toLowerCase(),
  phone: sanitize(body.phone),
  country: sanitize(body.country),
  business_name: sanitize(body.business_name),
  website: sanitize(body.website),
  business_description: sanitize(body.business_description),
  brand_mission: sanitize(body.brand_mission),
  problem_solved: sanitize(body.problem_solved),
  personality: sanitize(body.personality),
  categories: sanitize(body.categories),
  best_sellers: sanitize(body.best_sellers),
  avg_price: sanitize(body.avg_price),
  product_physical: boolField(body.physical ?? body.product_physical),
  product_digital: boolField(body.digital ?? body.product_digital),
  product_subscription: boolField(body.subscription ?? body.product_subscription),
  audience_interests: sanitize(body.audience_interests),
  pain_points: sanitize(body.pain_points),
  customer_goals: sanitize(body.customer_goals),
  competitor1: sanitize(body.competitor1),
  competitor2: sanitize(body.competitor2),
  competitor3: sanitize(body.competitor3),
  amazon_store: sanitize(body.amazon_store),
  top_asins: sanitize(body.top_asins),
  amazon_revenue: sanitize(body.amazon_revenue),
  notes: sanitize(body.notes),
  source_page: sanitize(body.source_page),
});

const productTypesLabel = (row) =>
  [
    row.product_physical ? "Physical Product" : null,
    row.product_digital ? "Digital Product" : null,
    row.product_subscription ? "Subscription" : null,
  ]
    .filter(Boolean)
    .join(", ") || "-";

const buildTeamEmailHtml = (row, ip) => `
<div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">
  <div style="max-width:700px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">
    <h2 style="margin-top:0;color:#111;">New Shopify Intake Questionnaire</h2>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3 style="color:#222;">Contact</h3>
    <p><strong>Name:</strong> ${row.name}</p>
    <p><strong>Email:</strong> <a href="mailto:${row.email}">${row.email}</a></p>
    <p><strong>Phone:</strong> ${row.phone || "-"}</p>
    <p><strong>Country:</strong> ${row.country || "-"}</p>
    <p><strong>Sender IP:</strong> ${ip}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">1. Business Information</h3>
    <p><strong>Business Name:</strong> ${row.business_name || "-"}</p>
    <p><strong>Website:</strong> ${row.website || "-"}</p>
    <p><strong>Business Description:</strong><br/>${row.business_description || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">2. Brand Identity</h3>
    <p><strong>Brand Mission:</strong><br/>${row.brand_mission || "-"}</p>
    <p><strong>Problem Solved:</strong><br/>${row.problem_solved || "-"}</p>
    <p><strong>Personality:</strong> ${row.personality || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">3. Products</h3>
    <p><strong>Categories:</strong><br/>${row.categories || "-"}</p>
    <p><strong>Best Sellers:</strong><br/>${row.best_sellers || "-"}</p>
    <p><strong>Average Price:</strong> ${row.avg_price || "-"}</p>
    <p><strong>Product Types:</strong> ${productTypesLabel(row)}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">4. Audience</h3>
    <p><strong>Interests:</strong><br/>${row.audience_interests || "-"}</p>
    <p><strong>Pain Points:</strong><br/>${row.pain_points || "-"}</p>
    <p><strong>Customer Goals:</strong><br/>${row.customer_goals || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">5. Competitors</h3>
    <p><strong>Competitor 1:</strong> ${row.competitor1 || "-"}</p>
    <p><strong>Competitor 2:</strong> ${row.competitor2 || "-"}</p>
    <p><strong>Competitor 3:</strong> ${row.competitor3 || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">6. Amazon Information</h3>
    <p><strong>Amazon Store:</strong> ${row.amazon_store || "-"}</p>
    <p><strong>Top ASINs:</strong><br/>${row.top_asins || "-"}</p>
    <p><strong>Monthly Revenue:</strong> ${row.amazon_revenue || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <h3 style="color:#222;">7. Additional Notes</h3>
    <p>${row.notes || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:25px 0;" />
    <p><strong>Source Page:</strong> ${row.source_page || "-"}</p>
    <p><strong>Submitted At:</strong> ${new Date().toLocaleString()}</p>
  </div>
</div>`;

const buildFilters = (query) => {
  const clauses = [];
  const params = [];
  const search = sanitize(query.search);

  if (search) {
    const like = `%${search}%`;
    clauses.push(`(
      name LIKE ? OR email LIKE ? OR phone LIKE ? OR country LIKE ? OR
      business_name LIKE ? OR website LIKE ? OR business_description LIKE ? OR
      brand_mission LIKE ? OR categories LIKE ? OR notes LIKE ? OR source_page LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, like);
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

const mapListRow = (row) => ({
  ...row,
  form_type: FORM_TYPE,
  message: row.business_name
    ? `Shopify intake — ${row.business_name}`
    : "Shopify intake questionnaire",
  lead_source: "shopify_intake",
});

export const createShopifyIntake = async (req, res) => {
  try {
    const captcha = await verifyTurnstile(req.body.captchaToken, getClientIp(req));
    if (!captcha.ok) {
      return res.status(400).json({ success: false, message: captcha.message });
    }

    const data = parseBody(req.body);

    if (!data.name || !data.email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    if (!validateEmail(data.email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (!data.phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }

    const ip = getClientIp(req);

    const [result] = await pool.execute(
      `INSERT INTO shopify_intake_leads (
        name, email, phone, country,
        business_name, website, business_description,
        brand_mission, problem_solved, personality,
        categories, best_sellers, avg_price,
        product_physical, product_digital, product_subscription,
        audience_interests, pain_points, customer_goals,
        competitor1, competitor2, competitor3,
        amazon_store, top_asins, amazon_revenue,
        notes, source_page
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.email,
        data.phone,
        data.country,
        data.business_name,
        data.website,
        data.business_description,
        data.brand_mission,
        data.problem_solved,
        data.personality,
        data.categories,
        data.best_sellers,
        data.avg_price,
        data.product_physical,
        data.product_digital,
        data.product_subscription,
        data.audience_interests,
        data.pain_points,
        data.customer_goals,
        data.competitor1,
        data.competitor2,
        data.competitor3,
        data.amazon_store,
        data.top_asins,
        data.amazon_revenue,
        data.notes,
        data.source_page,
      ],
    );

    const record = { id: result.insertId, ...data };

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: LEAD_EMAILS.join(","),
        replyTo: data.email,
        subject: `New Shopify Intake - ${data.name}`,
        html: buildTeamEmailHtml(record, ip),
      })
      .then((info) => console.log("Shopify intake mail sent:", info.messageId))
      .catch((err) => console.error("Shopify intake mail failed:", err.message));

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: data.email,
        subject: "Thank You for Your Shopify Questionnaire - Tech2Globe",
        html: `
        <div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">
          <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">
            <h2 style="margin-top:0;color:#111;">Thank You</h2>
            <p>Dear ${data.name},</p>
            <p>We have received your Shopify AI Store Builder questionnaire. Our team will review your details and contact you shortly.</p>
            <p>Regards,<br/><strong>Tech2Globe Team</strong></p>
          </div>
        </div>`,
      })
      .catch((err) =>
        console.error("Shopify intake user mail failed:", err.message),
      );

    return res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Shopify intake submitted successfully",
    });
  } catch (error) {
    console.error("SHOPIFY INTAKE CREATE ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getShopifyIntakes = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const offset = (page - 1) * limit;
    const { where, params } = buildFilters(req.query);

    const [rows] = await pool.query(
      `SELECT * FROM shopify_intake_leads ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM shopify_intake_leads ${where}`,
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
    console.error("SHOPIFY INTAKE READ ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load submissions" });
  }
};

export const getShopifyIntakeById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM shopify_intake_leads WHERE id = ?`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.json({
      success: true,
      data: mapListRow(rows[0]),
    });
  } catch (error) {
    console.error("SHOPIFY INTAKE READ ONE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};

export const exportShopifyIntakes = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const [rows] = await pool.query(
      `SELECT * FROM shopify_intake_leads ${where} ORDER BY id DESC LIMIT 10000`,
      params,
    );

    const headers = [
      "ID",
      "Name",
      "Email",
      "Phone",
      "Country",
      "Business Name",
      "Website",
      "Personality",
      "Amazon Store",
      "Amazon Revenue",
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
          r.phone,
          r.country,
          r.business_name,
          r.website,
          r.personality,
          r.amazon_store,
          r.amazon_revenue,
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
      `attachment; filename="shopify-intake-export-${stamp}.csv"`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("SHOPIFY INTAKE EXPORT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
};

export const deleteShopifyIntake = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false });

    const [result] = await pool.execute(
      `DELETE FROM shopify_intake_leads WHERE id = ?`,
      [id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("SHOPIFY INTAKE DELETE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};
