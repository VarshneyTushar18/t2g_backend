import * as model from "./agentAutomations.model.js";
import * as blogAgentModel from "../blog/blogAgent.model.js";
import { BLOG_AUTOMATION_GUIDELINES_ID } from "../blog/blogAgentAutomationMemory.js";
import {
  runAutomationNow,
  sendTestSampleEmail,
  describeScheduleStatus,
} from "./agentAutomations.service.js";
import { handleSignedAction } from "./blogApproval.service.js";
import {
  showRevisionForm,
  submitRevision,
} from "./blogApproval.revision.js";
import { getPublicApiBase } from "./blogApproval.email.js";

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

/** Public: GET /api/agents/automations/approvals/revise?token=... */
export async function showRevisionFormHandler(req, res) {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send("<h1>Missing token</h1><p>Open the link from your email.</p>");
    }
    const result = await showRevisionForm({ token });
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[blog-approval] revise form failed:", err);
    res
      .status(500)
      .type("html")
      .send("<h1>Something went wrong</h1><p>Please try again or contact admin.</p>");
  }
}

/** Public: POST /api/agents/automations/approvals/revise */
export async function submitRevisionHandler(req, res) {
  try {
    const token = req.body?.token || req.query.token;
    const feedback = req.body?.feedback;
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send("<h1>Missing token</h1><p>Open the link from your email.</p>");
    }
    const result = await submitRevision({
      token,
      feedback,
      actorEmail: req.body?.email || null,
    });
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[blog-approval] revise submit failed:", err);
    res
      .status(500)
      .type("html")
      .send("<h1>Something went wrong</h1><p>Please try again or contact admin.</p>");
  }
}

/** Public: GET /api/agents/automations/approvals/go?token=... */
export async function goApproval(req, res) {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send("<h1>Missing token</h1><p>Open the link from your email.</p>");
    }
    const result = await handleSignedAction({
      token,
      actorEmail: req.query.email || null,
    });
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[blog-approval] go failed:", err);
    res
      .status(500)
      .type("html")
      .send("<h1>Something went wrong</h1><p>Please try again or contact admin.</p>");
  }
}

export async function getSettings(_req, res) {
  try {
    const settings = await model.getSettings();
    const scheduleStatus = describeScheduleStatus(settings);
    res.json({
      settings,
      scheduleStatus,
      publicApiConfigured: Boolean(getPublicApiBase()),
      publicApiBase: getPublicApiBase() || null,
    });
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
        error: "Add at least one approval email when using email modes",
      });
    }

    const invalid = approval_emails.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({
        error: `Invalid email(s): ${invalid.join(", ")}`,
      });
    }

    const topic_source =
      body.topic_source === "auto_trending" ? "auto_trending" : "manual";

    const settingsPatch = {
      enabled: Boolean(body.enabled),
      timezone: String(body.timezone || "Asia/Kolkata"),
      window_start: body.window_start || null,
      window_end: body.window_end || null,
      run_time: String(body.run_time || "10:00"),
      run_days: Array.isArray(body.run_days) ? body.run_days.map(Number) : [],
      posts_per_run: Number(body.posts_per_run || 1),
      mode,
      approval_emails,
      topic_source,
    };
    if (body.auto_niche !== undefined) {
      settingsPatch.auto_niche = String(body.auto_niche || "").trim();
    }
    if (body.auto_default_author_name !== undefined) {
      settingsPatch.auto_default_author_name = String(body.auto_default_author_name || "").trim();
    }
    if (body.auto_default_category_ids !== undefined) {
      settingsPatch.auto_default_category_ids = Array.isArray(body.auto_default_category_ids)
        ? body.auto_default_category_ids.map(Number).filter(Boolean)
        : [];
    }
    if (body.auto_default_tags !== undefined) {
      settingsPatch.auto_default_tags = Array.isArray(body.auto_default_tags)
        ? body.auto_default_tags.map(String).filter(Boolean)
        : [];
    }
    if (body.posts_stagger_seconds !== undefined) {
      settingsPatch.posts_stagger_seconds = Number(body.posts_stagger_seconds);
    }

    const settings = await model.upsertSettings(settingsPatch);
    res.json({
      settings,
      scheduleStatus: describeScheduleStatus(settings),
      publicApiConfigured: Boolean(getPublicApiBase()),
      publicApiBase: getPublicApiBase() || null,
    });
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

export async function requeueTopic(req, res) {
  try {
    const id = Number(req.params.id);
    const topic = await model.requeueTopic(id);
    if (!topic) {
      return res.status(404).json({ error: "Topic not found" });
    }
    res.json({ topic });
  } catch (err) {
    handleError(res, err, "Failed to requeue topic");
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

export async function getAgentMemory(_req, res) {
  try {
    const guidelines = await blogAgentModel.getGuidelines(
      BLOG_AUTOMATION_GUIDELINES_ID,
    );
    res.json({ guidelines });
  } catch (err) {
    handleError(res, err, "Failed to load automation agent memory");
  }
}

export async function updateAgentMemory(req, res) {
  try {
    const content = String(req.body?.content ?? "").trim();
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }
    const guidelines = await blogAgentModel.updateGuidelines(
      content,
      currentUserId(req),
      BLOG_AUTOMATION_GUIDELINES_ID,
    );
    res.json({ guidelines });
  } catch (err) {
    handleError(res, err, "Failed to save automation agent memory");
  }
}

export async function runNow(req, res) {
  try {
    const result = await runAutomationNow({
      bootstrapTrending: Boolean(req.body?.bootstrap_trending),
    });
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
      return res.status(400).json({ error: "Add an approval email first" });
    }
    const invalid = emails.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({
        error: `Invalid email(s): ${invalid.join(", ")}`,
      });
    }
    const result = await sendTestSampleEmail(emails);
    res.json({ ok: true, sentTo: emails, ...result });
  } catch (err) {
    handleError(res, err, "Failed to send test email");
  }
}
