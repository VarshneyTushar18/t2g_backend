import db from "../../config/db.js";

// ================= FEATURED =================
export const getFeaturedCaseStudies = async () => {
  const [rows] = await db.query(`
    SELECT 
      cs.id,
      cs.title,
      cs.slug,
      c.name AS category_name,
      cs.featured_image
    FROM case_studies cs
    LEFT JOIN case_study_categories c 
      ON cs.category_id = c.id
    WHERE cs.is_featured = TRUE 
      AND cs.is_active = TRUE
    ORDER BY cs.created_at DESC
    LIMIT 8
  `);

  return rows;
};

// ================= ALL (FOR ADMIN) =================
export const getAllCaseStudiesAdmin = async () => {
  const [rows] = await db.query(`
SELECT
cs.id,
cs.title,
cs.slug,
cs.short_description,
cs.content,
cs.featured_image,
cs.is_featured,
cs.category_id,
c.name AS category_name
FROM case_studies cs
LEFT JOIN case_study_categories c
ON cs.category_id = c.id
ORDER BY cs.created_at DESC
`);

  return rows;
};

// ================= CATEGORIES =================
export const getCategories = async () => {
  const [rows] = await db.query(
    "SELECT * FROM case_study_categories ORDER BY id ASC",
  );
  return rows;
};

// ================= ALL (FOR TABS) =================
export const getAllCaseStudies = async () => {
  const [rows] = await db.query(`
    SELECT 
      cs.id,  -- ✅ ADD THIS
      c.name AS category_name,
      cs.title,
      cs.slug,
      cs.short_description,
      cs.featured_image,
      cs.is_featured
    FROM case_study_categories c
    LEFT JOIN case_studies cs 
      ON cs.category_id = c.id 
      AND cs.is_active = TRUE
    ORDER BY c.id ASC, cs.created_at DESC
  `);

  return rows;
};

// ================= SINGLE =================
export const getCaseStudyBySlug = async (slug) => {
  const [rows] = await db.query(`SELECT * FROM case_studies WHERE slug = ?`, [
    slug,
  ]);

  return rows[0];
};

// ================= CREATE =================
export const createCaseStudy = async (data) => {
  const {
    title,
    slug,
    category_id,
    short_description,
    content,
    featured_image,
    is_featured,
  } = data;

  const [result] = await db.query(
    `INSERT INTO case_studies
    (title, slug, category_id, short_description, content, featured_image, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      slug,
      category_id,
      short_description,
      content,
      featured_image,
      is_featured,
    ],
  );

  return result;
};

// ================= UPDATE =================
export const updateCaseStudy = async (id, data) => {
  const {
    title,
    slug,
    category_id,
    short_description,
    content,
    featured_image,
    is_featured,
  } = data;

  await db.query(
    `UPDATE case_studies
     SET title=?, slug=?, category_id=?, short_description=?, content=?, featured_image=?, is_featured=?
     WHERE id=?`,
    [
      title,
      slug,
      category_id,
      short_description,
      content,
      featured_image,
      is_featured,
      id,
    ],
  );
};

// ================= DELETE =================
export const deleteCaseStudy = async (id) => {
  await db.query(`DELETE FROM case_studies WHERE id=?`, [id]);
};
