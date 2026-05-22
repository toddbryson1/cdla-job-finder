import type { CandidateRow } from "./hardFilter";
import type { GetFirstMatchTime } from "./types";

const EXCLUSIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ExclusivityResult {
  rows: CandidateRow[];
  /** Map of jobId -> exclusivity window end time, for Tier 1 jobs in their window. */
  windowEndsAt: Map<string, Date>;
}

/**
 * Enforces the 24-hour Tier 1 exclusivity window:
 * 1. For each Tier 1 carrier with `tier_1_billing_status = current`, look up
 *    the first-match time for the (driver, carrier) pair.
 * 2. If we're inside the 24-hour window, the Tier 1 jobs are included and
 *    all non-Tier-1 jobs sharing (equipment, domicile_state) with any of
 *    that Tier 1 carrier's in-window jobs are dropped.
 * 3. After the window expires, all jobs flow through; Tier 1 still wins
 *    via the soft-rank tiebreak elsewhere.
 *
 * Null from getFirstMatchTime means "first match is right now" (per the
 * v2 matching engine spec); the window starts at `now`.
 */
export async function applyTier1Exclusivity(
  driverId: string,
  rows: CandidateRow[],
  getFirstMatchTime: GetFirstMatchTime,
  now: Date,
): Promise<ExclusivityResult> {
  const tier1CarrierIds = new Set<string>();
  for (const r of rows) {
    if (r.carrier_tier === "tier_1" && r.tier_1_billing_status === "current") {
      tier1CarrierIds.add(r.carrier_id);
    }
  }

  if (tier1CarrierIds.size === 0) {
    return { rows, windowEndsAt: new Map() };
  }

  const carrierWindowEnd = new Map<string, Date | null>();
  for (const carrierId of tier1CarrierIds) {
    const firstMatch = await getFirstMatchTime(driverId, carrierId);
    const effectiveStart = firstMatch ?? now;
    const windowEnd = new Date(effectiveStart.getTime() + EXCLUSIVITY_WINDOW_MS);
    carrierWindowEnd.set(carrierId, windowEnd > now ? windowEnd : null);
  }

  const excludedKeys = new Set<string>();
  const jobWindowEndsAt = new Map<string, Date>();

  for (const r of rows) {
    if (r.carrier_tier === "tier_1" && r.tier_1_billing_status === "current") {
      const windowEnd = carrierWindowEnd.get(r.carrier_id) ?? null;
      if (windowEnd && windowEnd > now) {
        excludedKeys.add(`${r.equipment}|${r.domicile_state}`);
        jobWindowEndsAt.set(r.job_id, windowEnd);
      }
    }
  }

  const filtered = rows.filter((r) => {
    const isTier1 =
      r.carrier_tier === "tier_1" && r.tier_1_billing_status === "current";
    if (isTier1) return true;
    return !excludedKeys.has(`${r.equipment}|${r.domicile_state}`);
  });

  return { rows: filtered, windowEndsAt: jobWindowEndsAt };
}
