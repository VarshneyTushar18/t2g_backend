import express from "express";
import * as LifeController from "../life/life.controller.js";
import { verifyAdmin, requireModule } from "../auth/auth.middleware.js";

const adminLife = [verifyAdmin, requireModule("life")];
import { lifeGalleryUpload } from "../../config/multer.js";
import { handleLifeGalleryUpload } from "./life.upload.js";
import { uploadCompressedLifeImages } from "../../middleware/lifeImageUpload.middleware.js";

const router = express.Router();

/* ===============================
   PUBLIC ROUTES
================================ */

// GET all gallery items
// /api/life/items
router.get("/items", LifeController.getActiveLifeItems);

// GET single item
// /api/life/items/:id
router.get("/items/:id", LifeController.getLifeItemById);

// GET categories
// /api/life/categories
router.get("/categories", LifeController.getCategories);

// GET years by category
// /api/life/years/:category
router.get("/years/:category", LifeController.getYears);

// GET gallery by category + year
// /api/life/gallery/:category/:year
router.get("/gallery/:category/:year", LifeController.getGallery);


/* ===============================
   ADMIN ROUTES
================================ */

// GET all items for admin
// /api/life/admin/items
router.get(
  "/admin/items",
  ...adminLife,
  LifeController.getAllLifeItemsAdmin
);

// GET every banner + gallery image URL (must be before /admin/items/:id)
router.get(
  "/admin/images",
  ...adminLife,
  LifeController.getAllImages,
);

// GET single item
// /api/life/admin/items/:id
router.get(
  "/admin/items/:id",
  ...adminLife,
  LifeController.getLifeItemByIdAdmin
);

// CREATE item WITH image upload

// Change single to array (max 20 images)
// router.post(
//   "/admin/items",
//   ...adminLife,
//   imageUpload.fields([
//     { name: "banner", maxCount: 1 },
//     { name: "gallery", maxCount: 20 }
//   ]),
//   LifeController.createLifeItem
// );

// router.put(
//   "/admin/items/:id",
//   ...adminLife,
//   imageUpload.fields([
//     { name: "banner", maxCount: 1 },
//     { name: "gallery", maxCount: 20 }
//   ]),
//   LifeController.updateLifeItem
// );


const lifeUploadPipeline = [
  handleLifeGalleryUpload(lifeGalleryUpload.any()),
  uploadCompressedLifeImages,
];

router.post(
  "/admin/items",
  ...adminLife,
  ...lifeUploadPipeline,
  LifeController.createLifeItem
);

router.put(
  "/admin/items/:id",
  ...adminLife,
  ...lifeUploadPipeline,
  LifeController.updateLifeItem
);

// Add more photos only (does not re-upload existing) — use this for +10 images
router.post(
  "/admin/items/:id/gallery",
  ...adminLife,
  ...lifeUploadPipeline,
  LifeController.appendGalleryImages
);

// Set gallery to exact URL list (show/delete/reorder without file upload)
router.patch(
  "/admin/items/:id/gallery",
  ...adminLife,
  LifeController.setGalleryImages
);

// Remove specific image URLs from gallery
router.delete(
  "/admin/items/:id/gallery",
  ...adminLife,
  LifeController.removeGalleryImages
);

// DELETE item
// /api/life/admin/items/:id
router.delete(
  "/admin/items/:id",
  ...adminLife,
  LifeController.deleteLifeItem
);

export default router;