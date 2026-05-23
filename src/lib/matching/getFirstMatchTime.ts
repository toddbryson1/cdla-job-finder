import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driverCarrierMatches } from "@/db/schema";
import type { GetFirstMatchTime } from "./types";

// Earliest matched_at for (driver, carrier) — drives Tier 1 24-hour
// exclusivity windows. The matches table records every (driver, job)
// pair the first time we surface it, so for a given carrier we just
// want the oldest impression across any of that carrier's jobs.
export const defaultGetFirstMatchTime: GetFirstMatchTime = async (
  driverId,
  carrierId,
) => {
  const row = await db.query.driverCarrierMatches.findFirst({
    where: and(
      eq(driverCarrierMatches.driverId, driverId),
      eq(driverCarrierMatches.carrierId, carrierId),
    ),
    orderBy: [asc(driverCarrierMatches.matchedAt)],
    columns: { matchedAt: true },
  });
  return row?.matchedAt ?? null;
};
