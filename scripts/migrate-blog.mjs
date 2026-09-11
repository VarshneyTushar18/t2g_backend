import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "sql", "blog_module.sql");
const blogDbName = process.env.BLOG_DB_NAME || "tech2globe_blog";

const host = process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost";
const port = Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306);

/** App user — must match working main DB credentials in .env */
const appUser = process.env.BLOG_DB_USER || process.env.DB_USER || "root";
const appPass = process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "";

/** Optional: MySQL root (or admin) only to CREATE DATABASE + GRANT */
const adminUser = process.env.MYSQL_ROOT_USER || "root";
const adminPass =
  process.env.MYSQL_ROOT_PASSWORD ??
  process.env.MYSQL_ROOT_PASS ??
  "";

async function main() {
  if (!appUser) {
    throw new Error("Set DB_USER (and BLOG_DB_USER if different) in .env");
  }

  const adminForCreate = adminPass
    ? { host, port, user: adminUser, password: adminPass }
    : { host, port, user: appUser, password: appPass };

  const bootstrap = await mysql.createConnection(adminForCreate);

  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${blogDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  if (adminPass && appUser !== adminUser) {
    await bootstrap.query(
      `GRANT ALL PRIVILEGES ON \`${blogDbName}\`.* TO ?@'localhost'`,
      [appUser],
    );
    await bootstrap.query("FLUSH PRIVILEGES");
  }

  await bootstrap.end();

  const conn = await mysql.createConnection({
    host,
    user: appUser,
    password: appPass,
    database: blogDbName,
    port,
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
