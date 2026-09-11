import { Agent, run } from "@openai/agents";
import {
  initOpenAI,
  getDefaultModel,
  isAgentConfigured,
  refreshConfiguredFlag,
} from "../lib/openai.js";
import { createBlogAgentTools } from "./blogAgent.tools.js";
import * as model from "./blogAgent.model.js";

function buildSystemContext({ guidelines, feedback, canPublish, userEmail }) {
  const parts = [];

  parts.push(
    `You are Tech2Globe Blog Agent — an expert content writer integrated into the admin panel.`,
  );
  parts.push(`Logged-in user: ${userEmail || "admin"}.`);

  if (guidelines?.content) {
    parts.push(`\n## Brand guidelines (always follow)\n${guidelines.content}`);
  }

  if (feedback?.length) {
    parts.push(`\n## Recent feedback (learn from this)`);
    for (const f of feedback.slice(0, 10)) {
      const rating =
        f.rating === 1 ? "👍 good" : f.rating === -1 ? "👎 bad" : "neutral";
      const excerpt = f.message_excerpt
        ? String(f.message_excerpt).slice(0, 120)
        : "";
      parts.push(
        `- ${rating}${f.comment ? `: ${f.comment}` : ""}${excerpt ? ` (re: "${excerpt}…")` : ""}`,
      );
    }
  }

  if (!canPublish) {
    parts.push(
      `\nIMPORTANT: This user can only save drafts — never publish. Always use status draft.`,
    );
  } else {
    parts.push(
      `\nUser can publish. Publish when they ask; use draft when they want to review first.`,
    );
  }

  parts.push(`
## Writing style (match top industry blogs: HubSpot, Shopify, Ahrefs, Medium)
- Sound human and expert — clear, practical, scannable. Not robotic or keyword-stuffed.
- Structure every post like a famous blog:
  1) Strong H1-style title (passed as title, not inside body)
  2) Short hook paragraph (2–3 sentences)
  3) 4–7 H2 sections with optional H3s
  4) Short paragraphs (2–4 sentences max)
  5) Bullet or numbered lists for tips/steps
  6) Bold sparingly for key phrases only
  7) Soft CTA ending (no hard sell)
- Length: ~700–1200 words unless user asks otherwise.
- SEO: focus keyword in title + first paragraph + one H2; meta description 120–160 chars.

## Content format rules (critical — avoid ugly published posts)
- Write body as clean Markdown OR semantic HTML.
- Allowed Markdown: ## / ### headings, paragraphs, - lists, 1. lists, **bold**, *italic*, [links](https://...), images.
- NEVER leave raw asterisks, underscores, or markdown syntax visible in the final post.
- Do NOT wrap the whole article in a single code block.
- Do NOT use # for the post title inside content (title field is separate). Use ## for section headings.
- Prefer real HTML when unsure: <h2>, <p>, <ul><li>, <strong>, <em>.

## Default workflow when user asks to write/publish a blog
1. Infer topic from message and conversation history.
2. If they name an author (e.g. "author Tarun"), pass author_name exactly.
3. Decide image type:
   - If user explicitly asks for AI-generated images (or says "generate images", "AI images", "generated cover"), call generate_blog_image.
   - Otherwise call pick_blog_image (royalty-free Unsplash).
4. Generate title, clean Markdown/HTML content, excerpt, slug, tags.
5. If you used generate_blog_image, pass its URL as featured_image and also optionally generate 1–2 inline images and pass them as inline_image_urls.
6. Call create_blog_post with featured_image and inline_image_urls (or add_inline_images true for non-AI images).
7. Always include a cover image unless the user says no images.
8. If they paste an image URL, use it as featured_image.
9. If they ask to add images to an existing post, call add_images_to_post.
10. If they ask to improve / rewrite / fix a post (or feedback says 👎), call update_blog_post with the existing id and improved content — do not create a duplicate unless they ask for a new post.
11. Reply with result (id, slug, status, url, featured_image) — never invent success.

Delete: list_blog_posts if needed, then delete_blog_post only on explicit request.
Public URL format: https://www.tech2globe.com/blogs/{slug}`);

  return parts.join("\n");
}

function extractToolPosts(result) {
  const posts = [];
  for (const item of result?.newItems || []) {
    if (item?.type !== "tool_call_output_item") continue;
    let output = item.output;
    if (output == null && item.rawItem?.output != null) {
      output = item.rawItem.output;
    }
    if (typeof output === "string") {
      try {
        output = JSON.parse(output);
      } catch {
        continue;
      }
    }
    // Some SDK versions wrap as { type: "text", text: "..." }
    if (output?.text && typeof output.text === "string") {
      try {
        output = JSON.parse(output.text);
      } catch {
        /* keep as-is */
      }
    }
    if (output && output.ok && output.id) {
      posts.push({
        id: output.id,
        slug: output.slug,
        title: output.title,
        status: output.status,
        url: output.url,
        featured_image: output.featured_image,
        updated: Boolean(output.updated),
      });
    }
  }
  return posts;
}

function buildRunInput(history, userMessage) {
  const lines = [];
  for (const msg of history) {
    if (msg.role === "system") continue;
    const label = msg.role === "user" ? "User" : "Assistant";
    lines.push(`${label}: ${msg.content}`);
  }
  lines.push(`User: ${userMessage}`);
  lines.push("Assistant:");
  return lines.join("\n\n");
}

/** @param {{ user: object, threadId: string, message: string }} opts */
export async function runBlogAgent({ user, threadId, message }) {
  await refreshConfiguredFlag();
  if (!isAgentConfigured()) {
    const err = new Error(
      "Blog agent is not configured. Set API key in Admin → Connect → AI Integrations (or OPENROUTER_API_KEY).",
    );
    err.status = 503;
    throw err;
  }

  await initOpenAI();

  const userId = user.sub || user.id || "unknown";
  const userEmail = user.email || user.apiKeyName || null;
  const permissions = user.permissions?.blog || {};
  const canPublish = Boolean(permissions.add);
  const canDelete = Boolean(permissions.delete);
  const isSuper =
    user.role === "super_admin" || user.role === "admin";

  const effectiveCanPublish = isSuper || canPublish;
  const effectiveCanDelete = isSuper || canDelete;

  const [guidelines, feedback, history] = await Promise.all([
    model.getGuidelines(),
    model.listRecentFeedback({ limit: 15 }),
    model.listMessages(threadId),
  ]);

  const systemContext = buildSystemContext({
    guidelines,
    feedback,
    canPublish: effectiveCanPublish,
    userEmail,
  });

  const tools = createBlogAgentTools({
    canPublish: effectiveCanPublish,
    canDelete: effectiveCanDelete,
  });

  const agent = new Agent({
    name: "Blog Agent",
    instructions: systemContext,
    model: getDefaultModel(),
    tools,
    modelSettings: { maxTokens: 4500 },
  });

  const runInput = buildRunInput(history, message);
  const started = Date.now();

  const result = await run(agent, runInput);
  const output = result.finalOutput || "Done.";
  const posts = extractToolPosts(result);

  return {
    output,
    durationMs: Date.now() - started,
    canPublish: effectiveCanPublish,
    posts,
  };
}

export async function sendMessage({ user, threadId, message }) {
  const userId = user.sub || user.id;
  const thread = await model.getThread(threadId, userId);
  if (!thread) {
    const err = new Error("Thread not found");
    err.status = 404;
    throw err;
  }

  const trimmed = String(message || "").trim();
  if (!trimmed) {
    const err = new Error("Message is required");
    err.status = 400;
    throw err;
  }

  await model.addMessage({ threadId, role: "user", content: trimmed });

  if (!thread.title) {
    const title = trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : "");
    await model.updateThreadTitle(threadId, title);
  }

  let assistantContent;
  let durationMs = 0;
  let posts = [];
  try {
    const runResult = await runBlogAgent({ user, threadId, message: trimmed });
    assistantContent = runResult.output;
    durationMs = runResult.durationMs;
    posts = runResult.posts || [];
  } catch (err) {
    assistantContent = `Sorry, I couldn't complete that: ${err.message}`;
    await model.addMessage({
      threadId,
      role: "assistant",
      content: assistantContent,
      toolOutput: { error: err.message },
    });
    throw err;
  }

  const assistantMsg = await model.addMessage({
    threadId,
    role: "assistant",
    content: assistantContent,
    toolOutput: { durationMs, posts },
  });

  return {
    threadId,
    userMessage: trimmed,
    assistant: assistantMsg,
    durationMs,
    posts,
  };
}
