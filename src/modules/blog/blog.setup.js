import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import blogDb from "../../config/blogDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../../../sql/blog_module.sql");

const REQUIRED_TABLES = [
  "blog_categories",
  "blog_posts",
  "blog_post_categories",
  "blog_settings",
];

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
  { col: "featured_image_title", sql: "ALTER TABLE blog_posts ADD COLUMN featured_image_title VARCHAR(500) DEFAULT NULL AFTER featured_image" },
  { col: "featured_image_alt", sql: "ALTER TABLE blog_posts ADD COLUMN featured_image_alt VARCHAR(500) DEFAULT NULL AFTER featured_image_title" },
];

async function tableExists(name) {
  const [rows] = await blogDb.query("SHOW TABLES LIKE ?", [name]);
  return rows.length > 0;
}

async function ensureColumn(col, sql) {
  const [rows] = await blogDb.query("SHOW COLUMNS FROM blog_posts LIKE ?", [col]);
  if (!rows.length) {
    await blogDb.query(sql);
  }
}

async function installFreshSchema() {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const conn = await blogDb.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("DROP TABLE IF EXISTS blog_post_categories");
    await conn.query("DROP TABLE IF EXISTS blog_posts");
    await conn.query("DROP TABLE IF EXISTS blog_categories");
    await conn.query("DROP TABLE IF EXISTS blog_settings");
    await conn.query(sql);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}

export async function ensureBlogTables() {
  try {
    const missing = [];
    for (const t of REQUIRED_TABLES) {
      if (!(await tableExists(t))) missing.push(t);
    }

    if (missing.length > 0) {
      console.log(
        `Blog schema incomplete (missing: ${missing.join(", ")}). Installing tables…`,
      );
      await installFreshSchema();
    }

    if (!(await tableExists("blog_posts"))) {
      throw new Error("blog_posts table missing after setup");
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
    console.error("  → Run on server: npm run migrate:blog");
  }
}
