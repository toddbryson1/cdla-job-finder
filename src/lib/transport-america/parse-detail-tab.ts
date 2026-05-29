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
// "key/value" detail tab layouts. Tolerant to:
//   - trailing colon ("Hiring Area:" matches "hiring area")
//   - "Required" prefix ("Required Endorsements")
//   - multi-word variants ("Type of Run/Route" → run/route)
//
// Source layouts these patterns cover (sampled from live data):
//   - Ecolab Garland-home weekly       (clean key|value)
//   - AA Omaha, NE / AA Riverside, CA  (Driver Profile style, label|value)
//   - BPI McHenry - Yard               (label on its own row, value below)
const FIELD_LABELS = {
  hiringArea: /^hiring\s*area:?$/i,
  endorsements: /^(required\s*)?endorsements\s*(required)?:?$/i,
  experience:
    /^((driver\s*)?requirements?|cdl\s*[-– ]?\s*a\s*requirement):?$/i,
  homeTime: /^home\s*time:?$/i,
  equipment: /^equipment(\s*type)?(\s*\/\s*freight)?:?$/i,
  pay: /^(pay|entry\s*points?|starting\s*pay):?$/i,
  lanes: /^(lanes?|running\s*lanes?|type\s*of\s*run\s*\/?\s*route?):?$/i,
  schedule: /^schedule:?$/i,
  freightTypes: /^freight\s*types?:?$/i,
} as const;

/**
 * Find the first row where column-0 matches the given label, then
 * return its value. Supports two layouts:
 *
 *   1. Inline:  [ "Hiring Area:" | "100 mile radius of Dallas, TX" | ... ]
 *      Value is from column 1 onward, joined.
 *
 *   2. Stacked: [ "Hiring Area:" | "" | "" ]
 *              [ "100 mile radius of Mchenry, IL" | "" | "" ]
 *      Value is from column 0 of the NEXT row.
 *
 * Per spec §5.2 — best-effort, per-field tolerant; a field we can't
 * parse stays null rather than guessed.
 */
function findFieldValue(grid: SheetGrid, labelRx: RegExp): string | null {
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r];
    const label = (row[0]?.text ?? "").trim();
    if (!labelRx.test(label)) continue;

    // Inline value (cols 1+ on the SAME row)
    const inlineParts: string[] = [];
    for (let i = 1; i < row.length; i++) {
      const t = (row[i]?.text ?? "").trim();
      if (t) inlineParts.push(t);
    }
    const inline = inlineParts.join(" ");
    if (inline.length > 0) return inline;

    // Stacked value (col 0 of the NEXT non-empty row, when this row's
    // own value cells are empty). We look at the next 1-2 rows so a
    // single blank padding row between label and value still works.
    for (let n = 1; n <= 2 && r + n < grid.rows.length; n++) {
      const nextRow = grid.rows[r + n];
      const nextCol0 = (nextRow[0]?.text ?? "").trim();
      if (nextCol0.length === 0) continue;
      // Safety: if the next row is ALSO a recognized label, this row's
      // value is genuinely empty — don't borrow it.
      if (/^[A-Z][A-Za-z ]+:\s*$/.test(nextCol0)) {
        break;
      }
      return nextCol0;
    }

    return null;
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

/**
 * Concat every non-empty cell into a single big string. Used as the
 * input to the prose-fallback regex passes — fields the key/value
 * scan missed sometimes appear inline in a "Profile" header block or
 * a free-text "About this run" section.
 */
function flattenGrid(grid: SheetGrid): string {
  const parts: string[] = [];
  for (const row of grid.rows) {
    for (const cell of row) {
      const t = cell.text?.trim();
      if (t) parts.push(t);
    }
  }
  return parts.join(" \n ");
}

/** Hiring radius from prose: "45 mile radius from Mchenry, IL" anywhere. */
function findHiringAreaInProse(text: string): {
  hiringRadiusMiles: number | null;
  anchorCity: string | null;
  anchorState: string | null;
} {
  const m = text.match(
    /(\d{1,4})\s*-?\s*mile(?:\s+radius)?\s+(?:of|from|around)\s+([A-Za-z .'-]+?),?\s+([A-Z]{2})\b/,
  );
  if (!m) {
    return { hiringRadiusMiles: null, anchorCity: null, anchorState: null };
  }
  return {
    hiringRadiusMiles: Number(m[1]),
    anchorCity: m[2].trim(),
    anchorState: m[3].toUpperCase(),
  };
}

/** Detect home-time cadence anywhere in prose. */
function findHomeTimeInProse(text: string): string | null {
  const t = text.toLowerCase();
  if (/home\s*daily|home\s*every\s*day|day(?:\s*and\s*weekends?)?/.test(t)) {
    return "Home daily";
  }
  if (/home\s*weekly|34[- ]?hour\s*restart/.test(t)) {
    return "Home weekly";
  }
  if (/every\s*other\s*week|home\s*biweekly/.test(t)) {
    return "Home biweekly";
  }
  if (/\botr\b|over[- ]the[- ]road/.test(t)) {
    return "OTR";
  }
  return null;
}

/** Detect equipment in prose. */
function findEquipmentInProse(text: string): string | null {
  // Look for the first occurrence of a known equipment phrase.
  const patterns: Array<[RegExp, string]> = [
    [/\bbox\s*trucks?\b[^.]*?(?:lift\s*gates?|delivery)/i, "Box trucks with lift gates"],
    [/\d{2}\s*'?\s*box\s*trucks?/i, "Box trucks"],
    [/\d{2}\s*'?\s*dry\s*van\s*trailers?/i, "Dry van trailers"],
    [/\bdry\s*van\s*trailers?\b/i, "Dry van trailers"],
    [/\breefer\s*trailers?\b/i, "Reefer trailers"],
    [/\bflatbed\s*trailers?\b/i, "Flatbed trailers"],
    [/\btanker\s*trailers?\b/i, "Tanker trailers"],
    [/\bstep\s*deck\b/i, "Step deck"],
  ];
  for (const [rx, label] of patterns) {
    if (rx.test(text)) return label;
  }
  return null;
}

/** Experience in prose: "1 YEAR OF CDL A DRIVING EXP", "6 months ...". */
function findExperienceInProse(text: string): number | null {
  // Look for "<N> month(s)" or "<N> year(s)" anywhere
  const monthMatch = text.match(
    /(\d{1,2})\s*months?\s*(?:of)?\s*(?:recent|verifiable|cdl|driving)/i,
  );
  if (monthMatch) return Number(monthMatch[1]);
  const yearMatch = text.match(
    /(\d{1,2})\s*years?\s*(?:of)?\s*(?:recent|verifiable|cdl|driving|of\s*cdl)/i,
  );
  if (yearMatch) return Number(yearMatch[1]) * 12;
  return null;
}

export function parseDetailTab(tabName: string, grid: SheetGrid): DetailTab {
  // PASS 1: key/value field lookup (handles clean Ecolab-style tabs
  // and the BPI-style label-on-its-own-row layout).
  const hiringAreaRaw = findFieldValue(grid, FIELD_LABELS.hiringArea);
  let ha = parseHiringArea(hiringAreaRaw);

  const endorsementsRaw = findFieldValue(grid, FIELD_LABELS.endorsements);
  const requirementsRaw = findFieldValue(grid, FIELD_LABELS.experience);
  let homeTimeRaw = findFieldValue(grid, FIELD_LABELS.homeTime);
  // Equipment falls back to Freight Types — populated tabs (e.g.,
  // Ecolab Garland-home weekly) use "Freight Types" as the label.
  let equipmentRaw =
    findFieldValue(grid, FIELD_LABELS.equipment) ??
    findFieldValue(grid, FIELD_LABELS.freightTypes);
  const payRaw = findFieldValue(grid, FIELD_LABELS.pay);
  const lanesRaw = findFieldValue(grid, FIELD_LABELS.lanes);

  // PASS 2: prose-fallback for any fields still null. This catches
  // tabs that use free-text descriptions or where field labels don't
  // sit on their own row (AA Omaha-style Driver Profile, AA Riverside,
  // and any future format we haven't pattern-matched yet).
  const flat = flattenGrid(grid);
  if (!ha.hiringRadiusMiles || !ha.anchorCity) {
    const proseHa = findHiringAreaInProse(flat);
    if (proseHa.hiringRadiusMiles && proseHa.anchorCity) {
      ha = { ...ha, ...proseHa };
    }
  }
  if (!homeTimeRaw) {
    homeTimeRaw = findHomeTimeInProse(flat);
  }
  if (!equipmentRaw) {
    equipmentRaw = findEquipmentInProse(flat);
  }

  // Endorsements can appear under either Endorsements or Requirements;
  // fall back to scanning the whole tab text for known endorsement
  // names — handles "Hazmat endorsements are mandatory" in prose.
  const requiredEndorsements = parseEndorsements(
    endorsementsRaw ?? requirementsRaw ?? flat,
  );

  const minExperienceMonths =
    parseExperienceMonths(requirementsRaw) ?? findExperienceInProse(flat);

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
