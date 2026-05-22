import type { CandidateRow, DriverProfile } from "./hardFilter";

export interface RankedCandidate {
  row: CandidateRow;
  score: number;
  equipmentOverlap: number;
  regionPreference: number;
  distanceScore: number;
  dataQualityBonus: number;
}

const DATA_QUALITY_BONUS = {
  complete: 1,
  partial: 0.5,
  minimal: 0,
} as const;

const KIND_PRIORITY = {
  partner: 0,
  subscription: 1,
  prospect: 2,
} as const;

export function rankCandidates(
  rows: CandidateRow[],
  driver: DriverProfile & { equipmentRun: string[]; desiredRegions: string[] },
): RankedCandidate[] {
  const equipmentRun = new Set(driver.equipmentRun);
  const desiredRegions = new Set(driver.desiredRegions);

  const ranked: RankedCandidate[] = rows.map((row) => {
    const equipmentOverlap = row.preferred_equipment_experience.reduce(
      (n, eq) => n + (equipmentRun.has(eq) ? 1 : 0),
      0,
    );

    const regionPreference = row.preferred_regions.some((r) => desiredRegions.has(r))
      ? 1
      : 0;

    let distanceScore = 0;
    if (row.hiring_radius_miles == null) {
      distanceScore = 0;
    } else if (row.distance_miles != null) {
      if (row.distance_miles <= 50) distanceScore = 1;
      else if (row.distance_miles <= row.hiring_radius_miles) distanceScore = 0.5;
    }

    const dataQualityBonus = DATA_QUALITY_BONUS[row.data_quality];

    const score =
      equipmentOverlap * 2 + regionPreference + distanceScore + dataQualityBonus;

    return { row, score, equipmentOverlap, regionPreference, distanceScore, dataQualityBonus };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    // Tier 1 (with active billing) before others
    const aTier1 =
      a.row.carrier_tier === "tier_1" && a.row.tier_1_billing_status === "current";
    const bTier1 =
      b.row.carrier_tier === "tier_1" && b.row.tier_1_billing_status === "current";
    if (aTier1 !== bTier1) return aTier1 ? -1 : 1;

    // partner > subscription > prospect
    const aKind = KIND_PRIORITY[a.row.carrier_kind];
    const bKind = KIND_PRIORITY[b.row.carrier_kind];
    if (aKind !== bKind) return aKind - bKind;

    // Most recent last_verified_at first (null treated as oldest)
    const aVer = a.row.last_verified_at ? new Date(a.row.last_verified_at).getTime() : 0;
    const bVer = b.row.last_verified_at ? new Date(b.row.last_verified_at).getTime() : 0;
    if (aVer !== bVer) return bVer - aVer;

    // Stable: job UUID descending
    if (a.row.job_id < b.row.job_id) return 1;
    if (a.row.job_id > b.row.job_id) return -1;
    return 0;
  });

  return ranked;
}
