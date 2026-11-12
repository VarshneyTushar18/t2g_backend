/** Module keys — must match admin panel dashboard tiles */
export const ADMIN_MODULES = [
  "leads",
  "portfolio",
  "career",
  "life",
  "testimonials",
  "case_studies",
  "blog",
  "blog_2_0",
];

export const SUPER_ADMIN_ROLE = "super_admin";

/** Default modules per role (matches your manual admin_users.role enum) */
export const ROLE_MODULES = {
  hr: ["career"],
  digital_marketing: ["portfolio", "testimonials", "case_studies", "blog"],
  /** Bright CRM / MailerLite project — assign to Sahil sir only */
  blog_2_0_project: ["blog_2_0"],
};
