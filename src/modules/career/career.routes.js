import express from "express";
import * as CareerController from "./career.controller.js";
import * as ApprovalController from "../agents/career/careerApproval.controller.js";
import { guardModuleOrApiKey } from "../auth/auth.middleware.js";
import { handleResumeUpload } from "./career.upload.js";

const adminCareer = guardModuleOrApiKey("career");
const router = express.Router();

// PUBLIC — HR Yes/No links from email (no auth)
router.get("/approvals/go", ApprovalController.go);

// PUBLIC
router.get("/jobs", CareerController.getActiveJobs);
router.get("/jobs/:id", CareerController.getJobById);
router.get("/check-application", CareerController.checkApplication);

router.post(
  "/apply",
  handleResumeUpload,
  CareerController.submitApplication
);

// ADMIN
router.get("/admin/stats", ...adminCareer, CareerController.getDashboardStats);
router.get("/admin/jobs", ...adminCareer, CareerController.getAllJobs);
router.post("/admin/jobs", ...adminCareer, CareerController.createJob);
router.get("/admin/jobs/:id", ...adminCareer, CareerController.getJobByIdAdmin);
router.put("/admin/jobs/:id", ...adminCareer, CareerController.updateJob);
router.delete("/admin/jobs/:id", ...adminCareer, CareerController.deleteJob);
router.get("/admin/applications", ...adminCareer, CareerController.getAllApplications);
router.get("/admin/applications/:id", ...adminCareer, CareerController.getApplicationById);
router.patch("/admin/applications/:id/status", ...adminCareer, CareerController.updateApplicationStatus);

// ADMIN — Career Agent HR approval settings
router.get("/admin/approvals", ...adminCareer, ApprovalController.getDashboard);
router.get("/admin/approvals/settings", ...adminCareer, ApprovalController.getSettings);
router.put("/admin/approvals/settings", ...adminCareer, ApprovalController.saveSettings);
router.post("/admin/approvals/test-email", ...adminCareer, ApprovalController.testEmail);
router.post("/admin/approvals/:jobId/resend", ...adminCareer, ApprovalController.resend);

export default router;
