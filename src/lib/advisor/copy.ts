// Advisor guardrail copy — the single source of truth for the phrasing
// rules the attorney brief and brand voice require. Centralized so the
// rules are enforced once and pinned by tests, instead of scattered
// across chat + page surfaces where one careless string could break a
// compliance guarantee.
//
// Rules (SPEC_debbie-advisor-mode-v2.md "Honesty rules"):
//   - Never state a pay number as a guarantee. Ranges + "approximately"
//     + "confirm with the carrier."
//   - Never predict a hire ("you're a lock", "they'll love you").
//   - Never use adverse-action "rejected/disqualified" language about the
//     person — frame as "this carrier's rules don't fit your situation."

// Words/phrases that must never appear in advisor-generated copy. Pinned
// by copy.test.ts against every exported phrase builder here.
export const BANNED_PHRASES = [
  "guaranteed",
  "guarantee",
  "you're a lock",
  "you are a lock",
  "they'll love you",
  "they will love you",
  "rejected",
  "disqualified",
  "you don't qualify",
  "you do not qualify",
];

/**
 * Render a weekly pay figure the compliant way: always a non-guaranteed
 * approximation the driver is told to confirm. Returns honest "not posted"
 * copy when the carrier didn't disclose pay.
 */
export function payPhrase(
  minWeekly: number | null,
  maxWeekly: number | null,
): string {
  if (minWeekly == null && maxWeekly == null) {
    return "Pay isn't posted for this one — ask what it really runs on your first call.";
  }
  const range =
    minWeekly != null && maxWeekly != null && minWeekly !== maxWeekly
      ? `$${minWeekly.toLocaleString()}–$${maxWeekly.toLocaleString()}/week`
      : `$${(maxWeekly ?? minWeekly)!.toLocaleString()}/week`;
  return `Approximately ${range} — confirm the real number with the carrier; posted pay is an "up to" figure that depends on miles and performance.`;
}

/**
 * Frame a carrier the driver doesn't currently fit. NEVER "rejected" —
 * it's about whether the carrier's rules fit, not a judgment of the driver.
 */
export function rulesDontFit(carrierName: string): string {
  return `${carrierName}'s rules don't fit your situation right now — that's about their requirements, not you.`;
}

/**
 * The honest framing for "you meet the stated requirements" WITHOUT
 * predicting a hire — hiring is always the carrier's call.
 */
export function meetsRequirements(carrierName: string): string {
  return `You meet ${carrierName}'s stated requirements on paper — the hiring call is theirs, but you're a real candidate here.`;
}

/** Standard caveat block for outside (non-partner, web-sourced) jobs. */
export const OUTSIDE_JOB_CAVEAT =
  "Not a CDLA.jobs carrier — we can't verify the posting is still open or that they'd approve you, and the pay is an unverified \"up to\" figure. You'd apply directly; your CDLA.jobs profile isn't shared.";
