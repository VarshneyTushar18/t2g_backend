/** Blog-only HTML helpers. Does not use blog.tech2globe.com. */

const siteBase = (settings = {}) =>
  (
    settings.media_base_url ||
    process.env.SITE_URL ||
    process.env.CLIENT_URL_MAIN ||
    "https://www.tech2globe.com"
  ).replace(/\/$/, "");

export const rewriteBlogContentHtml = (html = "", settings = {}) => {
  if (!html || typeof html !== "string") return html;

  const base = siteBase(settings);
  return html.replace(
    /src=(["'])(\/(?!\/)[^"']+)\1/gi,
    (_, q, path) => `src=${q}${base}${path}${q}`,
  );
};

export const normalizeFeaturedImage = (url, settings = {}) => {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return settings.default_featured_image || "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${siteBase(settings)}${trimmed}`;
  }
  return trimmed;
};
