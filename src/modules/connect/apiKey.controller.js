import * as ApiKeyModel from "./apiKey.model.js";

export const listKeys = async (_req, res) => {
  try {
    const data = await ApiKeyModel.listApiKeys();
    res.json({ data });
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        message: "API keys table missing. Run sql/api_keys.sql in your database.",
      });
    }
    console.error("listKeys:", err);
    res.status(500).json({ message: "Failed to load API keys" });
  }
};

export const createKey = async (req, res) => {
  try {
    const { name, modules, readOnly } = req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    const created = await ApiKeyModel.createApiKey({
      name: name.trim(),
      modules: modules || [],
      readOnly: readOnly !== false,
      createdBy: req.user?.sub || req.user?.id || null,
    });
    res.status(201).json({
      message: "API key created. Copy it now — it won't be shown again.",
      data: created,
    });
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        message: "API keys table missing. Run sql/api_keys.sql in your database.",
      });
    }
    if (err.message === "Select at least one valid module") {
      return res.status(400).json({ message: err.message });
    }
    console.error("createKey:", err);
    res.status(500).json({ message: "Failed to create API key" });
  }
};

export const revokeKey = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid key id" });
    const revoked = await ApiKeyModel.revokeApiKey(id);
    if (!revoked) {
      return res.status(404).json({ message: "API key not found or already revoked" });
    }
    res.json({ message: "API key revoked" });
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        message: "API keys table missing. Run sql/api_keys.sql in your database.",
      });
    }
    console.error("revokeKey:", err);
    res.status(500).json({ message: "Failed to revoke API key" });
  }
};
