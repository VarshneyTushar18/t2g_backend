export const BLOG_SOCIAL_PLATFORMS = [
  {
    id: "x",
    label: "X (Twitter)",
    shortLabel: "X",
    maxLength: 280,
    supportsLink: true,
    supportsImage: true,
    notes: "Text + link + optional image via X API.",
  },
  {
    id: "facebook",
    label: "Facebook Page",
    shortLabel: "Facebook",
    maxLength: 5000,
    supportsLink: true,
    supportsImage: true,
    notes: "Posts to a connected Facebook Page via Meta Graph API.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    shortLabel: "LinkedIn",
    maxLength: 3000,
    supportsLink: true,
    supportsImage: true,
    notes: "Company page or profile via LinkedIn API.",
  },
  {
    id: "instagram",
    label: "Instagram",
    shortLabel: "Instagram",
    maxLength: 2200,
    supportsLink: false,
    supportsImage: true,
    requiresImage: true,
    notes: "Business account — image required (Meta Graph API).",
  },
];

export const BLOG_SOCIAL_PLATFORM_IDS = BLOG_SOCIAL_PLATFORMS.map((p) => p.id);

export function getPlatform(id) {
  return BLOG_SOCIAL_PLATFORMS.find((p) => p.id === id) || null;
}

export function defaultSocialShareConfig() {
  return {
    x: { enabled: false, message: "" },
    facebook: { enabled: false, message: "" },
    linkedin: { enabled: false, message: "" },
    instagram: { enabled: false, message: "" },
  };
}

export function normalizeSocialShareInput(raw) {
  const base = defaultSocialShareConfig();
  if (!raw || typeof raw !== "object") return base;
  for (const platform of BLOG_SOCIAL_PLATFORM_IDS) {
    const row = raw[platform];
    if (!row || typeof row !== "object") continue;
    base[platform] = {
      enabled: Boolean(row.enabled),
      message: String(row.message || "").trim().slice(0, 5000),
    };
  }
  return base;
}

export function parseSocialShareFromRow(row) {
  if (!row?.social_share) return normalizeSocialShareInput(null);
  let parsed = row.social_share;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return normalizeSocialShareInput(null);
    }
  }
  return normalizeSocialShareInput(parsed);
}
