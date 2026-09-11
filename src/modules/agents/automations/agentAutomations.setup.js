import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import blogDb from "../../../config/blogDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../../../../sql/agent_automations.sql");
const approvalsSqlPath = path.join(
  __dirname,
  "../../../../sql/blog_agent_approvals.sql",
);

const REQUIRED_TABLES = [
  "agent_automations_settings",
  "agent_automations_topics",
  "blog_agent_approvals",
];

async function tableExists(name) {
  const [rows] = await blogDb.query("SHOW TABLES LIKE ?", [name]);
  return rows.length > 0;
}

export async function ensureAgentAutomationsTables() {
  try {
    const missing = [];
    for (const t of REQUIRED_TABLES) {
      if (!(await tableExists(t))) missing.push(t);
    }
    if (!missing.length) return;

    console.log(
      `[agent-automations] schema incomplete (missing: ${missing.join(", ")}). Installing...`,
    );
    const sqlFiles = [sqlPath, approvalsSqlPath];
    for (const file of sqlFiles) {
      if (!fs.existsSync(file)) continue;
      const sql = fs.readFileSync(file, "utf8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await blogDb.query(stmt);
      }
    }
    console.log("[agent-automations] tables ensured");
  } catch (err) {
    console.error("[agent-automations] setup failed:", err.message);
  }
}
