import * as approvalModel from "./blog20.approval.model.js";
import * as draftsModel from "./blog20.drafts.model.js";
import * as settingsModel from "./blog20.model.js";
import { pushDraftToMailerLite } from "./blog20.mailerliteBot.js";
import {
  buildBlog20ApprovalRequestEmail,
  buildBlog20DecisionConfirmationEmail,
  buildBlog20DecisionUrls,
  getPublicApiBase,
  renderBlog20DecisionPage,
  renderBlog20PreviewPage,
  sendHtmlEmail,
  verifyBlog20ApprovalToken,
} from "./blog20.approval.email.js";

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
  draft,
  settings,
  recipients,
  requesterEmail,
  expiresAt,
  isReminder = false,
}) {
  const urls = buildBlog20DecisionUrls(approvalId, expiresAt);
  if (urls.missingBase) {
    const err = new Error(
      "BACKEND_PUBLIC_URL is not set. Approve/Reject email links need the public API base URL.",
    );
    err.status = 503;
    throw err;
  }

  const clientBlogUrl =
    settings.client_blog_url || settings.client_site_url || "";
  const mail = buildBlog20ApprovalRequestEmail({
    draft,
    clientBlogUrl,
    approveDraftUrl: urls.approveDraftUrl,
    approvePublishUrl: urls.approvePublishUrl,
    reviseUrl: urls.reviseUrl,
    rejectUrl: urls.rejectUrl,
    previewUrl: urls.previewUrl,
    requesterEmail,
    expiresAt,
    isReminder,
    allowDirectPublish: settings.mailerlite_allow_direct_publish !== false,
  });

  const sent = await sendHtmlEmail({
    to: recipients,
    subject: mail.subject,
    html: mail.html,
    replyTo: requesterEmail || undefined,
  });

  return { ...sent, ...urls };
}

async function sendDecisionConfirmation({
  approval,
  draft,
  settings,
  decision,
  decidedByEmail,
  pushResult = null,
}) {
  const clientBlogUrl =
    settings.client_blog_url || settings.client_site_url || "";
  const recipients = [
    ...parseEmails(approval.approval_emails),
    ...parseEmails(approval.requester_email),
  ];
  const mail = buildBlog20DecisionConfirmationEmail({
    draft,
    clientBlogUrl,
    decision,
    decidedByEmail,
    pushResult,
  });
  await sendHtmlEmail({
    to: recipients,
    subject: mail.subject,
    html: mail.html,
  });
}

function runMailerLitePushInBackground({
  approvalId,
  draftId,
  decidedByEmail,
  approval,
  publishLive = false,
}) {
  void (async () => {
    let pushResult = { ok: false, error: "unknown" };
    try {
      await approvalModel.updateApprovalPushStatus(approvalId, {
        mailerlite_push_status: "processing",
        mailerlite_push_error: null,
      });
      const result = await pushDraftToMailerLite(draftId, { publishLive });
      pushResult = { ok: true, ...result };
      await approvalModel.updateApprovalPushStatus(approvalId, {
        mailerlite_push_status: "pushed",
        mailerlite_push_error: null,
      });
    } catch (err) {
      pushResult = { ok: false, error: err.message || String(err) };
      await approvalModel.updateApprovalPushStatus(approvalId, {
        mailerlite_push_status: "failed",
        mailerlite_push_error: pushResult.error,
      });
    }

    try {
      const draft = await draftsModel.getDraftById(draftId);
      const settings = await settingsModel.getSettings();
      if (draft) {
        await sendDecisionConfirmation({
          approval,
          draft,
          settings,
          decision: "approved",
          decidedByEmail,
          pushResult,
        });
      }
    } catch (err) {
      console.error("[blog20-approval] push confirmation email failed:", err.message);
    }
  })();
}

/**
 * Email approvers when a Blog-2.0 draft is ready for MailerLite push.
 */
export async function requestBlog20DraftApproval({
  draft,
  requestedBy = "blog-2.0-agent",
  requesterEmail = "blog-2.0@system.local",
  approvalEmails = [],
  expiryHours = 168,
}) {
  const recipients = parseEmails(approvalEmails);
  if (!recipients.length) {
    const err = new Error(
      "No approval emails configured. Add them in Admin → Blog-2.0 → Setup.",
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

  if (draft.status !== "pending") {
    await draftsModel.updateDraftStatus(draft.id, "pending");
    draft = await draftsModel.getDraftById(draft.id);
  }

  const existing = await approvalModel.getLatestPendingForDraft(draft.id);
  if (existing) {
    await approvalModel.markDecision(existing.id, "expired", "superseded");
  }

  const approval = await approvalModel.createApproval({
    draftId: draft.id,
    requestedBy,
    requesterEmail,
    approvalEmails: recipients,
    expiryHours,
  });

  const settings = await settingsModel.getSettings();
  const sent = await sendApprovalMail({
    approvalId: approval.id,
    draft,
    settings,
    recipients,
    requesterEmail,
    expiresAt: approval.expiresAt,
    isReminder: false,
  });

  return {
    skipped: false,
    approvalId: approval.id,
    draftId: draft.id,
    status: "pending",
    recipients: sent.recipients,
    expiresAt: approval.expiresAt,
    approveUrl: sent.approveUrl,
    rejectUrl: sent.rejectUrl,
    previewUrl: sent.previewUrl,
  };
}

export async function handleBlog20SignedAction({ token, actorEmail = null }) {
  let payload;
  try {
    payload = verifyBlog20ApprovalToken(token);
  } catch {
    return {
      ok: false,
      status: 400,
      html: renderBlog20DecisionPage({
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
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: null,
        message: "This approval request was not found.",
      }),
    };
  }

  const draftShape = {
    id: approval.draft_id,
    title: approval.title,
    slug: approval.slug,
    excerpt: approval.excerpt,
    content: approval.content,
    featured_image: approval.featured_image,
    author_name: approval.author_name,
    status: approval.draft_status,
  };

  const settings = await settingsModel.getSettings();
  const allowDirectPublish = settings.mailerlite_allow_direct_publish !== false;

  if (payload.act === "preview") {
    const urls = buildBlog20DecisionUrls(approval.id, approval.expires_at);
    return {
      ok: true,
      status: 200,
      html: renderBlog20PreviewPage({
        draft: draftShape,
        approveDraftUrl: urls.approveDraftUrl,
        approvePublishUrl: urls.approvePublishUrl,
        reviseUrl: urls.reviseUrl,
        rejectUrl: urls.rejectUrl,
        decision: approval.decision,
        expiresAt: approval.expires_at,
        allowDirectPublish,
      }),
    };
  }

  const approveActs = ["approve", "approve_draft", "approve_publish"];
  if (!approveActs.includes(payload.act) && payload.act !== "reject") {
    return {
      ok: false,
      status: 400,
      html: renderBlog20DecisionPage({
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
      html: renderBlog20DecisionPage({
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
      html: renderBlog20DecisionPage({
        ok: false,
        decision: "expired",
        postTitle: approval.title,
        message: "This approval link has expired. Ask admin to resend from Blog-2.0 Drafts.",
      }),
    };
  }

  const wantApprove = approveActs.includes(payload.act);
  const publishLive = payload.act === "approve_publish";
  const decision = wantApprove ? "approved" : "rejected";

  if (publishLive && !allowDirectPublish) {
    return {
      ok: false,
      status: 403,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: null,
        postTitle: approval.title,
        message:
          "Direct publish is disabled in Blog-2.0 settings. Use Save as draft instead, or ask admin to enable Publish live in approval emails.",
      }),
    };
  }

  const updated = await approvalModel.markDecision(
    approval.id,
    decision,
    actorEmail,
    wantApprove ? (publishLive ? "live" : "draft") : null,
  );
  if (!updated || updated.decision !== decision) {
    return {
      ok: false,
      status: 409,
      html: renderBlog20DecisionPage({
        ok: false,
        decision: updated?.decision || null,
        postTitle: approval.title,
        message: "Could not record decision — it may have been decided by someone else.",
      }),
    };
  }

  const mailerLiteDashboard = settings.client_blog_url || settings.client_site_url || null;

  if (wantApprove) {
    await draftsModel.updateDraftStatus(approval.draft_id, "ready_for_mailerlite");

    if (!settings.mailerlite_bot_enabled) {
      try {
        await sendDecisionConfirmation({
          approval,
          draft: draftShape,
          settings,
          decision,
          decidedByEmail: actorEmail,
          pushResult: {
            ok: false,
            error: "MailerLite browser bot is disabled in Blog-2.0 settings.",
          },
        });
      } catch (err) {
        console.error("[blog20-approval] confirmation email failed:", err.message);
      }

      return {
        ok: true,
        status: 200,
        decision,
        html: renderBlog20DecisionPage({
          ok: true,
          decision,
          postTitle: approval.title,
          message:
            "Approved, but the MailerLite bot is disabled. Enable it in Admin → Blog-2.0 → MailerLite, then push manually from Drafts.",
          mailerLiteUrl: mailerLiteDashboard,
        }),
      };
    }

    await approvalModel.updateApprovalPushStatus(approval.id, {
      mailerlite_push_status: "queued",
      mailerlite_push_error: null,
    });

    runMailerLitePushInBackground({
      approvalId: approval.id,
      draftId: approval.draft_id,
      decidedByEmail: actorEmail,
      approval,
      publishLive,
    });

    return {
      ok: true,
      status: 200,
      decision,
      html: renderBlog20DecisionPage({
        ok: true,
        decision,
        postTitle: approval.title,
        message: publishLive
          ? "Thank you. The MailerLite bot is publishing this post live on the client website now. You will receive a confirmation email when it finishes."
          : "Thank you. The MailerLite bot is saving this post as a draft on the client website now. You will receive a confirmation email when it finishes. You can Publish later in MailerLite if needed.",
        mailerLiteUrl: mailerLiteDashboard,
      }),
    };
  }

  await draftsModel.updateDraftStatus(approval.draft_id, "draft");

  try {
    await sendDecisionConfirmation({
      approval,
      draft: draftShape,
      settings,
      decision,
      decidedByEmail: actorEmail,
    });
  } catch (err) {
    console.error("[blog20-approval] rejection confirmation email failed:", err.message);
  }

  return {
    ok: true,
    status: 200,
    decision,
    html: renderBlog20DecisionPage({
      ok: true,
      decision,
      postTitle: approval.title,
      message: "Understood. The blog stays as a draft in Blog-2.0 Admin.",
    }),
  };
}

export async function sendTestBlog20ApprovalEmail(recipientsInput) {
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

  const sampleDraft = {
    title: "Sample Bright CRM Blog — Approval Test",
    slug: "sample-bright-crm-blog-test",
    excerpt:
      "This is a test approval email. Real runs include Preview + Yes/No buttons for MailerLite push.",
    author_name: "Bright CRM Team",
    featured_image: "",
    content: "<p>Sample content only — not a real draft.</p>",
  };
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const settings = await settingsModel.getSettings();
  const urls = buildBlog20DecisionUrls("00000000-0000-4000-8000-000000000002", expiresAt);
  const mail = buildBlog20ApprovalRequestEmail({
    draft: sampleDraft,
    clientBlogUrl: "https://preview.mailerlite.io/example/blog",
    approveDraftUrl: urls.approveDraftUrl,
    approvePublishUrl: urls.approvePublishUrl,
    reviseUrl: urls.reviseUrl,
    rejectUrl: urls.rejectUrl,
    previewUrl: urls.previewUrl,
    requesterEmail: "blog-2.0@tech2globe.com",
    expiresAt,
    isReminder: false,
    allowDirectPublish: settings.mailerlite_allow_direct_publish !== false,
  });

  await sendHtmlEmail({
    to: recipients,
    subject: `[TEST] ${mail.subject}`,
    html: mail.html.replace(
      /Approve blog:/,
      "TEST EMAIL — sample only. Approve blog:",
    ),
  });

  return {
    sent: true,
    recipients,
    note: "Test links use a fake id and will not push to MailerLite.",
    publicApiBase: getPublicApiBase(),
  };
}
