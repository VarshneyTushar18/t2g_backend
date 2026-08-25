import multer from "multer";
import { resumeUpload, RESUME_FILE_LIMIT } from "../../config/multer.js";

const MAX_RESUME_MB = RESUME_FILE_LIMIT / (1024 * 1024);

export const handleResumeUpload = (req, res, next) => {
  resumeUpload.single("resume")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `Resume must be ${MAX_RESUME_MB}MB or smaller.`,
        });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          error: 'Unexpected file field. Please upload using the "resume" field.',
        });
      }
      return res.status(400).json({
        error: err.message || "Resume upload failed.",
      });
    }

    return res.status(400).json({
      error: err.message || "Only PDF, DOC, DOCX, JPG, and PNG files are allowed.",
    });
  });
};
