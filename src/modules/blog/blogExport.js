import { getBlogSettings } from "./blog.model.js";
import { resolveSeoForOutput } from "./blogSeo.js";

const stripHtml = (html = "") =>
  String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export const countWords = (html = "") =>
  stripHtml(html).split(/\s+/).filter(Boolean).length;

export const extractH1 = (html = "", fallbackTitle = "") => {
  const match = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (match) return stripHtml(match[1]);
  return String(fallbackTitle || "").trim();
};

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

export const buildSeoExportRow = (post, settings = {}) => {
  const site = (settings.media_base_url || process.env.SITE_URL || "https://www.tech2globe.com").replace(
    /\/$/,
    "",
  );
  const seo = resolveSeoForOutput(post.seo || {}, post, {
    ...settings,
    site_url: site,
  });
  const primary = (seo.focus_keyword || "").trim();
  const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
  const secondary = tags
    .filter((t) => t.toLowerCase() !== primary.toLowerCase())
    .join(", ");

  return {
    blogUrl: post.slug ? `${site}/blogs/${post.slug}` : "",
    titleTag: seo.meta_title || post.title || "",
    metaDescription: seo.meta_description || post.excerpt || "",
    h1Tag: extractH1(post.content, post.title),
    urlSlug: post.slug || "",
    canonicalUrl: seo.canonical_url || (post.slug ? `${site}/blogs/${post.slug}` : ""),
    indexStatus: seo.robots_noindex ? "noindex" : "index",
    publishedDate: formatDate(post.date),
    updatedDate: formatDate(post.modified),
    wordCount: countWords(post.content),
    primaryKeyword: primary,
    secondaryKeywords: secondary,
    category: (post.category_names || []).join(", "),
    tags: tags.join(", "),
    authorName: post.author || post.author_name || "",
  };
};

export const SEO_EXPORT_HEADERS = [
  "Blog URL",
  "Title Tag",
  "Meta Description",
  "H1 Tag",
  "URL Slug",
  "Canonical URL",
  "Index/Noindex",
  "Published Date",
  "Updated Date",
  "Word Count",
  "Primary Keyword",
  "Secondary Keywords",
  "Category",
  "Tags",
  "Author Name",
];

export const seoExportRowToArray = (row) => [
  row.blogUrl,
  row.titleTag,
  row.metaDescription,
  row.h1Tag,
  row.urlSlug,
  row.canonicalUrl,
  row.indexStatus,
  row.publishedDate,
  row.updatedDate,
  row.wordCount,
  row.primaryKeyword,
  row.secondaryKeywords,
  row.category,
  row.tags,
  row.authorName,
];

export const buildSeoExportRows = async (posts) => {
  const settings = await getBlogSettings();
  return posts.map((p) => buildSeoExportRow(p, settings));
};
