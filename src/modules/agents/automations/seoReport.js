const TECH2GLOBE_HOST = "tech2globe.com";

const stripTags = (html) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const countWords = (text) => (text ? text.split(/\s+/).filter(Boolean).length : 0);

const includesKeyword = (text, keyword) =>
  Boolean(keyword) && String(text || "").toLowerCase().includes(keyword.toLowerCase());

function extractLinks(html) {
  const links = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    links.push({ url: m[1], anchor: stripTags(m[2]) });
  }
  return links;
}

function extractFaqQuestions(html) {
  const content = String(html || "");
  const faqHeading = content.search(/<h2[^>]*>[^<]*(faq|frequently asked)/i);
  if (faqHeading === -1) return [];
  const rest = content.slice(faqHeading);
  const nextH2 = rest.slice(4).search(/<h2[\s>]/i);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 4);
  const questions = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(section))) questions.push(stripTags(m[1]));
  return questions;
}

/**
 * Builds the admin-only report: research brief + verified checks on the saved post.
 */
export function buildSeoReport({ brief, post, researchError = null }) {
  const html = post?.content || "";
  const text = stripTags(html);
  const words = countWords(text);
  const firstWords = text.split(/\s+/).slice(0, 150).join(" ");
  const links = extractLinks(html);
  const internal = links.filter((l) => l.url.includes(TECH2GLOBE_HOST) || l.url.startsWith("/"));
  const external = links.filter((l) => !internal.includes(l));
  const faqs = extractFaqQuestions(html);
  const h2Count = (html.match(/<h2[\s>]/gi) || []).length;

  const seo = post?.seo || {};
  const metaTitle = seo.meta_title || "";
  const metaDescription = seo.meta_description || "";
  const keyword = brief?.primary_keyword || seo.focus_keyword || "";
  const slugWords = keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const slugHasKeyword =
    slugWords.length > 0 && slugWords.every((w) => (post?.slug || "").includes(w));

  const checklist = [
    { label: "At least 1,000 words", ok: words >= 1000, detail: `${words} words` },
    { label: "Primary keyword in title", ok: includesKeyword(post?.title, keyword) },
    { label: "Primary keyword in URL slug", ok: slugHasKeyword },
    { label: "Primary keyword in first 150 words", ok: includesKeyword(firstWords, keyword) },
    { label: "Primary keyword in meta description", ok: includesKeyword(metaDescription, keyword) },
    {
      label: "Meta title 30–60 characters",
      ok: metaTitle.length >= 30 && metaTitle.length <= 60,
      detail: `${metaTitle.length} chars`,
    },
    {
      label: "Meta description 120–160 characters",
      ok: metaDescription.length >= 120 && metaDescription.length <= 160,
      detail: `${metaDescription.length} chars`,
    },
    { label: "At least 4 H2 sections", ok: h2Count >= 4, detail: `${h2Count} H2s` },
    {
      label: "FAQ section with 4–8 questions",
      ok: faqs.length >= 4 && faqs.length <= 8,
      detail: `${faqs.length} questions`,
    },
    {
      label: "At least 3 internal links",
      ok: internal.length >= 3,
      detail: `${internal.length} links`,
    },
    {
      label: "At least 1 credible external source",
      ok: external.length >= 1,
      detail: `${external.length} links`,
    },
  ];

  const limitations = [...(brief?.limitations || [])];
  if (researchError) {
    limitations.unshift(`Research agent failed, so the post was written without a brief: ${researchError}`);
  }

  return {
    generated_at: new Date().toISOString(),
    research: brief || null,
    seo: {
      title: post?.title || "",
      slug: post?.slug || "",
      url: post?.slug ? `https://www.tech2globe.com/blogs/${post.slug}` : "",
      meta_title: metaTitle,
      meta_description: metaDescription,
      focus_keyword: seo.focus_keyword || "",
    },
    word_count: words,
    internal_links: internal,
    external_links: external,
    faqs,
    checklist,
    score: { passed: checklist.filter((c) => c.ok).length, total: checklist.length },
    limitations,
  };
}
