import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "tech2globe",
});

const [rows] = await conn.query(
  `SELECT slug, featured_image, content FROM blog_posts 
   WHERE status='publish' AND featured_image LIKE '%uploads%' 
   ORDER BY published_at DESC LIMIT 1`,
);

const row = rows[0];
console.log("Slug:", row.slug);
console.log("Featured:", row.featured_image);
const imgMatch = row.content?.match(/<img[^>]+src=["']([^"']+)["']/i);
console.log("First content img:", imgMatch?.[1] || "none");
const relMatch = row.content?.match(/src=["'](\/wp-content[^"']+)["']/i);
console.log("Relative wp-content img:", relMatch?.[1] || "none");

const [r2] = await conn.query(
  "SELECT content FROM blog_posts WHERE slug = ?",
  ["amazon-marketing-agencies-product-visibility"],
);
const html = r2[0]?.content || "";
const allSrc = [...html.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1]);
console.log("\nAll img src in sample post:", allSrc.slice(0, 8));
console.log("Has <img:", html.includes("<img"));
console.log("Has wp-content:", html.includes("wp-content"));
console.log("Snippet:", html.slice(0, 400).replace(/\s+/g, " "));

await conn.end();
