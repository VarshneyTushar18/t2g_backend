import multer from "multer";
import { BLOG_UPLOAD_LIMITS } from "../../config/multer.js";

export const handleBlogUpload = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `Featured image must be ${BLOG_UPLOAD_LIMITS.fileSize / (1024 * 1024)}MB or smaller`,
        });
      }
      if (err.code === "LIMIT_FIELD_VALUE") {
        return res.status(413).json({
          error:
            "Blog content is too large. Try removing pasted images or splitting the post.",
        });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          error: 'Unexpected file field. Use "featured_image" for the cover image only.',
        });
      }
    }

    return res.status(400).json({ error: err.message || "Upload failed" });
  });
};
