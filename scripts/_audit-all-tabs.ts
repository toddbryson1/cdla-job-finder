// Audit every detail tab — report row count. Helps figure out if
// the "most tabs empty" finding was a parser issue or actual data state.

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
  console.log(`Auditing ${jobTabs.length} job tabs…\n`);

  const empty: string[] = [];
  const populated: Array<{ tab: string; rows: number }> = [];

  for (let i = 0; i < jobTabs.length; i++) {
    const tab = jobTabs[i];
    try {
      const grid = await readDetailTab(tab);
      if (grid.rows.length === 0) empty.push(tab);
      else populated.push({ tab, rows: grid.rows.length });
    } catch (e) {
      console.log(`  ERR ${tab}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`  scanned ${i + 1}/${jobTabs.length}…`);
    }
  }

  console.log("");
  console.log(`Populated: ${populated.length}`);
  console.log(`Empty:     ${empty.length}`);
  console.log("");
  console.log("First 30 populated tabs (with row counts):");
  for (const p of populated.slice(0, 30)) {
    console.log(`  ${String(p.rows).padStart(4)}  ${p.tab}`);
  }
  console.log("");
  console.log("First 10 empty tab names:");
  for (const t of empty.slice(0, 10)) console.log(`  ${t}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
