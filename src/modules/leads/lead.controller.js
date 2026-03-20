import pool from "../../config/db.js";

export const CreatedLead = async (req, res) => {
  try {

    const { name, email, country, phone, message, form_type, source_page } = req.body;

    const query = `
      INSERT INTO leads
      (name, email, country, phone, message, form_type, source_page)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.execute(query, [
      name,
      email,
      country,
      phone,
      message,
      form_type,
      source_page
    ]);

    res.status(200).json({
      success: true,
      message: "Lead created"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
};

export const getLeads = async (req, res) => {
  try {

    const [rows] = await pool.query(
      "SELECT * FROM leads ORDER BY id DESC"
    );

    res.json(rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Server error"
    });

  }
};