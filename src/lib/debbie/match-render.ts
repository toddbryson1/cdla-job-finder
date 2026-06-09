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
  /** ~180-char snippet of carrier_jobs.description, cut at a sentence
   *  boundary when possible. Null when the row has no description.
   *  Full description lives on /match/[driverId]/[jobId]/apply. */
  descriptionSnippet: string | null;
  carrierKind: "partner" | "prospect" | "subscription";
  carrierTier: "tier_1" | "tier_2" | "none";
  label: string; // raw MatchLabel from engine; kept as-is so the badge stays accurate
}

/** Max chars in the chat MatchCard snippet — picked so two lines fit
 *  comfortably under the position title at the chat card's width. */
export const MAX_DESCRIPTION_SNIPPET_CHARS = 180;

/**
 * Trim a carrier_jobs.description down to a chat-card snippet.
 *
 * Rules:
 *   - null / blank / whitespace-only → null (card drops the line)
 *   - <= MAX_DESCRIPTION_SNIPPET_CHARS → return as-is, trimmed
 *   - Otherwise: cut at the last sentence boundary (. ! ?) before
 *     the cap; if none, cut at the last word boundary; if neither
 *     fits, hard-cut and append "…"
 *
 * Newlines collapse to single spaces — the snippet is one line of
 * flowing text in the card, not a paragraph.
 */
export function descriptionSnippet(raw: string | null): string | null {
  if (!raw) return null;
  const flat = raw.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return null;
  if (flat.length <= MAX_DESCRIPTION_SNIPPET_CHARS) return flat;

  const cut = flat.slice(0, MAX_DESCRIPTION_SNIPPET_CHARS);

  // Prefer the last sentence end.
  const lastSentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  if (lastSentence >= MAX_DESCRIPTION_SNIPPET_CHARS * 0.5) {
    return cut.slice(0, lastSentence + 1);
  }

  // Otherwise the last word boundary.
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= MAX_DESCRIPTION_SNIPPET_CHARS * 0.5) {
    return cut.slice(0, lastSpace).trimEnd() + "…";
  }

  // Single ultra-long token — hard cut.
  return cut.trimEnd() + "…";
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
 * Advisor-mode preamble (flag-gated). A warmer, honest, recruiter-style
 * open spoken in the chat: a one-line read on where the driver stands,
 * the #1 pick with its reason, and a nod that the rest is ranked. Falls
 * back to the zero-matches message when nothing fit. Kept additive — the
 * neutral buildMatchesPreamble is unchanged so its pins still hold.
 *
 * Voice: no hire predictions, no pay guarantees, no bragging. Plain.
 */
export function buildAdvisorChatPreamble(
  count: number,
  homeCity: string | null,
  homeState: string | null,
  opts: {
    topStrength?: string | null;
    topPickName?: string | null;
    topPickReason?: string | null;
  } = {},
): string {
  if (count <= 0) return buildZeroMatchesMessage(homeCity, homeState);
  const where = formatWhere(homeCity, homeState);

  const stand = opts.topStrength
    ? `Honest read — ${opts.topStrength}.`
    : "Here's the honest read on your search.";

  let pick: string;
  if (opts.topPickName) {
    pick = opts.topPickReason
      ? ` My top pick is ${opts.topPickName} — ${opts.topPickReason}.`
      : ` My top pick is ${opts.topPickName}.`;
  } else {
    const carriersLine =
      count === 1 ? "1 carrier that fits" : `${count} carriers that fit`;
    pick = ` I found ${carriersLine}${where ? ` ${where}` : ""}.`;
  }

  const tail =
    count > 1
      ? " I've ranked the rest below it — tap any to see why it landed where it did."
      : "";

  return `${stand}${pick}${tail}`;
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
