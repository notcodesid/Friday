import { NextResponse } from "next/server";

import { runAnalyzePipeline } from "@/lib/agents/analyze-pipeline";
import { requireSession } from "@/lib/auth/session";
import { hasAI } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type AnalyzeRequest = {
  siteUrl: string;
};

export async function POST(request: Request) {
  if (!hasAI()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured. Add to .env to enable analyze." },
      { status: 500 },
    );
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.siteUrl || typeof body.siteUrl !== "string") {
    return NextResponse.json(
      { error: "Missing 'siteUrl' field." },
      { status: 400 },
    );
  }

  try {
    new URL(body.siteUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL." },
      { status: 400 },
    );
  }

  const stream = runAnalyzePipeline({ siteUrl: body.siteUrl });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
