// Pick the next un-applied match for a driver — the "Apply to next
// match" button on the Stage 2 result page. The button shows up on
// both the Qualified and NotQualified result paths so the driver can
// keep moving through the funnel without bouncing back to /matches
// every time.
//
// Heuristic: run matchDriver (same engine the matches page uses),
// drop the current jobId + any jobs the driver has already
// consented through (driverCarrierApplications), return the top
// remaining ranked Match. Null if nothing's left.
//
// Why call the engine instead of a SQL query: we want the same
// ranking + filtering rules the driver saw on /matches. Reproducing
// that in raw SQL would drift. The cost is one matching pass per
// post-result page render; cheap enough.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driverCarrierApplications } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import type { Match } from "@/lib/matching/types";
import { getDismissedCarrierIds } from "@/lib/dismissals";

export interface NextMatchSuggestion {
  jobId: string;
  carrierName: string;
  positionTitle: string;
  domicileCity: string;
  domicileState: string;
}

/**
 * Filter a ranked Match[] down to the next un-applied entry.
 *
 * Pure helper — takes already-loaded inputs so it can be unit-tested
 * without hitting the matching engine or the DB.
 */
export function pickNextFromMatches(
  matches: Match[],
  currentJobId: string,
  appliedJobIds: Set<string>,
): NextMatchSuggestion | null {
  for (const m of matches) {
    if (m.jobId === currentJobId) continue;
    if (appliedJobIds.has(m.jobId)) continue;
    return {
      jobId: m.jobId,
      carrierName: m.carrierName,
      positionTitle: m.positionTitle,
      domicileCity: m.domicileCity,
      domicileState: m.domicileState,
    };
  }
  return null;
}

/**
 * Full-fat: run matching for the driver, look up their application
 * history, return the next suggestion. Used directly by the apply
 * page's ResultScreen.
 *
 * "Applied" = a driverCarrierApplications row exists (i.e. the
 * driver got past Stage 2 consent for that carrier_job). A row at
 * NotQualified still counts as applied — we don't want to send the
 * driver back to a carrier they already tried, even if it was a
 * disqualification.
 */
export async function pickNextUnappliedMatch(
  driverId: string,
  currentJobId: string,
): Promise<NextMatchSuggestion | null> {
  const [matchResult, applications, dismissedCarriers] = await Promise.all([
    matchDriver(driverId),
    db
      .select({ jobId: driverCarrierApplications.jobId })
      .from(driverCarrierApplications)
      .where(eq(driverCarrierApplications.driverId, driverId)),
    getDismissedCarrierIds(driverId),
  ]);

  const appliedJobIds = new Set(applications.map((a) => a.jobId));
  // Drop dismissed carriers' jobs from the pool BEFORE picking. The
  // engine still considers them; we just don't suggest them next.
  const candidatePool = matchResult.matches.filter(
    (m) => !dismissedCarriers.has(m.carrierId),
  );
  return pickNextFromMatches(candidatePool, currentJobId, appliedJobIds);
}
