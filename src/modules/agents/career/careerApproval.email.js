import jwt from "jsonwebtoken";
import { transporter, getSmtpFromAddress } from "../../../utils/email.service.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

function truncate(value, max = 900) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function approvalSecret() {
  return (
    process.env.CAREER_APPROVAL_SECRET ||
    process.env.JWT_SECRET ||
    "tech2globe-career-approval"
  );
}

export function getPublicApiBase() {
  return (
    process.env.BACKEND_PUBLIC_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.PUBLIC_API_URL ||
    process.env.SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

export function signApprovalToken(approvalId, action, expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const expiresIn = Math.max(60, Math.floor(ms / 1000));
  return jwt.sign(
    { aid: approvalId, act: action, typ: "career_job_approval" },
    approvalSecret(),
    { expiresIn },
  );
}

export function verifyApprovalToken(token) {
  const payload = jwt.verify(String(token || ""), approvalSecret());
  if (payload?.typ !== "career_job_approval" || !payload?.aid || !payload?.act) {
    const err = new Error("Invalid approval token");
    err.status = 400;
    throw err;
  }
  return payload;
}

export function buildDecisionUrls(approvalId, expiresAt) {
  const base = getPublicApiBase();
  if (!base) {
    return {
      approveUrl: null,
      rejectUrl: null,
      previewUrl: null,
      missingBase: true,
    };
  }
  const root = `${base}/api/career/approvals`;
  const approve = signApprovalToken(approvalId, "approve", expiresAt);
  const reject = signApprovalToken(approvalId, "reject", expiresAt);
  const preview = signApprovalToken(approvalId, "preview", expiresAt);
  return {
    approveUrl: `${root}/go?token=${encodeURIComponent(approve)}`,
    rejectUrl: `${root}/go?token=${encodeURIComponent(reject)}`,
    previewUrl: `${root}/go?token=${encodeURIComponent(preview)}`,
    missingBase: false,
  };
}

function shell({ title, eyebrow, bodyHtml }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:24px 28px;color:#fff;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">${escapeHtml(eyebrow)}</div>
              <div style="font-size:22px;font-weight:700;margin-top:6px;">${escapeHtml(title)}</div>
              <div style="font-size:13px;margin-top:8px;opacity:0.9;">Tech2Globe Career Assistant</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
              Secure one-time decision links. Yes publishes the role. No keeps it unpublished. No reply triggers reminders, then expiry.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function jobDetailsBlock(job) {
  return `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0 20px;background:#f8fafc;border-radius:12px;">
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Title</strong><br/>${escapeHtml(job.title)}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Location</strong><br/>${escapeHtml(job.location || "—")}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Experience</strong><br/>${escapeHtml(job.experience || "—")}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Openings</strong><br/>${escapeHtml(job.positions || 1)}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Qualification</strong><br/>${escapeHtml(job.qualification || "—")}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Salary</strong><br/>${escapeHtml(job.salary || "—")}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Required skills</strong><br/><div style="margin-top:6px;line-height:1.5;">${nl2br(truncate(job.skills))}</div></td></tr>
      <tr><td style="padding:14px 16px;"><strong>Responsibilities</strong><br/><div style="margin-top:6px;line-height:1.5;">${nl2br(truncate(job.responsibilities))}</div></td></tr>
    </table>
  `;
}

function ctaButtons({ approveUrl, rejectUrl, previewUrl }) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 18px;">
      <tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Yes — Publish job</a>
        </td>
        <td style="padding-bottom:10px;">
          <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">No — Do not publish</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#64748b;margin:0;">
      Prefer to review first? <a href="${previewUrl}" style="color:#1d4ed8;">Open approval page</a>
    </p>
  `;
}

export function buildApprovalRequestEmail({
  job,
  approveUrl,
  rejectUrl,
  previewUrl,
  requesterEmail,
  expiresAt,
  isReminder = false,
}) {
  const title = isReminder
    ? `Reminder: Publish “${job.title}”?`
    : `Should we publish “${job.title}”?`;
  const intro = isReminder
    ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Reminder from the Career Assistant — we still need your Yes/No before this role goes live on <strong>tech2globe.com/career</strong>.</p>`
    : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">The Career Assistant prepared a new job and is asking HR for approval before publishing.</p>`;

  const bodyHtml = `
    ${intro}
    <p style="margin:0 0 8px;font-size:14px;color:#475569;">
      Requested by: <strong>${escapeHtml(requesterEmail || "Career Agent")}</strong><br/>
      Decision deadline: <strong>${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</strong>
    </p>
    ${jobDetailsBlock(job)}
    <p style="margin:0 0 14px;font-size:15px;"><strong>Do you want to publish this job?</strong></p>
    ${ctaButtons({ approveUrl, rejectUrl, previewUrl })}
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;">
      <strong>Yes</strong> → publish (active).
      <strong>No</strong> → reject (unpublished).
      <strong>No reply</strong> → reminders, then request expires.
    </p>
  `;

  return {
    subject: isReminder
      ? `[Action needed] Reminder — publish job: ${job.title}`
      : `[Action needed] Publish job? ${job.title}`,
    html: shell({
      title,
      eyebrow: isReminder ? "HR Reminder" : "HR Approval Required",
      bodyHtml,
    }),
  };
}

export function buildDecisionConfirmationEmail({ job, decision, decidedByEmail }) {
  const approved = decision === "approved";
  const title = approved ? `Published: ${job.title}` : `Rejected: ${job.title}`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      ${
        approved
          ? "HR approved this job. It is now <strong>active</strong> on the Tech2Globe careers page."
          : "HR declined publishing. The job remains unpublished."
      }
    </p>
    <p style="margin:0 0 14px;font-size:14px;color:#475569;">
      Decision: <strong>${approved ? "YES — Publish" : "NO — Do not publish"}</strong><br/>
      Recorded via: <strong>${escapeHtml(decidedByEmail || "secure email link")}</strong>
    </p>
    ${jobDetailsBlock(job)}
  `;
  return {
    subject: approved
      ? `[Confirmed] Job published: ${job.title}`
      : `[Confirmed] Job not published: ${job.title}`,
    html: shell({
      title,
      eyebrow: "Decision recorded",
      bodyHtml,
    }),
  };
}

export async function sendHtmlEmail({ to, subject, html, replyTo }) {
  const from = getSmtpFromAddress();
  if (!from) {
    const err = new Error("SMTP from address not configured (set SMTP_EMAIL or EMAIL_USER)");
    err.status = 503;
    throw err;
  }
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) {
    const err = new Error("No HR approval email recipients configured");
    err.status = 400;
    throw err;
  }

  await transporter.sendMail({
    from: `"Tech2Globe Career Assistant" <${from}>`,
    to: recipients.join(", "),
    subject,
    html,
    replyTo: replyTo || undefined,
  });

  return { sent: true, recipients };
}

export function renderDecisionPage({ ok, decision, jobTitle, message }) {
  const approved = decision === "approved";
  const color = !ok ? "#b45309" : approved ? "#15803d" : "#b91c1c";
  const headline = !ok
    ? "Unable to complete"
    : approved
      ? "Job published"
      : "Publish declined";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:560px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Tech2Globe Career Assistant</div>
    <h1 style="margin:10px 0 8px;font-size:28px;color:${color};">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>
    ${jobTitle ? `<p style="margin:0;color:#475569;"><strong>Job:</strong> ${escapeHtml(jobTitle)}</p>` : ""}
  </div>
</body>
</html>`;
}

export function renderPreviewPage({ job, approveUrl, rejectUrl, decision, expiresAt }) {
  const pending = decision === "pending";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Approve job — ${escapeHtml(job.title)}</title>
</head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;">
  <div style="max-width:720px;margin:32px auto;padding:24px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">HR approval</div>
    <h1 style="margin:8px 0 6px;font-size:28px;">${escapeHtml(job.title)}</h1>
    <p style="color:#64748b;margin:0 0 18px;">Status: <strong>${escapeHtml(decision)}</strong> · Expires ${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p>
    ${jobDetailsBlock(job)}
    ${
      pending
        ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
            <a href="${approveUrl}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Yes — Publish</a>
            <a href="${rejectUrl}" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">No — Reject</a>
          </div>`
        : `<p style="margin-top:12px;">This approval request is already closed.</p>`
    }
  </div>
</body>
</html>`;
}
