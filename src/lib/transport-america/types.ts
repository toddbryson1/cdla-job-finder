// Types for the Transport America (TA Dedicated) two-source sync.
// See docs/SPEC_transport-america-dedicated-sync-v2.md for the
// authoritative spec.

/**
 * One row from the openings sheet — the authority on what is
 * currently open, how many drivers each opening needs, and whether
 * the opening has been filled (grey-shaded → filled).
 */
export interface OpeningRow {
  /** Raw row index in the sheet (for traceability). */
  rowIndex: number;
  /** Date the opening was created. May be null for header/total rows. */
  dateOpened: string | null;
  /**
   * Free-text job identifier — account + location + role/shift.
   * Examples: "AAP/CQ - Blaine, MN Flex", "3M - Aberdeen, SD Solo".
   * This is the fuzzy-match join key against detail tab names.
   */
  division: string;
  /**
   * Drivers needed count. May be free-text in the source
   * ("2", "1 (1/2 team)"); raw and parsed both preserved.
   */
  driversNeededRaw: string;
  driversNeeded: number | null;
  /**
   * True iff the row's Division cell is grey-shaded — Google Sheets
   * API cell-format signal meaning the opening has been filled.
   * Spec §4: read through format-aware method.
   */
  isFilled: boolean;
  /**
   * True iff the Division string suggests CDL-B (e.g. "Foley - Dodge
   * City, KS CDL-B"). Excluded from sync per §7.
   */
  isCdlB: boolean;
}

/**
 * One tab from the detail workbook — the rich content for one
 * specific job.
 */
export interface DetailTab {
  /** Tab name from the workbook. The fuzzy-match join target. */
  tabName: string;
  /**
   * Best-effort parsed fields. Spec §5.2 — per-field tolerant; a
   * field we can't parse stays null rather than guessed.
   */
  hiringRadiusMiles: number | null;
  anchorCity: string | null;
  anchorState: string | null;
  requiredEndorsements: string[];
  minExperienceMonths: number | null;
  homeTimeDescription: string | null;
  equipmentDescription: string | null;
  payRangeMinWeekly: number | null;
  payRangeMaxWeekly: number | null;
  payRangeRawText: string | null;
  lanesDescription: string | null;
  notes: string[];
  /** True iff parsing yielded enough to call this "complete". */
  isComplete: boolean;
}

/**
 * Result of fuzzy-matching one opening against the detail workbook.
 */
export interface MatchResult {
  opening: OpeningRow;
  /** Best-matching tab name, or null if below threshold. */
  matchedTabName: string | null;
  /** Score 0..1; null when no match was attempted. */
  confidence: number | null;
  /** Top-3 candidates with scores — for the human review report. */
  candidates: Array<{ tabName: string; score: number }>;
  /** True if score was above threshold. */
  isResolved: boolean;
  /** Notes about why this match was made/skipped. */
  notes: string[];
}

/**
 * Output of one full sync run — written to disk for human review
 * before any carrier_jobs writes happen on first run.
 */
export interface SyncReport {
  runAt: string;
  openingsCount: number;
  detailTabsCount: number;
  policyTabsExcluded: string[];
  cdlBExcluded: number;
  matches: MatchResult[];
  resolvedCount: number;
  unresolvedCount: number;
  /** Stats by quality tier per §6. */
  qualityCounts: { complete: number; partial: number; minimal: number };
}
