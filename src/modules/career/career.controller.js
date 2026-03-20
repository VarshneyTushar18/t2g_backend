import * as CareerModel from "./career.model.js";
import { transporter } from "../../utils/email.service.js";


// PUBLIC CONTROLLERS

// GET /api/career/jobs
export const getActiveJobs = async (req, res) => {
  try {
    const jobs = await CareerModel.getAllActiveJobs();
    res.json({ success: true, data: jobs, total: jobs.length });
  } catch (err) {
    console.error("getActiveJobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

// GET /api/career/jobs/:id
export const getJobById = async (req, res) => {
  try {
    const job = await CareerModel.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ success: true, data: job });
  } catch (err) {
    console.error("getJobById error:", err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
};

// POST /api/career/apply  (multipart/form-data with resume)
export const submitApplication = async (req, res) => {
  try {
    const {
      jobId,
      firstName,
      lastName,
      email,
      phone,
      portfolioLink,
      linkedIn,
      currentCTC,
      expectedCTC,
      joinDate,
      lastCompany,
      noticePeriod,
      comments,
    } = req.body;

    // ── Validate required fields ──────────────────────
    const missing = [];
    if (!jobId) missing.push("jobId");
    if (!firstName) missing.push("firstName");
    if (!lastName) missing.push("lastName");
    if (!email) missing.push("email");
    if (!phone) missing.push("phone");

    if (missing.length) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // ── Check job exists ──────────────────────────────
    const job = await CareerModel.getJobById(jobId);

    if (!job) {
      return res.status(404).json({
        error: "Job not found or no longer active",
      });
    }

    // ── Check duplicate application ───────────────────
    const isDuplicate = await CareerModel.checkDuplicate(email, jobId);

    if (isDuplicate) {
      return res.status(409).json({
        error: "You have already applied for this position with this email.",
      });
    }

    // ── Resume Path (Cloudinary URL) ──────────────────
    const resumePath = req.file ? req.file.path : null;

    const resumeDownloadUrl = resumePath
      ? resumePath.replace("/image/upload/", "/raw/upload/")
      : null;

    // ── Save application ──────────────────────────────
    const appId = await CareerModel.createApplication(
      {
        jobId,
        jobTitle: job.title,
        firstName,
        lastName,
        email,
        phone,
        portfolioLink,
        linkedIn,
        currentCTC,
        expectedCTC,
        joinDate,
        lastCompany,
        noticePeriod,
        comments,
      },
      resumePath
    );

    // ── Send HR Email ─────────────────────────────────
    try {
      await transporter.sendMail({
        from: '"Tech2Globe Careers" <career@tech2globe.com>',
        to: process.env.TEST_EMAIL,
        subject: `Job Request - ${firstName} ${lastName}`,
        html: `
      <p>Hello HR Team!</p>

      <p>We have received a new job application. Details are as follows:-</p>

      <p>
        <strong>Name:</strong> ${firstName} ${lastName}<br>
        <strong>Email:</strong> ${email}<br>
        <strong>Contact Number:</strong> ${phone}<br>
        <strong>Job request for:</strong> ${job.title}<br>
        <strong>Portfolio:</strong> ${portfolioLink || "-"}<br>
        <strong>Current CTC:</strong> ${currentCTC || "-"} LPA<br>
        <strong>Expected CTC:</strong> ${expectedCTC || "-"} LPA<br>
        <strong>Notice Period:</strong> ${noticePeriod || "-"}<br>
        <strong>Last Company:</strong> ${lastCompany || "-"}<br>
        <strong>Available to join:</strong> ${joinDate || "-"}<br>
        
        <strong>Resume:</strong> ${
          resumeDownloadUrl
            ? `<a href="${resumeDownloadUrl}" target="_blank">Download Resume</a>`
            : "Not Uploaded"
        }
      </p>
    `,
      });
    } catch (mailError) {
      console.error("HR email failed:", mailError);
    }

    // ── Send Candidate Confirmation ───────────────────
    try {
      await transporter.sendMail({
        from: "<career@tech2globe.com>",
        to: email,
        subject: "Application Received – Tech2Globe",
        html: `
          Dear ${firstName},<br><br>

          Thank you for applying for the position of <b>${job.title}</b>.<br>

          Our HR team will review your profile and contact you shortly.<br><br>

          Regards,<br>
          Tech2Globe Team
        `,
      });
    } catch (mailError) {
      console.error("Candidate email failed:", mailError);
    }

    // ── Final Response ────────────────────────────────
    res.status(201).json({
      success: true,
      message: "Application submitted successfully!",
      applicationId: appId,
    });
  } catch (err) {
    console.error("submitApplication error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "You have already applied for this position.",
      });
    }

    res.status(500).json({
      error: "Server error: " + err.message,
    });
  }
};


// ADMIN CONTROLLERS

// GET /api/career/admin/stats
export const getDashboardStats = async (req, res) => {
  try {
    const stats = await CareerModel.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

// GET /api/career/admin/jobs
export const getAllJobs = async (req, res) => {
  try {
    const jobs = await CareerModel.getAllJobs();
    res.json({ success: true, data: jobs });
  } catch (err) {
    console.error("getAllJobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

// POST /api/career/admin/jobs
export const createJob = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: "Job title is required" });
    const job = await CareerModel.createJob(req.body);
    res
      .status(201)
      .json({ success: true, data: job, message: "Job created successfully" });
  } catch (err) {
    console.error("createJob error:", err);
    res.status(500).json({ error: "Failed to create job" });
  }
};

// PUT /api/career/admin/jobs/:id
export const updateJob = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: "Job title is required" });
    const job = await CareerModel.updateJob(req.params.id, req.body);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ success: true, data: job, message: "Job updated successfully" });
  } catch (err) {
    console.error("updateJob error:", err);
    res.status(500).json({ error: "Failed to update job" });
  }
};

// DELETE /api/career/admin/jobs/:id
export const deleteJob = async (req, res) => {
  try {
    const result = await CareerModel.deleteJob(req.params.id);
    if (!result) return res.status(404).json({ error: "Job not found" });
    res.json({ success: true, message: result.message });
  } catch (err) {
    console.error("deleteJob error:", err);
    res.status(500).json({ error: "Failed to delete job" });
  }
};

// GET /api/career/admin/applications
export const getAllApplications = async (req, res) => {
  try {
    const { status, jobId, search, page, limit } = req.query;
    const result = await CareerModel.getAllApplications({
      status,
      jobId,
      search,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("getAllApplications error:", err);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};

// GET /api/career/admin/applications/:id
export const getApplicationById = async (req, res) => {
  try {
    const app = await CareerModel.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: "Application not found" });
    res.json({ success: true, data: app });
  } catch (err) {
    console.error("getApplicationById error:", err);
    res.status(500).json({ error: "Failed to fetch application" });
  }
};

// PATCH /api/career/admin/applications/:id/status
export const updateApplicationStatus = async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const validStatuses = ["pending", "shortlisted", "hired", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be: ${validStatuses.join(", ")}`,
      });
    }
    const updated = await CareerModel.updateApplicationStatus(
      req.params.id,
      status,
      admin_notes || null,
    );
    if (!updated)
      return res.status(404).json({ error: "Application not found" });
    res.json({
      success: true,
      data: updated,
      message: `Status updated to "${status}"`,
    });
  } catch (err) {
    console.error("updateApplicationStatus error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
};

// GET /api/career/admin/jobs/:id  (admin - returns active or inactive)
export const getJobByIdAdmin = async (req, res) => {
  try {
    const job = await CareerModel.getJobByIdAdmin(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ success: true, data: job });
  } catch (err) {
    console.error("getJobByIdAdmin error:", err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
};
