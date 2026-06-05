import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import blogDb from "../../config/blogDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../../../sql/blog_module.sql");

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

    // Backward-compatible schema updates for existing blog DBs.
    const [viewCountCol] = await blogDb.query(
      "SHOW COLUMNS FROM blog_posts LIKE 'view_count'",
    );
    if (!viewCountCol.length) {
      await blogDb.query(
        "ALTER TABLE blog_posts ADD COLUMN view_count INT NOT NULL DEFAULT 0 AFTER is_active",
      );
    }

    console.log("Blog tables ensured automatically.");
  } catch (err) {
    console.error("Blog table setup failed:", err.message);
  }
}
