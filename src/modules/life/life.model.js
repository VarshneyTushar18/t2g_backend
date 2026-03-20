import pool from "../../config/db.js";

// ── HELPER ──────────────────────────────────────────
const parseGallery = (row) => ({
  ...row,
  gallery:
    typeof row.gallery === "string"
      ? JSON.parse(row.gallery)
      : row.gallery || [],
});

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
    SELECT category, category_title, category_img
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
