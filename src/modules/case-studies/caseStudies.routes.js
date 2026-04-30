import express from "express";
import * as controller from "./caseStudies.controller.js";

const router = express.Router();

// ================= PUBLIC =================
router.get("/", controller.getAll);
router.get("/featured", controller.getFeatured);

// ================= CATEGORIES =================
router.get("/categories", controller.getCategories);

// 🔥 ADD THESE TWO LINES (THIS IS YOUR MISSING PART)
router.post("/categories", controller.createCategory);
router.delete("/categories/:id", controller.deleteCategory);

// ================= ADMIN =================
router.get("/admin", controller.getAllAdmin);

// ================= SINGLE =================
router.get("/:slug", controller.getBySlug);

// ================= CREATE =================
router.post("/", controller.create);

// ================= UPDATE =================
router.put("/:id", controller.update);

// ================= DELETE =================
router.delete("/:id", controller.remove);

export default router;