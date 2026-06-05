import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";
import path from "node:path";

/* ===============================
   COMMON LIMIT
================================ */

const FILE_LIMIT = 2 * 1024 * 1024; // 2MB

/* ===============================
   RESUME STORAGE (PDF / DOC)
================================ */

const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "resume", ext)
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "");
    const safeExt = [".pdf", ".doc", ".docx"].includes(ext) ? ext : "";

    return {
      folder: "tech2globe/resumes",
      // upload_stream stores PDFs/DOCs as image delivery; raw URLs 404.
      resource_type: "auto",
      public_id: `${Date.now()}-${base}${safeExt}`,
    };
  },
});

const resumeFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, DOC, and DOCX files are allowed"), false);
  }
};

export const resumeUpload = multer({
  storage: resumeStorage,
  fileFilter: resumeFilter,
  limits: { fileSize: FILE_LIMIT },
});

/* ===============================
   IMAGE STORAGE (GALLERY)
================================ */

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "tech2globe/life-gallery",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
  }),
});

const imageFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WEBP images are allowed"), false);
  }
};

export const imageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: FILE_LIMIT },
});

/* ===============================
   LIFE GALLERY (BULK / FOLDER)
================================ */

/** Max gallery images per request (+1 slot for banner on create/update). */
export const LIFE_GALLERY_MAX_FILES = 150;
const LIFE_GALLERY_FILE_SIZE = 5 * 1024 * 1024; // 5MB per image (before compression)

const lifeGalleryMemoryStorage = multer.memoryStorage();

/** Life uploads: memory → compress (sharp) → Cloudinary in middleware. */
export const lifeGalleryUpload = multer({
  storage: lifeGalleryMemoryStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: LIFE_GALLERY_FILE_SIZE,
    files: LIFE_GALLERY_MAX_FILES + 1,
  },
});

/* ===============================
   TESTIMONIAL STORAGE
================================ */

const testimonialStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "tech2globe/testimonials",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
  }),
});

export const testimonialUpload = multer({
  storage: testimonialStorage,
  fileFilter: imageFilter,
  limits: { fileSize: FILE_LIMIT },
});

/* ===============================
   CASE STUDIES STORAGE
================================ */

const caseStudiesStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "tech2globe/case-studies",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
  }),
});

export const caseStudiesUpload = multer({
  storage: caseStudiesStorage,
  fileFilter: imageFilter,
  limits: { fileSize: FILE_LIMIT },
});