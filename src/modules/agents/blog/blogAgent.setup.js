import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import blogDb from "../../../config/blogDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../../../../sql/blog_agent.sql");

const REQUIRED_TABLES = [
  "blog_agent_threads",
  "blog_agent_messages",
  "blog_agent_feedback",
  "blog_agent_guidelines",
];

async function tableExists(name) {
  const [rows] = await blogDb.query("SHOW TABLES LIKE ?", [name]);
  return rows.length > 0;
}

export async function ensureBlogAgentTables() {
  try {
    const missing = [];
    for (const t of REQUIRED_TABLES) {
      if (!(await tableExists(t))) missing.push(t);
    }

    if (missing.length > 0) {
      console.log(
        `Blog agent schema incomplete (missing: ${missing.join(", ")}). Installing…`,
      );
      const sql = fs.readFileSync(sqlPath, "utf8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await blogDb.query(stmt);
      }
    }

    const [typeCol] = await blogDb.query(
      "SHOW COLUMNS FROM blog_agent_threads LIKE 'agent_type'",
    );
    if (!typeCol.length) {
      await blogDb.query(
        `ALTER TABLE blog_agent_threads
         ADD COLUMN agent_type VARCHAR(32) NOT NULL DEFAULT 'writer'`,
      );
      await blogDb.query(
        "CREATE INDEX idx_blog_agent_threads_type ON blog_agent_threads (user_id, agent_type)",
      );
    }

    if (!(await tableExists("blog_agent_images"))) {
      await blogDb.query(`
        CREATE TABLE blog_agent_images (
          id CHAR(36) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          thread_id CHAR(36) DEFAULT NULL,
          prompt TEXT,
          cloudinary_url VARCHAR(1000) NOT NULL,
          public_id VARCHAR(255) DEFAULT NULL,
          width INT DEFAULT NULL,
          height INT DEFAULT NULL,
          post_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_blog_agent_images_user (user_id),
          INDEX idx_blog_agent_images_created (created_at)
        )
      `);
    }

    const [guide2] = await blogDb.query(
      "SELECT id FROM blog_agent_guidelines WHERE id = 2",
    );
    if (!guide2.length) {
      await blogDb.query(
        `INSERT INTO blog_agent_guidelines (id, content) VALUES (2, ?)`,
        [
          "Tech2Globe Blog Image Agent:\n- Generate professional blog cover and in-article images\n- Style: clean, modern, business/tech, no text in the image unless asked\n- Always upload to Cloudinary (never leave as a temp AI URL)\n- Default 16:9 landscape for featured/cover images\n- After generate, return the Cloudinary URL so it can be used as featured_image or pasted into a post",
        ],
      );
    }

    console.log("Blog agent tables ensured.");
  } catch (err) {
    console.error("Blog agent table setup failed:", err.message);
  }
}
