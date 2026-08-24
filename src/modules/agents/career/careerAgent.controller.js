import * as model from "../blog/blogAgent.model.js";
import * as service from "./careerAgent.service.js";
import { isAgentConfigured } from "../lib/openai.js";

function userId(req) {
  return req.user?.sub || req.user?.id;
}

function handleError(res, err, fallback) {
  console.error(fallback, err);
  res.status(err.status || 500).json({ error: err.message || fallback });
}

export async function getStatus(_req, res) {
  res.json({
    configured: isAgentConfigured(),
    agent: "career",
    name: "Career Agent",
  });
}

export async function listThreads(req, res) {
  try {
    const threads = await model.listThreads(userId(req), {
      agentType: "career",
    });
    res.json({ threads });
  } catch (err) {
    handleError(res, err, "Failed to list threads");
  }
}

export async function createThread(req, res) {
  try {
    const thread = await model.createThread({
      userId: userId(req),
      userEmail: req.user?.email || req.user?.apiKeyName || null,
      title: req.body?.title?.trim() || null,
      agentType: "career",
    });
    res.status(201).json({ thread });
  } catch (err) {
    handleError(res, err, "Failed to create thread");
  }
}

export async function getThread(req, res) {
  try {
    const thread = await model.getThread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json({ thread });
  } catch (err) {
    handleError(res, err, "Failed to get thread");
  }
}

export async function deleteThread(req, res) {
  try {
    const ok = await model.deleteThread(req.params.threadId, userId(req));
    if (!ok) return res.status(404).json({ error: "Thread not found" });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, "Failed to delete thread");
  }
}

export async function getMessages(req, res) {
  try {
    const thread = await model.getThread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const messages = await model.listMessages(req.params.threadId);
    res.json({ messages });
  } catch (err) {
    handleError(res, err, "Failed to get messages");
  }
}

export async function sendMessage(req, res) {
  try {
    const result = await service.sendMessage({
      user: req.user,
      threadId: req.params.threadId,
      message: req.body?.message,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Career agent run failed");
  }
}

export async function addFeedback(req, res) {
  try {
    const thread = await model.getThread(req.params.threadId, userId(req));
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const rating = req.body?.rating;
    const comment = req.body?.comment?.trim() || null;
    const messageId = req.body?.messageId || null;
    if (rating !== 1 && rating !== -1 && !comment) {
      return res
        .status(400)
        .json({ error: "Provide rating (1 or -1) or comment" });
    }
    const feedback = await model.addFeedback({
      threadId: req.params.threadId,
      messageId,
      rating: rating ?? null,
      comment,
      createdBy: userId(req),
    });
    res.status(201).json({ feedback });
  } catch (err) {
    handleError(res, err, "Failed to save feedback");
  }
}

export async function getGuidelines(_req, res) {
  try {
    const guidelines = await model.getGuidelines(3);
    res.json({ guidelines });
  } catch (err) {
    handleError(res, err, "Failed to get guidelines");
  }
}

export async function updateGuidelines(req, res) {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ error: "content is required" });
    const guidelines = await model.updateGuidelines(content, userId(req), 3);
    res.json({ guidelines });
  } catch (err) {
    handleError(res, err, "Failed to update guidelines");
  }
}
