import express from "express";
import * as LifeController from "../life/life.controller.js";
import { verifyAdmin } from "../auth/auth.middleware.js";
import { imageUpload } from "../../config/multer.js";

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
  verifyAdmin,
  LifeController.getAllLifeItemsAdmin
);

// GET single item
// /api/life/admin/items/:id
router.get(
  "/admin/items/:id",
  verifyAdmin,
  LifeController.getLifeItemByIdAdmin
);

// CREATE item WITH image upload

// Change single to array (max 20 images)
// router.post(
//   "/admin/items",
//   verifyAdmin,
//   imageUpload.fields([
//     { name: "banner", maxCount: 1 },
//     { name: "gallery", maxCount: 20 }
//   ]),
//   LifeController.createLifeItem
// );

// router.put(
//   "/admin/items/:id",
//   verifyAdmin,
//   imageUpload.fields([
//     { name: "banner", maxCount: 1 },
//     { name: "gallery", maxCount: 20 }
//   ]),
//   LifeController.updateLifeItem
// );


router.post(
  "/admin/items",
  verifyAdmin,
  imageUpload.fields([
    { name: "banner", maxCount: 1 },
    { name: "gallery", maxCount: 50 } // ✅ increased
  ]),
  LifeController.createLifeItem
);

router.put(
  "/admin/items/:id",
  verifyAdmin,
  imageUpload.fields([
    { name: "banner", maxCount: 1 },
    { name: "gallery", maxCount: 50 } // ✅ increased
  ]),
  LifeController.updateLifeItem
);


// DELETE item
// /api/life/admin/items/:id
router.delete(
  "/admin/items/:id",
  verifyAdmin,
  LifeController.deleteLifeItem
);

export default router;