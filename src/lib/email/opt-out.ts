// Shared "is this driver allowed to receive email" check. Every
// runner that sends outbound email (reverse-matches,
// application-nudges, nurture-sends, candidate-email) must call this
// BEFORE building a payload, so we honor CAN-SPAM opt-outs uniformly.
//
// Returns true when drivers.unsubscribed_at is non-null. Re-
// subscription is intentionally not supported in v1; a driver who
// changes their mind can hit /login + ask Debbie to flip them back.

import { eq } from "drizzle-orm";
import type { db as defaultDb } from "@/db/client";
import { drivers } from "@/db/schema";

type DbClient = typeof defaultDb;

export async function isDriverUnsubscribed(
  db: DbClient,
  driverId: string,
): Promise<boolean> {
  const row = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
    columns: { unsubscribedAt: true },
  });
  return row?.unsubscribedAt != null;
}
