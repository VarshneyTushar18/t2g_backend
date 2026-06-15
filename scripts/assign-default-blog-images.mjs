/**
 * Set default featured image on posts that still have broken/missing image URLs.
 * Run: npm run assign:default-blog-images
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_IMAGE =
  process.env.BLOG_DEFAULT_FEATURED_IMAGE ||
  "https://www.tech2globe.com/images/blog-bg.webp";

const dryRun = process.argv.includes("--dry-run");

const conn = await mysql.createConnection({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
});

const [rows] = await conn.query(
  `SELECT id, slug, title, featured_image FROM blog_posts
   WHERE status = 'publish' AND (
     featured_image IS NULL OR featured_image = ''
     OR featured_image LIKE '%blog.tech2globe.com%'
     OR featured_image LIKE '%tech2globe.com/blog%'
     OR featured_image LIKE '%www.tech2globe.com/wp-content%'
     OR featured_image LIKE '%res.cloudinary.com/wp-content%'
   )`,
);

console.log(`Posts with broken/missing featured image: ${rows.length}`);
if (dryRun) {
  rows.slice(0, 10).forEach((r) => console.log(`  - [${r.id}] ${r.slug}`));
  if (rows.length > 10) console.log(`  ... and ${rows.length - 10} more`);
} else {
  for (const row of rows) {
    await conn.query(
      `UPDATE blog_posts
       SET featured_image = ?, og_image = ?, twitter_image = ?
       WHERE id = ?`,
      [DEFAULT_IMAGE, DEFAULT_IMAGE, DEFAULT_IMAGE, row.id],
    );
  }
  console.log(`Updated ${rows.length} posts to use ${DEFAULT_IMAGE}`);
}

await conn.end();
