import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireSession } from "@/lib/auth/session";
import { createAgentRun, listAgentRuns } from "@/lib/runs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const runs = await listAgentRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const run = await createAgentRun(body);
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid run input.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Agent execution failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
