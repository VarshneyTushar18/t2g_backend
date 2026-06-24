/** Main blog filter groups (service tabs → many WordPress category slugs). */
const MAIN_BLOG_CATEGORY_GROUPS = {
  "amazon-walmart-consulting": {
    likes: ["amazon-%", "walmart-%"],
    slugs: [
      "sell-on-amazon",
      "become-an-amazon-seller",
      "myntra-account-management",
    ],
  },
  ecommerce: {
    likes: ["ecommerce%"],
  },
  "digital-marketing": {
    likes: ["digital-marketing%"],
    slugs: [
      "seo",
      "social-media-marketing",
      "social-media",
      "content-marketing",
      "email-marketing",
      "google-ads",
      "google-adwords",
      "facebook-ads",
      "linkedin-ads",
      "marketing",
      "advertising",
      "influencer-marketing-services",
      "local-seo",
      "generative-engine-optimization",
      "guest-posting",
      "b2b-marketing",
      "link-building",
      "link-building-package",
      "lead-generation",
      "promote-your-brand-on-social-media",
      "push-pull-marketing",
      "effects-of-social-media",
    ],
  },
  "data-management": {
    likes: [
      "data-entry%",
      "data-extraction%",
      "data-mining%",
      "menu-data-entry%",
      "restaurant-menu%",
    ],
    slugs: [
      "data-management",
      "data-conversions",
      "document-processing",
      "offline-data-entry",
      "online-data-entry-services",
    ],
  },
  "bpo-kpo": {
    likes: ["call-centre%"],
    slugs: [
      "inbound-call-center",
      "customer-support",
      "outsourcing",
      "virtual-assistant-services",
      "cctv-monitoring-services",
      "technical-support-services",
      "insurance-claim",
      "insurance-claims-processing",
    ],
  },
  "data-analytics-for-iot": {
    slugs: ["data-analytics", "artificial-intelligence", "video-analytics"],
  },
  "finance-accounting": {
    empty: true,
  },
  "graphic-video": {
    slugs: ["graphic-designing", "video-marketing", "video-analytics"],
  },
};

export function buildPublishedCategoryFilter(category = "") {
  const normalized = String(category).trim();
  if (!normalized) return null;

  const group = MAIN_BLOG_CATEGORY_GROUPS[normalized];
  if (!group) {
    return {
      sql: ` AND EXISTS (
        SELECT 1
        FROM blog_post_categories pc2
        INNER JOIN blog_categories c2 ON c2.id = pc2.category_id
        WHERE pc2.post_id = p.id
          AND (c2.slug = ? OR c2.name = ?)
      )`,
      params: [normalized, normalized.replace(/-/g, " ")],
    };
  }

  if (group.empty) {
    return {
      sql: " AND 1 = 0",
      params: [],
    };
  }

  const parts = [];
  const params = [];

  for (const like of group.likes || []) {
    parts.push("c2.slug LIKE ?");
    params.push(like);
  }
  for (const slug of group.slugs || []) {
    parts.push("c2.slug = ?");
    params.push(slug);
  }

  return {
    sql: ` AND EXISTS (
      SELECT 1
      FROM blog_post_categories pc2
      INNER JOIN blog_categories c2 ON c2.id = pc2.category_id
      WHERE pc2.post_id = p.id
        AND (${parts.join(" OR ")})
    )`,
    params,
  };
}
