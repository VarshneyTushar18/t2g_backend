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

async function columnExists(table, column) {
  const [rows] = await blogDb.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [
    column,
  ]);
  return rows.length > 0;
}

async function ensureAutoTrendingColumns() {
  const alters = [
    {
      col: "topic_source",
      sql: `ALTER TABLE agent_automations_settings ADD COLUMN topic_source ENUM('manual','auto_trending') NOT NULL DEFAULT 'manual' AFTER approval_emails`,
    },
    {
      col: "auto_niche",
      sql: `ALTER TABLE agent_automations_settings ADD COLUMN auto_niche TEXT NULL AFTER topic_source`,
    },
    {
      col: "auto_default_author_name",
      sql: `ALTER TABLE agent_automations_settings ADD COLUMN auto_default_author_name VARCHAR(255) NULL AFTER auto_niche`,
    },
    {
      col: "auto_default_category_ids",
      sql: `ALTER TABLE agent_automations_settings ADD COLUMN auto_default_category_ids JSON NULL AFTER auto_default_author_name`,
    },
    {
      col: "auto_default_tags",
      sql: `ALTER TABLE agent_automations_settings ADD COLUMN auto_default_tags JSON NULL AFTER auto_default_category_ids`,
    },
  ];
  if (!(await tableExists("agent_automations_settings"))) return;
  for (const { col, sql } of alters) {
    if (await columnExists("agent_automations_settings", col)) continue;
    try {
      await blogDb.query(sql);
      console.log(`[agent-automations] added column ${col}`);
    } catch (err) {
      console.error(`[agent-automations] column ${col} failed:`, err.message);
    }
  }
}

export async function ensureAgentAutomationsTables() {
  try {
    await ensureAutoTrendingColumns();

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
