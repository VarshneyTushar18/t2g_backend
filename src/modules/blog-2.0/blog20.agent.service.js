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
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function extractDrafts(result) {
  const posts = [];
  const seen = new Set();
  for (const item of result?.newItems || []) {
    const output = parseToolOutput(item?.output ?? item?.rawItem?.output);
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
- After save, tell user: draft is in Blog-2.0 database ONLY — NOT on MailerLite website yet
- NEVER say the post is live or viewable on MailerLite unless a human pasted it there
- NEVER use "view draft here" with a MailerLite preview URL — that URL does not exist until manual publish
- Give clear steps: MailerLite dashboard → Sites → Blog → Create a post → paste → Save as draft
- Ask-first workflow: topic, audience, author, SEO keyword, competitor/reference link, images
- Wait for confirm before writing unless user says "just write it"

## Newsletter (Phase 2)
MailerLite email campaign will be created separately after draft approval.`;
}

export async function runBlog20Agent({ user, threadId, message }) {
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
  const permissions = user.permissions?.blog_2_0 || user.permissions?.blog || {};
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

  const agent = new Agent({
    name: "Bright CRM Blog Agent",
    instructions: buildSystemContext({ guidelines, settings }),
    model: getDefaultModel(),
    tools,
    modelSettings: { maxTokens: 4500, temperature: 0.75 },
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
