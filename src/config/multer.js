import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

/* ===============================
   COMMON LIMIT
================================ */

const FILE_LIMIT = 2 * 1024 * 1024; // 2MB

/* ===============================
   RESUME STORAGE (PDF / DOC)
================================ */

const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "tech2globe/resumes",
    resource_type: "auto", // important for non-image files
    public_id: Date.now() + "-" + file.originalname
  .replace(/\.[^/.]+$/, "") // remove extension
  .replace(/\s+/g, "_")
  .replace(/[^\w.-]/g, "")
  }),
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