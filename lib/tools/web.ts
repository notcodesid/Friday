import * as cheerio from "cheerio";

/* ------------------------------------------------------------------ */
/*  Shared fetch helpers                                               */
/* ------------------------------------------------------------------ */

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const FETCH_OPTS: RequestInit = {
  headers: { "user-agent": BROWSER_UA },
  cache: "no-store",
};

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { ...FETCH_OPTS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/*  Google search scraper                                              */
/*  Scrapes actual Google results for a query                          */
/* ------------------------------------------------------------------ */

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export async function searchGoogle(
  query: string,
  numResults = 10,
): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}&num=${numResults}&hl=en`;

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // Google wraps each result in a div with class "g"
  $("div.g").each((_, el) => {
    const anchor = $(el).find("a").first();
    const href = anchor.attr("href") ?? "";
    const title = cleanText($(el).find("h3").first().text());
    const snippet = cleanText(
      $(el).find("[data-sncf]").text() ||
        $(el).find(".VwiC3b").text() ||
        $(el).find("[style*='-webkit-line-clamp']").text() ||
        "",
    );

    if (href.startsWith("http") && title) {
      results.push({ title, url: href, snippet });
    }
  });

  return results.slice(0, numResults);
}

/* ------------------------------------------------------------------ */
/*  Full page content extractor                                        */
/*  Extracts structured content from any webpage                       */
/* ------------------------------------------------------------------ */

export type PageContent = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  links: Array<{ text: string; href: string }>;
  wordCount: number;
  readingTimeMinutes: number;
};

export function extractPageContent(html: string, url: string): PageContent {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, header, iframe, noscript").remove();

  const title = cleanText($("title").first().text() || $("h1").first().text() || "");
  const description = cleanText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      "",
  );

  const headings: string[] = [];
  $("h1, h2, h3, h4").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > 3 && text.length < 200) headings.push(text);
  });

  const paragraphs: string[] = [];
  $("p, li").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > 20) paragraphs.push(text);
  });

  const links: Array<{ text: string; href: string }> = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = cleanText($(el).text());
    if (text && href.startsWith("http")) {
      links.push({ text, href });
    }
  });

  const allText = $("body").text();
  const wordCount = allText.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    description,
    headings: headings.slice(0, 30),
    paragraphs: paragraphs.slice(0, 40),
    links: links.slice(0, 20),
    wordCount,
    readingTimeMinutes: Math.ceil(wordCount / 250),
  };
}

/* ------------------------------------------------------------------ */
/*  Article structure analyzer                                         */
/*  Analyses content structure for competitive research                */
/* ------------------------------------------------------------------ */

export type ArticleAnalysis = {
  url: string;
  title: string;
  wordCount: number;
  readingTimeMinutes: number;
  headingStructure: string[];
  keyTopics: string[];
  contentGaps: string[];
  hasImages: boolean;
  hasFaq: boolean;
  hasTableOfContents: boolean;
  internalLinkCount: number;
  externalLinkCount: number;
};

export function analyzeArticle(html: string, url: string): ArticleAnalysis {
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, iframe, noscript").remove();

  const title = cleanText($("title").first().text() || $("h1").first().text() || "");

  const headingStructure: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const tag = (el as unknown as { tagName: string }).tagName;
    const text = cleanText($(el).text());
    if (text.length > 3) headingStructure.push(`${tag}: ${text}`);
  });

  const allText = $("body").text();
  const words = allText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Extract key topics from headings + bold text
  const keyTopics: string[] = [];
  $("h2, h3, strong, b").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > 3 && text.length < 100) keyTopics.push(text);
  });

  const baseHost = new URL(url).hostname;
  let internalLinkCount = 0;
  let externalLinkCount = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const linkHost = new URL(href, url).hostname;
      if (linkHost === baseHost) internalLinkCount++;
      else externalLinkCount++;
    } catch {
      // relative links count as internal
      internalLinkCount++;
    }
  });

  return {
    url,
    title,
    wordCount,
    readingTimeMinutes: Math.ceil(wordCount / 250),
    headingStructure: headingStructure.slice(0, 20),
    keyTopics: [...new Set(keyTopics)].slice(0, 15),
    contentGaps: [], // filled by LLM after comparing articles
    hasImages: $("img").length > 0,
    hasFaq: /faq|frequently asked/i.test(allText),
    hasTableOfContents: /table of contents|in this article|jump to/i.test(allText),
    internalLinkCount,
    externalLinkCount,
  };
}

/* ------------------------------------------------------------------ */
/*  Keyword/SERP research                                              */
/*  Searches Google and analyses top results for a keyword             */
/* ------------------------------------------------------------------ */

export type SerpResearch = {
  keyword: string;
  topResults: SearchResult[];
  topArticles: ArticleAnalysis[];
  avgWordCount: number;
  avgReadingTime: number;
  commonHeadings: string[];
  commonTopics: string[];
};

export async function researchKeyword(
  keyword: string,
  depth = 5,
): Promise<SerpResearch> {
  const topResults = await searchGoogle(keyword, depth);
  const topArticles: ArticleAnalysis[] = [];

  // Scrape and analyze top results in parallel
  const analyses = await Promise.allSettled(
    topResults.slice(0, depth).map(async (result) => {
      const html = await fetchHtml(result.url);
      return analyzeArticle(html, result.url);
    }),
  );

  for (const a of analyses) {
    if (a.status === "fulfilled") topArticles.push(a.value);
  }

  // Aggregate stats
  const wordCounts = topArticles.map((a) => a.wordCount).filter((w) => w > 100);
  const avgWordCount = wordCounts.length
    ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
    : 0;

  const readingTimes = topArticles.map((a) => a.readingTimeMinutes);
  const avgReadingTime = readingTimes.length
    ? Math.round(readingTimes.reduce((a, b) => a + b, 0) / readingTimes.length)
    : 0;

  // Find common headings and topics across articles
  const allHeadings = topArticles.flatMap((a) =>
    a.headingStructure.map((h) => h.replace(/^h\d:\s*/i, "").toLowerCase()),
  );
  const headingCounts = new Map<string, number>();
  for (const h of allHeadings) {
    headingCounts.set(h, (headingCounts.get(h) ?? 0) + 1);
  }
  const commonHeadings = [...headingCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([heading]) => heading)
    .slice(0, 10);

  const allTopics = topArticles.flatMap((a) =>
    a.keyTopics.map((t) => t.toLowerCase()),
  );
  const topicCounts = new Map<string, number>();
  for (const t of allTopics) {
    topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const commonTopics = [...topicCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, 10);

  return {
    keyword,
    topResults,
    topArticles,
    avgWordCount,
    avgReadingTime,
    commonHeadings,
    commonTopics,
  };
}

/* ------------------------------------------------------------------ */
/*  Brand/site analyzer                                                */
/*  Deep analysis of a website's content strategy                      */
/* ------------------------------------------------------------------ */

export type BrandAnalysis = {
  url: string;
  brandName: string;
  tagline: string;
  positioning: string;
  targetAudience: string[];
  keyMessages: string[];
  ctas: string[];
  contentThemes: string[];
  toneIndicators: string[];
  socialLinks: Array<{ platform: string; url: string }>;
  techStack: string[];
  pageCount: number;
};

export async function analyzeBrand(siteUrl: string): Promise<BrandAnalysis> {
  const html = await fetchHtml(siteUrl);
  const $ = cheerio.load(html);

  const brandName = cleanText(
    $('meta[property="og:site_name"]').attr("content") ??
      $("title").first().text().split(/[|\-–—]/).pop() ??
      new URL(siteUrl).hostname,
  );

  const tagline = cleanText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      $("h1").first().text() ??
      "",
  );

  // Extract key messages from headings and hero sections
  const keyMessages: string[] = [];
  $("h1, h2, [class*='hero'] p, [class*='banner'] p").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > 10 && text.length < 200) keyMessages.push(text);
  });

  // CTAs
  const ctaPatterns = /join|download|start|subscribe|sign up|get started|try|book|demo|free/i;
  const ctas: string[] = [];
  $("a, button").each((_, el) => {
    const text = cleanText($(el).text());
    if (ctaPatterns.test(text) && text.length < 50) ctas.push(text);
  });

  // Social links
  const socialPlatforms: Record<string, string> = {
    twitter: "X",
    "x.com": "X",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    tiktok: "TikTok",
    reddit: "Reddit",
    discord: "Discord",
    github: "GitHub",
  };

  const socialLinks: Array<{ platform: string; url: string }> = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const [pattern, platform] of Object.entries(socialPlatforms)) {
      if (href.includes(pattern)) {
        socialLinks.push({ platform, url: href });
        break;
      }
    }
  });

  // Tech signals
  const techStack: string[] = [];
  const rawHtml = $.html();
  if (rawHtml.includes("next") || rawHtml.includes("__next")) techStack.push("Next.js");
  if (rawHtml.includes("framer")) techStack.push("Framer");
  if (rawHtml.includes("webflow")) techStack.push("Webflow");
  if (rawHtml.includes("wordpress") || rawHtml.includes("wp-content")) techStack.push("WordPress");
  if (rawHtml.includes("shopify")) techStack.push("Shopify");
  if (rawHtml.includes("analytics")) techStack.push("Analytics");
  if (rawHtml.includes("intercom")) techStack.push("Intercom");
  if (rawHtml.includes("crisp")) techStack.push("Crisp");
  if (rawHtml.includes("hubspot")) techStack.push("HubSpot");

  // Tone analysis from text
  const bodyText = cleanText($("body").text()).toLowerCase();
  const toneIndicators: string[] = [];
  if (/we believe|our mission|we're on a mission/i.test(bodyText)) toneIndicators.push("mission-driven");
  if (/simple|easy|effortless|intuitive/i.test(bodyText)) toneIndicators.push("simplicity-focused");
  if (/enterprise|compliance|security|SOC/i.test(bodyText)) toneIndicators.push("enterprise-oriented");
  if (/open.?source|community|contributors/i.test(bodyText)) toneIndicators.push("community-driven");
  if (/fast|speed|performance|blazing/i.test(bodyText)) toneIndicators.push("performance-focused");
  if (/ai|artificial intelligence|machine learning|llm/i.test(bodyText)) toneIndicators.push("AI-forward");
  if (/founder|startup|scale|grow/i.test(bodyText)) toneIndicators.push("startup-oriented");

  // Count internal pages from nav links
  const internalLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const linkUrl = new URL(href, siteUrl);
      if (linkUrl.hostname === new URL(siteUrl).hostname) {
        internalLinks.add(linkUrl.pathname);
      }
    } catch {
      // skip malformed
    }
  });

  return {
    url: siteUrl,
    brandName,
    tagline,
    positioning: tagline, // LLM will refine this
    targetAudience: [], // LLM infers from content
    keyMessages: [...new Set(keyMessages)].slice(0, 10),
    ctas: [...new Set(ctas)].slice(0, 10),
    contentThemes: [], // LLM infers from headings
    toneIndicators,
    socialLinks: socialLinks.filter(
      (v, i, a) => a.findIndex((x) => x.platform === v.platform) === i,
    ),
    techStack: [...new Set(techStack)],
    pageCount: internalLinks.size,
  };
}
