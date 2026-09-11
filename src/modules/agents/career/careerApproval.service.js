import * as approvalModel from "./careerApproval.model.js";
import * as careerModel from "../../career/career.model.js";
import {
  buildApprovalRequestEmail,
  buildDecisionConfirmationEmail,
  buildDecisionUrls,
  getPublicApiBase,
  renderDecisionPage,
  renderPreviewPage,
  sendHtmlEmail,
  verifyApprovalToken,
} from "./careerApproval.email.js";

function parseEmails(value) {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/[,;\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function ownerEmailsFallback() {
  return parseEmails(process.env.OWNER_EMAILS || process.env.TEST_EMAIL || "");
}

export async function resolveHrRecipients(overrideEmails) {
  const settings = await approvalModel.getSettings();
  const fromSettings = parseEmails(settings.approval_emails);
  const fromOverride = parseEmails(overrideEmails);
  const recipients = fromOverride.length
    ? fromOverride
    : fromSettings.length
      ? fromSettings
      : ownerEmailsFallback();
  return { settings, recipients };
}

async function sendApprovalMail({
  approvalId,
  job,
  recipients,
  requesterEmail,
  expiresAt,
  isReminder,
}) {
  const urls = buildDecisionUrls(approvalId, expiresAt);
  if (urls.missingBase) {
    const err = new Error(
      "BACKEND_PUBLIC_URL is not set. Approve/Reject email links need the public API base URL.",
    );
    err.status = 503;
    throw err;
  }

  const mail = buildApprovalRequestEmail({
    job,
    approveUrl: urls.approveUrl,
    rejectUrl: urls.rejectUrl,
    previewUrl: urls.previewUrl,
    requesterEmail,
    expiresAt,
    isReminder,
  });

  const sent = await sendHtmlEmail({
    to: recipients,
    subject: mail.subject,
    html: mail.html,
    replyTo: requesterEmail || undefined,
  });

  return { ...sent, ...urls };
}

/**
 * Create pending approval + email HR (Yes/No publish).
 */
export async function requestHrPublishApproval({
  job,
  requestedBy,
  requesterEmail,
  hrEmails,
}) {
  const { settings, recipients } = await resolveHrRecipients(hrEmails);

  if (!settings.enabled) {
    return { skipped: true, reason: "approvals_disabled" };
  }
  if (!settings.require_hr_approval) {
    return { skipped: true, reason: "require_hr_approval_off" };
  }
  if (!recipients.length) {
    const err = new Error(
      "No HR emails configured. Add them in Admin → Career → Job Approvals (or set OWNER_EMAILS).",
    );
    err.status = 400;
    throw err;
  }
  if (!getPublicApiBase()) {
    const err = new Error(
      "BACKEND_PUBLIC_URL is not set. Approve/Reject email links need the public API base URL.",
    );
    err.status = 503;
    throw err;
  }

  if (job.status !== "pending_approval") {
    await approvalModel.setJobStatus(job.id, "pending_approval");
    job = await careerModel.getJobByIdAdmin(job.id);
  }

  const existing = await approvalModel.getLatestPendingForJob(job.id);
  if (existing) {
    await approvalModel.markDecision(existing.id, "expired", "superseded");
  }

  const approval = await approvalModel.createApproval({
    jobId: job.id,
    requestedBy: requestedBy || "career-agent",
    requesterEmail: requesterEmail || null,
    hrEmails: recipients,
    expiryHours: settings.expiry_hours,
  });

  const sent = await sendApprovalMail({
    approvalId: approval.id,
    job,
    recipients,
    requesterEmail,
    expiresAt: approval.expiresAt,
    isReminder: false,
  });

  return {
    skipped: false,
    approvalId: approval.id,
    jobId: job.id,
    status: "pending_approval",
    recipients: sent.recipients,
    expiresAt: approval.expiresAt,
    approveUrl: sent.approveUrl,
    rejectUrl: sent.rejectUrl,
  };
}

export async function handleSignedAction({ token, actorEmail = null }) {
  let payload;
  try {
    payload = verifyApprovalToken(token);
  } catch {
    return {
      ok: false,
      status: 400,
      html: renderDecisionPage({
        ok: false,
        decision: null,
        jobTitle: null,
        message: "This approval link is invalid or corrupted.",
      }),
    };
  }

  const approval = await approvalModel.getApprovalById(payload.aid);
  if (!approval) {
    return {
      ok: false,
      status: 404,
      html: renderDecisionPage({
        ok: false,
        decision: null,
        jobTitle: null,
        message: "This approval request was not found.",
      }),
    };
  }

  if (payload.act === "preview") {
    const urls = buildDecisionUrls(approval.id, approval.expires_at);
    return {
      ok: true,
      status: 200,
      html: renderPreviewPage({
        job: approval,
        approveUrl: urls.approveUrl,
        rejectUrl: urls.rejectUrl,
        decision: approval.decision,
        expiresAt: approval.expires_at,
      }),
    };
  }

  if (payload.act !== "approve" && payload.act !== "reject") {
    return {
      ok: false,
      status: 400,
      html: renderDecisionPage({
        ok: false,
        decision: null,
        jobTitle: approval.title,
        message: "Unknown action in approval link.",
      }),
    };
  }

  if (approval.decision !== "pending") {
    return {
      ok: false,
      status: 409,
      html: renderDecisionPage({
        ok: false,
        decision: approval.decision,
        jobTitle: approval.title,
        message: `This request was already ${approval.decision}. No further action was taken.`,
      }),
    };
  }

  if (new Date(approval.expires_at).getTime() < Date.now()) {
    await approvalModel.markDecision(approval.id, "expired", actorEmail);
    if (approval.job_status === "pending_approval") {
      await approvalModel.setJobStatus(approval.job_id, "rejected");
    }
    return {
      ok: false,
      status: 410,
      html: renderDecisionPage({
        ok: false,
        decision: "expired",
        jobTitle: approval.title,
        message: "This approval link has expired. Ask the Career Agent to resend approval.",
      }),
    };
  }

  const wantApprove = payload.act === "approve";
  const decision = wantApprove ? "approved" : "rejected";
  const jobStatus = wantApprove ? "active" : "rejected";

  const updated = await approvalModel.markDecision(
    approval.id,
    decision,
    actorEmail,
  );
  if (!updated || updated.decision !== decision) {
    return {
      ok: false,
      status: 409,
      html: renderDecisionPage({
        ok: false,
        decision: updated?.decision || null,
        jobTitle: approval.title,
        message: "Could not record decision — it may have been decided by someone else.",
      }),
    };
  }

  const publishedJob = await approvalModel.setJobStatus(
    approval.job_id,
    jobStatus,
  );

  try {
    const recipients = [
      ...parseEmails(approval.hr_emails),
      ...parseEmails(approval.requester_email),
    ];
    const mail = buildDecisionConfirmationEmail({
      job: publishedJob || approval,
      decision,
      decidedByEmail: actorEmail,
    });
    await sendHtmlEmail({
      to: recipients,
      subject: mail.subject,
      html: mail.html,
    });
  } catch (err) {
    console.error("[career-approval] confirmation email failed:", err.message);
  }

  return {
    ok: true,
    status: 200,
    decision,
    job: publishedJob,
    html: renderDecisionPage({
      ok: true,
      decision,
      jobTitle: publishedJob?.title || approval.title,
      message: wantApprove
        ? "Thank you. The job is now live on the careers page."
        : "Understood. The job will not be published.",
    }),
  };
}

export async function sendTestApprovalEmail(recipientsInput) {
  const { recipients } = await resolveHrRecipients(recipientsInput);
  if (!recipients.length) {
    const err = new Error("Add at least one HR email");
    err.status = 400;
    throw err;
  }
  if (!getPublicApiBase()) {
    const err = new Error(
      "Set BACKEND_PUBLIC_URL so Approve/Reject links work in real emails",
    );
    err.status = 503;
    throw err;
  }

  const sampleJob = {
    title: "Sample Role — Career Assistant Test",
    location: "Noida",
    experience: "2+ Years",
    positions: 1,
    qualification: "Any bachelors degree",
    salary: "Best in the Industry",
    skills: "• Communication\n• Ownership\n• Collaboration",
    responsibilities:
      "• Coordinate hiring updates\n• Review AI-drafted job posts\n• Approve or reject publish requests",
  };
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const urls = buildDecisionUrls("00000000-0000-4000-8000-000000000000", expiresAt);
  const mail = buildApprovalRequestEmail({
    job: sampleJob,
    approveUrl: urls.approveUrl,
    rejectUrl: urls.rejectUrl,
    previewUrl: urls.previewUrl,
    requesterEmail: "career-agent@tech2globe.com",
    expiresAt,
    isReminder: false,
  });

  await sendHtmlEmail({
    to: recipients,
    subject: `[TEST] ${mail.subject}`,
    html: mail.html.replace(
      /Should we publish/,
      "TEST EMAIL — sample only. Should we publish",
    ),
  });

  return {
    sent: true,
    recipients,
    note: "Test links use a fake id and will not publish a job.",
  };
}

export async function runApprovalReminderTick() {
  await approvalModel.expireStaleApprovals();
  const settings = await approvalModel.getSettings();
  if (!settings.enabled || !settings.require_hr_approval) {
    return { ran: false, reason: "disabled" };
  }
  if (!getPublicApiBase()) {
    return { ran: false, reason: "missing_BACKEND_PUBLIC_URL" };
  }

  const pending = await approvalModel.listPendingForReminder({
    reminderHours: settings.reminder_hours,
    maxReminders: settings.max_reminders,
  });

  let reminded = 0;
  for (const row of pending) {
    try {
      await sendApprovalMail({
        approvalId: row.id,
        job: {
          title: row.title,
          location: row.location,
          experience: row.experience,
          positions: row.positions,
          qualification: row.qualification,
          salary: row.salary,
          skills: row.skills,
          responsibilities: row.responsibilities,
        },
        recipients: row.hr_emails,
        requesterEmail: row.requester_email,
        expiresAt: row.expires_at,
        isReminder: true,
      });
      await approvalModel.markReminded(row.id);
      reminded += 1;
    } catch (err) {
      console.error("[career-approval] reminder failed:", err.message);
    }
  }

  return { ran: true, reminded, checked: pending.length };
}

export async function getApprovalDashboard() {
  const settings = await approvalModel.getSettings();
  const recent = await approvalModel.listRecentApprovals(40);
  return {
    settings,
    recent,
    publicApiConfigured: Boolean(getPublicApiBase()),
    publicApiBase: getPublicApiBase() || null,
  };
}

export async function resendApprovalForJob(jobId, actor) {
  const job = await careerModel.getJobByIdAdmin(jobId);
  if (!job) {
    const err = new Error("Job not found");
    err.status = 404;
    throw err;
  }
  return requestHrPublishApproval({
    job,
    requestedBy: actor?.id || actor?.sub || "admin",
    requesterEmail: actor?.email || null,
  });
}
