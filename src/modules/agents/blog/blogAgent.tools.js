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
      const mdImg = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
      if (mdImg) {
        return `<figure class="blog-agent-image"><img src="${mdImg[2]}" alt="${mdImg[1]}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;" /><figcaption>${mdImg[1]}</figcaption></figure>`;
      }
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
      featured_image: z
        .string()
        .nullable()
        .default(null)
        .describe("Cover image URL from pick_blog_image (https only)"),
      inline_image_urls: z
        .array(z.string().url())
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
        let resolvedStatus =
          params.status === "published" || params.status === "publish"
            ? "publish"
            : "draft";
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
    addImagesToPost,
    deleteBlogPost,
    listBlogPosts,
  ];
}
