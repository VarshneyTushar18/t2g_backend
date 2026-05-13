import pool from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";

export const getAllActiveJobs = async () => {
  const [rows] = await pool.query(
    `SELECT id, title, experience, positions, location, 
            qualification, salary, skills, responsibilities, created_at
     FROM jobs WHERE status = 'active' ORDER BY created_at DESC`
  );
  return rows;
};

export const getJobById = async (id) => {
  const [rows] = await pool.query(`SELECT * FROM jobs WHERE id = ? AND status = 'active'`, [id]);
  return rows[0] || null;
};

// Admin: get single job regardless of status
export const getJobByIdAdmin = async (id) => {
  const [rows] = await pool.query(`SELECT * FROM jobs WHERE id = ?`, [id]);
  return rows[0] || null;
};

export const getAllJobs = async () => {
  const [rows] = await pool.query(
    `SELECT j.*, COUNT(a.id) AS application_count
     FROM jobs j LEFT JOIN job_applications a ON j.id = a.job_id
     GROUP BY j.id ORDER BY j.created_at DESC`
  );
  return rows;
};

export const createJob = async ({ title, experience, positions, location, qualification, salary, skills, responsibilities, status }) => {
  const [result] = await pool.query(
    `INSERT INTO jobs (title, experience, positions, location, qualification, salary, skills, responsibilities, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, parseInt(experience)||0, parseInt(positions)||1, location||"Noida", qualification||"Any bachelors degree", salary||"Best in the Industry", skills||"", responsibilities||"", status||"active"]
  );
  const [newJob] = await pool.query(`SELECT * FROM jobs WHERE id = ?`, [result.insertId]);
  return newJob[0];
};

export const updateJob = async (id, { title, experience, positions, location, qualification, salary, skills, responsibilities, status }) => {
  await pool.query(
    `UPDATE jobs SET title=?, experience=?, positions=?, location=?, qualification=?, salary=?, skills=?, responsibilities=?, status=? WHERE id=?`,
    [title, parseInt(experience)||0, parseInt(positions)||1, location, qualification, salary, skills, responsibilities, status, id]
  );
  const [rows] = await pool.query(`SELECT * FROM jobs WHERE id = ?`, [id]);
  return rows[0] || null;
};

export const deleteJob = async (id) => {
  const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt FROM job_applications WHERE job_id = ?`, [id]);
  if (parseInt(cnt) > 0) {
    await pool.query(`UPDATE jobs SET status = 'inactive' WHERE id = ?`, [id]);
    return { hardDeleted: false, message: "Job deactivated (has applications, cannot hard delete)" };
  }
  const [result] = await pool.query(`DELETE FROM jobs WHERE id = ?`, [id]);
  if (!result.affectedRows) return null;
  return { hardDeleted: true, message: "Job deleted successfully" };
};

export const getDashboardStats = async () => {
  const [[{ total_jobs }]]  = await pool.query(`SELECT COUNT(*) as total_jobs FROM jobs WHERE status = 'active'`);
  const [[{ total_apps }]]  = await pool.query(`SELECT COUNT(*) as total_apps FROM job_applications`);
  const [[{ pending }]]     = await pool.query(`SELECT COUNT(*) as pending FROM job_applications WHERE status = 'pending'`);
  const [[{ shortlisted }]] = await pool.query(`SELECT COUNT(*) as shortlisted FROM job_applications WHERE status = 'shortlisted'`);
  const [[{ hired }]]       = await pool.query(`SELECT COUNT(*) as hired FROM job_applications WHERE status = 'hired'`);
  const [[{ rejected }]]    = await pool.query(`SELECT COUNT(*) as rejected FROM job_applications WHERE status = 'rejected'`);
  const [recent] = await pool.query(`SELECT id, first_name, last_name, email, job_title, status, applied_at FROM job_applications ORDER BY applied_at DESC LIMIT 6`);
  const [jobStats] = await pool.query(`SELECT j.title, COUNT(a.id) as app_count FROM jobs j LEFT JOIN job_applications a ON j.id = a.job_id GROUP BY j.id, j.title ORDER BY app_count DESC LIMIT 5`);
  return { total_jobs, total_apps, pending, shortlisted, hired, rejected, recent, jobStats };
};

export const checkDuplicate = async (email, jobId) => {
  const [rows] = await pool.query(`SELECT id FROM job_applications WHERE email = ? AND job_id = ?`, [email, jobId]);
  return rows.length > 0;
};

export const createApplication = async (fields, resumeFilename) => {
  const { jobId, jobTitle, firstName, lastName, email, phone, portfolioLink, linkedIn, currentCTC, expectedCTC, joinDate, lastCompany, noticePeriod, comments } = fields;
  const id = uuidv4();
  await pool.query(
    `INSERT INTO job_applications (id, job_id, job_title, first_name, last_name, email, phone, portfolio_link, linked_in, current_ctc, expected_ctc, join_date, resume_file, last_company, notice_period, comments, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [id, jobId, jobTitle, firstName, lastName, email, phone, portfolioLink||null, linkedIn||null, currentCTC||null, expectedCTC||null, joinDate||null, resumeFilename||null, lastCompany||null, noticePeriod||null, comments||null]
  );
  return id;
};

export const getAllApplications = async ({ status, jobId, search, page = 1, limit = 20 } = {}) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = "1=1";
  const params = [];
  if (status) { where += " AND a.status = ?"; params.push(status); }
  if (jobId)  { where += " AND a.job_id = ?"; params.push(jobId); }
  if (search) {
    where += " AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.email LIKE ? OR a.job_title LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM job_applications a WHERE ${where}`, params);
  const [rows] = await pool.query(
    `SELECT a.id, a.first_name, a.last_name, a.email, a.phone, a.job_title, a.job_id, a.notice_period, a.last_company, a.status, a.resume_file, a.applied_at FROM job_applications a WHERE ${where} ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );
  return { data: rows, total: parseInt(total), page: parseInt(page), limit: parseInt(limit) };
};

export const getApplicationById = async (id) => {
  const [rows] = await pool.query(`SELECT * FROM job_applications WHERE id = ?`, [id]);
  return rows[0] || null;
};

export const updateApplicationStatus = async (id, status, adminNotes = null) => {
  await pool.query(`UPDATE job_applications SET status = ?, admin_notes = ? WHERE id = ?`, [status, adminNotes, id]);
  const [rows] = await pool.query(`SELECT * FROM job_applications WHERE id = ?`, [id]);
  return rows[0] || null;
};