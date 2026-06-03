// One-shot: re-polish existing Transport America carrier_jobs
// position_title values through polishDivisionForTitle.
//
// Context: the polish logic landed in build-carrier-job.ts during a
// prior session (mapping "AAP/CQ" → "Advance Auto Parts / Carquest",
// em-dash separators, dropping trailing parentheticals). But TA was
// already synced to prod before that change, so the existing rows
// still carry the raw Division strings. New syncs go through the
// polish path automatically; this script catches the legacy data.
//
// polishDivisionForTitle is idempotent — re-running it against an
// already-polished string is a no-op. Safe to run repeatedly.
//
// Default behavior is dry-run: prints the (before, after) pairs that
// WOULD change without touching the DB. Pass --apply to write.
//
// Usage:
//   npx tsx scripts/polish-ta-position-titles.ts                   # dry-run
//   npx tsx scripts/polish-ta-position-titles.ts --apply           # write

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carriers, carrierJobs } from "@/db/schema";
import { polishDivisionForTitle } from "@/lib/transport-america/display-title";

const CARRIER_NAME = "Transport America";

interface Args {
  apply: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let apply = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return { apply };
}

async function main() {
  const args = parseArgs();
  console.log(
    `\nPolishing TA position titles — ${args.apply ? "APPLY mode (writes DB)" : "dry-run (no writes)"}\n`,
  );

  // Find the TA carrier_id. Bail if the row doesn't exist (e.g.
  // running against a local DB that wasn't seeded).
  const taCarrier = await db.query.carriers.findFirst({
    where: eq(carriers.name, CARRIER_NAME),
    columns: { id: true },
  });
  if (!taCarrier) {
    console.error(
      `No carrier named ${CARRIER_NAME} in this DB. Nothing to do.`,
    );
    process.exit(0);
  }

  const rows = await db
    .select({
      id: carrierJobs.id,
      positionTitle: carrierJobs.positionTitle,
    })
    .from(carrierJobs)
    .where(
      and(
        eq(carrierJobs.carrierId, taCarrier.id),
        eq(carrierJobs.status, "active"),
      ),
    );

  console.log(
    `Scanned ${rows.length} active TA jobs · checking which need re-polishing...\n`,
  );

  let updated = 0;
  let unchanged = 0;
  for (const r of rows) {
    const polished = polishDivisionForTitle(r.positionTitle);
    if (polished === r.positionTitle) {
      unchanged++;
      continue;
    }
    console.log(`  ${r.positionTitle}`);
    console.log(`  → ${polished}\n`);
    if (args.apply) {
      await db
        .update(carrierJobs)
        .set({ positionTitle: polished, updatedAt: new Date() })
        .where(eq(carrierJobs.id, r.id));
    }
    updated++;
  }

  console.log(
    `${args.apply ? "Updated" : "Would update"} ${updated} titles. ` +
      `${unchanged} already polished.`,
  );
  if (!args.apply && updated > 0) {
    console.log("\nRe-run with --apply to commit the writes.");
  }
}

main().catch((err) => {
  console.error("Polish script crashed:", err);
  process.exit(1);
});
