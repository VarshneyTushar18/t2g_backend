import multer from "multer";
import { LIFE_GALLERY_MAX_FILES } from "../../config/multer.js";

const GALLERY_FIELD = /^gallery(\[\])?(\[\d+\])?$/;

/** Files sent as gallery, gallery[], gallery[0], etc. (folder/multi-select). */
export const getGalleryFiles = (files = []) =>
  files.filter((f) => GALLERY_FIELD.test(f.fieldname));

export const handleLifeGalleryUpload =
  (uploadMiddleware) => (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "Each image must be 5MB or smaller",
          });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            error: `Too many files. Maximum is ${LIFE_GALLERY_MAX_FILES} gallery images per request (plus one banner on create/update).`,
          });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            error:
              'Unexpected field. Use "banner" for the cover image and "gallery" for all other images.',
          });
        }
      }

      return res.status(400).json({ error: err.message || "Upload failed" });
    });
  };
