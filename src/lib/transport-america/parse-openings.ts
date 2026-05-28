// Parse the openings sheet's "Dedicated Spreadsheet" tab into
// OpeningRow records. See spec §2.1 for column layout.

import type { CellValue, SheetGrid } from "./sheets-client";
import type { OpeningRow } from "./types";

// Column indices we expect on the Dedicated Spreadsheet tab.
// Spec §2.1 names them; this is the layout we expect to find at run
// time. The header row anchors detection — if the header doesn't
// match, the sheet's columns moved and we bail loudly rather than
// guess.
const EXPECTED_HEADER_PATTERNS: Array<{ name: string; rx: RegExp }> = [
  { name: "dateOpened", rx: /^date opened$/i },
  { name: "division", rx: /^division$/i },
  { name: "driversNeeded", rx: /^drivers needed$/i },
];

// Per spec §5.3 — Division strings explicitly tagged CDL-B are
// excluded. Match conservatively: "CDL-B" surrounded by word boundaries.
const CDL_B_RX = /\bcdl[- ]?b\b/i;

interface ColumnIndexes {
  dateOpened: number;
  division: number;
  driversNeeded: number;
}

function findColumnIndexes(headerRow: CellValue[]): ColumnIndexes | null {
  const map: Partial<ColumnIndexes> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const text = (headerRow[i]?.text ?? "").trim();
    for (const { name, rx } of EXPECTED_HEADER_PATTERNS) {
      if (rx.test(text)) {
        (map as Record<string, number>)[name] = i;
      }
    }
  }
  if (
    map.dateOpened === undefined ||
    map.division === undefined ||
    map.driversNeeded === undefined
  ) {
    return null;
  }
  return map as ColumnIndexes;
}

function parseDriversNeeded(raw: string): number | null {
  // Source ranges from "2" to "1 (1/2 team)". Take the first integer.
  const m = raw.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

export function parseOpenings(grid: SheetGrid): {
  rows: OpeningRow[];
  totalScanned: number;
  cdlBExcluded: number;
} {
  if (grid.rows.length === 0) {
    return { rows: [], totalScanned: 0, cdlBExcluded: 0 };
  }

  // Find header — usually row 0 but spec doesn't guarantee. Scan
  // first 5 rows for one matching the expected column pattern.
  let headerRowIdx = -1;
  let cols: ColumnIndexes | null = null;
  for (let i = 0; i < Math.min(5, grid.rows.length); i++) {
    const c = findColumnIndexes(grid.rows[i]);
    if (c) {
      headerRowIdx = i;
      cols = c;
      break;
    }
  }
  if (!cols) {
    throw new Error(
      "Openings sheet: expected header row with Date Opened / Division / Drivers Needed columns. Sheet layout may have changed.",
    );
  }

  const rows: OpeningRow[] = [];
  let cdlBExcluded = 0;

  for (let i = headerRowIdx + 1; i < grid.rows.length; i++) {
    const row = grid.rows[i];
    const divisionCell = row[cols.division];
    const division = (divisionCell?.text ?? "").trim();

    // Skip blank rows and the "Total:" summary row per §7.
    if (!division) continue;
    if (/^total\b/i.test(division)) continue;

    const dateOpened = (row[cols.dateOpened]?.text ?? "").trim() || null;
    const driversNeededRaw = (row[cols.driversNeeded]?.text ?? "").trim();
    const driversNeeded = parseDriversNeeded(driversNeededRaw);

    const isCdlB = CDL_B_RX.test(division);
    if (isCdlB) {
      // Counted for the report, not added to the result.
      cdlBExcluded++;
      continue;
    }

    rows.push({
      rowIndex: i,
      dateOpened,
      division,
      driversNeededRaw,
      driversNeeded,
      // Filled signal comes from the Division cell's background per §4.
      isFilled: divisionCell?.isGreyShaded ?? false,
      isCdlB: false,
    });
  }

  return { rows, totalScanned: grid.rows.length - headerRowIdx - 1, cdlBExcluded };
}
