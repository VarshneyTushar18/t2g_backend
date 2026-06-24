import blogDb from "../../config/blogDb.js";
import { buildPublishedCategoryFilter } from "./blogCategoryGroups.js";
import { normalizeFeaturedImage, rewriteBlogContentHtml } from "./blogMedia.js";
import {
  mapSeoFromRow,
  normalizeSeoInput,
  normalizeTagsInput,
  parseTagsFromRow,
  resolveSeoForOutput,
} from "./blogSeo.js";

const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const mapPostRow = (row) => {
  const post = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt || "",
    content: row.content || "",
    status: row.status,
    featured_image: row.featured_image || "",
    author: row.author_name || "Tech2globe",
    view_count: Number(row.view_count || 0),
    date: row.published_at || row.created_at,
    modified: row.updated_at,
    categories: row.category_ids
      ? row.category_ids.split(",").map(Number).filter(Boolean)
      : [],
    category_names: row.category_names
      ? row.category_names.split("||").filter(Boolean)
      : [],
    tags: parseTagsFromRow(row),
    seo: mapSeoFromRow(row),
    link: row.slug ? `/blogs/${row.slug}` : null,
  };
  return post;
};

export const enrichPostForPublic = async (post) => {
  const settings = await getBlogSettings();
  const site = settings.media_base_url || process.env.SITE_URL || "";
  return {
    ...post,
    featured_image: normalizeFeaturedImage(post.featured_image, settings),
    content: rewriteBlogContentHtml(post.content, settings),
    seo: resolveSeoForOutput(post.seo, post, {
      ...settings,
      site_url: site,
    }),
  };
};

const postSelect = `
  SELECT
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.content,
    p.featured_image,
    p.meta_title,
    p.meta_description,
    p.focus_keyword,
    p.canonical_url,
    p.robots_noindex,
    p.robots_nofollow,
    p.og_title,
    p.og_description,
    p.og_image,
    p.twitter_title,
    p.twitter_description,
    p.twitter_image,
    p.tags,
    p.status,
    p.author_name,
    p.view_count,
    p.published_at,
    p.created_at,
    p.updated_at,
    GROUP_CONCAT(DISTINCT c.id ORDER BY c.id) AS category_ids,
    GROUP_CONCAT(DISTINCT c.name ORDER BY c.id SEPARATOR '||') AS category_names
  FROM blog_posts p
  LEFT JOIN blog_post_categories pc ON pc.post_id = p.id
  LEFT JOIN blog_categories c ON c.id = pc.category_id
`;

const groupByPost = "GROUP BY p.id";

export const getBlogSettings = async () => {
  const [rows] = await blogDb.query(
    "SELECT setting_key, setting_value FROM blog_settings",
  );
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    media_base_url:
      map.media_base_url ||
      process.env.SITE_URL ||
      process.env.CLIENT_URL_MAIN ||
      "https://www.tech2globe.com",
    default_featured_image:
      map.default_featured_image ||
      `${(process.env.SITE_URL || "https://www.tech2globe.com").replace(/\/$/, "")}/images/blog-bg.webp`,
  };
};

export const getAllAdmin = async ({ page = 1, limit = 20, search = "", category = "" } = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = "WHERE p.is_active = 1";

  if (search) {
    where +=
      " AND (p.title LIKE ? OR p.slug LIKE ? OR p.excerpt LIKE ? OR p.meta_title LIKE ? OR p.focus_keyword LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }

  const categoryId = Number(category);
  if (categoryId) {
    where += ` AND EXISTS (
      SELECT 1 FROM blog_post_categories pc_f
      WHERE pc_f.post_id = p.id AND pc_f.category_id = ?
    )`;
    params.push(categoryId);
  }

  const [[{ total }]] = await blogDb.query(
    `SELECT COUNT(*) AS total FROM blog_posts p ${where}`,
    params,
  );

  const [rows] = await blogDb.query(
    `${postSelect} ${where} ${groupByPost}
     ORDER BY COALESCE(p.published_at, p.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    data: rows.map(mapPostRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getAllPostsForExport = async ({ search = "", status = "" } = {}) => {
  const params = [];
  let where = "WHERE p.is_active = 1";

  if (search) {
    where +=
      " AND (p.title LIKE ? OR p.slug LIKE ? OR p.excerpt LIKE ? OR p.meta_title LIKE ? OR p.focus_keyword LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }

  if (status) {
    where += " AND p.status = ?";
    params.push(status);
  }

  const [rows] = await blogDb.query(
    `${postSelect} ${where} ${groupByPost}
     ORDER BY COALESCE(p.published_at, p.created_at) DESC
     LIMIT 5000`,
    params,
  );

  return rows.map(mapPostRow);
};

export const getPublishedPosts = async ({
  page = 1,
  limit = 6,
  category = "",
  search = "",
  sort = "recent",
  month = "",
} = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = "WHERE p.status = 'publish' AND p.is_active = 1";

  if (category) {
    const categoryFilter = buildPublishedCategoryFilter(category);
    if (categoryFilter) {
      where += categoryFilter.sql;
      params.push(...categoryFilter.params);
    }
  }

  if (search) {
    where +=
      " AND (p.title LIKE ? OR p.slug LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const monthKey = String(month).trim();
  if (/^\d{4}-\d{2}$/.test(monthKey)) {
    where +=
      " AND DATE_FORMAT(COALESCE(p.published_at, p.created_at), '%Y-%m') = ?";
    params.push(monthKey);
  }

  const orderBy =
    sort === "popular"
      ? "p.view_count DESC, COALESCE(p.published_at, p.created_at) DESC"
      : "COALESCE(p.published_at, p.created_at) DESC";

  const [[{ total }]] = await blogDb.query(
    `SELECT COUNT(*) AS total FROM blog_posts p ${where}`,
    params,
  );

  const [rows] = await blogDb.query(
    `${postSelect}
     ${where}
     ${groupByPost}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    data: rows.map(mapPostRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getById = async (id) => {
  const [rows] = await blogDb.query(
    `${postSelect} WHERE p.id = ? ${groupByPost}`,
    [id],
  );
  return rows[0] ? mapPostRow(rows[0]) : null;
};

export const getBySlug = async (slug) => {
  const [rows] = await blogDb.query(
    `${postSelect} WHERE p.slug = ? AND p.status = 'publish' AND p.is_active = 1 ${groupByPost}`,
    [slug],
  );
  return rows[0] ? mapPostRow(rows[0]) : null;
};

export const getCategories = async () => {
  const [rows] = await blogDb.query(
    "SELECT id, name, slug, created_at FROM blog_categories ORDER BY name ASC",
  );
  return rows;
};

/** Categories that have at least one published post (for public sidebar). */
export const getPublishedCategories = async () => {
  const [rows] = await blogDb.query(
    `SELECT c.id, c.name, c.slug, COUNT(DISTINCT p.id) AS post_count
     FROM blog_categories c
     INNER JOIN blog_post_categories pc ON pc.category_id = c.id
     INNER JOIN blog_posts p ON p.id = pc.post_id
       AND p.status = 'publish' AND p.is_active = 1
     GROUP BY c.id, c.name, c.slug
     ORDER BY c.name ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    post_count: Number(r.post_count || 0),
  }));
};

/** Monthly archives for public sidebar (newest first). */
export const getPublishedArchives = async (limit = 12) => {
  const [rows] = await blogDb.query(
    `SELECT
       DATE_FORMAT(COALESCE(p.published_at, p.created_at), '%Y-%m') AS month_key,
       DATE_FORMAT(COALESCE(p.published_at, p.created_at), '%M %Y') AS label,
       COUNT(*) AS post_count
     FROM blog_posts p
     WHERE p.status = 'publish' AND p.is_active = 1
     GROUP BY month_key, label
     ORDER BY month_key DESC
     LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 12, 1), 24)],
  );
  return rows.map((r) => ({
    month: r.month_key,
    label: r.label,
    post_count: Number(r.post_count || 0),
  }));
};

export const createCategory = async (name) => {
  const slug = slugify(name);
  const [result] = await blogDb.query(
    "INSERT INTO blog_categories (name, slug) VALUES (?, ?)",
    [name.trim(), slug],
  );
  return { id: result.insertId, name: name.trim(), slug };
};

export const deleteCategory = async (id) => {
  await blogDb.query("DELETE FROM blog_categories WHERE id = ?", [id]);
};

export const getAllTags = async () => {
  const [rows] = await blogDb.query(
    "SELECT tags FROM blog_posts WHERE tags IS NOT NULL AND is_active = 1",
  );
  const set = new Set();
  for (const row of rows) {
    for (const tag of parseTagsFromRow(row)) {
      set.add(tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
};

const syncCategories = async (postId, categoryIds = []) => {
  await blogDb.query("DELETE FROM blog_post_categories WHERE post_id = ?", [postId]);
  const ids = [...new Set(categoryIds.map(Number).filter(Boolean))];
  if (!ids.length) return;

  const values = ids.map((categoryId) => [postId, categoryId]);
  await blogDb.query(
    "INSERT INTO blog_post_categories (post_id, category_id) VALUES ?",
    [values],
  );
};

export const createPost = async (data) => {
  const {
    title,
    excerpt = "",
    content,
    featured_image = "",
    status = "draft",
    author_name = "Tech2globe",
    categories = [],
    seo: seoInput,
    tags: tagsInput,
  } = data;

  const slug = slugify(data.slug || title);
  if (!slug) {
    const err = new Error("Could not generate slug from title");
    err.status = 400;
    throw err;
  }

  const seo = normalizeSeoInput(
    { ...data, seo: seoInput },
    { title, excerpt, featured_image },
  );
  const tags = normalizeTagsInput({ tags: tagsInput, ...data });
  const publishedAt = status === "publish" ? new Date() : null;

  const [result] = await blogDb.query(
    `INSERT INTO blog_posts
      (title, slug, excerpt, content, featured_image,
       meta_title, meta_description, focus_keyword, canonical_url,
       robots_noindex, robots_nofollow,
       og_title, og_description, og_image,
       twitter_title, twitter_description, twitter_image,
       tags, status, author_name, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      slug,
      excerpt,
      content,
      featured_image || null,
      seo.meta_title || null,
      seo.meta_description || null,
      seo.focus_keyword || null,
      seo.canonical_url || null,
      seo.robots_noindex ? 1 : 0,
      seo.robots_nofollow ? 1 : 0,
      seo.og_title || null,
      seo.og_description || null,
      seo.og_image || null,
      seo.twitter_title || null,
      seo.twitter_description || null,
      seo.twitter_image || null,
      JSON.stringify(tags),
      status,
      author_name,
      publishedAt,
    ],
  );

  await syncCategories(result.insertId, categories);
  return getById(result.insertId);
};

export const updatePost = async (id, data) => {
  const existing = await getById(id);
  if (!existing) return null;

  const {
    title,
    excerpt = "",
    content,
    featured_image = "",
    status = existing.status,
    author_name = existing.author,
    categories = [],
    seo: seoInput,
    tags: tagsInput,
  } = data;

  const seo = normalizeSeoInput(
    { ...data, seo: seoInput },
    { title, excerpt, featured_image },
  );
  const tags = normalizeTagsInput({ tags: tagsInput, ...data });

  const slug = slugify(data.slug || title || existing.slug);
  if (!slug) {
    const err = new Error("Could not generate slug from title");
    err.status = 400;
    throw err;
  }

  let publishedAt = existing.date;
  if (status === "publish" && existing.status !== "publish") {
    publishedAt = new Date();
  }
  if (status !== "publish") {
    publishedAt = null;
  }

  await blogDb.query(
    `UPDATE blog_posts
     SET title = ?, slug = ?, excerpt = ?, content = ?, featured_image = ?,
         meta_title = ?, meta_description = ?, focus_keyword = ?, canonical_url = ?,
         robots_noindex = ?, robots_nofollow = ?,
         og_title = ?, og_description = ?, og_image = ?,
         twitter_title = ?, twitter_description = ?, twitter_image = ?,
         tags = ?, status = ?, author_name = ?, published_at = ?
     WHERE id = ?`,
    [
      title,
      slug,
      excerpt,
      content,
      featured_image || null,
      seo.meta_title || null,
      seo.meta_description || null,
      seo.focus_keyword || null,
      seo.canonical_url || null,
      seo.robots_noindex ? 1 : 0,
      seo.robots_nofollow ? 1 : 0,
      seo.og_title || null,
      seo.og_description || null,
      seo.og_image || null,
      seo.twitter_title || null,
      seo.twitter_description || null,
      seo.twitter_image || null,
      JSON.stringify(tags),
      status,
      author_name,
      publishedAt,
      id,
    ],
  );

  await syncCategories(id, categories);
  return getById(id);
};

export const deletePost = async (id) => {
  await blogDb.query("DELETE FROM blog_posts WHERE id = ?", [id]);
};

export const toWordPressShape = (post, settings = {}) => {
  const site = settings.media_base_url || process.env.SITE_URL || "";
  const seo = resolveSeoForOutput(post.seo, post, { ...settings, site_url: site });
  return {
    id: post.id,
    slug: post.slug,
    date: post.date,
    modified: post.modified,
    link: post.link,
    title: { rendered: post.title },
    excerpt: { rendered: post.excerpt ? `<p>${post.excerpt}</p>` : "" },
    content: { rendered: rewriteBlogContentHtml(post.content, settings) },
    featured_image: normalizeFeaturedImage(post.featured_image, settings),
    categories: post.categories,
    category_names: post.category_names || [],
    tags: post.tags || [],
    view_count: Number(post.view_count || 0),
    author: post.author,
    seo,
    yoast_head_json: seo,
  };
};

export const incrementViewCount = async (id) => {
  await blogDb.query("UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?", [
    id,
  ]);
};
