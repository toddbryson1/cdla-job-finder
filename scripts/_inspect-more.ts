// Inspect a wider sample of populated tabs to see the real layout
// variety so the prose-fallback parser is targeted at real shapes.

import { readFileSync } from "node:fs";

async function main() {
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    "/tmp/gcp-key.json",
    "utf-8",
  );
  const { readDetailTab } = await import(
    "../src/lib/transport-america/sheets-client"
  );

  const tabs = [
    "AA Lakeland, FL",
    "AA Omaha, NE",
    "AA Riverside, CA",
    "BPI McHenry - Yard",
    "Foley Regional Kansas City, KS",
    "Honda Irving Solo",
  ];

  for (const tab of tabs) {
    console.log(`\n══ ${tab} ══`);
    const grid = await readDetailTab(tab);
    console.log(`rows: ${grid.rows.length}\n`);
    for (let i = 0; i < Math.min(grid.rows.length, 30); i++) {
      const cells = grid.rows[i]
        .slice(0, 5)
        .map((c) => (c.text ?? "").slice(0, 60));
      const nonEmpty = cells.some((c) => c.trim());
      if (nonEmpty) {
        console.log(`  [${i.toString().padStart(2)}] ${cells.join(" | ")}`);
      }
    }
    if (grid.rows.length > 30) {
      console.log(`  ...${grid.rows.length - 30} more rows`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
