import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const SQL = `
ALTER TABLE leads
  ADD COLUMN company VARCHAR(255) DEFAULT NULL AFTER phone,
  ADD COLUMN website VARCHAR(500) DEFAULT NULL AFTER company,
  ADD COLUMN marketplaces VARCHAR(500) DEFAULT NULL AFTER website,
  ADD COLUMN spend_band VARCHAR(50) DEFAULT NULL AFTER marketplaces,
  ADD COLUMN role VARCHAR(100) DEFAULT NULL AFTER spend_band
`;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
});

try {
  await pool.execute(SQL);
  console.log("Migration OK: columns added to leads");
} catch (error) {
  if (error.code === "ER_DUP_FIELDNAME") {
    console.log("Migration OK: columns already exist");
  } else {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
