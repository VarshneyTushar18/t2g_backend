import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import blogDb from "../../config/blogDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../../../sql/blog_module.sql");

const SEO_COLUMN_MIGRATIONS = [
  { col: "meta_title", sql: "ALTER TABLE blog_posts ADD COLUMN meta_title VARCHAR(500) DEFAULT NULL AFTER featured_image" },
  { col: "meta_description", sql: "ALTER TABLE blog_posts ADD COLUMN meta_description TEXT DEFAULT NULL AFTER meta_title" },
  { col: "focus_keyword", sql: "ALTER TABLE blog_posts ADD COLUMN focus_keyword VARCHAR(255) DEFAULT NULL AFTER meta_description" },
  { col: "canonical_url", sql: "ALTER TABLE blog_posts ADD COLUMN canonical_url VARCHAR(1000) DEFAULT NULL AFTER focus_keyword" },
  { col: "robots_noindex", sql: "ALTER TABLE blog_posts ADD COLUMN robots_noindex TINYINT(1) NOT NULL DEFAULT 0 AFTER canonical_url" },
  { col: "robots_nofollow", sql: "ALTER TABLE blog_posts ADD COLUMN robots_nofollow TINYINT(1) NOT NULL DEFAULT 0 AFTER robots_noindex" },
  { col: "og_title", sql: "ALTER TABLE blog_posts ADD COLUMN og_title VARCHAR(500) DEFAULT NULL AFTER robots_nofollow" },
  { col: "og_description", sql: "ALTER TABLE blog_posts ADD COLUMN og_description TEXT DEFAULT NULL AFTER og_title" },
  { col: "og_image", sql: "ALTER TABLE blog_posts ADD COLUMN og_image VARCHAR(1000) DEFAULT NULL AFTER og_description" },
  { col: "twitter_title", sql: "ALTER TABLE blog_posts ADD COLUMN twitter_title VARCHAR(500) DEFAULT NULL AFTER og_image" },
  { col: "twitter_description", sql: "ALTER TABLE blog_posts ADD COLUMN twitter_description TEXT DEFAULT NULL AFTER twitter_title" },
  { col: "twitter_image", sql: "ALTER TABLE blog_posts ADD COLUMN twitter_image VARCHAR(1000) DEFAULT NULL AFTER twitter_description" },
  { col: "tags", sql: "ALTER TABLE blog_posts ADD COLUMN tags JSON DEFAULT NULL AFTER twitter_image" },
];

async function ensureColumn(col, sql) {
  const [rows] = await blogDb.query(`SHOW COLUMNS FROM blog_posts LIKE ?`, [col]);
  if (!rows.length) {
    await blogDb.query(sql);
  }
}

export async function ensureBlogTables() {
  try {
    const [posts] = await blogDb.query("SHOW TABLES LIKE 'blog_posts'");
    const [settings] = await blogDb.query("SHOW TABLES LIKE 'blog_settings'");
    if (!posts.length || !settings.length) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--"));

      for (const stmt of statements) {
        await blogDb.query(stmt);
      }
    }

    const [viewCountCol] = await blogDb.query(
      "SHOW COLUMNS FROM blog_posts LIKE 'view_count'",
    );
    if (!viewCountCol.length) {
      await blogDb.query(
        "ALTER TABLE blog_posts ADD COLUMN view_count INT NOT NULL DEFAULT 0 AFTER is_active",
      );
    }

    for (const { col, sql } of SEO_COLUMN_MIGRATIONS) {
      await ensureColumn(col, sql);
    }

    console.log("Blog tables ensured automatically.");
  } catch (err) {
    console.error("Blog table setup failed:", err.message);
  }
}
