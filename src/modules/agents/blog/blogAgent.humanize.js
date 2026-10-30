import { OpenAI } from "openai";
import { getRuntimeConfig } from "../ai-integrations/aiIntegrations.model.js";
import { getDefaultModel } from "../lib/openai.js";

function clampHumanizePercent(value, fallback = 70) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(100, Math.max(0, n)) / 5) * 5;
}

function buildHumanizeSystemPrompt(humanizePercent) {
  const human = clampHumanizePercent(humanizePercent, 70);
  const ai = 100 - human;

  return `You are a senior human editor rewriting blog HTML so it reads like a real person wrote it — not ChatGPT / Gemini / Claude.

Goal mix: ~${human}% human voice, ~${ai}% structure (keep headings + SEO usefulness).

Rewrite HARD against AI detectors (Quillbot, GPTZero, Originality, etc.). Detectors flag:
- Perfect parallel structure and "template" conclusions
- Vague corporate pep talks
- Stock phrases and evenly paced sentences

MUST DO:
- Keep the same topic, facts, and roughly same length (±15%).
- Keep HTML tags: h2, h3, p, ul, ol, li, strong, em, a, img (do not remove images).
- Use contractions (you'll, don't, it's, we're).
- Vary sentence length: some 4–8 words, some longer.
- Add concrete details, numbers, tradeoffs, or "here's what usually goes wrong" moments.
- Use direct address ("you", "your team") and occasional first-person plural ("we").
- Make the ending a practical next step — NEVER a polished "In conclusion / Remember / Finding the best X is a crucial step" wrap-up.
- Break symmetry: sections should not all open the same way or end with a summary line.

MUST NOT:
- Output markdown fences or explanations — return HTML body only.
- Use: "In today's digital landscape", "delve into", "it's important to note", "unlock the power", "game-changer", "comprehensive guide", "ever-evolving", "tapestry", "realm", "navigate the complexities", "Furthermore", "Moreover", "In conclusion", "When it comes to", "In the world of", "At the end of the day", "Remember, the right…", "By understanding your needs…", "crucial step towards achieving".
- Write a generic conclusion paragraph that restates the title.
- Make every bullet start with the same verb pattern.
- Sound like a brochure or LinkedIn thought-leader post.

Intensity: ${
    human >= 80
      ? "AGGRESSIVE — prefer slightly imperfect human rhythm over polished SEO copy."
      : human >= 55
        ? "STRONG — clearly human editorial voice."
        : "MODERATE — clean up obvious AI tells while staying structured."
  }`;
}

/**
 * Second-pass rewrite so posts are less likely to score 100% AI in detectors.
 * Returns original HTML unchanged on failure / low humanize setting.
 *
 * @param {string} html
 * @param {{ humanizePercent?: number, title?: string }} opts
 */
export async function humanizeBlogHtml(html, opts = {}) {
  const humanizePercent = clampHumanizePercent(opts.humanizePercent, 70);
  const source = String(html || "").trim();
  if (!source) return source;

  // Skip second pass when admin wants mostly AI structure
  if (humanizePercent < 40) return source;

  try {
    const config = await getRuntimeConfig();
    if (!config.apiKey) return source;

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: {
        "HTTP-Referer": config.siteUrl,
        "X-Title": config.siteName || "Tech2Globe Blog Humanizer",
      },
    });

    const model = config.defaultModel || getDefaultModel();
    const temp = Math.min(1.05, 0.75 + (humanizePercent / 100) * 0.3);

    const completion = await client.chat.completions.create({
      model,
      temperature: temp,
      max_tokens: 4500,
      messages: [
        { role: "system", content: buildHumanizeSystemPrompt(humanizePercent) },
        {
          role: "user",
          content: `Post title: ${opts.title || "(untitled)"}\n\nRewrite this blog HTML to sound human-written. Return HTML only.\n\n${source}`,
        },
      ],
    });

    let out = completion?.choices?.[0]?.message?.content || "";
    out = String(out).trim();
    if (!out) return source;

    // Strip accidental markdown fences
    out = out
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Keep original if model returned something tiny / broken
    if (out.length < Math.min(200, source.length * 0.4)) return source;
    return out;
  } catch (err) {
    console.error("[blog-humanize] rewrite failed:", err.message);
    return source;
  }
}
