// Look at the actual content of a few populated tabs so we can see
// what fields are present and how they're laid out.

import { readFileSync } from "node:fs";

async function main() {
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );
  const { readDetailTab } = await import(
    "../src/lib/transport-america/sheets-client"
  );

  const tabs = ["Ecolab Garland-home weekly", "Ecolab Martinsburg WV Shuttle", "Honda Irving Solo"];

  for (const tab of tabs) {
    console.log(`\n══════ ${tab} ══════`);
    const grid = await readDetailTab(tab);
    console.log(`rows: ${grid.rows.length}\n`);
    for (let i = 0; i < Math.min(grid.rows.length, 50); i++) {
      const cells = grid.rows[i].slice(0, 5).map((c) => (c.text ?? "").slice(0, 60));
      console.log(`  [${i.toString().padStart(2)}] ${cells.join(" | ")}`);
    }
    if (grid.rows.length > 50) console.log(`  ...and ${grid.rows.length - 50} more rows`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
