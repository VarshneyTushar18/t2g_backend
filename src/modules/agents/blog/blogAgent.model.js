import { randomUUID } from "crypto";
import blogDb from "../../../config/blogDb.js";

export async function listThreads(userId, { limit = 30 } = {}) {
  const [rows] = await blogDb.query(
    `SELECT id, title, created_at, updated_at
     FROM blog_agent_threads
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
    [String(userId), Number(limit)],
  );
  return rows;
}

export async function createThread({ userId, userEmail, title = null }) {
  const id = randomUUID();
  await blogDb.query(
    `INSERT INTO blog_agent_threads (id, user_id, user_email, title)
     VALUES (?, ?, ?, ?)`,
    [id, String(userId), userEmail || null, title],
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

export async function getGuidelines() {
  const [rows] = await blogDb.query(
    "SELECT id, content, updated_by, updated_at FROM blog_agent_guidelines WHERE id = 1",
  );
  return rows[0] || { id: 1, content: "" };
}

export async function updateGuidelines(content, updatedBy) {
  await blogDb.query(
    `UPDATE blog_agent_guidelines
     SET content = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [content, updatedBy ? String(updatedBy) : null],
  );
  return getGuidelines();
}

export async function deleteThread(threadId, userId) {
  const thread = await getThread(threadId, userId);
  if (!thread) return false;
  await blogDb.query("DELETE FROM blog_agent_threads WHERE id = ?", [threadId]);
  return true;
}
