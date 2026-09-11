import express from "express";
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  getSubcategories, createSubcategory, updateSubcategory, deleteSubcategory,
  getProjects, createProject, updateProject, deleteProject,
} from "../portfolio/portfolio.controller.js";
import { guardModuleOrApiKey } from "../auth/auth.middleware.js";
import { imageUpload } from "../../config/multer.js";
import { getPortfolioTree } from "../portfolio/portfolio.controller.js";

const adminPortfolio = guardModuleOrApiKey("portfolio");
const router = express.Router();

// Public
router.get("/categories", getCategories);
router.get("/subcategories/:categoryId", getSubcategories);
router.get("/projects/:subcategoryId", getProjects);

// Protected
router.post("/categories", ...adminPortfolio, createCategory);
router.put("/categories/:id", ...adminPortfolio, updateCategory);
router.delete("/categories/:id", ...adminPortfolio, deleteCategory);

router.post("/subcategories", ...adminPortfolio, createSubcategory);
router.put("/subcategories/:id", ...adminPortfolio, updateSubcategory);
router.delete("/subcategories/:id", ...adminPortfolio, deleteSubcategory);

router.post(
  "/projects",
  ...adminPortfolio,
  imageUpload.single("image"),
  createProject,
);
router.put("/projects/:id", ...adminPortfolio, imageUpload.single("image"), updateProject);
router.delete("/projects/:id", ...adminPortfolio, deleteProject);

router.get("/tree", getPortfolioTree);

export default router;
