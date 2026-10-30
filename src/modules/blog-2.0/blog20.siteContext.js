/**
 * Client website context for Blog-2.0 agent (Bright CRM on MailerLite).
 * Preview URLs are public — fetched periodically and merged with a static brief.
 */

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

/** Snapshot from client preview site — update when marketing copy changes. */
const BRIGHT_CRM_STATIC_BRIEF = `
## Bright CRM website (match this brand)

**Tagline:** Build Smarter. Manage Better.

**Product:** Bright CRM — CRM and project management for **construction companies** (clients, leads, projects, teams, quotations, follow-ups, one platform).

**Pain points the site emphasizes:** scattered information across spreadsheets; missed lead/quote follow-ups; lack of visibility for owners on sales, projects, and team performance.

**Platform pillars (use same language when relevant):**
- Centralized client management
- Lead & opportunity management (inquiry → quotation → project)
- Project & task management (deadlines, jobsite + office)
- Quotation & follow-up tracking
- Team collaboration (sales, PMs, admin, management)
- Reminders & follow-ups
- Reports & dashboards / business visibility
- Configurable around the customer's workflow (not rigid generic CRM)

**Site feature labels:** Lead Management, Client Management, Project Management, Task Management, Quotation Tracking, Team Management, Follow-Up Reminders, Reports & Dashboards, Workflow Management.

**Tone on site:** Professional, practical, construction-industry specific — benefits without hype; "structured and centralized" not "revolutionary AI".

**Blog role:** Educational posts for construction SMBs that naturally lead readers toward Bright CRM capabilities (do NOT copy homepage word-for-word; write fresh articles that fit the same blog section).

**CTA style (soft):** Optional closing line about bringing control to construction operations / discussing how CRM fits their process — not aggressive sales.
`.trim();

function cacheKey(siteUrl, blogUrl) {
  return `${siteUrl || ""}|${blogUrl || ""}`;
}

function stripHtmlToText(html, maxLen = 4500) {
  if (!html) return "";
  let text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;
  return text;
}

async function fetchPageText(url) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Tech2Globe-Blog20-SiteContext/1",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return "";
  const html = await res.text();
  return stripHtmlToText(html);
}

/**
 * @returns {Promise<{ homepage: string, blog: string, fetchedAt: number }>}
 */
async function fetchLiveSiteSnippets(settings) {
  const siteUrl = settings?.client_site_url?.trim();
  const blogUrl = settings?.client_blog_url?.trim() || `${siteUrl?.replace(/\/$/, "")}/blog`;
  const key = cacheKey(siteUrl, blogUrl);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit;

  const [homepage, blog] = await Promise.all([
    fetchPageText(siteUrl).catch(() => ""),
    fetchPageText(blogUrl).catch(() => ""),
  ]);

  const entry = { homepage, blog, fetchedAt: Date.now() };
  cache.set(key, entry);
  return entry;
}

/**
 * System-prompt block: align drafts with the client's MailerLite preview site.
 */
export async function buildClientSiteContextBlock(settings) {
  const siteUrl = settings?.client_site_url || "";
  const blogUrl = settings?.client_blog_url || siteUrl;
  const project = settings?.project_name || "Bright CRM";

  const parts = [
    "## Client website alignment (mandatory)",
    `- **Project:** ${project}`,
    `- **Live preview (write as if publishing here):** ${siteUrl}`,
    `- **Blog index:** ${blogUrl}`,
    "- Posts must read like they belong on this MailerLite site — same audience, terminology, and construction-CRM focus as the homepage.",
    "- Use HTML suitable for MailerLite blog editor: clear H2/H3 sections, short paragraphs, optional bullet lists, one focus keyword per post.",
    "- Do NOT mention Tech2Globe, internal tools, or fake URLs. Do NOT invent case studies unless user provided facts.",
    "",
    BRIGHT_CRM_STATIC_BRIEF,
  ];

  if (settings?.notes?.trim()) {
    parts.push("", "## Team notes (from Blog-2.0 settings)", settings.notes.trim());
  }

  try {
    const live = await fetchLiveSiteSnippets(settings);
    if (live.homepage) {
      parts.push(
        "",
        "## Homepage text snapshot (for vocabulary alignment — do not plagiarize)",
        live.homepage.slice(0, 2800),
      );
    }
    if (live.blog) {
      parts.push(
        "",
        "## Existing blog listing snapshot (write complementary topics; avoid duplicating titles)",
        live.blog.slice(0, 1800),
      );
    }
  } catch {
    /* static brief is enough */
  }

  return parts.join("\n");
}

/** Admin / refresh: clear cache after client changes site copy. */
export function clearClientSiteContextCache() {
  cache.clear();
}
