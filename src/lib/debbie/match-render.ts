// Pure helpers for the post-consent match render inside the homepage
// Debbie chat. Per SPEC_conversational-ai-intake-v1.md §4.5:
//   - matches render in the chat as carrier cards within 2 seconds
//   - Debbie's one-line preamble: "Here's what I found — [X] carriers
//     hiring drivers like you in [region]."
//   - If matching takes longer than 5 seconds, Debbie shifts to the
//     async fallback message
//   - Zero matches case is honest, not pivoting to false hope
//
// All exports here are dependency-free (no fetch, no React) so they
// can be unit-tested without mocking the network or the DOM.

/** How long Debbie waits before shifting to the async fallback copy. */
export const ASYNC_FALLBACK_TIMEOUT_MS = 5000;

/**
 * Slim, client-side view of a match. The matching engine's full Match
 * type has 19 fields; the chat surface only needs a handful. Mapping
 * to this shape happens at the fetch boundary so we don't drag the
 * carrier rules database types into the client bundle.
 */
export interface DebbieMatchView {
  jobId: string;
  carrierName: string;
  positionTitle: string;
  equipmentLabel: string; // pretty label, e.g. "Reefer" not "reefer"
  domicileCity: string;
  domicileState: string;
  distanceMiles: number | null;
  payRangeLabel: string | null; // "$1,400–$1,800/wk" or null
  carrierKind: "partner" | "prospect" | "subscription";
  carrierTier: "tier_1" | "tier_2" | "none";
  label: string; // raw MatchLabel from engine; kept as-is so the badge stays accurate
}

/**
 * Pretty-label dictionary for equipment slugs. Matches the lookups in
 * SeoCopy / match-display-data so the chat reads the same way as the
 * match cards downstream.
 */
const EQUIPMENT_LABELS: Record<string, string> = {
  "dry-van": "Dry Van",
  reefer: "Reefer",
  flatbed: "Flatbed",
  tanker: "Tanker",
  hazmat: "Hazmat",
  "auto-hauler": "Auto Hauler",
  doubles: "Doubles",
  triples: "Triples",
  oversized: "Heavy Haul",
  dump: "Dump",
  mixer: "Mixer",
  intermodal: "Intermodal",
};

export function equipmentLabel(slug: string): string {
  const k = slug.toLowerCase().trim();
  return (
    EQUIPMENT_LABELS[k] ??
    k
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

/**
 * Format a weekly pay range as a driver-friendly label. Returns null
 * when neither min nor max is known — the chat surface drops the line
 * entirely rather than say "pay not disclosed" three times in a row.
 */
export function payRangeLabel(
  min: number | null,
  max: number | null,
): string | null {
  if (min != null && max != null) {
    return `$${min.toLocaleString()}–$${max.toLocaleString()}/wk`;
  }
  if (max != null) return `Up to $${max.toLocaleString()}/wk`;
  if (min != null) return `From $${min.toLocaleString()}/wk`;
  return null;
}

/**
 * Debbie's one-line preamble when matches arrive. Uses the driver's
 * home city + state for the "in [region]" line per spec §4.5.
 *
 * Voice rule: never claim a number you don't have. count is required.
 */
export function buildMatchesPreamble(
  count: number,
  homeCity: string | null,
  homeState: string | null,
): string {
  if (count <= 0) return buildZeroMatchesMessage(homeCity, homeState);
  const where = formatWhere(homeCity, homeState);
  const carriersLine =
    count === 1
      ? "1 carrier hiring drivers like you"
      : `${count} carriers hiring drivers like you`;
  return where
    ? `Here's what I found — ${carriersLine} ${where}.`
    : `Here's what I found — ${carriersLine}.`;
}

/**
 * Zero-matches case. Spec §4.5: honest, not pivoting to false hope.
 * The driver is in nurture regardless (Stage 1 consent covers this),
 * so the email-promise line is load-bearing.
 */
export function buildZeroMatchesMessage(
  homeCity: string | null,
  homeState: string | null,
): string {
  const where = formatWhere(homeCity, homeState);
  return where
    ? `Nothing matches that exactly right now ${where}. I'll keep watching and let you know the second something fits. New carriers are joining and posting positions all the time — could be a day, could be a couple weeks.`
    : `Nothing matches that exactly right now. I'll keep watching and let you know the second something fits. New carriers are joining and posting positions all the time — could be a day, could be a couple weeks.`;
}

/**
 * Async fallback message — Debbie says she'll keep working when
 * matching takes longer than the 5-second window. Two variants:
 *
 *   - hasEmail=true   "I'll email your matches in a few minutes."
 *   - hasEmail=false  Anonymous-intake driver; no email captured yet.
 *                     Tell them to hang on; we'll surface inline when
 *                     ready or they can refresh /matches/[id] later.
 */
export function buildAsyncFallbackMessage(hasEmail: boolean): string {
  return hasEmail
    ? "Working on it — I'll email your matches in a few minutes. You can also come back to this page in a bit."
    : "Working on it — hang tight. I'll show them here as soon as the engine catches up.";
}

function formatWhere(
  city: string | null,
  state: string | null,
): string | null {
  if (city && state) return `near ${city}, ${state}`;
  if (state) return `in ${state}`;
  if (city) return `near ${city}`;
  return null;
}
