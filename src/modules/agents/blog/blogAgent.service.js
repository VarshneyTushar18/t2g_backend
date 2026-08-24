import { Agent, run } from "@openai/agents";
import { initOpenAI, DEFAULT_MODEL, isAgentConfigured } from "../lib/openai.js";
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
Default behavior when user asks to write/publish a blog:
1. Infer topic from message and conversation history.
2. If they name an author (e.g. "author Tarun"), pass author_name exactly.
3. Generate title, Markdown content, excerpt, metaDescription, slug, tags.
4. Call create_blog_post — publish or draft per permissions and user intent.
5. Reply with result (id, slug, url) — report tool results only, never invent success.

Delete: list_blog_posts if needed, then delete_blog_post only on explicit request.
Public URL format: https://www.tech2globe.com/blogs/{slug}`);

  return parts.join("\n");
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
  if (!isAgentConfigured()) {
    const err = new Error(
      "Blog agent is not configured. Set OPENROUTER_API_KEY on the server.",
    );
    err.status = 503;
    throw err;
  }

  initOpenAI();

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
    model: DEFAULT_MODEL,
    tools,
    modelSettings: { maxTokens: 1800 },
  });

  const runInput = buildRunInput(history, message);
  const started = Date.now();

  const result = await run(agent, runInput);
  const output = result.finalOutput || "Done.";

  return {
    output,
    durationMs: Date.now() - started,
    canPublish: effectiveCanPublish,
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
  try {
    const runResult = await runBlogAgent({ user, threadId, message: trimmed });
    assistantContent = runResult.output;
    durationMs = runResult.durationMs;
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
    toolOutput: { durationMs },
  });

  return {
    threadId,
    userMessage: trimmed,
    assistant: assistantMsg,
    durationMs,
  };
}
