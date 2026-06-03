// Helpers for driver_carrier_dismissals. Used by:
//   - /api/match enrichment (filter dismissed carriers from the
//     Debbie chat response)
//   - /matches/[driverId] page (filter dismissed from the list)
//   - /me dashboard ("X dismissed carriers" + undismiss link)
//   - pickNextUnappliedMatch (skip dismissed in "Apply to next")
//
// All reads return a Set<carrierId> for cheap O(1) membership
// checks during render. Writes are idempotent (insert
// onConflictDoNothing; delete is a no-op if absent).

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driverCarrierDismissals } from "@/db/schema";

export async function getDismissedCarrierIds(
  driverId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ carrierId: driverCarrierDismissals.carrierId })
    .from(driverCarrierDismissals)
    .where(eq(driverCarrierDismissals.driverId, driverId));
  return new Set(rows.map((r) => r.carrierId));
}

export async function dismissCarrier(
  driverId: string,
  carrierId: string,
): Promise<void> {
  await db
    .insert(driverCarrierDismissals)
    .values({ driverId, carrierId })
    .onConflictDoNothing({
      target: [
        driverCarrierDismissals.driverId,
        driverCarrierDismissals.carrierId,
      ],
    });
}

export async function undismissCarrier(
  driverId: string,
  carrierId: string,
): Promise<void> {
  await db
    .delete(driverCarrierDismissals)
    .where(
      and(
        eq(driverCarrierDismissals.driverId, driverId),
        eq(driverCarrierDismissals.carrierId, carrierId),
      ),
    );
}
