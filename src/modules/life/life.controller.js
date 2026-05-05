import * as LifeModel from "./life.model.js";

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
    res.json({ success: true, data: items, total: items.length });
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
    res.json({ success: true, data: item });
  } catch (err) {
    console.error("getLifeItemByIdAdmin error:", err);
    res.status(500).json({ error: "Failed to fetch life item" });
  }
};

export const createLifeItem = async (req, res) => {
  try {
    const {
      category, category_title,
      year, description, sort_order, is_active
    } = req.body;

    const banner      = req.files?.banner?.[0]?.path;
    const galleryFiles = req.files?.gallery || [];
    const gallery     = galleryFiles.map(f => f.path);

    if (!banner) {
      return res.status(400).json({ error: "Banner image required" });
    }

    const item = await LifeModel.createLifeItem({
      category,
      category_title,
      category_img: banner,
      year,
      banner,
      description,
      gallery,               // array of URLs
      sort_order:  sort_order || 0,
      is_active:   is_active ?? true,
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

    // Banner (keep old if not uploaded)
    const banner = req.files?.banner?.[0]?.path || existing.banner;

    // New uploaded gallery files
    const galleryFiles = req.files?.gallery || [];
    const newGallery = galleryFiles.map((f) => f.path);

    // Parse existing gallery safely
    let existingGallery = existing.gallery || [];

    if (typeof existingGallery === "string") {
      try {
        existingGallery = JSON.parse(existingGallery);
      } catch (e) {
        existingGallery = [];
      }
    }

    // ✅ APPEND LOGIC (NO OVERWRITE)
    const gallery =
      galleryFiles.length > 0
        ? [...existingGallery, ...newGallery]
        : existingGallery;

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

    res.json({ success: true, data: item });
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


export const getAllImages = async (req, res) => {
  try {
    const images = await LifeModel.getAllImages();
    res.json({ success: true, data: images, total: images.length });
  } catch (err) {
    console.error("getAllImages error:", err);
    res.status(500).json({ error: "Failed to fetch images" });
  }
};