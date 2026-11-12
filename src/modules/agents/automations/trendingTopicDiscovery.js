import { OpenAI } from "openai";
import { getRuntimeConfig } from "../ai-integrations/aiIntegrations.model.js";
import { getDefaultModel } from "../lib/openai.js";
import * as blogModel from "../../blog/blog.model.js";

const DEFAULT_NICHE =
  "digital marketing, SEO, Amazon marketplace, PPC, e-commerce growth for US businesses";

function stripHtml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function fetchGoogleNewsHeadlines(query, limit = 12) {
  const q = encodeURIComponent(query.slice(0, 200));
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Tech2Globe-BlogAutomations/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`News feed HTTP ${res.status}`);
  }
  const xml = await res.text();
  const titles = [];
  const re = /<item[\s\S]*?<title>([\s\S]*?)<\/title>/gi;
  let m;
  while ((m = re.exec(xml)) && titles.length < limit) {
    const t = stripHtml(m[1]).replace(/^[^:]+:\s*/, "").trim();
    if (t && t.length > 8) titles.push(t);
  }
  return titles;
}

async function fetchSerperSnippets(query, limit = 8) {
  const key = process.env.SERPER_API_KEY || process.env.SERPER_KEY;
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(limit, 10),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const organic = Array.isArray(data.organic) ? data.organic : [];
  return organic
    .map((row) => ({
      title: row.title || "",
      snippet: row.snippet || "",
      link: row.link || "",
    }))
    .filter((r) => r.title);
}

async function loadExistingTitles() {
  const titles = new Set();
  try {
    const posts = await blogModel.getAllAdmin({ page: 1, limit: 40, search: "" });
    for (const p of posts.data || []) {
      if (p.title) titles.add(String(p.title).toLowerCase());
    }
  } catch {
    /* ignore */
  }
  return titles;
}

function parseJsonTopics(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : raw;
  const parsed = JSON.parse(body);
  const list = Array.isArray(parsed) ? parsed : parsed.topics || [];
  return list
    .map((row) => ({
      topic: String(row.topic || row.title || "").trim(),
      notes: String(row.notes || row.rationale || "").trim(),
      tags: Array.isArray(row.tags)
        ? row.tags.map((t) => String(t).trim()).filter(Boolean)
        : String(row.tags || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    }))
    .filter((r) => r.topic.length >= 12);
}

/**
 * Pick unique blog topics from trending signals + LLM analysis.
 * @returns {Promise<Array<{ topic: string, notes: string, tags: string[] }>>}
 */
export async function discoverTrendingTopics({
  count = 1,
  niche = DEFAULT_NICHE,
  avoidTopics = [],
} = {}) {
  const need = Math.min(Math.max(Number(count) || 1, 1), 5);
  const nicheText = String(niche || DEFAULT_NICHE).trim() || DEFAULT_NICHE;

  const [newsHeadlines, serper, existingTitles] = await Promise.all([
    fetchGoogleNewsHeadlines(`${nicheText} marketing trends`, 14).catch(() => []),
    fetchSerperSnippets(`trending ${nicheText} blog topics 2025 2026`, 8).catch(() => []),
    loadExistingTitles(),
  ]);

  const avoid = new Set(
    [...avoidTopics, ...existingTitles].map((t) => String(t).toLowerCase().trim()),
  );

  const config = await getRuntimeConfig();
  if (!config.apiKey) {
    throw new Error(
      "AI is not configured. Set API key in Admin → Connect → AI Integrations.",
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
      "HTTP-Referer": config.siteUrl,
      "X-Title": config.siteName || "Tech2Globe Trending Topics",
    },
  });

  const model = config.defaultModel || getDefaultModel();
  const serperBlock = serper.length
    ? serper.map((s, i) => `${i + 1}. ${s.title}\n   ${s.snippet}\n   ${s.link}`).join("\n")
    : "(Serper not configured — using news headlines only)";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.55,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a content strategist for Tech2Globe (digital marketing / Amazon / SEO agency).
Return JSON: { "topics": [ { "topic": "...", "notes": "...", "tags": ["a","b"] } ] }
Pick ${need} distinct blog angles that are trending NOW, better than generic listicles, and not duplicates of existing Tech2Globe posts.
Notes must briefly cite what competitors/trending pieces cover and how our post will differ (compare + analyze).`,
      },
      {
        role: "user",
        content: [
          `Niche focus: ${nicheText}`,
          `Generate exactly ${need} unique blog topic(s).`,
          "",
          "## Google News headlines (trend signals)",
          newsHeadlines.length ? newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n") : "(none)",
          "",
          "## Web search snippets (high-ranking blog angles)",
          serperBlock,
          "",
          "## Do NOT repeat or closely paraphrase these existing titles",
          avoidTopics.slice(0, 30).join("\n") || "(none listed)",
        ].join("\n"),
      },
    ],
  });

  let candidates = [];
  try {
    candidates = parseJsonTopics(completion?.choices?.[0]?.message?.content || "{}");
  } catch (err) {
    console.error("[trending-topics] JSON parse failed:", err.message);
    throw new Error("Could not parse trending topic suggestions from AI.");
  }

  const unique = [];
  for (const c of candidates) {
    const key = c.topic.toLowerCase();
    if (avoid.has(key)) continue;
    if (unique.some((u) => u.topic.toLowerCase() === key)) continue;
    unique.push(c);
    avoid.add(key);
    if (unique.length >= need) break;
  }

  if (!unique.length && newsHeadlines.length) {
    const fallback = newsHeadlines.find(
      (h) => !avoid.has(h.toLowerCase()) && h.length >= 12,
    );
    if (fallback) {
      unique.push({
        topic: fallback.slice(0, 480),
        notes:
          "Auto-picked from trending news headline. Expand with Tech2Globe agency perspective and actionable tips.",
        tags: nicheText.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4),
      });
    }
  }

  if (!unique.length) {
    throw new Error("No new trending topics found — try a broader niche or add manual topics.");
  }

  return unique.slice(0, need);
}
