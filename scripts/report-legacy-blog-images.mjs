/**
 * Report all legacy blog image URL patterns still in DB.
 * Run: npm run report:legacy-blog-images
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

const patterns = [
  { name: "blog.tech2globe.com (featured)", sql: "featured_image LIKE '%blog.tech2globe.com%'" },
  { name: "tech2globe.com/blog (featured)", sql: "featured_image LIKE '%tech2globe.com/blog%'" },
  { name: "cloudinary (featured)", sql: "featured_image LIKE '%res.cloudinary.com%'" },
  { name: "empty featured", sql: "(featured_image IS NULL OR featured_image = '') AND status='publish'" },
  { name: "blog.tech2globe.com (content)", sql: "content LIKE '%blog.tech2globe.com%'" },
  { name: "tech2globe.com/blog (content)", sql: "content LIKE '%tech2globe.com/blog%'" },
];

console.log("Blog image URL report\n");
for (const p of patterns) {
  const [[row]] = await conn.query(`SELECT COUNT(*) AS c FROM blog_posts WHERE ${p.sql}`);
  console.log(`  ${p.name}: ${row.c}`);
}

const [samples] = await conn.query(
  `SELECT id, slug, featured_image FROM blog_posts
   WHERE featured_image LIKE '%tech2globe.com/blog%'
      OR featured_image LIKE '%blog.tech2globe.com%'
   LIMIT 8`,
);
if (samples.length) {
  console.log("\nSample posts still on legacy hosts:");
  samples.forEach((r) =>
    console.log(`  - [${r.id}] ${r.slug}\n    ${r.featured_image}`),
  );
} else {
  console.log("\nNo legacy featured_image URLs — good.");
}

await conn.end();
