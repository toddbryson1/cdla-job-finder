import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { runContentMachine } from "@/lib/content-machine/run";
import { isGhlConfigured } from "@/lib/ghl/client";
import { runNurtureSends } from "@/lib/nurture-sends";
import { runReverseMatches } from "@/lib/reverse-matches";
import { syncSwiftJobs } from "@/lib/swift-sync";
import { runFullSync as runTaSync } from "@/lib/transport-america/sync";
import { spawnPostingCycles } from "@/lib/posting-cycles";
import { checkMigrationHealth } from "@/lib/db/migration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s = Hobby tier max with fluid compute (default in 2026). The
// content-machine step generates 1–4 articles in parallel via the
// Anthropic API; one Sonnet call can take 20–60s, and we don't want
// the parallel batch to hit the previous 60s ceiling.
export const maxDuration = 300;

// Master daily cron. Vercel Hobby tier caps cron-job count low; one
// scheduled route runs every daily task in sequence. Each operation is
// independent — a failure in one doesn't block the next.
//
// Order matters: sync-swift refreshes carrier_jobs first, so the
// downstream reverse-matches step detects newly-inserted jobs as "new
// matches" for affected drivers. Posting cycles run AFTER sync so new
// jobs get cycles spawned the same day they're added. Content machine
// runs last so a slow/failed article batch never blocks the carrier-data
// refresh that drives the matching engine.
//
//   1. sync-swift      — refresh carrier_jobs from Smartsheet
//   2. sync-ta         — refresh Transport America Dedicated from
//                        Google Sheets (openings + detail workbook).
//                        Opt-in: gated on TA_SYNC_ENABLED=true env var
//                        because the full-tab scan takes ~3 minutes
//                        of the 5-minute maxDuration budget.
//   3. posting-cycles  — expire 20-day-old cycles, spawn repost cycles
//                        + multi-city cycles per job
//   4. nurture         — fire scheduled drip emails
//   5. reverse-matches — alert drivers whose match list grew
//   6. content-machine — generate + publish daily SEO articles
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

  // 0. migration-health — surface any drift between the codebase's
  // drizzle journal and the DB's __drizzle_migrations table. Runs
  // first because if the DB is behind, downstream tasks will likely
  // fail in confusing ways (e.g. inserts hitting NOT NULL constraints
  // for columns the code thinks are nullable). On drift we log the
  // pending tags but do NOT abort — the rest of the daily job may
  // still produce useful work.
  try {
    const health = await checkMigrationHealth();
    out.migrationHealth = {
      ok: health.ok,
      expectedCount: health.expected.count,
      appliedCount: health.applied.count,
      latestExpectedTag: health.expected.latestTag,
      pendingTags: health.pendingTags,
    };
    if (!health.ok) {
      console.error("[cron/daily] " + health.message);
    } else {
      console.log("[cron/daily] " + health.message);
    }
  } catch (err) {
    console.error("[cron/daily] migration-health probe failed:", err);
    out.migrationHealth = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

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

  // 2. sync-ta — Transport America (TA Dedicated) sync.
  // Opt-in via TA_SYNC_ENABLED=true. Reuses the same service-account
  // key as the Indexing API (GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY) for
  // Google Sheets auth. Skips cleanly if either is missing.
  try {
    if (process.env.TA_SYNC_ENABLED !== "true") {
      out.syncTa = { ok: true, skipped: "TA_SYNC_ENABLED != true" };
    } else if (!process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY) {
      out.syncTa = {
        ok: false,
        error: "GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY not set (reused for Sheets auth)",
      };
    } else {
      const result = await runTaSync({ apply: true });
      out.syncTa = {
        ok: true,
        upserted: result.upserted,
        archived: result.archived,
        skipped: result.skipped,
        cdlBExcluded: result.cdlBExcluded,
        complete: result.qualityCounts.complete,
        partial: result.qualityCounts.partial,
        minimal: result.qualityCounts.minimal,
      };
    }
  } catch (err) {
    console.error("[cron/daily] sync-ta failed:", err);
    out.syncTa = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. posting-cycles — expire stale URLs, spawn fresh ones for SEO rotation
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

  // 4. nurture
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

  // 5. reverse-matches
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

  // 6. content-machine — daily SEO article generation. Internally
  // gates on CONTENT_MACHINE_ENABLED (defaults to disabled so a
  // stray deploy doesn't auto-publish). The orchestrator catches
  // its own per-article failures and writes a run-log row + sends
  // its own email, so we only catch catastrophic wrapping errors.
  try {
    const result = await runContentMachine();
    out.contentMachine = {
      ok: true,
      status: result.status,
      requested: result.requestedCount,
      published: result.publishedCount,
      failed: result.failedCount,
      skipped: result.skippedCount,
    };
  } catch (err) {
    console.error("[cron/daily] content-machine failed:", err);
    out.contentMachine = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  console.log("[cron/daily] run:", JSON.stringify(out));
  return NextResponse.json(out);
}
