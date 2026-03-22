import { NextResponse } from "next/server";

import { runCompetitorDiscoveryAgent } from "@/lib/agents/competitor-discovery";
import { requireSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

type DiscoverRequest = {
  brandName: string;
  oneLiner?: string;
  siteUrl: string;
};

export async function POST(request: Request) {
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

  if (!body.brandName || !body.siteUrl) {
    return NextResponse.json(
      { error: "Missing brandName or siteUrl." },
      { status: 400 },
    );
  }

  try {
    const discovery = await runCompetitorDiscoveryAgent({
      brandName: body.brandName,
      oneLiner: body.oneLiner,
      siteUrl: body.siteUrl,
    });

    return NextResponse.json(discovery);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to discover competitors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
