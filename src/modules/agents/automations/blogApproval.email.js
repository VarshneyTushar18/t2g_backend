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

function truncate(value, max = 280) {
  const text = String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function approvalSecret() {
  return (
    process.env.BLOG_APPROVAL_SECRET ||
    process.env.CAREER_APPROVAL_SECRET ||
    process.env.JWT_SECRET ||
    "tech2globe-blog-approval"
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
    { aid: approvalId, act: action, typ: "blog_post_approval" },
    approvalSecret(),
    { expiresIn },
  );
}

export function verifyApprovalToken(token) {
  const payload = jwt.verify(String(token || ""), approvalSecret());
  if (payload?.typ !== "blog_post_approval" || !payload?.aid || !payload?.act) {
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
  const root = `${base}/api/agents/automations/approvals`;
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
              <div style="font-size:13px;margin-top:8px;opacity:0.9;">Tech2Globe Blog Automations</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
              Secure one-time decision links. Yes publishes the blog. No keeps it as draft. Prefer preview first if you want to read the full page.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function postSummaryBlock(post) {
  const cover = post.featured_image
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(post.featured_image)}" alt="" style="display:block;width:100%;max-height:220px;object-fit:cover;" /></td></tr>`
    : "";
  return `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0 20px;background:#f8fafc;border-radius:12px;overflow:hidden;">
      ${cover}
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Title</strong><br/>${escapeHtml(post.title)}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Author</strong><br/>${escapeHtml(post.author_name || post.author || "Tech2Globe")}</td></tr>
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;"><strong>Slug</strong><br/>/blogs/${escapeHtml(post.slug || "")}</td></tr>
      <tr><td style="padding:14px 16px;"><strong>Excerpt</strong><br/><div style="margin-top:6px;line-height:1.5;color:#475569;">${escapeHtml(truncate(post.excerpt || post.content, 320))}</div></td></tr>
    </table>
  `;
}

function ctaButtons({ approveUrl, rejectUrl, previewUrl }) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 18px;">
      <tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${previewUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">1. Preview blog</a>
        </td>
      </tr>
      <tr>
        <td style="padding-right:10px;padding-bottom:10px;">
          <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">2. Yes — Publish</a>
        </td>
        <td style="padding-bottom:10px;">
          <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">3. No — Keep draft</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#64748b;margin:0;">
      Tip: open Preview first, then choose Yes or No.
    </p>
  `;
}

export function buildApprovalRequestEmail({
  post,
  topic,
  approveUrl,
  rejectUrl,
  previewUrl,
  requesterEmail,
  expiresAt,
  isReminder = false,
}) {
  const title = isReminder
    ? `Reminder: Publish “${post.title}”?`
    : `Should we publish “${post.title}”?`;
  const intro = isReminder
    ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Friendly reminder — a blog is waiting for your decision.</p>`
    : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">A new blog is ready. Preview it, then choose Yes to publish or No to keep it as draft.</p>`;

  const topicLine = topic?.topic
    ? `<p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong>Queue topic:</strong> ${escapeHtml(topic.topic)}</p>`
    : "";

  const bodyHtml = `
    ${intro}
    ${topicLine}
    <p style="margin:0 0 8px;font-size:14px;color:#475569;">
      Requested by: <strong>${escapeHtml(requesterEmail || "Blog Automations")}</strong><br/>
      Decision deadline: <strong>${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</strong>
    </p>
    ${postSummaryBlock(post)}
    <p style="margin:0 0 14px;font-size:15px;"><strong>What do you want to do?</strong></p>
    ${ctaButtons({ approveUrl, rejectUrl, previewUrl })}
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;">
      Preview → read full page.
      Yes → goes live.
      No → stays draft in Admin.
    </p>
  `;

  return {
    subject: isReminder
      ? `[Action needed] Reminder — publish blog: ${post.title}`
      : `[Action needed] Publish blog? ${post.title}`,
    html: shell({
      title,
      eyebrow: isReminder ? "Blog Reminder" : "Blog Approval Required",
      bodyHtml,
    }),
  };
}

export function buildDecisionConfirmationEmail({ post, decision, decidedByEmail }) {
  const approved = decision === "approved";
  const title = approved ? `Published: ${post.title}` : `Kept as draft: ${post.title}`;
  const liveUrl = post.slug
    ? `https://www.tech2globe.com/blogs/${post.slug}`
    : null;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      ${
        approved
          ? "You approved this blog. It is now <strong>published</strong> on Tech2Globe."
          : "You declined publishing. The post remains a <strong>draft</strong> in Admin."
      }
    </p>
    <p style="margin:0 0 14px;font-size:14px;color:#475569;">
      Decision: <strong>${approved ? "YES — Publish" : "NO — Keep as draft"}</strong><br/>
      Recorded via: <strong>${escapeHtml(decidedByEmail || "secure email link")}</strong>
    </p>
    ${postSummaryBlock(post)}
    ${
      approved && liveUrl
        ? `<p style="margin:0;"><a href="${liveUrl}" style="color:#1d4ed8;">Open live blog →</a></p>`
        : ""
    }
  `;
  return {
    subject: approved
      ? `[Confirmed] Blog published: ${post.title}`
      : `[Confirmed] Blog kept as draft: ${post.title}`,
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
    const err = new Error("No blog approval email recipients configured");
    err.status = 400;
    throw err;
  }

  await transporter.sendMail({
    from: `"Tech2Globe Blog Automations" <${from}>`,
    to: recipients.join(", "),
    subject,
    html,
    replyTo: replyTo || undefined,
  });

  return { sent: true, recipients };
}

export function renderDecisionPage({ ok, decision, postTitle, message, liveUrl = null }) {
  const approved = decision === "approved";
  const color = !ok ? "#b45309" : approved ? "#15803d" : "#b91c1c";
  const headline = !ok
    ? "Unable to complete"
    : approved
      ? "Blog published"
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
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Tech2Globe Blog Automations</div>
    <h1 style="margin:10px 0 8px;font-size:28px;color:${color};">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>
    ${postTitle ? `<p style="margin:0 0 12px;color:#475569;"><strong>Blog:</strong> ${escapeHtml(postTitle)}</p>` : ""}
    ${liveUrl ? `<p style="margin:0;"><a href="${escapeHtml(liveUrl)}" style="color:#1d4ed8;font-weight:600;">View live post →</a></p>` : ""}
  </div>
</body>
</html>`;
}

/** Full-page live preview of the blog article + Yes/No CTAs */
export function renderPreviewPage({ post, approveUrl, rejectUrl, decision, expiresAt }) {
  const pending = decision === "pending";
  const content = String(post.content || "");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Preview — ${escapeHtml(post.title || "Blog")}</title>
  <style>
    body { margin:0; font-family: Georgia, "Times New Roman", serif; background:#f1f5f9; color:#0f172a; }
    .bar { position:sticky; top:0; z-index:5; background:#0f172a; color:#fff; padding:12px 16px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
    .bar .meta { font-family:Segoe UI,Arial,sans-serif; font-size:13px; opacity:0.9; }
    .bar a { font-family:Segoe UI,Arial,sans-serif; text-decoration:none; padding:10px 14px; border-radius:8px; font-weight:700; font-size:13px; }
    .yes { background:#16a34a; color:#fff; }
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
      Live blog preview · Status: <strong>${escapeHtml(decision)}</strong>
      · Expires ${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${
        pending
          ? `<a class="yes" href="${approveUrl}">Yes — Publish</a>
             <a class="no" href="${rejectUrl}">No — Keep draft</a>`
          : `<span class="closed">Request already ${escapeHtml(decision)}</span>`
      }
    </div>
  </div>
  <div class="wrap">
    <article class="article">
      ${
        post.featured_image
          ? `<img class="cover" src="${escapeHtml(post.featured_image)}" alt="" />`
          : ""
      }
      <h1>${escapeHtml(post.title || "")}</h1>
      <div class="byline">
        ${escapeHtml(post.author_name || post.author || "Tech2Globe")}
        ${post.slug ? ` · /blogs/${escapeHtml(post.slug)}` : ""}
      </div>
      <div class="content">${content}</div>
    </article>
  </div>
</body>
</html>`;
}
