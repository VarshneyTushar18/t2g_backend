import { randomUUID } from "crypto";
import blogDb from "../../../config/blogDb.js";

export async function listThreads(userId, { limit = 30, agentType = "writer" } = {}) {
  const [rows] = await blogDb.query(
    `SELECT id, title, agent_type, created_at, updated_at
     FROM blog_agent_threads
     WHERE user_id = ? AND agent_type = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
    [String(userId), agentType, Number(limit)],
  );
  return rows;
}

export async function createThread({
  userId,
  userEmail,
  title = null,
  agentType = "writer",
}) {
  const id = randomUUID();
  await blogDb.query(
    `INSERT INTO blog_agent_threads (id, user_id, user_email, title, agent_type)
     VALUES (?, ?, ?, ?, ?)`,
    [id, String(userId), userEmail || null, title, agentType],
  );
  return getThread(id, userId);
}

export async function getThread(threadId, userId) {
  const [rows] = await blogDb.query(
    `SELECT id, user_id, user_email, title, created_at, updated_at
     FROM blog_agent_threads
     WHERE id = ? AND user_id = ?`,
    [threadId, String(userId)],
  );
  return rows[0] || null;
}

export async function touchThread(threadId) {
  await blogDb.query(
    "UPDATE blog_agent_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [threadId],
  );
}

export async function updateThreadTitle(threadId, title) {
  await blogDb.query(
    "UPDATE blog_agent_threads SET title = ? WHERE id = ?",
    [title?.slice(0, 255) || null, threadId],
  );
}

export async function listMessages(threadId) {
  const [rows] = await blogDb.query(
    `SELECT id, thread_id, role, content, tool_output, created_at
     FROM blog_agent_messages
     WHERE thread_id = ?
     ORDER BY created_at ASC`,
    [threadId],
  );
  return rows.map((row) => ({
    ...row,
    tool_output: row.tool_output
      ? typeof row.tool_output === "string"
        ? JSON.parse(row.tool_output)
        : row.tool_output
      : null,
  }));
}

export async function addMessage({
  threadId,
  role,
  content,
  toolOutput = null,
}) {
  const id = randomUUID();
  await blogDb.query(
    `INSERT INTO blog_agent_messages (id, thread_id, role, content, tool_output)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      threadId,
      role,
      content,
      toolOutput ? JSON.stringify(toolOutput) : null,
    ],
  );
  await touchThread(threadId);
  return { id, thread_id: threadId, role, content, tool_output: toolOutput };
}

export async function addFeedback({
  threadId,
  messageId,
  rating,
  comment,
  createdBy,
}) {
  const [result] = await blogDb.query(
    `INSERT INTO blog_agent_feedback (thread_id, message_id, rating, comment, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [
      threadId,
      messageId || null,
      rating ?? null,
      comment || null,
      createdBy ? String(createdBy) : null,
    ],
  );
  return { id: result.insertId, threadId, messageId, rating, comment };
}

export async function listRecentFeedback({ limit = 15 } = {}) {
  const [rows] = await blogDb.query(
    `SELECT f.rating, f.comment, f.created_at, m.content AS message_excerpt
     FROM blog_agent_feedback f
     LEFT JOIN blog_agent_messages m ON m.id = f.message_id
     WHERE f.rating IS NOT NULL OR (f.comment IS NOT NULL AND f.comment != '')
     ORDER BY f.created_at DESC
     LIMIT ?`,
    [Number(limit)],
  );
  return rows;
}

function clampHumanizePercent(value, fallback = 70) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export async function getGuidelines(id = 1) {
  const [rows] = await blogDb.query(
    "SELECT id, content, humanize_percent, updated_by, updated_at FROM blog_agent_guidelines WHERE id = ?",
    [id],
  );
  const row = rows[0];
  if (!row) {
    return { id, content: "", humanize_percent: 70 };
  }
  return {
    ...row,
    humanize_percent: clampHumanizePercent(row.humanize_percent, 70),
  };
}

export async function updateGuidelines(
  content,
  updatedBy,
  id = 1,
  { humanizePercent } = {},
) {
  const existing = await getGuidelines(id);
  const nextHumanize =
    humanizePercent === undefined
      ? existing.humanize_percent
      : clampHumanizePercent(humanizePercent, existing.humanize_percent);
  const nextContent =
    content === undefined || content === null
      ? existing.content
      : String(content);

  await blogDb.query(
    `INSERT INTO blog_agent_guidelines (id, content, humanize_percent, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       content = VALUES(content),
       humanize_percent = VALUES(humanize_percent),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      nextContent,
      nextHumanize,
      updatedBy ? String(updatedBy) : null,
    ],
  );
  return getGuidelines(id);
}

export async function saveGeneratedImage({
  userId,
  threadId,
  prompt,
  cloudinaryUrl,
  publicId,
  width,
  height,
  postId = null,
}) {
  const id = randomUUID();
  await blogDb.query(
    `INSERT INTO blog_agent_images
      (id, user_id, thread_id, prompt, cloudinary_url, public_id, width, height, post_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      String(userId),
      threadId || null,
      prompt || null,
      cloudinaryUrl,
      publicId || null,
      width || null,
      height || null,
      postId || null,
    ],
  );
  return {
    id,
    url: cloudinaryUrl,
    public_id: publicId,
    width,
    height,
    prompt,
  };
}

export async function listGeneratedImages(userId, { limit = 24 } = {}) {
  const [rows] = await blogDb.query(
    `SELECT id, prompt, cloudinary_url AS url, public_id, width, height, post_id, created_at
     FROM blog_agent_images
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [String(userId), Number(limit)],
  );
  return rows;
}

export async function deleteThread(threadId, userId) {
  const thread = await getThread(threadId, userId);
  if (!thread) return false;
  await blogDb.query("DELETE FROM blog_agent_threads WHERE id = ?", [threadId]);
  return true;
}
