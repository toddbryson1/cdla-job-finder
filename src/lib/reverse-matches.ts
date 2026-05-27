// Reverse-match alert cron logic per
// SPEC_candidate-email-and-reverse-match-alerts-v1.md §3.
// Called by:
//   - /api/cron/reverse-matches/route.ts (manual trigger handler)
//   - /api/cron/daily/route.ts          (scheduled master cron)
// Route handlers do auth + GHL-configured checks; this function does the
// work and returns a summary.

import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import type { db as defaultDb } from "@/db/client";
import {
  driverCarrierMatches,
  driverReverseMatchAlerts,
  drivers,
} from "@/db/schema";
import { appUrl } from "@/lib/stytch/client";
import { GhlError, sendEmail, upsertContact } from "@/lib/ghl/client";
import { reverseMatchEmail } from "@/lib/ghl/reverseMatchEmail";
import { matchDriver } from "@/lib/matching";

type DbClient = typeof defaultDb;

const ALERT_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
const WEEKLY_CAP = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

export interface ReverseMatchRunResult {
  runAt: string;
  eligible: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
}

export async function runReverseMatches(
  db: DbClient,
): Promise<ReverseMatchRunResult> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);

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
      and(
        sql`${drivers.homeLat} IS NOT NULL`,
        sql`${drivers.homeLng} IS NOT NULL`,
      ),
    )
    .limit(BATCH_LIMIT);

  const summary: ReverseMatchRunResult = {
    runAt: now.toISOString(),
    eligible: eligibleDrivers.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    reasons: {},
  };
  const bump = (k: string) => {
    summary.reasons[k] = (summary.reasons[k] ?? 0) + 1;
  };

  for (const driver of eligibleDrivers) {
    const intakeAge = now.getTime() - driver.createdAt.getTime();
    if (intakeAge < ALERT_GRACE_PERIOD_MS) {
      summary.skipped += 1;
      bump("too_new");
      continue;
    }

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
      bump("weekly_cap");
      continue;
    }

    const lastAlertRow = await db
      .select({ sentAt: driverReverseMatchAlerts.sentAt })
      .from(driverReverseMatchAlerts)
      .where(eq(driverReverseMatchAlerts.driverId, driver.id))
      .orderBy(desc(driverReverseMatchAlerts.sentAt))
      .limit(1);
    const lastAlertAt =
      lastAlertRow[0]?.sentAt ??
      new Date(driver.createdAt.getTime() + ALERT_GRACE_PERIOD_MS);

    try {
      await matchDriver(driver.id);
    } catch (err) {
      console.error(
        `[reverse-matches] matchDriver failed for ${driver.id}:`,
        err,
      );
      summary.skipped += 1;
      bump("match_engine_error");
      continue;
    }

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
      bump("no_new_matches");
      continue;
    }

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
      const message = err instanceof GhlError ? err.message : String(err);
      console.error(
        `[reverse-matches] driver ${driver.id} send failed:`,
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
  return summary;
}
