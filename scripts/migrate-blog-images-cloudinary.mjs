/**
 * Upload legacy blog images to Cloudinary and rewrite URLs in blog_posts.
 *
 * Handles:
 *   - https://blog.tech2globe.com/wp-content/...
 *   - https://tech2globe.com/blog/wp-content/...
 *   - https://www.tech2globe.com/wp-content/... (if still in DB)
 *
 * Usage:
 *   node scripts/migrate-blog-images-cloudinary.mjs --dry-run
 *   node scripts/migrate-blog-images-cloudinary.mjs --featured-only
 *   node scripts/migrate-blog-images-cloudinary.mjs
 *   node scripts/migrate-blog-images-cloudinary.mjs --limit=10
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import axios from "axios";
import sharp from "sharp";
import dotenv from "dotenv";
import cloudinary from "../src/config/cloudinary.js";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const featuredOnly = process.argv.includes("--featured-only");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const LEGACY_SQL = `(
  featured_image LIKE '%blog.tech2globe.com%'
  OR content LIKE '%blog.tech2globe.com%'
  OR og_image LIKE '%blog.tech2globe.com%'
  OR twitter_image LIKE '%blog.tech2globe.com%'
  OR featured_image LIKE '%tech2globe.com/blog%'
  OR content LIKE '%tech2globe.com/blog%'
  OR og_image LIKE '%tech2globe.com/blog%'
  OR featured_image LIKE '%res.cloudinary.com/wp-content%'
  OR content LIKE '%res.cloudinary.com/wp-content%'
  OR og_image LIKE '%res.cloudinary.com/wp-content%'
  OR twitter_image LIKE '%res.cloudinary.com/wp-content%'
)`;

const IMG_IN_HTML =
  /https?:\/\/(?:blog\.tech2globe\.com|(?:www\.)?tech2globe\.com\/blog)\/wp-content\/uploads\/[^"'\s)]+/gi;

const isLegacyUrl = (url = "") =>
  /blog\.tech2globe\.com/i.test(url) ||
  /tech2globe\.com\/blog\/wp-content/i.test(url);

function collectUrls(row, set) {
  for (const field of ["featured_image", "og_image", "twitter_image"]) {
    const v = row[field];
    if (v && isLegacyUrl(v)) set.add(v.trim());
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

/** Try alternate hosts for the same wp-content path. */
function fetchCandidates(url) {
  const candidates = [url];
  const m = url.match(/\/wp-content\/uploads\/.+$/i);
  if (!m) return candidates;

  const pathPart = m[0];
  const altHosts = [
    `https://blog.tech2globe.com${pathPart}`,
    `https://tech2globe.com/blog${pathPart}`,
    `https://www.tech2globe.com${pathPart}`,
  ];
  for (const alt of altHosts) {
    if (!candidates.includes(alt)) candidates.push(alt);
  }
  return candidates;
}

async function downloadBuffer(url) {
  const candidates = fetchCandidates(url);
  let lastErr;
  for (const candidate of candidates) {
    try {
      const res = await axios.get(candidate, {
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
        validateStatus: (s) => s === 200,
      });
      return Buffer.from(res.data);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Could not download image from any host");
}

async function uploadBuffer(buffer, oldUrl) {
  const compressed = await sharp(buffer)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "tech2globe/blog",
        resource_type: "image",
        overwrite: false,
        unique_filename: true,
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result.secure_url);
      },
    );
    stream.end(compressed);
  });
}

async function uploadToCloudinary(remoteUrl) {
  try {
    const result = await cloudinary.uploader.upload(remoteUrl, {
      folder: "tech2globe/blog",
      resource_type: "image",
      overwrite: false,
      unique_filename: true,
    });
    return result.secure_url;
  } catch (err) {
    const tooLarge =
      /too large|File size|max.*10/i.test(err.message || "") ||
      err.http_code === 400;
    if (!tooLarge) throw err;

    const buffer = await downloadBuffer(remoteUrl);
    return uploadBuffer(buffer, remoteUrl);
  }
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
   WHERE ${LEGACY_SQL}
   ORDER BY id`,
);

const urlSet = new Set();
rows.forEach((r) => collectUrls(r, urlSet));
let urls = [...urlSet];
if (limit > 0) urls = urls.slice(0, limit);

const failLog = path.join(process.cwd(), "scripts", "blog-image-migration-failed.json");

console.log(`Posts to update: ${rows.length}`);
console.log(`Unique legacy image URLs: ${urlSet.size}`);
console.log(`Will process: ${urls.length}${featuredOnly ? " (featured/SEO only)" : ""}`);
if (dryRun) console.log("(dry run)\n");

const urlMap = new Map();
const failed = [];
let ok = 0;

for (const oldUrl of urls) {
  if (dryRun) {
    console.log(`  would upload: ${oldUrl.slice(0, 100)}`);
    continue;
  }

  try {
    process.stdout.write(`Uploading ${ok + failed.length + 1}/${urls.length}…\r`);
    const newUrl = await uploadToCloudinary(oldUrl);
    urlMap.set(oldUrl, newUrl);
    ok++;
  } catch (err) {
    failed.push({ url: oldUrl, error: err.message });
    console.error(`\nFailed: ${oldUrl}\n  ${err.message}`);
  }
}

if (!dryRun) {
  console.log(`\nUploaded ${ok}, failed ${failed.length}`);

  if (failed.length) {
    fs.writeFileSync(failLog, JSON.stringify(failed, null, 2));
    console.log(`Failed URLs saved to ${failLog}`);
  }

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
    [
      process.env.BLOG_MEDIA_BASE_URL ||
        process.env.SITE_URL ||
        process.env.CLIENT_URL_MAIN ||
        "https://www.tech2globe.com",
    ],
  );

  console.log(`Updated ${updated} posts in DB.`);
  console.log("Restart backend after migration.");
}

await conn.end();
