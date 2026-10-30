/** Persistent rules for Blog Agent when running scheduled automations (guidelines id=4). */
export const BLOG_AUTOMATION_GUIDELINES_ID = 4;

export const DEFAULT_BLOG_AUTOMATION_MEMORY = `Tech2Globe — Main blog automations (NOT Blog-2.0 / MailerLite)

Always follow on every automated create_blog_post:

1. TITLE — Use a specific, human SEO title from the topic (never "Open Draft" or placeholder ids).
2. SLUG — Derive URL slug from the final title (lowercase, hyphens, no special chars). Pass slug explicitly in create_blog_post.
3. CATEGORIES — When topic includes category IDs, pass categoryIds exactly. Do not skip categories.
4. SEO — Always set metaTitle (~60 chars), metaDescription (~155 chars), focusKeyword, and slug aligned with the title.
5. IMAGES — Set featured_image from pick_blog_image when needed. Use descriptive alt text tied to the article title (not generic "Blog image").
6. CONTENT — Full article in create_blog_post; approval preview must show complete HTML body.
7. OUTPUT — After create, response must include: id: {number} and https://www.tech2globe.com/blogs/{slug}

When updating posts (update_blog_post): if title changes, regenerate slug and SEO fields to match unless user forbids it.

Do not ask clarifying questions during automation runs — write immediately.`;
