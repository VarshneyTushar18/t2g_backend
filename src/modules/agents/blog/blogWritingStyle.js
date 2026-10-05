export function clampHumanizePercent(value, fallback = 70) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(100, Math.max(0, n)) / 5) * 5;
}

export function temperatureForHumanize(humanizePercent) {
  const h = clampHumanizePercent(humanizePercent, 70) / 100;
  return Math.round((0.45 + h * 0.5) * 100) / 100;
}

/**
 * @param {number} humanizePercent
 * @param {{ brandVoice?: string }} opts
 */
export function buildWritingStyleBlock(humanizePercent, opts = {}) {
  const brandVoice = opts.brandVoice || "Tech2Globe strategist";
  const human = clampHumanizePercent(humanizePercent, 70);
  const ai = 100 - human;

  const intensity =
    human >= 80
      ? "Very aggressive humanization — prioritize natural voice over polished AI symmetry. AI detectors must NOT score this as fully AI."
      : human >= 55
        ? "Strong humanization — sound like a senior editor, not ChatGPT. Avoid detector-bait conclusions."
        : human >= 30
          ? "Balanced mix — clear structure with some natural voice."
          : "Light humanization — keep clear, structured AI-assisted writing.";

  return `
## Writing style — ${human}% human / ${ai}% AI structure (critical)
Target mix set by admin: **${human}% humanized voice** and **${ai}% AI-assisted structure** (outline, SEO, headings).
${intensity}
Write like a real ${brandVoice} drafting in Notion — not like an AI blog generator. Quillbot / GPTZero-style detectors flag template conclusions and evenly polished prose.

### Anti-AI-detector rules (non-negotiable when humanize ≥ 50%)
- NEVER open or close with: "Finding the best X is a crucial step…", "By understanding your needs…", "Remember, the right agency/partner…", "In today's digital landscape…", "When it comes to…", "In conclusion…".
- NEVER end with a glossy wrap-up that restates the title. End with a concrete next action, checklist, or tradeoff instead.
- Ban: delve, unlock the power, game-changer, comprehensive guide, ever-evolving, tapestry, realm, navigate the complexities, Furthermore, Moreover, Additionally (as stacked transitions), "it's important to note", "at the end of the day".
- Mix sentence lengths aggressively. Include at least a few very short sentences (under 8 words).
- Prefer specifics (budgets, timelines, channel names, failure modes) over abstract advice.
- Use contractions. Occasional opinion is good ("I'd skip vendors that only sell vanity metrics").
- Do NOT make every H2 section the same shape (hook → 3 bullets → summary).
- Do NOT write perfectly parallel bullet lists that all start with the same verb.

Humanization rules (scale with the ${human}% human target):
- Natural spoken rhythm${human >= 50 ? " — write like you're explaining to a client on a call" : ""}.
- Start some sections with a problem story or sharp claim, not a dictionary definition.
- Prefer "you / your team / we" over "businesses must".
${human >= 60 ? "- Slight unevenness is GOOD. Perfect symmetry reads as AI." : "- Keep writing clean and scannable; light natural tone is enough."}

Structure (the ${ai}% AI-assisted part):
  1) Strong H1-style title (passed as title, not inside body)
  2) Short hook (2–3 sentences) — concrete problem, not hype
  3) 4–7 H2 sections with optional H3s
  4) Short paragraphs (mostly 2–4 sentences)
  5) Bullet or numbered lists only when they truly help
  6) Bold sparingly for key phrases only
  7) Practical ending (next step / what to ask vendors) — no "In conclusion"
- Length: ~700–1200 words unless user asks otherwise.
- SEO: focus keyword in title + first paragraph + one H2; meta description 120–160 chars — weave naturally, never keyword-stuff.

A second automatic humanize rewrite may run before save when humanize % is high — still write the first draft as human as possible.`;
}

export function buildContentFormatRules() {
  return `
## Content format rules (critical — avoid ugly published posts)
- Write body as clean Markdown OR semantic HTML.
- Allowed Markdown: ## / ### headings, paragraphs, - lists, 1. lists, **bold**, *italic*, [links](https://...), images.
- NEVER leave raw asterisks, underscores, or markdown syntax visible in the final post.
- Do NOT wrap the whole article in a single code block.
- Do NOT use # for the post title inside content (title field is separate). Use ## for section headings.
- Prefer real HTML when unsure: <h2>, <p>, <ul><li>, <strong>, <em>.`;
}
