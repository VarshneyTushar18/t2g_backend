import * as approvalModel from "./blogApproval.model.js";
import * as blogModel from "../../blog/blog.model.js";
import {
  buildApprovalRequestEmail,
  buildDecisionConfirmationEmail,
  buildDecisionUrls,
  getPublicApiBase,
  renderDecisionPage,
  renderPreviewPage,
  sendHtmlEmail,
  verifyApprovalToken,
} from "./blogApproval.email.js";

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

async function sendApprovalMail({
  approvalId,
  post,
  topic,
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
    post,
    topic,
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
 * Create pending approval + email Yes/No publish links (Career-style).
 */
export async function requestBlogPublishApproval({
  post,
  topic = null,
  requestedBy = "agent-automations",
  requesterEmail = "agent-automations@system.local",
  approvalEmails = [],
  expiryHours = 168,
}) {
  const recipients = parseEmails(approvalEmails);
  if (!recipients.length) {
    const err = new Error(
      "No approval emails configured. Add them in Admin → Blog → Agent Automations.",
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

  // Keep post as pending while waiting for Yes/No
  if (post.status !== "pending") {
    await blogModel.updatePost(post.id, {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      featured_image: post.featured_image,
      status: "pending",
      author_name: post.author || post.author_name,
      categories: post.categories || [],
      tags: post.tags || [],
      seo: post.seo || {},
    });
    post = await blogModel.getById(post.id);
  }

  const existing = await approvalModel.getLatestPendingForPost(post.id);
  if (existing) {
    await approvalModel.markDecision(existing.id, "expired", "superseded");
  }

  const approval = await approvalModel.createApproval({
    postId: post.id,
    topicId: topic?.id || null,
    requestedBy,
    requesterEmail,
    approvalEmails: recipients,
    expiryHours,
  });

  const sent = await sendApprovalMail({
    approvalId: approval.id,
    post,
    topic,
    recipients,
    requesterEmail,
    expiresAt: approval.expiresAt,
    isReminder: false,
  });

  return {
    skipped: false,
    approvalId: approval.id,
    postId: post.id,
    status: "pending",
    recipients: sent.recipients,
    expiresAt: approval.expiresAt,
    approveUrl: sent.approveUrl,
    rejectUrl: sent.rejectUrl,
    previewUrl: sent.previewUrl,
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
        postTitle: null,
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
        postTitle: null,
        message: "This approval request was not found.",
      }),
    };
  }

  const postShape = {
    id: approval.post_id,
    title: approval.title,
    slug: approval.slug,
    excerpt: approval.excerpt,
    content: approval.content,
    featured_image: approval.featured_image,
    author_name: approval.author_name,
    status: approval.post_status,
  };

  if (payload.act === "preview") {
    const urls = buildDecisionUrls(approval.id, approval.expires_at);
    return {
      ok: true,
      status: 200,
      html: renderPreviewPage({
        post: postShape,
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
        postTitle: approval.title,
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
        postTitle: approval.title,
        message: `This request was already ${approval.decision}. No further action was taken.`,
      }),
    };
  }

  if (new Date(approval.expires_at).getTime() < Date.now()) {
    await approvalModel.markDecision(approval.id, "expired", actorEmail);
    return {
      ok: false,
      status: 410,
      html: renderDecisionPage({
        ok: false,
        decision: "expired",
        postTitle: approval.title,
        message: "This approval link has expired. Re-run automation or resend from Admin.",
      }),
    };
  }

  const wantApprove = payload.act === "approve";
  const decision = wantApprove ? "approved" : "rejected";
  const nextStatus = wantApprove ? "publish" : "draft";

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
        postTitle: approval.title,
        message: "Could not record decision — it may have been decided by someone else.",
      }),
    };
  }

  const existingPost = await blogModel.getById(approval.post_id);
  let publishedPost = existingPost;
  if (existingPost) {
    publishedPost = await blogModel.updatePost(existingPost.id, {
      title: existingPost.title,
      slug: existingPost.slug,
      excerpt: existingPost.excerpt,
      content: existingPost.content,
      featured_image: existingPost.featured_image,
      status: nextStatus,
      author_name: existingPost.author,
      categories: existingPost.categories || [],
      tags: existingPost.tags || [],
      seo: existingPost.seo || {},
    });
  }

  try {
    const recipients = [
      ...parseEmails(approval.approval_emails),
      ...parseEmails(approval.requester_email),
    ];
    const mail = buildDecisionConfirmationEmail({
      post: publishedPost || postShape,
      decision,
      decidedByEmail: actorEmail,
    });
    await sendHtmlEmail({
      to: recipients,
      subject: mail.subject,
      html: mail.html,
    });
  } catch (err) {
    console.error("[blog-approval] confirmation email failed:", err.message);
  }

  const liveUrl =
    wantApprove && publishedPost?.slug
      ? `https://www.tech2globe.com/blogs/${publishedPost.slug}`
      : null;

  return {
    ok: true,
    status: 200,
    decision,
    post: publishedPost,
    html: renderDecisionPage({
      ok: true,
      decision,
      postTitle: publishedPost?.title || approval.title,
      message: wantApprove
        ? "Thank you. The blog is now live on tech2globe.com."
        : "Understood. The blog will stay as a draft in Admin.",
      liveUrl,
    }),
  };
}

export async function sendTestApprovalEmail(recipientsInput) {
  const recipients = parseEmails(recipientsInput);
  if (!recipients.length) {
    const err = new Error("Add at least one approval email");
    err.status = 400;
    throw err;
  }
  if (!getPublicApiBase()) {
    const err = new Error(
      "Set BACKEND_PUBLIC_URL so Approve/Reject/Preview links work in real emails",
    );
    err.status = 503;
    throw err;
  }

  const samplePost = {
    title: "Sample Blog — Automations Test",
    slug: "sample-blog-automations-test",
    excerpt:
      "This is a test approval email. Real runs will include Yes/No buttons and a live preview of the generated article.",
    author_name: "Tech2Globe Digital Team",
    featured_image: "",
    content: "<p>Sample content only.</p>",
  };
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const urls = buildDecisionUrls("00000000-0000-4000-8000-000000000001", expiresAt);
  const mail = buildApprovalRequestEmail({
    post: samplePost,
    topic: { topic: "Sample automation topic" },
    approveUrl: urls.approveUrl,
    rejectUrl: urls.rejectUrl,
    previewUrl: urls.previewUrl,
    requesterEmail: "agent-automations@tech2globe.com",
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
    note: "Test links use a fake id and will not publish a blog.",
    publicApiBase: getPublicApiBase(),
  };
}
