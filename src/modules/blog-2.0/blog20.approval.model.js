import { randomUUID } from "crypto";
import blogDb from "../../config/blogDb.js";

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

export async function ensureBlog20ApprovalTables() {
  await blogDb.query(`
    CREATE TABLE IF NOT EXISTS blog_2_0_draft_approvals (
      id CHAR(36) NOT NULL PRIMARY KEY,
      draft_id INT UNSIGNED NOT NULL,
      decision ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(191) NULL,
      requester_email VARCHAR(191) NULL,
      approval_emails JSON NULL,
      mailerlite_push_status ENUM('idle','queued','processing','pushed','failed') NOT NULL DEFAULT 'idle',
      mailerlite_push_error TEXT NULL,
      publish_mode ENUM('draft','live') NULL,
      decided_at DATETIME NULL,
      decided_by_email VARCHAR(191) NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_blog20_approval_draft (draft_id),
      KEY idx_blog20_approval_pending (decision, expires_at)
    )
  `);
  const [cols] = await blogDb.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_2_0_draft_approvals'`,
  );
  const existing = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!existing.has("publish_mode")) {
    await blogDb.query(
      `ALTER TABLE blog_2_0_draft_approvals
       ADD COLUMN publish_mode ENUM('draft','live') NULL AFTER mailerlite_push_error`,
    );
  }
}

export async function createApproval({
  draftId,
  requestedBy = null,
  requesterEmail = null,
  approvalEmails = [],
  expiryHours = 168,
}) {
  await ensureBlog20ApprovalTables();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + Number(expiryHours || 168) * 60 * 60 * 1000);

  await blogDb.query(
    `INSERT INTO blog_2_0_draft_approvals
      (id, draft_id, decision, requested_by, requester_email, approval_emails, expires_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    [
      id,
      Number(draftId),
      requestedBy || null,
      requesterEmail || null,
      JSON.stringify(approvalEmails || []),
      expiresAt,
    ],
  );

  return { id, draftId, expiresAt };
}

export async function getLatestPendingForDraft(draftId) {
  await ensureBlog20ApprovalTables();
  const [rows] = await blogDb.query(
    `SELECT * FROM blog_2_0_draft_approvals
     WHERE draft_id = ? AND decision = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [Number(draftId)],
  );
  return rows[0] || null;
}

export async function getApprovalById(id) {
  await ensureBlog20ApprovalTables();
  const [rows] = await blogDb.query(
    `SELECT a.*,
            d.title AS title,
            d.slug AS slug,
            d.excerpt AS excerpt,
            d.content AS content,
            d.featured_image AS featured_image,
            d.status AS draft_status,
            d.author_name AS author_name,
            d.mailerlite_push_status AS draft_push_status
     FROM blog_2_0_draft_approvals a
     LEFT JOIN blog_2_0_drafts d ON d.id = a.draft_id
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

export async function markDecision(
  approvalId,
  decision,
  decidedByEmail = null,
  publishMode = null,
) {
  await ensureBlog20ApprovalTables();
  const [result] = await blogDb.query(
    `UPDATE blog_2_0_draft_approvals
     SET decision = ?,
         decided_at = CURRENT_TIMESTAMP,
         decided_by_email = ?,
         publish_mode = COALESCE(?, publish_mode)
     WHERE id = ? AND decision = 'pending'`,
    [decision, decidedByEmail || null, publishMode || null, approvalId],
  );
  if (!result.affectedRows) {
    return getApprovalById(approvalId);
  }
  return getApprovalById(approvalId);
}

export async function updateApprovalPushStatus(approvalId, patch) {
  await ensureBlog20ApprovalTables();
  const sets = [];
  const vals = [];
  if (patch.mailerlite_push_status !== undefined) {
    sets.push("mailerlite_push_status = ?");
    vals.push(patch.mailerlite_push_status);
  }
  if (patch.mailerlite_push_error !== undefined) {
    sets.push("mailerlite_push_error = ?");
    vals.push(patch.mailerlite_push_error);
  }
  if (!sets.length) return getApprovalById(approvalId);
  vals.push(approvalId);
  await blogDb.query(
    `UPDATE blog_2_0_draft_approvals SET ${sets.join(", ")} WHERE id = ?`,
    vals,
  );
  return getApprovalById(approvalId);
}
