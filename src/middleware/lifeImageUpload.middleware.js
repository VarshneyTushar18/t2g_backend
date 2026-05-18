import { Readable } from "node:stream";
import cloudinary from "../config/cloudinary.js";
import { compressLifeImage } from "../utils/imageCompression.js";

const LIFE_FOLDER = "tech2globe/life-gallery";

const sanitizePublicId = (originalname = "image") =>
  `${Date.now()}-${originalname
    .replace(/\.[^/.]+$/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")}`;

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    Readable.from(buffer).pipe(uploadStream);
  });

/** Compress in memory, then upload to Cloudinary (Life routes only). */
export const uploadCompressedLifeImages = async (req, res, next) => {
  const files = req.files;
  if (!files?.length) return next();

  try {
    for (const file of files) {
      if (!file.buffer) continue;

      const { buffer, format } = await compressLifeImage(file.buffer);

      const result = await uploadBuffer(buffer, {
        folder: LIFE_FOLDER,
        resource_type: "image",
        format,
        public_id: sanitizePublicId(file.originalname),
      });

      file.path = result.secure_url;
      file.filename = result.public_id;
      file.size = buffer.length;
      delete file.buffer;
    }

    next();
  } catch (err) {
    console.error("uploadCompressedLifeImages error:", err);
    next(err);
  }
};
