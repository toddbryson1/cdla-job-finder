// Quick smoke: parse one real detail tab. Validates the per-field parsers
// against actual data. Pick a tab that resolved at 100% from the match
// report.

import { readFileSync } from "node:fs";

async function main() {
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );
  const { readDetailTab } = await import(
    "../src/lib/transport-america/sheets-client"
  );
  const { parseDetailTab } = await import(
    "../src/lib/transport-america/parse-detail-tab"
  );

  const tabs = ["3M Aberdeen SD", "Honda Charlotte Team", "Watts solo - Franklin NH"];

  for (const tabName of tabs) {
    console.log(`\n══ ${tabName} ══`);
    const grid = await readDetailTab(tabName);
    console.log(`  rows: ${grid.rows.length}`);
    const parsed = parseDetailTab(tabName, grid);
    console.log(`  hiring radius: ${parsed.hiringRadiusMiles}`);
    console.log(`  anchor:        ${parsed.anchorCity}, ${parsed.anchorState}`);
    console.log(`  endorsements:  ${parsed.requiredEndorsements.join(", ") || "(none)"}`);
    console.log(`  min exp:       ${parsed.minExperienceMonths} months`);
    console.log(`  home time:     ${parsed.homeTimeDescription ?? "(unparsed)"}`);
    console.log(`  equipment:     ${parsed.equipmentDescription ?? "(unparsed)"}`);
    console.log(`  pay (raw):     ${parsed.payRangeRawText ?? "(unparsed)"}`);
    console.log(`  isComplete:    ${parsed.isComplete}`);
    if (parsed.notes.length) console.log(`  notes:         ${parsed.notes.join(" | ")}`);

    // Show raw key-value rows so we can see what the parser is up against
    console.log(`  --- first 12 rows ---`);
    for (const row of grid.rows.slice(0, 12)) {
      const cells = row.slice(0, 4).map((c) => (c.text ?? "").slice(0, 50));
      console.log(`    [${cells.join(" | ")}]`);
    }
  }
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
