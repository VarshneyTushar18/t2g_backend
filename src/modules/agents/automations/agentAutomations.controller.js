import * as model from "./agentAutomations.model.js";
import {
  runAutomationNow,
  sendTestSampleEmail,
} from "./agentAutomations.service.js";

function handleError(res, err, fallback) {
  console.error(fallback, err);
  res.status(err.status || 500).json({ error: err.message || fallback });
}

function currentUserId(req) {
  return req.user?.sub || req.user?.id || null;
}

function parseEmailList(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export async function getSettings(_req, res) {
  try {
    const settings = await model.getSettings();
    res.json({ settings });
  } catch (err) {
    handleError(res, err, "Failed to load settings");
  }
}

export async function updateSettings(req, res) {
  try {
    const body = req.body || {};
    const mode = String(body.mode || "pending_email");
    const approval_emails = parseEmailList(body.approval_emails);

    if (mode !== "draft_only" && !approval_emails.length) {
      return res.status(400).json({
        error: "Add at least one sample blog email when using email modes",
      });
    }

    const invalid = approval_emails.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({
        error: `Invalid email(s): ${invalid.join(", ")}`,
      });
    }

    const settings = await model.upsertSettings({
      enabled: Boolean(body.enabled),
      timezone: String(body.timezone || "Asia/Kolkata"),
      window_start: body.window_start || null,
      window_end: body.window_end || null,
      run_time: String(body.run_time || "10:00"),
      run_days: Array.isArray(body.run_days) ? body.run_days.map(Number) : [],
      posts_per_run: Number(body.posts_per_run || 1),
      mode,
      approval_emails,
    });
    res.json({ settings });
  } catch (err) {
    handleError(res, err, "Failed to save settings");
  }
}

export async function listTopics(req, res) {
  try {
    const topics = await model.listTopics({
      status: req.query?.status ? String(req.query.status) : "",
      includeInactive: String(req.query?.include_inactive || "false") === "true",
    });
    res.json({ topics });
  } catch (err) {
    handleError(res, err, "Failed to load topics");
  }
}

export async function createTopic(req, res) {
  try {
    const body = req.body || {};
    const topic = String(body.topic || "").trim();
    if (!topic) {
      return res.status(400).json({ error: "topic is required" });
    }
    const created = await model.createTopic({
      topic,
      notes: body.notes || "",
      author_name: body.author_name || "",
      category_ids: Array.isArray(body.category_ids) ? body.category_ids : [],
      tags: Array.isArray(body.tags)
        ? body.tags
        : String(body.tags || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
      priority: Number(body.priority || 0),
      scheduled_for: body.scheduled_for || null,
      created_by: currentUserId(req),
    });
    res.status(201).json({ topic: created });
  } catch (err) {
    handleError(res, err, "Failed to create topic");
  }
}

export async function updateTopic(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid topic id" });
    const body = req.body || {};
    const updated = await model.updateTopic(id, {
      topic: body.topic,
      notes: body.notes,
      author_name: body.author_name,
      category_ids: Array.isArray(body.category_ids) ? body.category_ids : undefined,
      tags: Array.isArray(body.tags)
        ? body.tags
        : body.tags
          ? String(body.tags)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      priority: body.priority,
      scheduled_for: body.scheduled_for,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
      status: body.status,
    });
    if (!updated) return res.status(404).json({ error: "Topic not found" });
    res.json({ topic: updated });
  } catch (err) {
    handleError(res, err, "Failed to update topic");
  }
}

export async function deleteTopic(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid topic id" });
    const ok = await model.deleteTopic(id);
    if (!ok) return res.status(404).json({ error: "Topic not found" });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, "Failed to delete topic");
  }
}

export async function runNow(_req, res) {
  try {
    const result = await runAutomationNow();
    res.json({ result });
  } catch (err) {
    handleError(res, err, "Failed to run automations");
  }
}

export async function testSampleEmail(req, res) {
  try {
    const emails = parseEmailList(req.body?.approval_emails);
    if (!emails.length) {
      const settings = await model.getSettings();
      emails.push(...parseEmailList(settings.approval_emails));
    }
    if (!emails.length) {
      return res.status(400).json({ error: "Add a sample blog email first" });
    }
    const invalid = emails.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({
        error: `Invalid email(s): ${invalid.join(", ")}`,
      });
    }
    await sendTestSampleEmail(emails);
    res.json({ ok: true, sentTo: emails });
  } catch (err) {
    handleError(res, err, "Failed to send test email");
  }
}
