import { tool } from "@openai/agents";
import { z } from "zod";
import * as draftsModel from "./blog20.drafts.model.js";
import * as settingsModel from "./blog20.model.js";

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
      const draft = await draftsModel.createDraft({
        title: params.title,
        slug: params.slug,
        excerpt: params.excerpt || params.metaDescription || params.title,
        content: params.content,
        featured_image: params.featured_image,
        focus_keyword: params.focusKeyword,
        status: params.status,
        author_name: params.author_name,
        created_by: userId,
        thread_id: threadId,
      });
      const blogBase = settings.client_blog_url || settings.client_site_url || "";
      return {
        ok: true,
        id: draft.id,
        slug: draft.slug,
        title: draft.title,
        status: draft.status,
        project: "blog_2_0",
        client_site: settings.client_site_url,
        client_blog: blogBase,
        mailerlite_note:
          "Draft saved for Bright CRM only. Open MailerLite website blog editor and paste title, excerpt, content, and featured image.",
        url: blogBase ? `${blogBase.replace(/\/$/, "")}/${draft.slug}` : null,
        featured_image: draft.featured_image,
        humanize_percent: humanizePercent,
      };
    },
  });

  return [createBrightCrmBlogDraft];
}
