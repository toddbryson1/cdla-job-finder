import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { syncSwiftJobs } from "@/lib/swift-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron: pulls the Class A Recruiting Smartsheet and syncs Swift
// Transportation jobs into carrier_jobs.
// - Open + drivers-needed > 0 rows get inserted/updated by external_source_id.
// - Rows that drop out of the feed (closed, deleted, no drivers needed)
//   get status='archived' so they stop appearing in driver matches.
// - All Smartsheet-sourced Swift rows carry external_source_id, so the
//   archive step never touches the original composite seed.
//
// Auth: same CRON_SECRET pattern as /api/cron/nurture.

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/sync-swift] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.SMARTSHEET_API_KEY;
  const sheetIdOrToken =
    process.env.SMARTSHEET_SWIFT_SHEET_ID ??
    "8J4Q4hvjx97Wf28G74XcQJ5RjVfwQ5wXv7CxjFM1";
  if (!apiKey) {
    console.error("[cron/sync-swift] SMARTSHEET_API_KEY is not set");
    return NextResponse.json(
      { error: "Smartsheet not configured" },
      { status: 500 },
    );
  }

  try {
    const result = await syncSwiftJobs(db, {
      apiKey,
      sheetIdOrToken,
      apply: true,
    });
    console.log("[cron/sync-swift] run:", {
      runAt: new Date().toISOString(),
      mapped: result.mapped,
      inserted: result.inserted,
      updated: result.updated,
      archived: result.archived,
      skipReasons: Object.entries(result.skipped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    });
    return NextResponse.json({
      runAt: new Date().toISOString(),
      mapped: result.mapped,
      inserted: result.inserted,
      updated: result.updated,
      archived: result.archived,
      skipped: result.skipped,
    });
  } catch (err) {
    console.error("[cron/sync-swift] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
