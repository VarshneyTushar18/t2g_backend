import blogDb from "../../config/blogDb.js";

function mapTopic(row) {
  if (!row) return null;
  return {
    id: row.id,
    topic: row.topic,
    notes: row.notes || "",
    priority: Number(row.priority || 0),
    scheduled_for: row.scheduled_for || null,
    status: row.status,
    generated_draft_id: row.generated_draft_id || null,
    generated_title: row.generated_title || null,
    approval_id: row.approval_id || null,
    error_message: row.error_message || null,
    is_active: Boolean(row.is_active),
    last_processed_at: row.last_processed_at || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function ensureBlog20AutomationTopicsTable() {
  await blogDb.query(`
    CREATE TABLE IF NOT EXISTS blog_2_0_automation_topics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      topic VARCHAR(500) NOT NULL,
      notes TEXT NULL,
      priority INT NOT NULL DEFAULT 0,
      scheduled_for DATETIME NULL,
      status ENUM('queued','processing','draft_ready','failed') NOT NULL DEFAULT 'queued',
      generated_draft_id INT NULL,
      generated_title VARCHAR(500) NULL,
      approval_id INT NULL,
      error_message TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_processed_at TIMESTAMP NULL,
      created_by VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_status (status, is_active, scheduled_for),
      KEY idx_priority (priority DESC, created_at)
    )
  `);
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
    `SELECT * FROM blog_2_0_automation_topics ${where}
     ORDER BY priority DESC, created_at ASC`,
    params,
  );
  return rows.map(mapTopic);
}

export async function createTopic(payload) {
  const [result] = await blogDb.query(
    `INSERT INTO blog_2_0_automation_topics
      (topic, notes, priority, scheduled_for, status, is_active, created_by)
     VALUES (?, ?, ?, ?, 'queued', 1, ?)`,
    [
      payload.topic,
      payload.notes || null,
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
    `UPDATE blog_2_0_automation_topics
     SET topic = ?, notes = ?, priority = ?, scheduled_for = ?, is_active = ?, status = ?
     WHERE id = ?`,
    [
      next.topic,
      next.notes || null,
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
    "DELETE FROM blog_2_0_automation_topics WHERE id = ?",
    [Number(id)],
  );
  return Boolean(result.affectedRows);
}

export async function getTopicById(id) {
  const [rows] = await blogDb.query(
    "SELECT * FROM blog_2_0_automation_topics WHERE id = ? LIMIT 1",
    [Number(id)],
  );
  return rows[0] ? mapTopic(rows[0]) : null;
}

export async function getDueTopics(limit) {
  const [rows] = await blogDb.query(
    `SELECT * FROM blog_2_0_automation_topics
     WHERE is_active = 1 AND status = 'queued'
       AND (scheduled_for IS NULL OR scheduled_for <= NOW())
     ORDER BY priority DESC, created_at ASC
     LIMIT ?`,
    [Number(limit)],
  );
  return rows.map(mapTopic);
}

export async function countQueuedTopics() {
  const [rows] = await blogDb.query(
    `SELECT COUNT(*) AS c FROM blog_2_0_automation_topics
     WHERE is_active = 1 AND status = 'queued'
       AND (scheduled_for IS NULL OR scheduled_for <= NOW())`,
  );
  return Number(rows[0]?.c || 0);
}

export async function listRecentTopicTitles(limit = 40) {
  const [rows] = await blogDb.query(
    `SELECT topic FROM blog_2_0_automation_topics ORDER BY id DESC LIMIT ?`,
    [Number(limit)],
  );
  return rows.map((r) => r.topic).filter(Boolean);
}

export async function markTopicProcessing(id) {
  await blogDb.query(
    `UPDATE blog_2_0_automation_topics
     SET status = 'processing', last_processed_at = NOW(), error_message = NULL
     WHERE id = ?`,
    [Number(id)],
  );
}

export async function markTopicDone(id, { draftId, title, approvalId = null }) {
  await blogDb.query(
    `UPDATE blog_2_0_automation_topics
     SET status = 'draft_ready',
         generated_draft_id = ?,
         generated_title = ?,
         approval_id = ?,
         last_processed_at = NOW(),
         error_message = NULL
     WHERE id = ?`,
    [Number(draftId), title || null, approvalId || null, Number(id)],
  );
}

export async function markTopicFailed(id, message) {
  await blogDb.query(
    `UPDATE blog_2_0_automation_topics
     SET status = 'failed', error_message = ?, last_processed_at = NOW()
     WHERE id = ?`,
    [String(message || "Unknown error").slice(0, 2000), Number(id)],
  );
}

export async function requeueTopic(id) {
  await blogDb.query(
    `UPDATE blog_2_0_automation_topics
     SET status = 'queued', error_message = NULL
     WHERE id = ?`,
    [Number(id)],
  );
  return getTopicById(id);
}

export async function releaseStaleProcessingTopics(staleMinutes = 50) {
  const [result] = await blogDb.query(
    `UPDATE blog_2_0_automation_topics
     SET status = 'queued', error_message = 'Recovered from stale processing'
     WHERE status = 'processing'
       AND last_processed_at IS NOT NULL
       AND last_processed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [Number(staleMinutes)],
  );
  return result.affectedRows || 0;
}
