/**
 * Export blog SEO / migration data to one Excel workbook (multi-sheet).
 *
 * Sources (first available):
 *   1. MySQL buynfqw4_blogstech (WordPress dump)
 *   2. MySQL tech2globe / tech2globe_blog blog_posts
 *   3. tech2globe-blog/content/*.json
 *
 * Usage: npm install xlsx (once) && node scripts/export-blog-seo-excel.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import XLSX from "xlsx";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "exports");
const OUT_FILE = path.join(
  OUT_DIR,
  process.env.OUT_FILE_NAME || "blog-migration-seo-report.xlsx",
);
/** Old live blog (WordPress) — this is the source of all exported data */
const SITE_URL = process.env.WP_SITE_URL || "https://blog.tech2globe.com";
/** Optional future URL — leave empty until new blog is built; NOT tech2globe.com/blogs unless you deploy it */
const NEW_BASE = process.env.NEW_BLOG_BASE_URL || "";

const stripHtml = (html = "") =>
  String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractH1 = (html = "") => {
  const m = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripHtml(m[1]) : "";
};

const yoastKeys = [
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
  "_yoast_wpseo_schema_page_type",
  "_yoast_wpseo_schema_article_type",
];

async function getConnection(dbName) {
  return mysql.createConnection({
    host: process.env.WP_DB_HOST || process.env.DB_HOST || "localhost",
    user: process.env.WP_DB_USER || process.env.DB_USER || "root",
    password: process.env.WP_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: dbName,
    port: Number(process.env.WP_DB_PORT || process.env.DB_PORT || 3306),
  });
}

async function databaseExists(conn, name) {
  const [rows] = await conn.query("SHOW DATABASES LIKE ?", [name]);
  return rows.length > 0;
}

async function loadFromWordPress(wp) {
  const prefix = process.env.WP_TABLE_PREFIX || "wp_";
  const postsTable = `${prefix}posts`;
  const metaTable = `${prefix}postmeta`;
  const termsTable = `${prefix}terms`;
  const ttTable = `${prefix}term_taxonomy`;
  const trTable = `${prefix}term_relationships`;

  const [posts] = await wp.query(
    `SELECT ID, post_title, post_name, post_content, post_excerpt, post_status, post_date, post_modified, guid
     FROM ${postsTable}
     WHERE post_type = 'post' AND post_status = 'publish'
     ORDER BY post_date DESC`,
  );

  const postIds = posts.map((p) => p.ID);
  const metaByPost = new Map();
  if (postIds.length) {
    const chunk = 500;
    for (let i = 0; i < postIds.length; i += chunk) {
      const ids = postIds.slice(i, i + chunk);
      const [metaRows] = await wp.query(
        `SELECT post_id, meta_key, meta_value FROM ${metaTable}
         WHERE post_id IN (?) AND meta_key IN (?)`,
        [ids, [...yoastKeys, "_thumbnail_id"]],
      );
      for (const row of metaRows) {
        if (!metaByPost.has(row.post_id)) metaByPost.set(row.post_id, {});
        metaByPost.get(row.post_id)[row.meta_key] = row.meta_value;
      }
    }
  }

  const [termRows] = await wp.query(
    `SELECT tr.object_id AS post_id, t.name, tt.taxonomy
     FROM ${trTable} tr
     INNER JOIN ${ttTable} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
     INNER JOIN ${termsTable} t ON t.term_id = tt.term_id
     WHERE tt.taxonomy IN ('category', 'post_tag')`,
  );

  const termsByPost = new Map();
  for (const row of termRows) {
    if (!termsByPost.has(row.post_id)) {
      termsByPost.set(row.post_id, { categories: [], tags: [] });
    }
    const bucket = termsByPost.get(row.post_id);
    if (row.taxonomy === "category") bucket.categories.push(row.name);
    else bucket.tags.push(row.name);
  }

  const thumbIds = [
    ...new Set(
      posts
        .map((p) => metaByPost.get(p.ID)?._thumbnail_id)
        .filter(Boolean)
        .map(Number),
    ),
  ];

  const imagesById = new Map();
  if (thumbIds.length) {
    const [imgs] = await wp.query(
      `SELECT p.ID, p.guid, p.post_title,
              MAX(CASE WHEN pm.meta_key = '_wp_attached_file' THEN pm.meta_value END) AS file,
              MAX(CASE WHEN pm.meta_key = '_wp_attachment_image_alt' THEN pm.meta_value END) AS alt
       FROM ${postsTable} p
       LEFT JOIN ${metaTable} pm ON pm.post_id = p.ID
         AND pm.meta_key IN ('_wp_attached_file', '_wp_attachment_image_alt')
       WHERE p.ID IN (?)
       GROUP BY p.ID, p.guid, p.post_title`,
      [thumbIds],
    );
    for (const img of imgs) {
      const url = img.file
        ? `${SITE_URL}/wp-content/uploads/${img.file}`
        : img.guid;
      imagesById.set(img.ID, { url, alt: img.alt || img.post_title || "" });
    }
  }

  return posts.map((p) => {
    const meta = metaByPost.get(p.ID) || {};
    const terms = termsByPost.get(p.ID) || { categories: [], tags: [] };
    const thumbId = Number(meta._thumbnail_id) || 0;
    const img = imagesById.get(thumbId) || { url: "", alt: "" };
    const oldUrl = `${SITE_URL}/${p.post_name}/`;
    const newUrl = NEW_BASE ? `${NEW_BASE.replace(/\/$/, "")}/${p.post_name}` : "";
    const noindex = meta["_yoast_wpseo_meta-robots-noindex"] === "1";
    const nofollow = meta["_yoast_wpseo_meta-robots-nofollow"] === "1";
    const m = (key) => meta[key] || "";

    return {
      wp_id: p.ID,
      slug: p.post_name,
      post_title: p.post_title,
      post_date: p.post_date,
      post_modified: p.post_modified,
      old_url: oldUrl,
      new_url: newUrl,
      seo_title: m("_yoast_wpseo_title") || p.post_title,
      meta_description: m("_yoast_wpseo_metadesc") || stripHtml(p.post_excerpt),
      h1: extractH1(p.post_content) || p.post_title,
      canonical: m("_yoast_wpseo_canonical") || oldUrl,
      index_status: noindex ? "noindex" : "index",
      follow_status: nofollow ? "nofollow" : "follow",
      focus_keyword: m("_yoast_wpseo_focuskw"),
      categories: terms.categories.join(", "),
      tags: terms.tags.join(", "),
      featured_image_url: img.url,
      featured_image_alt: img.alt,
      og_title: m("_yoast_wpseo_opengraph-title"),
      og_description: m("_yoast_wpseo_opengraph-description"),
      og_image: m("_yoast_wpseo_opengraph-image") || img.url,
      twitter_title: m("_yoast_wpseo_twitter-title"),
      twitter_description: m("_yoast_wpseo_twitter-description"),
      twitter_image: m("_yoast_wpseo_twitter-image") || img.url,
      schema_page_type: m("_yoast_wpseo_schema_page_type"),
      schema_article_type: m("_yoast_wpseo_schema_article_type"),
      sitemap_status: noindex ? "Exclude from sitemap" : "Include in sitemap",
    };
  });
}

async function loadFromJson() {
  const jsonDir = "e:/blog db/tech2globe-blog/content/posts";
  const indexPath = "e:/blog db/tech2globe-blog/content/posts-index.json";
  if (!fs.existsSync(indexPath)) return null;

  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return index.map((p) => {
    let full = {};
    const fp = path.join(jsonDir, `${p.slug}.json`);
    if (fs.existsSync(fp)) full = JSON.parse(fs.readFileSync(fp, "utf8"));

    const oldUrl = full.link || `${SITE_URL}/${p.slug}/`;
    return {
      wp_id: p.id,
      slug: p.slug,
      post_title: p.title,
      post_date: p.date,
      post_modified: full.modified || p.date,
      old_url: oldUrl,
      new_url: NEW_BASE ? `${NEW_BASE.replace(/\/$/, "")}/${p.slug}` : "",
      seo_title: p.title,
      meta_description: p.excerpt || "",
      h1: p.title,
      canonical: oldUrl,
      index_status: "index",
      follow_status: "follow",
      focus_keyword: "",
      categories: (p.categories || []).map((c) => c.name).join(", "),
      tags: (p.tags || []).map((t) => t.name).join(", "),
      featured_image_url: p.featuredImage || full.featuredImage || "",
      featured_image_alt: p.title,
      og_title: "",
      og_description: "",
      og_image: p.featuredImage || "",
      twitter_title: "",
      twitter_description: "",
      twitter_image: p.featuredImage || "",
      schema_page_type: "",
      schema_article_type: "",
      sitemap_status: "Include in sitemap",
    };
  });
}

function sheetFromRows(rows, headers) {
  const data = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
  return XLSX.utils.aoa_to_sheet(data);
}

function buildWorkbook(rows) {
  const urlMapping = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Live URL (blog.tech2globe.com)": r.old_url,
    "Future URL (fill when ready)": r.new_url || "",
    "Redirect Required": r.new_url && r.old_url !== r.new_url ? "Yes" : "TBD",
    "Post Date": r.post_date,
    "Last Modified": r.post_modified,
  }));

  const titleMeta = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Post Title": r.post_title,
    "SEO Title (Yoast)": r.seo_title,
    "Meta Description": r.meta_description,
    H1: r.h1,
    "Old URL": r.old_url,
  }));

  const canonical = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Canonical URL": r.canonical,
    "Old URL": r.old_url,
    "Matches Old URL?": r.canonical === r.old_url || !r.canonical ? "Yes" : "Review",
  }));

  const indexNoindex = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Index / Noindex": r.index_status,
    "Follow / Nofollow": r.follow_status,
    "Old URL": r.old_url,
  }));

  const keywords = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Focus Keyword": r.focus_keyword,
    "Post Title": r.post_title,
  }));

  const categoriesTags = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    Categories: r.categories,
    Tags: r.tags,
  }));

  const images = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Featured Image URL": r.featured_image_url,
    "Featured Image Alt Text": r.featured_image_alt,
    "Alt Missing?": r.featured_image_url && !r.featured_image_alt ? "Yes" : "No",
  }));

  const schema = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Schema Page Type": r.schema_page_type,
    "Schema Article Type": r.schema_article_type,
  }));

  const social = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "OG Title": r.og_title,
    "OG Description": r.og_description,
    "OG Image": r.og_image,
    "Twitter Title": r.twitter_title,
    "Twitter Description": r.twitter_description,
    "Twitter Image": r.twitter_image,
  }));

  const sitemap = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Sitemap Status": r.sitemap_status,
    "Old URL": r.old_url,
  }));

  const externalPlaceholder = (title, notes) =>
    rows.slice(0, 1).map(() => ({
      Note: title,
      Instructions: notes,
      "Total Posts": rows.length,
    }));

  const checklistItems = [
    "URL Mapping",
    "Title, Meta Description, H1",
    "Canonical Tags",
    "Index/Noindex",
    "Keywords",
    "Categories & Tags",
    "Images & Alt Text",
    "Schema Markup",
    "Open Graph & Twitter Tags",
    "Sitemap Status",
    "Traffic & Rankings checking",
    "Backlinks",
    "Post-Migration Validation",
    "SEO score checking",
    "Redirect testing status",
    "Search Console validation",
    "GA4 traffic backup",
    "Automated migration checklist",
  ];

  const overview = [
    ["Blog Migration & SEO Data Export"],
    ["Generated", new Date().toISOString()],
    ["Total published posts", rows.length],
    ["Live blog site (source)", SITE_URL],
    ["Future URL base (optional)", NEW_BASE || "(not set — all data is from blog.tech2globe.com)"],
    [],
    ["This workbook includes:"],
    ...checklistItems.map((item) => [item]),
    [],
    ["Sheets with data from database:"],
    ["1 URL Mapping", "2 Title Meta H1", "3 Canonical", "4 Index Noindex", "5 Keywords"],
    ["6 Categories Tags", "7 Images Alt", "8 Schema", "9 OG Twitter", "10 Sitemap"],
    [],
    ["Manual / external tools required:"],
    ["11 Traffic Rankings", "12 Backlinks", "13-18 Post-migration validation sheets"],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), "Overview");
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(urlMapping, Object.keys(urlMapping[0] || {})),
    "1 URL Mapping",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(titleMeta, Object.keys(titleMeta[0] || {})),
    "2 Title Meta H1",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(canonical, Object.keys(canonical[0] || {})),
    "3 Canonical",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(indexNoindex, Object.keys(indexNoindex[0] || {})),
    "4 Index Noindex",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(keywords, Object.keys(keywords[0] || {})),
    "5 Keywords",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(categoriesTags, Object.keys(categoriesTags[0] || {})),
    "6 Categories Tags",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(images, Object.keys(images[0] || {})),
    "7 Images Alt",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(schema, Object.keys(schema[0] || {})),
    "8 Schema",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(social, Object.keys(social[0] || {})),
    "9 OG Twitter",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(sitemap, Object.keys(sitemap[0] || {})),
    "10 Sitemap",
  );

  const manualNote =
    "Export from Google Search Console, GA4, Ahrefs/SEMrush, or similar. Not stored in WordPress database.";

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      externalPlaceholder("Traffic & Rankings", manualNote),
      ["Note", "Instructions", "Total Posts"],
    ),
    "11 Traffic Rankings",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(externalPlaceholder("Backlinks", manualNote), [
      "Note",
      "Instructions",
      "Total Posts",
    ]),
    "12 Backlinks",
  );

  const validationRows = rows.map((r) => ({
    "Post ID": r.wp_id,
    Slug: r.slug,
    "Old URL": r.old_url,
    "New URL": r.new_url,
    "301 Redirect Tested": "",
    "New URL Returns 200": "",
    "Title Present": r.seo_title ? "Yes" : "No",
    "Meta Description Present": r.meta_description ? "Yes" : "No",
    "H1 Present": r.h1 ? "Yes" : "No",
    "Canonical Set": r.canonical ? "Yes" : "No",
    "Indexable": r.index_status === "index" ? "Yes" : "No",
    "Search Console Submitted": "",
    "Notes": "",
  }));

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(validationRows, Object.keys(validationRows[0] || {})),
    "13 Post-Migration",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(externalPlaceholder("SEO Score", "Run Screaming Frog / Sitebulb / Ahrefs audit"), [
      "Note",
      "Instructions",
      "Total Posts",
    ]),
    "14 SEO Score",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      rows.map((r) => ({
        "Post ID": r.wp_id,
        Slug: r.slug,
        "Old URL": r.old_url,
        "New URL": r.new_url,
        "Redirect Status (301)": "",
        "Final URL": "",
        "HTTP Status": "",
      })),
      ["Post ID", "Slug", "Old URL", "New URL", "Redirect Status (301)", "Final URL", "HTTP Status"],
    ),
    "15 Redirect Test",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(externalPlaceholder("Search Console", manualNote), [
      "Note",
      "Instructions",
      "Total Posts",
    ]),
    "16 Search Console",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(externalPlaceholder("GA4 Traffic Backup", manualNote), [
      "Note",
      "Instructions",
      "Total Posts",
    ]),
    "17 GA4 Backup",
  );

  const autoChecklist = checklistItems.map((item, i) => ({
    "#": i + 1,
    Item: item,
    Status: i < 10 ? "Data exported" : "Manual step required",
    Owner: "",
    "Completed Date": "",
  }));
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(autoChecklist, ["#", "Item", "Status", "Owner", "Completed Date"]),
    "18 Migration Checklist",
  );

  return wb;
}

async function main() {
  let rows = null;
  let source = "";

  const rootConn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD ?? "",
    port: Number(process.env.DB_PORT || 3306),
  });

  const wpDb = process.env.WP_DB_NAME || "buynfqw4_blogstech";
  if (await databaseExists(rootConn, wpDb)) {
    try {
      const wp = await getConnection(wpDb);
      rows = await loadFromWordPress(wp);
      source = `MySQL ${wpDb} (WordPress)`;
      await wp.end();
    } catch (err) {
      console.warn("WordPress DB load failed:", err.message);
    }
  }

  await rootConn.end();

  if (!rows?.length) {
    rows = await loadFromJson();
    source = rows?.length ? "tech2globe-blog JSON" : "";
  }

  if (!rows?.length) {
    console.error(
      "No blog data found. Import buynfqw4_blogstech.sql into MySQL or ensure tech2globe-blog/content exists.",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wb = buildWorkbook(rows);

  let outPath = OUT_FILE;
  try {
    XLSX.writeFile(wb, outPath);
  } catch (err) {
    if (err.code !== "EBUSY") throw err;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    outPath = path.join(OUT_DIR, `blog-migration-seo-report-${stamp}.xlsx`);
    XLSX.writeFile(wb, outPath);
    console.warn(
      "Original file is open in Excel — saved as a new file instead. Close Excel to overwrite the default name.",
    );
  }

  console.log(`Exported ${rows.length} posts from: ${source}`);
  console.log(`File: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
