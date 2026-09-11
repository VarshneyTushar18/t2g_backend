/** Base URL for legacy relative image paths (e.g. /images/... on the main site). */
export const mediaBaseUrl = () =>
  (
    process.env.MEDIA_BASE_URL ||
    process.env.SITE_URL ||
    process.env.CLIENT_URL_MAIN ||
    "https://www.tech2globe.com"
  ).replace(/\/$/, "");

/** Turn DB paths into absolute URLs. Cloudinary / full URLs are left unchanged. */
export const resolveMediaUrl = (path) => {
  if (!path || typeof path !== "string") return path ?? null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = mediaBaseUrl();
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
};

export const resolveMediaUrls = (paths) =>
  Array.isArray(paths) ? paths.map(resolveMediaUrl).filter(Boolean) : [];
