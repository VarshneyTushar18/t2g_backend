/**
 * Bulk-replace blog.tech2globe.com → your media host in blog_posts.
 *
 * Prerequisite: copy WordPress uploads to the main site, e.g.
 *   rsync blog server:/wp-content/uploads/ → /var/www/tech2globe/public/wp-content/uploads/
 * OR run a Cloudinary migration and pass --to=cloudinary (uploads featured images only).
 *
 * Usage:
 *   npm run report:legacy-blog-images
 *   node scripts/migrate-blog-image-host.mjs --dry-run
 *   node scripts/migrate-blog-image-host.mjs
 *   node scripts/migrate-blog-image-host.mjs --to=https://res.cloudinary.com/your-cloud
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const FROM = "https://blog.tech2globe.com";
const dryRun = process.argv.includes("--dry-run");
const toArg = process.argv.find((a) => a.startsWith("--to="));
const TO = (
  toArg?.slice(5) ||
  process.env.BLOG_MEDIA_BASE_URL ||
  process.env.SITE_URL ||
  process.env.CLIENT_URL_MAIN ||
  "https://www.tech2globe.com"
).replace(/\/$/, "");

const conn = await mysql.createConnection({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
});

function replaceAll(text = "") {
  if (!text || typeof text !== "string") return text;
  return text.split(FROM).join(TO).split("http://blog.tech2globe.com").join(TO);
}

const [rows] = await conn.query(
  `SELECT id, title, featured_image, content, og_image, twitter_image
   FROM blog_posts
   WHERE featured_image LIKE '%blog.tech2globe.com%'
      OR content LIKE '%blog.tech2globe.com%'
      OR og_image LIKE '%blog.tech2globe.com%'
      OR twitter_image LIKE '%blog.tech2globe.com%'`,
);

console.log(`Found ${rows.length} posts with legacy blog.tech2globe.com URLs`);
console.log(`Replace: ${FROM} → ${TO}`);
if (dryRun) console.log("(dry run — no DB writes)\n");

let updated = 0;
for (const row of rows) {
  const featured_image = replaceAll(row.featured_image || "");
  const content = replaceAll(row.content || "");
  const og_image = replaceAll(row.og_image || "");
  const twitter_image = replaceAll(row.twitter_image || "");

  if (dryRun) {
    console.log(`- [${row.id}] ${row.title?.slice(0, 55)}`);
    continue;
  }

  await conn.query(
    `UPDATE blog_posts
     SET featured_image = ?, content = ?, og_image = ?, twitter_image = ?
     WHERE id = ?`,
    [featured_image || null, content, og_image || null, twitter_image || null, row.id],
  );
  updated++;
}

if (!dryRun) {
  await conn.query(
    `INSERT INTO blog_settings (setting_key, setting_value)
     VALUES ('media_base_url', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [TO],
  );
  console.log(`Updated ${updated} posts. media_base_url set to ${TO}`);
} else {
  console.log(`\nRun without --dry-run to update ${rows.length} posts.`);
}

await conn.end();
