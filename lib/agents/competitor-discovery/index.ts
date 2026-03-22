import * as cheerio from "cheerio";
import { search as ddgSearch, SafeSearchType } from "duck-duck-scrape";

import {
  competitorDiscoverySchema,
  type CompetitorDiscovery,
} from "@/lib/agents/schemas";
import { searchGoogle } from "@/lib/tools/web";

type CompetitorDiscoveryInput = {
  brandName: string;
  oneLiner?: string;
  siteUrl: string;
};

type Candidate = {
  domain: string;
  logo?: string;
  score: number;
  searchTitles: string[];
  searchSnippets: string[];
  queries: Set<string>;
};

type SearchHit = {
  icon?: string;
  snippet: string;
  title: string;
  url: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_COMPETITORS = 6;
const MAX_SEARCH_RESULTS = 8;
const REQUEST_DELAY_MS = 250;
const SEARCH_TIMEOUT_MS = 6_500;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const EXCLUDED_DOMAINS = new Set([
  "google.com",
  "reddit.com",
  "youtube.com",
  "medium.com",
  "producthunt.com",
  "g2.com",
  "capterra.com",
  "crunchbase.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "wikipedia.org",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
]);

const GENERIC_RESULT_TERMS =
  /\b(alternatives?|competitors?|compare|comparison|vs\.?|review|reviews|best|top|wiki|directory|blog|news|media|guide|forum)\b/i;
const PRODUCT_SIGNAL_TERMS =
  /\b(platform|software|app|tool|market|workspace|automation|crm|analytics|trade|trading|forecast|predict|manage|monitor|buy|sell|book demo|get started|sign up|try)\b/i;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "best",
  "build",
  "built",
  "for",
  "from",
  "helps",
  "help",
  "in",
  "is",
  "largest",
  "leading",
  "lets",
  "on",
  "our",
  "platform",
  "the",
  "their",
  "this",
  "to",
  "using",
  "we",
  "with",
  "world",
  "worlds",
  "you",
  "your",
]);
const BOUNDARY_WORDS = new Set([
  "allowing",
  "and",
  "for",
  "from",
  "helps",
  "including",
  "that",
  "to",
  "where",
  "with",
]);

const discoveryCache = new Map<
  string,
  { expiresAt: number; value: CompetitorDiscovery }
>();

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  if (!value) {
    return "";
  }

  return cheerio.load(`<div>${value}</div>`).text();
}

function normalizeLogoUrl(value: string | undefined, domain: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function normalizeDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/?#].*$/, "")
      .replace(/\/+$/, "");
  }
}

function isExcludedDomain(domain: string) {
  for (const excluded of EXCLUDED_DOMAINS) {
    if (domain === excluded || domain.endsWith(`.${excluded}`)) {
      return true;
    }
  }

  return false;
}

function normalizeName(value: string, domain: string) {
  const firstChunk = value.split(/[|\-–—]/)[0] ?? value;
  const cleaned = cleanText(firstChunk).replace(/\s+/g, " ");
  if (cleaned) {
    return cleaned;
  }

  return domain;
}

function truncateText(value: string, maxLength: number) {
  const trimmed = cleanText(value);
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function decodeDuckDuckGoHref(href: string) {
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    if (redirected) {
      return decodeURIComponent(redirected);
    }

    return url.protocol.startsWith("http") ? url.toString() : "";
  } catch {
    return href.startsWith("http") ? href : "";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, timeoutMs: number) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": BROWSER_UA },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}

async function searchDuckDuckGoHtml(
  query: string,
  numResults = MAX_SEARCH_RESULTS,
) {
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    SEARCH_TIMEOUT_MS,
  );
  const $ = cheerio.load(html);
  const results: SearchHit[] = [];

  $(".result").each((_, element) => {
    const anchor = $(element).find("a.result__a").first();
    const title = cleanText(anchor.text());
    const href = decodeDuckDuckGoHref(anchor.attr("href") ?? "");
    const snippet = cleanText($(element).find(".result__snippet").first().text());
    const icon =
      $(element).find(".result__icon img").first().attr("src") ?? undefined;

    if (href.startsWith("http") && title) {
      results.push({
        icon,
        title,
        url: href,
        snippet,
      });
    }
  });

  return results.slice(0, numResults);
}

async function searchWebFast(query: string, numResults = MAX_SEARCH_RESULTS) {
  try {
    const response = await ddgSearch(query, {
      locale: "en-us",
      safeSearch: SafeSearchType.OFF,
    });
    const ddgResults = response.results
      .slice(0, numResults)
      .map((result) => ({
        icon: result.icon,
        title: cleanText(decodeHtml(result.title)),
        url: decodeDuckDuckGoHref(result.url),
        snippet: cleanText(
          decodeHtml(result.description || result.rawDescription || ""),
        ),
      }))
      .filter((result) => result.url.startsWith("http") && result.title);

    if (ddgResults.length > 0) {
      return ddgResults;
    }
  } catch {
    // Fall through to HTML search and Google scraping.
  }

  try {
    const htmlResults = await searchDuckDuckGoHtml(query, numResults);
    if (htmlResults.length > 0) {
      return htmlResults;
    }
  } catch {
    // Fall through.
  }

  try {
    const googleResults = await searchGoogle(query, numResults);
    return googleResults.map((result) => ({
      title: cleanText(decodeHtml(result.title)),
      url: result.url,
      snippet: cleanText(decodeHtml(result.snippet)),
    }));
  } catch {
    return [];
  }
}

function getPathDepth(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function extractCategoryQuery(brandName: string, oneLiner?: string) {
  if (!oneLiner) {
    return "";
  }

  const brandTokens = new Set(
    brandName
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );

  const tokens = oneLiner
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => !brandTokens.has(token))
    .filter((token) => !STOP_WORDS.has(token));

  const picked: string[] = [];

  for (const token of tokens) {
    if (BOUNDARY_WORDS.has(token) && picked.length >= 2) {
      break;
    }

    picked.push(token);
    if (picked.length >= 4) {
      break;
    }
  }

  return picked.join(" ");
}

function buildQueries(input: CompetitorDiscoveryInput) {
  const queries = new Set<string>();
  const categoryQuery = extractCategoryQuery(input.brandName, input.oneLiner);

  if (categoryQuery) {
    queries.add(categoryQuery);
    queries.add(`${categoryQuery} platform`);
  }

  queries.add(`${input.brandName} alternatives`);

  return [...queries].slice(0, 3);
}

function upsertCandidate(
  candidates: Map<string, Candidate>,
  result: SearchHit,
  query: string,
  ownDomain: string,
) {
  const domain = normalizeDomain(result.url);
  if (!domain || domain === ownDomain || isExcludedDomain(domain)) {
    return;
  }

  const title = cleanText(result.title);
  const snippet = cleanText(result.snippet);
  const pathDepth = getPathDepth(result.url);
  const genericText = `${title} ${snippet}`;
  const isLikelyEditorial = GENERIC_RESULT_TERMS.test(genericText);

  const existing = candidates.get(domain);
  const next: Candidate = existing ?? {
    domain,
    logo: undefined,
    score: 0,
    searchTitles: [],
    searchSnippets: [],
    queries: new Set<string>(),
  };

  next.queries.add(query);

  if (title) {
    next.searchTitles.push(title);
  }
  if (snippet) {
    next.searchSnippets.push(snippet);
  }
  if (!next.logo) {
    next.logo = normalizeLogoUrl(result.icon, domain);
  }

  next.score += pathDepth <= 1 ? 3 : 1;
  next.score += isLikelyEditorial ? -2 : 2;
  next.score += next.queries.size > 1 ? 3 : 1;

  candidates.set(domain, next);
}

function cleanCompetitors(
  discovery: CompetitorDiscovery,
  siteUrl: string,
): CompetitorDiscovery {
  const ownDomain = normalizeDomain(siteUrl);
  const seen = new Set<string>();

  const competitors = discovery.competitors
    .map((competitor) => {
      const domain = normalizeDomain(competitor.domain);
      return {
        ...competitor,
        name: competitor.name.trim() || domain,
        domain,
        logo: competitor.logo?.trim() || undefined,
        reason: competitor.reason.trim(),
        positioning: competitor.positioning?.trim() || undefined,
      };
    })
    .filter((competitor) => {
      if (!competitor.domain || !competitor.reason) {
        return false;
      }

      if (competitor.domain === ownDomain || isExcludedDomain(competitor.domain)) {
        return false;
      }

      if (seen.has(competitor.domain)) {
        return false;
      }

      seen.add(competitor.domain);
      return true;
    })
    .slice(0, MAX_COMPETITORS);

  return {
    summary: discovery.summary?.trim() || undefined,
    competitors,
  };
}

function buildReason(
  brandName: string,
  candidate: Candidate,
) {
  const searchEvidence =
    candidate.queries.size > 1
      ? "it surfaced across multiple live competitor searches"
      : "it surfaced in live market-category search results";
  const description = candidate.searchSnippets[0] || "";

  if (description) {
    return truncateText(
      `${searchEvidence} and positions itself as ${description.replace(/[.]+$/, "")}.`,
      180,
    );
  }

  return `${candidate.domain} appears to serve the same market as ${brandName}.`;
}

function buildPositioning(candidate: Candidate) {
  const description = candidate.searchSnippets[0] || "";
  if (!description) {
    return undefined;
  }

  return truncateText(description, 180);
}

function getCachedDiscovery(siteUrl: string) {
  const cacheKey = normalizeDomain(siteUrl);
  const cached = discoveryCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    discoveryCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedDiscovery(siteUrl: string, value: CompetitorDiscovery) {
  discoveryCache.set(normalizeDomain(siteUrl), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

export async function runCompetitorDiscoveryAgent(
  input: CompetitorDiscoveryInput,
) {
  const cached = getCachedDiscovery(input.siteUrl);
  if (cached) {
    return cached;
  }

  const ownDomain = normalizeDomain(input.siteUrl);
  const queries = buildQueries(input);
  const searchResults: Array<{ query: string; results: SearchHit[] }> = [];

  for (const query of queries) {
    try {
      const results = await searchWebFast(query, MAX_SEARCH_RESULTS);
      searchResults.push({ query, results });
    } catch {
      searchResults.push({ query, results: [] });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const candidates = new Map<string, Candidate>();

  for (const result of searchResults) {
    for (const item of result.results) {
      upsertCandidate(candidates, item, result.query, ownDomain);
    }
  }

  const rankedCandidates = [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_COMPETITORS * 2);

  const discovery = cleanCompetitors(
    competitorDiscoverySchema.parse({
      summary:
        rankedCandidates.length > 0
          ? `Discovered competitors for ${input.brandName} from live search library results.`
          : undefined,
      competitors: rankedCandidates
        .map((candidate) => {
          const evidence = `${candidate.searchTitles.join(" ")} ${candidate.searchSnippets.join(" ")}`;
          if (
            GENERIC_RESULT_TERMS.test(evidence) &&
            !PRODUCT_SIGNAL_TERMS.test(evidence)
          ) {
            return null;
          }

          return {
            name: normalizeName(candidate.searchTitles[0] ?? candidate.domain, candidate.domain),
            domain: candidate.domain,
            logo: normalizeLogoUrl(candidate.logo, candidate.domain),
            reason: buildReason(input.brandName, candidate),
            positioning: buildPositioning(candidate),
          };
        })
        .filter(Boolean)
        .slice(0, MAX_COMPETITORS),
    }),
    input.siteUrl,
  );

  setCachedDiscovery(input.siteUrl, discovery);
  return discovery;
}
