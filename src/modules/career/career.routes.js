import express from "express";
import * as CareerController from "./career.controller.js";
import { verifyAdmin } from "../auth/auth.middleware.js";
import { resumeUpload } from "../../config/multer.js";

const router = express.Router();

// PUBLIC
router.get("/jobs", CareerController.getActiveJobs);
router.get("/jobs/:id", CareerController.getJobById);

router.post(
  "/apply",
  resumeUpload.single("resume"),
  CareerController.submitApplication
);

// ADMIN
router.get("/admin/stats", verifyAdmin, CareerController.getDashboardStats);
router.get("/admin/jobs", verifyAdmin, CareerController.getAllJobs);
router.post("/admin/jobs", verifyAdmin, CareerController.createJob);
router.get("/admin/jobs/:id", verifyAdmin, CareerController.getJobByIdAdmin);
router.put("/admin/jobs/:id", verifyAdmin, CareerController.updateJob);
router.delete("/admin/jobs/:id", verifyAdmin, CareerController.deleteJob);
router.get("/admin/applications", verifyAdmin, CareerController.getAllApplications);
router.get("/admin/applications/:id", verifyAdmin, CareerController.getApplicationById);
router.patch("/admin/applications/:id/status", verifyAdmin, CareerController.updateApplicationStatus);

export default router;