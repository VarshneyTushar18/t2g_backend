import express from "express";
import * as CareerController from "./career.controller.js";
import { verifyAdmin, requireModule } from "../auth/auth.middleware.js";

const adminCareer = [verifyAdmin, requireModule("career")];
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
router.get("/admin/stats", ...adminCareer, CareerController.getDashboardStats);
router.get("/admin/jobs", ...adminCareer, CareerController.getAllJobs);
router.post("/admin/jobs", ...adminCareer, CareerController.createJob);
router.get("/admin/jobs/:id", ...adminCareer, CareerController.getJobByIdAdmin);
router.put("/admin/jobs/:id", ...adminCareer, CareerController.updateJob);
router.delete("/admin/jobs/:id", ...adminCareer, CareerController.deleteJob);
router.get("/admin/applications", ...adminCareer, CareerController.getAllApplications);
router.get("/admin/applications/:id", ...adminCareer, CareerController.getApplicationById);
router.patch("/admin/applications/:id/status", ...adminCareer, CareerController.updateApplicationStatus);

export default router;