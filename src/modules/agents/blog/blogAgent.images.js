/**
 * Royalty-free Unsplash images for Tech2Globe topics.
 * Hotlink images.unsplash.com (allowed by Unsplash guidelines).
 */
const LIBRARY = [
  {
    topics: ["amazon", "ppc", "ads", "advertising", "campaign"],
    url: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=1400&q=80",
    alt: "Laptop showing advertising dashboard",
  },
  {
    topics: ["shopify", "ecommerce", "store", "cart", "retail"],
    url: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80",
    alt: "Online shopping and checkout",
  },
  {
    topics: ["seo", "search", "google", "ranking", "keyword"],
    url: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?auto=format&fit=crop&w=1400&q=80",
    alt: "Search and analytics on a laptop",
  },
  {
    topics: ["ai", "artificial", "machine", "automation", "chatgpt"],
    url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1400&q=80",
    alt: "Artificial intelligence technology",
  },
  {
    topics: ["digital", "marketing", "social", "content", "brand"],
    url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80",
    alt: "Digital marketing analytics",
  },
  {
    topics: ["it", "software", "developer", "code", "web"],
    url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80",
    alt: "Software development workspace",
  },
  {
    topics: ["amazon", "warehouse", "fulfillment", "seller", "fba"],
    url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1400&q=80",
    alt: "Warehouse and logistics",
  },
  {
    topics: ["business", "growth", "strategy", "consulting", "startup"],
    url: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=80",
    alt: "Business strategy meeting",
  },
];

const FALLBACK = {
  url: "https://www.tech2globe.com/images/blog-bg.webp",
  alt: "Tech2Globe blog",
};

function scoreEntry(entry, query) {
  const q = String(query || "").toLowerCase();
  return entry.topics.reduce(
    (n, t) => n + (q.includes(t) ? 2 : 0),
    0,
  );
}

export function pickStockImage(query) {
  let best = LIBRARY[0];
  let bestScore = -1;
  for (const entry of LIBRARY) {
    const s = scoreEntry(entry, query);
    if (s > bestScore) {
      best = entry;
      bestScore = s;
    }
  }
  if (bestScore <= 0) {
    return { ...FALLBACK, query: query || "" };
  }
  return { url: best.url, alt: best.alt, query: query || "" };
}

export function pickInlineImages(query, count = 2) {
  const q = String(query || "").toLowerCase();
  const ranked = [...LIBRARY].sort(
    (a, b) => scoreEntry(b, q) - scoreEntry(a, q),
  );
  const unique = [];
  for (const item of ranked) {
    if (unique.some((u) => u.url === item.url)) continue;
    unique.push({ url: item.url, alt: item.alt });
    if (unique.length >= count) break;
  }
  return unique;
}

export function figureHtml({ url, alt }) {
  const safeAlt = String(alt || "Blog image")
    .replace(/</g, "")
    .slice(0, 120);
  return `<figure class="blog-agent-image"><img src="${url}" alt="${safeAlt}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;" /><figcaption>${safeAlt}</figcaption></figure>`;
}

/** Insert 1–2 figures after the first paragraph if content has no <img>. */
export function injectInlineImages(html, query) {
  const text = String(html || "");
  if (/<img[\s>]/i.test(text)) return text;
  const images = pickInlineImages(query, 2);
  if (!images.length) return text;
  const first = figureHtml(images[0]);
  const second = images[1] ? figureHtml(images[1]) : "";
  const closeP = text.indexOf("</p>");
  if (closeP === -1) {
    return first + text + second;
  }
  const afterFirst = text.slice(0, closeP + 4) + first + text.slice(closeP + 4);
  if (!second) return afterFirst;
  const lastH2 = afterFirst.lastIndexOf("<h2");
  if (lastH2 > 0) {
    return afterFirst.slice(0, lastH2) + second + afterFirst.slice(lastH2);
  }
  return afterFirst + second;
}

/** Insert 1–2 images after the first paragraph if content has no <img>. */
export function injectInlineImagesFromUrls(html, urls) {
  const text = String(html || "");
  if (/<img[\s>]/i.test(text)) return text;
  const list = Array.isArray(urls)
    ? urls.filter(Boolean).slice(0, 2)
    : [];
  if (!list.length) return text;

  const first = figureHtml({ url: list[0], alt: "Blog image" });
  const second = list[1] ? figureHtml({ url: list[1], alt: "Blog image" }) : "";

  const closeP = text.indexOf("</p>");
  if (closeP === -1) {
    return first + text + second;
  }
  const afterFirst = text.slice(0, closeP + 4) + first + text.slice(closeP + 4);
  if (!second) return afterFirst;
  const lastH2 = afterFirst.lastIndexOf("<h2");
  if (lastH2 > 0) {
    return afterFirst.slice(0, lastH2) + second + afterFirst.slice(lastH2);
  }
  return afterFirst + second;
}
