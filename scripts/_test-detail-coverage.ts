// Check which detail tabs actually have content. Reads several
// tabs and reports row counts so we know if the workbook is partially
// empty or if our reader is broken.

import { readFileSync } from "node:fs";

async function main() {
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );
  const { listDetailTabNames, readDetailTab } = await import(
    "../src/lib/transport-america/sheets-client"
  );

  const { jobTabs } = await listDetailTabNames();
  console.log(`Total job tabs: ${jobTabs.length}`);
  console.log(`Sampling first 20 tabs for content…\n`);

  let withRows = 0;
  let empty = 0;
  for (const tab of jobTabs.slice(0, 20)) {
    try {
      const grid = await readDetailTab(tab);
      const has = grid.rows.length > 0;
      if (has) withRows++; else empty++;
      const sample = has
        ? grid.rows[0]?.slice(0, 3).map((c) => c.text ?? "").join(" | ")
        : "(empty)";
      console.log(`  rows=${String(grid.rows.length).padStart(3)}  ${tab}  ${sample.slice(0, 60)}`);
    } catch (e) {
      console.log(`  ERR    ${tab}  ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }
  console.log(`\n  ${withRows} with content, ${empty} empty (out of 20 sampled)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
