import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const jsonPath = "e:/blog db/tech2globe-blog/content/posts-index.json";

if (fs.existsSync(jsonPath)) {
  const index = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  console.log("tech2globe-blog (JSON):", index.length, "posts");
}

try {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "tech2globe",
  });

  const [tables] = await conn.query("SHOW TABLES LIKE 'blog_posts'");
  if (!tables.length) {
    console.log("Backend blog_posts: table not found");
  } else {
    const [total] = await conn.query("SELECT COUNT(*) AS n FROM blog_posts");
    const [byStatus] = await conn.query(
      "SELECT status, COUNT(*) AS n FROM blog_posts GROUP BY status",
    );
    console.log("Backend blog_posts total:", total[0].n);
    for (const row of byStatus) {
      console.log(`  - ${row.status}: ${row.n}`);
    }
  }

  await conn.end();
} catch (err) {
  console.log("Backend DB:", err.message);
}
