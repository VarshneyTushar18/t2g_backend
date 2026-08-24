import { Agent, run } from "@openai/agents";
import { initOpenAI, DEFAULT_MODEL, isAgentConfigured } from "../lib/openai.js";
import { createBlogImageAgentTools } from "./blogImage.tools.js";
import * as model from "../blog/blogAgent.model.js";

function buildSystemContext({ guidelines, canEdit, userEmail }) {
  const parts = [];
  parts.push(
    `You are Tech2Globe Blog Image Agent. You generate blog cover/in-article images and upload them to Cloudinary.`,
  );
  parts.push(`Logged-in user: ${userEmail || "admin"}.`);

  if (guidelines?.content) {
    parts.push(`\n## Image guidelines\n${guidelines.content}`);
  }

  if (!canEdit) {
    parts.push(
      `\nThis user cannot attach images to posts. Still generate and return Cloudinary URLs.`,
    );
  }

  parts.push(`
Default behavior:
1. When the user describes an image (or a blog topic), call generate_blog_image with a detailed visual prompt.
2. Always upload via that tool — never invent a URL.
3. Reply with the Cloudinary URL and a short description. Mention they can paste it as featured image or ask you to attach it to a post.
4. If they ask to set it on a post, list_blog_posts if needed, then attach_image_to_post.
5. Prefer 16:9 for covers. No text/logos in the image unless they ask.
6. Never claim success unless the tool returned ok: true.`);

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

export async function sendMessage({ user, threadId, message }) {
  if (!isAgentConfigured()) {
    const err = new Error(
      "Image agent is not configured. Set OPENROUTER_API_KEY on the server.",
    );
    err.status = 503;
    throw err;
  }

  initOpenAI();

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
    await model.updateThreadTitle(
      threadId,
      trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : ""),
    );
  }

  const canEdit =
    user.role === "super_admin" ||
    user.role === "admin" ||
    Boolean(user.permissions?.blog?.edit || user.permissions?.blog?.add);

  const [guidelines, history] = await Promise.all([
    model.getGuidelines(2),
    model.listMessages(threadId),
  ]);

  const tools = createBlogImageAgentTools({ userId, threadId, canEdit });
  const agent = new Agent({
    name: "Blog Image Agent",
    instructions: buildSystemContext({
      guidelines,
      canEdit,
      userEmail: user.email,
    }),
    model: DEFAULT_MODEL,
    tools,
    modelSettings: { maxTokens: 800 },
  });

  const started = Date.now();
  let output;
  let toolOutput = { durationMs: 0, images: [] };
  try {
    const result = await run(agent, buildRunInput(history, trimmed));
    output = result.finalOutput || "Done.";
    const images = [];
    const newHistory = await model.listMessages(threadId);
    void newHistory;
    if (typeof output === "string") {
      const urls = output.match(/https?:\/\/res\.cloudinary\.com\/[^\s)]+/g) || [];
      for (const url of urls) images.push({ url });
    }
    toolOutput = { durationMs: Date.now() - started, images };
  } catch (err) {
    output = `Sorry, I couldn't complete that: ${err.message}`;
    await model.addMessage({
      threadId,
      role: "assistant",
      content: output,
      toolOutput: { error: err.message },
    });
    throw err;
  }

  const assistant = await model.addMessage({
    threadId,
    role: "assistant",
    content: output,
    toolOutput,
  });

  return {
    threadId,
    userMessage: trimmed,
    assistant,
    durationMs: Date.now() - started,
  };
}
