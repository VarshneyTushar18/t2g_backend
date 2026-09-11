/**
 * Import published WordPress posts (+ Yoast SEO + tags) → blog DB (BLOG_DB_NAME).
 *
 * Usage (after WordPress DB dump is on MySQL):
 *   npm run migrate:blog
 *   npm run set:blog-settings
 *   npm run import:wp-blog
 *
 * Optional .env:
 *   WP_DB_NAME=buynfqw4_blogstech
 *   WP_TABLE_PREFIX=wp_
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const WP_DB = process.env.WP_DB_NAME || "buynfqw4_blogstech";
const WP_PREFIX = process.env.WP_TABLE_PREFIX || "wp_";

const YOAST_KEYS = [
  "_yoast_wpseo_title",
  "_yoast_wpseo_metadesc",
  "_yoast_wpseo_canonical",
  "_yoast_wpseo_focuskw",
  "_yoast_wpseo_meta-robots-noindex",
  "_yoast_wpseo_meta-robots-nofollow",
  "_yoast_wpseo_opengraph-title",
  "_yoast_wpseo_opengraph-description",
  "_yoast_wpseo_opengraph-image",
  "_yoast_wpseo_twitter-title",
  "_yoast_wpseo_twitter-description",
  "_yoast_wpseo_twitter-image",
];

const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function mapYoastToSeo(meta = {}) {
  const noindex = meta["_yoast_wpseo_meta-robots-noindex"];
  const nofollow = meta["_yoast_wpseo_meta-robots-nofollow"];
  return {
    meta_title: meta["_yoast_wpseo_title"] || null,
    meta_description: meta["_yoast_wpseo_metadesc"] || null,
    focus_keyword: meta["_yoast_wpseo_focuskw"] || null,
    canonical_url: meta["_yoast_wpseo_canonical"] || null,
    robots_noindex: noindex === "1" || noindex === 1 ? 1 : 0,
    robots_nofollow: nofollow === "1" || nofollow === 1 ? 1 : 0,
    og_title: meta["_yoast_wpseo_opengraph-title"] || null,
    og_description: meta["_yoast_wpseo_opengraph-description"] || null,
    og_image: meta["_yoast_wpseo_opengraph-image"] || null,
    twitter_title: meta["_yoast_wpseo_twitter-title"] || null,
    twitter_description: meta["_yoast_wpseo_twitter-description"] || null,
    twitter_image: meta["_yoast_wpseo_twitter-image"] || null,
  };
}

async function loadPostMeta(wp, metaTable, postIds) {
  const byPost = new Map();
  if (!postIds.length) return byPost;

  const chunk = 400;
  const keys = [...YOAST_KEYS, "_thumbnail_id"];

  for (let i = 0; i < postIds.length; i += chunk) {
    const ids = postIds.slice(i, i + chunk);
    const [rows] = await wp.query(
      `SELECT post_id, meta_key, meta_value FROM ${metaTable}
       WHERE post_id IN (?) AND meta_key IN (?)`,
      [ids, keys],
    );
    for (const row of rows) {
      if (!byPost.has(row.post_id)) byPost.set(row.post_id, {});
      byPost.get(row.post_id)[row.meta_key] = row.meta_value;
    }
  }
  return byPost;
}

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
  const metaTable = `${WP_PREFIX}postmeta`;
  const termsTable = `${WP_PREFIX}terms`;
  const ttTable = `${WP_PREFIX}term_taxonomy`;
  const trTable = `${WP_PREFIX}term_relationships`;

  console.log(`Source: ${WP_DB}.${postsTable}`);
  console.log(`Target: ${blogDbName}.blog_posts (with Yoast SEO + tags)`);

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
    `SELECT ID, post_author, post_title, post_name, post_content, post_excerpt, post_status, post_date, post_modified
     FROM ${postsTable}
     WHERE post_type = 'post' AND post_status = 'publish'
     ORDER BY post_date DESC`,
  );

  const metaByPost = await loadPostMeta(
    wp,
    metaTable,
    wpPosts.map((p) => p.ID),
  );

  const [wpTerms] = await wp.query(
    `SELECT t.term_id, t.name, t.slug, tt.taxonomy
     FROM ${termsTable} t
     INNER JOIN ${ttTable} tt ON tt.term_id = t.term_id
     WHERE tt.taxonomy IN ('category', 'post_tag')`,
  );

  const categoryMap = new Map();
  for (const term of wpTerms.filter((t) => t.taxonomy === "category")) {
    const slug = term.slug || slugify(term.name);
    const [existing] = await app.query(
      "SELECT id FROM blog_categories WHERE slug = ? LIMIT 1",
      [slug],
    );
    if (existing.length) {
      categoryMap.set(term.term_id, existing[0].id);
      continue;
    }
    const [ins] = await app.query(
      "INSERT INTO blog_categories (name, slug) VALUES (?, ?)",
      [term.name, slug],
    );
    categoryMap.set(term.term_id, ins.insertId);
  }
  console.log(`Categories synced: ${categoryMap.size}`);

  const tagNameByTermId = new Map(
    wpTerms.filter((t) => t.taxonomy === "post_tag").map((t) => [t.term_id, t.name]),
  );

  let imported = 0;
  let skipped = 0;
  let seoImported = 0;

  for (const row of wpPosts) {
    const slug = row.post_name || slugify(row.post_title);
    if (!slug) {
      skipped++;
      continue;
    }

    const [exists] = await app.query(
      "SELECT id FROM blog_posts WHERE slug = ? LIMIT 1",
      [slug],
    );
    if (exists.length) {
      skipped++;
      continue;
    }

    const meta = metaByPost.get(row.ID) || {};
    const seo = mapYoastToSeo(meta);

    let featuredImage = null;
    if (meta["_thumbnail_id"]) {
      const [[thumb]] = await wp.query(
        `SELECT guid FROM ${postsTable} WHERE ID = ? LIMIT 1`,
        [meta["_thumbnail_id"]],
      );
      featuredImage = thumb?.guid || null;
    }
    if (!seo.og_image && featuredImage) seo.og_image = featuredImage;
    if (!seo.twitter_image && featuredImage) seo.twitter_image = featuredImage;

    const hasYoast = Object.values(seo).some(
      (v) => v !== null && v !== 0 && v !== "",
    );
    if (hasYoast) seoImported++;

    const [tagRels] = await wp.query(
      `SELECT tt.term_id FROM ${trTable} tr
       INNER JOIN ${ttTable} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
       WHERE tr.object_id = ? AND tt.taxonomy = 'post_tag'`,
      [row.ID],
    );
    const tags = tagRels
      .map((r) => tagNameByTermId.get(r.term_id))
      .filter(Boolean);

    const authorName =
      authorByUserId.get(Number(row.post_author)) || "Tech2globe";

    const [ins] = await app.query(
      `INSERT INTO blog_posts
        (title, slug, excerpt, content, featured_image,
         meta_title, meta_description, focus_keyword, canonical_url,
         robots_noindex, robots_nofollow,
         og_title, og_description, og_image,
         twitter_title, twitter_description, twitter_image,
         tags, status, author_name, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publish', ?, ?)`,
      [
        row.post_title,
        slug,
        row.post_excerpt || "",
        row.post_content,
        featuredImage,
        seo.meta_title,
        seo.meta_description,
        seo.focus_keyword,
        seo.canonical_url,
        seo.robots_noindex,
        seo.robots_nofollow,
        seo.og_title,
        seo.og_description,
        seo.og_image,
        seo.twitter_title,
        seo.twitter_description,
        seo.twitter_image,
        JSON.stringify(tags),
        authorName,
        row.post_date,
      ],
    );

    const postId = ins.insertId;

    const [catRels] = await wp.query(
      `SELECT tt.term_id FROM ${trTable} tr
       INNER JOIN ${ttTable} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
       WHERE tr.object_id = ? AND tt.taxonomy = 'category'`,
      [row.ID],
    );

    for (const rel of catRels) {
      const catId = categoryMap.get(rel.term_id);
      if (!catId) continue;
      await app.query(
        "INSERT IGNORE INTO blog_post_categories (post_id, category_id) VALUES (?, ?)",
        [postId, catId],
      );
    }

    imported++;
  }

  console.log(`Done. Imported: ${imported}, with Yoast SEO: ${seoImported}, skipped: ${skipped}`);
  await wp.end();
  await app.end();
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
