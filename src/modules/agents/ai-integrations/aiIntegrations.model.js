import crypto from "crypto";
import pool from "../../../config/db.js";

const PROVIDERS = {
  openrouter: {
    label: "OpenRouter (multi-model)",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    imageModel: "google/gemini-2.5-flash-image-preview",
    hint: "One OpenRouter key can run GPT, Claude, Gemini, and image models. Recommended.",
    suggestedModels: [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.0-flash",
      "google/gemini-2.5-flash",
      "perplexity/sonar",
      "perplexity/sonar-pro",
    ],
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    imageModel: "",
    hint: "Paste your OpenAI API key (sk-…). Text models only — use Image model via OpenRouter/Gemini for Image Agent.",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"],
  },
  claude: {
    label: "Claude (Anthropic via OpenRouter)",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    imageModel: "google/gemini-2.5-flash-image-preview",
    hint: "Paste an OpenRouter key and use a Claude model id (anthropic/…). Direct Anthropic keys are not supported by the Agents SDK — use OpenRouter.",
    suggestedModels: [
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3.5-haiku",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-3-opus",
    ],
  },
  gemini: {
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
    imageModel: "gemini-2.0-flash-preview-image-generation",
    hint: "Paste your Google AI Studio / Gemini API key. Uses Google's OpenAI-compatible endpoint.",
    suggestedModels: [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-pro",
      "gemini-2.0-flash-lite",
    ],
  },
  perplexity: {
    label: "Perplexity",
    defaultBaseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    imageModel: "",
    hint: "Paste your Perplexity API key. Good for research-style answers. Image Agent still needs an image-capable model (set Image API separately or use OpenRouter).",
    suggestedModels: ["sonar", "sonar-pro", "sonar-reasoning"],
  },
  // Keep legacy keys so older saved settings still resolve
  anthropic: {
    label: "Claude (legacy → use Claude option)",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    imageModel: "google/gemini-2.5-flash-image-preview",
    hint: "Legacy provider id. Prefer the Claude provider. Use an OpenRouter key.",
    suggestedModels: [
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-sonnet-4",
    ],
  },
  google: {
    label: "Google Gemini (legacy → use Gemini option)",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
    imageModel: "gemini-2.0-flash-preview-image-generation",
    hint: "Legacy provider id. Prefer the Gemini provider.",
    suggestedModels: ["gemini-2.0-flash", "gemini-2.5-flash"],
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
      has_image_api_key: false,
      image_api_key_hint: null,
      image_base_url: "",
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
    has_image_api_key: Boolean(row.image_api_key_enc),
    image_api_key_hint: maskKey(row.image_api_key_hint),
    image_base_url: row.image_base_url || "",
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
      image_api_key_enc TEXT NULL,
      image_api_key_hint VARCHAR(32) NULL,
      image_base_url VARCHAR(500) NULL,
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

  // Migrations for separate image API credentials
  const imageCols = [
    {
      col: "image_api_key_enc",
      sql: "ALTER TABLE ai_integrations ADD COLUMN image_api_key_enc TEXT NULL AFTER image_model",
    },
    {
      col: "image_api_key_hint",
      sql: "ALTER TABLE ai_integrations ADD COLUMN image_api_key_hint VARCHAR(32) NULL AFTER image_api_key_enc",
    },
    {
      col: "image_base_url",
      sql: "ALTER TABLE ai_integrations ADD COLUMN image_base_url VARCHAR(500) NULL AFTER image_api_key_hint",
    },
  ];
  for (const { col, sql } of imageCols) {
    const [exists] = await pool.query(
      "SHOW COLUMNS FROM ai_integrations LIKE ?",
      [col],
    );
    if (!exists.length) await pool.query(sql);
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

  const imageModel =
    row?.image_model ||
    process.env.IMAGE_AGENT_MODEL ||
    "";

  // Separate image API (optional). Falls back to chat API key if not set.
  const hasImageDbSecret = Boolean(row?.image_api_key_enc);
  const imageDbKey =
    dbEnabled && hasImageDbSecret ? decryptSecret(row.image_api_key_enc) : null;
  const imageEnvKey = process.env.IMAGE_API_KEY || "";
  let imageApiKey = "";
  let imageKeySource = "none";
  if (dbEnabled && hasImageDbSecret) {
    if (imageDbKey) {
      imageApiKey = imageDbKey;
      imageKeySource = "database_image";
    } else {
      imageKeySource = "decrypt_error";
    }
  } else if (imageEnvKey) {
    imageApiKey = imageEnvKey;
    imageKeySource = "env_image";
  } else if (apiKey) {
    imageApiKey = apiKey;
    imageKeySource = source === "database" ? "chat_key" : source;
  }

  const imageBaseURL =
    row?.image_base_url ||
    process.env.IMAGE_API_BASE_URL ||
    row?.base_url ||
    process.env.OPENROUTER_BASE_URL ||
    meta.defaultBaseUrl;

  const imageConfigured = Boolean(imageApiKey && imageModel);

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
    imageModel,
    imageApiKey,
    imageBaseURL,
    imageKeySource,
    imageConfigured,
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

  let image_api_key_enc = current.image_api_key_enc || null;
  let image_api_key_hint = current.image_api_key_hint || null;
  const incomingImageKey = String(payload.image_api_key || "").trim();
  if (incomingImageKey) {
    image_api_key_enc = encryptSecret(incomingImageKey);
    image_api_key_hint = makeHint(incomingImageKey);
  }
  if (payload.clear_image_api_key === true) {
    image_api_key_enc = null;
    image_api_key_hint = null;
  }

  await pool.query(
    `INSERT INTO ai_integrations
      (id, provider, api_key_enc, api_key_hint, base_url, default_model, image_model,
       image_api_key_enc, image_api_key_hint, image_base_url,
       site_url, site_name, enabled, updated_by)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider = VALUES(provider),
      api_key_enc = VALUES(api_key_enc),
      api_key_hint = VALUES(api_key_hint),
      base_url = VALUES(base_url),
      default_model = VALUES(default_model),
      image_model = VALUES(image_model),
      image_api_key_enc = VALUES(image_api_key_enc),
      image_api_key_hint = VALUES(image_api_key_hint),
      image_base_url = VALUES(image_base_url),
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
      image_api_key_enc,
      image_api_key_hint,
      payload.image_base_url || null,
      payload.site_url || null,
      payload.site_name || "Tech2Globe Agents",
      payload.enabled === false ? 0 : 1,
      updatedBy ? String(updatedBy) : null,
    ],
  );

  return getPublicSettings();
}

export { PROVIDERS };
