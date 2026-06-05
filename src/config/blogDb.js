import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Blog-only database (separate from main app DB).
 * Main DB (testimonials, leads, auth, …) → config/db.js
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

export const testBlogDBConnection = async () => {
  try {
    const connection = await blogPool.getConnection();
    const dbName = process.env.BLOG_DB_NAME || "tech2globe_blog";
    console.log(`Blog MySQL connected (${dbName})`);
    connection.release();
  } catch (error) {
    console.error("Blog MySQL connection failed:", error.message);
    console.error("  → Create DB and run: npm run migrate:blog");
    process.exit(1);
  }
};

export default blogPool;
