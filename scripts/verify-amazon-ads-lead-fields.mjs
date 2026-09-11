import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const REQUIRED_COLUMNS = [
  "company",
  "website",
  "marketplaces",
  "spend_band",
  "role",
];

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
});

try {
  const [columns] = await pool.execute(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'leads'
      AND COLUMN_NAME IN (${REQUIRED_COLUMNS.map(() => "?").join(", ")})
    `,
    [process.env.DB_NAME, ...REQUIRED_COLUMNS],
  );

  const found = columns.map((row) => row.COLUMN_NAME);
  const missing = REQUIRED_COLUMNS.filter((name) => !found.includes(name));

  console.log(`Database: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
  console.log(`Found columns: ${found.join(", ") || "(none)"}`);

  if (missing.length) {
    console.error(`Missing columns: ${missing.join(", ")}`);
    console.error("Run: node scripts/migrate-amazon-ads-lead-fields.mjs");
    process.exitCode = 1;
  } else {
    console.log("OK: all Amazon Ads lead columns exist");
  }

  const [latest] = await pool.execute(
    `
    SELECT id, name, company, website, marketplaces, spend_band, role, form_type, created_at
    FROM leads
    WHERE form_type = 'amazon_ads'
    ORDER BY id DESC
    LIMIT 3
    `,
  );

  if (latest.length) {
    console.log("Latest amazon_ads leads:");
    for (const row of latest) {
      console.log(
        `- #${row.id} ${row.name} | ${row.company || "-"} | ${row.spend_band || "-"} | ${row.created_at}`,
      );
    }
  } else {
    console.log("No amazon_ads leads yet (table ready)");
  }
} catch (error) {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
