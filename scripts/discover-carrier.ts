// Carrier-discovery dry-run CLI. Point it at any carrier and see what
// we'd ingest from their website (JobPosting JSON-LD), with an
// Adzuna company-name fallback for carriers without structured data.
//
// Usage:
//   npx tsx scripts/discover-carrier.ts --name "Heartland Express" --url https://heartlandexpress.com
//   npx tsx scripts/discover-carrier.ts --name "Werner" --url https://werner.com --careers https://werner.com/drivers
//   npx tsx scripts/discover-carrier.ts --name "..." --url "..." --json
//
// No DB writes. This is the "what would happen" preview. Once we're
// confident in the output, the Phase 2 ingest script promotes
// approved carriers + jobs into the real tables.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { discoverCarrierJobs } from "../src/lib/carrier-discovery/discover";
// persist is lazy-imported after env is loaded — it transitively
// imports @/db/client which throws if DATABASE_URL is missing at
// module-load time.

interface Args {
  name: string;
  url: string;
  careers?: string;
  json: boolean;
  commit: boolean;
}

function parseArgs(argv: string[]): Args | null {
  const out: Partial<Args> = { json: false, commit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--careers") out.careers = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--commit") out.commit = true;
    else if (a === "--help" || a === "-h") return null;
  }
  if (!out.name || !out.url) return null;
  return out as Args;
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/discover-carrier.ts --name <carrier> --url <homepage> [--careers <url>] [--json] [--commit]

Flags:
  --name      Carrier display name (required). Used for the Adzuna fallback.
  --url       Carrier homepage URL (required). We'll look for the careers page from here.
  --careers   Skip the careers-page finder and use this URL directly.
  --json      Print full JSON output instead of a human-readable summary.
  --commit    Persist the result to pending_carriers + pending_carrier_jobs for
              admin review. Without this flag, the script is a dry-run preview.

Examples:
  # Dry-run preview
  npx tsx scripts/discover-carrier.ts --name "Heartland Express" --url https://heartlandexpress.com

  # Stage for admin review
  npx tsx scripts/discover-carrier.ts --name "Heartland Express" --url https://heartlandexpress.com --commit
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    printHelp();
    process.exit(args === null ? 0 : 1);
  }

  const report = await discoverCarrierJobs({
    name: args.name,
    homepageUrl: args.url,
    careersUrl: args.careers,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nDiscovery report for ${args.name}`);
  console.log(`Source: ${args.url}\n`);

  console.log("Attempts:");
  for (const a of report.attempts) {
    const marker = a.ok ? "✓" : "·";
    console.log(`  ${marker} [${a.source}] ${a.note}`);
  }

  console.log(`\nFound ${report.jobs.length} job(s):`);
  for (const j of report.jobs) {
    const loc = [j.city, j.state].filter(Boolean).join(", ") || "?";
    const pay =
      j.payMinWeeklyUsd && j.payMaxWeeklyUsd
        ? `$${j.payMinWeeklyUsd}–$${j.payMaxWeeklyUsd}/wk`
        : j.payMaxWeeklyUsd
          ? `up to $${j.payMaxWeeklyUsd}/wk`
          : "pay not listed";
    const eq = j.equipmentGuess ?? "equipment unknown";
    console.log(
      `  • ${j.title}\n    ${loc} · ${pay} · ${eq}\n    apply: ${j.applyUrl}`,
    );
  }

  if (report.jobs.length === 0) {
    console.log(
      "  (nothing — see the attempts above to understand why)\n",
    );
  }

  if (args.commit) {
    if (report.jobs.length === 0) {
      console.log(
        "\nNot committing — discovery returned zero jobs. Re-run without --commit to refine.",
      );
      return;
    }
    const { commitDiscovery } = await import(
      "../src/lib/carrier-discovery/persist"
    );
    const result = await commitDiscovery({
      name: args.name,
      homepageUrl: args.url,
      careersUrl: args.careers,
      report,
    });
    console.log(
      `\nStaged ${result.jobsInserted} job(s) under pending_carrier ${result.pendingCarrierId}` +
        (result.isReDiscovery
          ? " (re-discovery: replaced previous jobs)"
          : " (new pending carrier row)") +
        "\nVisit /admin to review and approve.",
    );
  }
}

main().catch((err) => {
  console.error("[discover-carrier] failed:", err);
  process.exit(1);
});
