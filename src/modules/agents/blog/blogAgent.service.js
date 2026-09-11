import { Agent, run } from "@openai/agents";
import {
  initOpenAI,
  getDefaultModel,
  isAgentConfigured,
  refreshConfiguredFlag,
} from "../lib/openai.js";
import { createBlogAgentTools } from "./blogAgent.tools.js";
import * as model from "./blogAgent.model.js";

function clampHumanizePercent(value, fallback = 70) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function temperatureForHumanize(humanizePercent) {
  // More humanize → slightly higher temperature for less template-like prose
  const h = clampHumanizePercent(humanizePercent, 70) / 100;
  return Math.round((0.45 + h * 0.5) * 100) / 100; // 0.45 .. 0.95
}

function buildWritingStyleBlock(humanizePercent) {
  const human = clampHumanizePercent(humanizePercent, 70);
  const ai = 100 - human;

  const intensity =
    human >= 80
      ? "Very aggressive humanization — prioritize natural voice over polished AI symmetry."
      : human >= 55
        ? "Strong humanization — sound like a senior editor, not ChatGPT."
        : human >= 30
          ? "Balanced mix — clear structure with some natural voice."
          : "Light humanization — keep clear, structured AI-assisted writing.";

  return `
## Writing style — ${human}% human / ${ai}% AI structure (critical)
Target mix set by admin: **${human}% humanized voice** and **${ai}% AI-assisted structure** (outline, SEO, headings).
${intensity}
Target voice: HubSpot / Medium / Ahrefs vibe when humanize is high; cleaner structured SEO prose when AI % is higher.

Humanization rules (scale intensity with the ${human}% human target):
- Use contractions (you'll, it's, don't, we're) and natural spoken rhythm${human >= 50 ? " heavily" : ""}.
- Mix short punchy sentences with longer ones. Avoid uniform paragraph length.
- Start some paragraphs mid-thought or with a concrete example, not a thesis statement.
- Prefer specific numbers, anecdotes, and "I / we / you" framing over abstract claims.
- Occasional mild opinion or soft humor is fine; stay professional for Tech2Globe.
- Vary transitions — never stack "Furthermore", "Moreover", "In conclusion", "Additionally".
- Ban AI tells: "In today's digital landscape", "delve into", "it's important to note", "unlock the power", "game-changer", "comprehensive guide", "ever-evolving", "leverage" (unless industry jargon fits), "tapestry", "realm", "navigate the complexities".
- Do NOT use em dashes excessively or perfectly parallel bullet lists that all start the same way.
- Do NOT end every section with a summary sentence that restates the heading.
${human >= 60 ? "- Keep some imperfect flow — human drafts are slightly uneven; perfect symmetry reads as AI." : "- Keep writing clean and scannable; light natural tone is enough."}

Structure (the ${ai}% AI-assisted part):
  1) Strong H1-style title (passed as title, not inside body)
  2) Short hook paragraph (2–3 sentences) — concrete, not hype
  3) 4–7 H2 sections with optional H3s
  4) Short paragraphs (mostly 2–4 sentences)
  5) Bullet or numbered lists only when they truly help
  6) Bold sparingly for key phrases only
  7) Soft CTA ending (no hard sell, no "In conclusion")
- Length: ~700–1200 words unless user asks otherwise.
- SEO: focus keyword in title + first paragraph + one H2; meta description 120–160 chars — weave naturally, never keyword-stuff.`;
}

function buildSystemContext({
  guidelines,
  feedback,
  canPublish,
  userEmail,
  humanizePercent = 70,
}) {
  const parts = [];
  const human = clampHumanizePercent(
    humanizePercent ?? guidelines?.humanize_percent,
    70,
  );
  const ai = 100 - human;

  parts.push(
    `You are Tech2Globe Blog Agent — an expert content writer integrated into the admin panel.`,
  );
  parts.push(`Logged-in user: ${userEmail || "admin"}.`);
  parts.push(
    `Content mix setting: ${human}% humanized / ${ai}% AI structure. Always honor this ratio.`,
  );

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

  parts.push(buildWritingStyleBlock(human));

  parts.push(`
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
4. Generate title, clean Markdown/HTML content, excerpt, slug, tags — apply the ${human}% human / ${ai}% AI style above.
5. If you used generate_blog_image, pass its URL as featured_image and also optionally generate 1–2 inline images and pass them as inline_image_urls.
6. Call create_blog_post with featured_image and inline_image_urls (or add_inline_images true for non-AI images).
7. Always include a cover image unless the user says no images.
8. If they paste an image URL, use it as featured_image.
9. If they ask to add images to an existing post, call add_images_to_post.
10. If they ask to improve / rewrite / fix a post (or feedback says 👎), call update_blog_post with the existing id and improved content at the same ${human}% human / ${ai}% AI mix — do not create a duplicate unless they ask for a new post.
11. Reply with result in this exact readable form (never invent success):
    Created draft
    id: {numeric_id}
    slug: {slug}
    status: draft|publish
    url: https://www.tech2globe.com/blogs/{slug}
    The numeric id line is REQUIRED so the admin Preview button works.

Delete: list_blog_posts if needed, then delete_blog_post only on explicit request.
Public URL format: https://www.tech2globe.com/blogs/{slug}`);

  return parts.join("\n");
}

function parseToolOutput(raw) {
  let output = raw;
  if (output == null) return null;
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch {
      return null;
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
  return output;
}

function extractToolPosts(result) {
  const posts = [];
  const seen = new Set();
  const items = [
    ...(Array.isArray(result?.newItems) ? result.newItems : []),
    ...(Array.isArray(result?.items) ? result.items : []),
  ];

  for (const item of items) {
    const type = item?.type || item?.rawItem?.type;
    if (
      type &&
      type !== "tool_call_output_item" &&
      type !== "function_call_result" &&
      type !== "tool_result"
    ) {
      continue;
    }
    const output = parseToolOutput(
      item?.output ?? item?.rawItem?.output ?? item?.result,
    );
    if (output && output.ok && output.id && !seen.has(output.id)) {
      seen.add(output.id);
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
    humanizePercent: guidelines?.humanize_percent ?? 70,
  });

  const tools = createBlogAgentTools({
    canPublish: effectiveCanPublish,
    canDelete: effectiveCanDelete,
  });

  const humanizePercent = clampHumanizePercent(
    guidelines?.humanize_percent,
    70,
  );

  const agent = new Agent({
    name: "Blog Agent",
    instructions: systemContext,
    model: getDefaultModel(),
    tools,
    modelSettings: {
      maxTokens: 4500,
      temperature: temperatureForHumanize(humanizePercent),
    },
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
