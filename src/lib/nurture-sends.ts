// Driver nurture cron logic — picks up pending driver_nurture_sends
// rows whose scheduled_for has passed, sends each via GHL, flips status.
// Called by:
//   - /api/cron/nurture/route.ts (manual trigger handler)
//   - /api/cron/daily/route.ts  (the scheduled master cron)
// The route handlers do auth + GHL-configured checks; this function just
// does the work and returns a summary.

import { and, asc, eq, lte } from "drizzle-orm";
import type { db as defaultDb } from "@/db/client";
import { driverNurtureSends, drivers } from "@/db/schema";
import { GhlError, sendEmail, upsertContact } from "@/lib/ghl/client";
import { nurtureEmail } from "@/lib/ghl/nurtureEmails";
import { appUrl } from "@/lib/stytch/client";

type DbClient = typeof defaultDb;

const BATCH_LIMIT = 50;

export interface NurtureRunResult {
  runAt: string;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runNurtureSends(db: DbClient): Promise<NurtureRunResult> {
  const now = new Date();
  const due = await db
    .select({
      sendId: driverNurtureSends.id,
      driverId: driverNurtureSends.driverId,
      emailIndex: driverNurtureSends.emailIndex,
      scheduledFor: driverNurtureSends.scheduledFor,
      driverFirstName: drivers.firstName,
      driverLastName: drivers.lastName,
      driverEmail: drivers.email,
      driverPhone: drivers.phone,
      driverCdlState: drivers.cdlState,
    })
    .from(driverNurtureSends)
    .innerJoin(drivers, eq(drivers.id, driverNurtureSends.driverId))
    .where(
      and(
        eq(driverNurtureSends.status, "pending"),
        lte(driverNurtureSends.scheduledFor, now),
      ),
    )
    .orderBy(asc(driverNurtureSends.scheduledFor))
    .limit(BATCH_LIMIT);

  const summary: NurtureRunResult = {
    runAt: now.toISOString(),
    candidates: due.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of due) {
    if (row.emailIndex < 1 || row.emailIndex > 6) {
      await db
        .update(driverNurtureSends)
        .set({
          status: "skipped",
          skipReason: `invalid_email_index_${row.emailIndex}`,
          sentAt: new Date(),
        })
        .where(eq(driverNurtureSends.id, row.sendId));
      summary.skipped += 1;
      continue;
    }

    // Drivers can complete intake anonymously (email/name/phone all
    // null) — those rows shouldn't have nurture rows scheduled in
    // the first place, but skip defensively if one slips through.
    if (
      !row.driverEmail ||
      !row.driverFirstName ||
      !row.driverLastName ||
      !row.driverPhone
    ) {
      await db
        .update(driverNurtureSends)
        .set({
          status: "skipped",
          skipReason: "anonymous_driver_no_contact",
          sentAt: new Date(),
        })
        .where(eq(driverNurtureSends.id, row.sendId));
      summary.skipped += 1;
      continue;
    }

    try {
      const contact = await upsertContact({
        email: row.driverEmail,
        firstName: row.driverFirstName,
        lastName: row.driverLastName,
        phone: row.driverPhone,
        source: "cdla.jobs nurture",
      });
      const { subject, html } = nurtureEmail({
        firstName: row.driverFirstName,
        cdlState: row.driverCdlState,
        appUrl: appUrl(),
        emailIndex: row.emailIndex as 1 | 2 | 3 | 4 | 5 | 6,
      });
      const result = await sendEmail({
        contactId: contact.contactId,
        subject,
        html,
      });
      await db
        .update(driverNurtureSends)
        .set({
          status: "sent",
          sentAt: new Date(),
          ghlMessageId: result.emailMessageId ?? result.messageId ?? null,
          errorMessage: null,
        })
        .where(eq(driverNurtureSends.id, row.sendId));
      summary.sent += 1;
    } catch (err) {
      const message =
        err instanceof GhlError ? err.message : String(err);
      console.error(
        `[nurture] driver ${row.driverId} email ${row.emailIndex} failed:`,
        message,
      );
      await db
        .update(driverNurtureSends)
        .set({
          status: "failed",
          errorMessage: message.slice(0, 500),
        })
        .where(eq(driverNurtureSends.id, row.sendId));
      summary.failed += 1;
    }
  }
  return summary;
}
