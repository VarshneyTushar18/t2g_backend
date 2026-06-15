/** Per-post SEO (Yoast-style). Empty fields are filled from post defaults on read. */

import { rewriteLegacyBlogHost } from "./blogMedia.js";

export const SEO_FIELD_KEYS = [
  "meta_title",
  "meta_description",
  "focus_keyword",
  "canonical_url",
  "robots_noindex",
  "robots_nofollow",
  "og_title",
  "og_description",
  "og_image",
  "twitter_title",
  "twitter_description",
  "twitter_image",
];

const pick = (body, seo, key) => {
  if (seo && seo[key] !== undefined && seo[key] !== null) return seo[key];
  if (body[key] !== undefined && body[key] !== null) return body[key];
  return undefined;
};

export const normalizeSeoInput = (body = {}, post = {}) => {
  const seo = body.seo && typeof body.seo === "object" ? body.seo : {};

  const str = (v) => (v == null ? "" : String(v).trim());

  return {
    meta_title: str(pick(body, seo, "meta_title")),
    meta_description: str(pick(body, seo, "meta_description")),
    focus_keyword: str(pick(body, seo, "focus_keyword")),
    canonical_url: str(pick(body, seo, "canonical_url")),
    robots_noindex: Boolean(pick(body, seo, "robots_noindex")),
    robots_nofollow: Boolean(pick(body, seo, "robots_nofollow")),
    og_title: str(pick(body, seo, "og_title")),
    og_description: str(pick(body, seo, "og_description")),
    og_image: str(pick(body, seo, "og_image") || post.featured_image),
    twitter_title: str(pick(body, seo, "twitter_title")),
    twitter_description: str(pick(body, seo, "twitter_description")),
    twitter_image: str(pick(body, seo, "twitter_image") || post.featured_image),
  };
};

export const normalizeTagsInput = (body = {}) => {
  const raw = body.tags ?? body.tag_names ?? [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
};

/** Resolved SEO for API / frontend <head> — fills blanks from post fields. */
export const resolveSeoForOutput = (stored = {}, post = {}, settings = {}) => {
  const site = (settings.site_url || process.env.SITE_URL || "https://www.tech2globe.com").replace(
    /\/$/,
    "",
  );
  const path = post.slug ? `/blogs/${post.slug}` : "";
  const defaultCanonical = path ? `${site}${path}` : site;

  const title = stored.meta_title || post.title || "";
  const description =
    stored.meta_description || post.excerpt || "";
  const image = rewriteLegacyBlogHost(
    stored.og_image || post.featured_image || settings.default_featured_image || "",
    settings,
  );

  return {
    meta_title: title,
    meta_description: description,
    focus_keyword: stored.focus_keyword || "",
    canonical_url: stored.canonical_url || defaultCanonical,
    robots_noindex: Boolean(stored.robots_noindex),
    robots_nofollow: Boolean(stored.robots_nofollow),
    robots: `${stored.robots_noindex ? "noindex" : "index"}, ${stored.robots_nofollow ? "nofollow" : "follow"}`,
    og_title: stored.og_title || title,
    og_description: stored.og_description || description,
    og_image: rewriteLegacyBlogHost(stored.og_image || image, settings),
    twitter_title: stored.twitter_title || stored.og_title || title,
    twitter_description:
      stored.twitter_description || stored.og_description || description,
    twitter_image: rewriteLegacyBlogHost(
      stored.twitter_image || stored.og_image || image,
      settings,
    ),
  };
};

export const mapSeoFromRow = (row) => ({
  meta_title: row.meta_title || "",
  meta_description: row.meta_description || "",
  focus_keyword: row.focus_keyword || "",
  canonical_url: row.canonical_url || "",
  robots_noindex: Boolean(row.robots_noindex),
  robots_nofollow: Boolean(row.robots_nofollow),
  og_title: row.og_title || "",
  og_description: row.og_description || "",
  og_image: row.og_image || "",
  twitter_title: row.twitter_title || "",
  twitter_description: row.twitter_description || "",
  twitter_image: row.twitter_image || "",
});

export const parseTagsFromRow = (row) => {
  if (!row?.tags) return [];
  try {
    const parsed = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};
