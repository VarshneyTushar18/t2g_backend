/**
 * Import published WordPress posts from WP DB → blog DB (BLOG_DB_NAME).
 *
 * Usage (after SQL import into buynfqw4_blogstech):
 *   npm run migrate:blog
 *   npm run import:wp-blog
 *
 * Optional .env:
 *   WP_DB_NAME=buynfqw4_blogstech
 *   WP_TABLE_PREFIX=wp_
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const WP_DB = process.env.WP_DB_NAME || "buynfqw4_blogstech";
const WP_PREFIX = process.env.WP_TABLE_PREFIX || "wp_";

const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function main() {
  const wp = await mysql.createConnection({
    host: process.env.WP_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.WP_DB_USER || process.env.DB_USER || "root",
    password: process.env.WP_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: WP_DB,
    port: Number(process.env.WP_DB_PORT || process.env.DB_PORT || 3306),
  });

  const blogDbName = process.env.BLOG_DB_NAME || "tech2globe_blog";
  const app = await mysql.createConnection({
    host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
    password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: blogDbName,
    port: Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306),
  });

  const postsTable = `${WP_PREFIX}posts`;
  const metaTable = `${WP_PREFIX}postmeta`;
  const termsTable = `${WP_PREFIX}terms`;
  const ttTable = `${WP_PREFIX}term_taxonomy`;
  const trTable = `${WP_PREFIX}term_relationships`;

  console.log(`Source: ${WP_DB}.${postsTable}`);
  console.log(`Target: ${blogDbName}.blog_posts`);

  const [wpPosts] = await wp.query(
    `SELECT ID, post_title, post_name, post_content, post_excerpt, post_status, post_date, post_modified
     FROM ${postsTable}
     WHERE post_type = 'post' AND post_status = 'publish'
     ORDER BY post_date DESC`,
  );

  const [wpTerms] = await wp.query(
    `SELECT t.term_id, t.name, t.slug
     FROM ${termsTable} t
     INNER JOIN ${ttTable} tt ON tt.term_id = t.term_id
     WHERE tt.taxonomy = 'category'`,
  );

  const categoryMap = new Map();
  for (const term of wpTerms) {
    const slug = term.slug || slugify(term.name);
    const [existing] = await app.query(
      "SELECT id FROM blog_categories WHERE slug = ? LIMIT 1",
      [slug],
    );
    if (existing.length) {
      categoryMap.set(term.term_id, existing[0].id);
      continue;
    }
    const [ins] = await app.query(
      "INSERT INTO blog_categories (name, slug) VALUES (?, ?)",
      [term.name, slug],
    );
    categoryMap.set(term.term_id, ins.insertId);
  }
  console.log(`Categories synced: ${categoryMap.size}`);

  let imported = 0;
  let skipped = 0;

  for (const row of wpPosts) {
    const slug = row.post_name || slugify(row.post_title);
    if (!slug) {
      skipped++;
      continue;
    }

    const [exists] = await app.query(
      "SELECT id FROM blog_posts WHERE slug = ? LIMIT 1",
      [slug],
    );
    if (exists.length) {
      skipped++;
      continue;
    }

    const [[thumb]] = await wp.query(
      `SELECT p.guid FROM ${metaTable} m
       INNER JOIN ${postsTable} p ON p.ID = m.meta_value
       WHERE m.post_id = ? AND m.meta_key = '_thumbnail_id' LIMIT 1`,
      [row.ID],
    );

    const [ins] = await app.query(
      `INSERT INTO blog_posts
        (title, slug, excerpt, content, featured_image, status, author_name, published_at)
       VALUES (?, ?, ?, ?, ?, 'publish', 'Tech2globe', ?)`,
      [
        row.post_title,
        slug,
        row.post_excerpt || "",
        row.post_content,
        thumb?.guid || null,
        row.post_date,
      ],
    );

    const postId = ins.insertId;

    const [rels] = await wp.query(
      `SELECT tt.term_id FROM ${trTable} tr
       INNER JOIN ${ttTable} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
       WHERE tr.object_id = ? AND tt.taxonomy = 'category'`,
      [row.ID],
    );

    for (const rel of rels) {
      const catId = categoryMap.get(rel.term_id);
      if (!catId) continue;
      await app.query(
        "INSERT IGNORE INTO blog_post_categories (post_id, category_id) VALUES (?, ?)",
        [postId, catId],
      );
    }

    imported++;
  }

  console.log(`Done. Imported: ${imported}, skipped (duplicate/missing slug): ${skipped}`);
  await wp.end();
  await app.end();
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
