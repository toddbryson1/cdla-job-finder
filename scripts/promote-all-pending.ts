// Bulk-promote every pending_carriers row whose status='pending'
// into the live carriers + carrier_jobs tables. Wraps
// promotePendingCarrier per spec §9 Phase 1 so an operator doesn't
// have to click Approve 16+ times through /admin.
//
// Safety:
//   - Dry-run by default. Prints what WOULD be promoted, no writes.
//   - --commit flag required to actually run promotions.
//   - --reviewer email required at write time (audit trail).
//   - Skips carriers with 0 staged jobs (nothing to promote).
//   - Per-carrier failures are logged + the script keeps going so
//     one bad carrier doesn't block the rest of the batch.
//
// Usage:
//   # Preview what would be promoted:
//   npx tsx scripts/promote-all-pending.ts
//
//   # Promote everything:
//   npx tsx scripts/promote-all-pending.ts --commit --reviewer todd@phtruckingpros.com
//
//   # Promote a single carrier by name (case-insensitive):
//   npx tsx scripts/promote-all-pending.ts --commit --reviewer me@x.com --name "Heartland Express"

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

interface Args {
  commit: boolean;
  reviewer?: string;
  name?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { commit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") out.commit = true;
    else if (a === "--reviewer") out.reviewer = argv[++i];
    else if (a === "--name") out.name = argv[++i];
  }
  return out;
}

interface PreviewRow {
  pendingId: string;
  name: string;
  jobCount: number;
  alreadyPromoted: boolean;
  promotedCarrierId: string | null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { db } = await import("../src/db/client");
  const { sql } = await import("drizzle-orm");
  const { promotePendingCarrier } = await import(
    "../src/lib/carrier-discovery/promote"
  );

  // Build the candidate list. We allow filtering by --name and we
  // exclude carriers with 0 staged jobs (nothing to do).
  const rows = (await db.execute(sql`
    SELECT
      pc.id AS pending_id,
      pc.name,
      COALESCE(j.n, 0)::int AS job_count,
      pc.promoted_carrier_id::text AS promoted_carrier_id
    FROM pending_carriers pc
    LEFT JOIN (
      SELECT pending_carrier_id, COUNT(*) AS n
      FROM pending_carrier_jobs
      GROUP BY pending_carrier_id
    ) j ON j.pending_carrier_id = pc.id
    WHERE pc.status = 'pending'
      AND COALESCE(j.n, 0) > 0
      ${args.name ? sql`AND LOWER(pc.name) = LOWER(${args.name})` : sql``}
    ORDER BY job_count DESC, name
  `)) as unknown as Array<{
    pending_id: string;
    name: string;
    job_count: number;
    promoted_carrier_id: string | null;
  }>;

  const candidates: PreviewRow[] = rows.map((r) => ({
    pendingId: r.pending_id,
    name: r.name,
    jobCount: r.job_count,
    alreadyPromoted: r.promoted_carrier_id != null,
    promotedCarrierId: r.promoted_carrier_id,
  }));

  if (candidates.length === 0) {
    console.log(
      args.name
        ? `No pending carrier matches "${args.name}" with staged jobs.`
        : "No pending carriers with staged jobs to promote.",
    );
    process.exit(0);
  }

  console.log(
    `${candidates.length} pending carrier(s) to promote (${candidates.reduce((s, c) => s + c.jobCount, 0)} staged jobs total):\n`,
  );
  for (const c of candidates) {
    const flag = c.alreadyPromoted ? " (re-promote)" : "";
    console.log(
      `  ${String(c.jobCount).padStart(3)} jobs · ${c.name}${flag}`,
    );
  }

  if (!args.commit) {
    console.log(
      "\nDRY-RUN — no writes. Add --commit --reviewer <email> to actually promote.",
    );
    process.exit(0);
  }

  if (!args.reviewer || !args.reviewer.includes("@")) {
    console.error(
      "\n--commit requires --reviewer <email> (recorded on each promoted row as audit trail).",
    );
    process.exit(2);
  }

  console.log(
    `\nPromoting as ${args.reviewer}…\n`,
  );

  let promoted = 0;
  let failed = 0;
  let totalJobsInserted = 0;
  let totalJobsUpdated = 0;
  let totalJobsSkipped = 0;
  const skipReasons: string[] = [];

  for (const c of candidates) {
    try {
      const r = await promotePendingCarrier(c.pendingId, {
        reviewerEmail: args.reviewer,
      });
      const marker = r.isNewCarrier ? "✓ new" : "✓ upd";
      console.log(
        `  ${marker} ${c.name.padEnd(34)} ${r.jobsInserted} new / ${r.jobsUpdated} upd / ${r.jobsSkipped} skip`,
      );
      promoted++;
      totalJobsInserted += r.jobsInserted;
      totalJobsUpdated += r.jobsUpdated;
      totalJobsSkipped += r.jobsSkipped;
      if (r.skipReasons.length > 0) {
        skipReasons.push(...r.skipReasons.map((s) => `${c.name}: ${s}`));
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗     ${c.name.padEnd(34)} ${msg}`);
    }
  }

  console.log(
    `\nDone. ${promoted} promoted, ${failed} failed; ${totalJobsInserted} new + ${totalJobsUpdated} updated + ${totalJobsSkipped} skipped carrier_jobs rows.`,
  );
  if (skipReasons.length > 0 && skipReasons.length <= 20) {
    console.log("\nSkip reasons:");
    for (const r of skipReasons) console.log(`  - ${r}`);
  } else if (skipReasons.length > 20) {
    console.log(
      `\n(${skipReasons.length} skip reasons — run promote on one carrier at a time to see all)`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[promote-all-pending] failed:", err);
    process.exit(1);
  });
