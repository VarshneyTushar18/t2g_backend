import { z } from "zod";
import { tool } from "@openai/agents";
import * as blogModel from "../../blog/blog.model.js";

function slugify(title) {
  return String(title || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function markdownToHtml(md) {
  const text = String(md || "").trim();
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const line = block.trim();
      if (!line) return "";
      if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      const withBreaks = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />");
      return `<p>${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join("");
}

/** @param {{ canPublish: boolean, canDelete: boolean }} permissions */
export function createBlogAgentTools({ canPublish, canDelete }) {
  const createBlogPost = tool({
    name: "create_blog_post",
    description:
      "Create or publish a blog post on Tech2Globe. Use publish status only when allowed.",
    parameters: z.object({
      title: z.string().describe("Blog title"),
      content: z.string().describe("Full blog body (Markdown or HTML)"),
      excerpt: z.string().nullable().default(null),
      metaDescription: z.string().nullable().default(null),
      metaTitle: z.string().nullable().default(null),
      focusKeyword: z.string().nullable().default(null),
      slug: z.string().nullable().default(null),
      tags: z.array(z.string()).nullable().default(null),
      categoryIds: z.array(z.number()).nullable().default(null),
      status: z
        .enum(["published", "draft", "publish"])
        .default("draft")
        .describe("Use publish for live; draft if user lacks publish permission"),
      author_name: z
        .string()
        .nullable()
        .default(null)
        .describe("Display author — use name user requested"),
    }),
    execute: async (params) => {
      try {
        let resolvedStatus =
          params.status === "published" || params.status === "publish"
            ? "publish"
            : "draft";
        if (resolvedStatus === "publish" && !canPublish) {
          resolvedStatus = "draft";
        }

        const slug = params.slug || slugify(params.title);
        const html = markdownToHtml(params.content);
        const author = (params.author_name || "Tech2Globe Digital Team").trim();

        const post = await blogModel.createPost({
          title: params.title,
          slug,
          excerpt: params.excerpt || params.title,
          content: html,
          status: resolvedStatus,
          author_name: author,
          categories: params.categoryIds || [],
          tags: params.tags || [],
          seo: {
            meta_title: (params.metaTitle || params.title).slice(0, 60),
            meta_description: (
              params.metaDescription ||
              params.excerpt ||
              params.title
            ).slice(0, 160),
            focus_keyword:
              params.focusKeyword ||
              (params.tags && params.tags[0]) ||
              params.title.split(" ")[0],
            canonical_url: `https://www.tech2globe.com/blogs/${slug}`,
            robots_noindex: false,
            robots_nofollow: false,
          },
        });

        return {
          ok: true,
          id: post.id,
          slug: post.slug,
          title: post.title,
          status: post.status,
          author_name: post.author_name,
          url: `https://www.tech2globe.com/blogs/${post.slug}`,
          note:
            resolvedStatus === "draft" && canPublish === false
              ? "Saved as draft — user does not have publish permission."
              : undefined,
        };
      } catch (err) {
        return { ok: false, error: err.message || "Create failed" };
      }
    },
  });

  const deleteBlogPost = tool({
    name: "delete_blog_post",
    description: "Delete a blog post by numeric id. Only when user explicitly asks.",
    parameters: z.object({
      id: z.number().int().describe("Blog post numeric id"),
    }),
    execute: async ({ id }) => {
      if (!canDelete) {
        return { ok: false, error: "User does not have delete permission." };
      }
      try {
        const existing = await blogModel.getById(id);
        if (!existing) return { ok: false, error: "Post not found" };
        await blogModel.deletePost(id);
        return { ok: true, id, title: existing.title };
      } catch (err) {
        return { ok: false, error: err.message || "Delete failed" };
      }
    },
  });

  const listBlogPosts = tool({
    name: "list_blog_posts",
    description: "List recent blog posts (admin view).",
    parameters: z.object({
      limit: z.number().int().min(1).max(50).default(15),
      search: z.string().nullable().default(null),
    }),
    execute: async ({ limit, search }) => {
      try {
        const result = await blogModel.getAllAdmin({
          page: 1,
          limit,
          search: search || "",
        });
        const items = (result.data || []).slice(0, limit);
        return {
          ok: true,
          count: items.length,
          posts: items.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            status: p.status,
            author_name: p.author_name,
          })),
        };
      } catch (err) {
        return { ok: false, error: err.message || "List failed" };
      }
    },
  });

  return [createBlogPost, deleteBlogPost, listBlogPosts];
}
