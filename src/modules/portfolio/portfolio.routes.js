import express from "express";
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  getSubcategories, createSubcategory, updateSubcategory, deleteSubcategory,
  getProjects, createProject, updateProject, deleteProject,
} from "../portfolio/portfolio.controller.js";
import { verifyAdmin } from "../auth/auth.middleware.js";
import { imageUpload } from "../../config/multer.js";
import { getPortfolioTree } from "../portfolio/portfolio.controller.js";

const router = express.Router();

// Public
router.get("/categories", getCategories);
router.get("/subcategories/:categoryId", getSubcategories);
router.get("/projects/:subcategoryId", getProjects);

// Protected
router.post("/categories", verifyAdmin, createCategory);
router.put("/categories/:id", verifyAdmin, updateCategory);
router.delete("/categories/:id", verifyAdmin, deleteCategory);

router.post("/subcategories", verifyAdmin, createSubcategory);
router.put("/subcategories/:id", verifyAdmin, updateSubcategory);
router.delete("/subcategories/:id", verifyAdmin, deleteSubcategory);


router.post(
  "/projects",
  imageUpload.single("image"),
  (req, res, next) => {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);
    next();
  },
  createProject
);
router.put("/projects/:id", verifyAdmin, imageUpload.single("image"), updateProject);
router.delete("/projects/:id", verifyAdmin, deleteProject);


// Additional route to get the entire portfolio tree
router.get("/tree", getPortfolioTree);




export default router;