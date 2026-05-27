import { NextResponse } from "next/server";
import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  driverCarrierMatches,
  driverReverseMatchAlerts,
  drivers,
} from "@/db/schema";
import { appUrl } from "@/lib/stytch/client";
import {
  GhlError,
  isGhlConfigured,
  sendEmail,
  upsertContact,
} from "@/lib/ghl/client";
import { reverseMatchEmail } from "@/lib/ghl/reverseMatchEmail";
import { matchDriver } from "@/lib/matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron: finds drivers whose match list has grown since their last
// reverse-match alert and sends them an aggregated alert.
//
// Algorithm per spec §3:
//   1. Walk every driver with a verifiable home location (lat/lng).
//   2. Re-run matchDriver to update driver_carrier_matches impressions —
//      ON CONFLICT DO NOTHING preserves the original matched_at, so a
//      fresh impression only inserts for jobs we haven't shown before.
//   3. Count driver_carrier_matches rows where matched_at is newer than
//      the driver's most recent alert (or, if never alerted, newer than
//      24h after intake — gives the candidate email + nurture room).
//   4. If new_matches >= 1 AND weekly cap allows (max 3 alerts in
//      rolling 7-day window) AND GHL contact isn't unsubscribed → send.
//
// Send-time aggregation: one alert per cron run captures every new match
// detected since the last send. The 24-hour aggregation window is
// naturally implemented because the cron runs once daily.

const ALERT_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 1 day after intake
const WEEKLY_CAP = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100; // safety cap per run

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
    console.error("[cron/reverse-matches] GHL is not configured");
    return NextResponse.json(
      { error: "GHL not configured" },
      { status: 500 },
    );
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  // Only consider drivers with the geocoded home location matchDriver
  // needs. New drivers without lat/lng get skipped silently — the
  // candidate email handles their post-intake state.
  const eligibleDrivers = await db
    .select({
      id: drivers.id,
      firstName: drivers.firstName,
      lastName: drivers.lastName,
      email: drivers.email,
      phone: drivers.phone,
      cdlState: drivers.cdlState,
      createdAt: drivers.createdAt,
    })
    .from(drivers)
    .where(
      and(sql`${drivers.homeLat} IS NOT NULL`, sql`${drivers.homeLng} IS NOT NULL`),
    )
    .limit(BATCH_LIMIT);

  const summary = {
    runAt: now.toISOString(),
    eligible: eligibleDrivers.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    reasons: {} as Record<string, number>,
  };

  for (const driver of eligibleDrivers) {
    // Skip if intake too recent — let candidate email + nurture do their
    // job first. (Spec doesn't explicitly require this, but firing a
    // reverse-match alert within hours of intake confuses the driver.)
    const intakeAge = now.getTime() - driver.createdAt.getTime();
    if (intakeAge < ALERT_GRACE_PERIOD_MS) {
      summary.skipped += 1;
      summary.reasons.too_new = (summary.reasons.too_new ?? 0) + 1;
      continue;
    }

    // Weekly cap: count alerts already sent in the rolling 7-day window.
    const recentAlerts = await db
      .select({ sentAt: driverReverseMatchAlerts.sentAt })
      .from(driverReverseMatchAlerts)
      .where(
        and(
          eq(driverReverseMatchAlerts.driverId, driver.id),
          eq(driverReverseMatchAlerts.status, "sent"),
          gte(driverReverseMatchAlerts.sentAt, weekAgo),
        ),
      );
    if (recentAlerts.length >= WEEKLY_CAP) {
      summary.skipped += 1;
      summary.reasons.weekly_cap = (summary.reasons.weekly_cap ?? 0) + 1;
      continue;
    }

    // Find the most recent alert (sent or otherwise) — anything in
    // driver_carrier_matches newer than this is "new" for the alert.
    // If never alerted, fall back to intake_date + grace period.
    const lastAlertRow = await db
      .select({ sentAt: driverReverseMatchAlerts.sentAt })
      .from(driverReverseMatchAlerts)
      .where(eq(driverReverseMatchAlerts.driverId, driver.id))
      .orderBy(desc(driverReverseMatchAlerts.sentAt))
      .limit(1);
    const lastAlertAt =
      lastAlertRow[0]?.sentAt ??
      new Date(driver.createdAt.getTime() + ALERT_GRACE_PERIOD_MS);

    // Refresh impressions (matchDriver inserts ON CONFLICT DO NOTHING).
    try {
      await matchDriver(driver.id);
    } catch (err) {
      // Driver might not match anything currently — that's fine, no
      // alert. Or matching engine errored — log and move on.
      console.error(
        `[cron/reverse-matches] matchDriver failed for ${driver.id}:`,
        err,
      );
      summary.skipped += 1;
      summary.reasons.match_engine_error =
        (summary.reasons.match_engine_error ?? 0) + 1;
      continue;
    }

    // Count "new since last alert" impressions.
    const newRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(driverCarrierMatches)
      .where(
        and(
          eq(driverCarrierMatches.driverId, driver.id),
          gt(driverCarrierMatches.matchedAt, lastAlertAt),
        ),
      );
    const newMatchCount = newRows[0]?.count ?? 0;
    if (newMatchCount < 1) {
      summary.skipped += 1;
      summary.reasons.no_new_matches =
        (summary.reasons.no_new_matches ?? 0) + 1;
      continue;
    }

    // Send via GHL. Best-effort: upsert contact, send email, record row.
    try {
      const contact = await upsertContact({
        email: driver.email,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        source: "cdla.jobs reverse-match",
      });

      const { subject, html } = reverseMatchEmail({
        firstName: driver.firstName,
        cdlState: driver.cdlState,
        newMatchCount,
        appUrl: appUrl(),
      });

      const result = await sendEmail({
        contactId: contact.contactId,
        subject,
        html,
      });

      await db.insert(driverReverseMatchAlerts).values({
        driverId: driver.id,
        sentAt: new Date(),
        newMatchCount,
        status: "sent",
        ghlMessageId: result.emailMessageId ?? result.messageId ?? null,
      });
      summary.sent += 1;
    } catch (err) {
      const message =
        err instanceof GhlError ? err.message : String(err);
      console.error(
        `[cron/reverse-matches] driver ${driver.id} send failed:`,
        message,
      );
      await db.insert(driverReverseMatchAlerts).values({
        driverId: driver.id,
        sentAt: new Date(),
        newMatchCount,
        status: "failed",
        errorMessage: message.slice(0, 500),
      });
      summary.failed += 1;
    }
  }

  console.log("[cron/reverse-matches] run summary:", summary);
  return NextResponse.json(summary);
}
