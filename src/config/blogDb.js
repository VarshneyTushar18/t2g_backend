import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Blog-only database (separate from main app DB).
 * Main DB (leads, auth, portfolio, …) → config/db.js
 *
 * Uses BLOG_DB_* from .env. Falls back to DB_HOST/USER/PASSWORD only for host credentials,
 * never uses DB_NAME for the blog database name.
 */
const blogPool = mysql.createPool({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
  port: Number(process.env.BLOG_DB_PORT || process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

let blogDbReady = false;

export const isBlogDbReady = () => blogDbReady;

/** Non-fatal: other API modules keep working if blog DB is down. */
export const testBlogDBConnection = async () => {
  try {
    const connection = await blogPool.getConnection();
    const dbName = process.env.BLOG_DB_NAME || "tech2globe_blog";
    console.log(`Blog MySQL connected (${dbName})`);
    connection.release();
    blogDbReady = true;
    return true;
  } catch (error) {
    blogDbReady = false;
    console.warn(
      "Blog MySQL not available — /api/blog will return 503. Other modules are unaffected.",
    );
    console.warn(`  → ${error.message}`);
    console.warn("  → Set BLOG_DB_* in .env and run: npm run migrate:blog");
    return false;
  }
};

export default blogPool;
