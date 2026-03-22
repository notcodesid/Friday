import { NextResponse } from "next/server";

import type { FridayContext } from "@/lib/agents/core/context";
import { runFridayChat, type FridayAgentId } from "@/lib/agents/friday";
import { requireSession } from "@/lib/auth/session";
import { hasAI } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

type ChatRequest = {
  message: string;
  agentId?: FridayAgentId;
  brandContext?: FridayContext;
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

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "Missing 'message' field." },
      { status: 400 },
    );
  }

  const agentId = body.agentId ?? "cmo";
  const context: FridayContext = body.brandContext ?? {};

  try {
    const stream = runFridayChat(body.message, agentId, context);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent execution failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
