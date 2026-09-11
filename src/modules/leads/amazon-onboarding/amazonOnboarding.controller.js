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

const FORM_TYPE = "amazon_onboarding";

const boolField = (value) => (value === true || value === "true" || value === 1 ? 1 : 0);

const parseBody = (body) => ({
  company_name: sanitize(body.company_name),
  brand_name: sanitize(body.brand_name),
  contact_person: sanitize(body.contact_person),
  email: sanitize(body.email)?.toLowerCase(),
  phone: sanitize(body.phone),
  website: sanitize(body.website),
  seller_central_url: sanitize(body.seller_central_url),
  brand_store_url: sanitize(body.brand_store_url),
  seller_id: sanitize(body.seller_id),
  merchant_token: sanitize(body.merchant_token),
  marketplace: sanitize(body.marketplace),
  fulfilment: sanitize(body.fulfilment),
  top_product_urls: sanitize(body.top_product_urls),
  top_competitor_urls: sanitize(body.top_competitor_urls),
  total_skus: body.total_skus ? Number(body.total_skus) || null : null,
  monthly_revenue: sanitize(body.monthly_revenue),
  svc_account_management: boolField(body.svc_account_management),
  svc_ppc_management: boolField(body.svc_ppc_management),
  svc_listing_creation: boolField(body.svc_listing_creation),
  svc_listing_optimization: boolField(body.svc_listing_optimization),
  svc_a_plus_content: boolField(body.svc_a_plus_content),
  svc_brand_store: boolField(body.svc_brand_store),
  svc_inventory_management: boolField(body.svc_inventory_management),
  svc_reimbursements: boolField(body.svc_reimbursements),
  current_ad_spend: sanitize(body.current_ad_spend),
  target_ad_budget: sanitize(body.target_ad_budget),
  current_acos: sanitize(body.current_acos),
  target_acos: sanitize(body.target_acos),
  advertising_challenges: sanitize(body.advertising_challenges),
  business_goals: sanitize(body.business_goals),
  source_page: sanitize(body.source_page),
});

const servicesLabel = (row) =>
  [
    row.svc_account_management ? "Account Management" : null,
    row.svc_ppc_management ? "PPC Management" : null,
    row.svc_listing_creation ? "Listing Creation" : null,
    row.svc_listing_optimization ? "Listing Optimization" : null,
    row.svc_a_plus_content ? "A+ Content" : null,
    row.svc_brand_store ? "Brand Store" : null,
    row.svc_inventory_management ? "Inventory Management" : null,
    row.svc_reimbursements ? "Reimbursements" : null,
  ]
    .filter(Boolean)
    .join(", ") || "-";

const buildTeamEmailHtml = (row, ip) => `
<div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">
  <div style="max-width:700px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">
    <h2 style="margin-top:0;color:#232F3E;">New Amazon Seller Onboarding Questionnaire</h2>
    <p><strong>Sender IP:</strong> ${ip}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3>Business Information</h3>
    <p><strong>Company:</strong> ${row.company_name || "-"}</p>
    <p><strong>Brand:</strong> ${row.brand_name || "-"}</p>
    <p><strong>Contact:</strong> ${row.contact_person}</p>
    <p><strong>Email:</strong> <a href="mailto:${row.email}">${row.email}</a></p>
    <p><strong>Phone:</strong> ${row.phone || "-"}</p>
    <p><strong>Website:</strong> ${row.website || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3>Amazon Store</h3>
    <p><strong>Seller Central:</strong> ${row.seller_central_url || "-"}</p>
    <p><strong>Brand Store:</strong> ${row.brand_store_url || "-"}</p>
    <p><strong>Seller ID:</strong> ${row.seller_id || "-"}</p>
    <p><strong>Marketplace:</strong> ${row.marketplace || "-"}</p>
    <p><strong>Fulfilment:</strong> ${row.fulfilment || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3>Products</h3>
    <p><strong>Top Products:</strong><br/>${row.top_product_urls || "-"}</p>
    <p><strong>Competitors:</strong><br/>${row.top_competitor_urls || "-"}</p>
    <p><strong>SKUs:</strong> ${row.total_skus ?? "-"}</p>
    <p><strong>Monthly Revenue:</strong> ${row.monthly_revenue || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3>Services Required</h3>
    <p>${servicesLabel(row)}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3>Advertising</h3>
    <p><strong>Current Spend:</strong> ${row.current_ad_spend || "-"}</p>
    <p><strong>Target Budget:</strong> ${row.target_ad_budget || "-"}</p>
    <p><strong>Current ACOS:</strong> ${row.current_acos || "-"}</p>
    <p><strong>Target ACOS:</strong> ${row.target_acos || "-"}</p>
    <p><strong>Challenges:</strong><br/>${row.advertising_challenges || "-"}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
    <h3>Goals</h3>
    <p>${row.business_goals || "-"}</p>
    <p><strong>Source Page:</strong> ${row.source_page || "-"}</p>
  </div>
</div>`;

const buildFilters = (query) => {
  const clauses = [];
  const params = [];
  const search = sanitize(query.search);

  if (search) {
    const like = `%${search}%`;
    clauses.push(`(
      contact_person LIKE ? OR email LIKE ? OR phone LIKE ? OR
      company_name LIKE ? OR brand_name LIKE ? OR marketplace LIKE ? OR
      seller_id LIKE ? OR business_goals LIKE ? OR source_page LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like, like);
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
  name: row.contact_person,
  form_type: FORM_TYPE,
  message: row.company_name
    ? `Amazon onboarding — ${row.company_name}`
    : "Amazon seller onboarding questionnaire",
  lead_source: FORM_TYPE,
});

const INSERT_SQL = `INSERT INTO amazon_onboarding_leads (
  company_name, brand_name, contact_person, email, phone, website,
  seller_central_url, brand_store_url, seller_id, merchant_token,
  marketplace, fulfilment, top_product_urls, top_competitor_urls,
  total_skus, monthly_revenue,
  svc_account_management, svc_ppc_management, svc_listing_creation,
  svc_listing_optimization, svc_a_plus_content, svc_brand_store,
  svc_inventory_management, svc_reimbursements,
  current_ad_spend, target_ad_budget, current_acos, target_acos,
  advertising_challenges, business_goals, source_page
) VALUES (${Array(31).fill("?").join(", ")})`;

export const createAmazonOnboarding = async (req, res) => {
  try {
    const captcha = await verifyTurnstile(req.body.captchaToken, getClientIp(req));
    if (!captcha.ok) {
      return res.status(400).json({ success: false, message: captcha.message });
    }

    const data = parseBody(req.body);

    if (!data.contact_person || !data.email) {
      return res.status(400).json({
        success: false,
        message: "Contact person and email are required",
      });
    }

    if (!validateEmail(data.email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (!data.phone) {
      return res.status(400).json({ success: false, message: "Phone is required" });
    }

    const ip = getClientIp(req);

    const [result] = await pool.execute(INSERT_SQL, [
      data.company_name,
      data.brand_name,
      data.contact_person,
      data.email,
      data.phone,
      data.website,
      data.seller_central_url,
      data.brand_store_url,
      data.seller_id,
      data.merchant_token,
      data.marketplace,
      data.fulfilment,
      data.top_product_urls,
      data.top_competitor_urls,
      data.total_skus,
      data.monthly_revenue,
      data.svc_account_management,
      data.svc_ppc_management,
      data.svc_listing_creation,
      data.svc_listing_optimization,
      data.svc_a_plus_content,
      data.svc_brand_store,
      data.svc_inventory_management,
      data.svc_reimbursements,
      data.current_ad_spend,
      data.target_ad_budget,
      data.current_acos,
      data.target_acos,
      data.advertising_challenges,
      data.business_goals,
      data.source_page,
    ]);

    const record = { id: result.insertId, ...data };

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: LEAD_EMAILS.join(","),
        replyTo: data.email,
        subject: `New Amazon Onboarding - ${data.contact_person}`,
        html: buildTeamEmailHtml(record, ip),
      })
      .catch((err) => console.error("Amazon onboarding mail failed:", err.message));

    transporter
      .sendMail({
        from: `"Tech2Globe" <${process.env.SMTP_EMAIL}>`,
        to: data.email,
        subject: "Thank You for Your Amazon Questionnaire - Tech2Globe",
        html: `
        <div style="background:#f4f4f4;padding:40px 20px;font-family:Arial,sans-serif;">
          <div style="max-width:650px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;">
            <h2 style="margin-top:0;color:#232F3E;">Thank You</h2>
            <p>Dear ${data.contact_person},</p>
            <p>We have received your Amazon Seller Onboarding questionnaire. Our team will review your details and contact you shortly.</p>
            <p>Regards,<br/><strong>Tech2Globe Team</strong></p>
          </div>
        </div>`,
      })
      .catch((err) =>
        console.error("Amazon onboarding user mail failed:", err.message),
      );

    return res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Amazon onboarding submitted successfully",
    });
  } catch (error) {
    console.error("AMAZON ONBOARDING CREATE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getAmazonOnboardings = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const offset = (page - 1) * limit;
    const { where, params } = buildFilters(req.query);

    const [rows] = await pool.query(
      `SELECT * FROM amazon_onboarding_leads ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM amazon_onboarding_leads ${where}`,
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
    console.error("AMAZON ONBOARDING READ ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load submissions" });
  }
};

export const getAmazonOnboardingById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid ID" });

    const [rows] = await pool.execute(
      `SELECT * FROM amazon_onboarding_leads WHERE id = ?`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.json({ success: true, data: mapListRow(rows[0]) });
  } catch (error) {
    console.error("AMAZON ONBOARDING READ ONE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};

export const exportAmazonOnboardings = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const [rows] = await pool.query(
      `SELECT * FROM amazon_onboarding_leads ${where} ORDER BY id DESC LIMIT 10000`,
      params,
    );

    const headers = [
      "ID",
      "Contact Person",
      "Email",
      "Phone",
      "Company",
      "Brand",
      "Marketplace",
      "Fulfilment",
      "Monthly Revenue",
      "Services",
      "Source Page",
      "Created At",
    ];

    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.id,
          r.contact_person,
          r.email,
          r.phone,
          r.company_name,
          r.brand_name,
          r.marketplace,
          r.fulfilment,
          r.monthly_revenue,
          servicesLabel(r),
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
      `attachment; filename="amazon-onboarding-export-${stamp}.csv"`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("AMAZON ONBOARDING EXPORT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
};

export const deleteAmazonOnboarding = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false });

    const [result] = await pool.execute(
      `DELETE FROM amazon_onboarding_leads WHERE id = ?`,
      [id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("AMAZON ONBOARDING DELETE ERROR:", error.message);
    return res.status(500).json({ success: false });
  }
};
