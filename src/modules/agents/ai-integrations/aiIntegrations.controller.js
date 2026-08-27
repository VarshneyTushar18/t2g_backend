import * as model from "./aiIntegrations.model.js";
import { resetAgentClient } from "../lib/openai.js";

function handleError(res, err, fallback) {
  console.error(fallback, err);
  res.status(err.status || 500).json({ error: err.message || fallback });
}

export async function getSettings(_req, res) {
  try {
    const settings = await model.getPublicSettings();
    const runtime = await model.getRuntimeConfig();
    res.json({
      settings: {
        ...settings,
        runtime_source: runtime.source,
        runtime_configured: runtime.configured,
        runtime_model: runtime.defaultModel,
      },
    });
  } catch (err) {
    handleError(res, err, "Failed to load AI settings");
  }
}

export async function updateSettings(req, res) {
  try {
    const body = req.body || {};
    const settings = await model.upsertSettings(body, req.user?.sub || req.user?.email);
    resetAgentClient();
    res.json({ settings, message: "AI settings saved. Agents will use the new config." });
  } catch (err) {
    handleError(res, err, "Failed to save AI settings");
  }
}

export async function testSettings(_req, res) {
  try {
    const runtime = await model.getRuntimeConfig();
    if (!runtime.configured) {
      return res.status(400).json({
        ok: false,
        error: "No API key configured in Admin or .env",
      });
    }
    res.json({
      ok: true,
      provider: runtime.provider,
      model: runtime.defaultModel,
      source: runtime.source,
      baseURL: runtime.baseURL,
      message: `Ready via ${runtime.source} (${runtime.provider})`,
    });
  } catch (err) {
    handleError(res, err, "AI settings test failed");
  }
}
