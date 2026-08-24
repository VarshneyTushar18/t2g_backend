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

    console.log("Blog agent tables ensured.");
  } catch (err) {
    console.error("Blog agent table setup failed:", err.message);
  }
}
