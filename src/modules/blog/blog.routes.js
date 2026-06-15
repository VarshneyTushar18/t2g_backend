import express from "express";
import * as controller from "./blog.controller.js";
import { guardModule } from "../auth/auth.middleware.js";
import { requireBlogDb } from "../../middleware/requireBlogDb.js";
import { blogUpload } from "../../config/multer.js";

const router = express.Router();
const adminBlog = guardModule("blog");

router.use(requireBlogDb);

// ================= PUBLIC (for main site / future Next.js) =================
router.get("/posts", controller.getPublicPosts);
router.get("/posts/:slug", controller.getPublicBySlug);
router.get("/public/categories", controller.getPublicCategories);
router.get("/public/archives", controller.getPublicArchives);

// ================= ADMIN =================
router.get("/categories", ...adminBlog, controller.getCategories);
router.post("/categories", ...adminBlog, controller.createCategory);
router.delete("/categories/:id", ...adminBlog, controller.deleteCategory);

router.get("/editor-schema", ...adminBlog, controller.getPostEditorSchema);
router.get("/tags", ...adminBlog, controller.getTags);

router.get("/admin/list", ...adminBlog, controller.getAllAdmin);
router.get("/admin/:id", ...adminBlog, controller.getById);

router.post("/", ...adminBlog, blogUpload.single("featured_image"), controller.create);
router.put("/:id", ...adminBlog, blogUpload.single("featured_image"), controller.update);
router.delete("/:id", ...adminBlog, controller.remove);

export default router;
