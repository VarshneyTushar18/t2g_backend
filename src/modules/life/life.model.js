import pool from "../../config/db.js";
import { resolveMediaUrl, resolveMediaUrls } from "../../utils/mediaUrl.js";

// ── HELPER ──────────────────────────────────────────
const parseGallery = (row) => {
  const gallery =
    typeof row.gallery === "string"
      ? JSON.parse(row.gallery)
      : row.gallery || [];

  return {
    ...row,
    banner: resolveMediaUrl(row.banner),
    category_img: resolveMediaUrl(row.category_img),
    gallery: resolveMediaUrls(gallery),
  };
};

// ── PUBLIC ──────────────────────────────────────────

export const getAllLifeItems = async () => {
  const [rows] = await pool.query(`
    SELECT * FROM life_gallery
    WHERE is_active = TRUE
    ORDER BY sort_order ASC
  `);
  return rows.map(parseGallery);
};

export const getLifeItemById = async (id) => {
  const [rows] = await pool.query(
    `SELECT * FROM life_gallery WHERE id = ? AND is_active = TRUE`,
    [id],
  );
  return rows[0] ? parseGallery(rows[0]) : null;
};

// GET /api/life/categories
export const getCategories = async () => {
  const [rows] = await pool.query(`
    SELECT 
      category,
      MIN(category_title) AS category_title,
      MIN(category_img) AS category_img
    FROM life_gallery
    WHERE is_active = TRUE
    GROUP BY category
    ORDER BY MIN(sort_order) ASC
  `);
  return rows;
};

// GET /api/life/years/:category
export const getYears = async (category) => {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT year FROM life_gallery
    WHERE category = ? AND is_active = TRUE
    ORDER BY year DESC
  `,
    [category],
  );
  return rows.map((r) => r.year); // ['2023', '2022']
};

// GET /api/life/gallery/:category/:year
export const getGallery = async (category, year) => {
  const [rows] = await pool.query(
    `
    SELECT * FROM life_gallery
    WHERE category = ? AND year = ? AND is_active = TRUE
    ORDER BY sort_order ASC
  `,
    [category, year],
  );
  return rows.map(parseGallery);
};

// ── ADMIN ──────────────────────────────────────────

export const getAllLifeItemsAdmin = async () => {
  const [rows] = await pool.query(`
    SELECT * FROM life_gallery
    ORDER BY sort_order ASC
  `);
  return rows.map(parseGallery);
};

export const getLifeItemByIdAdmin = async (id) => {
  const [rows] = await pool.query(`SELECT * FROM life_gallery WHERE id = ?`, [
    id,
  ]);
  return rows[0] ? parseGallery(rows[0]) : null;
};

// CREATE
export const createLifeItem = async ({
  category,
  category_title,
  category_img,
  year,
  banner,
  description,
  gallery,
  sort_order,
  is_active,
}) => {
  const [result] = await pool.query(
    `
    INSERT INTO life_gallery 
      (category, category_title, category_img, year, banner, description, gallery, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      category,
      category_title,
      category_img,
      year,
      banner,
      description,
      JSON.stringify(gallery || []),
      sort_order || 0,
      is_active ?? true,
    ],
  );

  const [newItem] = await pool.query(
    `SELECT * FROM life_gallery WHERE id = ?`,
    [result.insertId],
  );
  return parseGallery(newItem[0]);
};

// UPDATE
export const updateLifeItem = async (
  id,
  {
    category,
    category_title,
    category_img,
    year,
    banner,
    description,
    gallery,
    sort_order,
    is_active,
  },
) => {
  await pool.query(
    `
    UPDATE life_gallery SET
      category = ?,
      category_title = ?,
      category_img = ?,
      year = ?,
      banner = ?,
      description = ?,
      gallery = ?,
      sort_order = ?,
      is_active = ?
    WHERE id = ?
  `,
    [
      category,
      category_title,
      category_img,
      year,
      banner,
      description,
      JSON.stringify(gallery || []),
      sort_order,
      is_active,
      id,
    ],
  );

  const [rows] = await pool.query(`SELECT * FROM life_gallery WHERE id = ?`, [
    id,
  ]);
  return rows[0] ? parseGallery(rows[0]) : null;
};

// DELETE
export const deleteLifeItem = async (id) => {
  await pool.query(`DELETE FROM life_gallery WHERE id = ?`, [id]);
  return true;
};

/** Append URLs to an item's gallery (bulk / folder upload). */
export const appendGalleryImages = async (id, newUrls) => {
  const existing = await getLifeItemByIdAdmin(id);
  if (!existing) return null;

  const gallery = [...(existing.gallery || []), ...newUrls];

  await pool.query(`UPDATE life_gallery SET gallery = ? WHERE id = ?`, [
    JSON.stringify(gallery),
    id,
  ]);

  return getLifeItemByIdAdmin(id);
};

/** Replace gallery with an exact URL list (delete/reorder without re-upload). */
export const setGalleryImages = async (id, gallery) => {
  const existing = await getLifeItemByIdAdmin(id);
  if (!existing) return null;

  const list = Array.isArray(gallery) ? gallery : [];

  await pool.query(`UPDATE life_gallery SET gallery = ? WHERE id = ?`, [
    JSON.stringify(list),
    id,
  ]);

  return getLifeItemByIdAdmin(id);
};

/** Remove specific URLs from the gallery. */
export const removeGalleryImages = async (id, urlsToRemove) => {
  const existing = await getLifeItemByIdAdmin(id);
  if (!existing) return null;

  const remove = new Set(
    (Array.isArray(urlsToRemove) ? urlsToRemove : []).filter(Boolean),
  );
  const gallery = (existing.gallery || []).filter((url) => !remove.has(url));

  await pool.query(`UPDATE life_gallery SET gallery = ? WHERE id = ?`, [
    JSON.stringify(gallery),
    id,
  ]);

  return getLifeItemByIdAdmin(id);
};

export const getAllImages = async () => {
  const [rows] = await pool.query(`
    SELECT banner, gallery FROM life_gallery
  `);

  let allImages = [];

  rows.forEach(row => {
    if (row.banner) {
      allImages.push(row.banner);
    }

    if (row.gallery) {
      try {
        const parsed = typeof row.gallery === "string"
          ? JSON.parse(row.gallery)
          : row.gallery;

        allImages.push(...parsed);
      } catch (e) {
        console.error("Gallery parse error", e);
      }
    }
  });

  return allImages;
};
