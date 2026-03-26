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

type GeminiGroundingChunk = {
  web?: {
    title?: string;
    uri?: string;
  };
};

type GeminiGroundingMetadata = {
  groundingChunks?: GeminiGroundingChunk[];
  webSearchQueries?: string[];
};

type GeminiUrlContextMetadata = {
  urlMetadata?: Array<{
    retrievedUrl?: string;
    urlRetrievalStatus?: string;
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: GeminiGroundingMetadata;
    urlContextMetadata?: GeminiUrlContextMetadata;
  }>;
  error?: {
    message?: string;
  };
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_COMPETITORS = 8;
const MAX_SEARCH_RESULTS = 10;
const REQUEST_DELAY_MS = 250;
const SEARCH_TIMEOUT_MS = 6_500;
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_DEEP_RESEARCH_TIMEOUT_MS = 90_000;
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
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
    queries.add(`${categoryQuery} software`);
  }

  queries.add(`${input.brandName} alternatives`);
  queries.add(`${input.brandName} competitors`);
  queries.add(`${input.brandName} vs`);
  queries.add(`companies like ${input.brandName}`);

  return [...queries].slice(0, 6);
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

const competitorDiscoveryResponseJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    competitors: {
      type: "array",
      maxItems: MAX_COMPETITORS,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string" },
          logo: { type: "string" },
          reason: { type: "string" },
          positioning: { type: "string" },
        },
        required: ["name", "domain", "reason"],
      },
    },
  },
  required: ["competitors"],
} as const;

function buildGeminiCompetitorPrompt(input: CompetitorDiscoveryInput) {
  return [
    "You are a competitive intelligence researcher. Your job is to conduct DEEP, thorough research to identify the most important direct competitors for a company.",
    "",
    "## Research Instructions",
    "",
    "Conduct a multi-layered investigation:",
    "",
    "1. **First, deeply analyze the target company's website** to understand exactly what they do, who they serve, their pricing model, key features, and market positioning.",
    "",
    "2. **Search broadly for competitors using multiple angles:**",
    `   - Search: "${input.brandName} competitors"`,
    `   - Search: "${input.brandName} alternatives"`,
    `   - Search: "${input.brandName} vs"`,
    `   - Search for the product category + "software" or "platform" or "tool"`,
    input.oneLiner ? `   - Search for the core problem: "${input.oneLiner}"` : "",
    `   - Search: "companies like ${input.brandName}"`,
    `   - Search on G2, Capterra, Product Hunt for the category`,
    `   - Search for the specific market/industry the company operates in`,
    "",
    "3. **For each potential competitor found, verify by visiting their website** to confirm they actually compete in the same space. Check their homepage, features page, and pricing page.",
    "",
    "4. **Cross-reference across multiple sources** — don't rely on a single search result. A real competitor should appear across multiple queries and sources.",
    "",
    "5. **Prioritize direct competitors** — companies a buyer would realistically evaluate side-by-side. Exclude blogs, review sites, directories, agencies, consultants, and marketplaces that aren't direct substitutes.",
    "",
    "## Target Company",
    "",
    `Company name: ${input.brandName}`,
    `Company website: ${input.siteUrl}`,
    `Known description: ${input.oneLiner?.trim() || "Not provided"}`,
    "",
    "## Output Requirements",
    "",
    "Return up to 8 direct competitors, ranked by relevance. For each competitor provide:",
    "- name: the product or company name",
    "- domain: root domain only (no protocol, no path)",
    "- reason: a specific, evidence-based sentence explaining WHY this is a direct competitor (mention shared features, same target audience, or market overlap you discovered)",
    "- positioning: how this competitor positions itself based on what you found on their actual website",
    "",
    "Also provide a 'summary' field describing your research methodology and key findings about the competitive landscape.",
    "",
    "Be thorough. Quality over speed. Return valid JSON only.",
  ].join("\n");
}

function extractGeminiText(response: GeminiResponse) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}

function extractGeminiGroundingSummary(response: GeminiResponse) {
  const candidate = response.candidates?.[0];
  const searchQueries = candidate?.groundingMetadata?.webSearchQueries ?? [];
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk.web?.uri?.trim())
    .filter((value): value is string => Boolean(value));
  const urlStatuses = candidate?.urlContextMetadata?.urlMetadata ?? [];
  const sourceCount = new Set(sources).size;
  const usedSiteContext = urlStatuses.some(
    (item) => item.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS",
  );

  const summaryParts = [];

  if (usedSiteContext) {
    summaryParts.push("Used the brand website as direct product context.");
  }

  if (searchQueries.length > 0) {
    summaryParts.push(
      `Verified with Google Search${searchQueries.length > 1 ? " queries" : ""}.`,
    );
  }

  if (sourceCount > 0) {
    summaryParts.push(
      `Grounded findings against ${sourceCount} public web source${sourceCount === 1 ? "" : "s"}.`,
    );
  }

  return summaryParts.join(" ");
}

async function runGeminiGroundedDiscovery(
  input: CompetitorDiscoveryInput,
): Promise<CompetitorDiscovery | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1/models/${DEFAULT_GEMINI_MODEL}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildGeminiCompetitorPrompt(input) }],
        },
      ],
      tools: [{ google_search: {} }, { url_context: {} }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: competitorDiscoveryResponseJsonSchema,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `Gemini competitor research failed with HTTP ${response.status}.`,
    );
  }

  const rawText = extractGeminiText(payload);
  if (!rawText) {
    throw new Error("Gemini competitor research returned an empty response.");
  }

  const parsed = competitorDiscoverySchema.parse(JSON.parse(rawText));
  const cleaned = cleanCompetitors(
    {
      ...parsed,
      summary:
        parsed.summary?.trim() ||
        extractGeminiGroundingSummary(payload) ||
        "Grounded competitor research completed with Gemini.",
    },
    input.siteUrl,
  );

  return cleaned.competitors.length > 0 ? cleaned : null;
}

/* ------------------------------------------------------------------ */
/*  Gemini deep research on individual competitors                      */
/* ------------------------------------------------------------------ */

const deepResearchJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    domain: { type: "string" },
    positioning: { type: "string", description: "How this company positions itself — based on their actual website copy" },
    targetAudience: { type: "string", description: "Who they sell to — based on their messaging, case studies, and pricing tiers" },
    keyFeatures: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
      description: "Core product features found on their website",
    },
    pricingModel: { type: "string", description: "Pricing structure — free tier, per-seat, usage-based, enterprise-only, etc." },
    pricingDetails: { type: "string", description: "Specific pricing info if publicly available" },
    strengths: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
      description: "What they do well — based on reviews, features, and market presence",
    },
    weaknesses: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
      description: "Gaps, complaints, missing features — from reviews, forums, social media",
    },
    fundingAndScale: { type: "string", description: "Known funding, employee count, or scale indicators" },
    contentStrategy: {
      type: "object",
      properties: {
        channels: { type: "array", items: { type: "string" }, maxItems: 6, description: "Marketing channels they use" },
        themes: { type: "array", items: { type: "string" }, maxItems: 6, description: "Content themes and topics" },
        tone: { type: "string", description: "Brand voice and tone" },
        cadence: { type: "string", description: "How frequently they publish" },
      },
      required: ["channels", "themes", "tone"],
    },
    recentActivity: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Recent launches, updates, blog posts, or news mentions",
    },
    marketPosition: { type: "string", description: "Where they sit in the market — leader, challenger, niche player, etc." },
  },
  required: ["name", "domain", "positioning", "targetAudience", "keyFeatures", "strengths", "weaknesses", "contentStrategy"],
} as const;

export type GeminiDeepCompetitorResearch = {
  name: string;
  domain: string;
  positioning: string;
  targetAudience: string;
  keyFeatures: string[];
  pricingModel?: string;
  pricingDetails?: string;
  strengths: string[];
  weaknesses: string[];
  fundingAndScale?: string;
  contentStrategy: {
    channels: string[];
    themes: string[];
    tone: string;
    cadence?: string;
  };
  recentActivity?: string[];
  marketPosition?: string;
};

function buildGeminiDeepResearchPrompt(
  competitorName: string,
  competitorDomain: string,
  brandName: string,
  brandDescription?: string,
) {
  return [
    "You are a competitive intelligence analyst conducting deep research on a specific competitor.",
    "",
    "## Research Instructions",
    "",
    "Conduct exhaustive research on this competitor. Do NOT guess or hallucinate — only report what you can verify through actual web research.",
    "",
    "### Phase 1: Website Deep-Dive",
    `1. Visit ${competitorDomain} — read their homepage, features/product page, pricing page, about page, and blog`,
    "2. Extract: exact positioning copy, feature list, pricing tiers, target audience signals, CTAs",
    "3. Note their brand voice, design quality, and overall market maturity",
    "",
    "### Phase 2: Market Intelligence",
    `4. Search for "${competitorName} reviews" on G2, Capterra, TrustRadius, Product Hunt`,
    `5. Search for "${competitorName} funding" or "${competitorName} crunchbase" for scale/funding info`,
    `6. Search for "${competitorName} pricing" to find detailed pricing information`,
    `7. Search for recent news: "${competitorName} launch", "${competitorName} update", "${competitorName} announcement"`,
    "",
    "### Phase 3: Content & Social Analysis",
    `8. Search for "${competitorName}" on Twitter/X, LinkedIn, Reddit to understand their social presence`,
    `9. Check their blog for publishing frequency, topics, and content quality`,
    "10. Identify their primary marketing channels and content themes",
    "",
    "### Phase 4: Strengths & Weaknesses",
    "11. From reviews and forums, identify common praise and complaints",
    `12. Compare their offering to ${brandName} — what do they do better? What are they missing?`,
    "",
    "## Context",
    "",
    `Competitor: ${competitorName} (${competitorDomain})`,
    `Our company: ${brandName}`,
    brandDescription ? `Our product: ${brandDescription}` : "",
    "",
    "Be thorough and evidence-based. Cite what you actually found. Return valid JSON only.",
  ].join("\n");
}

export async function runGeminiDeepCompetitorResearch(
  competitorName: string,
  competitorDomain: string,
  brandName: string,
  brandDescription?: string,
): Promise<GeminiDeepCompetitorResearch | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  try {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1/models/${DEFAULT_GEMINI_MODEL}:generateContent`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(GEMINI_DEEP_RESEARCH_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildGeminiDeepResearchPrompt(
                  competitorName,
                  competitorDomain,
                  brandName,
                  brandDescription,
                ),
              },
            ],
          },
        ],
        tools: [{ google_search: {} }, { url_context: {} }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseJsonSchema: deepResearchJsonSchema,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      console.error(
        `[deep-research] Gemini failed for ${competitorDomain}: ${payload.error?.message || response.status}`,
      );
      return null;
    }

    const rawText = extractGeminiText(payload);
    if (!rawText) {
      return null;
    }

    return JSON.parse(rawText) as GeminiDeepCompetitorResearch;
  } catch (err) {
    console.error(
      `[deep-research] Error researching ${competitorDomain}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function runCompetitorDiscoveryAgent(
  input: CompetitorDiscoveryInput,
) {
  const cached = getCachedDiscovery(input.siteUrl);
  if (cached) {
    return cached;
  }

  try {
    const geminiDiscovery = await runGeminiGroundedDiscovery(input);
    if (geminiDiscovery) {
      setCachedDiscovery(input.siteUrl, geminiDiscovery);
      return geminiDiscovery;
    }
  } catch {
    // Fall back to heuristic search discovery.
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
