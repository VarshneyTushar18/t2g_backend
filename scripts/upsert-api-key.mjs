import crypto from "crypto";
import fs from "fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const rawKey = process.argv[2];
const modulesArg = process.argv[3] || "blog";
const readOnly = process.argv.includes("--read-only");

if (!rawKey?.startsWith("t2g_sk_")) {
  console.error(
    "Usage: node scripts/upsert-api-key.mjs t2g_sk_... [module1,module2] [--read-only]",
  );
  process.exit(1);
}

const modules = modulesArg.split(",").map((m) => m.trim()).filter(Boolean);
const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
const prefix = rawKey.slice(0, 16);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "tech2globe",
  port: Number(process.env.DB_PORT || 3306),
});

const sqlPath = new URL("../sql/api_keys.sql", import.meta.url);
const createTableSql = fs.readFileSync(sqlPath, "utf8");

try {
  await pool.query(createTableSql);

  const [existing] = await pool.query(
    `SELECT id, name, modules, read_only FROM admin_api_keys WHERE key_hash = ? LIMIT 1`,
    [keyHash],
  );

  if (existing.length) {
    const row = existing[0];
    let current = row.modules;
    if (typeof current === "string") current = JSON.parse(current);
    const updated = [...new Set([...(current || []), ...modules])];
    await pool.query(`UPDATE admin_api_keys SET modules = ?, read_only = ? WHERE id = ?`, [
      JSON.stringify(updated),
      readOnly ? 1 : 0,
      row.id,
    ]);
    console.log(`Updated key id=${row.id}, modules=${JSON.stringify(updated)}, read_only=${readOnly ? 1 : 0}`);
  } else {
    const [result] = await pool.query(
      `INSERT INTO admin_api_keys (name, key_prefix, key_hash, modules, read_only, created_by)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [
        "Imported test key",
        prefix,
        keyHash,
        JSON.stringify(modules),
        readOnly ? 1 : 0,
      ],
    );
    console.log(
      `Inserted key id=${result.insertId}, modules=${JSON.stringify(modules)}, read_only=${readOnly ? 1 : 0}`,
    );
  }
} finally {
  await pool.end();
}
