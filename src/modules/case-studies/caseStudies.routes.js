import express from "express";
import * as controller from "./caseStudies.controller.js";
import { guardModuleOrApiKey } from "../auth/auth.middleware.js";
import { caseStudiesUpload } from "../../config/multer.js";

const router = express.Router();
const adminCaseStudies = guardModuleOrApiKey("case_studies");

// ================= PUBLIC =================
router.get("/", controller.getAll);
router.get("/featured", controller.getFeatured);
router.get("/categories", controller.getCategories);

// ================= ADMIN (must be registered before /:slug) =================
router.get("/admin/list", ...adminCaseStudies, controller.getAllAdmin);
router.get("/admin", ...adminCaseStudies, controller.getAllAdmin);
router.post("/categories", ...adminCaseStudies, controller.createCategory);
router.delete("/categories/:id", ...adminCaseStudies, controller.deleteCategory);
router.post(
  "/",
  ...adminCaseStudies,
  caseStudiesUpload.single("featured_image"),
  controller.create,
);
router.put(
  "/:id",
  ...adminCaseStudies,
  caseStudiesUpload.single("featured_image"),
  controller.update,
);
router.delete("/:id", ...adminCaseStudies, controller.remove);

// ================= PUBLIC SINGLE (keep last — catches any slug) =================
router.get("/:slug", controller.getBySlug);

export default router;
