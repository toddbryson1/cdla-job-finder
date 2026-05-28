// Transport America (TA Dedicated) sync orchestrator.
//
// Two source sheets → carrier_jobs writes. Read-only against the
// sheets; idempotent against the DB via external_source_id.
//
// First run is a SHADOW run by default — produces a match-review
// report on disk, does not write to carrier_jobs. Human reviews the
// report; uncertain matches get confirmed; then a second run with
// the confirmed mappings on hand writes the rows.
//
// See docs/SPEC_transport-america-dedicated-sync-v2.md for spec.
//
// STATE OF THIS FILE: orchestrator is scaffolded. The full sync
// orchestration (carrier_jobs upsert, mapping persistence) is
// TODO(tomorrow). What works right now:
//   - listOpenings()         — reads openings sheet, parses, returns rows
//   - listDetailTabNames()   — reads detail workbook tab names
//   - runMatchReport()       — runs fuzzy match, produces SyncReport
//
// The high-confidence path tomorrow: runFullSync() = match → parse →
// upsert into carrier_jobs.

import { listDetailTabNames, readOpeningsTab } from "./sheets-client";
import { matchAllOpenings } from "./fuzzy-match";
import { parseOpenings } from "./parse-openings";
import type { SyncReport } from "./types";

/**
 * Read openings → parse → return OpeningRow records.
 * Excludes CDL-B and blank/header/total rows; respects grey-shading
 * to mark filled openings.
 */
export async function listOpenings() {
  const grid = await readOpeningsTab();
  return parseOpenings(grid);
}

/**
 * Run the match-report pipeline:
 *   1. List openings (excluding CDL-B, blank rows, total)
 *   2. List detail tab names (excluding policy tabs)
 *   3. Fuzzy match each opening against detail tabs
 *   4. Return a SyncReport that callers serialize to JSON for human review
 *
 * No DB writes happen in this function. The match report is the
 * artifact for the §6.1 one-time human review step.
 */
export async function runMatchReport(opts: {
  /** Confidence threshold for the fuzzy match. Defaults to 0.65. */
  confidenceThreshold?: number;
}): Promise<SyncReport> {
  const [openings, detailTabs] = await Promise.all([
    listOpenings(),
    listDetailTabNames(),
  ]);

  const matches = matchAllOpenings(
    openings.rows,
    detailTabs.jobTabs,
    opts.confidenceThreshold,
  );

  const resolvedCount = matches.filter((m) => m.isResolved).length;
  const unresolvedCount = matches.length - resolvedCount;

  // Quality counts can't be finalized until we actually parse the
  // resolved tabs (a resolved match with a thin tab is `partial`).
  // For the match-report stage we report only resolution counts;
  // the full sync run will recompute quality based on parsed content.
  const qualityCounts = {
    complete: 0,
    partial: 0,
    minimal: unresolvedCount,
  };

  return {
    runAt: new Date().toISOString(),
    openingsCount: openings.rows.length,
    detailTabsCount: detailTabs.jobTabs.length,
    policyTabsExcluded: detailTabs.policyTabs,
    cdlBExcluded: openings.cdlBExcluded,
    matches,
    resolvedCount,
    unresolvedCount,
    qualityCounts,
  };
}

// TODO(tomorrow):
//   - runFullSync(): pull confirmed mappings from the new
//     opening_tab_mappings table, parse each resolved detail tab,
//     upsert into carrier_jobs with external_source_id =
//     "ta:opening:<rowIndex>:<divisionHash>".
//   - opening_tab_mappings table + migration (persisted human review).
