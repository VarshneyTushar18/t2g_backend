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

function attrText(value, fallback) {
  return String(value || fallback || "Tech2Globe blog")
    .replace(/[<>"']/g, "")
    .trim()
    .slice(0, 125);
}

export function figureHtml({ url, alt, title }) {
  const safeAlt = attrText(alt, title);
  const safeTitle = attrText(title, safeAlt);
  return `<figure class="blog-agent-image"><img src="${url}" alt="${safeAlt}" title="${safeTitle}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;" /></figure>`;
}

/** Insert 1–2 figures after the first paragraph if content has no <img>. */
export function injectInlineImages(html, query, articleTitle = "") {
  const text = String(html || "");
  if (/<img[\s>]/i.test(text)) return text;
  const images = pickInlineImages(query, 2);
  if (!images.length) return text;
  const label = attrText(articleTitle, query);
  const first = figureHtml({ url: images[0].url, alt: label, title: label });
  const secondLabel = attrText(`${label} detail`, label);
  const second = images[1]
    ? figureHtml({ url: images[1].url, alt: secondLabel, title: secondLabel })
    : "";
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
export function injectInlineImagesFromUrls(html, urls, articleTitle = "") {
  const text = String(html || "");
  if (/<img[\s>]/i.test(text)) return text;
  const list = Array.isArray(urls)
    ? urls.filter(Boolean).slice(0, 2)
    : [];
  if (!list.length) return text;

  const label = attrText(articleTitle, "Tech2Globe blog");
  const first = figureHtml({ url: list[0], alt: label, title: label });
  const second = list[1]
    ? figureHtml({
        url: list[1],
        alt: attrText(`${label} detail`, label),
        title: attrText(`${label} detail`, label),
      })
    : "";

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
