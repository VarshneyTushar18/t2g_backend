export const SITE = "https://www.tech2globe.com";

/** Keyword → tech2globe.com service page. All-caps keywords match case-sensitively. */
export const LINK_TARGETS = [
  { path: "/generative-ai-solutions", keywords: ["generative AI", "GenAI"] },
  { path: "/conversational-ai-solutions", keywords: ["conversational AI"] },
  { path: "/ai-chatbot-development", keywords: ["AI chatbots", "AI chatbot", "chatbots", "chatbot"] },
  {
    path: "/machine-learning-services-and-consultation",
    keywords: ["machine learning", "ML models"],
  },
  { path: "/ai-content-generation", keywords: ["AI content generation", "AI-generated content"] },
  { path: "/marketing-automation-with-ai", keywords: ["marketing automation"] },
  { path: "/workflow-automation", keywords: ["workflow automation"] },
  { path: "/process-automation-consulting", keywords: ["process automation", "business automation"] },
  { path: "/ai-for-ecommerce", keywords: ["AI for ecommerce", "AI in ecommerce", "AI in e-commerce"] },
  { path: "/ai-data-annotation-services", keywords: ["data annotation", "data labeling"] },
  { path: "/custom-ai-development", keywords: ["artificial intelligence", "AI"] },
  { path: "/seo-aeo-geo-services", keywords: ["generative engine optimization", "answer engine optimization", "AEO", "GEO"] },
  { path: "/local-seo-packages", keywords: ["local SEO"] },
  { path: "/seo-services", keywords: ["search engine optimization", "SEO"] },
  { path: "/amazon-ppc-services", keywords: ["Amazon PPC"] },
  { path: "/ppc-management-services", keywords: ["pay-per-click", "PPC"] },
  { path: "/paid-search-advertising-services", keywords: ["Google Ads", "paid search"] },
  { path: "/digital-marketing-services", keywords: ["digital marketing"] },
  { path: "/social-media-marketing", keywords: ["social media marketing"] },
  { path: "/email-marketing-services", keywords: ["email marketing"] },
  { path: "/content-marketing-services", keywords: ["content marketing"] },
  { path: "/influencer-marketing-agency", keywords: ["influencer marketing"] },
  { path: "/lead-generation-services", keywords: ["lead generation"] },
  { path: "/facebook-marketing-and-advertising-services", keywords: ["Facebook ads", "Facebook advertising"] },
  { path: "/linkedin-marketing-services", keywords: ["LinkedIn marketing"] },
  { path: "/instagram-marketing-services", keywords: ["Instagram marketing"] },
  { path: "/microsoft-power-bi-consulting-services", keywords: ["Power BI"] },
  { path: "/data-analytics-services", keywords: ["data analytics"] },
  { path: "/data-entry-services", keywords: ["data entry"] },
  { path: "/data-extraction-services", keywords: ["data extraction"] },
  { path: "/web-scraping-services", keywords: ["web scraping"] },
  { path: "/data-mining-services", keywords: ["data mining"] },
  { path: "/software-development", keywords: ["software development", "custom software"] },
  { path: "/mobile-app-development", keywords: ["mobile app development", "app development"] },
  { path: "/web-development", keywords: ["web development", "website development"] },
  { path: "/ui-ux-design-services", keywords: ["UI/UX design", "UX design", "UI/UX"] },
  { path: "/shopify-development-company", keywords: ["Shopify"] },
  { path: "/woocommerce-development", keywords: ["WooCommerce"] },
  { path: "/magento-development-company", keywords: ["Magento"] },
  { path: "/bigcommerce-development-services", keywords: ["BigCommerce"] },
  { path: "/wordpress-development", keywords: ["WordPress"] },
  { path: "/blockchain-development-services", keywords: ["blockchain"] },
  { path: "/graphic-design-services", keywords: ["graphic design"] },
  { path: "/virtual-assistant-services", keywords: ["virtual assistant", "virtual assistants"] },
  { path: "/it-staffing", keywords: ["IT staffing"] },
  { path: "/amazon-advertising-services", keywords: ["Amazon advertising", "Amazon ads"] },
  { path: "/amazon-seo-listing-optimization", keywords: ["Amazon SEO", "Amazon listing optimization"] },
  { path: "/amazon-account-management", keywords: ["Amazon account management"] },
  { path: "/amazon-fba-consulting", keywords: ["Amazon FBA", "FBA"] },
  { path: "/amazon-dsp", keywords: ["Amazon DSP"] },
  { path: "/amazon-seller-central-management", keywords: ["Seller Central"] },
  { path: "/amazon-vendor-central-management", keywords: ["Vendor Central"] },
  { path: "/amazon-consulting-services", keywords: ["Amazon consulting", "Amazon consultant"] },
  { path: "/walmart-marketplace-management-services", keywords: ["Walmart Marketplace", "Walmart marketplace"] },
  { path: "/tiktok-shop-management-services", keywords: ["TikTok Shop"] },
  { path: "/google-shopping-management-services", keywords: ["Google Shopping"] },
  { path: "/ecommerce-customer-support", keywords: ["ecommerce customer support", "e-commerce customer support"] },
  { path: "/image-editing-services", keywords: ["image editing", "photo editing"] },
  { path: "/cctv-monitoring-services", keywords: ["CCTV monitoring"] },
];

/** Text inside these tags is never linked. */
const SKIP_TAGS = new Set([
  "a", "h1", "h2", "h3", "h4", "h5", "h6",
  "code", "pre", "script", "style", "button", "figcaption", "title",
]);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function keywordRegex(keyword) {
  const caseSensitive = keyword === keyword.toUpperCase();
  return new RegExp(
    `(^|[^A-Za-z0-9_\\-])(${escapeRegex(keyword)})(?![A-Za-z0-9_])`,
    caseSensitive ? "" : "i",
  );
}

const PATTERNS = LINK_TARGETS.flatMap(({ path, keywords }) =>
  keywords.map((keyword) => ({ path, keyword, re: keywordRegex(keyword) })),
).sort((a, b) => b.keyword.length - a.keyword.length);

/** Link the first eligible occurrence of `re` in body text; returns new html or null. */
function linkFirstOccurrence(html, re, href) {
  const parts = html.split(/(<[^>]+>)/);
  const open = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith("<")) {
      const m = part.match(/^<\s*(\/)?\s*([a-zA-Z0-9]+)/);
      if (!m) continue;
      const tag = m[2].toLowerCase();
      if (!SKIP_TAGS.has(tag) || part.endsWith("/>")) continue;
      if (m[1]) {
        const idx = open.lastIndexOf(tag);
        if (idx !== -1) open.splice(idx, 1);
      } else {
        open.push(tag);
      }
      continue;
    }
    if (open.length) continue;
    const match = part.match(re);
    if (!match) continue;
    const start = match.index + match[1].length;
    const word = match[2];
    parts[i] =
      `${part.slice(0, start)}<a href="${href}">${word}</a>${part.slice(start + word.length)}`;
    return parts.join("");
  }
  return null;
}

/**
 * Adds internal links to tech2globe.com service pages for known keywords.
 * Each page is linked at most once; longer phrases win over shorter ones.
 */
export function addInternalLinks(html, { maxLinks = 8 } = {}) {
  if (!html || typeof html !== "string") return html;
  let out = html;
  const usedPaths = new Set();
  let added = 0;

  for (const { path, re } of PATTERNS) {
    if (added >= maxLinks) break;
    if (usedPaths.has(path)) continue;
    const href = `${SITE}${path}`;
    if (out.includes(`href="${href}"`) || out.includes(`href="${path}"`)) {
      usedPaths.add(path);
      continue;
    }
    const next = linkFirstOccurrence(out, re, href);
    if (next) {
      out = next;
      usedPaths.add(path);
      added += 1;
    }
  }
  return out;
}
