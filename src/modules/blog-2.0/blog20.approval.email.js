import jwt from "jsonwebtoken";
import {
  getPublicApiBase,
  sendHtmlEmail,
} from "../agents/automations/blogApproval.email.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value, max = 280) {
  const text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function approvalSecret() {
  return (
    process.env.BLOG_20_APPROVAL_SECRET ||
    process.env.BLOG_APPROVAL_SECRET ||
    process.env.JWT_SECRET ||
    "tech2globe-blog20-approval"
  );
}

export function signBlog20ApprovalToken(approvalId, action, expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const expiresIn = Math.max(60, Math.floor(ms / 1000));
  return jwt.sign(
    { aid: approvalId, act: action, typ: "blog20_draft_approval" },
    approvalSecret(),
    { expiresIn },
  );
}

export function verifyBlog20ApprovalToken(token) {
  const payload = jwt.verify(String(token || ""), approvalSecret());
  if (payload?.typ !== "blog20_draft_approval" || !payload?.aid || !payload?.act) {
    const err = new Error("Invalid approval token");
    err.status = 400;
    throw err;
  }
  return payload;
}

export function buildBlog20DecisionUrls(approvalId, expiresAt) {
  const base = getPublicApiBase();
  if (!base) {
    return {
      approveUrl: null,
      approveDraftUrl: null,
      approvePublishUrl: null,
      rejectUrl: null,
      previewUrl: null,
      missingBase: true,
    };
  }
  const root = `${base}/api/blog-2.0/approvals/go`;
  const approveDraft = signBlog20ApprovalToken(approvalId, "approve_draft", expiresAt);
  const approvePublish = signBlog20ApprovalToken(approvalId, "approve_publish", expiresAt);
  const approveLegacy = signBlog20ApprovalToken(approvalId, "approve", expiresAt);
  const reject = signBlog20ApprovalToken(approvalId, "reject", expiresAt);
  const preview = signBlog20ApprovalToken(approvalId, "preview", expiresAt);
  const approveDraftUrl = `${root}?token=${encodeURIComponent(approveDraft)}`;
  const approvePublishUrl = `${root}?token=${encodeURIComponent(approvePublish)}`;
  return {
    approveUrl: approveDraftUrl,
    approveDraftUrl,
    approvePublishUrl,
    approveLegacyUrl: `${root}?token=${encodeURIComponent(approveLegacy)}`,
    rejectUrl: `${root}?token=${encodeURIComponent(reject)}`,
    previewUrl: `${root}?token=${encodeURIComponent(preview)}`,
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
            <td style="background:linear-gradient(135deg,#0c4a6e,#0369a1);padding:24px 28px;color:#fff;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">${escapeHtml(eyebrow)}</div>
              <div style="font-size:22px;font-weight:700;margin-top:6px;">${escapeHtml(title)}</div>
              <div style="font-size:13px;margin-top:8px;opacity:0.9;">Bright CRM · Blog-2.0 · MailerLite</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
              Secure one-time links. Choose Save as draft or Publish live — the MailerLite bot runs automatically.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function draftSummaryBlock(draft, clientBlogUrl) {
  const cover = draft.featured_image
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(draft.featured_image)}" alt="" style="display:block;width:100%;max-height:220px;object-fit:cover;" /></td></tr>`
    : "";
  const slugLine = clientBlogUrl
    ? `${escapeHtml(clientBlogUrl.replace(/\/$/, ""))}/${escapeHtml(draft.slug || "")}`
    : escapeHtml(draft.slug || "");
  return `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0 20px;background:#f8fafc;border-radius:12px;overflow:hidden;">
      ${cover}
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Title</strong><br/>${escapeHtml(draft.title)}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Author</strong><br/>${escapeHtml(draft.author_name || "Bright CRM Team")}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Slug</strong><br/>${slugLine}</td></tr>
      <tr><td style="padding:14px 16px;"><strong>Excerpt</strong><br/><div style="margin-top:6px;line-height:1.5;color:#475569;">${escapeHtml(truncate(draft.excerpt || draft.content, 320))}</div></td></tr>
    </table>
  `;
}

function ctaButtons({
  approveDraftUrl,
  approvePublishUrl,
  rejectUrl,
  previewUrl,
  allowDirectPublish = true,
}) {
  const publishRow = allowDirectPublish
    ? `<tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${approvePublishUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">3. Publish live on website</a>
        </td>
      </tr>`
    : "";
  const tip = allowDirectPublish
    ? "Save as draft → MailerLite draft (publish later). Publish live → bot clicks Publish on the website. No → stays in Admin only."
    : "Save as draft → bot creates draft on MailerLite. No → stays in Admin only.";
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 18px;">
      <tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${previewUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">1. Preview blog</a>
        </td>
      </tr>
      <tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${approveDraftUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">2. Save as draft on website</a>
        </td>
      </tr>
      ${publishRow}
      <tr>
        <td style="padding-bottom:10px;">
          <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${allowDirectPublish ? "4" : "3"}. No — reject</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#64748b;margin:0;">${tip}</p>
  `;
}

export function buildBlog20ApprovalRequestEmail({
  draft,
  clientBlogUrl,
  approveDraftUrl,
  approvePublishUrl,
  rejectUrl,
  previewUrl,
  requesterEmail,
  expiresAt,
  isReminder = false,
  allowDirectPublish = true,
}) {
  const title = isReminder
    ? `Reminder: Approve “${draft.title}”?`
    : `Approve blog: “${draft.title}”?`;
  const intro = isReminder
    ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Reminder — a Bright CRM blog draft is waiting for your decision.</p>`
    : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">A new blog draft is ready. Preview it, then choose <strong>Save as draft</strong>${allowDirectPublish ? " or <strong>Publish live</strong>" : ""} on the MailerLite website, or <strong>No</strong> to reject.</p>`;

  const bodyHtml = `
    ${intro}
    <p style="margin:0 0 8px;font-size:14px;color:#475569;">
      Requested by: <strong>${escapeHtml(requesterEmail || "Blog-2.0 Agent")}</strong><br/>
      Decision deadline: <strong>${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</strong>
    </p>
    ${draftSummaryBlock(draft, clientBlogUrl)}
    <p style="margin:0 0 14px;font-size:15px;"><strong>What do you want to do?</strong></p>
    ${ctaButtons({
      approveDraftUrl,
      approvePublishUrl,
      rejectUrl,
      previewUrl,
      allowDirectPublish,
    })}
  `;

  return {
    subject: isReminder
      ? `[Action needed] Reminder — MailerLite blog: ${draft.title}`
      : `[Action needed] Approve MailerLite blog? ${draft.title}`,
    html: shell({
      title,
      eyebrow: isReminder ? "Blog Reminder" : "Blog Approval Required",
      bodyHtml,
    }),
  };
}

export function buildBlog20DecisionConfirmationEmail({
  draft,
  clientBlogUrl,
  decision,
  decidedByEmail,
  pushResult = null,
}) {
  const approved = decision === "approved";
  const pushed = pushResult?.ok === true;
  const pushFailed = pushResult && pushResult.ok === false;
  const publishedLive = Boolean(pushResult?.published);
  let title = approved ? `Approved: ${draft.title}` : `Rejected: ${draft.title}`;
  if (approved && pushed && publishedLive) title = `Published live: ${draft.title}`;
  if (approved && pushed && !publishedLive) title = `Saved as draft: ${draft.title}`;
  if (approved && pushFailed) title = `Approved but bot failed: ${draft.title}`;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      ${
        approved
          ? pushed
            ? publishedLive
              ? "The MailerLite bot <strong>published this post live</strong> on the client website."
              : "The MailerLite bot saved this post as a <strong>draft</strong> on the client website. Open MailerLite and click <strong>Publish</strong> when ready."
            : pushFailed
              ? `You approved this blog. The MailerLite bot could not complete: <strong>${escapeHtml(pushResult.error || "unknown error")}</strong>. Retry from Admin → Blog-2.0 → Drafts.`
              : "You approved this blog. The MailerLite bot is running now — you will receive another email when it finishes."
          : "You declined. The post remains in <strong>Blog-2.0 Admin</strong> only."
      }
    </p>
    <p style="margin:0 0 14px;font-size:14px;color:#475569;">
      Decision: <strong>${approved ? (publishedLive ? "Publish live" : "Save as draft") : "NO — Reject"}</strong><br/>
      Recorded via: <strong>${escapeHtml(decidedByEmail || "secure email link")}</strong>
    </p>
    ${draftSummaryBlock(draft, clientBlogUrl)}
  `;

  return {
    subject: approved
      ? pushed
        ? publishedLive
          ? `[Confirmed] Published live: ${draft.title}`
          : `[Confirmed] MailerLite draft ready: ${draft.title}`
        : pushFailed
          ? `[Failed] MailerLite bot: ${draft.title}`
          : `[Confirmed] Approved: ${draft.title}`
      : `[Confirmed] Rejected: ${draft.title}`,
    html: shell({
      title,
      eyebrow: "Decision recorded",
      bodyHtml,
    }),
  };
}

export function renderBlog20DecisionPage({
  ok,
  decision,
  postTitle,
  message,
  mailerLiteUrl = null,
}) {
  const approved = decision === "approved";
  const color = !ok ? "#b45309" : approved ? "#15803d" : "#b91c1c";
  const headline = !ok
    ? "Unable to complete"
    : approved
      ? "Approved — bot started"
      : "Kept as draft";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:560px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Bright CRM · Blog-2.0</div>
    <h1 style="margin:10px 0 8px;font-size:28px;color:${color};">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>
    ${postTitle ? `<p style="margin:0 0 12px;color:#475569;"><strong>Blog:</strong> ${escapeHtml(postTitle)}</p>` : ""}
    ${mailerLiteUrl ? `<p style="margin:0;"><a href="${escapeHtml(mailerLiteUrl)}" style="color:#1d4ed8;font-weight:600;">Open MailerLite dashboard →</a></p>` : ""}
  </div>
</body>
</html>`;
}

export function renderBlog20PreviewPage({
  draft,
  approveDraftUrl,
  approvePublishUrl,
  rejectUrl,
  decision,
  expiresAt,
  allowDirectPublish = true,
}) {
  const pending = decision === "pending";
  const content = String(draft.content || "");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Preview — ${escapeHtml(draft.title || "Blog")}</title>
  <style>
    body { margin:0; font-family: Georgia, "Times New Roman", serif; background:#f1f5f9; color:#0f172a; }
    .bar { position:sticky; top:0; z-index:5; background:#0c4a6e; color:#fff; padding:12px 16px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
    .bar .meta { font-family:Segoe UI,Arial,sans-serif; font-size:13px; opacity:0.9; }
    .bar a { font-family:Segoe UI,Arial,sans-serif; text-decoration:none; padding:10px 14px; border-radius:8px; font-weight:700; font-size:13px; }
    .yes { background:#16a34a; color:#fff; }
    .publish { background:#0d9488; color:#fff; }
    .no { background:#dc2626; color:#fff; }
    .closed { font-family:Segoe UI,Arial,sans-serif; background:#334155; color:#fff; padding:10px 14px; border-radius:8px; }
    .wrap { max-width:760px; margin:28px auto 48px; padding:0 16px; }
    .article { background:#fff; border-radius:14px; padding:28px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
    .cover { width:100%; max-height:380px; object-fit:cover; border-radius:10px; margin-bottom:22px; }
    h1 { font-size:36px; line-height:1.2; margin:0 0 10px; letter-spacing:-0.02em; }
    .byline { font-family:Segoe UI,Arial,sans-serif; font-size:13px; color:#64748b; margin-bottom:24px; }
    .content { font-size:18px; line-height:1.75; }
    .content h1,.content h2,.content h3,.content h4 { font-family:Segoe UI,Arial,sans-serif; margin:1.5em 0 0.5em; line-height:1.3; }
    .content h2 { font-size:1.4em; }
    .content p { margin:0 0 1em; }
    .content ul,.content ol { margin:0 0 1em; padding-left:1.3em; }
    .content img { max-width:100%; height:auto; border-radius:8px; }
    .content a { color:#2563eb; }
    .content blockquote { margin:1.2em 0; padding:10px 16px; border-left:3px solid #cbd5e1; color:#475569; background:#f8fafc; }
  </style>
</head>
<body>
  <div class="bar">
    <div class="meta">
      Bright CRM blog preview · Status: <strong>${escapeHtml(decision)}</strong>
      · Expires ${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${
        pending
          ? `<a class="yes" href="${approveDraftUrl}">Save as draft</a>
             ${allowDirectPublish ? `<a class="publish" href="${approvePublishUrl}">Publish live</a>` : ""}
             <a class="no" href="${rejectUrl}">Reject</a>`
          : `<span class="closed">Request already ${escapeHtml(decision)}</span>`
      }
    </div>
  </div>
  <div class="wrap">
    <article class="article">
      ${
        draft.featured_image
          ? `<img class="cover" src="${escapeHtml(draft.featured_image)}" alt="" />`
          : ""
      }
      <h1>${escapeHtml(draft.title || "")}</h1>
      <div class="byline">
        ${escapeHtml(draft.author_name || "Bright CRM Team")}
        ${draft.slug ? ` · ${escapeHtml(draft.slug)}` : ""}
      </div>
      <div class="content">${content}</div>
    </article>
  </div>
</body>
</html>`;
}

export { getPublicApiBase, sendHtmlEmail };
