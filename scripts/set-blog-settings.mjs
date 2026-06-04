import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const blogDbName = process.env.BLOG_DB_NAME || "tech2globe_blog";
const mediaBaseUrl =
  process.env.BLOG_MEDIA_BASE_URL ||
  process.env.SITE_URL ||
  process.env.CLIENT_URL_MAIN ||
  "https://www.tech2globe.com";
const defaultFeaturedImage =
  process.env.BLOG_DEFAULT_FEATURED_IMAGE ||
  `${mediaBaseUrl.replace(/\/$/, "")}/images/blog-bg.webp`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
    password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: blogDbName,
    port: Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306),
  });

  await conn.query(
    `INSERT INTO blog_settings (setting_key, setting_value)
     VALUES ('media_base_url', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [mediaBaseUrl],
  );
  await conn.query(
    `INSERT INTO blog_settings (setting_key, setting_value)
     VALUES ('default_featured_image', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [defaultFeaturedImage],
  );

  console.log(`Blog settings saved in ${blogDbName}`);
  console.log("media_base_url =", mediaBaseUrl);
  console.log("default_featured_image =", defaultFeaturedImage);
  await conn.end();
}

main().catch((err) => {
  console.error("Failed to set blog settings.");
  console.error("name:", err?.name);
  console.error("message:", err?.message);
  console.error("code:", err?.code);
  console.error("errno:", err?.errno);
  console.error("sqlState:", err?.sqlState);
  console.error("sqlMessage:", err?.sqlMessage);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
