import blogDb from "../../config/blogDb.js";
import { BLOG_SOCIAL_PLATFORM_IDS } from "./blogSocial.platforms.js";

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function listAccounts() {
  const [rows] = await blogDb.query(
    `SELECT platform, account_label, account_id, is_active, connected_at, updated_at
     FROM blog_social_accounts
     ORDER BY platform ASC`,
  );
  return rows;
}

export async function getAccount(platform) {
  const [rows] = await blogDb.query(
    `SELECT * FROM blog_social_accounts WHERE platform = ? LIMIT 1`,
    [platform],
  );
  return rows[0] || null;
}

export async function upsertAccount(platform, data = {}) {
  const existing = await getAccount(platform);
  if (existing) {
    await blogDb.query(
      `UPDATE blog_social_accounts
       SET account_label = ?, account_id = ?, is_active = ?, connected_at = COALESCE(connected_at, NOW())
       WHERE platform = ?`,
      [
        data.account_label || existing.account_label,
        data.account_id || existing.account_id,
        data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
        platform,
      ],
    );
  } else {
    await blogDb.query(
      `INSERT INTO blog_social_accounts
        (platform, account_label, account_id, is_active, connected_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        platform,
        data.account_label || null,
        data.account_id || null,
        data.is_active !== false ? 1 : 0,
      ],
    );
  }
  return getAccount(platform);
}

export async function listSharesForPost(postId) {
  const [rows] = await blogDb.query(
    `SELECT platform, status, external_id, error_message, shared_at, updated_at
     FROM blog_social_shares WHERE post_id = ?`,
    [postId],
  );
  const map = {};
  for (const id of BLOG_SOCIAL_PLATFORM_IDS) {
    map[id] = null;
  }
  for (const row of rows) {
    map[row.platform] = row;
  }
  return map;
}

export async function upsertShare(postId, platform, { status, external_id = null, error_message = null }) {
  await blogDb.query(
    `INSERT INTO blog_social_shares (post_id, platform, status, external_id, error_message, shared_at)
     VALUES (?, ?, ?, ?, ?, IF(? = 'success', NOW(), NULL))
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       external_id = VALUES(external_id),
       error_message = VALUES(error_message),
       shared_at = IF(VALUES(status) = 'success', NOW(), shared_at)`,
    [postId, platform, status, external_id, error_message, status],
  );
}
