import { NextResponse } from "next/server";

import type { FridayContext } from "@/lib/agents/core/context";
import { runFridayChat } from "@/lib/agents/friday";
import { requireSession } from "@/lib/auth/session";
import { hasAI } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

type SocialCopyRequest = {
  brandContext: FridayContext;
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

  let body: SocialCopyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const context: FridayContext = body.brandContext ?? {};

  const prompt = `Generate a social media content pack for ${context.brandName ?? "this brand"}. I need:

1. **Instagram Post** - A compelling caption (2-4 sentences) with a hook, value prop, and CTA. Include 3-5 relevant hashtags at the end.

2. **X (Twitter) Post** - A punchy tweet under 280 characters that drives curiosity or engagement.

3. **LinkedIn Post** - A professional post (3-5 sentences) focused on the business value and industry impact.

Format your response EXACTLY like this with these exact headers:

## Instagram
[caption here including hashtags]

## X
[tweet here]

## LinkedIn
[post here]

Do NOT include any other text, preamble, or explanation. Just the three posts with their headers.`;

  try {
    const stream = runFridayChat(prompt, "content-strategist", context);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    // Parse the structured output
    const sections = parseSocialCopy(fullText);

    return NextResponse.json(sections);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Social copy generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseSocialCopy(text: string) {
  const result = {
    instagram: "",
    x: "",
    linkedin: "",
    raw: text,
  };

  // Try to extract sections by headers
  const igMatch = text.match(/##\s*Instagram\s*\n([\s\S]*?)(?=##\s*(?:X|Twitter|LinkedIn)|$)/i);
  const xMatch = text.match(/##\s*(?:X|Twitter)\s*\n([\s\S]*?)(?=##\s*LinkedIn|$)/i);
  const liMatch = text.match(/##\s*LinkedIn\s*\n([\s\S]*?)$/i);

  if (igMatch) result.instagram = igMatch[1].trim();
  if (xMatch) result.x = xMatch[1].trim();
  if (liMatch) result.linkedin = liMatch[1].trim();

  // Fallback: if parsing failed, split by double newlines
  if (!result.instagram && !result.x && !result.linkedin) {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);
    if (paragraphs.length >= 3) {
      result.instagram = paragraphs[0].trim();
      result.x = paragraphs[1].trim();
      result.linkedin = paragraphs[2].trim();
    } else if (paragraphs.length >= 1) {
      result.instagram = paragraphs[0].trim();
      result.x = paragraphs[0].trim().slice(0, 280);
      result.linkedin = paragraphs[0].trim();
    }
  }

  return result;
}
