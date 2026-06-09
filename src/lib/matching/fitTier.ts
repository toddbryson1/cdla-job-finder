// Carrier fit-tier scoring (advisor mode).
//
// A carrier can be a MATCH and still be the wrong CALL for a given
// driver. The fit-tier profile (stored on carriers.fit_tier_profile,
// migration 0034) lets the ranker express that: a carrier that's a great
// on-ramp for a 6-month driver fades for a 3-year driver who can command
// better-paying lanes. This module turns that profile + the driver into
// a bounded score adjustment and a human-readable reason.
//
// THE HARD RULE (SPEC_debbie-advisor-mode-v2.md "Fit tiers"): the engine
// NEVER fabricates a boundary. A null profile — or a profile missing a
// given sub-field — contributes ZERO for that aspect (neutral). Tiers
// come from the carrier's data, set by ops, or they don't exist.

export interface FitTierExperience {
  /** Lower edge of the carrier's strong-fit experience band, in months. */
  strongMinMonths?: number;
  /** Upper edge of the strong-fit band, in months. */
  strongMaxMonths?: number;
  /**
   * Past this many months the carrier becomes a WEAKER fit — a seasoned
   * driver can do better elsewhere. Drives the neutral demotion.
   */
  fadesAfterMonths?: number;
}

export interface FitTierWants {
  /**
   * The dimension this carrier is genuinely strong on. A big carrier
   * with reliable home time at lower pay sets favors: 'home_time'. Used
   * to reward the carrier for drivers who rank that dimension first.
   */
  favors?: "home_time" | "pay" | null;
}

export interface FitTierProfile {
  experience?: FitTierExperience;
  wants?: FitTierWants;
}

export interface FitTierResult {
  /** Bounded score adjustment. Positive = stronger fit, negative = weaker. */
  score: number;
  /** Neutral, factual reasons for the adjustment (never disparaging). */
  reasons: string[];
}

const NEUTRAL: FitTierResult = { score: 0, reasons: [] };

// Score magnitudes. Kept modest so fit-tier can break a tie between two
// genuinely-comparable carriers (the England case) without swamping the
// equipment/region fundamentals that decide whether a carrier fits at all.
const STRONG_FIT = 1.5;
const FADED_FIT = -1.0;
const WANTS_MATCH = 0.5;

/**
 * Parse a raw jsonb value into a FitTierProfile, or null if it's absent
 * or malformed. A malformed profile is treated as NO profile (neutral) —
 * we never guess at a boundary we can't read cleanly.
 */
export function parseFitTierProfile(raw: unknown): FitTierProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const profile: FitTierProfile = {};

  if (obj.experience && typeof obj.experience === "object") {
    const e = obj.experience as Record<string, unknown>;
    const exp: FitTierExperience = {};
    if (typeof e.strongMinMonths === "number") exp.strongMinMonths = e.strongMinMonths;
    if (typeof e.strongMaxMonths === "number") exp.strongMaxMonths = e.strongMaxMonths;
    if (typeof e.fadesAfterMonths === "number") exp.fadesAfterMonths = e.fadesAfterMonths;
    if (Object.keys(exp).length > 0) profile.experience = exp;
  }

  if (obj.wants && typeof obj.wants === "object") {
    const w = obj.wants as Record<string, unknown>;
    if (w.favors === "home_time" || w.favors === "pay") {
      profile.wants = { favors: w.favors };
    }
  }

  return Object.keys(profile).length > 0 ? profile : null;
}

/**
 * Score how well a carrier's fit-tier profile suits this driver.
 *
 * @param profile         parsed carrier profile, or null (→ neutral)
 * @param experienceMonths driver's current experience in months
 * @param topPriority     the driver's #1 stated priority, or null
 */
export function fitTierScore(
  profile: FitTierProfile | null,
  experienceMonths: number,
  topPriority: string | null,
): FitTierResult {
  if (!profile) return NEUTRAL;

  let score = 0;
  const reasons: string[] = [];

  const exp = profile.experience;
  if (exp) {
    const { strongMinMonths, strongMaxMonths, fadesAfterMonths } = exp;
    const inStrongBand =
      strongMinMonths != null &&
      strongMaxMonths != null &&
      experienceMonths >= strongMinMonths &&
      experienceMonths <= strongMaxMonths;

    // "Faded" only when we actually have a fadesAfter boundary AND the
    // driver is past it. No boundary set → never assert one.
    const faded =
      fadesAfterMonths != null && experienceMonths > fadesAfterMonths;

    if (inStrongBand) {
      score += STRONG_FIT;
      reasons.push("a strong on-ramp at your experience level");
    } else if (faded) {
      score += FADED_FIT;
      // Neutral, factual — a statement about FIT, not a knock on the
      // carrier. The same carrier is exactly right for a newer driver.
      reasons.push(
        "ranked lower because at your experience these other lanes pay more for the same work",
      );
    }
  }

  if (profile.wants?.favors && topPriority && profile.wants.favors === topPriority) {
    score += WANTS_MATCH;
    reasons.push(
      topPriority === "home_time"
        ? "strong, reliable home time — which you ranked first"
        : "strong pay for the lane — which you ranked first",
    );
  }

  return { score, reasons };
}
