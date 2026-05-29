// Persist one row per (driver, external_job) that was rendered on the
// matches page. Mirrors the driver_carrier_matches write in
// matchDriver.ts. ON CONFLICT DO NOTHING preserves the original
// shown_at for repeat views.

import { db as defaultDb } from "@/db/client";
import { driverExternalJobImpressions } from "@/db/schema";
import type { ExternalMatch } from "./types";

export async function recordExternalImpressions(
  driverId: string,
  matches: ExternalMatch[],
  database: typeof defaultDb = defaultDb,
): Promise<void> {
  if (matches.length === 0) return;
  try {
    await database
      .insert(driverExternalJobImpressions)
      .values(
        matches.map((m) => ({
          driverId,
          externalJobId: m.externalJobId,
        })),
      )
      .onConflictDoNothing({
        target: [
          driverExternalJobImpressions.driverId,
          driverExternalJobImpressions.externalJobId,
        ],
      });
  } catch (err) {
    console.error(
      "[external-jobs] impression tracking write failed:",
      err,
    );
  }
}
