import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "tech2globe",
});

const [[total]] = await conn.query(
  "SELECT COUNT(*) AS c FROM blog_posts WHERE status='publish'",
);
const [[bad]] = await conn.query(
  `SELECT COUNT(*) AS c FROM blog_posts WHERE status='publish' 
   AND featured_image IS NOT NULL AND featured_image != ''
   AND featured_image NOT LIKE '%/wp-content/uploads/%'`,
);
const [[empty]] = await conn.query(
  `SELECT COUNT(*) AS c FROM blog_posts WHERE status='publish' 
   AND (featured_image IS NULL OR featured_image = '')`,
);
const [badSamples] = await conn.query(
  `SELECT featured_image FROM blog_posts 
   WHERE featured_image IS NOT NULL AND featured_image != ''
   AND featured_image NOT LIKE '%/wp-content/uploads/%' LIMIT 5`,
);

console.log("Published:", total.c);
console.log("Empty featured_image:", empty.c);
console.log("Bad featured_image (not uploads path):", bad.c);
console.log("Bad samples:", badSamples.map((r) => r.featured_image));

await conn.end();
