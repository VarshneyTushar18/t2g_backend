import fs from "node:fs/promises";
import path from "node:path";
import pool from "../config/db.js";

const DEFAULT_ROOT = "uploads/life-gallery";
const MANIFEST_FILE = "_manifest.jsonl";

const isEnabled = () =>
  String(process.env.LIFE_LOCAL_BACKUP_ENABLED ?? "true").toLowerCase() !==
  "false";

const backupRoot = () =>
  path.resolve(process.cwd(), process.env.LIFE_LOCAL_BACKUP_ROOT || DEFAULT_ROOT);

const sanitizeSegment = (value, fallback) => {
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return s || fallback;
};

const sanitizeFilename = (originalname = "image", format = "jpg") => {
  const base = String(originalname)
    .replace(/\.[^/.]+$/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "");
  return `${Date.now()}-${base || "image"}.${format}`;
};

const subfolderForField = (fieldname = "") =>
  fieldname === "banner" ? "banners" : "gallery";

async function resolveCategoryYear(req) {
  const fromBody = {
    category: req.body?.category,
    year: req.body?.year,
  };

  if (fromBody.category && fromBody.year) {
    return {
      category: sanitizeSegment(fromBody.category, "uncategorized"),
      year: sanitizeSegment(fromBody.year, "unknown"),
    };
  }

  const itemId = req.params?.id;
  if (!itemId) {
    return { category: "uncategorized", year: "unknown" };
  }

  try {
    const [rows] = await pool.query(
      `SELECT category, year FROM life_gallery WHERE id = ? LIMIT 1`,
      [itemId],
    );
    const row = rows[0];
    if (row) {
      return {
        category: sanitizeSegment(row.category, "uncategorized"),
        year: sanitizeSegment(row.year, "unknown"),
      };
    }
  } catch (err) {
    console.warn("lifeLocalBackup: could not load item context:", err.message);
  }

  return { category: "uncategorized", year: "unknown" };
}

async function appendManifest(entry) {
  const manifestPath = path.join(backupRoot(), MANIFEST_FILE);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.appendFile(manifestPath, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * Save a compressed Life image copy on disk (Cloudinary remains primary).
 * Never throws — upload flow must not break if local backup fails.
 */
export async function backupLifeImage({
  buffer,
  format,
  fieldname,
  originalname,
  cloudinaryUrl,
  req,
}) {
  if (!isEnabled() || !buffer?.length) return null;

  try {
    const { category, year } = await resolveCategoryYear(req);
    const subfolder = subfolderForField(fieldname);
    const filename = sanitizeFilename(originalname, format);

    const relativeDir = path.join(category, year, subfolder);
    const absoluteDir = path.join(backupRoot(), relativeDir);
    await fs.mkdir(absoluteDir, { recursive: true });

    const absolutePath = path.join(absoluteDir, filename);
    await fs.writeFile(absolutePath, buffer);

    const relativePath = path.posix.join(
      (process.env.LIFE_LOCAL_BACKUP_ROOT || DEFAULT_ROOT).replace(/\\/g, "/"),
      relativeDir.replace(/\\/g, "/"),
      filename,
    );

    await appendManifest({
      cloudinaryUrl,
      localRelative: relativePath,
      category,
      year,
      type: subfolder === "banners" ? "banner" : "gallery",
      originalname,
      savedAt: new Date().toISOString(),
    });

    return { absolutePath, relativePath };
  } catch (err) {
    console.error("lifeLocalBackup: failed to save local copy:", err.message);
    return null;
  }
}
