/**
 * One-time: copy blog_* tables from main DB (tech2globe) → blog DB (tech2globe_blog).
 * Run after: npm run migrate:blog
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const mainDb = process.env.DB_NAME || "tech2globe";
const blogDb = process.env.BLOG_DB_NAME || "tech2globe_blog";

const base = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT || 3306),
};

async function copyTable(conn, table) {
  const [rows] = await conn.query(`SELECT * FROM \`${mainDb}\`.\`${table}\``);
  if (!rows.length) {
    console.log(`  ${table}: nothing to copy`);
    return;
  }

  await conn.query(`DELETE FROM \`${blogDb}\`.\`${table}\``);

  for (const row of rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?").join(", ");
    await conn.query(
      `INSERT INTO \`${blogDb}\`.\`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")})
       VALUES (${placeholders})`,
      cols.map((c) => row[c]),
    );
  }
  console.log(`  ${table}: copied ${rows.length} rows`);
}

async function main() {
  const conn = await mysql.createConnection(base);

  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'blog_%'`,
    [mainDb],
  );

  if (!tables.length) {
    console.log(`No blog_* tables in ${mainDb}. Nothing to copy.`);
    await conn.end();
    return;
  }

  console.log(`Copying from ${mainDb} → ${blogDb}...`);
  await copyTable(conn, "blog_categories");
  await copyTable(conn, "blog_posts");
  await copyTable(conn, "blog_post_categories");
  console.log("Done.");

  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
