import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import pool from "../../../config/db.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  require_hr_approval: true,
  approval_emails: [],
  reminder_hours: 24,
  max_reminders: 2,
  expiry_hours: 168,
};

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    enabled: Boolean(row.enabled),
    require_hr_approval: Boolean(row.require_hr_approval),
    approval_emails: parseJsonArray(row.approval_emails, []),
    reminder_hours: Number(row.reminder_hours) || 24,
    max_reminders: Number(row.max_reminders) || 2,
    expiry_hours: Number(row.expiry_hours) || 168,
    updated_by: row.updated_by || null,
    updated_at: row.updated_at || null,
  };
}

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

export function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function ensureCareerApprovalTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_agent_approval_settings (
      id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      require_hr_approval TINYINT(1) NOT NULL DEFAULT 1,
      approval_emails JSON NULL,
      reminder_hours INT NOT NULL DEFAULT 24,
      max_reminders INT NOT NULL DEFAULT 2,
      expiry_hours INT NOT NULL DEFAULT 168,
      updated_by VARCHAR(128) NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT INTO career_agent_approval_settings (id, enabled, require_hr_approval)
    VALUES (1, 1, 1)
    ON DUPLICATE KEY UPDATE id = id
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_job_approvals (
      id CHAR(36) NOT NULL PRIMARY KEY,
      job_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      decision ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(191) NULL,
      requester_email VARCHAR(191) NULL,
      hr_emails JSON NULL,
      reminder_count INT NOT NULL DEFAULT 0,
      last_reminded_at DATETIME NULL,
      decided_at DATETIME NULL,
      decided_by_email VARCHAR(191) NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_career_approval_token (token_hash),
      KEY idx_career_approval_job (job_id),
      KEY idx_career_approval_pending (decision, expires_at, last_reminded_at, reminder_count)
    )
  `);

  try {
    await pool.query(`
      ALTER TABLE jobs
        MODIFY COLUMN status ENUM('active', 'inactive', 'pending_approval', 'rejected')
        NOT NULL DEFAULT 'active'
    `);
  } catch (err) {
    // Ignore if already migrated or limited privileges
    if (!String(err.message || "").includes("Duplicate")) {
      console.warn("[career-approval] status enum migrate:", err.message);
    }
  }
}

export async function getSettings() {
  await ensureCareerApprovalTables();
  const [rows] = await pool.query(
    "SELECT * FROM career_agent_approval_settings WHERE id = 1 LIMIT 1",
  );
  return mapSettings(rows[0]);
}

export async function saveSettings(payload, updatedBy = null) {
  await ensureCareerApprovalTables();
  const current = await getSettings();
  const next = {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled,
    require_hr_approval:
      payload.require_hr_approval !== undefined
        ? Boolean(payload.require_hr_approval)
        : current.require_hr_approval,
    approval_emails: Array.isArray(payload.approval_emails)
      ? payload.approval_emails
      : current.approval_emails,
    reminder_hours: Math.max(
      1,
      Number(payload.reminder_hours ?? current.reminder_hours) || 24,
    ),
    max_reminders: Math.max(
      0,
      Number(payload.max_reminders ?? current.max_reminders) || 0,
    ),
    expiry_hours: Math.max(
      1,
      Number(payload.expiry_hours ?? current.expiry_hours) || 168,
    ),
  };

  await pool.query(
    `UPDATE career_agent_approval_settings SET
      enabled = ?,
      require_hr_approval = ?,
      approval_emails = ?,
      reminder_hours = ?,
      max_reminders = ?,
      expiry_hours = ?,
      updated_by = ?
     WHERE id = 1`,
    [
      next.enabled ? 1 : 0,
      next.require_hr_approval ? 1 : 0,
      JSON.stringify(next.approval_emails || []),
      next.reminder_hours,
      next.max_reminders,
      next.expiry_hours,
      updatedBy,
    ],
  );

  return getSettings();
}

export async function createApproval({
  jobId,
  requestedBy,
  requesterEmail,
  hrEmails,
  expiryHours,
}) {
  await ensureCareerApprovalTables();
  const id = uuidv4();
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const hours = Math.max(1, Number(expiryHours) || 168);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO career_job_approvals
      (id, job_id, token_hash, decision, requested_by, requester_email, hr_emails, expires_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      id,
      jobId,
      tokenHash,
      requestedBy || null,
      requesterEmail || null,
      JSON.stringify(hrEmails || []),
      expiresAt,
    ],
  );

  return {
    id,
    jobId,
    rawToken,
    expiresAt,
    hrEmails: hrEmails || [],
  };
}

export async function getApprovalByToken(rawToken) {
  await ensureCareerApprovalTables();
  const tokenHash = hashToken(rawToken);
  const [rows] = await pool.query(
    `SELECT a.*, j.title, j.experience, j.positions, j.location, j.qualification,
            j.salary, j.skills, j.responsibilities, j.status AS job_status
     FROM career_job_approvals a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.token_hash = ?
     LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    hr_emails: parseJsonArray(row.hr_emails, []),
  };
}

export async function getApprovalById(id) {
  const [rows] = await pool.query(
    `SELECT a.*, j.title, j.experience, j.positions, j.location, j.qualification,
            j.salary, j.skills, j.responsibilities, j.status AS job_status
     FROM career_job_approvals a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.id = ?
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    hr_emails: parseJsonArray(row.hr_emails, []),
  };
}

export async function getLatestPendingForJob(jobId) {
  const [rows] = await pool.query(
    `SELECT * FROM career_job_approvals
     WHERE job_id = ? AND decision = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [jobId],
  );
  return rows[0] || null;
}

export async function markDecision(approvalId, decision, decidedByEmail = null) {
  await pool.query(
    `UPDATE career_job_approvals
     SET decision = ?, decided_at = NOW(), decided_by_email = ?
     WHERE id = ? AND decision = 'pending'`,
    [decision, decidedByEmail, approvalId],
  );
  const [rows] = await pool.query(
    `SELECT * FROM career_job_approvals WHERE id = ? LIMIT 1`,
    [approvalId],
  );
  return rows[0] || null;
}

export async function markReminded(approvalId) {
  await pool.query(
    `UPDATE career_job_approvals
     SET reminder_count = reminder_count + 1, last_reminded_at = NOW()
     WHERE id = ?`,
    [approvalId],
  );
}

export async function expireStaleApprovals() {
  await pool.query(
    `UPDATE career_job_approvals
     SET decision = 'expired', decided_at = NOW()
     WHERE decision = 'pending' AND expires_at < NOW()`,
  );

  await pool.query(
    `UPDATE jobs j
     INNER JOIN career_job_approvals a ON a.job_id = j.id
     SET j.status = 'rejected'
     WHERE a.decision = 'expired'
       AND j.status = 'pending_approval'
       AND NOT EXISTS (
         SELECT 1 FROM career_job_approvals a2
         WHERE a2.job_id = j.id AND a2.decision = 'pending'
       )`,
  );
}

export async function listPendingForReminder({ reminderHours, maxReminders }) {
  const hours = Math.max(1, Number(reminderHours) || 24);
  const max = Math.max(0, Number(maxReminders) || 0);
  const [rows] = await pool.query(
    `SELECT a.*, j.title, j.experience, j.positions, j.location, j.qualification,
            j.salary, j.skills, j.responsibilities, j.status AS job_status
     FROM career_job_approvals a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.decision = 'pending'
       AND a.expires_at > NOW()
       AND a.reminder_count < ?
       AND (
         (a.last_reminded_at IS NULL AND a.created_at <= DATE_SUB(NOW(), INTERVAL ? HOUR))
         OR (a.last_reminded_at IS NOT NULL AND a.last_reminded_at <= DATE_SUB(NOW(), INTERVAL ? HOUR))
       )
     ORDER BY a.created_at ASC
     LIMIT 50`,
    [max, hours, hours],
  );
  return rows.map((row) => ({
    ...row,
    hr_emails: parseJsonArray(row.hr_emails, []),
  }));
}

export async function listRecentApprovals(limit = 30) {
  const [rows] = await pool.query(
    `SELECT a.id, a.job_id, a.decision, a.requested_by, a.requester_email,
            a.hr_emails, a.reminder_count, a.last_reminded_at, a.decided_at,
            a.expires_at, a.created_at, j.title, j.status AS job_status, j.location
     FROM career_job_approvals a
     JOIN jobs j ON j.id = a.job_id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [Math.min(100, Math.max(1, Number(limit) || 30))],
  );
  return rows.map((row) => ({
    ...row,
    hr_emails: parseJsonArray(row.hr_emails, []),
  }));
}

export async function setJobStatus(jobId, status) {
  await pool.query(`UPDATE jobs SET status = ? WHERE id = ?`, [status, jobId]);
  const [rows] = await pool.query(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
  return rows[0] || null;
}
