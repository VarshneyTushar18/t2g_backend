import * as approvalModel from "./blog20.approval.model.js";
import * as draftsModel from "./blog20.drafts.model.js";
import * as settingsModel from "./blog20.model.js";
import { regenerateBlog20DraftFromFeedback } from "./blog20.agent.service.js";
import { requestBlog20DraftApproval } from "./blog20.approval.service.js";
import {
  buildBlog20DecisionUrls,
  renderBlog20DecisionPage,
  sendHtmlEmail,
  verifyBlog20ApprovalToken,
} from "./blog20.approval.email.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBlog20ReviseFormPage({ draft, postUrl, token, expiresAt }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Request AI revision — ${escapeHtml(draft.title || "Blog")}</title>
  <style>
    body { margin:0; font-family:Segoe UI,Arial,sans-serif; background:#f8fafc; color:#0f172a; }
    .wrap { max-width:560px; margin:48px auto; padding:28px; background:#fff; border:1px solid #e2e8f0; border-radius:16px; }
    label { display:block; font-weight:600; margin:16px 0 8px; }
    textarea { width:100%; min-height:140px; padding:12px; border:1px solid #cbd5e1; border-radius:10px; font-size:15px; font-family:inherit; }
    button { margin-top:16px; background:#d97706; color:#fff; border:none; padding:12px 18px; border-radius:10px; font-weight:700; font-size:15px; cursor:pointer; }
    .meta { font-size:13px; color:#64748b; margin-bottom:12px; }
    .title { font-size:18px; font-weight:700; margin:8px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="meta">Bright CRM · Blog-2.0 · Request AI revision</div>
    <h1 style="margin:0 0 8px;font-size:24px;">Send back to AI</h1>
    <p style="line-height:1.6;color:#475569;">Tell the Blog Agent what to change. It will write a <strong>new draft</strong> and email the team again for approval.</p>
    <p class="title">${escapeHtml(draft.title || "")}</p>
    <p class="meta">Draft #${escapeHtml(draft.id)} · Expires ${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p>
    <form method="POST" action="${escapeHtml(postUrl)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <label for="feedback">What should change?</label>
      <textarea id="feedback" name="feedback" required placeholder="e.g. Shorter intro, less jargon, add a section on pricing, change tone to be more casual…"></textarea>
      <button type="submit">Send to AI — generate new version</button>
    </form>
  </div>
</body>
</html>`;
}

function parseEmails(value) {
  if (Array.isArray(value)) {
    return value.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueEmails(...values) {
  return [...new Set(values.flatMap((value) => parseEmails(value)))];
}

/** Same approval email as first-time drafts (Preview, Save draft, Publish, Revise, Reject). */
async function ensureRevisionApprovalEmail({
  approval,
  originalDraft,
  newDraftMeta,
  actorEmail,
  settings,
}) {
  if (newDraftMeta?.approval?.approvalId) {
    return { sent: true, approvalId: newDraftMeta.approval.approvalId, via: "agent-tool" };
  }

  const draftId = newDraftMeta?.id;
  if (!draftId) {
    throw new Error("Revision finished but no draft id was returned.");
  }

  const newDraft = await draftsModel.getDraftById(draftId);
  if (!newDraft) {
    throw new Error(`Revision draft #${draftId} was not found.`);
  }

  const approvalEmails = uniqueEmails(
    approval.approval_emails,
    settings.approval_emails,
    approval.requester_email,
  );
  if (!approvalEmails.length) {
    throw new Error(
      "No approval emails configured. Add them in Admin → Blog-2.0 → Setup.",
    );
  }

  const sent = await requestBlog20DraftApproval({
    draft: newDraft,
    requestedBy: originalDraft.created_by || "blog20-revision",
    requesterEmail: actorEmail || approval.requester_email || null,
    approvalEmails,
  });

  return { sent: true, approvalId: sent.approvalId, via: "revision-auto" };
}

function runRevisionInBackground({ approval, draft, feedback, actorEmail }) {
  void (async () => {
    try {
      const result = await regenerateBlog20DraftFromFeedback({ draft, feedback });
      const settings = await settingsModel.getSettings();
      const newDraftMeta = result.posts?.[0];
      const mail = await ensureRevisionApprovalEmail({
        approval,
        originalDraft: draft,
        newDraftMeta,
        actorEmail,
        settings,
      });
      console.log(
        `[blog20-revision] approval email for draft #${newDraftMeta?.id} via ${mail.via}`,
      );
    } catch (err) {
      console.error("[blog20-approval] revision failed:", err.message);
      try {
        const recipients = [
          ...parseEmails(approval.approval_emails),
          ...parseEmails(approval.requester_email),
        ];
        await sendHtmlEmail({
          to: recipients,
          subject: `[Blog-2.0] AI revision failed: ${draft.title}`,
          html: `<p style="font-family:Segoe UI,Arial,sans-serif;">Revision failed: ${escapeHtml(err.message)}. Open Admin → Blog-2.0 → Blog Agent to rewrite manually.</p>`,
        });
      } catch (mailErr) {
        console.error("[blog20-approval] revision failure email failed:", mailErr.message);
      }
    }
  })();
}

export async function showBlog20RevisionForm({ token }) {
  let payload;
  try {
    payload = verifyBlog20ApprovalToken(token);
  } catch {
    return {
      status: 400,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "This revision link is invalid or expired.",
      }),
    };
  }

  if (payload.act !== "revise") {
    return {
      status: 400,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "Invalid revision link.",
      }),
    };
  }

  const approval = await approvalModel.getApprovalById(payload.aid);
  if (!approval) {
    return {
      status: 404,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "Approval request not found.",
      }),
    };
  }

  if (approval.decision !== "pending") {
    return {
      status: 409,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: approval.decision,
        postTitle: approval.title,
        message: `This request was already ${approval.decision}.`,
      }),
    };
  }

  if (new Date(approval.expires_at).getTime() < Date.now()) {
    await approvalModel.markDecision(approval.id, "expired", null);
    return {
      status: 410,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: "expired",
        postTitle: approval.title,
        message: "This link has expired.",
      }),
    };
  }

  const urls = buildBlog20DecisionUrls(approval.id, approval.expires_at);
  const postUrl = urls.reviseUrl?.split("?")[0] || "/api/blog-2.0/approvals/revise";

  return {
    status: 200,
    html: renderBlog20ReviseFormPage({
      draft: {
        id: approval.draft_id,
        title: approval.title,
      },
      postUrl,
      token,
      expiresAt: approval.expires_at,
    }),
  };
}

export async function submitBlog20Revision({ token, feedback, actorEmail = null }) {
  let payload;
  try {
    payload = verifyBlog20ApprovalToken(token);
  } catch {
    return {
      status: 400,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "This revision link is invalid or expired.",
      }),
    };
  }

  if (payload.act !== "revise") {
    return {
      status: 400,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "Invalid revision link.",
      }),
    };
  }

  const trimmedFeedback = String(feedback || "").trim();
  if (trimmedFeedback.length < 8) {
    return {
      status: 400,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "Please describe what should change (at least a few words).",
      }),
    };
  }

  const approval = await approvalModel.getApprovalById(payload.aid);
  if (!approval || approval.decision !== "pending") {
    return {
      status: 409,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: approval?.decision || null,
        postTitle: approval?.title || null,
        message: "This approval was already decided.",
      }),
    };
  }

  const draft = await draftsModel.getDraftById(approval.draft_id);
  if (!draft) {
    return {
      status: 404,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: approval.title,
        message: "Original draft not found.",
      }),
    };
  }

  const updated = await approvalModel.markDecision(
    approval.id,
    "rejected",
    actorEmail,
    null,
  );
  if (!updated || updated.decision !== "rejected") {
    return {
      status: 409,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: updated?.decision || null,
        postTitle: approval.title,
        message: "Could not record revision request.",
      }),
    };
  }

  await draftsModel.updateDraftStatus(draft.id, "draft");

  runRevisionInBackground({
    approval,
    draft: {
      ...draft,
      thread_id: approval.thread_id || draft.thread_id,
      created_by: draft.created_by,
    },
    feedback: trimmedFeedback,
    actorEmail,
  });

  return {
    status: 200,
    html: renderBlog20DecisionPage({
      ok: true,
      decision: "revision_requested",
      postTitle: approval.title,
      message:
        "Thank you. The AI is writing a new version based on your feedback. You will receive a new approval email when the draft is ready (usually 1–3 minutes).",
    }),
  };
}
