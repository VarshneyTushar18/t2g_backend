import * as automationService from "./careerAutomations.service.js";
import * as topicModel from "./careerAutomations.model.js";
import { sendTestApprovalEmail } from "./careerApproval.service.js";
import * as approvalModel from "./careerApproval.model.js";

function handleError(res, err, fallback) {
  console.error(fallback, err);
  res.status(err.status || 500).json({ error: err.message || fallback });
}

function parseEmailList(value) {
  if (Array.isArray(value)) {
    return value.map((e) => String(e || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getDashboard(req, res) {
  try {
    const data = await automationService.getAutomationsDashboard();
    res.json(data);
  } catch (err) {
    handleError(res, err, "Failed to load career automations");
  }
}

export async function saveSettings(req, res) {
  try {
    const body = req.body || {};
    const settings = await automationService.saveAutomationsSettings(
      {
        ...body,
        approval_emails: body.approval_emails
          ? parseEmailList(body.approval_emails)
          : undefined,
        schedule_run_days: Array.isArray(body.schedule_run_days)
          ? body.schedule_run_days
          : undefined,
      },
      req.user?.email || req.user?.sub || null,
    );
    res.json({ settings });
  } catch (err) {
    handleError(res, err, "Failed to save career automations");
  }
}

export async function listTopics(req, res) {
  try {
    const topics = await topicModel.listTopics();
    res.json({ topics });
  } catch (err) {
    handleError(res, err, "Failed to list topics");
  }
}

export async function createTopic(req, res) {
  try {
    const { title_hint, notes, priority } = req.body || {};
    if (!String(title_hint || "").trim()) {
      return res.status(400).json({ error: "title_hint is required" });
    }
    const topic = await topicModel.createTopic({
      title_hint,
      notes,
      priority,
      created_by: req.user?.email || req.user?.sub || null,
    });
    res.status(201).json({ topic });
  } catch (err) {
    handleError(res, err, "Failed to create topic");
  }
}

export async function deleteTopic(req, res) {
  try {
    await topicModel.deleteTopic(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, "Failed to delete topic");
  }
}

export async function runNow(req, res) {
  try {
    const result = await automationService.runCareerAutomationNow();
    res.json({ ok: true, ...result });
  } catch (err) {
    handleError(res, err, "Run now failed");
  }
}

export async function testScheduleEmail(req, res) {
  try {
    const settings = await approvalModel.getSettings();
    const mode = settings.schedule_mode || "publish_email";

    if (mode === "publish_email") {
      const emails = parseEmailList(
        req.body?.approval_emails ?? settings.approval_emails,
      );
      const result = await sendTestApprovalEmail(emails);
      return res.json({
        ok: true,
        mode: "publish_email",
        ...result,
        note:
          "Sent the full HR publish email (sample job + Yes/No + live jobs). Live cron uses AI to draft a real job then sends the same style of email.",
      });
    }

    const result = await automationService.sendTestScheduleGateEmail();
    res.json({ ok: true, ...result });
  } catch (err) {
    handleError(res, err, "Test schedule email failed");
  }
}
