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
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_blog20_drafts_status (status),
      KEY idx_blog20_drafts_slug (slug)
    )
  `);
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
    client_blog_url: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
    `SELECT id, title, slug, excerpt, status, featured_image, author_name, created_at, updated_at
     FROM blog_2_0_drafts
     ORDER BY created_at DESC
     LIMIT ?`,
    [Number(limit)],
  );
  return rows;
}
