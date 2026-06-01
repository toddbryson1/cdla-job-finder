// Schedule the 6-email driver nurture sequence. Extracted from the
// intake API route so the /apply identity-capture action can also
// schedule a sequence at the moment a driver claims their email
// (anonymous-intake → first apply path).
//
// Idempotent on (driver_id, email_index). On conflict, pending rows
// shift to the new schedule; sent rows are left untouched so the
// driver doesn't get the same email twice.

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { driverNurtureSends } from "@/db/schema";

const NURTURE_OFFSETS_DAYS = [30, 60, 90, 120, 150, 180];

export async function scheduleNurtureSends(
  driverId: string,
  baseDate: Date,
): Promise<void> {
  const values = NURTURE_OFFSETS_DAYS.map((days, i) => {
    const scheduledFor = new Date(baseDate);
    scheduledFor.setUTCDate(scheduledFor.getUTCDate() + days);
    return {
      driverId,
      emailIndex: i + 1,
      scheduledFor,
      status: "pending" as const,
    };
  });

  await db
    .insert(driverNurtureSends)
    .values(values)
    .onConflictDoUpdate({
      target: [driverNurtureSends.driverId, driverNurtureSends.emailIndex],
      // Only touch the schedule for rows still pending. Postgres ON
      // CONFLICT DO UPDATE doesn't support per-row WHERE in this form;
      // we encode the conditional via excluded + CASE on the existing row.
      set: {
        scheduledFor: sql`CASE WHEN ${driverNurtureSends.status} = 'pending' THEN EXCLUDED.scheduled_for ELSE ${driverNurtureSends.scheduledFor} END`,
      },
    });
}
