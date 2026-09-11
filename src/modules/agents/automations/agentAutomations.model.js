import blogDb from "../../../config/blogDb.js";

const DEFAULT_SETTINGS = {
  enabled: false,
  timezone: "Asia/Kolkata",
  window_start: null,
  window_end: null,
  run_time: "10:00",
  run_days: [1, 2, 3, 4, 5],
  posts_per_run: 1,
  mode: "pending_email",
  approval_emails: [],
  last_run_at: null,
};

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    enabled: Boolean(row.enabled),
    timezone: row.timezone || DEFAULT_SETTINGS.timezone,
    window_start: row.window_start || null,
    window_end: row.window_end || null,
    run_time: row.run_time || DEFAULT_SETTINGS.run_time,
    run_days: parseJsonArray(row.run_days, DEFAULT_SETTINGS.run_days),
    posts_per_run: Number(row.posts_per_run || 1),
    mode: row.mode || DEFAULT_SETTINGS.mode,
    approval_emails: parseJsonArray(row.approval_emails, []),
    last_run_at: row.last_run_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapTopic(row) {
  return {
    id: row.id,
    topic: row.topic,
    notes: row.notes || "",
    author_name: row.author_name || "",
    category_ids: parseJsonArray(row.category_ids, []),
    tags: parseJsonArray(row.tags, []),
    priority: Number(row.priority || 0),
    scheduled_for: row.scheduled_for || null,
    status: row.status,
    generated_post_id: row.generated_post_id || null,
    generated_slug: row.generated_slug || null,
    generated_title: row.generated_title || null,
    error_message: row.error_message || null,
    is_active: Boolean(row.is_active),
    last_processed_at: row.last_processed_at || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getSettings() {
  const [rows] = await blogDb.query(
    "SELECT * FROM agent_automations_settings WHERE id = 1 LIMIT 1",
  );
  return mapSettings(rows[0]);
}

export async function upsertSettings(payload) {
  const current = await getSettings();
  const next = {
    ...current,
    ...payload,
  };

  await blogDb.query(
    `INSERT INTO agent_automations_settings
      (id, enabled, timezone, window_start, window_end, run_time, run_days, posts_per_run, mode, approval_emails, last_run_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled),
      timezone = VALUES(timezone),
      window_start = VALUES(window_start),
      window_end = VALUES(window_end),
      run_time = VALUES(run_time),
      run_days = VALUES(run_days),
      posts_per_run = VALUES(posts_per_run),
      mode = VALUES(mode),
      approval_emails = VALUES(approval_emails),
      last_run_at = VALUES(last_run_at),
      updated_at = CURRENT_TIMESTAMP`,
    [
      next.enabled ? 1 : 0,
      next.timezone || "Asia/Kolkata",
      next.window_start || null,
      next.window_end || null,
      next.run_time || "10:00",
      JSON.stringify(next.run_days || []),
      Math.min(Math.max(Number(next.posts_per_run || 1), 1), 10),
      next.mode || "pending_email",
      JSON.stringify(next.approval_emails || []),
      next.last_run_at || null,
    ],
  );

  return getSettings();
}

export async function markSettingsLastRun(at = new Date()) {
  await blogDb.query(
    "UPDATE agent_automations_settings SET last_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    [at],
  );
}

export async function listTopics({ status = "", includeInactive = false } = {}) {
  const params = [];
  let where = "WHERE 1=1";
  if (!includeInactive) where += " AND is_active = 1";
  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  const [rows] = await blogDb.query(
    `SELECT * FROM agent_automations_topics
     ${where}
     ORDER BY priority DESC, created_at ASC`,
    params,
  );
  return rows.map(mapTopic);
}

export async function createTopic(payload) {
  const [result] = await blogDb.query(
    `INSERT INTO agent_automations_topics
      (topic, notes, author_name, category_ids, tags, priority, scheduled_for, status, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 1, ?)`,
    [
      payload.topic,
      payload.notes || null,
      payload.author_name || null,
      JSON.stringify(payload.category_ids || []),
      JSON.stringify(payload.tags || []),
      Number(payload.priority || 0),
      payload.scheduled_for || null,
      payload.created_by || null,
    ],
  );
  return getTopicById(result.insertId);
}

export async function updateTopic(id, payload) {
  const existing = await getTopicById(id);
  if (!existing) return null;
  const next = { ...existing, ...payload };
  await blogDb.query(
    `UPDATE agent_automations_topics
     SET topic = ?, notes = ?, author_name = ?, category_ids = ?, tags = ?, priority = ?, scheduled_for = ?, is_active = ?, status = ?
     WHERE id = ?`,
    [
      next.topic,
      next.notes || null,
      next.author_name || null,
      JSON.stringify(next.category_ids || []),
      JSON.stringify(next.tags || []),
      Number(next.priority || 0),
      next.scheduled_for || null,
      next.is_active ? 1 : 0,
      next.status || "queued",
      Number(id),
    ],
  );
  return getTopicById(id);
}

export async function deleteTopic(id) {
  const [result] = await blogDb.query(
    "DELETE FROM agent_automations_topics WHERE id = ?",
    [Number(id)],
  );
  return Boolean(result.affectedRows);
}

export async function getTopicById(id) {
  const [rows] = await blogDb.query(
    "SELECT * FROM agent_automations_topics WHERE id = ? LIMIT 1",
    [Number(id)],
  );
  return rows[0] ? mapTopic(rows[0]) : null;
}

export async function getDueTopics(limit) {
  const [rows] = await blogDb.query(
    `SELECT * FROM agent_automations_topics
     WHERE is_active = 1
       AND status = 'queued'
       AND (scheduled_for IS NULL OR scheduled_for <= NOW())
     ORDER BY priority DESC, created_at ASC
     LIMIT ?`,
    [Number(limit)],
  );
  return rows.map(mapTopic);
}

export async function markTopicProcessing(id) {
  await blogDb.query(
    `UPDATE agent_automations_topics
     SET status = 'processing', error_message = NULL, last_processed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(id)],
  );
}

export async function markTopicDone(id, result) {
  await blogDb.query(
    `UPDATE agent_automations_topics
     SET status = 'draft_ready',
         generated_post_id = ?,
         generated_slug = ?,
         generated_title = ?,
         error_message = NULL,
         last_processed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      result.generated_post_id || null,
      result.generated_slug || null,
      result.generated_title || null,
      Number(id),
    ],
  );
}

export async function markTopicFailed(id, errorMessage) {
  await blogDb.query(
    `UPDATE agent_automations_topics
     SET status = 'failed',
         error_message = ?,
         last_processed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [String(errorMessage || "Unknown failure").slice(0, 2000), Number(id)],
  );
}
