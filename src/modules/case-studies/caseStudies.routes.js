import express from "express";
import * as controller from "./caseStudies.controller.js";
import { caseStudiesUpload } from "../../config/multer.js";

const router = express.Router();

router.get("/", controller.getAll);

router.get("/featured", controller.getFeatured);

// ================= CATEGORIES =================
router.get("/categories", controller.getCategories); // ✅ ADDED — must be before /:slug

// ================= ADMIN =================
router.get("/admin", controller.getAllAdmin);

// ================= SINGLE =================
router.get("/:slug", controller.getBySlug); // ⚠️ always last GET

// ================= CREATE =================
router.post(
  "/",
  caseStudiesUpload.single("featured_image"),
  controller.create,
);

// ================= UPDATE =================
router.put(
  "/:id",
  caseStudiesUpload.single("featured_image"),
  controller.update,
);

// ================= DELETE =================
router.delete("/:id", controller.remove);

export default router;