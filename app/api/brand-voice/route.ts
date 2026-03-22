import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/agents/core/client";
import { brandVoiceDocSchema } from "@/lib/agents/schemas";
import { env } from "@/lib/env";
import { inspectWebsite } from "@/lib/site/inspect";
import { analyzeBrand } from "@/lib/tools/web";

const brandVoiceJsonSchema: Anthropic.Tool["input_schema"] = {
  type: "object",
  properties: {
    identity: {
      type: "string",
      description:
        "One-line voice identity that captures the brand's personality, e.g. 'A sharp friend who has done the hard thing and won't sugarcoat it'",
    },
    principles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Short principle name, e.g. 'Direct over clever'",
          },
          explanation: {
            type: "string",
            description: "Why this matters for the brand",
          },
          example: {
            type: "string",
            description: "A sample sentence written in this principle",
          },
        },
        required: ["label", "explanation", "example"],
      },
      minItems: 3,
      maxItems: 4,
    },
    toneSpectrum: {
      type: "array",
      description:
        "How the voice shifts across different contexts (e.g. onboarding, error states, marketing, push notifications)",
      items: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description: "Where this tone applies",
          },
          tone: { type: "string", description: "How the voice shifts" },
          example: { type: "string", description: "A sample line" },
        },
        required: ["context", "tone", "example"],
      },
      minItems: 3,
      maxItems: 5,
    },
    dos: {
      type: "array",
      items: { type: "string" },
      description: "Concrete writing rules to follow",
      minItems: 3,
      maxItems: 6,
    },
    donts: {
      type: "array",
      items: { type: "string" },
      description: "Concrete writing anti-patterns to avoid",
      minItems: 3,
      maxItems: 6,
    },
    rewrites: {
      type: "array",
      description:
        "Take generic marketing lines and rewrite them in the brand voice",
      items: {
        type: "object",
        properties: {
          generic: { type: "string", description: "A generic marketing line" },
          rewritten: {
            type: "string",
            description: "The same line rewritten in the brand voice",
          },
        },
        required: ["generic", "rewritten"],
      },
      minItems: 2,
      maxItems: 3,
    },
  },
  required: [
    "identity",
    "principles",
    "toneSpectrum",
    "dos",
    "donts",
    "rewrites",
  ],
};

export async function POST(req: Request) {
  const body = (await req.json()) as { siteUrl?: string };
  const siteUrl = body.siteUrl;

  if (!siteUrl) {
    return NextResponse.json(
      { error: "Missing siteUrl" },
      { status: 400 },
    );
  }

  try {
    const client = getAnthropicClient();

    const [siteContext, brandData] = await Promise.all([
      inspectWebsite(siteUrl),
      analyzeBrand(siteUrl),
    ]);

    const response = await client.messages.create({
      model: env.model,
      max_tokens: 4096,
      temperature: 0.7,
      system: `You are a world-class brand strategist who has built voice guides for companies like Stripe, Linear, and Duolingo. You think like a founder/PM who deeply understands the product.

Given raw website data, produce a comprehensive brand voice document. This is NOT generic marketing advice — it must be deeply specific to THIS product, THIS audience, and THIS market position.

Rules:
- The voice identity should feel like describing a person, not a corporate style guide
- Principles should be opinionated and specific to the product's positioning
- The tone spectrum should cover real product contexts (onboarding, error states, notifications, marketing, support) — not abstract categories
- Do's and Don'ts should be concrete enough that a copywriter can follow them immediately
- Rewrites should take the most generic, boring version of what this product might say and transform it into something unmistakably this brand
- Everything must be grounded in what you see on the actual site — cite real copy, features, and positioning`,
      messages: [
        {
          role: "user",
          content: `Generate a brand voice document for this product.

Site data:
${JSON.stringify(siteContext, null, 2)}

Brand analysis:
${JSON.stringify(brandData, null, 2)}`,
        },
      ],
      tools: [
        {
          name: "brand_voice_doc",
          description: "Structured brand voice document",
          input_schema: brandVoiceJsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: "brand_voice_doc" },
    });

    let raw: unknown = null;
    for (const block of response.content) {
      if (block.type === "tool_use") {
        raw = block.input;
        break;
      }
    }

    if (!raw) {
      return NextResponse.json(
        { error: "No structured output" },
        { status: 502 },
      );
    }

    const doc = brandVoiceDocSchema.parse(raw);
    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Brand voice generation failed",
      },
      { status: 500 },
    );
  }
}
