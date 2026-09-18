import blogDb from "../../config/blogDb.js";
import {
  encryptSecret,
  decryptSecret,
} from "../agents/ai-integrations/aiIntegrations.model.js";

const DEFAULTS = {
  project_name: "Bright CRM",
  client_site_url:
    "https://preview.mailerlite.io/preview/2583138/sites/196949098888169226/",
  client_blog_url:
    "https://preview.mailerlite.io/preview/2583138/sites/196949098888169226/blog",
  website_mode: "mailerlite_manual",
  newsletter_mode: "full_html",
  mailerlite_enabled: true,
  mailerlite_from_email: "",
  mailerlite_from_name: "Bright CRM",
  mailerlite_group_id: "",
  mailerlite_site_id: "196949098888169226",
  mailerlite_bot_enabled: false,
  mailerlite_bot_auto_push: false,
  has_mailerlite_login: false,
  approval_emails: [],
  teams_webhook_url: "",
  timezone: "Asia/Kolkata",
  automation_frequency: "weekly",
  automation_run_days: [1],
  automation_run_time: "12:00",
  newsletter_send_timing: "scheduled",
  newsletter_send_time: "12:00",
  notes:
    "Blog on MailerLite site (manual publish pack). Weekly Monday 12:00 IST: AI writes + newsletter send. Approvers: you + Harpreet sir (+ Teams channel TBD). Newsletter format TBD: full article vs excerpt+link.",
};

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function makeHint(apiKey) {
  const key = String(apiKey || "");
  if (key.length < 8) return key ? "••••" : null;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function makeEmailHint(email) {
  const value = String(email || "").trim();
  const at = value.indexOf("@");
  if (at < 1) return value ? "••••" : null;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  if (local.length <= 2) return `••${domain}`;
  return `${local.slice(0, 2)}•••${domain}`;
}

function isValidLoginEmail(email) {
  const value = String(email || "").trim();
  if (!value || value.includes("://") || value.includes("/")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapRow(row) {
  if (!row) return { ...DEFAULTS, has_mailerlite_api_key: false, mailerlite_api_key_hint: null };
  return {
    project_name: row.project_name || DEFAULTS.project_name,
    client_site_url: row.client_site_url || DEFAULTS.client_site_url,
    client_blog_url: row.client_blog_url || DEFAULTS.client_blog_url,
    website_mode: row.website_mode || DEFAULTS.website_mode,
    newsletter_mode: row.newsletter_mode || DEFAULTS.newsletter_mode,
    timezone: row.timezone || DEFAULTS.timezone,
    automation_frequency: row.automation_frequency || DEFAULTS.automation_frequency,
    automation_run_days: parseJsonArray(row.automation_run_days, DEFAULTS.automation_run_days),
    automation_run_time: row.automation_run_time || DEFAULTS.automation_run_time,
    newsletter_send_timing: row.newsletter_send_timing || DEFAULTS.newsletter_send_timing,
    newsletter_send_time: row.newsletter_send_time || DEFAULTS.newsletter_send_time,
    mailerlite_enabled: Boolean(row.mailerlite_enabled),
    has_mailerlite_api_key: Boolean(row.mailerlite_api_key_enc),
    mailerlite_api_key_hint: row.mailerlite_api_key_hint || null,
    mailerlite_from_email: row.mailerlite_from_email || "",
    mailerlite_from_name: row.mailerlite_from_name || "",
    mailerlite_group_id: row.mailerlite_group_id || "",
    mailerlite_site_id: row.mailerlite_site_id || DEFAULTS.mailerlite_site_id,
    mailerlite_bot_enabled: Boolean(row.mailerlite_bot_enabled),
    mailerlite_bot_auto_push: Boolean(row.mailerlite_bot_auto_push),
    has_mailerlite_login: Boolean(row.mailerlite_login_email_enc && row.mailerlite_login_password_enc),
    mailerlite_login_email_hint: null,
    approval_emails: parseJsonArray(row.approval_emails, []),
    teams_webhook_url: row.teams_webhook_url || "",
    notes: row.notes || "",
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null,
  };
}

export async function ensureBlog20Tables() {
  await blogDb.query(`
    CREATE TABLE IF NOT EXISTS blog_2_0_settings (
      id TINYINT PRIMARY KEY DEFAULT 1,
      project_name VARCHAR(120) NOT NULL DEFAULT 'Bright CRM',
      client_site_url VARCHAR(500) NULL,
      website_mode ENUM('cms_draft', 'mailerlite_manual') NOT NULL DEFAULT 'cms_draft',
      newsletter_mode ENUM('full_html', 'excerpt_link') NOT NULL DEFAULT 'full_html',
      mailerlite_enabled TINYINT(1) NOT NULL DEFAULT 0,
      mailerlite_api_key_enc TEXT NULL,
      mailerlite_api_key_hint VARCHAR(32) NULL,
      mailerlite_from_email VARCHAR(255) NULL,
      mailerlite_from_name VARCHAR(255) NULL,
      mailerlite_group_id VARCHAR(64) NULL,
      approval_emails JSON NULL,
      teams_webhook_url VARCHAR(500) NULL,
      notes TEXT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(255) NULL
    )
  `);
  const alters = [
    {
      col: "client_blog_url",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN client_blog_url VARCHAR(500) NULL AFTER client_site_url",
    },
    {
      col: "timezone",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata' AFTER teams_webhook_url",
    },
    {
      col: "automation_frequency",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN automation_frequency ENUM('weekly','monthly') NOT NULL DEFAULT 'weekly' AFTER timezone",
    },
    {
      col: "automation_run_days",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN automation_run_days JSON NULL AFTER automation_frequency",
    },
    {
      col: "automation_run_time",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN automation_run_time VARCHAR(8) NOT NULL DEFAULT '12:00' AFTER automation_run_days",
    },
    {
      col: "newsletter_send_timing",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN newsletter_send_timing ENUM('on_approve','scheduled') NOT NULL DEFAULT 'scheduled' AFTER automation_run_time",
    },
    {
      col: "newsletter_send_time",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN newsletter_send_time VARCHAR(8) NOT NULL DEFAULT '12:00' AFTER newsletter_send_timing",
    },
    {
      col: "mailerlite_site_id",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN mailerlite_site_id VARCHAR(64) NULL DEFAULT '196949098888169226' AFTER mailerlite_group_id",
    },
    {
      col: "mailerlite_bot_enabled",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN mailerlite_bot_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER mailerlite_site_id",
    },
    {
      col: "mailerlite_bot_auto_push",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN mailerlite_bot_auto_push TINYINT(1) NOT NULL DEFAULT 0 AFTER mailerlite_bot_enabled",
    },
    {
      col: "mailerlite_login_email_enc",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN mailerlite_login_email_enc TEXT NULL AFTER mailerlite_bot_auto_push",
    },
    {
      col: "mailerlite_login_password_enc",
      sql: "ALTER TABLE blog_2_0_settings ADD COLUMN mailerlite_login_password_enc TEXT NULL AFTER mailerlite_login_email_enc",
    },
  ];
  const [cols] = await blogDb.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_2_0_settings'`,
  );
  const existing = new Set(cols.map((c) => c.COLUMN_NAME));
  for (const { col, sql } of alters) {
    if (!existing.has(col)) await blogDb.query(sql);
  }

  await blogDb.query(
    `INSERT INTO blog_2_0_settings
      (id, project_name, client_site_url, client_blog_url, website_mode, timezone,
       automation_frequency, automation_run_days, automation_run_time,
       newsletter_send_timing, newsletter_send_time, mailerlite_enabled, mailerlite_from_name, notes)
     VALUES (1, 'Bright CRM', ?, ?, 'mailerlite_manual', 'Asia/Kolkata',
       'weekly', JSON_ARRAY(1), '12:00', 'scheduled', '12:00', 1, 'Bright CRM', ?)
     ON DUPLICATE KEY UPDATE project_name = project_name`,
    [DEFAULTS.client_site_url, DEFAULTS.client_blog_url, DEFAULTS.notes],
  );
}

export async function getSettings() {
  const [rows] = await blogDb.query(
    "SELECT * FROM blog_2_0_settings WHERE id = 1 LIMIT 1",
  );
  const row = rows[0];
  const settings = mapRow(row);
  if (row?.mailerlite_login_email_enc) {
    try {
      settings.mailerlite_login_email_hint = makeEmailHint(
        decryptSecret(row.mailerlite_login_email_enc),
      );
    } catch {
      settings.mailerlite_login_email_hint = "••••";
    }
  }
  return settings;
}

export function getMailerLiteApiKey(row) {
  const fromDb =
    row?.mailerlite_enabled && row?.mailerlite_api_key_enc
      ? decryptSecret(row.mailerlite_api_key_enc)
      : null;
  return fromDb || process.env.BLOG_20_MAILERLITE_API_KEY || process.env.MAILERLITE_API_KEY || null;
}

export async function getSettingsWithSecret() {
  const [rows] = await blogDb.query(
    "SELECT * FROM blog_2_0_settings WHERE id = 1 LIMIT 1",
  );
  const row = rows[0];
  return {
    ...mapRow(row),
    mailerlite_api_key: getMailerLiteApiKey(row),
    mailerlite_login_email: row?.mailerlite_login_email_enc
      ? decryptSecret(row.mailerlite_login_email_enc)
      : process.env.BLOG_20_MAILERLITE_LOGIN_EMAIL || null,
    mailerlite_login_password: row?.mailerlite_login_password_enc
      ? decryptSecret(row.mailerlite_login_password_enc)
      : process.env.BLOG_20_MAILERLITE_LOGIN_PASSWORD || null,
  };
}

export const getSettingsWithSecrets = getSettingsWithSecret;

export async function upsertSettings(payload, updatedBy = null) {
  const [rows] = await blogDb.query(
    "SELECT * FROM blog_2_0_settings WHERE id = 1 LIMIT 1",
  );
  const current = rows[0] || {};

  let mailerlite_api_key_enc = current.mailerlite_api_key_enc || null;
  let mailerlite_api_key_hint = current.mailerlite_api_key_hint || null;
  const incomingKey = String(payload.mailerlite_api_key || "").trim();
  if (incomingKey) {
    mailerlite_api_key_enc = encryptSecret(incomingKey);
    mailerlite_api_key_hint = makeHint(incomingKey);
  }
  if (payload.clear_mailerlite_api_key === true) {
    mailerlite_api_key_enc = null;
    mailerlite_api_key_hint = null;
  }

  let mailerlite_login_email_enc = current.mailerlite_login_email_enc || null;
  let mailerlite_login_password_enc = current.mailerlite_login_password_enc || null;
  const loginEmail = String(payload.mailerlite_login_email || "").trim();
  const loginPassword = String(payload.mailerlite_login_password || "").trim();
  if (loginEmail) {
    if (!isValidLoginEmail(loginEmail)) {
      const err = new Error(
        "Bot login email must be a valid MailerLite account email (not a website URL).",
      );
      err.status = 400;
      throw err;
    }
    mailerlite_login_email_enc = encryptSecret(loginEmail);
  }
  if (loginPassword) mailerlite_login_password_enc = encryptSecret(loginPassword);
  if (payload.clear_mailerlite_login === true) {
    mailerlite_login_email_enc = null;
    mailerlite_login_password_enc = null;
  }

  const approvalEmails =
    payload.approval_emails !== undefined
      ? JSON.stringify(
          Array.isArray(payload.approval_emails)
            ? payload.approval_emails
            : String(payload.approval_emails || "")
                .split(/[,;\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
        )
      : current.approval_emails || JSON.stringify([]);

  const runDays =
    payload.automation_run_days !== undefined
      ? JSON.stringify(
          Array.isArray(payload.automation_run_days)
            ? payload.automation_run_days
            : [Number(payload.automation_run_days) || 1],
        )
      : current.automation_run_days || JSON.stringify(DEFAULTS.automation_run_days);

  await blogDb.query(
    `INSERT INTO blog_2_0_settings
      (id, project_name, client_site_url, client_blog_url, website_mode, newsletter_mode,
       mailerlite_enabled, mailerlite_api_key_enc, mailerlite_api_key_hint,
       mailerlite_from_email, mailerlite_from_name, mailerlite_group_id,
       mailerlite_site_id, mailerlite_bot_enabled, mailerlite_bot_auto_push,
       mailerlite_login_email_enc, mailerlite_login_password_enc,
       approval_emails, teams_webhook_url, timezone, automation_frequency,
       automation_run_days, automation_run_time, newsletter_send_timing, newsletter_send_time,
       notes, updated_by)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      project_name = VALUES(project_name),
      client_site_url = VALUES(client_site_url),
      client_blog_url = VALUES(client_blog_url),
      website_mode = VALUES(website_mode),
      newsletter_mode = VALUES(newsletter_mode),
      mailerlite_enabled = VALUES(mailerlite_enabled),
      mailerlite_api_key_enc = VALUES(mailerlite_api_key_enc),
      mailerlite_api_key_hint = VALUES(mailerlite_api_key_hint),
      mailerlite_from_email = VALUES(mailerlite_from_email),
      mailerlite_from_name = VALUES(mailerlite_from_name),
      mailerlite_group_id = VALUES(mailerlite_group_id),
      mailerlite_site_id = VALUES(mailerlite_site_id),
      mailerlite_bot_enabled = VALUES(mailerlite_bot_enabled),
      mailerlite_bot_auto_push = VALUES(mailerlite_bot_auto_push),
      mailerlite_login_email_enc = VALUES(mailerlite_login_email_enc),
      mailerlite_login_password_enc = VALUES(mailerlite_login_password_enc),
      approval_emails = VALUES(approval_emails),
      teams_webhook_url = VALUES(teams_webhook_url),
      timezone = VALUES(timezone),
      automation_frequency = VALUES(automation_frequency),
      automation_run_days = VALUES(automation_run_days),
      automation_run_time = VALUES(automation_run_time),
      newsletter_send_timing = VALUES(newsletter_send_timing),
      newsletter_send_time = VALUES(newsletter_send_time),
      notes = VALUES(notes),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP`,
    [
      payload.project_name || current.project_name || DEFAULTS.project_name,
      payload.client_site_url ?? current.client_site_url ?? null,
      payload.client_blog_url ?? current.client_blog_url ?? null,
      payload.website_mode || current.website_mode || DEFAULTS.website_mode,
      payload.newsletter_mode || current.newsletter_mode || DEFAULTS.newsletter_mode,
      payload.mailerlite_enabled !== undefined
        ? payload.mailerlite_enabled ? 1 : 0
        : current.mailerlite_enabled || 0,
      mailerlite_api_key_enc,
      mailerlite_api_key_hint,
      payload.mailerlite_from_email ?? current.mailerlite_from_email ?? null,
      payload.mailerlite_from_name ?? current.mailerlite_from_name ?? null,
      payload.mailerlite_group_id ?? current.mailerlite_group_id ?? null,
      payload.mailerlite_site_id ?? current.mailerlite_site_id ?? DEFAULTS.mailerlite_site_id,
      payload.mailerlite_bot_enabled !== undefined
        ? payload.mailerlite_bot_enabled ? 1 : 0
        : current.mailerlite_bot_enabled || 0,
      payload.mailerlite_bot_auto_push !== undefined
        ? payload.mailerlite_bot_auto_push ? 1 : 0
        : current.mailerlite_bot_auto_push || 0,
      mailerlite_login_email_enc,
      mailerlite_login_password_enc,
      approvalEmails,
      payload.teams_webhook_url ?? current.teams_webhook_url ?? null,
      payload.timezone || current.timezone || DEFAULTS.timezone,
      payload.automation_frequency ||
        current.automation_frequency ||
        DEFAULTS.automation_frequency,
      runDays,
      payload.automation_run_time ||
        current.automation_run_time ||
        DEFAULTS.automation_run_time,
      payload.newsletter_send_timing ||
        current.newsletter_send_timing ||
        DEFAULTS.newsletter_send_timing,
      payload.newsletter_send_time ||
        current.newsletter_send_time ||
        DEFAULTS.newsletter_send_time,
      payload.notes ?? current.notes ?? null,
      updatedBy,
    ],
  );

  return getSettings();
}

export function buildSetupChecklist(settings) {
  const items = [
    {
      id: "mailerlite_api",
      label: "MailerLite API token",
      done: Boolean(settings.has_mailerlite_api_key),
      required: true,
      hint: "MailerLite → Integrations → MailerLite API → Generate token",
    },
    {
      id: "mailerlite_sender",
      label: "Verified sender email + name",
      done: Boolean(settings.mailerlite_from_email && settings.mailerlite_from_name),
      required: true,
      hint: "From address must be verified in MailerLite",
    },
    {
      id: "mailerlite_group",
      label: "Subscriber group ID",
      done: Boolean(settings.mailerlite_group_id),
      required: true,
      hint: "Audience for newsletter campaigns",
    },
    {
      id: "approval_emails",
      label: "Team approval emails",
      done: (settings.approval_emails || []).length > 0,
      required: true,
      hint: "Who receives draft preview + approve links",
    },
    {
      id: "client_site",
      label: "Client website URL",
      done: Boolean(settings.client_site_url),
      required: false,
      hint: "Bright CRM / MailerLite preview site URL",
    },
    {
      id: "teams",
      label: "Microsoft Teams webhook (optional)",
      done: Boolean(settings.teams_webhook_url),
      required: false,
      hint: "Channel notifications when a draft is ready",
    },
    {
      id: "ai_keys",
      label: "AI keys (Connect → AI Integrations)",
      done: null,
      required: true,
      hint: "Claude/Gemini/Perplexity + image model — configured by super admin",
    },
    {
      id: "public_url",
      label: "BACKEND_PUBLIC_URL on server",
      done: null,
      required: true,
      hint: "Needed for approve/preview email links",
    },
  ];

  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.done === true).length;
  const requiredKnown = required.filter((i) => i.done !== null).length;

  return {
    items,
    ready_percent: requiredKnown
      ? Math.round((requiredDone / requiredKnown) * 100)
      : 0,
    ready_to_build: required.every((i) => i.done === true || i.done === null),
  };
}
