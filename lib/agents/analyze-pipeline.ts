import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicClient } from "@/lib/agents/core/client";
import {
  runCompetitorDiscoveryAgent,
  runGeminiDeepCompetitorResearch,
  type GeminiDeepCompetitorResearch,
} from "@/lib/agents/competitor-discovery";
import {
  productAnalysisSchema,
  competitorAnalysisSchema,
  competitiveInsightsSchema,
  type ProductAnalysis,
  type CompetitorAnalysis,
} from "@/lib/agents/schemas";
import { env } from "@/lib/env";
import { inspectWebsite } from "@/lib/site/inspect";
import { analyzeBrand } from "@/lib/tools/web";

/* ------------------------------------------------------------------ */
/*  JSON schemas for Anthropic tool_use structured output               */
/* ------------------------------------------------------------------ */

const productAnalysisJsonSchema: Anthropic.Tool["input_schema"] = {
  type: "object",
  properties: {
    brandName: { type: "string" },
    oneLiner: { type: "string", description: "One sentence describing the product" },
    positioning: { type: "string", description: "How the product positions itself in the market" },
    targetAudience: { type: "array", items: { type: "string" }, maxItems: 4 },
    painPoints: { type: "array", items: { type: "string" }, maxItems: 6, description: "Problems the product solves" },
    differentiators: { type: "array", items: { type: "string" }, maxItems: 6, description: "What makes this product unique" },
    primaryCta: { type: "string", description: "Main call-to-action" },
    brandVoice: { type: "array", items: { type: "string" }, maxItems: 4, description: "Tone descriptors" },
    techStack: { type: "array", items: { type: "string" }, maxItems: 6 },
    socialLinks: {
      type: "array",
      items: { type: "object", properties: { platform: { type: "string" }, url: { type: "string" } }, required: ["platform", "url"] },
      maxItems: 8,
    },
  },
  required: ["brandName", "oneLiner", "positioning", "targetAudience", "painPoints", "differentiators", "primaryCta", "brandVoice", "techStack", "socialLinks"],
};

const competitorAnalysisJsonSchema: Anthropic.Tool["input_schema"] = {
  type: "object",
  properties: {
    name: { type: "string" },
    domain: { type: "string" },
    positioning: { type: "string" },
    targetAudience: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
    weaknesses: { type: "array", items: { type: "string" }, maxItems: 6 },
    contentStrategy: {
      type: "object",
      properties: {
        channels: { type: "array", items: { type: "string" }, maxItems: 6 },
        themes: { type: "array", items: { type: "string" }, maxItems: 6 },
        tone: { type: "string" },
        cadence: { type: "string" },
      },
      required: ["channels", "themes", "tone"],
    },
    pricingModel: { type: "string" },
    techStack: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["name", "domain", "positioning", "targetAudience", "strengths", "weaknesses", "contentStrategy", "techStack"],
};

const competitiveInsightsJsonSchema: Anthropic.Tool["input_schema"] = {
  type: "object",
  properties: {
    opportunities: { type: "array", items: { type: "string" }, maxItems: 6, description: "Market opportunities for the user's product" },
    gaps: { type: "array", items: { type: "string" }, maxItems: 6, description: "Gaps competitors have that we can exploit" },
    recommendations: { type: "array", items: { type: "string" }, maxItems: 6, description: "Actionable next steps" },
    positioningAdvice: { type: "string", description: "How the user's product should position itself given the competitive landscape" },
  },
  required: ["opportunities", "gaps", "recommendations", "positioningAdvice"],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: unknown,
) {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
}

function extractToolResult(response: Anthropic.Message): unknown {
  for (const block of response.content) {
    if (block.type === "tool_use") {
      return block.input;
    }
  }
  // Fallback: try to parse text as JSON
  for (const block of response.content) {
    if (block.type === "text") {
      const match = block.text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  }
  throw new Error("No structured output in response");
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                            */
/* ------------------------------------------------------------------ */

export type AnalyzePipelineInput = { siteUrl: string };

export function runAnalyzePipeline(
  input: AnalyzePipelineInput,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const client = getAnthropicClient();
      const emit = (event: string, data: unknown) =>
        sendEvent(controller, encoder, event, data);

      let productAnalysis: ProductAnalysis | null = null;

      /* ---- Step 1: Product Analysis ---- */
      try {
        emit("step", { step: 1, status: "running", label: "Analyzing product..." });

        const [siteContext, brandData] = await Promise.all([
          inspectWebsite(input.siteUrl),
          analyzeBrand(input.siteUrl),
        ]);

        const response = await client.messages.create({
          model: env.model,
          max_tokens: 2048,
          temperature: 0.5,
          system:
            "You are a product analyst. Given raw website data, produce a structured product analysis. Be specific — cite actual text from the site. Infer target audience and pain points from the messaging and positioning.",
          messages: [
            {
              role: "user",
              content: `Analyze this product:\n\nSite data: ${JSON.stringify(siteContext)}\n\nBrand data: ${JSON.stringify(brandData)}`,
            },
          ],
          tools: [
            {
              name: "product_analysis",
              description: "Structured product analysis output",
              input_schema: productAnalysisJsonSchema,
            },
          ],
          tool_choice: { type: "tool", name: "product_analysis" },
        });

        const raw = extractToolResult(response);
        productAnalysis = productAnalysisSchema.parse(raw);
        emit("product-analysis", productAnalysis);
      } catch (err) {
        emit("error", {
          step: 1,
          message: err instanceof Error ? err.message : "Product analysis failed",
        });

        // Fallback: try to get basic brand info for step 2
        try {
          const brandData = await analyzeBrand(input.siteUrl);
          productAnalysis = {
            brandName: brandData.brandName,
            oneLiner: brandData.tagline,
            positioning: brandData.positioning,
            targetAudience: brandData.targetAudience,
            painPoints: [],
            differentiators: [],
            primaryCta: brandData.ctas[0] ?? "",
            brandVoice: brandData.toneIndicators,
            techStack: brandData.techStack,
            socialLinks: brandData.socialLinks,
          };
        } catch {
          // Can't recover — continue with null
        }
      }

      /* ---- Step 2: Competitor Discovery ---- */
      let competitors: Array<{
        name: string;
        domain: string;
        logo?: string;
        reason: string;
        positioning?: string;
      }> = [];

      try {
        emit("step", { step: 2, status: "running", label: "Finding competitors..." });

        const discovery = await runCompetitorDiscoveryAgent({
          brandName: productAnalysis?.brandName ?? new URL(input.siteUrl).hostname,
          oneLiner: productAnalysis?.oneLiner,
          siteUrl: input.siteUrl,
        });

        competitors = discovery.competitors.slice(0, 5);
        emit("competitors-found", competitors);
      } catch (err) {
        emit("error", {
          step: 2,
          message: err instanceof Error ? err.message : "Competitor discovery failed",
        });
      }

      /* ---- Step 3: Competitor Deep Analysis (Gemini Deep Research + Claude) ---- */
      const analyses: CompetitorAnalysis[] = [];

      // Run Gemini deep research on all competitors in parallel for speed
      emit("step", {
        step: 3,
        status: "running",
        label: "Deep researching all competitors with Gemini...",
      });

      const deepResearchResults = await Promise.allSettled(
        competitors.map((competitor) =>
          runGeminiDeepCompetitorResearch(
            competitor.name,
            competitor.domain,
            productAnalysis?.brandName ?? new URL(input.siteUrl).hostname,
            productAnalysis?.oneLiner,
          ),
        ),
      );

      const geminiResearch = new Map<string, GeminiDeepCompetitorResearch>();
      for (let i = 0; i < competitors.length; i++) {
        const result = deepResearchResults[i];
        if (result.status === "fulfilled" && result.value) {
          geminiResearch.set(competitors[i].domain, result.value);
        }
      }

      for (const competitor of competitors) {
        try {
          emit("step", {
            step: 3,
            status: "running",
            label: `Analyzing ${competitor.name}...`,
          });

          const deepResearch = geminiResearch.get(competitor.domain);

          // If we have Gemini deep research, use it as primary intelligence
          // Otherwise fall back to basic brand scraping
          let competitorIntel: string;
          if (deepResearch) {
            competitorIntel = [
              `## Gemini Deep Research Results for ${competitor.name}`,
              `Positioning: ${deepResearch.positioning}`,
              `Target Audience: ${deepResearch.targetAudience}`,
              `Key Features: ${deepResearch.keyFeatures.join(", ")}`,
              deepResearch.pricingModel ? `Pricing Model: ${deepResearch.pricingModel}` : "",
              deepResearch.pricingDetails ? `Pricing Details: ${deepResearch.pricingDetails}` : "",
              `Strengths: ${deepResearch.strengths.join("; ")}`,
              `Weaknesses: ${deepResearch.weaknesses.join("; ")}`,
              deepResearch.fundingAndScale ? `Funding/Scale: ${deepResearch.fundingAndScale}` : "",
              `Content Channels: ${deepResearch.contentStrategy.channels.join(", ")}`,
              `Content Themes: ${deepResearch.contentStrategy.themes.join(", ")}`,
              `Brand Tone: ${deepResearch.contentStrategy.tone}`,
              deepResearch.contentStrategy.cadence ? `Publishing Cadence: ${deepResearch.contentStrategy.cadence}` : "",
              deepResearch.recentActivity?.length ? `Recent Activity: ${deepResearch.recentActivity.join("; ")}` : "",
              deepResearch.marketPosition ? `Market Position: ${deepResearch.marketPosition}` : "",
            ].filter(Boolean).join("\n");
          } else {
            const competitorBrand = await analyzeBrand(
              `https://${competitor.domain}`,
            );
            competitorIntel = `## Scraped Website Data\n${JSON.stringify(competitorBrand)}`;
          }

          const response = await client.messages.create({
            model: env.model,
            max_tokens: 2048,
            temperature: 0.5,
            system: deepResearch
              ? "You are a competitive intelligence analyst. You have been given DEEP research data about a competitor gathered from multiple sources (their website, reviews, news, social media). Synthesize this into a structured competitive assessment. Be specific — cite the real data you've been given. Compare to the user's product where relevant."
              : "You are a competitive intelligence analyst. Analyze a competitor's website data and produce a structured assessment. Be specific — cite real features, copy, and positioning from their site. Compare to the user's product where relevant.",
            messages: [
              {
                role: "user",
                content: `Analyze this competitor:\n\nCompetitor: ${competitor.name} (${competitor.domain})\n\n${competitorIntel}\n\nOur product for comparison:\n${JSON.stringify(productAnalysis)}`,
              },
            ],
            tools: [
              {
                name: "competitor_analysis",
                description: "Structured competitor analysis output",
                input_schema: competitorAnalysisJsonSchema,
              },
            ],
            tool_choice: { type: "tool", name: "competitor_analysis" },
          });

          const raw = extractToolResult(response);
          const analysis = competitorAnalysisSchema.parse(raw);
          analyses.push(analysis);
          emit("competitor-analysis", analysis);
        } catch (err) {
          emit("error", {
            step: 3,
            competitor: competitor.name,
            message:
              err instanceof Error ? err.message : "Competitor analysis failed",
          });
        }
      }

      /* ---- Final: Cross-competitor Insights ---- */
      if (analyses.length > 0 && productAnalysis) {
        try {
          emit("step", {
            step: 4,
            status: "running",
            label: "Synthesizing insights...",
          });

          const response = await client.messages.create({
            model: env.model,
            max_tokens: 2048,
            temperature: 0.6,
            system:
              "You are a strategic marketing advisor. Given a product analysis and competitive intelligence, synthesize actionable insights. Focus on what the product should DO differently — specific positioning moves, content gaps to exploit, and features to highlight.",
            messages: [
              {
                role: "user",
                content: `Our product:\n${JSON.stringify(productAnalysis)}\n\nCompetitor analyses:\n${JSON.stringify(analyses)}\n\nProvide strategic insights: opportunities, competitive gaps we can exploit, specific recommendations, and positioning advice.`,
              },
            ],
            tools: [
              {
                name: "competitive_insights",
                description: "Competitive insights and strategic recommendations",
                input_schema: competitiveInsightsJsonSchema,
              },
            ],
            tool_choice: { type: "tool", name: "competitive_insights" },
          });

          const raw = extractToolResult(response);
          const insights = competitiveInsightsSchema.parse(raw);
          emit("insights", insights);
        } catch (err) {
          emit("error", {
            step: 4,
            message:
              err instanceof Error ? err.message : "Insights generation failed",
          });
        }
      }

      emit("done", {});
      controller.close();
    },
  });
}
