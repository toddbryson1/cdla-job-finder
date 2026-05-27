import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isGhlConfigured } from "@/lib/ghl/client";
import { runNurtureSends } from "@/lib/nurture-sends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual-trigger handler for the nurture sends. Scheduled execution
// happens via /api/cron/daily; this route stays so we can invoke
// nurture independently (Vercel Cron UI "Run" button, debug curls,
// etc.). Same CRON_SECRET auth.

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/nurture] CRON_SECRET is not set");
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
    const result = await runNurtureSends(db);
    console.log("[cron/nurture] run:", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/nurture] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
