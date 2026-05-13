import db from "../../config/db.js";

// ✅ Converts relative paths → full URLs so frontend never gets broken images
const BASE_URL = process.env.API_URL || "http://localhost:5000";

const toAbsUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path; // already a full URL, leave it
  return `${BASE_URL}${path}`;
};

export const getAllTestimonials = async () => {
  const [rows] = await db.query(`
    SELECT 
      id,
      name,
      avatar,
      stars,
      testimonial_text AS text,
      company_logo_url AS companyLogo,
      company_name AS companyName,
      review_link AS link,
      status
    FROM testimonials
    ORDER BY created_at DESC
  `);

  // ✅ Prefix image paths before sending to frontend
  return rows.map((row) => ({
    ...row,
    avatar:      toAbsUrl(row.avatar),
    companyLogo: toAbsUrl(row.companyLogo),
  }));
};

export const getTestimonialById = async (id) => {
  const [rows] = await db.query(
    `SELECT 
      id,
      name,
      avatar,
      stars,
      testimonial_text AS text,
      company_logo_url AS companyLogo,
      company_name     AS companyName,
      review_link      AS link,
      status
    FROM testimonials
    WHERE id = ?`,
    [id]
  );

  const row = rows[0];
  if (!row) return null;

  // ✅ Prefix image paths before sending to frontend
  return {
    ...row,
    avatar:      toAbsUrl(row.avatar),
    companyLogo: toAbsUrl(row.companyLogo),
  };
};

export const createTestimonial = async (data) => {
  const { name, avatar, stars, text, companyLogo, companyName, link } = data;

  const [result] = await db.query(
    `INSERT INTO testimonials
    (name, avatar, stars, testimonial_text, company_logo_url, company_name, review_link)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, avatar, stars, text, companyLogo, companyName, link]
  );

  return result;
};

export const updateTestimonial = async (id, data) => {
  const { name, avatar, stars, text, companyLogo, companyName, link, status } = data;

  const [result] = await db.query(
    `UPDATE testimonials
     SET name=?, avatar=?, stars=?, testimonial_text=?, company_logo_url=?, company_name=?, review_link=?, status=?
     WHERE id=?`,
    [name, avatar, stars, text, companyLogo, companyName, link, status, id]
  );

  return result;
};

export const deleteTestimonial = async (id) => {
  const [result] = await db.query(
    `DELETE FROM testimonials WHERE id=?`,
    [id]
  );

  return result;
};