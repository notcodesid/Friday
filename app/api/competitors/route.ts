import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/agents/core/client";
import { requireSession } from "@/lib/auth/session";
import { env, hasAI } from "@/lib/env";
import { searchGoogle } from "@/lib/tools/web";

export const runtime = "nodejs";
export const maxDuration = 60;

type DiscoverRequest = {
  brandName: string;
  oneLiner: string;
  siteUrl: string;
};

export async function POST(request: Request) {
  if (!hasAI()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: DiscoverRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.brandName || !body.oneLiner) {
    return NextResponse.json(
      { error: "Missing brandName or oneLiner." },
      { status: 400 },
    );
  }

  try {
    // Search for competitors using real web data
    const queries = [
      `${body.brandName} competitors alternatives`,
      `${body.oneLiner} apps`,
      `best apps like ${body.brandName}`,
    ];

    const allResults: Array<{ title: string; url: string; snippet: string }> = [];
    for (const q of queries) {
      try {
        const results = await searchGoogle(q, 10);
        allResults.push(...results);
      } catch {
        // continue with other queries
      }
    }

    // Use Claude to extract competitor domains from the search results
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: env.model,
      max_tokens: 1024,
      temperature: 0,
      system: `You extract competitor domains from search results. Return ONLY a JSON array of domain strings (e.g. ["competitor1.com", "competitor2.app"]).
Rules:
- Only include direct competitors (similar products in the same space)
- Use the bare domain (no https://, no paths)
- Exclude the brand's own domain
- Exclude generic sites (google.com, reddit.com, youtube.com, medium.com, producthunt.com, g2.com, capterra.com, etc.)
- Return 4-8 competitors max, ranked by relevance
- If you can't find competitors, return an empty array []`,
      messages: [
        {
          role: "user",
          content: `Brand: ${body.brandName}
Product: ${body.oneLiner}
Brand site: ${body.siteUrl}

Search results:
${allResults.map((r) => `- ${r.title} | ${r.url} | ${r.snippet}`).join("\n")}

Extract the competitor domains:`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("");

    // Parse the JSON array from the response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ competitors: [] });
    }

    const competitors = JSON.parse(match[0]) as string[];
    const cleaned = competitors
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
      .filter((d) => d && !d.includes(" "));

    return NextResponse.json({ competitors: cleaned });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to discover competitors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
