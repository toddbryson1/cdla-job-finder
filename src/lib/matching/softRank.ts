import type { CandidateRow, DriverProfile } from "./hardFilter";
import { fitTierScore, parseFitTierProfile } from "./fitTier";

export interface RankedCandidate {
  row: CandidateRow;
  score: number;
  equipmentOverlap: number;
  regionPreference: number;
  distanceScore: number;
  dataQualityBonus: number;
  /** Fit-tier adjustment (0 when the carrier has no profile). */
  fitTierAdjustment: number;
  /**
   * Neutral, driver-facing reasons for this match's placement (e.g.
   * "pays above your floor", "home weekly — you ranked that first").
   * Empty in neutral mode. Surfaced by the advisor presentation layer.
   */
  reasons: string[];
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

// How much more home time a schedule represents — a home-time-first
// driver should see home-daily rank above home-weekly above OTR.
const HOME_TIME_LEVEL: Record<string, number> = {
  daily: 1,
  weekly: 0.8,
  biweekly: 0.6,
  otr: 0.3,
};

// Weight applied to the component matching the driver's #1, #2, #3, #4
// stated priority. The keystone (#1) dominates; anything they didn't
// rank gets a small residual so it still breaks ties sensibly.
const PRIORITY_WEIGHTS = [3, 2, 1, 0.5];
const UNRANKED_WEIGHT = 0.25;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function payFitScore(row: CandidateRow, payFloor: number | null | undefined): number {
  const payMax =
    row.display_pay_range_max_weekly_usd ?? row.pay_range_max_weekly_usd ?? null;
  if (payMax == null) return 0.5; // unknown pay → neutral, never a guess
  if (payFloor && payFloor > 0) {
    // Reaches 1.0 at ~25% above the driver's stated floor.
    return clamp01(payMax / (payFloor * 1.25));
  }
  return clamp01(payMax / 2000); // absolute fallback: ~$2k/wk reads as strong
}

function homeTimeFitScore(row: CandidateRow, driverHomeTime: string[]): number {
  const driverWants = new Set(driverHomeTime);
  let best = 0;
  for (const t of row.accepted_home_time_types) {
    if (driverWants.has(t)) best = Math.max(best, HOME_TIME_LEVEL[t] ?? 0);
  }
  return best;
}

function careerGoalNudge(
  row: CandidateRow,
  goalType: string | null | undefined,
  goalDetail: string | null | undefined,
): { score: number; reason: string | null } {
  // Only the equipment-trajectory goal has a data signal today: favor
  // jobs that pull the equipment the driver is working toward. Other
  // goals (pay, home time) are already expressed through priority_ranking.
  if (goalType === "different_equipment" && goalDetail) {
    const want = goalDetail.trim().toLowerCase();
    if (want && row.equipment.toLowerCase().includes(want)) {
      return { score: 0.5, reason: `builds toward the ${goalDetail.trim()} work you want` };
    }
  }
  return { score: 0, reason: null };
}

export function rankCandidates(
  rows: CandidateRow[],
  driver: DriverProfile & { equipmentRun: string[]; desiredRegions: string[] },
): RankedCandidate[] {
  const equipmentRun = new Set(driver.equipmentRun);
  const desiredRegions = new Set(driver.desiredRegions);

  // Advisor mode kicks in only when the driver gave us a priority
  // ranking. Without it the formula below reduces EXACTLY to the
  // pre-advisor neutral score, so existing behavior is untouched.
  const priorityRanking = driver.priorityRanking ?? null;
  const advisorMode = Array.isArray(priorityRanking) && priorityRanking.length > 0;
  const topPriority = advisorMode ? priorityRanking![0] : null;

  // Map each priority token → the weight earned by its rank position.
  const priorityWeight = (token: string): number => {
    if (!advisorMode) return 0;
    const idx = priorityRanking!.indexOf(token);
    if (idx === -1) return UNRANKED_WEIGHT;
    return PRIORITY_WEIGHTS[idx] ?? UNRANKED_WEIGHT;
  };

  // First pass — compute the per-row primitives every mode needs.
  interface Primitives {
    row: CandidateRow;
    equipmentOverlap: number;
    regionPreference: number;
    distanceScore: number;
    dataQualityBonus: number;
    fitTier: { score: number; reasons: string[] };
    goal: { score: number; reason: string | null };
    // Advisor-mode raw signals.
    payMaxAbs: number | null; // absolute weekly pay, for cross-candidate ranking
    payFloorRel: number; // floor-relative pay fit, for the human reason
    homeRaw: number; // best home-time level the job offers this driver
  }

  const prims: Primitives[] = rows.map((row) => {
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

    // Fit-tier adjustment — null profile contributes 0 (neutral). This is
    // what flips a fading-fit carrier (England for a 3-year driver) down
    // and lifts it for the driver it genuinely fits.
    const fitTier = fitTierScore(
      parseFitTierProfile(row.carrier_fit_tier_profile),
      driver.experienceMonths,
      topPriority,
    );
    const goal = careerGoalNudge(row, driver.careerGoalType, driver.careerGoalDetail);

    return {
      row,
      equipmentOverlap,
      regionPreference,
      distanceScore,
      dataQualityBonus,
      fitTier,
      goal,
      payMaxAbs:
        row.display_pay_range_max_weekly_usd ?? row.pay_range_max_weekly_usd ?? null,
      payFloorRel: payFitScore(row, driver.payFloorMinWeeklyUsd),
      homeRaw: homeTimeFitScore(row, driver.homeTime),
    };
  });

  // For advisor mode, normalize each "wants" dimension to [0,1] ACROSS the
  // candidate set (min-max). Normalization is what makes the driver's #1
  // priority decisive when two carriers trade dimensions off (Swift's home
  // time vs. a specialist's pay): whichever carrier leads the #1 dimension
  // wins, because that dimension carries the heaviest weight. A dimension
  // with no spread (all equal) contributes 0.5 to everyone (neutral).
  const normalizer = (values: Array<number | null>) => {
    const present = values.filter((v): v is number => v != null);
    if (present.length === 0) return () => 0.5;
    const min = Math.min(...present);
    const max = Math.max(...present);
    if (max === min) return () => 0.5;
    return (v: number | null) => (v == null ? 0.5 : (v - min) / (max - min));
  };
  const normPay = normalizer(prims.map((p) => p.payMaxAbs));
  const normHome = normalizer(prims.map((p) => p.homeRaw));
  const normDist = normalizer(prims.map((p) => p.distanceScore));
  const normEase = normalizer(prims.map((p) => p.dataQualityBonus));

  const ranked: RankedCandidate[] = prims.map((p) => {
    const { row, equipmentOverlap, regionPreference, distanceScore, dataQualityBonus } =
      p;
    const reasons: string[] = [];
    let score: number;

    // Fit-tier reasons are meaningful in BOTH modes (the England demotion
    // reason must show even for a driver who didn't rank priorities).
    reasons.push(...p.fitTier.reasons);

    if (!advisorMode) {
      // NEUTRAL MODE — identical to the pre-advisor engine, plus the
      // fit-tier/career terms which are 0 without carrier/driver data.
      score =
        equipmentOverlap * 2 +
        regionPreference +
        distanceScore +
        dataQualityBonus +
        p.fitTier.score +
        p.goal.score;
    } else {
      // ADVISOR MODE — fundamentals (equipment/region fit + fit-tier)
      // plus the driver's wants, normalized and weighted by their rank.
      const weighted =
        priorityWeight("pay") * normPay(p.payMaxAbs) +
        priorityWeight("home_time") * normHome(p.homeRaw) +
        priorityWeight("proximity") * normDist(p.distanceScore) +
        priorityWeight("ease_of_hire") * normEase(p.dataQualityBonus);

      score =
        equipmentOverlap * 2 +
        regionPreference +
        p.fitTier.score +
        p.goal.score +
        weighted;

      // Reasons use the RAW signals (floor-relative pay, home-time level)
      // so they read truthfully to the driver, not the normalized rank.
      const top2 = new Set(priorityRanking!.slice(0, 2));
      if (top2.has("pay") && p.payFloorRel >= 0.75) reasons.push("pays above your floor");
      if (top2.has("home_time") && p.homeRaw >= 0.8) {
        reasons.push("strong home time — which you ranked high");
      } else if (top2.has("home_time") && p.homeRaw >= 0.6) {
        reasons.push("home time that fits what you want");
      }
      if (top2.has("proximity") && distanceScore >= 1) reasons.push("close to home");
    }

    if (p.goal.reason) reasons.push(p.goal.reason);

    return {
      row,
      score,
      equipmentOverlap,
      regionPreference,
      distanceScore,
      dataQualityBonus,
      fitTierAdjustment: p.fitTier.score,
      // De-dup while preserving order, cap at 3 so cards stay scannable.
      reasons: [...new Set(reasons)].slice(0, 3),
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    // Tier 1 (with active billing) before others
    const aTier1 =
      a.row.carrier_tier === "tier_1" && a.row.tier_1_billing_status === "current";
    const bTier1 =
      b.row.carrier_tier === "tier_1" && b.row.tier_1_billing_status === "current";
    if (aTier1 !== bTier1) return aTier1 ? -1 : 1;

    // partner > subscription > prospect — SPONSORSHIP IS A TIEBREAK ONLY.
    // Because this only fires when scores are equal, a partner can never
    // outrank a genuinely better-fitting carrier; it only wins among
    // equals. (Pinned by softRank.test.ts.)
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
