/** Blog-only HTML helpers. Does not use blog.tech2globe.com. */

const LEGACY_BLOG_HOST =
  /https?:\/\/(?:blog\.tech2globe\.com|(?:www\.)?tech2globe\.com\/blog)/gi;

const siteBase = (settings = {}) =>
  (
    settings.media_base_url ||
    process.env.SITE_URL ||
    process.env.CLIENT_URL_MAIN ||
    "https://www.tech2globe.com"
  ).replace(/\/$/, "");

/** Point old WordPress host URLs at the main site — never bare res.cloudinary.com. */
export const rewriteLegacyBlogHost = (url = "", settings = {}) => {
  if (!url || typeof url !== "string") return url;
  if (/^https?:\/\/res\.cloudinary\.com\/image\//i.test(url)) return url;
  if (/^https?:\/\/res\.cloudinary\.com\/wp-content\//i.test(url)) {
    return url.replace(
      /^https?:\/\/res\.cloudinary\.com/i,
      "https://blog.tech2globe.com",
    );
  }
  const base = siteBase(settings);
  if (/^https?:\/\/res\.cloudinary\.com\/?$/i.test(base)) {
    return url.replace(LEGACY_BLOG_HOST, "https://www.tech2globe.com");
  }
  return url.replace(LEGACY_BLOG_HOST, base);
};

export const rewriteBlogContentHtml = (html = "", settings = {}) => {
  if (!html || typeof html !== "string") return html;

  const base = siteBase(settings);
  let out = rewriteLegacyBlogHost(html, settings);
  return out.replace(
    /src=(["'])(\/(?!\/)[^"']+)\1/gi,
    (_, q, path) => `src=${q}${base}${path}${q}`,
  );
};

export const normalizeFeaturedImage = (url, settings = {}) => {
  if (!url || typeof url !== "string") return "";
  const trimmed = rewriteLegacyBlogHost(url.trim(), settings);
  if (!trimmed) return settings.default_featured_image || "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${siteBase(settings)}${trimmed}`;
  }
  return trimmed;
};
