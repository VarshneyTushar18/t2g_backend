import pool from "../../config/db.js";
import cloudinary from "../../config/cloudinary.js";

// ── Categories ─────────────────────────────────────────────────

export const getCategories = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM categories ORDER BY sort_order ASC");
    res.json(rows);
  } catch (err) {
    console.error("getCategories error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, sort_order = 0 } = req.body;
    const [result] = await pool.query(
      "INSERT INTO categories (name, sort_order) VALUES (?, ?)",
      [name, sort_order]
    );
    res.json({ id: result.insertId, name, sort_order });
  } catch (err) {
    console.error("createCategory error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    await pool.query(
      "UPDATE categories SET name = ?, sort_order = ? WHERE id = ?",
      [name, sort_order, req.params.id]
    );
    res.json({ message: "Category updated" });
  } catch (err) {
    console.error("updateCategory error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    await pool.query("DELETE FROM categories WHERE id = ?", [req.params.id]);
    res.json({ message: "Category deleted" });
  } catch (err) {
    console.error("deleteCategory error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── Subcategories ──────────────────────────────────────────────

export const getSubcategories = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM subcategories WHERE category_id = ? ORDER BY sort_order ASC",
      [req.params.categoryId]
    );
    res.json(rows);
  } catch (err) {
    console.error("getSubcategories error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const createSubcategory = async (req, res) => {
  try {
    const { category_id, name, sort_order = 0 } = req.body;
    const [result] = await pool.query(
      "INSERT INTO subcategories (category_id, name, sort_order) VALUES (?, ?, ?)",
      [category_id, name, sort_order]
    );
    res.json({ id: result.insertId, category_id, name, sort_order });
  } catch (err) {
    console.error("createSubcategory error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const updateSubcategory = async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    await pool.query(
      "UPDATE subcategories SET name = ?, sort_order = ? WHERE id = ?",
      [name, sort_order, req.params.id]
    );
    res.json({ message: "Subcategory updated" });
  } catch (err) {
    console.error("updateSubcategory error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const deleteSubcategory = async (req, res) => {
  try {
    await pool.query("DELETE FROM subcategories WHERE id = ?", [req.params.id]);
    res.json({ message: "Subcategory deleted" });
  } catch (err) {
    console.error("deleteSubcategory error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── Projects ───────────────────────────────────────────────────

export const getProjects = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM projects WHERE subcategory_id = ? ORDER BY sort_order ASC",
      [req.params.subcategoryId]
    );
    res.json(rows);
  } catch (err) {
    console.error("getProjects error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const createProject = async (req, res) => {
  try {

    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const { subcategory_id, title, description, project_link, sort_order = 0 } = req.body;

    const image_url = req.file?.path || null;

    const [result] = await pool.query(
      `INSERT INTO projects 
       (subcategory_id, title, description, image_url, project_link, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [subcategory_id, title, description, image_url, project_link, sort_order]
    );

    res.json({
      id: result.insertId,
      subcategory_id,
      title,
      description,
      image_url,
      project_link
    });

  } catch (err) {
    console.error("createProject error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { title, description, project_link, sort_order } = req.body;
    let image_url = req.body.existing_image;

    if (req.file) {
      image_url = req.file.path;
    }

    await pool.query(
      "UPDATE projects SET title = ?, description = ?, image_url = ?, project_link = ?, sort_order = ? WHERE id = ?",
      [title, description, image_url, project_link, sort_order, req.params.id]
    );
    res.json({ message: "Project updated" });
  } catch (err) {
    console.error("updateProject error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT image_url FROM projects WHERE id = ?", [req.params.id]);

    if (rows[0]?.image_url) {
      const publicId = rows[0].image_url.split("/").slice(-2).join("/").split(".")[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await pool.query("DELETE FROM projects WHERE id = ?", [req.params.id]);
    res.json({ message: "Project deleted" });
  } catch (err) {
    console.error("deleteProject error:", err.message);
    res.status(500).json({ message: err.message });
  }
};


// ── Portfolio Tree for Frontend ─────────────────────────────────


export const getPortfolioTree = async (req, res) => {
  try {
    const [categories] = await pool.query(
      "SELECT id, name FROM categories ORDER BY sort_order ASC"
    );

    const result = [];

    for (const category of categories) {

      const [subcategories] = await pool.query(
        "SELECT id, name FROM subcategories WHERE category_id = ? ORDER BY sort_order ASC",
        [category.id]
      );

      const subTabs = [];

      for (const sub of subcategories) {

        const [projects] = await pool.query(
        "SELECT title, image_url, project_link, description FROM projects WHERE subcategory_id = ? ORDER BY sort_order ASC",
          [sub.id]
        );

       subTabs.push({
  title: sub.name,
  items: projects.map(p => ({
    title: p.title,
    image_url: p.image_url,
    project_link: p.project_link,
    description: p.description
  }))
});
      }

      result.push({
        title: category.name,
        subTabs
      });
    }

    res.json(result);

  } catch (err) {
    console.error("getPortfolioTree error:", err);
    res.status(500).json({ message: err.message });
  }
};