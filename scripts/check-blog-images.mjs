import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
});

const [[total]] = await conn.query(
  "SELECT COUNT(*) AS c FROM blog_posts WHERE status='publish'",
);
const [[withImg]] = await conn.query(
  "SELECT COUNT(*) AS c FROM blog_posts WHERE status='publish' AND featured_image IS NOT NULL AND featured_image != ''",
);
const [samples] = await conn.query(
  "SELECT id, title, featured_image FROM blog_posts WHERE featured_image IS NOT NULL AND featured_image != '' LIMIT 5",
);
const [noImg] = await conn.query(
  "SELECT id, title FROM blog_posts WHERE status='publish' AND (featured_image IS NULL OR featured_image = '') LIMIT 3",
);

console.log("Published:", total.c, "| With featured_image:", withImg.c);
console.log("\nSamples WITH image:");
samples.forEach((r) => console.log("-", r.featured_image));
console.log("\nSamples WITHOUT image:");
noImg.forEach((r) => console.log("-", r.title?.slice(0, 60)));

await conn.end();
