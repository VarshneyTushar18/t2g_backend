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

export function signScheduleToken(cycleId, action, expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const expiresIn = Math.max(60, Math.floor(ms / 1000));
  return jwt.sign(
    { aid: cycleId, act: action, typ: "career_schedule_gate" },
    approvalSecret(),
    { expiresIn },
  );
}

export function verifyCareerLinkToken(token) {
  const payload = jwt.verify(String(token || ""), approvalSecret());
  const typ = payload?.typ;
  if (
    !payload?.aid ||
    !payload?.act ||
    (typ !== "career_job_approval" && typ !== "career_schedule_gate")
  ) {
    const err = new Error("Invalid link token");
    err.status = 400;
    throw err;
  }
  return payload;
}

export function buildScheduleGateUrls(cycleId, expiresAt) {
  const base = getPublicApiBase();
  if (!base) {
    return { yesUrl: null, noUrl: null, manageUrl: null, missingBase: true };
  }
  const root = `${base}/api/career/approvals`;
  const yes = signScheduleToken(cycleId, "schedule_yes", expiresAt);
  const no = signScheduleToken(cycleId, "schedule_no", expiresAt);
  const manage = signScheduleToken(cycleId, "manage_list", expiresAt);
  const intake = signScheduleToken(cycleId, "intake_form", expiresAt);
  return {
    yesUrl: `${root}/go?token=${encodeURIComponent(yes)}`,
    noUrl: `${root}/go?token=${encodeURIComponent(no)}`,
    manageUrl: `${root}/go?token=${encodeURIComponent(manage)}`,
    manageToken: manage,
    intakeFormUrl: `${root}/go?token=${encodeURIComponent(intake)}`,
    intakeToken: intake,
    missingBase: false,
  };
}

export function buildScheduleGateEmail({
  expiresAt,
  yesUrl,
  noUrl,
  manageUrl,
  activeJobs = [],
  scheduleLabel,
}) {
  const title = "Do you want to publish a new job on the careers page?";
  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      Scheduled check-in (${escapeHtml(scheduleLabel || "recurring")}). Reply with <strong>Yes</strong> or <strong>No</strong> below.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#475569;">
      Respond by: <strong>${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</strong>
    </p>
    <p style="margin:0 0 14px;font-size:15px;"><strong>Do you want to publish a job?</strong></p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 18px;">
      <tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${yesUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Yes — Publish</a>
        </td>
        <td style="padding-bottom:10px;">
          <a href="${noUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">No</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#64748b;margin:0 0 20px;">
      <strong>Yes</strong> → we email you a short form to describe the role; the Career Agent drafts it and sends the usual publish approval email.<br/>
      <strong>No</strong> → nothing happens until the next scheduled check-in.
    </p>
    <h3 style="margin:0 0 10px;font-size:15px;">Remove a job from the careers page</h3>
    <p style="margin:0 0 10px;font-size:14px;color:#475569;">Use the numbered list below or open the remove page to take a listing offline (same email).</p>
    ${buildActiveJobsListSection(activeJobs, manageUrl)}
  `;

  return {
    subject: `[Scheduled] Publish a new job on careers page?`,
    html: shell({
      title,
      eyebrow: "HR Scheduled Check-in",
      bodyHtml,
    }),
  };
}

export function buildPublishIntakeEmail({ intakeFormUrl, expiresAt }) {
  const title = "What do you want to publish?";
  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      You chose <strong>Yes — Publish</strong>. Open the secure form and describe the role (title, skills, experience, responsibilities — paste a JD or bullet points).
    </p>
    <p style="margin:0 0 14px;font-size:14px;color:#475569;">
      Complete by: <strong>${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</strong>
    </p>
    <p style="margin:0 0 18px;">
      <a href="${intakeFormUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Open job details form</a>
    </p>
    <p style="font-size:12px;color:#64748b;margin:0;">
      After you submit, the Career Agent creates the job and emails you the final <strong>Yes — Publish job / No</strong> approval with the full description.
    </p>
  `;
  return {
    subject: `[Action needed] Describe the job to publish`,
    html: shell({
      title,
      eyebrow: "HR — job details",
      bodyHtml,
    }),
  };
}

export function renderPublishIntakeFormPage({
  manageUrl,
  activeJobs,
  errorMessage = null,
  intakeToken,
}) {
  const base = getPublicApiBase();
  const postAction = base
    ? `${base}/api/career/approvals/go?token=${encodeURIComponent(intakeToken || "")}`
    : "#";
  const listBlock = buildActiveJobsListSection(activeJobs, manageUrl);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Job details for publish</title></head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;">
<div style="max-width:720px;margin:32px auto;padding:24px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;">
  <div style="font-size:12px;text-transform:uppercase;color:#64748b;">Tech2Globe Career Assistant</div>
  <h1 style="margin:8px 0 6px;font-size:26px;">What do you want to publish?</h1>
  <p style="color:#64748b;line-height:1.5;">Fill in the role details below and tap <strong>Send to Career Agent</strong>. You will receive a follow-up email to confirm publish (Yes/No) with the full job description.</p>
  ${errorMessage ? `<p style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px;border-radius:10px;">${escapeHtml(errorMessage)}</p>` : ""}
  <form method="POST" action="${postAction}" style="margin:18px 0;">
    <label style="display:block;font-weight:700;margin-bottom:6px;font-size:14px;">Job title (optional)</label>
    <input name="title_hint" type="text" placeholder="e.g. PPC Specialist"
      style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;margin-bottom:14px;" />
    <label style="display:block;font-weight:700;margin-bottom:6px;font-size:14px;">Job details / comments <span style="color:#dc2626">*</span></label>
    <textarea name="comment" required rows="10" placeholder="Paste JD, skills, experience, location, responsibilities…"
      style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;line-height:1.5;"></textarea>
    <button type="submit" style="margin-top:14px;background:#16a34a;color:#fff;border:none;padding:12px 20px;border-radius:10px;font-weight:700;cursor:pointer;font-size:15px;">
      Send to Career Agent
    </button>
  </form>
  <h2 style="font-size:17px;margin:24px 0 8px;">Remove a live job</h2>
  <p style="color:#64748b;font-size:14px;margin:0 0 8px;">Enter a list number on the remove page (optional note when removing).</p>
  ${listBlock}
</div></body></html>`;
}

export function renderScheduleGateDecisionPage({ ok, accepted, message }) {
  const color = !ok ? "#b45309" : accepted ? "#15803d" : "#64748b";
  const headline = !ok
    ? "Unable to complete"
    : accepted
      ? "Draft started"
      : "Skipped this cycle";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(headline)}</title></head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:560px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Tech2Globe Career Assistant</div>
    <h1 style="margin:10px 0 8px;font-size:28px;color:${color};">${escapeHtml(headline)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>
  </div>
</body></html>`;
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
  const manage = signApprovalToken(approvalId, "manage_list", expiresAt);
  return {
    approveUrl: `${root}/go?token=${encodeURIComponent(approve)}`,
    rejectUrl: `${root}/go?token=${encodeURIComponent(reject)}`,
    previewUrl: `${root}/go?token=${encodeURIComponent(preview)}`,
    manageUrl: `${root}/go?token=${encodeURIComponent(manage)}`,
    manageToken: manage,
    missingBase: false,
  };
}

/** Numbered list of jobs currently live on tech2globe.com/career */
export function buildActiveJobsListSection(activeJobs, manageUrl) {
  if (!activeJobs?.length) {
    return `
      <div style="margin:22px 0 0;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
        <h3 style="margin:0 0 8px;font-size:15px;">Currently live on careers page</h3>
        <p style="margin:0;font-size:14px;color:#64748b;">No active job postings right now.</p>
      </div>
    `;
  }

  const rows = activeJobs
    .map(
      (j, index) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:800;color:#1d4ed8;width:40px;">${index + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(j.title)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">${escapeHtml(j.location || "—")} · ${escapeHtml(j.experience || "—")}</td>
      </tr>`,
    )
    .join("");

  const manageLink = manageUrl
    ? `<p style="margin:14px 0 0;font-size:14px;">
        <a href="${manageUrl}" style="color:#1d4ed8;font-weight:700;">Open remove-by-number page</a>
        — enter the list number to take a role off the careers page (sets inactive).
      </p>`
    : "";

  return `
    <div style="margin:22px 0 0;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
      <h3 style="margin:0 0 10px;font-size:15px;">Currently live on careers page (${activeJobs.length})</h3>
      <table role="presentation" width="100%" style="border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;background:#f1f5f9;">#</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;background:#f1f5f9;">Title</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;background:#f1f5f9;">Details</th>
        </tr>
        ${rows}
      </table>
      ${manageLink}
    </div>
  `;
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
  manageUrl,
  activeJobs = [],
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
    ${buildActiveJobsListSection(activeJobs, manageUrl)}
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

export function renderManageJobsPage({
  activeJobs,
  manageUrl,
  manageToken,
  successMessage = null,
  errorMessage = null,
}) {
  const base = getPublicApiBase();
  const postAction = base
    ? `${base}/api/career/approvals/go?token=${encodeURIComponent(manageToken)}`
    : "#";

  const listBlock = buildActiveJobsListSection(activeJobs, null);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Remove live job — Tech2Globe Careers</title>
</head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;">
  <div style="max-width:720px;margin:32px auto;padding:24px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">HR — careers page</div>
    <h1 style="margin:8px 0 6px;font-size:26px;">Remove a job by number</h1>
    <p style="color:#64748b;margin:0 0 18px;line-height:1.5;">
      Jobs below match the public careers page (newest first). Enter the <strong>#</strong> to close that listing — it will be set to <strong>inactive</strong> and hidden from the site.
    </p>
    ${
      successMessage
        ? `<p style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:12px 14px;border-radius:10px;margin:0 0 14px;">${escapeHtml(successMessage)}</p>`
        : ""
    }
    ${
      errorMessage
        ? `<p style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px 14px;border-radius:10px;margin:0 0 14px;">${escapeHtml(errorMessage)}</p>`
        : ""
    }
    ${listBlock}
    ${
      activeJobs?.length
        ? `<form method="POST" action="${postAction}" style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
            <label for="jobNumber" style="display:block;font-weight:700;margin-bottom:8px;font-size:14px;">Job number to remove</label>
            <label style="display:block;font-weight:700;margin-bottom:6px;font-size:13px;">Job # to remove</label>
            <input id="jobNumber" name="number" type="number" min="1" max="${activeJobs.length}" required
              placeholder="e.g. 2"
              style="width:120px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;margin-bottom:12px;" />
            <label style="display:block;font-weight:700;margin-bottom:6px;font-size:13px;">Comment (optional)</label>
            <textarea name="remove_comment" rows="3" placeholder="Why this role is being removed…"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;margin-bottom:12px;"></textarea>
            <button type="submit" style="background:#dc2626;color:#fff;border:none;padding:11px 18px;border-radius:10px;font-weight:700;cursor:pointer;">
              Remove from careers page
            </button>
            <p style="margin:10px 0 0;font-size:12px;color:#64748b;">This link expires with your approval email. Applications for that job are kept in admin.</p>
          </form>`
        : `<p style="margin-top:16px;color:#64748b;">Nothing to remove — no active jobs on the site.</p>`
    }
    ${
      manageUrl
        ? `<p style="margin-top:18px;font-size:13px;"><a href="${manageUrl}" style="color:#64748b;">Refresh this page</a></p>`
        : ""
    }
  </div>
</body>
</html>`;
}

export function renderPreviewPage({
  job,
  approveUrl,
  rejectUrl,
  decision,
  expiresAt,
  activeJobs = [],
  manageUrl = null,
}) {
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
    ${buildActiveJobsListSection(activeJobs, manageUrl)}
  </div>
</body>
</html>`;
}
