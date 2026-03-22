import type { ToolDefinition } from "@/lib/agents/core/runner";
import {
  searchGoogle,
  researchKeyword,
  analyzeBrand,
  fetchHtml,
  extractPageContent,
} from "@/lib/tools/web";

/* ------------------------------------------------------------------ */
/*  Tool 1: Research a keyword                                         */
/*  Scrapes Google, analyses top-ranking articles, returns competitive */
/*  intelligence the LLM uses to write better content.                 */
/* ------------------------------------------------------------------ */

export const researchKeywordTool: ToolDefinition = {
  name: "research_keyword",
  description:
    "Research a keyword by scraping Google search results and analyzing the top-ranking articles. " +
    "Returns word counts, heading structures, common topics, and content gaps. " +
    "ALWAYS call this before writing a blog post to ground your content in real competitive data.",
  input_schema: {
    type: "object",
    properties: {
      keyword: { type: "string", description: "The keyword or search query to research" },
      depth: { type: "number", description: "How many top results to analyze (1-8, default 5)" },
    },
    required: ["keyword"],
  },
  execute: async ({ keyword, depth }) => {
    const research = await researchKeyword(
      keyword as string,
      Math.min(Number(depth) || 5, 8),
    );
    return JSON.stringify({
      keyword: research.keyword,
      topResults: research.topResults,
      avgWordCount: research.avgWordCount,
      avgReadingTime: research.avgReadingTime,
      commonHeadings: research.commonHeadings,
      commonTopics: research.commonTopics,
      articlesAnalyzed: research.topArticles.map((a) => ({
        url: a.url,
        title: a.title,
        wordCount: a.wordCount,
        headings: a.headingStructure.slice(0, 10),
        hasImages: a.hasImages,
        hasFaq: a.hasFaq,
        internalLinks: a.internalLinkCount,
        externalLinks: a.externalLinkCount,
      })),
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Tool 2: Analyze a competitor's brand and content strategy          */
/*  Scrapes the actual website and extracts positioning, CTAs,         */
/*  tone signals, social presence, tech stack.                         */
/* ------------------------------------------------------------------ */

export const analyzeCompetitorTool: ToolDefinition = {
  name: "analyze_competitor",
  description:
    "Deep-analyze a competitor's website. Scrapes the site and extracts brand positioning, " +
    "key messages, CTAs, tone indicators, social links, and tech stack. " +
    "Use this to find gaps and opportunities before creating content.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The competitor's website URL" },
    },
    required: ["url"],
  },
  execute: async ({ url }) => {
    const analysis = await analyzeBrand(url as string);
    return JSON.stringify(analysis);
  },
};

/* ------------------------------------------------------------------ */
/*  Tool 3: Scrape a specific page for content                         */
/*  Fetches and extracts clean text from any URL                       */
/* ------------------------------------------------------------------ */

export const scrapePageTool: ToolDefinition = {
  name: "scrape_page",
  description:
    "Fetch and extract clean content from a specific URL. Returns title, headings, " +
    "paragraphs, links, and word count. Use this to read specific articles, landing pages, " +
    "or any web page you need to reference or analyze.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to scrape" },
    },
    required: ["url"],
  },
  execute: async ({ url }) => {
    const html = await fetchHtml(url as string);
    const content = extractPageContent(html, url as string);
    return JSON.stringify(content);
  },
};

/* ------------------------------------------------------------------ */
/*  Tool 4: Search the web                                             */
/*  Google search for any query — useful for trend research,           */
/*  finding examples, checking what's ranking.                         */
/* ------------------------------------------------------------------ */

export const searchWebTool: ToolDefinition = {
  name: "search_web",
  description:
    "Search Google for any query. Returns titles, URLs, and snippets of top results. " +
    "Use this for trend research, finding examples, checking what content exists on a topic, " +
    "or discovering what people are searching for.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      numResults: { type: "number", description: "Number of results (1-10, default 10)" },
    },
    required: ["query"],
  },
  execute: async ({ query, numResults }) => {
    const results = await searchGoogle(
      query as string,
      Math.min(Number(numResults) || 10, 10),
    );
    return JSON.stringify(results);
  },
};

/* ------------------------------------------------------------------ */
/*  Tool 5: Research social media trends for a topic                   */
/*  Searches for what's performing on specific platforms               */
/* ------------------------------------------------------------------ */

export const researchSocialTrendsTool: ToolDefinition = {
  name: "research_social_trends",
  description:
    "Research what's trending and performing well on a specific social platform for a given topic. " +
    "Scrapes Google for top-performing posts and content patterns on that platform. " +
    "ALWAYS call this before creating social media copy to understand what works.",
  input_schema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "The topic to research" },
      platform: {
        type: "string",
        enum: ["LinkedIn", "X", "Instagram", "Facebook", "TikTok", "Reddit", "YouTube"],
        description: "Which social platform to research",
      },
    },
    required: ["topic", "platform"],
  },
  execute: async ({ topic, platform }) => {
    // Search for best-performing content on this platform for this topic
    const queries = [
      `best ${platform} posts about ${topic}`,
      `viral ${platform} ${topic} examples`,
      `site:${platformDomain(platform as string)} ${topic}`,
    ];

    const allResults = [];
    for (const q of queries) {
      try {
        const results = await searchGoogle(q, 5);
        allResults.push(...results);
      } catch {
        // continue with other queries
      }
    }

    // Scrape a few results to extract actual post patterns
    const contentSamples = [];
    for (const result of allResults.slice(0, 3)) {
      try {
        const html = await fetchHtml(result.url);
        const content = extractPageContent(html, result.url);
        contentSamples.push({
          title: content.title,
          url: content.url,
          keyPoints: content.headings.slice(0, 5),
          summary: content.paragraphs.slice(0, 3),
        });
      } catch {
        // skip failed fetches
      }
    }

    return JSON.stringify({
      platform,
      topic,
      searchResults: allResults.slice(0, 10),
      contentSamples,
    });
  },
};

function platformDomain(platform: string): string {
  const domains: Record<string, string> = {
    LinkedIn: "linkedin.com",
    X: "x.com OR site:twitter.com",
    Instagram: "instagram.com",
    Facebook: "facebook.com",
    TikTok: "tiktok.com",
    Reddit: "reddit.com",
    YouTube: "youtube.com",
  };
  return domains[platform] ?? platform.toLowerCase() + ".com";
}

/* ------------------------------------------------------------------ */
/*  Tool 6: Research email marketing best practices                    */
/*  Finds real examples and benchmarks for email campaigns             */
/* ------------------------------------------------------------------ */

export const researchEmailBestPracticesTool: ToolDefinition = {
  name: "research_email_best_practices",
  description:
    "Research email marketing best practices, benchmarks, and examples for a specific " +
    "campaign type and industry. Scrapes real data on open rates, subject line patterns, " +
    "and what's working. ALWAYS call this before creating email campaigns.",
  input_schema: {
    type: "object",
    properties: {
      campaignType: {
        type: "string",
        enum: ["welcome", "nurture", "promotional", "re-engagement", "announcement"],
        description: "Type of email campaign",
      },
      industry: { type: "string", description: "Industry or niche (e.g. 'SaaS', 'ecommerce', 'fintech')" },
    },
    required: ["campaignType"],
  },
  execute: async ({ campaignType, industry }) => {
    const industryStr = industry ? ` ${industry}` : "";
    const queries = [
      `best ${campaignType} email examples${industryStr} 2025`,
      `${campaignType} email sequence benchmarks open rates${industryStr}`,
      `${campaignType} email subject lines that convert${industryStr}`,
    ];

    const allResults = [];
    for (const q of queries) {
      try {
        const results = await searchGoogle(q, 5);
        allResults.push(...results);
      } catch {
        // continue
      }
    }

    // Scrape top articles for actual benchmarks
    const insights = [];
    for (const result of allResults.slice(0, 3)) {
      try {
        const html = await fetchHtml(result.url);
        const content = extractPageContent(html, result.url);
        insights.push({
          source: content.title,
          url: content.url,
          keyPoints: content.headings.slice(0, 8),
          details: content.paragraphs.slice(0, 5),
        });
      } catch {
        // skip
      }
    }

    return JSON.stringify({
      campaignType,
      industry: industry ?? "general",
      searchResults: allResults.slice(0, 10),
      insights,
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Export all tools                                                    */
/* ------------------------------------------------------------------ */

export const contentStrategistTools: ToolDefinition[] = [
  researchKeywordTool,
  analyzeCompetitorTool,
  scrapePageTool,
  searchWebTool,
  researchSocialTrendsTool,
  researchEmailBestPracticesTool,
];
