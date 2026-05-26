import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { syncSwiftJobs } from "../src/lib/swift-sync";

// CLI wrapper around src/lib/swift-sync. Dry-run by default; --apply
// writes to the DB. Reads DATABASE_URL + SMARTSHEET_API_KEY from .env.local
// (or from the surrounding shell, e.g.,
// `DATABASE_URL=<neon-url> npx tsx scripts/sync-swift.ts --apply`).
//
// Usage:
//   npx tsx scripts/sync-swift.ts                    # dry-run
//   npx tsx scripts/sync-swift.ts --apply            # writes
//   DATABASE_URL=<neon> npx tsx scripts/sync-swift.ts --apply

const APPLY = process.argv.includes("--apply");
const SHEET_ID_OR_TOKEN =
  process.env.SMARTSHEET_SWIFT_SHEET_ID ??
  "8J4Q4hvjx97Wf28G74XcQJ5RjVfwQ5wXv7CxjFM1";

const apiKey = process.env.SMARTSHEET_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!apiKey) {
  console.error("SMARTSHEET_API_KEY is not set. Add it to .env.local.");
  process.exit(1);
}
if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pg = postgres(dbUrl, { prepare: false, max: 5 });
const db = drizzle(pg, { schema });

async function main() {
  console.log(
    `Sync mode: ${APPLY ? "APPLY (writes to DB)" : "DRY-RUN (no writes)"}`,
  );
  console.log(`Sheet: ${SHEET_ID_OR_TOKEN}`);

  const result = await syncSwiftJobs(db, {
    apiKey: apiKey!,
    sheetIdOrToken: SHEET_ID_OR_TOKEN,
    apply: APPLY,
  });

  console.log(`Sheet "${result.sheetName}" — ${result.totalRows} rows`);
  console.log(`\nMapped:  ${result.mapped}`);
  console.log("Skipped reasons:");
  for (const [reason, count] of Object.entries(result.skipped).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(4)} — ${reason}`);
  }

  console.log("\nFirst 5 mapped jobs:");
  for (const job of result.sampleJobs) {
    console.log(
      `  ${job.positionTitle}  |  ${job.equipment}  |  radius=${job.hiringRadiusMiles ?? "OTR"}  |  $${job.payRangeMaxWeeklyUsd ?? "?"}/wk  |  ${job.acceptedHomeTimeTypes.join("/")}`,
    );
  }

  if (!result.applied) {
    console.log("\nDry-run complete. Add --apply to write to the DB.");
  } else {
    console.log(`\nCarrier id: ${result.carrierId}`);
    console.log(`  inserted: ${result.inserted}`);
    console.log(`  updated:  ${result.updated}`);
    console.log(`  archived (no longer in feed): ${result.archived}`);
  }

  await pg.end();
}

main().catch(async (err) => {
  console.error("Sync failed:", err);
  await pg.end();
  process.exit(1);
});
