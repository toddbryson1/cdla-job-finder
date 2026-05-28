// Parse one detail-workbook tab into a DetailTab record. Per spec §5.2.
//
// Important: this is BEST-EFFORT. Tab layouts are mostly-but-not-
// perfectly consistent. A field we can't parse stays NULL rather
// than guessed. A tab that yields almost nothing still produces a
// minimal DetailTab so the job can be created at `partial` quality
// (because it resolved to a real tab; just thin content).
//
// Current state: implementation is a SKELETON. The expected fields
// are stubbed out so the rest of the sync module can compile and we
// can validate the auth + match pipeline against real sheet data.
// Tomorrow's session fills in the per-field parsers.

import type { CellValue, SheetGrid } from "./sheets-client";
import type { DetailTab } from "./types";

// Field labels we expect to find in the leftmost column of typical
// "key/value" detail tab layouts. The parsers below match on these
// (case- and whitespace-tolerant).
const FIELD_LABELS = {
  hiringArea: /^hiring\s*area$/i,
  endorsements: /^(required\s*)?endorsements$/i,
  experience: /^(driver\s*)?requirements?$/i,
  homeTime: /^home\s*time$/i,
  equipment: /^equipment(\s*\/\s*freight)?$/i,
  pay: /^(pay|entry\s*points?)$/i,
  lanes: /^lanes?$/i,
  schedule: /^schedule$/i,
  freightTypes: /^freight\s*types?$/i,
} as const;

/**
 * Find the first row where column-0 matches the given label
 * pattern, and return the trimmed value from column-1 (and onward,
 * joined). Returns null if not found.
 */
function findFieldValue(grid: SheetGrid, labelRx: RegExp): string | null {
  for (const row of grid.rows) {
    const label = (row[0]?.text ?? "").trim();
    if (!labelRx.test(label)) continue;
    // The value may be in column 1, or span multiple cells.
    const valueParts: string[] = [];
    for (let i = 1; i < row.length; i++) {
      const t = (row[i]?.text ?? "").trim();
      if (t) valueParts.push(t);
    }
    const joined = valueParts.join(" ");
    return joined.length > 0 ? joined : null;
  }
  return null;
}

/** Extract "50 mile radius of McCalla, AL" → { radius: 50, city: "McCalla", state: "AL" }. */
function parseHiringArea(
  raw: string | null,
): {
  hiringRadiusMiles: number | null;
  anchorCity: string | null;
  anchorState: string | null;
  rest: string | null;
} {
  if (!raw) return { hiringRadiusMiles: null, anchorCity: null, anchorState: null, rest: null };
  // "50 mile radius of McCalla, AL" / "100-mile radius of Dallas, TX"
  const m = raw.match(/(\d{1,4})\s*-?\s*mile.*?of\s+([A-Za-z .'-]+?),\s*([A-Z]{2})\b/);
  if (!m) {
    return {
      hiringRadiusMiles: null,
      anchorCity: null,
      anchorState: null,
      rest: raw,
    };
  }
  const matched = m[0];
  const rest = raw.replace(matched, "").trim() || null;
  return {
    hiringRadiusMiles: Number(m[1]),
    anchorCity: m[2].trim(),
    anchorState: m[3].toUpperCase(),
    rest,
  };
}

function parseEndorsements(raw: string | null): string[] {
  if (!raw) return [];
  const u = raw.toUpperCase();
  const out: string[] = [];
  if (/\bHAZMAT\b/.test(u) || /\bHAZ-MAT\b/.test(u)) out.push("hazmat");
  if (/\bTANKER\b/.test(u) || /\bTWIC\b/.test(u)) {
    if (/\bTANKER\b/.test(u)) out.push("tanker");
    if (/\bTWIC\b/.test(u)) out.push("twic");
  }
  if (/\bDOUBLES\b/.test(u) || /\bTRIPLES\b/.test(u)) {
    out.push("doubles-triples");
  }
  return out;
}

function parseExperienceMonths(raw: string | null): number | null {
  if (!raw) return null;
  // "6 months of recent verifiable experience" / "12 months" / "1 year"
  const monthsMatch = raw.match(/(\d{1,2})\s*month/i);
  if (monthsMatch) return Number(monthsMatch[1]);
  const yearsMatch = raw.match(/(\d{1,2})\s*year/i);
  if (yearsMatch) return Number(yearsMatch[1]) * 12;
  return null;
}

export function parseDetailTab(tabName: string, grid: SheetGrid): DetailTab {
  const hiringAreaRaw = findFieldValue(grid, FIELD_LABELS.hiringArea);
  const ha = parseHiringArea(hiringAreaRaw);

  const endorsementsRaw = findFieldValue(grid, FIELD_LABELS.endorsements);
  const requirementsRaw = findFieldValue(grid, FIELD_LABELS.experience);
  const homeTimeRaw = findFieldValue(grid, FIELD_LABELS.homeTime);
  const equipmentRaw = findFieldValue(grid, FIELD_LABELS.equipment);
  const payRaw = findFieldValue(grid, FIELD_LABELS.pay);
  const lanesRaw = findFieldValue(grid, FIELD_LABELS.lanes);

  // Endorsements can appear under either Endorsements or Requirements;
  // fall back when the dedicated field is empty.
  const requiredEndorsements = parseEndorsements(
    endorsementsRaw ?? requirementsRaw,
  );

  const minExperienceMonths = parseExperienceMonths(requirementsRaw);

  // Notes — capture any "extra rules" appended to Hiring Area (e.g.,
  // "Must park at Dallas Yard — No Exceptions") so they reach driver UI.
  const notes: string[] = [];
  if (ha.rest) notes.push(`Hiring Area: ${ha.rest}`);
  if (payRaw) notes.push(`Pay (raw): ${payRaw}`);

  const isComplete =
    ha.hiringRadiusMiles != null &&
    ha.anchorCity != null &&
    !!homeTimeRaw &&
    !!equipmentRaw &&
    minExperienceMonths != null;

  return {
    tabName,
    hiringRadiusMiles: ha.hiringRadiusMiles,
    anchorCity: ha.anchorCity,
    anchorState: ha.anchorState,
    requiredEndorsements,
    minExperienceMonths,
    homeTimeDescription: homeTimeRaw,
    equipmentDescription: equipmentRaw,
    // TODO(tomorrow): real pay-range parsing. Source text is tiered
    // and multi-row; needs a more careful parser.
    payRangeMinWeekly: null,
    payRangeMaxWeekly: null,
    payRangeRawText: payRaw,
    lanesDescription: lanesRaw,
    notes,
    isComplete,
  };
}
