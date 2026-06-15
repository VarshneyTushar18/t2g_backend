/**
 * Upload legacy blog images to Cloudinary and rewrite URLs in blog_posts.
 *
 * Requires: blog DB imported, Cloudinary env vars, blog.tech2globe.com still reachable
 * (or use wp-content files copied locally with --from-disk).
 *
 * Usage:
 *   node scripts/migrate-blog-images-cloudinary.mjs --dry-run
 *   node scripts/migrate-blog-images-cloudinary.mjs --featured-only
 *   node scripts/migrate-blog-images-cloudinary.mjs
 *   node scripts/migrate-blog-images-cloudinary.mjs --limit=10
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import cloudinary from "../src/config/cloudinary.js";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const featuredOnly = process.argv.includes("--featured-only");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const LEGACY_HOST = /blog\.tech2globe\.com/i;
const IMG_IN_HTML = /https?:\/\/blog\.tech2globe\.com\/wp-content\/uploads\/[^"'\s)]+/gi;

function collectUrls(row, set) {
  for (const field of ["featured_image", "og_image", "twitter_image"]) {
    const v = row[field];
    if (v && LEGACY_HOST.test(v)) set.add(v.trim());
  }
  if (!featuredOnly && row.content) {
    const matches = row.content.match(IMG_IN_HTML) || [];
    matches.forEach((u) => set.add(u.trim()));
  }
}

function replaceUrls(text, map) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const [from, to] of map) {
    out = out.split(from).join(to);
  }
  return out;
}

async function uploadToCloudinary(remoteUrl) {
  const result = await cloudinary.uploader.upload(remoteUrl, {
    folder: "tech2globe/blog",
    resource_type: "image",
    overwrite: false,
    unique_filename: true,
  });
  return result.secure_url;
}

const conn = await mysql.createConnection({
  host: process.env.BLOG_DB_HOST || process.env.DB_HOST || "localhost",
  user: process.env.BLOG_DB_USER || process.env.DB_USER || "root",
  password: process.env.BLOG_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: process.env.BLOG_DB_NAME || "tech2globe_blog",
});

const [rows] = await conn.query(
  `SELECT id, title, featured_image, content, og_image, twitter_image
   FROM blog_posts
   WHERE featured_image LIKE '%blog.tech2globe.com%'
      OR content LIKE '%blog.tech2globe.com%'
      OR og_image LIKE '%blog.tech2globe.com%'
      OR twitter_image LIKE '%blog.tech2globe.com%'
   ORDER BY id`,
);

const urlSet = new Set();
rows.forEach((r) => collectUrls(r, urlSet));
let urls = [...urlSet];
if (limit > 0) urls = urls.slice(0, limit);

console.log(`Posts to update: ${rows.length}`);
console.log(`Unique legacy image URLs: ${urlSet.size}`);
console.log(`Will process: ${urls.length}${featuredOnly ? " (featured/SEO only)" : ""}`);
if (dryRun) console.log("(dry run)\n");

const urlMap = new Map();
let ok = 0;
let fail = 0;

for (const oldUrl of urls) {
  if (dryRun) {
    console.log(`  would upload: ${oldUrl.slice(0, 90)}…`);
    urlMap.set(oldUrl, oldUrl.replace(LEGACY_HOST, "res.cloudinary.com/..."));
    continue;
  }

  try {
    process.stdout.write(`Uploading ${ok + fail + 1}/${urls.length}…\r`);
    const newUrl = await uploadToCloudinary(oldUrl);
    urlMap.set(oldUrl, newUrl);
    ok++;
  } catch (err) {
    fail++;
    console.error(`\nFailed: ${oldUrl}\n  ${err.message}`);
  }
}

if (!dryRun) {
  console.log(`\nUploaded ${ok}, failed ${fail}`);

  let updated = 0;
  for (const row of rows) {
    const featured_image = replaceUrls(row.featured_image || "", urlMap);
    const content = replaceUrls(row.content || "", urlMap);
    const og_image = replaceUrls(row.og_image || "", urlMap);
    const twitter_image = replaceUrls(row.twitter_image || "", urlMap);

    const changed =
      featured_image !== (row.featured_image || "") ||
      content !== (row.content || "") ||
      og_image !== (row.og_image || "") ||
      twitter_image !== (row.twitter_image || "");

    if (!changed) continue;

    await conn.query(
      `UPDATE blog_posts
       SET featured_image = ?, content = ?, og_image = ?, twitter_image = ?
       WHERE id = ?`,
      [
        featured_image || null,
        content,
        og_image || null,
        twitter_image || null,
        row.id,
      ],
    );
    updated++;
  }

  await conn.query(
    `INSERT INTO blog_settings (setting_key, setting_value)
     VALUES ('media_base_url', ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    ["https://res.cloudinary.com"],
  );

  console.log(`Updated ${updated} posts in DB.`);
  console.log("Restart backend after migration.");
}

await conn.end();
