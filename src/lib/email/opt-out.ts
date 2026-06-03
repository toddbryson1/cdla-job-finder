// Shared "is this driver allowed to receive email" check. Every
// runner that sends outbound email (reverse-matches,
// application-nudges, nurture-sends, candidate-email) must call this
// BEFORE building a payload, so we honor CAN-SPAM opt-outs AND
// CCPA/GDPR deletion uniformly.
//
// Returns true when EITHER:
//   - drivers.unsubscribed_at is non-null (CAN-SPAM opt-out), OR
//   - drivers.deleted_at is non-null (CCPA right-to-delete or GDPR
//     Art. 17 erasure)
//
// Single function rather than two — every caller's behavior is the
// same regardless of which flag is set: skip the send, leave the
// queue row marked. The skip_reason column distinguishes them via
// the `reason` half of the returned tagged value (see
// driverOptOutReason below).
//
// Re-subscription / re-activation is intentionally unsupported in
// v1; deleted is permanent and unsubscribe requires an affirmative
// new action elsewhere.

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
    columns: { unsubscribedAt: true, deletedAt: true },
  });
  if (!row) return false;
  return row.unsubscribedAt != null || row.deletedAt != null;
}

/** More precise variant: returns null when the driver is allowed
 *  to receive email, or a tag string describing which opt-out flag
 *  is set. Useful for the runners' skip_reason bookkeeping so an
 *  operator can tell unsubscribes from deletions on /admin. */
export async function driverOptOutReason(
  db: DbClient,
  driverId: string,
): Promise<"unsubscribed" | "deleted" | null> {
  const row = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
    columns: { unsubscribedAt: true, deletedAt: true },
  });
  if (!row) return null;
  // Deletion supersedes unsubscribe — if both are set, "deleted"
  // is the operator-meaningful reason.
  if (row.deletedAt != null) return "deleted";
  if (row.unsubscribedAt != null) return "unsubscribed";
  return null;
}
