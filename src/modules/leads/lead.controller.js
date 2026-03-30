import pool from "../../config/db.js";

/**
 * CREATE Lead
 */
export const createLead = async (req, res) => {
  try {
    let { name, email, country, phone, message, form_type, source_page } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required"
      });
    }

    // Sanitization
    name = String(name).trim();
    email = String(email).trim().toLowerCase();
    country = country ? String(country).trim() : null;
    phone = phone ? String(phone).trim() : null;
    message = message ? String(message).trim() : null;
    form_type = form_type ? String(form_type).trim() : null;
    source_page = source_page ? String(source_page).trim() : null;

    const query = `
      INSERT INTO leads 
      (name, email, country, phone, message, form_type, source_page)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(query, [
      name, email, country, phone, message, form_type, source_page
    ]);

    return res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Lead created"
    });

  } catch (error) {
    console.error("CREATE ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


/**
 * READ All Leads (Pagination + Sorting)
 */
export const getLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const allowedSort = ["id", "name", "email", "created_at"];
    const sortBy = allowedSort.includes(req.query.sortBy)
      ? req.query.sortBy
      : "id";

    const order = req.query.order === "ASC" ? "ASC" : "DESC";

    const query = `
      SELECT id, name, email, country, phone, form_type, source_page, created_at
      FROM leads
      ORDER BY ${sortBy} ${order}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.execute(query, [limit, offset]);

    return res.json({
      success: true,
      page,
      limit,
      data: rows
    });

  } catch (error) {
    console.error("READ ERROR:", error);
    return res.status(500).json({ success: false });
  }
};


/**
 * READ Single Lead
 */
export const getLeadById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, country, phone, message, form_type, source_page FROM leads WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    return res.json({ success: true, data: rows[0] });

  } catch (error) {
    console.error("GET BY ID ERROR:", error);
    return res.status(500).json({ success: false });
  }
};


/**
 * UPDATE Lead
 */
export const updateLead = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    let { name, email, country, phone, message, form_type, source_page } = req.body;

    // Optional validation (only update if provided)
    const fields = [];
    const values = [];

    if (name) {
      fields.push("name = ?");
      values.push(String(name).trim());
    }

    if (email) {
      fields.push("email = ?");
      values.push(String(email).trim().toLowerCase());
    }

    if (country) {
      fields.push("country = ?");
      values.push(String(country).trim());
    }

    if (phone) {
      fields.push("phone = ?");
      values.push(String(phone).trim());
    }

    if (message) {
      fields.push("message = ?");
      values.push(String(message).trim());
    }

    if (form_type) {
      fields.push("form_type = ?");
      values.push(String(form_type).trim());
    }

    if (source_page) {
      fields.push("source_page = ?");
      values.push(String(source_page).trim());
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    const query = `
      UPDATE leads
      SET ${fields.join(", ")}
      WHERE id = ?
    `;

    values.push(id);

    const [result] = await pool.execute(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    return res.json({ success: true, message: "Lead updated" });

  } catch (error) {
    console.error("UPDATE ERROR:", error);
    return res.status(500).json({ success: false });
  }
};


/**
 * DELETE Lead
 */
export const deleteLead = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const [result] = await pool.execute(
      "DELETE FROM leads WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    return res.json({ success: true, message: "Lead deleted" });

  } catch (error) {
    console.error("DELETE ERROR:", error);
    return res.status(500).json({ success: false });
  }
};