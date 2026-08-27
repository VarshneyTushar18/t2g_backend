import * as approvalModel from "./careerApproval.model.js";
import * as approvalService from "./careerApproval.service.js";

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

/** Public: GET /api/career/approvals/go?token=... */
export async function go(req, res) {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send("<h1>Missing token</h1><p>Open the link from your email.</p>");
    }
    const result = await approvalService.handleSignedAction({
      token,
      actorEmail: req.query.email || null,
    });
    res.status(result.status).type("html").send(result.html);
  } catch (err) {
    console.error("[career-approval] go failed:", err);
    res
      .status(500)
      .type("html")
      .send("<h1>Something went wrong</h1><p>Please try again or contact admin.</p>");
  }
}

export async function getDashboard(req, res) {
  try {
    const data = await approvalService.getApprovalDashboard();
    res.json(data);
  } catch (err) {
    handleError(res, err, "Failed to load approval dashboard");
  }
}

export async function getSettings(req, res) {
  try {
    const settings = await approvalModel.getSettings();
    res.json({
      settings,
      publicApiConfigured: Boolean(
        process.env.BACKEND_PUBLIC_URL ||
          process.env.API_PUBLIC_URL ||
          process.env.PUBLIC_API_URL ||
          process.env.SITE_URL,
      ),
      publicApiBase:
        process.env.BACKEND_PUBLIC_URL ||
        process.env.API_PUBLIC_URL ||
        process.env.PUBLIC_API_URL ||
        process.env.SITE_URL ||
        null,
    });
  } catch (err) {
    handleError(res, err, "Failed to load approval settings");
  }
}

export async function saveSettings(req, res) {
  try {
    const body = req.body || {};
    const settings = await approvalModel.saveSettings(
      {
        enabled: body.enabled,
        require_hr_approval: body.require_hr_approval,
        approval_emails: parseEmailList(body.approval_emails),
        reminder_hours: body.reminder_hours,
        max_reminders: body.max_reminders,
        expiry_hours: body.expiry_hours,
      },
      req.user?.email || req.user?.sub || null,
    );
    res.json({ settings });
  } catch (err) {
    handleError(res, err, "Failed to save approval settings");
  }
}

export async function testEmail(req, res) {
  try {
    const emails = parseEmailList(req.body?.approval_emails);
    const result = await approvalService.sendTestApprovalEmail(emails);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleError(res, err, "Failed to send test email");
  }
}

export async function resend(req, res) {
  try {
    const jobId = Number(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: "jobId required" });
    const result = await approvalService.resendApprovalForJob(jobId, req.user);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleError(res, err, "Failed to resend approval");
  }
}
