import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const wp = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.WP_DB_NAME || "buynfqw4_blogstech",
});

const [byStatus] = await wp.query(
  "SELECT post_status, COUNT(*) AS n FROM wp_posts WHERE post_type = 'post' GROUP BY post_status ORDER BY n DESC",
);
const [published] = await wp.query(
  "SELECT COUNT(*) AS n FROM wp_posts WHERE post_type = 'post' AND post_status = 'publish'",
);
const [draft] = await wp.query(
  "SELECT COUNT(*) AS n FROM wp_posts WHERE post_type = 'post' AND post_status = 'draft'",
);
const [privatePosts] = await wp.query(
  "SELECT COUNT(*) AS n FROM wp_posts WHERE post_type = 'post' AND post_status = 'private'",
);

console.log("WordPress wp_posts (post_type = post):");
console.log("  Published (in Excel):", published[0].n);
console.log("  Draft (NOT in Excel):", draft[0].n);
console.log("  Private (NOT in Excel):", privatePosts[0].n);
console.log("  All statuses:");
for (const row of byStatus) console.log(`    ${row.post_status}: ${row.n}`);

await wp.end();
