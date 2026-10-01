import * as model from "./blog20.model.js";
import * as draftsModel from "./blog20.drafts.model.js";
import { testMailerLiteConnection } from "./blog20.mailerlite.js";
import {
  testMailerLiteBotLogin,
  pushDraftToMailerLite,
  getMailerLiteBotStatus,
  submitMailerLiteBotOtp,
} from "./blog20.mailerliteBot.js";
import { getPublicApiBase } from "../agents/automations/blogApproval.email.js";
import {
  handleBlog20SignedAction,
  requestBlog20DraftApproval,
  sendTestBlog20ApprovalEmail,
} from "./blog20.approval.service.js";

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

export async function deleteDraft(req, res) {
  try {
    const draft = await draftsModel.deleteDraftById(req.params.id);
    if (!draft) return res.status(404).json({ message: "Draft not found" });
    res.json({
      success: true,
      deleted_id: draft.id,
      note:
        draft.mailerlite_push_status === "pushed"
          ? "Removed from Blog-2.0 Admin only. The post on MailerLite was not deleted."
          : "Draft deleted from Blog-2.0.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete draft" });
  }
}

export async function pushDraftToMailerLiteSite(req, res) {
  try {
    const result = await pushDraftToMailerLite(Number(req.params.id), {
      publishLive: Boolean(req.body?.publish_live),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[blog-2.0] bot push failed:", err.message || err);
    if (err.message?.includes("disabled") || err.name === "TimeoutError") {
      console.error(
        "[blog-2.0] Hint: check uploads/blog20-bot-debug/ and pm2 logs for [blog-2.0-bot] steps",
      );
    }
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

export async function getMailerLiteBotStatusHandler(req, res) {
  try {
    const status = await getMailerLiteBotStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.message || "Failed to load MailerLite bot status",
    });
  }
}

export async function submitMailerLiteBotOtpHandler(req, res) {
  try {
    const code = req.body?.code ?? req.body?.otp ?? "";
    const result = await submitMailerLiteBotOtp(code);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.message || "Failed to submit MailerLite OTP",
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

/** Public: GET /api/blog-2.0/approvals/go?token=... */
export async function goBlog20Approval(req, res) {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send("<h1>Missing token</h1><p>Open the link from your email.</p>");
    }
    const result = await handleBlog20SignedAction({
      token,
      actorEmail: req.query.email || null,
    });
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[blog20-approval] go failed:", err);
    res
      .status(500)
      .type("html")
      .send("<h1>Something went wrong</h1><p>Please try again or contact admin.</p>");
  }
}

export async function requestDraftApproval(req, res) {
  try {
    const draft = await draftsModel.getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ message: "Draft not found" });
    const settings = await model.getSettings();
    const result = await requestBlog20DraftApproval({
      draft,
      requestedBy: req.user?.email || req.user?.sub || "admin",
      requesterEmail: req.user?.email || null,
      approvalEmails: settings.approval_emails,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.message || "Failed to send approval email",
    });
  }
}

export async function testBlog20ApprovalEmail(req, res) {
  try {
    const settings = await model.getSettings();
    const recipients =
      req.body?.emails ||
      req.body?.approval_emails ||
      settings.approval_emails;
    const result = await sendTestBlog20ApprovalEmail(recipients);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.message || "Failed to send test approval email",
    });
  }
}
