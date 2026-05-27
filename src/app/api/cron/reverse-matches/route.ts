import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isGhlConfigured } from "@/lib/ghl/client";
import { runReverseMatches } from "@/lib/reverse-matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual-trigger handler for reverse-match alerts. Scheduled execution
// happens via /api/cron/daily.

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/reverse-matches] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isGhlConfigured()) {
    return NextResponse.json(
      { error: "GHL not configured" },
      { status: 500 },
    );
  }

  try {
    const result = await runReverseMatches(db);
    console.log("[cron/reverse-matches] run:", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/reverse-matches] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
