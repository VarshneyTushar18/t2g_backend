/**
 * Import Word (.docx) blog posts into the blog DB (publish on production).
 *
 * Files live in scripts/blog-imports/ (see posts.manifest.json).
 *
 * Usage:
 *   npm run import:docx-blogs -- --dry-run
 *   npm run import:docx-blogs
 *   npm run import:docx-blogs -- --slug=top-10-amazon-agencies-in-usa
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";
import sharp from "sharp";
import dotenv from "dotenv";
import cloudinary from "../src/config/cloudinary.js";
import { testBlogDBConnection } from "../src/config/blogDb.js";
import { ensureBlogTables } from "../src/modules/blog/blog.setup.js";
import * as model from "../src/modules/blog/blog.model.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = path.join(__dirname, "blog-imports");
const MANIFEST = path.join(IMPORT_DIR, "posts.manifest.json");
const DEFAULT_FEATURED =
  process.env.BLOG_DEFAULT_FEATURED_IMAGE ||
  "https://www.tech2globe.com/images/blog-bg.webp";

const dryRun = process.argv.includes("--dry-run");
const slugFilter = process.argv
  .find((a) => a.startsWith("--slug="))
  ?.split("=")[1];

const decodeHtml = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripHtml = (html = "") =>
  decodeHtml(
    String(html)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

const uploadFeatured = async (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return "";

  const buffer = await sharp(filePath)
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
    stream.end(buffer);
  });
};

const cleanContentHtml = (html = "") =>
  html
    .replace(
      /<p><em>By Tech2Globe Digital Team[^<]*<\/em><\/p>/i,
      "",
    )
    .trim();

const extractTitle = (html, fallback = "Untitled") => {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(h1[1]);
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2) return stripHtml(h2[1]);
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (p) return stripHtml(p[1]).slice(0, 120);
  return fallback;
};

const buildExcerpt = (html, max = 160) => {
  const text = stripHtml(html);
  const firstPara = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const excerpt = firstPara || text;
  return excerpt.length > max ? `${excerpt.slice(0, max - 1).trim()}…` : excerpt;
};

const ensureCategories = async (names = []) => {
  if (dryRun) {
    for (const name of names) {
      if (name?.trim()) console.log(`  [dry-run] category: ${name}`);
    }
    return [];
  }

  const existing = await model.getCategories();
  const byName = new Map(
    existing.map((c) => [c.name.toLowerCase(), c.id]),
  );
  const ids = [];

  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    if (byName.has(key)) {
      ids.push(byName.get(key));
      continue;
    }
    const created = await model.createCategory(name.trim());
    byName.set(key, created.id);
    ids.push(created.id);
    console.log(`  created category: ${name} (#${created.id})`);
  }

  return ids;
};

const slugExists = async (slug) => {
  const post = await model.getBySlug(slug);
  return Boolean(post);
};

async function importOne(entry) {
  const docxPath = path.join(IMPORT_DIR, entry.docx);
  if (!fs.existsSync(docxPath)) {
    throw new Error(`Missing docx: ${docxPath}`);
  }

  const { value: rawHtml } = await mammoth.convertToHtml({ path: docxPath });
  const content = cleanContentHtml(rawHtml);
  const title = entry.title || extractTitle(content, entry.slug);
  const excerpt = buildExcerpt(content);
  const wordCount = stripHtml(content).split(/\s+/).filter(Boolean).length;

  if (wordCount < 200) {
    console.warn(
      `  ⚠ Low word count (${wordCount}) for "${title}" — review content after import.`,
    );
  }

  const featuredPath = entry.featured
    ? path.join(IMPORT_DIR, entry.featured)
    : "";
  let featured_image = DEFAULT_FEATURED;

  if (featuredPath && fs.existsSync(featuredPath)) {
    if (dryRun) {
      console.log(`  [dry-run] would upload featured: ${featuredPath}`);
      featured_image = `(cloudinary upload for ${path.basename(featuredPath)})`;
    } else {
      featured_image = await uploadFeatured(featuredPath);
      console.log(`  featured image: ${featured_image}`);
    }
  } else if (!entry.featured) {
    console.log(`  using default featured image`);
  } else {
    console.warn(`  featured image missing: ${featuredPath}`);
  }

  const canonical = `https://www.tech2globe.com/blogs/${entry.slug}`;
  const seo = {
    meta_title: title.slice(0, 60),
    meta_description: excerpt,
    focus_keyword: entry.focus_keyword || "",
    canonical_url: canonical,
    og_title: title,
    og_description: excerpt,
    og_image: typeof featured_image === "string" ? featured_image : "",
    twitter_title: title,
    twitter_description: excerpt,
    twitter_image: typeof featured_image === "string" ? featured_image : "",
  };

  const payload = {
    title,
    slug: entry.slug,
    excerpt,
    content,
    status: entry.status || "publish",
    author_name: entry.author_name || "Tech2Globe Digital Team",
    featured_image: typeof featured_image === "string" ? featured_image : "",
    categories: await ensureCategories(entry.categories || []),
    seo,
    tags: entry.tags || [],
  };

  if (dryRun) {
    console.log(`  [dry-run] would create: ${payload.slug}`);
    console.log(`    title: ${payload.title}`);
    console.log(`    words: ${wordCount}`);
    return { dryRun: true, slug: payload.slug };
  }

  if (await slugExists(payload.slug)) {
    console.log(`  skip (slug exists): ${payload.slug}`);
    return { skipped: true, slug: payload.slug };
  }

  const created = await model.createPost(payload);
  console.log(`  ✓ published: /blogs/${created.slug} (id ${created.id})`);
  return created;
}

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`Manifest not found: ${MANIFEST}`);
  }

  const entries = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const selected = slugFilter
    ? entries.filter((e) => e.slug === slugFilter)
    : entries;

  if (!selected.length) {
    throw new Error(slugFilter ? `No manifest entry for slug: ${slugFilter}` : "No posts in manifest");
  }

  if (!dryRun) {
    const ok = await testBlogDBConnection();
    if (!ok) throw new Error("Blog DB not available — check BLOG_DB_* in .env");
    await ensureBlogTables();
  }

  console.log(
    dryRun
      ? `Dry run — ${selected.length} post(s)`
      : `Importing ${selected.length} post(s) to production blog DB…`,
  );

  for (const entry of selected) {
    console.log(`\n→ ${entry.docx}`);
    await importOne(entry);
  }

  console.log("\nDone.");
  if (!dryRun) {
    console.log("Verify: https://www.tech2globe.com/blogs");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
