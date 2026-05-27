import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isGhlConfigured } from "@/lib/ghl/client";
import { runNurtureSends } from "@/lib/nurture-sends";
import { runReverseMatches } from "@/lib/reverse-matches";
import { syncSwiftJobs } from "@/lib/swift-sync";
import { spawnPostingCycles } from "@/lib/posting-cycles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Master daily cron. Vercel Hobby tier caps cron-job count low; one
// scheduled route runs every daily task in sequence. Each operation is
// independent — a failure in one doesn't block the next.
//
// Order matters: sync-swift refreshes carrier_jobs first, so the
// downstream reverse-matches step detects newly-inserted jobs as "new
// matches" for affected drivers. Posting cycles run AFTER sync so new
// jobs get cycles spawned the same day they're added.
//
//   1. sync-swift      — refresh carrier_jobs from Smartsheet
//   2. posting-cycles  — expire 20-day-old cycles, spawn repost cycles
//                        + multi-city cycles per job
//   3. nurture         — fire scheduled drip emails
//   4. reverse-matches — alert drivers whose match list grew
//
// Auth via CRON_SECRET (Vercel adds Authorization: Bearer <secret>).
// To run manually use Vercel → Cron Jobs → Run, or hit the individual
// /api/cron/{nurture,reverse-matches,sync-swift} routes with the same
// secret — those delegate to the same lib functions.

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/daily] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runAt = new Date().toISOString();
  const out: Record<string, unknown> = { runAt };

  // 1. sync-swift
  try {
    const apiKey = process.env.SMARTSHEET_API_KEY;
    const sheetIdOrToken =
      process.env.SMARTSHEET_SWIFT_SHEET_ID ??
      "8J4Q4hvjx97Wf28G74XcQJ5RjVfwQ5wXv7CxjFM1";
    if (!apiKey) {
      out.syncSwift = { ok: false, error: "SMARTSHEET_API_KEY not set" };
    } else {
      const result = await syncSwiftJobs(db, {
        apiKey,
        sheetIdOrToken,
        apply: true,
      });
      out.syncSwift = {
        ok: true,
        mapped: result.mapped,
        inserted: result.inserted,
        updated: result.updated,
        archived: result.archived,
      };
    }
  } catch (err) {
    console.error("[cron/daily] sync-swift failed:", err);
    out.syncSwift = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. posting-cycles — expire stale URLs, spawn fresh ones for SEO rotation
  try {
    const result = await spawnPostingCycles(db);
    out.postingCycles = { ok: true, ...result };
  } catch (err) {
    console.error("[cron/daily] posting-cycles failed:", err);
    out.postingCycles = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. nurture
  try {
    if (!isGhlConfigured()) {
      out.nurture = { ok: false, error: "GHL not configured" };
    } else {
      const result = await runNurtureSends(db);
      out.nurture = { ok: true, ...result };
    }
  } catch (err) {
    console.error("[cron/daily] nurture failed:", err);
    out.nurture = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. reverse-matches
  try {
    if (!isGhlConfigured()) {
      out.reverseMatches = { ok: false, error: "GHL not configured" };
    } else {
      const result = await runReverseMatches(db);
      out.reverseMatches = { ok: true, ...result };
    }
  } catch (err) {
    console.error("[cron/daily] reverse-matches failed:", err);
    out.reverseMatches = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  console.log("[cron/daily] run:", JSON.stringify(out));
  return NextResponse.json(out);
}
