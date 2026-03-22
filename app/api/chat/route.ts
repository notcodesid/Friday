import { NextResponse } from "next/server";

import type { FridayContext } from "@/lib/agents/core/context";
import { runAgentStream } from "@/lib/agents/core/runner";
import { cmoAgent } from "@/lib/agents/cmo";
import { contentStrategistAgent } from "@/lib/agents/content-strategist";
import { requireSession } from "@/lib/auth/session";
import { hasAI } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

const agents: Record<string, typeof cmoAgent> = {
  cmo: cmoAgent,
  "content-strategist": contentStrategistAgent,
};

type ChatRequest = {
  message: string;
  agentId?: string;
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

  const agent = agents[body.agentId ?? "cmo"] ?? cmoAgent;
  const context: FridayContext = body.brandContext ?? {};

  try {
    const stream = await runAgentStream(agent, body.message, context);

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
