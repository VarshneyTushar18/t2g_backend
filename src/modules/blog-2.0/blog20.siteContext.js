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

/**
 * Posts already on the client MailerLite blog — new drafts must feel like siblings of these.
 * (Titles from https://preview.mailerlite.io/.../blog — refresh via live fetch when possible.)
 */
const BRIGHT_CRM_EXISTING_BLOG_STYLE = `
## Existing posts on the client blog (match THIS style)

These are live on the Bright CRM MailerLite blog. **Every new post must look like it was written by the same author for the same blog** — similar title pattern, depth, headings, and CRM-for-construction angle.

**Example titles already published:**
- Boosting Efficiency in SMBs with CRM (construction / small business focus)
- Understanding Human Work Error: Causes and Solutions
- Modern Workplaces with AI (practical workplace + tools, not sci-fi)
- Bright CRM: Simplify Your Sales, Manage Your Customers, Grow Your Business

**How to write the next post (mandatory template):**
1. **Title:** Clear benefit or question; construction SMB or CRM in scope; 8–14 words; Title Case.
2. **Excerpt / meta:** 1–2 sentences, 120–160 chars for meta; states who the article helps and the outcome.
3. **Length:** ~800–1,200 words unless the user asks otherwise.
4. **Structure:**
   - Opening: hook + problem (jobsite/office pain, e.g. missed follow-ups, scattered data).
   - **3–5 sections** with \`<h2>\` headings (concrete, not generic "Introduction").
   - Use \`<h3>\` sparingly; bullets where listing tips or steps.
   - Tie sections to Bright CRM capabilities naturally (leads, quotes, projects, reminders, visibility) — not a product brochure.
   - Close: short summary + soft CTA (e.g. bringing control to construction operations / exploring Bright CRM).
5. **Voice:** Same as existing posts — helpful expert, US/International English, **never say "Claude CRM"** (product name is **Bright CRM** only).
6. **Topics that fit this blog:** efficiency, quotation follow-up, CRM for contractors, team coordination, reducing errors, dashboards, AI as a workplace tool (balanced, not hype).
7. **Avoid:** Duplicating an existing title above; Tech2Globe; generic AI buzz without construction context; fake stats or client names.

When the user only gives a topic, **infer title, keyword, excerpt, and full HTML body** using this template — then call create_bright_crm_blog_draft.
`.trim();

function extractBlogTitlesFromListing(text) {
  if (!text) return [];
  const titles = [];
  const patterns = [
    /Boosting Efficiency[^.|\n]{0,80}/i,
    /Understanding Human Work Error[^.|\n]{0,80}/i,
    /Modern Workplaces with AI[^.|\n]{0,40}/i,
    /Bright CRM:[^.|\n]{0,100}/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) titles.push(m[0].trim());
  }
  return [...new Set(titles)];
}

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
    "- **Primary rule:** Generate blog posts **according to the existing posts on that blog URL** — same style, length, and construction-CRM focus as the articles already listed there (not generic internet blog style).",
    "- Use HTML for MailerLite blog editor: `<h2>`, `<h3>`, `<p>`, `<ul><li>`, optional `<strong>`.",
    "- Do NOT mention Tech2Globe, internal tools, or fake URLs. Do NOT invent case studies unless user provided facts.",
    "",
    BRIGHT_CRM_EXISTING_BLOG_STYLE,
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
      const titles = extractBlogTitlesFromListing(live.blog);
      parts.push(
        "",
        "## Live blog index (must match these posts' style)",
        titles.length
          ? `Detected titles: ${titles.map((t) => `"${t}"`).join("; ")}`
          : live.blog.slice(0, 1800),
        titles.length ? `\nFull listing text:\n${live.blog.slice(0, 1200)}` : "",
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
