/**
 * Repair URLs broken by setting media_base_url to bare res.cloudinary.com.
 * Converts: https://res.cloudinary.com/wp-content/... → https://blog.tech2globe.com/wp-content/...
 * Then re-run: node scripts/migrate-blog-images-cloudinary.mjs --featured-only
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");

function repair(text = "") {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/https?:\/\/res\.cloudinary\.com\/wp-content\//gi, "https://blog.tech2globe.com/wp-content/")
    .replace(/https?:\/\/res\.cloudinary\.com\/blogs\//gi, "https://www.tech2globe.com/blogs/");
}

const conn = await mysql.createConnection({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
});

const [rows] = await conn.query(
  `SELECT id, title, slug, featured_image, content, og_image, twitter_image, canonical_url
   FROM blog_posts
   WHERE featured_image LIKE '%res.cloudinary.com/wp-content%'
      OR content LIKE '%res.cloudinary.com/wp-content%'
      OR og_image LIKE '%res.cloudinary.com/wp-content%'
      OR twitter_image LIKE '%res.cloudinary.com/wp-content%'
      OR canonical_url LIKE '%res.cloudinary.com/blogs%'`,
);

console.log(`Malformed URLs found: ${rows.length}`);
if (dryRun) console.log("(dry run)\n");

for (const row of rows) {
  const featured_image = repair(row.featured_image || "");
  const content = repair(row.content || "");
  const og_image = repair(row.og_image || "");
  const twitter_image = repair(row.twitter_image || "");
  const canonical_url = repair(row.canonical_url || "");

  console.log(`- [${row.id}] ${row.slug}`);
  if (row.featured_image !== featured_image) {
    console.log(`    featured: ${featured_image.slice(0, 90)}…`);
  }

  if (!dryRun) {
    await conn.query(
      `UPDATE blog_posts
       SET featured_image = ?, content = ?, og_image = ?, twitter_image = ?, canonical_url = ?
       WHERE id = ?`,
      [
        featured_image || null,
        content,
        og_image || null,
        twitter_image || null,
        canonical_url || null,
        row.id,
      ],
    );
  }
}

if (!dryRun) {
  await conn.query(
    `INSERT INTO blog_settings (setting_key, setting_value)
     VALUES ('media_base_url', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [
      process.env.BLOG_MEDIA_BASE_URL ||
        process.env.SITE_URL ||
        "https://www.tech2globe.com",
    ],
  );
  console.log("\nFixed. media_base_url reset to www.tech2globe.com");
  console.log("Next: node scripts/migrate-blog-images-cloudinary.mjs --featured-only");
}

await conn.end();
