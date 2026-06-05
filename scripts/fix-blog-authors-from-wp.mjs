/**
 * Backfill blog_posts.author_name from WordPress wp_users (by post slug).
 * Run after import if authors were all "Tech2globe".
 *
 *   npm run fix:blog-authors
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const WP_DB = process.env.WP_DB_NAME || "buynfqw4_blogstech";
const WP_PREFIX = process.env.WP_TABLE_PREFIX || "wp_";

async function main() {
  const wp = await mysql.createConnection({
    host: process.env.WP_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.WP_DB_USER || process.env.DB_USER || "root",
    password: process.env.WP_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: WP_DB,
    port: Number(process.env.WP_DB_PORT || process.env.DB_PORT || 3306),
  });

  const blogDbName = process.env.BLOG_DB_NAME || "tech2globe_blog";
  const app = await mysql.createConnection({
    host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
    password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: blogDbName,
    port: Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306),
  });

  const postsTable = `${WP_PREFIX}posts`;
  const usersTable = `${WP_PREFIX}users`;

  const [wpUsers] = await wp.query(
    `SELECT ID, display_name, user_nicename FROM ${usersTable}`,
  );
  const authorByUserId = new Map(
    wpUsers.map((u) => [
      u.ID,
      (u.display_name || u.user_nicename || "").trim() || "Tech2globe",
    ]),
  );

  const [wpPosts] = await wp.query(
    `SELECT post_name, post_author FROM ${postsTable}
     WHERE post_type = 'post' AND post_status = 'publish'`,
  );

  const authorBySlug = new Map();
  for (const row of wpPosts) {
    if (!row.post_name) continue;
    authorBySlug.set(
      row.post_name,
      authorByUserId.get(Number(row.post_author)) || "Tech2globe",
    );
  }

  const [blogPosts] = await app.query("SELECT id, slug, author_name FROM blog_posts");
  let updated = 0;

  for (const post of blogPosts) {
    const author = authorBySlug.get(post.slug);
    if (!author || author === post.author_name) continue;
    await app.query("UPDATE blog_posts SET author_name = ? WHERE id = ?", [
      author,
      post.id,
    ]);
    updated++;
  }

  console.log(`Matched ${authorBySlug.size} WordPress posts`);
  console.log(`Updated author_name on ${updated} blog posts in ${blogDbName}`);

  await wp.end();
  await app.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
