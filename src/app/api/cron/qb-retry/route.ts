// GET /api/cron/qb-retry — Vercel-cron-triggered sweeper for the
// QuickBase retry queue. Picks up partner_application_stages rows
// where stage='submit_queued_for_retry' and the spec §B6.3 backoff
// window has elapsed, pushes them to Sterling's QuickBase, and
// updates the stage based on the outcome.
//
// Auth: same Bearer CRON_SECRET pattern as /api/cron/daily.
//
// Cadence: 15 minutes (see vercel.json). The retry schedule starts
// at 5 minutes, so the first retry happens between 5-20min after
// the initial failure (worst case: cron just ran when the row
// became due). That's close enough to spec for v1.
//
// The same runQbRetrySweeper() is also called from /api/cron/daily
// as a safety net — if Vercel's cron tier blocks the new entry, the
// daily cron still drains the queue once per day.

import { NextResponse } from "next/server";
import { runQbRetrySweeper } from "@/lib/quickbase/retry-sweeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s budget for the batch — at 50 rows per sweep and ~1-3s per
// QuickBase POST, this leaves plenty of headroom.
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/qb-retry] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runAt = new Date().toISOString();
  try {
    const result = await runQbRetrySweeper();
    console.log(
      `[cron/qb-retry] ${runAt} attempted=${result.attempted} succeeded=${result.succeeded} requeued=${result.requeued} failed_validation=${result.failedValidation} exhausted=${result.exhausted} skipped_flag_off=${result.skippedFlagOff}`,
    );
    return NextResponse.json({ runAt, ...result });
  } catch (err) {
    console.error("[cron/qb-retry] sweeper failed:", err);
    return NextResponse.json(
      {
        runAt,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
