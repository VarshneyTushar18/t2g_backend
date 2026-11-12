import crypto from "crypto";
import { randomUUID } from "crypto";
import blogDb from "../../../config/blogDb.js";

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

export function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

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

export async function ensureBlogApprovalTables() {
  await blogDb.query(`
    CREATE TABLE IF NOT EXISTS blog_agent_approvals (
      id CHAR(36) NOT NULL PRIMARY KEY,
      post_id INT NOT NULL,
      topic_id INT NULL,
      token_hash CHAR(64) NOT NULL,
      decision ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(191) NULL,
      requester_email VARCHAR(191) NULL,
      approval_emails JSON NULL,
      reminder_count INT NOT NULL DEFAULT 0,
      last_reminded_at DATETIME NULL,
      decided_at DATETIME NULL,
      decided_by_email VARCHAR(191) NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_blog_approval_token (token_hash),
      KEY idx_blog_approval_post (post_id),
      KEY idx_blog_approval_pending (decision, expires_at)
    )
  `);
}

export async function createApproval({
  postId,
  topicId = null,
  requestedBy = null,
  requesterEmail = null,
  approvalEmails = [],
  expiryHours = 168,
}) {
  await ensureBlogApprovalTables();
  const id = randomUUID();
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + Number(expiryHours || 168) * 60 * 60 * 1000);

  await blogDb.query(
    `INSERT INTO blog_agent_approvals
      (id, post_id, topic_id, token_hash, decision, requested_by, requester_email, approval_emails, expires_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      id,
      Number(postId),
      topicId != null ? Number(topicId) : null,
      tokenHash,
      requestedBy || null,
      requesterEmail || null,
      JSON.stringify(approvalEmails || []),
      expiresAt,
    ],
  );

  return { id, postId, expiresAt, rawToken };
}

export async function getLatestPendingForPost(postId) {
  await ensureBlogApprovalTables();
  const [rows] = await blogDb.query(
    `SELECT * FROM blog_agent_approvals
     WHERE post_id = ? AND decision = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [Number(postId)],
  );
  return rows[0] || null;
}

export async function getApprovalById(id) {
  await ensureBlogApprovalTables();
  const [rows] = await blogDb.query(
    `SELECT a.*,
            p.title AS title,
            p.slug AS slug,
            p.excerpt AS excerpt,
            p.content AS content,
            p.featured_image AS featured_image,
            p.status AS post_status,
            p.author_name AS author_name
     FROM blog_agent_approvals a
     LEFT JOIN blog_posts p ON p.id = a.post_id
     WHERE a.id = ?
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    approval_emails: parseJsonArray(row.approval_emails, []),
  };
}

export async function markDecision(approvalId, decision, decidedByEmail = null) {
  await ensureBlogApprovalTables();
  const [result] = await blogDb.query(
    `UPDATE blog_agent_approvals
     SET decision = ?,
         decided_at = CURRENT_TIMESTAMP,
         decided_by_email = ?
     WHERE id = ? AND decision = 'pending'`,
    [decision, decidedByEmail || null, approvalId],
  );
  if (!result.affectedRows) {
    return getApprovalById(approvalId);
  }
  return getApprovalById(approvalId);
}

export async function expireStaleApprovals() {
  await ensureBlogApprovalTables();
  await blogDb.query(
    `UPDATE blog_agent_approvals
     SET decision = 'expired', decided_at = CURRENT_TIMESTAMP
     WHERE decision = 'pending' AND expires_at < NOW()`,
  );
}
