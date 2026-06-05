import express from "express";
import * as controller from "./blog.controller.js";
import { guardModule } from "../auth/auth.middleware.js";

const router = express.Router();
const adminBlog = guardModule("blog");

// ================= PUBLIC (for main site / future Next.js) =================
router.get("/posts", controller.getPublicPosts);
router.get("/posts/:slug", controller.getPublicBySlug);

// ================= ADMIN =================
router.get("/categories", ...adminBlog, controller.getCategories);
router.post("/categories", ...adminBlog, controller.createCategory);
router.delete("/categories/:id", ...adminBlog, controller.deleteCategory);

router.get("/tags", ...adminBlog, controller.getTags);

router.get("/admin/list", ...adminBlog, controller.getAllAdmin);
router.get("/admin/:id", ...adminBlog, controller.getById);

router.post("/", ...adminBlog, controller.create);
router.put("/:id", ...adminBlog, controller.update);
router.delete("/:id", ...adminBlog, controller.remove);

export default router;
