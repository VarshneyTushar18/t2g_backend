import * as model from "./blog20.model.js";
import * as draftsModel from "./blog20.drafts.model.js";
import { testMailerLiteConnection } from "./blog20.mailerlite.js";
import {
  testMailerLiteBotLogin,
  pushDraftToMailerLite,
} from "./blog20.mailerliteBot.js";
import { getPublicApiBase } from "../agents/automations/blogApproval.email.js";

export async function getOverview(req, res) {
  try {
    const settings = await model.getSettings();
    const checklist = model.buildSetupChecklist(settings);
    res.json({
      success: true,
      project: {
        name: settings.project_name,
        module: "Blog-2.0",
        client: "Bright CRM / MailerLite",
      },
      settings,
      checklist,
      public_api_configured: Boolean(getPublicApiBase()),
      public_api_base: getPublicApiBase() || null,
      phases: [
        { id: 1, label: "Setup & MailerLite connection", status: checklist.ready_percent >= 50 ? "active" : "pending" },
        { id: 2, label: "Newsletter draft campaigns", status: "pending" },
        { id: 3, label: "Scheduled automations", status: "pending" },
        { id: 4, label: "Teams notifications", status: "pending" },
      ],
    });
  } catch (err) {
    console.error("[blog-2.0] overview failed:", err);
    res.status(500).json({ message: err.message || "Failed to load overview" });
  }
}

export async function getSettings(req, res) {
  try {
    const settings = await model.getSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load settings" });
  }
}

export async function updateSettings(req, res) {
  try {
    const settings = await model.upsertSettings(req.body || {}, req.user?.email || null);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to save settings" });
  }
}

export async function testMailerLite(req, res) {
  try {
    const full = await model.getSettingsWithSecret();
    const testKey = String(req.body?.mailerlite_api_key || "").trim() || full.mailerlite_api_key;
    const result = await testMailerLiteConnection(testKey);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "MailerLite test failed" });
  }
}

export async function listDrafts(req, res) {
  try {
    const drafts = await draftsModel.listDrafts({ limit: 50 });
    res.json({ success: true, drafts });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to list drafts" });
  }
}

export async function getDraft(req, res) {
  try {
    const draft = await draftsModel.getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ message: "Draft not found" });
    res.json({ success: true, draft });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load draft" });
  }
}

export async function pushDraftToMailerLiteSite(req, res) {
  try {
    const result = await pushDraftToMailerLite(Number(req.params.id));
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[blog-2.0] bot push failed:", err);
    res.status(err.status || 500).json({
      message: err.message || "MailerLite bot push failed",
    });
  }
}

export async function testMailerLiteBot(req, res) {
  try {
    const result = await testMailerLiteBotLogin();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[blog-2.0] bot test failed:", err);
    res.status(err.status || 500).json({
      message: err.message || "MailerLite bot test failed",
    });
  }
}

export async function getChecklist(req, res) {
  try {
    const settings = await model.getSettings();
    res.json({
      success: true,
      checklist: model.buildSetupChecklist(settings),
      settings,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to load checklist" });
  }
}
