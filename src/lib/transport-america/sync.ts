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

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, taOpeningTabMappings } from "@/db/schema";
import { buildCarrierJobRow, normalizeDivisionForKey } from "./build-carrier-job";
import { matchAllOpenings } from "./fuzzy-match";
import { parseDetailTab } from "./parse-detail-tab";
import { parseOpenings } from "./parse-openings";
import {
  listDetailTabNames,
  readDetailTab,
  readOpeningsTab,
} from "./sheets-client";
import type { DetailTab, SyncReport } from "./types";

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

/**
 * Result of runFullSync — one summary line for the cron logs + the
 * full match report on disk for human review.
 */
export interface FullSyncResult {
  ok: boolean;
  apply: boolean;
  upserted: number;
  archived: number;
  skipped: number;
  qualityCounts: { complete: number; partial: number; minimal: number };
  cdlBExcluded: number;
  matchReportPath: string;
  notes: string[];
}

/**
 * End-to-end TA Dedicated sync:
 *   1. Read openings + detail tab names
 *   2. Consult ta_opening_tab_mappings for confirmed matches
 *   3. Fuzzy-match the rest
 *   4. For each resolved match, read + parse the detail tab
 *   5. Build a carrier_jobs insert per opening
 *   6. Upsert by external_source_id (idempotent)
 *
 * Dry-run by default (apply=false). Pass apply=true to actually write.
 * Filled (grey-shaded) openings are upserted with status='archived'
 * per spec §4 — keeps history without surfacing them to matchers.
 */
export async function runFullSync(opts: {
  apply: boolean;
  confidenceThreshold?: number;
}): Promise<FullSyncResult> {
  const notes: string[] = [];

  // 0. Look up carrier id.
  const carrier = await db.query.carriers.findFirst({
    where: eq(carriers.name, "Transport America"),
  });
  if (!carrier) {
    throw new Error(
      "Transport America carrier row not found. Run scripts/_insert-ta-carrier.ts first.",
    );
  }

  // 1. Read sources in parallel.
  const [openings, detailNames] = await Promise.all([
    listOpenings(),
    listDetailTabNames(),
  ]);

  // 2. Consult mapping table — operator-confirmed mappings override
  //    fuzzy match results.
  const confirmedMappings = await db.select().from(taOpeningTabMappings);
  const confirmedByNorm = new Map(
    confirmedMappings.map((m) => [m.openingDivisionNorm, m]),
  );

  // 3. Fuzzy-match the openings that don't have confirmed mappings.
  const fuzzyResults = matchAllOpenings(
    openings.rows,
    detailNames.jobTabs,
    opts.confidenceThreshold,
  );

  // 4 & 5. For each opening, decide tab → parse → build → upsert.
  const upsertResults = {
    upserted: 0,
    archived: 0,
    skipped: 0,
    qualityCounts: { complete: 0, partial: 0, minimal: 0 },
  };

  // Memoize parsed tabs — many openings can resolve to the same tab.
  const tabCache = new Map<string, DetailTab | null>();
  async function getDetailTab(tabName: string): Promise<DetailTab | null> {
    if (tabCache.has(tabName)) return tabCache.get(tabName)!;
    const grid = await readDetailTab(tabName);
    if (grid.rows.length === 0) {
      tabCache.set(tabName, null);
      return null;
    }
    const parsed = parseDetailTab(tabName, grid);
    tabCache.set(tabName, parsed);
    return parsed;
  }

  for (let i = 0; i < openings.rows.length; i++) {
    const opening = openings.rows[i];
    const fuzzy = fuzzyResults[i];
    const confirmed = confirmedByNorm.get(
      normalizeDivisionForKey(opening.division),
    );

    // Determine the resolved tab.
    let resolvedTabName: string | null = null;
    if (confirmed) {
      // Operator chose this. tabName may be NULL meaning "no match exists".
      resolvedTabName = confirmed.tabName;
    } else if (fuzzy.isResolved) {
      resolvedTabName = fuzzy.matchedTabName;
    }

    const detailTab = resolvedTabName
      ? await getDetailTab(resolvedTabName)
      : null;

    const build = await buildCarrierJobRow({
      carrierId: carrier.id,
      detailTab,
      opening,
    });

    if (!build.ok) {
      upsertResults.skipped++;
      notes.push(`SKIP ${opening.division}: ${build.reason}`);
      continue;
    }

    upsertResults.qualityCounts[build.qualityTier]++;
    if (opening.isFilled) upsertResults.archived++;
    else upsertResults.upserted++;

    if (opts.apply) {
      // Upsert by externalSourceId
      const existing = await db.query.carrierJobs.findFirst({
        where: eq(carrierJobs.externalSourceId, build.externalSourceId),
      });
      if (existing) {
        await db
          .update(carrierJobs)
          .set({ ...build.row, updatedAt: new Date() })
          .where(eq(carrierJobs.id, existing.id));
      } else {
        await db.insert(carrierJobs).values(build.row);
      }
    }
  }

  // Archive any TA carrier_jobs whose Division is no longer in the
  // openings list (DLM removed the opening). Idempotent.
  if (opts.apply) {
    const liveKeys = new Set(
      openings.rows.map(
        (o) =>
          `ta:opening:${crypto
            .createHash("sha256")
            .update(normalizeDivisionForKey(o.division))
            .digest("hex")
            .slice(0, 12)}`,
      ),
    );
    const taJobs = await db
      .select({ id: carrierJobs.id, externalSourceId: carrierJobs.externalSourceId })
      .from(carrierJobs)
      .where(
        and(
          eq(carrierJobs.carrierId, carrier.id),
          eq(carrierJobs.status, "active"),
        ),
      );
    for (const j of taJobs) {
      if (j.externalSourceId && !liveKeys.has(j.externalSourceId)) {
        await db
          .update(carrierJobs)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(carrierJobs.id, j.id));
        upsertResults.archived++;
      }
    }
  }

  return {
    ok: true,
    apply: opts.apply,
    upserted: upsertResults.upserted,
    archived: upsertResults.archived,
    skipped: upsertResults.skipped,
    qualityCounts: upsertResults.qualityCounts,
    cdlBExcluded: openings.cdlBExcluded,
    matchReportPath: "/tmp/ta-match-report.json",
    notes,
  };
}
