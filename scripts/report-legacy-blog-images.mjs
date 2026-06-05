/**
 * List posts that still reference blog.tech2globe.com in featured_image or content.
 * Run: node scripts/report-legacy-blog-images.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
});

const pattern = "%blog.tech2globe.com%";

const [[feat]] = await conn.query(
  `SELECT COUNT(*) AS c FROM blog_posts WHERE featured_image LIKE ?`,
  [pattern],
);
const [[content]] = await conn.query(
  `SELECT COUNT(*) AS c FROM blog_posts WHERE content LIKE ?`,
  [pattern],
);

console.log(`Posts with legacy featured_image URL: ${feat.c}`);
console.log(`Posts with legacy URLs in content HTML: ${content.c}`);
console.log(
  "\nUpdate these in Admin → Blog (use Cloudinary URLs) or bulk-replace in DB.",
);
console.log("The app no longer depends on blog.tech2globe.com in code.\n");

const [samples] = await conn.query(
  `SELECT id, title, featured_image FROM blog_posts WHERE featured_image LIKE ? LIMIT 5`,
  [pattern],
);
samples.forEach((r) => console.log(`- [${r.id}] ${r.title?.slice(0, 50)}`));

await conn.end();
