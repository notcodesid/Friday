import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import type { FridayContext } from "@/lib/agents/core/context";
import { runFridayChat } from "@/lib/agents/friday";
import { requireSession } from "@/lib/auth/session";
import {
  getTweetPlaybook,
  getTweetPlaybookLoadError,
} from "@/lib/content/tweet-playbook";
import { hasAI } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

type SocialCopyRequest = {
  brandContext: FridayContext;
  force?: boolean;
};

type SocialCopyResponse =
  | {
      status: "success";
      data: {
        instagram: string;
        x: string;
        linkedin: string;
        raw: string;
      };
      statusCode: number;
    }
  | {
      status: "error";
      error: string;
      statusCode: number;
    };

type SocialCopyCacheEntry = SocialCopyResponse & {
  expiresAt: number;
};

type SocialCopyData = {
  instagram: string;
  x: string;
  linkedin: string;
  raw: string;
};

const SUCCESS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 15 * 60 * 1000;
const socialCopyCache = new Map<string, SocialCopyCacheEntry>();
const socialCopyInFlight = new Map<string, Promise<SocialCopyResponse>>();

export async function POST(request: Request) {
  if (!hasAI()) {
    return NextResponse.json(
      { error: "No AI provider is configured." },
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
  const tweetPlaybook = await getTweetPlaybook();

  if (!tweetPlaybook) {
    const playbookLoadError = await getTweetPlaybookLoadError();
    if (playbookLoadError) {
      console.error("Social copy playbook load failed:", playbookLoadError);
    }

    return NextResponse.json(
      {
        error:
          "Social copy is temporarily unavailable because the tweet playbook could not be loaded on the server.",
      },
      { status: 503 },
    );
  }

  const cacheKey = createSocialCopyCacheKey({
    userId: auth.user?.id ?? "anonymous",
    brandContext: context,
    playbookText: tweetPlaybook.text,
  });
  const force = body.force === true;

  if (force) {
    socialCopyCache.delete(cacheKey);
  } else {
    const cached = socialCopyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return toJsonResponse(cached);
    }
  }

  const prompt = `Generate a social media content pack for ${context.brandName ?? "this brand"}.

You MUST use the attached tweet playbook as the writing system behind the output. Do not ignore it, do not substitute your own framework, and do not produce content if you cannot follow it.

Use the playbook to shape:
- the hook
- the emotional payload
- the narrative progression
- the curiosity gap
- specificity, numbers, and authority
- the X post in particular

Adapt the same playbook to Instagram and LinkedIn without sounding robotic.

Playbook source: ${tweetPlaybook.sourcePath}

PLAYBOOK:
${tweetPlaybook.text}

Now create the content pack. I need:

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

  let requestPromise = socialCopyInFlight.get(cacheKey);
  if (!requestPromise) {
    requestPromise = generateSocialCopyResponse(prompt, context).finally(() => {
      socialCopyInFlight.delete(cacheKey);
    });
    socialCopyInFlight.set(cacheKey, requestPromise);
  }

  const result = await requestPromise;

  socialCopyCache.set(cacheKey, {
    ...result,
    expiresAt:
      Date.now() +
      (result.status === "success" ? SUCCESS_CACHE_TTL_MS : ERROR_CACHE_TTL_MS),
  });

  return toJsonResponse(result);
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

function extractAgentError(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (
    /^error:/i.test(trimmed) ||
    /api error:/i.test(trimmed) ||
    /invalid_request_error/i.test(trimmed) ||
    /workspace api usage limits/i.test(trimmed)
  ) {
    return trimmed.replace(/^error:\s*/i, "").trim();
  }

  return null;
}

function isValidSocialCopy(data: SocialCopyData) {
  if (extractAgentError(data.raw)) {
    return false;
  }

  return Boolean(data.instagram.trim() || data.x.trim() || data.linkedin.trim());
}

function createSocialCopyCacheKey({
  userId,
  brandContext,
  playbookText,
}: {
  userId: string;
  brandContext: FridayContext;
  playbookText: string;
}) {
  const payload = JSON.stringify({
    userId,
    brandContext,
    playbookTextHash: createHash("sha256").update(playbookText).digest("hex"),
  });

  return createHash("sha256").update(payload).digest("hex");
}

async function generateSocialCopyResponse(
  prompt: string,
  context: FridayContext,
): Promise<SocialCopyResponse> {
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

    const agentError = extractAgentError(fullText);
    if (agentError) {
      return {
        status: "error",
        error: agentError,
        statusCode: 502,
      };
    }

    return {
      status: "success",
      data: parseSocialCopy(fullText),
      statusCode: 200,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Social copy generation failed.";
    return {
      status: "error",
      error: message,
      statusCode: 500,
    };
  }
}

function toJsonResponse(result: SocialCopyResponse) {
  if (result.status === "success") {
    return NextResponse.json(result.data, { status: result.statusCode });
  }

  return NextResponse.json({ error: result.error }, { status: result.statusCode });
}
