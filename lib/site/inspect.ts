import * as cheerio from "cheerio";

import { siteContextSchema, type SiteContext } from "@/lib/agents/schemas";

const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; FridayAgent/0.1; +https://www.tryproven.fun/)",
};

const CANDIDATE_PATHS = ["/", "/about", "/faqs", "/faq", "/waitlist", "/changelog"];
const CTA_PATTERNS = [
  /join/i,
  /download/i,
  /watch/i,
  /start/i,
  /subscribe/i,
  /sign up/i,
  /get/i,
];

function normalizeSiteUrl(siteUrl: string) {
  const url = new URL(siteUrl);
  url.hash = "";
  return url.toString();
}

function normalizePath(baseUrl: URL, path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

function cleanText(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function dedupe(values: Array<string | undefined>, limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) {
      continue;
    }

    if (seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    output.push(cleaned);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function extractPageText(html: string) {
  const $ = cheerio.load(html);

  const title = cleanText($("title").first().text());
  const description = cleanText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content"),
  );

  const headings = dedupe(
    $("h1, h2, h3")
      .toArray()
      .map((node) => $(node).text()),
    16,
  );

  const paragraphs = dedupe(
    $("p")
      .toArray()
      .map((node) => $(node).text()),
    24,
  );

  const ctas = dedupe(
    $("a, button")
      .toArray()
      .map((node) => $(node).text())
      .filter((text) => CTA_PATTERNS.some((pattern) => pattern.test(text))),
    20,
  );

  const searchIndexUrl = cleanText($('meta[name="framer-search-index"]').attr("content"));

  return {
    title,
    description,
    headings,
    paragraphs,
    ctas,
    searchIndexUrl,
  };
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchFramerSearchIndex(searchIndexUrl: string) {
  const response = await fetch(searchIndexUrl, {
    headers: FETCH_HEADERS,
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Record<
    string,
    {
      title?: string;
      description?: string;
      h1?: string[];
      h2?: string[];
      h3?: string[];
      p?: string[];
    }
  >;

  return data;
}

export async function inspectWebsite(siteUrl: string): Promise<SiteContext> {
  const normalized = normalizeSiteUrl(siteUrl);
  const baseUrl = new URL(normalized);
  const homepageHtml = await fetchPage(normalized);
  const homepage = extractPageText(homepageHtml);

  const keyPages = [];
  const evidenceSnippets: string[] = [];

  if (homepage.searchIndexUrl) {
    const searchIndex = await fetchFramerSearchIndex(homepage.searchIndexUrl);

    if (searchIndex) {
      for (const path of CANDIDATE_PATHS) {
        const page = searchIndex[path];
        if (!page) {
          continue;
        }

        const headings = dedupe(
          [...(page.h1 ?? []), ...(page.h2 ?? []), ...(page.h3 ?? [])],
          16,
        );
        const paragraphs = dedupe(page.p ?? [], 24);

        keyPages.push({
          path,
          title: cleanText(page.title),
          description: cleanText(page.description),
          headings,
          paragraphs,
        });

        evidenceSnippets.push(...headings, ...paragraphs);
      }
    }
  }

  if (keyPages.length === 0) {
    for (const path of CANDIDATE_PATHS) {
      const url = normalizePath(baseUrl, path);

      try {
        const html = path === "/" ? homepageHtml : await fetchPage(url);
        const page = extractPageText(html);

        keyPages.push({
          path,
          title: page.title,
          description: page.description,
          headings: page.headings,
          paragraphs: page.paragraphs,
        });

        evidenceSnippets.push(...page.headings, ...page.paragraphs);
      } catch {
        // Best-effort crawling for supporting pages.
      }
    }
  }

  const payload = {
    siteUrl: normalized,
    title: homepage.title,
    description: homepage.description,
    ctas: dedupe(homepage.ctas, 20),
    keyPages: keyPages.slice(0, 8),
    evidenceSnippets: dedupe(
      [
        homepage.title,
        homepage.description,
        ...homepage.headings,
        ...homepage.paragraphs,
        ...evidenceSnippets,
      ],
      40,
    ),
  };

  return siteContextSchema.parse(payload);
}
