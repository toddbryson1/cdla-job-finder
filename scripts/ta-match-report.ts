// CLI: run the TA Dedicated match-report against live Google Sheets.
//
// Reads the openings sheet + detail workbook tab names, runs fuzzy
// match, writes a JSON report to disk. No DB writes.
//
// Use: npx tsx scripts/ta-match-report.ts [--threshold 0.65]
//
// Output:
//   /tmp/ta-match-report.json  — full structured report
//   stdout                     — human-readable summary
//
// Prereqs:
//   - /tmp/gcp-key.json present (Sheets API service-account key)
//   - Service account shared as Viewer on both sheets
//   - Google Sheets API enabled in cdla-jobs-indexing GCP project

import { readFileSync, writeFileSync } from "node:fs";

const REPORT_PATH = "/tmp/ta-match-report.json";

async function main() {
  // Wire the service-account key into the env so sheets-client picks it up.
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );

  // Parse --threshold from argv.
  const args = process.argv.slice(2);
  const thrIdx = args.indexOf("--threshold");
  const threshold =
    thrIdx >= 0 ? Number(args[thrIdx + 1]) : undefined;

  const { runMatchReport } = await import("../src/lib/transport-america/sync");

  console.log("Running TA Dedicated match report…");
  const report = await runMatchReport({ confidenceThreshold: threshold });

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log("TA Dedicated match report");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Run at:                 ${report.runAt}`);
  console.log(`  Openings (CDL-A):       ${report.openingsCount}`);
  console.log(`  Detail tabs (jobs):     ${report.detailTabsCount}`);
  console.log(
    `  Policy tabs excluded:   ${report.policyTabsExcluded.length} (${report.policyTabsExcluded.join(", ")})`,
  );
  console.log(`  CDL-B excluded:         ${report.cdlBExcluded}`);
  console.log(`  Resolved (≥ threshold): ${report.resolvedCount}`);
  console.log(`  Unresolved:             ${report.unresolvedCount}`);
  console.log("");

  // Show top 10 resolved matches with confidence
  console.log("── Top resolved matches (by confidence) ──");
  const resolved = report.matches
    .filter((m) => m.isResolved)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  for (const m of resolved.slice(0, 10)) {
    const c = ((m.confidence ?? 0) * 100).toFixed(0);
    console.log(
      `  ${c}%  "${m.opening.division}"  →  "${m.matchedTabName}"`,
    );
  }
  if (resolved.length > 10) {
    console.log(`  …and ${resolved.length - 10} more`);
  }
  console.log("");

  // Show all unresolved (these are the human-review queue)
  console.log("── Unresolved openings (need human review) ──");
  const unresolved = report.matches.filter((m) => !m.isResolved);
  for (const m of unresolved) {
    const c = ((m.confidence ?? 0) * 100).toFixed(0);
    console.log(`  "${m.opening.division}"`);
    console.log(`    best score: ${c}%`);
    console.log(`    top candidates:`);
    for (const cand of m.candidates) {
      console.log(`      ${(cand.score * 100).toFixed(0)}%  "${cand.tabName}"`);
    }
    if (m.notes.length > 0) {
      console.log(`    notes: ${m.notes.join("; ")}`);
    }
  }
  console.log("");
  console.log(`Full report at: ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
