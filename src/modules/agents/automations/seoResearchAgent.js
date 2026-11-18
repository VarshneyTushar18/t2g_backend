import { OpenAI } from "openai";
import { getRuntimeConfig } from "../ai-integrations/aiIntegrations.model.js";
import { getDefaultModel } from "../lib/openai.js";
import * as blogModel from "../../blog/blog.model.js";
import { fetchGoogleNewsHeadlines } from "./trendingTopicDiscovery.js";
import { LINK_TARGETS, SITE } from "../blog/blogInternalLinks.js";

const TECH2GLOBE_HOST = "tech2globe.com";

async function serperSearch(query) {
  const key = process.env.SERPER_API_KEY || process.env.SERPER_KEY;
  if (!key) return null;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    organic: (Array.isArray(data.organic) ? data.organic : [])
      .map((r) => ({ title: r.title || "", snippet: r.snippet || "", link: r.link || "" }))
      .filter((r) => r.title && r.link),
    peopleAlsoAsk: (Array.isArray(data.peopleAlsoAsk) ? data.peopleAlsoAsk : [])
      .map((r) => r.question)
      .filter(Boolean),
    relatedSearches: (Array.isArray(data.relatedSearches) ? data.relatedSearches : [])
      .map((r) => r.query)
      .filter(Boolean),
  };
}

async function loadPublishedPosts(limit = 80) {
  try {
    const res = await blogModel.getAllAdmin({ page: 1, limit, search: "" });
    return (res.data || [])
      .filter((p) => p.status === "publish" && p.slug && p.title)
      .map((p) => ({ title: p.title, url: `${SITE}/blogs/${p.slug}` }));
  } catch {
    return [];
  }
}

function parseJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : raw);
}

const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const normUrl = (u) => String(u || "").trim().replace(/\/+$/, "").toLowerCase();

/**
 * Research agent: gathers live search signals and returns an SEO brief for the writer.
 * Every URL in the brief is checked against data actually fetched (no invented links).
 */
export async function researchTopic({ topic, niche = "", notes = "" }) {
  const limitations = [];
  const [serp, news, posts] = await Promise.all([
    serperSearch(topic).catch(() => null),
    fetchGoogleNewsHeadlines(topic, 10).catch(() => []),
    loadPublishedPosts(),
  ]);

  if (!serp) {
    limitations.push(
      "SERPER_API_KEY is not set on the server, so live Google results, competitor pages and 'People also ask' questions were not available. Competitor analysis is limited.",
    );
  }
  if (!news.length) limitations.push("No recent news headlines were found for this topic.");
  limitations.push(
    "Search volumes and keyword difficulty were not measured (no keyword tool connected); keywords are chosen from search results and intent.",
  );

  const competitors = (serp?.organic || [])
    .filter((r) => !r.link.includes(TECH2GLOBE_HOST))
    .slice(0, 6);
  const servicePages = LINK_TARGETS.map((t) => ({
    url: `${SITE}${t.path}`,
    about: t.keywords.join(", "),
  }));

  const config = await getRuntimeConfig();
  if (!config.apiKey) {
    throw new Error("AI is not configured. Set API key in Admin → Connect → AI Integrations.");
  }
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
      "HTTP-Referer": config.siteUrl,
      "X-Title": config.siteName || "Tech2Globe SEO Research Agent",
    },
  });

  const completion = await client.chat.completions.create({
    model: config.defaultModel || getDefaultModel(),
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the SEO research agent for Tech2Globe (https://www.tech2globe.com), a digital marketing, e-commerce, AI and IT services company. You have 10+ years of SEO, AEO, GEO and E-E-A-T experience.
Analyze ONLY the data provided. Never invent statistics, keyword volumes, competitor findings or URLs.
Every URL you output must be copied exactly from the provided lists.
Return JSON with these keys:
{
  "title": "improved SEO blog title",
  "primary_keyword": "...",
  "secondary_keywords": ["..."],
  "semantic_keywords": ["..."],
  "search_intent": "informational|commercial|transactional|navigational + one sentence why",
  "target_audience": "...",
  "target_location": "country/city or 'Global'",
  "main_goal": "Traffic|Leads|Brand Awareness|Service Promotion",
  "research_summary": "4-6 sentences: what currently ranks, what users want, our angle",
  "competitors": [{ "url": "...", "title": "...", "covers": "...", "gap": "what they miss" }],
  "content_gaps": ["..."],
  "outline": [{ "h2": "...", "h3": ["..."] }],
  "faqs": ["4-8 real user questions"],
  "internal_links": [{ "url": "...", "anchor": "natural anchor text", "why": "..." }],
  "sources": [{ "url": "...", "title": "...", "use_for": "..." }],
  "cannibalization_risk": "none|low|high + which existing Tech2Globe post overlaps"
}`,
      },
      {
        role: "user",
        content: [
          `Topic: ${topic}`,
          niche ? `Business niche/focus: ${niche}` : "",
          notes ? `Editor notes: ${notes}` : "",
          "",
          "## Google results for the topic (competitors + citable sources)",
          competitors.length
            ? competitors
                .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`)
                .join("\n")
            : "(not available)",
          "",
          "## People also ask",
          serp?.peopleAlsoAsk?.length ? serp.peopleAlsoAsk.join("\n") : "(not available)",
          "",
          "## Related searches",
          serp?.relatedSearches?.length ? serp.relatedSearches.join("\n") : "(not available)",
          "",
          "## Recent news headlines (trend signals, not citable)",
          news.length ? news.join("\n") : "(none)",
          "",
          "## Tech2Globe service pages (allowed internal links)",
          servicePages.map((p) => `${p.url} — ${p.about}`).join("\n"),
          "",
          "## Existing Tech2Globe blog posts (allowed internal links; check cannibalization)",
          posts.length ? posts.map((p) => `${p.url} — ${p.title}`).join("\n") : "(none)",
        ]
          .filter((l) => l !== "")
          .join("\n"),
      },
    ],
  });

  let brief;
  try {
    brief = parseJson(completion?.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("Research agent returned an unreadable brief.");
  }

  const competitorUrls = new Set(competitors.map((r) => normUrl(r.link)));
  const internalUrls = new Set([
    ...servicePages.map((p) => normUrl(p.url)),
    ...posts.map((p) => normUrl(p.url)),
  ]);

  const result = {
    title: String(brief.title || topic).trim(),
    primary_keyword: String(brief.primary_keyword || "").trim(),
    secondary_keywords: asList(brief.secondary_keywords).map(String),
    semantic_keywords: asList(brief.semantic_keywords).map(String),
    search_intent: String(brief.search_intent || ""),
    target_audience: String(brief.target_audience || ""),
    target_location: String(brief.target_location || ""),
    main_goal: String(brief.main_goal || ""),
    research_summary: String(brief.research_summary || ""),
    competitors: asList(brief.competitors).filter((c) => competitorUrls.has(normUrl(c.url))),
    content_gaps: asList(brief.content_gaps).map(String),
    outline: asList(brief.outline),
    faqs: asList(brief.faqs).map(String).slice(0, 8),
    internal_links: asList(brief.internal_links).filter((l) => internalUrls.has(normUrl(l.url))),
    sources: asList(brief.sources).filter((s) => competitorUrls.has(normUrl(s.url))),
    cannibalization_risk: String(brief.cannibalization_risk || ""),
    people_also_ask: serp?.peopleAlsoAsk || [],
    limitations,
  };

  const dropped =
    asList(brief.competitors).length - result.competitors.length +
    asList(brief.internal_links).length - result.internal_links.length +
    asList(brief.sources).length - result.sources.length;
  if (dropped > 0) {
    result.limitations.push(`${dropped} unverified URL(s) suggested by the AI were removed.`);
  }
  return result;
}

/** Formats the brief as instructions for the writer agent. */
export function briefToWriterInstructions(brief) {
  const lines = [
    "## RESEARCH BRIEF (from the research agent — follow it)",
    `Recommended title: ${brief.title}`,
    `Primary keyword: ${brief.primary_keyword}`,
    brief.secondary_keywords.length ? `Secondary keywords: ${brief.secondary_keywords.join(", ")}` : "",
    brief.semantic_keywords.length ? `Semantic variations: ${brief.semantic_keywords.join(", ")}` : "",
    `Search intent: ${brief.search_intent}`,
    `Target audience: ${brief.target_audience}`,
    brief.target_location ? `Target location: ${brief.target_location}` : "",
    `Main goal: ${brief.main_goal}`,
    brief.content_gaps.length ? `Content gaps to cover (beat competitors here):\n- ${brief.content_gaps.join("\n- ")}` : "",
    brief.outline.length
      ? `Suggested outline:\n${brief.outline
          .map((o) => `- H2: ${o.h2}${asList(o.h3).length ? `\n  - H3: ${o.h3.join("\n  - H3: ")}` : ""}`)
          .join("\n")}`
      : "",
    brief.faqs.length
      ? `FAQ section: end the article with an H2 "Frequently Asked Questions" and answer each as an H3 with a direct 2-4 sentence answer:\n- ${brief.faqs.join("\n- ")}`
      : "",
    brief.internal_links.length
      ? `Internal links (add naturally with these anchors, only where relevant):\n${brief.internal_links
          .map((l) => `- <a href="${l.url}">${l.anchor}</a>`)
          .join("\n")}`
      : "",
    brief.sources.length
      ? `Credible sources you may cite as external links (only these URLs):\n${brief.sources
          .map((s) => `- ${s.url} (${s.use_for || s.title})`)
          .join("\n")}`
      : "No verified external sources are available — do not add external links or invent citations.",
    brief.cannibalization_risk ? `Cannibalization note: ${brief.cannibalization_risk}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
