import { Agent, run } from "@openai/agents";
import { initOpenAI, DEFAULT_MODEL, isAgentConfigured } from "../lib/openai.js";
import { createCareerAgentTools } from "./careerAgent.tools.js";
import * as model from "../blog/blogAgent.model.js";

function buildSystemContext({ guidelines, feedback, perms, userEmail }) {
  const parts = [];
  parts.push(
    "You are Tech2Globe Career Agent. You help HR/admin create and manage job posts.",
  );
  parts.push(`Logged-in user: ${userEmail || "admin"}.`);

  if (guidelines?.content) {
    parts.push(`\n## Career guidelines\n${guidelines.content}`);
  }

  if (feedback?.length) {
    parts.push("\n## Recent feedback");
    for (const f of feedback.slice(0, 10)) {
      const rating =
        f.rating === 1 ? "good" : f.rating === -1 ? "bad" : "neutral";
      parts.push(`- ${rating}${f.comment ? `: ${f.comment}` : ""}`);
    }
  }

  parts.push(`
Permissions:
- canAdd: ${perms.canAdd}
- canEdit: ${perms.canEdit}
- canDelete: ${perms.canDelete}

Behavior:
1. If user wants to create a job, draft clear complete fields and call create_job_post.
2. If update/close/delete and id is unclear, call list_jobs first.
3. Prefer close_job_post over delete_job_post.
4. Never claim success without tool result.
5. Keep JD professional, clear, no hype.
6. After mutations return id + title + status.`);

  return parts.join("\n");
}

function buildRunInput(history, userMessage) {
  const lines = [];
  for (const msg of history) {
    if (msg.role === "system") continue;
    lines.push(
      `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
    );
  }
  lines.push(`User: ${userMessage}`);
  lines.push("Assistant:");
  return lines.join("\n\n");
}

export async function runCareerAgent({ user, threadId, message }) {
  if (!isAgentConfigured()) {
    const err = new Error(
      "Career agent is not configured. Set OPENROUTER_API_KEY on server.",
    );
    err.status = 503;
    throw err;
  }

  initOpenAI();

  const permissions = user.permissions?.career || {};
  const isSuper = user.role === "super_admin" || user.role === "admin";
  const perms = {
    canAdd: isSuper || Boolean(permissions.add),
    canEdit: isSuper || Boolean(permissions.edit),
    canDelete: isSuper || Boolean(permissions.delete),
  };

  const [guidelines, feedback, history] = await Promise.all([
    model.getGuidelines(3),
    model.listRecentFeedback({ limit: 12 }),
    model.listMessages(threadId),
  ]);

  const tools = createCareerAgentTools(perms);
  const agent = new Agent({
    name: "Career Agent",
    instructions: buildSystemContext({
      guidelines,
      feedback,
      perms,
      userEmail: user.email,
    }),
    model: DEFAULT_MODEL,
    tools,
    modelSettings: { maxTokens: 1400 },
  });

  const result = await run(agent, buildRunInput(history, message));
  return { output: result.finalOutput || "Done." };
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
    await model.updateThreadTitle(
      threadId,
      trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : ""),
    );
  }

  const started = Date.now();
  let output;
  try {
    const result = await runCareerAgent({ user, threadId, message: trimmed });
    output = result.output;
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
    toolOutput: { durationMs: Date.now() - started },
  });

  return {
    threadId,
    userMessage: trimmed,
    assistant,
    durationMs: Date.now() - started,
  };
}
