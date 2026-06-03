// POST /api/me/touched — bumps the driver's last_seen_at timestamp.
//
// Called from a tiny client beacon on /me AFTER the page renders so
// the dashboard's "new since your last visit" badges compare against
// the value at PAGE-LOAD time, not the value as of this very call.
// previous_seen_at gets the old last_seen_at value so /me can render
// "since {date}" wording on the NEXT visit.
//
// Auth mirrors the /me page itself: cookie-bearing anonymous driver
// OR Stytch-signed-in email driver. Returns 401 to anyone else; the
// beacon ignores the response either way.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { getSessionState } from "@/lib/stytch/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST() {
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;

  let driverId: string | null = null;

  if (cookieDriverId && UUID_RE.test(cookieDriverId)) {
    // Trust the cookie value if a matching row exists. Stale cookie
    // (driver row deleted) falls through to the session check.
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.id, cookieDriverId),
      columns: { id: true },
    });
    if (row) driverId = row.id;
  }

  if (!driverId) {
    const session = await getSessionState();
    if (session.kind !== "ok") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const row = await db.query.drivers.findFirst({
      where: eq(drivers.email, session.email),
      columns: { id: true },
    });
    if (!row) {
      return NextResponse.json({ ok: false, error: "No driver row" }, { status: 404 });
    }
    driverId = row.id;
  }

  // Atomic shift: previous_seen_at <- last_seen_at, last_seen_at <- now().
  // Single UPDATE so we don't have to read-modify-write under
  // concurrent /me loads from the same driver (two tabs, etc.).
  await db
    .update(drivers)
    .set({
      previousSeenAt: sql`${drivers.lastSeenAt}`,
      lastSeenAt: new Date(),
    })
    .where(eq(drivers.id, driverId));

  return NextResponse.json({ ok: true });
}
