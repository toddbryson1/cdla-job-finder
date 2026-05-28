// TA Dedicated sync CLI.
//
// Usage:
//   npx tsx scripts/ta-sync.ts                # dry-run (default)
//   npx tsx scripts/ta-sync.ts --apply        # actually write to carrier_jobs
//   npx tsx scripts/ta-sync.ts --apply --threshold 0.5
//
// Reads /tmp/cdla-prod.env for DATABASE_URL (or .env.local if running
// against local dev) and /tmp/gcp-key.json for the Sheets API key.

import { config } from "dotenv";
// Prefer the prod env file if it exists; falls back to project .env.local
import { existsSync, readFileSync } from "node:fs";

if (existsSync("/tmp/cdla-prod.env")) {
  config({ path: "/tmp/cdla-prod.env" });
}
config({ path: ".env.local" });

async function main() {
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );

  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const thrIdx = args.indexOf("--threshold");
  const threshold = thrIdx >= 0 ? Number(args[thrIdx + 1]) : undefined;

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log("TA Dedicated sync");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Mode:      ${apply ? "APPLY (writes to DB)" : "DRY-RUN (no DB writes)"}`);
  console.log(`  Threshold: ${threshold ?? "default (0.65)"}`);
  console.log("");

  const { runFullSync } = await import("../src/lib/transport-america/sync");
  const r = await runFullSync({ apply, confidenceThreshold: threshold });

  console.log("");
  console.log("Result:");
  console.log(`  upserted (active):  ${r.upserted}`);
  console.log(`  archived:           ${r.archived}`);
  console.log(`  skipped:            ${r.skipped}`);
  console.log(`  CDL-B excluded:     ${r.cdlBExcluded}`);
  console.log(`  by quality:`);
  console.log(`    complete: ${r.qualityCounts.complete}`);
  console.log(`    partial:  ${r.qualityCounts.partial}`);
  console.log(`    minimal:  ${r.qualityCounts.minimal}`);
  if (r.notes.length > 0) {
    console.log("");
    console.log("Notes:");
    for (const n of r.notes.slice(0, 20)) {
      console.log(`  ${n}`);
    }
    if (r.notes.length > 20) console.log(`  …and ${r.notes.length - 20} more`);
  }
  process.exit(r.ok ? 0 : 1);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
