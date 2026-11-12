import * as settingsModel from "./blog20.model.js";
import * as topicsModel from "./blog20.automation.topics.model.js";
import {
  runBlog20AutomationNow,
  describeBlog20ScheduleStatus,
} from "./blog20.automation.service.js";

export async function getAutomationState(req, res) {
  try {
    const settings = await settingsModel.getSettings();
    const topics = await topicsModel.listTopics();
    const scheduleStatus = describeBlog20ScheduleStatus(settings);
    res.json({
      settings: {
        automation_enabled: Boolean(settings.automation_enabled),
        automation_frequency: settings.automation_frequency,
        automation_run_days: settings.automation_run_days,
        automation_run_time: settings.automation_run_time,
        automation_posts_per_run: settings.automation_posts_per_run,
        automation_topic_source: settings.automation_topic_source,
        automation_auto_niche: settings.automation_auto_niche,
        automation_posts_stagger_seconds: settings.automation_posts_stagger_seconds,
        automation_last_run_at: settings.automation_last_run_at || null,
        timezone: settings.timezone,
        approval_emails: settings.approval_emails || [],
      },
      topics,
      scheduleStatus,
    });
  } catch (err) {
    console.error("[blog20-automations] get state failed:", err);
    res.status(500).json({ message: err.message || "Failed to load automations" });
  }
}

export async function updateAutomationSettings(req, res) {
  try {
    const settings = await settingsModel.upsertAutomationSettings(req.body || {}, req.user?.email);
    res.json({ settings, scheduleStatus: describeBlog20ScheduleStatus(settings) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Failed to save" });
  }
}

export async function createAutomationTopic(req, res) {
  try {
    const topic = String(req.body?.topic || "").trim();
    if (!topic) {
      return res.status(400).json({ message: "Topic is required" });
    }
    const row = await topicsModel.createTopic({
      topic,
      notes: req.body?.notes || "",
      priority: Number(req.body?.priority || 0),
      scheduled_for: req.body?.scheduled_for || null,
      created_by: req.user?.email || req.user?.sub || "admin",
    });
    res.status(201).json({ topic: row });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to add topic" });
  }
}

export async function updateAutomationTopic(req, res) {
  try {
    const id = Number(req.params.id);
    const topic = await topicsModel.updateTopic(id, req.body || {});
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    res.json({ topic });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to update topic" });
  }
}

export async function deleteAutomationTopic(req, res) {
  try {
    const ok = await topicsModel.deleteTopic(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Topic not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete topic" });
  }
}

export async function retryAutomationTopic(req, res) {
  try {
    const topic = await topicsModel.requeueTopic(Number(req.params.id));
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    res.json({ topic });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to retry topic" });
  }
}

export async function runAutomationNowHandler(req, res) {
  try {
    const bootstrapResearch = Boolean(req.body?.bootstrap_research);
    const result = await runBlog20AutomationNow({ bootstrapResearch });
    res.json(result);
  } catch (err) {
    console.error("[blog20-automations] run now failed:", err);
    res.status(500).json({ message: err.message || "Run failed" });
  }
}
