import express from "express";
import * as controller from "./caseStudies.controller.js";
import { verifyAdmin, requireModule } from "../auth/auth.middleware.js";

const router = express.Router();
const adminCaseStudies = [verifyAdmin, requireModule("case_studies")];

// ================= PUBLIC =================
router.get("/", controller.getAll);
router.get("/featured", controller.getFeatured);
router.get("/categories", controller.getCategories);
router.get("/:slug", controller.getBySlug);

// ================= ADMIN =================
router.get("/admin", ...adminCaseStudies, controller.getAllAdmin);
router.post("/categories", ...adminCaseStudies, controller.createCategory);
router.delete("/categories/:id", ...adminCaseStudies, controller.deleteCategory);
router.post("/", ...adminCaseStudies, controller.create);
router.put("/:id", ...adminCaseStudies, controller.update);
router.delete("/:id", ...adminCaseStudies, controller.remove);

export default router;
