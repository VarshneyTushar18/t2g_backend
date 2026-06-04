import * as model from "../case-studies/caseStudies.model.js";

// ================= FEATURED =================
export const getFeatured = async (req, res) => {
  try {
    const data = await model.getFeaturedCaseStudies();
    res.json(data);
  } catch (err) {
    console.error("getFeatured error:", err);
    res.status(500).json({ error: "Failed to fetch featured case studies" });
  }
};

// ================= ALL (FRONTEND TABS) =================
export const getAll = async (req, res) => {
  try {
    const rows = await model.getAllCaseStudies();
    const grouped = {};

    rows.forEach((row) => {
      if (!grouped[row.category_name]) {
        grouped[row.category_name] = {
          title: row.category_name,
          items: [],
        };
      }

      if (row.title) {
        grouped[row.category_name].items.push({
          id: row.id,
          title: row.title,
          description: row.short_description,
          slug: row.slug,
          featured_image: row.featured_image,
        });
      }
    });

    res.json({
      success: true,
      data: Object.values(grouped),
    });
  } catch (err) {
    console.error("getAll error:", err);
    res.status(500).json({ error: "Failed to fetch case studies" });
  }
};

// ================= ADMIN =================
export const getAllAdmin = async (req, res) => {
  try {
    const rows = await model.getAllCaseStudiesAdmin();

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("getAllAdmin error:", err);
    res.status(500).json({ error: "Failed to fetch admin data" });
  }
};

// ================= CATEGORIES =================
export const getCategories = async (req, res) => {
  try {
    const rows = await model.getCategories();
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getCategories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// ================= SINGLE =================
export const getBySlug = async (req, res) => {
  try {
    const data = await model.getCaseStudyBySlug(req.params.slug);

    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }

    if (data.table_data) {
      data.table_data = JSON.parse(data.table_data);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("getBySlug error:", err);
    res.status(500).json({ error: "Failed to fetch case study" });
  }
};

// ================= CREATE =================
export const create = async (req, res) => {
  try {
    const featured_image = req.file?.path || req.body.featured_image || null;

    await model.createCaseStudy({
      ...req.body,
      featured_image,
      table_data: req.body.table_data
        ? JSON.parse(req.body.table_data)
        : null,
    });

    res.json({ message: "Case study created" });
  } catch (err) {
    console.error("Create error:", err);
    res.status(500).json({ error: "Failed to create case study" });
  }
};

// ================= UPDATE =================
export const update = async (req, res) => {
  try {
    const featured_image = req.file?.path || req.body.featured_image || null;

    await model.updateCaseStudy(req.params.id, {
      ...req.body,
      featured_image,
      table_data: req.body.table_data ? JSON.parse(req.body.table_data) : null,
    });

    res.json({ message: "Case study updated" });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update case study" });
  }
};

// ================= DELETE =================
export const remove = async (req, res) => {
  try {
    await model.deleteCaseStudy(req.params.id);
    res.json({ message: "Case study deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete case study" });
  }
};

// ================= CREATE CATEGORY =================
// ================= CREATE CATEGORY =================
export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name required" });
    }

    await model.createCategory(name.trim());

    res.json({ success: true, message: "Category created" });
  } catch (err) {
    console.error("createCategory error:", err);
    res.status(500).json({ error: "Failed to create category" });
  }
};

// ================= DELETE CATEGORY =================
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    await model.deleteCategory(id);

    res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error("deleteCategory error:", err);
    res.status(500).json({ error: "Failed to delete category" });
  }
};