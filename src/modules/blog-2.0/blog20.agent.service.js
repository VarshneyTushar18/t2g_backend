import { Agent, run } from "@openai/agents";
import {
  initOpenAI,
  getDefaultModel,
  isAgentConfigured,
  refreshConfiguredFlag,
} from "../agents/lib/openai.js";
import * as blogAgentModel from "../agents/blog/blogAgent.model.js";
import { createBlog20AgentTools } from "./blog20.tools.js";
import * as settingsModel from "./blog20.model.js";

const AGENT_TYPE = "blog_2_0";
const GUIDELINES_ID = 2;

const DEFAULT_BRIGHT_CRM_GUIDELINES = `Bright CRM Blog Agent (Blog-2.0):
- Client: Bright CRM — construction CRM & project management (NOT Tech2Globe)
- Audience: construction companies, contractors, project managers
- Topics: CRM, leads, quotations, project tracking, team collaboration, construction business ops
- Author default: Bright CRM Team
- Website: client's MailerLite site — drafts are for MailerLite blog editor, NOT tech2globe.com
- Always use tool create_bright_crm_blog_draft to save posts (never Tech2Globe create_blog_post)
- Tone: professional, practical, helpful — not salesy`;

function buildRunInput(history, userMessage) {
  const lines = [];
  for (const msg of history) {
    if (msg.role === "system") continue;
    lines.push(`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`);
  }
  lines.push(`User: ${userMessage}`);
  lines.push("Assistant:");
  return lines.join("\n\n");
}

function parseToolOutput(raw) {
  if (raw == null) return null;
  let output = raw;
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch {
      return null;
    }
  }
  if (output?.text && typeof output.text === "string") {
    try {
      output = JSON.parse(output.text);
    } catch {
      /* keep as-is */
    }
  }
  return output;
}

function extractDrafts(result) {
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
    if (output?.ok && output.id && output.project === "blog_2_0" && !seen.has(output.id)) {
      seen.add(output.id);
      posts.push(output);
    }
  }
  return posts;
}

async function ensureBrightCrmGuidelines() {
  const row = await blogAgentModel.getGuidelines(GUIDELINES_ID);
  if (!row?.content) {
    await blogAgentModel.updateGuidelines(
      DEFAULT_BRIGHT_CRM_GUIDELINES,
      "blog-2.0-setup",
      GUIDELINES_ID,
      { humanizePercent: 70 },
    );
  }
  return blogAgentModel.getGuidelines(GUIDELINES_ID);
}

function buildSystemContext({ guidelines, settings }) {
  return `${guidelines?.content || DEFAULT_BRIGHT_CRM_GUIDELINES}

## Blog-2.0 project (isolated from Tech2Globe Blog)
- Client site: ${settings.client_site_url || "Bright CRM MailerLite site"}
- Client blog: ${settings.client_blog_url || settings.client_site_url || ""}
- Save posts ONLY with create_bright_crm_blog_draft
- After save: if approval emails are configured, team gets email with Preview + Yes/No — Yes triggers MailerLite bot automatically
- If auto-push is enabled in settings, bot pushes immediately without email approval
- NEVER say the post is live on the client website until a human Publishes in MailerLite
- NEVER use a fake MailerLite preview URL — only mention Admin → Blog-2.0 → Drafts or the approval email preview link
- Ask-first workflow: topic, audience, author, SEO keyword, competitor/reference link, images
- Wait for confirm before writing unless user says "just write it"

## Newsletter (Phase 2)
MailerLite email campaign will be created separately after draft approval.`;
}

const REVISION_MODE_INSTRUCTIONS = `

## REVISION MODE (mandatory — approver sent feedback)
- An approver rejected the previous draft — write a NEW complete blog NOW
- Do NOT ask clarifying questions or wait for confirmation
- You MUST call create_bright_crm_blog_draft exactly once with full title, excerpt, and HTML body
- If feedback is vague (e.g. "something new"), use a fresh angle and structure on the same topic
- Never reply with only chat text — saving via the tool is required`;

export async function runBlog20Agent({
  user,
  threadId,
  message,
  revisionMode = false,
}) {
  await refreshConfiguredFlag();
  if (!isAgentConfigured()) {
    const err = new Error(
      "AI not configured. Set API keys in Admin → Connect → AI Integrations.",
    );
    err.status = 503;
    throw err;
  }
  await initOpenAI();
  await ensureBrightCrmGuidelines();

  const userId = user.sub || user.id || "unknown";
  const humanizePercent = 70;

  const [guidelines, settings, history] = await Promise.all([
    blogAgentModel.getGuidelines(GUIDELINES_ID),
    settingsModel.getSettings(),
    blogAgentModel.listMessages(threadId),
  ]);

  const tools = createBlog20AgentTools({
    userId,
    threadId,
    humanizePercent,
  });

  let instructions = buildSystemContext({ guidelines, settings });
  if (revisionMode) {
    instructions += REVISION_MODE_INSTRUCTIONS;
  }

  const agent = new Agent({
    name: "Bright CRM Blog Agent",
    instructions,
    model: getDefaultModel(),
    tools,
    modelSettings: {
      maxTokens: 4500,
      temperature: revisionMode ? 0.65 : 0.75,
    },
  });

  const started = Date.now();
  const result = await run(agent, buildRunInput(history, message));
  return {
    output: result.finalOutput || "Done.",
    durationMs: Date.now() - started,
    posts: extractDrafts(result),
  };
}

export async function sendMessage({ user, threadId, message }) {
  const userId = user.sub || user.id;
  const thread = await blogAgentModel.getThread(threadId, userId);
  if (!thread || thread.agent_type !== AGENT_TYPE) {
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

  await blogAgentModel.addMessage({ threadId, role: "user", content: trimmed });
  if (!thread.title) {
    await blogAgentModel.updateThreadTitle(
      threadId,
      trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : ""),
    );
  }

  try {
    const runResult = await runBlog20Agent({ user, threadId, message: trimmed });
    const assistantMsg = await blogAgentModel.addMessage({
      threadId,
      role: "assistant",
      content: runResult.output,
      toolOutput: { durationMs: runResult.durationMs, posts: runResult.posts },
    });
    return {
      threadId,
      userMessage: trimmed,
      assistant: assistantMsg,
      durationMs: runResult.durationMs,
      posts: runResult.posts,
    };
  } catch (err) {
    const assistantContent = `Sorry, I couldn't complete that: ${err.message}`;
    await blogAgentModel.addMessage({
      threadId,
      role: "assistant",
      content: assistantContent,
      toolOutput: { error: err.message },
    });
    throw err;
  }
}

export async function listThreads(userId) {
  return blogAgentModel.listThreads(userId, { agentType: AGENT_TYPE });
}

export async function createThread({ userId, userEmail, title }) {
  return blogAgentModel.createThread({
    userId,
    userEmail,
    title,
    agentType: AGENT_TYPE,
  });
}

const APPROVAL_SYSTEM_USER = {
  sub: "blog20-approval",
  id: "blog20-approval",
  email: "blog-2.0-approval@system.local",
};

/**
 * Approver sent back feedback — AI writes a new draft (approval email sent by tool if configured).
 */
export async function regenerateBlog20DraftFromFeedback({ draft, feedback }) {
  const ownerId = draft.created_by || APPROVAL_SYSTEM_USER.id;
  const user = {
    sub: ownerId,
    id: ownerId,
    email: APPROVAL_SYSTEM_USER.email,
  };

  let threadId = draft.thread_id || null;
  if (threadId) {
    const thread = await blogAgentModel.getThread(threadId, ownerId);
    if (!thread) threadId = null;
  }
  if (!threadId) {
    const thread = await blogAgentModel.createThread({
      userId: ownerId,
      userEmail: user.email,
      title: `Revision: ${draft.title}`.slice(0, 80),
      agentType: AGENT_TYPE,
    });
    threadId = thread.id;
  }

  const message = `REVISION REQUEST — write and save immediately.

Previous draft #${draft.id}: "${draft.title}"

Approver feedback:
${feedback}

Write a completely NEW blog post (new angle/structure if feedback is vague). Call create_bright_crm_blog_draft with the full article. Do not ask questions.`;

  await blogAgentModel.addMessage({ threadId, role: "user", content: message });
  let runResult = await runBlog20Agent({
    user,
    threadId,
    message,
    revisionMode: true,
  });

  if (!runResult.posts?.length) {
    console.warn(
      `[blog20-revision] First pass saved no draft for #${draft.id} — retrying`,
    );
    const retryMessage = `You did not call create_bright_crm_blog_draft yet. Call it NOW with a full revised blog for topic "${draft.title}". Feedback: ${feedback}. Save the complete HTML body — no questions.`;
    await blogAgentModel.addMessage({ threadId, role: "user", content: retryMessage });
    runResult = await runBlog20Agent({
      user,
      threadId,
      message: retryMessage,
      revisionMode: true,
    });
  }

  await blogAgentModel.addMessage({
    threadId,
    role: "assistant",
    content: runResult.output,
    toolOutput: {
      durationMs: runResult.durationMs,
      posts: runResult.posts,
      revision: true,
    },
  });

  if (!runResult.posts?.length) {
    const err = new Error(
      "AI completed but did not save a new draft. Try Blog Agent manually with clearer feedback.",
    );
    err.status = 502;
    throw err;
  }

  return {
    threadId,
    posts: runResult.posts,
    output: runResult.output,
  };
}
