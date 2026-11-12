import pool from "../../../config/db.js";
import { ensureCareerApprovalTables } from "./careerApproval.model.js";

export async function ensureCareerAutomationTopicsTable() {
  await ensureCareerApprovalTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_automation_topics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title_hint VARCHAR(255) NOT NULL,
      notes TEXT NULL,
      priority INT NOT NULL DEFAULT 0,
      status ENUM('queued','processing','draft_ready','failed') NOT NULL DEFAULT 'queued',
      generated_job_id INT NULL,
      error_message TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_processed_at DATETIME NULL,
      created_by VARCHAR(191) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_career_topic_queue (is_active, status, priority, id)
    )
  `);
}

function mapTopic(row) {
  if (!row) return null;
  return {
    id: row.id,
    title_hint: row.title_hint,
    notes: row.notes || "",
    priority: Number(row.priority || 0),
    status: row.status,
    generated_job_id: row.generated_job_id || null,
    error_message: row.error_message || null,
    is_active: Boolean(row.is_active),
    last_processed_at: row.last_processed_at || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listTopics(limit = 100) {
  await ensureCareerAutomationTopicsTable();
  const [rows] = await pool.query(
    `SELECT * FROM career_automation_topics
     WHERE is_active = 1
     ORDER BY priority DESC, id ASC
     LIMIT ?`,
    [Math.min(200, Math.max(1, Number(limit) || 100))],
  );
  return rows.map(mapTopic);
}

export async function createTopic({ title_hint, notes, priority, created_by }) {
  await ensureCareerAutomationTopicsTable();
  const [result] = await pool.query(
    `INSERT INTO career_automation_topics (title_hint, notes, priority, created_by)
     VALUES (?, ?, ?, ?)`,
    [
      String(title_hint || "").trim(),
      notes || null,
      Number(priority) || 0,
      created_by || null,
    ],
  );
  const [rows] = await pool.query(
    `SELECT * FROM career_automation_topics WHERE id = ?`,
    [result.insertId],
  );
  return mapTopic(rows[0]);
}

export async function deleteTopic(id) {
  await pool.query(
    `UPDATE career_automation_topics SET is_active = 0 WHERE id = ?`,
    [id],
  );
}

export async function getNextQueuedTopic() {
  await ensureCareerAutomationTopicsTable();
  const [rows] = await pool.query(
    `SELECT * FROM career_automation_topics
     WHERE is_active = 1 AND status = 'queued'
     ORDER BY priority DESC, id ASC
     LIMIT 1`,
  );
  return mapTopic(rows[0]);
}

export async function markTopicProcessing(id) {
  await pool.query(
    `UPDATE career_automation_topics SET status = 'processing', last_processed_at = NOW() WHERE id = ?`,
    [id],
  );
}

export async function markTopicDraftReady(id, jobId) {
  await pool.query(
    `UPDATE career_automation_topics SET status = 'draft_ready', generated_job_id = ?, error_message = NULL WHERE id = ?`,
    [jobId, id],
  );
}

export async function markTopicFailed(id, message) {
  await pool.query(
    `UPDATE career_automation_topics SET status = 'failed', error_message = ? WHERE id = ?`,
    [String(message || "failed").slice(0, 2000), id],
  );
}
