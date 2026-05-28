// Interactive TA Dedicated mapping review CLI.
//
// Walks through every active opening and lets you confirm which
// populated detail tab it maps to (per spec §6.1 — the human review
// step). Your confirmed picks go into ta_opening_tab_mappings; the
// next `ta-sync --apply` run uses them to produce complete/partial
// quality jobs instead of minimal.
//
// Already-mapped openings are skipped (you can pass --reset to
// re-review them).
//
// Usage:
//   npx tsx scripts/ta-review.ts
//   npx tsx scripts/ta-review.ts --reset
//
// Keys at each prompt:
//   1-5    Pick that numbered candidate
//   n      No matching tab (operator-confirmed; opening stays minimal)
//   s      Skip for now (don't write a mapping; fuzzy match continues
//           to apply next sync)
//   q      Quit (saves work so far)

import { existsSync, readFileSync } from "node:fs";
import readline from "node:readline";
import { config } from "dotenv";

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
  const reset = args.includes("--reset");

  const { db } = await import("../src/db/client");
  const { taOpeningTabMappings } = await import("../src/db/schema");
  const { sql, eq } = await import("drizzle-orm");
  const { listOpenings } = await import(
    "../src/lib/transport-america/sync"
  );
  const { readAllPopulatedTabs } = await import(
    "../src/lib/transport-america/sheets-client"
  );
  const { scoreMatch } = await import(
    "../src/lib/transport-america/fuzzy-match"
  );
  const { normalizeDivisionForKey } = await import(
    "../src/lib/transport-america/build-carrier-job"
  );

  if (reset) {
    console.log("Wiping ta_opening_tab_mappings…");
    await db.execute(sql`TRUNCATE ta_opening_tab_mappings`);
  }

  console.log("Reading openings + populated tabs (this takes ~3 min)…");
  const [openings, populatedTabs] = await Promise.all([
    listOpenings(),
    readAllPopulatedTabs(),
  ]);
  console.log(
    `  ${openings.rows.length} openings (CDL-A) · ${populatedTabs.length} populated tabs\n`,
  );

  const populatedNames = populatedTabs.map((t) => t.tabName);

  // Skip openings already mapped (unless --reset)
  const existing = await db.select().from(taOpeningTabMappings);
  const mappedNorms = new Set(
    existing.map((m) => m.openingDivisionNorm),
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q: string): Promise<string> =>
    new Promise((res) => rl.question(q, res));

  let saved = 0;
  let skipped = 0;

  for (const opening of openings.rows) {
    const norm = normalizeDivisionForKey(opening.division);
    if (mappedNorms.has(norm)) {
      continue; // already reviewed
    }

    // Top-5 candidates
    const scored = populatedNames
      .map((tab) => ({ tabName: tab, score: scoreMatch(opening.division, tab) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log("");
    console.log("═".repeat(70));
    console.log(`Opening: ${opening.division}`);
    if (opening.dateOpened) console.log(`  opened: ${opening.dateOpened}`);
    if (opening.driversNeededRaw)
      console.log(`  needs:  ${opening.driversNeededRaw} drivers`);
    console.log("");
    console.log("Candidates:");
    scored.forEach((c, i) => {
      const pct = (c.score * 100).toFixed(0);
      console.log(`  ${i + 1}. [${pct}%]  ${c.tabName}`);
    });
    console.log("  n. NO matching tab (confirmed minimal)");
    console.log("  s. Skip (review later)");
    console.log("  q. Quit");
    const answer = (await ask("Pick → ")).trim().toLowerCase();

    if (answer === "q") {
      console.log("Quit. Progress saved.");
      break;
    }
    if (answer === "s") {
      skipped++;
      continue;
    }

    let chosenTab: string | null = null;
    let confidence: number | null = null;

    if (answer === "n") {
      chosenTab = null; // explicit no-match
      confidence = null;
    } else if (/^[1-5]$/.test(answer)) {
      const idx = Number(answer) - 1;
      if (idx >= scored.length) {
        console.log(`  ✗ only ${scored.length} candidates shown`);
        skipped++;
        continue;
      }
      chosenTab = scored[idx].tabName;
      confidence = scored[idx].score;
    } else {
      console.log(`  ✗ unrecognized input "${answer}", skipping`);
      skipped++;
      continue;
    }

    await db
      .insert(taOpeningTabMappings)
      .values({
        openingDivisionNorm: norm,
        openingDivisionRaw: opening.division,
        tabName: chosenTab,
        confidence: confidence != null ? String(confidence) : null,
        confirmedBy: process.env.USER ?? "operator",
      })
      .onConflictDoUpdate({
        target: taOpeningTabMappings.openingDivisionNorm,
        set: {
          tabName: chosenTab,
          confidence: confidence != null ? String(confidence) : null,
          confirmedBy: process.env.USER ?? "operator",
          confirmedAt: new Date(),
        },
      });
    saved++;
    console.log(`  ✓ saved (${chosenTab ?? "no-match"})`);
  }
  rl.close();

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log(`  saved:    ${saved}`);
  console.log(`  skipped:  ${skipped}`);
  const total = await db.select().from(taOpeningTabMappings);
  console.log(`  total mappings in DB: ${total.length}`);
  console.log("");
  console.log(`Run \`npx tsx scripts/ta-sync.ts --apply\` to apply these mappings.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
