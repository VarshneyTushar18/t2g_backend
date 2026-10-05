import { tool } from "@openai/agents";
import { z } from "zod";
import { markdownToHtml } from "../agents/blog/blogAgent.tools.js";
import { humanizeBlogHtml } from "../agents/blog/blogAgent.humanize.js";
import * as draftsModel from "./blog20.drafts.model.js";
import * as settingsModel from "./blog20.model.js";
import { pushDraftToMailerLite } from "./blog20.mailerliteBot.js";
import { requestBlog20DraftApproval } from "./blog20.approval.service.js";

export function createBlog20AgentTools({ userId, threadId, humanizePercent = 70 }) {
  const createBrightCrmBlogDraft = tool({
    name: "create_bright_crm_blog_draft",
    description:
      "Save a blog draft for Bright CRM (MailerLite website). NEVER use Tech2Globe blog tools. This stores a draft for manual publish on the client's MailerLite site.",
    parameters: z.object({
      title: z.string(),
      content: z.string().describe("Full body as clean HTML or Markdown"),
      excerpt: z.string().nullable().default(null),
      metaDescription: z.string().nullable().default(null),
      focusKeyword: z.string().nullable().default(null),
      slug: z.string().nullable().default(null),
      author_name: z.string().nullable().default("Bright CRM Team"),
      featured_image: z.string().nullable().default(null),
      status: z.enum(["draft", "pending", "ready_for_mailerlite"]).default("draft"),
    }),
    execute: async (params) => {
      const settings = await settingsModel.getSettings();
      let html = markdownToHtml(params.content);
      html = await humanizeBlogHtml(html, {
        humanizePercent,
        title: params.title,
      });
      const excerpt = (
        params.excerpt ||
        params.metaDescription ||
        params.title
      ).slice(0, 300);
      const draft = await draftsModel.createDraft({
        title: params.title,
        slug: params.slug,
        excerpt,
        content: html,
        featured_image: params.featured_image,
        focus_keyword: params.focusKeyword,
        status: params.status,
        author_name: params.author_name,
        created_by: userId,
        thread_id: threadId,
      });
      const blogBase = settings.client_blog_url || settings.client_site_url || "";
      let botPush = null;
      let approval = null;

      if (settings.mailerlite_bot_enabled && settings.mailerlite_bot_auto_push) {
        try {
          botPush = await pushDraftToMailerLite(draft.id);
        } catch (err) {
          botPush = { ok: false, error: err.message };
        }
      } else if ((settings.approval_emails || []).length > 0) {
        try {
          approval = await requestBlog20DraftApproval({
            draft,
            requestedBy: userId,
            requesterEmail: null,
            approvalEmails: settings.approval_emails,
          });
        } catch (err) {
          approval = { ok: false, error: err.message };
        }
      }

      const onMailerLite = Boolean(botPush?.ok);
      const approvalSent = Boolean(approval && !approval.skipped && approval.approvalId);
      return {
        ok: true,
        id: draft.id,
        slug: draft.slug,
        title: draft.title,
        status: approvalSent ? "pending" : draft.status,
        project: "blog_2_0",
        client_site: settings.client_site_url,
        client_blog: blogBase,
        mailerlite_note: onMailerLite
          ? "Draft pushed to MailerLite website as draft — human must Publish in MailerLite."
          : approvalSent
            ? "Approval email sent to team. When they click Yes, the MailerLite bot will push this draft automatically."
            : "Draft saved in Blog-2.0 only — NOT on MailerLite yet. Add approval emails in Setup or push manually from Drafts.",
        suggested_slug: draft.slug,
        suggested_url_after_manual_publish: blogBase
          ? `${blogBase.replace(/\/$/, "")}/${draft.slug}`
          : null,
        on_mailerlite_site: onMailerLite,
        mailerlite_bot: botPush,
        approval,
        featured_image: draft.featured_image,
        humanized: humanizePercent >= 40,
        humanize_percent: humanizePercent,
      };
    },
  });

  return [createBrightCrmBlogDraft];
}
