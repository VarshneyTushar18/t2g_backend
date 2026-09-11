import { z } from "zod";
import { tool } from "@openai/agents";
import * as blogModel from "../../blog/blog.model.js";
import {
  injectInlineImages,
  injectInlineImagesFromUrls,
  pickStockImage,
} from "./blogAgent.images.js";
import { generateAndUploadBlogImage } from "../blog-image/blogImage.generate.js";

function slugify(title) {
  return String(title || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert inline markdown (**bold**, *italic*, links, code) → HTML. Strips leftover asterisks. */
function formatInline(text) {
  let s = escapeHtml(text);
  s = s.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    '<img src="$2" alt="$1" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;" />',
  );
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  // Remove leftover emphasis asterisks only (never strip underscores — breaks target="_blank")
  s = s.replace(/\*{1,2}/g, "");
  return s;
}

function cleanMarkdownInHtml(html) {
  return String(html || "")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n<]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\*{1,2}/g, "");
}

/**
 * Convert agent Markdown (or mixed HTML) into clean blog HTML.
 * Supports headings, paragraphs, lists, blockquotes, images, bold/italic/links.
 */
function markdownToHtml(md) {
  const text = String(md || "").trim();
  if (!text) return "";

  // Already HTML (CKEditor / agent HTML output) — still scrub leftover **bold**
  if (/<(h[1-6]|p|ul|ol|li|div|article|section|figure)\b/i.test(text)) {
    return cleanMarkdownInHtml(text);
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    const joined = buf.join(" ").trim();
    if (joined) out.push(`<p>${formatInline(joined)}</p>`);
    buf.length = 0;
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote><p>${formatInline(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    const mdImg = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
    if (mdImg) {
      out.push(
        `<figure class="blog-agent-image"><img src="${mdImg[2]}" alt="${escapeHtml(mdImg[1])}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;" /><figcaption>${formatInline(mdImg[1])}</figcaption></figure>`,
      );
      i += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li>${formatInline(lines[i].trim().replace(/^[-*+]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(
          `<li>${formatInline(lines[i].trim().replace(/^\d+[.)]\s+/, ""))}</li>`,
        );
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const para = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        /^(#{1,4})\s+/.test(next) ||
        /^[-*+]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next) ||
        next.startsWith("> ") ||
        /^!\[/.test(next) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    flushParagraph(para);
  }

  return out.join("\n");
}

export { markdownToHtml };

/** @param {{ canPublish: boolean, canDelete: boolean }} permissions */
export function createBlogAgentTools({ canPublish, canDelete }) {
  const createBlogPost = tool({
    name: "create_blog_post",
    description:
      "Create or publish a blog post on Tech2Globe. Use publish status only when allowed.",
    parameters: z.object({
      title: z.string().describe("Blog title"),
      content: z
        .string()
        .describe(
          "Full blog body as clean Markdown OR semantic HTML. Prefer ## headings, short paragraphs, bullet lists. Never leave raw ** or * asterisks visible.",
        ),
      excerpt: z.string().nullable().default(null),
      metaDescription: z.string().nullable().default(null),
      metaTitle: z.string().nullable().default(null),
      focusKeyword: z.string().nullable().default(null),
      slug: z.string().nullable().default(null),
      tags: z.array(z.string()).nullable().default(null),
      categoryIds: z.array(z.number()).nullable().default(null),
      status: z
        .enum(["published", "draft", "publish", "pending"])
        .default("draft")
        .describe("Use publish for live; pending for review; draft if user lacks publish permission"),
      author_name: z
        .string()
        .nullable()
        .default(null)
        .describe("Display author — use name user requested"),
      featured_image: z
        .string()
        .nullable()
        .default(null)
        .describe("Cover image URL from pick_blog_image (https only)"),
      inline_image_urls: z
        .array(
          z
            .string()
            .regex(/^https?:\/\/.+/i, "inline_image_urls must be https URLs"),
        )
        .nullable()
        .default(null)
        .describe(
          "Optional inline image URLs (Cloudinary/https). If provided, these are inserted into the article body.",
        ),
      add_inline_images: z
        .boolean()
        .default(true)
        .describe("Insert 1–2 topic images into the article body"),
    }),
    execute: async (params) => {
      try {
        let resolvedStatus = "draft";
        if (params.status === "published" || params.status === "publish") {
          resolvedStatus = "publish";
        } else if (params.status === "pending") {
          resolvedStatus = "pending";
        }
        if (resolvedStatus === "publish" && !canPublish) {
          resolvedStatus = "draft";
        }

        const slug = params.slug || slugify(params.title);
        let html = markdownToHtml(params.content);
        const author = (params.author_name || "Tech2Globe Digital Team").trim();
        const topicHint = [params.title, params.focusKeyword, ...(params.tags || [])]
          .filter(Boolean)
          .join(" ");
        const cover =
          params.featured_image || pickStockImage(topicHint).url;
        if (params.inline_image_urls && params.inline_image_urls.length) {
          html = injectInlineImagesFromUrls(html, params.inline_image_urls);
        } else if (params.add_inline_images !== false) {
          html = injectInlineImages(html, topicHint);
        }

        const post = await blogModel.createPost({
          title: params.title,
          slug,
          excerpt: params.excerpt || params.title,
          content: html,
          featured_image: cover,
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
          featured_image: cover,
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

  const updateBlogPost = tool({
    name: "update_blog_post",
    description:
      "Update an existing blog post (draft or published) by id. Use when the user asks to improve, rewrite, or fix a post you already created.",
    parameters: z.object({
      id: z.number().int().describe("Blog post numeric id"),
      title: z.string().nullable().default(null),
      content: z
        .string()
        .nullable()
        .default(null)
        .describe("Full body as clean Markdown or HTML (no raw ** asterisks in final HTML)"),
      excerpt: z.string().nullable().default(null),
      metaDescription: z.string().nullable().default(null),
      metaTitle: z.string().nullable().default(null),
      focusKeyword: z.string().nullable().default(null),
      slug: z.string().nullable().default(null),
      tags: z.array(z.string()).nullable().default(null),
      status: z
        .enum(["published", "draft", "publish", "pending"])
        .nullable()
        .default(null),
      author_name: z.string().nullable().default(null),
      featured_image: z.string().nullable().default(null),
    }),
    execute: async (params) => {
      try {
        const existing = await blogModel.getById(params.id);
        if (!existing) return { ok: false, error: "Post not found" };

        let resolvedStatus = existing.status;
        if (params.status === "published" || params.status === "publish") {
          resolvedStatus = "publish";
        } else if (params.status === "pending") {
          resolvedStatus = "pending";
        } else if (params.status === "draft") {
          resolvedStatus = "draft";
        }
        if (resolvedStatus === "publish" && !canPublish) {
          resolvedStatus = existing.status === "publish" ? "publish" : "draft";
        }

        const content =
          params.content != null
            ? markdownToHtml(params.content)
            : existing.content;

        const seo = {
          ...(existing.seo || {}),
          meta_title: (
            params.metaTitle ||
            params.title ||
            existing.seo?.meta_title ||
            existing.title
          ).slice(0, 60),
          meta_description: (
            params.metaDescription ||
            params.excerpt ||
            existing.seo?.meta_description ||
            existing.excerpt ||
            existing.title
          ).slice(0, 160),
          focus_keyword:
            params.focusKeyword ||
            existing.seo?.focus_keyword ||
            (params.tags && params.tags[0]) ||
            existing.title.split(" ")[0],
        };

        const updated = await blogModel.updatePost(existing.id, {
          title: params.title || existing.title,
          slug: params.slug || existing.slug,
          excerpt: params.excerpt || existing.excerpt,
          content,
          featured_image: params.featured_image || existing.featured_image,
          status: resolvedStatus,
          author_name: params.author_name || existing.author,
          categories: existing.categories || [],
          tags: params.tags || existing.tags || [],
          seo,
        });

        return {
          ok: true,
          id: updated.id,
          slug: updated.slug,
          title: updated.title,
          status: updated.status,
          author_name: updated.author,
          url: `https://www.tech2globe.com/blogs/${updated.slug}`,
          featured_image: updated.featured_image,
          updated: true,
        };
      } catch (err) {
        return { ok: false, error: err.message || "Update failed" };
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

  const pickBlogImage = tool({
    name: "pick_blog_image",
    description:
      "Pick a royalty-free cover/inline image URL for a topic. Call this before create_blog_post and pass featured_image.",
    parameters: z.object({
      topic: z
        .string()
        .describe("Keywords: amazon ppc, shopify, seo, ai, ecommerce, etc."),
    }),
    execute: async ({ topic }) => {
      const picked = pickStockImage(topic);
      return { ok: true, ...picked };
    },
  });

  const generateBlogImage = tool({
    name: "generate_blog_image",
    description:
      "Generate a Tech2Globe blog image via AI and upload it to Cloudinary. Call this when the user explicitly wants AI-generated images. Returns a permanent Cloudinary URL (featured_image).",
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          "Visual prompt for the image generator (must be about the blog topic; no logos; no readable text).",
      ),
      aspect: z
        .enum(["16:9", "1:1", "4:3"])
        .default("16:9")
        .describe("16:9 is best for cover images"),
    }),
    execute: async ({ prompt, aspect }) => {
      const generated = await generateAndUploadBlogImage({
        prompt,
        aspect,
      });
      return {
        ok: true,
        url: generated.url,
        public_id: generated.public_id,
        width: generated.width,
        height: generated.height,
      };
    },
  });

  const addImagesToPost = tool({
    name: "add_images_to_post",
    description:
      "Add a cover image and inline images to an existing blog post (by id or slug).",
    parameters: z.object({
      id: z.number().int().nullable().default(null),
      slug: z.string().nullable().default(null),
      topic: z.string().nullable().default(null),
      featured_image: z
        .string()
        .nullable()
        .default(null)
        .describe("Optional custom https image URL"),
    }),
    execute: async ({ id, slug, topic, featured_image }) => {
      try {
        let post = null;
        if (id) post = await blogModel.getById(id);
        else if (slug) post = await blogModel.getBySlug(slug);
        if (!post) return { ok: false, error: "Post not found" };

        const hint = topic || post.title || post.slug;
        const cover = featured_image || pickStockImage(hint).url;
        const content = injectInlineImages(post.content || "", hint);

        const updated = await blogModel.updatePost(post.id, {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content,
          featured_image: cover,
          status: post.status,
          author_name: post.author,
          categories: post.categories || [],
          tags: post.tags || [],
          seo: post.seo || {},
        });

        return {
          ok: true,
          id: updated.id,
          slug: updated.slug,
          featured_image: cover,
          url: `https://www.tech2globe.com/blogs/${updated.slug}`,
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not add images" };
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

  return [
    pickBlogImage,
    generateBlogImage,
    createBlogPost,
    updateBlogPost,
    addImagesToPost,
    deleteBlogPost,
    listBlogPosts,
  ];
}
