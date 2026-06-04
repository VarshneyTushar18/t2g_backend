import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "sql", "blog_module.sql");
const blogDbName = process.env.BLOG_DB_NAME || "tech2globe_blog";

async function main() {
  const root = await mysql.createConnection({
    host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
    password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    port: Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306),
  });

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${blogDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.end();

  const conn = await mysql.createConnection({
    host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
    password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: blogDbName,
    port: Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306),
    multipleStatements: true,
  });

  const sql = fs.readFileSync(sqlPath, "utf8");

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("DROP TABLE IF EXISTS blog_post_categories");
    await conn.query("DROP TABLE IF EXISTS blog_posts");
    await conn.query("DROP TABLE IF EXISTS blog_categories");
    await conn.query("DROP TABLE IF EXISTS blog_settings");
    await conn.query(sql);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log(`Blog tables ready in database: ${blogDbName}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Blog migration failed.");
  console.error("name:", err?.name);
  console.error("message:", err?.message);
  console.error("code:", err?.code);
  console.error("errno:", err?.errno);
  console.error("sqlState:", err?.sqlState);
  console.error("sqlMessage:", err?.sqlMessage);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
