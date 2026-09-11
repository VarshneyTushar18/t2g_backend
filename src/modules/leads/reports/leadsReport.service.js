import pool from "../../../config/db.js";
import { transporter } from "../../../utils/email.service.js";

const IST_TIMEZONE = process.env.LEADS_REPORT_TIMEZONE || "Asia/Kolkata";
const REPORT_TO = (process.env.LEADS_REPORT_TO || "").trim();
const REPORT_FROM =
  (process.env.LEADS_REPORT_FROM ||
    process.env.SMTP_EMAIL ||
    process.env.EMAIL_USER ||
    "").trim();

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toYmd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function dateRangeLabel(startDate, endDate) {
  return `${toYmd(startDate)} to ${toYmd(endDate)}`;
}

async function fetchLeadsInRange(startDate, endDate) {
  const from = toYmd(startDate);
  const to = toYmd(endDate);
  const [[{ dbName }]] = await pool.query("SELECT DATABASE() AS dbName");
  const exists = async (tableName) => {
    const [[row]] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
      `,
      [dbName, tableName]
    );
    return Number(row?.total) > 0;
  };

  const chunks = [];
  const params = [];
  const pushChunk = (sql) => {
    chunks.push(sql);
    params.push(from, to);
  };

  if (await exists("leads")) {
    pushChunk(`
      SELECT
        't2g_main' AS source_bucket,
        't2g' AS source_site,
        'leads' AS table_name,
        id,
        name,
        email,
        phone,
        company,
        country,
        form_type,
        source_page,
        created_at AS submitted_at
      FROM leads
      WHERE DATE(created_at) BETWEEN ? AND ?
    `);
  }

  if (await exists("shopify_intake_leads")) {
    pushChunk(`
      SELECT
        'shopify' AS source_bucket,
        'shopify' AS source_site,
        'shopify_intake_leads' AS table_name,
        id,
        name,
        email,
        phone,
        business_name AS company,
        country,
        'shopify_intake' AS form_type,
        source_page,
        created_at AS submitted_at
      FROM shopify_intake_leads
      WHERE DATE(created_at) BETWEEN ? AND ?
    `);
  }

  if (await exists("amazon_onboarding_leads")) {
    pushChunk(`
      SELECT
        'amazon_onboarding' AS source_bucket,
        'amazon' AS source_site,
        'amazon_onboarding_leads' AS table_name,
        id,
        contact_person AS name,
        email,
        phone,
        company_name AS company,
        NULL AS country,
        'amazon_onboarding' AS form_type,
        source_page,
        created_at AS submitted_at
      FROM amazon_onboarding_leads
      WHERE DATE(created_at) BETWEEN ? AND ?
    `);
  }

  if (await exists("amazon_leads")) {
    pushChunk(`
      SELECT
        'amazon_s4a' AS source_bucket,
        's4a' AS source_site,
        'amazon_leads' AS table_name,
        id,
        name,
        email,
        phone,
        NULL AS company,
        country,
        'amazon_leads' AS form_type,
        source_page,
        created_at AS submitted_at
      FROM amazon_leads
      WHERE DATE(created_at) BETWEEN ? AND ?
    `);
  }

  if (await exists("leads_tech2globeca")) {
    pushChunk(`
      SELECT
        't2g_ca' AS source_bucket,
        'tech2globeca' AS source_site,
        'leads_tech2globeca' AS table_name,
        id,
        name,
        email,
        phone,
        NULL AS company,
        country,
        form_type,
        source_page,
        created_at AS submitted_at
      FROM leads_tech2globeca
      WHERE DATE(created_at) BETWEEN ? AND ?
    `);
  }

  if (await exists("leads_tech2globe_ai")) {
    pushChunk(`
      SELECT
        't2g_ai' AS source_bucket,
        'tech2globe_ai' AS source_site,
        'leads_tech2globe_ai' AS table_name,
        id,
        name,
        email,
        phone,
        company,
        country,
        form_type,
        source_page,
        COALESCE(submitted_at, created_at) AS submitted_at
      FROM leads_tech2globe_ai
      WHERE DATE(COALESCE(submitted_at, created_at)) BETWEEN ? AND ?
    `);
  }

  if (!chunks.length) return [];

  const [rows] = await pool.query(
    `
      SELECT * FROM (
        ${chunks.join("\nUNION ALL\n")}
      ) AS merged
      ORDER BY submitted_at DESC, id DESC
    `,
    params
  );
  return rows;
}

function buildCsv(rows) {
  const headers = [
    "Source Group",
    "Source Site",
    "Table",
    "ID",
    "Name",
    "Email",
    "Phone",
    "Company",
    "Country",
    "Form Type",
    "Source Page",
    "Submitted At",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.source_bucket,
        r.source_site,
        r.table_name,
        r.id,
        r.name,
        r.email,
        r.phone,
        r.company,
        r.country,
        r.form_type,
        r.source_page,
        r.submitted_at,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

function buildSummary(rows) {
  const bySource = new Map();
  const byForm = new Map();
  for (const row of rows) {
    bySource.set(row.source_bucket, (bySource.get(row.source_bucket) || 0) + 1);
    byForm.set(row.form_type || "unknown", (byForm.get(row.form_type || "unknown") || 0) + 1);
  }
  const sourceLines = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`)
    .join("");
  const formLines = [...byForm.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`)
    .join("");

  return {
    total: rows.length,
    sourceHtml: sourceLines || "<li>No leads</li>",
    formHtml: formLines || "<li>No leads</li>",
  };
}

function buildLeadsTableHtml(rows, limit = 50) {
  const preview = rows.slice(0, limit);
  if (!preview.length) return "<p>No leads found for this range.</p>";

  const tableRows = preview
    .map(
      (r) => `
        <tr>
          <td>${csvEscape(r.source_bucket)}</td>
          <td>${csvEscape(r.name || "-")}</td>
          <td>${csvEscape(r.email || "-")}</td>
          <td>${csvEscape(r.phone || "-")}</td>
          <td>${csvEscape(r.company || "-")}</td>
          <td>${csvEscape(r.country || "-")}</td>
          <td>${csvEscape(r.form_type || "-")}</td>
          <td>${csvEscape(r.submitted_at || "-")}</td>
        </tr>
      `
    )
    .join("");

  const note =
    rows.length > limit
      ? `<p style="margin-top:8px;color:#64748b;">Showing first ${limit} rows in email body. Full ${rows.length} rows are attached in CSV.</p>`
      : `<p style="margin-top:8px;color:#64748b;">All ${rows.length} rows are shown below and attached in CSV.</p>`;

  return `
    <div style="overflow:auto;max-width:100%;">
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px;min-width:900px;">
        <thead style="background:#f8fafc;">
          <tr>
            <th>Source</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Company</th>
            <th>Country</th>
            <th>Form Type</th>
            <th>Submitted At</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
    ${note}
  `;
}

async function sendReportEmail({ title, startDate, endDate }) {
  if (!REPORT_TO) {
    console.warn("[leads-report] LEADS_REPORT_TO is not set. Skipping email.");
    return;
  }

  const rows = await fetchLeadsInRange(startDate, endDate);
  const csv = buildCsv(rows);
  const summary = buildSummary(rows);
  const leadsTableHtml = buildLeadsTableHtml(rows);
  const label = dateRangeLabel(startDate, endDate);
  const stamp = `${toYmd(startDate)}_${toYmd(endDate)}`;

  await transporter.sendMail({
    from: REPORT_FROM,
    to: REPORT_TO,
    subject: `${title} | ${label} | Total: ${summary.total}`,
    html: `
      <div style="font-family:Arial,sans-serif;">
        <h2 style="margin-bottom:6px;">${title}</h2>
        <p style="margin-top:0;color:#475569;">Range: <strong>${label}</strong></p>
        <p>Total leads: <strong>${summary.total}</strong></p>
        <h3 style="margin-bottom:6px;">By Source</h3>
        <ul>${summary.sourceHtml}</ul>
        <h3 style="margin-bottom:6px;">By Form Type</h3>
        <ul>${summary.formHtml}</ul>
        <h3 style="margin:16px 0 6px;">Leads Data</h3>
        ${leadsTableHtml}
        <p style="margin-top:16px;color:#64748b;">CSV attachment includes complete lead rows for download and filtering.</p>
      </div>
    `,
    attachments: [
      {
        filename: `leads-report-${stamp}.csv`,
        content: csv,
        contentType: "text/csv; charset=utf-8",
      },
    ],
  });

  console.log(`[leads-report] Sent: ${title} (${label}) -> ${REPORT_TO}`);
}

export async function sendFirstHalfMonthlyReport(now = new Date()) {
  const start = startOfMonth(now);
  const end = new Date(now.getFullYear(), now.getMonth(), 15);
  await sendReportEmail({
    title: "Leads Report (1 to 15)",
    startDate: start,
    endDate: end,
  });
}

export async function sendSecondHalfMonthlyReport(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 16);
  const end = endOfMonth(now);
  await sendReportEmail({
    title: "Leads Report (16 to Month End)",
    startDate: start,
    endDate: end,
  });
}

export async function sendFullMonthlyReport(now = new Date()) {
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  await sendReportEmail({
    title: "Leads Report (Full Month)",
    startDate: start,
    endDate: end,
  });
}

export function getReportTimezone() {
  return IST_TIMEZONE;
}

