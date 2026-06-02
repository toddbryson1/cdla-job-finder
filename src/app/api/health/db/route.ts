// GET /api/health/db — public migration-drift probe.
//
// Returns 200 + { ok: true, ... } when prod's __drizzle_migrations
// table is caught up to the codebase's drizzle journal. Returns 503
// + { ok: false, pendingTags, message } when prod is behind. Designed
// to be plug-in to any uptime monitor (UptimeRobot, Better Stack,
// Vercel health checks) so the next migration-drift incident is
// detected within minutes instead of by a 500-error report from a
// real driver.
//
// Public, no auth — the response leaks the expected vs applied counts
// + the names of pending migrations (e.g. "0024_drivers_contact_nullable")
// which is acceptable disclosure: the migration filenames are public
// in the git repo. Nothing about the data lives in the response.

import { NextResponse } from "next/server";
import { checkMigrationHealth } from "@/lib/db/migration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await checkMigrationHealth();
  return NextResponse.json(
    {
      ok: r.ok,
      expected: r.expected,
      applied: r.applied,
      pendingTags: r.pendingTags,
      message: r.message,
    },
    { status: r.ok ? 200 : 503 },
  );
}
