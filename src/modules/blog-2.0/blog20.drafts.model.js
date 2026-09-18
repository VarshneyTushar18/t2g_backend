import blogDb from "../../config/blogDb.js";

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export async function ensureBlog20DraftsTable() {
  await blogDb.query(`
    CREATE TABLE IF NOT EXISTS blog_2_0_drafts (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      excerpt TEXT NULL,
      content LONGTEXT NOT NULL,
      featured_image VARCHAR(500) NULL,
      focus_keyword VARCHAR(255) NULL,
      status ENUM('draft', 'pending', 'ready_for_mailerlite') NOT NULL DEFAULT 'draft',
      author_name VARCHAR(255) NULL DEFAULT 'Bright CRM Team',
      created_by VARCHAR(255) NULL,
      thread_id VARCHAR(36) NULL,
      mailerlite_push_status ENUM('idle','processing','pushed','failed') NOT NULL DEFAULT 'idle',
      mailerlite_pushed_at TIMESTAMP NULL,
      mailerlite_push_error TEXT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_blog20_drafts_status (status),
      KEY idx_blog20_drafts_slug (slug),
      KEY idx_blog20_drafts_ml_push (mailerlite_push_status)
    )
  `);
  const alters = [
    {
      col: "mailerlite_push_status",
      sql: "ALTER TABLE blog_2_0_drafts ADD COLUMN mailerlite_push_status ENUM('idle','processing','pushed','failed') NOT NULL DEFAULT 'idle' AFTER thread_id",
    },
    {
      col: "mailerlite_pushed_at",
      sql: "ALTER TABLE blog_2_0_drafts ADD COLUMN mailerlite_pushed_at TIMESTAMP NULL AFTER mailerlite_push_status",
    },
    {
      col: "mailerlite_push_error",
      sql: "ALTER TABLE blog_2_0_drafts ADD COLUMN mailerlite_push_error TEXT NULL AFTER mailerlite_pushed_at",
    },
  ];
  const [cols] = await blogDb.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_2_0_drafts'`,
  );
  const existing = new Set(cols.map((c) => c.COLUMN_NAME));
  for (const { col, sql } of alters) {
    if (!existing.has(col)) await blogDb.query(sql);
  }
}

function mapDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt || "",
    content: row.content,
    featured_image: row.featured_image || null,
    focus_keyword: row.focus_keyword || null,
    status: row.status,
    author_name: row.author_name || "Bright CRM Team",
    mailerlite_push_status: row.mailerlite_push_status || "idle",
    mailerlite_pushed_at: row.mailerlite_pushed_at || null,
    mailerlite_push_error: row.mailerlite_push_error || null,
    client_blog_url: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function updateDraftPushStatus(id, patch) {
  const sets = ["updated_at = CURRENT_TIMESTAMP"];
  const vals = [];
  if (patch.mailerlite_push_status !== undefined) {
    sets.push("mailerlite_push_status = ?");
    vals.push(patch.mailerlite_push_status);
  }
  if (patch.mailerlite_pushed_at !== undefined) {
    sets.push("mailerlite_pushed_at = ?");
    vals.push(patch.mailerlite_pushed_at);
  }
  if (patch.mailerlite_push_error !== undefined) {
    sets.push("mailerlite_push_error = ?");
    vals.push(patch.mailerlite_push_error);
  }
  vals.push(id);
  await blogDb.query(
    `UPDATE blog_2_0_drafts SET ${sets.join(", ")} WHERE id = ?`,
    vals,
  );
}

export async function createDraft(data) {
  const title = String(data.title || "").trim();
  const slug = data.slug || slugify(title);
  const [result] = await blogDb.query(
    `INSERT INTO blog_2_0_drafts
      (title, slug, excerpt, content, featured_image, focus_keyword, status, author_name, created_by, thread_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      slug,
      data.excerpt || title.slice(0, 160),
      data.content,
      data.featured_image || null,
      data.focus_keyword || null,
      data.status || "draft",
      data.author_name || "Bright CRM Team",
      data.created_by || null,
      data.thread_id || null,
    ],
  );
  return getDraftById(result.insertId);
}

export async function getDraftById(id) {
  const [rows] = await blogDb.query(
    "SELECT * FROM blog_2_0_drafts WHERE id = ? LIMIT 1",
    [id],
  );
  const draft = mapDraft(rows[0]);
  if (draft) {
    draft.client_blog_url = null;
    draft.mailerlite_note =
      "Copy this draft into MailerLite website blog editor (Blog-2.0 / Bright CRM). Not published on Tech2Globe.";
  }
  return draft;
}

export async function listDrafts({ limit = 20 } = {}) {
  const [rows] = await blogDb.query(
    `SELECT id, title, slug, excerpt, status, featured_image, author_name,
            mailerlite_push_status, mailerlite_pushed_at, mailerlite_push_error,
            created_at, updated_at
     FROM blog_2_0_drafts
     ORDER BY created_at DESC
     LIMIT ?`,
    [Number(limit)],
  );
  return rows;
}
