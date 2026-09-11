import { z } from "zod";
import { tool } from "@openai/agents";
import * as blogModel from "../../blog/blog.model.js";
import * as agentModel from "../blog/blogAgent.model.js";
import { generateAndUploadBlogImage } from "./blogImage.generate.js";

/** @param {{ userId: string, threadId: string, canEdit: boolean }} ctx */
export function createBlogImageAgentTools({ userId, threadId, canEdit }) {
  const generateBlogImage = tool({
    name: "generate_blog_image",
    description:
      "Generate a blog image from a text prompt, then upload it to Cloudinary. Always use this when the user asks for an image. Returns a permanent Cloudinary URL.",
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          "Detailed visual prompt: subject, setting, style. Example: Amazon seller at laptop reviewing PPC ads, modern office, 16:9",
        ),
      aspect: z
        .enum(["16:9", "1:1", "4:3"])
        .default("16:9")
        .describe("16:9 for covers, 1:1 for social, 4:3 for in-article"),
    }),
    execute: async ({ prompt, aspect }) => {
      try {
        const generated = await generateAndUploadBlogImage({ prompt, aspect });
        const saved = await agentModel.saveGeneratedImage({
          userId,
          threadId,
          prompt,
          cloudinaryUrl: generated.url,
          publicId: generated.public_id,
          width: generated.width,
          height: generated.height,
        });
        return {
          ok: true,
          url: saved.url,
          public_id: saved.public_id,
          width: generated.width,
          height: generated.height,
          prompt,
          note: "Uploaded to Cloudinary. Use this URL as featured_image or in post HTML.",
        };
      } catch (err) {
        return { ok: false, error: err.message || "Image generation failed" };
      }
    },
  });

  const attachImageToPost = tool({
    name: "attach_image_to_post",
    description:
      "Set a Cloudinary image as the featured/cover image of an existing blog post.",
    parameters: z.object({
      post_id: z.number().int().nullable().default(null),
      slug: z.string().nullable().default(null),
      image_url: z.string().describe("Cloudinary URL from generate_blog_image"),
    }),
    execute: async ({ post_id, slug, image_url }) => {
      if (!canEdit) {
        return { ok: false, error: "User cannot edit blog posts." };
      }
      try {
        let post = null;
        if (post_id) post = await blogModel.getById(post_id);
        else if (slug) post = await blogModel.getBySlug(slug);
        if (!post) return { ok: false, error: "Post not found" };

        const updated = await blogModel.updatePost(post.id, {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          featured_image: image_url,
          status: post.status,
          author_name: post.author,
          categories: post.categories || [],
          tags: post.tags || [],
          seo: {
            ...(post.seo || {}),
            og_image: image_url,
            twitter_image: image_url,
          },
        });

        return {
          ok: true,
          id: updated.id,
          slug: updated.slug,
          featured_image: image_url,
          url: `https://www.tech2globe.com/blogs/${updated.slug}`,
        };
      } catch (err) {
        return { ok: false, error: err.message || "Could not attach image" };
      }
    },
  });

  const listBlogPosts = tool({
    name: "list_blog_posts",
    description: "List recent posts so you can attach a generated image to one of them.",
    parameters: z.object({
      limit: z.number().int().min(1).max(30).default(10),
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
          posts: items.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            status: p.status,
            featured_image: p.featured_image || "",
          })),
        };
      } catch (err) {
        return { ok: false, error: err.message || "List failed" };
      }
    },
  });

  return [generateBlogImage, attachImageToPost, listBlogPosts];
}
