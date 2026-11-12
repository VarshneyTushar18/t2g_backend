import { Agent, run } from "@openai/agents";
import {
  initOpenAI,
  getDefaultModel,
  isAgentConfigured,
  refreshConfiguredFlag,
} from "../lib/openai.js";
import { createBlogImageAgentTools } from "./blogImage.tools.js";
import * as model from "../blog/blogAgent.model.js";
import { getImageGenerationStatus } from "./blogImage.generate.js";

function buildSystemContext({ guidelines, canEdit, userEmail }) {
  const parts = [];
  parts.push(
    `You are Tech2Globe Blog Image Agent. You ONLY generate images and return Cloudinary URLs.`,
  );
  parts.push(`Logged-in user: ${userEmail || "admin"}.`);
  parts.push(
    `You do NOT write blogs, ask blog SEO questions, or auto-attach images to posts.`,
  );

  if (guidelines?.content) {
    parts.push(`\n## Image guidelines\n${guidelines.content}`);
  }

  if (!canEdit) {
    parts.push(
      `\nThis user cannot attach images to posts. Only generate and return Cloudinary URLs.`,
    );
  }

  parts.push(`
Default behavior:
1. When the user describes an image (or says "generate an image of …"), call generate_blog_image with a detailed visual prompt.
2. Always use that tool — never invent a URL.
3. Reply with the Cloudinary URL, short description, and that they can copy it into a blog featured image manually.
4. Do NOT create blog posts. Do NOT ask about blog topic / audience / draft / publish / SEO / author.
5. Do NOT call attach_image_to_post unless the user explicitly says to attach/set this image on a specific post (by id or slug).
6. Prefer 16:9 for covers. No text/logos in the image unless they ask.
7. Never claim success unless the tool returned ok: true.
8. If generation fails because the image model/API is missing, tell them clearly to open Connect → AI Integrations and set Image model + Image API key.`);

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
  await refreshConfiguredFlag();

  const imageStatus = await getImageGenerationStatus();
  if (!imageStatus.ready) {
    const detail = (imageStatus.alerts || []).join(" ");
    const err = new Error(
      detail ||
        "Image generation is not ready. Set Image model + API key in Connect → AI Integrations.",
    );
    err.status = 503;
    throw err;
  }

  if (!isAgentConfigured()) {
    const err = new Error(
      "Chat AI is not configured for the Image Agent assistant. Set the chat API key in Admin → Connect → AI Integrations.",
    );
    err.status = 503;
    throw err;
  }

  await initOpenAI();

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
    model: getDefaultModel(),
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
