import * as model from "./blog.model.js";

const stripHtml = (html = "") =>
  String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const parseJsonField = (value, fallback) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizePayload = (body = {}, file = null) => {
  const title = body.title?.trim() || "";
  const content = body.content || "";
  const slug = body.slug?.trim() || slugify(title);
  const featured_image = file?.path || body.featured_image || "";

  return {
    title,
    slug,
    content,
    excerpt: body.excerpt || "",
    status: body.status || "draft",
    featured_image,
    author_name: (body.author_name || body.author || "Tech2globe").trim(),
    categories: parseJsonField(body.categories ?? body.category_ids, []),
    seo: parseJsonField(body.seo, undefined),
    tags: parseJsonField(body.tags, undefined),
  };
};

const handleBlogError = (res, err, fallback) => {
  console.error(fallback, err);

  if (err.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({
      error: "Blog tables are missing. Run: npm run migrate:blog",
    });
  }

  if (err.code === "ER_DUP_ENTRY") {
    return res.status(400).json({ error: "A post with this slug already exists" });
  }

  return res.status(500).json({ error: err.message || fallback });
};

const formatPublicPost = async (post, format) => {
  const settings = await model.getBlogSettings();
  if (format === "wp") {
    return model.toWordPressShape(post, settings);
  }
  return model.enrichPostForPublic(post);
};

export const getPublicPosts = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.per_page || req.query.limit) || 6, 1), 100);
    const category = String(req.query.category || "").trim();
    const search = String(req.query.search || req.query.q || "").trim();
    const month = String(req.query.month || "").trim();
    const sort = String(req.query.sort || "recent").toLowerCase() === "popular"
      ? "popular"
      : "recent";
    const format = String(req.query.format || "").toLowerCase();

    const result = await model.getPublishedPosts({
      page,
      limit,
      category,
      search,
      sort,
      month,
    });
    const data = await Promise.all(
      result.data.map((p) => formatPublicPost(p, format)),
    );

    res.json({
      success: true,
      data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("blog getPublicPosts error:", err);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
};

export const getPublicBySlug = async (req, res) => {
  try {
    const post = await model.getBySlug(req.params.slug);
    if (!post) {
      return res.status(404).json({ error: "Not found" });
    }

    const format = String(req.query.format || "").toLowerCase();
    // Track reads for "Most Viewed Posts" sidebar.
    await model.incrementViewCount(post.id);
    const fresh = await model.getBySlug(req.params.slug);
    res.json({
      success: true,
      data: await formatPublicPost(fresh, format),
    });
  } catch (err) {
    console.error("blog getPublicBySlug error:", err);
    res.status(500).json({ error: "Failed to fetch blog post" });
  }
};

export const getAllAdmin = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const search = String(req.query.search || "").trim();

    const result = await model.getAllAdmin({ page, limit, search });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("blog getAllAdmin error:", err);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await model.getById(req.params.id);
    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error("blog getById error:", err);
    res.status(500).json({ error: "Failed to fetch blog post" });
  }
};

export const getCategories = async (req, res) => {
  try {
    const data = await model.getCategories();
    res.json({ success: true, data });
  } catch (err) {
    console.error("blog getCategories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

export const getPublicCategories = async (_req, res) => {
  try {
    const data = await model.getPublishedCategories();
    res.json({ success: true, data });
  } catch (err) {
    return handleBlogError(res, err, "Failed to fetch blog categories");
  }
};

export const getPublicArchives = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 24);
    const data = await model.getPublishedArchives(limit);
    res.json({ success: true, data });
  } catch (err) {
    return handleBlogError(res, err, "Failed to fetch blog archives");
  }
};

export const getTags = async (_req, res) => {
  try {
    const data = await model.getAllTags();
    res.json({ success: true, data });
  } catch (err) {
    console.error("blog getTags error:", err);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
};

/** Field list for admin post editor (SEO tab). */
export const getPostEditorSchema = async (_req, res) => {
  res.json({
    success: true,
    post: {
      fields: [
        "title",
        "slug",
        "excerpt",
        "content",
        "featured_image",
        "status",
        "categories",
        "tags",
        "author_name",
      ],
    },
    seo: {
      hint: "Send as body.seo or top-level keys. Leave blank to auto-use title/excerpt/featured image on the live site.",
      fields: [
        { key: "meta_title", label: "SEO title", maxLength: 60 },
        { key: "meta_description", label: "Meta description", maxLength: 160 },
        { key: "focus_keyword", label: "Focus keyword" },
        { key: "canonical_url", label: "Canonical URL" },
        { key: "robots_noindex", label: "Hide from search (noindex)", type: "boolean" },
        { key: "robots_nofollow", label: "Nofollow links", type: "boolean" },
        { key: "og_title", label: "Open Graph title" },
        { key: "og_description", label: "Open Graph description" },
        { key: "og_image", label: "Open Graph image URL" },
        { key: "twitter_title", label: "Twitter title" },
        { key: "twitter_description", label: "Twitter description" },
        { key: "twitter_image", label: "Twitter image URL" },
      ],
    },
  });
};

export const create = async (req, res) => {
  try {
    const payload = normalizePayload(req.body, req.file);

    if (!payload.title) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!payload.slug) {
      return res.status(400).json({ error: "Could not generate slug from title" });
    }
    if (!stripHtml(payload.content)) {
      return res.status(400).json({ error: "Content is required" });
    }

    const data = await model.createPost(payload);
    res.json({ success: true, message: "Blog post created", data });
  } catch (err) {
    return handleBlogError(res, err, "blog create error:");
  }
};

export const update = async (req, res) => {
  try {
    const payload = normalizePayload(req.body, req.file);

    if (!payload.title) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!payload.slug) {
      return res.status(400).json({ error: "Could not generate slug from title" });
    }
    if (!stripHtml(payload.content)) {
      return res.status(400).json({ error: "Content is required" });
    }

    const data = await model.updatePost(req.params.id, payload);

    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ success: true, message: "Blog post updated", data });
  } catch (err) {
    return handleBlogError(res, err, "blog update error:");
  }
};

export const remove = async (req, res) => {
  try {
    await model.deletePost(req.params.id);
    res.json({ success: true, message: "Blog post deleted" });
  } catch (err) {
    console.error("blog remove error:", err);
    res.status(500).json({ error: "Failed to delete blog post" });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: "Category name required" });
    }

    const data = await model.createCategory(name.trim());
    res.json({ success: true, message: "Category created", data });
  } catch (err) {
    console.error("blog createCategory error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Category already exists" });
    }
    res.status(500).json({ error: "Failed to create category" });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    await model.deleteCategory(req.params.id);
    res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error("blog deleteCategory error:", err);
    res.status(500).json({ error: "Failed to delete category" });
  }
};
