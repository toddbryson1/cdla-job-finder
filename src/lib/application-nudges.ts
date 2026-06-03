// Daily "you haven't applied yet" nudge runner.
//
// Two-nudge sequence per driver, ever:
//   - nudge 1: T + 24h after intake, IF applications = 0 AND matchCount > 0
//   - nudge 2: T + 7 days after intake, IF nudge 1 fired AND still
//              applications = 0 AND matchCount > 0
// A driver who consents to any carrier after intake permanently exits
// the queue — no more nudges, even if their match count grows.
//
// Wired into /api/cron/daily after the reverse-matches step. Uses
// driver_application_nudge_sends (migration 0028) for idempotency:
// UNIQUE(driver_id, nudge_index) means re-runs of the daily cron
// during the same UTC day can't double-send.

import { and, eq, lte, sql } from "drizzle-orm";
import type { db as defaultDb } from "@/db/client";
import {
  driverApplicationNudgeSends,
  driverCarrierApplications,
  drivers,
} from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import { GhlError, sendEmail, upsertContact } from "@/lib/ghl/client";
import { applicationNudgeEmail } from "@/lib/ghl/applicationNudgeEmail";
import { isDriverUnsubscribed } from "@/lib/email/opt-out";
import { appUrl } from "@/lib/stytch/client";

type DbClient = typeof defaultDb;

const NUDGE_1_DELAY_MS = 24 * 60 * 60 * 1000;
const NUDGE_2_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;

export interface ApplicationNudgeRunResult {
  runAt: string;
  eligible: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
}

export async function runApplicationNudges(
  db: DbClient,
): Promise<ApplicationNudgeRunResult> {
  const now = new Date();
  const nudge1Cutoff = new Date(now.getTime() - NUDGE_1_DELAY_MS);
  const nudge2Cutoff = new Date(now.getTime() - NUDGE_2_DELAY_MS);

  // Pull every driver old enough to be eligible for nudge 1. We
  // filter further in code because the SQL would otherwise need a
  // 3-way outer join and a conditional time predicate per nudge
  // index. Driver population stays small (≤ a few thousand for any
  // foreseeable horizon); the in-memory filter is cheap.
  const candidates = await db
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
        lte(drivers.createdAt, nudge1Cutoff),
      ),
    )
    .limit(BATCH_LIMIT);

  const summary: ApplicationNudgeRunResult = {
    runAt: now.toISOString(),
    eligible: candidates.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    reasons: {},
  };
  const bump = (k: string) => {
    summary.reasons[k] = (summary.reasons[k] ?? 0) + 1;
  };

  for (const driver of candidates) {
    // Has the driver already consented to any carrier? If yes,
    // they're permanently off the nudge queue. Even if a future
    // intake update zeroes out their applications somehow, we treat
    // "ever consented" as the line.
    const applicationCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(driverCarrierApplications)
      .where(eq(driverCarrierApplications.driverId, driver.id));
    if ((applicationCount[0]?.n ?? 0) > 0) {
      summary.skipped += 1;
      bump("has_applications");
      continue;
    }

    // Anonymous drivers (no email yet) can't receive email nudges.
    // Skip cleanly; they'll be picked up after they claim identity.
    if (
      !driver.email ||
      !driver.firstName ||
      !driver.lastName ||
      !driver.phone
    ) {
      summary.skipped += 1;
      bump("anonymous_no_contact");
      continue;
    }
    // CAN-SPAM opt-out — a driver who unsubscribed from any prior
    // CDLA.jobs email gets skipped here forever.
    if (await isDriverUnsubscribed(db, driver.id)) {
      summary.skipped += 1;
      bump("unsubscribed");
      continue;
    }

    // Which nudge index applies right now?
    //   - If both nudges already sent: done forever.
    //   - If nudge 1 sent and driver is >= 7d old and nudge 2 hasn't
    //     gone: send nudge 2.
    //   - If neither sent and driver is >= 24h old: send nudge 1.
    const sentRows = await db
      .select({
        nudgeIndex: driverApplicationNudgeSends.nudgeIndex,
        status: driverApplicationNudgeSends.status,
      })
      .from(driverApplicationNudgeSends)
      .where(eq(driverApplicationNudgeSends.driverId, driver.id));
    const sentIndices = new Set(
      sentRows
        .filter((r) => r.status === "sent")
        .map((r) => r.nudgeIndex),
    );

    let nudgeIndex: 1 | 2;
    if (sentIndices.has(1) && sentIndices.has(2)) {
      summary.skipped += 1;
      bump("done_both_nudges");
      continue;
    } else if (sentIndices.has(1) && !sentIndices.has(2)) {
      if (driver.createdAt > nudge2Cutoff) {
        summary.skipped += 1;
        bump("nudge_2_too_soon");
        continue;
      }
      nudgeIndex = 2;
    } else {
      // Neither sent — nudge 1.
      nudgeIndex = 1;
    }

    // Need at least 1 current match to nudge meaningfully. "We
    // matched you with 0 carriers, come check them out" is not a
    // good email.
    let matchCount = 0;
    try {
      const result = await matchDriver(driver.id);
      matchCount = result.matches.length;
    } catch (err) {
      console.error(
        `[application-nudges] matchDriver failed for ${driver.id}:`,
        err,
      );
      summary.skipped += 1;
      bump("match_engine_error");
      continue;
    }
    if (matchCount === 0) {
      summary.skipped += 1;
      bump("zero_matches");
      continue;
    }

    try {
      const contact = await upsertContact({
        email: driver.email,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        source: "cdla.jobs application-nudge",
      });
      const { subject, html } = applicationNudgeEmail({
        firstName: driver.firstName,
        cdlState: driver.cdlState,
        matchCount,
        nudgeIndex,
        appUrl: appUrl(),
        driverId: driver.id,
        recipientEmail: driver.email,
      });
      const result = await sendEmail({
        contactId: contact.contactId,
        subject,
        html,
      });
      await db
        .insert(driverApplicationNudgeSends)
        .values({
          driverId: driver.id,
          nudgeIndex,
          sentAt: new Date(),
          status: "sent",
          ghlMessageId: result.emailMessageId ?? result.messageId ?? null,
          matchCountAtSend: matchCount,
        })
        // UNIQUE(driver_id, nudge_index) protects against a daily-cron
        // double-run during the same UTC day. If a row already exists
        // we skip the insert silently rather than failing the whole
        // batch.
        .onConflictDoNothing({
          target: [
            driverApplicationNudgeSends.driverId,
            driverApplicationNudgeSends.nudgeIndex,
          ],
        });
      summary.sent += 1;
    } catch (err) {
      const message = err instanceof GhlError ? err.message : String(err);
      console.error(
        `[application-nudges] driver ${driver.id} send failed:`,
        message,
      );
      await db
        .insert(driverApplicationNudgeSends)
        .values({
          driverId: driver.id,
          nudgeIndex,
          sentAt: new Date(),
          status: "failed",
          errorMessage: message.slice(0, 500),
          matchCountAtSend: matchCount,
        })
        .onConflictDoNothing({
          target: [
            driverApplicationNudgeSends.driverId,
            driverApplicationNudgeSends.nudgeIndex,
          ],
        });
      summary.failed += 1;
    }
  }

  return summary;
}
