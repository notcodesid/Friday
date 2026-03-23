import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { getCurrentSubscription } from "@/lib/payments/store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const subscription = await getCurrentSubscription(auth.user);
  return NextResponse.json({ subscription });
}
