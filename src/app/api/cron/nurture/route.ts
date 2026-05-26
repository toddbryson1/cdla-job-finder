import { NextResponse } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { driverNurtureSends, drivers } from "@/db/schema";
import { appUrl } from "@/lib/stytch/client";
import {
  GhlError,
  isGhlConfigured,
  sendEmail,
  upsertContact,
} from "@/lib/ghl/client";
import { nurtureEmail } from "@/lib/ghl/nurtureEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds; Vercel default for Hobby plan

// Daily Vercel cron handler. Picks up rows in driver_nurture_sends where
// status='pending' AND scheduled_for <= now(), sends via GHL, and flips
// status to 'sent' (or 'skipped' / 'failed').
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
// We refuse anything else to prevent random POSTs from triggering sends.
// In development you can hit this endpoint manually by setting CRON_SECRET
// in .env.local and including the header.

const BATCH_LIMIT = 50; // per-run cap to stay under serverless timeout

export async function GET(request: Request) {
  // Verify the cron secret. Vercel sets this header on scheduled invocations.
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/nurture] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGhlConfigured()) {
    console.error("[cron/nurture] GHL is not configured");
    return NextResponse.json(
      { error: "GHL not configured" },
      { status: 500 },
    );
  }

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

  const summary = {
    runAt: now.toISOString(),
    candidates: due.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of due) {
    if (row.emailIndex < 1 || row.emailIndex > 6) {
      await markSkipped(row.sendId, `invalid_email_index_${row.emailIndex}`);
      summary.skipped += 1;
      continue;
    }

    try {
      // Upsert contact (gets us a fresh contactId and ensures the GHL
      // contact still exists). This is also where unsubscribe state
      // would surface — the GHL contact's DnD or unsubscribed-all tag
      // would normally short-circuit here. For v1 we trust GHL's own
      // unsubscribe handling on the message-send side.
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
          ghlMessageId:
            result.emailMessageId ?? result.messageId ?? null,
          errorMessage: null,
        })
        .where(eq(driverNurtureSends.id, row.sendId));
      summary.sent += 1;
    } catch (err) {
      const message =
        err instanceof GhlError ? err.message : String(err);
      console.error(
        `[cron/nurture] driver ${row.driverId} email ${row.emailIndex} failed:`,
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

  console.log("[cron/nurture] run summary:", summary);
  return NextResponse.json(summary);
}

async function markSkipped(sendId: string, reason: string): Promise<void> {
  await db
    .update(driverNurtureSends)
    .set({
      status: "skipped",
      skipReason: reason,
      sentAt: new Date(),
    })
    .where(eq(driverNurtureSends.id, sendId));
}
