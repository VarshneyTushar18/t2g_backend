import * as approvalModel from "./blogApproval.model.js";
import * as blogModel from "../../blog/blog.model.js";
import * as blogAgentModel from "../blog/blogAgent.model.js";
import { runBlogAgent } from "../blog/blogAgent.service.js";
import { requestBlogPublishApproval } from "./blogApproval.service.js";
import {
  buildDecisionUrls,
  renderDecisionPage,
  sendHtmlEmail,
  verifyApprovalToken,
} from "./blogApproval.email.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export function renderReviseFormPage({ post, postUrl, token, expiresAt }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Request AI revision — ${escapeHtml(post.title || "Blog")}</title>
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
    <div class="meta">Tech2Globe Blog Automations · Request AI revision</div>
    <h1 style="margin:0 0 8px;font-size:24px;">Send back to AI</h1>
    <p style="line-height:1.6;color:#475569;">Tell the Blog Agent what to change. It will rewrite this post and email you a <strong>new approval email</strong>.</p>
    <p class="title">${escapeHtml(post.title || "")}</p>
    <p class="meta">Post #${escapeHtml(post.id)} · Expires ${escapeHtml(new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p>
    <form method="POST" action="${escapeHtml(postUrl)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <label for="feedback">What should change?</label>
      <textarea id="feedback" name="feedback" required placeholder="e.g. Shorter intro, less jargon, add pricing section, more casual tone…"></textarea>
      <button type="submit">Send to AI — generate new version</button>
    </form>
  </div>
</body>
</html>`;
}

async function regenerateBlogPostFromFeedback({ post, feedback }) {
  const user = {
    id: "blog-approval-revision",
    sub: "blog-approval-revision",
    email: "blog-approval@system.local",
    role: "super_admin",
    permissions: { blog: { add: true, delete: true, edit: true, view: true } },
  };

  const thread = await blogAgentModel.createThread({
    userId: user.id,
    userEmail: user.email,
    title: `Revision: ${post.title}`.slice(0, 120),
    agentType: "automation",
  });

  const message = `REVISION REQUEST — rewrite blog post #${post.id} in place.

Title: "${post.title}"

Approver feedback:
${feedback}

Call update_blog_post with id ${post.id}. Keep status pending. Rewrite the full body with a fresh angle/structure based on feedback. Do not create a duplicate post.`;

  await blogAgentModel.addMessage({ threadId: thread.id, role: "user", content: message });

  let runResult = await runBlogAgent({ user, threadId: thread.id, message });
  if (!runResult.posts?.length) {
    const retryMessage = `You did not call update_blog_post yet. Call update_blog_post NOW for post #${post.id} with a fully revised article. Feedback: ${feedback}`;
    await blogAgentModel.addMessage({ threadId: thread.id, role: "user", content: retryMessage });
    runResult = await runBlogAgent({ user, threadId: thread.id, message: retryMessage });
  }

  await blogAgentModel.addMessage({
    threadId: thread.id,
    role: "assistant",
    content: runResult.output,
    toolOutput: { durationMs: runResult.durationMs, posts: runResult.posts, revision: true },
  });

  const updated = await blogModel.getById(post.id);
  if (!updated) {
    throw new Error(`Post #${post.id} not found after revision.`);
  }

  if (updated.status !== "pending") {
    await blogModel.updatePost(updated.id, {
      title: updated.title,
      slug: updated.slug,
      excerpt: updated.excerpt,
      content: updated.content,
      featured_image: updated.featured_image,
      status: "pending",
      author_name: updated.author,
      categories: updated.categories || [],
      tags: updated.tags || [],
      seo: updated.seo || {},
    });
    return blogModel.getById(updated.id);
  }

  return updated;
}

function runRevisionInBackground({ approval, post, feedback, actorEmail }) {
  void (async () => {
    try {
      const revisedPost = await regenerateBlogPostFromFeedback({ post, feedback });
      const approvalEmails = uniqueEmails(
        approval.approval_emails,
        approval.requester_email,
      );
      if (!approvalEmails.length) {
        throw new Error("No approval emails configured for revision follow-up.");
      }

      await requestBlogPublishApproval({
        post: revisedPost,
        topic: approval.topic_id ? { id: approval.topic_id } : null,
        requestedBy: "blog-approval-revision",
        requesterEmail: actorEmail || approval.requester_email || null,
        approvalEmails,
      });
      console.log(`[blog-approval] revision complete for post #${revisedPost.id}`);
    } catch (err) {
      console.error("[blog-approval] revision failed:", err.message);
      try {
        const recipients = uniqueEmails(
          approval.approval_emails,
          approval.requester_email,
        );
        await sendHtmlEmail({
          to: recipients,
          subject: `[Blog] AI revision failed: ${post.title}`,
          html: `<p style="font-family:Segoe UI,Arial,sans-serif;">Revision failed: ${escapeHtml(err.message)}. Open Admin → Blog → Blog Agent to rewrite manually.</p>`,
        });
      } catch (mailErr) {
        console.error("[blog-approval] revision failure email failed:", mailErr.message);
      }
    }
  })();
}

export async function showRevisionForm({ token }) {
  let payload;
  try {
    payload = verifyApprovalToken(token);
  } catch {
    return {
      status: 400,
      html: renderDecisionPage({
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
      html: renderDecisionPage({
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
      html: renderDecisionPage({
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
      html: renderDecisionPage({
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
      html: renderDecisionPage({
        ok: false,
        decision: "expired",
        postTitle: approval.title,
        message: "This link has expired.",
      }),
    };
  }

  const urls = buildDecisionUrls(approval.id, approval.expires_at);
  const postUrl =
    urls.reviseUrl?.split("?")[0] || "/api/agents/automations/approvals/revise";

  return {
    status: 200,
    html: renderReviseFormPage({
      post: { id: approval.post_id, title: approval.title },
      postUrl,
      token,
      expiresAt: approval.expires_at,
    }),
  };
}

export async function submitRevision({ token, feedback, actorEmail = null }) {
  let payload;
  try {
    payload = verifyApprovalToken(token);
  } catch {
    return {
      status: 400,
      html: renderDecisionPage({
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
      html: renderDecisionPage({
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
      html: renderDecisionPage({
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
      html: renderDecisionPage({
        ok: false,
        decision: approval?.decision || null,
        postTitle: approval?.title || null,
        message: "This approval was already decided.",
      }),
    };
  }

  const post = await blogModel.getById(approval.post_id);
  if (!post) {
    return {
      status: 404,
      html: renderDecisionPage({
        ok: false,
        decision: null,
        postTitle: approval.title,
        message: "Original blog post not found.",
      }),
    };
  }

  const updated = await approvalModel.markDecision(
    approval.id,
    "rejected",
    actorEmail,
  );
  if (!updated || updated.decision !== "rejected") {
    return {
      status: 409,
      html: renderDecisionPage({
        ok: false,
        decision: updated?.decision || null,
        postTitle: approval.title,
        message: "Could not record revision request.",
      }),
    };
  }

  if (post.status !== "draft") {
    await blogModel.updatePost(post.id, {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      featured_image: post.featured_image,
      status: "draft",
      author_name: post.author,
      categories: post.categories || [],
      tags: post.tags || [],
      seo: post.seo || {},
    });
  }

  runRevisionInBackground({
    approval,
    post,
    feedback: trimmedFeedback,
    actorEmail,
  });

  return {
    status: 200,
    html: renderDecisionPage({
      ok: true,
      decision: "revision_requested",
      postTitle: approval.title,
      message:
        "Thank you. The AI is rewriting this blog based on your feedback. You will receive a new approval email when it is ready (usually 1–3 minutes).",
    }),
  };
}
