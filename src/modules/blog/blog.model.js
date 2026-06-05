import blogDb from "../../config/blogDb.js";
import { normalizeFeaturedImage, rewriteBlogContentHtml } from "./blogMedia.js";

const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const mapPostRow = (row) => ({
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
  link: row.slug ? `/blogs/${row.slug}` : null,
});

const postSelect = `
  SELECT
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.content,
    p.featured_image,
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

export const getAllAdmin = async ({ page = 1, limit = 20, search = "" } = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = "WHERE p.is_active = 1";

  if (search) {
    where += " AND (p.title LIKE ? OR p.slug LIKE ? OR p.excerpt LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q);
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

export const getPublishedPosts = async ({
  page = 1,
  limit = 6,
  category = "",
} = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = "WHERE p.status = 'publish' AND p.is_active = 1";

  if (category) {
    const normalized = String(category).trim();
    where += ` AND EXISTS (
      SELECT 1
      FROM blog_post_categories pc2
      INNER JOIN blog_categories c2 ON c2.id = pc2.category_id
      WHERE pc2.post_id = p.id
        AND (c2.slug = ? OR c2.name = ?)
    )`;
    params.push(normalized, normalized.replace(/-/g, " "));
  }

  const [[{ total }]] = await blogDb.query(
    `SELECT COUNT(*) AS total FROM blog_posts p ${where}`,
    params,
  );

  const [rows] = await blogDb.query(
    `${postSelect}
     ${where}
     ${groupByPost}
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
  } = data;

  const slug = slugify(data.slug || title);
  if (!slug) {
    const err = new Error("Could not generate slug from title");
    err.status = 400;
    throw err;
  }

  const publishedAt = status === "publish" ? new Date() : null;

  const [result] = await blogDb.query(
    `INSERT INTO blog_posts
      (title, slug, excerpt, content, featured_image, status, author_name, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      slug,
      excerpt,
      content,
      featured_image || null,
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
  } = data;

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
         status = ?, author_name = ?, published_at = ?
     WHERE id = ?`,
    [
      title,
      slug,
      excerpt,
      content,
      featured_image || null,
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

export const toWordPressShape = (post, settings = {}) => ({
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
  view_count: Number(post.view_count || 0),
  author: post.author,
});

export const incrementViewCount = async (id) => {
  await blogDb.query("UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?", [
    id,
  ]);
};
