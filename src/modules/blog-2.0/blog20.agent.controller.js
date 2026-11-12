import * as blogAgentModel from "../agents/blog/blogAgent.model.js";
import * as agentService from "./blog20.agent.service.js";
import * as draftsModel from "./blog20.drafts.model.js";
import { refreshConfiguredFlag, getDefaultModel } from "../agents/lib/openai.js";

const AGENT_TYPE = "blog_2_0";

function userId(req) {
  return req.user?.sub || req.user?.id;
}

function handleError(res, err, fallback) {
  console.error(fallback, err);
  res.status(err.status || 500).json({ error: err.message || fallback });
}

async function assertBlog20Thread(threadId, uid) {
  const thread = await blogAgentModel.getThread(threadId, uid);
  if (!thread || thread.agent_type !== AGENT_TYPE) return null;
  return thread;
}

export async function getStatus(req, res) {
  const configured = await refreshConfiguredFlag();
  res.json({
    configured,
    agent: "blog_2_0",
    name: "Bright CRM Blog Agent",
    model: getDefaultModel(),
    isolated: true,
    project: "Bright CRM / MailerLite",
  });
}

export async function listThreads(req, res) {
  try {
    const threads = await agentService.listThreads(userId(req));
    res.json({ threads });
  } catch (err) {
    handleError(res, err, "Failed to list threads");
  }
}

export async function createThread(req, res) {
  try {
    const thread = await agentService.createThread({
      userId: userId(req),
      userEmail: req.user?.email || null,
      title: req.body?.title?.trim() || null,
    });
    res.status(201).json({ thread });
  } catch (err) {
    handleError(res, err, "Failed to create thread");
  }
}

export async function getThread(req, res) {
  try {
    const thread = await assertBlog20Thread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json({ thread });
  } catch (err) {
    handleError(res, err, "Failed to get thread");
  }
}

export async function deleteThread(req, res) {
  try {
    const thread = await assertBlog20Thread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    await blogAgentModel.deleteThread(req.params.threadId, userId(req));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, "Failed to delete thread");
  }
}

export async function getMessages(req, res) {
  try {
    const thread = await assertBlog20Thread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const messages = await blogAgentModel.listMessages(req.params.threadId);
    res.json({ messages });
  } catch (err) {
    handleError(res, err, "Failed to get messages");
  }
}

export async function sendMessage(req, res) {
  try {
    const thread = await assertBlog20Thread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const result = await agentService.sendMessage({
      user: req.user,
      threadId: req.params.threadId,
      message: req.body?.message,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Agent run failed");
  }
}

export async function addFeedback(req, res) {
  try {
    const thread = await assertBlog20Thread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const feedback = await blogAgentModel.addFeedback({
      threadId: req.params.threadId,
      messageId: req.body?.messageId || null,
      rating: req.body?.rating ?? null,
      comment: req.body?.comment?.trim() || null,
      createdBy: userId(req),
    });
    res.status(201).json({ feedback });
  } catch (err) {
    handleError(res, err, "Failed to save feedback");
  }
}

export async function listDrafts(req, res) {
  try {
    const drafts = await draftsModel.listDrafts();
    res.json({ drafts });
  } catch (err) {
    handleError(res, err, "Failed to list drafts");
  }
}

export async function getGuidelines(req, res) {
  try {
    const guidelines = await blogAgentModel.getGuidelines(2);
    res.json({ guidelines });
  } catch (err) {
    handleError(res, err, "Failed to get guidelines");
  }
}
