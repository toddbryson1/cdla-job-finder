// Of the matches that resolved (≥ threshold), how many resolve to
// a detail tab that actually has content? Tells us if the sync will
// yield mostly `complete`/`partial` jobs or mostly `minimal` ones.

import { readFileSync } from "node:fs";

async function main() {
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );
  const { runMatchReport } = await import("../src/lib/transport-america/sync");
  const { readDetailTab } = await import(
    "../src/lib/transport-america/sheets-client"
  );
  const { parseDetailTab } = await import(
    "../src/lib/transport-america/parse-detail-tab"
  );

  const report = await runMatchReport({});
  const resolved = report.matches.filter((m) => m.isResolved);
  console.log(`Checking content for ${resolved.length} resolved tab matches…\n`);

  let complete = 0;
  let partial = 0;
  let emptyTab = 0;

  for (const m of resolved) {
    const tabName = m.matchedTabName!;
    const grid = await readDetailTab(tabName);
    const parsed = parseDetailTab(tabName, grid);
    const conf = (m.confidence! * 100).toFixed(0);
    if (grid.rows.length === 0) {
      emptyTab++;
      console.log(`  ${conf}% [empty]    ${m.opening.division}  →  ${tabName}`);
    } else if (parsed.isComplete) {
      complete++;
      console.log(
        `  ${conf}% [complete] ${m.opening.division}  →  ${tabName}  ` +
          `(radius=${parsed.hiringRadiusMiles}mi, ${parsed.anchorCity}, ${parsed.anchorState})`,
      );
    } else {
      partial++;
      console.log(`  ${conf}% [partial]  ${m.opening.division}  →  ${tabName} (rows=${grid.rows.length})`);
    }
  }
  console.log("");
  console.log(`  complete: ${complete}`);
  console.log(`  partial:  ${partial}`);
  console.log(`  empty:    ${emptyTab}`);
  console.log(`  total:    ${resolved.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
