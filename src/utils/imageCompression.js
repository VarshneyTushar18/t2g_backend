import sharp from "sharp";

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 82;

/** Resize, strip metadata, and compress for Life gallery uploads. */
export async function compressLifeImage(buffer) {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();

  let pipeline = sharp(buffer, { failOn: "none" }).rotate();

  if ((meta.width ?? 0) > MAX_WIDTH || (meta.height ?? 0) > MAX_HEIGHT) {
    pipeline = pipeline.resize(MAX_WIDTH, MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (meta.hasAlpha) {
    const out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    return { buffer: out, format: "webp" };
  }

  const out = await pipeline
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return { buffer: out, format: "jpg" };
}
