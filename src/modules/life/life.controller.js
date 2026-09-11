import * as LifeModel from "./life.model.js";
import { getGalleryFiles } from "./life.upload.js";
import { parseCurrentGallery, withGalleryMeta } from "./life.helpers.js";

/*
PUBLIC CONTROLLERS
*/

// GET /api/life/items
export const getActiveLifeItems = async (req, res) => {
  try {
    const items = await LifeModel.getAllLifeItems();
    res.json({ success: true, data: items, total: items.length });
  } catch (err) {
    console.error("getActiveLifeItems error:", err);
    res.status(500).json({ error: "Failed to fetch life items" });
  }
};

// GET /api/life/items/:id
export const getLifeItemById = async (req, res) => {
  try {
    const item = await LifeModel.getLifeItemById(req.params.id);
    if (!item) return res.status(404).json({ error: "Life item not found" });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error("getLifeItemById error:", err);
    res.status(500).json({ error: "Failed to fetch life item" });
  }
};

// GET /api/life/categories
export const getCategories = async (req, res) => {
  try {
    const categories = await LifeModel.getCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error("getCategories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// GET /api/life/years/:category
export const getYears = async (req, res) => {
  try {
    const years = await LifeModel.getYears(req.params.category);
    res.json({ success: true, data: years });
  } catch (err) {
    console.error("getYears error:", err);
    res.status(500).json({ error: "Failed to fetch years" });
  }
};

// GET /api/life/gallery/:category/:year
export const getGallery = async (req, res) => {
  try {
    const { category, year } = req.params;
    const items = await LifeModel.getGallery(category, year);
    res.json({ success: true, data: items, total: items.length });
  } catch (err) {
    console.error("getGallery error:", err);
    res.status(500).json({ error: "Failed to fetch gallery" });
  }
};

/*
ADMIN CONTROLLERS
*/

// GET /api/life/admin/items
export const getAllLifeItemsAdmin = async (req, res) => {
  try {
    const items = await LifeModel.getAllLifeItemsAdmin();
    res.json({
      success: true,
      data: items.map(withGalleryMeta),
      total: items.length,
    });
  } catch (err) {
    console.error("getAllLifeItemsAdmin error:", err);
    res.status(500).json({ error: "Failed to fetch life items" });
  }
};

// GET /api/life/admin/items/:id
export const getLifeItemByIdAdmin = async (req, res) => {
  try {
    const item = await LifeModel.getLifeItemByIdAdmin(req.params.id);
    if (!item) return res.status(404).json({ error: "Life item not found" });
    res.json({ success: true, data: withGalleryMeta(item) });
  } catch (err) {
    console.error("getLifeItemByIdAdmin error:", err);
    res.status(500).json({ error: "Failed to fetch life item" });
  }
};

// export const createLifeItem = async (req, res) => {
//   try {
//     const {
//       category, category_title,
//       year, description, sort_order, is_active
//     } = req.body;

//     const banner      = req.files?.banner?.[0]?.path;
//     const galleryFiles = req.files?.gallery || [];
//     const gallery     = galleryFiles.map(f => f.path);

//     if (!banner) {
//       return res.status(400).json({ error: "Banner image required" });
//     }

//     const item = await LifeModel.createLifeItem({
//       category,
//       category_title,
//       category_img: banner,
//       year,
//       banner,
//       description,
//       gallery,               // array of URLs
//       sort_order:  sort_order || 0,
//       is_active:   is_active ?? true,
//     });

//     res.status(201).json({ success: true, data: item });

//   } catch (err) {
//     console.error("createLifeItem error:", err);
//     res.status(500).json({ error: "Failed to create gallery item" });
//   }
// };

export const createLifeItem = async (req, res) => {
  try {
    const {
      category,
      category_title,
      year,
      description,
      sort_order,
      is_active,
    } = req.body;

    const files = req.files || [];

    // ✅ Banner (works with .any())
    const bannerFile = files.find(f => f.fieldname === "banner");

    if (!bannerFile) {
      return res.status(400).json({ error: "Banner image required" });
    }

    const banner = bannerFile.path;

    const gallery = getGalleryFiles(files).map((f) => f.path);

    const item = await LifeModel.createLifeItem({
      category,
      category_title,
      category_img: banner,   // keep existing logic
      year,
      banner,
      description,
      gallery,
      sort_order: sort_order || 0,
      is_active: is_active ?? true,
    });

    res.status(201).json({ success: true, data: item });

  } catch (err) {
    console.error("createLifeItem error:", err);
    res.status(500).json({ error: "Failed to create gallery item" });
  }
};

export const updateLifeItem = async (req, res) => {
  try {
    const {
      category,
      category_title,
      year,
      description,
      sort_order,
      is_active,
    } = req.body;

    const existing = await LifeModel.getLifeItemByIdAdmin(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Life item not found" });
    }

    const files = req.files || [];

    // ✅ Banner (handle from .any())
    const bannerFile = files.find(f => f.fieldname === "banner");
    const banner = bannerFile ? bannerFile.path : existing.banner;

    const newGallery = getGalleryFiles(files).map((f) => f.path);

    // Admin sends URLs already saved (shown in UI) so only NEW files are uploaded
    const fromBody = parseCurrentGallery(req.body.current_gallery);
    const baseGallery =
      fromBody ??
      (Array.isArray(existing.gallery) ? existing.gallery : []);

    const gallery =
      newGallery.length > 0 ? [...baseGallery, ...newGallery] : baseGallery;

    const item = await LifeModel.updateLifeItem(req.params.id, {
      category,
      category_title,
      category_img: existing.category_img,
      year,
      banner,
      description,
      gallery,
      sort_order,
      is_active,
    });

    res.json({ success: true, data: withGalleryMeta(item) });

  } catch (err) {
    console.error("updateLifeItem error:", err);
    res.status(500).json({ error: "Failed to update life item" });
  }
};

export const deleteLifeItem = async (req, res) => {
  try {
    const deleted = await LifeModel.deleteLifeItem(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Life item not found" });
    res.json({ success: true, message: "Life item deleted successfully" });
  } catch (err) {
    console.error("deleteLifeItem error:", err);
    res.status(500).json({ error: "Failed to delete life item" });
  }
};


// POST /api/life/admin/items/:id/gallery — bulk append (folder / many files)
export const appendGalleryImages = async (req, res) => {
  try {
    const existing = await LifeModel.getLifeItemByIdAdmin(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Life item not found" });
    }

    const galleryFiles = getGalleryFiles(req.files || []);
    if (galleryFiles.length === 0) {
      return res.status(400).json({
        error: 'At least one image required in the "gallery" field',
      });
    }

    const newUrls = galleryFiles.map((f) => f.path);
    const item = await LifeModel.appendGalleryImages(req.params.id, newUrls);

    res.json({
      success: true,
      data: withGalleryMeta(item),
      uploaded: newUrls.length,
      galleryTotal: item.gallery.length,
    });
  } catch (err) {
    console.error("appendGalleryImages error:", err);
    res.status(500).json({ error: "Failed to upload gallery images" });
  }
};

// PATCH /api/life/admin/items/:id/gallery — set exact list (remove/reorder, no upload)
export const setGalleryImages = async (req, res) => {
  try {
    const { gallery } = req.body;
    if (!Array.isArray(gallery)) {
      return res.status(400).json({
        error: 'Body must include "gallery" as an array of image URLs',
      });
    }

    const item = await LifeModel.setGalleryImages(req.params.id, gallery);
    if (!item) {
      return res.status(404).json({ error: "Life item not found" });
    }

    res.json({ success: true, data: withGalleryMeta(item) });
  } catch (err) {
    console.error("setGalleryImages error:", err);
    res.status(500).json({ error: "Failed to update gallery" });
  }
};

// DELETE /api/life/admin/items/:id/gallery — remove URLs from gallery
export const removeGalleryImages = async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: 'Body must include "urls" as a non-empty array of image URLs',
      });
    }

    const item = await LifeModel.removeGalleryImages(req.params.id, urls);
    if (!item) {
      return res.status(404).json({ error: "Life item not found" });
    }

    res.json({ success: true, data: withGalleryMeta(item), removed: urls.length });
  } catch (err) {
    console.error("removeGalleryImages error:", err);
    res.status(500).json({ error: "Failed to remove gallery images" });
  }
};

export const getAllImages = async (req, res) => {
  try {
    const images = await LifeModel.getAllImages();
    const seen = new Set();
    const unique = [];
    for (const u of images) {
      if (u && typeof u === "string" && !seen.has(u)) {
        seen.add(u);
        unique.push(u);
      }
    }
    res.json({ success: true, data: unique, total: unique.length });
  } catch (err) {
    console.error("getAllImages error:", err);
    res.status(500).json({ error: "Failed to fetch images" });
  }
};