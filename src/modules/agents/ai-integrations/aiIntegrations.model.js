import crypto from "crypto";
import pool from "../../../config/db.js";

const PROVIDERS = {
  openrouter: {
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    hint: "One key for GPT, Claude, Gemini models via OpenRouter",
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    hint: "Direct OpenAI API key",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    hint: "Requires OpenRouter or compatible gateway for Agents SDK today — prefer OpenRouter model anthropic/…",
  },
  google: {
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
    hint: "Gemini via OpenAI-compatible endpoint, or use OpenRouter google/… models",
  },
};

function encryptionKey() {
  const secret = process.env.AI_SETTINGS_SECRET || process.env.JWT_SECRET || "tech2globe-ai-fallback";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload) {
  if (!payload) return null;
  try {
    const buf = Buffer.from(String(payload), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function maskKey(hint) {
  if (!hint) return null;
  return hint;
}

function makeHint(apiKey) {
  const key = String(apiKey || "");
  if (key.length < 8) return key ? "••••" : null;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function mapPublic(row) {
  if (!row) {
    return {
      provider: "openrouter",
      providers: PROVIDERS,
      has_api_key: false,
      api_key_hint: null,
      base_url: PROVIDERS.openrouter.defaultBaseUrl,
      default_model: PROVIDERS.openrouter.defaultModel,
      image_model: "",
      site_url: "",
      site_name: "Tech2Globe Agents",
      enabled: true,
      source: "defaults",
      updated_at: null,
    };
  }
  const provider = row.provider || "openrouter";
  const meta = PROVIDERS[provider] || PROVIDERS.openrouter;
  return {
    provider,
    providers: PROVIDERS,
    has_api_key: Boolean(row.api_key_enc),
    api_key_hint: maskKey(row.api_key_hint),
    base_url: row.base_url || meta.defaultBaseUrl,
    default_model: row.default_model || meta.defaultModel,
    image_model: row.image_model || "",
    site_url: row.site_url || "",
    site_name: row.site_name || "Tech2Globe Agents",
    enabled: Boolean(Number(row.enabled)),
    source: "database",
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null,
  };
}

export async function ensureAiIntegrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_integrations (
      id TINYINT PRIMARY KEY DEFAULT 1,
      provider VARCHAR(64) NOT NULL DEFAULT 'openrouter',
      api_key_enc TEXT NULL,
      api_key_hint VARCHAR(32) NULL,
      base_url VARCHAR(500) NULL,
      default_model VARCHAR(255) NOT NULL DEFAULT 'openai/gpt-4o-mini',
      image_model VARCHAR(255) NULL,
      site_url VARCHAR(500) NULL,
      site_name VARCHAR(255) NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_by VARCHAR(128) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  const [rows] = await pool.query("SELECT id FROM ai_integrations WHERE id = 1");
  if (!rows.length) {
    await pool.query(
      `INSERT INTO ai_integrations (id, provider, default_model, enabled)
       VALUES (1, 'openrouter', 'openai/gpt-4o-mini', 1)`,
    );
  }
}

export async function getPublicSettings() {
  try {
    await ensureAiIntegrationsTable();
    const [rows] = await pool.query("SELECT * FROM ai_integrations WHERE id = 1 LIMIT 1");
    return mapPublic(rows[0]);
  } catch (err) {
    console.error("[ai-integrations] getPublicSettings:", err.message);
    return mapPublic(null);
  }
}

/** Runtime config used by agents — includes decrypted key + env fallback */
export async function getRuntimeConfig() {
  let row = null;
  try {
    await ensureAiIntegrationsTable();
    const [rows] = await pool.query("SELECT * FROM ai_integrations WHERE id = 1 LIMIT 1");
    row = rows[0] || null;
  } catch (err) {
    console.error("[ai-integrations] getRuntimeConfig DB:", err.message);
  }

  const dbEnabled = row ? Boolean(Number(row.enabled)) : false;
  const hasDbSecret = Boolean(row?.api_key_enc);
  const dbKey = dbEnabled && hasDbSecret ? decryptSecret(row.api_key_enc) : null;
  const envKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";

  // If DB settings are on and a key is stored, never silently fall back to .env
  // (that caused OpenAI UI + OpenRouter env key mismatches / 401s).
  let apiKey = "";
  let source = "none";
  if (dbEnabled && hasDbSecret) {
    if (dbKey) {
      apiKey = dbKey;
      source = "database";
    } else {
      source = "decrypt_error";
    }
  } else if (envKey) {
    apiKey = envKey;
    source = "env";
  }

  const provider = row?.provider || "openrouter";
  const meta = PROVIDERS[provider] || PROVIDERS.openrouter;

  return {
    provider,
    apiKey,
    baseURL:
      row?.base_url ||
      process.env.OPENROUTER_BASE_URL ||
      meta.defaultBaseUrl,
    defaultModel:
      row?.default_model ||
      process.env.AGENT_MODEL ||
      meta.defaultModel,
    imageModel:
      row?.image_model ||
      process.env.IMAGE_AGENT_MODEL ||
      "",
    siteUrl:
      row?.site_url ||
      process.env.OPENROUTER_SITE_URL ||
      "https://manageadmin.tech2globe.tech",
    siteName:
      row?.site_name ||
      process.env.OPENROUTER_SITE_NAME ||
      "Tech2Globe Agents",
    enabled: row ? dbEnabled : true,
    source,
    configured: Boolean(apiKey),
  };
}

export async function upsertSettings(payload, updatedBy) {
  await ensureAiIntegrationsTable();
  const [rows] = await pool.query("SELECT * FROM ai_integrations WHERE id = 1 LIMIT 1");
  const current = rows[0] || {};

  const provider = String(payload.provider || current.provider || "openrouter");
  const meta = PROVIDERS[provider] || PROVIDERS.openrouter;

  let api_key_enc = current.api_key_enc || null;
  let api_key_hint = current.api_key_hint || null;
  const incomingKey = String(payload.api_key || "").trim();
  if (incomingKey) {
    api_key_enc = encryptSecret(incomingKey);
    api_key_hint = makeHint(incomingKey);
  }
  if (payload.clear_api_key === true) {
    api_key_enc = null;
    api_key_hint = null;
  }

  await pool.query(
    `INSERT INTO ai_integrations
      (id, provider, api_key_enc, api_key_hint, base_url, default_model, image_model, site_url, site_name, enabled, updated_by)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider = VALUES(provider),
      api_key_enc = VALUES(api_key_enc),
      api_key_hint = VALUES(api_key_hint),
      base_url = VALUES(base_url),
      default_model = VALUES(default_model),
      image_model = VALUES(image_model),
      site_url = VALUES(site_url),
      site_name = VALUES(site_name),
      enabled = VALUES(enabled),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP`,
    [
      provider,
      api_key_enc,
      api_key_hint,
      payload.base_url || meta.defaultBaseUrl,
      payload.default_model || meta.defaultModel,
      payload.image_model || null,
      payload.site_url || null,
      payload.site_name || "Tech2Globe Agents",
      payload.enabled === false ? 0 : 1,
      updatedBy ? String(updatedBy) : null,
    ],
  );

  return getPublicSettings();
}

export { PROVIDERS };
